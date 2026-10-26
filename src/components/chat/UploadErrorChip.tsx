/**
 * components/chat/UploadErrorChip.tsx — 附件上传失败可见反馈
 *
 * 对齐 gacode-web/src/components/common/UploadErrorChip.tsx 1:1
 * (web 是唯一事实源):
 *   - 红边浅红底卡片: web `<Card className="border border-red-200 bg-red-50/60 w-full">`
 *     ⇒ PC 用 `ui/Card` (已跟 web card.tsx 1:1: `rounded-lg border bg-card
 *       text-card-foreground shadow`), 覆盖 `border-red-200 bg-red-50/60`.
 *   - `AlertTriangle` 图标 (`w-4 h-4 text-red-600 shrink-0`) + 文件名 +
 *     错误摘要 (`text-xs text-red-700`) + 重试 / 删除 按钮
 *   - 按钮用 web 的 `Button size="sm" variant="ghost"` ⇒ PC 的
 *     `<Button variant="ghost" size="sm">` (PC ui/Button.tsx 已跟 web button.tsx 1:1)
 *   - onRetry / onRemove 可选 — 调用方不传则不渲染对应按钮
 *
 * ⚠️ PC 无 tailwind-merge → 同名类由 **CSS 产物顺序** 决胜:
 *   - `CardContent` base 是 `p-6`, 产物里 `.p-6` 在 `.p-3` **之后** ⇒ 调用点的
 *     `p-3` 盖不住 ⇒ 必须写 `!p-3`.
 *   - `Card` base 的 `bg-card` 在默认调色板 (`bg-red-50/60`) **之前** ⇒
 *     `bg-red-50/60` 天然赢, 不需要 `!`.
 *
 * gaga 截图反馈 2026-10-20 §3: 旧版上传失败完全静默, UI 没反应 (gagaOS 已知痛点).
 * 现在显式红 chip + 重试按钮, 让 user 知道发生了什么.
 */

import { Card, CardContent } from "../ui/Card";
import { Button } from "../ui/Button";
import { AlertTriangleIcon } from "../ui/Glyphs";

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
    // web `components/common/UploadErrorChip.tsx:40`
    <Card className="border-red-200 bg-red-50/60 w-full">
      {/* web `components/common/UploadErrorChip.tsx:41` — `!p-3` 压过
          CardContent base 的 `p-6` (见文件头注释) */}
      <CardContent className="!p-3 flex items-center gap-2">
        <AlertTriangleIcon size={16} className="text-red-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{fileName}</p>
          <p className="text-xs text-red-700 truncate">
            上传失败 · {errorMsg}
          </p>
        </div>
        {onRetry ? (
          <Button variant="ghost" size="sm" onClick={onRetry}>
            重试
          </Button>
        ) : null}
        {onRemove ? (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            删除
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default UploadErrorChip;
