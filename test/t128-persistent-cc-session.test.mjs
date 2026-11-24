import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.GACODE_USER_DATA_DIR = mkdtempSync(join(tmpdir(), 't128-pc-'));

const M = await import('../electron/client-tools/ccPersistentSession.ts');

test('T128-PC-1 · acquire 会新建逻辑常驻 session 并可复用', () => {
  M._resetPersistentSessionsForTest();
  const a = M.acquirePersistentSession({ cwd: 'd:\\tmp', name: 's1', now: 1000 });
  assert.equal(a.reused, false);
  const b = M.acquirePersistentSession({ session_id: a.session_id, cwd: 'd:\\tmp', now: 2000 });
  assert.equal(b.reused, true);
  assert.equal(b.session_id, a.session_id);
  assert.equal(M.isPersistentSessionActive(a.session_id, 3000), true);
});

test('T128-PC-2 · 空闲 5 分钟自动失效', () => {
  M._resetPersistentSessionsForTest();
  const a = M.acquirePersistentSession({ now: 1000 });
  assert.equal(M.isPersistentSessionActive(a.session_id, 1000 + M.CC_IDLE_TTL_MS - 1), true);
  assert.equal(M.isPersistentSessionActive(a.session_id, 1000 + M.CC_IDLE_TTL_MS), false);
});

test('T128-PC-3 · 有活跃 job 不因空闲过期', () => {
  M._resetPersistentSessionsForTest();
  const a = M.acquirePersistentSession({ now: 1000 });
  M.setPersistentSessionJob(a.session_id, 'job-1', 1000);
  assert.equal(M.isPersistentSessionActive(a.session_id, 1000 + M.CC_IDLE_TTL_MS * 10), true);
  M.setPersistentSessionJob(a.session_id, null, 1000 + M.CC_IDLE_TTL_MS * 10);
  assert.equal(M.isPersistentSessionActive(a.session_id, 1000 + M.CC_IDLE_TTL_MS * 10 + M.CC_IDLE_TTL_MS), false);
});

test('T128-PC-4 · pc_cc_close 显式关闭后不可再复用', () => {
  M._resetPersistentSessionsForTest();
  const a = M.acquirePersistentSession({ now: 1000 });
  assert.ok(M.closePersistentSession(a.session_id), 'close should return removed record');
  assert.equal(M.closePersistentSession(a.session_id), null);
  assert.equal(M.isPersistentSessionActive(a.session_id, 1001), false);
  const b = M.acquirePersistentSession({ session_id: a.session_id, now: 1002 });
  assert.equal(b.reused, false);
  assert.notEqual(b.session_id, a.session_id);
});


test('T128-PC-5 · 首次新建用 --session-id，复用才用 --resume', async () => {
  const cli = await import('../electron/client-tools/claudeService.ts');
  const first = cli.buildClaudeInvocation({
    args: { task: 'x', new_session_id: '11111111-1111-4111-8111-111111111111' },
    cwd: null,
    timeoutMs: null,
    jobId: 'j',
  });
  assert.ok(first && first.args.includes('--session-id'));
  assert.ok(first.args.includes('11111111-1111-4111-8111-111111111111'));
  assert.ok(!first.args.includes('--resume'));

  const reused = cli.buildClaudeInvocation({
    args: { task: 'x', resume_session_id: '22222222-2222-4222-8222-222222222222' },
    cwd: null,
    timeoutMs: null,
    jobId: 'j',
  });
  assert.ok(reused && reused.args.includes('--resume'));
  assert.ok(reused.args.includes('22222222-2222-4222-8222-222222222222'));
  assert.ok(!reused.args.includes('--session-id'));
});


test('T128-PC-6 · expired sweep 返回过期项并从登记移除（供 claude stop 使用）', () => {
  M._resetPersistentSessionsForTest();
  const a = M.acquirePersistentSession({ now: 1000 });
  const expired = M.takeExpiredPersistentSessions(1000 + M.CC_IDLE_TTL_MS);
  assert.equal(expired.length, 1);
  assert.equal(expired[0].session_id, a.session_id);
  assert.equal(M.isPersistentSessionActive(a.session_id, 1000 + M.CC_IDLE_TTL_MS), false);
});
