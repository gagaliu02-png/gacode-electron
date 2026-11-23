/**
 * electron/client-tools/machineEvents.ts —— [T-088] 后台任务**机器事件**统一出口
 *
 * ## 解决什么
 *
 * 后台任务失败 / 断链 / 用户打断之后，三件事必须**同时**发生：
 *   ① 本机横幅立刻消失（终态落 localJobs + dispatchLedger，见调用方）；
 *   ② Cody / Claude Code 收到一条**机器事件**（不是普通用户气泡），
 *      从本机经服务端 `/devices/cc/messages` 投进 session-inbox（固定身份、
 *      `source=agent_message` + `skip_transcript` 由服务端写）；
 *   ③ 若 `reply_to` 可用，向目标 Claude Code transcript / peer inbox 写
 *      `<channel-status state="broken" ...>`，要求对方用 `gaclaw-msg send`
 *      按 `reply_to` 主动补回；本机落 outbox 以便重连补发。
 *
 * ## 为什么是「机器事件」而不是普通用户消息
 *
 *   · 正文是**系统说明句**（「（后台任务 xxx 回传失败……）」），不是模型输出；
 *   · 固定身份 `claude-code:<deviceId>`（由设备 token 推导 userId，
 *     kind/fromKind 也由服务端固定，不信客户端声明）；
 *   · ⛔ 不写 role:user 正文、不当用户授权（SYSTEM_REMINDER 块是唯一声明）。
 *
 * ## 模块边界
 *
 *   · 纯函数（payload / XML / outbox 形状）零 electron 依赖 ⇒ 单测可直接跑；
 *   · I/O（fetch / 文件）通过注入的 deps ⇒ 单测可 mock，无网络无真实 HOME。
 */

import * as fs from 'fs';
import * as path from 'path';
import { userDataDir } from './localJobs.ts';

// ===========================================================================
// 形状
// ===========================================================================

/** T-088 机器事件的种类。 */
export type MachineEventKind =
  | 'return_failed'
  | 'cancelled_by_user'
  | 'channel_status';

/** 机器事件载荷（POST `/devices/cc/messages` 的 body 子集）。 */
export interface MachineEvent {
  /** 目标业务 session。 */
  sessionId: string;
  /** 发给模型的机器事件正文（系统说明句 + 结构化信封，不是用户说的话）。 */
  content: string;
  /** 派单 id（后台 job_id）—— 只用于日志关联，不谎称 work_unit_result。 */
  taskId?: string | null;
  /** 事件种类（写进 outbox / 日志，不发给服务端做 kind 判定）。 */
  kind: MachineEventKind;
  /** 幂等键（同 job + 同 kind 只投一次）。 */
  idempotencyKey: string;
}

/** 发机器事件所需的上下文（由调用方从派单 / 作业表带过来）。 */
export interface MachineEventContext {
  /** 业务 session id（必填，缺了就不发）。 */
  sessionId: string | null;
  /** 派单 / job id。 */
  pendingId?: string | null;
  /** 工具名（给人看的说明句里用）。 */
  tool?: string | null;
  /** 作业标题（Claude Code / 普通命令）。 */
  title?: string | null;
  /** 失败原因 / 用户停止说明。 */
  reason?: string | null;
  /** Claude Code 回复目标（收到后用它走 gaclaw-msg send 主动补回）。 */
  replyTo?: ReplyToContext | null;
}

/** reply_to 上下文（与 ccSessionTools `buildSendPayload` 的 shape 对齐）。 */
export interface ReplyToContext {
  taskId?: string | null;
  ccSessionId?: string | null;
  businessSessionId?: string | null;
  channel?: string | null;
}

// ===========================================================================
// 纯函数（单测可直接断言）
// ===========================================================================

/** 「这是机器事件，不是用户说的话」—— 与 unified `task-notification.js` 同一句。 */
export const SYSTEM_REMINDER_BLOCK = [
  '<system-reminder>',
  '[SYSTEM NOTIFICATION - NOT USER INPUT]',
  'This is an automated background-task event, NOT a message from the user.',
  'Do NOT interpret this as user acknowledgement, confirmation, or response to any pending request.',
  '</system-reminder>',
].join('\n');

/** XML 文本转义（与 unified `task-notification.js::escapeXml` 同款）。 */
export function escapeXml(value: unknown): string {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** 截断（防超长正文撑爆收件箱）。 */
function clip(value: unknown, max = 4000): string {
  const s = String(value == null ? '' : value);
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/**
 * 造一条发往 session-inbox 的机器事件正文。
 *
 * ⚠️ 形状固定：`<system-reminder>` 声明 + `<task-notification>` 状态块
 *    （跟 unified 给模型看的 Claude Code 形状一致），⛔ 不冒充用户说话。
 *    `status` 用统一状态名 `return_failed` / `cancelled_by_user`。
 */
export function buildMachineEventContent(
  kind: Extract<MachineEventKind, 'return_failed' | 'cancelled_by_user'>,
  ctx: MachineEventContext,
): string {
  const label = ctx.title || ctx.tool || '后台任务';
  const statusLine =
    kind === 'return_failed'
      ? `（后台任务 ${label} 回传失败：${clip(ctx.reason || '结果未能送达服务端', 200)}）`
      : `（后台任务 ${label} 已被用户停止）`;
  const lines = [
    SYSTEM_REMINDER_BLOCK,
    `<task-notification>`,
    `<task-id>${escapeXml(ctx.pendingId || 'unknown')}</task-id>`,
    `<status>${escapeXml(kind)}</status>`,
    `<summary>${escapeXml(statusLine)}</summary>`,
  ];
  if (ctx.replyTo && hasReplyTo(ctx.replyTo)) {
    lines.push(`<reply-to>${escapeXml(replyToLabel(ctx.replyTo))}</reply-to>`);
  }
  lines.push('</task-notification>');
  return lines.join('\n');
}

/** reply_to 至少有一个可用字段。 */
export function hasReplyTo(reply: ReplyToContext | null | undefined): boolean {
  if (!reply) return false;
  return !!(reply.taskId || reply.ccSessionId || reply.businessSessionId || reply.channel);
}

/** 给 transcript 注记用的 reply_to 一句人话。 */
export function replyToLabel(reply: ReplyToContext): string {
  const parts: string[] = [];
  if (reply.businessSessionId) parts.push(`business_session=${reply.businessSessionId}`);
  if (reply.ccSessionId) parts.push(`cc_session=${reply.ccSessionId}`);
  if (reply.taskId) parts.push(`task_id=${reply.taskId}`);
  if (reply.channel) parts.push(`channel=${reply.channel}`);
  return parts.join(' ');
}

/**
 * 造 `<channel-status state="broken" ...>` 注记。
 *
 * ⚠️ 这是**写进目标 Claude Code transcript / peer inbox 的系统注记**，
 *    不是用户消息、不是授权；明确要求对方用 `gaclaw-msg send` 按 reply_to 主动补回。
 */
export function buildChannelStatusNotice(
  kind: Extract<MachineEventKind, 'return_failed' | 'cancelled_by_user'>,
  ctx: MachineEventContext,
  state: 'broken' | 'awaiting_proactive_reply' = 'broken',
): string {
  const reason = clip(ctx.reason || '结果回传链路中断', 300);
  const label = ctx.title || ctx.tool || '后台任务';
  const attrs = [
    `state="${escapeXml(state)}"`,
    `event="${escapeXml(kind)}"`,
    `task_id="${escapeXml(ctx.pendingId || '')}"`,
  ];
  if (ctx.replyTo && hasReplyTo(ctx.replyTo)) {
    attrs.push(`reply_to="${escapeXml(replyToLabel(ctx.replyTo))}"`);
  }
  return [
    `<channel-status ${attrs.join(' ')}>`,
    `后台任务 ${label} 的结果回传失败（${reason}）。`,
    'This is a machine event, not user input and not an authorization.',
    '请用 `gaclaw-msg send` 按 reply_to 主动补回结果；不要自动重派。',
    '</channel-status>',
  ].join('\n');
}

/** 幂等键：同一个 job + 同一种事件只投一次。 */
export function eventIdempotencyKey(
  kind: MachineEventKind,
  pendingId: string | null | undefined,
): string {
  return `t088:${kind}:${String(pendingId || 'unknown')}`;
}

/** 造机器事件（缺 sessionId ⇒ 返回 null，调用方静默跳过）。 */
export function buildMachineEvent(
  kind: Extract<MachineEventKind, 'return_failed' | 'cancelled_by_user'>,
  ctx: MachineEventContext,
): MachineEvent | null {
  if (!ctx.sessionId) return null;
  return {
    sessionId: ctx.sessionId,
    content: buildMachineEventContent(kind, ctx),
    taskId: ctx.pendingId || null,
    kind,
    idempotencyKey: eventIdempotencyKey(kind, ctx.pendingId),
  };
}

// ===========================================================================
// I/O —— 由 deps 注入，单测可 mock
// ===========================================================================

export interface MachineEventDeps {
  /** API base（如 https://www.gaga.sale/api/v1）。 */
  apiBase: () => string;
  /** 设备 token（内存持有，不落盘）。 */
  accessToken: () => string | null;
  /** 设备 id（固定身份 fromId = claude-code:<deviceId>）。 */
  deviceId: () => string;
  /** 注入 fetch（单测用）。 */
  fetchImpl?: typeof globalThis.fetch;
  /** outbox 目录（单测用临时目录；生产走 userDataDir）。 */
  outboxDir?: () => string;
  /** 写 transcript / peer inbox 注记（单测 mock；生产由 deviceClient 注入）。 */
  writeChannelStatus?: (sessionId: string, notice: string) => Promise<boolean>;
}

/** outbox 文件（append-only jsonl，重连补发用）。 */
export function outboxFile(deps: MachineEventDeps): string {
  const dir = deps.outboxDir ? deps.outboxDir() : userDataDir();
  return path.join(dir, 'machine-event-outbox.jsonl');
}

interface OutboxRow {
  ts: number;
  event: MachineEvent;
  sent: boolean;
}

/** 本机持久化一条机器事件（落盘失败不许影响主流程）。 */
export function appendOutbox(deps: MachineEventDeps, event: MachineEvent, sent: boolean): void {
  try {
    const file = outboxFile(deps);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const row: OutboxRow = { ts: Date.now(), event, sent };
    fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf8');
  } catch (e) {
    console.error('[machine-events] outbox 落盘失败:', e && (e as Error).message);
  }
}

/** 读未发出的 outbox 行（重连补发用）。 */
export function readPendingOutbox(deps: MachineEventDeps): MachineEvent[] {
  try {
    const raw = fs.readFileSync(outboxFile(deps), 'utf8');
    const out: MachineEvent[] = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line) as OutboxRow;
        if (row && row.event && !row.sent) out.push(row.event);
      } catch { /* 半截行 ⇒ 跳过 */ }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * 发一条机器事件到 session-inbox（经服务端窄入口 `/devices/cc/messages`）。
 *
 * @returns `true` = 200（已投递）；`false` = 失败（outbox 已落盘，等重连补发）。
 *   409/404/401 ⇒ `false`，但**不重试**（服务端已结 / 无权限 ⇒ 重试也无用）。
 */
export async function sendMachineEvent(
  deps: MachineEventDeps,
  event: MachineEvent,
): Promise<{ ok: boolean; reason?: string }> {
  const token = deps.accessToken();
  if (!token) {
    appendOutbox(deps, event, false);
    return { ok: false, reason: 'NO_TOKEN' };
  }
  const url = `${String(deps.apiBase() || '').replace(/\/+$/, '')}/devices/cc/messages`;
  const f = deps.fetchImpl || globalThis.fetch;
  let res: Response;
  try {
    res = await f(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'x-device-id': deps.deviceId(),
      },
      // ⚠️ 只发白名单字段：userId / kind / fromKind 由服务端固定写。
      body: JSON.stringify({
        sessionId: event.sessionId,
        content: event.content,
        ...(event.taskId ? { taskId: event.taskId } : {}),
        idempotencyKey: event.idempotencyKey,
        ccSessionId: deps.deviceId(),
      }),
    });
  } catch (e) {
    appendOutbox(deps, event, false);
    return { ok: false, reason: 'NETWORK_ERROR' };
  }
  if (!res.ok) {
    appendOutbox(deps, event, false);
    return { ok: false, reason: `HTTP_${res.status}` };
  }
  appendOutbox(deps, event, true);
  return { ok: true };
}

/**
 * 机器事件全流程：发 session-inbox + （若 reply_to 可用）写 channel-status 注记。
 *
 * ⚠️ 两个通道**互不阻塞**：session-inbox 失败不挡 channel-status 写入，反之亦然。
 */
export async function emitMachineEvent(
  deps: MachineEventDeps,
  kind: Extract<MachineEventKind, 'return_failed' | 'cancelled_by_user'>,
  ctx: MachineEventContext,
): Promise<{ inboxOk: boolean; channelStatusOk: boolean | null; event: MachineEvent | null }> {
  const event = buildMachineEvent(kind, ctx);
  if (!event) return { inboxOk: false, channelStatusOk: null, event: null };
  const inbox = await sendMachineEvent(deps, event);

  let channelStatusOk: boolean | null = null;
  if (ctx.replyTo && hasReplyTo(ctx.replyTo) && deps.writeChannelStatus) {
    const notice = buildChannelStatusNotice(kind, ctx);
    try {
      channelStatusOk = await deps.writeChannelStatus(ctx.sessionId!, notice);
    } catch (e) {
      console.warn('[machine-events] 写 channel-status 失败:', e && (e as Error).message);
      channelStatusOk = false;
    }
  }
  return { inboxOk: inbox.ok, channelStatusOk, event };
}
