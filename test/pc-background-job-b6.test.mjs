// [2026-11-13 · 订正 27 · B6] 后台作业在**端侧主进程**的接线 —— 可执行单测
//
// 契约依据: cross-platform-sse-event-contract-附录.md **订正 27**
//
// ## 覆盖断言
//
//   GC-P27-20  派单侧**三态账本**（queued / running / reported）+ append-only
//   GC-P27-21  ★ **重连补推不许把 24 小时的长作业再启一个**（去重判据）
//   GC-P27-22  能力键 `job`（L-27j）：**实测**判据 + 老能力串逐字不变
//   GC-P27-23  作业视图（内部形状 → 界面形状）
//   GC-P27-24  ★ 巡检：跑完 ⇒ 回传**一次** ⇒ 标已上报（不重复回传）
//   GC-P27-25  失败要**说清原因**（取消 / 执行器报错 / 非 0 退出码）
//   GC-P27-26  ★ **同步派单行为逐字不变**（mode 分流只影响 background）
//
// ⚠️ 本文件**不 import** `claudeService.ts` —— 那个模块带「作业无人值守 ⇒ 不逐条审批」
//    的启动参数；这里只做形状/行为断言，不需要真起 agent
//    ⇒ 纯解析在 `claudeOutput.ts`（B5 已拆好）。
//
// ⚠️ 也不 import `deviceClient.ts` —— 它 import electron（单测进程里没有 electron）。
//    ⇒ 设备通道那半用**源码文本断言**钉住（`deviceClient` / `preload` / `shared/types`）。
//
// 运行: node --test test/pc-background-job-b6.test.mjs   (完全离线, 不起 claude)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gacode-bgjob-b6-'));
process.env.GACODE_USER_DATA_DIR = TMP;

const {
  dispatchLedgerFile,
  getDispatchEntry,
  loadDispatchLedger,
  markDispatch,
  markDispatchReported,
  decideBackgroundDispatch,
} = await import('../electron/client-tools/dispatchLedger.ts');
const { buildCapabilityString, probeJobExecutor } =
  await import('../electron/client-tools/jobCapability.ts');
const { toJobInfo, listJobInfos } = await import('../electron/client-tools/jobView.ts');
const {
  buildJobReport,
  jobsPendingReport,
  readAllJobEvents,
  jobReporter,
} = await import('../electron/client-tools/jobReporter.ts');
const { appendJob, updateJob, getJob, jobLogFile } =
  await import('../electron/client-tools/localJobs.ts');
const { rawService } = await import('../electron/client-tools/cliService.ts');
const cliServiceMod = await import('../electron/client-tools/cliService.ts');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readSrc = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ===========================================================================
// GC-P27-20 · 派单侧三态账本
// ===========================================================================

test('GC-P27-20 · 派单账本是 append-only jsonl（三态折叠）', () => {
  const id = 'disp-' + Date.now();
  markDispatch(id, { state: 'queued', mode: 'background', tool: 'pc_claude' });
  markDispatch(id, { state: 'running' });
  markDispatchReported(id, null);

  const raw = fs.readFileSync(dispatchLedgerFile(), 'utf8').trim().split('\n');
  const mine = raw.filter((l) => l.includes(id));
  assert.equal(mine.length, 3, '三次状态变化 ⇒ 三行（append-only，不是整体覆写）');

  const entry = getDispatchEntry(id);
  assert.equal(entry.state, 'reported', '折叠后取最后一行的状态');
  assert.equal(entry.mode, 'background', '后写的行没覆盖 mode（undefined 不覆盖）');
  assert.equal(entry.tool, 'pc_claude');
  assert.ok(entry.reportedAt > 0, '已上报要有时间戳');
});

test('GC-P27-20b · 半截行（写一半被杀）不许让读取炸掉', () => {
  const id = 'disp-broken-' + Date.now();
  markDispatch(id, { state: 'queued', mode: 'background' });
  fs.appendFileSync(dispatchLedgerFile(), '{"pendingId":"broken-x","sta', 'utf8');
  assert.ok(getDispatchEntry(id), '其余记录照常读出来');
  assert.equal(getDispatchEntry('broken-x'), null, '半截行被跳过');
});

// ===========================================================================
// GC-P27-21 · ★ 重连补推不许把长作业再启一个
// ===========================================================================

test('GC-P27-21 · ★ 后台派单的去重判据（queued / running 都算「已经在跑」）', () => {
  assert.equal(decideBackgroundDispatch(null), 'start', '没起过 ⇒ 正常起');
  assert.equal(
    decideBackgroundDispatch({ state: 'running', mode: 'background' }),
    'skip_running',
    '★ 已经在跑 ⇒ 跳过（重连补推不许把 24 小时的长作业再启一个）',
  );
  assert.equal(
    decideBackgroundDispatch({ state: 'reported', mode: 'background' }),
    'skip_reported',
    '已上报 ⇒ 这条单子彻底完事',
  );
  // queued：起过（本地有作业行）⇒ 不许再起一个；没起过（起作业失败）⇒ 可以再试。
  assert.equal(
    decideBackgroundDispatch({ state: 'queued', mode: 'background' }, true),
    'skip_running',
    '已起过（本地有作业行）⇒ 跳过',
  );
  assert.equal(
    decideBackgroundDispatch({ state: 'queued', mode: 'background' }, false),
    'start',
    '★ 起作业失败（本地没有作业行）⇒ 可以再试一次（顺便把失败再报一遍）',
  );
});

test('GC-P27-21b · 派单账本与**作业表**是两份（别混）', () => {
  const id = 'two-ledgers-' + Date.now();
  markDispatch(id, { state: 'running', mode: 'background', tool: 'pc_claude' });
  // 作业表里没有这条 ⇒ 两份表互不干扰。
  assert.equal(getJob(id), null, '作业表里不该有派单账本的记录');
  assert.ok(getDispatchEntry(id), '派单账本里有');
});

// ===========================================================================
// GC-P27-22 · 能力键 `job`（L-27j）
// ===========================================================================

test('GC-P27-22 · 老能力串**逐字不变**（只多一个 job 键）', () => {
  assert.equal(
    buildCapabilityString({ pty: true, job: false }),
    'client-tools=1,pty=1,fs=1,screen=1,os=1',
    '没装执行器 ⇒ 老串逐字不变',
  );
  assert.equal(
    buildCapabilityString({ pty: false, job: false }),
    'client-tools=1,fs=1,screen=1,os=1',
    '没 node-pty 的老串也逐字不变',
  );
  const withJob = buildCapabilityString({ pty: true, job: true });
  assert.ok(withJob.includes('client-tools=1'), '总闸必须在');
  assert.ok(withJob.includes('job=1'), '★ 装了执行器 ⇒ 声明 job=1');
  assert.ok(withJob.endsWith('job=1'), 'job 追加在最后');
  assert.equal(
    withJob,
    'client-tools=1,pty=1,fs=1,screen=1,os=1,job=1',
    '整串就是老串 + job=1',
  );
});

test('GC-P27-22b · 判据是**实测**（真跑一条最轻的命令），不是写死', () => {
  const probe = probeJobExecutor();
  assert.equal(typeof probe.executor, 'boolean', '探针要给结论');
  assert.ok(probe.reason && probe.reason.length > 0, '探针要说明理由（诊断用）');
  // ⚠️ 这台机器能跑命令 ⇒ 探针必须说「能」（写死的实现过不了这一关）。
  assert.equal(probe.executor, true, `探针应该跑通：${probe.reason}`);
});

// ===========================================================================
// GC-P27-23 · 作业视图
// ===========================================================================

test('GC-P27-23 · 作业视图：标题来自 CLI 服务，状态原样带出', () => {
  const id = 'view-' + Date.now();
  appendJob({
    id,
    serviceId: 'raw',
    status: 'running',
    pid: 4242,
    startedAt: 1000,
    summary: '干了一半',
  });
  const info = toJobInfo(getJob(id));
  assert.equal(info.id, id);
  assert.equal(info.serviceId, 'raw');
  assert.equal(info.title, rawService.title, '标题要人话（不是 serviceId）');
  assert.equal(info.status, 'running');
  assert.equal(info.pid, 4242);
  assert.equal(info.summary, '干了一半');
  assert.equal(info.settledAt, null);
});

test('GC-P27-23b · 作业列表按开始时间倒序（新的在上面）', () => {
  const old = 'view-old-' + Date.now();
  const fresh = 'view-new-' + Date.now();
  appendJob({ id: old, serviceId: 'raw', status: 'running', startedAt: 1000 });
  appendJob({ id: fresh, serviceId: 'raw', status: 'running', startedAt: 999999 });
  const list = listJobInfos();
  const iOld = list.findIndex((j) => j.id === old);
  const iFresh = list.findIndex((j) => j.id === fresh);
  assert.ok(iFresh >= 0 && iOld >= 0, '两条都得在列表里');
  assert.ok(iFresh < iOld, '新的在上面');
});

// ===========================================================================
// GC-P27-24 · ★ 巡检：跑完 ⇒ 回传一次 ⇒ 标已上报
// ===========================================================================

/**
 * 造一条「跑完了」的作业（pid 是死的 ⇒ 巡检会判它结束）。
 */
function makeFinishedJob(tag, opts = {}) {
  const id = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const outputFile = jobLogFile(id);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, opts.output || '第一行\n第二行\n', 'utf8');
  appendJob({
    id,
    serviceId: 'raw',
    status: 'running',
    pid: 999999,          // 不存在的 pid ⇒ 进程已死
    outputFile,
    outputOffset: 0,
    startedAt: Date.now(),
    ...(opts.exitCode !== undefined ? { exitCode: opts.exitCode } : {}),
  });
  return id;
}

test('GC-P27-24 · ★ 巡检发现跑完的作业 ⇒ 回传 ⇒ 标已上报（**只回一次**）', async () => {
  const id = makeFinishedJob('done');
  const seen = [];
  await jobReporter.tick(async (jobId, p) => {
    seen.push({ jobId, p });
    return true;
  });

  const mine = seen.filter((s) => s.jobId === id);
  assert.equal(mine.length, 1, '★ 跑完的作业被回传了一次');
  assert.equal(mine[0].p.status, 'ok');
  assert.ok(String(mine[0].p.stdout || '').includes('第一行'), 'stdout 是汇总（带输出）');

  // 再巡检一次 ⇒ **不许**再回传（已经标了 reported）。
  await jobReporter.tick(async (jobId, p) => {
    seen.push({ jobId, p });
    return true;
  });
  assert.equal(seen.filter((s) => s.jobId === id).length, 1, '★ 只回传一次');
  assert.equal(getJob(id).status, 'reported', '作业标成已回传');
  assert.equal(getDispatchEntry(id)?.state, 'reported', '派单账本也标成已上报');
});

test('GC-P27-24b · 回传失败 ⇒ 保持未上报 ⇒ 下一拍再试（不丢结果）', async () => {
  const id = makeFinishedJob('retry');
  const seen = [];
  const failing = async (jobId) => {
    seen.push(jobId);
    return false;        // 模拟网络失败
  };
  await jobReporter.tick(failing);
  assert.ok(seen.includes(id), '第一拍试过了');
  assert.notEqual(getJob(id).status, 'reported', '失败 ⇒ 不许标已上报');
  await jobReporter.tick(failing);
  assert.ok(seen.filter((x) => x === id).length >= 2, '失败 ⇒ 下一拍再试');
});

test('GC-P27-24c · 「已回传过」的作业不再进待回传队列', () => {
  const id = 'pending-' + Date.now();
  appendJob({ id, serviceId: 'raw', status: 'reported', reportedAt: Date.now() });
  assert.ok(!jobsPendingReport().some((j) => j.id === id), '已回传 ⇒ 不再回传');

  const id2 = 'cancelled-' + Date.now();
  appendJob({ id: id2, serviceId: 'raw', status: 'cancelled', reportedAt: Date.now() });
  assert.ok(
    !jobsPendingReport().some((j) => j.id === id2),
    '★ 用户喊停的作业（已回传过）⇒ 不许再报一遍（服务端会回 409）',
  );

  const id3 = 'live-' + Date.now();
  appendJob({ id: id3, serviceId: 'raw', status: 'running' });
  assert.ok(jobsPendingReport().some((j) => j.id === id3), '还在跑的 ⇒ 在队列里');
});

// ===========================================================================
// GC-P27-25 · 失败要说清原因
// ===========================================================================

test('GC-P27-25 · 失败原因要说清（取消 / 非 0 退出码）', () => {
  const cancelled = { id: 'x', serviceId: 'raw', status: 'cancelled', exitCode: null };
  const r1 = buildJobReport(cancelled, [], rawService);
  assert.equal(r1.status, 'error');
  assert.ok(String(r1.error).includes('停止'), '取消的原因要说清');

  const failed = { id: 'x', serviceId: 'raw', status: 'running', exitCode: 2 };
  const r2 = buildJobReport(failed, [], rawService);
  assert.equal(r2.status, 'error');
  assert.ok(String(r2.error).includes('2'), '退出码要报出来');
  assert.equal(r2.exitCode, 2);

  const ok = { id: 'x', serviceId: 'raw', status: 'running', exitCode: 0 };
  const r3 = buildJobReport(ok, [], rawService);
  assert.equal(r3.status, 'ok');
});

test('GC-P27-25b · 整读日志能捞回「完成信号」（增量读可能已经吃掉了）', () => {
  // ⚠️ 这里**就地**注册一个「带完成信号」的 CLI 服务（框架一行不改 —— L-27i）。
  //   ⛔ 不 import `claudeService.ts`（带审批旁路标志的那个模块）。
  const { registerCliService } = cliServiceMod;
  registerCliService({
    id: 'test-signaled',
    title: '测试用的带完成信号服务',
    buildInvocation: () => null,
    parseOutput: (line) => {
      let obj;
      try { obj = JSON.parse(String(line).trim()); } catch (_) { return { type: 'text', text: line }; }
      if (!obj || typeof obj !== 'object') return { type: 'text', text: line };
      if (obj.type === 'result') {
        return {
          type: 'result',
          text: typeof obj.result === 'string' ? obj.result : '',
          isError: obj.is_error === true,
        };
      }
      return { type: 'text', text: String(obj.text || line) };
    },
    isComplete: (events) => events.some((e) => e && e.type === 'result'),
    summarize: (events) => {
      const r = events.find((e) => e && e.type === 'result');
      return r ? String(r.text || '') : '';
    },
  });

  const id = 'events-' + Date.now();
  const outputFile = jobLogFile(id);
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(
    outputFile,
    [
      JSON.stringify({ type: 'assistant', text: '我在干活' }),
      JSON.stringify({ type: 'result', result: '干完了', is_error: false }),
      '',
    ].join('\n'),
    'utf8',
  );
  appendJob({ id, serviceId: 'test-signaled', status: 'running', pid: 999999, outputFile, outputOffset: 0 });

  const events = readAllJobEvents(getJob(id));
  assert.equal(events.length, 2, '两行都读到了');
  assert.equal(events[1].type, 'result');
  assert.equal(events[1].text, '干完了');
  assert.ok(
    events.some((e) => e && e.type === 'result'),
    '★ 完成信号 = result 事件（不是进程退出）',
  );
});

// ===========================================================================
// GC-P27-26 · ★ 同步派单行为逐字不变 + 接线（源码文本断言）
// ===========================================================================

test('GC-P27-26 · ★ 设备通道按 mode 分流（background 走另一条路，sync 逐字不变）', () => {
  const src = readSrc('electron/client-tools/deviceClient.ts');
  assert.ok(
    src.includes("req.mode === 'background'"),
    '★ 设备通道必须按 mode 分流（L-27a）',
  );
  assert.ok(
    src.includes('handleBackgroundDispatch'),
    'background 派单必须走专门的分支',
  );
  // 同步那条路：执行完 → markDone → 回传（原样保留）。
  const syncTail = src.slice(src.indexOf("if (req.mode === 'background')"));
  assert.ok(syncTail.includes('markDone(pendingId)'), '同步路径仍要打去重标');
  assert.ok(syncTail.includes('uploadResult(pendingId, withUrls)'), '同步路径仍要回传结果');
});

test('GC-P27-26b · ★ 端侧把作业的 job_id 对齐到 pending_id（两边对得上账）', () => {
  const src = readSrc('electron/client-tools/deviceClient.ts');
  assert.ok(
    src.includes('pendingId: req.pending_id'),
    '★ 执行端侧工具时必须把 pending_id 传进去（= job_id）',
  );
  // executor → backgroundJobs → startJob 这条链也得把 job_id 一路带下去。
  const ex = readSrc('electron/client-tools/executor.ts');
  assert.ok(
    ex.includes('jobId: opts?.pendingId ?? null'),
    '★ executor 必须把 pendingId 当 job_id 传给后台作业分支',
  );
  const bg = readSrc('electron/client-tools/backgroundJobs.ts');
  assert.ok(
    bg.includes('input.jobId'),
    '后台作业分支必须用传进来的 job_id（不自己另生成）',
  );
});

test('GC-P27-26c · ★ 能力表**恒定**带 job 键（执行器是 app 内建的，不看 claude）', () => {
  const src = readSrc('electron/client-tools/deviceClient.ts');
  assert.ok(src.includes('probeJobExecutor'), '探针留着做诊断');
  assert.ok(src.includes('buildCapabilityString'), '能力串由 jobCapability 拼');
  assert.ok(
    src.includes('buildCapabilityString({ pty, job: true })'),
    '★ 能力**恒定**声明 job=1（执行器内建 ⇒ 不按 claude 的有无来决定）',
  );
  assert.ok(
    !src.includes('job: job.executor') && !src.includes('job: probe.executor'),
    '⛔ 不许把探针结果（或 claude 的有无）绑进能力判定',
  );
  const cap = readSrc('electron/client-tools/jobCapability.ts');
  assert.ok(cap.includes('job=1'), '★ 装了执行器要声明 job=1（L-27j）');
  assert.ok(
    cap.includes('不许') && cap.includes('claude'),
    '判据里必须写明「不许把 claude 的有无绑进来」（L-27j + 协调者纠正）',
  );
});

test('GC-P27-26d · IPC 三个口都接上了（listJobs / stopJob / onJobs）', () => {
  const ipc = readSrc('electron/client-tools/ipc.ts');
  assert.ok(ipc.includes('gacode:client-tool-list-jobs'), 'listJobs 要有频道');
  assert.ok(ipc.includes('gacode:client-tool-stop-job'), 'stopJob 要有频道');
  assert.ok(ipc.includes('gacode:client-tool-jobs'), 'onJobs 要有频道');
  assert.ok(ipc.includes('jobReporter.start('), '★ 主进程里要起巡检（跑完 ⇒ 回传）');

  const preload = readSrc('electron/preload.ts');
  assert.ok(preload.includes('listJobs:'), 'preload 要暴露 listJobs');
  assert.ok(preload.includes('stopJob:'), 'preload 要暴露 stopJob');
  assert.ok(preload.includes('onJobs:'), 'preload 要暴露 onJobs');

  const shared = readSrc('shared/types.ts');
  assert.ok(shared.includes('listJobs: () => Promise<LocalJobInfo[]>;'), 'listJobs 必填');
  assert.ok(shared.includes('stopJob: (jobId: string)'), 'stopJob 必填');
  assert.ok(shared.includes('onJobs: (callback: (jobs: LocalJobInfo[]) => void)'), 'onJobs 必填');
  assert.ok(!shared.includes('listJobs?:'), '★ 不许再是可选方法');
});

// ===========================================================================
// GC-P27-27 · 作业状态的**语义**（2026-11-13 修）
//
// 旧写法: pollJob 里 `status: reported ? 'reported' : 'failed'`
// ⇒ 一个**成功**的作业在「跑完 → 回传成功」那几秒里被标成 failed
// ⇒ PC 界面显示「失败」（用户明明看到 Claude Code 干完了）⇒ 最不该出现的那种不一致。
// ⇒ 修: 只有**真的失败**（退出码非 0 / 服务判出错）才标 failed；
//    成功的那条在回传成功前保持 running；已终态的（reported/cancelled/failed）不被改写。
// ===========================================================================

test('GC-P27-27 · 跑完但还没回传的**成功**作业 ⇒ 不许被标成 failed', async () => {
  const { pollJob } = await import('../electron/client-tools/jobRunner.ts');
  const { appendJob, getJob, updateJob } = await import('../electron/client-tools/localJobs.ts');

  const id = 'ok-' + Date.now();
  // 进程已经不在了（alive=false ⇒ done=true），退出码 0（成功）
  appendJob({
    id, serviceId: 'raw', status: 'running',
    pid: 999999, outputFile: null, outputOffset: 0, exitCode: 0,
  });
  const polled = pollJob(getJob(id));
  assert.notEqual(
    polled.job.status, 'failed',
    '★ 成功的作业在回传前显示「失败」= 用户看到「Claude Code 干完了但界面说失败」',
  );
  assert.equal(polled.job.status, 'running', '成功但还没回传 ⇒ 保持 running（回传后由巡检标 reported）');
});

test('GC-P27-27b · 真的失败（退出码非 0）⇒ 该标 failed', async () => {
  const { pollJob } = await import('../electron/client-tools/jobRunner.ts');
  const { appendJob, getJob } = await import('../electron/client-tools/localJobs.ts');

  const id = 'bad-' + Date.now();
  appendJob({
    id, serviceId: 'raw', status: 'running',
    pid: 999999, outputFile: null, outputOffset: 0, exitCode: 2,
  });
  const polled = pollJob(getJob(id));
  assert.equal(polled.job.status, 'failed', '退出码非 0 ⇒ 该标 failed');
});

test('GC-P27-27c · 已被用户停掉的作业 ⇒ 不许被 poll 改成 failed', async () => {
  const { pollJob } = await import('../electron/client-tools/jobRunner.ts');
  const { appendJob, getJob } = await import('../electron/client-tools/localJobs.ts');

  const id = 'cancelled-' + Date.now();
  appendJob({
    id, serviceId: 'raw', status: 'cancelled',
    pid: 999999, outputFile: null, outputOffset: 0, exitCode: null,
  });
  const polled = pollJob(getJob(id));
  assert.equal(polled.job.status, 'cancelled', '★ 已终态（cancelled）不许被改写成 failed');
});

test('GC-P27-27d · 已回传的作业 ⇒ 不许被 poll 改回去', async () => {
  const { pollJob } = await import('../electron/client-tools/jobRunner.ts');
  const { appendJob, getJob } = await import('../electron/client-tools/localJobs.ts');

  const id = 'reported-' + Date.now();
  appendJob({
    id, serviceId: 'raw', status: 'reported',
    pid: 999999, outputFile: null, outputOffset: 0, exitCode: 0,
  });
  const polled = pollJob(getJob(id));
  assert.equal(polled.job.status, 'reported', '★ 已回传（完事）不许被改写');
});
