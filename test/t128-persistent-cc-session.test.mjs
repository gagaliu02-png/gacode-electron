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

test('T128-PC-4 · pc_cc_close 显式关闭后不再 active', () => {
  M._resetPersistentSessionsForTest();
  const a = M.acquirePersistentSession({ now: 1000 });
  assert.ok(M.closePersistentSession(a.session_id), 'close should return removed record');
  assert.equal(M.closePersistentSession(a.session_id), null);
  assert.equal(M.isPersistentSessionActive(a.session_id, 1001), false);
  // ★ [T-128b] 契约变了：`acquirePersistentSession` 现在是「**登记这个 id**」
  //   （调用方 `pcCcNewBg` 传的是 **CLI 真实 sessionId**）⇒ 不再另发一个随机 UUID。
  //   「close 后那个 id 不能再用」由**别处**保证：close 会真停掉 CLI 进程
  //   ⇒ `pc_cc_send`/`pc_cc_read` 对它一律「会话不在本机运行中」。
  const b = M.acquirePersistentSession({ session_id: a.session_id, now: 1002 });
  assert.equal(b.reused, false);
  assert.equal(b.session_id, a.session_id, '登记的必须是传入的 id，不能换成别的 UUID');
});

test('T128-PC-8 · ★[T-128b] 传入的 session_id 必须被原样登记（缺陷 1 回归钉）', () => {
  // 病根：旧实现查不到就 `randomUUID()` 另建一条 ⇒ 记录里的 id 与 CLI 真实 sessionId 不一致
  //   ⇒ 模型拿到的 id 一调 send/read/close 就「会话不在本机运行中」
  //   ⇒ `setPersistentSessionBgId(真实 id, bgId)` 也命中不了 ⇒ bg_id 永远 null
  //   ⇒ `pc_cc_close` 只删登记、停不掉 CLI 进程 ⇒ 常驻进程泄漏。
  M._resetPersistentSessionsForTest();
  const real = 'f8026214-0689-4f2e-bc9e-4948e91bfe5e';
  const r = M.acquirePersistentSession({ session_id: real, cwd: 'C:\\Users\\gaga', name: 'bg' });
  assert.equal(r.session_id, real, '拿到的 id 必须就是传进来的那个');
  assert.equal(r.reused, false);
  const rec = M.getPersistentSession(real);
  assert.ok(rec, '登记里必须能按真 id 查到');
  assert.equal(rec.session_id, real);
  // bg_id 也必须能写进去（之前因为 id 对不上而永远写不进去）
  M.setPersistentSessionBgId(real, 'f8026214');
  const rec2 = M.getPersistentSession(real);
  assert.equal(rec2.bg_id, 'f8026214', 'bg_id 必须能登记上');
});

test('T128-PC-9 · 没传 id 时才发新的随机 UUID', () => {
  M._resetPersistentSessionsForTest();
  const a = M.acquirePersistentSession({ now: 1000 });
  const b = M.acquirePersistentSession({ now: 1001 });
  assert.notEqual(a.session_id, b.session_id, '没传 id ⇒ 每次都是新 id');
  assert.match(a.session_id, /^[0-9a-f-]{36}$/i);
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

test('T128-PC-7 · bg_id 从 CLI stdout 解析（不靠 name 反查）', () => {
  const stdout = 'backgrounded · 5002b1dc · t128-repro' + String.fromCharCode(10) + '  claude agents list sessions';
  const m = /backgrounded[^0-9a-fA-F]*([0-9a-fA-F]{6,})/.exec(stdout);
  assert.ok(m, 'must parse bg id from stdout');
  assert.equal(m[1], '5002b1dc');
});
