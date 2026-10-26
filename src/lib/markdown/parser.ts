/**
 * lib/markdown/parser.ts — PC 端自研 Markdown 语法解析层
 *
 * ## 定位
 *
 * 三端 markdown 渲染统一到**安卓基准**（gaga 2026-10-26 拍板「全都要自研，我们要全栈自研」）
 * ⇒ 本文件是 PC 端**不依赖任何第三方 markdown 库**的自研解析层。
 *
 * 行为依据（唯一输入源）：`docs/md-android-behavior-spec.md`
 * —— 那里每条规格都带安卓 `file:line`，本文件的每段实现都对应其中的一条。
 *
 * ## AST 形态 —— **两层模型**（与安卓同构）
 *
 * 安卓的块级**只有 5 种**（`MarkdownParser.kt:789-809` 的 `splitMarkdownBlocks`）：
 * `Text` / `Table` / `Image` / `HR` / `CodeBlock`。
 * 标题 / 列表 / 引用 / `:::` **不是块级** —— 它们是 `MdBlock.Text` **块内部**的行
 * （行级分派见 `MarkdownParser.kt:394-438` 的 `when`）。
 *
 * ```
 * MdBlock[]                 ← 顶层：text / table / image / hr / codeBlock
 *  └─ text                  ← MdTextBlock：一个或多个**段落**
 *      └─ paragraphs[]      ← MdParagraph：**连续的非空行**（空行 = 段落边界）
 *          └─ lines[]       ← MdLine：行级 kind（text / heading / listItem / quote / extension）
 * ```
 *
 * ⇒ **空行被吃掉**：空行只作段落边界，**本身不产生任何行、任何渲染**
 * （安卓 `splitParagraphs`，`MarkdownParser.kt:896-899`）。
 * ⇒ **块边界**（text ↔ table/image/hr/codeBlock）与**段落边界**（text 块内部的段落之间）
 * 是两件事 —— 间距由渲染层表达，解析层不管间距。
 *
 * ## 硬约束
 *
 * 1. **纯 TypeScript** —— 零 React / 零第三方依赖
 *    （不 import `react-markdown` / `remark-*` / `rehype-*` / `react`）。
 * 2. **纯函数** —— 输入 markdown 文本，输出结构化 AST；
 *    不碰 DOM / 不读环境变量 / 不抛异常。
 * 3. **不渲染 HTML** —— AST 里没有「原始 HTML」节点，HTML 标签按纯文本处理 ⇒ **天然无 XSS**。
 * 4. **逐条对齐安卓** —— 包括看起来「不优雅」的部分（见规格文档 §9 的 D1–D10）。
 *
 * ## 用法
 *
 * ```ts
 * import { parseMarkdown } from "@/lib/markdown/parser";
 *
 * // chat 场景：围栏留在文本里 → 行内等宽（安卓 cutCodeBlocks = false）
 * const blocks = parseMarkdown(text);
 * // 知识库/阅读场景：围栏切成卡片块（安卓 cutCodeBlocks = true）
 * const kbBlocks = parseMarkdown(text, { cutCodeBlocks: true });
 * ```
 *
 * 断言脚本：`scripts/verify-md-parser.mjs`（纯 node，零依赖）。
 */

/* eslint-disable no-useless-escape */

// ============================================================================
// 类型
// ============================================================================

/** 表格列对齐 —— 对齐安卓 `MdAlign`（`MarkdownParser.kt:104`）。 */
export type MdAlign = "left" | "center" | "right";

/** 整行 / 整段级样式标记（安卓等价）。 */
export interface MdStyleFlags {
  /** 整段加粗 —— 安卓 `MdStyles.bold` = `FontWeight.ExtraBold`（`MarkdownParser.kt:45`）。 */
  bold?: boolean;
  /** 整段斜体。 */
  italic?: boolean;
  /** 整段删除线 —— 安卓 `styles.del` / `styles.taskChecked`（`MarkdownParser.kt:87-98`）。 */
  strikethrough?: boolean;
}

/** 代码块正文里的 URL 区间（安卓 `appendCodeRun` 的 "URL" 字符串注解）。 */
export interface MdUrlSpan {
  /** 在 `codeRun.text` 里的起始下标（含）。 */
  start: number;
  /** 结束下标（不含）—— 覆盖**原文**（含尾部标点），与安卓一致。 */
  end: number;
  /** 可点击地址（已 trim + 归一化）。 */
  url: string;
}

/**
 * 行内节点。
 *
 * ⚠️ 安卓的 `renderInlineLine`（`MarkdownParser.kt:536-545`）只处理
 * bold / em / del / code / link / cite —— **没有 image 分支** ⇒ 本 union **没有 inline image**。
 */
export type MdInline =
  /** 普通文本。 */
  | { type: "text"; text: string }
  /** 粗体 —— `**x**` / `__x__`；`weight` 固定 800（ExtraBold）。 */
  | { type: "strong"; text: string; weight: 800 }
  /** 斜体 —— `*x*`（单 `_` 不认）。 */
  | { type: "em"; text: string }
  /** 删除线 —— `~~x~~`（实色 `#9ca3af`，无透明度）。 */
  | { type: "del"; text: string }
  /** 行内 code —— `` `x` ``（反引号被剥掉，内容原样）。 */
  | { type: "inlineCode"; text: string }
  /** 链接 —— `bare = false` 是 `[text](url)`，`bare = true` 是裸 URL 自动识别。 */
  | { type: "link"; url: string; text: string; bare: boolean }
  /** 引用角标 —— `[#1]`（文本含方括号）。 */
  | { type: "cite"; text: string; number: number }
  /** 围栏代码块正文（chat 形态：行内等宽）。 */
  | { type: "codeRun"; text: string; urls: MdUrlSpan[] };

// ---------------------------------------------------------------------------
// 行级（段落内部）
// ---------------------------------------------------------------------------

/**
 * 段落里的一行 —— **行级**节点。
 *
 * ⚠️ **行级 ≠ 块级** —— 安卓的**块级只有 5 种**（`Text` / `Table` / `Image` / `HR` /
 * `CodeBlock`，`MarkdownParser.kt:789-809`），而标题 / 列表 / 引用 / `:::` 全都活在
 * `MdBlock.Text` **块内部**（行级分派见 `MarkdownParser.kt:394-438` 的 `when`）。
 */
export type MdLine =
  /** 普通文本行（含表格退化行 `emEnabled = false`）。 */
  | MdTextLine
  /** 标题行（只有 1–3 级）。 */
  | MdHeadingLine
  /** 列表项行（ordered / unordered / task）。 */
  | MdListItemLine
  /** 引用行。 */
  | MdQuoteLine
  /** `:::` 扩展卡片标记行。 */
  | MdExtensionLine;

/** 普通文本行。 */
export interface MdTextLine {
  kind: "text";
  /** 行内节点。 */
  inline: MdInline[];
  /**
   * 该行是否禁用单星号斜体。
   * 表格退化行（`|` 开头但没被识别成表格）为 `false`（安卓 `emEnabled = false`）。
   */
  emEnabled: boolean;
}

/** 标题行 —— **只有 1–3 级**（安卓只判 `# ` / `## ` / `### `）。 */
export interface MdHeadingLine {
  kind: "heading";
  level: 1 | 2 | 3;
  /**
   * 标题内容 —— 安卓**原样 append，不走行内解析**（`MarkdownParser.kt:396/399/402`）
   * ⇒ 正常情况下只有一个 `text` 节点（**D1**）。
   */
  inline: MdInline[];
}

/** 列表类型 —— 决定列表项的**归组**（ordered / unordered / task 各自分组）。 */
export type MdListKind = "ordered" | "unordered" | "task";

/** 列表项行 —— **无 children / 无层级**（安卓不支持嵌套列表）。 */
export interface MdListItemLine {
  kind: "listItem";
  /** 列表类型（渲染层据此把**连续的同类**列表项归成一组）。 */
  listKind: MdListKind;
  /** 列表项本体。 */
  item: MdListItem;
}

/** 引用行。 */
export interface MdQuoteLine {
  kind: "quote";
  /** 层级 = 行首 `>` 的个数（`MarkdownParser.kt:386`）。 */
  level: number;
  /** 行首缩进前缀 = `"  ".repeat(level)`（`MarkdownParser.kt:388`）。 */
  prefix: string;
  /** 行内节点（引用体不再识别块级语法）。 */
  inline: MdInline[];
}

/** `:::` 扩展卡片标记行 —— 安卓输出 `\u0000<type>\u0000`（`MarkdownParser.kt:433-437`）。 */
export interface MdExtensionLine {
  kind: "extension";
  /** `:::` 之后整行的 trim 结果。 */
  marker: string;
}

/** 列表项 —— **无 children / 无层级**（安卓不支持嵌套列表）。 */
export interface MdListItem {
  /**
   * 行首文本前缀（安卓等价）：
   * - 无序 `"  • "`（`MarkdownParser.kt:416`）
   * - 有序 `"  N. "`（`MarkdownParser.kt:408`）
   * - task `"[X] "` / `"[ ] "`（`MarkdownParser.kt:361`，**无 2 空格缩进**）
   */
  prefix: string;
  /** 行内节点。 */
  inline: MdInline[];
  /** 整行级样式（已勾选 task = 删除线）。 */
  style: MdStyleFlags;
  /** 仅 task 列表项有值：勾选状态（`checked = true` ⇒ `style.strikethrough = true`）。 */
  checked?: boolean;
}

// ---------------------------------------------------------------------------
// 段落（文本块内部）
// ---------------------------------------------------------------------------

/**
 * 段落 —— **连续的非空行**。
 *
 * 段落由**空行**切出（安卓 `splitParagraphs`，`MarkdownParser.kt:896-899`）：
 * 空行本身**不产生任何行**（被吃掉），只是段落与段落之间的**边界标记**。
 */
export interface MdParagraph {
  /** 段落里的行（每行保留自己的行级 kind）。 */
  lines: MdLine[];
}

/**
 * 文本块 —— 顶层块之一（安卓 `MdBlock.Text`），承载 **1 个或多个段落**。
 *
 * ⚠️ 块级**只有 5 种**：`text` / `table` / `image` / `hr` / `codeBlock`
 * —— 标题 / 列表 / 引用 / `:::` **不是**顶层块（它们是段落内部的行）。
 */
export interface MdTextBlock {
  type: "text";
  /** 段落列表（空行切分）。 */
  paragraphs: MdParagraph[];
}

/** 表格单元格 —— `text` 是原文（安卓解析层不剥壳），`inline` 是渲染用的行内解析结果。 */
export interface MdTableCell {
  text: string;
  inline: MdInline[];
}

export interface MdTableBlock {
  type: "table";
  /** 表头单元格（= 表格第一行）。 */
  header: MdTableCell[];
  /** 表体行（每行按表头列数对齐：多了截断，少了补空串）。 */
  rows: MdTableCell[][];
  /** 表体列对齐（来自分隔行）。长度可能 ≠ 列数（安卓 `getOrNull` 兜底为 left）。 */
  alignments: MdAlign[];
  /** 表头**恒居中** —— 与 markdown 的 `:---:` 无关（安卓 `resolveCellTextAlign`）。 */
  headerAlign: "center";
}

/** 围栏代码块 —— 仅 `cutCodeBlocks = true` 时产出。 */
export interface MdCodeBlock {
  type: "codeBlock";
  /** info string 的第一个词；没有则 `null`（UI 显示 `code` 兜底）。 */
  lang: string | null;
  /** 围栏之间的原始正文。 */
  raw: string;
}

/** 块级图片 —— **只支持独占一行的图片**。 */
export interface MdImageBlock {
  type: "image";
  /** 绝对 http/https URL（`www.` 已补 `https://`）。 */
  url: string;
  /** alt 为空时是 `null`。 */
  alt: string | null;
}

/** 水平分隔线 —— `---` / `***` / `___`。 */
export interface MdHrBlock {
  type: "hr";
}

/** 块级节点 —— **只有 5 种**（对齐安卓 `MdBlock`，`MarkdownParser.kt:128-172`）。 */
export type MdBlock =
  | MdTextBlock
  | MdTableBlock
  | MdCodeBlock
  | MdImageBlock
  | MdHrBlock;

/** 解析参数。 */
export interface MdParseOptions {
  /**
   * 是否把围栏代码块切成独立卡片块 —— 对齐安卓 `cutCodeBlocks`（`MarkdownParser.kt:789`）。
   *
   * - `false`（默认，**chat 场景**）：围栏留在文本里，渲染成**行内等宽文本**
   *   （安卓 KDoc `MarkdownParser.kt:167-171`：这是历史决定，几十万条历史消息都这么画）。
   * - `true`（**知识库 / 阅读场景**）：切成 `codeBlock` 块（语言徽章 + 复制按钮）。
   */
  cutCodeBlocks?: boolean;
}

/** 流式「升级判定」三态（见规格文档 §4.1）。 */
export type MdTableUpgradeState = "none" | "pending" | "upgraded";

/** 流式「升级判定」结果。 */
export interface MdTableUpgrade {
  state: MdTableUpgradeState;
  /** `state === "upgraded"` 时有值。 */
  table?: MdTableBlock;
}

// ============================================================================
// 常量 —— 逐条抄安卓
// ============================================================================

/**
 * URL 的终止字符集（排除集）—— 安卓 `MarkdownParser.kt:215`。
 *
 * 刻意**不排** ASCII 的 `,` `;` `?` `&` `=` `%` `+`（query string 合法字符）。
 */
const URL_TERMINATORS = '\\s<>"，。、；：？！…—～·「」『』【】（）〔〕《》〈〉“”‘’';

/** 裸 URL 正则 —— 安卓 `MarkdownParser.kt:227-229`。 */
const URL_SOURCE =
  "\\b(?:https?://[^" +
  URL_TERMINATORS +
  "]+|www\\.[^" +
  URL_TERMINATORS +
  "]+|(?:[a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,}(?:/[^" +
  URL_TERMINATORS +
  "]*)?)";

/** 预编译（`g` 标志的 `lastIndex` 在每次使用前复位）。 */
const URL_RE = new RegExp(URL_SOURCE, "g");

/**
 * 文件 / 文档扩展名黑名单 —— 安卓 `MarkdownParser.kt:245-258`。
 *
 * 命中就当普通文本，不当网址（只对**裸域名**那一支生效，见 `isFilenameMatch`）。
 */
const FILE_EXT_BLACKLIST = new Set([
  // 文档 / 配置
  "md", "markdown", "txt", "text", "log", "csv", "tsv", "rst", "adoc",
  "json", "yaml", "yml", "toml", "ini", "conf", "cfg", "env", "properties", "xml",
  // 代码
  "js", "mjs", "cjs", "jsx", "ts", "tsx", "py", "rb", "go", "rs", "java", "kt", "kts",
  "c", "h", "cpp", "cc", "hpp", "cs", "swift", "m", "mm", "php", "pl", "lua", "dart",
  "vue", "svelte", "sh", "bash", "zsh", "ps1", "bat", "sql", "gradle", "cmake", "make",
  // 前端资源
  "html", "htm", "css", "scss", "sass", "less", "map",
  // 二进制 / 媒体 / 压缩包
  "apk", "aab", "ipa", "exe", "dll", "so", "dylib", "zip", "tar", "gz", "rar",
  "png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "pdf", "mp3", "mp4", "mov", "wav",
]);

/** 任务列表正则 —— 安卓 `MarkdownParser.kt:453`（**允许前导空白**）。 */
const TASK_LIST_REGEX = /^[\s]*[-*]\s\[([xX ])\]\s+(.+)/;

/** 嵌套引用块正则 —— 安卓 `MarkdownParser.kt:465`（`>` 后至少 1 个空白）。 */
const BQ_REGEX = /^(>+\s+)(.*)/;

/** 有序列表正则 —— 安卓 `MarkdownParser.kt:406`（锚定行首）。 */
const ORDERED_LIST_REGEX = /^(\d+)\.\s(.*)/;

/** 分隔行里单个格子的样子 —— 安卓 `MarkdownParser.kt:681`。 */
const SEPARATOR_CELL = /^:?-+:?$/;

/** 水平分隔线 —— 安卓 `MarkdownParser.kt:697`。 */
const HR_LINE_REGEX = /^[ ]{0,3}(-{3,}|\*{3,}|_{3,})[ ]*$/;

/** 独占一行的 `![alt](url)` —— 安卓 `MarkdownParser.kt:976`。 */
const IMAGE_LINE_REGEX = /^\s*!\[([^\]]*)\]\(([^()\s]+)\)\s*$/;

/** 围栏前缀 —— 安卓 `MarkdownParser.kt:332`（`line.trim().startsWith("```")`）。 */
const FENCE_PREFIX = "```";

// ============================================================================
// 小工具
// ============================================================================

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}

function countChar(s: string, ch: string): number {
  let n = 0;
  for (const c of s) if (c === ch) n++;
  return n;
}

/** 追加纯文本，并合并相邻的 text 节点（安卓是连续 append，合并后语义一致）。 */
function pushText(out: MdInline[], text: string): void {
  if (!text) return;
  const last = out[out.length - 1];
  if (last && last.type === "text") {
    last.text += text;
    return;
  }
  out.push({ type: "text", text });
}

/** 空文本块 —— 安卓 `MdBlock.Text("")`（`MarkdownParser.kt:791`）。 */
function emptyTextBlock(): MdTextBlock {
  return { type: "text", paragraphs: [] };
}

// ============================================================================
// URL 相关 —— 逐条抄安卓
// ============================================================================

/**
 * 修剪 URL 末尾的中英文标点 + 不平衡的右括号 —— 安卓 `MarkdownParser.kt:289-307`。
 */
export function trimUrlTrailing(s: string): string {
  let result = s;
  const trailing = ".,;:!?。，；：！?*~_`";
  while (result.length > 0 && trailing.includes(result[result.length - 1])) {
    result = result.slice(0, -1);
  }
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  while (result.length > 0) {
    const last = result[result.length - 1];
    const open = pairs[last];
    if (!open) break;
    if (countChar(result, last) > countChar(result, open)) result = result.slice(0, -1);
    else break;
  }
  return result;
}

/**
 * 这次匹配是不是「文件名」而不是网址 —— **只对裸域名那一支生效** —— 安卓 `MarkdownParser.kt:270-279`。
 *
 * 三个放行条件：带 `http(s)://` scheme / `www.` 开头 / 带 `/` 路径。
 */
export function isFilenameMatch(raw: string): boolean {
  if (!raw) return false;
  const lower = raw.toLowerCase();
  if (lower.startsWith("http://")) return false;
  if (lower.startsWith("https://")) return false;
  if (lower.startsWith("www.")) return false;
  if (raw.includes("/")) return false;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return false;
  return FILE_EXT_BLACKLIST.has(raw.slice(dot + 1).toLowerCase());
}

/**
 * 归一化成可点击的 URL —— 安卓 `MarkdownParser.kt:506-510`。
 * `www.` 开头和裸域名一律补 `https://`。
 */
export function normalizeClickUrl(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) return raw;
  return "https://" + raw;
}

/**
 * 在文本里找第一个符合条件的 URL —— 对应安卓 `MarkdownParser.kt:639-643` 的
 * `URL_REGEX.findAll(remaining).firstOrNull { ... }`。
 *
 * @param text      待扫描文本（= 原始行的剩余部分）
 * @param accept    绝对下标判定（相对 `text` 的下标 + 偏移量）
 */
function findFirstUrl(
  text: string,
  accept: (relativeIndex: number) => boolean,
): { value: string; index: number } | null {
  URL_RE.lastIndex = 0;
  let m = URL_RE.exec(text);
  while (m !== null) {
    if (m[0].length === 0) {
      URL_RE.lastIndex++;
    } else if (accept(m.index)) {
      return { value: m[0], index: m.index };
    }
    m = URL_RE.exec(text);
  }
  return null;
}

// ============================================================================
// 行内解析 —— 对应安卓 `renderInlineLine`（`MarkdownParser.kt:536-674`）
// ============================================================================

/**
 * 把**一行**的 markdown 解析成行内节点序列。
 *
 * 分支顺序严格对齐安卓（顺序本身就是行为）：
 * `~~del~~` → `**bold**` → `__bold__` → `*em*` → `` `code` `` → `[text](url)` → `[#N]` → 裸 URL → 普通字符。
 *
 * @param line      一行原文
 * @param emEnabled 单星号斜体是否生效（表格退化行为 `false`）
 */
export function parseInline(line: string, emEnabled = true): MdInline[] {
  const out: MdInline[] = [];
  let i = 0;
  while (i < line.length) {
    // ① `~~del~~` —— 安卓 :552-559
    if (i + 1 < line.length && line[i] === "~" && line[i + 1] === "~") {
      const end = line.indexOf("~~", i + 2);
      if (end > i + 2) {
        out.push({ type: "del", text: line.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    // ② `**bold**` —— 安卓 :561-568
    if (i + 1 < line.length && line[i] === "*" && line[i + 1] === "*") {
      const end = line.indexOf("**", i + 2);
      if (end > 0) {
        out.push({ type: "strong", text: line.slice(i + 2, end), weight: 800 });
        i = end + 2;
        continue;
      }
    }
    // ③ `__bold__` —— 安卓 :569-576
    if (i + 1 < line.length && line[i] === "_" && line[i + 1] === "_") {
      const end = line.indexOf("__", i + 2);
      if (end > 0) {
        out.push({ type: "strong", text: line.slice(i + 2, end), weight: 800 });
        i = end + 2;
        continue;
      }
    }
    // ④ `*em*` —— 安卓 :578-585（`_` 单个不认）
    if (
      emEnabled &&
      i + 1 < line.length &&
      line[i] === "*" &&
      line[i + 1] !== "*" &&
      (i === 0 || line[i - 1] !== "*")
    ) {
      const end = line.indexOf("*", i + 1);
      if (end > i + 1) {
        out.push({ type: "em", text: line.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    // ⑤ `` `code` `` —— 安卓 :587-594
    if (line[i] === "`") {
      const end = line.indexOf("`", i + 1);
      if (end > i + 1) {
        out.push({ type: "inlineCode", text: line.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    // ⑥ `[text](url)` —— 安卓 :597-619（`[#` 开头的让给角标分支）
    if (line[i] === "[" && (i === 0 || line[i - 1] !== "#")) {
      const closeBracket = line.indexOf("]", i + 1);
      if (closeBracket > 0 && closeBracket + 1 < line.length && line[closeBracket + 1] === "(") {
        const closeParen = line.indexOf(")", closeBracket + 2);
        if (closeParen > closeBracket) {
          out.push({
            type: "link",
            url: normalizeClickUrl(line.slice(closeBracket + 2, closeParen)),
            text: line.slice(i + 1, closeBracket),
            bare: false,
          });
          i = closeParen + 1;
          continue;
        }
      }
    }
    // ⑦ `[#N]` 引用角标 —— 安卓 :621-628
    if (i + 2 < line.length && line[i] === "[" && line[i + 1] === "#" && isDigit(line[i + 2])) {
      const end = line.indexOf("]", i);
      if (end > 0) {
        const digits = line.slice(i + 2, end);
        const num = /^\d+/.exec(digits);
        out.push({ type: "cite", text: line.slice(i, end + 1), number: num ? Number(num[0]) : 0 });
        i = end + 1;
        continue;
      }
    }
    // ⑧ 裸 URL 自动识别 —— 安卓 :629-670
    //    ⚠️ 扫描器在**每个位置**都会往前找 URL ⇒ 它会抢在反引号之前命中
    //    （安卓单测 `MarkdownParserTest.kt:326-337` 锁死了这个现状，见规格 §9-D8）。
    const remaining = line.slice(i);
    const urlMatch = findFirstUrl(remaining, (rel) => {
      const abs = i + rel;
      // 跳过紧跟在 `](` 后面的那个 URL（它属于 markdown 链接）—— 安卓 :641-642
      return !(abs >= 2 && line[abs - 1] === "(" && line[abs - 2] === "]");
    });
    if (urlMatch) {
      const urlStart = urlMatch.index;
      if (urlStart > 0) {
        pushText(out, remaining.slice(0, urlStart));
        i += urlStart;
      }
      const raw = trimUrlTrailing(urlMatch.value);
      if (raw.length > 0 && !isFilenameMatch(raw)) {
        out.push({ type: "link", url: normalizeClickUrl(raw), text: raw, bare: true });
        // 用 raw.length 推进 ⇒ 被 trim 掉的末尾标点走下一轮按普通字符 append（安卓 :666-667）
        i += raw.length;
        continue;
      }
      // 命中文件名黑名单 ⇒ 不推进 i，一个字符都不会被吞（安卓 :652-654）
    }
    pushText(out, line[i]);
    i++;
  }
  return out;
}

// ============================================================================
// 表格工具 —— 逐条抄安卓
// ============================================================================

/** 一行是不是「表格行」—— 首个非空白字符是 `|`（安卓 `MarkdownParser.kt:684`）。 */
export function isTableRowLine(line: string): boolean {
  return line.replace(/^[ \t]+/, "").startsWith("|");
}

/**
 * 按 `|` 切一行的单元格，去掉首尾空元素，逐个 trim —— 安卓 `MarkdownParser.kt:707-734`。
 * 转义竖线 `\|` 不当分隔符（原样留在格子里）。
 */
export function splitTableCells(line: string): string[] {
  const s = line.trim();
  const cells: string[] = [];
  let buf = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "\\" && i + 1 < s.length && s[i + 1] === "|") {
      buf += c + "|";
      i += 2;
    } else if (c === "|") {
      cells.push(buf.trim());
      buf = "";
      i++;
    } else {
      buf += c;
      i++;
    }
  }
  if (buf.length > 0) cells.push(buf.trim());
  if (cells.length > 0 && cells[0] === "") cells.shift();
  if (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
  return cells;
}

/** 分隔行判定 —— 每个非空格子都只能是 `-` / `:---` / `---:` / `:---:`（安卓 `:737-741`）。 */
export function isSeparatorRow(cells: string[]): boolean {
  if (cells.length === 0) return false;
  if (!cells.some((c) => c !== "")) return false;
  return cells.every((c) => c === "" || SEPARATOR_CELL.test(c));
}

/** 从分隔行解析对齐方式 —— 前冒号 = 左，后冒号 = 右，两个都有 = 居中（安卓 `:744-753`）。 */
export function parseAlignments(cells: string[]): MdAlign[] {
  return cells.map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":") && cell.length > 1;
    if (left && right) return "center";
    if (right) return "right";
    return "left";
  });
}

/** 行格子数对齐表头：多了截断，少了补空串（安卓 `:756-757`）。 */
function alignRow(cells: string[], columns: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < columns; i++) out.push(cells[i] ?? "");
  return out;
}

function toCell(text: string): MdTableCell {
  return { text, inline: parseInline(text, true) };
}

function buildTableBlock(
  headerCells: string[],
  bodyLines: string[],
  separatorCells: string[],
): MdTableBlock {
  return {
    type: "table",
    header: headerCells.map(toCell),
    rows: bodyLines.map((l) => alignRow(splitTableCells(l), headerCells.length).map(toCell)),
    alignments: parseAlignments(separatorCells),
    headerAlign: "center",
  };
}

/** 表格扫描结果。 */
interface MdTableScan {
  /** 表格起始行下标。 */
  start: number;
  /** 表头单元格。 */
  columns: string[];
  /** 表体行（原文）。 */
  body: string[];
  /** 分隔行切出来的格子（用于解析对齐）。 */
  separatorCells: string[];
}

/**
 * 从第 `i` 行开始扫一张表 —— 对应安卓 `splitBlocksCore` 的升级判定
 * （`MarkdownParser.kt:1051-1055`）：**第 i 行是表格行 + 第 i+1 行是分隔行**。
 *
 * ⚠️ 判定是**逐行**做的 ⇒ 表格可以从文本的任意一行开始（不要求分隔行是整个文本的第二行）。
 */
function scanTableAt(lines: string[], i: number): MdTableScan | null {
  if (i + 1 >= lines.length) return null;
  if (!isTableRowLine(lines[i]) || !isTableRowLine(lines[i + 1])) return null;
  const separatorCells = splitTableCells(lines[i + 1]);
  if (!isSeparatorRow(separatorCells)) return null;
  const columns = splitTableCells(lines[i]);
  const body: string[] = [];
  let j = i + 2;
  while (j < lines.length && isTableRowLine(lines[j])) {
    body.push(lines[j]);
    j++;
  }
  return { start: i, columns, body, separatorCells };
}

/**
 * 流式「升级判定」入口 —— 对应安卓 `splitBlocksCore` 的表格升级条件
 * （`MarkdownParser.kt:1051-1055`）。
 *
 * - `"upgraded"`：当前文本里**已经**成型出一张表（与 `parseMarkdown` 的结果一致）。
 * - `"pending"`：还没有表，但**末尾是表格行** ⇒ 分隔行可能马上到（流式「即将升级」信号）。
 * - `"none"`：没有表，且末尾不是表格行（当前文本无表格）。
 *
 * ⚠️ 安卓的升级规则是「**任意一行**是表格行 + **它的下一行**是分隔行」，
 * 并不是「分隔行必须是整个文本的第二行」—— 见 `splitBlocksCore` 的逐行扫描。
 *
 * 调用方（流式渲染）对**累积文本**重跑 `parseMarkdown` 即可自动升级；
 * 本函数用于「要不要重解析 / 现在能不能升级」的显式判定。
 */
export function detectTableUpgrade(lines: string[]): MdTableUpgrade {
  for (let i = 0; i < lines.length; i++) {
    const scanned = scanTableAt(lines, i);
    if (scanned) {
      return {
        state: "upgraded",
        table: buildTableBlock(scanned.columns, scanned.body, scanned.separatorCells),
      };
    }
  }
  const last = lines[lines.length - 1];
  if (last !== undefined && isTableRowLine(last)) return { state: "pending" };
  return { state: "none" };
}

// ============================================================================
// 其它块级工具 —— 逐条抄安卓
// ============================================================================

/** 水平分隔线判定 —— 安卓 `MarkdownParser.kt:697-699`。 */
export function isHorizontalRule(line: string): boolean {
  return HR_LINE_REGEX.test(line) && !isTableRowLine(line);
}

/** 围栏开头的语言标记 —— ```kotlin → "kotlin"，``` → null（安卓 `:882-886`）。 */
export function parseFenceLang(line: string): string | null {
  const info = line.trim().replace(/^```/, "").trim();
  if (!info) return null;
  const first = info.split(/\s+/)[0];
  return first && first.length > 0 ? first : null;
}

/**
 * 图片 URL 归一化，不合格返回 `null`（= 不切块）—— 安卓 `MarkdownParser.kt:982-994`。
 * 只放行绝对 http/https；`www.` 开头补 https://。
 */
export function normalizeImageUrl(raw: string): string | null {
  const u = raw.trim();
  if (!u) return null;
  if (u.toLowerCase().startsWith("data:")) return null;
  if (u.toLowerCase().startsWith("https://")) return u;
  if (u.toLowerCase().startsWith("http://")) return u;
  if (u.toLowerCase().startsWith("www.")) return "https://" + u;
  return null;
}

/**
 * 按**空行**把一段文本切成段落 —— 安卓 `MarkdownParser.kt:896-899` 的**逐字镜像**。
 * 段内的换行保留（列表项的续行不能被拆开）。
 *
 * ⚠️ 这是安卓 UI 层（阅读场景 `MarkdownTextSection`）的入口，**含 trim**。
 * PC 解析层**内部**的段落切分（`unitsToParagraphs`）**不做 trim** ——
 * trim 会把 `  - sub` 变成 `- sub`，安卓「普通列表缩进不识别 / task-list 缩进识别」的
 * 不对称（规格 §3.2 / §3.3）就破了。
 */
export function splitParagraphs(text: string): string[] {
  return text
    .split(/(?:\r?\n){2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * 代码块正文里的 URL 区间 —— 对应安卓 `appendCodeRun`（`MarkdownParser.kt:481-500`）。
 * 只加「可点」注解，**不加 link 样式**；字符一个都不动。
 */
function collectCodeUrls(text: string): MdUrlSpan[] {
  const spans: MdUrlSpan[] = [];
  URL_RE.lastIndex = 0;
  let m = URL_RE.exec(text);
  while (m !== null) {
    const raw = m[0];
    if (raw.length === 0) {
      URL_RE.lastIndex++;
      m = URL_RE.exec(text);
      continue;
    }
    // 命中文件名黑名单 ⇒ 不当网址（安卓 :486-487）
    if (!isFilenameMatch(raw)) {
      const clickable = trimUrlTrailing(raw);
      if (clickable.length > 0) {
        spans.push({
          start: m.index,
          end: m.index + raw.length,
          url: normalizeClickUrl(clickable),
        });
      }
    }
    m = URL_RE.exec(text);
  }
  return spans;
}

// ============================================================================
// 行级分派 —— 对应安卓 `toAnnotatedString` 的每行分派（`MarkdownParser.kt:330-441`）
// ============================================================================

/**
 * 一行的分派 —— 顺序严格对齐安卓：
 * 任务列表（`?.let` 早退）→ 引用（`?.let` 早退）→ 标题 → 有序列表 → 无序列表 → 表格行 → `:::` → else。
 *
 * ⚠️ 产出的是**行级**节点（`MdLine`），**不是**块级节点 ——
 * 安卓的块级只有 5 种（`MarkdownParser.kt:789-809`），标题 / 列表 / 引用 / `:::`
 * 全都活在 `MdBlock.Text` 块内部（行级分派见 `MarkdownParser.kt:394-438`）。
 */
function classifyLine(line: string): MdLine {
  // ① 任务列表 —— 必须先于有序/无序列表（安卓 :351-356）
  const task = TASK_LIST_REGEX.exec(line);
  if (task) {
    const marker = task[1];
    const body = task[2];
    const checked = marker.toLowerCase() === "x";
    const item: MdListItem = {
      prefix: checked ? "[X] " : "[ ] ",
      inline: parseInline(body, true),
      style: checked ? { strikethrough: true } : {},
      checked,
    };
    return { kind: "listItem", listKind: "task", item };
  }

  // ② 引用 —— `>` 后至少 1 个空白，每层 2 空格缩进（安卓 :385-392）
  const bq = BQ_REGEX.exec(line);
  if (bq) {
    const level = countChar(bq[1], ">");
    return {
      kind: "quote",
      level,
      prefix: "  ".repeat(level),
      inline: parseInline(bq[2], true),
    };
  }

  // ③ 标题 —— **只有 H1/H2/H3**；内容**原样**（不走行内解析）（安卓 :394-403）
  if (line.startsWith("### ")) {
    return { kind: "heading", level: 3, inline: [{ type: "text", text: line.slice(4) }] };
  }
  if (line.startsWith("## ")) {
    return { kind: "heading", level: 2, inline: [{ type: "text", text: line.slice(3) }] };
  }
  if (line.startsWith("# ")) {
    return { kind: "heading", level: 1, inline: [{ type: "text", text: line.slice(2) }] };
  }

  // ④ 有序列表 —— 锚定行首，前缀 `"  N. "`（安卓 :405-413）
  const ordered = ORDERED_LIST_REGEX.exec(line);
  if (ordered) {
    return {
      kind: "listItem",
      listKind: "ordered",
      item: { prefix: "  " + ordered[1] + ". ", inline: parseInline(ordered[2], true), style: {} },
    };
  }

  // ⑤ 无序列表 —— `startsWith("- ")` / `startsWith("* ")`，前缀 `"  • "`（安卓 :415-422）
  if (line.startsWith("- ") || line.startsWith("* ")) {
    return {
      kind: "listItem",
      listKind: "unordered",
      item: { prefix: "  • ", inline: parseInline(line.slice(2), true), style: {} },
    };
  }

  // ⑥ 表格行退化路径 —— `emEnabled = false`（安卓 :429-431）
  if (line.startsWith("|")) {
    return { kind: "text", inline: parseInline(line, false), emEnabled: false };
  }

  // ⑦ `:::` 扩展卡片标记（安卓 :433-437）
  if (line.startsWith(":::")) {
    return { kind: "extension", marker: line.slice(3).trim() };
  }

  // ⑧ else（安卓 :438）
  return { kind: "text", inline: parseInline(line, true), emEnabled: true };
}

/**
 * 一个文本单元 —— 段落切分的最小单位。
 *
 * - `blank`：**空行** = 段落边界（安卓 `splitParagraphs` 的切点），**本身不产生任何行**；
 * - `line`：一行内容（行级 kind 由 `classifyLine` 判定）。
 */
type MdTextUnit = { kind: "blank" } | { kind: "line"; line: MdLine };

/** 空行判定 —— **只有真空行**才算段落边界（安卓按 `\n{2,}` 切，`MarkdownParser.kt:897`）。 */
function isBlankLine(line: string): boolean {
  return line === "" || line === "\r";
}

/**
 * 行单元 → 段落序列（**空行切段**）。
 *
 * - 空行 = 段落边界：**吃掉空行本身**，只留边界（安卓 `splitParagraphs` 的 trim + 过滤空段）；
 * - 连续空行 = 一个边界（`a\n\n\nb` ⇒ 2 段）；
 * - ⚠️ **不做 trim**：段内行**原样保留**（含前导空白）——
 *   trim 会把 `  - sub` 变成 `- sub` ⇒ 普通列表的「缩进不识别」这条（安卓的不对称，
 *   规格 §3.2 / §3.3）就破了 ⇒ 缩进子项必须保持普通文本行。
 */
function unitsToParagraphs(units: MdTextUnit[]): MdParagraph[] {
  const paragraphs: MdParagraph[] = [];
  let current: MdLine[] = [];
  for (const u of units) {
    if (u.kind === "blank") {
      if (current.length > 0) {
        paragraphs.push({ lines: current });
        current = [];
      }
      continue;
    }
    current.push(u.line);
  }
  if (current.length > 0) paragraphs.push({ lines: current });
  return paragraphs;
}

/**
 * 一个文本段 → 文本块（安卓 `MdBlock.Text`）。
 *
 * ⚠️ 围栏处理：chat 形态（`cutCodeBlocks = false`）下围栏**留在文本里**，
 * 渲染成行内等宽（安卓 `MarkdownParser.kt:332-349` + `appendCodeRun` `:481-500`）。
 * 未闭合围栏的缓冲区**永远不会被 flush** ⇒ 内容丢失（安卓现状，见规格 §9-D3）。
 *
 * 空行在**行单元层**就被标成 `blank`（段落边界）⇒ 不会被当成内容行，
 * 也不会把围栏内容里的空行误当段落边界（围栏内容进的是 `codeBuf`，不参与切段）。
 */
function parseTextLines(text: string): MdTextBlock {
  const lines = text.split("\n");
  const units: MdTextUnit[] = [];
  let inCode = false;
  let codeBuf: string[] = [];

  for (const line of lines) {
    if (line.trim().startsWith(FENCE_PREFIX)) {
      if (!inCode) {
        // 围栏开启行：安卓在 :342 补了一个 "\n" ⇒ 这里落一个空行（**不是**段落边界）
        units.push({ kind: "line", line: { kind: "text", inline: [], emEnabled: true } });
        inCode = true;
        codeBuf = [];
      } else {
        const raw = codeBuf.join("\n");
        units.push({
          kind: "line",
          line: {
            kind: "text",
            inline: [{ type: "codeRun", text: raw, urls: collectCodeUrls(raw) }],
            emEnabled: true,
          },
        });
        inCode = false;
        codeBuf = [];
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(line);
      continue;
    }
    // 空行 = 段落边界（本身不产生任何行）
    if (isBlankLine(line)) {
      units.push({ kind: "blank" });
      continue;
    }
    units.push({ kind: "line", line: classifyLine(line) });
  }
  // 未闭合围栏：缓冲区不 flush（安卓同款行为，规格 §9-D3）
  return { type: "text", paragraphs: unitsToParagraphs(units) };
}

// ============================================================================
// 块级切分 —— 对应安卓 `splitMarkdownBlocks` / `splitBlocksCore` / `splitBlocksWithImages`
// ============================================================================

/** 一行是不是「独占一行的图片」—— 安卓 `MarkdownParser.kt:956-963`。 */
function parseImageLine(line: string): MdImageBlock | null {
  const m = IMAGE_LINE_REGEX.exec(line);
  if (!m) return null;
  // 整行必须被吃完 —— 有前后杂字符说明是行内图片，不切（安卓 :959）
  if (m.index !== 0 || m.index + m[0].length !== line.length) return null;
  const alt = m[1].trim();
  const url = normalizeImageUrl(m[2]);
  if (!url) return null;
  return { type: "image", url, alt: alt.length > 0 ? alt : null };
}

/**
 * 表格切分 —— 安卓 `splitBlocksCore`（`MarkdownParser.kt:1010-1083`）。
 *
 * **流式约束**：分隔行还没到的半截表格只能是文本 ⇒ 表格「先以文本形式出现，
 * 分隔行到齐了再变成表格」（安卓 `:1004-1005`）。
 */
function splitBlocksCore(src: string): MdBlock[] {
  if (src.length === 0) return [emptyTextBlock()];

  const lines = src.split("\n");
  // 快路径：全文没有竖线 + 没有 HR ⇒ 一整块文本（安卓 :1016-1018）
  if (!src.includes("|") && !lines.some(isHorizontalRule)) {
    return [parseTextLines(src)];
  }

  const blocks: MdBlock[] = [];
  const pending: string[] = [];
  const flushText = (): void => {
    if (pending.length === 0) return;
    blocks.push(parseTextLines(pending.join("\n")));
    pending.length = 0;
  };

  let inFence = false;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith(FENCE_PREFIX)) {
      inFence = !inFence;
      pending.push(line);
      i++;
      continue;
    }
    // 水平分隔线 —— 必须在表格识别之前（安卓 :1040-1049）
    if (!inFence && isHorizontalRule(line)) {
      flushText();
      blocks.push({ type: "hr" });
      i++;
      continue;
    }
    // 表头 + 分隔行都在，才认定这是一张表（安卓 :1051-1055）
    const scanned = inFence ? null : scanTableAt(lines, i);
    if (scanned) {
      flushText();
      blocks.push(buildTableBlock(scanned.columns, scanned.body, scanned.separatorCells));
      i = scanned.start + 2 + scanned.body.length;
      continue;
    }
    pending.push(line);
    i++;
  }
  flushText();
  return blocks.length > 0 ? blocks : [emptyTextBlock()];
}

/** 按行切图片块 —— 安卓 `splitBlocksWithImages`（`MarkdownParser.kt:908-941`）。 */
function splitBlocksWithImages(src: string): MdBlock[] {
  const lines = src.split("\n");
  const blocks: MdBlock[] = [];
  const pending: string[] = [];
  const flushText = (): void => {
    // 文本段去掉首尾空行（图片块本身已有间距）—— 安卓 :913-918
    while (pending.length > 0 && pending[0].trim() === "") pending.shift();
    while (pending.length > 0 && pending[pending.length - 1].trim() === "") pending.pop();
    if (pending.length === 0) return;
    blocks.push(...splitBlocksCore(pending.join("\n")));
    pending.length = 0;
  };

  let inFence = false;
  for (const line of lines) {
    if (line.trim().startsWith(FENCE_PREFIX)) {
      inFence = !inFence;
      pending.push(line);
      continue;
    }
    if (!inFence) {
      const image = parseImageLine(line);
      if (image) {
        flushText();
        blocks.push(image);
        continue;
      }
    }
    pending.push(line);
  }
  flushText();
  return blocks.length > 0 ? blocks : [emptyTextBlock()];
}

/** 围栏切段 —— 安卓 `splitFencedSegments`（`MarkdownParser.kt:834-875`）。 */
type MdFencedSegment =
  | { type: "text"; text: string }
  | { type: "codeBlock"; lang: string | null; raw: string };

function splitFencedSegments(src: string): MdFencedSegment[] {
  const lines = src.split("\n");
  const out: MdFencedSegment[] = [];
  const pending: string[] = [];
  const flushText = (): void => {
    while (pending.length > 0 && pending[0].trim() === "") pending.shift();
    while (pending.length > 0 && pending[pending.length - 1].trim() === "") pending.pop();
    if (pending.length === 0) return;
    out.push({ type: "text", text: pending.join("\n") });
    pending.length = 0;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim().startsWith(FENCE_PREFIX)) {
      pending.push(line);
      i++;
      continue;
    }
    const lang = parseFenceLang(line);
    const buf: string[] = [];
    let j = i + 1;
    let closed = false;
    while (j < lines.length) {
      if (lines[j].trim().startsWith(FENCE_PREFIX)) {
        closed = true;
        break;
      }
      buf.push(lines[j]);
      j++;
    }
    flushText();
    // 没闭合 → 剩下的内容整体算一个代码块（安卓 :828-833）
    out.push({ type: "codeBlock", lang, raw: buf.join("\n") });
    i = closed ? j + 1 : j;
  }
  flushText();
  return out;
}

/** 顶层切分 —— 安卓 `splitMarkdownBlocks`（`MarkdownParser.kt:789-809`）。 */
function splitMarkdownBlocks(src: string, cutCodeBlocks: boolean): MdBlock[] {
  if (!cutCodeBlocks) {
    if (src.length === 0) return [emptyTextBlock()];
    // 快路径：没有 `![` 就不可能是图片（安卓 :792-793）
    if (!src.includes("![")) return splitBlocksCore(src);
    const blocks = splitBlocksWithImages(src);
    // 零回归保证：没切出任何 Image ⇒ 整体回退（安卓 :794-795）
    return blocks.some((b) => b.type === "image") ? blocks : splitBlocksCore(src);
  }
  const out: MdBlock[] = [];
  for (const seg of splitFencedSegments(src)) {
    if (seg.type === "codeBlock") {
      out.push(seg);
    } else if (seg.text.trim() !== "") {
      out.push(...splitMarkdownBlocks(seg.text, false));
    }
  }
  return out.length > 0 ? out : [emptyTextBlock()];
}

// ============================================================================
// 公共入口
// ============================================================================

/**
 * 解析 markdown 文本 → 块级 AST（**两层模型**：块 → 段落 → 行）。
 *
 * @param src     markdown 原文
 * @param options `cutCodeBlocks` —— 见 {@link MdParseOptions}
 *
 * **流式用法**：对累积文本重跑本函数即可 —— 半截表格会先返回 `text` 块（表格行当普通文本），
 * 分隔行到齐后同一次调用返回 `table` 块（安卓 `splitBlocksCore` 的流式约束）。
 */
export function parseMarkdown(src: string, options: MdParseOptions = {}): MdBlock[] {
  return splitMarkdownBlocks(src, options.cutCodeBlocks === true);
}
