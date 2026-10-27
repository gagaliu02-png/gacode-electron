#!/usr/bin/env node
/**
 * verify-schedule-detail-b6.mjs
 *
 * 日程中心 **B6 · 详情页** 的断言 (5 种详情: 任务 / 子任务 / 关键节点 / 日程 / 定时任务)。
 *
 * 覆盖面 (照 brief §6.4 / §6.5 + 交底 §8.4 / §8.5):
 *   A. **5 条详情路由** —— App.tsx 路由表 + ScheduleDetailRoutes.tsx 薄壳 (无尾斜杠)。
 *   B. **bound 三处写法** —— 详情页 edit/delay (无回退) · 详情页新建下级 (有回退) ·
 *      看板页 (findBoardNode)。**三处写法不一样**, 别统一抄成一种。
 *   C. **详情页容器** (ScheduleDetailPage.tsx) —— 结构 / 写操作 / 表单接入 / 新建分流。
 *   D. **详情页视图** (ScheduleDetailView.tsx) —— 排版锚点 / chip / 面包屑 / 子项列表。
 *   E. **cron 只读页** (CronDetailView.tsx) —— 恰好两个动作, **没有编辑入口**。
 *   F. **detailModel 运行时** —— 子项分组 / 新建分流 / 祖先链 / 提醒摘要 / 渠道中文名 /
 *      状态来源 / kind 判定 (真函数 + 真 `buildFlatIndex` 造的树)。
 *   G. **通知落点** —— 日程通知点得进真详情路由 (PC HashRouter ⇒ 不带尾斜杠)。
 *   H. **归档 = B7** —— 本批**一律不传** `onArchive` ⇒ 菜单里没有「归档」这一项。
 *   I. **三处入口** —— 今日待办 / 日历 / 看板 都能开表单 + 跳真详情路由。
 *
 * ⚠️ **不依赖任何测试框架** —— PC 仓没有 jsdom / react-test-renderer / @testing-library,
 *    也装不了 (package.json 是冻结件) ⇒ 本脚本是**纯 node** 脚本:
 *      - 纯逻辑层 (detailModel) + api 层 (buildFlatIndex) 用 `scripts/lib/schedule-loader.mjs`
 *        转译成 ESM 落到**系统临时目录**再 import (编译产物不进仓);
 *      - UI 层 (React) 没有 DOM ⇒ 用**源码文本断言**拿结构。
 *
 * 用法: node scripts/verify-schedule-detail-b6.mjs
 * 退出码: 0 = 全过 / 1 = 有失败。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeTmpDir, writeModule, loadScheduleLogic, ROOT } from "./lib/schedule-loader.mjs";

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
const assertEq = (actual, expected, m) =>
  assert(
    Array.isArray(actual) &&
      actual.length === expected.length &&
      actual.every((v, i) => v === expected[i]),
    m,
    `实际 [${JSON.stringify(actual)}] ≠ 期望 [${JSON.stringify(expected)}]`,
  );

/** 标量相等 (assertEq 只吃数组)。 */
const assertEqv = (actual, expected, m) =>
  assert(
    actual === expected,
    m,
    `实际 ${JSON.stringify(actual)} ≠ 期望 ${JSON.stringify(expected)}`,
  );

/** 深层相等 (对象 / 数组 —— 按 JSON 逐字比)。 */
const assertDeep = (actual, expected, m) =>
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    m,
    `实际 ${JSON.stringify(actual)} ≠ 期望 ${JSON.stringify(expected)}`,
  );

const src = (rel) => readFileSync(join(ROOT, rel), "utf8");

/**
 * 去注释 (手写扫描器 —— 保留 JSX, 不误伤字符串)。
 *
 * ⚠️ 为什么必须去: 本仓的文件头把「口径说明」写在注释里 ——
 *    比如 `?? parent.ddl` (说明「**无**这个回退」)、`!important` (说明「不用它」)、
 *    `--cron-soft` (说明「PC 没有这个变量」) —— 直接 grep 原文会**误判成违规**。
 *    断言「代码里没有 X」时必须只看**去注释后的代码**。
 *
 * ⚠️ 为什么不用 `ts.transpileModule`: 它会把 JSX **编译掉**
 *    (`<CronDetailView />` → `jsx(CronDetailView, …)`) ⇒ JSX 结构的断言会全部失效。
 */
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

/** 出现次数 (静态文本断言)。 */
const countOf = (hay, needle) => hay.split(needle).length - 1;

const PAGE = "src/components/schedule/detail/ScheduleDetailPage.tsx";
const VIEW = "src/components/schedule/detail/ScheduleDetailView.tsx";
const CRON = "src/components/schedule/detail/CronDetailView.tsx";
const ROUTES = "src/routes/ScheduleDetailRoutes.tsx";

const pageSrc = src(PAGE);
const viewSrc = src(VIEW);
const cronSrc = src(CRON);
const routesSrc = src(ROUTES);
const appSrc = src("src/App.tsx");
const notifSrc = src("src/lib/notifications.ts");
const notifSseSrc = src("src/lib/notifications-sse.ts");

// 去注释后的代码 (「代码里没有 X」类断言只看这份)
const pageCode = stripComments(pageSrc);
const viewCode = stripComments(viewSrc);
const cronCode = stripComments(cronSrc);
const appCode = stripComments(appSrc);

// ---------------------------------------------------------------------------
// A. 5 条详情路由
// ---------------------------------------------------------------------------
log("");
log("══ A. 5 条详情路由 ══");

const DETAIL_ROUTES = [
  { path: "/schedule/task/:id", comp: "ScheduleTaskDetailRoute", kind: "task" },
  { path: "/schedule/subtask/:id", comp: "ScheduleSubtaskDetailRoute", kind: "subtask" },
  { path: "/schedule/milestone/:id", comp: "ScheduleMilestoneDetailRoute", kind: "milestone" },
  { path: "/schedule/schedule/:id", comp: "ScheduleScheduleDetailRoute", kind: "schedule" },
  { path: "/schedule/cron/:id", comp: "ScheduleCronDetailRoute", kind: "cron" },
];

for (const r of DETAIL_ROUTES) {
  assert(
    appSrc.includes(`path="${r.path}"`),
    `App.tsx 注册路由 ${r.path}`,
    "没找到 path=" + JSON.stringify(r.path),
  );
  assert(
    appSrc.includes(`<${r.comp} />`),
    `App.tsx 用 ${r.comp} 渲染 ${r.path}`,
  );
  // 每条路由都必须被 <Protected> 包住 (未登录不能看详情)
  const idx = appSrc.indexOf(`path="${r.path}"`);
  const tail = appSrc.slice(idx, idx + 260);
  assert(
    tail.includes("<Protected>") && tail.includes("</Protected>"),
    `${r.path} 被 <Protected> 包住`,
    tail.slice(0, 160).replace(/\s+/g, " "),
  );
}

// 不用通配 (会跟 /schedule/calendar · /schedule/board 歧义)
assert(
  !appCode.includes('path="/schedule/:kind/:id"'),
  "App.tsx **不用** /schedule/:kind/:id 通配 (跟 calendar / board 歧义)",
);
assert(
  !appCode.includes('path="/schedule/:kind"'),
  "App.tsx **不用** /schedule/:kind 两段通配",
);

// PC 是 HashRouter ⇒ 路由**不带尾斜杠**
for (const r of DETAIL_ROUTES) {
  assert(!r.path.endsWith("/"), `${r.path} 不带尾斜杠 (HashRouter)`);
}
assert(
  !pageSrc.includes("`/schedule/${kind}/${id}/`"),
  "detailPath 不带尾斜杠",
);
assert(
  /export function detailPath\(kind: DetailPageKind, id: string\): string \{\s*return `\/schedule\/\$\{kind\}\/\$\{id\}`;/.test(
    pageSrc,
  ),
  "detailPath(kind, id) = `/schedule/${kind}/${id}`",
);

// 薄壳: 5 个具名导出 + 各自渲染对应 kind
for (const r of DETAIL_ROUTES) {
  assert(
    routesSrc.includes(`kind="${r.kind}"`),
    `ScheduleDetailRoutes.tsx 渲染 kind="${r.kind}"`,
  );
}
assert(
  countOf(routesSrc, "export function Schedule") === 5,
  "ScheduleDetailRoutes.tsx 恰好 5 个具名导出",
  `实际 ${countOf(routesSrc, "export function Schedule")}`,
);
assert(routesSrc.includes("useParams"), "ScheduleDetailRoutes.tsx 用 useParams 取 id");

// ---------------------------------------------------------------------------
// B. bound 三处写法 (交底 §3.3)
// ---------------------------------------------------------------------------
log("");
log("══ B. bound 三处写法 ══");

const boundEdit = "ddl: tree?.effectiveDdl(parent) ?? null,";
const boundCreate = "ddl: tree?.effectiveDdl(node) ?? node.ddl ?? null,";

assertEqv(
  countOf(pageCode, boundEdit),
  2,
  "详情页 edit + delay 两处 bound = `tree?.effectiveDdl(parent) ?? null` (无回退)",
);
assert(
  pageCode.includes(boundCreate),
  "详情页新建下级 bound = `tree?.effectiveDdl(node) ?? node.ddl ?? null` (有回退)",
);
assert(
  !pageCode.includes("?? parent.ddl"),
  "详情页**没有** `?? parent.ddl` 回退 (edit/delay 用法)",
);
assertEqv(
  countOf(pageCode, boundCreate),
  1,
  "详情页新建下级那一处 bound 只出现 1 次",
);
assert(
  pageCode.includes("const parent = tree?.parentOf(node) ?? null;"),
  "详情页 bound 走 `tree?.parentOf(node)`",
);

// 看板页: 走 findBoardNode (不是 effectiveDdl)
const boardSrc = src("src/routes/ScheduleBoard.tsx");
assert(
  boardSrc.includes("findBoardNode(boardColumns, target.id)"),
  "看板页 bound 走 findBoardNode",
);
assert(
  boardSrc.includes("ddl: f.parentEffectiveDdl,"),
  "看板页 bound = 父级 effectiveDdl (f.parentEffectiveDdl)",
);
assert(
  boardSrc.includes("parentEffectiveDdl: parent ? tree.effectiveDdl(parent) : null,"),
  "findBoardNode 里 parentEffectiveDdl = tree.effectiveDdl(parent)",
);

// ---------------------------------------------------------------------------
// C. 详情页容器
// ---------------------------------------------------------------------------
log("");
log("══ C. 详情页容器 (ScheduleDetailPage.tsx) ══");

assert(
  pageSrc.includes("export function ScheduleDetailPage("),
  "ScheduleDetailPage 具名导出",
);
assert(
  !/export default/.test(pageSrc),
  "ScheduleDetailPage **没有** default 导出 (PC 统一具名导出)",
);
assert(
  pageSrc.includes('queryKey: ["schedule", "detail", kind, id]'),
  "详情页 queryKey = [schedule, detail, kind, id]",
);
assert(
  pageSrc.includes("getTaskById") &&
    pageSrc.includes("getSubtaskById") &&
    pageSrc.includes("getMilestoneById") &&
    pageSrc.includes("getScheduleById") &&
    pageSrc.includes("getCronJobById"),
  "详情页走 5 个单条 GET 端点",
);
assert(
  pageSrc.includes("buildFlatIndex({ tasks, schedules })"),
  "详情页用 buildFlatIndex 造树 (祖先链 / 有效 DDL)",
);
assert(
  pageSrc.includes("collectAncestors(node, tree)") &&
    pageSrc.includes("collectChildren(node, lists)"),
  "详情页用 collectAncestors / collectChildren",
);
assert(
  pageSrc.includes("remindSummary("),
  "详情页用 remindSummary 算提醒摘要",
);
assert(
  pageSrc.includes("statusSourceText("),
  "详情页用 statusSourceText 算状态来源 chip",
);

// 表单接入: 三个 mode 都走同一个 ScheduleFormSheet
assert(pageSrc.includes("<ScheduleFormSheet"), "详情页挂 ScheduleFormSheet");
assert(
  pageSrc.includes('mode={form?.mode ?? "edit"}') &&
    pageSrc.includes("kind={form?.kind ?? nodeKind}"),
  "表单的 mode / kind 由 state 驱动",
);
assert(
  pageSrc.includes('mode: "edit"') && pageSrc.includes('mode: "delay"') && pageSrc.includes('mode: "create"'),
  "详情页三个 mode: edit / delay / create",
);

// 新建分流: 任务→子任务→关键节点→日程
assert(
  pageSrc.includes("nextCreateKind(nodeKind)") && pageSrc.includes("nextCreateLabel(nodeKind)"),
  "详情页新建入口按 kind 分流 (nextCreateKind / nextCreateLabel)",
);
assert(pageSrc.includes("data-detail-create"), "详情页新建入口有 data-detail-create 锚点");

// 写操作: 改 DDL 只发 ddl; 编辑发整份 body
assert(
  pageSrc.includes("updateTask(node.id, { ddl: ddlIso(values) })") &&
    pageSrc.includes("updateSubtask(node.id, { ddl: ddlIso(values) })") &&
    pageSrc.includes("updateMilestone(node.id, { ddl: ddlIso(values) })") &&
    pageSrc.includes("updateSchedule(node.id, { ddl: ddlIso(values) })"),
  "改 DDL 四个 kind 都只发 { ddl }",
);
assert(
  pageSrc.includes('updateMilestone(node.id, milestoneBody(values, "edit"))'),
  "编辑关键节点走 milestoneBody (带 title —— 旧实现漏了 title)",
);
assert(
  pageSrc.includes('updateSchedule(node.id, scheduleBody(values, "edit"))'),
  "编辑日程走 scheduleBody",
);
assert(
  pageSrc.includes('taskBody(values, "edit", "task")') &&
    pageSrc.includes('taskBody(values, "edit", "subtask")'),
  "编辑任务 / 子任务走 taskBody",
);

// 提醒同步: 关键节点 / 日程走独立提醒端点
assert(
  pageSrc.includes('syncReminders("milestone", node.id, values'),
  "编辑关键节点同步 /milestones/:id/reminders",
);
assert(
  pageSrc.includes('syncReminders("schedule", node.id, values'),
  "编辑日程同步 /schedules/:id/reminders",
);

// 跨天日程: 结束日期用 endDateOf
assert(
  pageSrc.includes("scheduleLocalToIso(endDateOf(values), values.end)"),
  "新建日程的 endAt 用 endDateOf(values) (跨天日程)",
);

// 写完重新拉详情
assert(
  pageSrc.includes('queryClient.invalidateQueries({ queryKey: ["schedule"] })'),
  "写操作后 invalidateQueries([schedule]) → 详情重拉",
);

// 删除有二次确认
assert(pageSrc.includes("<ScheduleConfirmDialog"), "详情页删除有二次确认");

// ---------------------------------------------------------------------------
// D. 详情页视图
// ---------------------------------------------------------------------------
log("");
log("══ D. 详情页视图 (ScheduleDetailView.tsx) ══");

for (const anchor of [
  "data-detail-back",
  "data-detail-edit",
  "data-detail-title",
  "data-detail-chips",
  "data-detail-ddl",
  "data-detail-owner",
  "data-detail-note",
  "data-detail-crumb",
  "data-detail-children",
  "data-detail-empty",
]) {
  assert(viewSrc.includes(anchor), `视图有 ${anchor} 锚点`);
}
assert(viewSrc.includes("data-detail-child={c.id}"), "子项有 data-detail-child={id} 锚点");
assert(viewSrc.includes("data-detail-start"), "「开始时间」行有 data-detail-start 锚点");
assert(viewSrc.includes("DETAIL_TITLE_CLASS[kind]"), "标题字号按 kind 取 DETAIL_TITLE_CLASS");
assert(
  viewSrc.includes("CHILD_NAME_CLASS[childLevel(c.kind)]"),
  "子项字号按层级取 CHILD_NAME_CLASS[childLevel(kind)]",
);
assert(viewSrc.includes("STATUS_LABEL[status]"), "状态 chip 用 STATUS_LABEL");
assert(viewSrc.includes("statusChipClass(status)"), "状态 chip 配色用 statusChipClass");
assert(viewSrc.includes("childGroupTitle(kind)"), "子项分组标题用 childGroupTitle(kind)");
assert(
  viewSrc.includes("{startText && ("),
  "startAt 可空 ⇒ 没值**整行不渲染** (不显示 —)",
);
assert(
  viewCode.includes("max-[640px]:!mt-0"),
  "冲突类名用 `!` 前缀 (max-[640px]:!mt-0), 不用 !important",
);
assert(!viewCode.includes("!important"), "视图**没有** !important");

// ---------------------------------------------------------------------------
// E. cron 只读页
// ---------------------------------------------------------------------------
log("");
log("══ E. cron 只读页 (CronDetailView.tsx) ══");

assert(cronSrc.includes("export function CronDetailView("), "CronDetailView 具名导出");
assert(
  !cronSrc.includes("data-detail-edit") && !cronSrc.includes("PencilIcon"),
  "cron 详情页**没有**编辑按钮 (只读降级)",
);
assert(cronSrc.includes("data-cron-toggle"), "cron 详情页有暂停/启用按钮");
assert(cronSrc.includes("data-cron-delete"), "cron 详情页有删除按钮");
assert(cronSrc.includes("describeCron(job.cronExpr)"), "cron 详情页规则用 describeCron");
assert(
  cronSrc.includes("bg-cron/[0.16] text-cron"),
  "cron chip 用 `bg-cron/[0.16] text-cron` (有意偏离 web 的 --cron-soft)",
);
assert(
  !cronCode.includes("--cron-soft"),
  "cron 详情页**不引用** --cron-soft (PC globals.css 没有这个变量)",
);
// 页面层: cron 分支不渲染编辑 / 表单
// ⚠️ 只切 cron 分支本身 (`if (kind === "cron")` → `if (!node) {` 之前) ——
//    后面那四 kind 分支里是有 showEdit 的。
const cronStart = pageCode.indexOf('if (kind === "cron")');
const fourKindStart = pageCode.indexOf("if (!node) {");
assert(cronStart >= 0 && fourKindStart > cronStart, "能定位 cron 分支的代码区间");
const cronBranch = pageCode.slice(cronStart, fourKindStart);
assert(
  cronBranch.includes("<CronDetailView") && !cronBranch.includes("showEdit"),
  "页面 cron 分支只渲染 CronDetailView (不传 showEdit)",
);
assert(
  cronBranch.includes("toggleCronJobState"),
  "cron 分支走 toggleCronJobState (暂停/启用)",
);

// ---------------------------------------------------------------------------
// F. detailModel 运行时
// ---------------------------------------------------------------------------
log("");
log("══ F. detailModel 运行时 ══");

const dir = makeTmpDir("schedule-detail-b6");
const mod = await loadScheduleLogic(dir);
const dm = mod.detailModel;
const api = mod.api;

const TASK_DDL = "2026-10-20T18:00:00.000Z";

const task = api.normalizeTask(
  {
    id: "t1",
    title: "任务一",
    ddl: TASK_DDL,
    status: "in_progress",
    ownerType: "cody",
    ownerName: "Cody",
    children: [
      {
        id: "s1",
        taskId: "t1",
        title: "子任务一",
        ddl: null,
        status: "pending",
        ownerType: "user",
        ownerName: "gaga",
        children: [
          {
            id: "m1",
            subtaskId: "s1",
            title: "关键节点一",
            ddl: null,
            statusOverride: null,
            ownerType: "user",
            ownerName: "gaga",
          },
        ],
      },
    ],
  },
  0,
);

const schedules = [
  api.normalizeScheduleItem({
    id: "c1",
    milestoneId: "m1",
    title: "日程一",
    date: "2026-10-21",
    startAt: "09:30",
    endAt: "11:00",
    ddl: null,
    ownerType: "user",
    ownerName: "gaga",
  }),
  api.normalizeScheduleItem({
    id: "c2",
    milestoneId: "m1",
    title: "日程二",
    date: "2026-10-22",
    startAt: "14:00",
    endAt: "15:00",
    ddl: null,
    ownerType: "user",
    ownerName: "gaga",
  }),
  api.normalizeScheduleItem({
    id: "c3",
    milestoneId: null,
    title: "游离日程",
    date: "2026-10-23",
    startAt: "08:00",
    endAt: "09:00",
    ddl: null,
    ownerType: "user",
    ownerName: "gaga",
  }),
];

const flat = api.buildFlatIndex({ tasks: [task], schedules });
const tree = flat.tree;
const lists = { subtasks: flat.subtasks, milestones: flat.milestones, schedules };

const subtask = flat.subtasks[0];
const milestone = flat.milestones[0];
const [c1, c2, c3] = schedules;

// ---- kind 判定 ----
assertEq(dm.DETAIL_KINDS, ["task", "subtask", "milestone", "schedule"], "DETAIL_KINDS = 四层树 kind");
assert(dm.kindOf(task) === "task", "kindOf(任务) = task");
assert(dm.kindOf(subtask) === "subtask", "kindOf(子任务) = subtask");
assert(dm.kindOf(milestone) === "milestone", "kindOf(关键节点) = milestone");
assert(dm.kindOf(c1) === "schedule", "kindOf(日程) = schedule");

// ---- 子项分组 ----
assertEq(
  ["task", "subtask", "milestone", "schedule"].map(dm.childGroupTitle),
  ["子任务", "关键节点", "日程", "同级日程"],
  "子项分组标题 (任务→子任务 · 子任务→关键节点 · 关键节点→日程 · 日程→同级日程)",
);
assertEq(
  ["subtask", "milestone", "schedule"].map(dm.childLevel),
  ["lv1", "lv2", "lv3"],
  "子项层级 (子任务 lv1 · 关键节点 lv2 · 日程 lv3)",
);

// ---- 新建分流 ----
assertEq(
  ["task", "subtask", "milestone", "schedule"].map(dm.nextCreateKind),
  ["subtask", "milestone", "schedule", null],
  "新建分流 (任务→子任务→关键节点→日程; 日程是叶子)",
);
assertEq(
  ["task", "subtask", "milestone", "schedule"].map(dm.nextCreateLabel),
  ["新建子任务", "新建关键节点", "新建日程", "新建"],
  "新建入口文案",
);
assert(
  dm.nextCreateHint("task").includes("子任务挂在任务下面"),
  "新建提示文案 (任务)",
);

// ---- 祖先链 (根 → 直接父级) ----
const ancestors = dm.collectAncestors(c1, tree);
assertEq(
  ancestors.map((a) => a.id),
  ["t1", "s1", "m1"],
  "祖先链 = [任务, 子任务, 关键节点] (根 → 直接父级)",
);
assertEq(
  dm.collectAncestors(task, tree).map((a) => a.id),
  [],
  "顶层任务没有祖先",
);
assertEq(
  dm.collectAncestors(c3, tree).map((a) => a.id),
  [],
  "游离日程没有祖先",
);

// ---- 子项 ----
assertEq(
  dm.collectChildren(task, lists).map((c) => c.node.id),
  ["s1"],
  "任务的子项 = 它的子任务",
);
assertEq(
  dm.collectChildren(subtask, lists).map((c) => c.node.id),
  ["m1"],
  "子任务的子项 = 它的关键节点",
);
assertEq(
  dm.collectChildren(milestone, lists).map((c) => c.node.id),
  ["c1", "c2"],
  "关键节点的子项 = 它的日程",
);
assertEq(
  dm.collectChildren(c1, lists).map((c) => c.node.id),
  ["c2"],
  "日程的子项 = 同级日程 (不含自己)",
);
assertEq(
  dm.collectChildren(c3, lists).map((c) => c.node.id),
  [],
  "游离日程没有同级日程",
);
assertEq(
  dm.collectChildren(milestone, lists).map((c) => c.kind),
  ["schedule", "schedule"],
  "子项带 kind (决定层级 / 跳转路由)",
);

// ---- 有效 DDL (bound 的语义底座) ----
assertEqv(tree.effectiveDdl(milestone), TASK_DDL, "effectiveDdl(关键节点) = 继承任务 DDL");
assertEqv(tree.effectiveDdl(c1), TASK_DDL, "effectiveDdl(日程) = 继承任务 DDL");
assertEqv(
  dm.childMeta(c1, tree, (iso) => iso ?? "-", (d, s, e) => `${d} ${s}–${e}`),
  "2026-10-21 09:30–11:00",
  "子项元信息: 日程 → 时段",
);
assertEqv(
  dm.childMeta(milestone, tree, (iso) => iso ?? "-", () => "x"),
  TASK_DDL,
  "子项元信息: 其余 → 继承链上的有效 DDL",
);

// ---- 提醒摘要 ----
assertDeep(
  dm.remindSummary(undefined),
  { on: false, offsetText: "不提醒", channels: [] },
  "提醒摘要: 没有提醒 → 不提醒",
);
assertDeep(
  dm.remindSummary([
    { id: "r1", remindAt: "2026-10-20T18:00:00.000Z", offsetMinutes: 15, channels: ["in_app"], enabled: true },
  ]),
  { on: true, offsetText: "提前 15 分钟", channels: ["应用内通知"] },
  "提醒摘要: 启用 + 提前 15 分钟 + 应用内通知",
);
assertDeep(
  dm.remindSummary([
    { id: "r1", remindAt: "2026-10-20T18:00:00.000Z", offsetMinutes: 0, channels: [], enabled: false },
  ]),
  { on: false, offsetText: "准时", channels: [] },
  "提醒摘要: 禁用态 → on=false (仍显示提前量文案)",
);
assertEq(
  dm.remindSummary([
    { id: "r1", remindAt: "2026-10-20T18:00:00.000Z", offsetMinutes: 30, channels: ["wechat"], enabled: true },
  ]).channels,
  [],
  "提醒摘要: 存量 wechat **不显示成可用渠道**",
);

// ---- 渠道中文名 ----
assertEq(
  dm.visibleChannelLabels(["in_app", "app_push"]),
  ["应用内通知", "应用弹窗"],
  "渠道中文名 (in_app / app_push)",
);
assertEq(
  dm.visibleChannelLabels(["in_app", "wechat", "app_push"]),
  ["应用内通知", "应用弹窗"],
  "visibleChannelLabels 过滤掉存量 wechat",
);
assertEqv(dm.channelLabel("wechat"), "", "未知 / 存量渠道 → 空串 (不是「微信」)");
assertEq(dm.visibleChannelLabels(undefined), [], "channels 缺失 → 空数组");

// ---- 状态来源 ----
assertEqv(
  dm.statusSourceText("task", null),
  "状态已单独设置",
  "任务: status 必填 → 恒「状态已单独设置」",
);
assertEqv(
  dm.statusSourceText("subtask", null),
  "状态已单独设置",
  "子任务: status 必填 → 恒「状态已单独设置」",
);
assertEqv(
  dm.statusSourceText("milestone", null),
  "状态继承上级",
  "关键节点: statusOverride 为空 → 继承上级",
);
assertEqv(
  dm.statusSourceText("milestone", "done"),
  "状态已单独设置",
  "关键节点: statusOverride 非空 → 已单独设置",
);

// ---- 状态 chip / 标签 ----
assertEq(
  ["pending", "in_progress", "done"].map((k) => dm.STATUS_LABEL[k]),
  ["未开始", "进行中", "已完成"],
  "状态中文名",
);
assert(
  dm.statusChipClass("done").includes("text-success") &&
    dm.statusChipClass("in_progress").includes("text-brand") &&
    dm.statusChipClass("pending").includes("text-fg-muted"),
  "状态 chip 三态配色不同",
);

// ---------------------------------------------------------------------------
// G. 通知落点
// ---------------------------------------------------------------------------
log("");
log("══ G. 通知落点 ══");

const notif = null;
void notif;

// notifications.ts 是 api.ts 的上游 —— 单独编一份出来直接 import
const notifUrl = writeModule(dir, "notifications-b6", src("src/lib/notifications.ts"));
const notifMod = await import(notifUrl);

const t1 = notifMod.scheduleTarget("sc1");
assertEqv(t1.kind, "schedule", "scheduleTarget → kind=schedule");
assertEqv(t1.href, "/schedule/schedule/sc1", "scheduleTarget → /schedule/schedule/{id} (无尾斜杠)");
const t2 = notifMod.scheduleTarget("sc1", "rm1", "2026-10-20T18:00:00.000Z");
assertEqv(
  t2.href,
  "/schedule/schedule/sc1?reminderId=rm1&fireAt=2026-10-20T18%3A00%3A00.000Z",
  "scheduleTarget 带 reminderId / fireAt 定位参数",
);
assertEqv(
  notifMod.notificationTarget({
    id: "n1",
    type: "schedule_reminder",
    actionType: "none",
    actionValue: null,
    isRead: false,
    createdAt: "",
    title: "t",
    body: "b",
    payload: { scheduleId: "sc9" },
  }).href,
  "/schedule/schedule/sc9",
  "schedule_reminder 通知 → 真详情路由",
);
assert(
  notifSrc.includes('kind: "schedule"'),
  "NotificationTarget 加回 kind:\"schedule\" 分支",
);
assert(
  notifSseSrc.includes('if (target.kind === "schedule") return target.href;'),
  "notifications-sse 的 notificationClickTarget 加了 schedule 分支 (桌面通知点得动)",
);

// ---------------------------------------------------------------------------
// H. 归档动作
// ---------------------------------------------------------------------------
// ⚠️ **口径在 2026-10-27 B7 落地后翻转过** ——
//    B6 阶段的临时口径是「本批一律**不传** onArchive」（归档是 B7 的活），
//    B7 落地后正确口径是「真正有归档入口的调用方**必须传**」。
//    PM 2026-10-27 跑全套断言时发现这 3 条失配 ⇒ 按新口径改写，不是实现回退。
log("");
log("══ H. 归档动作 (B7 已落地 ⇒ 有入口的必须接上) ══");

// 真正有归档入口的调用方 —— 必须传 onArchive
const MUST_ARCHIVE = [
  "src/components/schedule/detail/ScheduleDetailPage.tsx",
  "src/components/schedule/ScheduleTaskCard.tsx",
  "src/routes/ScheduleToday.tsx",
];
for (const rel of MUST_ARCHIVE) {
  const s = src(rel);
  assert(
    /onArchive\s*=/.test(s) || /onArchive\s*:\s*/.test(s),
    `${rel} 接上了 onArchive`,
    s.match(/onArchive[^,)\n]*/)?.[0] ?? "(没找到)",
  );
}

// 看板页走 **emit 通道**（`case "archive"` → handleNodeAction），不直接传 onArchive prop
{
  const s = src("src/routes/ScheduleBoard.tsx");
  assert(
    /case\s+["']archive["']/.test(s),
    "src/routes/ScheduleBoard.tsx 处理了 archive 动作 (case \"archive\")",
  );
  assert(
    /archiveMutation/.test(s),
    "src/routes/ScheduleBoard.tsx 有 archiveMutation",
  );
}

// 真的**没有**归档入口的 —— 必须不传
//   日历页：web `schedule/calendar/page.tsx` 零 archive 命中 ⇒ PC 不加才是对齐
//   看板容器 BoardView：归档由 ScheduleBoard 的 handleNodeAction 直接处理，
//   组件层不直接渲染菜单 ⇒ 不需要 onArchive prop
const MUST_NOT_ARCHIVE = [
  "src/routes/ScheduleCalendar.tsx",
  "src/components/schedule/BoardView.tsx",
];
for (const rel of MUST_NOT_ARCHIVE) {
  const s = src(rel);
  assert(
    !/onArchive\s*=/.test(s) && !/onArchive\s*:\s*/.test(s),
    `${rel} 不接 onArchive（web 该页也没有归档入口）`,
    s.match(/onArchive[^,)\n]*/)?.[0] ?? "",
  );
}
assert(
  src("src/components/schedule/ScheduleNodeMenu.tsx").includes("if (opts.onArchive)"),
  "ScheduleNodeMenu 保留 onArchive 分支 (B7 传上就自动多出该项)",
);

// ---------------------------------------------------------------------------
// I. 三处入口
// ---------------------------------------------------------------------------
log("");
log("══ I. 三处入口 (今日待办 / 日历 / 看板) ══");

const todaySrc = src("src/routes/ScheduleToday.tsx");
const calendarSrc = src("src/routes/ScheduleCalendar.tsx");

assert(
  todaySrc.includes('<CreateFab label="新建待办"'),
  "今日待办: FAB「新建待办」",
);
assert(
  calendarSrc.includes('<CreateFab label="新建日程"'),
  "日历页: FAB「新建日程」",
);
assert(
  boardSrc.includes("onNewTask={openCreateForm}"),
  "看板页: FAB「新建任务」(BoardView 的 onNewTask)",
);
assert(
  src("src/components/schedule/BoardView.tsx").includes("data-board-new-task"),
  "BoardView 的新建 FAB 有 data-board-new-task 锚点",
);
assert(
  src("src/components/schedule/BoardView.tsx").includes("onNewTask"),
  "BoardView 支持 onNewTask (不传 = 不渲染, 零死按钮)",
);

assert(
  todaySrc.includes("navigate(`/schedule/schedule/${item.id}`)"),
  "今日待办: 整行跳真详情路由",
);
assert(
  calendarSrc.includes("navigate(`/schedule/${kind}/${id}`)"),
  "日历页: 跳真详情路由",
);
assert(
  boardSrc.includes("navigate(`/schedule/${kind}/${id}`)"),
  "看板页: 跳真详情路由",
);
for (const [name, s] of [
  ["今日待办", todaySrc],
  ["日历页", calendarSrc],
  ["看板页", boardSrc],
]) {
  assert(
    !/`\/schedule\/[^`]*\/`/.test(s),
    `${name} 的详情路由**不带尾斜杠**`,
    s.match(/`\/schedule\/[^`]*`/)?.[0] ?? "",
  );
}

// 三处都能开表单
assert(todaySrc.includes("<ScheduleFormSheet"), "今日待办: 挂 ScheduleFormSheet");
assert(calendarSrc.includes("<ScheduleFormSheet"), "日历页: 挂 ScheduleFormSheet");
assert(boardSrc.includes("<ScheduleFormSheet"), "看板页: 挂 ScheduleFormSheet");

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
log("");
log("════════════════════════════════════════════");
log(`checked=${checked}  passed=${passed}  failed=${failed}`);
log("════════════════════════════════════════════");
if (failed > 0) {
  console.log(`❌ 详情页断言 ${failed} 条未通过`);
  process.exit(1);
}
console.log("✅ 详情页 5 路由 / bound 三处 / 子项分组 / 新建分流 / 祖先链 / 提醒摘要 / 通知落点 全部通过");
