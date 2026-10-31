// =========================================================================
// reconnect —— 端侧重连状态机 (退避 + 预算 + park + jitter)
// ---------------------------------------------------------------------------
// 为什么有这个文件
// ---------------------------------------------------------------------------
//   2026-10-31 实测: web/PC 断线后**只重连一次、无退避、失败后一次性 refetch
//   且不轮询** ⇒ 网络抖一下 (地铁 / 电梯 / 弱网) 这一轮就白跑。
//
//   安卓是**唯一完整实现** (`yinian-android/.../SseReconnectRunner.kt`) ——
//   本文件是它的 TypeScript 翻版, 决策语义**逐条对齐**。
//
// ---------------------------------------------------------------------------
// 三条铁律 (抄自安卓, 不许改)
// ---------------------------------------------------------------------------
//   1. **`attempt` 单调递增且永不重置** ⇒ `attempt >= 2` 才走**续传**
//      ⇒ 防「重新提问」双 LLM (真机 sid=725 事故)。
//      ⚠️ park 被唤醒时**只清预算, 绝不清 attempt** —— 清了就退化成重新提问。
//   2. **没网不烧预算** (offline ⇒ `budgetUsed` 不增长) —— 手机在电梯里照样
//      1s→2s→4s→…→30s 退避的话, 60 次预算半小时就烧完了, 等网一恢复已经没预算。
//   3. **用户停 = 真停** (不重连) —— `shouldStop()` 为真时立刻收手。
//
// ---------------------------------------------------------------------------
// ★ 与 `gacode-electron/src/lib/sse-reconnect.ts` 的关系 (别合并!)
// ---------------------------------------------------------------------------
//   `sse-reconnect.ts` 是**通知流**专用的 (`createSseBackoff` / `createSseWatchdog`),
//   **只存在于 electron 仓**, web 仓没有, 而且它**只在通知流那条路上跑**。
//   ⇒ 本轮**不合并、不修改**它 (动了会扩大通知流的回归面)。
//   ⇒ **会话流**用本文件; **通知流**仍用 `sse-reconnect.ts`。
//
// ---------------------------------------------------------------------------
// ⛔ 本文件**不许** import window / fetch / js-cookie —— PC 要抄这份定稿。
// ⛔ 本文件与 `gacode-electron/src/lib/sse/reconnect.ts` 必须**逐字节相同**。
// =========================================================================

// =========================================================================
// 常量 (抄自安卓 SseReconnectRunner.Companion)
// =========================================================================

/** 重连预算: 用满之后进入「挂起等恢复」。 */
export const DEFAULT_MAX_ATTEMPTS = 60;

/** 退避基数 (1s → 2s → 4s → …)。 */
export const DEFAULT_BASE_DELAY_MS = 1000;

/** 退避上限 (30s)。 */
export const DEFAULT_CAP_DELAY_MS = 30000;

/**
 * 预算用尽后的挂起上限: 5 分钟。
 *
 * 为什么有上限: 挂起期间这一轮还占着「进行中」, 而挂起期间用户看不到服务端
 * 后来落库的结果 ⇒ 无限期挂着 = 用户盯着一个永远不动的气泡。
 * 5 分钟后交出控制权 ⇒ 降级轮询兜底接管。
 */
export const DEFAULT_SUSPEND_TIMEOUT_MS = 5 * 60 * 1000;

/** 降级轮询兜底: 每 3 秒轮询一次历史 (安卓同款)。 */
export const DEFAULT_POLL_INTERVAL_MS = 3000;

/** 降级轮询兜底: 上限 60 秒 ⇒ 超时后停 (⛔ 不许无限轮询)。 */
export const DEFAULT_POLL_TIMEOUT_MS = 60000;

// =========================================================================
// 状态 / 动作 (纯数据)
// =========================================================================

/**
 * 一次尝试的结果。
 *
 *   · `completed`      —— 这一轮正常收完 (拿到终态帧) ⇒ **不重连**;
 *   · `connection_lost` —— 断了 ⇒ 按预算退避重试。
 */
export type ReconnectOutcome =
  | { readonly kind: "completed" }
  | { readonly kind: "connection_lost"; readonly reason?: string };

/**
 * 重连状态机的状态。
 *
 *   · `attempt`       —— 已经发起的 attempt 数 (1-based, **单调递增, 绝不重置**);
 *   · `budgetUsed`    —— 当前预算窗口内已消耗的 attempt 数 (挂起被唤醒后会**清零**,
 *                        但 `attempt` 不清零 —— 两个计数器是分开的);
 *   · `backoffPending`—— 上一步是不是「退避」(是的话这一步**直接发**, 退避的等待
 *                        已经在上一步里等完了 —— 没有这个标志就会永远退避、永不再发);
 *   · `lastOutcome`   —— 上一次 attempt 的结果 (null = 还没试过)。
 */
export interface ReconnectState {
  readonly attempt: number;
  readonly budgetUsed: number;
  readonly backoffPending: boolean;
  readonly lastOutcome: ReconnectOutcome | null;
}

/** 重连状态机的一步动作。 */
export type ReconnectAction =
  /** 没网 ⇒ 挂起等网络恢复 (**不消耗预算**)。 */
  | { readonly kind: "wait_network" }
  /** 发起一次 attempt (attempt 号 1-based, 单调递增)。 */
  | { readonly kind: "attempt"; readonly attempt: number }
  /** 退避 delayMs 后再试。 */
  | { readonly kind: "backoff"; readonly delayMs: number }
  /** 预算用尽 ⇒ 挂起等恢复信号 (网络恢复 / 回前台 / 手动重试)。 */
  | { readonly kind: "park" }
  /** 结束: 把结果交回调用方。 */
  | { readonly kind: "finish"; readonly outcome: ReconnectOutcome };

/** 一步决策 = 要做的动作 + 动作执行完之后的**新状态**。 */
export interface ReconnectStep {
  readonly action: ReconnectAction;
  readonly next: ReconnectState;
}

/** 初始状态。 */
export function createReconnectState(): ReconnectState {
  return { attempt: 0, budgetUsed: 0, backoffPending: false, lastOutcome: null };
}

// =========================================================================
// 退避算术 (含 jitter)
// =========================================================================

/** 退避算术的入参。 */
export interface BackoffOptions {
  /** 退避基数 (默认 1000)。 */
  baseDelayMs?: number;
  /** 退避上限 (默认 30000)。 */
  capDelayMs?: number;
  /**
   * 随机源 (默认 `Math.random`)。
   *
   * ⚠️ **必须可注入** ⇒ 否则断言不可靠 (同一状态两次决策可能给出不同的 delay)。
   */
  rand?: () => number;
}

/**
 * computeBackoffDelayMs —— 第 `attempt` 次尝试失败后的退避时长 (含 jitter)。
 *
 * 公式 (派工单 RC-7「jitter」条):
 *
 *   `raw   = min(cap, base * 2^(attempt-1))`
 *   `delay = round(raw * (0.8 + 0.4 * rand()))`   ⇒ **±20%**
 *
 * ⚠️ **为什么要 jitter**: 指数退避不带 jitter ⇒ 一整批客户端同时醒来 ⇒ 惊群
 *   (thundering herd) ⇒ 服务端被同一秒的请求打穿。
 *
 * ⚠️ `rand` 注入 `() => 0.5` ⇒ 抖动因子正好 = 1.0 ⇒ 拿到的就是裸退避序列
 *   (1s → 2s → 4s → … → 30s cap) ⇒ 断言可确定复现。
 */
export function computeBackoffDelayMs(
  attempt: number,
  options: BackoffOptions = {}
): number {
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const capDelayMs = options.capDelayMs ?? DEFAULT_CAP_DELAY_MS;
  const rand = options.rand ?? Math.random;
  // ⚠️ 指数位移封顶 30 位 —— 2^31 已经溢出 JS 的 32 位整型, 再往上就是 Infinity。
  const shift = Math.min(30, Math.max(0, Math.round(attempt) - 1));
  const raw = Math.min(capDelayMs, baseDelayMs * Math.pow(2, shift));
  const factor = 0.8 + 0.4 * rand();
  return Math.round(raw * factor);
}

// =========================================================================
// 纯决策函数
// =========================================================================

/** 决策函数的入参。 */
export interface ReconnectDecisionInput {
  /** 现在有网吗 (false ⇒ 等网络, **不烧预算**)。 */
  online: boolean;
  /**
   * 上一次挂起的结果:
   *   · `true`  —— 被信号唤醒 (预算清零, 换一个新窗口; **attempt 不清零**)
   *   · `false` —— 等到超时 (交出控制权)
   *   · `null`  —— 没挂起过
   */
  parkWoken?: boolean | null;
  /** 重连预算 (默认 60)。 */
  maxAttempts?: number;
  /** 退避基数 (默认 1000)。 */
  baseDelayMs?: number;
  /** 退避上限 (默认 30000)。 */
  capDelayMs?: number;
  /** 随机源 (默认 `Math.random`)。 */
  rand?: () => number;
}

/**
 * createReconnectDecision —— 重连决策 (**纯函数**)。
 *
 * 给定状态 ⇒ 回答「下一步该干什么」。**决策顺序本身就是契约**:
 *
 *   1. 上一次已经 `completed`            ⇒ `finish` (不重连);
 *   2. 挂起刚结束:
 *      · 被唤醒 ⇒ `attempt` (预算清零换新窗口; **attempt 不清零**);
 *      · 等到超时 ⇒ `finish` (交出控制权);
 *   3. **没网** ⇒ `wait_network` (**不消耗预算**);
 *   4. 刚退避完 (`backoffPending`) ⇒ `attempt` (退避已经等过了, 直接发);
 *   5. 还没试过 ⇒ `attempt`;
 *   6. 上一次是断线:
 *      · 预算还有 ⇒ `backoff` (1s→2s→4s→…→30s cap, 带 jitter);
 *      · 预算用尽 ⇒ `park`。
 *
 * ⚠️ **纯函数**: 同样的 state + 同样的 input ⇒ 同样的 action (⛔ 不许读任何
 *   外部可变变量 —— 那是「不可测」的根源)。`rand` 是**注入**进来的, 所以
 *   注入 `() => 0.5` 就能确定复现。
 */
export function createReconnectDecision(
  state: ReconnectState,
  input: ReconnectDecisionInput
): ReconnectStep {
  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const last = state.lastOutcome;

  // ① 已经正常收完 ⇒ 不重连。
  if (last && last.kind === "completed") {
    return { action: { kind: "finish", outcome: last }, next: state };
  }

  // ② 挂起刚结束 ⇒ 唤醒就再来一次 (预算清零), 超时就交出控制权。
  if (input.parkWoken !== null && input.parkWoken !== undefined) {
    if (input.parkWoken) {
      // ★ attempt 保持单调 (**不清零**) —— 它是「续传还是重发」的判据,
      //   清零就退化成「重新 POST 同一句提问」⇒ 双 LLM + 双回复。
      return {
        action: { kind: "attempt", attempt: state.attempt + 1 },
        next: {
          ...state,
          attempt: state.attempt + 1,
          budgetUsed: 1,
          backoffPending: false,
          lastOutcome: null,
        },
      };
    }
    // 挂起等到超时 ⇒ 交出控制权 (游标已落盘, 用户回来时由进场序列接回)。
    // 上一次的结果就是「断线」—— 万一状态里没有, 兜底也按断线交, 不能瞎报成功。
    return {
      action: {
        kind: "finish",
        outcome: last ?? {
          kind: "connection_lost",
          reason: "挂起等恢复超时",
        },
      },
      next: state,
    };
  }

  // ③ 没网 ⇒ 挂起等网络 (**不消耗预算**)。
  if (!input.online) {
    return { action: { kind: "wait_network" }, next: state };
  }

  // ④ 刚退避完 ⇒ 直接发 (退避的等待已经在上一步里等完了)。
  if (state.backoffPending) {
    return {
      action: { kind: "attempt", attempt: state.attempt + 1 },
      next: {
        ...state,
        attempt: state.attempt + 1,
        budgetUsed: state.budgetUsed + 1,
        backoffPending: false,
      },
    };
  }

  // ⑤ 还没试过 ⇒ 直接发起 (attempt 1 = 正常 POST, 不是续传)。
  if (last === null) {
    return {
      action: { kind: "attempt", attempt: state.attempt + 1 },
      next: {
        ...state,
        attempt: state.attempt + 1,
        budgetUsed: state.budgetUsed + 1,
        backoffPending: false,
      },
    };
  }

  // ⑥ 上一次断了: 预算还有 ⇒ 退避再试; 用尽 ⇒ 挂起等恢复。
  if (state.budgetUsed < maxAttempts) {
    const delayMs = computeBackoffDelayMs(state.attempt, {
      baseDelayMs: input.baseDelayMs,
      capDelayMs: input.capDelayMs,
      rand: input.rand,
    });
    // ★ backoffPending = true —— 退避之后状态必须变, 否则下一次决策会**再退避一次**,
    //   永远退避、永远不再发请求。
    return {
      action: { kind: "backoff", delayMs },
      next: { ...state, backoffPending: true },
    };
  }
  return { action: { kind: "park" }, next: state };
}

// =========================================================================
// 降级轮询兜底 (RC-7「轮询兜底」条)
// =========================================================================

/** 轮询兜底的状态。 */
export interface PollFallbackState {
  /** 已经过去多久 (ms)。 */
  readonly elapsedMs: number;
  /** 已经轮询了几次。 */
  readonly polls: number;
}

/** 轮询兜底的一步决策。 */
export type PollFallbackAction =
  /** 再轮询一次 (下一次轮询的时刻 = `nextPollAtMs`)。 */
  | { readonly kind: "poll"; readonly nextPollAtMs: number; readonly polls: number }
  /** 到上限了 ⇒ 停 (⛔ 不许无限轮询)。 */
  | { readonly kind: "stop"; readonly polls: number };

/**
 * createPollFallbackDecision —— 降级轮询兜底的决策 (**纯函数**)。
 *
 * 语义:
 *   · 没到上限 ⇒ `poll` (每 `intervalMs` 一次, 默认 3s);
 *   · 到了上限 (`elapsedMs >= timeoutMs`, 默认 60s) ⇒ `stop`。
 *
 * ⇒ 默认参数下最多轮询 **20 次** (60s / 3s) 然后停 ⇒ 绝不会是无限轮询。
 */
export function createPollFallbackDecision(
  state: PollFallbackState,
  options: { intervalMs?: number; timeoutMs?: number } = {}
): PollFallbackAction {
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  if (state.elapsedMs >= timeoutMs) {
    return { kind: "stop", polls: state.polls };
  }
  return {
    kind: "poll",
    nextPollAtMs: state.elapsedMs + intervalMs,
    polls: state.polls + 1,
  };
}

// =========================================================================
// 等信号 / 睡觉 (宿主层要用, 但不许在宿主层各写一份)
// =========================================================================

/** 事件源 —— 宿主把 `window` / `document` 传进来 (⛔ 本文件不 import window)。 */
export interface SignalTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** `waitForSignal` 的入参。 */
export interface WaitForSignalOptions {
  /** 订阅哪些事件 (任意一个触发即算「被唤醒」)。 */
  events?: string[];
  /** 取消信号 (用户按了停止 / 组件卸载 ⇒ 立刻返回 false)。 */
  signal?: AbortSignal;
  /** 事件触发后的额外过滤 (例如「必须是 visible 才算唤醒」)。 */
  accept?: (eventType: string) => boolean;
}

/**
 * waitForSignal —— 等一个「恢复信号」(网络回来 / 回前台)。
 *
 * @param source    事件源 (宿主把 window / document 传进来)
 * @param timeoutMs 最多等多久 (`Infinity` = 无限等)
 * @returns `true` = 被唤醒; `false` = 等到超时 / 已被取消
 */
export function waitForSignal(
  source: SignalTarget,
  timeoutMs: number,
  options: WaitForSignalOptions = {}
): Promise<boolean> {
  const events = options.events ?? ["online"];
  const signal = options.signal;
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // ⚠️ 每个事件一个 listener —— 移除时必须移除**当初加进去的那一个**。
    const listeners = new Map<string, () => void>();
    const cleanup = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      for (const [ev, listener] of listeners) {
        source.removeEventListener(ev, listener);
      }
      listeners.clear();
      if (signal) signal.removeEventListener("abort", onAbort);
    };
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(ok);
    };
    const onAbort = () => finish(false);
    for (const ev of events) {
      const listener = () => {
        if (options.accept && !options.accept(ev)) return;
        finish(true);
      };
      listeners.set(ev, listener);
      source.addEventListener(ev, listener);
    }
    if (signal) {
      if (signal.aborted) {
        finish(false);
        return;
      }
      signal.addEventListener("abort", onAbort);
    }
    if (Number.isFinite(timeoutMs) && timeoutMs >= 0) {
      timer = setTimeout(() => finish(false), timeoutMs);
    }
  });
}

/**
 * sleepWithSignal —— 等 ms 毫秒, 但**可以被取消信号打断**。
 *
 * ⚠️ 为什么退避要能被打断: 退避最长 30s —— 用户在这 30s 里按了「停止」,
 *   端侧还傻等 30s 才反应过来 ⇒ 界面像卡死。
 */
export function sleepWithSignal(
  ms: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      if (signal) signal.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      cleanup();
      resolve();
    };
    timer = setTimeout(() => {
      timer = null;
      cleanup();
      resolve();
    }, Math.max(0, ms));
    if (signal) signal.addEventListener("abort", onAbort);
  });
}

// =========================================================================
// 执行器 (端口注入)
// =========================================================================

/** 执行器需要的端口 (全部注入 ⇒ 本文件零 import)。 */
export interface ReconnectPorts {
  /** 现在有网吗。 */
  isOnline(): boolean;
  /**
   * 等一个「恢复信号」(网络回来 / 回前台 / 用户手动重试)。
   *
   * @param timeoutMs 最多等多久 (`Infinity` = 无限等, 用于「等网络」)
   * @returns `true` = 被唤醒, `false` = 等到超时
   */
  awaitSignal(timeoutMs: number): Promise<boolean>;
  /** 执行一次 attempt (发一次请求)。 */
  runOnce(attempt: number): Promise<ReconnectOutcome>;
  /** 等 ms 毫秒 (退避用; 宿主层要能被 abort 打断)。 */
  sleep(ms: number): Promise<void>;
  /** 用户是否已经叫停 (true ⇒ 立刻收手, 不再重试)。 */
  shouldStop?(): boolean;
  /** 降级轮询兜底的一拍 (宿主层在这里拉历史)。 */
  onPollTick?(): Promise<void> | void;
  /** 日志出口 (诊断用)。 */
  log?(message: string): void;
}

/** 执行器的入参。 */
export interface ReconnectOptions {
  /** 重连预算 (默认 60)。 */
  maxAttempts?: number;
  /** 退避基数 (默认 1000)。 */
  baseDelayMs?: number;
  /** 退避上限 (默认 30000)。 */
  capDelayMs?: number;
  /** 挂起上限 (默认 5 分钟)。 */
  suspendTimeoutMs?: number;
  /** 随机源 (默认 `Math.random`)。 */
  rand?: () => number;
  /**
   * 降级轮询兜底的间隔 (默认 3000)。
   * ⛔ 传 `null` ⇒ **不**做轮询兜底 (只退避, 不轮询历史)。
   */
  pollIntervalMs?: number | null;
  /** 降级轮询兜底的上限 (默认 60000)。 */
  pollTimeoutMs?: number;
}

/**
 * runReconnectFlow —— 跑完整个「断线 → 重连 → 降级轮询」闭环。
 *
 * 流程 (决策全在 `createReconnectDecision` 里, 这里只负责**执行**):
 *
 *   ① 没网 ⇒ 等网络 (不烧预算)
 *   ② 发起 attempt ⇒ 成了就收工; 断了就退避 (1s→2s→4s→…→30s, 带 jitter)
 *   ③ 预算用尽 (60 次) ⇒ 挂起等恢复 (≤5 分钟) ⇒ 被唤醒就**换一个新窗口**继续
 *   ④ 最终还是断了 ⇒ **降级轮询兜底**: 每 3 秒轮询一次历史, 上限 60 秒后停
 *
 * ⚠️ **用户停 = 真停**: `shouldStop()` 为真时立刻收手 (不重连、不轮询)。
 */
export async function runReconnectFlow(
  ports: ReconnectPorts,
  options: ReconnectOptions = {}
): Promise<ReconnectOutcome> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const capDelayMs = options.capDelayMs ?? DEFAULT_CAP_DELAY_MS;
  const suspendTimeoutMs = options.suspendTimeoutMs ?? DEFAULT_SUSPEND_TIMEOUT_MS;
  const rand = options.rand ?? Math.random;
  const pollIntervalMs =
    options.pollIntervalMs === undefined
      ? DEFAULT_POLL_INTERVAL_MS
      : options.pollIntervalMs;
  const pollTimeoutMs = options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;

  let state = createReconnectState();
  let parkWoken: boolean | null = null;

  const loop = async (): Promise<ReconnectOutcome> => {
    for (;;) {
      // ★ 铁律三: 用户停 = 真停。
      if (ports.shouldStop?.()) {
        return { kind: "connection_lost", reason: "用户已叫停" };
      }
      const step = createReconnectDecision(state, {
        online: ports.isOnline(),
        parkWoken,
        maxAttempts,
        baseDelayMs,
        capDelayMs,
        rand,
      });
      parkWoken = null;
      state = step.next;

      switch (step.action.kind) {
        case "wait_network":
          ports.log?.("[sse-reconnect] 没网 ⇒ 等网络恢复 (不消耗预算)");
          await ports.awaitSignal(Number.POSITIVE_INFINITY);
          break;
        case "attempt": {
          const outcome = await ports.runOnce(step.action.attempt);
          state = { ...state, lastOutcome: outcome };
          if (outcome.kind === "completed") return outcome;
          break;
        }
        case "backoff":
          ports.log?.(
            `[sse-reconnect] attempt=${state.attempt}/${maxAttempts} ⇒ 退避 ${step.action.delayMs}ms`,
          );
          await ports.sleep(step.action.delayMs);
          break;
        case "park":
          ports.log?.(
            `[sse-reconnect] 预算用尽 (${maxAttempts}) ⇒ 挂起等恢复 (≤${suspendTimeoutMs}ms)`,
          );
          parkWoken = await ports.awaitSignal(suspendTimeoutMs);
          break;
        case "finish":
          return step.action.outcome;
      }
    }
  };

  const outcome = await loop();

  // ④ 最终还是断了 ⇒ 降级轮询兜底 (每 3s 拉一次历史, 上限 60s ⇒ 不许无限轮询)。
  //   ⚠️ 用户已经叫停 ⇒ **不轮询** (铁律三: 用户停 = 真停)。
  if (
    outcome.kind === "connection_lost" &&
    pollIntervalMs !== null &&
    !ports.shouldStop?.()
  ) {
    let pollState: PollFallbackState = { elapsedMs: 0, polls: 0 };
    for (;;) {
      const decision = createPollFallbackDecision(pollState, {
        intervalMs: pollIntervalMs,
        timeoutMs: pollTimeoutMs,
      });
      if (decision.kind === "stop") break;
      await ports.sleep(pollIntervalMs);
      pollState = { elapsedMs: decision.nextPollAtMs, polls: decision.polls };
      try {
        await ports.onPollTick?.();
      } catch (err) {
        ports.log?.(`[sse-reconnect] 降级轮询失败 (忽略): ${String(err)}`);
      }
      if (ports.shouldStop?.()) break;
    }
    ports.log?.(
      `[sse-reconnect] 降级轮询结束 (${pollState.polls} 次 / ${pollState.elapsedMs}ms)`,
    );
  }

  return outcome;
}
