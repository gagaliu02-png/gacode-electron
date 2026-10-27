/**
 * components/chat/UploadProgressBar.tsx — 文件上传进度条
 *
 * 对齐 gacode-web/src/components/ui/progress.tsx 1:1:
 *   - 圆角胶囊 (bg-bg-elevated + rounded-full)
 *   - 进度条轨道 (bg-bg-sunken) + brand-orange 填充 (bg-brand / 跟 CTA 同色)
 *   - 左侧文件名 (truncate max-w-[120px])
 *   - 中间进度条 flex-1
 *   - 右侧百分比 + 可选 X 取消按钮
 *
 * gaga 截图反馈 2026-10-20 §3: 旧版只有一根小细进度条不带文件名/取消, 是半成品.
 * 现在跟 web 同款 — 显示文件名 + 百分比 + 取消按钮.
 */

import { CloseIcon } from "../ui/Glyphs";

export interface UploadProgressBarProps {
  /** 0-100 */
  value: number;
  /** 文件名 (可选, 显示在左侧) */
  fileName?: string;
  /** 取消上传回调 (可选, 不传则不显示 X) */
  onCancel?: () => void;
  /** 外层额外 className */
  className?: string;
}

export function UploadProgressBar({
  value,
  fileName,
  onCancel,
  className,
}: UploadProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(value)));
  return (
    <div
      className={[
        "flex items-center gap-2 px-3 py-2 rounded-full bg-bg-elevated",
        className ?? "",
      ].join(" ")}
    >
      {fileName ? (
        <span
          className="text-xs text-fg truncate max-w-[120px]"
          title={fileName}
        >
          {fileName}
        </span>
      ) : null}
      <div className="flex-1 h-1.5 bg-bg-sunken rounded-full overflow-hidden">
        <div
          className="h-full bg-brand transition-[width] duration-150"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-fg-muted shrink-0">
        {clamped}%
      </span>
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          aria-label="取消上传"
          className="shrink-0 w-6 h-6 rounded-full inline-flex items-center justify-center text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150"
        >
          <CloseIcon size={14} />
        </button>
      ) : null}
    </div>
  );
}

export default UploadProgressBar;

// ─────────── icons (共享组件 — components/ui/Glyphs.tsx) ───────────
//   2026-10-27 收编: 本文件原本就地手写了一份 `CloseGlyph` 内联 svg
//   (lucide `x`, 14×14 / sw2), 跟共享库 `CloseIcon` 重复实现 ⇒ 删掉本地实现,
//   改 import 共享组件 (用 size={14} 保持原像素)。