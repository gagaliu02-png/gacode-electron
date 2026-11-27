/**
 * electron/client-tools/refreshTokenStore.ts
 *
 * ★ [T-175] **主进程侧**读 / 写 refresh token 的小工具。
 *
 * ## 为什么需要它
 *
 *   access token 由**渲染层**推给主进程（`gacode:client-tool-set-token`），
 *   而刷新只在**渲染层自己发请求收到 401** 时才发生
 *   ⇒ 主进程这条路上（设备通道 / 后台任务结果上报）的 token 会一直过期。
 *
 *   生产实证 2026-11-27：
 *   `POST /devices/tasks/:pendingId/result` 拿到 **401** ⇒ 结果送不到服务端
 *   ⇒ 派单账永远 `settled:false / running` ⇒ 「等待后台任务完成…」横幅不消失
 *   ⇒ 服务端起不了汇报轮 ⇒ **Cody 收不到后台任务回报**（真机 session 1193 · T-148）。
 *
 *   ⇒ 主进程要能**自己**换一个 access token ⇒ 需要读 refresh token。
 *
 * ## 文件位置
 *
 *   `%APPDATA%/Gacode/refresh-token.json` —— 跟 `electron/main.ts` 里
 *   `getRefreshTokenFilePath()` **同一个**（渲染层 hydrate 时写的也是它）。
 *
 * ## ⚠️ 格式（跟 main.ts 的读写器同款，逐字一致）
 *
 *   `{ refreshToken: string, userId: string, updatedAt: ISO string }`
 *
 * ⚠️ **rotation 语义**：服务端 refresh token 是一次性的（换了新的，旧的立刻作废）
 *   ⇒ 换到新 refreshToken 后**必须立刻写回**，否则下次刷新用已作废的那个 ⇒ 失败。
 */

import { app } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** refresh token 文件路径（跟 main.ts 的 `getRefreshTokenFilePath()` 同款）。 */
function refreshTokenFilePath(): string {
  return join(app.getPath('userData'), 'refresh-token.json');
}

interface RefreshTokenFile {
  refreshToken: string;
  userId: string;
  updatedAt: string;
}

/** 读盘（读不到 / 格式不对 ⇒ 返回 null，不抛）。 */
export function readRefreshTokenForRefresh(): string | null {
  try {
    const p = refreshTokenFilePath();
    if (!existsSync(p)) return null;
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as Partial<RefreshTokenFile>;
    if (typeof parsed.refreshToken !== 'string' || parsed.refreshToken.length < 10) {
      return null;
    }
    return parsed.refreshToken;
  } catch {
    return null;
  }
}

/** 写盘（rotation 后必须立刻调；失败不抛 —— 由调用方记日志）。 */
export function writeRefreshTokenForRefresh(refreshToken: string, userId = ''): void {
  try {
    const p = refreshTokenFilePath();
    mkdirSync(dirname(p), { recursive: true });
    const body: RefreshTokenFile = {
      refreshToken,
      userId,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(p, JSON.stringify(body), 'utf8');
  } catch (e) {
    throw new Error(`写 refresh-token.json 失败: ${(e as Error).message}`);
  }
}
