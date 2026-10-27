/**
 * components/schedule/ScheduleConfirmDialog.tsx — 危险写操作二次确认 (删除)
 *
 * 抄自 web `gacode-web/src/components/schedule/ScheduleConfirmDialog.tsx`, 只换 PC 写法:
 *   - `cn(...)` → 数组 filter(Boolean).join(" ")
 *
 * 视觉按原型 §9 `.confirm` (规格书 A5.6):
 *   遮罩 rgba(0,0,0,.6) + 面板 bg --bg-elevated / radius 24px / padding 20px
 *   标题 16px/500 · 正文 13.5px/20px --fg-muted · 按钮区 flex gap 10px
 *
 * ⚠️ 删除是**无二次确认**就会硬删 (级联删下级) —— 所以本页所有删除都走这个弹窗。
 *    不用系统 confirm(): 那玩意儿不受样式控制, 也拦不住 Electron 的标题栏交互。
 */

export interface ScheduleConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ScheduleConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "删除",
  cancelLabel = "取消",
  danger = true,
  onConfirm,
  onCancel,
}: ScheduleConfirmDialogProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[130] grid place-items-center px-5"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} aria-hidden="true" />
      <div className="relative w-full max-w-[360px] rounded-2xl bg-bg-elevated p-5 shadow-dialog">
        <h3 className="m-0 mb-2 text-base font-medium leading-6">{title}</h3>
        {description ? (
          <p className="m-0 mb-4 text-[13.5px] leading-5 text-fg-muted">{description}</p>
        ) : (
          <div className="mb-4" />
        )}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg bg-bg-base text-fg text-sm transition-colors duration-150 hover:bg-accent"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={[
              "flex-1 px-4 py-2.5 rounded-lg text-sm transition-colors duration-150 hover:opacity-90",
              danger ? "bg-danger text-white" : "bg-brand text-brand-on",
            ].join(" ")}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
