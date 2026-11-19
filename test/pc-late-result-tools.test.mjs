// [2026-11-19 · T-068 / T-072] `pc_cc_send` 后台 job 化的回归断言（替代 T-042「立即回传」）
//
// 契约：
//   · `pc_cc_send` 的「已投递」回执**不许**走 D3 立即回传；
//   · handler 只 markDispatch(running)，真结果由 peerJobManager 在
//     notice / 慢 poll / 24h 超时时裁决后调 reportJobResult 一次；
//   · 只有「起作业失败」才立即回传失败（老路径不变）；
//   · detached 作业类工具（pc_shell 等）依旧只标 running，不许提前报成功。
//
// 运行: node --test test/pc-late-result-tools.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'electron/client-tools/deviceClient.ts');
const EXEC = path.join(ROOT, 'electron/client-tools/executor.ts');
const IPC = path.join(ROOT, 'electron/client-tools/ipc.ts');

function codeOnly(file) {
  return fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const src = codeOnly(SRC);
const exec = codeOnly(EXEC);
const ipc = codeOnly(IPC);

test('T068-P1 ⛔ 不再有 LATE_RESULT_TOOLS「立即把已投递当结果回传」的分支', () => {
  assert.ok(!src.includes('LATE_RESULT_TOOLS'), 'T-042 的立即回传清单必须删除');
  // 成功路径只标 running + emitJobsChanged + return（中间不许 reportJobResult）
  const start = src.indexOf('async handleBackgroundDispatch');
  const branch = src.slice(start, start + 3500);
  const success = branch.slice(branch.indexOf('if (result.status'));
  const mark = success.indexOf("markDispatch(pendingId, { state: 'running' })");
  assert.ok(mark > 0, '成功路径必须标 running');
  const tail = success.slice(mark, success.indexOf('return;', mark) + 'return;'.length);
  assert.ok(!tail.includes('reportJobResult('), '成功（含 pc_cc_send）不许在 handler 里立即回传');
  assert.match(tail, /markDispatch\([\s\S]{0,120}emitJobsChanged\(\);[\s\S]{0,40}return;/,
    'detached 作业路径：markDispatch → emitJobsChanged → return');
});

test('T068-P2 ★ pcCcSend 投递 + 订阅后立即返回；不前台等结果', () => {
  assert.match(exec, /claudeCodePeerInbox\.register\(\{/, '必须先登记 msgId 映射');
  assert.match(exec, /sendPeerControl\(sessionId, ['"]notify_when_idle['"]/, '必须发订阅帧');
  assert.match(exec, /peerJobManager\.track\(/, '必须把 job 交给后台管理器');
  assert.ok(!exec.includes('watchClaudeSessionResult'), 'pc_cc_send 不再前台 await watcher');
  assert.ok(!exec.includes('PC_CC_SEND_WAIT_TIMEOUT_MS'), '旧的 9 分钟等待上限必须删除');
  // 先 register 再 sendPeerControl（顺序契约）
  assert.ok(
    exec.indexOf('claudeCodePeerInbox.register({') < exec.indexOf("sendPeerControl(sessionId, 'notify_when_idle'"),
    'inbox 映射必须在订阅帧之前登记',
  );
});

test('T068-P3 ★ peer-job 管理器：notice/poll/超时只回传一次；取消走 cancelledByUser', () => {
  assert.match(src, /const PEER_JOB_DEADLINE_MS = 24 \* 60 \* 60 \* 1000/, '24h deadline');
  assert.match(src, /const PEER_JOB_POLL_MS = 45_000/, '慢 poll 45s 兜底');
  assert.match(src, /hit\.task_id === job\.taskId/, '只认 task_id 匹配的结果块');
  assert.match(src, /cancelledByUser: true/, '用户停止要带 cancelledByUser');
  assert.match(src, /recoverOrphans\(\)/, '启动清扫孤儿');
  assert.match(src, /if \(!job \|\| job\.settled\) return;/, '回传只能一次');
});

test('T068-P4 ★ stopTask / stopAllTasks 接上 peer-job 取消；IPC 启动接线', () => {
  assert.match(src, /stopTask\(pendingId: string\): boolean \{[\s\S]{0,200}peerJobManager\.cancel/,
    'stopTask 必须取消 peer-job');
  assert.match(src, /stopAllTasks\(\): number \{[\s\S]{0,260}peerJobManager\.cancel/,
    '急停必须取消 peer-job');
  assert.match(ipc, /peerJobManager\.start\(/, 'IPC 启动时接 reportJobResult');
  assert.match(ipc, /peerJobManager\.recoverOrphans\(\)/, 'IPC 启动时扫孤儿');
});
