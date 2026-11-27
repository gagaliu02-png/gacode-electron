// [T-179] `authFetch` 双值 authorization 头的回归护栏
//
// ---------------------------------------------------------------------------
// 病根（现网 2026-11-27 · CC→Cody 回报链路恒 401）：
//
//   调用方 `ccSessionToolService.authHeaders()` 写的是**小写** `authorization`，
//   而 `authFetchInternal` 用**大写** `Authorization` spread 覆盖：
//
//     headers: { ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) }
//
//   ⇒ 普通对象里同时留下 `authorization` + `Authorization` 两个 key
//   ⇒ undici / Node 的 `Headers` **大小写不敏感**归并，且用**逗号拼接**值：
//
//     authorization: "Bearer <旧>, Bearer <新>"
//
//   ⇒ 服务端 `@fastify/jwt` 解析出畸形 Bearer ⇒ **恒 401**
//   ⇒ 连 T-175 加的「401 刷新后重试一次」也救不回来（重试还是双值）
//   ⇒ `POST /devices/cc/messages` 永久失败 ⇒ Cody 收不到 Claude Code 的回报。
//
// 本测试**真的发一次 HTTP 请求**（打到本地临时 server），断言服务端收到的
// authorization 头**只有一个 token、不含逗号**。
//
// 运行: node --test test/pc-t179-authorization-header.test.mjs   (完全离线)

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

/** 起一个只回显收到的 authorization 头的本地 server。 */
function startEchoServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ auth: req.headers.authorization ?? null }));
    });
    srv.listen(0, "127.0.0.1", () => {
      resolve({ srv, port: srv.address().port });
    });
  });
}

/**
 * 复刻 `authFetchInternal` 的 **旧** 写法（用于证明这个 bug 真的存在）。
 * 保留它当「反例」，避免以后有人把修法改回去还以为测试能兜住。
 */
function oldStyleHeaders(initHeaders, token) {
  return {
    ...initHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * 复刻修好之后的写法：先归一成 Headers，删掉任意大小写的 authorization，再写唯一一份。
 */
function newStyleHeaders(initHeaders, token) {
  const h = new Headers(initHeaders);
  h.delete("authorization");
  if (token) h.set("Authorization", `Bearer ${token}`);
  return h;
}

test("T-179-AH1 旧写法确实会产生双值 authorization（证明 bug 存在）", async () => {
  const { srv, port } = await startEchoServer();
  try {
    // 调用方（ccSessionToolService.authHeaders）用的就是小写
    const callerHeaders = { "content-type": "application/json", authorization: "Bearer OLD" };
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: oldStyleHeaders(callerHeaders, "NEW"),
      body: "{}",
    });
    const { auth } = await res.json();
    assert.match(
      String(auth),
      /,/,
      `★ 旧写法应当产生逗号拼接的双值头（若这条不再成立，说明 undici 行为变了，需要重新评估修法）：实际 ${auth}`,
    );
    assert.equal(auth, "Bearer OLD, Bearer NEW");
  } finally {
    srv.close();
  }
});

test("T-179-AH2 修好后只有单个 token，且是新的那个", async () => {
  const { srv, port } = await startEchoServer();
  try {
    const callerHeaders = { "content-type": "application/json", authorization: "Bearer OLD" };
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: newStyleHeaders(callerHeaders, "NEW"),
      body: "{}",
    });
    const { auth } = await res.json();
    assert.equal(auth, "Bearer NEW");
    assert.doesNotMatch(String(auth), /,/);
  } finally {
    srv.close();
  }
});

test("T-179-AH3 大小写任意组合的旧 authorization 都会被清掉", async () => {
  const { srv, port } = await startEchoServer();
  try {
    for (const key of ["authorization", "Authorization", "AUTHORIZATION"]) {
      const { srv: s2, port: p2 } = await startEchoServer();
      try {
        const res = await fetch(`http://127.0.0.1:${p2}/`, {
          method: "POST",
          headers: newStyleHeaders({ [key]: "Bearer STALE" }, "FRESH"),
          body: "{}",
        });
        const { auth } = await res.json();
        assert.equal(auth, "Bearer FRESH", `★ 旧 key=${key} 没有被清干净：${auth}`);
      } finally {
        s2.close();
      }
    }
  } finally {
    srv.close();
  }
});

test("T-179-AH4 token 为 null 时不写 Authorization（也不留调用方的脏值）", async () => {
  const { srv, port } = await startEchoServer();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: newStyleHeaders({ authorization: "Bearer STALE" }, null),
      body: "{}",
    });
    const { auth } = await res.json();
    assert.equal(auth, null, `★ token 为空时不该带 Authorization：实际 ${auth}`);
  } finally {
    srv.close();
  }
});

// ===========================================================================
// 源码层护栏：`authFetchInternal` 不许再用 spread 写 Authorization
// ===========================================================================

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const DEVICE_CLIENT = "electron/client-tools/deviceClient.ts";

/** 去掉注释，避免注释里的示例代码/文档文字干扰断言。 */
function stripCommentsLike(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

test("T-179-AH5 authFetchInternal 不再用 spread 写 Authorization", () => {
  const raw = readFileSync(join(REPO, DEVICE_CLIENT), "utf8");
  const code = stripCommentsLike(raw);
  const idx = code.indexOf("authFetchInternal");
  assert.ok(idx > 0, "抠不到 authFetchInternal");
  // 取到下一个方法边界为止（够覆盖整个方法体）
  const seg = code.slice(idx, idx + 1200);
  assert.doesNotMatch(
    seg,
    /\.\.\.\(token \? \{ Authorization:/,
    "★ authFetchInternal 不许再用 `...(token ? { Authorization: ... })` spread —— " +
      "调用方用小写 authorization，spread 会留下两个 key ⇒ undici 逗号拼接 ⇒ 恒 401",
  );
  assert.match(
    seg,
    /withBearer\(/,
    "★ authFetchInternal 必须走 withBearer()（先归一 Headers、删旧值、再写唯一一份）",
  );
});

test("T-179-AH6 withBearer 会删掉任意大小写的旧 authorization", () => {
  const raw = readFileSync(join(REPO, DEVICE_CLIENT), "utf8");
  const code = stripCommentsLike(raw);
  const idx = code.indexOf("function withBearer");
  assert.ok(idx > 0, "必须有 withBearer 辅助函数");
  const seg = code.slice(idx, idx + 600);
  assert.match(seg, /new Headers\(/, "必须先归一成 Headers（init.headers 可能是对象/Headers/元组）");
  assert.match(seg, /\.delete\(['"]authorization['"]\)/i, "必须删掉旧的 authorization（大小写不敏感）");
  assert.match(seg, /\.set\(['"]Authorization['"]/, "再写唯一一份 Authorization");
});
