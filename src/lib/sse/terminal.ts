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
