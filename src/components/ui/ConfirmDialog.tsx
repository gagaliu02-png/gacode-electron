/**
 * components/ui/ConfirmDialog.tsx — 通用二次确认弹窗
 *
 * 设计目标:
 *   - 跟 ChatList 里 inline 的 ConfirmDialog 形状一致 (footer 按钮 + 可选 children 输入区)
 *   - 但抽出到共享位置, 让 Library / Deliveries / Profile / ProfileEdit /
 *     ProfileChangePassword 几个新页面直接 import 复用, 不重复实现
 *   - 视觉逐条对齐 gacode-web/src/components/ui/alert-dialog.tsx (2026-10-26, C2-20):
 *     居中 modal + 黑色遮罩 (backdrop-blur) + rounded-2xl + shadow-2xl + 边框 +
 *     max-w-md + p-6 + ESC 关闭 + 锁 body 滚动 + 淡入动画
 *   - 按钮高度 h-9 (由 Button 的 size="md" 提供 — 见 Button.tsx 的 size 档位)
 *   - 不引 Radix AlertDialog, 边界遵守
 */

import { useEffect, type ReactNode } from "react";
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
  // ESC 关闭 + 锁 body 滚动 — 对齐 web alert-dialog.tsx:58-70
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[60] flex items-center justify-center px-4"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div className="pointer-events-auto relative w-full max-w-md rounded-2xl bg-bg-elevated text-fg shadow-2xl border border-fg-muted/10 p-6 space-y-4 animate-fade-in">
        <div className="space-y-2">
          <h2 className="m-0 text-lg font-semibold text-fg">{title}</h2>
          {message ? (
            <p className="m-0 text-sm text-fg-muted leading-relaxed">{message}</p>
          ) : null}
        </div>
        {children ? <div>{children}</div> : null}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-2">
          <Button variant="outline" size="md" onClick={onCancel} disabled={loading}>
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
