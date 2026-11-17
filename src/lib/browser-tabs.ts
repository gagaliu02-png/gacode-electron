/**
 * lib/browser-tabs.ts —— 渲染层的「浏览器 tab」对外账本（T-027-d0ck）
 *
 * [2026-11-17] PC 浏览器统一：agent 开的 BrowserView tab 与用户自己的
 * `<webview>` tab **合并进同一条 tab 条**（`/browser` 页顶部那条）。
 *
 * ## 为什么要有这个模块
 *
 * 渲染层的用户 tab 是**纯 React state**（`Browser.tsx` 里的 `tabs`）⇒ 切走路由
 * 组件卸载 ⇒ tab 没了（这是 webview 的天然行为：`<webview>` 元素被卸载即销毁）。
 * 而 agent 开的 tab 活在**主进程**的池里 ⇒ 用户切走路由再回来，agent 的 tab
 * 还在池里活着，但渲染层不知道它 ⇒ 两条 tab 条对不上。
 *
 * ⇒ 本模块只管一件事：**主进程那边有哪些 BrowserView tab**。
 *   - 数据源 = 主进程（`listBrowserTabs`）+ 事件（`onBrowserTabOpened` / `onBrowserTabClosed`）
 *   - 生命周期 = **模块级**（跨路由存活）⇒ 切走再回来不丢
 *   - 用户自己的 `<webview>` tab **不归它管**（那是 React state 的事）
 *
 * ## 纯逻辑部分（可单测）
 *
 * `computeDockRect` —— 把 DOM 矩形换算成主进程能用的停靠矩形。
 * ⚠️ 坐标系：**窗口内容区**左上角（不是屏幕左上角）⇒ BrowserView.setBounds
 *    与 `getBoundingClientRect()` 同源 ⇒ 直接用，不需要换算缩放。
 */

import type { BrowserDockRect, BrowserTabSummary } from "@shared/types";

// ===========================================================================
// 纯逻辑：矩形换算
// ===========================================================================

/** 只实现 `getBoundingClientRect` 的最小形状（单测用假对象）。 */
export interface RectSource {
  getBoundingClientRect(): {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

/**
 * 把元素的 DOM 矩形换算成**停靠矩形**。
 *
 * ⚠️ 必须加 `window.scrollX/scrollY` —— `getBoundingClientRect()` 是**视口**坐标，
 *    页面滚动了就偏了（BrowserView 的 bounds 是**内容区**坐标）。
 *
 * @returns 尺寸非正 ⇒ `null`（调用方**如实说**，不许拿 0×0 去糊弄主进程）。
 */
export function computeDockRect(
  el: RectSource,
  scroll?: { x: number; y: number },
): BrowserDockRect | null {
  const r = el.getBoundingClientRect();
  const sx = scroll?.x ?? 0;
  const sy = scroll?.y ?? 0;
  const width = Math.round(r.width);
  const height = Math.round(r.height);
  if (!(width > 0) || !(height > 0)) return null;
  return {
    x: Math.round(r.left) + Math.round(sx),
    y: Math.round(r.top) + Math.round(sy),
    width,
    height,
  };
}

// ===========================================================================
// 模块级 store
// ===========================================================================

export interface ExternalTabState {
  /** = 主进程的 tabId。 */
  id: string;
  title: string;
  url: string;
  origin: "agent" | "renderer";
  active: boolean;
}

export interface BrowserTabsSnapshot {
  tabs: ExternalTabState[];
  activeId: string | null;
}

type Listener = (snap: BrowserTabsSnapshot) => void;

let state: BrowserTabsSnapshot = { tabs: [], activeId: null };
/**
 * ★ [T-027] 「等着被选中」的 agent tab。
 *
 * 场景：agent 开了 tab ⇒ 用户当时**不在** `/browser` 页 ⇒ 等用户回到该页时
 * 才知道该选哪个 ⇒ 这里记一笔，`Browser.tsx` 挂载时消费掉。
 * ⚠️ 只记**最新**那个（多个 agent tab 排队时，最后开的优先）。
 */
let pendingSelectId: string | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  for (const cb of [...listeners]) {
    try {
      cb(state);
    } catch (err) {
      console.warn("[browser-tabs] listener failed:", err);
    }
  }
}

/** 当前快照（引用稳定 ⇒ 可直接进 useSyncExternalStore）。 */
export function getBrowserTabsSnapshot(): BrowserTabsSnapshot {
  return state;
}

/** 订阅变化（返回退订函数）。 */
export function subscribeBrowserTabs(cb: Listener): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** 整表替换（主进程 `listBrowserTabs` 的结果）。 */
export function setExternalTabs(list: BrowserTabSummary[]): void {
  state = {
    tabs: (list ?? []).map((t) => ({
      id: t.tabId,
      title: t.title || hostFromUrl(t.url),
      url: t.url,
      origin: t.origin,
      active: !!t.active,
    })),
    activeId: (list ?? []).find((t) => t.active)?.tabId ?? null,
  };
  emit();
}

/** 新开一个 tab（`onBrowserTabOpened`）。 */
export function upsertExternalTab(tab: {
  tabId: string;
  url: string;
  title: string;
  origin: "agent" | "renderer";
}): void {
  const exists = state.tabs.some((t) => t.id === tab.tabId);
  const next: ExternalTabState = {
    id: tab.tabId,
    title: tab.title || hostFromUrl(tab.url),
    url: tab.url,
    origin: tab.origin,
    active: state.activeId === tab.tabId,
  };
  state = {
    tabs: exists
      ? state.tabs.map((t) => (t.id === tab.tabId ? next : t))
      : [...state.tabs, next],
    activeId: state.activeId,
  };
  // ★ agent 开的 ⇒ 记一笔「等着被选中」（用户回到 `/browser` 页时消费）
  if (tab.origin === "agent") pendingSelectId = tab.tabId;
  emit();
}

/** 取出（并清掉）「等着被选中」的 tab id。 */
export function consumePendingSelectId(): string | null {
  const id = pendingSelectId;
  pendingSelectId = null;
  return id;
}

/** 当前「等着被选中」的 tab id（只读）。 */
export function peekPendingSelectId(): string | null {
  return pendingSelectId;
}

/** 关掉一个 tab（`onBrowserTabClosed`）。 */
export function removeExternalTab(tabId: string): void {
  if (!state.tabs.some((t) => t.id === tabId)) return;
  state = {
    tabs: state.tabs.filter((t) => t.id !== tabId),
    activeId: state.activeId === tabId ? null : state.activeId,
  };
  emit();
}

/** 记当前 active 的外部 tab。 */
export function setExternalActiveTab(tabId: string | null): void {
  if (state.activeId === tabId) return;
  state = {
    tabs: state.tabs.map((t) => ({ ...t, active: t.id === tabId })),
    activeId: tabId,
  };
  emit();
}

/** 从 url 里取个能看的短名（标题还没拿到时用）。 */
export function hostFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname || url.slice(0, 40);
  } catch {
    return (url || "").slice(0, 40) || "新标签页";
  }
}

// ===========================================================================
// IPC 桥
// ===========================================================================

/**
 * agent 开了一个 tab ⇒ 广播一个窗口事件（宿主层据此跳到 `/browser`）。
 *
 * ⚠️ **只在窗口真的在前台时才跳**（D2 拍板）—— 窗口在后台/最小化时不强抢屏幕，
 *    用户回来时在 `/browser` 页仍能看到那个 tab（tab 在主进程池里活着）。
 */
export const AGENT_TAB_OPENED_EVENT = "gacode:agent-tab-opened";

/**
 * 接上主进程事件（`onBrowserTabOpened` / `onBrowserTabClosed`）。
 *
 * ⚠️ **幂等**：重复调用只多挂一份监听 ⇒ 返回一个清理函数，调用方在卸载时调。
 */
export function startBrowserTabBridge(): () => void {
  const api = window.gacode;
  if (!api) return () => undefined;

  const disposers: Array<() => void> = [];

  if (typeof api.onBrowserTabOpened === "function") {
    disposers.push(
      api.onBrowserTabOpened((event) => {
        upsertExternalTab({
          tabId: event.tabId,
          url: event.url,
          title: event.title,
          origin: event.origin,
        });
        if (event.origin === "agent") {
          window.dispatchEvent(
            new CustomEvent(AGENT_TAB_OPENED_EVENT, {
              detail: { tabId: event.tabId, url: event.url },
            }),
          );
        }
      }),
    );
  }
  if (typeof api.onBrowserTabClosed === "function") {
    disposers.push(
      api.onBrowserTabClosed((event) => {
        removeExternalTab(event.tabId);
      }),
    );
  }
  if (typeof api.listBrowserTabs === "function") {
    void api
      .listBrowserTabs()
      .then((list) => setExternalTabs(list ?? []))
      .catch((err) => {
        console.warn("[browser-tabs] listBrowserTabs failed:", err);
      });
  }
  return () => {
    for (const d of disposers) {
      try {
        d();
      } catch {
        /* ignore */
      }
    }
  };
}
