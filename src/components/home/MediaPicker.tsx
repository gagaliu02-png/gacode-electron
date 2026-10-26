/**
 * components/home/MediaPicker.tsx — Home 页 拍照 / 相册 / 文件 系统 picker
 *
 * 对齐 web `src/components/common/MediaPicker.tsx`, 区别是 electron desktop 没有
 * getUserMedia + 内嵌相机, 一律走原生 `<input type="file">` 调系统文件选择对话框.
 *
 *  - camera   → <input type="file" accept="image/*" capture="environment">
 *               Electron Chromium 在 macOS 调起相机; Windows desktop 通常弹
 *               带 image filter 的 file dialog (capture 属性被忽略), 仍能选图.
 *  - gallery  → <input type="file" accept="image/*"> 系统文件选择 (image filter)
 *  - file     → <input type="file" accept=".pdf,.doc,.docx,.txt,.md,.zip,.json,.png,.jpg,.jpeg,.gif,.webp">
 *               走 server mime 白名单 (对齐 web Home 实际生效的 accept, 见 align-d-home.md H-36)
 *
 * 容器复用 BottomSheet — 不引 Radix Sheet.
 */

import { useEffect, useRef } from "react";
import { BottomSheet } from "../ui/BottomSheet";

export type MediaKind = "camera" | "gallery" | "file";

export interface MediaPickerProps {
  open: boolean;
  onClose: () => void;
  /** 选择模式: 拍照 / 相册 / 文件 */
  kind: MediaKind;
  /** 拿到 File 后回调 (upload + chip); 同时关闭 sheet */
  onCapture: (file: File) => void;
}

// 文件 accept — 对齐 web Home 实际生效值 (web `page.tsx:110` 传给 MediaPicker 的那串;
// web 组件内置的 FILE_ACCEPT 被 Home 传参架空, 见 align-d-home.md H-36).
const FILE_ACCEPT = ".pdf,.doc,.docx,.txt,.md,.zip,.json,.png,.jpg,.jpeg,.gif,.webp";

interface KindMeta {
  title: string;
  hint: string;
}

const META: Record<MediaKind, KindMeta> = {
  camera: {
    title: "拍照",
    hint: "调用系统相机拍照后插入图片附件",
  },
  gallery: {
    title: "选择图片",
    hint: "从相册 / 文件夹选 1 张图片插入",
  },
  file: {
    title: "选择文件",
    hint: "支持 PDF / Word / Excel / TXT / CSV",
  },
};

export function MediaPicker({ open, onClose, kind, onCapture }: MediaPickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 关闭 sheet 时清空 input, 让下次选同一文件仍能触发 change.
  useEffect(() => {
    if (!open && inputRef.current) inputRef.current.value = "";
  }, [open]);

  const accept =
    kind === "file" ? FILE_ACCEPT : "image/*";
  const capture = kind === "camera" ? "environment" : undefined;

  const meta = META[kind];

  return (
    <BottomSheet open={open} title={meta.title} onClose={onClose}>
      <div className="flex flex-col items-center gap-3 py-4">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-40 h-24 rounded-md bg-bg-sunken hover:bg-bg-base text-fg inline-flex items-center justify-center gap-2 transition-colors duration-150"
        >
          <svg
            aria-hidden="true"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
          <span className="text-sm">打开{meta.title}</span>
        </button>
        <p className="text-xs text-fg-muted text-center">{meta.hint}</p>

        {/* 底部「取消」— 对齐 web MediaPicker (`MediaPicker.tsx:241-247`) */}
        <button
          type="button"
          onClick={onClose}
          className="text-white/60 hover:text-white/80 text-sm mt-4 transition-colors"
        >
          取消
        </button>

        {/* 隐藏的 file input — 点击按钮 / sheet 完成均 click 触发 */}
        <input
          ref={inputRef}
          type="file"
          hidden
          accept={accept}
          {...(capture ? { capture } : {})}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            onCapture(f);
            onClose();
          }}
        />
      </div>
    </BottomSheet>
  );
}