// [2026-11-17 · T-028-sh0t] PC 浏览器**截图** + **坐标系契约** 单测
//
// 覆盖断言：
//   SHOT-1  pc_browser_shot ⇒ 回**坐标块**（viewport / scroll / scale / image）+ 图片 artifact
//   SHOT-2  ⛔ stdout 里**没有 base64**（上下文顶爆血泪）—— 只给本机路径 + 尺寸
//   SHOT-3  视图不可见（截到空图）⇒ **如实报错**，不假装截到了
//   SHOT-4  `@shot:px,py` ⇒ 按 scale 换算成 viewport 坐标（模型看图报坐标能直接用）
//   SHOT-5  没有截图记录就用 `@shot:` ⇒ 如实报错（不瞎猜比例）
//   SHOT-6  `@shot:` 换算后**照样过视口边界校验**（屏幕外直接拒）
//   SHOT-7  坐标换算纯函数：scale=2 ⇒ 截图 1280 宽 ⇒ 页面 640 宽
//   SHOT-8  snapshot 输出补 scroll / scale（坐标系契约的另一半）
//
// ⚠️ 本文件**不 import electron** —— `browser.ts` 里 electron 是 `import type`
//    ⇒ 能直接被 node --test 加载。
//
// 运行: node --test test/pc-browser-shot.test.mjs   (完全离线)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const {
  pcBrowserShot,
  pcBrowserAct,
  pcBrowserSnapshot,
  setBrowserTabPool,
  convertShotCoords,
  getShotMeta,
  clearShotMeta,
  buildSnapshotOutput,
  VIEWPORT_INFO_SCRIPT,
} = await import('../electron/client-tools/browser.ts');

function fakeEntry(url = 'https://x.test/') {
  return {
    view: { webContents: { isDestroyed: () => false } },
    url,
    createdAt: 1,
    origin: 'agent',
    sessionId: 'S1',
  };
}

/**
 * 装一个假池。
 * @param {object} opts { capture, viewport, pos }
 */
function installPool(opts = {}) {
  const calls = { inputs: [], scripts: [], captured: 0, focused: 0, activated: 0 };
  setBrowserTabPool({
    open: async () => ({ tabId: 'x', title: '' }),
    entries: () => [['t1', fakeEntry()]],
    titleOf: () => 'T',
    focus: () => { calls.focused += 1; return true; },
    activate: () => { calls.activated += 1; return true; },
    evalInTab: async (_tabId, script) => {
      calls.scripts.push(script);
      if (script.includes('devicePixelRatio')) {
        return opts.viewport ?? { vw: 800, vh: 600, sx: 10, sy: 20, dpr: 2 };
      }
      return opts.pos ?? { found: true, x: 100, y: 200, tag: 'button', text: '登录', vw: 800, vh: 600 };
    },
    input: (_tabId, ev) => { calls.inputs.push(ev); },
    capture: async (_tabId) => {
      calls.captured += 1;
      if (typeof opts.capture === 'function') return opts.capture(_tabId, calls.captured);
      if (opts.capture === null) return { png: Buffer.alloc(0), width: 0, height: 0 };
      return opts.capture ?? { png: Buffer.from('PNGDATA'), width: 1600, height: 1200 };
    },
  });
  return calls;
}

// ===========================================================================
// SHOT-1 ~ SHOT-3 · pc_browser_shot
// ===========================================================================

test('SHOT-1 截图 ⇒ 回坐标块 + 图片 artifact', async () => {
  const calls = installPool();
  const r = await pcBrowserShot({ tabId: 't1' }, { sessionId: 'S1' });
  assert.equal(r.status, 'ok');
  const out = JSON.parse(r.stdout);
  assert.equal(out.tool, 'pc_browser_shot');
  assert.equal(out.coordinate_system, 'viewport', '浏览器 = viewport 坐标');
  assert.deepEqual(out.viewport, { w: 800, h: 600 });
  assert.deepEqual(out.scroll, { x: 10, y: 20 });
  assert.equal(out.scale, 2, 'scale = 物理像素 / CSS px');
  assert.deepEqual(out.image, { w: 1600, h: 1200 });

  // 产物 = 一张 PNG（走现成的上传通路 ⇒ 公网 URL）
  assert.equal(r.artifacts.length, 1);
  assert.equal(r.artifacts[0].kind, 'file');
  assert.equal(r.artifacts[0].mimeType, 'image/png');
  assert.ok(r.artifacts[0].size > 0);
  assert.ok(fs.existsSync(r.artifacts[0].path), 'PNG 要真的落盘（上传走的就是这个文件）');
  fs.unlinkSync(r.artifacts[0].path);

  // 截图元信息记下来了（@shot: 要用）
  const meta = getShotMeta('t1');
  assert.ok(meta, '要记住这次截图的尺寸');
  assert.equal(meta.scale, 2);
  assert.equal(meta.imageW, 1600);
  clearShotMeta('t1');
  setBrowserTabPool(null);
});

test('SHOT-2 ⛔ stdout 里没有 base64（只给本机路径 + 尺寸）', async () => {
  installPool();
  const r = await pcBrowserShot({ tabId: 't1' }, { sessionId: 'S1' });
  assert.ok(!/base64/i.test(r.stdout), '⛔ 不许 base64');
  assert.ok(r.stdout.length < 1024, `stdout 要小（实际 ${r.stdout.length} 字节）`);
  assert.ok(!r.stdout.includes('PNGDATA'), '⛔ 图片内容不许进 stdout');
  fs.unlinkSync(r.artifacts[0].path);
  clearShotMeta('t1');
  setBrowserTabPool(null);
});

test('SHOT-3 视图不可见（两次都空图）⇒ 如实报错，不假装截到了', async () => {
  const calls = installPool({ capture: null });
  const r = await pcBrowserShot({ tabId: 't1' }, { sessionId: 'S1' });
  assert.equal(r.status, 'error');
  assert.match(r.error, /不可见|截不到/, '要说清楚为什么');
  assert.equal(calls.captured, 2, 'T-054：第一次空图要再试一次');
  assert.equal(r.artifacts, undefined, '⛔ 截不到就不该报产物');
  setBrowserTabPool(null);
});

test('SHOT-3b T-054：首次空图 + focus 后重试成功 ⇒ 正常回图（不再误报不可见）', async () => {
  let attempt = 0;
  const calls = installPool({
    capture: () => {
      attempt += 1;
      if (attempt === 1) return { png: Buffer.alloc(0), width: 0, height: 0 };
      return { png: Buffer.from('PNGDATA'), width: 1600, height: 1200 };
    },
  });
  const r = await pcBrowserShot({ tabId: 't1' }, { sessionId: 'S1' });
  assert.equal(r.status, 'ok', `不应误报不可见: ${r.error}`);
  assert.equal(calls.captured, 2);
  assert.ok(calls.activated >= 1 && calls.focused >= 1, '截图前/重试时要主动激活');
  assert.equal(r.artifacts.length, 1);
  fs.unlinkSync(r.artifacts[0].path);
  clearShotMeta('t1');
  setBrowserTabPool(null);
});

// ===========================================================================
// SHOT-4 ~ SHOT-6 · @shot:px,py
// ===========================================================================

test('SHOT-4 `@shot:px,py` ⇒ 按 scale 换算成 viewport 坐标', async () => {
  // 先截一张（scale = 1600/800 = 2）
  const calls = installPool();
  const shot = await pcBrowserShot({ tabId: 't1' }, { sessionId: 'S1' });
  assert.equal(shot.status, 'ok');
  fs.unlinkSync(shot.artifacts[0].path);

  // 再用截图里的像素坐标点（截图 1600×1200 ⇒ 页面 800×600）
  const r = await pcBrowserAct({ tabId: 't1', action: 'click', target: '@shot:400,200' }, { sessionId: 'S1' });
  assert.equal(r.status, 'ok');
  const out = JSON.parse(r.stdout);
  assert.equal(out.target.x, 200, '截图 400px ÷ scale 2 = 页面 200px');
  assert.equal(out.target.y, 100);
  assert.equal(out.target.type, 'shot-coordinate');
  // 真注入了 trusted 事件
  assert.deepEqual(calls.inputs.map((i) => i.type), ['mouseMove', 'mouseDown', 'mouseUp']);
  const down = calls.inputs.find((i) => i.type === 'mouseDown');
  assert.equal(down.x, 200);
  assert.equal(down.y, 100);

  clearShotMeta('t1');
  setBrowserTabPool(null);
});

test('SHOT-5 没有截图记录就用 @shot: ⇒ 如实报错', async () => {
  const calls = installPool();
  clearShotMeta('t1');
  const r = await pcBrowserAct({ tabId: 't1', action: 'click', target: '@shot:400,200' }, { sessionId: 'S1' });
  assert.equal(r.status, 'error');
  assert.match(r.error, /截图/, '要说清楚要先截图');
  assert.equal(calls.inputs.length, 0, '⛔ 换算不出来就不许注入');
  setBrowserTabPool(null);
});

test('SHOT-6 @shot: 换算后照样过视口边界校验（屏幕外直接拒）', async () => {
  const calls = installPool();
  const shot = await pcBrowserShot({ tabId: 't1' }, { sessionId: 'S1' });
  fs.unlinkSync(shot.artifacts[0].path);

  // 截图 1600×1200（scale 2）⇒ 页面 800×600 ⇒ 截图 (3000,100) = 页面 (1500,50) ⇒ 屏幕外
  const r = await pcBrowserAct({ tabId: 't1', action: 'click', target: '@shot:3000,100' }, { sessionId: 'S1' });
  assert.equal(r.status, 'error');
  assert.match(r.error, /可视区外/, '屏幕外必须拒');
  assert.equal(calls.inputs.length, 0, '⛔ 屏幕外不许注入');
  clearShotMeta('t1');
  setBrowserTabPool(null);
});

// ===========================================================================
// SHOT-7 · 换算纯函数
// ===========================================================================

test('SHOT-7 坐标换算纯函数', () => {
  assert.equal(convertShotCoords(null, 100, 100), null, '没有截图记录 ⇒ null');
  assert.deepEqual(
    convertShotCoords({ imageW: 1600, imageH: 1200, scale: 2, viewportW: 800, viewportH: 600 }, 400, 200),
    { x: 200, y: 100 },
  );
  // scale = 1（无缩放）⇒ 原样
  assert.deepEqual(
    convertShotCoords({ imageW: 800, imageH: 600, scale: 1, viewportW: 800, viewportH: 600 }, 400, 200),
    { x: 400, y: 200 },
  );
});

// ===========================================================================
// SHOT-8 · snapshot 补 scroll / scale
// ===========================================================================

test('SHOT-8 snapshot 输出补 scroll / scale（坐标系契约的另一半）', () => {
  const out = JSON.parse(buildSnapshotOutput({
    tabId: 't1',
    raw: {
      title: 'T', url: 'https://x.test/', text: '正文',
      elements: [{ tag: 'button', text: '登录', x: 10, y: 20 }],
      viewport: { w: 800, h: 600 },
      scroll: { x: 10, y: 20 },
      scale: 2,
    },
  }));
  assert.deepEqual(out.scroll, { x: 10, y: 20 });
  assert.equal(out.scale, 2);
  assert.deepEqual(out.viewport, { w: 800, h: 600 });
});

test('SHOT-8b 视口信息脚本是**固定常量**（模型参数不进 JS）', () => {
  assert.ok(VIEWPORT_INFO_SCRIPT.includes('devicePixelRatio'));
  assert.ok(VIEWPORT_INFO_SCRIPT.includes('innerWidth'));
  assert.ok(!/\$\{|%s/.test(VIEWPORT_INFO_SCRIPT), '⛔ 不能有模板占位（那意味着模型参数会拼进 JS）');
});


// ===========================================================================
// T-062 · 截图 stdout 的 upload 三态字段（坐标块保持原样）
// ===========================================================================
test('SHOT-T062 stdout 含 shotId + upload pending，且不再用 url 冒充截图 URL', async () => {
  const calls = installPool();
  const r = await pcBrowserShot({ tabId: 't1' }, { sessionId: 'S1' });
  assert.equal(r.status, 'ok');
  const out = JSON.parse(r.stdout);
  assert.ok(out.shotId, '每次截图要有 shotId');
  assert.equal(out.upload.shotId, out.shotId);
  assert.equal(out.upload.status, 'pending');
  assert.equal(out.upload.url, '');
  assert.equal(out.page_url, '');
  assert.equal('url' in out, false, '⛔ 顶层 url 不再是含糊的页面/截图 URL');
  // 坐标块逐字保持
  assert.deepEqual(out.viewport, { w: 800, h: 600 });
  assert.deepEqual(out.scroll, { x: 10, y: 20 });
  assert.equal(out.scale, 2);
  assert.deepEqual(out.image, { w: 1600, h: 1200 });
  fs.unlinkSync(r.artifacts[0].path);
});
