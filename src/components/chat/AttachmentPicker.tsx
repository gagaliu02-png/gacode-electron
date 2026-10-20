/**
 * components/chat/AttachmentPicker.tsx — 阶段 2 附件选择 + 上传
 *
 * 触发: 父组件给 pickImage / pickDocument 两个函数即可。
 * 行为: 弹出系统文件选择对话框, 选完后启动 uploadAttachment, 期间显示进度;
 *       完成后通过 onUploaded({url?, fileId?}) 回报给父组件, 失败 onError(toast 即可).
 *
 * 不依赖第三方: 用原生 <input type="file">, 走 lib/upload.ts 的 XHR.
 * 挂件本身用 `<input hidden /> + 按钮 click trigger` 模式, electron / chromium 都支持.
 */

import { useRef, useState } from "react";
import { uploadAttachment, deriveUploadMode } from "../../lib/upload";
import type { UploadAttachmentHandle, UploadMode } from "../../lib/upload";

/** 附件上限 — 与 lib/upload.ts MAX_BYTES 对齐. */
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export interface AttachmentPickerProps {
  mode: UploadMode;
  accept?: string;
  label: string;
  /** 单条上传完成回调 (image mode 拿 url, document mode 拿 fileId) */
  onUploaded?: (result: { name: string; url?: string; fileId?: string }) => void;
  onError?: (msg: string) => void;
  /** 渲染进度 0..100 (null = 不在上传中) */
  onProgress?: (pct: number | null) => void;
  disabled?: boolean;
}

export function AttachmentPicker({
  mode,
  accept,
  label,
  onUploaded,
  onError,
  onProgress,
  disabled,
}: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const trigger = () => {
    if (disabled || uploading) return;
    inputRef.current?.click();
  };

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    // uploadAttachment 的 50MB 校验是同步 throw (不在 promise 链里), 必须前置拦截,
    // 否则异常冒出 handleFile 走不到 .catch → onError 不触发 (选了超大文件没反应).
    if (file.size > MAX_ATTACHMENT_BYTES) {
      onError?.(
        `文件超过 50MB 上限 (${Math.round(file.size / 1024 / 1024)}MB)`,
      );
      return;
    }
    setUploading(true);
    onProgress?.(0);
    let handle: UploadAttachmentHandle;
    try {
      handle = uploadAttachment(file, {
        mode: mode ?? deriveUploadMode(file),
        onProgress: (p) => onProgress?.(p.pct),
      });
    } catch (err) {
      // 同步 throw (同上) 也要回报, 否则 uploading 卡在 true
      onProgress?.(null);
      setUploading(false);
      const msg = err instanceof Error ? err.message : String(err);
      onError?.(msg || "附件上传失败");
      return;
    }
    handle.promise
      .then((res) => {
        onProgress?.(null);
        if (!res.url && !res.fileId) {
          onError?.("未拿到附件信息");
          return;
        }
        onUploaded?.({ name: file.name, url: res.url, fileId: res.fileId });
      })
      .catch((err) => {
        onProgress?.(null);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "aborted" || msg.includes("aborted")) return;
        onError?.(msg);
      })
      .finally(() => setUploading(false));
  };

  return (
    <>
      <button
        type="button"
        onClick={trigger}
        disabled={disabled}
        aria-label={label}
        title={label}
        className="h-9 w-9 inline-flex items-center justify-center rounded-md text-fg-muted hover:bg-bg-elevated hover:text-fg disabled:opacity-50 disabled:pointer-events-none transition-colors duration-150"
      >
        {uploading ? (
          <span className="gagaos-spinner" aria-hidden="true" />
        ) : (
          <PaperclipIcon />
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        hidden
        accept={accept}
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          // 清 value 让同名文件二次选择也能触发
          e.target.value = "";
          handleFile(f);
        }}
      />
    </>
  );
}

function PaperclipIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}
