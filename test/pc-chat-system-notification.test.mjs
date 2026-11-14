// [2026-11-14] PC 端「普通聊天回复 ⇒ **系统级通知**」（通知栏，不是站内信）
//
// ---------------------------------------------------------------------------
// PM 原话：「普通聊天回复要加上通知的哈 就是系统级的通知哈 不是站内信」
//
// 背景（服务端现状）：
//   · 服务端**普通聊天回复今天不发 CustomNotification（站内信）**；
//   · PC 端的系统通知此前主要由**站内信 SSE** 驱动
//     （src/lib/notifications-sse.ts → electron/notifications.ts 的 new Notification()）。
//   ⇒ 所以要有一条**独立**的路径：**收到 assistant 回复**（聊天 SSE 的终态帧）
//     ⇒ 弹一条系统通知 ⇒ 点一下切到那个会话。
//
// ## 覆盖断言
//
//   GC-N-1  聊天回复走的是**系统通知**通道（notificationSSESend），不是站内信
//   GC-N-2  尊重**桌面通知开关**（沿用站内信那条路径的同一个偏好源）
//   GC-N-3  「窗口不在前台」**或**「用户不在这个会话」⇒ 才弹
//   GC-N-4  标题 = 会话标题 / 正文 = 回复开头几十字 / 点击 = 切到该会话
//   GC-N-5  打断 = 彻底丢弃 ⇒ 用户按停止时**不**通知
//
// 运行: node --test test/pc-chat-system-notification.test.mjs   (完全离线)

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

const CHAT_NOTIFY = "src/lib/chat-notifications.ts";
const DETAIL = "src/routes/ChatDetail.tsx";
const NOTIFY_SSE = "src/lib/notifications-sse.ts";
const MAIN_NOTIFY = "electron/notifications.ts";

// ===========================================================================
// GC-N-1 · 聊天回复 ⇒ 系统通知（不是站内信）
// ===========================================================================

test("GC-N-1 聊天回复走**系统通知**通道（notificationSSESend）", () => {
  const code = repoCode(CHAT_NOTIFY);
  assert.ok(
    code.includes("notificationSSESend"),
    "★ 必须走系统通知通道（renderer → 主进程弹 Windows Toast）",
  );
  assert.ok(
    !/customNotification|notifications\/read|markNotificationRead/.test(code),
    "⛔ 这条路径不许去写站内信（服务端今天也不发）",
  );
  // 通知的触发点 = 聊天 SSE 的**终态帧**
  const detail = repoCode(DETAIL);
  assert.ok(
    /if \(isTerminalDone\(chunk\)\) \{[\s\S]{0,900}notifyAiReplyArrived\(/.test(detail),
    "★ 触发点必须是聊天 SSE 的终态帧（收到 assistant 回复）",
  );
});

test("GC-N-1b 系统通知的落地链路是现成的那条（主进程 new Notification + 点击跳落点）", () => {
  const main = repoCode(MAIN_NOTIFY);
  assert.ok(main.includes("new Notification"), "主进程负责弹 Windows Toast");
  assert.ok(
    main.includes("NOTIFICATION_CLICKED_CHANNEL"),
    "★ 点一下要推落点给渲染层（⇒ 切到那个会话）",
  );
  const sse = repoCode(NOTIFY_SSE);
  assert.ok(
    sse.includes("onNotificationClick"),
    "★ 渲染层要接住落点并跳路由（NotificationSSEBridge）",
  );
});

// ===========================================================================
// GC-N-2 · 尊重桌面通知开关（沿用站内信那条路径的同一个偏好源）
// ===========================================================================

test("GC-N-2 聊天回复的通知要过**桌面通知开关**（同一个偏好源）", () => {
  const code = repoCode(CHAT_NOTIFY);
  assert.ok(
    /loadNotificationPrefs\(\)/.test(code),
    "★ 必须读通知偏好（用户关了桌面通知就不该被弹窗打扰）",
  );
  assert.ok(
    /!prefs\.enabled \|\| !prefs\.desktopEnabled/.test(code),
    "★ 两个开关都要看（总开关 + 桌面通知）",
  );
  // 跟站内信那条路径**同一个**偏好源（别各读各的）
  const sse = repoCode(NOTIFY_SSE);
  assert.ok(
    sse.includes("loadNotificationPrefs()"),
    "站内信那条路径也读同一个偏好源 ⇒ 两边口径一致",
  );
});

// ===========================================================================
// GC-N-3 · 弹的条件：不在前台 **或** 不在这个会话
// ===========================================================================

test("GC-N-3 「窗口不在前台」**或**「用户不在这个会话」⇒ 弹", () => {
  const code = repoCode(CHAT_NOTIFY);
  assert.ok(
    /isWindowFocused\(\)/.test(code),
    "★ 要问主进程「窗口在前台吗」（不用 document.hidden）",
  );
  assert.ok(
    /if \(focused && isViewingSession\(info\.chatId\)\) return false;/.test(code),
    "★ 只有「在前台 **且** 正在看这个会话」才不弹",
  );
  assert.ok(
    /export function isViewingSession\(chatId: string\): boolean/.test(code),
    "要有 isViewingSession（判「用户是不是在这个会话」）",
  );
  // HashRouter ⇒ 路由在 hash 里
  assert.ok(
    /window\.location\?\.hash/.test(code),
    "★ PC 用 HashRouter ⇒ 判路由要看 location.hash（不是 pathname）",
  );
});

test("GC-N-3b isViewingSession 是**导出**的判据（别的端也能复用）", () => {
  // ⚠️ 本仓的 renderer 侧模块用**无扩展名**的相对 import（Vite 解析）
  //    ⇒ `node --test` 直接 import 会 ERR_MODULE_NOT_FOUND
  //    ⇒ 这里只断言源码形状（跟本仓其它断言一个路子）。
  const code = repoCode(CHAT_NOTIFY);
  assert.ok(
    /export function isViewingSession\(chatId: string\): boolean/.test(code),
    "要导出这个判据",
  );
  assert.ok(
    /export async function notifyAiReplyArrived\(/.test(code),
    "要导出通知入口",
  );
});

// ===========================================================================
// GC-N-4 · 标题 / 正文 / 点击落点
// ===========================================================================

test("GC-N-4 标题 = 会话标题；正文 = 回复开头几十字；落点 = 那个会话", () => {
  const code = repoCode(CHAT_NOTIFY);
  assert.ok(
    /const title = info\.chatTitle \|\| CHAT_NOTIFICATION_TITLE_FALLBACK/.test(code),
    "★ 标题取会话标题（取不到 → 「新对话」）",
  );
  assert.ok(
    /const target = `\/chat\/\$\{encodeURIComponent\(info\.chatId\)\}`/.test(code),
    "★ 点击落点 = 那个会话（/chat/{id}）",
  );
  // 正文 = 回复开头几十字（剥 thinking → 截断）
  assert.ok(
    /export const CHAT_NOTIFICATION_BODY_MAX = 100/.test(code),
    "★ 正文长度上限（web 同款 100 字）",
  );
  assert.ok(
    /\.slice\(\s*0,\s*CHAT_NOTIFICATION_BODY_MAX,?\s*\)/.test(code),
    "★ 正文要截断（取开头几十字）",
  );
  assert.ok(
    /stripThinkingTags\(info\.content \?\? ""\)/.test(code),
    "正文剥掉 thinking 标签（web 同款）",
  );
});

// ===========================================================================
// GC-N-5 · 打断 = 彻底丢弃 ⇒ 按停止时不通知
// ===========================================================================

test("GC-N-5 用户按停止 ⇒ **不**通知（打断 = 彻底丢弃产出）", () => {
  const detail = repoCode(DETAIL);
  const terminal = detail.slice(detail.indexOf("if (isTerminalDone(chunk)) {"));
  assert.ok(
    /notifyAiReplyArrived\(/.test(terminal),
    "通知挂在**终态帧**上",
  );
  const cancel = detail.slice(detail.indexOf("if (isCancelFrame(chunk)) {"));
  assert.ok(
    !/notifyAiReplyArrived\(/.test(cancel),
    "⛔ 取消帧不许通知（用户按停止 ⇒ 产出丢弃）",
  );
});
