/**
 * electron/client-tools/jobRunner.ts —— **后台作业的进程管理**（订正 27 §2/§4）
 *
 * ## 进程模型：detached + 输出落文件（**不是**管道）
 *
 * 作业是 24 小时量级的，**不能**靠 Electron 主进程的生命周期：
 *
 *   · **进程 detached**（`detached: true` + `windowsHide: true`）
 *     ⇒ **Gacode 关了，Claude Code 还在跑**。
 *   · **stdout/stderr 重定向到文件**，不是管道
 *     ⇒ app 重启后仍能读到进度（管道随父进程一起没了）。
 *   · 端侧**轮询文件尾部**拿增量，不持有活着的管道。
 *
 * ## 🔴 为什么不能用 `runCommand`（node-pty）跑后台作业
 *
 * `pty.ts` 的 `runCommand` 有三个硬伤：
 *   ① Promise **只在进程退出时 resolve**（后台作业要「启动即返回 pid」）；
 *   ② stdout 在**内存里**累积到 200000 字符上限（长跑必爆）；
 *   ③ pty 宿主退出 ⇒ conhost 把子进程一起带走（**detached 语义失效**）。
 *
 * ⇒ 后台作业用 `child_process.spawn` + `detached` + **文件重定向**（不用管道）。
 * ⇒ 顺带绕开 node-pty 的 ABI 地狱（后台作业不依赖 node-pty）。
 *
 * ## ⚠️ 「完成」怎么判
 *
 *   · **通用命令**（`raw`）：进程退出 ⇒ 用 `isProcessAlive(pid)` 判。
 *   · **Claude Code**：完成信号 = **`result` 事件**（`claudeService.isComplete`）。
 *     ⇒ 进程还在跑但已经出了 `result` ⇒ 也算完成。
 */

import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { getCliService } from './cliService.ts';
import type { CliEvent, CliService } from './cliService.ts';
import { isProcessAlive, killTree } from './proc.ts';
import {
  appendJob,
  getJob,
  jobLogFile,
  jobsDir,
  listUnreportedJobs,
  updateJob,
} from './localJobs.ts';
import type { LocalJob } from './localJobs.ts';

// ⚠️ **本文件刻意不 import `claudeService.ts`** ——
//    那个模块带「作业无人值守 ⇒ 不逐条审批」的标志，而**单测只做形状断言**、
//    不需要真起 agent ⇒ 别把它拖进测试进程。
//    `claude` 服务的注册在 `cliServices.ts`（由 `backgroundJobs.ts` 调一次）。
//    `raw` 服务在 `cliService.ts` 里就地注册（定义与注册同文件 ⇒ 无循环依赖）。

/** 起一次后台作业的结果。 */
export interface StartedJob {
  jobId: string;
  pid: number;
  outputFile: string;
  serviceId: string;
}

/**
 * 起一个后台作业。
 *
 * ⚠️ **立即返回**（不等它跑完）—— 这就是「派单即返回」的端侧一半。
 *
 * @param jobId 作业 id（= 服务端的 `pending_id`）
 * @param service CLI 服务（`raw` / `claude` …）
 * @param invocation 怎么起（由服务自己算）
 */
export function startJob(
  jobId: string,
  service: CliService,
  invocation: { command: string; args: string[]; cwd: string | null; env?: Record<string, string> },
): StartedJob {
  fs.mkdirSync(jobsDir(), { recursive: true });
  const outputFile = jobLogFile(jobId);

  // ⚠️ 同一个 fd 打开两次（stdout / stderr 各一个）⇒ 两个 fd 都是 **O_APPEND**
  //    ⇒ 两边都往文件末尾追加，不会互相覆盖。
  let outFd: number | null = null;
  let errFd: number | null = null;
  try {
    outFd = fs.openSync(outputFile, 'a');
    errFd = fs.openSync(outputFile, 'a');
  } catch (e) {
    if (outFd !== null) { try { fs.closeSync(outFd); } catch (_) {} }
    throw new Error(`作业日志文件打不开: ${outputFile} (${(e as Error).message})`);
  }

  let child: ChildProcess;
  try {
    child = spawn(invocation.command, invocation.args, {
      cwd: invocation.cwd || undefined,
      env: {
        ...(process.env as Record<string, string>),
        ...(invocation.env || {}),
      },
      // ★ detached：作业**独立于 Gacode 存活**（Gacode 关了它还在跑）。
      windowsHide: true,
      detached: true,
      stdio: ['ignore', outFd, errFd],
    });
  } catch (e) {
    try { fs.closeSync(outFd); } catch (_) {}
    try { fs.closeSync(errFd); } catch (_) {}
    throw new Error(`作业起不来: ${(e as Error).message}`);
  }
  // ⚠️ fd 的所有权交给子进程了 ⇒ 父进程这边**必须**关掉（否则文件句柄泄漏）。
  try { fs.closeSync(outFd); } catch (_) {}
  try { fs.closeSync(errFd); } catch (_) {}

  // ⚠️ unref：作业**不该**把 Electron 主进程的事件循环吊住
  //    （它是 24 小时量级的后台活，不是「等它结束」的前台调用）。
  //    unref 之后 'exit' 事件仍然会来（只要主进程自己还活着）。
  try { child.unref(); } catch (_) {}

  const pid = child.pid || 0;
  appendJob({
    id: jobId,
    serviceId: service.id,
    argv: [invocation.command, ...invocation.args],
    cwd: invocation.cwd,
    pid,
    outputFile,
    status: 'running',
    startedAt: Date.now(),
    outputOffset: 0,
  });

  return { jobId, pid, outputFile, serviceId: service.id };
}

/**
 * 读作业日志的**新增**部分（增量读）。
 *
 * @param fromOffset 从哪个字节开始读
 * @returns `{ text, nextOffset }` —— text 是新增的完整行
 */
export function readJobOutput(outputFile: string, fromOffset: number): { text: string; nextOffset: number } {
  let size = 0;
  try {
    size = fs.statSync(outputFile).size;
  } catch (_) {
    return { text: '', nextOffset: fromOffset };
  }
  if (size <= fromOffset) return { text: '', nextOffset: fromOffset };
  let buf: Buffer;
  try {
    const fd = fs.openSync(outputFile, 'r');
    try {
      const len = size - fromOffset;
      buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, fromOffset);
    } finally {
      fs.closeSync(fd);
    }
  } catch (_) {
    return { text: '', nextOffset: fromOffset };
  }
  const text = buf.toString('utf8');
  return { text, nextOffset: size };
}

/**
 * 收一个作业的**状态**（增量解析日志 + 判断进程是否还活着）。
 *
 * ⚠️ 事件**不缓存**（每次从头解析）—— 日志可能很大，但作业没结束时用不到；
 *    真要缓存得另存一份事件文件，本批不做。
 */
export function pollJob(job: LocalJob): {
  job: LocalJob;
  alive: boolean;
  done: boolean;
  events: CliEvent[];
  summary: string | null;
} {
  const service = getCliService(job.serviceId);
  const alive = job.pid ? isProcessAlive(job.pid) : false;

  let events: CliEvent[] = [];
  let offset = job.outputOffset || 0;
  if (job.outputFile) {
    const { text, nextOffset } = readJobOutput(job.outputFile, offset);
    offset = nextOffset;
    if (text && service) {
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        const ev = service.parseOutput(line);
        if (ev) events.push(ev);
      }
    }
  }

  const complete = !!(service && service.isComplete(events));
  const done = complete || !alive;
  const summary = done && service && events.length
    ? service.summarize(events)
    : null;

  const next = updateJob(job.id, {
    outputOffset: offset,
    ...(done ? { settledAt: job.settledAt ?? Date.now(), status: job.status === 'reported' ? 'reported' : 'failed' } : {}),
    ...(summary ? { summary } : {}),
  });

  return {
    job: next || job,
    alive,
    done,
    events,
    summary,
  };
}

/** 停一个作业（杀整棵进程树）。 */
export function stopJob(job: LocalJob): boolean {
  if (!job || !job.pid) return false;
  killTree(job.pid);
  updateJob(job.id, { status: 'cancelled', settledAt: Date.now(), summary: '已被用户停止' });
  return true;
}

/**
 * ★ [2026-11-13] **按 id 停一个后台作业**（用户手动打断）。
 *
 * ## 为什么必须有这条
 *
 * 后台作业是 **detached** 的独立进程 ⇒ 它**不在** `deviceClient.running` 里
 * （派单即返回就出队了）⇒ 光 abort 那个 AbortController **杀不到它**
 * ⇒ 用户点了「停」而作业还在跑 ⇒ 那是最糟的一种不一致。
 *
 * ⇒ 打断的语义统一成：**按 pending_id（= job_id）把进程树杀掉**。
 *
 * @returns `stopped` = 这次真的动手了（作业不存在 / 已回传 ⇒ false）
 */
export function stopJobById(jobId: string): { stopped: boolean; job: LocalJob | null } {
  const job = getJob(jobId);
  if (!job) return { stopped: false, job: null };
  if (job.status === 'reported') return { stopped: false, job };
  const alive = job.pid ? isProcessAlive(job.pid) : false;
  if (job.pid) killTree(job.pid);
  const next = updateJob(jobId, {
    status: 'cancelled',
    settledAt: Date.now(),
    ...(alive ? { summary: '已被用户停止' } : {}),
  });
  return { stopped: true, job: next || job };
}

/**
 * ★ [2026-11-13] **停掉所有还在跑的作业**（一键急停）。
 *
 * ⚠️ 急停的承诺是「**现在**给我停下」⇒ 后台作业（detached）也在内
 *    —— 只杀同步任务的话，Claude Code 会在用户急停之后继续改他的代码。
 *
 * @returns 这次掐掉的作业数
 */
export function stopAllJobs(): number {
  let n = 0;
  for (const job of listUnreportedJobs()) {
    if (!job.pid) continue;
    if (!isProcessAlive(job.pid)) continue;
    if (stopJobById(job.id).stopped) n += 1;
  }
  return n;
}

/**
 * 作业的一行状态（给 `pc_job_status` 用）。
 */
export function describeJob(job: LocalJob): string {
  if (!job) return '作业不存在';
  const svc = getCliService(job.serviceId);
  const title = svc ? svc.title : job.serviceId;
  const alive = job.pid ? isProcessAlive(job.pid) : false;
  const state = job.status === 'reported' ? '已回传' : alive ? '正在跑' : '已结束';
  const lines = [
    `作业 ${job.id}`,
    `类型: ${title}`,
    `状态: ${state}`,
    `开始于: ${new Date(job.startedAt).toISOString()}`,
  ];
  if (job.pid) lines.push(`进程 pid: ${job.pid}`);
  if (job.summary) {
    lines.push('最近进展:');
    lines.push(job.summary.length > 2000 ? job.summary.slice(0, 2000) + '…' : job.summary);
  }
  return lines.join('\n');
}

/** 取一个作业（不存在 ⇒ null）。 */
export function findJob(id: string): LocalJob | null {
  return getJob(id);
}

// ⚠️ 顺手再导出：调用方（测试 / 将来 IPC）常要问「这个 pid 还活着吗」。
export { isProcessAlive };
