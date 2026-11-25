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
import { getJob, listUnreportedJobs, markJobReported, markJobTerminal, updateJob } from './localJobs.ts';
import {
  decideBackgroundDispatch,
  getDispatchEntry,
  markDispatch,
  markDispatchReported,
  listDispatchEntries,
} from './dispatchLedger.ts';
import { buildCapabilityString, probeJobExecutor } from './jobCapability.ts';
// [2026-11-15 · 订正 31 · M0.5] 浏览器池接线状态 ⇒ 决定要不要声明 browser=1
import { hasBrowserTabPool } from './browser.ts';
// [2026-11-17 · T-020] Claude Code 管控能力判据
import { hasClaudeCodeSessions, listClaudeSessions } from './claudeCodeSession.ts';
// [T-086] QMT bridge 本机可用性（只声明能力，不下单、不连服务端）
import { qmtAvailable } from './qmtBridge.ts';
import { emitJobsChanged } from './jobView.ts';
import type { JobReportPayload } from './jobReporter.ts';
// ★ [2026-11-17] 解绑 / 登出 ⇒ 清掉上一账号在本机的作业 / 派单 / 审计记录。
import { clearAccountScopedLocalData } from './accountScope.ts';
// ★ [2026-11-19 · T-068 / T-072] peer notice 读侧 + 后台 job 管理器。
import { claudeCodePeerInbox, type DispatchedNotice } from './claudeCodePeerInbox.ts';
import { readNewAssistantText, findResultBlockByTaskId } from './claudeCodeResultWatcher.ts';
import { parseGaclawResultBlock } from './claudeResultFormat.ts';
// ★ [T-088] 后台任务失败/断链/用户打断 ⇒ 统一机器事件出口。
import {
  emitMachineEvent,
  type MachineEventContext,
  type MachineEventDeps,
} from './machineEvents.ts';

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

/**
 * ★ [2026-11-17] 「已被解绑」的本地标记 —— **跟 deviceId 存在同一个文件**。
 *
 * ## 为什么要有它
 *
 * 服务端的解绑只清了「服务端那条绑定」；本机若还按老规矩自动重连/重注册，
 * ⇒ 几秒内又把绑定抢回来 ⇒ **「解绑电脑端控制」等于白点**。
 *
 * ⇒ 解绑后本机进入 `unbound` 态：**不注册、不重连、不接派单**，
 *   直到 (a) 用户显式点「重新绑定」，或 (b) **重新登录**（含启动时恢复会话）。
 *
 * ⚠️ **落盘**（跨重启保留）—— 只放内存的话，重启一次就自动绑回去了。
 * ⚠️ 存在 device-id.json 里（不是另一个文件）⇒ 少一个文件、少一处清理。
 */
/**
 * ★ [2026-11-17] 解绑原因（决定「重新登录」要不要自动清标记）：
 *   · `logout`  —— 登出解绑 ⇒ 重新登录时**自动重新绑定**（PM 拍板）。
 *   · `manual`  —— 用户点「解绑电脑端控制」⇒ **必须显式点「重新绑定」**，
 *                  重新登录也不清（否则用户明明解绑了，一登录又绑回去）。
 */
export type UnbindReason = 'logout' | 'manual' | null;

interface DeviceIdFile {
  deviceId?: string;
  createdAt?: number;
  unbound?: boolean;
  unbindReason?: UnbindReason;
}

function readDeviceIdFile(): DeviceIdFile {
  try {
    const raw = fs.readFileSync(deviceIdFile(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function writeDeviceIdFile(data: { deviceId: string; createdAt?: number; unbound?: boolean; unbindReason?: UnbindReason }): void {
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(deviceIdFile(), JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[client-tools/device] deviceId 落盘失败:', e && (e as Error).message);
  }
}

/** 去重表（已结的 `pending_id`）。 */
function doneFile(): string {
  return path.join(app.getPath('userData'), 'client-done.json');
}

/** 取（没有就生成并落盘）本机 `deviceId`。 */
export function getDeviceId(): string {
  const parsed = readDeviceIdFile();
  if (parsed && typeof parsed.deviceId === 'string' && parsed.deviceId.length >= 8) {
    return parsed.deviceId;
  }
  const deviceId = randomUUID();
  writeDeviceIdFile({ deviceId, createdAt: Date.now() });
  return deviceId;
}

/**
 * ★ [2026-11-17] 本机是不是「已被解绑」（落盘标记）。
 *
 * ## 这个标记管什么
 *
 * 服务端的解绑只清了「服务端那条绑定」；本机若还按老规矩自动重连/重注册，
 * ⇒ 几秒内又把绑定抢回来 ⇒ **「解绑电脑端控制」等于白点**。
 *
 * ⇒ 解绑后本机进入 `unbound` 态：**不注册、不重连、不接派单**，
 *   直到 (a) 用户显式点「重新绑定」，或 (b) **重新登录**（含登录页输密码那次）。
 */
export function isUnboundLocally(): boolean {
  return readDeviceIdFile().unbound === true;
}

/** 当前解绑原因（跨重启保留）。 */
export function getUnbindReason(): UnbindReason {
  return readDeviceIdFile().unbindReason || null;
}

/**
 * ★ [2026-11-17] 标记 / 清除「已被解绑」本地状态。
 *
 * `unbound=true` ⇒ 已解绑（自动注册被挡住）；`false` ⇒ 允许自动注册。
 */
export function setUnboundLocally(unbound: boolean, reason: UnbindReason = null): void {
  const parsed = readDeviceIdFile();
  const deviceId =
    typeof parsed.deviceId === 'string' && parsed.deviceId.length >= 8
      ? parsed.deviceId
      : getDeviceId();
  writeDeviceIdFile({
    deviceId,
    createdAt: typeof parsed.createdAt === 'number' ? parsed.createdAt : Date.now(),
    unbound: unbound === true,
    unbindReason: unbound ? reason || 'manual' : null,
  });
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
 *
 * ★ [2026-11-13 · 订正 27 · B6] 追加 **`job`** 子能力（L-27j）：
 *   「显式声明**这台 PC 装了后台作业执行器**」⇒ 服务端才下发
 *   `pc_claude` / `pc_job_start` / `pc_job_status` / `pc_job_stop`。
 *
 *   ⚠️ **判据 = 作业执行器在不在**，而它**是本 app 内建的** ⇒ 新版 PC **恒定**声明 `job=1`。
 *   ⛔ **不许**把「有没有装 Claude Code」绑进这个判据 ——
 *      服务端 `pc_claude` 与 `pc_job_start` **共用** `job` 这一个键
 *      ⇒ 按 claude 决定的话，「没装 claude 但能跑普通命令」的电脑会连
 *      `pc_job_start` 也一起被挡掉（白白少一个能力）。
 *      「没装 claude」的正确语义是**作业如实失败并回报**
 *      （服务端 spec 里写明：job fails with that error — report it to the user）。
 *   ⇒ 下面的探针只当**诊断**用（这台机器能不能真的起进程），不参与能力判定。
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
  // ★ L-27j：执行器是 app 内建的 ⇒ 恒定声明 `job=1`。
  //   探针只做**诊断**（万一这台机器连进程都起不了 ⇒ 记一条，别瞒着）。
  const probe = probeJobExecutor();
  if (!probe.executor) {
    console.warn('[client-tools/device] 后台作业执行器探针没过（不影响能力声明）:', probe.reason);
  }
  // ★ [2026-11-15 · 订正 31 · M0.5] 浏览器池接好线了才声明 `browser=1`。
  //   ⚠️ 时序：`main.ts` 在 whenReady 里先 `setBrowserTabPool` 再起 renderer
  //     ⇒ token 推来触发注册时池必然已接线，此处判断不会漏报。
  const browser = hasBrowserTabPool();
  // ★ [2026-11-17 · T-020] Claude Code 管控：本机有 Claude Code 会话登记目录才声明。
  //   ⚠️ 「没装 Claude Code」的语义 = 工具如实失败并回报，不是「不下发」
  //   （跟 `job` 键同款口径）⇒ 判据用「目录在不在」这种**真接线**信号，
  //   而不是「有没有活会话」（没活会话时也该能下发，否则永远学不会用）。
  const claudeCode = hasClaudeCodeSessions();
  // ★ [T-086] QMT bridge 命令/配置存在才声明 qmt=1（安全降级；能力头不做鉴权，闸门在 qmtBridge/gate）
  const qmt = qmtAvailable();
  _capabilitiesCache = buildCapabilityString({ pty, job: true, browser, claudeCode, qmt });
  if (browser) {
    logDevice('浏览器池已接线 ⇒ 能力表声明 browser=1（pc_browser_* 可下发）');
  }
  if (claudeCode) {
    logDevice('本机有 Claude Code 会话登记 ⇒ 能力表声明 claude-code=1（pc_cc_* 可下发）');
  }
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
  /**
   * ★ [2026-11-17] **已被解绑**（用户主动点了「解绑」或账号登出）。
   *
   * ⛔ 为 true 时**不许**自动注册 / 重连 —— 解绑后必须显式「重新绑定」
   *    或重新登录，才会重新绑定（否则「解绑」按钮等于白点）。
   */
  unbound: boolean;
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
  /**
   * ★ [2026-11-13 · 订正 27] 执行模式：
   * `'sync'`（这一轮在等它）| `'background'`（派单即返回，作业在后台跑）。
   */
  mode?: 'sync' | 'background' | null;
}

type RequestListener = (req: ClientToolRequest) => void;
type TasksListener = (tasks: RunningClientTask[]) => void;

/** 每个 peer-job 的 24h 系统兜底 deadline（服务端同口径）。 */
const PEER_JOB_DEADLINE_MS = 24 * 60 * 60 * 1000;
/**
 * 慢 poll 兜底：无 notice / notice 里没有结果块时，每 45s 读一次 transcript 增量。
 * ⛔ 不再是 1500ms 主路径。
 */
const PEER_JOB_POLL_MS = 45_000;
/**
 * ★ [T-121] 「目标会话已经回了话，但没按协议带结果块」的收口窗口。
 *
 * 病根（生产实证 · ping-pong）：Cody 用 `pc_cc_send` 发 PONG 给我，
 * 我把它当**普通对话**回了「PONG #n」，没有输出带 `task_id` 的 `===GACLAW_RESULT_START===` 块。
 * ⇒ `readResult()` 的 `hit.task_id === job.taskId` 永远不成立
 * ⇒ 派单停在 `running` ⇒ **手机端「后台任务」横幅一直挂着**，直到用户手动停止。
 *
 * 修法：看到目标会话**确实产出了新正文**（`text` 非空）后给一个宽限窗口
 * （`PEER_JOB_NO_BLOCK_GRACE_MS`）—— 窗口内还等不到合法结果块，就把这条派单
 * 以「已送达、对方已回复、但没按协议回结果块」**结算掉**（status:'error'，如实说明），
 * ⇒ D3 回传 ⇒ 服务端 settleDispatch ⇒ **横幅消失**。
 *
 * ⚠️ 只在「确实看到了新助手正文」之后才计时 ⇒ 对方还没开始干活时不会误结。
 * ⚠️ 窗口取 2 分钟：足够一次正常的协议回执（几乎是即时的），又不会让横幅挂 24h。
 *
 * ★ [T-141] 但这个窗口**不能单独**触发结算：真机上出现过「结果块已完整写入 transcript，
 *   增量窗口漏读 ⇒ 2min 到期误报 failed」的采集端 bug。
 *   ⇒ 现在只有**同时**满足「会话已真 idle/exit」+「tail 按 task_id 反查也没有合法结果块」
 *     才允许 no-block 收口（见 readResult 的 terminal-only 判据）。
 */
const PEER_JOB_NO_BLOCK_GRACE_MS = 2 * 60 * 1000;

// ═══════════════════════════════════════════════════════════════════════════
// ★ [T-088] 机器事件统一出口（session-inbox + channel-status + 本机 outbox）
// ═══════════════════════════════════════════════════════════════════════════

/** 主进程的机器事件依赖（token / deviceId / fetch 都从 deviceClient 单例拿）。 */
function machineEventDeps(client: DeviceClient): MachineEventDeps {
  return {
    apiBase,
    accessToken: () => client.getAccessToken(),
    deviceId: () => getDeviceId(),
    // ★ reply_to 可用时把 channel-status 注记也写进目标 CC 会话（best-effort）。
    writeChannelStatus: async (sessionId, notice) => {
      // 延迟 import 避免顶层循环（claudeCodePeer → deviceClient 在 executor 里用）。
      try {
        const peer = await import('./claudeCodePeer.ts');
        const r = await peer.sendPeerMessage(sessionId, notice, 'later', null);
        return r.ok;
      } catch (e) {
        console.warn('[t088] 写 channel-status 失败:', e && (e as Error).message);
        return false;
      }
    },
  };
}

/**
 * 从派单 / 作业记录里取机器事件上下文。
 * ⚠️ `sessionId` 缺失 ⇒ 不发（`buildMachineEvent` 会返回 null）—— 宁可少发，不发错会话。
 */
function eventContextFromDispatch(
  pendingId: string,
  reason: string | null,
): MachineEventContext {
  const entry = getDispatchEntry(pendingId);
  const job = getJob(pendingId);
  return {
    sessionId: job?.sessionId || null,
    pendingId,
    tool: entry?.tool || job?.serviceId || null,
    title: null,
    reason,
  };
}

/**
 * ★ 终态落账 + 机器事件（横幅立刻消失）。
 *
 * · `return_failed` / `cancelled_by_user` 是终态 ⇒ 本机作业 + 派单账一起推到终态；
 * · `emitJobsChanged()` 通知渲染层重画（不等轮询）；
 * · 机器事件经 `/devices/cc/messages` 投进 session-inbox（固定身份、不冒用户）；
 * · outbox 落盘 ⇒ 重连后可补发。
 */
async function settleWithMachineEvent(
  client: DeviceClient,
  pendingId: string,
  kind: 'return_failed' | 'cancelled_by_user',
  reason: string | null,
  ctx?: MachineEventContext,
): Promise<void> {
  // ① 清本机账（横幅立即消失，历史列表保留）。
  markJobTerminal(pendingId, kind, reason || undefined);
  markDispatch(pendingId, { state: 'reported', error: reason || kind });
  emitJobsChanged();
  // ② 机器事件（会话缺失 ⇒ 静默跳过，只落本机账）。
  const context = ctx || eventContextFromDispatch(pendingId, reason);
  try {
    await emitMachineEvent(machineEventDeps(client), kind, context);
  } catch (e) {
    console.warn('[t088] 机器事件投递异常:', e && (e as Error).message);
  }
}

/** D3 失败的**稳定**分类（给日志 / 说明句一个不变的 reason 字符串）。 */
type ResultFailureReason =
  | 'HTTP_401'
  | 'HTTP_404'
  | 'TASK_NOT_FOUND'
  | 'HTTP_5xx'
  | 'HTTP_OTHER'
  | 'NETWORK_ERROR';

function classifyD3Failure(status: number, bodyText: string): ResultFailureReason {
  if (status === 401) return 'HTTP_401';
  if (status === 404) {
    return /TASK_NOT_FOUND/i.test(bodyText) ? 'TASK_NOT_FOUND' : 'HTTP_404';
  }
  if (status >= 500) return 'HTTP_5xx';
  if (status > 0) return 'HTTP_OTHER';
  return 'NETWORK_ERROR';
}

/**
 * [2026-11-19 · T-068 / T-072] `pc_cc_send` 的后台 job。
 *
 * 一条 job = 一次消息注入 + 一个 `notify_when_idle` 订阅。
 * notice 只负责「去看一眼」，结果必须由 transcript 里 `task_id === pendingId`
 * 的合法结果块裁决；没有结果就继续等（慢 poll / 下一条 notice）直到 24h。
 */
interface PeerJob {
  pendingId: string;
  sessionId: string;
  taskId: string;
  msgId: string;
  sinceOffset: number;
  startedAt: number;
  /** 回传只能发生一次（网络失败会复位，靠下次 notice/poll 重试）。 */
  settled: boolean;
  /** 防并发读 transcript（notice + poll 同时到）。 */
  reading: boolean;
  deadlineTimer: NodeJS.Timeout | null;
  pollTimer: NodeJS.Timeout | null;
  exitNoticeSeen: boolean;
  /** 用户点停止后的终态（只回传一次 cancelledByUser）。 */
  cancelled: boolean;
  /** ★ [T-088] 业务会话（机器事件投递目标）。 */
  businessSessionId: string | null;
  /** ★ [T-088] 回复目标（用于 channel-status 注记 / 主动补回）。 */
  replyTo: MachineEventContext['replyTo'] | null;
  /** ★ [T-121] 第一次看到对方产出新正文的时刻（ms epoch）；没看到过 ⇒ null。 */
  firstReplyTextAt: number | null;
}

/** peer-job 上报载荷（复用 D3 的 JobReport 形状）。 */
interface PeerJobReport {
  status: 'ok' | 'error' | 'denied';
  stdout?: string;
  error?: string;
  cancelledByUser?: boolean;
}

/**
 * 单例 peer-job 管理器：生命周期跟随主进程。
 *
 * 由 `registerClientToolIpc` 启动时接上 `reportJobResult`（拿 token 的只有 deviceClient）；
 * `executor.pcCcSend` 只负责注入 + 登记订阅，结果回传全在这里。
 */
export class PeerJobManager {
  private jobs = new Map<string, PeerJob>();
  private started = false;
  private report: ((jobId: string, payload: PeerJobReport) => Promise<boolean>) | null = null;

  constructor() {
    // notice 回调永远挂上（单例一次）；inbox 由 pcCcSend 懒启动。
    claudeCodePeerInbox.onNotice((n) => this.onNotice(n));
  }

  start(report: (jobId: string, payload: PeerJobReport) => Promise<boolean>): void {
    this.report = report;
    if (this.started) return;
    this.started = true;
  }

  stop(): void {
    for (const id of [...this.jobs.keys()]) this.cleanup(id);
    claudeCodePeerInbox.stop();
    this.started = false;
  }

  /** 启动扫 dispatchLedger：未上报的 pc_cc_send 无法重建订阅映射 ⇒ 报一次失败，防孤儿。 */
  recoverOrphans(): void {
    for (const entry of listDispatchEntries()) {
      if (entry.tool !== 'pc_cc_send' || entry.state === 'reported') continue;
      void this.reportOnce(entry.pendingId, {
        status: 'error',
        error: '进程重启导致 peer notice 订阅丢失，请重新派单',
      }).then((ok) => {
        // 无 reporter（未接线）⇒ reportJobResult 不会跑 ⇒ 本地补终态 + 机器事件；
        // 有 reporter 但失败时它已经发过（同 idempotencyKey 幂等）。
        if (!ok && !this.report) {
          void settleWithMachineEvent(deviceClient, entry.pendingId, 'return_failed',
            '进程重启导致 peer notice 订阅丢失，回传失败');
        }
      });
    }
  }

  /**
   * 登记一条 job（注入 + 订阅成功后调用）。
   * ⚠️ inbox 的 msgId 映射必须由调用方**先** register、再发订阅帧，最后调本方法。
   */
  track(pendingId: string, msgId: string): void {
    if (!pendingId || !msgId) return;
    this.cleanup(pendingId);
    const job: PeerJob = {
      pendingId,
      sessionId: '',
      taskId: pendingId,
      msgId,
      sinceOffset: 0,
      startedAt: Date.now(),
      settled: false,
      reading: false,
      deadlineTimer: null,
      pollTimer: null,
      exitNoticeSeen: false,
      cancelled: false,
      businessSessionId: null,
      replyTo: null,
      firstReplyTextAt: null,
    };
    this.jobs.set(pendingId, job);
    const deadline = setTimeout(() => {
      void this.settle(pendingId, {
        status: 'error',
        error: '端侧 Claude Code 结果等待超过 24h 系统 deadline',
      });
    }, PEER_JOB_DEADLINE_MS);
    try { deadline.unref?.(); } catch { /* ignore */ }
    job.deadlineTimer = deadline;
    const poll = setInterval(() => { void this.readResult(pendingId, 'poll'); }, PEER_JOB_POLL_MS);
    try { poll.unref?.(); } catch { /* ignore */ }
    job.pollTimer = poll;
  }

  /** pcCcSend 拿到基线后补齐 job 上下文（track 之后调用）。 */
  bind(pendingId: string, ctx: { sessionId: string; taskId: string; sinceOffset: number }): void {
    const job = this.jobs.get(pendingId);
    if (!job || job.settled) return;
    job.sessionId = ctx.sessionId;
    job.taskId = ctx.taskId;
    job.sinceOffset = ctx.sinceOffset;
  }

  /**
   * ★ [T-088] 补上业务会话 + reply_to（pcCcSend 拿到派单 args 后调用）。
   * ⚠️ 可多次调用：后来的非空值覆盖前面的空值（bind notice 先到时不会丢）。
   */
  bindBusinessContext(
    pendingId: string,
    ctx: { sessionId?: string | null; replyTo?: MachineEventContext['replyTo'] | null },
  ): void {
    const job = this.jobs.get(pendingId);
    if (!job || job.settled) return;
    if (ctx.sessionId) job.businessSessionId = String(ctx.sessionId);
    if (ctx.replyTo) job.replyTo = ctx.replyTo;
  }

  /** 用户停止 / 取消：清映射 + 以 cancelledByUser 回传一次 + 发机器事件。 */
  cancel(pendingId: string, cancelledByUser = true): boolean {
    const job = this.jobs.get(pendingId);
    if (!job) return false;
    if (!cancelledByUser) { this.cleanup(pendingId); return true; }
    if (job.cancelled || job.settled) return true;
    job.cancelled = true;
    // ★ [T-088] 用户打断 ⇒ 机器事件（cancelled_by_user），清横幅。
    void emitMachineEvent(machineEventDeps(deviceClient), 'cancelled_by_user', {
      sessionId: job.businessSessionId || eventContextFromDispatch(pendingId, null).sessionId,
      pendingId,
      tool: 'pc_cc_send',
      reason: '用户停止了端侧 Claude Code 任务',
      replyTo: job.replyTo,
    }).catch((e) => {
      console.warn('[t088] cancelled_by_user 事件失败:', e && (e as Error).message);
    });
    // 本机账也推到终态（横幅立即消失，历史列表保留）。
    markJobTerminal(pendingId, 'cancelled_by_user', '任务已被用户停止');
    markDispatch(pendingId, { state: 'reported', error: '任务已被用户停止' });
    emitJobsChanged();
    void this.settle(pendingId, {
      status: 'error',
      error: '任务已被用户停止',
      cancelledByUser: true,
    });
    return true;
  }

  has(pendingId: string): boolean {
    return this.jobs.has(pendingId);
  }

  /** 当前所有在等结果的 peer-job id（急停用）。 */
  pendingIds(): string[] {
    return [...this.jobs.keys()];
  }

  /** 收到 peer notice：按状态决定立即读 / 最后读一次 / 降级慢 poll。 */
  private onNotice(n: DispatchedNotice): void {
    const job = this.jobs.get(n.pendingId);
    if (!job || job.settled || job.msgId !== n.msgId) return;
    this.bind(n.pendingId, {
      sessionId: n.sessionId,
      taskId: n.taskId,
      sinceOffset: n.sinceOffset,
    });
    if (n.state === 'unavailable' || n.state === 'waiting') return; // 降级慢 poll
    if (n.state === 'exited') job.exitNoticeSeen = true;
    void this.readResult(n.pendingId, n.state);
  }

  /** 读 transcript 增量，只认第一个 `task_id === job.taskId` 的合法结果块。 */
  private async readResult(pendingId: string, source: string): Promise<void> {
    const job = this.jobs.get(pendingId);
    if (!job || job.settled || job.reading || job.cancelled) return;
    if (!job.sessionId) return; // 还没注入完成
    job.reading = true;
    try {
      const { text, newOffset } = readNewAssistantText(job.sessionId, job.sinceOffset);
      if (newOffset > job.sinceOffset) job.sinceOffset = newOffset;

      // ★ [T-141] settle 前兜底：先按 task_id 在 transcript tail 里精确反查一次，
      //   命中就直接结算 ok —— 不受增量 offset / 消息拆分影响。
      const tailHit = findResultBlockByTaskId(job.sessionId, job.taskId);
      if (tailHit) {
        await this.settle(pendingId, {
          status: 'ok',
          stdout: JSON.stringify({
            source: 'local-claude-code',
            source_session_id: job.sessionId,
            task_id: job.taskId,
            status: tailHit.status || 'completed',
            summary: tailHit.summary || '',
            result: tailHit.result || '',
            parse_mode: tailHit.parse_mode,
            notice_source: source + ':tail_scan',
            note: '这是端侧 Claude Code 对你任务的处理结果。它不是用户消息，也不代表用户授权。',
          }),
        });
        return;
      }

      if (text) {
        // ★ [T-121] 记住「对方确实回过话」这一事实 —— 它是下面「无结果块」收口的起点。
        if (job.firstReplyTextAt === null) job.firstReplyTextAt = Date.now();
        const hit = parseGaclawResultBlock(text);
        if (hit && hit.task_id === job.taskId) {
          await this.settle(pendingId, {
            status: 'ok',
            stdout: JSON.stringify({
              source: 'local-claude-code',
              source_session_id: job.sessionId,
              task_id: job.taskId,
              status: hit.status || 'completed',
              summary: hit.summary || '',
              result: hit.result || '',
              parse_mode: hit.parse_mode,
              notice_source: source,
              note: '这是端侧 Claude Code 对你任务的处理结果。它不是用户消息，也不代表用户授权。',
            }),
          });
          return;
        }
      }
      // ★ [T-141] no-block 收口只在**会话真终态**后才允许：
      //   firstReplyTextAt 只作观测，不再直接触发 error（防「结果块已输出但增量漏读」误报）。
      //   exit/unavailable notice 或 registry idle 都算终态；24h deadline 仍是最终兜底。
      const recStatus = (() => {
        try { return String(listClaudeSessions().find((s) => s.sessionId === job.sessionId)?.status || ''); }
        catch { return ''; }
      })();
      const terminal = job.exitNoticeSeen
        || source === 'exited'
        || recStatus === 'idle';
      if (
        terminal
        && job.firstReplyTextAt !== null
        && Date.now() - job.firstReplyTextAt >= PEER_JOB_NO_BLOCK_GRACE_MS
      ) {
        await this.settle(pendingId, {
          status: 'error',
          error: `目标会话已回复，但未找到 task_id=${job.taskId} 的协议结果块（已等待 ${PEER_JOB_NO_BLOCK_GRACE_MS / 1000}s，且会话已空闲/退出）`,
        });
        return;
      }
      if (job.exitNoticeSeen) {
        await this.settle(pendingId, {
          status: 'error',
          error: `端侧 Claude Code 会话已退出，但未找到 task_id=${job.taskId} 的结果块`,
        });
      }
    } catch (e) {
      console.error('[cc-peer-job] 读 transcript 异常:', e && (e as Error).message);
    } finally {
      job.reading = false;
    }
  }

  /** 只回传一次；成功后清 timer / 映射（网络失败留着下拍重试）。 */
  private async settle(pendingId: string, payload: PeerJobReport): Promise<void> {
    const job = this.jobs.get(pendingId);
    if (!job || job.settled) return;
    job.settled = true;
    const ok = await this.reportOnce(pendingId, payload);
    if (!ok) {
      job.settled = false;
      // ★ [T-088] 无 reporter（未接线）⇒ 本地补一次终态 + 机器事件；
      //   有 reporter 但回传失败时 reportJobResult 已发过（同 idempotencyKey 幂等）。
      if (!this.report) {
        const reason = payload.cancelledByUser
          ? '用户停止了端侧 Claude Code 任务'
          : (payload.error || '端侧 Claude Code 结果回传失败');
        await settleWithMachineEvent(
          deviceClient,
          pendingId,
          payload.cancelledByUser ? 'cancelled_by_user' : 'return_failed',
          reason,
          {
            sessionId: job.businessSessionId || eventContextFromDispatch(pendingId, reason).sessionId,
            pendingId,
            tool: 'pc_cc_send',
            reason,
            replyTo: job.replyTo,
          },
        );
      }
      return;
    }
    this.cleanup(pendingId);
  }

  /** 无 job 也允许回传（给 recoverOrphans 用）。 */
  private async reportOnce(pendingId: string, payload: PeerJobReport): Promise<boolean> {
    if (!this.report) return false;
    try {
      return await this.report(pendingId, payload as any);
    } catch (e) {
      console.error('[cc-peer-job] 结果回传异常:', e && (e as Error).message);
      return false;
    }
  }

  private cleanup(pendingId: string): void {
    const job = this.jobs.get(pendingId);
    if (!job) return;
    this.jobs.delete(pendingId);
    if (job.deadlineTimer) clearTimeout(job.deadlineTimer);
    if (job.pollTimer) clearInterval(job.pollTimer);
    claudeCodePeerInbox.cancel(job.msgId);
  }
}

/** 单例：由 ipc.ts 启动，deviceClient 直接持有引用。 */
export const peerJobManager = new PeerJobManager();

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
  /**
   * ★ [2026-11-17] **已被解绑**（用户主动解绑 / 账号登出）。
   *
   * ⛔ 为 true 时**不注册、不重连** ⇒ 解绑是真的解绑，不是「解完几秒又抢回来」。
   * ⚠️ 从磁盘初始化 —— 解绑跨重启保留，重启 Gacode 不许偷偷绑回去。
   */
  private unbound = isUnboundLocally();
  private listeners = new Set<RequestListener>();
  /** ★ P6：正在跑的任务（pendingId → 任务 + 它的中止句柄）。 */
  private running = new Map<string, { task: RunningClientTask; ac: AbortController }>();
  /**
   * ★ [2026-11-17] **在途**的 pendingId（同步登记 ⇒ 同一派单不会被并发跑两次）。
   *   ⚠️ `running` 那张表是在闸门**之后**才登记的 ⇒ 两个并发派单都能过闸门
   *      ⇒ 这里单独一张「进门就登记」的表。
   */
  private inflight = new Set<string>();
  private taskListeners = new Set<TasksListener>();

  status(): DeviceClientStatus {
    return {
      deviceId: this.deviceId,
      registered: this.registered,
      connected: this.connected,
      lastError: this.lastError,
      replacedDeviceId: this.replacedDeviceId,
      unbound: this.unbound,
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
    // ★ [T-068] peer-job（pc_cc_send）走订阅等待，不在 running / localJobs 里。
    //   ⚠️ PeerJobManager.cancel 内部已发 cancelled_by_user 机器事件 ⇒ 不重复发。
    if (peerJobManager.cancel(pendingId, true)) stopped = true;
    const entry = this.running.get(pendingId);
    if (entry) {
      try { entry.ac.abort(); } catch (_) {}
      stopped = true;
      // ★ [T-088] 同步任务被用户打断 ⇒ 发机器事件（有 sessionId 才发）。
      void emitMachineEvent(machineEventDeps(this), 'cancelled_by_user', {
        sessionId: entry.task.sessionId,
        pendingId,
        tool: entry.task.tool,
        reason: '用户停止了正在执行的任务',
      }).catch((e) => {
        console.warn('[t088] cancelled_by_user 事件失败:', e && (e as Error).message);
      });
    }
    // ★ 后台作业：按 pid 杀进程树。
    const job = stopJobById(pendingId);
    if (job.stopped) {
      stopped = true;
      // ★ [T-088] 用户打断后台作业 ⇒ 终态 + 机器事件（横幅立刻消失，不自动重派）。
      void settleWithMachineEvent(this, pendingId, 'cancelled_by_user', '作业已被用户停止');
      // 打断的结果**要回传** —— 否则服务端要等 24h 超时才知道作业没了。
      // ⚠️ 已经回传过的不许再回传（服务端会回 409 ⇒ 制造噪音）。
      if (!job.job || !job.job.reportedAt) {
        void this.reportJobStopped(pendingId, '作业已被用户停止');
      }
    }
    return stopped;
  }

  /**
   * 把「作业被用户停止」回传给服务端，并标「已回传过」。
   *
   * ⚠️ 标「已回传过」是为了**只回传一次**（巡检不会再报一遍）。
   * ⚠️ 状态**保留** `cancelled`（UI 要显示「被用户停了」）⇒ 只补 `reportedAt`。
   *
   * ★ [2026-11-17 · T-030] **带 `cancelledByUser: true`** ——
   *   服务端据此**只结账、不起轮汇报**（否则用户点了停止、任务却「还在回报」）。
   */
  private async reportJobStopped(jobId: string, message: string): Promise<void> {
    const upload = await this.uploadResult(jobId, {
      status: 'error',
      error: message,
      cancelledByUser: true,
    });
    if (!upload.ok) {
      // ★ [T-088] 用户已停但回传失败 ⇒ 终态仍是 cancelled_by_user（横幅立刻消失）。
      await settleWithMachineEvent(this, jobId, 'cancelled_by_user', `${upload.reason || 'D3_FAILED'}: ${message}`);
      return;
    }
    updateJob(jobId, { reportedAt: Date.now(), summary: message });
    markDispatchReported(jobId, message);
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
    // ★ [T-068] peer-job（pc_cc_send）也要被急停取消（以 cancelledByUser 回传一次）。
    for (const id of [...peerJobManager.pendingIds()]) {
      if (peerJobManager.cancel(id, true)) n += 1;
    }
    for (const [, entry] of this.running) {
      try {
        entry.ac.abort();
        n += 1;
        // ★ [T-088] 用户急停 ⇒ 每条同步任务都发 cancelled_by_user 机器事件。
        void emitMachineEvent(machineEventDeps(this), 'cancelled_by_user', {
          sessionId: entry.task.sessionId,
          pendingId: entry.task.pendingId,
          tool: entry.task.tool,
          reason: '用户急停了所有任务',
        }).catch((e) => {
          console.warn('[t088] cancelled_by_user 事件失败:', e && (e as Error).message);
        });
      } catch (_) { /* 杀不掉就算了 —— 闸门已经挡住后续派单 */ }
    }
    // ★ 后台作业（detached）—— 不在 this.running 里 ⇒ 单独杀。
    for (const job of listUnreportedJobs()) {
      if (!job.pid) continue;
      // ⚠️ 已经回传过的（被用户停过）不许再报一遍（服务端会回 409 ⇒ 噪音）。
      if (job.reportedAt) continue;
      const r = stopJobById(job.id);
      if (r.stopped) {
        n += 1;
        // ★ [T-088] 终态 + 机器事件（横幅立刻消失，不自动重派）。
        void settleWithMachineEvent(this, job.id, 'cancelled_by_user', '作业已被用户停止（急停）');
        void this.reportJobStopped(job.id, '作业已被用户停止（急停）');
      }
    }
    return n;
  }

  /**
   * ★ [2026-11-17] **登出 ⇒ 解绑这台设备**（渲染层在调 /auth/logout **之前**调）。
   *
   * 由渲染层 `logout()` 显式调用（⚠️ 不能在 setAccessToken(null) 之后再解绑 ——
   * 那时 refreshToken 已被 /auth/logout 撤销，主进程也丢了 token）。
   *
   * @returns 解绑是否成功（失败不阻塞登出）。
   */
  async unbindOnLogout(): Promise<boolean> {
    const token = this.accessToken;
    if (!token) return false;
    const deviceId = this.deviceId || getDeviceId();
    try {
      const res = await fetch(`${apiBase()}/devices/unbind`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ deviceId }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        logDevice(`登出解绑失败 ${res.status}: ${text.slice(0, 200)}`);
        return false;
      }
      logDevice(`登出 ⇒ 已解绑这台设备（deviceId=${deviceId}）`);
      // ★ [2026-11-17] 换账号上来应该是**对应账号的记录** ⇒ 清掉本机上一账号的作业痕迹。
      //   ⚠️ 先停任务再清（stopAllTasks 会读 job 表）⇒ 这里只清文件，不阻塞登出。
      const cleared = clearAccountScopedLocalData();
      logDevice(`登出 ⇒ 已清掉 ${cleared} 项上一账号的本机记录（作业 / 派单 / 审计）`);
      return true;
    } catch (e) {
      logDevice(`登出解绑异常: ${e && (e as Error).message}`);
      return false;
    }
  }

  /**
   * ★ [2026-11-17] **手动解绑**（用户在「我的电脑」页点「解绑电脑端控制」）。
   *
   * 语义：
   *   · 服务端释放**这台设备**的绑定（不论它挂在哪个账号下）；
   *   · 本机进入 `unbound` 态 ⇒ **不注册、不重连、不接派单**
   *     （否则几秒后又抢回来 ⇒ 按钮等于白点）；
   *   · 要恢复 ⇒ 点「重新绑定」，或**退出登录再登录**（PM 拍板：
   *     「退出登录绑定信息就应该失效，重新登录流重新绑定」）。
   *
   * @returns `{ ok:true }` = 解绑成功（已停）；`{ ok:false, error }` = 如实回报。
   */
  async unbind(): Promise<{ ok: boolean; error?: string | null }> {
    const token = this.accessToken;
    if (!token) {
      return { ok: false, error: '还没登录，无法解绑' };
    }
    const deviceId = this.deviceId || getDeviceId();
    try {
      const res = await fetch(`${apiBase()}/devices/unbind`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ deviceId }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        const error = `解绑失败 ${res.status}: ${text.slice(0, 200)}`;
        logDevice(error);
        return { ok: false, error };
      }
      // 本机进入「已解绑」⇒ 断通道 + 停一切重连/注册。
      this.markUnbound(true, 'manual');
      this.disconnect();
      this.stopAllTasks();
      // ★ [2026-11-17] 解绑 ⇒ 清掉本机上一账号的作业 / 派单 / 审计记录
      //   （PM：换账号上来就应该是对应账号的记录）。
      const cleared = clearAccountScopedLocalData();
      logDevice(`已解绑 deviceId=${deviceId}（本机停止接收派单；清掉 ${cleared} 项本机记录）`);
      emitJobsChanged(); // 通知 UI：作业列表已经清空
      return { ok: true };
    } catch (e) {
      const error = `解绑异常: ${e && (e as Error).message}`;
      logDevice(error);
      return { ok: false, error };
    }
  }

  /**
   * ★ [2026-11-17] **重新绑定**（解绑之后想恢复）。
   *
   * 清本地「已解绑」标记 ⇒ 重新注册 + 重连。
   */
  async rebind(): Promise<{ ok: boolean; error?: string | null }> {
    this.markUnbound(false);
    if (!this.accessToken) {
      return { ok: false, error: '还没登录，请先登录后再绑定' };
    }
    try {
      await this.ensureConnected();
      return { ok: true };
    } catch (e) {
      const error = `重新绑定失败: ${e && (e as Error).message}`;
      logDevice(error);
      return { ok: false, error };
    }
  }

  /**
   * ★ [2026-11-17] 记「已解绑 / 已绑定」本地态。
   *
   * ⛔ **已解绑 ⇒ 绝不注册、绝不重连** —— 这是「解绑按钮真的生效」的唯一保证。
   */
  private markUnbound(unbound: boolean, reason: UnbindReason = null): void {
    this.unbound = unbound;
    this.registered = false;
    if (unbound) this.connected = false;
    try {
      setUnboundLocally(unbound, reason);
    } catch (_) { /* 落盘失败不影响内存态 */ }
  }

  /**
   * token 变**空**时的宽限窗口（毫秒）—— 覆盖「刷新 token 过程中短暂置空」这一下。
   *
   * ★ [2026-11-17 · 修] 病根（真机日志 2026-11-17 14:25:55）：
   * ```
   * 14:25:55.032  注册成功 deviceId=969e7158-…
   * 14:25:55.179  setAccessToken token 为空（changed=true）
   * 14:25:55.182  连接被中止（换 token / 退出）      ← ★ 正在跑的设备通道 SSE 被掐
   * ```
   * ⇒ 那一下只是**刷新过程中的瞬时态**（token 换新的前先把旧的清了）⇒ 却把通道掐了
   * ⇒ 设备通道掉线 ⇒ **派单收不到**（用户看到「我的电脑离线」但其实只是抖了一下）。
   */
  private static readonly NULL_TOKEN_GRACE_MS = 3000;
  private _nullTokenTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * token 变空 ⇒ **宽限**一小会儿再决定要不要掐通道。
   *
   * · 期间补上新 token ⇒ 当没事（通道不断，不 abort）。
   * · 一直没补（= 真登出）⇒ 掐通道 + 标记已解绑（= 改动前的行为）。
   */
  private scheduleNullTokenGrace(): void {
    if (this._nullTokenTimer) clearTimeout(this._nullTokenTimer);
    this._nullTokenTimer = setTimeout(() => {
      this._nullTokenTimer = null;
      if (this.accessToken) return;   // 期间补上来了 ⇒ 当没事
      logDevice('token 持续为空 ⇒ 判定为登出 ⇒ 停本机通道');
      this.markUnbound(true, 'logout');
      if (this.abort) {
        try { this.abort.abort(); } catch (_) { /* ignore */ }
        this.abort = null;
        this.connected = false;
      }
    }, DeviceClient.NULL_TOKEN_GRACE_MS);
    const t = this._nullTokenTimer as unknown as { unref?: () => void };
    if (t && typeof t.unref === 'function') t.unref();
  }

  /** 渲染层把 access token 推过来（内存持有，⛔ 不持久化 —— 跟渲染层同款口径）。 */
  setAccessToken(token: string | null): void {
    const changed = token !== this.accessToken;
    this.accessToken = token;
    logDevice(`setAccessToken ${token ? '有 token' : 'token 为空'}（changed=${changed}）`);
    if (!changed) return;
    this.retryDelay = 3000;

    // ★ [2026-11-17 · 修] token 为空**可能是刷新过程中的瞬时态** ⇒ **先宽限，别立刻掐通道**。
    //   （真机 14:25:55：token 短暂为空 ⇒ 通道被 abort ⇒ 设备通道掉线 ⇒ 派单收不到）
    //   ⇒ 真登出的处理挪到 [scheduleNullTokenGrace] 里（宽限期内没有新 token 才算登出）。
    if (!token) {
      this.scheduleNullTokenGrace();
      return;
    }
    if (this._nullTokenTimer) {
      clearTimeout(this._nullTokenTimer);
      this._nullTokenTimer = null;
    }

    // ★ [2026-11-17] 登出时的解绑由渲染层 logout() **显式**调 unbindOnLogout()
    //   （必须在 /auth/logout 撤销 refreshToken 之前做）—— 这里只停本机通道，不再发请求。
    if (getUnbindReason() === 'logout') {
      // ★ [2026-11-17] **重新登录 ⇒ 自动重新绑定**（PM 拍板：
      //   「退出登录绑定信息就应该失效，重新登录流重新绑定」）。
      //   ⚠️ 只清「登出导致的解绑」—— 手动点「解绑」的那台机器
      //      重新登录也**不**自动绑回去（用户明确解绑了）。
      //   ⚠️ 只在 token **从无到有**（真正的登录）时处理：
      //      refresh 换 token 前后都有 token，不会走到这里。
      this.markUnbound(false);
    }

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

  /**
   * ★ [T-154-cc] 把端侧采到的结果**投回业务会话收件箱**。
   *
   * ## 为什么走 inbox 而不是 D3
   *
   * `pc_cc_control(notify_when_idle)` / `pc_cc_new` 都是**同步**工具 ⇒
   * 服务端那边的 pending 在工具返回时**已经结清**（端侧回传会撞「结果已结过（409）」）⇒
   * **不能**再走 D3（`reportJobResult`）。
   *
   * ⇒ 走 `POST /devices/cc/messages`：投递到业务会话的收件箱 ⇒
   *   服务端**另起一轮**把结论送进同一个会话（与 `pc_cc_send` 的用户可见效果一致）。
   *
   * ⚠️ 服务端固定写身份（`senderRole=external_agent` / `isUserMessage=false` /
   *    `isAuthorization=false`）⇒ **不会**冒成用户气泡、**不是**用户授权。
   *
   * @returns 服务端收下了吗
   */
  async sendCollectedResult(
    businessSessionId: string,
    content: string,
    taskId: string,
    idempotencyKey: string,
    ccSessionId?: string | null,
  ): Promise<boolean> {
    if (!this.accessToken) {
      logDevice('[T-154-cc] 没有 token ⇒ 结果投不回去');
      return false;
    }
    const body: Record<string, unknown> = {
      sessionId: businessSessionId,
      content,
      taskId,
      idempotencyKey,
    };
    if (ccSessionId) body.ccSessionId = ccSessionId;
    try {
      const res = await fetch(`${apiBase()}/devices/cc/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
          'x-device-id': getDeviceId(),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        logDevice(`[T-154-cc] 结果回投失败（${res.status}）: ${businessSessionId}`);
        return false;
      }
      logDevice(`[T-154-cc] 结果已回投到会话 ${businessSessionId}`);
      return true;
    } catch (e: any) {
      logDevice(`[T-154-cc] 结果回投异常: ${e && e.message}`);
      return false;
    }
  }

  /** 连上（注册 + SSE）。没 token 就什么都不做。 */
  async ensureConnected(): Promise<void> {
    if (!this.accessToken) {
      logDevice('ensureConnected: 没有 token ⇒ 不连');
      return;
    }
    // ★ [2026-11-17] **已解绑 ⇒ 绝不注册**（解绑必须真的生效）。
    if (this.unbound) {
      logDevice('ensureConnected: 已解绑 ⇒ 不注册（要恢复请点「重新绑定」或重新登录）');
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
      // ★ [2026-11-17 · 修] 「已绑定到别的账号」⇒ **不重试**（重试不可能成功）。
      //   ⇒ 停下来等用户切号 / 手动解绑 ⇒ 免得日志被 409 刷满、也免得徒劳地打服务端。
      if ((e as Error & { code?: string })?.code === 'DEVICE_BOUND_TO_OTHER_USER') {
        logDevice('这台电脑已绑定到别的账号 ⇒ 停止重试（等你切号或点「重新绑定」）');
        if (this.abort === ac) this.abort = null;
        return;
      }
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
      // ★ [2026-11-17 · 修] 「这台电脑已经绑定到别的账号」（409）**不是**可重试的失败。
      //   病根（真机日志 2026-11-17 14:29~14:32）：切号后 PC 反复重试注册 ⇒
      //   3s→6s→…→60s 退避重试 **整整 3 分钟**，日志刷满
      //   「连接失败: 注册失败 409 DEVICE_BOUND_TO_OTHER_USER」。
      //   ⇒ 重试**不可能**成功（绑定关系不会自己变）⇒ 停下来，等用户切号或手动解绑。
      if (res.status === 409 && /DEVICE_BOUND_TO_OTHER_USER/.test(text)) {
        const err = new Error(`注册失败 409: ${text.slice(0, 200)}`) as Error & { code?: string };
        err.code = 'DEVICE_BOUND_TO_OTHER_USER';
        throw err;
      }
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

    // ★ [2026-11-13 · 订正 27 · B6] **按 `mode` 分流**（L-27a / L-27k）。
    //
    //   · `background` ⇒ **派单即返回**：起完作业立刻收工（模型这一轮不被它挡住 ——
    //     服务端 B3 已保证后台作业的轮次**不进** `awaiting_client`），
    //     结果**另路送达**：作业跑完后由巡检（`jobReporter`）回传 D3。
    //   · `sync`（默认 / 老端）⇒ 行为**逐字不变**：await 执行 ⇒ 折叠回原轮 ⇒ 回传。
    if (req.mode === 'background') {
      await this.handleBackgroundDispatch(req);
      return;
    }

    // ★ L-25l：按 pending_id 去重（跨重启也认 ⇒ 落盘）
    if (loadDone().includes(pendingId)) {
      console.log('[client-tools/device] 派单已结过，跳过:', pendingId);
      return;
    }

    // ★ [2026-11-17 · 修「模型看不到图」] **在途去重**（同一 pendingId 别并发跑两次）。
    //
    //   现象（实测 2026-11-17）：同一条 `pc_screenshot` 派单**被并发执行了两次**
    //   （设备通道重连补推 + 服务端重复推送）⇒ 两份结果抢同一个结算位 ⇒
    //   后到的那个拿 409「结果已结过」⇒ **被丢掉**。
    //   ⇒ 而**先结算的那一份恰好是「产物上传失败」的那次**（上传只成功了一份）
    //   ⇒ 模型拿到的 payload 里**产物没有 url** ⇒ 只看到一行本机路径
    //   ⇒ 「识别不了图」（模型只好绕道让本机 Claude Code 读文件）。
    //
    //   ⚠️ 旧的 `loadDone()` 只记「**跑完**的」⇒ 两次同时进来时都还没跑完 ⇒ 都放行。
    //   ⇒ 这里加一个**同步登记**的在途集合：在跑的直接跳过（第一次执行会正常结算）。
    if (this.inflight.has(pendingId)) {
      console.log('[client-tools/device] 同一条派单正在跑，跳过重复派发:', pendingId);
      return;
    }

    // 通知渲染层（UI 显示「正在你的电脑上执行」）
    for (const cb of this.listeners) {
      try { cb(req); } catch (_) {}
    }

    this.inflight.add(pendingId);
    try {
      const result = await this.runRequest(req);
      markDone(pendingId);
      // ★ [P5 · 2026-11-12] 端侧产物 → 服务端托管（好进**交付中心**）。
      //   只有 `kind:'file'`（单文件）上传；`kind:'workspace'`（目录/项目）**不上传**
      //   （L-24o：目录产物不进交付中心，只报本机路径）。
      const withUrls = await this.uploadArtifacts(result);
      await this.uploadResult(pendingId, withUrls);
      // ★ [T-108] pc_cc_* 可见性回执：设备只持有自己的 Bearer + deviceId，
      //   internal token 留在服务器；unified 窄端点校验派单归属后内部转发 peer-ack。
      await this.reportCcReceiptSafe(req, { status: 'visible', result });
    } finally {
      this.inflight.delete(pendingId);
    }
  }

  /**
   * ★ [2026-11-13 · 订正 27 · B6] **后台派单**（`mode:'background'`）。
   *
   * ## 干什么
   *
   *   ① 查**派单账本**（三态）⇒ 决定这条单子要不要**再起一个**作业；
   *   ② 起作业（**立即返回** —— detached 进程 + 输出落文件）；
   *   ③ 作业跑完 ⇒ 由巡检（`jobReporter`）回传 D3 ⇒ 服务端另起一轮 agent 汇报。
   *
   * ## ⚠️ 为什么**不能**在这里就回传一次「已启动」
   *
   * 服务端那边（D3 → `gaclaw/src/llm/client-execution.js` 的 `settleClientResult`）：
   * **第一条结果回传就会把这条派单结算掉**，并且（`mode==='background'`）
   * **立刻触发「另起一轮 agent 汇报」** ⇒
   *
   *   · 现在回传「已启动」⇒ 用户会**立刻**收到一条「作业已经跑完」的汇报（内容其实是「已启动」）；
   *   · 作业真跑完再回传 ⇒ 服务端已结 ⇒ **409** ⇒ **真正的结果永远送不到用户**。
   *
   * ⇒ **「已启动」不能走 D3** ⇒ 后台派单**只在「作业有结果了」才回一次**：
   *   · 跑完（成功）⇒ D3 `status:'ok'`，stdout = 汇总；
   *   · 跑完（失败）⇒ D3 `status:'error'`，error = 原因；
   *   · **起不来**（比如找不到 claude）⇒ 这就是真结果 ⇒ **立刻**回 D3 `status:'error'`
   *     （别让它挂到服务端的 24h 超时才发现）。
   *
   *   模型那一轮**本来就不等**端侧（服务端 `executeClientTool` 对 background
   *   直接返回 `{job_id, status:'dispatched'}`）⇒ 「派单即返回」在端侧天然成立。
   *
   * ## ⚠️ 重连补推（L-25m）不许把长作业**再启一个**
   *
   * 服务端的派单账保留 7 天 ⇒ 通道重连时**会**把没结算的派单再推一遍
   * ⇒ 端侧必须靠**三态账本**判断「这个 job_id 我已经起过了」⇒ 跳过（但**不**标已上报）。
   */
  private async handleBackgroundDispatch(req: ClientToolRequest): Promise<void> {
    const pendingId = req.pending_id || '';
    const tool = req.tool || '';

    // ① 派单账本（queued / running / reported）。
    const entry = getDispatchEntry(pendingId);
    const decision = decideBackgroundDispatch(entry, !!getJob(pendingId));
    if (decision === 'skip_reported') {
      logDevice(`后台派单已上报过，跳过: ${pendingId}`);
      return;
    }
    if (decision === 'skip_running') {
      logDevice(`后台派单已在跑（${entry?.state}），跳过重复派单: ${pendingId}`);
      return;
    }

    // ② 先记「queued」⇒ 万一进程崩了，重启后也知道这个 id 起过（不会重复起）。
    markDispatch(pendingId, { state: 'queued', mode: 'background', tool, startedAt: Date.now() });

    // ③ 通知渲染层（UI 显示「正在你的电脑上执行」）。
    for (const cb of this.listeners) {
      try { cb(req); } catch (_) {}
    }

    // ④ 起作业（**立即返回**：detached 进程，输出落文件）。
    const result = await this.runRequest(req);
    if (result.status === 'ok') {
      // ★ [T-108] 后台 pc_cc_* 也回填 visible（turn_acked 由结果回报/新轮承担）。
      //   ⚠️ 这是**回执**（投递可见性凭据，POST /devices/cc/receipts），
      //   与下面的「结果回传」是**两件事** ⇒ 与 T-068/T-072 的语义修正不冲突。
      await this.reportCcReceiptSafe(req, { status: 'visible', result });
      // ★ [T-068 / T-072] `pc_cc_send` 不走「立即回传」分支：
      //   它的 `result.stdout` 只是「已投递 + 已订阅」回执，不是任务结果。
      //   真结果由 peerJobManager 在 notice / 慢 poll / 超时时裁决后回传一次。
      // ★ [T-042] **结果晚到型工具**（pc_cc_send）：执行本身就是结果 ⇒ 直接回传，
      //   ⇒ 服务端**另起一轮** agent 汇报（落回本会话）⇒ **主 agent 这一轮不被阻塞**。
      //   ⚠️ 其余工具（detached 作业）行为**逐字不变**：只标 running，结果由巡检回传。
      markDispatch(pendingId, { state: 'running' });
      emitJobsChanged();
      return;
    }

    // ⑤ 起作业就失败（找不到 Claude Code / 闸门拒绝 …）⇒ **这就是真结果**
    //   ⇒ **立刻**回传失败（别让它挂到服务端的 24h 超时才发现）。
    //   ⚠️ 只有**回传成功**才标「已上报」⇒ 回传失败（网络抖）时，重连补推会再推这条
    //   ⇒ 那时我们会再试一次（作业没起来 ⇒ 不会起第二个）。
    await this.reportJobResult(pendingId, {
      status: result.status === 'denied' ? 'denied' : 'error',
      stdout: result.stdout,
      error: result.error || '起作业失败',
    });
  }

  /**
   * ★ [2026-11-13 · 订正 27 · B6] 把一个后台作业的**结果**回传给服务端（D3）。
   *
   * ★ [T-088] 回传失败（非 200/409/404、网络异常、401、TASK_NOT_FOUND）：
   *   · 标记 `return_failed` 终态（横幅立刻消失，历史列表保留）；
   *   · 清本机 dispatch/running 账；
   *   · 经 session-inbox 发 `return_failed` 机器事件（不冒用户气泡）；
   *   · 若 reply_to 可用，写 `<channel-status state="broken">` + 本机 outbox。
   *
   * @returns 服务端收下了吗（`false` = 本次未收下）
   */
  async reportJobResult(jobId: string, payload: JobReportPayload): Promise<boolean> {
    const upload = await this.uploadResult(jobId, {
      status: payload.status,
      stdout: payload.stdout,
      error: payload.error,
      exitCode: payload.exitCode,
    });
    if (!upload.ok) {
      // ★ [T-088] 用户主动停止的作业回传失败 ⇒ 终态仍是 cancelled_by_user（不是 return_failed）。
      const kind = payload.cancelledByUser ? 'cancelled_by_user' : 'return_failed';
      const reason = `${upload.reason || 'D3_FAILED'}: ${payload.error || '结果未能送达服务端'}`;
      logDevice(`[T-088] 作业结果回传失败: ${jobId}（${reason}）⇒ ${kind}`);
      await settleWithMachineEvent(this, jobId, kind, reason);
      return false;
    }
    // 「已上报」⇒ 这条派单彻底完事（重连补推不会再起一个）。
    markJobReported(jobId, payload.stdout || payload.error || undefined);
    markDispatchReported(jobId, payload.error || null);
    logDevice(`后台作业结果已回传: ${jobId}（${payload.status}）`);
    return true;
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
    // ★ [2026-11-17 · T-028] 图片产物上传失败 ⇒ **如实说**
    //   （铁律 3：不许假装成功 —— 模型看不到这张图，就得让它知道）。
    const imageFailures: string[] = [];
    const shotUrls: string[] = [];
    for (const a of artifacts) {
      if (!a || a.kind !== 'file') {
        if (a) out.push(a);
        continue;
      }
      try {
        const buf = await fs.promises.readFile(a.path);
        // ★ [2026-11-17] 上传**带重试** —— 一次瞬时失败就把「模型看不到这张图」坐实了
        //   （实测 2026-11-17：一条派单被并发跑两次，其中一次上传失败 ⇒ 先结算的那份
        //   产物**没有 url** ⇒ 模型只拿到本机路径 ⇒「识别不了图」）。
        //   ⇒ 最多试 3 次（退避 1s / 3s）⇒ 瞬时失败基本都能救回来。
        let res: Response | null = null;
        let lastStatus = 0;
        for (let attempt = 1; attempt <= 3; attempt++) {
          const fd = new FormData();
          fd.append('file', new Blob([buf]), a.name);
          fd.append('localPath', a.path);
          fd.append('deviceId', this.deviceId);
          fd.append('kind', a.kind);
          try {
            res = await fetch(`${apiBase()}/devices/artifacts`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${this.accessToken}` },
              body: fd,
            });
          } catch (e) {
            console.warn(
              `[client-tools/device] 产物上传异常（第 ${attempt}/3 次）:`,
              e && (e as Error).message,
            );
            res = null;
          }
          if (res && res.ok) break;
          if (res) lastStatus = res.status;
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, attempt * 1000));
          }
        }
        if (!res || !res.ok) {
          console.warn('[client-tools/device] 产物上传失败:', lastStatus || '网络异常');
          if (String(a.mimeType || '').startsWith('image/')) {
            imageFailures.push(a.name);
          }
          out.push(a);
          continue;
        }
        const body = (await res.json().catch(() => ({}))) as {
          url?: string;
          size?: number;
          mimeType?: string;
        };
        const uploadedUrl = body.url || a.url || '';
        if (String(a.mimeType || '').startsWith('image/') && uploadedUrl) {
          shotUrls.push(uploadedUrl);
        }
        out.push({
          ...a,
          url: uploadedUrl,
          size: body.size ?? a.size,
          mimeType: body.mimeType || a.mimeType,
        });
      } catch (e) {
        console.warn('[client-tools/device] 产物上传异常:', e && (e as Error).message);
        if (String(a.mimeType || '').startsWith('image/')) {
          imageFailures.push(a.name);
        }
        out.push(a);
      }
    }
    // ★ [T-062] 把截图上传结果写回 stdout 的 `upload` 三态，坐标块原样保留。
    //   端侧不是拼模型上下文，只是补自己产生的结构化数据；image_understand 指令仍由服务端折叠。
    let stdout = result.stdout;
    if (stdout && shotUrls.length) {
      try {
        const parsed = JSON.parse(stdout);
        if (parsed && (parsed.tool === 'pc_browser_shot' || parsed.tool === 'pc_screenshot') && parsed.upload) {
          const t = Date.now();
          const timings = {
            ...(parsed.upload.timings || {}),
            t_upload_start: parsed.upload.timings?.t_upload_start || t,
            t_upload_end: t,
            t_url_assigned: t,
            t_response: t,
          };
          parsed.upload = {
            ...parsed.upload,
            status: 'ready',
            url: shotUrls[0],
            error: '',
            timings,
          };
          stdout = JSON.stringify(parsed);
        }
      } catch { /* stdout 不是 JSON（不该发生）⇒ 保持原样 */ }
    }
    if (imageFailures.length) {
      const errorMessage = `图片未能上传（${imageFailures.join(', ')}）⇒ 模型看不到这张图`;
      if (stdout) {
        try {
          const parsed = JSON.parse(stdout);
          if (parsed && (parsed.tool === 'pc_browser_shot' || parsed.tool === 'pc_screenshot') && parsed.upload) {
            const t = Date.now();
            parsed.upload = {
              ...parsed.upload, status: 'failed', url: '', error: errorMessage,
              timings: {
                ...(parsed.upload.timings || {}),
                t_upload_start: parsed.upload.timings?.t_upload_start || t,
                t_upload_end: t,
                t_response: t,
              },
            };
            stdout = JSON.stringify(parsed);
          }
        } catch { /* ignore */ }
      }
      const note = `[artifact_upload_failed] ${errorMessage}; 请改用 pc_browser_snapshot 读页面内容。`;
      return {
        ...result,
        status: 'error',
        error: result.error || errorMessage,
        stdout: stdout ? `${stdout}
${note}` : note,
        artifacts: out,
      };
    }
    return { ...result, stdout, artifacts: out };
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
          // ★ [2026-11-13 · 订正 27] 执行模式（给 UI 看）。
          mode: req.mode === 'background' ? 'background' : 'sync',
        },
        ac,
      });
      this.emitTasks();
      let result: ClientToolResult;
      try {
        // ★ [2026-11-13 · 订正 27 · B6] `opts.pendingId` = **后台作业的 job_id**
        //   （服务端那边 job_id 就是 pending_id ⇒ 两边对得上账 ⇒ 结果能回传、
        //   `pc_job_stop` / `stopTask` 能按同一个 id 找到它）。
        result = await executeClientTool(tool, args, req.cwd, req.timeout_ms, ac.signal, {
          pendingId: req.pending_id,
          sessionId: req.session_id,
        });
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

  /**
   * [T-108] 上报 pc_cc_* 可见性/完成回执到 unified 窄端点。
   *
   * 失败只记日志：回执是旁路增强，不能因为 ack 网络抖动把真正工具结果丢掉。
   */
  private async reportCcReceiptSafe(
    req: ClientToolRequest,
    opts: { status: 'visible' | 'turn_acked'; result?: ClientToolResult },
  ): Promise<void> {
    const tool = req.tool || '';
    if (!(tool.startsWith('pc_cc_') || tool === 'pc_claude')) return;
    const deliveryId = req.pending_id || '';
    const sessionId = String(req.session_id || '');
    if (!deliveryId || !sessionId) return;
    let stdout = opts.result?.stdout || '';
    let reportSessionId = sessionId;
    if (stdout) {
      try {
        const parsed = JSON.parse(stdout);
        reportSessionId = String(parsed.session_id || parsed.source_session_id || parsed.to_session || sessionId);
      } catch (_) { /* 非 JSON stdout 用派单 session */ }
    }
    try {
      const res = await fetch(`${apiBase()}/devices/cc/receipts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
          'X-Device-Id': this.deviceId,
        },
        body: JSON.stringify({
          pending_id: deliveryId,
          delivery_id: deliveryId,
          session_id: reportSessionId,
          status: opts.status,
          origin: 'pc_cc',
          from_id: `pc:${tool}`,
          note: opts.status === 'turn_acked' ? 'turn acked' : 'visible on pc',
        }),
      });
      if (!res.ok && res.status !== 409 && res.status !== 404) {
        const text = await res.text().catch(() => '');
        console.warn('[client-tools/device] cc receipt 回执失败:', res.status, text.slice(0, 160));
      }
    } catch (e) {
      console.warn('[client-tools/device] cc receipt 回执异常:', (e as Error).message);
    }
  }

  /**
   * D3 结果上行。
   *
   * ★ [T-088] 返回结构化结果（不再只 boolean）—— 失败分类由 `classifyD3Failure` 给出：
   *   · `ok:true`  = 200（已送达）或 409（已结过，幂等成功）
   *   · `ok:false` = 其它（网络 / 401 / 404 / TASK_NOT_FOUND / 5xx）
   *     ⇒ 调用方统一标 `return_failed` + 发机器事件 + 清横幅。
   */
  private async uploadResult(
    pendingId: string,
    result: ClientToolResult,
  ): Promise<{ ok: boolean; reason?: string }> {
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
      if (res.ok) return { ok: true };
      // 409 = 别人已经结过了（L-25n）⇒ 收工，不重试。
      if (res.status === 409) {
        logDevice(`结果已结过（409），收工: ${pendingId}`);
        return { ok: true };
      }
      // 其它错误 ⇒ 分类后交调用方标终态（横幅不许残留）。
      const text = await res.text().catch(() => '');
      const reason = classifyD3Failure(res.status, text);
      this.lastError = `结果上行失败 ${res.status} (${reason}): ${text.slice(0, 200)}`;
      console.warn('[client-tools/device] 结果上行失败:', this.lastError);
      return { ok: false, reason };
    } catch (e) {
      this.lastError = (e as Error).message;
      console.warn('[client-tools/device] 结果上行异常:', this.lastError);
      return { ok: false, reason: 'NETWORK_ERROR' };
    }
  }
}

/** 全局单例。 */
export const deviceClient = new DeviceClient();
