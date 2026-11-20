import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildBridgeArgs } from '../electron/client-tools/qmtBridge.ts'

test('buildBridgeArgs：prepare/preview 翻译成 WorkBuddy 嵌套 trade_request（不下单）', () => {
  const args = { account_alias: 'main_stock', symbol: '600030.SH', action: 'BUY', volume: 100, price: 10.5 };
  for (const tool of ['pc_qmt_prepare', 'pc_qmt_preview']) {
    const mapped = buildBridgeArgs(tool, args);
    assert.deepEqual(Object.keys(mapped), ['trade_request']);
    const req = mapped.trade_request;
    assert.deepEqual(Object.keys(req).sort(), [
      'account_alias', 'action', 'execution_mode', 'instrument',
      'price_policy', 'sizing', 'source',
    ]);
    assert.equal(req.account_alias, 'main_stock');
    assert.deepEqual(req.instrument, { canonical_symbol: '600030.SH', qmt_symbol: '600030.SH' });
    assert.equal(req.action, 'BUY');
    assert.deepEqual(req.sizing, { type: 'FIXED_VOLUME', value: 100 });
    assert.deepEqual(req.price_policy, { type: 'FIXED_LIMIT', limit_price: 10.5 });
    assert.equal(req.execution_mode, 'MANUAL_LIVE');
    assert.deepEqual(Object.keys(req.source).sort(), ['signal_id', 'type']);
  }
});

