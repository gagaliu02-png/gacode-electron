/**
 * routes/ScheduleBoard.tsx — 日程中心 · 任务看板 · PC 端 B5 + B6
 *
 * 抄自 web `gacode-web/src/app/(main)/schedule/board/page.tsx` (~490 行), 只换 PC 写法:
 *   - `next/navigation` 的 `useRouter` → `react-router-dom` 的 `useNavigate`
 *   - `useToast` from `@/components/common/Toast` → `../components/ui/Toast`
 *   - `useUIStore((s) => s.setHeaderTitle("日程中心"))` → PC 没有 store
 *     ⇒ **不设标题**, 顶栏走 `AppShell.tsx` 的 `resolveTitle()`
 *       (已用 `pathname.startsWith("/schedule")` 覆盖 `/schedule/board`)
 *   - web 的 `CreateFab` + `ScheduleFormSheet` + `ScheduleDdlOverrunDialog`
 *     → B6 起**整块搬过来**
 *
 * 信息架构 (总 PM 定):
 *   /schedule           = 今日待办  (B3 已完成)
 *   /schedule/calendar  = 日程中心  (B4 已完成)
 *   /schedule/board     = 任务看板  ← 本页 (B5 + B6)
 *   /schedule/<kind>/<id> = 详情页   (B6)
 *
 * 数据源 = GET /api/v1/schedules/board (契约 §9.1): 4 列 {pending,in_progress,done,overdue},
 * 每个 Task 带 children[] 递归到叶子; **overdue 列由后端算** (契约 §2.1.3 决策 48/49),
 * 端侧不再自己判逾期。
 *
 * ⚠️ **倒计时时间基准 = 响应里的 serverTime** (信封顶层, 契约 §9.5 末尾) ——
 *    不信任设备本地时间 (契约 §6.2 注)。`getBoard()` 已经把 serverTime 带回来了
 *    (`schedule-api.ts:1419-1433`), 直接往下传给 BoardView 即可。
 *
 * 写操作 (原型 §9 ⋮ 菜单, 规格书 B3.5 #4-#8):
 *   标记进行中 / 标记完成 · 取消完成 · **归档** · **改 DDL** · **编辑** · 删除 ——
 *   全部走真端点 (契约 §9.2 / §9.3); 「改 DDL」/「编辑」由 `ScheduleFormSheet` 承载。
 *   删除走**二次确认** (B3 的 `ScheduleConfirmDialog`)。
 *   归档走**独立的归档端点** (可恢复), **不是** DELETE 硬删。
 *
 * ⚠️ **B7 接上的入口** (PM 拍板):
 *   - 卡片「归档」动作 → `archiveMutation` (按 kind 分派到四个归档端点)
 *   - 提示条右侧「已归档 N」→ 打开 `ArchivedSheet` (跟今日待办页共用同一个组件)
 *   ⚠️ **不新建归档路由页** —— web 没有独立的归档页, 归档是**弹层**。
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScheduleTabs } from "../components/schedule/ScheduleTabs";
import { BoardView } from "../components/schedule/BoardView";
import { ArchivedSheet } from "../components/schedule/ArchivedSheet";
import { archivedTotal, loadArchivedByKind } from "../components/schedule/archived";
import type { NodeAction, NodeActionTarget } from "../components/schedule/ScheduleTaskCard";
import { ScheduleConfirmDialog } from "../components/schedule/ScheduleConfirmDialog";
import { CreateFab } from "../components/common/CreateFab";
import {
  ScheduleFormSheet,
  type FormKind,
  type FormMode,
  type FormValues,
} from "../components/schedule/form/ScheduleFormSheet";
import {
  ddlIso,
  milestoneBody,
  scheduleBody,
  syncReminders,
  taskBody,
} from "../components/schedule/form/scheduleFormBody";
import {
  ScheduleDdlOverrunDialog,
  type DdlOverrunItem,
} from "../components/schedule/form/ScheduleDdlOverrunDialog";
import { useToast } from "../components/ui/Toast";
import {
  archiveMilestone,
  archiveSchedule,
  archiveSubtask,
  archiveTask,
  buildFlatIndex,
  createTask,
  deleteMilestone,
  deleteSchedule,
  deleteSubtask,
  deleteTask,
  describeScheduleError,
  getBoard,
  nodeKindOf,
  scheduleLocalToIso,
  setNodeStatus,
  updateMilestone,
  updateSchedule,
  updateSubtask,
  updateTask,
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  /** 待删除条目 —— 删除是级联硬删, 必须二次确认。 */
  const [pendingDelete, setPendingDelete] = useState<NodeActionTarget | null>(null);
  /** 归档 sheet 开着吗 (原型 B1.3 #15: 「已归档」条 → 打开归档 sheet)。 */
  const [archivedOpen, setArchivedOpen] = useState(false);

  const { data, isPending, error } = useQuery({
    queryKey: ["schedule", "board"],
    // 看板主数据 = GET /board (契约 §9.1); serverTime 随快照一起回来。
    // 已归档计数 = **四类**已归档列表的总数 (契约 §9.1 四个归档端点) ——
    //   归档 sheet 里列的就是这四类, 计数只算一类的话数字跟内容对不上。
    //   拉不到不影响看板本身, 降级成「不显示计数」。
    queryFn: async () => {
      const [board, archived] = await Promise.all([
        getBoard(),
        loadArchivedByKind().catch(() => null),
      ]);
      return { board, archivedCount: archived ? archivedTotal(archived) : null };
    },
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

  // 归档 (契约 §9.3) —— 走**独立的归档端点**, 不是 DELETE 硬删 (可恢复)。
  // 四层各一个端点 ⇒ 按 kind 分派。
  const archiveMutation = useMutation({
    mutationFn: (target: NodeActionTarget): Promise<unknown> => {
      switch (target.kind) {
        case "task":
          return archiveTask(target.id);
        case "subtask":
          return archiveSubtask(target.id);
        case "milestone":
          return archiveMilestone(target.id);
        case "schedule":
          return archiveSchedule(target.id);
      }
    },
    onSuccess: async (_d, target) => {
      await refresh();
      toast({
        title: `已归档「${target.title}」`,
        description: "可在已归档页恢复。",
        variant: "success",
      });
    },
    onError: (err) => {
      toast({ title: "归档失败", description: describeScheduleError(err), variant: "danger" });
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

  // ---------------------------------------------------------------------------
  // 表单 (新建 / 编辑 / 改 DDL) —— B6
  //
  // ⚠️ create 模式下还没有对象 (没 id / 没标题), 所以 target 允许为 null。
  // ---------------------------------------------------------------------------
  const [form, setForm] = useState<{
    mode: FormMode;
    kind: FormKind;
    target: NodeActionTarget | null;
    node: Record<string, any> | null;
    bound: { label: string; title: string; ddl?: string | null } | null;
  } | null>(null);

  // 父级改早 → 下级越界: 挂起本次保存, 弹确认框 (原型 L2842-2853)
  const [overrun, setOverrun] = useState<{
    target: NodeActionTarget;
    values: FormValues;
    items: DdlOverrunItem[];
    nextDdlText: string;
  } | null>(null);

  const boardColumns = data?.board.columns;

  /** 在看板树里找节点 (任务 → 子任务 → 关键节点 → 日程)。 */
  const found = useMemo(() => {
    if (!form || !form.target || !boardColumns) return null;
    return findBoardNode(boardColumns, form.target.id);
  }, [form, boardColumns]);

  const formMutation = useMutation({
    mutationFn: async ({
      target,
      node,
      values,
      mode,
      kind,
    }: {
      target: NodeActionTarget | null;
      node: Record<string, any> | null;
      values: FormValues;
      mode: FormMode;
      kind: FormKind;
    }) => {
      // create —— 看板页的 FAB 建的是**任务** (原型 FAB 分流: 看板 → 任务)。
      // gaga P0-G / 决策 D3: 任务带开始时间, **不发 status** (状态由后端按时间派生)。
      if (mode === "create") {
        if (kind !== "task") return null;
        return createTask({
          title: values.title.trim(),
          ownerType: values.ownerType,
          ddl: ddlIso(values),
          startAt: scheduleLocalToIso(values.date, values.start),
          desc: values.desc.trim() || null,
        });
      }
      if (!target) return null;
      switch (target.kind) {
        case "task":
          await updateTask(target.id, taskBody(values, mode, "task"));
          break;
        case "subtask":
          await updateSubtask(target.id, taskBody(values, mode, "subtask"));
          break;
        case "milestone":
          await updateMilestone(target.id, milestoneBody(values, mode));
          // ⚠️ 关键节点的**提醒是独立端点** —— `PATCH /milestones/:id` 一律不收 reminders
          //    (后端 routes.js:23 明文)。旧实现只 PATCH 本体 → **提醒开关是哑弹**。
          //    只在 EDIT 模式同步 (delay 只改 DDL, 不同步 → 否则凭空造提醒)。
          if (mode === "edit") {
            await syncReminders("milestone", target.id, values, node?.reminders);
          }
          break;
        case "schedule":
          await updateSchedule(target.id, scheduleBody(values, mode));
          if (mode === "edit") {
            await syncReminders("schedule", target.id, values, node?.reminders);
          }
          break;
      }
    },
    onSuccess: async (_d, vars) => {
      await refresh();
      setForm(null);
      setOverrun(null);
      toast({
        title: vars.mode === "create" ? `已创建「${vars.values.title}」` : "已保存",
        description: "看板 / 日程中心 / 今日待办已同步",
        variant: "success",
      });
    },
    onError: (err) => {
      toast({ title: "保存失败", description: describeScheduleError(err), variant: "danger" });
    },
  });

  /** 看板 FAB —— 新建任务 (原型 .fab 在看板页分流成「新建任务」)。 */
  const openCreateForm = () =>
    setForm({ mode: "create", kind: "task", target: null, node: null, bound: null });

  const openForm = (mode: FormMode, target: NodeActionTarget) => {
    if (!boardColumns) return;
    const f = findBoardNode(boardColumns, target.id);
    if (!f) {
      toast({
        title: mode === "edit" ? "编辑暂不可用" : "改 DDL 暂不可用",
        description: "这条目不在当前看板快照里, 刷新后再试。",
        variant: "default",
      });
      return;
    }
    setForm({
      mode,
      kind: target.kind,
      target,
      node: f.node,
      bound: f.parent
        ? {
            label: kindLabelOf(f.parentKind),
            title: String(f.parent.title ?? ""),
            // ⚠️ 必须是父级的 **effectiveDdl** (契约 §9.4b) —— 父级自身 ddl 为空时
            //   它的截止时间是从更上层继承来的, 用父级自身的空值当上限 = 限制失效
            //   (gaga 2026-10-21 生产实测: 子节点能设到父级之后)。
            ddl: f.parentEffectiveDdl,
          }
        : null,
    });
  };

  /** 提交前先查下级越界 (原型 affectedDescendants 口径)。 */
  const submitForm = (values: FormValues) => {
    if (!form) return;
    const { target, node } = form;
    if (form.mode !== "create" && node && target) {
      const nextDdl = values.ddlDate
        ? `${values.ddlDate}T${values.ddlTime || "23:59"}`
        : "";
      const ownDdl = node.ddl ?? "";
      if (nextDdl && nextDdl !== ownDdl) {
        const bad = affectedDescendants(node, target.kind, nextDdl);
        if (bad.length) {
          setOverrun({
            target,
            values,
            items: bad,
            nextDdlText: `${Number(values.ddlDate.slice(5, 7))}月${Number(
              values.ddlDate.slice(8, 10),
            )}日 ${values.ddlTime || "23:59"}`,
          });
          return;
        }
      }
    }
    formMutation.mutate({ target, node, values, mode: form.mode, kind: form.kind });
  };

  const handleNodeAction = (action: NodeAction, target: NodeActionTarget) => {
    switch (action) {
      case "set_status":
        statusMutation.mutate({
          target,
          status: target.nextStatus ?? target.status,
        });
        break;
      case "archive":
        archiveMutation.mutate(target);
        break;
      case "delete":
        // 级联硬删 + 不可恢复 → 二次确认 (与今日待办同一交互语言)
        setPendingDelete(target);
        break;
      case "change_ddl":
        openForm("delay", target);
        break;
      case "edit":
        openForm("edit", target);
        break;
    }
  };

  /**
   * 详情页 (B6 落真路由)。
   * ⚠️ PC 是 `HashRouter` ⇒ **不带尾斜杠**。
   */
  const handleOpenDetail = (kind: NodeKind, id: string) => {
    navigate(`/schedule/${kind}/${id}`);
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
          columns={data.board.columns}
          serverTime={data.board.serverTime}
          archivedCount={data.archivedCount}
          onNewTask={openCreateForm}
          onOpenArchived={() => setArchivedOpen(true)}
          onNodeAction={handleNodeAction}
          onOpenDetail={handleOpenDetail}
        />
      )}

      {/* 归档 sheet (原型 .archived-sheet) —— 今日待办 / 看板 共用同一个组件 */}
      <ArchivedSheet open={archivedOpen} onClose={() => setArchivedOpen(false)} />

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

      {/* 新建 / 编辑 / 改 DDL 表单 (原型 .sheet) */}
      <ScheduleFormSheet
        open={!!form}
        mode={form?.mode ?? "edit"}
        kind={form?.kind ?? "task"}
        node={found?.node ?? form?.node ?? null}
        bound={form?.bound ?? null}
        submitting={formMutation.isPending}
        onClose={() => setForm(null)}
        onSubmit={submitForm}
      />

      {/* 父级改早 → 下级越界 确认框 (原型 #confirm-ddl) */}
      <ScheduleDdlOverrunDialog
        open={!!overrun}
        parentTitle={overrun?.target.title ?? ""}
        nextDdlText={overrun?.nextDdlText ?? ""}
        items={overrun?.items ?? []}
        onCancel={() => setOverrun(null)}
        onConfirm={() => {
          if (!overrun) return;
          formMutation.mutate({
            target: overrun.target,
            node: form?.node ?? null,
            values: overrun.values,
            mode: form?.mode ?? "edit",
            kind: form?.kind ?? "task",
          });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 看板树遍历 —— 找节点 / 找受影响下级
// ---------------------------------------------------------------------------

/** 四层树的下一层 kind (日程是叶子)。 */
const CHILD_KIND: Record<string, string | null> = {
  task: "subtask",
  subtask: "milestone",
  milestone: "schedule",
  schedule: null,
};

/** 父级中文名 (父级为空 → 「上级」)。 */
function kindLabelOf(kind: ParentKind): string {
  if (!kind) return "上级";
  return KIND_LABEL[kind] ?? "上级";
}

/**
 * affectedDescendants — 「父级改早 → 下级越界」判定 (原型 affectedDescendants)。
 *
 *   受影响 = 下级**自己**有 ddl 且 ddl > 父级的新 DDL;
 *   下级 ddl 为空的 (继承型) 自动满足, 不算受影响。
 *
 * ⚠️ 只对 task / subtask / milestone 生效 —— 日程的约束来自它的**父级**关键节点,
 *    同级日程之间互不约束 (契约 §9.5 的层级约束只讲「子 ≤ 父」)。
 */
function affectedDescendants(
  node: Record<string, any>,
  kind: string,
  nextDdl: string,
): DdlOverrunItem[] {
  const childKind = CHILD_KIND[kind] ?? null;
  if (!childKind) return [];
  const limit = new Date(nextDdl).getTime();
  if (Number.isNaN(limit)) return [];

  const out: DdlOverrunItem[] = [];
  const walk = (list: any[]) => {
    for (const n of list || []) {
      const ddl = n?.ddl ?? null;
      if (ddl) {
        const t = new Date(ddl).getTime();
        if (!Number.isNaN(t) && t > limit) {
          out.push({
            id: String(n.id),
            title: String(n.title ?? ""),
            kindLabel: KIND_LABEL[childKind as NodeKind] ?? childKind,
            ddl: String(ddl),
          });
        }
      }
      if (Array.isArray(n.children)) walk(n.children);
    }
  };
  walk(Array.isArray(node.children) ? node.children : []);
  return out;
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
 * ⚠️ **B6 起有调用点** —— 看板页的表单用它算「父级 DDL 上限」。
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
