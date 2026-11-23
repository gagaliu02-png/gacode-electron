import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "../scripts/lib/strip-comments.mjs";

/**
 * [T-121 · P0] **气泡在流走完后消失、退出重进才出现**的回归防线。
 *
 * ## 病根（生产实证 · PC 端 diag.log 2026-11-23 22:11）
 *
 *   `认亲 same=true optimistic=pending-user-… optCid=8SJBB4000003VBBVXR4VCE0Q09`
 *   ⇒ 乐观行**认亲成功过一次** ⇒ `pendingUserAdopted=true`（T-114 的冻结标记）
 *   ⇒ 乐观行**再也不加回**了（T-114 的设计：认亲成功后它就该退休）。
 *
 *   而**服务端那一行**此刻还**不在 PC 手上的 history 里**：
 *   终态帧那一刻服务端**还没落库**（webhook 还要 ~1s）
 *   ⇒ 上面那次立即的 `invalidateQueries(["history"])` 拉回来的**仍是旧列表**
 *   ⇒ `historyHasSameUser` 变 false ⇒ 乐观行不加回、服务端行又还没来
 *   ⇒ **屏幕上那条气泡凭空消失**。
 *
 *   ⇒ 退出重进 ⇒ `getHistory` 重新拉全量 ⇒ 服务端行回来了 ⇒ 气泡出现。
 *   **与用户现象逐字吻合。**
 *
 * ## 修法
 *   终态帧的**延迟刷新**（那段注释自己写着「等服务端落库完」）**必须也刷 `["history"]`**。
 *   ⇒ 原来只刷 `["chats"]` ⇒ 那次延迟刷新**专门为等落库**却只刷了标题列表 ⇒ 等了个空。
 *
 * ## 钉住的断言
 *   T121-PC-1  存在「终态帧的延迟刷新」定时器（认得出它）
 *   T121-PC-2  这个延迟刷新**同时刷 `["history", chatId]`**（本 bug 的直接死因）
 *   T121-PC-3  它**也刷 `["chats"]`**（不能为了修这个把原有的弄丢）
 *   T121-PC-4  延迟时长 ≥ 1000ms（服务端落库要 ~1s ⇒ 太早刷还是旧列表）
 *   T121-PC-5  乐观行冻结判据**仍然存在**（不许顺手删掉 T-114 的修复）
 *
 * 运行: node --test test/pc-stream-end-history-refresh.test.mjs
 */

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const DETAIL = "src/routes/ChatDetail.tsx";

const raw = readFileSync(join(REPO, DETAIL), "utf8");
const code = stripComments(raw, DETAIL);

/** 抽出「终态帧的延迟刷新」那段（chatsRefreshTimerRef 赋值 + 定时器体）。 */
function extractDelayedRefresh(src) {
  const anchor = src.indexOf("chatsRefreshTimerRef.current = window.setTimeout");
  if (anchor < 0) return null;
  const start = src.lastIndexOf("chatsRefreshTimerRef.current = window.setTimeout", anchor);
  // 定时器体：从 setTimeout( 到配对的 );
  const open = src.indexOf("(", start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end < 0) return null;
  return src.slice(start, end);
}

test("T121-PC-1 · 存在「终态帧的延迟刷新」定时器", () => {
  const block = extractDelayedRefresh(code);
  assert.ok(block, "★ 找不到终态帧的延迟刷新定时器");
  assert.ok(block.includes("chatsRefreshTimerRef"), "★ 认不出这是延迟刷新那段");
});

test("T121-PC-2 · 延迟刷新同时刷 ['history', chatId]（本 bug 的直接死因）", () => {
  const block = extractDelayedRefresh(code);
  assert.ok(block, "★ 找不到延迟刷新定时器");
  assert.ok(
    /invalidateQueries\(\{\s*queryKey:\s*\[\s*"history"\s*,\s*chatId\s*\]\s*\}\)/.test(block),
    "★ 延迟刷新必须刷 `['history', chatId]` —— "
      + "原来只刷 ['chats'] ⇒ 服务端那一行永远不进 PC 的 history ⇒ "
      + "认亲冻结 + 服务端行没来 ⇒ 气泡凭空消失",
  );
});

test("T121-PC-3 · 延迟刷新仍刷 ['chats']（不能为了修这个把原有的弄丢）", () => {
  const block = extractDelayedRefresh(code);
  assert.ok(block, "★ 找不到延迟刷新定时器");
  assert.ok(
    /invalidateQueries\(\{\s*queryKey:\s*\[\s*"chats"\s*\]\s*\}\)/.test(block),
    "★ 必须保留刷 ['chats']（会话标题在落库后也会变）",
  );
});

test("T121-PC-4 · 延迟时长 ≥ 1000ms（服务端落库要 ~1s，太早刷还是旧列表）", () => {
  const block = extractDelayedRefresh(code);
  assert.ok(block, "★ 找不到延迟刷新定时器");
  const m = block.match(/},\s*(\d+)\s*\)/);
  assert.ok(m, "★ 读不出延迟时长");
  const ms = Number(m[1]);
  assert.ok(ms >= 1000, `★ 延迟必须 ≥ 1000ms（实际 ${ms}ms）—— 服务端落库要 ~1s`);
});

test("T121-PC-5 · 乐观行冻结判据仍在（不许顺手删掉 T-114 的修复）", () => {
  assert.ok(
    /pendingUserMsg\s*&&\s*!historyHasSameUser\s*&&\s*!pendingUserAdopted/.test(code),
    "★ 认亲冻结判据必须保留 —— 它挡住了重复气泡；本 bug 的修法是在**补 history**那侧，不是在删冻结",
  );
});
