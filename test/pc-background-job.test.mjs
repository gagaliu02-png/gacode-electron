// [2026-11-13 · 订正 27 · B5] 后台作业（端侧）—— 可执行单测
//
// 契约依据: cross-platform-sse-event-contract-附录.md **订正 27**
//
// ## 覆盖断言
//
//   GC-P27-10  CLI 服务注册表：加一个 spec = 加一个服务，框架不改（L-27i）
//   GC-P27-12  作业表是 append-only jsonl + 三态（queued/running/reported）
//   GC-P27-13  作业是 **detached 进程**（Gacode 关了它还在跑）+ 输出落文件
//   GC-P27-14  ★ **用户手动打断 ⇒ 直连的同步任务与后台作业都要被打断**
//   GC-P27-15  闸门按「命令参数名」抽表 ⇒ `pc_job_start` 也过黑名单（`pc_claude` 不在表里）
//
// ⚠️ 本文件**不 import** `claudeService.ts` —— 那个模块带「作业无人值守 ⇒ 不逐条审批」
//    的启动参数；这里只做形状/行为断言，不需要真起 agent
//    ⇒ Claude Code 那部分的断言在 `pc-claude-service.test.mjs`（源码文本断言）。
//
// 运行: node --test test/pc-background-job.test.mjs   (完全离线, 不起 claude)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gacode-bgjob-'));
process.env.GACODE_USER_DATA_DIR = TMP;

const {
  registerCliService,
  getCliService,
  listCliServices,
  rawService,
  isBackgroundStartTool,
  isJobControlTool,
} = await import('../electron/client-tools/cliService.ts');
const {
  localJobsFile,
  jobLogFile,
  appendJob,
  updateJob,
  getJob,
  listUnreportedJobs,
  markJobReported,
} = await import('../electron/client-tools/localJobs.ts');
const {
  startJob,
  stopJobById,
  stopAllJobs,
  isProcessAlive,
} = await import('../electron/client-tools/jobRunner.ts');
const { assertAllowed, COMMAND_ARG_BY_TOOL } = await import('../electron/client-tools/gate.ts');
const { parseClaudeLine, isClaudeComplete, summarizeClaude } =
  await import('../electron/client-tools/claudeOutput.ts');

// ===========================================================================
// GC-P27-10 · CLI 服务注册表
// ===========================================================================

test('GC-P27-10 · 内置 raw 服务，注册表可扩展', () => {
  const ids = listCliServices().map((s) => s.id);
  assert.ok(ids.includes('raw'), '必须有 raw（通用命令）');
  assert.equal(getCliService('raw').id, 'raw');
  assert.equal(getCliService('nope'), null, '没注册的服务 ⇒ null，不许瞎猜');
});

test('GC-P27-10b · 加一个新 CLI 服务 = 注册一个 spec（框架一行不改）', () => {
  registerCliService({
    id: 'test-echo',
    title: '测试回显',
    buildInvocation: (ctx) => ({ command: 'echo', args: ['hi'], cwd: ctx.cwd }),
    parseOutput: (line) => (line ? { type: 'text', text: line } : null),
    isComplete: (events) => events.length > 0,
    summarize: (events) => events.map((e) => e.text || '').join('\n'),
  });
  assert.ok(getCliService('test-echo'), '新服务必须能取到');
  assert.equal(getCliService('test-echo').title, '测试回显');
});

// ===========================================================================
// GC-P27-12 · 作业表：append-only + 三态
// ===========================================================================

test('GC-P27-12 · 作业表是 append-only jsonl（并发追加不丢行）', () => {
  const id = 'ledger-' + Date.now();
  appendJob({ id, serviceId: 'raw', argv: ['echo', 'hi'], status: 'queued' });
  updateJob(id, { status: 'running', pid: 1234 });
  updateJob(id, { status: 'reported', reportedAt: Date.now() });

  const raw = fs.readFileSync(localJobsFile(), 'utf8').trim().split('\n');
  const mine = raw.filter((l) => l.includes(id));
  assert.equal(mine.length, 3, '三次状态变化 ⇒ 三行（append-only，不是整体覆写）');

  const job = getJob(id);
  assert.equal(job.status, 'reported', '折叠后取最后一行的状态');
  assert.equal(job.pid, 1234, '后写的字段覆盖前面的');
});

test('GC-P27-12b · 三态：只有 reported 才算「完事」', () => {
  const id = 'states-' + Date.now();
  appendJob({ id, serviceId: 'raw', status: 'queued' });
  assert.ok(listUnreportedJobs().some((j) => j.id === id), 'queued 还没回传');
  updateJob(id, { status: 'running' });
  assert.ok(listUnreportedJobs().some((j) => j.id === id), 'running 还没回传');
  markJobReported(id, 'done');
  assert.ok(!listUnreportedJobs().some((j) => j.id === id), 'reported 才是完事');
});

test('GC-P27-12c · 半截行（写一半被杀）不许让读取炸掉', () => {
  const id = 'broken-' + Date.now();
  appendJob({ id, serviceId: 'raw', status: 'running' });
  fs.appendFileSync(localJobsFile(), '{"id":"broken-x","stat', 'utf8');
  assert.ok(getJob(id), '其余记录照常读出来');
  assert.equal(getJob('broken-x'), null, '半截行被跳过');
});

// ===========================================================================
// GC-P27-13 · detached 进程 + 输出落文件
// ===========================================================================

test('GC-P27-13 · 作业是 detached 进程，输出落文件（不是管道）', () => {
  const id = 'run-' + Date.now();
  // 一个无害的长跑命令：睡 30 秒
  const started = startJob(id, rawService, {
    command: process.execPath,
    args: ['-e', 'setTimeout(()=>{},30000)'],
    cwd: null,
  });
  assert.ok(started.pid > 0, '必须拿到 pid');
  assert.ok(fs.existsSync(started.outputFile), '输出日志文件必须落盘');
  assert.equal(started.outputFile, jobLogFile(id));

  const job = getJob(id);
  assert.equal(job.status, 'running');
  assert.equal(job.pid, started.pid, '★ pid 必须持久化（重启后还要能杀）');
  assert.ok(isProcessAlive(started.pid), '进程应该活着');

  stopJobById(id);   // 收尾：别把测试进程留着
});

// ===========================================================================
// GC-P27-14 · ★ 用户手动打断
// ===========================================================================

/**
 * 等一个进程真的死掉（轮询，不是死等一个固定时长）。
 *
 * ⚠️ 固定 sleep 会 flaky：taskkill 是异步的，机器一忙就可能还没轮到它。
 */
async function waitDead(pid, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return !isProcessAlive(pid);
}

test('GC-P27-14 · ★ 后台作业能被用户打断（进程真的死了）', async () => {
  const id = 'stop-' + Date.now();
  const started = startJob(id, rawService, {
    command: process.execPath,
    args: ['-e', 'setTimeout(()=>{},30000)'],
    cwd: null,
  });
  assert.ok(isProcessAlive(started.pid), '先确认它在跑');

  const r = stopJobById(id);
  assert.equal(r.stopped, true, '打断必须真的动手');
  assert.equal(getJob(id).status, 'cancelled', '状态要如实记成 cancelled');

  assert.equal(await waitDead(started.pid), true, '★ 进程必须真的死了（否则用户点了停它还在跑）');
});

test('GC-P27-14b · 打断不存在的作业 ⇒ 不假装成功', () => {
  const r = stopJobById('no-such-job-' + Date.now());
  assert.equal(r.stopped, false);
  assert.equal(r.job, null);
});

test('GC-P27-14c · 急停要杀掉**所有**还在跑的作业（含后台作业）', async () => {
  const a = startJob('kill-a-' + Date.now(), rawService, {
    command: process.execPath, args: ['-e', 'setTimeout(()=>{},30000)'], cwd: null,
  });
  const b = startJob('kill-b-' + Date.now(), rawService, {
    command: process.execPath, args: ['-e', 'setTimeout(()=>{},30000)'], cwd: null,
  });
  const n = stopAllJobs();
  assert.ok(n >= 2, `急停至少要杀掉 2 个作业, 实际 ${n}`);
  assert.equal(await waitDead(a.pid), true, 'a 必须死');
  assert.equal(await waitDead(b.pid), true, 'b 必须死');
});

test('GC-P27-14d · 已回传的作业不再重复杀（幂等）', () => {
  const id = 'done-' + Date.now();
  appendJob({ id, serviceId: 'raw', status: 'running', pid: 999999 });
  markJobReported(id);
  const r = stopJobById(id);
  assert.equal(r.stopped, false, '已回传的作业不该再被停');
});

// ===========================================================================
// GC-P27-15 · 闸门按参数名抽表
// ===========================================================================

test('GC-P27-15 · pc_job_start 也过黑名单（不许成为绕过黑名单的路）', () => {
  assert.equal(COMMAND_ARG_BY_TOOL.pc_job_start, 'command', 'pc_job_start 必须在表里');
  assert.throws(
    () => assertAllowed('pc_job_start', { command: 'format C:' }),
    (e) => e.code === 'blacklist',
    '★ 后台命令同样不许跑不可逆操作',
  );
  assert.doesNotThrow(() => assertAllowed('pc_job_start', { command: 'npm test' }));
});

test('GC-P27-15b · pc_claude 故意不在表里（自然语言，走「完全开放」）', () => {
  assert.equal(COMMAND_ARG_BY_TOOL.pc_claude, undefined, 'pc_claude 不查命令黑名单');
  assert.doesNotThrow(() => assertAllowed('pc_claude', { task: '帮我重构一下' }));
});

test('GC-P27-15c · 不是命令的工具不受命令黑名单影响', () => {
  assert.doesNotThrow(() => assertAllowed('pc_read_file', { path: 'C:\\temp\\format.txt' }));
  assert.doesNotThrow(() => assertAllowed('pc_job_status', { job_id: 'x' }));
});

// ===========================================================================
// 工具分类
// ===========================================================================

test('四个后台作业工具分类正确', () => {
  assert.equal(isBackgroundStartTool('pc_claude'), true);
  assert.equal(isBackgroundStartTool('pc_job_start'), true);
  assert.equal(isBackgroundStartTool('pc_shell'), false);
  assert.equal(isJobControlTool('pc_job_status'), true);
  assert.equal(isJobControlTool('pc_job_stop'), true);
  assert.equal(isJobControlTool('pc_claude'), false);
});

// ===========================================================================
// Claude Code 输出协议（纯解析，可执行）
// ===========================================================================

test('Claude Code 输出协议：result 事件才是完成信号（user 事件不是）', () => {
  const user = parseClaudeLine(JSON.stringify({
    type: 'user', message: { content: [{ type: 'text', text: '工具结果' }] },
  }));
  assert.equal(user.type, 'text', 'user 事件只是文本');
  assert.equal(isClaudeComplete([user]), false, 'user 事件**不是**完成信号');

  const result = parseClaudeLine(JSON.stringify({
    type: 'result', subtype: 'success', result: '干完了', is_error: false,
  }));
  assert.equal(result.type, 'result');
  assert.equal(result.text, '干完了');
  assert.equal(isClaudeComplete([user, result]), true, 'result 事件才是完成信号');
  assert.equal(summarizeClaude([user, result]), '干完了');
});

test('Claude Code 输出协议：非 JSON 行不当结论', () => {
  const ev = parseClaudeLine('some log line');
  assert.equal(ev.type, 'text');
  assert.equal(ev.text, 'some log line');
});

test('Claude Code 输出协议：出错时如实反映', () => {
  const bad = parseClaudeLine(JSON.stringify({
    type: 'result', subtype: 'error_max_turns', result: '', is_error: true,
  }));
  assert.equal(bad.isError, true);
  assert.ok(summarizeClaude([bad]).includes('error_max_turns'), '没正文时要说清 subtype');
});
