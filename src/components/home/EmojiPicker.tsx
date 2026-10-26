/**
 * components/home/EmojiPicker.tsx — Home 页 表情选择器
 *
 * 对齐 web `src/components/chat/EmojiPicker.tsx` — 内联常用 60 个 emoji,
 * 不引 emoji-mart 依赖 (改动小优先).
 *
 * 设计:
 *   - 搜索: 按 emoji 自身 + keywords 中英文过滤
 *   - 分类: 笑脸 / 手势 / 符号 (3 类 chip, 无搜索时显示)
 *   - 选中 → onSelect(emoji) → parent 把它追加到 textarea
 *
 * 容器: BottomSheet — 不引 Radix Sheet.
 */

import { useMemo, useState } from "react";
import { BottomSheet } from "../ui/BottomSheet";
import { SearchFieldIcon } from "../ui/Glyphs";

type EmojiCategory = "smileys" | "gestures" | "symbols";

interface EmojiEntry {
  emoji: string;
  keywords: string[];
  category: EmojiCategory;
}

const EMOJI_DATA: EmojiEntry[] = [
  // 笑脸
  { emoji: "😀", keywords: ["grin", "笑", "开心"], category: "smileys" },
  { emoji: "😃", keywords: ["smile", "笑"], category: "smileys" },
  { emoji: "😄", keywords: ["laugh", "哈哈"], category: "smileys" },
  { emoji: "😁", keywords: ["beam", "嘻"], category: "smileys" },
  { emoji: "😆", keywords: ["laugh", "哈哈"], category: "smileys" },
  { emoji: "😅", keywords: ["sweat", "汗"], category: "smileys" },
  { emoji: "🤣", keywords: ["rofl", "笑死"], category: "smileys" },
  { emoji: "😂", keywords: ["joy", "笑哭"], category: "smileys" },
  { emoji: "🙂", keywords: ["smile", "微笑"], category: "smileys" },
  { emoji: "🙃", keywords: ["upside", "反转"], category: "smileys" },
  { emoji: "😉", keywords: ["wink", "眨眼"], category: "smileys" },
  { emoji: "😊", keywords: ["blush", "害羞"], category: "smileys" },
  { emoji: "😇", keywords: ["angel", "天使"], category: "smileys" },
  { emoji: "😍", keywords: ["love", "爱"], category: "smileys" },
  { emoji: "🥰", keywords: ["love", "喜爱"], category: "smileys" },
  { emoji: "😘", keywords: ["kiss", "亲"], category: "smileys" },
  { emoji: "😗", keywords: ["kiss", "亲"], category: "smileys" },
  { emoji: "😚", keywords: ["kiss", "亲"], category: "smileys" },
  { emoji: "😙", keywords: ["kiss", "亲"], category: "smileys" },
  { emoji: "🥲", keywords: ["smile", "苦笑"], category: "smileys" },
  { emoji: "😋", keywords: ["yum", "馋"], category: "smileys" },
  { emoji: "😛", keywords: ["tongue", "吐舌"], category: "smileys" },
  { emoji: "😜", keywords: ["tongue", "调皮"], category: "smileys" },
  { emoji: "🤪", keywords: ["zany", "疯狂"], category: "smileys" },
  { emoji: "😎", keywords: ["cool", "酷"], category: "smileys" },
  { emoji: "🤓", keywords: ["nerd", "书呆"], category: "smileys" },
  { emoji: "🧐", keywords: ["monocle", "探索"], category: "smileys" },
  { emoji: "🤔", keywords: ["think", "想"], category: "smileys" },
  { emoji: "🤗", keywords: ["hug", "拥抱"], category: "smileys" },
  { emoji: "🤭", keywords: ["hand", "偷笑"], category: "smileys" },
  { emoji: "🤫", keywords: ["shush", "嘘"], category: "smileys" },
  { emoji: "🤐", keywords: ["zipper", "封口"], category: "smileys" },
  // 手势
  { emoji: "👍", keywords: ["thumbs", "赞", "好"], category: "gestures" },
  { emoji: "👎", keywords: ["thumbs", "踩", "差"], category: "gestures" },
  { emoji: "👌", keywords: ["ok", "好的"], category: "gestures" },
  { emoji: "✌️", keywords: ["peace", "胜利"], category: "gestures" },
  { emoji: "🤞", keywords: ["cross", "祈祷"], category: "gestures" },
  { emoji: "🤟", keywords: ["love", "爱你"], category: "gestures" },
  { emoji: "🤘", keywords: ["rock", "摇滚"], category: "gestures" },
  { emoji: "👏", keywords: ["clap", "鼓掌"], category: "gestures" },
  { emoji: "🙌", keywords: ["raise", "举手"], category: "gestures" },
  { emoji: "🙏", keywords: ["pray", "感谢", "求"], category: "gestures" },
  { emoji: "💪", keywords: ["muscle", "强"], category: "gestures" },
  { emoji: "✍️", keywords: ["write", "写"], category: "gestures" },
  // 符号
  { emoji: "❤️", keywords: ["heart", "心", "爱"], category: "symbols" },
  { emoji: "🧡", keywords: ["heart", "心"], category: "symbols" },
  { emoji: "💛", keywords: ["heart", "心"], category: "symbols" },
  { emoji: "💚", keywords: ["heart", "心"], category: "symbols" },
  { emoji: "💙", keywords: ["heart", "心"], category: "symbols" },
  { emoji: "💜", keywords: ["heart", "心"], category: "symbols" },
  { emoji: "🖤", keywords: ["heart", "心"], category: "symbols" },
  { emoji: "🤍", keywords: ["heart", "心"], category: "symbols" },
  { emoji: "💔", keywords: ["heart", "心碎"], category: "symbols" },
  { emoji: "💯", keywords: ["100", "满分"], category: "symbols" },
  { emoji: "✨", keywords: ["sparkle", "闪光"], category: "symbols" },
  { emoji: "⭐", keywords: ["star", "星"], category: "symbols" },
  { emoji: "🌟", keywords: ["star", "星"], category: "symbols" },
  { emoji: "🔥", keywords: ["fire", "火"], category: "symbols" },
  { emoji: "💩", keywords: ["poop", "便便"], category: "symbols" },
];

const CATEGORIES: { key: EmojiCategory; label: string }[] = [
  { key: "smileys", label: "笑脸" },
  { key: "gestures", label: "手势" },
  { key: "symbols", label: "符号" },
];

export interface EmojiPickerProps {
  open: boolean;
  onClose: () => void;
  /** 选中 emoji 字符串; parent 拼到 textarea */
  onSelect: (emoji: string) => void;
}
export function EmojiPicker({ open, onClose, onSelect }: EmojiPickerProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<EmojiCategory>("smileys");

  // 搜索 + 分类过滤
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return EMOJI_DATA.filter((e) => e.category === activeCategory);
    return EMOJI_DATA.filter(
      (e) =>
        e.keywords.some((k) => k.toLowerCase().includes(q)) ||
        e.emoji.includes(q),
    );
  }, [search, activeCategory]);

  // 关闭 sheet 时清 search (避免下次打开残留)
  const handleClose = () => {
    setSearch("");
    onClose();
  };

  return (
    // 2026-10-26 对齐 web `components/chat/EmojiPicker.tsx:133`:
    //   web SheetContent className 含 `max-h-[70vh]` (PC 的 BottomSheet base 是 85vh)
    <BottomSheet
      open={open}
      title="选择表情"
      onClose={handleClose}
      maxHeight="max-h-[70vh]"
    >
      {/* 顶部搜索 + 分类 */}
      <div className="px-4 pt-5 pb-3 border-b border-border space-y-3">
        <div className="relative">
          <SearchFieldIcon />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索表情 (例如: 笑 / heart)"
            className="w-full pl-9 pr-3 py-2 rounded-md bg-bg-sunken text-fg placeholder:text-fg-subtle outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        {!search && (
          <div className="flex gap-2 mt-3">
            {CATEGORIES.map((c) => {
              const active = c.key === activeCategory;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setActiveCategory(c.key)}
                  className={[
                    "px-3 py-1 rounded-full text-xs transition-colors duration-150",
                    active
                      ? "bg-brand text-brand-on"
                      : "bg-bg-sunken text-fg-muted hover:text-fg",
                  ].join(" ")}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* emoji 网格 */}
      <div className="px-4 py-3">
        {filtered.length === 0 ? (
          <div className="text-center text-fg-muted py-8 text-sm">
            没有匹配的表情
          </div>
        ) : (
          <div className="grid grid-cols-8 gap-1">
            {filtered.map((e) => (
              <button
                key={e.emoji + e.keywords[0]}
                type="button"
                onClick={() => {
                  // A2-D1-37 (对齐 web `chat/EmojiPicker.tsx:186-189`):
                  //   web 选中 emoji 后 `handleOpenChange(false)` 关掉面板;
                  //   PC 的关闭入口是 `handleClose` (清 search + onClose).
                  onSelect(e.emoji);
                  handleClose();
                }}
                aria-label={e.keywords[0]}
                className="w-10 h-10 rounded-md text-2xl hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center"
              >
                {e.emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}