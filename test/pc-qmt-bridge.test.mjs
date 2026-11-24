/**
 * T-086 QMT 端侧桥接单测（纯逻辑：不 spawn、不连 MCP、不下真单）。
 * 运行：node --test test/pc-qmt-bridge.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewFingerprint, checkQmtApproval, checkQmtAutoRequest, checkQmtInfraRequest, executeQmtTool, TOOL_MAP, qmtAvailable, buildBridgeArgs, CONSERVATIVE_AUTO_PROFILE, isConservativeAuthorizeArgs } from '../electron/client-tools/qmtBridge.ts';
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

test('QMT 工具白名单：18 个 pc_qmt_*，submit + auto + infra 在列', () => {
  assert.equal(Object.keys(TOOL_MAP).length, 18);
  assert.equal(TOOL_MAP.pc_qmt_health, 'qmt_health');
  assert.equal(TOOL_MAP.pc_qmt_submit, 'submit_trade_intent');
  assert.equal(TOOL_MAP.pc_qmt_prepare, 'prepare_trade');
  assert.equal(TOOL_MAP.pc_qmt_auto_status, 'check_limited_auto_readiness');
  assert.equal(TOOL_MAP.pc_qmt_auto_authorize, 'authorize_limited_auto');
  assert.equal(TOOL_MAP.pc_qmt_auto_order, 'prepare_trade');
  assert.equal(TOOL_MAP.pc_qmt_auto_revoke, 'revoke_limited_auto');
  assert.equal(TOOL_MAP.pc_qmt_cancel_order, 'cancel_order');
  assert.equal(TOOL_MAP.pc_qmt_intent_wait, 'wait_trade_intent');
  assert.equal(TOOL_MAP.pc_qmt_intent_get, 'get_trade_intent');
  assert.equal(TOOL_MAP.pc_qmt_intent_list, 'list_trade_intents');
  assert.equal(TOOL_MAP.pc_qmt_risk_limits, 'get_risk_limits');
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
  // empty explicit cmd still falls back to default config/PATH detection on this machine
  assert.equal(qmtAvailable({}), true); // default bridge config exists on this machine
});


const AUTO_ORDER = {
  account_alias: 'main_stock', symbol: '600030.SH', action: 'BUY', volume: 100, price: 10.5,
  source_type: 'rule', rule_set_id: 'momentum_basic', rule_version: 'v1', signal_id: 'sig-stable-001',
};

test('自动交易门：confirm/人审字段/信号绑定 fail-closed', () => {
  assert.equal(checkQmtAutoRequest('pc_qmt_auto_status', { account_alias: 'main_stock' }), null);
  assert.equal(checkQmtAutoRequest('pc_qmt_auto_authorize', { confirm: 'NO' }), 'AUTO_CONFIRM_REQUIRED');
  assert.equal(checkQmtAutoRequest('pc_qmt_auto_revoke', { confirm: 'REVOKE-LIMITED-AUTO-P1', approved: true }), 'AUTO_FORBIDDEN_FIELD');
  assert.equal(checkQmtAutoRequest('pc_qmt_auto_order', { ...AUTO_ORDER, signal_id: '' }), 'AUTO_INVALID_ARGUMENT');
  assert.equal(checkQmtAutoRequest('pc_qmt_auto_order', { ...AUTO_ORDER, source_type: '' }), 'AUTO_SOURCE_REQUIRED');
  assert.equal(checkQmtAutoRequest('pc_qmt_auto_order', { ...AUTO_ORDER, rule_set_id: '' }), 'AUTO_RULE_REQUIRED');
  assert.equal(checkQmtAutoRequest('pc_qmt_auto_order', AUTO_ORDER), null);
});

test('buildBridgeArgs：auto_order 使用 LIMITED_AUTO + 稳定 source 绑定，不生成 Date.now signal', () => {
  const mapped = buildBridgeArgs('pc_qmt_auto_order', AUTO_ORDER);
  const req = mapped.trade_request;
  assert.equal(req.execution_mode, 'LIMITED_AUTO');
  assert.deepEqual(req.source, { type: 'rule', signal_id: 'sig-stable-001', rule_set_id: 'momentum_basic', rule_version: 'v1' });
});

test('executeQmtTool auto_order：risk.allowed=false 不提交；true 只提交一次', async () => {
  const deniedCalls = [];
  const fakeDeny = {
    async start() {}, async listTools() { return ['prepare_trade', 'submit_trade_intent']; },
    async callTool(name, args) { deniedCalls.push({ name, args }); return { content: [{ type: 'text', text: JSON.stringify({ preview_id: 'pv-auto', risk: { allowed: false, reasons: ['stale'] } }) }] }; },
    stop() {},
  };
  const denied = await executeQmtTool('pc_qmt_auto_order', AUTO_ORDER, { clientFactory: () => fakeDeny });
  assert.equal(denied.status, 'error');
  assert.match(denied.error || '', /风控/);
  assert.deepEqual(deniedCalls.map(c => c.name), ['prepare_trade']);

  const okCalls = [];
  const fakeOk = {
    async start() {}, async listTools() { return ['prepare_trade', 'submit_trade_intent']; },
    async callTool(name, args) { okCalls.push({ name, args }); return { content: [{ type: 'text', text: name === 'prepare_trade' ? JSON.stringify({ preview_id: 'pv-auto', risk: { allowed: true, reasons: [] } }) : JSON.stringify({ status: 'QUEUED' }) }] }; },
    stop() {},
  };
  const ok = await executeQmtTool('pc_qmt_auto_order', AUTO_ORDER, { clientFactory: () => fakeOk });
  assert.equal(ok.status, 'ok');
  assert.deepEqual(okCalls.map(c => c.name), ['prepare_trade', 'submit_trade_intent']);
  assert.deepEqual(okCalls[1].args, { preview_id: 'pv-auto' });
  assert.equal(okCalls[0].args.trade_request.execution_mode, 'LIMITED_AUTO');
});


test('基础设施门：撤单必须显式 confirm + account/order/reason 完整', () => {
  const valid = { account_alias: 'main_stock', order_id: 'ord-1', reason: 'duplicate', confirm: 'CANCEL-QMT-ORDER' };
  assert.equal(checkQmtInfraRequest('pc_qmt_cancel_order', valid), null);
  assert.equal(checkQmtInfraRequest('pc_qmt_cancel_order', { ...valid, confirm: 'NO' }), 'CONFIRM_REQUIRED');
  assert.equal(checkQmtInfraRequest('pc_qmt_cancel_order', { ...valid, order_id: '' }), 'AUTO_INVALID_ARGUMENT');
  assert.equal(checkQmtInfraRequest('pc_qmt_risk_limits', { account_alias: 'main_stock' }), null);
});

test('buildBridgeArgs：基础设施工具映射到 WorkBuddy 原生 schema', () => {
  assert.deepEqual(buildBridgeArgs('pc_qmt_cancel_order', {
    account_alias: 'main_stock', order_id: 'ord-1', reason: 'duplicate', confirm: 'CANCEL-QMT-ORDER',
  }), { account_alias: 'main_stock', order_id: 'ord-1', reason: 'duplicate' });
  assert.deepEqual(buildBridgeArgs('pc_qmt_intent_wait', { intent_id: 'int-1', timeout_seconds: 1.5 }), { intent_id: 'int-1', timeout_seconds: 1.5 });
  assert.deepEqual(buildBridgeArgs('pc_qmt_intent_get', { intent_id: 'int-1' }), { intent_id: 'int-1' });
  assert.deepEqual(buildBridgeArgs('pc_qmt_intent_list', { status: 'QUEUED', after_seq: 3, limit: 20 }), { status: 'QUEUED', after_seq: 3, limit: 20 });
  assert.deepEqual(buildBridgeArgs('pc_qmt_risk_limits', { account_alias: 'main_stock' }), { account_alias: 'main_stock' });
});

test('executeQmtTool：裸撤单 denied，不 spawn client', async () => {
  let spawned = 0;
  const result = await executeQmtTool('pc_qmt_cancel_order', { account_alias: 'main_stock', order_id: 'ord-1' }, {
    clientFactory: () => { spawned++; throw new Error('should not spawn'); },
  });
  assert.equal(result.status, 'denied');
  assert.match(result.error || '', /CONFIRM_REQUIRED/);
  assert.equal(spawned, 0);
});


test('保守授权模板：只允许首版小额政策子集，放大额度/标的/动作/时段一律拒绝', () => {
  const p = CONSERVATIVE_AUTO_PROFILE;
  const valid = {
    account_alias: p.account_alias, symbols: [...p.symbols], actions: [...p.actions],
    source_type: p.source_type, rule_set_id: p.rule_set_id, rule_version: p.rule_version,
    minutes: p.minutes, max_order_notional: p.max_order_notional, max_order_volume: p.max_order_volume,
    max_session_notional: p.max_session_notional, max_orders: p.max_orders,
    min_order_interval_seconds: p.min_order_interval_seconds, max_concurrent_orders: p.max_concurrent_orders,
    max_symbol_position_notional: p.max_symbol_position_notional, max_account_drawdown: p.max_account_drawdown,
    max_consecutive_failures: p.max_consecutive_failures,
    trading_windows: p.trading_windows.map(w => ({ ...w })), allowed_sizing_types: [...p.allowed_sizing_types],
    allow_credit_new_debt: p.allow_credit_new_debt,
    confirm: 'AUTHORIZE-LIMITED-AUTO-P1', reason: 'pilot',
  };
  assert.equal(isConservativeAuthorizeArgs(valid), true);
  assert.equal(checkQmtAutoRequest('pc_qmt_auto_authorize', valid), null);
  assert.equal(isConservativeAuthorizeArgs({ ...valid, max_order_notional: 3001 }), false);
  assert.equal(isConservativeAuthorizeArgs({ ...valid, symbols: ['000001.SZ'] }), false);
  assert.equal(isConservativeAuthorizeArgs({ ...valid, actions: ['SELL'] }), false);
  assert.equal(isConservativeAuthorizeArgs({ ...valid, source_type: 'other' }), false);
  assert.equal(isConservativeAuthorizeArgs({ ...valid, trading_windows: [{ start: '09:00', end: '15:00' }] }), false);
  assert.equal(checkQmtAutoRequest('pc_qmt_auto_authorize', { ...valid, max_orders: 2 }), 'AUTO_INVALID_ARGUMENT');
});

test('buildBridgeArgs：auto_authorize 缺省字段使用保守模板默认值', () => {
  const p = CONSERVATIVE_AUTO_PROFILE;
  const mapped = buildBridgeArgs('pc_qmt_auto_authorize', {
    account_alias: p.account_alias, symbols: [...p.symbols], actions: [...p.actions],
    source_type: p.source_type, rule_set_id: p.rule_set_id, rule_version: p.rule_version,
    confirm: 'AUTHORIZE-LIMITED-AUTO-P1', reason: 'pilot',
  });
  assert.equal(mapped.max_order_notional, 3000);
  assert.equal(mapped.max_order_volume, 100);
  assert.equal(mapped.max_orders, 1);
  assert.equal(mapped.min_order_interval_seconds, 60);
  assert.deepEqual(mapped.trading_windows, [
    { start: '09:35', end: '11:30' },
    { start: '13:00', end: '14:50' },
  ]);
  assert.equal(mapped.allow_credit_new_debt, false);
});
