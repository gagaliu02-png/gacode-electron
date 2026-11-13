/**
 * electron/client-tools/ipc.ts —— 端侧执行的 IPC 接线
 *
 * [2026-11-12] 契约依据: 订正 24（事件层语义）+ 订正 25（设备通道）。
 *
 * ## 频道表
 *
 * | 频道 | 方向 | 用途 |
 * |---|---|---|
 * | `gacode:client-tool-execute` | 渲染层 → 主 | 渲染层直接跑一个端侧工具（调试 / 本地操作） |
 * | `gacode:client-tool-set-token` | 渲染层 → 主 | 把 access token 推给主进程（设备通道要用） |
 * | `gacode:client-tool-status` | 渲染层 → 主 | 设备通道状态 + 闸门状态（UI 显示「我的电脑：xx（在线）」） |
 * | `gacode:client-tool-set-gate` | 渲染层 → 主 | 总开关 / 急停 |
 * | `gacode:client-tool-audit` | 渲染层 → 主 | 读审计（30 天） |
 * | `gacode:client-tool-clear-audit` | 渲染层 → 主 | 一键清空审计 |
 * | `gacode:client-tool-request` | 主 → 渲染层 | 收到派单时通知（UI 显示「正在你的电脑上执行」） |
 *
 * ⚠️ **闸门判定在主进程**（`gate.ts`）—— 渲染层**不得**自己判。
 *    渲染层能调的 `execute` 走的也是同一条闸门。
 */

import { ipcMain, BrowserWindow } from 'electron';
import { executeClientTool } from './executor';
import { deviceClient, getDeviceId, deviceCapabilities } from './deviceClient';
// [P7 · 2026-11-12] 本机定时任务（gaga 拍板：只在 Gacode 打开时跑，不写 Windows 计划任务）。
import { localTasks } from './localTasks';
import {
  assertAllowed,
  appendAudit,
  clearAudit,
  readAudit,
  readGateState,
  writeGateState,
  summarizeCommand,
} from './gate';
import type { GateState } from './gate';
import type { ClientToolAuditEntry, ClientToolRequest, ClientToolResult } from './types';

export interface ClientToolStatus {
  deviceId: string;
  deviceName: string;
  /** 设备通道是否已建立（= 服务端认为的「在线」，L-25t）。 */
  connected: boolean;
  registered: boolean;
  lastError: string | null;
  replacedDeviceId: string | null;
  /** 闸门状态（总开关 / 急停）。 */
  gate: GateState;
}

let mainWindowRef: BrowserWindow | null = null;

/** 记下主窗口（派单到达时用它通知渲染层）。 */
export function setClientToolWindow(win: BrowserWindow | null): void {
  mainWindowRef = win;
}

/** 通知渲染层「有派单来了」。 */
export function notifyClientToolRequest(req: ClientToolRequest): void {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
  try {
    mainWindowRef.webContents.send('gacode:client-tool-request', req);
  } catch (_) { /* 窗口刚关 ⇒ 忽略 */ }
}

/** 注册全部 IPC（main.ts 启动时调一次）。 */
export function registerClientToolIpc(): void {
  // —— 渲染层把 access token 推过来（内存持有，⛔ 不持久化）——
  ipcMain.handle('gacode:client-tool-set-token', async (_e, token: unknown) => {
    deviceClient.setAccessToken(typeof token === 'string' && token ? token : null);
    return { ok: true };
  });

  // —— node-pty 能不能用（决定要不要声明 `pty` 子能力）——
  //   ⚠️ 没装好 node-pty（原生模块 ABI 不对 / DLL 缺失）⇒ `pc_shell` 会挂起
  //      等一个**永远不回来的**结果 ⇒ 这时**不能**声明 `pty` 能力。
  //   ⚠️ 判据与注册时上报的那份**同一处**（deviceClient.deviceCapabilities）。
  ipcMain.handle('gacode:client-tool-pty-available', async () => {
    return deviceCapabilities().includes('pty=1');
  });

  // —— 状态（设备通道 + 闸门）——
  ipcMain.handle('gacode:client-tool-status', async () => {
    const st = deviceClient.status();
    return {
      deviceId: st.deviceId || getDeviceId(),
      deviceName: require('os').hostname(),
      connected: st.connected,
      registered: st.registered,
      lastError: st.lastError,
      replacedDeviceId: st.replacedDeviceId,
      gate: readGateState(),
    } satisfies ClientToolStatus;
  });

  // —— 总开关 / 急停 ——
  ipcMain.handle('gacode:client-tool-set-gate', async (_e, next: unknown) => {
    const patch = (next && typeof next === 'object') ? (next as Record<string, unknown>) : {};
    const state = writeGateState({
      masterEnabled:
        typeof patch.masterEnabled === 'boolean' ? patch.masterEnabled : undefined,
      killSwitch: typeof patch.killSwitch === 'boolean' ? patch.killSwitch : undefined,
    });
    return state;
  });

  // —— 审计 ——
  ipcMain.handle('gacode:client-tool-audit', async (_e, limit: unknown) => {
    const n = typeof limit === 'number' && limit > 0 ? Math.min(limit, 1000) : 200;
    return readAudit(n) as ClientToolAuditEntry[];
  });
  ipcMain.handle('gacode:client-tool-clear-audit', async () => clearAudit());

  // —— 渲染层直接跑一个端侧工具（**同样过闸门**）——
  ipcMain.handle(
    'gacode:client-tool-execute',
    async (
      _e,
      input: { tool?: string; args?: Record<string, unknown>; cwd?: string; timeoutMs?: number },
    ): Promise<ClientToolResult> => {
      const tool = input && typeof input.tool === 'string' ? input.tool : '';
      const args = (input && input.args) || null;
      const t0 = Date.now();
      try {
        assertAllowed(tool, args);
      } catch (e) {
        const code = (e as { code?: string }).code || 'gate';
        appendAudit({
          ts: Date.now(),
          tool,
          outcome: 'denied',
          reason: code,
          summary: tool === 'pc_shell' ? summarizeCommand(String((args || {}).command || '')) : undefined,
          durationMs: Date.now() - t0,
        });
        return { status: 'denied', error: `端侧闸门拒绝（${code}）：${(e as Error).message}` };
      }
      try {
        const result = await executeClientTool(
          tool,
          args,
          input && input.cwd ? input.cwd : null,
          input && typeof input.timeoutMs === 'number' ? input.timeoutMs : null,
        );
        appendAudit({
          ts: Date.now(),
          tool,
          outcome: result.status === 'ok' ? 'allowed' : 'error',
          reason: result.status === 'ok' ? undefined : 'tool_error',
          summary: tool === 'pc_shell' ? summarizeCommand(String((args || {}).command || '')) : undefined,
          durationMs: Date.now() - t0,
          exitCode: result.exitCode,
        });
        return result;
      } catch (e) {
        return { status: 'error', error: `端侧执行异常: ${(e as Error).message}` };
      }
    },
  );

  // 设备通道收到派单 ⇒ 通知渲染层
  deviceClient.onRequest((req) => notifyClientToolRequest(req));

  // ── [P6] 正在跑的任务（多会话并行 ⇒ 用户要看得见、管得住）────────────
  ipcMain.handle('gacode:client-tool-running-tasks', async () => deviceClient.runningTasks());
  ipcMain.handle('gacode:client-tool-stop-task', async (_e, pendingId: unknown) => {
    const stopped = deviceClient.stopTask(String(pendingId || ''));
    return { ok: stopped };
  });
  deviceClient.onTasks((tasks) => {
    if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
    try {
      mainWindowRef.webContents.send('gacode:client-tool-tasks', tasks);
    } catch (_) { /* 窗口刚关 */ }
  });

  // ── [P7 · 2026-11-12] 本机定时任务 ──────────────────────────────────
  //   定时器在**主进程**（渲染层刷新不该让定时任务停）。
  //   ⚠️ token 从 deviceClient 那儿拿（渲染层推过来的那份，内存持有）。
  localTasks.start(() => deviceClient.getAccessToken());

  ipcMain.handle('gacode:local-tasks-list', async () => localTasks.list());

  ipcMain.handle(
    'gacode:local-tasks-upsert',
    async (_e, input: { id?: string; name?: string; cron?: string; prompt?: string; enabled?: boolean }) => {
      try {
        const task = localTasks.upsert({
          id: input && typeof input.id === 'string' && input.id ? input.id : undefined,
          name: input && typeof input.name === 'string' ? input.name : undefined,
          cron: String((input && input.cron) || '').trim(),
          prompt: String((input && input.prompt) || ''),
          enabled: input && typeof input.enabled === 'boolean' ? input.enabled : undefined,
        });
        return { ok: true, task };
      } catch (e) {
        return { ok: false, error: (e as Error).message };
      }
    },
  );

  ipcMain.handle('gacode:local-tasks-remove', async (_e, id: unknown) => {
    const removed = localTasks.remove(String(id || ''));
    return { ok: removed };
  });

  ipcMain.handle('gacode:local-tasks-run-now', async (_e, id: unknown) => {
    const r = await localTasks.runNow(String(id || ''));
    return { ok: r.ok, error: r.error };
  });
}
