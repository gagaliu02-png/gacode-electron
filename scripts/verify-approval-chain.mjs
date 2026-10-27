#!/usr/bin/env node
/**
 * verify-approval-chain.mjs
 *
 * 任务书 04 · P-6 / P-10 / P-11 / P-12 / P-14 (契约 §7 L-21 / L-22 / L-26 ~ L-32)
 *
 *   · **P-6  待审批要持久化** —— 活过页面刷新 (PC 端零持久化 ⇒ 落 localStorage)。
 *   · **P-10 提交字段** —— ⛔ 两个端点都不收 snake `pending_id` (它在 URL 路径上),
 *     旧端点额外要求 `toolId` 必填 ⇒ 提交用**新端点 body `{action}`**;
 *     ⛔ body 里不许再带 `pending_id`。
 *   · **P-11 审批身份** —— 事件里的 `id` 是 **tool_use_id**, 不是 pending id
 *     ⇒ 身份**只**认 `pending_id` (⛔ 绝不拿 `id` 兜底)。
 *   · **P-12 清审批要精确** —— 批掉一条**只删那一条**, 兄弟 pending 必须并存
 *     (契约 L-32a / L-32b)。
 *   · **P-14 409 后到者不报错** —— 收到 409 ⇒ **收卡不报错**, 并把该 pending
 *     从本机列表去掉 (契约 L-26 ~ L-30)。
 *
 * 断言方式:
 *   - **运行时**: 待审批持久化 / 精确删 / 裁决分类 / 审批事件归一 —— 全部喂真数据。
 *   - **结构性**: 提交端点与 body、组件里的乐观收卡与 409 分支。
 *
 * 退出码: 0 = 通过 / 1 = 有断言失败。
 *
 * 用法: node scripts/verify-approval-chain.mjs  (必须在仓库根跑)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeTmpDir, writeModule } from "./lib/schedule-loader.mjs";
import { stripComments } from "./lib/strip-comments.mjs";
import { extractFunction, extractIfBranch } from "./lib/source-scan.mjs";

let fail = 0;
let passCount = 0;
const pass = (m) => {
  passCount++;
  console.log(`  ✅ ${m}`);
};
const miss = (m) => {
  fail++;
  console.log(`  ❌ ${m}`);
};
const log = (...a) => console.log(...a);
const repoSrc = (p) => readFileSync(join(process.cwd(), p), "utf8");
const repoCode = (p) => stripComments(repoSrc(p), p);

// ---------------------------------------------------------------------------
// localStorage 桩 —— PC 端零持久化, 待审批列表只能落 localStorage。
//   装一个内存版 Storage, 让「落盘 / 读回 / 刷新后 hydrate」都能在 node 里验。
// ---------------------------------------------------------------------------
const mem = new Map();
const fakeStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => {
    mem.set(k, String(v));
  },
  removeItem: (k) => {
    mem.delete(k);
  },
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() {
    return mem.size;
  },
};
Object.defineProperty(globalThis, "localStorage", {
  value: fakeStorage,
  configurable: true,
  writable: true,
});

const dir = makeTmpDir("verify-approval-chain");
const pendingUrl = writeModule(dir, "chat-pending-approvals", repoSrc("src/lib/chat-pending-approvals.ts"));
const decisionUrl = writeModule(dir, "chat-approval-decision", repoSrc("src/lib/chat-approval-decision.ts"));
writeModule(dir, "rich-events", repoSrc("src/lib/rich-events.ts"));
const P = await import(pendingUrl);
const D = await import(decisionUrl);
const R = await import(await writeModule(dir, "rich-events", repoSrc("src/lib/rich-events.ts")));

const mkReq = (pendingId, tool = "bash") => ({
  id: pendingId,
  pendingId,
  tool,
  title: `调用 ${tool}`,
  detail: "要执行一条命令",
  riskLevel: "medium",
});

// ===========================================================================
// A. 待审批持久化 (P-6)
// ===========================================================================

log("A. 待审批持久化 (P-6)");

P.PENDING_APPROVALS_STORAGE_KEY === "gacode.chat.pending-approvals.v1"
  ? pass("待审批有独立的 localStorage key (不跟别的数据混)")
  : miss(`待审批的 storage key 不对: ${P.PENDING_APPROVALS_STORAGE_KEY}`);

{
  const list = [mkReq("p_1"), mkReq("p_2", "read")];
  P.savePendingApprovals("sess-A", list);
  const back = P.loadPendingApprovals("sess-A");
  back.length === 2 && back[0].pendingId === "p_1" && back[1].pendingId === "p_2"
    ? pass("★ 待审批落盘后能读回来 (P-6)")
    : miss(`落盘后读不回来: ${JSON.stringify(back)}`);
}

{
  // 「刷新页面」= 模块重新加载 (新的模块实例) —— 列表必须还在。
  const url2 = `${pendingUrl}?reload=1`;
  const P2 = await import(url2);
  const back = P2.loadPendingApprovals("sess-A");
  back.length === 2
    ? pass("★ 页面刷新后待审批能 hydrate 回来 (模块重载仍读得到)")
    : miss(`刷新后待审批丢了: ${JSON.stringify(back)}`);
}

{
  // 不同会话的列表必须隔离。
  P.savePendingApprovals("sess-B", [mkReq("p_9")]);
  const a = P.loadPendingApprovals("sess-A");
  const b = P.loadPendingApprovals("sess-B");
  a.length === 2 && b.length === 1 && b[0].pendingId === "p_9"
    ? pass("待审批按会话分键 (互不串台)")
    : miss(`待审批没按会话隔离: A=${a.length} B=${b.length}`);
}

{
  // 落盘**不许**带正文/附件/token —— 只留身份 + 展示字段。
  const raw = fakeStorage.getItem(P.PENDING_APPROVALS_STORAGE_KEY) || "";
  !/message|token|attachment/i.test(raw)
    ? pass("落盘内容只有审批身份 + 展示字段 (不带正文/附件/token)")
    : miss(`落盘内容带不该带的字段: ${raw.slice(0, 200)}`);
}

// ===========================================================================
// B. 精确删 (P-12) —— 批掉一条只删那一条
// ===========================================================================

log("B. 精确删 (P-12)");

{
  const list = [mkReq("p_1"), mkReq("p_2"), mkReq("p_3")];
  const next = P.removePendingApproval(list, "p_2");
  next.length === 2 && next[0].pendingId === "p_1" && next[1].pendingId === "p_3"
    ? pass("★ 批掉一条只删那一条, 兄弟 pending 并存 (契约 L-32a / L-32b)")
    : miss(`精确删不对: ${JSON.stringify(next.map((r) => r.pendingId))}`);

  const cleared = P.removePendingApproval(list, "");
  cleared.length === 3
    ? pass("空 pendingId 不删任何东西 (不整表清)")
    : miss("空 pendingId 把整表清了");
}

{
  const list = [mkReq("p_1"), mkReq("p_2")];
  const next = P.addPendingApproval(list, mkReq("p_1", "other"));
  next.length === 2 && next[0].tool === "bash"
    ? pass("同一个 pending_id 重复到达 ⇒ 只留先到的那条 (幂等)")
    : miss(`去重不对: ${JSON.stringify(next)}`);
}

{
  const list = [mkReq("p_1"), mkReq("p_2")];
  const next = P.addPendingApproval(list, mkReq("p_3"));
  next.length === 3
    ? pass("新 pending 能加进来")
    : miss("加不进新 pending");
}

// ===========================================================================
// C. 裁决结果分类 (P-14) —— 409 是 conflict, 不是 error
// ===========================================================================

log("C. 裁决结果分类 (P-14)");

{
  const ok = D.classifyApprovalDecision({ ok: true, status: 200, decidedBy: null });
  ok.kind === "ok"
    ? pass("2xx ⇒ ok")
    : miss(`2xx 的分类不对: ${ok.kind}`);
}

{
  const conflict = D.classifyApprovalDecision({
    ok: false,
    status: 409,
    decidedBy: "web",
  });
  conflict.kind === "conflict"
    ? pass("★ 409 ⇒ conflict (**不是** error) —— 迟到的人不算错 (契约 L-27 / L-29)")
    : miss(`409 的分类不对: ${conflict.kind}`);

  conflict.decidedBy === "web" && conflict.decidedByLabel === "网页端"
    ? pass("★ 409 带出先到者是谁 (decidedBy / 中文端名)")
    : miss(`409 没带出先到者: ${JSON.stringify(conflict)}`);

  conflict.message === "已由网页端处理"
    ? pass("409 的提示语是「已由网页端处理」 (不是错误文案)")
    : miss(`409 的提示语不对: ${conflict.message}`);
}

{
  const err = D.classifyApprovalDecision({ ok: false, status: 500, decidedBy: null });
  err.kind === "error"
    ? pass("5xx ⇒ error (卡要放回去, 用户还能再点)")
    : miss(`5xx 的分类不对: ${err.kind}`);
}

{
  const net = D.classifyApprovalDecision({ ok: false, status: 0, decidedBy: null });
  net.kind === "error"
    ? pass("网络错误 (status 0) ⇒ error")
    : miss(`网络错误的分类不对: ${net.kind}`);
}

{
  const labels = [
    ["web", "网页端"],
    ["pc", "PC 端"],
    ["android", "安卓端"],
    ["WEB", "网页端"],
  ];
  let ok = true;
  for (const [inVal, want] of labels) {
    if (D.decidedByLabel(inVal) !== want) ok = false;
  }
  ok && D.decidedByLabel("weird") === "其他端" && D.decidedByLabel(null) === "其他端"
    ? pass("端标识 → 中文端名映射正确 (认不出的一律「其他端」)")
    : miss("端标识映射不对");
}

// ===========================================================================
// D. 审批事件的身份 (P-11) —— ⛔ 绝不拿 id (tool_use_id) 兜底
// ===========================================================================

log("D. 审批事件的身份 (P-11)");

{
  const r = R.normalizeRichEvent({
    type: "approval_request",
    id: "tool_use_1",
    pending_id: "p_1",
    tool: "bash",
  });
  r.event && r.event.pending_id === "p_1"
    ? pass("★ snake `pending_id` 认得出来 (契约 L-21)")
    : miss(`snake pending_id 没认出来: ${JSON.stringify(r)}`);
}

{
  const r = R.normalizeRichEvent({
    type: "approval_request",
    id: "tool_use_1",
    pendingId: "p_2",
  });
  r.event && r.event.pending_id === "p_2"
    ? pass("camel `pendingId` 别名也认 (兼容别的产出点)")
    : miss(`camel pendingId 没认出来: ${JSON.stringify(r)}`);
}

{
  const r = R.normalizeRichEvent({
    type: "approval_request",
    id: "tool_use_1",
    tool: "bash",
  });
  r.event && r.event.pending_id === null
    ? pass("★ 没有 pending_id 时就是 null —— ⛔ 绝不拿 id (tool_use_id) 兜底 (P-11)")
    : miss(`拿 id 当身份了: ${JSON.stringify(r)}`);
}

{
  const r = R.normalizeRichEvent({
    type: "approval_granted",
    id: "tool_use_1",
    pending_id: "p_1",
  });
  r.event && r.event.pending_id === "p_1"
    ? pass("approval_granted 同样带 pending_id (批完能精确删那条)")
    : miss(`approval_granted 的 pending_id 不对: ${JSON.stringify(r)}`);
}

// ===========================================================================
// E. 提交端点与 body (P-10)
// ===========================================================================

log("E. 提交端点与 body (P-10)");

const apiCode = repoCode("src/lib/api.ts");
const submitFn = extractFunction(apiCode, "submitApprovalDecisionOutcome", "src/lib/api.ts");

submitFn && /\/approvals\/\$\{pendingId\}\/decision/.test(submitFn)
  ? pass("★ 走新端点 POST /sessions/:id/approvals/:pendingId/decision")
  : miss("提交端点不对 (应带 pendingId 的路径段)");

submitFn && /method:\s*"POST"/.test(submitFn)
  ? pass("提交用 POST")
  : miss("提交方法不对");

submitFn && /body:\s*JSON\.stringify\(\{\s*action\s*\}\)/.test(submitFn)
  ? pass("★ 提交体只有 `{action}` (契约 L-22)")
  : miss("提交体不是只有 {action}");

submitFn && !/pending_id/.test(submitFn)
  ? pass("★ 提交体里**没有** pending_id (⛔ 两个端点都不收它)")
  : miss("审批 body 里带了 pending_id");

submitFn && /"Content-Type":\s*"application\/json"/.test(submitFn)
  ? pass("提交带 Content-Type: application/json")
  : miss("提交没带 Content-Type");

// ⚠️ 判据收紧 (变异反证 M15 打回来的): 之前查的是「函数里出现过 decidedBy 这个词」——
//   而返回对象里的 `decidedBy:` **键名**就满足它了 ⇒ 把解析逻辑整个删掉也照样绿。
//   改成查「decidedBy 的值**来自响应体**」: 必须有 `body.decidedBy` 的类型收窄。
submitFn && /body\s*&&\s*typeof\s+body\.decidedBy\s*===\s*"string"/.test(submitFn)
  ? pass("★ 409 响应体里的 decidedBy 被解析出来 (契约 L-29)")
  : miss("409 的 decidedBy 没被解析出来");

submitFn && /status:\s*res\.status/.test(submitFn)
  ? pass("★ HTTP 状态码被带出来 (409 才认得出)")
  : miss("HTTP 状态码没被带出来");

// ===========================================================================
// F. 组件里的乐观收卡 / 409 分支 (P-12 / P-14)
// ===========================================================================

log("F. 组件里的乐观收卡 / 409 分支 (P-12 / P-14)");

const chatDetailCode = repoCode("src/routes/ChatDetail.tsx");

{
  const fn = extractFunction(chatDetailCode, "handleApprovalAction", "src/routes/ChatDetail.tsx");
  fn && /removePendingApproval\(\s*pendingId\s*\)/.test(fn)
    ? pass("★ 乐观收卡按 pending_id 精确删 (P-12)")
    : miss("乐观收卡不是按 pending_id 精确删");

  fn && !/clearPendingApprovals|setPendingApprovals\(\[\]\)/.test(fn)
    ? pass("★ 没有任何整表清的动作 (契约 L-32a)")
    : miss("组件里还在整表清审批");

  fn && /classifyApprovalDecision\(/.test(fn)
    ? pass("★ 409 的判定走共享的 classifyApprovalDecision (纯函数, 可断言)")
    : miss("409 的判定没走 classifyApprovalDecision");

  fn && /verdict\.kind\s*===\s*"conflict"/.test(fn)
    ? pass("★ 409 分支单独处理 (收卡不报错)")
    : miss("409 分支没单独处理");

  // ⚠️ PM 复核 (2026-10-28) 修掉的**断言脆点** —— 原来这里切的是**固定 400 字符窗口**:
  //   `fn.slice(idx, idx + 400)` 从 `verdict.kind === "conflict"` 起数 400 字符。
  //   而**真失败分支**(网络 / 5xx)的 `variant: "danger"` 就在第 381 位 ⇒ 落在窗口内
  //   ⇒ 断言恒红, 但**盯的不是 409 分支** —— 属于「因为错误原因变红」的假绿。
  //   (web 定稿版 78b01cb 早就用 AST 切了, PC 这条漏抄 —— 窗口大小还是拍的。)
  // 现在用 AST 取**这一个 if 分支的真实文本**, 与行尾 (LF / CRLF) 无关。
  const conflictBranch = extractIfBranch(
    fn || "",
    'verdict.kind === "conflict"',
    "src/routes/ChatDetail.tsx",
  );
  conflictBranch &&
  !/variant:\s*"danger"/.test(conflictBranch)
    ? pass("★ 409 分支不用 danger toast (不报错给用户)")
    : miss("409 分支用了 danger toast");

  fn && /addPendingApproval\(\s*request\s*\)/.test(fn)
    ? pass("真失败时把卡放回去 (用户还能再点)")
    : miss("真失败时没把卡放回去");
}

{
  // 身份只认 pending_id —— ⛔ 不许拿 req.id 兜底。
  const fn = extractFunction(chatDetailCode, "handleApprovalAction", "src/routes/ChatDetail.tsx");
  fn && /const pendingId = request\.pendingId/.test(fn)
    ? pass("★ 提交身份只取 request.pendingId (P-11)")
    : miss("提交身份不是只取 pendingId");

  fn && !/request\.pendingId\s*\|\|\s*request\.id/.test(fn)
    ? pass("★ 没有拿 req.id 兜底 (req.id 是 tool_use_id)")
    : miss("拿 req.id 兜底了");
}

{
  const fn = extractFunction(chatDetailCode, "toApprovalRequest", "src/routes/ChatDetail.tsx");
  fn && /ev\.pending_id/.test(fn)
    ? pass("★ 事件 → 本地待审批的映射只认 pending_id")
    : miss("事件映射没认 pending_id");

  fn && !/ev\.id\b/.test(fn)
    ? pass("★ 事件映射没有拿 ev.id 当身份")
    : miss("事件映射拿 ev.id 当身份了");
}

{
  const fn = extractFunction(chatDetailCode, "removePendingApproval", "src/routes/ChatDetail.tsx");
  fn && /dropPendingApproval\(/.test(fn) && /savePendingApprovals\(/.test(fn)
    ? pass("★ 精确删之后立刻落盘 (刷新后状态一致)")
    : miss("精确删之后没落盘");
}

{
  const fn = extractFunction(chatDetailCode, "addPendingApproval", "src/routes/ChatDetail.tsx");
  fn && /appendPendingApproval\(/.test(fn) && /savePendingApprovals\(/.test(fn)
    ? pass("★ 新增待审批立刻落盘 (P-6)")
    : miss("新增待审批没落盘");
}

log("");
log("=== 汇总 ===");
if (fail === 0) {
  console.log("✅ 审批链路验收全过 (持久化 + 精确删 + 身份只认 pending_id + 新端点 {action} + 409 收卡不报错)");
  console.log(`===PASS=${passCount} FAIL=${fail}===`);
} else {
  console.log(`❌ 有 ${fail} 条断言失败`);
  console.log(`===PASS=${passCount} FAIL=${fail}===`);
}
log(`===EXIT=${fail === 0 ? 0 : 1}===`);
process.exit(fail === 0 ? 0 : 1);
