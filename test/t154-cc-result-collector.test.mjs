// [T-154-cc] 「端侧兜底」采集器的**行为**回归（不是源码正则）。
//
// 事故背景（2026-11-25 · gaclaw 业务会话 1192）：
//   常驻 CC 会话 `b0f8568c…` 20:17:14 明明输出了完整结果块，
//   端侧**没把它投回服务端**（当时压根没有采集器）⇒ 服务端 0 命中
//   ⇒ 20:22:22 空闲巡检把会话一关 ⇒ 结论唯一副本也没了。
//
// 本文件断言：**采集器确实能把结果块投回业务会话收件箱**，
// 并且「还没投出去」这件事是**可查询**的（空闲巡检靠它决定不许回收）。
//
// ⚠️ 必须在 import 任何模块**之前**设好环境变量：
//   · USERPROFILE           ⇒ `os.homedir()` 改道 ⇒ CLI 会话登记项落临时目录
//   · GACODE_USER_DATA_DIR  ⇒ 登记表落临时目录（不碰真实用户数据）

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SANDBOX_HOME = mkdtempSync(join(tmpdir(), 't154-home-'));
process.env.USERPROFILE = SANDBOX_HOME;
process.env.GACODE_USER_DATA_DIR = mkdtempSync(join(tmpdir(), 't154-data-'));

const { ccResultCollector } = await import('../electron/client-tools/ccResultCollector.ts');

const SESSION_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const CWD = 'C:\\sandbox';

function writeSessionFile(status = 'idle') {
  const dir = join(SANDBOX_HOME, '.claude', 'sessions');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, '9999.json'),
    JSON.stringify({
      pid: 9999,
      sessionId: SESSION_ID,
      cwd: CWD,
      status,
      updatedAt: Date.now(),
      kind: 'background',
      jobId: SESSION_ID.split('-')[0],
    }),
    'utf8',
  );
}

function writeTranscript(text) {
  const dir = join(SANDBOX_HOME, '.claude', 'projects', 'C--sandbox');
  mkdirSync(dir, { recursive: true });
  const line = JSON.stringify({
    type: 'assistant',
    uuid: 'msg-1',
    timestamp: new Date().toISOString(),
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  });
  writeFileSync(join(dir, `${SESSION_ID}.jsonl`), line + '\n', 'utf8');
}

const RESULT_BLOCK = [
  '===GACLAW_RESULT_START===',
  'status: completed',
  'task_id: TASK-1',
  'summary: 1191 卡在审批等待',
  'result: |',
  '  结论正文第一行',
  '  结论正文第二行',
  '===GACLAW_RESULT_END===',
].join('\n');

test('T154-COL-1 · ★ 采到结果块 ⇒ 投回业务会话收件箱（一次，带幂等键）', async () => {
  writeSessionFile();
  writeTranscript(RESULT_BLOCK);

  const delivered = [];
  ccResultCollector.start(async (d) => { delivered.push(d); return true; });

  ccResultCollector.register({
    sessionId: SESSION_ID,
    taskId: 'TASK-1',
    sinceOffset: 0,
    businessSessionId: '1192',
    ccSessionId: SESSION_ID,
  });

  // ★ 投出去之前：「这个会话还有未回传的结果」必须能查到（空闲巡检靠它）
  assert.equal(ccResultCollector.hasPendingForSession(SESSION_ID), true, '登记后必须算「有未回传结果」');

  await ccResultCollector.tickNow();

  assert.equal(delivered.length, 1, '结果块必须被投出去一次');
  const d = delivered[0];
  assert.equal(d.businessSessionId, '1192', '必须投给发起这次派单的业务会话');
  assert.equal(d.taskId, 'TASK-1', '必须带任务号（服务端据此判 work_unit_result / agent_message）');
  assert.ok(d.idempotencyKey, '必须带幂等键（重投不重复投递）');
  assert.match(d.content, /结论正文第一行/, '结论正文必须带上');
  assert.match(d.content, /1191 卡在审批等待/, 'summary 必须带上');

  // ★ 投出去之后：不再是「未回传」⇒ 巡检可以回收这个会话了
  assert.equal(ccResultCollector.hasPendingForSession(SESSION_ID), false, '投出去后必须不算未回传');
});

test('T154-COL-2 · task_id 对不上 ⇒ 不许投（别把别的任务的结果当自己的）', async () => {
  writeSessionFile();
  writeTranscript(RESULT_BLOCK);

  const delivered = [];
  ccResultCollector.start(async (d) => { delivered.push(d); return true; });

  ccResultCollector.register({
    sessionId: SESSION_ID,
    taskId: 'OTHER-TASK',
    sinceOffset: 0,
    businessSessionId: '1192',
  });

  await ccResultCollector.tickNow();
  assert.equal(delivered.length, 0, 'task_id 不匹配不许投');
  assert.equal(ccResultCollector.hasPendingForSession(SESSION_ID), true, '还在等 ⇒ 仍算未回传');
  ccResultCollector.cancel(`cc-collect:${SESSION_ID}:OTHER-TASK`);
});

test('T154-COL-3 · 会话没了 ⇒ 也要投一条「没拿到结果」（不许让对端干等）', async () => {
  writeSessionFile();
  // 不写 transcript ⇒ 没有结果块
  const delivered = [];
  ccResultCollector.start(async (d) => { delivered.push(d); return true; });

  const key = ccResultCollector.register({
    sessionId: 'ffffffff-0000-0000-0000-000000000000',
    taskId: 'TASK-2',
    sinceOffset: 0,
    businessSessionId: '1192',
  });

  await ccResultCollector.tickNow();

  assert.equal(delivered.length, 1, '会话不在了必须立刻收场并通知');
  assert.match(delivered[0].content, /未回结果/, '通知要说清「没拿到结果」');
  assert.match(delivered[0].content, /transcript/, '通知要指向 transcript（结论可能还在里面）');
  assert.equal(ccResultCollector.hasPendingForSession('ffffffff-0000-0000-0000-000000000000'), false);
  ccResultCollector.cancel(key);
});

test('T154-COL-4 · 登记缺业务会话号 ⇒ 直接拒绝（无处可投的采集是假的）', () => {
  assert.throws(
    () => ccResultCollector.register({ sessionId: SESSION_ID, taskId: 'TASK-3', businessSessionId: '' }),
    /businessSessionId/,
  );
});

test('T154-COL-6 · ★ 幂等键必须**等于 task_id**（对方自报 + 端侧兜底 ⇒ 只能投一次）', async () => {
  // 实测踩过（2026-11-25 e2e）：对方用 mcp__gaclaw__send 自报（键=task_id）
  // ＋ 端侧兜底采集（键=cc-collect:task_id）⇒ **两个不同的键** ⇒ 同一份结论投了两遍。
  // ⇒ 两边必须共用 task_id ⇒ 服务端幂等命中 ⇒ 只留一条。
  writeSessionFile();
  writeTranscript(RESULT_BLOCK);

  const delivered = [];
  ccResultCollector.start(async (d) => { delivered.push(d); return true; });

  ccResultCollector.register({
    sessionId: SESSION_ID,
    taskId: 'TASK-1',
    sinceOffset: 0,
    businessSessionId: '1192',
  });

  await ccResultCollector.tickNow();

  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].idempotencyKey, 'TASK-1', '幂等键必须就是 task_id（不加前缀）');
});

test('T154-COL-5 · ★ 会话被杀了（登记项没了）但 transcript 里还有结果 ⇒ 照样要投出去', async () => {
  // 这一条是 T-154-cc 事故最要命的一步：
  //   「结论在 transcript 里」+「会话被空闲巡检回收了」⇒ 老路走不通（登记项没了 ⇒ 定位不到文件）
  //   ⇒ 结果彻底丢。现在必须**全盘扫** projects/<目录>/<sessionId>.jsonl 把它捞回来。
  writeSessionFile();
  writeTranscript(RESULT_BLOCK);
  // 把登记项删掉 = 模拟「CLI 进程退出 / 被 claude stop 杀掉」
  rmSync(join(SANDBOX_HOME, '.claude', 'sessions', '9999.json'), { force: true });

  const delivered = [];
  ccResultCollector.start(async (d) => { delivered.push(d); return true; });

  ccResultCollector.register({
    sessionId: SESSION_ID,
    taskId: 'TASK-1',
    sinceOffset: 0,
    businessSessionId: '1192',
  });

  await ccResultCollector.tickNow();

  assert.equal(delivered.length, 1, '会话没了也必须把结论投出去（结论还在 transcript 里）');
  assert.match(delivered[0].content, /结论正文第一行/);
  assert.equal(ccResultCollector.hasPendingForSession(SESSION_ID), false);
});
