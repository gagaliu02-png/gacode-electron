import { Tray, Menu, nativeImage, app, type BrowserWindow } from 'electron';

/**
 * 系统托盘。
 *
 * PR2 阶段 icon 用 nativeImage.createEmpty() 占位 —— 真 icon 由 PR3
 * electron-builder 打包时一并配齐(NSIS + 任务栏 / 托盘共用 .ico)。
 * 这里重点验证 Tray 注册、tooltip、右键菜单、click 显隐切换四个核心 API。
 *
 * 设计约束:
 * 1. Windows 上 Tray 必须独立于 BrowserWindow 生命周期 —— close 按钮应该
 *    "隐藏到托盘",而不是真正退出 app,否则托盘没意义。
 *    由 main.ts 的 `close` 拦截 + `window-all-closed` 不 quit 实现。
 * 2. 托盘"退出"菜单项调用 `app.quit()`,会触发 `before-quit` 标志位,
 *    main.ts 看到标志位才允许 BrowserWindow 真关。
 */
export function createTray(getMainWindow: () => BrowserWindow | null): Tray {
  // nativeImage.createEmpty() —— PR3 才换真 .ico
  const icon = nativeImage.createEmpty();
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

  console.log('[gacode-electron] Tray registered (empty icon, tooltip="Gacode")');
  return tray;
}