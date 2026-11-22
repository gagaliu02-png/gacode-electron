import test from 'node:test';
import assert from 'node:assert/strict';
import { validateClientToolArgs } from '../electron/client-tools/clientToolArgs.ts';

test('pc_cc_sessions 拒绝服务端内部字段', () => {
  const r = validateClientToolArgs('pc_cc_sessions', { delivery_id: 'd1', origin: 'gaclaw', receipt: {} });
  assert.equal(r.ok, false);
  assert.ok(r.unknown.includes('delivery_id'));
  assert.ok(r.unknown.includes('origin'));
});

test('pc_cc_send 缺 text / 错 priority 被拦', () => {
  const missing = validateClientToolArgs('pc_cc_send', { session_id: 'abc' });
  assert.equal(missing.ok, false);
  assert.ok(missing.missing.includes('text'));
  const bad = validateClientToolArgs('pc_cc_send', { session_id: 'abc', text: 'x', priority: 'bad' });
  assert.equal(bad.ok, false);
  assert.ok(bad.invalid.includes('priority'));
});

test('pc_cc_send 合法参数通过', () => {
  const r = validateClientToolArgs('pc_cc_send', { session_id: 'abc', text: 'hello', priority: 'later' });
  assert.equal(r.ok, true);
});
