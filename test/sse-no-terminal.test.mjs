// [RC 轮 · RC-6] 「流结束但没有终态帧」⇒ 抛可识别错 ⇒ 走降级闭环 (**不弹错**)
//
// ---------------------------------------------------------------------------
// 派工单 RC-6 (F3c) 的五件事
// ---------------------------------------------------------------------------
//   · RC-W3  —— (RC-5 的前置) 终态判据对 `{resumeFailed:true}` 返回 true
//   · RC-W8  —— 非中止、非取消、无终态帧 ⇒ 抛 `STREAM_NO_TERMINAL`
//   · RC-W9  —— 用户取消 ⇒ **不**抛
//   · RC-W10 —— 正常终态 ⇒ **不**抛
//   · RC-W11 —— 该错误被降级处理器接住 ⇒ 补拉 history, **不**进通用错误弹窗
//
// ---------------------------------------------------------------------------
// 断言分三层 (共享层 / 流层 / 宿主层)
// ---------------------------------------------------------------------------
//   A 段 (共享层 `src/lib/sse/terminal.ts`) —— **行为**断言: 真的 import 进来跑。
//   B 段 (流层: 抛错的那一层) —— 把宿主源码里那段判据**原样求值**, 换不同的标志位
//     取值 ⇒ 拿到宿主真正会做的判断。⛔ 只扫源码会假绿 (「写了但没接上」)。
//   C 段 (宿主层: 页面) —— 降级闭环的**接线**: 判据必须是 catch 里的**第一个**分支,
//     分支里必须补拉 history, 且**不许**出现通用错误弹窗。
//
// 运行: node --test test/sse-no-terminal.test.mjs   (完全离线: 不连网、不渲染 React)
//
// ⚠️ RC-6 的判据/错误类住在共享层 ⇒ web 与 PC 两仓的 `src/lib/sse/terminal.ts`
//   必须**逐字节相同** (D1 段钉这一条; RC-W7 是下一批的正式断言编号)。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { makeTmpDir, writeModule } from "../scripts/lib/schedule-loader.mjs";
import { stripComments } from "../scripts/lib/strip-comments.mjs";
import { extractFunction } from "../scripts/lib/source-scan.mjs";

// ---------------------------------------------------------------------------
// 本仓的身份 (web / PC 两份测试只有这个块不同)
// ---------------------------------------------------------------------------
const END = "pc"; // web | pc
const PEER_DIR = "gacode-web"; // 对端仓目录名 (md5 比对用)
const HOST_FILE = "src/lib/chat-stream.ts"; // 流层: 抛错的那一层 (web = sendMessageStream)
const HOST_FN = "start"; // 流层的函数名
const UI_FILE = "src/routes/ChatDetail.tsx"; // 宿主层: 降级闭环在这
const TOAST_IDS = ["setStreamError"]; // 通用错误弹窗 (降级分支里不许出现)
const SHARED_TERMINAL = "src/lib/sse/terminal.ts"; // 共享层: 终态判据 + 错误类

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const PEER_REPO = process.env.RC_PEER_REPO
  ? process.env.RC_PEER_REPO
  : join(REPO, "..", PEER_DIR);
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");
const repoCode = (p) => stripComments(repoSrc(p), p);
const md5 = (p) => createHash("md5").update(readFileSync(p)).digest("hex");

// ---------------------------------------------------------------------------
// 加载共享层 (零 import ⇒ 转译加载器即可)
// ---------------------------------------------------------------------------
const dir = makeTmpDir("verify-sse-no-terminal");
const T = await import(writeModule(dir, "terminal", repoSrc(SHARED_TERMINAL)));

// ===========================================================================
// A 段 · 共享层 (行为断言)
// ===========================================================================

test("A1 ★ RC-W3 终态判据对 {resumeFailed:true} 返回 true (且不误判别的)", () => {
  assert.equal(
    T.isTerminalOrFailed({ resumeFailed: true }),
    true,
    "服务端给的失败帧 (resumeFailed) **也是终态** ⇒ 判据必须认它 (RC-W3)",
  );
  // 对照: 正常终态帧 (带 messageId 的 done) 也必须认。
  assert.equal(T.isTerminalOrFailed({ done: true, messageId: "m1" }), true);
  // 对照: 中途哨兵帧 ({done:true} 无 messageId) **不是**终态。
  assert.equal(
    T.isTerminalOrFailed({ done: true }),
    false,
    "中途哨兵帧不是轮次终态 (一轮里它会来好几次)",
  );
  assert.equal(T.isTerminalOrFailed({}), false);
  assert.equal(T.isTerminalOrFailed({ resumeFailed: false }), false);
  assert.equal(
    T.isTerminalOrFailed({ resumeFailed: "yes" }),
    false,
    "只认严格的 true (别的取值一律不当终态)",
  );
});

test("A2 ★ RC-W8 非中止、非取消、无终态帧 ⇒ 该报「流结束但没终态帧」", () => {
  assert.equal(
    T.shouldReportMissingTerminal({
      aborted: false,
      cancelled: false,
      sawTerminal: false,
    }),
    true,
    "服务端半路关流 (没终态帧) 必须被认出来 ⇒ 否则就是空气泡",
  );
});

test("A3 ★ RC-W9 用户取消 / 主动中止 ⇒ 不报 (取消不被当成失败)", () => {
  assert.equal(
    T.shouldReportMissingTerminal({
      aborted: false,
      cancelled: true,
      sawTerminal: false,
    }),
    false,
    "用户按了停止 ⇒ 不许当成「服务端关流」",
  );
  assert.equal(
    T.shouldReportMissingTerminal({
      aborted: true,
      cancelled: false,
      sawTerminal: false,
    }),
    false,
    "我们自己掐断的流 ⇒ 永远等不到终态帧, 不许当成失败",
  );
});

test("A4 ★ RC-W10 正常终态 ⇒ 不报 (不许误报)", () => {
  assert.equal(
    T.shouldReportMissingTerminal({
      aborted: false,
      cancelled: false,
      sawTerminal: true,
    }),
    false,
    "正常跑完 ⇒ 不许抛「没有终态帧」",
  );
});

test("A5 可识别错: code === 'STREAM_NO_TERMINAL' + 判别函数只认这一个码", () => {
  const e = new T.StreamEndedWithoutTerminal();
  assert.ok(e instanceof Error, "必须是个 Error (宿主层按错误路径接它)");
  assert.equal(e.code, "STREAM_NO_TERMINAL");
  assert.equal(T.isStreamNoTerminalError(e), true);
  assert.equal(T.isStreamNoTerminalError(new Error("流结束但没有终态帧")), false);
  assert.equal(T.isStreamNoTerminalError(null), false);
  assert.equal(T.isStreamNoTerminalError(undefined), false);
  assert.equal(T.isStreamNoTerminalError({ code: "OTHER" }), false);
  assert.equal(
    T.isStreamNoTerminalError({ message: "流结束但没有终态帧" }),
    false,
    "不许靠 message 文本认 (文案会变)",
  );
});

// ===========================================================================
// B 段 · 流层 (抛错的那一层) —— 把宿主源码里的判据**原样求值**
// ===========================================================================

/** 在测试里**原样求值**宿主写的那段源码。 */
function evalExpr(text, scope) {
  const names = Object.keys(scope);
  const fn = new Function(...names, `return (${text});`);
  return fn(...names.map((n) => scope[n]));
}

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

const hostCode = repoCode(HOST_FILE);
const hostFnSrc = extractFunction(hostCode, HOST_FN, HOST_FILE);

test("B0 流层能抠出抛错的那一段 (抠不到 ⇒ 下面的断言都是假绿)", () => {
  assert.ok(hostFnSrc, `抠不到 ${HOST_FN} (${HOST_FILE})`);
});

test("B1 流层用的是**共享层**的判据与错误类 (G-3: 一处真值)", () => {
  const src = repoSrc(HOST_FILE);
  assert.ok(
    /from\s+["'][^"']*sse\/terminal["']/.test(src),
    `${HOST_FILE} 没有从共享层 import 判据/错误类`,
  );
  assert.ok(
    /shouldReportMissingTerminal/.test(src),
    `${HOST_FILE} 没有调共享层的 shouldReportMissingTerminal`,
  );
  assert.ok(
    /StreamEndedWithoutTerminal/.test(src),
    `${HOST_FILE} 没有用共享层的 StreamEndedWithoutTerminal`,
  );
});

const guardArg = hostFnSrc
  ? extractCallArgObject(hostFnSrc, HOST_FILE, "shouldReportMissingTerminal")
  : null;

/** 判据求值的作用域 —— web 用 `opts.signal`, PC 用 `ac.signal`, 两边都塞上。 */
const guardScope = (over = {}) => ({
  opts: { signal: { aborted: false } },
  ac: { signal: { aborted: false } },
  sawDone: false,
  sawCancel: false,
  // 真的共享层那个函数 —— 宿主写的**实参**由宿主自己的变量算, 判定由共享层做。
  shouldReportMissingTerminal: T.shouldReportMissingTerminal,
  ...over,
});

test("B2 ★ RC-W8 流层的判据: 无终态帧 ⇒ 判「要报」⇒ 抛 STREAM_NO_TERMINAL", () => {
  assert.ok(guardArg, `抠不到 ${HOST_FILE} 里 shouldReportMissingTerminal 的实参`);
  const decide = (over) =>
    evalExpr(`shouldReportMissingTerminal(${guardArg})`, guardScope(over));
  assert.equal(
    decide({}),
    true,
    "无终态帧 ⇒ 必须判「要报」⇒ 抛 STREAM_NO_TERMINAL (否则就是空气泡)",
  );
});

test("B3 ★ RC-W9 流层的判据: 用户取消 / 主动中止 ⇒ 判「不报」", () => {
  assert.ok(guardArg, "抠不到判据实参");
  const decide = (over) =>
    evalExpr(`shouldReportMissingTerminal(${guardArg})`, guardScope(over));
  assert.equal(
    decide({ sawCancel: true }),
    false,
    "收到过取消帧 ⇒ 不许报 (取消被当成失败)",
  );
  assert.equal(
    decide({
      opts: { signal: { aborted: true } },
      ac: { signal: { aborted: true } },
    }),
    false,
    "用户主动中止 ⇒ 不许报 (我们自己掐断的流永远等不到终态帧)",
  );
});

test("B4 ★ RC-W10 流层的判据: 见过轮次终态帧 ⇒ 判「不报」", () => {
  assert.ok(guardArg, "抠不到判据实参");
  const decide = (over) =>
    evalExpr(`shouldReportMissingTerminal(${guardArg})`, guardScope(over));
  assert.equal(
    decide({ sawDone: true }),
    false,
    "正常跑完 ⇒ 不许抛「没有终态帧」 (误报)",
  );
});

test("B5 ★ RC-W9 流层的判据**显式**带上了「取消 / 中止」这两个排除项", () => {
  assert.ok(guardArg, "抠不到判据实参");
  assert.ok(
    /cancelled\s*:/.test(guardArg),
    "判据里没有 cancelled 排除项 ⇒ 用户取消会被当成「服务端关流」",
  );
  assert.ok(
    /aborted\s*:/.test(guardArg),
    "判据里没有 aborted 排除项 ⇒ 用户主动中止会被当成失败",
  );
});

test("B6 ★ RC-W10 流层的判据**显式**带上了「终态帧」这个排除项", () => {
  assert.ok(guardArg, "抠不到判据实参");
  assert.ok(
    /sawTerminal\s*:/.test(guardArg),
    "判据里没有 sawTerminal 排除项 ⇒ 正常跑完也会被误报",
  );
  assert.ok(
    /sawDone/.test(guardArg),
    "判据里的终态位必须真的来自 sawDone (不许写死)",
  );
});

test("B7 ★ RC-W8 流层真的抛 STREAM_NO_TERMINAL (且排在判据之后)", () => {
  assert.ok(hostFnSrc, "抠不到流层源码");
  assert.ok(
    /throw\s+new\s+StreamEndedWithoutTerminal\s*\(/.test(hostFnSrc),
    `${HOST_FILE} 没有抛 StreamEndedWithoutTerminal (⇒ 断链被静默吞掉 ⇒ 空气泡)`,
  );
  const iGuard = hostFnSrc.indexOf("shouldReportMissingTerminal");
  const iThrow = hostFnSrc.indexOf("throw new StreamEndedWithoutTerminal");
  assert.ok(iGuard >= 0, "流层没有判据");
  assert.ok(
    iThrow > iGuard,
    "抛错必须排在判据之后 (否则是无条件抛 ⇒ 正常终态也会报错)",
  );
});

// ===========================================================================
// C 段 · 宿主层 (页面) —— 降级闭环的接线
// ===========================================================================

const uiSrc = repoSrc(UI_FILE);
const uiCode = repoCode(UI_FILE);

/**
 * 抠出「含指定标记的那个 catch 子句」, 并把它拆成:
 *   · catchText  —— catch 子句全文
 *   · condText   —— catch 里**第一条 if 语句**的判据
 *   · branchText —— 那条 if 的 then 分支全文
 *   · branchEnd  —— 该分支在 catchText 里的结束位置
 */
function findCatchBranch(src, fileName, marker) {
  const isTsx = fileName.endsWith(".tsx");
  const sf = ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.ES2022,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  let out = null;
  const visit = (node) => {
    if (out) return;
    if (ts.isCatchClause(node)) {
      const text = node.getText(sf);
      if (!text.includes(marker)) return;
      // catch 里的第一条 **if** 语句 (前面允许有 const / log 之类的语句)。
      const stmt = node.block.statements.find((s) => ts.isIfStatement(s));
      const isIf = !!stmt;
      const branchText = isIf ? stmt.thenStatement.getText(sf) : null;
      out = {
        catchText: text,
        condText: isIf ? stmt.expression.getText(sf) : null,
        branchText,
        branchEnd: branchText ? text.indexOf(branchText) + branchText.length : -1,
      };
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return out;
}

const catchInfo = findCatchBranch(uiCode, UI_FILE, "isStreamNoTerminalError");

test("C0 宿主层的 catch 里认得出 STREAM_NO_TERMINAL", () => {
  assert.ok(catchInfo, `抠不到含 isStreamNoTerminalError 的 catch (${UI_FILE})`);
});

test("C1 ★ RC-W11 STREAM_NO_TERMINAL 由 catch 的**第一个**分支接住 (判据不许被改坏)", () => {
  assert.ok(catchInfo, "抠不到 catch 分支");
  assert.equal(
    (catchInfo.condText || "").replace(/\s+/g, " "),
    "isStreamNoTerminalError(err)",
    "catch 的第一个分支的判据必须**恰好**是 isStreamNoTerminalError(err) (⇒ 这个错必须被第一个分支接住)",
  );
});

test("C2 ★ RC-W11 降级分支补拉历史, 且**不**进通用错误弹窗", () => {
  assert.ok(catchInfo && catchInfo.branchText, "抠不到降级分支");
  const branch = catchInfo.branchText;
  assert.ok(
    /invalidateQueries/.test(branch),
    "降级分支没有补拉历史 (⇒ 屏幕上的内容永远停在半截)",
  );
  assert.ok(
    /\[\s*"history"/.test(branch),
    "降级分支补拉的不是 history (⇒ 拉不到本轮落库的结果)",
  );
  for (const id of TOAST_IDS) {
    assert.ok(
      !new RegExp(`\\b${id}\\b`).test(branch),
      `降级分支里出现了 ${id} ⇒ 断链会弹错 (降级是常态分支, 不许弹错)`,
    );
  }
  // 通用错误分支必须排在降级分支**之后** (否则这个错先被通用分支吃掉)。
  for (const id of TOAST_IDS) {
    const at = catchInfo.catchText.indexOf(`${id}(`);
    assert.ok(at >= 0, `catch 里找不到通用错误分支 ${id} (⇒ 断言失去对照)`);
    assert.ok(
      at > catchInfo.branchEnd,
      `通用错误分支 ${id} 排在降级分支之前 ⇒ STREAM_NO_TERMINAL 会先进通用分支弹错`,
    );
  }
});

// ===========================================================================
// D 段 · 两端漂移 (安全网 —— RC-W7 是下一批的正式断言编号)
// ===========================================================================

test("D1 web/PC 两仓 src/lib/sse/terminal.ts md5 相同 (RC-6 的判据住在共享层)", () => {
  const local = join(REPO, SHARED_TERMINAL);
  const peer = join(PEER_REPO, SHARED_TERMINAL);
  assert.ok(existsSync(local), `本仓的 terminal.ts 不存在: ${local}`);
  assert.ok(
    existsSync(peer),
    `对端的 terminal.ts 不存在: ${peer} (临时 worktree 里用 RC_PEER_REPO 指定)`,
  );
  assert.equal(
    md5(local),
    md5(peer),
    "两端 terminal.ts 漂移了 (判据/错误类必须逐字节相同)",
  );
});
