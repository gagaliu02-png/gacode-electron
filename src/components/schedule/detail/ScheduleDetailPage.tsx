/**
 * components/schedule/detail/ScheduleDetailPage.tsx — 日程中心详情页的**容器**
 * (四个 kind 共用 + cron 只读页) · PC 端 B6.
 *
 * 抄自 web `gacode-web/src/components/schedule/detail/ScheduleDetailPage.tsx` (724 行),
 * 只换 PC 写法:
 *   - `next/navigation` 的 `useRouter` → `react-router-dom` 的 `useNavigate`
 *   - `router.push("/schedule/<kind>/<id>/")` → `navigate(`/schedule/<kind>/<id>`)`
 *     —— PC 是 `HashRouter`, **不要加尾斜杠**
 *   - `useUIStore((s) => s.setHeaderTitle(...))` → PC 没有 store ⇒ **不设标题**,
 *     顶栏走 `AppShell.tsx` 的 `resolveTitle()` (已用 `pathname.startsWith("/schedule")`
 *     覆盖 ⇒ 详情页标题自动是「日程中心」)
 *   - `lucide-react` → PC 图标唯一出处是 `components/ui/Glyphs.tsx`
 *     (`Pause` → `PauseIcon` / `Play` → `PlayIcon` / `Trash2` → `TrashIcon`)
 *   - `import ... from "@/lib/schedule-api"` → `from "../../../lib/schedule-api"` (三级)
 *   - 默认导出 → **具名导出** `ScheduleDetailPage` (PC 仓的组件/路由统一用具名导出)
 *
 * 路由 (PC HashRouter):
 *   /schedule/task/<id>        任务详情
 *   /schedule/subtask/<id>     子任务详情
 *   /schedule/milestone/<id>   关键节点详情
 *   /schedule/schedule/<id>    日程详情
 *   /schedule/cron/<id>        定时任务详情 (只读)
 *
 * 数据源 (契约 §9.1 的**单条 GET**端点 + 列表端点拼父链/子项):
 *   GET /schedules/tasks/:id | /subtasks/:id | /milestones/:id | /schedules/:id | /crons/:id
 *   GET /schedules/tasks (树, 带 children) + GET /schedules/schedules (扁平日程)
 *   → buildFlatIndex → ScheduleTreeIndex (effectiveDdl / effectiveStatus / isOverdue)
 *
 * ⚠️ 写操作全部走真端点, 写完 **invalidateQueries(["schedule"])** → 详情数据重新拉,
 *    不留旧值 (原型 B4 交互 #1-#10 + E2 写接口清单)。
 *
 * ⚠️ **本批不做归档 (= B7)**:
 *   web 这里有 `archiveMutation` + `ScheduleNodeMenu` 的 `onArchive`。
 *   PC 侧**整段不搬**, `onArchive` **一律不传** ⇒ `ScheduleNodeMenu` 的菜单里
 *   **根本没有「归档」这一项** (不是灰的、不是哑弹) —— B7 落地时把 `onArchive`
 *   传上, 现有菜单实现会**自动**多出该项。
 *
 * ⚠️ **bound 的三处写法不一样** (交底 §3.3) —— 别统一抄成一种:
 *   - 本页「编辑」/「改 DDL」: `tree?.effectiveDdl(parent) ?? null` (**无** `?? parent.ddl` 回退)
 *   - 本页「新建下级」:     `tree?.effectiveDdl(node) ?? node.ddl ?? null` (**有**回退)
 *   - 看板页:              走 `findBoardNode` (见 `src/routes/ScheduleBoard.tsx`)
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PauseIcon, PlayIcon, TrashIcon } from "../../ui/Glyphs";
import { CreateFab } from "../../common/CreateFab";
import { ScheduleNodeMenu } from "../ScheduleNodeMenu";
import { ScheduleConfirmDialog } from "../ScheduleConfirmDialog";
import { RowActionMenu, type RowMenuItem } from "../RowActionMenu";
import {
  ScheduleFormSheet,
  type FormKind,
  type FormMode,
  type FormValues,
} from "../form/ScheduleFormSheet";
import {
  ddlIso,
  endDateOf,
  milestoneBody,
  remindAtIso,
  scheduleBody,
  startAtIso,
  syncReminders,
  taskBody,
} from "../form/scheduleFormBody";
import { fmtDdlShort } from "../format";
import { ScheduleDetailView, type DetailAncestor, type DetailChild } from "./ScheduleDetailView";
import { CronDetailView } from "./CronDetailView";
import {
  KIND_LABEL,
  childMeta,
  collectAncestors,
  collectChildren,
  kindOf,
  nextCreateKind,
  nextCreateLabel,
  remindSummary,
  statusSourceText,
  type DetailKind,
} from "./detailModel";
import { useToast } from "../../ui/Toast";
import {
  buildFlatIndex,
  createMilestone,
  createSchedule,
  createSubtask,
  deleteCronJob,
  deleteMilestone,
  deleteSchedule,
  deleteSubtask,
  deleteTask,
  describeScheduleError,
  getCronJobById,
  getMilestoneById,
  getScheduleById,
  getSubtaskById,
  getTaskById,
  listSchedules,
  listTasks,
  scheduleLocalToIso,
  setNodeStatus,
  toggleCronJobState,
  updateMilestone,
  updateSchedule,
  updateSubtask,
  updateTask,
} from "../../../lib/schedule-api";
import type {
  ItemStatus,
  Milestone,
  OwnerType,
  ScheduleItem,
  ScheduleNode,
} from "../../../lib/schedule-api";

export type DetailPageKind = DetailKind | "cron";

export interface ScheduleDetailPageProps {
  kind: DetailPageKind;
  id: string;
}

/**
 * detailPath —— 详情路由统一拼法 (契约 J3)。
 * ⚠️ PC 是 `HashRouter` ⇒ **不带尾斜杠** (web 的 Next.js `trailingSlash: true` 才带)。
 */
export function detailPath(kind: DetailPageKind, id: string): string {
  return `/schedule/${kind}/${id}`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 原型 fmtDdl: 「10月28日 18:00」。 */
function fmtDdlFull(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 原型 fmtFull: 「10月28日 18:00」 (cron 的创建 / 上次运行)。 */
function fmtFull(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

async function getNodeById(kind: DetailKind, id: string): Promise<ScheduleNode | null> {
  const node =
    kind === "task"
      ? await getTaskById(id)
      : kind === "subtask"
        ? await getSubtaskById(id)
        : kind === "milestone"
          ? await getMilestoneById(id)
          : await getScheduleById(id);
  // ⚠️ 后端 404 → getXxxById 返回 null (走「找不到」空态)。
  //    但如果后端回了**形状不对**的 200 (比如空数组), normalize 会产出一个 id="" 的空壳对象 ——
  //    那种也要当「找不到」, 别渲染一个空标题的详情页。
  if (!node || !node.id) return null;
  return node;
}

export function ScheduleDetailPage({ kind, id }: ScheduleDetailPageProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["schedule", "detail", kind, id],
    queryFn: async () => {
      if (kind === "cron") {
        return { cron: await getCronJobById(id), node: null, tree: null, lists: null };
      }
      const [node, tasks, schedules] = await Promise.all([
        getNodeById(kind, id),
        listTasks(),
        listSchedules(),
      ]);
      const flat = buildFlatIndex({ tasks, schedules });
      return {
        cron: null,
        node,
        tree: flat.tree,
        lists: { subtasks: flat.subtasks, milestones: flat.milestones, schedules },
      };
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["schedule"] });

  // ---------------------------------------------------------------------------
  // 派生数据 —— 祖先链 / 子项 / 字段
  // ---------------------------------------------------------------------------
  const node = query.data?.node ?? null;
  const tree = query.data?.tree ?? null;
  const lists = query.data?.lists ?? null;

  const ancestors = useMemo<DetailAncestor[]>(() => {
    if (!node || !tree) return [];
    return collectAncestors(node, tree).map((a) => ({
      id: a.id,
      kind: kindOf(a),
      title: a.title,
    }));
  }, [node, tree]);

  const children = useMemo<DetailChild[]>(() => {
    if (!node || !tree || !lists) return [];
    return collectChildren(node, lists).map(({ kind: k, node: c }) => ({
      id: c.id,
      kind: k,
      title: c.title,
      ownerType: c.ownerType,
      ownerName: c.ownerName,
      meta: childMeta(
        c,
        tree,
        (iso) => fmtDdlShort(iso),
        (date, start, end) => `${date.slice(5).replace("-", "/")} ${start}–${end}`,
      ),
      status: tree.effectiveStatus(c),
    }));
  }, [node, tree, lists]);

  const status: ItemStatus = node && tree ? tree.effectiveStatus(node) : "pending";
  const overdue = node && tree ? tree.isOverdue(node, new Date()) : false;

  const ddl = useMemo(() => {
    if (!node || !tree) return { text: "", inherited: false };
    if (node.ddl) return { text: fmtDdlFull(node.ddl), inherited: false };
    const eff = tree.effectiveDdl(node);
    if (!eff) return { text: "", inherited: false };
    const parent = tree.parentOf(node);
    return {
      text: `继承自${parent ? KIND_LABEL[kindOf(parent)] : "上级"} · ${fmtDdlFull(eff)}`,
      inherited: true,
    };
  }, [node, tree]);

  const note = useMemo(() => {
    if (!node) return "";
    if ("note" in node) return node.note || "";
    if ("desc" in node) return node.desc || "";
    return "";
  }, [node]);

  // ---------------------------------------------------------------------------
  // 写操作 —— 全部走真端点, 写完重新拉详情
  //
  // ⚠️ 状态字段**四层不同名** (契约 §6.4): task / milestone / schedule 写
  //   `statusOverride`, 只有 subtask 写 `status`。字段名与 pending 的写法都收口在 api 层
  //   `setNodeStatus`, **不在页面里手搓 4 分支**。
  // ---------------------------------------------------------------------------
  const statusMutation = useMutation({
    mutationFn: async (next: ItemStatus): Promise<unknown> => {
      if (!node) return null;
      return setNodeStatus(node.id, kindOf(node), next);
    },
    onSuccess: async (_d, next) => {
      await refresh();
      toast({
        title:
          next === "done" ? "已标记完成" : next === "in_progress" ? "已标记为进行中" : "已取消完成",
        variant: "success",
      });
    },
    onError: (err) => toast({ title: "操作失败", description: describeScheduleError(err), variant: "danger" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (targetId: string) => {
      switch (kind) {
        case "task":
          return deleteTask(targetId);
        case "subtask":
          return deleteSubtask(targetId);
        case "milestone":
          return deleteMilestone(targetId);
        case "schedule":
          return deleteSchedule(targetId);
        case "cron":
          return deleteCronJob(targetId);
      }
    },
    onSuccess: async () => {
      await refresh();
      toast({ title: "已删除", description: "不可撤销。", variant: "success" });
      navigate("/schedule");
    },
    onError: (err) => toast({ title: "删除失败", description: describeScheduleError(err), variant: "danger" }),
  });

  const cronToggleMutation = useMutation({
    mutationFn: (jobId: string) => toggleCronJobState(jobId, "paused"),
    onSuccess: async () => {
      await refresh();
      toast({ title: "已暂停", description: "日程中心不再落点。", variant: "success" });
    },
    onError: (err) => toast({ title: "操作失败", description: describeScheduleError(err), variant: "danger" }),
  });

  const cronResumeMutation = useMutation({
    mutationFn: (jobId: string) => toggleCronJobState(jobId, "active"),
    onSuccess: async () => {
      await refresh();
      toast({ title: "已启用", description: "下次运行时间已重算。", variant: "success" });
    },
    onError: (err) => toast({ title: "操作失败", description: describeScheduleError(err), variant: "danger" }),
  });

  // ---------------------------------------------------------------------------
  // 表单 (编辑 / 改 DDL / 分层新建)
  // ---------------------------------------------------------------------------
  const [form, setForm] = useState<{
    mode: FormMode;
    kind: FormKind;
    node: Record<string, any> | null;
    bound: { label: string; title: string; ddl?: string | null } | null;
  } | null>(null);

  const formMutation = useMutation({
    mutationFn: async ({
      mode: m,
      kind: k,
      values,
    }: {
      mode: FormMode;
      kind: FormKind;
      values: FormValues;
    }) => {
      // create —— 分层新建 (原型 currentCreateCtx): 任务 → 子任务 → 关键节点 → 日程
      if (m === "create") {
        const ownerType: OwnerType = values.ownerType;
        if (k === "subtask") {
          return createSubtask({
            title: values.title.trim(),
            taskId: node?.id ?? "",
            ownerType,
            ddl: ddlIso(values),
            // v9.2 —— 子任务的开始时间 (可空 = 不设开始时间)
            startAt: startAtIso(values),
            status: values.status,
            desc: values.desc.trim() || null,
          });
        }
        if (k === "milestone") {
          return createMilestone({
            title: values.title.trim(),
            subtaskId: node?.id ?? "",
            ownerType,
            ddl: ddlIso(values),
            // v9.2 —— 关键节点的开始时间 (可空 = 不设开始时间)
            startAt: startAtIso(values),
            statusOverride: values.status === "pending" ? null : values.status,
            reminders: values.remindOn
              ? [
                  {
                    remindAt: remindAtIso(values),
                    offsetMinutes: values.remindOffset ?? 15,
                    channels: values.remindChannels.length ? values.remindChannels : ["in_app"],
                    enabled: true,
                  },
                ]
              : [],
          });
        }
        return createSchedule({
          title: values.title.trim(),
          date: values.date,
          startAt: scheduleLocalToIso(values.date, values.start),
          endAt: scheduleLocalToIso(endDateOf(values), values.end),
          ownerType,
          note: values.note.trim() || null,
          ddl: ddlIso(values),
          statusOverride: values.status === "pending" ? null : values.status,
          milestoneId: node?.id ?? null,
          reminders: values.remindOn
            ? [
                {
                  remindAt: remindAtIso(values),
                  offsetMinutes: values.remindOffset ?? 15,
                  channels: values.remindChannels.length ? values.remindChannels : ["in_app"],
                  enabled: true,
                },
              ]
            : [],
        });
      }

      if (!node) return null;
      if (m === "delay") {
        if (kind === "task") return updateTask(node.id, { ddl: ddlIso(values) });
        if (kind === "subtask") return updateSubtask(node.id, { ddl: ddlIso(values) });
        if (kind === "milestone") return updateMilestone(node.id, { ddl: ddlIso(values) });
        return updateSchedule(node.id, { ddl: ddlIso(values) });
      }
      // edit
      if (kind === "task") return updateTask(node.id, taskBody(values, "edit", "task"));
      if (kind === "subtask") return updateSubtask(node.id, taskBody(values, "edit", "subtask"));
      // ⚠️ 关键节点走 milestoneBody —— 跟看板页**同一份写入体** (带 title / ownerType)。
      //    旧实现在这里手搓 { ddl, statusOverride, startAt } → **漏了 title**,
      //    从详情页改关键节点标题存不上 (D-2, pre-existing, 引入于 1db8ad5)。
      if (kind === "milestone") {
        const updated = await updateMilestone(node.id, milestoneBody(values, "edit"));
        // ⚠️ 关键节点的**提醒是独立端点** —— `PATCH /milestones/:id` 一律不收 reminders
        //    (后端 routes.js:23 明文)。旧实现只 PATCH 本体 → **提醒开关是哑弹**
        //    (改了不生效)。这里补上 `/milestones/:id/reminders*` 的同步。
        //    提醒集合没变时 syncReminders 一个请求都不发。
        await syncReminders("milestone", node.id, values, (node as Milestone).reminders);
        return updated;
      }
      const updated = await updateSchedule(node.id, scheduleBody(values, "edit"));
      await syncReminders("schedule", node.id, values, (node as ScheduleItem).reminders);
      return updated;
    },
    onSuccess: async (_d, vars) => {
      await refresh();
      setForm(null);
      toast({
        title: vars.mode === "create" ? `已创建「${vars.values.title}」` : "已保存",
        variant: "success",
      });
    },
    onError: (err) => toast({ title: "保存失败", description: describeScheduleError(err), variant: "danger" }),
  });

  const openEdit = () => {
    if (!node) return;
    // ⚠️ 上限用父级的 **effectiveDdl** (契约 §9.4b) —— 父级自身 ddl 为空时
    //   它的截止时间是从更上层继承来的; 用父级自身的空值 = 限制失效。
    //   ⚠️ 这里**无** `?? parent.ddl` 回退 (交底 §3.3) —— 与 web 的 `web:434-441` 逐字一致。
    const parent = tree?.parentOf(node) ?? null;
    setForm({
      mode: "edit",
      kind: kindOf(node),
      node: node as unknown as Record<string, any>,
      bound: parent
        ? {
            label: KIND_LABEL[kindOf(parent)],
            title: parent.title,
            ddl: tree?.effectiveDdl(parent) ?? null,
          }
        : null,
    });
  };

  const openDdl = () => {
    if (!node) return;
    const parent = tree?.parentOf(node) ?? null;
    setForm({
      mode: "delay",
      kind: kindOf(node),
      node: node as unknown as Record<string, any>,
      bound: parent
        ? {
            label: KIND_LABEL[kindOf(parent)],
            title: parent.title,
            ddl: tree?.effectiveDdl(parent) ?? null,
          }
        : null,
    });
  };

  /** 分层新建 —— 入口按当前 kind 分流 (原型 currentCreateCtx)。 */
  const openCreateNext = () => {
    if (!node) return;
    const next = nextCreateKind(kindOf(node));
    if (!next) return;
    setForm({
      mode: "create",
      kind: next,
      node: null,
      // ⚠️ 这里**有** `?? node.ddl` 回退 (交底 §3.3) —— 与 web 的 `web:470-474` 逐字一致。
      bound: {
        label: KIND_LABEL[kindOf(node)],
        title: node.title,
        ddl: tree?.effectiveDdl(node) ?? node.ddl ?? null,
      },
    });
  };

  const goDetail = (k: DetailKind, nodeId: string) => navigate(detailPath(k, nodeId));

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) navigate(-1);
    else navigate("/schedule");
  };

  // ---------------------------------------------------------------------------
  // 渲染
  // ---------------------------------------------------------------------------
  if (query.isPending) {
    return (
      <div className="min-h-full px-4 lg:px-6 py-6" aria-busy="true" aria-label="加载中">
        <div className="h-6 w-2/3 rounded bg-bg-elevated animate-pulse" />
        <div className="mt-3 h-4 w-40 rounded bg-bg-elevated animate-pulse" />
        <div className="mt-4 h-28 rounded-2xl bg-bg-elevated animate-pulse" />
        <div className="mt-3 h-28 rounded-2xl bg-bg-elevated animate-pulse" />
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="min-h-full px-4 lg:px-6 py-6">
        <div className="rounded-xl border border-danger/40 bg-danger-soft/20 px-4 py-3 text-sm text-danger">
          详情加载失败:{describeScheduleError(query.error)}
        </div>
      </div>
    );
  }

  // ---- cron 只读页 ----
  if (kind === "cron") {
    const job = query.data?.cron ?? null;
    if (!job) {
      return (
        <div className="min-h-full px-4 lg:px-6 py-6">
          <div className="rounded-xl border border-white/[0.08] bg-card px-4 py-3 text-sm text-fg-muted">
            找不到这个定时任务(可能已被删除)。
          </div>
        </div>
      );
    }
    const paused = job.state !== "active";
    const cronItems: RowMenuItem[] = [
      {
        key: "toggle",
        label: paused ? "启用" : "暂停",
        icon: paused ? (
          <PlayIcon size={14} className="w-[14px] h-[14px]" />
        ) : (
          <PauseIcon size={14} className="w-[14px] h-[14px]" />
        ),
        onSelect: () =>
          paused ? cronResumeMutation.mutate(job.id) : cronToggleMutation.mutate(job.id),
      },
      {
        key: "delete",
        label: "删除",
        icon: <TrashIcon size={14} className="w-[14px] h-[14px]" />,
        danger: true,
        separatorBefore: true,
        onSelect: () => setPendingDelete(job.id),
      },
    ];
    return (
      <div className="min-h-full px-4 lg:px-6 pb-24">
        <CronDetailView
          job={job}
          nextRunText={job.nextRunAt ? fmtFull(job.nextRunAt) : "—"}
          lastRunText={job.lastRunAt ? fmtFull(job.lastRunAt) : "尚未运行"}
          createdText={fmtFull(job.createdAt)}
          onBack={goBack}
          onToggle={() =>
            paused ? cronResumeMutation.mutate(job.id) : cronToggleMutation.mutate(job.id)
          }
          onDelete={() => setPendingDelete(job.id)}
          menu={<RowActionMenu items={cronItems} ariaLabel={`${job.title} 的更多操作`} />}
        />

        <ScheduleConfirmDialog
          open={!!pendingDelete}
          title={`删除「${job.title}」?`}
          description="定时任务是硬删, 删除后不可恢复。"
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

  // ---- 四 kind 详情页 ----
  if (!node) {
    return (
      <div className="min-h-full px-4 lg:px-6 py-6">
        <div className="rounded-xl border border-white/[0.08] bg-card px-4 py-3 text-sm text-fg-muted">
          找不到这个条目(可能已被删除或归档)。
        </div>
      </div>
    );
  }

  const nodeKind = kindOf(node);
  const remind =
    nodeKind === "schedule" || nodeKind === "milestone"
      ? remindSummary((node as ScheduleItem | Milestone).reminders)
      : null;

  // 时间文案 —— 跨天日程 (gaga P0-F) 要把**结束日期**也带出来:
  //   单天: 2026-10-21 10:00 – 11:30
  //   跨天: 2026-10-21 10:00 – 2026-10-24 18:00
  const timeText =
    nodeKind === "schedule"
      ? (() => {
          const s = node as ScheduleItem;
          const endDay = s.endDate || s.date;
          return endDay && endDay !== s.date
            ? `${s.date} ${s.startAt} – ${endDay} ${s.endAt}`
            : `${s.date} ${s.startAt} – ${s.endAt}`;
        })()
      : null;

  // 「开始时间」行 —— 任务 / 子任务 / 关键节点 才有 (日程的时间在「时间」行里)。
  // ⚠️ 契约 v9.2 —— startAt **可空** = 不设开始时间 → 没值返回 null,
  //    视图里就**整行不渲染** (不显示 "—" / 空串)。
  // ⚠️ 这三种 kind 的 startAt 是**完整 ISO datetime** (日程的 startAt 是 "HH:mm", 两种别混)。
  const startText =
    nodeKind === "task" || nodeKind === "subtask" || nodeKind === "milestone"
      ? (() => {
          const raw = "startAt" in node ? node.startAt : null;
          if (!raw) return null;
          const text = fmtDdlFull(raw);
          return text === "—" ? null : text;
        })()
      : null;

  let belongText: string | null = null;
  if (nodeKind === "schedule") {
    const parent = tree?.parentOf(node) ?? null;
    belongText = parent
      ? `关键节点 · ${parent.title}`
      : "游离日程 — 不挂在任何关键节点下";
  }

  const createNext = nextCreateKind(nodeKind);

  return (
    <div className="min-h-full px-4 lg:px-6 pb-24">
      <ScheduleDetailView
        kind={nodeKind}
        title={node.title}
        status={status}
        overdue={overdue}
        statusSource={statusSourceText(
          nodeKind,
          "statusOverride" in node ? node.statusOverride : null,
        )}
        ddlText={ddl.text}
        ddlInherited={ddl.inherited}
        ownerType={node.ownerType}
        ownerName={node.ownerName}
        note={note}
        remind={remind}
        remindHint={
          nodeKind === "milestone"
            ? "新建日程时默认继承这里的提醒设置;关键节点本身也可单独改"
            : null
        }
        timeText={timeText}
        startText={startText}
        belongText={belongText}
        ancestors={ancestors}
        childItems={children}
        onBack={goBack}
        onOpenAncestor={goDetail}
        onOpenChild={goDetail}
        onEdit={openEdit}
        showEdit
        menu={
          <ScheduleNodeMenu
            kind={nodeKind}
            status={status}
            ariaLabel={`${node.title} 的更多操作`}
            onSetStatus={(s) => statusMutation.mutate(s)}
            // ⚠️ `onArchive` **不传** (= B7) ⇒ 菜单里**没有**「归档」这一项。
            onChangeDdl={openDdl}
            onEdit={openEdit}
            onDelete={() => setPendingDelete(node.id)}
          />
        }
      />

      {/* 分层新建入口 (原型 .fab: 任务→子任务 / 子任务→关键节点 / 关键节点→日程) */}
      {createNext ? (
        <CreateFab label={nextCreateLabel(nodeKind)} onClick={openCreateNext} data-detail-create="" />
      ) : null}

      {/* 新建 / 编辑 / 改 DDL 表单 */}
      <ScheduleFormSheet
        open={!!form}
        mode={form?.mode ?? "edit"}
        kind={form?.kind ?? nodeKind}
        node={form?.node ?? null}
        bound={form?.bound ?? null}
        submitting={formMutation.isPending}
        onClose={() => setForm(null)}
        onSubmit={(values) => {
          if (!form) return;
          formMutation.mutate({ mode: form.mode, kind: form.kind, values });
        }}
      />

      <ScheduleConfirmDialog
        open={!!pendingDelete}
        title={`删除「${node.title}」?`}
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
