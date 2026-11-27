import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ★ [T-044 · 2026-11-18] **渲染层诊断日志**（落盘）。
 *
 * ## 为什么需要它
 *
 *   PC 端跑的是**打包版**（`Gacode-*.exe`）⇒ **没有 devtools** ⇒ 渲染层的
 *   `console.log` **看不到**（安卓有 logcat、PC 没有 ⇒ 两端的可观测性不对等）。
 *   ⇒ 端侧的关键决策（停止键显隐 / 认亲结果 / 发了哪个 intent）必须**落盘**，
 *     否则线上出问题只能靠用户口述。
 *
 *   设备通道那条链已经有自己的落盘日志（`%APPDATA%/Gacode/client-tools.log`），
 *   但**渲染层**（React）没有 ⇒ 这一条补上。
 *
 * ## 落点
 *
 *   `%APPDATA%/Gacode/diag.log`（append-only，跟 `client-tools.log` 同级）
 *
 * ## 用法（渲染层）
 *
 * ```ts
 * window.gacode?.diagLog?.('chat', '停止键: ' + action.reason);
 * ```
 *
 * ## ⚠️ 只记**决策**，不记**内容**
 *
 *   绝不把用户消息正文 / 模型回复写进来 ⇒ 这个文件会被人翻 ⇒ 只记「发生了什么决策」。
 */

const DIAG_FILE = 'diag.log';
const MAX_BYTES = 8 * 1024 * 1024;
/** ★ [T-175] 轮转检查的最小间隔（ms）—— 不再每条都 statSync。 */
const ROTATE_CHECK_INTERVAL_MS = 30_000;

export interface DiagArgs {
  /** 粗粒度的域（`chat` / `queue` / `inbox` …） */
  tag?: string;
  /** 一句话（**不要**带用户内容） */
  msg?: string;
}

function diagFilePath(): string {
  return path.join(app.getPath('userData'), DIAG_FILE);
}

/**
 * ★ [T-175] 上次轮转检查的时刻（避免每条都 statSync）。
 */
let lastRotateCheck = 0;
/** ★ [T-175] 待写队列（合并写入 ⇒ 一批一次 IO）。 */
let pendingChunk = '';
/** ★ [T-175] 队列刷写定时器。 */
let flushTimer: NodeJS.Timeout | null = null;

/** 真正落盘（**异步** —— 绝不在主进程里做同步磁盘 IO）。 */
function writeChunk(chunk: string): void {
  if (!chunk) return;
  try {
    fs.appendFile(diagFilePath(), chunk, 'utf8', () => {
      /* ignore —— 失败不许影响主进程 */
    });
  } catch (_) {
    /* ignore */
  }
}

/** 把队列刷到磁盘（合并成一次写）。 */
function flushDiag(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const chunk = pendingChunk;
  pendingChunk = '';
  if (!chunk) return;
  // 轮转检查：按**时间间隔**（不是每条）⇒ 高频日志时不会每次都 stat。
  const now = Date.now();
  if (now - lastRotateCheck > ROTATE_CHECK_INTERVAL_MS) {
    lastRotateCheck = now;
    try {
      const st = fs.statSync(diagFilePath());
      if (st.size > MAX_BYTES) {
        try {
          fs.renameSync(diagFilePath(), `${diagFilePath()}.1`);
        } catch (_) {
          /* ignore */
        }
      }
    } catch (_) {
      /* 文件不存在 ⇒ 正常 */
    }
  }
  writeChunk(chunk);
}

/**
 * 追加一行；失败**静默**（诊断日志绝不能把主进程搞挂）。
 *
 * ★ [T-175] 改成**入队 + 异步批量写** —— 原实现是 `fs.appendFileSync`（同步阻塞）
 *   ⇒ 高频日志（每帧一条）时会把主进程 IO 打死 ⇒ **窗口黑屏**（生产实证 2026-11-27）。
 */
export function appendDiag(tag: string, msg: string): void {
  try {
    const ts = new Date().toISOString();
    pendingChunk += `[${ts}] [${tag || '-'}] ${msg}
`;
    // 队列超过一定长度 ⇒ 立刻刷（别让内存涨）。
    if (pendingChunk.length >= 64 * 1024) {
      flushDiag();
      return;
    }
    if (!flushTimer) {
      // 短延迟合并 ⇒ 同一批的多条日志只写一次。
      flushTimer = setTimeout(flushDiag, 200);
      flushTimer.unref?.();
    }
  } catch (_) {
    /* ignore —— 诊断日志失败不许影响主流程 */
  }
}

/**
 * 注册 IPC。
 *
 *   用 `send`（不是 `invoke`）⇒ 渲染层**不等**结果 ⇒ 不拖慢 UI。
 */
export function registerDiagIpc(): void {
  ipcMain.on('gacode:diag-log', (_event, args: DiagArgs) => {
    const tag = String(args?.tag ?? '-').slice(0, 32);
    const msg = String(args?.msg ?? '').slice(0, 2000);
    if (!msg) return;
    appendDiag(tag, msg);
  });
}

/** 退出前把队列刷干净（否则最后几条会丢）。 */
export function flushDiagOnExit(): void {
  try {
    flushDiag();
  } catch (_) {
    /* ignore */
  }
}
