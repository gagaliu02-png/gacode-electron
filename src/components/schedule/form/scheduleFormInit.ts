/**
 * scheduleFormInit — 表单的**初始值** (create / edit / delay 三种模式)。
 *
 * ⚠️ 为什么从 ScheduleFormSheet.tsx 里拆出来:
 *   `initialValues` 是**纯函数** (不进 React), 但 ScheduleFormSheet.tsx 是
 *   "use client" 组件文件 —— 断言脚本 (node) 加载不了它。
 *   拆成纯模块后, 断言脚本能**直接 import 跑真值** (而不是 grep 源码断言) ——
 *   「节点没有提醒 → 开关必须显示关」这类口径必须用**运行时值**钉住。
 *
 * 契约来源: gaclaw/docs/design/schedule-center-ux-2026-10-20.md §9.2 / §9.4
 * 需求来源: gaga 2026-10-21 —— 关键节点提醒开关是哑弹 + 提醒凭空造
 */

import { ymdOf, type FormKind, type FormMode, type FormValues } from "./scheduleFormRules";
// 类型导入 (编译后被抹掉) —— 纯模块不碰网络, 断言脚本能直接 import。
import type { ItemStatus } from "../../../lib/schedule-api";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function hhmmOf(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * 初始值 —— create 用默认值, edit/delay 从节点取。
 *
 * ⚠️ **提醒开关的口径** (2026-10-21 修):
 *   节点**本来没有提醒** → `remindOn` 必须是 **false**。
 *   旧实现兜底成 `base.remindOn` (= true) —— 节点一条提醒都没有, 表单却显示「开」,
 *   保存时 syncReminders 看到「开 + 无」→ **凭空 POST 一条提醒**。
 *   (安卓侧同款修正: ScheduleFormModels.kt 的 remindOn 兜底口径。)
 *
 *   create 模式不受影响 —— 走 `base` (新建默认「开」, 表单上看得见, 不是凭空造)。
 */
export function initialValues(
  mode: FormMode,
  kind: FormKind,
  node: Record<string, any> | null | undefined,
  defaultDate: string | undefined,
): FormValues {
  // ⚠️ 契约 v9.2 —— 子任务 / 关键节点的「开始日期 + 开始时间」= 可空的 startAt。
  //    这两种 kind 的 date / start 字段专供 startAt 用 (日程 / 任务另有语义)。
  const isChild = kind === "subtask" || kind === "milestone";
  const base: FormValues = {
    title: "",
    desc: "",
    note: "",
    // ⚠️ 子任务 / 关键节点的开始日期**不预填** defaultDate ——
    //    预填 = 用户没填也发出去 = 假值 (PM 决策: 留空 = 不设开始时间)。
    date: isChild ? "" : defaultDate || "",
    // 结束日期默认 = 开始日期 (单天日程); 跨天时用户再改
    endDate: defaultDate || "",
    start: "",
    end: "",
    ddlDate: "",
    ddlTime: "",
    ownerType: "user",
    status: "pending",
    remindOn: true,
    remindOffset: 15,
    remindChannels: ["in_app"],
  };
  if (!node || mode === "create") return base;

  const ddl = node.ddl ?? null;
  const reminders = Array.isArray(node.reminders) ? node.reminders : [];
  const first = reminders[0];
  return {
    ...base,
    title: typeof node.title === "string" ? node.title : "",
    desc: typeof node.desc === "string" ? node.desc : "",
    note: typeof node.note === "string" ? node.note : "",
    // v9.2 —— 子任务 / 关键节点回填 startAt 的日期部分 (DTO 有值才回填, 没有就空)
    date:
      kind === "schedule"
        ? (node.date ?? "")
        : kind === "task" || isChild
          ? ymdOf(node.startAt)
          : base.date,
    // 结束日期: 后端 DTO 没有这个字段 —— web 的 normalizeScheduleItem 从 endAt 的
    // 日期部分派生出来 (单天日程会等于 date)。
    endDate: kind === "schedule" ? (node.endDate ?? node.date ?? "") : base.endDate,
    start:
      kind === "schedule"
        ? (node.startAt ?? "")
        : kind === "task" || isChild
          ? hhmmOf(node.startAt)
          : "",
    end: kind === "schedule" ? (node.endAt ?? "") : "",
    ddlDate: ymdOf(ddl),
    ddlTime: hhmmOf(ddl),
    ownerType: node.ownerType === "cody" ? "cody" : "user",
    status: (node.effectiveStatus ?? node.status ?? "pending") as ItemStatus,
    // ⚠️ **节点本来没有提醒 → 开关必须是「关」** (安卓侧同款修正, 2026-10-21)。
    //   旧实现兜底成 `base.remindOn`(= true) —— 节点一条提醒都没有, 表单却显示「开」。
    //   后果: 编辑保存时 syncReminders 看到「开 + 无」→ **凭空 POST 一条提醒**;
    //   delay 模式同理 (安卓侧为此把提醒同步收窄到只在 EDIT 模式)。
    //   create 模式不受影响 —— 那边走 `base` (新建时默认「开」, 表单上看得见)。
    remindOn: first ? first.enabled !== false : false,
    remindOffset: first?.offsetMinutes ?? base.remindOffset,
    remindChannels:
      first && Array.isArray(first.channels) && first.channels.length
        ? first.channels
        : base.remindChannels,
  };
}
