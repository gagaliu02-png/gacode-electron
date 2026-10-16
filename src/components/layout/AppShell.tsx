/**
 * components/layout/AppShell.tsx — 阶段 1 App shell
 *
 * 对齐 gacode-web `(main)/layout.tsx` + Drawer, 但 PC 形态:
 *   - 左侧 256px 持久 sidebar (不抽奖屉, lg+ 视图永久展开, 跟桌面客户端定位匹配)
 *   - 顶部 56px Header (← 返回 + 居中标题 + 右侧 slot)
 *   - 内容区 flex-1 滚动
 *
 * Sidebar 内容 (对齐 gacode-web Drawer.tsx 但去掉 transform 动画):
 *   - 顶部 TopBar: Cody icon + "gacode" + 🔔 通知按钮 (badge hardcode 0)
 *   - 菜单项: 对话 / 知识库 / 交付中心 (active 高亮)
 *   - 置顶 + 最近对话列表 (hardcode 3 条假数据, 阶段 2 接真 API)
 *   - 底部用户栏: 头像 + displayName + → /profile, 登出按钮
 *
 * 设计 token: 全部走 tailwind class (bg-bg-base / text-fg / border-border),
 * 不在组件级写新 token (跟 design-spec § 9 一致: inline style 仅给 SVG / canvas 用).
 */

import { type ReactNode } from "react";
import { useLocation, useNavigate, type To } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { useToast } from "../ui/Toast";

const SIDEBAR_WIDTH = "w-64"; // 256px — 跟 gacode-web drawer w-80 (320) 略窄, 适配桌面

// =========================================================================
// 阶段 1 假数据 — 阶段 2 接 /chats + /notifications 真 API
// =========================================================================

const HARD_PINNED_CHATS = [
  { id: "p1", title: "Gacode 设计规范 v2" },
  { id: "p2", title: "数据中台对接" },
];

const HARD_RECENT_CHATS = [
  { id: "r1", title: "API 协议对齐讨论" },
  { id: "r2", title: "OTA v1.2 发布计划" },
  { id: "r3", title: "SSE 流式输出调研" },
  { id: "r4", title: "知识库 chunk 切片" },
  { id: "r5", title: "登录态续期方案" },
];

const UNREAD_NOTIF_COUNT = 0; // 阶段 2 接 /yinian/notifications?unread=true

// =========================================================================
// 路由 → 显示标题 + 返回目标
// =========================================================================

function resolveTitle(pathname: string): string {
  if (pathname === "/") return "首页";
  if (pathname === "/chat") return "对话";
  if (pathname.startsWith("/chat/")) return "对话详情";
  if (pathname.startsWith("/library")) return "知识库";
  if (pathname.startsWith("/deliveries")) return "交付中心";
  if (pathname.startsWith("/notifications")) return "通知";
  if (pathname.startsWith("/profile")) return "我的";
  return "Gacode";
}

function isSubRoute(pathname: string): boolean {
  // Home 不显示 ←, 其他子路由都显示
  return pathname !== "/";
}

function initials(displayName: string): string {
  const s = displayName.trim();
  if (!s) return "?";
  // 中文取首字, 英文取首字母大写
  return s.charAt(0).toUpperCase();
}

// =========================================================================
// Sidebar
// =========================================================================

interface NavItem {
  label: string;
  to: To;
  match: (pathname: string) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "对话",
    to: "/chat",
    // /chat 和 /chat/:id 都算"对话区"
    match: (p) => p === "/chat" || p.startsWith("/chat/"),
  },
  {
    label: "知识库",
    to: "/library",
    match: (p) => p.startsWith("/library"),
  },
  {
    label: "交付中心",
    to: "/deliveries",
    match: (p) => p.startsWith("/deliveries"),
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { toast } = useToast();

  const title = resolveTitle(location.pathname);
  const showBack = isSubRoute(location.pathname);

  const handleBack = () => {
    // router.back() 在 history 栈短时会回不到主页面; 走更稳的 navigate(-1) with fallback
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
          Sidebar — 256px 持久展开
          ============================================================ */}
      <aside
        className={[
          SIDEBAR_WIDTH,
          "shrink-0 bg-bg-base border-r border-border flex flex-col",
        ].join(" ")}
        aria-label="主导航"
      >
        {/* TopBar: Cody icon + gacode + 🔔 */}
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
              {UNREAD_NOTIF_COUNT > 0 && (
                <span className="absolute top-0.5 right-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold bg-brand text-brand-on">
                  {UNREAD_NOTIF_COUNT > 99 ? "99+" : UNREAD_NOTIF_COUNT}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* 主菜单 — 知识库 / 交付中心 (对话走中间区块, 不重复) */}
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

        {/* 对话列表 — 置顶 + 最近 (阶段 2 接真 API) */}
        <section className="flex-1 overflow-y-auto px-3 mt-3 min-h-0">
          <div className="rounded-md bg-bg-elevated p-2">
            {/* 置顶 */}
            {HARD_PINNED_CHATS.length > 0 && (
              <div>
                <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-fg-muted">
                  <PinIcon />
                  <span className="flex-1">置顶</span>
                  <span>{HARD_PINNED_CHATS.length}</span>
                </div>
                <div className="space-y-1">
                  {HARD_PINNED_CHATS.map((c) => (
                    <SidebarChatItem key={c.id} id={c.id} title={c.title} />
                  ))}
                </div>
              </div>
            )}

            {/* 最近 */}
            <div className="mt-2">
              <div className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-fg-muted">
                <ClockIcon />
                <span className="flex-1">最近</span>
                <span>{HARD_RECENT_CHATS.length}</span>
              </div>
              <div className="space-y-1">
                {HARD_RECENT_CHATS.map((c) => (
                  <SidebarChatItem key={c.id} id={c.id} title={c.title} />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 底部用户栏 */}
        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="mx-3 mb-3 mt-3 rounded-md bg-bg-elevated p-3 flex items-center gap-3 text-left hover:bg-bg-sunken transition-colors duration-150"
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

        {/* 登出按钮 */}
        <div className="mx-3 mb-3">
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
          主内容区 — Header + 路由 outlet
          ============================================================ */}
      <div className="flex flex-col flex-1 min-w-0">
        <header
          className="shrink-0 h-14 px-4 border-b border-border bg-bg-base flex items-center gap-2"
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
          {/* 右侧 slot — 阶段 1 留空, 阶段 2 chat 详情页会有 + 新建 / ⋮ 重命名 */}
          <span className="w-9 h-9" aria-hidden="true" />
        </header>

        <main className="flex-1 overflow-y-auto bg-bg-base">{children}</main>
      </div>
    </div>
  );
}

// =========================================================================
// Sidebar Chat Item
// =========================================================================

function SidebarChatItem({ id, title }: { id: string; title: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(`/chat/${id}`)}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-fg hover:bg-bg-base hover:text-fg transition-colors duration-150 text-left"
    >
      <ChatBubbleIcon />
      <span className="flex-1 truncate">{title}</span>
    </button>
  );
}

// =========================================================================
// Icons — 最小自绘, 不引 lucide-react (避免新依赖)
// 用 viewBox 24, stroke-width 1.6 跟 gacode-web 风格近似
// =========================================================================

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