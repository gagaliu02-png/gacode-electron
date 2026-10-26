/**
 * lib/notifications.ts — 站内通知 adapter (PC 端)
 *
 * 1:1 抄 gacode-web/src/lib/notifications.ts 的归一 / 判定 / 跳转目标解析,
 * 按 PC 实际情况做了两处必要偏差 (都有文档依据):
 *   ① scheduleTarget —— PC **没有日程模块** (src/App.tsx 路由表无 /schedule),
 *      照抄 web 的 /schedule/schedule/{id}/ 只会命中 path="*" 被兜回首页
 *      (静默跳走)。按 align-c-profile-notify.md 的 S-12 短期兜底口径,
 *      返回 kind="none" + rawLink → 调用方弹「无法识别的链接」(跟 web 对
 *      认不出的 deep link 同一套处理)。
 *   ② NotificationTarget 不再保留 "schedule" 分支 (PC 没有落点, 留着就是死代码)。
 *
 * ---------------------------------------------------------------------------
 * 后端真源 (别猜, 照着这几处抄)
 * ---------------------------------------------------------------------------
 *   - unified-api/src/modules/notifications/notification.routes.js:343
 *       GET /api/v1/notifications → { ok:true, data:{ notifications:[...], unreadCount } }
 *       ⚠️ notifications 是 **Prisma 原样行** (findMany, 没有 DTO 层) →
 *          字段名 = Prisma 模型名, 其中已读字段是 **`isRead`** (不是 `read`)!
 *   - unified-api/prisma/schema.prisma:580 `model CustomNotification`
 *       id / userId / title / body / actionType / actionValue / isRead /
 *       createdAt / type / payload
 *       ⚠️ id 是 BigInt → unified-api server.js 的全局 serializer 转成**字符串**。
 *   - unified-api/src/modules/schedules/schedules.service.js:1333 (schedule_reminder 落库)
 *       type='schedule_reminder' · actionType='none' · actionValue=null
 *       payload = { scheduleId, reminderId, fireAt }
 *   - unified-api/src/modules/schedules/schedules.service.js:1449 (cron_result 落库)
 *       type='cron_result' · actionType='deep_link'
 *       actionValue = `yinian://chat/${sessionId}`
 *       payload = { cronId, sessionId, ranAt }
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 本文件是**唯一的**通知 adapter —— 类型声明 ≠ 运行时映射
 * ---------------------------------------------------------------------------
 * 旧 PC DTO 写的是 `read?: boolean`, 后端出参却是 `isRead` → 运行时永远 undefined
 * → **已读态从来没渲染出来过**。本文件用 normalizeNotification() 做运行时归一,
 * 列表 / SSE 两条入口共用同一个归一函数。
 */

import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";

/** 后端约定的通知类型 (prisma schema 注释里写明的那两个)。 */
export const NOTIFICATION_TYPE_SCHEDULE_REMINDER = "schedule_reminder";
export const NOTIFICATION_TYPE_CRON_RESULT = "cron_result";

/** 通知类型 (三桶)。`other` = 老数据 / 外部系统推的普通通知 (type 可空)。 */
export type NotificationKind =
  | "schedule_reminder"
  | "cron_result"
  | "other";

/** 通知的结构化载荷 (后端 payload 列, 形状随 type 变)。 */
export interface NotificationPayload {
  /** schedule_reminder: 日程 id。 */
  scheduleId?: string | null;
  /** schedule_reminder: 提醒 id。 */
  reminderId?: string | null;
  /** schedule_reminder: 触发时刻 (ISO)。 */
  fireAt?: string | null;
  /** cron_result: 定时任务 id。 */
  cronId?: string | null;
  /** cron_result: 产出落回的会话 id (== cron.originSessionId)。 */
  sessionId?: string | null;
  /** cron_result: 本轮执行时刻 (ISO)。 */
  ranAt?: string | null;
  [key: string]: unknown;
}

/** PC 端通知 DTO (归一后的形状)。 */
export interface NotificationItem {
  /** 后端 BigInt id → **字符串**。 */
  id: string;
  title: string;
  body?: string;
  /** 后端 type 列 —— null = 普通通知 (老数据)。 */
  type: string | null;
  /** 'url' | 'deep_link' | 'none'。 */
  actionType: string;
  /** URL / deep link 载荷 —— null = 没有。 */
  actionValue: string | null;
  /** 结构化载荷 —— null = 没有。 */
  payload: NotificationPayload | null;
  /** 已读态 —— 后端字段名是 `isRead`, 这里归一后仍叫 `isRead`。 */
  isRead: boolean;
  /** ISO datetime。 */
  createdAt: string;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Object.prototype.toString.call(v) === "[object Object]";
}

/**
 * normalizeNotification —— 后端行 → PC DTO (运行时映射)。
 *
 * 这是**唯一**构造 `NotificationItem` 的地方; 列表 / SSE 两条入口都走它。
 */
export function normalizeNotification(raw: unknown): NotificationItem {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    id: r.id == null ? "" : String(r.id),
    title: typeof r.title === "string" ? r.title : "",
    body: typeof r.body === "string" ? r.body : undefined,
    type: typeof r.type === "string" ? r.type : null,
    actionType: typeof r.actionType === "string" ? r.actionType : "none",
    actionValue: typeof r.actionValue === "string" ? r.actionValue : null,
    payload: isPlainObject(r.payload) ? (r.payload as NotificationPayload) : null,
    // ⚠️ 后端字段名 = isRead。旧 DTO 写的 `read` 永远是 undefined (已读态渲染不出来)。
    isRead: r.isRead === true,
    createdAt:
      typeof r.createdAt === "string" ? r.createdAt : new Date(0).toISOString(),
  };
}

/** 归一整份列表响应。 */
export function normalizeNotificationList(raw: unknown): {
  notifications: NotificationItem[];
  unreadCount: number;
} {
  const r = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(r.notifications) ? r.notifications : [];
  return {
    notifications: list.map(normalizeNotification),
    unreadCount:
      typeof r.unreadCount === "number" && Number.isFinite(r.unreadCount)
        ? r.unreadCount
        : 0,
  };
}

/** 通知归到哪一桶。 */
export function notificationKind(n: {
  type?: string | null;
}): NotificationKind {
  if (n?.type === NOTIFICATION_TYPE_SCHEDULE_REMINDER) return "schedule_reminder";
  if (n?.type === NOTIFICATION_TYPE_CRON_RESULT) return "cron_result";
  return "other";
}

// =========================================================================
// deep link 解析 (跟安卓同一套语义)
// =========================================================================

/** App 内 deep link scheme —— 只有这个 scheme 才走 deep link 解析 (安卓同款)。 */
export const DEEP_LINK_SCHEME = "yinian://";
/** `yinian://chat/{sessionId}` —— 安卓 NotificationDeepLink 的老路径 (必须保持)。 */
export const DEEP_LINK_CHAT_SCHEME = "yinian://chat/";
/** `yinian://schedule/calendar/{scheduleId}?reminderId=&fireAt=` —— 安卓 Worker 3 加的。 */
export const DEEP_LINK_SCHEDULE_SCHEME = "yinian://schedule/calendar/";

/** deep link 解析结果。 */
export type ParsedDeepLink =
  | { kind: "chat"; sessionId: string }
  | {
      kind: "schedule";
      scheduleId: string;
      reminderId: string | null;
      fireAt: string | null;
    }
  | null;

/**
 * parseYinianDeepLink —— 解析后端推的 `yinian://...` deep link。
 *
 * 跟安卓 `NotificationDeepLink.parseDeepLink` 同语义:
 *   - `yinian://chat/{sessionId}`                → chat (sessionId 必填, 空 → null)
 *   - `yinian://schedule/calendar/{scheduleId}`   → schedule (scheduleId 必填)
 *     + query `reminderId` / `fireAt` (均可空, 纯展示用)
 *   - 其它 / 解析不出来                          → null (调用方兜底)
 *
 * ⚠️ **多余路径段一律认不出** (`yinian://chat/1/2`) —— 跟安卓同款防御。
 */
export function parseYinianDeepLink(
  value: string | null | undefined,
): ParsedDeepLink {
  if (typeof value !== "string" || !value) return null;

  if (value.startsWith(DEEP_LINK_CHAT_SCHEME)) {
    const sessionId = value.slice(DEEP_LINK_CHAT_SCHEME.length).trim();
    if (!sessionId) return null; // 空 sessionId → Unknown (跟安卓同款防御)
    // 防 deep link 里带 query (?a=b) —— 会话 id 本身不含 '?'
    const clean = sessionId.split("?")[0];
    // 多余路径段 → 认不出 (跟安卓 NotificationDeepLink 同款防御)
    if (!clean || clean.includes("/")) return null;
    return { kind: "chat", sessionId: clean };
  }

  if (value.startsWith(DEEP_LINK_SCHEDULE_SCHEME)) {
    const rest = value.slice(DEEP_LINK_SCHEDULE_SCHEME.length);
    const [pathPart, queryPart] = rest.split("?");
    const scheduleId = (pathPart ?? "").trim();
    if (!scheduleId) return null;
    // 多余路径段 → 认不出 (跟安卓 NotificationDeepLink 同款防御)
    if (scheduleId.includes("/")) return null;
    let reminderId: string | null = null;
    let fireAt: string | null = null;
    if (queryPart) {
      for (const pair of queryPart.split("&")) {
        if (!pair) continue;
        const eq = pair.indexOf("=");
        const k = eq === -1 ? pair : pair.slice(0, eq);
        const v = eq === -1 ? "" : pair.slice(eq + 1);
        if (k === "reminderId") reminderId = decodeURIComponent(v) || null;
        else if (k === "fireAt") fireAt = decodeURIComponent(v) || null;
      }
    }
    return { kind: "schedule", scheduleId, reminderId, fireAt };
  }

  return null;
}

// =========================================================================
// 跳转目标
// =========================================================================

/** 通知点击后的落点。 */
export type NotificationTarget =
  | {
      kind: "chat";
      sessionId: string;
      /** PC 端会话路由 (跟 App.tsx 路由表 /chat/:id 一致)。 */
      href: string;
    }
  | {
      /** 外部链接 (`actionType='url'`) —— 开新窗口, 不走站内路由。 */
      kind: "url";
      url: string;
      href: null;
    }
  | {
      kind: "none";
      href: null;
      /** 认不出的链接原文 —— 调用方据此提示用户。 */
      rawLink?: string | null;
    };

/**
 * scheduleTarget —— 日程详情落点。
 *
 * ⚠️ **PC 端没有日程模块** (`src/App.tsx` 路由表里没有 `/schedule`)。
 *   照抄 web 的 `/schedule/schedule/{id}/` 只会命中 `path="*"` 被兜回首页
 *   —— 静默跳走, 用户以为没生效。按文档 S-12 的短期兜底口径: 返回
 *   `kind="none"` + `rawLink`, 由调用方弹「无法识别的链接」提示。
 *   (另立需求给 PC 补日程模块后, 这里再换成真路由。)
 */
export function scheduleTarget(
  scheduleId: string,
  reminderId?: string | null,
  fireAt?: string | null,
): NotificationTarget {
  const id = String(scheduleId ?? "").trim();
  if (!id) return { kind: "none", href: null };
  const params = new URLSearchParams();
  if (reminderId) params.set("reminderId", String(reminderId));
  if (fireAt) params.set("fireAt", String(fireAt));
  const qs = params.toString();
  return {
    kind: "none",
    href: null,
    rawLink: `${DEEP_LINK_SCHEDULE_SCHEME}${encodeURIComponent(id)}${
      qs ? `?${qs}` : ""
    }`,
  };
}

/** chatTarget —— 会话落点 (PC 端路由: `/chat/{sessionId}`)。 */
export function chatTarget(sessionId: string): NotificationTarget {
  const id = String(sessionId ?? "").trim();
  if (!id) return { kind: "none", href: null };
  return {
    kind: "chat",
    sessionId: id,
    href: `/chat/${encodeURIComponent(id)}`,
  };
}

/**
 * notificationTarget — 算一条通知点击后的落点。
 *
 * 判定顺序 (跟安卓 `NotificationPresentation.resolveTarget` 同优先级):
 *   ① `actionType='url'`          → **外链** (开新窗口)
 *   ② `actionValue` 是 `yinian://` deep link → 会话 / 日程详情
 *   ③ `type='schedule_reminder'` → payload.scheduleId → 日程 (PC 无落点)
 *   ④ `type='cron_result'` → payload.sessionId / payload.originSessionId → 会话
 *   ⑤ 其它 → 没有落点 (只标已读)
 *
 * ⚠️ 认不出的 `yinian://` 链接 → `kind='none'` + `rawLink` (调用方提示用户),
 *    跟安卓 `Target.None(rawLink)` → snackbar「无法识别的链接」同款。
 */
export function notificationTarget(n: NotificationItem): NotificationTarget {
  const actionValue =
    typeof n?.actionValue === "string" && n.actionValue.trim()
      ? n.actionValue.trim()
      : null;

  // ① actionType='url' → 外链 (安卓的第一优先级; 后端 validateNotification 允许)
  if (n?.actionType === "url") {
    if (actionValue && isSafeExternalUrl(actionValue)) {
      return { kind: "url", url: actionValue, href: null };
    }
    // 非 http(s) / 解析不了的 → 不开 (防 javascript: 之类的伪协议)
    return { kind: "none", href: null, rawLink: actionValue };
  }

  // ② deep link
  const link = parseYinianDeepLink(actionValue);
  if (link?.kind === "chat") return chatTarget(link.sessionId);
  if (link?.kind === "schedule") {
    const payload = n?.payload ?? null;
    return scheduleTarget(
      link.scheduleId,
      link.reminderId ?? payload?.reminderId,
      link.fireAt ?? payload?.fireAt,
    );
  }
  if (actionValue && actionValue.startsWith(DEEP_LINK_SCHEME)) {
    // 认不出的 yinian:// 链接 → 带上原文 (调用方提示「无法识别的链接」)
    return { kind: "none", href: null, rawLink: actionValue };
  }

  const kind = notificationKind(n);
  const payload = n?.payload ?? null;

  if (kind === "schedule_reminder") {
    const scheduleId = payload?.scheduleId;
    if (scheduleId) {
      return scheduleTarget(scheduleId, payload?.reminderId, payload?.fireAt);
    }
    return { kind: "none", href: null };
  }

  if (kind === "cron_result") {
    // 后端 payload 里叫 sessionId (= cron.originSessionId);
    // 老数据 / 其它来源可能叫 originSessionId —— 两个都认。
    const sessionId = payload?.sessionId ?? payload?.originSessionId;
    if (sessionId) return chatTarget(String(sessionId));
    return { kind: "none", href: null };
  }

  return { kind: "none", href: null };
}

/**
 * isSafeExternalUrl —— 只放行 http / https。
 *
 * ⚠️ 后端 `validateNotification` 对 `actionType='url'` 只校验「能被 new URL 解析」,
 *    `javascript:` / `data:` 也算合法 URL —— 直接 window.open 会变成 XSS 通道。
 *    PC 端自己兜住。
 */
export function isSafeExternalUrl(url: string): boolean {
  if (typeof url !== "string" || !url.trim()) return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * openExternalNotificationUrl —— 外链落点开新窗口。
 * 返回是否真的打开了 (false = 被安全策略拦掉, 调用方可以提示一句)。
 */
export function openExternalNotificationUrl(url: string): boolean {
  if (!isSafeExternalUrl(url)) return false;
  if (typeof window === "undefined") return false;
  try {
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}

// =========================================================================
// 按 type 渲染
// =========================================================================

/** 渲染用的图标 key (页面里映射到手写 SVG 图标)。 */
export type NotificationIconKey = "calendar" | "cron" | "bell";

/** 渲染用的展示信息 —— 文案 / 图标 / 分组都按 type 走。 */
export interface NotificationPresentation {
  kind: NotificationKind;
  /** 类型标签 (角标)。 */
  label: string;
  /** 图标 key。 */
  icon: NotificationIconKey;
  /** 分组标题。 */
  group: string;
  /** 空 body 时的占位文案。 */
  emptyBody: string;
}

/** 按 type 算展示信息。 */
export function notificationPresentation(n: {
  type?: string | null;
}): NotificationPresentation {
  const kind = notificationKind(n);
  switch (kind) {
    case "schedule_reminder":
      return {
        kind,
        label: "日程提醒",
        icon: "calendar",
        group: "日程提醒",
        emptyBody: "日程到点了",
      };
    case "cron_result":
      return {
        kind,
        label: "定时任务产出",
        icon: "cron",
        group: "定时任务产出",
        emptyBody: "定时任务已产出结果",
      };
    default:
      return {
        kind: "other",
        label: "通知",
        icon: "bell",
        group: "其它通知",
        emptyBody: "你有一条新通知",
      };
  }
}

/** 分组展示的顺序 (日程提醒 → 定时任务产出 → 其它)。 */
export const NOTIFICATION_GROUP_ORDER: NotificationKind[] = [
  "schedule_reminder",
  "cron_result",
  "other",
];

// =========================================================================
// 通知摘要 (跟安卓 NotificationPresentation.summaryOf 同口径)
// =========================================================================

/** payload 取字符串字段 (空白当没有) —— 安卓 `payloadString` 同款。 */
function payloadString(
  payload: NotificationPayload | null | undefined,
  key: string,
): string | null {
  const v = payload?.[key];
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * notificationSummary —— 通知正文摘要。
 *
 * 优先级 (跟安卓 `NotificationPresentation.summaryOf` 同口径):
 *   ① 服务端给了 body → 用 body
 *   ② `cron_result` → 从 payload 兜 "定时任务 {cronId} · {ranAt}"
 *      (cronId / ranAt 只有一个在也能出文案)
 *   ③ 按 kind 给占位文案 —— 日程到点了 / 定时任务已产出结果 / 你有一条新通知
 *
 * ⚠️ 以前 PC 只渲染 `notification.body`, body 为空时**整行都不显示** ——
 *    服务端日程没写备注 (body=null) 时 PC 上就是「光秃秃一条通知」。
 */
export function notificationSummary(n: NotificationItem): string {
  const body = typeof n?.body === "string" ? n.body.trim() : "";
  if (body) return body;

  const kind = notificationKind(n);
  const payload = n?.payload ?? null;
  if (kind === "cron_result") {
    const cronId = payloadString(payload, "cronId");
    const ranAt = payloadString(payload, "ranAt");
    if (cronId && ranAt) return `定时任务 ${cronId} · ${ranAt}`;
    if (cronId) return `定时任务 ${cronId}`;
    if (ranAt) return `执行于 ${ranAt}`;
  }
  return notificationPresentation(n).emptyBody;
}

// =========================================================================
// 角标 / 轮询 / 相对时间
// =========================================================================

/**
 * formatUnreadBadge —— 未读角标文案, **99+ 封顶**。
 *
 * 对齐 gacode-web/src/lib/notifications.ts:495-498 (web 端两处角标共用).
 */
export function formatUnreadBadge(count: number): string {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  return n > 99 ? "99+" : String(n);
}

/**
 * NOTIFICATION_POLL_MS —— 通知列表轮询兜底间隔 (45s)。
 * 对齐 gacode-web/src/lib/notification-stream.ts:39。
 */
export const NOTIFICATION_POLL_MS = 45_000;

/**
 * formatRelativeTime —— 相对时间文案。
 *
 * 对齐 web 的 `formatDistanceToNow(new Date(createdAt), { addSuffix: true, locale: zhCN })`
 * (gacode-web/src/app/(main)/notifications/page.tsx:358-361)。
 * PC 仓已装 date-fns ^4.4.0 —— web 是 v3.6.0, 两版 zhCN 的字符串与取整逻辑
 * (Math.round) 完全相同 ⇒ 渲染出来的中文文案逐字一致。
 */
export function formatRelativeTime(iso: string): string {
  if (!iso) return "-";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "-";
  return formatDistanceToNow(new Date(t), { addSuffix: true, locale: zhCN });
}
