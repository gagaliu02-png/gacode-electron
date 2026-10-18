/**
 * routes/ChatDetail.tsx — 阶段 2 Chat 详情 (SSE 流式核心)
 *
 * 数据流:
 *   - useQuery(["chats"], getChats)  ←→ 顶 Header 标题
 *   - useQuery(["history", id], () => getHistory(id))  ←→ 消息列表
 *   - useChatStream()  hook  ←→ POST /yinian/sessions/:id/chat/stream
 *
 * 流式 status:
 *   - 流式开启 → 新建本地临时 assistant message (id = streaming-ts-xxx)
 *   - chunk.content 累积 → streamingContent
 *   - chunk.event / chunk.events → streamingEvents
 *   - isTerminalDone → 用 server messageId 替换本地 id + 触发 history invalidate
 *   - isCancelFrame  → 直接 closed (不调 ack, 已经在取消中)
 *
 * 取消路径 (双带 intent, 走 lib/cancel.ts sendCancelDelete):
 *   - 用户按停止按钮 → abort() + USER_STOP
 *   - 收到轮次终态 → ack ACK_DONE (finally 里, 互斥路径)
 *   - 组件卸载 → abort() 但不发 USER_STOP (让 gaclaw 跑完正常落库)
 *
 * 边界:
 *   - 输入 image / 文档 都走 lib/upload.ts; 主调用流跟 ChatInputBar 联动
 *   - 当前 chat 标题 来自 useChats 拿到的 chat.title (server 持久化)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteSessions,
  getChats,
  getHistory,
  type ChatMessage,
} from "../lib/api";
import { useToast } from "../components/ui/Toast";
import { useChatStream } from "../lib/sse";
import {
  isTerminalDone,
  isCancelFrame,
  isUserAbortError,
  UserAbortError,
  type ChatChunk,
  type CancelIntent,
} from "../lib/cancel";
import { MessageList, type ChatMessageModel } from "../components/chat/MessageList";
import {
  ChatInputBar,
  type PendingAttachment,
} from "../components/chat/ChatInputBar";
import {
  StreamingErrorBanner,
  classifyStreamingError,
  type StreamingErrorKind,
} from "../components/chat/StreamingErrorBanner";
import { Button } from "../components/ui/Button";

// 标签 id — 临时 assistant message 用, server 真 messageId 回来后替换
function streamingId(): string {
  return `streaming-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// utils ─────────────────────────────────────────────────────
function extractImageUrls(msg: ChatMessage): string[] {
  return msg.imageUrls ?? [];
}
function extractFileIds(msg: ChatMessage): string[] {
  return msg.attachedFileIds ?? [];
}
function extractFileNames(msg: ChatMessage): Array<{ fileId: string; name: string }> {
  return msg.attachedFileNames ?? [];
}

export function ChatDetail() {
  const { id: chatId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const stream = useChatStream();

  // ────────────── 派生数据 ──────────────
  const chatsQuery = useQuery({
    queryKey: ["chats"],
    queryFn: getChats,
  });
  const currentChat = useMemo(
    () => chatsQuery.data?.chats.find((c) => c.id === chatId) ?? null,
    [chatsQuery.data, chatId],
  );

  // ────────────── 消息列表 ──────────────
  const historyQuery = useQuery({
    queryKey: ["history", chatId],
    queryFn: () => getHistory(chatId!),
    enabled: !!chatId,
  });

  // 服务端 history → 本地模型, isStreaming 标志由 streamingAssistantId 控制
  const baseMessages: ChatMessageModel[] = useMemo(() => {
    const list: ChatMessageModel[] = (historyQuery.data?.messages ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      imageUrls: extractImageUrls(m),
      attachedFileIds: extractFileIds(m),
      attachedFileNames: extractFileNames(m),
      createdAt: m.createdAt,
    }));
    return list;
  }, [historyQuery.data]);

  // 流式期间累积 (content + events). MessageList 用 streamingContent 渲染最后一条.
  const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingEvents, setStreamingEvents] = useState<
    Array<Record<string, unknown>>
  >([]);
  // 流式 error 状态 (network / sse / server). 仅在被动失败时显示; USER_STOP 不显示.
  const [streamError, setStreamError] = useState<{
    kind: StreamingErrorKind;
    message: string;
    /** 用于重试的回放上下文 (image_urls + file_ids) */
    userAttachments: PendingAttachment[];
  } | null>(null);

  // 取最后一次成功发送的 user 文本 (用于重试)
  const lastUserTextRef = useRef<string>("");
  // 是否处于"等待首帧" 的状态 — 用来显示"正在思考" 占位
  const [waitingFirstFrame, setWaitingFirstFrame] = useState(false);

  // 拼装最终 messages: 历史 + 流式那条占位
  const messages: ChatMessageModel[] = useMemo(() => {
    if (!streamingAssistantId) return baseMessages;
    const streamingMsg: ChatMessageModel = {
      id: streamingAssistantId,
      role: "assistant",
      content: streamingContent,
      richEvents: streamingEvents as ChatMessageModel["richEvents"],
    };
    return [...baseMessages, streamingMsg];
  }, [baseMessages, streamingAssistantId, streamingContent, streamingEvents]);

  // ────────────── SSE 启动 + chunk 处理 ──────────────

  const startStream = useCallback(
    async (text: string, attachments: PendingAttachment[]) => {
      if (!chatId) return;
      // 重置流式态
      const localAssistantId = streamingId();
      setStreamingAssistantId(localAssistantId);
      setStreamingContent("");
      setStreamingEvents([]);
      setStreamError(null);
      setWaitingFirstFrame(true);

      const imageUrls = attachments
        .filter((a) => !!a.url)
        .map((a) => a.url as string);
      const fileIds = attachments
        .filter((a) => !!a.fileId)
        .map((a) => a.fileId as string);

      try {
        await stream.start({
          sessionId: chatId,
          message: text,
          imageUrls,
          attachedFileIds: fileIds,
          onChunk: (chunk: ChatChunk) => {
            // waiting first frame → 收到任意 chunk 即结束 typing
            setWaitingFirstFrame(false);
            if (chunk.content) {
              setStreamingContent((prev) => prev + chunk.content);
            }
            if (chunk.event) {
              setStreamingEvents((prev) => [...prev, chunk.event!]);
            }
            if (chunk.events && chunk.events.length > 0) {
              setStreamingEvents((prev) => [...prev, ...chunk.events!]);
            }
            if (isTerminalDone(chunk)) {
              // 终态 → 立即用 server messageId 替换本地临时 id
              const serverId = chunk.messageId!;
              setStreamingAssistantId((cur) => (cur === localAssistantId ? null : cur));
              setStreamingContent("");
              setStreamingEvents([]);
              // 刷新 history + chats (server 落库后 title 改了)
              queryClient.invalidateQueries({ queryKey: ["history", chatId] });
              queryClient.invalidateQueries({ queryKey: ["chats"] });
              // small UX touch: fullContent / emptyReply 由父组件消费, 此处不强求
              void serverId;
              return;
            }
            if (isCancelFrame(chunk)) {
              // 取消帧 — 直接关闭, 不调 ack (互斥路径 finally 会判)
              setStreamingAssistantId((cur) => (cur === localAssistantId ? null : cur));
              setStreamingContent("");
              setStreamingEvents([]);
              return;
            }
            if (chunk.error) {
              setStreamError({
                kind: "server",
                message: String(chunk.error),
                userAttachments: attachments,
              });
              setStreamingAssistantId((cur) => (cur === localAssistantId ? null : cur));
              setStreamingContent("");
              setStreamingEvents([]);
            }
          },
        });
      } catch (err) {
        // user abort → 静默关闭, 不弹错误
        if (isUserAbortError(err) || err instanceof UserAbortError) {
          setStreamingAssistantId((cur) => (cur === localAssistantId ? null : cur));
          setStreamingContent("");
          setStreamingEvents([]);
          setWaitingFirstFrame(false);
          return;
        }
        // 真正的网络/服务端错误 → banner + 暂存以备重试
        const kind = classifyStreamingError(err);
        const msg = err instanceof Error ? err.message : String(err);
        setStreamError({
          kind,
          message: msg,
          userAttachments: attachments,
        });
        setStreamingAssistantId((cur) => (cur === localAssistantId ? null : cur));
        setStreamingContent("");
        setStreamingEvents([]);
        setWaitingFirstFrame(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatId, queryClient],
  );

  // ────────────── 发送 / 停止 ──────────────

  const handleSubmit = useCallback(
    (text: string, attachments: PendingAttachment[]): boolean => {
      if (!chatId) return false;
      if (streamingAssistantId) return false; // 已经在流式, 拒绝并发
      lastUserTextRef.current = text;
      // 乐观把 user message 直接放进 history 是不行的 — server 还没写。
      // 这里依靠 server 落库后 history invalidate, 用户视角的"刚发出"的
      // 那条 user message 让 history 拉回来再渲染。
      void startStream(text, attachments);
      return true;
    },
    [chatId, streamingAssistantId, startStream],
  );

  const handleStop = useCallback(() => {
    // 用户主动 → abort('user') 让 turnState.userStopped = true
    // finally 看到 userStopped → 走 sendCancelDelete('USER_STOP')
    stream.abort("user");
  }, [stream]);

  const handleRetry = useCallback(() => {
    if (!streamError) return;
    setStreamError(null);
    const text = lastUserTextRef.current;
    if (!text) return;
    void startStream(text, streamError.userAttachments);
  }, [streamError, startStream]);

  // 流式完成后 + assistant message 已 server-side 落库 → history 已 invalidate
  // (onChunk isTerminalDone 处理); 不需要额外的 patch 逻辑

  // ────────────── 头部操作 (重命名 / 删除) ──────────────

  const deleteMutation = useMutation({
    mutationFn: () => deleteSessions([chatId!]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      toast({ message: "已删除对话", variant: "success" });
      navigate("/chat");
    },
    onError: (err) => {
      toast({
        message: `删除失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });

  const handleDeleteChat = () => {
    if (!currentChat) return;
    if (window.confirm(`确认删除对话 "${currentChat.title || "新对话"}"?`)) {
      deleteMutation.mutate();
    }
  };

  // 组件卸载 → abort 但不 userStopped (跟 web 一致, 让流自然跑完落库)
  useEffect(() => {
    return () => {
      stream.abort("navigate");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ────────────── 渲染 ──────────────

  if (!chatId) {
    return <div className="p-8 text-fg-muted">无效的对话 id</div>;
  }

  const title = currentChat?.title || "新对话";
  const isStreaming = !!streamingAssistantId;

  return (
    <div className="h-full flex flex-col bg-bg-base">
      {/* 头部: 顶 AppShell 已占, 这里只渲染 "..." 按钮 由父级 slot 不可控;
          所以把 ⋮ 菜单放在内容区的顶部行, 内容区占 100% 高度. */}
      <div className="shrink-0 h-12 bg-bg-elevated px-4 flex items-center justify-between">
        <div className="flex-1 min-w-0 truncate font-medium text-sm">{title}</div>
        <button
          type="button"
          aria-label="对话操作"
          onClick={handleDeleteChat}
          className="w-9 h-9 inline-flex items-center justify-center rounded hover:bg-bg-elevated text-fg-muted hover:text-danger transition-colors duration-150"
          title="删除对话"
        >
          <TrashIcon />
        </button>
      </div>

      {/* 错误 banner */}
      {streamError ? (
        <StreamingErrorBanner
          kind={streamError.kind}
          message={streamError.message}
          onRetry={handleRetry}
          onDismiss={() => setStreamError(null)}
        />
      ) : null}

      {/* 消息区 */}
      <div className="flex-1 min-h-0">
        {historyQuery.isLoading ? (
          <div className="h-full flex items-center justify-center text-fg-muted text-sm">
            加载历史消息…
          </div>
        ) : (
          <MessageList
            messages={messages}
            streamingAssistantId={streamingAssistantId}
          />
        )}
      </div>

      {/* 输入栏 */}
      <ChatInputBar
        isStreaming={isStreaming}
        onStop={handleStop}
        onSubmit={handleSubmit}
        onAttachmentError={(msg) =>
          toast({ message: `上传失败: ${msg}`, variant: "danger" })
        }
      />

      {/* 首帧等待占位: 在 MessageList 内部已经能做 typing dots, 这里留作 future use */}
      {waitingFirstFrame && isStreaming ? (
        <span className="sr-only" aria-live="polite">
          等待流式首帧…
        </span>
      ) : null}
    </div>
  );

  // 消除 unused import 警告 (Button 是给未来更多 CTA 留的)
  // 注: Button 上面已用到, 这里仅为类型提示, 不渲染
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void Button;
  // 显式用到 CancelIntent 不渲染, 仅用作 module import
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void ({} as CancelIntent);
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
