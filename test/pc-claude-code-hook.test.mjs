// [2026-11-17 · T-020 · S3] Claude Code hook 桥单测（PM 口径：一律放行 / 自动点确定）
//
// ## 覆盖断言
//
//   GC-HB-1  桥只绑 127.0.0.1（不对外暴露）
//   GC-HB-2  ★ 无 token ⇒ 401（防本机任意进程冒用）
//   GC-HB-3  ★ 转发：把 hook 输入原样带给 gaclaw，**只把 hook 应答体透传回去**
//   GC-HB-4  ★ 上游失败 ⇒ 503（让 Claude Code 按 onFailure 处理）
//   GC-HB-5  ★ 只收 POST
//   GC-HB-6  请求体上限（防拿这个口灌数据）
//   GC-HB-7  hook 配置片段形状（type/url/timeout/onFailure=continue）
//   GC-HB-8  ★ 装 hook：只动 PermissionRequest，别的字段/事件逐字保留
//   GC-HB-9  ★ 重装：替换掉自己那条（端口变了也能认出来）
//   GC-HB-10 ★ 卸载：只删自己那条，别人配的 hook 一条不碰
//   GC-HB-11 ★ 解析失败时**拒绝覆写**用户配置
//   GC-HB-12 ★ allowedHttpHookUrls 不含我们 ⇒ 如实报错，**不擅改**用户安全设置
//
// 运行: node --test test/pc-claude-code-hook.test.mjs   (完全离线)

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ── HOME 隔离（必须在 import 被测模块前设好）────────────────────────────
const FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'gacode-hook-'));
process.env.HOME = FAKE_HOME;
process.env.USERPROFILE = FAKE_HOME;

const {
  startHookBridge, buildHookConfig, hookUrl, bridgeToken,
} = await import('../electron/client-tools/claudeCodeHookBridge.ts');
const {
  mergeHook, removeHook, installHook, uninstallHook, claudeSettingsFile,
} = await import('../electron/client-tools/claudeCodeHookInstall.ts');

// ── 工具 ───────────────────────────────────────────────────────────────
/** 起一个假的上游（记录收到的请求，返回指定应答）。 */
function fakeUpstream(status, body) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init, body: init && init.body ? JSON.parse(init.body) : null });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  };
  fn.calls = calls;
  return fn;
}

/** 起桥 + 发一个请求。 */
async function withBridge(fn, upstream) {
  const h = await startHookBridge({ endpoint: 'http://gaclaw.invalid/x', fetchImpl: upstream, ...fn });
  try {
    return await fn.run(h);
  } finally {
    await h.close();
  }
}

/** 用 fetch 打本机桥。 */
async function callBridge(port, { token, path: p = '/hook/permission', method = 'POST', body } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${p}${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) {}
  return { status: res.status, json, text };
}

// ═══════════════════════════════════════════════════════════════════════

test('GC-HB-1 · 桥只绑 127.0.0.1', async () => {
  const h = await startHookBridge({ endpoint: 'http://x.invalid', fetchImpl: fakeUpstream(200, {}) });
  try {
    assert.ok(h.port > 0, '应拿到一个端口');
    // 能从 127.0.0.1 连上
    const r = await callBridge(h.port, { token: h.token });
    assert.notStrictEqual(r.status, 0);
  } finally {
    await h.close();
  }
});

test('GC-HB-2 · ★ 无 token ⇒ 401', async () => {
  const up = fakeUpstream(200, { hookResponse: { ok: 1 } });
  const h = await startHookBridge({ endpoint: 'http://x.invalid', fetchImpl: up });
  try {
    const r = await callBridge(h.port, {});
    assert.strictEqual(r.status, 401);
    assert.strictEqual(up.calls.length, 0, '没鉴权通过就不许转发');
  } finally {
    await h.close();
  }
});

test('GC-HB-2b · ★ 错 token ⇒ 401（正确 token 才放行）', async () => {
  const up = fakeUpstream(200, { hookResponse: { ok: 1 } });
  const h = await startHookBridge({ endpoint: 'http://x.invalid', fetchImpl: up });
  try {
    const bad = await callBridge(h.port, { token: 'wrong-token' });
    assert.strictEqual(bad.status, 401);
    const good = await callBridge(h.port, { token: h.token });
    assert.strictEqual(good.status, 200);
  } finally {
    await h.close();
  }
});

test('GC-HB-3 · ★ 转发：输入原样带给上游，**只把 hook 应答体透传回去**', async () => {
  const hookResp = { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } };
  const up = fakeUpstream(200, { ok: true, status: 'approved', hookResponse: hookResp });
  const h = await startHookBridge({ endpoint: 'http://gaclaw.invalid/req', fetchImpl: up });
  try {
    const r = await callBridge(h.port, {
      token: h.token,
      body: { session_id: 'abc', tool_name: 'Bash', tool_input: { command: 'ls' } },
    });
    assert.strictEqual(r.status, 200);
    // 透传的**就是** hook 应答体本身（不是 {ok,status,hookResponse} 那层）
    assert.deepStrictEqual(r.json, hookResp);
    // 上游收到了原始 hook 输入
    assert.strictEqual(up.calls[0].body.tool_name, 'Bash');
    assert.strictEqual(up.calls[0].body.session_id, 'abc');
  } finally {
    await h.close();
  }
});

test('GC-HB-3b · ★ Claude Code 原生字段归一化：hook_event_name/tool_name ⇒ eventName/toolName', async () => {
  const hookResp = { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } };
  const up = fakeUpstream(200, { hookResponse: hookResp });
  const h = await startHookBridge({
    endpoint: 'http://gaclaw.invalid/req',
    fetchImpl: up,
  });
  try {
    const r = await callBridge(h.port, {
      token: h.token,
      body: { hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'ls' } },
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(up.calls[0].body.toolName, 'Bash');
    assert.strictEqual(up.calls[0].body.eventName, 'PermissionRequest');
    // 原始字段也不能丢（上游/审计想看完整 hook 输入时还有）
    assert.strictEqual(up.calls[0].body.tool_name, 'Bash');
    assert.strictEqual(up.calls[0].body.hook_event_name, 'PermissionRequest');
  } finally {
    await h.close();
  }
});

test('GC-HB-4 · ★ 上游失败 ⇒ 503（让 Claude Code 按 onFailure 处理）', async () => {
  const up = fakeUpstream(500, { error: 'boom' });
  const h = await startHookBridge({ endpoint: 'http://gaclaw.invalid/req', fetchImpl: up });
  try {
    const r = await callBridge(h.port, { token: h.token, body: { tool_name: 'Bash' } });
    assert.strictEqual(r.status, 503);
    assert.strictEqual(r.json.ok, false);
  } finally {
    await h.close();
  }
});

test('GC-HB-5 · 只收 POST', async () => {
  const h = await startHookBridge({ endpoint: 'http://x.invalid', fetchImpl: fakeUpstream(200, {}) });
  try {
    const r = await callBridge(h.port, { token: h.token, method: 'GET' });
    assert.strictEqual(r.status, 405);
  } finally {
    await h.close();
  }
});

test('GC-HB-6 · 请求体上限（防拿这个口灌数据）', async () => {
  const h = await startHookBridge({ endpoint: 'http://x.invalid', fetchImpl: fakeUpstream(200, {}) });
  try {
    const huge = 'x'.repeat(300 * 1024);
    let res = null;
    try {
      res = await callBridge(h.port, { token: h.token, body: huge });
    } catch (_) { /* 连接被 destroy ⇒ fetch 抛错，也算挡住 */ }
    if (res) assert.notStrictEqual(res.status, 200);
  } finally {
    await h.close();
  }
});

test('GC-HB-7 · hook 配置片段形状', () => {
  const cfg = buildHookConfig({ url: 'http://127.0.0.1:9/hook?token=t' });
  const entry = cfg.hooks.PermissionRequest[0];
  assert.strictEqual(entry.matcher, '*');
  const h = entry.hooks[0];
  assert.strictEqual(h.type, 'http');
  assert.strictEqual(h.url, 'http://127.0.0.1:9/hook?token=t');
  assert.strictEqual(h.timeout, 60);
  assert.strictEqual(h.onFailure, 'continue', 'PM 口径：失败交回原流程，不卡用户');
  // URL 必须带我们的标记（卸载时靠它认领）
  assert.ok(hookUrl(1234, 'abc').includes('gaclaw-hook-bridge'));
});

test('GC-HB-8 · ★ 装 hook：只动 PermissionRequest，别的字段/事件逐字保留', () => {
  const existing = {
    model: 'x',
    env: { A: '1' },
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo hi' }] }],
      PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'fmt' }] }],
    },
  };
  const url = 'http://127.0.0.1:9999/hook?token=t&src=gaclaw-hook-bridge';
  const { merged } = mergeHook(existing, { matcher: '*', hooks: [{ type: 'http', url }] }, url, 'PermissionRequest');

  assert.strictEqual(merged.model, 'x');
  assert.deepStrictEqual(merged.env, { A: '1' });
  // 别的**事件**逐字不变
  assert.deepStrictEqual(merged.hooks.PreToolUse, existing.hooks.PreToolUse);
  assert.deepStrictEqual(merged.hooks.PostToolUse, existing.hooks.PostToolUse);
  // 只在 PermissionRequest 里加了一条
  assert.strictEqual(merged.hooks.PermissionRequest.length, 1);
  assert.strictEqual(merged.hooks.PermissionRequest[0].hooks[0].url, url);
});

test('GC-HB-9 · ★ 重装：替换掉自己那条（端口变了也能认出来）', () => {
  const oldUrl = 'http://127.0.0.1:1111/hook?token=old&src=gaclaw-hook-bridge';
  const newUrl = 'http://127.0.0.1:2222/hook?token=new&src=gaclaw-hook-bridge';
  const existing = {
    hooks: {
      PermissionRequest: [
        { matcher: '*', hooks: [{ type: 'http', url: oldUrl }] },
        { matcher: 'Write', hooks: [{ type: 'command', command: 'other' }] },
      ],
    },
  };
  const { merged, replaced } = mergeHook(existing, { matcher: '*', hooks: [{ type: 'http', url: newUrl }] }, newUrl, 'PermissionRequest');
  assert.strictEqual(replaced, 1, '旧的那条应被认出并替换');
  assert.strictEqual(merged.hooks.PermissionRequest.length, 2);
  // 别人的那条**原样保留，且顺序不变**（我们的新 hook 追加在后面）
  assert.deepStrictEqual(merged.hooks.PermissionRequest[0], existing.hooks.PermissionRequest[1]);
  assert.strictEqual(merged.hooks.PermissionRequest[1].hooks[0].url, newUrl);
});

test('GC-HB-10 · ★ 卸载：只删自己那条，别人配的 hook 一条不碰', () => {
  const ourUrl = 'http://127.0.0.1:2222/hook?token=new&src=gaclaw-hook-bridge';
  const existing = {
    hooks: {
      PermissionRequest: [
        { matcher: '*', hooks: [{ type: 'http', url: ourUrl }] },
        { matcher: 'Write', hooks: [{ type: 'command', command: 'other' }] },
      ],
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo' }] }],
    },
  };
  const { merged, removed } = removeHook(existing, ourUrl);
  assert.strictEqual(removed, 1);
  assert.strictEqual(merged.hooks.PermissionRequest.length, 1);
  assert.deepStrictEqual(merged.hooks.PermissionRequest[0], existing.hooks.PermissionRequest[1]);
  assert.deepStrictEqual(merged.hooks.PreToolUse, existing.hooks.PreToolUse);
});

test('GC-HB-11 · ★ 解析失败时拒绝覆写用户配置', () => {
  const file = claudeSettingsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{ this is not json');
  const r = installHook({ url: 'http://127.0.0.1:9/hook?token=t' });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /解析失败/);
  // ★ 文件**必须没被改**
  assert.strictEqual(fs.readFileSync(file, 'utf8'), '{ this is not json');
});

test('GC-HB-12 · ★ allowedHttpHookUrls 不含我们 ⇒ 如实报错，不擅改用户安全设置', () => {
  const file = claudeSettingsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ allowedHttpHookUrls: ['https://only.example.com/*'] }, null, 2));
  const r = installHook({ url: 'http://127.0.0.1:9/hook?token=t' });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /allowedHttpHookUrls/);
  // ★ 用户的 allowedHttpHookUrls **必须没被改**
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepStrictEqual(after.allowedHttpHookUrls, ['https://only.example.com/*']);
});

test('GC-HB-12b · dry-run 不写盘', () => {
  const file = claudeSettingsFile();
  fs.writeFileSync(file, JSON.stringify({ model: 'x' }, null, 2));
  const before = fs.readFileSync(file, 'utf8');
  const r = installHook({ url: 'http://127.0.0.1:9/hook?token=t&src=gaclaw-hook-bridge', dryRun: true });
  assert.strictEqual(r.ok, true);
  assert.ok(r.nextContent.includes('PermissionRequest'));
  assert.strictEqual(fs.readFileSync(file, 'utf8'), before, 'dry-run 不许写盘');
});

test('GC-HB-12c · 真装 ⇒ 只动 hooks 键，其余字段逐字保留', () => {
  const file = claudeSettingsFile();
  fs.writeFileSync(file, JSON.stringify({ model: 'x', env: { A: '1' } }, null, 2));
  const url = 'http://127.0.0.1:9/hook?token=t&src=gaclaw-hook-bridge';
  const r = installHook({ url });
  assert.strictEqual(r.ok, true, r.error);
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(after.model, 'x');
  assert.deepStrictEqual(after.env, { A: '1' });
  assert.strictEqual(after.hooks.PermissionRequest[0].hooks[0].url, url);
  // 卸载 ⇒ 回到原样
  const u = uninstallHook({ url });
  assert.strictEqual(u.ok, true, u.error);
  const back = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(back.hooks.PermissionRequest, undefined);
  assert.strictEqual(back.model, 'x');
});
