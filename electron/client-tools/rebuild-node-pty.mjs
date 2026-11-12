// [2026-11-12 · P3] 把 node-pty 重编译成 **Electron 的 ABI**。
//
// ## 为什么必须做这一步
//
// node-pty 是**原生模块**。npm/pnpm 装下来的是 **Node ABI** 的 prebuild
// （`prebuilds/win32-x64/*.node`）⇒ 在 Electron 里 `require` 会报：
//
//   Error: The module '...\conpty.node' was compiled against a different
//   Node.js version using NODE_MODULE_VERSION 127. This version of Node.js
//   requires NODE_MODULE_VERSION 115.
//
// （Electron 32 = Node 20 = ABI 115；本机 Node 24 = ABI 127。）
//
// ⇒ 必须用 `electron-rebuild` 按**目标 Electron 版本**重编。
//
// ## 为什么还得多这一步（拷 DLL）
//
// `electron-rebuild` 会先清 `build/Release/` ⇒ node-pty 自己 postinstall 拷进去的
// `conpty/conpty.dll` + `conpty/OpenConsole.exe` 会被抹掉。
// 而 `src/win/conpty.cc` 是用 `GetModuleFileName` 定位**同目录**下的
// `conpty\conpty.dll` 的 ⇒ DLL 没了，运行时直接报错。
// ⇒ 重编完把那两个文件**直接拷**回去。
//
// ⚠️ 这里**不**跑 node-pty 自带的 postinstall 脚本 —— 我们只做「拷两个文件」
//    这件事，自己拷更可控（也不会执行外部包里的代码）。
//
// ## 为什么失败**不**让 install 挂掉
//
// 有些机器没装 VS BuildTools ⇒ 编不了。挂掉 install 会连带整个仓都装不上
// （连 `npm test` 都跑不了）⇒ 编译失败只**告警**，
// 真正跑不起来的时候由 PC 端在启动时探测并把端侧执行置灰。
//
// 运行: node electron/client-tools/rebuild-node-pty.mjs
//       （package.json 的 `rebuild:node-pty` 调它）
//
// ⚠️ 为什么放在 `electron/client-tools/` 而不是 `scripts/` ——
//    仓库的 `.gitignore` 有 `scripts/*`（构建产物都堆那儿）⇒ 放 scripts/ 会被 ignore 掉。

import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

/** 目标 Electron 版本 —— 从 package.json 的 devDependencies 里取。 */
function electronVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const range = String(pkg.devDependencies?.electron || '');
    const m = range.match(/(\d+)\.(\d+)\.(\d+)/);
    return m ? `${m[1]}.${m[2]}.${m[3]}` : null;
  } catch (_) {
    return null;
  }
}

/** 把 conpty 的两个运行时文件拷回 `build/Release/conpty/`。 */
function copyConptyRuntime(ptyDir) {
  const thirdParty = join(ptyDir, 'third_party', 'conpty');
  if (!existsSync(thirdParty)) return false;
  const versions = readdirSync(thirdParty);
  if (!versions.length) return false;
  const src = join(thirdParty, versions[0], `win10-${process.arch}`);
  const dest = join(ptyDir, 'build', 'Release', 'conpty');
  mkdirSync(dest, { recursive: true });
  for (const file of ['conpty.dll', 'OpenConsole.exe']) {
    const from = join(src, file);
    if (!existsSync(from)) return false;
    copyFileSync(from, join(dest, file));
  }
  return true;
}

function main() {
  const version = electronVersion();
  if (!version) {
    console.warn('[node-pty] 读不到 electron 版本 ⇒ 跳过重编（端侧执行会不可用）');
    return;
  }
  console.log(`[node-pty] 重编译成 Electron ${version} 的 ABI …`);
  try {
    execFileSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['electron-rebuild', '-f', '-w', 'node-pty', '-v', version],
      { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' },
    );
  } catch (e) {
    console.warn(
      '[node-pty] ⚠️ 重编失败（多半是没装 VS BuildTools）⇒ 端侧执行在 Electron 里会加载失败。',
    );
    console.warn('[node-pty]   装法: Visual Studio Build Tools + 「使用 C++ 的桌面开发」工作负载。');
    return;
  }

  // 重编把 DLL 抹了 ⇒ 补回来
  const ptyDir = join(ROOT, 'node_modules', 'node-pty');
  if (copyConptyRuntime(ptyDir)) {
    console.log('[node-pty] conpty.dll / OpenConsole.exe 已补齐 ✔');
  } else {
    console.warn('[node-pty] ⚠️ 没找到 conpty 运行时文件 ⇒ Electron 里 spawn 会失败');
  }
  console.log('[node-pty] 完成 ✔');
}

main();
