/**
 * routes/Browser.tsx — 阶段 7 内嵌 webview 多 tab 浏览器
 *
 * 阶段 4: tab bar + URL form + 常用链接 + 历史
 * 阶段 7 (对齐 Android 端 BrowserViewModel):
 *   - 进度条 (跟 webview 加载进度)
 *   - 后退 / 前进 / 主页 按钮 (canGoBack/canGoForward 状态联动)
 *   - 收藏夹: 收藏按钮 + ModalBottomSheet 列表 (持久化走主进程 IPC)
 *   - AI 总结按钮 + summary sheet + 「保存到知识库」按钮
 *   - 0.1.4 全局禁 transition: 不做 fade-in / slide; 用 fixed 定位直出
 *
 * IPC 依赖 (主进程):
 *   - window.gacode.bookmarks.{read, add, remove} → /workspace absolute
 *   - 渲染层调 POST /api/v1/yinian/links/summarize 走 api.ts summarizeLink()
 *
 * 实现细节:
 *   - <webview> ref 走 HTMLDivElement 占位, cast 到 ElectronWebview (扩展
 *     reload/goBack/goForward/canGoBack 等方法)
 *   - 进度条: 用 progress 0..100, 渲染在 webview 容器顶部, width 跟 progress.
 *     100% 时 300ms setTimeout hide (不用 transition)
 *   - 后/前按钮 disabled 用 canGoBack / canGoForward 状态维护 (webview
 *     change 事件触发更新)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { BottomSheet } from "../components/ui/BottomSheet";
import { useToast } from "../components/ui/Toast";
import { LongPressMenu, type LongPressMenuItem } from "../components/ui/LongPressMenu";
import {
  addBookmark,
  readBookmarks,
  removeBookmark,
} from "../lib/bookmarks";
import { createLibraryItem, summarizeLink } from "../lib/api";
import type { BookmarkEntry } from "../../shared/types";
import {
  ArrowLeftBarIcon,
  ArrowRightBarIcon,
  BookmarkIcon,
  EraserIcon,
  FolderIcon,
  HouseIcon,
  RefreshCwIcon,
  SparkleStarIcon,
} from "../components/ui/Glyphs";

/**
 * ★ [批 G19 · 2026-11-12 · gaga 拍板] 主页从 gaga.sale 改成 bing。
 *
 *   旧值 `https://www.gaga.sale` 是**我们自己的站点** —— 浏览器默认打开自家站点
 *   对用户没意义, 而且那个站点跟浏览器功能是两码事 ⇒ 换成通用搜索引擎。
 */
const HOME_URL = "https://www.bing.com";

/**
 * ★ [批 G19] 输入框下面那排「快捷网址」**不再写死**。
 *
 *   旧实现是 3 个硬编码链接 (gaga 官网 / gacode-web.vercel.app / 网关 health),
 *   后面两个**早就失效了** ⇒ 整排删掉写死列表, 改成取**收藏夹前 5 条**
 *   (收藏夹已经在本组件里读好了, 见 `bookmarks` state)。
 *   收藏夹为空 ⇒ 整排不渲染。
 */
const QUICK_LINKS_LIMIT = 5;

interface Tab {
  id: string;
  title: string;
  url: string;
  loading: boolean;
  failed: boolean;
  /** 跟 webview 加载进度 0..100, 用 tab 自身的 progress 给 sheet 用 */
  progress: number;
  /** 该 tab 的 webview 是否还可以 goBack/goForward. 没初始化时 false. */
  canGoBack: boolean;
  canGoForward: boolean;
}

function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^(https?:|file:|mailto:|gacode:)/i.test(trimmed)) return trimmed;
  if (/^[\w-]+(\.[\w-]+)+/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  // ★ [批 G19] 关键词兜底也走 bing —— 主页既然是 bing, 搜索再走 google 就割裂了。
  return `https://www.bing.com/search?q=${encodeURIComponent(trimmed)}`;
}

const HISTORY_LIMIT = 8;

function uid(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function Browser() {
  const [tabs, setTabs] = useState<Tab[]>([
    {
      id: uid(),
      title: "首页",
      url: HOME_URL,
      loading: false,
      failed: false,
      progress: 0,
      canGoBack: false,
      canGoForward: false,
    },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(() =>
    tabs[0]?.id ?? "",
  );
  const [urlInput, setUrlInput] = useState("");
  const [history, setHistory] = useState<Array<{ url: string; openedAt: number }>>([]);

  // 收藏夹 state — 同步主进程文件
  const [bookmarks, setBookmarks] = useState<BookmarkEntry[]>([]);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);

  // AI 总结 state
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaryText, setSummaryText] = useState("");
  const [summaryUrl, setSummaryUrl] = useState("");
  const [summaryTitle, setSummaryTitle] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [savingToLibrary, setSavingToLibrary] = useState(false);

  // 0.7.5 browser-15: 长按菜单 state — webview 内 postMessage 过来的链接/图片点击
  const [longPressAnchor, setLongPressAnchor] = useState<
    { x: number; y: number; url: string; kind: "link" | "image" } | null
  >(null);

  const { toast } = useToast();

  const active = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const isBookmarked = !!bookmarks.find((b) => b.url === active?.url);

  // ★ [批 G19] 快捷网址 = 收藏夹前 5 条 (原来写死 3 个, 两个已失效)。
  const quickLinks = useMemo(() => bookmarks.slice(0, QUICK_LINKS_LIMIT), [bookmarks]);

  useEffect(() => {
    setUrlInput(active?.url ?? "");
  }, [active?.url, active?.id]);

  // 启动时拉一次 bookmarks
  useEffect(() => {
    let alive = true;
    void readBookmarks().then((list) => {
      if (alive) setBookmarks(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  const recordHistory = (url: string) => {
    setHistory((cur) => {
      const next = [{ url, openedAt: Date.now() }, ...cur];
      const seen = new Set<string>();
      const deduped = next.filter((h) => {
        if (seen.has(h.url)) return false;
        seen.add(h.url);
        return true;
      });
      return deduped.slice(0, HISTORY_LIMIT);
    });
  };

  /**
   * ★ [批 G19 · 2026-11-12 · gaga 拍板] 在**当前标签**里导航。
   *
   * ## 为什么要拆出来 (旧 `openInTab` 的毛病)
   *
   *   旧实现: `submit()` → `openInTab(url)` → **找不到同 URL 的 tab 就另开一个新 tab**。
   *   ⇒ 用户在地址栏输入网址按「前往」, 当前标签**原地不动**, 反而多出一个标签 ——
   *     每输一次网址标签就涨一个。
   *   ⇒ 而「新标签页 = 空白, 输入网址后才显示网页」这条需求**根本做不成**:
   *     空白标签上输入网址 → 旧逻辑会另开一个带网址的标签, 空白标签还在原地。
   *
   *   现在拆成两个语义各归其位的动作:
   *     · `navigateCurrent(url)` —— **当前标签**原地导航 (地址栏「前往」/ 收藏夹 / 快捷网址)
   *     · `openInNewTab(url)`  —— **另开**一个新标签 (长按菜单「在新标签中打开」)
   */
  const navigateCurrent = (url: string) => {
    if (!active) return;
    // 同一个地址 ⇒ 刷新当前页 (否则「再输一遍同样的网址」毫无反应)。
    if (active.url === url) {
      try {
        getWebviewForActive()?.reload();
      } catch {
        /* ignore */
      }
      recordHistory(url);
      return;
    }
    const id = active.id;
    setTabs((cur) =>
      cur.map((t) =>
        t.id === id
          ? {
              ...t,
              url,
              title: hostFromUrl(url),
              loading: true,
              failed: false,
              progress: 0,
              canGoBack: false,
              canGoForward: false,
            }
          : t,
      ),
    );
    // 地址栏显示规范化后的完整 URL (浏览器常规行为)。
    setUrlInput(url);
    recordHistory(url);
  };

  /** 另开一个新标签并加载 url (长按菜单「在新标签中打开」用)。 */
  const openInNewTab = (url: string) => {
    const id = uid();
    setTabs((cur) => [
      ...cur,
      {
        id,
        title: hostFromUrl(url),
        url,
        loading: true,
        failed: false,
        progress: 0,
        canGoBack: false,
        canGoForward: false,
      },
    ]);
    setActiveTabId(id);
    recordHistory(url);
  };

  // 0.7.5 browser-15: guest → 宿主的消息 (长按链接 / 图片 / 开新标签)
  //
  // ★ [批 G19] **通道换了** —— 原来是 `window.parent.postMessage`, 但 Electron 的
  //   <webview> guest 里 `window.parent` 就是它自己 ⇒ 那条消息永远送不到宿主
  //   (实测 `window.parent === window`) ⇒ 长按菜单其实一直是坏的。
  //   现在改成 guest 打一条带 `HOST_MSG_MARKER` 前缀的 console.log, 宿主从
  //   <webview> 的 `console-message` 事件里取 (见 WebviewPane)。
  const handleHostMessage = useCallback(
    (data: { type?: string; url?: string; x?: number; y?: number; kind?: string }) => {
      if (!data || typeof data.type !== "string") return;

      // guest 要开新窗口 (target=_blank 链接 / window.open) ⇒ 我们自己开一个标签。
      if (data.type === "open-in-new-tab") {
        const url = data.url;
        // 只放行 http(s) —— guest 是外部站点, 不能让它指挥宿主去开
        // file:// / javascript: 之类的地址。
        if (typeof url === "string" && /^https?:\/\//i.test(url)) {
          openInNewTab(url);
        }
        return;
      }

      // 长按 / 右键菜单
      if (data.type !== "longpress") return;
      if (
        typeof data.x !== "number" ||
        typeof data.y !== "number" ||
        typeof data.url !== "string" ||
        (data.kind !== "link" && data.kind !== "image")
      ) {
        return;
      }
      setLongPressAnchor({
        x: data.x,
        y: data.y,
        url: data.url,
        kind: data.kind,
      });
    },
    // ⚠️ deps: openInNewTab 每次渲染都是新的 ⇒ 这个 callback 也是;
    //   但它只用到稳定的 state setter ⇒ 闭包里不会有过期值。
    [openInNewTab],
  );

  const submit = (rawUrl?: string) => {
    const target = normalizeUrl(rawUrl ?? urlInput);
    if (!target) return;
    navigateCurrent(target);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
  };

  const closeTab = (id: string) => {
    if (tabs.length <= 1) {
      // ★ [批 G19] 关掉最后一个标签 ⇒ 补一个**空白**标签 (跟「新建标签」同款),
      //   不是直接弹主页 —— 空白是「还没打开任何网页」的状态, 用户想看主页可以点「主页」按钮。
      const newTab: Tab = {
        id: uid(),
        title: "新标签",
        url: "",
        loading: false,
        failed: false,
        progress: 0,
        canGoBack: false,
        canGoForward: false,
      };
      setTabs([newTab]);
      setActiveTabId(newTab.id);
      return;
    }
    const idx = tabs.findIndex((t) => t.id === id);
    setTabs((cur) => cur.filter((t) => t.id !== id));
    if (activeTabId === id) {
      const next = tabs[Math.max(0, idx - 1)] ?? tabs[1];
      setActiveTabId(next?.id ?? "");
    }
  };

  const newTab = () => {
    const id = uid();
    const tab: Tab = {
      id,
      title: "新标签",
      // ★ [批 G19] 新标签页 = **空白** (url 为空 ⇒ 不挂 webview)。
      //   用户在下面输入网址 / 搜索词之后才真的加载网页。
      url: "",
      loading: false,
      failed: false,
      progress: 0,
      canGoBack: false,
      canGoForward: false,
    };
    setTabs((cur) => [...cur, tab]);
    setActiveTabId(id);
    setUrlInput("");
  };

  // ────────────── 操作 webview 的 helper ──────────────
  const getWebviewForActive = (): ElectronWebview | null => {
    const id = active?.id;
    if (!id) return null;
    return document.querySelector(
      `webview[data-tab-id="${id}"]`,
    ) as ElectronWebview | null;
  };

  const goBack = () => {
    const wv = getWebviewForActive();
    try {
      wv?.goBack();
    } catch {
      /* ignore */
    }
  };

  const goForward = () => {
    const wv = getWebviewForActive();
    try {
      wv?.goForward();
    } catch {
      /* ignore */
    }
  };

  const goHome = () => {
    submit(HOME_URL);
  };

  const refresh = () => {
    if (!active) return;
    // ★ [批 G19] 空白标签 (url 为空) 没有东西可刷新 ⇒ 直接返回,
    //   否则会把它置成 loading + 转圈, 但永远转不完 (没有 webview)。
    if (!active.url) return;
    const id = active.id;
    setTabs((cur) =>
      cur.map((t) =>
        t.id === id ? { ...t, loading: true, failed: false, progress: 0 } : t,
      ),
    );
    const wv = getWebviewForActive();
    try {
      wv?.reload();
    } catch {
      /* ignore */
    }
  };

  // ────────────── 清除缓存 (批 G19) ──────────────
  //
  //   缓存属于 Chromium 的 **session** ⇒ 渲染层清不了:
  //   `<webview>` 标签**没有** clearCache 方法 (实测 typeof wv.clearCache ===
  //   "undefined", 直接调是 TypeError) ⇒ 走主进程 IPC
  //   (electron/main.ts registerBrowserCacheIpc → session.defaultSession.clearCache())。
  //
  //   ⚠️ 同一窗口里所有 webview 共用一个 session ⇒ 清一次就都清了 (这正是我们要的:
  //     「网页打开不正常 / 图片不更新」时清一遍缓存重来)。
  //   ⚠️ 只清**缓存**, 不动 cookie / localStorage —— 那些是登录态, 清了用户得重登。
  const clearCache = async () => {
    const bridge = window.gacode?.clearBrowserCache;
    if (!bridge) {
      toast({ message: "当前环境不支持清除缓存", variant: "warning" });
      return;
    }
    try {
      const res = await bridge();
      if (res?.ok) {
        toast({ message: "缓存已清除", variant: "success" });
      } else {
        toast({
          message: `清除缓存失败: ${res?.error ?? "未知错误"}`,
          variant: "danger",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ message: `清除缓存失败: ${msg}`, variant: "danger" });
    }
  };

  // ────────────── 收藏夹操作 ──────────────
  const toggleBookmark = async () => {
    if (!active?.url) return;
    const url = active.url;
    const title = active.title || url;
    if (isBookmarked) {
      // 取消收藏 — 按 url 删
      const next = await removeBookmark(url);
      setBookmarks(next);
      toast({ message: "已取消收藏", variant: "default" });
    } else {
      const next = await addBookmark(url, title);
      setBookmarks(next);
      toast({ message: "已加入收藏", variant: "success" });
    }
  };

  const openBookmark = (entry: BookmarkEntry) => {
    setBookmarksOpen(false);
    submit(entry.url);
  };

  const deleteBookmark = async (entry: BookmarkEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    const next = await removeBookmark(entry.id);
    setBookmarks(next);
    toast({ message: `已删除: ${entry.title}`, variant: "default" });
  };

  // ────────────── AI 总结 ──────────────
  const runSummarize = async () => {
    if (!active?.url) return;
    if (!/^https?:\/\//i.test(active.url)) {
      toast({ message: "当前页面无 URL,无法总结", variant: "warning" });
      return;
    }
    const url = active.url;
    const title = active.title || hostFromUrl(url);
    setSummaryUrl(url);
    setSummaryTitle(title);
    setSummaryText("");
    setSummaryLoading(true);
    setSummaryOpen(true);
    try {
      const resp = await summarizeLink(url, title);
      setSummaryText(resp.summary || "(该页面无文字内容)");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ message: `总结失败: ${msg}`, variant: "danger" });
      setSummaryOpen(false);
    } finally {
      setSummaryLoading(false);
    }
  };

  const saveSummaryToLibrary = async () => {
    if (!summaryUrl) return;
    setSavingToLibrary(true);
    try {
      await createLibraryItem({
        type: "link",
        title: summaryTitle || summaryUrl,
        url: summaryUrl,
        tags: ["ai-summary"],
      });
      toast({ message: "已保存到知识库", variant: "success" });
      setSummaryOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ message: `保存失败: ${msg}`, variant: "danger" });
    } finally {
      setSavingToLibrary(false);
    }
  };

  // ────────────── webview 事件回调 (state 更新) ──────────────
  const handleWebviewLoaded = (id: string, e?: Event) => {
    setTabs((cur) =>
      cur.map((t) =>
        t.id === id
          ? {
              ...t,
              loading: false,
              failed: false,
              progress: 100,
              title:
                (e as unknown as { title?: string })?.title ||
                hostFromUrl(t.url),
              url: (e as unknown as { url?: string })?.url || t.url,
              canGoBack: syncCanGoBack(id),
              canGoForward: syncCanGoForward(id),
            }
          : t,
      ),
    );
    // 100% 后 300ms 隐藏进度条 (setTimeout hidden, 不依赖 transition)
    setTimeout(() => {
      setTabs((cur) =>
        cur.map((t) => (t.id === id && t.progress === 100 ? { ...t, progress: 0 } : t)),
      );
    }, 300);
    // 0.7.5 browser-15: 注入长按监听脚本到 webview 内容 (did-finish-load 后)
    void injectGuestScript(id);
  };

  const handleWebviewProgress = (id: string, p: number) => {
    setTabs((cur) =>
      cur.map((t) => (t.id === id ? { ...t, progress: Math.max(0, Math.min(100, p)) } : t)),
    );
  };

  const handleWebviewFailed = (id: string) => {
    setTabs((cur) =>
      cur.map((t) => (t.id === id ? { ...t, loading: false, failed: true } : t)),
    );
  };

  const handleWebviewNavigate = (id: string, url: string) => {
    setTabs((cur) =>
      cur.map((t) =>
        t.id === id
          ? { ...t, url, title: hostFromUrl(url), canGoBack: syncCanGoBack(id), canGoForward: syncCanGoForward(id) }
          : t,
      ),
    );
    recordHistory(url);
    if (id === activeTabId) setUrlInput(url);
    // 0.7.5 browser-15: navigation 完成后重注入监听 (SPA 路由切换后脚本丢)
    void injectGuestScript(id);
  };

  // 0.7.5 browser-15: 长按菜单当前项的 items (从 longPressAnchor 派生)
  const longPressItems: LongPressMenuItem[] = longPressAnchor
    ? buildLongPressItems(longPressAnchor, {
        openInTab: (url) => openInNewTab(url),
        copyToClipboard: async (url) => {
          try {
            await navigator.clipboard.writeText(url);
            toast({ message: "已复制链接", variant: "success" });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast({ message: `复制失败: ${msg}`, variant: "danger" });
          }
        },
        saveImageToKb: async (url) => {
          try {
            await createLibraryItem({
              type: "image",
              title: "从浏览器保存",
              url,
              tags: ["from-browser"],
            });
            toast({ message: "已保存到知识库", variant: "success" });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast({ message: `保存失败: ${msg}`, variant: "danger" });
          }
        },
        saveLinkToKb: async (url) => {
          try {
            await createLibraryItem({
              type: "link",
              title: "从浏览器保存",
              url,
              tags: ["from-browser"],
            });
            toast({ message: "已保存到知识库", variant: "success" });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            toast({ message: `保存失败: ${msg}`, variant: "danger" });
          }
        },
      })
    : [];

  return (
    <div className="min-h-full flex flex-col">
      {/* tab bar */}
      <div className="shrink-0 flex items-center gap-1 px-3 py-2 bg-bg-elevated overflow-x-auto">
        {tabs.map((t) => {
          const isActive = t.id === activeTabId;
          return (
            <div
              key={t.id}
              className={[
                "group inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm shrink-0",
                "cursor-pointer",
                "max-w-[200px]",
                isActive
                  ? "bg-bg-elevated text-fg"
                  : "bg-bg-sunken text-fg-muted hover:text-fg",
              ].join(" ")}
              onClick={() => setActiveTabId(t.id)}
              role="tab"
              aria-selected={isActive}
            >
              {t.loading ? (
                <span className="gagaos-spinner shrink-0" aria-hidden="true" />
              ) : t.failed ? (
                <span className="shrink-0 text-danger">⚠</span>
              ) : (
                <span className="shrink-0 w-2 h-2 rounded-full bg-success" />
              )}
              <span className="truncate">{t.title || hostFromUrl(t.url)}</span>
              <button
                type="button"
                aria-label="关闭标签"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
                className="shrink-0 text-fg-muted hover:text-fg"
              >
                ×
              </button>
            </div>
          );
        })}
        <button
          type="button"
          aria-label="新建标签"
          onClick={newTab}
          className="shrink-0 w-7 h-7 rounded-md text-fg-muted hover:bg-bg-elevated hover:text-fg inline-flex items-center justify-center"
          title="新建标签"
        >
          +
        </button>
      </div>

      {/* webview 区域 — 进度条 + 当前 tab 的 webview */}
      <div className="flex-1 relative bg-bg-base">
        {active ? (
          <>
            {/* 进度条: 顶部 1px 高, 跟随 active.progress 变化. 0 不渲染. */}
            {active.progress > 0 ? (
              <div
                className="absolute top-0 left-0 right-0 h-1 z-10 bg-bg-elevated"
                aria-hidden="true"
              >
                <div
                  className="h-full bg-brand"
                  style={{ width: `${active.progress}%` }}
                />
              </div>
            ) : null}
            <WebviewPane
              tab={active}
              onLoaded={(e) => handleWebviewLoaded(active.id, e)}
              onFailed={() => handleWebviewFailed(active.id)}
              onNavigate={(url) => handleWebviewNavigate(active.id, url)}
              onProgress={(p) => handleWebviewProgress(active.id, p)}
              onHostMessage={handleHostMessage}
            />
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-fg-subtle text-sm">
            没有 tab
          </div>
        )}
      </div>

      {/* URL bar + 操作 */}
      <div className="shrink-0 bg-bg-elevated px-3 py-2 space-y-2">
        <form
          onSubmit={onSubmit}
          className="rounded-md bg-bg-elevated p-2 flex items-center gap-2"
        >
          {/* 后退 / 前进 / 主页 */}
          <div className="shrink-0 inline-flex items-center gap-1">
            <IconButton
              ariaLabel="后退"
              title="后退"
              disabled={!active?.canGoBack}
              onClick={goBack}
            >
              <ArrowLeftBarIcon size={16} strokeWidth={1.6} />
            </IconButton>
            <IconButton
              ariaLabel="前进"
              title="前进"
              disabled={!active?.canGoForward}
              onClick={goForward}
            >
              <ArrowRightBarIcon size={16} strokeWidth={1.6} />
            </IconButton>
            <IconButton
              ariaLabel="主页"
              title="主页"
              onClick={goHome}
            >
              <HouseIcon size={16} strokeWidth={1.6} />
            </IconButton>
          </div>

          {/* 刷新 */}
          <IconButton ariaLabel="刷新" title="刷新" onClick={refresh}>
            <RefreshCwIcon size={16} strokeWidth={1.6} />
          </IconButton>

          <Input
            type="search"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="输入网址或搜索关键词"
            className="flex-1 py-2 text-sm"
          />

          {/* 收藏夹按钮 */}
          <IconButton
            ariaLabel={isBookmarked ? "取消收藏" : "加入收藏"}
            title={isBookmarked ? "取消收藏" : "加入收藏"}
            active={isBookmarked}
            onClick={() => void toggleBookmark()}
          >
            <BookmarkIcon
              className={isBookmarked ? "fill-current" : undefined}
              size={16}
              strokeWidth={1.6}
            />
          </IconButton>

          {/* AI 总结按钮 */}
          <IconButton
            ariaLabel="AI 总结"
            title="AI 总结"
            onClick={() => void runSummarize()}
          >
            <SparkleStarIcon size={16} strokeWidth={1.6} />
          </IconButton>

          {/* 查看收藏列表 */}
          <IconButton
            ariaLabel="收藏夹"
            title="收藏夹"
            onClick={() => setBookmarksOpen(true)}
          >
            <FolderIcon size={16} strokeWidth={1.6} />
          </IconButton>

          {/* ★ [批 G19] 清除缓存 —— 页面显示不正常 / 图片不更新时清一遍 */}
          <IconButton
            ariaLabel="清除缓存"
            title="清除缓存"
            onClick={() => void clearCache()}
          >
            <EraserIcon size={16} strokeWidth={1.6} />
          </IconButton>

          <Button
            type="submit"
            variant="default"
            size="md"
            disabled={!urlInput.trim()}
          >
            前往
          </Button>
        </form>

        {/* 快捷网址 — ★ [批 G19] 取**收藏夹前 5 条** (原来是一排写死的链接,
            而且里面两个早就失效了)。收藏夹为空 ⇒ 整排不渲染。 */}
        {quickLinks.length > 0 || history.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {quickLinks.map((b) => (
              <button
                key={b.id}
                type="button"
                title={b.url}
                onClick={() => navigateCurrent(b.url)}
                className="text-xs px-2 py-1 rounded-md bg-bg-sunken text-fg-muted hover:text-fg hover:bg-bg-elevated max-w-[220px] truncate"
              >
                {b.title || hostFromUrl(b.url)}
              </button>
            ))}
            {history.length > 0 ? (
              <button
                type="button"
                onClick={() => setHistory([])}
                className="ml-auto text-xs text-fg-subtle hover:text-fg"
              >
                清空历史
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* 收藏夹 sheet */}
      <BottomSheet
        open={bookmarksOpen}
        title={`收藏夹 (${bookmarks.length})`}
        onClose={() => setBookmarksOpen(false)}
      >
        {bookmarks.length === 0 ? (
          <p className="text-sm text-fg-muted text-center py-6">
            还没有收藏的网页
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {bookmarks.map((b) => (
              <li
                key={b.id}
                className="flex items-center gap-3 py-2 cursor-pointer hover:bg-bg-sunken rounded-md px-2"
                onClick={() => openBookmark(b)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{b.title}</div>
                  <div className="text-xs text-fg-subtle truncate">{b.url}</div>
                </div>
                <button
                  type="button"
                  aria-label="删除收藏"
                  onClick={(e) => void deleteBookmark(b, e)}
                  className="text-fg-muted hover:text-danger px-2"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </BottomSheet>

      {/* AI 总结 sheet */}
      <BottomSheet
        open={summaryOpen}
        title="AI 总结"
        onClose={() => setSummaryOpen(false)}
        footer={
          <>
            <Button
              variant="ghost"
              size="md"
              onClick={() => setSummaryOpen(false)}
            >
              关闭
            </Button>
            <Button
              variant="default"
              size="md"
              loading={savingToLibrary}
              disabled={summaryLoading || !summaryUrl}
              onClick={() => void saveSummaryToLibrary()}
            >
              保存到知识库
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="text-xs text-fg-subtle break-all">
            {summaryUrl || "(加载中…)"}
          </div>
          {summaryLoading ? (
            <div className="text-sm text-fg-muted">正在总结…</div>
          ) : (
            <div className="text-sm whitespace-pre-wrap text-fg">
              {summaryText}
            </div>
          )}
        </div>
      </BottomSheet>

      {/* 0.7.5 browser-15: 长按链接 / 图片 → LongPressMenu */}
      <LongPressMenu
        anchor={longPressAnchor ? { x: longPressAnchor.x, y: longPressAnchor.y } : null}
        onClose={() => setLongPressAnchor(null)}
        items={longPressItems}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 0.7.5 browser-15 — 注入长按 / 右键监听脚本到 webview
//
// 脚本做两件事:
//   - 监听 document contextmenu, 找到最近的 <a> 或 <img>, 把 href/src +
//     client 坐标 postMessage 给渲染层 (window.parent.postMessage).
//   - 监听 touchstart + touchend, 500ms 内不抬起 → 算长按, 同样 postMessage.
//
// 注入策略: 每次 did-finish-load / will-navigate 后重新注入, 避免 SPA 路由
// 切换后脚本被丢掉. webview.sandbox + contextIsolation 都开了, 这个脚本
// 跑在 page 主世界 (webview 注入脚本默认是 page 主世界), 不能访问 Node, 只
// 能用浏览器 API. window.parent.postMessage 跨 webview 边界 OK, 因为我们的
// webview 没有 sandbox=all (实际 webpreferences 里 sandbox=yes, 但 postMessage
// 仍然可以传字符串到顶层文档的 message listener).
// ────────────────────────────────────────────────────────────

function injectGuestScript(tabId: string): Promise<void> {
  const wv = document.querySelector(
    `webview[data-tab-id="${tabId}"]`,
  ) as ElectronWebview | null;
  if (!wv) return Promise.resolve();
  // webview 的 executeJavaScript 在主进程执行, 内容沙箱化, 但允许
  // postMessage 出去. 这里 catch + 静默 — SPA 路由过程 / 主进程繁忙都可能失败,
  // 不要让 toast 噪音.
  const js = GUEST_SCRIPT;
  try {
    const r = wv.executeJavaScript(js, true) as Promise<unknown> | undefined;
    return Promise.resolve(r as unknown as void);
  } catch {
    return Promise.resolve();
  }
}

/**
 * ★ [批 G19 · 2026-11-12] guest → 宿主的**唯一通道**。
 *
 * ## 为什么不是 `window.parent.postMessage`
 *
 *   Electron 的 <webview> guest 是**独立的 frame tree** ⇒ guest 里的
 *   `window.parent` **就是它自己** (实测 `window.parent === window` 为 true)
 *   ⇒ `window.parent.postMessage(...)` 只是把消息发给 guest 自己,
 *     **永远送不到宿主**。
 *   (0.7.5 的长按菜单就是这么写的 ⇒ 那个功能其实一直是坏的, 只是没人报。)
 *
 * ## 用哪个通道
 *
 *   guest 的 `console.log` ⇒ 宿主的 <webview> 会派发 `console-message` 事件
 *   (实测能完整收到)。⇒ guest 把消息**打成一个带标记前缀的 console.log**,
 *   宿主按前缀过滤 + JSON.parse 还原。
 *
 *   ⚠️ 消息只能带 http(s) 的 URL —— guest 是**外部站点**, 不能让它指挥宿主
 *      去开 file:// / javascript: 之类的地址。
 */
const HOST_MSG_MARKER = "__GACODE_HOST__";

const GUEST_SCRIPT = `(function () {
  if (window.__gacode_guest_installed__) return;
  window.__gacode_guest_installed__ = true;

  // ── guest → 宿主 的唯一出口 (见 HOST_MSG_MARKER 的说明) ──
  function postHost(payload) {
    try { console.log('${HOST_MSG_MARKER}' + JSON.stringify(payload)); } catch (e) {}
  }
  function postLongPress(payload) {
    payload.type = 'longpress';
    postHost(payload);
  }
  function postNewTab(url) {
    postHost({ type: 'open-in-new-tab', url: String(url) });
  }

  // ★ [批 G19 · 2026-11-12] target="_blank" / "_new" 链接 ⇒ 我们自己开新标签。
  //
  // ## 病根 (实测, 不是猜)
  //
  //   Electron 的 <webview> 对 guest 发起的 window-open 请求 (target=_blank 的
  //   链接、window.open()):
  //     · **不**派发 <webview> 上的 'new-window' DOM 事件 (实测 newWindow: []);
  //     · **不**真开一个窗口 (实测 CDP target 列表里没有新 page);
  //     · guest 自己也不导航 (实测 did/will-navigate 都是空)。
  //   ⇒ 链接**点了完全没反应**。百度首页那排导航 (新闻/hao123/地图/贴吧/视频…)
  //     全是 target="_blank" ⇒ 整个页面点不动。
  //
  //   (顺带验过: 跟 <webview> 的 sandbox 属性**无关** —— 带与不带,
  //    自造的同标签链接都能正常跳。)
  //
  // ## 修法
  //
  //   在 guest 里**捕获阶段**拦下这类点击 ⇒ preventDefault 掉弹窗请求 ⇒
  //   通知渲染层 ⇒ 渲染层用 openInNewTab() 在**我们的浏览器**里开一个新标签
  //   (浏览器该有的行为: _blank = 新标签)。
  document.addEventListener('click', function (e) {
    var el = e.target;
    var a = el && el.closest ? el.closest('a[href]') : null;
    if (!a) return;
    var t = (a.getAttribute('target') || '').toLowerCase();
    if (t !== '_blank' && t !== '_new') return;
    var href = a.href;
    if (!href || href.indexOf('javascript:') === 0) return;
    e.preventDefault();
    e.stopPropagation();
    postNewTab(href);
  }, true);

  // ★ window.open(...) ⇒ 同样交给渲染层开标签 (别让 guest 自己开窗)。
  try {
    var origOpen = window.open;
    if (origOpen && !origOpen.__gacode_patched) {
      var patched = function (url) {
        try { postNewTab(url || ''); } catch (e) {}
        return null;
      };
      patched.__gacode_patched = true;
      window.open = patched;
    }
  } catch (e) {}

  // ── 长按 / 右键菜单 (0.7.5 browser-15 · 原逻辑逐字保留, 只换了通道) ──
  // 右键 (contextmenu) — 找最近的 <a> 或 <img>
  document.addEventListener('contextmenu', function (e) {
    var target = e.target;
    while (target && target !== document.body) {
      if (target.tagName === 'A' && target.href) {
        e.preventDefault();
        postLongPress({ x: e.clientX, y: e.clientY, url: target.href, kind: 'link' });
        return;
      }
      if (target.tagName === 'IMG' && target.src) {
        e.preventDefault();
        postLongPress({ x: e.clientX, y: e.clientY, url: target.src, kind: 'image' });
        return;
      }
      target = target.parentNode;
    }
  }, true);
  // 长按 — touchstart 起 timer, 500ms 触发; touchend/move/cancel 清掉
  var timer = null;
  var startX = 0, startY = 0;
  function clear() {
    if (timer != null) { clearTimeout(timer); timer = null; }
  }
  document.addEventListener('touchstart', function (e) {
    var t = e.targetTouches && e.targetTouches[0];
    if (!t) return;
    startX = t.clientX; startY = t.clientY;
    clear();
    timer = setTimeout(function () {
      timer = null;
      var target = e.target;
      while (target && target !== document.body) {
        if (target.tagName === 'A' && target.href) {
          postLongPress({ x: startX, y: startY, url: target.href, kind: 'link' });
          return;
        }
        if (target.tagName === 'IMG' && target.src) {
          postLongPress({ x: startX, y: startY, url: target.src, kind: 'image' });
          return;
        }
        target = target.parentNode;
      }
    }, 500);
  }, true);
  document.addEventListener('touchend', clear, true);
  document.addEventListener('touchcancel', clear, true);
  document.addEventListener('touchmove', clear, true);
})();`;

interface LongPressActions {
  openInTab: (url: string) => void;
  copyToClipboard: (url: string) => Promise<void> | void;
  saveLinkToKb: (url: string) => Promise<void> | void;
  saveImageToKb: (url: string) => Promise<void> | void;
}

function buildLongPressItems(
  anchor: { url: string; kind: "link" | "image" },
  actions: LongPressActions,
): LongPressMenuItem[] {
  if (anchor.kind === "image") {
    return [
      {
        label: "在新标签中打开",
        onClick: () => actions.openInTab(anchor.url),
      },
      {
        label: "复制图片地址",
        onClick: () => void actions.copyToClipboard(anchor.url),
      },
      {
        label: "保存到知识库",
        onClick: () => void actions.saveImageToKb(anchor.url),
      },
    ];
  }
  // link
  return [
    {
      label: "在新标签中打开",
      onClick: () => actions.openInTab(anchor.url),
    },
    {
      label: "复制链接",
      onClick: () => void actions.copyToClipboard(anchor.url),
    },
    {
      label: "保存到知识库",
      onClick: () => void actions.saveLinkToKb(anchor.url),
    },
  ];
}

// ────────────────────────────────────────────────────────────
// IconButton — 小尺寸 icon-only 按钮, Browser toolbar 复用
// ────────────────────────────────────────────────────────────

interface IconButtonProps {
  ariaLabel: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  /** 收藏按钮高亮态 — 跟 webview tag 风格一致 (active 走 brand container) */
  active?: boolean;
  children: React.ReactNode;
}

function IconButton({
  ariaLabel,
  title,
  onClick,
  disabled,
  active,
  children,
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={[
        "shrink-0 w-8 h-8 rounded-md inline-flex items-center justify-center",
        disabled
          ? "text-fg-subtle opacity-40 cursor-not-allowed"
          : active
            ? "bg-brand-container text-brand-on-container hover:bg-brand-container/80"
            : "text-fg-muted hover:bg-bg-sunken hover:text-fg",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// ────────────────────────────────────────────────────────────
// WebviewPane — 单 tab 的 `<webview>` 标签 + 事件桥
// ────────────────────────────────────────────────────────────

interface ElectronWebview extends HTMLElement {
  reload: () => void;
  goBack: () => void;
  goForward: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  src: string;
  /** Electron 扩展: 获取当前 URL (webview 内可能跨 origin navigate) */
  getURL: () => string;
  /** 0..100 加载进度; -1 表示 inactive / done */
  getActiveProgress: () => number;
  /** 0.7.5 browser-15: 注入脚本到 webview 内容 (用于长按监听). */
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
}

interface WebviewPaneProps {
  tab: Tab;
  onLoaded: (e: Event) => void;
  onFailed: () => void;
  onNavigate: (url: string) => void;
  onProgress: (p: number) => void;
  /**
   * ★ [批 G19] guest 发给宿主的消息 (长按菜单 / 开新标签)。
   *   通道 = guest 的 console.log (带 HOST_MSG_MARKER 前缀) ⇒ 本组件从
   *   <webview> 的 `console-message` 事件里解析出来转交。
   */
  onHostMessage: (data: {
    type?: string;
    url?: string;
    x?: number;
    y?: number;
    kind?: string;
  }) => void;
}

function WebviewPane({
  tab,
  onLoaded,
  onFailed,
  onNavigate,
  onProgress,
  onHostMessage,
}: WebviewPaneProps) {
  const ref = useRef<ElectronWebview | null>(null);

  // 同步当前 webview 的 canGoBack/canGoForward — 把 transition 关了,
  // 切 tab / nav 完成时态更新外层 tab state.
  useEffect(() => {
    const wv = ref.current;
    if (!wv) return;
    const handleDidStartLoading = () => {
      onProgress(5);
    };
    const handleDidStopLoading = () => {
      // finish 时 100%, 外层 setTimeout 隐藏
      onProgress(100);
    };
    const handleProgress = (p: number) => {
      onProgress(typeof p === "number" ? p : 0);
    };
    const handleDidFinishLoad = (e: Event) => {
      onLoaded(e);
    };
    const handleDidFailLoad = () => {
      onFailed();
    };
    const handleWillNavigate = (e: Event) => {
      const url = (e as unknown as { url?: string }).url;
      if (url) onNavigate(url);
    };
    // ★ [批 G19] guest → 宿主 的消息通道。
    //   guest 把消息打成一条带 HOST_MSG_MARKER 前缀的 console.log,
    //   <webview> 会派发 `console-message` 事件 ⇒ 这里取出来解析。
    //   ⚠️ 页面自己的 console 输出**不会**带这个前缀 ⇒ 直接过滤掉。
    const handleConsoleMessage = (e: Event) => {
      const raw = (e as unknown as { message?: string }).message;
      if (typeof raw !== "string") return;
      const idx = raw.indexOf(HOST_MSG_MARKER);
      if (idx === -1) return;
      const body = raw.slice(idx + HOST_MSG_MARKER.length);
      try {
        const parsed = JSON.parse(body) as {
          type?: string;
          url?: string;
          x?: number;
          y?: number;
          kind?: string;
        };
        if (parsed && typeof parsed === "object") onHostMessage(parsed);
      } catch {
        /* 不是我们的消息 (或页面伪造的垃圾) ⇒ 忽略 */
      }
    };
    wv.addEventListener("did-start-loading", handleDidStartLoading);
    wv.addEventListener("did-stop-loading", handleDidStopLoading);
    wv.addEventListener("did-finish-load", handleDidFinishLoad as EventListener);
    wv.addEventListener("did-fail-load", handleDidFailLoad);
    wv.addEventListener("will-navigate", handleWillNavigate as EventListener);
    wv.addEventListener(
      "console-message",
      handleConsoleMessage as EventListener,
    );
    // Electron 扩展事件 (CustomEvent 携带 number payload, 不是标准 Event)
    wv.addEventListener(
      "did-change-progress",
      handleProgress as unknown as EventListener,
    );
    return () => {
      wv.removeEventListener("did-start-loading", handleDidStartLoading);
      wv.removeEventListener("did-stop-loading", handleDidStopLoading);
      wv.removeEventListener("did-finish-load", handleDidFinishLoad as EventListener);
      wv.removeEventListener("did-fail-load", handleDidFailLoad);
      wv.removeEventListener("will-navigate", handleWillNavigate as EventListener);
      wv.removeEventListener(
        "console-message",
        handleConsoleMessage as EventListener,
      );
      wv.removeEventListener(
        "did-change-progress",
        handleProgress as unknown as EventListener,
      );
    };
  }, [tab.id, onLoaded, onFailed, onNavigate, onProgress]);

  // ★ [批 G19] 空白标签页 —— `tab.url` 为空 ⇒ **不挂 webview**,
  //   渲染一个空白页占位 (用户输入网址之后才真的加载网页)。
  //   ⚠️ 不能用 `src="about:blank"` 糊弄: 那样 webview 照样挂上、照样有 guest,
  //     后面切 URL 时 guest 的状态 (历史 / 滚动位置) 是脏的。
  if (!tab.url) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-bg-base text-fg-subtle text-sm">
        <div className="text-center space-y-2">
          <p className="text-base">新标签页</p>
          <p className="text-xs">在下面输入网址或搜索关键词</p>
        </div>
      </div>
    );
  }

  if (tab.failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-bg-base text-fg-subtle text-sm">
        <div className="text-center space-y-2">
          <p className="text-base">加载失败</p>
          <p className="text-xs">{tab.url}</p>
          <Button
            size="sm"
            onClick={() => {
              try {
                ref.current?.reload();
              } catch {
                /* ignore */
              }
            }}
          >
            重试
          </Button>
        </div>
      </div>
    );
  }

  return (
    <webview
      ref={ref as unknown as React.RefObject<HTMLDivElement>}
      data-tab-id={tab.id}
      src={tab.url}
      // @ts-expect-error sandbox 是 Electron webview 扩展属性
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=yes"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        border: "none",
      }}
    />
  );
}

// 同步 webview 当前 canGoBack / canGoForward 到 state (副作用 pure read).
function syncCanGoBack(id: string): boolean {
  const wv = document.querySelector(
    `webview[data-tab-id="${id}"]`,
  ) as ElectronWebview | null;
  try {
    return !!wv?.canGoBack?.();
  } catch {
    return false;
  }
}
function syncCanGoForward(id: string): boolean {
  const wv = document.querySelector(
    `webview[data-tab-id="${id}"]`,
  ) as ElectronWebview | null;
  try {
    return !!wv?.canGoForward?.();
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

function hostFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname || url;
  } catch {
    return url;
  }
}

// ────────────────────────────────────────────────────────────
// icons — 本文件**不再保留**本地图标 (2026-10-27 组件意识收编)
//   先前收编: 本文件底部 7 个本地图标与 components/ui/Glyphs.tsx 的共享导出
//   重复实现 ⇒ 已删, 改 import 共享组件:
//     · RefreshIcon    → 共享 <RefreshCwIcon> (lucide v0.407.0 `refresh-cw`
//                        真值) —— 调用点传 size=16 / strokeWidth={1.6}
//     · ArrowLeftIcon  → 共享 <ArrowLeftBarIcon> (lucide v0.407.0 `arrow-left`
//                        真值 · 带横杆)
//     · ArrowRightIcon → 共享 <ArrowRightBarIcon> (lucide v0.407.0
//                        `arrow-right` 真值 · 带横杆)
//     · HomeIcon       → 共享 <HouseIcon> (lucide v0.407.0 `house` 真值;
//                        `home.js` 现在只是 re-export `house.js`)
//     · BookmarkIcon   → 共享 <BookmarkIcon> (lucide v0.407.0 `bookmark` 真值)
//                        —— 「已收藏」实心态改由调用点加 tailwind `fill-current`
//                           (CSS 优先级高于 presentation attribute ⇒ 等价于
//                           改前的 fill="currentColor")
//     · SparkleIcon    → 共享 <SparkleStarIcon> (**自定义图形, 非 lucide**,
//                        原 path 逐字保留)
//     · FolderIcon     → 共享 <FolderIcon> (lucide v0.407.0 `folder` 真值)
// ────────────────────────────────────────────────────────────
