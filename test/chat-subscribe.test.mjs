// [订正 32] 会话级「一条流」常驻订阅 —— PC 端 (chat-subscribe.ts + sendNoStream)
//
// ---------------------------------------------------------------------------
// 钉什么 (契约订正 32 §3.1 / §3.3 / §4 / §5.4)
// ---------------------------------------------------------------------------
//   · **S1** 常驻订阅走 **GET** `/yinian/sessions/:id/chat/subscribe` —— 跨轮收帧。
//   · **S2** 有合法游标 ⇒ 带 `Last-Event-ID: <seq>`；无/非法游标 ⇒ 一个都不带
//           （⛔ 绝不带 `X-Resume-Turn` —— 那是「接回在跑轮次」，订阅无游标 = 只 live）。
//   · **S3** `subscribed` 控制帧 ⇒ 触发 onOpen，但**不喂渲染层**（控制帧没内容）。
//   · **S4** `sendNoStream`（发消息建轮不建流）⇒ POST /chat/stream + `X-Stream-Mode: none`；
//           有图片/附件/知识库时 body 照带；返回 JSON `{ ok, turnKey }`。
//   · **S5** 服务端老版本（subscribe 404/409）⇒ 端侧**降级**：onError + 不重连
//           （调用方回落 attach / turn_started 老路径）。
//   · **S6** 断线重连：EOF 后记最新游标，退避重连时**带回去**（补缺口）。
//   · **S7** 老路径（start / attach / X-Client-Id 三条路）**不受影响**——不删，测试仍绿。
//
// ⛔ 不连网、不渲染 React —— chat-subscribe.ts 的 `start` 里 fetch 由测试桩接管。
// ⛔ 游标非法值绝不外发（L-33 同款）。
//
// 运行: node --test test/chat-subscribe.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { makeTmpDir, writeModule } from "../scripts/lib/schedule-loader.mjs";
import { stripComments } from "../scripts/lib/strip-comments.mjs";
import { extractFunction } from "../scripts/lib/source-scan.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");

const SUBSCRIBE_FILE = "src/lib/chat-subscribe.ts";
const STREAM_FILE = "src/lib/chat-stream.ts";

// ---------------------------------------------------------------------------
// 加载 共享层 + 常驻订阅实现 (转译器 + 桩)
// ---------------------------------------------------------------------------
const dir = makeTmpDir("verify-chat-subscribe");

// 桩：chat-subscribe.ts 的依赖链 —— 只留纯函数与解析器
writeModule(
  dir,
  "turn-key-header",
  `export const TURN_EPOCH_HEADER = "X-Turn-Epoch";`,
);
writeModule(
  dir,
  "notifications-sse",
  `export class SseFrameParser { push() { return []; } flush() { return null; } }`,
);
writeModule(
  dir,
  "rich-events",
  `export function normalizeRichEvent(e) { return { event: e }; }
export function normalizeRichEvents(es) { return { events: es, skipped: [] }; }`,
);
const clientIdUrl = writeModule(dir, "client-id", repoSrc("src/lib/sse/client-id.ts"));
const CI = await import(clientIdUrl);

const chatSseUrl = writeModule(dir, "chat-sse", repoSrc("src/lib/chat-sse.ts"), {
  rewriteImports: [
    ["notifications-sse", "./notifications-sse.mjs"],
    ["rich-events", "./rich-events.mjs"],
    ["sse/turn-key-header", "./turn-key-header.mjs"],
  ],
});
const SS = await import(chatSseUrl);

const chatStreamCode = stripComments(repoSrc(STREAM_FILE), STREAM_FILE);
const streamFile = writeModule(dir, "chat-stream", chatStreamCode, {
  rewriteImports: [
    ["./chat-sse", "./chat-sse.mjs"],
    ["./notifications-sse", "./notifications-sse.mjs"],
    ["./rich-events", "./rich-events.mjs"],
    ["./sse/client-id", "./client-id.mjs"],
    ["./sse/turn-key-header", "./turn-key-header.mjs"],
    ["./sse/terminal", "./terminal.mjs"],
    ["./sse/concurrent", "./concurrent.mjs"],
    ["./sse-reconnect", "./sse-reconnect.mjs"],
    ["./client-capabilities", "./client-capabilities.mjs"],
  ],
});
// 桩掉 chat-stream.ts 的下游 (cancel / auth-refresh / turn-key …) —— 测试只用
// 它的 `sendNoStream` 构造逻辑 → 但我们只做**源码扫描断言**, 不真 import (依赖太重)。
// 上面 import 是为了共享层；sendNoStream 的行为断言走「源码抠出来求值」。
const {
  buildChatStreamHeaders,
} = CI;
const code = {
  subscribe: stripComments(repoSrc(SUBSCRIBE_FILE), SUBSCRIBE_FILE),
  stream: chatStreamCode,
};

// ---------------------------------------------------------------------------
// S1 / S2 · 常驻订阅的请求形状 (源码级 —— 不真 import react hook)
// ---------------------------------------------------------------------------
test("S1 常驻订阅走 GET /yinian/sessions/:id/chat/subscribe", () => {
  assert.match(code.subscribe, /SUBSCRIBE_PATH\s*=\s*\(id:\s*string\)\s*=>\s*`\/yinian\/sessions\/\$\{id\}\/chat\/subscribe`/, "必须打到 subscribe 端点");
  assert.match(code.subscribe, /method:\s*"GET"/, "订阅是 GET (服务端是常驻 SSE GET)");
});

test("S2 合法游标 ⇒ Only Last-Event-ID；无/非法游标 ⇒ 一个都不带", () => {
  assert.match(code.subscribe, /if\s*\(\s*resumeCursor\s*\)\s*base\["Last-Event-ID"\]\s*=\s*resumeCursor;/, "有游标才带 Last-Event-ID");
  assert.match(code.subscribe, /isValidEventCursor\(opts\.cursor\)/, "游标合法判定必须复用 L-33 判据 (非法绝不上路)");
  assert.ok(!/X-Resume-Turn/.test(code.subscribe), "⛔ 订阅绝不带 X-Resume-Turn (那是接回在跑轮次, 订阅无游标=只 live)");
  // 游标是**循环变量** —— 重连用最新值 (闭包捕获的 opts 不会更新 ⇒ 必须本地持有)
  assert.match(code.subscribe, /let cursor: string \| null = isValidEventCursor\(opts\.cursor\)/, "游标存本地, 重连时用最新值");
});

test("S3 subscribed 控制帧 ⇒ onOpen, 不进渲染层", () => {
  assert.match(code.subscribe, /"subscribed"/, "必须认 subscribed 帧");
  assert.match(code.subscribe, /opts\.onOpen\?\.\(\)/, "subscribed 触发 onOpen");
  // ⚠️ stripComments 抹掉了注释 ⇒ 直接检查「isSubscribed → return → onChunk」这段结构。
  const subBlock = code.subscribe.slice(
    code.subscribe.indexOf("const isSubscribed"),
    code.subscribe.indexOf("opts.onChunk(normalizeChatChunk"),
  );
  assert.match(subBlock, /return;/, "subscribed 帧必须 return (不上屏)");
  assert.ok(
    subBlock.indexOf("return;") < subBlock.length,
    "return 必须在 onChunk 之前 (控制帧不喂渲染层)",
  );
});

test("S4 老服务端 (404/409) ⇒ 降级 onError + 不重连", () => {
  assert.match(code.subscribe, /res\.status === 404 \|\| res\.status === 409/, "认 404/409");
  assert.match(code.subscribe, /回落老路径/, "onError 带降级文案 (调用方回落 attach/turn_started)");
  // 404/409 分支里没有 `continue` / `attempt += 1` ⇒ 不重连
  const degradeBlock = code.subscribe.slice(
    code.subscribe.indexOf("if (res.status === 404 || res.status === 409)"),
    code.subscribe.indexOf("if (!res.ok"),
  );
  assert.ok(!degradeBlock.includes("continue"), "404/409 不许重连 (重连也 404)");
  assert.ok(!degradeBlock.includes("attempt += 1"), "404/409 不许累加重连次数");
});

test("S5 EOF 后带最新游标退避重连 (补缺口)", () => {
  assert.match(code.subscribe, /if \(ac\.signal\.aborted\) return;/, "用户退出不重连");
  assert.match(code.subscribe, /1000 \* 2 \*\* attempt/, "退避存在");
  // 游标是循环变量 ⇒ 每次 fetchSubscribe 都传它 ⇒ 重连天然带最新值。
  // ★ [2026-11-18 · T-039] 401 处理改成统一 helper（`fetchWithAuthRetry`）⇒
  //   第一次就带当前 token（不再 `fetchSubscribe(null, cursor)`），重发由 helper 内部做。
  assert.match(code.subscribe, /fetchWithAuthRetry\(\(t\) => fetchSubscribe\(t, cursor\)/,
    "首次请求就走带 token 的统一 helper（401 续期由 helper 负责）");
  assert.match(code.subscribe, /AuthExpiredError/, "登录过期要单独处理（停掉重连）");
  assert.match(code.subscribe, /cursor = c;/, "onCursor 推进本地游标");
  assert.match(code.subscribe, /if \(readResult\.cursor\) cursor = readResult\.cursor;/, "EOF 后落最终游标");
});

// ---------------------------------------------------------------------------
// S6 / S7 · sendNoStream —— 建轮不建流 (chat-stream.ts)
// ---------------------------------------------------------------------------
test("S6 sendNoStream 带 X-Stream-Mode: none (建轮跑轮但不另开 SSE)", () => {
  const sendFn = extractFunction(code.stream, "sendNoStream", STREAM_FILE);
  assert.ok(sendFn, "抠不到 sendNoStream (chat-stream.ts)");
  assert.match(sendFn, /X-Stream-Mode/, "必须带 X-Stream-Mode 头");
  assert.match(sendFn, /"none"/, "值必须是 none");
  // 发的是 JSON, 读回来 { ok, turnKey }
  assert.match(sendFn, /path: "start"/, "走发起路的头构造 (带 Content-Type)");
  assert.match(sendFn, /turnKey/, "应答里读 turnKey");
});

test("S7 useChatStream handle 把 sendNoStream 挂出去 (宿主接得到)", () => {
  assert.match(code.stream, /sendNoStream/, "handle 里必须有 sendNoStream");
  assert.match(code.stream, /start, attach, sendNoStream, abort/, "handle 组合了 sendNoStream");
});

// ---------------------------------------------------------------------------
// S8 · 老路径不受影响 (回归锚点)
// ---------------------------------------------------------------------------
test("S8 老路径 (start / attach / 头构造) 仍在, 没被删", () => {
  assert.match(chatStreamCode, /const start = useCallback/, "start 还在");
  assert.match(chatStreamCode, /const attach = useCallback/, "attach 还在");
  for (const path of ["start", "resume", "attach"]) {
    const h = buildChatStreamHeaders({ path, clientId: CI.CLIENT_ID_PC });
    assert.equal(h["X-Client-Id"], "pc", `${path} 路 X-Client-Id 还在`);
  }
});

// ---------------------------------------------------------------------------
// S9 · ChatDetail 没被破坏 (它没 import subscribe —— 改造是纯增量, 由开关接)
// ---------------------------------------------------------------------------
test("S9 chat-subscribe 是纯新文件 (老文件不被它改坏)", () => {
  // 常驻订阅不该碰老文件里那些契约常量
  assert.ok(!code.subscribe.includes("STREAM_PATH"), "订阅文件不该引用发起流路径");
  assert.ok(!code.subscribe.includes("ATTACH_PATH"), "订阅文件不该引用 attach 路径");
});
