// [2026-11-26 · T-160] `pc_powershell`（PowerShell 直连）—— 单测
//
// ## 覆盖断言
//
//   T-160-C1  探测：env 覆盖优先；认得 pwsh 与 powershell.exe 两种；找不到返 null
//   T-160-C2  能力串：有 PowerShell ⇒ `powershell=1`；没有 ⇒ 不出现该键
//   T-160-C3  **互不干扰**：`bash` 与 `powershell` 两个键独立（派单点名验收项）
//   T-160-C4  路由：`pc_powershell` 在端侧工具名单里且有默认超时
//   T-160-C5  **闸门**：黑名单命令经 `pc_powershell` **同样硬拒**（不留后门）
//
// ## 为什么能直接 import .ts
//
//   `powershellPath.ts` / `jobCapability.ts` / `gate.ts` 只 import node 内置模块
//   ⇒ 不 import electron ⇒ Node 的类型剥离能直接跑。
//   ⚠️ **不 import executor.ts** —— 它 import node-pty（原生模块）⇒ 单测环境会炸。
//     executor 侧只验「工具名在名单里」（读源码常量，不 import）。
//
// 运行: node --test test/pc-powershell.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gacode-pcpowershell-'));
process.env.GACODE_USER_DATA_DIR = TMP;

const {
  findPowerShell,
  powershellExists,
  powershellNotFoundMessage,
  POWERSHELL_ENV,
} = await import('../electron/client-tools/powershellPath.ts');

const { buildCapabilityString } = await import('../electron/client-tools/jobCapability.ts');

const { assertAllowed, COMMAND_ARG_BY_TOOL, ClientToolGateError } =
  await import('../electron/client-tools/gate.ts');

// ===========================================================================
// T-160-C1 · 解释器探测
// ===========================================================================

test('T-160-C1a · 环境变量显式覆盖优先', () => {
  const fake = path.join(TMP, 'my-pwsh.exe');
  fs.writeFileSync(fake, 'x');
  const old = process.env[POWERSHELL_ENV];
  try {
    process.env[POWERSHELL_ENV] = fake;
    const found = findPowerShell();
    assert.ok(found, 'env 指定时应能找到');
    assert.equal(found.file, fake, 'env 指定的路径必须优先');
    assert.equal(found.flavor, 'pwsh', '按文件名判定 flavor');
  } finally {
    if (old === undefined) delete process.env[POWERSHELL_ENV];
    else process.env[POWERSHELL_ENV] = old;
  }
});

test('T-160-C1b · env 指向不存在的文件 ⇒ 继续往后找（不直接信它）', () => {
  const old = process.env[POWERSHELL_ENV];
  const missing = path.join(TMP, 'nope-pwsh.exe');
  try {
    process.env[POWERSHELL_ENV] = missing;
    const found = findPowerShell();
    if (found !== null) {
      assert.notEqual(found.file, missing, '不存在的路径不能被当成结果');
    }
  } finally {
    if (old === undefined) delete process.env[POWERSHELL_ENV];
    else process.env[POWERSHELL_ENV] = old;
  }
});

test('T-160-C1c · powershellExists 与 findPowerShell 口径一致', () => {
  const found = findPowerShell();
  assert.equal(powershellExists(), found !== null);
});

test('T-160-C1d · flavor 只可能是 pwsh 或 powershell', () => {
  const found = findPowerShell();
  if (found !== null) {
    assert.ok(['pwsh', 'powershell'].includes(found.flavor), `flavor 非法：${found.flavor}`);
  }
});

test('T-160-C1e · 找不到时的提示要说清怎么修', () => {
  const msg = powershellNotFoundMessage();
  assert.match(msg, /PowerShell/, '要点名 PowerShell');
  assert.match(msg, new RegExp(POWERSHELL_ENV), '要给出环境变量这个出口');
});

// ===========================================================================
// T-160-C2 / C3 · 能力串（含**互不干扰**）
// ===========================================================================

test('T-160-C2a · 有 PowerShell ⇒ 能力串含 powershell=1', () => {
  const caps = buildCapabilityString({ pty: true, job: true, powershell: true });
  assert.match(caps, /(^|,)powershell=1(,|$)/, `能力串要含 powershell=1：${caps}`);
});

test('T-160-C2b · 没有 PowerShell ⇒ 不出现 powershell 键', () => {
  const caps = buildCapabilityString({ pty: true, job: true, powershell: false });
  assert.doesNotMatch(caps, /powershell/, `不该出现 powershell 键：${caps}`);
});

test('T-160-C3 · bash 与 powershell 两个能力键**互不干扰**（派单点名验收项）', () => {
  const onlyBash = buildCapabilityString({ pty: true, job: true, bash: true });
  assert.match(onlyBash, /bash=1/);
  assert.doesNotMatch(onlyBash, /powershell/, '只声明 bash 时不该出现 powershell');

  const onlyPs = buildCapabilityString({ pty: true, job: true, powershell: true });
  assert.match(onlyPs, /powershell=1/);
  assert.doesNotMatch(onlyPs, /bash/, '只声明 powershell 时不该出现 bash');

  const both = buildCapabilityString({ pty: true, job: true, bash: true, powershell: true });
  assert.match(both, /bash=1/);
  assert.match(both, /powershell=1/);
});

// ===========================================================================
// T-160-C4 · 路由存在（读源码，不 import executor —— 它带 node-pty）
// ===========================================================================

test('T-160-C4 · executor 里有 pc_powershell 的路由与默认超时', () => {
  const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\//, ''));
  const src = fs.readFileSync(path.join(here, '../electron/client-tools/executor.ts'), 'utf8');
  assert.match(src, /case 'pc_powershell':\s*return pcPowershell\(/, '要有 pc_powershell 的分发分支');
  assert.match(src, /pc_powershell:\s*600000/, '要有默认超时');
  // ⚠️ 必须用 -NoProfile（干净环境，同 cmd 的 /d 口径）
  assert.match(src, /'-NoProfile',\s*'-Command',\s*command/, '要用 -NoProfile -Command 且 command 作 argv 单元素');
});

// ===========================================================================
// T-160-C5 · 闸门（**安全关键**）
// ===========================================================================

test('T-160-C5a · pc_powershell 必须在「工具 → 命令参数」映射表里（否则绕过黑名单）', () => {
  assert.equal(COMMAND_ARG_BY_TOOL.pc_powershell, 'command',
    'pc_powershell 带 command 参数 ⇒ 必须过黑名单（不加 = 给黑名单开后门）');
  // 与 pc_bash 同等覆盖
  assert.equal(COMMAND_ARG_BY_TOOL.pc_powershell, COMMAND_ARG_BY_TOOL.pc_bash,
    'pc_powershell 与 pc_bash 必须同等黑名单覆盖');
});

test('T-160-C5b · 黑名单命令经 pc_powershell **同样硬拒**', () => {
  assert.throws(
    () => assertAllowed('pc_powershell', { command: 'format C:' }),
    (err) => err instanceof ClientToolGateError || err instanceof Error,
    'pc_powershell 的黑名单命令必须被拒',
  );
});

test('T-160-C5c · 普通命令经 pc_powershell 放行（闸门只拦黑名单，不拦一切）', () => {
  assert.doesNotThrow(() => assertAllowed('pc_powershell', { command: 'Get-Date' }));
});
