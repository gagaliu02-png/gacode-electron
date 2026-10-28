#!/usr/bin/env node
/**
 * verify-deliverable-delete-push.mjs
 *
 * 任务书 05b · W-1 ~ W-5 (a4 契约 v1 · 交付物删除推送 —— PC 端接回)
 *
 * ---------------------------------------------------------------------------
 * 这批在干什么
 * ---------------------------------------------------------------------------
 *   服务端软删交付物后, 会往会话 SSE 推一帧:
 *
 *     data: {"deletedDeliverables":["<yinian_deliverables.id 原值>"]}
 *
 *   PC 端之前**完全没接**这帧 ⇒ 交付中心里那张卡没了, 但**消息气泡里那张卡还在**
 *   ⇒ 用户点进去是死链。
 *
 *   本批 = 让 PC 端: **认这帧 → 记进「已删除交付物」集合 → 气泡里那张卡收敛掉**,
 *   外加**拉模式兜底** (`removedIds`)。
 *
 * ---------------------------------------------------------------------------
 * 逐条对应
 * ---------------------------------------------------------------------------
 *   W-1  认帧 (顶层字段, 不是 events[] 里的一条) —— 认单元素数组;
 *   W-2  持久化到 localStorage: 只增不减 + TTL 180 天 + 按用户隔离;
 *   W-3  气泡收敛: **历史路径与流式路径都滤**, 且 `richEvents` 与 `phases`
 *        **两边都滤** (安卓踩过「空壳气泡」「判定成立但内容空」两个坑);
 *   W-4  交付中心拉完列表要刷新 (确认现有机制, 不重复造);
 *   W-5  ★ 拉模式兜底 `removedIds`: 可选字段 (老服务端没有 ⇒ 不得崩),
 *        写进**同一张**集合, 且「删除必须赢」(同 id 同时在 items 与 removedIds ⇒ 不进列表)。
 *
 *   硬约束: H-1 (判据只有一条, ⛔ 不许查服务端) / H-2 (没 id ⇒ 照常渲染)
 *            / H-3 (⚠️ 2026-10-28 口径订正: **web_preview 参与**判据) / H-4 (端侧零判断)
 *            / H-5 (只增不减 + TTL) / H-6 (按用户隔离) / H-7 (容忍丢帧)
 *            / H-8 (⛔ 不写第三份帧解析器) / H-9 (判据只写一次, 不 inline 进 JSX)
 *            / H-10 (复用既有零件)
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 2026-10-28 · PM 返工交底 (口径订正) —— web_preview 必须参与判据
 * ---------------------------------------------------------------------------
 *   原任务书 05b 的 H-3「web_preview 不参与」是 **PM 写错了**, 这轮改口径。
 *
 *   实证 (gaclaw `src/llm/llm.executors.js:938-946`):
 *     `context.eventCollector.push({ type: 'web_preview', id: id + '_web', ... })`
 *   ⇒ `web_preview` 的事件 id = `<fileId>_web` = `yinian_deliverables` 那一行的
 *     **主键** ⇒ 与 file / image **同一个 id 空间**;
 *   ⇒ 而 PC **渲染** web_preview 气泡 ⇒ 不参与判据 ⇒ 删掉「网站」类交付物后
 *     **气泡里那张 web 卡仍渲染** ⇒ 点开 404 ⇒ **死链还在**。
 *
 *   ⛔ 但 **不许**改 `richEventFamily` / `dedupeRichEvents` ——
 *     那是**去重**规则 (L-14 ~ L-18), `web_preview` 不入族是**对的** (L-16:
 *     它的 id 跟 file 不同, 不该去重)。**去重规则 ≠ 「是不是交付物事件」**。
 *   ⇒ 判据要**独立**判; 且必须新增变异证明:
 *     (a) 把 web_preview 从判据里去掉 ⇒ 断言转红;
 *     (b) 把族判定 / 去重改坏 ⇒ 断言转红 (证明没破坏 L-14 ~ L-18)。
 *
 * ---------------------------------------------------------------------------
 * 断言方式
 * ---------------------------------------------------------------------------
 *   - **运行时**: 用仓库已有的转译加载器把真源码跑起来, 喂真帧 / 真集合。
 *   - **结构性**: 断言打在**去注释后**的源码上 (本仓注释密度极高 —— 不去注释的话
 *     断言会被注释喂饱, 改坏代码照样绿)。
 *   - 本脚本的每条断言都由 `scripts/verify-mutation-counterproof-deliverable.mjs`
 *     做**变异反证** (改坏 ⇒ 必须转红 ⇒ 逐字节还原)。
 *
 * 退出码: 0 = 通过 / 1 = 有断言失败。
 *
 * 用法: node scripts/verify-deliverable-delete-push.mjs  (必须在仓库根跑)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeTmpDir, writeModule } from "./lib/schedule-loader.mjs";
import { stripComments } from "./lib/strip-comments.mjs";
import { extractDecl, extractFunction } from "./lib/source-scan.mjs";

let fail = 0;
let passCount = 0;
const pass = (m) => {
  passCount++;
  console.log(`  ✅ ${m}`);
};
const miss = (m) => {
  fail++;
  console.log(`  ❌ ${m}`);
};
const log = (...a) => console.log(...a);
const repoSrc = (p) => readFileSync(join(process.cwd(), p), "utf8");
const repoCode = (p) => stripComments(repoSrc(p), p);

// ===========================================================================
// 0. 本机 localStorage 桩 —— PC 端跑在 Electron 里, Node 下没有 localStorage
// ===========================================================================
// ⚠️ `deliverable-deleted-store.ts` 的 `storage()` 在**调用时**读 `localStorage`
//   (不是 import 时) ⇒ 这里在 import 之前挂上全局桩即可。
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    mem.set(k, String(v));
  },
  removeItem: (k) => {
    mem.delete(k);
  },
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
};
const rawStore = (userId) => {
  const key = `gacode.chat.deleted-deliverables.v1.${userId}`;
  const raw = mem.get(key);
  // ⚠️ 返回 `{}` 而不是 null —— 变异台会把落盘 key 改掉, 这里读到空**不该**把
  //   整个断言脚本炸掉 (炸掉 ⇒ 汇总行打不出来 ⇒ 变异台判「不是变红」)。
  //   读到空本身就是一条可断言的事实 (落盘 layout 变了)。
  return raw ? JSON.parse(raw) : {};
};

/**
 * safeCall —— 调用被测函数, 把异常收成「失败」而不是「脚本崩掉」。
 *
 * ⚠️ 变异台里有「把可选字段当必填」这类变异 (故意抛异常) ⇒ 断言脚本必须能
 *   **优雅地**报告失败, 而不是整个炸掉 —— 否则汇总行 (`===PASS=n FAIL=m===`)
 *   打不出来, 变异台就判不出「变红」。
 */
const safeCall = (fn, ...args) => {
  try {
    return { ok: true, value: fn(...args) };
  } catch (e) {
    return { ok: false, error: e };
  }
};

// ===========================================================================
// 1. 被测对象 —— 真源码转译后 import
// ===========================================================================
const dir = makeTmpDir("verify-deliverable-delete");

// `chat-sse.ts` 依赖 `./notifications-sse` 的 SseFrameParser —— 那个模块整体 import 了
//   react / react-router / react-query (通知中心的 UI 桥), 运行时加载不了。
//   ⇒ 只把**纯逻辑**那两块用 AST 抠出来落成桩模块 (抠的是真源码, 不是复写一遍)。
{
  const nsSrc = repoSrc("src/lib/notifications-sse.ts");
  const parserDecl = extractDecl(nsSrc, "SseFrameParser", "src/lib/notifications-sse.ts");
  const parseFn = extractFunction(nsSrc, "parseSseFrame", "src/lib/notifications-sse.ts");
  if (!parserDecl || !parseFn) {
    console.log(
      "❌ 从 src/lib/notifications-sse.ts 里抠不出 SseFrameParser / parseSseFrame —— 源文件结构变了?",
    );
    process.exit(1);
  }
  writeModule(dir, "notifications-sse", `${parserDecl}\n\n${parseFn}\n`);
}

// rich-events.ts 零 import —— 直接落。
//   ⚠️ 落点 URL 要留着: 口径订正后要**运行时**断言族判定 / 去重契约 (L-14 ~ L-18)
//     —— 证明「本批没借改族判定的手脚去改判据」。
const richEventsUrl = writeModule(dir, "rich-events", repoSrc("src/lib/rich-events.ts"));

// ⚠️ `api` 桩 —— **只为了反证用**。
//   变异台会把「判据改成查服务端」这条变异打进 `deliverable-visibility.ts`
//   (即给它加一行 `import { listDeliverables } from "./api"`)。
//   若不铺这个桩, 变异后的模块会因为 `ERR_MODULE_NOT_FOUND` **在 import 处炸掉**
//   ⇒ 断言脚本「崩溃」而不是「变红」⇒ 反证台判 FAIL (打不响「改坏就转红」这条)。
//   铺了桩之后, 变异能被正常加载 ⇒ 走到 H-1 那条断言 ⇒ 变红 ⇒ 反证成立。
writeModule(
  dir,
  "api-stub",
  [
    "export async function listDeliverables() { return { items: [], total: 0, page: 1, pageSize: 0, hasMore: false }; }",
    "export async function deleteDeliverable() { return { ok: true }; }",
    "export async function getDeliverable() { return null; }",
  ].join("\n"),
);

const visibilityUrl = writeModule(
  dir,
  "deliverable-visibility",
  repoSrc("src/lib/deliverable-visibility.ts"),
  {
    rewriteImports: [
      ["./rich-events", "./rich-events.mjs"],
      ["./api", "./api-stub.mjs"],
    ],
  },
);
const storeUrl = writeModule(
  dir,
  "deliverable-deleted-store",
  repoSrc("src/lib/deliverable-deleted-store.ts"),
);
const chatSseUrl = writeModule(dir, "chat-sse", repoSrc("src/lib/chat-sse.ts"), {
  rewriteImports: [
    ["./notifications-sse", "./notifications-sse.mjs"],
    ["./rich-events", "./rich-events.mjs"],
  ],
});

const V = await import(visibilityUrl);
const D = await import(storeUrl);
const S = await import(chatSseUrl);
// 族判定 / 去重的**真**实现 —— 口径订正后要断言它没被本批改坏。
const RE = await import(richEventsUrl);

const enc = new TextEncoder();
const streamOf = (text) =>
  new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(text));
      c.close();
    },
  });

// ===========================================================================
// A. W-1 · 认帧 (顶层字段 `deletedDeliverables`)
// ===========================================================================

log("A. W-1 · 认帧 (顶层字段 `deletedDeliverables`)");

{
  const one = S.parseDeletedDeliverables({ deletedDeliverables: ["d1"] });
  Array.isArray(one) && one.length === 1 && one[0] === "d1"
    ? pass("★ 单元素数组也能认出来 (W-1)")
    : miss(`单元素数组认不出来: ${JSON.stringify(one)}`);
}

{
  const many = S.parseDeletedDeliverables({ deletedDeliverables: ["d1", "d2", "d3"] });
  Array.isArray(many) && many.length === 3 && many[2] === "d3"
    ? pass("多元素数组全认出来")
    : miss(`多元素数组认不全: ${JSON.stringify(many)}`);
}

{
  const none = S.parseDeletedDeliverables({ content: "hi" });
  none === null
    ? pass("没有这个顶层字段 ⇒ 返回 null (不是删除帧 ⇒ 调用方按原样处理)")
    : miss(`没有该字段时返回了 ${JSON.stringify(none)} (应为 null)`);
}

{
  const bad = S.parseDeletedDeliverables({ deletedDeliverables: "d1" });
  bad === null
    ? pass("字段不是数组 ⇒ 返回 null (不当成删除帧)")
    : miss(`字段不是数组时返回了 ${JSON.stringify(bad)}`);
}

{
  const empty = S.parseDeletedDeliverables({ deletedDeliverables: [] });
  Array.isArray(empty) && empty.length === 0
    ? pass("空数组 ⇒ 是删除帧但没有 id (调用方按「无事发生」处理)")
    : miss(`空数组返回了 ${JSON.stringify(empty)}`);
}

{
  const dirty = S.parseDeletedDeliverables({
    deletedDeliverables: ["  d1  ", "", "   ", 42, null, "d2"],
  });
  Array.isArray(dirty) && dirty.length === 2 && dirty[0] === "d1" && dirty[1] === "d2"
    ? pass("非串元素被剔掉 / 串被 trim / 空串丢弃")
    : miss(`脏 id 处理不对: ${JSON.stringify(dirty)}`);
}

// ★ a4 的帧是**顶层字段**, 不是 events[] 里的一条 ⇒ 必须能活过归一层。
{
  const chunk = { deletedDeliverables: ["d1"], content: "x" };
  const norm = S.normalizeChatChunk(chunk);
  const ids = S.parseDeletedDeliverables(norm);
  Array.isArray(ids) && ids.length === 1 && ids[0] === "d1"
    ? pass("★ 顶层字段活过归一层 normalizeChatChunk (老端侧天然安全)")
    : miss(`归一层把顶层字段吃了: ${JSON.stringify(norm)}`);
}

{
  // 这帧**不带 `id:` 行** ⇒ 游标不推进 (契约 §二 / 读帧层 L-34)。
  const res = await S.readChatSse(streamOf('data: {"deletedDeliverables":["d1"]}\n\n'), {
    onData: () => {},
  });
  res.cursor === null
    ? pass("★ 删除帧不带 `id:` ⇒ 游标不推进 (契约 L-34)")
    : miss(`删除帧把游标推到了 ${JSON.stringify(res.cursor)}`);
}

{
  const res = await S.readChatSse(
    streamOf('id: 42\ndata: {"deletedDeliverables":["d1"]}\n\n'),
    { onData: () => {} },
  );
  res.cursor === "42"
    ? pass("删除帧夹在带 id 的帧后 ⇒ 游标保持原值不变")
    : miss(`游标变成了 ${JSON.stringify(res.cursor)}`);
}

// ===========================================================================
// B. W-2 · 持久化 (只增不减 + TTL 180 天 + 按用户隔离)
// ===========================================================================

log("B. W-2 · 持久化 (只增不减 + TTL 180 天 + 按用户隔离)");

mem.clear();

{
  const added = D.recordDeletedDeliverables("u1", ["d1", "d2"]);
  added.length === 2 && added.includes("d1") && added.includes("d2")
    ? pass("记录两个 id ⇒ 返回「本次新增」的两个")
    : miss(`返回的新增 id 不对: ${JSON.stringify(added)}`);
}

{
  const store = rawStore("u1");
  store && store.d1 !== undefined && store.d2 !== undefined
    ? pass("★ 落盘了 (刷新页面后能 hydrate 回来)")
    : miss(`没落盘: ${JSON.stringify(store)}`);
}

{
  // 只增不减 + 幂等: 重复记录 ⇒ 不返回新增, 时间戳**保持首次**。
  const first = rawStore("u1").d1;
  const again = D.recordDeletedDeliverables("u1", ["d1"]);
  const after = rawStore("u1").d1;
  again.length === 0 && after === first
    ? pass("★ 只增不减 + 幂等 (重复记录不返回新增、时间戳不覆盖)")
    : miss(`幂等不对: added=${JSON.stringify(again)} ts ${first} → ${after}`);
}

{
  // 已记录的 id 不会因为后来收到别的 id 而被抹掉。
  D.recordDeletedDeliverables("u1", ["d3"]);
  const s = rawStore("u1");
  s.d1 !== undefined && s.d2 !== undefined && s.d3 !== undefined
    ? pass("★ 只增不减 (新来的 id 不会把老的挤掉)")
    : miss(`集合被改动了: ${JSON.stringify(s)}`);
}

{
  const ttl = D.DELETED_DELIVERABLE_TTL_MS;
  ttl === 180 * 24 * 60 * 60 * 1000
    ? pass("★ TTL = 180 天 (安卓 DELETED_RETENTION_MS 同值)")
    : miss(`TTL 不是 180 天: ${ttl}`);
}

{
  // TTL 到期的条目不算已删除, 且会被剔掉。
  mem.clear();
  const old = Date.now() - (181 * 24 * 60 * 60 * 1000);
  mem.set("gacode.chat.deleted-deliverables.v1.u1", JSON.stringify({ dOld: old, dNew: Date.now() }));
  const set = D.readDeletedDeliverables("u1");
  set.has("dOld") === false && set.has("dNew") === true
    ? pass("★ TTL 过期 ⇒ 不算已删除 (集合是「最近 180 天内被删的」)")
    : miss(`TTL 过滤不对: ${JSON.stringify([...set])}`);
}

{
  const removed = D.pruneDeletedDeliverables("u1");
  const s = rawStore("u1");
  removed === 1 && s.dOld === undefined && s.dNew !== undefined
    ? pass("★ prune 把过期条目从落盘里剔掉")
    : miss(`prune 不对: removed=${removed} store=${JSON.stringify(s)}`);
}

{
  // 按用户隔离 (H-6)。
  mem.clear();
  D.recordDeletedDeliverables("alice", ["secret-1"]);
  D.recordDeletedDeliverables("bob", ["bob-1"]);
  const a = D.readDeletedDeliverables("alice");
  const b = D.readDeletedDeliverables("bob");
  a.has("secret-1") && !a.has("bob-1") && b.has("bob-1") && !b.has("secret-1")
    ? pass("★ 按用户隔离 (换用户看到的是他自己那张集合)")
    : miss(`按用户隔离不对: alice=${JSON.stringify([...a])} bob=${JSON.stringify([...b])}`);
}

{
  const k1 = D.deletedDeliverablesStorageKey("alice");
  const k2 = D.deletedDeliverablesStorageKey("bob");
  k1.includes("alice") && k2.includes("bob") && k1 !== k2
    ? pass("★ localStorage key 里带 userId (两个用户两个 key)")
    : miss(`key 没带 userId: ${k1} / ${k2}`);
}

{
  // 没登录 (空 userId) ⇒ 不写盘、不返回。
  mem.clear();
  const added = D.recordDeletedDeliverables("", ["d1"]);
  added.length === 0 && mem.size === 0
    ? pass("没 userId ⇒ 不落盘 (不串号)")
    : miss(`没 userId 时落盘了: ${JSON.stringify([...mem.keys()])}`);
}

{
  // H-4 · 端侧零判断: 记一个**本地根本不存在的** id ⇒ 也照记。
  mem.clear();
  const added = D.recordDeletedDeliverables("u1", ["never-existed-xyz"]);
  added.length === 1 && D.isDeliverableDeleted("u1", "never-existed-xyz")
    ? pass("★ 端侧零判断 (收到 id 就记, 不查本地有没有这个交付物)")
    : miss("端侧做了前置判断 (没本地存在的 id 不记)");
}

// ===========================================================================
// C. W-3 · 气泡收敛 (判据只有一条)
// ===========================================================================

log("C. W-3 · 气泡收敛 (判据只有一条)");

{
  V.deliverableIdOf({ type: "file", id: "d1" }) === "d1" &&
  V.deliverableIdOf({ type: "image", id: "d1" }) === "d1"
    ? pass("file / image 事件 ⇒ 取到交付物主键")
    : miss("file / image 事件取不到主键");
}

{
  V.deliverableIdOf({ type: "tool_done", subtype: "file", id: "d1" }) === "d1" &&
  V.deliverableIdOf({ type: "tool_done", subtype: "image", id: "d1" }) === "d1"
    ? pass("★ tool_done[file|image] 也参与 (PC 渲染这两张卡, 同族同 id)")
    : miss("tool_done[file|image] 没参与判据 (旧协议那张卡会变死链)");
}

{
  // H-3 · ⚠️ 2026-10-28 口径订正 · web_preview **参与**判据。
  //   它的 id (`<fileId>_web`) 就是 `yinian_deliverables` 那一行的**主键**
  //   (gaclaw llm.executors.js:943-946) ⇒ 与 file / image 同一个 id 空间。
  //   ⇒ 不参与 ⇒ 用户删掉「网站」类交付物后, 气泡里那张 web 卡仍渲染 ⇒ 死链还在。
  V.deliverableIdOf({ type: "web_preview", id: "d1_web" }) === "d1_web"
    ? pass("★ H-3(口径订正) web_preview 参与判据 (id = <fileId>_web = DB 主键)")
    : miss("H-3(口径订正) web_preview 没参与判据 (网站类交付物删掉后死链还在)");
}

{
  // H-2 对 web_preview 同样成立 —— 没带 id ⇒ 照常渲染, 绝不误杀。
  V.deliverableIdOf({ type: "web_preview" }) === null &&
  V.deliverableIdOf({ type: "web_preview", id: "" }) === null
    ? pass("H-2 web_preview 没带 id / 空 id ⇒ 不参与判据")
    : miss("H-2 web_preview 空 id 被当成了交付物主键");
}

{
  // 非交付物事件一律不参与 —— `tool_start` / `tool_fail` / 无 subtype 的 `tool_done`
  //   / `result` / `qrcode` 都不是交付物事件 (a4 契约 §三 那张表的最后一行)。
  const notDeliverables = [
    { type: "tool_start", id: "x1" },
    { type: "tool_fail", id: "x2" },
    { type: "tool_done", id: "x3" },
    { type: "tool_done", subtype: "code_diff", id: "x4" },
    { type: "result", id: "x5" },
    { type: "qrcode", id: "x6" },
  ];
  const leaked = notDeliverables.filter((e) => V.deliverableIdOf(e) !== null);
  leaked.length === 0
    ? pass("非交付物事件 (tool_start / tool_fail / 无 subtype 的 tool_done / result / qrcode) 都不参与判据")
    : miss(`非交付物事件混进判据了: ${JSON.stringify(leaked)}`);
}

{
  V.deliverableIdOf({ type: "tool_done", id: "d1" }) === null
    ? pass("无 subtype 的 tool_done 不参与 (不是交付物)")
    : miss("无 subtype 的 tool_done 混进判据了");
}

{
  // H-2 · 没带 id 的事件 ⇒ 不参与 ⇒ 照常渲染。
  V.deliverableIdOf({ type: "file" }) === null &&
  V.deliverableIdOf({ type: "file", id: "" }) === null
    ? pass("★ H-2 没带 id / 空 id ⇒ 不参与判据")
    : miss("H-2 空 id 被当成了交付物主键");
}

{
  const set = new Set(["d1"]);
  V.isDeletedDeliverable({ type: "file", id: "d1" }, set) === true &&
  V.isDeletedDeliverable({ type: "file", id: "d2" }, set) === false &&
  V.isDeletedDeliverable({ type: "file" }, set) === false
    ? pass("★ 判据只有一条: 事件带了主键 且 主键在已删除集合里")
    : miss("判据不对");
}

{
  const events = [
    { type: "file", id: "d1" },
    { type: "image", id: "d2" },
    { type: "tool_done", subtype: "file", id: "d3" },
    { type: "tool_done", subtype: "image", id: "d4" },
    { type: "web_preview", id: "d1_web" },
    { type: "tool_done", id: "d5" },
    { type: "file" },
  ];
  const kept = V.filterDeletedDeliverableEvents(events, new Set(["d1", "d3", "d4"]));
  const keptIds = kept.map((e) => `${e.type}:${e.subtype ?? ""}:${e.id ?? ""}`);
  const want = [
    "image::d2",
    "web_preview::d1_web",
    "tool_done::d5",
    "file::",
  ];
  JSON.stringify(keptIds) === JSON.stringify(want)
    ? pass("★ 已删除的 file/image/tool_done 全部滤掉; 没在集合里的 web_preview / 无 id / 无 subtype 全留")
    : miss(`滤完剩的不是预期那批: ${JSON.stringify(keptIds)}`);
}

{
  // 口径订正的**后果**: 「网站」类交付物删掉 (a4 帧带的是 `<fileId>_web`) ⇒
  //   气泡里那张 web 卡必须**收敛掉** —— 否则死链还在 (这批要解决的正是死链)。
  const events = [
    { type: "file", id: "d1" },
    { type: "web_preview", id: "d1_web" },
    { type: "image", id: "d2" },
  ];
  const kept = V.filterDeletedDeliverableEvents(events, new Set(["d1_web"]));
  const keptIds = kept.map((e) => `${e.type}:${e.id ?? ""}`);
  JSON.stringify(keptIds) === JSON.stringify(["file:d1", "image:d2"])
    ? pass("★ 已删除的 web_preview 被滤掉 (网站类交付物删掉后气泡不剩死链)")
    : miss(`web_preview 没被滤掉: ${JSON.stringify(keptIds)}`);
}

{
  // phases 侧同样要滤 web_preview —— 只滤 events 会留「空壳气泡」。
  const phases = [
    { type: "tool", event: { type: "web_preview", id: "d1_web" } },
    { type: "tool", event: { type: "file", id: "d2" } },
    { type: "thinking", text: "想一下" },
  ];
  const kept = V.filterDeletedDeliverablePhases(phases, new Set(["d1_web"]));
  kept.length === 2 &&
  kept[0].event.type === "file" &&
  kept[1].type === "thinking"
    ? pass("★ phases 侧也滤 web_preview (只滤 events ⇒ 空壳气泡)")
    : miss(`phases 没滤 web_preview: ${JSON.stringify(kept)}`);
}

{
  const events = [{ type: "file", id: "d1" }];
  const same = V.filterDeletedDeliverableEvents(events, new Set());
  same === events
    ? pass("集合为空 ⇒ 原样返回 (同一个引用, 零开销)")
    : miss("集合为空时没有原样返回");
}

{
  // phases 也要滤 —— 只滤 events 会留「空壳气泡」。
  const phases = [
    { type: "thinking", text: "想一下" },
    { type: "tool", event: { type: "file", id: "d1" } },
    { type: "tool", event: { type: "tool_done", subtype: "image", id: "d2" } },
    { type: "tool", event: { type: "tool_start", id: "d3" } },
    { type: "tool" },
  ];
  const kept = V.filterDeletedDeliverablePhases(phases, new Set(["d1", "d2"]));
  kept.length === 3 &&
  kept[0].type === "thinking" &&
  kept[1].event.type === "tool_start" &&
  kept[2].event === undefined
    ? pass("★ phases 侧也滤 (只滤 events ⇒ 空壳气泡)")
    : miss(`phases 滤得不对: ${JSON.stringify(kept)}`);
}

{
  const phases = [{ type: "tool", event: { type: "file", id: "d1" } }];
  const same = V.filterDeletedDeliverablePhases(phases, new Set());
  same === phases
    ? pass("phases: 集合为空 ⇒ 原样返回")
    : miss("phases: 集合为空时没有原样返回");
}

// ===========================================================================
// D. W-5 · 拉模式兜底 (removedIds)
// ===========================================================================

log("D. W-5 · 拉模式兜底 (removedIds)");

{
  const items = [{ id: "a" }, { id: "b" }];
  const r = safeCall(V.filterRemovedDeliverableItems, items, ["a"]);
  const kept = r.ok ? r.value : [];
  r.ok && kept.length === 1 && kept[0].id === "b"
    ? pass("★ 「删除必须赢」: 同一个 id 同时在 items 与 removedIds ⇒ 不进列表")
    : miss(`删除没赢: ${r.ok ? JSON.stringify(kept) : String(r.error)}`);
}

{
  const items = [{ id: "a" }];
  const r = safeCall(V.filterRemovedDeliverableItems, items, undefined);
  r.ok && Array.isArray(r.value) && r.value.length === 1
    ? pass("★ removedIds 缺失 (老服务端) ⇒ 不崩、不当错误, 列表原样")
    : miss(`removedIds 缺失时崩了 / 行为不对: ${r.ok ? JSON.stringify(r.value) : String(r.error)}`);
}

{
  const items = [{ id: "a" }];
  const r = safeCall(V.filterRemovedDeliverableItems, items, undefined);
  r.ok && r.value === items
    ? pass("removedIds 缺失 ⇒ 原样返回 (同一个引用)")
    : miss("removedIds 缺失时没有原样返回");
}

{
  const items = [{ id: "a" }];
  const rNull = safeCall(V.filterRemovedDeliverableItems, items, null);
  const rEmpty = safeCall(V.filterRemovedDeliverableItems, items, []);
  rNull.ok &&
  rEmpty.ok &&
  rNull.value === items &&
  rEmpty.value.length === 1
    ? pass("removedIds 为 null / 空数组 ⇒ 原样返回")
    : miss("removedIds 为 null / 空数组时行为不对");
}

{
  const r = safeCall(V.filterRemovedDeliverableItems, undefined, ["a"]);
  r.ok && Array.isArray(r.value) && r.value.length === 0
    ? pass("items 缺失 ⇒ 返回空数组 (不崩)")
    : miss(`items 缺失时返回了 ${r.ok ? JSON.stringify(r.value) : String(r.error)}`);
}

// ===========================================================================
// E. 结构性断言 (打在去注释后的源码上)
// ===========================================================================

log("E. 结构性断言");

// E-1 · api.ts: removedIds 必须是**可选**字段 (老服务端没有它)。
{
  const decl = extractDecl(repoSrc("src/lib/api.ts"), "DeliverableListResponse", "src/lib/api.ts");
  decl && /removedIds\?:\s*string\[\]/.test(decl)
    ? pass("★ api.ts: DeliverableListResponse.removedIds 是**可选**字段 (老服务端没有 ⇒ undefined)")
    : miss(`api.ts: removedIds 不是可选字段: ${(decl || "").slice(0, 200)}`);
}

// E-2 · api.ts: 既有函数零改动 (本批只准加导出)。
{
  const code = repoCode("src/lib/api.ts");
  /listDeliverables/.test(code) && /deleteDeliverable/.test(code)
    ? pass("api.ts 既有导出仍在 (listDeliverables / deleteDeliverable)")
    : miss("api.ts 既有导出不见了");
}

// E-3 · Deliveries.tsx: 拉模式兜底接线 + 「删除必须赢」走共享判据 (H-9)。
{
  const code = repoCode("src/routes/Deliveries.tsx");
  /pageData\.removedIds/.test(code) &&
  /recordDeletedDeliverables\(\s*userId\s*,\s*removed\s*\)/.test(code)
    ? pass("★ Deliveries.tsx: 拉模式把 removedIds 写进**同一张**集合 (W-5)")
    : miss("Deliveries.tsx: removedIds 没写进「已删除交付物」集合");

  const helperCalls = (code.match(/filterRemovedDeliverableItems\(/g) || []).length;
  const inlineIdFilter = /\.filter\(\s*\(\s*\w+\s*\)\s*=>\s*!\s*\w*removed/.test(code);
  helperCalls >= 2 && !inlineIdFilter
    ? pass(`★ H-9 Deliveries.tsx 的「删除必须赢」走共享纯函数 (${helperCalls} 处调用, 没 inline 判据)`)
    : miss(
        `H-9 Deliveries.tsx 自己 inline 了一份「删除必须赢」的判据 (共享纯函数调用 ${helperCalls} 处)`,
      );
}

// E-4 · Deliveries.tsx: 删除成功 (服务端 200) ⇒ 也记进集合。
{
  const code = repoCode("src/routes/Deliveries.tsx");
  /recordDeletedDeliverables\(\s*userId\s*,\s*\[\s*id\s*\]\s*\)/.test(code)
    ? pass("★ 交付中心自己删成功 (服务端 200) ⇒ 也记 (此刻收不到 a4 帧)")
    : miss("交付中心删除成功后没记进集合");
}

// E-5 · W-4 · 交付中心拉完列表要刷新 —— 确认**现有**机制, 不重复造。
{
  const code = repoCode("src/routes/Deliveries.tsx");
  // ⚠️ 必须**只看 handleRefresh 这一个函数** —— Deliveries.tsx 里还有一处
  //   `invalidateQueries({ queryKey: ["deliverables"] })` (删除成功后) ⇒
  //   整文件扫会「一处在就绿」, 把刷新按钮拆了照样绿 (假绿)。
  const refreshFn = extractFunction(code, "handleRefresh", "src/routes/Deliveries.tsx");
  refreshFn &&
  /invalidateQueries\(\{\s*queryKey:\s*\[\s*"deliverables"/.test(refreshFn)
    ? pass("★ W-4 交付中心刷新机制已存在 (handleRefresh → invalidateQueries([\"deliverables\"]))")
    : miss("W-4 交付中心刷新机制不见了");
}

// E-6 · ChatDetail.tsx: 认帧 + 两条路径 × 两个集合 都要滤。
{
  const code = repoCode("src/routes/ChatDetail.tsx");
  /parseDeletedDeliverables\(/.test(code) &&
  /markDeletedDeliverables\(/.test(code)
    ? pass("★ ChatDetail.tsx 在消费层认这帧 (不改帧解析器)")
    : miss("ChatDetail.tsx 没认这帧");

  const memo = extractDecl(repoSrc("src/routes/ChatDetail.tsx"), "messages", "src/routes/ChatDetail.tsx");
  if (!memo) {
    miss("抠不出 ChatDetail.tsx 的 messages 记忆块 —— 源文件结构变了?");
  } else {
    const evCalls = (memo.match(/filterDeletedDeliverableEvents\(/g) || []).length;
    const phCalls = (memo.match(/filterDeletedDeliverablePhases\(/g) || []).length;
    evCalls >= 2 && phCalls >= 2
      ? pass(`★ W-3 历史路径 + 流式路径都滤 (events ×${evCalls}, phases ×${phCalls})`)
      : miss(`W-3 有一路没滤: events ×${evCalls}, phases ×${phCalls}`);

    const argOk =
      /filterDeletedDeliverableEvents\(\s*[^,]+,\s*deletedDeliverableIds\s*,?\s*\)/.test(memo) &&
      /filterDeletedDeliverablePhases\(\s*[^,]+,\s*deletedDeliverableIds\s*,?\s*\)/.test(memo);
    argOk
      ? pass("过滤器的第二个参数是「已删除交付物」集合 (判据没走别的来源)")
      : miss("过滤器没有拿「已删除交付物」集合当判据");

    /deletedDeliverableIds/.test(memo) && /\[/.test(memo)
      ? pass("「已删除交付物」集合进了记忆块的依赖 (变了会重算)")
      : miss("「已删除交付物」集合没进记忆块依赖");
  }
}

// E-7 · ChatDetail.tsx: 进场 / 换用户 ⇒ 从落盘 hydrate (W-2 / H-6)。
{
  const code = repoCode("src/routes/ChatDetail.tsx");
  /readDeletedDeliverables\(/.test(code) && /pruneDeletedDeliverables\(/.test(code)
    ? pass("★ 进场 / 换用户 ⇒ 从本机落盘 hydrate 回「已删除交付物」集合 (刷新后死链卡不回来)")
    : miss("进场没有 hydrate 回「已删除交付物」集合");
}

// E-8 · H-1 · 判据不许查服务端 —— 判据所在的模块里不得有网络调用。
{
  const code = repoCode("src/lib/deliverable-visibility.ts");
  !/\bfetch\s*\(/.test(code) && !/\bapi\./.test(code) && !/from\s+"\.\/api"/.test(code)
    ? pass("★ H-1 判据模块是纯函数 (零网络请求 —— ⛔ 不得「查服务端这个 id 还在不在」)")
    : miss("H-1 判据模块里有网络调用 (查服务端会把老会话气泡全判成消失)");
}

// E-9 · H-9 · 判据只写一次 —— 组件层不许 inline 判据。
{
  const bubble = repoCode("src/components/chat/RichEventBubble.tsx");
  !/deletedDeliverable/.test(bubble) && !/deliverable-visibility/.test(bubble)
    ? pass("★ H-9 渲染组件里没有 inline 判据 (判据只在 lib/deliverable-visibility.ts)")
    : miss("H-9 渲染组件里 inline 了判据");
}

// E-10 · H-8 · ⛔ 不写第三份帧解析器。
{
  const chatSse = repoCode("src/lib/chat-sse.ts");
  /from\s+"\.\/notifications-sse"/.test(chatSse)
    ? pass("★ H-8 chat-sse.ts 仍复用通知流的 SseFrameParser (没写第三份)")
    : miss("H-8 chat-sse.ts 另写了一套帧解析器");

  const vis = repoCode("src/lib/deliverable-visibility.ts");
  !/EventSource/.test(vis) && !/SseFrameParser/.test(vis)
    ? pass("H-8 判据模块里没有第二套 SSE 解析")
    : miss("H-8 判据模块里出现了 SSE 解析");
}

// E-11 · H-10 · 复用既有零件 —— 不新建平行交付物模块。
{
  const vis = repoCode("src/lib/deliverable-visibility.ts");
  /from\s+"\.\/rich-events"/.test(vis) &&
  /eventIdOf/.test(vis)
    ? pass("★ H-10 判据复用 rich-events 的取 id (没重写一份)")
    : miss("H-10 判据没有复用 rich-events 的取 id");

  const store = repoCode("src/lib/deliverable-deleted-store.ts");
  /localStorage/.test(store)
    ? pass("H-10 落盘走 localStorage (PC 端唯一可用的浏览器存储)")
    : miss("H-10 落盘没用 localStorage");
}

// E-13 · 口径订正 · ⛔ 判据不许拿「去重族判定」当判据。
//   `richEventFamily` 是 L-14 ~ L-18 的**去重**规则 —— `web_preview` 不入族是**对的**
//   (L-16: 它的 id 跟 file 不同, 不该去重) ⇒ 拿它当判据 ⇒ web 类交付物永远漏判
//   ⇒ 死链还在 ⇒ 判据必须**独立**判「是不是交付物事件」。
{
  const vis = repoCode("src/lib/deliverable-visibility.ts");
  !/richEventFamily/.test(vis)
    ? pass("★ 口径订正: 判据**独立**判「是不是交付物事件」, 没拿 richEventFamily 当判据")
    : miss("判据拿了 richEventFamily 当判据 (web_preview 不入族 ⇒ 漏判 ⇒ 死链还在)");
}

// E-14 · L-14 ~ L-18 · 族判定 / 去重契约**没被本批改坏**。
//   口径订正只许改「删除集判据」, ⛔ 不许动「去重规则」—— 这里运行时盯住。
{
  const fam = (e) => RE.richEventFamily(e);

  fam({ type: "file" }) === "file" &&
  fam({ type: "image" }) === "image" &&
  fam({ type: "tool_done", subtype: "file" }) === "file" &&
  fam({ type: "tool_done", subtype: "image" }) === "image"
    ? pass("★ L-15 族判定没被改坏 (file / image / tool_done[file|image])")
    : miss("L-15 族判定被改坏了");

  fam({ type: "web_preview" }) === null
    ? pass("★ L-16 web_preview 仍不入族 (它是**去重**规则, 不许拿它当删除集判据)")
    : miss("L-16 族判定把 web_preview 归进了族 (web_preview 与 file 不该去重)");

  fam({ type: "tool_done" }) === null && fam({ type: "tool_start" }) === null
    ? pass("L-15 无 subtype 的 tool_done / tool_start 仍不入族")
    : miss("L-15 族判定把无 subtype 的 tool_done / tool_start 归进了族");

  const legacyFirst = RE.dedupeRichEvents([
    { type: "tool_done", subtype: "file", id: "d1" },
    { type: "file", id: "d1" },
  ]);
  legacyFirst.length === 1 && legacyFirst[0].type === "file"
    ? pass("★ L-15 同族同 id 只留一条 (旧协议先到 ⇒ 换成新协议那条)")
    : miss(`L-15 去重不对: ${JSON.stringify(legacyFirst)}`);

  const newFirst = RE.dedupeRichEvents([
    { type: "file", id: "d1" },
    { type: "tool_done", subtype: "file", id: "d1" },
  ]);
  newFirst.length === 1 && newFirst[0].type === "file"
    ? pass("★ L-15 同族同 id 且新协议先到 ⇒ 仍然留新协议那条 (file)")
    : miss("L-15 去重把新协议那条丢了 (新协议先到时被旧协议顶掉)");

  const withWeb = RE.dedupeRichEvents([
    { type: "file", id: "d1" },
    { type: "web_preview", id: "d1_web" },
  ]);
  withWeb.length === 2
    ? pass("★ L-16 web_preview 与 file 不去重 (两个都在)")
    : miss(`L-16 web_preview 被去重掉了: ${JSON.stringify(withWeb)}`);

  const crossFamily = RE.dedupeRichEvents([
    { type: "file", id: "x" },
    { type: "image", id: "x" },
  ]);
  crossFamily.length === 2
    ? pass("★ L-16 跨族不去重 (file 与 image 同 id 都留)")
    : miss(`L-16 跨族被去重了: ${JSON.stringify(crossFamily)}`);
}

// E-12 · H-11 / H-12 —— 本批只在 PC 仓里动 (脚本自查: 被测文件都在本仓 src/ 下)。
{
  const touched = [
    "src/lib/chat-sse.ts",
    "src/lib/api.ts",
    "src/lib/deliverable-visibility.ts",
    "src/lib/deliverable-deleted-store.ts",
    "src/routes/ChatDetail.tsx",
    "src/routes/Deliveries.tsx",
  ];
  const missing = touched.filter((f) => {
    try {
      readFileSync(join(process.cwd(), f), "utf8");
      return false;
    } catch {
      return true;
    }
  });
  missing.length === 0
    ? pass("H-11/H-12 本批涉及的 6 个文件都在 PC 仓 src/ 下")
    : miss(`找不到: ${missing.join(", ")}`);
}

log("");
log("=== 汇总 ===");
if (fail === 0) {
  console.log(
    "✅ a4 交付物删除推送验收全过 (认帧 + 落盘 + 气泡收敛 + 拉模式兜底 + 硬约束)",
  );
  console.log(`===PASS=${passCount} FAIL=${fail}===`);
} else {
  console.log(`❌ 有 ${fail} 条断言失败`);
  console.log(`===PASS=${passCount} FAIL=${fail}===`);
}
log(`===EXIT=${fail === 0 ? 0 : 1}===`);
process.exit(fail === 0 ? 0 : 1);
