/**
 * routes/ChatDetail.tsx — 阶段 2 Chat 详情 (SSE 流式核心) — 阶段 8 加重写
 *
 * 数据流:
 *   - useQuery(["chats"], getChats)  ←→ 顶 Header 标题
 *   - useQuery(["history", id], () => getHistory(id))  ←→ 消息列表
 *   - useChatStream()  hook  ←→ POST /yinian/sessions/:id/chat/stream
 *
 * 流式 status:
 *   - 流式开启 → 新建本地临时 assistant message (id = streaming-ts-xxx)
 *   - chunk.content 累积 → streamingContent
 *   - chunk.event / chunk.events → streamingEvents (含 approval_request)
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
 *
 * 阶段 8 (chat-id-1/13/14/15/16/17/18/19 P0):
 *   - chat-id-1 : Header ⋮ DropdownMenu (重命名 / 固定 / 删除) + ConfirmDialog
 *   - chat-id-13: ApprovalBanner sticky 在输入栏上方, SSE approval_request 累积
 *   - chat-id-14: 消息 ⋮ → recallMessage PATCH, 客户端 2 分钟窗口 UI 卡
 *   - chat-id-15: 消息 ⋮ → createLibraryItem(doc) (跟 web fallback 同款, server
 *                 还没专用端点 /messages/:id/save-to-kb, 文末报告 send-blocker)
 *   - chat-id-16: 消息 ⋮ → deleteMessage DELETE, 软删, ConfirmDialog 二次确认
 *   - chat-id-17: 消息 ⋮ → like/dislike 暂未上线 (server 没 /messages/:id/feedback
 *                 endpoint, 报告 send-blocker)
 *   - chat-id-18: 消息 ⋮ → clipboard.writeText + toast
 *   - chat-id-19: ChatInputBar 右侧三态按钮 (stop / rerun / send), 重发最后一条 user
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteSessions,
  getChats,
  getHistory,
  renameChat,
  setSessionPin,
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
import {
  ApprovalBanner,
  type ApprovalRequest,
} from "../components/chat/ApprovalBanner";
import {
  DropdownMenu,
  type DropdownMenuItem,
} from "../components/ui/DropdownMenu";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Input } from "../components/ui/Input";
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

/** 把 approval_request rich_event 抽成 ApprovalRequest; 缺字段兜底. */
function toApprovalRequest(ev: Record<string, unknown>): ApprovalRequest | null {
  const pendingId =
    (typeof ev.pendingId === "string" && ev.pendingId) ||
    (typeof ev.id === "string" && ev.id) ||
    (typeof ev.toolId === "string" && ev.toolId) ||
    "";
  if (!pendingId) return null;
  const risk = String(ev.riskLevel ?? "medium");
  return {
    // 用 pendingId 当 store 去重 key, 跟 web store.addPendingApproval 同款
    id: pendingId,
    pendingId,
    tool: String(ev.tool ?? ev.name ?? "tool"),
    title: String(ev.title ?? "需要你的授权"),
    detail: ev.detail ? String(ev.detail) : undefined,
    riskLevel: risk === "high" || risk === "low" ? risk : "medium",
  };
}

// ────────────────────────────────────────────────────────────
// chat-id-19 rerun: 从历史里拿最后一条 user 消息的 (text + attachments),
//   严格只读 server 端同步下来的字段. 历史里的 user message 必然有 serverId,
//   image_urls / attached_file_ids 都来自 metadata, 重发时同样能跑知识库知识图匹配.
// ────────────────────────────────────────────────────────────
function reconstructLastUserSubmission(messages: ChatMessageModel[]): {
  text: string;
  attachments: PendingAttachment[];
} | null {
  // 从尾部往前找第一条 role=user 的
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const text = m.content || "";
    const attachments: PendingAttachment[] = [];
    if (m.imageUrls) {
      m.imageUrls.forEach((url, idx) =>
        attachments.push({ url, name: m.attachedFileNames?.[idx]?.name ?? `图片 ${idx + 1}` }),
      );
    }
    if (m.attachedFileIds) {
      m.attachedFileIds.forEach((fileId) => {
        attachments.push({
          fileId,
          name: m.attachedFileNames?.find((n) => n.fileId === fileId)?.name ?? "附件",
        });
      });
    }
    return { text, attachments };
  }
  return null;
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
      recalled: m.recalled ?? false,
      recalledAt: m.recalledAt ?? null,
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

  // 取最后一次成功发送的 user (text + attachments), 供重试 / 重新生成复用.
  const lastUserTextRef = useRef<string>("");
  const lastUserAttachmentsRef = useRef<PendingAttachment[]>([]);

  // 阶段 8 chat-id-13 — approval_request 累积. 任一按钮触发 → 清整张 banner.
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);

  const addPendingApproval = useCallback((req: ApprovalRequest) => {
    setPendingApprovals((prev) =>
      prev.some((p) => p.id === req.id) ? prev : [...prev, req],
    );
  }, []);

  const clearPendingApprovals = useCallback(() => {
    setPendingApprovals([]);
  }, []);

  // 是否处于"等待首帧" 的状态 — 用来显示"正在思考" 占位
  const [waitingFirstFrame, setWaitingFirstFrame] = useState(false);

  // 切 chat → 清 pendingApprovals (旧 session 的 pending 不带到新 session).
  // 跟 web page.tsx:317-321 同款 (clear store on chat switch).
  useEffect(() => {
    setPendingApprovals([]);
    setStreamingAssistantId(null);
    setStreamingContent("");
    setStreamingEvents([]);
    setStreamError(null);
    setWaitingFirstFrame(false);
    return () => {
      // 卸载时再清一次 — 切 chat / unmount 都覆盖到.
      setPendingApprovals([]);
    };
  }, [chatId]);

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

  // chat-id-19 rerun 显示条件: 不在流式 + 历史非空 + 最后一条是 assistant.
  // (web 同款: 在最后一条 assistant 后留 rerun 入口)
  const canRerun = useMemo(() => {
    if (streamingAssistantId) return false;
    if (messages.length === 0) return false;
    const last = messages[messages.length - 1];
    return last.role === "assistant" && last.content.trim().length > 0;
  }, [streamingAssistantId, messages]);

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
      // 新一轮触发 → 清空旧 session 的 pending approvals (不再 stale)
      clearPendingApprovals();

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
            // 阶段 8 chat-id-13/17 — 抽 approval_request / approval_granted /
            //   approval_denied / feedback 事件走 ApprovalBanner / store, 不进
            //   message.richEvents (跟 web page.tsx:622-655 + Android ApprovalBanner 同款)
            if (chunk.event) {
              const ev = chunk.event;
              const type = ev.type as string | undefined;
              if (type === "approval_request") {
                const req = toApprovalRequest(ev);
                if (req) addPendingApproval(req);
                return; // 不进 richEvents (banner 唯一展示源)
              }
              if (type === "approval_granted" || type === "approval_denied") {
                // first-wins: 任一端 granted/denied 后清空 banner
                clearPendingApprovals();
                return;
              }
              // 阶段 8 chat-id-17 server feedback 事件: SSE pipeline 兼容性预留,
              //   server 暂未推. 留这分支给后续 /feedback 事件.
              if (type === "feedback") {
                // future: 进 store, 用来实时刷新 like/dislike 图标. 当前 server
                //   不推, 代码先就位.
                return;
              }
              setStreamingEvents((prev) => [...prev, ev]);
            }
            if (chunk.events && chunk.events.length > 0) {
              const kept: Array<Record<string, unknown>> = [];
              for (const ev of chunk.events) {
                const type = ev.type as string | undefined;
                if (type === "approval_request") {
                  const req = toApprovalRequest(ev);
                  if (req) addPendingApproval(req);
                  continue; // banner 唯一源
                }
                if (type === "approval_granted" || type === "approval_denied") {
                  clearPendingApprovals();
                  continue;
                }
                if (type === "feedback") {
                  continue; // 预留, 当前不进 message
                }
                kept.push(ev);
              }
              if (kept.length > 0) {
                setStreamingEvents((prev) => [...prev, ...kept]);
              }
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
    [chatId, queryClient, addPendingApproval, clearPendingApprovals],
  );

  // ────────────── 发送 / 停止 / 重试 / 重生 ──────────────

  const handleSubmit = useCallback(
    (text: string, attachments: PendingAttachment[]): boolean => {
      if (!chatId) return false;
      if (streamingAssistantId) return false; // 已经在流式, 拒绝并发
      lastUserTextRef.current = text;
      lastUserAttachmentsRef.current = attachments;
      void startStream(text, attachments);
      return true;
    },
    [chatId, streamingAssistantId, startStream],
  );

  const handleStop = useCallback(() => {
    stream.abort("user");
  }, [stream]);

  const handleRetry = useCallback(() => {
    if (!streamError) return;
    setStreamError(null);
    const text = lastUserTextRef.current;
    if (!text) return;
    void startStream(text, streamError.userAttachments);
  }, [streamError, startStream]);

  // chat-id-19 — 重发最后一条 user 消息.
  // 策略: 优先用 ref 里最近一次成功提交的 (text, attachments); ref 缺失时退化到
  //   从 history 末尾反向扫 user 消息, 用 server metadata 重构.
  const handleRerun = useCallback(() => {
    if (!chatId) return;
    if (streamingAssistantId) return; // canRerun 已是 false, 兜底
    let text = lastUserTextRef.current;
    let attachments = lastUserAttachmentsRef.current;
    if (!text) {
      const last = reconstructLastUserSubmission(baseMessages);
      if (!last || !last.text.trim()) {
        toast({ message: "找不到上一条用户消息, 重新发送", variant: "warning" });
        return;
      }
      text = last.text;
      attachments = last.attachments;
      lastUserTextRef.current = text;
      lastUserAttachmentsRef.current = attachments;
    }
    // 重新生成: 先 cancel 当前 (防御, 实际 canRerun=false 时不该触发到这里)
    stream.abort("user");
    void startStream(text, attachments);
  }, [chatId, streamingAssistantId, baseMessages, startStream, stream, toast]);

  // ────────────── 头部操作 (重命名 / 固定 / 删除) ──────────────

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

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

  // 重命名: ConfirmDialog + Input 子组件 (对应 ChatList 已有 dialogue 同款).
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  const renameMutation = useMutation({
    mutationFn: (title: string) => renameChat(chatId!, title),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      toast({
        message: `已重命名为 "${updated.title || "新对话"}"`,
        variant: "success",
      });
      setRenameOpen(false);
    },
    onError: (err) => {
      toast({
        message: `重命名失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });

  const pinMutation = useMutation({
    mutationFn: (next: boolean) => setSessionPin(chatId!, next),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      toast({
        message: updated.pinned ? "已固定到顶部" : "已取消固定",
        variant: "success",
      });
    },
    onError: (err) => {
      toast({
        message: `操作失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });

  // 阶段 8 — 消息操作回调 (来自 MessageMenu → MessageList → 这里).
  // 成功后 invalidateQueries 拿 server 流回的最新数据 (recalled/recalledAt 字段会更新,
  //   recalled 占位气泡自动出现; 软删的消息彻底从 history 里消失).
  const handleMessageAction = useCallback(
    (_msg: ChatMessageModel, action: string, ok: boolean) => {
      if (!ok) return;
      // 'copy' 不需要刷 history, 其余都刷
      if (action !== "copy") {
        queryClient.invalidateQueries({ queryKey: ["history", chatId] });
      }
    },
    [chatId, queryClient],
  );

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
  const pinned = !!currentChat?.pinned;

  // Header ⋮ DropdownMenu items — 阶段 8 chat-id-1
  const headerMenuItems: DropdownMenuItem[] = [
    {
      label: "重命名",
      onClick: () => {
        setRenameValue(title === "新对话" ? "" : title);
        setRenameOpen(true);
      },
    },
    {
      label: pinned ? "取消固定" : "固定到顶部",
      onClick: () => pinMutation.mutate(!pinned),
      disabled: pinMutation.isPending,
    },
    {
      label: "复制会话 ID",
      onClick: () => {
        void navigator.clipboard.writeText(chatId).then(() => {
          toast({ message: "已复制会话 ID", variant: "success" });
        });
      },
    },
    {
      label: "删除对话",
      destructive: true,
      onClick: () => setConfirmDeleteOpen(true),
    },
  ];

  return (
    <div className="h-full flex flex-col bg-bg-base">
      {/* 头部 — 阶段 8 chat-id-1: 重命名 + 完整 ⋮ 菜单 */}
      <div className="shrink-0 h-12 bg-bg-elevated px-4 flex items-center justify-between">
        <div className="flex-1 min-w-0 truncate font-medium text-sm" title={title}>
          {title}
        </div>
        <DropdownMenu
          trigger={
            <button
              type="button"
              aria-label="对话操作"
              className="w-9 h-9 inline-flex items-center justify-center rounded hover:bg-bg-sunken text-fg-muted hover:text-fg transition-colors duration-150"
              data-testid="chat-header-more"
            >
              <MoreIcon />
            </button>
          }
          items={headerMenuItems}
          align="right"
        />
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
            onMessageAction={handleMessageAction}
          />
        )}
      </div>

      {/* 阶段 8 chat-id-13 — ApprovalBanner sticky 在输入栏上方 */}
      <ApprovalBanner
        requests={pendingApprovals}
        sessionId={chatId}
        onClear={clearPendingApprovals}
        onError={(msg) =>
          toast({
            message: `审批失败: ${msg}`,
            variant: "danger",
            duration: 4000,
          })
        }
      />

      {/* 输入栏 — chat-id-19 加 canRerun + onRerun */}
      <ChatInputBar
        isStreaming={isStreaming}
        canRerun={canRerun}
        onRerun={handleRerun}
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

      {/* 删除对话二次确认 */}
      {confirmDeleteOpen ? (
        <ConfirmDialog
          title="删除对话"
          message={`确认删除对话 "${title}"? 此操作无法撤销。`}
          confirmLabel="删除"
          cancelLabel="取消"
          confirmVariant="danger"
          loading={deleteMutation.isPending}
          onCancel={() => setConfirmDeleteOpen(false)}
          onConfirm={() => {
            deleteMutation.mutate();
            setConfirmDeleteOpen(false);
          }}
        />
      ) : null}

      {/* 重命名对话框 */}
      {renameOpen ? (
        <ConfirmDialog
          title="重命名对话"
          message="为这个对话设置一个新标题。"
          confirmLabel="保存"
          cancelLabel="取消"
          loading={renameMutation.isPending}
          onCancel={() => setRenameOpen(false)}
          onConfirm={() => {
            const v = renameValue.trim();
            if (!v) {
              toast({ message: "标题不能为空", variant: "warning" });
              return;
            }
            renameMutation.mutate(v);
          }}
        >
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            maxLength={64}
            placeholder="输入新标题"
            autoFocus
            data-testid="rename-input"
          />
        </ConfirmDialog>
      ) : null}
    </div>
  );

  // 消除 unused import 警告 (Button / CancelIntent 模块引用, 留作未来扩展点)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void Button;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  void ({} as CancelIntent);
}

// ────────────────────────────────────────────────────────────
// icons — local; 不引 lucide-react, 跟项目其它组件保持一致
// ────────────────────────────────────────────────────────────

function MoreIcon() {
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
      <circle cx="12" cy="5" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="12" cy="19" r="1.4" />
    </svg>
  );
}
