/**
 * electron/client-tools/claudeCodeHookService.ts —— **hook 桥的生命周期**
 *
 * [2026-11-17 · T-020 · S3]
 *
 * ## 它做什么
 *
 *   1. 起本机 HTTP 桥（`claudeCodeHookBridge.startHookBridge`），
 *      转发目标 = **现有的设备通道** `POST /api/v1/devices/permission-request`
 *      ⇒ 用 `deviceClient.getAccessToken()`，**不需要 SSH、不需要 admin token、不需要新通道**。
 *      服务端按 PM 口径恒回 allow（自动点确定；不是安全闸）。
 *   2. 生成 hook 配置（`type:"http"`），**dry-run 先看 diff**，由上层/用户确认后再装。
 *   3. 装/卸 hook（`claudeCodeHookInstall.installHook/uninstallHook`）。
 *
 * ## ⚠️ 默认**不自动装**
 *
 *   装饰在 `~/.claude/settings.json` ⇒ 影响本机**所有** Claude Code 会话（全局）。
 *   ⇒ 必须由用户**显式调用**（renderer 的按钮 / IPC）才装。
 *   本模块启动时**只起桥、不装 hook**。
 */

import { deviceClient, apiBase, getDeviceId } from './deviceClient';
import {
  startHookBridge,
  hookUrl,
  bridgeToken,
  DEFAULT_HOOK_BRIDGE_PORT,
  type HookBridgeHandle,
  type HookBridgeOptions,
} from './claudeCodeHookBridge.ts';
import {
  installHook,
  uninstallHook,
  claudeSettingsFile,
  HOOK_MARKER,
  type HookInstallResult,
} from './claudeCodeHookInstall.ts';
import { handleCcTool } from './ccSessionToolService.ts';
import * as fs from 'fs';

/** 本服务单例（主进程）。 */
let _handle: HookBridgeHandle | null = null;
let _starting: Promise<HookBridgeHandle> | null = null;

/** 上一次装的 URL（卸载时要精确匹配）。 */
let _installedUrl: string | null = null;

/** 桥当前是否活着。 */
export function isRunning(): boolean {
  return !!_handle;
}

/** 从已装 hook 的 URL 读回「固定端口 + token」⇒ Gacode 重启后桥仍对得上配置。 */
function installedEndpoint(): { port: number; token: string } | null {
  try {
    const raw = fs.readFileSync(claudeSettingsFile(), 'utf8');
    const settings = JSON.parse(raw);
    const entries = settings && settings.hooks && settings.hooks.PermissionRequest;
    if (!Array.isArray(entries)) return null;
    for (const e of entries) {
      for (const h of Array.isArray(e?.hooks) ? e.hooks : []) {
        const url = h && typeof h.url === 'string' ? h.url : '';
        if (!url.includes(HOOK_MARKER)) continue;
        const u = new URL(url);
        const port = Number(u.port);
        const token = u.searchParams.get('token') || '';
        if (port > 0 && token) return { port, token };
      }
    }
  } catch (_) { /* 没装 / 解析失败 ⇒ 用新的随机端口 */ }
  return null;
}

/** 当前 hook URL（没起桥时为 null）。 */
export function currentHookUrl(): string | null {
  return _handle ? hookUrl(_handle.port, _handle.token) : null;
}

/**
 * 起桥（幂等）。
 *
 * ⚠️ **只起桥不装 hook** —— 装 hook 是显式动作（见 install）。
 *
 * ★ [T-143] **端口被占用 ⇒ 自动换到可用端口，并同步更新已装的 hook URL**。
 *   病根：装过 hook 时我们复用 settings.json 里的**固定端口**（重启后还能对上）。
 *   若那个端口已被别的进程占用 ⇒ 桥起不来 ⇒ Claude Code 一直打不通（hook 失效、
 *   MCP 工具的 /cc-tools/send 也不通）。
 *   ⇒ 兜底：固定端口起失败 ⇒ 改用**随机空闲端口**（port 0）+ 新 token，
 *     并把 settings.json 里带我们标记的那条 hook URL **改写成新端口**
 *     （否则 Claude Code 还指着旧地址）。
 *   ⚠️ MCP launcher 每次调用都**动态**读 settings 里的 hook URL ⇒ 端口变了它自动跟上。
 */
export async function ensureStarted(): Promise<HookBridgeHandle> {
  if (_handle) return _handle;
  if (_starting) return _starting;
  _starting = (async () => {
    const installed = installedEndpoint();
    const base: HookBridgeOptions = {
      endpoint: `${apiBase()}/devices/permission-request`,
      authorization: (() => {
        const t = deviceClient.getAccessToken();
        return t ? `Bearer ${t}` : null;
      })(),
      context: {
        // deviceId 由 unified-api 从 body / X-Device-Id 读，但**显式给出更可靠**
        // （deviceClient 在 token 变化时会重注册，deviceId 不变）。
        deviceId: getDeviceId(),
      },
      // ★ [T-087] 复用同一本地服务提供 Claude Code 会话工具。
      //   role/selfSessionId/parentSessionId 都在主进程侧决定：CLI 不能自报身份。
      ccTools: async (route, body) => handleCcTool(route, body, {
        apiBase,
        accessToken: () => deviceClient.getAccessToken(),
        deviceId: getDeviceId,
        // ★ [T-175] 带 401 自动续期的 fetch ——
        //   这条路是 **CC → Cody 回传的主链路**（`POST /devices/cc/messages`）。
        //   它原本自有一套 authHeaders（绕过 deviceClient）⇒ token 过期时 401
        //   ⇒ CC 的产出送不出去 ⇒ Cody 收不到（生产实证 2026-11-27）。
        authFetch: (url, init) => deviceClient.authFetch(url, init, 'ccSessionTool'),
        role: () => 'main',
        selfSessionId: () => null,
        parentSessionId: () => null,
      }),
    };

    // ① 先试「装过 hook 的固定端口」。
    let h: HookBridgeHandle | null = null;
    if (installed) {
      try {
        h = await startHookBridge({ ...base, ...installed });
      } catch (e) {
        console.warn('[claude-hook] 固定端口起桥失败，改用随机端口:', (e as Error).message);
        h = null;
      }
    }
    // ② 端口被占用 / 从没装过 ⇒ 随机空闲端口。
    if (!h) {
      h = await startHookBridge({ ...base, port: DEFAULT_HOOK_BRIDGE_PORT, token: bridgeToken() });
      // ★ 已装过 hook ⇒ 把 URL 改写到新端口（否则 Claude Code 还打旧地址）。
      if (installed) {
        try {
          const url = hookUrl(h.port, h.token);
          const r = installHook({
            url,
            event: 'PermissionRequest',
            onFailure: 'continue',
            matcher: '*',
            timeoutSec: 60,
          });
          if (r.ok) _installedUrl = url;
          else console.warn('[claude-hook] 换端口后更新 hook URL 失败:', r.error || r.summary);
        } catch (e) {
          console.warn('[claude-hook] 换端口后更新 hook URL 异常:', (e as Error).message);
        }
      }
    }
    _handle = h;
    return h;
  })();
  try {
    return await _starting;
  } finally {
    _starting = null;
  }
}

/** 停桥（不卸 hook —— 卸要单独调，免得桥重启后 hook 还指着旧端口）。 */
export async function stop(): Promise<void> {
  if (!_handle) return;
  const h = _handle;
  _handle = null;
  await h.close();
}

/**
 * 装 hook（**显式调用**）。
 *
 * @param p
 * @param p.dryRun true = 只算 diff，不写盘 ⇒ 上层先给用户看
 * @param p.event  默认 PermissionRequest（只在真要弹框时拦；PreToolUse 是另一个语义）
 */
export async function install(p: {
  dryRun?: boolean;
  event?: 'PermissionRequest' | 'PreToolUse';
  onFailure?: 'block' | 'continue';
} = {}): Promise<HookInstallResult> {
  const h = await ensureStarted();
  // ★ 第一次装：让桥监听一个固定端口（不用随机端口），重启后还能复用。
  const url = installedEndpoint()
    ? hookUrl(h.port, h.token)
    : `http://127.0.0.1:${h.port}/hook/permission?token=${encodeURIComponent(h.token)}&src=${HOOK_MARKER}`;
  const r = installHook({
    url,
    event: p.event || 'PermissionRequest',
    // ★ PM 最终口径：本桥只是「替用户点确定」，不是安全闸 ⇒
    //   桥/上游挂了必须交回 Claude Code 原流程，绝不能把用户流程卡住。
    onFailure: p.onFailure || 'continue',
    matcher: '*',
    timeoutSec: 60,
    dryRun: p.dryRun,
  });
  if (r.ok && !p.dryRun) _installedUrl = url;
  return r;
}

/** 卸载（只删自己装的那条）。 */
export async function uninstall(p: { dryRun?: boolean } = {}): Promise<HookInstallResult> {
  const url = _installedUrl || currentHookUrl();
  if (!url) return { ok: true, file: '', summary: '桥未启动且没有已记录的 URL' };
  const r = uninstallHook({ url, dryRun: p.dryRun });
  if (r.ok && !p.dryRun) _installedUrl = null;
  return r;
}

/** 诊断用：当前状态。 */
export function status(): {
  running: boolean;
  url: string | null;
  installedUrl: string | null;
  hasToken: boolean;
} {
  return {
    running: isRunning(),
    url: currentHookUrl(),
    installedUrl: _installedUrl,
    hasToken: !!deviceClient.getAccessToken(),
  };
}
