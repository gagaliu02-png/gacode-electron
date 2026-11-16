// [2026-11-16] PC 端 —— 常驻订阅路径的「轮次身份」+「系统注记」
// ---------------------------------------------------------------------------
// 覆盖真机报障（安卓 6f5f523 同款 · PC 端同构）:
//
//   ① 认领 turnKey —— 常驻订阅路径（`X-Stream-Mode: none` ⇒ 帧从
//      `GET chat/subscribe` 回来）**也必须**认领帧顶层的 `turnKey`，
//      并**落到本地那一行上**。
//      ⚠ 之前只在**发起流路径**认领 ⇒ 订正 32 之后从不认领
//        ⇒ 本地行 `turnKey` 恒空 ⇒ 归并层（按 turnKey 判「同一轮」）配不上
//        ⇒ **本地行 + 服务端行 = 两个一模一样的气泡**。
//
//   ② origin 判定 —— 「这一轮是谁发起的」：
//      帧自带 `origin` 优先（服务端权威，2026-11-16 起）；
//      没有 ⇒ 用「**我发起 POST 时拿到的 turnKey**」反推。
//
//   ③ 系统注记 —— 服务端起轮（订正 30）时落的那条 `role='user'` 行，
//      metadata 带 `source='work_unit_result'`（老服务端）或
//      `skip_transcript=true`（新服务端）⇒ 渲染成**系统注记**，不是用户气泡。
//
//   ④ ⛔ 护栏 —— 主源码里**不许**出现「后台任务」+「已完成」同现的字面量
//      （契约 §4.2：那句提示的正文由服务端写，端侧只**渲染**，不**合成**）。
//
//   ⚠️ **web 是原件端** —— 判据的唯一一份在
//      `gacode-web/src/lib/sse/turn-identity.ts`，PC 端**逐字抄**那一份
//      （`src/lib/sse/turn-identity.ts`）⇒ 两端不可能漂。
//      本测试的判据**直接加载那份共享模块**（零 import ⇒ 编译成 mjs 即可跑）。
//
//   为什么被测对象是 .ts 而测试是 .mjs:
//     Node ESM 既不认 "@/lib/..." 别名，也不做扩展名补全 ⇒ 直接 import 会
//     ERR_MODULE_NOT_FOUND。这里复用仓库已有的转译加载器
//     (scripts/lib/schedule-loader.mjs), 跟其余测试同一套手法。
//
//   运行: npm test   (完全离线: 不连网、不渲染 React)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { makeTmpDir, writeModule } from "../scripts/lib/schedule-loader.mjs";
import { stripComments } from "../scripts/lib/strip-comments.mjs";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");
const repoCode = (p) => stripComments(repoSrc(p), p);

// ---------------------------------------------------------------------------
// 加载共享层 (零 import ⇒ 直接编译成 mjs)
// ---------------------------------------------------------------------------
const dir = makeTmpDir("verify-turn-identity");
const TI = await import(
  writeModule(dir, "turn-identity", repoSrc("src/lib/sse/turn-identity.ts"))
);
const {
  readFrameTurn,
  readFrameOrigin,
  resolveTurnOrigin,
  claimPersistentFrame,
  emptyPersistentTurnState,
  buildAttachRowId,
  isSystemNoticeMetadata,
} = TI;

const IDENTITY = "src/lib/sse/turn-identity.ts";
const API = "src/lib/api.ts";
const DETAIL = "src/routes/ChatDetail.tsx";
const BUBBLE = "src/components/chat/MessageBubble.tsx";
const LIST = "src/components/chat/MessageList.tsx";

// ===========================================================================
// A 段 —— 帧级: 读出「这一轮是谁」+「这一轮是谁发起的」
// ===========================================================================

test("A1 帧顶层的 turnKey / origin 都被读出来", () => {
  const t = readFrameTurn({ turnKey: "tk_abc", origin: "work_unit_result" });
  assert.equal(t.turnKey, "tk_abc");
  assert.equal(t.origin, "work_unit_result");
});

test("A2 帧没带 turnKey / origin ⇒ 都是 null (老服务端 ⇒ 不猜)", () => {
  const t = readFrameTurn({ content: "x" });
  assert.equal(t.turnKey, null);
  assert.equal(t.origin, null);
});

test("A3 帧不是对象 / null ⇒ 读出空值 (不抛)", () => {
  assert.equal(readFrameTurn(null).turnKey, null);
  assert.equal(readFrameTurn(undefined).origin, null);
  assert.equal(readFrameOrigin("nope"), null);
});

test("A4 origin 只认服务端约定的两个值 ⇒ 别的值一律 null (端侧不猜)", () => {
  assert.equal(readFrameOrigin({ origin: "user" }), "user");
  assert.equal(readFrameOrigin({ origin: "work_unit_result" }), "work_unit_result");
  assert.equal(readFrameOrigin({ origin: "whatever" }), null);
});

// ===========================================================================
// B 段 —— 轮次级: 判定「这一轮是谁发起的」
// ===========================================================================

test("B1 帧自带 origin ⇒ 用帧的 (服务端权威, 优先于反推)", () => {
  const own = new Set(["tk_abc"]);
  assert.equal(
    resolveTurnOrigin({
      frameOrigin: "work_unit_result",
      frameTurnKey: "tk_abc",
      ownTurnKeys: own,
    }),
    "work_unit_result",
  );
  assert.equal(
    resolveTurnOrigin({
      frameOrigin: "user",
      frameTurnKey: "tk_zzz",
      ownTurnKeys: own,
    }),
    "user",
  );
});

test("B2 帧没带 origin ⇒ 用「我发起 POST 时拿到的 turnKey」反推", () => {
  const own = new Set(["tk_abc"]);
  assert.equal(
    resolveTurnOrigin({ frameOrigin: null, frameTurnKey: "tk_abc", ownTurnKeys: own }),
    "user",
    "是我发起的轮 ⇒ user",
  );
  assert.equal(
    resolveTurnOrigin({ frameOrigin: null, frameTurnKey: "tk_other", ownTurnKeys: own }),
    "work_unit_result",
    "不是我发起的轮 ⇒ work_unit_result",
  );
});

test("B3 不知道 ⇒ null (不敢断言, 保守处理)", () => {
  assert.equal(
    resolveTurnOrigin({ frameOrigin: null, frameTurnKey: null, ownTurnKeys: new Set(["t"]) }),
    null,
    "帧没带 turnKey ⇒ null",
  );
  assert.equal(
    resolveTurnOrigin({ frameOrigin: null, frameTurnKey: "t", ownTurnKeys: new Set() }),
    null,
    "不知道我发起过哪些轮 ⇒ null",
  );
  assert.equal(resolveTurnOrigin({}), null, "什么都没给 ⇒ null");
});

// ===========================================================================
// C 段 —— 认领: 常驻订阅路径把帧顶层 turnKey 落到本地那一行上
// ===========================================================================

test("C1 认领: 帧顶层的 turnKey 被认领下来 (落进状态)", () => {
  const claim = claimPersistentFrame(emptyPersistentTurnState(), {
    content: "答",
    turnKey: "tk_abc",
  });
  assert.equal(claim.switched, true);
  assert.equal(claim.state.turnKey, "tk_abc");
});

test("C2 反证: 不认领 ⇒ 本地行 turnKey 恒空 ⇒ 归并层配不上 ⇒ 两条气泡", () => {
  // 不认领时状态里的 turnKey 恒为 null —— 这就是「本地行拿不到身份」的样子。
  const prev = emptyPersistentTurnState();
  const claim = claimPersistentFrame(prev, { content: "答" }); // 帧没带 turnKey
  assert.equal(claim.state.turnKey, null, "没认领 ⇒ 本地行没有身份 ⇒ 配不上服务端那一行");
});

test("C3 同一轮的后续帧 ⇒ 不切轮 (seq 不变 ⇒ 还是同一行)", () => {
  const prev = { turnKey: "tk_abc", origin: null, seq: 0 };
  const claim = claimPersistentFrame(prev, { content: "再答", turnKey: "tk_abc" });
  assert.equal(claim.switched, false);
  assert.equal(claim.state.turnKey, "tk_abc");
  assert.equal(claim.state.seq, 0);
});

test("C4 切轮: 帧的 turnKey 变了 ⇒ 换一行 (seq+1 ⇒ 两轮不撞 id)", () => {
  const prev = { turnKey: "tk_abc", origin: null, seq: 0 };
  const claim = claimPersistentFrame(prev, { content: "新答", turnKey: "tk_def" });
  assert.equal(claim.switched, true);
  assert.equal(claim.state.turnKey, "tk_def", "身份换成新一轮的");
  assert.equal(claim.state.seq, 1, "轮次序号 +1");
});

test("C5 老服务端: 帧不带 turnKey ⇒ 不认领、不切轮 (行为与改动前逐字一致)", () => {
  const prev = { turnKey: "tk_abc", origin: null, seq: 0 };
  const claim = claimPersistentFrame(prev, { content: "x" });
  assert.equal(claim.switched, false);
  assert.equal(claim.state.turnKey, "tk_abc", "状态原样返回");
  assert.equal(claim.state.seq, 0);
});

test("C6 切轮时判定 origin: 帧自带优先, 没有 ⇒ 用「我发起过的轮」反推", () => {
  const own = new Set(["tk_mine"]);
  const mine = claimPersistentFrame(
    emptyPersistentTurnState(),
    { turnKey: "tk_mine" },
    own,
  );
  assert.equal(mine.origin, "user", "我发起的轮 ⇒ user");

  const theirs = claimPersistentFrame(
    emptyPersistentTurnState(),
    { turnKey: "tk_theirs" },
    own,
  );
  assert.equal(theirs.origin, "work_unit_result", "不是我发起的轮 ⇒ work_unit_result");

  const framed = claimPersistentFrame(
    emptyPersistentTurnState(),
    { turnKey: "tk_mine", origin: "work_unit_result" },
    own,
  );
  assert.equal(framed.origin, "work_unit_result", "帧自带 origin ⇒ 优先用帧的");
});

test("C7 行 id: 第 0 轮逐字是老 id ⇒ 老路径行为不变; 之后带序号 ⇒ 两轮不撞 id", () => {
  const first = buildAttachRowId("sess1", 0);
  const second = buildAttachRowId("sess1", 1);
  assert.notEqual(first, second, "两轮的行 id 必须不同（否则第二轮覆盖第一轮）");
  assert.ok(first.includes("sess1"), "行 id 带会话 id");
});

// ===========================================================================
// D 段 —— 行级: 这一行是不是「服务端投递的系统注记」
// ===========================================================================

test("D1 metadata.source === 'work_unit_result' ⇒ 系统注记 (老服务端只有这个)", () => {
  assert.equal(isSystemNoticeMetadata({ source: "work_unit_result" }), true);
});

test("D2 metadata.skip_transcript === true ⇒ 系统注记 (新服务端两个都有)", () => {
  assert.equal(isSystemNoticeMetadata({ skip_transcript: true }), true);
});

test("D3 两个都有 ⇒ 系统注记 (或关系)", () => {
  assert.equal(
    isSystemNoticeMetadata({ source: "work_unit_result", skip_transcript: true }),
    true,
  );
});

test("D4 普通 user 行 (无标记 / 别的标记) ⇒ **不是**系统注记", () => {
  assert.equal(isSystemNoticeMetadata({}), false);
  assert.equal(isSystemNoticeMetadata(undefined), false);
  assert.equal(isSystemNoticeMetadata(null), false);
  assert.equal(isSystemNoticeMetadata({ source: "session_inbox" }), false);
  assert.equal(isSystemNoticeMetadata({ skip_transcript: false }), false);
});

test("D5 metadata 是 JSON 字符串 ⇒ 一样能判 (服务端可能给字符串)", () => {
  assert.equal(
    isSystemNoticeMetadata('{"source":"work_unit_result"}'),
    true,
  );
});

test("D6 metadata 坏了 ⇒ 不是系统注记 (端侧不猜、不编)", () => {
  assert.equal(isSystemNoticeMetadata("{坏 JSON"), false);
});

// ===========================================================================
// E 段 —— PC 端接线（源码级）
// ===========================================================================

test("E1 ChatDetail 的常驻帧路由必须认领帧顶层 turnKey (问题 1 的修法)", () => {
  const code = repoCode(DETAIL);
  assert.ok(
    code.includes("claimPersistentFrame"),
    "常驻流 onChunk 必须调 claimPersistentFrame（判据在 lib/sse/turn-identity.ts）",
  );
  assert.ok(
    /onChunk:\s*\(chunk,\s*_cur\)\s*=>\s*\{[\s\S]*?claimPersistentFrame/.test(code),
    "claimPersistentFrame 必须挂在**常驻订阅**的 onChunk 上（PC 端唯一的常驻流入口）",
  );
});

test("E2 ChatDetail 必须把认领到的 turnKey 落到本地行上 (切轮时换成新一轮的)", () => {
  const code = repoCode(DETAIL);
  assert.ok(
    /claim\.switched[\s\S]*?setStreamingTurnKey\(claim\.state\.turnKey\)/.test(code),
    "切轮 ⇒ 本地那一行换成新一轮的 turnKey（否则归并层拿旧身份配 ⇒ 空气泡）",
  );
});

test("E3 ChatDetail 的 origin 判定必须用共享层的那一份 (不许内联第二份)", () => {
  const code = repoCode(DETAIL);
  assert.ok(
    code.includes('from "../lib/sse/turn-identity"'),
    "ChatDetail 必须 import 共享层的 turn-identity (判据只有一份 ⇒ PC 抄同一份)",
  );
  // 内联判据的形状 (自己比较 turnKey 判 origin) 不许出现。
  assert.ok(
    !/origin\s*=\s*.*turnKey\s*===/.test(code),
    "⛔ 不许在 ChatDetail 里内联第二份 origin 判据 (照抄 turn-identity.ts 的 resolveTurnOrigin)",
  );
});

test("E4 ChatDetail 必须把「我发起过的轮」记在**内存**里 (不落持久化)", () => {
  const code = repoCode(DETAIL);
  assert.ok(
    /const ownTurnKeysRef = useRef<Set<string>>\(new Set\(\)\)/.test(code),
    "ownTurnKeysRef 必须是 useRef（内存态 ⇒ 不落 localStorage / IndexedDB）",
  );
  // 两条路都要记：建轮不建流（sendNoStream 的应答）+ 发起流（响应头 onTurnKey）。
  assert.ok(
    /sent\?\.turnKey[\s\S]{0,400}?ownTurnKeysRef\.current\.add\(sent\.turnKey\)/.test(code),
    "sendNoStream 的应答 turnKey ⇒ 记进 ownTurnKeys（建轮那一刻服务端就给了）",
  );
  assert.ok(
    /onTurnKey:\s*\(tk\)\s*=>\s*\{[\s\S]{0,400}?ownTurnKeysRef\.current\.add\(tk\)/.test(code),
    "发起流路径的 onTurnKey ⇒ 也记进 ownTurnKeys（响应头那一路的身份）",
  );
});

test("E4b 切会话 ⇒ 常驻流的轮次身份复位 (它跨会话存活)", () => {
  const code = repoCode(DETAIL);
  assert.ok(
    /persistentTurnRef\.current = emptyPersistentTurnState\(\)/.test(code),
    "切会话 ⇒ persistentTurnRef 必须复位（否则新会话第一帧被判成「切轮」）",
  );
});

test("E5 api.ts 的 getHistory 必须打 isSystemNotice 标记 (问题 3)", () => {  const code = repoCode(API);
  assert.ok(
    code.includes("isSystemNoticeMetadata"),
    "api.ts 必须用 lib/sse/turn-identity.ts 的判据（唯一一份）",
  );
  assert.ok(
    /isSystemNotice\s*[=:,]/.test(code),
    "getHistory 必须把判据结果带出来（isSystemNotice）",
  );
  assert.ok(
    /isSystemNotice\?:\s*boolean/.test(code),
    "ChatMessage 必须声明 isSystemNotice?: boolean (类型契约)",
  );
});

test("E6 MessageBubble 必须把系统注记渲染成注记条, 且不挂用户消息专属操作", () => {
  const list = repoCode(LIST);
  assert.ok(
    /isSystemNotice\?:\s*boolean/.test(list),
    "ChatMessageModel 必须声明 isSystemNotice?: boolean (类型契约)",
  );
  assert.ok(
    /isSystemNotice=\{m\.isSystemNotice\}/.test(list),
    "MessageList 必须把 isSystemNotice 透给气泡",
  );

  const bubble = repoCode(BUBBLE);
  assert.ok(
    bubble.includes("isSystemNotice"),
    "MessageBubble 必须认 isSystemNotice",
  );
  assert.ok(
    /data-testid="system-notice"/.test(bubble),
    "系统注记要有自己的 testid（渲染层可断言）",
  );
  // 早返回 ⇒ 整个 ⋮ 菜单（撤回 / 删除）都不渲染。
  const early = bubble.indexOf("isSystemNotice");
  const menu = bubble.indexOf("<MessageMenu");
  assert.ok(early !== -1 && menu !== -1, "两个位置都要在");
  assert.ok(
    early < menu,
    "系统注记的早返回必须**在** MessageMenu 渲染之前 ⇒ 不出现撤回/删除",
  );
});

// ===========================================================================
// F 段 —— ⛔ 护栏: 主源码里不许出现「后台任务」+「已完成」同现的字面量
// ---------------------------------------------------------------------------
// 契约 §4.2: 服务端起轮时落的那条 user 行, 正文是「（后台任务 xxx 已完成）」。
//   端侧**只渲染**它, **绝不本地合成** —— 合成 ⇒ 刷新后重复 ⇒ id 撞车 ⇒ 渲染层崩。
//
//   ⇒ 本护栏扫**主源码里的字符串字面量** (注释不算 —— 注释里说明这个契约是必要的),
//     命中「后台任务」**且**「已完成」⇒ 失败。
// ===========================================================================

/** 递归列出 src/ 下所有 .ts / .tsx 文件。 */
function listSrcFiles(dirAbs, out = []) {
  for (const name of readdirSync(dirAbs)) {
    const p = join(dirAbs, name);
    const st = statSync(p);
    if (st.isDirectory()) listSrcFiles(p, out);
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** 抠出源码里的**字符串字面量** (粗粒度够用: 引号内的非注释片段)。 */
function stringLiterals(code) {
  const out = [];
  // 先按行去掉行注释 (注释里的说明不算)。
  const noLineComment = code
    .split("\n")
    .map((line) => {
      // ⛔ 别把 URL 里的 "//" 切掉 ⇒ 只在引号外找 //。
      let inStr = null;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inStr) {
          if (ch === inStr) inStr = null;
          continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") {
          inStr = ch;
          continue;
        }
        if (ch === "/" && line[i + 1] === "/") return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
  // 逐个引号对抠内容 (跳过转义)。
  const re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = re.exec(noLineComment)) !== null) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return out;
}

test("F1 ⛔ 主源码里不许出现「后台任务」+「已完成」同现的字符串字面量", () => {
  const offenders = [];
  for (const abs of listSrcFiles(join(REPO, "src"))) {
    const rel = abs.slice(REPO.length + 1);
    // 注释不算 (契约说明里必须提到这两个词)。
    const code = stripComments(repoSrc(rel), rel);
    for (const lit of stringLiterals(code)) {
      if (lit.includes("后台任务") && lit.includes("已完成")) {
        offenders.push(`${rel}: ${lit.slice(0, 80)}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "⛔ 契约 §4.2: 端侧**不许本地合成**「（后台任务XXX已完成）」这句 —— " +
      "本地再插一条 ⇒ 刷新后重复 ⇒ id 撞车 ⇒ 渲染层直接崩。" +
      "端侧只**渲染**服务端写的那行。实际命中: " +
      JSON.stringify(offenders),
  );
});

test("F2 判据模块只有 metadata 的**键名**，没有那句文案（web / PC 逐字相同）", () => {
  // 判据模块里出现「已完成」只可能是**注释**（说明契约）⇒ 剥掉注释后不该再有。
  const code = repoCode(IDENTITY);
  assert.ok(code.includes("work_unit_result"), "判据模块要认 source 的取值");
  assert.ok(code.includes("skip_transcript"), "判据模块要认 skip_transcript 键");
  assert.ok(
    !/已完成/.test(code),
    "⛔ 判据模块的**代码**里不许出现「已完成」字面量（那句话服务端写）",
  );
});
