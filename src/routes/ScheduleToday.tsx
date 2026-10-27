/**
 * routes/ScheduleToday.tsx — 日程中心入口页 (今日待办) · PC 端 B3 + B6
 *
 * 抄自 web `gacode-web/src/app/(main)/schedule/page.tsx`, 只换 PC 写法:
 *   - `next/navigation` 的 `useRouter` → `react-router-dom` 的 `useNavigate`
 *   - `useToast` from `@/components/common/Toast` → `../components/ui/Toast`
 *     (PC toast API: `toast({ title?, message?, description?, variant? })`)
 *   - `useUIStore((s) => s.setHeaderTitle(...))` → PC 没有 store
 *     ⇒ 顶栏标题走 `AppShell.tsx` 的 `resolveTitle()` 按路由派生 ("日程中心")
 *   - web 的内联删除确认框 → 抽成共享件 `ScheduleConfirmDialog`
 *
 * 信息架构 (总 PM 定):
 *   /schedule           = 今日待办  ← 本页
 *   /schedule/calendar  = 日程中心  (B4)
 *   /schedule/board     = 任务看板  (B5)
 *   /schedule/<kind>/<id> = 详情页   (B6: task/subtask/milestone/schedule/cron)
 *
 * 写操作: 完成 / 取消完成 / 删除, 定时任务的 暂停·启用 + 删除 —— 全部走真端点
 *   (PATCH /schedules/:id、PATCH /crons/:id、DELETE …)。归档 / 恢复 / 提醒 CRUD
 *   的实现见 schedule-api.ts (归档入口是 B7, 本页不挂)。
 *
 * 三态: loading = 骨架占位; error = 按后端 error.code 分支的可读文案
 *   (契约 §9.4b 的 4 个码); empty = 空态占位, 不让页面「啥也没有」地空白。
 *
 * ⚠️ **B6 接上的入口** (PM 拍板):
 *   - FAB「新建待办」→ 打开**新建日程**表单 (kind=schedule / mode=create,
 *     defaultDate = 今天)
 *   - 行菜单「编辑」/「改 DDL」→ 打开表单 (mode=edit / mode=delay)
 *   - 点卡片整行 → 跳**真详情路由** `/schedule/schedule/{id}`
 *   ⚠️ **归档入口仍不渲染** (= B7) ⇒ 菜单里**没有**「归档」这一项。
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ScheduleTabs } from "../components/schedule/ScheduleTabs";
import { TodayTodoList } from "../components/schedule/TodayTodoList";
import { ScheduleConfirmDialog } from "../components/schedule/ScheduleConfirmDialog";
import { CreateFab } from "../components/common/CreateFab";
import { useToast } from "../components/ui/Toast";
import { dateToYmd } from "../components/schedule/calendar-utils";
import {
  ScheduleFormSheet,
  type FormMode,
  type FormValues,
} from "../components/schedule/form/ScheduleFormSheet";
import { ddlIso, endDateOf, scheduleBody, syncReminders } from "../components/schedule/form/scheduleFormBody";
import {
  buildScheduleTreeIndex,
  createSchedule,
  deleteCronJob,
  deleteSchedule,
  describeScheduleError,
  listCronJobs,
  listMilestones,
  listSubtasks,
  listTasks,
  listTodayTodos,
  scheduleLocalToIso,
  setScheduleStatus,
  toggleCronJobState,
  updateSchedule,
} from "../lib/schedule-api";
import type { CronJob, ItemStatus, ScheduleItem } from "../lib/schedule-api";

/** loading 骨架 — 日程各视图共用同一套占位规格, 别每页各画一套。 */
function ScheduleSkeleton() {
  return (
    <div className="px-4 lg:px-6 py-6 space-y-3" aria-busy="true" aria-label="加载中">
      <div className="h-4 w-32 rounded bg-bg-elevated animate-pulse" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-14 rounded-lg bg-bg-elevated animate-pulse" />
      ))}
      <span className="sr-only">加载中...</span>
    </div>
  );
}

/** empty 占位 — 五桶 + cron 全空时展示, 不留白屏。 */
function ScheduleEmpty() {
  return (
    <div className="px-4 lg:px-6 py-10 flex flex-col items-center text-center">
      <p className="m-0 text-sm font-medium text-fg">今天还没有安排</p>
      <p className="m-0 mt-1 text-[13px] text-fg-muted">
        新的日程会出现在这里, 也可以让 Cody 帮你排。
      </p>
    </div>
  );
}

export function ScheduleToday() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // 时钟锚点 —— 与 web 同款走**本机时间** (web `schedule/page.tsx:93` 的 `new Date()`)。
  // ⚠️ serverTime 基准是 B5 看板页的事 (web `board/page.tsx` 用 `data.board.serverTime`),
  //    本页不引入 (PM 2026-10-27 纠正: 今日待办页照 web 用本机时间, 别另包一层
  //    `scheduleFetchEnvelope` 去捞 serverTime)。
  const now = useMemo(() => new Date(), []);
  const todayYmd = useMemo(() => dateToYmd(now), [now]);

  const { data, isPending, error } = useQuery({
    queryKey: ["schedule", "today", todayYmd],
    queryFn: async () => {
      // 今天视图只显示 active 子集 (契约 §2.1.4: 已归档条目不在任何视图出现)——
      //   * listTodayTodos 内部已 exclude archived
      //   * tree 用 active-only 三张表 build, 引用解析不会跨过 archived 边界
      const [buckets, crons, activeTasks, subtasks, milestones] = await Promise.all([
        listTodayTodos(now),
        listCronJobs(),
        listTasks(),
        listSubtasks(),
        listMilestones(),
      ]);
      return {
        buckets,
        crons,
        tree: buildScheduleTreeIndex({
          tasks: activeTasks,
          subtasks,
          milestones,
        }),
      };
    },
  });

  // 数据真变了再重投影 —— UI 立刻跟着刷新
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["schedule"] });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ItemStatus }) =>
      setScheduleStatus(id, status),
    onSuccess: async (_item, vars) => {
      await refresh();
      toast({
        title: vars.status === "done" ? "已标记完成" : "已取消完成",
        variant: "success",
      });
    },
    onError: (err) => {
      toast({ title: "操作失败", description: describeScheduleError(err), variant: "danger" });
    },
  });

  const deleteScheduleMutation = useMutation({
    mutationFn: (id: string) => deleteSchedule(id),
    onSuccess: async () => {
      await refresh();
      toast({ title: "已删除", description: "删除后不可恢复。", variant: "success" });
    },
    onError: (err) => {
      toast({ title: "删除失败", description: describeScheduleError(err), variant: "danger" });
    },
  });

  // 定时任务: 暂停·启用 + 删除 (PATCH /crons/:id, body 严格只带 {status})
  const cronToggleMutation = useMutation({
    mutationFn: (job: CronJob) =>
      toggleCronJobState(job.id, job.state === "active" ? "paused" : "active"),
    onSuccess: refresh,
    onError: (err) => {
      toast({ title: "操作失败", description: describeScheduleError(err), variant: "danger" });
    },
  });

  const cronDeleteMutation = useMutation({
    mutationFn: (id: string) => deleteCronJob(id),
    onSuccess: async () => {
      await refresh();
      toast({ title: "已删除", description: "定时任务删除后不可恢复。", variant: "success" });
    },
    onError: (err) => {
      toast({ title: "删除失败", description: describeScheduleError(err), variant: "danger" });
    },
  });

  // ⋮ 菜单里的删除要二次确认 (冻结契约: DELETE 是硬删, 不可恢复)。
  // 用 state 记住"待删除的条目", 确认后真删 —— 不用系统 confirm(), 那玩意儿不受样式控制。
  const [pendingDelete, setPendingDelete] = useState<{
    kind: "schedule" | "cron";
    id: string;
    title: string;
  } | null>(null);

  const askDeleteSchedule = (item: ScheduleItem) =>
    setPendingDelete({ kind: "schedule", id: item.id, title: item.title });
  const askDeleteCron = (job: CronJob) =>
    setPendingDelete({ kind: "cron", id: job.id, title: job.title });

  // ---------------------------------------------------------------------------
  // 表单 (新建 / 编辑 / 改 DDL) —— B6
  //
  // ⚠️ 本页的表单**只有 kind=schedule** (今日待办里全是日程条目)。
  //    任务的表单在看板页 (kind=task), 分层新建在详情页。
  // ---------------------------------------------------------------------------
  const [form, setForm] = useState<{
    mode: FormMode;
    node: ScheduleItem | null;
  } | null>(null);

  const openCreateForm = () => setForm({ mode: "create", node: null });
  const openEditForm = (item: ScheduleItem) => setForm({ mode: "edit", node: item });
  const openDdlForm = (item: ScheduleItem) => setForm({ mode: "delay", node: item });

  const formMutation = useMutation({
    mutationFn: async ({
      mode,
      node,
      values,
    }: {
      mode: FormMode;
      node: ScheduleItem | null;
      values: FormValues;
    }) => {
      if (mode === "create") {
        const created = await createSchedule({
          title: values.title.trim(),
          date: values.date,
          startAt: scheduleLocalToIso(values.date, values.start),
          // ⚠️ **有意偏离 web 的今日待办页** (web `schedule/page.tsx:233` 用的是
          //    `scheduleLocalToIso(values.date, values.end)` —— 把结束时间落在**开始日期**上,
          //    跨天日程的结束日期被丢掉)。
          //    web 的**日历页**与**详情页**都用 `endDateOf(values)` (结束日期 + 结束时间),
          //    契约 §9.4 (gaga P0-F 跨天日程) 也是这个口径 ⇒ 这里取**多数派 + 契约**口径。
          endAt: scheduleLocalToIso(endDateOf(values), values.end),
          ownerType: values.ownerType,
          note: values.note.trim() || null,
          ddl: ddlIso(values),
          statusOverride: values.status === "pending" ? null : values.status,
        });
        if (values.remindOn) {
          await syncReminders("schedule", created.id, values, []);
        }
        return created;
      }
      if (!node) return null;
      await updateSchedule(node.id, scheduleBody(values, mode));
      // ⚠️ **只在 edit 模式同步提醒** (delay 只改 DDL, 表单里根本没有提醒开关,
      //    同步 = 凭空改 / 造提醒)。
      if (mode === "edit") {
        await syncReminders("schedule", node.id, values, node.reminders);
      }
      return node;
    },
    onSuccess: async (_d, vars) => {
      await refresh();
      setForm(null);
      const name = vars.mode === "create" ? `已创建「${vars.values.title}」` : "已保存";
      toast({
        title: name,
        description: "看板 / 日程中心 / 今日待办已同步",
        variant: "success",
      });
    },
    onError: (err) => {
      toast({ title: "保存失败", description: describeScheduleError(err), variant: "danger" });
    },
  });

  // 五桶 + cron 全空 = empty 态 (否则页面「啥也没有」地空白)
  const isEmpty =
    !!data &&
    data.crons.length === 0 &&
    data.buckets.overdue.length + data.buckets.morning.length +
      data.buckets.afternoon.length + data.buckets.evening.length +
      data.buckets.done.length === 0;

  return (
    <div className="min-h-full">
      <ScheduleTabs active="today" />

      {isPending && <ScheduleSkeleton />}

      {error && (
        <div className="px-4 lg:px-6 py-6">
          <div className="rounded-xl border border-danger/40 bg-danger-soft/20 px-4 py-3 text-sm text-danger">
            数据加载失败:{describeScheduleError(error)}
          </div>
        </div>
      )}

      {data && isEmpty && <ScheduleEmpty />}

      {data && !isEmpty && (
        <TodayTodoList
          buckets={data.buckets}
          crons={data.crons}
          tree={data.tree}
          now={now}
          todayYmd={todayYmd}
          onToggleDone={(item) => {
            // v6: ScheduleItem 没有 status 字段; 用 effectiveStatus 判定当前态。
            const cur = data.tree.effectiveStatus(item);
            statusMutation.mutate({
              id: item.id,
              status: cur === "done" ? "pending" : "done",
            });
          }}
          onOpenDetail={(item) => navigate(`/schedule/schedule/${item.id}`)}
          onMarkProgress={(item) => statusMutation.mutate({ id: item.id, status: "in_progress" })}
          onChangeDdl={openDdlForm}
          onEdit={openEditForm}
          onDeleteSchedule={askDeleteSchedule}
          onToggleCron={(job) => cronToggleMutation.mutate(job)}
          onDeleteCron={askDeleteCron}
        />
      )}

      {/* 删除二次确认 —— 冻结契约里 DELETE 是硬删且不可恢复, 树节点还会级联删下级 */}
      <ScheduleConfirmDialog
        open={!!pendingDelete}
        title={pendingDelete ? `删除「${pendingDelete.title}」?` : ""}
        description={
          pendingDelete?.kind === "cron"
            ? "删除后不可恢复。"
            : "删除后不可恢复。如果它下面还有下级条目, 会一并删除。"
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          const target = pendingDelete;
          setPendingDelete(null);
          if (!target) return;
          if (target.kind === "cron") {
            cronDeleteMutation.mutate(target.id);
          } else {
            deleteScheduleMutation.mutate(target.id);
          }
        }}
      />

      {/* 新建待办 / 编辑 / 改 DDL 表单 —— 原型 .sheet (底部弹层 + 自绘日期/时间 picker + 自定义下拉) */}
      <ScheduleFormSheet
        open={!!form}
        mode={form?.mode ?? "create"}
        kind="schedule"
        node={form?.node ?? null}
        defaultDate={todayYmd}
        submitting={formMutation.isPending}
        onClose={() => setForm(null)}
        onSubmit={(values) => {
          if (!form) return;
          formMutation.mutate({ mode: form.mode, node: form.node, values });
        }}
      />

      {/* 新建待办入口 —— 全站统一的 <CreateFab> (原型 v6 `.fab`), 跟 知识库 / 任务看板 同款。 */}
      <CreateFab label="新建待办" onClick={openCreateForm} />
    </div>
  );
}
