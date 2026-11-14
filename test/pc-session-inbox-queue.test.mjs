// [2026-11-14 · 订正 28 · W5] PC 端「会话队列」+「按钮状态机」—— 回归断言
//
// ---------------------------------------------------------------------------
// 契约依据: docs/design/async-work-unit-architecture-2026-11.md
//   §3.6 队列 / §3.7 按钮状态机 / §3.8「停止」的作用域 = 本会话的一切 / §3.9 UI 参考
//   （cross-platform-sse-event-contract-附录.md **订正 28** —— 条款还没进正文，
//    所以这里把关键条款复述在断言里）
//
// ## 覆盖断言
//
//   GC-P28-1  队列条 UI：「N 条排队中 ⌄」+「⏫」+ 每条正文预览
//   GC-P28-2  插队（立即发送）走服务端 flush 端点，⛔ 不碰打断语义
//   GC-P28-3  「发送」在轮次在跑时 ⇒ **进队列**（不打断、不立即发）
//   GC-P28-4  按钮状态机：判据 = 主 agent 轮次 × 后台活 × 输入框有没有字
//   GC-P28-5  「停止」的作用域 = **本会话的一切**（轮次 + 所有后台活）
//   GC-P28-6  输入框在轮次在跑时**不许禁用**（不然用户根本没法补充信息）
//   GC-P28-7  API 走现成的 `request()`（⛔ 不许新造 HTTP 栈）+ 端点路径对齐服务端
//   GC-P28-8  本机作业表记下**业务会话**（不然「停本会话的一切」在本机认不出来）
//
// 运行: node --test test/pc-session-inbox-queue.test.mjs   (完全离线, 不渲染 React)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "../scripts/lib/strip-comments.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");
const repoCode = (p) => stripComments(repoSrc(p), p);

const INBOX_LIB = "src/lib/session-inbox.ts";
const ACTION_LIB = "src/lib/chat-action.ts";
const QUEUE_BAR = "src/components/chat/QueueBar.tsx";
const BG_BANNER = "src/components/chat/BackgroundWorkBanner.tsx";
const INPUT_BAR = "src/components/chat/ChatInputBar.tsx";
const DETAIL = "src/routes/ChatDetail.tsx";
const JOB_RUNNER = "electron/client-tools/jobRunner.ts";
const BG_JOBS = "electron/client-tools/backgroundJobs.ts";
const JOB_VIEW = "electron/client-tools/jobView.ts";
const SHARED = "shared/types.ts";

// ===========================================================================
// GC-P28-1 · 队列条 UI
// ===========================================================================

test("GC-P28-1 队列条: 「N 条排队中」+「⏫」+ 每条正文预览", () => {
  const code = repoCode(QUEUE_BAR);
  assert.ok(code.includes("条排队中"), "★ 队列条要有「N 条排队中」");
  assert.ok(code.includes("⏫"), "★ 队列条要有「⏫」（立即发送 = 插队）");
  // 展开/收起
  assert.ok(code.includes("onToggle"), "左边的「N 条排队中 ⌄」可展开");
  assert.ok(code.includes("aria-expanded"), "展开态要给 a11y 一个交代");
  // 每条排队消息的正文预览
  assert.ok(code.includes("queue-item"), "★ 每条排队消息要有自己的行（正文预览）");
  assert.ok(code.includes("it.content"), "★ 每行要显示那条消息的正文");
  // 插队 = flush
  assert.ok(code.includes("onFlush"), "「⏫」要把 id 抛给父组件（插队）");
});

test("GC-P28-1b 队列条: 「⏫」作用在**队首**那条 + 每条自己也带一个", () => {
  const code = repoCode(QUEUE_BAR);
  assert.ok(
    /const head = items\[0\]/.test(code),
    "★ 队列条上的「⏫」默认作用于队首那条（服务端排序 = priority desc, seq asc）",
  );
  assert.ok(
    /items\.map\(\(it\) =>/.test(code),
    "★ 展开区里每条排队消息**自己**也带一个「⏫」（把那条插队）",
  );
});

// ===========================================================================
// GC-P28-2 / GC-P28-7 · 插队 + API 层
// ===========================================================================

test("GC-P28-2 「立即发送」= 插队 = 服务端 flush 端点（⛔ 不碰打断语义）", () => {
  const lib = repoCode(INBOX_LIB);
  assert.ok(
    /`\/yinian\/sessions\/\$\{sessionId\}\/inbox\/\$\{encodeURIComponent\(messageId\)\}\/flush`/.test(lib),
    "★ 插队端点路径要对齐服务端（POST /yinian/sessions/:id/inbox/:messageId/flush）",
  );
  assert.ok(/method:\s*"POST"/.test(lib), "flush 必须是 POST");
  // ⛔ 插队**不许**发取消意图（打断语义不许动）
  assert.ok(
    !/sendCancelDelete|chat\/cancel|intent.*USER_STOP/i.test(lib),
    "⛔ 插队不许碰取消端点（打断语义不许动 —— 插队是并入，不是打断）",
  );
});

test("GC-P28-7 API 走现成的 request()（⛔ 不许新造 HTTP 栈）+ 三个端点路径", () => {
  const lib = repoCode(INBOX_LIB);
  assert.ok(
    /from\s+"\.\/api"/.test(lib),
    "★ 必须复用 lib/api.ts 的封装（鉴权 / 401 自动 refresh 都在那儿）",
  );
  assert.ok(/request</.test(lib), "读队列 / 插队 / pending-work 都走 request()");
  assert.ok(
    /`\/yinian\/sessions\/\$\{sessionId\}\/inbox`/.test(lib),
    "★ 队列端点路径要对齐服务端",
  );
  assert.ok(
    /`\/yinian\/sessions\/\$\{sessionId\}\/pending-work`/.test(lib),
    "★ pending-work 端点路径要对齐服务端（按钮状态机的判据之二）",
  );
  // pending-work 的字段
  assert.ok(/interface PendingWorkItem/.test(lib), "要有 pending-work 的类型");
  assert.ok(/tool/.test(lib), "pending-work 项要带 tool（作业类型）");
});

test("GC-P28-7b 入队走**同一个** chat/stream 端点（服务端决定排队还是起新轮）", () => {
  const lib = repoCode(INBOX_LIB);
  assert.ok(
    /chat\/stream/.test(lib),
    "★ 入队 = 同一个 POST /chat/stream（服务端 W3-① 那一段）⇒ 端侧不新造协议",
  );
  assert.ok(
    /res\.status === 409/.test(lib),
    "★ 服务端说「这一轮还在跑、没排上」(409) 时必须**如实**报失败（不许假装排上了）",
  );
});

// ===========================================================================
// GC-P28-3 · 「发送」在轮次在跑时 ⇒ 进队列
// ===========================================================================

test("GC-P28-3 轮次在跑时点「发送」⇒ 进队列（不打断、不立即发）", () => {
  const code = repoCode(DETAIL);
  assert.ok(
    /if \(streamingAssistantId && !streamingStalled\) \{\s*void enqueueIntoQueue\(/.test(code),
    "★ 轮次在跑时 handleSubmit 必须走 enqueueIntoQueue（**不许**直接起新轮）",
  );
  assert.ok(
    /const enqueueIntoQueue = useCallback/.test(code),
    "要有 enqueueIntoQueue（入队这一路）",
  );
  // 入队**不许**打断当前轮（不许 abort / cancel）
  const enq = code.slice(code.indexOf("const enqueueIntoQueue"), code.indexOf("const flushQueueItem"));
  assert.ok(
    !/abort\(|sendCancelDelete|USER_STOP/.test(enq),
    "⛔ 入队不许打断当前轮（「立即发送」= 并入，不是打断）",
  );
  // 没排上 ⇒ 把文字退回输入框（不许吞掉用户写的话）
  assert.ok(
    /insertText\(content\)/.test(enq),
    "★ 没排上时要把文字**退回输入框**（⛔ 不许悄悄吞掉用户写的话）",
  );
});

// ===========================================================================
// GC-P28-4 · 按钮状态机
// ===========================================================================

test("GC-P28-4 按钮状态机 = 主 agent 轮次 × 后台活 × 输入框有没有字", async () => {
  const { resolveChatAction } = await import("../src/lib/chat-action.ts");
  const cases = [
    // [turnRunning, pendingWork, hasText] ⇒ [action, effect]
    [true, false, false, "stop", "stop-everything"],
    [true, true, false, "stop", "stop-everything"],
    [true, false, true, "send", "queue"],
    [true, true, true, "send", "queue"],
    [false, true, false, "stop", "stop-everything"],
    [false, true, true, "send", "queue"],
    [false, false, true, "send", "send-now"],
  ];
  for (const [turnRunning, pendingWork, hasText, action, effect] of cases) {
    const d = resolveChatAction({ turnRunning, pendingWork, hasText });
    assert.equal(
      d.action,
      action,
      `轮次${turnRunning ? "在跑" : "不在跑"}+后台${pendingWork ? "有活" : "全停"}+输入框${hasText ? "有字" : "空"} ⇒ 按钮应是 ${action}`,
    );
    assert.equal(d.effect, effect, "点击后的效果要对");
  }
});

test("GC-P28-4b 状态机真的接进了输入栏（不是各写各的）", () => {
  const bar = repoCode(INPUT_BAR);
  assert.ok(
    /resolveChatAction\(/.test(bar),
    "★ 输入栏必须调 resolveChatAction（⛔ 不许在组件里另写一套判据）",
  );
  assert.ok(
    /action\.action === "stop"/.test(bar),
    "★ 按钮形态由状态机决定（停止 / 发送 两态）",
  );
  const detail = repoCode(DETAIL);
  assert.ok(
    /hasPendingWork=\{sessionBackgroundWork\.length > 0\}/.test(detail),
    "★ 判据之二（后台活）必须传进输入栏",
  );
  assert.ok(
    /listPendingWork\(/.test(detail),
    "★ 后台活要问服务端要（GET .../pending-work）",
  );
});

// ===========================================================================
// GC-P28-5 · 「停止」的作用域 = 本会话的一切
// ===========================================================================

test("GC-P28-5 「停止」= 停本会话的一切（轮次 + 所有后台活）", () => {
  const code = repoCode(DETAIL);
  const stop = code.slice(code.indexOf("const handleStop = useCallback"));
  assert.ok(
    /stream\.abort\("user"\)/.test(stop),
    "★ 停止仍要掐主 agent 轮次（打断语义不变 = 彻底丢弃产出）",
  );
  assert.ok(
    /void stopBackgroundWork\(\)/.test(stop),
    "★ 停止还要停**所有**后台活（本会话的 PC 作业 / 云端子 agent）",
  );
  // 后台活的范围 = 本机作业 + 服务端 pending-work 报的
  const bg = code.slice(code.indexOf("const stopBackgroundWork = useCallback"));
  assert.ok(/bridge\.stopJob\(/.test(bg), "★ 本机作业走 stopJob（杀进程树）");
  assert.ok(
    /sessionBackgroundWork/.test(bg),
    "★ 停的范围 = sessionBackgroundWork（**本会话**的活，不碰别的会话）",
  );
});

test("GC-P28-5b 后台活的范围 = 本机作业（按会话筛）+ 服务端 pending-work", () => {
  const code = repoCode(DETAIL);
  const derived = code.slice(
    code.indexOf("const sessionBackgroundWork = useMemo"),
    code.indexOf("const queueEntries"),
  );
  assert.ok(/pendingWork/.test(derived), "★ 服务端 pending-work 算进来");
  assert.ok(/localJobs/.test(derived), "★ 本机作业也算进来");
  assert.ok(
    /j\.sessionId !== chatId/.test(derived),
    "★ 本机作业**只算本会话的**（⛔ 不许停别的会话的活）",
  );
  assert.ok(
    /status !== "running" && j\.status !== "queued"/.test(derived),
    "★ 已结束的作业不算「还在跑」",
  );
});

test("GC-P28-5c 「等待后台任务」横幅上单独一个「停止后台任务」入口", () => {
  const banner = repoCode(BG_BANNER);
  assert.ok(
    banner.includes("等待后台任务完成"),
    "★ 横幅文案 = 「等待后台任务完成…」（§3.9）",
  );
  assert.ok(
    banner.includes("停止后台任务"),
    "★ 横幅上必须有单独的「停止后台任务」入口（输入框有字时的那个缺口）",
  );
  assert.ok(/data-testid="background-work-stop"/.test(banner), "要有可断言的入口");
  const detail = repoCode(DETAIL);
  assert.ok(
    /<BackgroundWorkBanner/.test(detail),
    "★ ChatDetail 必须渲染这条横幅",
  );
  assert.ok(
    /count=\{sessionBackgroundWork\.length\}/.test(detail),
    "横幅的条数 = 本会话还在跑的后台活数",
  );
});

// ===========================================================================
// GC-P28-6 · 输入框在轮次在跑时不许禁用
// ===========================================================================

test("GC-P28-6 轮次在跑时输入框**可编辑**（不然用户没法补充信息）", () => {
  const code = repoCode(INPUT_BAR);
  assert.ok(
    !/disabled=\{isStreaming \|\| disabled\}/.test(code),
    "★ textarea 不许再被 isStreaming 禁用（用户要能打字 ⇒ 才能排队）",
  );
  assert.ok(/disabled=\{disabled\}/.test(code), "textarea 只受 disabled 控制");
});

// ===========================================================================
// GC-P28-8 · 本机作业表记下业务会话
// ===========================================================================

test("GC-P28-8 本机作业记下**业务会话**（不然「停本会话的一切」认不出来）", () => {
  const runner = repoCode(JOB_RUNNER);
  assert.ok(
    /sessionId: sessionId \? String\(sessionId\) : null/.test(runner),
    "★ 起作业时要把业务会话写进作业表",
  );
  const bg = repoCode(BG_JOBS);
  assert.ok(
    /startJob\(jobId, service, invocation, input\.sessionId/.test(bg),
    "★ 派单带的 sessionId 要一路传到作业表",
  );
  const view = repoCode(JOB_VIEW);
  assert.ok(/sessionId/.test(view), "★ 作业的视图形状要带 sessionId（渲染层要按会话筛）");
  const shared = repoCode(SHARED);
  assert.ok(
    /sessionId\?: string \| null/.test(shared),
    "★ LocalJobInfo 要带 sessionId",
  );
});

// ===========================================================================
// 补充 · 队列条的数据源必须是**服务端**（跨端共享）
// ===========================================================================

test("GC-P28-9 队列条的数据源 = 服务端 inbox（跨端共享）", () => {
  const detail = repoCode(DETAIL);
  assert.ok(/listInbox\(/.test(detail), "★ 要读服务端的收件箱");
  assert.ok(/setInboxItems/.test(detail), "服务端队列要进 state");
  assert.ok(
    /<QueueBar/.test(detail) && /items=\{queueEntries\}/.test(detail),
    "★ 队列条要渲染 queueEntries（服务端行 + 端侧乐观行）",
  );
});

// ===========================================================================
// GC-P28-10 · 出队（泵队列）—— PM 拍板：**由客户端泵**
// ===========================================================================

test("GC-P28-10 轮次自然结束 ⇒ 把队首那条当**普通消息**发出去 + consume 收掉", () => {
  const detail = repoCode(DETAIL);
  // ① 泵队列：走**现有的发消息链路**（startStream）⇒ 正常建轮 + 服务端写 user 行。
  assert.ok(
    /void startStream\(head\.content, \[\]\)/.test(detail),
    "★ 泵队列必须走普通发消息链路（startStream）—— 不是自己造 user 行",
  );
  assert.ok(
    /const pumpQueue = useCallback/.test(detail),
    "要有 pumpQueue（泵队列）",
  );
  // ② 收掉：调服务端的 consume 端点。
  assert.ok(
    /consumeInboxMessage\(chatId, pumpedId\)/.test(detail),
    "★ 发出去之后要调 consume 把这条从队列里收掉",
  );
  // ③ 触发点 = 轮次自然结束（终态帧之后的流收尾）。
  assert.ok(
    /pumpQueueRef\.current\?\.\(\)/.test(detail),
    "★ 泵队列的触发点要在轮次结束的地方",
  );
  const finallyBlock = detail.slice(detail.indexOf("} finally {"));
  assert.ok(
    /sawTerminal/.test(finallyBlock) && /myTurnRef\.current/.test(finallyBlock),
    "★ 只有**本端发起**且**见到终态帧**的轮次才泵（⛔ 旁观别人的轮次不许泵）",
  );
  assert.ok(
    /turnAc\.signal\.aborted/.test(finallyBlock),
    "★ 用户喊停 ⇒ 不泵（用户明确放弃了当前方向）",
  );
});

test("GC-P28-10b 泵队列**跳过**已被插队的那条（否则一条消息发两遍）", () => {
  const detail = repoCode(DETAIL);
  const pump = detail.slice(
    detail.indexOf("const pumpQueue = useCallback"),
    detail.indexOf("pumpQueueRef.current = "),
  );
  assert.ok(
    /find\(\(it\) => !it\.injectable\)/.test(pump),
    "★ 泵队列要跳过 injectable 的那些（⏫ 插队的那条由正在跑的那一轮自己并入）",
  );
});

test("GC-P28-10c 「⏫ 立即发送」只调 flush（⛔ 不自己发、不打断当前轮）", () => {
  const detail = repoCode(DETAIL);
  const flush = detail.slice(
    detail.indexOf("const flushQueueItem = useCallback"),
    detail.indexOf("const stopBackgroundWork = useCallback"),
  );
  assert.ok(/flushInboxMessage\(chatId, id\)/.test(flush), "★ 插队走 flush 端点");
  assert.ok(
    !/startStream\(|enqueueIntoQueue\(/.test(flush),
    "⛔ 插队不许自己发消息（那是正在跑的那一轮的事）",
  );
  assert.ok(
    !/abort\(|sendCancelDelete|USER_STOP/.test(flush),
    "⛔ 插队不许打断当前轮",
  );
});

test("GC-P28-10d consume 端点路径对齐服务端", () => {
  const lib = repoCode(INBOX_LIB);
  assert.ok(
    /`\/yinian\/sessions\/\$\{sessionId\}\/inbox\/\$\{encodeURIComponent\(messageId\)\}\/consume`/.test(lib),
    "★ consume 端点路径要对齐服务端（POST /yinian/sessions/:id/inbox/:messageId/consume）",
  );
  assert.ok(/method:\s*"POST"/.test(lib), "consume 必须是 POST");
});
