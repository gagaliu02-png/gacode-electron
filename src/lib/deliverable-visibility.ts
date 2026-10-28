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
//   **H-3 · ⚠️ 口径订正 (2026-10-28 · PM 返工交底)**
//     原任务书 05b 写的「web_preview 不参与」是**错的**, 这轮改口径:
//     **web_preview 必须参与删除集判据**。
//
//     实证 (gaclaw `src/llm/llm.executors.js:938-946`):
//       ```js
//       // id 用 _web 后缀避免与上面 type:'file' 共享主键触发 upsert 冲突
//       context.eventCollector.push({ type: 'web_preview', id: id + '_web', ... })
//       ```
//     ⇒ `web_preview` 事件的 id = `<fileId>_web` = `yinian_deliverables` 表那一行的
//       **主键** ⇒ 与 file / image **同一个 id 空间**。
//     ⇒ 而 PC **确实渲染 web_preview 气泡** (`components/chat/RichEventBubble.tsx`
//       的 `web_preview` 分支) ⇒ 不参与判据 ⇒ 用户删掉「网站」类交付物后
//       **气泡里那张 web 卡仍渲染** ⇒ 点开内容端点 404 ⇒ **死链还在**。
//
//     ⛔ **不许**拿 `richEventFamily` 当这个判据:
//       它是**去重**规则 (契约 L-14 ~ L-18) —— `web_preview` 不入族 (L-16,
//       因为它的 id 跟 file 不同, 不该去重)。**去重规则 ≠ 「是不是交付物事件」**
//       —— 两件不同的事。拿族判定当判据 ⇒ `web_preview` 被漏掉 ⇒ 死链还在。
//     ⇒ 故本文件**独立**判「这个事件是不是交付物事件」, 只复用 `eventIdOf`
//       (取 id 这一步是共用的, 不重写)。
//
//     ⚠️ 安卓**不改**: 它只认 `FileEvent` / `ImageEvent` —— 但安卓
//       `RichBubbles` 里 web_preview 是 `Unit` 占位 (**根本不渲染**) ⇒
//       对安卓没有用户可见后果 ⇒ 这是**分层对齐**的正常形态:
//       web / PC 比安卓**多渲染一种气泡形态**, 所以判据要多覆盖一种。
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
//
// ⚠️ 为什么 `web_preview` 也要参与 (2026-10-28 口径订正)
// ---------------------------------------------------------------------------
//   见文件头 H-3 段: 它的 id (`<fileId>_web`) **就是** DB 主键, 且 PC 渲染它。
//   ⇒ 漏了它 ⇒ 「网站」类交付物删掉后死链还在。
// =========================================================================

import { eventIdOf, type RichEventBase } from "./rich-events";

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
 * isDeliverableEvent —— 这个事件**是不是交付物事件** (与去重族判定**无关**)。
 *
 * 覆盖四类 (与 a4 契约 §三 一致):
 *   | 事件                     | 它的 id 是什么            | 是 DB 主键 |
 *   |--------------------------|---------------------------|------------|
 *   | `file`                   | `yinian_deliverables.id`  | ✅         |
 *   | `image`                  | `yinian_deliverables.id`  | ✅         |
 *   | `web_preview`            | `<fileId>_web`            | ✅         |
 *   | `tool_done[file\|image]` | 与同名独立事件同值        | ✅         |
 *   | 其余 (`tool_start` / `tool_fail` / 无 subtype 的 `tool_done` / 死类型) | — | ❌ |
 *
 * ⚠️ ⛔ **不许**改用 `richEventFamily` 当这个判据 —— 那是**去重**规则 (L-14~L-18),
 *   `web_preview` 按 L-16 本就不入族 ⇒ 拿它当判据 ⇒ web 类交付物永远漏判。
 */
function isDeliverableEvent(ev: RichEventBase): boolean {
  if (ev.type === "file" || ev.type === "image" || ev.type === "web_preview") {
    return true;
  }
  if (ev.type === "tool_done") {
    return ev.subtype === "file" || ev.subtype === "image";
  }
  return false;
}

/**
 * deliverableIdOf —— 这个事件带的**交付物主键**; 不是交付物事件则返回 null。
 *
 * 判据 = 「是交付物事件」且「`id` 是非空字符串」。
 *   · `id` 缺失 / 空串 ⇒ null (H-2: 照常渲染, 绝不误杀)。
 */
export function deliverableIdOf(ev: RichEventBase): string | null {
  if (!ev || typeof ev !== "object") return null;
  if (!isDeliverableEvent(ev)) return null;
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
