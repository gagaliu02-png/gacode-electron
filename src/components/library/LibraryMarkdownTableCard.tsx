/**
 * components/library/LibraryMarkdownTableCard.tsx — 知识库 markdown 渲染卡
 * (gacode-electron 0.7.5 P2 library-id-9)
 *
 * LibraryDetail 当 LibraryItem.type === "text" 且 content 是 markdown 时,
 * 不再用裸 <pre> 把整个内容塞出来 — 走跟 ChatDetail / ChatListMarkdown
 * 同一套"表格 / 代码块 / 列表"分段渲染路径, 但简化版:
 *
 *   - 用 react-markdown + remark-gfm 解析 (跟 lib/markdown.tsx 同款)
 *   - 表格 → 卡片样式 (边框 + 第一行 header)
 *   - 代码块 → 等宽字体 + 浅色背景 (跟 markdown.tsx 的 md-code 对齐)
 *   - 列表 → 普通 ul / ol
 *   - 链接 → 外链 (Electron 走系统默认浏览器 — <a target="_blank">)
 *
 * 设计依据:
 *   - text 类 LibraryItem.content 通常是用户复制的文章 / 笔记 / 网页摘录,
 *     markdown 比例高. 跟 web LibraryDetail + Android LibraryDetail
 *     `MarkdownTableCard` 行为对齐.
 *   - 不重做 full markdown renderer — 只覆盖最常见的 markdown 子集
 *     (段落 / 列表 / 链接 / 表格 / 代码块 / 标题).
 *   - P1-A worker 在 ChatDetail 那边会建 src/components/ui/MarkdownTableCard.tsx,
 *     本组件是 library 专属变体, 不与之冲突 (路径不同 + 用途不同).
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

export interface LibraryMarkdownTableCardProps {
  /** markdown 原文 */
  content: string;
  className?: string;
}

export function LibraryMarkdownTableCard({
  content,
  className,
}: LibraryMarkdownTableCardProps) {
  if (!content) {
    return (
      <div className="rounded-md bg-bg-elevated p-4 text-sm text-fg-muted text-center">
        无内容
      </div>
    );
  }
  return (
    <div
      className={[
        "rounded-md bg-bg-elevated p-4 text-sm leading-relaxed",
        "lk-markdown",
        className ?? "",
      ].join(" ")}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          table({ children }) {
            return (
              <div className="md-table-scroll my-3">
                <table className="md-table">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return <th className="md-table-th">{children}</th>;
          },
          td({ children }) {
            return (
              <td className="md-table-td">
                <div className="md-table-td-inner">{children}</div>
              </td>
            );
          },
          code({ className: cls, children, ...props }) {
            const isBlock = cls && /language-/.test(cls);
            if (isBlock) {
              return (
                <code className={cls} {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-bg-sunken px-1 py-0.5 font-mono text-[0.9em]"
                {...props}
              >
                {children}
              </code>
            );
          },
          a({ children, href }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}