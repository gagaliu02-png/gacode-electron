/**
 * components/chat/KnowledgeAttachSheet.tsx — chat-id-30 知识库挂载 chip
 *
 * 复用 components/home/LibraryPicker.tsx (0.7.2 Home worker 建的) — 不自己
 * 重写 picker. LibraryPicker 已经有 BottomSheet + 类型 tab + 搜索 + 列表,
 * 且已支持多选 (`onConfirm`).
 *
 * 语义对齐 web (chat/[id] 多选挂载知识库):
 *   - 单选 `onSelect` → 选中即关, 只能挂一条
 *   - 多选 `onConfirm` → 勾选若干条, 点底部「完成 (N)」一次性回调全部
 *   chat 域走**多选**语义 (web 同款), parent 逐条累积到 knowledgeRefs.
 *
 * ⚠️ LibraryPicker 自己就渲染了一个 BottomSheet (带标题栏 + 底部「完成」按钮),
 *   所以这里**不再**套一层 BottomSheet — 否则会出现两层 fixed 遮罩叠在一起.
 */

import { LibraryPicker } from "../home/LibraryPicker";
import type { LibraryItem } from "../../lib/api";

export interface KnowledgeAttachSheetProps {
  open: boolean;
  onClose: () => void;
  /** 多选确认回调 — parent 逐条把 item.id 追加到 knowledgeRefs. */
  onConfirm: (items: LibraryItem[]) => void;
}

export function KnowledgeAttachSheet({
  open,
  onClose,
  onConfirm,
}: KnowledgeAttachSheetProps) {
  if (!open) return null;
  return (
    <LibraryPicker open={open} onClose={onClose} onConfirm={onConfirm} />
  );
}
