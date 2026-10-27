#!/usr/bin/env node
/**
 * verify-rich-event-degrade.mjs
 *
 * 任务书 04 · P-3 / P-4 / P-8 / P-9 / P-13 / P-7 (契约 §2 / §4 / §5, L-8 ~ L-18)
 *
 *   · **L-8  键缺失 ≡ null** —— 归一后的字段表里, 缺的键补 null。
 *   · **L-9  逐条容错** —— 一批事件里夹一条坏的, 只跳那一条, 其余照收。
 *   · **L-11 未知 type** —— 跳过该条 + 记诊断, 不整帧归零。
 *   · **L-12 丢 `category`** —— 归一后的对象**不含** category。
 *   · **L-2  只建模不渲染** —— `think` / `planify_start` / `planify_done`
 *     在数据模型里留着, 但归一层**跳过**它们 (不渲染、不报错、不中断本批)。
 *   · **P-13 tool_done 的 5 个 subtype 是活的** —— `code_diff` / `chart` /
 *     `doc_summary` 在生产里**没有**独立事件 (那是 §2.5 的死类型) ⇒ 必须
 *     按 `tool_done` 的 subtype 渲染。
 *   · **P-8 / L-14 ~ L-18 双写去重** —— 按 **(事件族, id)**:
 *     只对 `file`↔`tool_done[file]`、`image`↔`tool_done[image]` 生效;
 *     保留**新协议**那条; ⛔ `web_preview` 不参与。
 *   · **L-10 空 url 降级** —— `file` / `image` / `web_preview` 没 url 时
 *     **不得**整条消失、**不得**留 `href="#"` 死链接。
 *   · **P-4 / P-3 历史产出 richEvents** —— 历史路径必须从 `phases_json`
 *     里解析出富事件, 否则刷新页面后交付物卡片全丢。
 *
 * 断言方式:
 *   - **运行时**: `src/lib/rich-events.ts` 零 import ⇒ 直接跑真代码;
 *     `parsePhasesRichEvents` (在 api.ts 里) 用 AST 抠出来挂到桩模块上跑 ——
 *     抠的是**真源码**, 行为与生产一致。
 *   - **结构性**: 渲染层 (RichEventBubble.tsx) 与接线断言打在**去注释后**的源码上。
 *
 * 退出码: 0 = 通过 / 1 = 有断言失败。
 *
 * 用法: node scripts/verify-rich-event-degrade.mjs  (必须在仓库根跑)
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { makeTmpDir, writeModule } from "./lib/schedule-loader.mjs";
import { stripComments } from "./lib/strip-comments.mjs";
import { extractDecl, extractFunction } from "./lib/source-scan.mjs";

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

/** 递归列出 src/ 下的 .ts / .tsx (相对仓库根, 正斜杠)。 */
function walkSrc(dirRel = "src", out = []) {
  for (const name of readdirSync(join(process.cwd(), dirRel))) {
    const rel = `${dirRel}/${name}`;
    const st = statSync(join(process.cwd(), rel));
    if (st.isDirectory()) walkSrc(rel, out);
    else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 被测对象 ①: src/lib/rich-events.ts (零 import ⇒ 直接加载)
// ---------------------------------------------------------------------------
const dir = makeTmpDir("verify-rich-event-degrade");
const richUrl = writeModule(dir, "rich-events", repoSrc("src/lib/rich-events.ts"));
const R = await import(richUrl);

// ---------------------------------------------------------------------------
// 被测对象 ②: api.ts 的 `parsePhasesRichEvents` —— AST 抠真源码, 挂到桩模块上。
//   (api.ts 整体 import ./notifications —— 通知域带 date-fns 等依赖, 与本断言
//    无关 ⇒ 只抠这一个纯函数。)
// ---------------------------------------------------------------------------
const apiCode = repoCode("src/lib/api.ts");
const parsePhasesFn = extractFunction(apiCode, "parsePhasesRichEvents", "src/lib/api.ts");
let phasesRichUrl = null;
if (!parsePhasesFn) {
  console.log("❌ 从 src/lib/api.ts 里抠不出 parsePhasesRichEvents —— 源文件结构变了?");
  process.exit(1);
}
{
  const fn = parsePhasesFn.includes("export ")
    ? parsePhasesFn
    : `${parsePhasesFn}\nexport { parsePhasesRichEvents };`;
  phasesRichUrl = writeModule(
    dir,
    "phases-rich",
    `import { normalizeRichEvent } from "./rich-events.mjs";\n${fn}\n`,
  );
}
const PR = await import(phasesRichUrl);

// ===========================================================================
// A. 归一层 (L-8 / L-9 / L-11 / L-12)
// ===========================================================================

log("A. 归一层 (L-8 / L-9 / L-11 / L-12)");

{
  const { event } = R.normalizeRichEvent({ type: "tool_start", id: "t1" });
  event && event.tool === null && event.args === null
    ? pass("★ L-8 键缺失 ≡ null (不 undefined、不整条丢)")
    : miss(`L-8 不对: ${JSON.stringify(event)}`);
}

{
  const { event } = R.normalizeRichEvent({
    type: "tool_start",
    id: "t1",
    tool: "bash",
    category: "should_be_dropped",
  });
  event && !("category" in event)
    ? pass("★ L-12 `category` 被丢弃 (归一后的对象不含它)")
    : miss(`category 没被丢: ${JSON.stringify(event)}`);
}

{
  // 归一后的键只能落在白名单里 —— 多余的键 (server 加字段) 一律不外泄。
  const { event } = R.normalizeRichEvent({
    type: "file",
    id: "f1",
    url: "u",
    name: "n",
    secret_extra: "leak",
  });
  const keys = event ? Object.keys(event) : [];
  const allowed = new Set(["type", "id", "url", "name", "fileName", "size", "sizeBytes", "localPath", "mimeType", "mime", "origin"]);
  const extra = keys.filter((k) => !allowed.has(k));
  extra.length === 0
    ? pass("★ 归一后的键 ⊆ 字段白名单 (server 多塞的字段不外泄)")
    : miss(`归一后混进了白名单外的键: ${JSON.stringify(extra)}`);
}

{
  const res = R.normalizeRichEvents([
    { type: "tool_start", id: "a", tool: "bash" },
    { type: "not_a_real_type", id: "b" },
    { type: "tool_fail", id: "c", tool: "bash", error: "boom" },
  ]);
  res.events.length === 2 &&
  res.events[0].id === "a" &&
  res.events[1].id === "c" &&
  res.skipped.length === 1
    ? pass("★ L-9 一批里夹一条坏的 ⇒ 只跳那一条, 其余照收")
    : miss(`逐条容错不对: ${JSON.stringify(res)}`);
}

{
  const res = R.normalizeRichEvents(null);
  res.events.length === 0 && res.skipped.length === 0
    ? pass("非数组载荷 ⇒ 空结果, 不抛错 (L-9)")
    : miss("非数组载荷的处理不对");
}

{
  const res = R.normalizeRichEvent({ type: "totally_unknown_type", id: "x" });
  res.event === null && res.skipReason === "unknown_type" && res.skipType === "totally_unknown_type"
    ? pass("★ L-11 名单外 type ⇒ 跳过该条 + 记下 type")
    : miss(`L-11 的处理不对: ${JSON.stringify(res)}`);
}

{
  // 9 个死类型 (契约 §2.5) —— 已知不会来, 静默跳过。
  const dead = [
    "plan",
    "task_complete",
    "confirm_request",
    "handoff",
    "code_diff",
    "chart",
    "doc_summary",
    "skill_result",
    "skill_tool",
  ];
  const wrong = dead.filter((t) => R.normalizeRichEvent({ type: t }).skipReason !== "reserved_type");
  wrong.length === 0
    ? pass(`9 个死类型全部静默跳过 (reserved_type) —— ${dead.length} 个`)
    : miss(`死类型没被跳过: ${JSON.stringify(wrong)}`);
}

{
  const malformed = [null, undefined, 42, "str", [], { noType: 1 }, { type: "" }];
  const wrong = malformed.filter((m) => R.normalizeRichEvent(m).skipReason !== "malformed");
  wrong.length === 0
    ? pass(`畸形载荷全部判为 malformed (不抛错) —— ${malformed.length} 个样本`)
    : miss(`畸形载荷判定不对: ${JSON.stringify(wrong)}`);
}

// ===========================================================================
// B. L-2 只建模不渲染 (任务书 P-9 的 3 个)
// ===========================================================================

log("B. L-2 只建模不渲染 (think / planify_start / planify_done)");

{
  const three = ["think", "planify_start", "planify_done"];
  const wrong = three.filter(
    (t) => R.normalizeRichEvent({ type: t, id: "x" }).skipReason !== "unknown_type",
  );
  wrong.length === 0
    ? pass("★ 3 个「只建模」类型归一层直接跳过 (不渲染、不报错)")
    : miss(`这 3 个类型没被跳过: ${JSON.stringify(wrong)}`);

  const notModeled = three.filter((t) => !R.LIVE_RICH_EVENT_TYPES.includes(t));
  notModeled.length === 0
    ? pass("★ 但它们**仍在数据模型里** (LIVE_RICH_EVENT_TYPES 保留 —— L-6 安卓不能整帧丢)")
    : miss(`数据模型里缺了这 3 个类型: ${JSON.stringify(notModeled)}`);
}

// ===========================================================================
// C. P-13 —— tool_done 的 5 个 subtype 是活的
// ===========================================================================

log("C. P-13 —— tool_done 的 5 个 subtype");

{
  const want = ["file", "image", "code_diff", "chart", "doc_summary"];
  const got = [...R.TOOL_DONE_SUBTYPES].sort();
  JSON.stringify(got) === JSON.stringify([...want].sort())
    ? pass("★ 5 个活 subtype 齐了 (code_diff / chart / doc_summary 是 tool_done 的 subtype, 不是独立类型)")
    : miss(`活 subtype 列表不对: ${JSON.stringify(got)}`);
}

{
  const { event } = R.normalizeRichEvent({
    type: "tool_done",
    id: "d1",
    tool: "str_replace",
    subtype: "code_diff",
    path: "a.ts",
    diff: "@@",
  });
  event && event.subtype === "code_diff" && event.path === "a.ts"
    ? pass("★ tool_done 的 subtype 原样保留 (不被清空)")
    : miss(`subtype 没保留: ${JSON.stringify(event)}`);
}

{
  const { event } = R.normalizeRichEvent({ type: "tool_done", id: "d2", subtype: "weird" });
  event && event.subtype === null
    ? pass("名单外的 subtype ⇒ 归 null (不硬塞进类型)")
    : miss(`名单外 subtype 没归 null: ${JSON.stringify(event?.subtype)}`);
}

// ===========================================================================
// D. 去重按族 (任务书 P-8 / 契约 L-14 ~ L-18)
// ===========================================================================

log("D. 去重按族 (P-8 / L-14 ~ L-18)");

const ev = (o) => ({ category: undefined, ...o });
const ids = (list) => list.map((e) => `${e.type}:${e.id ?? ""}`);

{
  // 旧协议先到 (tool_done[file]) + 新协议后到 (file) ⇒ 只剩一条, 且是新协议那条。
  const list = [
    ev({ type: "tool_done", id: "x1", subtype: "file", url: "u", name: "n" }),
    ev({ type: "file", id: "x1", url: "u", name: "n" }),
  ];
  const out = R.dedupeRichEvents(list);
  out.length === 1 && out[0].type === "file"
    ? pass("★ file ↔ tool_done[file] 同 id ⇒ 只留一条, 且留**新协议**那条")
    : miss(`file 族去重不对: ${JSON.stringify(ids(out))}`);
}

{
  // 新协议先到 + 旧协议后到 ⇒ 同样只留新协议那条, 且**位置不变**。
  const list = [
    ev({ type: "file", id: "x1", url: "u" }),
    ev({ type: "tool_done", id: "x1", subtype: "file", url: "u" }),
  ];
  const out = R.dedupeRichEvents(list);
  out.length === 1 && out[0].type === "file"
    ? pass("新协议先到时, 旧协议那条被丢掉 (位置不变)")
    : miss(`顺序敏感的去重不对: ${JSON.stringify(ids(out))}`);
}

{
  const list = [
    ev({ type: "tool_done", id: "y1", subtype: "image", url: "u" }),
    ev({ type: "image", id: "y1", url: "u" }),
  ];
  const out = R.dedupeRichEvents(list);
  out.length === 1 && out[0].type === "image"
    ? pass("★ image ↔ tool_done[image] 同 id ⇒ 只留一条, 且留新协议那条")
    : miss(`image 族去重不对: ${JSON.stringify(ids(out))}`);
}

{
  // ⛔ web_preview 不参与去重 (它的 id 被加工成 `id+'_web'`, 同族同 id 判据不成立)。
  const list = [
    ev({ type: "web_preview", id: "z1", url: "u" }),
    ev({ type: "web_preview", id: "z1", url: "u" }),
  ];
  const out = R.dedupeRichEvents(list);
  out.length === 2
    ? pass("★ ⛔ web_preview 不参与去重 (两条都在)")
    : miss(`web_preview 被去重了: ${JSON.stringify(ids(out))}`);

  const fam = R.richEventFamily({ type: "web_preview", id: "z1", url: "u" });
  fam === null
    ? pass("★ web_preview 不属于任何事件族")
    : miss(`web_preview 落进了族: ${fam}`);
}

{
  // 跨族不去重: 同 id 的 file 与 image 是两族 ⇒ 都留。
  const list = [ev({ type: "file", id: "same", url: "u" }), ev({ type: "image", id: "same", url: "u" })];
  const out = R.dedupeRichEvents(list);
  out.length === 2
    ? pass("★ 跨族不去重 (file 与 image 同 id 都留)")
    : miss(`跨族被误去重: ${JSON.stringify(ids(out))}`);
}

{
  // tool_done 无 subtype ⇒ 不入族 ⇒ 不去重。
  const list = [
    ev({ type: "tool_done", id: "g1", tool: "bash" }),
    ev({ type: "tool_done", id: "g1", tool: "bash" }),
  ];
  const out = R.dedupeRichEvents(list);
  out.length === 2
    ? pass("★ tool_done (无 subtype) 不去重")
    : miss(`无 subtype 的 tool_done 被去重了: ${JSON.stringify(ids(out))}`);
}

{
  // 别的族 (tool_start / tool_fail / result) 一律不去重。
  const list = [
    ev({ type: "tool_start", id: "s1", tool: "bash" }),
    ev({ type: "tool_start", id: "s1", tool: "bash" }),
  ];
  const out = R.dedupeRichEvents(list);
  out.length === 2
    ? pass("tool_start 等非族类型不去重")
    : miss(`tool_start 被去重了: ${JSON.stringify(ids(out))}`);
}

{
  // 没有 id / id 非字符串 ⇒ 不参与去重。
  const list = [ev({ type: "file", url: "u" }), ev({ type: "file", url: "u" })];
  const out = R.dedupeRichEvents(list);
  out.length === 2
    ? pass("没有 id 的 file 不去重")
    : miss(`无 id 的 file 被去重了: ${JSON.stringify(ids(out))}`);
}

{
  // 族判据本身。
  const famOf = (e) => R.richEventFamily(e);
  famOf({ type: "file", id: "a" }) === "file" &&
  famOf({ type: "image", id: "a" }) === "image" &&
  famOf({ type: "tool_done", id: "a", subtype: "file" }) === "file" &&
  famOf({ type: "tool_done", id: "a", subtype: "image" }) === "image" &&
  famOf({ type: "tool_done", id: "a", subtype: "code_diff" }) === null &&
  famOf({ type: "tool_done", id: "a" }) === null
    ? pass("★ 族判据正确 (只有 file / image 两族; code_diff 等不沾边)")
    : miss("族判据不对");
}

// ===========================================================================
// E. 渲染层 (P-9 / L-10 / L-19) —— 结构性
// ===========================================================================

log("E. 渲染层 (P-9 / L-10 / L-19)");

const bubbleCode = repoCode("src/components/chat/RichEventBubble.tsx");

{
  const bubbleFn = extractFunction(bubbleCode, "RichEventBubble", "src/components/chat/RichEventBubble.tsx");
  bubbleFn && /case\s+"step_started"/.test(bubbleFn) && /case\s+"step_failed"/.test(bubbleFn)
    ? pass("★ P-9 step_started / step_failed 有正经卡片 (不是 JSON 字面)")
    : miss("P-9 的 step_* 没走专门分支");

  bubbleFn && /case\s+"report"/.test(bubbleFn)
    ? pass("★ P-9 report 有正经卡片")
    : miss("P-9 的 report 没走专门分支");

  bubbleFn && !/case\s+"think"|case\s+"planify_start"|case\s+"planify_done"/.test(bubbleFn)
    ? pass("★ think / planify_start / planify_done **不**渲染 (L-2 只建模)")
    : miss("只建模的 3 个类型被渲染了");

  bubbleFn && /default:/.test(bubbleFn)
    ? pass("渲染层有 default 兜底 (漏过来的未知 type 不炸)")
    : miss("渲染层没有 default 兜底");
}

{
  const toolDoneFn = extractFunction(bubbleCode, "ToolDoneCard", "src/components/chat/RichEventBubble.tsx");
  const subs = ["file", "image", "code_diff", "chart", "doc_summary"];
  const missing = subs.filter((s) => !new RegExp(`case\\s+"${s}"`).test(toolDoneFn ?? ""));
  missing.length === 0
    ? pass("★ P-13 5 个 subtype 都有各自的渲染分支")
    : miss(`缺 subtype 分支: ${JSON.stringify(missing)}`);
}

{
  // ⚠️ 判据收紧 (变异反证 M44 打回来的): 之前查的是「有没有 NO_PUBLIC_LINK 这个名字」——
  //   而把它的**值**清空成 "" 也照样绿 ⇒ 断言等于没有。改成查「值是个非空文案」。
  const nplDecl = extractDecl(
    bubbleCode,
    "NO_PUBLIC_LINK",
    "src/components/chat/RichEventBubble.tsx",
  );
  nplDecl && /=\s*"[^"]+"/.test(nplDecl)
    ? pass("★ L-10 有统一的降级文案常量 NO_PUBLIC_LINK")
    : miss("L-10 的 NO_PUBLIC_LINK 常量不见了");
}

{
  !/href\s*=\s*["']#["']/.test(bubbleCode)
    ? pass("★ L-10 卡片里没有 `href=\"#\"` 死链接")
    : miss("还有 href=\"#\" 死链接");
}

{
  // L-10: 没 url 时**不得**整条消失 (`return null`)。
  // ⚠️ 四个卡片都要查 (image / file / tool_done[image] / web_preview) ——
  //   之前只查了 image + file, 漏了 tool_done[image] 与 web_preview (变异 M49/M51 打回来的)。
  const cardFns = [
    ["ImageCard", "image 卡片"],
    ["FileCard", "file 卡片"],
    ["ToolDoneImageCard", "tool_done image 卡片"],
    ["WebPreviewCard", "web_preview 卡片"],
  ];
  for (const [fnName, label] of cardFns) {
    const fn = extractFunction(
      bubbleCode,
      fnName,
      "src/components/chat/RichEventBubble.tsx",
    );
    fn && !/return\s+null/.test(fn)
      ? pass(`★ L-10 ${label} 没 url 时不整条消失 (不 return null)`)
      : miss(`${label}还会在没 url 时整条消失`);
  }
}

{
  const anchors = bubbleCode.match(/<a\b[\s\S]{0,400}?>/g) || [];
  const bad = anchors.filter(
    (a) => !/target="_blank"/.test(a) || !/rel="noopener noreferrer"/.test(a),
  );
  bad.length === 0 && anchors.length > 0
    ? pass(`★ L-19 所有外链都带 target=_blank + rel=noopener noreferrer (${anchors.length} 处)`)
    : miss(`外链属性不全对: ${bad.length} 处`);
}

// ===========================================================================
// F. P-4 / P-3 —— 历史产出 richEvents
// ===========================================================================

log("F. P-4 / P-3 —— 历史产出 richEvents");

{
  // phases_json 的形状: [{type:"tool", event:{...}}, ...]
  const phases = JSON.stringify([
    {
      type: "tool",
      event: { type: "tool_done", id: "d1", tool: "write", subtype: "file", url: "u", name: "n" },
    },
    { type: "reasoning", content: "想一下" },
    { type: "tool", event: { type: "file", id: "f1", url: "u2", name: "n2" } },
  ]);
  const out = PR.parsePhasesRichEvents(phases);
  Array.isArray(out) && out.length === 2 && out[0].id === "d1" && out[1].id === "f1"
    ? pass("★ P-4 历史路径从 phases_json 里产出 richEvents (只认 type===\"tool\")")
    : miss(`历史 richEvents 解析不对: ${JSON.stringify(out)}`);
}

{
  PR.parsePhasesRichEvents(null) === undefined &&
  PR.parsePhasesRichEvents(undefined) === undefined &&
  PR.parsePhasesRichEvents("") === undefined
    ? pass("缺 phases_json ⇒ undefined (不渲空容器)")
    : miss("缺 phases_json 时返回了别的");
}

{
  PR.parsePhasesRichEvents("{坏 JSON") === undefined
    ? pass("非法 JSON ⇒ undefined (静默降级)")
    : miss("非法 JSON 没降级");
}

{
  PR.parsePhasesRichEvents(JSON.stringify({ not: "an array" })) === undefined
    ? pass("非数组 ⇒ undefined")
    : miss("非数组没降级");
}

{
  PR.parsePhasesRichEvents(JSON.stringify([{ type: "reasoning", content: "x" }])) === undefined
    ? pass("没有 tool 事件 ⇒ undefined")
    : miss("没有 tool 事件时返回了别的");
}

{
  /richEvents:\s*parsePhasesRichEvents\(m\.phases_json\)/.test(apiCode)
    ? pass("★ getHistory 把 richEvents 挂到每条历史消息上")
    : miss("getHistory 没挂 richEvents");
}

{
  const chatCode = repoCode("src/routes/ChatDetail.tsx");
  /richEvents:\s*m\.richEvents/.test(chatCode)
    ? pass("★ ChatDetail 把历史的 richEvents 透传给消息模型 (P-4)")
    : miss("ChatDetail 没透传历史的 richEvents");

  /richEvents:\s*dedupeRichEvents\(streamingEvents\)/.test(chatCode)
    ? pass("★ 流式消息的富事件也走去重 (P-8)")
    : miss("流式消息的富事件没走去重");
}

{
  const msgBubble = repoCode("src/components/chat/MessageBubble.tsx");
  /<RichEventBubble\b/.test(msgBubble)
    ? pass("★ 消息气泡真的渲染富事件卡片 (接线通)")
    : miss("消息气泡没渲染 RichEventBubble");
}

// ===========================================================================
// G. 去重口径 —— 组件层调用的是共享的那一份
// ===========================================================================

log("G. 去重口径 —— 只有一份实现");

{
  const chatCode = repoCode("src/routes/ChatDetail.tsx");
  /from\s+"\.\.\/lib\/rich-events"/.test(chatCode) && /dedupeRichEvents/.test(chatCode)
    ? pass("★ ChatDetail 用的是共享层的 dedupeRichEvents (没自己写第三遍)")
    : miss("ChatDetail 没走共享的 dedupeRichEvents");

  // 全仓扫「自造的富事件去重函数」—— 只允许 lib/rich-events.ts 里那一份。
  const own = [];
  for (const f of walkSrc()) {
    if (f === "src/lib/rich-events.ts") continue;
    const code = repoCode(f);
    if (/function\s+dedupeRichEvent\w*\s*\(/.test(code)) own.push(f);
    if (/const\s+dedupeRichEvent\w*\s*=\s*(\(|async)/.test(code)) own.push(f);
  }
  own.length === 0
    ? pass("★ 全仓只有一份富事件去重实现 (lib/rich-events.ts)")
    : miss(`有别处自己写了一份去重: ${JSON.stringify(own)}`);
}

log("");
log("=== 汇总 ===");
if (fail === 0) {
  console.log(
    "✅ 富事件验收全过 (归一层 + 只建模不渲染 + 5 个 subtype + 按族去重 + 历史产出 richEvents)",
  );
  console.log(`===PASS=${passCount} FAIL=${fail}===`);
} else {
  console.log(`❌ 有 ${fail} 条断言失败`);
  console.log(`===PASS=${passCount} FAIL=${fail}===`);
}
log(`===EXIT=${fail === 0 ? 0 : 1}===`);
process.exit(fail === 0 ? 0 : 1);
