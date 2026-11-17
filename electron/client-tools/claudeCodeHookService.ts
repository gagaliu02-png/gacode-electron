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
  type HookBridgeHandle,
} from './claudeCodeHookBridge.ts';
import {
  installHook,
  uninstallHook,
  type HookInstallResult,
} from './claudeCodeHookInstall.ts';

/** 本服务单例（主进程）。 */
let _handle: HookBridgeHandle | null = null;
let _starting: Promise<HookBridgeHandle> | null = null;

/** 上一次装的 URL（卸载时要精确匹配）。 */
let _installedUrl: string | null = null;

/** 桥当前是否活着。 */
export function isRunning(): boolean {
  return !!_handle;
}

/** 当前 hook URL（没起桥时为 null）。 */
export function currentHookUrl(): string | null {
  return _handle ? hookUrl(_handle.port, _handle.token) : null;
}

/**
 * 起桥（幂等）。
 *
 * ⚠️ **只起桥不装 hook** —— 装 hook 是显式动作（见 install）。
 */
export async function ensureStarted(): Promise<HookBridgeHandle> {
  if (_handle) return _handle;
  if (_starting) return _starting;
  _starting = (async () => {
    const h = await startHookBridge({
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
    });
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
  const url = hookUrl(h.port, h.token);
  const r = installHook({
    url,
    event: p.event || 'PermissionRequest',
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
