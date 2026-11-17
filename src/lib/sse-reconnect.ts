/**
 * lib/sse-reconnect.ts — SSE 重连策略 (退避 + watchdog) —— **会话流与通知流共用**
 *
 * ---------------------------------------------------------------------------
 * ⛔ 为什么单独一个模块 (契约 §14.5 P2)
 *
 *   契约 P2: 「会话流的帧解析 / 退避 / watchdog / `Last-Event-ID` **与**
 *   `notifications-sse.ts` **同一实现**」—— 「另写一套 ⇒ P2 转红 (重复实现检测)」。
 *
 *   ⇒ 本模块就是那份「同一实现」: 通知流 (`lib/notifications-sse.ts`) 与会话流
 *     (`lib/chat-stream.ts` / `lib/chat-subscribe.ts`) **都从这里取**退避算术 +
 *     watchdog 判据, 两边都不许自己写 `Math.min(backoff * 2, ...)` /
 *     `Date.now() - lastEventAt` 这类算术。
 *
 *   帧解析的「同一实现」在另一处: 会话流与通知流**共用**
 *     `lib/notifications-sse.ts` 的 `SseFrameParser` (契约 §14.5 P3 ⛔ 禁止写第三遍)。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 这个文件**不在** `src/lib/sse/` 里 —— 那个目录是 web/PC **逐字节相同**的
 *    共享层 (契约 RC-W7 · web 端断言 D1 锁 md5) ⇒ 放进去就得让 web 端同步一份
 *    (本任务不许跨仓) ⇒ 只能住在 `src/lib/` 下。
 *
 * ---------------------------------------------------------------------------
 * 数值口径 (跟通知流原值逐字一致, 不许各端各调)
 *
 *   · 退避: 1s → 2s → 4s … 上限 30s; 连上成功后回到 1s。
 *   · 看门狗: **分级阶梯** 15s / 30s / 60s / 120s (抄 Claude Code `Wv9` 的 `j`)
 *     —— 静默越久越宽容 ⇒ 15s / 30s / 60s 各记一条 warn, **120s 才判死**;
 *     不分级时 = 单档 60s (老口径)。
 *
 * ---------------------------------------------------------------------------
 * ★ [P2-4′ · 2026-11-17] **分级 + 休眠抑制**（Claude Code 字节流看门狗 `Wv9`）
 *
 *   · **分级**: 阈值数组 `[15000, 30000, 60000, 120000]` 逐级递进
 *     ⇒ 静默越久越宽容 ⇒ **不是**固定一个阈值就判死。
 *     净效果: 今天 60s 判死的, 现在 **120s 才判死**
 *     （更宽容 ⇒ 不误杀「模型在想很久」的轮次）。
 *   · **每次收到任何字节都要重新计时**（不是只认「完整帧」）⇒ 调用方用
 *     `notifyBytes()` 通知（心跳 / 半截帧也算有动静）。
 *   · **档位在同一轮静默期里只升不降**（收到数据 ⇒ 回到本轮的第一档重新计）。
 *   · **休眠抑制**: 定时器触发时若「实际经过 < 当前档位阈值 / 2」
 *     ⇒ 说明这期间**系统挂起/休眠**了（定时器被挂起，醒来立刻触发）
 *     ⇒ **不判死**、重新武装（从当前档位继续等），并记一条 warn。
 *     ⚠️ 另配一个**互补判据**：定时器**比预定时刻晚醒**超过「阈值 / 2」
 *       ⇒ 同款现象（挂起 / 事件循环被长任务堵住）⇒ 同上。
 *       （单靠前一个判据只覆盖「单调时钟在挂起期间停走」的机型 —— Windows 上
 *        QueryPerformanceCounter 照走 ⇒ 挂起 5 分钟后照样会被判死 ⇒ 误报「网络失败」。）
 * ==========================================================================
 */

/** 首次重连延迟 (ms)。 */
export const SSE_BACKOFF_INITIAL_MS = 1000;
/** 重连延迟上限 (ms)。 */
export const SSE_BACKOFF_MAX_MS = 30_000;
/** 多久没有任何事件就算断流 (ms)。 —— **不分级**时的单档阈值（老口径）。 */
export const SSE_HEARTBEAT_TIMEOUT_MS = 60_000;
/** 看门狗的检查间隔 (ms)。 */
export const SSE_WATCHDOG_INTERVAL_MS = 10_000;

/**
 * ★ [P2-4′] 看门狗的**分级阶梯**（ms）—— 抄 Claude Code `Wv9` 的 `j`。
 *
 * ⚠️ **只升不降**: 收到字节 ⇒ 回到第一档重新计（见 `noteWatchdogBytes`）。
 */
export const SSE_WATCHDOG_GRADES_MS: readonly number[] = [
  15_000, 30_000, 60_000, 120_000,
];

/**
 * SseBackoff —— 指数退避算术。
 *
 * 语义 (通知流原有行为, 逐字搬过来):
 *   · `current` = 本次要用的延迟;
 *   · `next()` = 取走当前延迟并把下一轮翻倍 (上限 `SSE_BACKOFF_MAX_MS`);
 *   · `reset()` = 连上成功后回到初始值。
 */
export interface SseBackoff {
  /** 本次该用的延迟 (ms)。 */
  readonly current: number;
  /** 取走当前延迟 + 翻倍。 */
  next(): number;
  /** 回到初始延迟。 */
  reset(): void;
}

/** createSseBackoff —— 造一个退避器。 */
export function createSseBackoff(
  initial: number = SSE_BACKOFF_INITIAL_MS,
  max: number = SSE_BACKOFF_MAX_MS,
): SseBackoff {
  let current = initial;
  return {
    get current() {
      return current;
    },
    next() {
      const delay = current;
      current = Math.min(current * 2, max);
      return delay;
    },
    reset() {
      current = initial;
    },
  };
}

// ===========================================================================
// ★ [P2-4′] 看门狗判据（**纯函数** ⇒ `node --test` 能直接跑）
// ===========================================================================

/** 看门狗状态。 */
export interface WatchdogState {
  /** 当前档位下标（0 = 第一档 15s）。不分级时恒为 0。 */
  grade: number;
  /** 上次收到**字节**的时刻 (ms epoch)。 */
  lastByteAt: number;
  /** 已经记过几条 warn（诊断用）。 */
  warns: number;
}

/** 初始状态 (`now` = 此刻)。 */
export function createWatchdogState(now: number): WatchdogState {
  return { grade: 0, lastByteAt: now, warns: 0 };
}

/**
 * noteWatchdogBytes —— **收到字节**（不是收到完整帧！）⇒ 重新计时。
 *
 * ⚠️ 档位**回到第一档**：本轮静默期重新开始（Claude Code `Wv9` 的 `f=0`）。
 * ⚠️ 「字节」而不是「帧」: 服务端可能长时间不发完整帧但一直在吐字节
 *   （心跳 / 半截帧）⇒ 那种情况**不算停滞**。
 */
export function noteWatchdogBytes(
  state: WatchdogState,
  now: number,
): WatchdogState {
  return { ...state, grade: 0, lastByteAt: now };
}

/**
 * 当前档位对应的阈值 (ms)。
 *
 * @param graded 分级开没开（关 ⇒ 单档 60s = 老口径）
 * @param grade  档位下标
 */
export function watchdogThresholdMs(graded: boolean, grade: number): number {
  if (!graded) return SSE_HEARTBEAT_TIMEOUT_MS;
  const idx = Math.min(Math.max(0, grade), SSE_WATCHDOG_GRADES_MS.length - 1);
  return SSE_WATCHDOG_GRADES_MS[idx];
}

/** 看门狗这一拍的决策。 */
export type WatchdogDecision =
  /** 记一条 warn（**不算错**）⇒ 档位 +1，继续等。 */
  | {
      kind: "warn";
      grade: number;
      thresholdMs: number;
      idleMs: number;
      next: WatchdogState;
    }
  /** 疑似系统休眠/挂起 ⇒ **不判死**，重新武装（档位不变）。 */
  | {
      kind: "suspended";
      grade: number;
      thresholdMs: number;
      idleMs: number;
      next: WatchdogState;
    }
  /** 判死 ⇒ 宿主层掐流（走既有失败/降级路径）。 */
  | {
      kind: "dead";
      grade: number;
      thresholdMs: number;
      idleMs: number;
      next: WatchdogState;
    };

/** 决策的入参。 */
export interface WatchdogInput {
  /** 此刻 (ms epoch)。 */
  now: number;
  /** 分级阶梯开没开（关 ⇒ 单档 60s）。 */
  graded: boolean;
  /** 休眠抑制开没开（关 ⇒ 定时器提前触发也照常处理）。 */
  sleepSuppression: boolean;
  /**
   * ★ 定时器**比预定时刻晚了多少**（ms；不知道 ⇒ null）。
   *
   *   · 系统休眠 / 切后台 ⇒ 定时器被挂起 ⇒ 醒来**立刻**触发 ⇒ `late` 很大；
   *   · 事件循环被长任务堵住 ⇒ 同款现象。
   *   ⇒ `late > 阈值 / 2` ⇒ **不判死**（见 `decideWatchdog` 的 ①）。
   */
  lateMs?: number | null;
}

/**
 * decideWatchdog —— 定时器触发时的一拍决策（**纯函数**）。
 *
 * ## 决策顺序（顺序本身是契约）
 *
 *   ① **休眠抑制**（两个判据，任一命中即算）：
 *      · `实际经过 = now - lastByteAt`；若 `实际经过 < 阈值 / 2`
 *        ⇒ 定时器是**被挂起后立刻触发**的（系统休眠/切后台）
 *        ⇒ **不判死**、重新武装（档位不变）；
 *      · `late = now - 预定触发时刻`；若 `late > 阈值 / 2`
 *        ⇒ 定时器**晚醒**（挂起/事件循环被堵）⇒ 同上。
 *   ② **分级**：分级开着且还没到最后一档 ⇒ 记一条 warn ⇒ 档位 +1。
 *   ③ **判死**：到最后一档（分级开 ⇒ 120s；分级关 ⇒ 单档 60s）⇒ `"dead"`。
 *
 * ⚠️ 分级关时**不记 warn**（= 老行为：到点就判死）。
 */
export function decideWatchdog(
  state: WatchdogState,
  input: WatchdogInput,
): WatchdogDecision {
  const idleMs = Math.max(0, input.now - state.lastByteAt);
  const thresholdMs = watchdogThresholdMs(input.graded, state.grade);

  // ① 休眠抑制 —— 定时器提前触发（被挂起后立刻触发）**或**晚醒 ⇒ 重新武装，不判死。
  const firedEarly = idleMs < thresholdMs / 2;
  const firedLate =
    typeof input.lateMs === "number" &&
    Number.isFinite(input.lateMs) &&
    input.lateMs > thresholdMs / 2;
  if (input.sleepSuppression && (firedEarly || firedLate)) {
    return {
      kind: "suspended",
      grade: state.grade,
      thresholdMs,
      idleMs,
      next: { ...state },
    };
  }

  // ② 分级 —— 还有下一档 ⇒ 记 warn（不算错），继续等。
  if (input.graded && state.grade < SSE_WATCHDOG_GRADES_MS.length - 1) {
    const next: WatchdogState = {
      ...state,
      grade: state.grade + 1,
      warns: state.warns + 1,
    };
    return {
      kind: "warn",
      grade: state.grade,
      thresholdMs,
      idleMs,
      next,
    };
  }

  // ③ 判死。
  return {
    kind: "dead",
    grade: state.grade,
    thresholdMs,
    idleMs,
    next: { ...state, warns: state.warns + 1 },
  };
}

/**
 * watchdogArmDelayMs —— 这次该再等多久才检查下一次（ms）。
 *
 * ⚠️ 口径与 Claude Code 一致：`max(0, 阈值 - 已经过去的静默时长)`
 *   ⇒ 定时器**总是**在「累计静默达到阈值」那一刻触发。
 */
export function watchdogArmDelayMs(
  state: WatchdogState,
  now: number,
  graded: boolean,
): number {
  const thresholdMs = watchdogThresholdMs(graded, state.grade);
  const idleMs = Math.max(0, now - state.lastByteAt);
  return Math.max(0, thresholdMs - idleMs);
}

// ===========================================================================
// 看门狗（**装定时器 + 执行动作**）
// ===========================================================================

/**
 * SseWatchdog —— 「多久没动静就当断流」的看门狗。
 */
export interface SseWatchdog {
  /** 启动看门狗 (重复调用不会叠加定时器)。 */
  arm(): void;
  /** 停掉看门狗。 */
  disarm(): void;
  /**
   * ★ [P2-4′] **收到字节** ⇒ 重新计时（档位回到第一档）。
   *
   * ⚠️ 调用方**每收到一个字节**都要调（心跳 / 半截帧也算）⇒
   *   否则「服务端一直在吐心跳但没有完整帧」会被误判成停滞。
   */
  notifyBytes(): void;
}

/** 看门狗的构造参数。 */
export interface SseWatchdogOptions {
  /**
   * 上次收到**字节**的时刻 (ms epoch) —— 由调用方维护。
   *
   * ⚠️ 调用方也可以用 `notifyBytes()` 代替（更准 ⇒ 见 `createSseWatchdog` 内部处理）。
   * ⚠️ **可省**：省了就是「纯字节口径」（只用 `notifyBytes()` 通知）。
   */
  lastEventAt?: () => number;
  /** 判定断流时的回调 (带 idle 毫秒数)。 */
  onTimeout: (idleMs: number) => void;
  /** 不分级时的单档阈值 (默认 60s)。 */
  timeoutMs?: number;
  /** 保留字段（旧实现的轮询间隔）—— 新实现用定时器，**不再使用**。 */
  intervalMs?: number;
  /** 「当前这条流还活着吗」—— 不活跃时不判定断流。 */
  isActive?: () => boolean;
  /**
   * ★ [P2-4′] 分级阶梯开没开（默认**关** = 单档 60s = 老口径）。
   */
  graded?: boolean;
  /**
   * ★ [P2-4′] 休眠抑制开没开（默认**开**：定时器提前触发 ⇒ 重新武装，不判死）。
   */
  sleepSuppression?: boolean;
  /**
   * ★ [P2-4′] 判死开没开（关 ⇒ 只记 warn、**绝不掐流**）。
   */
  judgeDead?: boolean;
  /** ★ [P2-4′] 记 warn 的出口（分级推进 / 休眠抑制都走它）。 */
  onWarn?: (info: {
    reason: "stall" | "suspended";
    grade: number;
    thresholdMs: number;
    idleMs: number;
  }) => void;
  /** 时钟（测试可注入）。 */
  now?: () => number;
}

/**
 * createSseWatchdog —— 造一个看门狗。
 *
 * ⚠️ **计时单位是字节**（不是完整帧）⇒ 调用方每收到字节调 `notifyBytes()`。
 *   忘了调 ⇒ 退化成「按最后一次 `lastEventAt()` 的值计时」（仍可用）。
 */
export function createSseWatchdog(opts: SseWatchdogOptions): SseWatchdog {
  const now = opts.now ?? (() => Date.now());
  const graded = !!opts.graded;
  const sleepSuppression = opts.sleepSuppression !== false;
  const judgeDead = opts.judgeDead !== false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let state: WatchdogState = createWatchdogState(now());
  /** 本次定时器**预定**触发时刻（ms epoch）—— 用来算「晚醒了多少」。 */
  let expectedFireAt = now();

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  /**
   * 把调用方给的「帧口径」时间并进来（**不**动档位）。
   *
   * ⚠️ 调用方若只更新 `lastEventAt()` 而不调 `notifyBytes()`，看门狗**仍然**认得
   *   「刚刚有动静」⇒ 不会误判停滞（老调用方的兼容兜底）。
   */
  const syncFrameActivity = () => {
    if (!opts.lastEventAt) return;
    let t = 0;
    try {
      t = opts.lastEventAt();
    } catch {
      return;
    }
    if (typeof t === "number" && Number.isFinite(t) && t > state.lastByteAt) {
      state = { ...state, lastByteAt: t };
    }
  };

  const armTimer = () => {
    clearTimer();
    const delayMs = watchdogArmDelayMs(state, now(), graded);
    expectedFireAt = now() + delayMs;
    timer = setTimeout(() => {
      timer = null;
      if (opts.isActive && !opts.isActive()) return;
      syncFrameActivity();
      const decision = decideWatchdog(state, {
        now: now(),
        graded,
        sleepSuppression,
        lateMs: now() - expectedFireAt,
      });
      if (decision.kind === "suspended") {
        // ⚠️ 疑似系统休眠/挂起 ⇒ **不判死**，重新武装（档位不变）。
        opts.onWarn?.({
          reason: "suspended",
          grade: decision.grade,
          thresholdMs: decision.thresholdMs,
          idleMs: decision.idleMs,
        });
        state = decision.next;
        armTimer();
        return;
      }
      if (decision.kind === "warn") {
        // ⚠️ warn **不算错** ⇒ 不触发失败路径，只是可观测。
        opts.onWarn?.({
          reason: "stall",
          grade: decision.grade,
          thresholdMs: decision.thresholdMs,
          idleMs: decision.idleMs,
        });
        state = decision.next;
        armTimer();
        return;
      }
      // "dead" —— 到点了。
      state = decision.next;
      if (!judgeDead) {
        // ⚠️ 判死**关着** ⇒ 只记一条日志，**绝不掐流**。
        opts.onWarn?.({
          reason: "stall",
          grade: decision.grade,
          thresholdMs: decision.thresholdMs,
          idleMs: decision.idleMs,
        });
        armTimer();
        return;
      }
      opts.onTimeout(decision.idleMs);
    }, delayMs);
    // Node 端不许定时器吊着进程（浏览器没有 unref ⇒ 用可选调用）。
    (timer as unknown as { unref?: () => void } | null)?.unref?.();
  };

  return {
    arm() {
      state = createWatchdogState(now());
      armTimer();
    },
    disarm() {
      clearTimer();
    },
    notifyBytes() {
      // ★ 收到字节 ⇒ 重新计时 + **档位回到第一档**（本轮静默期重新开始）。
      state = noteWatchdogBytes(state, now());
      if (timer !== null) armTimer();
    },
  };
}
