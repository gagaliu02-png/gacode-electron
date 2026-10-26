/**
 * components/home/PlusSheet.tsx — Home 页 + 按钮底部弹出 action sheet
 *
 * 对齐 gacode-web `src/components/chat/SheetActionMenu.tsx` (web 是唯一事实源):
 *   - **4 项**: 图片 / 文件 / 表情 / 挂载知识库 (web `SheetActionMenu.tsx:76-95`)
 *   - PC 原来是 6 项 (多出「拍照」「模板」) + 3 列 ⇒ 按 web 删到 4 项 + 4 列
 *     (「拍照」下沉到 MediaPicker 的 image 模式, 见 align-d-home H-32;
 *      「模板」是 PC 独有, web 没有 ⇒ 按「PC 多出 web 没有的直接删」删除)
 *   - 左侧图标 (24px) + 圆形 56x56 bg-bg-sunken + 下方 label
 *   - web 的 SheetContent **没有标题栏** ⇒ `title={undefined}`
 *   - web 的内边距挂在 SheetContent 自身 (`px-4 py-5`) ⇒ 容器 `!p-0` +
 *     内层 grid 自己带 `py-5 px-4` (PC 无 tailwind-merge, 只能这样让位)
 *
 * 容器复用 components/ui/BottomSheet — 阶段 7 浏览器弹出面板,
 * 不引 Radix Sheet, 边界遵守.
 *
 * ⚠️ 本仓无 lucide-react ⇒ 图标用 components/ui/Glyphs.tsx 的内联 svg.
 */

import { BottomSheet } from "../ui/BottomSheet";
import { FileTextIcon, ImageIcon, LibraryTypeIcon, SmileIcon } from "../ui/Glyphs";

export type PlusAction = "image" | "file" | "emoji" | "library";

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
  // 先收起自己, 再派发 —— 否则 Home 那边再开 MediaPicker / EmojiPicker 时
  // 两个 sheet 会同时在场 (web `SheetActionMenu` 的约定: 点项 → 关 Sheet → 回调).
  const handlePick = (action: PlusAction) => {
    onClose();
    onPick(action);
  };

  return (
    // A2-D1-30 (对齐 web `SheetActionMenu.tsx:70-75`):
    //   web 的 SheetContent **没有标题栏** → 不渲染 BottomSheet 内置标题栏.
    //   web 内边距 `px-4 py-5` 挂在 SheetContent 自身 ⇒ 容器 `!p-0` 让位,
    //   内层 grid 自带 `py-5 px-4` (与 web 逐字一致).
    <BottomSheet
      open={open}
      title={undefined}
      onClose={onClose}
      contentClassName="!p-0"
    >
      {/* web `SheetActionMenu.tsx:74` 网格: 4 列 / gap-3 / py-5 / px-4 */}
      <div className="grid grid-cols-4 gap-3 py-5 px-4" data-testid="plus-sheet">
        <ActionBtn
          label="图片"
          onClick={() => handlePick("image")}
          icon={<ImageIcon size={24} className="w-6 h-6" />}
        />
        <ActionBtn
          label="文件"
          onClick={() => handlePick("file")}
          icon={<FileTextIcon size={24} className="w-6 h-6" />}
        />
        <ActionBtn
          label="表情"
          onClick={() => handlePick("emoji")}
          icon={<SmileIcon size={24} className="w-6 h-6" />}
        />
        <ActionBtn
          label="挂载知识库"
          onClick={() => handlePick("library")}
          icon={<LibraryTypeIcon size={24} className="w-6 h-6" strokeWidth={2} />}
        />
      </div>
    </BottomSheet>
  );
}
