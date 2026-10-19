/**
 * components/chat/ChatInputBar.tsx — Phase 2/4 Chat input bar.
 *
 * 阶段 2 (已有):
 *   - textarea + 两个 AttachmentPicker (image/document) + send/stop toggle
 *   - chip row + progress bar
 *
 * 阶段 4 (新增):
 *   - 全局拖拽高亮 (dragenter/over/leave 跟踪 counter, drop 取消高亮 + 上传)
 *   - paste 图片: e.clipboardData.items 拿 image/* File → 走 uploadAttachment mode 'image'
 *   - 上传完成后通过 chips 累积, 跟按钮选择走同一条路径
 *
 * 设计:
 *   - 拖拽高亮是全屏遮罩 + 品牌色边框 + 「拖入文件上传」文字 (非局域 hover)
 *   - counter 处理 dragenter/dragleave 嵌套 (fileSystem 控件会重复触发),
 *     drop 时 enter/leave 都要清零, leave 时若 ref 还在 body 外面也会清零.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AttachmentPicker } from "./AttachmentPicker";
import { uploadAttachment, deriveUploadMode } from "../../lib/upload";
import { extractSingleImage } from "../../lib/clipboard";
import { SlashMenu, type SlashCommand } from "./SlashMenu";

export interface PendingAttachment {
  /** image mode -> url, document mode -> fileId; mutually exclusive */
  url?: string;
  fileId?: string;
  name: string;
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
   * 阶段 8 chat-id-19 — 重新生成按钮 callback.
   * canRerun=true 时, 右侧主按钮 (send/stop slot) 切换成 rerun 图标,
   * 点击 → onRerun() (parent 取消 + 重发最后一条 user 消息).
   * canRerun=false 时, 恢复 send 按钮 (行为不变).
   */
  canRerun?: boolean;
  onRerun?: () => void;
  // ============== 0.7.5 增量 ==============
  /** chat-id-22: 自定义左侧 slot (替换默认 image/document attachment 按钮).
   *  parent (ChatDetail) 注入 PlusActionsSheet trigger + knowledge refs chips 等. */
  leftSlot?: ReactNode;
  /** chat-id-25: slash 命令菜单 — 接收 cmd 后 ChatInputBar 自动清除 '/' 前缀.
   *  ChatDetail 自实现 image/file/knowledge 等的真实行为 (image/document 走 input,
   *  knowledge 走 sheet 回调, save 调 api). 模板类 (translate/summary) ChatInputBar
   *  自动插入中文模板到 textarea. 其余 (search/template/favorite/voice) 默认 toast 占位. */
  onSlashCommand?: (cmd: SlashCommand) => void;
}

const MAX_BYTES = 50 * 1024 * 1024;
const FILE_MIME_RE = /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif|pdf|docx?|xlsx?|txt)$/i;

// 0.7.5 chat-id-25 — slash 命令模板文本 (insert 类). 跟 web ChatInput 同款.
const SLASH_TEMPLATES: Record<string, string> = {
  translate: "请把以下内容翻译成中文:\n",
  summary: "请用 5 个要点总结以下内容:\n",
};

export function ChatInputBar({
  isStreaming,
  onStop,
  onSubmit,
  onAttachmentError,
  canRerun = false,
  onRerun,
  leftSlot,
  onSlashCommand,
}: ChatInputBarProps) {
  const [text, setText] = useState("");
  const [chips, setChips] = useState<PendingAttachment[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  // drag enter/leave counter: 嵌套 child element 多次触发时确保 stable
  const dragCounterRef = useRef(0);
  // 0.7.5 chat-id-25: slash menu — 自管 trigger + filter + 插入模板.
  const slashTriggerRef = useRef<{ before: string; filter: string } | null>(null);
  const [slashOpen, setSlashOpen] = useState(false);

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
    setProgress(0);
    const handle = uploadAttachment(file, {
      mode: mode ?? deriveUploadMode(file),
      onProgress: (p) => setProgress(p.pct),
    });
    handle.promise
      .then((res) => {
        setProgress(null);
        if (!res.url && !res.fileId) {
          onAttachmentError?.("未拿到附件信息");
          return;
        }
        setChips((prev) =>
          prev.some(
            (x) =>
              (res.url && x.url === res.url) ||
              (res.fileId && x.fileId === res.fileId),
          )
            ? prev
            : [...prev, { name: file.name, url: res.url, fileId: res.fileId }],
        );
      })
      .catch((err) => {
        setProgress(null);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "aborted" || msg.includes("aborted")) return;
        onAttachmentError?.(msg);
      });
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
    if (!trimmed) return;
    const ok = onSubmit(trimmed, chips);
    if (ok !== false) {
      setText("");
      setChips([]);
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
      const known = ["image", "file", "search", "new", "clear", "template", "translate", "summary", "save", "favorite", "camera", "knowledge", "voice"];
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
          setChips([]);
        } else {
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

  const removeChip = (idx: number) => {
    setChips((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <>
      <div className="bg-bg-elevated px-3 py-2.5">
        {/* chips + progress */}
        {(chips.length > 0 || progress !== null) && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            {chips.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-bg-elevated text-xs"
              >
                <PaperclipSmallIcon />
                <span className="truncate max-w-[160px]">{c.name}</span>
                <button
                  type="button"
                  aria-label="移除附件"
                  onClick={() => removeChip(i)}
                  className="text-fg-muted hover:text-danger transition-colors duration-150"
                >
                  ×
                </button>
              </span>
            ))}
            {progress !== null ? (
              <div className="h-1.5 w-32 bg-bg-sunken rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand transition-[width] duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            ) : null}
          </div>
        )}

        {/* input row */}
        <div className="flex items-end gap-2">
          {/* attachment buttons — 0.7.5 chat-id-22: 父组件可注入 leftSlot 替换默认两个 picker.
              例如 ChatDetail 传 <PlusActionsSheet trigger /> 让 5 类 action 都从 sheet 走. */}
          {leftSlot ? (
            <div className="flex items-center gap-1 pb-1 relative">{leftSlot}</div>
          ) : (
            <div className="flex items-center gap-1 pb-1">
              <AttachmentPicker
                mode="image"
                accept="image/*"
                label="添加图片"
                disabled={isStreaming}
                onProgress={setProgress}
                onError={(msg) => {
                  setProgress(null);
                  onAttachmentError?.(msg);
                }}
                onUploaded={(r) => {
                  if (r.url) {
                    setChips((prev) =>
                      prev.some((x) => x.url === r.url)
                        ? prev
                        : [...prev, { name: r.name, url: r.url }],
                    );
                  }
                }}
              />
              <AttachmentPicker
                mode="document"
                accept="application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,application/msword,.doc,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,.xls,text/plain,.txt"
                label="添加文档"
                disabled={isStreaming}
                onProgress={setProgress}
                onError={(msg) => {
                  setProgress(null);
                  onAttachmentError?.(msg);
                }}
                onUploaded={(r) => {
                  if (r.fileId) {
                    setChips((prev) =>
                      prev.some((x) => x.fileId === r.fileId)
                        ? prev
                        : [...prev, { name: r.name, fileId: r.fileId }],
                    );
                  }
                }}
              />
            </div>
          )}

          {/* textarea — 0.7.5 chat-id-25: 包一个相对容器, SlashMenu 绝对定位浮在上方. */}
          <div className="flex-1 relative min-w-0">
            <textarea
              ref={taRef}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                isStreaming
                  ? "正在流式生成… 完成后再发下一条"
                  : "说点什么… (Enter 发送, Shift+Enter 换行 · 输入 / 触发命令菜单)"
              }
              disabled={isStreaming}
              className="w-full resize-none bg-bg-sunken border border-border rounded-md px-3 py-2 text-sm leading-6 placeholder:text-fg-subtle focus:outline-none focus:border-brand disabled:opacity-70 max-h-32 overflow-y-auto"
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
                    setChips([]);
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

          {/* textarea */}
          <textarea
            ref={taRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              isStreaming ? "正在流式生成… 完成后再发下一条" : "说点什么… (Enter 发送, Shift+Enter 换行 · 可拖入 / 粘贴图片)"
            }
            disabled={isStreaming}
            className="flex-1 resize-none bg-bg-sunken border border-border rounded-md px-3 py-2 text-sm leading-6 placeholder:text-fg-subtle focus:outline-none focus:border-brand disabled:opacity-70 max-h-32 overflow-y-auto"
          />

          {/* send / stop / rerun — 三态按钮 (阶段 8 chat-id-19)
              - 流式中 → stop (red)
              - 非流式 + canRerun → rerun (brand, 复用同一位置) — 跟 web 同款
              - 非流式 + !canRerun → send (brand, 默认) */}
          {isStreaming ? (
            <button
              type="button"
              aria-label="停止生成"
              onClick={onStop}
              className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-md bg-danger text-white hover:bg-danger/90 active:opacity-80 transition-colors duration-150"
            >
              <StopIcon />
            </button>
          ) : canRerun && onRerun ? (
            <button
              type="button"
              aria-label="重新生成最后一条回复"
              title="重新生成最后一条回复"
              onClick={onRerun}
              className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-md bg-brand text-brand-on hover:bg-brand-hover active:bg-brand-active transition-colors duration-150"
              data-testid="rerun-button"
            >
              <RerunIcon />
            </button>
          ) : (
            <button
              type="button"
              aria-label="发送消息"
              onClick={handleSend}
              disabled={!text.trim() && chips.length === 0}
              className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-md bg-brand text-brand-on hover:bg-brand-hover active:bg-brand-active disabled:opacity-40 disabled:pointer-events-none transition-colors duration-150"
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>

      {/* 全屏 drag 高亮 — 阶段 4 */}
      {dragActive ? (
        <div
          className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center"
          aria-hidden="true"
        >
          <div className="absolute inset-3 rounded-md border-2 border-dashed border-brand bg-brand/10 backdrop-blur-sm" />
          <div className="relative rounded-md bg-bg-elevated border border-brand/60 px-6 py-4 shadow-dialog flex items-center gap-3">
            <PaperclipIcon />
            <div>
              <p className="text-sm font-medium">拖入文件上传</p>
              <p className="text-xs text-fg-muted">图片自动按 image 上传, 其他文件按 document</p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ─────────── icons (local; not pulling lucide-react) ───────────

function PaperclipSmallIcon() {
  return (
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
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function PaperclipIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-brand shrink-0"
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

// 阶段 8 chat-id-19 — 重新生成 icon. 跟 Send 图标区分; 用一个循环箭头.
function RerunIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <polyline points="3 4 3 9 8 9" />
    </svg>
  );
}
