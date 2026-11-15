/**
 * electron/client-tools/browser.ts —— `pc_browser_*` 的端侧实现
 *
 * [2026-11-15] 设计依据: 根目录 docs/design/pc-browser-agent-2026-11.md。
 * M0: `pc_browser_open`（开/复用 tab）
 * M1: `pc_browser_snapshot`（DOM 文本 + 元素编号表 + 硬限长）
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
 * ## M0 / M1 范围
 *
 * M0 只实现 `pc_browser_open`（返回 `url` / `title` / `tabId`）。
 * M1 加 `pc_browser_snapshot`（**只读**：可读文本 + 元素编号表，硬限长）。
 * `act` / `shot` 在 M2；危险动作闸门在 M4。
 *
 * ## 端侧职责边界（L-24n / L-25q）
 *
 * ⛔ 端侧**只负责跑 + 如实回报**，不拼模型上下文。
 *    `open` 回一行紧凑 JSON（≤ 1 KB）；`snapshot` **回传前**就完成硬限长
 *    （正文 8 KB / 元素 200 项 / 总量 12 KB）⇒ 不许把整页 HTML 塞进上下文
 *    （2026-11-13「工具返回无上限 ⇒ 32 万 token ⇒ 整轮挂掉」的血泪）。
 *    折叠由 gaclaw 的 `foldClientResult` 做。
 * ⛔ 不返回 cookie / token / `<script>` 内容。
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
  /**
   * ★ M1：在活 tab 的**页面主世界**跑一段只读 JS，拿回原始快照。
   *
   * ⚠️ 传进来的脚本由本模块生成（不是模型给的）⇒ 模型**不能**借这条口子执行任意 JS。
   * 落在 `main.ts` 里就是 `view.webContents.executeJavaScript(src)`。
   */
  evalInTab?(tabId: string, script: string): Promise<unknown>;
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

// ===========================================================================
// M1 · pc_browser_snapshot —— 只读 DOM 快照 + 元素编号表 + 硬限长
// ===========================================================================

/** 硬限长（回传前生效；防上下文顶爆）。 */
export const SNAPSHOT_LIMITS = {
  /** 正文文本字节上限（按 UTF-8 算，中文按 3 字节）。 */
  TEXT_BYTES: 8 * 1024,
  /** 元素表最多多少项。 */
  MAX_ELEMENTS: 200,
  /** 单个元素 text 最多多少字符（不是字节）。 */
  ELEMENT_TEXT_CHARS: 80,
  /** 整个 stdout JSON 字节上限（兜底，前面两项都过了也可能超）。 */
  TOTAL_BYTES: 12 * 1024,
} as const;

/** 页面里注入的那段**只读**脚本（固定常量，⛔ 模型不能改）。 */
export const SNAPSHOT_SCRIPT = `(() => {
  // ⛔ 只读：不改 DOM、不发请求、不取凭据或本地存储
  const SKIP = new Set(['SCRIPT','STYLE','NOSCRIPT','TEMPLATE','SVG','IFRAME']);
  const body = document.body || document.documentElement;
  if (!body) return { title: document.title || '', url: location.href, text: '', elements: [] };

  // ① 可读文本：TreeWalker 只收文本节点，跳过 script/style/隐藏元素
  const chunks = [];
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || SKIP.has(p.tagName)) return NodeFilter.FILTER_REJECT;
      const s = (n.nodeValue || '').trim();
      if (!s) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n;
  while ((n = walker.nextNode())) {
    const s = (n.nodeValue || '').replace(/\\s+/g, ' ').trim();
    if (s) chunks.push(s);
    if (chunks.length > 4000) break;   // 页面再大也不让注入层爆
  }

  // ② 可交互元素 → 编号表素材（编号在宿主侧生成，页面里不给 id）
  const SEL = 'a,button,input,textarea,select,[role="button"],[role="link"],[contenteditable="true"]';
  const elements = [];
  for (const el of body.querySelectorAll(SEL)) {
    if (elements.length >= 400) break;
    const r = el.getBoundingClientRect();
    // 不可见（0 尺寸 / display:none / visibility:hidden）⇒ 不收
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    let text = (el.innerText || el.value || el.getAttribute('aria-label') ||
                el.getAttribute('placeholder') || el.getAttribute('title') || '').trim();
    text = text.replace(/\\s+/g, ' ').slice(0, 200);
    elements.push({
      tag: el.tagName.toLowerCase(),
      text,
      role: el.getAttribute('role') || '',
      placeholder: el.getAttribute('placeholder') || '',
      // ⛔ 不读 href / value / 序列化整节点 —— 不把 URL 参数里的 token 带出来
    });
  }
  return { title: document.title || '', url: location.href, text: chunks.join('\\n'), elements };
})()`;

/** 注入脚本返回的原始形状。 */
export interface RawSnapshot {
  title?: unknown;
  url?: unknown;
  text?: unknown;
  elements?: unknown;
}

/** 带编号的元素（模型引用 `e12` 用）。 */
export interface SnapshotElement {
  id: string;
  tag: string;
  text: string;
  role?: string;
  placeholder?: string;
}

/** 编号表内存态（按 tabId 存；⛔ 不落盘、不进日志）。 */
const elementIndex = new Map<string, { ids: string[]; at: number }>();

/** 本次快照的编号集是否有效（M2 `act` 用：引用过期编号 ⇒ stale_element_ref）。 */
export function isFreshElementRef(tabId: string, ref: string): boolean {
  const rec = elementIndex.get(tabId);
  return !!rec && rec.ids.includes(ref);
}

/** 清空某个 tab 的编号表（tab 销毁时调）。 */
export function clearElementIndex(tabId: string): void {
  elementIndex.delete(tabId);
}

/** 按 UTF-8 字节截断字符串（不切坏 surrogate pair）。 */
function truncateUtf8(s: string, maxBytes: number): { text: string; truncated: boolean } {
  const buf = Buffer.from(s, 'utf8');
  if (buf.length <= maxBytes) return { text: s, truncated: false };
  // 用 Buffer 的 decoder 保证不吐出半个汉字 / 半个 emoji
  const cut = buf.subarray(0, maxBytes).toString('utf8');
  return { text: cut, truncated: true };
}

/** 从原始注入结果造出「编号元素表」（纯函数，可单测）。 */
export function buildElementIndex(tabId: string, raw: unknown): SnapshotElement[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: SnapshotElement[] = [];
  for (let i = 0; i < list.length && out.length < SNAPSHOT_LIMITS.MAX_ELEMENTS; i += 1) {
    const e = list[i];
    if (!e || typeof e !== 'object') continue;
    const o = e as Record<string, unknown>;
    const text = String(o.text ?? '').slice(0, SNAPSHOT_LIMITS.ELEMENT_TEXT_CHARS);
    const item: SnapshotElement = {
      id: `e${i + 1}`,
      tag: String(o.tag ?? '').slice(0, 30),
      text,
    };
    if (o.role) item.role = String(o.role).slice(0, 30);
    if (o.placeholder) item.placeholder = String(o.placeholder).slice(0, 80);
    out.push(item);
  }
  elementIndex.set(tabId, { ids: out.map((x) => x.id), at: Date.now() });
  return out;
}

/**
 * 把原始快照**压成**回传给模型的紧凑 JSON 字符串（纯函数，可单测）。
 *
 * ⚠️ 三层限长全在这里做，⛔ 不许把 raw 直接 JSON.stringify 出去。
 */
export function buildSnapshotOutput(args: {
  tabId: string;
  raw: RawSnapshot;
  cursor?: number;
  limit?: number;
}): string {
  const { tabId, raw } = args;
  const fullText = typeof raw.text === 'string' ? raw.text : '';
  const cursor = Number.isInteger(args.cursor) && (args.cursor as number) > 0 ? (args.cursor as number) : 0;
  const limit = Number.isInteger(args.limit) && (args.limit as number) > 0
    ? Math.min(args.limit as number, SNAPSHOT_LIMITS.TEXT_BYTES)
    : SNAPSHOT_LIMITS.TEXT_BYTES;

  // ① 正文按 cursor 分页 + 字节截断
  const page = Buffer.from(fullText, 'utf8').subarray(cursor, cursor + limit).toString('utf8');
  const nextCursor = cursor + Buffer.from(page, 'utf8').length;
  const textTruncated = nextCursor < Buffer.from(fullText, 'utf8').length;

  // ② 元素表（只在第一页带；后续页不重复塞 200 项进上下文）
  const elements = cursor === 0 ? buildElementIndex(tabId, raw.elements) : [];

  const base = {
    tool: 'pc_browser_snapshot',
    tabId,
    url: typeof raw.url === 'string' ? raw.url.slice(0, 500) : '',
    title: typeof raw.title === 'string' ? raw.title.slice(0, 200) : '',
    text: page,
    elements,
    truncated: textTruncated || (cursor === 0 && Array.isArray(raw.elements) && raw.elements.length > SNAPSHOT_LIMITS.MAX_ELEMENTS),
    ...(textTruncated ? { next_cursor: nextCursor } : {}),
  };

  // ③ 总量兜底：还超就**依次**砍 text、再砍元素表，直到 ≤ 12KB。
  //    ⚠️ 光砍 text 不够 —— 200 项元素表本身就可能 > 12KB（实测 24KB）⇒
  //       上一版只砍 text 时 stdout 照样 24635 字节（单测 GC-P31-12 抓到）。
  //    ⚠️ 用循环算真实 JSON 字节，不靠估算（JSON 转义会放大字节数）。
  const render = (text: string, elems: SnapshotElement[], forceTruncated: boolean): string => {
    // ★ 游标语义：只看**正文实际给了多少字节** ⇒ 严格前进（at > cursor）
    //   且原文还没读完（at < fullBytes）才给 next_cursor。
    //   ⛔ text 被兜底砍到 0 时 at === cursor ⇒ **不给**（给了 0 就是假游标，
    //      模型拿 cursor=0 无限重读 ⇒ 测出来过 next_cursor>0 的坑）。
    const at = cursor + Buffer.byteLength(text, 'utf8');
    const hasMore = at > cursor && at < Buffer.byteLength(fullText, 'utf8');
    return JSON.stringify({
      ...base, text, elements: elems, truncated: base.truncated || forceTruncated,
      ...(hasMore ? { next_cursor: at } : {}),
    });
  };
  let out = render(page, elements, false);
  if (Buffer.byteLength(out, 'utf8') > SNAPSHOT_LIMITS.TOTAL_BYTES) {
    // ① 先砍 text（按 UTF-8 字节，decoder 保证不切坏汉字）
    let cut = page;
    let candidate = out;
    let guard = 0;
    while (Buffer.byteLength(candidate, 'utf8') > SNAPSHOT_LIMITS.TOTAL_BYTES && cut.length > 0 && guard < 64) {
      const nextBytes = Math.max(0, Math.floor(Buffer.byteLength(cut, 'utf8') / 2));
      const next = cut.slice(0, Math.floor(cut.length / 2));   // ⛔ 用字符二分，必然递减到空串
      cut = truncateUtf8(next, nextBytes).text;
      candidate = render(cut, elements, true);
      guard += 1;
      if (cut === '' ) break;
    }
    // ② text 砍到 0 还超 ⇒ 砍元素表（同样带保护）
    let elems = elements;
    let guard2 = 0;
    while (Buffer.byteLength(candidate, 'utf8') > SNAPSHOT_LIMITS.TOTAL_BYTES && elems.length > 0 && guard2 < 32) {
      elems = elems.slice(0, Math.floor(elems.length / 2));
      candidate = render(cut, elems, true);
      guard2 += 1;
    }
    out = candidate;
  }
  return out;
}

/**
 * 选一个活 tab：优先 `tabId` ⇒ 再按 `url` ⇒ 都没有就取**最近创建**的活 tab。
 * （共用池 ⇒ agent 缺省读的就是用户当前看着的那个页面。）
 */
export function resolveLiveTab(
  entries: Iterable<[string, BrowserTabEntry]> | null,
  wanted: { tabId?: string | null; url?: string | null },
): string | null {
  if (!entries) return null;
  const live: Array<[string, BrowserTabEntry]> = [];
  for (const [id, e] of entries) {
    if (!e?.view || e.view.webContents.isDestroyed()) continue;
    live.push([id, e]);
  }
  if (!live.length) return null;
  if (wanted.tabId) {
    const hit = live.find(([id]) => id === wanted.tabId);
    if (hit) return hit[0];
  }
  if (wanted.url) {
    const hit = live.find(([, e]) => e.url === wanted.url);
    if (hit) return hit[0];
  }
  if (wanted.tabId || wanted.url) return null;   // 明确指定了却找不到 ⇒ 不猜
  live.sort((a, b) => b[1].createdAt - a[1].createdAt);
  return live[0][0];
}

/** `pc_browser_snapshot` 的端侧实现。 */
export async function pcBrowserSnapshot(
  rawArgs: Record<string, unknown> | null,
): Promise<ClientToolResult> {
  if (!pool) {
    return { status: 'error', error: '浏览器池还没接线（主进程未就绪）—— 请稍后重试' };
  }
  if (!pool.evalInTab) {
    return { status: 'error', error: '这个 PC 版本的浏览器不支持读页面（evalInTab 未接线）' };
  }

  const args = rawArgs || {};
  const tabId = resolveLiveTab(pool.entries(), {
    tabId: typeof args.tabId === 'string' ? args.tabId : null,
    url: typeof args.url === 'string' ? args.url : null,
  });
  if (!tabId) {
    return {
      status: 'error',
      error: '没有可读取的浏览器页面（tab 可能已被关掉）—— 请先 pc_browser_open 打开一个页面',
    };
  }

  try {
    // ⚠️ 脚本是本模块的固定常量 ⇒ 模型给的任何参数都**不会**拼进 JS 里。
    const raw = (await pool.evalInTab(tabId, SNAPSHOT_SCRIPT)) as RawSnapshot;
    if (!raw || typeof raw !== 'object') {
      return { status: 'error', error: '页面读取失败：注入脚本没有返回快照对象' };
    }
    const stdout = buildSnapshotOutput({
      tabId,
      raw,
      cursor: typeof args.cursor === 'number' ? args.cursor : undefined,
      limit: typeof args.limit === 'number' ? args.limit : undefined,
    });
    return { status: 'ok', exitCode: 0, stdout };
  } catch (e) {
    return { status: 'error', error: `读取页面失败: ${(e as Error).message}` };
  }
}
