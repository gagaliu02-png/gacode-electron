/**
 * components/chat/ChatTopBanner.tsx — chat-id-28 顶部横幅 (断网 / 网关版本提示)
 *
 * 行为契约:
 *   - 监听 window 'online' / 'offline' 事件 → 断网时显示 banner
 *   - 启动时 fetch /api/v1/healthz (或 GET / 200 OK) 拿一次, server 端
 *     unified-api 在响应头里给 `x-gaclaw-version`. 不一致就提示 "网关版本不一致"
 *   - 切 chat 不重新检测 (整个 session 一次就够)
 *
 * 边界:
 *   - 不在加锁流程里 — banner 仅展示, 不阻断 send
 *   - 暗色 token (bg-warning-soft / text-warning), 不抢眼
 */

import { useEffect, useState } from "react";

export interface ChatTopBannerProps {
  /** 网关声明的版本 (from server 响应头 x-gaclaw-version) */
  serverVersion?: string | null;
  /** 本地构建版本 (从 import.meta.env.PACKAGE_VERSION / VITE_APP_VERSION 拿) */
  clientVersion?: string;
}

type NetworkState = "online" | "offline" | "unknown";

export function ChatTopBanner({
  serverVersion,
  clientVersion,
}: ChatTopBannerProps) {
  const [net, setNet] = useState<NetworkState>("unknown");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setNet(navigator.onLine ? "online" : "offline");
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const versionMismatch =
    serverVersion &&
    clientVersion &&
    serverVersion !== clientVersion &&
    !serverVersion.startsWith("unknown");

  if (net === "online" && !versionMismatch) return null;

  if (net === "offline") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="shrink-0 bg-warning-soft/40 border-b border-warning/40 px-4 py-1.5 text-xs text-warning flex items-center gap-2"
        data-testid="chat-top-banner-offline"
      >
        <span aria-hidden="true">⚠</span>
        <span>当前处于离线状态, 消息发送可能失败</span>
      </div>
    );
  }

  if (versionMismatch) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="shrink-0 bg-warning-soft/40 border-b border-warning/40 px-4 py-1.5 text-xs text-warning flex items-center gap-2"
        data-testid="chat-top-banner-version"
      >
        <span aria-hidden="true">⚠</span>
        <span>
          网关版本不一致 (服务端 {serverVersion} / 本地 {clientVersion}),
          建议刷新应用
        </span>
      </div>
    );
  }

  return null;
}