/**
 * electron/browser-views.ts —— BrowserView 生命周期**唯一出口**（T-027-d0ck）
 *
 * [2026-11-17 · T-027-d0ck] PC 浏览器统一：agent 的 BrowserView **停靠**到
 * `/browser` 页的 tab 内容区（而不是铺满整个窗口、盖住 React UI）。
 *
 * ## 为什么要有这个文件
 *
 * 订正 31 之前，BrowserView 的每个动作（new / addBrowserView / setTopBrowserView /
 * setBounds / removeBrowserView / destroy）都散写在 `main.ts` 里 ⇒ 将来要迁到
 * `WebContentsView`（Electron 32 起的正式 API）时，语义要改一大片。
 * 本文件把这些动作收成**一个出口** ⇒ 迁移面缩到一个文件。
 *
 * ## 三条铁律
 *
 * 1. ⛔ **隐藏 tab 不能缩尺寸** ——
 *    `BrowserView` 的 bounds 就是 guest 的**视口尺寸** ⇒ 缩到 0×0 会让页面重排
 *    （响应式站变形）且 `innerWidth/innerHeight` 变 0 ⇒ 我们自己的「视口边界校验」
 *    （`browser.ts` 的 `@x,y` 屏幕外拒绝）会把所有点击都判成屏幕外。
 *    ⇒ 隐藏 = **移出可视区但保持尺寸**（`parkBounds`）。
 * 2. ⛔ **停靠矩形只由渲染层上报** ——
 *    主进程对 React 侧栏（256px）、tab 条、地址栏**完全无感知** ⇒ 只拿得到裸窗口矩形
 *    ⇒ 一开就盖满。⇒ `/browser` 页的内容区用 `gacode:report-browser-rect` 上报
 *    自己的 `getBoundingClientRect()` ⇒ 主进程**重放**最后一次上报的矩形。
 * 3. ⛔ 本文件**只 `import type` electron**（没有运行时 import）⇒
 *    `node --test` 能直接加载 ⇒ 几何 / 生命周期逻辑可单测（不装 electron 也能跑）。
 */

import type { BrowserView } from 'electron';

// ===========================================================================
// 停靠矩形（dock rect）
// ===========================================================================

/** BrowserView 的落位矩形（与 Electron 的 `Rectangle` 结构兼容）。 */
export interface DockRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 停泊（park）时往左移出的距离。
 *
 * ⛔ 不是 0 —— 移出可视区但**保持尺寸**（铁律 1）。留 200px 余量避免刚好卡在边界上
 * 被系统当成"还在屏幕内"。
 */
export const PARK_MARGIN = 200;

/** 矩形是不是一个合法的停靠矩形（尺寸必须为正）。 */
export function isDockRect(value: unknown): value is DockRect {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.x === 'number' && Number.isFinite(r.x) &&
    typeof r.y === 'number' && Number.isFinite(r.y) &&
    typeof r.width === 'number' && Number.isFinite(r.width) && r.width > 0 &&
    typeof r.height === 'number' && Number.isFinite(r.height) && r.height > 0
  );
}

/**
 * 归一化渲染层上报的矩形。
 *
 * ⛔ 不合法 ⇒ 返回 `null`（调用方**如实说**"矩形不合法"，不许猜一个默认值糊弄）。
 */
export function normalizeDockRect(raw: unknown): DockRect | null {
  if (!isDockRect(raw)) return null;
  const r = raw as DockRect;
  return {
    x: Math.round(r.x),
    y: Math.round(r.y),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
}

/**
 * 停泊矩形：**移出可视区，尺寸保持不变**（铁律 1）。
 *
 * 移左边（x 为负）而不是缩到 0 ⇒ guest 的 `innerWidth/innerHeight` 不变
 * ⇒ 页面不重排、我们的视口校验也不误判。
 */
export function parkBounds(rect: DockRect): DockRect {
  return {
    x: -(rect.width + PARK_MARGIN),
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}

/** 两个矩形是否等价（用于「变了才 setBounds」，少一次重排）。 */
export function rectsEqual(a: DockRect | null, b: DockRect | null): boolean {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

// ===========================================================================
// 依赖注入：窗口宿主 + view 形状
// ===========================================================================

/** 本模块只碰 view 的这几个成员（⇒ 单测可以用假对象）。 */
export interface DockableView {
  setBounds(rect: DockRect): void;
  webContents: {
    isDestroyed(): boolean;
    focus?(): void;
    getTitle?(): string;
    destroy?(): void;
  };
}

/** 窗口宿主（`BrowserWindow` 的那几样）。 */
export interface BrowserViewHost {
  isDestroyed(): boolean;
  addBrowserView(view: BrowserView): void;
  removeBrowserView(view: BrowserView): void;
  setTopBrowserView(view: BrowserView): void;
  getContentBounds(): { width: number; height: number };
}

/** tab 的来源。 */
export type TabOrigin = 'agent' | 'renderer';

/** 池里的一条 tab。 */
export interface PoolEntry {
  view: BrowserView;
  url: string;
  createdAt: number;
  origin: TabOrigin;
  /** 发起这个 tab 的会话（agent 侧才有）⇒ 解决跨会话串台。 */
  sessionId: string | null;
  /** 渲染层上报的停靠矩形（`null` = 还没上报过）。 */
  rect: DockRect | null;
  /** 当前是不是"停靠可见"状态。 */
  docked: boolean;
  lastUsedAt: number;
}

/** 对外暴露的 tab 摘要（给渲染层画 tab 条用）。 */
export interface PoolTabSummary {
  tabId: string;
  url: string;
  title: string;
  origin: TabOrigin;
  active: boolean;
  sessionId: string | null;
}

// ===========================================================================
// 池
// ===========================================================================

/**
 * BrowserView tab 池 —— 所有 view 动作的唯一出口。
 *
 * ⛔ 池**不负责**创建 view（`new BrowserView` 留在 `main.ts` —— 那里要配
 * `webPreferences`）⇒ 本模块可以脱离 electron 单测。
 */
export class BrowserViewPool {
  private readonly host: BrowserViewHost;
  private readonly tabs = new Map<string, PoolEntry>();
  /** 渲染层上报的**内容区**矩形（所有 agent tab 共用同一个落位）。 */
  private contentRect: DockRect | null = null;
  private activeTabId: string | null = null;

  constructor(host: BrowserViewHost) {
    this.host = host;
  }

  // ── 读 ──────────────────────────────────────────────────────────────

  get(tabId: string): PoolEntry | undefined {
    return this.tabs.get(tabId);
  }

  has(tabId: string): boolean {
    return this.tabs.has(tabId);
  }

  /** 活着的条目（webContents 没被销毁的）。 */
  entries(): Iterable<[string, PoolEntry]> {
    return this.tabs.entries();
  }

  get size(): number {
    return this.tabs.size;
  }

  /** 当前 active 的 tab（渲染层 / agent 焦点一致）。 */
  getActiveTabId(): string | null {
    return this.activeTabId;
  }

  /** 渲染层上报的内容区矩形（`null` = 还没上报）。 */
  getContentRect(): DockRect | null {
    return this.contentRect;
  }

  /** 画 tab 条用的摘要列表。 */
  list(): PoolTabSummary[] {
    const out: PoolTabSummary[] = [];
    for (const [tabId, entry] of this.tabs) {
      let title = '';
      try {
        if (!entry.view.webContents.isDestroyed()) {
          title = entry.view.webContents.getTitle?.() || '';
        }
      } catch {
        /* view 刚好销毁 ⇒ 空标题 */
      }
      out.push({
        tabId,
        url: entry.url,
        title,
        origin: entry.origin,
        active: tabId === this.activeTabId,
        sessionId: entry.sessionId,
      });
    }
    return out;
  }

  // ── 写 ──────────────────────────────────────────────────────────────

  /** 登记一个新建的 view。 */
  add(
    tabId: string,
    view: BrowserView,
    opts: { url: string; origin: TabOrigin; sessionId?: string | null },
  ): PoolEntry {
    const entry: PoolEntry = {
      view,
      url: opts.url,
      createdAt: Date.now(),
      origin: opts.origin,
      sessionId: opts.sessionId ?? null,
      rect: null,
      docked: false,
      lastUsedAt: Date.now(),
    };
    this.tabs.set(tabId, entry);
    return entry;
  }

  /**
   * 渲染层上报内容区矩形。
   *
   * ⇒ 立即**重放**给所有已停靠的 tab（窗口 resize / 侧栏折叠 ⇒ 位置要跟着变）。
   * ⇒ 变了才 `setBounds`（少一次重排 ⇒ 少一次页面 reflow）。
   */
  setContentRect(rect: DockRect | null): void {
    if (rectsEqual(this.contentRect, rect)) return;
    this.contentRect = rect;
    if (!rect) {
      // ⛔ 渲染层说「现在没有浏览器区」（用户离开了 `/browser` 页）
      //   ⇒ 把所有 agent view **停泊**（移出可视区但**不缩尺寸**）
      //   ⇒ 绝不能让它盖住整个客户端。
      for (const tabId of this.tabs.keys()) this.park(tabId);
      return;
    }
    for (const [tabId, entry] of this.tabs) {
      if (!entry.docked) continue;
      const target = rect ?? this.fallbackRect();
      entry.rect = target;
      this.applyRect(tabId, entry, target);
    }
  }

  /**
   * 窗口 resize / move ⇒ 重放当前矩形。
   *
   * ⚠️ **停泊的 tab 也要重放** —— 它的停泊位（`-(w+200)`）依赖基础矩形。
   */
  relayout(): void {
    const base = this.contentRect ?? this.fallbackRect();
    for (const [tabId, entry] of this.tabs) {
      if (entry.view.webContents.isDestroyed()) continue;
      if (entry.docked) {
        entry.rect = base;
        this.applyRect(tabId, entry, base);
      } else {
        this.applyRect(tabId, entry, parkBounds(entry.rect ?? base));
      }
    }
  }

  /** 没有上报矩形时的兜底（整个内容区）—— 只在用户还没进过 `/browser` 页时用。 */
  private fallbackRect(): DockRect {
    const b = this.host.isDestroyed() ? { width: 0, height: 0 } : this.host.getContentBounds();
    return { x: 0, y: 0, width: Math.max(0, b.width), height: Math.max(0, b.height) };
  }

  /** 真正 `setBounds`（带护栏：尺寸非法就跳过，别把 view 弄成 0×0）。 */
  private applyRect(tabId: string, entry: PoolEntry, rect: DockRect): void {
    if (!isDockRect(rect)) return;
    if (entry.view.webContents.isDestroyed()) return;
    try {
      entry.view.setBounds(rect);
    } catch (e) {
      console.warn(`[browser-views] setBounds failed (${tabId}):`, (e as Error).message);
    }
  }

  /**
   * 停靠（显示）一个 tab 到内容区矩形。
   *
   * ⚠️ **没有渲染层上报的矩形 ⇒ 不停靠**（改成停泊）——
   *    主进程对 React 侧栏/tab 条/地址栏无感知 ⇒ 兜底成「整个窗口」就会
   *    **盖住整个客户端**（这正是本任务要消灭的现象）。
   *    ⇒ 正确姿势：渲染层报了矩形才停靠；没报就先停泊着（view 还活着）。
   *
   * @param rect 显式矩形；不给 ⇒ 用渲染层上报的。
   */
  dock(tabId: string, rect?: DockRect | null): boolean {
    const entry = this.tabs.get(tabId);
    if (!entry) return false;
    if (entry.view.webContents.isDestroyed()) return false;
    const target = rect ?? this.contentRect;
    if (!isDockRect(target)) {
      // 没有落位矩形 ⇒ 先停泊（不盖住客户端），等渲染层上报。
      this.park(tabId);
      return false;
    }
    entry.rect = target;
    this.applyRect(tabId, entry, target);
    entry.docked = true;
    this.activeTabId = tabId;
    try {
      this.host.addBrowserView(entry.view);
      this.host.setTopBrowserView(entry.view);
    } catch (e) {
      console.warn(`[browser-views] dock failed (${tabId}):`, (e as Error).message);
      return false;
    }
    return true;
  }

  /**
   * 停泊（隐藏）一个 tab —— **移出可视区但保持尺寸**（铁律 1）。
   */
  park(tabId: string): boolean {
    const entry = this.tabs.get(tabId);
    if (!entry) return false;
    if (entry.view.webContents.isDestroyed()) return false;
    const base = entry.rect ?? this.contentRect ?? this.fallbackRect();
    if (!isDockRect(base)) return false;
    this.applyRect(tabId, entry, parkBounds(base));
    entry.docked = false;
    if (this.activeTabId === tabId) this.activeTabId = null;
    return true;
  }

  /**
   * 聚焦一个 tab（停靠 + 置顶 + 让 webContents 拿到焦点）。
   *
   * ⚠️ trusted 输入（`sendInputEvent`）**必须**先把它置顶 + focus ——
   *    否则事件被发给后台的 view，点击会"打不中"。
   * ⚠️ 没有渲染层上报的矩形 ⇒ 停靠不了（会盖住客户端）⇒ 只置顶 + focus，
   *    等渲染层那边把矩形报上来 / 把这个 tab 选上。
   */
  focus(tabId: string): boolean {
    const entry = this.tabs.get(tabId);
    if (!entry) return false;
    if (entry.view.webContents.isDestroyed()) return false;
    const docked = this.dock(tabId);
    entry.lastUsedAt = Date.now();
    try {
      this.host.setTopBrowserView(entry.view);
    } catch {
      /* ignore */
    }
    try {
      entry.view.webContents.focus?.();
    } catch {
      /* ignore */
    }
    return docked || true;
  }

  /** 激活（agent 写操作前调）＝ 停靠 + 置顶 + 聚焦 + 记 active。 */
  activate(tabId: string): boolean {
    return this.focus(tabId);
  }

  /** 记 active（不改变可见性）—— 渲染层切 tab 时用。 */
  setActiveTab(tabId: string | null): void {
    if (tabId && !this.tabs.has(tabId)) return;
    this.activeTabId = tabId;
    const entry = tabId ? this.tabs.get(tabId) : undefined;
    if (entry) entry.lastUsedAt = Date.now();
  }

  /** 隐藏所有 tab（用户切回自己的 `<webview>` tab 时）。 */
  parkAll(): void {
    for (const tabId of this.tabs.keys()) this.park(tabId);
  }

  /**
   * 只把条目从池里摘掉（**不销毁** view）。
   *
   * ⚠️ 给「webContents 自己销毁了」这条回调用 —— 那时 view 已经死了，
   *    再调 `destroy()` 会二次销毁（Electron 会抛）。
   */
  forget(tabId: string): boolean {
    if (!this.tabs.has(tabId)) return false;
    this.tabs.delete(tabId);
    if (this.activeTabId === tabId) this.activeTabId = null;
    return true;
  }

  /** 销毁一个 tab（视图 + 池条目）。 */
  destroy(tabId: string): boolean {
    const entry = this.tabs.get(tabId);
    if (!entry) return false;
    try {
      if (!this.host.isDestroyed()) this.host.removeBrowserView(entry.view);
    } catch {
      /* ignore */
    }
    try {
      // ⚠️ `WebContents.destroy` 不在 Electron 的公开类型里（运行时存在）⇒ 断言
      (entry.view.webContents as unknown as { destroy?: () => void }).destroy?.();
    } catch {
      /* ignore */
    }
    this.tabs.delete(tabId);
    if (this.activeTabId === tabId) this.activeTabId = null;
    return true;
  }

  /** 全清（窗口关闭时）。 */
  destroyAll(): void {
    for (const tabId of [...this.tabs.keys()]) this.destroy(tabId);
  }
}
