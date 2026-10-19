/**
 * routes/Notifications.tsx — 通知中心 (gacode-electron 0.7.5)
 *
 * 数据: useInfiniteQuery / useQuery(["notifications", { category, cursor }])
 * 端点: GET /notifications — server 端 notifications/notification.routes.js:113,
 *   返 { notifications, unreadCount, nextCursor }. server 端 take=50 hard cap,
 *   客户端 cursor 模式 (notifications-5) 拉下一批.
 *
 * 功能 (本批 P1+P2 14 项里的 5 项):
 *   - notifications-3 (P1): 单击未读 → markRead + 处理 deep_link (跳转 React Router
 *     内部 /chat/:id / /library/:id 等); url 仍走 window.open
 *   - notifications-5 (P2): 分页 — server cursor 模式 (InfiniteScrollList)
 *   - notifications-6 (P1): 分类 tab — CategoryTabs 切 system/chat/library/delivery
 *   - notifications-8 (P1): 系统级桌面通知 — 已有 lib/notifications-sse.ts + 主
 *     进程 electron/notifications.ts 路径, 只需保证 SSE → 系统通知 IPC 链路 (✓)
 *   - notifications-10 (P1): 通知设置入口 — NotificationSettingsSheet + localStorage
 *
 * 跳转规则:
 *   - actionType='url'         → window.open(actionValue)
 *   - actionType='deep_link'   → 用 react-router 内部跳 (path 形如 /chat/:id)
 *   - actionType='none' / 无    → 不跳转
 *
 * 跟 CategoryTabs / NotificationItem / InfiniteScrollList / NotificationSettingsSheet 协作,
 * 这些组件在 src/components/notifications/ 下, 不动 electron/preload.ts / main.ts.
 */

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "../lib/api";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import {
  CategoryTabs,
  type NotificationCategory,
} from "../components/notifications/CategoryTabs";
import { NotificationItem as NotificationRow } from "../components/notifications/NotificationItem";
import { InfiniteScrollList } from "../components/notifications/InfiniteScrollList";
import { NotificationSettingsSheet } from "../components/notifications/NotificationSettingsSheet";

const NOTIFICATIONS_PAGE_KEY = ["notifications"] as const;

export function Notifications() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [category, setCategory] = useState<NotificationCategory>("all");
  const [settingsOpen, setSettingsOpen] = useState(false);

  // 第一页 — 用 useQuery (而不是 useInfiniteQuery) 简化首屏 + 让 unread 计数
  // 跟 AppShell bell 共享同一 key. cursor 切到下一页时单独维护 page-1 之外的 state.
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      ...NOTIFICATIONS_PAGE_KEY,
      "page1",
      { category, unread: false },
    ],
    queryFn: () => listNotifications(false, { category: apiCategory(category) }),
    placeholderData: (prev) => prev,
  });

  // 累加的列表 (第一页 + 后续 cursor 页). 切 category 时清空.
  const [extraPages, setExtraPages] = useState<NotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    setExtraPages([]);
    setNextCursor(null);
  }, [category]);

  const firstPage: NotificationItem[] = data?.notifications ?? [];
  const items = [...firstPage, ...extraPages];
  const unreadCount = data?.unreadCount ?? 0;
  const hasMore = !!nextCursor;

  const [pendingId, setPendingId] = useState<string | null>(null);

  const readOneMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onMutate: (id) => {
      setPendingId(id);
      const prev = queryClient.getQueryData<{
        notifications: NotificationItem[];
        unreadCount: number;
      }>([
        ...NOTIFICATIONS_PAGE_KEY,
        "page1",
        { category, unread: false },
      ]);
      if (prev) {
        queryClient.setQueryData(
          [...NOTIFICATIONS_PAGE_KEY, "page1", { category, unread: false }],
          {
            notifications: prev.notifications.map((n) =>
              String(n.id) === String(id) ? { ...n, read: true } : n,
            ),
            unreadCount: Math.max(0, (prev.unreadCount ?? 0) - 1),
          },
        );
      }
      // 同步更新 extra pages
      setExtraPages((cur) =>
        cur.map((n) =>
          String(n.id) === String(id) ? { ...n, read: true } : n,
        ),
      );
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(
          [...NOTIFICATIONS_PAGE_KEY, "page1", { category, unread: false }],
          ctx.prev,
        );
      }
      toast({
        message: `标记已读失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
    onSettled: () => {
      setPendingId(null);
      queryClient.invalidateQueries({
        queryKey: [...NOTIFICATIONS_PAGE_KEY, { unread: true }],
      });
    },
  });

  const readAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: () => {
      const prev = queryClient.getQueryData<{
        notifications: NotificationItem[];
        unreadCount: number;
      }>([
        ...NOTIFICATIONS_PAGE_KEY,
        "page1",
        { category, unread: false },
      ]);
      if (prev) {
        queryClient.setQueryData(
          [...NOTIFICATIONS_PAGE_KEY, "page1", { category, unread: false }],
          {
            notifications: prev.notifications.map((n) => ({ ...n, read: true })),
            unreadCount: 0,
          },
        );
      }
      setExtraPages((cur) => cur.map((n) => ({ ...n, read: true })));
      return { prev };
    },
    onSuccess: () => {
      toast({ message: "已全部标为已读", variant: "success" });
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(
          [...NOTIFICATIONS_PAGE_KEY, "page1", { category, unread: false }],
          ctx.prev,
        );
      }
      toast({
        message: `操作失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: [...NOTIFICATIONS_PAGE_KEY, { unread: true }],
      });
    },
  });

  // 加载更多 — cursor 模式. 触发条件: sentinel 进入视口 + hasMore + !loadingMore.
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await listNotifications(false, {
        category: apiCategory(category),
        cursor: nextCursor,
      });
      setExtraPages((cur) => [...cur, ...res.notifications]);
      setNextCursor(res.nextCursor ?? null);
    } catch (err) {
      toast({
        message: `加载更多失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    } finally {
      setLoadingMore(false);
    }
  }, [category, nextCursor, loadingMore, toast]);

  const handleClick = (n: NotificationItem) => {
    // 未读时先 markRead
    if (!n.read && pendingId !== n.id) {
      readOneMutation.mutate(n.id);
    }
    // 处理动作
    const at = n.actionType;
    const av = n.actionValue;
    if (!at || !av) return;
    if (at === "url") {
      window.open(av, "_blank", "noopener,noreferrer");
    } else if (at === "deep_link") {
      // av 是内部 path, 形如 /chat/:id 或 /library/:id
      if (av.startsWith("/")) {
        navigate(av);
      } else {
        // 兜底: 当作外链
        window.open(av, "_blank", "noopener,noreferrer");
      }
    }
    // type 'system' / 'library' / 'chat' / 'delivery' / 'none' / 未知 → 不跳转
  };

  return (
    <div className="min-h-full flex flex-col">
      {/* 顶部 */}
      <div className="sticky top-0 z-10 bg-bg-base px-6 py-3 flex items-center justify-between">
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
            onClick={() => setSettingsOpen(true)}
            aria-label="通知设置"
            className="w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors duration-150 inline-flex items-center justify-center"
          >
            <GearIcon />
          </button>
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

      {/* 分类 tab (notifications-6) */}
      <div className="px-6 py-2 border-b border-border">
        <CategoryTabs active={category} onChange={setCategory} />
      </div>

      {/* 列表 */}
      <div className="flex-1 px-6 py-4">
        {isLoading ? (
          <SkeletonList />
        ) : error ? (
          <div className="rounded-md bg-danger-soft/30 px-4 py-3 text-sm">
            加载失败:{error instanceof Error ? error.message : String(error)}
          </div>
        ) : items.length === 0 ? (
          <EmptyState category={category} />
        ) : (
          <InfiniteScrollList
            hasMore={hasMore}
            isLoading={loadingMore}
            onLoadMore={loadMore}
          >
            <ul className="space-y-2 max-w-3xl mx-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <NotificationRow
                    item={n}
                    onClick={() => handleClick(n)}
                    categoryIcon={iconForCategory(n.category)}
                  />
                </li>
              ))}
            </ul>
          </InfiniteScrollList>
        )}
      </div>

      <NotificationSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

function apiCategory(c: NotificationCategory): string | undefined {
  return c === "all" ? undefined : c;
}

function iconForCategory(category?: string) {
  switch (category) {
    case "system":
      return <SystemIcon />;
    case "chat":
      return <ChatIcon />;
    case "library":
      return <LibraryIcon />;
    case "delivery":
      return <DeliveryIcon />;
    default:
      return <DefaultIcon />;
  }
}

// ────────────────────────────────────────────────────────────
// EmptyState / SkeletonList
// ────────────────────────────────────────────────────────────

function EmptyState({ category }: { category: NotificationCategory }) {
  const text =
    category === "all"
      ? "系统通知和消息提醒会出现在这里"
      : "这个分类还没有通知";
  return (
    <div className="h-full flex items-center justify-center">
      <div className="rounded-md bg-bg-sunken p-8 text-center max-w-sm">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-elevated flex items-center justify-center text-fg-muted">
          <BellIcon />
        </div>
        <p className="text-base font-medium mb-1">还没有通知</p>
        <p className="text-sm text-fg-muted">{text}</p>
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
          className="rounded-md bg-bg-elevated p-4 animate-pulse"
        >
          <div className="h-4 w-2/3 bg-bg-sunken rounded" />
          <div className="h-3 w-3/4 bg-bg-sunken rounded mt-2" />
        </li>
      ))}
    </ul>
  );
}

// ────────────────────────────────────────────────────────────
// icons
// ────────────────────────────────────────────────────────────

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

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function DeliveryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function DefaultIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}