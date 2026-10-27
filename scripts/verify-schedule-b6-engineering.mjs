#!/usr/bin/env node
/**
 * verify-schedule-b6-engineering.mjs
 *
 * 日程中心 **B6** 的**工程约束**断言 (不是功能断言 —— 功能在
 * `verify-schedule-form-b6.mjs` / `verify-schedule-detail-b6.mjs` 里)。
 *
 * 覆盖面:
 *   A. **文件面** —— brief §2.2 的 11 个新建 + 12 个修改文件都在;
 *      **12 个冻结件** git status 全空 (= 一个字都没动)。
 *   B. **硬违规扫描 (零容忍)** —— PC 端写法铁律:
 *      零 `cn` / `clsx` / `tailwind-merge` / `cva` / `lucide-react` /
 *      零内联 `<svg>` (图标唯一出处是 `components/ui/Glyphs.tsx`) / 零 `!important`。
 *   C. **3 个新 Glyph 与 lucide 逐字比对** —— path / circle / rect 的
 *      **每一个元素、每一个属性**都跟 lucide v0.407.0 一致。
 *   D. **编码 / 行尾** —— 全部改动文件 UTF-8 无 BOM + LF-only。
 *   E. **表单 sheet 形态** —— 照抄 web 的**自绘** sheet, 不套 PC 的 `BottomSheet`。
 *
 * 用法: node scripts/verify-schedule-b6-engineering.mjs
 * 退出码: 0 = 全过 / 1 = 有失败。
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./lib/schedule-loader.mjs";

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

/** 标量相等。 */
const assertEqv = (actual, expected, m) =>
  assert(
    actual === expected,
    m,
    `实际 ${JSON.stringify(actual)} ≠ 期望 ${JSON.stringify(expected)}`,
  );

const src = (rel) => readFileSync(join(ROOT, rel), "utf8");

/**
 * 去注释 (手写扫描器 —— 保留 JSX, 不误伤字符串)。
 *
 * ⚠️ 为什么必须去: 本仓的文件头把「写法说明」写在注释里 ——
 *    比如 "`cn(...)` → 数组 filter(Boolean).join(" ")"、"不用 `!important`" ——
 *    直接扫原文会**误判成违规**。断言「代码里没有 X」必须只看**去注释后的代码**。
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

// ---------------------------------------------------------------------------
// A. 文件面
// ---------------------------------------------------------------------------
log("");
log("══ A. 文件面 (brief §2.2) ══");

const NEW_FILES = [
  "src/components/schedule/form/PopPanel.tsx",
  "src/components/schedule/form/usePopPosition.ts",
  "src/components/schedule/form/CustomSelect.tsx",
  "src/components/schedule/form/DatePickerField.tsx",
  "src/components/schedule/form/TimePickerField.tsx",
  "src/components/schedule/form/ScheduleDdlOverrunDialog.tsx",
  "src/components/schedule/form/ScheduleFormSheet.tsx",
  "src/components/schedule/detail/ScheduleDetailPage.tsx",
  "src/components/schedule/detail/ScheduleDetailView.tsx",
  "src/components/schedule/detail/CronDetailView.tsx",
  "src/routes/ScheduleDetailRoutes.tsx",
];

const MODIFIED_FILES = [
  "src/components/ui/Glyphs.tsx",
  "src/App.tsx",
  "src/routes/ScheduleToday.tsx",
  "src/routes/ScheduleCalendar.tsx",
  "src/routes/ScheduleBoard.tsx",
  "src/components/schedule/TodayTodoList.tsx",
  "src/components/schedule/ScheduleRow.tsx",
  "src/components/schedule/ScheduleTaskCard.tsx",
  "src/components/schedule/BoardView.tsx",
  "src/lib/notifications.ts",
  "src/lib/notifications-sse.ts",
  // 有意多改的一个 (brief §2.2 未列; 理由见报告): 「改 DDL」图标换成 B6 新画的
  // CalendarClockIcon ⇒ 今日待办 / 看板 / 详情页三处图标完全一致 (brief §3.2 图标对照表)。
  "src/components/schedule/ScheduleNodeMenu.tsx",
];

for (const f of NEW_FILES) {
  assert(existsSync(join(ROOT, f)), `新建文件存在: ${f}`);
}
for (const f of MODIFIED_FILES) {
  assert(existsSync(join(ROOT, f)), `修改文件存在: ${f}`);
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
];

let gitOk = true;
const gitStatus = (p) => {
  try {
    return execFileSync("git", ["status", "--porcelain", "--", p], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim();
  } catch {
    gitOk = false;
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
if (gitOk) {
  assert(FROZEN.length === 12, `冻结件清单 = 12 条 (brief §2.2)`);
}

// 断言脚本本身**不进仓** (scripts/* 被 .gitignore 忽略)
for (const f of [
  "scripts/verify-schedule-form-b6.mjs",
  "scripts/verify-schedule-detail-b6.mjs",
  "scripts/verify-schedule-b6-engineering.mjs",
]) {
  const st = gitStatus(f);
  if (st === null) continue;
  assert(st === "", `断言脚本不进仓 (gitignore): ${f}`, st);
}

// ---------------------------------------------------------------------------
// B. 硬违规扫描
// ---------------------------------------------------------------------------
log("");
log("══ B. 硬违规扫描 (零容忍) ══");

const ALL_B6_FILES = [...NEW_FILES, ...MODIFIED_FILES];
const BANNED_IMPORTS = [
  { re: /from\s+["']lucide-react["']/, name: "lucide-react" },
  { re: /from\s+["']clsx["']/, name: "clsx" },
  { re: /from\s+["']tailwind-merge["']/, name: "tailwind-merge" },
  { re: /from\s+["']class-variance-authority["']/, name: "cva" },
  { re: /from\s+["'][^"']*\/cn["']/, name: "cn 工具" },
];

for (const f of ALL_B6_FILES) {
  const s = stripComments(src(f));
  for (const b of BANNED_IMPORTS) {
    assert(!b.re.test(s), `${f}: 无 ${b.name} import`);
  }
  // cn( 调用 —— PC 的 className 一律 ["a","b"].filter(Boolean).join(" ")
  assert(
    !/\bcn\s*\(/.test(s),
    `${f}: 无 cn( 调用`,
    s.match(/.*\bcn\s*\(.*/)?.[0]?.trim() ?? "",
  );
  // 零 !important (冲突类名用 `!` **前缀**)
  assert(!s.includes("!important"), `${f}: 无 !important`);
  // 零内联 <svg> (图标唯一出处 = components/ui/Glyphs.tsx)
  if (f !== "src/components/ui/Glyphs.tsx") {
    assert(!/<svg[\s>]/.test(s), `${f}: 无内联 <svg>`);
  }
}

// 冲突类名的正确写法: `!` 前缀 (不是 !important)
const glyphsSrc = src("src/components/ui/Glyphs.tsx");
assert(
  !stripComments(glyphsSrc).includes("!important"),
  "Glyphs.tsx: 无 !important",
);

// ---------------------------------------------------------------------------
// C. 3 个新 Glyph ↔ lucide v0.407.0 逐字比对
// ---------------------------------------------------------------------------
log("");
log("══ C. 3 个新 Glyph ↔ lucide 逐字比对 ══");

const LUCIDE_DIR =
  "D:/gaga/gaclaw-project/gacode-web/node_modules/lucide-react/dist/esm/icons";
const LUCIDE_PKG =
  "D:/gaga/gaclaw-project/gacode-web/node_modules/lucide-react/package.json";

assert(existsSync(LUCIDE_PKG), "lucide-react 在 web 仓的 node_modules 里");
const lucideVersion = JSON.parse(readFileSync(LUCIDE_PKG, "utf8")).version;
assertEqv(lucideVersion, "0.407.0", "lucide-react 版本 = 0.407.0 (brief §3.2 的真值)");

/** 从 lucide 的 `createLucideIcon("X", [ ["path", { d: "..." }], ... ])` 里解析元素。 */
function parseLucide(file) {
  const s = readFileSync(file, "utf8");
  const out = [];
  const re = /\["(path|circle|rect|line|polyline|polygon|ellipse)",\s*\{([^}]*)\}\]/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    const attrs = {};
    for (const a of m[2].matchAll(/([a-zA-Z]+):\s*"([^"]*)"/g)) attrs[a[1]] = a[2];
    delete attrs.key;
    out.push({ tag: m[1], attrs });
  }
  return out;
}

/** 从 PC 的 Glyphs.tsx 里解析某个图标函数的子元素。 */
function parseGlyph(name) {
  const i = glyphsSrc.indexOf(`export function ${name}(`);
  if (i < 0) return null;
  const seg = glyphsSrc.slice(i);
  const j = seg.indexOf("\nexport function ", 10);
  const body = j > 0 ? seg.slice(0, j) : seg;
  const out = [];
  const re = /<(path|circle|rect|line|polyline|polygon|ellipse)\b([^>]*?)\/>/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const attrs = {};
    for (const a of m[2].matchAll(/([a-zA-Z]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    out.push({ tag: m[1], attrs });
  }
  return { body, elems: out };
}

const GLYPHS = [
  {
    pc: "CalendarClockIcon",
    lucide: "calendar-clock.js",
    note: "日程中心「改 DDL」菜单项",
  },
  {
    pc: "CheckSquareIcon",
    lucide: "square-check-big.js",
    note: "表单「通知渠道 · in_app」",
    // ⚠️ lucide 的 check-square.js 是**转发文件** ⇒ 真正的 path 在 square-check-big.js
    alsoCheck: "check-square.js",
  },
  {
    pc: "CalendarDaysIcon",
    lucide: "calendar-days.js",
    note: "日期选择器触发器",
  },
];

const sameAttrs = (a, b) => {
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  if (ka.length !== kb.length) return false;
  return ka.every((k, i) => kb[i] === k && a[k] === b[k]);
};

for (const g of GLYPHS) {
  const lucideFile = join(LUCIDE_DIR, g.lucide);
  assert(existsSync(lucideFile), `lucide 源文件存在: ${g.lucide}`);

  const luc = parseLucide(lucideFile);
  const pc = parseGlyph(g.pc);

  assert(pc !== null, `PC 导出 ${g.pc}`);
  if (!pc) continue;

  assertEqv(luc.length, pc.elems.length, `${g.pc}: 元素个数与 lucide 一致 (${luc.length})`);

  let allSame = true;
  const diffs = [];
  for (let i = 0; i < Math.max(luc.length, pc.elems.length); i++) {
    const l = luc[i];
    const p = pc.elems[i];
    if (!l || !p) {
      allSame = false;
      diffs.push(`#${i}: 缺元素 (lucide=${l?.tag ?? "-"} pc=${p?.tag ?? "-"})`);
      continue;
    }
    if (l.tag !== p.tag) {
      allSame = false;
      diffs.push(`#${i}: tag ${l.tag} ≠ ${p.tag}`);
      continue;
    }
    if (!sameAttrs(l.attrs, p.attrs)) {
      allSame = false;
      diffs.push(
        `#${i} <${l.tag}>: lucide ${JSON.stringify(l.attrs)} ≠ pc ${JSON.stringify(p.attrs)}`,
      );
    }
  }
  assert(
    allSame,
    `${g.pc}: 与 lucide ${g.lucide} **逐元素逐属性**一致 (${g.note})`,
    diffs.join(" | "),
  );

  // lucide 转发文件核对
  if (g.alsoCheck) {
    const fwd = readFileSync(join(LUCIDE_DIR, g.alsoCheck), "utf8");
    assert(
      fwd.includes(`from './${g.lucide}'`),
      `lucide ${g.alsoCheck} 转发到 ${g.lucide} (比对源选对了)`,
    );
  }

  // 视觉参数与 lucide 一致 (viewBox / fill / stroke / linecap / linejoin)
  for (const [attr, val] of [
    ["viewBox", "0 0 24 24"],
    ["fill", "none"],
    ["stroke", "currentColor"],
    ["strokeLinecap", "round"],
    ["strokeLinejoin", "round"],
  ]) {
    assert(
      pc.body.includes(`${attr}="${val}"`),
      `${g.pc}: ${attr}="${val}"`,
    );
  }
  assert(
    pc.body.includes("size = 20") && pc.body.includes("strokeWidth = 2"),
    `${g.pc}: 默认 size=20 / strokeWidth=2`,
  );
  assert(
    pc.body.includes("className={className}"),
    `${g.pc}: className 直传`,
  );
}

// ClockIcon 默认 sw1.6 —— 调用点必须显式传 strokeWidth={2}
assert(
  /export function ClockIcon\([\s\S]*?strokeWidth = 1\.6/.test(glyphsSrc),
  "ClockIcon 默认 strokeWidth = 1.6 (既有约定没被改)",
);

// ---------------------------------------------------------------------------
// D. 编码 / 行尾
// ---------------------------------------------------------------------------
log("");
log("══ D. 编码 / 行尾 ══");

for (const f of ALL_B6_FILES) {
  const buf = readFileSync(join(ROOT, f));
  const hasBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  assert(!hasBom, `${f}: 无 BOM`);
  const text = buf.toString("utf8");
  assert(!text.includes("\r"), `${f}: LF-only (无 CRLF)`);
  // UTF-8 合法性: 往返编码后字节不变
  assert(
    Buffer.from(text, "utf8").equals(buf),
    `${f}: 合法 UTF-8`,
  );
}

// ---------------------------------------------------------------------------
// E. 表单 sheet 形态 (自绘, 不套 BottomSheet)
// ---------------------------------------------------------------------------
log("");
log("══ E. 表单 sheet 形态 ══");

const sheetSrc = src("src/components/schedule/form/ScheduleFormSheet.tsx");
assert(
  sheetSrc.includes("max-w-[520px]") &&
    sheetSrc.includes("max-h-[88dvh]") &&
    sheetSrc.includes("rounded-t-2xl") &&
    sheetSrc.includes("shadow-dialog"),
  "ScheduleFormSheet 照抄 web 的自绘 sheet (520px / 88dvh / rounded-t-2xl / shadow-dialog)",
);
assert(
  !/from\s+["'][^"']*BottomSheet["']/.test(sheetSrc) &&
    !/<BottomSheet[\s>]/.test(sheetSrc),
  "ScheduleFormSheet **没有**套 PC 的 BottomSheet",
);
assert(
  !/from\s+["'][^"']*\/ui\/sheet["']/.test(sheetSrc),
  "ScheduleFormSheet 没有引入 web 的 sheet.tsx",
);

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
log("");
log("════════════════════════════════════════════");
log(`checked=${checked}  passed=${passed}  failed=${failed}`);
log("════════════════════════════════════════════");
if (failed > 0) {
  console.log(`❌ 工程约束断言 ${failed} 条未通过`);
  process.exit(1);
}
console.log("✅ 文件面 / 硬违规 0 / 3 个 Glyph 逐字比对 / 编码行尾 / sheet 形态 全部通过");
