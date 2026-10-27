/**
 * components/schedule/BoardView.tsx — 任务看板主体 (契约 §6.1) · PC 端 B5
 *
 * 抄自 web `gacode-web/src/components/schedule/BoardView.tsx` (335 行), 只换 PC 写法:
 *   - `cn(...)`      → 数组 filter(Boolean).join(" ")
 *   - `lucide-react` → PC 图标唯一出处是 `components/ui/Glyphs.tsx` (`Info` → `InfoIcon`)
 *
 *   Row 1 (sticky): 左侧状态筛选 pill (5 个)
 *   Row 2: 4 列横向滚动看板 (pending / in_progress / done / overdue)
 *
 * ⚠️ 列头文案 / 配色逐条照契约 §6.1:
 *   未开始 → text-fg-muted · 进行中 → text-brand · 已完成 → text-success · 已逾期 → text-danger
 *   列底 bg-card/50 rounded-2xl p-3 min-h-[300px]
 *
 * ⚠️ **倒计时时间基准 = serverTime** (响应级字段, 契约 §6.2 注 / §9.5 末尾):
 *   本组件**不读本机时钟** —— serverTime 缺失时才降级用本机时间, 且降级路径
 *   在 data-now-source 上留痕 (断言脚本据此判定是不是用了 serverTime)。
 *
 * ⚠️ 手机端横向滚动位置不能在 re-render 后丢失 (契约 §6.1 v5):
 *   容器记 scrollLeft, 数据变化后恢复。
 *
 * ⚠️ **B6 起恢复的入口** (PM 拍板 —— B5 刻意不渲染, 表单落地后补回来):
 *   - **FAB「新建任务」** —— 右下角悬浮按钮, 跟知识库 / 今日待办同款
 *     (契约 G4: 看板有新建任务入口)。**只在页面层传了 `onNewTask` 时才渲染**
 *     ⇒ 没有真落点时**不留死按钮** (PC 一贯口径)。
 *   - **卡片「编辑」/「改 DDL」** —— 走 `ScheduleTaskCard` 的 `onNodeAction`
 *     通道 (action = "edit" / "change_ddl"), 页面层持有真正的 mutation。
 *   - **「已归档」按钮 + 计数条** —— B7 起渲染 (跟今日待办页开**同一个** ArchivedSheet)。
 *   - 详情页跳转 B6 起跳真路由 (`/schedule/<kind>/<id>`), 不再是 toast 占位。
 *
 * 视觉基线 = docs/prototype/schedule-center.html (mockup v6 定稿):
 *   桌面 4 列 1fr 满屏; 手机 4 列 100vw 横滑 + scroll-snap。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InfoIcon } from "../ui/Glyphs";
import { CreateFab } from "../common/CreateFab";
import {
  ScheduleTaskCard,
  type NodeAction,
  type NodeActionTarget,
  type ScheduleNodeKind,
} from "./ScheduleTaskCard";
import type { BoardColumns, Task } from "../../lib/schedule-api";

/** 看板列定义 (契约 §6.1) —— 顺序 = 原型 BOARD_COLS 顺序。 */
export const BOARD_COLUMNS = [
  { key: "pending", label: "未开始", tone: "text-fg-muted", dot: "bg-fg-subtle" },
  { key: "in_progress", label: "进行中", tone: "text-brand", dot: "bg-brand" },
  { key: "done", label: "已完成", tone: "text-success", dot: "bg-success" },
  { key: "overdue", label: "已逾期", tone: "text-danger", dot: "bg-danger" },
] as const;

export type BoardColumnKey = (typeof BOARD_COLUMNS)[number]["key"];

/**
 * 筛选 pill (契约 §6.1 Row 1) —— 「全部」+ 4 个状态。
 * ⚠️ 文案与顺序照 web (安卓 `ScheduleBoardViewModel.kt:31-37` 一致), 一个字不许改。
 */
export const BOARD_FILTERS = [
  { key: "all", label: "全部" },
  { key: "pending", label: "未开始" },
  { key: "in_progress", label: "进行中" },
  { key: "done", label: "已完成" },
  { key: "overdue", label: "已逾期" },
] as const;

export type BoardFilter = (typeof BOARD_FILTERS)[number]["key"];

/**
 * 树展开状态持久化 key (契约 §6.3: 展开状态存 localStorage, 按 taskId / subtaskId / milestoneId)。
 *
 *   ⚠️ **键名与 web 完全一致** (`gacode.schedule.board.tree.v1`) —— PC 与 web 各自
 *     存在自己的 localStorage (Electron file:// 域 vs 浏览器域), 不会互相污染;
 *     键名一致是为了两端口径可比 (PM 拍板 Q3 = 做)。
 *
 *   两组 id, 一条语义:
 *     open   —— **显式展开**的节点
 *     closed —— **显式收起**的节点
 *   渲染规则:
 *     任务级 (卡片)  = open.has(id)              → 默认收起 (原型一致: 卡片默认不展开树)
 *     树内层级        = !closed.has(id) || open.has(id) → 默认展开 (原型一致: 展开任务即见整棵树)
 *   这样既满足「按 id 存展开状态」, 又不把「展开一个任务」变成「要点三次才看得到孙节点」。
 */
export const BOARD_TREE_KEY = "gacode.schedule.board.tree.v1";

export interface BoardTreeState {
  open: string[];
  closed: string[];
}

const EMPTY_TREE_STATE: BoardTreeState = { open: [], closed: [] };

function readTreeState(): BoardTreeState {
  if (typeof window === "undefined") return EMPTY_TREE_STATE;
  try {
    const raw = window.localStorage.getItem(BOARD_TREE_KEY);
    if (!raw) return EMPTY_TREE_STATE;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return EMPTY_TREE_STATE;
    const p = parsed as Partial<BoardTreeState>;
    const ids = (v: unknown) =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    return { open: ids(p.open), closed: ids(p.closed) };
  } catch {
    return EMPTY_TREE_STATE;
  }
}

function writeTreeState(state: BoardTreeState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BOARD_TREE_KEY, JSON.stringify(state));
  } catch {
    /* 隐私模式 / 配额满 → 展开状态不持久化, 不影响使用 */
  }
}

export interface BoardViewProps {
  /** 4 列数据 (GET /api/v1/schedules/board) */
  columns: BoardColumns;
  /** 响应级 serverTime (ISO) —— 倒计时的时间基准; null = 后端没给 (降级用本机时间) */
  serverTime: string | null;
  /**
   * 已归档条目的计数 —— **四类总数** (任务 / 子任务 / 关键节点 / 日程),
   * 跟归档 sheet 里列的内容一致 (2026-10-21 PM 拍板)。
   * null / undefined = 计数拉不到 → 不显示徽标。
   */
  archivedCount?: number | null;
  /**
   * 初始树状态 (可选) —— 不传就从 localStorage 读 (契约 §6.3)。
   */
  initialTreeState?: BoardTreeState;
  /**
   * 新建任务入口 (打开「新建任务」表单) —— **不传 = 不渲染 FAB**
   * (不留死按钮; PC 一贯口径)。
   */
  onNewTask?: () => void;
  /**
   * 已归档入口 —— 打开归档 sheet (原型 .archived-sheet)。
   * **不传 = 提示条右侧不渲染「已归档」按钮** (零死按钮口径)。
   */
  onOpenArchived?: () => void;
  /** ⋮ 菜单动作 (写操作意图) —— 页面层持有真正的 mutation。
   *  ⚠️ B6 起 channel 里多了两个 action: `change_ddl` / `edit` (两个表单动作);
   *  ⚠️ B7 起再多个 `archive` (走归档端点, 可恢复)。 */
  onNodeAction?: (action: NodeAction, target: NodeActionTarget) => void;
  /** 点标题进详情页 —— 页面层负责拼路由 (B6 起跳真路由 `/schedule/<kind>/<id>`) */
  onOpenDetail?: (kind: ScheduleNodeKind, id: string) => void;
}

export function BoardView({
  columns,
  serverTime,
  archivedCount = null,
  initialTreeState,
  onNewTask,
  onOpenArchived,
  onNodeAction,
  onOpenDetail,
}: BoardViewProps) {
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [treeState, setTreeState] = useState<BoardTreeState>(
    () => initialTreeState ?? readTreeState(),
  );

  const openIds = useMemo(() => new Set(treeState.open), [treeState.open]);
  const closedIds = useMemo(() => new Set(treeState.closed), [treeState.closed]);

  /** 任务级: 显式展开才显示树 (默认收起, 原型一致)。 */
  const isTaskOpen = useCallback((id: string) => openIds.has(id), [openIds]);
  /** 树内层级: 默认展开, 显式收起才隐藏 (原型一致)。 */
  const isNodeOpen = useCallback(
    (id: string) => !closedIds.has(id) || openIds.has(id),
    [closedIds, openIds],
  );

  const toggle = useCallback((id: string, level: "task" | "node") => {
    setTreeState((prev) => {
      const next: BoardTreeState =
        level === "task"
          ? {
              open: prev.open.includes(id) ? prev.open.filter((x) => x !== id) : [...prev.open, id],
              closed: prev.closed,
            }
          : {
              open: prev.open,
              closed: prev.closed.includes(id)
                ? prev.closed.filter((x) => x !== id)
                : [...prev.closed, id],
            };
      writeTreeState(next);
      return next;
    });
  }, []);

  /**
   * 倒计时时间基准 —— **服务端 serverTime 优先** (契约 §6.2 注)。
   * 后端没给才降级用本机时间, 并在 data-now-source 上留痕。
   */
  const now = useMemo(() => {
    if (serverTime) {
      const d = new Date(serverTime);
      if (!Number.isNaN(d.getTime())) return { date: d, source: "server" as const };
    }
    return { date: new Date(), source: "local" as const };
  }, [serverTime]);

  // 手机端横向滚动位置: re-render 后恢复 (契约 §6.1 v5)
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const savedScrollLeft = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = savedScrollLeft.current;
    if (!target) return;
    el.scrollLeft = target;
    const raf = requestAnimationFrame(() => {
      if (el.isConnected) el.scrollLeft = target;
    });
    return () => cancelAnimationFrame(raf);
  }, [columns]);

  const visible = BOARD_COLUMNS.filter((c) => filter === "all" || c.key === filter);
  const single = filter !== "all";

  const columnClass = single
    ? "grid-cols-[100vw] min-[641px]:grid-cols-1 min-[821px]:grid-cols-1"
    : "grid-cols-[repeat(4,100vw)] min-[641px]:grid-cols-[repeat(4,minmax(250px,1fr))] min-[821px]:grid-cols-4";

  return (
    <div className="min-h-full">
      {/* ---------------- Row 1 (sticky): 筛选 pill ---------------- */}
      {/* ⚠️ top-[57px] = ScheduleTabs 的实测高度 (pt-2 8 + tab 36 + pb-3 12 + border-b 1)。
          bg-bg-base 不透明 —— 原来的 `bg-bg-base/92` 不是合法 Tailwind class (92 不在
          默认 opacity 刻度里), 编译后没有这条规则, 背景实测全透明。 */}
      <div
        data-board-toolbar
        className="sticky top-[57px] z-10 bg-bg-base px-4 lg:px-6 py-2 flex items-center gap-2"
      >
        <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
          {BOARD_FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                data-board-filter={f.key}
                aria-pressed={active}
                onClick={() => setFilter(f.key)}
                className={[
                  "shrink-0 rounded-full px-3 py-1 text-[13px] transition-colors duration-150",
                  active ? "bg-bg-elevated text-fg" : "text-fg-muted hover:text-fg",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---------------- 提示条 (原型 .archbar) ----------------
          ⚠️ web 在这一条右侧还有「已归档」按钮 + 计数徽标 —— B7 起渲染
          (打开的是**同一个** ArchivedSheet); 按钮**按回调存在与否**渲染
          (不传 onOpenArchived ⇒ 不渲染, 不留死按钮)。 */}
      <div className="px-4 lg:px-6">
        <div className="flex items-center gap-2 bg-card rounded-full py-[7px] pl-3.5 pr-2 mt-1 mb-3 text-[13px]">
          <InfoIcon size={15} className="w-[15px] h-[15px] text-fg-muted shrink-0" />
          <span className="text-fg-muted truncate">
            → 看板看任务 · 日程中心看日程 · 今日待办看今天的日程
          </span>
          <span className="flex-1" />
          {onOpenArchived && (
            <button
              type="button"
              data-board-archived
              onClick={onOpenArchived}
              className="shrink-0 inline-flex items-center gap-1.5 px-[13px] py-1.5 rounded-full text-[13px] text-fg-muted hover:text-fg hover:bg-bg-elevated transition-colors duration-150"
            >
              已归档
              {archivedCount != null && (
                <span className="text-[11px] bg-danger-soft text-danger rounded-full px-2 py-0.5">
                  {archivedCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ---------------- Row 2: 4 列看板 ---------------- */}
      <div
        ref={scrollRef}
        data-board-scroll
        data-now-source={now.source}
        onScroll={(e) => {
          savedScrollLeft.current = e.currentTarget.scrollLeft;
        }}
        className="overflow-x-auto snap-x snap-mandatory min-[641px]:snap-proximity min-[821px]:overflow-visible px-0 min-[641px]:px-4 lg:px-6"
      >
        <div className={["grid gap-0 min-[641px]:gap-3", columnClass].filter(Boolean).join(" ")}>
          {visible.map((col) => {
            const items: Task[] = columns[col.key] ?? [];
            return (
              <section
                key={col.key}
                data-board-col={col.key}
                className="snap-start snap-always min-w-0 px-4 min-[641px]:px-0"
              >
                <header className="flex items-center gap-2 mb-2 px-0.5">
                  <span className={["w-[7px] h-[7px] rounded-full shrink-0", col.dot].join(" ")} />
                  <span
                    data-board-col-title
                    className={["text-sm font-medium", col.tone].join(" ")}
                  >
                    {col.label}
                  </span>
                  <span className="text-[11px] bg-bg-elevated text-fg-muted rounded-full px-[7px] py-px">
                    {items.length}
                  </span>
                </header>
                <div className="bg-card/50 rounded-2xl p-3 min-h-[300px] space-y-2">
                  {items.length === 0 ? (
                    <div className="text-xs text-fg-subtle text-center py-6">暂无任务</div>
                  ) : (
                    items.map((task) => (
                      <ScheduleTaskCard
                        key={task.id}
                        task={task}
                        now={now.date}
                        isTaskOpen={isTaskOpen}
                        isNodeOpen={isNodeOpen}
                        onToggle={toggle}
                        onNodeAction={onNodeAction}
                        onOpenDetail={onOpenDetail}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* ---------------- 新建任务入口 ----------------
          原型 v6 的看板视图里, 「新建」是**右下角悬浮 FAB** (schedule-center.html
          `.fab` + `#fab`), 三个视图共用同一个 FAB, 按所在页面分流建什么
          (今日待办→待办 / 日程中心→日程 / 看板→任务)。

          契约 §6.1 写的是「Row 1 (sticky): 左侧状态筛选 pill + 右侧 [+ 新建任务]」——
          web 与本实现都按原型 + gaga 反馈把新建入口做成 FAB (三处「新建」完全同款),
          Row 1 只保留 5 个筛选 pill。
          data-board-new-task 标记保留 (断言脚本按它定位新建入口)。

          ⚠️ **不传 `onNewTask` 就不渲染** ⇒ 没有真落点时不留死按钮 (PC 一贯口径)。 */}
      {onNewTask && <CreateFab label="新建任务" onClick={onNewTask} data-board-new-task="" />}
    </div>
  );
}
