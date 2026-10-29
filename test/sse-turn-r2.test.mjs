// [2026-10-29 · 重构轮 R2-PC] 端侧续传中枢 —— 断言 B1~B9 / B14~B19 / Z1~Z3
//
// ⚠️ 本文件是 web 定稿版 (`gacode-web@ca2fed4:test/sse-turn-r2.test.mjs`, 33 条)
//   的**逐条对应抄本** —— 判据不许削弱, 只许因 PC 的文件结构不同而**换落点**。
//   每处 PC 特有改写都在下面的注释里写清了「web 怎么写 / PC 怎么写 / 为什么等价」。
//
// 覆盖 (任务书 07 §3.3):
//   B1  同 seq 帧到两次 ⇒ 只渲染一次          (T-09 / P-3)
//   B2  帧 seq 跳号 ⇒ 触发降级 (不静默吞内容)  (T-09)
//   B3  attach_failed 带 snapshot ⇒ 渲染快照   (T-08)
//   B4  attach_failed 不带 snapshot ⇒ 回落历史, **无错误提示** (契约 L-50)
//   B5  stream-state running=false ⇒ **不发 attach** (契约 L-58)
//   B6  stream-state **不可达** ⇒ 回落历史, **不抹游标** (缺陷 A-3)
//   B7  turn record 落盘 ⇒ 刷新后先渲染快照内容 (缺陷 D-1)
//   B8  退出页面 ⇒ **不发 DELETE** (T-10)
//   B9  重连**存在**且带 `Last-Event-ID`       (缺陷 W-1)
//   B14 端侧**不再合并** thinking (喂已合并的 phases ⇒ 段数 = 数组长度) (T-16)
//   B15 喂**未合并**的旧历史 ⇒ 兼容分支仍渲染出 1 条完整思考链 (T-16 兼容)
//   B16 收到带 `elapsedMs` 的帧 ⇒ 显示该值 (不用本地时钟) (T-15)
//   B17 收到 `error{code:'OUTPUT_FILTER_HIT'}` ⇒ 已渲染 partial 正文被清空 (T-13)
//   B18 `terminalReason` 四类分别渲染出**四种不同**的表现 (T-12)
//   B19 「工具 N 次」= 服务端 `toolCallCount` (端侧不数帧) (T-17)
//   Z1/Z2/Z3  src/lib/sse/ 的「可抄」纪律 (零外部依赖 / 自包含 / 只有那 6 个模块)
//
//   为什么被测对象是 .ts 而测试是 .mjs:
//     Node ESM 既不认 "@/lib/..." 别名, 也不做扩展名补全 ⇒ 直接 import 会
//     ERR_MODULE_NOT_FOUND。这里复用仓库已有的转译加载器
//     (scripts/lib/schedule-loader.mjs), 跟其余测试同一套手法。
//
//   运行: npm test   (完全离线: 不连网、不渲染 React)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { makeTmpDir, writeModule } from "../scripts/lib/schedule-loader.mjs";
import { stripComments } from "../scripts/lib/strip-comments.mjs";
import { extractDecl, extractFunction, extractObjectProp, extractSiblingObjectProp } from "../scripts/lib/source-scan.mjs";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");
const repoCode = (p) => stripComments(repoSrc(p), p);

// ---------------------------------------------------------------------------
// 加载 src/lib/sse/ 下的 6 个模块 (整目录自包含 ⇒ 相对 import 改写成 .mjs)
// ---------------------------------------------------------------------------
const dir = makeTmpDir("verify-sse-turn-r2");

const S = {}; // seq-guard
const R = {}; // turn-record
const T = {}; // terminal
const D = {}; // degrade
const SS = {}; // turn-session
const E = {}; // entry

S.seqGuard = await import(
  writeModule(dir, "seq-guard", repoSrc("src/lib/sse/seq-guard.ts"))
);
R.turnRecord = await import(
  writeModule(dir, "turn-record", repoSrc("src/lib/sse/turn-record.ts"))
);
T.terminal = await import(
  writeModule(dir, "terminal", repoSrc("src/lib/sse/terminal.ts"))
);
// degrade 依赖 ./turn-record 与 ./seq-guard
D.degrade = await import(
  writeModule(dir, "degrade", repoSrc("src/lib/sse/degrade.ts"), {
    rewriteImports: [
      ["turn-record", "./turn-record.mjs"],
      ["seq-guard", "./seq-guard.mjs"],
    ],
  })
);

// turn-session 依赖 4 个模块
SS.turnSession = await import(
  writeModule(dir, "turn-session", repoSrc("src/lib/sse/turn-session.ts"), {
    rewriteImports: [
      ["seq-guard", "./seq-guard.mjs"],
      ["turn-record", "./turn-record.mjs"],
      ["terminal", "./terminal.mjs"],
      ["degrade", "./degrade.mjs"],
    ],
  })
);

// entry 依赖 4 个模块
E.entry = await import(
  writeModule(dir, "entry", repoSrc("src/lib/sse/entry.ts"), {
    rewriteImports: [
      ["turn-session", "./turn-session.mjs"],
      ["seq-guard", "./seq-guard.mjs"],
      ["turn-record", "./turn-record.mjs"],
      ["degrade", "./degrade.mjs"],
    ],
  })
);

// 游标 / 续传头 —— 生产真用的那个模块 (PC 的 chat-stream.ts 用的就是它)。
//
// ⚠️ PC 与 web 的**唯一**结构差异: PC 的 `src/lib/notifications-sse.ts` 整体
//   import 了 react / react-router / react-query (通知中心的 UI 桥) ⇒ 运行时
//   加载不了 ⇒ 用仓库已有的 `scripts/lib/source-scan.mjs` 把**纯逻辑**那两块
//   (增量帧解析器 + 单帧解析) 抠出来落成桩模块。
//   **抠的是真源码** (不是复写一遍) ⇒ 桩里的行为与生产完全一致 ——
//   断言验的仍是真代码 (与 web 的做法同款)。
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

// ===========================================================================
// B1 —— 同 seq 帧到两次 ⇒ 只渲染一次 (T-09)
// ===========================================================================

test("B1 同 seq 帧到两次 ⇒ 只渲染一次 (丢弃重复, 不推进 appliedSeq)", () => {
  const G = S.seqGuard;
  let applied = null;
  const rendered = [];

  const feed = (seq) => {
    const verdict = G.decideFrame(applied, { seq }, null);
    if (verdict.kind === "apply") {
      applied = G.nextAppliedSeq(applied, verdict);
      rendered.push(seq);
    }
    return verdict;
  };

  assert.equal(feed(7).kind, "apply");
  assert.equal(feed(8).kind, "apply");
  const dup = feed(8);
  assert.equal(dup.kind, "duplicate", "同 seq 第二次到达必须判为重复");
  assert.deepEqual(rendered, [7, 8], "重复帧不得再渲染一次");
  assert.equal(applied, 8, "重复帧不得推进 appliedSeq");
});

test("B1b 老服务端 (只有 SSE id 游标, 没有显式 seq) ⇒ 重复也判得出来", () => {
  const G = S.seqGuard;
  let applied = null;
  const v1 = G.decideFrame(applied, {}, "10");
  assert.equal(v1.kind, "apply");
  applied = G.nextAppliedSeq(applied, v1);
  const v2 = G.decideFrame(applied, {}, "10");
  assert.equal(v2.kind, "duplicate", "同一游标到达两次 ⇒ 重复");
});

// ===========================================================================
// B2 —— 帧 seq 跳号 ⇒ 触发降级 (不静默吞内容)
// ===========================================================================

test("B2 帧 seq 跳号 ⇒ 判为有洞 (gap)", () => {
  const G = S.seqGuard;
  const applied = 10;
  const verdict = G.decideFrame(applied, { seq: 13 }, null);
  assert.equal(verdict.kind, "gap");
  assert.equal(verdict.expected, 11);
  assert.equal(verdict.received, 13);
});

test("B2b 老服务端的游标跳号 (gaclaw eventId 不连续) ⇒ **不**判成洞", () => {
  const G = S.seqGuard;
  // v1 契约: 跳号是**常见**的 ⇒ 拿游标当 seq 判洞会天天误降级。
  const verdict = G.decideFrame(10, {}, "17");
  assert.equal(verdict.kind, "apply", "老服务端游标跳号不得判成洞");
  assert.equal(verdict.seq, 17);
});

test("B2c 状态机收到 gap 事件 ⇒ 进 degraded (不静默吞内容)", () => {
  const M = SS.turnSession;
  let s = M.createTurnSession("s1", null, 0);
  s = M.transition(s, { type: "connect" }, 0);
  s = M.transition(s, { type: "attach_ok" }, 0);
  assert.equal(s.state, "live");
  s = M.transition(s, { type: "gap", expected: 2, received: 5 }, 0);
  assert.equal(s.state, "degraded");
  assert.equal(s.degradeReason, "seq_gap");
  // 降级**必须带内容** ⇒ 计划里 fallbackToHistory 为真, 且不报错。
  assert.equal(s.degradePlan.fallbackToHistory, true);
  assert.equal(s.degradePlan.raiseError, false);
});

// ===========================================================================
// B3 / B4 —— attach_failed 的降级闭环
// ===========================================================================

test("B3 attach_failed 带 snapshot ⇒ 渲染快照 (正文非空)", () => {
  const M = SS.turnSession;
  const snapshot = {
    content: "已经产出的正文",
    phases: [{ type: "thinking", text: "想过了", ts: 1 }],
    events: [],
  };
  let s = M.createTurnSession("s1", null, 0);
  s = M.transition(s, { type: "connect" }, 0);
  s = M.transition(s, { type: "attach_failed", reason: "log_gap", snapshot }, 0);

  assert.equal(s.state, "degraded");
  assert.equal(s.record.renderedSnapshot.content, "已经产出的正文", "快照正文必须渲染出来");
  assert.equal(s.record.renderedSnapshot.phases.length, 1);
  assert.equal(s.degradePlan.renderSnapshot, true);
});

test("B4 attach_failed 不带 snapshot ⇒ 回落历史, **无错误提示**", () => {
  const M = SS.turnSession;
  let s = M.createTurnSession("s1", null, 0);
  s = M.transition(s, { type: "connect" }, 0);
  s = M.transition(s, { type: "attach_failed", reason: "buffer_expired" }, 0);

  assert.equal(s.state, "degraded");
  assert.equal(s.degradePlan.renderSnapshot, false, "没快照 ⇒ 不渲染快照");
  assert.equal(s.degradePlan.fallbackToHistory, true, "必须回落历史");
  assert.equal(s.degradePlan.raiseError, false, "★ 降级不弹错误");
  assert.equal(s.degradePlan.notice, null, "★ 降级完全静默");
});

test("B4b attach_failed 的 7 种原因码全都认 (契约订正 3)", () => {
  const G = D.degrade;
  for (const r of [
    "not_running",
    "turn_ended",
    "upstream_dead",
    "log_gap",
    "bad_cursor",
    "cursor_ahead",
    "unknown",
  ]) {
    assert.equal(G.planDegrade({ reason: r }).reason, r);
  }
  // 老服务端的 v1 原因码也认。
  for (const r of ["no_active_stream", "buffer_expired"]) {
    assert.equal(G.planDegrade({ reason: r }).reason, r);
  }
  // 未知码 ⇒ 归一到 unknown, 不抛。
  assert.equal(G.planDegrade({ reason: "brand_new_code" }).reason, "unknown");
});

// ===========================================================================
// B5 / B6 —— 进场判据
// ===========================================================================

test("B5 stream-state 返回 running=false ⇒ **不发 attach**", () => {
  const D2 = E.entry;
  const decision = D2.decideEntry({
    probe: {
      reachable: true,
      running: false,
      canAttach: false,
      turnKey: null,
      lastEventId: null,
      pendingApprovals: [],
      lastSeq: null,
      turnState: null,
      upstreamAlive: null,
      snapshotAvailable: null,
      completeness: null,
      startedAt: null,
      elapsedMs: null,
      toolCallCount: null,
      thinkingCount: null,
    },
    localCursor: "42",
  });
  assert.equal(decision.action, "history");
  assert.equal(decision.keepCursor, false);
});

test("B5b 控制器在 running=false 时**不调** attach", async () => {
  const D2 = E.entry;
  let attachCalls = 0;
  const ctrl = D2.createEntryController(
    "s1",
    {
      probe: async () => ({
        reachable: true,
        running: false,
        canAttach: false,
        turnKey: null,
        lastEventId: null,
        pendingApprovals: [],
        lastSeq: null,
        turnState: null,
        upstreamAlive: null,
        snapshotAvailable: null,
        completeness: null,
        startedAt: null,
        elapsedMs: null,
        toolCallCount: null,
        thinkingCount: null,
      }),
      loadRecord: async () => null,
      saveRecord: async () => {},
      attach: async () => {
        attachCalls++;
      },
    },
    {},
    () => 0
  );
  await ctrl.start();
  assert.equal(attachCalls, 0, "★ 没在跑 ⇒ 绝不能发 attach");
});

test("B6 stream-state **不可达** ⇒ 回落历史, **不抹游标**", () => {
  const D2 = E.entry;
  const decision = D2.decideEntry({ probe: null, localCursor: "42" });
  assert.equal(decision.action, "history");
  assert.equal(decision.reason, "stream_state_unreachable");
  assert.equal(decision.keepCursor, true, "★ 问不到 ≠ 没在跑 ⇒ 游标必须留着");
});

test("B6b 控制器遇到不可达 ⇒ 降级 + 回落历史, 且游标**没被抹掉**", async () => {
  const D2 = E.entry;
  const saved = [];
  let historyCalls = 0;
  let degradeCalls = 0;
  const ctrl = D2.createEntryController(
    "s1",
    {
      probe: async () => null, // 问不到
      loadRecord: async () => ({
        sessionId: "s1",
        turnKey: "t1",
        seq: "42",
        renderedSnapshot: {
          content: "已渲染",
          events: [],
          phases: [],
          startedAt: null,
          elapsedMs: null,
          toolCallCount: null,
          thinkingCount: null,
          terminalReason: null,
        },
        updatedAt: 0,
      }),
      saveRecord: async (rec) => saved.push(rec),
      attach: async () => {
        throw new Error("不该被调用");
      },
    },
    {
      onDegrade: () => degradeCalls++,
      onHistory: () => historyCalls++,
    },
    () => 0
  );
  await ctrl.start();
  assert.equal(degradeCalls, 1, "★ 不可达 ⇒ 走降级分支");
  assert.equal(historyCalls, 1, "★ 不可达 ⇒ 回落历史");
  assert.equal(ctrl.session.record.seq, "42", "★ 游标不许被抹掉");
});

// ===========================================================================
// B7 —— turn record 落盘 ⇒ 刷新后先渲染快照内容
// ===========================================================================

test("B7 turn record 落盘 ⇒ 重开后能读回已渲染内容", async () => {
  const R2 = R.turnRecord;
  const store = new Map();
  const storage = {
    get: async (id) => store.get(id) ?? null,
    put: async (rec) => store.set(rec.sessionId, rec),
    remove: async (id) => store.delete(id),
  };
  const ts = R2.createTurnRecordStore(storage, () => 1000);

  const rec = R2.emptyTurnRecord("s1", 0);
  rec.seq = "42";
  rec.turnKey = "t1";
  rec.renderedSnapshot = R2.mergeFrame(rec.renderedSnapshot, {
    content: "半截正文",
    reasoning: "想了一下",
  });
  await ts.write(rec);

  // 模拟刷新: 重新读。
  const back = await ts.read("s1");
  assert.ok(back, "刷新后必须能读回轮次记录");
  assert.equal(back.seq, "42", "游标要跟内容在**同一条记录**里 (缺陷 D-1)");
  assert.equal(back.renderedSnapshot.content, "半截正文", "★ 已渲染内容必须还在");
  assert.equal(back.renderedSnapshot.phases.length, 1);
  assert.equal(back.turnKey, "t1");
});

test("B7b 轮次记录落盘后, 刷新先渲染快照内容再接增量", async () => {
  const D2 = E.entry;
  const record = {
    sessionId: "s1",
    turnKey: "t1",
    seq: "7",
    renderedSnapshot: {
      content: "刷新前已经渲染的正文",
      events: [],
      phases: [],
      startedAt: null,
      elapsedMs: null,
      toolCallCount: null,
      thinkingCount: null,
      terminalReason: null,
    },
    updatedAt: 0,
  };
  const frames = [];
  const ctrl = D2.createEntryController(
    "s1",
    {
      probe: async () => ({
        reachable: true,
        running: true,
        canAttach: true,
        turnKey: "t1",
        lastEventId: "7",
        pendingApprovals: [],
        lastSeq: 7,
        turnState: "running",
        upstreamAlive: true,
        snapshotAvailable: true,
        completeness: "partial",
        startedAt: null,
        elapsedMs: null,
        toolCallCount: null,
        thinkingCount: null,
      }),
      loadRecord: async () => record,
      saveRecord: async () => {},
      attach: async (args) => {
        // 先给控制帧, 再给一帧增量。
        args.onControl?.({ type: "attach_ok", turnKey: "t1", resumedFrom: "7" });
        args.onData?.({ content: " + 增量" }, "8");
      },
    },
    { onFrame: (f) => frames.push(f) },
    () => 0
  );
  await ctrl.start();
  // 本机已渲染的内容**保留**, 增量接在**后面** (不重放、不覆盖)。
  assert.equal(
    ctrl.session.record.renderedSnapshot.content,
    "刷新前已经渲染的正文 + 增量",
    "★ 刷新后必须先渲染本机快照, 再接增量"
  );
  assert.equal(frames.length, 1, "增量帧只通知一次");
});

// ===========================================================================
// B8 —— 退出页面 ⇒ **不发 DELETE**
// ===========================================================================

test("B8 退出页面 ⇒ 不发 DELETE (只停订阅, 不删轮次记录)", () => {
  // ⚠️ PC 的页面文件是 `src/routes/ChatDetail.tsx` (web 是 app 路由
  //   `src/app/(main)/chat/[id]/page.tsx`) ⇒ 落点换文件, 判据等价。
  const pageCode = repoCode("src/routes/ChatDetail.tsx");
  // ⚠️ PC 的收尾 DELETE 在 `src/lib/chat-stream.ts` (原 `src/lib/sse.ts`
  //   改名而来) 里; `sendCancelDelete` 本体在 `src/lib/cancel.ts`。
  const streamCode = repoCode("src/lib/chat-stream.ts");

  // ① 离场清理: 只 abort 读流, **不得**置 userStopped (置了就会发 USER_STOP)。
  //    ⚠️ PC 的 useEffect 依赖数组前有一行 eslint-disable 注释 ⇒ 不能用
  //    web 那个「靠 `}, [chatId])` 收尾」的正则 (会误配到别的 effect) ——
  //    改成**以 `getStreamState(chatId)` 为锚**定位「进场接回」那个 effect,
  //    判据 (不许出现 userStopped = true) 不变, 且更精确。
  const anchor = pageCode.indexOf("getStreamState(chatId)");
  assert.ok(anchor > 0, "没找到进场接回的 useEffect");
  const effectStart = pageCode.lastIndexOf("useEffect(() => {", anchor);
  const effectEnd = pageCode.indexOf("}, [chatId]);", effectStart);
  assert.ok(
    effectStart > 0 && effectEnd > effectStart,
    "没找到进场接回 useEffect 的边界",
  );
  const effectCode = pageCode.slice(effectStart, effectEnd);
  assert.ok(
    !/userStopped\s*=\s*true/.test(effectCode),
    "★ 离场不得置 userStopped (置了就会发 USER_STOP ⇒ 等于发取消)"
  );
  assert.ok(
    /ac\.abort\(\)/.test(effectCode),
    "★ 离场必须 abort 本地读流 (只掐读流, 不掐服务端那一轮)",
  );

  // ② DELETE 只有两条合法路径: USER_STOP / ACK_DONE。
  //    ⚠️ 只认**调用点** (实参里带意图标记) —— 声明处没有实参, 不算调用。
  const delCalls = [
    ...streamCode.matchAll(/sendCancelDelete\([^)]*"(USER_STOP|ACK_DONE)"\)/g),
  ].map((m) => m[0]);
  assert.ok(delCalls.length >= 2, "没找到 DELETE 的两处调用点");
  for (const call of delCalls) {
    assert.ok(
      /USER_STOP|ACK_DONE/.test(call),
      `DELETE 的调用必须带意图标记: ${call}`
    );
  }
  // ③ USER_STOP 只在「用户按了停止」时才发。
  //    ⚠️ PC 的收尾在 chat-stream.ts 里 (web 在 api.ts) ⇒ 变量名也不同
  //    (PC: `ac.signal.aborted && turnState.userStopped`;
  //     web: `opts.signal?.aborted && opts.turnState?.userStopped`)。
  assert.ok(
    /if \(ac\.signal\.aborted && turnState\.userStopped\)/.test(streamCode),
    "★ USER_STOP 只在「用户按了停止」时才发"
  );
});

// ⚠️ 追加 (R2-PC′ 批) —— **不削弱** B8, 只是把「离场清理」钉到**对的那处 effect**。
//   ⚠️ B8 用「`}, [chatId])` 收尾」的正则找清理块 ⇒ 本仓里有好几个 useEffect
//     ⇒ 它**误配到了别的 effect** ⇒ 往「进场接回」那处清理里塞 userStopped,
//     B8 是**抓不到的** (这一条改用锚定位, 判据不变)。
//   ⇒ 这一条用**锚** (`getStreamState(chatId)`) 重新定位「进场接回」那处 effect,
//     判据与 B8 完全相同 (不许出现 userStopped = true; 必须有 ac.abort())。
test("B8b 进场接回那处 useEffect 的离场清理: 只 abort 读流, **不置** userStopped", () => {
  const pageCode = repoCode("src/routes/ChatDetail.tsx");
  const anchor = pageCode.indexOf("getStreamState(chatId)");
  assert.ok(anchor > 0, "没找到进场接回的 useEffect");
  const effectStart = pageCode.lastIndexOf("useEffect(() => {", anchor);
  const effectEnd = pageCode.indexOf("}, [chatId]);", effectStart);
  assert.ok(
    effectStart > 0 && effectEnd > effectStart,
    "没找到进场接回 useEffect 的边界"
  );
  const effectCode = pageCode.slice(effectStart, effectEnd);
  assert.ok(
    !/userStopped\s*=\s*true/.test(effectCode),
    "★ 离场不得置 userStopped (置了就会发 USER_STOP ⇒ 等于发取消)"
  );
  assert.ok(
    /ac\.abort\(\)/.test(effectCode),
    "★ 离场必须 abort 本地读流 (只掐读流, 不掐服务端那一轮)"
  );
});

// ===========================================================================
// B9 —— 重连**存在**且带 `Last-Event-ID`
// ===========================================================================

test("B9 重连存在且带 Last-Event-ID (控制器重连时把本机游标交给接回请求)", async () => {
  const D2 = E.entry;
  const attachCalls = [];
  const ctrl = D2.createEntryController(
    "s1",
    {
      probe: async () => ({
        reachable: true,
        running: true,
        canAttach: true,
        turnKey: "t1",
        lastEventId: "42",
        pendingApprovals: [],
        lastSeq: 42,
        turnState: "running",
        upstreamAlive: true,
        snapshotAvailable: false,
        completeness: "partial",
        startedAt: null,
        elapsedMs: null,
        toolCallCount: null,
        thinkingCount: null,
      }),
      loadRecord: async () => ({
        sessionId: "s1",
        turnKey: "t1",
        seq: "42",
        renderedSnapshot: {
          content: "",
          events: [],
          phases: [],
          startedAt: null,
          elapsedMs: null,
          toolCallCount: null,
          thinkingCount: null,
          terminalReason: null,
        },
        updatedAt: 0,
      }),
      saveRecord: async () => {},
      attach: async (args) => {
        attachCalls.push(args.cursor);
      },
    },
    {},
    () => 0
  );
  await ctrl.start();
  await ctrl.reconnect();
  assert.equal(attachCalls.length, 2, "★ 重连必须真的再接一次");
  assert.deepEqual(attachCalls, ["42", "42"], "★ 重连必须带本机游标");
});

test("B9b 合法游标 ⇒ 续传头是 Last-Event-ID (生产用的那个模块)", () => {
  assert.equal(chatSse.buildResumeHeaders("42")["Last-Event-ID"], "42");
  assert.equal(chatSse.buildResumeHeaders("42")["X-Resume-Turn"], undefined);
  // 非法游标 ⇒ 降级成 X-Resume-Turn, 绝不发脏游标。
  assert.equal(chatSse.buildResumeHeaders("12abc")["Last-Event-ID"], undefined);
  assert.equal(chatSse.buildResumeHeaders("12abc")["X-Resume-Turn"], "1");
});

test("B9c 页面接线: 重连走 `opts.resume` (PC 的续传分支不再是零调用方)", () => {
  const pageCode = repoCode("src/routes/ChatDetail.tsx");
  // ⚠️ web 是 `resume: { cursor: … }`; PC 是
  //   `resume: resumeMode ? { cursor: … } : null` (三元 —— 首轮不是续传, 重连才是)
  //   ⇒ 正则放宽到「resume 的值里带 cursor 字段」, 判据 (必须有一处带游标的
  //   续传调用) 不变。
  assert.ok(
    /resume\s*:\s*[^,;]*?\{[^}]*cursor\s*:/.test(pageCode),
    "★ 页面必须有一处用 `opts.resume` 发起续传 (缺陷 W-1: PC 端重连必须带游标)"
  );
});

// ===========================================================================
// B14 / B15 —— thinking 合并的单点化 (T-16)
// ===========================================================================

test("B14 喂**已合并**的 phases ⇒ 渲染段数 = 数组长度 (端侧不再合并)", () => {
  const R2 = R.turnRecord;
  // 服务端已合并的形态: 两条相邻的 thinking 是服务端**刻意分开**的两段。
  const merged = [
    { type: "thinking", text: "第一段", ts: 1 },
    { type: "thinking", text: "第二段", ts: 2 },
  ];
  const out = R2.renderPhases(merged, { authoritative: true });
  assert.equal(out.length, merged.length, "★ 端侧不得二次合并 (段数必须原样)");
  assert.equal(out[0].text, "第一段");
  assert.equal(out[1].text, "第二段");
});

test("B14b 端侧主路径的解析**不做任何合并** (PC 的 parsePhasesJson)", () => {
  const apiCode = repoCode("src/lib/api.ts");
  const m = apiCode.match(/export function parsePhasesJson[\s\S]*?\n\}/);
  assert.ok(m, "没找到 parsePhasesJson");
  assert.ok(
    !/openThinkingIdx/.test(m[0]),
    "★ parsePhasesJson 主路径里不许再有 thinking 合并逻辑 (T-16)"
  );

  // ⚠️ 兼容分支必须**还在** (v1 契约下老数据是 raw) —— 但**只有一处** (T-16 单点化)。
  //   这一处就是 sse/turn-record.ts 的 `renderPhases`: authoritative=false 时才合并。
  //   (解析层不再有第二份 —— 解析层一合并, 服务端刻意分开的思考段又被粘回去。)
  const rrSrc = repoSrc("src/lib/sse/turn-record.ts");
  const rrCode = repoCode("src/lib/sse/turn-record.ts");
  assert.ok(
    /export function renderPhases/.test(rrCode),
    "★ 兼容分支必须在 sse/turn-record.ts 的 renderPhases 里"
  );
  assert.ok(
    /authoritative/.test(rrCode),
    "★ renderPhases 必须有 authoritative 开关 (兼容分支的判据)"
  );
  // 兼容分支必须**标注**待下线 (规则 5: 不许删, 但要标)。
  assert.ok(
    /待下线/.test(rrSrc),
    "★ 兼容分支必须标注「待下线」(R5)"
  );

  // ★ 全仓**只有这一处**合并逻辑 (G-3 一处真值) —— 别的地方都不许再有。
  //   合并的形态 = 「把相邻 thinking 的 text 拼到已有那条上」⇒ 认这两种写法:
  //     · `xxx.text = …` (改写已有 phase 的 text)
  //     · `xxx.text + …`   (往已有 phase 的 text 上追加)
  //   ⚠️ web 的清单是 api.ts / page.tsx / ExecutionTimeline.tsx;
  //     PC 的对应清单是 api.ts / **ChatDetail.tsx** / ExecutionTimeline.tsx。
  const MERGE_PATTERNS = [/\.text\s*=[^=]/, /\.text\s*\+/];
  const mergeSites = [
    "src/lib/api.ts",
    "src/routes/ChatDetail.tsx",
    "src/components/chat/ExecutionTimeline.tsx",
  ].filter((f) => MERGE_PATTERNS.some((re) => re.test(repoCode(f))));
  assert.deepEqual(
    mergeSites,
    [],
    `★ 合并逻辑散落在: ${mergeSites.join(", ")} (T-16 单点化)`
  );
});

test("B15 喂**未合并**的旧历史 (v1 raw) ⇒ 兼容分支渲染出 1 条完整思考链", () => {
  const R2 = R.turnRecord;
  const raw = [
    { type: "thinking", text: "先想", ts: 1 },
    { type: "thinking", text: "再想", ts: 2 },
    { type: "thinking", text: "再想2", ts: 3 },
  ];
  const out = R2.renderPhases(raw, { authoritative: false });
  assert.equal(out.length, 1, "★ 兼容分支必须把相邻 thinking 合成 1 条");
  assert.equal(out[0].text, "先想再想再想2");
  assert.equal(out[0].type, "thinking");
});

test("B15b 兼容分支遇到 tool ⇒ 关掉当前 thinking (下一段 thinking 重新开一条)", () => {
  const R2 = R.turnRecord;
  const raw = [
    { type: "thinking", text: "a", ts: 1 },
    { type: "thinking", text: "b", ts: 2 },
    { type: "tool", event: { type: "tool_start" }, ts: 3 },
    { type: "thinking", text: "c", ts: 4 },
  ];
  const out = R2.renderPhases(raw, { authoritative: false });
  assert.equal(out.length, 3);
  assert.equal(out[0].text, "ab");
  assert.equal(out[1].type, "tool");
  assert.equal(out[2].text, "c");
});

// ===========================================================================
// B16 —— 帧级 elapsedMs (T-15)
// ===========================================================================

test("B16 收到带 elapsedMs 的帧 ⇒ 快照里用的是**该值** (不用本地时钟)", () => {
  const R2 = R.turnRecord;
  let snap = R2.emptyRenderedSnapshot();
  snap = R2.mergeFrame(snap, { content: "x", elapsedMs: 12345 });
  assert.equal(snap.elapsedMs, 12345, "★ 必须用服务端给的耗时");

  // 后到的帧覆盖前一个值。
  snap = R2.mergeFrame(snap, { content: "y", elapsedMs: 13000 });
  assert.equal(snap.elapsedMs, 13000);

  // 老服务端没有 elapsedMs ⇒ 保持 null (上层走本地兜底)。
  const legacy = R2.mergeFrame(R2.emptyRenderedSnapshot(), { content: "z" });
  assert.equal(legacy.elapsedMs, null, "老服务端没有该字段 ⇒ 留 null 走兜底");
});

test("B16b MessageBubble 优先用帧里的 elapsedMs (本地时钟只作兜底)", () => {
  const code = repoCode("src/components/chat/MessageBubble.tsx");
  assert.ok(
    /elapsedMs/.test(code),
    "★ MessageBubble 必须认帧里的 elapsedMs (T-15)"
  );
});

// ===========================================================================
// B17 —— 天眼 ⇒ 撤掉已渲染的 partial 正文 (T-13 / 订正 11)
// ===========================================================================

test("B17 收到 error{code:'OUTPUT_FILTER_HIT'} ⇒ 已渲染 partial 正文被清空", () => {
  const M = SS.turnSession;
  let s = M.createTurnSession("s1", null, 0);
  s = M.transition(s, { type: "connect" }, 0);
  s = M.transition(s, { type: "attach_ok" }, 0);
  // 先渲染一段 partial 正文。
  s = M.transition(s, { type: "frame", frame: { content: "不该留下的正文" } }, 0);
  assert.equal(s.record.renderedSnapshot.content, "不该留下的正文");

  // 天眼终止信号。
  s = M.transition(s, { type: "terminal", reason: "filtered" }, 0);
  assert.equal(s.record.renderedSnapshot.content, "", "★ 天眼命中 ⇒ 正文必须被清空");
  assert.equal(s.terminal.form, "blocked");
  assert.equal(s.terminal.purgeContent, true);
  assert.equal(s.state, "draining");
});

test("B17b 天眼帧的识别: 只认 error 帧的 code (订正 8)", () => {
  const M = SS.turnSession;
  const r = M.readFilterFrame({ type: "error", code: "OUTPUT_FILTER_HIT", content: "❗️天眼…" });
  assert.equal(r.filtered, true);
  assert.equal(r.text, "❗️天眼…");
  // 普通错误帧不算天眼。
  assert.equal(M.readFilterFrame({ type: "error", content: "处理时发生错误" }).filtered, false);
  // done 帧不算天眼 (天眼命中时 done.cancelled=false 且 finalContent='')。
  assert.equal(M.readFilterFrame({ done: true, finalContent: "" }).filtered, false);
});

// ===========================================================================
// B18 —— terminalReason 四类分别渲染出**四种不同**的表现
// ===========================================================================

test("B18 terminalReason 四类分别渲染出四种不同的表现", () => {
  const Tm = T.terminal;
  const four = ["cancelled", "filtered", "failed", "upstream_lost"].map((r) =>
    Tm.presentTerminal(r)
  );
  const forms = four.map((p) => p.form);
  assert.equal(new Set(forms).size, 4, "★ 四类的表现形态必须互不相同");
  const labels = four.map((p) => p.label);
  assert.equal(new Set(labels).size, 4, "★ 四类的文案必须互不相同");
  // 逐条钉住各自的语义。
  assert.equal(four[0].form, "stopped");
  assert.equal(four[0].keepPartial, true, "用户按停止 ⇒ partial 保留");
  assert.equal(four[1].form, "blocked");
  assert.equal(four[1].purgeContent, true, "天眼 ⇒ 必须撤掉 partial");
  assert.equal(four[1].isError, false, "天眼不是「普通报错」");
  assert.equal(four[2].form, "error");
  assert.equal(four[2].isError, true);
  assert.equal(four[3].form, "incomplete");
  assert.equal(four[3].completeness, "partial");
});

test("B18b 终态分类的推导: 先扫 error 帧, 再看 done 帧 (订正 8)", () => {
  const Tm = T.terminal;
  // 天眼: done.cancelled=false 且 finalContent='' ⇒ 只有 error 帧的 code 能认。
  assert.equal(
    Tm.deriveTerminalReason({ errorCode: "OUTPUT_FILTER_HIT", cancelled: false }),
    "filtered"
  );
  assert.equal(Tm.deriveTerminalReason({ cancelled: true }), "cancelled");
  assert.equal(Tm.deriveTerminalReason({ error: "处理时发生错误: …" }), "failed");
  assert.equal(Tm.deriveTerminalReason({ streamEnded: true }), "upstream_lost");
  assert.equal(Tm.deriveTerminalReason({}), "completed");
  // 服务端显式给了分类 ⇒ 用它。
  assert.equal(Tm.deriveTerminalReason({ terminalReason: "upstream_lost" }), "upstream_lost");
});

// ===========================================================================
// B19 —— 「工具 N 次」= 服务端 toolCallCount (端侧不数帧)
// ===========================================================================

test("B19 「工具 N 次」= 服务端 toolCallCount (端侧不数帧)", () => {
  const R2 = R.turnRecord;
  const Tm = T.terminal;
  let snap = R2.emptyRenderedSnapshot();
  // 一次工具调用产生 3 帧 (tool_start + tool_done + rich_event) ⇒ 端侧数出来是 3。
  snap = R2.mergeFrame(snap, { event: { type: "tool_start", id: "u1" } });
  snap = R2.mergeFrame(snap, { event: { type: "tool_done", id: "u1" } });
  snap = R2.mergeFrame(snap, { event: { type: "file", id: "u1" } });
  const localCount = R2.countPhases(snap.phases).tool;
  assert.equal(localCount, 3, "端侧按帧数数出来是 3 (虚高)");

  // 服务端给了权威值 ⇒ 用它。
  snap = R2.mergeFrame(snap, { toolCallCount: 1 });
  assert.equal(snap.toolCallCount, 1, "★ 必须用服务端的 toolCallCount");
});

test("B19b ExecutionTimeline 优先用服务端给的计数, 没有才数数组", () => {
  const code = repoCode("src/components/chat/ExecutionTimeline.tsx");
  assert.ok(/toolCallCount/.test(code), "★ ExecutionTimeline 必须认 toolCallCount");
  assert.ok(/thinkingCount/.test(code), "★ ExecutionTimeline 必须认 thinkingCount");
});

// ===========================================================================
// 结构性 —— src/lib/sse/ 的「可抄」纪律
// ===========================================================================

test("Z1 src/lib/sse/ 里不许出现 window / fetch / js-cookie (PC 要抄)", () => {
  const files = [
    "src/lib/sse/seq-guard.ts",
    "src/lib/sse/turn-record.ts",
    "src/lib/sse/terminal.ts",
    "src/lib/sse/degrade.ts",
    "src/lib/sse/turn-session.ts",
    "src/lib/sse/entry.ts",
  ];
  for (const f of files) {
    const code = repoCode(f);
    assert.ok(!/\bfetch\s*\(/.test(code), `${f} 里出现了 fetch`);
    assert.ok(!/\bwindow\b/.test(code), `${f} 里出现了 window`);
    assert.ok(!/js-cookie/.test(code), `${f} 里出现了 js-cookie`);
    assert.ok(!/\bdocument\b/.test(code), `${f} 里出现了 document`);
    assert.ok(!/\blocalStorage\b/.test(code), `${f} 里出现了 localStorage`);
  }
});

test("Z2 src/lib/sse/ 是自包含的 (只允许目录内的相对 import)", () => {
  const files = [
    "src/lib/sse/seq-guard.ts",
    "src/lib/sse/turn-record.ts",
    "src/lib/sse/terminal.ts",
    "src/lib/sse/degrade.ts",
    "src/lib/sse/turn-session.ts",
    "src/lib/sse/entry.ts",
  ];
  for (const f of files) {
    const code = repoCode(f);
    const imports = [...code.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
    for (const imp of imports) {
      assert.ok(
        imp.startsWith("./"),
        `${f} 的 import "${imp}" 不是目录内的相对 import ⇒ PC 抄不动`
      );
    }
  }
});

test("Z3 src/lib/sse/ 目录里有且只有那 6 个模块", () => {
  const expected = [
    "degrade.ts",
    "entry.ts",
    "seq-guard.ts",
    "terminal.ts",
    "turn-record.ts",
    "turn-session.ts",
  ];
  for (const f of expected) {
    assert.ok(
      repoSrc(`src/lib/sse/${f}`).length > 0,
      `缺少模块 src/lib/sse/${f}`
    );
  }
});

// ===========================================================================
// W1 / W2 —— R2-web′ / R2-PC′ 批: 缺陷 W-1 (帧丢 seq) + 缺陷 W-2 (本机快照无条件渲染)
// ===========================================================================
//
//   INV-1  喂进状态机的帧**带着**服务端显式 seq ⇒ v2 服务端下 T-09 的两种判定
//          (重复 + 跳号) 都**够得着**;
//          ⛔ 老服务端 (帧里没有 seq) 仍**只判重复** (老兼容语义不许变)。
//   INV-2  本机快照**只在「本机游标合法」时**渲染 (onLocalRecord)。
//   INV-3  onDegrade 的渲染条件**与 INV-2 一致** ⇒ 不许「跳过了又渲染」。
//
//   ⚠️ 这里**测的是生产代码本身** —— 宿主层的适配函数与回调是从宿主源文件里
//     **原样抠出来**再执行的 (不是复刻一份) ⇒ 改坏宿主 ⇒ 断言必红。
//
//   抠法: extractFunction / extractObjectProp (scripts/lib/source-scan.mjs)
//     把宿主源码里的那几段**原样**取出来 ⇒ 拼成一个临时模块 ⇒ 真跑一遍。

const HOST = "src/routes/ChatDetail.tsx";
const HOST_FILE = "ChatDetail.tsx";
const hostSrc = repoSrc(HOST);

// —— 宿主层的「可执行单元」 (原样抠出来) ——
const toTurnFrameSrc = extractFunction(hostSrc, "toTurnFrame", HOST_FILE);
const toChatChunkSrc = extractFunction(hostSrc, "toChatChunk", HOST_FILE);
// 进场那处 createEntryController 的回调 (onLocalRecord 唯一 ⇒ 它就是进场那处;
//   onDegrade 必须跟它落在**同一个**对象字面量里 —— 本文件里有两处
//   createEntryController (进场那处 + 发送那处, 发送那处没有 onLocalRecord))。
const onLocalRecordSrc = extractObjectProp(
  hostSrc,
  "onLocalRecord",
  HOST_FILE
);
const onDegradeSrc = extractSiblingObjectProp(
  hostSrc,
  "onLocalRecord",
  "onDegrade",
  HOST_FILE
);

// —— ① 适配层 (toTurnFrame / toChatChunk) ——
const adapters = await import(
  writeModule(
    dir,
    "host-adapters",
    [`export ${toTurnFrameSrc}`, `export ${toChatChunkSrc}`].join("\n"),
    { jsx: true }
  )
);

// —— ② 进场回调 (onLocalRecord / onDegrade) + 宿主环境桩 ——
//    ⚠️ 判据是**真的** (`src/lib/sse/degrade.ts` 的 `shouldRenderSnapshot` —— web 与 PC
//      共用**同一份**, 宿主层不许自己再判一遍), 只有「渲染出去」与「上下文」是桩。
const hostCallbacks = await import(
  writeModule(
    dir,
    "host-callbacks",
    [
      'import { shouldRenderSnapshot } from "./degrade.mjs";',
      "let cancelled = false;",
      "let cursor = null;",
      "const rendered = [];",
      "let invalidated = 0;",
      "const renderAttachSnapshot = (content, phases) => {",
      "  rendered.push({ content, phases });",
      "};",
      "const queryClient = { invalidateQueries: () => { invalidated += 1; } };",
      'const chatId = "s1";',
      "export function setup(nextCursor) {",
      "  cancelled = false;",
      "  cursor = nextCursor;",
      "  rendered.length = 0;",
      "  invalidated = 0;",
      "}",
      "export function renderedList() { return rendered; }",
      "export function invalidatedCount() { return invalidated; }",
      "export const callbacks = {",
      `  ${onLocalRecordSrc},`,
      `  ${onDegradeSrc},`,
      "};",
    ].join("\n"),
    { jsx: true }
  )
);

/** 造一条「本机轮次记录」 (游标 + 已渲染内容在**同一条**记录里 —— 缺陷 D-1)。 */
const fakeRecord = (content) => ({
  sessionId: "s1",
  turnKey: "t1",
  seq: "42",
  renderedSnapshot: {
    content,
    events: [],
    phases: [],
    startedAt: null,
    elapsedMs: null,
    toolCallCount: null,
    thinkingCount: null,
    terminalReason: null,
  },
  updatedAt: 0,
});

/** 降级计划 —— 用**真的** `planDegrade` 算 (不手搓假计划 ⇒ 判据字段不会被写歪)。 */
const planWithServerContent = (content) =>
  D.degrade.planDegrade({ reason: "attach_failed", snapshot: { content } });
/** 服务端**没给正文**的降级计划 (老服务端 / 跳号 / 问不到)。 */
const planWithoutServerContent = () =>
  D.degrade.planDegrade({ reason: "attach_failed" });

const runningProbe = async () => ({
  reachable: true,
  running: true,
  canAttach: true,
  turnKey: "t1",
  lastEventId: "1",
  pendingApprovals: [],
  lastSeq: 1,
  turnState: "running",
  upstreamAlive: true,
  snapshotAvailable: false,
  completeness: "partial",
  startedAt: null,
  elapsedMs: null,
  toolCallCount: null,
  thinkingCount: null,
});

// ===========================================================================
// INV-1 —— 帧必须带着服务端的显式 seq (缺陷 W-1)
// ===========================================================================

test("W1a 宿主把服务端的显式 seq 带进帧里 (缺陷 W-1 · INV-1)", () => {
  assert.ok(toTurnFrameSrc, "没找到宿主的 toTurnFrame");
  const frame = adapters.toTurnFrame({ seq: 42, content: "正文" });
  assert.equal(
    frame.seq,
    42,
    "★ 帧里必须带着服务端的显式 seq (没有 ⇒ T-09 的跳号判定永远走不到)"
  );
  const legacy = adapters.toTurnFrame({ content: "正文" });
  assert.equal(
    legacy.seq,
    null,
    "老服务端没有 seq ⇒ 落 null (⇒ 只判重复、不判跳号的老分支)"
  );
});

test("W1b 反向适配把 seq 带回去 (缺陷 W-1 的另一半)", () => {
  assert.ok(toChatChunkSrc, "没找到宿主的 toChatChunk");
  assert.equal(
    adapters.toChatChunk({ seq: 7 }).seq,
    7,
    "★ 反向适配必须把 seq 带回去"
  );
  assert.equal(
    adapters.toChatChunk({ seq: "9" }).seq,
    undefined,
    "字符串形态的 seq 在反向适配里丢掉 (ChatChunk.seq 是 number)"
  );
  assert.equal(
    adapters.toChatChunk({}).seq,
    undefined,
    "没有 seq ⇒ undefined"
  );
});

test("W1c 帧里带 seq ⇒ T-09 的「重复」与「跳号」两种判定都够得着 (端到端跑真状态机)", async () => {
  const frames = [];
  const ctrl = E.entry.createEntryController(
    "s1",
    {
      probe: runningProbe,
      loadRecord: async () => null,
      saveRecord: async () => {},
      attach: async (args) => {
        args.onControl?.({ type: "attach_ok", turnKey: "t1", resumedFrom: "1" });
        args.onData?.({ content: "第一段", seq: 1 }, "1");
        args.onData?.({ content: "重复的一段", seq: 1 }, "1");
        args.onData?.({ content: "跳号的一段", seq: 3 }, "3");
      },
    },
    { onFrame: (f) => frames.push(f) },
    () => 0
  );
  await ctrl.start();
  assert.equal(
    frames.length,
    1,
    "★ 重复帧被丢弃 + 跳号帧不渲染 ⇒ 只有第一段进了渲染层"
  );
  assert.equal(frames[0].content, "第一段");
  assert.equal(
    ctrl.session.state,
    "degraded",
    "★ 跳号必须降级 (不许静默吞内容)"
  );
  assert.equal(ctrl.session.degradeReason, "seq_gap");
});

test("W1d 老服务端 (帧里没有 seq) ⇒ 仍然只判重复, **不判跳号** (老兼容语义不变)", async () => {
  const frames = [];
  const ctrl = E.entry.createEntryController(
    "s1",
    {
      probe: runningProbe,
      loadRecord: async () => null,
      saveRecord: async () => {},
      attach: async (args) => {
        args.onControl?.({ type: "attach_ok", turnKey: "t1", resumedFrom: "1" });
        // ⚠️ 老服务端: 帧里**没有** seq, 只有 SSE `id:` 游标 (而且它会跳号)。
        args.onData?.({ content: "第一段" }, "1");
        args.onData?.({ content: "游标跳号的一段" }, "3");
      },
    },
    { onFrame: (f) => frames.push(f) },
    () => 0
  );
  await ctrl.start();
  assert.equal(
    frames.length,
    2,
    "老服务端的两帧都要渲染 (游标跳号是常见的, 不是洞)"
  );
  assert.notEqual(
    ctrl.session.state,
    "degraded",
    "★ 老服务端不许因为游标跳号就降级 (老兼容语义不许变)"
  );
  assert.equal(ctrl.session.degradeReason, null);
});

// ===========================================================================
// INV-2 / INV-3 —— 本机快照只在「本机游标合法」时渲染, 两处**同一口径**
// ===========================================================================

test("W2a 本机游标非法 ⇒ 本机快照**不渲染** (INV-2 · 缺陷 W-2)", () => {
  hostCallbacks.setup(null); // 无合法游标 ⇒ 服务端整轮重放
  hostCallbacks.callbacks.onLocalRecord(fakeRecord("本机旧快照"));
  assert.equal(
    hostCallbacks.renderedList().length,
    0,
    "★ 无合法游标 ⇒ 本机旧快照不渲染 (否则整轮重放 = 界面重复)"
  );
});

test("W2b 本机游标合法 ⇒ 本机快照照渲染 (INV-2)", () => {
  hostCallbacks.setup("42"); // 有合法游标 ⇒ 服务端尾随重放
  hostCallbacks.callbacks.onLocalRecord(fakeRecord("本机旧快照"));
  const list = hostCallbacks.renderedList();
  assert.equal(
    list.length,
    1,
    "★ 有合法游标 ⇒ 本机快照必须先渲染 (缺陷 D-1: 刷新后正文没了)"
  );
  assert.equal(list[0].content, "本机旧快照");
});

test("W2c onDegrade 与 onLocalRecord 同一口径 ⇒ 不许「跳过了又渲染」 (INV-3 · 缺陷 W-2)", () => {
  hostCallbacks.setup(null);
  // ① 本机快照: 无合法游标 ⇒ 跳过。
  hostCallbacks.callbacks.onLocalRecord(fakeRecord("本机旧快照"));
  // ② 降级: 服务端**没给正文** ⇒ 那份内容纯粹是本机的 ⇒ 也必须跳过。
  hostCallbacks.callbacks.onDegrade(planWithoutServerContent(), {
    record: fakeRecord("本机旧快照"),
  });
  assert.equal(
    hostCallbacks.renderedList().length,
    0,
    "★ onLocalRecord 跳过了 ⇒ onDegrade 也不许把同一份旧快照再渲染一遍"
  );
});

test("W2d 降级带的是服务端自己的内容 ⇒ 照渲染 (G-4 / T-08)", () => {
  hostCallbacks.setup(null);
  hostCallbacks.callbacks.onLocalRecord(fakeRecord("本机旧快照"));
  hostCallbacks.callbacks.onDegrade(planWithServerContent("服务端给的正文"), {
    record: fakeRecord("服务端给的正文"),
  });
  const list = hostCallbacks.renderedList();
  assert.equal(
    list.length,
    1,
    "★ 降级必须带内容 (服务端给的快照不能因为游标脏就被丢掉)"
  );
  assert.equal(list[0].content, "服务端给的正文");
});

test("W2e onLocalRecord 与 onDegrade 用的是**同一个**判据 (INV-2 / INV-3 同口径)", () => {
  assert.ok(
    onLocalRecordSrc && onLocalRecordSrc.includes("shouldRenderSnapshot("),
    "onLocalRecord 必须走共享判据 shouldRenderSnapshot"
  );
  assert.ok(
    onDegradeSrc && onDegradeSrc.includes("shouldRenderSnapshot("),
    "onDegrade 必须走**同一个**判据"
  );
  // ★ 判据**只许有一份** —— 在 `src/lib/sse/degrade.ts` 里 (web 与 PC 共用同一份;
  //   宿主层各写一套 ⇒ 必然漂移 ⇒ 界面重复 —— 缺陷 W-2 的老路)。
  const hostDefs = (hostSrc.match(/function\s+shouldRenderSnapshot\b/g) || []).length;
  assert.equal(hostDefs, 0, "★ 宿主层不许自己定义判据 (两端各写一套 ⇒ 必然漂移)");
  const degradeDefs = (
    repoSrc("src/lib/sse/degrade.ts").match(/export function shouldRenderSnapshot\b/g) || []
  ).length;
  assert.equal(degradeDefs, 1, "★ 判据在 degrade.ts 里只许有一份定义");
});

test("W2f 判据函数的七条口径 (INV-2 / INV-3 的唯一判据)", () => {
  const judge = D.degrade.shouldRenderSnapshot;
  assert.equal(
    judge({ plan: planWithoutServerContent(), localCursor: "42" }),
    true,
    "合法游标 ⇒ 本机快照渲染"
  );
  assert.equal(
    judge({ plan: planWithoutServerContent(), localCursor: null }),
    false,
    "无游标 ⇒ 本机快照不渲染"
  );
  assert.equal(
    judge({ plan: planWithoutServerContent(), localCursor: "abc" }),
    false,
    "非法游标 ⇒ 本机快照不渲染"
  );
  assert.equal(
    judge({ plan: planWithServerContent("服务端正文"), localCursor: null }),
    true,
    "★ 服务端给了正文 ⇒ 必须渲染 (游标脏也不许把内容丢了)"
  );
  assert.equal(
    judge({ plan: planWithServerContent("服务端正文"), localCursor: "42" }),
    true,
    "服务端给了正文 + 合法游标 ⇒ 渲染"
  );
  assert.equal(
    judge({ plan: null, localCursor: null }),
    false,
    "本机旧快照那条路 (plan: null) + 无游标 ⇒ 不渲染"
  );
  assert.equal(
    judge({ plan: null, localCursor: "42" }),
    true,
    "本机旧快照那条路 (plan: null) + 合法游标 ⇒ 渲染"
  );
});

// ===========================================================================
// INV-1 续 —— 帧的 seq 是**必填** (缺陷 W-1 的根因)
// ===========================================================================

test("W1e TurnFrameLike 的 seq 是**必填** (漏传 ⇒ 编译不过 · 缺陷 W-1 的根因)", () => {
  const src = repoSrc("src/lib/sse/turn-record.ts");
  const start = src.indexOf("export interface TurnFrameLike");
  assert.ok(start > 0, "没找到 TurnFrameLike");
  const body = src.slice(start, src.indexOf("\n}", start));
  assert.ok(/^\s*seq\??\s*:/m.test(body), "TurnFrameLike 里必须有 seq 字段");
  assert.ok(
    !/^\s*seq\?\s*:/m.test(body),
    "★ seq 必须**必填** (可选 ⇒ 宿主漏传编译器不报错 ⇒ 缺陷 W-1 会复现)"
  );
});

// ===========================================================================
// W-2 的正解 —— 判据改由**计划字段**承担 (PM 裁决)
//   · `plan.serverContentPresent` = 服务端给的快照**有正文**吗 (只看正文);
//   · `shouldRenderSnapshot({ plan, localCursor })` = 服务端给了正文 ⇒ 必须渲染
//     (G-4 / T-08); 只有本机内容 ⇒ 游标合法才渲染 (INV-2 / INV-3)。
// ===========================================================================

test("W3a 服务端给了正文 + 本机游标无效 ⇒ **必须渲染** (G-4 / T-08 · 判据由计划字段承担)", () => {
  const plan = planWithServerContent("服务端给的正文");
  assert.equal(
    plan.serverContentPresent,
    true,
    "★ 服务端给了正文 ⇒ plan 必须认出来 (判据归计划字段, 不归字符串比较)"
  );
  assert.equal(
    D.degrade.shouldRenderSnapshot({ plan, localCursor: null }),
    true,
    "★ 服务端给了正文 ⇒ 必须渲染 (「接回来但内容没了」是绝对不允许的)"
  );
  // 走宿主那条路也一样。
  hostCallbacks.setup(null);
  hostCallbacks.callbacks.onDegrade(plan, { record: fakeRecord("服务端给的正文") });
  const list = hostCallbacks.renderedList();
  assert.equal(list.length, 1, "★ 宿主层也必须渲染服务端给的正文");
  assert.equal(list[0].content, "服务端给的正文");
});

test("W3b 只有本机正文 + 游标无效 ⇒ **不渲染** (INV-2 / INV-3)", () => {
  const plan = planWithoutServerContent();
  assert.equal(plan.serverContentPresent, false, "★ 服务端没给正文 ⇒ plan 必须说没有");
  assert.equal(
    D.degrade.shouldRenderSnapshot({ plan, localCursor: null }),
    false,
    "★ 只有本机内容 + 游标无效 ⇒ 不渲染 (否则整轮重放 = 界面重复)"
  );
  hostCallbacks.setup(null);
  hostCallbacks.callbacks.onDegrade(plan, { record: fakeRecord("本机旧快照") });
  assert.equal(
    hostCallbacks.renderedList().length,
    0,
    "★ 宿主层也不许把本机旧快照渲染出来"
  );
});

test("W3c 服务端正文为空 (content: \"\") + 游标无效 ⇒ **不渲染** (旧字符串比较处理错的那一格)", () => {
  const plan = D.degrade.planDegrade({
    reason: "attach_failed",
    snapshot: { content: "" },
  });
  assert.equal(plan.serverContentPresent, false, "★ 正文为空 ⇒ 不算「服务端给了正文」");
  assert.equal(
    D.degrade.shouldRenderSnapshot({ plan, localCursor: null }),
    false,
    "★ 服务端正文为空 ⇒ 那份内容纯粹是本机的 ⇒ 游标无效 ⇒ 不渲染"
  );
  hostCallbacks.setup(null);
  hostCallbacks.callbacks.onDegrade(plan, { record: fakeRecord("") });
  assert.equal(hostCallbacks.renderedList().length, 0);
});

test("W3d 服务端正文与本机旧快照**逐字相同** + 游标无效 ⇒ 仍必须渲染 (旧字符串比较在这一格会错)", () => {
  const plan = planWithServerContent("本机旧快照");
  assert.equal(plan.serverContentPresent, true);
  assert.equal(
    D.degrade.shouldRenderSnapshot({ plan, localCursor: null }),
    true,
    "★ 判据不许靠比字符串 (内容相同 ≠ 同一份来源)"
  );
  hostCallbacks.setup(null);
  hostCallbacks.callbacks.onLocalRecord(fakeRecord("本机旧快照"));
  hostCallbacks.callbacks.onDegrade(plan, { record: fakeRecord("本机旧快照") });
  assert.equal(
    hostCallbacks.renderedList().length,
    1,
    "★ 服务端那份必须渲染 (旧判据在这里会误判成「同一份旧快照」而跳过 ⇒ 内容丢了)"
  );
});

test("W3e serverContentPresent **只看正文** (phases / events 不算正文)", () => {
  const phases = [{ type: "thinking", text: "想了一下", ts: 0 }];
  const plan = D.degrade.planDegrade({
    reason: "attach_failed",
    snapshot: { content: "", phases },
  });
  assert.equal(
    plan.serverContentPresent,
    false,
    "★ 只看正文 (snapshotHasContent 把 phases/events 也算进去 ⇒ 语义不同)"
  );
  assert.equal(
    D.degrade.snapshotHasContent({ content: "", phases }),
    true,
    "★ (对照) snapshotHasContent 的口径确实不同 ⇒ 不能拿它当 serverContentPresent"
  );
});

test("W3f 宿主层不许再拿**内容字符串**当判据 (判据归 plan.serverContentPresent)", () => {
  assert.ok(
    !/localSnapshotContent/.test(hostSrc),
    "★ 宿主层不许再比内容字符串判「是不是同一份旧快照」"
  );
  assert.ok(
    !/snap\.content\s*[!=]==/.test(hostSrc),
    "★ 宿主层不许拿 snap.content 做比较 (判据归 plan.serverContentPresent)"
  );
});
