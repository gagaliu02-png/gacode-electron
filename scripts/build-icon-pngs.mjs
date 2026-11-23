// scripts/build-icon-pngs.mjs —— 生成 extraResources 需要的**中间尺寸 PNG**（T-122 · A 方案）
//
// Run: node scripts/build-icon-pngs.mjs
//
// ## 为什么需要它（T-122 的根因链）
//
//   1. `.gitignore` 把 `build/icon-{16,32,48,64,128}.png` 当**中间产物**忽略
//      ⇒ 进 git 的只有 `icon-source.png` + `icon-256.png` + `icon.ico`；
//   2. ⇒ **任何新 clone / worktree 的 build/ 里都没有 icon-16.png**；
//   3. `electron-builder.yml` 的 `extraResources: from: build/icon-16.png` 缺文件时
//      **只 warn 不 fail** ⇒ 出包照样 exit 0；
//   4. ⇒ 产物 `resources/` 里没有 icon-16.png ⇒ `electron/icon.ts` 解析托盘图标失败
//      ⇒ 按它的「失败不让 app 起不来」策略返回**空图** ⇒ **Windows 托盘槽空白**。
//
//   ⇒ 修法：出包前在**构建期**现生成这些 PNG（源图 `build/icon-source.png` 已提交）
//      ⇒ 不依赖任何本地残留文件，任何 checkout 出包都自带托盘图标。
//
// ## 只生成 PNG，**不碰 build/icon.ico**
//
//   `build/icon.ico` 是**已提交**的产物（多尺寸 ico，electron-builder 的 win.icon 要用）。
//   本脚本刻意不重新合成它 ⇒ ① 不把已提交的二进制改脏（git status 保持干净）
//   ② 不引入 `png-to-ico` 依赖。
//
// ## 缩放实现：PowerShell System.Drawing（HighQualityBicubic）
//
//   纯 node 没有 PNG 解码器（仓库里没有 sharp / pngjs），而 `png-to-ico` 只做 ico 合并不做缩放。
//   Windows 自带 System.Drawing ⇒ 零新依赖（与仓库里既有的 build-icon.mjs 同一手法）。
//   ⚠️ 仅限 Windows 构建机（本次就是）。

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'build');
const srcPng = join(buildDir, 'icon-source.png');

/** 要生成的尺寸（electron-builder 只用 16；其余给窗口/托盘/高分屏留用）。 */
export const ICON_SIZES = [16, 32, 48, 64, 128];

if (!existsSync(srcPng)) {
  console.error(`[icon] 缺源图: ${srcPng}`);
  console.error('[icon] icon-source.png 是**已提交**的文件 ⇒ 请先 git checkout 回来（不要手搓）');
  process.exit(1);
}

// PowerShell 脚本：System.Drawing 等比缩到各尺寸并存 PNG。
// CJK-free heredoc ⇒ PS5.1 + zh locale 不会把非 ASCII 字节搞乱（同 build-icon.mjs 的做法）。
const psScript = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile('${srcPng.replace(/\\/g, '\\\\')}')
$sizeMap = @(${ICON_SIZES.join(', ')})
$outDir = '${buildDir.replace(/\\/g, '\\\\')}'
foreach ($sz in $sizeMap) {
    $bmp = New-Object System.Drawing.Bitmap $sz, $sz
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = 'HighQualityBicubic'
    $g.SmoothingMode = 'HighQuality'
    $g.PixelOffsetMode = 'HighQuality'
    $g.DrawImage($src, 0, 0, $sz, $sz)
    $path = Join-Path $outDir ("icon-" + $sz + ".png")
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose()
    Write-Host "[icon] wrote $path"
}
$src.Dispose()
`;

console.log('[icon] 用 PowerShell System.Drawing 缩放 icon-source.png ...');
execFileSync(
  'powershell.exe',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
  { stdio: 'inherit' }
);

const missing = ICON_SIZES.filter((sz) => !existsSync(join(buildDir, `icon-${sz}.png`)));
if (missing.length) {
  console.error(`[icon] 生成后仍缺: ${missing.map((s) => `icon-${s}.png`).join(', ')}`);
  process.exit(2);
}
console.log(`[icon] 完成：${ICON_SIZES.map((s) => `icon-${s}.png`).join(' ')}`);
