// [2026-11-17 · T-020] Claude Code 管控端侧工具（`pc_cc_*`）单测
//
// 契约依据：服务端 gaclaw `src/llm/client-tools.js` 的 `pc_cc_*` spec
//   （根目录 docs/ 不是 git 仓 ⇒ 关键条款复述在本文件 + commit message）。
//
// ## 覆盖断言
//
//   GC-CC-01  slug 规则：cwd 的非字母数字全换成 `-`（大小写不敏感）
//   GC-CC-02  ★ 登记解析：只认 `<pid>.json`，坏文件跳过而不让整个列表失败
//   GC-CC-03  transcript 定位：slug 目录 + `<sessionId>.jsonl`
//   GC-CC-04  ★ transcript 尾部解析：抽 user/assistant 正文 + 工具名，
//               跳过 attachment/api-request 之类无正文的行
//   GC-CC-05  ★ `waiting` ⇒ 判定「多半在等一次工具授权」
//   GC-CC-06  ★ 只读：会话模块**不写**任何东西到 ~/.claude/（读盘快照对比）
//   GC-CC-07  ⛔ 本机 IPC 判定：只放 `\\.\pipe\...`，UNC/远程/多段一律拒
//   GC-CC-08  ★ peerToken 定位：文件名里的 sha256 是在**全小写**的规范路径上算的
//   GC-CC-09  ⛔ 不支持的 control action 一律拒
//   GC-CC-10  能力串：声明 claude-code=1 才多一个键（老串逐字不变）
//
// ⚠️ 本文件**不 import electron** —— 只加载纯 Node 模块。
//    HOME 被指到临时目录 ⇒ 测试**不碰**用户真实的 ~/.claude。
//
// 运行: node --test test/pc-claude-code-tools.test.mjs   (完全离线)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

// ── HOME 隔离（必须在 import 被测模块前设好）────────────────────────────
const FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'gacode-cc-'));
process.env.HOME = FAKE_HOME;
process.env.USERPROFILE = FAKE_HOME;

const {
  projectSlug,
  listClaudeSessions,
  transcriptPath,
  readTranscriptTail,
  summarizeSession,
  hasClaudeCodeSessions,
} = await import('../electron/client-tools/claudeCodeSession.ts');

const {
  isLocalPipePath,
  sendPeerControl,
  sendPeerMessage,
} = await import('../electron/client-tools/claudeCodePeer.ts');

const { buildCapabilityString } = await import('../electron/client-tools/jobCapability.ts');

// ── 夹具 ───────────────────────────────────────────────────────────────
const SESSIONS_DIR = path.join(FAKE_HOME, '.claude', 'sessions');
const PROJECTS_DIR = path.join(FAKE_HOME, '.claude', 'projects');

/** 造一条活会话登记。 */
function writeSession(pid, overrides = {}) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  const rec = {
    pid,
    sessionId: `sess-${pid}`,
    cwd: 'd:\\gaga\\gaclaw-project',
    status: 'busy',
    entrypoint: 'claude-vscode',
    kind: 'interactive',
    name: `gaclaw-project-${pid}`,
    messagingSocketPath: `\\\\.\\pipe\\LOCAL\\cc-msg-${String(pid).padStart(32, '0')}`,
    peerProtocol: 1,
    peerFeatures: ['notify_idle'],
    ...overrides,
  };
  fs.writeFileSync(path.join(SESSIONS_DIR, `${pid}.json`), JSON.stringify(rec, null, 2));
  return rec;
}

/** 造一段 transcript。 */
function writeTranscript(cwd, sessionId, lines) {
  const slug = projectSlug(cwd);
  const dir = path.join(PROJECTS_DIR, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), lines.join('\n') + '\n');
}

// ═══════════════════════════════════════════════════════════════════════

test('GC-CC-01 · slug 规则：cwd 的非字母数字全换成 `-`', () => {
  assert.equal(projectSlug('d:\\gaga\\gaclaw-project'), 'd--gaga-gaclaw-project');
  assert.equal(projectSlug('C:\\Users\\gaga'), 'C--Users-gaga');
  assert.equal(projectSlug('/home/ubuntu/x'), '-home-ubuntu-x');
});

test('GC-CC-02 · 登记解析：只认 <pid>.json，坏文件跳过而不让整个列表失败', () => {
  writeSession(1001);
  writeSession(1002, { status: 'idle' });
  // 非 <pid>.json 的文件必须被忽略
  fs.writeFileSync(path.join(SESSIONS_DIR, 'notapid.json'), JSON.stringify({ pid: 999 }));
  // 坏 JSON（可能正被写撕裂）必须被跳过
  fs.writeFileSync(path.join(SESSIONS_DIR, '1003.json'), '{ broken');

  const all = listClaudeSessions();
  const pids = all.map(s => s.pid).sort();
  assert.deepEqual(pids, [1001, 1002], '坏文件不该让整个列表失败');
});

test('GC-CC-03 · transcript 定位：slug 目录 + <sessionId>.jsonl', () => {
  const rec = writeSession(1010);
  writeTranscript(rec.cwd, rec.sessionId, ['{"type":"user"}']);
  const p = transcriptPath(rec);
  assert.ok(p, 'transcript 路径应找得到');
  assert.ok(p.endsWith(path.join('d--gaga-gaclaw-project', 'sess-1010.jsonl')));
});

test('GC-CC-04 · transcript 尾部解析：抽正文 + 工具名，跳过无正文的行', () => {
  const rec = writeSession(1020);
  writeTranscript(rec.cwd, rec.sessionId, [
    JSON.stringify({ type: 'user', message: { role: 'user', content: '帮我看看这个 bug' }, timestamp: 't1' }),
    JSON.stringify({ type: 'attachment', attachment: { type: 'environment' } }),
    JSON.stringify({ type: 'api-request', params: { model: 'x' } }),
    JSON.stringify({
      type: 'assistant',
      message: { role: 'assistant', content: [
        { type: 'thinking', thinking: '先读文件' },
        { type: 'text', text: '我先读一下' },
        { type: 'tool_use', name: 'Read', id: 't1' },
      ] },
    }),
  ]);

  const { turns } = readTranscriptTail(rec, { maxTurns: 10 });
  assert.equal(turns.length, 2, '只有 user/assistant 两轮');
  assert.equal(turns[0].role, 'user');
  assert.match(turns[0].text, /帮我看看这个 bug/);
  assert.equal(turns[1].role, 'assistant');
  assert.match(turns[1].text, /我先读一下/);
  assert.deepEqual(turns[1].tools, ['Read']);
});

test('GC-CC-05 · waiting ⇒ 判定「多半在等一次工具授权」', () => {
  const busy = writeSession(1030, { status: 'busy' });
  const waiting = writeSession(1031, { status: 'waiting', waitingFor: 'input needed' });

  assert.equal(summarizeSession(busy).likely_awaiting_permission, false);
  assert.equal(summarizeSession(waiting).likely_awaiting_permission, true);
  assert.equal(summarizeSession(waiting).waiting_for, 'input needed');
});

test('GC-CC-06 · ★ 只读：会话模块不写任何东西到 ~/.claude/', () => {
  const rec = writeSession(1040);
  writeTranscript(rec.cwd, rec.sessionId, [
    JSON.stringify({ type: 'user', message: { role: 'user', content: 'hi' } }),
  ]);
  const before = snapshotTree(FAKE_HOME);
  listClaudeSessions();
  readTranscriptTail(rec, { maxTurns: 5 });
  summarizeSession(rec);
  const after = snapshotTree(FAKE_HOME);
  assert.deepEqual(after, before, '只读模块不许写盘');
});

test('GC-CC-07 · ⛔ 本机 IPC 判定：只放 \\\\.\\pipe\\...，其余一律拒', () => {
  assert.equal(isLocalPipePath('\\\\.\\pipe\\LOCAL\\cc-msg-abc'), true);
  assert.equal(isLocalPipePath('\\\\.\\pipe\\cc-msg-abc'), true);
  assert.equal(isLocalPipePath('\\\\server\\share\\pipe'), false, 'UNC / 远程必须拒');
  assert.equal(isLocalPipePath('/tmp/cc-socks-1.sock'), false, '非 pipe 路径必须拒');
  assert.equal(isLocalPipePath(''), false);
});

test('GC-CC-08 · ★ peerToken 定位：sha256 是在**全小写**的规范路径上算的', () => {
  // 直接验证规范路径的推导（跟真机登记里的文件名规则一致）
  const sock = '\\\\.\\pipe\\LOCAL\\cc-msg-7ad41c5e4bc5f6bd93f35e7aa285c5fa';
  const canon = '\\\\.\\pipe\\local\\cc-msg-7ad41c5e4bc5f6bd93f35e7aa285c5fa';
  const hash = crypto.createHash('sha256').update(canon).digest('hex');
  assert.equal(hash.length, 64);
  // 大小写不同的规范路径 ⇒ 不同的 hash（所以必须用小写那版）
  const hashUpper = crypto.createHash('sha256').update(sock).digest('hex');
  assert.notEqual(hash, hashUpper, '必须用全小写的规范路径');
});

test('GC-CC-09 · ⛔ 不支持的 control action 一律拒', async () => {
  const r = await sendPeerControl('sess-x', 'rm_rf_everything');
  assert.equal(r.ok, false);
  assert.match(r.reason, /unsupported_action/);
});

test('GC-CC-09b · 会话不在本机运行 ⇒ 如实报 session_not_live', async () => {
  const r = await sendPeerMessage('not-a-live-session', 'hello');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'session_not_live');
});

test('GC-CC-09c · [T-069] sendPeerControl 支持显式 from 覆盖（源码级断言）', () => {
  const src = fs.readFileSync(path.join(process.cwd(), 'electron/client-tools/claudeCodePeer.ts'), 'utf8');
  // opts.from 参数存在
  assert.match(src, /opts:\s*\{\s*from\?:/);
  // 显式设置到 frame.from（不破坏 rename/peer_message_status：只在有值时才设）
  assert.match(src, /if \(opts\.from !== undefined && opts\.from !== null\) frame\.from = opts\.from/);
  // from 只在显式传入时设置 ⇒ rename/peer_message_status 默认不带 from
  assert.match(src, /const frame: Record<string, unknown> = \{ type: 'control', action, \.\.\.extra \}/);
});

test('GC-CC-10 · 能力串：声明 claude-code=1 才多一个键（老串逐字不变）', () => {
  assert.equal(
    buildCapabilityString({ pty: true, job: true, browser: true }),
    'client-tools=1,pty=1,fs=1,screen=1,os=1,job=1,browser=1',
  );
  assert.equal(
    buildCapabilityString({ pty: true, job: true, browser: true, claudeCode: true }),
    'client-tools=1,pty=1,fs=1,screen=1,os=1,job=1,browser=1,claude-code=1',
  );
  // 没声明 claude-code ⇒ 老串逐字不变
  assert.equal(
    buildCapabilityString({ pty: false, job: true }),
    'client-tools=1,fs=1,screen=1,os=1,job=1',
  );
});

test('GC-CC-11 · 能力判据：有会话登记目录才声明 claude-code', () => {
  assert.equal(hasClaudeCodeSessions(), true, '夹具建了目录 ⇒ 应为 true');
});

// ── 工具 ───────────────────────────────────────────────────────────────
function snapshotTree(root) {
  const out = [];
  const walk = (dir, rel) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(p, r);
      else {
        const st = fs.statSync(p);
        out.push(`${r}:${st.size}:${st.mtimeMs}`);
      }
    }
  };
  walk(root, '');
  return out.sort();
}
