// [2026-11-14 · 订正 28 · L-28r] PC 端「**补充边界**」—— 把这一轮切开
//
// ---------------------------------------------------------------------------
// 需求（PM 2026-11-14 真机报障）
// ---------------------------------------------------------------------------
//   用户在 agent 跑的时候补了一句话（插队）⇒ **功能是通的**（agent 读到了补充
//   并接着回答），但**排版不对**：
//
//     现状（错）：[回答 A1 + 回答补充的那段 A2 —— 并成同一条 assistant 气泡]
//                  [用户的补充气泡]            ← 排在回答下面
//     期望（对）：[回答 A1 —— 一个气泡]
//                  [用户的补充 —— 自己的气泡]
//                  [回答补充的那段 A2 —— 又一个气泡]
//
//   ⇒ **后端不需要新一轮**（还是同一个 turn、同一把 SSE 流）⇒ 只是前端要有「区隔」。
//
// ---------------------------------------------------------------------------
// 服务端契约（**已上线**）
// ---------------------------------------------------------------------------
//   SSE 里多一个**顶层字段**（沿用 a4 `deletedDeliverables` 的路子）：
//
//     { "supplementBoundary": { "id": "<收件箱行 id>",
//                              "kind": "user_supplement|work_unit_result",
//                              "fromKind": "user|work_unit|agent",
//                              "content": "<补充正文>" } }
//
//   · 这是**无内容帧**（没有 content/thinking/done…）⇒ 端侧认**顶层字段**；
//   · 语义：「**这里**插进来一条补充」⇒ ① 正在流式的气泡**收尾**
//     + ② **另起一个新气泡**给后面的续答 + ③ 补充那条**按自己的角色**渲染。
//
// ---------------------------------------------------------------------------
// 覆盖断言
// ---------------------------------------------------------------------------
//   GC-P28-S1  帧归一层**保留** `supplementBoundary`（不许当「不认识的帧」丢掉）
//   GC-P28-S2  认帧：顶层字段认得出来（形状不对 ⇒ null，不误伤别的帧）
//   GC-P28-S3  收到该帧 ⇒ 当前气泡**收尾** + 插入补充气泡 + 续答进**新**气泡
//   GC-P28-S4  补充气泡 id = `supplement:<inboxId>`（**合成 id**）
//   GC-P28-S5  历史行按 `metadata.inbox_id` 映射成**同一** id（刷新后不重复）
//   GC-P28-S6  端侧接线：切在**流式气泡之前** + 边界帧**在状态机之前**认
//
// 运行: node --test test/session-supplement-split.test.mjs  (完全离线, 不渲染 React)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { makeTmpDir, writeModule } from "../scripts/lib/schedule-loader.mjs";
import { stripComments } from "../scripts/lib/strip-comments.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");
// ⚠️ 本仓源码是 **CRLF** ⇒ 断言里的 `\n` 匹配不上 ⇒ 统一归一成 LF。
const repoCode = (p) => stripComments(repoSrc(p), p).replace(/\r\n/g, "\n");

const SUPPLEMENT_LIB = "src/lib/supplement-boundary.ts";
const CHAT_SSE = "src/lib/chat-sse.ts";
const API = "src/lib/api.ts";
const DETAIL = "src/routes/ChatDetail.tsx";

const dir = makeTmpDir("verify-supplement-split");

// ---------------------------------------------------------------------------
// 加载生产模块
// ---------------------------------------------------------------------------
// ⚠️ `supplement-boundary.ts` **零运行时 import**（只有两个 `import type`）
//   ⇒ 直接加载即可。
const supplement = await import(
  writeModule(dir, "supplement-boundary", repoSrc(SUPPLEMENT_LIB))
);
const {
  parseSupplementBoundary,
  isSupplementBoundaryFrame,
  supplementRowId,
  supplementRole,
  planSupplementCut,
  SUPPLEMENT_ROW_ID_PREFIX,
} = supplement;

// 帧归一层（`normalizeChatChunk`）—— 需要它的两个间接依赖（桩件 + 真源码）。
{
  // ⚠️ `src/lib/notifications-sse.ts` 整体 import 了 react / react-router ⇒ 运行时
  //   加载不了 ⇒ 用仓库已有的 `scripts/lib/source-scan.mjs` 把**纯逻辑**那两块
  //   (SseFrameParser + parseSseFrame) 抠出来落成桩模块（抠的是真源码）。
  const { extractDecl, extractFunction } = await import(
    "../scripts/lib/source-scan.mjs"
  );
  const nsSrc = repoSrc("src/lib/notifications-sse.ts");
  const parserDecl = extractDecl(nsSrc, "SseFrameParser", "src/lib/notifications-sse.ts");
  const parseFn = extractFunction(nsSrc, "parseSseFrame", "src/lib/notifications-sse.ts");
  assert.ok(parserDecl, "从 src/lib/notifications-sse.ts 里抠不出 SseFrameParser");
  assert.ok(parseFn, "从 src/lib/notifications-sse.ts 里抠不出 parseSseFrame");
  writeModule(dir, "notifications-sse", `${parserDecl}\n\n${parseFn}\n`);
}
writeModule(dir, "rich-events", repoSrc("src/lib/rich-events.ts"));
writeModule(dir, "turn-key-header", repoSrc("src/lib/sse/turn-key-header.ts"));
const chatSse = await import(
  writeModule(dir, "chat-sse", repoSrc(CHAT_SSE), {
    rewriteImports: [
      ["notifications-sse", "./notifications-sse.mjs"],
      ["rich-events", "./rich-events.mjs"],
      ["sse/turn-key-header", "./turn-key-header.mjs"],
    ],
  })
);
const { normalizeChatChunk } = chatSse;

// ===========================================================================
// GC-P28-S1 · 帧归一层**保留** `supplementBoundary`
// ===========================================================================

test("GC-P28-S1 归一层不许把 supplementBoundary 当「不认识的帧」丢掉", () => {
  const frame = {
    supplementBoundary: {
      id: "inbox-42",
      kind: "user_supplement",
      fromKind: "user",
      content: "另外把第三段也跑一下",
    },
  };
  const out = normalizeChatChunk(frame);
  assert.ok(
    out.supplementBoundary,
    "★ 归一层必须**保留** supplementBoundary（顶层字段）—— 丢了这一帧，补充就永远不会出现",
  );
  assert.equal(out.supplementBoundary.id, "inbox-42");
  assert.equal(out.supplementBoundary.fromKind, "user");
  assert.equal(out.supplementBoundary.content, "另外把第三段也跑一下");
  // ⛔ 这一帧是**无内容帧** ⇒ 归一层不许给它塞出正文 / 终态标记。
  assert.equal(out.content, undefined, "⛔ 补充边界帧不许被归一成正文帧");
  assert.equal(out.done, undefined, "⛔ 补充边界帧不许被归一成终态帧");
});

test("GC-P28-S1b 老帧（没有这个字段）⇒ 归一层行为逐字不变", () => {
  const out = normalizeChatChunk({ content: "甲" });
  assert.equal(out.content, "甲");
  assert.equal(out.supplementBoundary, undefined, "老帧不该凭空长出这个字段");
});

// ===========================================================================
// GC-P28-S2 · 认帧（顶层字段）
// ===========================================================================

test("GC-P28-S2 认得出「补充边界」帧；形状不对 ⇒ null（不误伤别的帧）", () => {
  const sb = parseSupplementBoundary({
    supplementBoundary: {
      id: 42,
      kind: "work_unit_result",
      fromKind: "work_unit",
      content: "后台任务回报",
    },
  });
  assert.ok(sb, "★ 顶层字段认不出来");
  assert.equal(sb.id, "42", "id 统一成字符串（服务端可能给数字）");
  assert.equal(sb.kind, "work_unit_result");
  assert.equal(sb.fromKind, "work_unit");
  assert.equal(sb.content, "后台任务回报");

  // ⛔ 不是这一帧 ⇒ null（调用方按原样处理）。
  assert.equal(parseSupplementBoundary({ content: "普通正文" }), null);
  assert.equal(parseSupplementBoundary({ supplementBoundary: "不是对象" }), null);
  assert.equal(parseSupplementBoundary(null), null);
  assert.equal(parseSupplementBoundary(undefined), null);
  assert.equal(parseSupplementBoundary([1, 2, 3]), null);
  assert.equal(isSupplementBoundaryFrame({ content: "x" }), false);
  assert.equal(isSupplementBoundaryFrame({ supplementBoundary: {} }), true);
});

// ===========================================================================
// GC-P28-S3 · 切一刀：收尾 + 插补充 + 续答进新气泡
// ===========================================================================

test("GC-P28-S3 收到该帧 ⇒ 当前气泡收尾 + 插入补充气泡 + 续答进新气泡", () => {
  const sb = parseSupplementBoundary({
    supplementBoundary: {
      id: "inbox-42",
      kind: "user_supplement",
      fromKind: "user",
      content: "另外把第三段也跑一下",
    },
  });
  const now = 1_700_000_000_000;
  const plan = planSupplementCut({
    boundary: sb,
    now,
    segment: {
      content: "回答 A1",
      richEvents: [],
      phases: [],
      startedAt: now - 5_000,
      finishedAt: null,
      elapsedMs: null,
      turnKey: "tk_1",
    },
  });

  // ① 当前气泡**收尾**（正文搬过去 + 结束时刻落上）。
  assert.equal(plan.closedSegment.kind, "assistant");
  assert.equal(plan.closedSegment.content, "回答 A1", "★ 前半截回答必须搬进收尾那条");
  assert.equal(plan.closedSegment.finishedAt, now, "★ 收尾 ⇒ finishedAt 落上");
  assert.equal(plan.closedSegment.turnKey, "tk_1", "★ 轮次身份跟着搬过去");
  assert.ok(
    plan.closedSegment.id !== plan.supplementRow.id,
    "★ 收尾那条与补充那条**不是同一条**（两个气泡）",
  );

  // ② 补充那条**按自己的角色**渲染成一个气泡（正文用 content）。
  assert.equal(plan.supplementRow.kind, "supplement");
  assert.equal(plan.supplementRow.role, "user", "★ fromKind=user ⇒ 用户气泡");
  assert.equal(plan.supplementRow.content, "另外把第三段也跑一下");
  // 后台任务回报 ⇒ 助手气泡（气泡角色 ≠ 注入上下文角色，契约 D2）。
  assert.equal(supplementRole("work_unit"), "assistant");
  assert.equal(supplementRole("agent"), "assistant");
  assert.equal(supplementRole(null), "assistant");
});

test("GC-P28-S3b 续答进**新**气泡（切点之后的正文不跟前半截混在一起）", () => {
  const sb = parseSupplementBoundary({
    supplementBoundary: { id: "inbox-1", fromKind: "user", content: "补充" },
  });
  const plan = planSupplementCut({
    boundary: sb,
    now: 1000,
    segment: {
      content: "A1",
      richEvents: [],
      phases: [],
      startedAt: 0,
      finishedAt: null,
      elapsedMs: null,
      turnKey: null,
    },
  });
  // 切完之后的正文是**新**气泡的内容 ⇒ 端侧把流式累积归零。
  //   断言「归零后新正文不跟 A1 混在一起」：归零动作在 ChatDetail 里做，
  //   这里断言判据本身：收尾那条的内容**只有** A1。
  assert.equal(plan.closedSegment.content, "A1");
  assert.notEqual(plan.closedSegment.content, "A1A2");
});

// ===========================================================================
// GC-P28-S4 · 补充气泡 id = `supplement:<inboxId>`
// ===========================================================================

test("GC-P28-S4 补充气泡 id = `supplement:<inboxId>`（合成 id）", () => {
  assert.equal(SUPPLEMENT_ROW_ID_PREFIX, "supplement:");
  assert.equal(supplementRowId("inbox-42"), "supplement:inbox-42");
  assert.equal(supplementRowId(null), "supplement:");
  const sb = parseSupplementBoundary({
    supplementBoundary: { id: "inbox-42", fromKind: "user", content: "补充" },
  });
  const plan = planSupplementCut({
    boundary: sb,
    now: 1,
    segment: {
      content: "",
      richEvents: [],
      phases: [],
      startedAt: null,
      finishedAt: null,
      elapsedMs: null,
      turnKey: null,
    },
  });
  assert.equal(
    plan.supplementRow.id,
    "supplement:inbox-42",
    "★ 直播时插的那条补充气泡 id = `supplement:<inboxId>`",
  );
});

// ===========================================================================
// GC-P28-S5 · 历史行按 `metadata.inbox_id` 映射成**同一** id（刷新后不重复）
// ===========================================================================

test("GC-P28-S5 历史行（metadata.inbox_id）⇒ 同一个合成 id", async () => {
  // 加载 api.ts（真源码）⇒ 用桩 fetch 打一发 getHistory。
  writeModule(dir, "notifications", repoSrc("src/lib/notifications.ts"));
  writeModule(dir, "client-capabilities", repoSrc("src/lib/client-capabilities.ts"));
  const api = await import(
    writeModule(dir, "api", repoSrc(API), {
      rewriteImports: [
        ["rich-events", "./rich-events.mjs"],
        ["sse/turn-key-header", "./turn-key-header.mjs"],
        ["notifications", "./notifications.mjs"],
        ["client-capabilities", "./client-capabilities.mjs"],
      ],
    })
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ok: true,
        data: {
          items: [
            {
              id: "101",
              role: "user",
              content: "补充：另外把第三段也跑一下",
              created_at: "2026-11-14T10:00:00.000Z",
              metadata: { source: "session_inbox", inbox_id: "inbox-42" },
            },
            {
              id: "102",
              role: "assistant",
              content: "普通回答",
              created_at: "2026-11-14T10:00:01.000Z",
              metadata: { turnKey: "tk_1" },
            },
          ],
          next_cursor: null,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  try {
    const r = await api.getHistory("sess-1");
    const supplementRow = r.messages.find((m) => m.id === "101");
    assert.ok(supplementRow, "取不到那条补充行");
    assert.equal(
      supplementRow.inboxId,
      "inbox-42",
      "★ 历史行必须把 `metadata.inbox_id` 解析出来（端侧靠它算合成 id）",
    );
    // ★ 直播时插的那条 id 跟它**同一个** ⇒ 同一条补充只显示一遍。
    assert.equal(
      supplementRowId(supplementRow.inboxId),
      "supplement:inbox-42",
      "★ 历史行映射出来的 id 必须跟直播时插的那条一致",
    );
    // 普通行**没有** inbox_id ⇒ id 照旧（行为不变）。
    const plain = r.messages.find((m) => m.id === "102");
    assert.equal(plain.inboxId, undefined, "普通行不该有 inboxId");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ===========================================================================
// GC-P28-S6 · 端侧接线（ChatDetail）
// ===========================================================================

test("GC-P28-S6a 边界帧**在状态机之前**认（不许被幂等判据丢掉）", () => {
  const code = repoCode(DETAIL);
  const turnChunkIdx = code.indexOf("const onTurnChunk =");
  assert.ok(turnChunkIdx > 0, "抠不到 onTurnChunk");
  const chunkFn = code.slice(turnChunkIdx, turnChunkIdx + 4000);
  const sbIdx = chunkFn.indexOf("parseSupplementBoundary");
  assert.ok(sbIdx > 0, "★ onTurnChunk 必须认 supplementBoundary（顶层字段）");
  const dispatchIdx = chunkFn.indexOf('ctrl.dispatch({\n            type: "frame"');
  assert.ok(dispatchIdx > 0, "抠不到 onTurnChunk 里的状态机 dispatch");
  assert.ok(
    sbIdx < dispatchIdx,
    "★ 补充边界帧必须**在状态机 dispatch 之前**认 —— 它没有内容、老服务端下还不带" +
      "`id:` 行 ⇒ 会被判成「重复帧」丢掉 ⇒ 补充就插不进来",
  );
  // 认到之后照样交给状态机记一笔账（游标/seq 该推进还是要推进）。
  assert.ok(
    /parseSupplementBoundary[\s\S]{0,600}ctrl\.dispatch\(/.test(chunkFn),
    "★ 边界帧也要交给状态机记账（不许把游标/seq 落下）",
  );
});

test("GC-P28-S6b 切开的补充气泡插在**流式气泡之前**（顺序 = [A1][补充][A2]）", () => {
  const code = repoCode(DETAIL);
  // 「切开的气泡」必须排在流式行**前面** ⇒ 拼装时先拼切开的、再拼流式行。
  assert.ok(
    /const withCutRows: ChatMessageModel\[\] = \[/.test(code),
    "★ 必须有「切开的气泡」这一组（withCutRows）",
  );
  const memoIdx = code.indexOf("const withCutRows: ChatMessageModel[] = [");
  const memo = code.slice(memoIdx, memoIdx + 4000);
  const cutIdx = memo.indexOf("...cutRows.map(");
  assert.ok(cutIdx > 0, "★ 切开的气泡必须拼进 messages 列表");
  const streamIdx = memo.indexOf("return [...withCutRows, streamingMsg]");
  assert.ok(streamIdx > 0, "★ 流式行必须拼在切开的气泡**之后**（= 续答进新气泡）");
  assert.ok(
    cutIdx < streamIdx,
    "★ 顺序必须是 [A1][补充][A2] —— 补充插在当前流式气泡**之前**",
  );
});

test("GC-P28-S6c 历史里那几行（服务端切成两段 + 补充行）不重复渲染", () => {
  const code = repoCode(DETAIL);
  assert.ok(
    /cutSupplementIds\.has\(m\.id\)/.test(code),
    "★ 服务端 flush 时写的那条（合成 id 相同）必须被滤掉（不重复显示）",
  );
  assert.ok(
    /cutTurnKeys\.has\(m\.turnKey\)/.test(code),
    "★ 服务端把这一轮切成的两段 assistant 行（metadata.turnKey 同值）必须被滤掉",
  );
  // 历史行的 id 映射（合成 id）。
  assert.ok(
    /id: m\.inboxId \? supplementRowId\(m\.inboxId\) : m\.id/.test(code),
    "★ 历史行带 metadata.inbox_id ⇒ 用合成 id `supplement:<inbox_id>`（同一条不重复）",
  );
});

test("GC-P28-S6d 收尾那一条：终态帧撤掉流式行之前先把它收尾（续答不消失）", () => {
  const code = repoCode(DETAIL);
  assert.ok(
    /turnWasSplitRef\.current/.test(code),
    "★ 端侧要记得「这一轮被补充切开过」",
  );
  assert.ok(
    /if \(turnWasSplitRef\.current\) \{\s*closeTailSegment\(\);/.test(code),
    "★ 终态帧撤掉流式行之前 ⇒ 先把最后一段（续答 A2）收尾成独立气泡",
  );
  // ⛔ 收尾必须落 finishedAt（气泡上的秒表不再走）。
  assert.ok(
    /closeTailSegment[\s\S]{0,1200}finishedAt: now/.test(code),
    "★ 收尾那条必须落 finishedAt",
  );
});
