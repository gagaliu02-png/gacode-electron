// [T-113 · 2026-11-22] PC 历史分页 —— 长会话必须从第 1 页拉到最后一页
//
// ---------------------------------------------------------------------------
// 生产实证：session 1134
//
//   PC 原来只请求一次 `/messages`（无 limit/cursor）⇒ 服务端默认返第一页 100 条。
//   1134 共 392 条；用户看到的“PM 回执回来了（f5e6f589…）”正好是第 100 条 ⇒
//   从这里之后整段不显示；新消息靠乐观/流式短暂出现，history refetch 又只拿
//   第一页覆盖 ⇒ 闪一下就消失。
//
// 断言：
//   P1 多页按 cursor 顺序拼接，返回所有行
//   P2 空 items + next_cursor 仍继续，且保持原顺序
//   P3 重复 cursor 防御：不死循环
//   P4 源码接线：getHistory 必须调用 collectHistoryPages，请求必须带 limit=200
//
// 运行：node --test test/get-history-pagination.test.mjs（完全离线）

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { makeTmpDir, writeModule } from "../scripts/lib/schedule-loader.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");

const dir = makeTmpDir("verify-get-history-pagination");

// api.ts 依赖链重，纯函数测试走源码切片
function extractCollectHistoryPages(src) {
  const start = src.indexOf("export type HistoryPage<T>");
  const end = src.indexOf("export async function getHistory");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("api.ts 里找不到 HistoryPage/collectHistoryPages/getHistory 边界");
  }
  return src.slice(start, end);
}

const P = await import(
  writeModule(dir, "history-paging", extractCollectHistoryPages(repoSrc("src/lib/api.ts")))
);

test("P1 多页按 cursor 顺序拼接，返回所有行", async () => {
  const pages = [
    { items: ["1", "2"], next_cursor: "c1" },
    { items: ["3"], next_cursor: "c2" },
    { items: ["4", "5"], next_cursor: null },
  ];
  const calls = [];
  const rows = await P.collectHistoryPages(async (cursor) => {
    calls.push(cursor);
    return pages[calls.length - 1];
  });
  assert.deepEqual(calls, [null, "c1", "c2"]);
  assert.deepEqual(rows, ["1", "2", "3", "4", "5"]);
});

test("P2 空 items + next_cursor 仍继续，且保持原顺序", async () => {
  const pages = [
    { items: [], next_cursor: "c1" },
    { items: ["after-empty"], next_cursor: null },
  ];
  const rows = await P.collectHistoryPages(async (cursor) =>
    cursor === null ? pages[0] : pages[1]
  );
  assert.deepEqual(rows, ["after-empty"]);
});

test("P3 重复 cursor 防御：不死循环", async () => {
  let calls = 0;
  const rows = await P.collectHistoryPages(async () => {
    calls += 1;
    return { items: [`row-${calls}`], next_cursor: "same-cursor" };
  });
  assert.equal(calls, 2, "服务端回同一个 cursor ⇒ 拉两页就停，不许死循环");
  assert.deepEqual(rows, ["row-1", "row-2"]);
});

test("P4 源码接线：getHistory 必须分页且请求 limit=200", () => {
  const apiSrc = repoSrc("src/lib/api.ts").replace(/\r\n/g, "\n");
  assert.match(apiSrc, /collectHistoryPages<HistoryRow>\(async \(cursor\)/);
  assert.match(apiSrc, /new URLSearchParams\(\{ limit: "200" \}\)/);
  assert.match(apiSrc, /qs\.set\("cursor", cursor\)/);
  assert.match(apiSrc, /return \{ messages, nextCursor: null \};/);
});
