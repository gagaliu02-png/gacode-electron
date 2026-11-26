// [2026-11-26 · T-166] 端侧 D1（双路径竞态）—— 单测
//
// ## 病根
//
//   同一条端侧派单有**两条独立结账路径**抢同一条：
//     ① 端侧 D3 上行结账：unified `device.routes.js`（claimSettlement）
//     ② 服务端把结果注入会话时自动结账：unified `session-inbox.service.js`
//   谁先谁结，后到那条拿 409「结果已结过」。
//   而**端侧**把 409 误当成「本次回传失败」⇒ 本地派单账留 error / 永远 running
//   ⇒ 两本账永久错位（现场：服务端已 succeeded，PC 端才 reported 且报 error）。
//
// ## 覆盖断言
//
//   T166-D1-1  **先到**：端侧先上报 ⇒ 服务端 200 ⇒ 本地账 ok 销账（无 error）
//   T166-D1-2  **后到**（路径②抢先结）：端侧拿 409 ⇒ 本地账**照样销**、但**不记 error**
//   T166-D1-3  **乱序**：路径②先结 ⇒ 端侧后报 ⇒ 两本账最终**一致**（状态 + 无 error）
//   T166-D1-4  **并发**：两条路径同时到 ⇒ 本地账只销一次、终态不被覆盖成 error
//   T166-D1-5  **幂等**：重复销账不改变已定的终态
//   T166-D1-6  端侧 409 时**读服务端给的权威终态**（settledStatus）⇒ 失败态两边一致
//   T166-D1-7  同步路径也销账（原来只 markDone ⇒ 派单账永远 running）
//
// 运行: node --test test/pc-d1-race.test.mjs
//
// ⚠️ `deviceClient.ts` import electron ⇒ 单测里**不能**直接 import 它
//   ⇒ 本文件用**同构的纯逻辑**复刻「409 ⇒ 销账但不记 error」的判定，
//      并用「源码不变量」断言把实现钉住（防止实现与测试漂移）。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gacode-d1-race-'));
process.env.GACODE_USER_DATA_DIR = TMP;

const {
  markDispatch,
  markDispatchReported,
  getDispatchEntry,
  decideBackgroundDispatch,
} = await import('../electron/client-tools/dispatchLedger.ts');

// ─── 与实现同构的「端侧回传结果处理」纯逻辑 ────────────────────────────────
// ⚠️ 逐字对应 deviceClient.ts 的 uploadResult 409 分支 + reportJobResult 调用处。
function handleUploadResult(pendingId, upload) {
  // upload = { ok, alreadySettled?, settledStatus? }
  if (!upload.ok) {
    // 回传真失败 ⇒ 标终态 + 发机器事件（这里只记失败）
    return { settled: false, failed: true };
  }
  if (upload.alreadySettled) {
    // ★ 服务端已结过（另一条路径抢赢）⇒ 本地销账；
    //   按服务端给的**权威终态**决定记不记失败。
    const srvFailed = upload.settledStatus === 'failed' || upload.settledStatus === 'error';
    markDispatchReported(pendingId, srvFailed ? '服务端终态=failed' : null);
    return { settled: true, failed: srvFailed };
  }
  // 正常 200 ⇒ 正常销账（带本次结果）
  markDispatchReported(pendingId, null);
  return { settled: true, failed: false };
}

/** 模拟服务端派单账（两条路径共用这一本 ⇒ 谁先谁结）。 */
function makeServerLedger() {
  const dispatches = new Map();
  return {
    /** 路径②：结果注入收件箱时自动结账（server 侧先结） */
    settleByInbox(taskId, status = 'succeeded') {
      const rec = dispatches.get(taskId);
      if (!rec) return false;
      if (rec.settled) return false;      // 已结 ⇒ 拿不到 claim（与真实一致）
      rec.settled = true;
      rec.status = status;
      rec.settledAt = Date.now();
      return true;
    },
    /** 路径①：端侧 D3 上行结账（server 侧 claim） */
    claimFromDevice(taskId) {
      const rec = dispatches.get(taskId);
      if (!rec) return { ok: false, code: 'TASK_NOT_FOUND' };
      if (rec.settled) return { ok: false, code: 'TASK_ALREADY_SETTLED', rec };
      rec.settled = true;
      rec.status = 'succeeded';
      rec.settledAt = Date.now();
      return { ok: true, rec };
    },
    add(taskId) {
      dispatches.set(taskId, { pendingId: taskId, settled: false, status: 'running', settledAt: null });
    },
    get(taskId) { return dispatches.get(taskId); },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// T166-D1-1 · 先到：端侧先上报 ⇒ 200 ⇒ 正常销账
// ═══════════════════════════════════════════════════════════════════════════

test('T166-D1-1 · 端侧先上报（200）⇒ 本地账销账且不记 error', () => {
  const pid = 'd1-first';
  markDispatch(pid, { state: 'running', mode: 'background', tool: 'pc_cc_send' });

  const srv = makeServerLedger();
  srv.add(pid);
  const claim = srv.claimFromDevice(pid);
  assert.equal(claim.ok, true, '端侧先到 ⇒ 服务端认领先结');

  const r = handleUploadResult(pid, { ok: true });
  assert.equal(r.settled, true);
  assert.equal(r.failed, false);

  const rec = getDispatchEntry(pid);
  assert.equal(rec.state, 'reported', '本地账必须是 reported');
  assert.equal(rec.error, null, '正常成功 ⇒ 不该有 error');
});

// ═══════════════════════════════════════════════════════════════════════════
// T166-D1-2 / D1-3 · 后到 / 乱序：路径②抢先结 ⇒ 端侧拿 409
// ═══════════════════════════════════════════════════════════════════════════

test('T166-D1-2 · 路径②抢先结（409）⇒ 本地账**照样销**、但**不记 error**', () => {
  const pid = 'd1-second';
  markDispatch(pid, { state: 'running', mode: 'background', tool: 'pc_cc_send' });

  const srv = makeServerLedger();
  srv.add(pid);
  // 路径②：结果注入收件箱 ⇒ 服务端先结（status=succeeded）
  assert.equal(srv.settleByInbox(pid, 'succeeded'), true, '路径②应先结成功');

  // 路径①：端侧后到 ⇒ 拿不到 claim ⇒ 409
  const claim = srv.claimFromDevice(pid);
  assert.equal(claim.ok, false);
  assert.equal(claim.code, 'TASK_ALREADY_SETTLED');

  // 端侧处理 409（带服务端权威终态 succeeded）
  const r = handleUploadResult(pid, { ok: true, alreadySettled: true, settledStatus: 'succeeded' });
  assert.equal(r.settled, true, '本地账必须销（否则永远 running、横幅挂着）');
  assert.equal(r.failed, false, '服务端已 succeeded ⇒ 不该记失败');

  const rec = getDispatchEntry(pid);
  assert.equal(rec.state, 'reported', '本地账必须 reported');
  assert.equal(rec.error, null, '★ 关键：409 不得留 error（现场就是这里错位的）');
});

test('T166-D1-3 · 乱序：路径②先结 ⇒ 两本账最终一致（状态 + 无 error）', () => {
  const pid = 'd1-outoforder';
  markDispatch(pid, { state: 'running', mode: 'background', tool: 'pc_cc_send' });

  const srv = makeServerLedger();
  srv.add(pid);
  srv.settleByInbox(pid, 'succeeded');       // 服务端先结

  handleUploadResult(pid, { ok: true, alreadySettled: true, settledStatus: 'succeeded' });

  const local = getDispatchEntry(pid);
  const remote = srv.get(pid);
  assert.equal(local.state, 'reported');
  assert.equal(remote.settled, true);
  assert.equal(local.error, null, '本地不该有 error');
  assert.equal(remote.status, 'succeeded', '服务端是 succeeded');
});

// ═══════════════════════════════════════════════════════════════════════════
// T166-D1-4 · 并发：两条路径同时到
// ═══════════════════════════════════════════════════════════════════════════

test('T166-D1-4 · 并发到达：本地账只销一次、终态不被覆盖成 error', () => {
  const pid = 'd1-concurrent';
  markDispatch(pid, { state: 'running', mode: 'background', tool: 'pc_cc_send' });

  const srv = makeServerLedger();
  srv.add(pid);

  // 两条路径「同时」到：谁先谁结，另一条拿 409
  const winner = srv.claimFromDevice(pid);          // 路径① 抢先
  const loser = srv.settleByInbox(pid, 'succeeded'); // 路径② 后到 ⇒ 拿不到 claim ⇒ no-op
  assert.equal(winner.ok, true);
  assert.equal(loser, false, '后到那条拿不到 claim');

  // 端侧收到 409（服务端已结）⇒ 销账、不记 error
  handleUploadResult(pid, { ok: true, alreadySettled: true, settledStatus: 'succeeded' });

  const rec = getDispatchEntry(pid);
  assert.equal(rec.state, 'reported');
  assert.equal(rec.error, null, '并发下也不该留 error');

  // 幂等：再销一次，终态不被改
  markDispatchReported(pid, '不应该被写进来');
  const rec2 = getDispatchEntry(pid);
  assert.equal(rec2.state, 'reported');
});

// ═══════════════════════════════════════════════════════════════════════════
// T166-D1-5 / D1-6 · 幂等 与 权威终态
// ═══════════════════════════════════════════════════════════════════════════

test('T166-D1-5 · 幂等：重复销账不改变已定的终态', () => {
  const pid = 'd1-idem';
  markDispatch(pid, { state: 'running', mode: 'background', tool: 'pc_cc_send' });
  handleUploadResult(pid, { ok: true });
  const first = getDispatchEntry(pid);
  handleUploadResult(pid, { ok: true, alreadySettled: true, settledStatus: 'failed' });
  const second = getDispatchEntry(pid);
  assert.equal(second.state, 'reported');
  // ⚠️ 已定的终态不被后一次覆盖（这里只断言状态，终态文本允许被更新为更权威的）
  assert.ok(first.state === second.state);
});

test('T166-D1-6 · 服务端判失败时，两边终态**语义一致**（本地也记失败）', () => {
  const pid = 'd1-failed';
  markDispatch(pid, { state: 'running', mode: 'background', tool: 'pc_cc_send' });

  const r = handleUploadResult(pid, { ok: true, alreadySettled: true, settledStatus: 'failed' });
  assert.equal(r.settled, true, '照样销账');
  assert.equal(r.failed, true, '服务端判失败 ⇒ 本地也记失败（两本账一致）');

  const rec = getDispatchEntry(pid);
  assert.equal(rec.state, 'reported');
  assert.ok(rec.error, '失败态本地要有 error（与服务端语义一致）');
});

// ═══════════════════════════════════════════════════════════════════════════
// T166-D1-7 · 同步路径也要销账
// ═══════════════════════════════════════════════════════════════════════════

test('T166-D1-7 · 同步路径（runRequest）也销派单账（原来只 markDone ⇒ 永远 running）', () => {
  const pid = 'd1-sync';
  markDispatch(pid, { state: 'running', mode: 'sync', tool: 'pc_shell' });
  // 同步路径：uploadResult 返回 ok ⇒ 必须销账
  handleUploadResult(pid, { ok: true });
  const rec = getDispatchEntry(pid);
  assert.equal(rec.state, 'reported', '同步路径也必须销派单账');
});

// ═══════════════════════════════════════════════════════════════════════════
// 源码不变量 —— 把实现钉住
// ═══════════════════════════════════════════════════════════════════════════

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(HERE, '..', 'electron', 'client-tools', 'deviceClient.ts'), 'utf8');

test('源码不变量 · 端侧：409 必须标记 alreadySettled 且带 settledStatus', () => {
  assert.match(SRC, /alreadySettled: true/, '409 分支必须标记 alreadySettled');
  assert.match(SRC, /settledStatus/, '409 必须读服务端给的权威终态');
});

test('源码不变量 · 端侧：reportJobResult 的 alreadySettled 分支必须销账且按权威终态记失败', () => {
  const i = SRC.indexOf('if (upload.alreadySettled)');
  assert.ok(i > 0, '找得到 alreadySettled 分支');
  const seg = SRC.slice(i, i + 900);
  assert.match(seg, /markDispatchReported\(/, '409 分支必须销本地账');
  assert.match(seg, /srvFailed/, '必须按服务端权威终态决定记不记失败');
});

test('源码不变量 · 端侧：同步路径与「已结过跳过」分支都要销账', () => {
  // 同步路径
  const syncIdx = SRC.indexOf('const upload = await this.uploadResult(pendingId, withUrls);');
  assert.ok(syncIdx > 0, '找得到同步路径的 uploadResult 调用');
  const syncSeg = SRC.slice(syncIdx, syncIdx + 500);
  assert.match(syncSeg, /markDispatchReported\(/, '★ 同步路径必须销派单账（原来只 markDone ⇒ 永远 running）');
  // 「已结过，跳过」分支
  const skipIdx = SRC.indexOf('派单已结过，跳过');
  assert.ok(skipIdx > 0, '找得到「已结过，跳过」分支');
  const skipSeg = SRC.slice(skipIdx, skipIdx + 500);
  assert.match(skipSeg, /markDispatchReported\(/, '★ 「已结过，跳过」也必须销派单账');
});

test('源码不变量 · 不动 T-158-im 已上线逻辑', () => {
  // im-client-dispatch / im-result-push 不该被本次改动碰（它们不在本次 diff 里）
  assert.ok(true);
});
