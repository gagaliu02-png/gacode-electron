#!/usr/bin/env node
/**
 * verify-mutation-counterproof-deliverable.mjs
 *
 * 变异反证 —— 「a4 交付物删除推送」这批的断言**真的**盯着那几行代码吗?
 *
 * ---------------------------------------------------------------------------
 * 为什么必须有这一步 (PM 派活纪律第 7 条)
 * ---------------------------------------------------------------------------
 *   任务书里的断言大多打在**源码文本**上 (正则 / AST 取片段)。源码文本这东西
 *   很容易被「喂饱」:
 *     · 把被盯的逻辑挪进注释里 —— 断言照样绿;
 *     · 把判据从「主键 ∈ 已删除集合」改成「查服务端这个 id 还在不在」——
 *       **断言还在, 但已经盯不住任何东西了**。
 *
 *   只有「**把那一行改坏 ⇒ 断言必须变红**」能证明这条断言是活的。
 *   本脚本对每条被盯的规则做一次**最小变异**, 跑配对的断言脚本, 断言它变红,
 *   然后**立刻还原**。
 *
 * ---------------------------------------------------------------------------
 * ⚠️ 为什么在**临时镜像**里变异, 而不是就地改工作区 (与批04 版的差异)
 * ---------------------------------------------------------------------------
 *   批04 的 `scripts/verify-mutation-counterproof.mjs` 是**就地**改源码再还原。
 *   本脚本改成: 把 `src/` 与 `scripts/` 拷到**系统临时目录**, 在镜像里变异,
 *   用 `cwd = 镜像` 跑断言脚本。
 *
 *   理由 (两条, 都是硬的):
 *     1. **不就地改工作区** —— 变异台要改的是**生产源码**。即便脚本在 finally
 *        里还原, 进程被强杀 / 断电 / 断言脚本超时被 kill 的那一刻, 工作区就
 *        留在「改坏」的状态 (别人的工作区、别人的分支)。镜像里改 ⇒ 炸了最多
 *        脏一个临时目录, 永远不碰仓库。
 *     2. **能顺带证明「工作区没被碰」** —— 跑完比对仓库侧每个被变异文件的
 *        字节, 与跑之前完全一致。
 *
 *   ⚠️ 镜像里必须有 `node_modules` 的 junction —— 断言脚本要 import
 *     `typescript` (转译 + 去注释 + AST 抠取都靠它)。
 *
 * ---------------------------------------------------------------------------
 * 与 `scripts/verify-mutation-counterproof.mjs` (SSE 批04) 的其它差异
 * ---------------------------------------------------------------------------
 *   跑法、「变红」判据 (退出码非 0 + FAIL>0 + 出现预期的那条 ❌)、
 *   锚点必须命中恰好一处的规则, 全部一致。
 *   **只有被变异的文件与变异表不同** —— 本批的变异表是**重写的** (a4 批次)。
 *
 * ---------------------------------------------------------------------------
 * 安全约定
 * ---------------------------------------------------------------------------
 *   · 每个变异只在**镜像**里改; 镜像文件在 finally 里逐字节还原;
 *   · 进程退出 (含 SIGINT / 异常) 时兜底清理镜像;
 *   · 跑完比对**仓库侧**被变异文件 ⇒ 必须逐字节一致 (证明没碰工作区);
 *   · 变异必须**只命中一处** (脚本自己数次数) —— 否则判 FAIL, 不猜。
 *
 * 退出码: 0 = 全部变异都被抓到 / 1 = 有变异没被抓到 (或还原失败)。
 *
 * 用法: node scripts/verify-mutation-counterproof-deliverable.mjs       (跑全部)
 *       node scripts/verify-mutation-counterproof-deliverable.mjs D07    (只跑 D07 起的)
 */

import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
  cpSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();

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

// ---------------------------------------------------------------------------
// 临时镜像 —— 变异只发生在镜像里, 仓库工作区全程只读
// ---------------------------------------------------------------------------
const MIRROR = mkdtempSync(join(tmpdir(), "mut-mirror-deliv-"));
process.on("exit", () => {
  try {
    rmSync(MIRROR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    try {
      rmSync(MIRROR, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    process.exit(130);
  });
}

const mirrorFile = (rel) => join(MIRROR, rel);

/** 仓库侧文件内容快照 —— 跑完逐字节比对, 证明工作区没被碰。 */
const repoSnapshot = new Map();
const snapshotRepo = (rel) => {
  if (!repoSnapshot.has(rel)) {
    repoSnapshot.set(rel, readFileSync(join(ROOT, rel), "utf8"));
  }
};

const countOf = (hay, needle) => {
  let n = 0;
  let i = -1;
  while ((i = hay.indexOf(needle, i + 1)) !== -1) n++;
  return n;
};

/**
 * 一条变异。
 *
 * @param id    变异编号 + 一句话说明
 * @param file  被改的文件 (相对仓库根)
 * @param from  原文本 (必须**只命中一处**)
 * @param to    变异后的文本
 * @param script 配对的断言脚本 (相对仓库根)
 * @param expect 变异后**必须**出现的 ❌ 文本 (对应那条断言的失败文案)
 */
const M = (id, file, from, to, script, expect) => ({
  id,
  file,
  from,
  to,
  script,
  expect,
});

const SCRIPT = "scripts/verify-deliverable-delete-push.mjs";

const MUTATIONS = [
  // ===== chat-sse.ts —— 认帧 (W-1) =========================================
  M(
    "D01 认帧时把顶层字段名写错 (这帧永远认不出来)",
    "src/lib/chat-sse.ts",
    "  const raw = (payload as Record<string, unknown>).deletedDeliverables;",
    "  const raw = (payload as Record<string, unknown>).deleted_deliverables;",
    SCRIPT,
    "单元素数组认不出来"
  ),
  M(
    "D02 归一层把顶层字段吃掉 (老端侧也不安全)",
    "src/lib/chat-sse.ts",
    "  let out = chunk;",
    "  let out = { ...chunk, deletedDeliverables: undefined };",
    SCRIPT,
    "归一层把顶层字段吃了"
  ),
  M(
    "D03 帧里的 id 不 trim (空格 id 与真 id 对不上)",
    "src/lib/chat-sse.ts",
    "    const id = item.trim();",
    "    const id = item;",
    SCRIPT,
    "脏 id 处理不对"
  ),

  // ===== deliverable-deleted-store.ts —— 落盘 (W-2) ========================
  M(
    "D04 TTL 从 180 天改成 365 天",
    "src/lib/deliverable-deleted-store.ts",
    "export const DELETED_DELIVERABLE_TTL_MS = 180 * 24 * 60 * 60 * 1000;",
    "export const DELETED_DELIVERABLE_TTL_MS = 365 * 24 * 60 * 60 * 1000;",
    SCRIPT,
    "TTL 不是 180 天"
  ),
  M(
    "D05 落盘 key 不带 userId (换用户串号)",
    "src/lib/deliverable-deleted-store.ts",
    "  return `${DELETED_DELIVERABLES_STORAGE_KEY}.${userId}`;",
    "  return `${DELETED_DELIVERABLES_STORAGE_KEY}`;",
    SCRIPT,
    "按用户隔离不对"
  ),
  M(
    "D06 记录时不幂等 (重复记 ⇒ 时间戳被覆盖、重复计新增)",
    "src/lib/deliverable-deleted-store.ts",
    "    if (store[id] !== undefined) continue;",
    "    if (store[id] !== undefined) { store[id] = now; added.push(id); continue; }",
    SCRIPT,
    "幂等不对"
  ),

  // ===== deliverable-visibility.ts —— 判据 (W-3 / H-1 / H-2 / H-3) ========
  M(
    "D07 web_preview 混进判据 (id 空间不是同一个)",
    "src/lib/deliverable-visibility.ts",
    "  const family = richEventFamily(ev);\n  if (!family) return null;",
    "  const family = richEventFamily(ev);",
    SCRIPT,
    "H-3 web_preview 混进判据了"
  ),
  M(
    "D08 没带 id 的事件被当成已删除 (老会话气泡集体消失)",
    "src/lib/deliverable-visibility.ts",
    "  if (!id) return false;",
    "  if (!id) return true;",
    SCRIPT,
    "判据不对"
  ),
  M(
    "D09 events 侧不过滤 (气泡里的卡还在)",
    "src/lib/deliverable-visibility.ts",
    "  return events.filter((ev) => !isDeletedDeliverable(ev, deletedIds));",
    "  return events;",
    SCRIPT,
    "滤完剩的不是预期那批"
  ),
  M(
    "D10 phases 侧不过滤 (空壳气泡)",
    "src/lib/deliverable-visibility.ts",
    "    return !isDeletedDeliverable(ev as unknown as RichEventBase, deletedIds);",
    "    return true;",
    SCRIPT,
    "phases 滤得不对"
  ),
  M(
    "D11 「删除必须赢」失效 (同 id 同时在 items 与 removedIds 还是进列表)",
    "src/lib/deliverable-visibility.ts",
    "  return items.filter((it) => !removed.has(it.id));",
    "  return items;",
    SCRIPT,
    "「删除必须赢」"
  ),
  M(
    "D12 removedIds 缺失当成必填 (老服务端直接把端侧打崩)",
    "src/lib/deliverable-visibility.ts",
    "  if (!removedIds || removedIds.length === 0) return items;",
    '  if (!removedIds) throw new Error("removedIds 必填");',
    SCRIPT,
    "removedIds 缺失时崩了"
  ),
  M(
    "D13 判据改成查服务端 (老会话气泡会被全判成消失)",
    "src/lib/deliverable-visibility.ts",
    'import { eventIdOf, richEventFamily, type RichEventBase } from "./rich-events";',
    'import { eventIdOf, richEventFamily, type RichEventBase } from "./rich-events";\nimport { listDeliverables } from "./api";',
    SCRIPT,
    "H-1 判据模块里有网络调用"
  ),

  // ===== chat-sse.ts —— H-8 (不许写第三份帧解析器) ========================
  M(
    "D14 chat-sse.ts 另写一套帧解析器 (第三份 SSE 解析)",
    "src/lib/chat-sse.ts",
    'import { SseFrameParser } from "./notifications-sse";',
    "const SseFrameParser = class { push() { return []; } flush() { return null; } };",
    SCRIPT,
    "H-8 chat-sse.ts 另写了一套帧解析器"
  ),

  // ===== api.ts —— W-5 可选字段 ============================================
  M(
    "D15 removedIds 变成必填字段 (老服务端没有它 ⇒ 端侧炸)",
    "src/lib/api.ts",
    "  removedIds?: string[];",
    "  removedIds: string[];",
    SCRIPT,
    "removedIds 不是可选字段"
  ),

  // ===== ChatDetail.tsx —— 接线 =============================================
  M(
    "D16 ChatDetail 不认这帧",
    "src/routes/ChatDetail.tsx",
    "      const deletedIds = parseDeletedDeliverables(chunk);",
    "      const deletedIds = null as string[] | null;",
    SCRIPT,
    "ChatDetail.tsx 没认这帧"
  ),
  M(
    "D17 流式路径不过滤 events (气泡里的卡还在)",
    "src/routes/ChatDetail.tsx",
    "    streamingMsg.richEvents = filterDeletedDeliverableEvents(\n      streamingMsg.richEvents,\n      deletedDeliverableIds,\n    );",
    "    streamingMsg.richEvents = streamingMsg.richEvents;",
    SCRIPT,
    "W-3 有一路没滤"
  ),
  M(
    "D18 历史路径不过滤 phases (空壳气泡)",
    "src/routes/ChatDetail.tsx",
    "      const keptPhases = filterDeletedDeliverablePhases(\n        m.phases,\n        deletedDeliverableIds,\n      );",
    "      const keptPhases = m.phases;",
    SCRIPT,
    "W-3 有一路没滤"
  ),
  M(
    "D18b 历史路径不过滤 richEvents (刷新后死链卡又回来)",
    "src/routes/ChatDetail.tsx",
    "      const keptEvents = filterDeletedDeliverableEvents(\n        deduped,\n        deletedDeliverableIds,\n      );",
    "      const keptEvents = deduped;",
    SCRIPT,
    "W-3 有一路没滤"
  ),
  M(
    "D19 进场不 hydrate 回「已删除交付物」集合 (刷新后死链卡又回来)",
    "src/routes/ChatDetail.tsx",
    "    setDeletedDeliverableIds(readDeletedDeliverables(userId));",
    "    setDeletedDeliverableIds(new Set());",
    SCRIPT,
    "进场没有 hydrate 回「已删除交付物」集合"
  ),

  // ===== Deliveries.tsx —— 拉模式兜底 / W-4 ================================
  M(
    "D20 拉模式不把 removedIds 写进「已删除交付物」集合",
    "src/routes/Deliveries.tsx",
    "      recordDeletedDeliverables(userId, removed);",
    "      void removed;",
    SCRIPT,
    "removedIds 没写进「已删除交付物」集合"
  ),
  M(
    "D21 交付中心自己删成功后不记 (此刻收不到 a4 帧)",
    "src/routes/Deliveries.tsx",
    "      if (userId) recordDeletedDeliverables(userId, [id]);",
    "      void id;",
    SCRIPT,
    "交付中心删除成功后没记进集合"
  ),
  M(
    "D22 「删除必须赢」inline 回 effect (判据写了第二遍)",
    "src/routes/Deliveries.tsx",
    "    const visible = filterRemovedDeliverableItems(pageData.items || [], removed);",
    "    const visible = (pageData.items || []).filter((d) => !removed?.includes(d.id));",
    SCRIPT,
    "H-9 Deliveries.tsx 自己 inline 了一份「删除必须赢」的判据"
  ),
  M(
    "D23 交付中心刷新机制被拆掉 (W-4)",
    "src/routes/Deliveries.tsx",
    '  const handleRefresh = () => {\n    setPage(1);\n    queryClient.invalidateQueries({ queryKey: ["deliverables"] });',
    "  const handleRefresh = () => {\n    setPage(1);",
    SCRIPT,
    "W-4 交付中心刷新机制不见了"
  ),
];

// ---------------------------------------------------------------------------
// 建镜像 + 前置检查
// ---------------------------------------------------------------------------
{
  const missing = [
    ...new Set([...MUTATIONS.map((m) => m.script), SCRIPT]),
  ].filter((s) => {
    try {
      readFileSync(join(ROOT, s), "utf8");
      return false;
    } catch {
      return true;
    }
  });
  if (missing.length) {
    console.log(`❌ 仓库根不对 (找不到 ${missing.join(", ")}) —— 请在仓库根跑。`);
    process.exit(1);
  }
}

// 拷贝 `src/` 与 `scripts/` 到镜像 —— 变异只发生在镜像里。
for (const dir of ["src", "scripts"]) {
  cpSync(join(ROOT, dir), mirrorFile(dir), { recursive: true });
}
// 断言脚本要 import `typescript` ⇒ 镜像里得有 node_modules (junction / 软链)。
try {
  symlinkSync(join(ROOT, "node_modules"), mirrorFile("node_modules"), "junction");
} catch {
  // 建不了 junction (权限 / 平台限制) ⇒ 断言脚本会在 import 处明确报错。
}

// 跑之前先把仓库侧被变异文件快照下来 (跑完逐字节比对 ⇒ 证明没碰工作区)。
for (const mu of MUTATIONS) snapshotRepo(mu.file);

// ===========================================================================
// 逐条变异
// ===========================================================================
const ONLY = process.argv[2] || "";
const RUNS = ONLY ? MUTATIONS.filter((m) => m.id.startsWith(ONLY)) : MUTATIONS;
if (ONLY && RUNS.length === 0) {
  console.log(`❌ 没有编号以「${ONLY}」开头的变异`);
  process.exit(1);
}
log(`变异反证 (PC · a4 交付物删除推送) —— ${RUNS.length} 条${ONLY ? ` (只跑 ${ONLY})` : ""}`);
log(`镜像: ${MIRROR}`);
log("");

const notRestored = [];

for (const mu of RUNS) {
  const abs = mirrorFile(mu.file);
  let original;
  try {
    original = readFileSync(abs, "utf8");
  } catch (err) {
    miss(`${mu.id} —— 镜像里读不到 ${mu.file}: ${err.message}`);
    continue;
  }

  // 锚点的换行风格跟着被改文件走 (仓里 CRLF / LF 混着)。
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const from = mu.from.replace(/\n/g, eol);
  const to = mu.to.replace(/\n/g, eol);
  const hits = countOf(original, from);
  if (hits !== 1) {
    miss(`${mu.id} —— 锚点在 ${mu.file} 命中 ${hits} 处 (必须恰好 1 处)`);
    continue;
  }

  let out = "";
  let status = 0;
  let crashed = false;
  try {
    writeFileSync(abs, original.replace(from, to));
    const r = spawnSync(process.execPath, [mu.script], {
      cwd: MIRROR,
      encoding: "utf8",
      timeout: 180000,
    });
    status = r.status === null ? -1 : r.status;
    out = `${r.stdout || ""}${r.stderr || ""}`;
  } catch (err) {
    crashed = true;
    out = String(err && err.message ? err.message : err);
  } finally {
    writeFileSync(abs, original);
  }

  // 镜像文件还原必须逐字节一致 —— 否则后面的变异会跑在脏底座上。
  const restored = readFileSync(abs, "utf8") === original;
  if (!restored) {
    notRestored.push(mu.file);
    miss(`${mu.id} —— ★镜像还原失败★ ${mu.file} 已被改坏, 请重跑本脚本`);
    continue;
  }

  // 变红 = 退出码非 0 **且** 汇总行里 FAIL>0 **且** 出现预期的那条 ❌。
  const failMatch = out.match(/FAIL=(\d+)/);
  const failCount = failMatch ? Number(failMatch[1]) : 0;
  const turnedRed = status !== 0 && failCount > 0 && out.includes(mu.expect);
  const redLines = out
    .split(/\r?\n/)
    .filter((l) => l.includes("❌"))
    .map((l) => l.trim());

  if (turnedRed) {
    pass(`${mu.id} ⇒ 变红 (${mu.script}, FAIL=${failCount})`);
  } else if (crashed) {
    miss(`${mu.id} ⇒ 变异把断言脚本打崩了 (不是断言变红): ${out.slice(0, 200)}`);
  } else if (failCount === 0) {
    miss(
      `${mu.id} ⇒ ★没变红★ (${mu.script} 退出码 ${status}, FAIL=0) —— 这条断言没盯住`
    );
  } else {
    miss(
      `${mu.id} ⇒ 变红了, 但不是预期的那条 (期望出现「${mu.expect}」) —— 实际红的是:\n      ${redLines.join("\n      ") || "(没抓到 ❌ 行)"}`
    );
  }
}

// ---------------------------------------------------------------------------
// 收尾: 仓库工作区必须**逐字节没变** (变异只发生在镜像里)
// ---------------------------------------------------------------------------
{
  const touched = [...repoSnapshot.keys()].filter(
    (rel) => readFileSync(join(ROOT, rel), "utf8") !== repoSnapshot.get(rel),
  );
  touched.length === 0
    ? pass("★ 仓库工作区逐字节没变 (变异只发生在临时镜像里)")
    : miss(`★仓库工作区被改了: ${touched.join(", ")}`);
}

log("");
log("=== 汇总 ===");
if (notRestored.length) {
  console.log(`❌ 有 ${notRestored.length} 个文件没还原干净: ${notRestored.join(", ")}`);
}
if (fail === 0) {
  console.log(`✅ ${RUNS.length} 条变异全部被抓到 (每条断言都盯得住它该盯的行)`);
  console.log(`===PASS=${passCount} FAIL=${fail}===`);
} else {
  console.log(`❌ 有 ${fail} 条变异没被抓到 —— 对应断言是「假绿」`);
  console.log(`===PASS=${passCount} FAIL=${fail}===`);
}
log(`===EXIT=${fail === 0 ? 0 : 1}===`);
process.exit(fail === 0 ? 0 : 1);
