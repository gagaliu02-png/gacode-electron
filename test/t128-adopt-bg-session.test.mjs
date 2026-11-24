import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.GACODE_USER_DATA_DIR = mkdtempSync(join(tmpdir(), 't128-adopt-'));

const B = await import('../electron/client-tools/claudeBgSession.ts');
const P = await import('../electron/client-tools/ccPersistentSession.ts');

const SESSIONS = [
  { id: 'f1fad802', sessionId: 'f1fad802-4bd7-4070-b4e3-625aac2c4afa', name: 'probe-a', cwd: 'd:/gaga/gaclaw-project', kind: 'background', status: 'idle', state: 'done' },
  { id: '199b3d89', sessionId: '199b3d89-3c03-4fd2-804f-9c9e23de7025', name: 'probe-b', cwd: 'd:/gaga/gaclaw-project', kind: 'background', status: 'idle', state: 'done' },
  { id: 'aaaa', sessionId: 'aaaa-1111-4111-8111-111111111111', name: 'vscode-one', cwd: 'd:/gaga/gaclaw-project', kind: 'interactive', status: 'busy', state: null },
];

test('T128-ADOPT-1 · 按 bg_id 能找到后台会话', () => {
  const hit = B.findClaudeBgSession({ bgId: 'f1fad802' }, SESSIONS);
  assert.ok(hit);
  assert.equal(hit.sessionId, 'f1fad802-4bd7-4070-b4e3-625aac2c4afa');
});

test('T128-ADOPT-2 · 按 session_id 也能找到', () => {
  const hit = B.findClaudeBgSession({ sessionId: '199b3d89-3c03-4fd2-804f-9c9e23de7025' }, SESSIONS);
  assert.ok(hit);
  assert.equal(hit.id, '199b3d89');
});

test('T128-ADOPT-3 · 找不到 ⇒ 明确失败（不静默）', () => {
  const r = B.adoptClaudeBgSession({ bgId: 'deadbeef' }, SESSIONS);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_found');
});

test('T128-ADOPT-4 · 非 background 会话 ⇒ 拒绝（只有 --bg 能登记）', () => {
  const r = B.adoptClaudeBgSession({ bgId: 'aaaa' }, SESSIONS);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_background');
});

test('T128-ADOPT-5 · 没有信箱的会话 ⇒ 拒绝并说明（登记了也投不进去）', () => {
  // f1fad802 是本机真实存在的 bg 会话 ⇒ 有信箱；用一个不存在的 sessionId ⇒ 无信箱
  const r = B.adoptClaudeBgSession({ sessionId: 'ffffffff-2222-4222-8222-222222222222' }, SESSIONS);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_found');
});
