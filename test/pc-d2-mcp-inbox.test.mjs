// [T-166 · D2] 采集器「MCP 回报已落 inbox」销账回归。
//
// 事故根因：目标会话有 mcp__gaclaw__send ⇒ 按合同走 MCP 回报（进业务会话收件箱），
// 采集器只扫 transcript 里的 ===GACLAW_RESULT_START=== 块 ⇒ 判「未找到协议块」⇒
// 回投失败摘要。但 MCP 回报的幂等键就是 task_id（生产库 1193:849 实证）⇒
// 失败摘要被服务端幂等吞掉，用户其实早就收到正确结果，只是采集器本地账一直挂着。
//
// 修法：sendCollectedResult 回传 { ok, duplicate }；duplicate=true ⇒ 静默销账。

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SANDBOX_HOME = mkdtempSync(join(tmpdir(), 't166d2-home-'));
process.env.USERPROFILE = SANDBOX_HOME;
process.env.GACODE_USER_DATA_DIR = mkdtempSync(join(tmpdir(), 't166d2-data-'));

const { ccResultCollector } = await import('../electron/client-tools/ccResultCollector.ts');

const PIDS = { d2a: 9101, d2b: 9102, d2c: 9103, d2d: 9104 };
function makeSession(tag) {
  const id = `${tag}-0000-0000-0000-000000000000`.slice(0, 36).padEnd(36, '0');
  const dir = join(SANDBOX_HOME, '.claude', 'sessions');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${PIDS[tag]}.json`),
    JSON.stringify({ pid: PIDS[tag], sessionId: id, cwd: `C:\sandbox-${tag}`, status: 'idle', updatedAt: Date.now(), kind: 'background', jobId: tag }),
    'utf8',
  );
  return id;
}

// 单例共享 deliver：用可切换策略串行跑全部场景，避免多次 start() 互相覆盖。
let mode = 'duplicate';
const delivered = [];
ccResultCollector.start(async (d) => {
  delivered.push(d);
  if (mode === 'duplicate') return { ok: true, duplicate: true };
  if (mode === 'ok') return { ok: true, duplicate: false };
  return { ok: false, duplicate: false };
});

function register(sessionId, taskId) {
  return ccResultCollector.register({
    sessionId,
    taskId,
    sinceOffset: 0,
    businessSessionId: '1193',
    ccSessionId: sessionId,
    timeoutMs: 1,
  });
}

test('D2-all · 采集器对 MCP 回报的四种场景串行回归', async () => {
  // ① MCP 回报已落（duplicate=true）
  {
    const sid = makeSession('d2a');
    delivered.length = 0; mode = 'duplicate';
    const key = register(sid, 'D2-TASK-1');
    await new Promise((r) => setTimeout(r, 5));
    await ccResultCollector.tickNow();

    assert.equal(delivered.length, 1, 'duplicate ⇒ 只投一次（幂等探测）');
    assert.equal(delivered[0].idempotencyKey, 'D2-TASK-1', '幂等键必须就是 task_id');
    assert.match(delivered[0].content, /未回结果/);
    assert.equal(ccResultCollector.hasPendingForSession(sid), false, 'duplicate ⇒ 销账');
    ccResultCollector.cancel(key);
  }

  // ② 无 MCP 回报（duplicate=false）
  {
    const sid = makeSession('d2b');
    delivered.length = 0; mode = 'ok';
    const key = register(sid, 'D2-TASK-2');
    await new Promise((r) => setTimeout(r, 5));
    await ccResultCollector.tickNow();

    assert.equal(delivered.length, 1);
    assert.match(delivered[0].content, /未回结果/);
    assert.equal(ccResultCollector.hasPendingForSession(sid), false);
    ccResultCollector.cancel(key);
  }

  // ③ 回投异常（ok=false）
  {
    const sid = makeSession('d2c');
    delivered.length = 0; mode = 'fail';
    const key = register(sid, 'D2-TASK-3');
    await new Promise((r) => setTimeout(r, 5));
    await ccResultCollector.tickNow();

    assert.equal(delivered.length, 1);
    assert.equal(ccResultCollector.hasPendingForSession(sid), false);
    ccResultCollector.cancel(key);
  }

  // ④ transcript 有结果块 ⇒ 主路径不受影响
  {
    const sid = makeSession('d2d');
    const dir = join(SANDBOX_HOME, '.claude', 'projects', 'C--sandbox-d2d');
    mkdirSync(dir, { recursive: true });
    const block = [
      '===GACLAW_RESULT_START===',
      'status: completed',
      'task_id: D2-TASK-4',
      'summary: 正常结果',
      'result: |',
      '  正文',
      '===GACLAW_RESULT_END===',
    ].join('\n');
    writeFileSync(
      join(dir, `${sid}.jsonl`),
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: block }] } }) + '\n',
      'utf8',
    );
    delivered.length = 0; mode = 'ok';
    const key = register(sid, 'D2-TASK-4');
    await ccResultCollector.tickNow();

    assert.equal(delivered.length, 1);
    assert.match(delivered[0].content, /正文/);
    assert.doesNotMatch(delivered[0].content, /未回结果/);
    ccResultCollector.cancel(key);
  }
});

test('D2-cleanup · 收尾', () => {
  rmSync(SANDBOX_HOME, { force: true, recursive: true });
});
