/**
 * electron/client-tools/deviceClient.ts —— 设备通道客户端（PC 这一侧）
 *
 * [2026-11-12] 契约依据: cross-platform-sse-event-contract-附录.md **订正 25**（设备通道）。
 *
 * ## 为什么跑在**主进程**
 *
 *   · 渲染层一刷新/重开窗口，通道就断了 ⇒ 服务端会认为「电脑离线」
 *     ⇒ 手机发指令会立刻失败（L-25r）。主进程活得久，通道才稳。
 *   · 派单要在**主进程**执行（node-pty / 桌面采集 / tasklist 都只有主进程能碰）。
 *
 * ## 四步
 *
 *   ① 拿 `deviceId`（安装实例 UUID，落 `%APPDATA%/Gacode/device-id.json`）
 *   ② D1 `POST /devices/register` —— 注册 / 绑定（换电脑登录 ⇒ 顶掉旧的）
 *   ③ D2 `GET /devices/events` —— SSE 长连接，等派单
 *   ④ 收到 `client_tool_request` ⇒ 闸门 ⇒ 执行 ⇒ D3 `POST /devices/tasks/:pendingId/result`
 *
 * ## 幂等
 *
 * 端侧**必须**按 `pending_id` 去重（L-25l）—— PC 自己发起的会话里，
 * 同一条派单会**同时**出现在「会话 SSE」和「设备 SSE」两条流上
 * ⇒ 不去重 ⇒ **同一个命令跑两遍**。
 * ⇒ 去重表落盘（`%APPDATA%/Gacode/client-done.json`），跨重启也认。
 *
 * ⚠️ **不得**用裸 `id`（= `tool_use_id`）去重 —— 与正文 L-15 / L-18 同款理由。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { app } from 'electron';
import type {
  ClientToolRequest,
  ClientToolResult,
} from './types';
import { assertAllowed, appendAudit, summarizeCommand } from './gate';
import { executeClientTool } from './executor';

// ===========================================================================
// 配置
// ===========================================================================

/** API base（跟渲染层 api.ts 同款口径）。 */
export function apiBase(): string {
  const raw = process.env.GACODE_API_BASE || 'https://www.gaga.sale/api/v1';
  return String(raw).replace(/\/+$/, '');
}

/** `deviceId` 文件（L-25a：安装实例级 UUID，⛔ 不用硬件指纹）。 */
export function deviceIdFile(): string {
  return path.join(app.getPath('userData'), 'device-id.json');
}

/** 去重表（已结的 `pending_id`）。 */
function doneFile(): string {
  return path.join(app.getPath('userData'), 'client-done.json');
}

/** 取（没有就生成并落盘）本机 `deviceId`。 */
export function getDeviceId(): string {
  try {
    const raw = fs.readFileSync(deviceIdFile(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.deviceId === 'string' && parsed.deviceId.length >= 8) {
      return parsed.deviceId;
    }
  } catch (_) { /* 没有文件 ⇒ 第一次运行 */ }
  const deviceId = randomUUID();
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(deviceIdFile(), JSON.stringify({ deviceId, createdAt: Date.now() }, null, 2), 'utf8');
  } catch (e) {
    console.error('[client-tools/device] deviceId 落盘失败:', e && (e as Error).message);
  }
  return deviceId;
}

/** 机器名（给「我的电脑：张三的笔记本」用）。 */
function deviceName(): string {
  return os.hostname() || 'Windows 电脑';
}

// ===========================================================================
// 去重表（L-25l）
// ===========================================================================

function loadDone(): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(doneFile(), 'utf8'));
    return Array.isArray(parsed && parsed.done) ? parsed.done.filter((x: unknown) => typeof x === 'string') : [];
  } catch (_) {
    return [];
  }
}

function markDone(pendingId: string): void {
  const done = loadDone();
  if (done.includes(pendingId)) return;
  done.push(pendingId);
  // 只留最近 500 条 —— 够用，又不会无限长
  const trimmed = done.slice(-500);
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(doneFile(), JSON.stringify({ done: trimmed }, null, 2), 'utf8');
  } catch (_) { /* 落盘失败 ⇒ 下次可能重跑一次（可接受） */ }
}

// ===========================================================================
// SSE 读帧（自己实现 —— Electron 32 的 Node 20 **没有**全局 EventSource）
// ===========================================================================

/** 把 fetch 的响应流切成一行一行。 */
async function* readLines(res: Response): AsyncGenerator<string> {
  const body = res.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
      yield line;
    }
  }
}

// ===========================================================================
// 客户端
// ===========================================================================

export interface DeviceClientStatus {
  deviceId: string;
  registered: boolean;
  connected: boolean;
  lastError: string | null;
  /** 服务端返回的「顶掉了哪台设备」。 */
  replacedDeviceId: string | null;
}

type RequestListener = (req: ClientToolRequest) => void;

class DeviceClient {
  private accessToken: string | null = null;
  private deviceId: string = '';
  private abort: AbortController | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private retryDelay = 3000;
  private registered = false;
  private connected = false;
  private lastError: string | null = null;
  private replacedDeviceId: string | null = null;
  private listeners = new Set<RequestListener>();

  status(): DeviceClientStatus {
    return {
      deviceId: this.deviceId,
      registered: this.registered,
      connected: this.connected,
      lastError: this.lastError,
      replacedDeviceId: this.replacedDeviceId,
    };
  }

  onRequest(cb: RequestListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** 渲染层把 access token 推过来（内存持有，⛔ 不持久化 —— 跟渲染层同款口径）。 */
  setAccessToken(token: string | null): void {
    const changed = token !== this.accessToken;
    this.accessToken = token;
    if (changed) {
      this.retryDelay = 3000;
      void this.ensureConnected();
    }
  }

  /** 连上（注册 + SSE）。没 token 就什么都不做。 */
  async ensureConnected(): Promise<void> {
    if (!this.accessToken) return;
    if (this.abort) return;         // 已经在连了
    this.abort = new AbortController();
    try {
      await this.register();
      await this.openStream();
    } catch (e) {
      this.lastError = (e as Error).message;
      this.scheduleRetry();
    }
  }

  /** 断开（登出 / 退出）。 */
  disconnect(): void {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    if (this.abort) { try { this.abort.abort(); } catch (_) {} this.abort = null; }
    this.connected = false;
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, 60000);   // 指数退避，上限 60s
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.ensureConnected();
    }, delay);
  }

  /** D1 注册 / 绑定。 */
  private async register(): Promise<void> {
    const deviceId = getDeviceId();
    this.deviceId = deviceId;
    const res = await fetch(`${apiBase()}/devices/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({ deviceId, deviceName: deviceName(), platform: os.platform() }),
      signal: this.abort ? this.abort.signal : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`注册失败 ${res.status}: ${text.slice(0, 200)}`);
    }
    const body = (await res.json().catch(() => ({}))) as { replacedDeviceId?: string | null };
    this.registered = true;
    this.replacedDeviceId = body && body.replacedDeviceId ? String(body.replacedDeviceId) : null;
  }

  /** D2 SSE 长连。 */
  private async openStream(): Promise<void> {
    const res = await fetch(
      `${apiBase()}/devices/events?deviceId=${encodeURIComponent(this.deviceId)}`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'X-Device-Id': this.deviceId,
          Accept: 'text/event-stream',
        },
        signal: this.abort ? this.abort.signal : undefined,
      },
    );
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`设备通道连接失败 ${res.status}: ${text.slice(0, 200)}`);
    }
    this.connected = true;
    this.retryDelay = 3000;

    let dataLines: string[] = [];
    for await (const line of readLines(res)) {
      if (line.startsWith(':')) continue;            // 心跳是注释行（L-25i）
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
        continue;
      }
      if (line.startsWith('id:')) continue;          // 游标行（我们按 pending_id 去重，不用它）
      if (line === '') {
        // 一帧结束
        if (dataLines.length) {
          const payload = dataLines.join('\n');
          dataLines = [];
          void this.handleFrame(payload);
        }
      }
    }
    // 流结束（服务端重启 / 网络断）⇒ 掉线 ⇒ 重连
    this.connected = false;
    this.abort = null;
    this.scheduleRetry();
  }

  /** 处理一帧。 */
  private async handleFrame(payload: string): Promise<void> {
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(payload);
    } catch (_) {
      return;
    }
    const type = ev && ev.type ? String(ev.type) : '';
    if (type === 'device_ready') {
      this.connected = true;
      this.lastError = null;
      return;
    }
    if (type === 'device_replaced') {
      // ★ L-25e：本机已被顶掉 ⇒ 停止一切执行能力 + 断通道。
      this.connected = false;
      this.disconnect();
      this.lastError = '这台电脑已被同一账号在另一台电脑上顶掉，本机已失去执行能力。';
      console.warn('[client-tools/device] device_replaced —— 停止端侧执行');
      return;
    }
    if (type !== 'client_tool_request') return;

    const req = ev as unknown as ClientToolRequest;
    const pendingId = req.pending_id;
    if (!pendingId) return;
    // ★ L-25l：按 pending_id 去重（跨重启也认 ⇒ 落盘）
    if (loadDone().includes(pendingId)) {
      console.log('[client-tools/device] 派单已结过，跳过:', pendingId);
      return;
    }

    // 通知渲染层（UI 显示「正在你的电脑上执行」）
    for (const cb of this.listeners) {
      try { cb(req); } catch (_) {}
    }

    const result = await this.runRequest(req);
    markDone(pendingId);
    await this.uploadResult(pendingId, result);
  }

  /** 跑一次派单（闸门 → 执行 → 审计）。 */
  private async runRequest(req: ClientToolRequest): Promise<ClientToolResult> {
    const t0 = Date.now();
    const tool = req.tool || '';
    const args = (req.args || {}) as Record<string, unknown>;
    try {
      assertAllowed(tool, args);
    } catch (e) {
      const code = (e as { code?: string }).code || 'gate';
      appendAudit({
        ts: Date.now(),
        tool,
        pendingId: req.pending_id,
        originClient: req.origin_client,
        outcome: 'denied',
        reason: code,
        summary: tool === 'pc_shell' ? summarizeCommand(String(args.command || '')) : undefined,
        durationMs: Date.now() - t0,
      });
      return {
        status: 'denied',
        error: `端侧闸门拒绝（${code}）：${(e as Error).message}`,
      };
    }

    try {
      const result = await executeClientTool(tool, args, req.cwd, req.timeout_ms);
      appendAudit({
        ts: Date.now(),
        tool,
        pendingId: req.pending_id,
        originClient: req.origin_client,
        outcome: result.status === 'ok' ? 'allowed' : 'error',
        reason: result.status === 'ok' ? undefined : 'tool_error',
        summary: tool === 'pc_shell' ? summarizeCommand(String(args.command || '')) : undefined,
        durationMs: Date.now() - t0,
        exitCode: result.exitCode,
      });
      return result;
    } catch (e) {
      appendAudit({
        ts: Date.now(),
        tool,
        pendingId: req.pending_id,
        originClient: req.origin_client,
        outcome: 'error',
        reason: 'exception',
        durationMs: Date.now() - t0,
      });
      return { status: 'error', error: `端侧执行异常: ${(e as Error).message}` };
    }
  }

  /** D3 结果上行。 */
  private async uploadResult(pendingId: string, result: ClientToolResult): Promise<void> {
    try {
      const res = await fetch(`${apiBase()}/devices/tasks/${encodeURIComponent(pendingId)}/result`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
          'X-Device-Id': this.deviceId,
        },
        body: JSON.stringify({ deviceId: this.deviceId, ...result }),
      });
      if (!res.ok) {
        // 409 = 别人已经结过了（L-25n）⇒ 收工，不重试。
        // 其它错误 ⇒ 记一条，靠去重表防止重复执行（但结果没回去 —— 下次重连会补推）。
        const text = await res.text().catch(() => '');
        this.lastError = `结果上行失败 ${res.status}: ${text.slice(0, 200)}`;
        console.warn('[client-tools/device] 结果上行失败:', this.lastError);
      }
    } catch (e) {
      this.lastError = (e as Error).message;
      console.warn('[client-tools/device] 结果上行异常:', this.lastError);
    }
  }
}

/** 全局单例。 */
export const deviceClient = new DeviceClient();
