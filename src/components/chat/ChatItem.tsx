/**
 * components/chat/ChatItem.tsx — 侧边栏「对话条目」组件
 *
 * 1:1 对齐 web `gacode-web/src/components/chat/ChatItem.tsx` (79 行):
 *   - PC 之前把这个条目内联在 `components/layout/AppShell.tsx` 的
 *     `SidebarChatItem` 里 (AppShell.tsx:546-613), web 是独立组件 →
 *     按 A4-D3-02 抽成独立文件, props 与 web 对齐.
 *
 * 结构 (跟 web 一致):
 *   第一行: 标题 + 「有新消息」圆点 + 置顶按钮
 *   第二行: 相对时间 (text-xs text-muted-foreground)
 *
 * 保留的 PC 增强:
 *   - relativeTime 用 date-fns + locale zhCN (web ChatItem 没传 locale)
 *     → 若要严格 1:1 改成 `formatDistanceToNow(new Date(updatedAt), { addSuffix: true })`
 *   - aria-current={isActive ? "page" : undefined}
 *
 * A4-D3-01 — 行首气泡图标已删 (web / 安卓都没有 ⇒ PC 自创).
 *
 * 依赖: date-fns (PC 已有), components/ui/Glyphs (PinIcon / PinOffIcon)
 */
import type { KeyboardEvent } from "react";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { PinIcon, PinOffIcon } from "../ui/Glyphs";

export interface ChatItemProps {
  id: string;
  title: string;
  updatedAt: string;
  isActive?: boolean;
  hasNewMessage?: boolean;
  /** 置顶回调 (传入时右侧渲染置顶按钮) */
  onPin?: (chatId: string) => void;
  /** 是否已置顶 (用于切换 icon 与 aria-label) */
  pinned?: boolean;
  onClick: () => void;
}

export function ChatItem({
  id,
  title,
  updatedAt,
  isActive,
  hasNewMessage,
  onPin,
  pinned,
  onClick,
}: ChatItemProps) {
  const relativeTime = updatedAt
    ? formatDistanceToNow(new Date(updatedAt), {
        addSuffix: true,
        locale: zhCN,
      })
    : "";

  // 键盘可达: Enter / Space 触发 onClick (外层是 div, 避免 button 嵌套 button)
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-current={isActive ? "page" : undefined}
      className={[
        "w-full text-left px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive ? "bg-accent" : "",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span className="truncate font-medium text-sm flex-1 min-w-0">
          {title || "新对话"}
        </span>
        {hasNewMessage ? (
          <span
            className="w-2 h-2 rounded-full bg-warning shrink-0"
            aria-label="有新消息"
          />
        ) : null}
        {onPin ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPin(id);
            }}
            aria-label={pinned ? "取消置顶" : "置顶"}
            title={pinned ? "取消置顶" : "置顶"}
            className="shrink-0 w-7 h-7 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {pinned ? (
              <PinOffIcon className="w-4 h-4" />
            ) : (
              <PinIcon className="w-4 h-4" />
            )}
          </button>
        ) : null}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">{relativeTime}</div>
    </div>
  );
}
