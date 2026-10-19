/**
 * components/deliveries/MultiSelectToolbar.tsx — Deliveries 多选模式底部 toolbar
 *                            (gacode-electron 0.7.5 P1 deliveries-9)
 *
 * 跟 library/MultiSelectToolbar 形态一致 (都是 sticky bottom), 但:
 *   - 删除走 server DELETE /yinian/deliverables/:id (客户端 fan-out);
 *     跟 library 的 PATCH 路径不一样.
 *   - 不引入额外按钮, 只做取消 / 全选 / 删除 (N) 三键.
 *
 * 父组件 Deliveries.tsx 持有 selectedIds + 触发 delete mutation.
 */

import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";

export interface DeliveriesMultiSelectToolbarProps {
  selectedCount: number;
  totalVisible: number;
  onCancel: () => void;
  onToggleSelectAll: () => void;
  onConfirmDelete: () => void;
  confirmOpen: boolean;
  onConfirmOpenChange: (open: boolean) => void;
  deletePending: boolean;
}

export function DeliveriesMultiSelectToolbar({
  selectedCount,
  totalVisible,
  onCancel,
  onToggleSelectAll,
  onConfirmDelete,
  confirmOpen,
  onConfirmOpenChange,
  deletePending,
}: DeliveriesMultiSelectToolbarProps) {
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
          title={`确认删除 ${selectedCount} 条交付?`}
          message="此操作不可恢复, 请谨慎操作。"
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
