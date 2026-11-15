// [2026-11-15 · 订正 31 · M0] 浏览器端侧工具（`pc_browser_open`）单测
//
// 契约依据: 根目录 docs/design/pc-browser-agent-2026-11.md
//   根目录 docs/ **不是 git 仓** ⇒ 关键条款复述在本文件 + commit message。
//
// ## 覆盖断言
//
//   GC-P31-01  URL 校验：只放 http/https，⛔ file:/javascript:/data: 硬拒
//   GC-P31-02  活 tab 判定：webContents 已销毁 ⇒ 不算活 tab（用户关了）
//   GC-P31-03  ★ **共用**：池里已有同 url 活 tab ⇒ 不新开，返回 reused=true
//   GC-P31-04  ★ **关了自己再起来**：池里没有活 tab ⇒ 调 pool.open() 重建
//   GC-P31-05  主进程未接线 ⇒ 明确 error（不静默挂起、不假装成功）
//   GC-P31-06  ⛔ 端侧不拼模型上下文：stdout ≤ 1 KB、不含 HTML / cookie
//   GC-P31-07  打开失败 ⇒ status:'error' 且带原因（如实回报，不吞）
//
// ⚠️ 本文件**不 import electron** —— `browser.ts` 里 electron 是 `import type`
//    （Node 类型剥离会整条删掉）⇒ 能直接被 node --test 加载。
//    池用假对象注入，不起真窗口。
//
// 运行: node --test test/pc-browser-open-m0.test.mjs   (完全离线)

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  normalizeBrowserUrl,
  findLiveTabId,
  pcBrowserOpen,
  setBrowserTabPool,
  hasBrowserTabPool,
} = await import('../electron/client-tools/browser.ts');

// ── 假 BrowserView（只实现 browser.ts 会碰的两个成员）───────────────────
function fakeView(destroyed = false) {
  return { webContents: { isDestroyed: () => destroyed } };
}
function fakeEntry(url, destroyed = false) {
  return { view: fakeView(destroyed), url, createdAt: Date.now() };
}

// ===========================================================================
// GC-P31-01 · URL 校验
// ===========================================================================

test('GC-P31-01 URL 校验：http/https 放行，其余硬拒', () => {
  assert.equal(
    normalizeBrowserUrl('https://www.xiaohongshu.com/search?q=abc'),
    'https://www.xiaohongshu.com/search?q=abc',
  );
  assert.equal(normalizeBrowserUrl('  http://localhost:3000/  '), 'http://localhost:3000/');

  for (const bad of [
    '',
    '   ',
    null,
    undefined,
    123,
    'not a url',
    'file:///C:/secret.txt',
    'javascript:alert(1)',
    'data:text/html,<h1>x</h1>',
    'ftp://example.com/',
  ]) {
    assert.throws(() => normalizeBrowserUrl(bad), /pc_browser_open/, `应拒绝: ${String(bad)}`);
  }
  // 理由要说人话（模型看得懂为什么被拒）
  assert.match(
    (() => { try { normalizeBrowserUrl('file:///C:/x'); return ''; } catch (e) { return e.message; } })(),
    /只支持 http\/https/,
  );
});

// ===========================================================================
// GC-P31-02 · 活 tab 判定
// ===========================================================================

test('GC-P31-02 已销毁的 tab 不算活 tab（用户关掉了）', () => {
  const entries = new Map([
    ['tab-dead', fakeEntry('https://example.com/', true)],
    ['tab-live', fakeEntry('https://example.com/', false)],
  ]);
  assert.equal(findLiveTabId(entries, 'https://example.com/'), 'tab-live');
  assert.equal(findLiveTabId(null, 'https://example.com/'), null);
  assert.equal(findLiveTabId(entries, 'https://other.com/'), null);

  // 只剩一个死 tab ⇒ 返回 null ⇒ 走重建分支
  const onlyDead = new Map([['tab-dead', fakeEntry('https://example.com/', true)]]);
  assert.equal(findLiveTabId(onlyDead, 'https://example.com/'), null);
});

// ===========================================================================
// GC-P31-03 / 04 / 05 / 06 / 07 · pcBrowserOpen
// ===========================================================================

function installFakePool(existingEntries, openImpl) {
  const pool = {
    entries: () => existingEntries,
    open: openImpl,
  };
  setBrowserTabPool(pool);
  return pool;
}

test('GC-P31-03 共用：已有同 url 活 tab ⇒ 不新开，返回 reused=true', async () => {
  const entries = new Map([['tab-user', fakeEntry('https://example.com/', false)]]);
  let openCalls = 0;
  installFakePool(entries, async () => { openCalls += 1; return { tabId: 'unused', title: '' }; });
  assert.equal(hasBrowserTabPool(), true);

  const r = await pcBrowserOpen({ url: 'https://example.com/' });
  assert.equal(r.status, 'ok');
  assert.equal(openCalls, 0, '★ 不许另起一个 tab（用户和 agent 共用一个池）');
  const out = JSON.parse(r.stdout);
  assert.equal(out.tabId, 'tab-user');
  assert.equal(out.reused, true);
  assert.equal(out.url, 'https://example.com/');
  setBrowserTabPool(null);
});

test('GC-P31-04 关了自己再起来：没有活 tab ⇒ 调 pool.open() 重建', async () => {
  // 用户关了 ⇒ Map 里那条已被 main.ts 的 destroyed 监听删掉（这里直接给空 Map）
  const entries = new Map();
  let openedUrl = null;
  installFakePool(entries, async (url) => {
    openedUrl = url;
    entries.set('tab-new', fakeEntry(url, false));
    return { tabId: 'tab-new', title: 'Example Domain' };
  });

  const r = await pcBrowserOpen({ url: 'https://example.com/' });
  assert.equal(r.status, 'ok');
  assert.equal(openedUrl, 'https://example.com/');
  const out = JSON.parse(r.stdout);
  assert.equal(out.tabId, 'tab-new');
  assert.equal(out.reused, false);
  assert.equal(out.title, 'Example Domain');
  setBrowserTabPool(null);
});

test('GC-P31-04b 死 tab 也要重建（不是只看 Map 里有没有 key）', async () => {
  const entries = new Map([['tab-dead', fakeEntry('https://example.com/', true)]]);
  let openCalls = 0;
  installFakePool(entries, async (url) => {
    openCalls += 1;
    return { tabId: 'tab-rebuilt', title: '' };
  });
  const r = await pcBrowserOpen({ url: 'https://example.com/' });
  assert.equal(r.status, 'ok');
  assert.equal(openCalls, 1, '死 tab 不算活 ⇒ 必须重建');
  assert.equal(JSON.parse(r.stdout).tabId, 'tab-rebuilt');
  setBrowserTabPool(null);
});

test('GC-P31-05 主进程未接线 ⇒ 明确 error（不静默挂起）', async () => {
  setBrowserTabPool(null);
  assert.equal(hasBrowserTabPool(), false);
  const r = await pcBrowserOpen({ url: 'https://example.com/' });
  assert.equal(r.status, 'error');
  assert.match(r.error, /浏览器池还没接线/);
});

test('GC-P31-01b 非法 URL 在 pcBrowserOpen 里也是 error（不抛到调用方）', async () => {
  installFakePool(new Map(), async () => ({ tabId: 'x', title: '' }));
  const r = await pcBrowserOpen({ url: 'javascript:alert(1)' });
  assert.equal(r.status, 'error');
  assert.match(r.error, /只支持 http\/https/);
  setBrowserTabPool(null);
});

test('GC-P31-06 端侧不拼模型上下文：stdout ≤ 1 KB、不含 HTML / cookie', async () => {
  installFakePool(new Map(), async () => ({ tabId: 'tab-1', title: 'T'.repeat(50) }));
  const r = await pcBrowserOpen({ url: 'https://example.com/' });
  assert.equal(r.status, 'ok');
  assert.ok(r.stdout.length <= 1024, `stdout 超长: ${r.stdout.length}`);
  assert.doesNotMatch(r.stdout, /<html|<body|document\.cookie|set-cookie/i);
  assert.deepEqual(r.artifacts, undefined, 'M0 不产 artifacts（截图在 M2）');
  setBrowserTabPool(null);
});

test('GC-P31-07 打开失败 ⇒ status:error 且带原因（如实回报）', async () => {
  installFakePool(new Map(), async () => { throw new Error('mainWindow not ready'); });
  const r = await pcBrowserOpen({ url: 'https://example.com/' });
  assert.equal(r.status, 'error');
  assert.match(r.error, /打开浏览器失败.*mainWindow not ready/);
  setBrowserTabPool(null);
});
