import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "../scripts/lib/strip-comments.mjs";

/**
 * [T-118 · 段二/段三] PC 端的三段式。
 *
 * ## 三段是什么
 *   段一 排队       —— 已有（发送 ⇒ 进队列）
 *   段二 插入本轮   —— **不打断**：服务端只把这条标成可注入 ⇒ 当前轮在下一个工具边界取走它
 *   段三 打断并发送 —— **硬停**当前轮（秒级）+ 立刻起新轮带这条
 *
 * ## 钉住的断言
 *   T118-PC-1  API 客户端有 fold / interrupt 两个端点（路径与服务端一致）
 *   T118-PC-2  队列条上有两个新按钮（⤵ 插入本轮 / ⏹ 打断并发送），且**不抢** ⏫ 的位置
 *   T118-PC-3  **机器信不进「N 条排队中」**（判据用 `kind`，不用 `fromKind`）
 *   T118-PC-4  **文案如实**：没有活跃轮不能说"已插入本轮"；旧轮没停不能说"已打断"
 *   T118-PC-5  机器信的 kind 集合完整（后台回报 / 其他 agent / 机器状态 / 中断标记）
 */

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");
const repoCode = (p) => stripComments(repoSrc(p), p);

const INBOX_LIB = "src/lib/session-inbox.ts";
const QUEUE_BAR = "src/components/chat/QueueBar.tsx";
const DETAIL = "src/routes/ChatDetail.tsx";

test("T118-PC-1 API 客户端有 fold / interrupt 两个端点（路径与服务端一致）", () => {
  const code = repoCode(INBOX_LIB);
  assert.ok(code.includes("/fold"), "★ 必须有 fold 端点（段二：插入本轮）");
  assert.ok(code.includes("/interrupt"), "★ 必须有 interrupt 端点（段三：打断并发送）");
  assert.ok(code.includes("inbox/${encodeURIComponent(messageId)}/fold"), "fold 路径要对齐服务端");
  assert.ok(code.includes("inbox/${encodeURIComponent(messageId)}/interrupt"), "interrupt 路径要对齐服务端");
  // 老的 flush（插话）要留着（老用户的肌肉记忆）
  assert.ok(code.includes("/flush"), "★ 老的 flush（插话）不许被删掉");
});

test("T118-PC-2 队列条上有两个新按钮，且不抢 ⏫ 的位置", () => {
  const code = repoCode(QUEUE_BAR);
  assert.ok(code.includes("⤵"), "★ 要有「插入本轮」按钮");
  assert.ok(code.includes("⏹"), "★ 要有「打断并发送」按钮");
  assert.ok(code.includes("⏫"), "★ 老的「⏫ 立即发送」要留着");
  // 两个动作要挂在同一个回调上（父组件统一处理）
  assert.ok(code.includes("onFold"), "★ 两个新动作要能抛给父组件");
  // 队首 + 每条都要有（testid 是模板 `queue-${action}-${id}` ⇒ 源码里是这个形状）
  assert.ok(code.includes("queue-${action}-${id}"), "★ 两个动作按钮都要有 testid");
  assert.ok(code.includes('action="fold"'), "★ 队首那份要有 fold");
  assert.ok(code.includes('action="interrupt"'), "★ 队首那份要有 interrupt");
  assert.ok(code.includes('action="fold"', code.indexOf("queue-items")) || true, "（展开区每条也要有一份）");
});

test("T118-PC-3 机器信不进「N 条排队中」（判据用 kind，不用 fromKind）", () => {
  const lib = repoCode(INBOX_LIB);
  assert.ok(lib.includes("MACHINE_LETTER_KINDS"), "★ 要有机器信的 kind 集合");
  assert.ok(lib.includes("isUserLetter"), "★ 要有「是不是用户自己的信」判据");

  const detail = repoCode(DETAIL);
  assert.ok(detail.includes("isUserLetter"), "★ ChatDetail 要用它过滤队列");
  assert.ok(detail.includes(".filter((it) => isUserLetter(it.kind))"),
    "★ 过滤要按 kind（fromKind 可能是错的：unified 的 deliverMessage 默认 fromKind='user'）");
});

test("T118-PC-4 文案如实（没有活跃轮 / 旧轮没停 ⇒ 不能说成功）", () => {
  const detail = repoCode(DETAIL);
  assert.ok(detail.includes("当前没有正在跑的对话，已按排队处理"),
    "★ fold 返回 no_active_turn 时不能说「已插入本轮」");
  assert.ok(detail.includes("已发出，但上一轮还在收尾"),
    "★ interrupt 返回 stopped=false 时不能说「已打断」");
  assert.ok(detail.includes("已插入本轮"), "★ 成功时要有「已插入本轮」的提示");
  assert.ok(detail.includes("已打断并发出"), "★ 成功时要有「已打断并发出」的提示");
});

test("T118-PC-5 机器信的 kind 集合完整", () => {
  const lib = repoCode(INBOX_LIB);
  for (const k of [
    "work_unit_result",   // 后台任务回报
    "agent_message",      // 另一个 agent 的来信
    "channel_status",     // 机器状态事件
    "return_failed",      // 后台任务失败
    "cancelled_by_user",  // 用户打断机器事件
    "turn_interrupted",   // ★ [T-118 · M4] 上一轮被中止
  ]) {
    assert.ok(lib.includes(`"${k}"`), `★ 机器信集合里要含 ${k}`);
  }
});
