import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.GACODE_USER_DATA_DIR = mkdtempSync(join(tmpdir(), 't128-trust-'));

const T = await import('../electron/client-tools/claudeTrust.ts');

test('T128-TRUST-1 · 受信任目录直接可用', () => {
  const r = T.resolveClaudeLaunchCwd('d:/gaga/gaclaw-project');
  assert.equal(r.addDir, null, '已信任目录不该带 add-dir');
  assert.ok(r.cwd.toLowerCase().includes('gaclaw-project'));
});

test('T128-TRUST-2 · 未信任目录 ⇒ 换受信任 cwd，且**不带** add-dir（CLI 会拒未信任的 add-dir）', () => {
  const r = T.resolveClaudeLaunchCwd('d:/definitely-not-trusted-dir-xyz');
  assert.equal(r.addDir, null, '未信任目录不能进 --add-dir（CLI 直接拒）');
  assert.ok(r.untrustedTarget, '必须回报未信任的目标目录');
  assert.ok(r.untrustedTarget.toLowerCase().includes('not-trusted-dir-xyz'));
  assert.ok(r.cwd, '必须有兜底 cwd');
});

test('T128-TRUST-3 · cwd 为空 ⇒ 用兜底目录且不带 add-dir', () => {
  const r = T.resolveClaudeLaunchCwd(null);
  assert.equal(r.addDir, null);
  assert.ok(r.cwd);
});
