// [T-157 · 2026-11-25] **PC 常驻订阅断流 ⇒ 必须补拉 history**
//
// ## 病根（真机 session 1191 · 2026-11-25）
//
//   22:29:18 用户发「你可以不用再清理 task 了」（乐观行上屏）
//   22:29:23 常驻订阅 `read loop error: Socket closed` ⇒ 断流
//   22:29:31 服务端才把这行注入落库
//
//   PC 端 T-121/T-138 的「延迟刷 history 等服务端落库」补丁**只挂在正常 done 分支**
//   (`isTerminalDone(chunk)`)，断流走 `onError` ⇒ 那段整个不执行。
//   ⇒ 乐观 user 行已被认亲冻结退休 (`pendingUserAdopted`)，服务端行又没刷回来
//   ⇒ **用户气泡凭空消失**（「好懂了…」在，user 那句没了）。
//
// ## 钉住的断言
//   T157-PC-1  常驻订阅的 onError 里有 history 失效（而且是延迟的，等落库）
//   T157-PC-2  正常 done 分支的延迟刷 history 仍在（不许为了修这个把原来的弄丢）
//   T157-PC-3  乐观行冻结判据仍在（T-114，不许顺手删）
//
// 运行: node --test test/pc-stream-error-history-refresh.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "../scripts/lib/strip-comments.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const DETAIL = "src/routes/ChatDetail.tsx";
const raw = readFileSync(join(REPO, DETAIL), "utf8");
const code = stripComments(raw, DETAIL);

test("T157-PC-1 常驻订阅 onError 必须补拉 history（且延迟等服务端落库）", () => {
  const marker = "常驻订阅不可用";
  const at = code.indexOf(marker);
  assert.ok(at >= 0, "找得到常驻订阅 onError 的日志锚点");
  const tail = code.slice(at, at + 1600);
  assert.match(
    tail,
    /invalidateQueries\(\{\s*queryKey:\s*\["history",\s*chatId\]/,
    "onError 路径必须 invalidate history —— 否则服务端落库的行刷不回来",
  );
  assert.match(
    tail,
    /setTimeout\(/,
    "必须是延迟刷新（服务端落库要 ~1s，立即刷仍是旧列表）",
  );
});

test("T157-PC-2 正常 done 分支的延迟刷 history 仍在（T-121/T-138 不许回退）", () => {
  assert.match(code, /isTerminalDone\(chunk\)/, "done 分支还在");
  const delays = code.match(/const delays = \[[^\]]+\]/);
  assert.ok(delays, "T-138 的递增延迟刷新还在");
  const doneTail = code.slice(code.indexOf("isTerminalDone(chunk)"));
  // ★ [T-175] 窗口从 3000 放宽到 6000 ——
  //   终态那一刻**立刻**刷 history 那次被去掉了（服务端还没落库 ⇒ 必然拉到旧数据
  //   ⇒ 长会话 = 白白全量重渲染一遍）。
  //   ⚠️ **保护意图不变**：done 分支**仍然**要刷 history ——
  //   由「递增重试」(3s/6s/12s) + 「延迟刷新」(2s) 两处承担。
  assert.match(
    doneTail.slice(0, 6000),
    /invalidateQueries\(\{\s*queryKey:\s*\["history",\s*chatId\]/,
    "done 分支仍然刷 history",
  );
});

test("T157-PC-3 乐观行冻结判据仍在（T-114 不许回退）", () => {
  assert.match(code, /pendingUserAdopted/, "冻结标记还在");
  assert.match(code, /historyHasSameUser/, "认亲判据还在");
});
