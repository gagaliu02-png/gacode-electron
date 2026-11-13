/**
 * electron/client-tools/claudeOutput.ts —— Claude Code **输出协议**的解析（纯函数）
 *
 * ## 为什么单独拆一个文件
 *
 * `claudeService.ts` 里有一份「怎么起 Claude Code」的代码，里面带着**审批旁路**的标志
 * （作业无人值守 ⇒ 不逐条问用户）。
 * ⇒ 单测**只需要**「怎么解析输出」这一半 ⇒ 把纯解析拆到这里：
 *   · 单测 import 它 ⇒ 不会把那条旁路标志拖进测试进程；
 *   · 解析逻辑仍然是**可执行、可断言**的（不是源码文本断言）。
 *
 * ## 协议（`--output-format stream-json`）
 *
 * 每行一个 JSON 事件：
 *   · `{"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}` —— 中间叙述
 *   · `{"type":"user","message":{...}}` —— ⚠️ **也**用于「工具结果」，**不代表**用户说了话
 *   · `{"type":"result","subtype":"success","result":"最终正文","is_error":false}` —— ★ **完成信号**
 */

import type { CliEvent } from './cliService.ts';

/**
 * 解析 `stream-json` 的一行。
 *
 * ⚠️ 不是 JSON 的行（Claude Code 偶尔会打日志行）⇒ 当普通文本，不当结论。
 */
export function parseClaudeLine(line: string): CliEvent | null {
  const s = String(line || '').trim();
  if (!s) return null;
  let obj: any;
  try {
    obj = JSON.parse(s);
  } catch (_) {
    return { type: 'text', text: s };
  }
  if (!obj || typeof obj !== 'object') return { type: 'text', text: s };

  const type = String(obj.type || '');
  if (type === 'result') {
    const text = typeof obj.result === 'string' ? obj.result : '';
    const isError = obj.is_error === true || (typeof obj.subtype === 'string' && obj.subtype !== 'success');
    return {
      type: 'result',
      text,
      isError,
      raw: {
        subtype: obj.subtype ?? null,
        session_id: obj.session_id ?? null,
        total_cost_usd: obj.total_cost_usd ?? null,
        num_turns: obj.num_turns ?? null,
        duration_ms: obj.duration_ms ?? null,
      },
    };
  }
  if (type === 'assistant' || type === 'user') {
    const content = obj.message && obj.message.content;
    let text = '';
    if (Array.isArray(content)) {
      text = content
        .filter((c: any) => c && c.type === 'text' && typeof c.text === 'string')
        .map((c: any) => c.text)
        .join('\n');
    } else if (typeof content === 'string') {
      text = content;
    } else if (typeof obj.result === 'string') {
      text = obj.result;
    }
    if (!text) return null;
    return { type: 'text', text, raw: { eventType: type } };
  }
  return null;
}

/**
 * 这批事件里是不是已经有最终结果了。
 *
 * ⚠️ 只有 `result` 事件算 —— `assistant` / `user` 都只是中间叙述。
 */
export function isClaudeComplete(events: CliEvent[]): boolean {
  return Array.isArray(events) && events.some((e) => e && e.type === 'result');
}

/**
 * 把事件汇成一段给用户看的结论。
 */
export function summarizeClaude(events: CliEvent[], maxChars = 8000): string {
  const list = Array.isArray(events) ? events : [];
  const result = list.find((e) => e && e.type === 'result');
  if (!result) {
    const tail = list
      .filter((e) => e && e.type === 'text' && typeof e.text === 'string')
      .map((e) => e.text as string)
      .slice(-20)
      .join('\n');
    return tail || '(Claude Code 没有产出结论)';
  }
  const text = String(result.text || '').trim();
  if (!text) {
    const raw = result.raw as any;
    const subtype = raw && raw.subtype ? String(raw.subtype) : '未知';
    return `(Claude Code 结束，但没有正文 —— subtype=${subtype})`;
  }
  return text.length > maxChars ? text.slice(0, maxChars - 1) + '…' : text;
}
