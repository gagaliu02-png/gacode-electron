/**
 * lib/turn-started-hint.ts — 「别的会话有后台任务回报」的用户可见提示
 *                              (契约订正 30 · 观众侧 · PC 端)
 *
 * ---------------------------------------------------------------------------
 * 为什么需要这个文件
 * ---------------------------------------------------------------------------
 *   订正 30「服务端起轮，端侧当观众」：后台任务回报到达时**服务端**在用户会话里
 *   起一轮（主 agent 读到报告后继续推进）⇒ 端侧**不再起轮**，只当**观众**：
 *   收到通知帧 `type: "turn_started"` 就 attach 去看实时。
 *
 *   ⇒ 但「用户可见行为」这一层，web 端做了、PC 端没做：
 *   **App 在别的会话时**收到信号 ⇒ 用户完全不知道（石沉大海）。
 *
 *   web 端选了两层提示：
 *     ① 抽屉里的会话列表**红点** —— 复用 `ChatItem` **既有的** `hasNewMessage` 标记
 *        （⛔ 没新造组件 / 没新造样式）；
 *     ② **浏览器系统通知**（`showSiteNotification`）—— 因为红点要开抽屉才看得见，
 *        单靠红点仍偏「石沉大海」。
 *
 *   ⚠️ **PC 是 Electron**（不是浏览器）⇒ 浏览器系统通知那套**不适用**
 *   ⇒ PC 版的等价物是本仓**既有**的两条通道：
 *     ① 侧栏条目上的**红点** —— 复用 `ChatItem` 既有的 `hasNewMessage` 标记
 *        （侧栏在 PC 是**常驻**的，不像 web 的抽屉要拉开）；
 *     ② **系统托盘通知（Windows Toast）** —— 复用仓里**既有**的通知通道
 *        `window.gacode.notificationSSESend({ title, body, target })`
 *        （C4-11 已落地：主进程弹 Toast + 挂了 `click` ⇒ 点了恢复窗口 + 跳落点路由）。
 *
 * ---------------------------------------------------------------------------
 * 契约铁律（订正 30 §1.2 / §4）—— 本文件**只算提示**，不许做下面这些
 * ---------------------------------------------------------------------------
 *   ⛔ **端侧不再起轮** —— 服务端已经起好了；本文件**只算文案 + 落点**，
 *      **不发任何请求**（不许用 work_unit_ref 发起 chat/stream ⇒ 双份）。
 *   ⛔ **端侧不插本地气泡** —— 服务端已经写了 user 行（metadata 带 inbox_id）；
 *      端侧本地再插一条 ⇒ 刷新后重复（安卓已因此闪退过）。
 *   ⛔ **端侧不碰报告正文** —— 端侧从头到尾只传 id。
 *   ⛔ **不得复用 `work_unit_result` 这个 type** —— 旧端会把它当「起轮指令」
 *      ⇒ 旧端会起轮 ⇒ 双份（新 type 旧端不认 ⇒ 走 `unknown` 兜底 ⇒ 老端不崩）。
 *
 * ---------------------------------------------------------------------------
 * 纯度
 * ---------------------------------------------------------------------------
 *   本文件**零运行时 import** ⇒ 断言脚本能直接加载真源码跑行为级测试
 *   （跟 `lib/supplement-boundary.ts` 同款约定）。
 */

/**
 * 会话标题取不到时的兜底。
 *
 * ⚠️ 与 `lib/chat-notifications.ts` 的 `CHAT_NOTIFICATION_TITLE_FALLBACK`
 *   **同一个措辞**（「新对话」）—— 两边各写一份常量是为了让本文件保持零 import
 *   （可单测），措辞必须一致。
 */
export const TURN_STARTED_HINT_TITLE_FALLBACK = "新对话";

/**
 * 提示正文（系统通知 / 提示条都用这一句）。
 *
 * ⚠️ **不是**聊天气泡 ⇒ 不进消息流、不进历史 ⇒ 刷新后不会重复。
 *   ⛔ 也**不是**「（后台任务XXX已完成）」那种本地插入的气泡（服务端已经写了
 *      user 行 ⇒ 本地再插 ⇒ 刷新后重复）。
 */
export const TURN_STARTED_HINT_BODY = "后台任务回报已到达，正在继续处理";

/** `turn_started` 帧里本模块用得上的那部分载荷（其余字段原样带过，不碰）。 */
export interface TurnStartedHintInput {
  /** 这一轮在哪个会话里 —— **必填**（没有它就没法路由 ⇒ 没法提示）。 */
  sessionId?: string | null;
  /** 后台任务回报那封信的 id（收件箱行 id）—— 本模块**不用**（只搬运，不碰正文）。 */
  inboxId?: string | null;
  /** 后台作业 id —— 本模块**不用**。 */
  jobId?: string | null;
  /** 起轮原因 —— 当前固定 `"work_unit_result"`。 */
  reason?: string | null;
}

/** 算提示时需要的上下文。 */
export interface TurnStartedHintOptions {
  /**
   * 用户**当前正看着**的会话 id。
   * - `null` / 空 ⇒ 用户没在看任何会话（首页 / 其它页）⇒ 该提示；
   * - 等于 `sessionId` ⇒ **当前正看着的那个会话** ⇒ **不提示**
   *   （那儿已经自动 attach 去看实时了 ⇒ 再弹一条是噪音）。
   */
  viewingSessionId?: string | null;
  /** 那个会话的标题（取不到 ⇒ 兜底「新对话」）。 */
  sessionTitle?: string | null;
}

/** 一条「别的会话有后台任务回报」的提示。 */
export interface TurnStartedHint {
  /** 这一轮在哪个会话里（红点挂在它身上）。 */
  sessionId: string;
  /** 系统通知的标题（= 会话标题）。 */
  title: string;
  /** 系统通知的正文。 */
  body: string;
  /** **站内落点**（`/chat/<id>`）⇒ 点了能跳到那个会话 ⇒ 提示**点得动**。 */
  target: string;
}

/**
 * turnStartedHintTarget — 提示的站内落点。
 *
 * 与 `lib/notifications.ts` 的 `chatTarget(sessionId).href` **同一个形状**
 * （`/chat/${encodeURIComponent(id)}`）⇒ 点 Windows Toast 时主进程把它当
 * 站内 path 推回渲染层 ⇒ 渲染层 `navigate(target)` 跳到那个会话。
 */
export function turnStartedHintTarget(sessionId: string): string {
  return `/chat/${encodeURIComponent(sessionId)}`;
}

/**
 * buildTurnStartedHint — 算「别的会话有后台任务回报」这条提示。
 *
 * @returns 该提示；**不该提示时返回 null**（两种情况）：
 *   ① 载荷里**没有 sessionId** —— 没法路由 ⇒ 没法提示；
 *   ② **当前正看着的就是那个会话** —— 那儿已经自动 attach ⇒ 不提示（噪音）。
 *
 * ⛔ 本函数**纯计算**：不发请求、不插气泡、不碰报告正文。
 */
export function buildTurnStartedHint(
  input: TurnStartedHintInput | null | undefined,
  options: TurnStartedHintOptions = {},
): TurnStartedHint | null {
  const sessionId =
    typeof input?.sessionId === "string" ? input.sessionId.trim() : "";
  // ① 没有 sessionId ⇒ 没法路由 ⇒ 没法提示。
  if (!sessionId) return null;

  // ② 当前正看着的会话 ⇒ **不提示**（那儿已经自动 attach ⇒ 弹了是噪音）。
  const viewing = options.viewingSessionId ?? "";
  if (viewing && viewing === sessionId) return null;

  const title =
    typeof options.sessionTitle === "string" && options.sessionTitle.trim()
      ? options.sessionTitle.trim()
      : TURN_STARTED_HINT_TITLE_FALLBACK;

  return {
    sessionId,
    title,
    body: TURN_STARTED_HINT_BODY,
    target: turnStartedHintTarget(sessionId),
  };
}
