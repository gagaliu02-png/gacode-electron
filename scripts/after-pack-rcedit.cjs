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
 * @param {object} context electron-builder 的 afterPack 上下文
 */
async function afterPack(context) {
  if (!context || context.electronPlatformName !== 'win') return;

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  if (!fs.existsSync(exePath)) {
    console.warn(`[after-pack] 找不到 exe（跳过版本资源写入）: ${exePath}`);
    return;
  }

  const rcedit = findRcedit();
  if (!rcedit) {
    console.warn('[after-pack] 找不到 rcedit-x64.exe（跳过版本资源写入）');
    return;
  }

  // 取值口径与 electron-builder 默认一致（见文件头注释）。
  const pkgPath = path.join(context.appOutDir, 'package.json');
  let description = '';
  let version = context.packager.appInfo.version;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    description = pkg.description || '';
    if (pkg.version) version = pkg.version;
  } catch (_) { /* 用默认 */ }

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
  execFileSync(rcedit, [exePath, ...versionArgs, ...iconArgs], { stdio: 'inherit' });

  console.log(`[after-pack] 版本资源写入完成（一次调用 · 不带空的 OriginalFilename）: ${exePath}  product=${productVersion}`);
};

// ★ electron-builder 的 resolveFunction()：`m["afterPack"]` 为空 ⇒ 取 `m.default || m`
//   ⇒ 只挂 exports.default 它拿到的是**空对象** ⇒ `handler(context)` 抛 TypeError
//   ⇒ **静默失败**（构建照过、版本资源根本没写）⇒ 两种都挂。
module.exports = afterPack;
module.exports.default = afterPack;
