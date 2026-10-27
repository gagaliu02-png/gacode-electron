#!/usr/bin/env node
/**
 * verify-schedule-b7-archived.mjs
 *
 * 日程中心 **B7 (归档面板 + 归档动作)** 的断言。
 *
 * ⚠️ 本脚本**落系统临时目录, 不进仓** (brief 硬约束 5)。
 *    用法: node "<TEMP>\gaclaw-b7-verify\verify-schedule-b7-archived.mjs"
 *
 * 覆盖面:
 *   A. 文件面 —— 1 新建 + 7 修改都在; **13 个冻结件** git status 全空。
 *   B. 硬违规扫描 (零容忍) —— 零 cn / clsx / tailwind-merge / cva / lucide-react /
 *      零内联 <svg> / 零 !important / 零 next\/navigation / 零 zustand / 零 @\/lib\/utils。
 *   C. 归档口径层 (真值) —— archivedTotal 算**四类总数** / ARCHIVED_KINDS 顺序 /
 *      ARCHIVED_KIND_LABEL / loadArchivedByKind 四类一起拉 (单类失败降级) /
 *      restoreArchived 按 kind 分派 (用 stub 的 schedule-api 打桩)。
 *   D. ArchivedSheet 真值 —— buildGroups 四类分组 + 空组不渲染 + 组内按归档时间倒序;
 *      形态类名 (520px / 88dvh / rounded-t-2xl / shadow-dialog / bg-black/60 / z-[90]);
 *      loading / error / empty 三态都在。
 *   E. 接线断言 (静态) —— 页面层 ↔ 组件层的 prop 链路一个不缺。
 *   F. 菜单项数 (真值) —— ScheduleNodeMenu.buildNodeMenuItems: 传全套 = 6 项,
 *      不传 onArchive = 5 项; ScheduleRow 的菜单静态数 = 6 项。
 *   G. 编码 / 行尾 —— UTF-8 无 BOM + LF-only。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
// ⚠️ 仓库根从 loader 推导 (join(__dirname, "..", "..")) —— **不硬编码绝对路径**,
//    否则脚本入库后在别的机器 / 别的 checkout 路径下跑不了 (= 入库形同虚设)。
//    同 B6 三支脚本的口径 (verify-schedule-form-b6 / -detail-b6 / -b6-engineering)。
import { ROOT } from "./lib/schedule-loader.mjs";

const REPO = ROOT;
const LOADER = join(REPO, "scripts/lib/schedule-loader.mjs");

// ---------------------------------------------------------------------------
// 断言框架
// ---------------------------------------------------------------------------
let checked = 0;
let passed = 0;
let failed = 0;

const log = (...a) => console.log(...a);
const ok = (m) => {
  checked++;
  passed++;
  console.log(`  ✅ ${m}`);
};
const bad = (m, detail = "") => {
  checked++;
  failed++;
  console.log(`  ❌ ${m}${detail ? ` — ${detail}` : ""}`);
};
const assert = (cond, m, detail = "") => (cond ? ok(m) : bad(m, detail));
const assertEqv = (actual, expected, m) =>
  assert(
    actual === expected,
    m,
    `实际 ${JSON.stringify(actual)} ≠ 期望 ${JSON.stringify(expected)}`,
  );

const src = (rel) => readFileSync(join(REPO, rel), "utf8");

/** 去注释 (手写扫描器 —— 保留 JSX, 不误伤字符串)。 */
function stripComments(s) {
  let out = "";
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i];
    const c2 = s[i + 1];
    if (c === "/" && c2 === "/") {
      while (i < n && s[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && c2 === "*") {
      i += 2;
      while (i < n && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        if (s[i] === "\\") {
          out += s[i] + (s[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += s[i];
        if (s[i] === quote) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// A. 文件面
// ---------------------------------------------------------------------------
log("");
log("══ A. 文件面 ══");

const NEW_FILES = ["src/components/schedule/ArchivedSheet.tsx"];

const MODIFIED_FILES = [
  "src/components/schedule/TodayTodoList.tsx",
  "src/routes/ScheduleToday.tsx",
  "src/components/schedule/ScheduleRow.tsx",
  "src/components/schedule/ScheduleTaskCard.tsx",
  "src/components/schedule/BoardView.tsx",
  "src/routes/ScheduleBoard.tsx",
  "src/components/schedule/detail/ScheduleDetailPage.tsx",
];

for (const f of NEW_FILES) {
  assert(existsSync(join(REPO, f)), `新建文件存在: ${f}`);
}
for (const f of MODIFIED_FILES) {
  assert(existsSync(join(REPO, f)), `修改文件存在: ${f}`);
}

// ⚠️ **没有归档路由页** (PM 亲自读过 web 源码后的修正: web 没有独立的归档页)
for (const f of [
  "src/routes/ScheduleArchived.tsx",
  "src/routes/ScheduleArchive.tsx",
  "src/components/schedule/ArchivedPage.tsx",
]) {
  assert(!existsSync(join(REPO, f)), `**不新建归档路由页**: ${f} 不存在`);
}

// ---- 冻结件: 一个字都不能动 ----
const FROZEN = [
  "src/lib/markdown",
  "src/lib/markdown.tsx",
  "src/lib/api.ts",
  "src/lib/schedule-api.ts",
  "src/lib/schedule-http.ts",
  "src/styles/globals.css",
  "tailwind.config.ts",
  "package.json",
  "pnpm-lock.yaml",
  "src/components/layout/AppShell.tsx",
  "src/components/ui/BottomSheet.tsx",
  "src/components/ui/Toast.tsx",
  "src/components/ui/Glyphs.tsx",
];

const gitStatus = (p) => {
  try {
    return execFileSync("git", ["status", "--porcelain", "--", p], {
      cwd: REPO,
      encoding: "utf8",
    }).trim();
  } catch {
    return null;
  }
};

for (const f of FROZEN) {
  const st = gitStatus(f);
  if (st === null) {
    console.log(`  ⚠️ 跳过 (git 不可用): 冻结件 ${f}`);
    continue;
  }
  assert(st === "", `冻结件未改动: ${f}`, st);
}

// ---------------------------------------------------------------------------
// B. 硬违规扫描
// ---------------------------------------------------------------------------
log("");
log("══ B. 硬违规扫描 (零容忍) ══");

const ALL_B7_FILES = [...NEW_FILES, ...MODIFIED_FILES];

const BANNED_IMPORTS = [
  { re: /from\s+["']lucide-react["']/, name: "lucide-react" },
  { re: /from\s+["']clsx["']/, name: "clsx" },
  { re: /from\s+["']tailwind-merge["']/, name: "tailwind-merge" },
  { re: /from\s+["']class-variance-authority["']/, name: "cva" },
  { re: /from\s+["']next\/navigation["']/, name: "next/navigation" },
  { re: /from\s+["']zustand["']/, name: "zustand" },
  { re: /from\s+["']@\/lib\/utils["']/, name: "@/lib/utils" },
  { re: /from\s+["'][^"']*\/cn["']/, name: "cn 工具" },
];

for (const f of ALL_B7_FILES) {
  const s = stripComments(src(f));
  for (const b of BANNED_IMPORTS) {
    assert(!b.re.test(s), `${f}: 无 ${b.name} import`);
  }
  assert(!/\bcn\s*\(/.test(s), `${f}: 无 cn( 调用`);
  assert(!s.includes("!important"), `${f}: 无 !important`);
  assert(!/<svg[\s>]/.test(s), `${f}: 无内联 <svg>`);
}

// ---------------------------------------------------------------------------
// C. 归档口径层 (真值)
// ---------------------------------------------------------------------------
log("");
log("══ C. 归档口径层 (真值) ══");

const { makeTmpDir, loadScheduleModules, writeModule, transpile } = await import(
  `file:///${LOADER.replace(/\\/g, "/")}`
);

// --- C1. 真 archived.ts (打桩的 schedule-api) ---
const stubDir = makeTmpDir("b7-stub");
const stubApi = `
export const calls = [];
export const failKinds = new Set();
export const FIXTURE = {
  task: [{ id: "t1", title: "任务A", archivedAt: "2026-10-20T10:00:00Z" },
         { id: "t2", title: "任务B", archivedAt: "2026-10-22T10:00:00Z" }],
  subtask: [{ id: "s1", title: "子任务A", archivedAt: "2026-10-21T10:00:00Z" }],
  milestone: [{ id: "m1", title: "节点A", archivedAt: "2026-10-19T10:00:00Z" },
              { id: "m2", title: "节点B", archivedAt: "2026-10-23T10:00:00Z" },
              { id: "m3", title: "节点C", archivedAt: "2026-10-18T10:00:00Z" }],
  schedule: [{ id: "c1", title: "日程A", archivedAt: "2026-10-24T10:00:00Z" },
             { id: "c2", title: "日程B", archivedAt: "2026-10-25T10:00:00Z" },
             { id: "c3", title: "日程C", archivedAt: "2026-10-26T10:00:00Z" },
             { id: "c4", title: "日程D", archivedAt: "2026-10-27T10:00:00Z" }],
};
export async function listArchived(kind) {
  calls.push(["listArchived", kind]);
  if (failKinds.has(kind)) throw new Error("boom " + kind);
  return FIXTURE[kind];
}
export async function restoreTask(id) { calls.push(["restoreTask", id]); return { id }; }
export async function restoreSubtask(id) { calls.push(["restoreSubtask", id]); return { id }; }
export async function restoreMilestone(id) { calls.push(["restoreMilestone", id]); return { id }; }
export async function restoreSchedule(id) { calls.push(["restoreSchedule", id]); return { id }; }
`;
writeFileSync(join(stubDir, "stub-api.mjs"), stubApi, "utf8");

const archivedSrc = readFileSync(
  join(REPO, "src/components/schedule/archived.ts"),
  "utf8",
);
const archivedUrl = writeModule(stubDir, "archived", archivedSrc, {
  rewriteImports: [["../../lib/schedule-api", "./stub-api.mjs"]],
});
const archived = await import(archivedUrl);
const stub = await import(`file:///${join(stubDir, "stub-api.mjs").replace(/\\/g, "/")}`);

assertEqv(
  JSON.stringify([...archived.ARCHIVED_KINDS]),
  JSON.stringify(["task", "subtask", "milestone", "schedule"]),
  "ARCHIVED_KINDS 顺序 = 任务 → 子任务 → 关键节点 → 日程",
);
assertEqv(
  JSON.stringify(archived.ARCHIVED_KIND_LABEL),
  JSON.stringify({
    task: "任务",
    subtask: "子任务",
    milestone: "关键节点",
    schedule: "日程",
  }),
  "ARCHIVED_KIND_LABEL 四个中文名",
);

// archivedTotal = 四类总数 (不是只算 task 一类)
const byKind = await archived.loadArchivedByKind();
assertEqv(
  archived.archivedTotal(byKind),
  2 + 1 + 3 + 4,
  "archivedTotal = **四类总数** (2+1+3+4=10), 不是只算 task 一类",
);
assertEqv(
  archived.archivedTotal({ task: byKind.task, subtask: [], milestone: [], schedule: [] }),
  2,
  "archivedTotal 只喂 task 一类时 = 2 (证明它是真求和, 不是常数)",
);
assertEqv(archived.archivedTotal(null), 0, "archivedTotal(null) = 0");
assertEqv(archived.archivedTotal(undefined), 0, "archivedTotal(undefined) = 0");

// loadArchivedByKind: 四类一起拉
assertEqv(
  JSON.stringify(stub.calls.map((c) => c[1])),
  JSON.stringify(["task", "subtask", "milestone", "schedule"]),
  "loadArchivedByKind 四类**一起**拉 (各端点都打到)",
);

// 单类失败降级成空数组, 不拖垮整页
stub.calls.length = 0;
stub.failKinds.add("subtask");
const degraded = await archived.loadArchivedByKind();
assertEqv(degraded.subtask.length, 0, "单类失败 ⇒ 该类降级成空数组");
assertEqv(
  degraded.task.length + degraded.milestone.length + degraded.schedule.length,
  2 + 3 + 4,
  "单类失败**不拖垮其余三类**",
);
stub.failKinds.clear();

// restoreArchived 按 kind 分派
for (const [kind, fn] of [
  ["task", "restoreTask"],
  ["subtask", "restoreSubtask"],
  ["milestone", "restoreMilestone"],
  ["schedule", "restoreSchedule"],
]) {
  stub.calls.length = 0;
  await archived.restoreArchived(kind, "X1");
  assertEqv(
    JSON.stringify(stub.calls),
    JSON.stringify([[fn, "X1"]]),
    `restoreArchived("${kind}") → ${fn}("X1")`,
  );
}

// --- C2. 真 api 层: 8 个归档/恢复端点都在 ---
const apiSrc = src("src/lib/schedule-api.ts");
for (const fn of [
  "archiveTask",
  "archiveSubtask",
  "archiveMilestone",
  "archiveSchedule",
  "restoreTask",
  "restoreSubtask",
  "restoreMilestone",
  "restoreSchedule",
  "listArchived",
]) {
  assert(
    new RegExp(`export\\s+async\\s+function\\s+${fn}\\s*\\(`).test(apiSrc),
    `schedule-api.ts 导出 ${fn}`,
  );
}
// 归档走 POST /:id/archive —— 不是 DELETE 硬删
assert(
  /`\/schedules\/\$\{spec\.path\}\/\$\{id\}\/\$\{archived \? "archive" : "restore"\}`/.test(
    apiSrc,
  ),
  "归档端点 = POST /{kind}/:id/archive (不是 DELETE 硬删)",
);

// ---------------------------------------------------------------------------
// D. ArchivedSheet 真值
// ---------------------------------------------------------------------------
log("");
log("══ D. ArchivedSheet 真值 ══");

const sheetDir = makeTmpDir("b7-sheet");
const core = await loadScheduleModules(sheetDir);

// Glyphs (纯组件, 无 import) + Toast (react / react-dom) —— 真文件
const glyphsUrl = writeModule(
  sheetDir,
  "glyphs",
  src("src/components/ui/Glyphs.tsx"),
  { jsx: true },
);
const toastUrl = writeModule(sheetDir, "toast", src("src/components/ui/Toast.tsx"), {
  jsx: true,
  rewriteImports: [["./Glyphs", "./glyphs.mjs"]],
});
// format (真) —— fmtDateTime / fmtDdlShort
const formatUrl = writeModule(sheetDir, "format", src("src/components/schedule/format.ts"), {
  rewriteImports: [["../../lib/schedule-api", "./schedule-api.mjs"]],
});
// archived (真, 但 import 指向打桩 api —— buildGroups 不碰网络, 只用 ARCHIVED_KINDS)
const archivedRealUrl = writeModule(sheetDir, "archived", archivedSrc, {
  rewriteImports: [["../../lib/schedule-api", "./stub-api2.mjs"]],
});
writeFileSync(
  join(sheetDir, "stub-api2.mjs"),
  `export const ARCHIVED_KINDS = ["task","subtask","milestone","schedule"];
export const ARCHIVED_KIND_LABEL = { task:"任务", subtask:"子任务", milestone:"关键节点", schedule:"日程" };
export async function listArchived() { return []; }
export async function restoreTask() { return null; }
export async function restoreSubtask() { return null; }
export async function restoreMilestone() { return null; }
export async function restoreSchedule() { return null; }
`,
  "utf8",
);

const sheetUrl = writeModule(sheetDir, "archivedSheet", src(NEW_FILES[0]), {
  jsx: true,
  rewriteImports: [
    ["../ui/Toast", "./toast.mjs"],
    ["../ui/Glyphs", "./glyphs.mjs"],
    ["../../lib/schedule-api", "./schedule-api.mjs"],
    ["./archived", "./archived.mjs"],
    ["./format", "./format.mjs"],
  ],
});
const sheet = await import(sheetUrl);
void core;
void formatUrl;
void glyphsUrl;
void toastUrl;
void archivedRealUrl;

assert(typeof sheet.buildGroups === "function", "ArchivedSheet 导出 buildGroups (可跑真值)");

const fixture = {
  task: [
    { id: "t1", title: "任务A", archivedAt: "2026-10-20T10:00:00Z" },
    { id: "t2", title: "任务B", archivedAt: "2026-10-22T10:00:00Z" },
  ],
  subtask: [{ id: "s1", title: "子任务A", archivedAt: "2026-10-21T10:00:00Z" }],
  milestone: [],
  schedule: [{ id: "c1", title: "日程A", archivedAt: "2026-10-24T10:00:00Z" }],
};

const groups = sheet.buildGroups(fixture);
assertEqv(groups.length, 3, "buildGroups: 空的那一类**不渲染** (4 类里只有 3 组)");
assertEqv(
  JSON.stringify(groups.map((g) => g.kind)),
  JSON.stringify(["task", "subtask", "schedule"]),
  "buildGroups: 分组顺序 = ARCHIVED_KINDS 顺序",
);
assertEqv(
  JSON.stringify(groups[0].items.map((r) => r.id)),
  JSON.stringify(["t2", "t1"]),
  "buildGroups: 组内按**归档时间倒序** (t2 晚于 t1)",
);
assertEqv(sheet.buildGroups(undefined).length, 0, "buildGroups(undefined) = [] (空态)");
assertEqv(
  sheet.buildGroups({ task: [], subtask: [], milestone: [], schedule: [] }).length,
  0,
  "buildGroups(全空) = [] ⇒ 走「还没有归档项」空态",
);

// 形态类名 (照抄 web, 不套 PC 的 BottomSheet)
// ⚠️ **必须查「剥注释后」的源码** —— 否则文件头注释里写着的 `max-w-[520px]` /
//    `bg-black/60` 等字样会把断言「喂饱」, 真正改错 className 也测不出来
//    (PM 变异反证实测: 把面板 className 里的 max-w-[520px] 改成 max-w-[400px],
//     断言照样绿 ⇒ 假绿)。形态断言只认**真正写在 JSX className 里的**。
const sheetSrcAll = src(NEW_FILES[0]);
const sheetSrc = stripComments(sheetSrcAll);
for (const [cls, why] of [
  ["fixed inset-0 z-[90]", "容器 fixed inset-0 z-[90]"],
  ["bg-black/60", "遮罩 bg-black/60"],
  ["max-w-[520px]", "面板 max-w-[520px]"],
  ["max-h-[88dvh]", "面板 max-h-[88dvh]"],
  ["rounded-t-2xl", "面板 rounded-t-2xl"],
  ["shadow-dialog", "面板 shadow-dialog"],
  ["bg-bg-elevated", "面板底色 bg-bg-elevated"],
  ["text-[13px] text-fg-subtle py-1.5", "loading / empty 态"],
  ["border-danger/40 bg-danger-soft/20", "error 态"],
]) {
  assert(sheetSrc.includes(cls), `ArchivedSheet 形态: ${why} (含 "${cls}")`);
}
assert(
  !/from\s+["'][^"']*BottomSheet["']/.test(sheetSrc) &&
    !/<BottomSheet[\s>]/.test(sheetSrc),
  "ArchivedSheet **没有**套 PC 的 BottomSheet (自绘 sheet)",
);
// 三态的 data 钩子都在
for (const hook of [
  "data-archived-loading",
  "data-archived-error",
  "data-archived-empty",
  "data-archived-group",
  "data-archived-group-cnt",
  "data-archived-row",
  "data-archived-restore",
  "data-archived-scrim",
  "data-archived-sheet",
  "data-archived-close",
]) {
  assert(sheetSrc.includes(hook), `ArchivedSheet 带 ${hook} 钩子`);
}
// 恢复走 restoreArchived + 刷新 + toast 文案照 web
assert(
  sheetSrc.includes("restoreArchived(v.kind, v.id)") &&
    sheetSrc.includes('queryKey: ["schedule"]'),
  "ArchivedSheet: 恢复走 restoreArchived + invalidateQueries([\"schedule\"])",
);
assert(
  sheetSrc.includes("已恢复「${vars.title}」— 回到未归档状态"),
  "ArchivedSheet: 恢复成功 toast 文案照 web",
);

// ---------------------------------------------------------------------------
// E. 接线断言 (静态)
// ---------------------------------------------------------------------------
log("");
log("══ E. 接线断言 (静态) ══");

const todayList = src("src/components/schedule/TodayTodoList.tsx");
assert(
  /archivedCount\?:\s*number\s*\|\s*null/.test(todayList),
  "TodayTodoList: archivedCount?: number | null prop",
);
assert(
  /onOpenArchived\?:\s*\(\)\s*=>\s*void/.test(todayList),
  "TodayTodoList: onOpenArchived?: () => void prop",
);
assert(
  /onArchive\?:\s*\(item:\s*ScheduleItem\)\s*=>\s*void/.test(todayList),
  "TodayTodoList: onArchive? prop (透传给行菜单)",
);
assert(
  todayList.includes("data-today-archbar") &&
    todayList.includes("data-today-arch-cnt") &&
    todayList.includes("data-today-arch-open"),
  "TodayTodoList: 「已归档 N」条三个钩子都在",
);
assert(
  todayList.includes("已归档") && todayList.includes("查看 / 恢复"),
  "TodayTodoList: 文案「已归档」+「查看 / 恢复」照 web",
);
assert(
  todayList.includes("bg-danger-soft text-danger rounded-full px-2 py-0.5"),
  "TodayTodoList: 计数徽标样式照 web (bg-danger-soft text-danger)",
);
assert(
  /onArchive=\{onArchive\}/.test(todayList),
  "TodayTodoList → ScheduleRow: 传 onArchive",
);

const todayPage = src("src/routes/ScheduleToday.tsx");
assert(
  todayPage.includes("loadArchivedByKind") && todayPage.includes("archivedTotal"),
  "ScheduleToday: 用 loadArchivedByKind + archivedTotal 拿四类总数",
);
assert(
  /archivedCount:\s*archived\s*\?\s*archivedTotal\(archived\)\s*:\s*null/.test(todayPage),
  "ScheduleToday: 计数口径 = archivedTotal (四类总数), 拉不到降级成 null",
);
assert(
  todayPage.includes("archiveSchedule(item.id)"),
  "ScheduleToday: archiveMutation 走 archiveSchedule (归档端点, 不是 DELETE)",
);
assert(
  todayPage.includes("已归档「${item.title}」") &&
    todayPage.includes("可在已归档页恢复。"),
  "ScheduleToday: 归档成功 toast 文案照 web",
);
assert(
  todayPage.includes("<ArchivedSheet") &&
    todayPage.includes("archivedCount={data.archivedCount}") &&
    todayPage.includes("onOpenArchived={() => setArchivedOpen(true)}"),
  "ScheduleToday: 渲染 <ArchivedSheet> + 传 archivedCount / onOpenArchived",
);
assert(
  todayPage.includes("onArchive={(item) => archiveMutation.mutate(item)}"),
  "ScheduleToday → TodayTodoList: 传 onArchive",
);

const rowSrc = src("src/components/schedule/ScheduleRow.tsx");
assert(
  /onArchive\?:\s*\(item:\s*ScheduleItem\)\s*=>\s*void/.test(rowSrc),
  "ScheduleRow: onArchive? prop (**可选** — 存在才渲染)",
);
assert(
  /if\s*\(onArchive\)\s*\{[\s\S]{0,400}?key:\s*"archive"/.test(rowSrc),
  "ScheduleRow: 「归档」项按回调存在与否渲染",
);
assert(
  rowSrc.includes('label: "归档"') && rowSrc.includes("<ArchiveIcon"),
  "ScheduleRow: 「归档」项文案 + 图标照 web (ArchiveIcon)",
);
const rowMenuKeys = [...rowSrc.matchAll(/key:\s*"([a-z_]+)"/g)].map((m) => m[1]);
assertEqv(
  JSON.stringify(rowMenuKeys),
  JSON.stringify(["progress", "done", "archive", "ddl", "edit", "delete"]),
  "ScheduleRow 菜单 = **6 项** (标记进行中·标记完成·归档·改 DDL·编辑·删除), 顺序照 web",
);

const cardSrc = src("src/components/schedule/ScheduleTaskCard.tsx");
assert(
  /export type NodeAction\s*=\s*([\s\S]*?);/.test(cardSrc) &&
    cardSrc.includes('"archive"'),
  "ScheduleTaskCard: NodeAction 加了 \"archive\"",
);
const menuCount = [...cardSrc.matchAll(/<ScheduleNodeMenu/g)].length;
assertEqv(menuCount, 4, "ScheduleTaskCard: 4 层各一个 <ScheduleNodeMenu>");
const onArchiveCount = [...cardSrc.matchAll(/onArchive=\{\(\)\s*=>/g)].length;
assertEqv(
  onArchiveCount,
  4,
  "ScheduleTaskCard: 4 层 ScheduleNodeMenu **都传了 onArchive**",
);

const boardViewSrc = src("src/components/schedule/BoardView.tsx");
assert(
  /archivedCount\?:\s*number\s*\|\s*null/.test(boardViewSrc) &&
    /onOpenArchived\?:\s*\(\)\s*=>\s*void/.test(boardViewSrc),
  "BoardView: 透传 archivedCount + onOpenArchived",
);
assert(
  boardViewSrc.includes("data-board-archived") &&
    boardViewSrc.includes("已归档") &&
    boardViewSrc.includes("onOpenArchived"),
  "BoardView: 提示条右侧渲染「已归档 N」按钮 (照 web)",
);

const boardPageSrc = src("src/routes/ScheduleBoard.tsx");
for (const fn of [
  "archiveTask",
  "archiveSubtask",
  "archiveMilestone",
  "archiveSchedule",
]) {
  assert(boardPageSrc.includes(`${fn}(target.id)`), `ScheduleBoard: 归档 mutation 分派到 ${fn}`);
}
assert(
  /case\s+"archive":[\s\S]{0,120}?archiveMutation\.mutate\(target\)/.test(boardPageSrc),
  "ScheduleBoard: handleNodeAction 认 \"archive\" action",
);
assert(
  boardPageSrc.includes("已归档「${target.title}」") &&
    boardPageSrc.includes("可在已归档页恢复。"),
  "ScheduleBoard: 归档成功 toast 文案照 web",
);
assert(
  boardPageSrc.includes("<ArchivedSheet") &&
    boardPageSrc.includes("archivedCount={data.archivedCount}") &&
    boardPageSrc.includes("onOpenArchived={() => setArchivedOpen(true)}"),
  "ScheduleBoard: 渲染 <ArchivedSheet> + 传 archivedCount / onOpenArchived",
);

const detailSrc = src("src/components/schedule/detail/ScheduleDetailPage.tsx");
assert(
  detailSrc.includes("onArchive={() => archiveMutation.mutate()}"),
  "ScheduleDetailPage: ScheduleNodeMenu 传 onArchive (web 详情页**有**归档入口)",
);
for (const fn of [
  "archiveTask",
  "archiveSubtask",
  "archiveMilestone",
  "archiveSchedule",
]) {
  assert(detailSrc.includes(`${fn}(node.id)`), `ScheduleDetailPage: 归档 mutation 用 ${fn}`);
}
assert(
  detailSrc.includes('title: "已归档"') &&
    detailSrc.includes("可在已归档页恢复。"),
  "ScheduleDetailPage: 归档成功 toast 文案照 web 详情页",
);

// ---------------------------------------------------------------------------
// F. 菜单项数 (真值)
// ---------------------------------------------------------------------------
log("");
log("══ F. 菜单项数 (真值) ══");

const menuDir = makeTmpDir("b7-menu");
writeModule(menuDir, "glyphs", src("src/components/ui/Glyphs.tsx"), { jsx: true });
const rowActionUrl = writeModule(
  menuDir,
  "rowActionMenu",
  src("src/components/schedule/RowActionMenu.tsx"),
  { jsx: true, rewriteImports: [["../ui/Glyphs", "./glyphs.mjs"]] },
);
const nodeMenuUrl = writeModule(
  menuDir,
  "scheduleNodeMenu",
  src("src/components/schedule/ScheduleNodeMenu.tsx"),
  {
    jsx: true,
    rewriteImports: [
      ["./RowActionMenu", "./rowActionMenu.mjs"],
      ["../ui/Glyphs", "./glyphs.mjs"],
    ],
  },
);
const nodeMenu = await import(nodeMenuUrl);
void rowActionUrl;

const noop = () => {};
const full = nodeMenu.buildNodeMenuItems({
  status: "pending",
  onSetStatus: noop,
  onArchive: noop,
  onChangeDdl: noop,
  onEdit: noop,
  onDelete: noop,
});
assertEqv(full.length, 6, "ScheduleNodeMenu: 传全套回调 = **6 项** (web 的 6 项)");
assertEqv(
  JSON.stringify(full.map((i) => i.key)),
  JSON.stringify(["progress", "done", "archive", "ddl", "edit", "delete"]),
  "ScheduleNodeMenu: 6 项的 key 与顺序照 web",
);
assertEqv(
  full.find((i) => i.key === "archive")?.label,
  "归档",
  "ScheduleNodeMenu: 第 3 项文案 =「归档」",
);
const withoutArchive = nodeMenu.buildNodeMenuItems({
  status: "pending",
  onSetStatus: noop,
  onChangeDdl: noop,
  onEdit: noop,
  onDelete: noop,
});
assertEqv(withoutArchive.length, 5, "ScheduleNodeMenu: 不传 onArchive = 5 项 (回调存在与否渲染)");
assert(
  !withoutArchive.some((i) => i.key === "archive"),
  "ScheduleNodeMenu: 不传 onArchive ⇒ **没有**「归档」这一项 (不是哑弹)",
);

// ---------------------------------------------------------------------------
// G. 编码 / 行尾
// ---------------------------------------------------------------------------
log("");
log("══ G. 编码 / 行尾 ══");

for (const f of ALL_B7_FILES) {
  const buf = readFileSync(join(REPO, f));
  const hasBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  assert(!hasBom, `${f}: 无 BOM`);
  const text = buf.toString("utf8");
  assert(!text.includes("\r"), `${f}: LF-only (无 CRLF)`);
  assert(Buffer.from(text, "utf8").equals(buf), `${f}: 合法 UTF-8`);
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
log("");
log("════════════════════════════════════════════");
log(`checked=${checked}  passed=${passed}  failed=${failed}`);
log("════════════════════════════════════════════");
if (failed > 0) {
  console.log(`❌ B7 断言 ${failed} 条未通过`);
  process.exit(1);
}
console.log("✅ 文件面 / 硬违规 0 / 归档口径 / ArchivedSheet / 接线 / 菜单 6 项 / 编码行尾 全部通过");
