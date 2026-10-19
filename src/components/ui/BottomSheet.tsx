/**
 * components/ui/BottomSheet.tsx — 阶段 7 浏览器底部弹出面板
 *
 * 设计目标: 对齐 Android 端 `ModalBottomSheet` 的视觉.
 *   - 居中遮罩 + 底部上滑入的 sheet 容器 (header / body / footer 三段)
 *   - 不依赖 transition (全局 0.1.4 起 transition/animation 禁用, 跟 gagaOS 规范)
 *     —— 用 fixed 定位直接渲染, 不用 slide 动效
 *   - 复用 ConfirmDialog 的居中 + 遮罩 + footer 风格, 但底部停靠 (top:50%) 改成
 *     bottom-0 + max-h-[80vh], 更"贴近 Android sheet" 形状.
 *   - 不引 Radix Dialog, 边界遵守.
 *
 * 用法:
 *   <BottomSheet open title="收藏夹" onClose={...}>{items}</BottomSheet>
 */

import type { ReactNode } from "react";
import { Button } from "./Button";

export interface BottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** 主体内容 (sheet 内部) */
  children: ReactNode;
  /** 可选 footer (右侧按钮组). 跟 ConfirmDialog footer 风格一致 */
  footer?: ReactNode;
}

export function BottomSheet({
  open,
  title,
  onClose,
  children,
  footer,
}: BottomSheetProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-2xl rounded-t-md bg-bg-elevated shadow-dialog p-5 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h2 className="text-base font-medium">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="关闭">
            ×
          </Button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 mt-3 shrink-0">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
