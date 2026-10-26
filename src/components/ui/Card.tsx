/**
 * components/ui/Card.tsx — Card / CardContent 基础卡片组件
 *
 * 1:1 对齐 web `gacode-web/src/components/ui/card.tsx` (shadcn/ui 风格).
 * web 那边空态 (chat/page.tsx:266-274) 与列表行 (chat/page.tsx:419-435) 都依赖
 * Card / CardContent; PC 之前是在 ChatList.tsx 里手拼等价 className.
 *
 * PC 侧没有 `cn` / tailwind-merge → className 用数组 .join(" ") 拼接,
 * 冲突类名由 **CSS 产物顺序** 决定 (不是 className 属性顺序):
 *   - `.p-8` / `.p-4` 在 tailwind 产物里排在 `.p-6` 之后 → 调用方覆盖生效
 *   - `.pt-0` (padding-top) 排在所有 `.p-*` 之后 → 留着会压掉调用方的 padding
 * 所以本文件的 CardContent base 写成 "p-6" (去掉 web 的 " pt-0"),
 * 调用处用 p-4 / p-8 覆盖即可 (跟 web 的 CardContent className 用法一致).
 *
 * 依赖: 无 (只用 react + tailwind token card / card-foreground, PC tailwind.config.ts 已有)
 */
import { forwardRef, type HTMLAttributes } from "react";

export type CardProps = HTMLAttributes<HTMLDivElement>;

/** 卡片外壳 — 对齐 web `card.tsx:4-13` */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className = "", ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={[
        "rounded-lg border bg-card text-card-foreground shadow",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
});

export type CardContentProps = HTMLAttributes<HTMLDivElement>;

/** 卡片内容区 — 对齐 web `card.tsx:37-42` (base 去掉了 pt-0, 见文件头注释) */
export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  function CardContent({ className = "", ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={["p-6", className].filter(Boolean).join(" ")}
        {...rest}
      />
    );
  },
);
