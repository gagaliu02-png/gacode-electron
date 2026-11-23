// scripts/before-pack-icons.cjs —— electron-builder `beforePack` 钩子（T-122 · A 方案）
//
// ## 干什么
//
//   出包前（打包这一步之前）先把 `build/icon-{16,32,48,64,128}.png` **现生成出来**
//   ⇒ `extraResources` 那条 `from: build/icon-16.png` 一定有源文件
//   ⇒ 产物 `resources/icon-16.png` 一定在
//   ⇒ **Windows 托盘图标不再是空的**。
//
// ## 为什么必须是钩子（而不是"出包的人记得先跑一下"）
//
//   1. `build/icon-16.png` 是 **gitignore 的中间产物** ⇒ 新 clone / worktree 里本来就没有；
//   2. electron-builder 缺 `extraResources` 源文件时**只 warn 不 fail** ⇒ 历史上出了好几个
//      托盘空图标的包（0.7.43 / 0.7.44 实测 resources/ 里都没有 icon-16.png）；
//   3. ⇒ 靠"记得" ⇒ 一定还会再犯 ⇒ 只能靠**构建链自己保证**。
//
// ## 失败策略
//
//   生成失败 ⇒ **直接抛错把出包打断**（绝不让它"warn 一下就过"）：
//   宁可这次没包，也不要出一个托盘空图标的包。
//
//   （`electron/icon.ts` 那边的空图兜底是为了不让 app 起不来；那是**运行期**兜底，
//     这里要的是**构建期**就别放过。）

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const buildDir = path.join(root, 'build');

/** extraResources 里真正要的（其余尺寸一起生成，免得下次又要改）。 */
const REQUIRED = ['icon-16.png'];

/**
 * @param {object} context electron-builder 的打包上下文（本钩子用不上，留着按惯例）。
 */
async function beforePackIcons(context) {
  console.log('[before-pack] 生成图标中间产物（T-122）...');
  execFileSync(process.execPath, [path.join(__dirname, 'build-icon-pngs.mjs')], {
    cwd: root,
    stdio: 'inherit',
  });

  const missing = REQUIRED.filter((f) => !fs.existsSync(path.join(buildDir, f)));
  if (missing.length) {
    throw new Error(
      `[before-pack] 图标生成后仍缺 ${missing.join(', ')}（build/）—— 拒绝出包（会得到空托盘图标的包）。` +
        ` 检查 scripts/build-icon-pngs.mjs 与 build/icon-source.png。`
    );
  }

  console.log('[before-pack] 图标齐了：' + REQUIRED.join(', '));
}

// ★ electron-builder 的 resolveFunction()：`m["beforePack"]` 为空 ⇒ 取 `m.default || m`
//   ⇒ 只挂 exports.default 它拿到的是**空对象** ⇒ `handler(context)` 抛 TypeError
//   ⇒ **静默失败**（构建照过、图标压根没生成）⇒ 两种都挂。
module.exports = beforePackIcons;
module.exports.default = beforePackIcons;
