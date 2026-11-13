import { contextBridge, ipcRenderer } from 'electron';
import * as os from 'os';
import * as path from 'path';
import type {
  BookmarkEntry,
  BrowserTabClosedEvent,
  ClientToolRequest,
  DeepLinkEvent,
  GacodeBridge,
  LocalJobInfo,
  LocalTask,
  RunningClientTask,
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
  // 2026-10-26: 交付物自动下载 IPC (`downloadDeliverable` /
  // `getDeliverablesStatus`) 整条撤掉 — 渲染层零调用点, web 端也没有这个
  //   能力 (web 的「重试下载」只是浏览器重新 fetch `item.url`).
  //   对应的 `GacodeBridge` 类型声明也已从 shared/types.ts 删掉 ⇒ 这里
  //   恢复成完整的 `satisfies GacodeBridge`.

  // ★ [批 G19 · 2026-11-12] 清内嵌浏览器缓存。
  //   <webview> 标签**没有** clearCache 方法 (渲染层调不到 session) ⇒ 走主进程.
  clearBrowserCache: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('gacode:clear-browser-cache'),

  // ★ [P3/P4 · 2026-11-12] 端侧执行 (`pc_*`) —— 全部落在**主进程**。
  //   渲染层只做「发起 + 显示」; 执行 / 闸门 / 审计都在主进程那侧.
  clientTools: {
    // 把 access token 推给主进程 (设备通道要用). 内存持有, 不持久化.
    setAccessToken: (token: string | null): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('gacode:client-tool-set-token', token),
    ptyAvailable: (): Promise<boolean> =>
      ipcRenderer.invoke('gacode:client-tool-pty-available'),
    status: () => ipcRenderer.invoke('gacode:client-tool-status'),
    setGate: (next: { masterEnabled?: boolean; killSwitch?: boolean }) =>
      ipcRenderer.invoke('gacode:client-tool-set-gate', next),
    audit: (limit?: number) => ipcRenderer.invoke('gacode:client-tool-audit', limit),
    clearAudit: () => ipcRenderer.invoke('gacode:client-tool-clear-audit'),
    execute: (input: {
      tool: string;
      args?: Record<string, unknown>;
      cwd?: string;
      timeoutMs?: number;
    }) => ipcRenderer.invoke('gacode:client-tool-execute', input),
    onRequest: (callback: (req: ClientToolRequest) => void): (() => void) =>
      listenMain<ClientToolRequest>('gacode:client-tool-request', (e) => callback(e)),
    // ★ [P6] 正在跑的任务（多会话并行 ⇒ 看得见、管得住）
    runningTasks: (): Promise<RunningClientTask[]> =>
      ipcRenderer.invoke('gacode:client-tool-running-tasks'),
    stopTask: (pendingId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('gacode:client-tool-stop-task', pendingId),
    onTasks: (callback: (tasks: RunningClientTask[]) => void): (() => void) =>
      listenMain<RunningClientTask[]>('gacode:client-tool-tasks', (e) => callback(e)),
    // ★ [2026-11-13 · 订正 27 · B6] 后台作业（派单即返回、进程 detached 的长活）。
    //   ⚠️ 它**不在** runningTasks 里（那个是「这一轮正在等着的同步任务」）。
    /** 本机的后台作业列表（含已结束的，按开始时间倒序）。 */
    listJobs: (): Promise<LocalJobInfo[]> =>
      ipcRenderer.invoke('gacode:client-tool-list-jobs'),
    /** 停一个后台作业（杀进程树）。 */
    stopJob: (jobId: string): Promise<{ ok: boolean; error?: string | null }> =>
      ipcRenderer.invoke('gacode:client-tool-stop-job', jobId),
    /** 订阅「作业列表」变化（主进程 → 渲染层）。 */
    onJobs: (callback: (jobs: LocalJobInfo[]) => void): (() => void) =>
      listenMain<LocalJobInfo[]>('gacode:client-tool-jobs', (e) => callback(e)),
  },

  // ★ [P7 · 2026-11-12] 本机定时任务（定时器在主进程）。
  localTasks: {
    list: (): Promise<LocalTask[]> => ipcRenderer.invoke('gacode:local-tasks-list'),
    upsert: (task: {
      id?: string;
      name?: string;
      cron: string;
      prompt: string;
      enabled?: boolean;
    }): Promise<{ ok: boolean; task?: LocalTask; error?: string }> =>
      ipcRenderer.invoke('gacode:local-tasks-upsert', task),
    remove: (id: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke('gacode:local-tasks-remove', id),
    runNow: (id: string): Promise<{ ok: boolean; error?: string | null }> =>
      ipcRenderer.invoke('gacode:local-tasks-run-now', id),
  },
} satisfies GacodeBridge);

console.log('[gacode-electron] preload loaded');
