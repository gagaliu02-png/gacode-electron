// 跨主进程 / preload / 渲染层共用的类型契约。
// PR1 占位, PR2 加原生通知 + 菜单事件, 阶段 4 加 deep-link / taskbar / webview。

/**
 * 渲染层 `window.gacode` 全局对象契约 —— 阶段 4 扩展:
 *   - 单实例唤起收到 deep link → onDeepLink(callback) 监听
 *   - 任务栏进度: setTaskbarProgress(0..1) 0/-1/nan 都接受
 *   - BrowserView 集合 (主进程持有 tab 池): open / close / focus
 *   - SSE 推到主进程弹 Windows Toast (主进程只能拿到 renderer 推的事件)
 *   - 已有: appVersion / platform / notify
 */
export interface GacodeBridge {
  appVersion: string;
  /** 'win32' | 'darwin' | 'linux' 等 — 主进程 os.platform() 的字符串. 不引 NodeJS 命名空间, 让 web 端 tsconfig 也能编. */
  platform: string;

  /**
   * 触发 Windows Toast / macOS Notification / Linux libnotify 通知。
   * 返回 Promise<boolean> 表示系统是否真的显示(Notification.isSupported())。
   */
  notify: (title: string, body: string) => Promise<boolean>;

  /**
   * 监听 deep link (gacode://chat/123 这种 custom protocol 唤起时推到渲染层)。
   * 返回的函数调用 = 取消订阅 (避免内存泄漏)。
   */
  onDeepLink: (callback: (path: string) => void) => () => void;

  /**
   * 主进程已经有现成的 `window.gacode.notify`, 但 SSE 流不在 renderer
   * (EventSource 是 renderer 起的), 让 renderer 推 SSE 事件过来由主进程弹
   * Windows Toast, 在收到通知时调用这个。
   *
   * `target` = 用户点了 Toast 之后的落点 (C4-11):
   *   - "/chat/{id}"  站内路由 (主进程恢复窗口 + 聚焦 + 推回 renderer 跳路由)
   *   - "http(s)://" 外链 (主进程 shell.openExternal)
   *   - null         没有落点 (点了只恢复窗口)
   */
  notificationSSESend: (event: {
    title: string;
    body: string;
    target?: string | null;
  }) => void;

  /**
   * 窗口现在是不是在前台 (C4-09)。
   * 主进程算 `!mainWindow.isMinimized() && mainWindow.isFocused()` ——
   * **不要**用 renderer 的 `document.hidden` (Electron 窗口最小化时
   * `document.visibilityState` 仍可能是 `visible`)。
   * 桥不存在时渲染层按「不在前台」处理。
   */
  isWindowFocused: () => Promise<boolean>;

  /**
   * 监听「用户点了 Windows Toast」事件 (C4-11, 主进程 → 渲染层)。
   * payload = 站内路由 path (外链由主进程自己 shell.openExternal, 不走这里)。
   * 返回的函数调用 = 取消订阅。
   */
  onNotificationClick: (callback: (target: string) => void) => () => void;

  /**
   * 设置 Windows 任务栏进度条 (`mainWindow.setProgressBar`)。
   * - 0..1 → 进度
   * - -1   → 清除
   * - NaN / 非数 → 忽略 (上传进度回调经常推非整)
   * 失败由 main 兜底, 这里 fire-and-forget 不返错误
   */
  setTaskbarProgress: (progress: number) => void;

  /**
   * 申请主进程开一个 BrowserView tab (顶层嵌入 mainWindow contentView)。
   * 主进程管理 tab 池, 返 { tabId } 句柄, 后续 close / focus 都用这个 id。
   * 渲染层 Browser.tsx 主要用 `<webview>` 渲染多个 tab, 这条 IPC 给"外层链接
   * (如 chat 里的 '在浏览器打开')" 留入口, 现阶段由 webview-bridge.ts 暴露。
   */
  openBrowserTab: (url: string) => Promise<{ tabId: string }>;

  /** 关掉一个 BrowserView tab; 未知 id 静默忽略。 */
  closeBrowserTab: (tabId: string) => void;

  /** 提到顶层 (BrowserView 允许多层堆叠)。 */
  focusBrowserTab: (tabId: string) => void;

  /**
   * 监听 BrowserView 关闭事件 (主进程 → 渲染层)。
   * 给 webview-bridge.ts 做"主进程关掉 tab 时反向通知渲染"用。
   */
  onBrowserTabClosed: (callback: (event: BrowserTabClosedEvent) => void) => () => void;

  /**
   * refreshToken 持久化桥 — 渲染层走 IPC, 主进程读写
   * `%APPDATA%/Gacode/refresh-token.json`. 文件权限 0600 (Windows 下 fs.chmod
   * 实际不强制, 但调一下无害).
   *
   *  - read(): Promise<string | null> — 启动时读, 没文件 / parse 失败返 null
   *  - write(refreshToken, userId): 写盘, 同步刷新时 (login / refresh rotation)
   *  - clear(): 登出 / refresh 失败时清盘
   *
   * 真实 web 流走 cookie 不会到这; Electron 端 refreshToken 走 body, 必须
   * 显式存. 详情看 lib/auth.tsx hydrate 流程注释.
   */
  authStorage: {
    read: () => Promise<string | null>;
    write: (refreshToken: string, userId: string) => Promise<void>;
    clear: () => Promise<void>;
  };

  /**
   * 阶段 7 — 浏览器收藏夹 (`%APPDATA%/Gacode/bookmarks.json`, 0600)。
   * 跟 Android 端 `BrowserViewModel` 行为对齐: 增删按 url + title。
   * 这里用 url 当唯一键 (server 端没同步, 所以本地一份).
   */
  bookmarks: {
    read: () => Promise<BookmarkEntry[]>;
    add: (entry: { url: string; title: string }) => Promise<BookmarkEntry[]>;
    remove: (idOrUrl: string) => Promise<BookmarkEntry[]>;
  };

  /**
   * 阶段 7 — 文件走系统默认应用。
   * DeliveryDetail 看到 PDF / docx / xlsx / 视频 / 压缩包 / 图片时, 调这个
   * 让 Windows 启动对应的默认程序 (Edge / Word / Excel / Photos / 7zip...).
   * filePath: 本地文件绝对路径 (主进程 shell.openPath)
   * url:      远程 URL (主进程 shell.openExternal, 走系统默认浏览器)
   * 二选一; 都没传返 { ok: false, error: 'missing url or filePath' }.
   */
  openWithSystem: (args: {
    url?: string;
    filePath?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
}

/** 收藏夹条目 — 跟 Android 端 `BookmarkEntity` shape 对齐. */
export interface BookmarkEntry {
  id: string;
  url: string;
  title: string;
  /** ISO 字符串, 持久化不存 Date 对象 (JSON.parse 后变字符串) */
  createdAt: string;
}

/** 主进程 → 渲染层的菜单事件载荷。 */
export type GacodeMenuEvent = 'new-chat' | 'about';

/** BrowserView 关闭事件载荷 (主进程 → 渲染层)。 */
export interface BrowserTabClosedEvent {
  tabId: string;
}

/** Deep link 唤起 (主进程 → 渲染层)。 */
export interface DeepLinkEvent {
  path: string;
}
