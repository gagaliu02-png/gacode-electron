/**
 * electron/client-tools/ccSessionBusy.ts —— 「这个 Claude Code 会话**在不在跑**」的**唯一判据**
 *
 * ## 为什么要有这个模块（T-149-cc）
 *
 * 仓库里有**两套 5 分钟 TTL**，原先各判各的：
 *
 * | | `ccPersistentSession.ts` | `claudeBgSession.ts` |
 * |---|---|---|
 * | 判据 | `!active_job_id && now - last_activity_at >= TTL` | `now - updatedAt >= TTL` |
 * | 动作 | 只删登记条目 | **真 `claude stop` 杀进程** |
 *
 * ⇒ **有保护的那套不杀进程，杀进程的那套没有保护。**
 *
 * ## 本次事故的直接成因
 *
 * `claudeBgSession.sweepIdleBackgroundSessions` 拿 `updatedAt` 当「空闲」判据，
 * 注释里断言「**正在跑的任务会持续更新它 ⇒ 不会被误杀**」。
 *
 * ⛔ **那个前提是错的**（2026-11-25 实测）：
 * `updatedAt` 跟踪的是「**最后收到一条消息**」，**不是「工作量」**。
 * 一个 `claude --bg` 会话跑单个长任务时**只收到 1 次投递** ⇒
 * `updatedAt` 从投递那一刻起就冻结 ⇒ 任务一超过 5 分钟就**必然**被判过期并被杀。
 * （实测：采样器跑一条 32 秒长命令期间，`status` 全程 `busy` 而 `updatedAt` 一动不动。）
 *
 * ⇒ 真正的忙闲信号是 **CLI 自己报的 `status`**（`busy` / `running` / `thinking`）。
 *
 * ## 本模块的契约
 *
 * 1. **只认 CLI 报的 status** —— 那是唯一被实测证明「干活期间保持正确」的信号。
 * 2. ⛔ **不把 `waitingFor` 算作忙** ⇒ 不改变 T-128 原有的「会话在等用户时照样回收」语义。
 * 3. 两套 TTL 都调它 ⇒ 「在不在跑」只有一个真源。
 */

import { listClaudeSessions, type ClaudeSessionRecord } from './claudeCodeSession.ts';

/**
 * CLI 报「正在处理」的状态值。
 *
 * ⚠️ 目前只实测到 `busy`（`claude agents --json` 与 `~/.claude/sessions/<pid>.json` 都用它）。
 * 另两个是防御性的 —— 宁可**多跳过一个**也不误杀。
 */
export const CC_BUSY_STATUSES = new Set(['busy', 'running', 'thinking']);

/** 某个 status 值算不算「在跑」。 */
export function isBusyStatus(status: unknown): boolean {
  return CC_BUSY_STATUSES.has(String(status ?? '').trim().toLowerCase());
}

/** 判「在不在跑」时能拿到的各种来源。 */
export interface BusyProbe {
  /** 目标会话 id —— 给了就去 CLI 登记项里查（除非已传 `rec`）。 */
  sessionId?: string | null;
  /** 已拿到的 CLI 登记项（`~/.claude/sessions/<pid>.json` 的一条）。 */
  rec?: { status?: string | null; waitingFor?: string | null } | null;
  /** `claude agents --json` 里的 `status`。 */
  status?: string | null;
  /** `claude agents --json` 里的 `state`（实测该 CLI 版本**不吐这个字段**，保留兼容）。 */
  state?: string | null;
  /** 预加载的登记项列表 —— 批量判时传进来，避免逐个扫盘。 */
  records?: ClaudeSessionRecord[] | null;
}

/**
 * 这个会话**在不在跑**（正在处理 / 生成 / 思考）。
 *
 * ⚠️ 「**不忙**」**不等于**「空闲」—— 它只说明「CLI 没在说自己在忙」。
 * 「该不该回收」还需要别的判据（`updatedAt` 等），由调用方决定。
 */
export function isClaudeSessionBusy(probe: BusyProbe): boolean {
  if (isBusyStatus(probe.rec?.status)) return true;
  if (isBusyStatus(probe.status)) return true;
  if (isBusyStatus(probe.state)) return true;

  const sid = probe.sessionId ? String(probe.sessionId) : '';
  if (sid) {
    const records = probe.records ?? listClaudeSessions();
    const hit = records.find((s) => s && s.sessionId === sid);
    if (hit && isBusyStatus(hit.status)) return true;
  }
  return false;
}
