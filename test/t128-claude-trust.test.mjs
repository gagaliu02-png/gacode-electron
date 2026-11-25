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

test('T154-TRUST-4 · ★ 盘符大小写不同 ⇒ 也要用**表里原始写法**起（CLI 查信任是大小写敏感的）', () => {
  // 事故（2026-11-25 e2e）：表里记的是 `d:\gaga\gaclaw-project`（VS Code 会话开的），
  // 调用方传 `D:\gaga\gaclaw-project` ⇒ 端侧判定「已信任」但 CLI 报
  // `Workspace not trusted` ⇒ pc_cc_new 连跪两次（<1s 就挂）。
  // ⇒ 启动 cwd 必须用**表里原始写法**，让 CLI 自己的原样匹配命中。
  const r = T.resolveClaudeLaunchCwd('D:\\gaga\\gaclaw-project');
  assert.equal(r.untrustedTarget, null, '大小写不同不该被当成未信任');
  assert.ok(r.cwd, '必须有 cwd');
  assert.ok(
    r.cwd === 'd:\\gaga\\gaclaw-project' || r.cwd.toLowerCase().includes('gaclaw-project'),
    `cwd 必须是表里那条（小写 d:），实际=${r.cwd}`,
  );
  // 关键断言：**不是**调用方传的大写写法
  assert.notEqual(r.cwd, 'D:\\gaga\\gaclaw-project', '必须换回表里的原始写法（CLI 认大小写敏感）');
});
