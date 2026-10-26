/**
 * lib/chat-notifications.ts — 「AI 回复到达」的系统通知（C4-08）
 *
 * ## 背景
 *
 * web 有这个能力，PC 缺（`docs/align-c-profile-notify.md` C4-08）：
 * AI 回复完成时，若窗口不在前台 → 弹一条系统通知提醒用户。
 *
 * web 的实现挂在全局 `WebNotificationWatcher` 上，订阅 store 里每条 assistant
 * message 的 `finishedAt` 从 null 变非 null（`gacode-web/src/lib/webNotifications.ts:278-333`）。
 *
 * ## PC 的等价实现
 *
 * PC 的聊天流是**按路由**跑的（`routes/ChatDetail.tsx`），没有全局 store，
 * 但**有等价的终态信号**：`src/lib/cancel.ts:85-87` 的
 * `isTerminalDone(chunk)` = `chunk.done === true && chunk.messageId != null`
 * （由 `src/lib/sse.ts:210` / `:223` 分发）⇒ 轮次终态帧。
 *
 * 所以 PC 不需要事件总线 —— 终态帧到达时**就地**调本模块即可。
 *
 * ## 触发条件（4 条全中才弹）
 *
 *   1. 收到轮次终态帧（`isTerminalDone`）—— 不是取消帧、不是 error 帧
 *      （用户按停止 ⇒ 产出丢弃 ⇒ 不通知，见 gaga「打断 = 彻底丢弃产出」口径）
 *   2. 本轮是 **AI 回复**（assistant 轮次）
 *   3. **窗口不在前台** —— 主进程算 `!isMinimized() && isFocused()`
 *      （`electron/main.ts` 的 `gacode:is-focused`），**不用** renderer 的
 *      `document.hidden`（Electron 窗口最小化时 visibilityState 仍可能是 visible）
 *   4. preload 桥存在（`window.gacode`）
 *
 * ## 通知正文（跟 web 同口径）
 *
 *   body = AI 回复正文 → 剥 `<thinking>…</thinking>` → trim
 *          → 空则退回最后一条思考 `(思考) {text}`
 *          → 还空则「AI 回复了您」
 *          → 截断 100 字
 *   title = 会话标题（取不到 → 「新对话」）
 *
 * 最终正文再走一次 PC 端唯一的通知文案口径 `notificationSummary()`
 * （`lib/notifications.ts`）—— 与站内通知列表同源。
 *
 * ## IPC 暴露面
 *
 * ⚠️ **本模块不新增任何 IPC 通道** —— 复用仓里既有的两条 contextBridge：
 *
 *   - `window.gacode.isWindowFocused()` → `ipcMain.handle('gacode:is-focused')`
 *     （主进程只读布尔，C4-09 已落地）
 *   - `window.gacode.notificationSSESend({title, body, target})`
 *     → `ipcRenderer.send('gacode:notification-sse-event')`
 *     （主进程弹 Windows Toast + 挂 `n.on('click')` 恢复窗口 / 跳落点，C4-11 已落地）
 *
 * 点击行为：主进程 `attachClick` → ① 关闭通知 ② restore + show + focus
 * ③ target 是站内 path（`/chat/{id}`）⇒ 推 `gacode:notification-clicked`
 * 给 renderer → `App.tsx` 挂的 `NotificationSSEBridge` 跳 React Router 路由。
 */

import { notificationSummary, type NotificationItem } from "./notifications";

/** 会话标题兜底（跟 web `chatTitle || "新对话"` 同款）。 */
export const CHAT_NOTIFICATION_TITLE_FALLBACK = "新对话";

/** 正文兜底（web `bodyPreview || "AI 回复了您"`）。 */
export const CHAT_NOTIFICATION_BODY_FALLBACK = "AI 回复了您";

/** 正文最大长度（web `showChatNotification` 的 `.slice(0, 100)`）。 */
export const CHAT_NOTIFICATION_BODY_MAX = 100;

/** 思考 / 工具阶段（只要 thinking 的 text，够用即可）。 */
export interface ChatTerminalPhase {
  type: "thinking" | "tool";
  text?: string;
}

export interface ChatTerminalInfo {
  /** 会话 id（server 主键，字符串）。 */
  chatId: string;
  /** 会话标题（取不到 → 「新对话」）。 */
  chatTitle?: string | null;
  /** AI 回复正文（终态帧的 fullContent / 累积正文）。 */
  content?: string | null;
  /** 思考 / 工具阶段（正文被剥光时用最后一条思考兜底）。 */
  phases?: ChatTerminalPhase[];
}

/**
 * 剥掉 `<thinking>…</thinking>` —— PC 的思考已经走 `phases[]`，
 * 正文里理论上不该再有 thinking 标签；但历史消息可能有残留。
 */
function stripThinkingTags(content: string): string {
  return content.replace(/<thinking>[\s\S]*?<\/thinking>/g, "").trim();
}

/**
 * 构造通知正文（纯函数，可单测）。
 *
 * 跟 web `WebNotificationWatcher.tsx:74-87` 同款：
 * 剥 thinking → 空则退回 `(思考) {最后一条思考}` → 还空则「AI 回复了您」→ 截断 100 字。
 */
export function buildChatNotificationBody(info: ChatTerminalInfo): string {
  let body = stripThinkingTags(info.content ?? "");

  if (!body && info.phases && info.phases.length > 0) {
    const lastThink = [...info.phases]
      .reverse()
      .find((p) => p.type === "thinking" && p.text);
    if (lastThink?.text) body = `(思考) ${lastThink.text}`;
  }

  const preview = (body || CHAT_NOTIFICATION_BODY_FALLBACK).slice(
    0,
    CHAT_NOTIFICATION_BODY_MAX,
  );

  // 走 PC 端唯一的通知文案口径（lib/notifications.ts）——
  // 与站内通知列表 / 系统通知同源，不另起一套摘要规则。
  const synthetic: NotificationItem = {
    id: `chat-${info.chatId}`,
    title: info.chatTitle || CHAT_NOTIFICATION_TITLE_FALLBACK,
    body: preview,
    type: null,
    actionType: "none",
    actionValue: null,
    payload: null,
    isRead: false,
    createdAt: new Date().toISOString(),
  };
  return notificationSummary(synthetic);
}

/**
 * 「AI 回复到达」→ 弹系统通知（**仅窗口不在前台时**）。
 *
 * 返回 true = 已把通知推给主进程；false = 没弹（在前台 / 桥不存在 / 拿不到前台状态）。
 *
 * ⚠️ 拿不到前台状态时**保守不弹** —— 宁可少弹，不要在用户正看着窗口时弹一条。
 */
export async function notifyAiReplyArrived(
  info: ChatTerminalInfo,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const bridge = window.gacode;
  if (!bridge) return false;

  let focused = true;
  try {
    focused = await bridge.isWindowFocused();
  } catch (err) {
    console.warn(
      "[gacode-chat-notify] isWindowFocused failed, skip notification:",
      err,
    );
    return false;
  }
  if (focused) return false;

  const title = info.chatTitle || CHAT_NOTIFICATION_TITLE_FALLBACK;
  const body = buildChatNotificationBody(info);
  const target = `/chat/${encodeURIComponent(info.chatId)}`;

  try {
    // 复用既有通道（renderer → 主进程弹 Windows Toast + 点击跳落点）
    bridge.notificationSSESend({ title, body, target });
  } catch (err) {
    console.warn("[gacode-chat-notify] notificationSSESend failed:", err);
    return false;
  }
  console.log(
    `[gacode-chat-notify] AI reply arrived -> Toast: title="${title}" target="${target}"`,
  );
  return true;
}