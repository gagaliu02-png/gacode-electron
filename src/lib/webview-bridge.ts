/**
 * lib/webview-bridge.ts — 阶段 4 BrowserView (主进程) / <webview> (渲染层)
 * 之间的桥接封装。
 *
 * Browser.tsx 走两种用法:
 *   A. <webview> 标签 (webviewTag: true) — 多个 tab 共享一个渲染层,
 *      tab 状态纯 React state 管理, 不需要 IPC. 这是首选.
 *   B. window.gacode.openBrowserTab(url) — 主进程新建 BrowserView 顶入
 *      mainWindow, 适合"从 chat 内容链接打开 in-app browser"那种外层入口,
 *      也用于 webview 里 "在新窗口打开" 之类的额外动作.
 *
 * 这个模块暴露 B 的封装 (openExternalTab / closeExternalTab / focusExternalTab),
 * 加 onTabClosed 监听, 让 Browser.tsx 可以混合使用两种渲染方式.
 *
 * 设计: 不依赖 React, 纯函数封装. Browser.tsx 按需 import.
 */

import type { BrowserTabClosedEvent } from "@shared/types";

export async function openExternalTab(url: string): Promise<string | null> {
  if (!window.gacode?.openBrowserTab) return null;
  try {
    const { tabId } = await window.gacode.openBrowserTab(url);
    return tabId;
  } catch (err) {
    console.warn(`[webview-bridge] openExternalTab failed: ${url}`, err);
    return null;
  }
}

export function closeExternalTab(tabId: string): void {
  window.gacode?.closeBrowserTab?.(tabId);
}

export function focusExternalTab(tabId: string): void {
  window.gacode?.focusBrowserTab?.(tabId);
}

export function onExternalTabClosed(
  callback: (event: BrowserTabClosedEvent) => void,
): () => void {
  if (!window.gacode || typeof (window.gacode as { onBrowserTabClosed?: unknown }).onBrowserTabClosed !== "function") {
    return () => undefined;
  }
  return (window.gacode as unknown as {
    onBrowserTabClosed: (
      cb: (event: BrowserTabClosedEvent) => void,
    ) => () => void;
  }).onBrowserTabClosed(callback);
}
