/**
 * lib/turn-started.ts — 「服务端起轮了」的**端内广播**（契约订正 30 · 观众侧）
 *
 * ---------------------------------------------------------------------------
 * 为什么需要这个文件
 * ---------------------------------------------------------------------------
 *   `NotificationSSEBridge` 是**全局挂载**的（`src/App.tsx:117`）⇒ 它收到
 *   `turn_started` 帧的时候，**并不知道哪个会话页正在看** ⇒ 需要一条
 *   **按 sessionId 派给对应 chat 页**的通道（契约 §2.2）。
 *
 *   web 那边用 zustand；**PC 端没有装 zustand**，但本仓**已经有**一条现成的
 *   跨组件通道惯例 —— `window` 自定义事件：
 *
 *     · `src/lib/api.ts:128`          `gacode:auth-refreshed`
 *     · `src/lib/api.ts:218` / `:234` `gacode:auth-cleared`
 *     · `src/lib/api.ts:1162`         `gacode:notification-prefs-changed`
 *     · `src/lib/auth-refresh.ts:76`  `gacode:auth-refreshed`
 *     · `src/lib/schedule-http.ts:157` `gacode:auth-cleared`
 *
 *   ⇒ **沿用现成的**，不另造一套事件总线、也不引新依赖。
 *
 * ---------------------------------------------------------------------------
 * 契约铁律（订正 30 §1.2 / §4）—— 本文件**只搬运**，不许做下面这些
 * ---------------------------------------------------------------------------
 *   ⛔ **端侧不再起轮** —— 服务端已经起好了；端侧再发一次 chat/stream = 两个轮次
 *      = 双份。本文件**只广播**，不发任何请求。
 *   ⛔ **端侧不插本地气泡** —— 服务端已经写了 user 行（metadata 带 inbox_id）；
 *      端侧本地再插一条 ⇒ 刷新后重复。
 *   ⛔ **端侧不碰报告正文** —— 端侧从头到尾只传 id。
 *   ⛔ **新 type 不得复用 `work_unit_result`** —— 旧端会把它理解成「起轮指令」
 *      ⇒ 旧端会起轮 ⇒ 双份。
 *
 * ---------------------------------------------------------------------------
 * 用法
 * ---------------------------------------------------------------------------
 *   // 生产者（全局的通知流桥）:
 *   dispatchTurnStarted(info);
 *
 *   // 消费者（会话页 ChatDetail）:
 *   const off = subscribeTurnStarted((info) => {
 *     if (info.sessionId !== chatId) return;  // 不是我这个会话 ⇒ 不管
 *     // …自动 attach
 *   });
 *   return off;
 */

import type { TurnStartedInfo } from "./notifications-sse";

/**
 * 广播用的 window 事件名 —— 沿用本仓既有的 `gacode:*` 惯例。
 *
 * ⚠️ 与别的 `gacode:*` 事件**不同名** ⇒ 不会跟已有的监听器串台。
 */
export const TURN_STARTED_EVENT = "gacode:turn-started";

/**
 * dispatchTurnStarted — 广播「服务端起轮了」。
 *
 * ⚠️ 只**广播载荷**（id + sessionId）—— ⛔ 不带报告正文、⛔ 不发任何请求。
 */
export function dispatchTurnStarted(info: TurnStartedInfo): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<TurnStartedInfo>(TURN_STARTED_EVENT, { detail: info }),
  );
}

/**
 * subscribeTurnStarted — 订阅「服务端起轮了」。
 *
 * @param handler 收到载荷时的回调（**按 sessionId 自行过滤** —— 广播是全局的）
 * @returns 退订函数（useEffect 的 cleanup 直接返回它）
 */
export function subscribeTurnStarted(
  handler: (info: TurnStartedInfo) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const onEvent = (e: Event) => {
    const detail = (e as CustomEvent<TurnStartedInfo>).detail;
    if (!detail) return;
    try {
      handler(detail);
    } catch (err) {
      // ⛔ 一个订阅者抛异常**不许**影响别的订阅者（也不许把通知流带崩）。
      console.warn("[turn-started] 订阅回调抛异常 (忽略)", err);
    }
  };
  window.addEventListener(TURN_STARTED_EVENT, onEvent);
  return () => window.removeEventListener(TURN_STARTED_EVENT, onEvent);
}
