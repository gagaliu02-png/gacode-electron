/**
 * electron/client-tools/dispatchLedger.ts —— **派单侧的去重账本**（订正 27 · B6）
 *
 * ## 为什么 `client-done.json` 不够
 *
 * 旧的去重表判据是「**跑过**就打标」（`markDone` 在执行完立刻调）：
 *
 *   · **同步工具**：跑完 ⇒ 打标 ⇒ 设备通道重连补推（L-25m）不会把它**再跑一遍** ✔
 *   · **后台作业**：派单即返回 ⇒ 「跑过」的时刻**远早于**作业结束
 *     ⇒ 重连补推会把一个 24 小时量级的长作业**再启一个** ✘✘
 *     （两个 Claude Code 同时改用户的代码 = 最糟的一种不一致）
 *
 * ⇒ 后台派单必须等「**已上报**」（结果已经回传服务端）才打标
 * ⇒ 需要一个能表达三态的账：
 *
 *   `queued`   —— 派单收到了，作业还没起来（或刚起来）
 *   `running`  —— 作业在本机跑着
 *   `reported` —— 结果**已经回传服务端**（= 这条派单彻底完事）
 *
 * ## ⚠️ 这份账跟「本机作业表」（`localJobs.ts`）是**两回事**，别混
 *
 *   · `localJobs.ts`       = **作业侧**：我起过的作业（进程 / 日志 / 输出偏移 / 状态）
 *   · `dispatchLedger.ts`  = **派单侧**：服务端派过的单（去重 / 是否已上报）
 *
 * ⇒ 两个文件、两份表。一个记「活儿」，一个记「单子」。
 *
 * ## 落盘位置
 *
 *   `%APPDATA%/Gacode/client-dispatch.jsonl`（append-only jsonl，同 `localJobs` 的口径）
 *   ⚠️ append-only 是为了**并发追加不丢行**（多个作业同时在跑，各自追加状态行）。
 */

import * as fs from 'fs';
import * as path from 'path';
import { userDataDir } from './localJobs.ts';

// ===========================================================================
// 类型
// ===========================================================================

/** 派单的三态。 */
export type DispatchState = 'queued' | 'running' | 'reported';

/** 一条派单在**本机**的账。 */
export interface DispatchEntry {
  /** 裁决身份（= 服务端的 `pending_id`；后台作业里它同时是 `job_id`）。 */
  pendingId: string;
  /** 执行模式（`sync` / `background`）。 */
  mode: 'sync' | 'background';
  /** 工具名。 */
  tool: string | null;
  /** 三态。 */
  state: DispatchState;
  /** 第一次收到这条派单的时刻。 */
  startedAt: number;
  /** 结果回传成功的时刻（没回传过 = null）。 */
  reportedAt: number | null;
  /** 失败原因（起作业失败 / 作业报错 …）。 */
  error: string | null;
}

/**
 * 收到一条后台派单时，**该怎么办**。
 *
 * ⚠️ 这是**纯函数**（不碰盘、不碰网）⇒ 单测能直接断言，
 *    而不必把 `deviceClient.ts`（它 import electron）拖进测试进程。
 */
export type BackgroundDispatchDecision =
  /** 没起过 ⇒ 正常起作业。 */
  | 'start'
  /** 已经上报过 ⇒ 这条单子彻底完事了，什么都不做。 */
  | 'skip_reported'
  /** 已经在跑 ⇒ **不许再起一个**（重连补推 / 重复派单）。 */
  | 'skip_running';

/**
 * 判一条后台派单该怎么办。
 *
 * @param entry 账本里这条派单的状态（没有就 null）
 * @param hasLocalJob 本机作业表里**有没有**这条作业（起过 ⇒ 已经在跑）
 *
 * ⚠️ `queued` 这一态要分两种情况：
 *   · **有**本地作业行 ⇒ 作业起来了（状态还没来得及推进到 `running`）⇒ 不许再起一个；
 *   · **没有**本地作业行 ⇒ 作业**根本没起来**（起作业失败，比如找不到 Claude Code）
 *     ⇒ 可以再试一次（顺带把失败原因再报一遍）。
 */
export function decideBackgroundDispatch(
  entry: DispatchEntry | null,
  hasLocalJob = false,
): BackgroundDispatchDecision {
  if (!entry) return 'start';
  if (entry.state === 'reported') return 'skip_reported';
  if (entry.state === 'running') return 'skip_running';
  // queued
  return hasLocalJob ? 'skip_running' : 'start';
}

// ===========================================================================
// ★ [T-165 · D3] 重启死锁的自愈判定
// ===========================================================================

/**
 * 这条派单是不是「**上一轮启动遗留的僵尸 running**」⇒ 该判死。
 *
 * ## 病根（P0）
 *
 *   `decideBackgroundDispatch` 对 `running` **无条件** `skip_running`（见上），
 *   而 `running` 是**落盘**的（`client-dispatch.jsonl`）⇒ **PC 重启后它还在**。
 *   ⇒ 但那个进程早已随 PC 一起没了 ⇒ 既不重跑、也不结账 ⇒ **任务永久搁死**。
 *
 * ## 判据（两个条件都要满足）
 *
 *   ① 派单状态是 `running`（`queued` 是「还没起来」，`reported` 是「已完事」）；
 *   ② 该作业**不可能还在跑**：
 *      - 本机**没有**这条作业的行 ⇒ 作业表里查不到 ⇒ 死了；
 *      - 或有行，但**进程已死**（`isProcessAlive` 为 false）；
 *      - 或有行、进程「活着」，但它的**起始时刻早于本进程启动时刻**
 *        ⇒ 它属于**上一次**启动（pid 被复用）⇒ 死了。
 *
 * ## 为什么「判死 + 销账」而不是「重跑」
 *
 *   派单原文允许两种自愈：**重新入队补推** 或 **明确判死并让服务端销账**。
 *   ⇒ 选**判死**：重跑有副作用（命令可能已执行一半，重跑会重复写/重复删），
 *     而判死只把状态收敛掉，**不产生任何副作用**。
 *
 * @param entry      派单账本里这条（没有 ⇒ null）
 * @param jobAlive   该作业**此刻是否还真的在跑**（由调用方按 pid/启动时刻判定）
 * @returns true = 僵尸 running（该判死并销账）
 */
export function isZombieRunningDispatch(
  entry: DispatchEntry | null,
  jobAlive: boolean,
): boolean {
  if (!entry) return false;
  if (entry.state !== 'running') return false;
  // 作业还活着 ⇒ 不是僵尸（正常在跑，重连补推要跳过）。
  return !jobAlive;
}


// ===========================================================================
// 落盘
// ===========================================================================

/** 派单账本文件（append-only jsonl）。 */
export function dispatchLedgerFile(): string {
  return path.join(userDataDir(), 'client-dispatch.jsonl');
}

/** 追加一行。写失败**不许**影响主流程。 */
function _append(record: DispatchEntry): boolean {
  try {
    const file = dispatchLedgerFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // ⚠️ 上一行若是「写一半被杀」留下的半截 JSON ⇒ 直接追加会粘在它后面
    //    ⇒ 追加前先看一眼文件末尾：不是换行就补一个换行（与 localJobs 同款口径）。
    try {
      const st = fs.statSync(file);
      if (st.size > 0) {
        const fd = fs.openSync(file, 'r');
        try {
          const buf = Buffer.alloc(1);
          fs.readSync(fd, buf, 0, 1, st.size - 1);
          if (buf[0] !== 0x0a) fs.appendFileSync(file, '\n', 'utf8');
        } finally {
          fs.closeSync(fd);
        }
      }
    } catch (_) { /* 读不到就当没有（下面照样追加） */ }
    fs.appendFileSync(file, JSON.stringify({ ts: Date.now(), ...record }) + '\n', 'utf8');
    return true;
  } catch (e) {
    console.error('[client-tools/dispatch] 派单账本落盘失败:', e && (e as Error).message);
    return false;
  }
}

/** 读整份账本，按 pendingId 折叠（后面的行覆盖前面的）。 */
export function loadDispatchLedger(): Record<string, DispatchEntry> {
  const out: Record<string, DispatchEntry> = {};
  let raw = '';
  try {
    raw = fs.readFileSync(dispatchLedgerFile(), 'utf8');
  } catch (_) {
    return out;
  }
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    let rec: any;
    try { rec = JSON.parse(s); } catch (_) { continue; }   // 半截行 ⇒ 跳过
    if (!rec || !rec.pendingId) continue;
    const prev = out[rec.pendingId];
    out[rec.pendingId] = { ...(prev || {}), ...rec } as DispatchEntry;
  }
  return out;
}

/** 全部派单。 */
export function listDispatchEntries(): DispatchEntry[] {
  return Object.values(loadDispatchLedger());
}

/** 取一条派单（没有 ⇒ null）。 */
export function getDispatchEntry(pendingId: string): DispatchEntry | null {
  if (!pendingId) return null;
  return loadDispatchLedger()[pendingId] || null;
}

/**
 * 记一条派单的状态（**追加一行**，不原地改）。
 *
 * ⚠️ 只覆盖显式给的字段（`undefined` 不覆盖）⇒ 调用方只写要改的那几项。
 */
export function markDispatch(
  pendingId: string,
  patch: Partial<DispatchEntry> & { mode?: 'sync' | 'background'; state?: DispatchState },
): DispatchEntry | null {
  if (!pendingId) return null;
  const cur = getDispatchEntry(pendingId);
  const next: DispatchEntry = {
    pendingId,
    mode: patch.mode ?? cur?.mode ?? 'background',
    tool: patch.tool !== undefined ? patch.tool : cur?.tool ?? null,
    state: patch.state ?? cur?.state ?? 'queued',
    startedAt: patch.startedAt ?? cur?.startedAt ?? Date.now(),
    reportedAt: patch.reportedAt !== undefined ? patch.reportedAt : cur?.reportedAt ?? null,
    error: patch.error !== undefined ? patch.error : cur?.error ?? null,
  };
  _append(next);
  return next;
}

/**
 * 标「已上报」（= 这条派单彻底完事了）。
 *
 * ⚠️ 后台作业**只有**到这一态才允许被去重表跳过 ——
 *    早打标 ⇒ 重连补推会把长作业**再启一个**。
 */
export function markDispatchReported(pendingId: string, error?: string | null): DispatchEntry | null {
  return markDispatch(pendingId, {
    state: 'reported',
    reportedAt: Date.now(),
    ...(error === undefined ? {} : { error }),
  });
}
