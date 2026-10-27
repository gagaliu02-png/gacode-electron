/**
 * scheduleFormBody — FormValues → 各 kind 的写入体 (契约 §9.2 / §9.4 / §9.5).
 *
 * ⚠️ 几条硬约束 (来自 schedule-api.ts 的注释, 别踩):
 *   - 责任人**只传 ownerType** —— ownerId / ownerName 由服务端从 JWT 解析。
 *   - startAt / endAt 必须发**完整 ISO** (后端 ajv `format: 'date-time'`),
 *     DTO 里的 "HH:mm" 要用 scheduleLocalToIso() 转回去。
 *   - PATCH 是**稀疏更新**: 只带用户真改过的字段; 要清空必须显式传 null。
 *   - 状态字段**四层不同名** (契约 §6.4, 2026-10-22 修正):
 *     任务 / 关键节点 / 日程 → `statusOverride` (手工标记位; null = 撤销标记)
 *     子任务                   → `status`          (唯一的手工真值列, **没有** statusOverride)
 *     ⚠️ 完整对照表在 `schedule-api.ts` 的 `statusWriteBody` (含后端文件行号依据),
 *       ⋮ 菜单的状态写入也统一走那里 —— **别在本文件或页面里再手搓一份**。
 *     (旧注释写的「任务/子任务 → status」是 v9 之前的口径, 有 startAt 的任务写
 *      status 会被后端**静默接受但永不生效**。)
 *   - 提醒是**独立端点** (POST/PATCH/DELETE /schedules/{schedules,milestones}/:id/reminders[/:rid]),
 *     不在本体 PATCH 里改 —— 见 syncReminders。
 */

import {
  addMilestoneReminder,
  addScheduleReminder,
  deleteMilestoneReminder,
  deleteScheduleReminder,
  scheduleLocalToIso,
  updateMilestoneReminder,
  updateScheduleReminder,
} from "../../../lib/schedule-api";
import type {
  MilestonePatchBody,
  Reminder,
  ReminderCreateBody,
  SchedulePatchBody,
  SubtaskPatchBody,
  TaskPatchBody,
} from "../../../lib/schedule-api";
// 类型从 scheduleFormRules 拿 (纯模块, 没有 React 依赖) —— 断言脚本能直接 import 本文件。
import type { FormKind, FormMode, FormValues } from "./scheduleFormRules";
import { endDateOf } from "./scheduleFormRules";

/** DDL = ddlDate + ddlTime → ISO; 空 = null (继承)。 */
export function ddlIso(values: FormValues): string | null {
  if (!values.ddlDate) return null;
  return scheduleLocalToIso(values.ddlDate, values.ddlTime || "23:59") || null;
}

/**
 * 开始时间 = 开始日期 (values.date) + 开始时间 (values.start) → ISO。
 *
 * ⚠️ 契约 v9.2 —— **子任务 / 关键节点**的 startAt:
 *   - **可空**: 没填开始日期 → null = 不设开始时间 (表单里留空 = 不发假值)。
 *   - 只填了日期没填时间 → 时间兜底 09:00 (跟 remindAtIso 同口径)。
 *   - **不参与 DDL 继承 / 不改状态派生 / 不参与逾期判定** —— 只是本行自己的记录字段。
 * ⚠️ 跟**任务**的 startAt 不是一回事: 任务的状态由后端按时间派生 (必填),
 *    子任务 / 关键节点的 status 仍是手工真值。
 */
export function startAtIso(values: FormValues): string | null {
  if (!values.date) return null;
  return scheduleLocalToIso(values.date, values.start || "09:00") || null;
}

/**
 * 提醒的**锚点时刻** = DDL (有就优先) 或开始时间; 两个都没有 = null。
 *
 * ⚠️ null 时提醒时刻 = 「此刻」(`remindAtIso` 退回 `Date.now()`) —— 这种提醒
 *    **每次算出来都不一样**, 所以做「有没有变」的比对时必须跳过它
 *    (见 reminderChanged)。
 */
function remindBaseIso(values: FormValues): string | null {
  if (values.ddlDate) return scheduleLocalToIso(values.ddlDate, values.ddlTime || "09:00") || null;
  if (values.date) return scheduleLocalToIso(values.date, values.start || "09:00") || null;
  return null;
}

/** 提醒的触发时刻 = (DDL 或开始时间) − 提前量。 */
export function remindAtIso(values: FormValues): string {
  const base = remindBaseIso(values);
  const t = base ? new Date(base).getTime() : Date.now();
  const offset = values.remindOffset ?? 15;
  return new Date(t - offset * 60000).toISOString();
}

/**
 * 结束日期 (gaga P0-F / 决策 D2): 跨天日程的「结束日期」, 缺省 = 开始日期。
 *
 * 契约口径: **不新增 DTO 字段** —— 写回仍然只有 date / startAt / endAt 三件套:
 *   date    = 开始日期
 *   startAt = 开始日期 + 开始时间
 *   endAt   = 结束日期 + 结束时间
 * 跨天时 endAt 的日期部分 > date。
 * ⚠️ **结束时间必填** (PM 2026-10-21 最终拍板): 不做「留空 → 结束日 23:59:59」的兜底 ——
 *    那是后端的兜底, 前端**不产生留空数据**。
 */
export { endDateOf };

/** 日程本体写入体 (create / edit / delay 通用)。 */
export function scheduleBody(
  values: FormValues,
  mode: FormMode,
): SchedulePatchBody & Partial<{ title: string; date: string; startAt: string; endAt: string }> {
  // delay (改 DDL) = **只改 ddl**, 其它字段一律不带 (PATCH 稀疏语义)。
  if (mode === "delay") {
    return { ddl: ddlIso(values) } as SchedulePatchBody;
  }

  const endDay = endDateOf(values);
  const body: Record<string, unknown> = {
    ownerType: values.ownerType,
    ddl: ddlIso(values),
    statusOverride: values.status === "pending" ? null : values.status,
  };
  if (mode === "create") {
    body.title = values.title.trim();
    body.date = values.date;
    body.startAt = scheduleLocalToIso(values.date, values.start);
    body.endAt = scheduleLocalToIso(endDay, values.end);
    body.note = values.note.trim() || null;
  } else {
    // edit: 稀疏 —— 只带改过的
    if (values.title.trim()) body.title = values.title.trim();
    if (values.date) body.date = values.date;
    if (values.start) body.startAt = scheduleLocalToIso(values.date, values.start);
    if (values.end) body.endAt = scheduleLocalToIso(endDay, values.end);
    if (values.note.trim()) body.note = values.note.trim();
  }
  return body as SchedulePatchBody;
}

/**
 * 任务 / 子任务 写入体。
 *
 * ⚠️ **返回值按 kind 分类型** (task → `TaskPatchBody`, subtask → `SubtaskPatchBody`):
 *   `SubtaskPatchBody` **结构上就没有** `statusOverride` —— 子任务表没有那一列,
 *   后端 `subtaskPatchBody` 是 `additionalProperties: false` → 发了直接 400。
 *   返回类型分开 = 编译期就挡住「往子任务身上塞 statusOverride」。
 *   (字段名对照表见 `schedule-api.ts` 的 `statusWriteBody`。)
 *
 * ⚠️ gaga P0-G / 决策 D3 —— **任务**的状态由后端按时间派生:
 *   提交体带 `startAt` (ISO, 开始时间), **不发 `status`, 也不发 `statusOverride`**;
 *   后端按 startAt == null → 沿用原 status; 否则 now < startAt = 未开始 /
 *   now < ddl = 进行中 / 已过 ddl = 已完成, 通过 effectiveStatus 出参告诉前端。
 *   ⚠️ 手动改状态保留在 ⋮ 菜单 (标记进行中 / 标记完成) —— 走 `setNodeStatus`,
 *      那里按契约 §6.4 写 `statusOverride`。
 *
 *   **子任务**的 status 仍是手工真值 (契约 §9.5: Subtask 有自己的 status), 照旧发。
 *
 * 任务表单的「开始时间」= values.date (开始日期) + values.start (开始时间)。
 *
 * ⚠️ 契约 v9.2 —— **子任务**也能带 startAt (可空):
 *   填了就发 ISO, 没填发 null (= 不设开始时间);
 *   ⚠️ **delay 模式只改 DDL** —— 不带 startAt (稀疏 PATCH 语义)。
 */
export function taskBody(values: FormValues, mode: FormMode, kind: "task"): TaskPatchBody;
export function taskBody(values: FormValues, mode: FormMode, kind: "subtask"): SubtaskPatchBody;
export function taskBody(
  values: FormValues,
  mode: FormMode,
  kind?: "task" | "subtask",
): TaskPatchBody | SubtaskPatchBody;
export function taskBody(
  values: FormValues,
  mode: FormMode,
  kind: "task" | "subtask" = "task",
): TaskPatchBody | SubtaskPatchBody {
  const body: Record<string, unknown> = {
    ownerType: values.ownerType,
    ddl: ddlIso(values),
  };
  if (mode === "create" || values.title.trim()) body.title = values.title.trim();
  if (values.desc.trim()) body.desc = values.desc.trim();
  if (kind === "task") {
    // 开始时间 (ISO) —— 决策 D3; 不发 status (后端派生)
    const startAt = scheduleLocalToIso(values.date, values.start);
    if (startAt) body.startAt = startAt;
  } else {
    body.status = values.status;
    // v9.2 —— 子任务的开始时间 (可空 = 不设开始时间)。
    if (mode !== "delay") body.startAt = startAtIso(values);
  }
  return body as TaskPatchBody;
}

/**
 * 关键节点 写入体。
 *
 * ⚠️ 契约 v9.2 —— 关键节点也能带 startAt (可空 = 不设开始时间);
 *   ⚠️ **delay 模式只改 DDL** —— 不带 startAt (稀疏 PATCH 语义)。
 */
export function milestoneBody(values: FormValues, mode: FormMode): MilestonePatchBody {
  const body: Record<string, unknown> = {
    ownerType: values.ownerType,
    ddl: ddlIso(values),
    statusOverride: values.status === "pending" ? null : values.status,
  };
  if (mode === "create" || values.title.trim()) body.title = values.title.trim();
  if (mode !== "delay") body.startAt = startAtIso(values);
  return body as MilestonePatchBody;
}

/**
 * 提醒同步 —— 表单只有一个提醒 (开关 + 提前量 + 渠道), 对应节点上 0 或 1 条提醒。
 *
 * ⚠️ **kind 决定走哪组端点** (契约 §9.4 / §9.6 #2):
 *   - milestone → POST / PATCH / DELETE `/schedules/milestones/:id/reminders[/:rid]`
 *   - schedule  → POST / PATCH / DELETE `/schedules/schedules/:id/reminders[/:rid]`
 *   - task / subtask → **后端没开提醒端点** → 什么都不做。
 *   ⚠️ 旧实现把 kind 扔掉 (`void kind`), 一律打日程那组端点 → 关键节点的提醒
 *     永远落在错误的资源上 (web 端「提醒开关是哑弹」的根因之一)。
 *
 * ⚠️ **只在 edit 模式被调用** —— delay 只改 DDL, 不同步提醒
 *   (delay 的表单里根本没有提醒开关, 同步 = 凭空改/造提醒)。
 *
 * ⚠️ **没变化就不调** —— 提醒集合没变时**一个请求都不发** (避免多余请求):
 *   关 + 无 → 什么都不做 ; 关 + 有 → DELETE ; 开 + 无 → POST ;
 *   开 + 有 + 没变 → 什么都不做 ; 开 + 有 + 变了 → PATCH。
 */
export async function syncReminders(
  kind: FormKind,
  ownerId: string,
  values: FormValues,
  existing: Reminder[] | undefined,
): Promise<void> {
  // 任务 / 子任务**没有**提醒端点 (后端只给日程和关键节点开了三条)。
  if (kind !== "schedule" && kind !== "milestone") return;

  const current = existing && existing.length ? existing[0] : null;

  // 关 → 有就删; 没有什么都不做。
  if (!values.remindOn) {
    if (current) await removeReminder(kind, ownerId, current.id);
    return;
  }

  const body: ReminderCreateBody & { enabled: boolean } = {
    remindAt: remindAtIso(values),
    offsetMinutes: values.remindOffset ?? 15,
    channels: values.remindChannels.length ? values.remindChannels : ["in_app"],
    enabled: true,
  };

  // 开 + 无 → 加一条。
  if (!current) {
    await addReminder(kind, ownerId, body);
    return;
  }
  // 开 + 有 → 比对; 没变就不发请求。
  if (!reminderChanged(current, body, values)) return;
  await patchReminder(kind, ownerId, current.id, body);
}

/** 渠道集合相等 (顺序无关)。 */
function sameChannels(a: string[] | undefined, b: string[]): boolean {
  const x = [...(a ?? [])].sort();
  const y = [...b].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/**
 * 「当前提醒」跟「表单想要的状态」有没有差。
 *
 * ⚠️ 三处**故意宽容**, 否则每次保存都会白发一个 PATCH:
 *   - remindAt: 比 **epoch 毫秒** (不比字符串 —— 后端 `toISOString()` 与本地
 *     `toISOString()` 的字符串形态可能差在毫秒位上)。
 *   - remindAt 只在**锚点可比**时比 (没有 DDL / 开始时间 → 锚点是「此刻」,
 *     每算一次都不一样, 那不是「用户改了」)。
 *   - offsetMinutes: 服务端没记 (null) 视为**兜底默认值 15** —— 表单里显示的
 *     也是 15, 不是用户改的。 (真改了提前量 → remindAt 一定跟着变 → 照样 PATCH。)
 *   - enabled: 表单只认「开」; 服务端记着 disabled 而表单是开 = 用户刚打开的 → 变了。
 */
function reminderChanged(
  current: Reminder,
  body: ReminderCreateBody & { enabled: boolean },
  values: FormValues,
): boolean {
  if (remindBaseIso(values)) {
    const cur = Date.parse(current.remindAt ?? "");
    const next = Date.parse(body.remindAt);
    if (!Number.isNaN(cur) && !Number.isNaN(next) && cur !== next) return true;
  }
  if ((current.offsetMinutes ?? 15) !== (body.offsetMinutes ?? 15)) return true;
  if (!sameChannels(current.channels, body.channels)) return true;
  if (current.enabled === false && body.enabled !== false) return true;
  return false;
}

/** 按 kind 分派到对应的提醒端点 (后端三条 milestone 端点与三条 schedule 端点对称)。 */
async function addReminder(
  kind: FormKind,
  ownerId: string,
  body: ReminderCreateBody & { enabled: boolean },
): Promise<void> {
  if (kind === "milestone") {
    await addMilestoneReminder(ownerId, body);
    return;
  }
  await addScheduleReminder(ownerId, body);
}

async function patchReminder(
  kind: FormKind,
  ownerId: string,
  reminderId: string,
  body: ReminderCreateBody & { enabled: boolean },
): Promise<void> {
  if (kind === "milestone") {
    await updateMilestoneReminder(ownerId, reminderId, body);
    return;
  }
  await updateScheduleReminder(ownerId, reminderId, body);
}

async function removeReminder(
  kind: FormKind,
  ownerId: string,
  reminderId: string,
): Promise<void> {
  if (kind === "milestone") {
    await deleteMilestoneReminder(ownerId, reminderId);
    return;
  }
  await deleteScheduleReminder(ownerId, reminderId);
}

export type { SubtaskPatchBody };
