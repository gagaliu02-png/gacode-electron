/**
 * lib/bookmarks.ts — 阶段 7 浏览器收藏夹 IPC wrapper
 *
 * 渲染层统一入口: 调用 window.gacode.bookmarks.{read, add, remove}.
 * 类型契约来自 shared/types.ts 的 BookmarkEntry.
 *
 * 设计:
 *   - read(): Promise<BookmarkEntry[]> —— 启动 / 焦点时拉一次, 拿最新
 *   - add(url, title): Promise<BookmarkEntry[]> —— 按 url 去重 (主进程做)
 *   - remove(idOrUrl): Promise<BookmarkEntry[]> —— id 优先, 拿不到就按 url
 *
 * 防御:
 *   - window.gacode 不存在 (dev / 异常 load) → 所有方法返 [] 走 fallback
 *   - IPC 抛异常 → 同样 catch 返 [], 不阻塞 UI
 */

import type { BookmarkEntry } from '../../shared/types';

interface GacodeBookmarks {
  read: () => Promise<BookmarkEntry[]>;
  add: (entry: { url: string; title: string }) => Promise<BookmarkEntry[]>;
  remove: (idOrUrl: string) => Promise<BookmarkEntry[]>;
}

function getBridge(): GacodeBookmarks | null {
  if (typeof window === 'undefined') return null;
  const g = (window as unknown as { gacode?: { bookmarks?: GacodeBookmarks } }).gacode;
  return g?.bookmarks ?? null;
}

export function getBookmarkUrl(url: string): Promise<BookmarkEntry | null> {
  return readBookmarks().then((list) => list.find((b) => b.url === url) ?? null);
}

export async function readBookmarks(): Promise<BookmarkEntry[]> {
  const bridge = getBridge();
  if (!bridge) return [];
  try {
    return (await bridge.read()) ?? [];
  } catch (err) {
    console.warn('[gacode-electron] readBookmarks failed', err);
    return [];
  }
}

export async function addBookmark(
  url: string,
  title: string,
): Promise<BookmarkEntry[]> {
  const bridge = getBridge();
  if (!bridge) return [];
  try {
    return await bridge.add({ url, title });
  } catch (err) {
    console.warn('[gacode-electron] addBookmark failed', err);
    return [];
  }
}

export async function removeBookmark(idOrUrl: string): Promise<BookmarkEntry[]> {
  const bridge = getBridge();
  if (!bridge) return [];
  try {
    return await bridge.remove(idOrUrl);
  } catch (err) {
    console.warn('[gacode-electron] removeBookmark failed', err);
    return [];
  }
}
