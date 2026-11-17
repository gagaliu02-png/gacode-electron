// [2026-11-17 · T-026-brw7] pc_browser 命中测试（按文字 / 坐标 / 编号一致性）
//
// 这些测试**真的执行** browser.ts 注入到页面的脚本（SNAPSHOT_SCRIPT / ELEM_IDX /
// text: / @x,y），用一个最小 DOM stub + node:vm 跑在 Node 里 —— 不装 jsdom，
// 也不靠 fake evalInTab 直接返回坐标（那会漏掉脚本本身的逻辑错误）。
//
// 覆盖断言：
//   BRW-1  text: 可见文字点中 div / 伪元素按钮（非标准 <button>）
//   BRW-2  shadow DOM / 同源 iframe 内文字可点（iframe 坐标叠加 host 偏移）
//   BRW-3  text: 多个同名可见元素 ⇒ 歧义报错，不瞎点
//   BRW-4  @x,y 坐标点击（trusted 事件注入到正确坐标）
//   BRW-5  @x,y 屏幕外坐标 ⇒ 拒绝注入
//   BRW-6  编号 ↔ 坐标一致性：snapshot 的 eN 与 act 的 eN 指向同一坐标；
//          屏幕外 / 隐藏元素不进编号表（旧版会错位 ⇒ e132 点中 1120,2545）

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const {
  SNAPSHOT_SCRIPT,
  buildElementIndex,
  pcBrowserAct,
  pcBrowserSnapshot,
  setBrowserTabPool,
} = await import('../electron/client-tools/browser.ts');

// ---------------------------------------------------------------------------
// 最小 DOM stub：只实现注入脚本用到的那几个 API
// ---------------------------------------------------------------------------
function el(opts = {}) {
  const {
    tag = 'div', text = '', value = '', x = 0, y = 0, w = 100, h = 40,
    attrs = {}, cursor = 'auto', visible = true, before = '', after = '',
    shadow = null, iframe = null,
  } = opts;
  const e = {
    tagName: tag.toUpperCase(),
    innerText: text,
    value,
    _attrs: attrs,
    _before: before, _after: after,
    _style: {
      visibility: visible ? 'visible' : 'hidden',
      display: visible ? 'block' : 'none',
      opacity: '1',
      cursor,
    },
    isContentEditable: attrs.contenteditable === 'true',
    shadowRoot: shadow ? { querySelectorAll: () => shadow } : null,
    contentDocument: iframe ? { body: { querySelectorAll: () => iframe } } : null,
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this._attrs, k); },
    getBoundingClientRect() { return { left: x, top: y, width: w, height: h }; },
  };
  return e;
}

function fakeDom(elements, { w = 1000, h = 800, title = 'T', url = 'https://x/' } = {}) {
  const body = { querySelectorAll: (sel) => (sel === '*' ? elements : []) };
  const context = {
    document: {
      title,
      body,
      documentElement: body,
      location: { href: url },
      createTreeWalker: () => ({ nextNode: () => null }), // 文本正文不是本文件重点
      querySelector: () => null,
    },
    location: { href: url },
    innerWidth: w,
    innerHeight: h,
    getComputedStyle(e, pseudo) {
      if (pseudo === '::before') return { content: e._before || 'none' };
      if (pseudo === '::after') return { content: e._after || 'none' };
      return e._style;
    },
    NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
  };
  return context;
}

/** 让 evalInTab **真的执行**注入脚本；返回脚本结果，并记录所有 input 事件。 */
function installLivePool(elements, viewport = {}) {
  const calls = { inputs: [], scripts: [] };
  const ctx = fakeDom(elements, viewport);
  setBrowserTabPool({
    open: async () => ({ tabId: 'x', title: '' }),
    entries: () => new Map([['t', { view: { webContents: { isDestroyed: () => false } }, url: 'https://x/', createdAt: 1 }]]),
    evalInTab: async (_tabId, script) => {
      calls.scripts.push(script);
      return vm.runInNewContext(script, ctx, { timeout: 2000 });
    },
    input: (_tabId, ev) => { calls.inputs.push(ev); },
  });
  return calls;
}

const clickedAt = (calls) => calls.inputs.find((i) => i.type === 'mouseDown');
const reset = () => setBrowserTabPool(null);

// ===========================================================================
// BRW-1 · text: 点中 div / 伪元素弹窗按钮
// ===========================================================================

test('BRW-1 text: 按可见文字点中 div 弹窗按钮（不是 <button>，靠伪元素渲染）', async () => {
  // 「我知道了」只出现在 ::after 里，innerText 为空 ⇒ 旧 snapshot 抓不到，text: 要能点
  const btn = el({ tag: 'div', x: 280, y: 380, w: 40, h: 24, after: '"我知道了"' });
  const calls = installLivePool([
    el({ tag: 'p', text: '温馨提示：您的浏览器似乎开启了广告屏蔽插件…', x: 10, y: 100, w: 300, h: 30 }),
    btn,
  ]);

  const r = await pcBrowserAct({ tabId: 't', action: 'click', target: 'text:我知道了' });
  assert.equal(r.status, 'ok', r.error);
  const out = JSON.parse(r.stdout);
  assert.equal(out.target.type, 'text');
  assert.equal(out.target.text, '我知道了');
  const down = clickedAt(calls);
  assert.deepEqual({ x: down.x, y: down.y }, { x: 300, y: 392 }, '点中伪元素按钮的中心');
  reset();
});

// ===========================================================================
// BRW-2 · shadow DOM / iframe
// ===========================================================================

test('BRW-2 text: 能点 shadow DOM 与同源 iframe 里的文字（iframe 坐标叠加 host 偏移）', async () => {
  const shadowBtn = el({ tag: 'div', text: '我要申诉', x: 500, y: 200, w: 60, h: 20 });
  const iframeBtn = el({ tag: 'div', text: '我知道了', x: 50, y: 50, w: 20, h: 20 });
  const calls = installLivePool([
    el({ tag: 'div', x: 0, y: 0, w: 10, h: 10, shadow: [shadowBtn] }),
    el({ tag: 'iframe', x: 100, y: 100, w: 200, h: 200, iframe: [iframeBtn] }),
  ]);

  const r1 = await pcBrowserAct({ tabId: 't', action: 'click', target: 'text:我要申诉' });
  assert.equal(r1.status, 'ok', r1.error);
  assert.deepEqual(
    { x: clickedAt(calls).x, y: clickedAt(calls).y }, { x: 530, y: 210 },
    'shadow DOM 与主 frame 共用坐标系',
  );

  calls.inputs.length = 0;
  const r2 = await pcBrowserAct({ tabId: 't', action: 'click', target: 'text:我知道了' });
  assert.equal(r2.status, 'ok', r2.error);
  assert.deepEqual(
    { x: clickedAt(calls).x, y: clickedAt(calls).y }, { x: 160, y: 160 },
    'iframe 内元素坐标 = host 左上(100,100) + 元素中心(60,60)',
  );
  reset();
});

// ===========================================================================
// BRW-3 · 同名歧义
// ===========================================================================

test('BRW-3 text: 匹配到多个不同可见元素 ⇒ 报错而不是瞎点', async () => {
  const calls = installLivePool([
    el({ tag: 'div', text: '我知道了', x: 100, y: 100, w: 40, h: 20 }),
    el({ tag: 'div', text: '我知道了', x: 300, y: 300, w: 40, h: 20 }),
  ]);
  const r = await pcBrowserAct({ tabId: 't', action: 'click', target: 'text:我知道了' });
  assert.equal(r.status, 'error');
  assert.match(r.error, /匹配到 2 个|更精确|坐标/);
  assert.equal(calls.inputs.length, 0, '歧义 ⇒ 绝不注入事件');
  reset();
});

// ===========================================================================
// BRW-4 / BRW-5 · 坐标点击 + 屏幕外拒绝
// ===========================================================================

test('BRW-4 @x,y 按 viewport 坐标点击（兜底手段）', async () => {
  const calls = installLivePool([], { w: 1000, h: 800 });
  const r = await pcBrowserAct({ tabId: 't', action: 'click', target: '@300,450' });
  assert.equal(r.status, 'ok', r.error);
  assert.equal(JSON.parse(r.stdout).target.type, 'coordinate');
  const down = clickedAt(calls);
  assert.deepEqual({ x: down.x, y: down.y }, { x: 300, y: 450 });
  assert.deepEqual(calls.inputs.map((i) => i.type), ['mouseMove', 'mouseDown', 'mouseUp']);
  reset();
});

test('BRW-5 @x,y 屏幕外坐标 ⇒ 拒绝，绝不误点', async () => {
  for (const target of ['@1120,2545', '@-5,100', '@500,900']) {
    const calls = installLivePool([], { w: 1000, h: 800 });
    const r = await pcBrowserAct({ tabId: 't', action: 'click', target });
    assert.equal(r.status, 'error', `应拒绝: ${target}`);
    assert.match(r.error, /可视区外|拒绝点击/);
    assert.equal(calls.inputs.length, 0, `拒绝后不许注入事件: ${target}`);
  }
  reset();
});

// ===========================================================================
// BRW-6 · 编号 ↔ 坐标一致性（核心回归）
// ===========================================================================

test('BRW-6 编号与坐标一致：snapshot 的 eN 与 act 的 eN 指向同一坐标；屏幕外/隐藏元素不进表', async () => {
  const hidden = el({ tag: 'button', text: '隐藏按钮', x: 10, y: 10, w: 50, h: 20, visible: false, cursor: 'pointer' });
  const a = el({ tag: 'button', text: '按钮A', x: 40, y: 50, w: 20, h: 20, cursor: 'pointer' });
  const offscreen = el({ tag: 'button', text: '屏幕外笔记', x: 1120, y: 2545, w: 60, h: 20, cursor: 'pointer' });
  const b = el({ tag: 'div', text: '按钮B', x: 480, y: 120, w: 40, h: 20, attrs: { role: 'button' } });
  const elements = [hidden, a, offscreen, b];

  // ① 先跑 snapshot（真实执行 SNAPSHOT_SCRIPT）
  const snapCalls = installLivePool(elements);
  const snap = await pcBrowserSnapshot({ tabId: 't' });
  assert.equal(snap.status, 'ok', snap.error);
  const d = JSON.parse(snap.stdout);
  assert.deepEqual(d.viewport, { w: 1000, h: 800 });
  const idx = buildElementIndex('t', d.elements);
  assert.equal(idx.length, 2, '隐藏 + 屏幕外元素不该进编号表');
  assert.deepEqual(idx.map((e) => e.text), ['按钮A', '按钮B']);
  assert.equal(idx[0].x, 50, 'snapshot 回传中心 x：a 的中心 = 40+10');
  assert.equal(idx[1].x, 500, 'b 的中心 = 480+20');

  // ② 再用相同 DOM 跑 act 的 e1/e2 解析，坐标必须与 snapshot 逐一相等
  for (let i = 0; i < idx.length; i += 1) {
    const ref = `e${i + 1}`;
    const calls = installLivePool(elements);
    const r = await pcBrowserAct({ tabId: 't', action: 'click', target: ref });
    assert.equal(r.status, 'ok', `${ref}: ${r.error}`);
    const down = clickedAt(calls);
    assert.deepEqual(
      { x: down.x, y: down.y },
      { x: idx[i].x, y: idx[i].y },
      `★ ${ref} 的点击坐标必须等于 snapshot 回报的坐标（编号与坐标同源）`,
    );
  }
  reset();
});

// ===========================================================================
// BRW-7 · CSS 选择器 bug：传给 querySelector 的必须是裸选择器，不是 JSON 字符串
// ===========================================================================

test('BRW-7 CSS 选择器直接传给 querySelector（不再包一层 JSON.stringify）', async () => {
  const calls = installLivePool([el({ tag: 'button', text: '登录', x: 20, y: 20, w: 40, h: 20 })]);
  const r = await pcBrowserAct({ tabId: 't', action: 'click', target: '.login-btn' });
  assert.equal(r.status, 'error'); // stub 的 querySelector 返回 null ⇒ 找不到，但不该因语法错异常
  const script = calls.scripts[calls.scripts.length - 1];
  assert.match(script, /document\.querySelector\("\.login-btn"\)/, '★ 必须是裸选择器字符串');
  assert.doesNotMatch(script, /querySelector\(JSON\.stringify/, '⛔ 不许把 JSON.stringify 结果当选择器');
  assert.doesNotMatch(script, /querySelector\("\\"\.login-btn\\""\)/, '⛔ 选择器不能带多余引号');
  reset();
});
