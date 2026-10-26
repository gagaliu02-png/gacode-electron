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
 *   - 输入附件入口统一收在 ChatInputBar 左侧 `+` 按钮 (gagaOS 2026-10-20 hotfix 2):
 *     点 `+` → PlusActionsSheet (6 项: image / document / emoji / knowledge / camera / template)
 *     → ChatDetail 自管 sheet / file input / emoji picker / knowledge sheet.
 *     ChatInputBar 只通过 ref 暴露 insertEmoji / addAttachment / focus.
 *   - 当前 chat 标题 来自 useChats 拿到的 chat.title (server 持久化)
 *
 * 阶段 8 (chat-id-1/13/14/15/16/17/18/19 P0):
 *   - chat-id-1 : Header ⋮ DropdownMenu (重命名 / 固定 / 删除) + ConfirmDialog
 *   - chat-id-13: ApprovalBanner sticky 在输入栏上方, SSE approval_request 累积
 *   - chat-id-14: 消息 ⋮ → recallMessage PATCH, 客户端 2 分钟窗口 UI 卡
 *   - chat-id-15: 消息 ⋮ → createLibraryItem(doc) (跟 web fallback 同款, server
 *                 还没专用端点 /messages/:id/save-to-kb, 文末报告 send-blocker)
 *   - chat-id-16: 消息 ⋮ → deleteMessage DELETE, 软删, ConfirmDialog 二次确认
 *   - chat-id-17: ⚠️ gagaOS 2026-10-19 新拍板 推翻之前 yes, **点赞 / 点砍**功能
 *                 整体删除 (server 端没 /messages/:id/feedback endpoint), 保留
 *                 复制 / 重新生成 (ChatInputBar 右侧) / 撤回 / 保存 KB / 删除 5 项
 *                 — 见 MessageMenu.tsx
 *   - chat-id-18: 消息 ⋮ → clipboard.writeText + toast
 *   - chat-id-19: ChatInputBar 右侧三态按钮 (stop / rerun / send), 重发最后一条 user
 *
 * 0.7.5 ChatDetail P1 (f08e147) 增量:
 *   - chat-id-30: 知识库挂载 chip + KnowledgeAttachSheet; ChatInputBar 内置 📚 按钮
 *     选中 → handleKnowledgePick 推送 item.id 到 pendingKnowledgeRefs
 *   - chat-id-31: ModelChips 顶部 model 切换
 *   - chat-id-33: autoTitleSession 800ms delay 触发 server LLM 标题 (gagaOS §⑤)
 *
 * gagaOS 2026-10-19 反馈 (0.7.5 hotfix):
 *   - §① ChatInputBar 重复 textarea 删除 (阶段 8 P0 + 0.7.5 P1 三 worker 撞改)
 *   - §② ChatInputBar 内置 image / document / emoji / knowledge, 不再依赖外部 sheet
 *   - §③ EmojiPicker 入口接入 ChatInputBar (复用 components/home/EmojiPicker.tsx)
 *   - §④ ChatDetail.tsx 独立附件按钮区删除 (leftSlot / PlusActionsSheet 全删)
 *   - §⑤ autoTitle 跨 chat firedRef reset 修复 (chatId 变化时清 ref)
 *   - §⑥ 点赞 / 点砍删除, MessageMenu 退到 4 项
 *
 * gagaOS 2026-10-20 反馈 (0.7.5 hotfix 2):
 *   - §A 撤销 §②③④ — 附件入口应统一收在 `+` 按钮, 不再 inline 塞入 ChatInputBar
 *   - §B 恢复 PlusActionsSheet (chat/PlusActionsSheet.tsx) 6 项:
 *     图片 (image) / 文档 (document) / 表情 (emoji) / 知识库 (knowledge) /
 *     拍照 (camera) / 模板 (template, electron 未实现 → toast)
 *   - §C ChatInputBar 只保留 1 个 `+` 按钮 → onPlusClick → ChatDetail 弹 sheet
 *   - §D ChatDetail 自管 EmojiPicker / KnowledgeAttachSheet open 状态
 *   - §E 文件格式明确列出 (image: jpeg/png/gif/webp/svg/heic/bmp;
 *     document: pdf/doc/docx/xls/xlsx/ppt/pptx/txt/md)
 *
 * M3 批次 (2026-10-26):
 *   - A2-D4-02: `chunk.reasoning` → `message.phases` (思考 / 工具时间线数据通路)
 *   - A2-D4-06: `userImageUrls` 并集 → MessageList → MessageBubble.stripImageUrls
 *   - C4-08: 轮次终态 (`isTerminalDone`) → 「AI 回复到达」系统通知
 *     (仅窗口不在前台时弹; 取消帧 / error 帧不弹)
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
  autoTitleSession,
  listSessionDeliverables,
  createLibraryItem,
  createChat,
  type ChatMessage,
  type LibraryItem,
} from "../lib/api";
import { useToast } from "../components/ui/Toast";
import { useChatStream } from "../lib/sse";
import { notifyAiReplyArrived } from "../lib/chat-notifications";
import {
  isTerminalDone,
  isCancelFrame,
  isUserAbortError,
  UserAbortError,
  type ChatChunk,
  type CancelIntent,
} from "../lib/cancel";
import {
  uploadAttachment,
  deriveUploadMode,
  type UploadMode,
} from "../lib/upload";
import { MessageList, type ChatMessageModel } from "../components/chat/MessageList";
import {
  ChatInputBar,
  type ChatInputBarHandle,
  type PendingAttachment,
} from "../components/chat/ChatInputBar";
import {
  PlusActionsSheet,
  type PlusActionKind,
  PLUS_ACTION_ACCEPT,
} from "../components/chat/PlusActionsSheet";
import { EmojiPicker } from "../components/home/EmojiPicker";
import { KnowledgeAttachSheet } from "../components/chat/KnowledgeAttachSheet";
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
import { MoreIcon, PlusIcon } from "../components/ui/Glyphs";

// 0.7.5 ChatDetail P1 增量 — 新组件
import { ChatTopBanner } from "../components/chat/ChatTopBanner";
import { DeliverableStrip } from "../components/chat/DeliverableStrip";
import { ModelChips } from "../components/chat/ModelChips";
import type { CallTreeNode } from "../components/chat/CallTreeCard";
import type { ExecutionPhase } from "../components/chat/ExecutionTimeline";
import type { SlashCommand } from "../components/chat/SlashMenu";
import {
  HOME_FIRST_MESSAGE_KEY,
  HOME_ATTACHMENTS_KEY,
  type HomeAttachments,
} from "./Home";

// 标签 id — 临时 assistant message 用, server 真 messageId 回来后替换
function streamingId(): string {
  return `streaming-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * A2-D4-02 · thinking chunk 合并 ——
 * 相邻 thinking **就地拼接** (跟 web `chat/[id]/page.tsx:605-618` +
 * 安卓 `SsePipeline.WORK` 同款).
 *
 * ⚠️ 不合并的话, 一次思考会被切成 N 条短句 ⇒ 时间线显示「思考 20 次」,
 *    展开看到 20 条 ~5-10 字短句 (gaga 真机截图证据).
 */
function mergeThinkingPhase(
  phases: ExecutionPhase[],
  text: string,
  ts: number,
): ExecutionPhase[] {
  const last = phases[phases.length - 1];
  if (last && last.type === "thinking") {
    const next = phases.slice(0, -1);
    next.push({ ...last, text: (last.text ?? "") + text, ts });
    return next;
  }
  return [...phases, { type: "thinking", text, ts }];
}

// 附件上限 — 与 lib/upload.ts MAX_BYTES 对齐.
// uploadAttachment 的 size 校验是**同步 throw**, 不在 promise 链里, 所以调用点必须前置拦截.
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

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
  // A2-D4-02 · 思考 / 工具时间线 (流式累积 chunk.reasoning + tool 事件).
  // 合并策略跟 web `chat/[id]/page.tsx:605-618` + 安卓 SsePipeline.WORK 一致:
  //   相邻 thinking chunk **就地拼接** (不是每 chunk 一条) —— 否则时间线会显示
  //   "思考 20 次" 的短句列表, 而不是 1 条完整思考链.
  const [streamingPhases, setStreamingPhases] = useState<ExecutionPhase[]>([]);
  // onChunk 回调闭包里的 state 是**旧值** ⇒ 终态帧要拿「本轮完整正文 / phases」
  // 发通知 (C4-08) 必须走 ref 镜像.
  const streamingContentRef = useRef<string>("");
  const streamingPhasesRef = useRef<ExecutionPhase[]>([]);
  // C4-08: 通知标题 = 会话标题 (取不到 → 「新对话」), 同样走 ref.
  const chatTitleRef = useRef<string>("新对话");
  useEffect(() => {
    chatTitleRef.current = currentChat?.title || "新对话";
  }, [currentChat]);

  // A2-D4-06 · 本轮上传的图 URL (还没落进 history) ——
  //   新对话场景下首次发图的 URL 漏在 history 之外, AI 流里引用它时不会被剥.
  const [pendingUserImageUrls, setPendingUserImageUrls] = useState<string[]>([]);
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

  // 0.7.5 增量 — model 选择 (chat-id-31) / 知识库挂载 (chat-id-30) /
  //   流式起始时间戳 (chat-id-20) / call tree (chat-id-12) / phases 合并 (chat-id-35)
  const [activeModel, setActiveModel] = useState<string>("gawen");
  /** 已挂载知识库条目 (id + 标题) — 对齐 web attachedKnowledgeRefs
      (web `src/app/(main)/chat/[id]/page.tsx:279-281`) */
  const [pendingKnowledgeRefs, setPendingKnowledgeRefs] = useState<
    Array<{ id: string; title: string }>
  >([]);
  // 0.7.5 chat-id-12: call tree 节点 (走 React state 渲染)
  const [streamingCallTree, setStreamingCallTree] = useState<CallTreeNode[]>([]);
  // 这 ref 不进 useMemo, 仅 startStream 内部用
  const callTreeRef = useRef<CallTreeNode[]>([]);
  // ⚠️ M3 批次: 原 `streamingSinceState` / `streamingSinceRef` / `phaseTimelineRef`
  //   三个声明**从未被赋值** (grep 全仓 0 写入点) ⇒ 死代码。
  //   `streamingSince*` 随 `ExecutionTiming` → `ExecutionTimeline` 的替换一起删
  //   (A2-D4-02); `phaseTimelineRef` 由 `streamingPhases` state 取代 (A2-D4-02 数据通路).

  // 阶段 8 chat-id-13 — approval_request 累积. 任一按钮触发 → 清整张 banner.
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);

  // ────────────── 0.7.5 hotfix 2 (gaga 反馈 2026-10-20) — `+` 按钮 + sheet 流程 ──────────────
  // ChatInputBar 不再内置 4 个附件按钮, 只在 textarea 左侧放一个 `+` 按钮.
  //   点 `+` → onPlusClick → ChatDetail 把 plusOpen=true → 弹 PlusActionsSheet.
  //   选中某项 → handlePlusAction(kind) → 触发对应 file input / 弹 EmojiPicker / 弹 KB sheet / toast.
  // ChatInputBar 通过 ref 暴露 imperative handle:
  //   - inputBarRef.current.insertEmoji(emoji)  → EmojiPicker 选中后插入 cursor 位置
  //   - inputBarRef.current.addAttachment(att) → 文件上传完成后加 chip
  //   - inputBarRef.current.focus()            → EmojiPicker / KB sheet 关闭后拿回焦点
  const [plusOpen, setPlusOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const inputBarRef = useRef<ChatInputBarHandle | null>(null);
  // 三个隐藏 file input: image / document / camera. trigger 通过 imageInputRef.current.click().
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const documentInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  // 当前 sheet 选中的 kind → handleFileChange 拿到 File 后用它选 upload mode.
  const pendingUploadKindRef = useRef<UploadMode | null>(null);

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
    setStreamingPhases([]);
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
      // A2-D4-02 · 思考 / 工具时间线随消息下传 → ExecutionTimeline
      phases: streamingPhases,
    };
    return [...baseMessages, streamingMsg];
  }, [
    baseMessages,
    streamingAssistantId,
    streamingContent,
    streamingEvents,
    streamingPhases,
  ]);

  // chat-id-19 rerun 显示条件: 不在流式 + 历史非空 + 最后一条是 assistant.
  // (web 同款: 在最后一条 assistant 后留 rerun 入口)
  const canRerun = useMemo(() => {
    if (streamingAssistantId) return false;
    if (messages.length === 0) return false;
    const last = messages[messages.length - 1];
    return last.role === "assistant" && last.content.trim().length > 0;
  }, [streamingAssistantId, messages]);

  // =========================================================================
  // A2-D4-06 · 渲染层剥图: 当前 chat 中所有 user message 已上传过的 imageUrls 并集
  //
  //   - 数据源: 历史里 role==="user" 的 message.imageUrls (server metadata.image_urls,
  //     结构化字段) + 本轮上传的图 (pendingUserImageUrls).
  //   - 用途: 透传给 MessageList → MessageBubble.stripImageUrls, 在 assistant
  //     渲染前剥掉 AI 重复引用的 user 已发图 (**渲染层过滤**, 不改 prompt).
  //   - 用并集而不是「最近一条 user 的图」: 范围更稳; 即使 AI 引用了 session
  //     早期的图, 也会被剥掉, 不会出现「上下文变长后漏剥」的退化路径.
  //   - Set 去重, 但保留稳定顺序 (按 messages 出现顺序), 便于将来调试 diff.
  // =========================================================================
  const userImageUrls = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const m of baseMessages) {
      if (m.role !== "user") continue;
      for (const u of m.imageUrls ?? []) {
        if (!u || seen.has(u)) continue;
        seen.add(u);
        ordered.push(u);
      }
    }
    for (const u of pendingUserImageUrls) {
      if (!u || seen.has(u)) continue;
      seen.add(u);
      ordered.push(u);
    }
    return ordered;
  }, [baseMessages, pendingUserImageUrls]);

  // ────────────── SSE 启动 + chunk 处理 ──────────────

  const startStream = useCallback(
    async (text: string, attachments: PendingAttachment[]) => {
      if (!chatId) return;
      // 重置流式态
      const localAssistantId = streamingId();
      setStreamingAssistantId(localAssistantId);
      setStreamingContent("");
      setStreamingEvents([]);
      setStreamingPhases([]);
      streamingContentRef.current = "";
      streamingPhasesRef.current = [];
      setStreamError(null);
      setWaitingFirstFrame(true);
      // 新一轮触发 → 清空旧 session 的 pending approvals (不再 stale)
      clearPendingApprovals();

      // image 端点 (/yinian/upload) 不返 fileId; document 端点 (/yinian/documents)
      // url + fileId 都有 → 按 fileId 有无分流, 否则文档会同时进 image_urls 和
      // attached_file_ids, 被当图片重复投喂。
      const imageUrls = attachments
        .filter((a) => !!a.url && !a.fileId)
        .map((a) => a.url as string);
      const fileIds = attachments
        .filter((a) => !!a.fileId)
        .map((a) => a.fileId as string);

      // A2-D4-06: 本轮上传的图 URL 也要进剥图并集 (还没落进 history)
      if (imageUrls.length > 0) {
        setPendingUserImageUrls((prev) => {
          const merged = [...prev];
          for (const u of imageUrls) if (!merged.includes(u)) merged.push(u);
          return merged;
        });
      }

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
              streamingContentRef.current += chunk.content;
              setStreamingContent((prev) => prev + chunk.content);
            }
            // A2-D4-02 · 思考链 → phases (相邻 thinking 就地拼接)
            if (chunk.reasoning) {
              streamingPhasesRef.current = mergeThinkingPhase(
                streamingPhasesRef.current,
                chunk.reasoning,
                Date.now(),
              );
              setStreamingPhases(streamingPhasesRef.current);
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
              // gagaOS §⑥ — 点赞 / 点砍整体删除; server 即便推 'feedback' 事件也丢弃
              //   (跟 Phase 1 server 协议不接 /messages/:id/feedback 一致)
              if (type === "feedback") {
                return;
              }
              setStreamingEvents((prev) => [...prev, ev]);
              // A2-D4-02 · tool 事件同时进 phases 时间线 (跟 web page.tsx:648-655 同款)
              streamingPhasesRef.current = [
                ...streamingPhasesRef.current,
                { type: "tool", event: ev, ts: Date.now() },
              ];
              setStreamingPhases(streamingPhasesRef.current);
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
                  // gagaOS §⑥ — 点赞/点砍删除, feedback 事件丢弃
                  continue;
                }
                kept.push(ev);
              }
              if (kept.length > 0) {
                setStreamingEvents((prev) => [...prev, ...kept]);
                // A2-D4-02 · tool 事件同时进 phases 时间线
                for (const ev of kept) {
                  streamingPhasesRef.current = [
                    ...streamingPhasesRef.current,
                    { type: "tool", event: ev, ts: Date.now() },
                  ];
                }
                setStreamingPhases(streamingPhasesRef.current);
              }
            }
            if (isTerminalDone(chunk)) {
              // 终态 → 立即用 server messageId 替换本地临时 id
              const serverId = chunk.messageId!;
              // C4-08 · 「AI 回复到达」系统通知 ——
              //   仅窗口不在前台时弹 (主进程算 isFocused, 不用 document.hidden).
              //   取消帧 / error 帧不走这里 ⇒ 用户按停止时**不**通知
              //   (gaga 口径: 打断 = 彻底丢弃产出).
              void notifyAiReplyArrived({
                chatId,
                chatTitle: chatTitleRef.current,
                content: chunk.fullContent ?? streamingContentRef.current,
                phases: streamingPhasesRef.current,
              });
              setStreamingAssistantId((cur) => (cur === localAssistantId ? null : cur));
              setStreamingContent("");
              setStreamingEvents([]);
              setStreamingPhases([]);
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
              setStreamingPhases([]);
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
              setStreamingPhases([]);
            }
          },
        });
      } catch (err) {
        // user abort → 静默关闭, 不弹错误
        if (isUserAbortError(err) || err instanceof UserAbortError) {
          setStreamingAssistantId((cur) => (cur === localAssistantId ? null : cur));
          setStreamingContent("");
          setStreamingEvents([]);
          setStreamingPhases([]);
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
        setStreamingPhases([]);
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

  // 置顶 mutation — header ⋮ 菜单按 web 只保留「重命名 / 删除会话」两项,
  // 这里保留 hook 供 chat 列表页 / 后续入口复用 (web 对标: Header.tsx:227-239).
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

  // 0.7.5 chat-id-25: `/new` slash 命令派发用 — 跟 Home createChat mutation 同款.
  const createChatMutation = useMutation({
    mutationFn: () => createChat(),
    onSuccess: (chat) => {
      navigate(`/chat/${chat.id}`);
    },
    onError: (err) => {
      toast({
        message: `创建对话失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });

  // 组件卸载 → abort 但不 userStopped (跟 web 一致, 让流自然跑完落库)
  useEffect(() => {
    return () => {
      stream.abort("navigate");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ────────────── home-13 firstMessage 自动 send ──────────────
  // Home worker (f93e98e 0.7.2) 写入 sessionStorage 两个 key 后 navigate('/chat/:id').
  // ChatDetail mount 时消费: 拿到 chatId 后读 storage → 拼 attachments + 文本
  // → 调 handleSubmit 启动流式 → 清 storage (避免重入). 5 行核心 + 防御.
  const autoSendFiredRef = useRef(false);
  useEffect(() => {
    if (!chatId) return;
    if (autoSendFiredRef.current) return;
    if (typeof window === "undefined" || !window.sessionStorage) return;
    let firstMessage: string | null = null;
    let attachments: HomeAttachments | null = null;
    try {
      firstMessage = window.sessionStorage.getItem(HOME_FIRST_MESSAGE_KEY);
      const rawAtt = window.sessionStorage.getItem(HOME_ATTACHMENTS_KEY);
      if (rawAtt) attachments = JSON.parse(rawAtt) as HomeAttachments;
    } catch {
      /* storage 不可用 — 静默, 不阻断 */
    }
    if (!firstMessage || firstMessage.trim().length === 0) return;
    autoSendFiredRef.current = true;
    try {
      window.sessionStorage.removeItem(HOME_FIRST_MESSAGE_KEY);
      window.sessionStorage.removeItem(HOME_ATTACHMENTS_KEY);
    } catch {
      /* ignore */
    }
    queueMicrotask(() => {
      const pending: PendingAttachment[] = [];
      if (attachments) {
        for (const url of attachments.imageUrls ?? []) {
          pending.push({ url, name: "图片" });
        }
        for (const fileId of attachments.attachedFileIds ?? []) {
          const found = attachments.attachedFileNames?.find((n) => n.fileId === fileId);
          pending.push({ fileId, name: found?.name ?? "附件" });
        }
      }
      const ok = handleSubmit(firstMessage!, pending);
      if (ok === false) {
        autoSendFiredRef.current = false;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // ────────────── chat-id-33 autoTitleSession (LLM 800ms delay) — gagaOS §⑤ ──────────────
  // 跟 web page.tsx:341-396 同款: history load 完 + 800ms 后发一次 autoTitle.
  // 触发条件 (跟 web shouldRequestAutoTitle 同款, 更宽松):
  //   - title 为空 / 默认 '新对话' / 截断产物 '…' → 触发
  //   - 其他 (用户手动改 / LLM 已定型) → skip
  // 关键修复 (gagaOS §⑤):
  //   1. 跨 chat 切换时重置 firedRef (上一个 chat 已 fired 后 ref 仍为 true 会卡死新 chat)
  //   2. fetchQuery with staleTime: 0 拿 fresh title (避免被 stale chats cache 卡死)
  //   3. server 拿到新 ChatSession 后 invalidate ["chats"] 让 header title 自动更新
  //   4. 失败静默 (console.warn only) — 第一次会话体验差会被 toast 干扰
  const autoTitleFiredRef = useRef(false);
  const lastAutoTitleChatRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastAutoTitleChatRef.current !== chatId) {
      autoTitleFiredRef.current = false;
      lastAutoTitleChatRef.current = chatId ?? null;
    }
  }, [chatId]);

  useEffect(() => {
    if (!chatId) return;
    if (autoTitleFiredRef.current) return;
    if (!historyQuery.data || historyQuery.isLoading) return;
    const msgs = historyQuery.data.messages;
    if (msgs.length < 1) return; // 至少 1 条消息 (server 端 autoTitleChatSession 要求有 firstUserMsg)
    const firstUser = msgs.find((m) => m.role === "user");
    if (!firstUser || firstUser.content.trim().length === 0) return;
    autoTitleFiredRef.current = true;
    const t = window.setTimeout(() => {
      // 跟 web 同款: fetchQuery with staleTime: 0 拿 fresh title, 不被 stale chats cache 卡.
      queryClient
        .fetchQuery({ queryKey: ["chats"], queryFn: getChats, staleTime: 0 })
        .then((latest) => {
          const fresh = latest.chats.find((c) => c.id === chatId);
          const liveTitle = fresh?.title ?? currentChat?.title ?? "新对话";
          // 跟 web shouldRequestAutoTitle 同款守卫
          const shouldRequest =
            !liveTitle ||
            liveTitle.trim() === "" ||
            liveTitle === "新对话" ||
            liveTitle.endsWith("…");
          if (!shouldRequest) return;
          return autoTitleSession(chatId)
            .then(() => {
              queryClient.invalidateQueries({ queryKey: ["chats"] });
            })
            .catch((err) => {
              // eslint-disable-next-line no-console
              console.warn("[autoTitle] failed:", err);
            });
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("[autoTitle] fetchQuery failed:", err);
        });
    }, 800);
    return () => window.clearTimeout(t);
  }, [chatId, historyQuery.data, historyQuery.isLoading, currentChat, queryClient]);

  // ────────────── chat-id-29 Session 交付物 (供 DeliverableStrip 用) ──────────────
  const deliverablesQuery = useQuery({
    queryKey: ["deliverables", chatId],
    queryFn: () => listSessionDeliverables(chatId!, 20),
    enabled: !!chatId,
    staleTime: 30_000,
  });

  // ────────────── 渲染 ──────────────

  if (!chatId) {
    return <div className="p-8 text-fg-muted">无效的对话 id</div>;
  }

  const title = currentChat?.title || "新对话";
  const isStreaming = !!streamingAssistantId;

  // Header ⋮ DropdownMenu items — 阶段 8 chat-id-1
  // 对齐 web `Header.tsx:227-239`: 只有「重命名 / 删除会话」两项.
  const headerMenuItems: DropdownMenuItem[] = [
    {
      label: "重命名",
      onClick: () => {
        setRenameValue(title === "新对话" ? "" : title);
        setRenameOpen(true);
      },
    },
    {
      label: "删除会话",
      destructive: true,
      onClick: () => setConfirmDeleteOpen(true),
    },
  ];

  // ────────────── 知识库挂载 — chat-id-30 ──────────────
  // 0.7.5 hotfix 2 — ChatDetail 自管 KnowledgeAttachSheet open 状态 (不再让
  //   ChatInputBar 内部持有). 选中 item.id 累积到 pendingKnowledgeRefs
  //   (chip 提示 user 已挂载, 跟 web 同款). PlusActionsSheet → knowledge action
  //   → setKnowledgeOpen(true) → KnowledgeAttachSheet onPick → 这里.
  /** 多选确认 — web 语义: 点「完成 (N)」一次性回传本次勾选的 items */
  const handleKnowledgeConfirm = useCallback(
    (items: LibraryItem[]) => {
      setPendingKnowledgeRefs((prev) => {
        const next = [...prev];
        for (const it of items) {
          if (!next.some((r) => r.id === it.id)) {
            next.push({ id: it.id, title: it.title || "" });
          }
        }
        return next;
      });
      // A2-D3-02 — 把知识库 marker 注入输入框 (server 未识别 knowledge_refs 时的兜底通道)
      //   对齐 web `src/app/(main)/chat/[id]/page.tsx:1124-1129` (chatInputRef.insertText
      //   → 多个 marker 换行分隔, 用户后续可在输入框编辑).
      //   PC 的 ChatInputBar handle 暴露 insertText (与 insertEmoji 同实现, 按光标插入)。
      if (items.length > 0) {
        const markerText = items
          .map((it) => `@[library:${it.id}] ${it.title || "未命名"}`)
          .join("\n");
        inputBarRef.current?.insertText(markerText);
      }
      toast({
        message: `已挂载 ${items.length} 条知识库`,
        variant: "default",
      });
    },
    [toast],
  );

  /** 移除一条已挂载的知识库引用 */
  const handleRemoveAttachedRef = useCallback((id: string) => {
    setPendingKnowledgeRefs((prev) => prev.filter((r) => r.id !== id));
  }, []);

  // ────────────── 0.7.5 hotfix 2 — PlusActionsSheet 派发 + 文件上传 ──────────────
  // 选中 PlusActionsSheet 某项 → handlePlusAction(kind):
  //   - image     → 触发 image file input → 上传 (mode=image) → chip 加进 ChatInputBar
  //   - document  → 触发 document file input → 上传 (mode=document) → chip 加进 ChatInputBar
  //   - camera    → 触发 camera file input (capture=environment) → 上传 (mode=image)
  //   - emoji     → 弹 EmojiPicker → 选中 → inputBarRef.current.insertEmoji(emoji)
  //   - knowledge → 弹 KnowledgeAttachSheet → 选中 → handleKnowledgePick 累积
  //   - template  → toast "模板功能即将推出" (electron 端未实现, 跟 web 同款)
  const triggerUpload = useCallback(
    (kind: "image" | "document" | "camera") => {
      if (streamingAssistantId) {
        toast({
          message: "流式生成中,无法上传新附件,请等上一轮结束",
          variant: "warning",
        });
        return;
      }
      pendingUploadKindRef.current =
        kind === "document" ? "document" : "image";
      // 80ms delay 让 sheet 先关, 再 click file input (避免同时两个 dialog 抢焦点)
      window.setTimeout(() => {
        const ref =
          kind === "image"
            ? imageInputRef
            : kind === "document"
            ? documentInputRef
            : cameraInputRef;
        ref.current?.click();
      }, 80);
    },
    [streamingAssistantId, toast],
  );

  const handlePlusAction = useCallback(
    (kind: PlusActionKind) => {
      // PlusActionsSheet 自己关闭 onClose (BottomSheet 内置), 这里 dispatch
      switch (kind) {
        case "image":
          triggerUpload("image");
          break;
        case "document":
          triggerUpload("document");
          break;
        case "camera":
          triggerUpload("camera");
          break;
        case "emoji":
          window.setTimeout(() => {
            setEmojiOpen(true);
            // 关 sheet 后拿回 textarea 焦点
            inputBarRef.current?.focus();
          }, 80);
          break;
        case "knowledge":
          window.setTimeout(() => {
            setKnowledgeOpen(true);
            inputBarRef.current?.focus();
          }, 80);
          break;
        case "template":
          toast({ message: "模板功能即将推出", variant: "default" });
          break;
      }
    },
    [triggerUpload, toast],
  );

  // 文件 input change handler — 上传 → 调 inputBarRef.current.addAttachment(att)
  //   让 ChatInputBar 把 chip 渲染出来 (ChatInputBar 仍持有 chips/状态/progress).
  //   image/document 走 upload.ts 的 uploadAttachment, 复用 web gacode-web 同条路径.
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      // 清 value 让同名文件二次选择仍能触发
      e.target.value = "";
      if (!f) return;
      if (streamingAssistantId) {
        toast({
          message: "流式生成中,无法上传新附件,请等上一轮结束",
          variant: "warning",
        });
        return;
      }
      const mode = pendingUploadKindRef.current ?? deriveUploadMode(f);
      pendingUploadKindRef.current = null;
      // uploadAttachment 的 50MB 校验是同步 throw (不在 promise 链内), 必须前置拦截,
      // 否则异常冒出 handleFileChange 走不到 .catch → toast 不显示 (点了没反应).
      if (f.size > MAX_ATTACHMENT_BYTES) {
        toast({
          message: `文件超过 50MB 上限 (${Math.round(f.size / 1024 / 1024)}MB)`,
          variant: "danger",
        });
        return;
      }
      try {
        uploadAttachment(f, { mode })
          .promise.then((res) => {
            if (!res.url && !res.fileId) {
              toast({ message: "未拿到附件信息", variant: "danger" });
              return;
            }
            inputBarRef.current?.addAttachment({
              url: res.url,
              fileId: res.fileId,
              name: f.name,
            });
          })
          .catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg === "aborted" || msg.includes("aborted")) return;
            // upload.ts 已按 mode 输出人话文案 ("图片上传失败: ..."), 这里不再二次加前缀
            toast({ message: msg, variant: "danger" });
          });
      } catch (err) {
        // 同步 throw 兜底 (uploadAttachment 在建 XHR 前的校验), 同样透传人话文案
        toast({
          message: err instanceof Error ? err.message : String(err),
          variant: "danger",
        });
      }
    },
    [streamingAssistantId, toast],
  );

  // EmojiPicker 选中 → 调 inputBarRef.current.insertEmoji(emoji) 让 ChatInputBar
  //   在 textarea 光标处插入 (不破坏现有 selection, 跟 web 同款).
  const handleEmojiSelect = useCallback((emoji: string) => {
    inputBarRef.current?.insertEmoji(emoji);
    setEmojiOpen(false);
  }, []);

// ────────────── Slash 命令派发 (chat-id-25) ──────────────
  // 13 条命令的客户端路由:
  //   - translate / summary → 已由 ChatInputBar 自处理 (insert 中文模板)
  //   - clear              → 已由 ChatInputBar 自处理 (清 chips)
  //   - image / file / camera / knowledge → 0.7.5 hotfix 2: 路由到 handlePlusAction,
  //     跟 `+` 按钮流程同源 (触发 file input 或弹对应 sheet).
  //   - search / template / favorite / voice → 保留 no-op / SlashMenu 自带 supported=false 占位
  //   - new → 触发 createChat + navigate 到新 chat
  //   - save → 把最近一条 assistant 消息保存到知识库 (chat-id-15 fallback 路径)
  const handleSlashCommand = useCallback(
    (cmd: SlashCommand) => {
      switch (cmd) {
        case "image":
          // 0.7.5 hotfix 2: `/image` 走 handlePlusAction("image") 走 file input
          handlePlusAction("image");
          break;
        case "file":
          // `/file` 走 handlePlusAction("document") 走 file input
          handlePlusAction("document");
          break;
        case "camera":
          // `/camera` 走 handlePlusAction("camera") 走 capture file input
          handlePlusAction("camera");
          break;
        case "knowledge":
          // `/knowledge` 走 handlePlusAction("knowledge") 弹 KnowledgeAttachSheet
          handlePlusAction("knowledge");
          break;
        case "new":
          // 走 createChat mutation (跟 ChatList / Home 同款)
          createChatMutation.mutate();
          break;
        case "save": {
          // 找最近一条 assistant 消息, 调 createLibraryItem (跟 MessageMenu.handleSaveToKnowledge
          // 同款). 失败 toast, 成功 toast.
          const lastAssistant = [...messages]
            .reverse()
            .find((m) => m.role === "assistant" && m.content && !m.recalled);
          if (!lastAssistant) {
            toast({ message: "暂无可保存的助手消息", variant: "warning" });
            return;
          }
          const titleBase =
            lastAssistant.content.trim().slice(0, 30) || "未命名消息";
          createLibraryItem({
            type: "doc",
            title: titleBase,
            tags: ["from-chat"],
          })
            .then(() => {
              toast({ message: "已保存到知识库", variant: "success" });
            })
            .catch((err) => {
              toast({
                message: `保存失败: ${err instanceof Error ? err.message : String(err)}`,
                variant: "danger",
              });
            });
          break;
        }
        case "search":
        case "template":
        case "favorite":
        case "voice":
        case "clear":
        case "translate":
        case "summary":
          // 已在 ChatInputBar / SlashMenu 内部处理, 这里兜底 no-op
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, toast, createChatMutation, handlePlusAction],
  );

  // gagaOS §②④ hotfix 2 — `+` 按钮 + 弹层流程全部由 ChatDetail 自管 (PlusActionsSheet /
  //   EmojiPicker / KnowledgeAttachSheet). pendingKnowledgeRefs chip 提示保留在
  //   ChatDetail 渲染层 (输入栏上方), 由 KnowledgeAttachSheet onPick → handleKnowledgePick
  //   把 item.id 累积到这里.

  return (
    <div className="h-full flex flex-col bg-bg-base">
      {/* 头部 — 阶段 8 chat-id-1: 重命名 + 完整 ⋮ 菜单 + 0.7.5 chat-id-31 ModelChips
          对齐 web `Header.tsx:174` — h-14 sticky + border-b + bg-background */}
      <div className="shrink-0 h-14 px-4 bg-background border-b border-border flex items-center gap-2">
        <div className="flex-1 truncate font-medium min-w-0" title={title}>
          {title}
        </div>
        {/* chat-id-31: 顶部 model 切换 chips */}
        <ModelChips
          active={activeModel}
          onChange={setActiveModel}
          disabled={isStreaming}
        />
        {/* 对齐 web Header.tsx:204-212 — 右侧「+ 新建聊天」圆形按钮 */}
        <button
          type="button"
          aria-label="新建聊天"
          disabled={createChatMutation.isPending}
          onClick={() => createChatMutation.mutate()}
          className="w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors duration-150 inline-flex items-center justify-center disabled:opacity-50"
        >
          <PlusIcon className="w-5 h-5" />
        </button>
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

      {/* 0.7.5 chat-id-28: 顶部 banner — 断网 / 网关版本不一致 */}
      <ChatTopBanner />

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
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="flex justify-start">
              <div className="animate-pulse rounded-2xl bg-muted h-20 w-3/4" />
            </div>
            <div className="flex justify-end">
              <div className="animate-pulse rounded-2xl bg-muted h-16 w-1/2" />
            </div>
            <div className="flex justify-start">
              <div className="animate-pulse rounded-2xl bg-muted h-24 w-2/3" />
            </div>
            <div className="flex justify-start">
              <div className="animate-pulse rounded-2xl bg-muted h-12 w-1/3" />
            </div>
          </div>
        ) : (
          <MessageList
            messages={messages}
            streamingAssistantId={streamingAssistantId}
            onMessageAction={handleMessageAction}
            stripImageUrls={userImageUrls}
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

      {/* 0.7.5 chat-id-29: Session 交付物缩略条 (卡片跳交付详情 — chat-id-32) */}
      <DeliverableStrip items={deliverablesQuery.data?.items ?? []} />

      {/* gagaOS §② — 知识库挂载 chip — 对齐 web chat/[id]/page.tsx:1311-1331:
          brand-cyan 描边 chip + 逐条可移除 */}
      {pendingKnowledgeRefs.length > 0 ? (
        <div className="mx-auto max-w-3xl w-full px-4 pb-2">
          <div className="flex flex-wrap gap-2">
            {pendingKnowledgeRefs.map((r) => (
              <span
                key={r.id}
                data-testid="attached-knowledge-ref"
                data-ref-id={r.id}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-brand-cyan/40 bg-brand-cyan/10 text-xs text-brand-cyan"
                title={r.title || r.id}
              >
                <span className="font-medium">📚</span>
                <span className="max-w-[160px] truncate">{r.title || r.id}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachedRef(r.id)}
                  aria-label={`移除已挂载条目 ${r.title || r.id}`}
                  data-testid="attached-knowledge-ref-remove"
                  className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded text-brand-cyan/70 hover:text-brand-cyan hover:bg-brand-cyan/20 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* 输入栏 — chat-id-19 加 canRerun + onRerun. 0.7.5 hotfix 2 — 单一 `+` 按钮
          替代原本 4 个 inline 附件按钮. `+` → onPlusClick → ChatDetail 弹 PlusActionsSheet.
          ChatInputBar 通过 ref 暴露 insertEmoji / addAttachment / focus.
          外层容器对齐 web ChatInput.tsx:63-84 — 底边线 + p-4 + bg-background, 内部限宽居中. */}
      <div className="border-t border-border p-4 bg-background">
        <div className="max-w-3xl mx-auto">
          <ChatInputBar
            ref={inputBarRef}
            isStreaming={isStreaming}
            canRerun={canRerun}
            onRerun={handleRerun}
            onStop={handleStop}
            onSubmit={handleSubmit}
            onPlusClick={() => setPlusOpen(true)}
            onSlashCommand={handleSlashCommand}
            onAttachmentError={(msg) =>
              toast({ message: `上传失败: ${msg}`, variant: "danger" })
            }
            onSubmitNotice={(message, variant) => toast({ message, variant })}
          />
        </div>
      </div>

      {/* 0.7.5 hotfix 2 — `+` 按钮触发 6 项 action sheet (image / document / emoji /
          knowledge / camera / template). 选中 → handlePlusAction(kind) 派发. */}
      <PlusActionsSheet
        open={plusOpen}
        onClose={() => setPlusOpen(false)}
        onAction={handlePlusAction}
      />

      {/* 0.7.5 hotfix 2 — EmojiPicker 浮层 (复用 components/home/EmojiPicker.tsx).
          选中 → handleEmojiSelect → inputBarRef.current.insertEmoji(emoji)
          在 textarea 光标处插入. */}
      <EmojiPicker
        open={emojiOpen}
        onClose={() => {
          setEmojiOpen(false);
          inputBarRef.current?.focus();
        }}
        onSelect={handleEmojiSelect}
      />

      {/* 0.7.5 hotfix 2 — KnowledgeAttachSheet 浮层 (复用 components/chat/KnowledgeAttachSheet.tsx).
          选中 → handleKnowledgePick 累积 item.id 到 pendingKnowledgeRefs. */}
      <KnowledgeAttachSheet
        open={knowledgeOpen}
        onClose={() => {
          setKnowledgeOpen(false);
          inputBarRef.current?.focus();
        }}
        onConfirm={handleKnowledgeConfirm}
      />

      {/* 0.7.5 hotfix 2 — 三个隐藏 file input, 触发走 handleFileChange.
          accept 跟 PlusActionsSheet 描述对齐 (PLUS_ACTION_ACCEPT). */}
      <input
        ref={imageInputRef}
        type="file"
        hidden
        accept={PLUS_ACTION_ACCEPT.image}
        onChange={handleFileChange}
        data-testid="file-input-image"
      />
      <input
        ref={documentInputRef}
        type="file"
        hidden
        accept={PLUS_ACTION_ACCEPT.document}
        onChange={handleFileChange}
        data-testid="file-input-document"
      />
      <input
        ref={cameraInputRef}
        type="file"
        hidden
        accept={PLUS_ACTION_ACCEPT.camera}
        // capture="environment" → Electron Chromium 调起相机 (Windows 多 fallback 到 image picker)
        capture="environment"
        onChange={handleFileChange}
        data-testid="file-input-camera"
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
          title="删除会话?"
          message={`将删除「${title || "新对话"}」及其全部消息, 此操作不可撤销.`}
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
          title="重命名会话"
          message="修改当前对话的标题, 影响侧边栏列表和顶部标题显示。"
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
// gagaOS 2026-10-20 §B — PlusActionsSheet 已重新引入, 由 ChatDetail 自管, 通过
//   inputBarRef + onPlusClick 跟 ChatInputBar 协同. PlusGlyph 现在住在 ChatInputBar
//   内部 (`+` 按钮的图标), 不再在 ChatDetail 这边.