import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "../scripts/lib/strip-comments.mjs";

/**
 * [T-120 · P0] **跨会话残留**回归防线。
 *
 * ## 用户现象
 * 「user 最新的一条信息渲染的所有 session 都有」——
 * 切到**任何一个**会话，都能看到**上一个会话**里那条最新的用户消息。
 *
 * ## 病根（生产实证 · 安装包 0.7.42 的 asar）
 *   安装的包是从 **`feat/t118-interrupt-three-stage` 分支**出的（不是发布线）。
 *   那个分支的「切 chatId ⇒ 复位本会话内存态」effect **只清了流式相关的那几个**
 *   （streaming* / pendingApprovals / streamError / waitingFirstFrame），
 *   **一个都没清**跟「用户消息 + 队列」有关的：
 *   · `setPendingUserMsg(null)`   ← **乐观上屏的用户行**（这就是「最新一条信息」的载体）
 *   · `setPendingUserAdopted(false)`
 *   · `setLocalQueue([])` / `setInboxItems([])` / `setPendingWork([])`
 *   · `setProcessedInboxIds(new Set())`
 *
 *   ⇒ `pendingUserMsg` 是**组件级 state**，ChatDetail 在 /chat/:id 之间**不重挂载**
 *   ⇒ 切会话后它还是**上一条用户消息**
 *   ⇒ `messages` useMemo 把它**无条件拼进新会话的列表**
 *   ⇒ **每一个会话都显示同一条用户消息**。
 *
 * ## 发布线其实修过（T-083 / T-114）
 *   `impl/session-append-all-relations` 上有完整的复位清单 —— 但 T-118 分支**没带上**，
 *   而**出包用的恰恰是 T-118 分支** ⇒ 修好的东西被出包动作覆盖掉了。
 *
 * ## 钉住的断言
 *   T120-PC-1  切会话的复位 effect **存在**（认得出它）
 *   T120-PC-2  它**清了乐观行**（`setPendingUserMsg`）—— 本 bug 的直接死因
 *   T120-PC-3  它**清了乐观行的冻结标记**（`setPendingUserAdopted`）—— 成对，否则新会话被旧标记挡住
 *   T120-PC-4  它清了**队列三件套**（`setLocalQueue` / `setInboxItems` / `setPendingWork`）
 *   T120-PC-5  它清了 `setProcessedInboxIds`
 *   T120-PC-6  复位 effect 的依赖数组**含 `chatId`**（否则切会话根本不触发）
 *   T120-PC-7  乐观行的可见判据**三个条件都在**（存在 ∧ 未认亲 ∧ 未冻结）
 *
 * 运行: node --test test/pc-cross-session-residue.test.mjs
 */

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const DETAIL = "src/routes/ChatDetail.tsx";

const raw = readFileSync(join(REPO, DETAIL), "utf8");
const code = stripComments(raw, DETAIL);

/** 抽出「切 chatId ⇒ 复位」那个 effect 的函数体。 */
function extractResetEffect(src) {
  // 找 setPendingApprovals(chatId ? ...) —— 它是复位 effect 的第一行
  const anchor = src.indexOf("setPendingApprovals(chatId");
  if (anchor < 0) return null;
  // 往前找 effect 起点（`useEffect(() => {`）
  const start = src.lastIndexOf("useEffect(() => {", anchor);
  if (start < 0) return null;
  // 往后找依赖数组
  const end = src.indexOf("}, [chatId", anchor);
  if (end < 0) return null;
  return src.slice(start, end);
}

test("T120-PC-1 · 存在「切 chatId ⇒ 复位本会话内存态」的 effect", () => {
  const effect = extractResetEffect(code);
  assert.ok(effect, "★ 找不到复位 effect（切会话什么都不清 ⇒ 跨会话残留）");
  assert.ok(effect.length > 200, "★ 复位 effect 太短，像是找错了地方");
});

test("T120-PC-2 · 复位 effect 清了乐观行（setPendingUserMsg）—— 本 bug 的直接死因", () => {
  const effect = extractResetEffect(code);
  assert.ok(effect, "★ 找不到复位 effect");
  assert.ok(
    /setPendingUserMsg\s*\(\s*null\s*\)/.test(effect),
    "★ 必须清 `setPendingUserMsg(null)` —— 否则切会话后乐观行还挂在组件 state 上 ⇒ 每个会话都显示同一条用户消息",
  );
});

test("T120-PC-3 · 复位 effect 清了乐观行的冻结标记（setPendingUserAdopted）—— 成对", () => {
  const effect = extractResetEffect(code);
  assert.ok(effect, "★ 找不到复位 effect");
  assert.ok(
    /setPendingUserAdopted\s*\(\s*false\s*\)/.test(effect),
    "★ 必须清 `setPendingUserAdopted(false)` —— 它跟 setPendingUserMsg(null) 是一对",
  );
});

test("T120-PC-4 · 复位 effect 清了队列三件套", () => {
  const effect = extractResetEffect(code);
  assert.ok(effect, "★ 找不到复位 effect");
  for (const fn of ["setLocalQueue", "setInboxItems", "setPendingWork"]) {
    assert.ok(
      effect.includes(fn),
      `★ 必须清 \`${fn}\` —— 旧会话的队列/横幅会串到新会话`,
    );
  }
});

test("T120-PC-5 · 复位 effect 清了 setProcessedInboxIds", () => {
  const effect = extractResetEffect(code);
  assert.ok(effect, "★ 找不到复位 effect");
  assert.ok(
    effect.includes("setProcessedInboxIds"),
    "★ 必须清 `setProcessedInboxIds` —— 旧会话的 ack 集合会让新会话的队列条误显示「已处理」",
  );
});

test("T120-PC-6 · 复位 effect 的依赖数组含 chatId（否则切会话不触发）", () => {
  const anchor = code.indexOf("setPendingApprovals(chatId");
  assert.ok(anchor > 0, "★ 找不到复位 effect");
  const end = code.indexOf("}, [chatId", anchor);
  assert.ok(end > 0, "★ 复位 effect 的依赖数组必须含 chatId");
  const deps = code.slice(end, end + 40);
  assert.ok(
    deps.includes("chatId"),
    `★ 依赖数组必须含 chatId —— 实际: ${deps.replace(/\n/g, " ")}`,
  );
});

test("T120-PC-7 · 乐观行的可见判据三个条件都在（存在 ∧ 未认亲 ∧ 未冻结）", () => {
  assert.ok(
    /pendingUserMsg\s*&&\s*!historyHasSameUser\s*&&\s*!pendingUserAdopted/.test(code),
    "★ 判据必须是 `pendingUserMsg && !historyHasSameUser && !pendingUserAdopted` —— "
      + "缺第三个 ⇒ 认亲成功后又被加回 ⇒ 「闪一下就没了」",
  );
});
