// [RC 轮 · RC-12] 跨端并发提问 (409 TURN_ALREADY_RUNNING) ⇒ **不弹错** ⇒ 转跨端 attach
//
// ---------------------------------------------------------------------------
// 派工单 RC-12 (§819-886) 的三件事
// ---------------------------------------------------------------------------
//   · RC-W21 —— 识别函数**只认** `code/status === 'TURN_ALREADY_RUNNING'`
//                (消息文本里含这串字**不算**命中)
//   · RC-W22 —— 命中 ⇒ **不弹错** + **触发跨端 attach** (转成旁观者)
//   · RC-W23 —— 审批 409 (带 `decidedBy`) ⇒ 行为与改动前一致 (**不被吞**)
//
// ---------------------------------------------------------------------------
// 断言分三层 (共享层 / 流层 / 宿主层)
// ---------------------------------------------------------------------------
//   A 段 (共享层 `src/lib/sse/concurrent.ts`) —— **行为**断言: 真 import 进来跑。
//   B 段 (流层: 造错误的那一层) —— 把宿主源码里的「错误信封 → 错误对象」那段
//     **原样求值**, 喂真响应体 ⇒ 拿到宿主真正会造出来的那个错误对象,
//     再喂给共享层的识别函数。⛔ 只扫源码会假绿 (「写了但没接上」)。
//   C 段 (宿主层: 页面) —— 接线的**语义**断言: 命中 ⇒ 不弹错 + 真的会重跑进场接回。
//   D 段 —— 两端 `src/lib/sse/concurrent.ts` md5 相同 (共享层不许各写各的)。
//
// 运行: node --test test/sse-concurrent.test.mjs   (完全离线: 不连网、不渲染 React)
//
// ⚠️ 「跨端并发提问」的判据住在共享层 ⇒ web 与 PC 两仓的
//   `src/lib/sse/concurrent.ts` 必须**逐字节相同** (D1 段钉这一条)。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { makeTmpDir, writeModule } from "../scripts/lib/schedule-loader.mjs";
import { stripComments } from "../scripts/lib/strip-comments.mjs";
import { extractDecl } from "../scripts/lib/source-scan.mjs";

// ---------------------------------------------------------------------------
// 本仓的身份 (web / PC 两份测试只有这个块不同)
// ---------------------------------------------------------------------------
const END = "pc"; // web | pc
const PEER_DIR = "gacode-web"; // 对端仓目录名 (md5 比对用)
const HOST_FILE = "src/lib/chat-stream.ts"; // 流层: 造错误的那一层
const ERR_CLASS = "SseHttpError"; // 流层的错误类
const UI_FILE = "src/routes/ChatDetail.tsx"; // 宿主层: 接线在这
const TOAST_IDS = ["setStreamError"]; // 通用错误弹窗 (并发分支里不许出现)
const SHARED = "src/lib/sse/concurrent.ts"; // 共享层: 识别判据
const STREAM_HAS_ONERROR = true; // PC 的流层有 opts.onError (会弹 banner); web 没有

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
const dir = makeTmpDir("verify-sse-concurrent");
const C = await import(writeModule(dir, "concurrent", repoSrc(SHARED)));

/** 服务端真实会回的两种响应体 (unified-api/src/plugins/errorHandler.js)。 */
const CONCURRENT_BODY = {
  ok: false,
  error: { code: "TURN_ALREADY_RUNNING", message: "这一轮正在另一台设备上运行" },
};
const APPROVAL_BODY = {
  ok: false,
  error: { code: "APPROVAL_ALREADY_DECIDED", message: "审批已被裁决" },
  decidedBy: "pc",
  decidedAt: "2026-10-31T00:00:00.000Z",
};

// ===========================================================================
// A 段 · 共享层 (行为断言)
// ===========================================================================

test("A1 ★ RC-W21 只认 code/status === 'TURN_ALREADY_RUNNING'", () => {
  assert.ok(
    C.readConcurrentTurnError({ code: "TURN_ALREADY_RUNNING" }),
    "code 恰好等于白名单值 ⇒ 必须命中",
  );
  assert.ok(
    C.readConcurrentTurnError({ status: "TURN_ALREADY_RUNNING" }),
    "status 恰好等于白名单值 ⇒ 必须命中",
  );
  assert.ok(
    C.readConcurrentTurnError({
      code: "TURN_ALREADY_RUNNING",
      message: "随便什么文案",
    }),
    "带 message 也必须命中 (判据是**码**, 不是文案)",
  );
});

test("A1b ★ RC-W21 消息文本里含这串字 **不算** 命中 (判据不许退化成文本匹配)", () => {
  assert.equal(
    C.readConcurrentTurnError({ message: "TURN_ALREADY_RUNNING" }),
    null,
    "message 里含白名单串**不算**命中 (文案会变, 且别的错也可能提到它)",
  );
  assert.equal(
    C.readConcurrentTurnError({
      status: 409,
      message: "TURN_ALREADY_RUNNING: 这一轮正在跑",
    }),
    null,
    "连状态码 409 + 文本命中也不算 (状态码是数字, 白名单值是字符串)",
  );
  assert.equal(
    C.readConcurrentTurnError({ code: "TURN_ALREADY_RUNNING_X" }),
    null,
    "前缀相同的别的码不算命中 (必须**恰好**等于)",
  );
  assert.equal(
    C.readConcurrentTurnError({ code: "turn_already_running" }),
    null,
    "大小写不同不算命中 (白名单是精确值)",
  );
  assert.equal(
    C.readConcurrentTurnError({ code: "TURN_ALREADY_RUNNING " }),
    null,
    "多一个空格不算命中",
  );
});

test("A1c ★ RC-W21 别的 409 / 别的码 一律走原路径", () => {
  for (const code of [
    "APPROVAL_ALREADY_DECIDED",
    "TURN_NOT_FOUND",
    "SESSION_BUSY",
    "",
  ]) {
    assert.equal(
      C.readConcurrentTurnError({ code }),
      null,
      `code='${code}' 不许被当成并发提问 (白名单只有 TURN_ALREADY_RUNNING 一个值)`,
    );
  }
  assert.equal(C.readConcurrentTurnError(null), null);
  assert.equal(C.readConcurrentTurnError(undefined), null);
  assert.equal(C.readConcurrentTurnError("TURN_ALREADY_RUNNING"), null);
  assert.equal(C.readConcurrentTurnError(409), null);
});

test("A2 ★ RC-W23 审批 409 (带 decidedBy) ⇒ 不许被当成并发提问", () => {
  assert.equal(
    C.readConcurrentTurnError({
      code: "TURN_ALREADY_RUNNING",
      decidedBy: "pc",
    }),
    null,
    "带 decidedBy 的 409 = 「审批已被别人裁决」⇒ 必须原样弹错, 不许被并发分支吞掉",
  );
  assert.equal(
    C.readConcurrentTurnError({
      status: "TURN_ALREADY_RUNNING",
      decidedBy: "web",
      decidedAt: "2026-10-31T00:00:00.000Z",
    }),
    null,
    "同上 (decidedAt 也在)",
  );
  // 反过来: 没有 decidedBy 的 ⇒ 就是并发提问 (别把判据写死成「一律 409 不认」)。
  assert.ok(
    C.readConcurrentTurnError({ code: "TURN_ALREADY_RUNNING" }),
    "没有 decidedBy ⇒ 就是并发提问",
  );
});

test("A3 错误信封两种形状都要认 (error 是字符串 / error 是对象)", () => {
  const a = C.readErrorEnvelope(APPROVAL_BODY);
  assert.equal(a.code, "APPROVAL_ALREADY_DECIDED");
  assert.equal(a.decidedBy, "pc");
  assert.equal(a.decidedAt, "2026-10-31T00:00:00.000Z");

  const b = C.readErrorEnvelope({
    ok: false,
    error: "APPROVAL_ALREADY_DECIDED",
    decidedBy: "pc",
  });
  assert.equal(b.code, "APPROVAL_ALREADY_DECIDED", "error 是字符串的形状也要认");
  assert.equal(b.decidedBy, "pc");

  const c = C.readErrorEnvelope(null);
  assert.equal(c.code, null);
  assert.equal(c.decidedBy, null);
  const d = C.readErrorEnvelope("nope");
  assert.equal(d.code, null);
});

test("A4 便捷判据 isConcurrentTurnError 与 readConcurrentTurnError 同源", () => {
  assert.equal(C.isConcurrentTurnError({ code: "TURN_ALREADY_RUNNING" }), true);
  assert.equal(C.isConcurrentTurnError({ message: "TURN_ALREADY_RUNNING" }), false);
  assert.equal(
    C.isConcurrentTurnError({ code: "TURN_ALREADY_RUNNING", decidedBy: "pc" }),
    false,
  );
});

// ===========================================================================
// B 段 · 流层 (造错误的那一层) —— 把宿主源码里的那段**原样求值**
// ===========================================================================

/** 在测试里**原样求值**宿主写的那段源码。 */
function evalExpr(text, scope) {
  const names = Object.keys(scope);
  const fn = new Function(...names, `return (${text});`);
  return fn(...names.map((n) => scope[n]));
}

function parse(fileName, src) {
  const isTsx = fileName.endsWith(".tsx");
  return ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.ES2022,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

/** 抠出「读错误信封」那一句的变量名与实参名 (宿主可能改名字 ⇒ 别写死)。 */
function findEnvelopeRead(src, fileName) {
  const sf = parse(fileName, src);
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "readErrorEnvelope" &&
      node.arguments.length >= 1
    ) {
      const decl = node.parent;
      if (decl && ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name)) {
        found = {
          varName: decl.name.text,
          argName: node.arguments[0].getText(sf),
        };
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

/**
 * 抠出「用信封造错误」那个 new 表达式的三个实参源码。
 *
 * ⚠️ 同一个错误类在文件里可能有**多处**构造 (如 request() 那条老路径) ⇒
 *   只认「第三个实参里引用了信封变量」的那一处 (⇒ 一定是 !res.ok 那条路)。
 */
function findErrorConstruction(src, fileName, clsName, envelopeVarName) {
  const sf = parse(fileName, src);
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === clsName &&
      node.arguments.length >= 3
    ) {
      const extraText = node.arguments[2].getText(sf);
      if (!extraText.includes(`${envelopeVarName}.`)) {
        ts.forEachChild(node, visit);
        return;
      }
      found = {
        statusText: node.arguments[0].getText(sf),
        msgText: node.arguments[1].getText(sf),
        extraText,
      };
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

const hostSrc = repoSrc(HOST_FILE);
const hostCode = repoCode(HOST_FILE);
const envelopeRead = findEnvelopeRead(hostCode, HOST_FILE);
const construction = envelopeRead
  ? findErrorConstruction(hostCode, HOST_FILE, ERR_CLASS, envelopeRead.varName)
  : null;

/**
 * 照宿主源码**原样**造一个错误对象 (真响应体进去) ——
 * 这就是宿主在 !res.ok 时真正会抛出去的那个东西。
 */
function buildHostError(body) {
  assert.ok(envelopeRead, `抠不到 ${HOST_FILE} 里 readErrorEnvelope 的调用`);
  assert.ok(construction, `抠不到 ${HOST_FILE} 里 new ${ERR_CLASS}(...) 的构造`);
  const scope = {
    [envelopeRead.varName]: C.readErrorEnvelope(body),
    [envelopeRead.argName]: body,
  };
  const extra = evalExpr(construction.extraText, scope);
  return {
    status: 409,
    message: "API Error: 409 Conflict",
    code: extra.code ?? null,
    decidedBy: extra.decidedBy ?? null,
    body: extra.body ?? null,
  };
}

test("B0 流层抠得到「读信封」与「造错误」两段 (抠不到 ⇒ 下面的断言都是假绿)", () => {
  assert.ok(envelopeRead, `抠不到 ${HOST_FILE} 的 readErrorEnvelope 调用`);
  assert.ok(construction, `抠不到 ${HOST_FILE} 的 new ${ERR_CLASS}(...)`);
});

test("B1 流层的错误类真的把 extra.code 落到 this.code (判据才有码可认)", () => {
  const clsSrc = extractDecl(hostCode, ERR_CLASS, HOST_FILE);
  assert.ok(clsSrc, `抠不到错误类 ${ERR_CLASS}`);
  assert.ok(
    /this\.code\s*=\s*extra\??\.code/.test(clsSrc),
    `${ERR_CLASS} 没有把 extra.code 落到 this.code (⇒ 识别函数永远认不出来)`,
  );
  assert.ok(
    /this\.decidedBy\s*=\s*extra\??\.decidedBy/.test(clsSrc),
    `${ERR_CLASS} 没有把 extra.decidedBy 落到 this.decidedBy (⇒ 审批 409 会被误吞)`,
  );
});

test("B2 ★ RC-W21 流层真能造出「带并发码」的错误 ⇒ 共享层认得出来", () => {
  const err = buildHostError(CONCURRENT_BODY);
  assert.equal(err.code, "TURN_ALREADY_RUNNING", "错误对象上必须带机器可读码");
  assert.ok(
    C.readConcurrentTurnError(err),
    "宿主真造出来的那个错误 ⇒ 共享层必须认得 (⇒ 才轮得到「不弹错 + 转 attach」)",
  );
});

test("B3 ★ RC-W23 流层造出的「审批 409」不被共享层当成并发 (⇒ 审批路径不被吞)", () => {
  const err = buildHostError(APPROVAL_BODY);
  assert.equal(err.decidedBy, "pc", "错误对象上必须带 decidedBy");
  assert.equal(
    C.readConcurrentTurnError(err),
    null,
    "审批 409 (带 decidedBy) ⇒ 不许被当成并发提问 (⇒ 审批的提示语还在)",
  );
});

test("B4 流层的错误 message 逐字不变 (既有 `msg.includes('409')` 的匹配不能破)", () => {
  assert.ok(construction, "抠不到错误构造");
  assert.ok(
    /res\.status/.test(construction.statusText),
    "状态码实参必须还是 res.status",
  );
  assert.ok(
    /res\.status/.test(construction.msgText),
    "message 实参里必须还带 res.status (既有调用方的 409 pattern match 不能破)",
  );
  assert.ok(
    !/TURN_ALREADY_RUNNING/.test(construction.msgText),
    "message 里不许塞机器可读码 (码走字段, 不走文案)",
  );
});

// ===========================================================================
// C 段 · 宿主层 (页面) —— 接线的语义
// ===========================================================================

const uiSrc = repoSrc(UI_FILE);
const uiCode = repoCode(UI_FILE);

/** 抠出「判据里含 readConcurrentTurnError 的那个 if 分支」。 */
function findConcurrentBranch(src, fileName) {
  const sf = parse(fileName, src);
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (ts.isIfStatement(node)) {
      const condNode = node.expression ?? node.condition;
      const cond = condNode ? condNode.getText(sf) : "";
      if (cond.includes("readConcurrentTurnError") && node.thenStatement) {
        found = {
          condText: cond,
          branchText: node.thenStatement.getText(sf),
          // 分支是不是 if/else 链的一环 (⇒ 命中后**不会**掉进后面的通用错误分支)
          inChain:
            !!node.parent &&
            ts.isIfStatement(node.parent) &&
            node.parent.elseStatement === node,
          // 独立 if (在 catch 块里) ⇒ 必须自己 return, 否则会掉进通用错误分支
          standaloneInCatch:
            !!node.parent &&
            ts.isBlock(node.parent) &&
            !!node.parent.parent &&
            ts.isCatchClause(node.parent.parent),
          node,
          sf,
        };
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

/** 抠出「进场接回」那个 useEffect 的依赖数组。 */
function findAttachEffectDeps(src, fileName) {
  const sf = parse(fileName, src);
  let deps = null;
  const visit = (node) => {
    if (deps) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "useEffect" &&
      node.arguments.length >= 2
    ) {
      const cbText = node.arguments[0].getText(sf);
      if (cbText.includes("attachLiveRef.current = true")) {
        deps = node.arguments[1].getText(sf);
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return deps;
}

const branch = findConcurrentBranch(uiCode, UI_FILE);

test("C0 宿主层认得出「跨端并发提问」这个分支", () => {
  assert.ok(branch, `抠不到含 readConcurrentTurnError 的 if (${UI_FILE})`);
});

test("C1 ★ RC-W22 命中 ⇒ 必须触发跨端 attach (复用进场接回那条路)", () => {
  assert.ok(branch, "抠不到并发分支");
  assert.ok(
    /setAttachEpoch/.test(branch.branchText),
    "并发分支没有触发跨端 attach (⇒ 命中了却什么都不做 ⇒ 用户看到的是「没反应」)",
  );
  const deps = findAttachEffectDeps(uiCode, UI_FILE);
  assert.ok(deps, "抠不到进场接回的 useEffect 依赖数组");
  assert.ok(
    /attachEpoch/.test(deps),
    "进场接回的依赖数组里没有 attachEpoch (⇒ bump 了也不会重跑 ⇒ 根本没接回来)",
  );
});

test("C2 ★ RC-W22 命中 ⇒ **不弹错** (也不许掉进通用错误分支)", () => {
  assert.ok(branch, "抠不到并发分支");
  for (const id of TOAST_IDS) {
    assert.ok(
      !new RegExp(`\\b${id}\\b`).test(branch.branchText),
      `并发分支里出现了 ${id} ⇒ 跨端并发会弹错 (这是常态分支, 不许弹)`,
    );
  }
  // 到不了通用错误分支: 要么是 if/else 链的一环, 要么自己 return。
  const terminates = branch.inChain || /\breturn\b/.test(branch.branchText);
  assert.ok(
    terminates,
    "并发分支既不在 if/else 链里, 也没有 return ⇒ 会掉进后面的通用错误分支弹错",
  );
});

test("C3 ★ RC-W23 并发分支的判据必须是识别函数 (不许写成裸 409)", () => {
  assert.ok(branch, "抠不到并发分支");
  assert.ok(
    /readConcurrentTurnError/.test(branch.condText),
    "判据里没有 readConcurrentTurnError",
  );
  assert.ok(
    !/\b409\b/.test(branch.condText),
    "判据里出现了裸 409 ⇒ 审批 409 也会被转成 attach (审批提示语被吞)",
  );
});

test("C4 宿主层用了**共享层**的识别函数 (G-3: 一处真值)", () => {
  assert.ok(
    /from\s+["'][^"']*sse\/concurrent["']/.test(uiSrc),
    `${UI_FILE} 没有从共享层 import readConcurrentTurnError`,
  );
});

test("C5 流层不许为「并发提问」调 onError (PC 的 onError 会弹 banner)", () => {
  if (!STREAM_HAS_ONERROR) {
    // web 的流层没有 onError (错误直接抛给页面) ⇒ 这一条不适用。
    assert.ok(
      !/\bonError\s*[:?]/.test(hostCode),
      "web 的流层不该有 onError",
    );
    return;
  }
  assert.ok(
    /readConcurrentTurnError/.test(hostCode),
    `${HOST_FILE} 没有用共享层的识别函数 (⇒ 并发提问会被当成真错误弹 banner)`,
  );
  assert.ok(
    /!readConcurrentTurnError\(/.test(hostCode),
    `${HOST_FILE} 没有把 onError 调用挡在识别函数后面 (⇒ 并发提问会弹 banner)`,
  );
});

// ===========================================================================
// D 段 · 两端漂移 (共享层必须逐字节相同)
// ===========================================================================

test("D1 web/PC 两仓 src/lib/sse/concurrent.ts md5 相同 (判据住在共享层)", () => {
  const local = join(REPO, SHARED);
  const peer = join(PEER_REPO, SHARED);
  assert.ok(existsSync(local), `本仓的 concurrent.ts 不存在: ${local}`);
  assert.ok(
    existsSync(peer),
    `对端的 concurrent.ts 不存在: ${peer} (临时 worktree 里用 RC_PEER_REPO 指定)`,
  );
  assert.equal(
    md5(local),
    md5(peer),
    "两端 concurrent.ts 漂移了 (识别判据必须逐字节相同)",
  );
});
