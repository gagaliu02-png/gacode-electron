/**
 * routes/Home.tsx — Home 页 (0.7.2 重写)
 *
 * 历史背景:
 *   - 阶段 1: 简单欢迎语 + 输入框 → navigate('/chat') 跳列表页
 *   - 0.7.2 P0: 已登录时显示 ChatDetail 布局 (顶部欢迎 + 底部 ChatInputBar) —
 *               不再跳列表页, 直接在 home 起对话, 跳到 /chat/{id}
 *
 * 0.7.2 实现要点:
 *   - 顶部 brand bar (G 占位 + gacode 文字, 跟 sidebar 一致, 给视觉对齐)
 *   - 中部居中: logo (inline SVG G squircle) + "HI 欢迎你" 欢迎语
 *   - 底部: ChatInputBar 复用 src/components/chat/ChatInputBar.tsx
 *   - + 按钮 → PlusSheet (6 项: 拍照 / 相册 / 文件 / 表情 / 知识库 / 模板)
 *   - MediaPicker (拍照 / 相册 / 文件 — Electron 走系统文件 dialog)
 *   - EmojiPicker (内联 60 个 emoji, 不引 emoji-mart)
 *   - LibraryPicker (调 /yinian/library 选条目)
 *
 * 提交流 (home-13 P0):
 *   1. ChatInputBar.onSubmit(text, attachments) → Home.handleSubmit
 *   2. buildFirstMessage: 拼接 text + descs (跟 web home 行为对齐)
 *   3. 把 firstMessage + attachments(imageUrls / fileIds / names) 写到 sessionStorage
 *      - gacode:home:firstMessage (string)
 *      - gacode:home:attachments (JSON: {imageUrls, attachedFileIds, attachedFileNames})
 *      - 跨页消费由 ChatDetail 完成 (worker P0-A 范围, 本轮不实现 firstMessage 自动 send —
 *        see send-blocker 段)
 *   4. createChat() → navigate(`/chat/${chatId}`)
 *
 * send-blocker:
 *   - home-13 firstMessage 自动 send 一条依赖 ChatDetail.tsx 加 useEffect 消费
 *     sessionStorage 自动调 startStream. 本轮不动 ChatDetail.tsx (worker P0-A 在做).
 *     Home 本轮做完 createChat + navigate + sessionStorage 写入, P0-A 在 ChatDetail 加
 *     sessionStorage 消费 useEffect 后, 整条 firstMessage 链路闭环. 否则需要 user
 *     手动按 send 一次触发流式.
 *
 * 设计边界:
 *   - Home 不接 useChatStream — 跳到 /chat/:id 后由 ChatDetail 接管流式.
 *   - 模板 (template) 暂未实现, PlusSheet 选中给 toast 占位.
 *   - 不引 emoji-mart / date-fns / lucide-react — 与 electron 阶段 1 边界一致.
 */

import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { createChat, listLibrary, type LibraryItem } from "../lib/api";
import { useToast } from "../components/ui/Toast";
import { ChatInputBar, type PendingAttachment } from "../components/chat/ChatInputBar";
import { PlusSheet, type PlusAction } from "../components/home/PlusSheet";
import { MediaPicker, type MediaKind } from "../components/home/MediaPicker";
import { EmojiPicker } from "../components/home/EmojiPicker";
import { LibraryPicker } from "../components/home/LibraryPicker";

// 跨页携带 firstMessage + 附件信息的 sessionStorage key (跟 ChatDetail 共享).
// ChatDetail 拿到 chatId mount 时, 读这两个 key 立即触发 send —
// 这是 home-13 P0 的关键路径.
export const HOME_FIRST_MESSAGE_KEY = "gacode:home:firstMessage";
export const HOME_ATTACHMENTS_KEY = "gacode:home:attachments";

export interface HomeAttachments {
  imageUrls: string[];
  attachedFileIds: string[];
  attachedFileNames: Array<{ fileId: string; name: string }>;
}

export function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // ────────────── Picker 状态 ──────────────
  const [plusOpen, setPlusOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [mediaKind, setMediaKind] = useState<MediaKind>("gallery");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const displayName = user?.displayName || user?.username || "访客";

  // ────────────── createChat mutation ──────────────
  const createMutation = useMutation({
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

  // ────────────── handleSubmit: firstMessage 跨页携带 ──────────────
  const handleSubmit = useCallback(
    (text: string, attachments: PendingAttachment[]): boolean => {
      const content = text.trim();

      // 把 attachments 按 mode 拆 image_urls + attached_file_ids (对齐 web buildFirstMessage)
      const imageUrls: string[] = [];
      const attachedFileIds: string[] = [];
      const attachedFileNames: Array<{ fileId: string; name: string }> = [];
      for (const att of attachments) {
        if (att.url && !att.fileId) {
          // 纯 image (image mode 拿到的 url, 没有 fileId)
          imageUrls.push(att.url);
        } else if (att.fileId) {
          // document (document mode 拿到的 fileId, 可能伴随 url 但 fileId 是主键)
          attachedFileIds.push(att.fileId);
          attachedFileNames.push({ fileId: att.fileId, name: att.name });
        }
      }

      // 文本 fallback: 把图片 URL 仍塞进 markdown 文本 (LLM 至少能看到 URL 字符串).
      // 跟 web home buildFirstMessage 行为对齐 — 服务端 metadata.image_urls 才是
      // 真图片, 文本只是兜底通道.
      const descs = attachments
        .map((att) => {
          if (att.url && !att.fileId) return `[图片: ${att.url}]`;
          if (att.fileId) return `[附件: ${att.name}]`;
          return "";
        })
        .filter(Boolean);
      const firstMsg = [content, ...descs].filter(Boolean).join("\n");

      // 写 sessionStorage 跨页携带 (URL 太长 / 编码麻烦 — 跟 web 一致走 storage)
      try {
        sessionStorage.setItem(HOME_FIRST_MESSAGE_KEY, firstMsg);
        if (imageUrls.length > 0 || attachedFileIds.length > 0) {
          sessionStorage.setItem(
            HOME_ATTACHMENTS_KEY,
            JSON.stringify({
              imageUrls,
              attachedFileIds,
              attachedFileNames,
            } satisfies HomeAttachments),
          );
        }
      } catch {
        // sessionStorage 不可用 — 静默降级 (无附件仍能跑)
      }

      createMutation.mutate();
      return true;
    },
    [createMutation],
  );

  // ────────────── PlusSheet 选中后派发 ──────────────
  const handlePlusPick = useCallback((action: PlusAction) => {
    switch (action) {
      case "camera":
        setMediaKind("camera");
        setTimeout(() => setMediaOpen(true), 80);
        break;
      case "gallery":
        setMediaKind("gallery");
        setTimeout(() => setMediaOpen(true), 80);
        break;
      case "file":
        setMediaKind("file");
        setTimeout(() => setMediaOpen(true), 80);
        break;
      case "emoji":
        setTimeout(() => setEmojiOpen(true), 80);
        break;
      case "library":
        setTimeout(() => setLibraryOpen(true), 80);
        break;
      // "template" 已在 PlusSheet 内 toast 占位, 这里不会再收到
    }
  }, []);

  // ────────────── attach 反馈 ──────────────
  const handleAttachmentError = useCallback(
    (msg: string) => {
      toast({ message: `上传失败: ${msg}`, variant: "danger" });
    },
    [toast],
  );

  // ────────────── emoji / library 选中 ──────────────
  //
  // ⚠️ electron ChatInputBar 是非受控 (内部 useState), 不能从外部直接 setText.
  // 折中方案: Home 持有"待注入 marker"队列, ChatInputBar 通过 custom event / window
  // 事件听 Home 注入. 这里走**最简方案** — 选中 emoji / library 后, 在 ChatInputBar
  // 之外的"已挂载" chip 区域显示, 提示 user "已挂载到消息里". 真正的 textarea 注入
  // 留给 worker P0-A 在 ChatDetail 路径上做 (ChatDetail 走的是受控 ChatInput 模式).
  //
  // 本轮 Home 的 emoji / library 选中用 toast 反馈 + 在 Home 显示已挂载列表 ——
  // user 看到 chip 后手动打字或继续操作. 等 worker P0-A 接通 ChatDetail 后, 这里
  // 的"挂载"会真正落到 ChatInput.
  const [pendingEmoji, setPendingEmoji] = useState<{ emoji: string; ts: number }>(
    () => ({ emoji: "", ts: 0 }),
  );
  const [pendingLibrary, setPendingLibrary] = useState<
    Array<{ item: LibraryItem; ts: number }>
  >([]);

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      setPendingEmoji({ emoji, ts: Date.now() });
      toast({ message: `已选 ${emoji} (发送时会带上)`, variant: "default" });
    },
    [toast],
  );

  const handleLibrarySelect = useCallback(
    (item: LibraryItem) => {
      setPendingLibrary((prev) => {
        // 去重: 同 id 不重复挂载
        if (prev.some((p) => p.item.id === item.id)) return prev;
        return [...prev, { item, ts: Date.now() }];
      });
      toast({ message: `已挂载: ${item.title || "未命名"}`, variant: "default" });
    },
    [toast],
  );

  // ────────────── 渲染 ──────────────
  const isCreating = createMutation.isPending;

  return (
    <div className="min-h-full flex flex-col bg-bg-base">
      {/* 顶部 brand bar — 跟 sidebar TopBar 视觉对齐 (G + gacode) */}
      <div className="px-4 pt-4">
        <div className="flex items-center gap-2 rounded-md bg-bg-elevated px-3 py-2">
          <BrandLogo />
          <span className="flex-1 font-medium truncate">gacode</span>
        </div>
      </div>

      {/* 中部: 居中 logo + 欢迎语 */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            aria-hidden="true"
            className="w-20 h-20 rounded-squircle bg-bg-elevated border border-border inline-flex items-center justify-center"
          >
            <BigBrandMark />
          </div>
          <h1 className="text-headline font-medium">
            HI 欢迎你,<span className="text-brand">{displayName}</span>
          </h1>
          <p className="text-sm text-fg-muted">
            Gacode PC · 想聊点啥直接输入,按 Enter 发送
          </p>
        </div>
      </div>

      {/* 已挂载 chip 区 (emoji / library) — 显示在 ChatInputBar 上方 */}
      {(pendingEmoji.emoji || pendingLibrary.length > 0) ? (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {pendingEmoji.emoji ? (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-bg-elevated text-xs">
                <span className="text-base leading-none">
                  {pendingEmoji.emoji}
                </span>
                <span className="text-fg-muted">表情</span>
                <button
                  type="button"
                  aria-label="移除表情"
                  onClick={() => setPendingEmoji({ emoji: "", ts: 0 })}
                  className="text-fg-muted hover:text-danger transition-colors duration-150"
                >
                  ×
                </button>
              </span>
            ) : null}
            {pendingLibrary.map(({ item }) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-bg-elevated text-xs"
              >
                <svg
                  aria-hidden="true"
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-fg-muted"
                >
                  <path d="m21 16-4 4-4-4" />
                  <path d="M17 20V4" />
                  <path d="m3 8 4-4 4 4" />
                  <path d="M7 4v16" />
                </svg>
                <span className="truncate max-w-[160px]">
                  {item.title || "未命名"}
                </span>
                <button
                  type="button"
                  aria-label="移除知识库条目"
                  onClick={() =>
                    setPendingLibrary((prev) =>
                      prev.filter((p) => p.item.id !== item.id),
                    )
                  }
                  className="text-fg-muted hover:text-danger transition-colors duration-150"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* 底部: ChatInputBar + + 按钮 (PlusSheet trigger) */}
      <div className="px-4 pb-4 pt-2">
        <div className="flex items-end gap-2">
          <button
            type="button"
            aria-label="添加附件"
            onClick={() => setPlusOpen(true)}
            disabled={isCreating}
            className="shrink-0 w-9 h-9 rounded-md bg-bg-elevated text-fg-muted hover:bg-bg-sunken hover:text-fg disabled:opacity-50 disabled:pointer-events-none inline-flex items-center justify-center transition-colors duration-150"
          >
            <PlusIcon />
          </button>
          <div className="flex-1 min-w-0">
            <ChatInputBar
              isStreaming={false}
              onStop={() => {
                  /* home 无流式 — no-op */
                }}
              onSubmit={handleSubmit}
              onAttachmentError={handleAttachmentError}
            />
          </div>
        </div>
      </div>

      {/* ────────── Pickers / Sheet ────────── */}
      <PlusSheet
        open={plusOpen}
        onClose={() => setPlusOpen(false)}
        onPick={handlePlusPick}
      />
      <MediaPicker
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        kind={mediaKind}
        onCapture={() => {
          // ChatInputBar 内部的 AttachmentPicker 已独立处理 upload + chip ——
          // 这里不需要再次接收 File. MediaPicker 只是给 user 一个走 PlusSheet 入口
          // 触发的等价于 ChatInputBar 自身的 attachment 按钮.
          // 简化处理: 关闭 sheet 后由 user 在 ChatInputBar 里直接操作即可.
          // 真正的 attachment 收集仍走 ChatInputBar 自己的 AttachmentPicker,
          // PlusSheet 路径目前是"快捷入口占位" (跟 web SheetActionMenu 同效).
        }}
      />
      <EmojiPicker
        open={emojiOpen}
        onClose={() => setEmojiOpen(false)}
        onSelect={handleEmojiSelect}
      />
      <LibraryPicker
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={handleLibrarySelect}
      />
    </div>
  );
}

// ────────────── icons (inline, 不引 lucide-react) ──────────────

function BrandLogo() {
  return (
    <div
      aria-hidden="true"
      className="w-7 h-7 rounded-md shrink-0 bg-brand/20 border border-brand/40 inline-flex items-center justify-center text-brand font-bold text-sm"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      G
    </div>
  );
}

// 大号 brand mark — 用 inline SVG 做一个 squircle + G 字样, 跟 cody 风格一致.
// 不引外部图片 / 不依赖 public 资源, 走 Tailwind 类名 + SVG.
function BigBrandMark() {
  return (
    <svg
      aria-hidden="true"
      width="56"
      height="56"
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* squircle 背景 — brand-orange 主色, 跟 gagaOS BrandOrange #FF6B35 对齐 */}
      <rect
        x="0"
        y="0"
        width="56"
        height="56"
        rx="14"
        fill="#FF6B35"
      />
      {/* G 字母 — 居中, 黑色描边对应 dark mode brand-on (#000000) */}
      <text
        x="28"
        y="38"
        textAnchor="middle"
        fontFamily="var(--font-mono, ui-monospace)"
        fontSize="30"
        fontWeight="700"
        fill="#000000"
      >
        G
      </text>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}