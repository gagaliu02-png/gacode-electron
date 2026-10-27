/**
 * detailModel — 日程中心详情页的**纯计算** (原型 v6 §B4「详情页（四个 kind 共用 + cron 只读页）」)。
 *
 * ⚠️ 为什么单独一个文件:
 *   详情页的字段集 / 面包屑 / 子项列表 / 新建分流都是**纯函数** ——
 *   放这里可以被 scripts/verify-schedule-detail.mjs 直接 import 断言,
 *   不用起浏览器、不用打网络 (跟 calendar-utils.ts / format.ts 一个路子)。
 *
 * 契约来源: gaclaw/docs/design/schedule-center-ux-2026-10-20.md
 *   §9.5 (四张表 DTO / effectiveDdl / effectiveStatus 继承规则)
 *   §2.1.3 (判定由后端给, 端侧只消费)
 * 视觉来源: docs/prototype/schedule-center.html L407-441 (详情页 CSS) + L2262-2362 (renderDetail / renderCronDetail)
 */

import type {
  ItemStatus,
  Reminder,
  ScheduleNode,
  ScheduleTreeIndex,
} from "../../../lib/schedule-api";

/** 四层树里的四种 kind (cron 不在树里, 单独走只读页)。 */
export type DetailKind = "task" | "subtask" | "milestone" | "schedule";

export const DETAIL_KINDS: DetailKind[] = ["task", "subtask", "milestone", "schedule"];

export const KIND_LABEL: Record<DetailKind, string> = {
  task: "任务",
  subtask: "子任务",
  milestone: "关键节点",
  schedule: "日程",
};

/**
 * 详情页大标题的字号层级 (原型 .detail-title.k-*, L412-417):
 *   任务 23px/700/31 · 子任务 19px/600/26 · 关键节点 17px/600/24 · 日程 16px/500/24
 * 手机端 (原型 L718-721): 20/27 · 18/25 · 16.5/23 · 15.5/23
 */
export const DETAIL_TITLE_CLASS: Record<DetailKind, string> = {
  task: "text-[23px] font-bold leading-[31px] tracking-[-0.01em] max-[640px]:text-[20px] max-[640px]:leading-[27px]",
  subtask: "text-[19px] font-semibold leading-[26px] max-[640px]:text-[18px] max-[640px]:leading-[25px]",
  milestone: "text-[17px] font-semibold leading-[24px] max-[640px]:text-[16.5px] max-[640px]:leading-[23px]",
  schedule: "text-[16px] font-medium leading-[24px] max-[640px]:text-[15.5px] max-[640px]:leading-[23px]",
};

/**
 * 子项分组的标题 (原型 L2317 kidTitle):
 *   任务 → 子任务 · 子任务 → 关键节点 · 关键节点 → 日程 · 日程 → 同级日程
 */
export function childGroupTitle(kind: DetailKind): string {
  if (kind === "task") return "子任务";
  if (kind === "subtask") return "关键节点";
  if (kind === "milestone") return "日程";
  return "同级日程";
}

/**
 * 新建入口按**当前详情页的 kind** 分流 (原型 currentCreateCtx L2450-2460):
 *   任务 → 新建子任务 · 子任务 → 新建关键节点 · 关键节点 → 新建日程 · 日程 → 没有 (叶子)
 * cron 详情页是只读的 → 也没有。
 */
export function nextCreateKind(kind: DetailKind): DetailKind | null {
  if (kind === "task") return "subtask";
  if (kind === "subtask") return "milestone";
  if (kind === "milestone") return "schedule";
  return null;
}

/** 新建入口的 FAB 文案 (原型 ctx.title: 「新建子任务」/「新建关键节点」/「新建日程」)。 */
export function nextCreateLabel(kind: DetailKind): string {
  const next = nextCreateKind(kind);
  return next ? `新建${KIND_LABEL[next]}` : "新建";
}

/** 新建入口的提示文案 (原型 ctx.hint)。 */
export function nextCreateHint(kind: DetailKind): string {
  if (kind === "task") return "子任务挂在任务下面 — 截止时间不能晚于父任务的截止时间。";
  if (kind === "subtask") return "关键节点挂在子任务下面 — 截止时间不能晚于父子任务的截止时间。";
  if (kind === "milestone")
    return "这条日程挂在关键节点下面 — 日期和截止时间都不能晚于父关键节点的截止时间。";
  return "";
}

/** 子项层级 (原型 childLevel L2257-2260): 直属子级 lv1, 再往下 lv2 / lv3。 */
export function childLevel(kind: DetailKind): "lv1" | "lv2" | "lv3" {
  if (kind === "subtask") return "lv1";
  if (kind === "milestone") return "lv2";
  return "lv3";
}

/** 子项名字号 (原型 .child .cnm L436-439)。 */
export const CHILD_NAME_CLASS: Record<"lv1" | "lv2" | "lv3", string> = {
  lv1: "text-[14px] font-medium",
  lv2: "text-[13px] text-fg-muted",
  lv3: "text-[12.5px] text-fg-subtle",
};

export const STATUS_LABEL: Record<ItemStatus, string> = {
  pending: "未开始",
  in_progress: "进行中",
  done: "已完成",
};

/** 状态 chip 配色 (跟 ScheduleTaskCard 的 StatusChip 同一套, 跟原型 statusChip 一致)。 */
export function statusChipClass(status: ItemStatus): string {
  if (status === "done") return "bg-success/[0.16] text-success";
  if (status === "in_progress") return "bg-brand/[0.15] text-brand";
  return "bg-bg-elevated text-fg-muted";
}

/**
 * 提醒渠道 —— **现行口径** (2026-10-22 · 件 2「web Reminder.channels 仍透传 wechat」)。
 *
 * 后端已按契约决策 A 把「推送渠道」收敛成 `in_app` / `app_push`; 但**存量**数据里
 * 还留着 `wechat` (决策 G: 既不发也不标 fired) —— 后端**只改注释、没加拒绝校验**,
 * 所以 web 端拿到的 `channels` 仍是宽泛的 `string[]`。
 *
 * ⚠️ 因此:
 *   - **DTO 类型保持 `string[]`** (`src/lib/schedule-api.ts` 的 `Reminder.channels`) ——
 *     改成硬枚举就是**类型撒谎** (编译过、运行时炸)。
 *   - 收敛只发生在**渲染 / 判定层** (本文件): 只有 `in_app` / `app_push` 才显示渠道标签,
 *     `wechat` 这类存量老值**不显示成可用渠道**。
 *   - 后端值**原样透传** —— 本文件不改数据, 只改「显示什么」。
 */

/** 现行渠道白名单 (渲染层判定用)。 */
export const ACTIVE_REMINDER_CHANNELS = ["in_app", "app_push"] as const;

/** 这个渠道是不是现行渠道 (存量老值如 `wechat` → false)。 */
export function isActiveChannel(channel: string): boolean {
  return (ACTIVE_REMINDER_CHANNELS as readonly string[]).includes(channel);
}

/**
 * 提醒渠道中文名。
 *
 * ⚠️ 旧实现: `in_app`→应用内通知 / `app_push`→应用弹窗 / **其它→微信**。
 *    那个「其它→微信」的兜底会让**存量 `wechat`** 显示成「微信」, 也让任何
 *    未知值都显示成「微信」—— 跟现行口径 (决策 A) 冲突。
 *    现在: 未知 / 存量老值 → **空串** (调用方据此**不显示**该渠道)。
 */
export function channelLabel(channel: string): string {
  if (channel === "in_app") return "应用内通知";
  if (channel === "app_push") return "应用弹窗";
  return "";
}

/**
 * visibleChannelLabels —— 只保留**现行渠道**的中文名。
 *
 * 存量 `wechat` 不进结果 (不显示成可用渠道); DTO 值本身不被修改。
 */
export function visibleChannelLabels(channels: string[] | undefined): string[] {
  if (!Array.isArray(channels)) return [];
  return channels
    .filter((c) => isActiveChannel(c))
    .map((c) => channelLabel(c))
    .filter((label) => label.length > 0);
}

/** 提前量文案 (原型 L2286: offset===0 → 准时, 否则 N 分钟)。 */
export function offsetLabel(offsetMinutes: number | null | undefined): string {
  const n = offsetMinutes ?? 0;
  if (n === 0) return "准时";
  return `提前 ${n} 分钟`;
}

export interface RemindSummary {
  /** 至少有一条 enabled 的提醒 = 开。 */
  on: boolean;
  /** 「提前 15 分钟」/「准时」 */
  offsetText: string;
  /** 渠道中文名列表 */
  channels: string[];
}

/** 提醒摘要 (原型 remindField L2284-2289) —— 只取第一条 (端侧表单只支持一条提醒)。 */
export function remindSummary(reminders: Reminder[] | undefined): RemindSummary {
  const first = reminders && reminders.length ? reminders[0] : null;
  if (!first) return { on: false, offsetText: "不提醒", channels: [] };
  // ⚠️ 件 2: 只显示**现行渠道** (in_app / app_push) —— 存量 `wechat` 不显示成可用渠道。
  const channels = visibleChannelLabels(
    Array.isArray(first.channels) ? first.channels : [],
  );
  return {
    on: first.enabled !== false,
    offsetText: offsetLabel(first.offsetMinutes),
    channels,
  };
}

/**
 * 状态来源 chip (原型 L2277):
 *   statusOverride 非空 → 「状态已单独设置」; 为空 → 「状态继承上级」。
 *
 * ⚠️ 契约口径修正 (Task / Subtask 例外):
 *   契约 §9.5 里 **Task / Subtask 有自己的 status 字段, 不存在继承** (statusOverride
 *   只存在于 Milestone / Schedule)。所以这两种 kind 恒显示「状态已单独设置」——
 *   照抄原型的「statusOverride 为空 → 继承上级」会把没有父级的顶层任务说成「继承上级」, 是错的。
 */
export function statusSourceText(kind: DetailKind, statusOverride: ItemStatus | null | undefined): string {
  if (kind === "task" || kind === "subtask") return "状态已单独设置";
  return statusOverride ? "状态已单独设置" : "状态继承上级";
}

/** 祖先链 (根 → 直接父级) —— 原型 ancestors() L1268-1272。 */
export function collectAncestors(
  node: ScheduleNode,
  tree: ScheduleTreeIndex,
): ScheduleNode[] {
  const out: ScheduleNode[] = [];
  let cur = tree.parentOf(node);
  let guard = 0;
  while (cur && guard < 8) {
    out.unshift(cur);
    cur = tree.parentOf(cur);
    guard += 1;
  }
  return out;
}

/** 节点的 kind (靠 DTO 的父指针字段判定, 跟 schedule-api 的 nodeKindOf 同口径)。 */
export function kindOf(node: ScheduleNode): DetailKind {
  if ("date" in node) return "schedule";
  if ("subtaskId" in node) return "milestone";
  if ("taskId" in node) return "subtask";
  return "task";
}

/** 节点自己的父级 id (没有 = 顶层 / 游离)。 */
export function parentIdOf(node: ScheduleNode): string | null {
  if ("subtaskId" in node) return node.subtaskId;
  if ("taskId" in node) return node.taskId;
  if ("milestoneId" in node) return node.milestoneId ?? null;
  return null;
}

/**
 * 直属子项 (原型 childrenOf L1241-1249):
 *   任务 → 它的子任务 · 子任务 → 它的关键节点 · 关键节点 → 它的日程
 *   日程 → **同级日程** (同一个 milestoneId 下的其它日程; 游离日程没有同级)
 */
export function collectChildren(
  node: ScheduleNode,
  lists: {
    subtasks: ScheduleNode[];
    milestones: ScheduleNode[];
    schedules: ScheduleNode[];
  },
): { kind: DetailKind; node: ScheduleNode }[] {
  const kind = kindOf(node);
  if (kind === "task") {
    return lists.subtasks
      .filter((s) => (s as { taskId?: string }).taskId === node.id)
      .map((n) => ({ kind: "subtask" as DetailKind, node: n }));
  }
  if (kind === "subtask") {
    return lists.milestones
      .filter((m) => (m as { subtaskId?: string }).subtaskId === node.id)
      .map((n) => ({ kind: "milestone" as DetailKind, node: n }));
  }
  if (kind === "milestone") {
    return lists.schedules
      .filter((s) => (s as { milestoneId?: string | null }).milestoneId === node.id)
      .map((n) => ({ kind: "schedule" as DetailKind, node: n }));
  }
  // schedule → 同级日程 (原型 D11: 保留「同级日程」语义)
  const milestoneId = (node as { milestoneId?: string | null }).milestoneId ?? null;
  if (!milestoneId) return [];
  return lists.schedules
    .filter((s) => (s as { milestoneId?: string | null }).milestoneId === milestoneId && s.id !== node.id)
    .map((n) => ({ kind: "schedule" as DetailKind, node: n }));
}

/**
 * 子项右侧的灰色元信息 (原型 childMeta L2253-2256):
 *   日程 → 「10/21 09:30–11:00」; 其余 → 继承链上的有效 DDL。
 */
export function childMeta(
  child: ScheduleNode,
  tree: ScheduleTreeIndex,
  fmtDdl: (iso: string | null) => string,
  fmtWhen: (date: string, start: string, end: string) => string,
): string {
  if ("date" in child) {
    return fmtWhen(child.date, child.startAt, child.endAt);
  }
  return fmtDdl(tree.effectiveDdl(child));
}
