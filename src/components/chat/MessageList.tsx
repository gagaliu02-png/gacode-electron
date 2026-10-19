/**
 * components/chat/MessageList.tsx — 阶段 2 消息列表容器
 *
 * 渲染: 垂直堆叠 MessageBubble + 自动滚到底部 (仅在用户没主动向上滚时).
 *
 * 状态: messages[] + streamingAssistantId (谁在流式).
 *
 * 设计要点:
 *   - 流式期间持续追加 chunk 不抖动: 用 sticky 底部 + scrollIntoView({block: "end"})
 *   - 用户向上滚动 (滚到底距离 > 阈值) → 停止自动滚, 让用户自己看历史
 *   - 用户再滚到底 → 恢复自动滚
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MessageBubble } from "./MessageBubble";
import type { RichEvent } from "./RichEventBubble";
import type { MessageAction } from "./MessageMenu";

export interface ChatMessageModel {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** 服务端落库 metadata 字段 (image_urls / attached_file_ids / attached_files) */
  imageUrls?: string[];
  attachedFileIds?: string[];
  attachedFileNames?: Array<{ fileId: string; name: string }>;
  /** 流式累积的 rich events (tool_start / file / image / thinking / …) */
  richEvents?: RichEvent[];
  createdAt?: string;
  /** 阶段 8: 是否已撤回 (server listChatMessages 透传 recalled / recalled_at) */
  recalled?: boolean;
  recalledAt?: string | null;
}

interface Props {
  messages: ChatMessageModel[];
  /** 当前正在流式的 assistant message id (本地临时 id), 用于 pulse 光标 + typing dots. */
  streamingAssistantId?: string | null;
  /** 用户已主动向上滚动的状态 (own 滚动观察). 用于"跳到底"按钮的显示控制. */
  onAutoScrollChange?: (sticky: boolean) => void;
  /**
   * 阶段 8: 消息动作回调 (复制 / 保存到 KB / 点赞 / 点踩 / 撤回 / 删除 / rerun).
   * parent (ChatDetail) 收到 ok=true 时调 queryClient.invalidateQueries
   * 刷新 history, 保证 server 端回流 (recalled / deleted_at 字段更新后
   * 占位气泡自动出现, 软删的行彻底从 list 消失).
   */
  onMessageAction?: (msg: ChatMessageModel, action: MessageAction, ok: boolean) => void;
}

export function MessageList({
  messages,
  streamingAssistantId,
  onAutoScrollChange,
  onMessageAction,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  const lastDistanceFromBottom = useRef<number>(0);

  // 自动滚到底 — 在 messages 改变时
  useLayoutEffect(() => {
    if (!autoFollow) return;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, autoFollow]);

  // 用户滚动 → 判断是否处于"主动向上"  (阈值 80px)
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      lastDistanceFromBottom.current = distance;
      // 阈值 80px: 距离 > 80 视为用户在看历史 → 停自动滚
      const sticky = distance < 80;
      setAutoFollow((prev) => {
        if (prev === sticky) return prev;
        return sticky;
      });
      onAutoScrollChange?.(sticky);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [onAutoScrollChange]);

  const handleJumpToBottom = () => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setAutoFollow(true);
    onAutoScrollChange?.(true);
  };

  return (
    <div className="relative h-full">
      <div
        ref={scrollerRef}
        className="h-full overflow-y-auto px-4 py-6 space-y-3"
        aria-label="消息列表"
      >
        {messages.length === 0 ? (
          <div className="h-full flex items-center justify-center text-fg-muted text-sm">
            暂无消息 — 在底部输入框开始你的第一条消息
          </div>
        ) : null}

        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            messageId={m.id}
            role={m.role}
            content={m.content}
            richEvents={m.richEvents}
            imageUrls={m.imageUrls}
            attachedFileIds={m.attachedFileIds}
            attachedFileNames={m.attachedFileNames}
            isStreaming={
              !!streamingAssistantId &&
              m.id === streamingAssistantId &&
              m.role === "assistant"
            }
            createdAt={m.createdAt}
            recalled={m.recalled}
            recalledAt={m.recalledAt}
            onAction={
              onMessageAction
                ? (action, ok) => onMessageAction(m, action, ok)
                : undefined
            }
          />
        ))}

        <div ref={bottomRef} aria-hidden="true" />
      </div>

      {/* "跳到底" 浮动按钮 — 用户向上滚时显示 */}
      {!autoFollow ? (
        <button
          type="button"
          onClick={handleJumpToBottom}
          aria-label="跳到底部"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-bg-elevated text-fg shadow-elevation-2 px-3 py-1.5 text-xs hover:bg-bg-sunken transition-colors duration-150"
        >
          ↓ 跳到底
        </button>
      ) : null}
    </div>
  );
}
