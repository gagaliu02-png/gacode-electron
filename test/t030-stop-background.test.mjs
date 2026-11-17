// [T-030 · 2026-11-17] 「停止后台任务」⇒ 被停的作业**静默结算**（不回报、不起轮）
//
// 真机 session 1026：安卓点横幅上的「停止」⇒ 后台作业跑完**照样回报**⇒ 用户会话里冒出一条
// assistant 汇报 ⇒ 观感「停止无效」。
//
// 本测试是**源码级断言**（PC 仓既有风格：pc-device-channel-stability / p2-uplink-pc 同款），
// 钉住三件事：
//   ① PC 回传「作业已被用户停止」时**必须带 `cancelledByUser: true`**（协议字段，不是文案）；
//   ② `ClientToolResult` 类型里必须有这个字段（否则 TS 编译就挂）；
//   ③ 端侧「停止后台任务」走的是 `STOP_BACKGROUND` origin ⇒ 线上 intent 落专用意图
//      （gaclaw 认得它才会去停服务端后台子 agent）。
//
// 运行: node --test test/t030-stop-background.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const read = (p) => readFileSync(join(REPO, p), "utf8");

const DEVICE_CLIENT = "electron/client-tools/deviceClient.ts";
const TYPES = "electron/client-tools/types.ts";

test("T030-1 PC 回传「已被用户停止」时带 cancelledByUser 标记", () => {
  const src = read(DEVICE_CLIENT);
  const fn = src.slice(
    src.indexOf("private async reportJobStopped"),
    src.indexOf("private async reportJobStopped") + 900,
  );
  assert.match(
    fn,
    /cancelledByUser:\s*true/,
    "★ 回传「作业已被用户停止」必须带 cancelledByUser: true（服务端据此**静默结算**：不回报、不起轮）",
  );
});

test("T30-2 ClientToolResult 有 cancelledByUser 字段（协议字段不是文案）", () => {
  const src = read(TYPES);
  const iface = src.slice(
    src.indexOf("export interface ClientToolResult"),
    src.indexOf("export interface ClientToolResult") + 1200,
  );
  assert.match(
    iface,
    /cancelledByUser\?:\s*boolean/,
    "★ ClientToolResult 必须有 cancelledByUser（gaclaw/unified 靠它判断「用户喊停」）",
  );
});

test("T30-3 端侧「停止后台任务」用 STOP_BACKGROUND origin（线上落专用意图）", () => {
  const vm = read("src/routes/ChatDetail.tsx");
  assert.ok(
    vm.includes("STOP_BACKGROUND") || vm.includes("stopBackgroundWork"),
    "★ PC 端也要有「停本会话后台活」这一路（与安卓同口径）",
  );
});
