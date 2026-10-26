/**
 * components/chat/PlusActionsSheet.tsx — ChatDetail 左下 `+` 按钮弹出 sheet
 *
 * gagaOS 2026-10-20 反馈 (0.7.5 hotfix 2):
 *   - ChatInputBar 内置 4 个附件按钮 (image/document/emoji/knowledge) 走错路 —
 *     应统一收在 ChatInputBar 左侧 `+` 按钮里, 点 `+` 弹 action sheet 让 user 选.
 *
 * 2026-10-26 (对齐 web `components/chat/SheetActionMenu.tsx` — **以 web 为准**):
 *   - web 只有 **4 项**: 图片 / 文件 / 表情 / 挂载知识库 (lucide `Image` /
 *     `FileText` / `Smile` / `Library`, 均 `w-6 h-6`).
 *   - PC 之前是 6 项 (多出「拍照」「模板」) + 3 列 ⇒ **按 web 删到 4 项 + 4 列**.
 *   - web 的按钮**只有图标 + 文案两行**, PC 多了一行灰色描述 (格式说明) ⇒ 一并删掉.
 *   - 文案逐字对齐 web: 「文档」→「**文件**」, 「知识库」→「**挂载知识库**」.
 *
 * `PlusActionKind` 联合类型仍保留 `camera` / `template`:
 *   ChatDetail 的 `handlePlusAction` 按 6 态编译 (那个文件不在本批改动范围),
 *   但**面板只渲染 web 的 4 项** ⇒ camera / template 两个入口在 PC 上已不可达.
 *
 * 容器: 复用 components/ui/BottomSheet.tsx (阶段 7 80ab56f 已建).
 * 边界: 不引 Radix Sheet; 图标走共享图标库 components/ui/Glyphs.tsx.
 *
 * 2026-10-26 (收编 + 修形状):
 *   - 4 个图标全部改成 import 共享图标 (组件意识: 禁止重复实现):
 *     `ImageIcon` / `FileTextIcon` / `SmileIcon` / `LibraryTypeIcon`.
 *   - 前 3 个 path 与 web 逐字一致 (lucide `image` / `file-text` / `smile`),
 *     尺寸/线宽不变 (24×24 / sw2).
 *   - 「挂载知识库」原先内联的 shape (`M4 19.5A2.5 2.5 0 0 1 6.5 17H20` +
 *     `M6.5 2H20v20H6.5…`, 一个文件夹) **不是** web 的 lucide `Library`
 *     ⇒ 换成共享库的 `LibraryTypeIcon` (lucide `library` 书脊造型:
 *     `m16 6 4 14` / `M12 6v14` / `M8 8v12` / `M4 4v16`).
 *     ⚠️ web `SheetActionMenu.tsx:94` 的 `Library` 是 `w-6 h-6` + lucide 默认
 *     sw2 ⇒ 这里显式传 `size={24} strokeWidth={2}` (共享库默认是 20/sw1.6),
 *     不新造图标.
 */

import { BottomSheet } from "../ui/BottomSheet";
import { FileTextIcon, ImageIcon, LibraryTypeIcon, SmileIcon } from "../ui/Glyphs";

export type PlusActionKind =
  | "image"
  | "document"
  | "emoji"
  | "knowledge"
  | "camera"
  | "template";

export interface PlusActionsSheetProps {
  open: boolean;
  onClose: () => void;
  /** 选中某项 → parent 关闭 sheet 后做对应动作 (file input / sheet / toast). */
  onAction: (kind: PlusActionKind) => void;
}

interface PlusActionItem {
  kind: PlusActionKind;
  label: string;
  icon: React.ReactNode;
}

const IMAGE_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,image/svg+xml,image/heic,image/bmp";
const DOCUMENT_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,text/plain,text/markdown";

// 2026-10-26: 逐字对齐 web `SheetActionMenu.tsx:76-95` 的 4 项 (图标 + 文案)
//   图标全部取自共享库 components/ui/Glyphs.tsx (web 用的是 lucide `Image` /
//   `FileText` / `Smile` / `Library`, PC 对应 ImageIcon / FileTextIcon /
//   SmileIcon / LibraryTypeIcon).
const ACTIONS: PlusActionItem[] = [
  {
    kind: "image",
    label: "图片",
    icon: <ImageIcon size={24} />,
  },
  {
    kind: "document",
    label: "文件",
    icon: <FileTextIcon size={24} />,
  },
  {
    kind: "emoji",
    label: "表情",
    icon: <SmileIcon size={24} />,
  },
  {
    kind: "knowledge",
    label: "挂载知识库",
    icon: <LibraryTypeIcon size={24} strokeWidth={2} />,
  },
];

export function PlusActionsSheet({ open, onClose, onAction }: PlusActionsSheetProps) {
  // A2-D1-30 (对齐 web `SheetActionMenu.tsx:70-75`):
  //   web 的 SheetContent **没有标题栏** (动作直接铺在 sheet 里)
  //   → PC 传 `title={undefined}`, 不渲染 BottomSheet 内置标题栏.
  //   网格 className 照抄 web (`grid grid-cols-4 gap-3 py-5 px-4`), 列数 = 4:
  //   2026-10-26 — PC 从 6 项删到 4 项 ⇒ 网格改 4 列, 与 web 完全一致.
  //   ⚠️ web 的 `py-5 px-4` 挂在 **SheetContent 自身**上 (base `p-6` 被 twMerge
  //   掉) ⇒ PC 容器 base 的 `p-6` 必须让位, 否则内边距比 web 多一圈
  //   (横 40px vs 16px / 纵 44px vs 20px).
  //   → 容器加 `!p-0` (PC 无 tailwind-merge, 同名类由 CSS 产物顺序决胜 ⇒ 用
  //   `!` 前缀强制压过 base `p-6`), 让内层 grid 的 `py-5 px-4` 成为唯一
  //   内边距来源, 与 web 一致.
  return (
    <BottomSheet
      open={open}
      title={undefined}
      onClose={onClose}
      contentClassName="!p-0"
    >
      <div className="grid grid-cols-4 gap-3 py-5 px-4" data-testid="plus-actions-sheet">
        {ACTIONS.map((a) => (
          <button
            key={a.kind}
            type="button"
            onClick={() => onAction(a.kind)}
            data-testid={`plus-action-${a.kind}`}
            // 逐字对齐 web `SheetActionMenu.tsx:50`
            className="flex flex-col items-center gap-2 text-fg-muted hover:text-fg transition-colors duration-150"
          >
            <span
              aria-hidden="true"
              className="w-14 h-14 rounded-full bg-bg-sunken inline-flex items-center justify-center"
            >
              {a.icon}
            </span>
            <span className="text-sm">{a.label}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}

// ───────────── icons ─────────────
//   4 个图标全部来自共享库 components/ui/Glyphs.tsx (见文件头注释),
//   本文件不再就地手写内联 svg.

// 2026-10-26: 「拍照」/「模板」两个入口已按 web 的 4 项口径删除 ⇒ 对应的内联 svg
//   (CameraIcon / TemplateIcon) 一并移除 (web `SheetActionMenu.tsx` 只有
//   Image / FileText / Smile / Library 四个图标).
// 2026-10-26 (收编): 本文件原先就地手写的 4 个内联 svg
//   (ImageIcon / DocumentIcon / EmojiIcon / KnowledgeIcon) 全部删除,
//   改成 import 共享图标库 components/ui/Glyphs.tsx.
//   ⚠️ 尺寸/线宽保持 24×24 / sw2 (共享库默认 Image/FileText 是 12×12,
//      LibraryTypeIcon 是 20×20/sw1.6 ⇒ 调用点显式传 size/strokeWidth).

// 暴露给 ChatDetail 引用 — 用于设置 file input accept 时跟 sheet 描述对齐.
// (e.g. image accept = IMAGE_ACCEPT, document accept = DOCUMENT_ACCEPT)
export const PLUS_ACTION_ACCEPT = {
  image: IMAGE_ACCEPT,
  document: DOCUMENT_ACCEPT,
  camera: IMAGE_ACCEPT, // 拍照 = image 格式 + capture="environment" (入口已删, 仅保留常量)
} as const;
