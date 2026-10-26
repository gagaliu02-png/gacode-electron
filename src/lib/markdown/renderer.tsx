/**
 * lib/markdown/renderer.tsx — PC 端自研 Markdown **渲染层**（M2 / M2'）
 *
 * ## 定位
 *
 * 消费 M1 已交付的 AST（`./parser.ts`），渲染出**与安卓端一致**的 DOM。
 * 三端统一到安卓基准（gaga 2026-10-26 拍板「全都要自研，我们要全栈自研」）。
 *
 * 行为依据（唯一输入源）：`docs/md-android-behavior-spec.md`
 * —— 那里每条规格都带安卓 `file:line`，本文件的每段实现都对应其中的一条。
 *
 * ## DOM 结构（**两层模型**，与安卓同构）
 *
 * ```
 * .md-root                     ← 顶层块之间 8px（安卓 spacedBy(8.dp)）
 *  └─ .md-text                 ← 文本块（安卓 MdBlock.Text）
 *      └─ .md-para             ← 段落（空行切出；段落之间另有间距）
 *          ├─ .md-line         ← 连续的普通文本行（`\n` = 硬换行）
 *          ├─ h1/.md-heading-1 ← 标题行（**段落内部**，不吃 8px 块间距）
 *          ├─ .md-list         ← 连续的同类列表项归一组
 *          ├─ .md-quote        ← 连续的引用行
 *          └─ .md-extension    ← `:::` 扩展标记
 * ```
 *
 * ⇒ **块边界**（text ↔ table/image/hr/codeBlock）= `.md-root > * + *` 的 8px；
 * ⇒ **段落边界**（text 块内部的段落之间）= `.md-text > .md-para + .md-para`；
 * ⇒ **段内行之间** = 无额外间距（行距靠 line-height）。
 *
 * ## 硬约束
 *
 * 1. **零第三方依赖** —— 不引 react-markdown / remark-* / rehype-* / highlight.js /
 *    lucide-react（图标一律手写内联 SVG）。
 * 2. **不碰 DOM 之外的全局状态** —— 纯渲染；链接走 `<a target="_blank">`
 *    （Electron 主进程 `setWindowOpenHandler` → `shell.openExternal`）。
 * 3. **不重新解析** —— 只消费 AST；**不**调用 `parseInline`
 *    ⇒ 标题内容保持「不做行内解析」（安卓 D1）。
 * 4. **不造原生列表标签** —— 列表前缀是**文本**（安卓无 `<ul>/<ol>` marker）。
 *
 * ## 与安卓的 3 处「已知缺陷照抄」（PM 拍板：三端一致，后续想升级再一起升）
 *
 * - **D1** 标题内容不做行内解析（`# **粗**` 显示字面量 `**粗**`）
 *   —— 安卓 `MarkdownParser.kt:396/399/402`。
 * - **D2** 引用不加整行斜体 —— 安卓 parser 无 `pushStyle(em)`（`:385-392`）。
 *   ⇒ PC **不挂** `.md-bq`（那 3 色左边框 + 斜体是 PC/web 独有），缩进改用 AST 的
 *   `lines[].prefix`（每层 2 空格）。
 * - **D3** chat 场景未闭合围栏 ⇒ 代码内容整段丢失（安卓 `:327-349`）——
 *   解析层行为，本层照单全收。
 *
 * ## 用法（M3 接线）
 *
 * ```tsx
 * import { MdMarkdown } from "@/lib/markdown/renderer";
 *
 * // chat 气泡：围栏留在文本里 → 行内等宽（安卓 cutCodeBlocks = false）
 * <MdMarkdown text={content} size="chat" />
 * // 知识库详情：围栏切成卡片（语言徽章 + 复制按钮）
 * <MdMarkdown text={content} size="reading" cutCodeBlocks />
 * // 图片点击放大（可选）：传了 onImageClick 才可点
 * <MdMarkdown text={content} onImageClick={(url) => setLightboxUrl(url)} />
 * ```
 *
 * ⚠️ **本层不自带 lightbox** —— 只暴露 `onImageClick` 回调；
 *    弹窗本体在 `src/components/ui/ImageLightbox.tsx`（原生 `<dialog>`，
 *    形态对齐 web `Markdown.tsx:85-129`）。
 *
 * 断言脚本：`scripts/verify-md-render.mjs`（纯 node，只覆盖 **DOM 结构**；
 * **视觉一致性需真机人工确认**）。
 */

import * as React from "react";
import {
  parseMarkdown,
  type MdAlign,
  type MdBlock,
  type MdCodeBlock,
  type MdHeadingLine,
  type MdImageBlock,
  type MdInline,
  type MdLine,
  type MdListItem,
  type MdListKind,
  type MdQuoteLine,
  type MdTableBlock,
  type MdTextBlock,
  type MdTextLine,
  type MdUrlSpan,
} from "./parser";

// ============================================================================
// 类型
// ============================================================================

/**
 * 渲染场景 —— 决定正文字号。
 *
 * 安卓两个调用点的字号不同（`MarkdownRichText.kt:157-159` 的 KDoc）：
 * - `chat`：14sp，行高不设；
 * - `reading`（知识库 / 阅读）：16sp，行高 24sp。
 */
export type MdRenderSize = "chat" | "reading";

export interface MdRendererProps {
  /** M1 解析层产出的块级 AST。 */
  blocks: MdBlock[];
  /** 渲染场景（决定正文字号）。默认 `chat`。 */
  size?: MdRenderSize;
  /** 追加到根容器的 className（由调用方决定气泡底色等）。 */
  className?: string;
  /**
   * 图片点击回调（**图片点击放大**的入口）。
   *
   * - **不传（默认）** ⇒ 图片块**完全不可点**，DOM 与 M3/M4 批**一字节不差**
   *   （不挂 `.md-image-zoom-in`、不挂 `onClick`）。
   * - **传了** ⇒ 图片**加载成功后**点缩略图触发回调（url = AST 里的
   *   `MdImageBlock.url`，已由解析层 `normalizeImageUrl` 归一化过 ——
   *   本层**不再**做任何 URL 放行判断）。
   *
   * 对齐：web `Markdown.tsx:139-178` 的 `MarkdownImage` + 安卓
   * `MarkdownImageBlock.kt:50`（`onFullscreen: () -> Unit`）/ `:60`（`.clickable { onFullscreen() }`）。
   */
  onImageClick?: (url: string) => void;
}

export interface MdMarkdownProps {
  /** markdown 原文。 */
  text: string;
  /**
   * 是否把围栏代码块切成独立卡片 —— 对齐安卓 `cutCodeBlocks`。
   *
   * - `false`（默认，**chat 场景**）：围栏留在文本里，渲染成**行内等宽文本**
   *   （安卓 `MarkdownParser.kt:167-171`：这是历史决定，几十万条历史消息都这么画）。
   * - `true`（**知识库 / 阅读场景**）：切成卡片（语言徽章 + 复制按钮）。
   */
  cutCodeBlocks?: boolean;
  /** 渲染场景（决定正文字号）。默认 `chat`。 */
  size?: MdRenderSize;
  /** 追加到根容器的 className。 */
  className?: string;
  /**
   * 图片点击回调（图片点击放大入口）—— 透传给 `MdRenderer` → 图片块。
   *
   * ⚠️ **可选**：不传 ⇒ 图片块行为与 M3/M4 批**完全一致**（不可点）。
   */
  onImageClick?: (url: string) => void;
}

// ============================================================================
// 小工具
// ============================================================================

/**
 * 拼 className —— 本仓**没有** clsx / tailwind-merge / cva，
 * 冲突类名由 **CSS 产物顺序**决定（不是 className 属性顺序）。
 */
function joinClass(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p)).join(" ");
}

/** 标题标签 —— AST 只可能有 1/2/3 级（安卓只判 `# ` / `## ` / `### `）。 */
const HEADING_TAG: Record<1 | 2 | 3, "h1" | "h2" | "h3"> = { 1: "h1", 2: "h2", 3: "h3" };

/** 对齐 → CSS text-align。 */
const ALIGN_TO_CSS: Record<MdAlign, "left" | "center" | "right"> = {
  left: "left",
  center: "center",
  right: "right",
};

// ============================================================================
// 图标（无 lucide-react ⇒ 手写内联 SVG；同源于旧 `lib/markdown.tsx`）
// ============================================================================

const CopyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// ============================================================================
// 行内渲染 —— 对应安卓 `renderInlineLine`（`MarkdownParser.kt:536-674`）
// ============================================================================

/**
 * 围栏代码正文（chat 形态）—— URL **可点**但**不加 link 样式**。
 *
 * 安卓 `appendCodeRun`（`MarkdownParser.kt:481-500`）的三条克制：
 * ① **不加** link 样式（只加 "URL" 注解）；② **不改字符**（命中的原文整段原样
 * append，尾部标点照留）；③ **不动换行**（按 range 切片拼接）。
 * ⇒ 修剪只发生在**注解值**里（`MdUrlSpan.url` 已 trim + 归一化），
 *   屏幕上显示的仍是原文（含尾部标点）。
 */
function renderCodeRunText(text: string, urls: MdUrlSpan[]): React.ReactNode[] {
  if (!urls || urls.length === 0) return [text];
  const out: React.ReactNode[] = [];
  let cursor = 0;
  urls.forEach((span, i) => {
    if (span.start > cursor) out.push(text.slice(cursor, span.start));
    out.push(
      <a
        key={i}
        className="md-code-run-url"
        href={span.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {text.slice(span.start, span.end)}
      </a>,
    );
    cursor = Math.max(cursor, span.end);
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

/**
 * 行内节点 → React 节点。
 *
 * ⚠️ **不递归解析** —— AST 给什么就渲染什么（安卓 D1 / D9）。
 */
function renderInlineNodes(nodes: MdInline[]): React.ReactNode[] {
  const list = nodes || [];
  return list.map((node, i) => {
    switch (node.type) {
      case "text":
        return <React.Fragment key={i}>{node.text}</React.Fragment>;
      case "strong":
        // 安卓 `MdStyles.bold` = FontWeight.ExtraBold = 800（`MarkdownParser.kt:45`）
        return (
          <strong key={i} className="md-strong">
            {node.text}
          </strong>
        );
      case "em":
        // 安卓 `MdStyles.em` = Italic + Normal 字重（`MarkdownParser.kt:46`）
        return (
          <em key={i} className="md-em">
            {node.text}
          </em>
        );
      case "del":
        // 安卓 `MdStyles.del` = `#9ca3af` 实色 + LineThrough（`MarkdownParser.kt:87-91`）
        return (
          <del key={i} className="md-strike">
            {node.text}
          </del>
        );
      case "inlineCode":
        // 安卓 `MdStyles.code` = Monospace + 底 `#181818` + 字 `#e5e7eb`（`:66-70`）
        return (
          <code key={i} className="md-inline-code">
            {node.text}
          </code>
        );
      case "link":
        // 安卓：链接色 `#FF6B35` + Underline（`:71-82`）；裸 URL 同样加 link 样式（`:661-665`）
        return (
          <a
            key={i}
            className="md-link"
            href={node.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {node.text}
          </a>
        );
      case "cite":
        // 安卓 `MdStyles.cite` = Bold + `#FFD7B8`（`:61-65`）⇒ var(--brand-on-container)
        return (
          <span key={i} className="md-cite">
            {node.text}
          </span>
        );
      case "codeRun":
        return (
          <code key={i} className="md-code-run">
            {renderCodeRunText(node.text, node.urls)}
          </code>
        );
      default:
        return null;
    }
  });
}

// ============================================================================
// 段落渲染 —— 段落内部是**行级**（对齐安卓 `MdBlock.Text` 块内部）
// ============================================================================

/**
 * 标题行 —— 22 / 20 / 18px + **Bold(700)**（安卓 `MarkdownParser.kt:47-49`）。
 *
 * ⚠️ **D1**：标题内容**不做行内解析**（安卓 `:396/399/402` 是原样 append）。
 * 本层只渲染 AST 给的节点（正常情况下只有纯 text），**绝不**再调 `parseInline`。
 *
 * ⚠️ 标题是**段落内部的一行**，**不是**顶层块 ⇒ 不吃 8px 的块间距
 * （安卓：标题活在 `MdBlock.Text` 内部，块间距只发生在块与块之间）。
 */
function renderHeadingLine(line: MdHeadingLine, key: string): React.ReactElement {
  const Tag = HEADING_TAG[line.level];
  return (
    <Tag key={key} className={joinClass("md-heading", `md-heading-${line.level}`)}>
      {renderInlineNodes(line.inline)}
    </Tag>
  );
}

/**
 * 引用组 —— **不挂 `.md-bq`**（3 色左边框 + 1.5rem/层缩进是 PC/web 独有）。
 *
 * 安卓：每层 prepend **2 个空格**（`MarkdownParser.kt:388`）、**无边框、无色阶**、
 * **无整行斜体**（D2）。⇒ 缩进用 AST 的 `prefix` 文本，CSS 用 `pre-wrap` 保住空格。
 */
function renderQuoteGroup(lines: MdQuoteLine[], key: string): React.ReactElement {
  return (
    <div key={key} className="md-quote">
      {lines.map((line, i) => (
        <div key={i} className="md-quote-line">
          {line.prefix}
          {renderInlineNodes(line.inline)}
        </div>
      ))}
    </div>
  );
}

/**
 * 列表组 —— **不用原生 `<ul>/<ol>`**（安卓列表前缀是**文本**）。
 *
 * 安卓：无序 `"  • "`（`:416`）、有序 `"  N. "`（`:408`）、task `"[X] "/"[ ] "`（`:361`）
 * —— 都是文本前缀。列表项**正文走行内解析**（`:409`/`:417-421`）⇒ 由 AST 的 `item.inline` 承载。
 *
 * 归组规则：**连续的同类**列表项归一组（ordered / unordered / task 各自分组；
 * ordered↔unordered 切换 ⇒ 开新组）—— 渲染层按 `listKind` 切段。
 */
function renderListGroup(
  listKind: MdListKind,
  items: MdListItem[],
  key: string,
): React.ReactElement {
  if (listKind === "task") {
    return (
      <div key={key} className="md-list md-task-list">
        {items.map((item, i) => (
          <div key={i} className={joinClass("md-list-item", "md-task-item")}>
            <span className="md-task-prefix">{item.prefix}</span>
            <span
              className={joinClass(
                "md-task-body",
                item.style.strikethrough === true && "md-strike",
              )}
            >
              {renderInlineNodes(item.inline)}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div key={key} className="md-list">
      {items.map((item, i) => (
        <div key={i} className="md-list-item">
          <span className="md-list-prefix">{item.prefix}</span>
          {renderInlineNodes(item.inline)}
        </div>
      ))}
    </div>
  );
}

/**
 * 段落内部的**行** → React 节点。
 *
 * - **连续的普通文本行**合并成一个 `.md-line`（行间用 `\n` = 硬换行，
 *   安卓 `MarkdownParser.kt:440`）⇒ 段内行之间**没有额外间距**（行距靠 line-height）；
 * - **连续的同类列表项**合并成一个 `.md-list`（ordered / unordered / task 各自分组）；
 * - **连续的引用行**合并成一个 `.md-quote`；
 * - 标题 / `:::` 各自成元素。
 */
function renderParagraphLines(lines: MdLine[]): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const cur = lines[i];

    // ① 列表组 —— 连续的同类列表项
    if (cur.kind === "listItem") {
      const listKind = cur.listKind;
      const items: MdListItem[] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (l.kind !== "listItem" || l.listKind !== listKind) break;
        items.push(l.item);
        i++;
      }
      out.push(renderListGroup(listKind, items, `md-list-${i}`));
      continue;
    }

    // ② 引用组 —— 连续的引用行
    if (cur.kind === "quote") {
      const quotes: MdQuoteLine[] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (l.kind !== "quote") break;
        quotes.push(l);
        i++;
      }
      out.push(renderQuoteGroup(quotes, `md-quote-${i}`));
      continue;
    }

    // ③ 普通文本行 —— 连续多行合成一段（`\n` = 硬换行）
    if (cur.kind === "text") {
      const texts: MdTextLine[] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (l.kind !== "text") break;
        texts.push(l);
        i++;
      }
      out.push(
        <div key={`md-line-${i}`} className="md-line">
          {texts.map((t, k) => (
            <React.Fragment key={k}>
              {k > 0 ? "\n" : null}
              {renderInlineNodes(t.inline)}
            </React.Fragment>
          ))}
        </div>,
      );
      continue;
    }

    // ④ 标题行
    if (cur.kind === "heading") {
      out.push(renderHeadingLine(cur, `md-heading-${i}`));
      i++;
      continue;
    }

    // ⑤ `:::` 扩展标记（安卓 D6：正文丢失，只剩 marker）
    out.push(
      <div key={`md-extension-${i}`} className="md-extension">
        {cur.marker}
      </div>,
    );
    i++;
  }
  return out;
}

/**
 * 文本块 —— **顶层块之一**（安卓 `MdBlock.Text`）。
 *
 * ⚠️ 段落是**文本块内部**的单位 ⇒ 段落之间的间距由 `.md-text > .md-para + .md-para`
 * 表达（**不**走 `.md-root > * + *` 的 8px 块间距）。
 */
function renderTextBlock(block: MdTextBlock): React.ReactElement | null {
  const paragraphs = block.paragraphs || [];
  if (paragraphs.length === 0) return null;
  return (
    <div className="md-text">
      {paragraphs.map((p, i) => (
        <div key={i} className="md-para">
          {renderParagraphLines(p.lines)}
        </div>
      ))}
    </div>
  );
}

/**
 * 表格 —— 挂**现成** class（`.md-table-scroll` / `.md-table` / `.md-table-thead` /
 * `.md-table-th` / `.md-table-td`）。
 *
 * - **表头恒居中**（安卓 `MarkdownTableCard.kt:405-415`，与 markdown 对齐标记无关）
 *   ⇒ inline style（压得住 CSS 里 `.md-table-th { text-align: left }`）。
 * - **表体**按 `alignments[]`（安卓 `:411-414`）。
 * - ⚠️ **绝不挂 `.md-table-td-clamp`**（安卓无 6 行折叠，契约 C1/C5）。
 * - ⚠️ `.md-table` 的列宽 clamp(80/240px) + 横向滚动**一个字节都不改**（契约红线）。
 */
function renderTable(block: MdTableBlock): React.ReactElement {
  const aligns = block.alignments || [];
  return (
    <div className="md-table-scroll">
      <table className="md-table">
        <thead className="md-table-thead">
          <tr>
            {block.header.map((cell, i) => (
              <th key={i} className="md-table-th" style={{ textAlign: block.headerAlign }}>
                {renderInlineNodes(cell.inline)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td
                  key={c}
                  className="md-table-td"
                  style={{ textAlign: ALIGN_TO_CSS[aligns[c] ?? "left"] }}
                >
                  {renderInlineNodes(cell.inline)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * 代码块卡片（**知识库 / 阅读场景**，`cutCodeBlocks = true`）。
 *
 * 安卓 `MarkdownCodeBlock.kt`：
 * - 卡片圆角 12dp（`:66`）、满宽（`:67`）；
 * - 头部：语言徽章（11sp / Monospace / Medium / 底 primaryContainer）+ 复制按钮
 *   （图标 14dp + 文字「复制」，`:95-105`）；徽章无语言时显示 `code`（`:137`）；
 * - 头部下 1dp 分隔线（`:108-111`）；
 * - 正文 13sp / 行高 18sp / Monospace / 内边距 12dp（`:113-124`）。
 *
 * 复制成功反馈沿用 PC 既有做法（按钮文字切「已复制」+ Check 图标）。
 */
function MdCodeCard({ lang, raw }: { lang: string | null; raw: string }): React.ReactElement {
  const [copied, setCopied] = React.useState(false);

  const onCopy = React.useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(raw).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {
        setCopied(false);
      },
    );
  }, [raw]);

  return (
    <div className="md-code-card">
      <div className="md-code-card-head">
        <span className="md-code-lang">{lang && lang.trim() ? lang : "code"}</span>
        <button type="button" className="md-code-copy" onClick={onCopy} aria-label="复制代码">
          {copied ? <CheckIcon className="md-code-copy-icon" /> : <CopyIcon className="md-code-copy-icon" />}
          <span className="md-code-copy-text">{copied ? "已复制" : "复制"}</span>
        </button>
      </div>
      <div className="md-code-card-divider" />
      <pre className="md-code-body">
        <code>{raw}</code>
      </pre>
    </div>
  );
}

/**
 * 块级图片 —— 宽 ≤ 280px / 高 120–320px（**占位固定**）/ 圆角 12px。
 *
 * 安卓 `MarkdownImageBlock.kt:55-59`：`widthIn(max = 280.dp)` +
 * `heightIn(min = 120.dp, max = 320.dp)` + `RoundedCornerShape(12.dp)` +
 * 底色 `surface.copy(alpha = 0.35f)`；`ContentScale.Crop`（`:66`）。
 *
 * ### 图片点击放大（**可选**）
 *
 * - `onImageClick` **不传** ⇒ 图片**完全不可点**（DOM 与 M3/M4 批一字节不差）。
 * - `onImageClick` **传了** ⇒ 图片**加载成功后**点缩略图触发回调，
 *   并给 `<img>` 挂 `.md-image-zoom-in`（CSS 给 `cursor: zoom-in`）。
 * - **加载失败 ⇒ 不触发**（保持既有 fallback 行为：显示 alt）。
 *
 * 对齐：web `Markdown.tsx:139-178`（`onClick={() => setLightboxUrl(src)}`）
 * + 安卓 `MarkdownImageBlock.kt:50`（`onFullscreen: () -> Unit`）/ `:60`（`.clickable { onFullscreen() }`）。
 *
 * ⚠️ 本层**不引入新的 URL 放行逻辑** —— `url` 由解析层 `normalizeImageUrl`
 * （`parser.ts:758-766`：只放行 `http(s)://` / `www.`，拒 `data:`）归一化过了。
 */
function MdImage({
  url,
  alt,
  onImageClick,
}: {
  url: string;
  alt: string | null;
  onImageClick?: (url: string) => void;
}): React.ReactElement {
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setFailed(false);
  }, [url]);

  if (failed) {
    return (
      <span className="md-image md-image-failed">
        <span className="md-image-fallback">{alt ?? "图片加载失败"}</span>
      </span>
    );
  }

  const clickable = typeof onImageClick === "function";
  return (
    <span className="md-image">
      <img
        className={joinClass("md-image-img", clickable && "md-image-zoom-in")}
        src={url}
        alt={alt ?? ""}
        loading="lazy"
        onError={() => setFailed(true)}
        onClick={clickable ? () => onImageClick(url) : undefined}
      />
    </span>
  );
}

/**
 * 单个块 → React 节点。
 *
 * ⚠️ 顶层块**只有 5 种**（安卓 `MdBlock`）：`text` / `table` / `codeBlock` / `image` / `hr`
 * —— 标题 / 列表 / 引用 / `:::` 都**不是**顶层块（它们是 `text` 块内部的行）。
 *
 * @param onImageClick 图片点击回调（可选）—— 透传给图片块。
 */
function renderBlock(block: MdBlock, onImageClick?: (url: string) => void): React.ReactNode {
  switch (block.type) {
    case "text":
      return renderTextBlock(block);
    case "table":
      return renderTable(block);
    case "codeBlock":
      return <MdCodeCard lang={(block as MdCodeBlock).lang} raw={(block as MdCodeBlock).raw} />;
    case "image":
      return (
        <MdImage
          url={(block as MdImageBlock).url}
          alt={(block as MdImageBlock).alt}
          onImageClick={onImageClick}
        />
      );
    case "hr":
      // 安卓：满宽 1dp 分隔线 + **上下各 4dp padding**（`MarkdownRichText.kt:244-249`）
      // ⇒ 不用 PC 旧的 `.md-hr`（居中短线 35%），另起 `.md-hr-full`。
      return <hr className="md-hr-full" />;
    default:
      return null;
  }
}

// ============================================================================
// 公共组件
// ============================================================================

/**
 * AST → DOM（主入口）。
 *
 * 根容器 `.md-root` 的视觉参数（字号 / 块间距）由 CSS 决定，
 * 详见 `src/styles/globals.css` 末尾的「M2 · Markdown 自研渲染层」段。
 */
export function MdRenderer({
  blocks,
  size = "chat",
  className,
  onImageClick,
}: MdRendererProps): React.ReactElement {
  const list = blocks || [];
  return (
    <div className={joinClass("md-root", `md-root-${size}`, className)}>
      {list.map((block, i) => (
        <React.Fragment key={i}>{renderBlock(block, onImageClick)}</React.Fragment>
      ))}
    </div>
  );
}

/**
 * markdown 原文 → DOM（便捷入口：解析 + 渲染一步到位）。
 *
 * ⚠️ **流式**：对累积文本重跑本组件即可 —— 半截表格先返回 `text` 块（表格行当普通文本），
 * 分隔行到齐后同一次渲染返回 `table` 块（安卓的流式约束，见规格 §4.1）。
 */
export function MdMarkdown({
  text,
  cutCodeBlocks = false,
  size = "chat",
  className,
  onImageClick,
}: MdMarkdownProps): React.ReactElement {
  const blocks = React.useMemo(
    () => parseMarkdown(text ?? "", { cutCodeBlocks }),
    [text, cutCodeBlocks],
  );
  return (
    <MdRenderer
      blocks={blocks}
      size={size}
      className={className}
      onImageClick={onImageClick}
    />
  );
}

export default MdMarkdown;
