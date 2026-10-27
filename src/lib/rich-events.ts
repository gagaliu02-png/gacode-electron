/**
 * Rich event 模型 —— 跨端 SSE 事件契约 v1.0 (定稿 · 已冻结)
 * 权威源: `docs/design/cross-platform-sse-event-contract.md`
 *
 * ---------------------------------------------------------------------------
 * 这个文件解决三件事
 * ---------------------------------------------------------------------------
 *   1. **判别联合** (契约 §2 / L-4 / L-11 / 任务书 W-8)
 *      `RichEventBase` 从「`type: string` + 开放索引签名」收窄成
 *      **20 个活 type + 5 个 tool_done subtype + 9 个 reserved 死类型** 的判别联合。
 *      未知 `type` 在**编译期**就报错 (契约 §14.4 W7 断言)。
 *      ⚠️ 其中 3 个 (think / planify_start / planify_done) 按契约 L-2
 *        **只建模、不渲染** —— 归一层把它们当「未知事件」跳过 (见 L2_UNKNOWN_RICH_EVENT_TYPES)。
 *
 *   2. **解码归一** (L-8 / L-9 / L-11 / L-12)
 *      - L-8 键不存在 ≡ 值为 null —— 归一层把缺失键补成 null, 读取方不必假设键存在;
 *      - L-9 单条坏不牵连全批 —— 归一**逐条**做, 坏的那条跳过 + 记诊断, 其余照常;
 *      - L-11 未知类型安全降级 —— 跳过该条 + 记诊断, 不抛错、不整帧归零;
 *      - L-12 `category` 字段必须忽略 —— 归一后**不保留** `category`
 *        (call_tree 包装的事件按 `type` 判定, 见契约 §2.4 L-3)。
 *
 *   3. **去重** (L-14 ~ L-18 / 任务书 W-9)
 *      旧协议双写: `file` 与 `tool_done(subtype=file)` 同源, `image` 与
 *      `tool_done(subtype=image)` 同源 ⇒ 同一**事件族**内同 `id` 只渲染一次,
 *      **保留新协议那条**。
 *      ⛔ **不是**按裸 `id` 去重 —— 同一个 `tool_use_id` 最多被 6 个事件复用
 *      (契约 §5.1), 裸 id 去重会把 `tool_done` 气泡吃掉。
 *      `web_preview` 的 id 是 `file` 的 id 加 `_web` 后缀 ⇒ **不参与**去重 (L-16)。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 字段可空性以**契约 §3** 为准 (gaclaw 生产代码里 `JSON.stringify` 会把
 *    `undefined` 的键直接删掉 ⇒ 「键不存在」是常态, 不是异常)。
 * ---------------------------------------------------------------------------
 */

/** tool_done 的 5 个**活** subtype (契约 §2.3). */
export type ToolDoneSubtype =
  | "file"
  | "image"
  | "code_diff"
  | "chart"
  | "doc_summary";

/**
 * 20 个**活**的独立 `type`。
 *
 * ⚠️ 契约 §2.1 那张表有 20 行, 但 `image` 有 3 个产出点、`result` 有 2 个
 *   ⇒ 去重后 §2.1 是 **17 个**; 再加 §2.2 补的 3 个 ⇒ **20 个**。
 *
 * ⚠️ 末尾 3 个 (think / planify_start / planify_done) 按契约 **L-2** 只建模、
 *   **不渲染** —— 归一层当「未知事件」跳过。
 */
export type LiveRichEventType =
  // §2.1 —— 工具链
  | "tool_start"
  | "tool_done"
  | "tool_fail"
  // §2.1 —— 交付物
  | "file"
  | "web_preview"
  | "image"
  // §2.1 —— 结果 / 交接
  | "result"
  | "agent_handoff"
  // §2.1 —— 审批
  | "approval_request"
  | "approval_granted"
  | "approval_denied"
  // §2.1 —— IM 接入
  | "qrcode"
  | "gateway_connected"
  // §2.1 —— supervisor 链路树
  | "step_started"
  | "step_done"
  | "step_failed"
  | "report"
  // §2.2 —— 草案漏掉的 3 个活类型 (L-2: 必须按「未知事件」处理)
  | "think"
  | "planify_start"
  | "planify_done";

/**
 * 9 个**死**类型 (契约 §2.5 / L-4).
 * 生产代码里永不作为 `type` 出现 ⇒ 数据模型里**保留占位** (L-5),
 * 但**不得**参与任何状态机、**不得**渲染占位卡片。
 */
export type ReservedRichEventType =
  | "plan"
  | "task_complete"
  | "confirm_request"
  | "handoff"
  | "code_diff"
  | "chart"
  | "doc_summary"
  | "skill_result"
  | "skill_tool";

/** 全部可能的 `type` 值 (活 + 死). */
export type RichEventType = LiveRichEventType | ReservedRichEventType;

// =========================================================================
// 判别联合 —— 每个成员一个字面量 `type`
// =========================================================================

export interface RichToolStart {
  type: "tool_start";
  id: string | null;
  tool: string | null;
  /** 无 `|| null` 兜底 ⇒ 键可能直接消失 (契约 §3.1) */
  args: unknown;
}

export interface RichToolDone {
  type: "tool_done";
  id: string | null;
  tool: string | null;
  duration_ms: number | null;
  /** 5 个活 subtype 之一; 生产不产出的 subtype 一律归一成 null */
  subtype: ToolDoneSubtype | null;
  // ↓↓↓ subtype=file / subtype=image 的旧协议双写载荷 (与同名独立事件同形)
  url: string | null;
  name: string | null;
  title: string | null;
  mime: string | null;
  size: number | null;
  alt: string | null;
  prompt: string | null;
  // ↓↓↓ subtype=code_diff / chart / doc_summary 的载荷 (字段名以生产产出点为准,
  //      这里宽松取; 渲染层按「有就用、没有就降级」处理)
  path: string | null;
  diff: string | null;
  chart_type: string | null;
  data: unknown;
  summary: string | null;
  citations: unknown;
}

export interface RichToolFail {
  type: "tool_fail";
  id: string | null;
  tool: string | null;
  duration_ms: number | null;
  error: string | null;
}

export interface RichFile {
  type: "file";
  id: string | null;
  /** null 的成因有 3 种 (契约 §3.1) —— 端侧**不得**因空 url 跳过渲染 (L-10) */
  url: string | null;
  name: string | null;
  fileName: string | null;
  size: number | null;
  sizeBytes: number | null;
  localPath: string | null;
  mimeType: string | null;
  mime: string | null;
  /** 恒 'ai_generated' (交付物事件) */
  origin: string | null;
}

export interface RichWebPreview {
  type: "web_preview";
  id: string | null;
  /** 恒非空 (生产有 publicUrl 守卫) */
  url: string | null;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
}

export interface RichImage {
  type: "image";
  id: string | null;
  url: string | null;
  alt: string | null;
  prompt: string | null;
  origin: string | null;
}

export interface RichResult {
  type: "result";
  id: string | null;
  format: string | null;
  title: string | null;
  /** 对象分支可为 null; **数组分支无此键** (契约 L-7) */
  rows: unknown;
  cards: unknown;
  summary: string | null;
  source_skill: string | null;
  executed_tool: string | null;
}

export interface RichAgentHandoff {
  type: "agent_handoff";
  id: string | null;
  task: string | null;
  from: string | null;
  to: string | null;
  depth: number | null;
}

export interface RichApprovalRequest {
  type: "approval_request";
  id: string | null;
  /** ★ 真源标识 (契约 L-21) —— `id` 是 tool_use_id, **不是** pending id */
  pending_id: string | null;
  tool: string | null;
  title: string | null;
  detail: string | null;
  detail_truncated: boolean | null;
  truncated_chars: number | null;
  input_length: number | null;
  input_full_pending: boolean | null;
  risk_level: string | null;
  system_notification: boolean | null;
}

export interface RichApprovalGranted {
  type: "approval_granted";
  id: string | null;
  pending_id: string | null;
  tool: string | null;
  approved_by: string | null;
}

export interface RichApprovalDenied {
  type: "approval_denied";
  id: string | null;
  pending_id: string | null;
  tool: string | null;
  reason: string | null;
}

export interface RichQrcode {
  type: "qrcode";
  id: string | null;
  qrcode_img_content: string | null;
  title: string | null;
  gateway_id: string | null;
  expire_seconds: number | null;
}

export interface RichGatewayConnected {
  type: "gateway_connected";
  id: string | null;
  gateway_id: string | null;
  gateway_label: string | null;
  account_id: string | null;
  ts: number | null;
}

export interface RichStepStarted {
  type: "step_started";
  id: string | null;
  correlationId: string | null;
  stepIndex: number | null;
  stepDesc: string | null;
  ts: number | null;
}

export interface RichStepDone {
  type: "step_done";
  id: string | null;
  correlationId: string | null;
  stepIndex: number | null;
  stepDesc: string | null;
  reply: string | null;
  ts: number | null;
}

export interface RichStepFailed {
  type: "step_failed";
  id: string|null;
  correlationId: string | null;
  stepIndex: number | null;
  stepDesc: string | null;
  error: string | null;
  ts: number | null;
}

export interface RichReport {
  type: "report";
  id: string | null;
  correlationId: string | null;
  totalSteps: number | null;
  completedSteps: number | null;
  failedSteps: number | null;
  durationMs: number | null;
  callTree: unknown;
  ts: number | null;
  summary: string | null;
}

export interface RichThink {
  type: "think";
  id: string | null;
  corr: string | null;
  reasoning: string | null;
  ts: number | null;
}

export interface RichPlanifyStart {
  type: "planify_start";
  id: string | null;
  corr: string | null;
  task: string | null;
  maxSteps: number | null;
  ts: number | null;
}

export interface RichPlanifyDone {
  type: "planify_done";
  id: string | null;
  corr: string | null;
  steps: unknown;
  ts: number | null;
}

// --- 9 个死类型: 保留占位 (L-5), 但生产永不产出 ---
export interface RichPlan {
  type: "plan";
  reserved: true;
}
export interface RichTaskComplete {
  type: "task_complete";
  reserved: true;
}
export interface RichConfirmRequest {
  type: "confirm_request";
  reserved: true;
}
export interface RichHandoff {
  type: "handoff";
  reserved: true;
}
export interface RichCodeDiff {
  type: "code_diff";
  reserved: true;
}
export interface RichChart {
  type: "chart";
  reserved: true;
}
export interface RichDocSummary {
  type: "doc_summary";
  reserved: true;
}
export interface RichSkillResult {
  type: "skill_result";
  reserved: true;
}
export interface RichSkillTool {
  type: "skill_tool";
  reserved: true;
}

/**
 * Rich event 判别联合 —— **全部**成员.
 *
 * ⚠️ 死类型 (`RichPlan` 等) 只在**类型层**占位; 解码层 (`normalizeRichEvent`)
 *    遇到它们直接跳过 (不构造实例) ⇒ 运行期永远看不到死类型实例。
 */
export type RichEventBase =
  | RichToolStart
  | RichToolDone
  | RichToolFail
  | RichFile
  | RichWebPreview
  | RichImage
  | RichResult
  | RichAgentHandoff
  | RichApprovalRequest
  | RichApprovalGranted
  | RichApprovalDenied
  | RichQrcode
  | RichGatewayConnected
  | RichStepStarted
  | RichStepDone
  | RichStepFailed
  | RichReport
  | RichThink
  | RichPlanifyStart
  | RichPlanifyDone
  | RichPlan
  | RichTaskComplete
  | RichConfirmRequest
  | RichHandoff
  | RichCodeDiff
  | RichChart
  | RichDocSummary
  | RichSkillResult
  | RichSkillTool;

// =========================================================================
// ChatPhase —— 执行信息容器的时间线条目 (M2 P0-3)
// =========================================================================

/**
 * 一条相位记录 —— 「思考中」或「工具调用」。
 *
 * 跟 Android yinian-android ActivityPhase 对齐 (ChatDetailScreen.kt:1869-2000),
 * 但用扁平对象而不是 sealed interface (JS 友好)。
 * server 端落盘 schema (unified-api/src/modules/yinian/yinian.chat.routes.js:1274-1277):
 *   `[{ type: 'thinking', text?: string, ts: ms }, { type: 'tool', event: ..., ts: ms }]`
 *
 * ⚠️ 流式期间客户端按到达顺序自行累积; 流结束后服务端用真实的 phases_json 覆盖。
 */
export interface ChatPhase {
  type: "thinking" | "tool";
  /** 仅 thinking phase 有 —— 累积同一段思考链的多 chunk。 */
  text?: string;
  /** 仅 tool phase 有 —— rich_event 子集。 */
  event?: RichEventBase;
  /** ms epoch —— 时间线渲染顺序对齐。 */
  ts: number;
}

// =========================================================================
// 类型名单 (运行时判据)
// =========================================================================

/** 20 个活 type 的集合. */
export const LIVE_RICH_EVENT_TYPES: readonly LiveRichEventType[] = [
  "tool_start",
  "tool_done",
  "tool_fail",
  "file",
  "web_preview",
  "image",
  "result",
  "agent_handoff",
  "approval_request",
  "approval_granted",
  "approval_denied",
  "qrcode",
  "gateway_connected",
  "step_started",
  "step_done",
  "step_failed",
  "report",
  "think",
  "planify_start",
  "planify_done",
];

/** 9 个死 type 的集合 (契约 §2.5). */
export const RESERVED_RICH_EVENT_TYPES: readonly ReservedRichEventType[] = [
  "plan",
  "task_complete",
  "confirm_request",
  "handoff",
  "code_diff",
  "chart",
  "doc_summary",
  "skill_result",
  "skill_tool",
];

const LIVE_TYPE_SET = new Set<string>(LIVE_RICH_EVENT_TYPES);
const RESERVED_TYPE_SET = new Set<string>(RESERVED_RICH_EVENT_TYPES);

/**
 * ★ L-2: §2.2 的 3 个类型 (`think` / `planify_start` / `planify_done`)。
 *
 * 这 3 个**在生产里确实有产出** (契约 §2.2 表), 所以**数据模型里要留着**
 * (任务书 W-6: 判别联合对齐「20 活类型」) —— 否则安卓会整帧丢 (契约 L-6)。
 *
 * 但**端侧行为**必须按「未知事件」处理 (契约 L-2 原文):
 *   「不渲染、不报错、不中断本批其余事件 … 三端都**不得**为它们写「等它来」的逻辑」
 *
 * ⇒ 归一层把它们**跳过** (skipReason = "unknown_type"): 不进事件列表 ⇒
 *   不进渲染分支、也不进 ExecutionTimeline 时间线; 但**同批的其余事件照常渲染**
 *   (L-9 逐条容错)。
 *
 * ⚠️ 内容不会丢: 思考正文走的是 SSE 顶层 `reasoning` 字段 (ChatChunk.reasoning),
 *   跟 `think` 事件是两条独立通道 —— 跳过 `think` 只影响「时间线里多一格 think」。
 */
export const L2_UNKNOWN_RICH_EVENT_TYPES: readonly LiveRichEventType[] = [
  "think",
  "planify_start",
  "planify_done",
];

const L2_UNKNOWN_TYPE_SET = new Set<string>(L2_UNKNOWN_RICH_EVENT_TYPES);

/** tool_done 的 5 个活 subtype. */
export const TOOL_DONE_SUBTYPES: readonly ToolDoneSubtype[] = [
  "file",
  "image",
  "code_diff",
  "chart",
  "doc_summary",
];

const SUBTYPE_SET = new Set<string>(TOOL_DONE_SUBTYPES);

// =========================================================================
// 字段表 —— 归一层按它把「缺失键」补成 null (L-8)
// =========================================================================

/**
 * 每个活 type 的字段清单。
 * ⚠️ 归一后的对象**只**含 `type` + 这里列出的键 —— 别的键 (含 `category`) 一律丢弃
 *    (L-12: `category` 必须忽略)。
 */
const FIELD_SPECS: Record<LiveRichEventType, readonly string[]> = {
  tool_start: ["id", "tool", "args"],
  tool_done: [
    "id",
    "tool",
    "duration_ms",
    "subtype",
    "url",
    "name",
    "title",
    "mime",
    "size",
    "alt",
    "prompt",
    "path",
    "diff",
    "chart_type",
    "data",
    "summary",
    "citations",
  ],
  tool_fail: ["id", "tool", "duration_ms", "error"],
  file: [
    "id",
    "url",
    "name",
    "fileName",
    "size",
    "sizeBytes",
    "localPath",
    "mimeType",
    "mime",
    "origin",
  ],
  web_preview: ["id", "url", "title", "description", "thumbnail_url"],
  image: ["id", "url", "alt", "prompt", "origin"],
  result: [
    "id",
    "format",
    "title",
    "rows",
    "cards",
    "summary",
    "source_skill",
    "executed_tool",
  ],
  agent_handoff: ["id", "task", "from", "to", "depth"],
  approval_request: [
    "id",
    "pending_id",
    "tool",
    "title",
    "detail",
    "detail_truncated",
    "truncated_chars",
    "input_length",
    "input_full_pending",
    "risk_level",
    "system_notification",
  ],
  approval_granted: ["id", "pending_id", "tool", "approved_by"],
  approval_denied: ["id", "pending_id", "tool", "reason"],
  qrcode: ["id", "qrcode_img_content", "title", "gateway_id", "expire_seconds"],
  gateway_connected: ["id", "gateway_id", "gateway_label", "account_id", "ts"],
  step_started: ["id", "correlationId", "stepIndex", "stepDesc", "ts"],
  step_done: ["id", "correlationId", "stepIndex", "stepDesc", "reply", "ts"],
  step_failed: ["id", "correlationId", "stepIndex", "stepDesc", "error", "ts"],
  report: [
    "id",
    "correlationId",
    "totalSteps",
    "completedSteps",
    "failedSteps",
    "durationMs",
    "callTree",
    "ts",
    "summary",
  ],
  think: ["id", "corr", "reasoning", "ts"],
  planify_start: ["id", "corr", "task", "maxSteps", "ts"],
  planify_done: ["id", "corr", "steps", "ts"],
};

// =========================================================================
// 解码归一 (L-8 / L-9 / L-11 / L-12)
// =========================================================================

/** 一条事件被跳过的原因. */
export type RichEventSkipReason =
  /** 不是对象 / 没有可用的 `type` 字段 */
  | "malformed"
  /** 9 个死类型 (契约 §2.5) —— 已知不会来, 静默跳过 */
  | "reserved_type"
  /** 名单外的类型 (契约 L-11) —— 跳过 + 记诊断 */
  | "unknown_type";

export interface RichEventNormalizeResult {
  /** 归一后的事件; 被跳过时为 null */
  event: RichEventBase | null;
  /** 被跳过时的原因 (诊断用) */
  skipReason?: RichEventSkipReason;
  /** 被跳过时的原始 `type` (诊断用) */
  skipType?: string;
}

/**
 * normalizeRichEvent —— 把一条原始载荷归一成事件模型里的实例。
 *
 * - 键不存在 ⇒ 该字段为 `null` (L-8)
 * - `category` 被丢弃 (L-12)
 * - 死类型 ⇒ `skipReason: "reserved_type"` (L-4 / L-5)
 * - §2.2 的 3 个类型 ⇒ `skipReason: "unknown_type"` (L-2 —— 只建模、不渲染)
 * - 名单外类型 ⇒ `skipReason: "unknown_type"` (L-11)
 * - **单条失败不影响其它条** (L-9) —— 本函数只处理一条, 不抛错
 */
export function normalizeRichEvent(raw: unknown): RichEventNormalizeResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { event: null, skipReason: "malformed" };
  }
  const obj = raw as Record<string, unknown>;
  const type = obj.type;
  if (typeof type !== "string" || type === "") {
    return { event: null, skipReason: "malformed" };
  }
  if (RESERVED_TYPE_SET.has(type)) {
    // L-4 / L-5: 死类型 —— 生产永不产出。保留占位但不构造实例、不进状态机。
    return { event: null, skipReason: "reserved_type", skipType: type };
  }
  if (L2_UNKNOWN_TYPE_SET.has(type)) {
    // L-2: §2.2 的 3 个类型按「未知事件」处理 —— 不渲染、不报错、不中断本批。
    return { event: null, skipReason: "unknown_type", skipType: type };
  }
  if (!LIVE_TYPE_SET.has(type)) {
    // L-11: 未知类型 —— 跳过该条 + 记诊断 (不抛错、不整帧归零)。
    return { event: null, skipReason: "unknown_type", skipType: type };
  }

  const liveType = type as LiveRichEventType;
  const fields = FIELD_SPECS[liveType];
  const out: Record<string, unknown> = { type };
  for (const f of fields) {
    const v = obj[f];
    // L-8: 键不存在 ≡ 值为 null
    out[f] = v === undefined ? null : v;
  }
  // tool_done 的 subtype 收窄到 5 个活 subtype 之一, 名单外的一律归 null
  // (契约 §2.3 —— 只有这 5 个是活的)。
  if (liveType === "tool_done") {
    const sub = out.subtype;
    out.subtype = typeof sub === "string" && SUBTYPE_SET.has(sub) ? sub : null;
  }
  // ★ 审批事件的 `pending_id` 有两个别名 (契约 §11.3 W7 / 任务书 W-11):
  //   snake `pending_id` 与 camel `pendingId` 都要认 —— 生产 gaclaw 发的是
  //   `pending_id` (approval-guard.js:547), 但别的产出点 / 老版本可能是 camel。
  //   ⛔ 认 `pending_id` **不等于**认 `id` —— `id` 是 tool_use_id, 不是审批身份 (L-21)。
  if (
    liveType === "approval_request" ||
    liveType === "approval_granted" ||
    liveType === "approval_denied"
  ) {
    const snake = obj.pending_id;
    const camel = obj.pendingId;
    out.pending_id =
      typeof snake === "string" && snake !== ""
        ? snake
        : typeof camel === "string" && camel !== ""
          ? camel
          : null;
  }
  return { event: out as unknown as RichEventBase };
}

export interface NormalizeRichEventsResult {
  /** 归一成功的事件 (保持到达顺序) */
  events: RichEventBase[];
  /** 被跳过的条目 (逐条容错, L-9) */
  skipped: Array<{ reason: RichEventSkipReason; type?: string }>;
}

/**
 * normalizeRichEvents —— **逐条**归一 (L-9)。
 *
 * 一批事件里夹一条畸形 / 未知 / 死类型 ⇒ 只有那一条被跳过, 其余全部保留。
 */
export function normalizeRichEvents(rawList: unknown): NormalizeRichEventsResult {
  const events: RichEventBase[] = [];
  const skipped: Array<{ reason: RichEventSkipReason; type?: string }> = [];
  if (!Array.isArray(rawList)) return { events, skipped };
  for (const raw of rawList) {
    let res: RichEventNormalizeResult;
    try {
      res = normalizeRichEvent(raw);
    } catch {
      // L-9: 归一本身也不许牵连全批
      res = { event: null, skipReason: "malformed" };
    }
    if (res.event) events.push(res.event);
    else skipped.push({ reason: res.skipReason ?? "malformed", type: res.skipType });
  }
  return { events, skipped };
}

// =========================================================================
// 去重 (L-14 ~ L-18)
// =========================================================================

/** 事件族 —— 只有两族参与去重 (契约 L-15). */
export type RichEventFamily = "file" | "image";

/**
 * richEventFamily —— 事件属于哪一族 (不属于任何族时返回 null)。
 *
 * 族 A = `{file}` ∪ `{tool_done|subtype=file}`
 * 族 B = `{image}` ∪ `{tool_done|subtype=image}`
 * `tool_done` (无 subtype) / `tool_start` / `tool_fail` / `web_preview` **一律不入族**。
 */
export function richEventFamily(ev: RichEventBase): RichEventFamily | null {
  if (ev.type === "file") return "file";
  if (ev.type === "image") return "image";
  if (ev.type === "tool_done") {
    if (ev.subtype === "file") return "file";
    if (ev.subtype === "image") return "image";
  }
  return null;
}

/**
 * eventIdOf —— 取事件的 `id` (没有就 null)。
 *
 * ⚠️ 9 个死类型成员**没有** `id` 字段 (它们只是占位) ⇒ 这里用 `in` 收窄,
 *    不让联合类型的属性访问直接编译不过。
 */
export function eventIdOf(ev: RichEventBase): string | null {
  return "id" in ev && typeof ev.id === "string" ? ev.id : null;
}

/**
 * dedupeRichEvents —— 旧协议双写去重 (契约 L-14 ~ L-18)。
 *
 * 规则:
 *   - 同一**事件族**内、同一个 `id` ⇒ 只保留一条, 且**保留新协议那条**
 *     (`file` / `image`; 旧协议那条 `tool_done` 丢弃);
 *   - 跨族**不**去重;
 *   - `tool_done` (无 subtype) / `tool_start` / `tool_fail` / `web_preview` 一律不去重;
 *   - 重复到达 (重连回放) 同样按同族同 id 处理 (L-18)。
 */
export function dedupeRichEvents(events: RichEventBase[]): RichEventBase[] {
  const out: RichEventBase[] = [];
  const indexByKey = new Map<string, number>();
  for (const ev of events) {
    const family = richEventFamily(ev);
    const id = eventIdOf(ev);
    if (!family || typeof id !== "string" || id === "") {
      out.push(ev);
      continue;
    }
    const key = `${family}\0${id}`;
    const idx = indexByKey.get(key);
    if (idx === undefined) {
      indexByKey.set(key, out.length);
      out.push(ev);
      continue;
    }
    // 同族同 id 已有一条 —— 保留**新协议**那条 (file / image)。
    const prev = out[idx];
    const prevIsLegacy = prev.type === "tool_done";
    const curIsLegacy = ev.type === "tool_done";
    if (prevIsLegacy && !curIsLegacy) {
      // 旧协议那条先到 → 原地换成新协议那条 (顺序不变, 只渲染一次)
      out[idx] = ev;
    }
    // 其余 (新协议先到 / 两条都是新协议) ⇒ 保留先到的那条, 后到的丢弃。
  }
  return out;
}
