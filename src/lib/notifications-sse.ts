/**
 * lib/notifications-sse.ts — 阶段 4 通知 SSE 客户端
 *
 * 直接连 unified-api `GET /api/v1/notifications/stream` (事件源)。
 *
 * 行为:
 *   - 启动时 new EventSource(buildNotificationStreamUrl()), EventSource 不
 *     支持自定义 header, 由 buildNotificationStreamUrl() 自动把 access token
 *     拼到 ?token= query (unified-api auth 插件同时认 cookie / bearer / query).
 *   - 收到 `{type:"notification", notification:{title,body,...}}` 时:
 *     ① queryClient.invalidateQueries({queryKey:["notifications"]}) 全部刷新
 *       (unread badge / 列表页同步)
 *     ② window.gacode?.notificationSSESend({title,body}) 推主进程弹 Windows Toast
 *     ③ 应用内 toast (立刻可见, 不依赖系统通知栏)
 *
 *   - 自动重连: exponential backoff (1s → 30s 上限)
 *   - watchdog: 60s 没事件视为断流, 主动 close + 重连 (某些代理会"卡"连接)
 *   - 关闭: close() / unmount 清理, 避免 leak
 *
 * 用法: AuthProvider 内部已经 registerSseAuthAccessor(), 在 App.tsx 挂这个
 * 组件即可, 仅在已登录时连。
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth";
import { buildNotificationStreamUrl } from "./api";
import { useToast } from "../components/ui/Toast";

const BACKOFF_INITIAL_MS = 1000;
const BACKOFF_MAX_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 60_000;

interface NotificationSSEPayload {
  type?: string;
  notification?: {
    id?: string | number;
    title?: string;
    body?: string;
    type?: string;
    isRead?: boolean;
    createdAt?: string;
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function NotificationSSEBridge() {
  const { user, accessToken } = useAuth() as ReturnType<typeof useAuth> & {
    accessToken?: string | null;
  };
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // 跟踪 "上次事件时间", 60s 没事件视为断流 (避免代理卡住 readyState)
  const lastEventAtRef = useRef<number>(Date.now());

  useEffect(() => {
    // 未登录或 demo E2E 模式不连 (server requireAuth 会拒绝)
    if (!user) return;
    if ((window as unknown as { __GACODE_E2E__?: boolean }).__GACODE_E2E__) return;
    // access token 还没注入到 accessor 时也先等等 (AuthProvider mount 后会有)
    if (!accessToken) return;

    const url = buildNotificationStreamUrl();
    let cancelled = false;
    let current: EventSource | null = null;
    let watchdog: number | null = null;
    let backoff = BACKOFF_INITIAL_MS;

    const armWatchdog = () => {
      if (watchdog) window.clearInterval(watchdog);
      watchdog = window.setInterval(() => {
        if (cancelled) return;
        const idle = Date.now() - lastEventAtRef.current;
        if (
          idle > HEARTBEAT_TIMEOUT_MS &&
          current &&
          current.readyState !== EventSource.CLOSED
        ) {
          console.warn(
            `[gacode-sse] No event in ${Math.round(idle / 1000)}s, reconnecting`,
          );
          try {
            current.close();
          } catch {
            /* ignore */
          }
          // 主动 close 不会触发 onerror; 用 setTimeout 替代
          window.setTimeout(() => {
            if (cancelled) return;
            schedule();
          }, 100);
        }
      }, 10_000);
    };

    const handleIncoming = (raw: string) => {
      lastEventAtRef.current = Date.now();
      let payload: NotificationSSEPayload | null = null;
      try {
        payload = JSON.parse(raw);
      } catch {
        // 可能是心跳注释行或非 JSON 帧
        return;
      }
      if (!payload || payload.type !== "notification") return;
      const n = payload.notification;
      if (!n || !n.title) return;

      // ① 刷新所有 notifications 相关 query
      queryClient.invalidateQueries({ queryKey: ["notifications"] });

      // ② 推主进程弹 Windows Toast
      try {
        window.gacode?.notificationSSESend?.({
          title: n.title,
          body: n.body || "",
        });
      } catch (err) {
        console.warn(
          "[gacode-sse] window.gacode.notificationSSESend failed",
          err,
        );
      }

      // ③ 应用内 toast — 立刻可见, 不依赖 Windows 通知栏
      toast({
        message: `${n.title}${n.body ? ` — ${n.body}` : ""}`,
        variant: "default",
      });

      console.log(`[gacode-sse] notification received: "${n.title}"`);
    };

    const schedule = () => {
      if (cancelled) return;
      if (current) {
        try {
          current.close();
        } catch {
          /* ignore */
        }
        current = null;
      }
      try {
        const es = new EventSource(url, { withCredentials: true } as EventSourceInit);
        current = es;
        lastEventAtRef.current = Date.now();
        es.onopen = () => {
          if (cancelled) return;
          backoff = BACKOFF_INITIAL_MS;
          console.log("[gacode-sse] EventSource opened");
        };
        es.onmessage = (ev) => {
          if (cancelled) return;
          handleIncoming((ev as MessageEvent).data);
        };
        es.onerror = (err) => {
          if (cancelled) return;
          console.warn("[gacode-sse] EventSource error:", err);
          try {
            es.close();
          } catch {
            /* ignore */
          }
          current = null;
          const wait = backoff;
          backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
          console.log(
            `[gacode-sse] Reconnect in ${wait}ms (next backoff=${backoff}ms)`,
          );
          sleep(wait).then(() => {
            if (cancelled) return;
            schedule();
          });
        };
        armWatchdog();
      } catch (err) {
        console.error("[gacode-sse] Failed to construct EventSource:", err);
        const wait = backoff;
        backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
        sleep(wait).then(() => {
          if (cancelled) return;
          schedule();
        });
      }
    };

    schedule();

    return () => {
      cancelled = true;
      if (watchdog) {
        window.clearInterval(watchdog);
        watchdog = null;
      }
      if (current) {
        try {
          current.close();
        } catch {
          /* ignore */
        }
        current = null;
      }
    };
    // user / accessToken 变化时自动重连 (登入登出会切)
  }, [user, accessToken, queryClient, toast]);

  return null;
}
