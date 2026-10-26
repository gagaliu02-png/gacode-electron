/**
 * components/ui/Textarea.tsx — 多行输入框
 *
 * 对齐 gacode-web/src/components/ui/textarea.tsx (C2-37, 2026-10-26):
 *   - 底色 bg-bg-elevated (不是 bg-bg-sunken) + border-border + rounded-md
 *   - px-4 py-3 text-base placeholder:text-fg-subtle + shadow-sm
 *   - min-h-[88px] 默认高度 + resize-y (仅垂直可拖)
 *   - focus:border-brand (BrandOrange focus 替代 ring-1, 跟 Input 一致)
 *   - disabled 0.5 opacity
 *
 * 写法跟同目录 Input.tsx 保持一致 (forwardRef + className 数组拼接;
 * PC 无 clsx / tailwind-merge, 冲突类名靠 Tailwind 产物顺序, 必要时用 `!` 强制)。
 */

import { forwardRef, type TextareaHTMLAttributes } from "react";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className = "", ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={[
          "flex w-full rounded-md border border-border bg-bg-elevated px-4 py-3 text-base",
          "placeholder:text-fg-subtle shadow-sm resize-y min-h-[88px]",
          "transition-colors duration-150",
          "focus:outline-none focus:border-brand",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      />
    );
  },
);
