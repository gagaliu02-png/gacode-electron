// [契约订正 17 · 2026-10-30] 轮次身份 —— 从 SSE **响应头**取 (`X-Turn-Key`)
//
// 覆盖的是「服务端建轮那一刻就把身份写进响应头」这条路径:
//
//   · 服务端**在模型出字之前不发任何数据帧** (TTFT 3~20s)
//     ⇒ 客户端若在这段窗口里被杀, 它「知道有这一轮」却「不知道这一轮是谁」
//     ⇒ 回来时历史里那条服务端行带 `metadata.turnKey`, 本地那行没有
//     ⇒ 认不出亲 ⇒ 屏幕上两个气泡 (空气泡) + 本地那行永远收不到结尾
//     ⇒ 红色停止键永久顶亮。
//
//   ⇒ 身份必须在**第一个数据帧之前**到客户端手里 —— 响应头就是那条通道。
//
//   ⚠️ PC 是**跨源** renderer ⇒ 浏览器只放行「被 expose 的」响应头
//     ⇒ 服务端必须带 `Access-Control-Expose-Headers: X-Turn-Key`。
//
//   运行: npm test   (完全离线: 不连网)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { makeTmpDir, writeModule } from "../scripts/lib/schedule-loader.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");

// ===========================================================================
// A. 判据 —— 只有一条: 头在、且非空 ⇒ 就是它; 否则 ⇒ null
// ===========================================================================

// 本文件零依赖 (不 import window / fetch / js-cookie) ⇒ 走仓库既有的转译加载器即可。
const dir = makeTmpDir("verify-turn-key-header");
const url = writeModule(dir, "turn-key-header", repoSrc("src/lib/sse/turn-key-header.ts"));
const { readTurnKeyHeader, TURN_KEY_HEADER } = await import(url);

const headersOf = (obj) => ({
  get: (name) => (name in obj ? obj[name] : null),
});

test("A1 头名固定小写 x-turn-key (全端一个字符串, 不许各写各的)", () => {
  assert.equal(TURN_KEY_HEADER, "x-turn-key");
});

test("A2 头在且非空 ⇒ 原样返回", () => {
  assert.equal(
    readTurnKeyHeader(headersOf({ "x-turn-key": "tk_3636a9be681866e95d9619ff" })),
    "tk_3636a9be681866e95d9619ff",
  );
});

test("A3 头不在 (老服务端) ⇒ null ⇒ 端侧回落「帧顶层 turnKey」, 行为不变", () => {
  assert.equal(readTurnKeyHeader(headersOf({})), null);
  assert.equal(readTurnKeyHeader(headersOf({ "content-type": "text/event-stream" })), null);
});

test("A4 空串 / 纯空白 ⇒ null (不许把空身份钉到本地行上)", () => {
  assert.equal(readTurnKeyHeader(headersOf({ "x-turn-key": "" })), null);
  assert.equal(readTurnKeyHeader(headersOf({ "x-turn-key": "   " })), null);
});

test("A5 首尾空白 ⇒ 只去空白, 内容一字不改", () => {
  assert.equal(readTurnKeyHeader(headersOf({ "x-turn-key": "  tk_abc  " })), "tk_abc");
});

test("A6 不校验 tk_ 前缀 (前缀是服务端的约定, 端上拿到什么用什么)", () => {
  assert.equal(readTurnKeyHeader(headersOf({ "x-turn-key": "turn_999" })), "turn_999");
});

test("A7 头对象异常 (null / undefined / get 抛异常) ⇒ null, 不许把整条流搞崩", () => {
  assert.equal(readTurnKeyHeader(null), null);
  assert.equal(readTurnKeyHeader(undefined), null);
  assert.equal(readTurnKeyHeader({}), null);
  assert.equal(
    readTurnKeyHeader({
      get() {
        throw new Error("boom");
      },
    }),
    null,
  );
});

// ===========================================================================
// B. 接线 —— 判据真的接上了吗 (源码级断言)
// ===========================================================================

test("B1 chat-stream.ts 真的用 readTurnKeyHeader 取响应头 (发起流 + attach 两条路)", () => {
  const s = repoSrc("src/lib/chat-stream.ts");
  assert.ok(
    s.includes('import { readTurnKeyHeader } from "./sse/turn-key-header";'),
    "chat-stream.ts 必须 import 那份唯一判据",
  );
  assert.equal(
    (s.match(/readTurnKeyHeader\(res\.headers\)/g) || []).length,
    2,
    "发起流与 attach **两条路**都要读响应头 (attach 的无游标续传尤其需要)",
  );
  assert.ok(
    !s.includes('res.headers.get("x-turn-key")'),
    "⛔ 不许在 chat-stream.ts 里另写一份裸的 headers.get —— 判据只留一份",
  );
});

test("B2 ChatDetail 把 onTurnKey 接到「本轮流式行的 turnKey」上", () => {
  const page = repoSrc("src/routes/ChatDetail.tsx");
  assert.ok(page.includes("onTurnKey:"), "ChatDetail 必须接 onTurnKey");
  assert.ok(
    page.includes("streamingTurnKeyRef.current = tk;"),
    "onTurnKey 必须把身份写进本轮的 ref (⇒ 合并判据立刻生效)",
  );
});

test("B3 跨源前提 —— PC 端必须带 Access-Control-Expose-Headers 才能读到响应头", () => {
  // 这条断言钉的是**服务端**的要求; PC 端自己改不了 ⇒ 只提醒, 不失败。
  // (真正落地由 unified-api 的 fastify-cors `exposedHeaders` 保证。)
  const s = repoSrc("src/lib/chat-stream.ts");
  assert.ok(
    s.includes("x-turn-key") || s.includes("readTurnKeyHeader"),
    "PC 必须从响应头取身份 (跨源 ⇒ 依赖服务端的 Expose-Headers)",
  );
});
