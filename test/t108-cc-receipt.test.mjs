import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ROOT = new URL('../', import.meta.url);

test('T108 client receipt helper has delivery_id and full state machine fields', () => {
  const src = fs.readFileSync(new URL('electron/client-tools/ccReceipt.ts', ROOT), 'utf8');
  for (const field of ['delivery_id', 'delivered', 'accepted', 'queued', 'visible', 'turn_acked', 'error_code']) {
    assert.ok(src.includes(field), `ccReceipt.ts must include ${field}`);
  }
});

test('T108 pc_cc tools return receipt fields', () => {
  const src = fs.readFileSync(new URL('electron/client-tools/executor.ts', ROOT), 'utf8');
  for (const name of ['pcCcSessions', 'pcCcRead', 'pcCcSend', 'pcCcControl']) {
    assert.ok(src.includes(name), `executor must implement ${name}`);
  }
  assert.ok(src.includes('receipt: buildCcReceipt('), 'pc_cc tools must include receipt');
});

test('T108 pc_cc_new is recognized as persistent native background Claude alias', () => {
  const cli = fs.readFileSync(new URL('electron/client-tools/cliService.ts', ROOT), 'utf8');
  const bg = fs.readFileSync(new URL('electron/client-tools/backgroundJobs.ts', ROOT), 'utf8');
  // T-128-fix: pc_cc_new is handled by executor as native `--bg` persistent session,
  // not by the detached one-shot BACKGROUND_START_TOOLS list.
  const exec = fs.readFileSync(new URL('electron/client-tools/executor.ts', ROOT), 'utf8');
  assert.doesNotMatch(bg, /tool === 'pc_cc_new'/);
  assert.match(exec, /pcCcNewBg/);
});

test('T103 delivery_id remains in peer message content', () => {
  const src = fs.readFileSync(new URL('electron/client-tools/claudeCodePeer.ts', ROOT), 'utf8');
  // ⚠️ [T-114 · 2026-11-23] 这条断言从「**源码字面量**」升级为「**行为级**」。
  //   原因：T-108（delivery_id）与 T-086（reply_to）两条线都要第三位参数
  //   ⇒ 实现改成「按类型判别」（字符串 ⇒ delivery_id；对象 ⇒ reply_to）
  //   ⇒ 源码里不再有 `buildPeerMessageContent(text, taskId, taskId)` 这个字面量。
  //   ⇒ 但**行为**必须不变：delivery_id 属性仍要出现在注入正文里。
  assert.match(src, /delivery_id=/, 'peer 正文里必须有 delivery_id 属性');
  assert.match(
    src,
    /buildPeerMessageContent\([\s\S]{0,200}deliveryId/,
    'buildPeerMessageContent 必须接受 deliveryId 并写进正文',
  );
});
