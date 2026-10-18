/**
 * components/layout/AppShell.tsx — 阶段 2 App shell + 真实数据
 *
 * 阶段 1 这里有 HARD_PINNED_CHATS / HARD_RECENT_CHATS 假数据 + UNREAD_NOTIF_COUNT 0,
 * 阶段 2 接 useChats (React Query getChats) + useNotifications (listNotifications).
 *
 * 渲染:
 *   256px sidebar
 *     ├─ 顶 brand bar (gacode + 铃铛 + badge)
 *     ├─ 主菜单 (知识库 / 交付中心 / 通知 / 浏览器 / 我的) — active 高亮
 *     ├─ 置顶 (可折叠, 默认展开)
 *     ├─ 最近 (默认前 5, "show more" 展开)
 *     └─ 用户卡 + 注销
 *   56px header (返回 + 居中标题 + 右 slot)  ← 父路由内容自己负责右 slot
 *   flex-1 main: children (路由 outlet)
 *
 * 当前 chat 高亮: pathname `/chat/:id` 时匹配唯一 id, 仍按 /chat active 走;
 *   在侧边 chat 列表里额外给当前 id 加 brand 左侧高亮.
 */

import { useState, type ReactNode } from "react";
import { useLocation, useNavigate, type To } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth";
import { useToast } from "../ui/Toast";
import { getChats, listNotifications, type ChatSession } from "../../lib/api";

const SIDEBAR_WIDTH = "w-64";
const RECENT_DEFAULT_LIMIT = 5;

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

function resolveTitle(pathname: string): string {
  if (pathname === "/") return "首页";
  if (pathname.startsWith("/chat/")) return "对话详情";
  if (pathname === "/library") return "知识库";
  if (pathname.startsWith("/library/")) return "知识库详情";
  if (pathname === "/deliveries") return "交付中心";
  if (pathname.startsWith("/deliveries/")) return "交付详情";
  if (pathname.startsWith("/notifications")) return "通知";
  if (pathname === "/profile") return "我的";
  if (pathname === "/profile/edit") return "编辑资料";
  if (pathname === "/profile/change-password") return "修改密码";
  if (pathname === "/profile/apps") return "我的应用";
  if (pathname === "/browser") return "浏览器";
  return "Gacode";
}

function isSubRoute(pathname: string): boolean {
  return pathname !== "/";
}

function initials(displayName: string): string {
  const s = displayName.trim();
  if (!s) return "?";
  return s.charAt(0).toUpperCase();
}

// ────────────────────────────────────────────────────────────
// navigation
// ────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  to: To;
  match: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "知识库",
    to: "/library",
    match: (p) => p === "/library" || p.startsWith("/library/"),
  },
  {
    label: "交付中心",
    to: "/deliveries",
    match: (p) => p === "/deliveries" || p.startsWith("/deliveries/"),
  },
  {
    label: "通知",
    to: "/notifications",
    match: (p) => p === "/notifications",
  },
  {
    label: "浏览器",
    to: "/browser",
    match: (p) => p === "/browser",
  },
  {
    label: "我的",
    to: "/profile",
    match: (p) => p.startsWith("/profile"),
  },
];

// ────────────────────────────────────────────────────────────
// AppShell
// ────────────────────────────────────────────────────────────

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const title = resolveTitle(location.pathname);
  const showBack = isSubRoute(location.pathname);

  // chats — sidebar 真实数据
  const { data: chatsData, isLoading: chatsLoading } = useQuery({
    queryKey: ["chats"],
    queryFn: getChats,
    refetchInterval: 60_000, // 每分钟后台刷一次, sidebar 实时性够用
  });
  const allChats: ChatSession[] = chatsData?.chats ?? [];
  const pinned = allChats.filter((c) => c.pinned);
  const recent = allChats.filter((c) => !c.pinned);

  // notifications — 顶红点
  const { data: notifData } = useQuery({
    queryKey: ["notifications", { unread: true }],
    queryFn: () => listNotifications(true),
    refetchInterval: 30_000, // 30s 轮询, refetchOnWindowFocus 默认 false
  });
  const unreadCount = notifData?.unreadCount ?? 0;

  // 找出当前 chat id (pathname `/chat/:id`)
  const currentChatId =
    location.pathname.startsWith("/chat/") &&
    location.pathname.length > "/chat/".length
      ? location.pathname.slice("/chat/".length).split("/")[0]
      : null;

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast({ message: "已登出", variant: "success" });
      navigate("/login", { replace: true });
    } catch {
      toast({ message: "登出失败,请重试", variant: "danger" });
    }
  };

  const displayName = user?.displayName || user?.username || "User";

  return (
    <div className="flex h-screen overflow-hidden bg-bg-base text-fg">
      {/* ============================================================
          Sidebar (256px 持久)
          ============================================================ */}
      <aside
        className={[SIDEBAR_WIDTH, "shrink-0 bg-bg-base flex flex-col"].join(" ")}
        aria-label="主导航"
      >
        {/* TopBar */}
        <div className="px-3 pt-3">
          <div className="flex items-center gap-2 rounded-md bg-bg-elevated px-3 py-2">
            <div
              aria-hidden="true"
              className="w-7 h-7 rounded-md shrink-0 bg-brand/20 border border-brand/40 flex items-center justify-center text-brand font-bold text-sm"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              G
            </div>
            <span className="flex-1 font-medium truncate">gacode</span>
            <button
              type="button"
              aria-label="通知"
              onClick={() => navigate("/notifications")}
              className="relative w-8 h-8 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center"
            >
              <BellIcon />
              {unreadCount > 0 ? (
                <span className="absolute top-0.5 right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold bg-brand text-brand-on">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        {/* 主菜单 */}
        <nav className="px-3 mt-3">
          <div className="rounded-md bg-bg-elevated p-2 space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = item.match(location.pathname);
              return (
                <button
                  key={item.to.toString()}
                  type="button"
                  onClick={() => navigate(item.to)}
                  className={[
                    "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors duration-150",
                    active
                      ? "bg-bg-sunken text-fg font-medium"
                      : "text-fg-muted hover:bg-bg-base hover:text-fg",
                  ].join(" ")}
                >
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronRightIcon />
                </button>
              );
            })}
          </div>
        </nav>

        {/* 对话列表: 置顶 + 最近 */}
        <section className="flex-1 overflow-y-auto px-3 mt-3 min-h-0">
          <ChatListPanel
            pinned={pinned}
            recent={recent}
            currentChatId={currentChatId}
            loading={chatsLoading}
          />
        </section>

        {/* 用户卡 */}
        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="mx-3 mt-3 rounded-md bg-bg-elevated p-3 flex items-center gap-3 text-left hover:bg-bg-sunken transition-colors duration-150"
          aria-label="我的"
        >
          <div
            aria-hidden="true"
            className="w-10 h-10 rounded-full shrink-0 bg-brand/30 border border-brand/40 flex items-center justify-center text-fg font-medium"
          >
            {initials(displayName)}
          </div>
          <span className="flex-1 min-w-0 truncate text-sm font-medium">
            {displayName}
          </span>
          <ChevronRightIcon />
        </button>

        {/* 登出 */}
        <div className="mx-3 mb-3 mt-2">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-danger hover:bg-danger-soft/30 transition-colors duration-150"
          >
            <LogoutIcon />
            <span>登出</span>
          </button>
        </div>
      </aside>

      {/* ============================================================
          Main (header + outlet)
          ============================================================ */}
      <div className="flex flex-col flex-1 min-w-0">
        <header
          className="shrink-0 h-14 px-4 bg-bg-elevated flex items-center gap-2"
        >
          {showBack ? (
            <button
              type="button"
              onClick={handleBack}
              aria-label="返回"
              className="w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated hover:text-fg transition-colors duration-150 inline-flex items-center justify-center"
            >
              <ArrowLeftIcon />
            </button>
          ) : (
            <span className="w-9 h-9" aria-hidden="true" />
          )}
          <h1 className="flex-1 text-base font-medium truncate min-w-0 text-center">
            {title}
          </h1>
          {/* 阶段 2 右侧 slot 给 ChatDetail 用 "..."菜单 / ChatList 用 "新建对话" 等
              父路由可自己用 fixed / absolutely 摆, 此处保留占位. */}
          <span className="w-9 h-9" aria-hidden="true" />
        </header>

        <main className="flex-1 overflow-y-auto bg-bg-base">{children}</main>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// ChatListPanel — sidebar 的对话列表部分 (置顶可折叠 + 最近可展开)
// ────────────────────────────────────────────────────────────

function ChatListPanel({
  pinned,
  recent,
  currentChatId,
  loading,
}: {
  pinned: ChatSession[];
  recent: ChatSession[];
  currentChatId: string | null;
  loading: boolean;
}) {
  const [pinnedOpen, setPinnedOpen] = useState(true);
  const [recentExpanded, setRecentExpanded] = useState(false);

  const visibleRecent = recentExpanded
    ? recent
    : recent.slice(0, RECENT_DEFAULT_LIMIT);

  const totalChats = pinned.length + recent.length;

  return (
    <div className="rounded-md bg-bg-elevated p-2">
      {loading && totalChats === 0 ? (
        <SkeletonLines />
      ) : totalChats === 0 ? (
        <div className="px-3 py-4 text-xs text-fg-subtle text-center">
          暂无对话
        </div>
      ) : (
        <>
          {pinned.length > 0 ? (
            <CollapsibleSection
              icon={<PinIcon />}
              title="置顶"
              count={pinned.length}
              open={pinnedOpen}
              onToggle={() => setPinnedOpen((v) => !v)}
            >
              <div className="space-y-1">
                {pinned.map((c) => (
                  <SidebarChatItem
                    key={c.id}
                    chat={c}
                    isActive={c.id === currentChatId}
                  />
                ))}
              </div>
            </CollapsibleSection>
          ) : null}

          {recent.length > 0 ? (
            <div className={pinned.length > 0 ? "mt-2" : ""}>
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-fg-muted">
                <ClockIcon />
                <span className="flex-1">最近</span>
                <span>{recent.length}</span>
              </div>
              <div className="space-y-1">
                {visibleRecent.map((c) => (
                  <SidebarChatItem
                    key={c.id}
                    chat={c}
                    isActive={c.id === currentChatId}
                  />
                ))}
              </div>
              {recent.length > RECENT_DEFAULT_LIMIT ? (
                <button
                  type="button"
                  onClick={() => setRecentExpanded((v) => !v)}
                  className="w-full text-xs text-fg-muted hover:text-fg transition-colors duration-150 px-3 py-1.5 text-left"
                >
                  {recentExpanded ? "收起" : `展开剩余 ${recent.length - RECENT_DEFAULT_LIMIT} 条`}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function CollapsibleSection({
  icon,
  title,
  count,
  open,
  onToggle,
  children,
}: {
  icon: ReactNode;
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-fg-muted hover:text-fg transition-colors duration-150"
      >
        {icon}
        <span className="flex-1 text-left">{title}</span>
        <span>{count}</span>
        <ChevronDownIcon className={open ? "" : "-rotate-90"} />
      </button>
      {open ? children : null}
    </div>
  );
}

function SidebarChatItem({
  chat,
  isActive,
}: {
  chat: ChatSession;
  isActive: boolean;
}) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(`/chat/${chat.id}`)}
      aria-current={isActive ? "page" : undefined}
      className={[
        "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left truncate transition-colors duration-150",
        isActive
          ? "bg-bg-sunken text-fg font-medium"
          : "text-fg-muted hover:bg-bg-base hover:text-fg",
      ].join(" ")}
    >
      <ChatBubbleIcon />
      <span className="flex-1 truncate">{chat.title || "新对话"}</span>
    </button>
  );
}

function SkeletonLines() {
  return (
    <div className="space-y-1.5 p-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="h-7 rounded bg-bg-sunken animate-pulse"
        />
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Icons
// ────────────────────────────────────────────────────────────

function ChevronRightIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-150 ${className ?? ""}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h0a3 3 0 0 0-3-3v0a3 3 0 0 0-3 3v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ChatBubbleIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-fg-muted"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
