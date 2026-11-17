/**
 * test/e2e-browser-dock.mjs —— [2026-11-17 · T-027-d0ck] **真机**端到端验收：停靠
 *
 * 验的是「agent 的 BrowserView 真的停进了内容区矩形」这件事 —— 单测用假 view
 * 只能验逻辑，验不了「真实 BrowserView 的 bounds」「真实 guest 的 innerWidth」。
 *
 * 怎么跑（Git Bash / Windows）
 *
 *   node test/e2e-browser-dock.mjs
 *
 * ⚠️ 启动前必须 `env -u ELECTRON_RUN_AS_NODE`（宿主 Claude 的 bash 带着
 *    ELECTRON_RUN_AS_NODE=1 ⇒ electron.exe 退化成普通 Node ⇒ 启动秒退）。
 *    本脚本内部已 unset。
 *
 * 成功判据（stdout 里逐条打）
 *
 *   [e2e:dock:bounds]      = {x:256,y:96,width:900,height:600}   ← 不是窗口全尺寸
 *   [e2e:dock:viewport]    = {w:900,h:600}                        ← 视口 = 矩形
 *   [e2e:dock:viewport:parked] = {w:900,h:600}                    ← 停泊后尺寸不变
 *   [e2e:dock:snapshot:after] 正文含 BUTTON_CLICKED               ← 停靠下 trusted click 生效
 *   [e2e:dock:alive]       = false                                ← close 真关掉了
 *
 * ⚠️ 本脚本**不提交到生产路径**：它只是验收工具，`npm test` 不会跑到
 *    （文件名不以 `.test.mjs` 结尾）。
 */

import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const TITLE = 'Gacode T027 Dock E2E';

// ── ① 最小本地 HTTP server（browser.ts 只放 http/https）─────────────────
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><head><title>${TITLE}</title></head>
    <body>
      <p id="status">DOCK OK 正文</p>
      <a href="https://example.com/">示例链接</a>
      <button id="trigger" onclick="document.getElementById('status').textContent='BUTTON_CLICKED'">提交按钮</button>
      <input placeholder="搜索框">
      <button id="trigger2" onclick="document.getElementById('status').textContent='SHOT_CLICKED'">第二个按钮</button>
    </body></html>`);
});

function listen() {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

async function main() {
  if (!fs.existsSync(ELECTRON)) throw new Error(`找不到 electron: ${ELECTRON}`);
  const port = await listen();
  const url = `http://127.0.0.1:${port}/`;

  // ② 关键：清掉 ELECTRON_RUN_AS_NODE（记忆里的启动秒退陷阱）
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  env.GACODE_E2E_BROWSER_DOCK = url;
  env.NODE_ENV = 'production';

  console.log(`[e2e] launching electron with ${url}`);
  const child = spawn(ELECTRON, ['.'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let out = '';
  let err = '';
  child.stdout.on('data', (b) => { out += b.toString(); process.stdout.write(b); });
  child.stderr.on('data', (b) => { err += b.toString(); process.stderr.write(b); });

  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill(); resolve(-1); }, 90000);
    child.on('exit', (c) => { clearTimeout(timer); resolve(c ?? -1); });
  });
  server.close();

  // ★ 验 PNG 是**真的 PNG**（魔数 + IHDR 尺寸），且尺寸 = 视口 × dpr
  const pngPath = (out.match(/\[e2e:dock:shot:path\] (.+)/) || [])[1];
  let pngOk = false;
  if (pngPath && fs.existsSync(pngPath.trim())) {
    try {
      const buf = fs.readFileSync(pngPath.trim());
      const isMagic = buf.length > 24
        && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      // ⚠️ shot 那行 stdout 是**转义过的 JSON 字符串** ⇒ 别去抠它 ⇒ 主进程单独打一行 scale
      const scale = Number((out.match(/\[e2e:dock:shot:scale\] ([\d.]+)/) || [])[1] || 1);
      console.log(`[e2e] png magic=${isMagic} size=${w}x${h} scale=${scale}`);
      pngOk = isMagic && w > 0 && h > 0 && Math.abs(w / scale - 900) < 2;
    } catch (e) {
      console.log('[e2e] png read failed: ' + e.message);
    }
  }

  console.log('\n──────── 判据 ────────');
  const checks = [
    ['① bounds = 上报矩形（不是窗口全尺寸）',
      /\[e2e:dock:bounds\] \{"x":256,"y":96,"width":900,"height":600\}/],
    ['② 视口 = 矩形尺寸', /\[e2e:dock:viewport\] \{"w":900,"h":600\}/],
    ['③ 停泊后视口尺寸不变', /\[e2e:dock:viewport:parked\] \{"w":900,"h":600\}/],
    ['④ 停靠下 trusted click 生效', /BUTTON_CLICKED/],
    ['⑤ focus 成功', /\[e2e:dock:focus\] \{"status":"ok"/],
    ['⑥ close 成功且 tab 真没了', /\[e2e:dock:alive\] false/],
    ['⑦ 截图回坐标块（viewport/scale/image）', /\[e2e:dock:shot\] \{"status":"ok"/],
    ['⑧ 截图落盘是真 PNG（PNG 魔数 + 尺寸 = 视口 × dpr）', pngOk],
    ['⑨ @shot: 按图上像素坐标点中了第二个按钮', /SHOT_CLICKED/],
  ];
  let bad = 0;
  for (const [label, re] of checks) {
    // 判据可以是布尔（本地算出来的），也可以是正则（对着子进程 stdout 跑）
    const ok = typeof re === 'boolean' ? re : re.test(out);
    if (!ok) bad++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  }
  console.log(`exit=${code}  stderr=${err.length}B`);
  if (bad > 0) {
    console.error(`\n${bad} 条判据未通过。`);
    process.exit(1);
  }
  console.log('\n全部判据通过 ✅');
}

main().catch((e) => {
  console.error('E2E 失败:', e);
  process.exit(1);
});
