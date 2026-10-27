/**
 * components/library/MultiSelectToolbar.tsx — 多选模式底部 toolbar
 *                          (gacode-electron 0.7.2 P1 library-12)
 *
 * 1:1 对齐 web `gacode-web/src/app/(main)/library/page.tsx:584-628`:
 *   - 底栏只有 3 个按钮 (取消 / 全选 / 删除 N 项), **没有**「已选 N 条」文字
 *     (计数在全局顶栏, 见 L-28) —— L-52
 *   - 批量删除二次确认: 标题「确定要删除选中的 N 条?」+ 确认按钮「全部删除」—— L-51
 *   - pending 时确认按钮内只剩 spinner (web 是文字换成 spinner) —— L-75
 *
 * 父组件 Library.tsx 控制 selectedIds 状态 + 触发删除 mutation.
 */

import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { LoaderCircleIcon } from "../ui/Glyphs";

export interface MultiSelectToolbarProps {
  selectedCount: number;
  /** 当前可见 items 总数, 全选按钮用它切换"全选"/"取消全选" */
  totalVisible: number;
  onCancel: () => void;
  onToggleSelectAll: () => void;
  onConfirmDelete: () => void;
  /** 删除确认弹窗 */
  confirmOpen: boolean;
  onConfirmOpenChange: (open: boolean) => void;
  deletePending: boolean;
  deleteConfirmMessage?: string;
}

export function MultiSelectToolbar({
  selectedCount,
  totalVisible,
  onCancel,
  onToggleSelectAll,
  onConfirmDelete,
  confirmOpen,
  onConfirmOpenChange,
  deletePending,
  deleteConfirmMessage,
}: MultiSelectToolbarProps) {
  const allSelected = selectedCount > 0 && selectedCount === totalVisible;

  return (
    <>
      <div className="sticky bottom-0 z-30 bg-bg-base/95 backdrop-blur shadow-[0_-2px_10px_rgba(0,0,0,0.4)]">
        <div className="px-4 lg:px-8 max-w-3xl mx-auto w-full py-3 flex items-center justify-between gap-2">
          {/* L-52: 删掉 PC 多出的「已选 N 条」计数块 —— web 底栏只有 3 个按钮,
              计数在全局顶栏 (AppShell header, 见 L-28) */}
          <Button variant="ghost" size="sm" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleSelectAll}
          >
            {allSelected ? "取消全选" : "全选"}
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={selectedCount === 0 || deletePending}
            onClick={onConfirmDelete}
          >
            {deletePending ? <LoaderCircleIcon className="w-4 h-4 animate-spin" size={16} /> : `删除 ${selectedCount} 项`}
          </Button>
        </div>
      </div>

      {confirmOpen ? (
        <ConfirmDialog
          // L-51: web library/page.tsx:634 标题原文「确定要删除选中的 N 条?」
          title={`确定要删除选中的 ${selectedCount} 条?`}
          message={
            deleteConfirmMessage ?? "此操作不可恢复,请谨慎操作。"
          }
          // L-51: web 的确认按钮文案是「全部删除」(web library/page.tsx:685)
          // L-75: pending 时 web 按钮内只剩 spinner (文字消失) ⇒ 文案置空
          confirmLabel={deletePending ? "" : "全部删除"}
          confirmVariant="danger"
          loading={deletePending}
          onCancel={() => onConfirmOpenChange(false)}
          onConfirm={onConfirmDelete}
        />
      ) : null}
    </>
  );
}

// SpinnerIcon — 删除 pending 态转圈 (web 用 lucide Loader2, 16px)
//   2026-10-27 收编: 本文件原本就地手写了一份 `SpinnerIcon` 内联 svg
//   (lucide `loader-circle`, 16×16 / sw2), 跟共享库重复实现 ⇒ 删掉本地实现,
//   改 import 共享组件 `LoaderCircleIcon` (用 size={16} 保持原像素)。
