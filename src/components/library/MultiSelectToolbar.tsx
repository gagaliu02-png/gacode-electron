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
      <div className="sticky bottom-0 z-30 bg-bg-base/95 backdrop-blur shadow-[0_-2px_10px_rgba(0,0,0,0.4)]">
        <div className="px-4 lg:px-8 max-w-3xl mx-auto w-full py-3 flex items-center justify-between gap-2">
          <span className="text-sm">
            已选 <strong>{selectedCount}</strong> 条
          </span>
          {/* L-47 收尾 (2026-10-26): 删掉 flex-1 占位 —— 改成 web 的 justify-between 之后,
              占位会把两侧撑开, justify-between 就不生效了。「已选 N 条」保留 (L-52 另批处理) */}
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
            {deletePending ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : `删除 ${selectedCount} 项`}
          </Button>
        </div>
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

// SpinnerIcon — 删除 pending 态转圈 (web 用 lucide Loader2, 16px)
function SpinnerIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
