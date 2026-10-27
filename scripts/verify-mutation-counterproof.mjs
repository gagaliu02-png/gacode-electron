#!/usr/bin/env node
/**
 * verify-mutation-counterproof.mjs
 *
 * 变异反证 —— 「这些断言**真的**盯着那几行代码吗?」
 *
 * ---------------------------------------------------------------------------
 * 为什么必须有这一步 (PM 派活纪律第 7 条)
 * ---------------------------------------------------------------------------
 *   任务书里的断言大多打在**源码文本**上 (正则 / AST 取片段)。源码文本这东西
 *   很容易被「喂饱」:
 *     · 把被盯的逻辑挪进注释里 —— 断言照样绿;
 *     · 把函数改名 / 换位置 —— 断言照样绿;
 *     · 把判据从 `^\d+$` 放宽成 `^\d+` —— **断言还在, 但已经盯不住任何东西了**。
 *
 *   只有「**把那一行改坏 ⇒ 断言必须变红**」能证明这条断言是活的。
 *   本脚本对每条被盯的规则做一次**最小变异**, 跑配对的断言脚本, 断言它变红,
 *   然后**立刻还原**。
 *
 * ---------------------------------------------------------------------------
 * 与 web 定稿版 (`78b01cb:scripts/verify-mutation-counterproof.mjs`) 的差异
 * ---------------------------------------------------------------------------
 *   **只有被变异的文件与配对脚本不同** —— 跑法、还原协议、「变红」判据
 *   (退出码非 0 + FAIL>0 + 出现预期的那条 ❌)、锚点必须命中恰好一处的
 *   规则, 全部逐字相同。PC 的文件布局跟 web 不同 (web 是 Next.js app router +
 *   IndexedDB, PC 是 Electron + localStorage), 所以变异表是**重写的**。
 *
 * ---------------------------------------------------------------------------
 * 安全约定
 * ---------------------------------------------------------------------------
 *   · 每个变异都在 `finally` 里还原, 还原后**逐字节比对**;
 *   · 进程退出 (含 SIGINT / 异常) 时兜底还原一次 —— 不留脏工作区;
 *   · 变异必须**只命中一处** (脚本自己数次数) —— 否则判 FAIL, 不猜。
 *
 * 退出码: 0 = 全部变异都被抓到 / 1 = 有变异没被抓到 (或还原失败)。
 *
 * 用法: node scripts/verify-mutation-counterproof.mjs           (跑全部)
 *       node scripts/verify-mutation-counterproof.mjs M12      (只跑 M12 起的)
 */

import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const BACKUP = mkdtempSync(join(tmpdir(), "mut-proof-pc-"));

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

// ---------------------------------------------------------------------------
// 还原兜底 —— 任何退出路径都不能把变异留在工作区
// ---------------------------------------------------------------------------
const dirty = new Map(); // absPath -> 原始内容
const restoreAll = () => {
  for (const [f, orig] of dirty) {
    try {
      writeFileSync(f, orig);
    } catch {
      /* ignore */
    }
  }
  dirty.clear();
};
process.on("exit", () => {
  restoreAll();
  try {
    rmSync(BACKUP, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    restoreAll();
    process.exit(130);
  });
}

const countOf = (hay, needle) => {
  let n = 0;
  let i = -1;
  while ((i = hay.indexOf(needle, i + 1)) !== -1) n++;
  return n;
};

/**
 * 一条变异。
 *
 * @param id    变异编号 + 一句话说明
 * @param file  被改的文件 (相对仓库根)
 * @param from  原文本 (必须**只命中一处**)
 * @param to    变异后的文本
 * @param script 配对的断言脚本 (相对仓库根)
 * @param expect 变异后**必须**出现的 ❌ 文本 (对应那条断言的失败文案)
 */
const M = (id, file, from, to, script, expect) => ({
  id,
  file,
  from,
  to,
  script,
  expect,
});

const MUTATIONS = [
  // ⚠️ 锚点里的 `\n` 会按被改文件的换行风格转换 (仓里 CRLF / LF 混着)。
  // ===== chat-sse.ts —— 游标 / 续传头 ======================================
  M(
    "M01 游标判据从 /^\\d+$/ 放宽成 /^\\d+/",
    "src/lib/chat-sse.ts",
    'return typeof raw === "string" && /^\\d+$/.test(raw);',
    'return typeof raw === "string" && /^\\d+/.test(raw);',
    "scripts/verify-sse-cursor.mjs",
    "非法游标被放行"
  ),
  M(
    "M02 帧无 id 时把游标清空 (不得清空)",
    "src/lib/chat-sse.ts",
    "if (frameId === null || frameId === undefined) return current;",
    "if (frameId === null || frameId === undefined) return null;",
    "scripts/verify-sse-cursor.mjs",
    "游标被清空或回退了"
  ),
  M(
    "M03 帧带非法 id 时照样收下",
    "src/lib/chat-sse.ts",
    "if (!isValidEventCursor(frameId)) return current;",
    "if (!isValidEventCursor(frameId)) return frameId as string;",
    "scripts/verify-sse-cursor.mjs",
    "帧带非法 id 时游标被污染了"
  ),
  M(
    "M04 续传头恒发 Last-Event-ID (非法游标也发)",
    "src/lib/chat-sse.ts",
    "  if (isValidEventCursor(cursor)) {",
    "  if (true) {",
    "scripts/verify-sse-cursor.mjs",
    "续传头不对"
  ),
  M(
    "M05 读帧时丢掉 `id:` 行",
    "src/lib/chat-sse.ts",
    "handleFrame(frame.data, frame.id);",
    "handleFrame(frame.data, null);",
    "scripts/verify-sse-cursor.mjs",
    "行没被抓出来"
  ),

  // ===== sse.ts —— 接线 / attach / abort ===================================
  M(
    "M06 续传请求带上 body (服务端会当成建新轮次)",
    "src/lib/sse.ts",
    "body: opts.resume ? undefined : JSON.stringify(opts.body ?? {}),",
    'body: opts.resume ? JSON.stringify(opts.body ?? {}) : JSON.stringify(opts.body ?? {}),',
    "scripts/verify-sse-cursor.mjs",
    "续传 body 不是空的"
  ),
  M(
    "M07 sse.ts 不把游标透传给调用方",
    "src/lib/sse.ts",
    "onCursor: (cursor) => {\n          if (!cursor) return;\n          opts.onCursor?.(cursor);\n        },",
    "onCursor: (_cursor) => {\n          if (!_cursor) return;\n        },",
    "scripts/verify-sse-cursor.mjs",
    "没把游标透传给调用方"
  ),
  M(
    "M08 attach 流不带游标 (只发 X-Resume-Turn)",
    "src/lib/sse.ts",
    "Object.assign(headers, buildResumeHeaders(opts.cursor ?? null));",
    "Object.assign(headers, buildResumeHeaders(null));",
    "scripts/verify-attach-flow.mjs",
    "有游标时的续传头不对"
  ),
  M(
    "M09 attach 流带上 body (attach 不该建轮次)",
    "src/lib/sse.ts",
    "            body: undefined,",
    '            body: JSON.stringify({ resume: true }),',
    "scripts/verify-attach-flow.mjs",
    "attach 带了 body"
  ),
  M(
    "M10 attach 流不带端标识 X-Client-Id",
    "src/lib/sse.ts",
    "[CLIENT_ID_HEADER]: CLIENT_ID_PC,",
    '[CLIENT_ID_HEADER]: "pc-x",',
    "scripts/verify-attach-flow.mjs",
    "attach 没带 X-Client-Id"
  ),
  M(
    "M11 流状态退回函数级局部变量 (P-5 回归)",
    "src/lib/sse.ts",
    "const activeRef = useRef<ActiveStream | null>(null);",
    "const activeRef = { current: null as ActiveStream | null };",
    "scripts/verify-attach-flow.mjs",
    "重渲染之后按「停止」没能中止流"
  ),
  M(
    "M12 用户按停止不发 USER_STOP (服务端照样跑完)",
    "src/lib/sse.ts",
    'if (ac.signal.aborted && turnState.userStopped) {\n          sendCancelDelete(opts.sessionId, "USER_STOP");\n        } else if',
    'if (false && ac.signal.aborted && turnState.userStopped) {\n          sendCancelDelete(opts.sessionId, "USER_STOP");\n        } else if',
    "scripts/verify-attach-flow.mjs",
    "用户按停止没有发 USER_STOP"
  ),
  M(
    "M13 中止只读接入流时误发 USER_STOP (掐到服务端那一轮)",
    "src/lib/sse.ts",
    "      } finally {\n        // 释放只读槽位 —— 下一轮才能再接。\n        if (attachRef.current === active) attachRef.current = null;\n      }",
    '      } finally {\n        if (ac.signal.aborted) sendCancelDelete(opts.sessionId, "USER_STOP");\n        // 释放只读槽位 —— 下一轮才能再接。\n        if (attachRef.current === active) attachRef.current = null;\n      }',
    "scripts/verify-attach-flow.mjs",
    "掐到服务端那一轮了"
  ),

  // ===== api.ts —— 审批提交 / 历史 richEvents ==============================
  M(
    "M14 审批 body 里多带 pending_id (服务端不收)",
    "src/lib/api.ts",
    "body: JSON.stringify({ action }),\n      },\n    );\n  } catch (err) {\n    return {\n      ok: false,\n      status: 0,\n      code: \"NETWORK_ERROR\",",
    "body: JSON.stringify({ action, pending_id: pendingId }),\n      },\n    );\n  } catch (err) {\n    return {\n      ok: false,\n      status: 0,\n      code: \"NETWORK_ERROR\",",
    "scripts/verify-approval-chain.mjs",
    "审批 body 里带了 pending_id"
  ),
  M(
    "M15 409 响应体里的 decidedBy 不解析",
    "src/lib/api.ts",
    'body && typeof body.decidedBy === "string" ? body.decidedBy : null,',
    "null,",
    "scripts/verify-approval-chain.mjs",
    "409 的 decidedBy 没被解析出来"
  ),
  M(
    "M16 HTTP 状态码不带出来 (409 认不出)",
    "src/lib/api.ts",
    "    ok: res.ok,\n    status: res.status,",
    "    ok: res.ok,\n    status: 200,",
    "scripts/verify-approval-chain.mjs",
    "HTTP 状态码没被带出来"
  ),
  M(
    "M17 历史不产出 richEvents (刷新后卡片全丢)",
    "src/lib/api.ts",
    "richEvents: parsePhasesRichEvents(m.phases_json),",
    "richEvents: undefined,",
    "scripts/verify-rich-event-degrade.mjs",
    "getHistory 没挂 richEvents"
  ),

  // ===== chat-approval-decision.ts —— 409 分类 ============================
  M(
    "M18 409 归成 error (迟到的人被当成失败)",
    "src/lib/chat-approval-decision.ts",
    "if (outcome.status === 409) {",
    "if (outcome.status === 418) {",
    "scripts/verify-approval-chain.mjs",
    "409 的分类不对"
  ),
  M(
    "M19 端标识认不出时返回空串 (渲染成「已由处理」)",
    "src/lib/chat-approval-decision.ts",
    '      return "其他端";',
    '      return "";',
    "scripts/verify-approval-chain.mjs",
    "端标识映射不对"
  ),
  M(
    "M20 409 的提示语被清空",
    "src/lib/chat-approval-decision.ts",
    "message: `已由${label}处理`,",
    'message: "",',
    "scripts/verify-approval-chain.mjs",
    "409 的提示语不对"
  ),

  // ===== chat-pending-approvals.ts —— 精确删 / 幂等 =======================
  M(
    "M21 removePendingApproval 改成整表清",
    "src/lib/chat-pending-approvals.ts",
    "const next = list.filter((p) => p.pendingId !== pendingId);",
    "const next: ApprovalRequest[] = [];",
    "scripts/verify-approval-chain.mjs",
    "精确删不对"
  ),
  M(
    "M22 空 pendingId 也把整表清了",
    "src/lib/chat-pending-approvals.ts",
    "if (!pendingId) return list;",
    "if (!pendingId) return [];",
    "scripts/verify-approval-chain.mjs",
    "空 pendingId 把整表清了"
  ),
  M(
    "M23 去重改成保留后到的那条 (不幂等)",
    "src/lib/chat-pending-approvals.ts",
    "if (list.some((p) => p.pendingId === req.pendingId)) return list;",
    "if (list.some((p) => p.pendingId === req.pendingId)) return [...list, req];",
    "scripts/verify-approval-chain.mjs",
    "去重不对"
  ),

  // ===== rich-events.ts —— 归一 / 去重 ====================================
  M(
    "M24 去掉 L-2 的 3 个类型的跳过分支",
    "src/lib/rich-events.ts",
    "if (L2_UNKNOWN_TYPE_SET.has(type)) {",
    "if (false) {",
    "scripts/verify-rich-event-degrade.mjs",
    "这 3 个类型没被跳过"
  ),
  M(
    "M25 名单外类型的跳过原因被改掉 (L-11)",
    "src/lib/rich-events.ts",
    'if (!LIVE_TYPE_SET.has(type)) {\n    // L-11: 未知类型 —— 跳过该条 + 记诊断 (不抛错、不整帧归零)。\n    return { event: null, skipReason: "unknown_type", skipType: type };\n  }',
    'if (!LIVE_TYPE_SET.has(type)) {\n    // L-11: 未知类型 —— 跳过该条 + 记诊断 (不抛错、不整帧归零)。\n    return { event: null, skipReason: "malformed", skipType: type };\n  }',
    "scripts/verify-rich-event-degrade.mjs",
    "L-11 的处理不对"
  ),
  M(
    "M26 `category` 不再被丢弃 (L-12)",
    "src/lib/rich-events.ts",
    '  tool_start: ["id", "tool", "args"],',
    '  tool_start: ["id", "tool", "args", "category"],',
    "scripts/verify-rich-event-degrade.mjs",
    "category 没被丢"
  ),
  M(
    "M27 web_preview 混进事件族 (它不参与去重)",
    "src/lib/rich-events.ts",
    '  if (ev.type === "file") return "file";',
    '  if (ev.type === "web_preview") return "file";\n  if (ev.type === "file") return "file";',
    "scripts/verify-rich-event-degrade.mjs",
    "web_preview 被去重了"
  ),
  M(
    "M28 tool_done[code_diff] 混进事件族",
    "src/lib/rich-events.ts",
    '    if (ev.subtype === "file") return "file";',
    '    if (ev.subtype === "file" || ev.subtype === "code_diff") return "file";',
    "scripts/verify-rich-event-degrade.mjs",
    "族判据不对"
  ),
  M(
    "M29 不认 camel `pendingId` 别名",
    "src/lib/rich-events.ts",
    ': typeof camel === "string" && camel !== ""\n          ? camel\n          : null;',
    ": null;",
    "scripts/verify-approval-chain.mjs",
    "camel pendingId 没认出来"
  ),
  M(
    "M30 把 `id` (tool_use_id) 当成审批身份",
    "src/lib/rich-events.ts",
    ': typeof camel === "string" && camel !== ""\n          ? camel\n          : null;',
    ': typeof camel === "string" && camel !== ""\n          ? camel\n          : typeof obj.id === "string"\n            ? obj.id\n            : null;',
    "scripts/verify-approval-chain.mjs",
    "拿 id 当身份了"
  ),

  // ===== ChatDetail.tsx —— 进场 / 审批链 ===================================
  M(
    "M31 进场不问 stream-state",
    "src/routes/ChatDetail.tsx",
    "const state = await getStreamState(chatId);",
    "const state = null as any;",
    "scripts/verify-attach-flow.mjs",
    "进场没问 stream-state"
  ),
  M(
    "M32 接回不走 attach",
    "src/routes/ChatDetail.tsx",
    "await stream.attach({",
    "await Promise.resolve();",
    "scripts/verify-attach-flow.mjs",
    "接回没走 attach"
  ),
  M(
    "M33 离场把跟进记录一起删掉 (跳走再回来断档)",
    "src/routes/ChatDetail.tsx",
    "      ac.abort();\n    };",
    "      ac.abort();\n      void followController.stop(chatId);\n    };",
    "scripts/verify-attach-flow.mjs",
    "离场把跟进记录一起删了"
  ),
  M(
    "M34 进场不用 stream-state.pendingApprovals 校正审批缓存",
    "src/routes/ChatDetail.tsx",
    "for (const p of state.pendingApprovals) {",
    "for (const p of [] as typeof state.pendingApprovals) {",
    "scripts/verify-attach-flow.mjs",
    "进场没用 stream-state.pendingApprovals 校正审批缓存"
  ),
  M(
    "M35 attach_failed 不回落历史补拉",
    "src/routes/ChatDetail.tsx",
    'console.warn("[attach] 接不回来, 回落历史补拉:", frame.reason);\n            void followController.stop(chatId);\n            queryClient.invalidateQueries({ queryKey: ["history", chatId] });',
    'console.warn("[attach] 接不回来, 回落历史补拉:", frame.reason);',
    "scripts/verify-attach-flow.mjs",
    "attach_failed 没走静默回落"
  ),
  M(
    "M36 接回失败报错给用户",
    "src/routes/ChatDetail.tsx",
    'console.warn("[attach] 进场接回失败, 回落历史补拉:", err);',
    'console.warn("[attach] 进场接回失败, 回落历史补拉:", err);\n      setStreamError({ title: "接回失败", description: String(err) });',
    "scripts/verify-attach-flow.mjs",
    "接回失败会报错给用户"
  ),
  M(
    "M37 乐观收卡改整表清 (兄弟 pending 被一起清掉)",
    "src/routes/ChatDetail.tsx",
    "      removePendingApproval(pendingId);",
    "      removePendingApproval(pendingId);\n      setPendingApprovals([]);",
    "scripts/verify-approval-chain.mjs",
    "组件里还在整表清审批"
  ),
  M(
    "M38 409 分支改用 danger toast (迟到的人看到失败)",
    "src/routes/ChatDetail.tsx",
    "          message: verdict.message,\n          variant: \"default\",\n          duration: 3000,",
    "          message: verdict.message,\n          variant: \"danger\",\n          duration: 3000,",
    "scripts/verify-approval-chain.mjs",
    "409 分支用了 danger toast"
  ),
  M(
    "M39 提交身份兜底到 request.id (tool_use_id)",
    "src/routes/ChatDetail.tsx",
    "const pendingId = request.pendingId;",
    "const pendingId = request.pendingId || request.id;",
    "scripts/verify-approval-chain.mjs",
    "拿 req.id 兜底了"
  ),
  M(
    "M40 事件映射拿 ev.id 当身份",
    "src/routes/ChatDetail.tsx",
    "const pendingId = ev.pending_id;",
    "const pendingId = ev.pending_id || ev.id;",
    "scripts/verify-approval-chain.mjs",
    "事件映射拿 ev.id 当身份了"
  ),
  M(
    "M41 真失败时把卡放回去",
    "src/routes/ChatDetail.tsx",
    "      addPendingApproval(request);",
    "      void request;",
    "scripts/verify-approval-chain.mjs",
    "真失败时没把卡放回去"
  ),
  M(
    "M42 精确删之后不落盘 (刷新后状态不一致)",
    "src/routes/ChatDetail.tsx",
    "const next = dropPendingApproval(prev, pendingId);\n        if (next === prev) return prev;\n        savePendingApprovals(chatId, next);",
    "const next = dropPendingApproval(prev, pendingId);\n        if (next === prev) return prev;",
    "scripts/verify-approval-chain.mjs",
    "精确删之后没落盘"
  ),
  M(
    "M43 新增待审批不落盘 (刷新后待审批全丢)",
    "src/routes/ChatDetail.tsx",
    "const next = appendPendingApproval(prev, req);\n        if (next === prev) return prev;\n        savePendingApprovals(chatId, next);",
    "const next = appendPendingApproval(prev, req);\n        if (next === prev) return prev;",
    "scripts/verify-approval-chain.mjs",
    "新增待审批没落盘"
  ),

  // ===== RichEventBubble.tsx —— 降级渲染 ==================================
  M(
    "M44 「无公开链接」文案被清空",
    "src/components/chat/RichEventBubble.tsx",
    'export const NO_PUBLIC_LINK = "无公开链接";',
    'export const NO_PUBLIC_LINK = "";',
    "scripts/verify-rich-event-degrade.mjs",
    "L-10 的 NO_PUBLIC_LINK 常量不见了"
  ),
  M(
    "M45 tool_done[code_diff] 的渲染分支被改掉",
    "src/components/chat/RichEventBubble.tsx",
    '    case "code_diff":',
    '    case "code_diff_x":',
    "scripts/verify-rich-event-degrade.mjs",
    "缺 subtype 分支"
  ),
  M(
    "M46 给只建模的 think 加了渲染分支 (L-2)",
    "src/components/chat/RichEventBubble.tsx",
    "    default:\n      // 死类型占位 / 归一层漏过来的未知 type ⇒ 显示 type + JSON 字面, 不抛错",
    '    case "think":\n      return null;\n    default:\n      // 死类型占位 / 归一层漏过来的未知 type ⇒ 显示 type + JSON 字面, 不抛错',
    "scripts/verify-rich-event-degrade.mjs",
    "只建模的 3 个类型被渲染了"
  ),
  M(
    "M47 tool_done[image] 卡片没 url 时整条消失 (L-10)",
    "src/components/chat/RichEventBubble.tsx",
    "  if (!url) {\n    // L-10 — 无 url ⇒ 占位块, ⛔ 不得裂图",
    "  if (!url) return null;\n  if (false) {\n    // L-10 — 无 url ⇒ 占位块, ⛔ 不得裂图",
    "scripts/verify-rich-event-degrade.mjs",
    "tool_done image 卡片还会在没 url 时整条消失"
  ),
  M(
    "M48 卡片留了 `href=\"#\"` 死链接 (L-10)",
    "src/components/chat/RichEventBubble.tsx",
    '          href={url}\n          target="_blank"\n          rel="noopener noreferrer"\n          className="ml-auto text-fg-muted hover:text-fg inline-flex items-center gap-1"',
    '          href="#"\n          target="_blank"\n          rel="noopener noreferrer"\n          className="ml-auto text-fg-muted hover:text-fg inline-flex items-center gap-1"',
    "scripts/verify-rich-event-degrade.mjs",
    "死链接"
  ),
  M(
    "M49 image 卡片没 url 时整条消失 (L-10)",
    "src/components/chat/RichEventBubble.tsx",
    '  const caption = event.alt ?? event.prompt ?? "图片";\n  if (!url) {\n    return (',
    '  const caption = event.alt ?? event.prompt ?? "图片";\n  if (!url) {\n    return null;\n  }\n  if (false) {\n    return (',
    "scripts/verify-rich-event-degrade.mjs",
    "image 卡片还会在没 url 时整条消失"
  ),
  M(
    "M50 file 卡片没 url 时整条消失 (L-10)",
    "src/components/chat/RichEventBubble.tsx",
    '  if (!url) {\n    return (\n      <div className="my-1 inline-flex items-center gap-2 rounded-md bg-bg-sunken/60 px-3 py-2">\n        {inner}',
    '  if (!url) {\n    return null;\n  }\n  if (false) {\n    return (\n      <div className="my-1 inline-flex items-center gap-2 rounded-md bg-bg-sunken/60 px-3 py-2">\n        {inner}',
    "scripts/verify-rich-event-degrade.mjs",
    "file 卡片还会在没 url 时整条消失"
  ),
  M(
    "M51 web_preview 卡片没 url 时整条消失 (L-10)",
    "src/components/chat/RichEventBubble.tsx",
    '  if (!url) {\n    return (\n      <div className="my-1 block rounded-md bg-bg-sunken/60 px-3 py-2">\n        {body}',
    '  if (!url) {\n    return null;\n  }\n  if (false) {\n    return (\n      <div className="my-1 block rounded-md bg-bg-sunken/60 px-3 py-2">\n        {body}',
    "scripts/verify-rich-event-degrade.mjs",
    "web_preview 卡片还会在没 url 时整条消失"
  ),
];

// ---------------------------------------------------------------------------
// 前置检查: 配对的断言脚本必须在
// ---------------------------------------------------------------------------
{
  const missing = [
    ...new Set([
      ...MUTATIONS.map((m) => m.script),
      "scripts/verify-sse-cursor.mjs",
      "scripts/verify-attach-flow.mjs",
      "scripts/verify-approval-chain.mjs",
      "scripts/verify-rich-event-degrade.mjs",
    ]),
  ].filter((s) => {
    try {
      readFileSync(join(ROOT, s), "utf8");
      return false;
    } catch {
      return true;
    }
  });
  if (missing.length) {
    console.log(`❌ 仓库根不对 (找不到 ${missing.join(", ")}) —— 请在仓库根跑。`);
    process.exit(1);
  }
}

// ===========================================================================
// 逐条变异
// ===========================================================================
const ONLY = process.argv[2] || "";
const RUNS = ONLY ? MUTATIONS.filter((m) => m.id.startsWith(ONLY)) : MUTATIONS;
if (ONLY && RUNS.length === 0) {
  console.log(`❌ 没有编号以「${ONLY}」开头的变异`);
  process.exit(1);
}
log(`变异反证 (PC) —— ${RUNS.length} 条${ONLY ? ` (只跑 ${ONLY})` : ""}`);
log("");

const notRestored = [];

for (const mu of RUNS) {
  const abs = join(ROOT, mu.file);
  let original;
  try {
    original = readFileSync(abs, "utf8");
  } catch (err) {
    miss(`${mu.id} —— 读不到 ${mu.file}: ${err.message}`);
    continue;
  }

  // 锚点的换行风格跟着被改文件走 (仓里 CRLF / LF 混着)。
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const from = mu.from.replace(/\n/g, eol);
  const to = mu.to.replace(/\n/g, eol);
  const hits = countOf(original, from);
  if (hits !== 1) {
    miss(`${mu.id} —— 锚点在 ${mu.file} 命中 ${hits} 处 (必须恰好 1 处)`);
    continue;
  }

  let out = "";
  let status = 0;
  let crashed = false;
  try {
    dirty.set(abs, original);
    writeFileSync(abs, original.replace(from, to));
    const r = spawnSync(process.execPath, [mu.script], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 180000,
    });
    status = r.status === null ? -1 : r.status;
    out = `${r.stdout || ""}${r.stderr || ""}`;
  } catch (err) {
    crashed = true;
    out = String(err && err.message ? err.message : err);
  } finally {
    dirty.delete(abs);
    writeFileSync(abs, original);
  }

  // 还原必须逐字节一致 —— 否则工作区被污染了, 直接算硬失败。
  const restored = readFileSync(abs, "utf8") === original;
  if (!restored) {
    notRestored.push(mu.file);
    miss(`${mu.id} —— ★还原失败★ ${mu.file} 已被改坏, 请手工恢复`);
    continue;
  }

  // 变红 = 退出码非 0 **且** 汇总行里 FAIL>0 **且** 出现预期的那条 ❌。
  const failMatch = out.match(/FAIL=(\d+)/);
  const failCount = failMatch ? Number(failMatch[1]) : 0;
  const turnedRed = status !== 0 && failCount > 0 && out.includes(mu.expect);
  const redLines = out
    .split(/\r?\n/)
    .filter((l) => l.includes("❌"))
    .map((l) => l.trim());

  if (turnedRed) {
    pass(`${mu.id} ⇒ 变红 (${mu.script}, FAIL=${failCount})`);
  } else if (crashed) {
    miss(`${mu.id} ⇒ 变异把断言脚本打崩了 (不是断言变红): ${out.slice(0, 200)}`);
  } else if (failCount === 0) {
    miss(
      `${mu.id} ⇒ ★没变红★ (${mu.script} 退出码 ${status}, FAIL=0) —— 这条断言没盯住`
    );
  } else {
    miss(
      `${mu.id} ⇒ 变红了, 但不是预期的那条 (期望出现「${mu.expect}」) —— 实际红的是:\n      ${redLines.join("\n      ") || "(没抓到 ❌ 行)"}`
    );
  }
}

log("");
log("=== 汇总 ===");
if (notRestored.length) {
  console.log(`❌ 有 ${notRestored.length} 个文件没还原干净: ${notRestored.join(", ")}`);
}
if (fail === 0) {
  console.log(`✅ ${RUNS.length} 条变异全部被抓到 (每条断言都盯得住它该盯的行)`);
  console.log(`===PASS=${passCount} FAIL=${fail}===`);
} else {
  console.log(`❌ 有 ${fail} 条变异没被抓到 —— 对应断言是「假绿」`);
  console.log(`===PASS=${passCount} FAIL=${fail}===`);
}
log(`===EXIT=${fail === 0 ? 0 : 1}===`);
process.exit(fail === 0 ? 0 : 1);
