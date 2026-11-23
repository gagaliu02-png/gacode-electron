// [T-083/T-088 · 2026-11-20] PC ChatDetail 跨 session 内存状态残留回归。
//
// 现象: 新 session 1118 的 history 里没有「嘻嘻 可爱啊」，但界面把旧 session
// 的乐观 user 气泡渲染了出来 —— ChatDetail 在 /chat/:id 间不重挂载，
// pendingUserMsg / cutRows / localQueue 等内存态跨 session 残留。
//
// 本测试沿用本仓的静态结构断言风格（不渲染 React）:
//   ① 找到唯一的 chatId reset effect；
//   ② 断言所有“本轮/本会话”状态都在里面被清掉；
//   ③ 断言审批仍按 chatId hydrate、sse-turn-record 没被全局清；
//   ④ 断言 messages / queueEntries 的确消费这些状态（防止把渲染链路删了骗测试）。
//
// 运行: node --test test/pc-cross-session-state-reset.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "../scripts/lib/strip-comments.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const DETAIL = "src/routes/ChatDetail.tsx";
const code = stripComments(readFileSync(join(REPO, DETAIL), "utf8"), DETAIL);

/** 所有依赖 [chatId] 的 effect 的函数体（注释已剥离）。 */
function chatIdEffectBodies(src) {
  const bodies = [];
  const re = /useEffect\(\s*\(\s*\)\s*=>\s*\{/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    let i = m.index + m[0].length - 1;
    let depth = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = src.slice(m.index + m[0].length, i);
    const tail = src.slice(i + 1, i + 80);
    if (/,\s*\[\s*chatId\s*\]\s*\)/.test(tail)) bodies.push(body);
  }
  return bodies;
}

const effects = chatIdEffectBodies(code);
const reset = effects.find((b) => /setPendingApprovals\(/.test(b));
assert.ok(reset, "找不到包含审批 hydrate 的 chatId reset effect");

test("T1 切 chatId 必须清掉会进入 messages 的 optimistic / cutRows 状态", () => {
  // messages useMemo 无条件把 pendingUserMsg / cutRows 拼进当前会话；
  // 残留任意一个都会在新 session 显示旧会话气泡（事故的直接原因）。
  for (const stmt of [
    /setPendingUserMsg\(null\)/,
    /setCutRows\(\[\]\)/,
    /setPendingUserImageUrls\(\[\]\)/,
  ]) {
    assert.match(reset, stmt, `reset effect 缺少 ${stmt}`);
  }
  assert.match(reset, /turnWasSplitRef\.current\s*=\s*false/);
  assert.match(reset, /handledSupplementIdsRef\.current\.clear\(\)/);
});

test("T2 切 chatId 必须清掉队列与会话级 state/ref（localQueue 等）", () => {
  for (const stmt of [
    /setLocalQueue\(\[\]\)/,
    /setProcessedInboxIds\(new Set\(\)\)/,
    /setInboxItems\(\[\]\)/,
    /setPendingWork\(\[\]\)/,
    /setFlushingId\(null\)/,
    /setDeletingId\(null\)/,
    /setStoppingBackground\(false\)/,
    /setStreamingTiming\(null\)/,
    /streamingTimingRef\.current\s*=\s*null/,
    /localRowIdRef\.current\s*=\s*null/,
    /streamingContentRef\.current\s*=\s*""/,
    /streamingPhasesRef\.current\s*=\s*\[\]/,
    /streamingEventsRef\.current\s*=\s*\[\]/,
    /turnTimingRef\.current\.clear\(\)/,
    /lastTurnTimingRef\.current\s*=\s*null/,
    /streamBusyRef\.current\s*=\s*false/,
    /myTurnRef\.current\s*=\s*false/,
    /pumpBusyRef\.current\s*=\s*false/,
    /pumpedItemIdRef\.current\s*=\s*null/,
    /ownTurnKeysRef\.current\.clear\(\)/,
    /ownTurnSessionIdRef\.current\s*=\s*null/,
    /attachLiveRef\.current\s*=\s*false/,
    /persistentTurnRef\.current\s*=\s*emptyPersistentTurnState\(\)/,
    /lastUserTextRef\.current\s*=\s*""/,
    /lastUserAttachmentsRef\.current\s*=\s*\[\]/,
  ]) {
    assert.match(reset, stmt, `reset effect 缺少 ${stmt}`);
  }
});

test("T3 审批按 chatId hydrate 的既有逻辑必须保留（不清落盘审批）", () => {
  assert.match(
    reset,
    /setPendingApprovals\(chatId \? loadPendingApprovals\(chatId\) : \[\]\)/,
  );
  // sse-turn-record 由 followController/turnRecordStore 按 session 读写；
  // reset effect 里不应出现任何 localStorage.removeItem / 全局 clear。
  assert.doesNotMatch(reset, /localStorage|removeItem|sessionStorage/);
  assert.doesNotMatch(reset, /turnRecordStore\.clear/);
});

test("T4 渲染链路确实消费这些状态（防止“只清不用”的假修复）", () => {
  assert.match(code, /pendingUserMsg && !historyHasSameUser/);
  assert.match(code, /\.\.\.cutRows\.map\(/);
  assert.match(code, /const local: QueueEntry\[\] = localQueue\.map\(/);
});

test("T5 reset 逻辑集中在唯一一个 chatId effect，避免多 effect 顺序依赖", () => {
  const clearing = effects.filter((b) => /setPendingUserMsg\(null\)/.test(b));
  assert.equal(
    clearing.length,
    1,
    "pendingUserMsg 的复位必须只出现在一个 chatId effect 里",
  );
});
