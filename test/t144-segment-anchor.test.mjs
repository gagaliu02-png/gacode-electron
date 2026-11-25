// [T-144] PC 端：帧带 segmentIndex ⇒ 补充行/续答第一次就按段号排序（不先倒挂后愈合）。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeTmpDir, writeModule } from "../scripts/lib/schedule-loader.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const dir = makeTmpDir("verify-t144-anchor");
const src = readFileSync(join(REPO, "src/lib/supplement-boundary.ts"), "utf8");
const { parseSupplementBoundary, planSupplementCut } = await import(
  writeModule(dir, "supplement-boundary-anchor", src)
);

const frame = { supplementBoundary: {
  id: "609", kind: "user_message", fromKind: "user", content: "补充", segmentIndex: 2,
} };

test("T144-1 parseSupplementBoundary 透传 segmentIndex", () => {
  const sb = parseSupplementBoundary(frame);
  assert.equal(sb.segmentIndex, 2);
});

test("T144-2 planSupplementCut 给补充行打 tk_xxx#N（续答段同锚点）", () => {
  const sb = parseSupplementBoundary(frame);
  const plan = planSupplementCut({
    boundary: sb,
    segment: { content: "A1", richEvents: [], phases: [], startedAt: 1, finishedAt: null, elapsedMs: null, turnKey: "tk_abc" },
    now: 1000,
  });
  assert.equal(plan.supplementRow.turnKey, "tk_abc#2");
  assert.equal(plan.closedSegment.turnKey, "tk_abc");
});

test("T144-3 老帧无 segmentIndex ⇒ 不写锚点（老行为逐字不变）", () => {
  const sb = parseSupplementBoundary({ supplementBoundary: { id: "1", content: "x" } });
  const plan = planSupplementCut({
    boundary: sb,
    segment: { content: "", richEvents: [], phases: [], startedAt: null, finishedAt: null, elapsedMs: null, turnKey: "tk" },
    now: 1,
  });
  assert.ok(!("turnKey" in plan.supplementRow));
});

test("T144-4 段号排序：同轮内 [A1][补充][A2] 不靠墙钟", async () => {
  const mergeSrc = readFileSync(join(REPO, "src/lib/sse/merge-history.ts"), "utf8");
  const { orderByTurnSegment } = await import(
    writeModule(dir, "merge-history-anchor", mergeSrc)
  );
  // 墙钟故意「错」：补充行的 createdAt 比 A2 晚（服务端时钟 vs 本机时钟打架）
  const rows = [
    { id: "a1", role: "assistant", turnKey: "tk_abc", createdAt: 500 },
    { id: "sup", role: "user", turnKey: "tk_abc#2", createdAt: 900 },
    { id: "a2", role: "assistant", turnKey: "tk_abc#2", createdAt: 100 },
  ];
  const out = orderByTurnSegment(rows).map((r) => r.id);
  assert.deepEqual(out, ["a1", "sup", "a2"],
    "同轮内按段号排 ⇒ 补充夹在 A1 与 A2 之间（不看墙钟）");
});
