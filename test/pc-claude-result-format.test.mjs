// [2026-11-17 · T-022] Claude Code 结果汇报协议（固定块解析 + fallback 提取）
//
// ## 覆盖断言
//
//   GC-CRF-1  ★ 固定结果块：正常解析（status/summary/result）
//   GC-CRF-2  ★ 缺 status / 缺 summary ⇒ 不炸，字段空
//   GC-CRF-3  ★ 未闭合 ⇒ 当没有（不误判）
//   GC-CRF-4  ★ 真实事故回归：result.result 为空 + assistant 有正文 ⇒ **仍有正文**
//   GC-CRF-5  ★ parse_mode 标记（structured_block / result_event / assistant_fallback / empty）
//   GC-CRF-6  ★ 固定块优先于 result 事件
//   GC-CRF-7  ★ 汇报协议模板含两个标记
//   GC-CRF-8  ★ summarizeClaude 接上了新组件（老接口不破）
//
// 运行: node --test test/pc-claude-result-format.test.mjs   (完全离线)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const {
  RESULT_BLOCK_START, RESULT_BLOCK_END,
  parseGaclawResultBlock, extractClaudeResult, buildReportingContract,
} = await import('../electron/client-tools/claudeResultFormat.ts');
const { parseClaudeLine, summarizeClaude } =
  await import('../electron/client-tools/claudeOutput.ts');

// ── 工具 ────────────────────────────────────────────────────────────────
/** 造一条 assistant 文本事件。 */
function assistant(text) {
  return parseClaudeLine(JSON.stringify({
    type: 'assistant', message: { content: [{ type: 'text', text }] },
  }));
}

/** 造一条 result 事件。 */
function result(text, isError = false) {
  return parseClaudeLine(JSON.stringify({
    type: 'result', subtype: isError ? 'error' : 'success', result: text, is_error: isError,
  }));
}

/** 造一个标准结果块。 */
function block(status = 'completed', summary = '一句话结论', body = '最终结果正文。') {
  return [
    '前面的话。',
    RESULT_BLOCK_START,
    `status: ${status}`,
    `summary: ${summary}`,
    'result: |',
    `  ${body}`,
    '  第二行。',
    RESULT_BLOCK_END,
    '后面的话。',
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════════════════

test('GC-CRF-1 · ★ 固定结果块：正常解析', () => {
  const r = parseGaclawResultBlock(block());
  assert.ok(r, '应解析出结果块');
  assert.strictEqual(r.found, true);
  assert.strictEqual(r.status, 'completed');
  assert.strictEqual(r.summary, '一句话结论');
  assert.ok(r.result.includes('最终结果正文。'), 'result 应含正文：' + r.result);
  assert.ok(r.result.includes('第二行。'), '多行 result 都要保留');
  assert.strictEqual(r.parse_mode, 'structured_block');
});

test('GC-CRF-2 · ★ 缺 status / 缺 summary ⇒ 不炸', () => {
  const r = parseGaclawResultBlock([
    RESULT_BLOCK_START,
    'result: |',
    '  只有正文。',
    RESULT_BLOCK_END,
  ].join('\n'));
  assert.ok(r);
  assert.strictEqual(r.summary, '');
  assert.strictEqual(r.status, 'completed', '没写 status 时按 completed');
  assert.ok(r.result.includes('只有正文。'));
});

test('GC-CRF-3 · ★ 未闭合 ⇒ 当没有', () => {
  assert.strictEqual(parseGaclawResultBlock(`${RESULT_BLOCK_START}\nstatus: completed`), null);
  assert.strictEqual(parseGaclawResultBlock('完全无关的文本'), null);
});

test('GC-CRF-4 · ★ 事故回归：result.result 为空 + assistant 有正文 ⇒ 仍有正文', () => {
  // 这就是 2026-11-17 那次真机事故的形状：
  //   result 事件 success，但 result.result 是空串；正文只在 assistant 事件里。
  const events = [
    assistant('中间叙述。'),
    assistant('这是完整的最终结论：浏览器工具需要迁移到 WebContentsView。'),
    result('', false),
  ];
  const r = extractClaudeResult(events);
  assert.strictEqual(r.found, true, '必须有正文');
  assert.ok(r.result.includes('迁移到 WebContentsView'), '正文不能丢：' + r.result);
  assert.strictEqual(r.parse_mode, 'assistant_fallback');

  // 老接口（summarizeClaude）也要能拿到
  const s = summarizeClaude(events);
  assert.ok(s.includes('迁移到 WebContentsView'), 'summarizeClaude 也不能丢正文：' + s);
});

test('GC-CRF-5 · ★ parse_mode 标记', () => {
  assert.strictEqual(extractClaudeResult([assistant(block())]).parse_mode, 'structured_block');
  assert.strictEqual(extractClaudeResult([result('直接的结果')]).parse_mode, 'result_event');
  assert.strictEqual(extractClaudeResult([assistant('只有叙述')]).parse_mode, 'assistant_fallback');
  assert.strictEqual(extractClaudeResult([]).parse_mode, 'empty');
  assert.strictEqual(extractClaudeResult([]).found, false);
});

test('GC-CRF-6 · ★ 固定块优先于 result 事件', () => {
  const events = [
    assistant(block('completed', '块里的结论', '块里的正文')),
    result('result 事件里的旧正文'),
  ];
  const r = extractClaudeResult(events);
  assert.strictEqual(r.parse_mode, 'structured_block');
  assert.ok(r.result.includes('块里的正文'));
  assert.ok(!r.result.includes('result 事件里的旧正文'), '不该混进旧正文');
});

test('GC-CRF-7 · ★ 汇报协议模板含两个标记', () => {
  const c = buildReportingContract();
  assert.ok(c.includes(RESULT_BLOCK_START), '模板要有起始标记');
  assert.ok(c.includes(RESULT_BLOCK_END), '模板要有结束标记');
  assert.ok(c.includes('status:'), '模板要说清 status');
  assert.ok(c.includes('summary:'), '模板要说清 summary');
  assert.ok(c.includes('result:'), '模板要说清 result');
  assert.ok(!c.includes('task_id:'), '老调用（无 taskId）不写 task_id 行');
});

test('GC-CRF-9 · ★ task_id 强绑定：模板带 task_id，解析器兼容新老格式', () => {
  const c = buildReportingContract('task-123');
  const s = c.indexOf(RESULT_BLOCK_START);
  const e = c.indexOf(RESULT_BLOCK_END);
  const blockText = c.slice(s, e);
  assert.match(blockText, /task_id: task-123/);
  assert.ok(blockText.indexOf('status:') < blockText.indexOf('task_id:'), 'task_id 放 status 后');
  assert.ok(blockText.indexOf('task_id:') < blockText.indexOf('result:'), 'task_id 放 result 前');

  // 新格式解析出 task_id
  const withId = parseGaclawResultBlock([
    RESULT_BLOCK_START,
    'status: completed',
    'task_id: task-123',
    'summary: 做完',
    'result: |',
    '  正文',
    RESULT_BLOCK_END,
  ].join('\n'));
  assert.equal(withId.task_id, 'task-123');
  assert.equal(withId.status, 'completed');

  // 老格式（没有 task_id）⇒ 空串，不误判
  assert.equal(parseGaclawResultBlock(block()).task_id, '');
  // fallback / empty 路径也要有 task_id 字段（缺省空串）
  assert.equal(extractClaudeResult([result('直接结论')]).task_id, '');
  assert.equal(extractClaudeResult([]).task_id, '');
});

test('GC-CRF-10 · ★ [T-086] 汇报协议带 reply-to 使用指引，老格式兼容', () => {
  const withReply = buildReportingContract('task-123', {
    business_session_id: 'biz-sess-1',
    cc_session_id: 'cc-sess-2',
    channel: 'pc',
  });
  assert.match(withReply, /使用 reply_to 提供的 session_id \/ channel/, '明确要求使用 reply_to');
  assert.match(withReply, /不要猜 session_id/, '明确禁止猜 session_id');
  assert.match(withReply, /reply_to_business_session_id="biz-sess-1"/);
  assert.match(withReply, /reply_to_cc_session_id="cc-sess-2"/);
  assert.match(withReply, /reply_channel="pc"/);
  assert.ok(withReply.includes(RESULT_BLOCK_START) && withReply.includes(RESULT_BLOCK_END), '结果块协议不变');
  assert.match(withReply, /task_id: task-123/, 'task_id 行仍在');

  const noReply = buildReportingContract('task-123');
  assert.ok(!noReply.includes('reply_to'), '老调用（无 replyTo）不带 reply-to 文案');
  assert.match(noReply, /task_id: task-123/, '老调用兼容 task_id');
  assert.strictEqual(
    parseGaclawResultBlock([
      RESULT_BLOCK_START, 'status: completed', 'task_id: task-123',
      'summary: 结论', 'result: |', '  正文', RESULT_BLOCK_END,
    ].join('\n')).task_id,
    'task-123',
    '带 reply-to 指引不影响结果块解析',
  );
});

test('T086-24h · ★ pc_cc_send 工作队列窗口 = 24h（无 540000/10min 残留）', () => {
  const exec = fs.readFileSync(path.join(ROOT, 'electron/client-tools/executor.ts'), 'utf8');
  const codeOnly = exec.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  assert.match(codeOnly, /pc_cc_send:\s*24 \* 60 \* 60 \* 1000/, 'pc_cc_send 默认 24h');
  assert.ok(!codeOnly.includes('540000'), '无 9 分钟残留');
  assert.ok(!/pc_cc_send[\s\S]{0,200}600000/.test(codeOnly), 'pc_cc_send 无 10 分钟残留');
  const dev = fs.readFileSync(path.join(ROOT, 'electron/client-tools/deviceClient.ts'), 'utf8');
  const devCode = dev.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  assert.match(devCode, /const PEER_JOB_DEADLINE_MS = 24 \* 60 \* 60 \* 1000/, 'peer job 24h deadline');
});

test('GC-CRF-8 · ★ summarizeClaude 老行为不破', () => {
  assert.strictEqual(summarizeClaude([result('干完了')]), '干完了');
  // 出错且没正文 ⇒ 仍要说清 subtype
  const bad = result('', true);
  assert.ok(summarizeClaude([bad]).includes('error'), '没正文时要说清 subtype');
});
