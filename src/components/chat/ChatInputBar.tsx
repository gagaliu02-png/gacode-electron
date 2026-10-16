/**
 * components/chat/ChatInputBar.tsx — Phase 2 Chat input bar.
 *
 * Form:
 *   - Main: textarea (auto-resize, Enter sends / Shift+Enter newline)
 *   - Left: paperclip image + paperclip document (two AttachmentPicker buttons)
 *   - Right: send <-> stop toggle (follows isStreaming prop)
 *   - Above: attachment chip row + progress bar
 *
 * State:
 *   - text: controlled input
 *   - chips: uploaded attachments accumulated for this turn
 *   - progress: pct (0..100) or null
 */

import { useEffect, useRef, useState } from "react";
import { AttachmentPicker } from "./AttachmentPicker";

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
   * The default behavior (return undefined / true) clears the input + chips.
   */
  onSubmit: (text: string, attachments: PendingAttachment[]) => boolean | void;
  /** Attachment upload failed (parent usually toasts) */
  onAttachmentError?: (msg: string) => void;
}

export function ChatInputBar({
  isStreaming,
  onStop,
  onSubmit,
  onAttachmentError,
}: ChatInputBarProps) {
  const [text, setText] = useState("");
  const [chips, setChips] = useState<PendingAttachment[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // auto-resize — line-height ~24px, max 5 rows
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(5 * 24, el.scrollHeight)}px`;
  }, [text]);

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
  };

  const removeChip = (idx: number) => {
    setChips((prev) => prev.filter((_, i) => i !== idx));
  };

  return (
    <div className="border-t border-border bg-bg-base px-3 py-2.5">
      {/* chips + progress */}
      {(chips.length > 0 || progress !== null) && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {chips.map((c, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-bg-sunken border border-border text-xs"
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
        {/* attachment buttons */}
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

        {/* textarea */}
        <textarea
          ref={taRef}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isStreaming ? "正在流式生成… 完成后再发下一条" : "说点什么… (Enter 发送, Shift+Enter 换行)"
          }
          disabled={isStreaming}
          className="flex-1 resize-none bg-bg-sunken border border-border rounded-md px-3 py-2 text-sm leading-6 placeholder:text-fg-subtle focus:outline-none focus:border-brand disabled:opacity-70 max-h-32 overflow-y-auto"
        />

        {/* send / stop */}
        {isStreaming ? (
          <button
            type="button"
            aria-label="停止生成"
            onClick={onStop}
            className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-md bg-danger text-white hover:bg-danger/90 active:opacity-80 transition-colors duration-150"
          >
            <StopIcon />
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
