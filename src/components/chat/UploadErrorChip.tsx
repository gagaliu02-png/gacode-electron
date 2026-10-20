/**
 * components/chat/UploadErrorChip.tsx — 附件上传失败可见反馈
 *
 * 对齐 gacode-web/src/components/common/UploadErrorChip.tsx 1:1:
 *   - 红边浅红底卡片 (border-red-200 bg-red-50/60 dark mode 等价色)
 *   - AlertTriangle 图标 + 文件名 + 错误摘要 + 重试 / 删除 按钮
 *   - onRetry / onRemove 可选 — 调用方不传则不渲染对应按钮
 *
 * gaga 截图反馈 2026-10-20 §3: 旧版上传失败完全静默, UI 没反应 (gagaOS 已知痛点).
 * 现在显式红 chip + 重试按钮, 让 user 知道发生了什么.
 */

export interface UploadErrorChipProps {
  fileName: string;
  errorMsg: string;
  onRetry?: () => void;
  onRemove?: () => void;
}

export function UploadErrorChip({
  fileName,
  errorMsg,
  onRetry,
  onRemove,
}: UploadErrorChipProps) {
  return (
    <div className="w-full border border-red-500/40 bg-red-500/10 rounded-md">
      <div className="p-3 flex items-center gap-2">
        <AlertTriangleIcon />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{fileName}</p>
          <p className="text-xs text-red-400 truncate">
            上传失败 · {errorMsg}
          </p>
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 px-2 py-1 rounded text-xs text-fg hover:bg-bg-sunken transition-colors duration-150"
          >
            重试
          </button>
        ) : null}
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 px-2 py-1 rounded text-xs text-fg hover:bg-bg-sunken transition-colors duration-150"
          >
            删除
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default UploadErrorChip;

// ─────────── icons ───────────

function AlertTriangleIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-red-400 shrink-0"
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}