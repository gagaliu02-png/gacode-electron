/**
 * routes/Notifications.tsx — 阶段 3 通知中心
 *
 * 数据: useQuery(["notifications", { page }], () => listNotifications(false))
 * 端点: GET /notifications — server 端 notifications/notification.routes.js:113,
 *   返 { notifications: NotificationItem[], unreadCount }. 注意: server 端
 *   take = 50 hard cap, 阶段 3 不做分页, 一把梭; 后续要分页再扩.
 *
 * 功能:
 *   - 顶部: "通知" 标题 + "全部已读" 按钮 (markAllNotificationsRead)
 *   - 列表: 单列时间倒序; 未读项左边有 brand 色 vertical bar
 *   - 点击未读项 → markNotificationRead + 跳对应路由
 *   - 空态: "还没有通知"
 *
 * 跳转规则:
 *   - notification 没有 link 字段, server schema 只有 userId/title/body/actionType/actionValue.
 *   - 阶段 3 简化: actionType='url' → window.open(actionValue); deep_link 不处理
 *     (Electron 主进程没接 protocol, 阶段 4 实体化时再处理)
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "../lib/api";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";

// 增强: server 返的对象可能带 actionType/actionValue — 这些字段在
// web api.ts 的 NotificationItem interface 里没暴露, 但 server 端
// notification.routes.js:88 验证支持. 这里在 query 层扩展.
type NotificationExtras = {
  actionType?: string;
  actionValue?: string;
};

export function Notifications() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["notifications", { page: 1 }],
    queryFn: () => listNotifications(false),
    placeholderData: (prev) => prev,
  });

  const items: NotificationItem[] = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const [pendingId, setPendingId] = useState<string | null>(null);

  const readOneMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onMutate: (id) => {
      // 乐观更新: 直接把这条置已读 + 减少 unread
      setPendingId(id);
      const prev = queryClient.getQueryData<{
        notifications: NotificationItem[];
        unreadCount: number;
      }>(["notifications", { page: 1 }]);
      if (prev) {
        queryClient.setQueryData(["notifications", { page: 1 }], {
          notifications: prev.notifications.map((n) =>
            String(n.id) === String(id) ? { ...n, read: true } : n,
          ),
          unreadCount: Math.max(0, (prev.unreadCount ?? 0) - 1),
        });
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(["notifications", { page: 1 }], ctx.prev);
      }
      toast({
        message: `标记已读失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
    onSettled: () => {
      setPendingId(null);
      // 同步 unread 计数 (AppShell bell 跟这个 key)
      queryClient.invalidateQueries({
        queryKey: ["notifications", { unread: true }],
      });
    },
  });

  const readAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: () => {
      const prev = queryClient.getQueryData<{
        notifications: NotificationItem[];
        unreadCount: number;
      }>(["notifications", { page: 1 }]);
      if (prev) {
        queryClient.setQueryData(["notifications", { page: 1 }], {
          notifications: prev.notifications.map((n) => ({ ...n, read: true })),
          unreadCount: 0,
        });
      }
      return { prev };
    },
    onSuccess: () => {
      toast({ message: "已全部标为已读", variant: "success" });
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(["notifications", { page: 1 }], ctx.prev);
      }
      toast({
        message: `操作失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["notifications", { unread: true }],
      });
    },
  });

  const handleClick = (n: NotificationItem) => {
    const ex = n as NotificationItem & NotificationExtras;
    // 先标已读 (未读时)
    if (!n.read && pendingId !== n.id) {
      readOneMutation.mutate(n.id);
    }
    // 跳动作
    if (ex.actionType === "url" && ex.actionValue) {
      window.open(ex.actionValue, "_blank", "noopener,noreferrer");
    }
    // deep_link / none: 不跳转
  };

  return (
    <div className="min-h-full flex flex-col">
      {/* 顶部 */}
      <div className="sticky top-0 z-10 bg-bg-base border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-medium">通知</h1>
          {unreadCount > 0 ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-brand/20 text-brand border border-brand/40">
              {unreadCount} 条未读
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => refetch()}
            aria-label="刷新"
            className="w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors duration-150 inline-flex items-center justify-center"
          >
            <RefreshIcon />
          </button>
          <Button
            variant="ghost"
            size="sm"
            disabled={unreadCount === 0 || readAllMutation.isPending}
            onClick={() => readAllMutation.mutate()}
          >
            全部已读
          </Button>
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 px-6 py-4">
        {isLoading ? (
          <SkeletonList />
        ) : error ? (
          <div className="rounded-md bg-danger-soft/30 border border-danger/40 px-4 py-3 text-sm">
            加载失败:{error instanceof Error ? error.message : String(error)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-2 max-w-3xl mx-auto">
            {items.map((n) => (
              <li key={n.id}>
                <NotificationRow
                  item={n}
                  onClick={() => handleClick(n)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// NotificationRow
// ────────────────────────────────────────────────────────────

function NotificationRow({
  item,
  onClick,
}: {
  item: NotificationItem;
  onClick: () => void;
}) {
  const isUnread = !item.read;
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full text-left flex items-stretch gap-3 rounded-md bg-bg-elevated border border-border p-4",
        "hover:bg-bg-sunken transition-colors duration-150",
      ].join(" ")}
    >
      {isUnread ? (
        <span
          aria-hidden="true"
          className="w-1 self-stretch rounded bg-brand shrink-0"
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
        {item.type ? (
          <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-bg-sunken border border-border text-fg-subtle">
            {item.type}
          </span>
        ) : null}
      </div>
    </button>
  );
}

// ────────────────────────────────────────────────────────────
// EmptyState / SkeletonList
// ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="rounded-md border border-border bg-bg-sunken p-8 text-center max-w-sm">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-elevated flex items-center justify-center text-fg-muted">
          <BellIcon />
        </div>
        <p className="text-base font-medium mb-1">还没有通知</p>
        <p className="text-sm text-fg-muted">
          系统通知和消息提醒会出现在这里
        </p>
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="space-y-2 max-w-3xl mx-auto">
      {Array.from({ length: 3 }).map((_, i) => (
        <li
          key={i}
          className="rounded-md bg-bg-elevated border border-border p-4 animate-pulse"
        >
          <div className="h-4 w-2/3 bg-bg-sunken rounded" />
          <div className="h-3 w-3/4 bg-bg-sunken rounded mt-2" />
        </li>
      ))}
    </ul>
  );
}

// ────────────────────────────────────────────────────────────
// helpers / icons
// ────────────────────────────────────────────────────────────

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

function BellIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
