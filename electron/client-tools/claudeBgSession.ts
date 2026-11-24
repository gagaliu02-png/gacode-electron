/**
 * electron/client-tools/claudeBgSession.ts —— **CLI 后台会话的登记与检索**（T-128-fix）
 *
 * ## 它解决什么
 *
 * `claude --bg` 起的会话在 `claude agents --json` 里能看到（kind=background），
 * 但 Gacode 自己的常驻会话表（`ccPersistentSession.ts`）一开始是空的
 * ⇒ `pc_cc_send` / `pc_cc_close` 不认这些会话。
 *
 * ⇒ 本模块提供「按 bg_id / session_id 把已有后台会话登记进来」的能力，
 *   并**先验信箱**（`messagingSocketPath`）——没有信箱的会话登记了也投不进去。
 *
 * ## ⛔ 不 import electron
 *
 * 这样单测能直接跑（`executor.ts` 顶层 import electron ⇒ 不能进测试进程）。
 */

import { execFileSync, spawn } from 'child_process';
import { findSession } from './claudeCodePeer.ts';
import { acquirePersistentSession, setPersistentSessionBgId } from './ccPersistentSession.ts';
import { resolveClaudeBinary } from './claudeService.ts';

export interface ClaudeBgSessionInfo {
  id: string;
  sessionId: string;
  name: string | null;
  cwd: string | null;
  kind: string;
  status: string | null;
  state: string | null;
}

/** 跑 `claude agents --json` 并解析（读不到就当空数组）。 */
export function listClaudeBgSessions(cli?: string): ClaudeBgSessionInfo[] {
  const bin = cli || resolveClaudeBinary();
  if (!bin) return [];
  let out = '';
  try {
    // ⚠️ 必须用**静态 import 的** execFileSync：ESM 里 `require` 不存在 ⇒
    //   之前的 require 写法会抛错并被 catch 吞掉 ⇒ 永远返回空列表（静默失效）。
    out = execFileSync(bin, ['agents', '--json'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
    });
  } catch {
    return [];
  }
  let arr: any[];
  try {
    arr = JSON.parse(out || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((x) => x && typeof x.sessionId === 'string' && x.sessionId)
    .map((x) => ({
      id: String(x.id ?? ''),
      sessionId: String(x.sessionId),
      name: typeof x.name === 'string' ? x.name : null,
      cwd: typeof x.cwd === 'string' ? x.cwd : null,
      kind: String(x.kind ?? ''),
      status: typeof x.status === 'string' ? x.status : null,
      state: typeof x.state === 'string' ? x.state : null,
    }));
}

/** 按 bg_id（短 id）或 session_id 找后台会话。 */
export function findClaudeBgSession(
  query: { bgId?: string | null; sessionId?: string | null },
  sessions?: ClaudeBgSessionInfo[],
): ClaudeBgSessionInfo | null {
  const list = sessions ?? listClaudeBgSessions();
  const bgId = query.bgId ? String(query.bgId) : null;
  const sid = query.sessionId ? String(query.sessionId) : null;
  return (
    list.find((x) => {
      if (bgId && (x.id === bgId || x.sessionId.startsWith(bgId))) return true;
      if (sid && x.sessionId === sid) return true;
      return false;
    }) || null
  );
}

/** 该会话有没有 peer 信箱（没有 ⇒ 注入投不进去）。 */
export function hasPeerInbox(sessionId: string): boolean {
  const rec = findSession(sessionId);
  return !!(rec && rec.messagingSocketPath);
}

/**
 * 把一个后台会话登记进 Gacode 常驻会话表。
 *
 * @returns { ok: true, session_id, bg_id } 或 { ok: false, reason, message }
 */
export function adoptClaudeBgSession(
  query: { bgId?: string | null; sessionId?: string | null },
  sessions?: ClaudeBgSessionInfo[],
): { ok: boolean; reason?: string; session_id?: string; bg_id?: string; message?: string } {
  const bgId = query.bgId ? String(query.bgId) : null;
  const sid = query.sessionId ? String(query.sessionId) : null;
  if (!bgId && !sid) return { ok: false, reason: 'missing_param', message: '缺少 bg_id 或 session_id' };

  const hit = findClaudeBgSession({ bgId, sessionId: sid }, sessions);
  if (!hit) {
    return { ok: false, reason: 'not_found', message: `本机没有这个 CLI 后台会话: ${bgId || sid}` };
  }
  if (hit.kind !== 'background') {
    return {
      ok: false,
      reason: 'not_background',
      message: `该会话不是后台会话（kind=${hit.kind}），只有 claude --bg 起的才能登记`,
    };
  }
  if (!hasPeerInbox(hit.sessionId)) {
    return {
      ok: false,
      reason: 'no_inbox',
      message:
        `会话 ${hit.sessionId} 没有信箱（messagingSocketPath 为空）⇒ pc_cc_send 投不进去；`
        + '请用支持 peer 消息通道的 Claude Code 版本（≥2.1.330）重新起会话',
    };
  }

  acquirePersistentSession({
    session_id: hit.sessionId,
    cwd: hit.cwd,
    name: hit.name,
    adopt: true,
  });
  setPersistentSessionBgId(hit.sessionId, hit.id || bgId || hit.sessionId.slice(0, 8));

  return { ok: true, session_id: hit.sessionId, bg_id: hit.id };
}

/** 停掉一个 CLI 后台会话（`claude stop <bg_id>`）。 */
export function stopClaudeBgSession(bgId: string): Promise<boolean> {
  const bin = resolveClaudeBinary();
  if (!bin) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    try {
      const child = spawn(bin, ['stop', bgId], { stdio: 'ignore', windowsHide: true });
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
}
