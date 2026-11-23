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

// ═══════════════════════════════════════════════════════════════════════════
// [T-119] 服务端注入的传输字段 ≠ 模型污染
//   生产实证（session 1138）：服务端把信封字段塞进派单 args ⇒ 端侧 fail-fast
//   误判成「参数不合法」⇒ 整族 pc_cc_* 全挂（274+51+26 次失败）。
// ═══════════════════════════════════════════════════════════════════════════

test('T-119-1 · pc_cc_send 放行服务端注入的回信地址/派单身份', () => {
  const r = validateClientToolArgs('pc_cc_send', {
    session_id: 'abc', text: 'hi',
    reply_to_business_session_id: '1138',
    reply_to_cc_session_id: 'cc-1',
    reply_channel: 'peer',
    pending_id: 'pending-1',
  });
  assert.equal(r.ok, true, `不该被拒：unknown=${JSON.stringify(r.unknown)}`);
});

test('T-119-2 · pc_cc_control 放行服务端注入的回信地址', () => {
  const r = validateClientToolArgs('pc_cc_control', {
    session_id: 'abc', action: 'notify_when_idle',
    reply_to_business_session_id: '1138',
    reply_channel: 'inbox',
  });
  assert.equal(r.ok, true, `不该被拒：unknown=${JSON.stringify(r.unknown)}`);
});

test('T-119-3 · 仍然拒模型塞进来的信封字段（防线不放宽）', () => {
  const r = validateClientToolArgs('pc_cc_send', {
    session_id: 'abc', text: 'hi',
    delivery_id: 'forged', envelope: { __gacode_internal: true }, receipt: {},
  });
  assert.equal(r.ok, false, '模型伪造的信封字段必须仍被拒');
  assert.ok(r.unknown.includes('delivery_id'));
  assert.ok(r.unknown.includes('envelope'));
  assert.ok(r.unknown.includes('receipt'));
});

test('T-119-4 · pc_cc_sessions/read/append 不放行任何传输字段（服务端已不注入）', () => {
  for (const [tool, args] of [
    ['pc_cc_sessions', { delivery_id: 'd' }],
    ['pc_cc_read', { session_id: 's', pending_id: 'p' }],
    ['pc_cc_append', { session_id: 's', text: 't', receipt: {} }],
  ]) {
    const r = validateClientToolArgs(tool, args);
    assert.equal(r.ok, false, `${tool} 不得放行内部字段`);
    assert.ok(r.unknown.length > 0);
  }
});
