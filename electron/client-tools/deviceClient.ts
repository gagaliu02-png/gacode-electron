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
  ClientToolArtifact,
  ClientToolRequest,
  ClientToolResult,
} from './types';
import { assertAllowed, appendAudit, summarizeCommand } from './gate';
import { executeClientTool } from './executor';
import { stopAllJobs, stopJobById } from './jobRunner.ts';
import { listUnreportedJobs } from './localJobs.ts';

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

/**
 * 设备通道的本地日志（落 `%APPDATA%/Gacode/client-tools.log`）。
 *
 * ## 为什么落文件而不是只 console.log
 *
 * dev 模式下 electron 的 stdout **不一定**回到启动它的终端（electron-vite dev
 * 会另起进程接管）⇒ 出问题时「控制台里啥也没有」＝没法定位。
 * ⇒ 落一个文件，用户/我都能直接看。
 */
function logDevice(msg: string): void {
  try {
    const file = path.join(app.getPath('userData'), 'client-tools.log');
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${msg}\n`, 'utf8');
  } catch (_) { /* 日志失败不许影响主流程 */ }
  console.log('[client-tools/device]', msg);
}

/**
 * ★ 这台设备**自己**具备哪些端侧能力（注册时上报给服务端）。
 *
 * ## 为什么由**设备**声明，而不是由「发起那一轮的端」声明
 *
 * 「手机远程指挥 PC」这条路径里，**发起端是手机、执行端是 PC**：
 *   · 手机自己执行不了 `pc_shell` ⇒ 手机**不该**声明 `pty`；
 *   · 但这一轮**必须**能派单到 PC ⇒ 服务端得知道「这个账号有一台能干活的电脑」。
 * ⇒ 设备在 D1 注册时上报自己的能力 ⇒ 服务端按**账号的设备能力**决定
 *   这一轮要不要下发 `pc_*`（没设备的账号 ⇒ 不下发 ⇒ 老行为逐字不变）。
 *
 * ⚠️ **`pty` 是探测出来的，不是写死的** —— 声明了但实际没有 =
 *   模型会调一个**必然挂起**的工具（`pc_shell` 等一个永远不回来的结果）⇒ 整轮空转。
 */
let _capabilitiesCache: string | null = null;
export function deviceCapabilities(): string {
  if (_capabilitiesCache) return _capabilitiesCache;
  let pty = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('node-pty');
    pty = typeof mod.spawn === 'function';
  } catch (_) {
    pty = false;
  }
  _capabilitiesCache = pty
    ? 'client-tools=1,pty=1,fs=1,screen=1,os=1'
    : 'client-tools=1,fs=1,screen=1,os=1';
  return _capabilitiesCache;
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

/**
 * ★ [P6] 一条**正在本机跑**的端侧任务。
 *
 * 多个会话的任务可以**同时**在这台电脑上跑（每个 pending 有自己的等待者）⇒
 * 用户得能看见「现在有几件在跑、是哪几件、能不能停掉其中一件」。
 */
export interface RunningClientTask {
  /** 派单的 `pending_id`（裁决身份）。 */
  pendingId: string;
  tool: string;
  title: string | null;
  /** 发起这个任务的会话（手机发起的 ⇒ 这里就是手机那个会话）。 */
  sessionId: string | null;
  /** 发起端（web / pc / android）。 */
  originClient: string | null;
  /** 开始跑的时刻（epoch ms）。 */
  startedAt: number;
}

type RequestListener = (req: ClientToolRequest) => void;
type TasksListener = (tasks: RunningClientTask[]) => void;

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
  /** ★ P6：正在跑的任务（pendingId → 任务 + 它的中止句柄）。 */
  private running = new Map<string, { task: RunningClientTask; ac: AbortController }>();
  private taskListeners = new Set<TasksListener>();

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

  // ── P6 · 正在跑的任务 ──────────────────────────────────────────────────

  /** 当前正在跑的任务列表（给 UI 显示「你的电脑上现在在跑什么」）。 */
  runningTasks(): RunningClientTask[] {
    return Array.from(this.running.values()).map((v) => ({ ...v.task }));
  }

  /** 订阅「正在跑的任务」变化。 */
  onTasks(cb: TasksListener): () => void {
    this.taskListeners.add(cb);
    return () => this.taskListeners.delete(cb);
  }

  private emitTasks(): void {
    const list = this.runningTasks();
    for (const cb of this.taskListeners) {
      try { cb(list); } catch (_) {}
    }
  }

  /**
   * ★ P6 · 停掉一个正在跑的任务。
   *
   * ⇒ 中止它的执行（杀整棵进程树）⇒ 回一个「已被用户停止」的结果给服务端
   *   ⇒ 模型能转告用户「你让我停的那条已经停了」。
   *
   * ★ [2026-11-13 · 订正 27] **后台作业也必须能被这样打断** ——
   *   后台作业是 **detached 的独立进程**（派单即返回就出队了 ⇒ 不在 `this.running` 里）
   *   ⇒ 光 abort 那个 AbortController **杀不到它** ⇒ 用户点了「停」而作业还在跑
   *   ⇒ 那是最糟的一种不一致（界面说停了，Claude Code 还在改用户的代码）。
   */
  stopTask(pendingId: string): boolean {
    let stopped = false;
    const entry = this.running.get(pendingId);
    if (entry) {
      try { entry.ac.abort(); } catch (_) {}
      stopped = true;
    }
    // ★ 后台作业：按 pid 杀进程树。
    const job = stopJobById(pendingId);
    if (job.stopped) {
      stopped = true;
      // 打断的结果**要回传** —— 否则服务端要等 24h 超时才知道作业没了。
      void this.uploadResult(pendingId, {
        status: 'error',
        error: '作业已被用户停止',
      });
    }
    return stopped;
  }

  /**
   * ★ [2026-11-13] **一键急停** —— 把**所有**正在跑的任务都掐掉。
   *
   * 闸门文件 `client-gate.json` 里的 `killSwitch` 只挡**新**派单
   * （`gate.ts` 的 `assertAllowed`）⇒ 光把它打开，**已经在跑**的命令
   * 还会继续跑完 —— 而界面上写的是「正在跑的命令会被终止」⇒ 必须真杀。
   *
   * ⚠️ **后台作业（detached 进程）也必须被杀** —— 否则急停之后
   *    Claude Code 还在用户的电脑上继续改代码（承诺与事实不符）。
   *
   * @returns 被掐掉的任务数（同步任务 + 后台作业）
   */
  stopAllTasks(): number {
    let n = 0;
    for (const [, entry] of this.running) {
      try {
        entry.ac.abort();
        n += 1;
      } catch (_) { /* 杀不掉就算了 —— 闸门已经挡住后续派单 */ }
    }
    // ★ 后台作业（detached）—— 不在 this.running 里 ⇒ 单独杀。
    for (const job of listUnreportedJobs()) {
      if (!job.pid) continue;
      const r = stopJobById(job.id);
      if (r.stopped) {
        n += 1;
        void this.uploadResult(job.id, {
          status: 'error',
          error: '作业已被用户停止（急停）',
        });
      }
    }
    return n;
  }

  /** 渲染层把 access token 推过来（内存持有，⛔ 不持久化 —— 跟渲染层同款口径）。 */
  setAccessToken(token: string | null): void {
    const changed = token !== this.accessToken;
    this.accessToken = token;
    logDevice(`setAccessToken ${token ? '有 token' : 'token 为空'}（changed=${changed}）`);
    if (!changed) return;
    this.retryDelay = 3000;
    // ★ access token 只有 **15 分钟**有效期（服务端 TTL）⇒ 旧连接拿着的 token 一定会过期。
    //   ⇒ 换 token 时**必须掐掉**正在跑的那次连接（它拿着的是旧 token），
    //     否则重连会一直用旧 token ⇒ 401 ⇒ 设备通道**永久离线**。
    if (this.abort) {
      try { this.abort.abort(); } catch (_) {}
      this.abort = null;
      this.connected = false;
    }
    void this.ensureConnected();
  }

  /**
   * 当前的 access token（内存里那份）。
   *
   * ⚠️ 给**本机定时任务**用（它也要发一轮对话 ⇒ 要 Bearer）。
   * ⛔ 绝不落盘（access token 不持久化，跟渲染层同款口径）。
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /** 连上（注册 + SSE）。没 token 就什么都不做。 */
  async ensureConnected(): Promise<void> {
    if (!this.accessToken) {
      logDevice('ensureConnected: 没有 token ⇒ 不连');
      return;
    }
    if (this.abort) {
      logDevice('ensureConnected: 已经在连了 ⇒ 跳过');
      return;
    }
    const ac = new AbortController();
    this.abort = ac;
    try {
      await this.register(ac);
      await this.openStream(ac);
    } catch (e) {
      // ⛔ 被人掐掉（换 token / 退出）⇒ **不算失败**，别去排重试。
      if (ac.signal.aborted) {
        logDevice('连接被中止（换 token / 退出）');
        return;
      }
      this.lastError = (e as Error).message;
      logDevice(`连接失败: ${this.lastError}`);
      if (this.abort === ac) this.abort = null;
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
  private async register(ac: AbortController): Promise<void> {
    const deviceId = getDeviceId();
    this.deviceId = deviceId;
    const res = await fetch(`${apiBase()}/devices/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify({
        deviceId,
        deviceName: deviceName(),
        platform: os.platform(),
        // ★ 这台设备自己的能力 ⇒ 服务端按**账号的设备能力**决定这一轮能不能派端侧工具。
        capabilities: deviceCapabilities(),
      }),
      signal: ac.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`注册失败 ${res.status}: ${text.slice(0, 200)}`);
    }
    const body = (await res.json().catch(() => ({}))) as { replacedDeviceId?: string | null };
    this.registered = true;
    this.replacedDeviceId = body && body.replacedDeviceId ? String(body.replacedDeviceId) : null;
    logDevice(`注册成功 deviceId=${deviceId}（顶掉了：${this.replacedDeviceId || '无'}）`);
  }

  /** D2 SSE 长连。 */
  private async openStream(ac: AbortController): Promise<void> {
    const res = await fetch(
      `${apiBase()}/devices/events?deviceId=${encodeURIComponent(this.deviceId)}`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'X-Device-Id': this.deviceId,
          Accept: 'text/event-stream',
        },
        signal: ac.signal,
      },
    );
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      throw new Error(`设备通道连接失败 ${res.status}: ${text.slice(0, 200)}`);
    }
    this.connected = true;
    logDevice('设备通道已连接（SSE 建立）');
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
    // ⚠️ 只有「这次尝试还是当前那一次」才排重连 ——
    //    换 token 时我们已经把 this.abort 换掉了 ⇒ 别把新连接掐了。
    if (this.abort === ac) {
      this.abort = null;
      logDevice('设备通道断开 ⇒ 准备重连');
      this.scheduleRetry();
    }
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
      logDevice('收到 device_ready ⇒ 通道就绪');
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
    if (type === 'client_tool_cancel') {
      // ★ [2026-11-13 · 订正 27] **用户点了聊天窗口的「停止」** ——
      //   服务端取消了那一轮 ⇒ 这一轮在**这台电脑上**跑的活必须真的停掉。
      //   ⇒ 直连的同步任务：abort（杀进程树）；后台作业：按 pid 杀 detached 进程。
      //   ⚠️ 不处理的话 = 「点了停止」而电脑还在跑 ⇒ 用户最不信任这种不一致。
      const pid = ev && ev.pending_id ? String(ev.pending_id) : '';
      if (!pid) return;
      const stopped = this.stopTask(pid);
      logDevice(`收到 client_tool_cancel（pending_id=${pid}）⇒ ${stopped ? '已停' : '没找到在跑的活'}`);
      // ⚠️ 不用「伪造一个 client_tool_request」去通知渲染层 ——
      //   渲染层的「正在跑」列表靠 `onTasks` 订阅更新（同步任务 abort 后会从 running 里摘掉）。
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
    // ★ [P5 · 2026-11-12] 端侧产物 → 服务端托管（好进**交付中心**）。
    //   只有 `kind:'file'`（单文件）上传；`kind:'workspace'`（目录/项目）**不上传**
    //   （L-24o：目录产物不进交付中心，只报本机路径）。
    const withUrls = await this.uploadArtifacts(result);
    await this.uploadResult(pendingId, withUrls);
  }

  /**
   * 把端侧的**单文件**产物上传到服务端托管。
   *
   * ⚠️ 上传失败**不**让整次执行失败 —— 本机文件已经写好了（那是执行的结果），
   *    上传只是「让它在手机上也能下载」这一层附加价值 ⇒ 失败就当没有 URL，
   *    服务端不会把它登记成交付物（进了一个打不开的条目更糟）。
   */
  private async uploadArtifacts(result: ClientToolResult): Promise<ClientToolResult> {
    const artifacts = Array.isArray(result.artifacts) ? result.artifacts : [];
    if (!artifacts.length) return result;
    const out: ClientToolArtifact[] = [];
    for (const a of artifacts) {
      if (!a || a.kind !== 'file') {
        if (a) out.push(a);
        continue;
      }
      try {
        const buf = await fs.promises.readFile(a.path);
        const fd = new FormData();
        fd.append('file', new Blob([buf]), a.name);
        fd.append('localPath', a.path);
        fd.append('deviceId', this.deviceId);
        fd.append('kind', a.kind);
        const res = await fetch(`${apiBase()}/devices/artifacts`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.accessToken}` },
          body: fd,
        });
        if (!res.ok) {
          console.warn('[client-tools/device] 产物上传失败:', res.status);
          out.push(a);
          continue;
        }
        const body = (await res.json().catch(() => ({}))) as {
          url?: string;
          size?: number;
          mimeType?: string;
        };
        out.push({
          ...a,
          url: body.url || a.url,
          size: body.size ?? a.size,
          mimeType: body.mimeType || a.mimeType,
        });
      } catch (e) {
        console.warn('[client-tools/device] 产物上传异常:', e && (e as Error).message);
        out.push(a);
      }
    }
    return { ...result, artifacts: out };
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
      // ★ P6：登记「正在跑」+ 给它一个中止句柄（用户可以停掉其中一条）。
      const ac = new AbortController();
      const pendingId = req.pending_id || '';
      this.running.set(pendingId, {
        task: {
          pendingId,
          tool,
          title: req.title,
          sessionId: req.session_id,
          originClient: req.origin_client,
          startedAt: Date.now(),
        },
        ac,
      });
      this.emitTasks();
      let result: ClientToolResult;
      try {
        result = await executeClientTool(tool, args, req.cwd, req.timeout_ms, ac.signal);
      } finally {
        this.running.delete(pendingId);
        this.emitTasks();
      }
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
