#!/usr/bin/env node
/**
 * scripts/verify-sse-turn-r2-mutation.mjs
 *
 * ★ 变异反证台 (纪律 G-2) —— 端侧续传中枢 (R2-PC / R2-PC′) 的 44 条断言。
 *
 * ---------------------------------------------------------------------------
 * 这脚本干什么
 * ---------------------------------------------------------------------------
 *   逐条把**生产代码改坏** ⇒ 必须有断言变红 ⇒ 还原 ⇒ 必须变绿。
 *   ⇒ 证明「44 条断言真的盯得住它们该盯的行」, 而不是「断言只会通过」。
 *
 *   ⚠️ 与 a4 批 (scripts/verify-mutation-counterproof-deliverable.mjs) **同款做法**:
 *     变异只发生在**系统临时目录里的镜像** (`src/` + `scripts/` + `test/` 的拷贝),
 *     **仓库工作区全程只读** ⇒ 脚本炸了也不会把别人的工作区留在「改坏」的状态。
 *   跑完还要逐字节核对仓库侧文件没被碰过。
 *
 * ---------------------------------------------------------------------------
 * 覆盖 (每个变异 ⇒ 一族断言)
 * ---------------------------------------------------------------------------
 *   M-P1  seq 跳号不再判洞            → B2
 *   M-P2  重复帧不再丢弃              → B1
 *   M-P3  解析层重新合并 thinking      → B14b
 *   M-P4  气泡不认帧里的 elapsedMs     → B16b
 *   M-P5  天眼不撤正文                → B17
 *   M-P6  终态四种表现塌成一种        → B18
 *   M-P7  时间线不认服务端计数        → B19b
 *   M-P8  没在跑也去 attach           → B5 (+ B5b)
 *   M-P9  问不到也当成「没在跑」      → 老服务端「网络失败 ⇒ null」
 *   M-P10 离场置 userStopped          → B8
 *   M-P11 续传头不发 Last-Event-ID    → B9b
 *   M-P12 端侧自己补 elapsedMs=0      → 兜底表行2
 *   M-P13 sse/ 里出现 window          → Z1
 *   M-P14 兼容分支不合并 thinking      → B15 (+ B15b)
 *   M-P15 页面不再用 opts.resume      → B9c
 *   M-P16 降级时不落地服务端快照      → B3
 *   M-P17 问不到时抹掉游标            → B6 (+ B6b)
 *   M-P18 帧级 elapsedMs 不记进快照  → B16
 *   —— R2-PC′ 批 (缺陷 W-1 / W-2) ——
 *   M-P19 帧里不带 seq (适配层丢掉)   → W1a
 *   M-P20 反向适配不带 seq            → W1b
 *   M-P21 状态机不认帧里的 seq        → W1c
 *   M-P22 老分支也判跳号              → W1d
 *   M-P23 本机快照无条件渲染          → W2a
 *   M-P24 判据永远说不                → W2b
 *   M-P25 onDegrade 无条件渲染        → W2c
 *   M-P26 降级内容也当本机旧快照      → W2d
 *   M-P27 onDegrade 另写一套判据      → W2e
 *   M-P28 非法游标也当合法            → W2f
 *
 * ---------------------------------------------------------------------------
 * 用法
 * ---------------------------------------------------------------------------
 *   node scripts/verify-sse-turn-r2-mutation.mjs          # 全跑
 *   node scripts/verify-sse-turn-r2-mutation.mjs M-P3     # 只跑某一条
 */
import { readFileSync, writeFileSync, cpSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { ROOT } from "./lib/schedule-loader.mjs";

const REPO = ROOT;
const T_R2 = "test/sse-turn-r2.test.mjs";
const T_OLD = "test/sse-turn-r2-oldserver.test.mjs";

/**
 * 变异表。
 *
 *   id      编号 (报告里用)
 *   desc    改了什么 (人话)
 *   file    被改坏的文件 (相对仓库根)
 *   edits   [{ find, replace, all? }] —— find 必须在文件里**唯一**出现
 *            (all: true 时替换全部出现处)
 *   test    跑哪个测试文件 (相对仓库根)
 *   expect  预期变红的断言名 (子串匹配)
 */
const MUTATIONS = [
  {
    id: "M-P1",
    desc: "seq 跳号不再判洞 (判成 apply)",
    file: "src/lib/sse/seq-guard.ts",
    edits: [
      {
        find: '  return { kind: "gap", expected: appliedSeq + 1, received: frameSeq };',
        replace: '  return { kind: "apply", seq: frameSeq };',
      },
    ],
    test: T_R2,
    expect: "B2 帧 seq 跳号",
  },
  {
    id: "M-P2",
    desc: "重复帧不再丢弃 (判成 apply)",
    file: "src/lib/sse/seq-guard.ts",
    edits: [
      {
        find: '  if (frameSeq <= appliedSeq) return { kind: "duplicate", seq: frameSeq };',
        replace: '  if (frameSeq <= appliedSeq) return { kind: "apply", seq: frameSeq };',
      },
    ],
    test: T_R2,
    expect: "B1 同 seq 帧到两次",
  },
  {
    id: "M-P3",
    desc: "解析层重新合并 thinking (openThinkingIdx)",
    file: "src/lib/api.ts",
    edits: [
      {
        find: `      // ★ 原样收下 —— **不合并** (T-16)。
      phases.push({ type: "thinking", text: p.text, ts });`,
        replace: `      // ★ 原样收下 —— **不合并** (T-16)。
      const openThinkingIdx = phases.findIndex((q) => q.type === "thinking");
      if (openThinkingIdx >= 0) {
        phases[openThinkingIdx].text += p.text;
        continue;
      }
      phases.push({ type: "thinking", text: p.text, ts });`,
      },
    ],
    test: T_R2,
    expect: "B14b",
  },
  {
    id: "M-P4",
    desc: "气泡不认帧里的 elapsedMs (改名 ⇒ 认不到了)",
    file: "src/components/chat/MessageBubble.tsx",
    edits: [{ find: "elapsedMs", replace: "elapsedTime", all: true }],
    test: T_R2,
    expect: "B16b",
  },
  {
    id: "M-P5",
    desc: "天眼命中后不清空已渲染正文",
    file: "src/lib/sse/turn-record.ts",
    edits: [
      {
        find: `export function purgeRenderedContent(
  snapshot: TurnRenderedSnapshot
): TurnRenderedSnapshot {
  return { ...snapshot, content: "" };
}`,
        replace: `export function purgeRenderedContent(
  snapshot: TurnRenderedSnapshot
): TurnRenderedSnapshot {
  return { ...snapshot };
}`,
      },
    ],
    test: T_R2,
    expect: "B17 ",
  },
  {
    id: "M-P6",
    desc: "终态「已停止」的表现形态塌成 error (四类不再互不相同)",
    file: "src/lib/sse/terminal.ts",
    edits: [
      {
        find: `        form: "stopped",`,
        replace: `        form: "error",`,
      },
    ],
    test: T_R2,
    expect: "B18 terminalReason 四类",
  },
  {
    id: "M-P7",
    desc: "时间线不认服务端 toolCallCount / thinkingCount",
    file: "src/components/chat/ExecutionTimeline.tsx",
    edits: [
      { find: "toolCallCount", replace: "serverToolCalls", all: true },
      { find: "thinkingCount", replace: "serverThinkingCount", all: true },
    ],
    test: T_R2,
    expect: "B19b",
  },
  {
    id: "M-P8",
    desc: "stream-state 说「没在跑」也去 attach",
    file: "src/lib/sse/entry.ts",
    edits: [
      {
        find: `      action: "history",
      cursor: null,
      reason: "not_running",`,
        replace: `      action: "attach",
      cursor: null,
      reason: "not_running",`,
      },
    ],
    test: T_R2,
    expect: "B5 stream-state 返回 running=false",
  },
  {
    id: "M-P9",
    desc: "stream-state 网络失败也当成「没在跑」(返回 emptyStreamState)",
    file: "src/lib/api.ts",
    edits: [
      {
        find: `    console.warn("[stream-state] 查询失败, 降级为历史补拉 (游标保留):", err);
    return null;`,
        replace: `    console.warn("[stream-state] 查询失败, 降级为历史补拉 (游标保留):", err);
    return emptyStreamState();`,
      },
    ],
    test: T_OLD,
    expect: "stream-state 网络失败",
  },
  {
    id: "M-P10",
    desc: "离场清理置 userStopped (⇒ 等于发 USER_STOP)",
    file: "src/routes/ChatDetail.tsx",
    edits: [
      {
        find: `      cancelled = true;
      // 只掐**读流**`,
        replace: `      cancelled = true;
      let userStopped = true;
      // 只掐**读流**`,
      },
    ],
    test: T_R2,
    expect: "B8 退出页面",
  },
  {
    id: "M-P11",
    desc: "合法游标不发 Last-Event-ID (降级成 X-Resume-Turn)",
    file: "src/lib/chat-sse.ts",
    edits: [
      {
        find: `  if (isValidEventCursor(cursor)) {
    return { [LAST_EVENT_ID_HEADER]: cursor };
  }`,
        replace: `  if (isValidEventCursor(cursor)) {
    return { [RESUME_TURN_HEADER]: RESUME_TURN_VALUE };
  }`,
      },
    ],
    test: T_R2,
    expect: "B9b",
  },
  {
    id: "M-P12",
    desc: "端侧自己给老服务端帧补 elapsedMs=0",
    file: "src/lib/chat-sse.ts",
    edits: [
      {
        find: `    out = { ...out, events: norm.events };
  }
  return out;
}`,
        replace: `    out = { ...out, events: norm.events };
  }
  if (out.elapsedMs === undefined) out = { ...out, elapsedMs: 0 };
  return out;
}`,
      },
    ],
    test: T_OLD,
    expect: "兜底表行2",
  },
  {
    id: "M-P13",
    desc: "sse/ 模块里出现 window",
    file: "src/lib/sse/seq-guard.ts",
    edits: [
      {
        find: `export function isValidCursor(raw: unknown): raw is string {
  return typeof raw === "string" && /^\\d+$/.test(raw);
}`,
        replace: `export function isValidCursor(raw: unknown): raw is string {
  const w = typeof window !== "undefined" ? window : null;
  void w;
  return typeof raw === "string" && /^\\d+$/.test(raw);
}`,
      },
    ],
    test: T_R2,
    expect: "Z1 ",
  },
  {
    id: "M-P14",
    desc: "renderPhases 的兼容分支不合并 (老数据不再合成一条)",
    file: "src/lib/sse/turn-record.ts",
    edits: [
      {
        find: `  if (opts?.authoritative === true) {
    // ★ 主路径: **原样**, 一条不多一条不少。
    return src.slice();
  }`,
        replace: `  if (opts?.authoritative === true) {
    // ★ 主路径: **原样**, 一条不多一条不少。
    return src.slice();
  }
  if (true) return src.slice();`,
      },
    ],
    test: T_R2,
    expect: "B15 ",
  },
  {
    id: "M-P15",
    desc: "页面不再用 opts.resume (重连不带游标)",
    file: "src/routes/ChatDetail.tsx",
    edits: [
      {
        find: `              resume: resumeMode
                ? { cursor: args.cursor ?? lastCursor ?? null }
                : null,`,
        replace: `              resume: null,`,
      },
    ],
    test: T_R2,
    expect: "B9c",
  },
  {
    id: "M-P16",
    desc: "降级时不把服务端快照落进已渲染内容",
    file: "src/lib/sse/degrade.ts",
    edits: [
      {
        find: "  return mergeServerSnapshot(snapshot, serverSnapshot);",
        replace: "  return snapshot;",
      },
    ],
    test: T_R2,
    expect: "B3 attach_failed 带 snapshot",
  },
  {
    id: "M-P17",
    desc: "问不到 (stream-state 不可达) 时把游标抹掉",
    file: "src/lib/sse/entry.ts",
    edits: [
      {
        find: `      // ★ 保留游标 —— 断一次网就把游标抹了 ⇒ 回来只能整轮重放 (缺陷 A-3)。
      keepCursor: true,`,
        replace: `      // ★ 保留游标 —— 断一次网就把游标抹了 ⇒ 回来只能整轮重放 (缺陷 A-3)。
      keepCursor: false,`,
      },
    ],
    test: T_R2,
    expect: "B6 stream-state **不可达**",
  },
  {
    id: "M-P18",
    desc: "帧级 elapsedMs 不记进已渲染快照",
    file: "src/lib/sse/turn-record.ts",
    edits: [
      {
        find: '  if (typeof frame.elapsedMs === "number") next.elapsedMs = frame.elapsedMs;',
        replace: "  // ★ 变异: 端侧不记帧级 elapsedMs",
      },
    ],
    test: T_R2,
    expect: "B16 ",
  },
  // ── R2-PC′ 批: 缺陷 W-1 (帧丢 seq) + 缺陷 W-2 (本机快照无条件渲染) ──
  {
    id: "M-P19",
    desc: "宿主适配层不带 seq (缺陷 W-1 的原样)",
    file: "src/routes/ChatDetail.tsx",
    edits: [
      {
        find: "    seq: chunk.seq ?? null,",
        replace: "    // ★ 变异: 端侧不把 seq 带进帧",
      },
    ],
    test: T_R2,
    expect: "W1a",
  },
  {
    id: "M-P20",
    desc: "反向适配不带 seq (缺陷 W-1 的另一半)",
    file: "src/routes/ChatDetail.tsx",
    edits: [
      {
        find: '    seq: typeof frame.seq === "number" ? frame.seq : undefined,',
        replace: "    // ★ 变异: 反向适配不把 seq 带回去",
      },
    ],
    test: T_R2,
    expect: "W1b",
  },
  {
    id: "M-P21",
    desc: "状态机不认帧里的 seq (跳号判定永远走不到)",
    file: "src/lib/sse/turn-session.ts",
    edits: [
      {
        find: `      const verdict: SeqVerdict = decideFrame(
        session.appliedSeq,
        event.frame,
        event.cursor ?? null
      );`,
        replace: `      const verdict: SeqVerdict = decideFrame(
        session.appliedSeq,
        null,
        event.cursor ?? null
      );`,
      },
    ],
    test: T_R2,
    expect: "W1c",
  },
  {
    id: "M-P22",
    desc: "老分支 (只有 SSE 游标) 也判跳号 (老兼容语义被破坏)",
    file: "src/lib/sse/seq-guard.ts",
    edits: [
      {
        find: "    return decideFrameSeq(appliedSeq, legacy, false);",
        replace: "    return decideFrameSeq(appliedSeq, legacy, true);",
      },
    ],
    test: T_R2,
    expect: "W1d",
  },
  {
    id: "M-P23",
    desc: "本机快照无条件渲染 (缺陷 W-2 的原样)",
    file: "src/routes/ChatDetail.tsx",
    edits: [
      {
        find: "            if (!canRenderLocalSnapshot(cursor, true)) return;",
        replace: "            // ★ 变异: 本机快照无条件渲染",
      },
    ],
    test: T_R2,
    expect: "W2a",
  },
  {
    id: "M-P24",
    desc: "判据函数永远说「不渲染」",
    file: "src/routes/ChatDetail.tsx",
    edits: [
      {
        find: `  if (isValidCursor(localCursor)) return true;
  return !isLocalSnapshot;`,
        replace: "  return false;",
      },
    ],
    test: T_R2,
    expect: "W2b",
  },
  {
    id: "M-P25",
    desc: "onDegrade 无条件渲染 (缺陷 W-2 的另一半)",
    file: "src/routes/ChatDetail.tsx",
    edits: [
      {
        find: `            if (
              plan.renderSnapshot &&
              snap.content &&
              canRenderLocalSnapshot(cursor, snap.content === localSnapshotContent)
            ) {`,
        replace: `            if (plan.renderSnapshot && snap.content) {`,
      },
    ],
    test: T_R2,
    expect: "W2c",
  },
  {
    id: "M-P26",
    desc: "降级内容也当本机旧快照 (降级内容被丢掉)",
    file: "src/routes/ChatDetail.tsx",
    edits: [
      {
        find: "  return !isLocalSnapshot;",
        replace: "  return false;",
      },
    ],
    test: T_R2,
    expect: "W2d",
  },
  {
    id: "M-P27",
    desc: "onDegrade 另写一套判据 (与 onLocalRecord 不同口径)",
    file: "src/routes/ChatDetail.tsx",
    edits: [
      {
        find: "canRenderLocalSnapshot(cursor, snap.content === localSnapshotContent)",
        replace: "snap.content === localSnapshotContent",
      },
    ],
    test: T_R2,
    expect: "W2e",
  },
  {
    id: "M-P28",
    desc: "非法游标也当合法 (判据不认「纯十进制」)",
    file: "src/routes/ChatDetail.tsx",
    edits: [
      {
        find: "  if (isValidCursor(localCursor)) return true;",
        replace: "  if (localCursor !== null) return true;",
      },
    ],
    test: T_R2,
    expect: "W2f",
  },
];

// ---------------------------------------------------------------------------
// 临时镜像 —— 变异只发生在镜像里, 仓库工作区全程只读
// ---------------------------------------------------------------------------
const MIRROR = mkdtempSync(join(tmpdir(), "mut-mirror-r2pc-"));
const cleanup = () => {
  try {
    rmSync(MIRROR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
};
process.on("exit", cleanup);
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    cleanup();
    process.exit(130);
  });
}

const mirrorFile = (rel) => join(MIRROR, rel);

// 拷贝被测面到镜像: 源码 + 断言 + 断言脚本用的加载器。
for (const dir of ["src", "scripts", "test"]) {
  cpSync(join(REPO, dir), mirrorFile(dir), { recursive: true });
}
cpSync(join(REPO, "package.json"), mirrorFile("package.json"));
// 断言脚本要 import `typescript` ⇒ 镜像里得有 node_modules (junction / 软链)。
try {
  symlinkSync(join(REPO, "node_modules"), mirrorFile("node_modules"), "junction");
} catch {
  /* 建不了 junction ⇒ 断言脚本会在 import 处明确报错 */
}

// ---------------------------------------------------------------------------
// 跑一个测试文件 (在镜像里), 抓「哪些断言红了」
// ---------------------------------------------------------------------------
const runTests = (testFile) => {
  try {
    const out = execFileSync("node", ["--test", testFile], {
      cwd: MIRROR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { out, code: 0 };
  } catch (err) {
    return {
      out: `${err.stdout ?? ""}${err.stderr ?? ""}`,
      code: typeof err.status === "number" ? err.status : 1,
    };
  }
};

/** 从 node --test 的输出里抠出「红了」的断言名。 */
const redTests = (out) =>
  [...out.matchAll(/^(?:not ok \d+ - |✖ )(.*)$/gm)].map((m) =>
    m[1].replace(/\s*\(.*\)\s*$/, "").trim(),
  );

const failCount = (out) => {
  const m = /fail (\d+)/.exec(out);
  return m ? Number(m[1]) : 0;
};

// ---------------------------------------------------------------------------
// 主循环
// ---------------------------------------------------------------------------
const ONLY = process.argv[2] || "";
const RUNS = ONLY ? MUTATIONS.filter((m) => m.id.startsWith(ONLY)) : MUTATIONS;
if (ONLY && RUNS.length === 0) {
  console.log(`❌ 没有编号以「${ONLY}」开头的变异`);
  process.exit(1);
}

let checked = 0;
let passed = 0;
let failed = 0;

console.log("");
console.log(`══ 变异反证台 (R2-PC · 44 条断言) —— ${RUNS.length} 条 ══`);
console.log(`   镜像: ${MIRROR}`);
console.log("");

for (const m of RUNS) {
  checked++;
  const path = mirrorFile(m.file);
  const original = readFileSync(path, "utf8");

  // ① 应用变异
  //    ⚠️ Windows 工作区里有 CRLF 文件 (core.autocrlf=true) ⇒ 锚点一律按 **LF**
  //       写, 应用时先归一, 落盘时再按原样换回去 (还原永远是逐字节的原文)。
  const crlf = original.includes("\r\n");
  const lf = original.replace(/\r\n/g, "\n");
  let mutated = lf;
  let ok = true;
  for (const e of m.edits) {
    if (e.all) {
      if (!mutated.includes(e.find)) {
        ok = false;
        break;
      }
      mutated = mutated.split(e.find).join(e.replace);
      continue;
    }
    const hits = mutated.split(e.find).length - 1;
    if (hits !== 1) {
      console.log(`  ❌ ${m.id}: 锚点在 ${m.file} 里出现 ${hits} 次 (要 1 次) — 变异没生效`);
      ok = false;
      break;
    }
    mutated = mutated.replace(e.find, e.replace);
  }
  if (!ok) {
    failed++;
    continue;
  }
  if (mutated === lf) {
    console.log(`  ❌ ${m.id}: 变异后内容没变 — 变异没生效`);
    failed++;
    continue;
  }

  // ② 改坏 ⇒ 跑断言
  let redList = [];
  try {
    writeFileSync(path, crlf ? mutated.replace(/\n/g, "\r\n") : mutated, "utf8");
    redList = redTests(runTests(m.test).out);
  } finally {
    // ③ 无条件还原 (镜像里)
    writeFileSync(path, original, "utf8");
  }

  // ④ 还原后必须逐字节一致 (镜像里)
  if (readFileSync(path, "utf8") !== original) {
    console.log(`  ❌ ${m.id}: 镜像里还原失败 — 手工检查 ${m.file}`);
    failed++;
    continue;
  }

  // ⑤ 还原后必须变绿
  const greenFails = failCount(runTests(m.test).out);

  // ⑥ 判红: 期望的那条断言必须在红名单里
  const hit = redList.find((name) => name.includes(m.expect));
  const good = Boolean(hit) && greenFails === 0;
  if (good) {
    passed++;
  } else {
    failed++;
  }
  console.log(
    `  ${good ? "✅" : "❌"} ${m.id} ${m.desc}` +
      `\n       改坏 ⇒ 红: ${hit ?? `(没红 — 变异没被抓住; 红的是: ${redList.join(" / ") || "无"})`}` +
      `\n       还原 ⇒ 绿: fail=${greenFails}`,
  );
}

// ---------------------------------------------------------------------------
// 收尾: 仓库工作区必须**逐字节没变** (变异只发生在镜像里)
// ---------------------------------------------------------------------------
let repoTouched = 0;
for (const m of MUTATIONS) {
  const a = readFileSync(join(REPO, m.file), "utf8");
  const b = readFileSync(mirrorFile(m.file), "utf8");
  if (a !== b) {
    console.log(`  ⚠️ 仓库侧 ${m.file} 与镜像不一致 —— 工作区被碰过?`);
    repoTouched++;
  }
}

console.log("");
console.log("════════════════════════════════════════════");
console.log(`checked=${checked}  passed=${passed}  failed=${failed}`);
console.log(`仓库工作区被碰过的文件数 = ${repoTouched}`);
console.log("════════════════════════════════════════════");
if (failed === 0 && repoTouched === 0) {
  console.log("✅ 每条变异都被对应的断言抓住, 还原后全绿, 仓库工作区逐字节没变");
  process.exit(0);
} else {
  console.log("❌ 有变异没被抓住 (或还原失败 / 工作区被动过) —— 断言判据有洞");
  process.exit(1);
}
