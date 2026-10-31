// [RC 轮 · RC-13] `X-Client-Id` 全链路 —— 发起 / 续传 / attach 三条路
//
// ---------------------------------------------------------------------------
// 为什么要这个断言 (派工单 RC-13)
// ---------------------------------------------------------------------------
//   契约 L-28 / D3 规定三端的端标识取值 `web` / `pc` / `android`;
//   服务端 `readClientId` (unified-api `yinian.chat.routes.js:396`) 读 `x-client-id`
//   头, 取不到 ⇒ 回落 `'unknown'`。
//   ⇒ 2026-10-31 实测: **聊天流的三条路全都没带这个头** ⇒ 服务端日志里的
//     `clientId` 恒为 `unknown` ⇒ 跨端排查没有抓手。
//
//   本文件钉两件事:
//     · RC-W24 —— **三条路**的请求头都带 `X-Client-Id` (只带一条路 = 没修)
//     · RC-W25 —— 值是本端自己的 (`web` / `pc`), 不许写错
//
// ---------------------------------------------------------------------------
// 为什么断言分两层 (共享层 + 宿主层)
// ---------------------------------------------------------------------------
//   A 段 (共享层 `src/lib/sse/client-id.ts`) —— 行为断言:
//       「构造器对 start / resume / attach 三条路**恒**带头」+「值域正确」。
//   B 段 (宿主层) —— **接线**断言 + **行为**断言:
//       把宿主里那三处 `buildChatStreamHeaders({...})` 的**真实源码文本**抠出来,
//       在测试里**原样求值** ⇒ 拿到宿主真正会发出去的头对象 ⇒ 断言它带头。
//       (只做源码扫描的话, 「写了但没接上」会假绿 —— 这里不这么干。)
//
//   为什么被测对象是 .ts 而测试是 .mjs:
//     Node ESM 既不认 "@/lib/..." 别名, 也不做扩展名补全 ⇒ 直接 import 会
//     ERR_MODULE_NOT_FOUND。这里复用仓库已有的转译加载器
//     (scripts/lib/schedule-loader.mjs), 跟其余测试同一套手法。
//
//   运行: node --test test/sse-client-id.test.mjs   (完全离线: 不连网、不渲染 React)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { makeTmpDir, writeModule } from "../scripts/lib/schedule-loader.mjs";
import { stripComments } from "../scripts/lib/strip-comments.mjs";
import { extractFunction } from "../scripts/lib/source-scan.mjs";

// ---------------------------------------------------------------------------
// 本仓的身份 (web / PC 两份测试只有这个块不同)
// ---------------------------------------------------------------------------
const END = "pc"; // 本端的端标识值 (契约 D3)
const CLIENT_ID_CONST = "CLIENT_ID_PC"; // 宿主层应当传的常量名
const HOST_FILE = "src/lib/chat-stream.ts"; // 宿主层文件
const SEND_FN = "runStream"; // 发起 + 续传 (同一条 fetch)
const ATTACH_FN = "fetchAttach"; // 只读接入

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");
const repoCode = (p) => stripComments(repoSrc(p), p);

// ---------------------------------------------------------------------------
// 加载共享层 (零依赖 ⇒ 转译加载器即可)
//   chat-sse.ts 里的 `buildResumeHeaders` 也要真的加载 —— B5 段用它验证
//   「续传路带 Last-Event-ID」, 不能拿桩函数糊弄。
//   ⚠️ PC 的 `chat-sse.ts` 还 import `notifications-sse` / `rich-events`
//     (前者拖着 react / router / tanstack 一大串) ⇒ 这里给**桩**:
//     本测试只用到 `buildResumeHeaders` (纯函数), 帧解析器根本不会被调到。
// ---------------------------------------------------------------------------
const dir = makeTmpDir("verify-sse-client-id");
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
const C = await import(clientIdUrl);
const { buildResumeHeaders } = await import(
  writeModule(dir, "chat-sse", repoSrc("src/lib/chat-sse.ts"), {
    rewriteImports: [
      ["notifications-sse", "./notifications-sse.mjs"],
      ["rich-events", "./rich-events.mjs"],
    ],
  })
);

// ===========================================================================
// A. 共享层 —— 头名 / 取值域 / 三条路的构造 (RC-W24 / RC-W25)
// ===========================================================================

test("A1 端标识头名固定 (契约 L-28 / D3 / L-30)", () => {
  assert.equal(C.CLIENT_ID_HEADER, "X-Client-Id");
});

test("A2 端标识取值域 = web / pc / android (契约 L-28)", () => {
  assert.equal(C.CLIENT_ID_WEB, "web");
  assert.equal(C.CLIENT_ID_PC, "pc");
  assert.equal(C.CLIENT_ID_ANDROID, "android");
});

test("A3 ★ RC-W24 三条路 (发起 / 续传 / attach) 构造出的头**都**带 X-Client-Id", () => {
  for (const path of ["start", "resume", "attach"]) {
    const headers = C.buildChatStreamHeaders({
      path,
      clientId: C.CLIENT_ID_WEB,
      authorization: "tok",
      accept: "text/event-stream",
      resumeHeaders:
        path === "start" ? null : { "Last-Event-ID": "42" },
    });
    assert.equal(
      headers["X-Client-Id"],
      "web",
      `${path} 路没带 X-Client-Id (服务端日志里的 clientId 会是 unknown)`,
    );
  }
});

test("A4 ★ RC-W25 头里的值 = 传进来的端标识 (两端各写各的, 不许串)", () => {
  assert.equal(
    C.buildChatStreamHeaders({ path: "start", clientId: C.CLIENT_ID_WEB })["X-Client-Id"],
    "web",
  );
  assert.equal(
    C.buildChatStreamHeaders({ path: "start", clientId: C.CLIENT_ID_PC })["X-Client-Id"],
    "pc",
  );
  assert.equal(
    C.buildChatStreamHeaders({ path: "start", clientId: C.CLIENT_ID_ANDROID })["X-Client-Id"],
    "android",
  );
});

test("A5 只有「发起」路带 Content-Type (契约 L-36: 续传/attach 的 body 必须留空)", () => {
  const start = C.buildChatStreamHeaders({ path: "start", clientId: C.CLIENT_ID_WEB });
  assert.equal(start["Content-Type"], "application/json");
  for (const path of ["resume", "attach"]) {
    const h = C.buildChatStreamHeaders({ path, clientId: C.CLIENT_ID_WEB });
    assert.equal(
      h["Content-Type"],
      undefined,
      `${path} 路带了 Content-Type ⇒ 服务端可能把它当成新轮次 (双 LLM)`,
    );
  }
});

test("A6 续传头 (Last-Event-ID / X-Resume-Turn) 被合并进同一份头", () => {
  const h = C.buildChatStreamHeaders({
    path: "resume",
    clientId: C.CLIENT_ID_WEB,
    resumeHeaders: { "Last-Event-ID": "42" },
  });
  assert.equal(h["Last-Event-ID"], "42");
  assert.equal(h["X-Client-Id"], "web");
});

// ===========================================================================
// B. 宿主层 —— 三条路真的接到了共享构造器 (RC-W24) 且值正确 (RC-W25)
// ------------------------------------------------------------------------==

/**
 * extractHeaderCalls —— 抠出源码里所有 `buildChatStreamHeaders({...})` 调用。
 *
 * 返回每处的:
 *   · pathLiterals —— `path` 属性里出现的**全部**字符串字面量
 *     (宿主层写的是 `isResume ? "resume" : "start"` 这种条件式 ⇒ 两个字面量都要看见)
 *   · clientIdText —— `clientId` 属性的源码文本 (断言它必须是本端的常量)
 *   · argText —— **整个实参对象的源码文本** (B4 段用它原样求值 ⇒ 拿到真实头对象)
 */
function extractHeaderCalls(src, fileName) {
  const isTsx = fileName.endsWith(".tsx");
  const sf = ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.ES2022,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out = [];
  const literals = (node) => {
    const acc = [];
    const visit = (n) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) acc.push(n.text);
      ts.forEachChild(n, visit);
    };
    visit(node);
    return acc;
  };
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "buildChatStreamHeaders"
    ) {
      const rec = { pathLiterals: [], clientIdText: null, argText: null };
      const arg = node.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        rec.argText = arg.getText(sf);
        for (const p of arg.properties) {
          if (!ts.isPropertyAssignment(p) || !p.name) continue;
          const name = p.name.getText(sf).replace(/["']/g, "");
          if (name === "path") rec.pathLiterals = literals(p.initializer);
          if (name === "clientId") rec.clientIdText = p.initializer.getText(sf);
        }
      }
      out.push(rec);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return out;
}

/** 在测试里**原样求值**宿主写的那段实参源码 ⇒ 拿到宿主真正传给共享构造器的入参。 */
function evalOptions(argText, scope) {
  const names = Object.keys(scope);
  const fn = new Function(...names, `return (${argText});`);
  return fn(...names.map((n) => scope[n]));
}

/** 宿主会真正发出去的那份头 (入参求值 + 走真的共享构造器)。 */
function hostHeaders(call, scope) {
  return C.buildChatStreamHeaders(evalOptions(call.argText, scope));
}

const hostCode = repoCode(HOST_FILE);
const sendFn = extractFunction(hostCode, SEND_FN, HOST_FILE);
const attachFn = extractFunction(hostCode, ATTACH_FN, HOST_FILE);

test("B0 宿主层能抠出发起/续传 与 attach 两处 (抠不到 ⇒ 下面的断言都是假绿)", () => {
  assert.ok(sendFn, `抠不到 ${SEND_FN} (${HOST_FILE})`);
  assert.ok(attachFn, `抠不到 ${ATTACH_FN} (${HOST_FILE})`);
});

test("B1 ★ RC-W24 发起 / 续传 / attach 三条路都接到了共享构造器", () => {
  const sendCalls = extractHeaderCalls(sendFn, HOST_FILE);
  const attachCalls = extractHeaderCalls(attachFn, HOST_FILE);
  assert.ok(sendCalls.length > 0, `${SEND_FN} 里没有 buildChatStreamHeaders 调用`);
  assert.ok(attachCalls.length > 0, `${ATTACH_FN} 里没有 buildChatStreamHeaders 调用`);

  // 发起 + 续传 走同一处 (由 isResume 分流) ⇒ 这一处必须同时提到 start 与 resume
  const sendPaths = new Set(sendCalls.flatMap((c) => c.pathLiterals));
  assert.ok(sendPaths.has("start"), "发起路没接进共享构造器");
  assert.ok(sendPaths.has("resume"), "续传路没接进共享构造器");
  // attach 是独立的一处
  const attachPaths = new Set(attachCalls.flatMap((c) => c.pathLiterals));
  assert.ok(attachPaths.has("attach"), "attach 路没接进共享构造器");
});

test("B2 ★ RC-W25 宿主传的端标识常量是本端自己的 (web / pc 不许串)", () => {
  const calls = [
    ...extractHeaderCalls(sendFn, HOST_FILE),
    ...extractHeaderCalls(attachFn, HOST_FILE),
  ];
  assert.ok(
    calls.length >= 2,
    `宿主层根本没调共享构造器 (calls=${calls.length}) ⇒ 下面的断言会假绿`,
  );
  for (const c of calls) {
    assert.equal(
      c.clientIdText,
      CLIENT_ID_CONST,
      `有一处传的端标识不是 ${CLIENT_ID_CONST} (值写错 ⇒ 服务端记成别的端)`,
    );
  }
});

test("B3 ★ RC-W24 宿主三处真实求值出来的头**都**带 X-Client-Id", () => {
  const scope = {
    isResume: false,
    jwt: "tok",
    accessToken: "tok",
    opts: { resume: { cursor: "42" }, cursor: "42" },
    CLIENT_ID_WEB: C.CLIENT_ID_WEB,
    CLIENT_ID_PC: C.CLIENT_ID_PC,
    buildResumeHeaders,
  };
  const calls = [
    ...extractHeaderCalls(sendFn, HOST_FILE),
    ...extractHeaderCalls(attachFn, HOST_FILE),
  ];
  assert.ok(calls.length >= 2, "至少要有发起/续传 与 attach 两处");
  for (const c of calls) {
    const headers = hostHeaders(c, scope);
    assert.equal(
      headers["X-Client-Id"],
      END,
      `有一处构造出来的头里没有 X-Client-Id: ${END} (实际: ${JSON.stringify(headers)})`,
    );
  }
});

test("B4 ★ RC-W25 求值出来的头里的值就是本端标识 (web / pc)", () => {
  const scope = {
    isResume: false,
    jwt: "tok",
    accessToken: "tok",
    opts: { resume: { cursor: "42" }, cursor: "42" },
    CLIENT_ID_WEB: C.CLIENT_ID_WEB,
    CLIENT_ID_PC: C.CLIENT_ID_PC,
    buildResumeHeaders,
  };
  const calls = [
    ...extractHeaderCalls(sendFn, HOST_FILE),
    ...extractHeaderCalls(attachFn, HOST_FILE),
  ];
  assert.ok(
    calls.length >= 2,
    `宿主层根本没调共享构造器 (calls=${calls.length}) ⇒ 下面的断言会假绿`,
  );
  for (const c of calls) {
    const headers = hostHeaders(c, scope);
    assert.equal(headers["X-Client-Id"], END);
  }
});

test("B5 续传路的头带 Last-Event-ID (L-35) 且**不带** Content-Type (L-36)", () => {
  const scope = {
    isResume: true,
    jwt: "tok",
    accessToken: "tok",
    opts: { resume: { cursor: "42" }, cursor: "42" },
    CLIENT_ID_WEB: C.CLIENT_ID_WEB,
    CLIENT_ID_PC: C.CLIENT_ID_PC,
    buildResumeHeaders,
  };
  const calls = extractHeaderCalls(sendFn, HOST_FILE);
  const resumeCall = calls.find((c) => c.pathLiterals.includes("resume"));
  assert.ok(resumeCall, "抠不到续传那处调用");
  const headers = hostHeaders(resumeCall, scope);
  assert.equal(headers["Last-Event-ID"], "42");
  assert.equal(headers["Content-Type"], undefined);
  assert.equal(headers["X-Client-Id"], END);
});
