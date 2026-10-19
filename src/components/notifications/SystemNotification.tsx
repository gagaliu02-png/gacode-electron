/**
 * components/notifications/SystemNotification.tsx — 系统桌面通知封装
 * (gacode-electron 0.7.5 P1 notifications-8)
 *
 * 设计要点:
 *   - 主进程 `electron/notifications.ts` 已经实现了 `new Notification()` +
 *     handleNotificationClick + 客户端 SSE 事件转发逻辑.
 *   - preload 通过 contextBridge 暴露两条桥:
 *     ① window.gacode.notify(title, body)         — 一次性弹通知 (fire-and-forget)
 *     ② window.gacode.notificationSSESend({title,body}) — SSE 推主进程时用
 *   - 渲染层只用 ① 这条 (按需主动弹), ② 由 lib/notifications-sse.ts 接管
 *
 * 本组件不接管 SSE (那是 NotificationSSEBridge 的事), 只对外暴露 trigger()
 * 给上层 (比如设置面板里"测试通知"按钮) 调用.
 *
 * 用法:
 *   <SystemNotification enabled={prefs.desktopEnabled} />
 *   const ref = useRef<SystemNotificationHandle>(null);
 *   ref.current?.fire({ title: '测试', body: 'Hello' });
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { loadNotificationPrefs, type NotificationPrefs } from "../../lib/api";

export interface SystemNotificationPayload {
  title: string;
  body?: string;
}

export interface SystemNotificationHandle {
  fire: (payload: SystemNotificationPayload) => Promise<boolean>;
}

export interface SystemNotificationProps {
  /** 主开关 — 关掉时不 fire. SSE 路径走 NotificationSSEBridge 自管. */
  enabled?: boolean;
  /** 偏好变化时回调 (供外部 hook 同步 UI) */
  onPrefsChange?: (prefs: NotificationPrefs) => void;
}

/**
 * 监听 localStorage 偏好变更 — 弹通知前实时检查 desktopEnabled + category.
 *
 * 不持久 state (避免多 instance 同步问题), 用 ref 缓存当前快照.
 */
export const SystemNotification = forwardRef<
  SystemNotificationHandle,
  SystemNotificationProps
>(function SystemNotification({ enabled = true, onPrefsChange }, ref) {
  const prefsRef = useRef<NotificationPrefs>(loadNotificationPrefs());

  useEffect(() => {
    const onPrefs = (e: Event) => {
      const detail = (e as CustomEvent<NotificationPrefs>).detail;
      prefsRef.current = detail;
      onPrefsChange?.(detail);
    };
    window.addEventListener(
      "gacode:notification-prefs-changed",
      onPrefs as EventListener,
    );
    return () => {
      window.removeEventListener(
        "gacode:notification-prefs-changed",
        onPrefs as EventListener,
      );
    };
  }, [onPrefsChange]);

  const fire = useCallback(
    async (payload: SystemNotificationPayload): Promise<boolean> => {
      if (!enabled) return false;
      if (!prefsRef.current.enabled || !prefsRef.current.desktopEnabled) {
        return false;
      }
      if (!window.gacode?.notify) {
        console.warn("[gacode-system-notification] notify bridge missing");
        return false;
      }
      try {
        return await window.gacode.notify(payload.title, payload.body ?? "");
      } catch (err) {
        console.warn("[gacode-system-notification] notify failed", err);
        return false;
      }
    },
    [enabled],
  );

  useImperativeHandle(ref, () => ({ fire }), [fire]);

  return null;
});