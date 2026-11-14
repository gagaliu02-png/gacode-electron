// [2026-11-14 · 订正 28 · W5] PC 端「**队列条删除**」—— 回归断言
//
// ---------------------------------------------------------------------------
// 需求（PM 2026-11-14）：「队列的内容是要允许删除的」—— 用户排了队又改主意 ⇒ 得能撤掉。
//
// 服务端端点（unified-api `ded3da2`，**已上线**）：
//   DELETE /api/v1/yinian/sessions/:sessionId/inbox/:messageId
//     · 200 { ok:true, data:{ id, state:"deleted" } }
//     · 404 队列项不存在（或者不属于该会话）
//     · 400 这条已经不在队列里（已经发出 / 已被消费 / 已删）
//
// 语义（复述在断言里 —— 契约文档不在本仓）：
//   · 删的是**队列项**（还没发出去的那条）⇒ 删完它：泵队列**跳过**它、
//     「⏫ 立即发送」也**插不了**它（服务端 flush 要求 state=held）。
//   · ⛔ **不动已经发出去的消息**（那是历史里的 user 行 ⇒ 走撤回/删除那条路）。
//   · ⛔ 删除**不**补写气泡（它没发出去过 ⇒ 不该冒出 user 行）。
//
// ## 覆盖断言
//
//   GC-P28-D1  lib 导出删除函数 + 端点路径/方法对齐服务端（DELETE .../inbox/:id）
//   GC-P28-D2  QueueBar 渲染删除入口（中文 aria-label）+ 绑定 onDelete + 「处理中」态
//   GC-P28-D3  ChatDetail 真的调它（成功刷队列 / 失败如实 toast）
//   GC-P28-D4  端侧乐观行（`local:` 前缀）也能删（服务端还没认领 ⇒ 没有 id 可删）
//   GC-P28-D5  ⛔ 删除不许碰打断语义（⛔ 不许 abort / cancel）
//
// 运行: node --test test/session-queue-delete.test.mjs   (完全离线, 不渲染 React)

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
const QUEUE_BAR = "src/components/chat/QueueBar.tsx";
const DETAIL = "src/routes/ChatDetail.tsx";

// ===========================================================================
// GC-P28-D1 · lib 层：删除端点
// ===========================================================================

test("GC-P28-D1 lib 导出删除函数 + 端点路径/方法对齐服务端", () => {
  const lib = repoCode(INBOX_LIB);
  assert.ok(
    /export function deleteInboxMessage\(/.test(lib),
    "★ lib 必须导出 deleteInboxMessage（队列删除的端侧入口）",
  );
  assert.ok(
    /`\/yinian\/sessions\/\$\{sessionId\}\/inbox\/\$\{encodeURIComponent\(messageId\)\}`/.test(
      lib,
    ),
    "★ 端点路径要对齐服务端（DELETE /yinian/sessions/:sessionId/inbox/:messageId）",
  );
  assert.ok(
    /deleteInboxMessage[\s\S]{0,400}method:\s*"DELETE"/.test(lib),
    "★ 必须是 DELETE 方法（⛔ 不是 POST）",
  );
  // ⛔ 必须走现成的 request()（鉴权 / 401 自动 refresh / v2 信封解包都在那儿）
  assert.ok(
    /from\s+"\.\/api"/.test(lib) && /request</.test(lib),
    "★ 必须复用 lib/api.ts 的 request()（⛔ 不许新造 HTTP 栈）",
  );
  // 删除的返回形状（服务端 200 {ok,data:{id,state:"deleted"}} ⇒ request() 解包成 data）
  assert.ok(
    /Promise<\{ id: string; state: string \}>/.test(lib),
    "★ 删除的返回形状 = { id, state }（request() 把 {ok,data} 解包成 data）",
  );
});

test("GC-P28-D1b ⛔ 删除**不许**碰打断语义（⛔ 不许 abort / cancel）", () => {
  const lib = repoCode(INBOX_LIB);
  const fn = lib.slice(lib.indexOf("export function deleteInboxMessage"));
  assert.ok(
    !/sendCancelDelete|chat\/cancel|USER_STOP/.test(fn),
    "⛔ 删除不许碰取消端点（删一条排队消息 ≠ 打断当前轮）",
  );
});

// ===========================================================================
// GC-P28-D2 · QueueBar：渲染删除入口
// ===========================================================================

test("GC-P28-D2 QueueBar 渲染删除入口（中文 aria-label）+ 绑定 onDelete", () => {
  const bar = repoCode(QUEUE_BAR);
  assert.ok(/onDelete/.test(bar), "★ 队列条要有 onDelete 回调 prop");
  assert.ok(
    /aria-label=\{label\}/.test(bar) && /label="删除这条排队消息"/.test(bar),
    "★ 删除按钮要有中文 aria-label（「删除这条排队消息」）",
  );
  assert.ok(
    /onClick=\{\(\) => onDelete\(id\)\}/.test(bar),
    "★ 删除按钮点一下要把 id 抛给父组件",
  );
  assert.ok(
    /data-testid=\{`queue-delete-\$\{id\}`\}/.test(bar),
    "★ 删除按钮要有可断言的入口（data-testid）",
  );
  // 每条排队消息都要有删除入口（不是只有队首）
  assert.ok(
    /items\.map\(\(it\) =>/.test(bar) && /onDelete=\{onDelete\}/.test(bar),
    "★ 展开区里每条排队消息**自己**也带一个删除入口",
  );
});

test("GC-P28-D2b 正在删除的那一条有「处理中」态（防连点）", () => {
  const bar = repoCode(QUEUE_BAR);
  assert.ok(/deletingId/.test(bar), "★ 队列条要接 deletingId（正在删的那一条）");
  assert.ok(
    /disabled=\{deletingId === it\.id\}/.test(bar),
    "★ 正在删的那一条要禁掉按钮（不许连点）",
  );
});

// ===========================================================================
// GC-P28-D3 · ChatDetail：真的调它
// ===========================================================================

test("GC-P28-D3 ChatDetail 调 deleteInboxMessage + 成功刷队列 / 失败如实报错", () => {
  const detail = repoCode(DETAIL);
  assert.ok(
    /deleteInboxMessage/.test(detail),
    "★ ChatDetail 必须真的调 lib 的删除函数",
  );
  const fn = detail.slice(
    detail.indexOf("const deleteQueueItem = useCallback"),
    detail.indexOf("const stopBackgroundWork = useCallback"),
  );
  assert.ok(
    /await deleteInboxMessage\(chatId, id\)/.test(fn),
    "★ 删除要走 DELETE 端点（chatId + 那条队列项的 id）",
  );
  assert.ok(
    /void refreshInbox\(\)/.test(fn),
    "★ 删成功后要刷新队列（服务端才是真值）",
  );
  assert.ok(
    /toast\(\{[\s\S]{0,200}variant:\s*"danger"/.test(fn),
    "★ 删失败必须**如实**报错（⛔ 不许假装删掉了）",
  );
  // 防连点：正在删的那一条
  assert.ok(/setDeletingId\(id\)/.test(fn), "★ 删除要有「处理中」状态（setDeletingId）");
  assert.ok(/setDeletingId\(null\)/.test(fn), "★ 删完要清掉「处理中」状态");
});

test("GC-P28-D3b 删除入口真的接进了队列条", () => {
  const detail = repoCode(DETAIL);
  assert.ok(
    /<QueueBar[\s\S]{0,600}onDelete=\{/.test(detail),
    "★ QueueBar 必须接上 onDelete",
  );
  assert.ok(
    /void deleteQueueItem\(id\)/.test(detail),
    "★ onDelete 要真的调 deleteQueueItem",
  );
  assert.ok(/deletingId=\{deletingId\}/.test(detail), "★ deletingId 要传进队列条");
});

// ===========================================================================
// GC-P28-D4 · 端侧乐观行（local: 前缀）也能删
// ===========================================================================

test("GC-P28-D4 端侧乐观行（local: 前缀）删得掉（服务端还没认领 ⇒ 没有 id 可删）", () => {
  const detail = repoCode(DETAIL);
  const fn = detail.slice(
    detail.indexOf("const deleteQueueItem = useCallback"),
    detail.indexOf("const stopBackgroundWork = useCallback"),
  );
  assert.ok(
    /id\.startsWith\("local:"\)/.test(fn),
    "★ `local:` 开头的乐观行要单独处理（不能拿它去调服务端端点）",
  );
  assert.ok(
    /setLocalQueue\(\(prev\) => prev\.filter\(\(l\) => l\.id !== id\)\)/.test(fn),
    "★ 乐观行要从本地队列里收掉",
  );
  // 服务端行删成功后，本地那一份（乐观副本）也要收掉
  assert.ok(
    /setLocalQueue\(\(prev\) =>[\s\S]{0,400}filter\(/.test(fn),
    "★ 服务端行删成功后，本地乐观副本也要一起收掉",
  );
});

test("GC-P28-D4b ⛔ 删除不许把「已发出去的消息」也删掉", () => {
  const detail = repoCode(DETAIL);
  const fn = detail.slice(
    detail.indexOf("const deleteQueueItem = useCallback"),
    detail.indexOf("const stopBackgroundWork = useCallback"),
  );
  assert.ok(
    !/deleteMessage|removeMessage|撤回/.test(fn),
    "⛔ 删除只碰队列项（历史消息的删除走别的路）",
  );
});
