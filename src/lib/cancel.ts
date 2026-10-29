/**
 * lib/cancel.ts — 阶段 2 取消语义 (一念之间 chat SSE)
 *
 * 严格对齐 gacode-web `src/lib/api.ts:654-692` 的契约:
 *
 *   1. `done: true` 有两类字节, 必须按 messageId/cancelled 区分:
 *      - 中途哨兵 `{done:true}`: gaclaw 每结束一个工具调用转发一次, 后面还有正文
 *      - 轮次终态 `{done, fullContent, route, messageId, emptyReply}`: 落库后发
 *      - 取消帧   `{done:true, cancelled:true, route}`: 被服务端中止
 *
 *      判据:
 *        isTerminalDone() = done && messageId != null
 *        isCancelFrame()  = done && cancelled === true
 *      两个判据必须分开, 单一 `done` 早退会丢中间正文 (unified-api:949/1085)。
 *
 *   2. `DELETE /yinian/chat/cancel/:id` 有两种 intent, 字节完全相同,
 *      只能靠 intent 标记区分 (服务端按单 channel.connections.js classifyCancelIntent):
 *      - ACK_DONE   — 收尾 ACK, 语义"这轮完了", **不该武装取消**
 *      - USER_STOP  — 用户按停止, 语义"取消正在跑的这一轮"
 *      携带方式: query `?intent=` **+** header `x-gaclaw-cancel-intent:`
 *      (两端都读, 顺序不同, 双带才是真稳)。
 *
 *   3. 大整数 id 走字符串 (后端 JSON number 会丢精度)。
 *
 *   4. 这两条路径共用下面 sendCancelDelete() **一个构造点**,
 *      结构上不可能漏带 (对齐 Android CancelDeleteSender.requestFor)。
 *
 * 失败处理: ACK_DONE 静默, USER_STOP 警告日志 (漏发 = 界面骗用户说停, 服务端还在烧 token)。
 */

/**
 * 富事件判别联合 (契约 §2) —— 与 web 定稿版 `gacode-web/src/lib/api.ts` 的
 * ChatChunk 同款。⛔ 编译期擦除 (`import type`), 不给本文件引运行时依赖。
 */
import type { RichEventBase } from "./rich-events";

const API_BASE = "https://www.gaga.sale/api/v1";

/**
 * 双带 intent — query **和** header 都带,
 * call site 拿不到任何"哪个端读得到哪个"的玄学解释权。
 */
export type CancelIntent = "ACK_DONE" | "USER_STOP";

/**
 * 鉴权 accessor — api.ts 持有 in-memory accessToken,
 * 这里只读不写, 跟 auth 模块解耦避免循环 import。
 * AuthProvider 在 mount 时 registerCancelAuthAccessors() 注入 getter.
 */
type AuthGetter = () => { token: string | null };

let getAuthSnapshot: AuthGetter = () => ({ token: null });

export function registerCancelAuthAccessors(getter: AuthGetter): void {
  getAuthSnapshot = getter;
}

/**
 * SSE chunk 形态 — 与 gacode-web/api.ts ChatChunk 对齐, 自实现以便 renderer 不引 lib
 *  (纯结构性 interface, 不照搬代码)。
 *
 * ⚠️ 2026-10-28 · 任务书 04 —— `event` / `events` 的元素类型从
 *   `Record<string, unknown>` 换成契约的判别联合 `RichEventBase`
 *   (web 定稿版 `gacode-web/src/lib/api.ts` 的 ChatChunk 就是这个类型)。
 *   换来的是: 归一层 (`lib/rich-events.ts`) 产出的事件**直接**流到 UI,
 *   中间不需要任何 `as Record<string, unknown>` 强转;
 *   且 UI 层按 `type` 收窄时能拿到**编译期**的字段名检查 (契约 §14.4 W7)。
 */
export interface ChatChunk {
  /** 增量正文 */
  content?: string;
  /** 思考链 */
  reasoning?: string;
  /** 单个 rich_event (tool_start / file / image / approval_request 等) */
  event?: RichEventBase;
  /** 累积 rich_event 数组 */
  events?: RichEventBase[];
  /** 流结束哨兵 — 注意: 一轮里会来不止一次, 必须看 messageId/cancelled */
  done?: boolean;
  /** 错误 */
  error?: string;
  /** 轮次终态/取消帧: 走的路由 (gawen | gawen-fast) */
  route?: string;
  /** 轮次终态: server 落库后的 assistant 正文本全量 */
  fullContent?: string;
  /** 轮次终态: server 真实主键 (大整数 → 字符串) */
  messageId?: string;
  /** 轮次终态: 本轮模型零产出 → fullContent 此时是真值空串 */
  emptyReply?: boolean;
  /** 取消帧: 本轮被服务端中止 */
  cancelled?: boolean;

  // ==========================================================================
  // ★ v2 帧信封 (重构轮 R2-web · 架构 §2.5 四要素 / T-09 / T-12 / T-15)
  // --------------------------------------------------------------------------
  // ⚠️ **全部 optional** —— 老服务端 (R1-b/R1-c 之前) 一个都不发。
  //    端侧读它们时一律走「没有就兜底」, 绝不能假设存在。
  //
  //   · `seq`             —— 服务端轮次真值发号 (per-session 单调, **连续**)。
  //                          幂等判据的主键 (T-09); 老服务端没有 ⇒ 只判重复不判跳号。
  //   · `elapsedMs`       —— 服务端算的累计耗时 (四要素之一, T-15)。
  //                          老服务端没有 ⇒ 用 message.startedAt + 本地时钟兜底。
  //   · `toolCallCount`   —— **逻辑**工具调用次数 (四要素之一, T-17)。
  //                          老服务端没有 ⇒ 端侧按相位数组数 (兜底, 会虚高)。
  //   · `thinkingCount`   —— **逻辑**思考段数 (四要素之一, T-16)。
  //   · `terminalReason`  —— 终态分类 (T-12): completed/cancelled/filtered/failed/upstream_lost。
  //                          老服务端没有 ⇒ 从 error.code / done.cancelled 推导。
  //   · `code`            —— 机器可读错误码。**天眼命中 = `OUTPUT_FILTER_HIT`** (订正 8/11)。
  //   · `startedAt`       —— 轮次开始时刻 (服务端时钟)。
  // ==========================================================================
  /** ★ v2: 服务端分配的轮次序号 (per-session 单调, 连续)。老服务端没有。 */
  seq?: number | null;
  /** ★ v2: 服务端算的累计耗时 (ms)。老服务端没有 ⇒ 本地时钟兜底。 */
  elapsedMs?: number | null;
  /** ★ v2: 逻辑工具调用次数 (T-17)。老服务端没有 ⇒ 端侧数 (兜底)。 */
  toolCallCount?: number | null;
  /** ★ v2: 逻辑思考段数 (T-16)。老服务端没有 ⇒ 端侧数 (兜底)。 */
  thinkingCount?: number | null;
  /** ★ v2: 终态分类 (T-12)。老服务端没有 ⇒ 从 error.code / done.cancelled 推导。 */
  terminalReason?: string | null;
  /** 机器可读错误码 —— 天眼命中 = `OUTPUT_FILTER_HIT` (订正 8)。 */
  code?: string | null;
  /** ★ v2: 轮次开始时刻 (服务端时钟)。 */
  startedAt?: number | null;
}

/**
 * 轮次终态判据 — 一轮里 done 帧有两类字节相同,
 * **必须**看 messageId 区分, 拿第一个 done 当结束会让 ACK 早退丢正文。
 */
export function isTerminalDone(chunk: ChatChunk): boolean {
  return chunk.done === true && chunk.messageId != null;
}

/**
 * 取消帧判据 — 中途哨兵不带 cancelled 但带 done:true 是正常的,
 * 真取消帧 = done && cancelled === true (server 这种帧也不带 messageId)。
 */
export function isCancelFrame(chunk: ChatChunk): boolean {
  return chunk.done === true && chunk.cancelled === true;
}

/**
 * 用户主动中止哨兵 —  替 fetch 抛的 AbortError 兜底:
 *   移动 Chromium "fetch 读 body 中被 abort" 时抛的形态不稳定
 *   (AbortError / TypeError 都有), 调用方靠 err.name 猜会误判
 *   ("fetch 失败 ≡ 用户停止")。这里挂 own 字段 `userAborted = true`,
 *   调用方用 isUserAbortError() 唯它判, 不看 name/message。
 */
export class UserAbortError extends Error {
  readonly userAborted = true;
  constructor(message = "用户停止了生成") {
    super(message);
    this.name = "AbortError"; // 改前 ABI 兼容, 不破坏既有按 name 判的代码
  }
}

/** 判别"用户主动停止"的唯一入口 */
export function isUserAbortError(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    (err as { userAborted?: unknown }).userAborted === true
  );
}

/**
 * 构造 DELETE /yinian/chat/cancel/:sessionId, query + header 双带 intent.
 *
 * 设计要点:
 *   - 唯一构造点, 结构上不可能漏带 (调用方拿不到不传的入口),
 *     跟 Android `CancelDeleteSender.requestFor` 一字不差的对齐语义。
 *   - `keepalive: true` — 用户按停止后立刻跳页/发下一条, 浏览器不能砍这个 DELETE。
 *   - 失败仅 log: ACK_DONE 失败 server 30s 后会自己 end, 无副作用;
 *                USER_STOP 失败才是真损失 (服务端继续烧 token), warn 一行。
 *
 * 用法:
 *   - 轮次终态帧 (isTerminalDone): sendCancelDelete(id, 'ACK_DONE')
 *   - 用户按停止:                 sendCancelDelete(id, 'USER_STOP')
 *   - 收到 isCancelFrame:          **不调** (已经在取消中, ack 反而会重复)
 */
export function sendCancelDelete(
  sessionId: string,
  intent: CancelIntent,
): void {
  const url = new URL(`${API_BASE}/yinian/chat/cancel/${sessionId}`);
  url.searchParams.set("intent", intent);

  const { token } = getAuthSnapshot();
  const headers: Record<string, string> = {
    "x-gaclaw-cancel-intent": intent,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  fetch(url.href, {
    method: "DELETE",
    headers,
    credentials: "include",
    keepalive: true,
  }).catch((err) => {
    // 静默失败 = 服务端不知道要停 = 推理继续烧 token 而 UI 已显示停了, 比报错更糟
    // eslint-disable-next-line no-console
    console.warn(
      `[cancel] DELETE intent=${intent} sessionId=${sessionId} 发送失败:`,
      err instanceof Error ? err.message : String(err),
    );
  });
}
