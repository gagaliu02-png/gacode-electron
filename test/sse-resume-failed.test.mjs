// [RC 轮 · RC-5] 「本端续传接不回来」帧 (resumeFailed) ⇒ 端侧认它 ⇒ 降级闭环 (**不弹错**)
//
// ---------------------------------------------------------------------------
// 派工单 RC-5 (批 C 端侧) 的断言
// ---------------------------------------------------------------------------
//   RC-W2 —— 未知 `resumeStatus` ⇒ **不抛异常**、按失败处理 (默认文案)
//   RC-W4 —— 读到 `resumeFailed` ⇒ 触发 `invalidateQueries(["history", chatId])`
//   RC-W5 —— 读到 `resumeFailed` ⇒ 该消息落成 `stalled` (**不是**空内容)
//   RC-W6 —— `resumeStatus='stale_epoch'` (端侧没见过的新取值) ⇒ 不抛异常、走文案
//   RC-W7 —— web 与 PC 的 `src/lib/sse/**` md5 **逐文件**相同
//   (RC-W3 的共享层断言在 test/sse-no-terminal.test.mjs; 这里只复核接线)
//
// ---------------------------------------------------------------------------
// 断言分四层
// ---------------------------------------------------------------------------
//   A 段 (共享层 `src/lib/sse/terminal.ts` + `degrade.ts`) —— **行为**断言: 真 import 跑。
//   B 段 (流层: 判帧 + 收尾判据) —— 把宿主源码里那段判据**原样求值**。
//       ⛔ 只扫源码会假绿 (「写了但没接上」)。
//   C 段 (宿主层: 页面) —— 降级闭环的**接线**: 补拉历史 + 标 stalled + 不弹错 + 关流式态。
//   D 段 (两端漂移) —— `src/lib/sse/**` 逐文件 md5 相同 (RC-W7)。
//
// 运行: node --test test/sse-resume-failed.test.mjs   (完全离线: 不连网、不渲染 React)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { makeTmpDir, writeModule } from "../scripts/lib/schedule-loader.mjs";
import { stripComments } from "../scripts/lib/strip-comments.mjs";
import {
  extractFunction,
  extractIfBranch,
} from "../scripts/lib/source-scan.mjs";

// ---------------------------------------------------------------------------
// 本仓的身份 (web / PC 两份测试只有这个块不同)
// ---------------------------------------------------------------------------
const END = "pc"; // web | pc
const PEER_DIR = "gacode-web"; // 对端仓目录名 (md5 比对用)
const HOST_FILE = "src/lib/chat-stream.ts"; // 流层: 判帧 + 收尾判据 (PC)
const HOST_FN = "start"; // 流层的函数名 (PC 的判帧 + 收尾判据都在 start 里)
const UI_FILE = "src/routes/ChatDetail.tsx"; // 宿主层: 降级闭环在这
const CONSUME_FN = "onTurnChunk"; // 宿主层: 「吃一帧」的那条路 (两端同名)
const CONSUME_HANDLER_MARK = "handleStreamChunk"; // 「吃一帧」那条路里, 见到失败帧后调谁
const TOAST_IDS = ["setStreamError", "toast("]; // 通用错误弹窗 (降级分支里不许出现)
const SHARED_TERMINAL = "src/lib/sse/terminal.ts"; // 共享层: 失败帧判据 + 文案
const SHARED_DEGRADE = "src/lib/sse/degrade.ts"; // 共享层: 降级计划 + 快照读取
const SHARED_DIR = "src/lib/sse"; // 共享层目录 (RC-W7 逐文件 md5)
const STALLED_MARK = "setStreamingStalled(true)"; // 宿主层标 stalled 的写法
const BLANK_MARKERS = ['setStreamingContent("")', "setStreamingContent('')"]; // ⛔ 不许把内容清空的写法
const CLOSE_MARK = "setWaitingFirstFrame(false)"; // 关掉「等首帧」态的写法
const STATE_DISPATCH = 'type: "resume_failed"'; // 派给状态机的事件

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const PEER_REPO = process.env.RC_PEER_REPO
  ? process.env.RC_PEER_REPO
  : join(REPO, "..", PEER_DIR);
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");
const repoCode = (p) => stripComments(repoSrc(p), p);
const md5 = (p) => createHash("md5").update(readFileSync(p)).digest("hex");

// ---------------------------------------------------------------------------
// 加载共享层 (零 import 或只需改写相对 import ⇒ 转译加载器即可)
// ---------------------------------------------------------------------------
const dir = makeTmpDir("verify-sse-resume-failed");

const T = await import(writeModule(dir, "terminal", repoSrc(SHARED_TERMINAL)));
// degrade 依赖 seq-guard / turn-record ⇒ 得先落这两个。
await import(writeModule(dir, "seq-guard", repoSrc("src/lib/sse/seq-guard.ts")));
await import(writeModule(dir, "turn-record", repoSrc("src/lib/sse/turn-record.ts")));
const D = await import(
  writeModule(dir, "degrade", repoSrc(SHARED_DEGRADE), {
    rewriteImports: [
      ["seq-guard", "./seq-guard.mjs"],
      ["turn-record", "./turn-record.mjs"],
    ],
  })
);

// ===========================================================================
// A 段 · 共享层 (行为断言)
// ===========================================================================

test("A1 失败帧判据只认**严格的** true (别的取值一律不当)", () => {
  assert.equal(
    T.isResumeFailedFrame({ resumeFailed: true }),
    true,
    "服务端给的失败帧必须被认出来 (RC-5 的全部前提)",
  );
  assert.equal(T.isResumeFailedFrame({ resumeFailed: false }), false);
  assert.equal(T.isResumeFailedFrame({ resumeFailed: "yes" }), false);
  assert.equal(T.isResumeFailedFrame({ resumeFailed: 1 }), false);
  assert.equal(T.isResumeFailedFrame({}), false);
});

test("A2 ★ RC-W3 复核: 失败帧也算「这一轮有终态」⇒ 流式态关得掉", () => {
  assert.equal(
    T.isTerminalOrFailed({ resumeFailed: true }),
    true,
    "失败帧是失败终态 ⇒ 判据必须认它 (不然流式态永远关不掉)",
  );
  assert.equal(T.isTerminalOrFailed({ done: true, messageId: "m1" }), true);
  assert.equal(T.isTerminalOrFailed({ done: true }), false);
});

test("A3 ★ RC-W2/RC-W6 未知 resumeStatus ⇒ 不抛异常 + 落默认文案", () => {
  const label = T.readResumeStatusLabel("some_code_from_the_future");
  assert.equal(
    label,
    T.RESUME_FAILED_LABEL,
    "服务端以后加新码, 老端侧不能崩也不能空 (⇒ 落默认文案)",
  );
  assert.ok(label.length > 0, "文案不许是空串 (空串 = 界面上什么都没有)");
});

test("A4 ★ RC-W6 resumeStatus='stale_epoch' ⇒ 不抛异常 + 有文案", () => {
  // 端侧**没见过**的新取值 ⇒ 只准选文案, 不准当判据、不准抛。
  let label = null;
  assert.doesNotThrow(() => {
    label = T.readResumeStatusLabel("stale_epoch");
  });
  assert.ok(
    typeof label === "string" && label.length > 0,
    "stale_epoch 必须能选出一条文案 (不许抛、不许空)",
  );
  assert.ok(
    "stale_epoch" in T.RESUME_STATUS_LABELS,
    "stale_epoch 是 RC-3 新引入的服务端取值 ⇒ 文案表里必须有它",
  );
});

test("A5 resumeStatus 为空 / null / undefined ⇒ 落默认文案 (不抛)", () => {
  assert.equal(T.readResumeStatusLabel(null), T.RESUME_FAILED_LABEL);
  assert.equal(T.readResumeStatusLabel(undefined), T.RESUME_FAILED_LABEL);
  assert.equal(T.readResumeStatusLabel(""), T.RESUME_FAILED_LABEL);
  assert.equal(T.readResumeStatusLabel("   "), T.RESUME_FAILED_LABEL);
  assert.equal(T.readResumeStatusLabel(123), T.RESUME_FAILED_LABEL);
});

test("A6 默认文案与安卓**逐字一致** (三端同一句话)", () => {
  assert.equal(
    T.RESUME_FAILED_LABEL,
    "未收到服务端回复，以上为中断前的内容",
    "安卓 `chat_turn_stalled_marker` 就是这句话 ⇒ 三端不许各写各的",
  );
});

test("A7 失败帧带的快照读得出来; 没有快照 ⇒ null (不是空对象)", () => {
  const snap = D.readServerSnapshot({
    resumeFailed: true,
    resumeStatus: "no_active_stream",
    snapshot: { content: "中断前的正文", toolCallCount: 2 },
  });
  assert.ok(snap, "服务端给了快照就必须读得出来");
  assert.equal(snap.content, "中断前的正文");
  assert.equal(snap.toolCallCount, 2);
  assert.equal(
    D.readServerSnapshot({ resumeFailed: true, snapshot: null }),
    null,
    "契约订正 20: snapshot 键恒在但值可为 null ⇒ 读出来就是 null",
  );
  assert.equal(D.readServerSnapshot({ resumeFailed: true }), null);
});

// ===========================================================================
// B 段 · 流层 (判帧 + 收尾判据)
// ===========================================================================

const hostCode = repoCode(HOST_FILE);
const hostFnSrc = extractFunction(hostCode, HOST_FN, HOST_FILE);

test("B0 流层能抠出来 (抠不到 ⇒ 下面的断言都是假绿)", () => {
  assert.ok(hostFnSrc, `抠不到 ${HOST_FN} (${HOST_FILE})`);
});

test("B1 流层用的是**共享层**的失败帧判据 (G-3: 一处真值)", () => {
  const src = repoSrc(HOST_FILE);
  assert.ok(
    /from\s+["'][^"']*sse\/terminal["']/.test(src),
    `${HOST_FILE} 没有从共享层 import 判据`,
  );
  assert.ok(
    /isResumeFailedFrame/.test(src),
    `${HOST_FILE} 没有用共享层的 isResumeFailedFrame`,
  );
});

test("B2 ★ RC-W3 接线: 流层把失败帧记进**独立的** sawFailed", () => {
  assert.ok(hostFnSrc, "抠不到流层源码");
  const branch = extractIfBranch(hostFnSrc, "isResumeFailedFrame(", HOST_FILE);
  assert.ok(branch, "流层没有「见到失败帧」的分支");
  assert.ok(
    /sawFailed\s*=\s*true/.test(branch),
    "失败帧必须记进 sawFailed (独立的标志位)",
  );
  assert.ok(
    !/sawDone\s*=\s*true/.test(branch),
    "⛔ sawFailed **不许**并进 sawDone —— sawDone 驱动收尾的 ACK_DONE DELETE ⇒ " +
      "会把服务端**还在跑**的那一轮杀掉 (失败帧只说「你接不回来」, 不是「这轮结束了」)",
  );
});

test("B3 sawDone 只在「轮次终态帧」那个分支置位 (不被失败帧污染)", () => {
  assert.ok(hostFnSrc, "抠不到流层源码");
  const branch = extractIfBranch(hostFnSrc, "isTerminalDone(", HOST_FILE);
  assert.ok(branch, "流层没有「见到轮次终态帧」的分支");
  assert.ok(
    /sawDone\s*=\s*true/.test(branch),
    "sawDone 必须由 isTerminalDone 分支置位",
  );
  assert.ok(
    !/sawFailed/.test(branch),
    "⛔ 终态分支里不许出现 sawFailed (两个标志位必须分开)",
  );
});

/** 抠出 `fn({...})` 的**实参源码** (对象字面量)。 */
function extractCallArgObject(src, fileName, fnName) {
  const isTsx = fileName.endsWith(".tsx");
  const sf = ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.ES2022,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  let found = null;
  const visit = (node) => {
    if (
      !found &&
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === fnName
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) found = arg.getText(sf);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

/** 在测试里**原样求值**宿主写的那段源码。 */
function evalExpr(text, scope) {
  const names = Object.keys(scope);
  const fn = new Function(...names, `return (${text});`);
  return fn(...names.map((n) => scope[n]));
}

const guardArg = hostFnSrc
  ? extractCallArgObject(hostFnSrc, HOST_FILE, "shouldReportMissingTerminal")
  : null;

/** 判据求值的作用域 —— web 用 `opts.signal`, PC 用 `ac.signal`, 两边都塞上。 */
const guardScope = (over = {}) => ({
  opts: { signal: { aborted: false } },
  ac: { signal: { aborted: false } },
  sawDone: false,
  sawCancel: false,
  sawFailed: false,
  shouldReportMissingTerminal: T.shouldReportMissingTerminal,
  ...over,
});

test("B4 收尾判据的 sawTerminal 位**必须**含 sawFailed (RC-W3 接线)", () => {
  assert.ok(guardArg, `抠不到 ${HOST_FILE} 里 shouldReportMissingTerminal 的实参`);
  assert.ok(
    /sawTerminal\s*:/.test(guardArg),
    "判据里没有 sawTerminal 排除项",
  );
  assert.ok(
    /sawFailed/.test(guardArg),
    "判据的 sawTerminal 不含 sawFailed ⇒ 见过失败帧后还会被当成「服务端关流」⇒ 白重连",
  );
});

test("B5 收尾判据: 见过失败帧 ⇒ **不**报「没有终态帧」", () => {
  assert.ok(guardArg, "抠不到判据实参");
  const decide = (over) =>
    evalExpr(`shouldReportMissingTerminal(${guardArg})`, guardScope(over));
  assert.equal(
    decide({ sawFailed: true }),
    false,
    "失败帧 ⇒ 这一轮有终态(失败) ⇒ 不许再报「流结束但没有终态帧」",
  );
  assert.equal(
    decide({}),
    true,
    "无终态帧 ⇒ 仍然要报 (判据没被改坏)",
  );
  assert.equal(
    decide({ sawCancel: true }),
    false,
    "用户取消 ⇒ 不许报 (对照组)",
  );
});

// ===========================================================================
// C 段 · 宿主层 (页面) —— 降级闭环的接线
// ===========================================================================

const uiSrc = repoSrc(UI_FILE);
const uiCode = repoCode(UI_FILE);

const resumeFn = extractFunction(uiCode, "handleResumeFailed", UI_FILE);

test("C0 宿主层抠得到降级处理函数 (抠不到 ⇒ 下面的断言都是假绿)", () => {
  assert.ok(resumeFn, `抠不到 handleResumeFailed (${UI_FILE})`);
});

test("C1 ★ RC-W4 读到 resumeFailed ⇒ 补拉 history (服务端那一轮可能已落库)", () => {
  assert.ok(resumeFn, "抠不到降级处理函数");
  assert.ok(
    /invalidateQueries/.test(resumeFn),
    "降级处理里没有 invalidateQueries ⇒ 屏幕上的内容永远停在半截",
  );
  assert.ok(
    /\[\s*"history"/.test(resumeFn),
    "补拉的不是 history ⇒ 拉不到本轮落库的结果",
  );
  assert.ok(
    /chatId/.test(resumeFn),
    "补拉没带 chatId ⇒ 拉的是别的会话",
  );
});

test("C2 ★ RC-W5 该消息落成 stalled (**不是**空内容)", () => {
  assert.ok(resumeFn, "抠不到降级处理函数");
  assert.ok(
    resumeFn.includes(STALLED_MARK),
    `降级处理里没有 ${STALLED_MARK} ⇒ 用户看不到「这一轮没接回来」`,
  );
  for (const bad of BLANK_MARKERS) {
    assert.ok(
      !resumeFn.includes(bad),
      `降级处理里有 ${bad} ⇒ 把已渲染的内容抹了 (降级要**保留**内容, 只标 stalled)`,
    );
  }
});

test("C3 降级是常态分支 ⇒ **不弹错** (G-4)", () => {
  assert.ok(resumeFn, "抠不到降级处理函数");
  for (const id of TOAST_IDS) {
    assert.ok(
      !resumeFn.includes(id),
      `降级处理里出现了 ${id} ⇒ 「接不回来」会弹错 (它是常态分支, 不许弹)`,
    );
  }
});

test("C4 降级后关掉流式态 (输入框恢复可用, 但这一行**留着**)", () => {
  assert.ok(resumeFn, "抠不到降级处理函数");
  assert.ok(
    resumeFn.includes(CLOSE_MARK),
    `降级处理里没有 ${CLOSE_MARK} ⇒ 流式态关不掉 (界面一直像在跑)`,
  );
});

test("C5 降级时渲染服务端给的快照 (有正文才渲染)", () => {
  assert.ok(resumeFn, "抠不到降级处理函数");
  assert.ok(
    /readServerSnapshot/.test(resumeFn),
    "降级处理没读服务端快照 ⇒ 服务端已有的内容白扔",
  );
});

test("C6 失败帧派给状态机 (判据只有一处: 共享层的 turn-session)", () => {
  assert.ok(
    uiSrc.includes(STATE_DISPATCH),
    `宿主层没有 ${STATE_DISPATCH} ⇒ 状态机不知道这一轮失败了`,
  );
});

test("C7 「吃一帧」那条路先判失败帧 ⇒ 走降级闭环", () => {
  const consume = extractFunction(uiCode, CONSUME_FN, UI_FILE);
  assert.ok(consume, `抠不到 ${CONSUME_FN} (${UI_FILE})`);
  const branch = extractIfBranch(consume, "isResumeFailedFrame(", UI_FILE);
  assert.ok(branch, `${CONSUME_FN} 里没有「见到失败帧」的分支`);
  assert.ok(
    branch.includes(CONSUME_HANDLER_MARK),
    `见到失败帧没有走降级处理 (${CONSUME_HANDLER_MARK}) ⇒ 认了但不做 (界面会一直像在跑)`,
  );
});

test("C7b 降级处理**真的被调到** (不是只判不理)", () => {
  const iFail = uiCode.indexOf("isResumeFailedFrame(");
  const iHandle = uiCode.indexOf("handleResumeFailed(");
  assert.ok(iFail >= 0, `${UI_FILE} 里没有判失败帧`);
  assert.ok(iHandle >= 0, `${UI_FILE} 里没有调 handleResumeFailed`);
  assert.ok(
    iHandle > iFail,
    "调降级处理必须排在判失败帧之后 (否则是「先判后理」的倒序接线)",
  );
});

test("C8 ⛔ 失败帧必须在状态机的「普通帧」分支**之前**被拦下", () => {
  const consume = extractFunction(uiCode, CONSUME_FN, UI_FILE);
  assert.ok(consume, `抠不到 ${CONSUME_FN} (${UI_FILE})`);
  const iFail = consume.indexOf("isResumeFailedFrame(chunk)");
  const iFrame = consume.indexOf('type: "frame"');
  assert.ok(iFail >= 0, `${CONSUME_FN} 里没有判失败帧`);
  assert.ok(iFrame >= 0, `${CONSUME_FN} 里没有普通帧派发`);
  assert.ok(
    iFail < iFrame,
    "⛔ 失败帧必须在普通帧分支**之前**拦下 —— 这一帧没有自己的 `id:` 行 ⇒ " +
      "读帧层给回的游标是**上一帧**的 ⇒ 状态机会把它判成「重复帧」直接丢掉 ⇒ " +
      "降级闭环永远不触发 (这一轮就白等)",
  );
});

// ===========================================================================
// D 段 · 两端漂移 (RC-W7)
// ===========================================================================

test("D1 ★ RC-W7 web/PC 两仓 src/lib/sse/** 逐文件 md5 相同", () => {
  const localDir = join(REPO, SHARED_DIR);
  const peerDir = join(PEER_REPO, SHARED_DIR);
  assert.ok(existsSync(localDir), `本仓的 ${SHARED_DIR} 不存在: ${localDir}`);
  assert.ok(
    existsSync(peerDir),
    `对端的 ${SHARED_DIR} 不存在: ${peerDir} (临时 worktree 里用 RC_PEER_REPO 指定)`,
  );
  const localFiles = readdirSync(localDir).filter((f) => f.endsWith(".ts")).sort();
  const peerFiles = readdirSync(peerDir).filter((f) => f.endsWith(".ts")).sort();
  assert.deepEqual(
    localFiles,
    peerFiles,
    "两端共享层的**文件清单**都不一样 ⇒ 有一端少抄/多抄了文件",
  );
  for (const f of localFiles) {
    assert.equal(
      md5(join(localDir, f)),
      md5(join(peerDir, f)),
      `两端 ${SHARED_DIR}/${f} 漂移了 (判据/文案必须逐字节相同)`,
    );
  }
});
