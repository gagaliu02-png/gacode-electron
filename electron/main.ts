import { app, BrowserWindow, shell } from 'electron';
import * as path from 'path';

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

  // 调试钩子:dev 模式下默认开 DevTools (PR1 验证用,PR3 打包前去掉)
  if (isDev) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 应用就绪后建窗口
app.whenReady().then(() => {
  createWindow();

  // macOS 兼容(虽然当前只 Win,但代码 ready)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时退出(Win + Linux);macOS 保留 dock
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});