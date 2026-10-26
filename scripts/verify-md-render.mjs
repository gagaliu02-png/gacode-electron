#!/usr/bin/env node
/**
 * verify-md-render.mjs
 *
 * 钉住「PC 端自研 Markdown **渲染层**（M2 / M2'）」的 DOM 结构 —— 基准是**安卓**
 * (`yinian-android/app/src/main/java/com/yinian/app/ui/markdown/*`)。
 *
 * 上游: M1 解析层 `src/lib/markdown/parser.ts`（172 条断言已绿）
 * 本批: M2 渲染层 `src/lib/markdown/renderer.tsx`（M2' = 块粒度对齐安卓的返工批）
 * 规格: `docs/md-android-behavior-spec.md`（唯一行为事实源，每条带安卓 file:line）
 *
 * 验什么:
 *   §A 静态    —— 渲染层源码不许出现第三方 markdown 库 / 原生列表标签 / 旧 PC 专属 class
 *   §B DOM 结构 —— 用 react-dom/server 的 renderToStaticMarkup 渲染真实 DOM，断言结构
 *   §C CSS 参数 —— 静态核对 globals.css 新增段里的关键视觉参数（不验视觉）
 *
 * 退出码: 0 = 全绿 / 1 = 有断言失败。
 *
 * ⚠️ **本脚本只覆盖 DOM 结构 + 间距模型 + CSS 参数文本**。
 *    **视觉一致性需真机人工确认** —— 脚本不截图、不测量、不比对像素，
 *    结论里也**不会**出现「渲染验证通过」「视觉一致」「与安卓一致」这类措辞。
 *
 * 用法: node scripts/verify-md-render.mjs
 * 前置: Node ≥ 22（原生 .ts 类型擦除）；react-dom（渲染层依赖，已在 package.json）。
 *       §B 需要能把 .tsx 编译成 JS —— 用仓内已有的 esbuild（vite 的传递依赖）；
 *       esbuild 不可用时 §B 标记为「需人工/后续接线后补」，脚本仍 exit 0。
 */

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const RENDERER_PATH = path.join(ROOT, "src/lib/markdown/renderer.tsx");
const PARSER_PATH = path.join(ROOT, "src/lib/markdown/parser.ts");
const CSS_PATH = path.join(ROOT, "src/styles/globals.css");
const CACHE_DIR = path.join(ROOT, "node_modules/.cache/gacode-md-render");
const BUNDLE_PATH = path.join(CACHE_DIR, "renderer.bundle.mjs");

// ── 断言框架 ───────────────────────────────────────────────────────────────
let total = 0;
let fail = 0;
let skipped = 0;
const pass = (m) => {
  total++;
  console.log(`  ✅ ${m}`);
};
const miss = (m) => {
  total++;
  fail++;
  console.log(`  ❌ ${m}`);
};
const note = (m) => console.log(`  ⚠️  ${m}`);
const skip = (m) => {
  skipped++;
  console.log(`  ⏭️  ${m}`);
};
/** 断言条件成立。 */
const ok = (cond, m, detail = "") =>
  cond ? pass(m) : miss(`${m}${detail ? " —— " + detail : ""}`);
/** 断言包含子串。 */
const has = (hay, needle, m) =>
  ok(
    String(hay).includes(needle),
    m,
    `缺少 ${JSON.stringify(needle)} —— 实际 ${JSON.stringify(String(hay).slice(0, 400))}`,
  );
/** 断言不包含子串。 */
const hasNot = (hay, needle, m) =>
  ok(
    !String(hay).includes(needle),
    m,
    `不应出现 ${JSON.stringify(needle)} —— 实际 ${JSON.stringify(String(hay).slice(0, 400))}`,
  );
/** 断言匹配正则。 */
const matches = (hay, re, m) =>
  ok(re.test(String(hay)), m, `不匹配 ${re} —— 实际 ${JSON.stringify(String(hay).slice(0, 400))}`);
/** 断言数组相等（顺序敏感）。 */
const eq = (actual, expected, m) =>
  ok(
    Array.isArray(actual) &&
      actual.length === expected.length &&
      actual.every((v, i) => v === expected[i]),
    m,
    `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`,
  );

/** HTML 空元素（自闭合 / 无闭合标签）。 */
const VOID_TAGS = new Set(["hr", "img", "br", "input", "meta", "link", "source", "col"]);

/**
 * 取 `.md-root` 的**直接子元素**的 class —— 用来断言「块边界」。
 *
 * 安卓顶层块只有 5 种（text / table / image / hr / codeBlock）⇒
 * `.md-root` 的直接子元素就该是这几个；标题 / 列表 / 引用**不会**出现在这里。
 * 简易深度扫描（SSR 输出无注释、无脚本）。
 */
function rootChildClasses(html) {
  const start = String(html).indexOf('class="md-root');
  if (start < 0) return [];
  let i = String(html).indexOf(">", start) + 1;
  const out = [];
  let depth = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    const gt = html.indexOf(">", lt);
    if (gt < 0) break;
    const tag = html.slice(lt, gt + 1);
    if (tag.startsWith("</")) {
      if (depth === 0) break; // 根 div 结束
      depth--;
    } else {
      if (depth === 0) {
        const cls = /class="([^"]*)"/.exec(tag);
        out.push(cls ? cls[1] : tag.slice(1).split(/[\s>/]/)[0]);
      }
      const name = tag.slice(1).split(/[\s>/]/)[0].toLowerCase();
      if (!tag.endsWith("/>") && !VOID_TAGS.has(name)) depth++;
    }
    i = gt + 1;
  }
  return out;
}

/**
 * 数某个 **精确 class** 出现了几次（`md-list` 不算 `md-list-item`）。
 */
const countClass = (html, cls) => {
  const s = String(html);
  let n = 0;
  const re = /class="([^"]*)"/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m[1].split(/\s+/).includes(cls)) n++;
  }
  return n;
};

/**
 * 取第一个带指定 class 的元素的**内部 HTML** —— 用来断言「块边界」
 * （表格不在 .md-text 内部 ⇒ 它是顶层兄弟块，不是段落内容）。
 */
function innerHtmlOfFirstClass(html, cls) {
  const s = String(html);
  const marker = `class="${cls}"`;
  const at = s.indexOf(marker);
  if (at < 0) return null;
  const tagStart = s.lastIndexOf("<", at);
  let i = s.indexOf(">", tagStart) + 1;
  const start = i;
  let depth = 1;
  while (i < s.length) {
    const lt = s.indexOf("<", i);
    if (lt < 0) break;
    const gt = s.indexOf(">", lt);
    if (gt < 0) break;
    const tag = s.slice(lt, gt + 1);
    if (tag.startsWith("</")) {
      depth--;
      if (depth === 0) return s.slice(start, lt);
    } else {
      const name = tag.slice(1).split(/[\s>/]/)[0].toLowerCase();
      if (!tag.endsWith("/>") && !VOID_TAGS.has(name)) depth++;
    }
    i = gt + 1;
  }
  return s.slice(start);
}

// PC 仓 package.json 没有 "type": "module" ⇒ Node 加载 .ts 时会告警，属已知噪声，过滤掉。
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.code === "MODULE_TYPELESS_PACKAGE_JSON") return;
  console.warn(`  ⚠️  ${w.name}: ${w.message}`);
});

// ── §A 静态：渲染层源码 ───────────────────────────────────────────────────
console.log("\n§A 静态 —— 渲染层源码（零第三方 markdown 库 / 无原生列表 / 无旧 PC 专属 class）");
const rendererSrc = readFileSync(RENDERER_PATH, "utf8");

/**
 * 去掉注释再查「不许出现」的字样 ——
 * 否则文件头的说明注释（里面就写着 react-markdown / md-bq 这些名字）会误报。
 * 只去块注释 + 整行行注释（不碰行尾注释，避免误伤字符串里的 `//`）。
 */
const codeOnly = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");

const rendererCode = codeOnly(rendererSrc);
// 兜底：确认去注释没把真代码吃掉
has(rendererCode, 'from "./parser"', "去注释后仍能看到 import（说明剥离没吃掉代码）");

hasNot(rendererCode, "react-markdown", "renderer 不依赖 react-markdown");
hasNot(rendererCode, "remark-", "renderer 不依赖 remark-*");
hasNot(rendererCode, "rehype-", "renderer 不依赖 rehype-*");
hasNot(rendererCode, "highlight.js", "renderer 不依赖 highlight.js");
hasNot(rendererCode, "lucide-react", "renderer 不依赖 lucide-react（图标手写内联 SVG）");
hasNot(rendererCode, "md-bq", "renderer 不挂 .md-bq（3 色左边框是 PC/web 独有）");
hasNot(rendererCode, "md-table-td-clamp", "renderer 不挂 .md-table-td-clamp（安卓无行数折叠）");
hasNot(rendererCode, "md-lightbox", "renderer 不引入 lightbox（安卓不支持）");
hasNot(rendererCode, "<ul", "renderer 不产出原生 <ul>");
hasNot(rendererCode, "<ol", "renderer 不产出原生 <ol>");
hasNot(rendererCode, "<li", "renderer 不产出原生 <li>");
hasNot(rendererCode, "parseInline", "renderer 不自行做行内解析（标题 D1 照抄安卓）");
has(rendererSrc, 'from "./parser"', "renderer 只消费 M1 的 AST（./parser）");

// ── §B DOM 结构 ───────────────────────────────────────────────────────────
console.log("\n§B DOM 结构 —— react-dom/server 渲染真实 DOM");

let render = null; // (text, opts) => html
let renderBlocks = null; // (blocks) => html
let React = null;

try {
  const esbuild = await import("esbuild");
  const built = esbuild.buildSync({
    entryPoints: [RENDERER_PATH],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node18",
    jsx: "automatic",
    external: ["react", "react-dom", "react-dom/server", "react/jsx-runtime"],
    write: false,
    outfile: "renderer.bundle.mjs",
    logLevel: "silent",
  });
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(BUNDLE_PATH, built.outputFiles[0].text, "utf8");

  React = (await import("react")).default ?? (await import("react"));
  const { renderToStaticMarkup } = await import("react-dom/server");
  const mod = await import(pathToFileURL(BUNDLE_PATH).href);
  const { MdMarkdown, MdRenderer } = mod;
  const { parseMarkdown } = await import(pathToFileURL(PARSER_PATH).href);

  render = (text, opts = {}) =>
    renderToStaticMarkup(React.createElement(MdMarkdown, { text, ...opts }));
  renderBlocks = (blocks, opts = {}) =>
    renderToStaticMarkup(React.createElement(MdRenderer, { blocks, ...opts }));
} catch (err) {
  note(`渲染层载入失败（esbuild / react-dom 不可用?）：${err && err.message}`);
}

if (render) {
  // ── 根容器 ──────────────────────────────────────────────────────────────
  has(render("x"), 'class="md-root md-root-chat"', "根容器 = .md-root .md-root-chat（默认 chat 场景）");
  has(render("x", { size: "reading" }), "md-root-reading", "阅读场景根容器 = .md-root-reading（16px/24px）");

  // ── 段落：硬换行 + 空行被吃掉（安卓两层模型）───────────────────────────
  has(render("a\nb"), 'class="md-para"', "段落挂 .md-para");
  has(render("a\nb"), "a\nb", "单 \\n 即硬换行（安卓 MarkdownParser.kt:440）");
  has(render("a\nb"), 'class="md-line"', "段落内的普通文本行挂 .md-line");
  has(render("a\nb"), 'class="md-text"', "文本块挂 .md-text（顶层块之一，安卓 MdBlock.Text）");
  // 空行 ⇒ **段落边界**，不再渲染成一行空行（安卓 splitParagraphs）
  const twoParas = render("a\n\nb");
  ok(countClass(twoParas, "md-para") === 2, "空行切出 2 个段落（.md-para）");
  hasNot(twoParas, "a\n\nb", "空行**不产生任何渲染**（正文里不再有空行文本）");
  ok(countClass(twoParas, "md-line") === 2, "2 个段落各有 1 行（.md-line）");

  // ── 标题 H1–H3 / H4 降级 / D1 ───────────────────────────────────────────
  has(render("# T"), "<h1", "H1 → <h1>");
  has(render("## T"), "<h2", "H2 → <h2>");
  has(render("### T"), "<h3", "H3 → <h3>");
  has(render("# T"), "md-heading md-heading-1", "H1 挂 .md-heading-1");
  hasNot(render("#### T"), "<h4", "H4 降级为普通文本（不产 heading 节点）");
  hasNot(render("#### T"), "md-heading", "H4 不挂任何 heading class");
  // D1：标题内容不做行内解析 —— `# **粗**` 显示字面量
  const d1 = render("# **粗**");
  has(d1, "**粗**", "D1：标题内容原样（字面量 **粗**）");
  hasNot(d1, "<strong", "D1：标题内不产 <strong>（照抄安卓 MarkdownParser.kt:396）");

  // ── 引用：2 空格缩进 / 无 .md-bq / 无斜体 ───────────────────────────────
  const bq = render("> hi");
  has(bq, 'class="md-quote-line"', "引用行挂 .md-quote-line");
  has(bq, "  hi", "引用缩进 = 2 个空格（AST prefix 文本）");
  hasNot(bq, "md-bq", "引用不挂 .md-bq（无 3 色左边框）");
  hasNot(bq, "italic", "引用不加整行斜体（D2：安卓无 pushStyle(em)）");
  has(render(">> hi"), "    hi", "两层引用缩进 = 4 个空格（每层 2 空格）");

  // ── 列表：前缀是文本，无原生标签 ─────────────────────────────────────────
  const ul = render("- a");
  has(ul, "md-list-prefix", "列表项挂 .md-list-prefix");
  has(ul, "•", "无序列表前缀 = 圆点（安卓 MarkdownParser.kt:416）");
  hasNot(ul, "<ul", "无序列表不产 <ul>");
  hasNot(ul, "<li", "无序列表不产 <li>");
  has(render("1. a"), "1. ", "有序列表前缀 = 1. （安卓 MarkdownParser.kt:408）");
  hasNot(render("1. a"), "<ol", "有序列表不产 <ol>");
  has(render("- **粗**"), "<strong", "列表项正文走行内解析（**粗** 生效）");

  // ── task list ───────────────────────────────────────────────────────────
  const task = render("- [x] done");
  has(task, "[X] ", "已勾选 task 前缀 = [X] （安卓 MarkdownParser.kt:361）");
  has(task, "md-strike", "已勾选 task 正文加删除线（taskChecked 样式）");
  const taskU = render("- [ ] todo");
  has(taskU, "[ ] ", "未勾选 task 前缀 = [ ]");
  hasNot(taskU, "md-strike", "未勾选 task 正文不划线");

  // ── 表格 ────────────────────────────────────────────────────────────────
  const tbl = render("| a | b |\n|---|---|\n| 1 | 2 |");
  has(tbl, "md-table-scroll", "表格挂 .md-table-scroll（横滑容器）");
  has(tbl, 'class="md-table"', "表格挂 .md-table（列宽 clamp 保持现成 class）");
  has(tbl, "md-table-thead", "表格挂 .md-table-thead");
  has(tbl, "md-table-th", "表格挂 .md-table-th");
  has(tbl, "md-table-td", "表格挂 .md-table-td");
  has(tbl, "text-align:center", "表头恒居中（inline style，压得住 CSS 的 left）");
  hasNot(tbl, "md-table-td-clamp", "表格不挂 .md-table-td-clamp（安卓无 6 行折叠）");
  has(tbl, "text-align:left", "表体默认左对齐（无对齐标记时）");
  has(render("| a |\n|:--:|\n| 1 |"), "text-align:center", "表体按 :---: 居中");
  has(render("| a |\n|---:|\n| 1 |"), "text-align:right", "表体按 ---: 右对齐");

  // ── 代码块：卡片（知识库） vs 行内等宽（chat） ──────────────────────────
  const card = render("```kotlin\nval x = 1\n```", { cutCodeBlocks: true });
  has(card, "md-code-card", "知识库场景：围栏切成卡片 .md-code-card");
  has(card, "md-code-lang", "卡片带语言徽章 .md-code-lang");
  has(card, "kotlin", "徽章显示语言名 kotlin");
  has(card, "md-code-copy", "卡片带复制按钮 .md-code-copy");
  has(card, "复制", "复制按钮文案 = 复制");
  has(card, "md-code-body", "卡片正文 .md-code-body（13sp/18sp 等宽）");
  hasNot(card, "md-lightbox", "代码块不涉及 lightbox");

  const codeCardNoLang = render("```\nplain\n```", { cutCodeBlocks: true });
  has(codeCardNoLang, ">code<", "无语言时徽章兜底显示 code（安卓 MarkdownCodeBlock.kt:137）");

  const run = render("```kotlin\nval x = 1\n```");
  has(run, "md-code-run", "chat 场景：围栏渲染成行内等宽 .md-code-run");
  hasNot(run, "md-code-card", "chat 场景不切卡片（安卓 MarkdownParser.kt:167-171）");
  hasNot(run, "md-code-lang", "chat 场景无语言徽章");
  hasNot(run, "md-code-copy", "chat 场景无法复制");

  // codeRun 里的 URL：可点但**不加** link 样式
  const runUrl = render("```\nhttps://example.com/a\n```");
  has(runUrl, "md-code-run-url", "codeRun 内 URL 可点（.md-code-run-url）");
  has(runUrl, 'href="https://example.com/a"', "codeRun 内 URL 保留原文 + 可点地址");
  hasNot(runUrl, "md-link", "codeRun 内 URL 不加 link 样式（安卓 :490-493）");

  // ── 图片 ────────────────────────────────────────────────────────────────
  const img = render("![alt](https://x.com/a.png)");
  has(img, "md-image", "块级图片挂 .md-image");
  has(img, 'src="https://x.com/a.png"', "图片 src 正确");
  hasNot(img, "md-lightbox", "图片无 lightbox（安卓不支持，契约 C2）");
  hasNot(img, "zoom-in", "图片无点击放大光标");

  // ── 分隔线 ──────────────────────────────────────────────────────────────
  const hr = render("---");
  has(hr, '<hr class="md-hr-full"', "分隔线 = 满宽 .md-hr-full（不用 PC 旧的居中短线 .md-hr）");
  hasNot(hr, 'class="md-hr"', "分隔线不挂旧 .md-hr");

  // ── ::: 扩展标记 ─────────────────────────────────────────────────────────
  const ext = render(":::tip");
  has(ext, "md-extension", "::: 产出 .md-extension 块");
  has(ext, "tip", "extension 承载 marker（安卓 D6：正文丢失，只剩 marker）");

  // ── 行内节点 ────────────────────────────────────────────────────────────
  has(render("**b**"), '<strong class="md-strong">', "粗体 = <strong class=md-strong>（字重 800）");
  has(render("*i*"), '<em class="md-em">', "斜体 = <em class=md-em>");
  has(render("~~d~~"), '<del class="md-strike">', "删除线 = <del class=md-strike>（实色 #9ca3af）");
  has(render("`c`"), '<code class="md-inline-code">', "行内 code = <code class=md-inline-code>");
  has(render("`c`"), ">c<", "行内 code 内容原样（反引号剥掉）");
  has(render("[t](https://x.com)"), '<a class="md-link"', "链接 = <a class=md-link>");
  has(render("[t](https://x.com)"), 'href="https://x.com"', "链接 href 正确");
  has(render("[t](https://x.com)"), ">t<", "链接只显示 text，URL 不露出");
  has(render("[t](https://x.com)"), 'target="_blank"', "链接 target=_blank（Electron 主进程 openExternal）");
  has(render("[#1]"), '<span class="md-cite">', "角标 = <span class=md-cite>");
  has(render("[#1]"), "[#1]", "角标连方括号一起显示");
  const bare = render("see https://example.com now");
  has(bare, '<a class="md-link"', "裸 URL 也可点");
  has(bare, 'href="https://example.com"', "裸 URL 归一化补 https://");
  has(bare, ">https://example.com<", "裸 URL 显示原文（含 scheme，安卓 MarkdownParser.kt:663）");

  // ── 段落边界 / 块边界（安卓两层模型 —— 返工批专项）──────────────────────
  {
    // ① 空行切段：标题与正文分属 2 个段落，标题**不是**顶层块
    const p = render("# 标题\n\n正文");
    eq(rootChildClasses(p), ["md-text"], "`.md-root` 的直接子元素只有 .md-text（标题不是顶层块）");
    ok(countClass(p, "md-para") === 2, "「# 标题\\n\\n正文」= 2 个段落");
    ok(countClass(p, "md-heading-1") === 1, "标题渲染成 .md-heading-1");
    ok(countClass(p, "md-line") === 1, "正文渲染成 1 个 .md-line");
    ok(p.indexOf("md-heading-1") < p.indexOf("md-line"), "段落内顺序：标题行在前、正文行在后");
    has(p, "标题", "标题文字保留");
    has(p, "正文", "正文文字保留");
  }
  {
    // ② 无空行 ⇒ 标题与正文在同一个段落内
    const same = render("# 标题\n正文");
    ok(countClass(same, "md-para") === 1, "「# 标题\\n正文」（无空行）= 1 个段落（标题与正文同段）");
    ok(countClass(same, "md-heading-1") === 1, "同段内标题仍是 1 个 .md-heading-1");
    ok(countClass(same, "md-line") === 1, "同段内正文是 1 个 .md-line");
  }
  {
    // ③ 表格是独立顶层块 ⇒ 与前后文本之间是**块边界**
    const t = render("正文\n\n| a | b |\n|---|---|\n| 1 | 2 |");
    eq(rootChildClasses(t), ["md-text", "md-table-scroll"], "表格是 .md-root 的直接子元素（块边界，不是段落边界）");
    ok(countClass(t, "md-para") === 1, "表格前的文本自成 1 个段落（表格不在段落里）");
    ok(
      !String(innerHtmlOfFirstClass(t, "md-text")).includes("md-table"),
      "表格不在 .md-text 内部（块边界 ≠ 段落边界）",
    );
  }
  {
    // ④ 列表归组：连续同类归一组；ordered↔unordered 切换开新组
    const l = render("1. a\n2. b\n- c\n- d");
    ok(countClass(l, "md-list") === 2, "ordered↔unordered 切换 ⇒ 2 个列表组");
    ok(countClass(l, "md-list-item") === 4, "4 个列表项分布在 2 组里");
    ok(countClass(render("- a\n- b"), "md-list") === 1, "连续的同类列表项归 1 组");
    ok(countClass(render("- [x] a\n- [ ] b"), "md-task-list") === 1, "task 列表单独成组（.md-task-list）");
  }
  {
    // ⑤ 引用行归组
    const q = render("> a\n> b");
    ok(countClass(q, "md-quote") === 1, "连续的引用行合并成 1 个 .md-quote");
    ok(countClass(q, "md-quote-line") === 2, "2 个引用行");
  }
  {
    // ⑥ 顶层块的类型集合（安卓 MdBlock 只有 5 种）
    const all = render("# t\n\n正文\n\n- a\n\n> q\n\n:::tip\n\n---\n\n![i](https://x.com/a.png)\n\n| a |\n|---|\n\n```\nc\n```", {
      cutCodeBlocks: true,
    });
    const kinds = [...new Set(rootChildClasses(all))].sort();
    eq(kinds, ["md-code-card", "md-hr-full", "md-image", "md-table-scroll", "md-text"], "顶层块只有 5 种（text/table/image/hr/codeBlock）");
  }

  // ── AST 直喂（不经 parseMarkdown）──────────────────────────────────────
  const { parseMarkdown } = await import(pathToFileURL(PARSER_PATH).href);
  const blocks = parseMarkdown("> x");
  const direct = renderBlocks(blocks);
  has(direct, "md-quote-line", "MdRenderer 可直接吃 AST（blocks 入参）");
} else {
  note("§B 渲染断言未执行 —— 渲染层无法载入（esbuild / react-dom 不可用）");
  skip("DOM 结构断言（需 esbuild + react-dom；渲染层接线后可补）");
}

// ── §C CSS 参数静态核对（不验视觉）────────────────────────────────────────
console.log("\n§C CSS 参数 —— 静态核对 globals.css（新增段）");
const css = readFileSync(CSS_PATH, "utf8");
const m2Start = css.indexOf("M2 · Markdown 自研渲染层");
ok(m2Start >= 0, "globals.css 末尾存在 M2 渲染层新增段");
const m2 = m2Start >= 0 ? css.slice(m2Start) : "";

has(m2, ".md-root-chat", "CSS: .md-root-chat 存在");
has(m2, "font-size: 14px", "CSS: chat 正文字号 14px（安卓 14.sp）");
has(m2, "font-size: 16px", "CSS: 阅读正文字号 16px（安卓 16.sp）");
has(m2, "line-height: 24px", "CSS: 阅读行高 24px（安卓 24.sp）");
has(m2, "margin-top: 8px", "CSS: 块间距 8px（安卓 spacedBy(8.dp)）");
has(m2, ".md-para", "CSS: .md-para 存在");
has(m2, "white-space: pre-wrap", "CSS: 段落 pre-wrap（硬换行）");
has(m2, ".md-heading-1", "CSS: .md-heading-1 存在");
has(m2, "font-size: 22px", "CSS: H1 22px（安卓 22.sp）");
has(m2, "font-size: 20px", "CSS: H2 20px（安卓 20.sp）");
has(m2, "font-size: 18px", "CSS: H3 18px（安卓 18.sp）");
has(m2, "font-weight: 700", "CSS: 标题 Bold 700（安卓 FontWeight.Bold）");
has(m2, "font-weight: 800", "CSS: 正文粗体 800（安卓 ExtraBold）");
has(m2, ".md-strong", "CSS: .md-strong 存在");
has(m2, ".md-em", "CSS: .md-em 存在");
has(m2, ".md-strike", "CSS: .md-strike 存在（实色，不用旧的 60% 透明 .md-del）");
has(m2, "text-decoration-color: var(--fg-muted)", "CSS: 删除线描线实色 var(--fg-muted)=#9ca3af");
has(m2, ".md-inline-code", "CSS: .md-inline-code 存在");
has(m2, "background: var(--bg-elevated)", "CSS: 行内 code 底色 var(--bg-elevated)=#181818");
has(m2, ".md-code-run", "CSS: .md-code-run 存在（chat 行内等宽）");
has(m2, ".md-link", "CSS: .md-link 存在");
has(m2, "color: var(--brand)", "CSS: 链接色 var(--brand)=#FF6B35");
has(m2, ".md-cite", "CSS: .md-cite 存在");
has(m2, "color: var(--brand-on-container)", "CSS: 角标色 var(--brand-on-container)=#FFD7B8");
has(m2, ".md-hr-full", "CSS: .md-hr-full 存在");
has(m2, "padding: 4px 0", "CSS: 分隔线上下 4px（安卓 4dp）");
has(m2, ".md-image", "CSS: .md-image 存在");
has(m2, "max-width: 280px", "CSS: 图片宽上限 280px（安卓 280.dp）");
has(m2, "min-height: 120px", "CSS: 图片高下限 120px（安卓 120.dp）");
has(m2, "max-height: 320px", "CSS: 图片高上限 320px（安卓 320.dp）");
has(m2, "border-radius: 12px", "CSS: 图片圆角 12px（安卓 12.dp）");
has(m2, ".md-code-card", "CSS: .md-code-card 存在");
has(m2, "border-radius: 12px", "CSS: 代码块卡片圆角 12px（安卓 12.dp）");
has(m2, "font-size: 11px", "CSS: 语言徽章 11px（安卓 11.sp）");
has(m2, "font-size: 13px", "CSS: 代码正文 13px（安卓 13.sp）");
has(m2, "line-height: 18px", "CSS: 代码正文行高 18px（安卓 18.sp）");
has(m2, ".md-extension", "CSS: .md-extension 存在");

// ── M2' · 块粒度对齐安卓（段落边界 / 块边界）────────────────────────────
has(m2, "M2' · Markdown 块粒度对齐安卓", "globals.css 末尾有 M2' 返工段");
has(m2, ".md-text", "CSS: .md-text 存在（文本块容器 = 安卓 MdBlock.Text）");
has(m2, ".md-line", "CSS: .md-line 存在（段落内的普通文本行）");
matches(
  m2,
  /\.md-line \{\s*min-height: 1lh;/,
  "CSS: 空文本行也占 1 个行盒高（安卓围栏开启行补的 \"\\n\"，MarkdownParser.kt:342）",
);
matches(
  m2,
  /\.md-root-reading \.md-text > \.md-para \+ \.md-para \{\s*margin-top: 12px;/,
  "CSS: 阅读场景段落间距 12px（安卓 LibraryDetailScreen.kt:332 = 12.dp）",
);
matches(
  m2,
  /\.md-root-chat \.md-text > \.md-para \+ \.md-para \{\s*margin-top: 1\.5em;/,
  "CSS: chat 场景段落间距 = 1 个行盒（安卓 chat paragraphSpacing = 0.dp ⇒ 空行保留为一行）",
);
matches(
  m2,
  /\.md-table-thead \{\s*font-size: 12px;/,
  "CSS: 表头字号 12px（安卓 MarkdownTableCard.kt:127-138 = 12sp / SemiBold）",
);
has(m2, "margin-top: 8px", "CSS: 块间距仍是 8px（顶层块之间，安卓 spacedBy(8.dp)）");

// 契约红线：表格列宽 clamp + 横滑 —— **一个字节都不许改**
has(css, "--md-table-col-min: 80px", "红线：列宽下限仍是 80px（未改动）");
has(css, "--md-table-col-max: 240px", "红线：列宽上限仍是 240px（未改动）");
has(css, ".md-table-scroll", "红线：.md-table-scroll 横滑容器仍在（未改动）");

// ── 结论 ─────────────────────────────────────────────────────────────────
console.log("");
if (fail > 0) {
  console.log(`❌ 渲染层结构断言有失败项（${fail}/${total} 失败）—— 仅覆盖「DOM 结构 / 间距模型」`);
  console.log("⚠️ 视觉一致性需真机人工确认，脚本只覆盖 DOM 结构 / 间距模型。");
  process.exit(1);
}
const skippedNote = skipped > 0 ? `（另有 ${skipped} 项标记为需人工/后续接线后补）` : "";
console.log(
  `✅ 渲染层结构断言通过（${total}/${total}）—— 仅覆盖「DOM 结构 / 间距模型」${skippedNote}`,
);
console.log("⚠️ 视觉一致性需真机人工确认，脚本只覆盖 DOM 结构 / 间距模型。");
process.exit(0);
