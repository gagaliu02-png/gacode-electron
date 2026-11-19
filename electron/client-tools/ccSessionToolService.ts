/**
 * electron/client-tools/ccSessionToolService.ts —— [T-087] Claude Code 会话工具的主进程实现
 *
 * 设计要点：
 *   · 身份固定：userId/role/kind/fromKind 不信任 CLI，由这里（进程内）注入。
 *   · list：gacode session 走 `GET /api/v1/yinian/sessions?limit=…`；CC session
 *     走现有 `listClaudeSessions()`（只读活会话，不扫历史全量）。
 *   · read：gacode session 走 `GET /api/v1/yinian/sessions/:id/messages?limit=…`
 *     （服务端按 Bearer token 的 userId 校验归属）；CC session 走 `readTranscriptTail()`。
 *   · send：走服务端窄入口 `POST /api/v1/devices/cc/messages`（设备 token），
 *     请求体只含白名单字段，不带 userId/kind/fromKind。
 *
 * 模块不 import electron，方便 node --test 直接注入 fetch/设备身份做契约测试。
 */

import {
  CcToolError,
  buildSendPayload,
  listSessions,
  authorizeRead,
  summarizeTurns,
  type CcRawSession,
  type CcSessionRole,
  type CcListFilter,
} from './ccSessionTools.ts';
import {
  listClaudeSessions,
  readTranscriptTail,
} from './claudeCodeSession.ts';

import type { CcToolRoute } from './claudeCodeHookBridge.ts';

/** 服务端窄入口路径（统一 API base + 此路径）。 */
export const CC_MESSAGES_PATH = '/devices/cc/messages';

export interface CcSessionToolDeps {
  /** 统一 API base，例如 https://www.gaga.sale/api/v1。 */
  apiBase: () => string;
  /** 设备 token（Bearer），由主进程内存持有；不落盘、不给 CLI。 */
  accessToken: () => string | null;
  /** 设备 id。 */
  deviceId: () => string;
  /** 当前调用角色 —— 主进程可信来源（renderer/会话上下文注入），默认 main。 */
  role?: () => CcSessionRole;
  /** 当前 Claude Code session id（用于「不能发给自己」）。 */
  selfSessionId?: () => string | null;
  /** 子 session 的父 session id（可信来源）。 */
  parentSessionId?: () => string | null;
  /** 注入 fetch（测试用）。 */
  fetchImpl?: typeof globalThis.fetch;
}

type FetchLike = typeof globalThis.fetch;

function authHeaders(deps: CcSessionToolDeps): Record<string, string> {
  const token = deps.accessToken();
  if (!token) throw new CcToolError('NO_TOKEN', '设备未登录或 token 已失效', 401);
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
    'x-device-id': deps.deviceId(),
  };
}

function upstreamBase(deps: CcSessionToolDeps): string {
  return String(deps.apiBase() || '').replace(/\/+$/, '');
}

async function fetchJson(
  deps: CcSessionToolDeps,
  url: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; data: any }> {
  const f: FetchLike = deps.fetchImpl || globalThis.fetch;
  let res: Response;
  try {
    res = await f(url, init);
  } catch (e: any) {
    throw new CcToolError('UPSTREAM_UNAVAILABLE', `上游不可用: ${e?.message || e}`, 503);
  }
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { ok: res.ok, status: res.status, data };
}

/** 从 gacode `/yinian/sessions` 取近期活跃 session（默认 20，服务端排序 pinned + lastMessageAt）。 */
async function listGacodeSessions(
  deps: CcSessionToolDeps,
  limit: number,
): Promise<CcRawSession[]> {
  const url = `${upstreamBase(deps)}/yinian/sessions?limit=${encodeURIComponent(String(limit))}`;
  const r = await fetchJson(deps, url, { method: 'GET', headers: authHeaders(deps) });
  if (!r.ok) {
    throw new CcToolError('UPSTREAM_ERROR', `列 gacode 会话失败（${r.status}）`, 502);
  }
  const items = Array.isArray(r.data?.items) ? r.data.items : Array.isArray(r.data?.data?.items) ? r.data.data.items : [];
  return items.map((s: any) => ({
    sessionId: String(s.id),
    title: typeof s.title === 'string' ? s.title : '',
    role: 'main' as const,
    status: 'active',
    updatedAt: s.last_message_at || s.updated_at || s.created_at || null,
    source: 'gacode' as const,
  }));
}

/** 本机 Claude Code 活会话（已按更新/登记时间排序，只取少量）。 */
function listLocalClaudeSessions(limit: number): CcRawSession[] {
  return listClaudeSessions()
    .map((s) => ({
      sessionId: s.sessionId,
      title: s.name || s.cwd || s.sessionId,
      role: 'main' as const,
      status: String(s.status || 'unknown'),
      updatedAt: s.updatedAt || null,
      source: 'claude-code' as const,
    }))
    .slice(0, limit);
}

async function readGacodeTurns(
  deps: CcSessionToolDeps,
  sessionId: string,
  maxTurns: number,
): Promise<{ title: string; turns: ReturnType<typeof summarizeTurns> }> {
  const url = `${upstreamBase(deps)}/yinian/sessions/${encodeURIComponent(sessionId)}/messages?limit=${encodeURIComponent(String(maxTurns))}`;
  const r = await fetchJson(deps, url, { method: 'GET', headers: authHeaders(deps) });
  // 服务端 listChatMessages 按 (userId, sessionId) 查库 ⇒ 非本人 session 返回 404，fail-closed。
  if (!r.ok) {
    throw new CcToolError(r.status === 404 ? 'NOT_FOUND' : 'UPSTREAM_ERROR',
      `读 gacode 会话失败（${r.status}）：无权限或不存在`, r.status === 404 ? 404 : 502);
  }
  const items = Array.isArray(r.data?.items) ? r.data.items : Array.isArray(r.data?.data?.items) ? r.data.data.items : [];
  return {
    title: String(r.data?.session?.title || ''),
    turns: summarizeTurns(items.map((m: any) => ({
      role: m.role,
      content: m.content,
      timestamp: m.created_at,
      tools: Array.isArray(m.phases_json) ? m.phases_json : [],
    }))),
  };
}

function readClaudeTurns(sessionId: string, maxTurns: number): { title: string; turns: ReturnType<typeof summarizeTurns> } {
  const rec = listClaudeSessions().find((s) => s.sessionId === sessionId);
  if (!rec) throw new CcToolError('NOT_FOUND', `Claude Code 会话不在本机运行中: ${sessionId}`, 404);
  const { turns } = readTranscriptTail(rec, { maxTurns });
  return { title: String(rec.name || rec.cwd || ''), turns: summarizeTurns(turns) };
}

async function sendToUpstream(
  deps: CcSessionToolDeps,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = `${upstreamBase(deps)}${CC_MESSAGES_PATH}`;
  const r = await fetchJson(deps, url, {
    method: 'POST',
    headers: authHeaders(deps),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    throw new CcToolError('SEND_FAILED', `发送失败（${r.status}）`, r.status === 403 ? 403 : 502);
  }
  return (r.data && typeof r.data === 'object' ? r.data : {}) as Record<string, unknown>;
}

function isGacodeId(sessionId: string): boolean {
  // gacode session 是数字 id；Claude Code session 是 UUID。
  return /^\d+$/.test(sessionId);
}

/**
 * 处理一个 /cc-tools/<route> 请求。
 *
 * 注意：调用方（hook 桥）已做本地 token 校验；这里只处理业务逻辑。
 */
export async function handleCcTool(
  route: CcToolRoute,
  input: Record<string, unknown>,
  deps: CcSessionToolDeps,
): Promise<Record<string, unknown>> {
  const role = deps.role ? deps.role() : 'main';
  const selfSessionId = deps.selfSessionId ? deps.selfSessionId() : null;
  const parentSessionId = deps.parentSessionId ? deps.parentSessionId() : null;

  if (route === 'list') {
    const filter: CcListFilter = {
      query: typeof input.query === 'string' ? input.query : undefined,
      title: typeof input.title === 'string' ? input.title : undefined,
      sessionId: typeof input.sessionId === 'string' ? input.sessionId : undefined,
      limit: (() => {
        if (input.limit === undefined || input.limit === null) return undefined;
        const n = Number(input.limit);
        return Number.isFinite(n) ? Math.trunc(n) : undefined;
      })(),
    };
    const gate = listSessions([], filter, role); // 先过权限 + limit 校验（子 session 在此被拒）
    const [gacode, local] = await Promise.all([
      listGacodeSessions(deps, gate.limit).catch((e) => {
        if (e instanceof CcToolError && e.code === 'NO_TOKEN') throw e;
        return [] as CcRawSession[]; // 本机 CC 会话仍可用，不让一端失败拖垮整个 list
      }),
      Promise.resolve(listLocalClaudeSessions(gate.limit)),
    ]);
    return { ok: true, ...listSessions([...gacode, ...local], filter, role) };
  }

  if (route === 'read') {
    const auth = authorizeRead({
      sessionId: String(input.sessionId || ''),
      maxTurns: (() => {
        if (input.maxTurns === undefined || input.maxTurns === null) return undefined;
        const n = Number(input.maxTurns);
        return Number.isFinite(n) ? Math.trunc(n) : undefined;
      })(),
      role,
      parentSessionId,
    }, () => null); // 真正的 read 在权限通过后再做，避免无谓上游调用
    const source = input.source === 'claude-code' || !isGacodeId(auth.sessionId) ? 'claude-code' : 'gacode';
    const { title, turns } = source === 'gacode'
      ? await readGacodeTurns(deps, auth.sessionId, auth.maxTurns)
      : readClaudeTurns(auth.sessionId, auth.maxTurns);
    return {
      ok: true,
      sessionId: auth.sessionId,
      title,
      source,
      summary: turns.length ? turns[turns.length - 1].summary : '',
      turns,
    };
  }

  // send
  const payload = buildSendPayload({
    toSessionId: String(input.toSessionId || ''),
    content: String(input.content || ''),
    taskId: (input.taskId as string | null) || null,
    replyTo: (input.replyTo as any) || null,
    replyToTaskId: (input.replyToTaskId as string | null) || null,
    replyToCcSessionId: (input.replyToCcSessionId as string | null) || null,
    replyToBusinessSessionId: (input.replyToBusinessSessionId as string | null) || null,
    replyChannel: (input.replyChannel as string | null) || null,
    idempotencyKey: (input.idempotencyKey as string | null) || null,
    role,
    selfSessionId,
    parentSessionId,
  });
  const result = await sendToUpstream(deps, {
    sessionId: payload.toSessionId,
    content: payload.content,
    ...(payload.taskId ? { taskId: payload.taskId } : {}),
    ...(payload.replyTo.ccSessionId ? { replyToCcSessionId: payload.replyTo.ccSessionId } : {}),
    ...(payload.replyTo.businessSessionId ? { replyToBusinessSessionId: payload.replyTo.businessSessionId } : {}),
    ...(payload.replyTo.channel ? { replyChannel: payload.replyTo.channel } : {}),
    ...(payload.idempotencyKey ? { idempotencyKey: payload.idempotencyKey } : {}),
  });
  return { ok: true, ...result };
}
