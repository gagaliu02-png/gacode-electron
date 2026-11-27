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
import { extractClaudeResult, parseGaclawResultBlocks, type ExtractedClaudeResult } from './claudeResultFormat.ts';
import type { CliEvent } from './cliService.ts';
// ★ [T-149-cc] 「被空闲巡检自动关掉」的墓碑 —— 用来给出准确归因。
import { findAutoClosed } from './ccAutoClosed.ts';

/** 轮询间隔（毫秒）。 */
export const WATCHER_POLL_MS = 1500;
/** 默认等待上限（毫秒）。 */
export const WATCHER_DEFAULT_TIMEOUT_MS = 600_000;
/** 单次读取的尾部上限（字节）—— transcript 可能几十 MB。 */
const MAX_READ_BYTES = 1024 * 1024;
/** settle 前按 task_id 反查结果块的尾部上限（字节）。 */
const TAIL_SCAN_BYTES = 2 * 1024 * 1024;

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
  /** ★ [T-174-ccreport] 只认这个 task_id 的结果块（不传 ⇒ 兼容老行为：认第一个块）。 */
  taskId?: string;
}

/** 取目标会话的登记（找不到 ⇒ null）。 */
function findRecord(sessionId: string): ClaudeSessionRecord | null {
  if (!sessionId) return null;
  return listClaudeSessions().find((s) => s.sessionId === sessionId) || null;
}

/** 从一条 transcript 行里抽 assistant 的正文 + 身份。 */
function assistantEntryOf(raw: string): { text: string; id: string } | null {
  let d: any;
  try {
    d = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!d || d.type !== 'assistant') return null;
  const content = d.message && d.message.content;
  let text = '';
  if (typeof content === 'string') text = content.trim();
  else if (Array.isArray(content)) {
    text = content
      .filter((b: any) => b && b.type === 'text' && typeof b.text === 'string')
      .map((b: any) => b.text)
      .join('\n')
      .trim();
  }
  if (!text) return null;
  // Claude transcript 里同一轮流式增量可能拆成多条 assistant 行：
  //   uuid 相同 ⇒ 同一条消息；requestRef/requestId 相同 ⇒ 同一轮请求。
  //   [T-141] 按这些身份合并，避免裸字节窗口把一条完整结果块切成两半。
  const id = String(d.uuid || d.id || d.requestRef || d.requestId || d.parentUuid || text.slice(0, 80));
  return { text, id };
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
  return readAssistantTextInFile(file, sinceOffset);
}

/**
 * ★ [T-154-cc] **按文件**读新增正文（不依赖会话登记项）。
 *
 * ## 为什么要有这个「按文件」的版本
 *
 * 会话被关掉 / 被空闲巡检回收之后，`~/.claude/sessions/<pid>.json` 就没了
 * ⇒ `findRecord()` 返回 null ⇒ 按 sessionId 读的路径全部读不到
 * ⇒ **结果块明明还在 transcript 里，却再也采不到了**。
 *
 * ⇒ 采集器（`ccResultCollector`）改成：先按登记项找路径，找不到就**全盘扫**
 *   `~/.claude/projects/<任意目录名>/<sessionId>.jsonl` ⇒ 会话死了也捞得到结论。
 */
export function readAssistantTextInFile(
  file: string,
  sinceOffset: number,
): { text: string; newOffset: number } {
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
  // [T-141] 按消息身份合并：同一条 assistant 的多次流式落盘只出一段完整文本，
  //   不再按裸字节窗口逐行拼接（会把一条结果块切碎或让解析器只看到半个块）。
  const byId = new Map<string, string[]>();
  const order: string[] = [];
  for (const l of lines) {
    const e = assistantEntryOf(l);
    if (!e) continue;
    if (!byId.has(e.id)) { byId.set(e.id, []); order.push(e.id); }
    byId.get(e.id)!.push(e.text);
  }
  const texts = order.map((id) => byId.get(id)!.join('\n').trim()).filter(Boolean);
  return { text: texts.join('\n'), newOffset: start + len };
}

/**
 * ★ [T-141] settle 前的兜底：只读 tail，按 task_id 精确反查完整结果块。
 *   - 不受 sinceOffset 影响（解决增量窗口漏读）；
 *   - 只读最后 TAIL_SCAN_BYTES，避免大 transcript 全量加载；
 *   - 只认结果块，不做正文兜底（避免把普通回答误当结果）。
 */
export function findResultBlockByTaskId(
  sessionId: string,
  taskId: string,
): ExtractedClaudeResult | null {
  if (!sessionId || !taskId) return null;
  const rec = findRecord(sessionId);
  if (!rec) return null;
  const file = transcriptPath(rec);
  if (!file) return null;
  return findResultBlockInFile(file, taskId);
}

/**
 * ★ [T-154-cc] **按文件**按 task_id 精确反查完整结果块（不依赖会话登记项）。
 *
 * ## 为什么要有这个「按文件」的版本
 *
 * 会话被关掉 / 被空闲巡检回收之后，`~/.claude/sessions/<pid>.json` 就没了
 * ⇒ 按 sessionId 定位 transcript 的老路走不通 ⇒ **结果块明明还在文件里，
 *   却再也采不到了**（这正是 T-154-cc 事故里「结论唯一副本差点没了」的那一步）。
 *
 * ⇒ 采集器先按登记项找路径，找不到就**全盘扫** `~/.claude/projects/<任意目录名>/<sessionId>.jsonl`
 *   ⇒ 会话死了也捞得到结论。
 */
export function findResultBlockInFile(
  file: string,
  taskId: string,
): ExtractedClaudeResult | null {
  if (!file || !taskId) return null;
  let size = 0;
  try { size = fs.statSync(file).size; } catch { return null; }
  const start = Math.max(0, size - TAIL_SCAN_BYTES);
  let buf = '';
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const len = size - start;
      const chunk = Buffer.alloc(len);
      const read = fs.readSync(fd, chunk, 0, len, start);
      buf = chunk.subarray(0, read).toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch { return null; }

  const byId = new Map<string, string[]>();
  const order: string[] = [];
  for (const line of buf.split(/\n/)) {
    const e = assistantEntryOf(line);
    if (!e) continue;
    if (!byId.has(e.id)) { byId.set(e.id, []); order.push(e.id); }
    byId.get(e.id)!.push(e.text);
  }
  // 从后往前找（最近的结果优先）
  for (const id of order.reverse()) {
    const text = byId.get(id)!.join('\n');
    // ★ [T-174-ccreport] 一条消息可能含**多个 task_id 的结果块**（生产实证）
    //   ⇒ 按 task_id 精确挑，不能只看该消息里的第一个块。
    const hit = parseGaclawResultBlocks(text).find((b) => b.task_id === taskId);
    if (hit) return hit;
  }
  return null;
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
    // ★ [T-149-cc] 见过它的登记项吗？—— 「见过→没了」= 会话被外部关掉了。
    let sawRecord = false;
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
        // ★ [T-174-ccreport] 同一次补全里可能有多块（含补投的其它任务）⇒ 按 task_id 精确挑。
        // ⚠️ 指定了 taskId 就**只认它**：挑不到必须继续等，绝不能退回「第一个块」
        //   （那等于把别的任务的结论当成本次结果）。
        const blocks = parseGaclawResultBlocks(seen);
        const hit = opts.taskId
          ? blocks.find((b) => b.task_id === opts.taskId)
          : blocks[0];
        if (hit) { finish({ ok: true, result: hit }); return; }
      }

      // ⑤ 兜底：会话变 idle（不忙了）且有新正文 ⇒ 那段正文就是结果
      const rec = findRecord(opts.sessionId);
      if (rec) {
        sawRecord = true;
        if (rec.status === 'idle' && seen.trim()) {
          const ev: CliEvent[] = [{ type: 'text', text: seen, raw: { eventType: 'assistant' } }];
          const extracted = extractClaudeResult(ev);
          if (extracted.found) { finish({ ok: true, result: extracted }); return; }
        }
      } else {
        // ★ [T-149-cc] **会话消失了** —— 原先没有这一支 ⇒ 只能干等到 600s 超时，
        //   报的还是「等待结果超时」⇒ 归因完全丢失（用户看到的是「agent 凭空消失」）。
        //   ⇒ 现在立刻收场，并查**墓碑**给出准确原因：
        //     · 有墓碑 ⇒ 是被空闲巡检回收的（2026-11-25 那次事故就是这个）
        //     · 无墓碑 ⇒ 被显式关闭（pc_cc_close）或异常退出
        const tomb = findAutoClosed(opts.sessionId);
        if (tomb) {
          finish({ ok: false, error: 'Claude Code 会话因空闲被自动关闭（任务未完成）' });
          return;
        }
        if (sawRecord) {
          finish({ ok: false, error: 'Claude Code 会话已消失（被显式关闭或异常退出）' });
          return;
        }
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
