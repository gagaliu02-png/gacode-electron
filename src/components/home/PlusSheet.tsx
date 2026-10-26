/**
 * components/home/PlusSheet.tsx — Home 页 + 按钮底部弹出 6 项 action
 *
 * 对齐 gacode-web `src/components/chat/SheetActionMenu.tsx`:
 *   - 拍照 / 相册 / 文件 / 表情 / 知识库挂载 / 模板 — 6 项
 *   - 拍左侧图标 (24px) + 圆形 56x56 bg-bg-sunken + 下方 label
 *
 * 容器复用 components/ui/BottomSheet — 阶段 7 浏览器弹出面板,
 * 不引 Radix Sheet, 边界遵守.
 *
 * 模板 (template) electron 端暂时没实现, 回调里 toast 占位.
 */

import { BottomSheet } from "../ui/BottomSheet";
import { useToast } from "../ui/Toast";

export type PlusAction =
  | "camera"
  | "gallery"
  | "file"
  | "emoji"
  | "library"
  | "template";

export interface PlusSheetProps {
  open: boolean;
  onClose: () => void;
  /** 选中某项后回调 — parent 关闭 sheet + 走对应 picker */
  onPick: (action: PlusAction) => void;
}

interface ActionBtnProps {
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}

function ActionBtn({ label, onClick, icon }: ActionBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2 text-fg-muted hover:text-fg transition-colors duration-150"
    >
      <span
        aria-hidden="true"
        className="w-14 h-14 rounded-full bg-bg-sunken inline-flex items-center justify-center"
      >
        {icon}
      </span>
      <span className="text-sm">{label}</span>
    </button>
  );
}

export function PlusSheet({ open, onClose, onPick }: PlusSheetProps) {
  const { toast } = useToast();

  const handlePick = (action: PlusAction) => {
    onClose();
    // 模板暂未实现, 给个 toast 占位; 其它真走 parent 派发.
    if (action === "template") {
      toast({ message: "模板功能即将推出", variant: "default" });
      return;
    }
    onPick(action);
  };

  return (
    <BottomSheet open={open} title="添加附件" onClose={onClose}>
      <div className="grid grid-cols-3 gap-y-5 gap-x-2 py-4">
        <ActionBtn
          label="拍照"
          onClick={() => handlePick("camera")}
          icon={
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          }
        />
        <ActionBtn
          label="相册"
          onClick={() => handlePick("gallery")}
          icon={
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
          }
        />
        <ActionBtn
          label="文件"
          onClick={() => handlePick("file")}
          icon={
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" />
              <path d="M10 9H8" />
              <path d="M16 13H8" />
              <path d="M16 17H8" />
            </svg>
          }
        />
        <ActionBtn
          label="表情"
          onClick={() => handlePick("emoji")}
          icon={
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" x2="9.01" y1="9" y2="9" />
              <line x1="15" x2="15.01" y1="9" y2="9" />
            </svg>
          }
        />
        <ActionBtn
          label="挂载知识库"
          onClick={() => handlePick("library")}
          icon={
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m16 6 4 14" />
              <path d="M12 6v14" />
              <path d="M8 8v12" />
              <path d="M4 4v16" />
            </svg>
          }
        />
        <ActionBtn
          label="模板"
          onClick={() => handlePick("template")}
          icon={
            <svg
              aria-hidden="true"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
          }
        />
      </div>
    </BottomSheet>
  );
}