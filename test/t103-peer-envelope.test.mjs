import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// T-103-b · uds notice 统一 envelope：buildPeerMessageContent 支持 delivery_id（源码级断言）
const SRC = fs.readFileSync(
  new URL('../electron/client-tools/claudeCodePeer.ts', import.meta.url),
  'utf8',
);

test('PC1 buildPeerMessageContent 接受 deliveryId 并写入 cross-session-message 属性', () => {
  assert.ok(/deliveryId\?: string \| null/.test(SRC), '签名含 deliveryId 参数');
  assert.ok(/delivery_id=/.test(SRC), 'attrs 含 delivery_id 属性');
  assert.ok(/from="uds:gaclaw"/.test(SRC), 'from 标记保留');
});

test('PC2 delivery_id 与 peer.mjs 回执的 delivery_id 同一套幂等语义', () => {
  // 断言 neutralizer 处理（防注入属性）——与 task_id 同款
  assert.ok(/neutralize\(String\(deliveryId\)\)/.test(SRC), 'delivery_id 走 neutralize 防注入');
});