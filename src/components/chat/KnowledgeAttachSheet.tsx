/**
 * components/chat/KnowledgeAttachSheet.tsx — chat-id-30 知识库挂载 chip
 *
 * 复用 components/home/LibraryPicker.tsx (0.7.2 Home worker 建的) — 不自己
 * 重写 picker. LibraryPicker 已经有 BottomSheet + 类型 tab + 搜索 + 列表,
 * 单选回调. 这里只是薄壳:
 *   - open / onClose 包装一个 BottomSheet
 *   - 选中 item → onPick(item) → parent 关闭 sheet + 把 atom id 加到下一次
 *     submit 的 knowledgeRefs 数组里
 *
 * ⚠️ LibraryPicker 的 onSelect 单选 — 我们需要「可挂多条」语义, 用 chip 累加.
 *   这里包一层: KnowledgeAttachSheet 内部用 single-select 模式, 把每次选中
 *   通过 onPick 推给 parent. parent 维护累积 ids 数组 + 渲染 chip 行.
 */

import { LibraryPicker } from "../home/LibraryPicker";
import { BottomSheet } from "../ui/BottomSheet";
import type { LibraryItem } from "../../lib/api";

export interface KnowledgeAttachSheetProps {
  open: boolean;
  onClose: () => void;
  /** 单选回调 — parent 把 item.id 追加到 knowledgeRefs. */
  onPick: (item: LibraryItem) => void;
}

export function KnowledgeAttachSheet({
  open,
  onClose,
  onPick,
}: KnowledgeAttachSheetProps) {
  if (!open) return null;
  return (
    <BottomSheet open={open} title="挂载知识库" onClose={onClose}>
      <LibraryPicker open={open} onClose={onClose} onSelect={onPick} />
    </BottomSheet>
  );
}