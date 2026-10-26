/**
 * routes/Notifications.tsx — 通知中心 (gacode-electron 0.7.5)
 *
 * 数据: useQuery(["notifications", { unread: false }])
 * 端点: GET /notifications — server 端 notifications/notification.routes.js:343,
 *   返 { notifications, unreadCount }. server 端 take=50 hard cap, **只认
 *   `?unread=true`** —— 没有 `?category=` / `?cursor=` / `nextCursor` (F-8).
 *
 * 2026-10-26 对齐 web (docs/align-c-profile-notify.md 组 3 + 组 4):
 *   - C3-01: 单层滚动容器 `px-4 lg:px-8 py-6 max-w-3xl mx-auto` (去掉 sticky 头部)
 *   - C3-02/03: 标题「通知中心」+ 铃铛图标 + destructive Badge (「N 未读」)
 *   - C3-04: 「全部已读」补图标 (CheckCheck / Loader2) + gap-1.5
 *   - C3-05 / C4-01 / C4-03: 通知页顶部**常驻**「桌面通知」状态卡
 *               (PC 三态替代 web 的浏览器三态, 见 S-6 已拍板口径)
 *   - C3-06: 「待开发」占位 Banner (401/403 时)
 *   - C3-07 / C3-08: **废掉 5 个 category tab**, 改成按服务端 `type` 分三组
 *               (日程提醒 / 定时任务产出 / 其它), 每组带图标 + 标题 + 数量
 *   - C3-20: 删掉 cursor 分页 (服务端根本不认 `?cursor=` ⇒ 分页永不触发)
 *   - C3-21/22: 空态改 web 的 Card + 📭, 加载态改 3 条 h-20 骨架
 *   - C3-17/18/19: 点通知 → 深链解析 (yinian://chat/{id} → /chat/{id}) +
 *               外链白名单 + 认不出的链接提示
 *   - C4-14/15: 列表轮询 45s (NOTIFICATION_POLL_MS) + queryKey 前缀失效
 *
 * ⚠️ PC 独有 (按 gaga 指示保留): 右上角齿轮设置入口 + 刷新按钮 +
 *   NotificationSettingsSheet (5 个开关 + 测试通知)。
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listNotifications,
  loadNotificationPrefs,
  markAllNotificationsRead,
  markNotificationRead,
  saveNotificationPrefs,
  type NotificationPrefs,
  type NotificationsListResponse,
} from "../lib/api";
import {
  NOTIFICATION_GROUP_ORDER,
  NOTIFICATION_POLL_MS,
  notificationPresentation,
  notificationTarget,
  openExternalNotificationUrl,
  type NotificationItem,
  type NotificationKind,
} from "../lib/notifications";
import { useToast } from "../components/ui/Toast";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { NotificationItem as NotificationRow } from "../components/notifications/NotificationItem";
import { NotificationSettingsSheet } from "../components/notifications/NotificationSettingsSheet";

const NOTIFICATIONS_QUERY_KEY = ["notifications", { unread: false }] as const;

export function Notifications() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPrefs>(() =>
    loadNotificationPrefs(),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);

  // 通知偏好变化 (设置面板改的) → 顶部长驻卡跟着刷新
  useEffect(() => {
    const onPrefs = () => setPrefs(loadNotificationPrefs());
    window.addEventListener(
      "gacode:notification-prefs-changed",
      onPrefs as EventListener,
    );
    return () => {
      window.removeEventListener(
        "gacode:notification-prefs-changed",
        onPrefs as EventListener,
      );
    };
  }, []);

  // C3-20 / C4-14: 一次性拉 50 条 (web 同款), 45s 轮询兜底, 不分页
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: () => listNotifications(false),
    retry: false,
    refetchInterval: NOTIFICATION_POLL_MS,
    refetchIntervalInBackground: false,
  });

  const items: NotificationItem[] = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  // C3-07: 按服务端 `type` 分组 (日程提醒 → 定时任务产出 → 其它)
  const groups = NOTIFICATION_GROUP_ORDER.map((kind) => ({
    kind,
    items: items.filter((n) => notificationPresentation(n).kind === kind),
  })).filter((g) => g.items.length > 0);

  // 401/403 → 视为「后端未就绪」(web 同款判断)
  const isUndeployed =
    !!error &&
    /401|403/.test(error instanceof Error ? error.message : String(error));

  const readOneMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onMutate: (id) => {
      setPendingId(id);
      const prev = queryClient.getQueryData<NotificationsListResponse>(
        NOTIFICATIONS_QUERY_KEY,
      );
      if (prev) {
        queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, {
          notifications: prev.notifications.map((n) =>
            String(n.id) === String(id) ? { ...n, isRead: true } : n,
          ),
          unreadCount: Math.max(0, (prev.unreadCount ?? 0) - 1),
        });
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, ctx.prev);
      }
      toast({
        title: "标记已读失败",
        description: err instanceof Error ? err.message : String(err),
        variant: "danger",
      });
    },
    onSettled: () => {
      setPendingId(null);
      // C4-15: 前缀匹配 —— 列表 + 角标两条 query 一起失效
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const readAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: () => {
      const prev = queryClient.getQueryData<NotificationsListResponse>(
        NOTIFICATIONS_QUERY_KEY,
      );
      if (prev) {
        queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, {
          notifications: prev.notifications.map((n) => ({ ...n, isRead: true })),
          unreadCount: 0,
        });
      }
      return { prev };
    },
    onSuccess: () => {
      toast({ title: "已全部标为已读", variant: "success" });
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, ctx.prev);
      }
      toast({
        title: "操作失败",
        description: err instanceof Error ? err.message : String(err),
        variant: "danger",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // C3-17 / C3-18 / C3-19: 点通知 → 标已读 + 跳落点
  const handleClick = (n: NotificationItem) => {
    if (!n.isRead && pendingId !== n.id) {
      readOneMutation.mutate(n.id);
    }
    const target = notificationTarget(n);
    // ① 外链 (actionType='url') → 开新窗口
    if (target.kind === "url") {
      if (!openExternalNotificationUrl(target.url)) {
        toast({
          title: "无法打开链接",
          description: target.url,
          variant: "warning",
        });
      }
      return;
    }
    // ② 认不出的 deep link → 提示一句, 别让用户以为点击没生效
    if (target.kind === "none") {
      if (target.rawLink) {
        toast({
          title: "无法识别的链接",
          description: target.rawLink,
          variant: "warning",
        });
      }
      return;
    }
    if (!target.href) return;
    navigate(target.href);
  };

  const updatePrefs = (next: Partial<NotificationPrefs>) => {
    const merged: NotificationPrefs = { ...prefs, ...next };
    setPrefs(merged);
    saveNotificationPrefs(merged);
  };

  const desktopSupported =
    typeof window !== "undefined" && !!window.gacode?.notify;

  return (
    <div className="px-4 lg:px-8 py-6 max-w-3xl mx-auto">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BellIcon className="w-5 h-5 text-brand" />
          <h1 className="text-lg font-semibold">通知中心</h1>
          {unreadCount > 0 ? (
            <Badge variant="destructive" className="!text-[10px]">
              {unreadCount} 未读
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {/* PC 独有: 通知设置 (齿轮) + 刷新 */}
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
            onClick={() => readAllMutation.mutate()}
            disabled={readAllMutation.isPending || unreadCount === 0}
            className="gap-1.5"
          >
            {readAllMutation.isPending ? (
              <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCheckIcon className="w-3.5 h-3.5" />
            )}
            全部已读
          </Button>
        </div>
      </div>

      {/* Pending-development placeholder */}
      {isUndeployed ? <PendingBanner /> : null}

      {/* 桌面通知常驻卡 (C3-05 / C4-01 / C4-03) — PC 三态替代 web 的浏览器三态 */}
      <DesktopNotificationCard
        prefs={prefs}
        supported={desktopSupported}
        onEnable={() => updatePrefs({ enabled: true, desktopEnabled: true })}
        onDisable={() => updatePrefs({ desktopEnabled: false })}
      />

      {/* Loading */}
      {isLoading && !isUndeployed ? <SkeletonList /> : null}

      {/* Empty */}
      {!isLoading && !isUndeployed && items.length === 0 ? <EmptyState /> : null}

      {/* List — 按 type 分组 */}
      {!isLoading && items.length > 0 ? (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.kind} data-notif-group={g.kind}>
              <div className="flex items-center gap-2 mb-2">
                <GroupIcon kind={g.kind} />
                <h2 className="text-sm font-semibold text-fg-muted">
                  {notificationPresentation({ type: g.kind }).group}
                </h2>
                <span className="text-xs text-fg-subtle">{g.items.length}</span>
              </div>
              <div className="space-y-2">
                {g.items.map((n) => (
                  <NotificationRow
                    key={n.id}
                    item={n}
                    isRead={!!n.isRead}
                    onClick={() => handleClick(n)}
                    categoryIcon={<GroupIcon kind={g.kind} />}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      <NotificationSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// DesktopNotificationCard — 通知页顶部常驻的「桌面通知」开关卡
//
// web 的 BrowserNotificationCard 是浏览器三态 (unsupported / denied /
// default / granted+paused / granted+enabled); Electron 没有浏览器权限
// 模型 ⇒ PC 换成自己的三态 (S-6 已拍板):
//   · 系统不支持 (window.gacode?.notify 不在)
//   · 未开启 (prefs.enabled && prefs.desktopEnabled)
//   · 已开启
// 文案按拍板口径: 提示去「Windows 设置 → 系统 → 通知」开 Gacode,
// **不做**自动引导弹窗 (桌面应用不该在用户没触发时弹模态框)。
// ────────────────────────────────────────────────────────────

function DesktopNotificationCard({
  prefs,
  supported,
  onEnable,
  onDisable,
}: {
  prefs: NotificationPrefs;
  supported: boolean;
  onEnable: () => void;
  onDisable: () => void;
}) {
  const enabled = prefs.enabled && prefs.desktopEnabled;

  return (
    <Card className="mb-4">
      <CardContent className="!p-4">
        {supported ? (
          <div className="flex items-start gap-3">
            {enabled ? (
              <BellRingIcon className="w-5 h-5 text-success mt-0.5 shrink-0" />
            ) : (
              <BellIcon className="w-5 h-5 text-brand mt-0.5 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-medium text-fg">
                {enabled ? "桌面通知已开启" : "开启桌面通知"}
              </div>
              <div className="text-xs text-fg-muted mt-1">
                {enabled
                  ? "AI 回复到达且您不在前台时, 会收到系统通知"
                  : "AI 回复到达时提醒您"}
              </div>
              {!enabled ? (
                <div className="text-xs text-fg-subtle mt-1">
                  请在 Windows 设置→系统→通知中允许 Gacode
                </div>
              ) : null}
            </div>
            {enabled ? (
              <Button size="sm" variant="outline" onClick={onDisable}>
                关闭
              </Button>
            ) : (
              <Button size="sm" onClick={onEnable} className="gap-1.5">
                开启
              </Button>
            )}
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <BellOffIcon className="w-5 h-5 text-fg-subtle mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-fg">系统通知不可用</div>
              <div className="text-xs text-fg-muted mt-1">
                当前环境不支持系统通知
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// GroupIcon — 分组标题 / 通知行的类型图标 (按 type 走)
// ────────────────────────────────────────────────────────────

function GroupIcon({ kind, className = "" }: { kind: NotificationKind; className?: string }) {
  if (kind === "schedule_reminder") {
    return <CalendarIcon className={["w-4", "h-4", "text-brand", className].filter(Boolean).join(" ")} />;
  }
  if (kind === "cron_result") {
    return <ClockIcon className={["w-4", "h-4", "text-brand", className].filter(Boolean).join(" ")} />;
  }
  return <BellIcon className={["w-4", "h-4", "text-fg-muted", className].filter(Boolean).join(" ")} />;
}

// ────────────────────────────────────────────────────────────
// EmptyState / SkeletonList / PendingBanner
// ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <Card>
      <CardContent className="!p-10 text-center text-fg-muted">
        <div className="text-5xl mb-4">📭</div>
        <div className="text-base font-medium mb-1 text-fg">暂无通知</div>
        <div className="text-sm">新消息会在此处通知你</div>
      </CardContent>
    </Card>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-20 w-full rounded-lg animate-pulse bg-bg-elevated" />
      ))}
    </div>
  );
}

function PendingBanner() {
  return (
    <Card className="border-dashed border-warning/50 bg-warning-soft/30">
      <CardContent className="!p-6 text-center">
        <div className="text-5xl mb-3">🛎️</div>
        <h2 className="text-base font-semibold text-fg mb-1">通知中心</h2>
        <p className="text-sm text-fg-muted">🚧 待开发 — 后端接口尚未就绪</p>
        <p className="text-xs text-fg-subtle mt-2">
          部署 Worker D 的通知端点后, 这里将显示实时通知列表
        </p>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// icons (手写内联 SVG — PC 无 lucide-react)
// ────────────────────────────────────────────────────────────

function BellIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function BellRingIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10.5 5.5A6 6 0 0 1 18 8c0 7 3 9 3 9H5" />
      <path d="M18 8a6 6 0 0 0-9.33-5" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function BellOffIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10.5 5.5A6 6 0 0 1 18 8c0 7 3 9 3 9H5" />
      <path d="M6 8c0 7-3 9-3 9h14" />
      <path d="M2 2l20 20" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function CalendarIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

function ClockIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
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
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 2 2 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 1.82-.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function CheckCheckIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 7 17l-4-4" />
      <path d="m22 10-7.5 7.5L8 13" />
    </svg>
  );
}

function SpinnerIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
