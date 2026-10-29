// [2026-10-29 · 重构轮 R2-PC] 老服务端兼容实测 (派工单 §2.3 兜底表 + §5 第 5 项)
// ---------------------------------------------------------------------------
// 为什么要这个文件
// ---------------------------------------------------------------------------
//   R1-b/R1-c 之前的服务端**一个 v2 字段都没有**:
//     · `attach_ok.summary`      (T-18 / 订正 13)
//     · 帧级 `elapsedMs`         (T-15)
//     · 帧级 `terminalReason`    (T-12)
//     · `attach_failed.snapshot` (T-08)
//   ⇒ 新端侧 + 老服务端必须**能用** (略降级), 不许报错、不许丢内容。
//
//   本文件**拿老服务端的真实字段形状**跑一遍实现, 逐行钉住派工单 §2.3 的兜底表:
//
//     | 新字段                     | 老服务端没有时                                    |
//     |----------------------------|---------------------------------------------------|
//     | `attach_ok.summary`        | ⇒ 用本地累加的 phases / 本地计时兜底              |
//     | 帧级 `elapsedMs`           | ⇒ 用 `message.startedAt` + 本地时钟兜底            |
//     | `terminalReason`           | ⇒ 从现有帧推导 (`error.code` / `done.cancelled`)   |
//     | `attach_failed.snapshot`   | ⇒ 没有就没有 ⇒ 回落历史, **不报错**               |
//
//   被测对象是**生产代码** (`src/lib/sse/*` + `src/lib/chat-sse.ts` + `src/lib/api.ts`),
//   不是复制品 —— 复制的代码证明不了兼容性。
//
//   ⚠️ 与 web 定稿版 (`gacode-web@ca2fed4:test/sse-turn-r2-oldserver.test.mjs`, 9 条)
//     的**逐条对应抄本** —— 判据不许削弱, 只许因 PC 的模块结构不同而**换落点**;
//     每处改写都在下面的注释里写清了「web 怎么写 / PC 怎么写 / 为什么等价」。
//
//   运行: npm test   (完全离线: 不连网、不渲染 React)
// ---------------------------------------------------------------------------

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { makeTmpDir, writeModule } from "../scripts/lib/schedule-loader.mjs";
import { extractDecl, extractFunction } from "../scripts/lib/source-scan.mjs";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");

const dir = makeTmpDir("verify-sse-turn-r2-old");

// ---------------------------------------------------------------------------
// 加载 sse/ 那 6 个模块 (整目录自包含 ⇒ 只改相对 import)
// ---------------------------------------------------------------------------
const S = await import(writeModule(dir, "seq-guard", repoSrc("src/lib/sse/seq-guard.ts")));
const R = await import(writeModule(dir, "turn-record", repoSrc("src/lib/sse/turn-record.ts")));
const T = await import(writeModule(dir, "terminal", repoSrc("src/lib/sse/terminal.ts")));
const D = await import(
  writeModule(dir, "degrade", repoSrc("src/lib/sse/degrade.ts"), {
    rewriteImports: [
      ["turn-record", "./turn-record.mjs"],
      ["seq-guard", "./seq-guard.mjs"],
    ],
  })
);
const SS = await import(
  writeModule(dir, "turn-session", repoSrc("src/lib/sse/turn-session.ts"), {
    rewriteImports: [
      ["seq-guard", "./seq-guard.mjs"],
      ["turn-record", "./turn-record.mjs"],
      ["terminal", "./terminal.mjs"],
      ["degrade", "./degrade.mjs"],
    ],
  })
);
const E = await import(
  writeModule(dir, "entry", repoSrc("src/lib/sse/entry.ts"), {
    rewriteImports: [
      ["turn-session", "./turn-session.mjs"],
      ["seq-guard", "./seq-guard.mjs"],
      ["turn-record", "./turn-record.mjs"],
      ["degrade", "./degrade.mjs"],
    ],
  })
);

// ---------------------------------------------------------------------------
// 加载生产模块: chat-sse.ts (控制帧解析 + 帧归一层) + api.ts (phases / stream-state)
// ---------------------------------------------------------------------------
// ⚠️ PC 与 web 的结构差异 (判据等价, 落点不同):
//   · PC 的 `src/lib/notifications-sse.ts` 整体 import 了 react / react-router /
//     react-query ⇒ 运行时加载不了 ⇒ 用仓库已有的 `scripts/lib/source-scan.mjs`
//     把**纯逻辑**那两块 (SseFrameParser + parseSseFrame) 抠出来落成桩模块。
//     **抠的是真源码** ⇒ 行为与生产一致。
//   · PC 的帧归一层 `normalizeChatChunk` 在 `src/lib/chat-sse.ts` (web 放在 api.ts);
//     PC 的 `api.ts` 没有 `nav.ts` / `deliverable-visibility.ts` 依赖 (web 有)。
{
  const nsSrc = repoSrc("src/lib/notifications-sse.ts");
  const parserDecl = extractDecl(nsSrc, "SseFrameParser", "src/lib/notifications-sse.ts");
  const parseFn = extractFunction(nsSrc, "parseSseFrame", "src/lib/notifications-sse.ts");
  assert.ok(parserDecl, "从 src/lib/notifications-sse.ts 里抠不出 SseFrameParser");
  assert.ok(parseFn, "从 src/lib/notifications-sse.ts 里抠不出 parseSseFrame");
  writeModule(dir, "notifications-sse", `${parserDecl}\n\n${parseFn}\n`);
}
writeModule(dir, "rich-events", repoSrc("src/lib/rich-events.ts"));
const chatSse = await import(
  writeModule(dir, "chat-sse", repoSrc("src/lib/chat-sse.ts"), {
    rewriteImports: [
      ["notifications-sse", "./notifications-sse.mjs"],
      ["rich-events", "./rich-events.mjs"],
    ],
  })
);

// PC 的 api.ts 运行时依赖只有两个: ./rich-events 与 ./notifications
//   (notifications 走 date-fns —— loader 在临时目录里建了 node_modules junction)。
writeModule(dir, "notifications", repoSrc("src/lib/notifications.ts"));
const api = await import(
  writeModule(dir, "api", repoSrc("src/lib/api.ts"), {
    rewriteImports: [
      ["rich-events", "./rich-events.mjs"],
      ["notifications", "./notifications.mjs"],
    ],
  })
);

// ---------------------------------------------------------------------------
// 老服务端的帧 / 控制帧 (照 unified-api 改动前的 wire 形状抄)
// ---------------------------------------------------------------------------

/** 老服务端的内容帧 —— 没有 seq / elapsedMs / terminalReason / toolCallCount。 */
const OLD_CONTENT_FRAME = {
  content: "老服务端的一段正文",
  reasoning: "老服务端的一段思考",
};

/** 老服务端的工具帧。 */
const OLD_TOOL_FRAME = {
  event: { type: "tool_start", tool: "search", title: "搜一下" },
};

/** 老服务端的天眼帧 (error 顶层 + code)。 */
const OLD_FILTER_FRAME = {
  type: "error",
  code: "OUTPUT_FILTER_HIT",
  content: "❗️天眼系统监测到当前请求有风险",
};

/** 老服务端的轮次终态帧 (done + messageId, 没有 terminalReason)。 */
const OLD_DONE_FRAME = { done: true, messageId: "m-1", fullContent: "老服务端的一段正文" };

/** 老服务端的取消帧 (done + cancelled, 没有 terminalReason)。 */
const OLD_CANCEL_FRAME = { done: true, cancelled: true, route: "gawen" };

/** 老服务端的 attach_ok 控制帧 —— **没有 summary**。 */
const OLD_ATTACH_OK = {
  type: "attach_ok",
  turnKey: "turn-old-1",
  resumedFrom: "17",
  replayed: 0,
  reason: null,
};

/** 老服务端的 attach_failed 控制帧 —— **没有 snapshot**。 */
const OLD_ATTACH_FAILED = { type: "attach_failed", reason: "buffer_expired" };

// ===========================================================================
// 行 1 —— `attach_ok.summary` 没有 ⇒ 用本地累加的 phases / 本地计时兜底
// ===========================================================================

test("兜底表行1 · 老服务端的 attach_ok 没有 summary ⇒ 本地累加的 phases 留着, 计时走本地兜底", async () => {
  // ① 生产解析器: 老服务端下 **summary 这个键根本不存在** (不是 undefined 值)。
  const parsed = chatSse.parseAttachControl(OLD_ATTACH_OK);
  assert.equal(parsed.type, "attach_ok");
  assert.ok(!("summary" in parsed), "★ 老服务端下 attach_ok 不得凭空长出 summary 键");
  assert.equal(parsed.summary, undefined);

  // ② 中枢: 先本地累几帧 (老服务端形态), 再收一个**没有 summary** 的 attach_ok。
  const ctrl = E.createEntryController(
    "s1",
    {
      probe: async () => ({
        reachable: true,
        running: true,
        canAttach: true,
        turnKey: "turn-old-1",
        lastEventId: "17",
        pendingApprovals: [],
        lastSeq: null,
        turnState: "running",
        upstreamAlive: true,
        snapshotAvailable: false,
        completeness: "partial",
        startedAt: null,
        elapsedMs: null,
        toolCallCount: null,
        thinkingCount: null,
      }),
      loadRecord: async () => null,
      saveRecord: async () => {},
      attach: async (args) => {
        // 老服务端: attach_ok 没有 summary。
        args.onControl?.({ type: "attach_ok", turnKey: "turn-old-1", resumedFrom: "17" });
        // 老服务端的内容帧: 没有 seq / elapsedMs / terminalReason。
        args.onData?.(OLD_CONTENT_FRAME, "18");
        args.onData?.(OLD_TOOL_FRAME, "19");
        // 老服务端的轮次终态帧 (done + messageId, 没有 terminalReason)。
        args.onData?.(OLD_DONE_FRAME, "20");
      },
    },
    {},
    () => 1000
  );
  await ctrl.start();

  const snap = ctrl.session.record.renderedSnapshot;
  assert.equal(snap.content, "老服务端的一段正文", "★ 本地累加的正文必须留着");
  assert.equal(snap.phases.length, 2, "★ 本地累加的 phases 必须留着 (thinking + tool)");
  assert.equal(snap.phases[0].type, "thinking");
  assert.equal(snap.phases[0].text, "老服务端的一段思考");
  assert.equal(snap.phases[1].type, "tool");
  // 计时: 老服务端没给 ⇒ 留 null ⇒ 上层 (MessageBubble) 走 startedAt + 本地时钟兜底。
  assert.equal(snap.elapsedMs, null, "★ 老服务端没有 elapsedMs ⇒ 留 null 走本地兜底");
  assert.equal(snap.toolCallCount, null, "★ 老服务端没有 toolCallCount ⇒ 留 null 走端侧兜底计数");
  assert.equal(snap.thinkingCount, null, "★ 老服务端没有 thinkingCount ⇒ 留 null 走端侧兜底计数");
  assert.equal(ctrl.session.state, "draining", "老服务端下这一轮也要能收尾");
  assert.equal(
    ctrl.session.terminal.reason,
    "completed",
    "★ 老服务端没有 terminalReason ⇒ 终态要从 done 帧推导出来"
  );
});

// ===========================================================================
// 行 2 —— 帧级 `elapsedMs` 没有 ⇒ 用 message.startedAt + 本地时钟兜底
// ===========================================================================

test("兜底表行2 · 老服务端的帧没有 elapsedMs ⇒ 快照留 null, 上层用 startedAt + 本地时钟", () => {
  // ① 生产归一层: 老服务端帧原样透传 —— 端侧**不许自己补 0**。
  //    ⚠️ PC 的归一层落在 `src/lib/chat-sse.ts` (web 放在 api.ts) ⇒ 换模块, 判据同。
  const norm = chatSse.normalizeChatChunk({ ...OLD_CONTENT_FRAME });
  assert.equal(norm.elapsedMs, undefined, "★ 老服务端帧不得被补出 elapsedMs");
  assert.equal(norm.seq, undefined);
  assert.equal(norm.terminalReason, undefined);
  assert.equal(norm.content, "老服务端的一段正文", "老服务端帧的内容必须原样透传");

  // ② 快照层: elapsedMs 保持 null (上层据此走本地时钟兜底)。
  let snap = R.emptyRenderedSnapshot();
  snap = R.mergeFrame(snap, OLD_CONTENT_FRAME);
  assert.equal(snap.elapsedMs, null, "★ 老服务端没有 elapsedMs ⇒ 留 null 走本地兜底");

  // ③ 渲染层: MessageBubble 优先用帧里的 elapsedMs, 没有才用 startedAt + 本地时钟。
  //    ⚠️ web 的气泡 props 叫 `message.elapsedMs` (对象式取值);
  //    PC 的气泡是**解构 props** ⇒ 判据落成「先判 elapsedMs 是 number,
  //    再回落到 startedAt」, 语义完全等价。
  const bubbleSrc = repoSrc("src/components/chat/MessageBubble.tsx");
  assert.ok(
    /typeof elapsedMs === "number"/.test(bubbleSrc),
    "★ MessageBubble 必须先看帧里的 elapsedMs"
  );
  assert.ok(
    /startedAt/.test(bubbleSrc),
    "★ 老服务端没有 elapsedMs ⇒ 必须回落到 startedAt + 本地时钟"
  );
});

// ===========================================================================
// 行 3 —— `terminalReason` 没有 ⇒ 从现有帧推导 (error.code / done.cancelled)
// ===========================================================================

test("兜底表行3 · 老服务端没有 terminalReason ⇒ 终态从现有帧推导出来", () => {
  const Tm = T;

  // ① 天眼: 只有 error 帧的 code 能认 (订正 8)。
  assert.equal(Tm.readTerminalReason(OLD_FILTER_FRAME), "filtered");
  // ② 取消: done.cancelled。
  assert.equal(Tm.readTerminalReason(OLD_CANCEL_FRAME), "cancelled");
  // ③ 失败: 有 error 文案。
  assert.equal(Tm.readTerminalReason({ done: true, error: "处理时发生错误: xxx" }), "failed");
  // ④ 正常完成: done + messageId。
  assert.equal(Tm.readTerminalReason(OLD_DONE_FRAME), "completed");
  // ⑤ 中途哨兵 (裸 done) 不是终态。
  assert.equal(Tm.readTerminalReason({ done: true }), null);

  // ⑥ 流结束但没有终态帧 ⇒ upstream_lost (不是「完成」)。
  assert.equal(Tm.deriveTerminalReason({ streamEnded: true }), "upstream_lost");
  assert.equal(Tm.deriveTerminalReason({}), "completed");

  // ⑦ 走完整中枢: 老服务端的天眼帧 ⇒ 正文被撤掉 + 终态是 blocked。
  const ctrl = E.createEntryController(
    "s1",
    {
      probe: async () => null,
      loadRecord: async () => null,
      saveRecord: async () => {},
      attach: async () => {},
    },
    {},
    () => 0
  );
  let s = SS.createTurnSession("s1", null, 0);
  s = SS.transition(s, { type: "connect" }, 0);
  s = SS.transition(s, { type: "attach_ok" }, 0);
  s = SS.transition(s, { type: "frame", frame: OLD_CONTENT_FRAME }, 0);
  assert.equal(s.record.renderedSnapshot.content, "老服务端的一段正文");
  s = SS.transition(s, { type: "frame", frame: OLD_FILTER_FRAME }, 0);
  assert.equal(s.state, "draining", "老服务端的天眼帧也要把轮次收尾");
  assert.equal(s.terminal.reason, "filtered");
  assert.equal(s.terminal.form, "blocked", "★ 天眼不是「普通报错」");
  assert.equal(s.record.renderedSnapshot.content, "", "★ 天眼命中 ⇒ 撤掉已渲染的 partial 正文");
});

// ===========================================================================
// 行 4 —— `attach_failed.snapshot` 没有 ⇒ 回落历史, 不报错
// ===========================================================================

test("兜底表行4 · 老服务端的 attach_failed 没有 snapshot ⇒ 回落历史, 不报错", async () => {
  // ① 生产解析器: 老服务端下 **snapshot 键不存在**。
  const parsed = chatSse.parseAttachControl(OLD_ATTACH_FAILED);
  assert.equal(parsed.type, "attach_failed");
  assert.ok(!("snapshot" in parsed), "★ 老服务端下 attach_failed 不得凭空长出 snapshot 键");
  assert.equal(parsed.snapshot, undefined);

  // ② 中枢: 降级闭环 —— 回落历史 + 静默 + 游标留着。
  let historyCalls = 0;
  const ctrl = E.createEntryController(
    "s1",
    {
      probe: async () => ({
        reachable: true,
        running: true,
        canAttach: true,
        turnKey: "turn-old-1",
        lastEventId: "17",
        pendingApprovals: [],
        lastSeq: null,
        turnState: "running",
        upstreamAlive: true,
        snapshotAvailable: false,
        completeness: "partial",
        startedAt: null,
        elapsedMs: null,
        toolCallCount: null,
        thinkingCount: null,
      }),
      loadRecord: async () => null,
      saveRecord: async () => {},
      attach: async (args) => {
        args.onControl?.({ type: "attach_failed", reason: "buffer_expired" });
      },
    },
    { onHistory: () => historyCalls++ },
    () => 0
  );
  await ctrl.start();

  assert.equal(ctrl.session.state, "degraded");
  assert.equal(ctrl.session.degradePlan.renderSnapshot, false, "★ 没有快照 ⇒ 不渲染快照");
  assert.equal(ctrl.session.degradePlan.fallbackToHistory, true, "★ 必须回落历史");
  assert.equal(ctrl.session.degradePlan.raiseError, false, "★ 降级不弹错误");
  assert.equal(ctrl.session.degradePlan.notice, null, "★ 降级完全静默");
  assert.equal(historyCalls, 1, "★ 必须回调回落历史");
});

// ===========================================================================
// 老服务端没有 /stream-state 端点 ⇒ 404 ⇒ 「没在跑」(不是「问不到」)
// ===========================================================================

test("老服务端没有 stream-state 端点 (404) ⇒ 当「没在跑」处理, 不当成「问不到」", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      statusText: "Not Found",
      headers: { "content-type": "application/json" },
    });
  try {
    const state = await api.getStreamState("s1");
    assert.ok(state, "★ 404 是「服务端答了」⇒ 必须返回一个状态, 不能是 null");
    assert.equal(state.running, false, "★ 老服务端 ⇒ 按「没在跑」处理");
    assert.equal(state.canAttach, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("stream-state 网络失败 (问不到) ⇒ 返回 null (不可达 ⇒ 回落历史, 不抹游标)", async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  try {
    const state = await api.getStreamState("s1");
    assert.equal(state, null, "★ 问不到必须返回 null (与「没在跑」分开)");
  } finally {
    globalThis.fetch = realFetch;
  }
});

// ===========================================================================
// 老服务端的 phases 是 v1 raw ⇒ 解析层不合并, 渲染层兼容分支合并 (且只有一处)
// ===========================================================================

test("老服务端的 phases_json 是 v1 raw ⇒ 解析层原样, 渲染层兼容分支合成 1 条", () => {
  const rawJson = JSON.stringify([
    { type: "thinking", text: "先想", ts: 1 },
    { type: "thinking", text: "再想", ts: 2 },
    { type: "thinking", text: "再想2", ts: 3 },
  ]);
  // ① 解析层 (生产代码): 原样收下, **不合并** (T-16)。
  //    ⚠️ PC 的 parsePhasesJson 直接返回 `ExecutionPhase[]`
  //    (web 返回 `{richEvents, phases}`) ⇒ 取数组本身, 判据同。
  const parsed = api.parsePhasesJson(rawJson);
  assert.ok(Array.isArray(parsed), "★ parsePhasesJson 必须返回相位数组");
  assert.equal(parsed.length, 3, "★ 解析层不许合并 (服务端刻意分开的段会被粘回去)");

  // ② 渲染层 (兼容分支): 老数据合成 1 条完整思考链。
  const rendered = R.renderPhases(parsed, { authoritative: false });
  assert.equal(rendered.length, 1, "★ 兼容分支把相邻 thinking 合成 1 条");
  assert.equal(rendered[0].text, "先想再想再想2");
});

// ===========================================================================
// 新服务端 + 老端侧 = 能用 (降级为整轮重放) —— 端侧这一侧要做对的两件事
// ===========================================================================

test("新服务端 + 老端侧: 本机零状态 ⇒ 发 X-Resume-Turn (整轮重放), 不发脏游标", () => {
  // 本机零状态 ⇒ 没有合法游标 ⇒ 走 X-Resume-Turn: 1 (契约 L-35)。
  assert.equal(chatSse.buildResumeHeaders(null)["Last-Event-ID"], undefined);
  assert.equal(chatSse.buildResumeHeaders(null)["X-Resume-Turn"], "1");
  assert.equal(chatSse.buildResumeHeaders("12abc")["Last-Event-ID"], undefined);
  assert.equal(chatSse.buildResumeHeaders("12abc")["X-Resume-Turn"], "1");
});

test("新服务端整轮重放 (无 seq 的帧) ⇒ 端侧照常应用, 不误判成有洞", () => {
  const G = S;
  // 整轮重放 ⇒ 每帧都带 id 游标但跳号 ⇒ 老语义 ⇒ 只判重复, 不判洞。
  let applied = null;
  const verdicts = [];
  for (const cur of ["1", "5", "9"]) {
    const v = G.decideFrame(applied, {}, cur);
    verdicts.push(v.kind);
    applied = G.nextAppliedSeq(applied, v);
  }
  assert.deepEqual(verdicts, ["apply", "apply", "apply"], "★ 整轮重放不得被判成有洞");
});
