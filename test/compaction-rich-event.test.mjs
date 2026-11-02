// [批 G2 · 2026-11-02] `compaction` (上下文压缩) 事件的端侧契约 —— PC 侧
//
// 背景 (2026-11-01 生产事故, unified-api sessionId=888):
//   gaclaw 压缩上下文时**一个字都没往前端发** ⇒ 用户只看到界面卡住,
//   不知道「后台把上下文折叠了」⇒ 误以为卡死 / 以为流断了。
//   服务端半边 (GC-G2-1) 已在 gaclaw 侧把 `compaction` 事件发出来;
//   本文件守 PC 侧的另一半: 收得到、渲染得出、时间线不说英文 type、
//   且模型与 web **逐字节相同**。
//
// 覆盖断言:
//   · GC-G3-10 PC 的渲染层必须有 compaction 分支 (switch 的 case)
//   · GC-G3-11 PC 的时间线必须特判 compaction (不许 "compaction compaction")
//   · GC-G3-12 PC 与 web 的 `src/lib/rich-events.ts` md5 逐字节相同
//   · GC-G3-13 PC 侧归一: compaction 能解出来、缺键 ⇒ null
//
//   运行: npm test   (纯函数, 不连网、不渲染 React)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "../scripts/lib/strip-comments.mjs";

import {
  LIVE_RICH_EVENT_TYPES,
  normalizeRichEvent,
  normalizeRichEvents,
  describeCompaction,
} from "../src/lib/rich-events.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");
const md5 = (p) => createHash("md5").update(readFileSync(p)).digest("hex");

// 对端仓 (web) —— 临时 worktree 里用 RC_PEER_REPO 指定 (跟 RC-W7 同一套路)
const PEER_REPO = process.env.RC_PEER_REPO
  ? process.env.RC_PEER_REPO
  : join(REPO, "..", "gacode-web");

// ===========================================================================
// GC-G3-10 ~ GC-G3-11 · 渲染层
// ===========================================================================

test("GC-G3-10 PC 的渲染层必须有 compaction 分支", () => {
  const code = stripComments(
    repoSrc("src/components/chat/RichEventBubble.tsx"),
    "src/components/chat/RichEventBubble.tsx",
  );
  assert.ok(
    code.includes('case "compaction"'),
    "PC 的 RichEventBubble 必须有 case \"compaction\" (否则落进 default 分支显示 JSON 字面)",
  );
  assert.ok(
    code.includes("上下文已压缩"),
    "PC 的 compaction 卡片必须有中文提示文案",
  );
});

test("GC-G3-11 PC 的时间线必须特判 compaction (不许 'compaction compaction')", () => {
  const code = stripComments(
    repoSrc("src/components/chat/ExecutionTimeline.tsx"),
    "src/components/chat/ExecutionTimeline.tsx",
  );
  assert.ok(
    code.includes('ev.type === "compaction"'),
    "PC 的 ExecutionTimeline 必须特判 compaction",
  );
  assert.ok(code.includes("上下文压缩"), "时间线的 compaction 行必须是人话");
});

// ===========================================================================
// GC-G3-12 · PC ≡ web 逐字节相同
// ===========================================================================

test("GC-G3-12 PC 与 web 的 src/lib/rich-events.ts md5 逐文件相同", () => {
  const rel = "src/lib/rich-events.ts";
  const local = join(REPO, rel);
  const peer = join(PEER_REPO, rel);
  assert.ok(existsSync(local), `本仓的 ${rel} 不存在: ${local}`);
  assert.ok(
    existsSync(peer),
    `对端的 ${rel} 不存在: ${peer} (临时 worktree 里用 RC_PEER_REPO 指定)`,
  );
  assert.equal(
    md5(local),
    md5(peer),
    `两端 ${rel} 漂移了 (契约模型必须逐字节相同)`,
  );
});

// ===========================================================================
// GC-G3-13 · 模型
// ===========================================================================

test("GC-G3-13 PC 侧归一: compaction 能解出来, 缺键 ⇒ null", () => {
  assert.ok(
    LIVE_RICH_EVENT_TYPES.includes("compaction"),
    "活类型名单少了 compaction",
  );
  const r = normalizeRichEvent({
    type: "compaction",
    strategy: "heavy",
    removed_messages: 12,
    before_tokens: 60000,
    after_tokens: 8000,
    ts: 1730000000000,
  });
  assert.ok(r.event, "compaction 必须能归一");
  assert.equal(r.event.type, "compaction");
  assert.equal(r.event.strategy, "heavy");
  assert.equal(r.event.before_tokens, 60000);
  assert.equal(r.event.after_tokens, 8000);

  const bare = normalizeRichEvent({ type: "compaction" });
  assert.ok(bare.event);
  for (const f of [
    "strategy",
    "removed_messages",
    "before_tokens",
    "after_tokens",
    "ts",
  ]) {
    assert.ok(f in bare.event, `键 ${f} 必须在`);
    assert.equal(bare.event[f], null, `${f} 缺失 ⇒ null`);
  }

  // L-9: 同批夹一条坏事件 ⇒ 其余都保留
  const batch = normalizeRichEvents([
    { type: "compaction", strategy: "light" },
    { type: "完全未知" },
    { type: "tool_done", id: "t1", tool: "file_write" },
  ]);
  assert.equal(batch.events.length, 2, "坏的那条只跳过自己");
  assert.deepEqual(
    batch.events.map((e) => e.type),
    ["compaction", "tool_done"],
  );
});

test("GC-G3-14 PC 与 web 的 compaction 文案必须一致 (describeCompaction 共用)", () => {
  assert.equal(
    describeCompaction({
      strategy: "light",
      removed_messages: 12,
      before_tokens: 32000,
      after_tokens: 15000,
    }),
    "32000 → 15000 tokens · 折叠 12 条消息",
  );
});
