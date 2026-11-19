/**
 * electron/client-tools/ccMsgCliSettings.ts —— `gaclaw-msg` CLI 的本地连接配置解析
 *
 * [2026-11-20 · T-087]
 *
 * CLI 从现有 Claude Code hook settings 读回 `gaclaw-hook-bridge` 装的 URL
 *（`http://127.0.0.1:<port>/hook/permission?token=...&src=gaclaw-hook-bridge`），
 * 得到 base + token。也可以 `--hook-url` 覆盖（URL 里可含 token，或另传 --token）。
 *
 * ⚠️ 只读 settings；不写、不改用户的 Claude Code 配置。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export const HOOK_MARKER = 'gaclaw-hook-bridge';

export interface CcMsgConnection {
  /** 本地 hook 服务的 origin（如 http://127.0.0.1:17642）。 */
  baseUrl: string;
  token: string;
}

function settingsFiles(): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  const dir = path.join(home, '.claude');
  return [
    path.join(dir, 'settings.local.json'),
    path.join(dir, 'settings.json'),
  ];
}

function findInstalled(): CcMsgConnection | null {
  for (const file of settingsFiles()) {
    let data: any;
    try {
      const raw = fs.readFileSync(file, 'utf8');
      if (!raw.trim()) continue;
      data = JSON.parse(raw);
    } catch { continue; }
    const events = data?.hooks;
    if (!events || typeof events !== 'object') continue;
    for (const arr of Object.values(events)) {
      if (!Array.isArray(arr)) continue;
      for (const entry of arr as any[]) {
        for (const h of Array.isArray(entry?.hooks) ? entry.hooks : []) {
          const url = typeof h?.url === 'string' ? h.url : '';
          if (!url.includes(HOOK_MARKER)) continue;
          try {
            const u = new URL(url);
            const token = u.searchParams.get('token') || '';
            if (!token) continue;
            // ⛔ 只连 loopback：防止误把公网地址当本地桥。
            if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost' && u.hostname !== '[::1]') continue;
            return { baseUrl: `${u.protocol}//${u.host}`, token };
          } catch { /* 坏 URL 跳过 */ }
        }
      }
    }
  }
  return null;
}

/**
 * 解析 CLI 连接参数。
 *
 * - `--hook-url` 可以是完整工具 URL（/cc-tools/send）也可以是 bridge origin。
 * - token 优先 `--token`，其次 URL query `?token=`，最后 settings。
 */
export function resolveConnection(args: {
  hookUrl?: string;
  token?: string;
}): CcMsgConnection {
  const installed = findInstalled();
  let baseUrl = installed?.baseUrl || 'http://127.0.0.1:0';
  let token = installed?.token || '';

  if (args.hookUrl) {
    try {
      const u = new URL(args.hookUrl);
      if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost' && u.hostname !== '[::1]') {
        throw new Error('--hook-url 只能指向本机（127.0.0.1/localhost/::1）');
      }
      baseUrl = `${u.protocol}//${u.host}`;
      const inUrl = u.searchParams.get('token');
      if (inUrl) token = inUrl;
    } catch (e: any) {
      throw new Error(`--hook-url 解析失败: ${e?.message || e}`);
    }
  }
  if (args.token) token = args.token;
  if (!token) {
    throw new Error('找不到本地 hook token：请先安装 gaclaw hook，或传 --token / --hook-url');
  }
  if (baseUrl.includes(':0')) {
    throw new Error('找不到本地 hook 端口：请先安装 gaclaw hook，或传 --hook-url');
  }
  return { baseUrl, token };
}
