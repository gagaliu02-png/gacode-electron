#!/usr/bin/env node
/**
 * verify-md-parser.mjs
 *
 * 钉住「PC 端自研 Markdown 解析层」的语法行为 —— 基准是**安卓**
 * (`yinian-android/app/src/main/java/com/yinian/app/ui/markdown/MarkdownParser.kt`)。
 *
 * 背景:
 *   gaga 2026-10-26 拍板「全都要自研, 我们要全栈自研」⇒ PC 端不再用
 *   react-markdown / remark-gfm / remark-emoji / rehype-sanitize, 改为自研解析层
 *   (`src/lib/markdown/parser.ts`), 行为以安卓为基准。
 *   行为规格 (唯一输入源): `docs/md-android-behavior-spec.md`。
 *
 * 验什么:
 *   §A 静态   —— parser 源码里不许出现第三方 markdown 库 / React / HTML 注入面
 *   §B 词法   —— H1-H3 / H4-H6 降级 / 粗体 800 / 斜体 / 删除线 / 行内 code / 围栏
 *   §C 行内   —— 链接 / 裸 URL / 文件名黑名单 / 角标 / 行内图 / HTML / emoji
 *   §D 块级   —— 块级图 / 引用缩进 / 列表前缀 / task-list / 表格 / 分隔线 / 硬换行
 *   §E 流式   —— 半截表格不升级 + 升级判定三态
 *
 * 退出码: 0 = 全绿 / 1 = 有断言失败。
 *
 * ⚠️ 本脚本只验**解析层**。渲染层 (M2) 尚未接线 ⇒ **不验视觉**，
 *    结论文案也**不会**出现「渲染验证通过」这种误导措辞。
 *
 * 用法: node scripts/verify-md-parser.mjs
 * 前置: Node ≥ 22（需要 Node 原生的 .ts 类型擦除；本仓 package.json 没有
 *       "type": "module", 故用动态 import + 过滤 MODULE_TYPELESS_PACKAGE_JSON 噪声）。
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PARSER_PATH = path.join(ROOT, "src/lib/markdown/parser.ts");

// ── 断言框架 ───────────────────────────────────────────────────────────────
let total = 0;
let fail = 0;
const log = (...a) => console.log(...a);
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

/** 深比较（对象键序无关）。 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object") {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    if (ka.length !== kb.length || !ka.every((k, i) => k === kb[i])) return false;
    return ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/** 断言相等。 */
const eq = (actual, expected, m) =>
  deepEqual(actual, expected)
    ? pass(m)
    : miss(`${m} —— 期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(actual)}`);

/** 断言条件成立。 */
const ok = (cond, m, detail = "") =>
  cond ? pass(m) : miss(`${m}${detail ? " —— " + detail : ""}`);

// ── 载入 parser ────────────────────────────────────────────────────────────
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 22) {
  console.error(`❌ 需要 Node ≥ 22（原生 .ts 类型擦除），当前 ${process.versions.node}`);
  process.exit(1);
}

// PC 仓 package.json 没有 "type": "module" ⇒ Node 加载 .ts 时会告警，属已知噪声，过滤掉。
// （告警的 type 落在 w.code 上，不是 w.name —— w.name 恒为 "Warning"。）
process.removeAllListeners("warning");
process.on("warning", (w) => {
  if (w.code === "MODULE_TYPELESS_PACKAGE_JSON") return;
  console.warn(`  ⚠️  ${w.name}: ${w.message}`);
});

const md = await import("../src/lib/markdown/parser.ts");
const { parseMarkdown, parseInline, detectTableUpgrade, splitTableCells, parseAlignments, isFilenameMatch } = md;

// ── 小工具 ────────────────────────────────────────────────────────────────
/** 取第一个指定类型的块。 */
const blockOf = (blocks, type) => blocks.find((b) => b.type === type);
/** 取块里的全部行内文本。 */
const plain = (inline) => (inline || []).map((n) => n.text ?? "").join("");
/** 段落块的所有行文本。 */
const paraLines = (blocks) =>
  blocks
    .filter((b) => b.type === "paragraph")
    .flatMap((b) => b.lines.map((l) => plain(l.inline)));
/** 全文纯文本（还原成「看得见的字符」）。 */
const visible = (blocks) => {
  const out = [];
  for (const b of blocks) {
    if (b.type === "paragraph") out.push(b.lines.map((l) => plain(l.inline)).join("\n"));
    else if (b.type === "heading") out.push(plain(b.inline));
    else if (b.type === "blockquote") out.push(b.lines.map((l) => l.prefix + plain(l.inline)).join("\n"));
    else if (b.type === "orderedList" || b.type === "unorderedList" || b.type === "taskList")
      out.push(b.items.map((i) => i.prefix + plain(i.inline)).join("\n"));
    else if (b.type === "table") {
      out.push(b.header.map((c) => c.text).join(" | "));
      for (const r of b.rows) out.push(r.map((c) => c.text).join(" | "));
    } else if (b.type === "codeBlock") out.push(b.raw);
    else if (b.type === "image") out.push(b.alt ?? "");
    else if (b.type === "extension") out.push(b.marker);
    else out.push("");
  }
  return out.join("\n");
};

// =========================================================================
// §A 静态 —— 依赖面
// =========================================================================
log("§A 静态（parser 源码依赖面）:");

const parserSrc = readFileSync(PARSER_PATH, "utf8");

const banned = [
  "react-markdown",
  "remark-gfm",
  "remark-emoji",
  "remark-",
  "rehype-",
  "highlight.js",
  "shiki",
  "mermaid",
];
const importLines = parserSrc
  .split("\n")
  .filter((l) => /^\s*import\b/.test(l) || /^\s*export\b.*\bfrom\b/.test(l) || /require\(/.test(l));
const badImports = importLines.filter((l) =>
  banned.some((b) => l.toLowerCase().includes(b.toLowerCase())),
);
eq(badImports, [], "parser 没有 import 任何第三方 markdown 库（react-markdown / remark-* / rehype-* / 高亮）");

ok(
  !/from\s+["']react["']/.test(parserSrc) && !/\bReact\./.test(parserSrc),
  "parser 不依赖 React（纯 TS）",
);
ok(
  !/dangerouslySetInnerHTML|innerHTML\s*=|outerHTML|insertAdjacentHTML|document\./.test(parserSrc),
  "parser 没有任何 HTML 注入面（不渲染 HTML ⇒ 天然无 XSS）",
);
ok(
  !/\beval\s*\(|new Function\(/.test(parserSrc),
  "parser 没有 eval / new Function",
);

// =========================================================================
// §B 词法
// =========================================================================
log("");
log("§B 词法:");

// H1-H3
{
  const b = parseMarkdown("# H1\n## H2\n### H3");
  eq(
    b.map((x) => x.type),
    ["heading", "heading", "heading"],
    "H1/H2/H3 都产出 heading 节点",
  );
  eq(
    b.map((x) => (x.type === "heading" ? x.level : 0)),
    [1, 2, 3],
    "heading 级别 = 1/2/3",
  );
  eq(
    b.map((x) => (x.type === "heading" ? plain(x.inline) : "")),
    ["H1", "H2", "H3"],
    "heading 内容 = 去掉前缀后的原文",
  );
}

// H4-H6 降级（PM 口径 #1）
{
  const b = parseMarkdown("#### H4\n##### H5\n###### H6");
  ok(
    b.every((x) => x.type !== "heading"),
    "H4-H6 不产出 heading 节点（安卓只判 # / ## / ### ）",
  );
  ok(
    b.every((x) => x.type === "paragraph"),
    "H4-H6 降级成普通 paragraph",
  );
  eq(
    paraLines(b),
    ["#### H4", "##### H5", "###### H6"],
    "H4-H6 的井号原样保留",
  );
}

// 标题前缀必须带空格
{
  const b = parseMarkdown("#NoSpace");
  ok(blockOf(b, "heading") === undefined, "`#NoSpace`（无空格）不是标题");
  eq(paraLines(b), ["#NoSpace"], "`#NoSpace` 原样落在普通文本里");
}

// 粗体 800
{
  const inline = parseInline("a **bold** b");
  const strong = inline.find((n) => n.type === "strong");
  ok(strong !== undefined, "`**bold**` 产出 strong 节点");
  eq(strong?.text, "bold", "strong 文本 = bold（星号剥掉）");
  eq(strong?.weight, 800, "strong 字重 = 800（安卓 ExtraBold）");
  const underline = parseInline("__bold__").find((n) => n.type === "strong");
  ok(underline !== undefined && underline.text === "bold", "`__bold__` 同样识别为粗体");
}

// 斜体 / 单下划线不认
{
  ok(parseInline("*em*").some((n) => n.type === "em"), "`*em*` 产出 em 节点");
  ok(!parseInline("_em_").some((n) => n.type === "em"), "单 `_` 不识别为斜体（安卓只有 `__bold__`）");
  eq(plain(parseInline("a*b*c")), "abc", "词中单星号仍会被当斜体（安卓现状）");
}

// 删除线
{
  const d = parseInline("~~gone~~").find((n) => n.type === "del");
  ok(d !== undefined && d.text === "gone", "`~~gone~~` 产出 del 节点");
  ok(!parseInline("~single~").some((n) => n.type === "del"), "单个 `~` 不识别为删除线");
}

// 行内 code
{
  const c = parseInline("use `compileSdk` here").find((n) => n.type === "inlineCode");
  ok(c !== undefined && c.text === "compileSdk", "行内 code 文本正确（反引号剥掉）");
  ok(!parseInline("`abc").some((n) => n.type === "inlineCode"), "未闭合反引号不识别为行内 code");
}

// 围栏 —— chat 形态（cutCodeBlocks = false）
{
  const b = parseMarkdown("before\n```kotlin\nval x = 1\n```\nafter");
  ok(blockOf(b, "codeBlock") === undefined, "chat 场景（默认）不产出 codeBlock 块");
  const runs = [];
  for (const blk of b) if (blk.type === "paragraph") for (const l of blk.lines) for (const n of l.inline) if (n.type === "codeRun") runs.push(n);
  ok(runs.length === 1, "chat 场景围栏正文产出一个 codeRun（行内等宽）");
  eq(runs[0]?.text, "val x = 1", "codeRun 文本 = 围栏之间原文");
}

// 围栏 —— 卡片形态（cutCodeBlocks = true）
{
  const b = parseMarkdown("before\n```kotlin\nval x = 1\n```\nafter", { cutCodeBlocks: true });
  const cb = blockOf(b, "codeBlock");
  ok(cb !== undefined, "cutCodeBlocks=true 产出 codeBlock 块");
  eq(cb?.lang, "kotlin", "codeBlock 语言 = info string 第一个词");
  eq(cb?.raw, "val x = 1", "codeBlock 正文 = 围栏之间原文");
  const b2 = parseMarkdown("```\nplain\n```", { cutCodeBlocks: true });
  eq(blockOf(b2, "codeBlock")?.lang, null, "没有 info string 时 lang = null（UI 显示 code 兜底）");
}

// 未闭合围栏（chat）—— 安卓现状：内容丢失（规格 §9-D3）
{
  const b = parseMarkdown("```kotlin\nval x = 1");
  const all = JSON.stringify(b);
  ok(!all.includes("val x = 1"), "未闭合围栏：chat 场景内容丢失（照抄安卓现状，规格 §9-D3）");
}

// 硬换行：单 \n 即换行
{
  const b = parseMarkdown("a\nb\nc");
  const p = blockOf(b, "paragraph");
  ok(p !== undefined && p.type === "paragraph", "纯文本产出一个 paragraph 块");
  eq(p?.type === "paragraph" ? p.lines.length : 0, 3, "单 `\\n` 即硬换行（3 行 = 3 个 line）");
  eq(paraLines(b), ["a", "b", "c"], "每行独立成 line");
}

// =========================================================================
// §C 行内
// =========================================================================
log("");
log("§C 行内:");

// [text](url)
{
  const l = parseInline("click [here](https://example.com) please").find((n) => n.type === "link");
  ok(l !== undefined, "`[text](url)` 产出 link 节点");
  eq(l?.text, "here", "链接只显示 text（URL 不露出）");
  eq(l?.url, "https://example.com", "https 链接原样");
  eq(l?.bare, false, "`[text](url)` 不是裸 URL（bare = false）");
  eq(
    parseInline("[x](example.com)").find((n) => n.type === "link")?.url,
    "https://example.com",
    "非 http(s) 的链接 URL 补 https://",
  );
}

// 裸 URL
{
  const l = parseInline("官网是 gaga.sale 和 www.example.com 哦").filter((n) => n.type === "link");
  eq(l.length, 2, "裸域名 + www. 都识别为链接");
  eq(l.map((n) => n.url), ["https://gaga.sale", "https://www.example.com"], "裸 URL 归一化成 https://");
  ok(l.every((n) => n.bare === true), "裸 URL 标记 bare = true");
}

// 文件名黑名单
{
  const l = parseInline("配置文件是 config.yaml，看 README.md 就懂了，再改一下 index.js").filter(
    (n) => n.type === "link",
  );
  eq(l.length, 0, "文件名黑名单命中（config.yaml / README.md / index.js）⇒ 不产链接");
  eq(
    plain(parseInline("配置文件是 config.yaml，看 README.md 就懂了，再改一下 index.js")),
    "配置文件是 config.yaml，看 README.md 就懂了，再改一下 index.js",
    "文件名黑名单命中时原文一个字符都不丢",
  );
  eq(
    parseInline("打开 README.MD 还有 Index.JS 和 Settings.JSON 就行").filter((n) => n.type === "link").length,
    0,
    "黑名单大小写不敏感（README.MD / Index.JS / Settings.JSON）",
  );
  const l2 = parseInline("文档在 https://example.com/README.md 源码 https://github.com/a/b.py").filter(
    (n) => n.type === "link",
  );
  eq(
    l2.map((n) => n.url),
    ["https://example.com/README.md", "https://github.com/a/b.py"],
    "带 scheme 或带路径的 md / py 仍然是网址",
  );
  ok(isFilenameMatch("README.MD"), "isFilenameMatch 大写扩展名同样命中");
}

// 角标
{
  const cites = parseInline("see [#1] and [#2]").filter((n) => n.type === "cite");
  eq(cites.length, 2, "`[#N]` 产出 cite 节点");
  eq(cites.map((n) => n.number), [1, 2], "cite 序号解析正确");
  eq(cites[0]?.text, "[#1]", "cite 文本含方括号（安卓原样显示）");
  const asLink = parseInline("[#1](https://x.com)").find((n) => n.type === "link");
  ok(asLink !== undefined, "`[#1](url)` 优先当链接（安卓链接分支先于角标分支）");
}

// 行内图（PM 口径 #4）
{
  const b = parseMarkdown("see ![alt](https://x.com/a.png) here");
  ok(blockOf(b, "image") === undefined, "行内图不产出 image 块（安卓要求整行独占）");
  ok(
    !JSON.stringify(parseInline("![alt](https://x.com/a.png)")).includes('"image"'),
    "行内层没有 inline image 节点",
  );
  // ⚠️ 安卓源码的实际行为比「原样字面文本」更微妙：`renderInlineLine` 没有 image 分支，
  //    但**链接分支会先命中** `[alt](url)` ⇒ 渲染成 `!` + 一个文本为 "alt" 的链接
  //    （URL 不露出）。见规格 §9-D11。
  const inline = parseInline("see ![alt](https://x.com/a.png) here");
  const link = inline.find((n) => n.type === "link");
  ok(link !== undefined, "行内图的 `[alt](url)` 被安卓的链接分支接住（不是图片）");
  eq(link?.text, "alt", "行内图里的链接文本 = alt");
  eq(link?.url, "https://x.com/a.png", "行内图里的链接 URL 归一化");
  eq(plain(inline), "see !alt here", "行内图的实际可见文本 = `!` + 链接文本（安卓现状）");
}

// HTML 标签按纯文本
{
  const b = parseMarkdown('<script>alert("xss")</script>');
  eq(paraLines(b), ['<script>alert("xss")</script>'], "HTML 标签原样作为纯文本");
  const types = new Set();
  for (const blk of b) if (blk.type === "paragraph") for (const l of blk.lines) for (const n of l.inline) types.add(n.type);
  eq([...types], ["text"], "HTML 文本只产出 text 节点（无任何 HTML/原始节点 ⇒ 无 XSS 面）");
}

// emoji 短码不转换（PM 口径 #5）
{
  eq(paraLines(parseMarkdown("hello :smile: world")), ["hello :smile: world"], "emoji 短码原样显示（不转换）");
}

// =========================================================================
// §D 块级
// =========================================================================
log("");
log("§D 块级:");

// 块级图片（独占一行）
{
  const b = parseMarkdown("![图](https://cdn.example.com/a.png)");
  const img = blockOf(b, "image");
  ok(img !== undefined, "独占一行的图片产出 image 块");
  eq(img?.type === "image" ? img.url : "", "https://cdn.example.com/a.png", "图片 URL 归一化");
  eq(img?.type === "image" ? img.alt : "", "图", "图片 alt 解析");
  const b2 = parseMarkdown("![](https://cdn.example.com/a.png)");
  eq(blockOf(b2, "image")?.type === "image" ? blockOf(b2, "image").alt : "x", null, "空 alt = null");
  const b3 = parseMarkdown("![图](www.example.com/a.png)");
  eq(
    blockOf(b3, "image")?.type === "image" ? blockOf(b3, "image").url : "",
    "https://www.example.com/a.png",
    "www. 开头补 https://",
  );
  ok(blockOf(parseMarkdown("![图](data:image/png;base64,AAA)") , "image") === undefined, "data: base64 不切图片块");
  ok(blockOf(parseMarkdown("![图](/local/a.png)"), "image") === undefined, "相对路径不切图片块");
}

// 引用：每层 2 空格缩进
{
  const b = parseMarkdown("> 一层\n>> 两层");
  const q = blockOf(b, "blockquote");
  ok(q !== undefined, "引用产出 blockquote 块");
  eq(q?.type === "blockquote" ? q.lines.map((l) => l.level) : [], [1, 2], "引用层级 = `>` 个数");
  eq(
    q?.type === "blockquote" ? q.lines.map((l) => l.prefix) : [],
    ["  ", "    "],
    "引用每层 2 个空格缩进（安卓 `\"  \".repeat(level)`）",
  );
  const b2 = parseMarkdown(">>>foo");
  ok(blockOf(b2, "blockquote") === undefined, "`>>>foo`（`>` 后无空白）不是引用（安卓回退普通文本）");
  eq(paraLines(b2), [">>>foo"], "`>>>foo` 原样落普通文本");
}

// 列表前缀（PM 口径 #7）
{
  const ol = blockOf(parseMarkdown("1. one\n2. two"), "orderedList");
  ok(ol !== undefined, "有序列表产出 orderedList 块");
  eq(ol?.type === "orderedList" ? ol.items.map((i) => i.prefix) : [], ["  1. ", "  2. "], "有序列表文本前缀 = `  N. `");
  const ul = blockOf(parseMarkdown("- first\n- second"), "unorderedList");
  ok(ul !== undefined, "无序列表产出 unorderedList 块");
  eq(ul?.type === "unorderedList" ? ul.items.map((i) => i.prefix) : [], ["  • ", "  • "], "无序列表文本前缀 = `  • `");
  eq(
    ul?.type === "unorderedList" ? ul.items.map((i) => plain(i.inline)) : [],
    ["first", "second"],
    "列表项正文剥掉 `- ` 前缀",
  );
  eq(
    blockOf(parseMarkdown("* star"), "unorderedList")?.type === "unorderedList"
      ? blockOf(parseMarkdown("* star"), "unorderedList").items[0].prefix
      : "",
    "  • ",
    "`* ` 同样是无序列表",
  );
}

// 嵌套列表不产出层级（PM 口径 #2）
{
  const b = parseMarkdown("- a\n  - sub");
  const ul = blockOf(b, "unorderedList");
  ok(ul !== undefined, "第一行仍是无序列表项");
  eq(ul?.type === "unorderedList" ? ul.items.length : 0, 1, "缩进子项**不**是列表项（只有 1 个 item，无嵌套）");
  ok(blockOf(b, "orderedList") === undefined, "不产出有序列表块");
  eq(paraLines(b), ["  - sub"], "缩进子项落普通 paragraph（缩进 + 横杠都保留）");
  ok(
    !JSON.stringify(parseMarkdown("- a\n  - sub")).includes('"children"'),
    "AST 里没有 list item children / 层级字段",
  );
}

// task-list（PM 口径 #3：缩进也识别）
{
  const t = blockOf(parseMarkdown("- [x] done\n- [ ] todo"), "taskList");
  ok(t !== undefined, "task-list 产出 taskList 块");
  eq(t?.type === "taskList" ? t.items.map((i) => i.prefix) : [], ["[X] ", "[ ] "], "task-list 文本前缀 = `[X] ` / `[ ] `");
  eq(t?.type === "taskList" ? t.items.map((i) => i.checked) : [], [true, false], "task-list 勾选状态解析");
  eq(
    t?.type === "taskList" ? t.items.map((i) => i.style.strikethrough === true) : [],
    [true, false],
    "已勾选 task 整段带删除线标记，未勾选不带",
  );
  const t2 = blockOf(parseMarkdown("  - [ ] 缩进的"), "taskList");
  ok(t2 !== undefined, "缩进的 task-list 仍被识别（安卓的不对称：`[\\s]*` 允许前导空白）");
}

// 表格
{
  const b = parseMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
  const t = blockOf(b, "table");
  ok(t !== undefined, "表头 + 分隔行 ⇒ 产出 table 块");
  eq(t?.type === "table" ? t.header.map((c) => c.text) : [], ["a", "b"], "表头单元格");
  eq(t?.type === "table" ? t.rows.map((r) => r.map((c) => c.text)) : [], [["1", "2"]], "表体行");
  eq(t?.type === "table" ? t.alignments : [], ["left", "left"], "默认对齐 = left");
  eq(t?.type === "table" ? t.headerAlign : "", "center", "表头恒居中（与 `:---:` 无关）");
  const b2 = parseMarkdown("| a | b |\n|:--|--:|\n| 1 | 2 |");
  eq(blockOf(b2, "table")?.type === "table" ? blockOf(b2, "table").alignments : [], ["left", "right"], "对齐解析：`:--` 左 / `--:` 右");
  const b3 = parseMarkdown("| a | b |\n|:--:|:--:|\n| 1 | 2 |");
  eq(blockOf(b3, "table")?.type === "table" ? blockOf(b3, "table").alignments : [], ["center", "center"], "对齐解析：`:--:` 居中");
  // 列数对齐：多了截断、少了补空
  const b4 = parseMarkdown("| a | b |\n|---|---|\n| 1 | 2 | 3 |");
  eq(blockOf(b4, "table")?.type === "table" ? blockOf(b4, "table").rows[0].map((c) => c.text) : [], ["1", "2"], "多出的列被截断");
  const b5 = parseMarkdown("| a | b |\n|---|---|\n| 1 |");
  eq(blockOf(b5, "table")?.type === "table" ? blockOf(b5, "table").rows[0].map((c) => c.text) : [], ["1", ""], "少的列补空串");
  // 转义竖线
  eq(splitTableCells("| a \\| b | c |"), ["a \\| b", "c"], "转义竖线 `\\|` 保留两个字符、不当分隔符");
}

// 分隔线
{
  eq(parseMarkdown("---").map((b) => b.type), ["hr"], "`---` 产出 hr 块");
  eq(parseMarkdown("***").map((b) => b.type), ["hr"], "`***` 产出 hr 块");
  eq(parseMarkdown("___").map((b) => b.type), ["hr"], "`___` 产出 hr 块");
  ok(parseMarkdown("--").every((b) => b.type !== "hr"), "`--`（只有 2 个）不是分隔线");
  ok(parseMarkdown("-*-").every((b) => b.type !== "hr"), "`-*-` 不许混用，不是分隔线");
  const t = parseMarkdown("| a |\n|---|");
  ok(blockOf(t, "hr") === undefined, "表格分隔行不是 hr（首字符是 `|`）");
  eq(blockOf(t, "table") !== undefined, true, "表格分隔行仍被识别为表格");
}

// =========================================================================
// §E 流式 —— 半截表格
// =========================================================================
log("");
log("§E 流式（半截表格的升级判定）:");

{
  // 只有表头 ⇒ 不升级，还是普通文本
  const half = parseMarkdown("| a | b |");
  ok(blockOf(half, "table") === undefined, "半截表格（只有表头）不升级成 table 块");
  eq(paraLines(half), ["| a | b |"], "半截表格原样当普通文本（竖线保留）");

  // 表头 + 分隔行到齐 ⇒ 升级
  const full = parseMarkdown("| a | b |\n|---|---|");
  ok(blockOf(full, "table") !== undefined, "分隔行到齐 ⇒ 升级成 table 块");

  // 分隔行不在第二行 ⇒ 安卓是**逐行扫描**：表格从「分隔行的前一行」开始成型
  const third = parseMarkdown("| a | b |\n| 1 | 2 |\n|---|---|");
  const t3 = blockOf(third, "table");
  ok(t3 !== undefined, "分隔行在第三行时，表格从第 2 行开始成型（安卓逐行扫描）");
  eq(t3?.type === "table" ? t3.header.map((c) => c.text) : [], ["1", "2"], "该表的表头 = 分隔行的前一行");
  eq(paraLines(third), ["| a | b |"], "第一行留在普通文本里（不是表头）");

  // 升级判定三态
  eq(detectTableUpgrade(["| a | b |"]).state, "pending", "detectTableUpgrade：只有表头 = pending（分隔行还没到）");
  eq(
    detectTableUpgrade(["| a | b |", "|---|---|"]).state,
    "upgraded",
    "detectTableUpgrade：分隔行到齐 = upgraded",
  );
  eq(
    detectTableUpgrade(["| a | b |", "| 1 | 2 |"]).state,
    "pending",
    "detectTableUpgrade：末尾还是表格行 = pending（分隔行可能马上到）",
  );
  eq(detectTableUpgrade(["普通文本"]).state, "none", "detectTableUpgrade：不是表格 = none");
  eq(
    detectTableUpgrade(["| a | b |", "| 1 | 2 |", "|---|---|"]).state,
    "upgraded",
    "detectTableUpgrade：逐行扫描也能命中（表格从第 2 行起）",
  );
  const up = detectTableUpgrade(["| a | b |", "|---|---|", "| 1 | 2 |"]);
  eq(up.state, "upgraded", "detectTableUpgrade：含表体 = upgraded");
  eq(up.table?.rows.length, 1, "detectTableUpgrade 返回的表格含表体");
  eq(up.table?.header.map((c) => c.text), ["a", "b"], "detectTableUpgrade 返回的表头正确");
}

// =========================================================================
// §F 表格红线（AST 层面不得回退）
// =========================================================================
log("");
log("§F 表格红线（AST 层面）:");

{
  const t = blockOf(parseMarkdown("| a | b |\n|---|---|\n| 1 | 2 |"), "table");
  ok(t !== undefined, "表格块存在");
  ok(
    t?.type === "table" ? Array.isArray(t.alignments) : false,
    "AST 保留列对齐（对齐安卓 parseAlignments）",
  );
  ok(
    t?.type === "table" ? t.headerAlign === "center" : false,
    "AST 标记表头恒居中（安卓 resolveCellTextAlign）",
  );
  const json = JSON.stringify(t);
  ok(!/maxLines|clamp|fold|collapse|ellipsis/i.test(json), "AST 不带任何行数折叠 / 截断标记（安卓无折叠，契约 C1/C5）");
}

// =========================================================================
// §G 安卓单测移植（MarkdownParserTest.kt 的回归断言）
// =========================================================================
log("");
log("§G 安卓单测移植（yinian-android MarkdownParserTest.kt）:");

{
  // fix1: 代码块里的每个 URL 都可点 + 文本逐字不变（安卓 :295-323）
  const src = [
    "我直接给你可复制的图片直链：",
    "```",
    "https://cdn.example.com/1.png",
    "https://cdn.example.com/2.png",
    "https://cdn.example.com/3.png",
    "https://cdn.example.com/4.png",
    "```",
  ].join("\n");
  const b = parseMarkdown(src);
  const runs = [];
  for (const blk of b) if (blk.type === "paragraph") for (const l of blk.lines) for (const n of l.inline) if (n.type === "codeRun") runs.push(n);
  eq(runs.length, 1, "fix1：围栏正文产出 1 个 codeRun");
  eq(
    runs[0]?.urls.map((u) => u.url),
    [
      "https://cdn.example.com/1.png",
      "https://cdn.example.com/2.png",
      "https://cdn.example.com/3.png",
      "https://cdn.example.com/4.png",
    ],
    "fix1：代码块里的每个 URL 都可点（安卓 :296-307）",
  );
  eq(
    visible(b),
    "我直接给你可复制的图片直链：\n\nhttps://cdn.example.com/1.png\nhttps://cdn.example.com/2.png\nhttps://cdn.example.com/3.png\nhttps://cdn.example.com/4.png",
    "fix1：代码块文本逐字不变（围栏标记不显示 + 围栏开启行留一个空行）（安卓 :310-323）",
  );
}
{
  // fix1: 行内反引号包住的 URL 本来就可点 —— 保持现状不回归（安卓 :326-337）
  const inline = parseInline("下载地址 `https://cdn.example.com/a.png` 拿走");
  eq(plain(inline), "下载地址 `https://cdn.example.com/a.png` 拿走", "fix1：行内反引号 URL 的文本逐字不变（反引号保留）");
  eq(
    inline.filter((n) => n.type === "link").map((n) => n.url),
    ["https://cdn.example.com/a.png"],
    "fix1：行内反引号里的 URL 仍可点（安卓现状，见规格 §9-D8）",
  );
}
{
  // fix2: 中文标点分隔的多个 URL 各自独立可点（安卓 :342-350）
  const src = "给你几张：https://a.com/1.png，https://b.com/2.png，https://c.com/3.png";
  eq(
    parseInline(src).filter((n) => n.type === "link").map((n) => n.url),
    ["https://a.com/1.png", "https://b.com/2.png", "https://c.com/3.png"],
    "fix2：中文标点分隔的 URL 各自独立可点（安卓 :342-350）",
  );
  eq(plain(parseInline(src)), src, "fix2：中文标点场景文本逐字不变");
  eq(
    parseInline("看这里 https://a.com/x 还有 https://b.com/y；以及 https://c.com/z。都行！")
      .filter((n) => n.type === "link")
      .map((n) => n.url),
    ["https://a.com/x", "https://b.com/y", "https://c.com/z"],
    "fix2：分号句号感叹号问号同样切得开（安卓 :353-361）",
  );
  const raw = "https://wsrv.nl/?url=https%3A%2F%2Fcdn.example.com%2Fa.png&w=800&h=600&output=png";
  eq(
    parseInline("图在这 " + raw + " 谢谢").filter((n) => n.type === "link").map((n) => n.url),
    [raw],
    "fix2：百分号编码和 query 里的合法字符一个都不能被吃掉（安卓 :364-370）",
  );
}
{
  // fix3: 文件名黑名单（安卓 :374-403）
  const src = "配置文件是 config.yaml，看 README.md 就懂了，再改一下 index.js";
  eq(parseInline(src).filter((n) => n.type === "link").length, 0, "fix3：常见文件名不会被当成网址（安卓 :375-380）");
  eq(plain(parseInline(src)), src, "fix3：文件名场景文本逐字不变");
  eq(
    parseInline("打开 README.MD 还有 Index.JS 和 Settings.JSON 就行").filter((n) => n.type === "link").length,
    0,
    "fix3：黑名单大小写不敏感（安卓 :383-387）",
  );
  eq(
    parseInline("官网是 gaga.sale 和 www.example.com 哦").filter((n) => n.type === "link").map((n) => n.url),
    ["https://gaga.sale", "https://www.example.com"],
    "fix3：真正的裸域名仍然可点（安卓 :390-393）",
  );
}
{
  // 列表前缀 / 引用缩进 —— 安卓单测 :178-187
  eq(
    visible(parseMarkdown("- first\n- second")),
    "  • first\n  • second",
    "安卓单测 :178-181：无序列表行首补 `  • `",
  );
  eq(
    visible(parseMarkdown("1. one\n2. two")),
    "  1. one\n  2. two",
    "安卓单测 :184-187：有序列表行首补 `  N. `",
  );
  eq(
    visible(parseMarkdown("click [here](https://example.com) please")),
    "click here please",
    "安卓单测 :194-200：链接只显示 text",
  );
  eq(
    visible(parseMarkdown("see [#1] and [#2]")),
    "see [#1] and [#2]",
    "安卓单测 :207-215：角标原样显示",
  );
  eq(
    visible(parseMarkdown("- **important** thing")),
    "  • important thing",
    "安卓单测 :240-247：列表项里的加粗生效",
  );
  eq(
    visible(parseMarkdown("**never closes")),
    "**never closes",
    "安卓单测 :254-259：未闭合粗体当普通文本",
  );
}

// =========================================================================
// 结论文案 —— 严禁出现「渲染验证通过」这类误导措辞
// =========================================================================
log("");
if (fail > 0) {
  console.log(`❌ 解析层断言 ${fail} 条失败（共 ${total} 条）`);
  process.exit(1);
}
console.log(
  `✅ 解析层断言全部通过（${total}/${total}）—— 仅覆盖「语法解析层」（PC 自研 parser vs 安卓基准）`,
);
console.log(
  "   ⚠️ 渲染层（M2）尚未接线：视觉一致性、表格 clamp/横滑实测、HTML 输出**均未验证**。",
);
