// [RC 轮 · RC-7] 端侧重连状态机 (退避 + 预算 + park + jitter)
//
// ---------------------------------------------------------------------------
// 为什么要这个断言 (派工单 RC-7)
// ---------------------------------------------------------------------------
//   2026-10-31 实测: web/PC 断线后**只重连一次、无退避、失败后一次性 refetch
//   且不轮询** ⇒ 网络抖一下 (地铁 / 电梯 / 弱网) 这一轮就白跑。
//   安卓是**唯一完整实现** (`SseReconnectRunner.kt`) ⇒ 本轮把它翻成 TypeScript。
//
//   本文件钉九件事:
//     · RC-W12 —— `createReconnectDecision` 是**纯函数** (同 state ⇒ 同 action)
//     · RC-W13 —— 退避序列 = 1000, 2000, 4000, …, 30000 (封顶)
//     · RC-W14 —— jitter 落在 ±20% 内, 且注入 `rand` 后可确定复现
//     · RC-W15 —— offline ⇒ `budgetUsed` 不增长 (不烧预算)
//     · RC-W16 —— `budgetUsed >= 60` ⇒ park/finish, **不**返回 attempt
//     · RC-W17 —— `attempt` 永不减少 (跨 100 次决策仍单调) —— **双 LLM 的守卫**
//     · RC-W18 —— 重连请求带 `Last-Event-ID` 且**不带**新的 message body
//     · RC-W19 —— 降级轮询间隔 3s、上限 60s、超时后停
//     · RC-W20 —— web/PC 两仓 `src/lib/sse/reconnect.ts` md5 相同
//
// ---------------------------------------------------------------------------
// 为什么断言分三层 (共享层 / 流层 / 宿主层)
// ---------------------------------------------------------------------------
//   A 段 (共享层 `src/lib/sse/reconnect.ts`) —— 纯决策函数的**行为**断言。
//   A' 段 (执行器 `runReconnectFlow`)        —— 端到端跑一遍闭环 (端口全注入, 不碰网络)。
//   B 段 (宿主层) —— **接线**断言: 把宿主源码里那几段**真实源码文本**抠出来,
//     在测试里**原样求值** ⇒ 拿到宿主真正会发出去的请求 (body + 头)。
//     (只做源码扫描的话, 「写了但没接上」会假绿 —— 这里不这么干。)
//
//   为什么被测对象是 .ts 而测试是 .mjs:
//     Node ESM 既不认 "@/lib/..." 别名, 也不做扩展名补全 ⇒ 直接 import 会
//     ERR_MODULE_NOT_FOUND。这里复用仓库已有的转译加载器
//     (scripts/lib/schedule-loader.mjs), 跟其余测试同一套手法。
//
//   运行: node --test test/sse-reconnect.test.mjs   (完全离线: 不连网、不渲染 React)
//
//   ⚠️ RC-W20 需要读到**对端仓**的文件:
//     默认按同级的兄弟目录找 (…/gacode-web ↔ …/gacode-electron);
//     在临时 worktree 里跑时用 `RC_PEER_REPO=<对端仓路径>` 指定。

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
const HOST_FILE = "src/lib/chat-stream.ts"; // 宿主层「发起 + 续传」那条 fetch 所在文件
const HOST_FN = "runStream"; // 宿主层函数名
const UI_FILE = "src/routes/ChatDetail.tsx"; // 宿主层 UI 文件 (重连块在这)
const UI_CALL = "start"; // 宿主层发起/续传调用名

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const PEER_REPO = process.env.RC_PEER_REPO
  ? process.env.RC_PEER_REPO
  : join(REPO, "..", PEER_DIR);
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");
const repoCode = (p) => stripComments(repoSrc(p), p);
const md5 = (p) => createHash("md5").update(readFileSync(p)).digest("hex");

// ---------------------------------------------------------------------------
// 加载共享层 (零依赖 ⇒ 转译加载器即可)
// ---------------------------------------------------------------------------
const dir = makeTmpDir("verify-sse-reconnect");
writeModule(dir, "turn-key-header", repoSrc("src/lib/sse/turn-key-header.ts"));
const R = await import(
  writeModule(dir, "reconnect", repoSrc("src/lib/sse/reconnect.ts"))
);

// `buildResumeHeaders` (真的那份) —— RC-W18 要验「续传路带 Last-Event-ID」,
// 不能拿桩函数糊弄。
if (END === "web") {
  writeModule(dir, "api-base", repoSrc("src/lib/api-base.ts"));
  writeModule(dir, "notifications", repoSrc("src/lib/notifications.ts"));
  writeModule(dir, "notification-stream", repoSrc("src/lib/notification-stream.ts"), {
    rewriteImports: [
      ["api-base", "./api-base.mjs"],
      ["notifications", "./notifications.mjs"],
    ],
  });
} else {
  writeModule(
    dir,
    "notifications-sse",
    `export class SseFrameParser { push() { return []; } flush() { return null; } }`,
  );
  writeModule(
    dir,
    "rich-events",
    `export function normalizeRichEvent(e) { return { event: e }; }
export function normalizeRichEvents(es) { return { events: es, skipped: [] }; }`,
  );
}
const { buildResumeHeaders } = await import(
  writeModule(dir, "chat-sse", repoSrc("src/lib/chat-sse.ts"), {
    rewriteImports:
      END === "web"
        ? [["notification-stream", "./notification-stream.mjs"], ["sse/turn-key-header", "./turn-key-header.mjs"]]
        : [
            ["notifications-sse", "./notifications-sse.mjs"],
            ["rich-events", "./rich-events.mjs"],
            ["sse/turn-key-header", "./turn-key-header.mjs"],
          ],
  })
);
const { buildChatStreamHeaders } = await import(
  writeModule(dir, "client-id", repoSrc("src/lib/sse/client-id.ts"))
);

// ===========================================================================
// A 段 · 共享层纯决策函数
// ===========================================================================

test("A0 共享层常量 = 安卓那份 (派工单 RC-7 的表)", () => {
  assert.equal(R.DEFAULT_MAX_ATTEMPTS, 60);
  assert.equal(R.DEFAULT_BASE_DELAY_MS, 1000);
  assert.equal(R.DEFAULT_CAP_DELAY_MS, 30000);
  assert.equal(R.DEFAULT_SUSPEND_TIMEOUT_MS, 5 * 60 * 1000);
  assert.equal(R.DEFAULT_POLL_INTERVAL_MS, 3000);
  assert.equal(R.DEFAULT_POLL_TIMEOUT_MS, 60000);
});

test("A1 ★ RC-W12 createReconnectDecision 是纯函数 (同 state ⇒ 同 action)", () => {
  const state = {
    attempt: 3,
    budgetUsed: 3,
    backoffPending: false,
    lastOutcome: { kind: "connection_lost" },
  };
  const input = { online: true, rand: () => 0.5 };
  const snapshot = structuredClone(state);
  const a = R.createReconnectDecision(state, input);
  const b = R.createReconnectDecision(state, input);
  assert.deepEqual(a, b, "同一个 state + 同一个 input ⇒ 必须给出同一个 action");
  assert.deepEqual(state, snapshot, "决策函数不许改传入的 state (纯函数)");
  // ⚠️ 上面那条 deepEqual 必须比的是**含退避时长**的 action ——
  //   否则「两次都返回不含时长的东西」也能假绿。
  assert.equal(a.action.kind, "backoff");
  assert.equal(typeof a.action.delayMs, "number");
});

test("A2 ★ RC-W13 退避序列 = 1000, 2000, 4000, …, 30000 (封顶)", () => {
  // rand = 0.5 ⇒ 抖动因子 = 0.8 + 0.4*0.5 = 1.0 ⇒ 拿到的就是裸退避序列。
  const rand = () => 0.5;
  const expected = [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000];
  const direct = expected.map((_, i) => R.computeBackoffDelayMs(i + 1, { rand }));
  assert.deepEqual(direct, expected, "裸退避算错了");

  // 状态机里**真实走出来**的序列 (每次失败 ⇒ 退避 ⇒ 再试) 必须一样。
  let state = R.createReconnectState();
  const delays = [];
  for (let i = 0; i < 16; i++) {
    const step = R.createReconnectDecision(state, { online: true, rand });
    if (step.action.kind === "backoff") delays.push(step.action.delayMs);
    state = step.next;
    if (step.action.kind === "attempt") {
      state = { ...state, lastOutcome: { kind: "connection_lost" } };
    }
  }
  assert.deepEqual(delays, expected, "状态机走出来的退避序列不对");
});

test("A3 ★ RC-W14 jitter 落在 ±20% 内, 且注入 rand 后可确定复现", () => {
  const rawOf = (attempt) => Math.min(30000, 1000 * 2 ** (attempt - 1));
  for (const attempt of [1, 2, 3, 5, 8]) {
    const raw = rawOf(attempt);
    const lo = R.computeBackoffDelayMs(attempt, { rand: () => 0 });
    const mid = R.computeBackoffDelayMs(attempt, { rand: () => 0.5 });
    const hi = R.computeBackoffDelayMs(attempt, { rand: () => 1 });
    assert.equal(mid, raw, `attempt=${attempt}: rand=0.5 ⇒ 抖动因子=1.0 ⇒ 应当等于裸退避`);
    assert.ok(
      lo >= raw * 0.8 - 1 && lo <= raw * 0.8 + 1,
      `attempt=${attempt}: 下界越界 (期望 ≈${raw * 0.8}, 实际 ${lo})`,
    );
    assert.ok(
      hi >= raw * 1.2 - 1 && hi <= raw * 1.2 + 1,
      `attempt=${attempt}: 上界越界 (期望 ≈${raw * 1.2}, 实际 ${hi})`,
    );
    for (let i = 0; i < 200; i++) {
      const d = R.computeBackoffDelayMs(attempt, { rand: Math.random });
      assert.ok(
        d >= raw * 0.8 - 1 && d <= raw * 1.2 + 1,
        `attempt=${attempt}: 抖动越界 ${d} (裸退避 ${raw})`,
      );
    }
  }
  // 可确定复现: 同一个 rand ⇒ 同一个 delay。
  const rand = () => 0.37;
  assert.equal(
    R.computeBackoffDelayMs(3, { rand }),
    R.computeBackoffDelayMs(3, { rand }),
    "同一个注入的 rand 必须给出同一个 delay (否则断言不可靠)",
  );
});

test("A4 ★ RC-W15 offline ⇒ budgetUsed 不增长 (也不发 attempt)", () => {
  const state = {
    attempt: 5,
    budgetUsed: 5,
    backoffPending: false,
    lastOutcome: { kind: "connection_lost" },
  };
  const step = R.createReconnectDecision(state, { online: false });
  assert.equal(step.action.kind, "wait_network", "没网 ⇒ 等网络, 不许发请求");
  assert.equal(step.next.budgetUsed, 5, "没网时预算不许增长 (否则电梯里就烧完预算)");
  assert.equal(step.next.attempt, 5);
  // 网络恢复后 ⇒ 预算还是 5 (离线期间没被烧掉)。
  const after = R.createReconnectDecision(step.next, { online: true, rand: () => 0.5 });
  assert.equal(after.next.budgetUsed, 5, "恢复网络后预算应该还是 5");
});

test("A5 ★ RC-W16 预算用尽 (≥60) ⇒ park/finish, 绝不返回 attempt", () => {
  const state = {
    attempt: 60,
    budgetUsed: 60,
    backoffPending: false,
    lastOutcome: { kind: "connection_lost" },
  };
  // ⚠️ 不传 maxAttempts ⇒ 用默认的 60 (常量被改坏时这里要能红)。
  const step = R.createReconnectDecision(state, { online: true, rand: () => 0.5 });
  assert.ok(
    step.action.kind === "park" || step.action.kind === "finish",
    `预算用尽却返回了 ${step.action.kind} ⇒ 会无限重试`,
  );
  assert.notEqual(step.action.kind, "attempt", "预算用尽了还发请求 ⇒ 无限重试");
  assert.equal(step.next.budgetUsed, 60);
});

test("A6 ★ RC-W17 attempt 永不减少 (跨 100 次决策仍单调; park 唤醒也不许重置)", () => {
  // ① park 被唤醒 ⇒ attempt **继续涨** (不许重置为 1), 只有预算清零。
  const parked = {
    attempt: 12,
    budgetUsed: 12,
    backoffPending: false,
    lastOutcome: { kind: "connection_lost" },
  };
  const woken = R.createReconnectDecision(parked, {
    online: true,
    parkWoken: true,
    rand: () => 0.5,
  });
  assert.equal(woken.action.kind, "attempt");
  assert.equal(
    woken.action.attempt,
    13,
    "park 唤醒后 attempt 必须继续涨 (重置成 1 ⇒ 退化成重新提问 ⇒ 双 LLM)",
  );
  assert.equal(woken.next.budgetUsed, 1, "park 唤醒 ⇒ 预算清零换一个新窗口");

  // ② 跨 100 次决策, attempt **不后退**, 且每次 attempt 的编号严格 +1。
  //    (退避那一步 attempt 不变是正常的 —— 计数只在**真的发请求**时 +1。)
  let state = R.createReconnectState();
  const seen = [];
  const attemptNos = [];
  for (let i = 0; i < 100; i++) {
    const step = R.createReconnectDecision(state, {
      online: true,
      parkWoken: i === 50 ? true : null,
      rand: () => 0.5,
    });
    state = step.next;
    seen.push(state.attempt);
    if (step.action.kind === "attempt") {
      attemptNos.push(step.action.attempt);
      state = { ...state, lastOutcome: { kind: "connection_lost" } };
    }
  }
  for (let i = 1; i < seen.length; i++) {
    assert.ok(
      seen[i] >= seen[i - 1],
      `attempt 在第 ${i} 步倒退了: ${seen[i - 1]} → ${seen[i]} (⇒ 重新提问 ⇒ 双 LLM)`,
    );
  }
  assert.ok(attemptNos.length >= 20, `100 步里只发了 ${attemptNos.length} 次请求`);
  for (let i = 1; i < attemptNos.length; i++) {
    assert.equal(
      attemptNos[i],
      attemptNos[i - 1] + 1,
      `attempt 编号不连续: ${attemptNos[i - 1]} → ${attemptNos[i]} (重置 ⇒ 重新提问 ⇒ 双 LLM)`,
    );
  }

  // ③ 连 5 次后 attempt === 5 (验收判据 2: 不许重置为 1)。
  let s2 = R.createReconnectState();
  let attempts = 0;
  for (let i = 0; i < 20 && attempts < 5; i++) {
    const step = R.createReconnectDecision(s2, { online: true, rand: () => 0.5 });
    s2 = step.next;
    if (step.action.kind === "attempt") {
      attempts += 1;
      s2 = { ...s2, lastOutcome: { kind: "connection_lost" } };
    }
  }
  assert.equal(attempts, 5);
  assert.equal(s2.attempt, 5, "连 5 次后 attempt 必须 === 5 (不许重置为 1)");
});

test("A7 ★ RC-W19 降级轮询: 间隔 3s、上限 60s、超时后停 (不许无限轮询)", () => {
  assert.equal(R.DEFAULT_POLL_INTERVAL_MS, 3000);
  assert.equal(R.DEFAULT_POLL_TIMEOUT_MS, 60000);
  let s = { elapsedMs: 0, polls: 0 };
  const intervals = [];
  for (let i = 0; i < 100; i++) {
    const d = R.createPollFallbackDecision(s);
    if (d.kind === "stop") break;
    intervals.push(d.nextPollAtMs - s.elapsedMs);
    s = { elapsedMs: d.nextPollAtMs, polls: d.polls };
  }
  assert.deepEqual(
    intervals,
    new Array(20).fill(3000),
    "轮询间隔必须是 3s",
  );
  assert.equal(s.polls, 20, "60s / 3s = 20 次 ⇒ 第 21 次必须停");
  assert.equal(s.elapsedMs, 60000);
  assert.equal(
    R.createPollFallbackDecision({ elapsedMs: 60000, polls: 20 }).kind,
    "stop",
    "到了 60s 上限必须停",
  );
  assert.equal(
    R.createPollFallbackDecision({ elapsedMs: 60001, polls: 20 }).kind,
    "stop",
  );
});

// ===========================================================================
// A' 段 · 执行器 (端到端跑一遍闭环; 端口全注入 ⇒ 不碰网络)
// ===========================================================================

test("A8' [G18] 退避改成等恢复信号: 不再干等 sleep, 有信号就立刻重试", async () => {
  const attempts = [];
  const sleeps = [];
  const signalWaits = [];
  await R.runReconnectFlow(
    {
      isOnline: () => true,
      // 第一次退避给信号 (模拟「解锁 -> app 回前台」), 之后不给.
      awaitSignal: async (timeoutMs) => {
        signalWaits.push(timeoutMs);
        return signalWaits.length === 1;
      },
      runOnce: async (attempt) => {
        attempts.push(attempt);
        return { kind: "connection_lost" };
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    },
    { maxAttempts: 3, rand: () => 0.5, pollIntervalMs: null },
  );
  assert.deepEqual(attempts, [1, 2, 3], "重试次数不该因为退避改实现而变化");
  assert.ok(signalWaits.length >= 2, "退避期间必须去问恢复信号 (否则就是干等)");
  assert.ok(signalWaits.includes(1000), "第一次退避的等待上限必须是 1s");
  assert.equal(sleeps.length, 0, "退避不再走 sleep (改成等信号)");
});

test("A8 流层: 网络抖动 ⇒ 自动重连 ≥ 1 次, 退避是 1s→2s (验收判据 1)", async () => {
  const attempts = [];
  const delays = [];
  const outcome = await R.runReconnectFlow(
    {
      isOnline: () => true,
      awaitSignal: async (timeoutMs) => {
        // [G18] backoff no longer sleeps; it waits for a recovery signal with a timeout.
        // Only record the backoff window (<=30s); the park window (5min) is not a backoff.
        if (timeoutMs <= 30000) delays.push(timeoutMs);
        return false;
      },
      runOnce: async (attempt) => {
        attempts.push(attempt);
        // ⚠️ 安全阀: 「删掉预算上限」的变异 (M-RC-W16) 会让这里**死循环** ⇒
        //   主动抛出去, 让断言红 —— 绝不让变异跑批挂死 (⛔ 不许无限重试)。
        if (attempts.length > 20) {
          throw new Error("重连没有预算上限 ⇒ 无限重试 (变异 M-RC-W16)");
        }
        return { kind: "connection_lost", reason: "断了" };
      },
      sleep: async () => {},
    },
    // pollIntervalMs: null ⇒ 这一条只测重连阶段 (轮询阶段见 A10)。
    { maxAttempts: 3, rand: () => 0.5, pollIntervalMs: null },
  );
  assert.ok(
    attempts.length >= 2,
    `只重连了 ${attempts.length} 次 ⇒ 网络抖一下就放弃 (验收判据 1 要求 ≥ 1 次重连)`,
  );
  assert.deepEqual(attempts, [1, 2, 3]);
  assert.deepEqual(delays, [1000, 2000], "退避序列必须是 1s → 2s");
  assert.equal(outcome.kind, "connection_lost");
});

test("A9 铁律三: 用户停 = 真停 (不重连、不轮询)", async () => {
  const attempts = [];
  const ticks = [];
  const outcome = await R.runReconnectFlow(
    {
      isOnline: () => true,
      awaitSignal: async () => false,
      shouldStop: () => true,
      runOnce: async (attempt) => {
        attempts.push(attempt);
        return { kind: "connection_lost" };
      },
      sleep: async () => {},
      onPollTick: () => {
        ticks.push(1);
      },
    },
    { maxAttempts: 3, rand: () => 0.5 },
  );
  assert.equal(attempts.length, 0, "用户已经叫停了 ⇒ 不许再发 attempt");
  assert.equal(ticks.length, 0, "用户已经叫停了 ⇒ 不许再轮询");
  assert.equal(outcome.kind, "connection_lost");
});

test("A10 流层: 续传最终失败 ⇒ 每 3s 轮询一次历史, 60s 后停 (验收判据 8)", async () => {
  const sleeps = [];
  let ticks = 0;
  await R.runReconnectFlow(
    {
      isOnline: () => true,
      awaitSignal: async () => false,
      runOnce: async () => ({ kind: "connection_lost" }),
      sleep: async (ms) => {
        sleeps.push(ms);
        // ⚠️ 安全阀: 「删掉轮询上限」的变异会让这里死循环 ⇒ 主动抛出去, 让断言红。
        if (sleeps.length > 50) {
          throw new Error("轮询没有上限 ⇒ 无限轮询 (变异 M-RC-W19)");
        }
      },
      onPollTick: () => {
        ticks += 1;
      },
    },
    { maxAttempts: 1, rand: () => 0.5 },
  );
  assert.equal(ticks, 20, `轮询了 ${ticks} 次 (期望 20 = 60s / 3s)`);
  assert.equal(sleeps.length, 20);
  assert.ok(
    sleeps.every((ms) => ms === 3000),
    `轮询间隔必须是 3s (实际: ${JSON.stringify(sleeps.slice(0, 5))})`,
  );
});

// ===========================================================================
// B 段 · 宿主层 —— 请求层 (RC-W18 的**行为**断言)
// ===========================================================================

/** 在测试里**原样求值**宿主写的那段源码 ⇒ 拿到宿主真正会发出去的东西。 */
function evalExpr(text, scope) {
  const names = Object.keys(scope);
  const fn = new Function(...names, `return (${text});`);
  return fn(...names.map((n) => scope[n]));
}

/** 抠出 `fetch(url, { ..., body: <expr> })` 里的 body 表达式源码。 */
function extractFetchBodyExpr(src, fileName) {
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
      node.expression.text === "fetch"
    ) {
      const arg = node.arguments[1];
      if (arg && ts.isObjectLiteralExpression(arg)) {
        for (const p of arg.properties) {
          if (!ts.isPropertyAssignment(p) || !p.name) continue;
          if (p.name.getText(sf).replace(/["']/g, "") === "body") {
            found = p.initializer.getText(sf);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

/** 抠出 `buildChatStreamHeaders({...})` 的**实参源码**。 */
function extractBuilderArg(src, fileName) {
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
      node.expression.text === "buildChatStreamHeaders"
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isObjectLiteralExpression(arg)) found = arg.getText(sf);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

const hostFnSrc = extractFunction(repoCode(HOST_FILE), HOST_FN, HOST_FILE);

test("B0 宿主层能抠出发起/续传那条 fetch (抠不到 ⇒ 下面的断言都是假绿)", () => {
  assert.ok(hostFnSrc, `抠不到 ${HOST_FN} (${HOST_FILE})`);
});

// 宿主层的求值作用域 —— web 与 PC 的变量名不一样。
const hostScope =
  END === "web"
    ? {
        isResume: true,
        jwt: "tok",
        message: "问题原文",
        opts: {
          resume: { cursor: "42" },
          cursor: "42",
          image_urls: [],
          attached_file_ids: [],
          knowledge_refs: [],
        },
        JSON,
        buildResumeHeaders,
        // ★ [P3 · 2026-11-12] 宿主现在多传一个 clientCapabilities (契约附录 订正 24 §3)
        //   —— 求值实参源码时必须有这个绑定, 否则 ReferenceError。
        clientCapabilityHeader: () => null,
        CLIENT_ID_WEB: "web",
      }
    : {
        opts: { resume: { cursor: "42" }, cursor: "42", body: { message: "问题原文" } },
        accessToken: "tok",
        JSON,
        buildResumeHeaders,
        // ★ [P3 · 2026-11-12] 宿主现在多传一个 clientCapabilities (契约附录 订正 24 §3)
        //   —— 求值实参源码时必须有这个绑定, 否则 ReferenceError。
        clientCapabilityHeader: () => null,
        CLIENT_ID_PC: "pc",
      };

test("B1 ★ RC-W18 续传路的 body **空** (不带新的 message body)", () => {
  const bodyExpr = extractFetchBodyExpr(hostFnSrc, HOST_FILE);
  assert.ok(bodyExpr, `抠不到 ${HOST_FILE} 里 fetch 的 body 表达式`);
  const body = evalExpr(bodyExpr, hostScope);
  assert.equal(
    body,
    undefined,
    `续传路的 body 不为空 (实际: ${JSON.stringify(body)}) ⇒ 服务端会当成新轮次 ⇒ 重复提问`,
  );
});

test("B2 对照: 发起路的 body **带** message (证明 B1 不是恒真)", () => {
  const bodyExpr = extractFetchBodyExpr(hostFnSrc, HOST_FILE);
  const startScope =
    END === "web"
      ? { ...hostScope, isResume: false }
      : { ...hostScope, opts: { ...hostScope.opts, resume: null } };
  const body = evalExpr(bodyExpr, startScope);
  assert.equal(typeof body, "string", "发起路的 body 必须是 JSON 字符串");
  assert.ok(
    body.includes("问题原文"),
    `发起路的 body 里没有用户消息 (实际: ${body})`,
  );
});

test("B3 ★ RC-W18 续传路的头带 Last-Event-ID (契约 L-35)", () => {
  const argText = extractBuilderArg(hostFnSrc, HOST_FILE);
  assert.ok(argText, `抠不到 ${HOST_FILE} 里的 buildChatStreamHeaders 调用`);
  const headers = buildChatStreamHeaders(evalExpr(argText, hostScope));
  assert.equal(
    headers["Last-Event-ID"],
    "42",
    `续传路没带 Last-Event-ID (实际头: ${JSON.stringify(headers)})`,
  );
});

// ===========================================================================
// B' 段 · 宿主层 —— 接线断言 (重连走的是**续传**, 不是重新提问)
// ===========================================================================

const uiSrc = repoSrc(UI_FILE);
const uiCode = repoCode(UI_FILE);

/** 抠出源码里所有 `name(...)` / `obj.name(...)` 调用 (含实参与对象属性源码)。 */
function extractCalls(src, fileName, name) {
  const isTsx = fileName.endsWith(".tsx");
  const sf = ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.ES2022,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out = [];
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      const base = callee.includes(".")
        ? callee.slice(callee.lastIndexOf(".") + 1)
        : callee;
      if (base === name) {
        const rec = { callee, args: [], props: {} };
        for (const a of node.arguments) rec.args.push(a.getText(sf));
        const arg0 = node.arguments[0];
        if (arg0 && ts.isObjectLiteralExpression(arg0)) {
          for (const p of arg0.properties) {
            if (!ts.isPropertyAssignment(p) || !p.name) continue;
            rec.props[p.name.getText(sf).replace(/["']/g, "")] =
              p.initializer.getText(sf);
          }
        }
        out.push(rec);
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return out;
}

test("B4 宿主层的重连走**续传** (resumeMode = true 排在 ctrl.reconnect() 之前)", () => {
  const idxResume = uiCode.indexOf("resumeMode = true");
  const idxReconnect = uiCode.indexOf("ctrl.reconnect()");
  assert.ok(idxResume >= 0, "宿主层没有 resumeMode = true ⇒ 重连会走成新轮次");
  assert.ok(idxReconnect >= 0, "宿主层没有 ctrl.reconnect()");
  assert.ok(
    idxResume < idxReconnect,
    "resumeMode = true 必须排在 ctrl.reconnect() 之前 (否则那一发是重新提问)",
  );
});

test("B5 「只重连一次」的一次性标志已经没了 (状态机接管)", () => {
  assert.equal(
    uiCode.indexOf("reconnectTried"),
    -1,
    "「reconnectTried」还在 ⇒ 状态机没接管 (还是只重连一次)",
  );
});

test("B6 宿主层调的是**共享层**的状态机 (G-3: 一处真值)", () => {
  assert.ok(
    /runReconnectFlow/.test(uiSrc),
    "宿主层没有调共享状态机 runReconnectFlow",
  );
  assert.ok(
    /from\s+["'][^"']*lib\/sse\/reconnect["']/.test(uiSrc),
    "宿主层没有从共享层 import 重连状态机",
  );
});

test("B7 ★ RC-W18 续传分支**不重新提问** (web: 发空消息; PC: resume 由 resumeMode 分流)", () => {
  if (END === "web") {
    const calls = extractCalls(uiCode, UI_FILE, UI_CALL);
    assert.ok(calls.length > 0, `抠不到 ${UI_CALL} 调用`);
    const empty = calls.filter((c) => c.args[1] === '""');
    assert.ok(
      empty.length >= 1,
      "续传分支没有把消息发成空串 ⇒ 重连会把用户消息再投喂一次 (重复提问)",
    );
  } else {
    const calls = extractCalls(uiCode, UI_FILE, "start").filter(
      (c) => c.callee === "stream.start",
    );
    assert.ok(calls.length > 0, "抠不到 stream.start 调用");
    const resumed = calls.filter((c) => (c.props.resume || "").includes("resumeMode"));
    assert.ok(
      resumed.length >= 1,
      "stream.start 的 resume 没有跟着 resumeMode 走 ⇒ 重连会建新轮次",
    );
  }
});

// ===========================================================================
// C 段 · 两端漂移 (RC-W20)
// ===========================================================================

test("C1 ★ RC-W20 web/PC 两仓 src/lib/sse/reconnect.ts md5 相同", () => {
  const local = join(REPO, "src/lib/sse/reconnect.ts");
  const peer = join(PEER_REPO, "src/lib/sse/reconnect.ts");
  assert.ok(existsSync(local), `本仓的 reconnect.ts 不存在: ${local}`);
  assert.ok(
    existsSync(peer),
    `对端的 reconnect.ts 不存在: ${peer} (临时 worktree 里用 RC_PEER_REPO 指定)`,
  );
  assert.equal(
    md5(local),
    md5(peer),
    "两端 reconnect.ts 漂移了 (web/PC 必须逐字节相同)",
  );
});
