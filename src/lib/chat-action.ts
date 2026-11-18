/**
 * lib/chat-action.ts —— **输入框右侧按钮的状态机**（契约 订正 28 · W5 · PC 端）
 *
 * ## 为什么单独一个文件
 *
 * 这张表是**产品契约**（★ gaga 2026-11-14 拍板，见
 * `docs/design/async-work-unit-architecture-2026-11.md` §3.7）⇒
 * 它必须**可执行、可单测** ⇒ 抽成纯函数（⛔ 不许塞进组件里靠人肉读）。
 *
 * ## 表（原文照抄，不许自行加态）
 *
 * | 主 agent 轮次 | 后台工作单元 | 输入框 | 按钮   | 点击后                       |
 * |---|---|---|---|----------------------------|
 * | 在跑   | 任意     | 空   | 停止 | 停本会话的一切 ⇒ 彻底丢弃产出 |
 * | 在跑   | 任意     | 有字 | 发送 | 文字**进队列**（不打断）       |
 * | 不在跑 | 有在跑的 | 空   | 停止 | 停本会话的一切（只停后台活）   |
 * | 不在跑 | 有在跑的 | 有字 | 发送 | 进队列                        |
 * | 不在跑 | 全停     | 有字 | 发送 | 直接发（起新轮）               |
 *
 * **判据两个**：
 *   ① 主 agent 轮次在不在跑 —— **客户端已知**（`streamingAssistantId`）；
 *   ② 本会话有没有未完成的后台工作单元 —— **服务端给**
 *      （`GET /yinian/sessions/:id/pending-work` + 本机作业表）。
 *
 * ⚠️ **「停止」的作用域 = 本会话的一切**（§3.8）：主 agent 轮次 **+** 所有后台活。
 *    ⛔ 打断语义不变：停止 = **彻底丢弃**产出（铁律）。
 */

/** 按钮的两态（⛔ 没有第三态 —— 2026-11-04 已删掉「重新生成」）。 */
export type ChatActionKind = "stop" | "send";

/** 点击之后会发生什么（给调用方分流用）。 */
export type ChatActionEffect =
  /**
   * ★ [T-044 · 2026-11-18] **只停当前这一轮**（PM 口径①）。
   *   ⇒ 后台活 / 队列 / 后续轮次**都不受影响**。
   */
  | "stop-turn"
  /** 消息进队列（不打断、不立即发）。 */
  | "queue"
  /** 直接发（起新轮）。 */
  | "send-now";

/** 判据。 */
export interface ChatActionInput {
  /** 主 agent 轮次在不在跑。 */
  turnRunning: boolean;
  /** 本会话有没有未完成的后台工作单元。 */
  pendingWork: boolean;
  /** 输入框有没有字（或已上传好的附件）。 */
  hasText: boolean;
}

/** 判定结果。 */
export interface ChatActionDecision {
  /** 按钮形态。 */
  action: ChatActionKind;
  /** 点击之后会发生什么。 */
  effect: ChatActionEffect;
  /** 给日志/断言看的一句话理由。 */
  reason: string;
}

/**
 * 判定输入框右侧按钮是什么、点了会发生什么。
 *
 * ⚠️ **只有两态**（停止 / 发送）—— 「重新生成」态已于 2026-11-04 删除
 *    （它会把发送键顶掉 ⇒ 每轮答完输入框永远停在「重试」态）。
 */
export function resolveChatAction(input: ChatActionInput): ChatActionDecision {
  const turnRunning = !!input.turnRunning;
  const pendingWork = !!input.pendingWork;
  const hasText = !!input.hasText;

  // ★ [T-044 · 2026-11-18] **「排队」与「忙」是两件事**（对齐安卓端 `ComposerPolicy`）——
  //
  //   · **停止键只看「轮次在不在跑」** ⇒ 红色停止键 = **只停当前这一轮**（PM 口径①）。
  //     ⇒ **只有后台活在跑时，这个键不出现** —— 没有「当前轮」可停，
  //       给他一个「停一切」的键 = 一点就把后台调研全杀了（真机 session 1050 · 11:10:24）。
  //     ⇒ 停后台活 = 「等待后台任务」横幅上那个**独立**按钮（`stopBackgroundWork`）。
  //   · **有字时**：轮次在跑 ⇒ 进队列（不打断当前轮）；
  //     **只有后台活在跑 ⇒ 直接发**（后台活是派单即返回的 ⇒ agent 其实是空闲的
  //     ⇒ 用户新发的消息**应该直接起新轮**，不该干等）。
  if (turnRunning) {
    if (!hasText) {
      return {
        action: "stop",
        effect: "stop-turn",
        reason: "主 agent 轮次在跑 + 输入框为空 ⇒ 停止（**只停当前这一轮**）",
      };
    }
    return {
      action: "send",
      effect: "queue",
      reason: "主 agent 轮次在跑 + 输入框有字 ⇒ 发送（进队列，不打断）",
    };
  }
  if (hasText) {
    return {
      action: "send",
      effect: "send-now",
      reason: pendingWork
        ? "后台活在跑 + 输入框有字 ⇒ 发送（**直接发**，不排队 —— 后台活不占着 agent）"
        : "没有东西在跑 ⇒ 发送（直接发，起新轮）",
    };
  }
  // 没有轮次 + 只有后台活 + 输入框空 ⇒ **没有「当前轮」可停** ⇒ 不给停止键
  //   ⇒ 渲染成**置灰的发送键**（`ChatInputBar` 的 `disabled` 已有那个判据）。
  return {
    action: "send",
    effect: "send-now",
    reason: pendingWork
      ? "只有后台活在跑（没有当前轮）⇒ **不给停止键**（停后台活走横幅上的独立按钮）"
      : "没有东西在跑 ⇒ 发送（直接发，起新轮）",
  };
}
