import { contextBridge, ipcRenderer } from 'electron';
import * as os from 'os';
import * as path from 'path';
import type {
  BookmarkEntry,
  BrowserTabClosedEvent,
  DeepLinkEvent,
  GacodeBridge,
} from '../shared/types';

// 把 app.getVersion() 在 preload 阶段读出来,渲染层读不到 process
let cachedAppVersion = 'unknown';
try {
  const { app } = require('electron');
  cachedAppVersion = app.getVersion();
} catch (err) {
  console.warn(
    '[gacode-electron] preload: failed to read app.getVersion(), fallback to package.json',
    err,
  );
  try {
    // 兜底:读 package.json(路径: out/preload/index.js → ../../package.json)
    const pkg = require(path.join(__dirname, '..', '..', 'package.json'));
    cachedAppVersion = pkg.version || 'unknown';
  } catch (err2) {
    console.error('[gacode-electron] preload: package.json fallback failed', err2);
  }
}

// ipcRenderer.on('event', cb) 多次注册会有重复回调, 用包装函数管理
// ① 一次性订阅, ② 收集 listen token, ③ 返回 unsubscribe 闭包
function listenMain<T>(
  channel: string,
  handler: (payload: T) => void,
): () => void {
  const listener = (_e: unknown, payload: T) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

// contextBridge:安全暴露给 window.gacode,渲染层只能读不能改
contextBridge.exposeInMainWorld('gacode', {
  appVersion: cachedAppVersion,
  // 平台字符串,类型放宽,让 shared/ 跨 web + node 共用
  platform: os.platform(),

  // PR2:原生通知桥 —— 渲染层 await window.gacode.notify(title, body)
  notify: (title: string, body: string): Promise<boolean> =>
    ipcRenderer.invoke('gacode:notify', { title, body }),

  // 阶段 4: 监听 deep-link (gacode://chat/123 这种 protocol 唤起)
  onDeepLink: (callback: (path: string) => void): (() => void) =>
    listenMain<DeepLinkEvent>('gacode:deep-link', (e) => {
      if (e && typeof e.path === 'string') callback(e.path);
    }),

  // 阶段 4: SSE 收到事件 → 推主进程弹 Windows Toast (主进程的 Notification API)
  // C4-11: 多带一个 target = 点击 Toast 之后的落点 (站内 path / 外链 URL / null)
  notificationSSESend: (event: {
    title: string;
    body: string;
    target?: string | null;
  }): void => {
    ipcRenderer.send('gacode:notification-sse-event', event);
  },

  // C4-09: 窗口现在是不是在前台 —— 主进程算
  //   `!mainWindow.isMinimized() && mainWindow.isFocused()`。
  //   不用 renderer 的 document.hidden (最小化时 visibilityState 仍是 visible)。
  isWindowFocused: (): Promise<boolean> =>
    ipcRenderer.invoke('gacode:is-focused'),

  // C4-11: 用户点了 Windows Toast → 主进程推回站内落点 → 渲染层跳路由
  onNotificationClick: (callback: (target: string) => void): (() => void) =>
    listenMain<string>('gacode:notification-clicked', (target) => callback(target)),

  // 阶段 4: 任务栏进度 (mainWindow.setProgressBar 0..1; -1 清除)
  setTaskbarProgress: (progress: number): void => {
    // NaN/undefined 让 main 自己处理 (filter); 此处只做基本鲁棒过滤
    if (!Number.isFinite(progress)) return;
    ipcRenderer.send('gacode:set-taskbar-progress', progress);
  },

  // 阶段 4: BrowserView 集合 (主进程持有 tab 池)
  openBrowserTab: (url: string): Promise<{ tabId: string }> =>
    ipcRenderer.invoke('gacode:open-browser-tab', { url }),
  closeBrowserTab: (tabId: string): void => {
    ipcRenderer.send('gacode:close-browser-tab', { tabId });
  },
  focusBrowserTab: (tabId: string): void => {
    ipcRenderer.send('gacode:focus-browser-tab', { tabId });
  },

  // 阶段 4: BrowserView tab 关闭事件 (主进程 → 渲染层)
  // 给 webview-bridge.ts 做"主进程关掉 tab 时反向通知渲染"用
  // Browser.tsx 主要用 `<webview>` 标签管 tab, 这条监听备用
  onBrowserTabClosed: (callback: (event: BrowserTabClosedEvent) => void): (() => void) =>
    listenMain<BrowserTabClosedEvent>('gacode:browser-tab-closed', (e) => callback(e)),

  // refresh-fix: refreshToken 持久化桥 — 主进程持有
  // %APPDATA%/Gacode/refresh-token.json, 渲染层走 IPC. AuthProvider 在
  // login / refresh / logout 时调这三件套. 失败 swallow (lib/auth.tsx 内部
  // 已经 console.warn, 这里只负责把请求送过去).
  authStorage: {
    read: (): Promise<string | null> =>
      ipcRenderer.invoke('gacode:auth-read-refresh-token'),
    write: (refreshToken: string, userId: string): Promise<void> =>
      ipcRenderer.invoke('gacode:auth-write-refresh-token', { refreshToken, userId }),
    clear: (): Promise<void> =>
      ipcRenderer.invoke('gacode:auth-clear-refresh-token'),
  },

  // 阶段 7: 浏览器收藏夹 — 持久化到 %APPDATA%/Gacode/bookmarks.json.
  // 渲染层 Browser.tsx 调 read 初始化 state, add / remove 时再调写.
  bookmarks: {
    read: (): Promise<BookmarkEntry[]> =>
      ipcRenderer.invoke('gacode:bookmarks-read'),
    add: (entry: { url: string; title: string }): Promise<BookmarkEntry[]> =>
      ipcRenderer.invoke('gacode:bookmarks-add', entry),
    remove: (idOrUrl: string): Promise<BookmarkEntry[]> =>
      ipcRenderer.invoke('gacode:bookmarks-remove', { idOrUrl }),
  },

  // 阶段 7: 文件走系统默认应用 — DeliveryDetail 看到 PDF / docx / 图片 /
  // 视频时调这个让 Windows 启动对应程序; url 走系统默认浏览器.
  openWithSystem: (
    args: { url?: string; filePath?: string },
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('gacode:open-with-system', args),

  // 0.7.5 deliveries-15: 触发一次手动下载轮询 + 读 worker 当前状态.
  // 跟主进程 deliveries-downloader.ts 联动; 渲染层 (比如 DeliveryDetail 页)
  // 想立刻重试缓存可以调.
  downloadDeliverable: (): Promise<unknown> =>
    ipcRenderer.invoke('gacode:download-deliverable'),
  getDeliverablesStatus: (): Promise<unknown> =>
    ipcRenderer.invoke('gacode:deliverables-status'),
} satisfies GacodeBridge);

console.log('[gacode-electron] preload loaded');
