/**
 * electron/client-tools/claudeResultFormat.ts —— **Claude Code 结果的「汇报协议」**
 *
 * [2026-11-17 · T-022] 端侧 Claude Code 处理结果的抓取与规范化。
 *
 * ## 为什么需要这个文件
 *
 * ### ① 真机事故（2026-11-17）
 *
 *   跑了一次 `pc_claude`（浏览器升级任务）⇒ 回传给模型的正文是空的。
 *   查 PC job log 才发现：
 *     · 最终 `result` 事件：`subtype=success / is_error=false / stop_reason=stop`，
 *       但 **`result.result` 长度 = 0**；
 *     · 同一份日志里**最后一段 assistant text 长度 = 13538**，内容完整。
 *
 *   ⇒ 老逻辑只认 `result.result` ⇒ 空 ⇒ 只回一句
 *     「(Claude Code 结束，但没有正文 —— subtype=success)」⇒ **正文丢了**。
 *
 * ### ② 结论：不要靠「猜 LLM 最后说了什么」
 *
 *   ⇒ 办法 = **把汇报格式写进任务里**（工具层约定）：
 *     派任务时自动要求它在最终回复末尾输出一个**固定块**：
 *
 *     ```text
 *     ===GACLAW_RESULT_START===
 *     status: completed|partial|failed
 *     task_id: <可选的裁决身份>
 *     summary: 一句话结论
 *     result: |
 *       最终结果正文，可多行
 *     ===GACLAW_RESULT_END===
 *     ```
 *
 *   ⇒ 抓取就变成「找两个标记之间的内容」⇒ **稳**。
 *   ⇒ 固定块抓不到时**再**退回老路径（result 事件 → 最后一段 assistant → 最后 N 段拼接）。
 *
 * ## 纯函数（无 electron 依赖）⇒ 单测可直接跑
 */

import type { CliEvent } from './cliService.ts';

/** 结果块起始标记。 */
export const RESULT_BLOCK_START = '===GACLAW_RESULT_START===';
/** 结果块结束标记。 */
export const RESULT_BLOCK_END = '===GACLAW_RESULT_END===';

/** 抓取来源（诊断用 ⇒ 回传里会带上）。 */
export type ResultParseMode =
  | 'structured_block'      // 命中固定块（主路径）
  | 'result_event'          // 用了 result 事件的正文
  | 'assistant_fallback'    // 兜底：最后一段 assistant 正文
  | 'empty';                // 真的什么都没有

/** 提取出来的结果。 */
export interface ExtractedClaudeResult {
  /** 抓到了吗？ */
  found: boolean;
  /** 结果块里的 task_id（老格式没有 ⇒ 空串）。 */
  task_id: string;
  /** 结果块里的 status（没有则空串）。 */
  status: 'completed' | 'partial' | 'failed' | '';
  /** 结果块里的 summary（没有则空串）。 */
  summary: string;
  /** 结果正文。 */
  result: string;
  /** 抓取方式。 */
  parse_mode: ResultParseMode;
}

/** 主动回信地址（服务端透传到 `pc_cc_send` args 的 reply-to）。 */
export interface PeerReplyTo {
  /** 业务会话 id（回信落回哪个 gaclaw 会话）。 */
  business_session_id?: string;
  /** Claude Code 会话 id（回信发给哪台端侧的哪个会话）。 */
  cc_session_id?: string;
  /** 回信通道标识（服务端口径；未给出时用默认）。 */
  channel?: string;
}

/**
 * 把 reply-to 拍平成**单行**属性文本（供 `<cross-session-message>` 用）。
 * 未给字段 ⇒ 返回 null（不写空属性）。
 */
export function formatReplyToAttr(replyTo: PeerReplyTo | null | undefined): string | null {
  if (!replyTo) return null;
  const business = typeof replyTo.business_session_id === 'string' ? replyTo.business_session_id.trim() : '';
  const cc = typeof replyTo.cc_session_id === 'string' ? replyTo.cc_session_id.trim() : '';
  const channel = typeof replyTo.channel === 'string' ? replyTo.channel.trim() : '';
  if (!business && !cc && !channel) return null;
  // 只取安全字符（id / channel 都是 ASCII 标识符）；避免注入闭合标签或换行。
  const safe = (v: string) => v.replace(/[^\w.:\-]/g, '');
  const parts = [
    business ? `reply_to_business_session_id="${safe(business)}"` : null,
    cc ? `reply_to_cc_session_id="${safe(cc)}"` : null,
    channel ? `reply_channel="${safe(channel)}"` : null,
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(' ') : null;
}

/**
 * [T-092] notify 专用注入正文：显式携带 notify_intent + reply_to + task_id。
 *
 * 老格式（`buildPeerMessageContent(text, taskId, replyTo)`）保持不变；
 * 本函数在 notify_when_idle 分支单独使用，属性顺序固定为：
 *   task_id → notify_intent → reply_to_business_session_id → reply_to_cc_session_id → reply_channel。
 */
export interface PeerNotifyIntent {
  /** 目前仅支持 report_when_idle；未知值一律不写属性，避免伪造契约。 */
  value: string;
}

export function buildNotifyPeerMessageContent(
  text: string,
  taskId: string,
  replyTo: PeerReplyTo | null | undefined,
  notifyIntent: PeerNotifyIntent | null | undefined,
): string {
  const attrs = [
    `task_id="${String(taskId).replace(/[^\w.:\-]/g, '')}"`,
    notifyIntent?.value === 'report_when_idle' ? 'notify_intent="report_when_idle"' : null,
    formatReplyToAttr(replyTo),
  ].filter(Boolean).join(' ');
  return (
    `<cross-session-message from="uds:gaclaw" ${attrs}>\n` +
    `${String(text ?? '').slice(0, 4000)}\n` +
    `${buildReportingContract(taskId, replyTo, notifyIntent?.value === 'report_when_idle' ? 'report_when_idle' : null)}\n` +
    `</cross-session-message>`
  );
}

/** 汇报协议模板（工具层自动追加到任务末尾）。 */
export function buildReportingContract(taskId?: string | null, replyTo?: PeerReplyTo | null, notifyIntent?: 'report_when_idle' | null): string {
  const taskIdLine = taskId ? `task_id: ${String(taskId)}` : null;
  const replyToAttr = formatReplyToAttr(replyTo);
  return [
    '',
    '',
    '---',
    '请在你最终回复的**末尾**严格输出下面这个结果块（系统靠它回传给 gaclaw）：',
    '',
    RESULT_BLOCK_START,
    'status: completed|partial|failed',
    ...(taskIdLine ? [taskIdLine] : []),
    'summary: 一句话结论（不超过 100 字）',
    'result: |',
    '  最终结果正文，可多行。写清楚做了什么、结论是什么、用户还需要做什么。',
    RESULT_BLOCK_END,
    '',
    '⚠️ 上面几行 `status:`' + (taskIdLine ? ' / `task_id:`' : '') + ' / `summary:` / `result:` 的缩进与冒号请照抄；',
    '⚠️ 不要在结果块之外再重复一遍结论。',
    // [T-086] reply-to 指引：明确告知有回信地址时**使用 reply_to**，不许猜 session_id。
    ...(replyToAttr ? [
      '',
      `📮 本任务自带回信地址（见上方 <cross-session-message> 的 ${replyToAttr}）。`,
      '   如需主动回信，**使用 reply_to 提供的 session_id / channel**，不要猜 session_id，也不要自己找所谓的发送入口。',
      '   若不需要主动回信，忽略本条即可；最终结果仍按上面的结果块输出。',
    ] : []),
    ...(notifyIntent === 'report_when_idle' && replyToAttr ? [
      '',
      '📢 这是一条 notify_intent="report_when_idle" 契约：',
      '   完成当前工作后，**必须**使用 `gaclaw-msg send` 按上面的 reply_to 主动回报结论。',
      '   ⛔ 不要猜 session_id（reply_to 已给全）；notify 本身不代表已回报。',
    ] : []),
  ].join('\n');
}

/** 从一段文本里找固定结果块。找不到返回 null。 */
export function parseGaclawResultBlock(text: string): ExtractedClaudeResult | null {
  const s = String(text == null ? '' : text);
  if (!s.includes(RESULT_BLOCK_START)) return null;
  const start = s.indexOf(RESULT_BLOCK_START);
  const end = s.indexOf(RESULT_BLOCK_END, start + RESULT_BLOCK_START.length);
  if (end < 0) return null;                       // 未闭合 ⇒ 当没有

  const body = s.slice(start + RESULT_BLOCK_START.length, end);
  const lines = body.split(/\r?\n/);

  let status = '';
  let taskId = '';
  let summary = '';
  const resultLines: string[] = [];
  let inResult = false;

  for (const line of lines) {
    if (!inResult) {
      const t = line.trim();
      if (/^status\s*[:：]/i.test(t)) {
        status = t.replace(/^status\s*[:：]\s*/i, '').trim().toLowerCase();
        if (status === 'ok' || status === 'success' || status === 'done') status = 'completed';
        if (status === 'partial_success' || status === 'partial') status = 'partial';
        if (status === 'error' || status === 'failure' || status === 'fail') status = 'failed';
        continue;
      }
      if (/^task_id\s*[:：]/i.test(t)) {
        taskId = t.replace(/^task_id\s*[:：]\s*/i, '').trim();
        continue;
      }
      if (/^summary\s*[:：]/i.test(t)) {
        summary = t.replace(/^summary\s*[:：]\s*/i, '').trim();
        continue;
      }
      if (/^result\s*[:：]\s*\|?\s*$/i.test(t) || /^result\s*[:：]\s*\|/.test(t)) {
        inResult = true;
        // `result: |` 后面的缩进块要**去掉一层缩进**
        const inline = t.replace(/^result\s*[:：]\s*\|?\s*/i, '');
        if (inline) resultLines.push(inline);
        continue;
      }
      // 块里开头、还没进 result 的其它行 ⇒ 忽略
      continue;
    }
    // result 块内：去掉一层公共缩进
    resultLines.push(line.replace(/^\s{0,4}/, ''));
  }

  const result = resultLines.join('\n').trim();
  if (!result && !summary) return null;          // 空块 ⇒ 当没有

  return {
    found: true,
    task_id: taskId,
    status: status === 'partial' || status === 'failed' ? status : 'completed',
    summary,
    result: result || summary,
    parse_mode: 'structured_block',
  };
}

/** 事件里所有「带正文的文本」（assistant 优先，user 里的工具结果也要）。 */
function textOf(e: CliEvent): string {
  if (!e) return '';
  if (e.type === 'result') return String(e.text || '');
  if (e.type === 'text') return String(e.text || '');
  return '';
}

/** 这条 text 事件是不是 assistant 说的（user 事件在 Claude Code 里也用于工具结果）。 */
function isAssistantText(e: CliEvent): boolean {
  if (!e || e.type !== 'text') return false;
  const raw = e.raw as any;
  return !!(raw && raw.eventType === 'assistant');
}

/**
 * 从一批 Claude 事件里提取最终结果。
 *
 * 优先级：
 *   1. 固定结果块（主路径）
 *   2. `result` 事件正文
 *   3. 最后一段 assistant 正文（兜底）
 *   4. 最后 N 段 assistant 正文拼接（兜底）
 */
export function extractClaudeResult(
  events: CliEvent[],
  maxChars = 8000,
): ExtractedClaudeResult {
  const list = Array.isArray(events) ? events : [];

  // ① 固定块：所有 assistant 文本 + result 文本里找一遍（从后往前，先命中的算最新）
  const candidates: string[] = [];
  for (const e of list) {
    if (isAssistantText(e)) candidates.push(textOf(e));
  }
  const resultEvent = list.find((e) => e && e.type === 'result');
  if (resultEvent) candidates.push(textOf(resultEvent));
  for (let i = candidates.length - 1; i >= 0; i--) {
    const hit = parseGaclawResultBlock(candidates[i]);
    if (hit) return hit;
  }

  // ② result 事件正文
  if (resultEvent) {
    const t = String(resultEvent.text || '').trim();
    if (t) {
      return {
        found: true,
        task_id: '',
        status: (resultEvent as any).isError ? 'failed' : 'completed',
        summary: '',
        result: t.length > maxChars ? t.slice(0, maxChars - 1) + '…' : t,
        parse_mode: 'result_event',
      };
    }
  }

  // ③ 最后一段 assistant 正文
  const assistantTexts = list
    .filter((e) => isAssistantText(e))
    .map((e) => textOf(e))
    .filter((t) => t.trim());
  if (assistantTexts.length) {
    const last = assistantTexts[assistantTexts.length - 1].trim();
    return {
      found: true,
      task_id: '',
      status: 'completed',
      summary: '',
      result: last.length > maxChars ? last.slice(0, maxChars - 1) + '…' : last,
      parse_mode: 'assistant_fallback',
    };
  }

  // ④ 什么都没有
  return {
    found: false,
    task_id: '',
    status: '',
    summary: '',
    result: '',
    parse_mode: 'empty',
  };
}
