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
// ★ [T-149-cc] 「在不在跑」的唯一真源 + 自动关闭墓碑。
import { isClaudeSessionBusy } from './ccSessionBusy.ts';
import { markAutoClosed } from './ccAutoClosed.ts';

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
    //
    // ★ [T-128b] `killSignal: 'SIGKILL'` —— **必须**强杀：
    //   `execFileSync` 的 `timeout` 只发 SIGTERM ⇒ 若子进程**不响应 SIGTERM**
    //   （实测：`claude agents --json` 在会话正在被停掉时会挂住），
    //   这个**同步**调用会把 electron 主线程**无限期卡住** ⇒
    //   ① 工具调用永不返回 ⇒ D3 回执发不出去 ⇒ 服务端判 `client_no_response`；
    //   ② 整个 App 的主线程冻住（定时器 / SSE 读帧全停）。
    //   ⇒ 改成 SIGKILL：超时即必杀，**最多卡 15s 不会更久**。
    out = execFileSync(bin, ['agents', '--json'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
      killSignal: 'SIGKILL',
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

/**
 * ★ [T-128b] **异步**列后台会话（`claude agents --json`）。
 *
 * ## 为什么必须有异步版
 *
 * `execFileSync` 是**同步阻塞**的 ⇒ 它跑在 electron **主进程**里
 * ⇒ 一次调用就把主线程冻住（实测 0.5~2.5s，CLI 挂住时可达 15s）
 * ⇒ 定时器 / SSE 读帧 / IPC 全停 ⇒ 用户看到「App 卡住」，
 * 而且**派单帧读不到** ⇒ 工具迟迟不执行 ⇒ 回执超时。
 *
 * ⚠️ 老问题（真机 2026-11-24 顺带发现）：空闲巡检**每 7 秒**就会同步跑一次
 *   ⇒ 每 7 秒冻一次主线程。
 *
 * ⇒ 巡检改用这个异步版 ⇒ 主线程不再被 CLI 调用卡住。
 */
export function listClaudeBgSessionsAsync(cli?: string): Promise<ClaudeBgSessionInfo[]> {
  const bin = cli || resolveClaudeBinary();
  if (!bin) return Promise.resolve([]);
  return new Promise((resolve) => {
    let out = '';
    let settled = false;
    const done = (arr: ClaudeBgSessionInfo[]) => {
      if (settled) return;
      settled = true;
      resolve(arr);
    };
    try {
      const child = spawn(bin, ['agents', '--json'], {
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true,
      });
      const killTimer = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch (_) { /* ignore */ }
        done([]);
      }, 15000);
      child.stdout?.on('data', (d: any) => { out += d.toString(); });
      child.on('error', () => { clearTimeout(killTimer); done([]); });
      child.on('close', () => {
        clearTimeout(killTimer);
        let arr: any[];
        try { arr = JSON.parse(out || '[]'); } catch { return done([]); }
        if (!Array.isArray(arr)) return done([]);
        done(
          arr
            .filter((x) => x && typeof x.sessionId === 'string' && x.sessionId && x.kind === 'background')
            .map((x) => ({
              id: String(x.id || String(x.sessionId).split('-')[0]),
              sessionId: String(x.sessionId),
              name: typeof x.name === 'string' ? x.name : null,
              cwd: typeof x.cwd === 'string' ? x.cwd : null,
              kind: String(x.kind ?? ''),
              status: typeof x.status === 'string' ? x.status : null,
              state: typeof x.state === 'string' ? x.state : null,
            })),
        );
      });
    } catch {
      done([]);
    }
  });
}

/** 空闲多久算过期（毫秒）—— 与常驻会话表的 TTL 一致。 */
export const BG_IDLE_TTL_MS = 5 * 60 * 1000;

/**
 * ★ [T-149-cc] 「这个 bg 会话该不该因为空闲被停掉」的**纯判据**（可单测，无 IO）。
 *
 * ## 判据顺序（为什么是这个顺序）
 *
 * 1. **登记项都没有 ⇒ 不停**（连状态都不知道，别乱杀）
 * 2. **在跑 ⇒ 永不停**（`isClaudeSessionBusy`：认 CLI 报的 `status`）
 *    ⇒ ★ 这一条是本次事故的修复核心：`updatedAt` 冻结 **≠** 空闲
 * 3. `updatedAt` 缺失 ⇒ 不停（信息不足）
 * 4. 最后才看 `updatedAt` 距今是否超过 TTL —— 它**降级为兜底**判据
 *
 * @param rec   CLI 登记项（`~/.claude/sessions/<pid>.json` 的一条）
 * @param status `claude agents --json` 的 `status`
 * @param state  `claude agents --json` 的 `state`（实测该 CLI 版本不吐，保留兼容）
 */
export function shouldStopIdleBgSession(opts: {
  rec: { updatedAt?: number | null; status?: string | null } | null;
  status?: string | null;
  state?: string | null;
  now: number;
  ttlMs: number;
}): boolean {
  const { rec, status, state, now, ttlMs } = opts;
  if (!rec) return false;
  // ② 在跑 ⇒ 永不停。
  if (isClaudeSessionBusy({ rec, status, state })) return false;
  // ③ 信息不足 ⇒ 不停。
  const last = typeof rec.updatedAt === 'number' ? rec.updatedAt : 0;
  if (!last) return false;
  // ④ 兜底：真的很久没动静了。
  return now - last >= ttlMs;
}

/**
 * 扫本机**后台会话**（`claude --bg`），把空闲超过 TTL 的停掉。
 *
 * ## ⚠️ 判据（2026-11-25 · T-149-cc 重写）
 *
 * **原来的判据是错的**（原注释断言「正在跑的任务会持续更新 `updatedAt` ⇒ 不会被误杀」）：
 * `updatedAt` 跟踪的是「**最后收到一条消息**」，**不是「工作量」**。
 * 一个 bg 会话跑单个长任务时**只收到 1 次投递** ⇒ `updatedAt` 从那一刻起就冻结
 * ⇒ **任务一超过 5 分钟就必然被判过期并被杀**。
 * （实测事故：小米健康 agent 活了 5 分 7 秒被杀，死时正在跑工具，无任何回报。）
 *
 * ⇒ 现在**先判「在不在跑」**（`isClaudeSessionBusy`，唯一真源在 `ccSessionBusy.ts`）：
 * **在跑 ⇒ 永不因空闲被杀**；`updatedAt` 降级为**兜底**判据。
 * ⇒ 判「在不在跑」认的是 **CLI 自己报的 `status`**（实测干活期间全程 `busy`，
 * 而 `updatedAt` 同一时刻一动不动）。
 *
 * ★ [T-128b] **异步**（列会话那步用 `execFile` 而不是 `execFileSync`）
 *   ⇒ 不再每 7 秒把 electron 主线程冻一次。
 *
 * ★ [T-149-cc] **停之前留墓碑**（`ccAutoClosed.ts`）⇒
 *   watcher 能立刻知道「这个会话是被空闲巡检关掉的」并给出准确归因，
 *   而不是干等 600s 超时后报一句「等待结果超时」。
 *
 * @returns 停掉的会话数（Promise）
 */
export async function sweepIdleBackgroundSessions(
  ttlMs: number = BG_IDLE_TTL_MS,
  now: number = Date.now(),
): Promise<number> {
  const sessions = await listClaudeBgSessionsAsync();
  let stopped = 0;
  for (const s of sessions) {
    const rec = findSession(s.sessionId);
    if (!shouldStopIdleBgSession({ rec, status: s.status, state: s.state, now, ttlMs })) continue;
    const bgId = s.id || s.sessionId.split('-')[0];
    // ★ [T-149-cc] 先留墓碑再停 ⇒ 归因不丢（写失败不挡停会话）。
    markAutoClosed({ sessionId: s.sessionId, bgId, at: now, reason: 'idle_sweep' });
    void stopClaudeBgSession(bgId).then((ok) => {
      if (ok) stopped += 1;
    });
  }
  return stopped;
}
