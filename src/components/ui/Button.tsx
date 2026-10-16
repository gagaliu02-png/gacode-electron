/**
 * components/ui/Button.tsx — 阶段 1 最小按钮组件
 *
 * 风格对齐 gacode-web shadcn Button:
 *   - 圆角 rounded-md (16dp, 跟 web 一致)
 *   - default (brand) / ghost / danger 三种 variant
 *   - focus-visible 走 brand 色 ring (跟 globals.css :focus-visible 一致)
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
  default:
    "bg-brand text-brand-on hover:bg-brand-hover active:bg-brand-active shadow",
  ghost:
    "bg-transparent text-fg hover:bg-bg-elevated active:bg-bg-sunken",
  danger:
    "bg-danger text-white hover:bg-danger/90 active:bg-danger/80 shadow",
  outline:
    "bg-transparent text-fg border border-border hover:bg-bg-elevated active:bg-bg-sunken",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
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
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
        "disabled:opacity-50 disabled:pointer-events-none",
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