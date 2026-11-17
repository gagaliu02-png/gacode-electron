/**
 * lib/session-events.ts —— 服务端「消息去向」+「会话级 ack」的**唯一判据**
 *
 * ---------------------------------------------------------------------------
 * ## 为什么单独一个文件（零运行时 import）
 *
 *   P2 上行线有两个契约字段要端侧读：
 *     · `disposition` —— 「这条消息去了哪」（202 进队列 / 200 起了新轮）；
 *     · `user_message_processed` —— 「那条排队消息已经被处理了」（双发 ack 的第二次告知）。
 *
 *   这两个判据**必须**住在**一个零依赖模块**里：
 *     · `lib/chat-sse.ts` 被既有断言按「固定依赖链」加载 ⇒ **不许**在那里加运行时 import
 *       （多一个运行时依赖就多一处 ERR_MODULE_NOT_FOUND）；
 *     · 判据只有一份（G-3）⇒ 页面 / api 层 / 测试都读它 ⇒ 不许各写各的。
 *
 *   ⚠️ 本文件**不许** import React / api / 任何有副作用的模块 ⇒ `node --test` 能直接跑。
 *
 * ---------------------------------------------------------------------------
 * ## 契约（服务端 unified-api `yinian.chat.routes.js` / `session-events.js`，均已上线）
 *
 *   ① `disposition`（应答体顶层字段）：
 *        202 `{ok:true, queued:true, disposition:'queued', eventId:'inbox_<id>',
 *             acceptedAt:'<ISO>', inboxId, seq, content, attachments}`
 *        200 `{ok:true, sessionId, turnKey, terminalReason, disposition:'started'}`
 *      ⚠️ **只有 none 模式的 JSON 应答**才带 `disposition` ⇒ 老的「200 + SSE 流」那条路
 *        **没有 body** ⇒ 那一路只能按「200 SSE = 服务端建了轮」**事实推断**为 `started`。
 *      ⚠️ 老服务端**没有**这个字段 ⇒ 读不到 ⇒ 落回老判据（逐字兼容）。
 *
 *   ② ack 帧（下行 · 该会话的**全部** socket：发起流 / 续传 / 只读接入 / 常驻订阅）：
 *        data: {"events":[{"type":"user_message_processed","inboxId":"123","processedAt":"…"}]}
 *      · `events` 在**帧的顶层**（⛔ 不是 `rich_event` 事件里）—— 认错地方就收不到；
 *      · `type` 是**新值** ⇒ 老端会**逐条跳过**它（不崩）⇒ 端侧必须**显式消费**；
 *      · 帧**不带 `id:` 行** ⇒ 不推进游标（现有语义已对，别去改）。
 * ==========================================================================
 */

/** 服务端给的「这条消息去了哪」。 */
export type ChatDisposition = "queued" | "started";

/**
 * readDisposition —— 从一个对象（应答体）里读 `disposition`。
 *
 * ⚠️ **读不到就返回 null**（老服务端没有这个字段）⇒ 调用方落回老判据。
 * ⚠️ 只认这两个值 —— 其它值当没给（不猜、不编）。
 *
 * @param source 应答体（顶层对象；服务端**不**把它裹在 `data` 里）。
 */
export function readDisposition(source: unknown): ChatDisposition | null {
  if (!source || typeof source !== "object") return null;
  const raw = (source as { disposition?: unknown }).disposition;
  return raw === "queued" || raw === "started" ? raw : null;
}

/**
 * ★ 双发 ack 的「第二次告知」事件。
 *
 *   帧形状（**顶层** `events[]` 里的一条，⛔ 不是 `rich_event`）：
 *     data: {"events":[{"type":"user_message_processed","inboxId":"123","processedAt":"…"}]}
 */
export interface UserMessageProcessedEvent {
  type: "user_message_processed";
  /** 收件箱那一行的 id（**不透明字符串** —— 服务端是 bigint，走 JSON number 会丢精度）。 */
  inboxId: string;
  /** 服务端处理完的时刻（ISO）；没有 ⇒ null。 */
  processedAt: string | null;
}

/**
 * readUserMessageProcessed —— 从一帧里读出「这条队列项已被处理」的 ack 事件。
 *
 * ⚠️ `events` 在**帧的顶层**（⛔ 不是 `rich_event` 事件里）—— 认错地方就收不到。
 * ⚠️ 这一帧会被 `normalizeChatChunk` 的「未知 type 跳过」规则**丢掉**
 *   （`user_message_processed` 不是富事件）⇒ **必须在归一之前读**。
 * ⚠️ 一帧里最多一条 ⇒ 命中就返回。
 *
 * @returns 命中的那一条；没有 ⇒ null。
 */
export function readUserMessageProcessed(
  payload: unknown,
): UserMessageProcessedEvent | null {
  if (!payload || typeof payload !== "object") return null;
  const events = (payload as { events?: unknown }).events;
  if (!Array.isArray(events)) return null;
  for (const ev of events) {
    if (!ev || typeof ev !== "object") continue;
    const o = ev as Record<string, unknown>;
    if (o.type !== "user_message_processed") continue;
    // ⚠️ inboxId 一律当**不透明字符串**（服务端是 bigint，JSON number 会丢精度）。
    const rawId = o.inboxId;
    const inboxId =
      typeof rawId === "string"
        ? rawId.trim()
        : typeof rawId === "number" && Number.isFinite(rawId)
          ? String(rawId)
          : "";
    if (!inboxId) continue;
    return {
      type: "user_message_processed",
      inboxId,
      processedAt: typeof o.processedAt === "string" ? o.processedAt : null,
    };
  }
  return null;
}
