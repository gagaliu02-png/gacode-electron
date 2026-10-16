import { Notification, ipcMain } from 'electron';

/**
 * 原生通知桥。
 *
 * 渲染层通过 `window.gacode.notify(title, body)` 调用 → preload 走
 * `ipcRenderer.invoke('gacode:notify', { title, body })` → 这里 new Notification()
 * 触发 Windows Toast(应用名 "Gacode" 由 AppUserModelId 在 main.ts 设置)。
 *
 * Toast 显示依赖:
 * 1. AppUserModelId 已设 (com.gaga.gacode) —— 否则 Windows 用 "Electron" 占位
 * 2. app.isPackaged || setAppUserModelId 已调用 —— dev 模式 setAppUserModelId 即可
 * 3. Notification.isSupported() —— Windows 8+ / macOS / 大部分 Linux 桌面
 *
 * 返回 Promise<boolean> 给渲染层一个 isSupported 的指示 —— 渲染层可以选择
 * 降级到 web Notification API(虽然这里 web 是远程 URL,通常不需要)。
 */

export interface NotifyArgs {
  title: string;
  body: string;
}

export function registerNotificationIpc(): void {
  ipcMain.handle(
    'gacode:notify',
    async (_event, args: NotifyArgs): Promise<boolean> => {
      if (!Notification.isSupported()) {
        console.warn(
          '[gacode-electron] Notification.isSupported() === false, dropping',
        );
        return false;
      }
      const { title, body } = args;
      if (!title || !body) {
        console.warn('[gacode-electron] notify called with empty title/body');
        return false;
      }
      try {
        const n = new Notification({ title, body, silent: false });
        n.show();
        console.log(
          `[gacode-electron] Notification.show() called: title="${title}" body="${body}"`,
        );
        return true;
      } catch (err) {
        console.error('[gacode-electron] Notification.show() failed', err);
        return false;
      }
    },
  );

  console.log('[gacode-electron] Notification IPC handler registered');
}