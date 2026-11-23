/**
 * electron/client-tools/peerLog.ts —— [T-069] peer notice 链路的诊断日志
 *
 * 需求：`dev/client-tools.log`（=%APPDATA%/Gacode/client-tools.log）要能看到
 *   · 发订阅时的 msg_id / from / target session
 *   · 收到 notice 时的 orig_msg_id / state / detail
 *   · auth 失败 / 非法帧错误
 *
 * 设计：
 *   · 生产：写入 `app.getPath('userData')/client-tools.log`（与 deviceClient.logDevice 同款）
 *   · 单测：没有 electron app ⇒ 只走 console.log（不写文件，不破坏 node --test）
 *   · ⛔ 绝不打印完整 token / key / 正文（只记元数据）
 */

import * as fs from 'fs';
import * as path from 'path';

let filePath: string | null | undefined;

function resolveLogPath(): string | null {
  if (filePath !== undefined) return filePath;
  try {
    // 用动态 import 避免顶层 require('electron') 破坏纯 Node 单测。
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron') as { app?: { getPath(name: string): string } };
    const app = electron?.app;
    if (!app || typeof app.getPath !== 'function') {
      filePath = null;
      return null;
    }
    filePath = path.join(app.getPath('userData'), 'client-tools.log');
    return filePath;
  } catch {
    filePath = null;
    return null;
  }
}

/** 追加一行诊断日志；失败静默（日志不许影响主流程）。 */
export function peerLog(tag: string, msg: string): void {
  const full = `[${new Date().toISOString()}] [${tag}] ${msg}`;
  const file = resolveLogPath();
  if (file) {
    try { fs.appendFileSync(file, full + '\n', 'utf8'); } catch { /* ignore */ }
  }
  console.log(full);
}

/** 仅供单测：重置路径缓存。 */
export function resetPeerLogPath(): void {
  filePath = undefined;
}
