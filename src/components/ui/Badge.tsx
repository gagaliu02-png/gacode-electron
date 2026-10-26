/**
 * components/ui/Badge.tsx — 徽标
 *
 * 对齐 gacode-web/src/components/ui/badge.tsx (C3-03, 2026-10-26):
 *   - 基础串: inline-flex items-center rounded-full border px-2.5 py-0.5
 *     text-xs font-semibold transition-colors + focus ring
 *   - 6 个 variant: default / secondary / destructive / success / warning / outline
 *
 * ⚠️ PC 无 tailwind-merge: 基础串里的 `text-xs` 与调用点自传的字号会同时进 class 列表,
 *   谁赢由 Tailwind 产物顺序决定 (text-xs 在 text-sm 之前 ⇒ text-sm 赢) ——
 *   调用点要覆盖字号时必须写 `!text-[10px]`。
 */

import type { HTMLAttributes, ReactNode } from "react";

export type BadgeVariant =
  | "default"
  | "secondary"
  | "destructive"
  | "success"
  | "warning"
  | "outline";

const variantClass: Record<BadgeVariant, string> = {
  default: "border-transparent bg-brand text-brand-on",
  secondary: "border-transparent bg-bg-elevated text-fg",
  destructive: "border-transparent bg-danger text-white",
  success: "border-transparent bg-success text-brand-on",
  warning: "border-transparent bg-warning text-brand-on",
  outline: "border-border-strong text-fg",
};

export interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: BadgeVariant;
  children?: ReactNode;
}

export function Badge({
  variant = "default",
  className = "",
  children,
  ...rest
}: BadgeProps) {
  return (
    <div
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-bg-base",
        variantClass[variant],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}
