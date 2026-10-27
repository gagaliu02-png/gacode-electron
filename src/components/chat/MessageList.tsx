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
import type { CallTreeNode } from "./CallTreeCard";
import type { ExecutionPhase } from "./ExecutionTimeline";

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
  // ============== 0.7.5 ==============
  /** chat-id-9: server metadata.knowledge_refs */
  knowledgeRefs?: string[];
  /** chat-id-40: server metadata.quoted_message_id / quoted_content */
  quotedMessageId?: string | null;
  quotedContent?: string | null;
  /** chat-id-20: 流式开始时间戳 ms (parent 用 useRef Date.now() 记) */
  streamingSince?: number | null;
  /** chat-id-11 / chat-id-20: server metadata.tool_total_ms */
  toolTotalMs?: number | null;
  /**
   * A2-D4-02 · 思考 / 工具时间线 (assistant 才有).
   * 数据源 = `routes/ChatDetail.tsx` 流式累积的 `chunk.reasoning` + tool 事件.
   */
  phases?: ExecutionPhase[];
  /** chat-id-12: call tree 节点 (parent 从 chunk.events 解析) */
  callTree?: CallTreeNode[];
}

interface Props {
  messages: ChatMessageModel[];
  /** 当前正在流式的 assistant message id (本地临时 id), 用于 pulse 光标 + typing dots. */
  streamingAssistantId?: string | null;
  /**
   * A2-D4-06 · 当前 chat 中所有 user message 已上传过的 imageUrls 并集.
   * 透传给每条 MessageBubble 的 `stripImageUrls`: assistant 气泡渲染前把 AI
   * 回复里引用了 user 已发图的 markdown 片段整段去掉.
   * 不传 / 空数组 → 不过滤.
   */
  stripImageUrls?: string[];
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
  onMessageAction,
  stripImageUrls,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);

  // 自动滚到底 — 在 messages 改变时
  // 对齐 web MessageList.tsx:55-57 — `scrollIntoView({ behavior: "smooth" })`.
  // PC 的 autoFollow (用户上滚 80px 阈值停自动滚) 是 PC 增强 → 保留不动.
  useLayoutEffect(() => {
    if (!autoFollow) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, autoFollow]);

  // 用户滚动 → 判断是否处于"主动向上"  (阈值 80px)
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      // 阈值 80px: 距离 > 80 视为用户在看历史 → 停自动滚
      const sticky = distance < 80;
      setAutoFollow((prev) => {
        if (prev === sticky) return prev;
        return sticky;
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="relative h-full">
      <div
        ref={scrollerRef}
        className="h-full overflow-y-auto p-4"
        aria-label="消息列表"
      >
        {/* 消息内容容器 — 对齐 web MessageList.tsx:79 `max-w-3xl mx-auto space-y-4` */}
        <div className="max-w-3xl mx-auto space-y-4">
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
              knowledgeRefs={m.knowledgeRefs}
              quotedMessageId={m.quotedMessageId}
              quotedContent={m.quotedContent}
              phases={m.phases}
              stripImageUrls={stripImageUrls}
              callTree={m.callTree}
              onAction={
                onMessageAction
                  ? (action, ok) => onMessageAction(m, action, ok)
                  : undefined
              }
            />
          ))}

          <div ref={bottomRef} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}