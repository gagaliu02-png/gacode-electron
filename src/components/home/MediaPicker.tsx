/**
 * components/home/MediaPicker.tsx — Home 页 图片来源 / 文件 系统 picker
 *
 * 对齐 web `src/components/common/MediaPicker.tsx` (web 是唯一事实源):
 *   - **模式只有两态** `image` | `file` (web `MediaPicker.tsx:157` `mode` prop),
 *     PC 原来的 `camera` / `gallery` / `file` 三态是 PC 独有 (align-d-home H-40).
 *   - **image 模式 = 并排两个圆钮**「拍照」+「相册」(web `MediaPicker.tsx:217-239`),
 *     各自触发一个隐藏 `<input type="file">`:
 *       · 拍照 → `capture="environment"` 调起系统后置相机
 *       · 相册 → `accept="image/*"` 调起系统 gallery / 文件选择
 *     PC 原来只有一个按钮 (camera / gallery / file 各一钮) ⇒ H-32 补齐.
 *   - **file 模式 = 单钮**「选择文件」(web `MediaPicker.tsx:207-216`).
 *   - **黑底白字** (web `MediaPicker.tsx:200` `bg-black border-t-0 text-white
 *     flex flex-col gap-0 p-0 max-h-[85vh]`) ⇒ H-33: PC 走 BottomSheet, 用
 *     `contentClassName` + `!` 前缀强制覆盖 base 的 `bg-bg-elevated` / `rounded-t-2xl` / `p-6`.
 *   - **标题在内容里** (web `MediaPicker.tsx:203-205`
 *     `<h3 className="text-white text-base font-medium mb-2">选择图片来源 / 选择文件</h3>`)
 *     ⇒ H-34: web 的 SheetContent 没有标题栏, PC 传 `title={undefined}` 不渲染
 *     BottomSheet 内置标题栏.
 *   - 底部「取消」文字钮 (web `MediaPicker.tsx:241-247`).
 *
 * ⚠️ PC 的 BottomSheet 关闭时不清 input value 之外的东西; 关闭时清两个 input 的
 *    value (web `MediaPicker.tsx:171-176`), 让下次选同一文件时仍能触发 change.
 *
 * 容器复用 BottomSheet — 不引 Radix Sheet.
 */

import { useEffect, useRef, type ChangeEvent } from "react";
import { BottomSheet } from "../ui/BottomSheet";
import { CameraIcon, FileTextIcon, ImageIcon } from "../ui/Glyphs";

export type MediaKind = "image" | "file";

export interface MediaPickerProps {
  open: boolean;
  onClose: () => void;
  /** 选择模式: image (拍照 + 相册) | file (只显示「选择文件」) */
  kind: MediaKind;
  /** 拿到 File 后回调 (upload + chip); 同时关闭 sheet */
  onCapture: (file: File) => void;
}

// 文件 accept — 对齐 web Home 实际生效值 (web `app/page.tsx:110` 传给 MediaPicker
// 的那串; web 组件内置的 FILE_ACCEPT 被 Home 传参架空, 见 align-d-home.md H-36).
const FILE_ACCEPT = ".pdf,.doc,.docx,.txt,.md,.zip,.json,.png,.jpg,.jpeg,.gif,.webp";

export function MediaPicker({ open, onClose, kind, onCapture }: MediaPickerProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraFileInputRef = useRef<HTMLInputElement | null>(null);

  // 关闭 sheet 时清两个 input 的 value, 让下次选同一文件仍能触发 change.
  useEffect(() => {
    if (!open) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraFileInputRef.current) cameraFileInputRef.current.value = "";
    }
  }, [open]);

  const accept = kind === "file" ? FILE_ACCEPT : "image/*";
  const isFileMode = kind === "file";

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    // reset input value 以便选同一文件时再次触发 change
    e.target.value = "";
    if (!f) return;
    onCapture(f);
    onClose();
  };

  return (
    // H-33: web 的 SheetContent className = `bg-black border-t-0 text-white
    //   flex flex-col gap-0 p-0 max-h-[85vh]`
    //   → PC: `!bg-black` 压过 base 的 `bg-bg-elevated` (同名类由 CSS 产物顺序决胜,
    //     PC 无 tailwind-merge ⇒ 必须 `!`); `!rounded-none` 压过 `rounded-t-2xl`;
    //     `!p-0` 压过 base 的 `p-6`; `text-white` 压过 base 的 `text-fg`.
    //   `border-t-0` — PC base 本来就没有 border, 无需处理.
    // H-34: web 无标题栏 ⇒ `title` 不传 (undefined) ⇒ BottomSheet 不渲染内置标题栏.
    <BottomSheet
      open={open}
      onClose={onClose}
      contentClassName="!bg-black !rounded-none !p-0 text-white"
    >
      {/* web `MediaPicker.tsx:202` 外层容器 */}
      <div className="flex flex-col items-center gap-4 py-8 px-4">
        {/* web `MediaPicker.tsx:203-205` 标题 */}
        <h3 className="text-white text-base font-medium mb-2">
          {isFileMode ? "选择文件" : "选择图片来源"}
        </h3>

        {isFileMode ? (
          // file 模式: 单钮「选择文件」, 直接调起 OS 文件选择
          // (web `MediaPicker.tsx:207-216`)
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 w-40 h-24 rounded-2xl bg-white/10 hover:bg-white/20 transition-colors duration-150"
          >
            <FileTextIcon size={32} className="text-white" />
            <span className="text-white text-sm">选择文件</span>
          </button>
        ) : (
          // image 模式: 拍照 + 相册 — 两个圆钮各触发一个隐藏 <input type="file">
          //   拍照 → capture="environment" 调起系统后置相机
          //   相册 → accept="image/*" 调起系统 gallery picker
          // (web `MediaPicker.tsx:221-238`)
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => cameraFileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 w-24 h-24 rounded-full bg-white/10 hover:bg-white/20 transition-colors duration-150"
            >
              <CameraIcon size={32} className="text-white" />
              <span className="text-white text-sm">拍照</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 w-24 h-24 rounded-full bg-white/10 hover:bg-white/20 transition-colors duration-150"
            >
              <ImageIcon size={32} className="text-white" />
              <span className="text-white text-sm">相册</span>
            </button>
          </div>
        )}

        {/* 底部「取消」— 对齐 web `MediaPicker.tsx:241-247` */}
        <button
          type="button"
          onClick={onClose}
          className="text-white/60 hover:text-white/80 text-sm mt-4 transition-colors"
        >
          取消
        </button>

        {/* 隐藏 file input — 相册 / 文件入口 */}
        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept={accept}
          onChange={handleFileSelect}
        />

        {/* 隐藏 file input — 拍照入口 (capture="environment" → 系统相机 / 后置摄像头;
            浏览器无视 capture 时仍会弹带 "Camera" 选项的 picker, 兜底不变) */}
        {!isFileMode ? (
          <input
            ref={cameraFileInputRef}
            type="file"
            hidden
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
          />
        ) : null}
      </div>
    </BottomSheet>
  );
}
