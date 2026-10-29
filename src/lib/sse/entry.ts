// =========================================================================
// entry —— 统一进场序列 (架构 §5.2 / R2-3 / 契约 L-57 / L-58)
// ---------------------------------------------------------------------------
// 为什么有这个文件
// ---------------------------------------------------------------------------
//   v1 三端各写各的进场序列 (web 查 stream-state 后 attach · PC 各写一套 ·
//   安卓又一套) ⇒ 语义漂移。
//
//   v2 **一份**:
///
///        ① GET  /sessions/:id/stream-state
///           ├─ 不可达 (问不到)      ⇒ 回落历史 + **不抹游标** (缺陷 A-3)
///           ├─ running === false     ⇒ 回落历史, **不发 attach** (契约 L-58)
///           └─ running === true
///                ② POST /sessions/:id/chat/attach
///                     ├─ 本机有合法游标 ⇒ 带 Last-Event-ID
///                     └─ 本机零状态       ⇒ 带 X-Resume-Turn: 1
///                          ├─ attach_ok     ⇒ 渲染回放 + 继续收 live
///                          └─ attach_failed ⇒ 渲染 snapshot → 回落历史 → **不报错**
//
//   ⚠️ **本地痕迹只用于加速** (决定带不带游标), 「该不该接」的判据**永远**是
//     服务端的 stream-state (契约 L-58)。
//
// ---------------------------------------------------------------------------
// 这个文件的分层
// ---------------------------------------------------------------------------
//   · `decideEntry` —— **纯函数**: 给定「服务端说了什么 + 本机有什么」⇒
//     「该做什么」。⇒ 单测直接跑, 不需要网络。
//   · `createEntryController` —— 驱动器: 把现实 (fetch / IndexedDB) 注入进来,
//     驱动同一套状态机 (turn-session.ts), 并在降级时**带内容**回落。
//
//   ⚠️ 端口 (port) 全部**注入** ⇒ 本文件零 import ⇒ PC 抄走时只需换端口实现。
//
// ---------------------------------------------------------------------------
// ⛔ 本文件**不许** import window / fetch / js-cookie —— PC 要抄这份定稿。
// =========================================================================

import {
  createTurnSession,
  transition,
  type TurnSession,
  type TurnSessionEvent,
} from "./turn-session";
import {
  isValidCursor,
  type SeqFrameLike,
} from "./seq-guard";
import {
  type TurnFrameLike,
  type TurnRecord,
  type TurnSummaryLike,
} from "./turn-record";
import {
  readServerSnapshot,
  type DegradePlan,
  type ServerSnapshotLike,
} from "./degrade";

// =========================================================================
// 探测 (stream-state)
// =========================================================================

/**
 * `stream-state` 的归一形态。
 *
 * ⚠️ v1 的八个键 + v2 扩展的键 (架构 §4.1) 全在这里 ——
 *   老服务端只给前八个 ⇒ 其余留 null ⇒ 上层走兜底。
 */
export interface StreamStateProbe {
  /** 服务端可达吗 (false = 问不到)。 */
  reachable: boolean;
  /** 该会话当前有无在跑的轮次。 */
  running: boolean;
  /** 现在能不能 attach。 */
  canAttach: boolean;
  /** 本轮标识。 */
  turnKey: string | null;
  /** 当前可接的起点游标 (v1 的 `lastEventId`)。 */
  lastEventId: string | null;
  /** 服务端侧待审批列表。 */
  pendingApprovals: unknown[];
  /** ★ v2: 本 session 当前可接的起点游标 (seq)。 */
  lastSeq: number | null;
  /** ★ v2: 轮次状态机状态。 */
  turnState: string | null;
  /** ★ v2: 上游是否还活着。 */
  upstreamAlive: boolean | null;
  /** ★ v2: 有没有可回落快照。 */
  snapshotAvailable: boolean | null;
  /** ★ v2: 快照完整度。 */
  completeness: string | null;
  /** ★ v2: 轮次开始时刻 (四要素之一)。 */
  startedAt: number | null;
  /** ★ v2: 服务端算的累计耗时 (四要素之一)。 */
  elapsedMs: number | null;
  /** ★ v2: 逻辑工具调用次数 (四要素之一)。 */
  toolCallCount: number | null;
  /** ★ v2: 逻辑思考段数 (四要素之一)。 */
  thinkingCount: number | null;
}

// =========================================================================
// 决策 (纯函数)
// =========================================================================

/** 进场决策。 */
export type EntryAction = "history" | "attach";

/** 进场决策结果。 */
export interface EntryDecision {
  /** 该做什么。 */
  action: EntryAction;
  /** 要带的游标 (只用于加速; 非法 ⇒ null)。 */
  cursor: string | null;
  /** 决策理由 (诊断用)。 */
  reason:
    | "running"
    | "not_running"
    | "stream_state_unreachable"
    | "local_cursor_invalid";
  /** ★ 本地游标要不要保留。 */
  keepCursor: boolean;
}

/**
 * decideEntry —— 进场决策 (纯函数)。
 *
 * @param input.probe       服务端的探测结果 (null = **问不到**)
 * @param input.localCursor 本机的游标 (只用于加速, 契约 L-58)
 *
 * ⚠️ 三条判据:
 *   ① 问不到 (`probe === null`) ⇒ **回落历史**, **不抹游标** (缺陷 A-3 / B6)
 *   ② 没在跑 (`running === false` 或 `canAttach === false`) ⇒ **回落历史**,
 *      **不发 attach** (契约 L-58 / B5)
 *   ③ 在跑 ⇒ **attach**, 带本机合法游标 (非法 ⇒ null ⇒ 走 X-Resume-Turn)
 */
export function decideEntry(input: {
  probe: StreamStateProbe | null;
  localCursor?: string | null;
}): EntryDecision {
  // ① 问不到 —— ⛔ 不是「没在跑」! 这两者的区别就是**游标要不要抹**。
  if (!input.probe || input.probe.reachable === false) {
    return {
      action: "history",
      cursor: null,
      reason: "stream_state_unreachable",
      // ★ 保留游标 —— 断一次网就把游标抹了 ⇒ 回来只能整轮重放 (缺陷 A-3)。
      keepCursor: true,
    };
  }

  // ② 确实没在跑 (或服务端说不能接) ⇒ 走历史, 不发 attach。
  if (input.probe.running !== true || input.probe.canAttach !== true) {
    return {
      action: "history",
      cursor: null,
      reason: "not_running",
      keepCursor: false,
    };
  }

  // ③ 在跑 ⇒ attach。游标只用于加速, 且**只认服务端下发过的合法游标**。
  const raw = input.localCursor ?? null;
  const cursor = isValidCursor(raw) ? raw : null;
  return {
    action: "attach",
    cursor,
    reason: cursor === null ? "local_cursor_invalid" : "running",
    keepCursor: true,
  };
}

// =========================================================================
// 端口 (宿主层注入)
// =========================================================================

/** attach 的控制帧 (归一形态)。 */
export interface AttachControlLike {
  type: "attach_ok" | "attach_failed";
  turnKey?: string | null;
  resumedFrom?: string | null;
  replayed?: number | null;
  reason?: string | null;
  /** ★ v2: 完整摘要 (T-18 / 订正 13)。 */
  summary?: TurnSummaryLike | null;
  /** ★ v2: 快照 (T-08 / 订正 3)。 */
  snapshot?: ServerSnapshotLike | null;
}

/** attach 的参数。 */
export interface AttachArgs {
  sessionId: string;
  cursor: string | null;
  signal?: AbortSignal;
  onControl?: (frame: AttachControlLike) => void;
  onData?: (frame: TurnFrameLike & SeqFrameLike, cursor: string | null) => void;
  onCursor?: (cursor: string | null) => void;
}

/** 进场驱动器需要的端口 (全部注入 ⇒ 本目录零 import)。 */
export interface EntryPorts {
  /** 问服务端「这会话现在有没有在跑的轮次」 (null = 问不到)。 */
  probe(sessionId: string): Promise<StreamStateProbe | null>;
  /** 读本机的轮次记录。 */
  loadRecord(sessionId: string): Promise<TurnRecord | null>;
  /** 写本机的轮次记录。 */
  saveRecord(record: TurnRecord): Promise<void>;
  /** 接回 (只读接入一条在跑的轮次)。 */
  attach(args: AttachArgs): Promise<void>;
}

/** 进场控制器的回调。 */
export interface EntryControllerCallbacks {
  /** 状态变化。 */
  onSession?: (session: TurnSession) => void;
  /**
   * ★ 本机读回来的轮次记录 (缺陷 D-1 / 断言 B7)。
   *
   *   刷新 / 重开页面时, 本机已经渲染过的那部分内容就在这条记录里 ⇒
   *   宿主层**先把它渲染出来**, 再接增量 ⇒ 用户不会看到「刷新后正文没了」。
   */
  onLocalRecord?: (record: TurnRecord) => void;
  /** 收到一帧 (宿主层拿去渲染)。 */
  onFrame?: (frame: TurnFrameLike & SeqFrameLike, cursor: string | null) => void;
  /** 降级 —— 把快照内容交给宿主层渲染, 然后回落历史。 */
  onDegrade?: (plan: DegradePlan, session: TurnSession) => void;
  /** 回落历史。 */
  onHistory?: (session: TurnSession) => void;
}

/** 进场控制器。 */
export interface EntryController {
  /** 当前状态。 */
  readonly session: TurnSession;
  /** 进场 (幂等: 已在跑就直接返回)。 */
  start(): Promise<void>;
  /** 重连 (保留已应用 seq 与已渲染内容)。 */
  reconnect(): Promise<void>;
  /**
   * ★ 把一个现实事件喂进状态机 (宿主层用)。
   *
   * ⚠️ 为什么需要它: **发送流** (POST /chat/stream) 与 **接入流** (POST /chat/attach)
   *   是两条路, 但**状态机只有一套** —— 宿主层把发送流收到的帧也用这个入口喂进来,
   *   于是「已渲染内容 / 游标 / 终态分类」在两条路上是**同一份真相**。
   *   ⛔ 不许在宿主层另写一套终态判定 (那就会漂移)。
   */
  dispatch(event: TurnSessionEvent): TurnSession;
  /** 停订阅 —— **不删**轮次记录 (游标 + 已渲染内容要留着)。 */
  stop(): void;
}

/** 落盘节流窗口 (ms) —— 一轮下来能写几百次 IDB, 节流到 1s 一次。 */
export const ENTRY_PERSIST_THROTTLE_MS = 1000;

/**
 * createEntryController —— 造一个进场控制器。
 *
 * @param sessionId  归属会话
 * @param ports      端口 (网络 / 存储都从这儿进来)
 * @param callbacks  宿主层回调 (渲染 / 回落历史)
 * @param now        时钟 (测试可注入)
 */
export function createEntryController(
  sessionId: string,
  ports: EntryPorts,
  callbacks: EntryControllerCallbacks = {},
  now: () => number = () => Date.now()
): EntryController {
  let session = createTurnSession(sessionId, null, now());
  let running = false;
  let stopped = false;
  let lastPersistAt = 0;
  let dirty = false;

  const emit = () => callbacks.onSession?.(session);

  const dispatch = (event: TurnSessionEvent): TurnSession => {
    const prev = session;
    session = transition(session, event, now());
    // ★ 记录变了 ⇒ 要落盘 (节流)。
    //   ⚠️ 幂等判定里的 "duplicate" 分支**不动记录** ⇒ 不会触发写盘 (G-3:
    //   落盘与否也由状态机决定, 宿主层不另设一套判据)。
    if (session.record !== prev.record) {
      dirty = true;
      void persist();
    }
    emit();
    return session;
  };

  const persist = async (force = false): Promise<void> => {
    if (!dirty) return;
    const t = now();
    if (!force && t - lastPersistAt < ENTRY_PERSIST_THROTTLE_MS) return;
    dirty = false;
    lastPersistAt = t;
    await ports.saveRecord(session.record);
  };

  const markDirty = () => {
    dirty = true;
  };

  /** 真正的进场动作。 */
  const runEntry = async (): Promise<void> => {
    dispatch({ type: "connect" });

    // ① 问服务端。
    let probe: StreamStateProbe | null = null;
    try {
      probe = await ports.probe(sessionId);
    } catch {
      probe = null; // 问不到 ⇒ 当成不可达
    }
    if (stopped) return;

    // 读本机记录 (游标 + 已渲染内容)。
    let local: TurnRecord | null = null;
    try {
      local = await ports.loadRecord(sessionId);
    } catch {
      local = null;
    }
    if (stopped) return;
    if (local) {
      session = { ...session, record: local, turnKey: local.turnKey ?? session.turnKey };
      emit();
      // ★ 本机已渲染的内容 ⇒ 先渲染出来 (缺陷 D-1: 「刷新后正文没了」的老 bug)。
      //   宿主层拿这条记录建那一行, 再接增量 ⇒ 内容连续。
      callbacks.onLocalRecord?.(local);
    }

    // ② 决策。
    const decision = decideEntry({
      probe,
      localCursor: local?.seq ?? null,
    });

    if (decision.action === "history") {
      if (decision.reason === "stream_state_unreachable") {
        // ★ 问不到 ⇒ 降级 (不抹游标) + 回落历史。
        dispatch({ type: "unreachable" });
        callbacks.onDegrade?.(session.degradePlan as DegradePlan, session);
      } else {
        // 确实没在跑 ⇒ 关闭 (游标作废 —— 下一轮会重发)。
        dispatch({ type: "not_running" });
      }
      callbacks.onHistory?.(session);
      await persist(true);
      return;
    }

    // ③ attach。
    await ports.attach({
      sessionId,
      cursor: decision.cursor,
      onControl: (frame) => {
        if (frame.type === "attach_ok") {
          dispatch({
            type: "attach_ok",
            turnKey: frame.turnKey ?? null,
            summary: frame.summary ?? null,
          });
          markDirty();
          void persist(true);
          return;
        }
        // attach_failed ⇒ 降级闭环 (渲染快照 → 回落历史 → 不报错)。
        dispatch({
          type: "attach_failed",
          reason: frame.reason ?? null,
          snapshot: frame.snapshot ?? readServerSnapshot(frame),
        });
        callbacks.onDegrade?.(session.degradePlan as DegradePlan, session);
        callbacks.onHistory?.(session);
        markDirty();
        void persist(true);
      },
      onData: (frame, cursor) => {
        dispatch({ type: "frame", frame, cursor });
        // ★ 幂等结论由**状态机**给 (T-09 / G-3) —— 宿主层不许自己再判一次。
        //   · duplicate ⇒ 丢弃, 不重渲染 (断言 B1)
        //   · gap      ⇒ 降级, 不静默吞内容 (断言 B2)
        if (session.frameOutcome !== "applied") return;
        callbacks.onFrame?.(frame, cursor);
      },
      onCursor: (cursor) => {
        if (!isValidCursor(cursor)) return; // 非法游标绝不落库 (L-33)
        session = {
          ...session,
          record: { ...session.record, seq: cursor },
        };
        markDirty();
        void persist();
      },
    });

    if (stopped) return;
    // ★ 流结束了但**没有**终态帧 ⇒ 上游断了 (T-12 的 `upstream_lost`)。
    //   ⇒ 标成「未完成」, **不**当正常完成 (否则用户以为答完了)。
    if (session.state === "live") {
      dispatch({ type: "terminal", reason: "upstream_lost" });
    }
    // 流结束 (终态帧 / 服务端关流) ⇒ 落盘收尾。
    await persist(true);
  };

  return {
    get session() {
      return session;
    },
    async start() {
      if (running) return;
      running = true;
      stopped = false;
      try {
        await runEntry();
      } finally {
        running = false;
      }
    },
    async reconnect() {
      if (stopped) return;
      dispatch({ type: "reconnect" });
      running = true;
      try {
        await runEntry();
      } finally {
        running = false;
      }
    },
    dispatch(event: TurnSessionEvent): TurnSession {
      return dispatch(event);
    },
    stop() {
      // ★ 只停订阅 —— **不删**轮次记录 (游标 + 已渲染内容要留着, 见架构 §5.3)。
      stopped = true;
    },
  };
}
