import {
  Menu,
  app,
  type BrowserWindow,
  type MenuItemConstructorOptions,
} from 'electron';

/**
 * 应用主菜单 (macOS 平台专用).
 *
 * Windows / Linux:
 *   调 `Menu.setApplicationMenu(null)` 移除 native menu bar —— sidebar 已包含
 *   所有功能入口 (chat / library / deliveries / notifications / profile /
 *   browser), macOS 风格的"文件 / 编辑 / 视图 / 窗口 / 帮助"在 Windows 顶栏
 *   显示太土, gaga 截图标注要去掉. tray icon 右键菜单是单独走的 tray.ts,
 *   不受这个函数影响.
 *
 * macOS (darwin):
 *   保留原 template. macOS 平台理论上强制要求 app menu (无 menu OS 行为异常),
 *   实际我们只发 Windows 包, 但代码保留无害.
 *
 * 菜单项说明 (macOS template 内部):
 * - 文件 / 新建聊天:发送 `gacode:menu` 事件到渲染层 —— 占位
 * - 文件 / 退出:role='quit', Electron 内置
 * - 编辑 / 复制粘贴全选:role 由 BrowserWindow 自动路由 webContents
 * - 视图 / 开发者工具:仅 dev 模式可见
 * - 视图 / 重新加载:role='reload'
 * - 视图 / 全屏:role='togglefullscreen'
 * - 窗口 / 最小化 / 关闭:role 由 BrowserWindow 自动处理
 * - 帮助 / 关于 Gacode:发送 `gacode:menu` 事件, 占位
 */

const isDev =
  process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

export function createAppMenu(getMainWindow: () => BrowserWindow | null): void {
  // 非 macOS 平台 (Windows 主, Linux 备): 移除 native menu bar.
  // sidebar 已覆盖所有功能入口, 不需要在窗口顶栏重复一份 macOS 风格菜单.
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    console.log(
      `[gacode-electron] Application menu removed (platform=${process.platform})`,
    );
    return;
  }

  const sendMenu = (event: 'new-chat' | 'about') => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('gacode:menu', event);
    }
  };

  const template: MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建聊天',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendMenu('new-chat'),
        },
        { type: 'separator' },
        { label: '退出', role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '剪切', role: 'cut' },
        { type: 'separator' },
        { label: '全选', role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        // dev 模式才给开发者工具 —— prod 包不开
        ...(isDev
          ? ([
              { label: '开发者工具', role: 'toggleDevTools' as const },
              { type: 'separator' as const },
            ] as MenuItemConstructorOptions[])
          : []),
        { label: '重新加载', role: 'reload' },
        { type: 'separator' },
        { label: '全屏', role: 'togglefullscreen' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '关闭', role: 'close' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于 Gacode',
          click: () => sendMenu('about'),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  console.log(
    `[gacode-electron] Application menu set (dev=${isDev}): ${template
      .map((m) => m.label)
      .join(' / ')}`,
  );
}