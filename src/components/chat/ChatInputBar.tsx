/**
 * components/chat/ChatInputBar.tsx — Phase 2/4 Chat input bar.
 *
 * 阶段 2 (已有):
 *   - textarea + send/stop toggle
 *   - chip row + progress bar
 *
 * 阶段 4 (已有):
 *   - 全局拖拽高亮 (dragenter/over/leave 跟踪 counter, drop 取消高亮 + 上传)
 *   - paste 图片: e.clipboardData.items 拿 image/* File → 走 uploadAttachment mode 'image'
 *
 * 0.7.5 (chat-id-22/25/30/33 整合 — gaga 截图反馈 6 条):
 *   - 内置 image / document / emoji / knowledge 4 个附件入口按钮 (gagaOS §④)
 *   - emoji 按钮 → EmojiPicker (复用 components/home/EmojiPicker.tsx) (gagaOS §③)
 *   - knowledge 按钮 → KnowledgeAttachSheet (调用 onKnowledgePick 回调) (gagaOS §②)
 *   - slash menu (chat-id-25) + 13 条命令派发
 *   - 单一 textarea (阶段 8 chat-id-19 跟 0.7.5 P1 f08e147 撞改: 删掉重复 textarea)
 *
 * 0.7.5 hotfix 2 (gaga 反馈 2026-10-20):
 *   - ❌ 删除原本的 4 个 inline 附件入口按钮 (image/document/emoji/knowledge)
 *   - ❌ 删除 EmojiPicker / KnowledgeAttachSheet 内部渲染 (改由 ChatDetail 拥有)
 *   - ✅ 只保留 1 个 `+` 圆形 icon button 在 textarea 左侧
 *   - ✅ 点 `+` → 调 onPlusClick 通知 ChatDetail, ChatDetail 弹 PlusActionsSheet
 *   - ✅ 通过 useImperativeHandle 暴露 `insertEmoji` / `addAttachment` / `focus`,
 *     让 ChatDetail 在 EmojiPicker 选中 / 文件上传完成后把数据写回 textarea/chips
 *   - 单一 textarea, drag 高亮, slash menu, send/stop/rerun 三态全部保留
 *   - drop 上传 + paste 图片: 仍由 ChatInputBar 自己处理 (chat-level, 不上传给 parent)
 *
 * 设计:
 *   - 拖拽高亮是全屏遮罩 + 品牌色边框 + 「拖入文件上传」文字 (非局域 hover)
 *   - counter 处理 dragenter/dragleave 嵌套 (fileSystem 控件会重复触发),
 *     drop 时 enter/leave 都要清零, leave 时若 ref 还在 body 外面也会清零.
 *   - emoji 选中插入到光标位置 (用 selectionStart/End)
 *   - `+` 按钮仅当 onPlusClick 提供时显示 (Home 等无 PlusActionsSheet 场景不显示);
 *     Home 自己的 + button 在 ChatInputBar 之外, 互不影响.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  uploadAttachment,
  deriveUploadMode,
  type UploadMode,
} from "../../lib/upload";
import { extractSingleImage } from "../../lib/clipboard";
import {
  ArrowUpIcon,
  PaperclipIcon,
  PlusIcon,
  RotateCcwIcon,
  StopSquareIcon,
} from "../ui/Glyphs";
import { SlashMenu, type SlashCommand } from "./SlashMenu";
import { AttachmentChip } from "./AttachmentChip";
import { UploadProgressBar } from "./UploadProgressBar";
import { UploadErrorChip } from "./UploadErrorChip";

/**
 * 附件项 — 三态合一 (gaga 截图反馈 2026-10-20 §3)
 *   旧实现: chips[] (done) + progress: number|null (uploading, 单根)
 *   新实现: 统一 attachments[], 每项自带 status, 支持多文件并发上传 + 错误重试.
 */
export type AttachmentItem =
  | {
      id: string;
      kind: "uploading";
      name: string;
      mime: string;
      pct: number;
      abort: () => void;
      file: File;
    }
  | {
      id: string;
      kind: "done";
      name: string;
      mime: string;
      url?: string;
      fileId?: string;
      /** 显式上传模式 — image 走 /yinian/upload 拿 url, document 走 /yinian/documents 拿 fileId.
       *  跟 web buildFirstMessage 按 mode 分流对齐 (2026-10-16 M-doc bug). */
      mode: UploadMode;
    }
  | {
      id: string;
      kind: "error";
      name: string;
      mime: string;
      errorMsg: string;
      file: File;
    };

export interface PendingAttachment {
  /** image mode -> url, document mode -> fileId; mutually exclusive */
  url?: string;
  fileId?: string;
  name: string;
  /**
   * 文件 MIME (image/png 等). 用于渲染缩略图 vs FileText 占位.
   * 0.7.6 引入 — 之前缺, AttachmentChip 缩略图条件全 false → 只显示 FileText 图标.
   * ChatInputBar 内部上传会带上 file.type; ChatDetail 调 addAttachment 时建议也传.
   */
  mime?: string;
  /**
   * 显式上传模式 — image 走 /yinian/upload 拿 url, document 走 /yinian/documents 拿 fileId.
   * 跟 web buildFirstMessage 按 mode 分流对齐 (2026-10-16 M-doc bug).
   */
  mode?: UploadMode;
}

/**
 * 父组件 (ChatDetail) 通过 ref 调用的命令式 API:
 *   - insertEmoji(emoji): 把 emoji 插到 textarea 光标位置 (EmojiPicker 选中后用) —
 *     等价 insertText 的别名, 保留兼容 ChatDetail.
 *   - insertText(text): 通用文本插入 — Home 的 LibraryPicker 选中知识库条目后
 *     注入 `@[library:id] title` marker (gaga 截图反馈 2026-10-20 §4).
 *   - addAttachment(att): 上传完成后把附件 chip 加到输入栏 (ChatDetail 走 file input 后用)
 *   - focus(): 让 textarea 拿回焦点 (EmojiPicker / KnowledgeAttachSheet 关闭后用)
 */
export interface ChatInputBarHandle {
  insertEmoji: (text: string) => void;
  insertText: (text: string) => void;
  /**
   * 插入知识库 marker `@[library:id] title` — 跟 web Home 的 onSelect 一致:
   * 插入位置前若不是空白, 自动补一个空格分隔 (避免跟正文粘连).
   * 跟 insertText 分开: emoji 不应该多空格.
   */
  insertLibraryMarker: (id: string, title: string) => void;
  addAttachment: (att: PendingAttachment) => void;
  focus: () => void;
  /**
   * 清空文本 + 附件 — Home 在 createChat 成功后调用.
   * 提交失败 (onSubmit 返回 false) 时 ChatInputBar 不会自行清空,
   * 附件得以保留, 用户可以重试 (F-03).
   */
  clear: () => void;
}

export interface ChatInputBarProps {
  /** Whether currently streaming — drives send vs stop button */
  isStreaming: boolean;
  /** Stop button callback */
  onStop: () => void;
  /**
   * Submit callback (Enter). Return false to keep the input intact (e.g. parent wants to retry on failure).
   * The default behavior (return undefined / true) extends the input + chips.
   */
  onSubmit: (text: string, attachments: PendingAttachment[]) => boolean | void;
  /** Attachment upload failed (parent usually toasts) */
  onAttachmentError?: (msg: string) => void;
  /**
   * 提交前提示 (上传中拦截 / 部分失败仍可发送).
   * 两段式 title + description —— 对齐 web `app/page.tsx:219-234` 的
   * toast({ title, description, variant }) (PC Toast 已支持双字段, S-04 已结案).
   * ⚠️ 只有 Home 页接这个 prop —— web 也只有 Home 有这两条 toast (chat 页没有).
   */
  onSubmitNotice?: (
    title: string,
    variant: "default" | "warning",
    description?: string,
  ) => void;
  /**
   * textarea placeholder — 不传时按 web 默认推导:
   * 流式 "AI 正在回复..." / 空闲 "说点什么… (Enter 发送，Shift+Enter 换行)".
   * Home 传 "说点什么…" (web Home 传的就是这个).
   */
  placeholder?: string;
  /**
   * 底部 caption — 默认 "AI 生成内容请核实重要信息" (web ChatInputBar 默认值).
   * 流式期间自动切成 "生成中 · 点击停止按钮中断".
   */
  caption?: string;
  /** 整体禁用 (e.g. 创建中) — 卡片降透明度 + textarea/发送按钮禁用 */
  disabled?: boolean;
  /**
   * 阶段 8 chat-id-19 — 重新生成按钮 callback.
   * canRerun=true 时, 右侧主按钮 (send/stop slot) 切换成 rerun 图标,
   * 点击 → onRerun() (parent 取消 + 重发最后一条 user 消息).
   * canRerun=false 时, 恢复 send 按钮 (行为不变).
   */
  canRerun?: boolean;
  onRerun?: () => void;
  /** chat-id-25: slash 命令菜单 — 接收 cmd 后 ChatInputBar 自动清除 '/' 前缀.
   *  ChatDetail 自实现 image/file/camera/knowledge 的真实行为 (走 PlusActionsSheet),
   *  translate/summary 仍由 ChatInputBar 自动插入中文模板到 textarea.
   *  其余 (search/template/voice) 默认 toast 占位. */
  onSlashCommand?: (cmd: SlashCommand) => void;
  /**
   * 0.7.5 hotfix 2 — `+` 按钮回调 (gagaOS 2026-10-20 反馈).
   *   提供时 → ChatInputBar 渲染 `+` 圆形按钮在 textarea 左侧,
   *     点击 → 调 onPlusClick (parent 弹 PlusActionsSheet).
   *   不提供时 → 按钮隐藏 (Home 等场景, Home 自己有外置 + button).
   */
  onPlusClick?: () => void;
}

const MAX_BYTES = 50 * 1024 * 1024;
const FILE_MIME_RE = /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif|pdf|docx?|xlsx?|txt)$/i;

// 0.7.5 chat-id-25 — slash 命令模板文本 (insert 类). 跟 web ChatInput 同款.
const SLASH_TEMPLATES: Record<string, string> = {
  translate: "请把以下内容翻译成中文:\n",
  summary: "请用 5 个要点总结以下内容:\n",
};

export const ChatInputBar = forwardRef<ChatInputBarHandle, ChatInputBarProps>(
  function ChatInputBar(
    {
      isStreaming,
      onStop,
      onSubmit,
      onAttachmentError,
      onSubmitNotice,
      placeholder,
      caption = "AI 生成内容请核实重要信息",
      disabled = false,
      canRerun = false,
      onRerun,
      onSlashCommand,
      onPlusClick,
    }: ChatInputBarProps,
    ref,
  ) {
    const [text, setText] = useState("");
    // 命令式 handle (insertEmoji / insertText / insertLibraryMarker) 通过 ref 调用,
    //   useImperativeHandle 的 deps 是 [] → 闭包里的 text 永远是**首次渲染**的值.
    //   这里用 ref 兜住最新文本, 插入位置/分隔符才正确.
    const textRef = useRef(text);
    textRef.current = text;
    // 0.7.6 — 三态合一: uploading / done / error 共用一个 attachments 列表.
    //   旧 chips+progress 模型只支持单文件上传, 不支持错误重试.
    const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
    const [dragActive, setDragActive] = useState(false);
    const taRef = useRef<HTMLTextAreaElement | null>(null);
    // drag enter/leave counter: 嵌套 child element 多次触发时确保 stable
    const dragCounterRef = useRef(0);
    // 0.7.5 chat-id-25: slash menu — 自管 trigger + filter + 插入模板.
    const slashTriggerRef = useRef<{ before: string; filter: string } | null>(null);
    const [slashOpen, setSlashOpen] = useState(false);

    // 0.7.5 hotfix 2 — 命令式 handle: 暴露给 ChatDetail 让 EmojiPicker 选中后
    //   把 emoji 插到 cursor 位置, 让 file upload 完成后把 chip 加到输入栏.
    // 0.7.6 — 新增 insertText (Home 的 LibraryPicker 选中后注入 `@[library:id] title` marker);
    //         insertEmoji 现在是 insertText 的别名, 保留兼容 ChatDetail.
    useImperativeHandle(
      ref,
      () => ({
        insertEmoji: (emoji: string) => insertTextAtCursor(emoji),
        insertText: (text: string) => insertTextAtCursor(text),
        insertLibraryMarker: (id: string, title: string) => {
          const ta = taRef.current;
          const marker = `@[library:${id}] ${title}`;
          const cur = textRef.current;
          if (!ta) {
            setText((prev) => prev + marker);
            return;
          }
          const start = ta.selectionStart ?? cur.length;
          const end = ta.selectionEnd ?? cur.length;
          const before = cur.slice(0, start);
          // 跟 web Home onSelect 一致: 前面不是空白就补一个空格分隔
          const sep = before && !before.endsWith(" ") && !before.endsWith("\n") ? " " : "";
          const next = before + sep + marker + cur.slice(end);
          setText(next);
          const caret = start + sep.length + marker.length;
          requestAnimationFrame(() => {
            ta.focus();
            ta.setSelectionRange(caret, caret);
          });
        },
        addAttachment: (att: PendingAttachment) => {
          setAttachments((prev) => {
            // 去重: 同 url / fileId 不重复加
            if (
              prev.some(
                (x) =>
                  (x.kind === "done" &&
                    ((att.url && x.url === att.url) ||
                      (att.fileId && x.fileId === att.fileId))),
              )
            ) {
              return prev;
            }
            return [
              ...prev,
              {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                kind: "done",
                name: att.name,
                mime: att.mime ?? "",
                url: att.url,
                fileId: att.fileId,
                mode: att.mode ?? (att.fileId ? "document" : "image"),
              },
            ];
          });
        },
        focus: () => {
          const ta = taRef.current;
          if (!ta) return;
          ta.focus();
        },
        clear: () => {
          setText("");
          setAttachments([]);
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    // auto-resize — line-height ~24px, max 5 rows
    useEffect(() => {
      const el = taRef.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${Math.min(5 * 24, el.scrollHeight)}px`;
    }, [text]);

    // 全局 drag 监听: 即使 textarea 没有 focus, 用户把文件拖到任意空白处也能弹高亮
    useEffect(() => {
      const onDragEnter = (e: DragEvent) => {
        if (!e.dataTransfer?.types?.includes("Files")) return;
        e.preventDefault();
        dragCounterRef.current += 1;
        setDragActive(true);
      };
      const onDragOver = (e: DragEvent) => {
        // 必须 preventDefault 才能让 drop 事件触发 (Chromium Web 标准)
        if (!e.dataTransfer?.types?.includes("Files")) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      };
      const onDragLeave = (e: DragEvent) => {
        // counter 兜底嵌套事件
        dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
        if (dragCounterRef.current === 0) setDragActive(false);
      };
      const onDrop = (e: DragEvent) => {
        e.preventDefault();
        dragCounterRef.current = 0;
        setDragActive(false);
        if (isStreaming) {
          onAttachmentError?.("流式生成中,无法接收新附件,请等上一轮结束");
          return;
        }
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) return;
        // 接收多文件, 一个一个上传 (并行, progress 累加)
        Array.from(files).forEach((file) => handleDroppedFile(file));
      };
      window.addEventListener("dragenter", onDragEnter);
      window.addEventListener("dragover", onDragOver);
      window.addEventListener("dragleave", onDragLeave);
      window.addEventListener("drop", onDrop);
      return () => {
        window.removeEventListener("dragenter", onDragEnter);
        window.removeEventListener("dragover", onDragOver);
        window.removeEventListener("dragleave", onDragLeave);
        window.removeEventListener("drop", onDrop);
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isStreaming]);

    const handleDroppedFile = (file: File) => {
      if (file.size > MAX_BYTES) {
        onAttachmentError?.(`文件超过 50MB 上限: ${file.name}`);
        return;
      }
      // 简单 mime 兜底: 跟 web 一致 (image/* → image mode, 其他 → document mode)
      const mode = file.type
        ? file.type.startsWith("image/")
          ? "image"
          : "document"
        : FILE_MIME_RE.test(file.name) && /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i.test(file.name)
        ? "image"
        : "document";
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      // 立即插入 uploading 项, 支持多文件并发
      const item: AttachmentItem = {
        id,
        kind: "uploading",
        name: file.name,
        mime: file.type ?? "",
        pct: 0,
        abort: () => {
          /* 占位, 上传启动后会被覆盖成真 abort */
        },
        file,
      };
      setAttachments((prev) => [...prev, item]);
      const handle = uploadAttachment(file, {
        mode: mode ?? deriveUploadMode(file),
        onProgress: (p) => {
          setAttachments((prev) =>
            prev.map((x) =>
              x.id === id && x.kind === "uploading" ? { ...x, pct: p.pct } : x,
            ),
          );
        },
      });
      // 把真 abort 写到 item 上, X 按钮取消时调
      setAttachments((prev) =>
        prev.map((x) =>
          x.id === id && x.kind === "uploading" ? { ...x, abort: handle.abort } : x,
        ),
      );
      handle.promise
        .then((res) => {
          if (!res.url && !res.fileId) {
            setAttachments((prev) =>
              prev.map((x) =>
                x.id === id && x.kind === "uploading"
                  ? {
                      ...x,
                      kind: "error",
                      errorMsg: "未拿到附件信息",
                    }
                  : x,
              ),
            );
            return;
          }
          setAttachments((prev) =>
            prev.map((x) =>
              x.id === id && x.kind === "uploading"
                ? {
                    kind: "done",
                    id,
                    name: file.name,
                    mime: file.type ?? "",
                    url: res.url,
                    fileId: res.fileId,
                    mode,
                  }
                : x,
            ),
          );
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          // 主动 abort (用户点 X) → 静默移除条目, 不进 error chip
          if (msg === "aborted" || msg.includes("aborted")) {
            setAttachments((prev) => prev.filter((x) => x.id !== id));
            return;
          }
          // 真错误 → 转 error chip + 可重试
          setAttachments((prev) =>
            prev.map((x) =>
              x.id === id && x.kind === "uploading"
                ? { ...x, kind: "error", errorMsg: msg }
                : x,
            ),
          );
        });
    };

    // 重试某 error 项 — 复用 handleDroppedFile, 但先生成新 id (避免 id 冲突)
    const retryAttachment = (item: Extract<AttachmentItem, { kind: "error" }>) => {
      // 先移除 error 项, 再重新走 handleDroppedFile
      setAttachments((prev) => prev.filter((x) => x.id !== item.id));
      handleDroppedFile(item.file);
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (isStreaming) return;
      const file = extractSingleImage(e);
      if (file) {
        e.preventDefault();
        handleDroppedFile(file);
      }
    };

    const handleSend = () => {
      const trimmed = text.trim();
      const hasDoneAttachment = attachments.some((x) => x.kind === "done");
      const hasUploading = attachments.some((x) => x.kind === "uploading");
      const hasError = attachments.some((x) => x.kind === "error");

      // F-02 / H-15 — 上传中点发送: 弹提示并 return, 附件**不**清空 (否则用户以为发出去了)
      //   对齐 web `app/page.tsx:219-226`:
      //     toast({ title: "附件还在上传中", description: "请稍候几秒再发送",
      //             variant: "default" }) + return (**不发送**).
      //   Home 接 onSubmitNotice ⇒ 拿到 web 的两段式 + default 变体;
      //   chat 页没接 (web chat 页也没这两条 toast) ⇒ 回落到 onAttachmentError,
      //   保持 chat 页既有的提示不变 (共享组件带来的既有行为, 不在本批范围).
      if (hasUploading) {
        if (onSubmitNotice) {
          onSubmitNotice("附件还在上传中", "default", "请稍候几秒再发送");
        } else {
          onAttachmentError?.("附件还在上传中, 请稍候几秒再发送");
        }
        return;
      }

      // F-01 / H-17 — 「有附件、无文字」也允许提交 (web page.tsx:217 同款)
      if (!trimmed && !hasDoneAttachment) return;

      // 0.7.6 — 只把 done 状态传给 parent (跟 web 一致, 在飞 / 错误项不带过去).
      const doneAtts: PendingAttachment[] = attachments
        .filter((x): x is Extract<AttachmentItem, { kind: "done" }> => x.kind === "done")
        .map((x) => ({
          url: x.url,
          fileId: x.fileId,
          name: x.name,
          mime: x.mime,
          mode: x.mode,
        }));

      // H-16 — 部分附件失败仍可发送, 给个 warning 提示 (失败项不带走)
      //   对齐 web `app/page.tsx:228-234` 的两段式 toast:
      //     title "部分附件上传失败" / description "已移除失败项, 正在发送其余内容"
      //     / variant "warning".
      if (hasError) {
        onSubmitNotice?.(
          "部分附件上传失败",
          "warning",
          "已移除失败项, 正在发送其余内容",
        );
      }

      const ok = onSubmit(trimmed, doneAtts);
      // F-03 — 提交失败 (onSubmit 返回 false) 时**不**清空文本 / 附件,
      //   让用户可以原地重试 (清空时机交给 parent 的 createChat 成功回调).
      if (ok !== false) {
        setText("");
        setAttachments([]);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        handleSend();
      }
      // chat-id-25: SlashMenu 内部用 ArrowUp/Down/Enter, 这里不重复
    };

    // chat-id-25: 检测 "/" 开头 → 开 slash 菜单; 检测 "/cmd " → 自动触发.
    // 注意 setText 是 React state 同步, 但触发回调要按状态派生, 不能直接调.
    // 这里用一个 effect 监测 text 变化.
    useEffect(() => {
      if (!onSlashCommand) return;
      // 没 / 开头 → 关菜单
      if (!text.startsWith("/")) {
        if (slashOpen) setSlashOpen(false);
        slashTriggerRef.current = null;
        return;
      }
      // 抽 '/' 后到第一个空白前的部分
      const rest = text.slice(1);
      const spaceIdx = rest.search(/\s/);
      if (spaceIdx === -1) {
        // 还在输 cmd, 显示菜单
        slashTriggerRef.current = { before: "", filter: rest };
        if (!slashOpen) setSlashOpen(true);
      } else {
        // 已输完 cmd + 空格 — 自动触发 (用户连打 "/image " 一气呵成)
        const cmdStr = rest.slice(0, spaceIdx).toLowerCase();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const known = ["image", "file", "search", "new", "clear", "template", "translate", "summary", "save", "camera", "knowledge", "voice"];
        if (known.includes(cmdStr)) {
          // 清掉整段 "/cmd " 前缀
          const remaining = text.slice(1 + spaceIdx + 1);
          const cmd = cmdStr as SlashCommand;
          if (cmd === "translate" || cmd === "summary") {
            // insert 模板文本
            const tpl = SLASH_TEMPLATES[cmd] ?? "";
            setText(remaining + tpl);
          } else if (cmd === "clear") {
            setText(remaining);
            setAttachments([]);
          } else {
            // 0.7.5 hotfix 2 — image / file / camera / knowledge 由 ChatDetail
            //   通过 PlusActionsSheet 流程处理. ChatInputBar 内部不再触发
            //   AttachmentPicker / KnowledgeAttachSheet (它们已移走). 只清掉
            //   '/cmd ' 前缀 + 通知 parent (parent 路由到 handlePlusAction).
            setText(remaining);
            onSlashCommand(cmd);
          }
          if (slashOpen) setSlashOpen(false);
          slashTriggerRef.current = null;
        } else {
          // 未识别 → 关菜单
          if (slashOpen) setSlashOpen(false);
        }
      }
    }, [text, onSlashCommand, slashOpen]);

    const removeAttachment = (id: string) => {
      setAttachments((prev) => prev.filter((x) => x.id !== id));
    };

    const cancelUpload = (item: Extract<AttachmentItem, { kind: "uploading" }>) => {
      try {
        item.abort();
      } catch {
        /* already aborted */
      }
      setAttachments((prev) => prev.filter((x) => x.id !== item.id));
    };

    // 0.7.5 hotfix 2 — 在 textarea 光标处插入 emoji. 由命令式 handle.insertEmoji 触发,
    //   ChatDetail 的 EmojiPicker 选中后调 ref.current.insertEmoji(emoji) 调到这里.
    // 0.7.6 — 改名 insertTextAtCursor (并暴露为 handle.insertText), EmojiPicker 走 insertEmoji (alias).
    //   Home 的 LibraryPicker 选中后调 insertText 注入 `@[library:id] title`.
    // 不破坏现有 selection.
    const insertTextAtCursor = (snippet: string) => {
      const ta = taRef.current;
      if (!ta) {
        setText((prev) => prev + snippet);
        return;
      }
      const cur = textRef.current;
      const start = ta.selectionStart ?? cur.length;
      const end = ta.selectionEnd ?? cur.length;
      const next = cur.slice(0, start) + snippet + cur.slice(end);
      setText(next);
      // 把 cursor 移到 snippet 之后, focus 拿回 textarea.
      const caret = start + snippet.length;
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(caret, caret);
      });
    };

    return (
      <>
        {/* 对齐 web `ChatInputBar.tsx:82` — 根节点只是 `w-full` 容器, 底边线 / 内边距 /
            背景由页面层提供 (web chat 详情页 = ChatInput.tsx:64 `border-t border-border
            p-4 bg-background`; web Home = page.tsx 同款).
            PC 之前在这里垫了 `px-4 pb-4 pt-2`, 跟 Home 页自己那层 p-4 叠成双倍内边距. */}
        <div className="w-full">
          {/* attachments — 三态合一 (0.7.6, 对齐 web)
                uploading → UploadProgressBar (带文件名 + 取消)
                done      → AttachmentChip  (缩略图 + 类型角标 + 文件名 + X)
                error     → UploadErrorChip (重试 + 删除) */}
          {attachments.length > 0 ? (
            <div className="mx-auto max-w-3xl w-full">
              <div className="flex flex-wrap gap-2 pb-2">
                {attachments.map((it) => {
                  if (it.kind === "uploading") {
                    return (
                      <UploadProgressBar
                        key={it.id}
                        value={it.pct}
                        fileName={it.name}
                        onCancel={() => cancelUpload(it)}
                      />
                    );
                  }
                  if (it.kind === "done") {
                    return (
                      <AttachmentChip
                        key={it.id}
                        file={{
                          name: it.name,
                          type: it.mime,
                          url: it.url,
                        }}
                        thumbnailUrl={it.mime?.startsWith("image/") ? it.url : undefined}
                        onRemove={() => removeAttachment(it.id)}
                      />
                    );
                  }
                  // error
                  return (
                    <div key={it.id} className="basis-full min-w-0">
                      <UploadErrorChip
                        fileName={it.name}
                        errorMsg={it.errorMsg}
                        onRetry={() => retryAttachment(it)}
                        onRemove={() => removeAttachment(it.id)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* input row — web 形态: 外层卡片 (bg-bg-elevated) 包一个**无边框** textarea
              (web ChatInputBar.tsx:84-119). PC 之前是 textarea 自带底色 + 边框. */}
          <div
            className={[
              "bg-bg-elevated rounded-md px-4 py-3 flex items-end gap-2",
              "border transition-colors duration-150",
              "focus-within:border-border",
              isStreaming ? "border-brand/40" : "border-transparent",
              disabled && !isStreaming ? "opacity-60" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {/* 0.7.5 hotfix 2 (gaga 反馈 2026-10-20) — 附件入口统一收在 `+` 按钮.
                 只在 parent 提供 onPlusClick 时显示; Home 等无 PlusActionsSheet 场景
                 不显示 (Home 自己的 + button 在 ChatInputBar 之外, 不受影响). */}
            {onPlusClick ? (
              <button
                type="button"
                aria-label="附件"
                title="附件"
                onClick={onPlusClick}
                data-testid="chat-plus-button"
                className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center"
              >
                <PlusIcon />
              </button>
            ) : null}

            {/* textarea — 0.7.5 chat-id-25: 包一个相对容器, SlashMenu 绝对定位浮在上方.
                单一 textarea (阶段 8 chat-id-19 + 0.7.5 P1 f08e147 撞改; 删掉重复 textarea — gagaOS §①) */}
            <div className="flex-1 relative min-w-0">
              <textarea
                ref={taRef}
                rows={1}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={
                  placeholder ??
                  (isStreaming
                    ? "AI 正在回复..."
                    : "说点什么… (Enter 发送，Shift+Enter 换行)")
                }
                disabled={isStreaming || disabled}
                className="w-full bg-transparent text-fg placeholder:text-fg-subtle outline-none text-base leading-6 resize-none max-h-32 py-2 disabled:opacity-60 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              />
              {slashOpen && onSlashCommand ? (
                <SlashMenu
                  open={slashOpen}
                  filter={slashTriggerRef.current?.filter ?? ""}
                  onSelect={(cmd) => {
                    if (cmd === "translate" || cmd === "summary") {
                      const tpl = SLASH_TEMPLATES[cmd] ?? "";
                      setText(text.replace(/^\/[a-zA-Z]*\s?/, "") + tpl);
                    } else if (cmd === "clear") {
                      setText(text.replace(/^\/[a-zA-Z]*\s?/, ""));
                      setAttachments([]);
                    } else {
                      // 清掉 '/' + cmd + 可选空格
                      setText(text.replace(/^\/[a-zA-Z]*\s?/, ""));
                      onSlashCommand(cmd);
                    }
                    setSlashOpen(false);
                    slashTriggerRef.current = null;
                  }}
                  onDismiss={() => {
                    setSlashOpen(false);
                    slashTriggerRef.current = null;
                  }}
                />
              ) : null}
            </div>

            {/* send / stop / rerun — 三态按钮 (阶段 8 chat-id-19)
                - 流式中 → stop (red)
                - 非流式 + canRerun → rerun (brand, 复用同一位置) — 跟 web 同款
                - 非流式 + !canRerun → send (brand, 默认) */}
            {isStreaming ? (
              <button
                type="button"
                aria-label="停止生成"
                onClick={onStop}
                className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-full bg-danger text-white hover:bg-danger/90 transition-colors duration-150"
              >
                <StopSquareIcon />
              </button>
            ) : canRerun && onRerun ? (
              <button
                type="button"
                aria-label="重新生成最后一条回复"
                title="重新生成最后一条回复"
                onClick={onRerun}
                className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-full bg-brand text-brand-on hover:bg-brand-hover transition-colors duration-150"
                data-testid="rerun-button"
              >
                <RotateCcwIcon />
              </button>
            ) : (
              <button
                type="button"
                aria-label="发送"
                onClick={handleSend}
                disabled={
                  disabled ||
                  (!text.trim() && !attachments.some((x) => x.kind === "done"))
                }
                className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-full bg-brand text-brand-on hover:bg-brand-hover transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowUpIcon />
              </button>
            )}
          </div>

          {/* 底部 caption — 对齐 web ChatInputBar.tsx:165-177 */}
          <p
            className={[
              "mt-2 text-xs text-center flex items-center justify-center gap-1.5",
              isStreaming ? "text-brand" : "text-fg-muted opacity-50",
            ].join(" ")}
          >
            {isStreaming ? (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-brand animate-pulse"
                aria-hidden="true"
              />
            ) : null}
            <span>
              {isStreaming ? "生成中 · 点击停止按钮中断" : caption}
            </span>
          </p>
        </div>

        {/* 全屏 drag 高亮 — 阶段 4 */}
        {dragActive ? (
          <div
            className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center"
            aria-hidden="true"
          >
            <div className="absolute inset-3 rounded-md border-2 border-dashed border-brand bg-brand/10 backdrop-blur-sm" />
            <div className="relative rounded-md bg-bg-elevated border border-brand/60 px-6 py-4 shadow-dialog flex items-center gap-3">
              <PaperclipIcon className="text-brand shrink-0" size={22} />
              <div>
                <p className="text-sm font-medium">拖入文件上传</p>
                <p className="text-xs text-fg-muted">图片自动按 image 上传, 其他文件按 document</p>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  },
);

// ─────────── icons (共享组件 — components/ui/Glyphs.tsx) ───────────
//   2026-10-27 收编: 本文件原本就地手写了 5 份内联 svg (paperclip / arrow-up /
//   stop 方块 / rotate-ccw / plus), 跟共享库重复实现 ⇒ 全部改成 import.
//   逐个对照:
//     PaperclipIcon  22×22 / sw1.6  (lucide `paperclip`)
//     ArrowUpIcon    16×16 / sw2    (lucide `arrow-up`, 同 web ChatInputBar)
//     StopSquareIcon 14×14 / sw1.6  (自定义图形,非 lucide — 实心方块)
//     RotateCcwIcon  16×16 / sw1.8  (lucide `rotate-ccw`)
//     PlusIcon       20×20 / sw2    (lucide `plus`)