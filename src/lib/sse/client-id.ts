// =========================================================================
// client-id —— 端标识 + 聊天流请求头构造 (契约 L-28 / D3 / L-30)
// ---------------------------------------------------------------------------
// 为什么有这个文件
// ---------------------------------------------------------------------------
//   契约 L-28 / D3 规定了三端的端标识取值: `web` / `pc` / `android`。
//   服务端 `readClientId` (unified-api `yinian.chat.routes.js:396`) 读
//   `x-client-id` 头, 取不到 ⇒ 回落 `'unknown'`。
//
//   2026-10-31 实测: **聊天流的三条路 (发起 / 续传 / attach) 全都没带这个头**
//   ⇒ 服务端日志里的 `clientId` 恒为 `unknown` ⇒ 跨端排查没有抓手
//   (「这轮是谁发起的、谁接回来的」答不出来)。
//   ⇒ 本文件把「端标识」与「三条路的请求头构造」收到**一处真值**。
//
// ---------------------------------------------------------------------------
// ⚠️ 契约 L-28 的硬约束 (不许违反)
// ---------------------------------------------------------------------------
//   「端标识**只**用于日志与真值记账, ⛔ **绝不**参与鉴权或分支判断」
//   ⇒ 本文件里的 `clientId` **只**影响一个请求头, 不影响任何业务分支。
//   ⇒ 服务端对取不到的头已经回落 `'unknown'` ⇒ 加头是**纯增量**。
//
// ---------------------------------------------------------------------------
// ⛔ 本文件**不许** import window / fetch / js-cookie —— PC 要抄这份定稿。
// ⛔ 本文件与 `gacode-electron/src/lib/sse/client-id.ts` 必须**逐字节相同**
//    (RC-W20 那类 md5 断言钉的就是这件事)。
// =========================================================================

/** 端标识头 (D3 / L-28 / L-30) —— **纯可选**, 只用于日志与统计。 */
export const CLIENT_ID_HEADER = "X-Client-Id";

/** web 端的端标识值 (D3)。 */
export const CLIENT_ID_WEB = "web";
/** PC 端的端标识值 (D3)。 */
export const CLIENT_ID_PC = "pc";
/** 安卓端的端标识值 (D3)。 */
export const CLIENT_ID_ANDROID = "android";

/** 端标识的取值域 (契约 L-28 / D3)。 */
export type ClientId =
  | typeof CLIENT_ID_WEB
  | typeof CLIENT_ID_PC
  | typeof CLIENT_ID_ANDROID;

/**
 * 聊天流的三条路 (派工单 RC-13 的「三条路」):
 *
 *   · `start`  —— **发起**一轮新的对话 (body 带 message ⇒ 服务端建新轮次)
 *   · `resume` —— **续传**自己那一轮 (空 body + `Last-Event-ID` / `X-Resume-Turn`)
 *   · `attach` —— **只读接入**别人正在跑的那一轮 (空 body ⇒ 不建轮次)
 */
export type ChatStreamPath = "start" | "resume" | "attach";

/** 构造聊天流请求头的入参。 */
export interface ChatStreamHeaderOptions {
  /** 走哪条路 (决定要不要带 `Content-Type`, 见契约 L-36)。 */
  path: ChatStreamPath;
  /** 本端的端标识 (恒带 `X-Client-Id`)。 */
  clientId: ClientId;
  /** 登录态 —— 有才带 `Authorization`。 */
  authorization?: string | null;
  /** `Accept` 头 (SSE 流一般要 `text/event-stream`)。 */
  accept?: string | null;
  /** 续传头 (`Last-Event-ID` / `X-Resume-Turn`) —— 只在 resume / attach 两条路有。 */
  resumeHeaders?: Record<string, string> | null;
  /**
   * 端侧能力声明 (契约附录 **订正 24 §3**) —— **可选**。
   *
   * ⚠️ 只有 PC 端会传 (它真的能执行 `pc_*`); web / 安卓**不传** ⇒
   *    服务端不下发 `pc_*` ⇒ 老端行为**逐字不变** (L-24e)。
   */
  clientCapabilities?: string | null;
}

/**
 * buildChatStreamHeaders —— 聊天流三条路**共用**的请求头构造 (RC-13)。
 *
 * 不变式 (**三条路恒成立**, 这是 RC-W24 钉的那条):
 *
 *   1. **恒带** `X-Client-Id: <端标识>` ⇒ 服务端日志里的 `clientId` 不再是
 *      `unknown` ⇒ 跨端排查有抓手。
 *   2. **只有 `start` 路带 `Content-Type`** —— 续传 / attach 的 body 必须留空
 *      (契约 L-36: body 带内容会被服务端当成「建新轮次」⇒ 重复提问 ⇒ 双 LLM)。
 *   3. 续传头 (`Last-Event-ID` / `X-Resume-Turn`) 只在 resume / attach 两条路带上
 *      —— 发起路带它没有意义, 而且带上会让服务端误判成续传。
 *
 * ⚠️ 本函数**只拼头**, 不发请求、不判任何业务分支 (契约 L-28)。
 */
export function buildChatStreamHeaders(
  opts: ChatStreamHeaderOptions
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (opts.accept) headers["Accept"] = opts.accept;
  // ⚠️ 只有「发起」路带 Content-Type (契约 L-36) —— 续传 / attach 的 body 留空。
  if (opts.path === "start") headers["Content-Type"] = "application/json";
  if (opts.authorization) headers["Authorization"] = `Bearer ${opts.authorization}`;
  if (opts.resumeHeaders) {
    for (const key of Object.keys(opts.resumeHeaders)) {
      headers[key] = opts.resumeHeaders[key];
    }
  }
  // ★ 三条路**恒带**端标识 (契约 L-28 / D3)。
  headers[CLIENT_ID_HEADER] = opts.clientId;
  // ★ 端侧能力声明 (契约附录 订正 24 §3) —— **缺失即「该端没有端侧能力」**
  //   ⇒ 服务端**不下发** `pc_*` 工具 ⇒ 老端行为逐字不变 (L-24e)。
  if (opts.clientCapabilities) headers["X-Client-Capabilities"] = opts.clientCapabilities;
  return headers;
}
