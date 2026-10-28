// =========================================================================
// deliverable-deleted-store —— 「已被服务端删除的交付物」集合的本机持久化
//
// ---------------------------------------------------------------------------
// 2026-10-28 · 任务书 05b · W-2 / W-5 / H-4 / H-5 / H-6 / H-7 / H-10
// ---------------------------------------------------------------------------
//   **W-2 · 要持久化**
//     PC 端零持久化的口径是「不落任何用户数据到磁盘」, 但这张集合**必须**
//     活过页面刷新 —— 否则用户点一下「刷新」, 交付物已经没了, 气泡里那张
//     死链卡又回来了 (而服务端不会重推这帧)。
//     ⇒ 落 localStorage (PC 端唯一可用的浏览器存储), **按用户分键**。
//
//   **W-5 · 拉模式兜底写进同一张表**
//     列表接口的 `removedIds` (服务端聚合三个软删来源) ⇒ 写进**这张**表,
//     ⛔ 不许另起第二张集合 (两张表迟早不同步 ⇒ 死链卡时有时无)。
//
//   **H-4 · 端侧零判断**
//     收到 id 就记 —— 不查本地有没有这个 id、不猜服务端语义、不做前置条件。
//     (安卓基线 `RemoteDeliverableRepository` 同款口径。)
//
//   **H-5 · 只增不减 + TTL**
//     只增不减: 记进去的 id **不因为后来的事件而被删掉** (唯一的移除理由是
//     TTL 到期)。TTL = 180 天 (安卓 `DeliverableRepository.DELETED_RETENTION_MS`
//     同值)。
//
//   **H-6 · 按用户隔离**
//     key 里带 userId ⇒ 换用户登录看到的是**他自己**的集合, 绝不串号。
//
//   **H-7 · 容忍丢帧**
//     a4 帧是 best-effort (没开聊天页就收不到) ⇒ 正确性由拉模式兜底,
//     本表只管「记住」, 不管「补齐」。
//
// ---------------------------------------------------------------------------
// ⚠️ 与安卓基线 / web 定稿版的关系
// ---------------------------------------------------------------------------
//   安卓把集合落在 Room 表 (`DeletedDeliverableEntity`, 复合主键 `(id, user_id)`,
//   180 天 TTL); web 落在 zustand + IndexedDB。
//   PC 没有 Room / IndexedDB ⇒ 这里是**同一套语义**的 PC 落点:
//   按用户隔离 / 只增不减 / 180 天 TTL / 刷新后能 hydrate 回来。
// =========================================================================

/** localStorage key 前缀 —— 「已删除交付物」集合 (按用户分键)。 */
export const DELETED_DELIVERABLES_STORAGE_KEY =
  "gacode.chat.deleted-deliverables.v1";

/** TTL —— 180 天 (安卓 `DeliverableRepository.DELETED_RETENTION_MS` 同值)。 */
export const DELETED_DELIVERABLE_TTL_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * 本机的存储 key —— **必须带 userId** (H-6: 换用户绝不串号)。
 */
export function deletedDeliverablesStorageKey(userId: string): string {
  return `${DELETED_DELIVERABLES_STORAGE_KEY}.${userId}`;
}

/** 落盘形状 —— `{ [交付物主键]: 首次记录时间 (ms epoch) }`。 */
type StoredShape = Record<string, number>;

function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readStore(userId: string): StoredShape {
  const s = storage();
  if (!s || !userId) return {};
  try {
    const raw = s.getItem(deletedDeliverablesStorageKey(userId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: StoredShape = {};
    for (const [id, ts] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof ts !== "number" || !Number.isFinite(ts)) continue;
      out[id] = ts;
    }
    return out;
  } catch {
    return {};
  }
}

function writeStore(userId: string, store: StoredShape): void {
  const s = storage();
  if (!s || !userId) return;
  try {
    if (Object.keys(store).length === 0) {
      s.removeItem(deletedDeliverablesStorageKey(userId));
      return;
    }
    s.setItem(deletedDeliverablesStorageKey(userId), JSON.stringify(store));
  } catch (err) {
    // 隐私模式 / quota 满 ⇒ 只留内存态, 不冒泡打断主链路。
    console.warn("[deleted-deliverables] 落盘失败, 降级到内存态:", err);
  }
}

/**
 * readDeletedDeliverables —— 读某个用户的「已删除交付物」集合。
 *
 * ⚠️ **TTL 已过期的条目不算已删除** (H-5) —— 集合是「最近 180 天内被删掉的
 *   交付物」, 不是永久黑名单。
 */
export function readDeletedDeliverables(userId: string): Set<string> {
  const out = new Set<string>();
  if (!userId) return out;
  const now = Date.now();
  for (const [id, ts] of Object.entries(readStore(userId))) {
    if (now - ts > DELETED_DELIVERABLE_TTL_MS) continue;
    out.add(id);
  }
  return out;
}

/**
 * recordDeletedDeliverables —— 记一批「已被服务端删除的交付物主键」。
 *
 *   · **只增不减**: 已经在集合里的 id **不覆盖、不移除** (H-5);
 *   · **幂等**: 重复收到同一个 id ⇒ 不重复记, 时间戳保持**首次**记录的时间;
 *   · **零判断**: 不查本地有没有这个交付物, 收到就记 (H-4);
 *   · 顺带做 **TTL 清理**: 过期条目从落盘里剔掉 (H-5)。
 *
 * @returns 这次**真正新增**的 id (已在集合里的不算) —— 调用方据此更新内存态。
 */
export function recordDeletedDeliverables(
  userId: string,
  ids: string[],
): string[] {
  if (!userId || !Array.isArray(ids) || ids.length === 0) return [];
  const s = storage();
  if (!s) return [];

  const now = Date.now();
  const store = readStore(userId);

  // TTL 清理 —— 过期条目唯一的移除理由 (只增不减指的是「不因事件而删」)。
  for (const [id, ts] of Object.entries(store)) {
    if (now - ts > DELETED_DELIVERABLE_TTL_MS) delete store[id];
  }

  const added: string[] = [];
  for (const raw of ids) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (id === "") continue;
    if (store[id] !== undefined) continue; // 已在集合里 ⇒ 幂等, 不覆盖时间戳
    store[id] = now;
    added.push(id);
  }

  if (added.length > 0) writeStore(userId, store);
  return added;
}

/**
 * pruneDeletedDeliverables —— 把 TTL 已过期的条目从落盘里剔掉。
 *
 * @returns 被剔掉的条目数。
 */
export function pruneDeletedDeliverables(userId: string): number {
  if (!userId) return 0;
  const s = storage();
  if (!s) return 0;
  const store = readStore(userId);
  const now = Date.now();
  let removed = 0;
  for (const [id, ts] of Object.entries(store)) {
    if (now - ts > DELETED_DELIVERABLE_TTL_MS) {
      delete store[id];
      removed++;
    }
  }
  if (removed > 0) writeStore(userId, store);
  return removed;
}

/** isDeliverableDeleted —— 这个交付物主键在不在「已删除」集合里。 */
export function isDeliverableDeleted(
  userId: string,
  id: string,
): boolean {
  if (!userId || !id) return false;
  return readDeletedDeliverables(userId).has(id);
}
