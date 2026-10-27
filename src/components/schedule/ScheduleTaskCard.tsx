/**
 * components/schedule/ScheduleTaskCard.tsx — 任务看板卡片 (契约 §6.2) + 卡片内任务树 (契约 §6.3) · PC 端 B5
 *
 * 抄自 web `gacode-web/src/components/schedule/ScheduleTaskCard.tsx` (631 行), 只换 PC 写法:
 *   - `cn(...)`      → 数组 filter(Boolean).join(" ")
 *   - `lucide-react` → PC 图标唯一出处是 `components/ui/Glyphs.tsx`
 *     (`ChevronRight` → `ChevronRightIcon`)
 *
 * 视觉基线 = docs/prototype/schedule-center.html (mockup v6 定稿) 的
 * taskCard() / treeNodeHtml(), 数值按 `prototype-v6-spec.md`:
 *   - 卡片: 底 #141414 (token --card) / hover #1e1e1e + translateY(-1px) /
 *     圆角 20px / 内边距 11px / 阴影 --shadow-card / **无边框**
 *   - 标题: 16px / **700** / lh 22px / letter-spacing -.01em / 两行截断
 *   - meta 行: 12px --fg-muted, gap 6px, wrap
 *   - 责任人行: 距 meta 行 8px, 头像 24px + 名字 12px --fg-subtle
 *   - 备注: 12px --fg-subtle, 距上 6px, 一行截断
 *   - 字号层级 (逐级变轻变淡): 任务 16/700 › 子任务 13.5/500 ›
 *     关键节点 12.5/500 --fg-muted › 日程 12/400 --fg-subtle
 *   - 树节点: 子任务 / 关键节点 = 标题独占一行, 日期/责任人/⋮ 压第二行
 *     (三层嵌套时标题才读得出来); **日程叶子 = 一行** ——
 *     左侧「标题 + 时间」, 右侧「责任人头像 + ⋮」(gaga 2026-10-21 生产实测:
 *     ⋮ 原来掉到下一行单独占位, 必须跟标题同一排、永不换行、永不溢出卡片)
 *
 * ⚠️ **契约优先的两处** (与原型不同, 按冻结契约走):
 *   ① 树容器缩进: 契约 §6.3 写死 `ml-4 border-l border-border/40 pl-3`
 *   ② 列头字号: 契约 §6.1 写 `text-sm font-medium` (14px; 原型 13px)。
 *
 * ⚠️ **倒计时时间基准 = now 入参** —— 调用方必须传服务端 serverTime,
 *    不信任设备本地时间 (契约 §6.2 注)。本组件自己**不读本机时钟**。
 *
 * ⚠️ 卡片**不加左侧色条** (契约 §6.1: 「卡片前面不加左侧色条(gaga: 丑);
 *    色条只留给日历 / 周视图的事件块」)。
 *
 * ⚠️ **⋮ 菜单 = B3 的 `ScheduleNodeMenu`** (2026-10-27 PM 返工, 照抄 web):
 *   四个层级 (任务 / 子任务 / 关键节点 / 日程) **全挂同一个** `ScheduleNodeMenu`
 *   —— web 就是这么写的 (web `ScheduleTaskCard.tsx:208 / 348 / 468 / 579`)。
 *   `ScheduleNodeMenu` 的「归档 / 改 DDL / 编辑」三个 prop **可选**:
 *   **没传回调 ⇒ 那一项根本不渲染** (不是灰的、不是哑弹) ⇒ B5 只有 3 项
 *   (标记进行中 · 取消完成·标记完成 · 删除), **零死按钮**;
 *   **B6 起** 页面层传 `onChangeDdl` / `onEdit` ⇒ 自然恢复 web 的 5 项
 *   (标记进行中 · 标记完成 · 改 DDL · 编辑 · 删除);
 *   **「归档」仍不传** (= B7) ⇒ 菜单里**没有**「归档」这一项 (不是灰的、不是哑弹)。
 *   ⇒ 一套菜单实现两批通吃 (组件意识: 禁止重复实现 —— 不另写第二份菜单)。
 */

import { ChevronRightIcon } from "../ui/Glyphs";
import { OwnerAvatar } from "./OwnerAvatar";
import { ScheduleNodeMenu, type ScheduleNodeKind } from "./ScheduleNodeMenu";

/** 转出去给 BoardView 用 (看板页要把 kind 拼进详情路由)。 */
export type { ScheduleNodeKind };
import {
  fmtDateTime,
  fmtDdlShort,
  fmtScheduleWhenShort,
  formatCountdown,
} from "./format";
import type { CountdownTone } from "./format";
import type { ItemStatus, Milestone, ScheduleItem, Subtask, Task } from "../../lib/schedule-api";

/** chip 基础样式 —— 原型 .chip (11px/16px, 全圆角, px-2)。 */
const CHIP = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-4";

/**
 * 写操作意图 —— 组件只报意图, 真正的 mutation 由页面层持有。
 * ⚠️ B5 只接「改状态」和「删除」两项 (归档 = B7); **B6 起补上「改 DDL」和「编辑」**
 *    (两个表单动作)。「归档」仍然**不报** (= B7, PC 还没有归档查看·恢复入口)。
 */
export type NodeAction = "set_status" | "change_ddl" | "edit" | "delete";

export interface NodeActionTarget {
  kind: ScheduleNodeKind;
  id: string;
  title: string;
  /** 该节点**当前**的有效状态 (pending / in_progress / done)。 */
  status: ItemStatus;
  /** set_status 动作要写入的**新**状态 (其余动作为空)。 */
  nextStatus?: ItemStatus;
}

export interface ScheduleTaskCardProps {
  task: Task;
  /** 倒计时时间基准 (服务端 serverTime 解析出来的 Date) */
  now: Date;
  /** 任务级展开判定 (默认收起 —— 契约 §6.3) */
  isTaskOpen: (id: string) => boolean;
  /** 树内层级展开判定 (默认展开 —— 原型: 展开任务即见整棵树) */
  isNodeOpen: (id: string) => boolean;
  /** 展开/收起回调 (level: task = 卡片级开关, node = 树内层级) */
  onToggle: (id: string, level: "task" | "node") => void;
  /** ⋮ 菜单动作回调 (不传 = 不渲染菜单) */
  onNodeAction?: (action: NodeAction, target: NodeActionTarget) => void;
  /**
   * 点标题进详情页 (原型 B1.3 #1「点击行主体 → openDetail」)。
   *   任务 / 子任务 / 关键节点 / 日程 四层树每一层的标题都可点。
   *   ⚠️ PC 本批页面层只弹 toast 占位 (详情页是 B6), **不跳路由**。
   *   不传 = 标题不可点 (保持旧行为)。
   */
  onOpenDetail?: (kind: ScheduleNodeKind, id: string) => void;
}

/** 状态 chip (契约 §6.2 「状态 chip」; 配色跟原型 statusChip 一致)。 */
function StatusChip({ status }: { status: Task["status"] }) {
  if (status === "done") {
    return <span className={[CHIP, "bg-success/[0.16] text-success"].join(" ")}>已完成</span>;
  }
  if (status === "in_progress") {
    return <span className={[CHIP, "bg-brand/[0.15] text-brand"].join(" ")}>进行中</span>;
  }
  return <span className={[CHIP, "bg-bg-elevated text-fg-muted"].join(" ")}>未开始</span>;
}

/** 倒计时 chip 的语气 (契约 §6.2「样式」列: muted / warning / danger)。 */
const COUNTDOWN_TONE: Record<CountdownTone, string> = {
  muted: "bg-bg-elevated text-fg-muted",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

/**
 * 树节点标题 —— 可点进对应 kind 的详情页 (原型 B1.3 #1「点击行主体 → openDetail」)。
 * 不传 onOpenDetail 时退化成普通 span (旧行为)。
 */
function NodeTitle({
  title,
  kind,
  id,
  onOpenDetail,
  className,
}: {
  title: string;
  kind: ScheduleNodeKind;
  id: string;
  onOpenDetail?: (kind: ScheduleNodeKind, id: string) => void;
  className?: string;
}) {
  if (!onOpenDetail) return <span className={className}>{title}</span>;
  return (
    <button
      type="button"
      data-open-detail={kind}
      onClick={() => onOpenDetail(kind, id)}
      className={[className, "text-left hover:text-brand transition-colors duration-150"]
        .filter(Boolean)
        .join(" ")}
    >
      {title}
    </button>
  );
}

export function ScheduleTaskCard({
  task,
  now,
  isTaskOpen,
  isNodeOpen,
  onToggle,
  onNodeAction,
  onOpenDetail,
}: ScheduleTaskCardProps) {
  // gaga P0-G / 决策 D3: 任务状态由后端按「开始时间 / 截止时间」派生,
  //   通过 effectiveStatus 出参下发 —— 卡片显示**派生值**, 没有就退回自身 status。
  const shownStatus = task.effectiveStatus ?? task.status;
  const isDone = shownStatus === "done";
  // 顶层任务没有父级 → 自身 ddl 就是 effectiveDdl (契约 §2.1.2)
  const ddl = task.ddl ?? null;
  // 已完成的任务不再显示倒计时 (原型 countdownChip: done → 返回「已完成」chip)
  const countdown = isDone ? null : formatCountdown(ddl, now);
  const children = task.children ?? [];
  const open = isTaskOpen(task.id);

  const emit = (action: NodeAction, target: NodeActionTarget) => {
    onNodeAction?.(action, target);
  };

  return (
    <article
      data-board-card={task.id}
      className={[
        // 原型 .tcard: 底 --card / hover --card-hover + translateY(-1px) /
        // 圆角 20px / 内边距 11px / 阴影 --shadow-card / **无边框**
        "bg-card hover:bg-card-hover rounded-lg p-[11px] shadow-card",
        "transition-[background,transform] duration-200 hover:-translate-y-px",
        isDone && "opacity-50",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* ---------------- 标题行 (.hd) ---------------- */}
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          data-toggle-tree={task.id}
          aria-expanded={open}
          aria-label={open ? "收起子任务" : "展开子任务"}
          onClick={() => onToggle(task.id, "task")}
          className="mt-[3px] shrink-0 grid place-items-center text-fg-subtle hover:text-fg transition-transform duration-200"
        >
          <ChevronRightIcon
            size={14}
            className={["w-3.5 h-3.5 transition-transform duration-200", open && "rotate-90"]
              .filter(Boolean)
              .join(" ")}
          />
        </button>
        <h3
          data-board-card-title
          className={[
            // 原型 .tcard .ttl: 16px / 700 / lh 22px / letter-spacing -.01em
            "flex-1 min-w-0 text-[16px] font-bold leading-[22px] tracking-[-0.01em] line-clamp-2 mb-[7px]",
            isDone && "line-through",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {onOpenDetail ? (
            <button
              type="button"
              data-open-detail="task"
              onClick={() => onOpenDetail("task", task.id)}
              className="text-left w-full hover:text-brand transition-colors duration-150"
            >
              {task.title}
            </button>
          ) : (
            task.title
          )}
        </h3>
        {onNodeAction && (
          <ScheduleNodeMenu
            kind="task"
            status={shownStatus}
            className="mt-[3px]"
            ariaLabel={`${task.title} 的更多操作`}
            onSetStatus={(s) =>
              emit("set_status", {
                kind: "task",
                id: task.id,
                title: task.title,
                status: task.status,
                nextStatus: s,
              })
            }
            onChangeDdl={() =>
              emit("change_ddl", {
                kind: "task",
                id: task.id,
                title: task.title,
                status: task.status,
              })
            }
            onEdit={() =>
              emit("edit", { kind: "task", id: task.id, title: task.title, status: task.status })
            }
            onDelete={() =>
              emit("delete", { kind: "task", id: task.id, title: task.title, status: task.status })
            }
          />
        )}
      </div>

      {/* ---------------- meta 行: 类型 chip + 状态 chip + DDL + 倒计时 ---------------- */}
      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-fg-muted">
        <span className={[CHIP, "bg-brand-cyan/[0.13] text-brand-cyan"].join(" ")}>任务</span>
        <StatusChip status={shownStatus} />
        {ddl ? <span className="whitespace-nowrap">{fmtDateTime(ddl)}</span> : null}
        {countdown ? (
          <span data-board-countdown className={[CHIP, COUNTDOWN_TONE[countdown.tone]].join(" ")}>
            {countdown.text}
          </span>
        ) : null}
      </div>

      {/* ---------------- 责任人 (原型的第二行 .meta, 距上面 8px) ---------------- */}
      <div className="mt-2 flex items-center gap-1.5">
        <OwnerAvatar ownerType={task.ownerType} ownerName={task.ownerName} />
        <span className="text-xs text-fg-subtle truncate">{task.ownerName}</span>
      </div>

      {/* ---------------- 描述 ---------------- */}
      {task.desc ? (
        <p className="mt-1.5 text-xs text-fg-subtle line-clamp-1">{task.desc}</p>
      ) : null}

      {/* ---------------- 任务树 (契约 §6.3) ---------------- */}
      {open ? (
        children.length ? (
          <div className="mt-2 ml-4 border-l border-border/40 pl-3 space-y-2.5">
            {children.map((st) => (
              <SubtaskNode
                key={st.id}
                subtask={st}
                inheritedDdl={ddl}
                isNodeOpen={isNodeOpen}
                onToggle={onToggle}
                onNodeAction={onNodeAction}
                onOpenDetail={onOpenDetail}
              />
            ))}
          </div>
        ) : (
          <div className="mt-2 ml-4 border-l border-border/40 pl-3 text-xs text-fg-subtle">
            还没有子任务
          </div>
        )
      ) : null}
    </article>
  );
}

/* ---------------------------------------------------------------------------
   任务树三层: 子任务 › 关键节点 › 日程
   字号逐级变轻变淡 (规格书 A2, 抄原型 .node.lv1/lv2/lv3):
     子任务   13.5px / 500 / --fg          (圆点 4px --fg-muted)
     关键节点 12.5px / 500 / --fg-muted    (圆点 3px --fg-subtle)
     日程     12px   / 400 / --fg-subtle   (圆点 2px --fg-subtle)
   层级用左侧 1px 竖线 + 缩进表示 (契约 §6.3: ml-4 border-l border-border/40 pl-3)
--------------------------------------------------------------------------- */

interface TreeNodeProps {
  isNodeOpen: (id: string) => boolean;
  onToggle: (id: string, level: "task" | "node") => void;
  onNodeAction?: (action: NodeAction, target: NodeActionTarget) => void;
  onOpenDetail?: (kind: ScheduleNodeKind, id: string) => void;
}

function SubtaskNode({
  subtask,
  inheritedDdl,
  isNodeOpen,
  onToggle,
  onNodeAction,
  onOpenDetail,
}: {
  subtask: Subtask;
  inheritedDdl: string | null;
} & TreeNodeProps) {
  // effectiveDdl = 自身 ddl ?? 父链最近的 ddl (契约 §2.1.2)
  const effDdl = subtask.ddl ?? inheritedDdl;
  const kids = subtask.children ?? [];
  const open = isNodeOpen(subtask.id);

  return (
    <div data-tree-node={subtask.id} data-tree-level="subtask">
      <div className="flex items-center gap-1.5 min-w-0">
        {kids.length ? (
          <button
            type="button"
            data-toggle-tree={subtask.id}
            aria-expanded={open}
            aria-label={open ? "收起" : "展开"}
            onClick={() => onToggle(subtask.id, "node")}
            className="shrink-0 grid place-items-center text-fg-subtle hover:text-fg transition-transform duration-200"
          >
            <ChevronRightIcon
              size={12}
              className={["w-3 h-3 transition-transform duration-200", open && "rotate-90"]
                .filter(Boolean)
                .join(" ")}
            />
          </button>
        ) : (
          <span className="w-1 h-1 rounded-full bg-fg-muted shrink-0" />
        )}
        <NodeTitle
          title={subtask.title}
          kind="subtask"
          id={subtask.id}
          onOpenDetail={onOpenDetail}
          className="text-[13.5px] leading-[20px] font-medium text-fg truncate"
        />
      </div>
      <div className="mt-0.5 flex items-center gap-2 pl-4">
        <span className="text-[11px] leading-[15px] text-fg-subtle whitespace-nowrap">
          {fmtDdlShort(effDdl)}
        </span>
        <OwnerAvatar
          ownerType={subtask.ownerType}
          ownerName={subtask.ownerName}
          className="w-[18px] h-[18px] ml-auto"
        />
        {onNodeAction && (
          <ScheduleNodeMenu
            kind="subtask"
            status={subtask.status}
            className="w-6 h-6"
            ariaLabel={`${subtask.title} 的更多操作`}
            onSetStatus={(s) =>
              onNodeAction("set_status", {
                kind: "subtask",
                id: subtask.id,
                title: subtask.title,
                status: subtask.status,
                nextStatus: s,
              })
            }
            onChangeDdl={() =>
              onNodeAction("change_ddl", {
                kind: "subtask",
                id: subtask.id,
                title: subtask.title,
                status: subtask.status,
              })
            }
            onEdit={() =>
              onNodeAction("edit", {
                kind: "subtask",
                id: subtask.id,
                title: subtask.title,
                status: subtask.status,
              })
            }
            onDelete={() =>
              onNodeAction("delete", {
                kind: "subtask",
                id: subtask.id,
                title: subtask.title,
                status: subtask.status,
              })
            }
          />
        )}
      </div>
      {open && kids.length ? (
        <div className="mt-1.5 ml-4 border-l border-border/40 pl-3 space-y-2.5">
          {kids.map((ms) => (
            <MilestoneNode
              key={ms.id}
              milestone={ms}
              inheritedDdl={effDdl}
              isNodeOpen={isNodeOpen}
              onToggle={onToggle}
              onNodeAction={onNodeAction}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MilestoneNode({
  milestone,
  inheritedDdl,
  isNodeOpen,
  onToggle,
  onNodeAction,
  onOpenDetail,
}: {
  milestone: Milestone;
  inheritedDdl: string | null;
} & TreeNodeProps) {
  const effDdl = milestone.ddl ?? inheritedDdl;
  const kids = milestone.children ?? [];
  const open = isNodeOpen(milestone.id);
  const status = milestone.effectiveStatus ?? "pending";

  return (
    <div data-tree-node={milestone.id} data-tree-level="milestone">
      <div className="flex items-center gap-1.5 min-w-0">
        {kids.length ? (
          <button
            type="button"
            data-toggle-tree={milestone.id}
            aria-expanded={open}
            aria-label={open ? "收起" : "展开"}
            onClick={() => onToggle(milestone.id, "node")}
            className="shrink-0 grid place-items-center text-fg-subtle hover:text-fg transition-transform duration-200"
          >
            <ChevronRightIcon
              size={12}
              className={["w-3 h-3 transition-transform duration-200", open && "rotate-90"]
                .filter(Boolean)
                .join(" ")}
            />
          </button>
        ) : (
          <span className="w-[3px] h-[3px] rounded-full bg-fg-subtle shrink-0" />
        )}
        <NodeTitle
          title={milestone.title}
          kind="milestone"
          id={milestone.id}
          onOpenDetail={onOpenDetail}
          className="text-[12.5px] leading-[19px] font-medium text-fg-muted truncate"
        />
      </div>
      <div className="mt-0.5 flex items-center gap-2 pl-4">
        <span className="text-[11px] leading-[15px] text-fg-subtle whitespace-nowrap">
          {fmtDdlShort(effDdl)}
        </span>
        <OwnerAvatar
          ownerType={milestone.ownerType}
          ownerName={milestone.ownerName}
          className="w-[18px] h-[18px] ml-auto"
        />
        {onNodeAction && (
          <ScheduleNodeMenu
            kind="milestone"
            status={status}
            className="w-6 h-6"
            ariaLabel={`${milestone.title} 的更多操作`}
            onSetStatus={(s) =>
              onNodeAction("set_status", {
                kind: "milestone",
                id: milestone.id,
                title: milestone.title,
                status,
                nextStatus: s,
              })
            }
            onChangeDdl={() =>
              onNodeAction("change_ddl", {
                kind: "milestone",
                id: milestone.id,
                title: milestone.title,
                status,
              })
            }
            onEdit={() =>
              onNodeAction("edit", {
                kind: "milestone",
                id: milestone.id,
                title: milestone.title,
                status,
              })
            }
            onDelete={() =>
              onNodeAction("delete", {
                kind: "milestone",
                id: milestone.id,
                title: milestone.title,
                status,
              })
            }
          />
        )}
      </div>
      {open && kids.length ? (
        <div className="mt-1.5 ml-4 border-l border-border/40 pl-3 space-y-2">
          {kids.map((sc) => (
            <ScheduleLeaf
              key={sc.id}
              schedule={sc}
              onNodeAction={onNodeAction}
              onOpenDetail={onOpenDetail}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * 日程叶子 —— 没有再下一层 (契约 §9.5: Schedule 是叶子实体)。
 *
 * ⚠️ gaga 2026-10-21 生产实测: ⋮ 菜单**掉到下一行**单独占位。
 *   旧结构: 标题一行 / 时间+头像一行 / ⋮ **又一行** —— 视觉上跟标题脱节。
 *   现在: **一行** —— 左侧「标题 + 时间」, 右侧「责任人头像 + ⋮」。
 *     - 行容器 flex-nowrap + min-w-0 → 永不换行;
 *     - 标题 flex-1 min-w-0 truncate → 宽度不够时**先压缩标题**(省略号), 不挤 ⋮;
 *     - 时间 / 头像 / ⋮ 全部 shrink-0 → 永远保持一排, ⋮ 永远右对齐、绝不溢出卡片。
 */
function ScheduleLeaf({
  schedule,
  onNodeAction,
  onOpenDetail,
}: {
  schedule: ScheduleItem;
  onNodeAction?: (action: NodeAction, target: NodeActionTarget) => void;
  onOpenDetail?: (kind: ScheduleNodeKind, id: string) => void;
}) {
  const status = schedule.effectiveStatus ?? "pending";
  return (
    <div data-tree-node={schedule.id} data-tree-level="schedule">
      <div
        data-tree-row="schedule"
        className="flex items-center gap-1.5 min-w-0 flex-nowrap"
      >
        <span className="w-[2px] h-[2px] rounded-full bg-fg-subtle shrink-0" />
        <NodeTitle
          title={schedule.title}
          kind="schedule"
          id={schedule.id}
          onOpenDetail={onOpenDetail}
          className="text-[12px] leading-[18px] font-normal text-fg-subtle truncate flex-1 min-w-0"
        />
        <span
          data-tree-when
          className="text-[11px] leading-[15px] text-fg-subtle whitespace-nowrap shrink-0"
        >
          {fmtScheduleWhenShort(schedule.date, schedule.startAt, schedule.endAt)}
        </span>
        <OwnerAvatar
          ownerType={schedule.ownerType}
          ownerName={schedule.ownerName}
          className="w-[18px] h-[18px] shrink-0"
        />
        {onNodeAction && (
          <div className="shrink-0 flex items-center" data-tree-menu>
            <ScheduleNodeMenu
              kind="schedule"
              status={status}
              className="w-6 h-6 shrink-0"
              ariaLabel={`${schedule.title} 的更多操作`}
              onSetStatus={(s) =>
                onNodeAction("set_status", {
                  kind: "schedule",
                  id: schedule.id,
                  title: schedule.title,
                  status,
                  nextStatus: s,
                })
              }
              onChangeDdl={() =>
                onNodeAction("change_ddl", {
                  kind: "schedule",
                  id: schedule.id,
                  title: schedule.title,
                  status,
                })
              }
              onEdit={() =>
                onNodeAction("edit", {
                  kind: "schedule",
                  id: schedule.id,
                  title: schedule.title,
                  status,
                })
              }
              onDelete={() =>
                onNodeAction("delete", {
                  kind: "schedule",
                  id: schedule.id,
                  title: schedule.title,
                  status,
                })
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
