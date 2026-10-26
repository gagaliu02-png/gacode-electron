/**
 * components/ui/Button.tsx — 通用按钮组件
 *
 * 风格对齐 gacode-web src/components/ui/button.tsx (2026-10-26 逐条重排, C2-40):
 *   - 圆角 rounded-md (16dp, 跟 web 一致)
 *   - default (brand) / ghost / danger / outline 四种 variant
 *   - size: sm=h-8 text-xs / md=h-9 / lg=h-10 px-8 (PC 的 md 承担 web 的 default)
 *   - focus-visible 走 1px ring-ring (跟 web 一致; globals.css 也有全局 focus-visible)
 *   - disabled 0.5 opacity
 *
 * 阶段 1 故意不引 class-variance-authority / clsx / tailwind-merge (边界:
 * 不引新依赖). 后面如果要用 cva 风格再统一替换.
 */

import { forwardRef, type ButtonHTMLAttributes } from "react";

export type ButtonVariant = "default" | "ghost" | "danger" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  // C2-40 / A1-D2-06: 逐条对齐 web button.tsx:9-16
  //   web default   = bg-primary text-primary-foreground shadow hover:bg-primary/90
  //   web destructive = bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90
  //   web outline   = border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground
  //   web ghost     = hover:bg-accent hover:text-accent-foreground
  //   PC token: primary=#FF6B35=brand / destructive=#E54a5e=danger / input=#363b41=border
  //   / background=#000000=bg-base / accent=#1f1f1f / accent-foreground=#FFD7B8
  default:
    "bg-brand text-brand-on shadow hover:bg-brand/90",
  ghost:
    "hover:bg-accent hover:text-accent-foreground",
  danger:
    "bg-danger text-white shadow-sm hover:bg-danger/90",
  outline:
    "border border-border bg-bg-base shadow-sm hover:bg-accent hover:text-accent-foreground",
};

// A1-D2-05 / A1-D2-07: size 档位对齐 web button.tsx:17-22
//   web default = h-9 px-4 py-2 → PC 的 md 承担这一档 (PC 保留 sm/md/lg 三个名字)
//   web sm      = h-8 rounded-md px-3 text-xs
//   web lg      = h-10 rounded-md px-8
//   ⚠️ PC base 串里没有 text-sm (web base 有), 所以 md/lg 各自显式写字号,
//      否则 lg 会继承父级字号而不是 web 的 14px。
const sizeClass: Record<ButtonSize, string> = {
  sm: "h-8 rounded-md px-3 text-xs",
  md: "h-9 px-4 py-2 text-sm",
  lg: "h-10 rounded-md px-8 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className = "",
    variant = "default",
    size = "md",
    loading = false,
    disabled,
    children,
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      type={rest.type ?? "button"}
      disabled={isDisabled}
      className={[
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium",
        "transition-colors duration-150",
        // A1-D2-05: focus ring 2px+offset → 1px 无 offset (跟 web 一致)
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-50",
        variantClass[variant],
        sizeClass[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {loading && (
        <span
          aria-hidden="true"
          className="gagaos-spinner"
        />
      )}
      {children}
    </button>
  );
});