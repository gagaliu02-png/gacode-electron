// 跨主进程 / preload / 渲染层共用的类型契约。
// PR1 只放占位,PR2 加原生通知 + 菜单事件。

export interface GacodeBridge {
  appVersion: string;
  platform: NodeJS.Platform;
  /**
   * 触发 Windows Toast / macOS Notification / Linux libnotify 通知。
   * 返回 Promise<boolean> 表示系统是否真的显示(Notification.isSupported())。
   */
  notify: (title: string, body: string) => Promise<boolean>;
}

/** 主进程 → 渲染层的菜单事件载荷。 */
export type GacodeMenuEvent = 'new-chat' | 'about';