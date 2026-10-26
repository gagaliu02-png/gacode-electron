/**
 * components/notifications/NotificationItem.tsx — 单条通知行
 *
 * 2026-10-26 对齐 web (docs/align-c-profile-notify.md 组 3 · C3-09 ~ C3-16 / C3-23):
 *   - C3-09: 容器改成 web 的 `w-full flex items-start gap-3 p-3 rounded-lg border
 *            border-border` + 已读/未读两套底色 (已读 bg-bg-sunken / 未读
 *            bg-brand-container/30 + border-brand/30)
 *   - C3-10: 未读标记从「竖条」改成「圆点」 (w-2 h-2 rounded-full, 恒定 bg-brand)
 *            —— 删掉 CATEGORY_BAR (category 在服务端不存在, F-8)
 *   - C3-11: 类型图标去掉圆形底容器 (web 没有)
 *   - C3-12: 标题区改成 `items-baseline gap-2` (基线对齐) + 标题 `truncate`
 *            + 时间 `text-[10px]`; 标签 <h3> → <span> (button 内只能放 phrasing content)
 *   - C3-13: 相对时间改走 lib/notifications.formatRelativeTime (date-fns zhCN)
 *   - C3-14: 类型角标改中文本地化 + `text-[10px]` + bg-bg-elevated
 *   - C3-15: 摘要兜底走 notificationSummary (body 为空时按类型给占位文案)
 *   - C3-16: 摘要去掉 `break-all`
 *   - C3-23: 补 data-notif-type / data-notif-target / data-notif-target-kind 锚点
 *
 * ⚠️ PC 独有 (按 gaga 指示保留): 「点击查看 →」/「点击打开链接 →」提示。
 */

import type { ReactNode } from "react";
import {
  formatRelativeTime,
  notificationPresentation,
  notificationSummary,
  notificationTarget,
  type NotificationItem as NotificationData,
} from "../../lib/notifications";

export interface NotificationItemProps {
  item: NotificationData;
  /** 已读态 — 服务端字段是 `isRead` (C3-07 连带: api.ts 的 `read` 已改名) */
  isRead: boolean;
  onClick: () => void;
  /** 类目 icon (Notifications.tsx 选好传进来) */
  categoryIcon?: ReactNode;
}

export function NotificationItem({
  item,
  isRead,
  onClick,
  categoryIcon,
}: NotificationItemProps) {
  const pres = notificationPresentation(item);
  const target = notificationTarget(item);
  // 摘要 —— 服务端给了 body 用 body; 没给按类型给占位文案 / cron 摘要
  const summary = notificationSummary(item);
  const time = formatRelativeTime(item.createdAt);

  return (
    <button
      type="button"
      onClick={onClick}
      data-notif-type={pres.kind}
      data-notif-target={target.href ?? ""}
      data-notif-target-kind={target.kind}
      className={[
        "w-full flex items-start gap-3 p-3 rounded-lg border border-border transition-colors text-left",
        isRead
          ? "bg-bg-sunken hover:bg-bg-elevated"
          : "bg-brand-container/30 hover:bg-brand-container/40 border-brand/30",
      ].join(" ")}
    >
      {/* 未读圆点 */}
      <div className="pt-1.5 shrink-0">
        <div
          className={[
            "w-2 h-2 rounded-full",
            isRead ? "bg-transparent" : "bg-brand",
          ].join(" ")}
        />
      </div>

      {/* 类型图标 — 按 type 走 */}
      <div className="shrink-0 mt-0.5">{categoryIcon}</div>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span
            className={[
              "text-sm font-medium truncate",
              isRead ? "text-fg-muted" : "text-fg",
            ].join(" ")}
          >
            {item.title}
          </span>
          <span className="text-[10px] text-fg-subtle shrink-0">{time}</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          {/* 类型角标 —— 只给两种已知类型挂 (「其它通知」那一组有分组标题,
              逐条再挂一个「通知」角标是冗余) */}
          {pres.kind !== "other" ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-fg-subtle shrink-0">
              {pres.label}
            </span>
          ) : null}
          {/* 摘要 —— body 为空时按类型兜底 (日程到点了 / 定时任务 {cronId} · {ranAt} / ...) */}
          {summary ? (
            <p className="text-xs text-fg-muted line-clamp-2">{summary}</p>
          ) : null}
          {item.actionType === "deep_link" ? (
            <span className="text-xs text-fg-subtle shrink-0">点击查看 →</span>
          ) : item.actionType === "url" ? (
            <span className="text-xs text-fg-subtle shrink-0">点击打开链接 →</span>
          ) : null}
        </div>
      </div>
    </button>
  );
}
