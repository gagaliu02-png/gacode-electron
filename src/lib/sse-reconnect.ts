/**
 * lib/sse-reconnect.ts — SSE 重连策略 (退避 + watchdog) —— **会话流与通知流共用**
 *
 * ---------------------------------------------------------------------------
 * ⛔ 为什么单独一个模块 (契约 §14.5 P2)
 * ---------------------------------------------------------------------------
 *   契约 P2: 「会话流的帧解析 / 退避 / watchdog / `Last-Event-ID` **与**
 *   `notifications-sse.ts` **同一实现**」—— 「另写一套 ⇒ P2 转红 (重复实现检测)」。
 *
 *   ⇒ 本模块就是那份「同一实现」: 通知流 (`lib/notifications-sse.ts`) 与会话流
 *     (`lib/sse.ts`) **都从这里取**退避算术 + watchdog 判据, 两边都不许自己写
 *     `Math.min(backoff * 2, ...)` / `Date.now() - lastEventAt` 这类算术。
 *
 *   帧解析的「同一实现」在另一处: 会话流与通知流**共用**
 *   `lib/notifications-sse.ts` 的 `SseFrameParser` (契约 §11.4 P3「⛔ 禁止写第三遍」)。
 *
 * ---------------------------------------------------------------------------
 * 数值口径 (跟通知流原值逐字一致, 不许各端各调)
 * ---------------------------------------------------------------------------
 *   · 退避: 1s → 2s → 4s … 上限 30s; 连上成功后回到 1s。
 *   · watchdog: 60s 没有任何事件 ⇒ 判定断流 (某些代理会「卡」住连接)。
 * ---------------------------------------------------------------------------
 */

/** 首次重连延迟 (ms)。 */
export const SSE_BACKOFF_INITIAL_MS = 1000;
/** 重连延迟上限 (ms)。 */
export const SSE_BACKOFF_MAX_MS = 30_000;
/** 多久没有任何事件就算断流 (ms)。 */
export const SSE_HEARTBEAT_TIMEOUT_MS = 60_000;
/** watchdog 的检查间隔 (ms)。 */
export const SSE_WATCHDOG_INTERVAL_MS = 10_000;

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

/**
 * SseWatchdog —— 「多久没动静就当断流」的看门狗。
 */
export interface SseWatchdog {
  /** 启动看门狗 (重复调用不会叠加定时器)。 */
  arm(): void;
  /** 停掉看门狗。 */
  disarm(): void;
}

/**
 * createSseWatchdog —— 造一个看门狗。
 *
 * @param opts.lastEventAt 最近一次收到事件的时刻 (ms epoch)。
 * @param opts.onTimeout    判定断流时的回调 (带 idle 毫秒数)。
 * @param opts.isActive     「当前这条流还活着吗」—— 不活跃时不判定断流。
 */
export function createSseWatchdog(opts: {
  lastEventAt: () => number;
  onTimeout: (idleMs: number) => void;
  timeoutMs?: number;
  intervalMs?: number;
  isActive?: () => boolean;
}): SseWatchdog {
  const timeoutMs = opts.timeoutMs ?? SSE_HEARTBEAT_TIMEOUT_MS;
  const intervalMs = opts.intervalMs ?? SSE_WATCHDOG_INTERVAL_MS;
  let timer: ReturnType<typeof setInterval> | null = null;

  const arm = () => {
    if (timer !== null) clearInterval(timer);
    timer = setInterval(() => {
      if (opts.isActive && !opts.isActive()) return;
      const idle = Date.now() - opts.lastEventAt();
      if (idle <= timeoutMs) return;
      opts.onTimeout(idle);
    }, intervalMs);
  };

  const disarm = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  return { arm, disarm };
}
