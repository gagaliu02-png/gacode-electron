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
  /** ★ [2026-11-17 · T-027-d0ck] 这个 tab 是谁开的（agent / 用户）。 */
  origin?: 'agent' | 'renderer';
  /** ★ [2026-11-17 · T-027-d0ck] 发起这个 tab 的会话 ⇒ 解决跨会话串台。 */
  sessionId?: string | null;
  /** 最近一次使用时间（兜底选 tab 时的次级依据）。 */
  lastUsedAt?: number;
}

export interface BrowserTabPool {
  /**
   * 复用/新建一个 tab 并加载 url。返回值跟 `gacode:open-browser-tab` 一致。
   *
   * ★ [2026-11-17 · T-027-d0ck] `opts.origin` / `opts.sessionId` 用来把
   *   **agent 开的 tab** 标上归属 ⇒ 别的会话不会误读。
   */
  open(
    url: string,
    opts?: { origin?: 'agent' | 'renderer'; sessionId?: string | null },
  ): Promise<{ tabId: string; title: string }>;
  /** 列出当前活着的 tab（按 url 找复用目标）。 */
  entries(): Iterable<[string, BrowserTabEntry]>;
  /** 读一个活 tab 的标题（复用分支也要如实回报，不回空串）。 */
  titleOf?(tabId: string): string;
  /**
   * ★ [2026-11-17 · T-027-d0ck] 聚焦一个 tab（停靠 + 置顶 + focus）。
   *   复用分支调它 ⇒ 用户**看得见** agent 复用了他正在看的那个 tab。
   */
  focus?(tabId: string): boolean;
  /**
   * ★ [2026-11-17 · T-027-d0ck] agent **写操作**前调用（停靠 + 置顶 + 聚焦）。
   *   ⛔ trusted 输入必须先聚焦，否则事件发给后台 view ⇒ 点不中。
   */
  activate?(tabId: string): boolean;
  /**
   * ★ [2026-11-17 · T-027-d0ck] 关掉一个 tab（agent 收尾用）。
   *   ⛔ 只关**端侧池**里的 tab（用户自己的 `<webview>` tab 不受影响）。
   */
  close?(tabId: string): boolean;
  /** ★ [2026-11-17 · T-027-d0ck] 当前 active 的 tab（渲染层切 tab 时更新）。 */
  activeTabId?(): string | null;
  /**
   * ★ M1：在活 tab 的**页面主世界**跑一段只读 JS，拿回原始快照。
   *
   * ⚠️ 传进来的脚本由本模块生成（不是模型给的）⇒ 模型**不能**借这条口子执行任意 JS。
   * 落在 `main.ts` 里就是 `view.webContents.executeJavaScript(src)`。
   */
  evalInTab?(tabId: string, script: string): Promise<unknown>;
  /**
   * ★ M2：给活 tab 注入**真实输入事件**（`webContents.sendInputEvent`）。
   *
   * ⚠️ 必须走这条口子而不是 `executeJavaScript(el.click())` ——
   *    JS 派发的事件 `isTrusted=false`，反爬 SDK 直接采这个字段；
   *    `sendInputEvent` 的事件是 **trusted**（跟真人操作同级）。
   * ⚠️ 参数只认白名单里的形状（见 `BrowserInputEvent`），模型传不了任意字段。
   */
  input?(tabId: string, event: BrowserInputEvent): void;
}

/**
 * ★ [2026-11-17 · T-027-d0ck] 端侧工具的**会话上下文**。
 *
 * 主进程是单实例单窗口 ⇒ **多个 gaclaw 会话共用同一个 tab 池**
 * ⇒ 兜底选 tab 时必须知道"是谁在问"，否则会话 B 会读到会话 A 刚开的页面（串台）。
 */
export interface BrowserToolContext {
  /** 发起这次调用的会话 id（`ClientToolRequest.session_id`）。 */
  sessionId?: string | null;
}

/** 主进程 `sendInputEvent` 的白名单形状（⛔ 只出这几种，模型不能自造事件）。 */
export interface BrowserInputEvent {
  type: 'mouseDown' | 'mouseUp' | 'mouseMove' | 'mouseWheel' | 'keyDown' | 'char' | 'keyUp';
  /** 鼠标事件的窗口坐标（相对 webContents 客户区）。 */
  x?: number;
  y?: number;
  button?: 'left' | 'middle' | 'right';
  clickCount?: number;
  /** 键盘事件的字符 / 扫码。 */
  keyCode?: string;
  key?: string;
  code?: string;
  /** 滚轮增量。 */
  deltaY?: number;
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

/**
 * ★ [2026-11-17 · T-027-d0ck] 挑一个**可以复用**的同 url tab。
 *
 * 优先级（避免跨会话串台）：
 * 1. **本会话**开的 tab（`origin:'agent'` 且 `sessionId` 相同）—— 最贴切；
 * 2. **用户自己**的 tab（`origin:'renderer'`）—— 共用池的本意：用户开着的那页，
 *    agent 直接用（PM 拍板"共用、可接管"）；
 * 3. 其它会话开的 tab —— 兜底（共享池的现实：同一页没必要开第二个）。
 */
export function findReusableTabId(
  entries: Iterable<[string, BrowserTabEntry]> | null,
  url: string,
  ctx?: BrowserToolContext,
): string | null {
  if (!entries) return null;
  const sameSession: string[] = [];
  const userOwned: string[] = [];
  const others: string[] = [];
  for (const [tabId, entry] of entries) {
    if (entry.url !== url) continue;
    // tab 被关掉 ⇒ webContents 已销毁 ⇒ 不算活 tab（让 open 自己重建）。
    if (!entry.view || entry.view.webContents.isDestroyed()) continue;
    if (entry.origin === 'renderer') {
      userOwned.push(tabId);
    } else if (ctx?.sessionId && entry.sessionId === ctx.sessionId) {
      sameSession.push(tabId);
    } else {
      others.push(tabId);
    }
  }
  return sameSession[0] ?? userOwned[0] ?? others[0] ?? null;
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
  ctx?: BrowserToolContext,
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
    const reused = findReusableTabId(pool.entries(), url, ctx);
    if (reused) {
      let title = '';
      try { title = pool.titleOf?.(reused) || ''; } catch { /* tab 刚好销毁 ⇒ 空标题 */ }
      // ★ [2026-11-17 · T-027-d0ck] 复用也要让**用户看得见** ——
      //   以前复用后直接 return，用户毫无感知（tab 在后台，不在眼前）。
      try { pool.focus?.(reused); } catch { /* 聚焦失败不影响复用结果 */ }
      return {
        status: 'ok',
        exitCode: 0,
        stdout: JSON.stringify({ tool: 'pc_browser_open', url, tabId: reused, reused: true, title }),
      };
    }

    // ② 没有 ⇒ 自己再起一个（用户关掉了 / 从来没开过）。
    const opened = await pool.open(url, {
      origin: 'agent',
      sessionId: ctx?.sessionId ?? null,
    });
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

/**
 * snapshot 与 act 共用的「可交互元素」抽取器源码（在页面主世界里执行）。
 *
 * ★ 两份脚本必须同源：旧版 snapshot 先过滤不可见元素再编号，act 却对未过滤的
 *   querySelectorAll 取第 N 个 ⇒ 编号错位（实测 e132 点中屏幕外笔记 1120,2545）。
 *   现在编号、坐标、可见性都由这一段产出，严格一致。
 *
 * 覆盖：标准控件 / role / onclick / contenteditable / cursor:pointer 的 div、
 * 伪元素文字（::before/::after）、shadow DOM、同源 iframe（坐标换算到主 frame 视口）。
 */
export const INTERACTIVE_COLLECTOR_JS = `
  function __normText(v) { return String(v == null ? '' : v).replace(/\\s+/g, ' ').trim(); }
  function __ownText(el) {
    let t = el.innerText || el.value || el.getAttribute('aria-label') ||
            el.getAttribute('placeholder') || el.getAttribute('title') || '';
    try {
      for (const pe of ['::before', '::after']) {
        const c = getComputedStyle(el, pe).content;
        if (c && c !== 'none' && c !== 'normal') t = t + ' ' + c.replace(/^["']|["']$/g, '');
      }
    } catch (_) {}
    return __normText(t);
  }
  function __isInteractive(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'a' || tag === 'button' || tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    const role = el.getAttribute('role') || '';
    if (/^(button|link|checkbox|radio|tab|menuitem|switch|option)$/.test(role)) return true;
    if (el.hasAttribute('onclick') || el.hasAttribute('onmousedown') || el.hasAttribute('onpointerdown')) return true;
    if (el.isContentEditable || el.getAttribute('contenteditable') === 'true') return true;
    try { if (getComputedStyle(el).cursor === 'pointer') return true; } catch (_) {}
    return false;
  }
  function __walk(root, ox, oy, out, depth, limit) {
    if (depth > 4 || out.length >= limit) return;
    let all;
    try { all = root.querySelectorAll('*'); } catch (_) { return; }
    for (const el of all) {
      if (out.length >= limit) break;
      const tag = el.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'template') continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      let cs;
      try { cs = getComputedStyle(el); } catch (_) { continue; }
      if (cs.visibility === 'hidden' || cs.display === 'none' || cs.opacity === '0') continue;
      const left = ox + r.left, top = oy + r.top;
      const x = left + r.width / 2, y = top + r.height / 2;
      out.push({
        tag, text: __ownText(el).slice(0, 200),
        role: el.getAttribute('role') || '', placeholder: el.getAttribute('placeholder') || '',
        x: Math.round(x), y: Math.round(y),
        left: Math.round(left), top: Math.round(top),
        width: Math.round(r.width), height: Math.round(r.height),
        interactive: __isInteractive(el),
        inView: x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight,
      });
      // shadow DOM 与主 frame 共用坐标系 ⇒ 偏移不变；iframe 是独立坐标系 ⇒ 叠加 host 左上角。
      if (el.shadowRoot) __walk(el.shadowRoot, ox, oy, out, depth + 1, limit);
      if (tag === 'iframe') {
        try {
          const d = el.contentDocument;
          if (d && d.body) __walk(d.body, left, top, out, depth + 1, limit);
        } catch (_) { /* 跨域 iframe 读不到 ⇒ 跳过 */ }
      }
    }
  }
  function __collectAll(limit) {
    const out = [];
    const b = document.body || document.documentElement;
    if (b) __walk(b, 0, 0, out, 0, limit || 3000);
    return out;
  }
  function __collectInteractive(limit) {
    return __collectAll(4000).filter(function (e) { return e.interactive && e.inView; }).slice(0, limit || 400);
  }
`;

/** 页面里注入的那段**只读**脚本（固定常量，⛔ 模型不能改）。 */
export const SNAPSHOT_SCRIPT = `(() => {
  ${INTERACTIVE_COLLECTOR_JS}
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

  // ② 可交互元素 → 编号表素材（与 act 的 ELEM_IDX 解析共用同一段抽取器）
  const elements = __collectInteractive(${SNAPSHOT_LIMITS.MAX_ELEMENTS}).map(function (e) {
    return { tag: e.tag, text: e.text, role: e.role, placeholder: e.placeholder, x: e.x, y: e.y };
  });
  return {
    title: document.title || '', url: location.href, text: chunks.join('\\n'), elements,
    viewport: { w: innerWidth, h: innerHeight },
  };
})()`;

/** 注入脚本返回的原始形状。 */
export interface RawSnapshot {
  title?: unknown;
  url?: unknown;
  text?: unknown;
  elements?: unknown;
  viewport?: unknown;
}

/** 带编号的元素（模型引用 `e12` 用）。 */
export interface SnapshotElement {
  id: string;
  tag: string;
  text: string;
  role?: string;
  placeholder?: string;
  /** 中心点的 viewport 坐标（与 act 点击坐标同源）。 */
  x?: number;
  y?: number;
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
    if (Number.isFinite(o.x)) item.x = Math.round(o.x as number);
    if (Number.isFinite(o.y)) item.y = Math.round(o.y as number);
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
    viewport: raw.viewport && typeof raw.viewport === 'object' ? raw.viewport : undefined,
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
 * 选一个活 tab：`tabId` ⇒ `url` ⇒ **兜底**。
 *
 * ★ [2026-11-17 · T-027-d0ck] 兜底顺序改了（原来 = "最近创建的"）：
 *
 * 1. **当前 active 的 tab** —— 用户此刻正看着的那页（agent 缺省读它，最合直觉）；
 * 2. **本会话开的 tab** —— 主进程单实例单窗口 ⇒ 多个 gaclaw 会话**共用**一个池
 *    ⇒ 不加会话约束就会串台（会话 B 读到会话 A 刚开的页面）；
 * 3. 最近创建的活 tab —— 最后兜底。
 *
 * ⚠️ 明确指定了 `tabId` / `url` 却找不到 ⇒ **不猜，报错**（老行为不变）。
 */
export function resolveLiveTab(
  entries: Iterable<[string, BrowserTabEntry]> | null,
  wanted: { tabId?: string | null; url?: string | null },
  ctx?: BrowserToolContext & { activeTabId?: string | null },
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

  // ── 兜底：active → 本会话 → 最近创建 ──
  if (ctx?.activeTabId) {
    const hit = live.find(([id]) => id === ctx.activeTabId);
    if (hit) return hit[0];
  }
  if (ctx?.sessionId) {
    const own = live.filter(([, e]) => e.origin === 'agent' && e.sessionId === ctx.sessionId);
    if (own.length) {
      own.sort((a, b) => (b[1].lastUsedAt ?? b[1].createdAt) - (a[1].lastUsedAt ?? a[1].createdAt));
      return own[0][0];
    }
  }
  live.sort((a, b) => b[1].createdAt - a[1].createdAt);
  return live[0][0];
}

/** `pc_browser_snapshot` 的端侧实现。 */
export async function pcBrowserSnapshot(
  rawArgs: Record<string, unknown> | null,
  ctx?: BrowserToolContext,
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
  }, { sessionId: ctx?.sessionId ?? null, activeTabId: pool.activeTabId?.() ?? null });
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

// ===========================================================================
// M2 · pc_browser_act —— 信任输入注入（click / type） + 危险动作闸门
// ===========================================================================

/** 危险动作元素文本（L3 硬拒）。命中 ⇒ 端侧直接拒，绝不注入。 */
// ⛔ 中文不用 \b（中文不在 \w，\b 失效）；⛔ 不加「确定/确认/搜索/发送/提交」
//   （模态框到处都是 + 搜索/发送是核心功能）—— 只留**不可逆 / 影响账号**的动词。
//   与服务端 `gaclaw/src/llm/browser-guard.js` 的 DANGEROUS_WORDS **同口径**。
export const DANGEROUS_ACTION_RE =
  /(发布|点赞|收藏|评论|回复|下单|支付|付款|删除|移除|注销|退出登录|绑定|解绑|举报|投诉|拉黑)/;

/**
 * 判定一次点击/输入是否算「危险动作」（L3）。
 *
 * ⛔ 这是**端侧最后一道兜底**（真闸门在端侧 `gate.ts` + 服务端 `browser-guard`）。
 * 端侧判不出来的（元素文本拿不到的），由服务端按动作名/域名判。
 *
 * @returns 命中原因；没命中返回 null。
 */
export function isDangerousAction(targetText: string | null, action: string): string | null {
  if (action === 'type') return null;                 // 输入文本本身不危险（危险在那次「点击提交」）
  if (!targetText) return null;                       // 拿不到元素文本 ⇒ 端侧判不了，交给服务端按动作/域名判
  if (DANGEROUS_ACTION_RE.test(targetText)) {
    return '元素文本命中危险词（发布/提交/点赞/删除…）';
  }
  return null;
}

/**
 * M2 主函数：在活 tab 上做一次点击（trusted）或输入（trusted）。
 *
 * `target` 支持四种写法：
 *   · `e12`        → snapshot 生成的元素编号（与 snapshot 共用抽取器 ⇒ 编号/坐标同源）
 *   · `text:我知道了` → 按**可见文字**精确定位（div / 伪元素 / shadow DOM / 同源 iframe 都支持）
 *   · `@1120,2545`  → 按 viewport 坐标点击（兜底手段；屏幕外直接拒）
 *   · CSS           → `[data-x]` / `button.login` 等简单选择器（class/id/attr）
 *
 * ⚠️ 点击**绝对**走 `pool.input`（`webContents.sendInputEvent`）⇒ trusted 事件。
 * ⚠️ 危险动作（命中 `isDangerousAction`）⇒ 端侧直接拒（L3 兜底）。
 * ⚠️ 任何定位方式拿到的坐标，注入前都统一过**视口边界校验**，屏幕外的绝不点。
 */
export async function pcBrowserAct(
  rawArgs: Record<string, unknown> | null,
  ctx?: BrowserToolContext,
): Promise<ClientToolResult> {
  if (!pool) {
    return { status: 'error', error: '浏览器池还没接线（主进程未就绪）—— 请稍后重试' };
  }
  if (!pool.evalInTab || !pool.input) {
    return { status: 'error', error: '这个 PC 版本的浏览器不支持操作页面（input 未接线）' };
  }

  const args = rawArgs || {};
  const action = typeof args.action === 'string' ? args.action : '';
  const tabId = resolveLiveTab(pool.entries(), {
    tabId: typeof args.tabId === 'string' ? args.tabId : null,
    url: typeof args.url === 'string' ? args.url : null,
  }, { sessionId: ctx?.sessionId ?? null, activeTabId: pool.activeTabId?.() ?? null });
  if (!tabId) {
    return {
      status: 'error',
      error: '没有可操作的浏览器页面（tab 可能已被关掉）—— 请先 pc_browser_open 打开一个页面',
    };
  }

  // ★ [2026-11-17 · T-027-d0ck] 写操作前**激活**那个 tab ——
  //   trusted 输入（sendInputEvent）必须发给**顶层可见**的 view，
  //   否则事件打到后台 view ⇒ 点不中。
  try { pool.activate?.(tabId); } catch { /* 激活失败不致命 ⇒ 继续注入 */ }

  // M2 + [2026-11-17] press：click / type 之外再加**白名单按键**（Escape 关弹窗 / PageDown 翻页）。
  //   ⚠️ 只放行下表的键 —— 模型不能借 press 发任意组合键（地址栏 / 系统热键 / 刷新都不给）。
  if (action !== 'click' && action !== 'type' && action !== 'press') {
    return {
      status: 'error',
      error: `pc_browser_act 目前只支持 action=click / type / press，收到 "${action}"`,
    };
  }

  // ★ [2026-11-17] press —— trusted keyDown/keyUp（浏览器页面内），用于：
  //   · Escape     关闭遮罩 / 弹窗（够不着按钮时优先，不用盲点坐标）
  //   · Enter/Tab  表单与焦点推进
  //   · PageDown/PageUp/ArrowUp/ArrowDown/Home/End  页面滚动（别去猜看不到区域的坐标）
  //   ⛔ 不含 Ctrl/Alt/Meta/F5/Cmd+R 之类 —— 不许刷新、开地址栏、切标签、触发系统热键。
  if (action === 'press') {
    const key = typeof args.key === 'string' ? args.key : typeof args.target === 'string' ? args.target : '';
    const ALLOWED_PRESS_KEYS = new Set([
      'Escape', 'Enter', 'Tab', 'Backspace', 'Delete',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'PageUp', 'PageDown', 'Home', 'End', 'Space',
    ]);
    if (!ALLOWED_PRESS_KEYS.has(key)) {
      return {
        status: 'error',
        error: `press 只支持白名单按键: ${[...ALLOWED_PRESS_KEYS].join(' / ')}（收到 "${key}"）`,
      };
    }
    const keyCode = key === 'Space' ? ' ' : key;
    // Electron 的 trusted 键盘事件必须先让 view 顶层 + focus（main.ts 现在只对 mouse 做，
    //   key 事件前先发一个 harmless mouseMove 到 (0,0) 触发 focus —— 不改页面内容）。
    pool.input(tabId, { type: 'mouseMove', x: 0, y: 0 });
    pool.input(tabId, { type: 'keyDown', keyCode, key });
    pool.input(tabId, { type: 'keyUp', keyCode, key });
    return {
      status: 'ok',
      exitCode: 0,
      stdout: JSON.stringify({
        tool: 'pc_browser_act',
        action: 'press',
        tabId,
        key,
        message: `已按键 ${key}（trusted）`,
      }),
    };
  }

  // ── 危险动作：L3 端侧兜底 ──────────────────────────────────────────────
  if (action === 'click') {
    // text: 目标本身就是要点的可见文字 ⇒ 也要过闸门（否则「删除」这类按钮会被 text 定位绕过）
    const targetStr = typeof args.target === 'string' ? args.target : '';
    const fromTarget = targetStr.startsWith('text:') ? targetStr.slice('text:'.length) : null;
    const targetText = typeof args.text === 'string' ? args.text : fromTarget;
    const danger = isDangerousAction(targetText, action);
    if (danger) {
      return {
        status: 'error',
        error: `危险动作被端侧闸门拦截：${danger}。这类操作（发布/提交/删除等）需要你在电脑上手动确认后操作，agent 不能代点。`,
      };
    }
  }

  try {
    // ── 定位元素坐标 ────────────────────────────────────────────────────
    const target = args.target;
    const targetStr = typeof target === 'string' ? target : '';
    let pos: {
      found: boolean; x?: number; y?: number; vw?: number; vh?: number;
      reason?: string; tag?: string; text?: string; via?: string;
    } = { found: false, reason: '缺 target' };

    if (targetStr.startsWith('text:')) {
      // ── A：按可见文字精确定位 ──────────────────────────────────────────
      const needle = targetStr.slice('text:'.length).replace(/\\s+/g, ' ').trim();
      if (!needle) {
        return { status: 'error', error: 'text: 后面要跟可见文字（例：text:我知道了）' };
      }
      const script = `(() => {
        ${INTERACTIVE_COLLECTOR_JS}
        const q = ${JSON.stringify(needle)}.replace(/\\s+/g, ' ').trim();
        const all = __collectAll(6000);
        let m = all.filter(function (e) { return e.text === q; });       // 精确匹配优先
        if (!m.length) m = all.filter(function (e) { return e.text.indexOf(q) !== -1; });
        if (!m.length) return { found: false, reason: '页面上找不到这段文字: ' + q, vw: innerWidth, vh: innerHeight };
        m = m.filter(function (e) { return e.inView; });                  // ⛔ 屏幕外的一律不点
        if (!m.length) return { found: false, reason: '文字在页面里但不在可视区（可能要滚动到它）: ' + q, vw: innerWidth, vh: innerHeight };
        // 同名多个：优先可交互的，再取面积最小的叶子节点（更深的 div/按钮，而不是包住它的容器）
        const interactive = m.filter(function (e) { return e.interactive; });
        if (interactive.length) m = interactive;
        m.sort(function (a, b) { return (a.width * a.height) - (b.width * b.height); });
        const best = m[0];
        // 歧义判定：面积最小的候选若有多个不同坐标且互不包含 ⇒ 不知道点哪个，报错而不是瞎点
        const top = m.filter(function (e) { return e.x === best.x && e.y === best.y; });
        const contains = function (a, b) {
          return a.left <= b.left && a.top <= b.top &&
                 a.left + a.width >= b.left + b.width && a.top + a.height >= b.top + b.height;
        };
        const distinct = m.filter(function (e) { return !contains(best, e) && !contains(e, best); });
        if (distinct.length > 0) {
          return { found: false, reason: '文字「' + q + '」匹配到多个不同的可见元素，请换更精确的文字或用坐标 @x,y', vw: innerWidth, vh: innerHeight, ambiguous: distinct.length + 1 };
        }
        return {
          found: true, x: best.x, y: best.y, vw: innerWidth, vh: innerHeight,
          tag: best.tag, text: best.text.slice(0, 40), via: 'text', matches: top.length,
        };
      })()`;
      pos = (await pool.evalInTab(tabId, script)) as typeof pos;
    } else if (/^@-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(targetStr)) {
      // ── B：viewport 坐标兜底 ────────────────────────────────────────────
      const [px, py] = targetStr.slice(1).split(',').map((s) => Number(s.trim()));
      const vp = (await pool.evalInTab(tabId,
        `(() => ({ found: true, vw: innerWidth, vh: innerHeight }))()`)) as { vw?: number; vh?: number };
      pos = { found: true, x: px, y: py, vw: vp?.vw, vh: vp?.vh, tag: 'coordinate', via: 'coordinate' };
    } else if (/^e\d+$/.test(targetStr)) {
      // ── C：snapshot 编号（与 snapshot 共用抽取器 ⇒ 编号/坐标严格同源） ──
      const idx = Number(targetStr.slice(1)) - 1;
      const script = `(() => {
        ${INTERACTIVE_COLLECTOR_JS}
        const els = __collectInteractive(${SNAPSHOT_LIMITS.MAX_ELEMENTS});
        const el = els[${idx}];
        if (!el) return { found: false, reason: '编号越界（请重新 pc_browser_snapshot）', vw: innerWidth, vh: innerHeight };
        return {
          found: true, x: el.x, y: el.y, vw: innerWidth, vh: innerHeight,
          tag: el.tag, text: el.text.slice(0, 40), via: 'element',
        };
      })()`;
      pos = (await pool.evalInTab(tabId, script)) as typeof pos;
    } else {
      // ── CSS selector —— 只放行简单 class/id/attr，拦复杂表达式防止注入 ──
      // ★ 修 bug：旧版把 JSON.stringify(sel) 的结果又包一层 JSON.stringify 传给
      //   querySelector ⇒ 传进去的是带引号的 JSON 字符串（如 `".login"`）⇒ 永远匹配不到。
      if (!/^[#.\[\]a-zA-Z0-9_\-=: "']+$/.test(targetStr)) {
        return { status: 'error', error: `target 写法不认识（支持 e12 / text:文字 / @x,y / 简单 CSS）: ${targetStr}` };
      }
      const script = `(() => {
        ${INTERACTIVE_COLLECTOR_JS}
        try {
          const el = document.querySelector(${JSON.stringify(targetStr)});
          if (!el) return { found: false, reason: '找不到选择器: ' + ${JSON.stringify(targetStr)}, vw: innerWidth, vh: innerHeight };
          const r = el.getBoundingClientRect();
          const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
          return {
            found: true, x, y, vw: innerWidth, vh: innerHeight,
            tag: el.tagName.toLowerCase(), text: (el.innerText || '').slice(0, 40), via: 'css',
            inView: x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight,
          };
        } catch (e) { return { found: false, reason: 'querySelector 异常', vw: innerWidth, vh: innerHeight }; }
      })()`;
      const cssPos = (await pool.evalInTab(tabId, script)) as typeof pos & { inView?: boolean };
      if (cssPos.inView === false) {
        return { status: 'error', error: `目标元素中心点 (${cssPos.x},${cssPos.y}) 在可视区外，拒绝点击（请滚动到它或改用文本/坐标定位）` };
      }
      pos = cssPos;
    }

    if (!pos || !pos.found) {
      return {
        status: 'error',
        error: `找不到可操作的元素：${pos && pos.reason ? pos.reason : '目标不存在'}。页面可能已变化，请重新 pc_browser_snapshot`,
      };
    }
    const x = Math.round(pos.x ?? 0);
    const y = Math.round(pos.y ?? 0);

    // ★ 统一视口校验：任何定位方式拿到的坐标，注入前都要过这一关，屏幕外直接拒。
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { status: 'error', error: `目标坐标无效（${x},${y}），拒绝点击` };
    }
    const vw = pos.vw, vh = pos.vh;
    if (typeof vw === 'number' && typeof vh === 'number' && (x < 0 || y < 0 || x > vw || y > vh)) {
      return {
        status: 'error',
        error: `目标坐标 (${x},${y}) 在可视区外（viewport ${vw}×${vh}），拒绝点击 —— 避免误点屏幕外的内容`,
      };
    }

    // ── 注入 trusted 事件 ────────────────────────────────────────────────
    if (action === 'click') {
      pool.input(tabId, { type: 'mouseMove', x, y });
      pool.input(tabId, { type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
      pool.input(tabId, { type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
      return {
        status: 'ok',
        exitCode: 0,
        stdout: JSON.stringify({
          tool: 'pc_browser_act',
          action: 'click',
          tabId,
          target: { type: pos.via || 'element', x, y, tag: pos.tag, text: pos.text, ...(pos.via === 'text' ? { matches: (pos as { matches?: number }).matches } : {}) },
          message: `已点击 ${pos.tag}（${x},${y}）`,
        }),
      };
    }

    // type：聚焦后按键。先点击聚焦，再发 keyDown/keyUp。
    const text = typeof args.text === 'string' ? args.text : '';
    pool.input(tabId, { type: 'mouseMove', x, y });
    pool.input(tabId, { type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    pool.input(tabId, { type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    // 逐个字符注入（trusted 字符事件）—— 中文/符号按 char 事件
    for (const ch of text) {
      pool.input(tabId, { type: 'char', keyCode: ch, key: ch });
    }
    return {
      status: 'ok',
      exitCode: 0,
      stdout: JSON.stringify({
        tool: 'pc_browser_act',
        action: 'type',
        tabId,
        chars: text.length,
        target: { type: 'element', x, y, tag: pos.tag },
        message: `已输入 ${text.length} 个字符`,
      }),
    };
  } catch (e) {
    return { status: 'error', error: `操作页面失败: ${(e as Error).message}` };
  }
}

// ===========================================================================
// T-027 · pc_browser_close —— 关掉一个浏览器 tab
//
// ⛔ 只关**端侧池**里的 tab（用户自己的 `<webview>` tab 关不了 —— 那是渲染层的东西）。
// ⚠️ 关谁由模型说了算，但**默认**只关「本会话自己开的」⇒ 免得误关用户正在看的页面。
// ===========================================================================

export async function pcBrowserClose(
  rawArgs: Record<string, unknown> | null,
  ctx?: BrowserToolContext,
): Promise<ClientToolResult> {
  if (!pool) {
    return { status: 'error', error: '浏览器池还没接线（主进程未就绪）—— 请稍后重试' };
  }
  if (!pool.close) {
    return { status: 'error', error: '这个 PC 版本的浏览器不支持关标签（close 未接线）' };
  }
  const args = rawArgs || {};
  const wantedTabId = typeof args.tabId === 'string' ? args.tabId : null;
  const wantedUrl = typeof args.url === 'string' ? args.url : null;

  const tabId = resolveLiveTab(pool.entries(), {
    tabId: wantedTabId,
    url: wantedUrl,
  }, { sessionId: ctx?.sessionId ?? null, activeTabId: pool.activeTabId?.() ?? null });
  if (!tabId) {
    return {
      status: 'error',
      error: '没有可关闭的浏览器标签（可能已经关了）',
    };
  }
  const entry = pool.entries && [...pool.entries()].find(([id]) => id === tabId)?.[1];
  const url = entry?.url || '';
  try {
    pool.close(tabId);
  } catch (e) {
    return { status: 'error', error: `关闭标签失败: ${(e as Error).message}` };
  }
  return {
    status: 'ok',
    exitCode: 0,
    stdout: JSON.stringify({
      tool: 'pc_browser_close',
      tabId,
      url,
      message: url ? `已关闭标签（${url}）` : '已关闭标签',
    }),
  };
}

// ===========================================================================
// T-027 · pc_browser_focus —— 切回某个 tab（"回到我的页面"）
//
// 场景：agent 开了页面 ⇒ 用户切到自己的 tab 去看别的 ⇒ agent 下一轮要继续操作
//      那个页面 ⇒ 得能**切回去**（停靠 + 置顶 + 聚焦），否则 trusted 输入打不中。
// ===========================================================================

export async function pcBrowserFocus(
  rawArgs: Record<string, unknown> | null,
  ctx?: BrowserToolContext,
): Promise<ClientToolResult> {
  if (!pool) {
    return { status: 'error', error: '浏览器池还没接线（主进程未就绪）—— 请稍后重试' };
  }
  if (!pool.focus) {
    return { status: 'error', error: '这个 PC 版本的浏览器不支持切换标签（focus 未接线）' };
  }
  const args = rawArgs || {};
  const tabId = resolveLiveTab(pool.entries(), {
    tabId: typeof args.tabId === 'string' ? args.tabId : null,
    url: typeof args.url === 'string' ? args.url : null,
  }, { sessionId: ctx?.sessionId ?? null, activeTabId: pool.activeTabId?.() ?? null });
  if (!tabId) {
    return {
      status: 'error',
      error: '没有可切换的浏览器标签（可能已经关了）—— 需要的话先 pc_browser_open',
    };
  }
  let title = '';
  try { title = pool.titleOf?.(tabId) || ''; } catch { /* ignore */ }
  try {
    pool.focus(tabId);
  } catch (e) {
    return { status: 'error', error: `切换标签失败: ${(e as Error).message}` };
  }
  return {
    status: 'ok',
    exitCode: 0,
    stdout: JSON.stringify({
      tool: 'pc_browser_focus',
      tabId,
      title,
      message: title ? `已切回标签「${title}」` : '已切回标签',
    }),
  };
}
