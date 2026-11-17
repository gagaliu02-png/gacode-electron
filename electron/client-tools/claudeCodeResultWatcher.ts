/**
 * electron/client-tools/claudeCodeResultWatcher.ts —— **等端侧 Claude Code 的处理结果**
 *
 * [2026-11-17 · T-022] `pc_cc_send` 的前台等待侧。
 *
 * ## 它做什么
 *
 *   `pc_cc_send` 往一个**已在跑**的 Claude Code 会话里插了一条消息 ⇒
 *   那个会话处理完会在自己的 transcript 里写出新内容 ⇒
 *   本模块**盯着那份 transcript 的新增部分**，等结果出现。
 *
 * ## ⚠️ 为什么是「前台等」而不是后台作业
 *
 *   PM 拍板：端侧 Claude Code 处理任务**不算后台任务** ⇒
 *   不进 `localJobs` / `jobReporter` / D3 上行那一套 ⇒
 *   结果**直接**作为 `pc_cc_send` 这个工具的返回值回到 gaclaw 那一轮。
 *
 * ## 抓取优先级
 *
 *   1. **固定结果块**（`===GACLAW_RESULT_START/END===`）—— 主路径，最稳；
 *   2. 最后一段 assistant 正文 —— 兜底（会话变 idle 且有新正文时）；
 *   3. 都没有 ⇒ 超时 ⇒ 报「没等到结果」（**不**静默挂死）。
 *
 * ## ⚠️ 只看「基线之后」的新增内容
 *
 *   基线 = 注入消息那一刻的 transcript 字节偏移 ⇒
 *   ⇒ 之前的历史内容**不会**被误当成本次结果。
 */

import * as fs from 'fs';
import { listClaudeSessions, transcriptPath, type ClaudeSessionRecord } from './claudeCodeSession.ts';
import { extractClaudeResult, parseGaclawResultBlock, type ExtractedClaudeResult } from './claudeResultFormat.ts';
import type { CliEvent } from './cliService.ts';

/** 轮询间隔（毫秒）。 */
export const WATCHER_POLL_MS = 1500;
/** 默认等待上限（毫秒）。 */
export const WATCHER_DEFAULT_TIMEOUT_MS = 600_000;
/** 单次读取的尾部上限（字节）—— transcript 可能几十 MB。 */
const MAX_READ_BYTES = 1024 * 1024;

/** watcher 的返回值。 */
export interface WatchResult {
  ok: boolean;
  result?: ExtractedClaudeResult;
  error?: string;
}

/** watcher 的入参。 */
export interface WatchOptions {
  /** 目标会话 id。 */
  sessionId: string;
  /** 基线字节偏移（注入那一刻的 transcript 大小）。 */
  sinceOffset: number;
  /** 等待上限（毫秒）。 */
  timeoutMs?: number;
  /** 轮询间隔（毫秒）。 */
  pollMs?: number;
  /** 取消信号（用户点「停止」⇒ 立刻退出）。 */
  signal?: AbortSignal;
}

/** 取目标会话的登记（找不到 ⇒ null）。 */
function findRecord(sessionId: string): ClaudeSessionRecord | null {
  if (!sessionId) return null;
  return listClaudeSessions().find((s) => s.sessionId === sessionId) || null;
}

/** 从一段 transcript 行里抽 assistant 的正文。 */
function assistantTextOf(raw: string): string {
  let d: any;
  try {
    d = JSON.parse(raw);
  } catch {
    return '';
  }
  if (!d || d.type !== 'assistant') return '';
  const content = d.message && d.message.content;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  const parts = content
    .filter((b: any) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b: any) => b.text)
    .join('\n')
    .trim();
  return parts;
}

/**
 * 读 transcript 的新增部分（从 `sinceOffset` 起），返回新增的 assistant 正文。
 *
 * @returns `{text, newOffset}` —— `text` 是本次新增的所有 assistant 正文（拼起来的）
 */
export function readNewAssistantText(
  sessionId: string,
  sinceOffset: number,
): { text: string; newOffset: number } {
  const rec = findRecord(sessionId);
  if (!rec) return { text: '', newOffset: sinceOffset };
  const file = transcriptPath(rec);
  if (!file) return { text: '', newOffset: sinceOffset };

  let size = 0;
  try {
    size = fs.statSync(file).size;
  } catch {
    return { text: '', newOffset: sinceOffset };
  }
  if (size <= sinceOffset) return { text: '', newOffset: sinceOffset };

  const start = sinceOffset;
  const len = Math.min(size - start, MAX_READ_BYTES);
  let buf = '';
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const chunk = Buffer.alloc(len);
      const read = fs.readSync(fd, chunk, 0, len, start);
      buf = chunk.subarray(0, read).toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return { text: '', newOffset: sinceOffset };
  }

  const lines = buf.split(/\n/).filter((l) => l.trim().length > 0);
  const texts: string[] = [];
  for (const l of lines) {
    const t = assistantTextOf(l);
    if (t) texts.push(t);
  }
  return { text: texts.join('\n'), newOffset: start + len };
}

/**
 * 等目标会话产出结果。
 *
 * ⚠️ **不抛错** —— 失败以 `{ok:false, error}` 返回（调用方决定怎么报）。
 */
export function watchClaudeSessionResult(opts: WatchOptions): Promise<WatchResult> {
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : WATCHER_DEFAULT_TIMEOUT_MS;
  const pollMs = Number(opts.pollMs) > 0 ? Number(opts.pollMs) : WATCHER_POLL_MS;

  return new Promise<WatchResult>((resolve) => {
    let offset = Math.max(0, Number(opts.sinceOffset) || 0);
    let seen = '';            // 累积看到的新增正文（跨轮次）
    let settled = false;
    const startedAt = Date.now();

    const finish = (r: WatchResult) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      try { opts.signal?.removeEventListener('abort', onAbort); } catch (_) { /* ignore */ }
      resolve(r);
    };

    const onAbort = () => finish({ ok: false, error: 'aborted' });

    const timer = setInterval(() => {
      // ① 取消
      if (opts.signal?.aborted) { finish({ ok: false, error: 'aborted' }); return; }
      // ② 超时
      if (Date.now() - startedAt > timeoutMs) {
        finish({ ok: false, error: `等待端侧 Claude Code 结果超时（${Math.round(timeoutMs / 1000)}s）` });
        return;
      }
      // ③ 读新增内容
      const { text, newOffset } = readNewAssistantText(opts.sessionId, offset);
      offset = newOffset;
      if (text) seen = seen ? `${seen}\n${text}` : text;

      // ④ 主路径：固定结果块
      if (seen) {
        const hit = parseGaclawResultBlock(seen);
        if (hit) { finish({ ok: true, result: hit }); return; }
      }

      // ⑤ 兜底：会话变 idle（不忙了）且有新正文 ⇒ 那段正文就是结果
      const rec = findRecord(opts.sessionId);
      if (rec && rec.status === 'idle' && seen.trim()) {
        const ev: CliEvent[] = [{ type: 'text', text: seen, raw: { eventType: 'assistant' } }];
        const extracted = extractClaudeResult(ev);
        if (extracted.found) { finish({ ok: true, result: extracted }); return; }
      }
    }, pollMs);

    // ⚠️ unref：这个定时器**绝不能**吊住主进程的事件循环
    //   （用户关掉 Gacode ⇒ 进程要能干净退出）。
    try { (timer as any).unref?.(); } catch (_) { /* 老 Node 没有 unref */ }

    if (opts.signal) {
      try { opts.signal.addEventListener('abort', onAbort); } catch (_) { /* ignore */ }
    }
  });
}
