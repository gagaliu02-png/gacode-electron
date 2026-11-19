// [2026-11-15 · 订正 30 · 观众侧] PC 端 —— 「服务端起轮了」新帧 `turn_started`
//
// ---------------------------------------------------------------------------
// 需求（契约 docs/design/async-work-unit-30-client-contract.md §1 / §2）
// ---------------------------------------------------------------------------
//   后台任务回报到达时**服务端自己起一轮**（主 agent 读到报告后继续推进）
//   ⇒ **端侧只当观众**（端侧不再起轮）：
//
//     data: {"type":"turn_started","turnStarted":{
//             "sessionId":"<会话id>", "inboxId":"<收件箱那封信的id>",
//             "jobId":"<后台作业id，可为空字符串>", "reason":"work_unit_result"}}
//
//   端侧只做三件事：
//     ① 解析新帧  ② 按 sessionId 派给对应会话页  ③ 自动 attach（看着那个会话时）
//
// ---------------------------------------------------------------------------
// 覆盖断言
// ---------------------------------------------------------------------------
//   GC-P30-S1  parseNotificationEvent 能解出 `turn_started`
//   GC-P30-S2  未知 type 仍返回 `unknown`（老端不崩 —— 契约 §1.2 铁律 1）
//   GC-P30-S3  `turnStarted` 形状不对 ⇒ **不抛异常**（回落 unknown）
//   GC-P30-S4  端内广播通道能按 sessionId 派单（window 自定义事件）
//   GC-P30-S5  端侧接线：帧分派 + App 挂回调 + 会话页自动 attach
//   GC-P30-S6  ⛔ 反证：新 type **不得**叫 `work_unit_result`；⛔ 帧的 `id:` 行
//               处理不许动；⛔ 端侧不许起轮 / 不许本地插气泡
//
// 运行: node --test test/pc-turn-started-viewer.test.mjs  (完全离线, 不渲染 React)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { makeTmpDir, writeModule } from "../scripts/lib/schedule-loader.mjs";
import { stripComments } from "../scripts/lib/strip-comments.mjs";
import { extractFunction } from "../scripts/lib/source-scan.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");
// ⚠️ 本仓源码是 **CRLF** ⇒ 断言里的 `\n` 匹配不上 ⇒ 统一归一成 LF。
const repoCode = (p) => stripComments(repoSrc(p), p).replace(/\r\n/g, "\n");

const NOTIFY_SSE = "src/lib/notifications-sse.ts";
const TURN_STARTED = "src/lib/turn-started.ts";
const APP = "src/App.tsx";
const DETAIL = "src/routes/ChatDetail.tsx";

const dir = makeTmpDir("verify-turn-started-viewer");

// ---------------------------------------------------------------------------
// 加载生产模块
// ---------------------------------------------------------------------------
// ⚠️ `src/lib/notifications-sse.ts` 整体 import 了 react / react-router ⇒ 运行时
//   加载不了 ⇒ 用仓库已有的 `scripts/lib/source-scan.mjs` 把**纯逻辑**那两块
//   (normalizeTurnStarted + parseNotificationEvent) 抠出来落成桩模块（抠的是真源码）。
const {
  parseNotificationEvent,
  normalizeTurnStarted,
} = await (async () => {
  const nsSrc = repoSrc(NOTIFY_SSE);
  const normFn = extractFunction(
    nsSrc,
    "normalizeTurnStarted",
    NOTIFY_SSE,
  );
  const parseFn = extractFunction(
    nsSrc,
    "parseNotificationEvent",
    NOTIFY_SSE,
  );
  assert.ok(normFn, `从 ${NOTIFY_SSE} 里抠不出 normalizeTurnStarted`);
  assert.ok(parseFn, `从 ${NOTIFY_SSE} 里抠不出 parseNotificationEvent`);
  // `parseNotificationEvent` 只依赖两个东西: `normalizeTurnStarted`（同文件）
  // + `normalizeNotification`（./notifications）⇒ 后者用**真源码**。
  writeModule(dir, "notifications", repoSrc("src/lib/notifications.ts"));
  const url = writeModule(
    dir,
    "notifications-sse",
    `import { normalizeNotification } from "./notifications.mjs";\n\n${normFn}\n\n${parseFn}\n`,
  );
  return import(url);
})();

// 端内广播通道（零运行时依赖 ⇒ 直接加载真源码）。
const turnStarted = await import(
  writeModule(dir, "turn-started", repoSrc(TURN_STARTED))
);

// ===========================================================================
// GC-P30-S1 · 解析新帧
// ===========================================================================

test("GC-P30-S1 parseNotificationEvent 能解出 turn_started", () => {
  const ev = parseNotificationEvent(
    JSON.stringify({
      type: "turn_started",
      turnStarted: {
        sessionId: "sess-1",
        inboxId: "inbox-9",
        jobId: "job-3",
        reason: "work_unit_result",
      },
    }),
  );
  assert.equal(ev.type, "turn_started", "★ 必须解成 turn_started（不是 unknown）");
  assert.ok(ev.turnStarted, "★ 载荷必须带 turnStarted");
  assert.equal(ev.turnStarted.sessionId, "sess-1", "★ sessionId 必填（路由靠它）");
  assert.equal(ev.turnStarted.inboxId, "inbox-9");
  assert.equal(ev.turnStarted.jobId, "job-3");
  assert.equal(ev.turnStarted.reason, "work_unit_result");
  // ⛔ 端侧**只传 id** ⇒ 帧里没有报告正文 ⇒ 载荷里也不该凭空多出正文字段。
  assert.equal(ev.notification, undefined, "⛔ turn_started 帧不带 notification");
  assert.equal(
    ev.turnStarted.content,
    undefined,
    "⛔ 端侧不许碰报告正文 ⇒ 载荷里不该有 content",
  );
});

test("GC-P30-S1b jobId 未知 ⇒ 归一成**空字符串**（不是 null/undefined）", () => {
  const ev = parseNotificationEvent(
    JSON.stringify({
      type: "turn_started",
      turnStarted: { sessionId: "sess-1", inboxId: "inbox-9" },
    }),
  );
  assert.equal(ev.type, "turn_started");
  assert.equal(ev.turnStarted.jobId, "", "★ jobId 未知时是空字符串（契约 §1.1）");
  assert.equal(ev.turnStarted.reason, "");
});

test("GC-P30-S1c normalizeTurnStarted: 缺 sessionId ⇒ null（没法路由 ⇒ 帧作废）", () => {
  assert.equal(normalizeTurnStarted({ sessionId: "s" }).sessionId, "s");
  assert.equal(normalizeTurnStarted({ inboxId: "i" }), null);
  assert.equal(normalizeTurnStarted({ sessionId: "" }), null);
  assert.equal(normalizeTurnStarted({ sessionId: 123 }), null);
});

test("[T-073] parseNotificationEvent 能解出 reason=agent_message (不按 reason 过滤)", () => {
  const ev = parseNotificationEvent(
    JSON.stringify({
      type: "turn_started",
      turnStarted: {
        sessionId: "sess-agent",
        inboxId: "inbox-agent",
        jobId: "",
        reason: "agent_message",
      },
    }),
  );
  assert.equal(ev.type, "turn_started", "agent_message 也必须解成 turn_started");
  assert.equal(ev.turnStarted.reason, "agent_message");
  assert.equal(ev.turnStarted.sessionId, "sess-agent");
});

test("[T-073] 未知 reason 仍兼容 (原样透传, 不阻断帧)", () => {
  for (const reason of ["cron", "some_future_kind", ""]) {
    const ev = parseNotificationEvent(
      JSON.stringify({
        type: "turn_started",
        turnStarted: { sessionId: "s", reason },
      }),
    );
    assert.equal(ev.type, "turn_started", `reason=${reason} 不能阻断帧解析`);
    assert.equal(ev.turnStarted.reason, reason);
  }
});

// ===========================================================================
// GC-P30-S2 · 未知 type 仍返回 unknown（老端不崩）
// ===========================================================================

test("GC-P30-S2 未知 type 仍返回 unknown", () => {
  // ⛔ 契约 §1.2 铁律 1 —— 新 type 旧端不认 ⇒ 走 unknown 兜底 ⇒ **老端不崩**。
  assert.equal(
    parseNotificationEvent(JSON.stringify({ type: "work_unit_result" })).type,
    "unknown",
    "⛔ 未知 type 必须回落 unknown（不许崩、不许被当成起轮指令）",
  );
  assert.equal(
    parseNotificationEvent(JSON.stringify({ type: "whatever_2030" })).type,
    "unknown",
  );
  assert.equal(parseNotificationEvent(JSON.stringify({})).type, "unknown");
  // 建连帧 / 通知帧的行为**逐字不变**。
  assert.equal(parseNotificationEvent(JSON.stringify({ type: "connected" })).type, "connected");
  const notif = parseNotificationEvent(
    JSON.stringify({ type: "notification", notification: { id: "n1", title: "甲" } }),
  );
  assert.equal(notif.type, "notification");
  assert.equal(notif.notification.id, "n1");
  // 非 JSON / 空串 ⇒ unknown（老行为不变）。
  assert.equal(parseNotificationEvent("not json").type, "unknown");
  assert.equal(parseNotificationEvent("").type, "unknown");
  assert.equal(parseNotificationEvent("null").type, "unknown");
  assert.equal(parseNotificationEvent("123").type, "unknown");
});

// ===========================================================================
// GC-P30-S3 · 形状不对 ⇒ 不抛异常
// ===========================================================================

test("GC-P30-S3 turnStarted 形状不对 ⇒ 不抛异常（回落 unknown）", () => {
  const bads = [
    undefined,
    null,
    "字符串",
    123,
    [],
    {},
    { sessionId: 123 },
    { sessionId: "" },
    { sessionId: null },
  ];
  for (const bad of bads) {
    let ev;
    assert.doesNotThrow(() => {
      ev = parseNotificationEvent(
        JSON.stringify({ type: "turn_started", turnStarted: bad }),
      );
    }, `⛔ turnStarted=${JSON.stringify(bad)} 形状不对时不许抛异常`);
    assert.equal(ev.type, "unknown", "⛔ 形状不对 ⇒ 回落 unknown 兜底");
    assert.equal(ev.turnStarted, undefined, "⛔ 形状不对 ⇒ 不许带半个载荷出来");
  }
  // 整个帧都不带 turnStarted 字段 ⇒ 也是 unknown（不崩）。
  assert.equal(
    parseNotificationEvent(JSON.stringify({ type: "turn_started" })).type,
    "unknown",
  );
});

// ===========================================================================
// GC-P30-S4 · 端内广播通道（按 sessionId 派单）
// ===========================================================================

test("GC-P30-S4 端内广播通道：dispatch ⇒ subscribe 能收到（且带 sessionId）", () => {
  const fakeWindow = new EventTarget();
  const prevWindow = globalThis.window;
  globalThis.window = fakeWindow;
  try {
    const got = [];
    const off = turnStarted.subscribeTurnStarted((info) => got.push(info));
    turnStarted.dispatchTurnStarted({
      sessionId: "sess-1",
      inboxId: "inbox-9",
      jobId: "job-3",
      reason: "work_unit_result",
    });
    assert.equal(got.length, 1, "★ 订阅者必须收到这一帧");
    assert.equal(got[0].sessionId, "sess-1");
    assert.equal(got[0].reason, "work_unit_result");

    // 退订之后不再收。
    off();
    turnStarted.dispatchTurnStarted({
      sessionId: "sess-2",
      inboxId: "i",
      jobId: "j",
      reason: "work_unit_result",
    });
    assert.equal(got.length, 1, "★ 退订之后不许再收到");

    // 一个订阅者抛异常 ⇒ 不许影响别的订阅者（也不许把通知流带崩）。
    const other = [];
    turnStarted.subscribeTurnStarted(() => {
      throw new Error("boom");
    });
    const off2 = turnStarted.subscribeTurnStarted((info) => other.push(info));
    turnStarted.dispatchTurnStarted({
      sessionId: "sess-3",
      inboxId: "i",
      jobId: "j",
      reason: "work_unit_result",
    });
    assert.equal(other.length, 1, "★ 一个订阅者抛异常不许影响别的订阅者");
    off2();
  } finally {
    if (prevWindow === undefined) delete globalThis.window;
    else globalThis.window = prevWindow;
  }
});

// ===========================================================================
// GC-P30-S5 · 端侧接线
// ===========================================================================

test("GC-P30-S5a 帧消费处按新 type 分派", () => {
  const code = repoCode(NOTIFY_SSE);
  assert.ok(
    /ev\.type === "turn_started"/.test(code),
    "★ 帧消费处必须认 turn_started（不然这一帧被丢掉）",
  );
  assert.ok(
    /handleTurnStarted\(ev\.turnStarted\)/.test(code),
    "★ 认出来之后必须交给 handleTurnStarted",
  );
  assert.ok(
    /onTurnStarted/.test(code),
    "★ 桥必须把载荷交给上层回调（App 按 sessionId 派单）",
  );
});

test("GC-P30-S5b App 挂回调 ⇒ 按 sessionId 派给会话页", () => {
  const code = repoCode(APP);
  assert.ok(
    /<NotificationSSEBridge onTurnStarted=\{/.test(code),
    "★ App.tsx 必须给全局的通知流桥挂 onTurnStarted 回调",
  );
  assert.ok(
    /dispatchTurnStarted\(/.test(code),
    "★ 回调必须把载荷派到端内广播通道（按 sessionId 派单）",
  );
});

test("GC-P30-S5c 会话页按 sessionId 认领 ⇒ 自动 attach", () => {
  const code = repoCode(DETAIL);
  assert.ok(
    /subscribeTurnStarted\(/.test(code),
    "★ ChatDetail 必须订阅「服务端起轮了」的广播",
  );
  assert.ok(
    /info\.sessionId !== chatId/.test(code),
    "★ 必须按 sessionId **认领**（不是我的会话 ⇒ 不管）",
  );
  assert.ok(
    /setAttachEpoch\(\(e\) => e \+ 1\)/.test(code),
    "★ 自动 attach = bump 进场令牌（复用现成的「进场接回」那条路径）",
  );
});

test("GC-P30-S5d 「本端在跑自己那一轮」的判据是**会话级**的", () => {
  const code = repoCode(DETAIL);
  // ⛔ 不能用 `myTurnRef` 当判据 —— 它**跨会话存活**（ChatDetail 换会话不重挂载）
  //   且「用户喊停」那条路**不复位**它 ⇒ 会误杀**别的会话**的自动 attach。
  assert.ok(
    /ownTurnSessionIdRef\.current === chatId/.test(code),
    "★ 守卫必须按**会话**判（本端拥有的一轮属于哪个会话）",
  );
  assert.ok(
    /ownTurnSessionIdRef\.current = chatId;/.test(code),
    "★ 发起那一轮时必须记下它属于哪个会话",
  );
  assert.ok(
    /ownTurnSessionIdRef\.current = null;/.test(code),
    "★ 那一轮收掉（喊停 / 断链 / 结束）时必须复位",
  );
});

// ===========================================================================
// GC-P30-S6 · 反证（⛔ 不许做的事）
// ===========================================================================

test("GC-P30-S6a 新 type 不得叫 work_unit_result（否则旧端会起轮 ⇒ 双份）", () => {
  const code = repoCode(NOTIFY_SSE);
  assert.ok(
    !/"work_unit_result"/.test(code),
    "⛔ 代码里不许出现 work_unit_result 这个 type（旧端会把它当「起轮指令」）",
  );
  assert.ok(
    /type:\s*"connected" \| "notification" \| "turn_started" \| "unknown"/.test(
      code,
    ),
    "★ 事件类型联合里必须是 turn_started（且 unknown 兜底仍在）",
  );
});

test("GC-P30-S6b 帧的 id: 行处理不许动（信号帧不带 id: ⇒ 游标不推进）", () => {
  const code = repoCode(NOTIFY_SSE);
  assert.ok(
    /if \(frame\.id\) lastEventId = frame\.id;/.test(code),
    "⛔ `if (frame.id) lastEventId = frame.id` 这一行不许改（信号帧不带 id: 行）",
  );
});

test("GC-P30-S6c 端侧不许起轮 / 不许本地插气泡（这一批改动不许引入）", () => {
  const notifyCode = repoCode(NOTIFY_SSE);
  const detailCode = repoCode(DETAIL);
  // ⛔ 端侧不许用 work_unit_ref 发起 chat/stream（服务端已经起好了 ⇒ 双份）。
  assert.ok(
    !/work_unit_ref/.test(notifyCode),
    "⛔ 通知流这边不许出现 work_unit_ref（端侧不再起轮）",
  );
  assert.ok(
    !/work_unit_ref/.test(detailCode),
    "⛔ 会话页这边不许出现 work_unit_ref（端侧不再起轮）",
  );
  // ⛔ 端侧不插本地「（后台任务XXX已完成）」气泡（服务端已经写了 user 行）。
  assert.ok(
    !/后台任务.*已完成/.test(detailCode),
    "⛔ 会话页不许本地插「（后台任务XXX已完成）」气泡（服务端已经写了 user 行）",
  );
});
