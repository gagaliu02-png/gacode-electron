// =========================================================================
// degrade —— 降级闭环 (架构 §5.2 / T-07 / T-08 / G-4 / 契约订正 3)
// ---------------------------------------------------------------------------
// 为什么有这个文件
// ---------------------------------------------------------------------------
//   「接不回来」在 v1 是**错误**: HTTP 409 / 弹 toast / 内容直接消失。
//   v2 把它改成**常态分支**:
//
//       attach_failed
//         ├─ 带 snapshot ⇒ **先渲染快照** (正文非空, 不许空手而归)
//         └─ 不带 snapshot ⇒ 回落历史
//       ⇒ 全程**不弹错误**。
//
//   ⚠️ 降级路径必须是**常态可走**的分支, 不是异常分支 (架构 §6 硬规则):
//     「端侧不得依赖 seq 一定连续, 也不得依赖游标一定被服务端接受」。
//
// ---------------------------------------------------------------------------
// 降级的三种来源
// ---------------------------------------------------------------------------
//   ① `attach_failed` —— 服务端说接不回来 (7 种原因码)
//   ② seq 跳号 —— 端侧判定有洞 (T-09)
//   ③ `stream-state` 不可达 —— 服务端问不到 (不是「没在跑」!)
//
//   三者的**共同点**: 都不能让用户看到错误, 都必须**带着内容**回落。
//   第 ③ 种尤其要小心: 「问不到」≠「没在跑」⇒ **不许抹游标**
//   (缺陷 A-3: 一断网就把游标抹了 ⇒ 回来只能整轮重放)。
//
// ---------------------------------------------------------------------------
// ⛔ 本文件**不许** import window / fetch / js-cookie —— PC 要抄这份定稿。
// =========================================================================

import {
  mergeServerSnapshot,
  normalizeRenderedSnapshot,
  type TurnRenderedSnapshot,
  type TurnSummaryLike,
} from "./turn-record";

/** 降级原因码 (v1 四种 + v2 扩展三种, 契约订正 3)。 */
export type DegradeReason =
  // ── v1 (L-50) ──
  | "no_active_stream"
  | "buffer_expired"
  | "not_running"
  | "unknown"
  // ── v2 扩展 (订正 3) ──
  | "turn_ended"
  | "upstream_dead"
  | "log_gap"
  | "bad_cursor"
  | "cursor_ahead"
  // ── 端侧自己判出来的 ──
  | "seq_gap"
  | "stream_state_unreachable";

/** 服务端给的轮次快照 (降级时**必须带内容**, T-08)。 */
export interface ServerSnapshotLike extends TurnSummaryLike {
  /** 终态分类。 */
  terminalReason?: string | null;
  /** 完整度。 */
  completeness?: string | null;
}

/**
 * 降级计划 —— 「接不回来」之后端侧**做什么**。
 *
 * ⚠️ `raiseError` **恒为 false** —— 降级不弹错误 (G-4)。
 *   这个字段存在的意义: 让「降级会弹错误」这件事在类型层面就**写不出来**。
 */
export interface DegradePlan {
  /** 降级原因。 */
  reason: DegradeReason;
  /** 要不要渲染服务端给的快照。 */
  renderSnapshot: boolean;
  /** 要不要回落历史 (正文 + 交付物 + 审批)。 */
  fallbackToHistory: boolean;
  /** ★ 恒为 false —— 降级**不弹错误**。 */
  raiseError: false;
  /** 静默提示 (null = 完全静默, 什么都不说)。 */
  notice: string | null;
  /** ★ 本地游标**要不要保留**。 */
  keepCursor: boolean;
}

/**
 * planDegrade —— 算降级计划 (纯函数)。
 *
 * @param input.reason  原因码 (服务端给的或端侧判出来的)
 * @param input.snapshot 服务端给的快照 (老服务端**没有** ⇒ null/undefined)
 * @param input.unreachable 是不是「服务端问不到」(⇒ 更不能抹游标)
 */
export function planDegrade(input: {
  reason?: string | null;
  snapshot?: ServerSnapshotLike | null;
  unreachable?: boolean;
}): DegradePlan {
  const reason = normalizeReason(input.reason);
  const hasSnapshot = !!input.snapshot && typeof input.snapshot === "object";

  return {
    reason,
    // ★ 有快照就渲染 (T-08) —— 「接回来但内容没了」是绝对不允许的。
    renderSnapshot: hasSnapshot,
    // ★ 回落历史**永远**要做 —— 快照只是「这一轮已经产出了什么」,
    //   历史才是「这一轮最终落库成什么」。
    fallbackToHistory: true,
    // ★ 降级常态 ⇒ 不弹错误。
    raiseError: false,
    // 完全静默 (契约 L-50: attach 失败**静默**回落历史补拉)。
    notice: null,
    // ★ 游标只在「确实没在跑 / 轮次已终结」时才可以丢;
    //   「问不到」与「跳号」都必须**留着** —— 留着才能接回来。
    keepCursor: !(reason === "not_running" || reason === "turn_ended"),
  };
}

/**
 * applyDegrade —— 把降级计划落到本端快照上。
 *
 * ⚠️ 顺序很重要: **先并快照, 再回落历史** (架构 §5.2)。
 *   ⇒ 快照里的内容先渲染出来, 历史补拉再把服务端最终落库的内容覆盖上去。
 */
export function applyDegrade(
  snapshot: TurnRenderedSnapshot,
  plan: DegradePlan,
  serverSnapshot?: ServerSnapshotLike | null
): TurnRenderedSnapshot {
  if (!plan.renderSnapshot || !serverSnapshot) return snapshot;
  return mergeServerSnapshot(snapshot, serverSnapshot);
}

/**
 * readServerSnapshot —— 从 `attach_failed` 帧里读出快照 (老服务端没有 ⇒ null)。
 *
 * ⚠️ 快照字段缺失 / 形状不对 ⇒ 按**空快照**处理, **不得**因此中断 (订正 3)。
 */
export function readServerSnapshot(payload: unknown): ServerSnapshotLike | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  const snap = o.snapshot;
  if (!snap || typeof snap !== "object") return null;
  const s = snap as Record<string, unknown>;
  return {
    startedAt: typeof s.startedAt === "number" ? s.startedAt : null,
    elapsedMs: typeof s.elapsedMs === "number" ? s.elapsedMs : null,
    toolCallCount: typeof s.toolCallCount === "number" ? s.toolCallCount : null,
    thinkingCount: typeof s.thinkingCount === "number" ? s.thinkingCount : null,
    phases: Array.isArray(s.phases) ? (s.phases as ServerSnapshotLike["phases"]) : null,
    content: typeof s.content === "string" ? s.content : null,
    events: Array.isArray(s.events) ? (s.events as ServerSnapshotLike["events"]) : null,
    terminalReason: typeof s.terminalReason === "string" ? s.terminalReason : null,
    completeness: typeof s.completeness === "string" ? s.completeness : null,
  };
}

/**
 * normalizeReason —— 把任意原因码归一成 `DegradeReason`。
 *
 * ⚠️ 未知原因码 ⇒ `unknown` (**不抛**): 服务端以后加新码, 老端侧不能崩。
 */
export function normalizeReason(raw: string | null | undefined): DegradeReason {
  switch (raw) {
    case "no_active_stream":
    case "buffer_expired":
    case "not_running":
    case "unknown":
    case "turn_ended":
    case "upstream_dead":
    case "log_gap":
    case "bad_cursor":
    case "cursor_ahead":
    case "seq_gap":
    case "stream_state_unreachable":
      return raw;
    default:
      return "unknown";
  }
}

/**
 * snapshotHasContent —— 这个快照**有内容**吗。
 *
 * ⚠️ 「降级必须带内容」 (G-4): 判据 = 正文非空 **或** 有阶段/事件。
 *   一个空快照跟没快照一样 —— 渲染它只是渲染了个空气泡。
 */
export function snapshotHasContent(snapshot: ServerSnapshotLike | null | undefined): boolean {
  if (!snapshot || typeof snapshot !== "object") return false;
  const norm = normalizeRenderedSnapshot(snapshot);
  if (norm.content.trim() !== "") return true;
  if (norm.phases.length > 0) return true;
  if (norm.events.length > 0) return true;
  return false;
}
