// =========================================================================
// lib/supplement-boundary.ts
//   ★ [2026-11-14 · 订正 28 · L-28r] **补充边界**（会话收件箱 · 补充插队）
//
// ---------------------------------------------------------------------------
// 这个文件解决什么
// ---------------------------------------------------------------------------
//   「用户在 agent 跑的时候补了一句话（插队）」⇒ 后端**不另起一轮**（还是同一个
//   turn、同一把 SSE 流）⇒ agent 读到了补充并接着回答 ⇒ **功能是通的**，
//   但**排版不对**：两段回答被并成同一条 assistant 气泡，用户的补充排在它下面
//   ⇒ 看起来像「补充是在补充后内容下面」（PM 2026-11-14 真机报障）。
//
//   ⇒ 后端在补充并进去的那一刻发一个**无内容帧**（顶层字段 `supplementBoundary`，
//     跟 a4 的 `deletedDeliverables` 一个套路）⇒ 端侧据此把气泡**切开**：
//
//        [回答 A1 —— 一个气泡] [用户的补充 —— 自己的气泡] [续答 A2 —— 又一个气泡]
//
// ---------------------------------------------------------------------------
// 帧形态（**顶层字段**、不带 `type`）
// ---------------------------------------------------------------------------
//   data: {"supplementBoundary":{"id":"<收件箱行 id>",
//          "kind":"user_supplement","fromKind":"user","content":"<补充正文>"}}
//
//   · `id`       = 收件箱那一行的 id（合成气泡 id = `supplement:<id>`）
//   · `kind`     = `user_supplement`（用户补充）/ `work_unit_result`（任务回报）
//   · `fromKind` = `user` / `work_unit` / `agent` ⇒ **决定气泡按谁渲染**
//   · `content`  = 补充正文（气泡里显示的就是它）
//
// ⛔ 本文件**零运行时 import**（只有两个 `import type`）⇒
//   · 断言脚本可以直接 import 它跑行为断言；
//   · `lib/cancel.ts` / `lib/chat-sse.ts` 只引用它的**类型** ⇒ 运行时依赖不变
//     （那两个文件被别的测试按「固定依赖链」加载 ⇒ 加运行时 import 会炸）。
// =========================================================================

import type { RichEventBase } from "./rich-events";
import type { ExecutionPhase } from "../components/chat/ExecutionTimeline";

/** 补充边界的形状（帧顶层的 `supplementBoundary`）。 */
export interface SupplementBoundary {
  /** 收件箱行 id（合成气泡 id 用它）。 */
  id: string | null;
  /** `user_supplement` / `work_unit_result`。 */
  kind: string | null;
  /** `user` / `work_unit` / `agent` ⇒ 决定气泡按谁渲染。 */
  fromKind: string | null;
  /** 补充正文（气泡里显示的就是它）。 */
  content: string;
}

/** 合成气泡 id 的前缀（补充那条 + 历史里那一条**共用**）。 */
export const SUPPLEMENT_ROW_ID_PREFIX = "supplement:";

/** 收尾段（assistant 那一段被切开的前半截）的 id 前缀。 */
export const SUPPLEMENT_CUT_ID_PREFIX = "cut:";

/**
 * supplementRowId —— 合成气泡 id = `supplement:<收件箱行 id>`。
 *
 * ⚠️ **直播时插的那条**与**历史刷新回来的那条**（服务端 flush 时写的 user 行，
 *   带 `metadata.inbox_id`）必须算出**同一个** id ⇒ 否则同一条补充会显示两遍。
 */
export function supplementRowId(inboxId: string | null | undefined): string {
  return `${SUPPLEMENT_ROW_ID_PREFIX}${(inboxId ?? "").trim()}`;
}

/**
 * supplementRole —— 补充那条**按谁**渲染成一个气泡。
 *
 *   · `fromKind === "user"` ⇒ 用户气泡（用户自己补的那句话）
 *   · 其余（`work_unit` / `agent`）⇒ 助手气泡（后台任务回报）
 *
 * ⚠️ 这是**气泡角色**，跟「注入上下文一律按 user 角色」是两件事（契约 D2）。
 */
export function supplementRole(
  fromKind: string | null | undefined,
): "user" | "assistant" {
  return fromKind === "user" ? "user" : "assistant";
}

/**
 * parseSupplementBoundary —— 认出「补充边界」帧（**顶层字段**）。
 *
 *   · 不是这一帧（没有这个字段 / 字段不是对象）⇒ `null` ⇒ 调用方按原样处理；
 *   · 是这一帧 ⇒ 归一成一个对象（每个字段都容错，形状不对就退成 null / 空串）。
 *
 * ⚠️ 这是一个**无内容帧**（没有 content / thinking / done…）⇒
 *   端侧的归一层**不许**把它当「不认识的帧」整帧丢掉。
 */
export function parseSupplementBoundary(
  payload: unknown,
): SupplementBoundary | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const raw = (payload as Record<string, unknown>).supplementBoundary;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const id =
    typeof o.id === "string"
      ? o.id
      : o.id == null
        ? null
        : String(o.id);
  return {
    id: id === "" ? null : id,
    kind: typeof o.kind === "string" ? o.kind : null,
    fromKind: typeof o.fromKind === "string" ? o.fromKind : null,
    content: typeof o.content === "string" ? o.content : "",
  };
}

/**
 * isSupplementBoundaryFrame —— 这一帧是不是「补充边界」帧。
 */
export function isSupplementBoundaryFrame(payload: unknown): boolean {
  return parseSupplementBoundary(payload) !== null;
}

/** 一段（还没收尾的）assistant 内容。 */
export interface SupplementSegment {
  /** 正文。 */
  content: string;
  /** 这一段的富事件（工具卡片 / 文件 / 图片…）。 */
  richEvents: RichEventBase[];
  /** 这一段的思考 / 工具时间线。 */
  phases: ExecutionPhase[];
  /** 这一段的开始时刻（ms epoch）。 */
  startedAt: number | null;
  /** 这一段的结束时刻（ms epoch）；还没收尾 ⇒ null。 */
  finishedAt: number | null;
  /** 服务端给的累计耗时（ms）；没有 ⇒ 本地兜底。 */
  elapsedMs: number | null;
  /** 这一段的轮次身份（`tk_xxx`）。 */
  turnKey: string | null;
}

/** 「切开」出来的一条 assistant 气泡。 */
export interface ClosedSegmentRow {
  kind: "assistant";
  id: string;
  content: string;
  richEvents: RichEventBase[];
  phases: ExecutionPhase[];
  startedAt: number | null;
  finishedAt: number | null;
  elapsedMs: number | null;
  turnKey: string | null;
  createdAt: string;
}

/** 「切开」出来的一条补充气泡。 */
export interface SupplementRow {
  kind: "supplement";
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

/** 切一次的结果（两条气泡）。 */
export interface SupplementCutPlan {
  /** 收尾的那一段（前半截回答 ⇒ 独立气泡）。 */
  closedSegment: ClosedSegmentRow;
  /** 插进来的补充（⇒ 独立气泡，按自己的角色渲染）。 */
  supplementRow: SupplementRow;
}

/**
 * planSupplementCut —— 「补充边界」⇒ 这一轮该切成什么。
 *
 *   ⛔ **纯函数**（不碰 React / 不碰 IO）⇒ 行为可被断言脚本直接跑。
 *   ⛔ 端侧**零推算**：正文/事件/阶段/计时都是**搬过去**的，不是重算的。
 *
 * @param boundary 帧里的 `supplementBoundary`
 * @param segment  当前正在流式的那一段（要被收尾的）
 * @param now      切点时刻（ms epoch）
 */
export function planSupplementCut(params: {
  boundary: SupplementBoundary;
  segment: SupplementSegment;
  now: number;
}): SupplementCutPlan {
  const { boundary, segment, now } = params;
  const rowId = supplementRowId(boundary.id);
  const createdAt = new Date(now).toISOString();
  return {
    closedSegment: {
      kind: "assistant",
      id: `${SUPPLEMENT_CUT_ID_PREFIX}${rowId}`,
      content: segment.content,
      richEvents: segment.richEvents,
      phases: segment.phases,
      startedAt: segment.startedAt,
      // ★ 收尾 ⇒ 结束时刻落上（气泡上的秒表不再走）。
      finishedAt: now,
      elapsedMs:
        segment.elapsedMs ??
        (segment.startedAt != null ? Math.max(0, now - segment.startedAt) : null),
      turnKey: segment.turnKey,
      createdAt,
    },
    supplementRow: {
      kind: "supplement",
      id: rowId,
      role: supplementRole(boundary.fromKind),
      content: boundary.content ?? "",
      createdAt,
    },
  };
}
