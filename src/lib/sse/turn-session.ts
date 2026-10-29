// =========================================================================
// turn-session —— 端侧续传状态机 (架构 §5.1)
// ---------------------------------------------------------------------------
// 为什么有这个文件
// ---------------------------------------------------------------------------
//   v1 三端各写各的状态机 (web 一套 · PC 一套 · 安卓一套) ⇒ 修好一端另两端
//   不一定好, 回归无法覆盖 (缺陷 D-4)。
//
//   v2 **一份**状态机, 三端同一套语义; web 与 PC **共用同一份代码**
//   (PC 抄这份定稿, ⛔ 禁止第三份):
//
//        idle ──connect()──> connecting ──首帧──> live ──终态帧──> draining ──> closed
//                            │                  │  ▲
//                            │                  │  └──(重连成功)
//                            │                  │
//                            └──attach_failed──> degraded ──(可读快照/历史)──> closed
//
//   ⚠️ `degraded` 是**常态分支**, 不是异常分支 (架构 §6 硬规则):
//     「接不回来」必须有内容可看, 且**不弹错误**。
//
// ---------------------------------------------------------------------------
// 为什么用「纯 reducer」而不是一个类
// ---------------------------------------------------------------------------
//   · 状态迁移**只有一处** (G-3 一处真值) —— 别的端照抄这个函数即可;
//   · 纯函数 ⇒ Node 单测可以直接 import, 不需要 React / DOM / 网络;
//   · 宿主层 (page.tsx) 只负责把「现实事件」翻译成这里的 event, 以及把
//     session 状态映射成 UI。
//
// ---------------------------------------------------------------------------
// ⛔ 本文件**不许** import window / fetch / js-cookie —— PC 要抄这份定稿。
// =========================================================================

import {
  decideFrame,
  nextAppliedSeq,
  type SeqFrameLike,
  type SeqVerdict,
} from "./seq-guard";
import {
  emptyTurnRecord,
  mergeFrame,
  mergeSummary,
  purgeRenderedContent,
  type TurnFrameLike,
  type TurnRecord,
  type TurnSummaryLike,
} from "./turn-record";
import {
  presentTerminal,
  readTerminalReason,
  type TerminalPresentation,
  type TerminalReason,
} from "./terminal";
import {
  applyDegrade,
  normalizeReason,
  planDegrade,
  readServerSnapshot,
  type DegradePlan,
  type DegradeReason,
  type ServerSnapshotLike,
} from "./degrade";

// =========================================================================
// 状态
// =========================================================================

/** 端侧续传状态机的状态。 */
export type TurnSessionState =
  | "idle"
  | "connecting"
  | "live"
  | "draining"
  | "degraded"
  | "closed";

/** 一帧的处理结论 (幂等判据的结果, T-09)。 */
export type FrameOutcome = "applied" | "duplicate" | "gap";

/** 一个会话的续传状态。 */
export interface TurnSession {
  /** 归属会话。 */
  sessionId: string;
  /** 当前状态。 */
  state: TurnSessionState;
  /** 本轮标识 (服务端给的; attach_ok / stream-state 都会给)。 */
  turnKey: string | null;
  /** 已应用的最大 seq (幂等判据, T-09)。 */
  appliedSeq: number | null;
  /** 本端已渲染的内容 (真相 = turn record)。 */
  record: TurnRecord;
  /** 终态表现 (未终结时 null)。 */
  terminal: TerminalPresentation | null;
  /** 降级原因 (state === 'degraded' 时有值)。 */
  degradeReason: DegradeReason | null;
  /** 降级计划 (state === 'degraded' 时有值)。 */
  degradePlan: DegradePlan | null;
  /**
   * ★ 最近一帧的处理结论。
   *
   * ⚠️ 为什么要挂在 session 上 (而不是让宿主自己算一遍):
   *   幂等判据**只有这一处** (T-09 / G-3) —— 宿主层要判断「这一帧要不要渲染」,
   *   必须读状态机给出的结论, **不许**自己再判一次 (两处判据必然漂移)。
   */
  frameOutcome: FrameOutcome | null;
}

// =========================================================================
// 事件
// =========================================================================

/** 状态机的事件 (现实 → 状态机)。 */
export type TurnSessionEvent =
  /** 开始进场。 */
  | { type: "connect" }
  /** attach 首帧 = 成功。 */
  | { type: "attach_ok"; turnKey?: string | null; summary?: TurnSummaryLike | null }
  /** attach 首帧 = 失败 (接不回来)。 */
  | {
      type: "attach_failed";
      reason?: string | null;
      snapshot?: ServerSnapshotLike | null;
    }
  /** stream-state 说「没在跑」⇒ 走历史, 结束。 */
  | { type: "not_running" }
  /** stream-state **不可达** (问不到) ⇒ 降级, **不抹游标**。 */
  | { type: "unreachable" }
  /** 收到一帧。 */
  | { type: "frame"; frame: TurnFrameLike & SeqFrameLike; cursor?: string | null }
  /** 判定有洞 (seq 跳号) ⇒ 降级。 */
  | { type: "gap"; expected: number; received: number }
  /** 终态帧到了。 */
  | { type: "terminal"; reason: TerminalReason }
  /** 终态内容已排空 ⇒ 关闭。 */
  | { type: "drain" }
  /** 关闭 (降级内容已渲染 / 历史已回落)。 */
  | { type: "close" }
  /** 重连 (保留已应用 seq 与已渲染内容)。 */
  | { type: "reconnect" };

// =========================================================================
// 构造
// =========================================================================

/** 造一个初始 session。 */
export function createTurnSession(
  sessionId: string,
  record?: TurnRecord | null,
  now: number = 0
): TurnSession {
  return {
    sessionId,
    state: "idle",
    turnKey: record?.turnKey ?? null,
    appliedSeq: null,
    record: record ?? emptyTurnRecord(sessionId, now),
    terminal: null,
    degradeReason: null,
    degradePlan: null,
    frameOutcome: null,
  };
}

// =========================================================================
// 迁移
// =========================================================================

/** 这次迁移后, 记录要不要落盘 (内容变了就要)。 */
function touch(session: TurnSession, now: number): TurnSession {
  return {
    ...session,
    record: { ...session.record, updatedAt: now },
  };
}

/**
 * transition —— 状态机迁移 (纯函数)。
 *
 * ⚠️ 所有现实事件都从这里过一遍 —— 状态迁移**只有这一处**。
 *
 * @param session 当前状态
 * @param event   现实事件
 * @param now     时间戳 (给记录打 updatedAt)
 */
export function transition(
  session: TurnSession,
  event: TurnSessionEvent,
  now: number = 0
): TurnSession {
  switch (event.type) {
    // ── 进场 ────────────────────────────────────────────────────────────
    case "connect":
      if (session.state === "closed") return session; // 终态不可回退
      return touch({ ...session, state: "connecting", frameOutcome: null }, now);

    case "attach_ok": {
      if (session.state !== "connecting" && session.state !== "live") {
        return session;
      }
      let record = session.record;
      if (event.summary) {
        record = {
          ...record,
          renderedSnapshot: mergeSummary(record.renderedSnapshot, event.summary),
        };
      }
      return touch(
        {
          ...session,
          state: "live",
          turnKey: event.turnKey ?? session.turnKey,
          record,
          degradeReason: null,
          degradePlan: null,
        },
        now
      );
    }

    case "attach_failed": {
      if (session.state !== "connecting" && session.state !== "live") {
        return session;
      }
      const plan = planDegrade({
        reason: event.reason,
        snapshot: event.snapshot,
      });
      const record = {
        ...session.record,
        renderedSnapshot: applyDegrade(
          session.record.renderedSnapshot,
          plan,
          event.snapshot
        ),
      };
      return touch(
        {
          ...session,
          state: "degraded",
          degradeReason: plan.reason,
          degradePlan: plan,
          record,
        },
        now
      );
    }

    case "not_running": {
      if (session.state === "closed") return session;
      // 确实没在跑 ⇒ 这一轮已经结束 ⇒ 游标作废 (下一轮会重发)。
      const record = { ...session.record, seq: null };
      return touch(
        { ...session, state: "closed", record, degradeReason: null },
        now
      );
    }

    case "unreachable": {
      if (session.state === "closed") return session;
      // ★ 问不到 ≠ 没在跑 ⇒ **游标留着** (缺陷 A-3), 只降级。
      const plan = planDegrade({ reason: "stream_state_unreachable", unreachable: true });
      return touch(
        { ...session, state: "degraded", degradeReason: plan.reason, degradePlan: plan },
        now
      );
    }

    // ── 收帧 ────────────────────────────────────────────────────────────
    case "frame": {
      if (session.state !== "live" && session.state !== "connecting") {
        return session;
      }
      const verdict: SeqVerdict = decideFrame(
        session.appliedSeq,
        event.frame,
        event.cursor ?? null
      );
      if (verdict.kind === "duplicate") {
        // ★ 重复到达 ⇒ 丢弃, **不推进** appliedSeq, **不重渲染** (T-09 / B1)。
        return { ...session, frameOutcome: "duplicate" };
      }
      if (verdict.kind === "gap") {
        // ★ 有洞 ⇒ 降级 (不许静默吞内容) (T-09 / B2)。
        const plan = planDegrade({ reason: "seq_gap" });
        return touch(
          {
            ...session,
            state: "degraded",
            degradeReason: plan.reason,
            degradePlan: plan,
            frameOutcome: "gap",
          },
          now
        );
      }
      const record = {
        ...session.record,
        renderedSnapshot: mergeFrame(session.record.renderedSnapshot, event.frame),
      };
      const applied: TurnSession = touch(
        {
          ...session,
          state: "live",
          appliedSeq: nextAppliedSeq(session.appliedSeq, verdict),
          record,
          frameOutcome: "applied",
        },
        now
      );
      // ★ 终态帧 ⇒ 进 draining (天眼 ⇒ 撤掉已渲染的 partial 正文, T-13)。
      //   ⚠️ 中途哨兵帧 (`{done:true}`) **不是**终态 ⇒ readTerminalReason 返回 null。
      const reason = readTerminalReason(event.frame);
      if (reason) {
        const drained = transition(applied, { type: "terminal", reason }, now);
        // ⚠️ 终态迁移会把 frameOutcome 抹掉 ⇒ 补回来 (宿主层还要据此决定渲不渲染)。
        return { ...drained, frameOutcome: "applied" };
      }
      return applied;
    }

    case "gap": {
      const plan = planDegrade({ reason: "seq_gap" });
      return touch(
        { ...session, state: "degraded", degradeReason: plan.reason, degradePlan: plan },
        now
      );
    }

    // ── 终态 ────────────────────────────────────────────────────────────
    case "terminal": {
      if (session.state === "closed" || session.state === "draining") return session;
      const presentation = presentTerminal(event.reason);
      let snapshot = session.record.renderedSnapshot;
      // ★ 天眼 ⇒ 撤掉已渲染的 partial 正文 (T-13 / 订正 11 / B17)。
      if (presentation.purgeContent) {
        snapshot = purgeRenderedContent(snapshot);
      }
      const record = {
        ...session.record,
        renderedSnapshot: { ...snapshot, terminalReason: event.reason },
      };
      return touch(
        { ...session, state: "draining", terminal: presentation, record },
        now
      );
    }

    case "drain": {
      if (session.state === "closed") return session;
      return touch({ ...session, state: "closed" }, now);
    }

    case "close": {
      if (session.state === "closed") return session;
      return touch({ ...session, state: "closed" }, now);
    }

    // ── 重连 ────────────────────────────────────────────────────────────
    case "reconnect": {
      if (session.state === "closed") return session;
      // ★ 重连**保留**已应用 seq 与已渲染内容 —— 丢了就变成整轮重放 + 内容重复。
      return touch({ ...session, state: "connecting" }, now);
    }
  }
}

/**
 * canTransition —— 这两个状态之间**允许**迁移吗 (给 UI / 断言用)。
 *
 * ⚠️ `closed` 是**终态** —— 任何事件都出不来 (除非显式重开一个 session)。
 */
export function canTransition(from: TurnSessionState, to: TurnSessionState): boolean {
  if (from === "closed") return false;
  if (from === to) return true;
  switch (from) {
    case "idle":
      return to === "connecting";
    case "connecting":
      return to === "live" || to === "degraded" || to === "closed";
    case "live":
      return to === "draining" || to === "degraded" || to === "connecting";
    case "draining":
      // ★ draining → connecting: **上游断了之后允许重连一次** (缺陷 W-1 / B9)。
      //   draining 里的终态是 `upstream_lost` (流断了但没拿到终态帧) ——
      //   那不是「这轮结束了」⇒ 还能重连接回去。
      return to === "closed" || to === "connecting";
    case "degraded":
      return to === "closed";
  }
}

/**
 * isLive —— 这一轮是不是还在跑 (UI 用)。
 */
export function isLive(session: TurnSession): boolean {
  return session.state === "live";
}

/**
 * sessionCursor —— 本机这一轮的游标 (续传用)。
 */
export function sessionCursor(session: TurnSession): string | null {
  return session.record.seq;
}

/**
 * readFilterFrame —— 从一帧里读出天眼信号 (T-13)。
 *
 * ⚠️ 天眼帧的形状是 `{ type:'error', code:'OUTPUT_FILTER_HIT', content:'❗️天眼…' }`
 *   —— 顶层 `type:'error'`, **不是** `{error:'...'}`。
 */
export function readFilterFrame(payload: unknown): {
  filtered: boolean;
  text: string | null;
} {
  if (!payload || typeof payload !== "object") return { filtered: false, text: null };
  const o = payload as Record<string, unknown>;
  if (o.code !== "OUTPUT_FILTER_HIT") return { filtered: false, text: null };
  return {
    filtered: true,
    text: typeof o.content === "string" ? o.content : null,
  };
}

export { readServerSnapshot, normalizeReason };
