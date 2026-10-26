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

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate, type To } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../lib/auth";
import { useToast } from "../ui/Toast";
import { Button } from "../ui/Button";
import {
  ArrowLeftIcon,
  BellIcon,
  BookOpenIcon,
  ChevronRightIcon,
  ClockIcon,
  GlobeIcon,
  LogoutIcon,
  PackageIcon,
  PackageOpenIcon,
  PinIcon,
  UserIcon,
} from "../ui/Glyphs";
import { ChatItem } from "../chat/ChatItem";
import {
  getChats,
  listNotifications,
  setSessionPin,
  type ChatSession,
} from "../../lib/api";

const SIDEBAR_WIDTH = "w-64";
const RECENT_DEFAULT_LIMIT = 5;
const HOME_PATH = "/";

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

function resolveTitle(pathname: string): string {
  if (pathname === "/") return "首页";
  // 0.7.7 — /chat/* 不再渲染外层 header (ChatDetail 自管 h-12 header).
  //   这里不处理 /chat/* 分支, 避免死代码保留"对话详情"字面量.
  // A1-D4-04 — 对话列表页标题. web 走 store `setHeaderTitle("对话列表")`
  //   (web `src/app/(main)/chat/page.tsx:69-73`); PC 顶栏标题是按路由派生的
  //   (resolveTitle) → 等价物 = /chat → "对话列表".
  if (pathname === "/chat") return "对话列表";
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
  /** 左侧图标 — 对齐 web Drawer.tsx:383 `Icon w-5 h-5 text-fg-muted` */
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "知识库",
    to: "/library",
    icon: <BookOpenIcon />,
    match: (p) => p === "/library" || p.startsWith("/library/"),
  },
  {
    label: "交付中心",
    to: "/deliveries",
    icon: <PackageOpenIcon />,
    match: (p) => p === "/deliveries" || p.startsWith("/deliveries/"),
  },
  {
    label: "通知",
    to: "/notifications",
    icon: <BellIcon />,
    match: (p) => p === "/notifications",
  },
  {
    label: "浏览器",
    to: "/browser",
    icon: <GlobeIcon />,
    match: (p) => p === "/browser",
  },
  {
    label: "我的",
    to: "/profile",
    icon: <UserIcon />,
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
  // 0.7.6 — gaga 截图反馈 §1: Home 页不要 header (跟 web 同款 — web Home 只有左
  //   ☰ 按钮 + sticky transparent 背景, 不显示标题栏). electron 是桌面端 sidebar
  //   已常驻, Home 不要 header 等价于"右半部分纯背景 + 内容", 跟 sidebar 同底色
  //   视觉一体.
  //
  // 0.7.7 — ChatDetail 双层头部修复: /chat/* 也不渲染外层 header, 由 ChatDetail
  //   自有的 h-12 header (真实会话名 + ModelChips + ⋮) 负责标题展示. AppShell 在
  //   这里再画一个写死的"对话详情"会和 ChatDetail 自管 header 同时出现两层.
  const showHeader =
    location.pathname !== HOME_PATH &&
    !location.pathname.startsWith("/chat/");

  // chats — sidebar 真实数据
  const { data: chatsData, isLoading: chatsLoading } = useQuery({
    queryKey: ["chats"],
    queryFn: getChats,
    refetchInterval: 60_000, // 每分钟后台刷一次, sidebar 实时性够用
  });
  const allChats: ChatSession[] = useMemo(() => chatsData?.chats ?? [], [chatsData]);

  // A3-D3-01 — 本地置顶集合 (对齐 web Drawer.tsx:58-147)
  //   - 首次加载用 server.pinned 做种子 (pinnedSeeded 防重复 seed)
  //   - 用户 toggle 走 PATCH /yinian/sessions/{id}/pin + 乐观更新 + 失败回滚
  //   - 渲染时以 pinnedIds 为准 (不是直接读 c.pinned) → 点 pin 立刻变位,
  //     失败会回滚并 toast, 不会静默失败
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [pinnedSeeded, setPinnedSeeded] = useState(false);
  /** 正在切换置顶的 chat id — 防连点 (同一条不重复发 PATCH) */
  const [pendingPinId, setPendingPinId] = useState<string | null>(null);

  useEffect(() => {
    if (!pinnedSeeded && allChats.length > 0) {
      setPinnedIds(new Set(allChats.filter((c) => c.pinned).map((c) => c.id)));
      setPinnedSeeded(true);
    }
  }, [allChats, pinnedSeeded]);

  const pinned = allChats.filter((c) => pinnedIds.has(c.id));
  const recent = allChats.filter((c) => !pinnedIds.has(c.id));

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

  // 置顶切换 — 供侧栏条目上的 pin 按钮调用 (web Drawer.tsx:114-147 是本地
  // pinnedIds + 乐观更新 + 失败回滚; PC 端现在同款 — 乐观更新, 失败回滚 + toast).
  const queryClient = useQueryClient();

  /** 置顶 / 取消置顶 — 乐观更新 + 失败回滚 + toast (对齐 web Drawer.tsx:114-147) */
  const togglePin = useCallback(
    async (chatId: string) => {
      if (pendingPinId === chatId) return; // 防连点
      const wasPinned = pinnedIds.has(chatId);
      const nextPinned = !wasPinned;
      // 乐观更新 — 点完立刻变位 (不等 server)
      setPinnedIds((prev) => {
        const next = new Set(prev);
        if (nextPinned) next.add(chatId);
        else next.delete(chatId);
        return next;
      });
      setPendingPinId(chatId);
      try {
        await setSessionPin(chatId, nextPinned);
        // 成功后同步 chats cache (让别的组件看到一致的 pinned)
        queryClient.invalidateQueries({ queryKey: ["chats"] });
      } catch (err) {
        // 失败回滚 — 恢复成点之前的位置
        setPinnedIds((prev) => {
          const next = new Set(prev);
          if (wasPinned) next.add(chatId);
          else next.delete(chatId);
          return next;
        });
        const reason = err instanceof Error ? err.message : String(err ?? "");
        const label = nextPinned ? "置顶失败" : "取消置顶失败";
        toast({
          message: reason ? `${label}: ${reason}` : label,
          variant: "danger",
        });
      } finally {
        setPendingPinId(null);
      }
    },
    [pendingPinId, pinnedIds, queryClient, toast],
  );

  return (
    <div className="flex h-screen overflow-hidden bg-bg-base text-fg">
      {/* ============================================================
          Sidebar (256px 持久)
          ============================================================ */}
      <aside
        className={[SIDEBAR_WIDTH, "shrink-0 bg-bg-base flex flex-col"].join(" ")}
        aria-label="主导航"
      >
        {/* TopBar — 对齐 web Drawer.tsx:180 `rounded-md bg-bg-elevated m-3 mb-0 p-3 flex items-center gap-2` */}
        <div className="rounded-md bg-bg-elevated m-3 mb-0 p-3 flex items-center gap-2">
          {/* A3-D2-01 — 对齐 web `layout/Drawer.tsx:181-187` (32×32 cody_48.png).
              ⚠️ PC 打包后 renderer 走 file:// 加载 (electron/main.ts:214-220),
              根绝对路径 "/assets/..." 会解析到文件系统根 → 裂图;
              故用 import.meta.env.BASE_URL 拼相对路径 (打包态 "./", dev "/"). */}
          <img
            src={`${import.meta.env.BASE_URL}assets/cody/cody_48.png`}
            alt="Cody"
            width={32}
            height={32}
            className="rounded-xl shrink-0"
          />
          <span className="flex-1 font-medium truncate">gacode</span>
          <button
            type="button"
            aria-label="通知"
            onClick={() => navigate("/notifications")}
            className="relative w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center"
          >
            <BellIcon />
            {unreadCount > 0 ? (
              <span className="absolute top-1.5 right-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold bg-brand text-brand-on">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            ) : null}
          </button>
        </div>

        {/* 主菜单 — 对齐 web Drawer.tsx:205 `rounded-md bg-bg-elevated m-3 mb-0 p-2 space-y-1` */}
        <nav className="rounded-md bg-bg-elevated m-3 mb-0 p-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = item.match(location.pathname);
            return (
              <button
                key={item.to.toString()}
                type="button"
                onClick={() => navigate(item.to)}
                className={[
                  "w-full flex items-center gap-3 px-3 py-2 text-base font-medium rounded-md transition-colors duration-150",
                  active
                    ? "bg-bg-sunken text-fg"
                    : "text-fg-muted hover:bg-bg-base",
                ].join(" ")}
              >
                <span className="w-5 h-5 shrink-0 text-fg-muted inline-flex items-center justify-center">
                  {item.icon}
                </span>
                <span className="flex-1 text-left">{item.label}</span>
                <ChevronRightIcon />
              </button>
            );
          })}
          {/* 对齐 web Drawer.tsx:221-227 — 「我的应用」入口 (仅 userId==6) */}
          {user && user.id === "6" ? (
            <button
              type="button"
              onClick={() => navigate("/profile/apps")}
              className="w-full flex items-center gap-3 px-3 py-2 text-base font-medium rounded-md transition-colors duration-150 text-fg-muted hover:bg-bg-base"
            >
              <span className="w-5 h-5 shrink-0 text-fg-muted inline-flex items-center justify-center">
                <PackageIcon />
              </span>
              <span className="flex-1 text-left">我的应用</span>
              <ChevronRightIcon />
            </button>
          ) : null}
        </nav>

        {/* 对话列表: 置顶 + 最近 — 对齐 web Drawer.tsx:231
            `flex-1 overflow-y-auto rounded-md bg-bg-elevated m-3 p-2` */}
        <section className="flex-1 overflow-y-auto rounded-md bg-bg-elevated m-3 p-2 min-h-0">
          <ChatListPanel
            pinned={pinned}
            recent={recent}
            currentChatId={currentChatId}
            loading={chatsLoading}
            onPin={togglePin}
          />
        </section>

        {/* 用户卡 — 对齐 web Drawer.tsx:324 `rounded-md bg-bg-elevated m-3 p-3 ... hover:bg-bg-base` */}
        <button
          type="button"
          onClick={() => navigate("/profile")}
          className="rounded-md bg-bg-elevated m-3 p-3 flex items-center gap-3 text-left hover:bg-bg-base transition-colors duration-150"
          aria-label="我的"
        >
          <div
            aria-hidden="true"
            className="w-10 h-10 rounded-full shrink-0 bg-brand/30 border border-brand/40 flex items-center justify-center text-fg font-medium"
          >
            {initials(displayName)}
          </div>
          <span className="flex-1 min-w-0 truncate text-base font-medium">
            {displayName}
          </span>
          <ChevronRightIcon />
        </button>

        {/* 登出 — 对齐 web Drawer.tsx:349-359 (Button ghost + LogOut 图标) */}
        <div className="mx-3 mb-3 mt-2">
          <Button
            variant="ghost"
            size="md"
            className="w-full !justify-start gap-2 !text-danger hover:!bg-danger-soft/30"
            onClick={handleLogout}
          >
            <LogoutIcon />
            <span>登出</span>
          </Button>
        </div>
      </aside>

      {/* ============================================================
          Main (header + outlet)
          ============================================================ */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* 0.7.6 — gaga 截图反馈 §1:
            - header 背景从 bg-bg-elevated (#181818) 改成 bg-bg-base (#000000),
              跟 sidebar 同底色, 左右视觉一体 (不再有"中间色带").
            - Home 页直接不渲染 header (跟 web Home 一致, 只在 sticky 透明条上画左 ☰,
              electron 是桌面端 sidebar 常驻, ☰ = sidebar, header 多余). */}
        {showHeader ? (
          <header className="shrink-0 h-14 px-4 bg-bg-base border-b border-border flex items-center gap-2">
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
            <h1 className="flex-1 truncate font-medium min-w-0">
              {title}
            </h1>
            {/* 阶段 2 右侧 slot 给 ChatDetail 用 "..."菜单 / ChatList 用 "新建对话" 等
                父路由可自己用 fixed / absolutely 摆, 此处保留占位. */}
            <span className="w-9 h-9" aria-hidden="true" />
          </header>
        ) : null}

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
  onPin,
}: {
  pinned: ChatSession[];
  recent: ChatSession[];
  currentChatId: string | null;
  loading: boolean;
  /** 置顶回调 (传入时条目右侧渲染置顶按钮) */
  onPin?: (chatId: string) => void;
}) {
  const navigate = useNavigate();
  const [pinnedOpen, setPinnedOpen] = useState(true);
  const [recentExpanded, setRecentExpanded] = useState(false);

  const visibleRecent = recentExpanded
    ? recent
    : recent.slice(0, RECENT_DEFAULT_LIMIT);

  const totalChats = pinned.length + recent.length;

  return (
    <div>
      {loading && totalChats === 0 ? (
        <SkeletonLines />
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
              <div className="space-y-1 mb-2">
                {pinned.map((c) => (
                  <ChatItem
                    key={c.id}
                    id={c.id}
                    title={c.title}
                    updatedAt={c.updatedAt}
                    isActive={c.id === currentChatId}
                    hasNewMessage={c.hasNewMessage}
                    onPin={onPin}
                    pinned={true}
                    onClick={() => navigate(`/chat/${c.id}`)}
                  />
                ))}
              </div>
            </CollapsibleSection>
          ) : null}

          <div className={pinned.length > 0 ? "mt-2" : ""}>
            <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-fg-muted">
              <ClockIcon />
              <span className="flex-1">最近</span>
              <span className="text-xs">{recent.length}</span>
            </div>
            {recent.length > 0 ? (
              <>
                <div className="space-y-1">
                  {visibleRecent.map((c) => (
                    <ChatItem
                      key={c.id}
                      id={c.id}
                      title={c.title}
                      updatedAt={c.updatedAt}
                      isActive={c.id === currentChatId}
                      hasNewMessage={c.hasNewMessage}
                      onPin={onPin}
                      pinned={false}
                      onClick={() => navigate(`/chat/${c.id}`)}
                    />
                  ))}
                </div>
                {recent.length > RECENT_DEFAULT_LIMIT ? (
                  <button
                    type="button"
                    onClick={() => setRecentExpanded((v) => !v)}
                    aria-expanded={recentExpanded}
                    className="w-full mt-1 px-3 py-1.5 rounded-md text-xs text-fg-muted hover:text-fg hover:bg-bg-base transition-colors duration-150"
                  >
                    {recentExpanded ? "收起" : `查看更多 (${recent.length - RECENT_DEFAULT_LIMIT})`}
                  </button>
                ) : null}
              </>
            ) : (
              <div className="text-sm text-fg-muted px-3 py-4 text-center opacity-70">
                暂无对话
              </div>
            )}
          </div>
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
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-fg-muted hover:text-fg transition-colors duration-150"
      >
        {icon}
        <span className="flex-1 text-left">{title}</span>
        <span>{count}</span>
        <ChevronRightIcon className={open ? "rotate-90" : ""} />
      </button>
      {open ? children : null}
    </div>
  );
}

function SkeletonLines() {
  return (
    <div className="space-y-2 px-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-md bg-muted h-12 w-full" />
      ))}
    </div>
  );
}
