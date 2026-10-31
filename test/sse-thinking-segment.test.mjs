// [订正 18 · 2026-10-31] 端侧「思考分段」—— 按**服务端的段号**落位 (PC 抄本)
//
// ⚠️ 本文件是 web 定稿版 (gacode-web:test/sse-thinking-segment.test.mjs)
//   的**逐条对应抄本** —— 判据不许削弱。
//
// 覆盖 (gaga 真机报的 bug: 「思考碎成一小句一小句」):
//   T-S1  同一段的多条 delta (段号不变) ⇒ 并成**一条** phase
//   T-S2  服务端换了段 (段号 +1) ⇒ 开**新**的一条 phase (端侧**不推算**)
//   T-S3  **直播视图 == 历史视图** (与落库的 phases_json 逐段一致)
//   T-S4  交付气泡 (file 事件) 落在时间线里 ⇒ **不**影响思考段数, 但**断开**思考段
//   T-S5  老服务端没给段号 ⇒ 兼容分支 (相邻并一条) —— 待 R5 下线
//   T-S6  mergeFrame 端到端: 帧里的 reasoning + thinkingCount + events ⇒ 同一套结果
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

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const dir = makeTmpDir("verify-thinking-segment");

const turnRecord = await import(
  writeModule(dir, "turn-record", readFileSync(join(REPO, "src/lib/sse/turn-record.ts"), "utf8"))
);
const { appendServerThinking, mergeFrame, emptyRenderedSnapshot } = turnRecord;

/** 只取 thinking 相位 (段数 / 文本)。 */
const thinkings = (phases) =>
  phases.filter((p) => p && p.type === "thinking").map((p) => p.text ?? "");

// ---------------------------------------------------------------------------
// T-S1 · 同一段的多条 delta ⇒ 并成一条
// ---------------------------------------------------------------------------

test("T-S1 · 段号不变 ⇒ 多条 delta 并成**一条** phase (不再是「一小句一小句」)", () => {
  let phases = [];
  // 一轮 109 帧 × 15 字 —— 逐 delta 原文, 但段号一直是 1 ⇒ 服务端说「这是同一段」。
  for (const d of ["甲", "乙", "丙", "丁"]) {
    phases = appendServerThinking(phases, d, 1, 1);
  }
  assert.equal(thinkings(phases).length, 1, "⛔ 同一段只许有一条 thinking phase");
  assert.equal(thinkings(phases)[0], "甲乙丙丁", "⛔ 文本必须按顺序拼起来");
});

// ---------------------------------------------------------------------------
// T-S2 · 服务端换了段 ⇒ 开新段 (端侧零推算)
// ---------------------------------------------------------------------------

test("T-S2 · 段号 +1 ⇒ 开**新**的一条 (端侧不许自己决定怎么分段)", () => {
  let phases = [];
  phases = appendServerThinking(phases, "甲", 1, 1);
  phases = appendServerThinking(phases, "乙", 2, 1); // 同一段
  phases = appendServerThinking(phases, "丙", 3, 2); // 服务端说「进入第 2 段了」
  assert.deepEqual(thinkings(phases), ["甲乙", "丙"], "⛔ 段号变了必须开新段");
});

// ---------------------------------------------------------------------------
// T-S3 · 直播视图 == 历史视图
// ---------------------------------------------------------------------------

test("T-S3 · 直播视图与落库的 phases_json **逐段一致**", () => {
  // 服务端那一轮 (真机 session 879): 甲乙丙 (一段) → 工具 → 丁 (另一段)
  const serverPhases = [
    { type: "thinking", text: "甲乙丙", ts: 10 },
    { type: "tool", event: { type: "tool_start", tool: "read", id: "tu_1" }, ts: 20 },
    { type: "thinking", text: "丁", ts: 30 },
  ];

  // 端侧直播路径: 逐 delta 帧, 每帧带**服务端的段号**。
  let live = [];
  for (const d of ["甲", "乙", "丙"]) live = appendServerThinking(live, d, 1, 1);
  live = appendServerThinking(live, "丁", 2, 2);

  assert.deepEqual(
    thinkings(live),
    serverPhases.filter((p) => p.type === "thinking").map((p) => p.text),
    "⛔ 直播视图的思考段必须与落库形态逐段一致 (刷新前后长得一样)",
  );
});

// ---------------------------------------------------------------------------
// T-S4 · 交付气泡 (file 事件) 在时间线里
// ---------------------------------------------------------------------------

test("T-S4 · 交付气泡 (file 事件) ⇒ 落在时间线里, 且**断开**思考段", () => {
  let phases = [];
  phases = appendServerThinking(phases, "甲", 1, 1);
  // 交付事件 (file) —— 服务端把它当 tool 相位 ⇒ 断开 open thinking。
  phases = [...phases, { type: "tool", event: { type: "file", tool_use_id: "tu_1", name: "报告.pdf" }, ts: 20 }];
  // 服务端因此把下一段思考算成第 2 段。
  phases = appendServerThinking(phases, "乙", 3, 2);

  assert.equal(phases.length, 3, "⛔ 时间线上是 思考 + 交付卡片 + 思考");
  assert.equal(phases[1].type, "tool", "⛔ 交付卡片是一条 tool 相位");
  assert.deepEqual(thinkings(phases), ["甲", "乙"], "⛔ 交付卡片前后是**两段**思考 (与落库一致)");

  // ⚠️ 关键: 交付卡片**不是** thinking ⇒ 已渲染的思考段数不变 ⇒
  //   端侧下一帧拿到的段号 (2) 与「已渲染段数 + 1」对得上 ⇒ 不会错并。
  const rendered = phases.filter((p) => p.type === "thinking").length;
  assert.equal(rendered, 2);
});

// ---------------------------------------------------------------------------
// T-S5 · 老服务端 (没给段号) ⇒ 兼容分支
// ---------------------------------------------------------------------------

test("T-S5 · 服务端没给段号 (老服务端 v1) ⇒ 相邻并一条 (兼容分支, 待 R5 下线)", () => {
  let phases = [];
  phases = appendServerThinking(phases, "甲", 1, null);
  phases = appendServerThinking(phases, "乙", 2, null);
  assert.deepEqual(thinkings(phases), ["甲乙"], "⛔ 老服务端逐 delta 下发 ⇒ 不并就是碎段");

  // 给了段号但不是数字 (脏数据) ⇒ 也走兼容分支, 不许崩。
  phases = appendServerThinking(phases, "丙", 3, NaN);
  assert.deepEqual(thinkings(phases), ["甲乙丙"]);
});

// ---------------------------------------------------------------------------
// T-S6 · mergeFrame 端到端
// ---------------------------------------------------------------------------

test("T-S6 · mergeFrame: 帧里的 reasoning + thinkingCount + events ⇒ 同一套结果", () => {
  let snap = emptyRenderedSnapshot();
  const frame = (reasoning, thinkingCount, events) => ({
    seq: 1,
    reasoning,
    thinkingCount,
    events: events ?? null,
  });

  snap = mergeFrame(snap, frame("甲", 1));
  snap = mergeFrame(snap, frame("乙", 1));
  // 交付气泡 (file 事件) —— 与思考同一帧里到达 (正文/思考帧里捎带的事件)。
  snap = mergeFrame(snap, frame("丙", 2, [{ type: "file", tool_use_id: "tu_1", name: "报告.pdf" }]));
  snap = mergeFrame(snap, frame("丁", 2));

  assert.deepEqual(
    thinkings(snap.phases),
    ["甲乙", "丙丁"],
    "⛔ mergeFrame 的落位必须与 appendServerThinking 一致 (落盘的记录与直播视图同形)",
  );
  assert.equal(snap.phases.filter((p) => p.type === "tool").length, 1, "交付卡片要进时间线");
  assert.equal(snap.events.length, 1, "交付卡片也要进事件列表 (画卡片用)");
  assert.equal(snap.thinkingCount, 2, "四要素跟服务端走");
});
