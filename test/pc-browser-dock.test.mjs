// [2026-11-17 · T-027-d0ck] PC 浏览器「停靠」单测
//
// 覆盖断言：
//   DOCK-1  上报矩形 ⇒ BrowserView 的 bounds **等于**那个矩形（不是窗口全尺寸）
//   DOCK-2  停泊（隐藏）⇒ **尺寸不变**（只移出可视区）—— 缩尺寸会让页面重排
//   DOCK-3  没有矩形 ⇒ **不停靠**（绝不盖住整个客户端）
//   DOCK-4  矩形置 null（用户离开 `/browser` 页）⇒ 全部停泊
//   DOCK-5  矩形变了 ⇒ 已停靠的 view 跟着重放
//   DOCK-6  focus ⇒ 置顶 + webContents 拿到焦点（trusted 输入的前提）
//   DOCK-7  跨会话不串台：兜底选 tab 顺序 = active → 本会话 → 最近创建
//   DOCK-8  复用 tab 的优先级 = 本会话 > 用户自己的 > 别的会话
//   DOCK-9  pc_browser_close 关掉 tab（且只关池里的）
//   DOCK-10 pc_browser_focus 切回自己的页面
//   DOCK-11 computeDockRect：视口坐标 + 滚动偏移；尺寸非正 ⇒ null
//
// ⚠️ 本文件**不 import electron** —— `browser-views.ts` 只 `import type`（被剥掉）
//    ⇒ node --test 能直接加载。池用假对象注入，不起真窗口。
//
// 运行: node --test test/pc-browser-dock.test.mjs   (完全离线)

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  BrowserViewPool,
  normalizeDockRect,
  parkBounds,
  rectsEqual,
  PARK_MARGIN,
} = await import('../electron/browser-views.ts');

const {
  findReusableTabId,
  resolveLiveTab,
  pcBrowserClose,
  pcBrowserFocus,
  setBrowserTabPool,
  normalizeBrowserUrl,
} = await import('../electron/client-tools/browser.ts');

const { computeDockRect } = await import('../src/lib/browser-tabs.ts');

// ── 假宿主 / 假 view ─────────────────────────────────────────────────────
function makeHost() {
  const state = { added: [], removed: [], top: null };
  return {
    state,
    isDestroyed: () => false,
    addBrowserView: (v) => state.added.push(v),
    removeBrowserView: (v) => state.removed.push(v),
    setTopBrowserView: (v) => { state.top = v; },
    getContentBounds: () => ({ width: 1280, height: 800 }),
  };
}

function makeView() {
  return {
    bounds: null,
    focused: 0,
    destroyed: false,
    setBounds(rect) { this.bounds = rect; },
    webContents: {
      isDestroyed() { return this.__d; },
      focus() { this.__f = (this.__f ?? 0) + 1; },
      getTitle() { return 'T'; },
    },
  };
}

/** 让 webContents.isDestroyed() 返回 false（上面的写法要接上）。 */
function liveView() {
  const v = makeView();
  v.webContents.isDestroyed = () => v.destroyed;
  return v;
}

function entry(url, extra = {}) {
  return {
    view: liveView(),
    url,
    createdAt: extra.createdAt ?? Date.now(),
    origin: extra.origin ?? 'agent',
    sessionId: extra.sessionId ?? null,
    lastUsedAt: extra.lastUsedAt ?? extra.createdAt ?? Date.now(),
  };
}

// ===========================================================================
// DOCK-1 ~ DOCK-6 · 池的行为
// ===========================================================================

test('DOCK-1 上报矩形 ⇒ BrowserView 的 bounds 等于那个矩形（不是窗口全尺寸）', () => {
  const host = makeHost();
  const pool = new BrowserViewPool(host);
  const view = liveView();
  pool.add('t1', view, { url: 'https://a.test/', origin: 'agent' });

  const rect = { x: 256, y: 96, width: 900, height: 600 };
  pool.setContentRect(rect);
  pool.dock('t1');

  assert.deepEqual(view.bounds, rect);
  assert.notDeepEqual(view.bounds, { x: 0, y: 0, width: 1280, height: 800 });
  assert.equal(host.state.top, view, '停靠的 view 必须置顶');
});

test('DOCK-2 停泊（隐藏）⇒ 尺寸不变，只移出可视区', () => {
  const host = makeHost();
  const pool = new BrowserViewPool(host);
  const view = liveView();
  pool.add('t1', view, { url: 'https://a.test/', origin: 'agent' });
  pool.setContentRect({ x: 256, y: 96, width: 900, height: 600 });
  pool.dock('t1');

  pool.park('t1');
  assert.equal(view.bounds.width, 900, '⛔ 停泊不许缩宽度（页面会重排）');
  assert.equal(view.bounds.height, 600, '⛔ 停泊不许缩高度');
  assert.ok(view.bounds.x < 0, '停泊 = 移出可视区（x 为负）');
  assert.equal(view.bounds.x, -(900 + PARK_MARGIN));
});

test('DOCK-3 没有渲染层上报的矩形 ⇒ 不停靠（绝不盖住整个客户端）', () => {
  const host = makeHost();
  const pool = new BrowserViewPool(host);
  const view = liveView();
  pool.add('t1', view, { url: 'https://a.test/', origin: 'agent' });

  const ok = pool.dock('t1');
  assert.equal(ok, false, '没有落位矩形 ⇒ dock 必须失败');
  assert.notDeepEqual(view.bounds, { x: 0, y: 0, width: 1280, height: 800 });
});

test('DOCK-4 矩形置 null（用户离开 /browser 页）⇒ 全部停泊', () => {
  const host = makeHost();
  const pool = new BrowserViewPool(host);
  const v1 = liveView();
  const v2 = liveView();
  pool.add('t1', v1, { url: 'https://a.test/', origin: 'agent' });
  pool.add('t2', v2, { url: 'https://b.test/', origin: 'agent' });
  pool.setContentRect({ x: 0, y: 0, width: 900, height: 600 });
  pool.dock('t1');
  pool.dock('t2');

  pool.setContentRect(null);
  assert.equal(pool.getActiveTabId(), null);
  for (const v of [v1, v2]) {
    assert.equal(v.bounds.width, 900, '停泊后尺寸仍保持');
    assert.ok(v.bounds.x < 0);
  }
});

test('DOCK-5 矩形变了 ⇒ 已停靠的 view 跟着重放', () => {
  const host = makeHost();
  const pool = new BrowserViewPool(host);
  const view = liveView();
  pool.add('t1', view, { url: 'https://a.test/', origin: 'agent' });
  pool.setContentRect({ x: 0, y: 0, width: 900, height: 600 });
  pool.dock('t1');

  pool.setContentRect({ x: 0, y: 0, width: 700, height: 500 });
  assert.deepEqual(view.bounds, { x: 0, y: 0, width: 700, height: 500 });
});

test('DOCK-6 focus ⇒ 置顶 + webContents 拿到焦点（trusted 输入的前提）', () => {
  const host = makeHost();
  const pool = new BrowserViewPool(host);
  const view = liveView();
  pool.add('t1', view, { url: 'https://a.test/', origin: 'agent' });
  pool.setContentRect({ x: 10, y: 20, width: 800, height: 600 });

  const ok = pool.focus('t1');
  assert.equal(ok, true);
  assert.equal(host.state.top, view);
  assert.equal(view.webContents.__f, 1, 'webContents 必须被 focus（否则 trusted 输入打不中）');
  assert.equal(pool.getActiveTabId(), 't1');
});

test('DOCK-12 矩形不合法 ⇒ 归一化返回 null（不猜默认值）', () => {
  assert.equal(normalizeDockRect({ x: 0, y: 0, width: 0, height: 600 }), null);
  assert.equal(normalizeDockRect({ x: 0, y: 0, width: 600 }), null);
  assert.equal(normalizeDockRect(null), null);
  assert.equal(normalizeDockRect('x'), null);
  assert.deepEqual(
    normalizeDockRect({ x: 1.4, y: 2.6, width: 100.2, height: 50.8 }),
    { x: 1, y: 3, width: 100, height: 51 },
  );
  assert.ok(rectsEqual({ x: 0, y: 0, width: 1, height: 1 }, { x: 0, y: 0, width: 1, height: 1 }));
  assert.ok(!rectsEqual({ x: 0, y: 0, width: 1, height: 1 }, { x: 1, y: 0, width: 1, height: 1 }));
  assert.deepEqual(parkBounds({ x: 5, y: 7, width: 10, height: 20 }), {
    x: -(10 + PARK_MARGIN), y: 7, width: 10, height: 20,
  });
});

// ===========================================================================
// DOCK-7 ~ DOCK-8 · 跨会话不串台
// ===========================================================================

test('DOCK-7 兜底选 tab：active → 本会话 → 最近创建', () => {
  const entries = [
    ['a', entry('https://a.test/', { sessionId: 'S1', createdAt: 1 })],
    ['b', entry('https://b.test/', { sessionId: 'S2', createdAt: 2 })],
    ['c', entry('https://c.test/', { sessionId: 'S1', createdAt: 3 })],
  ];
  // ① active 优先
  assert.equal(resolveLiveTab(entries, {}, { activeTabId: 'b' }), 'b');
  // ② 没有 active ⇒ 本会话优先（本会话开了 a 和 c ⇒ 取最近用的 c）
  assert.equal(resolveLiveTab(entries, {}, { sessionId: 'S1' }), 'c');
  // ③ 本会话没有 ⇒ 最近创建
  assert.equal(resolveLiveTab(entries, {}, { sessionId: 'S9' }), 'c');
  // ④ 明确指定却找不到 ⇒ 不猜
  assert.equal(resolveLiveTab(entries, { tabId: 'nope' }), null);
  assert.equal(resolveLiveTab(entries, { url: 'https://nope.test/' }), null);
});

test('DOCK-8 复用 tab 的优先级 = 本会话 > 用户自己的 > 别的会话', () => {
  const entries = [
    ['other', entry('https://x.test/', { sessionId: 'S2' })],
    ['user', entry('https://x.test/', { origin: 'renderer' })],
    ['mine', entry('https://x.test/', { sessionId: 'S1' })],
  ];
  const url = normalizeBrowserUrl('https://x.test/');
  assert.equal(findReusableTabId(entries, url, { sessionId: 'S1' }), 'mine');
  assert.equal(findReusableTabId(entries, url, { sessionId: 'S3' }), 'user');
  assert.equal(findReusableTabId(entries, url, {}), 'user');
  // URL 归一化两侧一致：带斜杠的写法要能命中同一条
  assert.equal(
    findReusableTabId([['u', entry('https://x.test/')]], normalizeBrowserUrl('https://x.test')),
    'u',
  );
});

// ===========================================================================
// DOCK-9 ~ DOCK-10 · close / focus 两个新工具
// ===========================================================================

test('DOCK-9 pc_browser_close 关掉池里的 tab', async () => {
  const closed = [];
  const e = entry('https://a.test/', { sessionId: 'S1' });
  setBrowserTabPool({
    open: async () => ({ tabId: 'x', title: '' }),
    entries: () => [['t1', e]],
    titleOf: () => 'A',
    close: (tabId) => { closed.push(tabId); return true; },
    focus: () => true,
  });
  try {
    const r = await pcBrowserClose({ tabId: 't1' }, { sessionId: 'S1' });
    assert.equal(r.status, 'ok');
    assert.deepEqual(closed, ['t1']);
    assert.match(r.stdout, /pc_browser_close/);
    assert.match(r.stdout, /https:\/\/a\.test\//);
  } finally {
    setBrowserTabPool(null);
  }
});

test('DOCK-9b pc_browser_close 找不到 tab ⇒ 如实报错（不假装成功）', async () => {
  setBrowserTabPool({
    open: async () => ({ tabId: 'x', title: '' }),
    entries: () => [],
    close: () => true,
  });
  try {
    const r = await pcBrowserClose({}, { sessionId: 'S1' });
    assert.equal(r.status, 'error');
    assert.match(r.error, /没有可关闭/);
  } finally {
    setBrowserTabPool(null);
  }
});

test('DOCK-10 pc_browser_focus 切回自己的页面', async () => {
  const focused = [];
  const e = entry('https://a.test/', { sessionId: 'S1' });
  setBrowserTabPool({
    open: async () => ({ tabId: 'x', title: '' }),
    entries: () => [['t1', e]],
    titleOf: () => '我的页面',
    focus: (tabId) => { focused.push(tabId); return true; },
  });
  try {
    const r = await pcBrowserFocus({}, { sessionId: 'S1' });
    assert.equal(r.status, 'ok');
    assert.deepEqual(focused, ['t1']);
    assert.match(r.stdout, /我的页面/);
  } finally {
    setBrowserTabPool(null);
  }
});

test('DOCK-10b pc_browser_focus 池没接线 ⇒ 如实报错', async () => {
  setBrowserTabPool(null);
  const r = await pcBrowserFocus({}, { sessionId: 'S1' });
  assert.equal(r.status, 'error');
  assert.match(r.error, /浏览器池还没接线/);
});

// ===========================================================================
// DOCK-11 · 矩形换算
// ===========================================================================

test('DOCK-11 computeDockRect：视口坐标 + 滚动偏移；尺寸非正 ⇒ null', () => {
  const el = { getBoundingClientRect: () => ({ left: 256, top: 96, width: 900, height: 600 }) };
  assert.deepEqual(computeDockRect(el), { x: 256, y: 96, width: 900, height: 600 });
  assert.deepEqual(computeDockRect(el, { x: 10, y: 20 }), { x: 266, y: 116, width: 900, height: 600 });
  const zero = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }) };
  assert.equal(computeDockRect(zero), null, '尺寸非正 ⇒ null（不许拿 0×0 糊弄主进程）');
});
