// [2026-11-15 · 订正 30 · 观众侧] PC 端 —— 「别的会话有后台任务回报」的用户可见提示
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
//   端侧**用户可见行为**这一层，web 端做了、PC 端这批补上：
//     · **当前正看着的那个会话** ⇒ **不提示**（那儿已经自动 attach ⇒ 弹了是噪音）
//     · **别的会话**            ⇒ ① 侧栏红点（复用 ChatItem 既有的 hasNewMessage）
//                                ② 系统托盘通知（复用既有的 notificationSSESend）
//     · 两层提示都**点得动** ⇒ 点了跳到那个会话（/chat/<id>）
//
// ---------------------------------------------------------------------------
// 覆盖断言
// ---------------------------------------------------------------------------
//   GC-P30-H1  别的会话有信号 ⇒ **会**产生提示（行为级）
//   GC-P30-H2  当前会话有信号 ⇒ **不**产生提示（行为级）
//   GC-P30-H3  提示可跳转（行为级 + 源码级）
//   GC-P30-H4  端侧接线：订阅 + 红点 + 复用既有通知通道（源码级）
//   GC-P30-H5  ⛔ 反证：提示那条路上没有 sendMessageStream / chat/stream /
//               work_unit_ref；没有本地造「（后台任务…已完成）」气泡的字面量
//
// 运行: node --test test/pc-turn-started-hint.test.mjs  (完全离线, 不渲染 React)

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

const HINT = "src/lib/turn-started-hint.ts";
const SHELL = "src/components/layout/AppShell.tsx";

const dir = makeTmpDir("verify-turn-started-hint");

// ---------------------------------------------------------------------------
// 加载生产模块
// ---------------------------------------------------------------------------
// ⚠️ `src/lib/turn-started-hint.ts` **零运行时 import** ⇒ 直接加载真源码。
const hint = await import(
  writeModule(dir, "turn-started-hint", repoSrc(HINT))
);

// ---------------------------------------------------------------------------
// 提示那条路的源码（去注释 + 归一 LF）—— ⛔ 反证断言扫的就是它
// ---------------------------------------------------------------------------
const hintCode = repoCode(HINT);
// AppShell 的两个函数体（组件本体 + 会话列表面板）—— 提示那条路全在里面。
const shellCode = repoCode(SHELL);
const shellComponent = extractFunction(shellCode, "AppShell", SHELL) ?? "";
const shellListPanel = extractFunction(shellCode, "ChatListPanel", SHELL) ?? "";
assert.ok(shellComponent, "抠不出 AppShell 组件");
assert.ok(shellListPanel, "抠不出 ChatListPanel 组件");
// 提示那条路 = 提示模块 + AppShell 组件本体 + 会话列表面板（红点那行在这）。
const hintPath = [hintCode, shellComponent, shellListPanel].join("\n");

// ===========================================================================
// GC-P30-H1 · 别的会话有信号 ⇒ 会产生提示
// ===========================================================================

test("GC-P30-H1 别的会话有信号 ⇒ 会产生提示", () => {
  const h = hint.buildTurnStartedHint(
    {
      sessionId: "sess-1",
      inboxId: "inbox-9",
      jobId: "job-3",
      reason: "work_unit_result",
    },
    { viewingSessionId: "sess-2", sessionTitle: "甲" },
  );
  assert.ok(h, "★ 别的会话 ⇒ 必须产生提示");
  assert.equal(h.sessionId, "sess-1", "★ 提示挂在**发生信号的那个会话**上");
  assert.equal(h.title, "甲", "★ 标题用会话标题（用户认得出是哪个会话）");
  assert.ok(h.body && h.body.length > 0, "★ 提示必须有正文（光有标题说不清是什么）");
  assert.equal(h.target, "/chat/sess-1", "★ 落点必须能跳到那个会话");

  // 用户**不在任何会话**里（首页 / 其它页）⇒ 同样要提示。
  assert.ok(
    hint.buildTurnStartedHint({ sessionId: "sess-1" }, { viewingSessionId: null }),
    "★ 用户没在看任何会话 ⇒ 也要提示",
  );
  assert.ok(
    hint.buildTurnStartedHint({ sessionId: "sess-1" }, {}),
    "★ 没有 viewingSessionId ⇒ 也要提示",
  );

  // 会话标题取不到 ⇒ 兜底「新对话」（不许空标题）。
  const noTitle = hint.buildTurnStartedHint(
    { sessionId: "sess-1" },
    { viewingSessionId: "sess-2" },
  );
  assert.ok(noTitle);
  assert.equal(
    noTitle.title,
    hint.TURN_STARTED_HINT_TITLE_FALLBACK,
    "★ 标题取不到 ⇒ 兜底（不许空标题）",
  );
  assert.ok(
    noTitle.title.length > 0,
    "★ 兜底标题不许是空串（Windows Toast 空标题会被主进程丢掉）",
  );

  // 载荷不完整 ⇒ 没有 sessionId ⇒ 没法路由 ⇒ **不提示**（也不许崩）。
  assert.equal(
    hint.buildTurnStartedHint({ inboxId: "i" }, { viewingSessionId: "s" }),
    null,
    "★ 没有 sessionId ⇒ 不提示（没法路由）",
  );
  assert.equal(
    hint.buildTurnStartedHint(null, { viewingSessionId: "s" }),
    null,
    "★ 载荷是 null ⇒ 不提示（不许崩）",
  );
});

// ===========================================================================
// GC-P30-H2 · 当前会话有信号 ⇒ 不产生提示
// ===========================================================================

test("GC-P30-H2 当前正看着的会话有信号 ⇒ 不产生提示", () => {
  const h = hint.buildTurnStartedHint(
    { sessionId: "sess-1", reason: "work_unit_result" },
    { viewingSessionId: "sess-1", sessionTitle: "甲" },
  );
  assert.equal(
    h,
    null,
    "★ 当前正看着的会话 ⇒ **不提示**（那儿已经自动 attach ⇒ 弹了是噪音）",
  );
  // 有没有标题都一样不提示（判据是 sessionId，不是文案）。
  assert.equal(
    hint.buildTurnStartedHint(
      { sessionId: "sess-1" },
      { viewingSessionId: "sess-1", sessionTitle: "别的" },
    ),
    null,
  );
  // 别的会话仍然要提示（别把提示整个关掉）。
  assert.ok(
    hint.buildTurnStartedHint(
      { sessionId: "sess-2" },
      { viewingSessionId: "sess-1" },
    ),
    "★ 只有**当前**会话不提示，别的会话照常提示",
  );
});

// ===========================================================================
// GC-P30-H3 · 提示可跳转
// ===========================================================================

test("GC-P30-H3 提示可跳转（落点是站内路由 /chat/<id>）", () => {
  assert.equal(
    hint.turnStartedHintTarget("sess-1"),
    "/chat/sess-1",
    "★ 落点必须跟仓里既有的 chatTarget 同形状（/chat/<id>）",
  );
  // 特殊字符要转义（主进程拿它当站内 path 推回渲染层 navigate）。
  assert.equal(
    hint.turnStartedHintTarget("a b/c"),
    "/chat/a%20b%2Fc",
    "★ sessionId 必须 encodeURIComponent",
  );
  const h = hint.buildTurnStartedHint(
    { sessionId: "sess-1" },
    { viewingSessionId: "sess-2" },
  );
  assert.ok(h.target.startsWith("/chat/"), "★ 落点必须是站内 path（点了能跳路由）");
});

test("GC-P30-H3b 红点 / 系统通知都点得动（源码级）", () => {
  // ① 侧栏红点：ChatItem 的 onClick 跳那个会话（既有行为，本仓早就有）。
  assert.ok(
    /onClick=\{\(\) => navigate\(`\/chat\/\$\{c\.id\}`\)\}/.test(shellListPanel),
    "★ 侧栏条目点了必须跳到那个会话（红点才点得动）",
  );
  // ② 系统通知：必须带 target ⇒ 主进程的 click handler 把它推回渲染层跳路由。
  assert.ok(
    /notificationSSESend\?\.\(\{[\s\S]{0,200}?target: hint\.target/.test(
      shellComponent,
    ),
    "★ 系统通知必须带 target（点了才跳得到那个会话）",
  );
  // ③ 落点必须是站内 path（主进程只对 "/xxx" 推回渲染层；http(s) 走浏览器）。
  assert.ok(
    hintCode.includes("`/chat/${encodeURIComponent(sessionId)}`"),
    "★ 落点必须写成站内 path（主进程按 startsWith('/') 分流）",
  );
});

// ===========================================================================
// GC-P30-H4 · 端侧接线（源码级）
// ===========================================================================

test("GC-P30-H4a 侧栏订阅「服务端起轮了」的广播", () => {
  assert.ok(
    /subscribeTurnStarted\(/.test(shellComponent),
    "★ 侧栏必须订阅端内广播通道（否则信号石沉大海）",
  );
  assert.ok(
    /buildTurnStartedHint\(/.test(shellComponent),
    "★ 提示必须走纯逻辑模块（判据集中在一处 ⇒ 可单测）",
  );
  assert.ok(
    /viewingSessionId: viewingChatIdRef\.current/.test(shellComponent),
    "★ 必须把「当前正看着的会话」交给判据（当前会话 ⇒ 不提示）",
  );
  assert.ok(
    /if \(!hint\) return;/.test(shellComponent),
    "★ 算不出提示（当前会话 / 载荷残缺）⇒ 直接返回，不弹",
  );
});

test("GC-P30-H4b 红点复用 ChatItem 既有的 hasNewMessage 标记（不新造组件/样式）", () => {
  assert.ok(
    /c\.hasNewMessage \|\| hintedSessionIds\?\.has\(c\.id\) === true/.test(
      shellListPanel,
    ),
    "★ 本地提示必须并进 ChatItem 既有的 hasNewMessage（不新造红点组件）",
  );
  // ChatItem 组件本身不许被这一批改过（红点样式沿用既有的）。
  const item = repoCode("src/components/chat/ChatItem.tsx");
  assert.ok(
    /aria-label="有新消息"/.test(item),
    "★ ChatItem 的红点标记还在（复用它，不新造样式）",
  );
  // 用户进到那个会话 ⇒ 红点撤掉。
  assert.ok(
    /next\.delete\(currentChatId\)/.test(shellComponent),
    "★ 用户进到那个会话 ⇒ 红点必须撤掉",
  );
});

test("GC-P30-H4c 系统通知走**既有**的通知通道（不新造 IPC / 不新造 Notification）", () => {
  assert.ok(
    /window\.gacode\?\.notificationSSESend\?\.\(/.test(shellComponent),
    "★ 必须复用仓里既有的 Windows Toast 通道（notificationSSESend）",
  );
  // 桌面通知的开关跟站内信 / AI 回复通知**同一个偏好源**。
  assert.ok(
    /loadNotificationPrefs\(\)/.test(shellComponent),
    "★ 必须读既有的通知偏好（用户关了桌面通知就不弹）",
  );
  assert.ok(
    /!prefs\.enabled \|\| !prefs\.desktopEnabled/.test(shellComponent),
    "★ 「启用通知」+「桌面通知」是硬前置（跟 C4-13 同口径）",
  );
  // ⛔ 不许自己 new Notification（那是主进程的事，renderer 拿不到）。
  assert.ok(
    !/new Notification\(/.test(hintPath),
    "⛔ renderer 侧不许 new Notification（复用既有 IPC 通道）",
  );
});

test("GC-P30-H4d 同一条信号被重发（通知流重连）⇒ 不重复弹", () => {
  assert.ok(
    /hintedSignalKeysRef\.current\.has\(signalKey\)/.test(shellComponent),
    "★ 同一条信号（sessionId|inboxId）重发 ⇒ 不许重复弹 Toast",
  );
  assert.ok(
    /decodeURIComponent\(raw\)/.test(shellComponent),
    "★ 当前会话 id 必须 decode（URL 里是编码过的 ⇒ 不 decode 会误判「不是当前会话」）",
  );
});

// ===========================================================================
// GC-P30-H5 · ⛔ 反证（不许做的事）
// ===========================================================================

test("GC-P30-H5a 提示那条路上不许起轮（端侧不再起轮）", () => {
  for (const [label, code] of [
    ["提示模块", hintCode],
    ["侧栏接线", shellComponent],
    ["会话列表面板", shellListPanel],
  ]) {
    assert.ok(
      !/sendMessageStream/.test(code),
      `⛔ ${label} 不许出现 sendMessageStream（端侧不再起轮 ⇒ 否则双份）`,
    );
    assert.ok(
      !/chat\/stream/.test(code),
      `⛔ ${label} 不许出现 chat/stream（端侧不再起轮 ⇒ 否则双份）`,
    );
    assert.ok(
      !/work_unit_ref/.test(code),
      `⛔ ${label} 不许出现 work_unit_ref（不许用它发起 chat/stream）`,
    );
  }
});

test("GC-P30-H5b 提示那条路上不许本地造气泡 / 不许碰报告正文", () => {
  // ⛔ 不许本地插入「（后台任务XXX已完成）」气泡（服务端已经写了 user 行
  //    ⇒ 本地再插 ⇒ 刷新后重复 ⇒ 安卓已因此闪退过）。
  for (const [label, code] of [
    ["提示模块", hintCode],
    ["侧栏接线", shellComponent],
    ["会话列表面板", shellListPanel],
  ]) {
    assert.ok(
      !/后台任务.{0,24}已完成/.test(code),
      `⛔ ${label} 不许出现「（后台任务…已完成）」气泡的字面量`,
    );
    // ⛔ 不许往消息流里插东西（提示只进 toast / 红点，不进气泡）。
    assert.ok(
      !/setMessages\(|\.messages\.push|messages:\s*\[/.test(code),
      `⛔ ${label} 不许往消息流里插东西（提示不进气泡）`,
    );
  }
  // ⛔ 提示只搬运 id —— 载荷里不该出现正文字段。
  assert.ok(
    !/\bcontent\b/.test(hintCode),
    "⛔ 提示模块不许碰报告正文（端侧从头到尾只传 id）",
  );
});

test("GC-P30-H5c 提示那条路上不发任何请求（纯提示）", () => {
  assert.ok(
    !/\bfetch\(/.test(hintPath),
    "⛔ 提示那条路不许发请求（端侧不再起轮）",
  );
  assert.ok(
    !/\brequest\(/.test(hintPath),
    "⛔ 提示那条路不许走 HTTP（端侧不再起轮）",
  );
});
