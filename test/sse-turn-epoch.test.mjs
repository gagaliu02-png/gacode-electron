// [RC 轮 · RC-3] 进程级 epoch (`X-Turn-Epoch`) —— 端侧记住 + 重连时带回去
//
// ---------------------------------------------------------------------------
// 派工单 RC-3 (批 C 端侧) 的断言
// ---------------------------------------------------------------------------
//   RC-W1 —— 端侧**保存** epoch 并在重连时**带上** (web / PC)
//   RC-W2 —— 未知 `resumeStatus` ⇒ **不抛异常**、按失败处理 (默认文案)
//   RC-W7 —— web 与 PC 的 `src/lib/sse/**` md5 **逐文件**相同
//
//   背景 (契约订正 19): 服务端的**进程级** epoch —— 服务端**重启就变**。
//     · `X-Turn-Key`   认「**哪一轮**」 (turnKey) —— 跨请求稳定, 与进程无关;
//     · `X-Turn-Epoch` 认「**哪个进程**」 (epoch) —— 服务端重启就变。
//   ⇒ 端侧重连时把上次的 epoch 带回去 ⇒ 服务端一比就知道「我重启过了」
//     ⇒ 回 `stale_epoch` (「服务端重启, 这一轮没了」),
//       而不是笼统的 `not_running` (端侧只能干瞪眼)。
//
//   ⛔ 老服务端没有这个头 ⇒ 读出来是 null ⇒ 端侧**不带**这个头
//     ⇒ 服务端「带了且不等才判失败」⇒ 行为与改动前逐字一致。
//
// ---------------------------------------------------------------------------
// 断言分四层
// ---------------------------------------------------------------------------
//   A 段 (共享层 `src/lib/sse/turn-key-header.ts`) —— **行为**断言: 真 import 跑。
//   B 段 (续传请求头 `src/lib/chat-sse.ts`) —— **行为**断言: 真 import 跑。
//   C 段 (端侧保存 + 回带) —— 共享层状态机 + 流层 + 宿主层的**接线**。
//   D 段 (两端漂移) —— 共享层相关文件逐文件 md5 相同 (RC-W7)。
//
// 运行: node --test test/sse-turn-epoch.test.mjs   (完全离线: 不连网、不渲染 React)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { makeTmpDir, writeModule } from "../scripts/lib/schedule-loader.mjs";
import { stripComments } from "../scripts/lib/strip-comments.mjs";
import { extractFunction } from "../scripts/lib/source-scan.mjs";

// ---------------------------------------------------------------------------
// 本仓的身份 (web / PC 两份测试只有这个块不同)
// ---------------------------------------------------------------------------
const END = "pc"; // web | pc
const PEER_DIR = "gacode-web"; // 对端仓目录名 (md5 比对用)
const HOST_FILE = "src/lib/chat-stream.ts"; // 流层: 读响应头的 epoch + 续传时带回去 (PC)
const HOST_FN = "start"; // 流层的函数名
const UI_FILE = "src/routes/ChatDetail.tsx"; // 宿主层: 记住 epoch 的地方
const RESUME_HEADER_FILE = "src/lib/chat-sse.ts"; // 续传请求头的构造点
const SHARED_TURN_KEY = "src/lib/sse/turn-key-header.ts"; // 共享层: epoch 响应头判据
const SHARED_TURN_RECORD = "src/lib/sse/turn-record.ts"; // 共享层: 轮次记录 (存 epoch)
const SHARED_TURN_SESSION = "src/lib/sse/turn-session.ts"; // 共享层: 状态机 (记 epoch)
const SHARED_SEQ_GUARD = "src/lib/sse/seq-guard.ts"; // 共享层: seq 判据
const SHARED_TERMINAL = "src/lib/sse/terminal.ts"; // 共享层: 终态判据
const SHARED_DEGRADE = "src/lib/sse/degrade.ts"; // 共享层: 降级计划
/**
 * `chat-sse.ts` 的**间接**依赖 —— 这里用桩件替掉 (本测试只关心
 * `buildResumeHeaders` 这一个纯函数, 不该把整个 SSE 读帧器拖进来)。
 *
 * ⚠️ 两端名字不同 (web: notification-stream / PC: notifications-sse) ⇒ 用常量区分。
 */
const STUB_MODULES = [
  ["notifications-sse", "export class SseFrameParser {}\n"],
  [
    "rich-events",
    "export function normalizeRichEvent(){return null;}\n" +
      "export function normalizeRichEvents(){return [];}\n",
  ],
];

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const PEER_REPO = process.env.RC_PEER_REPO
  ? process.env.RC_PEER_REPO
  : join(REPO, "..", PEER_DIR);
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");
const repoCode = (p) => stripComments(repoSrc(p), p);
const md5 = (p) => createHash("md5").update(readFileSync(p)).digest("hex");

// ---------------------------------------------------------------------------
// 加载共享层 + 续传请求头
// ---------------------------------------------------------------------------
const dir = makeTmpDir("verify-sse-turn-epoch");

const K = await import(writeModule(dir, "turn-key-header", repoSrc(SHARED_TURN_KEY)));
const R = await import(writeModule(dir, "turn-record", repoSrc(SHARED_TURN_RECORD)));
await import(writeModule(dir, "seq-guard", repoSrc(SHARED_SEQ_GUARD)));
const T = await import(writeModule(dir, "terminal", repoSrc(SHARED_TERMINAL)));
await import(
  writeModule(dir, "degrade", repoSrc(SHARED_DEGRADE), {
    rewriteImports: [
      ["seq-guard", "./seq-guard.mjs"],
      ["turn-record", "./turn-record.mjs"],
    ],
  })
);
const SS = await import(
  writeModule(dir, "turn-session", repoSrc(SHARED_TURN_SESSION), {
    rewriteImports: [
      ["seq-guard", "./seq-guard.mjs"],
      ["turn-record", "./turn-record.mjs"],
      ["terminal", "./terminal.mjs"],
      ["degrade", "./degrade.mjs"],
    ],
  })
);

// 续传请求头: chat-sse.ts 的间接依赖用桩件替掉。
for (const [name, src] of STUB_MODULES) {
  await import(writeModule(dir, name, src));
}
const CS = await import(
  writeModule(dir, "chat-sse", repoSrc(RESUME_HEADER_FILE), {
    rewriteImports: [
      ...STUB_MODULES.map(([name]) => [name, `./${name}.mjs`]),
      ["sse/turn-key-header", "./turn-key-header.mjs"],
    ],
  })
);

// ===========================================================================
// A 段 · 共享层: epoch 响应头 (行为断言)
// ===========================================================================

test("A1 epoch 头名固定为 x-turn-epoch (全端一个字符串)", () => {
  assert.equal(
    K.TURN_EPOCH_HEADER,
    "x-turn-epoch",
    "头名必须**全端一个字符串** ⇒ 免得 web 写 X-Turn-Epoch、PC 写 x-turn-epoch 而手抄错一个字母",
  );
  assert.notEqual(
    K.TURN_EPOCH_HEADER,
    K.TURN_KEY_HEADER,
    "epoch 头与 turnKey 头**不是同一个** (认进程 vs 认轮次)",
  );
});

test("A2 响应头里有 epoch ⇒ 读出来 (去首尾空白)", () => {
  const h = (v) => ({ get: (n) => (n === "x-turn-epoch" ? v : null) });
  assert.equal(K.readTurnEpochHeader(h("ep-1")), "ep-1");
  assert.equal(K.readTurnEpochHeader(h("  ep-2  ")), "ep-2");
  assert.equal(
    K.readTurnEpochHeader(h("  ")),
    null,
    "空白的头 ⇒ 当「服务端没给」(⇒ 端侧不带这个头)",
  );
});

test("A3 服务端没给这个头 ⇒ null (**不猜、不补默认值**)", () => {
  assert.equal(K.readTurnEpochHeader(null), null);
  assert.equal(K.readTurnEpochHeader(undefined), null);
  assert.equal(K.readTurnEpochHeader({}), null);
  assert.equal(
    K.readTurnEpochHeader({ get: () => null }),
    null,
    "老服务端没有这个头 ⇒ null (⇒ 端侧不带 ⇒ 服务端不判 stale)",
  );
});

test("A4 头对象有问题 ⇒ **不抛**, 当「服务端没给」", () => {
  const boom = {
    get: () => {
      throw new Error("headers 坏了");
    },
  };
  let out = "not-called";
  assert.doesNotThrow(() => {
    out = K.readTurnEpochHeader(boom);
  });
  assert.equal(out, null, "头对象抛异常 ⇒ 当「服务端没给」, 不许把整个流搞崩");
});

test("A5 ⛔ 不校验格式 (端上拿到什么就用什么)", () => {
  const h = (v) => ({ get: () => v });
  assert.equal(
    K.readTurnEpochHeader(h("2026-10-31T12:00:00.123Z")),
    "2026-10-31T12:00:00.123Z",
    "端侧**不许**猜 epoch 的格式 ⇒ 服务端换了生成方式, 端侧也认得出",
  );
});

test("A6 ★ RC-W2 未知 resumeStatus ⇒ **不抛异常** + 有文案 (按失败处理)", () => {
  // 服务端以后会加新的 `resumeStatus` 取值 ⇒ 老端侧**不许**崩、不许漏判。
  //   (RC-3 引入的 `stale_epoch` 就是这种「新取值」的代表。)
  let label = null;
  assert.doesNotThrow(() => {
    label = T.readResumeStatusLabel("brand_new_code_2099");
  });
  assert.ok(
    typeof label === "string" && label.length > 0,
    "未知 resumeStatus ⇒ 不许抛、不许空文案 (空文案 = 界面上什么都没有)",
  );
});

// ===========================================================================
// B 段 · 续传请求头 (行为断言)
// ===========================================================================

test("B1 ★ RC-W1 有 epoch ⇒ 续传请求**带上** X-Turn-Epoch", () => {
  const h = CS.buildResumeHeaders("123", "ep-1");
  assert.equal(
    h["x-turn-epoch"],
    "ep-1",
    "端侧记住了 epoch 就必须带回去 ⇒ 服务端才能判 stale_epoch",
  );
  assert.equal(
    h["Last-Event-ID"],
    "123",
    "带 epoch **不许**影响游标头 (两个头各自独立)",
  );
});

test("B2 ★ RC-W1 没有 epoch ⇒ **一个字节都不加** (老服务端路径逐字不变)", () => {
  for (const v of [null, undefined, "", "   "]) {
    const h = CS.buildResumeHeaders("123", v);
    assert.equal(
      h["x-turn-epoch"],
      undefined,
      `epoch=${JSON.stringify(v)} 时不许带这个头 ⇒ 服务端「带了且不等才判失败」, ` +
        "带空串会让服务端把「老端侧」误判成「进程重启过」",
    );
  }
});

test("B3 无游标时走「按无游标接回」, epoch 照样带", () => {
  const h = CS.buildResumeHeaders(null, "ep-9");
  assert.equal(h["X-Resume-Turn"], "1", "游标非法/缺失 ⇒ X-Resume-Turn: 1 (L-35)");
  assert.equal(h["Last-Event-ID"], undefined);
  assert.equal(h["x-turn-epoch"], "ep-9");
  // 非法游标绝不能被发出去 (服务端会回 bad_last_event_id, L-38)。
  const bad = CS.buildResumeHeaders("12abc", null);
  assert.equal(bad["Last-Event-ID"], undefined, "非法游标不许外发");
  assert.equal(bad["X-Resume-Turn"], "1");
});

// ===========================================================================
// C 段 · 端侧保存 + 回带 (接线)
// ===========================================================================

test("C1 轮次记录里有 epoch 字段; 老记录归一成 null", () => {
  const fresh = R.emptyTurnRecord("s1", 0);
  assert.equal(
    fresh.epoch,
    null,
    "新记录还没拿到 epoch ⇒ null (⇒ 重连时不带这个头)",
  );
  const old = R.normalizeTurnRecord({ sessionId: "s1", seq: "3" }, "s1", 0);
  assert.ok(old, "老记录必须能归一 (不许整个丢掉)");
  assert.equal(
    old.epoch,
    null,
    "老记录没有这个键 ⇒ null (⇒ 行为与改动前逐字一致)",
  );
  const withEpoch = R.normalizeTurnRecord({ sessionId: "s1", epoch: "ep-7" }, "s1", 0);
  assert.equal(withEpoch.epoch, "ep-7", "有 epoch 的记录必须原样保留");
});

test("C2 状态机收到 epoch 事件 ⇒ 记进轮次记录 (端侧**保存**)", () => {
  let s = SS.createTurnSession("s1", null, 0);
  assert.equal(s.record.epoch, null);
  s = SS.transition(s, { type: "epoch", epoch: "ep-3" }, 1);
  assert.equal(
    s.record.epoch,
    "ep-3",
    "epoch 事件必须落进记录 ⇒ 下次重连才带得回去",
  );
  // 没变 ⇒ 不动记录 (免得每帧都写 IndexedDB)。
  const before = s.record.updatedAt;
  const s2 = SS.transition(s, { type: "epoch", epoch: "ep-3" }, 2);
  assert.equal(s2.record.updatedAt, before, "epoch 没变 ⇒ 不该触发落盘");
});

test("C3 流层从**响应头**读 epoch 并回调出去 (判据在共享层)", () => {
  const src = repoSrc(HOST_FILE);
  assert.ok(
    /from\s+["'][^"']*sse\/turn-key-header["']/.test(src),
    `${HOST_FILE} 没有从共享层 import epoch 头判据`,
  );
  assert.ok(
    /readTurnEpochHeader/.test(src),
    `${HOST_FILE} 没有用共享层的 readTurnEpochHeader`,
  );
  assert.ok(
    /onTurnEpoch/.test(src),
    `${HOST_FILE} 没有把 epoch 回调出去 (宿主层要靠它记住 epoch)`,
  );
});

test("C4 ★ RC-W1 流层把 epoch 交给续传请求头 (不是硬编码 null)", () => {
  const code = repoCode(HOST_FILE);
  assert.ok(
    /buildResumeHeaders\([\s\S]{0,160}epoch/.test(code),
    `${HOST_FILE} 调 buildResumeHeaders 时没把 epoch 传进去 ⇒ 端侧记了也白记`,
  );
});

test("C5 ★ RC-W1 宿主层: 收到 epoch ⇒ 派给状态机记住 (web / PC 同款)", () => {
  const code = repoCode(UI_FILE);
  assert.ok(
    /type\s*:\s*"epoch"/.test(code),
    `${UI_FILE} 没有把 epoch 派给状态机 (⇒ 记不住 ⇒ 重连带不回去)`,
  );
  assert.ok(
    /onTurnEpoch/.test(code),
    `${UI_FILE} 没有接流层的 onTurnEpoch 回调`,
  );
  assert.ok(
    /epoch\s*:/.test(code),
    `${UI_FILE} 没有把记住的 epoch 带进续传请求`,
  );
});

// ===========================================================================
// D 段 · 两端漂移 (RC-W7)
// ===========================================================================

test("D1 ★ RC-W7 web/PC 两仓共享层 (epoch 相关) md5 相同", () => {
  for (const rel of [SHARED_TURN_KEY, SHARED_TURN_RECORD, SHARED_TURN_SESSION]) {
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
      `两端 ${rel} 漂移了 (判据/状态机必须逐字节相同)`,
    );
  }
});
