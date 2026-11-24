/**
 * electron/client-tools/claudeBgSession.ts —— **CLI 后台会话的登记与检索**（T-128-fix）
 *
 * ## 它解决什么
 *
 * `claude --bg` 起的会话在 `claude agents --json` 里能看到（kind=background），
 * 但 Gacode 自己的常驻会话表（`ccPersistentSession.ts`）一开始是空的
 * ⇒ `pc_cc_send` / `pc_cc_close` 不认这些会话。
 *
 * ⇒ 本模块提供「列出后台会话」与「停掉后台会话」两个原语。
 *   ⚠️ 注册项里带 `jobId`（= bg_id），所以**不需要**额外的登记步骤。
 *
 * ## ⛔ 不 import electron
 *
 * 这样单测能直接跑（`executor.ts` 顶层 import electron ⇒ 不能进测试进程）。
 */

import { execFileSync, spawn } from 'child_process';
import { findSession } from './claudeCodePeer.ts';
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
  // ⛔ **只要后台会话**：interactive / vscode 会话没有 bg id，混进来会让
  //    「按 bg_id 关闭」这类操作打错目标。
  return arr
    .filter((x) => x && typeof x.sessionId === 'string' && x.sessionId && x.kind === 'background')
    .map((x) => ({
      // ⚠️ `id` 缺失时用 sessionId 前缀兜底（实测 bg_id == sessionId 前缀）。
      id: String(x.id || String(x.sessionId).split('-')[0]),
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

/** 空闲多久算过期（毫秒）—— 与常驻会话表的 TTL 一致。 */
export const BG_IDLE_TTL_MS = 5 * 60 * 1000;

/**
 * 扫本机**后台会话**（`claude --bg`），把空闲超过 TTL 的停掉。
 *
 * ⚠️ 判据用注册项的 `updatedAt`（CLI 每次状态变化都会更新它）⇒
 *   「最近没动过」= 空闲；正在跑的任务会持续更新它 ⇒ 不会被误杀。
 *
 * @returns 被停掉的会话数
 */
export function sweepIdleBackgroundSessions(
  ttlMs: number = BG_IDLE_TTL_MS,
  now: number = Date.now(),
): number {
  const sessions = listClaudeBgSessions();
  let stopped = 0;
  for (const s of sessions) {
    const rec = findSession(s.sessionId);
    if (!rec) continue;
    const last = typeof rec.updatedAt === 'number' ? rec.updatedAt : 0;
    if (!last) continue;
    if (now - last < ttlMs) continue;
    const bgId = s.id || s.sessionId.split('-')[0];
    void stopClaudeBgSession(bgId).then((ok) => {
      if (ok) stopped += 1;
    });
  }
  return stopped;
}
