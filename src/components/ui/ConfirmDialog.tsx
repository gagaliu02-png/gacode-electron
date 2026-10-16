/**
 * components/ui/ConfirmDialog.tsx — 阶段 3 通用二次确认弹窗
 *
 * 设计目标:
 *   - 跟 ChatList 里 inline 的 ConfirmDialog 形状一致 (footer 按钮 + 可选 children 输入区)
 *   - 但抽出到共享位置, 让 Library / Deliveries / Profile / ProfileEdit /
 *     ProfileChangePassword 几个新页面直接 import 复用, 不重复实现
 *   - 居中 + 黑色遮罩 + slide-in-from-bottom 动画, 跟 gacode-web AlertDialog
 *     视觉对齐
 *   - 不引 Radix AlertDialog, 边界遵守
 */

import type { ReactNode } from "react";
import { Button } from "./Button";

export interface ConfirmDialogProps {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "default" | "danger";
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** 自定义输入 / 表单 (例如重命名) — 渲染在 message 之后, footer 之前 */
  children?: ReactNode;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  confirmVariant = "default",
  loading,
  onCancel,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      <div
        className="absolute inset-0 bg-black/60 animate-fade-in"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm rounded-md bg-bg-elevated border border-border shadow-dialog p-5 animate-slide-in-from-bottom">
        <h2 className="text-base font-medium mb-1">{title}</h2>
        {message ? <p className="text-sm text-fg-muted mb-4">{message}</p> : null}
        {children ? <div className="mb-4">{children}</div> : null}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="md" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant === "danger" ? "danger" : "default"}
            size="md"
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
