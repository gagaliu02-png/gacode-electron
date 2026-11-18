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

export interface DiagArgs {
  /** 粗粒度的域（`chat` / `queue` / `inbox` …） */
  tag?: string;
  /** 一句话（**不要**带用户内容） */
  msg?: string;
}

function diagFilePath(): string {
  return path.join(app.getPath('userData'), DIAG_FILE);
}

/** 追加一行；失败**静默**（诊断日志绝不能把主进程搞挂）。 */
export function appendDiag(tag: string, msg: string): void {
  try {
    const file = diagFilePath();
    // 轮转：超上限就改名 .1（只留一代）。
    try {
      const st = fs.statSync(file);
      if (st.size > MAX_BYTES) {
        try {
          fs.renameSync(file, `${file}.1`);
        } catch (_) {
          /* ignore */
        }
      }
    } catch (_) {
      /* 文件不存在 ⇒ 正常 */
    }
    const ts = new Date().toISOString();
    fs.appendFileSync(file, `[${ts}] [${tag || '-'}] ${msg}\n`, 'utf8');
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
    const tag = String(args?.tag ?? '').slice(0, 32);
    const msg = String(args?.msg ?? '').slice(0, 2000);
    if (!msg) return;
    appendDiag(tag, msg);
  });
}
