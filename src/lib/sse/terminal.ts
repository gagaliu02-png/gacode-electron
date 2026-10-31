// =========================================================================
// terminal —— 终态分类与渲染分流 (架构 §3.5.1 / T-12 / 契约订正 8)
// ---------------------------------------------------------------------------
// 为什么有这个文件
// ---------------------------------------------------------------------------
//   v1 的 `done` 帧只有 `cancelled:bool` + `finalContent` ⇒ **五类终态分不出来**:
//
//     · completed      正常跑完
//     · cancelled      用户按停止 / 客户端 DELETE
//     · filtered       天眼拦截 (error{code:'OUTPUT_FILTER_HIT'})
//     · failed         工具/网络异常
//     · upstream_lost  unified-api → gaclaw 这段断了
//
//   ⚠️ **天眼命中时 `cancelled=false` 且 `finalContent=''`** ⇒ 与「正常完成但
//     空输出」**不可区分**。⇒ 端侧**必须先扫 `error` 帧, 再看 `done` 帧**
//     (订正 8 白纸黑字)。
//
//   本文件把「怎么判」和「怎么显示」拆开:
//     · `deriveTerminalReason` —— 从帧里**推导**终态分类 (纯函数)
//     · `presentTerminal`      —— 把分类映射成**端侧表现** (纯函数)
//
//   ⇒ 五类终态各有各的表现, `filtered` 绝不会被渲染成「空回答」或普通报错。
//
// ---------------------------------------------------------------------------
// ⛔ 本文件**不许** import window / fetch / js-cookie —— PC 要抄这份定稿。
// =========================================================================

/** 五类终态 (T-12)。 */
export type TerminalReason =
  | "completed"
  | "cancelled"
  | "filtered"
  | "failed"
  | "upstream_lost";

/** 天眼命中的机器可读码 (gaclaw `channel_agent.js` 发的那一帧)。 */
export const OUTPUT_FILTER_HIT_CODE = "OUTPUT_FILTER_HIT";

/**
 * 端侧表现的「形态」—— 五类各不相同 (B18 的判据)。
 *
 * ⚠️ 这五个值互不相同 ⇒ `filtered` / `cancelled` / `failed` / `upstream_lost`
 *   在 UI 上必然长得不一样 (改文案不会把两个形态改成一模一样)。
 */
export type TerminalForm =
  | "answer" // 正常回答
  | "stopped" // 用户主动停了
  | "blocked" // 被系统拦截 (天眼)
  | "error" // 出错了
  | "incomplete"; // 没跑完 (上游断了)

/** 端侧表现。 */
export interface TerminalPresentation {
  /** 终态分类。 */
  reason: TerminalReason;
  /** 表现形态 (五类各不相同)。 */
  form: TerminalForm;
  /** 端侧文案。 */
  label: string;
  /** 语气。 */
  tone: "normal" | "muted" | "warn" | "danger";
  /** ★ 是否必须撤掉已渲染的 partial 正文 (天眼 ⇒ true, T-13)。 */
  purgeContent: boolean;
  /** 是否保留 partial 正文。 */
  keepPartial: boolean;
  /** 是否算「错误」(要不要给用户弹错误)。 */
  isError: boolean;
  /** 完整度。 */
  completeness: "complete" | "partial";
}

/**
 * presentTerminal —— 终态分类 ⇒ 端侧表现。
 *
 * ⚠️ 五类**逐一**列出来, 没有默认值兜底成同一个形态 ——
 *   新增终态类型时**必须**在这里显式加一行 (加漏了 TS 会报错, 这是故意的)。
 */
export function presentTerminal(reason: TerminalReason): TerminalPresentation {
  switch (reason) {
    case "completed":
      return {
        reason,
        form: "answer",
        label: "已完成",
        tone: "normal",
        purgeContent: false,
        keepPartial: true,
        isError: false,
        completeness: "complete",
      };
    case "cancelled":
      return {
        reason,
        form: "stopped",
        label: "已停止",
        tone: "muted",
        purgeContent: false,
        // ★ 用户花的时间不该丢 ⇒ partial 保留 (架构 §3.5.2)
        keepPartial: true,
        isError: false,
        completeness: "partial",
      };
    case "filtered":
      return {
        reason,
        form: "blocked",
        label: "天眼系统监测到当前请求有风险，已拦截本次输出",
        tone: "warn",
        // ★ 合规: 天眼命中的产出**必须撤掉** (T-13 / 订正 11)
        purgeContent: true,
        keepPartial: false,
        // ⛔ 不是「错误」—— 是系统拦截, 弹个红色报错是误导
        isError: false,
        completeness: "complete",
      };
    case "failed":
      return {
        reason,
        form: "error",
        label: "处理时发生错误",
        tone: "danger",
        purgeContent: false,
        // ★ 失败时正文是「错误文案」, 不是 partial ⇒ 换掉
        keepPartial: false,
        isError: true,
        completeness: "partial",
      };
    case "upstream_lost":
      return {
        reason,
        form: "incomplete",
        label: "连接中断，本轮未完成",
        tone: "warn",
        // ★ 上游断了 ⇒ partial 保留 + 标「未完成」
        purgeContent: false,
        keepPartial: true,
        isError: false,
        completeness: "partial",
      };
  }
}

/**
 * 判终态所需的最小帧信息。
 *
 * ⚠️ 字段刻意做得很小 ⇒ 宿主层把 `ChatChunk` **适配**成这个形状再喂进来。
 */
export interface TerminalFrameLike {
  /** v2: 终态帧直接带的分类字段。 */
  terminalReason?: string | null;
  /** error 帧的机器可读码 (`OUTPUT_FILTER_HIT` = 天眼)。 */
  code?: string | null;
  /** error 帧 / done 帧的 `done` 标记。 */
  done?: boolean | null;
  /** 取消标记 (`done.cancelled`)。 */
  cancelled?: boolean | null;
  /** 错误文案 (有 ⇒ 失败)。 */
  error?: string | null;
}

/**
 * deriveTerminalReason —— 从帧推导终态分类 (T-12 / 订正 8)。
 *
 * 判定顺序 (**先 error 后 done** —— 订正 8 的硬要求):
 *
 *   1. `error{code:'OUTPUT_FILTER_HIT'}` ⇒ **filtered** (天眼)
 *      ⛔ 优先级最高: 天眼命中时 `done.cancelled=false` 且 `finalContent=''`,
 *        与「正常完成但空输出」不可区分 ⇒ 只有这一条能认出来。
 *   2. 显式 `terminalReason` (v2 服务端给的权威分类) ⇒ 用它。
 *   3. `done.cancelled === true` ⇒ **cancelled** (用户按停止)。
 *   4. 有 `error` 文案 (无 code) ⇒ **failed**。
 *   5. 流结束了但**没有**任何终态帧 ⇒ **upstream_lost**。
 *   6. 其余 ⇒ **completed**。
 *
 * @param input.errorCode    error 帧的 code (天眼 = `OUTPUT_FILTER_HIT`)
 * @param input.cancelled    done 帧的 cancelled
 * @param input.error        错误文案
 * @param input.terminalReason 服务端显式给的分类 (v2)
 * @param input.streamEnded  流是否已经结束 (用来区分 5 和 6)
 */
export function deriveTerminalReason(input: {
  terminalReason?: string | null;
  errorCode?: string | null;
  cancelled?: boolean | null;
  error?: string | null;
  streamEnded?: boolean;
}): TerminalReason {
  // ① 天眼 —— 唯一能认出「系统拦截」的判据。
  if (input.errorCode === OUTPUT_FILTER_HIT_CODE) return "filtered";

  // ② 服务端显式分类 (v2)。⚠️ 只认**已知的五类**, 未知值不当成 completed。
  const explicit = input.terminalReason;
  if (typeof explicit === "string" && isTerminalReason(explicit)) {
    return explicit;
  }

  // ③ 用户按了停止。
  if (input.cancelled === true) return "cancelled";

  // ④ 出错了。
  if (typeof input.error === "string" && input.error.trim() !== "") {
    return "failed";
  }

  // ⑤ 流结束了但没有终态帧 ⇒ 上游断了。
  if (input.streamEnded === true) return "upstream_lost";

  // ⑥ 正常完成。
  return "completed";
}

/** 是不是五类终态之一。 */
export function isTerminalReason(raw: unknown): raw is TerminalReason {
  return (
    raw === "completed" ||
    raw === "cancelled" ||
    raw === "filtered" ||
    raw === "failed" ||
    raw === "upstream_lost"
  );
}

/**
 * 终态帧的判据 —— 「这一帧是不是终态帧」。
 *
 * ⚠️ v1 的 `done` 帧在一轮里会来**不止一次** (gaclaw 每结束一个工具调用就让
 *   unified-api 转发一次裸 `{done:true}`) ⇒ 轮次终态的判据是
 *   **带 messageId 的那一帧** (契约 §「终态帧契约」)。
 */
export function isTerminalFrame(frame: {
  done?: boolean | null;
  messageId?: string | null;
}): boolean {
  return frame.done === true && frame.messageId != null;
}

/**
 * isFilterFrame —— 这一帧是不是天眼终止信号。
 *
 * ⚠️ 天眼帧的形状 (gaclaw `channel_agent.js:2265-2276`):
 *   `{ type:'error', code:'OUTPUT_FILTER_HIT', cancellable:true, content:'❗️天眼…' }`
 *   —— 注意它**不是** `{error: '...'}` 那种形状, 而是顶层 `type:'error'`。
 */
export function isFilterFrame(frame: {
  type?: string | null;
  code?: string | null;
}): boolean {
  return frame.code === OUTPUT_FILTER_HIT_CODE;
}

/**
 * readTerminalReason —— 从**一帧**读出终态分类 (没有 ⇒ null)。
 *
 * ⚠️ 判定顺序与 `deriveTerminalReason` 同源, 但这里多了「这一帧是不是终态帧」
 *   这一层 —— 中途哨兵帧 (`{done:true}`) **不是**终态, 必须返回 null。
 *
 *   ① 天眼 (`code === 'OUTPUT_FILTER_HIT'`) ⇒ **filtered** (优先级最高)
 *   ② 服务端显式 `terminalReason` ⇒ 用它 (只认已知的五类)
 *   ③ `done && cancelled` ⇒ **cancelled**
 *   ④ 有 `error` 文案 ⇒ **failed**
 *   ⑤ `done && messageId` (轮次终态帧) ⇒ **completed**
 *   ⑥ 其余 (含中途哨兵 `{done:true}`) ⇒ null (不是终态)
 *
 * ⚠️ 老服务端没有 `terminalReason` ⇒ 走 ①③④⑤ 推导 (契约 §2.3 兜底表)。
 */
export function readTerminalReason(frame: {
  done?: boolean | null;
  messageId?: string | null;
  cancelled?: boolean | null;
  error?: string | null;
  code?: string | null;
  terminalReason?: string | null;
}): TerminalReason | null {
  // ① 天眼 —— 唯一能认出「系统拦截」的判据 (优先级最高)。
  if (frame.code === OUTPUT_FILTER_HIT_CODE) return "filtered";
  // ② 服务端显式分类 (v2) —— 只认已知的五类, 未知值不当成 completed。
  if (
    typeof frame.terminalReason === "string" &&
    isTerminalReason(frame.terminalReason)
  ) {
    return frame.terminalReason;
  }
  // ③ 用户按了停止。
  if (frame.done === true && frame.cancelled === true) return "cancelled";
  // ④ 出错了 (错误文案非空)。
  if (typeof frame.error === "string" && frame.error.trim() !== "") {
    return "failed";
  }
  // ⑤ 轮次终态帧 (带 messageId) ⇒ 正常跑完。
  if (frame.done === true && frame.messageId != null) return "completed";
  // ⑥ 中途哨兵 / 普通帧 —— 不是终态。
  return null;
}

// =========================================================================
// ★ RC-6 (F3c) —— 「流结束但没有终态帧」的可识别错 + 终态判据 (RC-5 · RC-W3)
// ---------------------------------------------------------------------------
// 为什么全部放在这里 (G-3 一处真值):
//   · 终态判据 (`isTerminalOrFailed`) —— 宿主层的 `isTerminalDone`
//     (web: src/lib/api.ts · PC: src/lib/cancel.ts) **反过来调**本文件的
//     `isTerminalFrame` ⇒ 「什么算轮次终态」这条规则只写一遍, 两端不会漂移。
//   · 「要不要报『流结束但没有终态帧』」—— 纯函数 `shouldReportMissingTerminal`,
//     宿主层只调它, **不**自己写条件 (排除项就那三个, 少写一个就误报)。
//   · 错误类 + 判别函数 —— 两端**同一个**类 ⇒ 宿主层 catch 里认得出。
//
// ⛔ 本文件仍然**不许** import window / fetch / js-cookie —— PC 抄这份定稿。
// =========================================================================

/** 「流结束但没有终态帧」的机器可读码。 */
export const STREAM_NO_TERMINAL_CODE = "STREAM_NO_TERMINAL";

/**
 * StreamEndedWithoutTerminal —— 服务端**提前关流**, 一帧轮次终态都没给。
 *
 * ⚠️ 为什么不抛普通 Error: 调用方要能**精确**地把它从「真错误」里分出来 ——
 *   它**不是**错误, 是「接不回来了」⇒ 走**降级闭环**
 *   (保留已渲染的内容 + 回落历史补拉), **不许**进通用错误弹窗 (G-4)。
 */
export class StreamEndedWithoutTerminal extends Error {
  /** 唯一判别位 —— 调用方用 isStreamNoTerminalError() 判, 不要看 message。 */
  readonly code = STREAM_NO_TERMINAL_CODE;
  constructor(message = "流结束但没有终态帧") {
    super(message);
    this.name = "StreamEndedWithoutTerminal";
  }
}

/**
 * isStreamNoTerminalError —— 判别「这个错是不是 STREAM_NO_TERMINAL」的唯一入口。
 *
 * ⚠️ 只看 `code` 字段 (不看 name / message) ⇒ 跨模块、跨端都认得出。
 */
export function isStreamNoTerminalError(err: unknown): boolean {
  return (
    !!err &&
    typeof err === "object" &&
    (err as { code?: unknown }).code === STREAM_NO_TERMINAL_CODE
  );
}

/**
 * shouldReportMissingTerminal —— 「流结束了但没有终态帧」要不要报出来 (纯函数)。
 *
 * ⚠️ 三个排除项缺一不可 (少一个就误报 / 漏报):
 *   · `aborted`     —— 用户主动中止 (我们自己掐断的流, 永远等不到终态帧);
 *   · `cancelled`   —— 收到过取消帧 (用户按停止 / 上游早退);
 *   · `sawTerminal` —— 见过轮次终态帧 (正常完成)。
 *
 *   ⇒ 剩下的**唯一**情形 = 「服务端半路关流」⇒ 抛 STREAM_NO_TERMINAL。
 */
export function shouldReportMissingTerminal(state: {
  aborted: boolean;
  cancelled: boolean;
  sawTerminal: boolean;
}): boolean {
  return !state.aborted && !state.cancelled && !state.sawTerminal;
}

/**
 * isTerminalOrFailed —— 「这一轮有没有走到终态」(RC-5 · 断言 RC-W3)。
 *
 * ⛔ `resumeFailed` 是服务端给的**失败终态** (续传失败帧) ⇒ 认它才算终态;
 *   否则「续传失败 ⇒ 服务端关流」这一路上, 流式态永远关不掉 (RC-W3 防的就是这个)。
 *
 * ⚠️ 只在**共享层**判一次 —— 宿主层不许自己再写一遍 (G-3)。
 */
export function isTerminalOrFailed(frame: {
  done?: boolean | null;
  messageId?: string | null;
  resumeFailed?: boolean | null;
}): boolean {
  return isTerminalFrame(frame) || isResumeFailedFrame(frame);
}

// =========================================================================
// ★ RC-5 —— 「续传接不回来」帧 (resumeFailed) 的判据与文案
// ---------------------------------------------------------------------------
// 为什么在这里 (G-3 一处真值):
//   · `isResumeFailedFrame` —— 「这一帧是不是『本端续传接不回来』」
//     ⛔ **与「终态帧上的 resumeFailed」不是一回事** (服务端 resumeFailed.js 的警告):
//       · 这里的 = **本端续传接不回来** (正文空、**没有** messageId);
//       · 终态帧上的 = **上游 (gaclaw) 自己**报了 resume 失败 (那一轮**有**正文、有 messageId)。
//     ⇒ 端侧必须**分开认** —— 混了 ⇒ 「上游失败」被当成「接不回来」⇒ 内容被抹。
//   · `readResumeStatusLabel` —— 失败原因码 ⇒ 端侧文案。
//
// ⛔ 本文件仍然**不许** import window / fetch / js-cookie —— PC 抄这份定稿。
// =========================================================================

/**
 * 「续传接不回来」的**默认**文案。
 *
 * ⚠️ 与安卓 `chat_turn_stalled_marker` **逐字一致**
 *   (安卓: `未收到服务端回复，以上为中断前的内容`) ⇒ 三端同一句话。
 */
export const RESUME_FAILED_LABEL = "未收到服务端回复，以上为中断前的内容";

/**
 * 服务端 `resumeStatus` 的已知取值 ⇒ 端侧文案。
 *
 * ⚠️ 取值域来自服务端 `turn/attach.js` 的 `ATTACH_FAIL` (8 种) ——
 *   端侧只**列**在这里, 判据仍是服务端给的码 (端侧不猜、不推算)。
 */
export const RESUME_STATUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  /** 服务端没有在跑的轮次了。 */
  no_active_stream: "服务端已没有在跑的这一轮",
  /** 回放缓冲区过期 ⇒ 接不回这一轮的中段。 */
  buffer_expired: "这一轮的中段已过期，未能接回",
  /** 这一轮确实结束了。 */
  not_running: "这一轮已结束",
  /** 轮次已落终态 (内容应当在历史里)。 */
  turn_ended: "这一轮已结束",
  /** 上游 (模型) 已经不在了。 */
  upstream_dead: "上游已断开，未能接回",
  /** 回放有洞 (游标与本轮第一帧之间断了)。 */
  log_gap: "回放有缺口，未能接回",
  /** 游标形态非法。 */
  bad_cursor: "续传游标无效",
  /** 游标超前于已持久化的内容。 */
  cursor_ahead: "续传游标超前，未能接回",
  /** ★ RC-3: 服务端进程重启过 ⇒ 内存里的这一轮没了。 */
  stale_epoch: "服务端已重启，这一轮未能接回",
  /** 兜底。 */
  unknown: RESUME_FAILED_LABEL,
});

/**
 * readResumeStatusLabel —— 失败原因码 ⇒ 端侧文案 (纯函数)。
 *
 * ⚠️ 未知码 ⇒ **默认文案**, **绝不抛**:
 *   服务端以后加新码, 老端侧不能崩 (与 `normalizeReason` 同款纪律)。
 *
 * @param status 服务端给的 `resumeStatus` (可空)
 */
export function readResumeStatusLabel(status: string | null | undefined): string {
  if (typeof status !== "string") return RESUME_FAILED_LABEL;
  const v = status.trim();
  if (v === "") return RESUME_FAILED_LABEL;
  const hit = RESUME_STATUS_LABELS[v];
  return hit ?? RESUME_FAILED_LABEL;
}

/**
 * isResumeFailedFrame —— 这一帧是不是「**本端续传接不回来**」(RC-5)。
 *
 * ⚠️ 只认**严格的** `true` —— 别的取值 (`"yes"` / `1` / `"true"`) 一律不当。
 *   (与 `isTerminalOrFailed` 的判据一致: 宁可漏认也不误认。)
 *
 * ⛔ 与「终态帧上的 resumeFailed」**不是一回事** —— 见本文件上方的警告。
 *   终态帧 (`done && messageId`) 走 `isTerminalFrame` 认, 不走这里。
 */
export function isResumeFailedFrame(frame: {
  resumeFailed?: boolean | null;
}): boolean {
  return frame.resumeFailed === true;
}
