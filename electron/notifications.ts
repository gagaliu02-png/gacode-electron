import { Notification, ipcMain, type NotificationConstructorOptions } from 'electron';

/**
 * 原生通知桥。
 *
 * 渲染层通过 `window.gacode.notify(title, body)` 调用 → preload 走
 * `ipcRenderer.invoke('gacode:notify', { title, body })` → 这里 new Notification()
 * 触发 Windows Toast(应用名 "Gacode" 由 AppUserModelId 在 main.ts 设置)。
 *
 * 阶段 4 加 `gacode:notification-sse-event` ipcMain.on (renderer → main):
 *   - 主进程不能直接连 unified-api SSE (CORS + Auth 头要带, 走主进程反而绕)
 *   - renderer 用 EventSource 在前端连, 收到通知时把 {title, body} 推主进程
 *   - 主进程拿现成的 Notification API 弹真正的 Windows Toast (在 Electron 进程
 *     里 EventSource 也行, 但放到 renderer 跟 /notifications 列表共享连接更省)
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

export interface NotificationSSESendArgs {
  title: string;
  body: string;
}

export function registerNotificationIpc(): void {
  // ---- gacode:notify ----
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

  // ---- gacode:notification-sse-event ----
  // renderer 收到 SSE 事件后推到主进程弹 Toast, 单向 fire-and-forget
  ipcMain.on(
    'gacode:notification-sse-event',
    (_event, args: NotificationSSESendArgs) => {
      if (!Notification.isSupported()) {
        return;
      }
      const { title, body } = args || {};
      if (!title || !body) {
        console.warn(
          '[gacode-electron] notification-sse-event called with empty title/body',
        );
        return;
      }
      try {
        const opts: NotificationConstructorOptions = {
          title,
          body,
          silent: false,
        };
        const n = new Notification(opts);
        n.show();
        console.log(
          `[gacode-electron] SSE notification -> Toast: title="${title}"`,
        );
      } catch (err) {
        console.error(
          '[gacode-electron] notification-sse-event Notification.show() failed',
          err,
        );
      }
    },
  );

  console.log('[gacode-electron] Notification IPC handler registered');
}
