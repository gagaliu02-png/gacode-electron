/**
 * components/chat/MessageBubble.tsx — 阶段 2 单条消息气泡 (阶段 8 加 ⋮ 菜单)
 *
 * 角色:
 *   - user      → 右对齐, brand 容器色, 圆角, 文字 / 图片 / 文件 chip
 *   - assistant → 左对齐, sunken 容器色, 圆角, Markdown 渲染, 工具事件
 *
 * 跟 web MessageBubble.tsx M2/M3 同源风格 (props + 状态机), 但代码全部自写.
 * markdown 走**自研管线** (`lib/markdown.tsx` → `lib/markdown/renderer.tsx`),
 * 行为基准 = 安卓 (`docs/md-android-behavior-spec.md`).
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
 *   - chat-id-27: assistant 气泡右侧挂 TtsButton (TTS 朗读)
 *   - chat-id-40: 顶部挂 QuoteReplyBlock (引用 / 回复 块)
 *
 * M3 批次 (2026-10-26):
 *   - A2-D4-04: **user 气泡正文从纯文本改成 Markdown 渲染**
 *   - A2-D4-03: user 气泡 markdown **反色** (code / pre / a 走 primary-foreground)
 *   - A2-D4-06: assistant 气泡渲染前 **剥掉 user 已上传图的引用**
 *                (`stripReferencedImageUrls`, 抄 web `MessageBubble.tsx:141-198`)
 *   - A2-D4-02: `ExecutionTiming` 换成 `ExecutionTimeline` (思考 / 工具时间线,
 *                挂在正文**上方**, 对齐 web `MessageBubble.tsx:396-398`)
 *
 * 父组件拿到 recalled=true 时**不传 menu** — 这个组件再卡一道防误调.
 */

import { useEffect, useState, type ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Markdown } from "../../lib/markdown";
import { RichEventBubble, type RichEvent } from "./RichEventBubble";
import { MessageMenu, type MessageAction } from "./MessageMenu";
import { ReferenceFold } from "./ReferenceFold";
import { QuoteReplyBlock } from "./QuoteReplyBlock";
import { TtsButton } from "./TtsButton";
import { ExecutionTimeline, type ExecutionPhase } from "./ExecutionTimeline";
import { CallTreeCard, type CallTreeNode } from "./CallTreeCard";
import { FileIcon } from "../ui/Glyphs";
// ★ 重构轮 R2-PC (T-12): 终态分类的**表现形态**归到 sse/ 那一套 ——
//   `presentTerminal` 是**唯一**的「终态 ⇒ 端侧文案/语气/要不要撤正文」判据。
import { isTerminalReason, presentTerminal } from "../../lib/sse/terminal";

// ============================================================================
// A2-D4-06 · 渲染层剥图 (抄 web `gacode-web/src/components/chat/MessageBubble.tsx:133-198`)
// ============================================================================

/**
 * URL normalize helpers —— 解决「stream-end / 刷新页面后 server 重签 URL 导致
 * 两边字符串不一致」的 bug:
 *   用户上传时拿到的签名 URL (`?exp=E_upload&sig=S_upload`) 落库到
 *   `metadata.image_urls`; getHistory 时 server 会**重新签名** (new exp / new sig),
 *   两边 query string 不再相等 ⇒ 严格相等匹配永远 false ⇒ user 图剥不掉。
 *   用 **base path** 比较就能稳定命中。
 *
 * 仅渲染层归一, **不动** server 端的重签逻辑 (nginx secure_link 依赖那个 sig)。
 */
function stripUrlQuery(u: string): string {
  return u.split("?")[0];
}

function normalizeUrls(urls: string[]): string[] {
  return urls.map(stripUrlQuery);
}

/**
 * 从 assistant content 里剥除「已经被当前 chat 中 user message 上传过」的所有
 * imageUrl 引用. 纯字符串变换, **不**修改原始 message.content, 只在渲染前对
 * 送进 Markdown 的字符串做一次性过滤. 三种 markdown 形式都覆盖:
 *
 *   1. `![alt](URL)`  —— 标准 markdown 图片语法
 *   2. `[text](URL)`  —— 链接形态 (LLM 可能用 markdown link 而不是 image 引用图)
 *   3. 裸 URL (前后空白 / 行首行尾) —— 也可能直接出现 URL 而无 markdown 包裹
 *
 * 边界:
 *   - content 为空 / urlsToStrip 为空 → 短路返回原文 (避免 RegExp 空 pattern 触发 SyntaxError)
 *   - URL 含 regex metachar (?=) → 已转义, 不当作正则语法
 *
 * export 出来便于单测注入; 调用方在 `routes/ChatDetail.tsx` 算并集后透传.
 */
export function stripReferencedImageUrls(
  content: string,
  urlsToStrip: string[],
): string {
  if (!content) return content;
  if (!urlsToStrip || urlsToStrip.length === 0) return content;
  // 转义每个 URL 的 regex metachar (例如 ?, +, =, &). 单独 escape, 再用 | 串起来
  // 作为 alternation. URL 一般很长, 不需要担心回溯 (顺序 alternation + 量词只在内部).
  const escaped = normalizeUrls(urlsToStrip).map((u) =>
    u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  // 必须用 non-capturing group 包住 alternation, 否则 `\)` 之类只会关连到最后一个 URL,
  // 前面 URL 的尾括号会留在原位 (e.g. `![](A)` → 删 `![](A` 留 `)`).
  const urlAltGroup = `(?:${escaped.join("|")})`;
  let out = content;
  // 1) ![alt](URL) — 必须先剥, 否则会被 (2) 的 [text](URL) 也命中然后误删文本
  const imgRe = new RegExp(`!\\[[^\\]]*\\]\\(${urlAltGroup}\\)`, "g");
  out = out.replace(imgRe, "");
  // 2) [text](URL) — 任意文本链接, URL 命中即整段删 (LLM 偶尔会写 [图](url) 之类)
  const linkRe = new RegExp(`\\[[^\\]]+\\]\\(${urlAltGroup}\\)`, "g");
  out = out.replace(linkRe, "");
  // 3) 裸 URL — 仅匹配前后是空白或行首行尾的整段 URL, 避免误伤正文里的同名字符串
  //    用 (?=\s|$) 而不是 \b, 是因为 URL 含 =, :, / 等非 \w 字符, \b 边界判定不准
  //    replace 用 "$1" 保留前导空白 (行首或 \s), 否则会把它一起吞掉, 破坏 Markdown 段落布局.
  const bareRe = new RegExp(`(^|\\s)${urlAltGroup}(?=\\s|$)`, "g");
  out = out.replace(bareRe, "$1");
  // 兜底: 剥取后可能留下连续空行 (图片占位行被删后, 上下换行连成 3+ 换行),
  // 压成 2 换行, 不破坏段内 \n\n 语义 (Markdown 用 \n\n 切段落)
  out = out.replace(/\n{3,}/g, "\n\n");
  return out;
}

/**
 * A2-D4-03 · user 气泡 markdown **反色** (抄 web `MessageBubble.tsx:340-342`).
 *
 * user 气泡底色是 brand 橙 (`bg-primary`) + 黑字 (`text-primary-foreground`),
 * markdown 里默认的深色 code / pre 底 + brand 橙链接在橙底上看不清 ⇒ 反色。
 *
 * ⚠️ `!` 前缀 = `!important` —— 必须压过 `globals.css` 末尾 M2 段里**未分层**的
 *    `.md-inline-code` / `.md-code-run` / `.md-link` 规则。
 */
const USER_MARKDOWN_WRAPPER_CLASS =
  "[&_code]:!bg-primary-foreground/20 [&_pre]:!bg-primary-foreground/10 [&_blockquote]:!border-primary-foreground/40 [&_a]:!text-primary-foreground";

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
  /**
   * A2-D4-02 · 思考 / 工具时间线 (assistant 才有).
   * 数据源 = `routes/ChatDetail.tsx` 流式累积的 `chunk.reasoning` + tool 事件.
   */
  phases?: ExecutionPhase[];
  /**
   * A2-D4-06 · 渲染前剥除的 URL 集合 —— 当前 chat 中所有 user message 已上传过的
   * imageUrls. 用于在 assistant 气泡渲染前, 把 AI 回复里引用了 user 已发图的
   * markdown 片段 (`![alt](URL)` / `[text](URL)` / 裸 URL) 整段去掉.
   * 这是**渲染层过滤**, 不改 message.content, 也不改 server 端 prompt.
   * 不传 / 空数组 → 不过滤.
   */
  stripImageUrls?: string[];
  /** chat-id-12: 链路树节点 (从 chunk.events 解析). 缺省 → 走 RichEventBubble 单卡片 */
  callTree?: CallTreeNode[];
  // ====== 重构轮 R2-web · 四要素 (服务端权威) + 本地时钟兜底 ======
  /**
   * ★ 服务端算的累计耗时 (ms) —— 四要素之一 (T-15 / 架构 §2.5)。
   *   **优先**用它显示「已执行 N 秒」; 没有 (老服务端) 才落回本地时钟。
   */
  elapsedMs?: number | null;
  /** ★ 服务端给的**逻辑**工具调用次数 (T-17) —— 有值则端侧不数帧。 */
  toolCallCount?: number | null;
  /** ★ 服务端给的**逻辑**思考段数 (T-16) —— 有值则端侧不数帧。 */
  thinkingCount?: number | null;
  /**
   * ★ 终态分类 (T-12): completed / cancelled / filtered / failed / upstream_lost。
   *   `filtered` = 天眼命中 ⇒ 正文已被端侧撤掉 (purge)。
   */
  terminalReason?: string | null;
  /**
   * 本轮开始时刻 (ms epoch) —— **本地时钟兜底**用 (老服务端没有帧级 elapsedMs)。
   * ⚠️ 服务端给了 `elapsedMs` 时不用它。
   */
  startedAt?: number | null;
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
  const timeAgo = createdAt ? formatAgo(createdAt) : "";

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
                  <FileIcon size={12} strokeWidth={1.6} />
                  <span className="truncate max-w-[180px]">{name}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {/* 文字气泡 — 对齐 web MessageBubble.tsx:359-372:
            底色 bg-primary (brand 橙) + 黑字 text-primary-foreground,
            右下角 4px 小圆角 (rounded-br-[4px]), 主圆角 16px.
            时间戳在气泡**内** (web footer 行) — 橙底上必须是深色字才看得见.
            ⚠️ A2-D4-04: 正文走 Markdown 渲染 ⇒ 外层**不再**挂 whitespace-pre-wrap
               (段落间距由 `.md-para` 接管, 叠加会多出空行). */}
        {content ? (
          <div className="rounded-[16px] rounded-br-[4px] bg-primary text-primary-foreground px-4 py-3 text-sm leading-relaxed shadow-sm break-words">
            {/* A2-D4-03: user 气泡 markdown 反色 (code / pre / a) */}
            <div className={USER_MARKDOWN_WRAPPER_CLASS}>
              <Markdown>{content}</Markdown>
            </div>
            {timeAgo ? (
              <div className="mt-1 flex items-center gap-1 justify-end">
                <span className="text-[10px] text-primary-foreground/50">
                  {timeAgo}
                </span>
              </div>
            ) : null}
          </div>
        ) : timeAgo ? (
          /* 无文字 (纯图片/附件) 时时间戳单独一行, 用页面可读的弱化色 */
          <div className="mt-1 flex items-center gap-1 justify-end">
            <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
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
  phases,
  stripImageUrls,
  callTree,
  elapsedMs,
  toolCallCount,
  thinkingCount,
  terminalReason,
  startedAt,
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
  | "phases"
  | "stripImageUrls"
  | "callTree"
  | "elapsedMs"
  | "toolCallCount"
  | "thinkingCount"
  | "terminalReason"
  | "startedAt"
> & { messageId: string }) {
  const showCursor = !!isStreaming;
  const hasRichEvents = !!richEvents && richEvents.length > 0;
  const hasCallTree = !!callTree && callTree.length > 0;
  const hasContent = !!content && content.trim().length > 0;
  const hasPhases = !!phases && phases.length > 0;
  const timeAgo = createdAt ? formatAgo(createdAt) : "";

  // ====== M2 2A P0-3 实时秒表 (对齐 web `MessageBubble.tsx:221-251`) ======
  // ★ R2-web (T-15): 耗时**优先**用服务端帧里的 `elapsedMs` (四要素之一, 权威值);
  //   本地时钟 (startedAt + now) 只作**兜底** —— 老服务端没有这个字段。
  // ⚠️ hook 必须挂在任何 early return 之前 (下面 recalled / 空内容会 return)。
  const isRunning = !!isStreaming && startedAt != null;
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!isRunning) return;
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning, startedAt]);

  const elapsedSec = (() => {
    // 1) 服务端权威值 —— **优先**
    if (typeof elapsedMs === "number" && Number.isFinite(elapsedMs)) {
      return Math.max(0, Math.floor(elapsedMs / 1000));
    }
    // 2) 本地时钟兜底 (老服务端)
    if (startedAt == null) return 0;
    const end = isRunning ? nowMs : null;
    if (end == null) return 0;
    return Math.max(0, Math.floor((end - startedAt) / 1000));
  })();
  const showTimer = startedAt != null || elapsedMs != null;

  // ====== ★ R2-PC (T-12): 终态分类 ⇒ 端侧表现 ======
  //   五类终态各有各的形态 (completed / cancelled / filtered / failed /
  //   upstream_lost) —— 判据只有 `sse/terminal.ts` 这一处 (端侧不另写一套)。
  //   `completed` 是常态 ⇒ 不额外标一行 (免得每条正常回复都挂个「已完成」)。
  const terminalView = isTerminalReason(terminalReason)
    ? presentTerminal(terminalReason)
    : null;
  const showTerminalBadge =
    terminalView != null && terminalView.form !== "answer";

  // A2-D4-06: 渲染前剥掉 user 已上传过的图引用 (不改原始 content)
  const markdownContent = stripReferencedImageUrls(content, stripImageUrls ?? []);

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
  if (!hasContent && !hasRichEvents && !hasCallTree && !hasPhases) return null;

  return (
    <div className="flex justify-start items-start gap-1.5">
      <div className="max-w-[80%] space-y-1">
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

        {/* Markdown 正文 — 对齐 web MessageBubble.tsx:372:
            bg-background + border border-border, 左下角 4px 小圆角 (rounded-bl-[4px]).
            时间戳在气泡**内**的 footer 行 (web MessageBubble.tsx:494-510).
            ⚠️ 气泡在「有正文**或**有 phases」时都渲染 —— 跟 web 一致:
               思考还没产出正文时, 时间线就已经可见 (web 的气泡容器无条件渲染). */}
        {hasContent || hasPhases ? (
          <div className="rounded-[16px] rounded-bl-[4px] bg-background border border-border text-foreground px-4 py-3 text-sm leading-relaxed shadow-sm">
            {/* A2-D4-02: 思考 / 工具时间线 (正文**上方**, 对齐 web MessageBubble.tsx:396-398).
                phases 为空 ⇒ 组件自身 return null ⇒ 不渲染空框.
                ★ R2-web (T-16 / T-17): 计数用服务端的**权威值**, 没有才端侧兜底数。 */}
            <ExecutionTimeline
              phases={phases ?? []}
              toolCallCount={toolCallCount}
              thinkingCount={thinkingCount}
            />
            {hasContent ? (
              <>
                <Markdown>{markdownContent}</Markdown>
                {showCursor ? (
                  <span
                    aria-hidden="true"
                    className="inline-block w-2 h-3 bg-current animate-pulse rounded-sm"
                  />
                ) : null}
              </>
            ) : null}
            {/* ★ R2-PC (T-12): 终态标记 —— 只有「非正常完成」才显形。
                ⛔ 天眼 (filtered) 不是错误 ⇒ 用 warn 语气, 不弹红色报错。 */}
            {showTerminalBadge && terminalView ? (
              <div
                data-testid="terminal-badge"
                data-terminal={terminalView.reason}
                className={[
                  "mt-1 text-[11px]",
                  terminalView.tone === "danger"
                    ? "text-destructive"
                    : terminalView.tone === "warn"
                      ? "text-amber-600"
                      : "text-muted-foreground",
                ].join(" ")}
              >
                {terminalView.label}
              </div>
            ) : null}
            {timeAgo || showTimer ? (
              <div className="mt-1 flex items-center gap-1 justify-start">
                {timeAgo ? (
                  <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
                ) : null}
                {/* ★ R2-web (T-15): 秒表 —— 服务端 elapsedMs 优先, 本地时钟兜底。 */}
                {showTimer ? (
                  <span
                    data-testid="execution-timer"
                    aria-label={
                      isRunning ? `已执行 ${elapsedSec} 秒` : `共执行 ${elapsedSec} 秒`
                    }
                    className="text-[10px] text-muted-foreground tabular-nums"
                  >
                    {isRunning ? "已执行" : "共执行"} {elapsedSec}s
                  </span>
                ) : null}
              </div>
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
      className="rounded-[8px] bg-muted/60 text-muted-foreground border border-border px-3 py-1.5 text-xs italic flex items-center gap-1.5"
    >
      <span>{text}</span>
      {ago ? <span className="opacity-70 not-italic">· {ago}</span> : null}
    </div>
  );
}

// 相对时间 — 对齐 web MessageBubble.tsx:335-337:
//   formatDistanceToNow(new Date(createdAt), { addSuffix: true, locale: zhCN })
// 文案: 「大约 1 分钟前」/「大约 2 小时前」/「10月20日」
function formatAgo(iso: string): string {
  try {
    const t = new Date(iso);
    if (Number.isNaN(t.getTime())) return "";
    return formatDistanceToNow(t, { addSuffix: true, locale: zhCN });
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

// ────────────────────────────────────────────────────────────
// 主入口
// ────────────────────────────────────────────────────────────

export function MessageBubble(props: MessageBubbleProps & { messageId: string }) {
  // 0.7.5: 拆出新字段分别传递, 不走 spread (避免某些 React 版本把未知 prop 推到 DOM).
  const {
    knowledgeRefs,
    quotedMessageId,
    quotedContent,
    phases,
    stripImageUrls,
    callTree,
    ...rest
  } = props;
  const bubbleProps = {
    ...rest,
    knowledgeRefs,
    quotedMessageId,
    quotedContent,
    phases,
    stripImageUrls,
    callTree,
  };
  return rest.role === "user" ? (
    <UserBubble {...bubbleProps} />
  ) : (
    <AssistantBubble {...bubbleProps} />
  );
}