#!/usr/bin/env node
// =========================================================================
// rc-mutation —— RC 轮 (续连加固) 的**变异跑批器**
// ---------------------------------------------------------------------------
// 为什么要有这个文件 (G-2 变异反证)
// ---------------------------------------------------------------------------
//   项目纪律: 「每条断言必须做变异 (故意改坏实现) 证明它会红, 并记录变异前后的红绿。
//   **没有变异反证的断言 = 没验过**。」
//   ⇒ 光跑一遍全绿**不能**说明断言有牙齿 —— 一条恒真的断言也是绿的。
//   ⇒ 这个脚本把每条断言背后的实现**改坏一次**, 跑对应的测试, 断言它**真的变红**。
//
// 做法 (对标 unified-api 的 scripts/a2-framelog-mutation.js)
// ---------------------------------------------------------------------------
//   ① 把被测闭包 (src/ + test/ + scripts/lib/) **拷进临时目录**;
//   ② node_modules 用**目录联接 (junction)** 指回真仓 (不拷、不装);
//   ③ 每条变异: 先把**原样**文件拷回临时目录, 再打上变异, 再跑对应测试文件;
//   ④ 判定: 测试**变红** = 有牙齿 ✔ / 仍绿 = 断言恒真 ✘ (危险);
//   ⑤ 跑完**校验源树零改动** (sha256 逐文件比对) —— 证明没碰真仓;
//   ⑥ 写一份 JSON 报告 (变异台)。
//
// ⛔ 源树只读: 变异**只发生在临时工作区**里 —— 不 reset、不 checkout、不 stash。
//    (真仓的工作树由人控制; 这个脚本连一个字节都不写回去。)
// ⚠️ 临时工作区 = `%TEMP%\rc-mutation-work\<end>` (固定名, 路径可核对);
//    跑完**不自动删** (不做递归删) ⇒ 需要清就手删那个字面路径。
//
// 用法
// ---------------------------------------------------------------------------
//   node scripts/rc-mutation.mjs                    # 跑全部, 报告写到 stdout
//   node scripts/rc-mutation.mjs --out <report.json> # 同时落一份报告
//   node scripts/rc-mutation.mjs --only M-RC-W17    # 只跑某一条
//
// 退出码
// ---------------------------------------------------------------------------
//   0 = 全部变异都让对应断言转红 (有牙齿)
//   1 = 有变异**没**转红 (断言恒真 / 变异没打中) ⇒ ⛔ 不许把这批断言算作已验证
//   2 = 跑批本身出错 (文件找不到 / 变异没打中 / 测试文件不存在)
//
// 运行: node scripts/rc-mutation.mjs   (完全离线: 不连网、不渲染 React)
// =========================================================================

import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// ---------------------------------------------------------------------------
// 本仓身份 (web / PC 两份只有这几个常量不同)
// ---------------------------------------------------------------------------
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const END = "pc"; // web | pc
const PEER_DIR = "gacode-web"; // 对端仓目录名 (md5 比对用)

/**
 * 单个测试文件的最长运行时间 (ms)。
 *
 * ⚠️ 为什么必须有: 变异可能把实现改成**死循环** (例: 删掉重连预算上限 ⇒
 *   无限重试)。没有这道闸, 一条变异能把跑批挂死、内存吃到 GB 级
 *   (2026-10-31 实测: M-RC-W16 让 attempts 数组涨到 2.7GB)。
 *   ⇒ 超时即判「变异已打断实现」= 变异生效 (单独标 `timedOut`)。
 */
const TEST_TIMEOUT_MS = 180000; // 3 分钟

// ---------------------------------------------------------------------------
// 变异台 —— 每一条都要有一份对应的断言被它打红
// ---------------------------------------------------------------------------
// ⚠️ `find` / `replace` 是**精确字符串替换** (第一处命中)。
//    打不中 ⇒ 脚本直接报错退出 (码 2) ⇒ 不许把「没打中」当成「变异通过」。
// ---------------------------------------------------------------------------
const MUTATIONS = [
  {
    id: "M-RC-W3",
    guards: ["RC-W3"],
    file: "src/lib/sse/terminal.ts",
    find: "return isTerminalFrame(frame) || frame.resumeFailed === true;",
    replace: "return isTerminalFrame(frame);",
    test: "test/sse-no-terminal.test.mjs",
    why: "终态判据退回「只认 isTerminalDone」⇒ 续传失败帧不再是终态 ⇒ 流式态关不掉",
  },
  {
    id: "M-RC-W12",
    guards: ["RC-W12"],
    file: "src/lib/sse/reconnect.ts",
    find: "  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;",
    replace:
      "  const maxAttempts = input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;\n" +
      "  state.budgetUsed = state.budgetUsed + 1; // 变异: 让决策函数**改传入的 state** ⇒ 不是纯函数",
    test: "test/sse-reconnect.test.mjs",
    why: "决策函数改动了传入的 state ⇒ 不再是纯函数",
  },
  {
    id: "M-RC-W13",
    guards: ["RC-W13"],
    file: "src/lib/sse/reconnect.ts",
    find: "Math.round(attempt) - 1",
    replace: "Math.round(attempt)",
    test: "test/sse-reconnect.test.mjs",
    why: "退避指数位移错一格 ⇒ 序列变成 2000,4000,…",
  },
  {
    id: "M-RC-W14",
    guards: ["RC-W14"],
    file: "src/lib/sse/reconnect.ts",
    find: "const factor = 0.8 + 0.4 * rand();",
    replace: "const factor = 1;",
    test: "test/sse-reconnect.test.mjs",
    why: "删掉 jitter ⇒ 惊群 (一堆客户端同时醒来)",
  },
  {
    id: "M-RC-W15",
    guards: ["RC-W15"],
    file: "src/lib/sse/reconnect.ts",
    find: "if (!input.online) {",
    replace: "if (false) {",
    test: "test/sse-reconnect.test.mjs",
    why: "offline 也往下走 ⇒ 烧预算 (电梯里 60 次半小时就烧完)",
  },
  {
    id: "M-RC-W16",
    guards: ["RC-W16"],
    file: "src/lib/sse/reconnect.ts",
    find: "if (state.budgetUsed < maxAttempts) {",
    replace: "if (true) {",
    test: "test/sse-reconnect.test.mjs",
    why: "预算永远用不完 ⇒ 永不 park ⇒ 无限重试",
  },
  {
    id: "M-RC-W17",
    guards: ["RC-W17"],
    file: "src/lib/sse/reconnect.ts",
    find:
      '      return {\n' +
      '        action: { kind: "attempt", attempt: state.attempt + 1 },\n' +
      '        next: {\n' +
      '          ...state,\n' +
      '          attempt: state.attempt + 1,\n' +
      '          budgetUsed: 1,\n' +
      '          backoffPending: false,\n' +
      '          lastOutcome: null,\n' +
      '        },\n' +
      '      };',
    replace:
      '      return {\n' +
      '        action: { kind: "attempt", attempt: 1 },\n' +
      '        next: {\n' +
      '          ...state,\n' +
      '          attempt: 1,\n' +
      '          budgetUsed: 1,\n' +
      '          backoffPending: false,\n' +
      '          lastOutcome: null,\n' +
      '        },\n' +
      '      };',
    test: "test/sse-reconnect.test.mjs",
    why: "★ park 被唤醒时把 attempt 重置为 1 ⇒ 退化成「重新提问」⇒ **双 LLM**",
  },
  {
    id: "M-RC-W19",
    guards: ["RC-W19"],
    file: "src/lib/sse/reconnect.ts",
    find:
      '  if (state.elapsedMs >= timeoutMs) {\n' +
      '    return { kind: "stop", polls: state.polls };\n' +
      '  }',
    replace:
      '  if (false) {\n' +
      '    return { kind: "stop", polls: state.polls };\n' +
      '  }',
    test: "test/sse-reconnect.test.mjs",
    why: "轮询没有上限 ⇒ 无限轮询",
  },
  {
    id: "M-RC-W20",
    guards: ["RC-W20"],
    file: "src/lib/sse/reconnect.ts",
    find: "export const DEFAULT_POLL_INTERVAL_MS = 3000;",
    replace: "export const DEFAULT_POLL_INTERVAL_MS = 3001;",
    test: "test/sse-reconnect.test.mjs",
    why: "只改本仓那一份 ⇒ web/PC 的 src/lib/sse/reconnect.ts 不再逐字节相同",
  },
  {
    id: "M-RC-W21",
    guards: ["RC-W21"],
    file: "src/lib/sse/concurrent.ts",
    find:
      "  if (\n" +
      "    code !== TURN_ALREADY_RUNNING_CODE &&\n" +
      "    status !== TURN_ALREADY_RUNNING_CODE\n" +
      "  ) {\n" +
      "    return null;\n" +
      "  }",
    replace:
      "  const msgText = String((e as { message?: unknown }).message ?? \"\");\n" +
      "  if (\n" +
      "    code !== TURN_ALREADY_RUNNING_CODE &&\n" +
      "    status !== TURN_ALREADY_RUNNING_CODE &&\n" +
      "    !msgText.includes(TURN_ALREADY_RUNNING_CODE)\n" +
      "  ) {\n" +
      "    return null;\n" +
      "  }",
    test: "test/sse-concurrent.test.mjs",
    why: "判据退化成 message 文本匹配 ⇒ 别的 409 会被误判成跨端并发",
  },
  {
    id: "M-RC-W23",
    guards: ["RC-W23"],
    file: "src/lib/sse/concurrent.ts",
    find: '  if (typeof e.decidedBy === "string" && e.decidedBy.length > 0) return null;',
    replace: "  if (false) return null;",
    test: "test/sse-concurrent.test.mjs",
    why: "不再排除审批 409 ⇒ 「已被别人裁决」被误吞成跨端并发",
  },
  {
    id: "M-RC-W24",
    guards: ["RC-W24"],
    file: "src/lib/sse/client-id.ts",
    find: "  headers[CLIENT_ID_HEADER] = opts.clientId;",
    replace: '  if (opts.path === "start") headers[CLIENT_ID_HEADER] = opts.clientId;',
    test: "test/sse-client-id.test.mjs",
    why: "只有「发起」路带端标识 ⇒ 续传/attach 的日志仍恒 unknown",
  },
  {
    id: "M-RC-W25",
    guards: ["RC-W25"],
    file: "src/lib/sse/client-id.ts",
    find: "  headers[CLIENT_ID_HEADER] = opts.clientId;",
    replace: '  headers[CLIENT_ID_HEADER] = "web";',
    test: "test/sse-client-id.test.mjs",
    why: "端标识写死 ⇒ PC 的日志会自称 web (两端串了)",
  },
];

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
function sha256File(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

/** 源树指纹 —— 跑批前后比一次, 证明「只读源树」不是口号。 */
function fingerprintRepo() {
  const files = new Set();
  for (const m of MUTATIONS) files.add(m.file);
  const out = {};
  for (const f of [...files].sort()) {
    const abs = join(REPO, f);
    out[f] = existsSync(abs) ? sha256File(abs) : "<缺失>";
  }
  return out;
}

function parseArgs(argv) {
  const out = { out: null, only: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out") out.out = argv[++i];
    else if (argv[i] === "--only") out.only = argv[++i];
  }
  return out;
}

/** 跑一个测试文件, 返回 { code, fail, pass, failing: string[], timedOut } */
function runTest(cwd, testFile) {
  const r = spawnSync(process.execPath, ["--test", testFile], {
    cwd,
    encoding: "utf8",
    // ★ 硬超时 —— 变异可能把实现改成**死循环** (例: 删掉预算上限 ⇒ 无限重试)。
    //   没有这个闸, 一条变异能把整个跑批挂死、内存吃到 GB 级。
    //   超时 ⇒ 判「变异让断言红」(挂死本身就是被变异打断的证据), 但要单独标出来。
    timeout: TEST_TIMEOUT_MS,
    killSignal: "SIGKILL",
    env: {
      ...process.env,
      // ★ 对端仓路径 —— 临时目录的兄弟目录不存在 ⇒ 必须显式指。
      RC_PEER_REPO: join(REPO, "..", PEER_DIR),
      // 关掉可能影响退出码的环境差异
      NODE_OPTIONS: "",
    },
  });
  const text = `${r.stdout || ""}\n${r.stderr || ""}`;
  const fail = Number((text.match(/^ℹ fail (\d+)$/m) || [])[1] || 0);
  const pass = Number((text.match(/^ℹ pass (\d+)$/m) || [])[1] || 0);
  // 找出失败的用例名 (spec reporter: "✖ <name>")
  const failing = [...text.matchAll(/^✖ (.+?) \(/gm)].map((m) => m[1].trim());
  const timedOut = !!(r.error && r.error.code === "ETIMEDOUT");
  return { code: r.status, fail, pass, failing, timedOut, raw: text };
}

// ---------------------------------------------------------------------------
// 搭临时工作区
// ---------------------------------------------------------------------------
// ⚠️ 固定目录名 (不用 mkdtemp) ⇒ 路径**可核对、可复现**:
//      %TEMP%\rc-mutation-work\<end>
//    ⇒ 跑完不会自动删 (⛔ 不做递归删, 免得误删) ⇒ 目录会留在盘上,
//      人工清理即可 (或在同一条命令里手删这个**字面路径**)。
//    ⇒ 每次跑之前会把 src/ test/ scripts/lib/ **覆盖**拷贝上去 (force),
//      所以不会用到上一轮的残留文件。
// ---------------------------------------------------------------------------
const WS_ROOT = join(tmpdir(), "rc-mutation-work");

function buildWorkspace() {
  const dir = join(WS_ROOT, END);
  mkdirSync(dir, { recursive: true });
  for (const sub of ["src", "test"]) {
    cpSync(join(REPO, sub), join(dir, sub), { recursive: true, force: true });
  }
  mkdirSync(join(dir, "scripts"), { recursive: true });
  cpSync(join(REPO, "scripts", "lib"), join(dir, "scripts", "lib"), {
    recursive: true,
    force: true,
  });
  // node_modules: 目录联接 (不拷、不装、零磁盘)
  const nm = join(REPO, "node_modules");
  if (existsSync(nm)) {
    const link = join(dir, "node_modules");
    if (!existsSync(link)) {
      try {
        symlinkSync(nm, link, "junction");
      } catch (e) {
        // 联接失败 (权限/策略) ⇒ 退化成拷贝 (慢但能跑)
        console.error(`[warn] node_modules 联接失败, 退化成拷贝: ${e && e.message}`);
        cpSync(nm, link, { recursive: true, dereference: true });
      }
    }
  }
  return dir;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
const args = parseArgs(process.argv.slice(2));
const list = args.only ? MUTATIONS.filter((m) => m.id === args.only) : MUTATIONS;
if (list.length === 0) {
  console.error(`✘ 没有 id = ${args.only} 的变异`);
  process.exit(2);
}

const before = fingerprintRepo();
const ws = buildWorkspace();
const pristine = new Map();
for (const m of MUTATIONS) {
  const abs = join(REPO, m.file);
  if (!existsSync(abs)) {
    console.error(`✘ 变异 ${m.id} 指向的文件不存在: ${m.file}`);
    process.exit(2);
  }
  pristine.set(m.file, readFileSync(abs));
}

const results = [];
let hardError = null;

for (const m of list) {
  // ① 先还原成原样 (每条变异都从干净基线出发)
  writeFileSync(join(ws, m.file), pristine.get(m.file));
  // ② 打上变异
  const src = readFileSync(join(ws, m.file), "utf8");
  if (!src.includes(m.find)) {
    hardError = `变异 ${m.id}: find 没打中 ${m.file} ⇒ **代码已经变了, 请更新变异配方**`;
    console.error(`✘ ${hardError}`);
    break;
  }
  const mutated = src.replace(m.find, m.replace);
  writeFileSync(join(ws, m.file), mutated);
  // ③ 跑对应的测试
  const t0 = Date.now();
  const r = runTest(ws, m.test);
  // 变异生效 = 断言**转红**; 变异把实现改成死循环 ⇒ 超时 (也是被打断的证据)。
  const turnedRed = r.fail > 0 || r.timedOut;
  results.push({
    id: m.id,
    guards: m.guards,
    file: m.file,
    test: m.test,
    why: m.why,
    pass: r.pass,
    fail: r.fail,
    turnedRed,
    timedOut: r.timedOut,
    failing: r.failing,
    ms: Date.now() - t0,
  });
  const mark = r.timedOut ? "✔ 红(超时)" : turnedRed ? "✔ 红" : "✘ 仍绿";
  console.log(
    `${mark}  ${m.id.padEnd(12)} ${String(m.file).padEnd(34)} ${m.test.padEnd(32)} ` +
      `pass=${r.pass} fail=${r.fail}  (${Date.now() - t0}ms)`
  );
  if (!turnedRed) {
    console.log(`      ↳ 没转红! 断言可能恒真 —— ${m.guards.join(", ")}`);
  }
}

// ---------------------------------------------------------------------------
// 收尾: 校验源树零改动
// ---------------------------------------------------------------------------
const after = fingerprintRepo();
let treeClean = true;
for (const f of Object.keys(before)) {
  if (before[f] !== after[f]) {
    treeClean = false;
    console.error(`✘ 源树被改了: ${f} (${before[f]} → ${after[f]})`);
  }
}
console.log(`\n临时工作区(留着, 人工清理): ${ws}`);

const report = {
  tool: "rc-mutation",
  end: END,
  repo: REPO,
  at: new Date().toISOString(),
  total: results.length,
  turnedRed: results.filter((r) => r.turnedRed).length,
  sourceTreeUntouched: treeClean,
  results,
};
if (args.out) {
  writeFileSync(resolve(args.out), JSON.stringify(report, null, 2), "utf8");
  console.log(`\n报告已写: ${resolve(args.out)}`);
}

console.log(
  `\n汇总: ${report.turnedRed}/${report.total} 条变异让断言转红 · 源树零改动=${treeClean ? "是" : "否"}`
);

if (hardError) process.exit(2);
if (!treeClean) process.exit(2);
process.exit(report.turnedRed === report.total ? 0 : 1);
