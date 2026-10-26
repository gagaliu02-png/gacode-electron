/**
 * lib/notifications-sse.ts — 阶段 4 通知 SSE 客户端 (fetch 版)
 *
 * 直接连 unified-api `GET /api/v1/notifications/stream` (事件源)。
 *
 * ---------------------------------------------------------------------------
 * 2026-10-26 (C 域收口批) 改动 —— 逐条对标 docs/align-c-profile-notify.md
 * ---------------------------------------------------------------------------
 *   - **C4-04 / C4-06**：`EventSource` → `fetch` + `Authorization: Bearer` 头 +
 *     手写 SSE 帧解析 + `Last-Event-ID` 续传。
 *     为什么：`EventSource` **不能带自定义请求头**，后端 `requireAuth` 只读
 *     `Authorization` 头 ⇒ PC 之前只能把 token 拼在 `?token=` query 上
 *     (会进 nginx access log)，而且**带不了 `Last-Event-ID`** ⇒ 断流期间
 *     漏掉的通知永远收不到。
 *     帧解析 / 重连策略**逐字抄** web
 *     `gacode-web/src/lib/notification-stream.ts`
 *     (SseFrameParser:59-85 / parseSseFrame:88-103 /
 *      parseNotificationEvent:117-135 / createNotificationStream:327-453)。
 *   - **C4-10**：body 为空时不再丢弃，走 `notificationSummary()` 的按 type
 *     兜底 (日程到点了 / 定时任务已产出结果 / 你有一条新通知)。
 *   - **C4-13**：弹 Windows Toast 前查 `loadNotificationPrefs()` ——
 *     「启用通知」+「桌面通知」两个开关是**硬前置条件**
 *     (跟 web `showSiteNotification` 的 `isEnabled()` 语义一致)。
 *   - **C4-09**：窗口在前台时**不弹**系统通知 (主进程 `isWindowFocused()` 桥)。
 *     ⚠️ 不用 renderer 的 `document.hidden` —— Electron 窗口最小化时
 *     `document.visibilityState` 仍可能是 `visible`。
 *   - **C4-11**：通知带上点击落点 `target`；用户点了 Windows Toast →
 *     主进程恢复窗口 + 聚焦 + 推回 renderer → 这里跳 React Router 路由。
 *
 * ---------------------------------------------------------------------------
 * 行为
 * ---------------------------------------------------------------------------
 *   - 收到 `{type:"notification", notification:{...}}` 时:
 *     ① queryClient.invalidateQueries({queryKey:["notifications"]}) 全部刷新
 *       (unread badge / 列表页同步)
 *     ② 应用内 toast (受「启用通知」+「应用内提示」开关约束)
 *     ③ window.gacode?.notificationSSESend({title,body,target}) 推主进程弹
 *       Windows Toast (受「启用通知」+「桌面通知」开关 + 窗口焦点约束)
 *
 *   - 自动重连: exponential backoff (1s → 30s 上限) —— 跟 web 一致
 *   - 401: 先试 `tryRefreshAccessToken()` 主动换 token (PC 独有能力);
 *     换不到 → 等 15s 再连 (web 的保守策略 —— web 没有 refresh token 能力)
 *   - watchdog: 60s 没事件视为断流, 主动 abort + 重连 (某些代理会"卡"连接)
 *   - 关闭: unmount 清理, 避免 leak
 *
 * 用法: AuthProvider 内部已经 registerSseAuthAccessor(), 在 App.tsx 挂这个
 * 组件即可, 仅在已登录时连。
 */

import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./auth";
import {
  getAccessTokenForSse,
  getNotificationStreamUrl,
  loadNotificationPrefs,
} from "./api";
import {
  normalizeNotification,
  notificationPresentation,
  notificationSummary,
  notificationTarget,
  type NotificationItem,
} from "./notifications";
import { tryRefreshAccessToken } from "./auth-refresh";
import { useToast } from "../components/ui/Toast";

const BACKOFF_INITIAL_MS = 1000;
const BACKOFF_MAX_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 60_000;
/** 401 且换不到新 token → 等多久再连 (web notification-stream.ts:394)。 */
const UNAUTHORIZED_RETRY_MS = 15_000;
/** 拿不到 token → 等多久再看 (web notification-stream.ts:372)。 */
const NO_TOKEN_RETRY_MS = 5_000;
/** 系统通知正文截断长度 (web webNotifications.ts:196)。 */
const NOTIFICATION_BODY_MAX_LEN = 100;

// =========================================================================
// SSE 帧解析 (纯函数 —— 跟 web notification-stream.ts:45-135 同款)
// =========================================================================

/** 一个 SSE 帧解析后的结果。 */
export interface SseFrame {
  /** `id:` 行 —— 续传用 (Last-Event-ID)。 */
  id: string | null;
  /** `data:` 行拼起来的内容 (多行 data 用 \n 连)。 */
  data: string;
}

/**
 * SseFrameParser —— 增量 SSE 帧解析器。
 *
 * SSE 帧以**空行**分隔; `:` 开头是注释 (心跳), 忽略。
 * 数据可能被网络切成任意片段 → 所以是增量喂 + 状态机, 不是一次性 split。
 */
export class SseFrameParser {
  private buffer = "";

  /** 喂一段新到的文本, 返回本次**完整**的帧。 */
  push(chunk: string): SseFrame[] {
    this.buffer += chunk;
    const frames: SseFrame[] = [];
    // 帧分隔符: \n\n (也兼容 \r\n\r\n)
    let sep = this.buffer.indexOf("\n\n");
    while (sep !== -1) {
      const raw = this.buffer.slice(0, sep);
      this.buffer = this.buffer.slice(sep + 2);
      const frame = parseSseFrame(raw);
      if (frame) frames.push(frame);
      sep = this.buffer.indexOf("\n\n");
    }
    return frames;
  }

  /** 冲刷残余 (连接断开时调用) —— 返回最后一段不完整的帧 (没有就 null)。 */
  flush(): SseFrame | null {
    const raw = this.buffer.trim();
    this.buffer = "";
    if (!raw) return null;
    return parseSseFrame(raw);
  }
}

/** 解析单个 SSE 帧的文本。 */
export function parseSseFrame(raw: string): SseFrame | null {
  let id: string | null = null;
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.replace(/\r$/, "");
    if (!trimmed) continue;
    if (trimmed.startsWith(":")) continue; // 注释 / 心跳
    const colon = trimmed.indexOf(":");
    const field = colon === -1 ? trimmed : trimmed.slice(0, colon);
    const value = colon === -1 ? "" : trimmed.slice(colon + 1).replace(/^ /, "");
    if (field === "id") id = value;
    else if (field === "data") dataLines.push(value);
  }
  if (id === null && dataLines.length === 0) return null;
  return { id, data: dataLines.join("\n") };
}

/** SSE data 帧的载荷。 */
export interface NotificationStreamEvent {
  type: "connected" | "notification" | "unknown";
  notification?: NotificationItem;
}

/**
 * parseNotificationEvent — 把 SSE `data:` 的 JSON 解成事件。
 *
 * 后端帧: `{"type":"notification","notification":{...Prisma 行...}}`
 * 建连帧: `{"type":"connected"}`
 */
export function parseNotificationEvent(data: string): NotificationStreamEvent {
  if (!data) return { type: "unknown" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return { type: "unknown" };
  }
  if (!parsed || typeof parsed !== "object") return { type: "unknown" };
  const obj = parsed as Record<string, unknown>;
  if (obj.type === "connected") return { type: "connected" };
  if (obj.type === "notification") {
    return {
      type: "notification",
      notification: normalizeNotification(obj.notification),
    };
  }
  return { type: "unknown" };
}

// =========================================================================
// helpers
// =========================================================================

/**
 * isWindowFocused —— 问主进程「窗口现在是不是在前台」。
 *
 * 主进程 `gacode:is-focused` → `!mainWindow.isMinimized() && mainWindow.isFocused()`。
 * 桥不存在 (纯 web 调试 / 老 preload) → 当作**不在前台** → 照旧弹通知。
 */
async function isWindowFocused(): Promise<boolean> {
  try {
    if (!window.gacode?.isWindowFocused) return false;
    return await window.gacode.isWindowFocused();
  } catch {
    return false;
  }
}

/**
 * notificationClickTarget —— 算这条通知点了之后该去哪 (C4-11)。
 *
 * 跟 web `WebNotificationWatcher.tsx:121-130` 同口径:
 *   - 会话 / 日程 → 站内路由 path (PC 没日程模块 ⇒ 日程落到 kind="none")
 *   - 外链 → http(s) URL (主进程用 shell.openExternal 打开)
 *   - 其余 → null (点了只恢复窗口, 不跳路由)
 */
function notificationClickTarget(n: NotificationItem): string | null {
  const target = notificationTarget(n);
  if (target.kind === "chat") return target.href;
  if (target.kind === "url") return target.url;
  return null;
}

// =========================================================================
// NotificationSSEBridge
// =========================================================================

export function NotificationSSEBridge() {
  const { user, accessToken } = useAuth() as ReturnType<typeof useAuth> & {
    accessToken?: string | null;
  };
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  // 跟踪 "上次事件时间", 60s 没事件视为断流 (避免代理卡住连接)
  const lastEventAtRef = useRef<number>(Date.now());

  // -------------------------------------------------------------------------
  // C4-11 — 用户点了 Windows Toast → 主进程推回 target → 跳站内路由
  //
  // 外链 (http/https) 由**主进程**直接 shell.openExternal 打开, 不会走到这里;
  // 这里只处理站内 path。
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!window.gacode?.onNotificationClick) return;
    const unsubscribe = window.gacode.onNotificationClick((target) => {
      if (!target || typeof target !== "string") return;
      if (target.startsWith("/")) {
        navigate(target);
        console.log(`[gacode-sse] notification click -> navigate ${target}`);
        return;
      }
      console.warn(`[gacode-sse] notification click -> unknown target "${target}"`);
    });
    return unsubscribe;
  }, [navigate]);

  useEffect(() => {
    // 未登录或 demo E2E 模式不连 (server requireAuth 会拒绝)
    if (!user) return;
    if ((window as unknown as { __GACODE_E2E__?: boolean }).__GACODE_E2E__) return;
    // access token 还没注入到 accessor 时也先等等 (AuthProvider mount 后会有)
    if (!accessToken) return;

    let cancelled = false;
    let controller: AbortController | null = null;
    let connected = false;
    let watchdog: number | null = null;
    let retryTimer: number | null = null;
    let backoff = BACKOFF_INITIAL_MS;
    /** C4-06 — 最近一次事件的 id, 重连时带 `Last-Event-ID` 让服务端补发。 */
    let lastEventId: string | null = null;

    const clearRetry = () => {
      if (retryTimer) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const abortCurrent = () => {
      clearRetry();
      connected = false;
      try {
        controller?.abort();
      } catch {
        /* ignore */
      }
      controller = null;
    };

    const scheduleRetry = (delay: number) => {
      if (cancelled) return;
      clearRetry();
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        void connect();
      }, delay);
    };

    const armWatchdog = () => {
      if (watchdog) window.clearInterval(watchdog);
      watchdog = window.setInterval(() => {
        if (cancelled || !connected) return;
        const idle = Date.now() - lastEventAtRef.current;
        if (idle <= HEARTBEAT_TIMEOUT_MS) return;
        console.warn(
          `[gacode-sse] No event in ${Math.round(idle / 1000)}s, reconnecting`,
        );
        // abort 当前 fetch → catch 分支走退避重连
        try {
          controller?.abort();
        } catch {
          /* ignore */
        }
        controller = null;
        connected = false;
      }, 10_000);
    };

    const handleIncoming = (n: NotificationItem) => {
      lastEventAtRef.current = Date.now();

      // ① 刷新所有 notifications 相关 query
      queryClient.invalidateQueries({ queryKey: ["notifications"] });

      const prefs = loadNotificationPrefs();
      const pres = notificationPresentation(n);
      // C4-10 — body 为空时用按 type 的占位文案 (notificationSummary 永不返空串)
      const body = (n.body || "").slice(0, NOTIFICATION_BODY_MAX_LEN) || notificationSummary(n);

      // ② 应用内 toast —— 立刻可见, 不依赖 Windows 通知栏
      //    受「启用通知」+「应用内提示」两个开关约束
      if (prefs.enabled && prefs.inAppEnabled) {
        toast({
          message: `${n.title || pres.label}${body ? ` — ${body}` : ""}`,
          variant: "default",
        });
      }

      // ③ 推主进程弹 Windows Toast
      //    C4-13 —「启用通知」+「桌面通知」是硬前置条件
      //    C4-09 — 窗口在前台时不弹 (用户正看着屏幕)
      if (!prefs.enabled || !prefs.desktopEnabled) return;
      void isWindowFocused().then((focused) => {
        if (cancelled) return;
        if (focused) return;
        try {
          window.gacode?.notificationSSESend?.({
            title: n.title || pres.label,
            body,
            // C4-11 — 点击落点 (站内 path / 外链 URL / null)
            target: notificationClickTarget(n),
          });
        } catch (err) {
          console.warn(
            "[gacode-sse] window.gacode.notificationSSESend failed",
            err,
          );
        }
      });

      console.log(`[gacode-sse] notification received: "${n.title}"`);
    };

    /**
     * connect —— 建一条 SSE 连接 (fetch + ReadableStream)。
     *
     * 逐字对照 web `gacode-web/src/lib/notification-stream.ts:365-432`:
     *   - headers: Authorization: Bearer / Accept: text/event-stream /
     *     Cache-Control: no-cache (+ Last-Event-ID 续传头)
     *   - 401 → 不猛重连 (web 等 15s)
     *   - !ok / !body → 退避重连 (1s → 2s → 4s … 上限 30s)
     *   - 正常读完 (服务端断了) → 退避重连
     */
    async function connect(): Promise<void> {
      if (cancelled) return;
      const tok = getAccessTokenForSse();
      if (!tok) {
        // 未登录 —— 等一会儿再看 (AuthProvider 注入 token 后自动重连)
        scheduleRetry(NO_TOKEN_RETRY_MS);
        return;
      }

      controller = new AbortController();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${tok}`,
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      };
      // C4-06 — 续传: 带上次的事件 id, 服务端把 buffer 里没收到的那几条补发
      if (lastEventId) headers["Last-Event-ID"] = lastEventId;

      try {
        const res = await fetch(getNotificationStreamUrl(), {
          method: "GET",
          headers,
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });

        if (res.status === 401) {
          // token 过期 —— PC 能主动 refresh (web 没有这个能力, 只能干等 15s)
          const newToken = await tryRefreshAccessToken();
          if (cancelled) return;
          if (newToken) {
            console.warn(
              "[gacode-sse] SSE got 401, refreshed token, reconnecting",
            );
            void connect();
            return;
          }
          console.warn(
            "[gacode-sse] SSE got 401, token refresh failed, retry in 15s",
          );
          scheduleRetry(UNAUTHORIZED_RETRY_MS);
          return;
        }
        if (!res.ok || !res.body) {
          console.warn(`[gacode-sse] SSE HTTP ${res.status}`);
          scheduleRetry(backoff);
          backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
          return;
        }

        backoff = BACKOFF_INITIAL_MS;
        connected = true;
        lastEventAtRef.current = Date.now();
        console.log("[gacode-sse] SSE stream opened");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = new SseFrameParser();

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (cancelled) return;
          const text = decoder.decode(value, { stream: true });
          for (const frame of parser.push(text)) {
            if (frame.id) lastEventId = frame.id;
            const ev = parseNotificationEvent(frame.data);
            if (ev.type === "notification" && ev.notification) {
              handleIncoming(ev.notification);
            }
          }
        }

        // 正常读完 (服务端断了) → 重连 (web :425 —— 这里**不**翻倍退避)
        if (!cancelled) {
          connected = false;
          scheduleRetry(backoff);
        }
      } catch (err) {
        if (cancelled) return;
        connected = false;
        console.warn("[gacode-sse] SSE error:", err);
        scheduleRetry(backoff);
        backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
      }
    }

    armWatchdog();
    void connect();

    return () => {
      cancelled = true;
      connected = false;
      if (watchdog) {
        window.clearInterval(watchdog);
        watchdog = null;
      }
      // clearRetry + abort 当前 fetch + 置空 controller
      abortCurrent();
    };
    // user / accessToken 变化时自动重连 (登入登出会切)
  }, [user, accessToken, queryClient, toast]);

  return null;
}
