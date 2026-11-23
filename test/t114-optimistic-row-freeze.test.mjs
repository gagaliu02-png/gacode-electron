// [T-114 · 2026-11-23] **跨端渲染「闪现后消失」的回归防线**。
//
// ---------------------------------------------------------------------------
// 病根（生产实证 · PC 端 diag.log 2026-11-23 00:51:32–00:51:47）
// ---------------------------------------------------------------------------
//   `认亲 same=true` → `same=false` → `same=true` **来回翻转**，
//   而 `optCid=2ASA0200003KNQ4PY22HCBZZAR` 跨 8 小时**始终是同一条**
//   ⇒ `pendingUserMsg` 这个 state **从来没被清过**（`setPendingUserMsg(null)` 全仓无结果）。
//
//   `same=false` 的那几帧 `histCid=-`（history 里**一条 user 行都没有**）
//   ⇒ 乐观行被**加回**列表 ⇒ 同一条消息在屏幕上**闪一下就没了**。
//
// ---------------------------------------------------------------------------
// 修法
// ---------------------------------------------------------------------------
//   认亲成功 ⇒ **冻结**该条乐观行（`pendingUserAdopted`）
//   ⇒ 此后 history 再怎么变（切会话 / 分页 / 过滤）都**不再**把它加回。
//   ⚠️ 不是「简单置 null」—— 那会让「服务端行还没到」的窗口里乐观行提前消失。
//
// 运行: node --test test/t114-optimistic-row-freeze.test.mjs（完全离线 · 纯源码形状断言）

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const src = readFileSync(join(REPO, "src/routes/ChatDetail.tsx"), "utf8");

// ---------------------------------------------------------------------------
// A1 · 冻结标记存在，且**参与**了「乐观行是否上屏」的判据
// ---------------------------------------------------------------------------
test("A1 乐观行上屏判据必须同时看「认亲结果」和「冻结标记」", () => {
  assert.match(
    src,
    /const \[pendingUserAdopted, setPendingUserAdopted\] = useState\(false\)/,
    "A1 认亲成功后必须有冻结标记（pendingUserAdopted）",
  );
  assert.match(
    src,
    /!!pendingUserMsg && !historyHasSameUser && !pendingUserAdopted/,
    "A1 乐观行上屏判据 = 有乐观行 ∧ 未认亲 ∧ **未冻结**（三缺一不可）",
  );
});

// ---------------------------------------------------------------------------
// A2 · 认亲成功 ⇒ 冻结（状态推进必须在 effect 里，useMemo 不许有副作用）
// ---------------------------------------------------------------------------
test("A2 认亲成功 ⇒ 冻结，且推进放在 effect 里", () => {
  assert.match(
    src,
    /if \(historyHasSameUser\) setPendingUserAdopted\(true\)/,
    "A2 认亲成功必须冻结乐观行",
  );
  // 冻结与复位必须在**同一个 effect** —— 分成两个 ⇒ 复位后执行会抹掉刚冻结的标记。
  const effectBlock = src.match(
    /adoptedClientMsgIdRef\.current[\s\S]{0,900}?setPendingUserAdopted\(false\)[\s\S]{0,300}?if \(historyHasSameUser\) setPendingUserAdopted\(true\)/,
  );
  assert.ok(
    effectBlock,
    "A2 冻结与复位必须在同一个 effect 里（复位后执行会抹掉刚冻结的标记）",
  );
});

// ---------------------------------------------------------------------------
// A3 · 复位：新的一条乐观行 ⇒ 旧的冻结标记对它无意义
// ---------------------------------------------------------------------------
test("A3 换一条乐观行 ⇒ 冻结标记必须复位（否则新消息的乐观行不显示）", () => {
  assert.match(
    src,
    /adoptedClientMsgIdRef\.current !== cid/,
    "A3 乐观行的 client_msg_id 变了 ⇒ 必须复位冻结标记",
  );
  assert.match(
    src,
    /setPendingUserAdopted\(false\)/,
    "A3 必须有复位动作",
  );
});

// ---------------------------------------------------------------------------
// A4 · 切会话 ⇒ 乐观行与冻结标记都要清（跨会话残留）
// ---------------------------------------------------------------------------
test("A4 切会话 ⇒ 清乐观行 + 清冻结标记", () => {
  const resetBlock = src.match(
    /setPendingUserMsg\(null\);[\s\S]{0,900}?setPendingUserAdopted\(false\);/,
  );
  assert.ok(
    resetBlock,
    "A4 切会话的 reset 里必须同时清 pendingUserMsg 与 pendingUserAdopted",
  );
});

// ---------------------------------------------------------------------------
// A5 · 认亲判据**只有一份**（渲染层与 effect 共用 ⇒ 不会两处漂移）
// ---------------------------------------------------------------------------
test("A5 client_msg_id 认亲判据全仓只许一份", () => {
  const compares = src.match(/m\.clientMsgId === pendingUserMsg\.clientMsgId/g) || [];
  assert.equal(
    compares.length,
    1,
    "A5 认亲判据只许有一份（不许渲染层与 effect 各写一遍 ⇒ 会漂移）",
  );
});

// ---------------------------------------------------------------------------
// B1 · 修复 B：常驻订阅切轮只认**帧顶层显式** origin（不认反推）
//     —— 反推会把「手机发起的普通用户轮」误判成 work_unit_result。
// ---------------------------------------------------------------------------
test("B1 常驻切轮只认帧顶层显式 origin（手机轮不许被反推成机器轮）", () => {
  assert.match(
    src,
    /const explicitOrigin = readFrameOrigin\(chunk\)/,
    "B1 必须读帧顶层显式 origin",
  );
  assert.match(
    src,
    /isMachineTurnOrigin\(claim\.origin\) && explicitOrigin !== null/,
    "B1 刷 history 的前提 = 机器起轮 **且** 帧显式给了 origin（反推的不算）",
  );
});

// ---------------------------------------------------------------------------
// C1 · 修复 C：段序归位（merge-history 与 web 端逐字节相同）
// ---------------------------------------------------------------------------
test("C1 merge-history 必须含 T-052 段序归位（与 web 端对齐）", () => {
  const merge = readFileSync(join(REPO, "src/lib/sse/merge-history.ts"), "utf8");
  assert.match(merge, /orderByTurnSegment/, "C1 必须有段序归位");
  assert.match(merge, /parseTurnSegment/, "C1 必须能拆出段号");
  assert.match(
    merge,
    /return orderByTurnSegment\(\[\.\.\.finalServer, \.\.\.inflight\]\)/,
    "C1 归位必须作用在最终列表上",
  );
});

// ---------------------------------------------------------------------------
// C2 · PC 渲染层**真的**用上了段序归位（web 有、PC 原本没有 ⇒ 补上）
//     —— 包里必须能看到 orderByTurnSegment（否则 PC 端段序仍是坏的）
// ---------------------------------------------------------------------------
test("C2 PC 渲染层必须调用段序归位（本机段 + 服务端注入行混排 ⇒ 同毫秒顺序会倒挂）", () => {
  assert.match(
    src,
    /import \{ orderByTurnSegment \} from "\.\.\/lib\/sse\/merge-history"/,
    "C2 PC 端必须从共享层引入段序归位（判据住在共享层 ⇒ 不许内联第二份）",
  );
  assert.match(
    src,
    /orderByTurnSegment\(\[\.\.\.withCutRows, streamingMsg\]\)/,
    "C2 最终列表（带流式行）必须走段序归位",
  );
  assert.match(
    src,
    /orderByTurnSegment\(withCutRows\)/,
    "C2 最终列表（无流式行）必须走段序归位",
  );
});
