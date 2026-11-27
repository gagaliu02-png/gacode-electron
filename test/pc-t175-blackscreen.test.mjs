// [T-175] **PC 端「主进程卡死 ⇒ 窗口黑屏」** 的回归护栏
//
// ---------------------------------------------------------------------------
// 病根（生产实证 2026-11-27，用户报「今天下午 PC 已经黑屏多次」）：
//
//   渲染层把 `diagLog` 写在了 **`messages` 的 useMemo 里**，而那个 useMemo 的依赖含
//   `streamingContent` / `streamingEvents` / `streamingPhases`
//   ⇒ **机器回合每来一帧 SSE，useMemo 就重算一次 ⇒ 每帧打一条日志**。
//
//   证据：`%APPDATA%/Gacode/diag.log` 里 `[merge] 认亲 …` 写了 **49,552 条**
//   （4.6 小时），其中**一秒内 199 条**。
//
//   而主进程那边是 **`fs.appendFileSync`（同步阻塞写）** + 每条一次 `fs.statSync`
//   ⇒ 每帧一次同步磁盘 IO ⇒ 199 帧/秒 = 199 次同步写/秒
//   ⇒ **主进程 IO 被打满 ⇒ 窗口黑屏**。
//
// 修法（三层，缺一层都可能复发）：
//   ① 渲染层：把 `diagLog` 从 useMemo 挪进 effect（只在认亲状态**变化**时打）。
//   ② 主进程：`appendFileSync` ⇒ 异步 `appendFile` + 队列合并写（不阻塞主进程）。
//   ③ 终态后 history 刷新次数收敛（6 次 ⇒ 3 次）—— 长会话每次都是全量重渲染。
//
// 运行: node --test test/pc-t175-blackscreen.test.mjs   (完全离线: 不连网)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "../scripts/lib/strip-comments.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");

const DETAIL = "src/routes/ChatDetail.tsx";
const DIAG = "electron/diag-log.ts";

const clean = (p) => stripComments(repoSrc(p), p);

// ===========================================================================
// ① 渲染层：diagLog 不许在 useMemo 里
// ===========================================================================

test("T-175-BS1 useMemo 里不许有 diagLog（每帧重算 ⇒ 每帧写盘）", () => {
  const src = repoSrc(DETAIL);
  // 逐个 useMemo 块，找出里面有没有 diagLog。
  const blocks = [];
  let depth = 0;
  let start = -1;
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const l = lines[i];
    if (/useMemo\(\(\)\s*=>\s*\{/.test(l) && start < 0) {
      start = i;
      depth = 0;
    }
    if (start >= 0) {
      depth += (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length;
      if (depth <= 0 && i > start) {
        blocks.push(lines.slice(start, i + 1).join("\n"));
        start = -1;
      }
    }
  }
  const bad = blocks.filter((b) => /diagLog\s*\(/.test(b));
  assert.equal(
    bad.length,
    0,
    `★ 有 ${bad.length} 个 useMemo 里含 diagLog —— useMemo 会随流式每帧重算\n` +
      "  ⇒ 每帧一条日志 ⇒ 主进程同步写盘 ⇒ 黑屏（2026-11-27 生产实证）",
  );
});

test("T-175-BS2 认亲日志在 effect 里，且只在状态变化时打", () => {
  const code = clean(DETAIL);
  assert.ok(
    code.includes("lastMergeLogKeyRef"),
    "认亲日志必须有「上次打过的 key」⇒ 状态没变就不重复打",
  );
  assert.ok(
    code.includes("if (lastMergeLogKeyRef.current === key) return;"),
    "★ key 没变就直接 return（这是「每帧只打一次」的关键）",
  );
});

// ===========================================================================
// ② 主进程：写盘必须异步
// ===========================================================================

test("T-175-BS3 diag 日志不许同步写盘（appendFileSync）", () => {
  const code = clean(DIAG);
  assert.ok(
    !code.includes("appendFileSync"),
    "★ diag 日志不许用 appendFileSync（同步阻塞）—— 高频日志时会把主进程 IO 打死 ⇒ 黑屏",
  );
  assert.ok(
    code.includes("fs.appendFile("),
    "必须改成异步 appendFile",
  );
});

test("T-175-BS4 日志合并成批写 + 轮转检查降频", () => {
  const code = clean(DIAG);
  assert.ok(
    code.includes("pendingChunk"),
    "必须用队列把多条日志合并成一次写",
  );
  assert.ok(
    code.includes("ROTATE_CHECK_INTERVAL_MS"),
    "★ 轮转检查必须按时间间隔（不是每条都 statSync）",
  );
});

// ===========================================================================
// ③ 终态后 history 刷新次数收敛（长会话每次刷新 = 全量重渲染）
// ===========================================================================

test("T-175-BS5 终态后 history 刷新收敛（原来 6 次 → 4 次）", () => {
  const code = clean(DETAIL);
  assert.ok(
    /const delays = \[3000, 6000, 12000\]/.test(code),
    "★ T-138 的递增重试必须是 [3000,6000,12000] —— " +
      "第一枪不能早于 2279ms（服务端正文实测值，1s/2s 都必然踩空 ⇒ 白拉一次全量）",
  );
  // 终态那一刻**不再**刷 history ⇒ 6 次里的第 1 次去掉 ⇒ 剩 4 次
  // （2s 延迟刷新 + 3s/6s/12s 递增重试）。
  const lines = repoSrc(DETAIL).split(/\r?\n/);
  const i = lines.findIndex((l) => l.includes("刷新 chats (server 落库后 title 改了)"));
  assert.ok(i >= 0, "抠不到终态刷新段");
  const seg = stripComments(lines.slice(i, i + 12).join("\n"), DETAIL);
  assert.ok(
    !/queryKey:\s*\["history"/.test(seg),
    "★ 终态那一刻不许再刷 history（服务端还没落库 ⇒ 这次必然拉到旧数据）",
  );
});

test("T-175-BS6 终态那一刻不再刷 history（必然拉到旧数据）", () => {
  const src = repoSrc(DETAIL);
  // 直接看「刷新 chats」那一行**之后**到下一个语句之间有没有 history invalidate。
  const lines = src.split(/\r?\n/);
  const i = lines.findIndex((l) => l.includes("刷新 chats (server 落库后 title 改了)"));
  assert.ok(i >= 0, "抠不到终态刷新段");
  // 往后找 12 行（那段只有注释 + 一句 chats invalidate + 注释）
  const seg = lines.slice(i, i + 12).join("\n");
  const codeOnly = stripComments(seg, DETAIL);
  assert.ok(
    !/queryKey:\s*\["history"/.test(codeOnly),
    "★ 终态那一刻不许再刷 history（服务端还没落库 ⇒ 这次必然拉到旧数据）",
  );
});
