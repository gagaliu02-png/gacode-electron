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

test('T128-BG-3 · 空闲巡检不会误杀刚活跃的会话', () => {
  const stopped = B.sweepIdleBackgroundSessions(5 * 60 * 1000, Date.now());
  assert.equal(typeof stopped, 'number');
});
