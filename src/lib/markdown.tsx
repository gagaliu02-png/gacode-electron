/**
 * lib/markdown.tsx — 阶段 2 迷你 Markdown 渲染器 (不引第三方)
 *
 * 阶段 0 deps 不含 react-markdown / remark-gfm, 指令严格"不引新依赖",
 * 但 MessageBubble 需要渲染 LLM 输出的 markdown。 这里自实现一个
 * 覆盖基础语法 (heading/list/code block/quote/link/emphasis) 的子集.
 *
 * 安全:
 *   - **不做任何 HTML 注入** — 不识别/渲染 <script>; 代码块内一切是字面字符
 *   - link 只对 http(s):// 协议放行, 其他 (e.g. javascript:) 直接丢弃
 *
 * 范围:
 *   ✅  `#` / `##` / `###` headings
 *   ✅ `**bold**` / `*italic*` / `` `inline code` ``
 *   ✅ ` ``` ` fenced code block
 *   ✅ `-` / `*` / `1.` 列表 (无嵌套, 单层)
 *   ✅ `> blockquote`
 *   ✅ `[text](https://...)` link
 *   ✅ 段落 + 软换行 (双空格 + \n)
 *   ❌ 表格 / 嵌套列表 / HTML / 图片 / task list — 阶段 N 再补
 */

import { type ReactNode } from "react";

interface InlineToken {
  kind: "text" | "code" | "bold" | "italic" | "link";
  text: string;
  href?: string;
}

/** Inline parse — 把 "**bold** 和 `code` 与 [text](url)" 转成 token 流 */
function parseInline(line: string): InlineToken[] {
  const out: InlineToken[] = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    // 三连代码跳过
    const triple = line.slice(i, i + 3);
    if (triple === "```") {
      // 在行内的 ``` (非 block) — 当作 lit
      out.push({ kind: "text", text: "```" });
      i += 3;
      continue;
    }

    // `code`
    if (line[i] === "`") {
      const end = line.indexOf("`", i + 1);
      if (end !== -1) {
        out.push({ kind: "code", text: line.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // **bold**
    if (line[i] === "*" && line[i + 1] === "*") {
      const end = line.indexOf("**", i + 2);
      if (end !== -1 && end !== i + 2) {
        out.push({ kind: "bold", text: line.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }

    // *italic*
    if (line[i] === "*" && line[i + 1] !== "*" && line[i - 1] !== "*") {
      // 找下一个 *
      let end = -1;
      for (let j = i + 1; j < n; j++) {
        if (line[j] === "*" && line[j - 1] !== "\\") {
          end = j;
          break;
        }
        if (line[j] === "*" && line[j + 1] === "*") break;
      }
      if (end !== -1 && end !== i + 1) {
        out.push({ kind: "italic", text: line.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // [text](url) — 仅放行 http(s):
    if (line[i] === "[") {
      const close = line.indexOf("]", i + 1);
      if (close !== -1 && line[close + 1] === "(") {
        const urlEnd = line.indexOf(")", close + 2);
        if (urlEnd !== -1) {
          const text = line.slice(i + 1, close);
          const href = line.slice(close + 2, urlEnd).trim();
          if (/^https?:\/\//i.test(href)) {
            out.push({ kind: "link", text, href });
            i = urlEnd + 1;
            continue;
          }
        }
      }
    }

    // 其他字面字符 — 累积到下一个特殊字符
    let nextSpecial = n;
    for (let j = i + 1; j < n; j++) {
      const c = line[j];
      if (c === "`" || c === "*" || c === "[" || c === "\\") {
        nextSpecial = j;
        break;
      }
    }
    out.push({ kind: "text", text: line.slice(i, nextSpecial) });
    i = nextSpecial;
  }
  return out;
}

function renderInline(tokens: InlineToken[]): ReactNode[] {
  return tokens.map((t, idx) => {
    switch (t.kind) {
      case "code":
        return (
          <code
            key={idx}
            className="px-1.5 py-0.5 rounded bg-bg-sunken text-brand text-[0.9em] font-mono break-words"
          >
            {t.text}
          </code>
        );
      case "bold":
        return (
          <strong key={idx} className="font-semibold text-fg">
            {t.text}
          </strong>
        );
      case "italic":
        return (
          <em key={idx} className="italic">
            {t.text}
          </em>
        );
      case "link":
        return (
          <a
            key={idx}
            href={t.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand hover:underline break-words"
          >
            {t.text}
          </a>
        );
      default:
        return <span key={idx}>{t.text}</span>;
    }
  });
}

// =========================================================================
// 段落级解析
// =========================================================================

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "codeblock"; lang: string; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string };

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // fenced code block
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      // skip 闭合 fence
      if (i < lines.length) i++;
      out.push({ kind: "codeblock", lang, text: buf.join("\n") });
      continue;
    }

    // heading
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      out.push({ kind: "heading", level: h[1].length as 1 | 2 | 3, text: h[2] });
      i++;
      continue;
    }

    // list (unordered / ordered)
    if (/^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      const ordered = /^\d+\.\s+/.test(line);
      const items: string[] = [];
      while (
        i < lines.length &&
        ((ordered && /^\d+\.\s+/.test(lines[i])) ||
          (!ordered && /^[-*]\s+/.test(lines[i])))
      ) {
        items.push(ordered ? lines[i].replace(/^\d+\.\s+/, "") : lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      out.push({ kind: "list", ordered, items });
      continue;
    }

    // quote
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push({ kind: "quote", text: buf.join("\n") });
      continue;
    }

    // blank line → skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // paragraph — 累积到下一个空行 / block 起始
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("```") && !/^#{1,3}\s+/.test(lines[i]) && !/^[-*]\s+/.test(lines[i]) && !/^\d+\.\s+/.test(lines[i]) && !/^>\s?/.test(lines[i])) {
      buf.push(lines[i]);
      i++;
    }
    out.push({ kind: "paragraph", text: buf.join("\n") });
  }
  return out;
}

// =========================================================================
// React 渲染
// =========================================================================

export function Markdown({ source }: { source: string }) {
  if (!source.trim()) return null;
  const blocks = parseBlocks(source);

  return (
    <div className="space-y-2 text-sm leading-relaxed break-words">
      {blocks.map((b, idx) => {
        switch (b.kind) {
          case "heading": {
            const cls =
              b.level === 1
                ? "text-lg font-semibold mt-3"
                : b.level === 2
                  ? "text-base font-semibold mt-2"
                  : "text-sm font-semibold mt-2";
            return (
              <div key={idx} className={cls}>
                {renderInline(parseInline(b.text))}
              </div>
            );
          }
          case "codeblock":
            return (
              <pre
                key={idx}
                className="rounded-md bg-bg-sunken border border-border px-3 py-2 overflow-x-auto font-mono text-xs leading-relaxed whitespace-pre-wrap break-words"
              >
                <code>{b.text || ""}</code>
              </pre>
            );
          case "list":
            return (
              <ul
                key={idx}
                className={b.ordered ? "list-decimal pl-6 space-y-1" : "list-disc pl-6 space-y-1"}
              >
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(parseInline(it))}</li>
                ))}
              </ul>
            );
          case "quote":
            return (
              <blockquote
                key={idx}
                className="border-l-2 border-border-strong pl-3 text-fg-muted italic whitespace-pre-wrap"
              >
                {renderInline(parseInline(b.text))}
              </blockquote>
            );
          case "paragraph":
          default:
            return (
              <p key={idx} className="whitespace-pre-wrap">
                {renderInline(parseInline(b.text))}
              </p>
            );
        }
      })}
    </div>
  );
}
