import {
  Notification,
  ipcMain,
  shell,
  type BrowserWindow,
  type NotificationConstructorOptions,
} from 'electron';

/**
 * 原生通知桥。
 *
 * 渲染层通过 `window.gacode.notify(title, body)` 调用 → preload 走
 * `ipcRenderer.invoke('gacode:notify', { title, body })` → 这里 new Notification()
 * 触发 Windows Toast(应用名 "Gacode" 由 AppUserModelId 在 main.ts 设置)。
 *
 * 阶段 4 加 `gacode:notification-sse-event` ipcMain.on (renderer → main):
 *   - 主进程不能直接连 unified-api SSE (CORS + Auth 头要带, 走主进程反而绕)
 *   - renderer 用 SSE 在前端连, 收到通知时把 {title, body, target} 推主进程
 *   - 主进程拿现成的 Notification API 弹真正的 Windows Toast (在 Electron 进程
 *     里 fetch 也行, 但放到 renderer 跟 /notifications 列表共享连接更省)
 *
 * Toast 显示依赖:
 * 1. AppUserModelId 已设 (com.gaga.gacode) —— 否则 Windows 用 "Electron" 占位
 * 2. app.isPackaged || setAppUserModelId 已调用 —— dev 模式 setAppUserModelId 即可
 * 3. Notification.isSupported() —— Windows 8+ / macOS / 大部分 Linux 桌面
 *
 * 返回 Promise<boolean> 给渲染层一个 isSupported 的指示 —— 渲染层可以选择
 * 降级到 web Notification API(虽然这里 web 是远程 URL,通常不需要)。
 *
 * ---------------------------------------------------------------------------
 * 2026-10-26 (C 域收口批) —— C4-10 / C4-11
 * ---------------------------------------------------------------------------
 *   - **C4-10**: body 为空**不再丢弃整条通知** —— 之前 `if (!title || !body)`
 *     直接 return false, 服务端日程没写备注 (body=null) 时用户**完全收不到**。
 *     现在 body 空 → 兜底文案 (跟 PC `notificationPresentation` 的 default
 *     emptyBody 一致: "你有一条新通知")。
 *   - **C4-11**: 两处 `new Notification` 都挂 `n.on('click')` ——
 *     点击 → ① 关闭通知 ② 恢复窗口 (restore) + show + focus
 *     ③ 落点跳转: 外链 (http/https) → shell.openExternal;
 *                站内 path ("/xxx") → 推 `gacode:notification-clicked`
 *                给 renderer 跳 React Router 路由。
 *     之前**没有** click handler ⇒ 点 Windows Toast 什么都不会发生。
 */

/** 主进程 → 渲染层: 用户点了 Windows Toast, payload = 站内落点 path。 */
export const NOTIFICATION_CLICKED_CHANNEL = 'gacode:notification-clicked';

/**
 * body 为空时的兜底文案。
 * 跟 PC `src/lib/notifications.ts` 的 `notificationPresentation()` default
 * `emptyBody` 一致 ("你有一条新通知")。
 */
const EMPTY_BODY_FALLBACK = '你有一条新通知';

export interface NotifyArgs {
  title: string;
  body: string;
}

export interface NotificationSSESendArgs {
  title: string;
  body: string;
  /** 点击落点: "/chat/{id}" (站内) | "http(s)://..." (外链) | null (无落点)。 */
  target?: string | null;
}

export function registerNotificationIpc(
  getWindow: () => BrowserWindow | null,
): void {
  /**
   * attachClick —— 给系统通知挂点击处理 (C4-11)。
   *
   * 顺序跟 web `gacode-web/src/lib/webNotifications.ts:208-221` 同款:
   *   n.close() → window.focus() → opts.onClick()
   *
   * 落点分流 (跟 web `WebNotificationWatcher.tsx:121-130` 同口径):
   *   - "http(s)://" → shell.openExternal (外链走系统默认浏览器)
   *   - "/xxx"      → 推 `gacode:notification-clicked` 给 renderer 跳路由
   *   - null        → 只恢复窗口, 不跳转
   */
  const attachClick = (n: Notification, target: string | null): void => {
    n.on('click', () => {
      try {
        n.close();
      } catch {
        /* ignore */
      }
      const win = getWindow();
      if (win && !win.isDestroyed()) {
        try {
          if (win.isMinimized()) win.restore();
          win.show();
          win.focus();
        } catch {
          /* ignore */
        }
      }
      if (!target) return;
      if (/^https?:\/\//i.test(target)) {
        try {
          void shell.openExternal(target);
        } catch (err) {
          console.error('[gacode-electron] openExternal failed', err);
        }
        return;
      }
      if (target.startsWith('/') && win && !win.isDestroyed()) {
        win.webContents.send(NOTIFICATION_CLICKED_CHANNEL, target);
        console.log(`[gacode-electron] notification click -> navigate ${target}`);
      }
    });
  };

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
      const title = (args?.title ?? '').trim();
      if (!title) {
        console.warn('[gacode-electron] notify called with empty title');
        return false;
      }
      // C4-10: body 空 → 兜底文案, 不再整条丢弃
      const body = (args?.body ?? '').trim() || EMPTY_BODY_FALLBACK;
      try {
        const n = new Notification({ title, body, silent: false });
        // C4-11: 点击 → 恢复窗口 + 聚焦 (这条没有落点, 只恢复窗口)
        attachClick(n, null);
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
      const title = (args?.title ?? '').trim();
      if (!title) {
        console.warn(
          '[gacode-electron] notification-sse-event called with empty title',
        );
        return;
      }
      // C4-10: body 空 → 兜底文案, 不再整条丢弃
      const body = (args?.body ?? '').trim() || EMPTY_BODY_FALLBACK;
      const target =
        typeof args?.target === 'string' && args.target ? args.target : null;
      try {
        const opts: NotificationConstructorOptions = {
          title,
          body,
          silent: false,
        };
        const n = new Notification(opts);
        // C4-11: 点击 → 恢复窗口 + 聚焦 + 跳落点
        attachClick(n, target);
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
