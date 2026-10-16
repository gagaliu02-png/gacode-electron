import { app, BrowserWindow, shell, Menu } from 'electron';
import * as path from 'path';
import { createTray } from './tray';
import { createAppMenu } from './menu';
import { registerNotificationIpc } from './notifications';

// CommonJS 下 __dirname 已有,这里只是为了类型注释
// const __filename = fileURLToPath(import.meta.url); // ESM 模式才需要
// const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

// 应用用户模型 ID - PR3 打包时 Windows Toast 会按这个名字显示
// PR1 暂未打包,先设上便于 dev 模式验证
if (process.platform === 'win32') {
  app.setAppUserModelId('com.gaga.gacode');
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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // contextIsolation 已开,sandbox 可关(关掉减少跨平台打包问题)
      webSecurity: true,
    },
  });

  // 加载 URL - dev 模式走本地 Next.js,prod 走生产
  const url = isDev
    ? 'http://localhost:3000/gacode/'
    : 'https://www.gaga.sale/gacode/';

  console.log(`[gacode-electron] Loading ${url} (dev=${isDev})`);
  mainWindow.loadURL(url);

  // 加载完成后再显示窗口,避免白屏闪烁
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    console.log('[gacode-electron] Window ready-to-show');
  });

  // 外部链接走系统默认浏览器,不挤在 Electron 窗口里
  mainWindow.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    if (openUrl.startsWith('http://') || openUrl.startsWith('https://')) {
      shell.openExternal(openUrl);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // 阻止 webContents 内导航到非预期 URL(防意外跳出)
  mainWindow.webContents.on('will-navigate', (event, navUrl) => {
    const allowedPrefixes = [
      'http://localhost:3000',
      'https://www.gaga.sale',
    ];
    if (!allowedPrefixes.some((prefix) => navUrl.startsWith(prefix))) {
      console.warn(`[gacode-electron] Blocked navigation to ${navUrl}`);
      event.preventDefault();
    }
  });

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
    mainWindow = null;
  });
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