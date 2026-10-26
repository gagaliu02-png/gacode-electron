/**
 * components/chat/PlusActionsSheet.tsx — ChatDetail 左下 `+` 按钮弹出 sheet
 *
 * gagaOS 2026-10-20 反馈 (0.7.5 hotfix 2):
 *   - ChatInputBar 内置 4 个附件按钮 (image/document/emoji/knowledge) 走错路 —
 *     应统一收在 ChatInputBar 左侧 `+` 按钮里, 点 `+` 弹 6 项 action sheet 让 user 选.
 *   - 参考 gacode-web `SheetActionMenu.tsx` (4 项) + 任务规格扩展到 6 项.
 *
 * 6 项 (顺序: 图片 / 文档 / 表情 / 知识库 / 拍照 / 模板):
 *   - image     → 本地图库选择 → file input accept="image/jpeg,image/png,..."
 *   - document  → 文件选择    → file input accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md"
 *   - emoji     → 弹 EmojiPicker (复用 components/home/EmojiPicker.tsx)
 *   - knowledge → 弹 KnowledgeAttachSheet (复用 components/chat/KnowledgeAttachSheet.tsx)
 *   - camera    → 调用系统相机 capture="environment" (Windows desktop 多 fall back 到 image picker)
 *   - template  → electron 端暂未实现, toast 占位 ("模板功能即将推出"), 跟 web 同款
 *
 * 容器: 复用 components/ui/BottomSheet.tsx (阶段 7 80ab56f 已建).
 * 边界: 不引 Radix Sheet; inline 24px SVG icon 不引 lucide-react (跟 PlusSheet 6 项图标一致).
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
  /** 副标题 / 支持格式 (gaga 反馈第②条 — 文件格式明确列出). */
  description: string;
  icon: React.ReactNode;
}

const IMAGE_ACCEPT =
  "image/jpeg,image/png,image/gif,image/webp,image/svg+xml,image/heic,image/bmp";
const DOCUMENT_ACCEPT =
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-powerpoint,text/plain,text/markdown";

const ACTIONS: PlusActionItem[] = [
  {
    kind: "image",
    label: "图片",
    description: "JPEG · PNG · GIF · WebP · SVG · HEIC · BMP",
    icon: <ImageIcon />,
  },
  {
    kind: "document",
    label: "文档",
    description: "PDF · Word · Excel · PowerPoint · TXT · Markdown",
    icon: <DocumentIcon />,
  },
  {
    kind: "emoji",
    label: "表情",
    description: "选个表情插到输入框",
    icon: <EmojiIcon />,
  },
  {
    kind: "knowledge",
    label: "知识库",
    description: "挂载知识库条目作为参考",
    icon: <KnowledgeIcon />,
  },
  {
    kind: "camera",
    label: "拍照",
    description: "调用系统相机 / 图片采集",
    icon: <CameraIcon />,
  },
  {
    kind: "template",
    label: "模板",
    description: "从模板创建 (即将推出)",
    icon: <TemplateIcon />,
  },
];

export function PlusActionsSheet({ open, onClose, onAction }: PlusActionsSheetProps) {
  // A2-D1-30 (对齐 web `SheetActionMenu.tsx:70-75`):
  //   web 的 SheetContent **没有标题栏** (动作直接铺在 sheet 里)
  //   → PC 传 `title={undefined}`, 不渲染 BottomSheet 内置标题栏.
  //   网格 className 照抄 web (`gap-3 py-5 px-4`), 列数保持 3:
  //   PC 有 6 个动作 (web 只有 4 个), 改 4 列会排成 2 行半.
  return (
    <BottomSheet open={open} title={undefined} onClose={onClose}>
      <div className="grid grid-cols-3 gap-3 py-5 px-4" data-testid="plus-actions-sheet">
        {ACTIONS.map((a) => (
          <button
            key={a.kind}
            type="button"
            onClick={() => onAction(a.kind)}
            data-testid={`plus-action-${a.kind}`}
            className="flex flex-col items-center gap-2 text-fg-muted hover:text-fg transition-colors duration-150"
          >
            <span
              aria-hidden="true"
              className="w-14 h-14 rounded-full bg-bg-sunken inline-flex items-center justify-center"
            >
              {a.icon}
            </span>
            <span className="text-sm">{a.label}</span>
            <span className="text-[10px] text-fg-subtle px-1 text-center leading-tight max-w-[110px]">
              {a.description}
            </span>
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

function CameraIcon() {
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
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function TemplateIcon() {
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
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  );
}

// 暴露给 ChatDetail 引用 — 用于设置 file input accept 时跟 sheet 描述对齐.
// (e.g. image accept = IMAGE_ACCEPT, document accept = DOCUMENT_ACCEPT)
export const PLUS_ACTION_ACCEPT = {
  image: IMAGE_ACCEPT,
  document: DOCUMENT_ACCEPT,
  camera: IMAGE_ACCEPT, // 拍照 = image 格式 + capture="environment"
} as const;