/**
 * electron/client-tools/browser.ts —— `pc_browser_open` 的端侧实现（M0）
 *
 * [2026-11-15] 设计依据: 根目录 docs/design/pc-browser-agent-2026-11.md。
 *
 * ## 它是什么 / 不是什么
 *
 * PC 端**本来就有浏览器**（`electron/main.ts` 的 BrowserView tab 池 +
 * `src/routes/Browser.tsx` 的渲染层 `<webview>`）。本文件**不是新浏览器**，
 * 只是把已有的 tab 池接成 `pc_*` 端侧工具能调的一层薄控制。
 *
 * ## 共用 tab 池（PM 2026-11-15 拍板）
 *
 * - 用户和 agent **共用同一个 BrowserView 池**（`main.ts` 的 `browserTabs` Map）。
 * - tab 被用户关掉 ⇒ `main.ts` 的 `destroyed` 监听会把它从 Map 里删掉
 *   ⇒ 本文件按 url 找不到活 tab ⇒ **自己再开一个**（不报错、不要求用户手动恢复）。
 * - ⛔ 不另起独立窗口、不另建 tab 池 —— 用户看得见 agent 开了什么，也能随时接管/关掉。
 *
 * ## M0 范围
 *
 * 只实现 `pc_browser_open`（返回 `url` / `title` / `tabId`）。
 * `snapshot` / `act` / `shot` 在 M1~M2；危险动作闸门在 M4。
 *
 * ## 端侧职责边界（L-24n / L-25q）
 *
 * ⛔ 端侧**只负责跑 + 如实回报**，不拼模型上下文。
 *    返回 `stdout` 是一行紧凑 JSON（≤ 1 KB），折叠由 gaclaw 的 `foldClientResult` 做。
 * ⛔ 不返回整页 HTML、不返回 cookie / token 明文。
 */

import type { BrowserView } from 'electron';
import type { ClientToolResult } from './types.ts';

// ===========================================================================
// 依赖注入：主进程的 tab 池
// ===========================================================================

/**
 * `main.ts` 持有的 BrowserView 池（跟渲染层 `openBrowserTab` **同一个 Map**）。
 *
 * ⚠️ 用注入而不是 `import { browserTabs } from '../main'`：
 *    ① 避免 `main.ts` ↔ `client-tools/executor.ts` 循环依赖；
 *    ② 本文件能被 node --test 直接加载（单测里不注入 ⇒ 走"未接线"分支）。
 */
export interface BrowserTabEntry {
  view: BrowserView;
  url: string;
  createdAt: number;
}

export interface BrowserTabPool {
  /** 复用/新建一个 tab 并加载 url。返回值跟 `gacode:open-browser-tab` 一致。 */
  open(url: string): Promise<{ tabId: string; title: string }>;
  /** 列出当前活着的 tab（按 url 找复用目标）。 */
  entries(): Iterable<[string, BrowserTabEntry]>;
  /** 读一个活 tab 的标题（复用分支也要如实回报，不回空串）。 */
  titleOf?(tabId: string): string;
}

let pool: BrowserTabPool | null = null;

/** `main.ts` 在 `registerBrowserTabIpc()` 里调一次。 */
export function setBrowserTabPool(next: BrowserTabPool | null): void {
  pool = next;
}

/** 有没有接线（单测 / 主进程没起时用）。 */
export function hasBrowserTabPool(): boolean {
  return pool !== null;
}

// ===========================================================================
// 纯逻辑：URL 校验（可单测，不依赖 electron）
// ===========================================================================

/** 允许的协议 —— ⛔ 不许 `file:` / `javascript:` / `data:`（本地文件 / XSS 面）。 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * 校验并归一化 URL。
 * @returns 归一化后的 url；不合法 ⇒ 抛 Error（错误信息直接回给模型，要说人话）。
 */
export function normalizeBrowserUrl(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) {
    throw new Error('pc_browser_open 缺 url');
  }
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error(`pc_browser_open 的 url 不是合法 URL: ${String(raw).slice(0, 120)}`);
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(
      `pc_browser_open 只支持 http/https，收到 ${parsed.protocol}（file:/javascript:/data: 一律拒绝）`,
    );
  }
  return parsed.toString();
}

/** 池里有没有一个还活着、且正开着这个 url 的 tab。 */
export function findLiveTabId(
  entries: Iterable<[string, BrowserTabEntry]> | null,
  url: string,
): string | null {
  if (!entries) return null;
  for (const [tabId, entry] of entries) {
    if (entry.url !== url) continue;
    // tab 被关掉 ⇒ webContents 已销毁 ⇒ 不算活 tab（让 open 自己重建）。
    if (!entry.view || entry.view.webContents.isDestroyed()) continue;
    return tabId;
  }
  return null;
}

// ===========================================================================
// pc_browser_open
// ===========================================================================

/** `pc_browser_open` 的入参形状（M0）。 */
export interface BrowserOpenArgs {
  url: unknown;
  /** M3 才用的 profile（partition 名）。M0 只做校验，不改池行为。 */
  profile?: unknown;
}

/**
 * 打开（或复用）一个浏览器 tab，返回 url / title / tabId。
 *
 * 结果**只走 stdout**，不产 artifacts（M0 不截图）。
 */
export async function pcBrowserOpen(
  rawArgs: Record<string, unknown> | null,
): Promise<ClientToolResult> {
  let url: string;
  try {
    url = normalizeBrowserUrl(rawArgs && rawArgs.url);
  } catch (e) {
    return { status: 'error', error: (e as Error).message };
  }

  if (!pool) {
    return {
      status: 'error',
      error: '浏览器池还没接线（主进程未就绪）—— 请稍后重试',
    };
  }

  try {
    // ① 先找活着的同 url tab ⇒ 共用（用户手动开的那个也能被 agent 复用）。
    const reused = findLiveTabId(pool.entries(), url);
    if (reused) {
      let title = '';
      try { title = pool.titleOf?.(reused) || ''; } catch { /* tab 刚好销毁 ⇒ 空标题 */ }
      return {
        status: 'ok',
        exitCode: 0,
        stdout: JSON.stringify({ tool: 'pc_browser_open', url, tabId: reused, reused: true, title }),
      };
    }

    // ② 没有 ⇒ 自己再起一个（用户关掉了 / 从来没开过）。
    const opened = await pool.open(url);
    return {
      status: 'ok',
      exitCode: 0,
      stdout: JSON.stringify({
        tool: 'pc_browser_open',
        url,
        tabId: opened.tabId,
        title: opened.title || '',
        reused: false,
      }),
    };
  } catch (e) {
    return {
      status: 'error',
      error: `打开浏览器失败: ${(e as Error).message}`,
    };
  }
}
