// [2026-11-26 · T-159] `pc_bash`（Git Bash 直连）—— 单测
//
// ## 覆盖断言
//
//   T-159-C1  探测：env 覆盖 > 标准安装位 > PATH；找不到返回 null（**不降级到 cmd**）
//   T-159-C2  能力串：有 Git Bash ⇒ `bash=1`；没有 ⇒ **不出现** bash 键
//   T-159-C3  路由：`pc_bash` 在端侧工具名单里且有默认超时
//   T-159-C4  **闸门**：黑名单命令经 `pc_bash` **同样硬拒**（不许成为绕过黑名单的路）
//
// ## 为什么能直接 import .ts
//
//   `bashPath.ts` / `jobCapability.ts` / `gate.ts` 只 import node 内置模块
//   ⇒ 不 import electron ⇒ Node 的类型剥离能直接跑。
//   ⚠️ **不 import executor.ts** —— 它 import node-pty（原生模块）⇒ 单测环境会炸。
//     executor 侧只验「工具名在名单里」（读源码常量，不 import）。
//
// 运行: node --test test/pc-bash.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gacode-pcbash-'));
process.env.GACODE_USER_DATA_DIR = TMP;

const {
  findGitBash,
  bashExists,
  bashNotFoundMessage,
  GIT_BASH_ENV,
} = await import('../electron/client-tools/bashPath.ts');

const { buildCapabilityString } = await import('../electron/client-tools/jobCapability.ts');

const { assertAllowed, COMMAND_ARG_BY_TOOL, ClientToolGateError } =
  await import('../electron/client-tools/gate.ts');

// ===========================================================================
// T-159-C1 · 路径探测
// ===========================================================================

test('T-159-C1a · 环境变量显式覆盖优先（用户想指定就用它）', () => {
  const fake = path.join(TMP, 'my-bash.exe');
  fs.writeFileSync(fake, 'x');
  const old = process.env[GIT_BASH_ENV];
  try {
    process.env[GIT_BASH_ENV] = fake;
    assert.equal(findGitBash(), fake, 'env 指定的路径必须优先');
    assert.equal(bashExists(), true);
  } finally {
    if (old === undefined) delete process.env[GIT_BASH_ENV];
    else process.env[GIT_BASH_ENV] = old;
  }
});

test('T-159-C1b · env 指向不存在的文件 ⇒ 继续往后找（不直接信它）', () => {
  const old = process.env[GIT_BASH_ENV];
  try {
    process.env[GIT_BASH_ENV] = path.join(TMP, 'nope-not-here.exe');
    const found = findGitBash();
    // 找不到就返回 null（**绝不**降级成 cmd.exe —— 降级会让引号又被腰斩）
    assert.ok(found === null || typeof found === 'string');
    if (found !== null) {
      assert.notEqual(found, path.join(TMP, 'nope-not-here.exe'), '不存在的路径不能被当成结果');
    }
  } finally {
    if (old === undefined) delete process.env[GIT_BASH_ENV];
    else process.env[GIT_BASH_ENV] = old;
  }
});

test('T-159-C1c · bashExists 与 findGitBash 口径一致', () => {
  const found = findGitBash();
  assert.equal(bashExists(), found !== null);
});

test('T-159-C1d · 找不到时的提示要说清怎么修', () => {
  const msg = bashNotFoundMessage();
  assert.match(msg, /Git Bash/, '要点名 Git Bash');
  assert.match(msg, new RegExp(GIT_BASH_ENV), '要给出环境变量这个出口');
});

// ===========================================================================
// T-159-C2 · 能力串
// ===========================================================================

test('T-159-C2a · 有 Git Bash ⇒ 能力串含 bash=1', () => {
  const caps = buildCapabilityString({ pty: true, job: true, bash: true });
  assert.match(caps, /(^|,)bash=1(,|$)/, `能力串要含 bash=1：${caps}`);
});

test('T-159-C2b · 没有 Git Bash ⇒ **不出现** bash 键（老能力串逐字不变）', () => {
  const caps = buildCapabilityString({ pty: true, job: true, bash: false });
  assert.doesNotMatch(caps, /bash/, `不该出现 bash 键：${caps}`);
  // 老能力串逐字不变
  assert.equal(caps, 'client-tools=1,pty=1,fs=1,screen=1,os=1,job=1');
});

test('T-159-C2c · 不传 bash 字段 ⇒ 当作没有（向后兼容：老调用方不受影响）', () => {
  const caps = buildCapabilityString({ pty: true, job: true });
  assert.doesNotMatch(caps, /bash/);
});

// ===========================================================================
// T-159-C3 · 路由存在（读源码，不 import executor —— 它带 node-pty）
// ===========================================================================

test('T-159-C3 · executor 里有 pc_bash 的路由与默认超时', () => {
  const src = fs.readFileSync(
    path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '../electron/client-tools/executor.ts'),
    'utf8',
  );
  assert.match(src, /case 'pc_bash':\s*return pcBash\(/, '要有 pc_bash 的分发分支');
  assert.match(src, /pc_bash:\s*600000/, '要有默认超时');
});

// ===========================================================================
// T-159-C4 · 闸门（**安全关键**）
// ===========================================================================

test('T-159-C4a · pc_bash 必须在「工具 → 命令参数」映射表里（否则绕过黑名单）', () => {
  assert.equal(COMMAND_ARG_BY_TOOL.pc_bash, 'command',
    'pc_bash 带 command 参数 ⇒ 必须过黑名单（不加 = 给黑名单开后门）');
});

test('T-159-C4b · 黑名单命令经 pc_bash **同样硬拒**', () => {
  assert.throws(
    () => assertAllowed('pc_bash', { command: 'format C:' }),
    (err) => err instanceof ClientToolGateError || err instanceof Error,
    'pc_bash 的黑名单命令必须被拒',
  );
});

test('T-159-C4c · 普通命令经 pc_bash 放行（闸门只拦黑名单，不拦一切）', () => {
  assert.doesNotThrow(() => assertAllowed('pc_bash', { command: 'uname -a' }));
});
