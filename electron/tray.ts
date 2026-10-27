import { Tray, Menu, app, type BrowserWindow } from 'electron';
import { getTrayIcon, getTrayIconPath, iconCandidates } from './icon';

/**
 * 系统托盘。
 *
 * 图标: `build/icon-16.png`（**原生 16px 渲染的 cody** —— Windows 托盘槽就是
 * 16×16,直接用 16px 原图避免重采样糊)。之前这里是 `nativeImage.createEmpty()`
 * 空图占位 ⇒ 托盘槽空白；现在走 electron/icon.ts 的解析（dev 态仓内 build/,
 * 打包态 process.resourcesPath + electron-builder extraResources）。
 * 拿不到图时退回空图 + 告警日志 —— **图标加载失败绝不能让 app 起不来**。
 *
 * 设计约束:
 * 1. Windows 上 Tray 必须独立于 BrowserWindow 生命周期 —— close 按钮应该
 *    "隐藏到托盘",而不是真正退出 app,否则托盘没意义。
 *    由 main.ts 的 `close` 拦截 + `window-all-closed` 不 quit 实现。
 * 2. 托盘"退出"菜单项调用 `app.quit()`,会触发 `before-quit` 标志位,
 *    main.ts 看到标志位才允许 BrowserWindow 真关。
 */
export function createTray(getMainWindow: () => BrowserWindow | null): Tray {
  const icon = getTrayIcon();
  const iconPath = getTrayIconPath();
  if (!iconPath || icon.isEmpty()) {
    console.warn(
      `[gacode-electron] app icon NOT FOUND (candidates: ${iconCandidates('tray').join(' | ')}) [tray]`,
    );
  }
  const tray = new Tray(icon);

  tray.setToolTip('Gacode');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开 Gacode',
      click: () => {
        const win = getMainWindow();
        if (win) win.show();
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        // app.quit() 会触发 main.ts 的 before-quit 标志位,
        // 之后 BrowserWindow.close() 不会被劫持,真正销毁 → app 真退出
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);

  // Windows 上 click 通常就是"左键单击托盘图标"
  tray.on('click', () => {
    const win = getMainWindow();
    if (!win) return;
    if (win.isVisible() && !win.isMinimized()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });

  console.log(
    `[gacode-electron] Tray registered (icon=${iconPath ?? 'none'}, tooltip="Gacode")`,
  );
  return tray;
}