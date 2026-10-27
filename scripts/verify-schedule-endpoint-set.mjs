#!/usr/bin/env node
/**
 * verify-schedule-endpoint-set.mjs
 *
 * 端点集合三方比对 —— design §4.2 ↔ UX §9 ↔ PC 端 ScheduleEndpoint 联合类型。
 *
 * 契约口径 (design §4.6):
 *   - **42 个 method+path** / **28 个唯一路径**
 *   - 唯一路径 = 去掉 query string 后的**路由模板** (同一模板的不同 method 只算 1 个)
 *   - §4.2 写相对路径, UX §9 写全路径 —— 比对前统一补 `/api/v1/schedules` 前缀
 *
 * 契约文档在**兄弟仓** gaclaw (`gaclaw/docs/design/`), 不在本仓。
 *   - 路径解析: 环境变量 `GACLAW_DESIGN_DIR` > 默认 `<repo>/../gaclaw/docs/design`
 *   - 找不到契约文档时 → 退到**内嵌快照** (冻结于 a5e672b), 只比对 PC 端 vs 快照,
 *     并明确打印「未做实时比对」。**不静默跳过**。
 *
 * 退出码: 0 = 通过 / 1 = 不一致。
 *
 * 用法: node scripts/verify-schedule-endpoint-set.mjs
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PREFIX = "/api/v1/schedules";
const FREEZE_SHA = "a5e672b";

let fail = 0;
const pass = (m) => console.log(`  ✅ ${m}`);
const miss = (m) => { fail++; console.log(`  ❌ ${m}`); };
const note = (m) => console.log(`  ⚠️  ${m}`);
const log = (...a) => console.log(...a);

// ---------------------------------------------------------------------------
// 冻结快照 (SHA a5e672b) —— 契约文档不在本仓时的兜底基准
// ---------------------------------------------------------------------------
const FROZEN = [
  "GET /today",
  "GET /schedules",
  "GET /board",
  "GET /tasks",
  "GET /tasks/:id",
  "POST /tasks",
  "PATCH /tasks/:id",
  "DELETE /tasks/:id",
  "POST /subtasks",
  "GET /subtasks/:id",
  "PATCH /subtasks/:id",
  "DELETE /subtasks/:id",
  "POST /milestones",
  "GET /milestones/:id",
  "PATCH /milestones/:id",
  "DELETE /milestones/:id",
  "POST /milestones/:id/reminders",
  "PATCH /milestones/:id/reminders/:rid",
  "DELETE /milestones/:id/reminders/:rid",
  "POST /schedules",
  "GET /schedules/:id",
  "PATCH /schedules/:id",
  "DELETE /schedules/:id",
  "GET /crons",
  "GET /crons/:id",
  "PATCH /crons/:id",
  "DELETE /crons/:id",
  "POST /schedules/:id/reminders",
  "PATCH /schedules/:id/reminders/:rid",
  "DELETE /schedules/:id/reminders/:rid",
  "POST /tasks/:id/archive",
  "POST /tasks/:id/restore",
  "POST /subtasks/:id/archive",
  "POST /subtasks/:id/restore",
  "POST /milestones/:id/archive",
  "POST /milestones/:id/restore",
  "POST /schedules/:id/archive",
  "POST /schedules/:id/restore",
  "GET /tasks/archived",
  "GET /subtasks/archived",
  "GET /milestones/archived",
  "GET /schedules/archived",
];

// ---------------------------------------------------------------------------
// 归一化
// ---------------------------------------------------------------------------
/** "GET /api/v1/schedules/tasks?x=1" → "GET /tasks" (补前缀 + 去 query + 统一尾斜杠)。 */
const normalize = (method, rawPath) => {
  let p = rawPath.trim().replace(/\/+$/, "");
  if (!p.startsWith(PREFIX)) p = PREFIX + p;
  p = p.slice(PREFIX.length) || "/";
  p = p.split("?")[0];
  return `${method.toUpperCase()} ${p}`;
};

/** 唯一路径口径: 去掉 method, 只留路由模板。 */
const templates = (set) => new Set([...set].map((e) => e.slice(e.indexOf(" ") + 1)));

const diff = (a, b) => [...a].filter((x) => !b.has(x));

// ---------------------------------------------------------------------------
// ① PC 端: ScheduleEndpoint 联合类型 (读**本仓** src/lib/schedule-api.ts)
// ---------------------------------------------------------------------------
const apiSource = readFileSync(path.join(ROOT, "src/lib/schedule-api.ts"), "utf8");
const unionMatch = /export type ScheduleEndpoint =([\s\S]*?);/.exec(apiSource);
if (!unionMatch) {
  console.error("❌ 找不到 ScheduleEndpoint 联合类型");
  process.exit(1);
}
const pcRaw = [...unionMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const pcSet = new Set(pcRaw.map((e) => normalize(e.slice(0, e.indexOf(" ")), e.slice(e.indexOf(" ") + 1))));

log(`PC 端 ScheduleEndpoint: ${pcRaw.length} 条 method+path, ${templates(pcSet).size} 条唯一路径`);

// ---------------------------------------------------------------------------
// ② UX §9 —— 代码块里的 "METHOD /path" 行
// ---------------------------------------------------------------------------
const designDir = process.env.GACLAW_DESIGN_DIR
  ? path.resolve(process.env.GACLAW_DESIGN_DIR)
  : path.resolve(ROOT, "../gaclaw/docs/design");
const uxFile = path.join(designDir, "schedule-center-ux-2026-10-20.md");
const designFile = path.join(designDir, "schedule-center-design.md");

/** 取 §N 标题到下一个同级标题之间的正文。 */
const section = (md, startRe, endRe) => {
  const s = md.search(startRe);
  if (s < 0) return "";
  const e = md.slice(s + 1).search(endRe);
  return e < 0 ? md.slice(s) : md.slice(s, s + 1 + e);
};

let uxSet = null;
let designSet = null;
let live = false;

if (existsSync(uxFile) && existsSync(designFile)) {
  live = true;
  const uxMd = readFileSync(uxFile, "utf8");
  const designMd = readFileSync(designFile, "utf8");

  // UX §9: 只取代码块里的 METHOD 行
  const uxSec = section(uxMd, /^##\s*9\.\s*API 契约/m, /^##\s*10\./m);
  const uxSetRaw = new Set();
  for (const block of uxSec.matchAll(/```[\s\S]*?```/g)) {
    for (const line of block[0].split("\n")) {
      const m = /^\s*(GET|POST|PATCH|DELETE)\s+(\/[^\s]+)/.exec(line);
      if (!m) continue;
      if (m[2].includes("yinternal")) continue; // 服务间端点不属于用户端集合
      uxSetRaw.add(normalize(m[1], m[2]));
    }
  }
  uxSet = uxSetRaw;

  // design §4.2: 表格行 "| METHOD | `path` | ... |"
  const dSec = section(designMd, /^###\s*4\.2\s*用户端端点/m, /^###\s*4\.3\s/m);
  const dSetRaw = new Set();
  for (const line of dSec.split("\n")) {
    const m = /^\|\s*(GET|POST|PATCH|DELETE)\s*\|\s*`([^`]+)`/.exec(line);
    if (!m) continue;
    dSetRaw.add(normalize(m[1], m[2]));
  }
  designSet = dSetRaw;
} else {
  note(`契约文档不在 ${designDir} —— 退到内嵌快照 (冻结于 ${FREEZE_SHA})`);
}

const uxLabel = live ? "UX §9" : `UX §9 快照(${FREEZE_SHA})`;
const designLabel = live ? "design §4.2" : `design §4.2 快照(${FREEZE_SHA})`;
const uxRef = live ? uxSet : new Set(FROZEN);
const designRef = live ? designSet : new Set(FROZEN);

// ---------------------------------------------------------------------------
// 断言
// ---------------------------------------------------------------------------
log("");

const uxDiffA = diff(pcSet, uxRef);
const uxDiffB = diff(uxRef, pcSet);
uxDiffA.length === 0 && uxDiffB.length === 0
  ? pass(`PC 端 ↔ ${uxLabel}: 端点集合 **MATCH** (${pcSet.size} 条 method+path 双向零差集)`)
  : miss(`PC 端 ↔ ${uxLabel} 不一致 —— PC 多出 [${uxDiffA.join(", ")}] / 契约多出 [${uxDiffB.join(", ")}]`);

const dDiffA = diff(pcSet, designRef);
const dDiffB = diff(designRef, pcSet);
dDiffA.length === 0 && dDiffB.length === 0
  ? pass(`PC 端 ↔ ${designLabel}: 端点集合 **MATCH** (${pcSet.size} 条 method+path 双向零差集)`)
  : miss(`PC 端 ↔ ${designLabel} 不一致 —— PC 多出 [${dDiffA.join(", ")}] / 契约多出 [${dDiffB.join(", ")}]`);

pcSet.size === 42
  ? pass("method+path = 42 (契约 §4.6)")
  : miss(`method+path = ${pcSet.size}, 契约要求 42`);

templates(pcSet).size === 28
  ? pass("唯一路径 = 28 (去 query 后的路由模板, 契约 §4.6)")
  : miss(`唯一路径 = ${templates(pcSet).size}, 契约要求 28`);

// 冻结 SHA 必须与当前登记一致 —— 契约变了要立刻发现
const shaHits = [...apiSource.matchAll(/(?:冻结 SHA|三地一致 SHA|SHA)\s*[:：]?\s*`?([0-9a-f]{7,40})/g)].map((m) => m[1]);
const staleSha = shaHits.filter((s) => !s.startsWith(FREEZE_SHA));
staleSha.length === 0
  ? pass(`schedule-api.ts 内登记的冻结 SHA 全部指向 ${FREEZE_SHA}`)
  : miss(`schedule-api.ts 内还有过期 SHA: ${[...new Set(staleSha)].join(", ")} (当前应为 ${FREEZE_SHA})`);

log("");

if (fail > 0) {
  console.log(`❌ ${fail} 条端点集合不一致`);
  process.exit(1);
} else {
  console.log(
    live
      ? "✅ design §4.2 ↔ UX §9 ↔ PC 端 三方端点集合 MATCH (42 method+path / 28 唯一路径)"
      : `✅ PC 端端点集合 = 冻结快照 (42 method+path / 28 唯一路径) —— ⚠️ 本次未与契约文档实时比对`,
  );
}
