/**
 * components/library/LibraryMarkdownTableCard.tsx — 知识库 markdown 渲染卡
 * (gacode-electron 0.7.5 P2 library-id-9)
 *
 * LibraryDetail 当 LibraryItem.type === "text" 且 content 是 markdown 时,
 * 不再用裸 <pre> 把整个内容塞出来 — 走跟 ChatDetail 同一套自研 markdown 管线,
 * 但用 **阅读场景** 参数:
 *
 *   - `size="reading"`     → 正文字号 16px / 行高 24px（安卓 MarkdownRichText.kt:157-159）
 *   - `cutCodeBlocks`      → 围栏代码块切成卡片（语言徽章 + 复制按钮），
 *                            而不是 chat 场景的行内等宽
 *
 * ## M3 批次（2026-10-26）：归并到自研管线
 *
 * 旧版这里是**第二套**第三方 markdown 实例（remark / rehype 插件链，
 * components 只覆盖 table / th / td / code / a 五个）。
 * 现在底层换成 `lib/markdown.tsx` → `lib/markdown/renderer.tsx`（自研管线），
 * ⇒ 全仓只剩**一套** markdown 实现（表格 / 代码块 / 列表 / 引用 / 标题全都有）。
 *
 * 设计依据:
 *   - text 类 LibraryItem.content 通常是用户复制的文章 / 笔记 / 网页摘录,
 *     markdown 比例高. 跟 web LibraryDetail + Android LibraryDetail
 *     `MarkdownTableCard` 行为对齐.
 */

import { Markdown } from "../../lib/markdown";

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
      {/* 阅读场景：16px / 24px，围栏切成代码块卡片 */}
      <Markdown size="reading" cutCodeBlocks>
        {content}
      </Markdown>
    </div>
  );
}