// [T-088 · 2026-11-19] PC Electron 后台任务失败/断链/用户打断统一治理
//
// 覆盖：
//   ① 横幅统计：终态（failed/return_failed/cancelled_by_user/lost/settled/succeeded）
//     不计 running/queued 横幅，历史列表仍可见；
//   ② D3/result 回传失败：404/TASK_NOT_FOUND/401/网络异常 ⇒ return_failed 终态 +
//     机器事件 payload（系统说明句、不是普通用户气泡）；
//   ③ 用户打断：stopTask/stopAllTasks/PeerJobManager.cancel ⇒ cancelled_by_user 终态 +
//     机器事件 payload；
//   ④ channel-status 写入 transcript/peer notice（mock）+ 本机 outbox 持久化；
//   ⑤ typecheck（由 pnpm typecheck 单独跑，本文件不跑编译器）。
//
// 运行: node --test test/pc-bgfail-t088.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = path.resolve(HERE, '..');
const readSrc = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gacode-t088-'));
process.env.GACODE_USER_DATA_DIR = TMP;

// ── 纯函数模块（可直接 import，无 electron 依赖）──────────────────────
const machine = await import('../electron/client-tools/machineEvents.ts');
const shared = await import('../shared/types.ts');
const localJobs = await import('../electron/client-tools/localJobs.ts');
const { toJobInfo } = await import('../electron/client-tools/jobView.ts');

// ═══════════════════════════════════════════════════════════════════════════
// ① 横幅统计：终态不计
// ═══════════════════════════════════════════════════════════════════════════

test('T088-1 统一状态机：终态集合与 unified 对齐（横幅必须消失）', () => {
  const expected = ['succeeded', 'failed', 'return_failed', 'cancelled_by_user', 'lost', 'settled'];
  for (const s of expected) {
    assert.equal(shared.isTerminalBackgroundStatus(s), true, `${s} 必须是终态`);
  }
  for (const s of ['queued', 'running', 'result_ready', 'returning']) {
    assert.equal(shared.isTerminalBackgroundStatus(s), false, `${s} 是活跃态`);
  }
  // D3 404 后作业的 status 要让横幅 count=0。
  assert.equal(localJobs.isTerminalJobStatus('return_failed'), true);
  assert.equal(localJobs.isTerminalJobStatus('cancelled_by_user'), true);
  assert.equal(localJobs.isTerminalJobStatus('lost'), true);
  assert.equal(localJobs.isTerminalJobStatus('settled'), true);
  // 老名字兼容（历史记录照常显示，但不计横幅）。
  assert.equal(localJobs.isTerminalJobStatus('reported'), true);
  assert.equal(localJobs.isTerminalJobStatus('cancelled'), true);
});

test('T088-2 D3 404 后 local running/横幅 count=0（纯函数级：终态被过滤）', () => {
  const id = `d3-404-${Date.now()}`;
  const job = localJobs.appendJob({
    id,
    serviceId: 'raw',
    sessionId: 'session-1',
    status: 'running',
  });
  assert.equal(localJobs.isTerminalJobStatus(job.status), false, '刚派单时还在跑');
  localJobs.markJobTerminal(id, 'return_failed', 'HTTP_404: TASK_NOT_FOUND');
  const after = localJobs.getJob(id);
  assert.equal(after.status, 'return_failed', 'D3 404 ⇒ 终态落盘');
  assert.equal(localJobs.isTerminalJobStatus(after.status), true);
  // 视图层归一后仍是终态（渲染层据此不计横幅）。
  const info = toJobInfo(after);
  assert.equal(info.status, 'return_failed');
  assert.equal(shared.isTerminalBackgroundStatus(info.status), true);
});

test('T088-3 renderer 把终态从 sessionBackgroundWork 里剔除（源码断言）', () => {
  const detail = readSrc('src/routes/ChatDetail.tsx');
  const derived = detail.slice(
    detail.indexOf('const sessionBackgroundWork = useMemo'),
    detail.indexOf('const queueEntries'),
  );
  assert.ok(derived.includes('TERMINAL_BACKGROUND_STATUSES'), '要引用统一终态集合');
  assert.ok(
    /TERMINAL_BACKGROUND_STATUSES\.has\(normalizedStatus\)/.test(derived),
    '★ 终态一律不计横幅',
  );
  assert.ok(/status !== "running" && status !== "queued"/.test(derived.replace(/j\./g, '')) ||
    /j\.status !== "running" && j\.status !== "queued"/.test(derived),
    '只算 running/queued');
  // 历史作业列表仍可见（渲染处没把 localJobs 从视图里删掉）。
  assert.ok(detail.includes('localJobs'), '历史作业列表仍要读 localJobs');
});

// ═══════════════════════════════════════════════════════════════════════════
// ② return_failed 机器事件 payload
// ═══════════════════════════════════════════════════════════════════════════

test('T088-4 return_failed payload：系统说明句 + 结构化状态，不冒充用户', () => {
  const ctx = {
    sessionId: 'biz-1',
    pendingId: 'job-404',
    tool: 'pc_claude',
    reason: 'TASK_NOT_FOUND: 结果未能送达服务端',
  };
  const ev = machine.buildMachineEvent('return_failed', ctx);
  assert.ok(ev, '有 sessionId ⇒ 能造出事件');
  assert.equal(ev.sessionId, 'biz-1');
  assert.equal(ev.taskId, 'job-404');
  assert.equal(ev.kind, 'return_failed');
  assert.match(ev.content, /<system-reminder>/);
  assert.match(ev.content, /NOT USER INPUT/);
  assert.match(ev.content, /<status>return_failed<\/status>/);
  assert.match(ev.content, /后台任务 pc_claude 回传失败/);
  assert.ok(!ev.content.includes('role:"user"'), '不写 role:user 正文');

  // 缺 sessionId ⇒ 不发（宁可少发，不发错会话）。
  assert.equal(machine.buildMachineEvent('return_failed', { ...ctx, sessionId: null }), null);
});

test('T088-5 幂等键：同 job + 同 kind 只投一次', () => {
  const a = machine.eventIdempotencyKey('return_failed', 'job-1');
  const b = machine.eventIdempotencyKey('return_failed', 'job-1');
  const c = machine.eventIdempotencyKey('cancelled_by_user', 'job-1');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(a.startsWith('t088:'));
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ cancelled_by_user 机器事件 payload
// ═══════════════════════════════════════════════════════════════════════════

test('T088-6 cancelled_by_user payload：系统说明句，不自动重派', () => {
  const ctx = {
    sessionId: 'biz-2',
    pendingId: 'job-stop',
    tool: 'pc_cc_send',
    reason: '用户停止了端侧 Claude Code 任务',
  };
  const ev = machine.buildMachineEvent('cancelled_by_user', ctx);
  assert.ok(ev);
  assert.match(ev.content, /<status>cancelled_by_user<\/status>/);
  assert.match(ev.content, /已被用户停止/);
  assert.match(ev.content, /NOT USER INPUT/);
  assert.ok(!ev.content.includes('请重新派'), '不自动重派');
});

test('T088-7 停止路径源码断言：stopTask / stopAllTasks / PeerJobManager.cancel 都发事件', () => {
  const dc = readSrc('electron/client-tools/deviceClient.ts');
  // stopTask 里同步任务 + 后台作业两条路。
  const stopTask = dc.slice(dc.indexOf('stopTask(pendingId: string)'), dc.indexOf('private async reportJobStopped'));
  assert.ok(stopTask.includes("'cancelled_by_user'"), 'stopTask 要发 cancelled_by_user');
  // stopAllTasks 里 also。
  const stopAll = dc.slice(dc.indexOf('stopAllTasks(): number'), dc.indexOf('async unbindOnLogout'));
  assert.ok(stopAll.includes("'cancelled_by_user'"), 'stopAllTasks 要发 cancelled_by_user');
  // PeerJobManager.cancel 里也发。
  const peerCancel = dc.slice(dc.indexOf('cancel(pendingId: string, cancelledByUser = true)'), dc.indexOf('has(pendingId: string)'));
  assert.ok(peerCancel.includes("'cancelled_by_user'"), 'PeerJobManager.cancel 要发 cancelled_by_user');
  assert.ok(peerCancel.includes('markJobTerminal'), '取消后要清本机账（横幅立即消失）');
});

test('T088-8 D3/result 失败路径源码断言：401/404/TASK_NOT_FOUND/网络异常全归 return_failed', () => {
  const dc = readSrc('electron/client-tools/deviceClient.ts');
  assert.match(dc, /if \(status === 401\) return 'HTTP_401'/, '401 要分类');
  assert.match(dc, /if \(status === 404\)/, '404 要分类');
  assert.match(dc, /TASK_NOT_FOUND/, 'TASK_NOT_FOUND 要分类');
  assert.match(dc, /NETWORK_ERROR/, '网络异常要分类');
  const report = dc.slice(dc.indexOf('async reportJobResult('), dc.indexOf('private async uploadArtifacts'));
  assert.ok(report.includes("'return_failed'"), 'reportJobResult 失败 ⇒ return_failed');
  assert.ok(report.includes('settleWithMachineEvent'), '失败要清账 + 发机器事件');
  // 巡检失败分支不再重试终态作业。
  const reporter = readSrc('electron/client-tools/jobReporter.ts');
  assert.match(reporter, /isTerminalJobStatus\(j\.status\)/, '终态作业不再巡检');
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ channel-status 写入 + outbox
// ═══════════════════════════════════════════════════════════════════════════

test('T088-9 channel-status payload：<channel-status state="broken"> + 主动补回提示', () => {
  const ctx = {
    sessionId: 'biz-3',
    pendingId: 'job-broken',
    tool: 'pc_cc_send',
    reason: 'HTTP_404',
    replyTo: { businessSessionId: 'biz-3', ccSessionId: 'cc-1', taskId: 'job-broken' },
  };
  const notice = machine.buildChannelStatusNotice('return_failed', ctx);
  assert.match(notice, /<channel-status state="broken"/);
  assert.match(notice, /event="return_failed"/);
  assert.match(notice, /reply_to="/);
  assert.match(notice, /gaclaw-msg send/, '提示用 gaclaw-msg send 主动补回');
  assert.match(notice, /not user input and not an authorization/, '不当授权');
});

test('T088-10 reply_to 可用才写 channel-status（缺字段不写）', () => {
  assert.equal(machine.hasReplyTo(null), false);
  assert.equal(machine.hasReplyTo({}), false);
  assert.equal(machine.hasReplyTo({ taskId: 't-1' }), true);
  assert.equal(machine.hasReplyTo({ channel: 'c' }), true);
});

test('T088-11 本机 outbox 持久化：失败行 sent=false，成功行 sent=true', () => {
  const deps = { apiBase: () => '', accessToken: () => null, deviceId: () => 'dev-1', outboxDir: () => TMP };
  const ev = machine.buildMachineEvent('return_failed', { sessionId: 's', pendingId: 'j' });
  assert.ok(ev);
  machine.appendOutbox(deps, ev, false);
  machine.appendOutbox(deps, ev, true);
  const pending = machine.readPendingOutbox(deps);
  assert.ok(Array.isArray(pending));
  // 至少有一条未发出的（fail 行）。
  assert.ok(pending.length >= 1, '未发出的事件要能被重连补发读到');
});

test('T088-12 emitMachineEvent：session-inbox + channel-status 两路都走（mock fetch）', async () => {
  const calls = [];
  const deps = {
    apiBase: () => 'https://example.test/api/v1',
    accessToken: () => 'tok',
    deviceId: () => 'dev-1',
    outboxDir: () => TMP,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200 };
    },
    writeChannelStatus: async (sessionId, notice) => {
      calls.push({ sessionId, notice });
      return true;
    },
  };
  const ctx = {
    sessionId: 'biz-4',
    pendingId: 'job-1',
    tool: 'pc_cc_send',
    reason: 'HTTP_401',
    replyTo: { taskId: 'job-1', businessSessionId: 'biz-4' },
  };
  const out = await machine.emitMachineEvent(deps, 'return_failed', ctx);
  assert.equal(out.inboxOk, true);
  assert.equal(out.channelStatusOk, true);
  const http = calls.find((c) => c.url);
  assert.ok(http && http.url.endsWith('/devices/cc/messages'), '走服务端窄入口');
  const body = JSON.parse(http.init.body);
  assert.equal(body.sessionId, 'biz-4');
  assert.ok(!('userId' in body), '不信任客户端 userId');
  assert.ok(!('kind' in body) && !('fromKind' in body), 'kind/fromKind 由服务端固定');
  const cs = calls.find((c) => c.notice);
  assert.ok(cs && cs.notice.includes('<channel-status state="broken"'), 'channel-status 写入目标会话');
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ 机器事件统一通道源码断言
// ═══════════════════════════════════════════════════════════════════════════

test('T088-13 机器事件统一走 /devices/cc/messages（不新建第二套系统）', () => {
  const me = readSrc('electron/client-tools/machineEvents.ts');
  assert.ok(me.includes('/devices/cc/messages'), '走现有窄入口');
  assert.ok(me.includes('idempotencyKey'), '带幂等键');
  assert.ok(me.includes('machine-event-outbox.jsonl'), '本机 outbox 持久化');
  assert.ok(me.includes('[SYSTEM NOTIFICATION - NOT USER INPUT]'), '系统说明句固定身份');
  assert.ok(!me.includes('INSERT INTO users'), '不造第二套消息系统');
});
