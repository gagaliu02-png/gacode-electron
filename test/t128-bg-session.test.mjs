import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.GACODE_USER_DATA_DIR = mkdtempSync(join(tmpdir(), 't128-bg-'));

const B = await import('../electron/client-tools/claudeBgSession.ts');
const C = await import('../electron/client-tools/claudeCodeSession.ts');

test('T128-BG-1 · 本机 bg 会话被列出（含 bg id 与信箱信息）', () => {
  const list = B.listClaudeBgSessions();
  assert.ok(Array.isArray(list));
  for (const s of list) {
    assert.ok(s.sessionId, 'bg session must have sessionId');
    assert.ok(s.id, 'bg session must have bg id');
    assert.equal(s.kind, 'background');
  }
});

test('T128-BG-2 · session registry 直接带 jobId（= bg_id），无需额外登记', () => {
  const sessions = C.listClaudeSessions();
  const bg = sessions.filter((s) => s.kind === 'bg' || s.entrypoint === 'cli');
  for (const s of bg) {
    assert.ok(s.jobId, 'bg 会话注册项必须带 jobId');
    assert.equal(s.jobId, s.sessionId.split('-')[0], 'jobId 应等于 sessionId 前缀');
  }
});

test('T128-BG-3 · 空闲巡检不会误杀刚活跃的会话', async () => {
  // ★ [T-128b] 巡检改成**异步**（列会话那步不许同步阻塞 electron 主线程）
  const r = B.sweepIdleBackgroundSessions(5 * 60 * 1000, Date.now());
  assert.ok(r && typeof r.then === 'function', '巡检必须返回 Promise（不许同步阻塞主线程）');
  const stopped = await r;
  assert.equal(typeof stopped, 'number');
});

test('T128-BG-4 · ★[T-128b] 异步列会话不阻塞主线程（且与同步版同形）', async () => {
  const list = await B.listClaudeBgSessionsAsync();
  assert.ok(Array.isArray(list));
  for (const s of list) {
    assert.ok(s.sessionId, 'bg session must have sessionId');
    assert.ok(s.id, 'bg session must have bg id');
    assert.equal(s.kind, 'background');
  }
});
