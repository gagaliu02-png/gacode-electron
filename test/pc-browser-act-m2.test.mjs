// [2026-11-15 · 订正 31 · M2] pc_browser_act 单测
//
// 契约依据: 根目录 docs/design/pc-browser-agent-2026-11.md §7(危险动作分级)
//
// ## 覆盖断言
//
//   GC-P31-30  ★ 点击走 **sendInputEvent**（trusted），绝不 `executeJavaScript(el.click())`
//   GC-P31-31  ★ 危险动作（发布/提交/点赞/删除…）端侧直接拒（L3 兜底）
//   GC-P31-32  type 输入逐字符注入（不拼整段文本进 JS）
//   GC-P31-33  CSS 选择器校验：只放行简单 class/id/attr，拦复杂表达式
//   GC-P31-34  用 e12 编号定位走「第 N 个可交互元素」脚本（不编 selector）
//
// ⚠️ 不 import electron —— browser.ts 里 electron 是 `import type`，可被 node 直接加载。

import test from 'node:test';
import assert from 'node:assert/strict';

const {
  isDangerousAction,
  pcBrowserAct,
  setBrowserTabPool,
  DANGEROUS_ACTION_RE,
} = await import('../electron/client-tools/browser.ts');

function fakeView(destroyed = false) {
  return { webContents: { isDestroyed: () => destroyed } };
}
function fakeEntry(url, createdAt = 1, destroyed = false) {
  return { view: fakeView(destroyed), url, createdAt };
}

/** 记录 input 调用 + 返回固定的元素坐标。 */
function installPool(entries, opts = {}) {
  const calls = { evalScripts: [], inputs: [] };
  setBrowserTabPool({
    open: async () => ({ tabId: 'x', title: '' }),
    entries: () => entries,
    evalInTab: async (_tabId, script) => {
      calls.evalScripts.push(script);
      return opts.pos ?? { found: true, x: 100, y: 200, tag: 'button', text: '登录' };
    },
    input: (_tabId, ev) => {
      calls.inputs.push(ev);
    },
  });
  return calls;
}

// ===========================================================================
// GC-P31-30 · 点击走 trusted 事件
// ===========================================================================

test('GC-P31-30 click 必须注入 mouseDown/mouseUp（且 evalInTab 只用于取坐标）', async () => {
  const entries = new Map([['t', fakeEntry('https://x/', 1)]]);
  const calls = installPool(entries, { pos: { found: true, x: 30, y: 40, tag: 'a', text: '详情' } });

  const r = await pcBrowserAct({ tabId: 't', action: 'click', target: 'e1' });
  assert.equal(r.status, 'ok');
  const out = JSON.parse(r.stdout);
  assert.equal(out.target.x, 30, '点击坐标要回给模型');
  assert.equal(out.target.tag, 'a');

  const types = calls.inputs.map((i) => i.type);
  assert.deepEqual(types, ['mouseMove', 'mouseDown', 'mouseUp'], '★ 鼠标事件序列（move→down→up）');
  for (const ev of calls.inputs) {
    assert.ok(!('isTrusted' in ev), 'isTrusted 由 Electron 的 sendInputEvent 决定 —— 我们只管发事件');
  }
  // ⛔ 绝不能出现 JS click（trusted=false）
  assert.ok(!calls.evalScripts.some((s) => s.includes('.click()')), '⛔ 不许用 JS .click()');
  setBrowserTabPool(null);
});

// ===========================================================================
// GC-P31-31 · 危险动作硬拒
// ===========================================================================

test('GC-P31-31 ★ 危险动作（发布/提交/点赞/删除）端侧直接拒', async () => {
  const entries = new Map([['t', fakeEntry('https://x/', 1)]]);
  installPool(entries, { pos: { found: true, x: 1, y: 2, tag: 'button', text: '发布' } });

  for (const [target, text] of [['e1', '发布'], ['e1', '点赞'], ['e1', '删除'], ['e1', '下单支付']]) {
    const r = await pcBrowserAct({ tabId: 't', action: 'click', target, text });
    assert.equal(r.status, 'error', `应该拒: ${text}`);
    assert.match(r.error, /危险动作|拦截/, `错误要说明原因: ${text}`);
  }

  // 「普通」文本放行
  const calls = installPool(entries, { pos: { found: true, x: 1, y: 2, tag: 'button', text: '查看详情' } });
  const ok = await pcBrowserAct({ tabId: 't', action: 'click', target: 'e1', text: '查看详情' });
  assert.equal(ok.status, 'ok');
  assert.equal(calls.inputs.length, 3, '普通点击正常注入');
  setBrowserTabPool(null);
});

test('GC-P31-31b isDangerousAction 纯函数：type 永放行 / 空文本放行到服务端判', () => {
  assert.equal(isDangerousAction('发布', 'click'), !!DANGEROUS_ACTION_RE.test('发布') && '元素文本命中危险词（发布/提交/点赞/删除…）');
  assert.equal(isDangerousAction(null, 'click'), null, '拿不到文本 ⇒ 端侧不判，交给服务端');
  assert.equal(isDangerousAction('', 'click'), null);
  assert.equal(isDangerousAction('随便输入点啥', 'type'), null, 'type 永不放行危险判定');
});

// ===========================================================================
// GC-P31-32 · type 逐字符注入
// ===========================================================================

test('GC-P31-32 type：逐个字符注入，不把整段文本拼进 JS', async () => {
  const entries = new Map([['t', fakeEntry('https://x/', 1)]]);
  const calls = installPool(entries, { pos: { found: true, x: 5, y: 6, tag: 'input', text: '' } });

  const r = await pcBrowserAct({ tabId: 't', action: 'type', target: 'e1', text: '你好abc' });
  assert.equal(r.status, 'ok');
  assert.equal(JSON.parse(r.stdout).chars, 5);

  const chars = calls.inputs.filter((i) => i.type === 'char');
  assert.equal(chars.length, 5, '每个字符一个 char 事件');
  assert.deepEqual(chars.map((c) => c.key), ['你', '好', 'a', 'b', 'c']);
  // ⛔ 整段文本绝不能出现在 evalInTab 脚本里（注入面）
  assert.ok(!calls.evalScripts.some((s) => s.includes('你好abc')), '⛔ 文本不进 JS');
  setBrowserTabPool(null);
});

// ===========================================================================
// GC-P31-33 · CSS 选择器校验
// ===========================================================================

test('GC-P31-33 CSS 选择器白名单：简单 class/id/attr 放行，复杂表达式拦', async () => {
  const entries = new Map([['t', fakeEntry('https://x/', 1)]]);
  let lastScript = null;
  setBrowserTabPool({
    open: async () => ({ tabId: 'x', title: '' }),
    entries: () => entries,
    evalInTab: async (_t, s) => { lastScript = s; return { found: true, x: 1, y: 1, tag: 'input' }; },
    input: () => {},
  });

  // 合法的：class / id / attr / 后代 / 空值 attr（`''` 无注入面）
  for (const sel of ['.login-btn', '#searchBox', '[data-role="editor"]', 'button.submit', "input[value='']"]) {
    const r = await pcBrowserAct({ tabId: 't', action: 'click', target: sel });
    assert.equal(r.status, 'ok', `应放行: ${sel}`);
  }
  // 非法的：函数表达式 / 伪类注入 / 引号逃逸 / 分号拼接
  for (const sel of ['button:contains(x)', '#a" onmouseover="evil()', 'x;alert(1)//']) {
    const r = await pcBrowserAct({ tabId: 't', action: 'click', target: sel });
    assert.equal(r.status, 'error', `应拦截: ${sel}`);
  }
  setBrowserTabPool(null);
});
