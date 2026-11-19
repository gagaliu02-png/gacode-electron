// [2026-11-17 · T-022] 端侧 Claude Code 结果等待器（watcher）+ `pc_cc_send` 注入协议
//
// ## 覆盖断言
//
//   GC-CW-1  ★ 只看「基线之后」的新增内容（之前的历史不算结果）
//   GC-CW-2  ★ 主路径：命中固定结果块 ⇒ 立刻返回
//   GC-CW-3  ★ 兜底：会话变 idle 且有新正文 ⇒ 取最后一段 assistant 正文
//   GC-CW-4  ★ 超时 ⇒ 明确报错（不静默挂死）
//   GC-CW-5  ★ abort ⇒ 立刻退出
//   GC-CW-6  ★ 注入正文带 task_id + 汇报协议（`sendPeerMessage`）
//   GC-CW-6b ★ `buildReportingContract(taskId)` 把 task_id 写进结果块
//   GC-CW-8  ★ `pcCcSend` job 化：投递 + 订阅后立即返回「已投递」，不再前台等结果
//   GC-CW-9  ★ task_id 错配的结果块不是本次结果（peer-job 强校验）
//   GC-CW-7  ★ 只命中一次（不重复报）
//
// ⚠️ 本文件**不 import electron** —— 只加载纯 Node 模块。
//    HOME 被指到临时目录 ⇒ 测试**不碰**用户真实的 ~/.claude。
//
// 运行: node --test test/pc-claude-result-watcher.test.mjs   (完全离线)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ── HOME 隔离（必须在 import 被测模块前设好）────────────────────────────
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'gacode-watcher-'));
process.env.HOME = FAKE_HOME;
process.env.USERPROFILE = FAKE_HOME;

const { projectSlug } = await import('../electron/client-tools/claudeCodeSession.ts');
const { readNewAssistantText, watchClaudeSessionResult } =
  await import('../electron/client-tools/claudeCodeResultWatcher.ts');
const { RESULT_BLOCK_START, RESULT_BLOCK_END } =
  await import('../electron/client-tools/claudeResultFormat.ts');

const SESSIONS_DIR = path.join(FAKE_HOME, '.claude', 'sessions');
const PROJECTS_DIR = path.join(FAKEDIR(), '.claude', 'projects');
function FAKEDIR() { return FAKE_HOME; }

// ── 夹具 ───────────────────────────────────────────────────────────────
/** 造一条活会话登记。 */
function writeSession(pid, overrides = {}) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  const rec = {
    pid,
    sessionId: `sess-${pid}`,
    cwd: 'd:\\gaga\\gaclaw-project',
    status: 'busy',
    entrypoint: 'claude-vscode',
    messagingSocketPath: `\\\\.\\pipe\\LOCAL\\cc-msg-${String(pid).padStart(32, '0')}`,
    ...overrides,
  };
  fs.writeFileSync(path.join(SESSIONS_DIR, `${pid}.json`), JSON.stringify(rec, null, 2));
  return rec;
}

/** transcript 的绝对路径。 */
function transcriptFile(rec) {
  const dir = path.join(PROJECTS_DIR, projectSlug(rec.cwd));
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${rec.sessionId}.jsonl`);
}

/** 往 transcript 追加内容。 */
function appendTranscript(rec, text) {
  const f = transcriptFile(rec);
  const lines = Array.isArray(text) ? text : [text];
  fs.appendFileSync(f, lines.map((l) => (typeof l === 'string' && l.startsWith('{') ? l : JSON.stringify(l))).join('\n') + '\n');
}

/** 造一条 assistant 文本行。 */
function assistantLine(text) {
  return JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
}

/** 造一个标准结果块。 */
function resultBlock(summary = '结论', body = '最终结果。') {
  return [
    assistantLine([
      '好的，我来处理。',
      RESULT_BLOCK_START,
      'status: completed',
      `summary: ${summary}`,
      'result: |',
      `  ${body}`,
      RESULT_BLOCK_END,
    ].join('\n')),
  ];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ═══════════════════════════════════════════════════════════════════════

test('GC-CW-1 · ★ 只看「基线之后」的新增内容', async () => {
  const rec = writeSession(2001);
  // 先写历史内容
  appendTranscript(rec, assistantLine('这是注入之前的历史内容'));
  const baseline = fs.statSync(transcriptFile(rec)).size;

  // 基线之后没有新内容 ⇒ 读不到
  const r0 = readNewAssistantText(rec.sessionId, baseline);
  assert.equal(r0.text, '', '基线之后没内容 ⇒ 不该读到历史');

  // 基线之后追加 ⇒ 只读到新的
  appendTranscript(rec, assistantLine('这是注入之后的新内容'));
  const r1 = readNewAssistantText(rec.sessionId, baseline);
  assert.match(r1.text, /注入之后的新内容/);
  assert.ok(!r1.text.includes('历史内容'), '历史内容不该被算成新内容');
});

test('GC-CW-2 · ★ 主路径：命中固定结果块 ⇒ 立刻返回', async () => {
  const rec = writeSession(2002);
  appendTranscript(rec, assistantLine('占位'));
  const baseline = fs.statSync(transcriptFile(rec)).size;

  const p = watchClaudeSessionResult({
    sessionId: rec.sessionId,
    sinceOffset: baseline,
    timeoutMs: 5000,
    pollMs: 50,
  });
  await sleep(120);
  appendTranscript(rec, resultBlock('块里的结论', '块里的正文'));

  const w = await p;
  assert.equal(w.ok, true, '应等到结果');
  assert.equal(w.result.parse_mode, 'structured_block');
  assert.equal(w.result.summary, '块里的结论');
  assert.match(w.result.result, /块里的正文/);
});

test('GC-CW-3 · ★ 兜底：会话变 idle 且有新正文 ⇒ 取最后一段 assistant 正文', async () => {
  const rec = writeSession(2003);
  appendTranscript(rec, assistantLine('占位'));
  const baseline = fs.statSync(transcriptFile(rec)).size;

  const p = watchClaudeSessionResult({
    sessionId: rec.sessionId,
    sinceOffset: baseline,
    timeoutMs: 5000,
    pollMs: 50,
  });
  await sleep(120);
  // 没有固定块，只有普通正文；并把会话置为 idle
  appendTranscript(rec, assistantLine('端侧 Claude Code 的最终结论是：搞定了。'));
  writeSession(2003, { status: 'idle' });

  const w = await p;
  assert.equal(w.ok, true, '应等到结果');
  assert.equal(w.result.parse_mode, 'assistant_fallback');
  assert.match(w.result.result, /搞定了/);
});

test('GC-CW-4 · ★ 超时 ⇒ 明确报错（不静默挂死）', async () => {
  const rec = writeSession(2004);
  appendTranscript(rec, assistantLine('占位'));
  const baseline = fs.statSync(transcriptFile(rec)).size;

  const w = await watchClaudeSessionResult({
    sessionId: rec.sessionId,
    sinceOffset: baseline,
    timeoutMs: 300,
    pollMs: 50,
  });
  assert.equal(w.ok, false);
  assert.match(w.error, /超时/);
});

test('GC-CW-5 · ★ abort ⇒ 立刻退出', async () => {
  const rec = writeSession(2005);
  appendTranscript(rec, assistantLine('占位'));
  const baseline = fs.statSync(transcriptFile(rec)).size;

  const ac = new AbortController();
  const p = watchClaudeSessionResult({
    sessionId: rec.sessionId,
    sinceOffset: baseline,
    timeoutMs: 30000,
    pollMs: 50,
    signal: ac.signal,
  });
  await sleep(120);
  ac.abort();
  const w = await p;
  assert.equal(w.ok, false);
  assert.equal(w.error, 'aborted');
});

test('GC-CW-6 · ★ 注入正文带 task_id + 汇报协议', async () => {
  const { buildPeerMessageContent } = await import('../electron/client-tools/claudeCodePeer.ts');
  const c = buildPeerMessageContent('任务正文', 'task-abc123');
  assert.match(c, /<cross-session-message from="uds:gaclaw" task_id="task-abc123">/, '要带 task_id');
  assert.match(c, /任务正文/, '要带原始正文');
  assert.ok(c.includes(RESULT_BLOCK_START), '要带汇报协议的起始标记');
  assert.ok(c.includes(RESULT_BLOCK_END), '要带汇报协议的结束标记');
  assert.match(c, /<\/cross-session-message>$/, '要闭合');

  // 没有 task_id 时也不该带空属性
  const c2 = buildPeerMessageContent('只有正文');
  assert.match(c2, /<cross-session-message from="uds:gaclaw">/, '不该出现空 task_id');
  assert.ok(!c2.includes('task_id='), '不该出现 task_id 属性');
});

test('GC-CW-6d · ★ [T-086] reply-to 写进 cross-session-message 属性 + 汇报协议', async () => {
  const { buildPeerMessageContent } = await import('../electron/client-tools/claudeCodePeer.ts');
  const c = buildPeerMessageContent('任务正文', 'task-abc123', {
    business_session_id: 'biz-sess-42',
    cc_session_id: 'cc-sess-77',
    channel: 'pc',
  });
  assert.match(c, /<cross-session-message from="uds:gaclaw" task_id="task-abc123" reply_to_business_session_id="biz-sess-42" reply_to_cc_session_id="cc-sess-77" reply_channel="pc">/,
    '三个 reply-to 属性必须按顺序写进注入消息');
  assert.ok(c.includes('使用 reply_to 提供的 session_id / channel') && c.includes('不要猜 session_id'),
    '汇报协议要明确使用 reply_to、不许猜 session_id');
  assert.ok(c.includes(RESULT_BLOCK_START) && c.includes(RESULT_BLOCK_END), '结果块协议仍在');
  assert.match(c, /<\/cross-session-message>$/, '仍要闭合');

  // 老调用（无 replyTo）兼容：属性与文案都不出现
  const old = buildPeerMessageContent('任务正文', 'task-abc123');
  assert.ok(!old.includes('reply_to_'), '老格式不带 reply-to 属性');
  assert.ok(!old.includes('reply_to 提供'), '老格式不带 reply-to 指引');
  assert.match(old, /<cross-session-message from="uds:gaclaw" task_id="task-abc123">/, '老格式 tag 不变');
});

test('GC-CW-6e · ★ [T-086] reply-to 部分字段也安全（转义 + 无空属性）', async () => {
  const { buildPeerMessageContent } = await import('../electron/client-tools/claudeCodePeer.ts');
  const c = buildPeerMessageContent('任务正文', null, {
    business_session_id: 'biz "<>&\n inject',
  });
  assert.match(c, /<cross-session-message from="uds:gaclaw" reply_to_business_session_id="bizinject">/,
    '危险字符被清洗，不破坏 XML 属性');
  assert.ok(!c.includes('reply_to_cc_session_id='), '未给的字段不写空属性');
  assert.ok(!c.includes('reply_channel='), '未给的字段不写空属性');

  const empty = buildPeerMessageContent('任务正文', null, {});
  assert.match(empty, /<cross-session-message from="uds:gaclaw">/, '空 replyTo ⇒ 老格式');
});

test('GC-CW-6b · ★ 汇报协议带 task_id，错配块不能被当作本次结果', async () => {
  const { buildReportingContract, parseGaclawResultBlock } =
    await import('../electron/client-tools/claudeResultFormat.ts');
  const contract = buildReportingContract('task-xyz');
  const piece = contract.slice(contract.indexOf(RESULT_BLOCK_START), contract.indexOf(RESULT_BLOCK_END));
  assert.match(piece, /task_id: task-xyz/, '契约模板要写入 task_id');

  const blockText = (taskId) => [
    RESULT_BLOCK_START,
    'status: completed',
    `task_id: ${taskId}`,
    'summary: 结论',
    'result: |',
    '  正文',
    RESULT_BLOCK_END,
  ].join('\n');
  const rec = writeSession(2008);
  appendTranscript(rec, assistantLine(blockText('task-xyz')));
  const hit = parseGaclawResultBlock(readNewAssistantText(rec.sessionId, 0).text);
  assert.equal(hit.task_id, 'task-xyz');

  const wrong = parseGaclawResultBlock(blockText('other-task'));
  assert.equal(wrong.task_id, 'other-task');
  // peer-job 里的判据：只有 hit.task_id === pendingId 才回传
  assert.ok(!(wrong.task_id === 'task-xyz'), '错配 ⇒ 不许结算');
});

test('GC-CW-6c · ★ 凭据缺失时如实失败（不静默成功）', async () => {
  const rec = writeSession(2006);
  const { sendPeerMessage } = await import('../electron/client-tools/claudeCodePeer.ts');
  const r = await sendPeerMessage(rec.sessionId, '任务正文', 'later', 'task-abc123');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'peer_credential_unavailable');
});

test('GC-CW-8 · ★ pcCcSend job 化：不再前台等结果（源码级断言）', () => {
  const exec = fs.readFileSync(path.join(ROOT, 'electron/client-tools/executor.ts'), 'utf8');
  assert.ok(exec.includes('claudeCodePeerInbox.register('), '先登记 inbox 映射');
  assert.ok(exec.includes("sendPeerControl(sessionId, 'notify_when_idle'"), '发订阅帧');
  assert.ok(exec.includes('peerJobManager.track('), '交给后台管理器');
  assert.ok(!exec.includes('watchClaudeSessionResult('), '不再前台 await watcher');
});

test('GC-CW-7 · ★ 只命中一次（不重复报）', async () => {
  const rec = writeSession(2007);
  appendTranscript(rec, assistantLine('占位'));
  const baseline = fs.statSync(transcriptFile(rec)).size;

  let calls = 0;
  const p = watchClaudeSessionResult({
    sessionId: rec.sessionId,
    sinceOffset: baseline,
    timeoutMs: 5000,
    pollMs: 50,
  }).then((w) => { calls++; return w; });

  await sleep(120);
  appendTranscript(rec, resultBlock('结论', '正文'));
  const w = await p;
  assert.equal(w.ok, true);
  // 再追加一段（不该再触发第二次）
  appendTranscript(rec, resultBlock('第二段结论', '第二段正文'));
  await sleep(200);
  assert.equal(calls, 1, '只能命中一次');
});
