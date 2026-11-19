/**
 * electron/client-tools/ccSessionTools.ts —— Claude Code 会话协作工具的**纯逻辑层**
 *
 * [2026-11-20 · T-087]
 *
 * 目标：给 Claude Code 侧统一 CLI（`gaclaw-msg list|read|send`）提供一组
 * 与 gaclaw 内部 session 工具一致的规则：
 *   · 主 session：可列 / 可读 / 可发给其它 session
 *   · 子 session：没有 list/read 权限，只能回父
 *   · 不能发给自己
 *   · 只列近期活跃 session（不扫历史全量）
 *   · 目标归属 / 身份由服务端校验，客户端不传 userId/kind/fromKind
 *
 * ⚠️ 本文件是**纯 Node 模块**，不 import electron ⇒ 可直接 `node --test`。
 *   它只做参数校验与数据归一化；实际 session 列表 / transcript 读取函数由调用方注入。
 */

/** 调用者角色（必须由服务端/父会话上下文可信注入，CLI 不得自报）。 */
export type CcSessionRole = 'main' | 'subsession';

/** 会话来源。 */
export type CcSessionSource = 'gacode' | 'claude-code';

/** list 过滤条件。 */
export interface CcListFilter {
  query?: string;
  title?: string;
  sessionId?: string;
  /** 默认 20，硬上限 50。 */
  limit?: number;
}

/** 一条统一的 session 摘要。 */
export interface CcSessionSummary {
  sessionId: string;
  title: string;
  role: CcSessionRole;
  status: string;
  updatedAt: string | null;
  source: CcSessionSource;
  /** 仅用于「回父」判断，不作为权限凭据。 */
  parentSessionId?: string | null;
}

/** 输入 session 的归一化形状（调用方把 gacode API / 本机 CC 会话映射到这里）。 */
export interface CcRawSession {
  sessionId: string;
  title?: string | null;
  role?: CcSessionRole;
  status?: string | null;
  updatedAt?: string | number | null;
  source: CcSessionSource;
  parentSessionId?: string | null;
}

/** read 的入参。 */
export interface CcReadInput {
  sessionId: string;
  maxTurns?: number;
  role: CcSessionRole;
  /** 子 session 只能读父（父 session id 必须由可信上下文提供）。 */
  parentSessionId?: string | null;
}

/** send 的入参。 */
export interface CcSendInput {
  toSessionId: string;
  content: string;
  taskId?: string | null;
  replyTo?: {
    taskId?: string | null;
    ccSessionId?: string | null;
    businessSessionId?: string | null;
    channel?: string | null;
  } | null;
  /** 直接字段形式（CLI 常用）。 */
  replyToTaskId?: string | null;
  replyToCcSessionId?: string | null;
  replyToBusinessSessionId?: string | null;
  replyChannel?: string | null;
  idempotencyKey?: string | null;
  role: CcSessionRole;
  /** 当前 Claude Code 会话 id —— 用来挡「发给自己」。 */
  selfSessionId?: string | null;
  /** 子 session 的父 —— 必须由可信上下文提供。 */
  parentSessionId?: string | null;
}

/** 工具错误（带稳定 code + HTTP 状态建议）。 */
export class CcToolError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'CcToolError';
    this.code = code;
    this.status = status;
  }
}

export const MAX_CONTENT_LENGTH = 8000;
export const MAX_ID_LENGTH = 256;
export const DEFAULT_LIST_LIMIT = 20;
export const MAX_LIST_LIMIT = 50;
export const DEFAULT_READ_TURNS = 12;
export const MAX_READ_TURNS = 50;

function cleanString(v: unknown, max: number, field: string): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new CcToolError('INVALID_ARGUMENT', `${field} 必须是字符串`);
  const s = v.trim();
  if (!s) return null;
  if (s.length > max) throw new CcToolError('INVALID_ARGUMENT', `${field} 最长 ${max} 字符`);
  if (/[\u0000-\u001f]/.test(s)) throw new CcToolError('INVALID_ARGUMENT', `${field} 含控制字符`);
  return s;
}

function cleanId(v: unknown, field: string): string | null {
  return cleanString(v, MAX_ID_LENGTH, field);
}

/** 角色必须显式给出，且只能由可信上下文提供；CLI 自报会被视为非法。 */
export function assertRole(role: unknown): CcSessionRole {
  if (role !== 'main' && role !== 'subsession') {
    throw new CcToolError('FORBIDDEN', '调用角色必须由服务端上下文提供（main|subsession），不能自报', 403);
  }
  return role;
}

/**
 * 列会话：只处理调用方给的「近期活跃」候选，按过滤条件收窄。
 *
 * ⚠️ 子 session 直接拒绝（对齐 gaclaw 内部 session_list 规则）。
 */
export function listSessions(
  candidates: readonly CcRawSession[],
  filter: CcListFilter,
  role: CcSessionRole,
): { sessions: CcSessionSummary[]; limit: number } {
  assertRole(role);
  if (role === 'subsession') {
    throw new CcToolError('FORBIDDEN', '子 session 不允许 list；请用创建时注入的 parentSessionId 回父', 403);
  }
  const limitRaw = filter.limit ?? DEFAULT_LIST_LIMIT;
  const limit = Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIST_LIMIT) {
    throw new CcToolError('INVALID_ARGUMENT', `limit 必须是 1..${MAX_LIST_LIMIT} 的整数`);
  }
  const q = cleanString(filter.query, 200, 'query')?.toLowerCase() || null;
  const title = cleanString(filter.title, 200, 'title')?.toLowerCase() || null;
  const sessionId = cleanId(filter.sessionId, 'sessionId');

  const out: CcSessionSummary[] = [];
  for (const c of candidates) {
    const sid = cleanId(c.sessionId, 'sessionId');
    if (!sid) continue;
    const t = String(c.title || '');
    if (title && !t.toLowerCase().includes(title)) continue;
    if (sessionId && sid !== sessionId) continue;
    if (q && !`${sid} ${t}`.toLowerCase().includes(q)) continue;
    out.push({
      sessionId: sid,
      title: t.slice(0, 200),
      role: c.role === 'subsession' ? 'subsession' : 'main',
      status: String(c.status || 'unknown').slice(0, 64),
      updatedAt: normalizeDate(c.updatedAt),
      source: c.source === 'gacode' ? 'gacode' : 'claude-code',
      ...(c.parentSessionId ? { parentSessionId: String(c.parentSessionId).slice(0, MAX_ID_LENGTH) } : {}),
    });
    if (out.length >= limit) break;
  }
  return { sessions: out, limit };
}

function normalizeDate(v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') {
    const d = new Date(v > 1e12 ? v : v * 1000);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isFinite(d.getTime()) ? d.toISOString() : v.slice(0, 64);
  }
  return null;
}

/**
 * read 权限闸门：只读调用方传入的 read 函数，不改变任何状态。
 *
 * ⚠️ 子 session 只能读父；目标归属由上游 API 再次校验（本函数不信任客户端 userId）。
 */
export function authorizeRead<T>(
  input: CcReadInput,
  read: (sessionId: string, maxTurns: number) => T,
): { sessionId: string; maxTurns: number; result: T } {
  assertRole(input.role);
  const sid = cleanId(input.sessionId, 'sessionId');
  if (!sid) throw new CcToolError('INVALID_ARGUMENT', '缺少 sessionId');
  const maxTurnsRaw = input.maxTurns ?? DEFAULT_READ_TURNS;
  const maxTurns = Number(maxTurnsRaw);
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > MAX_READ_TURNS) {
    throw new CcToolError('INVALID_ARGUMENT', `maxTurns 必须是 1..${MAX_READ_TURNS} 的整数`);
  }
  if (input.role === 'subsession') {
    const parent = cleanId(input.parentSessionId, 'parentSessionId');
    if (!parent || parent !== sid) {
      throw new CcToolError('FORBIDDEN', '子 session 只能读自己的父 session', 403);
    }
  }
  return { sessionId: sid, maxTurns, result: read(sid, maxTurns) };
}

/** read 结果的「摘要化」：只回近期 turns 的摘要，不返回整段 transcript。 */
export interface CcRawTurn {
  role?: unknown;
  text?: unknown;
  content?: unknown;
  timestamp?: unknown;
  tools?: unknown;
  toolCallCount?: unknown;
}

export function summarizeTurns(turns: readonly CcRawTurn[]): Array<{
  role: string;
  summary: string;
  toolCallCount: number;
  timestamp?: string | null;
}> {
  return turns.slice(-MAX_READ_TURNS).map((t) => {
    const raw = typeof t.text === 'string' ? t.text : (typeof t.content === 'string' ? t.content : '');
    const tools = Array.isArray(t.tools) ? t.tools.length : 0;
    const explicit = Number(t.toolCallCount);
    return {
      role: String(t.role || 'unknown').slice(0, 32),
      summary: raw.replace(/\s+/g, ' ').trim().slice(0, 500),
      toolCallCount: Number.isInteger(explicit) && explicit >= 0 ? explicit : tools,
      ...(t.timestamp ? { timestamp: String(t.timestamp).slice(0, 64) } : {}),
    };
  });
}

/**
 * send 权限闸门 + payload 归一化。
 *
 * 规则：
 *   · 不能发给自己（selfSessionId 来自可信上下文，不能由 CLI 自报）
 *   · 子 session 只能回父（parentSessionId 可信）
 *   · 只有 reply_to 明确指向父 session 才允许；否则 fail-closed
 *   · content 有长度上限；只输出白名单字段
 *
 * ⚠️ 返回的 payload **不含** userId / kind / fromKind —— 这些由服务端固定。
 */
export function buildSendPayload(input: CcSendInput): {
  toSessionId: string;
  content: string;
  taskId: string | null;
  replyTo: {
    taskId: string | null;
    ccSessionId: string | null;
    businessSessionId: string | null;
    channel: string | null;
  };
  idempotencyKey: string | null;
} {
  assertRole(input.role);
  const to = cleanId(input.toSessionId, 'toSessionId');
  if (!to) throw new CcToolError('INVALID_ARGUMENT', '缺少 toSessionId');
  const content = cleanString(input.content, MAX_CONTENT_LENGTH, 'content');
  if (!content) throw new CcToolError('INVALID_ARGUMENT', 'content 不能为空');

  const self = cleanId(input.selfSessionId, 'selfSessionId');
  if (self && self === to) {
    throw new CcToolError('FORBIDDEN', '不能发给自己', 403);
  }

  const reply = input.replyTo || {};
  const taskId = cleanId(input.taskId ?? reply.taskId ?? input.replyToTaskId, 'taskId');
  const ccSessionId = cleanId(reply.ccSessionId ?? input.replyToCcSessionId, 'replyToCcSessionId');
  const businessSessionId = cleanId(reply.businessSessionId ?? input.replyToBusinessSessionId, 'replyToBusinessSessionId');
  const channel = cleanId(reply.channel ?? input.replyChannel, 'replyChannel');

  if (input.role === 'subsession') {
    const parent = cleanId(input.parentSessionId, 'parentSessionId');
    // 子 session 的「父」在两个坐标系里：CC session id 或 gacode business session id。
    const replyTarget = ccSessionId || businessSessionId;
    if (!parent || !replyTarget || !parent.split(',').includes(replyTarget)) {
      throw new CcToolError('FORBIDDEN', '子 session 只能回父：必须带 reply_to 且指向父 session', 403);
    }
  }

  const idempotencyKey = cleanId(input.idempotencyKey, 'idempotencyKey');
  return {
    toSessionId: to,
    content,
    taskId,
    replyTo: { taskId, ccSessionId, businessSessionId, channel },
    idempotencyKey,
  };
}

/**
 * send 上游请求：只把白名单字段交给服务端；userId/kind/fromKind 永不出现在这里。
 *
 * `send` 由调用方注入（测试可替换），返回值原样回传。
 */
export async function deliverMessage<T>(
  payload: ReturnType<typeof buildSendPayload>,
  send: (body: Record<string, unknown>) => Promise<T>,
): Promise<T> {
  // 显式重建对象，杜绝调用方多塞字段。
  return await send({
    sessionId: payload.toSessionId,
    content: payload.content,
    ...(payload.taskId ? { taskId: payload.taskId } : {}),
    ...(payload.replyTo.ccSessionId ? { replyToCcSessionId: payload.replyTo.ccSessionId } : {}),
    ...(payload.replyTo.businessSessionId ? { replyToBusinessSessionId: payload.replyTo.businessSessionId } : {}),
    ...(payload.replyTo.channel ? { replyChannel: payload.replyTo.channel } : {}),
    ...(payload.idempotencyKey ? { idempotencyKey: payload.idempotencyKey } : {}),
  });
}
