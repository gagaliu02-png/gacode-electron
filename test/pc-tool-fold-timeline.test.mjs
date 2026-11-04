// [2026-11-04 · 批 G9] PC 端「工具使用过程」收纳进「思考和工具」折叠区
//
// ---------------------------------------------------------------------------
// gaga 2026-11-04 反馈 (截图): PC 的 assistant 气泡里, **正文下方**浮着一堆
//   工具卡片 (`file_list` + `{"path":"release","recursive":true}` /
//   `file_list 完成 158 毫秒`), 而「思考 2 次 · 工具 8 次」那根折叠条
//   在**正文上方** —— 两处都在讲同一件事, 且工具过程占了正文的位置。
//
//   ⇒ 「这些 tool 的使用过程 应该是收纳到思考和工具这个子气泡里的,
//      而不是直接在正文的地方显示吧」
//
// 修法 (**判据 = 安卓**, gaga 2026-11-02 定调「PC 应该和安卓达到一样的效果」):
//   安卓 `ChatDetailScreen.ExecutionInfoContainer` 把富事件**全部**收进
//   `PhasesList` (那根「思考 N 次 · 工具 N 次」) 的展开区 ——
//   `ToolPhaseRow → RichBubbleList → ToolCallBubble` (完整卡片, 带参数 / 带耗时);
//   安卓的 assistant 气泡**正文只有 Markdown**。
//
//   ⇒ PC 端对齐:
//     1) ExecutionTimeline: tool phase 渲染成**完整卡片** (不再是一行摘要);
//     2) MessageBubble: 正文**不再**渲染富事件 (兜底: 无 phases 的老数据仍渲染);
//     3) tool_start / tool_done **不合并** —— 安卓的 `mergeEvents` 只动
//        `msg.events`, `msg.phases` 是**追加**的 ⇒ 安卓也是两张卡
//        (参数卡 + 完成卡) ⇒ 参数不会因为「完成」而消失。
//
// 运行: node --test test/pc-tool-fold-timeline.test.mjs   (完全离线: 不连网、不渲染 React)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "../scripts/lib/strip-comments.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");

const TIMELINE = "src/components/chat/ExecutionTimeline.tsx";
const BUBBLE = "src/components/chat/MessageBubble.tsx";
const BUBBLE_HTML = "src/components/chat/RichEventBubble.tsx";

const clean = (p) => stripComments(repoSrc(p), p);

// ===========================================================================
// GC-G9-1 · tool phase 渲染成完整卡片 (安卓 ToolPhaseRow 同款)
// ===========================================================================
test("GC-G9-1 ExecutionTimeline 的 tool phase 渲染成完整卡片 (不是一行摘要)", () => {
  const code = clean(TIMELINE);

  assert.ok(
    code.includes("<RichEventBubble"),
    "★ tool phase 必须渲染成 RichEventBubble 完整卡片 —— " +
      "旧实现只给一行摘要 (icon + type + 标题) ⇒ 参数 / 耗时都看不到",
  );
  assert.ok(
    !code.includes("summarizeToolEvent"),
    "★ 旧的一行摘要 helper 必须删掉 (它就是「compaction compaction」的来源)",
  );
  assert.ok(
    code.includes('from "./RichEventBubble"'),
    "★ 必须 import RichEventBubble",
  );
});

// ===========================================================================
// GC-G9-2 · 正文不再渲染富事件 (工具过程只出现在折叠区)
// ===========================================================================
test("GC-G9-2 MessageBubble 正文不再无条件渲染富事件 (只有无 phases 的老数据兜底)", () => {
  const code = clean(BUBBLE);

  assert.ok(
    code.includes("hasRichEvents && !hasPhases"),
    "★ 正文的富事件渲染必须被 `hasRichEvents && !hasPhases` 兜住 —— " +
      "有 phases 时工具过程由折叠区渲染 (安卓同款), 正文只留 Markdown",
  );
  // 正文里**不该**再出现「无条件按 hasRichEvents 渲染」的写法
  assert.ok(
    !/\{hasRichEvents\s*\?\s*\(/.test(code),
    "★ 不许再有 `{hasRichEvents ? (` 这种无条件渲染正文的写法",
  );
});

// ===========================================================================
// GC-G9-3 · 死类型 / 未知类型跳过 (不渲染 JSON 字面)
// ===========================================================================
test("GC-G9-3 tool phase 渲染前过归一层 (死类型 / 未知类型跳过)", () => {
  const code = clean(TIMELINE);

  assert.ok(
    code.includes("normalizeRichEvent"),
    "★ tool phase 必须过归一层 —— 跟正文那条渲染路径 (parsePhasesRichEvents) 同一口径",
  );
  assert.ok(
    /if\s*\(\s*!norm\.event\s*\)\s*return null;/.test(code),
    "★ 归一层跳过的条目 (死类型 / 未知类型) 必须**不渲染** (不许落进 JSON 字面分支)",
  );
});

// ===========================================================================
// GC-G9-4 · 折叠区仍默认折叠 (工具过程不默认铺开)
// ===========================================================================
test("GC-G9-4 折叠区默认折叠 (工具过程收进去后不默认铺开)", () => {
  const code = clean(TIMELINE);
  assert.ok(
    /defaultExpanded\s*=\s*false/.test(code),
    "★ 默认必须折叠 —— 收进折叠区是为了「不占正文」, 默认展开等于换个地方占地方",
  );
  assert.ok(
    /useState\(defaultExpanded\)/.test(code),
    "★ expanded 初值必须取 defaultExpanded",
  );
});

// ===========================================================================
// GC-G9-5 · tool_start / tool_done 不合并 (参数不丢)
// ===========================================================================
test("GC-G9-5 tool_start / tool_done 不按 id 合并 (安卓同款: phases 是追加的)", () => {
  const code = clean(TIMELINE);

  assert.ok(
    !/\.filter\(/.test(code),
    "★ 时间线不许过滤掉任何 tool phase —— " +
      "安卓的 mergeEvents 只动 msg.events, msg.phases 是追加的 ⇒ " +
      "参数卡 + 完成卡两张都在 (参数不会因为「完成」而消失)",
  );
  assert.ok(
    !code.includes("tool_start"),
    "★ 时间线不该对 tool_start 做任何特判 (不做特判 = 不合并 = 两张卡都在)",
  );
});

// ===========================================================================
// GC-G9-6 · 折叠区在正文**上方** (安卓: 执行信息 section 在 AI 文字之上)
// ===========================================================================
test("GC-G9-6 折叠区渲染在 Markdown 正文之前 (安卓同款位置)", () => {
  const code = clean(BUBBLE);
  const timelineIdx = code.indexOf("<ExecutionTimeline");
  const markdownIdx = code.indexOf("<Markdown>{markdownContent}</Markdown>");
  assert.ok(timelineIdx > 0, "抠不到 ExecutionTimeline");
  assert.ok(markdownIdx > 0, "抠不到正文 Markdown");
  assert.ok(
    timelineIdx < markdownIdx,
    "★ 折叠区必须在正文上方 —— 安卓 ExecutionInfoContainer 就在 AI 文字之上",
  );
});

// ===========================================================================
// GC-G9-7 · 富事件卡片本身没被改坏 (compaction 仍是人话)
// ===========================================================================
test("GC-G9-7 富事件卡片仍特判 compaction (不许 'compaction compaction')", () => {
  const code = clean(BUBBLE_HTML);
  assert.ok(code.includes('case "compaction"'), "compaction 必须有自己的分支");
  assert.ok(code.includes("上下文已压缩"), "compaction 卡片必须是人话");
});
