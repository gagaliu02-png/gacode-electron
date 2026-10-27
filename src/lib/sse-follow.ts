// =========================================================================
// sse-follow —— 「我在跟进 session X」+ 游标持久化 (契约 §11.3 W3 / L-40)
//
// ---------------------------------------------------------------------------
// ⛔ 这是 web 定稿版 (`78b01cb:src/lib/sse-follow.ts`) 的 PC 变体
// ---------------------------------------------------------------------------
//   web 用 IndexedDB (`@/lib/idb`), **PC 没有 IndexedDB 层** —— PC 端零持久化
//   的口径是: localStorage 只允许 `gacode.notification-prefs.v1` 一个 key。
//   ⇒ 这里把存储后端换成 **localStorage**, 新 key `gacode.sse-follow.v1.<sessionId>`,
//     其余逻辑 (游标合法性 / 节流 / 不写不相干会话) **逐字照抄**。
//   ⛔ 不改 `createFollowController` 的判据 —— 那部分是契约 L-33 / L-34 的落点。
//
// ---------------------------------------------------------------------------
// 为什么单独一个模块
// ---------------------------------------------------------------------------
// 游标本身有两条硬约束 (L-33 / L-34 / L-36):
//   · 游标只能是**纯十进制数字串** —— 非法值 (比如被截断成数字的 UUID) 绝不能发出去;
//   · 收到**没有 `id:` 行**的帧 ⇒ 游标**保持不变** (不得清空、不得回退)。
// 这两条都发生在「读帧 → 落库 → 续传」这条链上, 把它收在一个模块里,
// 页面就只剩「拿到新游标 ⇒ 调 advanceCursor」这一件事。
//
// ---------------------------------------------------------------------------
// ⚠️ 本地痕迹的地位 (契约 L-58)
// ---------------------------------------------------------------------------
// 本模块存下来的东西**只用于加速** (决定续传时带不带 `Last-Event-ID`),
// **不得**作为「该不该接回」的判据 —— 判据永远是服务端的 `stream-state`。
// =========================================================================

import { isValidEventCursor } from "./chat-sse";

/** localStorage key 前缀 —— 契约 L-58: 本地痕迹只用于加速, 不作判据。 */
export const FOLLOW_STORAGE_PREFIX = "gacode.sse-follow.v1.";

/** 本机存下来的跟进状态。 */
export interface StoredFollow {
  sessionId: string;
  /** **纯十进制数字串**游标, 或 null。 */
  cursor: string | null;
  /** 本机当前是否在跟进这个会话。 */
  following: boolean;
  /** 最后一次写入的时间戳 (ms)。 */
  ts: number;
}

/** 跟进状态的存储后端 —— 抽出来是为了让逻辑可测 (测试塞内存实现)。 */
export interface FollowStorage {
  get(sessionId: string): Promise<StoredFollow | null>;
  put(rec: StoredFollow): Promise<void>;
  remove(sessionId: string): Promise<void>;
}

/** localStorage 后端 —— PC 变体 (web 用 IndexedDB)。 */
export const localFollowStorage: FollowStorage = {
  async get(sessionId) {
    try {
      if (typeof localStorage === "undefined") return null;
      const raw = localStorage.getItem(FOLLOW_STORAGE_PREFIX + sessionId);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as StoredFollow;
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch {
      return null;
    }
  },
  async put(rec) {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(
        FOLLOW_STORAGE_PREFIX + rec.sessionId,
        JSON.stringify(rec),
      );
    } catch (err) {
      // localStorage 挂了 (隐私模式 / quota 满) ⇒ 只留内存态, 不冒泡打断主链路。
      console.warn("[sse-follow] 落盘失败, 降级到内存态:", err);
    }
  },
  async remove(sessionId) {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.removeItem(FOLLOW_STORAGE_PREFIX + sessionId);
    } catch (err) {
      console.warn("[sse-follow] 删除跟进状态失败:", err);
    }
  },
};

/**
 * 游标落盘的节流窗口 (ms)。
 *
 * 游标每来一帧带 `id:` 的帧就会推进一次 ⇒ 不节流的话一轮下来能写几百次。
 * 1 秒一次足够: 断线重连最多丢 1 秒的游标 ⇒ 退化成重放一点内容, 不丢内容。
 */
export const FOLLOW_PERSIST_THROTTLE_MS = 1000;

export interface FollowController {
  /**
   * 开始跟进一个会话 (attach 成功进入读流时调用)。
   * @param cursor 本机已有的**合法**游标 (非法值会被丢弃 ⇒ 退化成 `X-Resume-Turn`)。
   */
  start(sessionId: string, cursor?: string | null): Promise<void>;
  /**
   * 游标推进 —— 只接受**纯十进制数字串**。
   * 非法的 / 没变的 ⇒ 什么都不做 (L-33 / L-34)。
   */
  advanceCursor(sessionId: string, cursor: string | null | undefined): Promise<void>;
  /** 停止跟进 (轮次结束 / 离开会话) ⇒ 记录整条删掉。 */
  stop(sessionId: string): Promise<void>;
  /** 读本机跟进状态 (进场时决定带不带 `Last-Event-ID`)。 */
  read(sessionId: string): Promise<StoredFollow | null>;
  /** 本机当前是否在跟进这个会话 (同步读, 给 UI 用)。 */
  isFollowing(sessionId: string): boolean;
}

interface FollowState {
  cursor: string | null;
  following: boolean;
  lastPersistAt: number;
  dirty: boolean;
}

/**
 * createFollowController —— 造一个跟进控制器。
 *
 * @param storage 存储后端 (生产 = localStorage; 测试 = 内存实现)。
 * @param now 取当前时间 (测试可注入)。
 */
export function createFollowController(
  storage: FollowStorage = localFollowStorage,
  now: () => number = () => Date.now()
): FollowController {
  const states = new Map<string, FollowState>();

  const persist = async (sessionId: string, state: FollowState): Promise<void> => {
    try {
      await storage.put({
        sessionId,
        cursor: state.cursor,
        following: state.following,
        ts: now(),
      });
      state.dirty = false;
    } catch (err) {
      console.warn("[sse-follow] 落盘失败, 降级到内存态:", err);
    }
  };

  return {
    async start(sessionId, cursor) {
      const valid =
        typeof cursor === "string" && isValidEventCursor(cursor) ? cursor : null;
      const state: FollowState = {
        cursor: valid,
        following: true,
        // ⚠️ 故意留 0 —— start 这一写**不算**节流窗口的起点。
        //   否则「开流后头一秒内的游标推进」全被节流掉, 一刷新页面就退化成
        //   X-Resume-Turn 全量接回 (契约 L-60 要的是**最新**合法游标)。
        lastPersistAt: 0,
        dirty: false,
      };
      states.set(sessionId, state);
      await persist(sessionId, state);
    },

    async advanceCursor(sessionId, cursor) {
      // L-33: 非法游标直接丢弃 —— 绝不能把脏值发出去 (也绝不能覆盖已有游标)。
      if (typeof cursor !== "string" || !isValidEventCursor(cursor)) return;
      const state = states.get(sessionId);
      if (!state) return; // 没在跟进 ⇒ 不落盘 (避免给不相干的会话写游标)
      if (state.cursor === cursor) return; // 没变 ⇒ 不写
      state.cursor = cursor;
      state.dirty = true;
      const t = now();
      if (t - state.lastPersistAt >= FOLLOW_PERSIST_THROTTLE_MS) {
        await persist(sessionId, state);
        state.lastPersistAt = t;
      }
    },

    async stop(sessionId) {
      states.delete(sessionId);
      try {
        await storage.remove(sessionId);
      } catch (err) {
        console.warn("[sse-follow] 删除跟进状态失败:", err);
      }
    },

    async read(sessionId) {
      const local = states.get(sessionId);
      if (local) {
        return {
          sessionId,
          cursor: local.cursor,
          following: local.following,
          ts: now(),
        };
      }
      try {
        return await storage.get(sessionId);
      } catch (err) {
        console.warn("[sse-follow] 读取跟进状态失败:", err);
        return null;
      }
    },

    isFollowing(sessionId) {
      return states.get(sessionId)?.following === true;
    },
  };
}

/**
 * decideAttachCursor —— 决定 attach 请求带不带 `Last-Event-ID`。
 *
 *   · 本机有**合法**游标 ⇒ 用它 (省得整轮重放);
 *   · 没有 / 非法 ⇒ 返回 null ⇒ 调用方发 `X-Resume-Turn: 1` 全量接回 (契约 L-35)。
 *
 * ⚠️ L-60: 必须带**最新合法**游标; 游标非法 ⇒ 降级, 不得把非法值发出去。
 */
export function decideAttachCursor(local: StoredFollow | null): string | null {
  if (!local) return null;
  const cursor = local.cursor;
  if (typeof cursor !== "string" || !isValidEventCursor(cursor)) return null;
  return cursor;
}
