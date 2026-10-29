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
  createLibraryItem,
  createChat,
  getStreamState,
  submitApprovalDecisionOutcome,
  type ApprovalAction,
  type ChatMessage,
  type LibraryItem,
  type StreamState,
} from "../lib/api";
import { useToast } from "../components/ui/Toast";
import { useChatStream } from "../lib/chat-stream";
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
import { ApprovalBanner } from "../components/chat/ApprovalBanner";
// ★ 待审批列表的本机落点 (契约 L-21 / L-32a / L-32b / 任务书 P-6 / P-11 / P-12)。
//   `ApprovalRequest` 的**唯一定义**在 lib 里 —— 组件与页面都从这儿取,
//   ⛔ 不写第二份同型 interface (组件那份改成 re-export)。
import {
  addPendingApproval as appendPendingApproval,
  removePendingApproval as dropPendingApproval,
  loadPendingApprovals,
  savePendingApprovals,
  type ApprovalRequest,
} from "../lib/chat-pending-approvals";
// ★ 裁决结果的**纯分类** (契约 L-26 ~ L-30 / 任务书 P-14) —— 409 ⇒ conflict
//   (收卡不报错), 不是 error。抠成零依赖纯函数 ⇒ 断言脚本能在运行时验证。
import { classifyApprovalDecision } from "../lib/chat-approval-decision";
// ★ 契约判别联合 + 旧协议双写去重 (契约 L-14 ~ L-18 / 任务书 P-8 / P-9 / P-13)。
import {
  dedupeRichEvents,
  type RichEventBase,
} from "../lib/rich-events";
// ★ a4 契约 v1 · 交付物删除推送 —— 「顶层字段 `deletedDeliverables`」的帧解析。
//   ⛔ 不写第三份 SSE 帧解析器 —— 复用共享零件 `lib/chat-sse.ts` 的
//     `parseDeletedDeliverables` (只认顶层字段, 不碰游标)。
import { parseDeletedDeliverables } from "../lib/chat-sse";
// =========================================================================
// ★ 重构轮 R2-web · 「端侧续传中枢」(src/lib/sse/) —— 唯一的一套轮次状态机
// ---------------------------------------------------------------------------
// 这个页面**不再自己发明**续传语义:
//   · 状态机 / 轮次记录 / seq 幂等 / 降级闭环 / 终态分类 —— 全部在 `src/lib/sse/` 里
//     (与 web / 安卓**逐字一致**的定稿版, PC 只抄不改)。
//   · 页面只做三件事: ① 把现实事件翻译成状态机事件 ② 把状态映射成 UI
//     ③ 提供端口 (网络 / 存储的实现)。
// =========================================================================
import {
  createEntryController,
  type StreamStateProbe,
} from "../lib/sse/entry";
import {
  emptyTurnRecord,
  type TurnFrameLike,
  type TurnSummaryLike,
} from "../lib/sse/turn-record";
import { type SeqFrameLike } from "../lib/sse/seq-guard";
import {
  OUTPUT_FILTER_HIT_CODE,
  presentTerminal,
  type TerminalReason,
} from "../lib/sse/terminal";
import { type ServerSnapshotLike } from "../lib/sse/degrade";
// ★ 轮次记录的**存储端口实现** (PC 用 localStorage —— 选型理由见
//   `src/lib/turn-record-store.ts` 的文件头注释)。
import { turnRecordStore } from "../lib/turn-record-store";
// ★ a4 契约 v1 · 交付物可见性判据 (W-3 / H-1 / H-2 / H-3 / H-9) ——
//   判据只写一遍 (纯函数), 页面层只接线, ⛔ 不在 JSX 里 inline 判据。
import {
  filterDeletedDeliverableEvents,
  filterDeletedDeliverablePhases,
} from "../lib/deliverable-visibility";
// ★ a4 契约 v1 · 「已删除交付物」集合的本机落点 (W-2 / H-5 / H-6)。
import {
  pruneDeletedDeliverables,
  readDeletedDeliverables,
  recordDeletedDeliverables,
} from "../lib/deliverable-deleted-store";
// ★ 当前登录用户 —— 交付物集合**按用户隔离** (H-6)。
import { useAuth } from "../lib/auth";
// ★ 跟进控制器 + 游标决策 (契约 L-33 / L-34 / L-58 / L-60)。
import {
  createFollowController,
  decideAttachCursor,
  type FollowController,
} from "../lib/sse-follow";
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
 * ★ 重构轮 R2-web (T-16) —— **端侧不再合并 thinking**。
 *
 * ⛔ 原来这里有个 `mergeThinkingPhase` (相邻 thinking 就地拼接) —— **删掉了**:
 *   「该合成几条」是**服务端**的决定 (v2 落库的 `phases_json` 已是合并形态),
 *   端侧再合并一次 = 把服务端刻意分开的思考段粘回去 ⇒ 「思考 N 次」次数漂移
 *   (gaga 真机截图证据: 🧠 思考 20 次 · 工具 0 次)。
 *   ⇒ 累积层**原样各占一条**; 合并只发生在**渲染层**的那一处兼容分支
 *     (`src/lib/sse/turn-record.ts` 的 `renderPhases`, `authoritative=false` 时才合并;
 *      ⚠️ 兼容分支待下线 R5 —— 老服务端 v1 的 raw 数据靠它兜)。
 *
 * ⚠️ 老服务端 (v1) 下 `renderPhases` 的兼容分支会把相邻 thinking 合成一条 ⇒
 *   观感与删掉之前**一致** (不合并的话, 一次思考被切成 N 条短句)。
 */

// ────────────────────────────────────────────────────────────
// ★ 适配层 (G-3 一处真值) —— 宿主的 `ChatChunk` ↔ 状态机的 `TurnFrameLike`
//
//   `src/lib/sse/` 里的类型是**自包含**的 (不引宿主工程的 `RichEventBase`),
//   所以页面这一层要做**双向适配** —— 适配点集中在这三个函数里,
//   别的地方不许再出现第二份字段映射。
// ────────────────────────────────────────────────────────────

/**
 * toProbe —— 把服务端的 `stream-state` 响应适配成「端侧续传中枢」的探测形态。
 *
 * ⚠️ **v2 扩展键 (lastSeq / elapsedMs / toolCallCount / …) 老服务端一个都没有**
 *   ⇒ 一律 null ⇒ 上层走本地兜底 (契约 §2.3 兜底表)。
 */
function toProbe(state: StreamState): StreamStateProbe {
  return {
    reachable: true,
    running: state.running,
    canAttach: state.canAttach,
    turnKey: state.turnKey,
    lastEventId: state.lastEventId,
    pendingApprovals: state.pendingApprovals,
    // ── v2 扩展键: 老服务端没有 ⇒ null (上层走兜底) ──
    lastSeq: null,
    turnState: state.phase,
    upstreamAlive: state.running,
    snapshotAvailable: null,
    completeness: null,
    startedAt: null,
    elapsedMs: null,
    toolCallCount: null,
    thinkingCount: null,
  };
}

/**
 * toTurnFrame —— 把服务端的 `ChatChunk` 适配成「端侧续传中枢」的帧形态。
 *
 * ⚠️ 适配点集中在这里 (G-3 一处真值) —— `src/lib/sse/` 里的类型自包含,
 *   不引宿主工程的 `RichEventBase` (那个联合会随契约演进变化)。
 */
function toTurnFrame(chunk: ChatChunk): TurnFrameLike & SeqFrameLike {
  return {
    content: chunk.content ?? null,
    reasoning: chunk.reasoning ?? null,
    event: (chunk.event as unknown as Record<string, unknown>) ?? null,
    events: (chunk.events as unknown as Record<string, unknown>[]) ?? null,
    // ★ v2: 服务端显式发的轮次序号 (T-09 幂等主键)。
    //   ⚠️ web 定稿版的 `toTurnFrame` **漏了这一项** ⇒ 跳号判定在生产里永远不生效
    //     (帧没有 seq ⇒ 状态机只能按 SSE 游标判重复)。PC 补上 (本批唯一的**行为**分歧,
    //     报告 §6 有说明)。
    seq: chunk.seq ?? null,
    startedAt: chunk.startedAt ?? null,
    elapsedMs: chunk.elapsedMs ?? null,
    toolCallCount: chunk.toolCallCount ?? null,
    thinkingCount: chunk.thinkingCount ?? null,
    done: chunk.done ?? null,
    messageId: chunk.messageId ?? null,
    cancelled: chunk.cancelled ?? null,
    error: chunk.error ?? null,
    code: chunk.code ?? null,
    terminalReason: chunk.terminalReason ?? null,
  };
}

/**
 * toChatChunk —— 把「端侧续传中枢」的帧形态适配回宿主的 `ChatChunk`。
 *
 * ⚠️ 这是**反向适配** (toTurnFrame 的镜像) —— 状态机给的是自包含类型,
 *   渲染层要的是宿主类型 ⇒ 适配点集中在这里 (G-3 一处真值)。
 */
function toChatChunk(frame: TurnFrameLike & SeqFrameLike): ChatChunk {
  return {
    content: frame.content ?? undefined,
    reasoning: frame.reasoning ?? undefined,
    event: (frame.event as unknown as RichEventBase) ?? undefined,
    events: (frame.events as unknown as RichEventBase[]) ?? undefined,
    // ⚠️ `ChatChunk.seq` 是 **number** (跟 web 定稿版同一形状) ⇒ 字符串形态的
    //   seq 在反向适配里丢掉 (正向适配 `toTurnFrame` 原样保留)。
    seq: typeof frame.seq === "number" ? frame.seq : undefined,
    startedAt: frame.startedAt ?? undefined,
    elapsedMs: frame.elapsedMs ?? undefined,
    toolCallCount: frame.toolCallCount ?? undefined,
    thinkingCount: frame.thinkingCount ?? undefined,
    done: frame.done ?? undefined,
    messageId: frame.messageId ?? undefined,
    cancelled: frame.cancelled ?? undefined,
    error: frame.error ?? undefined,
    code: frame.code ?? undefined,
    terminalReason: frame.terminalReason ?? undefined,
  };
}

// 跟进控制器 —— 进程级单例 (状态按 sessionId 分键, 组件重渲染不影响)。
// 契约 L-58: 本机痕迹**只用于加速** (决定续传时带不带 `Last-Event-ID`),
// 「该不该接回」的判据**永远**是服务端的 `stream-state`。
const followController: FollowController = createFollowController();

/**
 * ★ 四要素的**服务端权威值** (架构 §2.5 / T-15 / T-16 / T-17) —— 流式期间的载体。
 *
 * ⛔ 端侧**只渲染不推算**: 服务端给了就用服务端的; 没给 (老服务端) 才走本地兜底
 *   (耗时落回本地时钟, 计数落回 `countPhases` 的兜底数)。
 */
interface StreamingTurnMeta {
  /** 服务端算的累计耗时 (ms)。 */
  elapsedMs: number | null;
  /** 逻辑工具调用次数 (端侧不数帧)。 */
  toolCallCount: number | null;
  /** 逻辑思考段数 (端侧不数帧)。 */
  thinkingCount: number | null;
  /** 终态分类 (T-12)。 */
  terminalReason: string | null;
  /** 轮次开始时刻 (服务端时钟) —— 本地时钟兜底用。 */
  startedAt: number | null;
}

const EMPTY_STREAMING_TURN_META: StreamingTurnMeta = {
  elapsedMs: null,
  toolCallCount: null,
  thinkingCount: null,
  terminalReason: null,
  startedAt: null,
};

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

/**
 * 从消息文本里提取 `@[library:id] title` 形式的 marker, 拿 id 列表.
 * 跟 web `src/app/(main)/chat/[id]/page.tsx:196-206` 同款实现 (同一正则),
 * 作用是当「用户直接在输入框里粘 marker」这条路径的解析入口 ——
 * 这类 id 用户没走过 LibraryPicker, 不在 pendingKnowledgeRefs 里.
 */
function extractKnowledgeRefIdsFromMessage(message: string): string[] {
  const ids: string[] = [];
  // `@[library:123] title` 或 `@[library:abc-uuid] 标题`
  const re = /@\[library:([^\]\s]+)\][^\n]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message)) !== null) {
    if (m[1]) ids.push(m[1]);
  }
  return ids;
}

/**
 * 把 approval_request rich_event 抽成 ApprovalRequest。
 *
 * ⚠️ 审批身份**只**认 `pending_id` (契约 L-21 / 任务书 P-11):
 *   审批事件里的 `id` 是 **tool_use_id** —— 同一个工具调用可能对应多个 pending,
 *   拿 `id` 当身份会撞键 + 删错条。认不出 `pending_id` ⇒ **宁可不显示**,
 *   也不拿 `id` 冒充 (跟 web 定稿版 `chat/[id]/page.tsx` 的 `handleApprovalEvent` 同款)。
 *
 *   `pending_id` 的 snake / camel 两个别名已由归一层 (`lib/rich-events.ts`)
 *   解析好 ⇒ 这里只读 `pending_id` 一个字段。
 */
function toApprovalRequest(ev: RichEventBase): ApprovalRequest | null {
  if (ev.type !== "approval_request") return null;
  const pendingId = ev.pending_id;
  if (!pendingId) return null;
  const risk = ev.risk_level;
  return {
    // 用 pendingId 当 store 去重 key, 跟 web store.addPendingApproval 同款
    id: pendingId,
    pendingId,
    tool: ev.tool || "tool",
    title: ev.title || "需要你的授权",
    detail: ev.detail || undefined,
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
  // ★ a4 契约 v1 —— 「已删除交付物」集合**按用户隔离** (H-6):
  //   换用户登录 ⇒ 看到的是他自己那一份, 绝不串号。
  const { user } = useAuth();
  const userId = user?.id ?? null;

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
      // chat-id-9: 知识库引用 id — api.getHistory 已从 metadata.knowledge_refs
      //   解析出来 (存的是 server 侧实际生效的 atom id).
      knowledgeRefs: m.knowledgeRefs,
      createdAt: m.createdAt,
      recalled: m.recalled ?? false,
      recalledAt: m.recalledAt ?? null,
      // 历史消息的思考/工具时间线 (M5 批): api.getHistory 已把服务端 phases_json 解析成 ExecutionPhase[]
      phases: m.phases,
      // ★ 任务书 P-4 —— 历史消息的**富事件** (工具卡片 / 文件 / 图片 / 审批回执)
      //   也得还原出来, 否则刷新后历史里的工具卡片全没了。
      //   api.getHistory 已按 web 定稿版口径从 phases_json 里解析 (只认 type==="tool")。
      richEvents: m.richEvents,
    }));
    return list;
  }, [historyQuery.data]);

  // 流式期间累积 (content + events). MessageList 用 streamingContent 渲染最后一条.
  const [streamingAssistantId, setStreamingAssistantId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  // ★ 契约判别联合 (契约 §2) —— 流式富事件的类型是**冻结**的, ⛔ 不再是
  //   `Record<string, unknown>` (那样按 type 收窄就拿不到字段名检查)。
  const [streamingEvents, setStreamingEvents] = useState<RichEventBase[]>([]);
  // A2-D4-02 · 思考 / 工具时间线 (流式累积 chunk.reasoning + tool 事件).
  // 合并策略跟 web `chat/[id]/page.tsx:605-618` + 安卓 SsePipeline.WORK 一致:
  //   相邻 thinking chunk **就地拼接** (不是每 chunk 一条) —— 否则时间线会显示
  //   "思考 20 次" 的短句列表, 而不是 1 条完整思考链.
  const [streamingPhases, setStreamingPhases] = useState<ExecutionPhase[]>([]);
  // ★ 四要素 (服务端权威值) —— 见模块顶部 `StreamingTurnMeta` 的说明。
  //   端侧**只渲染不推算** (T-15 / T-16 / T-17)。
  const [streamingTurnMeta, setStreamingTurnMeta] =
    useState<StreamingTurnMeta>(EMPTY_STREAMING_TURN_META);
  // onChunk 回调闭包里的 state 是**旧值** ⇒ 终态帧要拿「本轮完整正文 / phases」
  // 发通知 (C4-08) 必须走 ref 镜像.
  const streamingContentRef = useRef<string>("");
  const streamingPhasesRef = useRef<ExecutionPhase[]>([]);
  // ★ 四要素的 ref 镜像 (state 闭包里拿到的是旧值 ⇒ 累积必须走 ref)。
  const streamingTurnMetaRef = useRef<StreamingTurnMeta>(
    EMPTY_STREAMING_TURN_META,
  );
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

  // 阶段 8 chat-id-13 — approval_request 累积.
  //
  // ⚠️ 任务书 P-6 · 待审批列表**必须持久化**:
  //   PC 端零持久化的口径是「不落任何用户数据到磁盘」, 但待审批列表必须活过
  //   页面刷新 —— 否则用户点一下「刷新」, 正在等裁决的工具调用就永远没人管了
  //   (工具卡在 gaclaw 那儿, 前端再也看不见)。
  //   ⇒ 落 localStorage (PC 端唯一可用的浏览器存储), key 按 sessionId 分键,
  //     只存**审批身份 + 展示字段**, 不存任何正文 / 附件 / token。
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);

  /**
   * 加一条待审批 (按 pending_id 去重) —— 并同步落盘。
   *
   * ⚠️ 幂等: 重复的 pending_id 保留**先到**的那条 (web store 同款)。
   */
  const addPendingApproval = useCallback(
    (req: ApprovalRequest) => {
      if (!chatId) return;
      setPendingApprovals((prev) => {
        const next = appendPendingApproval(prev, req);
        if (next === prev) return prev;
        savePendingApprovals(chatId, next);
        return next;
      });
    },
    [chatId],
  );

  /**
   * ★ 精确删**一条**待审批 (契约 L-32a / L-32b / 任务书 P-12)。
   *
   * ⛔ 不是「清掉不在集合里的」, 也不是「整表清」—— 兄弟 pending 必须留下:
   *   整表清会把兄弟一起清掉, 而服务端真值仍在, 兄弟端会再收到这条,
   *   于是「别的端已经批过了」这件事被本端悄悄吞掉。
   */
  const removePendingApproval = useCallback(
    (pendingId: string) => {
      if (!chatId || !pendingId) return;
      setPendingApprovals((prev) => {
        const next = dropPendingApproval(prev, pendingId);
        if (next === prev) return prev;
        savePendingApprovals(chatId, next);
        return next;
      });
    },
    [chatId],
  );

  // =========================================================================
  // ★ a4 契约 v1 · 交付物删除推送 (W-1 / W-2 / W-3 / H-1 / H-2 / H-4 / H-5 / H-6)
  //
  //   交付物从服务端消失后, 交付中心里那张卡没了, 但**消息气泡里**那张卡还在
  //   —— 气泡只认 rich_event, 它自己不知道文件没了 ⇒ 用户点进去是个死链。
  //
  //   判据只有一条 (H-1): **事件带了交付物主键, 且这个主键在「已删除」集合里**。
  //   ⛔ 判据**不是**「查服务端这个 id 还在不在」—— 那会把「从没同步过的
  //     老会话气泡」误判成消失 (历史消息气泡集体消失 = 严重回归)。
  //   ⛔ 端侧**零判断** (H-4): 收到 id 就记, 不查本地有没有、不猜服务端语义。
  //
  //   两个来源写进**同一张**集合 (W-5):
  //     ① 推模式 —— 会话 SSE 帧的顶层字段 `deletedDeliverables` (best-effort);
  //     ② 拉模式 —— 列表接口的 `removedIds` (交付中心页写, 见 routes/Deliveries.tsx)。
  //   帧推是 best-effort (没开聊天页就收不到) ⇒ **正确性由拉模式兜底** (H-7)。
  // =========================================================================
  const [deletedDeliverableIds, setDeletedDeliverableIds] = useState<Set<string>>(
    () => new Set(),
  );

  /**
   * 记一批「已被服务端删除的交付物主键」→ 更新内存态。
   *
   * ⚠️ 只增不减 + 幂等 (H-5): 已经在集合里的 id 不重复记。
   */
  const markDeletedDeliverables = useCallback(
    (ids: string[]) => {
      if (!userId || ids.length === 0) return;
      const added = recordDeletedDeliverables(userId, ids);
      if (added.length === 0) return;
      setDeletedDeliverableIds((prev) => {
        const next = new Set(prev);
        for (const id of added) next.add(id);
        return next;
      });
    },
    [userId],
  );

  // 进场 / 换用户 ⇒ 从本机落盘 hydrate 回「已删除交付物」集合 (W-2 / H-6)。
  //   ⚠️ 刷新页面后那张死链卡必须**不回来** —— 服务端不会重推这帧。
  useEffect(() => {
    if (!userId) {
      setDeletedDeliverableIds(new Set());
      return;
    }
    // TTL 清理: 超过 180 天的条目从落盘里剔掉 (H-5)。
    pruneDeletedDeliverables(userId);
    setDeletedDeliverableIds(readDeletedDeliverables(userId));
  }, [userId]);

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

  // 是否处于"等待首帧" 的状态 — 用来显示"正在思考" 占位
  const [waitingFirstFrame, setWaitingFirstFrame] = useState(false);

  // 切 chat → 换 session ⇒ 待审批列表也跟着换 (旧 session 的 pending 不带到新 session).
  //
  // ⚠️ 任务书 P-6: 本 session 的 pending 要从**本机落盘**里 hydrate 回来 ——
  //   不是清空。刷新页面后正在等裁决的工具调用必须还在 banner 上,
  //   否则用户永远不知道自己还有一条没批。
  useEffect(() => {
    setPendingApprovals(chatId ? loadPendingApprovals(chatId) : []);
    setStreamingAssistantId(null);
    setStreamingContent("");
    setStreamingEvents([]);
    setStreamingPhases([]);
    setStreamError(null);
    setWaitingFirstFrame(false);
    return () => {
      // 卸载时只清**内存态** —— 本机落盘的那份要留着 (跨刷新存活, 任务书 P-6)。
      setPendingApprovals([]);
    };
  }, [chatId]);

  // 拼装最终 messages: 历史 + 流式那条占位
  const messages: ChatMessageModel[] = useMemo(() => {
    // ★ 任务书 P-8 · 旧协议双写去重 (契约 L-14 ~ L-18)。
    //   服务端同一次工具产出可能既推新协议 `file`/`image`, 又推旧协议
    //   `tool_done[file]`/`tool_done[image]` ⇒ 同一张卡片渲两遍。
    //   去重按 **(事件族, id)**: 同族同 id 只留一条, 且留**新协议**那条。
    //   ⛔ `web_preview` 不参与 (它的 id 被加工成 `id+'_web'`, 同族同 id 判据不成立)。
    //
    // ★ a4 契约 v1 · W-3 · 气泡收敛 —— **历史路径与流式路径都要滤**。
    //   只滤一边 ⇒ 安卓踩过的两个坑: 「空壳气泡」与「判定还成立但内容空了」。
    //   ⇒ `richEvents` 与 `phases` 两边一起滤 (判据在 lib/deliverable-visibility.ts)。
    const dedupedBase = baseMessages.map((m) => {
      const deduped =
        m.richEvents && m.richEvents.length > 0
          ? dedupeRichEvents(m.richEvents)
          : m.richEvents;
      const keptEvents = filterDeletedDeliverableEvents(
        deduped,
        deletedDeliverableIds,
      );
      const keptPhases = filterDeletedDeliverablePhases(
        m.phases,
        deletedDeliverableIds,
      );
      if (keptEvents === deduped && keptPhases === m.phases) return m;
      return { ...m, richEvents: keptEvents, phases: keptPhases };
    });
    if (!streamingAssistantId) return dedupedBase;
    const streamingMsg: ChatMessageModel = {
      id: streamingAssistantId,
      role: "assistant",
      content: streamingContent,
      richEvents: dedupeRichEvents(streamingEvents),
      // A2-D4-02 · 思考 / 工具时间线随消息下传 → ExecutionTimeline
      phases: streamingPhases,
    };
    // ★ a4 契约 v1 · W-3 · 气泡收敛 —— **流式路径**也要滤掉「已被服务端删除的交付物」。
    //   ⛔ 判据在 `lib/deliverable-visibility.ts` (H-9) —— 这里**只接线**, 不 inline 判据。
    //   ⚠️ 两边都要滤 (`richEvents` 与 `phases`) —— 只滤一边 ⇒ 安卓踩过的两个坑:
    //     「空壳气泡」(phase 还在、事件没了) 与「判定还成立但内容空了」。
    streamingMsg.richEvents = filterDeletedDeliverableEvents(
      streamingMsg.richEvents,
      deletedDeliverableIds,
    );
    streamingMsg.phases = filterDeletedDeliverablePhases(
      streamingMsg.phases,
      deletedDeliverableIds,
    );
    return [...dedupedBase, streamingMsg];
  }, [
    baseMessages,
    streamingAssistantId,
    streamingContent,
    streamingEvents,
    streamingPhases,
    deletedDeliverableIds,
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

  /**
   * 本机正在渲染的那一行 assistant 的本地 id。
   *   发起流 = `streaming-*`; 只读接入流 = `attach-<chatId>`。
   */
  const localRowIdRef = useRef<string | null>(null);

  /** 清掉本机的流式行 (终态 / 取消 / 出错 / 切会话)。 */
  const clearLocalRow = useCallback(() => {
    const rowId = localRowIdRef.current;
    localRowIdRef.current = null;
    setStreamingAssistantId((cur) => (rowId && cur === rowId ? null : cur));
    setStreamingContent("");
    setStreamingEvents([]);
    setStreamingPhases([]);
    // ★ 四要素跟着本行一起清 (下一轮重新累积)。
    streamingTurnMetaRef.current = EMPTY_STREAMING_TURN_META;
    setStreamingTurnMeta(EMPTY_STREAMING_TURN_META);
  }, []);

  /**
   * ★ 渲染「接入流」那一行的**快照内容** (架构 §5.2 / G-4 / 缺陷 D-1)。
   *
   *   两个来源:
   *     ① 本机轮次记录 (刷新 / 重开页面后, 端上已经渲染过的那部分);
   *     ② 服务端给的 `attach_failed.snapshot` (接不回来时, 至少还有内容可看)。
   *
   *   ⚠️ 快照与后续帧是**接续**的 (快照在前, 增量在后) ⇒ 这里的赋值是
   *     「把累计正文**置成**快照」, 后续帧继续往上加。
   */
  const renderAttachSnapshot = useCallback(
    (content: string, phases: ExecutionPhase[]) => {
      // 建行 (第一次有内容才建 —— 控制帧不带内容, 建早了会挂一个空气泡)。
      if (!localRowIdRef.current) {
        localRowIdRef.current = `attach-${chatId}`;
        setStreamingAssistantId(localRowIdRef.current);
      }
      streamingContentRef.current = content;
      setStreamingContent(content);
      streamingPhasesRef.current = phases;
      setStreamingPhases(phases);
    },
    [chatId],
  );

  /**
   * ★ 流帧处理 —— **发起流与只读接入流共用这一条** (契约 L-57)。
   *
   * 两者的帧语义完全一样 (正文 / 思考 / 富事件 / 审批事件) ⇒ 同一个 handler,
   * ⛔ 不写第二遍同型代码 (web 定稿版 `accumulateChunk` 同样只有一份)。
   *
   * @param rowPrefix   本机那一行的 id 前缀 (发起流 `streaming` / 接入流 `attach`)
   * @param attachments 发起流的附件 (用于错误条的重试上下文); **null** = 静默
   *                    (只读接入流出错不打扰用户 —— 契约 L-50 同款降级)
   */
  const handleStreamChunk = useCallback(
    (
      chunk: ChatChunk,
      rowPrefix: "streaming" | "attach",
      attachments: PendingAttachment[] | null,
    ) => {
      if (!chatId) return;
      // waiting first frame → 收到任意 chunk 即结束 typing
      setWaitingFirstFrame(false);

      // ★ a4 契约 v1 · W-1 —— 认「顶层字段 `deletedDeliverables`」这一帧。
      //   ⛔ 它**不是** events[] 里的一条富事件 (契约 §二: 走顶层字段,
      //     老版本端侧天然安全) ⇒ 在**消费层**认, 不改帧解析器 (H-8)。
      //   ⛔ 端侧**零判断** (H-4): 收到 id 就记 —— 不查本地有没有这个交付物、
      //     不猜服务端语义、不加任何前置条件。
      //   ⚠️ 这帧**不带 `id:` 行** ⇒ 游标不推进 (读帧层已按契约 L-34 处理)。
      const deletedIds = parseDeletedDeliverables(chunk);
      if (deletedIds && deletedIds.length > 0) {
        markDeletedDeliverables(deletedIds);
      }

      // 本机那一行: **第一次有内容才建** —— 控制帧 (attach_ok) 不带内容,
      // 建早了会挂一个空气泡。
      const ensureRow = () => {
        if (localRowIdRef.current) return;
        localRowIdRef.current =
          rowPrefix === "attach" ? `attach-${chatId}` : streamingId();
        setStreamingAssistantId(localRowIdRef.current);
      };

      if (chunk.content) {
        ensureRow();
        streamingContentRef.current += chunk.content;
        setStreamingContent((prev) => prev + chunk.content);
      }
      // ★ T-16 · 思考链 → phases —— **原样各占一条, 端侧不合并**。
      //   「该合成几条」是**服务端**的决定 (v2 落库的 phases_json 已是合并形态);
      //   端侧再合并一次 = 把服务端刻意分开的思考段粘回去 ⇒ 次数漂移。
      //   ⇒ 合并只发生在渲染层的那一处 (`sse/turn-record.ts` 的 `renderPhases`)。
      //   ⚠️ 老服务端 (v1) 下 `renderPhases` 的兼容分支会把相邻 thinking 合成一条
      //     ⇒ 观感与删掉合并之前**一致**。
      if (chunk.reasoning) {
        ensureRow();
        streamingPhasesRef.current = [
          ...streamingPhasesRef.current,
          { type: "thinking", text: chunk.reasoning, ts: Date.now() },
        ];
        setStreamingPhases(streamingPhasesRef.current);
      }
      // ★ 四要素 (服务端权威值) —— 端侧**只渲染不推算** (T-15 / T-16 / T-17)。
      //   服务端给了才覆盖; 没给 (老服务端) ⇒ 保持 null ⇒ 渲染层走本地兜底。
      if (
        typeof chunk.elapsedMs === "number" ||
        typeof chunk.toolCallCount === "number" ||
        typeof chunk.thinkingCount === "number" ||
        typeof chunk.startedAt === "number" ||
        typeof chunk.terminalReason === "string"
      ) {
        const cur = streamingTurnMetaRef.current;
        const next: StreamingTurnMeta = {
          elapsedMs:
            typeof chunk.elapsedMs === "number" ? chunk.elapsedMs : cur.elapsedMs,
          toolCallCount:
            typeof chunk.toolCallCount === "number"
              ? chunk.toolCallCount
              : cur.toolCallCount,
          thinkingCount:
            typeof chunk.thinkingCount === "number"
              ? chunk.thinkingCount
              : cur.thinkingCount,
          terminalReason:
            typeof chunk.terminalReason === "string"
              ? chunk.terminalReason
              : cur.terminalReason,
          startedAt:
            typeof chunk.startedAt === "number" ? chunk.startedAt : cur.startedAt,
        };
        streamingTurnMetaRef.current = next;
        setStreamingTurnMeta(next);
      }
      // ★ 天眼 (T-13 / 订正 11): `error{code:'OUTPUT_FILTER_HIT'}` ⇒
      //   **撤掉已渲染的 partial 正文**, 换成天眼文案 (合规要求)。
      //   状态机那边已经把**记录**里的正文清了 (purgeContent) —— 这里清**渲染层**的。
      //   ⚠️ 天眼帧的形状是 `{type:'error', code, content:'❗️天眼…'}` ——
      //     文案在 `content` 里, 所以「撤 partial」= 把累计正文换成这一帧的 content。
      if (chunk.code === OUTPUT_FILTER_HIT_CODE) {
        streamingContentRef.current = chunk.content ?? "";
        setStreamingContent(streamingContentRef.current);
        const next: StreamingTurnMeta = {
          ...streamingTurnMetaRef.current,
          terminalReason: "filtered",
        };
        streamingTurnMetaRef.current = next;
        setStreamingTurnMeta(next);
      }
      // 阶段 8 chat-id-13/17 — 抽 approval_request / approval_granted /
      //   approval_denied 事件走 ApprovalBanner / store, 不进 message.richEvents
      //   (跟 web page.tsx:622-655 + Android ApprovalBanner 同款)。
      //   ⛔ 'feedback' 不在契约的活类型名单里 ⇒ 归一层 (`lib/rich-events.ts`)
      //     已经把它整条丢掉 (gagaOS §⑥ 点赞/点砍整体删除)。
      const dispatch = (ev: RichEventBase) => {
        if (!ev || typeof ev !== "object") return;
        const type = ev.type;
        if (type === "approval_request") {
          const req = toApprovalRequest(ev);
          if (req) addPendingApproval(req);
          return; // 不进 richEvents (banner 唯一展示源)
        }
        if (type === "approval_granted" || type === "approval_denied") {
          // ★ 只收**那一条** (契约 L-32a / L-32b / 任务书 P-12) —— 兄弟 pending
          //   必须并存。认不出是哪一条 ⇒ 不删 (宁多留一张卡, 不可错删兄弟)。
          if (ev.pending_id) removePendingApproval(ev.pending_id);
          return;
        }
        ensureRow();
        setStreamingEvents((prev) => [...prev, ev]);
        // A2-D4-02 · tool 事件同时进 phases 时间线 (跟 web page.tsx:648-655 同款)
        streamingPhasesRef.current = [
          ...streamingPhasesRef.current,
          {
            type: "tool",
            event: ev as unknown as Record<string, unknown>,
            ts: Date.now(),
          },
        ];
        setStreamingPhases(streamingPhasesRef.current);
      };
      if (chunk.event) dispatch(chunk.event);
      if (chunk.events && chunk.events.length > 0) {
        for (const ev of chunk.events) dispatch(ev);
      }
      if (isTerminalDone(chunk)) {
        // 终态 → 用 server messageId 替换本地临时 id (由 history 认亲)
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
        clearLocalRow();
        // 刷新 history + chats (server 落库后 title 改了)
        queryClient.invalidateQueries({ queryKey: ["history", chatId] });
        queryClient.invalidateQueries({ queryKey: ["chats"] });
        // small UX touch: fullContent / emptyReply 由父组件消费, 此处不强求
        void serverId;
        return;
      }
      if (isCancelFrame(chunk)) {
        // 取消帧 — 直接关闭, 不调 ack (互斥路径 finally 会判)
        clearLocalRow();
        return;
      }
      if (chunk.error) {
        if (attachments) {
          setStreamError({
            kind: "server",
            message: String(chunk.error),
            userAttachments: attachments,
          });
        }
        clearLocalRow();
      }
    },
    [
      chatId,
      queryClient,
      addPendingApproval,
      removePendingApproval,
      markDeletedDeliverables,
      clearLocalRow,
    ],
  );

  const startStream = useCallback(
    async (text: string, attachments: PendingAttachment[]) => {
      if (!chatId) return;
      // 重置流式态
      localRowIdRef.current = streamingId();
      setStreamingAssistantId(localRowIdRef.current);
      setStreamingContent("");
      setStreamingEvents([]);
      setStreamingPhases([]);
      streamingContentRef.current = "";
      streamingPhasesRef.current = [];
      setStreamError(null);
      setWaitingFirstFrame(true);
      // ⚠️ 任务书 P-12 —— 这里**不再**清空待审批列表:
      //   兄弟 pending 还在服务端真值里 (契约 L-32a / L-32b), 整表清会让用户
      //   再也看不见那条没批的授权。列表的收敛只发生在「那条真的被裁决了」时。

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

      // M3 3B: 知识库引用 id 列表 — 合并两条来源 (跟 web chat/[id]/page.tsx:759-774 同款):
      //   ① 用户本轮通过 KnowledgeAttachSheet 挂的 (pendingKnowledgeRefs)
      //   ② 用户在输入框里直接粘的 markdown marker `@[library:id] title` (兜底)
      //   两条合并去重 (id 形式天然唯一); 空 ⇒ undefined (server 走原路径).
      const knowledgeRefs = (() => {
        const markerIds = extractKnowledgeRefIdsFromMessage(text);
        const explicitIds = pendingKnowledgeRefs.map((r) => r.id);
        const seen = new Set<string>();
        const uniq = [...explicitIds, ...markerIds].filter((id) => {
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });
        return uniq.length > 0 ? uniq : undefined;
      })();

      // =========================================================================
      // ★ 重构轮 R2-web · 发送流**也走状态机** (G-3 一处真值)
      //
      //   发起流 (POST /chat/stream) 与接入流 (POST /chat/attach) 是两条路,
      //   但**状态机只有一套** —— 帧都走 `ctrl.dispatch({type:"frame"})`:
      //   幂等 / 降级 / 终态分类**只有一处判据** (不许在宿主层另写一套)。
      // =========================================================================

      // 新的一轮 ⇒ 旧游标作废 (游标是**按轮次**的, 契约 L-40 / L-60) ——
      //   带着上一轮的游标去接这一轮 ⇒ 会接回上一轮的帧 ⇒ 正文重复。
      void followController.start(chatId, null);
      // ⚠️ 本机轮次记录先重置 —— 游标与已渲染内容在**同一条记录**里 (架构 §5.3),
      //   不许只删一半 (缺陷 D-1 / 断言 B7)。
      await turnRecordStore.write(emptyTurnRecord(chatId, Date.now()));

      // 本轮服务端下发的最后一个合法游标 (端侧**不自增**, 契约 L-33)。
      let lastCursor: string | null = null;
      // 这一轮见过终态帧吗 (见过 ⇒ 不许重连)。
      let sawTerminal = false;
      // 重连模式 ⇒ 走续传 (带 Last-Event-ID, 契约 L-35)。
      let resumeMode = false;
      // 只重连一次 (无限重连 = 烧 token + 界面抖动)。
      let reconnectTried = false;

      // 「本轮在跑」的探测结果 —— 发送流由**本端**发起 ⇒ 这一轮必然在跑。
      // ⚠️ 这是**恒真**的, 但走同一条决策路径 ⇒ 状态机只有一套。
      const runningProbe: StreamStateProbe = {
        reachable: true,
        running: true,
        canAttach: true,
        turnKey: null,
        lastEventId: null,
        pendingApprovals: [],
        lastSeq: null,
        turnState: "running",
        upstreamAlive: true,
        snapshotAvailable: false,
        completeness: "partial",
        startedAt: null,
        elapsedMs: null,
        toolCallCount: null,
        thinkingCount: null,
      };

      // 发起流 / 接入流共用的「吃一帧」—— 状态机先判, 宿主层只渲染 (G-3)。
      const onTurnChunk = (chunk: ChatChunk, cursor: string | null) => {
        // ★ 幂等结论由**状态机**给 (T-09 / G-3): duplicate ⇒ 不重渲染; gap ⇒ 已降级。
        //   `cursor` = **这一帧**生效的 SSE 游标 (读帧层保证它先于本帧回调)。
        const s = ctrl.dispatch({
          type: "frame",
          frame: toTurnFrame(chunk),
          cursor: cursor ?? lastCursor,
        });
        if (s.frameOutcome !== "applied") return;
        if (s.state === "draining") sawTerminal = true;
        handleStreamChunk(chunk, "streaming", attachments);
      };

      // 本轮的「轮次控制器」—— 与进场接回**共用**同一个状态机。
      const ctrl = createEntryController(
        chatId,
        {
          probe: async () => runningProbe,
          loadRecord: async (id) => turnRecordStore.read(id),
          saveRecord: async (rec) => {
            await turnRecordStore.write(rec);
          },
          attach: async (args) => {
            await stream.start({
              sessionId: chatId,
              message: text,
              imageUrls,
              attachedFileIds: fileIds,
              knowledgeRefs,
              // ★ 重连模式 ⇒ **空 body + 续传头** (契约 L-35 / L-36):
              //   绝不能重复投喂用户消息, 也不能建新轮次。
              resume: resumeMode
                ? { cursor: args.cursor ?? lastCursor ?? null }
                : null,
              onCursor: (c) => {
                // 游标推进 —— 只接受纯十进制数字串 (非法值由控制器直接丢弃)
                if (typeof c === "string" && /^\d+$/.test(c)) lastCursor = c;
                void followController.advanceCursor(chatId, c);
              },
              onChunk: (chunk: ChatChunk, cur: string | null) => {
                onTurnChunk(chunk, cur);
              },
            });
          },
        },
        {
          // 降级 ⇒ 先渲染快照, 再回落历史 (G-4: 降级是常态分支, 不弹错误)。
          onDegrade: (plan, session) => {
            const snap = session.record.renderedSnapshot;
            if (plan.renderSnapshot && snap.content) {
              renderAttachSnapshot(
                snap.content,
                snap.phases as unknown as ExecutionPhase[],
              );
            }
            queryClient.invalidateQueries({ queryKey: ["history", chatId] });
          },
          onHistory: () => {
            queryClient.invalidateQueries({ queryKey: ["history", chatId] });
          },
        },
      );

      try {
        await ctrl.start();
        // ★ 重连 (缺陷 W-1 / 断言 B9) —— 这一轮**还没结束**但流断了 ⇒ 带 Last-Event-ID 重接一次。
        //   · 游标 = 服务端下发的最后一个合法游标 (端侧**不自增**, 契约 L-33);
        //   · **只重连一次** (无限重连 = 烧 token + 界面抖动);
        //   · 用户按了停止 / 组件卸载 ⇒ **不重连** (那一轮已经被用户结束了)。
        if (!sawTerminal && !reconnectTried) {
          reconnectTried = true;
          resumeMode = true;
          console.warn(
            "[sse] 这一轮还没结束就断了 ⇒ 重连一次 (带 Last-Event-ID), 游标:",
            lastCursor,
          );
          try {
            await ctrl.reconnect();
          } catch (err2) {
            // ★ 重连失败**不弹错误** (G-4: 降级是常态分支) ⇒ 静默回落历史补拉。
            console.warn("[sse] 重连失败, 回落历史补拉:", err2);
            queryClient.invalidateQueries({ queryKey: ["history", chatId] });
          }
        }
      } catch (err) {
        // user abort → 静默关闭, 不弹错误
        if (isUserAbortError(err) || err instanceof UserAbortError) {
          clearLocalRow();
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
        clearLocalRow();
        setWaitingFirstFrame(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatId, queryClient, handleStreamChunk, clearLocalRow, pendingKnowledgeRefs],
  );

  // =========================================================================
  // ★ 进场接回 (契约 L-41 ~ L-46 / L-49 / L-50 / L-57 / L-60 / 任务书 P-9)
  //
  // 三端**统一**进场序列, 不得各自发明:
  //   ① GET  /sessions/:id/stream-state
  //        ├─ running === false (或 canAttach === false)
  //        │     ⇒ 走历史接口 (正文 + 交付物 + 审批历史) ⇒ 结束
  //        └─ running === true
  //              ⇒ POST /sessions/:id/chat/attach
  //                   ├─ 本机有该 session 的**合法**游标 ⇒ 带 Last-Event-ID
  //                   └─ 本机零状态                    ⇒ 带 X-Resume-Turn: 1
  //                       ⇒ 收首帧 attach_ok    ⇒ 渲染回放 + 继续收 live 帧
  //                       ⇒ 收首帧 attach_failed ⇒ 回落历史补拉 (静默, 不报错)
  //
  // ⛔ 本机痕迹 (游标) **只用于加速** (决定带不带 Last-Event-ID),
  //    「该不该接回」的判据**永远**是服务端的 stream-state (契约 L-58)。
  //
  // 这一段覆盖 PM 点名的 4 个场景:
  //   ① 刷新页面  ② 关掉重进  ③ 换台电脑打开同一会话
  //   ④ 从会话页跳去别的页面再回来
  // =========================================================================
  useEffect(() => {
    if (!chatId) return;
    let cancelled = false;
    const ac = new AbortController();
    // 进场期间先占住「正在思考」位 ⇒ 用户不能在接回途中误发新消息。
    setWaitingFirstFrame(true);

    (async () => {
      // ① 先问服务端「这会话现在有没有在跑的轮次」
      const state = await getStreamState(chatId);
      if (cancelled) return;
      if (!state) {
        // ★ **问不到** (网络失败 / 5xx) —— **不是**「没在跑」!
        //   ⇒ 回落历史补拉, **游标保留** (缺陷 A-3 / 断言 B6)。
        //   ⛔ 这里**不许**调 followController.stop(chatId) —— 它会把唯一游标删掉
        //      (断一次网就抹游标 ⇒ 回来只能整轮重放)。
        console.warn("[attach] stream-state 问不到, 回落历史补拉 (游标保留)");
        queryClient.invalidateQueries({ queryKey: ["history", chatId] });
        setWaitingFirstFrame(false);
        return;
      }
      if (!state.running || !state.canAttach) {
        // ⇒ 确实没有在跑的轮次 ⇒ 走历史接口即可 (historyQuery 已经在做)
        //   同时把本机的跟进记录清掉 (轮次已结束, 游标作废 —— 下一轮会重发)。
        //   ⚠️ **turn record 不删** —— 里面是这一轮已渲染的内容, 刷新后要先渲染它
        //      (架构 §5.3 / 断言 B7)。游标与内容在**同一条记录**里, 不许只删一半。
        await followController.stop(chatId);
        setWaitingFirstFrame(false);
        return;
      }

      // 服务端侧待审批真值 ⇒ 补进本地缓存 (契约 L-43 / D5)。
      //   本地表只是缓存, 服务端真值优先 ⇒ 这里 upsert 不会覆盖更新的数据。
      for (const p of state.pendingApprovals) {
        addPendingApproval({
          id: p.pending_id,
          pendingId: p.pending_id,
          tool: p.tool || "tool",
          title: p.title || "需要你的授权",
          detail: undefined,
          riskLevel: "medium",
        });
      }

      // ② 本机痕迹只用于加速 (契约 L-58): 决定带不带 Last-Event-ID
      const local = await followController.read(chatId);
      if (cancelled) return;
      const cursor = decideAttachCursor(local);

      // ③ 接回这一轮 —— 交给「端侧续传中枢」(src/lib/sse/entry.ts)。
      //   它管: 状态机 · 轮次记录落盘 · seq 幂等 · 降级闭环 · 终态分类。
      //   ⚠️ 探针结果**直接喂**已经问过的 state (不重复打网络)。
      await followController.start(chatId, cursor);
      const entry = createEntryController(
        chatId,
        {
          probe: async () => toProbe(state),
          loadRecord: (id) => turnRecordStore.read(id),
          saveRecord: (rec) => turnRecordStore.write(rec),
          attach: async (args) => {
            await stream.attach({
              sessionId: chatId,
              // ★ 游标由**状态机**决定 (取本机轮次记录里的 seq; 非法 ⇒ null ⇒
              //   服务端按 X-Resume-Turn 整轮接回)。本机痕迹只用于加速 (L-58)。
              cursor: args.cursor,
              signal: ac.signal,
              onControl: (frame) => {
                // ⚠️ 控制帧是**判别联合** (attach_ok | attach_failed) ——
                //   各自的字段不一样 ⇒ 必须先按 type 收窄。
                if (frame.type === "attach_failed") {
                  // 契约 L-50: attach 失败**静默**回落历史补拉, 不报错给用户
                  console.warn("[attach] 接不回来, 回落历史补拉:", frame.reason);
                  void followController.stop(chatId);
                  queryClient.invalidateQueries({ queryKey: ["history", chatId] });
                  args.onControl?.({
                    type: "attach_failed",
                    reason: frame.reason ?? null,
                    // ★ v2 (订正 3): 老服务端没有 ⇒ null ⇒ 回落历史, 不报错。
                    snapshot: (frame.snapshot ?? null) as ServerSnapshotLike | null,
                  });
                  return;
                }
                args.onControl?.({
                  type: "attach_ok",
                  turnKey: frame.turnKey ?? null,
                  resumedFrom: frame.resumedFrom ?? null,
                  replayed: frame.replayed ?? null,
                  reason: frame.reason ?? null,
                  // ★ v2 (订正 13): 老服务端没有 ⇒ null ⇒ 走本地兜底。
                  summary: (frame.summary ?? null) as TurnSummaryLike | null,
                });
              },
              onChunk: (chunk, cur) => {
                args.onData?.(toTurnFrame(chunk), cur);
              },
              onCursor: (c) => {
                // 游标推进 —— 只接受纯十进制数字串 (非法值由控制器直接丢弃)
                args.onCursor?.(c);
                void followController.advanceCursor(chatId, c);
              },
            });
          },
        },
        {
          // ★ 本机读回来的轮次记录 ⇒ **先渲染它** (缺陷 D-1 / 断言 B7)。
          //   「刷新后正文没了」的老 bug 就是因为端上只存了游标、没存内容。
          //   ⚠️ 只有**尾随重放** (本机有合法游标) 才喂给渲染层 ——
          //   整轮重放 (无游标) 时服务端会把整轮再发一遍, 再叠本机快照就重复了。
          onLocalRecord: (rec) => {
            if (cancelled) return;
            const snap = rec.renderedSnapshot;
            if (!snap.content && snap.phases.length === 0) return;
            if (!cursor) return;
            renderAttachSnapshot(
              snap.content,
              snap.phases as unknown as ExecutionPhase[],
            );
          },
          // 帧 —— 幂等结论由状态机给 (重复帧 / 跳号帧**不会**走到这里)。
          onFrame: (frame) => {
            if (cancelled) return;
            handleStreamChunk(toChatChunk(frame), "attach", null);
          },
          // ★ 降级闭环 (G-4): 有快照 ⇒ 先渲染快照; 没有 ⇒ 回落历史。**不弹错误**。
          onDegrade: (plan, session) => {
            const snap = session.record.renderedSnapshot;
            if (plan.renderSnapshot && snap.content) {
              renderAttachSnapshot(
                snap.content,
                snap.phases as unknown as ExecutionPhase[],
              );
            }
            queryClient.invalidateQueries({ queryKey: ["history", chatId] });
          },
          // 回落历史 (正文 + 交付物 + 审批历史)。
          onHistory: () => {
            queryClient.invalidateQueries({ queryKey: ["history", chatId] });
          },
        },
      );
      await entry.start();
      // 流结束 (轮次终帧 / 服务端关流) ⇒ 拉一次历史真值。
      //   ⚠️ **不删**跟进记录 —— 流结束可能是「上游断了」而不是「这轮结束了」,
      //   游标留着才能重连 (断言 B9)。下一轮开始时 start(chatId, null) 会重置它。
      if (!cancelled) {
        queryClient.invalidateQueries({ queryKey: ["history", chatId] });
      }
    })().catch((err) => {
      // 进场接回失败**不打扰用户** —— 静默回落历史补拉 (契约 L-39 / L-50 同款降级)
      console.warn("[attach] 进场接回失败, 回落历史补拉:", err);
    });

    return () => {
      cancelled = true;
      // 只掐**读流**, 不删跟进记录 (游标要留着 —— 跳走再回来才能续传)。
      // ⚠️ 契约 L-53: 中止不得掐全体 —— 接入流只是读, 掐它不影响服务端那一轮。
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // =========================================================================
  // ★ 审批裁决 (契约 L-21 / L-22 / L-26 ~ L-30 / 任务书 P-10 / P-12 / P-14)
  //
  //   · 提交体只有 `{action}` —— ⛔ 两个端点都不收 snake 的 `pending_id`
  //     (它在 URL 路径上), 旧端点 `/yinian/approvals` 额外要求 `toolId` 必填
  //     ⇒ 新端点 `POST /sessions/:id/approvals/:pendingId/decision` 是唯一出口。
  //   · 乐观收卡: 提交**前**把**那一条**从本机列表里摘掉 (契约 L-32a) ——
  //     ⛔ 不整表清, 兄弟 pending 必须并存。
  //   · 409 (已被别的端裁决过): 契约 L-29 —— **收卡不报错**, 只提示「已由 X 端处理」。
  //   · 真失败 (网络 / 5xx): 把卡**放回去**, 用户还能再点一次。
  // =========================================================================
  const handleApprovalAction = useCallback(
    async (action: ApprovalAction, request: ApprovalRequest) => {
      if (!chatId) return;
      // ★ 身份**只**认 pending_id (契约 L-21 / 任务书 P-11):
      //   事件里的 id 是 tool_use_id —— 拿它兜底会把裁决提交到别的审批上。
      const pendingId = request.pendingId;
      if (!pendingId) {
        toast({
          message: "审批提交失败: 缺少 pending_id, 无法定位审批",
          variant: "danger",
          duration: 4000,
        });
        return;
      }
      // 乐观收卡 (跟 Android 一致, 点了立刻消失) —— 但**只删这一条**。
      removePendingApproval(pendingId);
      const outcome = await submitApprovalDecisionOutcome(
        chatId,
        pendingId,
        action,
      );
      // ★ 分类是**纯函数** (lib/chat-approval-decision.ts) —— 契约 L-27 / L-29
      //   / 任务书 P-14: 409 = 已被别的端裁决 ⇒ 迟到的人**不算错**,
      //   收卡 + 提示是谁处理的, 不弹错、不重试。
      const verdict = classifyApprovalDecision(outcome);
      if (verdict.kind === "ok") return;
      if (verdict.kind === "conflict") {
        toast({
          message: verdict.message,
          variant: "default",
          duration: 3000,
        });
        return;
      }
      // 真失败 (网络 / 5xx) ⇒ 把卡放回去, 用户还能再点一次。
      addPendingApproval(request);
      toast({
        message: `审批提交失败: action=${action} pendingId=${pendingId} err=${outcome.code || outcome.status}`,
        variant: "danger",
        duration: 4000,
      });
    },
    [chatId, toast, addPendingApproval, removePendingApproval],
  );

  // ────────────── 发送 / 停止 / 重试 / 重生 ──────────────

  const handleSubmit = useCallback(
    (text: string, attachments: PendingAttachment[]): boolean => {
      if (!chatId) return false;
      if (streamingAssistantId) return false; // 已经在流式, 拒绝并发
      if (waitingFirstFrame) return false; // 正在等首帧 / 正在接回, 拒绝并发
      lastUserTextRef.current = text;
      lastUserAttachmentsRef.current = attachments;
      void startStream(text, attachments);
      return true;
    },
    [chatId, streamingAssistantId, waitingFirstFrame, startStream],
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
      // 2026-10-26: 分隔线 — 对齐 web `components/layout/Header.tsx:231`
      //   (<DropdownMenuSeparator /> 夹在「重命名」与「删除会话」之间)
      separator: true,
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
      // A2-D3-02 — 把知识库 marker 注入输入框
      //   2026-10-27 订正: 服务端**不仅支持** knowledge_refs, 还把它落进 user message
      //   的 metadata (unified-api yinian.chat.routes.js:1248-1263, commit 45fa31b,
      //   2026-10-26 已上线) ⇒ PC 现在**发送侧也发** (src/lib/sse.ts 走 knowledgeRefs 字段),
      //   与 web api.ts:797-799 / chat/[id]/page.tsx:759-774 同口径。
      //   marker 注入**仍保留** —— 它是「用户直接在输入框粘 marker」的兜底通道,
      //   且发送侧会同时从文本里解析 marker id 合并进 knowledge_refs (web 同款两路合并)。
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
  //   - search / template / voice → 保留 no-op / SlashMenu 自带 supported=false 占位
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

      {/* 阶段 8 chat-id-13 — ApprovalBanner sticky 在输入栏上方
          ⚠️ 契约 L-32a / L-32b / 任务书 P-12: 批掉一条只删**那一条**
             (handleApprovalAction 内部按 pending_id 精确删), 兄弟 pending 必须并存。
          ⚠️ 契约 L-29 / 任务书 P-14: 409 (已被别的端裁决) ⇒ 收卡 + 提示
             「已由 X 端处理」, 不报错、不重试。 */}
      <ApprovalBanner
        requests={pendingApprovals}
        onAction={(action, request) => {
          void handleApprovalAction(action, request);
        }}
      />

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
          {/* H-16 (对齐 web): web 的 chat 页**没有**「部分附件上传失败」这条 toast ——
              它只存在于 web 的 Home 页 ⇒ PC chat 页也不接 onSubmitNotice.
              (上传中拦截因此回落到上面的 onAttachmentError, 与改动前行为一致.) */}
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