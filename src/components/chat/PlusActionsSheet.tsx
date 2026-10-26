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
 * 边界: 不引 Radix Sheet; inline 24px SVG icon 不引 lucide-react.
 */

import { BottomSheet } from "../ui/BottomSheet";

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
const ACTIONS: PlusActionItem[] = [
  {
    kind: "image",
    label: "图片",
    icon: <ImageIcon />,
  },
  {
    kind: "document",
    label: "文件",
    icon: <DocumentIcon />,
  },
  {
    kind: "emoji",
    label: "表情",
    icon: <EmojiIcon />,
  },
  {
    kind: "knowledge",
    label: "挂载知识库",
    icon: <KnowledgeIcon />,
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

// ───────────── icons (inline 24px SVG; 不引 lucide-react) ─────────────

function ImageIcon() {
  return (
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
  );
}

function DocumentIcon() {
  return (
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
  );
}

function EmojiIcon() {
  return (
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
  );
}

function KnowledgeIcon() {
  return (
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
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

// 2026-10-26: 「拍照」/「模板」两个入口已按 web 的 4 项口径删除 ⇒ 对应的内联 svg
//   (CameraIcon / TemplateIcon) 一并移除 (web `SheetActionMenu.tsx` 只有
//   Image / FileText / Smile / Library 四个图标).

// 暴露给 ChatDetail 引用 — 用于设置 file input accept 时跟 sheet 描述对齐.
// (e.g. image accept = IMAGE_ACCEPT, document accept = DOCUMENT_ACCEPT)
export const PLUS_ACTION_ACCEPT = {
  image: IMAGE_ACCEPT,
  document: DOCUMENT_ACCEPT,
  camera: IMAGE_ACCEPT, // 拍照 = image 格式 + capture="environment" (入口已删, 仅保留常量)
} as const;
