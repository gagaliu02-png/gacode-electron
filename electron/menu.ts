import {
  Menu,
  app,
  type BrowserWindow,
  type MenuItemConstructorOptions,
} from 'electron';

/**
 * 应用主菜单(全中文)。
 *
 * 菜单项说明:
 * - 文件 / 新建聊天:发送 `gacode:menu` 事件到渲染层 —— PR2 阶段 gacode-web
 *   暂未监听,故为 no-op 占位(主进程不报错即可)。
 * - 文件 / 退出:role='quit',Electron 内置。
 * - 编辑 / 复制粘贴全选:role 由 BrowserWindow 自动路由 webContents。
 * - 视图 / 开发者工具:仅 dev 模式可见(role 由 BrowserWindow 处理)。
 * - 视图 / 重新加载:role='reload' —— 远程 URL 重载。
 * - 视图 / 全屏:role='togglefullscreen'。
 * - 窗口 / 最小化 / 关闭:role 由 BrowserWindow 自动处理。
 * - 帮助 / 关于 Gacode:发送 `gacode:menu` 事件,同样 no-op 占位。
 */

const isDev =
  process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

export function createAppMenu(getMainWindow: () => BrowserWindow | null): void {
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