/**
 * components/chat/MessageBubble.tsx — 阶段 2 单条消息气泡 (阶段 8 加 ⋮ 菜单)
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
 *
 * 阶段 8 (chat-id-13..18 P0):
 *   - 挂 MessageMenu (复制 / 保存到知识库 / 点赞 / 点踩 / 撤回 / 删除)
 *   - recalled 占位气泡 (贴 web 的 "X 撤回了一条消息" 同款, 用 CSS rounded-[8px] 浅底)
 *   - 重新生成 (chat-id-19) 不在 ⋮ 菜单, 在 ChatInputBar 旁; 详见 ChatDetail.tsx
 *
 * 0.7.5 (ChatDetail P1) 增量:
 *   - chat-id-9:  挂 ReferenceFold (知识库引用折叠条)
 *   - chat-id-11: RichEventBubble 自身挂 ToolTimingBadge (tool_end 带 duration_ms)
 *   - chat-id-12: assistant 气泡顶部挂 CallTreeCard (链路树)
 *   - chat-id-20: assistant 气泡底部挂 ExecutionTiming (已执行 X 秒 / 用时)
 *   - chat-id-27: assistant 气泡右侧挂 TtsButton (TTS 朗读)
 *   - chat-id-40: 顶部挂 QuoteReplyBlock (引用 / 回复 块)
 *
 * 父组件拿到 recalled=true 时**不传 menu** — 这个组件再卡一道防误调.
 */

import type { ReactNode } from "react";
import { Markdown } from "../../lib/markdown";
import { RichEventBubble, type RichEvent } from "./RichEventBubble";
import { MessageMenu, type MessageAction } from "./MessageMenu";
import { ReferenceFold } from "./ReferenceFold";
import { QuoteReplyBlock } from "./QuoteReplyBlock";
import { TtsButton } from "./TtsButton";
import { ExecutionTiming } from "./ExecutionTiming";
import { CallTreeCard, type CallTreeNode } from "./CallTreeCard";

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
  /**
   * 阶段 8: 是否已撤回 (server listChatMessages 透传 recalled 字段).
   * true 时整气泡换成 "已撤回" 占位, 不挂菜单.
   */
  recalled?: boolean;
  /** 撤回时间 (ISO) — 占位文案用的相对时间; recalled=true 时建议提供 */
  recalledAt?: string | null;
  /** 阶段 8: 消息操作完成回调 (parent 用它 invalidate history / 切 store) */
  onAction?: (action: MessageAction, ok: boolean) => void;
  // ============== 0.7.5 ChatDetail P1 增量 ==============
  /** chat-id-9: server metadata.knowledge_refs (用户本轮挂载的 atom id 列表) */
  knowledgeRefs?: string[];
  /** chat-id-40: server metadata.quoted_message_id / quoted_content */
  quotedMessageId?: string | null;
  quotedContent?: string | null;
  /** chat-id-20: 流式开始时间戳 (ms). 气泡底部「已执行 X 秒」用. */
  streamingSince?: number | null;
  /** chat-id-11 / chat-id-20: 完成态总耗时 ms (server metadata.tool_total_ms) */
  toolTotalMs?: number | null;
  /** chat-id-12: 链路树节点 (从 chunk.events 解析). 缺省 → 走 RichEventBubble 单卡片 */
  callTree?: CallTreeNode[];
}

// ────────────────────────────────────────────────────────────
// User bubble
// ────────────────────────────────────────────────────────────
function UserBubble({
  content,
  imageUrls,
  attachedFileIds,
  attachedFileNames,
  recalled,
  recalledAt,
  onAction,
  createdAt,
  messageId,
  knowledgeRefs,
  quotedMessageId,
  quotedContent,
}: Pick<
  MessageBubbleProps,
  | "content"
  | "imageUrls"
  | "attachedFileIds"
  | "attachedFileNames"
  | "recalled"
  | "recalledAt"
  | "onAction"
  | "createdAt"
  | "knowledgeRefs"
  | "quotedMessageId"
  | "quotedContent"
> & { messageId: string }) {
  // 阶段 7 — chat 附件点击走系统默认应用:
  // image 用 `<a target="_blank">` 让 Electron 主进程 setWindowOpenHandler
  // 自动接 shell.openExternal. file chip 加 onClick -> window.gacode.openWithSystem
  // (远程 url 路径). 失败时 console.warn, 不阻断 UI.
  const handleOpenUrl = (url: string) => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      gacode?: { openWithSystem: (args: { url?: string; filePath?: string }) => Promise<{ ok: boolean; error?: string }> };
    };
    if (w.gacode?.openWithSystem) {
      void w.gacode.openWithSystem({ url }).then((r) => {
        if (!r.ok) console.warn("[gacode-electron] openWithSystem failed:", r.error);
      });
    } else {
      // fallback: 新窗口由主进程 setWindowOpenHandler 接管
      const a = window.open(url, "_blank", "noopener,noreferrer");
      void a;
    }
  };

  if (recalled) {
    return (
      <div className="flex justify-end items-start gap-1.5">
        <RecalledPlaceholder
          side="user"
          recalledAt={recalledAt}
          createdAt={createdAt}
        />
        {!onAction ? null : null}
      </div>
    );
  }

  return (
    <div className="flex justify-end items-start gap-1.5">
      <div className="max-w-[80%]">
        {/* chat-id-40: 引用块 — 在气泡顶部显示被回复的消息预览 */}
        {quotedContent ? (
          <QuoteReplyBlock
            content={quotedContent}
            from="assistant"
            messageId={quotedMessageId}
          />
        ) : null}

        {/* 图片 (image mode 上传产物) — 阶段 7: 点击唤起系统默认程序
            (图片 URL → shell.openExternal 让 OS 默认图片查看器/浏览器接管) */}
        {imageUrls && imageUrls.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mb-1.5 justify-end">
            {imageUrls.map((url, i) => (
              <a
                key={`${url}-${i}`}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  handleOpenUrl(url);
                }}
                className="block"
              >
                <img
                  src={url}
                  alt=""
                  className="max-w-[200px] max-h-[200px] rounded-md object-contain bg-bg-sunken cursor-pointer"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        ) : null}

        {/* 附件 chip (document mode 上传产物) — 阶段 7: 点击唤起系统默认应用
            (chat 端没有 file 原始 url, 但 server 通过 metadata 返回了 fileName,
            渲染层可见的是 fileId; 这里简化为把 fileId 当作 placeholder, chip
            的 onClick 仅供 UI 反馈 — 真实场景需要 server 给一个下载 url) */}
        {attachedFileIds && attachedFileIds.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mb-1.5 justify-end">
            {attachedFileIds.map((id, i) => {
              const fallback = `附件 ${i + 1}`;
              const name =
                attachedFileNames?.find((n) => n.fileId === id)?.name || fallback;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    // server metadata 暂未在 ChatMessage DTO 暴露 file url;
                    // 此处 chip 不再可以系统打开真实文件, 用 console 提示。
                    // 阶段 N 接 listFiles(id) 时再接 openWithSystem.
                    console.info(
                      `[gacode-electron] chat 附件 ${name} (id=${id}) — file url 暂未暴露, 走 listFiles API`,
                    );
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-bg-elevated text-xs text-fg-muted hover:text-fg hover:bg-bg-sunken cursor-pointer"
                  title={name}
                >
                  <FileGlyph />
                  <span className="truncate max-w-[180px]">{name}</span>
                </button>
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

        {/* chat-id-9: 知识库引用折叠条 (在气泡底部, 跟 web MessageBubble 同款) */}
        {knowledgeRefs && knowledgeRefs.length > 0 ? (
          <ReferenceFold ids={knowledgeRefs} />
        ) : null}
      </div>

      {/* 阶段 8 — 消息 ⋮ 菜单 (PC 端常显, 不依赖 hover) */}
      {onAction ? (
        <div className="shrink-0 pt-1">
          <MessageMenu
            role="user"
            messageId={messageId}
            content={content}
            createdAt={createdAt}
            onActionDone={onAction}
          />
        </div>
      ) : null}
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
  recalled,
  recalledAt,
  onAction,
  createdAt,
  messageId,
  knowledgeRefs,
  quotedMessageId,
  quotedContent,
  streamingSince,
  toolTotalMs,
  callTree,
}: Pick<
  MessageBubbleProps,
  | "content"
  | "richEvents"
  | "isStreaming"
  | "recalled"
  | "recalledAt"
  | "onAction"
  | "createdAt"
  | "knowledgeRefs"
  | "quotedMessageId"
  | "quotedContent"
  | "streamingSince"
  | "toolTotalMs"
  | "callTree"
> & { messageId: string }) {
  const showCursor = !!isStreaming;
  const hasRichEvents = !!richEvents && richEvents.length > 0;
  const hasCallTree = !!callTree && callTree.length > 0;
  const hasContent = !!content && content.trim().length > 0;

  if (recalled) {
    return (
      <div className="flex justify-start items-start gap-1.5">
        <RecalledPlaceholder
          side="assistant"
          recalledAt={recalledAt}
          createdAt={createdAt}
        />
        {/* assistant 菜单也在 (复制 / 保存到知识库) — 但 web 习惯 recalled 后整菜单不下.
            这边为统一, recalled 时 MessageMenu 自己不挂 (见 MessageMenu 的判定). */}
      </div>
    );
  }

  // 空 + 没事件 → 完全不渲染 (流式刚开始那两个 frame)
  if (!hasContent && !hasRichEvents && !hasCallTree) return null;

  return (
    <div className="flex justify-start items-start gap-1.5">
      <div className="max-w-[85%] space-y-1">
        {/* chat-id-40: 引用块 (assistant 也可能引用 user 消息) */}
        {quotedContent ? (
          <QuoteReplyBlock
            content={quotedContent}
            from="user"
            messageId={quotedMessageId}
          />
        ) : null}

        {/* chat-id-12: 链路树卡片 (从 chunk.events 解析, 整棵树挂到气泡顶部) */}
        {hasCallTree ? <CallTreeCard nodes={callTree!} /> : null}

        {/* 工具 / 富事件 — 在正文之前 (server 累积顺序跟到末尾顺序一致) */}
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

        {/* 流式态: 还没收到任何文字但有事件 → 显示占位 */}
        {isStreaming && !hasContent && !hasRichEvents && !hasCallTree ? (
          <TypingDots />
        ) : null}

        {/* chat-id-9: assistant 也支持 knowledge_refs (server 暂未回传, 解析就位) */}
        {knowledgeRefs && knowledgeRefs.length > 0 ? (
          <ReferenceFold ids={knowledgeRefs} />
        ) : null}

        {/* chat-id-20: 助手气泡底部「已执行 X 秒」 / 「用时 X」 */}
        <ExecutionTiming
          runningSince={isStreaming ? streamingSince ?? null : null}
          completedMs={!isStreaming && toolTotalMs != null ? toolTotalMs : null}
        />
      </div>

      {/* 阶段 8 — 消息 ⋮ 菜单 + 0.7.5 chat-id-27 TTS */}
      {onAction || hasContent ? (
        <div className="shrink-0 pt-1 flex flex-col items-center gap-1">
          {hasContent ? (
            <TtsButton content={content} disabled={isStreaming} />
          ) : null}
          {onAction ? (
            <MessageMenu
              role="assistant"
              messageId={messageId}
              content={content}
              createdAt={createdAt}
              isStreaming={isStreaming}
              onActionDone={onAction}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// RecalledPlaceholder — 跟 web "已撤回了一条消息" 同款; 用户/助手共用
// ────────────────────────────────────────────────────────────
function RecalledPlaceholder({
  side,
  recalledAt,
  createdAt,
}: {
  side: "user" | "assistant";
  recalledAt?: string | null;
  createdAt?: string;
}) {
  // 用 recalledAt (撤回时间) 或 createdAt 显示相对时间; 都缺就退到空
  const ts = recalledAt || createdAt;
  const ago = ts ? formatAgo(ts) : "";
  const text =
    side === "user" ? "你撤回了一条消息" : "AI 撤回了一条消息";
  return (
    <div
      role="note"
      data-testid="msg-recalled-placeholder"
      className="rounded-md bg-bg-sunken/60 text-fg-muted border border-border px-3 py-1.5 text-xs italic flex items-center gap-1.5"
    >
      <span>{text}</span>
      {ago ? <span className="opacity-70 not-italic">· {ago}</span> : null}
    </div>
  );
}

function formatAgo(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "";
    const dt = Date.now() - t;
    if (dt < 0) return "";
    const sec = Math.floor(dt / 1000);
    if (sec < 60) return `${sec} 秒前`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} 分钟前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} 小时前`;
    const day = Math.floor(hr / 24);
    return `${day} 天前`;
  } catch {
    return "";
  }
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

export function MessageBubble(props: MessageBubbleProps & { messageId: string }) {
  // 0.7.5: 拆出新字段分别传递, 不走 spread (避免某些 React 版本把未知 prop 推到 DOM).
  const {
    knowledgeRefs,
    quotedMessageId,
    quotedContent,
    streamingSince,
    toolTotalMs,
    callTree,
    ...rest
  } = props;
  const bubbleProps = {
    ...rest,
    knowledgeRefs,
    quotedMessageId,
    quotedContent,
    streamingSince,
    toolTotalMs,
    callTree,
  };
  return rest.role === "user" ? (
    <UserBubble {...bubbleProps} />
  ) : (
    <AssistantBubble {...bubbleProps} />
  );
}