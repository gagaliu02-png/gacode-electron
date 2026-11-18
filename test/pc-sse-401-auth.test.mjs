// [2026-11-18 · T-039] PC 端「SSE 401 自动续期」单测
//
// 覆盖断言：
//   AR-1  第一次请求就带 **当前 accessToken**（旧写法压根不带 Authorization）
//   AR-2  401 ⇒ 自动续期 ⇒ 用**新 token**重发（重发带的是新 token，不是旧的）
//   AR-3  续期失败 ⇒ 抛 AuthExpiredError，文案「登录已过期，请重新登录」
//         （⇒ 不许落进通用错误分支、更不许把别处的 409 文案原样弹给用户）
//   AR-4  续期后仍是 401 ⇒ 抛 AuthExpiredError（不许无限刷）
//   AR-5  续期**单飞只有一份**（api.ts 的 tryRefresh 委托 auth-refresh.ts）
//   AR-6  三条路（发起 / 只读接入 / 无流）+ 常驻订阅都走统一 helper
//
// ⚠️ 本文件只 import `sse/auth-retry.ts`（零 app 依赖）⇒ node --test 能直接跑真逻辑。
// 运行: node --test test/pc-sse-401-auth.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 测试替身：window（dispatchEvent / authStorage.read）。 */
function installWindow() {
  globalThis.window = {
    dispatchEvent: () => true,
    addEventListener: () => {},
    gacode: {
      authStorage: {
        // 磁盘上的 refreshToken（rotation 后永远是最新值）
        read: async () => "refresh-token-0123456789",
      },
    },
  };
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Map(),
    json: async () => body,
  };
}

/** 去掉注释再匹配（源码里的说明性注释会提到旧写法，不能让断言误伤）。 */
function codeOnly(file) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

test("AR-1~AR-4：带 token → 401 续期 → 用新 token 重发 / 续期失败抛专用错误", async () => {
  installWindow();
  const retry = await import("../src/lib/auth-retry.ts");

  // 依赖是**注入**的（app 侧在 auth.tsx 里接线）⇒ 这里直接注入测试替身。
  const realRefresh = async () => {
    const r = await globalThis.fetch("https://x/api/v1/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: "refresh-token-0123456789" }),
    });
    const json = await r.json();
    return json?.ok && json?.data?.accessToken ? json.data.accessToken : null;
  };
  retry.configureAuthRetry({
    getToken: () => "old-token",
    refresh: realRefresh,
    onAuthExpired: () => {
      globalThis.__expired = (globalThis.__expired ?? 0) + 1;
    },
  });

  // ── AR-1 / AR-2 ──
  const calls = [];
  globalThis.fetch = async (url) => {
    if (String(url).includes("/auth/refresh")) {
      return jsonResponse({ ok: true, data: { accessToken: "new-token", refreshToken: "rt-2" } });
    }
    calls.push(globalThis.__lastToken);
    // 第一次 401，第二次 200
    return calls.length === 1
      ? jsonResponse({ ok: false, error: { message: "expired" } }, 401)
      : jsonResponse({ ok: true });
  };

  const res = await retry.fetchWithAuthRetry(
    async (t) => {
      globalThis.__lastToken = t;
      return globalThis.fetch("https://x/api/v1/yinian/sessions/1/chat/stream");
    },
    { label: "test" },
  );

  assert.equal(res.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[0], "old-token", "AR-1：第一次必须带当前 token");
  assert.equal(calls[1], "new-token", "AR-2：重发必须带新 token");

  // ── AR-3：续期失败 ⇒ AuthExpiredError + 人话文案 + 触发收尾 ──
  globalThis.__expired = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/auth/refresh")) {
      return jsonResponse({ ok: false }, 400);
    }
    return jsonResponse({ ok: false }, 401);
  };
  await assert.rejects(
    () =>
      retry.fetchWithAuthRetry(async () => jsonResponse({ ok: false }, 401), {
        label: "test-expired",
      }),
    (err) => {
      assert.equal(err.name, "AuthExpiredError");
      assert.equal(err.code, "AUTH_EXPIRED");
      assert.match(err.message, /登录已过期/);
      return true;
    },
  );
  assert.equal(globalThis.__expired, 1, "AR-3：续期失败要触发收尾（清登录态）");

  // ── AR-4：续期后仍是 401 ⇒ 也抛 AuthExpiredError（不许无限刷） ──
  let refreshCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/auth/refresh")) {
      refreshCalls += 1;
      return jsonResponse({ ok: true, data: { accessToken: "newer", refreshToken: "rt-3" } });
    }
    return jsonResponse({ ok: false }, 401);
  };
  await assert.rejects(
    () =>
      retry.fetchWithAuthRetry(async () => jsonResponse({ ok: false }, 401), {
        label: "test-still401",
      }),
    (err) => err.name === "AuthExpiredError",
  );
  assert.equal(refreshCalls, 1, "AR-4：续期最多一次，不许死循环");
});

test("AR-5：api.ts 的 tryRefresh 委托 auth-refresh.ts（不再各有一份单飞）", () => {
  const apiSrc = codeOnly("src/lib/api.ts");
  const refreshSrc = codeOnly("src/lib/auth-refresh.ts");

  assert.match(
    apiSrc,
    /export async function tryRefresh\(\)[\s\S]{0,200}tryRefreshAccessToken\(/,
    "api.ts 的 tryRefresh 必须委托 auth-refresh.ts",
  );
  assert.match(apiSrc, /import \{ tryRefreshAccessToken \} from "\.\/auth-refresh"/,
    "api.ts 要 import auth-refresh（单飞的那一份）");
  assert.doesNotMatch(apiSrc, /let refreshPromise/, "api.ts 不许再自己留一份单飞 promise");
  assert.match(
    refreshSrc,
    /let refreshPromise: Promise<string \| null> \| null/,
    "单飞实现留在 auth-refresh.ts",
  );
  // 401 重发必须用**返回值**，不能靠 setState 之后的 getAccessToken()
  assert.doesNotMatch(
    apiSrc,
    /const newToken = getAccessToken\(\);/,
    "不许再用 getAccessToken() 取续期后的 token（React state 还没更新）",
  );
});

test("AR-6：chat-stream 三条路都走 fetchWithAuthRetry（不再有 fetchX(null)）", () => {
  const src = codeOnly("src/lib/chat-stream.ts");
  assert.doesNotMatch(src, /fetchStream\(null\)/, "发起路不许再以 null 起手");
  assert.doesNotMatch(src, /fetchAttach\(null\)/, "接入路不许再以 null 起手");
  assert.doesNotMatch(src, /doFetch\(null\)/, "无流路不许再以 null 起手");
  const hits = src.match(/fetchWithAuthRetry\(/g) || [];
  assert.ok(hits.length >= 3, `三条路都要走 helper（实际 ${hits.length} 处）`);
});

test("AR-6b：常驻订阅也走同一个 helper，且登录过期时停止重连", () => {
  const src = codeOnly("src/lib/chat-subscribe.ts");
  assert.match(src, /fetchWithAuthRetry\(/);
  assert.match(src, /AuthExpiredError/);
  assert.doesNotMatch(src, /fetchSubscribe\(null/);
});
