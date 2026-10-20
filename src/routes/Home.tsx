/**
 * routes/Home.tsx — Home 页 (0.7.6 重写, 对齐 gacode-web)
 *
 * 历史:
 *   - 阶段 1: 简单欢迎语 + 输入框 → navigate('/chat') 跳列表页
 *   - 0.7.2 P0: 已登录时显示 ChatDetail 布局 (顶部欢迎 + 底部 ChatInputBar)
 *   - 0.7.6 (gaga 截图反馈 2026-10-20) — 5 项 Home 修复:
 *     ① 删顶部 brand bar — AppShell 已常驻 sidebar 含 brand, 重复
 *     ② ChatInputBar 接 onPlusClick, Home 不再画外置 + 按钮 (避免两个 +)
 *     ③ 附件 chip 走三态组件 (AttachmentChip / UploadProgressBar / UploadErrorChip)
 *     ④ emoji / 知识库选中 → 走 ChatInputBar 命令式 insertEmoji / insertText 插入到
 *        textarea, 不再是占位 chip (gagaOS 硬伤: 表情变成"附件")
 *     ⑤ AppShell 头部背景去掉, 跟 Home 同底色 (sidebar + main 视觉一体)
 *
 * 0.7.6 P0 (Home MediaPicker 接线, ddcc6cd 留 bug): PlusSheet → 拍照 / 相册 / 文件
 *   三条路径早期实现为 no-op (注释说"真正的 attachment 收集走 ChatInputBar 自己
 *   的 AttachmentPicker"), 但 ChatInputBar 内置 picker 已删 (统一收进 `+` Sheet),
 *   点完等于没反应 — 0.7.6 P0 接入真正的上传 + chip.
 *
 * 接线: MediaPicker 内部自带 file input (kind 自适配 capture / accept), `onCapture`
 *   直接拿 File → uploadAttachment (mode 按 mediaKind: camera/gallery → image,
 *   file → document) → inputBarRef.current.addAttachment(chip) — 跟 web 端
 *   page.tsx MediaPicker → upload.startUpload(file) 模式一致, 不在 Home 端另起
 *   3 个 hidden file input (那是 ChatDetail 的设计, 因为它不走 MediaPicker).
 *
 * 提交流 (home-13 P0):
 *   1. ChatInputBar.onSubmit(text, attachments) → Home.handleSubmit
 *   2. 把 firstMessage + attachments(imageUrls / fileIds / names) 写到 sessionStorage
 *      - gacode:home:firstMessage (string)
 *      - gacode:home:attachments (JSON: {imageUrls, attachedFileIds, attachedFileNames})
 *   3. createChat() → navigate(`/chat/${chatId}`)
 *
 * 设计边界:
 *   - Home 不接 useChatStream — 跳到 /chat/:id 后由 ChatDetail 接管流式.
 *   - 不引 emoji-mart / date-fns / lucide-react — 与 electron 阶段 1 边界一致.
 */

import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../lib/auth";
import { createChat, type LibraryItem } from "../lib/api";
import { useToast } from "../components/ui/Toast";
import {
  ChatInputBar,
  type ChatInputBarHandle,
  type PendingAttachment,
} from "../components/chat/ChatInputBar";
import { PlusSheet, type PlusAction } from "../components/home/PlusSheet";
import { MediaPicker, type MediaKind } from "../components/home/MediaPicker";
import { EmojiPicker } from "../components/home/EmojiPicker";
import { LibraryPicker } from "../components/home/LibraryPicker";
import { uploadAttachment, type UploadMode } from "../lib/upload";

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

// 附件上限 — 与 lib/upload.ts MAX_BYTES 对齐 (50MB).
// uploadAttachment 的 size 校验是**同步 throw**, 不在 promise 链里, 必须前置拦截,
// 否则异常从 handleMediaCapture 冒出 → .catch 走不到 → toast 不显示 (点了没反应).
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

/**
 * mediaKind → upload mode 映射.
 *   camera / gallery → image (两种都走 /yinian/upload 拿 URL)
 *   file            → document (走 /yinian/documents 拿 fileId, 入库 + OCR)
 */
function pickUploadMode(kind: MediaKind): UploadMode {
  return kind === "file" ? "document" : "image";
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

  // 0.7.6 — ChatInputBar 命令式 handle ref. EmojiPicker / LibraryPicker 选中后
  //   通过 ref 调 insertEmoji / insertText 注入 textarea, 不再用占位 chip.
  const inputBarRef = useRef<ChatInputBarHandle>(null);

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
  //
  // 0.7.6 P0 — 清理双前缀: ChatInputBar 内部 drop / paste / retry 上传失败时调
  //   onAttachmentError(msg), msg 已经走过 lib/upload.ts humanizeUploadError
  //   (例如 "图片上传失败: file too large" / "文档上传失败: 只支持 PDF / ..."),
  //   Home 不再二次加 "上传失败: " 前缀, 直接 toast. 跟 CollectSheet 上一轮修法一致.
  const handleAttachmentError = useCallback(
    (msg: string) => {
      toast({ message: msg, variant: "danger" });
    },
    [toast],
  );

  // ────────────── MediaPicker.onCapture — 拍照 / 相册 / 文件 接线 ──────────────
  //
  // 0.7.6 P0 (Home MediaPicker 接线, ddcc6cd 留 bug): 早期实现是 no-op 空函数
  //   (注释说"真正的 attachment 收集走 ChatInputBar 自己"), 但 ChatInputBar 内
  //   置 picker 已删, 等于选完文件没反应. 这里改成:
  //     1. 按 mediaKind 选 upload mode (camera/gallery → image, file → document)
  //     2. 前置拦截 50MB (uploadAttachment 同步 throw 走不到 .catch)
  //     3. uploadAttachment → 成功 → inputBarRef.current.addAttachment(chip)
  //     4. 失败 → toast 用 humanizeUploadError 已输出的人话文案 (不再加前缀)
  //
  // 不另起 3 个 hidden file input (那是 ChatDetail 的设计, 因为它不走 MediaPicker):
  //   MediaPicker 内部已自带 file input, capture / accept 按 kind 自适配,
  //   onCapture 直接拿 File — 跟 web 端 page.tsx MediaPicker → upload.startUpload
  //   模式一致, 简洁.
  //
  // mediaKind 从闭包取, 因为 handlePlusPick 是 setMediaKind 同步 + setMediaOpen(true) 80ms 后,
  // onCapture 触发时 React 已因 setMediaKind 重渲过一次, 闭包里 mediaKind 是最新值.
  const handleMediaCapture = useCallback(
    async (file: File) => {
      const mode = pickUploadMode(mediaKind);
      if (file.size > MAX_ATTACHMENT_BYTES) {
        toast({
          message: `文件超过 50MB 上限 (${Math.round(file.size / 1024 / 1024)}MB)`,
          variant: "danger",
        });
        return;
      }
      try {
        const res = await uploadAttachment(file, { mode }).promise;
        if (!res.url && !res.fileId) {
          toast({ message: "未拿到附件信息", variant: "danger" });
          return;
        }
        inputBarRef.current?.addAttachment({
          url: res.url,
          fileId: res.fileId,
          name: file.name,
          mime: file.type,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "aborted" || msg.includes("aborted")) return;
        // uploadAttachment 内部 humanizeUploadError 已输出人话 (例如 "图片上传失败: ..."),
        // 这里直接透传, 不再加 "上传失败: " 前缀 — 跟 handleAttachmentError 同款.
        toast({ message: msg, variant: "danger" });
      }
    },
    [mediaKind, toast],
  );

  // ────────────── emoji / library 选中 ──────────────
  //
  // 0.7.6 — 对齐 gacode-web: emoji / 知识库选中 → 走 ChatInputBar 命令式 ref,
  //   直接插入到 textarea 文本里, 不再是占位 chip + toast (gagaOS 硬伤: "表情就
  //   应该直接加载到输入框, 而不是表情变成一个像图片一样的附件").
  //   emoji 插到光标位置; 知识库条目插 `@[library:id] title` marker 到文本.
  const handleEmojiSelect = useCallback((emoji: string) => {
    inputBarRef.current?.insertEmoji(emoji);
    setEmojiOpen(false);
  }, []);

  const handleLibrarySelect = useCallback((item: LibraryItem) => {
    inputBarRef.current?.insertText(`@[library:${item.id}] ${item.title}`);
    setLibraryOpen(false);
  }, []);

  // ────────────── 渲染 ──────────────
  return (
    <div className="min-h-full flex flex-col bg-bg-base">
      {/* 中部: 居中 logo + 欢迎语
          0.7.6 — 删掉顶部 brand bar (gaga 截图反馈 §2: 重复), AppShell 的 sidebar
          已有 G + gacode 标识, Home 再画一次是冗余. */}
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

      {/* 底部: ChatInputBar (含 `+` 按钮, 由 ChatInputBar 自己提供)
          0.7.6 — 删掉 Home 外层独立的 `+` 按钮 (gaga 截图反馈 §4 补充: 两个 +
          重复). 现在用 onPlusClick 把 `+` 触发传到 PlusSheet, ChatInputBar 内
          置的 `+` 按钮负责 UI. ref 让 emoji / 知识库 选中后注入 textarea 文本. */}
      <div className="px-4 pb-4 pt-2">
        <ChatInputBar
          ref={inputBarRef}
          isStreaming={false}
          onStop={() => {
              /* home 无流式 — no-op */
            }}
          onSubmit={handleSubmit}
          onAttachmentError={handleAttachmentError}
          onPlusClick={() => setPlusOpen(true)}
        />
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
        onCapture={handleMediaCapture}
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