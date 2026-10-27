// =========================================================================
// chat-pending-approvals —— 待审批列表的本机持久化 + 增删 (契约 §7)
//
// ---------------------------------------------------------------------------
// 2026-10-28 · 任务书 04 · P-6 / P-10 / P-11 / P-12 / P-14
// ---------------------------------------------------------------------------
//   **P-6 · 待审批要持久化**
//     PC 端零持久化的口径是「不落任何用户数据到磁盘」, 但**待审批列表**必须
//     活过页面刷新 —— 否则用户点一下「刷新」, 正在等裁决的工具调用就永远
//     没人管了 (工具卡在 gaclaw 那儿, 前端再也看不见)。
//     ⇒ 落 localStorage (PC 端唯一可用的浏览器存储), key 按 sessionId 分键,
//       只存**审批身份 + 展示字段**, 不存任何正文 / 附件 / token。
//
//   **P-12 · 清审批要精确**
//     批掉一条 ⇒ **只删那一条**; 兄弟 pending 必须并存 (契约 L-32a / L-32b)。
//     ⛔ 整表清会把兄弟一起清掉 —— 而服务端真值仍在, 兄弟端会再收到这条,
//       于是「别的端已经批过了」这件事被本端悄悄吞掉。
//
//   **P-11 · 身份只认 `pending_id`**
//     审批事件里的 `id` 是 **tool_use_id** —— 同一个工具调用可能对应多个
//     pending, 拿 `id` 当身份会撞键 + 删错条 (契约 L-21)。
//     ⇒ 这里的增删**只**按 `pendingId` (= 事件的 `pending_id`) 走。
//
// ---------------------------------------------------------------------------
// ⚠️ 与 web 定稿版的关系
// ---------------------------------------------------------------------------
//   web 把待审批列表放在 zustand store + IndexedDB (`hydratePendingApprovals`),
//   PC 没有 zustand / IndexedDB ⇒ 这里是**同一套语义**的 PC 落点:
//   按 pending_id 去重 / 按 pending_id 精确删 / 刷新后能 hydrate 回来。
// =========================================================================

/** localStorage key —— 待审批列表 (按 sessionId 分键)。 */
export const PENDING_APPROVALS_STORAGE_KEY = "gacode.chat.pending-approvals.v1";

/** 风险等级。 */
export type ApprovalRiskLevel = "high" | "medium" | "low";

/**
 * 一条待审批。
 *
 * ⚠️ `pendingId` 是**唯一**的审批身份 (契约 L-21) —— ⛔ 绝不拿工具调用的
 *   `id` (tool_use_id) 冒充。
 */
export interface ApprovalRequest {
  /** local key — 列表内去重 (= pending_id)。 */
  id: string;
  /** ★ 审批身份 (契约 L-21) —— POST 时拼进 URL。 */
  pendingId: string;
  tool: string;
  title: string;
  detail?: string;
  riskLevel: ApprovalRiskLevel;
}

/** 落盘的形状 —— `{ [sessionId]: ApprovalRequest[] }`。 */
type StoredShape = Record<string, ApprovalRequest[]>;

function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function isApprovalRequest(v: unknown): v is ApprovalRequest {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.pendingId === "string" && o.pendingId !== "";
}

/** 读整张表 (所有 session)。 */
export function readAllPendingApprovals(): StoredShape {
  const s = storage();
  if (!s) return {};
  try {
    const raw = s.getItem(PENDING_APPROVALS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: StoredShape = {};
    for (const [sid, list] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      const kept = list.filter(isApprovalRequest);
      if (kept.length > 0) out[sid] = kept;
    }
    return out;
  } catch {
    return {};
  }
}

/** 读某个 session 的待审批列表。 */
export function loadPendingApprovals(sessionId: string): ApprovalRequest[] {
  if (!sessionId) return [];
  return readAllPendingApprovals()[sessionId] ?? [];
}

/**
 * 落盘某个 session 的待审批列表。
 *
 * ⚠️ 列表为空 ⇒ 把这个 session 的键**整个删掉** (不留空数组垃圾)。
 */
export function savePendingApprovals(
  sessionId: string,
  list: ApprovalRequest[],
): void {
  const s = storage();
  if (!s || !sessionId) return;
  try {
    const all = readAllPendingApprovals();
    if (list.length === 0) {
      delete all[sessionId];
    } else {
      all[sessionId] = list;
    }
    s.setItem(PENDING_APPROVALS_STORAGE_KEY, JSON.stringify(all));
  } catch (err) {
    // 隐私模式 / quota 满 ⇒ 只留内存态, 不冒泡打断主链路。
    console.warn("[pending-approvals] 落盘失败, 降级到内存态:", err);
  }
}

/**
 * 加一条 (按 pending_id 去重)。
 *
 * 重复的 pending_id ⇒ 保留**先到**的那条 (幂等, 不覆盖)。
 */
export function addPendingApproval(
  list: ApprovalRequest[],
  req: ApprovalRequest,
): ApprovalRequest[] {
  if (!req.pendingId) return list;
  if (list.some((p) => p.pendingId === req.pendingId)) return list;
  return [...list, req];
}

/**
 * 删一条 —— **只删这一条** (契约 L-32a / L-32b / 任务书 P-12)。
 *
 * ⛔ 不是「删掉不在集合里的」, 也不是「整表清」—— 兄弟 pending 必须留下。
 */
export function removePendingApproval(
  list: ApprovalRequest[],
  pendingId: string,
): ApprovalRequest[] {
  if (!pendingId) return list;
  const next = list.filter((p) => p.pendingId !== pendingId);
  return next.length === list.length ? list : next;
}
