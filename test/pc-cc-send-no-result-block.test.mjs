import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "../scripts/lib/strip-comments.mjs";

/**
 * [T-121 · P0] **`pc_cc_send` 横幅永挂**的回归防线（结构性断言）。
 *
 * ## 病根（生产实证 · ping-pong 3 轮）
 *
 *   Cody 用 `pc_cc_send` 发 PONG #1/#2/#3，我当普通对话回了「PONG #n」
 *   ⇒ `parseGaclawResultBlock` 找不到带 `task_id` 的结果块
 *   ⇒ `readResult()` 里的 `hit.task_id === job.taskId` 永不成立
 *   ⇒ 派单停在 `running` / `settled=false`
 *   ⇒ **手机端「后台任务」横幅一直挂着**，直到用户手动「停止后台任务」
 *      （生产账本 @14:44:58 三条 `cancelled_by_user` 才结清）。
 *
 * ## 修法（本文件钉住的形状）
 *
 *   在「确实看到对方产出新正文」之后记 `firstReplyTextAt`，
 *   宽限 `PEER_JOB_NO_BLOCK_GRACE_MS` 仍没有合法结果块 ⇒
 *   **如实结算为 error**（不谎称 ok）⇒ D3 ⇒ settleDispatch ⇒ 横幅消失。
 *
 * ## 钉住的断言
 *   T121-SEND-1  存在「无结果块宽限窗口」常量，且 ≤ 5 分钟（不能挂 24h）
 *   T121-SEND-2  PeerJob 带 `firstReplyTextAt`
 *   T121-SEND-3  `readResult()` 在新正文出现时记下它
 *   T121-SEND-4  超时分支**存在**且调 `settle`（不是只打日志）
 *   T121-SEND-5  超时结算**不谎称 ok**（status:'error'）
 *   T121-SEND-6  24h 系统 deadline 仍在（没被这次修法顶掉）
 *
 * 运行: node --test test/pc-cc-send-no-result-block.test.mjs
 */

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const FILE = "electron/client-tools/deviceClient.ts";

const raw = readFileSync(join(REPO, FILE), "utf8");
const code = stripComments(raw, FILE);

test("T121-SEND-1 · 存在「无结果块宽限窗口」常量，且 ≤ 5 分钟", () => {
  const m = code.match(/const PEER_JOB_NO_BLOCK_GRACE_MS\s*=\s*([\d\s*+*]+)/);
  assert.ok(m, "★ 缺少 PEER_JOB_NO_BLOCK_GRACE_MS 常量");
  const expr = m[1].replace(/\s/g, "");
  // 支持 `2 * 60 * 1000` 这种写法
  const parts = expr.split("*").map(Number);
  const ms = parts.every(Number.isFinite) ? parts.reduce((a, b) => a * b, 1) : NaN;
  assert.ok(Number.isFinite(ms), `★ 读不出宽限窗口: ${expr}`);
  assert.ok(ms >= 30_000 && ms <= 5 * 60 * 1000,
    `★ 宽限窗口应 30s~5min（实际 ${ms}ms）—— 太短会误结，太长横幅还是要挂很久`);
});

test("T121-SEND-2 · PeerJob 带 firstReplyTextAt", () => {
  assert.ok(/firstReplyTextAt\s*:\s*number\s*\|\s*null/.test(code),
    "★ PeerJob 必须记「第一次看到对方新正文」的时刻");
  assert.ok(/firstReplyTextAt\s*:\s*null/.test(code),
    "★ 初始化必须为 null（没看到过正文不能误计时）");
});

test("T121-SEND-3 · readResult() 在新正文出现时记下它", () => {
  assert.ok(/if\s*\(text\)\s*\{[\s\S]{0,300}firstReplyTextAt\s*===\s*null\s*\)\s*job\.firstReplyTextAt\s*=\s*Date\.now\(\)/.test(code),
    "★ 看到新正文后必须记 firstReplyTextAt —— 它是收口的起点");
});

test("T121-SEND-4 · 超时分支存在且调 settle（不是只打日志）", () => {
  const m = code.match(/PEER_JOB_NO_BLOCK_GRACE_MS[\s\S]{0,500}?this\.settle\(/);
  assert.ok(m, "★ 宽限超时后必须真的结算（调 this.settle），否则横幅还是不消");
});

test("T121-SEND-5 · 超时结算不谎称 ok", () => {
  const seg = code.slice(
    code.indexOf("Date.now() - job.firstReplyTextAt"),
    code.indexOf("Date.now() - job.firstReplyTextAt") + 600,
  );
  assert.ok(/status:\s*['"]error['"]/.test(seg),
    "★ 没有合法结果块时必须 status:'error'（如实说明），不能报 ok");
  assert.ok(/error:\s*[`'"]/.test(seg),
    "★ 要带明确错误原因（没找到 task_id 的结果块）");
});

test("T121-SEND-6 · 24h 系统 deadline 仍在", () => {
  assert.ok(/const PEER_JOB_DEADLINE_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(code),
    "★ 24h 兜底 deadline 不许被这次修法顶掉");
});
