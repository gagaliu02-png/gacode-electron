/**
 * lib/deep-link.tsx — 阶段 4 deep link 客户端
 *
 * 监听 preload 通过 `window.gacode.onDeepLink(callback)` 暴露的事件,
 * 在 App.tsx 内的 Router 环境下挂 `<DeepLinkBridge />`,
 * 拿到 deep-link path 时用 useNavigate 跳到对应 React Router 路由。
 *
 * 设计:
 *   - 单一组件 (`DeepLinkBridge`), 在 Router 内部挂载即可
 *   - 渲染层只关心 path (主进程已经做完 gacode://chat/123 → /chat/123 解析)
 *   - 重连/重复订阅: onDeepLink 返 unsubscribe 闭包, useEffect cleanup 调用
 *     避免 React StrictMode 双跑 + 大型应用多层路由重 mount 时漏卸旧监听
 *
 * 不抛错: deep link URL 格式异常时主进程已经用 parseDeepLink 兜底返 '/',
 * 这里再 defend 双保险, 跳不出去的 path 直接 swallow + 落 '/'.
 */

import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const KNOWN_PREFIXES = ["/chat", "/library", "/deliveries", "/notifications", "/profile", "/browser", "/login"];

function isValidPath(path: string): boolean {
  if (!path || typeof path !== "string") return false;
  if (!path.startsWith("/")) return false;
  return KNOWN_PREFIXES.some(
    (p) => path === p || path.startsWith(p + "/") || path === "/",
  );
}

/**
 * <DeepLinkBridge /> — 渲染 null, 仅做"监听 IPC → router 跳转"。
 * 必须放在 HashRouter (或 BrowserRouter) 内部。
 */
export function DeepLinkBridge() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!window.gacode?.onDeepLink) return;
    const unsubscribe = window.gacode.onDeepLink((path) => {
      if (!isValidPath(path)) {
        console.warn(`[gacode-deep-link] invalid path: "${path}", fall back to /`);
        navigate("/", { replace: true });
        return;
      }
      // 已经在同一 path 上就不重复 push (避免 history 多塞一份空 entry)
      if (location.pathname !== path && !location.pathname.startsWith(path + "/")) {
        navigate(path, { replace: false });
        console.log(`[gacode-deep-link] navigated to ${path}`);
      } else {
        console.log(`[gacode-deep-link] already on ${path}, skip`);
      }
    });
    return unsubscribe;
  }, [navigate, location.pathname]);

  return null;
}
