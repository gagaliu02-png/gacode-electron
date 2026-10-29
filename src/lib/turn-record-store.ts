// =========================================================================
// turn-record-store —— 「轮次记录」的本机落点 (架构 §5.3 / T-05 / T-07 / 契约订正 7)
// ---------------------------------------------------------------------------
// 为什么有这个文件
// ---------------------------------------------------------------------------
//   v1 的续传要**两样东西**: 端上一行「在途 assistant 行」 + 一个游标。
//   而客户端**只存了游标** ⇒ 刷新 / 重开时正文没了, 只剩尾巴 (缺陷 D-1)。
//
//   v2 把它收成**一条原子记录** (按 sessionId 存):
//
//       { sessionId, turnKey, seq, renderedSnapshot, updatedAt }
//
//   · `seq`             —— 续传游标 (服务端下发的, 端侧不自增; L-33 纯十进制串)
//   · `turnKey`         —— 定位轮次
//   · `renderedSnapshot` —— **本端已渲染的内容** (正文 + 事件 + 阶段)
//   · `updatedAt`       —— TTL 清理用
//
//   ⇒ 「有游标没正文」这个状态**不可能再出现**。
//
// ---------------------------------------------------------------------------
// ★ PC 的存储方案: **localStorage** (不是 IndexedDB)
// ---------------------------------------------------------------------------
//   web 那边用的是 IndexedDB (`src/lib/idb.ts` 的 `sseTurnRecord` 表, DB v4)。
//   PC **没有 IndexedDB 层** —— 本仓全部本机持久化都走 localStorage:
//
//     · `src/lib/sse-follow.ts`            —— 跟进游标 (`gacode.sse-follow.v1.<sessionId>`)
//     · `src/lib/chat-pending-approvals.ts` —— 待审批缓存
//     · `src/lib/deliverable-deleted-store.ts` —— 已删交付物集合
//
//   ⇒ 轮次记录沿用**同一套**后端与 key 风格 (`gacode.sse-turn-record.v1.<sessionId>`):
//     · 不给 PC 凭空引入一个 IndexedDB 层 (要管 DB_VERSION / 升级 / 索引);
//     · 与 PC 既有代码风格一致 (读一次就懂);
//     · `TurnRecordStorage` 是**端口** (`src/lib/sse/turn-record.ts` 里定义),
//       将来要换 IndexedDB / electron-store, 只换这一个文件的实现即可,
//       端侧语义不变 (契约订正 7: 「存储实现可不同, 语义必须一致」)。
//
//   ⚠️ localStorage 挂了 (隐私模式 / quota 满) ⇒ `createTurnRecordStore` 降级到
//     **内存态** (它自带), 绝不冒泡打断主链路。
//
// ---------------------------------------------------------------------------
// ⛔ 本文件**不许** import window / fetch / js-cookie —— 抄这份的端也得能用。
//    只 import `src/lib/sse/turn-record.ts` (类型 + 端口 + 仓库工厂) ——
//    那是「端侧续传中枢」的定稿版, 形状只有那一处。
// =========================================================================

import {
  createTurnRecordStore,
  type TurnRecord,
  type TurnRecordStorage,
} from "./sse/turn-record";

/** localStorage key 前缀 —— 轮次记录 (按 sessionId 分键)。 */
export const TURN_RECORD_STORAGE_PREFIX = "gacode.sse-turn-record.v1.";

/**
 * 落盘前的最后一道闸 (契约 L-33) —— 游标只接受**纯十进制数字串**。
 *
 * ⚠️ 端侧**不得**自造 / 自增 / 猜着修补游标; 非法值一律当没有。
 */
function sanitizeSeq(seq: unknown): string | null {
  return typeof seq === "string" && /^\d+$/.test(seq) ? seq : null;
}

/**
 * localStorage 后端 —— PC 变体 (web 用 IndexedDB)。
 *
 * ⚠️ 每一格都包 try/catch: localStorage 在隐私模式 / quota 满时会**抛**
 *   (不是返回 null) ⇒ 不包的话会把主链路打断。
 */
export const localTurnRecordStorage: TurnRecordStorage = {
  async get(sessionId) {
    try {
      if (typeof localStorage === "undefined") return null;
      const raw = localStorage.getItem(TURN_RECORD_STORAGE_PREFIX + sessionId);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return null;
      const o = parsed as Record<string, unknown>;
      return {
        sessionId,
        turnKey: typeof o.turnKey === "string" ? o.turnKey : null,
        seq: sanitizeSeq(o.seq),
        // ⚠️ renderedSnapshot 的形状由 `normalizeTurnRecord` 逐字段容错 ——
        //   这里原样回传 (脏数据不许整体丢掉, 否则又变成「刷新后正文没了」)。
        renderedSnapshot: o.renderedSnapshot as TurnRecord["renderedSnapshot"],
        updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : 0,
      } as TurnRecord;
    } catch {
      return null;
    }
  },

  async put(rec) {
    try {
      if (typeof localStorage === "undefined") return;
      const payload = { ...rec, seq: sanitizeSeq(rec.seq) };
      localStorage.setItem(
        TURN_RECORD_STORAGE_PREFIX + rec.sessionId,
        JSON.stringify(payload),
      );
    } catch (err) {
      console.warn("[turn-record] 落盘失败, 降级到内存态:", err);
    }
  },

  async remove(sessionId) {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.removeItem(TURN_RECORD_STORAGE_PREFIX + sessionId);
    } catch (err) {
      console.warn("[turn-record] 删除轮次记录失败:", err);
    }
  },
};

/**
 * 轮次记录仓库 (进程级单例) —— 页面层直接用它。
 *
 * ⚠️ 这是**唯一**的「这一轮我已经渲染了什么」落盘处:
 *   游标 + 已渲染内容在**同一条记录**里 ⇒ 「有游标没正文」这个状态不可能再出现
 *   (缺陷 D-1 / 断言 B7)。
 */
export const turnRecordStore = createTurnRecordStore(localTurnRecordStorage);
