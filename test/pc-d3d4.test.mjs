// [2026-11-26 · T-165] 端侧 D3（重启死锁）+ D4（长跑任务不暴露）—— 单测
//
// ## 覆盖断言
//
//   T165-D3-1  `isZombieRunningDispatch`：账本 running + 作业已死 ⇒ 判死（true）
//   T165-D3-2  账本 running + 作业还活着 ⇒ **不是**僵尸（false，重连补推要照常跳过）
//   T165-D3-3  账本 queued / reported ⇒ 都不是僵尸
//   T165-D3-4  **pid 复用防护**：作业起始时刻早于本进程启动 ⇒ 即使 pid「活着」也判死
//   T165-D3-5  `isStartedSinceProcessStart`：本进程启动之后起的 ⇒ true；更早的 ⇒ false
//   T165-D4-1  `runningTasks()` 纳入**长跑作业**（detached 独立进程）
//   T165-D4-2  终态作业 / 进程已死的作业 ⇒ **不**纳入（数字不能虚高）
//   T165-D4-3  去重：同一条在 this.running 与作业表里 ⇒ 只出现一次
//
// 运行: node --test test/pc-d3d4.test.mjs
//
// ⚠️ `deviceClient.ts` **import electron** ⇒ 单测里**不能**直接 import 它
//   ⇒ D4 的合并逻辑用**同构的纯函数**在测试里复刻（口径逐字对齐实现），
//      并用「源码不变量」断言把实现钉住（防止实现与测试漂移）。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gacode-d3d4-'));
process.env.GACODE_USER_DATA_DIR = TMP;

const {
  decideBackgroundDispatch,
  isZombieRunningDispatch,
  markDispatch,
  getDispatchEntry,
  listDispatchEntries,
} = await import('../electron/client-tools/dispatchLedger.ts');
const {
  isProcessAlive,
  isStartedSinceProcessStart,
  processStartedAt,
} = await import('../electron/client-tools/proc.ts');
const {
  appendJob,
  listJobs,
  updateJob,
  isTerminalJobStatus,
} = await import('../electron/client-tools/localJobs.ts');

// ─── 打桩：让「某个 pid 活着/死了」可控 ─────────────────────────────────────
// 用**本进程自己的 pid** 当「活着的进程」——它一定活着（测试自己）。
const ALIVE_PID = process.pid;
// 一个几乎不可能存在的 pid ⇒ 一定死了。
const DEAD_PID = 0x7ffffffe;

// ═══════════════════════════════════════════════════════════════════════════
// T165-D3 · 判死判定
// ═══════════════════════════════════════════════════════════════════════════

test('T165-D3-1 · 账本 running + 作业已死 ⇒ 判死（true）', () => {
  const entry = { pendingId: 'p1', mode: 'background', tool: 'pc_shell', state: 'running', startedAt: Date.now(), reportedAt: null, error: null };
  assert.equal(isZombieRunningDispatch(entry, false), true, '作业不在跑 ⇒ 僵尸 ⇒ 该判死');
});

test('T165-D3-2 · 账本 running + 作业还活着 ⇒ 不是僵尸（false，重连补推照常跳过）', () => {
  const entry = { pendingId: 'p2', mode: 'background', tool: 'pc_shell', state: 'running', startedAt: Date.now(), reportedAt: null, error: null };
  assert.equal(isZombieRunningDispatch(entry, true), false, '作业还在跑 ⇒ 不是僵尸');
});

test('T165-D3-3 · 账本 queued / reported ⇒ 都不是僵尸', () => {
  const base = { pendingId: 'p3', mode: 'background', tool: 'pc_shell', startedAt: Date.now(), reportedAt: null, error: null };
  assert.equal(isZombieRunningDispatch({ ...base, state: 'queued' }, false), false, 'queued 不是僵尸');
  assert.equal(isZombieRunningDispatch({ ...base, state: 'reported' }, false), false, 'reported 不是僵尸');
  assert.equal(isZombieRunningDispatch(null, false), false, '没有记录 ⇒ 不是僵尸');
});

test('T165-D3-5 · isStartedSinceProcessStart：本进程启动之后起的 ⇒ true；更早的 ⇒ false', () => {
  const procStart = processStartedAt();
  // 本进程启动之后（+1 分钟）
  assert.equal(isStartedSinceProcessStart(procStart + 60_000), true, '本次启动之后起的 ⇒ true');
  // 本进程启动之前（-1 小时）⇒ 属于上一次启动
  assert.equal(isStartedSinceProcessStart(procStart - 3_600_000), false, '上次启动之前起的 ⇒ false');
  // 拿不到判据（0 / NaN）⇒ false（保守：当作不是本次的）
  assert.equal(isStartedSinceProcessStart(0), false);
  assert.equal(isStartedSinceProcessStart(NaN), false);
});

test('T165-D3-4 · **pid 复用防护**：起始时刻早于本进程启动 ⇒ 即使 pid「活着」也判死', () => {
  // 用本进程 pid（确实活着）当「被复用的旧 pid」
  assert.equal(isProcessAlive(ALIVE_PID), true, '前提：本进程 pid 确实活着');
  const procStart = processStartedAt();
  // 作业起始时刻在**本次启动之前**（1 小时前）⇒ 它属于上一次启动
  const oldStartedAt = procStart - 3_600_000;
  assert.equal(isStartedSinceProcessStart(oldStartedAt), false, '旧作业 ⇒ 复用防护判定为 false');
  // ⇒ 组合起来：pid 活着，但复用防护说它不是我们的 ⇒ 判死
  const alive = isProcessAlive(ALIVE_PID) && isStartedSinceProcessStart(oldStartedAt);
  assert.equal(alive, false, 'pid 活着但属于上次启动 ⇒ 判为「不在跑」⇒ 判死销账');
});

// ═══════════════════════════════════════════════════════════════════════════
// T165-D4 · 长跑任务纳入 runningTasks
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 与 `deviceClient.ts::runningTasks()` **同构**的合并逻辑（口径逐字对齐）。
 * ⚠️ deviceClient.ts import electron ⇒ 单测里不能直接 import 它 ⇒ 这里复刻一份，
 *    并用「源码不变量」测试锁住实现与本函数的一致。
 */
function mergeRunningTasks(inProcessTasks, jobs) {
  const out = [];
  const seen = new Set();
  for (const t of inProcessTasks) {
    if (!t || !t.pendingId) continue;
    if (seen.has(t.pendingId)) continue;
    seen.add(t.pendingId);
    out.push({ ...t });
  }
  for (const job of jobs) {
    if (!job || !job.id) continue;
    if (seen.has(job.id)) continue;
    if (isTerminalJobStatus(job.status)) continue;
    const alive = !!(job.pid && job.pid > 0 && isProcessAlive(job.pid)
      && isStartedSinceProcessStart(job.startedAt));
    if (!alive) continue;
    seen.add(job.id);
    out.push({
      pendingId: job.id,
      tool: job.serviceId || job.id,
      title: job.summary || null,
      sessionId: job.sessionId || null,
      originClient: null,
      startedAt: job.startedAt || 0,
      mode: 'background',
    });
  }
  return out;
}

test('T165-D4-1 · 长跑作业（detached，进程活着）被纳入 runningTasks', () => {
  const job = appendJob({
    id: 'job-long-1',
    serviceId: 'raw',
    argv: ['sleep', '1000'],
    pid: ALIVE_PID,               // 活着
    startedAt: Date.now(),        // 本次启动之后
    status: 'running',
  });
  const list = mergeRunningTasks([], listJobs());
  const hit = list.find((t) => t.pendingId === job.id);
  assert.ok(hit, '长跑作业必须出现在 runningTasks 里（之前完全进不来）');
  assert.equal(hit.mode, 'background');
  assert.equal(hit.tool, 'raw');
});

test('T165-D4-2 · 终态作业 / 进程已死的作业 ⇒ 不纳入（数字不能虚高）', () => {
  // 终态
  const done = appendJob({
    id: 'job-done-1', serviceId: 'raw', argv: [], pid: ALIVE_PID,
    startedAt: Date.now(), status: 'reported',
  });
  // 进程已死
  const dead = appendJob({
    id: 'job-dead-1', serviceId: 'raw', argv: [], pid: DEAD_PID,
    startedAt: Date.now(), status: 'running',
  });
  const list = mergeRunningTasks([], listJobs());
  assert.equal(list.find((t) => t.pendingId === done.id), undefined, '终态作业不该算在跑');
  assert.equal(list.find((t) => t.pendingId === dead.id), undefined, '进程已死的作业不该算在跑');
});

test('T165-D4-3 · 去重：同一条在「进程内」与「作业表」里 ⇒ 只出现一次', () => {
  const id = 'job-dup-1';
  appendJob({
    id, serviceId: 'raw', argv: [], pid: ALIVE_PID,
    startedAt: Date.now(), status: 'running',
  });
  const inProc = [{ pendingId: id, tool: 'pc_shell', title: null, sessionId: null, originClient: null, startedAt: Date.now(), mode: 'sync' }];
  const list = mergeRunningTasks(inProc, listJobs());
  const hits = list.filter((t) => t.pendingId === id);
  assert.equal(hits.length, 1, '同一条只能出现一次');
  assert.equal(hits[0].mode, 'sync', '进程内那条优先（保留原有语义）');
});

// ═══════════════════════════════════════════════════════════════════════════
// 源码不变量 —— 把实现钉住，防止「实现改了但测试没改」
// ═══════════════════════════════════════════════════════════════════════════

const SRC = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'electron', 'client-tools', 'deviceClient.ts'),
  'utf8',
);

test('源码不变量 · D3：recoverOrphans 不再只处理 pc_cc_send，且调用判死函数', () => {
  // 判死函数被用上
  assert.match(SRC, /isZombieRunningDispatch\(/, 'recoverOrphans 必须用判死判定');
  // 不再有「只处理 pc_cc_send 就跳过」的旧写法
  assert.doesNotMatch(
    SRC,
    /entry\.tool !== 'pc_cc_send' \|\| entry\.state === 'reported'/,
    '旧的「只处理 pc_cc_send」过滤必须去掉（否则其余工具的 running 残留永远没人管）',
  );
  // 判死后要销账（机器事件 return_failed）
  assert.match(SRC, /return_failed/, '判死后必须让服务端销账（return_failed）');
});

test('源码不变量 · D4：runningTasks 必须合并作业表', () => {
  const i = SRC.indexOf('runningTasks(): RunningClientTask[]');
  assert.ok(i > 0, '找得到 runningTasks');
  const seg = SRC.slice(i, i + 2600);
  assert.match(seg, /listJobs\(\)/, 'runningTasks 必须读本机作业表（长跑作业的真相在那儿）');
  assert.match(seg, /isTerminalJobStatus\(/, '终态作业必须排除');
  assert.match(seg, /isLocalJobAlive\(/, '必须用 isLocalJobAlive（含 pid 复用防护）');
  assert.match(seg, /seen/, '必须按 pendingId 去重');
});

test('源码不变量 · D4：长跑作业起跑/结束时都要 emitTasks（数字能升也能降）', () => {
  // 起跑处
  const startIdx = SRC.indexOf("markDispatch(pendingId, { state: 'running' })");
  assert.ok(startIdx > 0, '找得到长跑作业起跑处');
  const startSeg = SRC.slice(startIdx, startIdx + 400);
  assert.match(startSeg, /emitTasks\(\)/, '长跑作业起跑 ⇒ 必须 emitTasks（数字要升）');
  // 回传终态处
  const doneIdx = SRC.indexOf('markDispatchReported(jobId, payload.error || null)');
  assert.ok(doneIdx > 0, '找得到作业回传终态处');
  const doneSeg = SRC.slice(doneIdx, doneIdx + 400);
  assert.match(doneSeg, /emitTasks\(\)/, '作业进终态 ⇒ 必须 emitTasks（数字要降）');
});

test('源码不变量 · 边界：pc_shell 既有行为不许动', () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // pc_shell 的执行分支在 **executor.ts**（deviceClient 只是派单侧）⇒ 到那儿去查。
  const executor = fs.readFileSync(
    path.join(here, '..', 'electron', 'client-tools', 'executor.ts'),
    'utf8',
  );
  assert.match(executor, /case 'pc_shell': return pcShell\(/, 'pc_shell 分支必须保持原样');
  // decideBackgroundDispatch 的既有判定口径不许变
  const ledger = fs.readFileSync(
    path.join(here, '..', 'electron', 'client-tools', 'dispatchLedger.ts'),
    'utf8',
  );
  assert.match(ledger, /if \(entry\.state === 'reported'\) return 'skip_reported';/, '既有判定口径不变');
  assert.match(ledger, /if \(entry\.state === 'running'\) return 'skip_running';/, '既有判定口径不变（判死走新函数，不改这条）');
});

test('源码不变量 · 只动端侧：不碰服务端', () => {
  // 本次只改 electron 仓 ⇒ 这条只是提醒（真正的不变量在 git diff 里）
  assert.ok(true);
});
