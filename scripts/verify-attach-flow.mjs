#!/usr/bin/env node
/**
 * verify-attach-flow.mjs
 *
 * 任务书 04 · 进场流程 + 接回 (契约 §9 / §10 / §14.5 P4)
 *
 *   · **统一进场序列 (契约 L-57)**
 *       ① GET  /yinian/sessions/:id/stream-state —— 问「这会话现在有没有在跑的轮次」
 *       ② running === true ⇒ POST /yinian/sessions/:id/chat/attach (只读接入)
 *       ③ running === false ⇒ 走历史接口
 *   · **attach 不建轮次 (契约 L-46 / L-48)** —— POST 且 **body 留空**。
 *   · **attach 续传头 (契约 L-47)** —— `Last-Event-ID` / `X-Resume-Turn: 1`。
 *   · **端标识 (契约 D3 / L-30)** —— `X-Client-Id: pc`。
 *   · **控制帧 (契约 L-50 / D2)** —— 首帧 `attach_ok` / `attach_failed` 走 onControl,
 *     **不当成数据帧**; `attach_failed` ⇒ 静默回落历史补拉, 不报错。
 *   · **abort 真的中止 (契约 §14.5 P4 / 任务书 P-5)** —— 流状态必须挂在 ref 上,
 *     否则组件一重渲染就丢 ⇒ 「停止」按钮点了跟没点一样。
 *   · **中止不得掐全体 (契约 L-53)** —— 中止只读接入流**不得**掐服务端那一轮
 *     (不发 USER_STOP); 离场也**不得**删掉跟进记录 (游标要留着续传)。
 *
 * 断言方式:
 *   - **运行时**: 用一个 hook 桩 (react stub) 把 `useChatStream` 跑起来, 配一个
 *     fetch 桩, 逐条看**真的发出去的请求长什么样**、abort 之后**信号是不是真的
 *     被 abort 了**。
 *   - **结构性**: 进场序列打在 ChatDetail.tsx 的 AST 上 (去注释后)。
 *
 * 退出码: 0 = 通过 / 1 = 有断言失败。
 *
 * 用法: node scripts/verify-attach-flow.mjs  (必须在仓库根跑)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { makeTmpDir, writeModule } from "./lib/schedule-loader.mjs";
import { stripComments } from "./lib/strip-comments.mjs";
import { extractDecl, extractFunction, extractIfBranch } from "./lib/source-scan.mjs";

let fail = 0;
let passCount = 0;
const pass = (m) => {
  passCount++;
  console.log(`  ✅ ${m}`);
};
const miss = (m) => {
  fail++;
  console.log(`  ❌ ${m}`);
};
const log = (...a) => console.log(...a);
const repoSrc = (p) => readFileSync(join(process.cwd(), p), "utf8");
const repoCode = (p) => stripComments(repoSrc(p), p);

// ===========================================================================
// 运行时加载: src/lib/sse.ts (hook) —— 用 react 桩 + fetch 桩跑真代码
// ===========================================================================
const dir = makeTmpDir("verify-attach-flow");

// react 桩 —— 模拟 React 的 hook 槽位语义:
//   · useRef 的槽位**跨渲染持久** (这正是「流状态挂 ref」的意义所在);
//   · 每次渲染重置槽位游标, 保证 hook 调用顺序对齐。
//   ⇒ 旧写法 (函数级 `let active = null`) 在这个桩里**必然**丢流 ——
//     断言因此是真的在盯「状态挂没挂 ref」, 不是在盯文本。
const REACT_STUB = `
let slots = [];
let idx = 0;
export function __render(fn) { idx = 0; return fn(); }
export function __resetSlots() { slots = []; }
export function useRef(initial) {
  const i = idx++;
  if (!Object.prototype.hasOwnProperty.call(slots, i)) slots[i] = { current: initial };
  return slots[i];
}
export function useCallback(fn) { idx++; return fn; }
export function useMemo(fn) { idx++; return fn(); }
`;
writeModule(dir, "react-stub", REACT_STUB);
const reactStubUrl = writeModule(dir, "react-stub", REACT_STUB);

// notifications-sse 桩 —— 只抠纯逻辑那两块 (增量帧解析器 + 单帧解析)。
{
  const nsSrc = repoSrc("src/lib/notifications-sse.ts");
  const parserDecl = extractDecl(nsSrc, "SseFrameParser", "src/lib/notifications-sse.ts");
  const parseFn = extractFunction(nsSrc, "parseSseFrame", "src/lib/notifications-sse.ts");
  if (!parserDecl || !parseFn) {
    console.log("❌ 抠不出 SseFrameParser / parseSseFrame —— notifications-sse.ts 结构变了?");
    process.exit(1);
  }
  writeModule(dir, "notifications-sse", `${parserDecl}\n\n${parseFn}\n`);
}
writeModule(dir, "rich-events", repoSrc("src/lib/rich-events.ts"));
writeModule(dir, "chat-sse", repoSrc("src/lib/chat-sse.ts"), {
  rewriteImports: [
    ["./notifications-sse", "./notifications-sse.mjs"],
    ["./rich-events", "./rich-events.mjs"],
  ],
});
writeModule(dir, "cancel", repoSrc("src/lib/cancel.ts"), {
  rewriteImports: [["./rich-events", "./rich-events.mjs"]],
});
writeModule(dir, "auth-refresh", repoSrc("src/lib/auth-refresh.ts"));
writeModule(dir, "sse-reconnect", repoSrc("src/lib/sse-reconnect.ts"));
const sseUrl = writeModule(dir, "sse", repoSrc("src/lib/sse.ts"), {
  rewriteImports: [
    ["react", "./react-stub.mjs"],
    ["./cancel", "./cancel.mjs"],
    ["./auth-refresh", "./auth-refresh.mjs"],
    ["./chat-sse", "./chat-sse.mjs"],
    ["./sse-reconnect", "./sse-reconnect.mjs"],
  ],
});
const { useChatStream } = await import(sseUrl);
const ReactStub = await import(reactStubUrl);

// ---------------------------------------------------------------------------
// fetch 桩 —— 记录每一次请求 (方法 / 头 / body / signal), 按计划返回响应。
// ---------------------------------------------------------------------------
const enc = new TextEncoder();
const fetchCalls = [];
/** 队列元素: (call) => Response | Error。队列空 ⇒ 默认响应。 */
let fetchPlan = [];

function makeStream(texts, { errorAtEnd = false, hang = false, signal = null } = {}) {
  // ⚠️ 必须用 `pull` + `highWaterMark: 0`:
  //   · `controller.error()` 会**丢弃已入队的块** —— 用 `start` 一次性入队再报错的话,
  //     那一帧根本没送到读者手里 (游标也就没推进)。
  //   · hwm=0 ⇒ 一次只在读者真的要数据时才拉, 不会提前把下一帧 error 掉。
  let i = 0;
  return new ReadableStream(
    {
      pull(controller) {
        if (i < texts.length) {
          controller.enqueue(enc.encode(texts[i++]));
          return;
        }
        if (errorAtEnd) {
          try {
            controller.error(new Error("stream error"));
          } catch {
            /* ignore */
          }
          return;
        }
        if (hang) {
          if (signal && !signal.aborted) {
            signal.addEventListener(
              "abort",
              () => {
                try {
                  controller.error(new Error("aborted"));
                } catch {
                  /* ignore */
                }
              },
              { once: true },
            );
          }
          return; // 一直挂着, 直到被 abort
        }
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      },
    },
    { highWaterMark: 0 },
  );
}
const okRes = (body) => ({
  ok: true,
  status: 200,
  statusText: "OK",
  body,
  json: async () => ({}),
});

globalThis.fetch = async (url, init = {}) => {
  const call = {
    url: String(url),
    method: init.method || "GET",
    headers: init.headers || {},
    body: init.body,
    signal: init.signal,
  };
  fetchCalls.push(call);
  const plan = fetchPlan.shift();
  const out = plan ? plan(call) : okRes(makeStream([]));
  if (out instanceof Error) throw out;
  return out;
};

const tick = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};
const resetFetch = () => {
  fetchCalls.length = 0;
  fetchPlan = [];
};

// ===========================================================================
// A. attach 请求形态 (契约 L-46 / L-47 / L-48 / D3 / L-30)
// ===========================================================================

log("A. attach 请求形态 (L-46 / L-47 / L-48 / D3)");

{
  ReactStub.__resetSlots();
  resetFetch();
  fetchPlan.push(() =>
    okRes(
      makeStream([
        'data: {"type":"attach_ok","turnKey":"tk_1","resumedFrom":null,"replayed":0,"reason":null}\n\n',
      ]),
    ),
  );
  const handle = ReactStub.__render(() => useChatStream());
  const controls = [];
  const chunks = [];
  await handle.attach({
    sessionId: "sess-1",
    cursor: null,
    onChunk: (c) => chunks.push(c),
    onControl: (f) => controls.push(f),
  });

  const call = fetchCalls[0];
  call && call.method === "POST" && call.url.includes("/chat/attach")
    ? pass("★ attach 走 POST /sessions/:id/chat/attach")
    : miss(`attach 端点不对: ${call ? `${call.method} ${call.url}` : "(没发请求)"}`);

  call && call.body === undefined
    ? pass("★ attach body 留空 (attach 不建轮次, 契约 L-46 / L-48)")
    : miss(`attach 带了 body: ${JSON.stringify(call?.body)}`);

  call && call.headers["X-Resume-Turn"] === "1" && call.headers["Last-Event-ID"] === undefined
    ? pass("无游标 ⇒ attach 带 X-Resume-Turn: 1 (契约 L-35 / L-47)")
    : miss(`attach 的续传头不对: ${JSON.stringify(call?.headers)}`);

  call && call.headers["X-Client-Id"] === "pc"
    ? pass("★ attach 带端标识 X-Client-Id: pc (契约 D3 / L-30)")
    : miss("attach 没带 X-Client-Id");

  controls.length === 1 && controls[0].type === "attach_ok" && chunks.length === 0
    ? pass("★ 首帧 attach_ok 走 onControl, 不当数据帧 (契约 L-50 / D2)")
    : miss(`控制帧分流不对: controls=${JSON.stringify(controls)} chunks=${chunks.length}`);
}

{
  ReactStub.__resetSlots();
  resetFetch();
  fetchPlan.push(() => okRes(makeStream([])));
  const handle = ReactStub.__render(() => useChatStream());
  await handle.attach({
    sessionId: "sess-2",
    cursor: "42",
    onChunk: () => {},
    onControl: () => {},
  });
  const call = fetchCalls[0];
  call && call.headers["Last-Event-ID"] === "42" && call.headers["X-Resume-Turn"] === undefined
    ? pass("有游标 ⇒ attach 带 Last-Event-ID: 42")
    : miss(`有游标时的续传头不对: ${JSON.stringify(call?.headers)}`);
}

// ===========================================================================
// B. attach_failed ⇒ 静默回落 (契约 L-50)
// ===========================================================================

{
  ReactStub.__resetSlots();
  resetFetch();
  fetchPlan.push(() =>
    okRes(makeStream(['data: {"type":"attach_failed","reason":"no_active_stream"}\n\n'])),
  );
  const handle = ReactStub.__render(() => useChatStream());
  const controls = [];
  await handle.attach({
    sessionId: "sess-3",
    cursor: null,
    onChunk: () => {},
    onControl: (f) => controls.push(f),
  });
  controls.length === 1 && controls[0].type === "attach_failed"
    ? pass("attach_failed 也走 onControl (端侧只认这两个控制帧)")
    : miss(`attach_failed 分流不对: ${JSON.stringify(controls)}`);
}

// ===========================================================================
// C. 中止不得掐全体 (契约 L-53) —— 中止只读接入流不得掐服务端那一轮
// ===========================================================================

log("C. 中止不得掐全体 (L-53)");

{
  ReactStub.__resetSlots();
  resetFetch();
  fetchPlan.push((call) => okRes(makeStream([], { hang: true, signal: call.signal })));
  const handle = ReactStub.__render(() => useChatStream());
  const p = handle.attach({
    sessionId: "sess-4",
    cursor: null,
    onChunk: () => {},
    onControl: () => {},
  });
  p.catch(() => {});
  await tick();
  handle.abort("user");
  await tick();

  const call = fetchCalls[0];
  call && call.signal && call.signal.aborted === true
    ? pass("★ 中止只读接入流 ⇒ 本地读流真的被 abort")
    : miss("中止只读接入流后本地读流没被 abort");

  const deletes = fetchCalls.filter((c) => c.method === "DELETE");
  deletes.length === 0
    ? pass("★ 中止只读接入流 **不发** USER_STOP (不掐服务端那一轮)")
    : miss(`中止只读接入流发了 ${deletes.length} 个 DELETE —— 掐到服务端那一轮了`);
}

// ===========================================================================
// D. start 在接回进行中要拒绝 (不得双发)
// ===========================================================================

{
  ReactStub.__resetSlots();
  resetFetch();
  fetchPlan.push((call) => okRes(makeStream([], { hang: true, signal: call.signal })));
  const handle = ReactStub.__render(() => useChatStream());
  const p = handle.attach({
    sessionId: "sess-5",
    cursor: null,
    onChunk: () => {},
    onControl: () => {},
  });
  p.catch(() => {});
  await tick();
  let rejected = null;
  try {
    await handle.start({ sessionId: "sess-5", message: "hi", onChunk: () => {} });
  } catch (err) {
    rejected = err;
  }
  rejected && /已有流/.test(String(rejected.message))
    ? pass("★ 接回进行中再发新轮次被拒 (不双发)")
    : miss(`接回进行中还能发新轮次: ${rejected ? rejected.message : "(没拒绝)"}`);
}

// ===========================================================================
// E. abort 真的中止 (契约 §14.5 P4 / 任务书 P-5)
//    —— 流状态必须挂在 ref 上: 组件一重渲染就丢 ⇒ 「停止」按钮点了跟没点一样。
// ===========================================================================

log("E. abort 真的中止 (P4 / P5)");

{
  ReactStub.__resetSlots();
  resetFetch();
  fetchPlan.push((call) => okRes(makeStream([], { hang: true, signal: call.signal })));
  const h1 = ReactStub.__render(() => useChatStream());
  const p = h1.start({ sessionId: "sess-6", message: "hi", onChunk: () => {} });
  p.catch(() => {});
  await tick();

  // 模拟组件重渲染 (流式过程中 setState ⇒ 必然重渲染) —— 旧写法在这里就丢流了。
  const h2 = ReactStub.__render(() => useChatStream());
  h2.abort("user");
  await tick(10);

  const streamCall = fetchCalls.find((c) => c.url.includes("/chat/stream"));
  streamCall && streamCall.signal && streamCall.signal.aborted === true
    ? pass("★ 重渲染之后按「停止」, fetch 的 signal 真的被 abort 了")
    : miss("重渲染之后按「停止」没能中止流 (流状态没挂 ref)");

  const stopCall = fetchCalls.find(
    (c) => c.method === "DELETE" && c.url.includes("intent=USER_STOP"),
  );
  stopCall
    ? pass("★ 用户按停止 ⇒ 真的把 USER_STOP 发给服务端 (让服务端也停)")
    : miss("用户按停止没有发 USER_STOP —— 服务端会把这轮跑完 (界面骗人)");
}

// ===========================================================================
// F. 断线重连走续传 (契约 L-35 / L-36)
//    —— 第二次请求: body 留空 + 带 Last-Event-ID。
// ===========================================================================

log("F. 断线重连走续传 (L-35 / L-36)");

{
  ReactStub.__resetSlots();
  resetFetch();
  fetchPlan.push(() =>
    okRes(makeStream(['id: 42\ndata: {"content":"a"}\n\n'], { errorAtEnd: true })),
  );
  fetchPlan.push(() =>
    okRes(makeStream(['data: {"done":true,"messageId":"m1","route":"gawen"}\n\n'])),
  );
  const handle = ReactStub.__render(() => useChatStream());
  await handle.start({ sessionId: "sess-7", message: "hi", onChunk: () => {} });

  const streamCalls = fetchCalls.filter((c) => c.url.includes("/chat/stream"));
  const second = streamCalls[1];
  second && second.body === undefined
    ? pass("★ 重连请求 body 留空 (不会重复投喂用户消息 / 不会建新轮次)")
    : miss(`重连请求带了 body: ${JSON.stringify(second?.body)}`);
  second && second.headers["Last-Event-ID"] === "42"
    ? pass("★ 重连带上了断线前拿到的游标 Last-Event-ID: 42")
    : miss(`重连的续传头不对: ${JSON.stringify(second?.headers)}`);
}

// ===========================================================================
// G. 进场序列 (契约 L-57 / L-58 / L-60) —— 结构性, 打在 ChatDetail.tsx 的 AST 上
// ===========================================================================

log("G. 进场序列 (L-57 / L-58)");

const chatDetailCode = repoCode("src/routes/ChatDetail.tsx");

/**
 * 找出 ChatDetail 里**那个**进场 useEffect (body 里含 getStreamState) 的
 * body 文本与 cleanup 文本。走 AST ⇒ 不会切错别的 useEffect。
 */
function extractEnterEffect(src, fileName) {
  const sf = ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TSX,
  );
  let body = null;
  let cleanup = null;
  const visit = (node) => {
    if (body) return;
    if (ts.isCallExpression(node) && node.expression.getText(sf) === "useEffect") {
      const arg = node.arguments[0];
      if (arg && (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg))) {
        const argText = src.slice(arg.getStart(sf), arg.end);
        if (!argText.includes("getStreamState")) {
          ts.forEachChild(node, visit);
          return;
        }
        body = argText;
        const blk = arg.body;
        if (ts.isBlock(blk)) {
          for (const st of blk.statements) {
            if (
              ts.isReturnStatement(st) &&
              st.expression &&
              (ts.isArrowFunction(st.expression) || ts.isFunctionExpression(st.expression))
            ) {
              cleanup = src.slice(st.expression.getStart(sf), st.expression.end);
            }
          }
        }
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return { body, cleanup };
}

const enter = extractEnterEffect(chatDetailCode, "src/routes/ChatDetail.tsx");

enter && /getStreamState\(\s*chatId\s*\)/.test(enter.body)
  ? pass("★ 进场第一问: GET /sessions/:id/stream-state (契约 L-57)")
  : miss("进场没问 stream-state");

enter && /state\.running/.test(enter.body) && /state\.canAttach/.test(enter.body)
  ? pass("★ running / canAttach 都参与判据 (契约 L-41 / L-57)")
  : miss("进场判据里缺 running / canAttach");

enter && /stream\.attach\(/.test(enter.body)
  ? pass("★ running ⇒ 走 attach 接回 (契约 L-49)")
  : miss("接回没走 attach");

enter && /decideAttachCursor\(/.test(enter.body)
  ? pass("★ 游标由共享的 decideAttachCursor 决定 (契约 L-58)")
  : miss("游标决策没走 decideAttachCursor");

enter && /followController\.start\(/.test(enter.body)
  ? pass("接回前先起跟进记录 (游标要能落库)")
  : miss("接回前没起跟进记录");

enter && enter.cleanup
  ? pass("进场 effect 有 cleanup (切会话要掐本地读流)")
  : miss("进场 effect 没有 cleanup");

enter && enter.cleanup && !/followController\.stop\(/.test(enter.cleanup)
  ? pass("★ 离场**不删**跟进记录 (游标留着, 跳走再回来能续传)")
  : miss("离场把跟进记录一起删了");

enter && enter.cleanup && /ac\.abort\(\)/.test(enter.cleanup)
  ? pass("★ 离场只掐本地读流 (契约 L-53)")
  : miss("离场没有掐本地读流");

enter && enter.cleanup && !/stream\.abort\(/.test(enter.cleanup)
  ? pass("★ 离场不掐服务端那一轮 (契约 L-53)")
  : miss("离场掐了服务端那一轮");

// ⚠️ 判据收紧 (变异反证 M35 打回来的): 之前查的是「进场 effect 里出现过 invalidateQueries」——
//   而 effect 末尾「流结束」那段也有 invalidateQueries ⇒ 把 attach_failed 分支里的
//   回落动作删掉, 断言照样绿。改成**只看 attach_failed 那个分支**。
const attachFailedBranch = extractIfBranch(
  chatDetailCode,
  'frame.type === "attach_failed"',
  "src/routes/ChatDetail.tsx",
);

attachFailedBranch &&
/invalidateQueries/.test(attachFailedBranch) &&
/followController\.stop\(/.test(attachFailedBranch)
  ? pass("★ attach_failed ⇒ 静默回落历史补拉 (契约 L-50)")
  : miss("attach_failed 没走静默回落");

// ⚠️ 判据收紧: 之前查的是 `setStreamError("...")` 这种**字符串字面量**形态 ——
//   而 setStreamError 的真实签名是收一个对象 ⇒ 那个写法在生产里压根不存在,
//   断言等于恒绿。改成「进场 effect 里不出现任何 setStreamError / toast 调用」。
enter && !/setStreamError\(/.test(enter.body) && !/toast\(/.test(enter.body)
  ? pass("★ 接回失败不弹错误给用户 (契约 L-50)")
  : miss("接回失败会报错给用户");

// ===========================================================================
// H. 审批清单随 stream-state 校正 (契约 L-43 / D5)
// ===========================================================================

// ⚠️ 判据收紧 (变异反证 M34 打回来的): 之前查的是「进场 effect 里出现过 state.pendingApprovals」——
//   而 `for (const p of [] as typeof state.pendingApprovals)` 里也有这几个字 ⇒ 把循环
//   换成空数组也照样绿。改成查「**直接**遍历 state.pendingApprovals」。
enter && /\bfor\s*\(\s*const\s+\w+\s+of\s+state\.pendingApprovals\s*\)/.test(enter.body)
  ? pass("★ 进场用 stream-state.pendingApprovals 校正本地审批缓存 (契约 L-43 / D5)")
  : miss("进场没用 stream-state.pendingApprovals 校正审批缓存");

// 校正动作本身 (往本地缓存里 upsert) 也得有。
enter && /addPendingApproval\(\{/.test(enter.body)
  ? pass("★ 进场把服务端待审批 upsert 进本地缓存 (契约 L-43 / D5)")
  : miss("进场没把服务端待审批 upsert 进本地缓存");

log("");
log("=== 汇总 ===");
if (fail === 0) {
  console.log("✅ 进场 / 接回验收全过 (stream-state → attach + 空 body + 续传头 + 静默回落 + abort 真中止)");
  console.log(`===PASS=${passCount} FAIL=${fail}===`);
} else {
  console.log(`❌ 有 ${fail} 条断言失败`);
  console.log(`===PASS=${passCount} FAIL=${fail}===`);
}
log(`===EXIT=${fail === 0 ? 0 : 1}===`);
process.exit(fail === 0 ? 0 : 1);
