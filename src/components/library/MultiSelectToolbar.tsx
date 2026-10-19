/**
 * components/library/MultiSelectToolbar.tsx — 多选模式底部 toolbar
 *                          (gacode-electron 0.7.2 P1 library-12)
 *
 * 跟 ChatList 的 bottom multi-select bar 风格一致:
 *   - 左侧: "已选 N 条"
 *   - 中: 取消 / 全选
 *   - 右: "删除 (N)" + AlertDialog 二次确认
 *
 * 父组件 Library.tsx 控制 selectedIds 状态 + 触发删除 mutation.
 */

import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";

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
      <div className="sticky bottom-0 z-30 bg-bg-elevated border-t border-border px-4 py-3 flex items-center gap-3">
        <span className="text-sm">
          已选 <strong>{selectedCount}</strong> 条
        </span>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={onCancel}>
          取消
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleSelectAll}
          disabled={totalVisible === 0}
        >
          {allSelected ? "取消全选" : "全选"}
        </Button>
        <Button
          variant="danger"
          size="sm"
          disabled={selectedCount === 0 || deletePending}
          loading={deletePending}
          onClick={onConfirmDelete}
        >
          {deletePending ? "删除中" : `删除 (${selectedCount})`}
        </Button>
      </div>

      {confirmOpen ? (
        <ConfirmDialog
          title={`确认删除 ${selectedCount} 条?`}
          message={
            deleteConfirmMessage ?? "此操作不可恢复,请谨慎操作。"
          }
          confirmLabel="确认删除"
          confirmVariant="danger"
          loading={deletePending}
          onCancel={() => onConfirmOpenChange(false)}
          onConfirm={onConfirmDelete}
        />
      ) : null}
    </>
  );
}
