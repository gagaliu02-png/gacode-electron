/**
 * lib/p2-features.ts —— P2 特性开关（③ 安全边界停止 / ④ 看门狗分级 + 休眠抑制）
 *
 * ---------------------------------------------------------------------------
 * ## ★ PM 拍板（2026-11-17，**最新口径，以本节为准**）：「停止」= **硬打断**
 *
 *   PM 原话：「用户侧的停止按钮，应该和之前一样，就是直接打断。」
 *
 *   ⇒ **「用户按停止」恒发 `USER_STOP`**（掐上游 ⇒ 这一轮的正文 / 工具成果 / 思考
 *     **全部丢弃**）—— 就是 P2 之前的老行为。
 *
 *   ⚠️ **「停止」按钮永远不发 `INTERRUPT`**。
 *
 *   ## `INTERRUPT`（软停 / 安全边界停止）真正的用途 = **插话**
 *
 *   PM 澄清：「软停是**插话**的语义 —— 有新内容插进来（用户发起 / 后端任务发起）时，
 *   服务端软停把上一轮收掉（产出保留），然后带新内容开下一轮。
 *   **这条路由服务端自己发起，端侧不需要发软停指令。**」
 *
 *   ⇒ 端侧只**保留** `INTERRUPT` 这个意图的字面与线上字节（将来插话路径可能从这儿发），
 *     但**「停止」按钮不碰它**。
 *
 * ---------------------------------------------------------------------------
 * ## ★ 下面这个默认值表还剩什么用？
 *
 *   · ④ 看门狗三个开关（分级 / 休眠抑制 / 判死）**照旧生效**（默认 `true`）。
 *   · ③ `safeStop` **不再作用于「停止」按钮** —— 它现在只是**预留**给将来的
 *     插话 / 软停路径（`resolveStopIntent` 恒返回 `USER_STOP` ⇒ 改这个开关
 *     **不会**改变「停止」的行为）。
 *
 * ---------------------------------------------------------------------------
 * ## 这个文件还剩什么用？—— **应急退路**（不是「要不要用新路」的门禁）
 *
 *   生产上出问题时，**改一行 localStorage 就能立刻退回老行为**，不用等一次发版
 *   （安卓要重新打包、PC 要重新出包）⇒ 它**不是**产品门禁，是**逃生舱**。
 *
 * ---------------------------------------------------------------------------
 * ## 怎么翻（优先级从高到低）
 *
 *   ① **运行时 localStorage**（`gacode.p2.flags`）—— 不用重新构建，立刻生效
 *      （调试 / 线上应急用）。在 PC 的 DevTools 控制台执行一行：
 *          localStorage.setItem("gacode.p2.flags", JSON.stringify({watchdogGraded:false}))
 *      ⚠️ **只写要覆盖的那几个键** ⇒ 没写的键回落代码常量。
 *   ② **代码常量**（本文件 `P2_FLAG_DEFAULTS`）—— 改代码 ⇒ 重新构建生效（可审计、可回滚）。
 *
 *   优先级：①（localStorage）> ②（代码常量）。
 *
 * ---------------------------------------------------------------------------
 * ## 为什么放在 `src/lib/` 而不是组件里
 *
 *   开关的判据必须**只有一份**（G-3：一处真值）—— 页面 / 流层 / 测试都读它。
 *   ⛔ 本文件**不许** import React / api ⇒ 纯 TS，`node --test` 能直接跑。
 * ==========================================================================
 */

/** localStorage 里的键名（运行时覆盖 / 应急退路用）。 */
export const P2_FLAG_STORAGE_KEY = "gacode.p2.flags";

/**
 * ③「安全边界停止」（软停）—— **默认开**（保留值）。
 *
 * ⚠️ **它不再作用于「停止」按钮** —— PM 2026-11-17 拍板：「停止」= **硬打断**
 *   （恒发 `USER_STOP` ⇒ 掐上游 ⇒ 产出全丢）⇒ `resolveStopIntent` 恒返回 `"USER_STOP"`
 *   ⇒ **改这个开关不会改变「停止」的行为**。
 *
 * ⇒ 这个常量现在只是**预留**给将来的**插话 / 软停**路径（`INTERRUPT` 的真正用途：
 *   服务端自己发起的软停 —— 有新内容插进来时把上一轮收掉，产出保留）。
 */
export const SAFE_STOP_DEFAULT = true;

/**
 * ④「看门狗分级阶梯」（15s/30s/60s/120s）—— **默认开**（PM 2026-11-17 拍板）。
 *
 * 开着 = 静默 15s / 30s / 60s 各记一条 warn，**120s 才判死**（比老口径的 60s 更宽容
 * ⇒ 不误杀「模型在想很久」的轮次）。
 * 关掉 = 老口径（单档 60s 判死）—— 仅作应急退路。
 */
export const WATCHDOG_GRADED_DEFAULT = true;

/**
 * ④「看门狗休眠抑制」—— **默认开**。
 *
 * 定时器**提前**触发 ⇒ 系统休眠 / 切后台把定时器挂起了 ⇒ **不判死**，重新武装。
 * ⚠️ 它只消除**误报**，不改正常路径。
 */
export const WATCHDOG_SLEEP_SUPPRESSION_DEFAULT = true;

/**
 * ④「看门狗判死」—— **默认开**（与分级配套：阶梯最后一档才判死）。
 *
 * ⚠️ 关掉 = 只记 warn、**绝不掐流**（= 宁可卡住也不误杀）—— 仅作应急退路。
 */
export const WATCHDOG_JUDGE_DEAD_DEFAULT = true;

/** 全部 P2 开关（一份真值）。 */
export interface P2Flags {
  /**
   * ③ 安全边界停止（软停）—— **预留**给将来的插话路径。
   * ⚠️ **不再作用于「停止」按钮**（PM 2026-11-17：停止 = 硬打断 ⇒ 恒 `USER_STOP`）。
   */
  safeStop: boolean;
  /** ④ 看门狗分级阶梯（15/30/60/120）。 */
  watchdogGraded: boolean;
  /** ④ 看门狗休眠抑制（定时器提前触发 ⇒ 重新武装，不判死）。 */
  watchdogSleepSuppression: boolean;
  /** ④ 看门狗判死（静默超时 ⇒ 掐流走失败/降级路径）。 */
  watchdogJudgeDead: boolean;
}

/** 默认值（④ 看门狗三个开关 = 新路；③ `safeStop` = 预留值，不作用于「停止」）。 */
export const P2_FLAG_DEFAULTS: P2Flags = {
  safeStop: SAFE_STOP_DEFAULT,
  watchdogGraded: WATCHDOG_GRADED_DEFAULT,
  watchdogSleepSuppression: WATCHDOG_SLEEP_SUPPRESSION_DEFAULT,
  watchdogJudgeDead: WATCHDOG_JUDGE_DEAD_DEFAULT,
};

/** 开关名（localStorage 里的键）。 */
export type P2FlagKey = keyof P2Flags;

/** 最小存储接口（浏览器 localStorage / 测试用的假 storage 都满足）。 */
export interface FlagStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * 读 localStorage 里的覆盖值（只认**布尔**字段；坏 JSON ⇒ 忽略）。
 *
 * ⚠️ storage 为 null / 抛异常 ⇒ 返回 `{}`（回落代码常量）。
 */
export function readStoredFlags(
  storage: FlagStorageLike | null | undefined,
): Partial<P2Flags> {
  if (!storage) return {};
  let raw: string | null = null;
  try {
    raw = storage.getItem(P2_FLAG_STORAGE_KEY);
  } catch {
    return {};
  }
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const o = parsed as Record<string, unknown>;
  const out: Partial<P2Flags> = {};
  for (const key of Object.keys(P2_FLAG_DEFAULTS) as P2FlagKey[]) {
    if (typeof o[key] === "boolean") out[key] = o[key] as boolean;
  }
  return out;
}

/** 拿「浏览器 localStorage」（Electron renderer 里有；Node 测试里没有 ⇒ null）。 */
function defaultStorage(): FlagStorageLike | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * readP2Flags —— 读当前生效的开关（localStorage > 代码常量）。
 *
 * @param storage 浏览器 localStorage（测试可注入假 storage）；不给 ⇒ 用全局的。
 */
export function readP2Flags(storage?: FlagStorageLike | null): P2Flags {
  const store = storage === undefined ? defaultStorage() : storage;
  const stored = readStoredFlags(store);
  const out: P2Flags = { ...P2_FLAG_DEFAULTS };
  for (const key of Object.keys(out) as P2FlagKey[]) {
    if (key in stored) out[key] = stored[key] as boolean;
  }
  return out;
}

/**
 * writeP2Flag —— 翻一个开关（写 localStorage ⇒ 立刻生效，不用重新构建）。
 *
 * ⚠️ 只写**这一个**键 ⇒ 其它键保持原样。
 *
 * @returns 写完之后生效的开关（读回）。
 */
export function writeP2Flag(
  key: P2FlagKey,
  value: boolean,
  storage?: FlagStorageLike | null,
): P2Flags {
  const store = storage === undefined ? defaultStorage() : storage;
  if (!store) return readP2Flags(null);
  const current = readStoredFlags(store);
  const next: Partial<P2Flags> = { ...current, [key]: value };
  try {
    store.setItem(P2_FLAG_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore（隐私模式 / 配额满）⇒ 回落代码常量 */
  }
  return readP2Flags(store);
}

/**
 * resolveStopIntent —— 「用户按停止」时该发哪个取消意图。
 *
 *   ★ [T-044 · 2026-11-18] **改成 `"STOP_TURN"`**（PM 口径①，对齐安卓端）：
 *     红色停止键 = **只停当前这一轮** ⇒ 后台活 / 队列 / 后续轮次**都不受影响**。
 *
 *   ## 之前是 `"USER_STOP"`（PM 2026-11-17 拍板「直接打断」）
 *
 *     `USER_STOP` 在 gaclaw 侧会**武装 pending cancel** ⇒ 队列里排着的下一条消息
 *     被 pre-abort（v1.2.61 同款故障）；而且它**连带**停后台活
 *     ⇒ 用户只想停当前这一轮，却把后台调研全杀了（真机 session 1050 · 11:10:24）。
 *
 *   ## 为什么用 `stop_turn` 而不是 `interrupt`
 *
 *     `interrupt` 是**软停**（跑到安全边界才停 ⇒ 产出保留）⇒ 是「插话」的语义，
 *     **服务端自己发起** ⇒ 端侧的停止按钮不用它。
 *
 *   ⚠️ 服务端**不认识**这个意图时按 legacy 处理（= 硬掐 = 老行为）
 *     ⇒ **不需要能力协商**。
 */
export function resolveStopIntent(
  flags: P2Flags,
): "USER_STOP" | "INTERRUPT" | "STOP_TURN" {
  // ⚠️ `flags` 现在**不参与**判定（保留参数是为了调用点不变 + 将来插话路径能直接用）。
  void flags;
  return "STOP_TURN";
}
