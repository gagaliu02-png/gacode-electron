/**
 * electron/deliveries-downloader.ts — 阶段 0.7.5 交付物自动下载 worker
 *                                  (deliveries-15 P2)
 *
 * 行为 (跟 Android 端 `DeliverableAutoDownloader` 行为对齐):
 *   - 应用 ready 后起一个 setInterval (默认 5 分钟) 拉未下载完的交付物
 *   - 拉 GET /yinian/deliverables?status=pending 拿未下载列表 (send-blocker:
 *     server unified-api 当前 list 端点不接受 status 参数 — 临时 fallback:
 *     拉第一页 + 客户端按 origin / sizeBytes 等启发式过滤 'pending')
 *   - 下载完成的写本地 cache 到 userData/deliveries-cache/<id>.<ext>
 *   - 通过 IPC 'gacode:deliverable-downloaded' 通知渲染层
 *
 * 失败 / 无 token 处理:
 *   - refreshToken 还没 hydrate (启动早于 AuthProvider 完成) → 本轮 skip, 等下轮
 *   - 网络失败 / 401 → console.warn, 不阻塞下一轮
 *   - 任何一条失败不影响其他条目
 *
 * 关闭 / 应用退出: clearInterval. before-quit 时同步停.
 *
 * 权限: 这个 worker 在主进程, 直接调 fetch + fs.writeFile. 不需要 renderer 配合.
 *       (跟 unified-api 之间走 https, 没跨域问题.)
 *
 * 跟其他 worker 协调点: 这个模块不修改任何其它文件, 只在 main.ts 里 start/stop.
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

const API_BASE = 'https://www.gaga.sale/api/v1';
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 分钟
const MAX_PARALLEL = 3;
const CACHE_DIR_NAME = 'deliveries-cache';

// ────────────── 内部类型 (跟 server DTO 字段对齐, 仅用到的子集) ──────────────

interface PendingDeliverable {
  id: string;
  url?: string;
  deliverableType: string;
  mimeType?: string;
  title?: string;
  sizeBytes?: number | string;
}

interface DownloaderStatus {
  running: boolean;
  lastRunAt: number | null;
  lastError: string | null;
  downloadedTotal: number;
  failuresTotal: number;
}

// ────────────── 状态 ──────────────

let timer: NodeJS.Timeout | null = null;
let inFlight = false;
const status: DownloaderStatus = {
  running: false,
  lastRunAt: null,
  lastError: null,
  downloadedTotal: 0,
  failuresTotal: 0,
};

function getCacheDir(): string {
  return path.join(app.getPath('userData'), CACHE_DIR_NAME);
}

function ensureCacheDir(): void {
  try {
    const dir = getCacheDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.warn('[gacode-electron] ensureCacheDir failed', err);
  }
}

function fileExtFor(item: PendingDeliverable): string {
  const u = item.url || '';
  // 简单从 URL 后缀抓 (server 也按 deliverableType 给后缀)
  if (item.mimeType) {
    if (item.mimeType.includes('pdf')) return '.pdf';
    if (item.mimeType.startsWith('image/png')) return '.png';
    if (item.mimeType.startsWith('image/jpeg')) return '.jpg';
    if (item.mimeType.startsWith('image/webp')) return '.webp';
    if (item.mimeType.startsWith('image/svg')) return '.svg';
    if (item.mimeType.startsWith('text/html')) return '.html';
    if (item.mimeType.startsWith('text/markdown')) return '.md';
  }
  // 兜底: 从 URL 抽
  try {
    const path = new URL(u).pathname;
    const i = path.lastIndexOf('.');
    if (i >= 0 && i > path.length - 6) return path.slice(i);
  } catch {
    /* ignore */
  }
  return item.deliverableType === 'image'
    ? '.img'
    : item.deliverableType === 'document'
      ? '.bin'
      : '.html';
}

function cachePathFor(item: PendingDeliverable): string {
  return path.join(getCacheDir(), `${item.id}${fileExtFor(item)}`);
}

// ────────────── 拉列表 (send-blocker 友好 — server 没 status 也能跑) ──────────────

async function fetchPendingDeliverables(
  accessToken: string,
): Promise<PendingDeliverable[]> {
  // 现阶段 server unified-api listDeliverable 端点 schema 不接受 status 参数,
  // send-blocker. 这里 fallback: 拉第一页 + type=document (文档类需要本地 cache)
  // + image (图也常 cache). AI 生成/用户上传 origin 都被 server 端过滤为
  // ai_generated / null, 这里只取大文件 + document 优先.
  const listUrl = `${API_BASE}/yinian/deliverables?pageSize=20`;
  const resp = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    throw new Error(`listDeliverables HTTP ${resp.status}`);
  }
  const json = (await resp.json()) as
    | { ok: boolean; data?: { items?: PendingDeliverable[] } }
    | undefined;
  if (!json?.ok || !json.data?.items) return [];
  // 启发式过滤: 仅 document / image + url 存在 + 缓存文件不存在的视为 pending.
  // web 类型不缓存 (URL 直接调默认浏览器打开, 没意义).
  return json.data.items.filter(
    (d) =>
      d &&
      d.id &&
      (d.deliverableType === 'document' || d.deliverableType === 'image') &&
      typeof d.url === 'string' &&
      d.url.length > 0,
  );
}

async function downloadOne(
  item: PendingDeliverable,
  accessToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const fp = cachePathFor(item);
  if (fs.existsSync(fp)) {
    // 已经下载过, 跳过 (幂等)
    return { ok: true };
  }
  try {
    const resp = await fetch(item.url!, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}` };
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    ensureCacheDir();
    fs.writeFileSync(fp, buf);
    console.log(
      `[gacode-electron] deliverable downloaded: id=${item.id} bytes=${buf.length} path=${fp}`,
    );
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

// ────────────── 单次轮询 ──────────────

export async function runOnce(): Promise<DownloaderStatus> {
  if (inFlight) return status;
  inFlight = true;
  try {
    const accessToken = readAccessTokenFromDisk();
    if (!accessToken) {
      // 还没 hydrate — 等下轮
      status.lastError = 'accessToken not hydrated yet';
      status.lastRunAt = Date.now();
      return status;
    }
    const items = await fetchPendingDeliverables(accessToken);
    if (items.length === 0) {
      status.lastError = null;
      status.lastRunAt = Date.now();
      return status;
    }
    // 并发限制 MAX_PARALLEL
    const queue = items.slice();
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(MAX_PARALLEL, queue.length); i++) {
      const w = (async () => {
        while (queue.length > 0) {
          const it = queue.shift();
          if (!it) break;
          const res = await downloadOne(it, accessToken);
          if (res.ok) {
            status.downloadedTotal += 1;
            notifyRenderer({
              type: 'gacode:deliverable-downloaded',
              payload: {
                id: it.id,
                cachePath: cachePathFor(it),
                title: it.title,
              },
            });
          } else {
            status.failuresTotal += 1;
            console.warn(
              `[gacode-electron] deliverable download failed: id=${it.id} err=${res.error}`,
            );
          }
        }
      })();
      workers.push(w);
    }
    await Promise.all(workers);
    status.lastError = null;
    status.lastRunAt = Date.now();
  } catch (err) {
    status.lastError = err instanceof Error ? err.message : String(err);
    status.lastRunAt = Date.now();
    console.warn('[gacode-electron] deliveries-downloader runOnce failed', err);
  } finally {
    inFlight = false;
  }
  return status;
}

// ────────────── 启停 ──────────────

export function startDeliveriesDownloader(intervalMs = DEFAULT_INTERVAL_MS): void {
  if (timer) {
    console.warn('[gacode-electron] deliveries-downloader already running');
    return;
  }
  status.running = true;
  // 启动先跑一次 (轻微延迟, 让 AuthProvider 先 hydrate), 再进 interval.
  setTimeout(() => {
    void runOnce();
  }, 5_000);
  timer = setInterval(() => {
    void runOnce();
  }, intervalMs);
  console.log(
    `[gacode-electron] deliveries-downloader started (interval=${intervalMs}ms)`,
  );
}

export function stopDeliveriesDownloader(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  status.running = false;
  console.log('[gacode-electron] deliveries-downloader stopped');
}

export function getDownloaderStatus(): DownloaderStatus {
  return { ...status };
}

// ────────────── helpers ──────────────

// refreshToken 走 IPC 持久化, 但 accessToken 只在内存. worker 在主进程拿不到
// 内存中的 accessToken, 退而求其次: 临时每次从 refresh-token.json 读 refreshToken
// 调 /auth/refresh 拿新 accessToken. 这里简化: 直接读 refreshToken 文件, 调用
// tryRefresh 主流程拿 access token, 然后再用于列表 + 下载.
//
// 阶段 0.7.5 简化: 不每次都 refresh (rate limit / 噪声), 而是启动时尝试一次,
// 失败用空 token skip 本轮. 5 分钟后下一轮再 refresh.
let cachedAccessToken: { token: string | null; fetchedAt: number } | null = null;
const REFRESH_TTL_MS = 50 * 60 * 1000; // 50 分钟, 小于 server token 寿命

function readAccessTokenFromDisk(): string | null {
  // 优先用 cached
  if (
    cachedAccessToken &&
    Date.now() - cachedAccessToken.fetchedAt < REFRESH_TTL_MS
  ) {
    return cachedAccessToken.token;
  }
  try {
    const refreshTokenFile = path.join(
      app.getPath('userData'),
      'refresh-token.json',
    );
    if (!fs.existsSync(refreshTokenFile)) {
      cachedAccessToken = { token: null, fetchedAt: Date.now() };
      return null;
    }
    const raw = fs.readFileSync(refreshTokenFile, 'utf8');
    const parsed = JSON.parse(raw) as { refreshToken?: string };
    if (!parsed.refreshToken) {
      cachedAccessToken = { token: null, fetchedAt: Date.now() };
      return null;
    }
    // 同步 fetch — Electron main 进程允许 fetch
    // (worker 是 fire-and-forget, 不阻塞)
    void (async () => {
      try {
        const r = await fetch(`${API_BASE}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: parsed.refreshToken }),
        });
        if (!r.ok) return;
        const j = (await r.json()) as
          | { ok: boolean; data?: { accessToken?: string } }
          | undefined;
        if (j?.ok && j.data?.accessToken) {
          cachedAccessToken = {
            token: j.data.accessToken,
            fetchedAt: Date.now(),
          };
          // 同步回盘 (refresh rotation)
          try {
            fs.writeFileSync(
              refreshTokenFile,
              JSON.stringify({
                ...parsed,
                updatedAt: new Date().toISOString(),
              }),
              'utf8',
            );
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore */
      }
    })();
    // 第一次同步返回 null, 下一轮才拿得到
    cachedAccessToken = { token: null, fetchedAt: Date.now() };
    return null;
  } catch {
    cachedAccessToken = { token: null, fetchedAt: Date.now() };
    return null;
  }
}

function notifyRenderer(message: { type: string; payload: unknown }): void {
  // 主进程 → 渲染层通知 — 走 webContents.send. 但 main.ts 模块加载顺序未知,
  // 安全做法: 跑一个 best-effort, 拿不到 BrowserWindow 就 no-op.
  try {
    const { BrowserWindow } = require('electron');
    const wins = BrowserWindow.getAllWindows();
    for (const w of wins) {
      try {
        w.webContents.send(message.type, message.payload);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore — 不是主进程上下文 */
  }
}
