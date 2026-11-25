/**
 * electron/client-tools/ccPersistentSession.ts —— T-128 PC-CC 逻辑常驻会话登记
 *
 * ## 为什么是「逻辑常驻」
 *
 * Claude Code `-p` 每次任务结束进程会退出；原生 `--bg` 会忽略我们指定的
 * `--session-id`，而现有 `pc_cc_send/append/control` 的 IPC 注入依赖
 * `~/.claude/sessions/<pid>.json` 的活会话登记。
 *
 * ⇒ 本模块不改 CLI 进程形态：只把「这个 session_id 还要继续 resume」登记下来。
 *   每次任务仍由 `claudeService` 用 `-p --resume <session-id>` 起一个一次性后台作业；
 *   PC 端负责：
 *     · 记住活跃 session_id / cwd / 最近活动时间；
 *     · 空闲 5 分钟自动失效（不等正在跑的任务）；
 *     · `pc_cc_close` 显式关闭；
 *     · 给 `pc_cc_new` 提供可复用的 session_id。
 *
 * 文件落 `userData/cc-persistent-sessions.json`：纯 JSON，坏文件按空表处理，不让工具炸。
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { userDataDir } from './localJobs.ts';
// ★ [T-149-cc] 「在不在跑」的唯一真源（与 bg 巡检共用）。
import { isClaudeSessionBusy } from './ccSessionBusy.ts';
import { listClaudeSessions, type ClaudeSessionRecord } from './claudeCodeSession.ts';

export const CC_IDLE_TTL_MS = 5 * 60 * 1000;
const STATE_FILE_NAME = 'cc-persistent-sessions.json';

export interface CcPersistentSession {
  session_id: string;
  /** ★ [T-128-fix] CLI 原生后台会话 id（`claude stop <bg_id>` 用）。 */
  bg_id?: string | null;
  cwd: string | null;
  name: string | null;
  created_at: number;
  last_activity_at: number;
  /** 当前是否有一个后台任务在跑（由作业启动/结果回传侧更新）。 */
  active_job_id: string | null;
}

interface StateFile {
  version: 1;
  sessions: CcPersistentSession[];
}

function stateFile(): string {
  return path.join(userDataDir(), STATE_FILE_NAME);
}

function readState(): StateFile {
  try {
    const raw = fs.readFileSync(stateFile(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.sessions)) return { version: 1, sessions: [] };
    return {
      version: 1,
      sessions: parsed.sessions.filter((s: any) => s && typeof s.session_id === 'string' && s.session_id),
    };
  } catch {
    return { version: 1, sessions: [] };
  }
}

function writeState(state: StateFile): void {
  fs.mkdirSync(userDataDir(), { recursive: true });
  const tmp = `${stateFile()}.tmp-${process.pid}-${randomUUID()}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, stateFile());
}

function isExpired(s: CcPersistentSession, now: number, records?: ClaudeSessionRecord[] | null): boolean {
  // 有任务在跑 ⇒ 永不因空闲过期；空闲计时只看 last_activity_at。
  if (s.active_job_id) return false;
  // ⚠️ 便宜的判据**先**过 —— 绝大多数会话到不了下面那步（也就不会去扫 CLI 登记项）。
  if (now - s.last_activity_at < CC_IDLE_TTL_MS) return false;
  // ★ [T-149-cc] **CLI 侧也在跑 ⇒ 同样不算过期**。
  //   与 `claudeBgSession.sweepIdleBackgroundSessions`（真正杀进程的那套）共用**同一个判据**
  //   ⇒ 两套 TTL 不再各判各的（原先：有保护的这套不杀进程，杀进程的那套没保护）。
  if (isClaudeSessionBusy({ sessionId: s.session_id, records })) return false;
  return true;
}

/** 批量判时预加载 CLI 登记项（避免逐个扫盘）。 */
function loadSessionRecords(): ClaudeSessionRecord[] | null {
  try {
    return listClaudeSessions();
  } catch {
    return null;
  }
}

/** 内部：清掉过期项，返回是否写过文件。 */
function sweepExpired(now: number): boolean {
  const state = readState();
  const records = loadSessionRecords();
  const kept = state.sessions.filter((s) => !isExpired(s, now, records));
  if (kept.length === state.sessions.length) return false;
  writeState({ version: 1, sessions: kept });
  return true;
}

/**
 * 给 `pc_cc_new` 取/建一个常驻 session_id。
 *
 * - 参数里给了可复用的 session_id 且登记仍有效 ⇒ 复用并 touch。
 * - 参数里给了 session_id 但**登记里没有** ⇒ **用这个 id 建记录**（见下方 ⛔）。
 * - 完全没给 id ⇒ 新建 UUID 并登记。
 *
 * ⛔ [T-128b · 真机缺陷 1] 传了 id 却**另起一个随机 UUID** 是错的：
 *   `pcCcNewBg` 拿到的是 **CLI 真实 sessionId**（`claude agents --json` 里的那个），
 *   它同时是这个会话在 `~/.claude/sessions/<pid>.json` 里的身份
 *   ⇒ 记录里的 id 必须**就是它**，否则：
 *     · 模型拿到的 id 在 `pc_cc_read`/`pc_cc_send`/`pc_cc_close` 一律「会话不在本机运行中」；
 *     · `setPersistentSessionBgId(真实 id, bgId)` 按真实 id 找记录 ⇒ 找不到 ⇒ `bg_id` 永远 null
 *       ⇒ `pc_cc_close` 只能删登记、停不掉 CLI 进程 ⇒ **常驻进程泄漏**。
 *   （真机实测：模型拿到 `512e3f2d…`，真实会话是 `f8026214-0689-…`。）
 */
export function acquirePersistentSession(args: {
  session_id?: unknown;
  cwd?: string | null;
  name?: unknown;
  now?: number;
}): { session_id: string; reused: boolean; cwd: string | null } {
  const now = args.now ?? Date.now();
  sweepExpired(now);
  const state = readState();
  const wanted = typeof args.session_id === 'string' && args.session_id.trim() ? args.session_id.trim() : null;
  if (wanted) {
    const hit = state.sessions.find((s) => s.session_id === wanted);
    if (hit && !isExpired(hit, now)) {
      hit.last_activity_at = now;
      hit.cwd = args.cwd ?? hit.cwd;
      if (typeof args.name === 'string' && args.name) hit.name = args.name;
      writeState(state);
      return { session_id: hit.session_id, reused: true, cwd: hit.cwd };
    }
    // ★ [T-128b] 传了 id 但登记里没有 ⇒ **用传入的 id 建记录**（不再 randomUUID）。
    const rec: CcPersistentSession = {
      session_id: wanted,
      cwd: args.cwd ?? null,
      name: typeof args.name === 'string' && args.name ? args.name : null,
      created_at: now,
      last_activity_at: now,
      active_job_id: null,
    };
    state.sessions.push(rec);
    writeState(state);
    return { session_id: rec.session_id, reused: false, cwd: rec.cwd };
  }
  const rec: CcPersistentSession = {
    session_id: randomUUID(),
    cwd: args.cwd ?? null,
    name: typeof args.name === 'string' && args.name ? args.name : null,
    created_at: now,
    last_activity_at: now,
    active_job_id: null,
  };
  state.sessions.push(rec);
  writeState(state);
  return { session_id: rec.session_id, reused: false, cwd: rec.cwd };
}

/** 设置 CLI 原生 bg_id（pc_cc_new 从 `claude agents --json` 解析出来后写入）。 */
export function setPersistentSessionBgId(sessionId: string, bgId: string, now: number = Date.now()): void {
  const state = readState();
  const hit = state.sessions.find((s) => s.session_id === sessionId);
  if (!hit) return;
  hit.bg_id = bgId;
  hit.last_activity_at = now;
  writeState(state);
}

/** 取常驻登记（close 时要拿 bg_id）。 */
export function getPersistentSession(sessionId: string): CcPersistentSession | null {
  return readState().sessions.find((s) => s.session_id === sessionId) || null;
}

export function setPersistentSessionJob(sessionId: string, jobId: string | null, now: number = Date.now()): void {
  const state = readState();
  const hit = state.sessions.find((s) => s.session_id === sessionId);
  if (!hit) return;
  hit.active_job_id = jobId;
  hit.last_activity_at = now;
  writeState(state);
}

/** touch 活动时间（pc_cc_send/append/control 调用成功时）。 */
export function touchPersistentSession(sessionId: string, now: number = Date.now()): void {
  const state = readState();
  const hit = state.sessions.find((s) => s.session_id === sessionId);
  if (!hit) return;
  hit.last_activity_at = now;
  writeState(state);
}

/** 是否仍是一条有效常驻会话（未过期、未被 close）。 */
export function isPersistentSessionActive(sessionId: string, now: number = Date.now()): boolean {
  sweepExpired(now);
  const state = readState();
  const hit = state.sessions.find((s) => s.session_id === sessionId);
  return !!hit && !isExpired(hit, now);
}

/** 列出当前有效常驻会话。 */
export function listPersistentSessions(now: number = Date.now()): CcPersistentSession[] {
  sweepExpired(now);
  const records = loadSessionRecords();
  return readState().sessions.filter((s) => !isExpired(s, now, records));
}

/** PC-CC-Close：显式关闭登记；返回是否存在并被移除。 */
export function closePersistentSession(sessionId: string): CcPersistentSession | null {
  const state = readState();
  const hit = state.sessions.find((s) => s.session_id === sessionId) || null;
  if (!hit) return null;
  const next = state.sessions.filter((s) => s.session_id !== sessionId);
  writeState({ version: 1, sessions: next });
  return hit;
}

/**
 * ★ [T-128-fix] 空闲巡检：返回已经过期的常驻会话，并把它们从登记里移除。
 *   调用方拿到 bg_id 后执行 `claude stop <bg_id>`。
 */
export function takeExpiredPersistentSessions(now: number = Date.now()): CcPersistentSession[] {
  const state = readState();
  const records = loadSessionRecords();
  const expired = state.sessions.filter((s) => isExpired(s, now, records));
  if (!expired.length) return [];
  writeState({ version: 1, sessions: state.sessions.filter((s) => !isExpired(s, now, records)) });
  return expired;
}

/** 测试专用：清空文件。 */
export function _resetPersistentSessionsForTest(): void {
  try { fs.unlinkSync(stateFile()); } catch { /* ignore */ }
}
