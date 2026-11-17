/**
 * electron/client-tools/localJobs.ts —— **本机作业表**（订正 27 §2 · L-27e/L-27f）
 *
 * ## 为什么要有这张表
 *
 * 后台作业是 **24 小时量级**的，而且进程是 **detached** 的
 * （`Gacode` 关了，Claude Code 还在跑）⇒
 *   · Gacode 重启后得知道「我之前起的作业还在不在」；
 *   · 作业跑完后要把结果**补回传**给服务端（当时通道断了）。
 * ⇒ 这张表就是「**我起过的作业**」的**本地真值**。
 *
 * ## ⚠️ 为什么是 append-only jsonl（不是「数组 + 整体覆写」）
 *
 * `localTasks.ts` 用的是「内存数组 + 整体覆写 JSON」—— 那是**串行**任务，跑一个写一次。
 * 而作业是**并发**的（多个作业同时在跑，还要各自追加状态行）
 * ⇒ 整体覆写会**丢行**（A 刚写完、B 读旧值再写回 ⇒ A 那行没了）。
 * ⇒ 改成 **append-only jsonl**（与服务端 `client-pending.store.js` 同款）：
 * 每次状态变化**追加一行**，读取时按 `jobId` 折叠（后面的行覆盖前面的）。
 *
 * ## 三态
 *
 *   `queued`   —— 已派单、还没起进程（或起来了但还没拿到 pid）
 *   `running`  —— 进程在跑
 *   `reported` —— **结果已经回传给服务端**（只有到这一态才算「完事」）
 *
 * ⚠️ **`reported` 才是「完事」** —— 这跟 `client-done.json` 的旧语义不同：
 *   旧表是「**跑过**」就打标 ⇒ 重连补推会把 24 小时的长作业**再启一个**。
 *   ⇒ 作业必须到「**已上报**」才打标（见 `deviceClient` 的三态账本，B6）。
 *
 * ## 落盘位置
 *
 *   作业表：`%APPDATA%/Gacode/local-jobs.jsonl`
 *   作业输出：`%APPDATA%/Gacode/jobs/<jobId>.log`（stdout+stderr，detached 进程重定向而来）
 */

import * as fs from 'fs';
import * as path from 'path';

/** 一条本机作业。 */
export interface LocalJob {
  /** = 服务端的 `pending_id`（裁决身份）。 */
  id: string;
  /** 用的哪个 CLI 服务（`raw` / `claude` …）。 */
  serviceId: string;
  /** 起进程用的命令行（诊断用）。 */
  argv: string[];
  /** 工作目录。 */
  cwd: string | null;
  /** 进程 pid —— ⚠️ **必须持久化**（Gacode 重启后还要能报状态 / 杀进程）。 */
  pid: number | null;
  /** 发起这个作业的会话。 */
  sessionId: string | null;
  /** 输出日志文件。 */
  outputFile: string | null;
  /** 三态 + 终态：`queued` → `running` → `reported`（= 已回传，完事）/ `failed` / `cancelled`。 */
  status: 'queued' | 'running' | 'reported' | 'failed' | 'cancelled';
  /** 起跑时刻。 */
  startedAt: number;
  /** 结束时刻。 */
  settledAt: number | null;
  /** 退出码（拿不到就是 null）。 */
  exitCode: number | null;
  /** 回传时刻。 */
  reportedAt: number | null;
  /** 最近一次读到的输出偏移（增量读，避免重复解析整份日志）。 */
  outputOffset: number;
  /** 最后一次摘要（给 UI 看）。 */
  summary: string | null;
}

/**
 * 配置目录。
 *
 * ⚠️ **不在模块顶层 import electron** —— 那样这个文件就没法被 `node --test` 直接测了。
 *    运行时懒加载；单测环境走 `GACODE_USER_DATA_DIR` 或临时目录（跟 `gate.ts` 同款）。
 */
export function userDataDir(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') return app.getPath('userData');
  } catch (_) { /* 不是 Electron 环境（单测）⇒ 走下面的兜底 */ }
  return process.env.GACODE_USER_DATA_DIR || path.join(require('os').tmpdir(), 'gacode-client-tools');
}

/** 作业表文件（append-only jsonl）。 */
export function localJobsFile(): string {
  return path.join(userDataDir(), 'local-jobs.jsonl');
}

/** 作业输出日志目录。 */
export function jobsDir(): string {
  return path.join(userDataDir(), 'jobs');
}

/** 某个作业的输出日志文件。 */
export function jobLogFile(jobId: string): string {
  return path.join(jobsDir(), `${jobId}.log`);
}

/** 追加一行（append-only）。写失败**不许**影响主流程。 */
function _append(record: Partial<LocalJob> & { id: string }): boolean {
  try {
    const file = localJobsFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // ⚠️ 上一行若是「写一半被杀」留下的**半截 JSON**，直接追加会**粘在它后面**
    //    ⇒ 半截行 + 新行 一起变成一条废行 ⇒ **新记录也丢了**。
    // ⇒ 追加前先看一眼文件末尾：不是换行就补一个换行，把半截行隔开。
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
    console.error('[client-tools/jobs] 作业表落盘失败:', e && (e as Error).message);
    return false;
  }
}

/** 读整份账本，按 jobId 折叠（后面的行覆盖前面的）。 */
export function loadJobs(): Record<string, LocalJob> {
  const out: Record<string, LocalJob> = {};
  let raw = '';
  try {
    raw = fs.readFileSync(localJobsFile(), 'utf8');
  } catch (_) {
    return out;
  }
  for (const line of raw.split('\n')) {
    const s = line.trim();
    if (!s) continue;
    let rec: any;
    try { rec = JSON.parse(s); } catch (_) { continue; }   // 半截行 ⇒ 跳过
    if (!rec || !rec.id) continue;
    const prev = out[rec.id];
    out[rec.id] = { ...(prev || {}), ...rec } as LocalJob;
  }
  return out;
}

/** 全部作业。 */
export function listJobs(): LocalJob[] {
  return Object.values(loadJobs());
}

/** 取一个作业。 */
export function getJob(id: string): LocalJob | null {
  if (!id) return null;
  return loadJobs()[id] || null;
}

/**
 * 记一条作业（新起一条）。
 *
 * @param job 至少含 `id` / `serviceId`
 */
export function appendJob(job: Partial<LocalJob> & { id: string; serviceId: string }): LocalJob {
  const full: LocalJob = {
    id: job.id,
    serviceId: job.serviceId,
    argv: job.argv || [],
    cwd: job.cwd ?? null,
    pid: job.pid ?? null,
    sessionId: job.sessionId ?? null,
    outputFile: job.outputFile ?? null,
    status: job.status || 'queued',
    startedAt: job.startedAt ?? Date.now(),
    settledAt: job.settledAt ?? null,
    exitCode: job.exitCode ?? null,
    reportedAt: job.reportedAt ?? null,
    outputOffset: job.outputOffset ?? 0,
    summary: job.summary ?? null,
  };
  _append(full as unknown as Partial<LocalJob> & { id: string });
  return full;
}

/**
 * 改一个作业的状态（**追加一行**，不原地改）。
 *
 * ⚠️ 只覆盖显式给的字段（`undefined` 不覆盖）⇒ 调用方只写要改的那几项。
 */
export function updateJob(id: string, patch: Partial<LocalJob>): LocalJob | null {
  const cur = getJob(id);
  if (!cur) return null;
  const next: LocalJob = { ...cur };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    (next as any)[k] = v;
  }
  _append(next as unknown as Partial<LocalJob> & { id: string });
  return next;
}

/** 标「已上报」（= 这条作业彻底完事了）。 */
export function markJobReported(id: string, summary?: string): LocalJob | null {
  return updateJob(id, {
    status: 'reported',
    reportedAt: Date.now(),
    settledAt: Date.now(),
    ...(summary === undefined ? {} : { summary }),
  });
}

/** 还没上报的作业（重连后要补回传的就是它们）。 */
export function listUnreportedJobs(): LocalJob[] {
  return listJobs().filter((j) => j && j.status !== 'reported');
}

// ===========================================================================
// ★ [2026-11-17] 自动压缩 —— append-only jsonl 不压缩会一直涨
// ===========================================================================

/**
 * 触发压缩的「废行比例」门槛。
 *
 * `local-jobs.jsonl` 每次状态变化追加一行（一个作业可能有 5~10 行），
 * 但读取时按 jobId 折叠（后面的行覆盖前面的）⇒ 旧行全是废行。
 * ⇒ 废行超过一半就重写一遍（**只留每个 id 的最后一行**）。
 *
 * ⚠️ **只压缩，不删除任何作业、不删任何日志** —— 用户的作业记录是
 *    「我的电脑」页的历史列表，要一直看得见（PM 2026-11-17 拍板）。
 *    磁盘上只剩「每个作业一行」⇒ 实测 660 行压到 28 行，体积降 ~95%，
 *    但 UI 显示的作业一条不少。
 */
const COMPACT_WASTE_RATIO = 0.5;

/**
 * 压缩 append-only jsonl（不删任何作业记录 / 日志）。
 *
 * ## 做什么
 *
 *   1. 读整份账本 ⇒ 折叠出每个 jobId 的最后一行（**全部作业都留着**）；
 *   2. 废行超过一半 ⇒ 原子重写 jsonl（写 .tmp + rename），
 *      文件从「660 行废行」压到「28 行有效记录」；
 *   3. ⛔ **不删日志、不删作业** —— 列表和历史一条不少。
 *
 * ## ⚠️ 安全性
 *
 *   · 所有作业（包括 running / cancelled / 最老的）**一行不动**；
 *   · 原子重写 ⇒ 中途崩溃不会留下半截文件。
 *
 * @returns `{removedJobs:0, removedLogFiles:0, compacted}`（前两个恒 0 —— 只压缩不删除）
 */
export function pruneFinishedJobs(now = Date.now()): {
  removedJobs: number;
  removedLogFiles: number;
  compacted: boolean;
} {
  let raw = '';
  try {
    raw = fs.readFileSync(localJobsFile(), 'utf8');
  } catch (_) {
    return { removedJobs: 0, removedLogFiles: 0, compacted: false };
  }
  const lines = raw.split('\n').filter((s) => s.trim());
  if (!lines.length) return { removedJobs: 0, removedLogFiles: 0, compacted: false };

  // 折叠（同一份口径：后面的行覆盖前面的）——全部作业都保留。
  const folded: Record<string, LocalJob> = {};
  for (const line of lines) {
    let rec: any;
    try { rec = JSON.parse(line); } catch (_) { continue; }
    if (!rec || !rec.id) continue;
    folded[rec.id] = { ...(folded[rec.id] || {}), ...rec } as LocalJob;
  }

  const waste = lines.length - Object.keys(folded).length;
  if (waste < lines.length * COMPACT_WASTE_RATIO) {
    return { removedJobs: 0, removedLogFiles: 0, compacted: false };
  }

  const out = Object.values(folded).map((j) => JSON.stringify(j)).join('\n') + '\n';

  // 原子重写（跟 deviceStore._persist 同款口径）。
  const file = localJobsFile();
  const tmp = `${file}.tmp-${process.pid}-${now}`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, out, 'utf8');
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    console.error('[client-tools/jobs] 作业表压缩失败:', e && (e as Error).message);
    return { removedJobs: 0, removedLogFiles: 0, compacted: false };
  }
  return { removedJobs: 0, removedLogFiles: 0, compacted: true };
}

/**
 * ★ [2026-11-17] **一键清空「已结束」的后台作业记录**（UI「清空」按钮）。
 *
 * 对齐「执行记录」的清空交互（gate.clearAudit）—— 用户点一下就把历史清掉。
 *
 * ## 只清已结束的，**绝不清正在跑的**
 *
 *   · 清：`reported` / `failed` / `cancelled`（都已经是终态）；
 *   · 留：`queued` / `running`（还在跑，清了就再也看不到、停不掉）；
 *   · 同时删掉被清作业的 `jobs/<jobId>.log`（输出日志）。
 *
 * ⚠️ 跟 `pruneFinishedJobs()` 的区别：那个是**自动压缩废行、一条不删**；
 *    这个是**用户显式点「清空」⇒ 真的删掉**已结束的作业（跟执行记录一个待遇）。
 *
 * @returns `{cleared}`（清掉了几条已结束作业）
 */
export function clearFinishedJobs(now = Date.now()): { cleared: number } {
  let raw = '';
  try {
    raw = fs.readFileSync(localJobsFile(), 'utf8');
  } catch (_) {
    return { cleared: 0 };
  }
  const lines = raw.split('\n').filter((s) => s.trim());
  if (!lines.length) return { cleared: 0 };

  // 折叠（后面的行覆盖前面的）—— 判终态要看最后一次状态。
  const folded: Record<string, LocalJob> = {};
  for (const line of lines) {
    let rec: any;
    try { rec = JSON.parse(line); } catch (_) { continue; }
    if (!rec || !rec.id) continue;
    folded[rec.id] = { ...(folded[rec.id] || {}), ...rec } as LocalJob;
  }
  const isFinished = (j: LocalJob) =>
    j.status === 'reported' || j.status === 'failed' || j.status === 'cancelled';
  const finishedIds = Object.values(folded).filter(isFinished).map((j) => j.id);
  if (!finishedIds.length) return { cleared: 0 };

  const kept = Object.values(folded).filter((j) => !isFinished(j));
  const out = kept.length ? kept.map((j) => JSON.stringify(j)).join('\n') + '\n' : '';

  // 原子重写（跟 pruneFinishedJobs 同款口径）。
  const file = localJobsFile();
  const tmp = `${file}.tmp-${process.pid}-${now}`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, out, 'utf8');
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    console.error('[client-tools/jobs] 清空已结束作业失败:', e && (e as Error).message);
    return { cleared: 0 };
  }

  // jsonl 写好了 ⇒ 再删日志。
  for (const id of finishedIds) {
    try { fs.unlinkSync(jobLogFile(id)); } catch (_) { /* 日志不存在 / 被占用 ⇒ 忽略 */ }
  }
  return { cleared: finishedIds.length };
}

/**
 * 定期压缩定时器（主进程启动时开一次）。
 *
 * ⚠️ 间隔 **1 小时**：压缩只处理废行，不需要频繁跑。
 * ⚠️ `unref()`：不许把主进程事件循环吊住。
 */
export const JOB_PRUNE_INTERVAL_MS = 60 * 60 * 1000;

export function startJobPruner(): NodeJS.Timeout | null {
  try {
    // 启动时先跑一次（把历史上堆积的废行一次性压掉）。
    pruneFinishedJobs();
    const timer = setInterval(() => { pruneFinishedJobs(); }, JOB_PRUNE_INTERVAL_MS);
    try { timer.unref(); } catch (_) { /* 老 Node 没有 unref */ }
    return timer;
  } catch (e) {
    console.error('[client-tools/jobs] 启动作业清理失败:', e && (e as Error).message);
    return null;
  }
}
