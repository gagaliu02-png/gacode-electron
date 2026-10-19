/**
 * components/chat/QuoteReplyBlock.tsx — chat-id-40 引用 / 回复 块
 *
 * 引用 (quote / message reply): user / assistant 气泡顶部一个紧凑引用块,
 * 显示被引用消息的内容前 80 字 + 「回复」视觉. 跟 web MessageBubble.tsx 中
 * 对应分支对齐 (server 端 metadata.quoted_message_id / quoted_content).
 *
 * 父组件拿到 quotedContent 非空时挂. 流式中暂不挂 (server 端这条 metadata 是
 * 落库后才有, 流式临时消息没有).
 */

import { useMemo } from "react";

export interface QuoteReplyBlockProps {
  content: string;
  /** 引用来源 (被引用消息的作者) — "user" | "assistant" */
  from?: "user" | "assistant" | null;
  /** 服务端给的 quoted_message_id (可选, 仅展示 tooltip, 当前不跳) */
  messageId?: string | null;
}

const PREVIEW_MAX = 80;

export function QuoteReplyBlock({
  content,
  from = "user",
  messageId,
}: QuoteReplyBlockProps) {
  const preview = useMemo(() => {
    const text = (content || "").replace(/\s+/g, " ").trim();
    if (text.length <= PREVIEW_MAX) return text;
    return text.slice(0, PREVIEW_MAX) + "…";
  }, [content]);

  if (!preview) return null;

  const fromLabel = from === "assistant" ? "AI" : "你";

  return (
    <div
      className="mb-1.5 rounded-md border border-border-strong border-l-4 border-l-brand bg-bg-sunken/60 px-3 py-1.5 text-xs text-fg-muted max-w-full"
      data-testid="quote-reply-block"
      title={messageId ? `引用消息 ${messageId}` : undefined}
    >
      <div className="flex items-start gap-1.5">
        <span aria-hidden="true" className="text-brand mt-0.5 shrink-0">
          ❝
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wide text-fg-subtle mb-0.5">
            回复 {fromLabel}
          </p>
          <p className="text-fg break-words whitespace-pre-wrap leading-relaxed">
            {preview}
          </p>
        </div>
      </div>
    </div>
  );
}