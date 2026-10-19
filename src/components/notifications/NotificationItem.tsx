/**
 * components/notifications/NotificationItem.tsx — 单条通知行
 * (gacode-electron 0.7.5)
 *
 * 跟 Notifications.tsx 里之前的 inline NotificationRow 同款视觉, 但:
 *   - 单独抽出, 让 Notifications.tsx 不堆体积
 *   - 暴露 actionType / actionValue 让上层判断跳路由 (url / deep_link)
 *   - 多 category 时的左 icon 颜色变化 (system 红 / chat 蓝 / library 绿 / delivery 橙)
 *
 * 用法:
 *   <NotificationItem
 *     item={n}
 *     onClick={() => handleClick(n)}
 *     categoryIcon={<ChatIcon />}
 *   />
 */

import type { ReactNode } from "react";
import type { NotificationItem as NotificationData } from "../../lib/api";

export interface NotificationItemProps {
  item: NotificationData;
  onClick: () => void;
  /** 类目 icon (Notifications.tsx 选好传进来) */
  categoryIcon?: ReactNode;
}

const CATEGORY_BAR: Record<string, string> = {
  system: "bg-danger",
  chat: "bg-brand",
  library: "bg-success",
  delivery: "bg-warning",
};

export function NotificationItem({
  item,
  onClick,
  categoryIcon,
}: NotificationItemProps) {
  const isUnread = !item.read;
  const category = item.category || "";
  const barColor =
    CATEGORY_BAR[category] || (isUnread ? "bg-brand" : "bg-transparent");
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full text-left flex items-stretch gap-3 rounded-md bg-bg-elevated p-4",
        "hover:bg-bg-sunken transition-colors duration-150",
      ].join(" ")}
    >
      {categoryIcon ? (
        <span
          aria-hidden="true"
          className="shrink-0 w-9 h-9 rounded-full bg-bg-sunken flex items-center justify-center text-fg-muted"
        >
          {categoryIcon}
        </span>
      ) : null}
      {isUnread ? (
        <span
          aria-hidden="true"
          className={["w-1 self-stretch rounded shrink-0", barColor].join(" ")}
        />
      ) : (
        <span aria-hidden="true" className="w-1 shrink-0" />
      )}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-start justify-between gap-3">
          <h3
            className={[
              "text-sm flex-1 min-w-0 break-all",
              isUnread ? "font-medium text-fg" : "text-fg-muted",
            ].join(" ")}
          >
            {item.title}
          </h3>
          <span className="text-xs text-fg-subtle shrink-0">
            {formatRelative(item.createdAt)}
          </span>
        </div>
        {item.body ? (
          <p className="text-xs text-fg-muted line-clamp-2 break-all">
            {item.body}
          </p>
        ) : null}
        <div className="flex items-center gap-2 flex-wrap">
          {item.type ? (
            <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-bg-sunken text-fg-subtle">
              {item.type}
            </span>
          ) : null}
          {item.actionType === "deep_link" ? (
            <span className="text-xs text-fg-subtle">点击查看 →</span>
          ) : item.actionType === "url" ? (
            <span className="text-xs text-fg-subtle">点击打开链接 →</span>
          ) : null}
        </div>
      </div>
    </button>
  );
}

// ────────────── helpers ──────────────

function formatRelative(iso: string): string {
  if (!iso) return "-";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} 个月前`;
  return `${Math.floor(month / 12)} 年前`;
}