#!/usr/bin/env node
/**
 * verify-sse-cursor.mjs
 *
 * 任务书 04 · P-1 / P-2 / P-7 (契约 §8 L-33 ~ L-36 + §11.4 P3 + §14.5 P1 / P2)
 *
 *   · P-1  读帧必须**抓 `id:` 行**并把游标交给调用方。
 *          (改之前 `src/lib/sse.ts` 的手写解析器只处理 `data:` 行, 显式丢弃 `id:`
 *           ⇒ 游标永远拿不到 ⇒ 续传永远退化成全量接回。)
 *   · P-2  续传请求头二选一: 合法游标 ⇒ `Last-Event-ID`; 否则 ⇒ `X-Resume-Turn: 1`。
 *   · L-33 游标 = **纯十进制数字串** —— UUID / `12abc` / `1.9` 全部非法
 *          (⛔ 端侧不得用 parseInt 把 `12abc` 截成 `12`: 历史事故 —— UUID 游标被截断后
 *           服务端照单全收)。
 *   · L-34 帧**没有 `id:` 行** ⇒ 游标**保持不变** (不得清空、不得回退)。
 *   · L-35 续传头二选一。
 *   · L-36 续传请求 body **留空** (body 带内容 ⇒ 服务端当成「建新轮次」)。
 *   · §14.5 P1 抓 `id:` 行 / §14.5 P2 「会话流与通知流**同一实现**」
 *          (另写一套帧解析器 / 退避算术 ⇒ 转红)。
 *
 * 断言方式:
 *   - **运行时**: 用仓库已有的转译加载器把 `src/lib/chat-sse.ts` 跑起来, 喂真帧。
 *   - **结构性**: 断言打在**去注释后**的源码上 (本仓注释密度极高 —— 不去注释的话
 *     断言会被注释喂饱, 改坏代码照样绿)。
 *
 * 退出码: 0 = 通过 / 1 = 有断言失败。
 *
 * 用法: node scripts/verify-sse-cursor.mjs  (必须在仓库根跑)
 */

import { readFileSync } from "node:fs";
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

// ---------------------------------------------------------------------------
// 被测对象: src/lib/chat-sse.ts (转译成 .mjs 再 import)
// ---------------------------------------------------------------------------
// ⚠️ `chat-sse.ts` 依赖 `./notifications-sse` 的 `SseFrameParser` —— 但那个模块
//   整体 import 了 react / react-router / react-query (通知中心的 UI 桥),
//   运行时加载不了。
//   ⇒ 只把**纯逻辑**那两块 (增量帧解析器 + 单帧解析) 用 AST 抠出来, 落成一个
//     只含这两个声明的桩模块。**抠的是真源码** (不是复写一遍), 所以桩里的行为
//     与生产完全一致 —— 断言验的仍是真代码。
const dir = makeTmpDir("verify-sse-cursor");
{
  const nsSrc = repoSrc("src/lib/notifications-sse.ts");
  const parserDecl = extractDecl(nsSrc, "SseFrameParser", "src/lib/notifications-sse.ts");
  const parseFn = extractFunction(nsSrc, "parseSseFrame", "src/lib/notifications-sse.ts");
  if (!parserDecl || !parseFn) {
    console.log(
      "❌ 从 src/lib/notifications-sse.ts 里抠不出 SseFrameParser / parseSseFrame —— 源文件结构变了?",
    );
    process.exit(1);
  }
  writeModule(dir, "notifications-sse", `${parserDecl}\n\n${parseFn}\n`);
}
writeModule(dir, "rich-events", repoSrc("src/lib/rich-events.ts"));
const chatSseUrl = writeModule(dir, "chat-sse", repoSrc("src/lib/chat-sse.ts"), {
  rewriteImports: [
    ["./notifications-sse", "./notifications-sse.mjs"],
    ["./rich-events", "./rich-events.mjs"],
  ],
});
const S = await import(chatSseUrl);

const enc = new TextEncoder();
const streamOf = (text) =>
  new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(text));
      c.close();
    },
  });

// ===========================================================================
// A. 游标合法性 (L-33) —— 判据必须**严格**
// ===========================================================================

log("A. 游标合法性 (L-33)");

S.isValidEventCursor("0") === true &&
S.isValidEventCursor("42") === true &&
S.isValidEventCursor("17926600121500") === true
  ? pass("纯十进制数字串 ⇒ 合法")
  : miss("纯十进制数字串被误判为非法");

const badCursors = [
  "550e8400-e29b-41d4-a716-446655440000", // UUID (历史事故形状)
  "1.9", // 小数
  "12abc", // 带尾巴 —— parseInt 会截成 12!
  " 3", // 带前导空格
  "3 ", // 带尾随空格
  "-1", // 负数
  "", // 空串
  "0x10", // 十六进制
  null,
  undefined,
  42,
  {},
];
const stillBad = badCursors.filter((c) => S.isValidEventCursor(c) !== false);
stillBad.length === 0
  ? pass(`非法游标全部被拒 (${badCursors.length} 个样本, 含 UUID / 12abc / parseInt 陷阱)`)
  : miss(`非法游标被放行: ${JSON.stringify(stillBad)}`);

// 结构: 判据必须锚定两端 —— 放宽成 /^\d+/ 会把 `12abc` 截成 12 当合法游标。
const chatSseCode = repoCode("src/lib/chat-sse.ts");
/\/\^\\d\+\$\//.test(chatSseCode)
  ? pass("判据锚定为 /^\\d+$/ (放宽成 /^\\d+/ 会放行 `12abc`)")
  : miss("判据不是锚定的 /^\\d+$/");

// ===========================================================================
// B. 游标推进 (L-34) —— 帧无 id ⇒ 保持不变
// ===========================================================================

log("B. 游标推进 (L-34)");

S.advanceEventCursor("1", "2") === "2" &&
S.advanceEventCursor(null, "2") === "2"
  ? pass("帧带合法 id ⇒ 游标推进")
  : miss("帧带合法 id 时游标没推进");

S.advanceEventCursor("42", null) === "42" &&
S.advanceEventCursor("42", undefined) === "42" &&
S.advanceEventCursor(null, null) === null
  ? pass("帧无 id ⇒ 游标保持不变 (不得清空、不得回退)")
  : miss("帧无 id 时游标被清空或回退了");

S.advanceEventCursor("42", "550e8400-e29b-41d4-a716-446655440000") === "42" &&
S.advanceEventCursor("42", "12abc") === "42" &&
S.advanceEventCursor("42", "") === "42"
  ? pass("帧带非法 id ⇒ 游标保持不变 (端侧不得猜着修补)")
  : miss("帧带非法 id 时游标被污染了");

// ===========================================================================
// C. 续传头 (L-35)
// ===========================================================================

log("C. 续传头 (L-35)");

const h1 = S.buildResumeHeaders("42");
h1["Last-Event-ID"] === "42" && h1["X-Resume-Turn"] === undefined
  ? pass("合法游标 ⇒ 只带 Last-Event-ID")
  : miss(`合法游标的头不对: ${JSON.stringify(h1)}`);

let allDowngraded = true;
for (const bad of [null, undefined, "", "12abc", "550e8400-e29b-41d4-a716-446655440000", 42]) {
  const h = S.buildResumeHeaders(bad);
  if (h["Last-Event-ID"] !== undefined || h["X-Resume-Turn"] !== "1") {
    allDowngraded = false;
    miss(`非法游标 ${JSON.stringify(bad)} 的续传头不对: ${JSON.stringify(h)}`);
    break;
  }
}
if (allDowngraded) pass("非法/缺失游标 ⇒ 降级成 X-Resume-Turn: 1 (绝不发脏游标)");

S.LAST_EVENT_ID_HEADER === "Last-Event-ID" &&
S.RESUME_TURN_HEADER === "X-Resume-Turn" &&
S.RESUME_TURN_VALUE === "1"
  ? pass("续传头名与契约一致 (Last-Event-ID / X-Resume-Turn: 1)")
  : miss("续传头名/值与契约不一致");

// ===========================================================================
// D. 读帧行为 (P-1) —— `id:` 行必须被抓出来
// ===========================================================================

log("D. 读帧行为 (P-1)");

{
  const cursors = [];
  const data = [];
  const res = await S.readChatSse(streamOf('id: 42\ndata: {"content":"hi"}\n\n'), {
    onData: (p) => data.push(p),
    onCursor: (c) => cursors.push(c),
  });
  cursors.length === 1 && cursors[0] === "42" && res.cursor === "42" && data.length === 1
    ? pass("★ 帧带 `id:` 行 ⇒ 游标被抓出来并交给调用方 (P-1)")
    : miss(`\`id:\` 行没被抓出来: cursors=${JSON.stringify(cursors)} res.cursor=${res.cursor}`);
}

{
  const cursors = [];
  const seen = [];
  await S.readChatSse(
    streamOf('id: 42\ndata: {"content":"a"}\n\ndata: {"content":"b"}\n\n'),
    { onData: (_p, c) => seen.push(c), onCursor: (c) => cursors.push(c) },
  );
  cursors.length === 1 && seen[0] === "42" && seen[1] === "42"
    ? pass("第二帧没有 `id:` ⇒ 游标保持 42, 且不重复通知 (L-34)")
    : miss(`无 id 帧的行为不对: cursors=${JSON.stringify(cursors)} seen=${JSON.stringify(seen)}`);
}

{
  const cursors = [];
  await S.readChatSse(
    streamOf(
      'id: 42\ndata: {"content":"a"}\n\nid: 550e8400-e29b-41d4-a716-446655440000\ndata: {"content":"b"}\n\n',
    ),
    { onCursor: (c) => cursors.push(c) },
  );
  cursors.length === 1 && cursors[0] === "42"
    ? pass("非法 `id:` 行 ⇒ 游标保持不变 (不得把脏值当游标)")
    : miss(`非法 id 被当成了游标: ${JSON.stringify(cursors)}`);
}

{
  const data = [];
  const errors = [];
  await S.readChatSse(
    streamOf('data: {"content":"a"}\n\ndata: {坏JSON\n\ndata: {"content":"c"}\n\n'),
    { onData: (p) => data.push(p), onParseError: (raw) => errors.push(raw) },
  );
  data.length === 2 && errors.length === 1
    ? pass("一帧坏 JSON ⇒ 只跳过那一条, 其余帧照收 (L-9 逐条容错)")
    : miss(`坏帧牵连了其它帧: data=${data.length} errors=${errors.length}`);
}

{
  const data = [];
  await S.readChatSse(streamOf(': heartbeat\n\ndata: {"content":"a"}\n\n'), {
    onData: (p) => data.push(p),
  });
  data.length === 1 ? pass("心跳/注释帧不产数据帧") : miss("心跳帧被当成了数据帧");
}

// ===========================================================================
// E. §14.5 P2 —— 「同一实现」: 不许另写一套帧解析器 / 退避算术
// ===========================================================================

log("E. §14.5 P2 —— 与通知流同一实现");

const chatSseImports = repoCode("src/lib/chat-sse.ts");
/from\s+"\.\/notifications-sse"/.test(chatSseImports)
  ? pass("★ chat-sse.ts 复用通知流的 SseFrameParser (§11.4 P3 禁止写第三遍)")
  : miss("chat-sse.ts 没有复用通知流的帧解析器 (另写了一套)");

const sseCode = repoCode("src/lib/chat-stream.ts");
/from\s+"\.\/sse-reconnect"/.test(sseCode)
  ? pass("★ sse.ts 的退避/watchdog 走共享的 sse-reconnect (与通知流同一份)")
  : miss("sse.ts 没有走共享的 sse-reconnect");

const nsCode = repoCode("src/lib/notifications-sse.ts");
/from\s+"\.\/sse-reconnect"/.test(nsCode)
  ? pass("★ notifications-sse.ts 也走同一份 sse-reconnect (两边确实是同一实现)")
  : miss("notifications-sse.ts 没走 sse-reconnect —— 两边不是同一份实现");

// 退避算术不许在 sse.ts 里再写一遍 (Math.min(x*2, ...) 那种)。
/Math\.min\(\s*\w+\s*\*\s*2\s*,/.test(sseCode)
  ? miss("sse.ts 里自己写了一份指数退避算术 (与 sse-reconnect 重复实现)")
  : pass("sse.ts 里没有第二份指数退避算术");

// ===========================================================================
// F. 接线 —— sse.ts 的续传分支 (P-1 / P-2 / L-35 / L-36)
// ===========================================================================

log("F. 接线 —— sse.ts 续传分支 (P-1 / P-2 / L-35 / L-36)");

/readChatSse\(/.test(sseCode)
  ? pass("P-1 sse.ts 用共享 readChatSse 读帧 (它抓 `id:` 行)")
  : miss("P-1 sse.ts 没走 readChatSse —— `id:` 行又会被丢掉");

/buildResumeHeaders\(/.test(sseCode)
  ? pass("P-2 sse.ts 走共享的 buildResumeHeaders (不是自己拼头)")
  : miss("P-2 sse.ts 没走 buildResumeHeaders");

// ⚠️ 判据收紧 (变异反证 M07 打回来的): 之前查的是「**有**一个 onCursor 回调长这样」——
//   而 sse.ts 里有 3 个 onCursor 回调 (发起流 / start / attach), 改坏其中一个
//   另外两个照样匹配 ⇒ 断言恒绿。改成「**每个** onCursor 回调都得把游标透传出去」:
//   回调数 == 透传数, 且一个都不能少。
//   (注意 `onCursor?:` 是接口里的**声明** —— 正则要求 "onCursor" 紧跟 ":",
//    所以声明不会被算进回调数。)
const onCursorHandlers = (sseCode.match(/onCursor:\s*\(/g) || []).length;
const onCursorForwards = (sseCode.match(/opts\.onCursor\?\.\(/g) || []).length;
onCursorHandlers >= 1 && onCursorForwards === onCursorHandlers
  ? pass(
      `P-1 sse.ts 每个 onCursor 回调都把游标透传给调用方 (${onCursorForwards}/${onCursorHandlers})`,
    )
  : miss("P-1 sse.ts 没把游标透传给调用方");

// L-36: 续传 body 必须留空 —— body 带内容会被服务端当成「建新轮次」。
/body:\s*opts\.resume\s*\?\s*undefined/.test(sseCode)
  ? pass("★ L-36 续传请求 body 留空 (undefined)")
  : miss("L-36 续传 body 不是空的 —— 服务端会当成建新轮次");

// 续传时不该带 Content-Type (没有 body)。
/if\s*\(!opts\.resume\)\s*headers\["Content-Type"\]/.test(sseCode)
  ? pass("续传时不带 Content-Type (无 body)")
  : miss("续传时仍在带 Content-Type");

// attach 也必须带续传头 (契约 L-47) + 端标识 (契约 D3 / L-30)。
/Object\.assign\(headers,\s*buildResumeHeaders\(/.test(sseCode)
  ? pass("attach 流也带续传头 (Last-Event-ID / X-Resume-Turn)")
  : miss("attach 流没带续传头");

/\[CLIENT_ID_HEADER\]:\s*CLIENT_ID_PC/.test(sseCode)
  ? pass("★ attach 流带端标识 X-Client-Id: pc (契约 D3 / L-30)")
  : miss("attach 流没带端标识 X-Client-Id");

// 归一层: 会话流的每一帧都要过归一层 (契约 L-8 ~ L-12)。
const normalizeCalls = (sseCode.match(/normalizeChatChunk\(/g) || []).length;
normalizeCalls >= 2
  ? pass(`★ 发起流与 attach 流都过归一层 normalizeChatChunk (${normalizeCalls} 处)`)
  : miss(`归一层调用点只有 ${normalizeCalls} 处 —— 有一路没过归一层`);

// 旧的手写解析器残留 = `id:` 行又被显式丢一次。
/if\s*\(\s*line\.startsWith\(\s*["']id["']/.test(sseCode)
  ? miss("sse.ts 里还有手写的 `id:` 行处理分支 —— 游标解析会走两套")
  : pass("sse.ts 没有第二套手写的 `id:` 解析");

log("");
log("=== 汇总 ===");
if (fail === 0) {
  console.log("✅ 游标 / 续传头验收全过 (抓 id 行 + 严格判据 + 二选一续传头 + 空 body + 同一实现)");
  console.log(`===PASS=${passCount} FAIL=${fail}===`);
} else {
  console.log(`❌ 有 ${fail} 条断言失败`);
  console.log(`===PASS=${passCount} FAIL=${fail}===`);
}
log(`===EXIT=${fail === 0 ? 0 : 1}===`);
process.exit(fail === 0 ? 0 : 1);
