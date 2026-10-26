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
  /**
   * 描述段 (可选, 第二段) — 对齐 web AlertDialog 的「标题 + 描述」两段结构
   * (gacode-web/src/components/ui/alert-dialog.tsx:115-121 AlertDialogHeader
   *  + :149-159 AlertDialogDescription)。
   * 不传 ⇒ 渲染结果与加本 prop 之前**完全一致** (只有 title + message 两段),
   * 现有 8 个调用点零改动即可继续工作 (向后兼容)。
   */
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "default" | "danger";
  loading?: boolean;
  /**
   * pending 时的确认按钮形态（三态）:
   *   · `"spinner+text"` — 转圈 **+** 文字（**默认值**，向后兼容 ⇒ 现有 8 个调用点零改动）
   *   · `"spinner-only"` — **只**转圈，文字消失（web library 系列）
   *   · `"text-only"`   — **只**文字，不转圈（web profile / deliveries / Header）
   *
   * 背景: web 各弹窗的 pending 形态**不统一** ——
   *   · library 系列是 **spinner-only**
   *     (gacode-web/src/app/(main)/library/page.tsx:1255-1256
   *      `{deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "删除"}`;
   *      批量删除同款 :620-624)
   *   · profile / deliveries / Header 是**文字**
   *     (profile/page.tsx:284「正在注销...」/ deliveries/page.tsx:350「删除中...」
   *      / deliveries/[id]/page.tsx:517「删除中...」/ components/layout/Header.tsx:282「保存中...」)
   * 而 PC 的 Button 是「spinner + **保留** children」并存 (src/components/ui/Button.tsx:101-107),
   * 所以同一套 ConfirmDialog 默认只能给出「spinner 与文字同时显示」这一种形态 ⇒ 与 web 的两种形态
   * **都不完全一致**。本 prop 让调用方按 web 逐处指定。
   *
   * **默认值必须是 `"spinner+text"`** —— 否则现有调用点会被批量改动。
   *
   * 实现: 三种形态全部在 ConfirmDialog 内部完成，**不改** src/components/ui/Button.tsx:
   *   · `"spinner-only"` → pending 时**不把 confirmLabel 传给 Button**（Button 只剩 spinner）
   *   · `"text-only"`   → pending 时**不传 loading** 给 Button（Button 不出 spinner，调用方自己换文案）
   */
  loadingStyle?: "spinner+text" | "spinner-only" | "text-only";
  onCancel: () => void;
  onConfirm: () => void;
  /** 自定义输入 / 表单 (例如重命名) — 渲染在 message 之后, footer 之前 */
  children?: ReactNode;
}

export function ConfirmDialog({
  title,
  message,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  confirmVariant = "default",
  loading,
  loadingStyle = "spinner+text",
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

  // pending 态 —— 三种形态 (loadingStyle) 全在这里分流, 不改 Button.tsx:
  //   "spinner+text" → Button 同时出 spinner 和 confirmLabel (改前行为)
  //   "spinner-only" → Button 只出 spinner (confirmLabel 不传下去)
  //   "text-only"   → Button 不出 spinner (不传 loading), 文案由调用方自己换
  const pending = !!loading;

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
          {description ? (
            <p className="m-0 text-sm text-fg-muted leading-relaxed">{description}</p>
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
            loading={pending && loadingStyle !== "text-only"}
            onClick={onConfirm}
          >
            {pending && loadingStyle === "spinner-only" ? null : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
