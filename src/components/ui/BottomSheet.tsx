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
 *
 * 2026-10-26 (对齐 web `SheetContent` — align-d-home H-29 / H-43 / H-46 / H-53 /
 * H-54 / S-05): 新增 3 个**可选** prop, 默认行为完全不变, 其它调用方零改动:
 *   - `contentClassName` — 覆盖容器 className (圆角 / 最大宽 / padding / 最大高)
 *   - `titleClassName` — 覆盖内置标题 className (对齐 web `SheetTitle` =
 *     `text-lg font-semibold`); 默认 undefined ⇒ 现有行为完全不变
 *   - `title` 改为可选 — undefined 时不渲染标题栏 (web 的 SheetContent 无标题栏)
 *   - `subtitle` — 标题下方的副标题 (web LibraryPicker 顶部副标题)
 *   - `header` — 固定在滚动区外的头部 (web EmojiPicker 的搜索框 + 分类 tab)
 *
 * ⚠️ 本仓无 tailwind-merge → 同名类由 **CSS 产物顺序** 决胜, 不可靠.
 *    调用方要覆盖 base class 时请带 `!` 前缀 (如 `!rounded-t-2xl` / `!max-w-none`).
 *
 * 2026-10-26 (对齐 web `SheetContent` — align-a-chat A2-D3-05 / A2-D3-06):
 *   - 容器改成 web 的**底部抽屉形态**: 全宽 (去掉 max-w-2xl) + rounded-t-2xl
 *     + shadow-elevation-3 + p-6 + max-h-[85vh] (web sheet.tsx:69-74 / :94-97)
 *     —— 影响所有调用方 (不再是最多 672px 宽的居中卡片).
 *   - 新增 `hideTitle?: boolean` — 传了 title 也不画标题栏 (web sheet 无标题栏)
 *   - ESC 关闭 + body 滚动锁 (web sheet.tsx:44-56)
 *   - ⚠️ **没加** `animate-slide-in-from-bottom`: PC globals.css 全局禁用
 *     animation/transition (`animation: none !important`), 加了也是死的.
 */

import { useEffect, type ReactNode } from "react";
import { Button } from "./Button";

export interface BottomSheetProps {
  open: boolean;
  /** 标题 — 传 undefined 则不渲染标题栏 (web SheetContent 无标题) */
  title?: string;
  /** 副标题 — 渲染在标题下方一行 (web LibraryPicker 顶部副标题) */
  subtitle?: string;
  onClose: () => void;
  /** 主体内容 (sheet 内部) */
  children: ReactNode;
  /** 可选 footer (右侧按钮组). 跟 ConfirmDialog footer 风格一致 */
  footer?: ReactNode;
  /** 内容区容器额外 className (覆盖圆角 / 最大宽 / padding / 最大高) */
  contentClassName?: string;
  /**
   * 内置标题的额外 className — 对齐 web `SheetTitle` (`text-lg font-semibold`).
   * 默认 undefined ⇒ 现有调用方行为完全不变.
   * ⚠️ 本仓无 tailwind-merge → 同名类由 **CSS 产物顺序** 决胜.
   *    Tailwind 产物里 `.text-lg` 在 `.text-base` 之后、`.font-semibold` 在
   *    `.font-medium` 之后 ⇒ 直接追加即可压过内置默认 (无需 `!` 前缀).
   */
  titleClassName?: string;
  /** 固定在滚动区外的头部 (搜索框 / 分类 tab 等) */
  header?: ReactNode;
  /**
   * 隐藏内置标题栏 (对齐 web `SheetContent` — web 的 sheet 无标题栏).
   * 与 `title` 传 undefined 的区别: 传了 title 仍要作为 aria-label 用,
   * 只是不画标题栏那一行.
   */
  hideTitle?: boolean;
}

export function BottomSheet({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  contentClassName,
  titleClassName,
  header,
  hideTitle = false,
}: BottomSheetProps) {
  // ESC 关闭 + body 滚动锁 (对齐 web sheet.tsx:44-56)
  // ⚠️ hook 必须在 `if (!open) return null` 之前 — 早退会跳过后续 hook.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

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
      {/* 底部抽屉形态 — 对齐 web `sheet.tsx:94-97` (bg-bg-elevated + text-fg +
          shadow-elevation-3 + gap-4 + p-6) 与 `sheet.tsx:69-74` (bottom:
          inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl).
          ⚠️ PC 无 tailwind-merge → 同名类由 CSS 产物顺序决胜, 调用方要覆盖
          base class 请带 `!` 前缀 (见文件头注释). */}
      <div
        className={[
          "relative w-full inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl bg-bg-elevated text-fg shadow-elevation-3 flex flex-col p-6",
          contentClassName ?? "",
        ].join(" ")}
      >
        {!hideTitle && title ? (
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="min-w-0">
              <h2
                className={["text-base font-medium", titleClassName]
                  .filter(Boolean)
                  .join(" ")}
              >
                {title}
              </h2>
              {subtitle ? (
                <p className="text-xs text-fg-muted mt-0.5">{subtitle}</p>
              ) : null}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="关闭">
              ×
            </Button>
          </div>
        ) : null}
        {header ? <div className="shrink-0">{header}</div> : null}
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 mt-0 pt-3 border-t border-border shrink-0">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
