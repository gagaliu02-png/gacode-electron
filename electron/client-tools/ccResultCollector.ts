/**
 * electron/client-tools/ccResultCollector.ts —— 「端侧兜底」采集器（T-154-cc）
 *
 * ## 它补的是哪个洞（2026-11-25 事故）
 *
 * gaclaw 业务会话 1192 用 `pc_cc_new` 开了个常驻 Claude Code 会话 `b0f8568c…`，
 * 那条会话**确实查完了**，20:17:14 在自己的 transcript 里输出了完整的结果块
 * （`===GACLAW_RESULT_START===`，`task_id=307b819a`）——
 * **但这个结果从没送到服务端**：307b819a 在 gaclaw `out.log` / `audit/*.jsonl` /
 * unified-api 日志里 **0 命中**，1192 的消息流停在 20:14:49。
 *
 * 断链有三条（详见 TASK_BOARD.md `T-154-cc`）：
 *
 *   1. `pc_cc_control(notify_when_idle)` 注册的是 **diagnostic** 订阅 ——
 *      `claudeCodePeerInbox.ts` 的 diagnostic 分支只打一行日志就 `return`，
 *      **永远不会去 transcript 取结果回传**。
 *   2. 注入契约里承诺的「输出标准结果块，**由端侧兜底**」**根本没有实现** ——
 *      `findResultBlockByTaskId` 全仓只有一个调用点（`deviceClient.ts` 的
 *      `peerJobManager`），而 peerJobManager **只有 `pc_cc_send` 才会 track/bind**。
 *   3. `pc_cc_append` 按设计就是 fire-and-forget（不订阅回报、不回传）。
 *
 * ⇒ 本模块就是那条**缺失的兜底采集器**。
 *
 * ## 语义：inbox 回投（不是 D3）
 *
 * 采集到结果后，**投回业务会话的收件箱**（`POST /api/v1/devices/cc/messages`），
 * 由服务端**另起一轮**把结论送进同一个会话 —— 与 `pc_cc_send` 的用户可见效果一致
 * （「结果会在新的一轮里读到」），但**不占用服务端 pending**：
 *
 * - `pc_cc_send` 的 pending 由服务端持有，结果走 D3（`reportJobResult`）；
 * - `notify_when_idle` / `pc_cc_new` 是**同步**工具 ⇒ 服务端 pending 在工具返回时
 *   就已结清（端侧会收到「结果已结过（409）」）⇒ **不能再走 D3**。
 *
 * ⇒ 本模块走 inbox（`kind=agent_message` / `fromKind=agent`）⇒
 *   **不冒用户气泡、不授权、只是协作消息**（服务端固定写这层身份，客户端不可伪造）。
 *
 * ⚠️ 任务号（`taskId`）若命中服务端**未结**的 dispatch/work unit，
 *    服务端会把它判成 `work_unit_result`（`fromKind=work_unit`）—— 那更好，
 *    本模块照常投即可，不必区分。
 *
 * ## 为什么必须**轮询**而不是只等 notice
 *
 * 实测（2026-11-25）：端侧 peer inbox 在**整个 12 天**的 `client-tools.log` 里
 * **0 条 `[cc-peer-inbox]` 日志** ⇒ CLI 的 `peer_idle_notice` 压根没来过
 * （inbox 自己是正常发布的：key 文件在、管道在）。
 * ⇒ 只靠 notice 触发 ⇒ 结果永远采不到 ⇒ **必须自己轮询 transcript**。
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readAssistantTextInFile, findResultBlockInFile } from './claudeCodeResultWatcher.ts';
import { parseGaclawResultBlock } from './claudeResultFormat.ts';
import { findSession } from './claudeCodePeer.ts';
import { transcriptPath } from './claudeCodeSession.ts';
import { peerLog } from './peerLog.ts';

/**
 * 找这个会话的 transcript 文件。
 *
 * ⚠️ **会话可能已经没了**（被关掉 / 被空闲巡检回收）⇒ `~/.claude/sessions/<pid>.json`
 *   随进程退出一起消失 ⇒ 按登记项算路径的路走不通。
 * ⇒ 兜底：全盘扫 `~/.claude/projects/<任意目录名>/<sessionId>.jsonl`
 *   ⇒ **会话死了也捞得到结论**（这正是 T-154-cc 事故里最关键的一步）。
 */
export function resolveTranscript(sessionId: string): string | null {
  if (!sessionId) return null;
  try {
    const rec = findSession(sessionId);
    if (rec) {
      const p = transcriptPath(rec);
      if (p) return p;
    }
  } catch { /* 登记项读不到 ⇒ 走兜底 */ }
  try {
    const dir = path.join(os.homedir(), '.claude', 'projects');
    for (const d of fs.readdirSync(dir)) {
      const p = path.join(dir, d, `${sessionId}.jsonl`);
      if (fs.existsSync(p)) return p;
    }
  } catch { /* 扫不到 ⇒ 没有 transcript */ }
  return null;
}

/** 轮询间隔（毫秒）。 */
export const COLLECTOR_POLL_MS = Number(process.env.CC_COLLECTOR_POLL_MS ?? 10_000);

/** 单条采集的最长等待（毫秒）—— 超时也要回一条「没拿到结果」，不许让对端干等。 */
export const COLLECTOR_DEFAULT_TIMEOUT_MS = Number(
  process.env.CC_COLLECTOR_TIMEOUT_MS ?? 2 * 60 * 60 * 1000,
);

/** 服务端收件箱单条上限（unified-api `inbox.MAX_CONTENT`）。 */
const MAX_CONTENT = 20000;

/** 一条待采集的登记。 */
export interface CollectorJob {
  /** 登记 key。 */
  key: string;
  /** 目标 Claude Code 会话 id。 */
  sessionId: string;
  /** 结果块里必须带的 task_id。 */
  taskId: string;
  /** transcript 基线字节偏移。 */
  sinceOffset: number;
  /** 回投到哪个 gaclaw 业务会话。 */
  businessSessionId: string;
  /** 供服务端 fromId 用的 CC 会话 id（可空）。 */
  ccSessionId: string | null;
  /** 起始时刻。 */
  startedAt: number;
  /** 截止时刻。 */
  deadlineAt: number;
  /** 已经投递过？ */
  settled: boolean;
  /** 最近一次增量读到的正文（兜底用）。 */
  lastText: string;
}

/** 一次回投的内容。 */
export interface CollectorDelivery {
  /** 目标业务会话 id。 */
  businessSessionId: string;
  /** 正文。 */
  content: string;
  /** 任务号（服务端据此判 work_unit_result / agent_message）。 */
  taskId: string;
  /** 幂等键（服务端按 session 隔离）。 */
  idempotencyKey: string;
  /** 来源 CC 会话 id。 */
  ccSessionId: string | null;
}

/** 回投函数（由主进程注入 —— 端侧要拿设备 token 才能调服务端）。 */
export type CollectorDeliverer = (d: CollectorDelivery) => Promise<boolean>;

/** 登记入参。 */
export interface CollectorOptions {
  /** 目标 Claude Code 会话 id。 */
  sessionId: string;
  /** 结果块里必须带的 task_id。 */
  taskId: string;
  /** transcript 基线（不传 = 0 ⇒ 从头扫）。 */
  sinceOffset?: number;
  /** 回投到哪个 gaclaw 业务会话（必填 —— 没有它就无处可投）。 */
  businessSessionId: string;
  /** 供 fromId 用的 CC 会话 id。 */
  ccSessionId?: string | null;
  /** 最长等待（毫秒）。 */
  timeoutMs?: number;
}

/** 采集器（单例）。 */
class CcResultCollector {
  private jobs = new Map<string, CollectorJob>();
  private deliver: CollectorDeliverer | null = null;
  private timer: NodeJS.Timeout | null = null;

  /** 注入回投函数（主进程启动时接线）。 */
  start(deliver: CollectorDeliverer): void {
    this.deliver = deliver;
    this.ensureTimer();
  }

  /**
   * 立刻跑一轮采集。
   *
   * ⚠️ 正常运行时由定时器驱动；这个口子给**测试**用（单测里等 10s 不现实），
   *    顺带也能当「立刻催一次」的手动闸门用。
   */
  async tickNow(): Promise<void> {
    await this.tick();
  }

  /** 当前登记条数（诊断用）。 */
  get size(): number {
    return this.jobs.size;
  }

  /**
   * 登记一条采集。
   *
   * @returns 登记 key（取消时用）。
   */
  register(opts: CollectorOptions): string {
    if (!opts || !opts.sessionId || !opts.taskId || !opts.businessSessionId) {
      throw new Error('采集登记缺 sessionId / taskId / businessSessionId');
    }
    const now = Date.now();
    const key = `cc-collect:${opts.sessionId}:${opts.taskId}`;
    const job: CollectorJob = {
      key,
      sessionId: opts.sessionId,
      taskId: opts.taskId,
      sinceOffset: Number(opts.sinceOffset) || 0,
      businessSessionId: opts.businessSessionId,
      ccSessionId: opts.ccSessionId ?? opts.sessionId,
      startedAt: now,
      deadlineAt: now + (Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : COLLECTOR_DEFAULT_TIMEOUT_MS),
      settled: false,
      lastText: '',
    };
    this.jobs.set(key, job);
    this.ensureTimer();
    peerLog('cc-collect', '登记采集 ' + JSON.stringify({
      key, session_id: job.sessionId, task_id: job.taskId,
      business_session_id: job.businessSessionId, since_offset: job.sinceOffset,
    }));
    return key;
  }

  /** 取消一条采集（用户停止 / 会话被显式关闭）。 */
  cancel(key: string): boolean {
    if (!key) return false;
    const had = this.jobs.delete(key);
    if (had) peerLog('cc-collect', '取消采集 ' + key);
    return had;
  }

  /**
   * 这个 Claude Code 会话**还有没有没回传的结果**。
   *
   * ⚠️ 空闲巡检（`claudeBgSession.sweepIdleBackgroundSessions`）靠它决定
   *    「能不能回收这个常驻会话」—— **还有未回传的结果 ⇒ 不许停**
   *    （否则结论随会话一起被封，见 T-154-cc 事故）。
   */
  hasPendingForSession(sessionId: string): boolean {
    if (!sessionId) return false;
    for (const job of this.jobs.values()) {
      if (job.sessionId === sessionId && !job.settled) return true;
    }
    return false;
  }

  /** 当前所有未回传的采集 key（诊断用）。 */
  pendingKeys(): string[] {
    return [...this.jobs.keys()];
  }

  private ensureTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.tick(); }, COLLECTOR_POLL_MS);
    // ⛔ 绝不吊住主进程（用户关掉 Gacode ⇒ 进程要能干净退出）。
    try { (this.timer as any).unref?.(); } catch { /* ignore */ }
  }

  /** 一轮：扫所有登记，找结果块 ⇒ 回投。 */
  private async tick(): Promise<void> {
    if (this.jobs.size === 0) return;
    for (const job of [...this.jobs.values()]) {
      if (job.settled) continue;
      try {
        await this.tickOne(job);
      } catch (e) {
        peerLog('cc-collect', '采集异常 ' + job.key + ': ' + (e as Error).message);
      }
    }
  }

  private async tickOne(job: CollectorJob): Promise<void> {
    const now = Date.now();

    // ① 结果块（主路径）：按 task_id 在 transcript 里精确反查。
    //    ⚠️ 用「按文件」的版本 ⇒ 会话已经没了也照样能捞到（见 resolveTranscript）。
    const file = resolveTranscript(job.sessionId);
    const hit = file ? findResultBlockInFile(file, job.taskId) : null;
    if (hit) {
      await this.settleWithResult(job, hit);
      return;
    }

    // ② 增量读（顺带记住正文，供「没出结果块」时兜底）。
    if (file) {
      const { text, newOffset } = readAssistantTextInFile(file, job.sinceOffset);
      if (newOffset > job.sinceOffset) job.sinceOffset = newOffset;
      if (text) {
        job.lastText = job.lastText ? `${job.lastText}\n${text}` : text;
        const parsed = parseGaclawResultBlock(text);
        if (parsed && parsed.task_id === job.taskId) {
          await this.settleWithResult(job, parsed);
          return;
        }
      }
    }

    // ③ 会话没了（被外部关掉 / 被回收）⇒ 立刻收场，别让对端干等到超时。
    //    ⚠️ 但**先确认 transcript 里确实没有结果块**（见 ①）⇒
    //    「结论就在 transcript 里」的情况不会被误判成「没结果」。
    if (!findSession(job.sessionId)) {
      await this.settleWithNotice(job, '会话已不在本机运行中（被关闭或被回收）');
      return;
    }

    // ④ 超时 ⇒ 也要回一条「没拿到结果块」，并给出 transcript 路径。
    if (now >= job.deadlineAt) {
      await this.settleWithNotice(job, `等待 ${Math.round((now - job.startedAt) / 1000)}s 仍未出现 task_id 匹配的结果块`);
    }
  }

  private async settleWithResult(job: CollectorJob, hit: { status?: string; summary?: string; result?: string }): Promise<void> {
    job.settled = true;
    const head = `【端侧 Claude Code 结果 · task_id=${job.taskId} · 会话 ${job.sessionId}】`;
    const body = [
      hit.status ? `status: ${hit.status}` : 'status: completed',
      hit.summary ? `summary: ${hit.summary}` : '',
      'result:',
      hit.result || job.lastText || '(结果块正文为空)',
    ].filter(Boolean).join('\n');
    const ok = await this.push(job, `${head}\n${body}`);
    peerLog('cc-collect', '结果已回投 ' + JSON.stringify({ key: job.key, ok }));
    this.jobs.delete(job.key);
  }

  private async settleWithNotice(job: CollectorJob, reason: string): Promise<void> {
    job.settled = true;
    const rec = findSession(job.sessionId);
    const file = resolveTranscript(job.sessionId);
    const pathHint = file
      ? `结论可能还在 transcript 里：${file}`
      : (rec ? `会话仍在（status=${rec.status || 'unknown'}）` : '会话已不在本机运行中，且没找到 transcript');
    const content = [
      `【端侧 Claude Code 未回结果 · task_id=${job.taskId} · 会话 ${job.sessionId}】`,
      `原因：${reason}。${pathHint}。`,
      '如需重试，请重新派单；如结论已在 transcript 里，可直接读取。',
    ].join('\n');
    const ok = await this.push(job, content);
    peerLog('cc-collect', '未回结果已通知 ' + JSON.stringify({ key: job.key, reason, ok }));
    this.jobs.delete(job.key);
  }

  /** 回投（截断到服务端上限；幂等键固定 ⇒ 重投不会重复投递）。 */
  private async push(job: CollectorJob, content: string): Promise<boolean> {
    if (!this.deliver) {
      peerLog('cc-collect', '未接线（deliver 为空）⇒ 丢弃 ' + job.key);
      return false;
    }
    const text = content.length > MAX_CONTENT ? `${content.slice(0, MAX_CONTENT - 20)}\n…(已截断)` : content;
    try {
      return await this.deliver({
        businessSessionId: job.businessSessionId,
        content: text,
        taskId: job.taskId,
        idempotencyKey: `cc-collect:${job.taskId}`,
        ccSessionId: job.ccSessionId,
      });
    } catch (e) {
      peerLog('cc-collect', '回投异常 ' + job.key + ': ' + (e as Error).message);
      return false;
    }
  }
}

/** 单例（主进程共享）。 */
export const ccResultCollector = new CcResultCollector();

/** 造一个登记 key（测试 / 外部复用）。 */
export function newCollectorKey(): string {
  return randomUUID();
}
