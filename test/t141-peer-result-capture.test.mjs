/**
 * T-141 · 「结果块已完整输出，却被 120s 采集端误报 failed」回归钉（源码不变量 + 行为）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../scripts/lib/strip-comments.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = join(HERE, '..');
const deviceCode = stripComments(readFileSync(join(REPO, 'electron/client-tools/deviceClient.ts'), 'utf8'), 'ts');
const watcherSrc = readFileSync(join(REPO, 'electron/client-tools/claudeCodeResultWatcher.ts'), 'utf8');

test('T141-1 · no-block grace 不再单独 settle error（必须终态 + tail 反查）', () => {
  assert.ok(!/if\s*\(\s*job\.firstReplyTextAt[\s\S]{0,200}PEER_JOB_NO_BLOCK_GRACE_MS[\s\S]{0,200}settle\(/.test(deviceCode),
    '★ 不能再只凭 firstReplyTextAt + 2min 直接结算 error');
  assert.ok(/terminal\s*&&[\s\S]{0,160}firstReplyTextAt/.test(deviceCode),
    '★ no-block 收口必须先判 terminal（idle/exit）');
});

test('T141-2 · settle 前有 tail 反查兜底（findResultBlockByTaskId）', () => {
  assert.ok(/const tailHit = findResultBlockByTaskId\(job\.sessionId, job\.taskId\)/.test(deviceCode),
    '★ readResult 里 settle 前必须按 task_id 反查 tail');
  assert.ok(/source: source \+ ':tail_scan'/.test(deviceCode), '★ tail 命中要带来源标记');
});

test('T141-3 · transcript 增量按消息 id/turn 合并，不按裸字节窗口拼正文', () => {
  assert.ok(watcherSrc.includes('assistantEntryOf'), '★ 必须有带身份抽取的 assistantEntryOf');
  assert.ok(/const byId = new Map<string, string\[\]>\(\)/.test(watcherSrc), '★ 必须按消息 id 聚合');
});

test('T141-4 · 24h deadline 仍在（放宽 grace 不放宽总兜底）', () => {
  assert.ok(/const PEER_JOB_DEADLINE_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(deviceCode));
});

test('T141-5 · findResultBlockByTaskId 只读 tail 且按 task_id 精确匹配', async () => {
  // os.homedir() 不认 HOME 覆盖 ⇒ 在真实 ~/.claude 下用唯一 sessionId 建临时文件，
  //   每个文件都带 t141-test- 前缀，测试结束删除（不碰任何真实会话）。
  const os = await import('node:os');
  const { projectSlug } = await import('../electron/client-tools/claudeCodeSession.ts');
  const { findResultBlockByTaskId } = await import('../electron/client-tools/claudeCodeResultWatcher.ts');
  const sessionId = `t141-test-${Date.now()}`;
  const cwd = 'd:\\gaga\\gaclaw-project';
  const sessions = join(os.homedir(), '.claude', 'sessions');
  mkdirSync(sessions, { recursive: true });
  const regFile = join(sessions, '999999.json');
  const regExisted = (() => { try { return readFileSync(regFile, 'utf8'); } catch { return null; } })();
  writeFileSync(regFile, JSON.stringify({
    pid: 999999, sessionId, cwd, status: 'idle', entrypoint: 'claude-vscode',
  }));
  const proj = join(os.homedir(), '.claude', 'projects', projectSlug(cwd));
  mkdirSync(proj, { recursive: true });
  const tf = join(proj, `${sessionId}.jsonl`);
  const line = (uuid, text) => JSON.stringify({ type: 'assistant', uuid, message: { content: [{ type: 'text', text }] } });
  const block = [
    '===GACLAW_RESULT_START===',
    'status: completed',
    'task_id: task-xyz',
    'summary: ok',
    'result: |',
    '  DONE',
    '===GACLAW_RESULT_END===',
  ].join('\n');
  writeFileSync(tf, [
    line('u1', block.split('\n').slice(0, 4).join('\n')),
    line('u1', block.split('\n').slice(4).join('\n')),
    line('u2', 'unrelated'),
  ].join('\n'));
  try {
    const hit = findResultBlockByTaskId(sessionId, 'task-xyz');
    assert.ok(hit, 'tail 反查应找到结果块');
    assert.equal(hit.task_id, 'task-xyz');
    assert.match(hit.result, /DONE/);
    assert.equal(findResultBlockByTaskId(sessionId, 'other-task'), null, 'task_id 必须精确匹配');
  } finally {
    try { (await import('node:fs')).unlinkSync(tf); } catch { /* ignore */ }
    if (regExisted === null) { try { (await import('node:fs')).unlinkSync(regFile); } catch { /* ignore */ } }
    else writeFileSync(regFile, regExisted);
  }
});
