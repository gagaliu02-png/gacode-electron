import {
  app,
  BrowserWindow,
  BrowserView,
  shell,
  Menu,
  ipcMain,
  nativeTheme,
  session,
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { createTray } from './tray';
import { createAppMenu } from './menu';
import { registerNotificationIpc } from './notifications';
// ★ [T-044 · 2026-11-18] 渲染层诊断日志（落盘）—— 打包版没有 devtools ⇒ console.log 看不到.
import { registerDiagIpc } from './diag-log';
// [P3/P4 · 2026-11-12] 端侧执行（`pc_*`）—— 主进程那半：执行器 + 闸门 + 设备通道。
import { registerClientToolIpc, setClientToolWindow } from './client-tools/ipc';
// [2026-11-15 · 订正 31 · M0] 浏览器端侧工具 —— 把**现有** tab 池注给执行器
//   （用户和 agent 共用同一个池；不另起窗口、不另建池）。
import { setBrowserTabPool, clearElementIndex, clearShotMeta } from './client-tools/browser';
import { BrowserViewPool, normalizeDockRect, type TabOrigin } from './browser-views';
import { executeClientTool } from './client-tools/executor';
// [2026-11-18 · T-038 方案 A] 执行器实例锁（锁键 = 最终 userData ⇒ dev/release 互斥）
import {
  resolveProfile,
  acquireInstanceLock,
  heartbeatInstanceLock,
  releaseInstanceLock,
  requestFocus,
  consumeFocusRequest,
  appendYieldLog,
  INSTANCE_HEARTBEAT_MS,
} from './instance-guard';
import { deviceClient, peerJobManager } from './client-tools/deviceClient';
import { getAppIcon, logIconStatus } from './icon';

// CommonJS 下 __dirname 已有,这里只是为了类型注释
// const __filename = fileURLToPath(import.meta.url); // ESM 模式才需要
// const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

// ─────────────────────────────────────────────────────────────────────
// 原生标题栏配色（2026-10-27 · gaga 要求「标题栏和下面的背景统一，都用黑底」）
//
// 背景：`BrowserWindow` 的 `backgroundColor: '#000000'` 只管**内容区**；
// 顶部那条标题栏是 **Windows 自己画的**（原生 frame）⇒ 跟随系统浅色主题
// ⇒ PC 端出现「白标题栏 + 黑内容区」的割裂（gaga 截图反馈）。
//
// 做法：`nativeTheme.themeSource = 'dark'` ⇒ Windows 按暗色画原生标题栏，
// 底色变深，跟内容区的黑底观感统一。**零布局改动。**
// 放在 module level（早于 `app.whenReady()` / 窗口创建）⇒ 窗口一建出来就是暗色，
// 不会出现「先亮后暗」的闪烁。
//
// 为什么不用 `titleBarStyle: 'hidden'` + `titleBarOverlay`（那才是**纯黑无缝**，
// 但代价大得多）：
//   ① 隐藏标题栏后 web 内容会顶到窗口最上沿 ⇒ 页面顶部会被系统窗口按钮
//      **压住**（例如「知识库」页右上角的搜索 / 刷新图标）⇒ 必须全局加顶部留白；
//   ② 本仓浏览器页用 `BrowserView` 铺满 content area（`setBrowserTabBounds`
//      里 `getContentBounds()`），隐藏标题栏后 content area = 整个窗口
//      ⇒ BrowserView 会**盖住**右上角的窗口按钮 ⇒ 还得同步改它的 setBounds；
//   ③ 那条区域还得自己标 `-webkit-app-region: drag` 才能拖动窗口。
// ⇒ 先走 themeSource 这条零布局改动的路；要「纯黑无缝」再上 hidden 方案。
//
// 副作用检查：本仓 `index.html` 已是 `<html class="dark">`、`globals.css` 已声明
// `color-scheme: dark`、Tailwind 用 `darkMode: ["class"]` 且**没有**
// `prefers-color-scheme` 媒体查询 ⇒ 强制 dark 主题不改变任何现有渲染。
//
// ⚠️ 验证方式：**以 gaga 肉眼确认为准**。此前用 PowerShell `Graphics.CopyFromScreen`
//    取样标题栏像素得到 R245-250，据此判「themeSource 无效」是**取样方法本身不可靠**
//    （抓到了被遮挡区域 / 未重绘窗口）—— gaga 肉眼确认标题栏已变深色。
//    ⇒ 原生 frame 的颜色**不要**拿屏幕像素取样当证据。
nativeTheme.themeSource = 'dark';

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
//
// ★★ [2026-11-18 · T-038 方案 A] **内建锁不能依赖** —— 它的锁键 = **调用那一刻的 userData 路径**，
//   而本仓把 userData 改到 `%APPDATA%\Gacode` 是在 **whenReady 里**做的 ⇒ 锁在改路径之前就拿好了
//   ⇒ 锁键 = **默认** userData（装好版与 dev 同为 `%APPDATA%\gacode-electron`，探针实测）。
//
//   实测（2026-11-18）：
//   · 装好版 v0.7.33 在跑时，用**旧代码**起 dev ⇒ 被内建锁挡住（"Another instance is already running"）；
//   · 但 11-17 当天 **dev(18:47) 与装好版(22:48) 同时在跑**，且两者后来共用同一份
//     `%APPDATA%\Gacode`（同一登录态 / 同一 device id / 同一审计文件）
//     ⇒ **内建锁那次没拦住**（具体触发条件未复现，与 dev 的启动方式有关）。
//
//   ⇒ 结论：**不能依赖内建锁**。必须有自己的、带身份的锁，且 **userData 必须在拿锁之前定下来**
//   ⇒ 锁键 = 最终身份（`electron/instance-guard.ts`）：
//     · 默认 profile ⇒ dev 与装好版 **共用一把** ⇒ 结构上不可能并存 ⇒ 不可能抢结算；
//     · `GACODE_INSTANCE_PROFILE=<name>` ⇒ userData / 锁 / device id 全独立（要重登）⇒ 可合法并存。
// =========================================================================
const INSTANCE_PROFILE = process.env.GACODE_INSTANCE_PROFILE || '';
const INSTANCE_ID = crypto.randomUUID();
const instanceProfile = resolveProfile(app.getPath('appData'), INSTANCE_PROFILE);

// ★ [T-038] **userData 必须在拿锁之前定下来** ——
//   Electron 内建锁（`requestSingleInstanceLock`）的锁键 = **调用那一刻的 userData 路径**
//   （探针实测：先 setPath 再拿锁 ⇒ 键随 setPath 变；反过来 ⇒ 是默认路径 `%APPDATA%\gacode-electron`）。
//   之前 userData 是在 whenReady 里才 setPath 的 ⇒ 锁键与真实身份**不同源** ⇒ 不能拿它当执行器身份。
//   ⇒ 现在：**先 setPath，再拿锁** ⇒ 锁键 = 最终 userData ⇒ 身份与锁永远同源。
//   ⚠️ 实测：Electron 32 在 ready 前 `app.setPath('userData', …)` 生效（探针脚本已验）。
try {
  app.setPath('userData', instanceProfile.userDataDir);
  console.log(`[gacode-electron] userData = ${instanceProfile.userDataDir}`);
} catch (err) {
  console.warn('[gacode-electron] setPath userData failed', err);
}

const guardResult = acquireInstanceLock(instanceProfile.lockFile, { instanceId: INSTANCE_ID });
if (!guardResult.ok) {
  // ⇒ 有一个**活着**的实例已经占着这个执行器身份 ⇒ 本实例让位。
  //   动作：① 通知它把窗口拉到前台；② 自己退出（**不接管设备通道**）。
  console.log(
    '[gacode-electron] 已有实例在执行端侧任务（pid=%d, since=%s）⇒ 本实例让位并退出',
    guardResult.owner.pid,
    new Date(guardResult.owner.startedAt).toISOString(),
  );
  appendYieldLog(
    instanceProfile.userDataDir,
    `让位退出：已有实例 pid=${guardResult.owner.pid} 存活（instanceId=${guardResult.owner.instanceId}）`,
  );
  requestFocus(instanceProfile.focusRequestFile, { fromPid: process.pid });
  app.quit();
  process.exit(0);
} else {
  console.log(
    '[gacode-electron] 实例锁已获取：%s（profile=%s）',
    instanceProfile.lockFile,
    INSTANCE_PROFILE || 'default',
  );
}

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
//
// ★ [2026-11-17 · T-027-d0ck] 所有 view 动作收进 `browser-views.ts` 的
//   `BrowserViewPool`（生命周期唯一出口）⇒ 将来迁 `WebContentsView` 只改那一个文件。
// =========================================================================

function focusExistingTab(window: BrowserWindow, tabId: string): boolean {
  return browserPool.focus(tabId);
}

function relayoutBrowserTabs(window: BrowserWindow): void {
  browserPool.relayout();
}

let mainWindow: BrowserWindow | null = null;

/**
 * ★ [2026-11-17 · T-027-d0ck] 池的宿主适配器。
 *
 * ⚠️ 主进程是**单实例单窗口**（`createWindow` 只跑一次）⇒ 这里的 `mainWindow`
 *    引用是稳定的；但仍然写成**惰性**的（方法体里才读）⇒ 窗口还没建时也不炸。
 */
const browserViewHost = {
  isDestroyed: (): boolean => !mainWindow || mainWindow.isDestroyed(),
  addBrowserView: (view: BrowserView): void => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.addBrowserView(view);
  },
  removeBrowserView: (view: BrowserView): void => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.removeBrowserView(view);
  },
  setTopBrowserView: (view: BrowserView): void => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setTopBrowserView(view);
  },
  getContentBounds: (): { width: number; height: number } =>
    mainWindow && !mainWindow.isDestroyed()
      ? mainWindow.getContentBounds()
      : { width: 0, height: 0 },
};

const browserPool = new BrowserViewPool(browserViewHost);

// 标记"用户主动退出" —— 托盘菜单"退出"会触发 app.quit() → before-quit
// 设这个 flag,让 BrowserWindow 的 close 事件不再被劫持,真正销毁 → app 退出。
// 否则 close = 隐藏到托盘。
let isQuiting = false;

function createWindow(): void {
  // 应用图标 —— **窗口必须自带 icon**（gaga 2026-10-27 截图反馈）。
  // 不传时 Windows 任务栏 hover 预览卡片左上角的小方块会退化到 exe 自带图标，
  // dev 模式跑的是 electron.exe ⇒ 显示 Electron 原子图标（实测 WM_GETICON 返回 null）。
  // 解析逻辑见 electron/icon.ts（dev 走仓内 build/，打包态走 process.resourcesPath）。
  // 图标拿不到时**不传 icon**（保留原有行为），不让 app 起不来。
  const appIcon = getAppIcon();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Gacode',
    ...(appIcon.isEmpty() ? {} : { icon: appIcon }),
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

  // [P3/P4 · 2026-11-12] 端侧执行 —— 记下主窗口, 派单到达时用它通知渲染层。
  setClientToolWindow(mainWindow);

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
    browserPool.destroyAll();
    mainWindow = null;
  });
}

// =========================================================================
// 阶段 4 — IPC handlers (BrowserView + taskbar progress)
// =========================================================================

// =========================================================================
// ★ [批 G19 · 2026-11-12] 清内嵌浏览器缓存
//
//   为什么必须在这里:
//     缓存属于 Chromium 的 **session**。渲染层拿不到 session 对象 ——
//     <webview> 标签**没有** clearCache 方法 (实测 typeof wv.clearCache ===
//     "undefined", 直接调会 TypeError) ⇒ 只能主进程来清。
//
//   清什么:
//     · HTTP 缓存 (页面显示不正常 / 图片不更新 / 改版后样式没变)
//     · DNS 主机解析缓存
//   不清什么:
//     · cookie / localStorage —— 那是各站点的登录态, 清了用户得重新登录。
// =========================================================================
function registerBrowserCacheIpc(): void {
  ipcMain.handle(
    'gacode:clear-browser-cache',
    async (): Promise<{ ok: boolean; error?: string }> => {
      try {
        const ses = session.defaultSession;
        await ses.clearCache();
        // DNS 解析缓存也顺手清一下 (有的站点换了 IP 但本机还拿着旧的)。
        try {
          await ses.clearHostResolverCache();
        } catch {
          /* 老版本 Electron 没这个方法 ⇒ 忽略 */
        }
        console.log('[gacode-electron] Browser cache cleared');
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[gacode-electron] clearBrowserCache failed', err);
        return { ok: false, error: msg };
      }
    },
  );
  console.log('[gacode-electron] Browser cache IPC handler registered');
}

/**
 * ★ [2026-11-15 · 订正 31 · M0] 开 tab 的**唯一实现**。
 *
 * 渲染层 `gacode:open-browser-tab` 与端侧工具 `pc_browser_open` 都调它
 * ⇒ 用户和 agent **共用同一个 BrowserView 池**（PM 拍板）。
 *
 * 返回值多加一个 `title` —— ⚠️ **向后兼容**：渲染层 / preload 只读 `tabId`，
 * 多一个字段不影响任何现有调用方。agent 侧需要 title 回报给模型。
 */
async function openBrowserTab(
  target: string,
  opts?: { origin?: TabOrigin; sessionId?: string | null },
): Promise<{ tabId: string; title: string }> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('mainWindow not ready');
  }
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
  const origin: TabOrigin = opts?.origin ?? 'renderer';
  browserPool.add(tabId, view, {
    url: target,
    origin,
    sessionId: opts?.sessionId ?? null,
  });
  // ★ [2026-11-17 · T-027-d0ck] 停靠到**渲染层上报的内容区矩形**
  //   （还没上报过 ⇒ 池里兜底成整个内容区 ⇒ 至少不是 0×0）。
  browserPool.dock(tabId);
  console.log(
    `[gacode-electron] BrowserView opened: tabId=${tabId} url=${target} origin=${origin}`,
  );
  // tab 内 content 销毁时反向通知渲染层 (窗口关闭 / 外链 replace 等)
  // ★ 从池里摘掉这一条 ⇒ agent 下次按 url 找不到活 tab ⇒ 自己再开一个
  //   （PM 2026-11-15：「他发现关闭了，他自己再起来就行了」）。
  view.webContents.on('destroyed', () => {
    const entry = browserPool.get(tabId);
    if (entry) {
      try {
        mainWindow?.removeBrowserView(entry.view);
      } catch {
        /* ignore */
      }
      // ⚠️ 只摘条目，不再 destroy（webContents 自己已经死了 ⇒ 再 destroy 会抛）
      browserPool.forget(tabId);
      // ★ M1：tab 没了 ⇒ 它那份元素编号表也作废（M2 act 引用 ⇒ stale_element_ref）
      clearElementIndex(tabId);
      // ★ [T-028] 截图元信息同理作废（@shot: 换算会用到）
      clearShotMeta(tabId);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('gacode:browser-tab-closed', { tabId });
    }
  });
  let title = '';
  try {
    title = view.webContents.getTitle() || '';
  } catch {
    /* webContents 刚好销毁 ⇒ 空标题，不让它把整次 open 弄失败 */
  }
  // ★ [2026-11-17 · T-027-d0ck] 通知渲染层"多了一个 tab"⇒ 用户在 `/browser` 页
  //   的 tab 条上能看见 agent 开的这个（用户看得见 agent 开了什么，PM 拍板）。
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('gacode:browser-tab-opened', {
      tabId,
      url: target,
      title,
      origin,
    });
  }
  return { tabId, title };
}

function registerBrowserTabIpc(): void {
  // 开一个新 tab → 返 { tabId, title }
  ipcMain.handle(
    'gacode:open-browser-tab',
    async (_event, args: { url: string }): Promise<{ tabId: string; title: string }> =>
      openBrowserTab(args?.url || 'about:blank'),
  );

  ipcMain.on(
    'gacode:close-browser-tab',
    (_event, args: { tabId: string }) => {
      const tab = browserPool.get(args?.tabId);
      if (!tab) return;
      // ★ 走池的唯一出口（removeBrowserView + destroy + 摘条目）
      browserPool.destroy(args.tabId);
      // ★ M1：手动关 tab 也作废编号表（destroyed 回调可能来不及带 tabId）
      clearElementIndex(args.tabId);
      // ★ [T-028] 截图元信息同理作废
      clearShotMeta(args.tabId);
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

  // ★ [2026-11-17 · T-027-d0ck] 渲染层上报「内容区矩形」。
  //   主进程对 React 侧栏（256px）/ tab 条 / 地址栏**完全无感知** ⇒ 只拿得到
  //   裸窗口矩形 ⇒ 一开就盖满整个窗口。⇒ 由 `/browser` 页的内容区自己报。
  ipcMain.on(
    'gacode:report-browser-rect',
    (_event, args: { rect: unknown }) => {
      // ⛔ `rect = null` = 渲染层说「现在没有浏览器区」（用户离开了 `/browser` 页）
      //   ⇒ 把 agent 的 view 停泊（移出可视区）⇒ 绝不盖住客户端其它页面。
      if (args?.rect === null || args?.rect === undefined) {
        browserPool.setContentRect(null);
        return;
      }
      const rect = normalizeDockRect(args?.rect);
      // ⛔ 不合法 ⇒ 如实忽略（不猜默认值）—— 池会继续用上一个合法矩形。
      if (!rect) {
        console.warn('[gacode-electron] report-browser-rect: 矩形不合法，已忽略');
        return;
      }
      browserPool.setContentRect(rect);
    },
  );

  // ★ [2026-11-17 · T-027-d0ck] 渲染层问「现在有哪些 BrowserView tab」
  //   （用户切走 `/browser` 再回来时对账用）。
  ipcMain.handle(
    'gacode:list-browser-tabs',
    () => browserPool.list(),
  );

  // ★ [2026-11-17 · T-027-d0ck] 渲染层切 tab ⇒ 主进程知道谁是 active
  //   （agent 的兜底要读它 ⇒ 见 `browser.ts` 的 `resolveLiveTab`）。
  //   ⛔ `tabId = null` ⇒ 用户切回了自己的 `<webview>` tab ⇒ 把 agent 的 view
  //      **停泊**（移出可视区但**不缩尺寸**）⇒ 用户看得见自己的页面。
  ipcMain.on(
    'gacode:set-browser-active-tab',
    (_event, args: { tabId: string | null }) => {
      const tabId = args?.tabId ?? null;
      if (!tabId) {
        browserPool.parkAll();
        browserPool.setActiveTab(null);
        return;
      }
      browserPool.focus(tabId);
    },
  );

  // ★ [2026-11-15 · 订正 31 · M0] 把**同一个** tab 池注给端侧执行器。
  //   entries() 直接给池（不是快照）⇒ 用户关 tab 后池里自动少一条，
  //   agent 按 url 找不到 ⇒ 自己重建（共用、可接管、不另起窗口）。
  setBrowserTabPool({
    open: (url: string, opts?: { origin?: TabOrigin; sessionId?: string | null }) =>
      openBrowserTab(url, opts),
    entries: () => browserPool.entries(),
    titleOf: (tabId) => {
      const entry = browserPool.get(tabId);
      if (!entry || entry.view.webContents.isDestroyed()) return '';
      try { return entry.view.webContents.getTitle() || ''; } catch { return ''; }
    },
    // ★ [2026-11-17 · T-027-d0ck] 复用分支也要让**用户看得见**（聚焦那个 tab）
    focus: (tabId) => browserPool.focus(tabId),
    // ★ [2026-11-17 · T-027-d0ck] agent 写操作前调用（停靠 + 置顶 + 聚焦）
    activate: (tabId) => browserPool.activate(tabId),
    // ★ [T-054] 截**视口** ⇒ PNG（物理像素 = CSS px × devicePixelRatio）
    //   ⚠️ 原实现直接 `capturePage()`：tab 被停泊（用户不在浏览器页）时
    //      `focus()` 只置顶 + focus（渲染层矩形可能没报上来 ⇒ 没 dock），
    //      页面没真正绘制 ⇒ capturePage() 返回 0×0 ⇒ pc_browser_shot 误报
    //      「标签页不可见」，focus→retry 仍然失败（Cody 实测）。
    //   ⇒ 截图前**强制激活**：dock（有矩形时）+ 置顶 + focus + 等两帧绘制。
    //     即使渲染层没报矩形（dock 不了），`setTopBrowserView` + `webContents.focus`
    //     也足以让 capturePage 拿到真实像素。
    capture: async (tabId) => {
      const entry = browserPool.get(tabId);
      if (!entry || entry.view.webContents.isDestroyed()) {
        throw new Error(`tab ${tabId} 已关闭`);
      }
      // ★ T-054：截图前强制激活（不依赖用户先在 UI 上点 tab）
      try { browserPool.activate(tabId); } catch { /* ignore */ }
      try {
        if (!mainWindow?.isDestroyed()) mainWindow?.setTopBrowserView(entry.view);
      } catch { /* ignore */ }
      try { entry.view.webContents.focus?.(); } catch { /* ignore */ }
      // 等两帧（rAF 通常 16ms/帧 ⇒ 32ms 足够页面把首帧画出来）
      await new Promise((r) => setTimeout(r, 64));

      const img = await entry.view.webContents.capturePage();
      let size = img.getSize();
      if (!size.width || !size.height) {
        // ★ T-054 兜底：先重新 dock + 再等一帧，再试一次（偶发的「刚 focus 还没完成首帧」）
        try { browserPool.focus(tabId); } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, 120));
        const retry = await entry.view.webContents.capturePage();
        size = retry.getSize();
        if (size.width && size.height) {
          return { png: retry.toPNG(), width: size.width, height: size.height };
        }
      }
      if (!size.width || !size.height) {
        return { png: Buffer.alloc(0), width: 0, height: 0 };
      }
      return { png: img.toPNG(), width: size.width, height: size.height };
    },
    // ★ [2026-11-17 · T-027-d0ck] 关标签（agent 收尾用）
    close: (tabId) => {
      const ok = browserPool.destroy(tabId);
      if (ok) clearElementIndex(tabId);
      return ok;
    },
    // 当前 active 的 tab（渲染层切 tab 时更新）
    activeTabId: () => browserPool.getActiveTabId(),
    // ★ [T-060] 浏览器截图/操作前：把最小化的 Gacode 主窗口拉到前台
    bringToFront: () => {
      if (!mainWindow || mainWindow.isDestroyed()) return false;
      try {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        return true;
      } catch { return false; }
    },
    // ★ [T-060] 浏览器工具用完后：最小化回后台（不影响用户其他窗口）
    minimize: () => {
      if (!mainWindow || mainWindow.isDestroyed()) return false;
      try { mainWindow.minimize(); return true; } catch { return false; }
    },
    // M1：跑本模块生成的**固定只读脚本**（⛔ 模型参数不进 JS）
    evalInTab: async (tabId, script) => {
      const entry = browserPool.get(tabId);
      if (!entry || entry.view.webContents.isDestroyed()) {
        throw new Error(`tab ${tabId} 已关闭`);
      }
      return entry.view.webContents.executeJavaScript(script);
    },
    // ★ M2：注入真实输入事件（trusted —— `sendInputEvent`，跟真人操作同级）
    //   ⚠️ `BrowserInputEvent` 是白名单形状；`sendInputEvent` 接受 Electron 的
    //      InputEvent 联合 —— TS 判别不了自定义 union ⇒ 断言（字段已在 browser.ts 校验过）。
    //   ⚠️ 必须先把它 setTopBrowserView + focus —— 否则 click 事件被发给后台的 view，丢不掉。
    input: (tabId, ev) => {
      const entry = browserPool.get(tabId);
      if (!entry || entry.view.webContents.isDestroyed()) return;
      try {
        // 点击/滚轮/按键盘前确保这个 view 是顶层可交互的（setTopBrowserView 不够 —— 还要 focus）
        if (ev.type === 'mouseMove' || ev.type === 'mouseDown' || ev.type === 'mouseWheel') {
          mainWindow?.setTopBrowserView(entry.view);
          entry.view.webContents.focus();
        }
        entry.view.webContents.sendInputEvent(ev as Parameters<typeof entry.view.webContents.sendInputEvent>[0]);
      } catch (e) {
        console.warn('[gacode-electron] sendInputEvent failed:', e && (e as Error).message);
      }
    },
  });

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
// C4-09 — 窗口焦点状态 IPC
//
// renderer 判断「要不要弹系统通知」时需要知道窗口是不是在前台。
// ⚠️ **不要**用 renderer 的 `document.hidden` / `document.visibilityState` ——
//    Electron 窗口最小化时 visibilityState 仍可能是 "visible" ⇒ 判断不准。
//    主进程这边才是真值: `!isMinimized() && isFocused()`。
//
// 读法: renderer `window.gacode.isWindowFocused()` (preload 走
// `ipcRenderer.invoke('gacode:is-focused')`)。
// =========================================================================

function registerWindowStateIpc(): void {
  ipcMain.handle('gacode:is-focused', (): boolean => {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    try {
      return !mainWindow.isMinimized() && mainWindow.isFocused();
    } catch (err) {
      console.warn('[gacode-electron] is-focused failed', err);
      return false;
    }
  });
  console.log('[gacode-electron] Window state IPC handler registered');
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
// 阶段 7 — Browser bookmarks IPC handlers
//
// 文件路径: %APPDATA%/Gacode/bookmarks.json
// 文件格式: { bookmarks: BookmarkEntry[] }
// 权限: 0600 (Windows 下 fs.chmod 不强制, 但调一下无害)
// 失败策略: read/write 全部 try/catch, IPC 失败返空数组. 主进程不抛异常
//          给渲染层. 跟 refresh-token.json 一样的兜底风格.
//
// id 生成: `bm-${Date.now()}-${random4bytes}` —— 跟 Android 端 BookmarkEntity
//          primary key 风格一致 (递增 + 随机后缀).
// 唯一性: 按 url 去重 (重复 add 同一 url → 不存第二条, 保留最早那条).
// =========================================================================

interface BookmarkFile {
  bookmarks: Array<{
    id: string;
    url: string;
    title: string;
    createdAt: string;
  }>;
}

function getBookmarksFilePath(): string {
  return path.join(app.getPath('userData'), 'bookmarks.json');
}

function readBookmarksFile(): BookmarkFile {
  const fp = getBookmarksFilePath();
  const empty: BookmarkFile = { bookmarks: [] };
  try {
    if (!fs.existsSync(fp)) return empty;
    const raw = fs.readFileSync(fp, 'utf8');
    const parsed = JSON.parse(raw) as Partial<BookmarkFile>;
    if (!parsed || !Array.isArray(parsed.bookmarks)) return empty;
    const items = parsed.bookmarks.filter(
      (b) =>
        b &&
        typeof b.id === 'string' &&
        typeof b.url === 'string' &&
        typeof b.title === 'string' &&
        b.url.length > 0,
    );
    return { bookmarks: items };
  } catch (err) {
    console.warn('[gacode-electron] readBookmarksFile failed', err);
    return empty;
  }
}

function writeBookmarksFile(file: BookmarkFile): void {
  const fp = getBookmarksFilePath();
  try {
    const dir = path.dirname(fp);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fp, JSON.stringify(file), 'utf8');
    try {
      fs.chmodSync(fp, 0o600);
    } catch {
      /* ignore on Windows */
    }
  } catch (err) {
    console.warn('[gacode-electron] writeBookmarksFile failed', err);
    throw err;
  }
}

function registerBookmarksIpc(): void {
  ipcMain.handle(
    'gacode:bookmarks-read',
    async (): Promise<Array<{ id: string; url: string; title: string; createdAt: string }>> => {
      return readBookmarksFile().bookmarks;
    },
  );

  ipcMain.handle(
    'gacode:bookmarks-add',
    async (
      _event,
      args: { url?: string; title?: string },
    ): Promise<Array<{ id: string; url: string; title: string; createdAt: string }>> => {
      const url = typeof args?.url === 'string' ? args.url.trim() : '';
      const title = typeof args?.title === 'string' ? args.title.trim() : '';
      if (!url) return readBookmarksFile().bookmarks;
      const cur = readBookmarksFile().bookmarks;
      if (cur.some((b) => b.url === url)) {
        return cur;
      }
      const id = `bm-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const entry = { id, url, title: title || url, createdAt: new Date().toISOString() };
      const next = [entry, ...cur];
      writeBookmarksFile({ bookmarks: next });
      console.log(`[gacode-electron] Bookmark added: ${url} (total=${next.length})`);
      return next;
    },
  );

  ipcMain.handle(
    'gacode:bookmarks-remove',
    async (
      _event,
      args: { idOrUrl?: string },
    ): Promise<Array<{ id: string; url: string; title: string; createdAt: string }>> => {
      const key = typeof args?.idOrUrl === 'string' ? args.idOrUrl.trim() : '';
      if (!key) return readBookmarksFile().bookmarks;
      const cur = readBookmarksFile().bookmarks;
      const next = cur.filter((b) => b.id !== key && b.url !== key);
      if (next.length === cur.length) return cur;
      writeBookmarksFile({ bookmarks: next });
      console.log(`[gacode-electron] Bookmark removed: ${key} (total=${next.length})`);
      return next;
    },
  );

  console.log('[gacode-electron] Bookmarks IPC handlers registered');
}

// =========================================================================
// 阶段 7 — openWithSystem IPC handler
//
// filePath: shell.openPath(filePath) — Windows 上按 .pdf / .docx / 图片 /
//           视频 后缀自动调默认应用 (Edge / Word / Photos / Movies...)
//           返非空字符串 = 错误消息, 空字符串 = 成功.
// url:      shell.openExternal(url) — 走系统默认浏览器 (Edge / Chrome 等).
//           注释: shell.openExternal 也会调注册过的 custom protocol;
//           gacode:// 唤起会被 first-instance 的 second-instance 监听
//           截获. HTTP(S) URL 则由系统默认浏览器接管.
//
// 失败策略: 不抛异常给渲染层, 返 { ok: false, error: msg }. 渲染层 toast.
// =========================================================================

function registerOpenWithSystemIpc(): void {
  ipcMain.handle(
    'gacode:open-with-system',
    async (
      _event,
      args: { url?: string; filePath?: string },
    ): Promise<{ ok: boolean; error?: string }> => {
      try {
        if (args?.filePath && typeof args.filePath === 'string') {
          const fp = args.filePath.trim();
          if (!fp) return { ok: false, error: 'filePath empty' };
          if (!fs.existsSync(fp)) {
            return { ok: false, error: `file not found: ${fp}` };
          }
          const result = await shell.openPath(fp);
          if (result) {
            console.warn(`[gacode-electron] shell.openPath failed: ${result}`);
            return { ok: false, error: result };
          }
          return { ok: true };
        }
        if (args?.url && typeof args.url === 'string') {
          const u = args.url.trim();
          if (!u) return { ok: false, error: 'url empty' };
          // 仅允许 http(s); 其它 (file:// / gacode:// / javascript:) 拦截,
          // 避免 shell.openExternal 触发非预期行为
          if (!/^https?:\/\//i.test(u)) {
            return { ok: false, error: `unsupported protocol: ${u}` };
          }
          await shell.openExternal(u);
          return { ok: true };
        }
        return { ok: false, error: 'missing url or filePath' };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[gacode-electron] openWithSystem error', err);
        return { ok: false, error: msg };
      }
    },
  );
  console.log('[gacode-electron] openWithSystem IPC handler registered');
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
  // ★ [T-038] **userData 已在 module level（拿锁之前）setPath 好了** ⇒ 这里不再重复设，
  //   保证「锁键」与「实际 userData」永远同源（单一真源 = instanceProfile.userDataDir）。
  console.log(`[gacode-electron] userData 生效 = ${app.getPath('userData')}`);

  // ★ [2026-11-18 · T-038 方案 A] **实例心跳 + 聚焦请求消费**。
  //   ① 每 30s 续一次锁 ⇒ 崩溃残留的锁会被下一个实例判死并接管；
  //   ② 后启动者让位时会写「聚焦请求」⇒ 这里把它拉起来。
  const instanceTimer = setInterval(() => {
    const alive = heartbeatInstanceLock(instanceProfile.lockFile, INSTANCE_ID);
    if (!alive) {
      console.warn('[gacode-electron] 实例锁已不属于本进程（被接管？）⇒ 交还执行权');
      try { deviceClient.disconnect(); } catch { /* ignore */ }
      return;
    }
    if (consumeFocusRequest(instanceProfile.focusRequestFile)) {
      console.log('[gacode-electron] 收到让位请求 ⇒ 把窗口拉到前台');
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    }
  }, INSTANCE_HEARTBEAT_MS);
  try { (instanceTimer as any).unref?.(); } catch { /* ignore */ }

  // ★ [T-038] 退出时**交还锁 + 断开设备通道** ⇒
  //   ① 下一个实例能干净接管（不会看到「幽灵 owner」）；
  //   ② 服务端能立刻知道本机离线（不留残余 SSE 连接）。
  app.on('will-quit', () => {
    try { deviceClient.disconnect(); } catch { /* ignore */ }
    // ★ [T-068] 关掉 peer inbox（删 key 文件）并清掉后台 job 的 timer。
    try { peerJobManager.stop(); } catch { /* ignore */ }
    try { releaseInstanceLock(instanceProfile.lockFile, INSTANCE_ID); } catch { /* ignore */ }
  });

  // 图标状态日志（PM 靠这行验证窗口 / 托盘图标，不靠截图）
  logIconStatus();

  createWindow();
  createAppMenu(() => mainWindow);
  createTray(() => mainWindow);
  registerNotificationIpc(() => mainWindow);
  // ★ [T-044] 渲染层诊断日志通道.
  registerDiagIpc();
  registerBrowserTabIpc();
  registerBrowserCacheIpc();
  registerTaskbarProgressIpc();
  registerWindowStateIpc();
  registerAuthStorageIpc();
  registerBookmarksIpc();
  registerOpenWithSystemIpc();
  // ★ [P3/P4 · 2026-11-12] 端侧执行 (`pc_*`) —— 执行 / 闸门 / 审计 / 设备通道。
  //   ⚠️ 必须在 app.whenReady() 之后 (要用 app.getPath('userData'))。
  registerClientToolIpc();

  // 0.7.5 global-11: electron-updater 自动更新 — 配置 OK, build 跑通但不
  // 实际触发 (publish 配置 github 但 gagaOS 拍 push 时再 git push + tag).
  // autoUpdater 在 dev 模式调 checkForUpdates 会 warn 但不报错.
  try {
    // dynamic import — electron-updater 是 CommonJS 包, esbuild 默认走 require
    const { autoUpdater } = require('electron-updater') as {
      autoUpdater: {
        autoDownload?: boolean;
        checkForUpdates: () => Promise<unknown> | unknown;
        on: (event: string, cb: (...args: unknown[]) => void) => void;
        logger?: { info?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void; error?: (...args: unknown[]) => void };
      };
    };
    // 不主动下载 — 等 gagaOS 拍 push + release 后才会真有更新
    if (autoUpdater.autoDownload !== undefined) {
      autoUpdater.autoDownload = false;
    }
    autoUpdater.on('error', (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[gacode-electron] autoUpdater error: ${msg}`);
    });
    autoUpdater.on('checking-for-update', () => {
      console.log('[gacode-electron] autoUpdater: checking-for-update');
    });
    autoUpdater.on('update-available', (info: unknown) => {
      console.log('[gacode-electron] autoUpdater: update-available', info);
    });
    autoUpdater.on('update-not-available', () => {
      console.log('[gacode-electron] autoUpdater: no update available');
    });
    // 调一次 (失败只 warn, 不抛) — dev 模式跑也会触发一次 HEAD 给 GitHub.
    const result = autoUpdater.checkForUpdates();
    if (result && typeof (result as { catch?: unknown }).catch === 'function') {
      (result as Promise<unknown>).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[gacode-electron] autoUpdater.checkForUpdates failed: ${msg}`);
      });
    }
    console.log('[gacode-electron] autoUpdater wired (publish=github gagaliu02-png/gacode-electron)');
  } catch (err) {
    // electron-updater 没装 / 加载失败 — build 仍能跑, 只是不查更新
    console.warn('[gacode-electron] autoUpdater init failed (build still OK):', err);
  }

  // ★ [2026-11-15 · 订正 31 · M0] 真机 E2E 钩子（只用于本地验收，生产不设这个环境变量）。
  //
  //   ⚠️ 走**端侧执行器的真实路径** `executeClientTool('pc_browser_open', ...)`
  //      （不是直接调 openBrowserTab）⇒ 验的是 spec → executor → browser.ts → tab 池
  //      这一整条，跟设备通道派单下来时走的是同一个函数。
  //   ⚠️ 用本地 URL（file 协议会被 browser.ts 硬拒）⇒ 起一个最小 data server 见
  //      test/e2e-browser-open.mjs；结果打 stdout，然后 app.quit()。
  const e2eBrowserUrl = process.env.GACODE_E2E_BROWSER_OPEN || null;
  if (e2eBrowserUrl && mainWindow) {
    mainWindow.webContents.once('did-finish-load', async () => {
      try {
        const r = await executeClientTool('pc_browser_open', { url: e2eBrowserUrl }, null, 30000);
        console.log('[e2e:pc_browser_open] ' + JSON.stringify(r));
        // ★ 同一个 url 再开一次 ⇒ 应该**复用**用户/agent 已开的那个 tab
        //   （PM 拍板「用户和 agent 共用」；真机验「不另起一个」）。
        const r2 = await executeClientTool('pc_browser_open', { url: e2eBrowserUrl }, null, 30000);
        console.log('[e2e:pc_browser_open:reuse] ' + JSON.stringify(r2));
        // ★ M1：页面加载完，紧跟 snapshot ⇒ 真机验 executeJavaScript 抽 DOM
        const snap = await executeClientTool('pc_browser_snapshot', {}, null, 30000);
        console.log('[e2e:pc_browser_snapshot] ' + JSON.stringify(snap));
        // ★ M2：点击按钮（trusted）= 页面文字从 "M0 OK" 变 "BUTTON_CLICKED"
        //   再用 snapshot 验证文字变了 ⇒ 证明 sendInputEvent 真的点到了
        const act = await executeClientTool('pc_browser_act', { action: 'click', target: 'e2' }, null, 30000);
        // wait a tick for the click handler to run
        await new Promise((r) => setTimeout(r, 300));
        const snapAfter = await executeClientTool('pc_browser_snapshot', {}, null, 30000);
        console.log('[e2e:pc_browser_act] ' + JSON.stringify(act));
        console.log('[e2e:pc_browser_snapshot:after] ' + JSON.stringify(snapAfter));
      } catch (e) {
        console.error('[e2e:pc_browser_open] THREW ' + (e as Error).message);
      } finally {
        app.quit();
      }
    });
  }

  // ★ [2026-11-17 · T-027-d0ck] 真机 E2E 钩子 · 停靠（只用于本地验收，生产不设）。
  //
  //   验四件事：
  //   ① BrowserView 的 bounds **等于**上报的矩形（不是窗口全尺寸）
  //   ② guest 的 `innerWidth/innerHeight` = 矩形尺寸 ⇒ 视口就是这个矩形
  //   ③ **停泊（隐藏）后视口尺寸不变**（缩尺寸会让页面重排 ⇒ 铁律）
  //   ④ 停靠状态下 trusted click 仍然生效
  const e2eDockUrl = process.env.GACODE_E2E_BROWSER_DOCK || null;
  if (e2eDockUrl && mainWindow) {
    mainWindow.webContents.once('did-finish-load', async () => {
      const DOCK_RECT = { x: 256, y: 96, width: 900, height: 600 };
      try {
        const opened = await executeClientTool('pc_browser_open', { url: e2eDockUrl }, null, 30000);
        console.log('[e2e:dock:open] ' + JSON.stringify(opened));
        const tabId = (() => {
          try { return JSON.parse(String(opened.stdout || '')).tabId as string; } catch { return ''; }
        })();
        if (!tabId) throw new Error('open 没给出 tabId');

        // ① 渲染层上报内容区矩形（这里直接调池，验的是主进程这一半）
        browserPool.setContentRect(DOCK_RECT);
        browserPool.focus(tabId);
        // ⚠️ guest 的 innerWidth 是**异步**跟着 resize 更新的 ⇒ 读之前先等一拍
        //   （否则量到还没生效的旧值 0×0）。
        await new Promise((r) => setTimeout(r, 400));
        const entry = browserPool.get(tabId);
        const bounds = entry?.view?.getBounds?.() ?? null;
        console.log('[e2e:dock:bounds] ' + JSON.stringify(bounds));

        // ② 视口尺寸 = 矩形尺寸
        const vp = await entry?.view?.webContents?.executeJavaScript(
          'JSON.stringify({w: window.innerWidth, h: window.innerHeight})',
        );
        console.log('[e2e:dock:viewport] ' + String(vp));

        // ③ 停泊 ⇒ 视口尺寸不变
        browserPool.park(tabId);
        await new Promise((r) => setTimeout(r, 250));
        const vpParked = await entry?.view?.webContents?.executeJavaScript(
          'JSON.stringify({w: window.innerWidth, h: window.innerHeight})',
        );
        console.log('[e2e:dock:viewport:parked] ' + String(vpParked));

        // ④ 停靠回来 + trusted click 仍然生效
        browserPool.focus(tabId);
        await new Promise((r) => setTimeout(r, 250));
        const snap = await executeClientTool('pc_browser_snapshot', { tabId }, null, 30000);
        console.log('[e2e:dock:snapshot] ' + JSON.stringify(snap));
        const act = await executeClientTool(
          'pc_browser_act', { action: 'click', target: 'e2', tabId }, null, 30000,
        );
        await new Promise((r) => setTimeout(r, 300));
        const snapAfter = await executeClientTool('pc_browser_snapshot', { tabId }, null, 30000);
        console.log('[e2e:dock:act] ' + JSON.stringify(act));
        console.log('[e2e:dock:snapshot:after] ' + JSON.stringify(snapAfter));

        // ★ [T-028] 截图 ⇒ 真 PNG（物理像素 = 视口 × dpr）+ `@shot:` 按图上坐标点击
        const shot = await executeClientTool('pc_browser_shot', { tabId }, null, 30000);
        console.log('[e2e:dock:shot] ' + JSON.stringify(shot));
        const shotOut = (() => {
          try { return JSON.parse(String(shot.stdout || '')); } catch { return null; }
        })();
        const shotPath = (shot.artifacts && shot.artifacts[0] && shot.artifacts[0].path) || '';
        console.log('[e2e:dock:shot:path] ' + shotPath);
        console.log('[e2e:dock:shot:scale] ' + String(shotOut && shotOut.scale ? shotOut.scale : 1));
        console.log('[e2e:dock:shot:image] ' + JSON.stringify((shotOut && shotOut.image) || null));
        if (shotOut && shotOut.scale) {
          // 用「快照里第二个按钮的 viewport 坐标」换算成「截图里的像素坐标」
          const snap2 = await executeClientTool('pc_browser_snapshot', { tabId }, null, 30000);
          let target = null;
          try {
            const parsed = JSON.parse(String(snap2.stdout || ''));
            const el = (parsed.elements || []).find(
              (e: { text?: string; x?: number; y?: number }) => e.text === '第二个按钮',
            );
            if (el) target = `@shot:${Math.round(el.x * shotOut.scale)},${Math.round(el.y * shotOut.scale)}`;
          } catch { /* ignore */ }
          console.log('[e2e:dock:shot:target] ' + String(target));
          if (target) {
            const act2 = await executeClientTool(
              'pc_browser_act', { action: 'click', target, tabId }, null, 30000,
            );
            await new Promise((r) => setTimeout(r, 300));
            const snap3 = await executeClientTool('pc_browser_snapshot', { tabId }, null, 30000);
            console.log('[e2e:dock:act:shot] ' + JSON.stringify(act2));
            console.log('[e2e:dock:snapshot:after:shot] ' + JSON.stringify(snap3));
          }
        }

        // ⑤ 收尾两件套：focus / close
        const foc = await executeClientTool('pc_browser_focus', { tabId }, null, 15000);
        console.log('[e2e:dock:focus] ' + JSON.stringify(foc));
        const clo = await executeClientTool('pc_browser_close', { tabId }, null, 15000);
        console.log('[e2e:dock:close] ' + JSON.stringify(clo));
        console.log('[e2e:dock:alive] ' + String(browserPool.has(tabId)));
      } catch (e) {
        console.error('[e2e:dock] THREW ' + (e as Error).message);
      } finally {
        app.quit();
      }
    });
  }

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
