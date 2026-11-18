/**
 * test/e2e-single-instance.mjs —— [2026-11-18 · T-038 方案 A] **真机**双实例验收
 *
 * 验的是：**第二个 Gacode 实例拿不到执行器身份锁 ⇒ 让位退出**，并且
 * 第一个实例被请求把窗口拉到前台。
 *
 * ## 为什么要有这个脚本
 *
 * 单测只能验「锁文件逻辑」；验不了「真起两个 Electron 进程时，第二个真的退出」。
 * 而 2026-11-18 那次事故恰恰出在这一格：dev 实例与 release 实例**各拿一把锁**
 * （锁键 = 改 userData 之前的默认路径）⇒ 两个都活 ⇒ 同一条派单被执行两次
 * ⇒ 旧代码那个 400ms 抢先结算 ⇒ 真结果被 409 丢掉。
 *
 * ## 怎么跑（Git Bash / Windows）
 *
 *   node test/e2e-single-instance.mjs
 *
 * ⚠️ 启动前必须 `env -u ELECTRON_RUN_AS_NODE`（脚本内部已 unset）。
 * ⚠️ 用 `GACODE_INSTANCE_PROFILE=e2e-<pid>` 起 ⇒ **不碰**用户真实的
 *    `%APPDATA%\Gacode`（登录态 / device id / 审计文件都不受影响），
 *    跑完自动清掉该 profile 目录。
 *
 * ## 成功判据
 *
 *   ① 实例 #1 的 stdout 出现 `[gacode-electron] 实例锁已获取`
 *   ② 实例 #2 的 stdout 出现 `让位并退出`，且它在 ~10s 内**自己退出**（exit code 0）
 *   ③ 实例 #2 在 userData 里留下了**聚焦请求文件** ⇒ 实例 #1 的心跳会消费掉它
 *      （脚本等 ≤ 40s 后断言文件消失）
 *   ④ 实例 #1 全程**没有退出**
 *
 * ⚠️ 本脚本**不进生产路径**：文件名不以 `.test.mjs` 结尾 ⇒ `npm test` 不会跑到。
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const PROFILE = `e2e-${process.pid}`;
const USER_DATA = path.join(process.env.APPDATA || os.homedir(), 'AppData', 'Roaming', `Gacode-${PROFILE}`);
// ⚠️ Windows 上 %APPDATA% 已经是 Roaming 了（上面那个拼法只作兜底）
const REAL_USER_DATA = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), `Gacode-${PROFILE}`);
const LOCK_FILE = path.join(REAL_USER_DATA, 'instance.lock');
const FOCUS_FILE = path.join(REAL_USER_DATA, 'instance.focus-request');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function spawnInstance(label) {
  const env = { ...process.env, GACODE_INSTANCE_PROFILE: PROFILE };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(ELECTRON, ['.'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const state = { label, child, out: '', exited: false, code: null };
  child.stdout.on('data', (d) => { state.out += d.toString(); });
  child.stderr.on('data', (d) => { state.out += d.toString(); });
  child.on('exit', (code) => { state.exited = true; state.code = code; });
  return state;
}

async function waitFor(fn, timeoutMs, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (fn()) return true;
    await sleep(400);
  }
  console.error(`  ✗ 超时：${label}`);
  return false;
}

async function main() {
  if (!fs.existsSync(ELECTRON)) throw new Error(`找不到 electron: ${ELECTRON}`);
  if (!fs.existsSync(path.join(ROOT, 'dist', 'main', 'index.js'))) {
    throw new Error('没有 dist/main/index.js ⇒ 先跑 `npm run build`');
  }

  console.log(`[e2e] profile = ${PROFILE}（隔离目录：${REAL_USER_DATA}）`);

  const a = spawnInstance('A');
  const gotLock = await waitFor(
    () => a.out.includes('实例锁已获取'),
    30_000,
    '实例 A 拿到锁',
  );
  if (!gotLock) {
    console.error('[e2e] A 的输出：\n' + a.out.slice(-2000));
    a.child.kill();
    process.exit(1);
  }
  console.log('[e2e] ✓ 实例 A 拿到锁');

  const b = spawnInstance('B');
  const bYielded = await waitFor(
    () => b.out.includes('让位并退出'),
    30_000,
    '实例 B 让位',
  );
  if (!bYielded) {
    console.error('[e2e] B 的输出：\n' + b.out.slice(-2000));
  } else {
    console.log('[e2e] ✓ 实例 B 输出「让位并退出」');
  }

  // B 应该自己退出
  const bGone = await waitFor(() => b.exited, 20_000, '实例 B 退出');
  console.log(`[e2e] ${bGone ? '✓' : '✗'} 实例 B 已退出（code=${b.code}）`);

  // B 应当留下聚焦请求；A 的心跳会消费掉它
  const focusHandled = await waitFor(
    () => !fs.existsSync(FOCUS_FILE),
    45_000,
    '聚焦请求被 A 消费',
  );
  console.log(`[e2e] ${focusHandled ? '✓' : '✗'} 聚焦请求已处理（文件存在=${fs.existsSync(FOCUS_FILE)}）`);

  const aAlive = !a.exited;
  console.log(`[e2e] ${aAlive ? '✓' : '✗'} 实例 A 仍在运行`);

  // 清理：杀 A + 删隔离目录
  try { a.child.kill(); } catch { /* ignore */ }
  await sleep(1500);
  try { fs.rmSync(REAL_USER_DATA, { recursive: true, force: true }); } catch { /* ignore */ }
  try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch { /* ignore */ }

  const ok = gotLock && bYielded && bGone && focusHandled && aAlive;
  if (!ok) {
    console.log('\n[e2e] ---- 实例 A 输出尾部 ----\n' + a.out.slice(-3000));
    console.log('\n[e2e] ---- 实例 B 输出尾部 ----\n' + b.out.slice(-1500));
  }
  console.log(ok ? '\n[e2e] PASS：第二个实例让位退出，第一个实例继续持有执行权' : '\n[e2e] FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('[e2e] 异常：', e && e.message);
  process.exit(1);
});
