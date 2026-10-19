/**
 * components/chat/PlusActionsSheet.tsx — chat-id-22 ChatDetail 5 类附件按钮
 *
 * 对齐 web SheetActionMenu + PlusSheet (Home): 拍照 / 相册 / 文档 / 表情 / 知识库.
 * 老的 ChatInputBar 只有「图片 + 文档」两个按钮. 这里扩展为底部弹出 sheet,
 * 第一行 trigger 是 Plus 按钮 → 弹出 5 类 action; 选完关 sheet + 触发父回调.
 *
 * 拍照按 cell 来源: Electron renderer 没有 mediaDevices 摄像头权限且跨平台不便,
 * 简化为「用文件选择器 + accept='image/*' capture='environment'」, 跟 web
 * `MediaKind.camera` 同款 fallback. 真要拍照走附件系统的 camera 入口 (web
 * `SheetActionMenu` 同款).
 *
 * 设计:
 *   - 受控 (open / onClose)
 *   - 5 项 2D grid + emoji glyph
 *   - 每个 action 触发 onAction(kind) 后自动关 sheet
 */

import { BottomSheet } from "../ui/BottomSheet";

export type PlusActionKind =
  | "emoji"
  | "knowledge"
  | "camera"
  | "image"
  | "document";

export interface PlusActionsSheetProps {
  open: boolean;
  onClose: () => void;
  onAction: (kind: PlusActionKind) => void;
}

interface ActionCell {
  kind: PlusActionKind;
  label: string;
  glyph: string;
}

const ACTIONS: ActionCell[] = [
  { kind: "emoji", label: "表情", glyph: "😀" },
  { kind: "knowledge", label: "知识库", glyph: "📚" },
  { kind: "camera", label: "拍照", glyph: "📷" },
  { kind: "image", label: "相册", glyph: "🖼" },
  { kind: "document", label: "文档", glyph: "📄" },
];

export function PlusActionsSheet({
  open,
  onClose,
  onAction,
}: PlusActionsSheetProps) {
  return (
    <BottomSheet open={open} title="添加附件" onClose={onClose}>
      <div className="grid grid-cols-3 gap-y-5 gap-x-2 py-4">
        {ACTIONS.map((a) => (
          <button
            key={a.kind}
            type="button"
            onClick={() => {
              onClose();
              onAction(a.kind);
            }}
            className="flex flex-col items-center gap-2 text-fg-muted hover:text-fg transition-colors duration-150"
            data-testid={`plus-action-${a.kind}`}
          >
            <span
              aria-hidden="true"
              className="w-14 h-14 rounded-full bg-bg-sunken inline-flex items-center justify-center text-2xl"
            >
              {a.glyph}
            </span>
            <span className="text-sm">{a.label}</span>
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}