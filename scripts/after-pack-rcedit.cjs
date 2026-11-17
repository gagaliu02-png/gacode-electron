// ============================================================================
// afterPack 钩子 —— **自己分两步调 rcedit**（electron-builder 自己调会失败）
// ============================================================================
//
// ## 为什么要接管（2026-11-17 · 出 0.7.30 包时踩到）
//
//   electron-builder 用 `winCodeSign-2.6.0` 里的 **rcedit 0.2.0** 改 exe 的版本资源，
//   一次调用里塞了 **5 个 `--set-version-string` + `--set-file-version` +
//   `--set-product-version` + `--set-icon`** ⇒ 在**我们的 exe**（electron-builder 打包出来的
//   186MB Gacode.exe）上**必然失败**：
//
//   ```
//   ⨯ cannot execute  cause=exit status 1
//     Fatal error: Unable to commit changes
//   ```
//
//   ### 隔离实验（同一台机器、同一份 exe，逐个参数试出来的）
//
//   | 组合 | 结果 |
//   |---|---|
//   | 我们的 exe + **1 个** version-string（无 icon） | ✅ |
//   | 我们的 exe + **2 个** version-string（无 icon） | ✅ |
//   | 我们的 exe + **1 个** version-string + **icon** | ✅ |
//   | 我们的 exe + **4 个** version-string + versions + icon（**不含空值**）| ✅ |
//   | 我们的 exe + **含 `--set-version-string OriginalFilename ''`（空值）** | ❌ **Unable to commit changes** |
//   | **拆成两次调用**（先版本串后图标 / 先图标后版本串）| ❌ 第二次必炸 |
//   | **全新** electron.exe + 多个 version-string + icon（含空值）| ❌ 同样炸 |
//
//   ⇒ **真凶 = 那个空的 `OriginalFilename ''`** —— rcedit 0.2.0 收到空字符串参数就写不进资源。
//   ⇒ electron-builder 的默认调用**固定带**这个空值 ⇒ 必炸（跟「exe 被锁」无关 —— 本次在
//   全新输出目录里、旧版本在跑的情况下照样复现 ⇒ 老笔记里「杀掉在跑的 Gacode 就好」是误判）。
//   ⇒ **解法 = 一次调用、不带空值**（版本串 + file/product version + icon 一起写）。
//
// ## 为什么不能靠「杀掉在跑的 Gacode」
//
//   老笔记里记的是「在跑的 Gacode 锁住 exe ⇒ rcedit 提交失败」⇒ 杀掉就成功。
//   ⇒ 但本次**杀不掉**也能复现（exe 在全新的输出目录里、跑的是另一个目录的旧版）
//   ⇒ 真因是**参数组合**，不是锁 ⇒ 靠杀进程是治标不治本。
//
// ## 怎么做
//
//   `electron-builder.yml` 里设 `win.signAndEditExecutable: false`（⇒ electron-builder **不**调 rcedit）
//   + `afterPack: scripts/after-pack-rcedit.cjs`（⇒ 本文件接管，两步走）。
//
//   ⚠️ 版本串的取值与 electron-builder 默认**一致**（FileDescription 取 package.json 的
//   `description`，LegalCopyright 取 yml 的 `copyright`，OriginalFilename 取 exe 文件名）
//   ⇒ 产物上的版本资源跟以前逐字相同。

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

/** electron-builder 的 winCodeSign 缓存根目录。 */
function winCodeSignCacheDir() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  return path.join(local, 'electron-builder', 'Cache', 'winCodeSign');
}

/** 在缓存里找 rcedit-x64.exe（版本目录会变 ⇒ 找最新的那个）。 */
function findRcedit() {
  const root = winCodeSignCacheDir();
  const candidates = [];
  let dirs = [];
  try { dirs = fs.readdirSync(root); } catch (_) { return null; }
  for (const d of dirs) {
    const p = path.join(root, d, 'rcedit-x64.exe');
    if (fs.existsSync(p)) {
      candidates.push({ p, mtime: fs.statSync(p).mtimeMs });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].p;
}

/**
 * ★ [2026-11-17 · 修] 带**重试**地写版本资源。
 *
 * ## 真凶（实测隔离，别再改口）
 *
 *   同样的参数，**构建刚结束**时失败、**几分钟后**再跑就成功 ⇒
 *   **临时锁**：Defender / Windows Search Indexer 正在扫描这个**刚写出来**的 exe
 *   ⇒ rcedit 打不开它 ⇒ "Unable to commit changes"。
 *   ⚠️ 不是「空值参数」（实测：空 OriginalFilename + 全新 exe 也能过）；
 *   ⚠️ 也不是「中文」（实测：中文 FileDescription 在全新 exe 上一遍就过）；
 *   ⚠️ 也不是「输出目录被复用」（实测：全新目录同样会撞）。
 *
 *   ⇒ 解法 = **重试 + 退避**（锁几十秒内会松开）+ **不炸构建**。
 */
async function writeVersionResource(rcedit, exePath, args, attempts = 8) {
  for (let i = 1; i <= attempts; i++) {
    try {
      execFileSync(rcedit, [exePath, ...args], { stdio: 'pipe' });
      return true;
    } catch (err) {
      const first = String((err && err.message) || '').split('\n')[0];
      if (i < attempts) {
        console.warn(
          `[after-pack] rcedit 第 ${i}/${attempts} 次失败（多半是 Defender/Search Indexer `
          + `正在扫描这个刚写出来的 exe ⇒ 临时锁）: ${first}`,
        );
        await new Promise((r) => setTimeout(r, 5000 * i));   // 5s / 10s / 15s … 退避
      } else {
        console.error(`[after-pack] ⛔ rcedit 重试 ${attempts} 次仍失败: ${first}`);
      }
    }
  }
  return false;
}

/**
 * @param {object} context electron-builder 的 afterPack 上下文
 */
async function afterPack(context) {
  // ⚠️⚠️ [2026-11-17 · 修] `context.electronPlatformName` 的值是 **`win32`**
  //   （= Electron 的 `platform.nodeName` = Node 的 process.platform），
  //   **不是** `'win'` ⇒ 旧版这道守卫在 Windows 上**永远成立** ⇒ 钩子**静默什么都不做**
  //   ⇒ 构建照过、**版本资源根本没写**（实测 0.7.30 的 exe 仍是 Electron 32.3.3）。
  //   ⇒ 两个写法都收（'win32' 是事实，'win' 留着兼容别处）。
  console.log('[after-pack] 钩子已触发（platform=' + String(context && context.electronPlatformName) + '）');
  if (!context) return;
  const platformName = String(context.electronPlatformName || '').toLowerCase();
  if (platformName !== 'win32' && platformName !== 'win') return;

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  if (!fs.existsSync(exePath)) {
    console.error(`[after-pack] ⛔ 找不到 exe（**版本资源没写**）: ${exePath}`);
    return;
  }

  const rcedit = findRcedit();
  if (!rcedit) {
    console.error(`[after-pack] ⛔ 找不到 rcedit-x64.exe（**版本资源没写**），缓存目录: ${winCodeSignCacheDir()}`);
    return;
  }

  // 取值口径与 electron-builder 默认一致（见文件头注释）。
  //
  // ⚠️⚠️ [2026-11-17 · 修] **不能**从 `appOutDir/package.json` 读 description ——
  //   应用打成 **app.asar** 了 ⇒ 那个路径**不存在** ⇒ 读失败 ⇒ FileDescription 写成空串
  //   （实测 0.7.31 第一版：ProductName 对了，FileDescription 是空的）。
  //   ⇒ 正确来源 = `packager.appInfo.description`（electron-builder 自己从 package.json
  //      的 metadata 取的，跟它默认那次 rcedit 同源）。
  const pkgPath = path.join(context.appOutDir, 'package.json');
  let description = '';
  let version = context.packager.appInfo.version;
  try {
    description = (context.packager.appInfo && context.packager.appInfo.description) || '';
  } catch (_) { /* 用默认 */ }
  if (!description) {
    // 兜底：项目根的 package.json（appOutDir 里没有时）
    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(context.packager.projectDir, 'package.json'), 'utf8'),
      );
      description = pkg.description || '';
      if (pkg.version) version = pkg.version;
    } catch (_) { /* 用默认 */ }
  }

  const copyright = (context.packager.platformSpecificBuildOptions
    && context.packager.platformSpecificBuildOptions.copyright) || 'Copyright © 2026 gaga';

  // buildVersion（electron-builder 的 `buildVersion` 字段）⇒ 文件版本；产品版本用 package.json 的。
  const buildVersion = (context.packager.config && context.packager.config.buildVersion) || version;
  const productVersion = `${version}.0`;

  const iconPath = path.join(context.packager.config.directories.buildResources, 'icon.ico');

  // ── 一次调用写完：版本串 + 文件/产品版本 + 图标 ────────────────────────────
  //
  //   ⚠️⛔ **绝对不许写 `--set-version-string OriginalFilename ''`（空值）** ——
  //   rcedit 0.2.0 收到空字符串参数就会写不进资源 ⇒ 「Unable to commit changes」。
  //   （这就是 electron-builder 自己那次调用失败的**真凶**：它固定带一个空的
  //     OriginalFilename ⇒ 必炸；跟「exe 被锁」无关 —— 2026-11-17 在全新输出目录里、
  //     旧版本在跑的情况下照样复现。）
  //
  //   ⚠️ 也**不要**拆成两次调用（先版本串后图标 / 先图标后版本串都试过 ⇒ 第二次必炸）。
  //
  //   ⇒ 一次调用、**不带空值**、带上 `--set-file-version` / `--set-product-version` ⇒ 一次过。
  const versionArgs = [
    '--set-version-string', 'FileDescription', description,
    '--set-version-string', 'ProductName', context.packager.appInfo.productName,
    '--set-version-string', 'LegalCopyright', copyright,
    '--set-version-string', 'InternalName', context.packager.appInfo.productName,
    '--set-file-version', String(buildVersion),
    '--set-product-version', productVersion,
  ];
  const iconArgs = fs.existsSync(iconPath) ? ['--set-icon', iconPath] : [];
  const ok = await writeVersionResource(rcedit, exePath, [...versionArgs, ...iconArgs]);
  if (!ok) {
    // ⛔ 不炸构建（炸了整个包都出不来），但必须喊出来（别再默默出 Electron 默认资源）。
    console.error(
      '[after-pack] ⛔ 版本资源没写成 ⇒ exe 的版本资源会是 Electron 默认值'
      + '（重打一遍通常就好；或手动跑一次 rcedit）',
    );
    return;
  }

  console.log(`[after-pack] 版本资源写入完成（一次调用 · 不带空的 OriginalFilename）: ${exePath}  product=${productVersion}`);
};

// ★ electron-builder 的 resolveFunction()：`m["afterPack"]` 为空 ⇒ 取 `m.default || m`
//   ⇒ 只挂 exports.default 它拿到的是**空对象** ⇒ `handler(context)` 抛 TypeError
//   ⇒ **静默失败**（构建照过、版本资源根本没写）⇒ 两种都挂。
module.exports = afterPack;
module.exports.default = afterPack;
