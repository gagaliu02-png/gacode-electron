// [P2 · 2026-11-17] PC 端上行线 —— **disposition / 双发 ack / 安全边界停止 / 看门狗分级**
//
// ---------------------------------------------------------------------------
// 钉什么（服务端 unified-api `08b2c9e` / gaclaw `2e28c84` 已上线）
//
//   ① `disposition` —— 服务端**明说**「这条消息去了哪」
//        202 ⇒ `{ok:true, queued:true, disposition:'queued', eventId, acceptedAt, inboxId, …}`
//        200 ⇒ `{ok:true, sessionId, turnKey, terminalReason, disposition:'started'}`
//      ⇒ 端侧**优先**读它；读不到（老服务端）⇒ 落回老启发式（`queued === true`）。
//
//   ② 双发 ack 的**第二次告知**（帧**顶层** `events[]`，⛔ 不是 rich_event）
//        data: {"events":[{"type":"user_message_processed","inboxId":"123","processedAt":"…"}]}
//      · 服务端写给该 session 的**全部** socket ⇒ **发起流 + 常驻订阅**两条路都要消费；
//      · **必须在归一之前读**（归一层的「未知 type 跳过」会把它丢掉）；
//      · 本地行的键 = **`inboxId`**（⛔ 不是 `eventId` —— 服务端给的是 `inbox_<id>`）。
//
//   ③ 停止 = **安全边界停止（软停）** —— PM 2026-11-17 拍板「新路就是默认路」
//        `DELETE /yinian/chat/cancel/:sessionId?intent=interrupt`（query + header 双带）
//      ⇒ 产出**保留**；端侧**不许**清本地行、要继续收帧到终态帧；
//      ⇒ 端侧执行（设备通道）**照旧要停**。
//
//   ④ 看门狗**分级 + 休眠抑制**
//        阶梯 `[15000, 30000, 60000, 120000]` ⇒ 15/30/60s 各记一条 warn，**120s 才判死**；
//        休眠抑制 ⇒ 定时器提前触发 / 晚醒 ⇒ **不判死**，重新武装。
//
// ⛔ 完全离线（不连网、不渲染 React）。
// ⛔ 既有测试**一个字都没改**（本文件只加新断言）。
//
// 运行: node --test test/p2-uplink-pc.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "../scripts/lib/strip-comments.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");
/** 去注释后的源码 —— 断言只看**代码**，不被注释喂饱（本仓注释密度很高）。 */
const repoCode = (p) => stripComments(repoSrc(p), p);

const STREAM = "src/lib/chat-stream.ts";
const SUBSCRIBE = "src/lib/chat-subscribe.ts";
const SSE = "src/lib/chat-sse.ts";
const INBOX = "src/lib/session-inbox.ts";
const EVENTS = "src/lib/session-events.ts";
const CANCEL = "src/lib/cancel.ts";
const FEATURES = "src/lib/p2-features.ts";
const RECONNECT = "src/lib/sse-reconnect.ts";
const DETAIL = "src/routes/ChatDetail.tsx";
const QUEUE_BAR = "src/components/chat/QueueBar.tsx";
const NOTIF = "src/lib/notifications-sse.ts";

// ---------------------------------------------------------------------------
// 判据模块（**零依赖** ⇒ 直接 import；判据只有一份）
// ---------------------------------------------------------------------------
const {
  readDisposition,
  readUserMessageProcessed,
} = await import("../src/lib/session-events.ts");
const {
  P2_FLAG_DEFAULTS,
  P2_FLAG_STORAGE_KEY,
  readP2Flags,
  readStoredFlags,
  resolveStopIntent,
  writeP2Flag,
} = await import("../src/lib/p2-features.ts");
const {
  SSE_HEARTBEAT_TIMEOUT_MS,
  SSE_WATCHDOG_GRADES_MS,
  createWatchdogState,
  decideWatchdog,
  noteWatchdogBytes,
  watchdogArmDelayMs,
  watchdogThresholdMs,
} = await import("../src/lib/sse-reconnect.ts");

// ===========================================================================
// ① · disposition —— 「这条消息去了哪」
// ===========================================================================

test("P2-1a readDisposition 只认 queued / started（别的值当没给）", () => {
  assert.equal(readDisposition({ disposition: "queued" }), "queued");
  assert.equal(readDisposition({ disposition: "started" }), "started");
  // ⛔ 老服务端没这个字段 ⇒ null（调用方落回老启发式，不猜、不编）
  assert.equal(readDisposition({}), null);
  assert.equal(readDisposition({ disposition: "whatever" }), null);
  assert.equal(readDisposition(null), null);
  assert.equal(readDisposition(undefined), null);
  assert.equal(readDisposition("queued"), null);
  assert.equal(readDisposition(42), null);
});

test("P2-1b 入队判据**优先**读 disposition，老启发式只当兜底", () => {
  const code = repoCode(INBOX);
  // 判据模块的 import（唯一一份）
  assert.match(
    repoSrc(INBOX),
    /from\s+["']\.\/session-events["']/,
    "★ 入队判据必须复用 `lib/session-events.ts`（不许各写各的）",
  );
  // 优先读 disposition ⇒ 读不到才落回 `queued === true`
  assert.match(
    code,
    /readDisposition\(data\)\s*\?\?\s*readDisposition\(raw\)/,
    "★ disposition 优先，老启发式只当兜底",
  );
  assert.match(
    code,
    /disposition\s*===\s*"queued"\s*\?\s*true\s*:\s*disposition\s*===\s*"started"\s*\?\s*false/,
    "★ queued ⇒ confirmed=true；started ⇒ confirmed=false（**别**再靠 HTTP 状态码猜）",
  );
  assert.match(
    code,
    /data\.queued\s*===\s*true\s*\|\|\s*raw\.queued\s*===\s*true/,
    "★ 老服务端（没有 disposition）⇒ 落回 `queued === true`（逐字兼容）",
  );
});

test("P2-1c 200 + SSE（老路）按「服务端建了轮」**事实推断**为 started", () => {
  const code = repoCode(INBOX);
  // 那条路**没有 body** ⇒ 只能按事实推断（与 web 端同口径）
  assert.match(
    code,
    /disposition:\s*"started"/,
    "★ 200 + SSE ⇒ 服务端建了轮 ⇒ 推断为 started（代码里要写明这是推断）",
  );
  assert.match(
    repoSrc(INBOX),
    /事实推断/,
    "★ 那条推断要在注释里写明（不然下一个人会以为是服务端真说的）",
  );
});

test("P2-1d sendNoStream 把 disposition / inboxId **带出来**（类型也带）", () => {
  const src = repoSrc(STREAM);
  const code = repoCode(STREAM);
  // 类型：结果里必须有 disposition + inboxId
  assert.match(
    src,
    /interface SendNoStreamResult[\s\S]{0,900}?disposition:\s*ChatDisposition\s*\|\s*null/,
    "★ `SendNoStreamResult` 必须带 disposition（老服务端 ⇒ null）",
  );
  assert.match(
    src,
    /interface SendNoStreamResult[\s\S]{0,900}?inboxId:\s*string\s*\|\s*null/,
    "★ `SendNoStreamResult` 必须带 inboxId（= ack 帧里的那个键）",
  );
  // 实现：真的读 disposition
  assert.match(
    code,
    /readDisposition\(data\)\s*\?\?\s*readDisposition\(raw\)/,
    "★ sendNoStream 也要优先读 disposition",
  );
  assert.match(
    code,
    /inboxId\s*!=\s*null\s*\?\s*String\(/,
    "★ inboxId 一律当**不透明字符串**（服务端是 bigint）",
  );
  // handle 的类型
  assert.match(
    src,
    /sendNoStream:\s*\(opts:\s*UseChatStreamOptions\)\s*=>\s*Promise<SendNoStreamResult>/,
    "★ handle 的 sendNoStream 返回类型要换成 SendNoStreamResult",
  );
});

test("P2-1e 宿主层按 disposition 分岔：queued ⇒ 收掉「等首帧」但**留住**乐观行", () => {
  const detail = repoCode(DETAIL);
  assert.match(
    detail,
    /sent\?\.disposition\s*===\s*"queued"/,
    "★ 常驻模式发消息时，服务端说「排队」⇒ 这一轮压根没起 ⇒ 别傻等首帧",
  );
  const branch = detail.slice(
    detail.indexOf('sent?.disposition === "queued"'),
    detail.indexOf('sent?.disposition === "queued"') + 2000,
  );
  assert.match(
    branch,
    /clearLocalRow\(\)/,
    "★ 排队 ⇒ 收掉本机「等首帧」的流式行",
  );
  assert.match(
    branch,
    /setWaitingFirstFrame\(false\)/,
    "★ 排队 ⇒ 别再等首帧",
  );
  assert.match(
    branch,
    /setPendingUserMsg|inboxId/,
    "★ 排队 ⇒ 要摆一条带 inboxId 的队列项（ack 帧靠它对上）",
  );
  // ⛔ 排队**不许**把用户的话退回输入框（那等于说「没发出去」）
  assert.ok(
    !/insertText\(/.test(branch),
    "⛔ 排队不是「没排上」⇒ 不许把文字退回输入框",
  );
});

test("P2-1f 老服务端（没有 disposition）⇒ 落回老启发式，行为不变", () => {
  // readDisposition 对老形状返回 null ⇒ 调用方走 `queued === true`
  assert.equal(readDisposition({ ok: true, queued: true }), null);
  assert.equal(readDisposition({ ok: true }), null);
  // 判据模块本身不许**猜**（猜 = 端侧编一个服务端没说的事实）
  const src = repoSrc(EVENTS);
  assert.match(
    src,
    /读不到就返回 null/,
    "★ 读不到就是 null（调用方负责兜底）",
  );
});

// ===========================================================================
// ② · 双发 ack —— 「那条排队消息已被处理」
// ===========================================================================

test("P2-2a readUserMessageProcessed 读**帧顶层**的 events[]", () => {
  const ev = readUserMessageProcessed({
    events: [
      { type: "user_message_processed", inboxId: "123", processedAt: "2026-11-17T02:00:00.000Z" },
    ],
  });
  assert.ok(ev, "★ 必须认得出这一帧");
  assert.equal(ev.type, "user_message_processed");
  assert.equal(ev.inboxId, "123");
  assert.equal(ev.processedAt, "2026-11-17T02:00:00.000Z");
});

test("P2-2b inboxId 一律当**不透明字符串**（服务端是 bigint）", () => {
  const ev = readUserMessageProcessed({
    events: [{ type: "user_message_processed", inboxId: 123 }],
  });
  assert.ok(ev);
  assert.equal(ev.inboxId, "123", "★ number 也要转成字符串（别丢精度）");
  // 空 id ⇒ 当没这条（不许拿空串去匹配）
  assert.equal(
    readUserMessageProcessed({ events: [{ type: "user_message_processed" }] }),
    null,
  );
  assert.equal(
    readUserMessageProcessed({ events: [{ type: "user_message_processed", inboxId: "  " }] }),
    null,
  );
});

test("P2-2c 认错地方就收不到：events 在**顶层**，不是 rich_event 里", () => {
  // ⛔ 嵌在 event 里 ⇒ 认不出（服务端就是放顶层的）
  assert.equal(
    readUserMessageProcessed({
      event: { type: "user_message_processed", inboxId: "123" },
    }),
    null,
  );
  // ⛔ 没有 events ⇒ null
  assert.equal(readUserMessageProcessed({ content: "hi" }), null);
  assert.equal(readUserMessageProcessed(null), null);
  assert.equal(readUserMessageProcessed("x"), null);
  // ⛔ events 不是数组 ⇒ null
  assert.equal(readUserMessageProcessed({ events: {} }), null);
});

test("P2-2d 老端会逐条跳过它 ⇒ 端侧必须**显式消费**（不能指望归一层）", () => {
  const src = repoSrc(EVENTS);
  assert.match(
    src,
    /必须在归一之前读/,
    "★ 判据模块要写明「归一之前读」（归一层会把它丢掉）",
  );
  // 归一层（rich-events）确实不认这个 type ⇒ 必须显式消费
  const rich = repoCode("src/lib/rich-events.ts");
  assert.ok(
    !/user_message_processed/.test(rich),
    "★ 归一层不认这个 type（所以端侧必须自己读）",
  );
});

test("P2-2e 发起流与常驻订阅**两条路**都要消费（服务端推给全部 socket）", () => {
  const stream = repoCode(STREAM);
  const sub = repoCode(SUBSCRIBE);
  for (const [name, code] of [
    ["chat-stream.ts", stream],
    ["chat-subscribe.ts", sub],
  ]) {
    assert.match(
      code,
      /readUserMessageProcessed\(payload\)/,
      `★ ${name} 必须显式消费 ack 帧`,
    );
    // ⚠️ 必须**在归一之前**（否则被「未知 type 跳过」丢掉）
    const iAck = code.indexOf("readUserMessageProcessed(payload)");
    const iNorm = code.indexOf("normalizeChatChunk(payload as ChatChunk)");
    assert.ok(iAck >= 0, `${name}: 找不到 ack 消费点`);
    assert.ok(
      iAck < iNorm,
      `★ ${name}: ack 必须在 normalizeChatChunk **之前**读`,
    );
  }
});

test("P2-2f 宿主层两条路都接到同一个回调（常驻 + 老路）", () => {
  const detail = repoCode(DETAIL);
  assert.match(
    detail,
    /const handleUserMessageProcessed = useCallback/,
    "★ 宿主层要有唯一的 ack 处理函数",
  );
  assert.ok(
    (detail.match(/onUserMessageProcessed: handleUserMessageProcessed/g) || []).length >= 3,
    "★ 常驻订阅 + 发起流 + 接入流 ⇒ 三处都要接同一个回调",
  );
});

test("P2-2g 本地行按 **`inboxId`** 匹配（⛔ 不是 eventId）", () => {
  const detail = repoCode(DETAIL);
  const fn = detail.slice(
    detail.indexOf("const handleUserMessageProcessed = useCallback"),
    detail.indexOf("const handleUserMessageProcessed = useCallback") + 1600,
  );
  assert.match(fn, /ev\?\.inboxId/, "★ 键 = ack 帧里的 inboxId");
  assert.match(
    fn,
    /l\.inboxId\s*&&\s*l\.inboxId\s*===\s*inboxId/,
    "★ 端侧乐观行靠**服务端给的 inboxId** 对上",
  );
  assert.ok(
    !/eventId/.test(fn),
    "⛔ 不许拿 eventId 对（服务端给的是 `inbox_<id>` ⇒ 永远对不上）",
  );
  // 入队时要把服务端的 inboxId 记在乐观行上
  assert.match(
    detail,
    /res\.messageId\s*\?\s*\{\s*inboxId:\s*res\.messageId\s*\}/,
    "★ 入队回执里的 messageId（= inboxId）要记在乐观行上（ack 靠它对上）",
  );
});

test("P2-2h 队列条能看出「已处理」（⛔ 别再显示「排队中」）", () => {
  const bar = repoCode(QUEUE_BAR);
  assert.match(bar, /已处理/, "★ 队列条要显示「已处理」");
  assert.match(
    bar,
    /it\.processed\s*\|\|\s*it\.local\s*===\s*"processed"/,
    "★ 「已处理」优先于「排队中」",
  );
  // 服务端行的 id **就是** inboxId ⇒ 直接命中
  const detail = repoCode(DETAIL);
  assert.match(
    detail,
    /processed:\s*processedInboxIds\.has\(it\.id\)/,
    "★ 服务端行的键 = inboxId（= 行 id）",
  );
});

// ===========================================================================
// ③ · 停止 = 安全边界停止（软停）—— PM 2026-11-17 拍板「新路就是默认路」
// ===========================================================================

test("P2-3a 取消意图有第三种：INTERRUPT（线上字节 = 小写 interrupt）", () => {
  const src = repoSrc(CANCEL);
  const code = repoCode(CANCEL);
  assert.match(
    src,
    /export type CancelIntent = "ACK_DONE" \| "USER_STOP" \| "INTERRUPT"/,
    "★ CancelIntent 要有 INTERRUPT",
  );
  assert.match(
    code,
    /INTERRUPT:\s*"interrupt"/,
    "★ 线上字节用**小写** interrupt（服务端别名集：interrupt/user_interrupt/safe_stop/soft_stop）",
  );
});

test("P2-3b intent **双带**（query + header），且走 PC 既有的那条 DELETE 路径", () => {
  const code = repoCode(CANCEL);
  assert.match(
    code,
    /\/yinian\/chat\/cancel\/\$\{sessionId\}/,
    "★ 复用 PC **既有**的 DELETE /yinian/chat/cancel/:sessionId（⛔ 不新造路径）",
  );
  assert.match(
    code,
    /url\.searchParams\.set\("intent",\s*wire\)/,
    "★ query 带 intent",
  );
  assert.match(
    code,
    /"x-gaclaw-cancel-intent":\s*wire/,
    "★ header 也带（两端都读 ⇒ 双带才是真稳）",
  );
});

test("P2-3c 软停是**默认路**（PM 拍板），老行为只作应急退路", () => {
  assert.equal(P2_FLAG_DEFAULTS.safeStop, true, "★ safeStop 默认开（新路）");
  assert.equal(
    resolveStopIntent(P2_FLAG_DEFAULTS),
    "INTERRUPT",
    "★ 默认发 interrupt（软停 ⇒ 产出保留）",
  );
  assert.equal(
    resolveStopIntent({ ...P2_FLAG_DEFAULTS, safeStop: false }),
    "USER_STOP",
    "★ 关掉开关 ⇒ 退回老行为（硬掐）",
  );
});

test("P2-3d 停止键：软停时**不掐本地流、不撤本地行**，只发 interrupt", () => {
  const detail = repoCode(DETAIL);
  const start = detail.indexOf("const handleStop = useCallback");
  assert.ok(start > 0, "★ 找不到 handleStop");
  const stop = detail.slice(start, start + 4000);
  // 软停分支
  const iBranch = stop.indexOf('intent === "INTERRUPT"');
  assert.ok(iBranch > 0, "★ handleStop 要有软停分支");
  const branch = stop.slice(iBranch, stop.indexOf("return;", iBranch));
  assert.match(
    branch,
    /sendCancelDelete\(\s*chatId\s*,\s*"INTERRUPT"\s*\)/,
    "★ 软停 ⇒ 发 DELETE intent=interrupt（双带由 cancel.ts 保证）",
  );
  assert.ok(
    !/stream\.abort\(/.test(branch),
    "⛔ 软停**不许**掐本地流（要继续收帧到终态帧）",
  );
  assert.ok(
    !/turnAcRef\.current\?\.abort\(/.test(branch),
    "⛔ 软停**不许**断叫停开关（那会让宿主层撤掉本地行）",
  );
  assert.ok(
    !/clearLocalRow\(/.test(branch),
    "⛔ 软停**不许**清本地行（清行是终态帧路径的事）",
  );
  // 老路还在（应急退路）
  assert.match(stop, /stream\.abort\("user"\)/, "★ 老路（硬掐）还在 ⇒ 应急退路可用");
});

test("P2-3e 端侧执行（设备通道）**照旧要停**（软停不许把进程留活）", () => {
  const detail = repoCode(DETAIL);
  assert.match(
    detail,
    /const stopLocalClientTools = useCallback/,
    "★ 要有「停本会话正在跑的端侧执行」这一路",
  );
  const fn = detail.slice(
    detail.indexOf("const stopLocalClientTools = useCallback"),
    detail.indexOf("const stopLocalClientTools = useCallback") + 1600,
  );
  assert.match(fn, /runningTasks\(\)/, "★ 读本机正在跑的任务");
  assert.match(fn, /stopTask\(t\.pendingId\)/, "★ 停它");
  assert.match(
    fn,
    /t\.sessionId\s*!==\s*chatId/,
    "★ 只停**本会话**的（⛔ 不许停别的会话的活）",
  );
  // 软停分支里要调它
  const stop = detail.slice(
    detail.indexOf("const handleStop = useCallback"),
    detail.indexOf("const handleStop = useCallback") + 4000,
  );
  assert.match(
    stop,
    /void stopLocalClientTools\(\)/,
    "★ 软停 ⇒ 端侧执行照旧要停（服务端在 interrupt 下**不**通知设备通道）",
  );
});

test("P2-3f 开关是**应急退路**（localStorage ⇒ 不用等一次发版）", () => {
  assert.equal(P2_FLAG_STORAGE_KEY, "gacode.p2.flags");
  // 假 storage
  const store = new Map();
  const fake = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  };
  // 默认（没写）⇒ 全是「新路」
  const def = readP2Flags(fake);
  assert.equal(def.safeStop, true);
  assert.equal(def.watchdogGraded, true);
  assert.equal(def.watchdogSleepSuppression, true);
  assert.equal(def.watchdogJudgeDead, true);
  // 只写一个键 ⇒ 其它键回落常量
  writeP2Flag("safeStop", false, fake);
  const after = readP2Flags(fake);
  assert.equal(after.safeStop, false, "★ 应急退路：改一行 localStorage 就退回老行为");
  assert.equal(after.watchdogGraded, true, "★ 没写的键回落代码常量");
  // 坏 JSON ⇒ 忽略
  store.set("gacode.p2.flags", "{not json");
  assert.deepEqual(readStoredFlags(fake), {}, "★ 坏 JSON ⇒ 忽略（回落常量）");
});

// ===========================================================================
// ④ · 看门狗分级 + 休眠抑制
// ===========================================================================

test("P2-4a 阶梯就是 [15s, 30s, 60s, 120s]", () => {
  assert.deepEqual(
    [...SSE_WATCHDOG_GRADES_MS],
    [15000, 30000, 60000, 120000],
    "★ 分级阶梯（抄 Claude Code `Wv9` 的 j）",
  );
  assert.equal(
    watchdogThresholdMs(true, 0),
    15000,
    "★ 第一档 15s",
  );
  assert.equal(watchdogThresholdMs(true, 3), 120000, "★ 最后一档 120s");
  assert.equal(
    watchdogThresholdMs(false, 0),
    SSE_HEARTBEAT_TIMEOUT_MS,
    "★ 不分级 = 单档 60s（老口径）",
  );
  assert.equal(SSE_HEARTBEAT_TIMEOUT_MS, 60000);
});

test("P2-4b 分级：15/30/60s 各记一条 warn，**120s 才判死**", () => {
  const t0 = 1_000_000;
  const mk = (grade) => ({ ...createWatchdogState(t0), grade });
  // 第一档：静默 15s ⇒ warn（**不是** dead）
  let d = decideWatchdog(mk(0), { now: t0 + 15000, graded: true, sleepSuppression: true });
  assert.equal(d.kind, "warn", "★ 15s ⇒ warn");
  assert.equal(d.next.grade, 1, "★ 档位 +1");
  // 第二档：30s ⇒ warn
  d = decideWatchdog(mk(1), { now: t0 + 30000, graded: true, sleepSuppression: true });
  assert.equal(d.kind, "warn", "★ 30s ⇒ warn");
  assert.equal(d.next.grade, 2);
  // 第三档：60s ⇒ warn
  d = decideWatchdog(mk(2), { now: t0 + 60000, graded: true, sleepSuppression: true });
  assert.equal(d.kind, "warn", "★ 60s ⇒ warn（老口径这里就判死了）");
  assert.equal(d.next.grade, 3);
  // 最后一档：120s ⇒ dead
  d = decideWatchdog(mk(3), { now: t0 + 120000, graded: true, sleepSuppression: true });
  assert.equal(d.kind, "dead", "★ 120s ⇒ 才判死（掐流走失败/降级路径）");
});

test("P2-4c 不分级时 = 老口径（60s 直接判死，不记 warn）", () => {
  const t0 = 1_000_000;
  const d = decideWatchdog(createWatchdogState(t0), {
    now: t0 + 60000,
    graded: false,
    sleepSuppression: true,
  });
  assert.equal(d.kind, "dead", "★ 老口径：单档 60s 判死");
});

test("P2-4d 休眠抑制：定时器**提前触发** ⇒ 不判死，重新武装（档位不变）", () => {
  const t0 = 1_000_000;
  const st = { ...createWatchdogState(t0), grade: 2 };
  // 「实际经过」= now - lastByteAt < 阈值 / 2 ⇒ 判为系统挂起
  const d = decideWatchdog(st, {
    now: t0 + 1000,
    graded: true,
    sleepSuppression: true,
  });
  assert.equal(d.kind, "suspended", "★ 挂起 ⇒ 不判死");
  assert.equal(d.next.grade, 2, "★ 档位不变（从当前档位继续等）");
  assert.equal(d.next.warns, st.warns, "★ 挂起不记 warn 计数（只走 onWarn 日志）");
  // 关掉抑制 ⇒ 照常处理
  const d2 = decideWatchdog(st, {
    now: t0 + 1000,
    graded: true,
    sleepSuppression: false,
  });
  assert.notEqual(d2.kind, "suspended", "★ 关掉抑制 ⇒ 不再挂起");
});

test("P2-4e 休眠抑制的**互补判据**：定时器晚醒（挂起 / 事件循环被堵）⇒ 不判死", () => {
  const t0 = 1_000_000;
  const st = { ...createWatchdogState(t0), grade: 3 };
  // 阈值 120s ⇒ 晚醒 > 60s ⇒ 判为「挂起/被堵」⇒ 不判死
  const d = decideWatchdog(st, {
    now: t0 + 300000,
    graded: true,
    sleepSuppression: true,
    lateMs: 180000,
  });
  assert.equal(d.kind, "suspended", "★ 晚醒 ⇒ 不判死（否则锁屏回来就误报「网络失败」）");
  // 正常触发（没晚醒）⇒ 照常判死
  const d2 = decideWatchdog(st, {
    now: t0 + 120000,
    graded: true,
    sleepSuppression: true,
    lateMs: 0,
  });
  assert.equal(d2.kind, "dead", "★ 没晚醒 ⇒ 照常判死");
});

test("P2-4f 收到**字节** ⇒ 重新计时（档位回到第一档）", () => {
  const t0 = 1_000_000;
  const st = { ...createWatchdogState(t0), grade: 3, warns: 3 };
  const next = noteWatchdogBytes(st, t0 + 1000);
  assert.equal(next.grade, 0, "★ 档位回到第一档（本轮静默期重新开始）");
  assert.equal(next.lastByteAt, t0 + 1000, "★ 计时基准 = 收到字节的那一刻");
});

test("P2-4g 定时器**总是**在「累计静默达到阈值」那一刻触发", () => {
  const t0 = 1_000_000;
  assert.equal(watchdogArmDelayMs(createWatchdogState(t0), t0, true), 15000);
  // 已经静默 10s ⇒ 只再等 5s
  const st = { ...createWatchdogState(t0), lastByteAt: t0 - 10000 };
  assert.equal(watchdogArmDelayMs(st, t0, true), 5000);
});

test("P2-4h 看门狗的三个开关默认**全开**（PM 拍板：新路就是默认路）", () => {
  assert.equal(P2_FLAG_DEFAULTS.watchdogGraded, true);
  assert.equal(P2_FLAG_DEFAULTS.watchdogSleepSuppression, true);
  assert.equal(P2_FLAG_DEFAULTS.watchdogJudgeDead, true);
});

test("P2-4i 三条流都接上了分级看门狗（会话流 / 常驻订阅 / 通知流）", () => {
  for (const [name, file] of [
    ["chat-stream.ts", STREAM],
    ["chat-subscribe.ts", SUBSCRIBE],
    ["notifications-sse.ts", NOTIF],
  ]) {
    const code = repoCode(file);
    assert.match(code, /graded:\s*p2\.watchdogGraded/, `★ ${name} 要接分级开关`);
    assert.match(
      code,
      /sleepSuppression:\s*p2\.watchdogSleepSuppression/,
      `★ ${name} 要接休眠抑制开关`,
    );
    assert.match(
      code,
      /judgeDead:\s*p2\.watchdogJudgeDead/,
      `★ ${name} 要接判死开关`,
    );
    assert.match(code, /readP2Flags\(\)/, `★ ${name} 的开关要从 p2-features 读`);
  }
});

test("P2-4j 计时口径是**字节**（心跳是注释帧 ⇒ 帧级计时会把活流误判成停滞）", () => {
  const sse = repoCode(SSE);
  assert.match(sse, /onBytes\?:\s*\(byteLength:\s*number\)\s*=>\s*void/, "★ 读帧层要暴露字节回调");
  assert.match(
    sse,
    /handlers\.onBytes\?\.\(value\.byteLength\)/,
    "★ 每读到一块网络字节就要通知（⛔ 只认「完整帧」不够）",
  );
  // 三条流的调用点
  for (const [name, file] of [
    ["chat-stream.ts", STREAM],
    ["chat-subscribe.ts", SUBSCRIBE],
  ]) {
    const code = repoCode(file);
    assert.match(
      code,
      /onBytes:\s*\(\)\s*=>\s*watchdog\.notifyBytes\(\)/,
      `★ ${name} 要把字节喂给看门狗`,
    );
  }
  const notif = repoCode(NOTIF);
  assert.match(
    notif,
    /watchdog\.notifyBytes\(\)/,
    "★ 通知流也要按字节计时（服务端 25s 一条注释心跳 ⇒ 帧级会 60s 误重连）",
  );
});

test("P2-4k 「等首帧 / 启动超时」不属于这一档（⛔ 不许动）", () => {
  // 连接超时/首帧超时是「连上没」，不是「停滞」⇒ 本次**不许**改它们。
  const stream = repoCode(STREAM);
  assert.ok(
    !/FIRST_FRAME_TIMEOUT|首帧超时/.test(stream),
    "⛔ 首帧超时不是这一档（别把它改成阶梯）",
  );
  // 共享层 `src/lib/sse/**` 是 web/PC **逐字节相同**的 ⇒ 一个字都不许动
  const shared = repoCode("src/lib/sse/reconnect.ts");
  assert.ok(
    !/watchdogGraded|SSE_WATCHDOG_GRADES_MS/.test(shared),
    "⛔ 共享层不许放看门狗阶梯（web 端断言锁着 md5）",
  );
});
