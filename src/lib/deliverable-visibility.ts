// =========================================================================
// deliverable-visibility —— 「已被服务端删除的交付物」的可见性判据 (a4 契约 v1)
//
// ---------------------------------------------------------------------------
// 2026-10-28 · 任务书 05b · W-1 / W-3 / H-1 / H-2 / H-3 / H-9
// ---------------------------------------------------------------------------
//   **W-3 · 气泡收敛**
//     交付物从服务端消失后, 交付中心里那张卡没了, 但**消息气泡里**那张卡还在
//     —— 气泡只认 rich_event, 它自己不知道文件没了 ⇒ 用户点进去是个死链。
//     ⇒ 这里给出**唯一的**判据与两个过滤器, 页面层只负责接线。
//
//   **H-1 · 判据只有一条**
//     「事件带了**交付物主键**, 且这个主键在已删除集合里」。
//     ⛔ 判据**不能**是「查服务端这个 id 还在不在」—— 那会把「从没同步过的
//       老会话气泡」误判成消失 (历史消息气泡集体消失 = 严重回归)。
//       ⇒ 本文件是**纯函数**, 一个网络请求都没有。
//
//   **H-2 · 绝不误杀**
//     事件没带 id (老服务端 / 老 fixture) ⇒ **照常渲染**。
//
//   **H-3 · web_preview 不参与**
//     它的 id 空间跟交付物主键**不是一个空间** (安卓基线 `DeliverableVisibility`
//     同款裁定) ⇒ 拿它比对只会误判 ⇒ 不参与判据。
//     ⇒ 复用 PC 自己 `lib/rich-events.ts` 的**族判定** `richEventFamily`
//       (契约 L-15: 族 A = {file} ∪ {tool_done|subtype=file};
//         族 B = {image} ∪ {tool_done|subtype=image};
//         `web_preview` / 无 subtype 的 `tool_done` 一律不入族)。
//       ⛔ 不在这里重写一份族判定 (组件意识: 同型实现只写一遍)。
//
//   **H-9 · 判据只写一次**
//     「哪些事件算交付物」与「这个事件是不是已删除」都在本文件里;
//     组件 / 页面层**只接线**, ⛔ 不在 JSX 里 inline 判据。
//
// ---------------------------------------------------------------------------
// ⚠️ 为什么 `tool_done[file|image]` 也要参与
// ---------------------------------------------------------------------------
//   PC 渲染 `tool_done[file]` / `tool_done[image]` 两张卡 (旧协议双写形态,
//   契约 L-15 与独立的 `file` / `image` 事件**同族同 id**)。
//   ⇒ 同一个交付物主键会出现在两种事件上 ⇒ 判据必须覆盖两种,
//     否则旧协议那条卡会变成死链。
// =========================================================================

import { eventIdOf, richEventFamily, type RichEventBase } from "./rich-events";

/**
 * 一条 phase 的最小结构 —— 只需要 `type` 与 `event` 两个字段。
 *
 * ⚠️ 不 import `components/chat/ExecutionTimeline` 的 `ExecutionPhase` ——
 *   那是**组件层**的类型, lib 层引组件会把分层线拉断。
 *   这里用**结构化子类型** (`ExecutionPhase` 天然满足)。
 */
export interface DeliverablePhaseLike {
  type: string;
  event?: unknown;
}

/**
 * deliverableIdOf —— 这个事件带的**交付物主键**; 不是交付物事件则返回 null。
 *
 * 判据 = 「族判定成立」且「`id` 是非空字符串」。
 *   · 族判定 (`richEventFamily`) 天然排除 `web_preview` (H-3);
 *   · `id` 缺失 / 空串 ⇒ null (H-2: 照常渲染, 绝不误杀)。
 */
export function deliverableIdOf(ev: RichEventBase): string | null {
  if (!ev || typeof ev !== "object") return null;
  const family = richEventFamily(ev);
  if (!family) return null;
  const id = eventIdOf(ev);
  if (typeof id !== "string" || id === "") return null;
  return id;
}

/**
 * isDeletedDeliverable —— 这个事件是不是一个「已被服务端删除的交付物」。
 *
 * @param deletedIds 已删除交付物 id 集合 (本机落盘, 见 `lib/deliverable-deleted-store`)。
 */
export function isDeletedDeliverable(
  ev: RichEventBase,
  deletedIds: ReadonlySet<string> | null | undefined,
): boolean {
  if (!deletedIds || deletedIds.size === 0) return false;
  const id = deliverableIdOf(ev);
  if (!id) return false;
  return deletedIds.has(id);
}

/**
 * filterDeletedDeliverableEvents —— 滤掉「已被服务端删除的交付物」对应的事件。
 *
 * 集合为空 ⇒ **原样返回** (同一个引用) —— 绝大多数时候走这条, 零开销。
 */
export function filterDeletedDeliverableEvents<T extends RichEventBase>(
  events: T[] | undefined,
  deletedIds: ReadonlySet<string> | null | undefined,
): T[] | undefined {
  if (!events) return events;
  if (!deletedIds || deletedIds.size === 0) return events;
  return events.filter((ev) => !isDeletedDeliverable(ev, deletedIds));
}

/**
 * filterDeletedDeliverablePhases —— 滤掉「已被服务端删除的交付物」对应的 phase。
 *
 * ⚠️ **phases 与 events 两边都要滤** (安卓基线 `DeliverableBubbleFilter` 同款):
 *   · 只滤 phases ⇒ 交付物卡消失了, 但气泡还在 (**空壳气泡**);
 *   · 只滤 events ⇒ 气泡判定还成立, 相册还挂着, 但**内容是空的**。
 *
 * 只有 `type === "tool"` 的 phase 才可能带交付物事件 (`thinking` phase 只有正文)。
 */
export function filterDeletedDeliverablePhases<T extends DeliverablePhaseLike>(
  phases: T[] | undefined,
  deletedIds: ReadonlySet<string> | null | undefined,
): T[] | undefined {
  if (!phases) return phases;
  if (!deletedIds || deletedIds.size === 0) return phases;
  return phases.filter((p) => {
    if (!p || p.type !== "tool") return true;
    const ev = p.event;
    if (!ev || typeof ev !== "object") return true;
    return !isDeletedDeliverable(ev as unknown as RichEventBase, deletedIds);
  });
}

/**
 * filterRemovedDeliverableItems —— 交付中心列表里把「已被服务端删掉的」拿掉。
 *
 * ★ W-5 · **「删除必须赢」**:
 *   同一个 id 同时出现在 `items` 与 `removedIds` 里 ⇒ **不进列表**
 *   (安卓 `RemoteDeliverableRepository` 的 upsert-before-delete 顺序同款口径)。
 *
 * ⚠️ `removedIds` 是**可选**字段 (老服务端没有 ⇒ `undefined`) ⇒
 *   `undefined` / `null` ⇒ **原样返回** (不得当成错误、不得崩)。
 */
export function filterRemovedDeliverableItems<T extends { id: string }>(
  items: T[] | undefined,
  removedIds: readonly string[] | null | undefined,
): T[] {
  if (!items || items.length === 0) return items ?? [];
  if (!removedIds || removedIds.length === 0) return items;
  const removed = new Set(removedIds);
  return items.filter((it) => !removed.has(it.id));
}
