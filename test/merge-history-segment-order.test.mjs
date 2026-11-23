// [T-052 · 2026-11-18] **注入行（插话 / 后台回报）的段序锚点** —— 顺序不得倒挂
//
// ---------------------------------------------------------------------------
// 病根（生产实证 · session 1083）
//
//   服务端补写的注入行（用户插话 / 后台回报）`created_at` 用**服务端时钟**，
//   本机 A2 续答行用**本机时钟** ⇒ 两个时钟源在同一毫秒量级 ⇒ 谁大谁小看运气
//   ⇒ 屏幕上「**最后 llm 气泡比用户气泡上面**」（PM 2026-11-18 报障）。
//
// 修法：服务端给注入行写 `metadata.turnKey = tk_xxx#N`（段号锚点），
//       端侧合并层「同一轮内按段号排，跨轮保持原顺序」。
//
// 断言：
//   D1 注入行带段号锚点 ⇒ 同一轮内按段号归位（不看 createdAt）
//   D2 没有段号锚点 ⇒ 保持原顺序（老数据 / 老服务端行为不变）
//   D3 跨轮 ⇒ 不按段号重排
//   D4 parseTurnSegment 认段号（非法后缀当第 1 段）
//
// 运行: node --test test/merge-history-segment-order.test.mjs（完全离线）

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { makeTmpDir, writeModule } from "../scripts/lib/schedule-loader.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");

// merge-history.ts 不 import 任何东西 ⇒ 直接编译成 mjs 就能跑。
const dir = makeTmpDir("verify-merge-history-segment");
const M = await import(
  writeModule(dir, "merge-history", repoSrc("src/lib/sse/merge-history.ts"))
);

const TK = "tk_round_20261118_abc";

const serverRow = (over = {}) => ({
  id: "srv-1",
  role: "assistant",
  content: "服务端落库的正文",
  createdAt: "2026-11-18T10:00:00.000Z",
  turnKey: TK,
  richEvents: [],
  phases: [],
  ...over,
});

test("D1 注入行带段号锚点 ⇒ 同一轮内按段号归位（不靠 createdAt）", () => {
  const rows = [
    // A1 段1：故意给一个**很晚**的 createdAt（模拟跨时钟源）
    serverRow({ id: "srv-a1", content: "A1", turnKey: TK }),
    // 注入行（用户插话）：段 2
    {
      id: "u-supplement",
      role: "user",
      content: "算了 不算了",
      createdAt: "2026-11-18T10:00:01.000Z",
      turnKey: `${TK}#2`,
    },
    // A2 段3：故意给一个**很早**的 createdAt
    serverRow({ id: "srv-a2", content: "A2", turnKey: `${TK}#3` }),
  ];
  const merged = M.mergeHistoryRows(rows, []);
  assert.deepEqual(
    merged.map((m) => m.id),
    ["srv-a1", "u-supplement", "srv-a2"],
    "⛔ 同一轮内必须按段号排：A1(段1) → 注入行(段2) → A2(段3)，不许被 createdAt 带偏",
  );
});

test("D2 没有段号锚点 ⇒ 保持原顺序（老数据 / 老服务端行为不变）", () => {
  const rows = [
    serverRow({ id: "srv-a1", content: "A1", turnKey: TK }),
    {
      id: "u-supplement",
      role: "user",
      content: "老数据（无锚点）",
      createdAt: "2026-11-18T10:00:01.000Z",
    },
    serverRow({ id: "srv-a2", content: "A2", turnKey: `${TK}#2` }),
  ];
  const merged = M.mergeHistoryRows(rows, []);
  assert.deepEqual(
    merged.map((m) => m.id),
    ["srv-a1", "u-supplement", "srv-a2"],
    "无锚点 ⇒ 按输入顺序（老行为逐字不变）",
  );
});

test("D3 跨轮 ⇒ 不按段号重排（各轮内部顺序不动）", () => {
  const rows = [
    serverRow({ id: "srv-b", content: "B", turnKey: "tk_b#2" }),
    serverRow({ id: "srv-a", content: "A", turnKey: "tk_a#1" }),
  ];
  const merged = M.mergeHistoryRows(rows, []);
  assert.deepEqual(
    merged.map((m) => m.id),
    ["srv-b", "srv-a"],
    "跨轮 ⇒ 保持输入顺序",
  );
});

test("D4 parseTurnSegment 认段号（非法后缀当第 1 段）", () => {
  assert.deepEqual(M.parseTurnSegment("tk_x"), { base: "tk_x", index: 1 });
  assert.deepEqual(M.parseTurnSegment("tk_x#2"), { base: "tk_x", index: 2 });
  assert.deepEqual(M.parseTurnSegment("tk_x#"), { base: "tk_x#", index: 1 });
  assert.deepEqual(M.parseTurnSegment("tk_x#xy"), { base: "tk_x#xy", index: 1 });
  assert.equal(M.parseTurnSegment(null), null);
  assert.equal(M.parseTurnSegment(""), null);
});
