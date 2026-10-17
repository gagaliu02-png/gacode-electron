/**
 * lib/markdown.tsx — 阶段 1 升级: 自实现 → 共用 gacode-web 渲染管线
 *
 * 背景:
 *   阶段 0 约束"不引新依赖", 自实现了一个 mini 解析器 (h1-3 / paragraph / ul / ol /
 *   blockquote / link / strong / em / code / codeblock), 完全不支持表格 / 图片 / 嵌套
 *   列表 / task list. LLM 输出表格时 electron 端只能看到原样竖线.
 *
 * 阶段 1 (gaga 拍板): 弃用自实现, 引入 react-markdown + remark-gfm + remark-emoji +
 * rehype-sanitize, 跟 gacode-web 共用同一套组件 (逻辑 1:1 移植, 见
 * gacode-web/src/components/Markdown.tsx). Tailwind token 两边一致 (--bg-sunken /
 * --fg-muted / --border-default 等), CSS 类 .md-table-* 在 globals.css 同步定义.
 *
 * 组件 API: { children: string; className?: string } — 跟 gacode-web 对齐, MessageBubble
 * 切到 <Markdown>{content}</Markdown>.
 *
 * 安全:
 *   - rehype-sanitize (defaultSchema) + 自定义 allowlist — 防御 LLM 输出 <script> /
 *     <img onerror=...>. default schema 已经禁 on* 事件属性 + script/iframe 等危险标签.
 *   - link 仍是 target=_blank + rel=noopener noreferrer.
 *
 * 阶段 2/3 (shiki 高亮 / mermaid / 暗色适配) 不在本 PR 范围.
 */

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkEmoji from "remark-emoji";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

// electron 阶段 0 严格不引新依赖 → 不装 lucide-react, 用内联 SVG.
// 图标跟 web/lucide-react 的 Copy / Check 同源 (12x12 viewBox, 1.5 stroke).
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

// =========================================================================
// helpers
// =========================================================================

// Extract language from code block: ```ts\ncode\n``` => 'ts'
function detectLang(className?: string): string | null {
  if (!className) return null;
  const m = /language-([\w-]+)/.exec(className);
  return m ? m[1] : null;
}

const CodeBlock: React.FC<{
  className?: string;
  raw: string;
}> = ({ className, raw }) => {
  const lang = detectLang(className);
  const [copied, setCopied] = React.useState(false);

  const onCopy = React.useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(raw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [raw]);

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border bg-bg-sunken">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-bg-elevated">
        <span className="text-[10px] uppercase tracking-wide text-fg-muted">
          {lang ?? "code"}
        </span>
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy code"
          className="inline-flex items-center gap-1 text-[10px] text-fg-muted hover:text-fg transition-colors"
        >
          {copied ? <CheckIcon className="h-3 w-3" /> : <CopyIcon className="h-3 w-3" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs font-mono leading-relaxed text-fg">
        <code className={className}>{raw}</code>
      </pre>
    </div>
  );
};

// rehype-sanitize schema — 以 defaultSchema 为底, 补:
//   - code / span 允许 className (remark-gfm 给 table cell 注入 language-xxx)
//   - input 允许 type / checked / disabled (GFM task list checkbox)
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-./, /^(hljs|token|shiki).*/],
    ],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      ["className", /^(hljs|token|shiki).*/],
    ],
    input: [
      ...(defaultSchema.attributes?.input ?? []),
      ["type", "checkbox"],
      "checked",
      "disabled",
    ],
  },
};

const components: Components = {
  code({ className, children, ...props }) {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="rounded px-1 py-0.5 text-xs font-mono bg-muted text-fg"
          {...props}
        >
          {children}
        </code>
      );
    }
    const raw = String(children ?? "").replace(/\n$/, "");
    return <CodeBlock className={className} raw={raw} />;
  },
  pre({ children }) {
    return <>{children}</>;
  },
  a({ href, children, ...props }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand underline-offset-2 hover:underline"
        {...props}
      >
        {children}
      </a>
    );
  },
  h1({ children }) {
    return (
      <h1 className="text-xl font-semibold mt-3 mb-2 text-fg">{children}</h1>
    );
  },
  h2({ children }) {
    return (
      <h2 className="text-lg font-semibold mt-3 mb-2 text-fg">{children}</h2>
    );
  },
  h3({ children }) {
    return (
      <h3 className="text-base font-semibold mt-2 mb-1 text-fg">{children}</h3>
    );
  },
  h4({ children }) {
    return (
      <h4 className="text-sm font-semibold mt-2 mb-1 text-fg">{children}</h4>
    );
  },
  h5({ children }) {
    return (
      <h5 className="text-sm font-medium mt-2 mb-1 text-fg">{children}</h5>
    );
  },
  h6({ children }) {
    return (
      <h6 className="text-xs font-medium mt-2 mb-1 text-fg-muted uppercase tracking-wide">
        {children}
      </h6>
    );
  },
  p({ children }) {
    return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
  },
  ul({ children }) {
    return (
      <ul className="list-disc pl-5 my-2 space-y-1 marker:text-fg-muted">
        {children}
      </ul>
    );
  },
  ol({ children }) {
    return (
      <ol className="list-decimal pl-5 my-2 space-y-1 marker:text-fg-muted">
        {children}
      </ol>
    );
  },
  li({ children }) {
    return <li className="leading-relaxed">{children}</li>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-4 border-brand pl-3 my-2 text-fg-muted italic">
        {children}
      </blockquote>
    );
  },
  // 表格 — 跟 web 同款横滚容器. CSS 见 globals.css `.md-table-scroll` / `.md-table`.
  table({ children }) {
    return (
      <div className="md-table-scroll">
        <table className="md-table" style={{ width: "max-content" }}>
          {children}
        </table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="md-table-thead">{children}</thead>;
  },
  th({ children, style }) {
    return (
      <th className="md-table-th" style={style}>
        {children}
      </th>
    );
  },
  td({ children, style }) {
    return (
      <td className="md-table-td" style={style}>
        {children}
      </td>
    );
  },
  hr() {
    return <hr className="my-3 border-border" />;
  },
  strong({ children }) {
    return <strong className="font-semibold text-fg">{children}</strong>;
  },
  em({ children }) {
    return <em className="italic text-fg">{children}</em>;
  },
  del({ children }) {
    return <del className="text-fg-muted line-through">{children}</del>;
  },
  input(props) {
    const { type, checked, disabled } = props as React.InputHTMLAttributes<HTMLInputElement>;
    if (type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={!!checked}
          disabled={disabled}
          readOnly
          className="mr-1 align-middle accent-brand"
        />
      );
    }
    return <input {...props} />;
  },
};

interface MarkdownProps {
  children: string;
  className?: string;
}

export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div
      className={[
        "text-sm leading-relaxed text-fg break-words",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkEmoji]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
