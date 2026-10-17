import {
  app,
  BrowserWindow,
  BrowserView,
  shell,
  Menu,
  ipcMain,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { createTray } from './tray';
import { createAppMenu } from './menu';
import { registerNotificationIpc } from './notifications';

// CommonJS 下 __dirname 已有,这里只是为了类型注释
// const __filename = fileURLToPath(import.meta.url); // ESM 模式才需要
// const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

// 阶段 0 验证用:Electron 启动并截一张 PNG,然后退出。
// 用于 evidence 截图 — 走 webContents.capturePage() (正确捕获 GPU 内容),
// PowerShell + PrintWindow 截不到 DirectComposition 渲染层。
// 用法 (两种):
//   1. CLI flag:  electron . --screenshot=PATH [--screenshot-delay=MS]
//   2. 环境变量:    $env:GACODE_SCREENSHOT = 'PATH'; electron .
//  (环境变量走 electron-vite dev 也能用,因为 pnpm/electron-vite 不会剥 env var)
const screenshotArg = process.argv.find((a) => a.startsWith('--screenshot='));
const screenshotDelayArg = process.argv.find((a) => a.startsWith('--screenshot-delay='));
const screenshotPath = screenshotArg
  ? screenshotArg.split('=')[1]
  : process.env.GACODE_SCREENSHOT || null;
const screenshotDelayEnv = process.env.GACODE_SCREENSHOT_DELAY
  ? parseInt(process.env.GACODE_SCREENSHOT_DELAY, 10)
  : null;
const screenshotDelay = screenshotDelayArg
  ? parseInt(screenshotDelayArg.split('=')[1], 10)
  : (screenshotDelayEnv ?? 3000);
// E2E 注入: $env:GACODE_E2E_USER = '<base64 json>' 把 user 直接喂给
// 渲染层, 跳过 /auth/me, 用于已登录态截图(比如 App shell).
// 跟 AuthProvider 的 e2e_user URL 参数一一对应.
const e2eUserB64 = process.env.GACODE_E2E_USER || null;
if (screenshotPath) {
  console.log(`[gacode-electron] Screenshot mode: ${screenshotPath} (delay=${screenshotDelay}ms)`);
  if (e2eUserB64) {
    console.log(`[gacode-electron] E2E user injected (${e2eUserB64.length} chars)`);
  }
}

// 应用用户模型 ID - PR3 打包时 Windows Toast 会按这个名字显示
// PR1 暂未打包,先设上便于 dev 模式验证
if (process.platform === 'win32') {
  app.setAppUserModelId('com.gaga.gacode');
}

// =========================================================================
// 阶段 4 — 单实例锁
//
// `app.requestSingleInstanceLock()` 必须在 app.whenReady() 之前调, 否则
// Windows 第二次启动会再开一个新进程。我们的策略:
//   - 拿到锁 (first instance) → 正常启动 mainWindow
//   - 拿不到锁 (second instance, 比如用户双击 .exe / 浏览器点 gacode:// 唤起)
//     → app.quit() 立即退出, 但 Windows 会先 fork 一次 + 把命令行参数通过
//       `second-instance` 事件传给 first instance。
//
// 副作用 (Windows 注册表等): second instance 不会开新进程, 也不会重复弹窗,
// 当前已开的 instance 会被拉到前台 + 解析 argv 里的 gacode:// 协议 URL,
// 用 `gacode:deep-link` 事件推到渲染层。
// =========================================================================
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[gacode-electron] Another instance is already running, quit');
  app.quit();
  // 立刻退出本进程, 后面的代码不会跑
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  (() => {})();
  process.exit(0);
}

// =========================================================================
// 阶段 4 — gacode:// custom protocol (deep link)
//
// Windows 注册表项 HKEY_CURRENT_USER\Software\Classes\gacode,
// Electron 在 setAsDefaultProtocolClient 时自动管理。开发模式下无 .exe 时
// Electron 会用 process.execPath 当默认, 也就是当前 node + electron cli;
// 生产模式下指向打包后的 installer exe。
//
// 多个入口拿 deep link URL:
//   - macOS / 部分 Linux: `open-url` 事件
//   - Windows: `second-instance` 事件 argv 里追加的 `gacode://...` 那一项
//   - 第一次启动: process.argv 里也可能有 (Windows installer 注册的 argv)
// 我们三个都监听到,统一提取 gacode:// 开头的 URL, 解析成渲染层 path, 推过去。
// =========================================================================

if (process.defaultApp) {
  // dev: 用 `electron .` 启动, execPath 是 node.exe, 必须显式加脚本
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('gacode', process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  // prod: 直接 set, system 用 exe 注册
  app.setAsDefaultProtocolClient('gacode');
}
console.log('[gacode-electron] Registered custom protocol: gacode://');

/**
 * 解析 gacode:// URL → React Router path.
 * 例: gacode://chat/123          → /chat/123
 *     gacode://library/item/456  → /library/456
 *     gacode://notifications     → /notifications
 *
 * 防御: 只放行 `/` 开头的 path, 避免有人乱传 `file:///...` 之类.
 */
function parseDeepLink(url: string): string | null {
  if (!url || !url.startsWith('gacode://')) return null;
  const path = url.slice('gacode://'.length).replace(/^\/+/, '');
  if (!path) return '/';
  const parts = path.split('?')[0]!.split('/').filter(Boolean);
  if (parts.length === 0) return '/';
  const known = ['chat', 'library', 'deliveries', 'notifications', 'profile', 'browser'];
  if (known.includes(parts[0]!)) {
    return '/' + parts.join('/');
  }
  // 未知段不强行跳转, 落到首页更安全
  return '/';
}

// =========================================================================
// 阶段 4 — BrowserView tab 池管理
//
// 每 `openBrowserTab(url)` 建一个 BrowserView, 加到 mainWindow.contentView,
// 返 { tabId } 给渲染层。后续 close/focus 用 tabId。
// 现实里渲染层 Browser.tsx 主要用 `<webview>` 标签管 tab, 这条 IPC 给
// "外层链接" 留入口 (如 chat 内容里的 url → in-app browser)。
// =========================================================================
const browserTabs = new Map<
  string,
  { view: BrowserView; url: string; createdAt: number }
>();

function focusExistingTab(window: BrowserWindow, tabId: string): boolean {
  const tab = browserTabs.get(tabId);
  if (!tab) return false;
  if (window.isDestroyed()) return false;
  const rect = window.getContentBounds();
  tab.view.setBounds({
    x: 0,
    y: 0,
    width: rect.width,
    height: rect.height,
  });
  window.setTopBrowserView(tab.view);
  return true;
}

function relayoutBrowserTabs(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  const rect = window.getContentBounds();
  for (const tab of browserTabs.values()) {
    tab.view.setBounds({ x: 0, y: 0, width: rect.width, height: rect.height });
  }
}

let mainWindow: BrowserWindow | null = null;

// 标记"用户主动退出" —— 托盘菜单"退出"会触发 app.quit() → before-quit
// 设这个 flag,让 BrowserWindow 的 close 事件不再被劫持,真正销毁 → app 退出。
// 否则 close = 隐藏到托盘。
let isQuiting = false;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Gacode',
    backgroundColor: '#000000',
    show: false, // 先不显示,等 ready-to-show 再 show,避免白屏闪一下
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // contextIsolation 已开,sandbox 可关(关掉减少跨平台打包问题)
      webSecurity: true,
      webviewTag: true, // 阶段 4: 允许 `<webview>` 标签 (Browser.tsx 用)
    },
  });

  // 阶段 0: 加载本地 React 渲染产物(electron-vite build 输出在 out/renderer/index.html)
  // dev 模式 electron-vite 自动起 vite dev server(端口 5173 默认),通过 ELECTRON_RENDERER_URL env 传入
  // prod 模式加载 out/renderer/index.html
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    let url = process.env.ELECTRON_RENDERER_URL;
    if (e2eUserB64) {
      // E2E 模式 (CI 截图 / 验证) — 渲染层读 ?e2e_user 直接跳过 /auth/me
      url += (url.includes("?") ? "&" : "?") + `e2e_user=${encodeURIComponent(e2eUserB64)}`;
    }
    mainWindow.loadURL(url);
    console.log(
      `[gacode-electron] Loading dev renderer ${url} (dev=${isDev})`,
    );
  } else {
    // 用 loadURL + file:// 显式 URL 而不是 loadFile — Windows 上 loadFile
    // 对含 .. 的相对路径有时会重写到根, 导致 React 静态资源 404 + 渲染失败.
    // 这里直接构造 file:// URL 锁住绝对路径.
    const indexHtml = path.join(__dirname, '../renderer/index.html');
    let indexFileURL = require('url').pathToFileURL(path.resolve(indexHtml)).href;
    // E2E 模式: 把 e2e_user 加到 URL search, AuthProvider 启动时识别
    if (e2eUserB64) {
      indexFileURL += `?e2e_user=${encodeURIComponent(e2eUserB64)}`;
    }
    mainWindow.loadURL(indexFileURL);
    console.log(
      `[gacode-electron] Loading prod renderer ${indexFileURL} (dev=${isDev})`,
    );
  }

  // 加载完成后再显示窗口,避免白屏闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    console.log('[gacode-electron] Window ready-to-show');
  });

  // 外部链接走系统默认浏览器,不挤在 Electron 窗口里
  // 阶段 0 本地 React 渲染后,http(s) 链接场景少了,但留着以防内嵌 <a target="_blank"> 仍出现
  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    if (openUrl.startsWith('http://') || openUrl.startsWith('https://')) {
      shell.openExternal(openUrl);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // 阶段 0:本地 React Router 走 file:// 协议,will-navigate 主要触发于 <a href> 跳转。
  // 拦截策略:允许 http(s) 在系统浏览器打开(file:// 不需要拦,React Router 不触发 will-navigate)。
  // 注意,这里不再 require localhost:3000 / www.gaga.sale,产品线已独立。
  mainWindow.webContents.on('will-navigate', (event, navUrl) => {
    if (navUrl.startsWith('http://') || navUrl.startsWith('https://')) {
      event.preventDefault();
      shell.openExternal(navUrl);
      console.log(`[gacode-electron] External link routed to system browser: ${navUrl}`);
    }
    // file:// 放行(本地路由跳转)
  });

  // 阶段 4 — 窗口 resize 时调整 BrowserView 布局
  mainWindow.on('resize', () => relayoutBrowserTabs(mainWindow!));
  mainWindow.on('move', () => relayoutBrowserTabs(mainWindow!));

  // PR2:close 按钮 = 隐藏到托盘,不真退出。
  // 仅当 isQuiting (托盘"退出" / before-quit) 时才让窗口真关。
  mainWindow.on('close', (e) => {
    if (!isQuiting && mainWindow && !mainWindow.isDestroyed()) {
      e.preventDefault();
      mainWindow.hide();
      console.log('[gacode-electron] Window hidden to tray');
    }
  });

  mainWindow.on('closed', () => {
    // 关闭时把 BrowserView 全清掉
    for (const tab of browserTabs.values()) {
      try {
        mainWindow?.removeBrowserView(tab.view);
      } catch {
        /* ignore */
      }
    }
    browserTabs.clear();
    mainWindow = null;
  });
}

// =========================================================================
// 阶段 4 — IPC handlers (BrowserView + taskbar progress)
// =========================================================================

function registerBrowserTabIpc(): void {
  // 开一个新 tab → 返 { tabId }
  ipcMain.handle(
    'gacode:open-browser-tab',
    async (_event, args: { url: string }): Promise<{ tabId: string }> => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        throw new Error('mainWindow not ready');
      }
      const target = args?.url || 'about:blank';
      const tabId = `tab-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const view = new BrowserView({
        webPreferences: {
          // BrowserView 内嵌页沙箱化
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          // 不让内嵌 page 自己开 webviewTag, 避免无限递归
          webviewTag: false,
        },
      });
      try {
        await view.webContents.loadURL(target);
      } catch (err) {
        console.warn(`[gacode-electron] BrowserView loadURL failed: ${target}`, err);
      }
      const rect = mainWindow.getContentBounds();
      view.setBounds({ x: 0, y: 0, width: rect.width, height: rect.height });
      mainWindow.addBrowserView(view);
      mainWindow.setTopBrowserView(view);
      browserTabs.set(tabId, { view, url: target, createdAt: Date.now() });
      console.log(
        `[gacode-electron] BrowserView opened: tabId=${tabId} url=${target}`,
      );
      // tab 内 content 销毁时反向通知渲染层 (窗口关闭 / 外链 replace 等)
      view.webContents.on('destroyed', () => {
        const entry = browserTabs.get(tabId);
        if (entry) {
          try {
            mainWindow?.removeBrowserView(entry.view);
          } catch {
            /* ignore */
          }
          browserTabs.delete(tabId);
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('gacode:browser-tab-closed', { tabId });
        }
      });
      return { tabId };
    },
  );

  ipcMain.on(
    'gacode:close-browser-tab',
    (_event, args: { tabId: string }) => {
      const tab = browserTabs.get(args?.tabId);
      if (!tab) return;
      try {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.removeBrowserView(tab.view);
        }
        // removeBrowserView 会自动 destroy 内容; 再调一次确保回收
        // (某些 Electron 版本必须显式 destroy)
        try {
          (tab.view.webContents as unknown as { destroy?: () => void }).destroy?.();
        } catch {
          /* ignore */
        }
      } catch (err) {
        console.warn('[gacode-electron] closeBrowserView failed', err);
      }
      browserTabs.delete(args.tabId);
      console.log(
        `[gacode-electron] BrowserView closed: tabId=${args.tabId}`,
      );
    },
  );

  ipcMain.on(
    'gacode:focus-browser-tab',
    (_event, args: { tabId: string }) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      focusExistingTab(mainWindow, args?.tabId);
    },
  );

  console.log('[gacode-electron] Browser tab IPC handlers registered');
}

function registerTaskbarProgressIpc(): void {
  ipcMain.on(
    'gacode:set-taskbar-progress',
    (_event, progress: number) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      // setProgressBar:
      //   - 0..1 → progress
      //   - <0   → 清除
      //   - >1   → indeterminate 模式
      const n = typeof progress === 'number' ? progress : NaN;
      if (!Number.isFinite(n)) return;
      try {
        if (n < 0) {
          mainWindow.setProgressBar(-1);
        } else if (n > 1) {
          mainWindow.setProgressBar(2); // indeterminate
        } else {
          mainWindow.setProgressBar(n);
        }
      } catch (err) {
        console.warn('[gacode-electron] setProgressBar failed', err);
      }
    },
  );
  console.log('[gacode-electron] Taskbar progress IPC handler registered');
}

// =========================================================================
// refresh-fix — refreshToken 持久化 IPC handlers
//
// 文件路径: %APPDATA%/Gacode/refresh-token.json
// (userData 已经在 app.whenReady() 里 setPath 到 %APPDATA%/Gacode,
//  跟现有 Cache / IndexedDB / GPU cache 共享一个目录)
//
// 文件格式: { refreshToken: string, userId: string, updatedAt: ISO string }
// 权限: 0600 (Windows 下 fs.chmod 实际不强制, 但调一下无害, 让 POSIX layer
//        至少给个意图标记)
//
// 失败策略: read/write/clear 全部 try/catch 兜底, IPC 不抛异常给渲染层,
//          渲染层 lib/auth.tsx 内部 console.warn. refresh 流程不阻塞登录.
// =========================================================================

function getRefreshTokenFilePath(): string {
  // userData 在 setPath 之后是 %APPDATA%/Gacode
  return path.join(app.getPath('userData'), 'refresh-token.json');
}

interface RefreshTokenFile {
  refreshToken: string;
  userId: string;
  updatedAt: string;
}

function readRefreshTokenFile(): RefreshTokenFile | null {
  const fp = getRefreshTokenFilePath();
  try {
    if (!fs.existsSync(fp)) return null;
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw) as Partial<RefreshTokenFile>;
    if (typeof parsed.refreshToken !== 'string' || parsed.refreshToken.length < 10) {
      console.warn('[gacode-electron] refresh-token.json malformed, ignoring');
      return null;
    }
    return {
      refreshToken: parsed.refreshToken,
      userId: typeof parsed.userId === 'string' ? parsed.userId : '',
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[gacode-electron] readRefreshTokenFile failed', err);
    return null;
  }
}

function writeRefreshTokenFile(rt: string, userId: string): void {
  const fp = getRefreshTokenFilePath();
  try {
    const dir = path.dirname(fp);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const payload: RefreshTokenFile = {
      refreshToken: rt,
      userId,
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(fp, JSON.stringify(payload), 'utf8');
    // 0600 权限 — Windows 下 fs.chmod 实际不强制, 但调一下无害.
    try {
      fs.chmodSync(fp, 0o600);
    } catch {
      /* ignore on Windows */
    }
  } catch (err) {
    console.warn('[gacode-electron] writeRefreshTokenFile failed', err);
    throw err;
  }
}

function clearRefreshTokenFile(): void {
  const fp = getRefreshTokenFilePath();
  try {
    if (fs.existsSync(fp)) {
      fs.unlinkSync(fp);
    }
  } catch (err) {
    console.warn('[gacode-electron] clearRefreshTokenFile failed', err);
    throw err;
  }
}

function registerAuthStorageIpc(): void {
  ipcMain.handle(
    'gacode:auth-read-refresh-token',
    async (): Promise<string | null> => {
      const f = readRefreshTokenFile();
      return f?.refreshToken ?? null;
    },
  );

  ipcMain.handle(
    'gacode:auth-write-refresh-token',
    async (
      _event,
      args: { refreshToken?: string; userId?: string },
    ): Promise<void> => {
      const rt = args?.refreshToken;
      if (typeof rt !== 'string' || rt.length < 10) {
        throw new Error('refreshToken missing or too short');
      }
      const userId = typeof args?.userId === 'string' ? args.userId : '';
      writeRefreshTokenFile(rt, userId);
    },
  );

  ipcMain.handle(
    'gacode:auth-clear-refresh-token',
    async (): Promise<void> => {
      clearRefreshTokenFile();
    },
  );

  console.log('[gacode-electron] Auth storage IPC handlers registered');
}

// =========================================================================
// 阶段 4 — second-instance (deep link 唤起 first instance)
//
// `second-instance` 事件在 first instance 里触发, 第二个进程已经 quit,
// 这里拿到的 argv 第二个进程原本的命令行数组。
// 注意 Windows 上 deep link URL 会作为最后一个参数追加在 argv 末尾。
// =========================================================================
app.on('second-instance', (_event, argv /*, workingDirectory */) => {
  console.log('[gacode-electron] second-instance argv:', argv);
  // 1) 拉 mainWindow 到前台 + focus
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  // 2) 扫描 argv 找 gacode:// 开头的 URL, 推渲染层
  for (const a of argv) {
    const path = parseDeepLink(a);
    if (path) {
      mainWindow?.webContents.send('gacode:deep-link', { path });
      console.log(`[gacode-electron] second-instance deep link: ${path}`);
      break;
    }
  }
});

// =========================================================================
// 阶段 4 — macOS `open-url` (虽然我们只 Win, 但 Electron 文档说留着这个跨平台)
// =========================================================================
app.on('open-url', (event, url) => {
  event.preventDefault();
  const path = parseDeepLink(url);
  if (!path) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send('gacode:deep-link', { path });
    console.log(`[gacode-electron] open-url deep link: ${path}`);
  } else {
    // macOS 上 open-url 比 app.whenReady 先到, 暂存, 等窗口就绪再发
    pendingDeepLink = path;
  }
});

// 兜底: first instance 自己启动时 argv 里如果有 gacode:// URL (Windows
// installer 注册后直接 "open" 命令拿到的 argv), 等 webContents 就绪后再补发。
let pendingDeepLink: string | null = null;
{
  for (const a of process.argv) {
    const p = parseDeepLink(a);
    if (p) {
      pendingDeepLink = p;
      console.log(`[gacode-electron] argv deep link: ${p}`);
      break;
    }
  }
}

// 应用就绪后建窗口
app.whenReady().then(() => {
  // PR1 遗留修复:GPU/cache stderr 噪声。
  // Electron 默认 userData 是 %APPDATA%/Electron,多账户/多 app 共享容易冲突。
  // 切到 %APPDATA%/Gacode 后,Windows 权限 OK + 不再和别的 Electron app 抢 cache 目录。
  // 必须在 app.whenReady() 内调用,module top-level 不生效。
  if (process.platform === 'win32') {
    try {
      const userDataDir = path.join(app.getPath('appData'), 'Gacode');
      app.setPath('userData', userDataDir);
      console.log(`[gacode-electron] userData = ${userDataDir}`);
    } catch (err) {
      console.warn('[gacode-electron] setPath userData failed', err);
    }
  }

  createWindow();
  createAppMenu(() => mainWindow);
  createTray(() => mainWindow);
  registerNotificationIpc();
  registerBrowserTabIpc();
  registerTaskbarProgressIpc();
  registerAuthStorageIpc();

  // 阶段 4: webContents 就绪后补发一次 argv deep link
  if (pendingDeepLink && mainWindow) {
    mainWindow.webContents.once('did-finish-load', () => {
      const p = pendingDeepLink;
      pendingDeepLink = null;
      if (p) {
        mainWindow?.webContents.send('gacode:deep-link', { path: p });
      }
    });
  }

  // 阶段 0 验证用:截图后退出(只用于 CI / evidence)
  if (screenshotPath && mainWindow) {
    const win = mainWindow;
    // 渲染层 console 转发到主进程 stdout, 方便调试 React / Vite 错误
    win.webContents.on('console-message', (_e, level, message, line, sourceId) => {
      const tag = level === 0 ? 'log' : level === 1 ? 'warn' : level === 2 ? 'error' : 'info';
      console.log(`[renderer:${tag}] ${message} (${sourceId}:${line})`);
    });
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        try {
          const image = await win.webContents.capturePage();
          fs.writeFileSync(screenshotPath, image.toPNG());
          console.log(`[gacode-electron] Screenshot saved: ${screenshotPath} (${image.getSize().width}x${image.getSize().height})`);
        } catch (err) {
          console.error('[gacode-electron] capturePage failed', err);
        } finally {
          app.quit();
        }
      }, screenshotDelay);
    });
  }

  // macOS 兼容(虽然当前只 Win,但代码 ready)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // PR2:dev 模式自动触发一次原生通知 —— 仅 --test-notify flag 开启,
  // 默认关,不影响 prod。Toast 显示依赖 AppUserModelId + Notification.isSupported()。
  if (isDev && process.argv.includes('--test-notify')) {
    mainWindow?.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        mainWindow?.webContents.executeJavaScript(
          'window.gacode?.notify("Test 通知", "来自 gacode-electron 的测试").then((ok) => console.log("[gacode-electron] notify ok=" + ok))',
        );
        console.log('[gacode-electron] Test notification triggered');
      }, 2000);
    });
  }

  // PR2:dev 模式打印当前应用菜单项,便于验证 setApplicationMenu 生效
  if (isDev) {
    setTimeout(() => {
      const menu = Menu.getApplicationMenu();
      console.log(
        '[gacode-electron] Menu items:',
        menu?.items.map((i) => i.label),
      );
    }, 3000);
  }
});

// PR2:before-quit 标记用户主动退出 —— 让 BrowserWindow.close 不再被劫持
app.on('before-quit', () => {
  isQuiting = true;
  console.log('[gacode-electron] before-quit, isQuiting=true');
});

// 所有窗口关闭时:如果用户在主动退出,真退出 app;否则保持进程活在托盘里
app.on('window-all-closed', () => {
  // PR2:tray 模式下保留进程,close = 隐藏到托盘,只有托盘"退出"或 before-quit 才真退。
  // 即 process.platform === 'darwin' 之外的平台也保留(原先是 quit)。
  // macOS 上本身就不 quit,这里行为不变。
  if (isQuiting) {
    app.quit();
  }
  // else: keep alive for tray
});
