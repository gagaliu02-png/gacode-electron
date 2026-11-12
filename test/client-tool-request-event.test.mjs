// [2026-11-12 · P1] `client_tool_request` (端侧执行派单) 事件的端侧契约 —— PC 侧
//
// 背景 (契约附录 **订正 24** · 第 22 个活类型):
//   gaclaw 判定模型要调 `pc_*` 工具时, 下发一条 `client_tool_request` 富事件
//   ⇒ 走既有的 `events[]` 帧 ⇒ 统一 API 把它扇出到**设备通道** (订正 25)
//   ⇒ 由**用户自己的电脑**执行, 结果按 `pending_id` 回传 (D3)。
//
//   本文件守 PC 侧的归一层 + 渲染层:
//     · GC-P1-1  `client_tool_request` 是**活**类型 ⇒ 归一层不许当未知事件跳过
//     · GC-P1-3  一批里夹一条 ⇒ 同批其余事件**照常**归一 (老端降级安全)
//     · L-24a    裁决身份 = `pending_id`, **绝不**回退到 `id`
//     · GC-P1-1  渲染层必须有 `client_tool_request` 分支 (事件到了要看得见)
//     · 三端同款  PC 与 web 的 `src/lib/rich-events.ts` md5 逐字节相同
//
//   ⚠️ P1 阶段 PC 端**只渲染、不执行** —— 执行器 / 闸门在 P3 / P4。
//
//   运行: npm test   (纯函数, 不连网、不渲染 React)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "../scripts/lib/strip-comments.mjs";

import {
  LIVE_RICH_EVENT_TYPES,
  normalizeRichEvent,
  normalizeRichEvents,
  richEventFamily,
  dedupeRichEvents,
  describeClientToolArgs,
  describeClientToolRequest,
} from "../src/lib/rich-events.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");
const md5 = (p) => createHash("md5").update(readFileSync(p)).digest("hex");

// 对端仓 (web) —— 临时 worktree 里用 RC_PEER_REPO 指定 (跟 GC-G3-12 同一套路)
const PEER_REPO = process.env.RC_PEER_REPO
  ? process.env.RC_PEER_REPO
  : join(REPO, "..", "gacode-web");

// ===========================================================================
// GC-P1-1 · 归一层
// ===========================================================================

test("GC-P1-1 client_tool_request 在**活**类型名单里 (第 22 个)", () => {
  assert.equal(LIVE_RICH_EVENT_TYPES.length, 22, "活类型名单必须是 22 个");
  assert.ok(
    LIVE_RICH_EVENT_TYPES.includes("client_tool_request"),
    "活类型名单少了 client_tool_request",
  );
});

test("GC-P1-1 client_tool_request 能被归一成事件 (不许当未知事件跳过)", () => {
  const r = normalizeRichEvent({
    type: "client_tool_request",
    id: "tool_use_1",
    pending_id: "pend-1",
    tool: "pc_shell",
    args: { command: "echo hi" },
    cwd: "C:/work",
    timeout_ms: 600000,
    risk_level: "high",
    title: "在真终端里执行命令",
    device_id: "dev-1",
    origin_client: "pc",
    session_id: "s1",
  });
  assert.ok(r.event, "client_tool_request 必须被归一成事件");
  assert.equal(r.event.type, "client_tool_request");
  assert.equal(r.event.pending_id, "pend-1");
  assert.equal(r.event.tool, "pc_shell");
  assert.equal(r.event.cwd, "C:/work");
  assert.equal(r.event.timeout_ms, 600000);
  assert.equal(r.event.risk_level, "high");
});

test("L-24a 裁决身份 = `pending_id`, 绝不回退到 `id`", () => {
  const r = normalizeRichEvent({ type: "client_tool_request", id: "tool_use_abc" });
  assert.equal(
    r.event.pending_id,
    null,
    "只有 id 没有 pending_id ⇒ 身份为 null (id 是 tool_use_id, 拿它回传会寻址不到)",
  );
});

test("L-8 缺键 ≡ null (不许 undefined)", () => {
  const r = normalizeRichEvent({ type: "client_tool_request" });
  for (const k of ["id", "pending_id", "tool", "args", "cwd", "timeout_ms", "risk_level", "title"]) {
    assert.ok(k in r.event, `${k} 键必须在 (读取方按 'k' in ev 判定)`);
    assert.equal(r.event[k], null, `${k} 缺键必须归一成 null`);
  }
});

// ===========================================================================
// GC-P1-3 · 老端降级安全
// ===========================================================================

test("GC-P1-3 一批里夹一条 client_tool_request ⇒ 其余事件**照常**归一", () => {
  const r = normalizeRichEvents([
    { type: "file", id: "1", name: "a" },
    { type: "client_tool_request", pending_id: "p", tool: "pc_shell" },
    { type: "image", id: "2", url: "u" },
  ]);
  assert.equal(r.events.length, 3, "端侧派单不许牵连同批的其余事件");
  assert.deepEqual(
    r.events.map((e) => e.type),
    ["file", "client_tool_request", "image"],
  );
  assert.equal(r.skipped.length, 0);
});

test("端侧派单**不是**交付物 ⇒ 不入 file/image 族 (去重不得吃掉它)", () => {
  const ev = normalizeRichEvent({
    type: "client_tool_request",
    id: "t1",
    pending_id: "p",
  }).event;
  assert.equal(richEventFamily(ev), null);
  const out = dedupeRichEvents([
    { type: "client_tool_request", id: "t1", pending_id: "p" },
    { type: "file", id: "t1" },
  ]);
  assert.equal(out.length, 2, "端侧派单跟 file 同 id 也不该被去重吃掉");
});

// ===========================================================================
// 渲染层
// ===========================================================================

test("GC-P1-1 PC 的渲染层必须有 client_tool_request 分支", () => {
  const code = stripComments(
    repoSrc("src/components/chat/RichEventBubble.tsx"),
    "src/components/chat/RichEventBubble.tsx",
  );
  assert.ok(
    code.includes('case "client_tool_request"'),
    "RichEventBubble 的 switch 必须有 client_tool_request 分支",
  );
});

// ===========================================================================
// 文案 (三端同款)
// ===========================================================================

test("参数摘要只取**关键参数**, 不倒整坨 args", () => {
  const s = describeClientToolArgs({
    tool: "pc_shell",
    args: { command: "npm run build", secret: "x".repeat(5000) },
  });
  assert.equal(s, "npm run build");
  assert.ok(s.length < 200, "摘要不许把整个 args 倒出来");

  const file = describeClientToolArgs({
    tool: "pc_write_file",
    args: { path: "C:/a.txt", content: "y".repeat(5000) },
  });
  assert.equal(file, "C:/a.txt");
});

test("一行标题 = title · 参数摘要 (缺参数就只留 title)", () => {
  assert.equal(
    describeClientToolRequest({
      tool: "pc_shell",
      title: "在真终端里执行命令",
      args: { command: "ls" },
    }),
    "在真终端里执行命令 · ls",
  );
  assert.equal(
    describeClientToolRequest({ tool: "pc_system_info", title: "读取本机系统信息", args: {} }),
    "读取本机系统信息",
  );
  assert.equal(describeClientToolRequest({ tool: "pc_shell", title: null, args: null }), "pc_shell");
});

test("摘要超长 ⇒ 截断 (不许把卡片撑爆)", () => {
  const s = describeClientToolArgs({ tool: "pc_shell", args: { command: "x".repeat(500) } });
  assert.ok(s.length <= 120, `摘要长度必须 ≤ 120, 实际 ${s.length}`);
  assert.ok(s.endsWith("…"));
});

// ===========================================================================
// 三端同款 —— PC 与 web 的模型文件逐字节相同
// ===========================================================================

test("PC 与 web 的 src/lib/rich-events.ts 逐字节相同 (三端同款 ⇒ 只写一份)", () => {
  const peer = join(PEER_REPO, "src", "lib", "rich-events.ts");
  assert.equal(
    md5(join(REPO, "src", "lib", "rich-events.ts")),
    md5(peer),
    `PC 与 web 的 rich-events.ts 不一致 (对端仓: ${peer})`,
  );
});
