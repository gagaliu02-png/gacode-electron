// [2026-11-13] PC「SSE 气泡缺执行时间」的**接线**回归断言
//
// ---------------------------------------------------------------------------
// gaga 2026-11-13 报障: 「PC端SSE气泡缺了执行时间」。
//
// 根因（不是气泡组件的问题，是**接线**的问题）:
//   ① `MessageBubble` 一直有秒表（`已执行 N 秒` / `共执行 N 秒`），
//      但它靠 `startedAt` / `elapsedMs` 两个入参 —— 而 PC 的宿主层
//      (`ChatDetail.tsx`) **从来没把这两个值挂到气泡那一行上**。
//   ② `streamingTurnMeta` 那个 state 收集了服务端的四要素
//      （elapsedMs / toolCallCount / thinkingCount / terminalReason），
//      却**从不被读** ⇒ 端侧自己那套数出来的「工具 N 次」也不准。
//   ③ 服务端**直播帧**没有 elapsedMs（unified-api `sseChunkFrames.js` 只发
//      content/reasoning/done/events）⇒ 端侧只能靠**本地时钟**兜底
//      （跟 web `page.tsx:1340` 的 `startedAt = Date.now()` 同款）。
//   ④ 终态帧一到，流式行被撤掉 ⇒ 换成服务端历史行 ⇒ 历史行没有计时
//      ⇒ 秒表在轮次结束的瞬间消失（web 不会：store 里那条消息一直带着
//      startedAt/finishedAt）。
//
// ⚠️ 这些断言只看**代码形状**（不渲染 React）—— 目的是「接线被悄悄删掉时转红」。
//
// 运行: node --test test/pc-execution-timer.test.mjs   (完全离线)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "../scripts/lib/strip-comments.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");
const repoCode = (p) => stripComments(repoSrc(p));

const DETAIL = "src/routes/ChatDetail.tsx";
const BUBBLE = "src/components/chat/MessageBubble.tsx";
const LIST = "src/components/chat/MessageList.tsx";

test("① 气泡有秒表，且终点用 finishedAt（不然一轮结束就跳回 0 秒）", () => {
  const code = repoCode(BUBBLE);
  assert.ok(
    code.includes("execution-timer"),
    "气泡必须渲染秒表（execution-timer）",
  );
  assert.ok(
    code.includes("finishedAt"),
    "气泡必须有 finishedAt 入参 —— 没有它，一轮结束耗时归 0",
  );
  assert.ok(
    /finishedAt\s*\?\?\s*\(\s*isRunning\s*\?\s*nowMs\s*:\s*null\s*\)/.test(code),
    "耗时的终点必须是 `finishedAt ?? (isRunning ? nowMs : null)`（跟 web 逐字同款）",
  );
  assert.ok(
    !/const end = isRunning \? nowMs : null/.test(code),
    "不许再写 `const end = isRunning ? nowMs : null` —— 那是「结束后归 0」的病根",
  );
});

test("② 消息列表把 finishedAt 透传给气泡", () => {
  const code = repoCode(LIST);
  assert.ok(
    code.includes("finishedAt?: number | null"),
    "ChatMessageModel 必须有 finishedAt 字段",
  );
  assert.ok(
    code.includes("finishedAt={m.finishedAt}"),
    "MessageList 必须把 finishedAt 透传给 MessageBubble",
  );
});

test("③ 流式行挂上四要素 + 计时（宿主层接线 —— 病根所在）", () => {
  const code = repoCode(DETAIL);
  // 流式行那个对象字面量里必须有这些字段。
  assert.ok(
    /startedAt:\s*streamingTiming\?\.startedAt/.test(code),
    "流式行必须挂 startedAt（秒表的起点）",
  );
  assert.ok(
    code.includes("elapsedMs: streamingTurnMeta.elapsedMs"),
    "流式行必须挂服务端的 elapsedMs（四要素之一）",
  );
  assert.ok(
    code.includes("toolCallCount: streamingTurnMeta.toolCallCount"),
    "流式行必须挂 toolCallCount（端侧不数帧）",
  );
  assert.ok(
    code.includes("thinkingCount: streamingTurnMeta.thinkingCount"),
    "流式行必须挂 thinkingCount（端侧不数帧）",
  );
  // ⚠️ memo 的 deps 里必须有它们 —— 不进 deps ⇒ 挂上去也不生效。
  assert.ok(
    /streamingTurnMeta,\s*\n\s*streamingTiming,/.test(code),
    "messages 的 useMemo deps 里必须有 streamingTurnMeta / streamingTiming",
  );
});

test("④ 本地时钟兜底：发流时起表，终态时收表", () => {
  const code = repoCode(DETAIL);
  assert.ok(
    /setStreamingTiming\(\{\s*\n?\s*startedAt: Date\.now\(\)/.test(code),
    "发流时必须起表（startedAt: Date.now()，跟 web page.tsx:1340 同款）",
  );
  assert.ok(
    code.includes("finishTurnTiming"),
    "必须有 finishTurnTiming（终态收表）",
  );
  // 收表必须在 clearLocalRow 之前 —— 它会把 turnKey 清成 null。
  const termIdx = code.indexOf("finishTurnTiming();");
  const clearIdx = code.indexOf("clearLocalRow();");
  assert.ok(termIdx > 0 && clearIdx > 0, "终态路径上两个都要在");
  assert.ok(
    termIdx < clearIdx,
    "finishTurnTiming 必须在 clearLocalRow **之前**（否则 turnKey 已被清掉，认不了亲）",
  );
});

test("⑤ 轮次结束后计时不能消失 —— 端侧自己记一份，按 turnKey 认亲补回历史行", () => {
  const code = repoCode(DETAIL);
  assert.ok(
    code.includes("turnTimingRef"),
    "必须有 turnTimingRef（按 turnKey 存每一轮的计时）",
  );
  assert.ok(
    code.includes("lastTurnTimingRef"),
    "必须有 lastTurnTimingRef（老服务端没 turnKey 时的兜底认亲）",
  );
  // 历史行那侧：要把计时补上去。
  assert.ok(
    /startedAt:\s*timing\?\.startedAt\s*\?\?\s*null/.test(code),
    "历史行必须补上 startedAt（否则轮次结束秒表就消失）",
  );
  assert.ok(
    /finishedAt:\s*timing\?\.finishedAt\s*\?\?\s*null/.test(code),
    "历史行必须补上 finishedAt",
  );
});
