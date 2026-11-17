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
 *   2. `DELETE /yinian/chat/cancel/:id` 有三种 intent, 字节完全相同,
 *      只能靠 intent 标记区分 (服务端按单 channel.connections.js classifyCancelIntent):
 *      - ACK_DONE   — 收尾 ACK, 语义"这轮完了", **不该武装取消**
 *      - USER_STOP  — 用户按停止, 语义"取消正在跑的这一轮" ⇒ 硬掐上游 ⇒ 产出全丢
 *                     ★ **「停止」按钮恒发这个**（PM 2026-11-17 拍板）
 *      - INTERRUPT  — **插话用的软停意图**: 跑到安全边界（当前工具调用结束）才停
 *                     ⇒ 不掐上游 ⇒ **这一轮的正文 / 工具成果保留**
 *                     ⇒ ⚠️ **服务端自己发起**（有新内容插进来时把上一轮收掉）
 *                        ⇒ **端侧的「停止」按钮不用它**
 *                     ⇒ 服务端不认识这个意图时按 legacy 处理（= 硬掐 = 老行为）
 *                     ⇒ **不需要能力协商**
 *      携带方式: query `?intent=` **+** header `x-gaclaw-cancel-intent:`
 *      (两端都读, 顺序不同, 双带才是真稳)。
 *
 *   3. 大整数 id 走字符串 (后端 JSON number 会丢精度)。
 *
 *   4. 这两条路径共用下面 sendCancelDelete() **一个构造点**,
 *      结构上不可能漏带 (对齐 Android CancelDeleteSender.requestFor)。
 *
 * 失败处理: ACK_DONE 静默, USER_STOP / INTERRUPT 警告日志 (漏发 = 界面骗用户说停, 服务端还在烧 token)。
 *
 * ⚠️ [PM 2026-11-17 拍板] 产品铁律「打断 = 彻底丢弃产出」**依然成立**:
 *    「用户按停止」恒发 **USER_STOP（硬掐）** ⇒ 产出全丢。
 *    INTERRUPT 只在**插话**路径上用（服务端发起），端侧停止按钮不碰它。
 */

// ★ RC-6 (F3c): 终态判据在**共享层** (`src/lib/sse/terminal.ts`) —— 与 web 那份逐字节相同。
import { isTerminalFrame } from "./sse/terminal";

/**
 * 富事件判别联合 (契约 §2) —— 与 web 定稿版 `gacode-web/src/lib/api.ts` 的
 * ChatChunk 同款。⛔ 编译期擦除 (`import type`), 不给本文件引运行时依赖。
 */
import type { RichEventBase } from "./rich-events";
// ★ RC-5: 失败帧里的快照形状 (契约订正 20: 键恒在, 值可为 null)。
import type { AttachSnapshot } from "./chat-sse";
// ★ [订正 28 · L-28r] 补充边界帧的形状 (顶层字段 `supplementBoundary`)。
//   ⛔ 只引**类型** (编译期擦除) ⇒ 本文件的运行时依赖一个字都不多。
import type { SupplementBoundary } from "./supplement-boundary";

const API_BASE = "https://www.gaga.sale/api/v1";

/**
 * 双带 intent — query **和** header 都带,
 * call site 拿不到任何"哪个端读得到哪个"的玄学解释权。
 *
 * ⚠️ 三种意图的**线上字节完全相同**，只能靠这个标记让服务端分得清
 *   (unified-api classifyCancelIntentValue: trim → toLowerCase → [-空白]+ → '_';
 *    gaclaw channel.connections.js classifyCancelIntent: 同一套归一化):
 *   - ACK_DONE   — 客户端收齐终态后发的收尾 ACK。语义是"这轮完了", gaclaw 不该武装取消,
 *                  unified-api 也不该打 markCancelled —— 打上等于让 webhook 在落库前
 *                  直接拒收这一轮, 也就是把正常一轮的答案吞掉 (unified-api:216-221)。
 *   - USER_STOP  — 用户按"停止"。语义是"取消正在跑的这一轮" ⇒ 硬掐上游 ⇒ **产出全丢**。
 *     ★ PM 2026-11-17 拍板：「用户侧的停止按钮，应该和之前一样，就是直接打断」
 *       ⇒ **「停止」按钮恒发 USER_STOP**。
 *   - INTERRUPT  — **插话用的软停意图**:
 *       语义是"跑到安全边界（当前工具调用结束）才停" ⇒ **不掐上游** ⇒ 这一轮的
 *       正文 / 工具成果**保留**。
 *       ⚠️ **服务端自己发起**（有新内容插进来时把上一轮收掉）⇒ **端侧的停止按钮不用它**。
 *       ⚠️ 服务端**不认识**这个意图时按 legacy 处理（= 硬掐 = 老行为）
 *         ⇒ **不需要能力协商**。
 */
export type CancelIntent =
  | "ACK_DONE"
  | "USER_STOP"
  | "INTERRUPT"
  /**
   * ★ [T-030 · 2026-11-17] **停后台活**（用户点「停止后台任务」）。
   *
   * 语义 = 停**本会话**的后台活（服务端跑的后台子 agent + 设备派单的作业），
   * **不武装 pending cancel** ⇒ 不误伤下一轮。
   *
   * ⚠️ 为什么不能复用 `USER_STOP`：它会让 gaclaw **武装 pending cancel**
   *   ⇒ 队列里排着的下一条消息被 pre-abort（v1.2.61 同款故障）。
   * ⚠️ 为什么不能复用 `INTERRUPT`：那是「软停」（跑到安全边界才停、要保住产出）。
   */
  | "STOP_BACKGROUND";

/**
 * 意图 → **线上字节**的映射（query 与 header 用**同一个**值）。
 *
 * ⚠️ ACK_DONE / USER_STOP 逐字不变（老端行为不变）;
 * ⚠️ INTERRUPT 用**小写** `interrupt`（服务端别名集
 *   `INTERRUPT_INTENT_ALIASES` = {interrupt, user_interrupt, safe_stop, soft_stop}，
 *   归一化时 trim + 转小写 ⇒ 小写最稳）。
 * ⚠️ STOP_BACKGROUND 用**小写** `stop_background`（服务端别名集
 *   `STOP_BACKGROUND_INTENT_ALIASES` = {stop_background}，同样小写最稳）。
 */
const CANCEL_INTENT_WIRE: Record<CancelIntent, string> = {
  ACK_DONE: "ACK_DONE",
  USER_STOP: "USER_STOP",
  INTERRUPT: "interrupt",
  STOP_BACKGROUND: "stop_background",
};

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
  /**
   * ★ v2 (契约订正 16): **轮次身份** (`tk_xxx`) —— 服务端 v2 帧信封的**顶层**字段。
   *
   *   · 与 `stream-state` / `attach_ok` 返回的那个 turnKey 是**同一个值**;
   *   · 与落库后历史消息的 `metadata.turnKey` 也是**同一个值**
   *     ⇒ 「本地流式行 ↔ 服务端那一行」可以精确判成同一轮 (空气泡的根治点)。
   *
   *   老服务端没有 ⇒ undefined ⇒ 端侧回落老的启发式, 行为不变。
   */
  turnKey?: string | null;

  /**
   * ★ [2026-11-16] **这一轮的发起方**（帧顶层 `origin`）。
   *
   *   · `'work_unit_result'` —— 这一轮是**后台作业回报触发的服务端起轮**（订正 30）；
   *   · 缺省 —— **用户自己发起**的轮（服务端**不出现** `origin: 'user'` 这个键）。
   *
   *   ⚠️ 老的帧（老服务端）没有这个键 ⇒ `undefined` ⇒ 端侧按「不知道」处理。
   *   ⚠️ 判据在 `lib/turn-origin.ts`（**唯一**一份，web 端照抄那一份）。
   */
  origin?: string | null;

  // ==========================================================================
  // ★ RC-5 —— 「本端续传接不回来」帧 (服务端 `turn/resumeFailed.js` 的唯一出口)
  // --------------------------------------------------------------------------
  // ⚠️ **不是**终态帧 —— 它**没有** messageId (服务端故意不给) ⇒
  //   `isTerminalDone` 命中不了 ⇒ 端侧必须**单独**认它 (RC-W4)。
  //
  // ⚠️ **不是**「上游报了 resume 失败」—— 那一轮**有**正文、有 messageId
  //   ⇒ 走 `isTerminalDone` 那条路。两种 resumeFailed **语义不同**, 别混。
  // ==========================================================================
  /** ★ RC-5: 本端续传**接不回来** (服务端给的失败帧)。 */
  resumeFailed?: boolean;
  /** ★ RC-5: 失败原因码 (`resumeStatus`) —— 服务端给的机器可读码。 */
  resumeStatus?: string | null;
  /**
   * ★ RC-5: 失败帧带的**轮次快照** (契约订正 20)。
   *
   *   ⚠️ **键恒在** (值可以是 null) ⇒ 端侧靠「键在不在」区分
   *     「有快照可用」与「连快照都没有 (⇒ 去拉历史)」。
   */
  snapshot?: AttachSnapshot | null;

  // ==========================================================================
  // ★ [订正 28 · L-28r] **补充边界**（顶层字段）
  // --------------------------------------------------------------------------
  // 帧形态（**顶层字段**、不带 `type` —— 跟 a4 的 `deletedDeliverables` 一个套路）:
  //
  //   data: {"supplementBoundary":{"id":"<收件箱行 id>","kind":"user_supplement",
  //          "fromKind":"user","content":"<补充正文>"}}
  //
  //   · 这是**无内容帧**（没有 content / reasoning / done…）⇒ 端侧认**顶层字段**；
  //   · 语义：「**这里**插进来一条补充」⇒ ① 正在流式的气泡**收尾**
  //     + ② **另起一个新气泡**给后面的续答 + ③ 补充那条**按自己的角色**渲染
  //     成一个气泡（正文用 `content`）。
  //
  //   ⚠️ 老服务端没有这个字段 ⇒ undefined ⇒ 端侧行为与改动前逐字一致。
  // ==========================================================================
  /** ★ 订正 28 · L-28r: 「这里插进来一条补充」。 */
  supplementBoundary?: SupplementBoundary | null;
}

/**
 * 轮次终态判据 — 一轮里 done 帧有两类字节相同,
 * **必须**看 messageId 区分, 拿第一个 done 当结束会让 ACK 早退丢正文。
 */
export function isTerminalDone(chunk: ChatChunk): boolean {
  // ★ RC-6: 规则搬到共享层 (`src/lib/sse/terminal.ts` 的 `isTerminalFrame`) ——
  //   这里只做转发 ⇒ 「什么算轮次终态」**只写一遍** (G-3), 两端不会漂移。
  //   ⚠️ 语义与改动前**逐字相同** (`done === true && messageId != null`)。
  return isTerminalFrame(chunk);
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
 *                USER_STOP / INTERRUPT 失败才是真损失 (服务端继续烧 token), warn 一行。
 *
 * 用法:
 *   - 轮次终态帧 (isTerminalDone): sendCancelDelete(id, 'ACK_DONE')
 *   - 用户按停止:                 sendCancelDelete(id, 'USER_STOP')
 *                                  ★ 恒 USER_STOP（PM 2026-11-17：停止 = 硬打断）；
 *                                  'INTERRUPT' 只留给**插话 / 软停**路径（服务端发起）。
 *   - 收到 isCancelFrame:          **不调** (已经在取消中, ack 反而会重复)
 */
export function sendCancelDelete(
  sessionId: string,
  intent: CancelIntent,
): void {
  // ⚠️ 线上字节走映射表 (INTERRUPT ⇒ 小写 `interrupt`) ⇒ query 与 header 同值。
  const wire = CANCEL_INTENT_WIRE[intent] ?? intent;
  const url = new URL(`${API_BASE}/yinian/chat/cancel/${sessionId}`);
  url.searchParams.set("intent", wire);

  const { token } = getAuthSnapshot();
  const headers: Record<string, string> = {
    "x-gaclaw-cancel-intent": wire,
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
      `[cancel] DELETE intent=${wire} sessionId=${sessionId} 发送失败:`,
      err instanceof Error ? err.message : String(err),
    );
  });
}
