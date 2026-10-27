#!/usr/bin/env node
/**
 * verify-schedule-form-b6.mjs
 *
 * 日程中心 **B6 · 表单** 的断言 (新建 / 编辑 / 改 DDL · 4 kind × 3 mode = 12 组合)。
 *
 * 覆盖面 (照 brief §6.1 / §6.2 / §6.3 + 交底 §8.1 / §8.2 / §8.3):
 *   A. 12 组合的**字段结构** (UI 层) —— 用 **TypeScript AST** 解析
 *      `ScheduleFormSheet.tsx`, 按「所在 JSX 条件分支」把每个 `<Field>` /
 *      `<RemindBlock>` / `<DatePickerField>` / `<CustomSelect>` / 文本块归类,
 *      再逐格核「有哪些字段 / 没有哪些字段」。
 *   B. **校验** 12 组合各跑一遍 `validateForm` (运行时, 真函数)。
 *   C. **写入体** 12 组合各跑一遍 `scheduleBody` / `taskBody` / `milestoneBody`。
 *   D. **提醒同步** (关+有→DELETE / 开+无→POST / 开+有+没变→零请求 / task·subtask→零请求)。
 *   E. **「本来没有提醒」的节点编辑保存 → 不凭空多出提醒**。
 *
 * ⚠️ **不依赖任何测试框架** —— PC 仓没有 jsdom / react-test-renderer / @testing-library,
 *    也装不了 (package.json 是冻结件) ⇒ 本脚本是**纯 node** 脚本:
 *      - 纯逻辑层 (Rules / Init / Body) 用 `scripts/lib/schedule-loader.mjs` 转译成 ESM
 *        落到**系统临时目录**再 import (编译产物不进仓);
 *      - `schedule-api` 那一层用**打桩模块**替换 ⇒ 提醒同步的「零请求」可被真实断言;
 *      - UI 层 (React) 没有 DOM ⇒ 用 **TS AST 静态解析**拿结构 (不是 grep 字符串)。
 *
 * 用法: node scripts/verify-schedule-form-b6.mjs
 * 退出码: 0 = 全过 / 1 = 有失败。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { makeTmpDir, writeModule, ROOT } from "./lib/schedule-loader.mjs";

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

const src = (rel) => readFileSync(join(ROOT, rel), "utf8");

// ---------------------------------------------------------------------------
// AST 工具 —— 把 JSX 按「所在条件分支」归类
// ---------------------------------------------------------------------------

/**
 * collectJsx —— 遍历一个 .tsx 源文件, 收集:
 *   fields   : 每个 `<Field>` 的 label + 所在分支路径
 *   elements : 每个 JSX 元素的 tag + 所在分支路径 + 属性表
 *   texts    : 每个 JSX 文本片段 + 所在分支路径
 *
 * 分支路径用「条件表达式文本」描述, 例如:
 *   'mode === "delay" ? true'
 *   'kind === "schedule" ? true'
 *   'kind === "task" && true'
 *   'kind !== "task" && true'
 */
function collectJsx(rel) {
  const text = src(rel);
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const fields = [];
  const elements = [];
  const texts = [];
  const path = [];

  const flat = (n) => n.replace(/\s+/g, " ").trim();

  /** 属性表: { name: 文本 } —— 字面量取其值, 表达式取源码文本。 */
  const attrsOf = (opening) => {
    const out = {};
    for (const p of opening.attributes.properties) {
      if (!ts.isJsxAttribute(p)) continue;
      const name = p.name.getText(sf);
      if (!p.initializer) {
        out[name] = "true";
      } else if (ts.isStringLiteral(p.initializer)) {
        out[name] = p.initializer.text;
      } else if (ts.isJsxExpression(p.initializer)) {
        out[name] = flat(p.initializer.getText(sf));
      }
    }
    return out;
  };

  const visit = (node) => {
    if (ts.isConditionalExpression(node)) {
      const cond = flat(node.condition.getText(sf));
      path.push(`${cond} ? true`);
      visit(node.whenTrue);
      path.pop();
      path.push(`${cond} ? false`);
      visit(node.whenFalse);
      path.pop();
      return;
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      const cond = flat(node.left.getText(sf));
      path.push(`${cond} && true`);
      visit(node.right);
      path.pop();
      return;
    }
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      // ⚠️ 自闭合元素 (`<DatePickerField ... />`) 是 **JsxSelfClosingElement**,
      //    不是 JsxElement —— 两种都要收, 否则自闭合的 picker / RemindBlock 全丢。
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = opening.tagName.getText(sf);
      const attrs = attrsOf(opening);
      elements.push({ tag, path: [...path], attrs });
      if (tag === "Field") fields.push({ label: attrs.label ?? "", path: [...path], attrs });
      if (ts.isJsxElement(node)) ts.forEachChild(node, visit);
      return;
    }
    if (ts.isJsxText(node)) {
      const t = flat(node.text);
      if (t) texts.push({ text: t, path: [...path] });
      return;
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sf, visit);
  return { fields, elements, texts };
}

/** 某条分支路径下 (含子路径) 的全部 Field label。 */
const labelsIn = (fields, branch) =>
  fields.filter((f) => f.path.some((p) => p.includes(branch))).map((f) => f.label);

/** 某条分支路径下 (含子路径) 的全部元素 tag。 */
const tagsIn = (elements, branch) =>
  elements.filter((e) => e.path.some((p) => p.includes(branch))).map((e) => e.tag);

/** 某条分支路径下 (含子路径) 的全部文本片段。 */
const textsIn = (texts, branch) =>
  texts.filter((t) => t.path.some((p) => p.includes(branch))).map((t) => t.text);

/** 文本里是否出现某句 (跨片段拼不严, 所以按「片段包含」逐段找)。 */
const hasText = (texts, branch, needle) =>
  textsIn(texts, branch).some((t) => t.includes(needle));

/** 某分支下某个元素的属性。 */
const attrsIn = (elements, branch, tag) =>
  elements.filter((e) => e.tag === tag && e.path.some((p) => p.includes(branch)));

/**
 * JSX **表达式**属性的原始文本带外层花括号 (`{values.date || null}` / `{false}`),
 * 字符串字面量属性则不带 (`"不设开始时间"`) ⇒ 统一剥一次再比。
 */
const expr = (v) =>
  typeof v === "string" && v.startsWith("{") && v.endsWith("}")
    ? v.slice(1, -1).trim()
    : v;

// ---------------------------------------------------------------------------
// A. 12 组合的字段结构 (UI 层 · AST 解析)
// ---------------------------------------------------------------------------
log("");
log("══ A. 12 组合字段结构 (ScheduleFormSheet.tsx · TS AST) ══");

const sheet = collectJsx("src/components/schedule/form/ScheduleFormSheet.tsx");

const DELAY = 'mode === "delay" ? true';
const SCHED = 'kind === "schedule" ? true';
const NOT_SCHED = 'kind === "schedule" ? false';
const TASK = 'kind === "task" && true';
const CHILD = 'kind === "subtask" || kind === "milestone") && true';
const NOT_TASK = 'kind !== "task" && true';
const MILESTONE = 'kind === "milestone" && true';

// ---- delay 模式: 只有 DDL 一项 ----
assertEq(labelsIn(sheet.fields, DELAY), ["DDL"], "delay 模式字段 = 恰好 [DDL] 一项");
assert(
  !tagsIn(sheet.elements, DELAY).includes("RemindBlock"),
  "delay 模式**没有**提醒块",
  tagsIn(sheet.elements, DELAY).join(","),
);
assert(
  !tagsIn(sheet.elements, DELAY).includes("CustomSelect"),
  "delay 模式**没有**责任人/状态下拉",
  tagsIn(sheet.elements, DELAY).join(","),
);
for (const forbidden of ["标题", "责任人", "状态", "说明", "类型"]) {
  assert(
    !labelsIn(sheet.fields, DELAY).some((l) => l.includes(forbidden)),
    `delay 模式**没有**「${forbidden}」字段`,
    labelsIn(sheet.fields, DELAY).join(","),
  );
}

// ---- create / edit: 类型 label 两种 mode 不同 ----
const typeField = sheet.fields.find((f) => f.label.includes("类型(由入口决定)"));
assert(
  !!typeField &&
    typeField.label.includes('"类型(由入口决定)"') &&
    typeField.label.includes('"类型"'),
  'create/edit 的「类型」label 不同 —— "类型(由入口决定)" / "类型"',
  typeField?.label ?? "(找不到类型 Field)",
);

// ---- schedule 分支 ----
const schedLabels = labelsIn(sheet.fields, SCHED);
for (const l of ["标题 *", "开始日期 *", "结束日期 *", "开始时间 *", "结束时间 *", "责任人", "备注"]) {
  assert(schedLabels.includes(l), `schedule 字段含「${l}」`, `实际 = ${JSON.stringify(schedLabels)}`);
}
assert(tagsIn(sheet.elements, SCHED).includes("RemindBlock"), "schedule **有**提醒块");
assert(
  hasText(sheet.texts, SCHED, "全部必填"),
  "schedule 有底部说明",
  JSON.stringify(textsIn(sheet.texts, SCHED)),
);
assert(
  hasText(sheet.texts, SCHED, "下面,日期和截止时间都不能超过它的截止时间"),
  "schedule 有 bound 提示",
  JSON.stringify(textsIn(sheet.texts, SCHED)),
);

// 改开始日期 → 结束日期跟随 (源码里的 onChange 逻辑)
const sheetSrc = src("src/components/schedule/form/ScheduleFormSheet.tsx");
assert(
  /if \(!values\.endDate \|\| values\.endDate < v\) set\("endDate", v\)/.test(sheetSrc),
  "schedule 改开始日期 → 结束日期跟随",
);
const schedDatePickers = attrsIn(sheet.elements, SCHED, "DatePickerField");
assert(
  schedDatePickers.some((d) => expr(d.attrs.minDate) === "values.date || null"),
  "schedule 结束日期 minDate = values.date",
  JSON.stringify(schedDatePickers.map((d) => d.attrs)),
);
assert(
  schedDatePickers.filter((d) => expr(d.attrs.clearable) === "false").length === 2,
  "schedule 的开始日期 + 结束日期都 clearable={false}",
  JSON.stringify(schedDatePickers.map((d) => d.attrs)),
);

// ---- task / subtask / milestone (共用 NOT_SCHED 段, 内部分支) ----
const otherLabels = labelsIn(sheet.fields, NOT_SCHED);
assert(otherLabels.includes("名称 *"), "task 字段含「名称 *」", JSON.stringify(otherLabels));
assert(otherLabels.includes("责任人"), "task 字段含「责任人」", JSON.stringify(otherLabels));
assert(otherLabels.includes("截止时间"), "task 字段含「截止时间」", JSON.stringify(otherLabels));
assert(
  labelsIn(sheet.fields, TASK).includes("说明"),
  "task 字段含「说明」",
  JSON.stringify(labelsIn(sheet.fields, TASK)),
);
assert(
  labelsIn(sheet.fields, TASK).includes("开始日期 *") &&
    labelsIn(sheet.fields, TASK).includes("开始时间 *"),
  "task 字段含「开始日期 *」「开始时间 *」",
  JSON.stringify(labelsIn(sheet.fields, TASK)),
);
assert(
  !tagsIn(sheet.elements, TASK).includes("RemindBlock"),
  "task **没有**提醒块",
);
assert(hasText(sheet.texts, TASK, "任务状态按开始"), "task 有状态提示文案");
assert(
  hasText(sheet.texts, NOT_SCHED, "任务没有上级,截止时间就是它自己的"),
  "task 有 task 专属提示",
);
assert(
  !labelsIn(sheet.fields, TASK).includes("状态"),
  "task **没有**状态字段 (状态由后端按时间派生)",
  JSON.stringify(labelsIn(sheet.fields, TASK)),
);
const taskDatePickers = attrsIn(sheet.elements, TASK, "DatePickerField");
assert(
  taskDatePickers.some((d) => expr(d.attrs.clearable) === "false"),
  "task 的开始日期 clearable={false}",
  JSON.stringify(taskDatePickers.map((d) => d.attrs)),
);

// subtask / milestone
const childLabels = labelsIn(sheet.fields, CHILD);
assert(
  childLabels.includes("开始日期") && childLabels.includes("开始时间"),
  "subtask/milestone 字段含「开始日期」「开始时间」",
  JSON.stringify(childLabels),
);
const childDatePickers = attrsIn(sheet.elements, CHILD, "DatePickerField");
assert(
  childDatePickers.some((d) => d.attrs.emptyLabel === "不设开始时间"),
  "subtask/milestone 开始日期 emptyLabel = 「不设开始时间」",
  JSON.stringify(childDatePickers.map((d) => d.attrs)),
);
assert(
  !childDatePickers.some((d) => expr(d.attrs.clearable) === "false"),
  "subtask/milestone 的开始日期**可清空** (没有 clearable={false})",
);
assert(hasText(sheet.texts, CHILD, "开始时间可以留空"), "subtask/milestone 有开始时间提示");
assert(
  !tagsIn(sheet.elements, CHILD).includes("RemindBlock"),
  "subtask **没有**提醒块",
);
assert(
  labelsIn(sheet.fields, NOT_TASK).includes("状态"),
  "subtask/milestone **有**状态字段",
  JSON.stringify(labelsIn(sheet.fields, NOT_TASK)),
);
assert(
  !labelsIn(sheet.fields, CHILD).includes("说明") &&
    sheet.fields.filter((f) => f.label === "说明").length === 1,
  "subtask/milestone **没有**说明字段 (说明只在 task 分支)",
);
assert(
  tagsIn(sheet.elements, MILESTONE).includes("RemindBlock"),
  "milestone **有**提醒块 (subtask 没有)",
);
assert(
  !tagsIn(sheet.elements, CHILD).includes("RemindBlock") &&
    tagsIn(sheet.elements, MILESTONE).includes("RemindBlock"),
  "提醒块 = schedule + milestone 两个 kind (task / subtask 没有)",
);

// 截止时间的空值占位必须走 ddlEmptyLabel(kind)
const ddlEmptyExpr = sheetSrc.match(/emptyLabel=\{([^}]*ddlEmptyLabel[^}]*)\}/);
assert(
  !!ddlEmptyExpr && ddlEmptyExpr[1].includes("ddlEmptyLabel(kind)"),
  "截止时间空值占位用 ddlEmptyLabel(kind) (不写死「继承」)",
  ddlEmptyExpr?.[1] ?? "(没找到)",
);

// ---------------------------------------------------------------------------
// 加载纯逻辑层 (Rules / Init / Body) —— Body 依赖的 schedule-api 换成**打桩**,
// 这样「提醒同步零请求」才是可断言的真值。
// ---------------------------------------------------------------------------
const dir = makeTmpDir("schedule-form-b6");

/** 打桩的 schedule-api —— 记录每次提醒端点调用。 */
const STUB = `
export const CALLS = [];
export function resetCalls() { CALLS.length = 0; }
export function scheduleLocalToIso(date, hhmm) {
  const m = /^(\\d{1,2}):(\\d{2})$/.exec(hhmm ?? "");
  const ymd = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(date ?? "");
  if (!m || !ymd) return "";
  const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]), Number(m[1]), Number(m[2]), 0, 0);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}
export async function addScheduleReminder(id, body) { CALLS.push(["POST", "schedule", id, body]); return { id: "r-new", ...body }; }
export async function updateScheduleReminder(id, rid, body) { CALLS.push(["PATCH", "schedule", id, rid, body]); return { id: rid, ...body }; }
export async function deleteScheduleReminder(id, rid) { CALLS.push(["DELETE", "schedule", id, rid]); }
export async function addMilestoneReminder(id, body) { CALLS.push(["POST", "milestone", id, body]); return { id: "r-new", ...body }; }
export async function updateMilestoneReminder(id, rid, body) { CALLS.push(["PATCH", "milestone", id, rid, body]); return { id: rid, ...body }; }
export async function deleteMilestoneReminder(id, rid) { CALLS.push(["DELETE", "milestone", id, rid]); }
`;
const stubUrl = writeModule(dir, "schedule-api", STUB);

const rulesUrl = writeModule(dir, "scheduleFormRules", src("src/components/schedule/form/scheduleFormRules.ts"));
const initUrl = writeModule(dir, "scheduleFormInit", src("src/components/schedule/form/scheduleFormInit.ts"), {
  rewriteImports: [
    ["./scheduleFormRules", "./scheduleFormRules.mjs"],
    ["../../../lib/schedule-api", "./schedule-api.mjs"],
  ],
});
const bodyUrl = writeModule(dir, "scheduleFormBody", src("src/components/schedule/form/scheduleFormBody.ts"), {
  rewriteImports: [
    ["./scheduleFormRules", "./scheduleFormRules.mjs"],
    ["../../../lib/schedule-api", "./schedule-api.mjs"],
  ],
});

const rules = await import(rulesUrl);
const init = await import(initUrl);
const body = await import(bodyUrl);
const stub = await import(stubUrl);

const { validateForm, ddlEmptyLabel } = rules;
const { initialValues } = init;
const { scheduleBody, taskBody, milestoneBody, syncReminders, remindAtIso } = body;
const { scheduleLocalToIso } = stub;

const V = (over = {}) => ({
  title: "标题",
  desc: "",
  note: "",
  date: "2026-10-20",
  endDate: "2026-10-20",
  start: "09:00",
  end: "10:00",
  ddlDate: "",
  ddlTime: "",
  ownerType: "user",
  status: "pending",
  remindOn: false,
  remindOffset: 15,
  remindChannels: ["in_app"],
  ...over,
});
/**
 * 父级上限 —— 用**本地**时间构造 (与 scheduleLocalToIso 同口径) ⇒
 * 断言跟运行机器的时区无关 (直接写死 ISO 会在 UTC+8 上偏一天)。
 */
const BOUND = { label: "任务", title: "父任务", ddl: scheduleLocalToIso("2026-10-25", "18:00") };

// ---------------------------------------------------------------------------
// B. 校验 —— 12 组合各跑一遍
// ---------------------------------------------------------------------------
log("");
log("══ B. 校验 (validateForm · 12 组合) ══");

const MODES = ["create", "edit", "delay"];
const KINDS = ["schedule", "task", "subtask", "milestone"];

for (const mode of MODES) {
  for (const kind of KINDS) {
    const base = V();
    if (kind === "task") {
      base.date = "2026-10-20";
      base.start = "09:00";
    } else if (kind === "subtask" || kind === "milestone") {
      base.date = "";
      base.start = "";
    }
    const errs = validateForm(base, kind, mode, null);
    assert(
      Object.keys(errs).length === 0,
      `validateForm(${mode}, ${kind}) 正常值 → 无错误`,
      JSON.stringify(errs),
    );
  }
}

const e1 = validateForm(V({ title: "  " }), "task", "create", null);
assert(e1.title === "名称 / 标题不能为空", "校验 #1 标题空 → 「名称 / 标题不能为空」", JSON.stringify(e1));

const e2 = validateForm(V({ date: "" }), "schedule", "create", null);
assert(e2.date === "开始日期不能为空", "校验 #2 schedule 开始日期空 → 「开始日期不能为空」", JSON.stringify(e2));

const e3 = validateForm(V({ endDate: "" }), "schedule", "create", null);
assert(e3.endDate === "结束日期不能为空", "校验 #3 schedule 结束日期空 → 「结束日期不能为空」", JSON.stringify(e3));

const e4 = validateForm(V({ date: "2026-10-20", endDate: "2026-10-19" }), "schedule", "create", null);
assert(e4.endDate === "结束日期不能早于开始日期", "校验 #4 结束日期早于开始日期 → 报错", JSON.stringify(e4));

const e5 = validateForm(V({ start: "" }), "schedule", "create", null);
assert(e5.start === "开始时间不能为空", "校验 #5 开始时间空 → 「开始时间不能为空」", JSON.stringify(e5));

const e6 = validateForm(V({ end: "" }), "schedule", "create", null);
assert(e6.end === "结束时间不能为空", "校验 #6 结束时间空 → 「结束时间不能为空」", JSON.stringify(e6));

const e7 = validateForm(V({ start: "10:00", end: "09:00" }), "schedule", "create", null);
assert(
  typeof e7.end === "string" && e7.end.startsWith("结束时间必须晚于开始时间"),
  "校验 #7 同一天 结束 ≤ 开始 → 「结束时间必须晚于开始时间」",
  JSON.stringify(e7),
);

const e8 = validateForm(V({ date: "" }), "task", "create", null);
assert(e8.date === "开始日期不能为空", "校验 #8 task create 开始日期空 → 报错", JSON.stringify(e8));

const e9 = validateForm(V({ start: "" }), "task", "create", null);
assert(e9.start === "开始时间不能为空", "校验 #9 task create 开始时间空 → 报错", JSON.stringify(e9));

const e10 = validateForm(
  V({ date: "2026-10-20", start: "10:00", ddlDate: "2026-10-20", ddlTime: "09:00" }),
  "task",
  "edit",
  null,
);
assert(e10.ddl === "截止时间不能早于开始时间", "校验 #10 截止早于开始 → 报错", JSON.stringify(e10));

const e11 = validateForm(V({ ddlDate: "2026-10-26", ddlTime: "10:00" }), "subtask", "edit", BOUND);
assert(
  typeof e11.ddl === "string" && e11.ddl.includes("不能晚于任务「父任务」的截止时间"),
  "校验 #11 DDL 晚于父级 → 报错",
  JSON.stringify(e11),
);

const e12 = validateForm(V({ date: "2026-10-26", endDate: "2026-10-26" }), "schedule", "edit", BOUND);
assert(
  typeof e12.date === "string" && e12.date.includes("不能晚于任务「父任务」的截止日期"),
  "校验 #12 日程开始日期晚于父级截止日 → 报错",
  JSON.stringify(e12),
);
const e13 = validateForm(V({ date: "2026-10-20", endDate: "2026-10-27" }), "schedule", "edit", BOUND);assert(
  typeof e13.endDate === "string" && e13.endDate.includes("不能晚于任务「父任务」的截止日期"),
  "校验 #13 日程结束日期晚于父级截止日 → 报错",
  JSON.stringify(e13),
);

// ★ 曾经是生产 bug: 新建子任务 / 关键节点时整段越界校验被跳过
const eCreateSub = validateForm(V({ ddlDate: "2026-10-26", ddlTime: "10:00" }), "subtask", "create", BOUND);
assert(
  typeof eCreateSub.ddl === "string" && eCreateSub.ddl.includes("不能晚于"),
  "★ create 子任务 + bound 越界 → **必须报错** (旧实现整段跳过)",
  JSON.stringify(eCreateSub),
);
const eCreateMs = validateForm(V({ ddlDate: "2026-10-26", ddlTime: "10:00" }), "milestone", "create", BOUND);
assert(
  typeof eCreateMs.ddl === "string" && eCreateMs.ddl.includes("不能晚于"),
  "★ create 关键节点 + bound 越界 → **必须报错** (旧实现整段跳过)",
  JSON.stringify(eCreateMs),
);
const eDelay = validateForm(V({ ddlDate: "2026-10-26", ddlTime: "10:00" }), "subtask", "delay", BOUND);
assert(
  typeof eDelay.ddl === "string" && eDelay.ddl.includes("不能晚于"),
  "校验 #11 delay 模式同样拦越界",
  JSON.stringify(eDelay),
);

const eEqual = validateForm(V({ ddlDate: "2026-10-25", ddlTime: "18:00" }), "subtask", "edit", BOUND);
assert(!eEqual.ddl, "边界: DDL 恰好等于父级 → **通过** (>)", JSON.stringify(eEqual));

const eNoBound = validateForm(
  V({ ddlDate: "2030-01-01", ddlTime: "10:00" }),
  "subtask",
  "edit",
  { label: "任务", title: "无截止", ddl: null },
);
assert(!eNoBound.ddl, "父级不设截止 (bound.ddl=null) → **不限**", JSON.stringify(eNoBound));

// delay 模式打开时**不飘红** —— 靠 initialValues 从 node 回填 title
const delayInit = initialValues("delay", "schedule", { id: "s1", title: "原标题", ddl: null }, undefined);
const eDelayOpen = validateForm(delayInit, "schedule", "delay", null);
assert(!eDelayOpen.title, "delay 模式打开时**不飘红** (「名称不能为空」不出现)", JSON.stringify(eDelayOpen));
assert(delayInit.title === "原标题", "delay 模式 initialValues 从 node 回填 title");

// 跨天日程 → **不**报「结束时间必须晚于开始时间」
const eCross = validateForm(
  V({ date: "2026-10-20", endDate: "2026-10-24", start: "10:00", end: "09:00" }),
  "schedule",
  "create",
  null,
);
assert(
  !eCross.end,
  "跨天日程 (endDate > date) → **不**报「结束时间必须晚于开始时间」",
  JSON.stringify(eCross),
);

assert(ddlEmptyLabel("task") === "留空 = 不设截止", 'ddlEmptyLabel("task") = 「留空 = 不设截止」');
assert(ddlEmptyLabel("subtask") === "留空 = 继承", 'ddlEmptyLabel("subtask") = 「留空 = 继承」');
assert(ddlEmptyLabel("milestone") === "留空 = 继承", 'ddlEmptyLabel("milestone") = 「留空 = 继承」');

// ---------------------------------------------------------------------------
// C. 写入体 —— 12 组合
// ---------------------------------------------------------------------------
log("");
log("══ C. 写入体 (scheduleBody / taskBody / milestoneBody) ══");

const sDelay = scheduleBody(V({ ddlDate: "2026-10-22", ddlTime: "18:00" }), "delay");
assertEq(Object.keys(sDelay), ["ddl"], "写入体: schedule delay → body **只有** ddl");

const sCreate = scheduleBody(V({ ddlDate: "2026-10-22", ddlTime: "18:00", note: "备注" }), "create");
for (const k of ["ownerType", "ddl", "statusOverride", "title", "date", "startAt", "endAt", "note"]) {
  assert(k in sCreate, `写入体: schedule create 含「${k}」`, Object.keys(sCreate).join(","));
}
assert(
  !("ownerId" in sCreate) && !("ownerName" in sCreate),
  "写入体: 责任人**只有** ownerType (无 ownerId / ownerName)",
  Object.keys(sCreate).join(","),
);
const sEdit = scheduleBody(V({ ddlDate: "2026-10-22", ddlTime: "18:00" }), "edit");
assert("statusOverride" in sEdit, "写入体: schedule edit 含 statusOverride");
assert("title" in sEdit, "写入体: schedule edit 含 title");
assert("ownerType" in sEdit, "写入体: schedule edit 含 ownerType");
assert(
  !("ownerId" in sEdit) && !("ownerName" in sEdit),
  "写入体: schedule edit 责任人**只有** ownerType",
  Object.keys(sEdit).join(","),
);

// ⚠️ desc 只在**有值**时才进写入体 (稀疏语义) ⇒ 这里给一个非空 desc。
const tCreate = taskBody(
  V({ ddlDate: "2026-10-22", ddlTime: "18:00", desc: "任务说明" }),
  "create",
  "task",
);
assert(
  "ownerType" in tCreate && "ddl" in tCreate && "title" in tCreate && "desc" in tCreate,
  "写入体: task 含 ownerType/ddl/title/desc",
  Object.keys(tCreate).join(","),
);
assert("startAt" in tCreate, "写入体: task 含 startAt");
assert(
  !("status" in tCreate) && !("statusOverride" in tCreate),
  "写入体: task **不含** status / statusOverride (状态由后端按时间派生)",
  Object.keys(tCreate).join(","),
);
assert(
  !("ownerId" in tCreate) && !("ownerName" in tCreate),
  "写入体: task 责任人**只有** ownerType",
  Object.keys(tCreate).join(","),
);

const stCreate = taskBody(V({ ddlDate: "2026-10-22", ddlTime: "18:00" }), "create", "subtask");
assert("status" in stCreate, "写入体: subtask 含 status");
assert(
  !("statusOverride" in stCreate),
  "写入体: subtask **不含** statusOverride (子任务表没那一列, 发了直接 400)",
  Object.keys(stCreate).join(","),
);
assert("startAt" in stCreate, "写入体: subtask 含 startAt (可空 = null)");
assert(
  !("ownerId" in stCreate) && !("ownerName" in stCreate),
  "写入体: subtask 责任人**只有** ownerType",
  Object.keys(stCreate).join(","),
);
const stDelay = taskBody(V({ ddlDate: "2026-10-22", ddlTime: "18:00" }), "delay", "subtask");
assert(!("startAt" in stDelay), "写入体: subtask delay **不带** startAt (只改 DDL)", Object.keys(stDelay).join(","));

const mCreate = milestoneBody(V({ ddlDate: "2026-10-22", ddlTime: "18:00" }), "create");
assert("statusOverride" in mCreate, "写入体: milestone 含 statusOverride");
assert(!("status" in mCreate), "写入体: milestone **不含** status", Object.keys(mCreate).join(","));
assert("startAt" in mCreate, "写入体: milestone 含 startAt (可空)");
assert(
  !("ownerId" in mCreate) && !("ownerName" in mCreate),
  "写入体: milestone 责任人**只有** ownerType",
  Object.keys(mCreate).join(","),
);
const mDelay = milestoneBody(V({ ddlDate: "2026-10-22", ddlTime: "18:00" }), "delay");
assert(!("startAt" in mDelay), "写入体: milestone delay **不带** startAt", Object.keys(mDelay).join(","));

// ---------------------------------------------------------------------------
// D. 提醒同步
// ---------------------------------------------------------------------------
log("");
log("══ D. 提醒同步 (syncReminders) ══");

const vals = (over = {}) =>
  V({
    ddlDate: "2026-10-22",
    ddlTime: "10:00",
    remindOn: true,
    remindOffset: 15,
    remindChannels: ["in_app"],
    ...over,
  });

/**
 * 「没变」的那条提醒 —— remindAt 必须**等于**表单算出来的锚点时刻,
 * 否则 `reminderChanged` 会判成「变了」⇒ 误发 PATCH。
 * 用 remindAtIso() 现算 ⇒ 跟实现同口径 (且跟机器时区无关)。
 */
const REM = {
  id: "r1",
  remindAt: remindAtIso(vals()),
  offsetMinutes: 15,
  channels: ["in_app"],
  enabled: true,
};

stub.resetCalls();
await syncReminders("schedule", "s1", vals(), []);
assertEq(
  stub.CALLS.map((c) => `${c[0]} ${c[1]}`),
  ["POST schedule"],
  "提醒: 开 + 无 → POST /schedules/schedules/:id/reminders",
);

stub.resetCalls();
await syncReminders("schedule", "s1", vals({ remindOn: false }), [REM]);
assertEq(stub.CALLS.map((c) => `${c[0]} ${c[1]}`), ["DELETE schedule"], "提醒: 关 + 有 → DELETE");

stub.resetCalls();
await syncReminders("schedule", "s1", vals({ remindOn: false }), []);
assertEq(stub.CALLS.map((c) => `${c[0]} ${c[1]}`), [], "提醒: 关 + 无 → **零请求** (不凭空删)");

stub.resetCalls();
await syncReminders("schedule", "s1", vals(), [REM]);
assertEq(stub.CALLS.map((c) => `${c[0]} ${c[1]}`), [], "提醒: 开 + 有 + 没变 → **零请求**");

stub.resetCalls();
await syncReminders("schedule", "s1", vals({ remindOffset: 60 }), [REM]);
assertEq(stub.CALLS.map((c) => `${c[0]} ${c[1]}`), ["PATCH schedule"], "提醒: 开 + 有 + 变了 → PATCH");

stub.resetCalls();
await syncReminders("milestone", "m1", vals(), []);
assertEq(
  stub.CALLS.map((c) => `${c[0]} ${c[1]}`),
  ["POST milestone"],
  "提醒: milestone → 打 /milestones/:id/reminders (不是日程那组)",
);

stub.resetCalls();
await syncReminders("task", "t1", vals(), []);
await syncReminders("subtask", "st1", vals(), [REM]);
assertEq(stub.CALLS.map((c) => `${c[0]} ${c[1]}`), [], "提醒: task / subtask → **零请求** (后端没开提醒端点)");

// ---------------------------------------------------------------------------
// E. 「本来没有提醒」的节点编辑保存 → 不凭空多出提醒
// ---------------------------------------------------------------------------
log("");
log("══ E. 不凭空造提醒 ══");

const noRemindInit = initialValues(
  "edit",
  "schedule",
  { id: "s1", title: "无提醒的日程", reminders: [] },
  undefined,
);
assert(
  noRemindInit.remindOn === false,
  "initialValues: 节点本来没有提醒 → remindOn = false (不是兜底 true)",
  String(noRemindInit.remindOn),
);
stub.resetCalls();
await syncReminders("schedule", "s1", noRemindInit, []);
assertEq(stub.CALLS.map((c) => `${c[0]} ${c[1]}`), [], "编辑「本来没有提醒」的节点保存 → **不凭空多出提醒**");

const remindOnInit = initialValues(
  "edit",
  "schedule",
  { id: "s1", title: "有提醒的日程", reminders: [REM] },
  undefined,
);
assert(remindOnInit.remindOn === true, "initialValues: 节点有启用提醒 → remindOn = true");
const remindOffInit = initialValues(
  "edit",
  "schedule",
  { id: "s1", title: "禁用提醒的日程", reminders: [{ ...REM, enabled: false }] },
  undefined,
);
assert(remindOffInit.remindOn === false, "initialValues: 节点提醒是禁用态 → remindOn = false");

const createInit = initialValues("create", "schedule", null, "2026-10-20");
assert(createInit.remindOn === true, "initialValues: create 模式默认 remindOn = true");
assert(createInit.date === "2026-10-20", "initialValues: create 模式预填 defaultDate");
const childCreateInit = initialValues("create", "subtask", null, "2026-10-20");
assert(
  childCreateInit.date === "",
  "initialValues: 子任务/关键节点的开始日期**不预填** defaultDate (不塞假值)",
  childCreateInit.date,
);

// ---------------------------------------------------------------------------
log("");
log("════════════════════════════════════════════");
log(`checked=${checked}  passed=${passed}  failed=${failed}`);
log("════════════════════════════════════════════");

if (failed > 0) {
  console.log(`❌ 表单断言 ${failed} 条未通过`);
  process.exit(1);
}
console.log("✅ 表单 12 组合 / 校验 / 写入体 / 提醒同步 全部通过");
