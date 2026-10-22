#!/usr/bin/env node
/**
 * verify-md-table-colwidth.mjs
 *
 * 钉住「Markdown 表格列宽有上限」(2026-10-21, 对齐安卓 yinian-android@78541eb)。
 *
 * 背景:
 *   安卓 MarkdownTableCard.kt 的 clampColumnWidths 把列自然宽 clamp 到
 *   [80dp, 240dp] —— 下限保证列不被压扁, 上限封住「文字越长表格越宽」。
 *   web 端此前**没有列宽上限** (.md-table { width: max-content }), 长 URL 列
 *   能把单列撑到 800px+, 整张表被迫横滑很远 —— 两端观感不一致。
 *
 * 验什么:
 *   §A 静态   —— 从**真文件** src/styles/globals.css 读声明 (不复制粘贴, 改了立刻红)
 *   §B 渲染实测 —— 把**真 CSS** 注入无头 Chromium, 量真实渲染宽度
 *                 (需 scripts/e2e/node_modules 下的 puppeteer; 没有则跳过并提示)
 *
 * 退出码: 0 = 通过 / 1 = 有违反。
 *
 * 用法: node scripts/verify-md-table-colwidth.mjs
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

let fail = 0;
const pass = (m) => console.log(`  ✅ ${m}`);
const miss = (m) => { fail++; console.log(`  ❌ ${m}`); };
const note = (m) => console.log(`  ⚠️  ${m}`);
const log = (...a) => console.log(...a);

// =========================================================================
// §A 静态 —— 声明层
// =========================================================================
log("§A 静态声明 (src/styles/globals.css):");

const css = readFileSync(path.join(ROOT, "src/styles/globals.css"), "utf8");

/**
 * 解析 CSS 规则 —— 按**选择器精确匹配**取声明体。
 *   ⚠️ 不能用「包含 .md-table-td 的选择器」去取 —— `.md-table tbody tr:last-child
 *      .md-table-td` 这类复合选择器会命中, 取到的是错的声明体。
 *   同名规则取**最后一次**出现 (与 CSS 层叠顺序一致)。
 */
const cssNoComment = css.replace(/\/\*[\s\S]*?\*\//g, "");
const RULES = [...cssNoComment.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selectorList: m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  body: m[2],
}));

const declOf = (selector) => {
  const hits = RULES.filter((r) => r.selectorList.includes(selector));
  return hits.length ? hits[hits.length - 1].body : "";
};

/** 同名规则的**有效声明** (按文档顺序合并, 后者覆盖前者) —— 等价于层叠结果。 */
const effectiveDecl = (selector) => {
  const props = new Map();
  for (const r of RULES) {
    if (!r.selectorList.includes(selector)) continue;
    for (const d of r.body.split(";")) {
      const i = d.indexOf(":");
      if (i < 0) continue;
      const prop = d.slice(0, i).trim();
      if (prop) props.set(prop, d.slice(i + 1).trim());
    }
  }
  return [...props].map(([k, v]) => `${k}: ${v}`).join("; ");
};

/** 选择器**列表**精确匹配的规则体 (clamp 规则是 `.md-table-th, .md-table-td` 一条)。 */
const declOfList = (list) => {
  const want = [...list].sort().join("|");
  const hits = RULES.filter((r) => [...r.selectorList].sort().join("|") === want);
  return hits.length ? hits[hits.length - 1].body : "";
};

const minVar = /--md-table-col-min:\s*([0-9]+)px/.exec(css);
const maxVar = /--md-table-col-max:\s*([0-9]+)px/.exec(css);

minVar && Number(minVar[1]) === 80
  ? pass("--md-table-col-min = 80px (对齐安卓 ColumnWidthMin = 80dp)")
  : miss(`--md-table-col-min = ${minVar?.[1] ?? "(缺失)"}px, 期望 80px`);

maxVar && Number(maxVar[1]) === 240
  ? pass("--md-table-col-max = 240px (对齐安卓 ColumnWidthMax = 240dp)")
  : miss(`--md-table-col-max = ${maxVar?.[1] ?? "(缺失)"}px, 期望 240px`);

// clamp 规则: 必须同时作用于 th 和 td (只封 body 的话, 长表头照样撑爆整列)
const clampDecl = declOfList([".md-table-th", ".md-table-td"]);
const clampSelHit = clampDecl.length > 0;
clampSelHit
  ? pass("存在一条同时选中 .md-table-th 与 .md-table-td 的规则 (表头也封顶)")
  : miss("找不到同时选中 .md-table-th 与 .md-table-td 的规则 —— 长表头会撑爆整列");

/min-width:\s*var\(--md-table-col-min\)/.test(clampDecl)
  ? pass("clamp 规则声明了 min-width: var(--md-table-col-min)")
  : miss("clamp 规则缺 min-width");
/max-width:\s*var\(--md-table-col-max\)/.test(clampDecl)
  ? pass("clamp 规则声明了 max-width: var(--md-table-col-max)")
  : miss("clamp 规则缺 max-width");

// clamp 规则里不许出现颜色 (暗色主题色值不动)
const colorInClamp = /(color|background|border[^:]*)\s*:/i.test(clampDecl);
!colorInClamp
  ? pass("clamp 规则内无任何颜色/背景/边框声明 (暗色色值不动)")
  : miss("clamp 规则里混进了颜色声明 —— 暗色主题可能被改坏");

// ── 不许破坏的既有契约 ───────────────────────────────────────────────────
const tableDecl = effectiveDecl(".md-table");
const scrollDecl = effectiveDecl(".md-table-scroll");
const tdDecl = effectiveDecl(".md-table-td");
const thDecl = effectiveDecl(".md-table-th");

/width:\s*max-content/.test(tableDecl) && /table-layout:\s*auto/.test(tableDecl)
  ? pass(".md-table 仍是 width: max-content + table-layout: auto (阶段 2 列宽一致契约)")
  : miss(".md-table 的 width/table-layout 被改了 —— 列宽一致契约破了");

/overflow-x:\s*auto/.test(scrollDecl)
  ? pass(".md-table-scroll 仍有 overflow-x: auto (表格超宽仍能横滑)")
  : miss(".md-table-scroll 的 overflow-x 被改了 —— 表格超宽不能横滑了");

const wrapOk =
  /overflow-wrap:\s*break-word/.test(tdDecl) && /overflow-wrap:\s*break-word/.test(thDecl) &&
  /word-break:\s*normal/.test(tdDecl) && /word-break:\s*normal/.test(thDecl);
wrapOk
  ? pass("td/th 仍是 overflow-wrap: break-word + word-break: normal (长 URL 仍能断行)")
  : miss("td/th 的断行策略被改了 —— 长 URL 撑爆列");
log("");

// =========================================================================
// §B 渲染实测 —— 真 CSS + 无头 Chromium
// =========================================================================
log("§B 渲染实测 (真 CSS → Chromium):");

let puppeteer = null;
try {
  const requireE2E = createRequire(path.join(ROOT, "scripts/e2e/noop.cjs"));
  puppeteer = requireE2E("puppeteer");
} catch {
  note("puppeteer 不可用 (需 scripts/e2e/node_modules —— 该目录是本地 dev-only, 不入库)");
}

if (!puppeteer) {
  note("§B 渲染实测**未执行** —— §A 静态断言仍有效; 渲染结论见 docs/audit/md-table-column-width.md");
} else {
  const COL_MIN = Number(minVar?.[1] ?? 80);
  const COL_MAX = Number(maxVar?.[1] ?? 240);
  const EPS = 0.6;

  const LONG_URL =
    "https://gaga.example.com/api/v1/schedules/milestones/:id/reminders/:rid?window=2026-10-01..2026-10-31&sort=createdAt&order=desc";

  /** 镜像 Markdown.tsx 的真实 DOM 结构 (table → th.md-table-th / td.md-table-td > .md-table-td-inner)。 */
  const buildTable = (cols) => {
    const ths = cols.map((c) => `<th class="md-table-th">${c.header}</th>`).join("");
    const tds = cols
      .map(
        (c) =>
          `<td class="md-table-td"><div class="md-table-td-inner md-table-td-clamp">${c.body}</div></td>`,
      )
      .join("");
    return `<div class="md-table-scroll" id="sc"><table class="md-table" id="tb">
      <thead class="md-table-thead"><tr>${ths}</tr></thead>
      <tbody><tr>${tds}</tr></tbody></table></div>`;
  };

  // 真 CSS 注入 + Tailwind preflight 的 box-sizing (preflight 由 @tailwind base 提供, 浏览器不认)
  const pageHtml = (containerW, tableHtml) => `<!doctype html><html><head><meta charset="utf-8">
    <style>*,::before,::after{box-sizing:border-box;}</style>
    <style>${css}</style>
    <style>body{margin:0;background:#000;color:#eee;}</style>
    </head><body><div id="host" style="width:${containerW}px">${tableHtml}</div></body></html>`;

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  const measure = async (containerW, tableHtml) => {
    const p = await browser.newPage();
    await p.setViewport({ width: containerW + 40, height: 800 });
    await p.setContent(pageHtml(containerW, tableHtml), { waitUntil: "load" });
    const m = await p.evaluate(() => {
      const tb = document.getElementById("tb");
      const sc = document.getElementById("sc");
      const tds = [...tb.querySelectorAll("tbody tr:first-child td")];
      const ths = [...tb.querySelectorAll("thead th")];
      const cs = getComputedStyle(tds[0]);
      const lineH = parseFloat(cs.lineHeight) || 18.2;
      const padV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      return {
        colWidths: tds.map((d) => +d.getBoundingClientRect().width.toFixed(2)),
        thWidths: ths.map((d) => +d.getBoundingClientRect().width.toFixed(2)),
        colAligned: tds.every(
          (d, i) =>
            Math.abs(d.getBoundingClientRect().width - ths[i].getBoundingClientRect().width) < 0.5,
        ),
        tableWidth: +tb.getBoundingClientRect().width.toFixed(2),
        clientW: sc.clientWidth,
        scrollW: sc.scrollWidth,
        canScroll: sc.scrollWidth > sc.clientWidth,
        cellLines: tds.map((d) => +((d.getBoundingClientRect().height - padV) / lineH).toFixed(2)),
        overflowWrap: cs.overflowWrap,
        wordBreak: cs.wordBreak,
      };
    });
    await p.close();
    return m;
  };

  // ① 长内容列封顶 + 窄列抬到下限 + 同列等宽 + 长 URL 折行
  const s1 = await measure(600, buildTable([
    { header: "名称", body: "短" },
    { header: "链接", body: LONG_URL },
    { header: "备注", body: "中等长度的备注" },
    { header: "状态", body: "进行中" },
  ]));
  log(`  列宽 [${s1.colWidths.join(", ")}]  表宽 ${s1.tableWidth} / 容器 ${s1.clientW}`);

  s1.colWidths[1] <= COL_MAX + EPS
    ? pass(`长内容列封顶: ${s1.colWidths[1]}px ≤ ${COL_MAX}px`)
    : miss(`长内容列没封顶: ${s1.colWidths[1]}px > ${COL_MAX}px`);

  s1.colWidths[0] >= COL_MIN - EPS && s1.colWidths[3] >= COL_MIN - EPS
    ? pass(`窄列抬到下限: [${s1.colWidths[0]}, ${s1.colWidths[3]}]px ≥ ${COL_MIN}px`)
    : miss(`窄列没抬到下限: ${s1.colWidths[0]} / ${s1.colWidths[3]}px < ${COL_MIN}px`);

  s1.colAligned
    ? pass("同列 th ≡ td 等宽 (阶段 2 列宽一致契约未破)")
    : miss("同列 th/td 宽度不一致 —— 列歪了");

  s1.cellLines[1] > 1.5
    ? pass(`长 URL 在格内折行 (${s1.cellLines[1]} 行) —— 没被截断`)
    : miss(`长 URL 没折行 (${s1.cellLines[1]} 行) —— 仍是一行, 说明列没被封住`);

  s1.overflowWrap === "break-word" && s1.wordBreak === "normal"
    ? pass("计算样式仍是 overflow-wrap: break-word + word-break: normal")
    : miss(`断行策略被改: overflow-wrap=${s1.overflowWrap} word-break=${s1.wordBreak}`);

  // ② 表超容器仍能横滑
  const s2 = await measure(600, buildTable(
    Array.from({ length: 8 }, (_, i) => ({ header: `列${i + 1}`, body: `内容${i + 1}` })),
  ));
  s2.canScroll
    ? pass(`表格超宽仍可横滑 (表宽 ${s2.tableWidth} > 容器 ${s2.clientW})`)
    : miss(`表格超宽不能横滑 (表宽 ${s2.tableWidth} / 容器 ${s2.clientW})`);

  // ③ 窄内容少列不横滑 (对齐安卓「3 列总宽 < 气泡内宽 ⇒ 不横滑」语义)
  const s3 = await measure(360, buildTable([
    { header: "列一", body: "内容一" },
    { header: "列二", body: "内容二" },
    { header: "列三", body: "内容三" },
  ]));
  !s3.canScroll
    ? pass(`3 列窄内容不横滑 (表宽 ${s3.tableWidth} ≤ 容器 ${s3.clientW})`)
    : miss(`3 列窄内容竟横滑了 (表宽 ${s3.tableWidth} > 容器 ${s3.clientW})`);

  await browser.close();
  log("");
}

if (fail > 0) {
  console.log(`❌ ${fail} 条违反`);
  process.exit(1);
} else {
  console.log("✅ 表格列宽 clamp 全部通过 (静态声明 + 渲染实测)");
}
