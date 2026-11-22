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

test('T108 pc_cc_new is recognized as background Claude Code alias', () => {
  const cli = fs.readFileSync(new URL('electron/client-tools/cliService.ts', ROOT), 'utf8');
  const bg = fs.readFileSync(new URL('electron/client-tools/backgroundJobs.ts', ROOT), 'utf8');
  assert.match(cli, /pc_cc_new/);
  assert.match(bg, /pc_cc_new/);
});

test('T103 delivery_id remains in peer message content', () => {
  const src = fs.readFileSync(new URL('electron/client-tools/claudeCodePeer.ts', ROOT), 'utf8');
  assert.match(src, /buildPeerMessageContent\(text, taskId, taskId\)/);
});
