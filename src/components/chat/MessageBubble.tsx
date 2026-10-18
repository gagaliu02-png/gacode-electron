/**
 * components/chat/MessageBubble.tsx — 阶段 2 单条消息气泡
 *
 * 角色:
 *   - user      → 右对齐, brand 容器色, 圆角, 文字 / 图片 / 文件 chip
 *   - assistant → 左对齐, sunken 容器色, 圆角, Markdown 渲染, 工具事件
 *
 * 跟 web MessageBubble.tsx M2/M3 同源风格 (props + 状态机), 但代码全部自写.
 * 不复用 gacode-web 其它内部组件 (utils.ts / shadcn), 用本地 mini-markdown.
 *
 * 流式态: assistant 在 isStreaming=true 时, 末尾显示 "▍" pulse 光标,
 *         不抖动附加 reflow (text 累积在父组件).
 */

import type { ReactNode } from "react";
import { Markdown } from "../../lib/markdown";
import { RichEventBubble, type RichEvent } from "./RichEventBubble";

export interface MessageBubbleProps {
  /** "user" | "assistant" */
  role: "user" | "assistant";
  content: string;
  /** 工具事件累积 (assistant 才有) */
  richEvents?: RichEvent[];
  /** user message 已附图 URL (server metadata.image_urls) */
  imageUrls?: string[];
  /** user message 已附文件 id (server metadata.attached_file_ids) */
  attachedFileIds?: string[];
  /** 配对的真实文件名 (server metadata.attached_files) */
  attachedFileNames?: Array<{ fileId: string; name: string }>;
  /** 流式中: 显示末尾 pulse 光标 */
  isStreaming?: boolean;
  /** 时间戳 — 用于侧边 hover 显示 (optional) */
  createdAt?: string;
}

// ────────────────────────────────────────────────────────────
// User bubble
// ────────────────────────────────────────────────────────────
function UserBubble({
  content,
  imageUrls,
  attachedFileIds,
  attachedFileNames,
}: Pick<MessageBubbleProps, "content" | "imageUrls" | "attachedFileIds" | "attachedFileNames">) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%]">
        {/* 图片 (image mode 上传产物) */}
        {imageUrls && imageUrls.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mb-1.5 justify-end">
            {imageUrls.map((url, i) => (
              <img
                key={`${url}-${i}`}
                src={url}
                alt=""
                className="max-w-[200px] max-h-[200px] rounded-md object-contain bg-bg-sunken"
                loading="lazy"
              />
            ))}
          </div>
        ) : null}

        {/* 附件 chip (document mode 上传产物) */}
        {attachedFileIds && attachedFileIds.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mb-1.5 justify-end">
            {attachedFileIds.map((id, i) => {
              const fallback = `附件 ${i + 1}`;
              const name =
                attachedFileNames?.find((n) => n.fileId === id)?.name || fallback;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-bg-elevated text-xs text-fg-muted"
                  title={name}
                >
                  <FileGlyph />
                  <span className="truncate max-w-[180px]">{name}</span>
                </span>
              );
            })}
          </div>
        ) : null}

        {/* 文字气泡 */}
        {content ? (
          <div className="rounded-md bg-brand-container text-brand-on-container px-3.5 py-2 text-sm whitespace-pre-wrap break-words leading-relaxed">
            {content}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Assistant bubble
// ────────────────────────────────────────────────────────────
function AssistantBubble({
  content,
  richEvents,
  isStreaming,
}: Pick<MessageBubbleProps, "content" | "richEvents" | "isStreaming">) {
  const showCursor = !!isStreaming;
  const hasRichEvents = !!richEvents && richEvents.length > 0;
  const hasContent = !!content && content.trim().length > 0;

  // 空 + 没事件 → 完全不渲染 (流式刚开始那一两帧)
  if (!hasContent && !hasRichEvents) return null;

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] space-y-1">
        {/* 工具 / 富事件 — 在正文之前 (server 累积顺序跟到达顺序一致) */}
        {hasRichEvents
          ? richEvents!.map((ev, i) => (
              <RichEventBubble key={`ev-${i}-${String(ev.type)}`} event={ev} />
            ))
          : null}

        {/* Markdown 正文 */}
        {hasContent ? (
          <div className="rounded-md bg-bg-sunken px-3.5 py-2.5 text-fg text-sm">
            <Markdown>{content}</Markdown>
            {showCursor ? (
              <span
                aria-hidden="true"
                className="inline-block w-1.5 h-4 bg-fg-muted ml-0.5 align-middle animate-pulse"
              />
            ) : null}
          </div>
        ) : null}

        {/* 流式态, 还没收到任何文字但有事件 → 显示占位 */}
        {isStreaming && !hasContent && !hasRichEvents ? (
          <TypingDots />
        ) : null}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// TypingDots — 流式"正在思考"占位
// ────────────────────────────────────────────────────────────
function TypingDots(): ReactNode {
  return (
    <div className="inline-flex items-center gap-1 px-3.5 py-2.5 rounded-md bg-bg-sunken text-fg-muted">
      <Dot delay={0} />
      <Dot delay={0.15} />
      <Dot delay={0.3} />
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block w-1.5 h-1.5 rounded-full bg-fg-muted"
      style={{
        animation: `gagaos-bounce 1s ease-in-out ${delay}s infinite`,
      }}
    />
  );
}

function FileGlyph() {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────
// 主入口
// ────────────────────────────────────────────────────────────

export function MessageBubble(props: MessageBubbleProps) {
  return props.role === "user" ? (
    <UserBubble {...props} />
  ) : (
    <AssistantBubble {...props} />
  );
}
