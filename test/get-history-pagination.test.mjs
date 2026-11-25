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
//   P4 源码接线：分页请求必须带 limit=200，且 getHistory 只保留最近 N 条
//   P5 [T-156] 增量加载：首屏只 map 最近 N 条；老消息由 loadOlderMessages 取回
//   P6 [T-156] parsePhasesOnce: 一条消息只 JSON.parse 一次，两份结果同源
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

test("P4 源码接线：分页请求必须带 limit=200（getHistory 首屏只取最近 N 条）", () => {
  const apiSrc = repoSrc("src/lib/api.ts").replace(/\r\n/g, "\n");
  // ★ [T-156] 首屏从「分页拉全量」改成「走到尾、只保留最后 N 行」：
  //   collectHistoryPages 仍供诊断/测试使用，但 getHistory 不再调用它
  //   ⇒ 不再断言 `collectHistoryPages<HistoryRow>` 这个旧接线。
  assert.match(apiSrc, /new URLSearchParams\(\{ limit: String\(HISTORY_PAGE_LIMIT\) \}\)/);
  assert.match(apiSrc, /qs\.set\("cursor", cursor\)/);
  assert.match(apiSrc, /fetchHistoryAroundEnd\(chatId\)/);
});

// ===========================================================================
// ★ [T-156] 增量加载 + 单次解析的运行时断言
// ===========================================================================

test("P5 [T-156] 首屏只 map 最近 N 条，nextCursor 指回上一页（老消息仍可达）", async () => {
  const apiSrc = repoSrc("src/lib/api.ts");
  // 加载 api.ts 真源码（依赖链跟项目里其它测试同款：临时目录平铺 + rewrite imports）
  const { writeModule } = await import("../scripts/lib/schedule-loader.mjs");
  for (const [name, path] of [
    ["notifications", "src/lib/notifications.ts"],
    ["client-capabilities", "src/lib/client-capabilities.ts"],
    ["turn-identity", "src/lib/sse/turn-identity.ts"],
    ["auth-refresh", "src/lib/auth-refresh.ts"],
    ["rich-events", "src/lib/rich-events.ts"],
  ]) {
    writeModule(dir, name, repoSrc(path));
  }
  const api = await import(
    writeModule(dir, "api-incremental", apiSrc, {
      rewriteImports: [
        ["auth-refresh", "./auth-refresh.mjs"],
        ["rich-events", "./rich-events.mjs"],
        ["sse/turn-key-header", "./turn-key-header.mjs"],
        ["notifications", "./notifications.mjs"],
        ["client-capabilities", "./client-capabilities.mjs"],
        ["sse/turn-identity", "./turn-identity.mjs"],
        ["./auth-refresh", "./auth-refresh.mjs"],
        ["./rich-events", "./rich-events.mjs"],
        ["./notifications", "./notifications.mjs"],
        ["./client-capabilities", "./client-capabilities.mjs"],
        ["./sse/turn-identity", "./turn-identity.mjs"],
      ],
    })
  );

  // 三页：1..200, 201..400, 401..500。limit=100 ⇒ 首屏应只保留 401..500。
  const pages = [
    {
      items: Array.from({ length: 200 }, (_, i) => ({
        id: String(i + 1), role: "user", content: `m${i + 1}`, created_at: "2026-01-01T00:00:00Z",
      })),
      next_cursor: "200",
    },
    {
      items: Array.from({ length: 200 }, (_, i) => ({
        id: String(i + 201), role: "user", content: `m${i + 201}`, created_at: "2026-01-01T00:00:00Z",
      })),
      next_cursor: "400",
    },
    {
      items: Array.from({ length: 100 }, (_, i) => ({
        id: String(i + 401), role: "user", content: `m${i + 401}`, created_at: "2026-01-01T00:00:00Z",
      })),
      next_cursor: null,
    },
  ];
  let cursorIdx = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ ok: true, data: pages[cursorIdx++] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  try {
    const r = await api.getHistory("sess-1");
    assert.equal(r.messages.length, 100, "首屏只保留最近 100 条（不是 500 条全塞进 DOM）");
    assert.equal(r.messages[0].id, "401", "首屏第一条 = 第 401 条（" + "seq asc）");
    assert.equal(r.messages[99].id, "500", "首屏最后一条 = 最新那条");
    // nextCursor = 上一页的 cursor（首屏最老那条之前）⇒ 老消息可达，不会像 1134 那样消失。
    assert.equal(r.nextCursor, "200", "nextCursor 指向上一页 ⇒ 老消息可继续取");

    // 用 nextCursor 往前取：服务端从 201 开始 ⇒ 滤掉跟首屏重叠的 401..500 ⇒ 拿到 201..400。
    cursorIdx = 1;
    const older = await api.loadOlderMessages("sess-1", r.nextCursor, r.messages[0].id, 100);
    assert.ok(older.messages.length > 0, "老消息必须取得到（session 1134 的修复不能退化）");
    assert.ok(
      older.messages.every((m) => Number(m.id) <= 400),
      "增量页里不能有首屏已有的消息",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("P6 [T-156] parsePhasesOnce: 一次 JSON.parse，两份结果同源且不改对外行为", async () => {
  const apiSrc = repoSrc("src/lib/api.ts");
  // 静态：生产路径（mapHistoryRows）先调 parsePhasesOnce 一次，再由缓存命中喂 richEvents。
  const parseOnce = apiSrc.match(
    /export function parsePhasesOnce[\s\S]*?\n\}/,
  );
  assert.ok(parseOnce, "找不到 parsePhasesOnce");
  assert.equal(
    (parseOnce[0].match(/JSON\.parse/g) ?? []).length,
    1,
    "★ parsePhasesOnce 里必须恰好一次 JSON.parse",
  );
  assert.match(
    (apiSrc.match(/function mapHistoryRows[\s\S]*?\n\}/)?.[0] ?? ""),
    /parsePhasesOnce\(m\.phases_json\)/,
    "★ 生产路径必须只走 parsePhasesOnce 一次",
  );

  // 运行时：加载真模块，检查两个视图的结果跟老口径逐字一致。
  const { writeModule } = await import("../scripts/lib/schedule-loader.mjs");
  for (const [name, path] of [
    ["notifications", "src/lib/notifications.ts"],
    ["client-capabilities", "src/lib/client-capabilities.ts"],
    ["turn-identity", "src/lib/sse/turn-identity.ts"],
    ["auth-refresh", "src/lib/auth-refresh.ts"],
    ["rich-events", "src/lib/rich-events.ts"],
  ]) {
    writeModule(dir, name, repoSrc(path));
  }
  const api = await import(
    writeModule(dir, "parse-once", apiSrc, {
      rewriteImports: [
        ["auth-refresh", "./auth-refresh.mjs"],
        ["rich-events", "./rich-events.mjs"],
        ["sse/turn-key-header", "./turn-key-header.mjs"],
        ["notifications", "./notifications.mjs"],
        ["client-capabilities", "./client-capabilities.mjs"],
        ["sse/turn-identity", "./turn-identity.mjs"],
      ],
    })
  );
  const raw = JSON.stringify([
    { type: "thinking", text: "a", ts: 1 },
    { type: "thinking", text: "b", ts: 2 },
    { type: "tool", event: { type: "tool_start", id: "t1", tool: "bash", category: "drop" }, ts: 3 },
    { type: "reasoning", content: "skip" },
  ]);
  const out = api.parsePhasesOnce(raw);
  assert.equal(out.phases.length, 3, "相位数组原样（不合并相邻 thinking · T-16）");
  assert.equal(out.phases[0].text, "a");
  assert.equal(out.phases[1].text, "b");
  assert.equal(out.phases[2].type, "tool");
  assert.equal(out.richEvents.length, 1, "tool 事件过归一层 ⇒ 1 条富事件");
  assert.equal(out.richEvents[0].category, undefined, "L-12: category 被丢掉");
  assert.deepEqual(
    api.parsePhasesOnce("{坏 JSON"),
    { phases: undefined, richEvents: undefined },
    "脏 JSON ⇒ 静默降级",
  );
});

test("P7 [T-156] getHistory 处理一条消息 ⇒ phases_json 只 JSON.parse 一次", async () => {
  // 直接加载真 api.ts（依赖平铺），用 JSON.parse spy 数同一字符串被解析了几次。
  const { writeModule } = await import("../scripts/lib/schedule-loader.mjs");
  for (const [name, path] of [
    ["notifications", "src/lib/notifications.ts"],
    ["client-capabilities", "src/lib/client-capabilities.ts"],
    ["turn-identity", "src/lib/sse/turn-identity.ts"],
    ["auth-refresh", "src/lib/auth-refresh.ts"],
    ["rich-events", "src/lib/rich-events.ts"],
  ]) {
    writeModule(dir, name, repoSrc(path));
  }
  const api = await import(
    writeModule(dir, "api-parse-count", repoSrc("src/lib/api.ts"), {
      rewriteImports: [
        ["auth-refresh", "./auth-refresh.mjs"],
        ["rich-events", "./rich-events.mjs"],
        ["sse/turn-key-header", "./turn-key-header.mjs"],
        ["notifications", "./notifications.mjs"],
        ["client-capabilities", "./client-capabilities.mjs"],
        ["sse/turn-identity", "./turn-identity.mjs"],
      ],
    })
  );
  const phasesJson = JSON.stringify([
    { type: "thinking", text: "x", ts: 1 },
    { type: "tool", event: { type: "tool_start", id: "t1", tool: "bash" }, ts: 2 },
  ]);
  const originalFetch = globalThis.fetch;
  const originalParse = JSON.parse;
  let parseCount = 0;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ok: true,
        data: {
          items: [{
            id: "1", role: "assistant", content: "a",
            created_at: "2026-01-01T00:00:00Z", phases_json: phasesJson,
          }],
          next_cursor: null,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  try {
    // 先让模块其它 JSON.parse（响应体等）走完，再开始数目标字符串。
    globalThis.JSON.parse = function (text, ...rest) {
      if (text === phasesJson) parseCount += 1;
      return originalParse.call(this, text, ...rest);
    };
    const r = await api.getHistory("sess-parse-count");
    assert.equal(r.messages.length, 1);
    assert.ok(r.messages[0].phases && r.messages[0].phases.length === 2);
    assert.ok(r.messages[0].richEvents && r.messages[0].richEvents.length === 1);
    assert.equal(
      parseCount,
      1,
      "★ 一条消息的 phases_json 必须只 JSON.parse 一次（旧代码是 2 次）",
    );
  } finally {
    globalThis.JSON.parse = originalParse;
    globalThis.fetch = originalFetch;
  }
});
