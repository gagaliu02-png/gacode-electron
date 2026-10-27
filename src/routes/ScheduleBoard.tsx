/**
 * routes/ScheduleBoard.tsx — 日程中心 · 任务看板 · PC 端 B5
 *
 * 抄自 web `gacode-web/src/app/(main)/schedule/board/page.tsx` (~490 行), 只换 PC 写法:
 *   - `next/navigation` 的 `useRouter` → PC 本批**不跳路由** (见下), 只弹 toast 占位
 *   - `useToast` from `@/components/common/Toast` → `../components/ui/Toast`
 *     (PC toast API: `toast({ title?, message?, description?, variant? })`)
 *   - `useUIStore((s) => s.setHeaderTitle("日程中心"))` → PC 没有 store
 *     ⇒ **不设标题**, 顶栏走 `AppShell.tsx` 的 `resolveTitle()`
 *       (已用 `pathname.startsWith("/schedule")` 覆盖 `/schedule/board`)
 *   - web 的 `CreateFab` + `ScheduleFormSheet` + `ArchivedSheet` → **整块不搬**
 *
 * 信息架构 (总 PM 定):
 *   /schedule           = 今日待办  (B3 已完成)
 *   /schedule/calendar  = 日程中心  (B4 已完成)
 *   /schedule/board     = 任务看板  ← 本页 (B5)
 *
 * 数据源 = GET /api/v1/schedules/board (契约 §9.1): 4 列 {pending,in_progress,done,overdue},
 * 每个 Task 带 children[] 递归到叶子; **overdue 列由后端算** (契约 §2.1.3 决策 48/49),
 * 端侧不再自己判逾期。
 *
 * ⚠️ **倒计时时间基准 = 响应里的 serverTime** (信封顶层, 契约 §9.5 末尾) ——
 *    不信任设备本地时间 (契约 §6.2 注)。`getBoard()` 已经把 serverTime 带回来了
 *    (`schedule-api.ts:1419-1433`), 直接往下传给 BoardView 即可。
 *
 * 写操作 (原型 §9 ⋮ 菜单, 规格书 B3.5 #4-#8) —— 本批只接真端点的这几项:
 *   标记进行中 / 标记完成 · 取消完成 · 删除 (契约 §9.2);
 *   删除走**二次确认** (B3 的 `ScheduleConfirmDialog`)。
 *
 * ⚠️ **本批明确不做** (PM 拍板, 剩下的都是 B6 / B7 的活):
 *   - **FAB「新建任务」不渲染** + `ScheduleFormSheet` 不引入 —— 表单是 B6。
 *     ⇒ 页面上没有任何「新建」入口, 不会留死按钮。
 *   - **卡片「编辑」/「改 DDL」菜单项不渲染** —— 表单是 B6。
 *   - **卡片「归档」动作不渲染** —— PC 的归档查看/恢复入口是 B7,
 *     现在归档完就找不回 ⇒ 归档动作等归档区落地时一起补。
 *   - **已归档计数条 / `ArchivedSheet` 不渲染** —— B7。
 *   - **详情页跳转不实现**: `onOpenDetail` 传一个 **toast 占位**
 *     (「详情页将在后续批次开放」), **不 navigate** ——
 *     PC 现在没有 `/schedule/schedule/:id` 这类路由, 跳过去会被 `App.tsx` 的
 *     `path="*"` 兜回首页 (静默跳走), 用户以为没生效。
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScheduleTabs } from "../components/schedule/ScheduleTabs";
import { BoardView } from "../components/schedule/BoardView";
import type { NodeAction, NodeActionTarget } from "../components/schedule/ScheduleTaskCard";
import { ScheduleConfirmDialog } from "../components/schedule/ScheduleConfirmDialog";
import { useToast } from "../components/ui/Toast";
import {
  buildFlatIndex,
  deleteMilestone,
  deleteSchedule,
  deleteSubtask,
  deleteTask,
  describeScheduleError,
  getBoard,
  nodeKindOf,
  setNodeStatus,
} from "../lib/schedule-api";
import type {
  BoardColumns,
  ItemStatus,
  NodeKind,
  ParentKind,
  ScheduleNode,
  Task,
} from "../lib/schedule-api";

/** 四层节点的中文名 —— 详情页占位提示里用。 */
const KIND_LABEL: Record<NodeKind, string> = {
  task: "任务",
  subtask: "子任务",
  milestone: "关键节点",
  schedule: "日程",
};

/** loading 骨架 — 4 列占位。 */
function BoardSkeleton() {
  return (
    <div className="px-4 lg:px-6 py-6" aria-busy="true" aria-label="加载中">
      <div className="h-4 w-40 rounded bg-bg-elevated animate-pulse" />
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-40 rounded-2xl bg-bg-elevated animate-pulse" />
        ))}
      </div>
      <span className="sr-only">加载中...</span>
    </div>
  );
}

export function ScheduleBoard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  /** 待删除条目 —— 删除是级联硬删, 必须二次确认。 */
  const [pendingDelete, setPendingDelete] = useState<NodeActionTarget | null>(null);

  const { data, isPending, error } = useQuery({
    queryKey: ["schedule", "board"],
    // 看板主数据 = GET /board (契约 §9.1); serverTime 随快照一起回来。
    queryFn: getBoard,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["schedule"] });

  // ---------------------------------------------------------------------------
  // 写操作 (⋮ 菜单) —— 契约 §9.2 (单条 CRUD)
  //
  // ⚠️ 状态字段**四层不同名** (契约 §6.4 / §2.1.3), 已收口到 api 层的
  //   `setNodeStatus` —— 字段名只在 schedule-api.ts 的 `statusWriteBody` 一处存在:
  //     task                 → `statusOverride` (pending = **显式钉 'pending'**, 不写 null)
  //     milestone / schedule → `statusOverride` (pending = null = 回到「继承父链」)
  //     subtask              → `status`           (唯一的手工真值列, 没有 statusOverride)
  // ---------------------------------------------------------------------------
  const statusMutation = useMutation({
    mutationFn: ({
      target,
      status,
    }: {
      target: NodeActionTarget;
      status: ItemStatus;
    }): Promise<unknown> => setNodeStatus(target.id, target.kind, status),
    onSuccess: async (_d, vars) => {
      await refresh();
      toast({
        title:
          vars.status === "done"
            ? "已标记完成"
            : vars.status === "in_progress"
              ? "已标记为进行中"
              : "已取消完成",
        variant: "success",
      });
    },
    onError: (err) => {
      toast({ title: "操作失败", description: describeScheduleError(err), variant: "danger" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (target: NodeActionTarget): Promise<unknown> => {
      switch (target.kind) {
        case "task":
          return deleteTask(target.id);
        case "subtask":
          return deleteSubtask(target.id);
        case "milestone":
          return deleteMilestone(target.id);
        case "schedule":
          return deleteSchedule(target.id);
      }
    },
    onSuccess: async (_d, target) => {
      await refresh();
      toast({
        title: `已删除「${target.title}」`,
        description: "不可撤销。",
        variant: "success",
      });
    },
    onError: (err) => {
      toast({ title: "删除失败", description: describeScheduleError(err), variant: "danger" });
    },
  });

  const handleNodeAction = (action: NodeAction, target: NodeActionTarget) => {
    switch (action) {
      case "set_status":
        statusMutation.mutate({
          target,
          status: target.nextStatus ?? target.status,
        });
        break;
      case "delete":
        // 级联硬删 + 不可恢复 → 二次确认 (与今日待办同一交互语言)
        setPendingDelete(target);
        break;
    }
  };

  /**
   * 详情页 (B6 才落地) —— 本批只弹 toast 占位, **不 navigate**。
   */
  const handleOpenDetail = (kind: NodeKind) => {
    toast({
      title: "详情页将在后续批次开放",
      description: `${KIND_LABEL[kind]}的详情页还没上线 (B6), 先在看板上看结构。`,
      variant: "default",
    });
  };

  return (
    <div className="min-h-full">
      <ScheduleTabs active="board" />

      {isPending && <BoardSkeleton />}

      {error && (
        <div className="px-4 lg:px-6 py-6">
          <div className="rounded-xl border border-danger/40 bg-danger-soft/20 px-4 py-3 text-sm text-danger">
            看板加载失败:{describeScheduleError(error)}
          </div>
        </div>
      )}

      {data && (
        <BoardView
          columns={data.columns}
          serverTime={data.serverTime}
          onNodeAction={handleNodeAction}
          onOpenDetail={handleOpenDetail}
        />
      )}

      <ScheduleConfirmDialog
        open={!!pendingDelete}
        title={pendingDelete ? `删除「${pendingDelete.title}」?` : ""}
        description="删除后不可恢复。如果它下面还有下级条目, 会一并删除。"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (target) deleteMutation.mutate(target);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 看板树遍历 —— 找节点 (任务 → 子任务 → 关键节点 → 日程)
// ---------------------------------------------------------------------------

/** 看板 4 列的 key —— 遍历时按这个顺序走。 */
const BOARD_COLUMN_KEYS: (keyof BoardColumns)[] = ["pending", "in_progress", "done", "overdue"];

export interface FoundBoardNode {
  /** 命中的节点本体。 */
  node: ScheduleNode;
  /** 节点自身所属层 (task / subtask / milestone / schedule)。 */
  kind: NodeKind;
  /** 直属父节点 (顶层任务 = null)。 */
  parent: ScheduleNode | null;
  /** 直属父节点所属层 (顶层任务 = null)。 */
  parentKind: ParentKind;
  /**
   * 父级的 **effectiveDdl** (ISO) —— 契约 §9.4b 的上限口径。
   *   父级自身 ddl 为空时, 它的截止时间从更上层继承 → 这里必须给继承后的值,
   *   否则「父级 DDL 为空 → 不限」会错判成「不限」而放过越界。
   *   null = 父级整条链都不设截止 → 不限 (`FormBound.ddl = null` 的语义)。
   */
  parentEffectiveDdl: string | null;
}

/**
 * findBoardNode — 在看板 4 列里按 id 找节点, 并带回父节点 + 父级 effectiveDdl。
 *
 * ⚠️ web 的同名函数是**看板页里的私有函数** (`board/page.tsx:497-522`),
 *    不在 `schedule-api.ts` 里 ⇒ 抄不到。PC 侧按 PM 拍板**不抄那段递归**,
 *    改用 api 层现成的图算法 (`buildFlatIndex` → `tree`):
 *
 *   ① 父节点 = `tree.parentOf(node)`
 *      —— api 层的 parentOf 沿父指针**向上迭代** (taskId / subtaskId / milestoneId),
 *         语义与 web 的「逐层链式继承」等价 (`schedule-api.ts:527-535`)。
 *      —— 兜底: 万一 DTO 没带父指针字段, 用 `flat` 里的 parentId 回查
 *         (flat 的 parentId 是**从树结构**推出来的, 比 DTO 字段更可靠)。
 *   ② 父级 effectiveDdl = `tree.effectiveDdl(parent)`
 *      —— 自身 ddl 为空就往上找, 走到底仍无值 = null (不限)。
 *   ③ 父标题 = `parent.title`
 *      —— `FlatScheduleNode` 只有 `{ node, parentId, parentKind }`,
 *         **没有 parent 对象字段** ⇒ 这里自己建一张 `id → node` 映射 (从 flat 建),
 *         按 parentId 查父节点。
 *
 * ⚠️ **本批还没有调用点** —— web 用它是为了给表单算「父级 DDL 上限」(B6 的表单)。
 *    PC 本批不渲染表单 ⇒ 这个函数先落在这里, **B6 直接 import 复用**,
 *    别在表单侧再写一份递归。
 */
export function findBoardNode(columns: BoardColumns, id: string): FoundBoardNode | null {
  // 4 列的任务合成一张表 (同一张卡不会在两列重复 —— 后端已去重)。
  const tasks: Task[] = [];
  const seen = new Set<string>();
  for (const key of BOARD_COLUMN_KEYS) {
    for (const t of columns[key] ?? []) {
      if (!t?.id || seen.has(t.id)) continue;
      seen.add(t.id);
      tasks.push(t);
    }
  }

  const { flat, tree } = buildFlatIndex({ tasks });
  // id → 拍平条目 (带 parentId / parentKind)。
  const byId = new Map(flat.map((f) => [f.node.id, f]));
  const entry = byId.get(id);
  if (!entry) return null;

  const parent =
    tree.parentOf(entry.node) ??
    (entry.parentId ? (byId.get(entry.parentId)?.node ?? null) : null);

  return {
    node: entry.node,
    kind: nodeKindOf(entry.node),
    parent,
    parentKind: entry.parentKind,
    parentEffectiveDdl: parent ? tree.effectiveDdl(parent) : null,
  };
}
