// [2026-11-20 · T-087] Claude Code 会话协作工具（list/read/send）单测
//
// 覆盖：
//   - CLI 参数解析（buildBody）与连接解析（settings/--hook-url）
//   - 本地路由 token / 仅 POST / 未知路径 404
//   - list 默认 limit=20 + 过滤 + 子 session 拒绝
//   - read 权限（子 session 只能读父） + 只读摘要
//   - send 不能发自己 / 子 session 只能回父 / 幂等字段 / 白名单
//
// 运行: node --experimental-strip-types --test test/cc-session-tools.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FAKE_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'gaclaw-ccmsg-'));
process.env.HOME = FAKE_HOME;
process.env.USERPROFILE = FAKE_HOME;

const tools = await import('../electron/client-tools/ccSessionTools.ts');
const { handleCcTool, CC_MESSAGES_PATH } = await import('../electron/client-tools/ccSessionToolService.ts');
const { startHookBridge } = await import('../electron/client-tools/claudeCodeHookBridge.ts');
const { resolveConnection } = await import('../electron/client-tools/ccMsgCliSettings.ts');

// ── helpers ────────────────────────────────────────────────────────────
function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url: String(url), init, body: init?.body ? JSON.parse(init.body) : null });
    return await handler(String(url), init, calls);
  };
  fn.calls = calls;
  return fn;
}

function okResponse(data) {
  return { ok: true, status: 200, text: async () => JSON.stringify(data) };
}

function baseDeps(overrides = {}) {
  return {
    apiBase: () => 'https://example.invalid/api/v1',
    accessToken: () => 'device-token',
    deviceId: () => 'device-1',
    fetchImpl: fakeFetch(async () => okResponse({ items: [], next_cursor: null })),
    ...overrides,
  };
}

async function callBridge(port, token, route, body = {}, method = 'POST') {
  const res = await fetch(`http://127.0.0.1:${port}/cc-tools/${route}?token=${encodeURIComponent(token)}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, json };
}

// ═══════════════════════════════════════════════════════════════════════

test('T087-01 · CLI 连接：从 hook settings 读回 base+token，也支持 --hook-url 覆盖', () => {
  const settingsDir = path.join(FAKE_HOME, '.claude');
  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({
    hooks: {
      PermissionRequest: [{
        matcher: '*',
        hooks: [{ type: 'http', url: 'http://127.0.0.1:17642/hook/permission?token=tok-123&src=gaclaw-hook-bridge' }],
      }],
    },
  }));

  assert.deepEqual(resolveConnection({}), { baseUrl: 'http://127.0.0.1:17642', token: 'tok-123' });
  assert.deepEqual(
    resolveConnection({ hookUrl: 'http://127.0.0.1:9999/x?token=override' }),
    { baseUrl: 'http://127.0.0.1:9999', token: 'override' },
  );
  assert.deepEqual(
    resolveConnection({ hookUrl: 'http://127.0.0.1:9999/x', token: 'explicit' }),
    { baseUrl: 'http://127.0.0.1:9999', token: 'explicit' },
  );
  assert.throws(() => resolveConnection({ hookUrl: 'https://evil.example/x' }), /只能指向本机/);
});

test('T087-02 · 本地路由：token 校验 + 只收 POST + 路径分派', async () => {
  const h = await startHookBridge({
    endpoint: 'http://unused.invalid',
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => '{}' }),
    ccTools: async (route, body) => ({ ok: true, route, echo: body }),
  });
  try {
    const noToken = await fetch(`http://127.0.0.1:${h.port}/cc-tools/list`, { method: 'POST', body: '{}' });
    assert.equal(noToken.status, 401);

    const bad = await callBridge(h.port, 'wrong', 'list');
    assert.equal(bad.status, 401);

    const good = await callBridge(h.port, h.token, 'list', { query: 'x' });
    assert.equal(good.status, 200);
    assert.deepEqual(good.json, { ok: true, route: 'list', echo: { query: 'x' } });

    const get = await callBridge(h.port, h.token, 'list', {}, 'GET');
    assert.equal(get.status, 405);

    const unknown = await fetch(`http://127.0.0.1:${h.port}/cc-tools/delete?token=${h.token}`, { method: 'POST', body: '{}' });
    assert.equal(unknown.status, 200); // 老 hook 行为：任意路径都转发；未命中 cc 路由不会调用 ccTools
  } finally {
    await h.close();
  }
});

test('T087-03 · list：默认 limit=20，过滤 query/title/sessionId', async () => {
  const candidates = Array.from({ length: 40 }, (_, i) => ({
    sessionId: i === 0 ? 'sess-target' : `s-${i}`,
    title: i === 0 ? '目标会话' : `会话 ${i}`,
    source: i % 2 === 0 ? 'gacode' : 'claude-code',
    status: 'active',
    updatedAt: new Date(Date.now() - i * 60000).toISOString(),
  }));
  const gate = tools.listSessions(candidates, {}, 'main');
  assert.equal(gate.limit, 20);
  assert.equal(gate.sessions.length, 20);

  const q = tools.listSessions(candidates, { query: '目标' }, 'main');
  assert.deepEqual(q.sessions.map((s) => s.sessionId), ['sess-target']);
  const byId = tools.listSessions(candidates, { sessionId: 's-5' }, 'main');
  assert.deepEqual(byId.sessions.map((s) => s.sessionId), ['s-5']);
  const byTitle = tools.listSessions(candidates, { title: '会话 3' }, 'main');
  assert.ok(byTitle.sessions.length > 0);
  assert.ok(byTitle.sessions.every((s) => s.title.includes('会话 3')));
  assert.throws(() => tools.listSessions(candidates, { limit: 999 }, 'main'), /limit/);
});

test('T087-04 · list：子 session 拒绝；read：子 session 只能读父（只读）', () => {
  assert.throws(() => tools.listSessions([], {}, 'subsession'), /子 session 不允许 list/);
  assert.throws(() => tools.authorizeRead({ sessionId: 'a', role: 'subsession', parentSessionId: 'b' }, () => null), /只能读自己的父/);

  let called = 0;
  const r = tools.authorizeRead({
    sessionId: 'parent-1', maxTurns: 7, role: 'subsession', parentSessionId: 'parent-1',
  }, (sid, maxTurns) => { called++; return { sid, maxTurns }; });
  assert.equal(called, 1);
  assert.deepEqual(r.result, { sid: 'parent-1', maxTurns: 7 });
});

test('T087-05 · read 摘要：summary / role / toolCallCount，不返回全文', () => {
  const out = tools.summarizeTurns([
    { role: 'user', content: '  你好  世界  ', tools: [] },
    { role: 'assistant', text: '调用工具', tools: ['Bash', 'Read'] },
    { role: 'assistant', text: 'done', toolCallCount: 3 },
  ]);
  assert.equal(out[0].summary, '你好 世界');
  assert.equal(out[1].toolCallCount, 2);
  assert.equal(out[2].toolCallCount, 3);
  assert.ok(!JSON.stringify(out).includes('调用工具' + ' '.repeat(20)));
});

test('T087-06 · send：不能发给自己；子 session 只能回父；fail-closed', () => {
  assert.throws(() => tools.buildSendPayload({
    toSessionId: 'same', content: 'hi', role: 'main', selfSessionId: 'same',
  }), /不能发给自己/);

  assert.throws(() => tools.buildSendPayload({
    toSessionId: 'other', content: 'hi', role: 'subsession', parentSessionId: 'parent',
  }), /只能回父/);

  const ok = tools.buildSendPayload({
    toSessionId: 'parent', content: '  ok  ', role: 'subsession', parentSessionId: 'parent',
    replyToCcSessionId: 'parent', taskId: 't1', idempotencyKey: 'k1',
  });
  assert.deepEqual(ok, {
    toSessionId: 'parent', content: 'ok', taskId: 't1',
    replyTo: { taskId: 't1', ccSessionId: 'parent', businessSessionId: null, channel: null },
    idempotencyKey: 'k1',
  });
  assert.throws(() => tools.buildSendPayload({
    toSessionId: 'x', content: 'a'.repeat(tools.MAX_CONTENT_LENGTH + 1), role: 'main',
  }), /最长 8000/);
});

test('T087-07 · send：白名单字段 + 固定身份（不带 userId/kind/fromKind）+ 幂等键', async () => {
  const captured = [];
  const deps = baseDeps({
    fetchImpl: fakeFetch(async (url, init, calls) => {
      captured.push(calls[calls.length - 1]);
      return okResponse({ ok: true, inboxId: 'inbox-1' });
    }),
  });
  const result = await handleCcTool('send', {
    toSessionId: '123', content: '回你', taskId: 'task-1',
    replyToCcSessionId: 'cc-parent', idempotencyKey: 'idem-1',
    userId: 'evil', kind: 'work_unit_result', fromKind: 'user', role: 'subsession',
  }, deps);

  assert.equal(result.ok, true);
  assert.equal(captured[0].url, `https://example.invalid/api/v1${CC_MESSAGES_PATH}`);
  assert.equal(captured[0].init.method, 'POST');
  assert.deepEqual(captured[0].body, {
    sessionId: '123', content: '回你', taskId: 'task-1',
    replyToCcSessionId: 'cc-parent', idempotencyKey: 'idem-1',
  });
  assert.ok(!JSON.stringify(captured[0].body).includes('userId'));
  assert.ok(!JSON.stringify(captured[0].body).includes('fromKind'));
  assert.ok(!JSON.stringify(captured[0].body).includes('kind'));
});

test('T087-08 · list 通过服务：默认只取近期 20（服务端 limit），返回标准字段', async () => {
  const deps = baseDeps({
    fetchImpl: fakeFetch(async () => okResponse({
      items: [{ id: '42', title: 'g1', last_message_at: '2026-11-20T00:00:00Z' }],
      next_cursor: null,
    })),
  });
  const r = await handleCcTool('list', {}, deps);
  assert.equal(r.ok, true);
  assert.equal(r.limit, 20);
  assert.ok(String(deps.fetchImpl.calls[0].url).includes('limit=20'));
  const item = r.sessions.find((s) => s.sessionId === '42');
  assert.ok(item);
  assert.deepEqual(Object.keys(item).sort(), [
    'role', 'sessionId', 'source', 'status', 'title', 'updatedAt',
  ]);
});

test('T087-09 · read 通过服务：非本人 session（404）fail-closed', async () => {
  const deps = baseDeps({
    fetchImpl: async () => ({ ok: false, status: 404, text: async () => JSON.stringify({ error: 'not found' }) }),
  });
  await assert.rejects(
    () => handleCcTool('read', { sessionId: '999', maxTurns: 5 }, deps),
    (e) => e.code === 'NOT_FOUND' && e.status === 404,
  );
});

test('T087-10 · send 幂等：同 idempotencyKey 原样带给服务端（由服务端去重）', async () => {
  const captured = [];
  const deps = baseDeps({
    fetchImpl: fakeFetch(async (url, init, calls) => {
      captured.push(calls[calls.length - 1].body);
      return okResponse({ inboxId: 'inbox-2', duplicate: false });
    }),
  });
  await handleCcTool('send', { toSessionId: '7', content: 'x', idempotencyKey: 'same-key' }, deps);
  await handleCcTool('send', { toSessionId: '7', content: 'x', idempotencyKey: 'same-key' }, deps);
  assert.deepEqual(captured[0], captured[1]);
  assert.equal(captured[0].idempotencyKey, 'same-key');
});

// ── [T-156] cc-tools send 的字符过滤：放行换行、仍拦真控制字符 ─────────────
//
// 起因（2026-11-26）：原校验是 /[\u0000-\u001f]/ ⇒ 连 LF/CR/TAB 一起禁
// ⇒ **多行内容一律被拒** ⇒ 一天内拦掉 3 次回报（凡是要发 diff 片段、多行清单、
// 代码块都发不出去，只能改成单行硬拼）。
//
// 覆盖：
//   T156-H1  多行正文（含换行 + 制表）**可以**发出，且逐字送达
//   T156-H2  真控制字符（ESC/NUL/BEL/DEL）**仍然被拒**（fail-closed 不放松）
//   T156-H3  含反引号、加减号、连续点号等普通符号**可以**发出
//   T156-H4  其它字段同样适用新规则 —— 换行不再被误杀；长度上限仍在

test('T156-H1 · send：多行正文（含换行与制表）可发，且逐字送达', async () => {
  const captured = [];
  const deps = baseDeps({
    fetchImpl: fakeFetch(async (url, init, calls) => {
      captured.push(calls[calls.length - 1].body);
      return okResponse({ ok: true, inboxId: 'inbox-nl' });
    }),
  });

  const multiline = '第一行\n第二行\n\n第三行（有空行）\t带制表符';
  const result = await handleCcTool('send', {
    toSessionId: '123', content: multiline, idempotencyKey: 'nl-1',
  }, deps);

  assert.equal(result.ok, true, '多行内容不应被拒');
  assert.equal(captured[0].content, multiline, '正文必须逐字送达，不能被改写');
  assert.ok(captured[0].content.includes('\n'), '换行必须保留');
  assert.ok(captured[0].content.includes('\t'), '制表符必须保留');
});

test('T156-H2 · send：真控制字符（ESC / NUL / BEL / DEL）仍然被拒', async () => {
  const deps = baseDeps({
    fetchImpl: fakeFetch(async () => okResponse({ ok: true, inboxId: 'never' })),
  });

  for (const bad of ['带\u0000NUL', '带\u001bESC', '带\u0007BEL', '带\u007fDEL']) {
    await assert.rejects(
      () => handleCcTool('send', { toSessionId: '123', content: bad }, deps),
      (e) => e.code === 'INVALID_ARGUMENT' && /控制字符/.test(e.message),
      `真控制字符必须被拒: ${JSON.stringify(bad)}`,
    );
  }
});

test('T156-H3 · send：反引号 / 加减号 / 连续点号等普通符号可发', async () => {
  const captured = [];
  const deps = baseDeps({
    fetchImpl: fakeFetch(async (url, init, calls) => {
      captured.push(calls[calls.length - 1].body);
      return okResponse({ ok: true, inboxId: 'inbox-sym' });
    }),
  });

  const tricky = '用 `code` 反引号\n+ 加号行\n- 减号行\nc7142f0..5c0c73c 连续点号\n→ 箭头';
  const result = await handleCcTool('send', {
    toSessionId: '123', content: tricky, idempotencyKey: 'sym-1',
  }, deps);

  assert.equal(result.ok, true, '这些符号不应被当成控制字符');
  assert.equal(captured[0].content, tricky);
});

test('T156-H4 · send：其它字段同样适用（换行不再被误杀），但长度上限仍在', async () => {
  const deps = baseDeps({
    fetchImpl: fakeFetch(async () => okResponse({ ok: true, inboxId: 'inbox-f' })),
  });

  // 换行在其它字段里同样放行
  await assert.doesNotReject(
    () => handleCcTool('send', { toSessionId: '123', content: 'x', taskId: 'a\nb' }, deps),
  );

  // 长度上限没放松（超长仍拒）
  await assert.rejects(
    () => handleCcTool('send', { toSessionId: '123', content: 'x'.repeat(8001) }, deps),
    (e) => e.code === 'INVALID_ARGUMENT' && /最长/.test(e.message),
  );
});
