/**
 * T-086 QMT 端侧桥接单测（纯逻辑：不 spawn、不连 MCP、不下真单）。
 * 运行：node --test test/pc-qmt-bridge.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewFingerprint, checkQmtApproval, executeQmtTool, TOOL_MAP, qmtAvailable } from '../electron/client-tools/qmtBridge.ts';
import { buildCapabilityString } from '../electron/client-tools/jobCapability.ts';

const APPROVED = {
  preview_id: 'pv-123',
  approver: 'gaga',
  approved: true,
  confirm: 'SUBMIT-QMT-ORDER',
  preview_fingerprint: 'account_alias=main_stock|symbol=600036.SH|action=BUY|volume=100|price=42.75',
  preview: { account_alias: 'main_stock', symbol: '600036.SH', action: 'BUY', volume: 100, price: 42.75 },
  approved_at_ms: 1000000,
};

test('QMT 工具白名单：9 个 pc_qmt_*，submit 在列', () => {
  assert.equal(Object.keys(TOOL_MAP).length, 9);
  assert.equal(TOOL_MAP.pc_qmt_health, 'qmt_health');
  assert.equal(TOOL_MAP.pc_qmt_submit, 'submit_trade_intent');
  assert.equal(TOOL_MAP.pc_qmt_prepare, 'prepare_trade');
  assert.equal(Object.values(TOOL_MAP).includes('halt_trading'), false);
});

test('previewFingerprint：字段缺失/非法 ⇒ null；顺序固定', () => {
  assert.equal(previewFingerprint(APPROVED.preview), APPROVED.preview_fingerprint);
  assert.equal(previewFingerprint({ ...APPROVED.preview, volume: undefined }), null);
  assert.equal(previewFingerprint({ ...APPROVED.preview, price: NaN }), null);
  assert.equal(previewFingerprint(null), null);
});

test('审核门：readonly 直接过；submit 缺任一审核字段/过期/指纹不符 ⇒ denied', () => {
  assert.equal(checkQmtApproval('pc_qmt_positions', {}, 1000), null);
  assert.equal(checkQmtApproval('not_a_qmt_tool', {}, 1000), 'UNKNOWN_TOOL');
  assert.equal(checkQmtApproval('pc_qmt_submit', {}, 1000), 'APPROVAL_REQUIRED');
  assert.equal(checkQmtApproval('pc_qmt_submit', { ...APPROVED, approver: '' }, 1000), 'APPROVER_REQUIRED');
  assert.equal(checkQmtApproval('pc_qmt_submit', { ...APPROVED, confirm: 'NO' }, 1000), 'CONFIRM_REQUIRED');
  assert.equal(checkQmtApproval('pc_qmt_submit', { ...APPROVED, preview_fingerprint: '' }, 1000), 'PREVIEW_FINGERPRINT_REQUIRED');
  assert.equal(checkQmtApproval('pc_qmt_submit', { ...APPROVED, preview: { ...APPROVED.preview, price: 99 } }, 1000), 'PREVIEW_MISMATCH');
  assert.equal(checkQmtApproval('pc_qmt_submit', APPROVED, 1000000 + 121000), 'APPROVAL_EXPIRED');
  assert.equal(checkQmtApproval('pc_qmt_submit', APPROVED, 1000000), null);
});

test('executeQmtTool：审核不通过时直接返回 denied，绝不 spawn client', async () => {
  let spawned = 0;
  const result = await executeQmtTool('pc_qmt_submit', {}, {
    nowMs: 1000,
    clientFactory: () => { spawned++; throw new Error('should not spawn'); },
  });
  assert.equal(result.status, 'denied');
  assert.match(result.error || '', /APPROVAL_REQUIRED/);
  assert.equal(spawned, 0);
});

test('executeQmtTool：mock client 走完整协议，只读工具返回 ok（不下单）', async () => {
  const calls = [];
  const fake = {
    async start() {},
    async listTools() { return ['qmt_health']; },
    async callTool(name, args) { calls.push({ name, args }); return { content: [{ type: 'text', text: '{"ok":true}' }] }; },
    stop() {},
  };
  const result = await executeQmtTool('pc_qmt_health', {}, {
    clientFactory: () => fake,
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.stdout, '{"ok":true}');
  assert.deepEqual(calls, [{ name: 'qmt_health', args: {} }]);
});

test('能力声明：qmt=1 只在 bridge 命令配置后追加，其他键不受影响', () => {
  assert.equal(buildCapabilityString({ pty: false, job: true, qmt: false }).includes('qmt='), false);
  assert.match(buildCapabilityString({ pty: false, job: true, qmt: true }), /qmt=1$/);
  assert.equal(qmtAvailable({ GACODE_QMT_MCP_CMD: 'workbuddy-qmt-mcp' }), true);
  assert.equal(qmtAvailable({}), false);
});
