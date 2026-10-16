/**
 * components/ui/Input.tsx — 阶段 1 输入框
 *
 * 对齐 gacode-web design-spec § 3.3:
 *   - bg-bg-sunken + border-border + rounded-md (16dp)
 *   - px-4 py-3 text-base placeholder:text-fg-subtle
 *   - focus:border-brand (BrandOrange focus 替代 ring-1, 跟 web 一致)
 *   - disabled 0.5 opacity
 */

import { forwardRef, type InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className = "", type = "text", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={[
        "flex w-full rounded-md border border-border bg-bg-sunken px-4 py-3 text-base",
        "placeholder:text-fg-subtle",
        "transition-colors duration-150",
        "focus:outline-none focus:border-brand",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-fg",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
});