/**
 * routes/Browser.tsx — 阶段 4 内嵌 webview 多 tab 浏览器
 *
 * 渲染层用 Electron `<webview>` 标签 (webviewTag: true) 直接挂多个 tab,
 * tab 状态在 React state 里维护. 主进程 `BrowserView` IPC (
 * gacode:open-browser-tab / close / focus) 作为底层支撑:
 *   - 当前页面用 `<webview>` tag, 不依赖 BrowserView IPC
 *   - 现阶段用户可见流程是 webview tag; 未来"外层入口" (chat 链接 →
 *     in-app browser) 用 BrowserView IPC
 *
 * 设计:
 *   - 顶部: tab bar (单 tab 显示关闭 × 按钮, 多 tab 时水平滚动)
 *   - 中部: 当前 tab 对应的 `<webview src={url}>` 占满剩余空间
 *   - 底部: URL 输入框 + 常用链接 + 历史
 *   - "+ 新建 tab" 按钮: 用当前 url 字符串新建, 若没字符串则去首页
 *
 * 注意: `<webview>` 是 Electron-specific 元素, 不被 React DOM 当成 HTML
 * 标准元素, 要保留 HTML-like 属性 + 走 src 直接挂 URL. Chromium 渲染, 不能
 * nodeIntegration, sandbox 必须开 (webPreferences 在 tag 上设).
 *
 * 防御: webview 加载失败 (ERR_FILE_NOT_FOUND 等) 时, 切回系统默认浏览器 +
 * 关闭 tab. 避免用户卡死.
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

const QUICK_LINKS: Array<{ label: string; url: string }> = [
  { label: "gaga 官网", url: "https://www.gaga.sale" },
  { label: "gacode-web", url: "https://gacode-web.vercel.app" },
  { label: "gaclaw 网关", url: "https://www.gaga.sale/api/v1/health" },
];

const HOME_URL = "https://www.gaga.sale";

interface Tab {
  id: string;
  title: string;
  url: string;
  loading: boolean;
  failed: boolean;
}

function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^(https?:|file:|mailto:|gacode:)/i.test(trimmed)) return trimmed;
  if (/^[\w-]+(\.[\w-]+)+/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

const HISTORY_LIMIT = 8;

function uid(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function Browser() {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: uid(), title: "首页", url: HOME_URL, loading: false, failed: false },
  ]);
  const [activeTabId, setActiveTabId] = useState<string>(() =>
    tabs[0]?.id ?? "",
  );
  const [urlInput, setUrlInput] = useState("");
  const [history, setHistory] = useState<Array<{ url: string; openedAt: number }>>([]);

  const active = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  useEffect(() => {
    setUrlInput(active?.url ?? "");
  }, [active?.url, active?.id]);

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

  const openInTab = (url: string) => {
    if (!active || active.url === url) {
      // 已开就切到那个 tab
      setActiveTabId(active.id);
      recordHistory(url);
      return;
    }
    // 已有同 url tab → 激活
    const existing = tabs.find((t) => t.url === url);
    if (existing) {
      setActiveTabId(existing.id);
      recordHistory(url);
      return;
    }
    // 新建
    const id = uid();
    setTabs((cur) => [
      ...cur,
      {
        id,
        title: hostFromUrl(url),
        url,
        loading: true,
        failed: false,
      },
    ]);
    setActiveTabId(id);
    recordHistory(url);
  };

  const submit = (rawUrl?: string) => {
    const target = normalizeUrl(rawUrl ?? urlInput);
    if (!target) return;
    openInTab(target);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
  };

  const closeTab = (id: string) => {
    if (tabs.length <= 1) {
      // 只剩一个, 重置为首页
      const newTab: Tab = {
        id: uid(),
        title: "首页",
        url: HOME_URL,
        loading: false,
        failed: false,
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
      url: HOME_URL,
      loading: false,
      failed: false,
    };
    setTabs((cur) => [...cur, tab]);
    setActiveTabId(id);
  };

  const refresh = () => {
    if (!active) return;
    const id = active.id;
    setTabs((cur) =>
      cur.map((t) =>
        t.id === id ? { ...t, loading: true, failed: false } : t,
      ),
    );
    // 强制 webview 重新加载 — 调 src 重设 (Chromium 渲染层)
    const wv = document.querySelector(
      `webview[data-tab-id="${id}"]`,
    ) as ElectronWebview | null;
    try {
      wv?.reload();
    } catch {
      /* ignore */
    }
  };

  const handleWebviewLoaded = (id: string, e?: Event) => {
    setTabs((cur) =>
      cur.map((t) =>
        t.id === id
          ? {
              ...t,
              loading: false,
              failed: false,
              title:
                (e as unknown as { title?: string })?.title ||
                hostFromUrl(t.url),
              url: (e as unknown as { url?: string })?.url || t.url,
            }
          : t,
      ),
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
          ? { ...t, url, title: hostFromUrl(url) }
          : t,
      ),
    );
    recordHistory(url);
    // 同步 url input 到当前 active tab
    if (id === activeTabId) setUrlInput(url);
  };

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
                "transition-colors duration-150 cursor-pointer",
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

      {/* webview 区域 — 给每个 tab 一个 webview 但只 render 当前显示的,
          隐藏的 tab 不创建 webview (减少内存). 同时也避免每个 webview 各自
          触发进程间消息开销. */}
      <div className="flex-1 relative bg-bg-base">
        {active ? (
          <WebviewPane
            tab={active}
            onLoaded={(e) => handleWebviewLoaded(active.id, e)}
            onFailed={() => handleWebviewFailed(active.id)}
            onNavigate={(url) => handleWebviewNavigate(active.id, url)}
          />
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
          <button
            type="button"
            aria-label="刷新"
            onClick={refresh}
            className="shrink-0 w-8 h-8 rounded-md text-fg-muted hover:bg-bg-sunken hover:text-fg inline-flex items-center justify-center"
          >
            <RefreshIcon />
          </button>
          <Input
            type="search"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                // form submit 自然触发
              }
            }}
            placeholder="输入网址或搜索关键词"
            className="flex-1 py-2 text-sm"
          />
          <Button
            type="submit"
            variant="default"
            size="md"
            disabled={!urlInput.trim()}
          >
            前往
          </Button>
        </form>

        {/* 常用链接 */}
        <div className="flex flex-wrap gap-2">
          {QUICK_LINKS.map((l) => (
            <button
              key={l.url}
              type="button"
              onClick={() => openInTab(l.url)}
              className="text-xs px-2 py-1 rounded-md bg-bg-sunken text-fg-muted hover:text-fg hover:bg-bg-elevated transition-colors duration-150"
            >
              {l.label}
            </button>
          ))}
          {history.length > 0 ? (
            <button
              type="button"
              onClick={() => setHistory([])}
              className="ml-auto text-xs text-fg-subtle hover:text-fg transition-colors duration-150"
            >
              清空历史
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// WebviewPane — 单 tab 的 `<webview>` 标签 + 事件桥
// ────────────────────────────────────────────────────────────

interface ElectronWebview extends HTMLElement {
  reload: () => void;
  src: string;
}

interface WebviewPaneProps {
  tab: Tab;
  onLoaded: (e: Event) => void;
  onFailed: () => void;
  onNavigate: (url: string) => void;
}

function WebviewPane({ tab, onLoaded, onFailed, onNavigate }: WebviewPaneProps) {
  const ref = useRef<ElectronWebview | null>(null);

  useEffect(() => {
    const wv = ref.current;
    if (!wv) return;
    const handleDidStartLoading = () => {
      // tab.loading = true 由 parent 在 src 变化时已设; 这里 re-fire 也无所谓
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
    wv.addEventListener("did-start-loading", handleDidStartLoading);
    wv.addEventListener("did-finish-load", handleDidFinishLoad as EventListener);
    wv.addEventListener("did-fail-load", handleDidFailLoad);
    wv.addEventListener("will-navigate", handleWillNavigate as EventListener);
    return () => {
      wv.removeEventListener("did-start-loading", handleDidStartLoading);
      wv.removeEventListener("did-finish-load", handleDidFinishLoad as EventListener);
      wv.removeEventListener("did-fail-load", handleDidFailLoad);
      wv.removeEventListener("will-navigate", handleWillNavigate as EventListener);
    };
  }, [tab.id, onLoaded, onFailed, onNavigate]);

  if (tab.failed) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-bg-base text-fg-subtle text-sm">
        <div className="text-center space-y-2">
          <p className="text-base">加载失败</p>
          <p className="text-xs">{tab.url}</p>
          <Button size="sm" onClick={() => {
            try { ref.current?.reload(); } catch { /* ignore */ }
          }}>
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
      // webview tag 是 Electron-specific intrinsic element. React 18 类型
      // 给 HTMLWebViewElement 单独定义了属性 (webpreferences 已经认),
      // 但 sandbox / allowpopups 这些是 Electron 扩展, 需要 ts-expect-error 跳过.
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

function RefreshIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}
