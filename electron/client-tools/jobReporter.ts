/**
 * electron/client-tools/jobReporter.ts —— **后台作业的巡检 + 结果回传**（订正 27 · B6）
 *
 * ## 为什么需要「巡检」
 *
 * 后台作业是 **detached 的独立进程**（派单即返回就出队了）：
 *
 *   · 作业在**主进程之外**跑着（Gacode 关了它还在跑）；
 *   · 作业跑完时，**没有任何回调**会通知主进程（进程不是我们的子进程，
 *     甚至可能跨重启 ⇒ 拿不到 `exit` 事件）；
 *   · 服务端那边**在等**这个结果（`POST /devices/tasks/:pendingId/result`）
 *     ⇒ 不回传 = 用户永远等不到「作业完了」。
 *
 * ⇒ 主进程里必须有一个人**定时去看**：作业还在跑吗？跑完了吗？跑完了就把结果回传。
 *
 * ## 为什么「只回传一次」
 *
 * 服务端对同一条派单的第二次回传会回 **409**（L-25n，幂等）⇒ 重复回传虽不致命，
 * 但会**制造噪音**（服务端日志 + 端侧的重试风暴）⇒ 本模块保证：
 *
 *   · 回传**成功** ⇒ 作业标 `reported`（+ 派单账标 `reported`）⇒ 再也不回传；
 *   · 回传**失败**（网络抖 / 服务端 5xx）⇒ **保持未上报** ⇒ 下一拍再试；
 *   · 服务端回 **409**（已经结过）⇒ 视为「已送达」⇒ 也标 `reported`（不再重试）。
 *
 * ## ⚠️ 「完成」怎么判
 *
 * 跟 `jobRunner.pollJob` 同一个口径：
 *   · **通用命令**（`raw`）：进程退出即完成；
 *   · **Claude Code**：完成信号 = `result` 事件（进程可能还在跑尾巴）。
 *
 * ⚠️ **汇总要读整份日志**（不是只读增量）：
 *   `pollJob` 每次只解析**新增**的那一段 ⇒ 「完成」可能落在上一拍里，
 *   这一拍就只剩空输出 ⇒ 汇总会丢。
 *   ⇒ 判定完成之后**再整读一遍**，把 `result` 事件 / 尾部输出捞回来。
 */

import * as fs from 'fs';
import { getCliService } from './cliService.ts';
import type { CliEvent, CliService } from './cliService.ts';
import { listJobs, markJobReported, updateJob } from './localJobs.ts';
import type { LocalJob } from './localJobs.ts';
import { pollJob } from './jobRunner.ts';
import { markDispatchReported } from './dispatchLedger.ts';
import { emitJobsChanged } from './jobView.ts';

/** 巡检间隔（毫秒）—— 5~10 秒之间（题面要求）。 */
export const JOB_SWEEP_INTERVAL_MS = 7000;

/** 回传给服务端的 stdout 最多留多少字（长作业的输出能到几十 MB ⇒ 必须裁）。 */
export const REPORT_MAX_STDOUT_CHARS = 8000;

/** 整读日志时最多留多少个事件（防内存爆掉；`result` 事件在**最后**，不会被裁掉）。 */
const MAX_EVENTS = 20000;

/** 回传给服务端的结果载荷（= D3 的 body 子集）。 */
export interface JobReportPayload {
  /**
   * `ok`（跑完且成功）/ `error`（跑完但失败 / 起不来）/ `denied`（被端侧闸门拒绝）。
   * ⚠️ D3 的 schema 三个都收（`unified-api/src/modules/yinian/device.routes.js`）。
   */
  status: 'ok' | 'error' | 'denied';
  stdout?: string;
  error?: string;
  exitCode?: number;
}

/**
 * 回传函数（由 `deviceClient` 提供：它才有 access token）。
 *
 * @returns 服务端收下了吗（`true` = 已送达 / 已经结过 ⇒ 不必再试）
 */
export type JobReportFn = (jobId: string, payload: JobReportPayload) => Promise<boolean>;

// ===========================================================================
// 小工具
// ===========================================================================

function truncate(text: string, max: number): string {
  const s = String(text || '');
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/**
 * 整读作业日志 ⇒ 全部事件。
 *
 * ⚠️ 只在**判定完成之后**调（一次）—— 日志可能很大，平时不碰。
 */
export function readAllJobEvents(job: LocalJob): CliEvent[] {
  const service = getCliService(job.serviceId);
  if (!service || !job.outputFile) return [];
  let raw = '';
  try {
    raw = fs.readFileSync(job.outputFile, 'utf8');
  } catch (_) {
    return [];
  }
  const events: CliEvent[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let ev: CliEvent | null = null;
    try {
      ev = service.parseOutput(line);
    } catch (_) {
      ev = null;
    }
    if (ev) events.push(ev);
    if (events.length >= MAX_EVENTS) {
      // 只留最后 MAX_EVENTS 个（`result` 事件在最后 ⇒ 一定留着）。
      return events.slice(events.length - MAX_EVENTS);
    }
  }
  return events;
}

/**
 * 造回传载荷。
 *
 * ⚠️ **失败要说清原因**（`error`）—— 服务端那边会把它折进给用户看的那条汇报里。
 */
export function buildJobReport(
  job: LocalJob,
  events: CliEvent[],
  service: CliService | null,
): JobReportPayload {
  let summary: string | null = null;
  try {
    summary = service && events.length ? service.summarize(events) : (job.summary || null);
  } catch (_) {
    summary = job.summary || null;
  }
  const stdout = summary ? truncate(summary, REPORT_MAX_STDOUT_CHARS) : undefined;

  // ① 用户喊停的 ⇒ 失败原因就是「被用户停止」。
  if (job.status === 'cancelled') {
    return { status: 'error', stdout, error: '作业已被用户停止' };
  }
  // ② Claude Code 自己报错（`result` 事件带 `is_error`）。
  const resultEvent = events.find((e) => e && e.type === 'result');
  if (resultEvent && resultEvent.isError) {
    const detail = String(resultEvent.text || '').trim();
    return {
      status: 'error',
      stdout,
      error: detail ? `作业执行失败：${truncate(detail, 500)}` : '作业执行失败',
      ...(job.exitCode != null ? { exitCode: job.exitCode } : {}),
    };
  }
  // ③ 知道退出码且非 0 ⇒ 失败。
  if (job.exitCode != null && job.exitCode !== 0) {
    return {
      status: 'error',
      stdout,
      error: `命令退出码 ${job.exitCode}`,
      exitCode: job.exitCode,
    };
  }
  // ④ 其余按成功报（输出全在 stdout 里，模型自己看得懂）。
  return {
    status: 'ok',
    stdout,
    ...(job.exitCode != null ? { exitCode: job.exitCode } : {}),
  };
}

/**
 * 还没回传出去的作业。
 *
 * ⚠️ 判据 = `status !== 'reported'` **且** `reportedAt` 为空 ——
 *    「用户喊停」的作业状态是 `cancelled`（不是 `reported`），
 *    但它已经被回传过了（`stopTask` 报的是「作业已被用户停止」）
 *    ⇒ 用 `reportedAt` 兜住，**免得报两遍**。
 */
export function jobsPendingReport(): LocalJob[] {
  return listJobs().filter((j) => j && j.status !== 'reported' && !j.reportedAt);
}

// ===========================================================================
// 巡检器
// ===========================================================================

/** 巡检器（主进程里的定时器）。 */
export class JobReporter {
  private timer: NodeJS.Timeout | null = null;
  private report: JobReportFn | null = null;
  private busy = false;

  /** 装上回传函数并开始巡检（幂等）。 */
  start(report: JobReportFn): void {
    this.report = report;
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, JOB_SWEEP_INTERVAL_MS);
    // ⚠️ unref：巡检**不该**把主进程的事件循环吊住。
    try { this.timer.unref(); } catch (_) { /* 老 Node 没有 unref */ }
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * 巡检一拍：找出跑完的作业 ⇒ 回传 ⇒ 标已上报。
   *
   * @param report 临时换掉回传函数（单测用；不传就用 `start` 装的那个）
   * @returns 这一拍回传了几条
   */
  async tick(report?: JobReportFn): Promise<number> {
    if (this.busy) return 0;
    const reportFn = report || this.report;
    this.busy = true;
    let reported = 0;
    try {
      for (const job of jobsPendingReport()) {
        // ① 巡检这个作业（增量读日志 + 判完成）。
        let polled: ReturnType<typeof pollJob>;
        try {
          polled = pollJob(job);
        } catch (e) {
          console.error('[client-tools/jobs] 巡检作业失败:', job.id, e && (e as Error).message);
          continue;
        }
        if (!polled.done) continue;

        // ② 整读一遍日志 ⇒ 完整的事件 + 汇总（增量读可能已经把 `result` 吃掉了）。
        const events = readAllJobEvents(polled.job);
        const service = getCliService(polled.job.serviceId);
        const payload = buildJobReport(polled.job, events, service);

        // ③ 摘要先落盘（UI 要看「最近进展」）。
        if (payload.stdout) {
          updateJob(polled.job.id, { summary: truncate(payload.stdout, 2000) });
        }

        // ④ 回传（只回一次；失败就留着，下一拍再试）。
        if (!reportFn) continue;
        let ok = false;
        try {
          ok = await reportFn(polled.job.id, payload);
        } catch (e) {
          console.error('[client-tools/jobs] 回传作业结果失败:', polled.job.id, e && (e as Error).message);
          ok = false;
        }
        if (!ok) continue;

        // ⑤ 标「已上报」⇒ 这条派单彻底完事（重连补推也不会再起一个）。
        markJobReported(polled.job.id, payload.stdout || payload.error || undefined);
        markDispatchReported(polled.job.id, payload.error || null);
        reported += 1;
      }
    } finally {
      this.busy = false;
    }
    // 作业状态变了 ⇒ 通知渲染层。
    emitJobsChanged();
    return reported;
  }
}

/** 全局单例（主进程里只有一个巡检器）。 */
export const jobReporter = new JobReporter();
