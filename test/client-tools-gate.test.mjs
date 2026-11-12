// [2026-11-12 · P3/P4] 端侧执行的**安全闸门** —— 单测
//
// 契约依据: cross-platform-sse-event-contract-附录.md **订正 24 §5**（审批与闸门）
//
// ## 覆盖断言
//
//   GC-P4-1  每一个 `pc_*` 都在服务端的 `HIGH_RISK` 里（**服务端**那张表，本文件只钉住形状）
//   GC-P4-2  黑名单命令**恒被拒**（不是「默认拒绝但可勾选允许」）
//   L-24k    端侧**绝不复用** `scheduled === true`（服务端那个放行旁路）
//   ——      总开关默认 **开**（gaga 拍板）· 急停一按全拒
//   ——      审计保留 30 天 + 一键清空
//
// ## 为什么能直接 import .ts
//
//   `electron/client-tools/gate.ts` 只 import node 内置模块 —— **不 import electron**
//   （`configDir()` 里懒加载 electron, 单测环境走兜底目录）⇒ Node 的类型剥离能直接跑。
//
// 运行: node --test test/client-tools-gate.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gacode-gate-'));
process.env.GACODE_USER_DATA_DIR = TMP;

const {
  assertAllowed,
  findBlacklistHit,
  readGateState,
  writeGateState,
  appendAudit,
  readAudit,
  clearAudit,
  summarizeCommand,
  gateConfigFile,
  auditFile,
  AUDIT_RETENTION_MS,
} = await import('../electron/client-tools/gate.ts');

// ===========================================================================
// 总开关 / 急停
// ===========================================================================

test('总开关默认**开**（gaga 拍板「默认 ON」）', () => {
  const st = readGateState();
  assert.equal(st.masterEnabled, true, '默认必须是开的');
  assert.equal(st.killSwitch, false);
});

test('总开关关掉 ⇒ 端侧执行全拒', () => {
  writeGateState({ masterEnabled: false });
  assert.equal(readGateState().masterEnabled, false);
  assert.throws(
    () => assertAllowed('pc_shell', { command: 'echo hi' }),
    (e) => e.code === 'master_off',
  );
  writeGateState({ masterEnabled: true });
  // 恢复后放行
  assert.doesNotThrow(() => assertAllowed('pc_shell', { command: 'echo hi' }));
});

test('急停优先于总开关（一按立刻全拒）', () => {
  writeGateState({ masterEnabled: true, killSwitch: true });
  assert.throws(
    () => assertAllowed('pc_shell', { command: 'echo hi' }),
    (e) => e.code === 'kill_switch',
  );
  writeGateState({ killSwitch: false });
  assert.doesNotThrow(() => assertAllowed('pc_shell', { command: 'echo hi' }));
});

// ===========================================================================
// GC-P4-2 · 黑名单硬拒
// ===========================================================================

test('GC-P4-2 · 不可逆命令**恒被拒**', () => {
  const forbidden = [
    'format C:',
    'diskpart',
    'del /f /s /q C:\\',
    'rd /s /q C:\\',
    'rm -rf /',
    'rm -rf ~',
    'reg delete HKLM\\SOFTWARE',
    'shutdown /s /t 0',
    'cipher /w:C',
    'bcdedit /delete {current}',
    'Remove-Item -Recurse -Force C:\\',
    'net user hacker pass /add',
    'sc config evilservice start=auto',
  ];
  for (const cmd of forbidden) {
    const hit = findBlacklistHit(cmd);
    assert.ok(hit, `必须命中黑名单: ${cmd}`);
    assert.throws(
      () => assertAllowed('pc_shell', { command: cmd }),
      (e) => e.code === 'blacklist',
      `必须被硬拒: ${cmd}`,
    );
  }
});

test('GC-P4-2b · 正常命令**不**被误伤', () => {
  const allowed = [
    'echo hi',
    'npm run build',
    'git status',
    'dir',
    'type package.json',
    'node script.js --out=C:\\temp\\x',
    'python -c "print(1)"',
    'Remove-Item -Recurse -Force C:\\work\\myapp',
    'del /f /s /q C:\\work\\build',
  ];
  for (const cmd of allowed) {
    assert.equal(findBlacklistHit(cmd), null, `不该命中黑名单: ${cmd}`);
    assert.doesNotThrow(() => assertAllowed('pc_shell', { command: cmd }), cmd);
  }
});

test('黑名单只管 pc_shell（别的工具不受影响）', () => {
  // ⚠️ 不是「命令」的工具不该被命令黑名单拦 —— 路径参数里带 "format" 是合法的文件名。
  assert.doesNotThrow(() => assertAllowed('pc_read_file', { path: 'C:\\temp\\format.txt' }));
});

// ===========================================================================
// L-24k · 绝不复用 scheduled
// ===========================================================================

test('L-24k · 端侧执行没有 scheduled 旁路（args 里带 scheduled 也不放行黑名单命令）', () => {
  assert.throws(
    () => assertAllowed('pc_shell', { command: 'format C:', scheduled: true }),
    (e) => e.code === 'blacklist',
    'scheduled=true 是服务端的定时任务放行旁路，端侧**绝不**复用（L-24k）',
  );
});

// ===========================================================================
// 审计：30 天 + 一键清空
// ===========================================================================

test('审计：落盘 + 读回 + 一键清空', () => {
  clearAudit();
  // ⚠️ 时间戳**显式**给 —— 两条都写 Date.now() 可能落在同一毫秒，
  //    排序就变成「插入顺序」⇒ 断言会时好时坏（ flaky）。
  const t0 = Date.now() - 1000;
  appendAudit({ ts: t0, tool: 'pc_shell', outcome: 'allowed', summary: 'echo hi' });
  appendAudit({ ts: t0 + 500, tool: 'pc_write_file', outcome: 'error', reason: 'tool_error' });
  assert.ok(fs.existsSync(auditFile()), '审计文件必须落盘');

  const rows = readAudit(10);
  assert.equal(rows.length, 2, '读回两条');
  assert.equal(rows[0].tool, 'pc_write_file', '最新的在前');

  const cleared = clearAudit();
  assert.equal(cleared.cleared, 2);
  assert.equal(readAudit(10).length, 0, '清空后读不到');
});

test('审计：超过 30 天的条目被剔掉（保留期是硬要求）', () => {
  clearAudit();
  const old = Date.now() - AUDIT_RETENTION_MS - 60 * 1000;
  appendAudit({ ts: old, tool: 'pc_shell', outcome: 'allowed' });
  appendAudit({ ts: Date.now(), tool: 'pc_shell', outcome: 'allowed' });
  const rows = readAudit(10);
  assert.equal(rows.length, 1, '过期条目必须被剔掉');
  assert.equal(rows[0].ts > old, true);
});

test('审计：半截行（写一半被杀）不许让读取炸掉', () => {
  clearAudit();
  appendAudit({ ts: Date.now(), tool: 'pc_shell', outcome: 'allowed' });
  fs.appendFileSync(auditFile(), '{"ts":123,"tool":"pc_sh', 'utf8');   // 半截 JSON
  const rows = readAudit(10);
  assert.equal(rows.length, 1, '半截行被跳过，其余照常');
});

test('审计摘要只记前 N 个字符（不把整段文件内容写进审计）', () => {
  const long = 'x'.repeat(5000);
  const s = summarizeCommand(long);
  assert.ok(s.length <= 201, `摘要必须截断, 实际 ${s.length}`);
  assert.ok(s.endsWith('…'));
});

// ===========================================================================
// 闸门配置文件
// ===========================================================================

test('闸门状态落盘（重启后仍然是用户选的那个）', () => {
  writeGateState({ masterEnabled: false, killSwitch: true });
  assert.ok(fs.existsSync(gateConfigFile()));
  const st = readGateState();
  assert.equal(st.masterEnabled, false);
  assert.equal(st.killSwitch, true);
  writeGateState({ masterEnabled: true, killSwitch: false });
});
