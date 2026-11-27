// [T-175] PC 端三条性能/体验根治的**回归护栏**
//
// ---------------------------------------------------------------------------
// 覆盖四件事（都在同一个任务里落地，一起钉住）：
//
//   A. 进会话**直接到最新一条** —— 首帧瞬时钉底（不靠估算高度猜）
//   B. 服务端**回放封顶** —— 常驻订阅不许把 8 万帧灌进端侧（黑屏根因）
//   C. 端侧**帧合并** —— 流式正文用 rAF 一次提交，不每帧拼 O(n²) 字符串
//   D. 思考/工具**懒加载** + 兜底分支也不许漏进正文
//
// 运行: node --test test/pc-t175-perf.test.mjs   (完全离线: 不连网、不渲染 React)
//
// ⚠️ 护栏风格与 `pc-tool-fold-timeline.test.mjs` 一致 —— 源码断言式
//   （这个仓库没有 jsdom / testing-library，跑不了真渲染）。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "../scripts/lib/strip-comments.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");

const LIST = "src/components/chat/MessageList.tsx";
const DETAIL = "src/routes/ChatDetail.tsx";
const BUBBLE = "src/components/chat/MessageBubble.tsx";
const TIMELINE = "src/components/chat/ExecutionTimeline.tsx";

const clean = (p) => stripComments(repoSrc(p), p);

// ===========================================================================
// A · 进会话直接到最新一条
// ===========================================================================

test("T-175-A1 MessageList 有「钉底」态 + 换会话判据 (chatId)", () => {
  const code = clean(LIST);
  assert.ok(code.includes("pinning"), "必须有 pinning 态");
  assert.ok(code.includes("chatId"), "必须有 chatId prop（切会话判据）");
  assert.ok(
    code.includes("prevChatIdRef"),
    "必须记住上一个 chatId 才能判「换会话」",
  );
});

test("T-175-A2 钉底用 rAF 自驱动（不靠估算高度猜落点）", () => {
  const code = clean(LIST);
  assert.ok(
    code.includes("requestAnimationFrame"),
    "钉底必须用 rAF 自驱动 —— 高度稳定前会反复变（测量 + lazy 图片）",
  );
  assert.ok(
    code.includes("el.scrollTop = el.scrollHeight"),
    "钉底必须是瞬时写 scrollTop（不能用 smooth 动画，会被测量打断）",
  );
});

test("T-175-A3 钉底期间不许判 autoFollow（否则钉完就不再跟随流式）", () => {
  const code = clean(LIST);
  const pinIdx = code.indexOf("if (pinning)");
  assert.ok(pinIdx > 0, "scroll 监听里必须有 pinning 分支");
  // 该分支里必须在 return 之前把 autoFollow 的判定跳掉。
  const seg = code.slice(pinIdx, pinIdx + 600);
  assert.ok(
    seg.indexOf("setAutoFollow(false)") > 0 || seg.indexOf("setAutoFollow(false);") > 0,
    "钉底期间只有「用户真的上滚」才允许置 autoFollow=false",
  );
  // 自动滚 effect 必须让位给 pinning。
  assert.ok(
    /if \(!autoFollow \|\| pinning\) return;/.test(code),
    "自动滚 effect 必须跳过钉底期间（否则 smooth 动画把钉好的位置拽走）",
  );
});

test("T-175-A4 钉底有上限（不许无限钉）", () => {
  const code = clean(LIST);
  assert.ok(
    code.includes("1500") || code.includes("Date.now() - startedAt"),
    "钉底必须有时间上限（防内容永远在变导致死循环式钉底）",
  );
});

// ===========================================================================
// C · 端侧帧合并（rAF 一次提交）
// ===========================================================================

test("T-175-C1 流式正文不再每帧 setState 拼接（O(n²) 根因）", () => {
  const code = clean(DETAIL);
  assert.ok(
    !code.includes("setStreamingContent((prev) => prev + chunk.content)"),
    "★ 不许再每帧拼字符串 —— 8 万帧就是 8 万次全串复制 ⇒ 渲染线程卡死",
  );
  assert.ok(
    code.includes("scheduleStreamingFlush"),
    "必须走 rAF 批量提交",
  );
});

test("T-175-C2 终态/取消/切气泡前必须同步 flush（不许丢最后一帧）", () => {
  const code = clean(DETAIL);
  const flushCount = (code.match(/flushStreamingContent\(\)/g) || []).length;
  assert.ok(
    flushCount >= 3,
    `flushStreamingContent 至少要有 3 个调用点（切气泡/终态/取消）—— 现在只有 ${flushCount}`,
  );
  assert.ok(
    code.includes("isTerminalDone(chunk)"),
    "终态分支要保留（flush 要插在它里面）",
  );
});

test("T-175-C3 rAF 提交有卸载清理（不许把上一会话正文写进新会话）", () => {
  const code = clean(DETAIL);
  assert.ok(
    code.includes("cancelAnimationFrame"),
    "必须能取消未提交的 rAF",
  );
});

// ===========================================================================
// 停止按钮（常驻订阅模式）：停轮 ≠ 停常驻流
// ===========================================================================

test("T-175-E1 常驻模式下停止键直接发 STOP_TURN（不靠 stream.abort）", () => {
  const code = clean(DETAIL);
  assert.ok(
    code.includes('sendCancelDelete(chatId, "STOP_TURN")'),
    "★ 常驻模式必须直接发 STOP_TURN —— stream.abort 在常驻模式下是空操作",
  );
  assert.ok(code.includes("if (persistentOn)"), "必须有常驻模式分支");
});

test("T-175-E2 常驻模式停止**不 abort 常驻流**（常驻流要跨轮存活）", () => {
  const code = clean(DETAIL);
  const idx = code.indexOf("if (persistentOn)");
  assert.ok(idx > 0, "找不到 persistentOn 分支");
  const seg = code.slice(idx, idx + 900);
  assert.ok(
    !seg.includes("persistentSub.abort"),
    "★ 常驻分支里不许 abort 常驻流 —— 那会把整条订阅断掉，后面所有轮次都收不到",
  );
});

test("T-175-E3 非常驻模式保持老路径（stream.abort 不变）", () => {
  const code = clean(DETAIL);
  assert.ok(
    code.includes('stream.abort("user")'),
    "老路径（发起流 / attach）必须仍然走 stream.abort",
  );
});

// ===========================================================================
// 思考记录回灌：绝不进 messages
// ===========================================================================

test("T-175-F1 服务端把内部记录从 messages 里剥离（改成独立字段）", () => {
  const routes = clean("../_wt_t175_unified/src/modules/yinian/yinian.chat.routes.js");
  assert.ok(
    !routes.includes("[上一轮的思考摘要]"),
    "★ 内部记录不许再拼进 assistant 的 content —— 模型会把它当自己的话复述给用户",
  );
  assert.ok(routes.includes("contextNotes"), "必须用独立的 contextNotes 字段传出去");
});

test("T-175-F2 gaclaw 把它拼进 systemPrompt（不在 messages 里）", () => {
  const agent = clean("../_wt_t175_gaclaw/src/channel_agent.js");
  assert.ok(agent.includes("contextNotes"), "gaclaw 必须接收 contextNotes");
  assert.ok(
    !agent.includes("[上一轮的思考摘要]"),
    "★ 旧标记不许再出现（它是复述的标志）",
  );
});

test("T-175-F3 buildHistoryMessages 的返回契约不变（仍是数组）", () => {
  const agent = clean("../_wt_t175_gaclaw/src/channel_agent.js");
  assert.ok(
    agent.includes("Object.defineProperty(result, 'contextNotes'"),
    "contextNotes 必须挂在**不可枚举**属性上 ⇒ 返回值仍是纯 messages 数组（契约不变）",
  );
});

// ===========================================================================
// D · 思考/工具懒加载 + 兜底分支不许漏进正文
// ===========================================================================

test("T-175-D1 兜底分支（有 richEvents 无 phases）也走折叠区", () => {
  const code = clean(BUBBLE);
  assert.ok(
    !/hasRichEvents && !hasPhases[\s\S]{0,200}richEvents!\.map/.test(code),
    "★ 兜底分支不许再把富事件直接渲进正文 —— 这就是「上下文思考/工具总结漏进气泡」的根因",
  );
  assert.ok(
    code.includes("richEventsToFallbackPhases"),
    "兜底分支必须转成 phases 交给 ExecutionTimeline",
  );
});

test("T-175-D2 折叠态不重算 renderPhases（省掉每帧几十 KB 字符串拼接）", () => {
  const code = clean(TIMELINE);
  assert.ok(
    code.includes("lightweightCount"),
    "折叠态必须有轻量计数路径",
  );
  assert.ok(
    /expanded \? phases : null/.test(code),
    "折叠态不许订阅 phases 引用变化（流式每帧换引用 ⇒ memo 每帧失效）",
  );
});

test("T-175-D3 ExecutionTimeline 默认仍是折叠（不许改成默认展开）", () => {
  const code = clean(TIMELINE);
  assert.ok(
    code.includes("defaultExpanded = false"),
    "默认必须折叠 —— 用户要求「不点开就不加载」",
  );
});
