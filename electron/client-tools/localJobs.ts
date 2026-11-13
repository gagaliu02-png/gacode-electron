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
