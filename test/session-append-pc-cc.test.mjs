// [T-111] pc_cc_append —— Cody → 本机 Claude Code 的轻量追加（fire-and-forget）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { validateClientToolArgs } from '../electron/client-tools/clientToolArgs.ts';
import { buildPeerAppendContent, buildPeerMessageContent } from '../electron/client-tools/claudeCodePeer.ts';
import { isBackgroundStartTool, isJobControlTool } from '../electron/client-tools/cliService.ts';

const ROOT = new URL('../', import.meta.url);
const EXECUTOR_SRC = fs.readFileSync(new URL('electron/client-tools/executor.ts', ROOT), 'utf8');
const DEVICE_SRC = fs.readFileSync(new URL('electron/client-tools/deviceClient.ts', ROOT), 'utf8');

test('pc_cc_append 只收公开参数；内部字段 / 空正文被 fail-fast 拒掉', () => {
  assert.equal(validateClientToolArgs('pc_cc_append', {
    session_id: 'cc-1', text: '补充一句', task_id: 'corr-1',
  }).ok, true);
  const bad = validateClientToolArgs('pc_cc_append', {
    session_id: 'cc-1', text: '', delivery_id: 'internal', receipt: {},
  });
  assert.equal(bad.ok, false);
  assert.ok(bad.missing.includes('text'));
  assert.ok(bad.unknown.includes('delivery_id'));
  assert.ok(bad.unknown.includes('receipt'));
});

test('append 正文不带汇报协议 / 不订阅回报；task_id 只是关联键', () => {
  const text = buildPeerAppendContent('只是补充', 'corr-1');
  assert.match(text, /^<cross-session-message from="uds:gaclaw" append_kind="pc_cc_append" task_id="corr-1">/);
  assert.doesNotMatch(text, /GACLAW_RESULT_START/);
  assert.doesNotMatch(text, /请在最终回复/);

  // pc_cc_send 的旧路径必须逐字不变（仍带汇报协议）。
  assert.match(buildPeerMessageContent('任务', 'task-1', 'task-1'), /GACLAW_RESULT_START/);
});

test('pc_cc_append 不进后台作业 / 作业控制 / 晚到结果分类', () => {
  assert.equal(isBackgroundStartTool('pc_cc_append'), false);
  assert.equal(isJobControlTool('pc_cc_append'), false);
  assert.doesNotMatch(DEVICE_SRC, /LATE_RESULT_TOOLS[^\n]*pc_cc_append/);
});

test('executor 实现 append 分支：只投递 + 轻量回执，无 watcher / job_result / turn_acked', () => {
  assert.match(EXECUTOR_SRC, /pc_cc_append: 30000/);
  assert.match(EXECUTOR_SRC, /case 'pc_cc_append': return pcCcAppend\(args\)/);
  assert.match(EXECUTOR_SRC, /async function pcCcAppend/);
  const start = EXECUTOR_SRC.indexOf('async function pcCcAppend');
  const end = EXECUTOR_SRC.indexOf('async function pcCcControl', start);
  const body = EXECUTOR_SRC.slice(start, end);
  assert.match(body, /sendPeerAppend/);
  assert.match(body, /delivered: true/);
  assert.match(body, /accepted: true/);
  assert.match(body, /queued: true/);
  assert.match(body, /visible: false/);
  assert.doesNotMatch(body, /watchClaudeSessionResult/);
  assert.doesNotMatch(body, /reportJobResult/);
  assert.doesNotMatch(body, /turn_acked/);
});
