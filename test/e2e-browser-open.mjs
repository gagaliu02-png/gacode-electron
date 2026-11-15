/**
 * test/e2e-browser-open.mjs —— 订正 31 · M0 **真机**端到端验收
 *
 * 验的是：`pc_browser_open` 在真实 Electron 窗口里，能不能真的开出
 * BrowserView tab 并回 {url, title, tabId}。
 *
 * ## 为什么要有这个脚本
 *
 * 单测用假 BrowserView 对象 ⇒ 只能验逻辑，验不了「BrowserView 真的加到
 * mainWindow 上」「webContents.getTitle() 真拿到标题」。这个脚本补这一格。
 *
 * ## 怎么跑（Git Bash / Windows）
 *
 *   node test/e2e-browser-open.mjs
 *
 * ⚠️ 启动前必须 `env -u ELECTRON_RUN_AS_NODE` —— 宿主 Claude 的 bash 带着
 *    ELECTRON_RUN_AS_NODE=1 ⇒ electron.exe 会退化成普通 Node ⇒ 启动秒退。
 *    本脚本内部已 unset（不依赖调用方记得）。
 *
 * ## 成功判据
 *
 *   stdout 出现 `[e2e:pc_browser_open] {"status":"ok",...}` 且
 *   JSON 里 title === 'Gacode M0 Browser E2E'、reused === false。
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
const TITLE = 'Gacode M0 Browser E2E';

// ── ① 起一个最小本地 HTTP server（browser.ts 只放 http/https）────────────
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><html><head><title>${TITLE}</title></head>
    <body>
      <p id="status">M0 OK 正文</p>
      <a href="https://example.com/">示例链接</a>
      <button id="trigger" onclick="document.getElementById('status').textContent='BUTTON_CLICKED'">提交按钮</button>
      <input placeholder="搜索框">
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
  env.GACODE_E2E_BROWSER_OPEN = url;
  // 生产打包态：electron . 会读 dist/main/index.js（package.json 的 main）
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

  const TIMEOUT_MS = 90000;
  const timer = setTimeout(() => {
    console.error('[e2e] TIMEOUT — killing electron');
    child.kill('SIGKILL');
  }, TIMEOUT_MS);

  const code = await new Promise((resolve) => child.once('exit', resolve));
  clearTimeout(timer);
  server.close();

  // ③ 解析结果
  const line = out.split(/\r?\n/).find((l) => l.includes('[e2e:pc_browser_open] '));
  if (!line) {
    console.error('[e2e] FAIL: 没拿到结果行（详见上方 stdout/stderr）');
    process.exit(1);
  }
  const payload = line.slice(line.indexOf('[e2e:pc_browser_open] ') + '[e2e:pc_browser_open] '.length);
  let r;
  try { r = JSON.parse(payload); } catch { console.error('[e2e] FAIL: 结果不是 JSON:', payload); process.exit(1); }

  if (r.status !== 'ok') {
    console.error('[e2e] FAIL: status != ok', r);
    process.exit(1);
  }
  const data = JSON.parse(r.stdout);
  const problems = [];
  if (data.url !== url) problems.push(`url 不符: ${data.url}`);
  if (data.title !== TITLE) problems.push(`title 不符: "${data.title}"`);
  if (data.reused !== false) problems.push('首次打开不该是 reused=true');
  if (!data.tabId || !String(data.tabId).startsWith('tab-')) problems.push(`tabId 不对: ${data.tabId}`);

  // ④ ★ 共用：同 url 第二次 ⇒ reused=true 且 tabId 不变（真机不许另起一个）
  const reuseLine = out.split(/\r?\n/).find((l) => l.includes('[e2e:pc_browser_open:reuse] '));
  if (!reuseLine) {
    problems.push('没拿到第二次（复用）结果行');
  } else {
    const marker = '[e2e:pc_browser_open:reuse] ';
    let r2, d2;
    try {
      r2 = JSON.parse(reuseLine.slice(reuseLine.indexOf(marker) + marker.length));
      d2 = JSON.parse(r2.stdout);
    } catch { problems.push('复用结果不是 JSON'); }
    if (d2) {
      if (r2.status !== 'ok') problems.push(`复用 status != ok: ${r2.status}`);
      if (d2.reused !== true) problems.push('★ 同 url 没复用（另起了 tab，违反共用）');
      if (d2.tabId !== data.tabId) problems.push(`复用 tabId 变了: ${d2.tabId} vs ${data.tabId}`);
      if (d2.title !== TITLE) problems.push(`复用没回标题: "${d2.title}"`);
    }
  }
  // 只应有一行 "BrowserView opened"（复用不该再开）
  const openedCount = (out.match(/BrowserView opened: tabId=/g) || []).length;
  if (openedCount !== 1) problems.push(`真机开了 ${openedCount} 个 tab（期望 1）`);

  // ⑤ ★ M1 真机 snapshot：executeJavaScript 真抽到正文 + 元素编号表
  const snapLine = out.split(/\r?\n/).find((l) => l.includes('[e2e:pc_browser_snapshot] '));
  if (!snapLine) problems.push('没拿到 snapshot 结果行');  else {
    const marker = '[e2e:pc_browser_snapshot] ';
    let r3, d3;
    try {
      r3 = JSON.parse(snapLine.slice(snapLine.indexOf(marker) + marker.length));
      d3 = JSON.parse(r3.stdout);
    } catch { problems.push('snapshot 结果不是 JSON'); }
    if (d3) {
      if (r3.status !== 'ok') problems.push(`snapshot status != ok: ${r3.status}`);
      if (d3.title !== TITLE) problems.push(`snapshot title 不符: "${d3.title}"`);
      if (!(d3.text.includes('M0 OK'))) problems.push(`正文没抽到: ${JSON.stringify(d3.text)}`);
      if (!Array.isArray(d3.elements) || d3.elements.length < 3)
        problems.push(`元素表不足: ${JSON.stringify(d3.elements && d3.elements.length)}`);
      else {
        const tags = d3.elements.map((e) => e.tag).sort();
        if (!tags.includes('a') || !tags.includes('button') || !tags.includes('input'))
          problems.push(`元素表缺 tag: ${tags}`);
        const hasId = d3.elements.every((e, i) => e.id === `e${i + 1}`);
        if (!hasId) problems.push('元素 id 不是 e1..eN 顺序');
        // ⛔ 不把 href 带出来（example.com/?token 不能泄露）
        if (JSON.stringify(d3).includes('example.com/')) problems.push('元素表把 href 带出来了');
      }
    }
  }

  // ⑥ ★ M2 真机 act：点「提交按钮」→ 页面文字变 BUTTON_CLICKED → snapshot 读到变化
  const actLine = out.split(/\r?\n/).find((l) => l.includes('[e2e:pc_browser_act] '));
  const snap2Line = out.split(/\r?\n/).find((l) => l.includes('[e2e:pc_browser_snapshot:after] '));
  if (!actLine) problems.push('没拿到 act 结果行');
  else {
    const m = '[e2e:pc_browser_act] ';
    let ra;
    try { ra = JSON.parse(actLine.slice(actLine.indexOf(m) + m.length)); } catch { problems.push('act 结果不是 JSON'); }
    if (ra && ra.status !== 'ok') problems.push(`act status != ok: ${ra.status} ${ra.error || ''}`);
  }
  if (!snap2Line) problems.push('没拿到点击后 snapshot 行');
  else {
    const m = '[e2e:pc_browser_snapshot:after] ';
    let r4, d4;
    try {
      r4 = JSON.parse(snap2Line.slice(snap2Line.indexOf(m) + m.length));
      d4 = JSON.parse(r4.stdout);
    } catch { problems.push('点击后 snapshot 不是 JSON'); }
    if (d4) {
      // ★ 关键：点击真的生效了（onclick 改了 <p> 内容）
      if (!(d4.text.includes('BUTTON_CLICKED')))
        problems.push(`★ 点击没生效：正文仍是 ${JSON.stringify(d4.text)}` +
          (d4.text.includes('M0 OK') ? '（按钮 onclick 跑了吗？isTrusted 事件没触发合成 click？）' : ''));
    }
  }

  if (problems.length) {
    console.error('[e2e] FAIL:', problems.join(' | '), data);
    process.exit(1);
  }
  console.log('[e2e] PASS ✅', JSON.stringify(data), '| reuse ✅ | opened tabs =', openedCount,
    `| (electron exit=${code}, stderr ${err.length}B)`);
  process.exit(0);
}

main().catch((e) => { console.error('[e2e] ERROR', e); server.close(); process.exit(1); });
