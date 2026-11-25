/**
 * electron/client-tools/ccAutoClosed.ts —— 「被空闲巡检自动关掉」的**墓碑**（T-149-cc）
 *
 * ## 为什么需要它
 *
 * `claude stop` 杀掉一个正在干活的 Claude Code 会话时，**没有任何一方知道它是被谁杀的**：
 *
 * - CLI 进程退出 ⇒ 它自己的登记文件 `~/.claude/sessions/<pid>.json` 被删除
 * - ⇒ `claudeCodeResultWatcher` 的 `findRecord()` 返回 null
 * - ⇒ watcher 的「会话变 idle ⇒ 那段正文就是结果」兜底分支**永不触发**
 * - ⇒ 只能**干等到 600s 超时**，报的还是「等待结果超时」
 * - ⇒ 用户/Cody 看到的是「agent 凭空消失」，**归因完全丢失**
 *   （2026-11-25 小米健康 agent 就是这么死的：活了 5 分 7 秒，被误杀，一句交代都没有）
 *
 * ⇒ 本模块在**停之前**留一条墓碑 ⇒ watcher 能立刻收场，并给出**准确原因**。
 *
 * ## 它不是什么
 *
 * - **不是**作业状态机 —— 端侧 Claude Code 的任务**不进** `localJobs`/`jobReporter`/D3 上行
 *   （见 `claudeCodeResultWatcher.ts` 头注释）。
 * - **不是**审计日志 —— 只保留最近的少量条目，用于「刚刚是不是被自动关掉了」这一问。
 */

import * as fs from 'fs';
import * as path from 'path';
import { userDataDir } from './localJobs.ts';

const STATE_FILE_NAME = 'cc-auto-closed-sessions.json';

/** 墓碑保留多久（毫秒）—— 超过就清掉。 */
export const AUTO_CLOSED_TTL_MS = 24 * 60 * 60 * 1000;

/** 最多留多少条。 */
const MAX_ENTRIES = 50;

/** 一条墓碑。 */
export interface AutoClosedRecord {
  /** 被关掉的会话 id（CLI 的 sessionId）。 */
  sessionId: string;
  /** `claude stop` 用的 bg id。 */
  bgId: string | null;
  /** 关掉的时刻（epoch ms）。 */
  at: number;
  /** 原因。`idle_sweep` = 被空闲巡检回收；`explicit` = 被 `pc_cc_close` 显式关闭。 */
  reason: 'idle_sweep' | 'explicit';
  /**
   * ★ [T-154-cc] 被关掉那一刻的 transcript 路径。
   *
   * 为什么加：**结论可能就在那份 transcript 里** ——
   * 2026-11-25 事故（业务会话 1192 / 常驻会话 `b0f8568c…`）就是
   * 「结果没投回服务端 + 巡检把会话一关 ⇒ 唯一副本没了」；
   * 有了这个路径，至少还能**人工捞回来**。
   */
  transcriptPath?: string | null;
}

interface StateFile {
  version: 1;
  entries: AutoClosedRecord[];
}

function stateFile(): string {
  return path.join(userDataDir(), STATE_FILE_NAME);
}

function readState(): StateFile {
  try {
    const raw = fs.readFileSync(stateFile(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) return { version: 1, entries: [] };
    return {
      version: 1,
      entries: parsed.entries.filter(
        (e: any) => e && typeof e.sessionId === 'string' && e.sessionId && typeof e.at === 'number',
      ),
    };
  } catch {
    return { version: 1, entries: [] };
  }
}

function writeState(state: StateFile): void {
  try {
    fs.mkdirSync(userDataDir(), { recursive: true });
  } catch {
    /* 目录建不出来就放弃写墓碑 —— 不能因为写墓碑失败而挡住「停会话」 */
  }
  const tmp = `${stateFile()}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(tmp, stateFile());
  } catch {
    /* 写失败就算了 —— 墓碑只是「归因增强」，不是必需品 */
  }
}

/** 记一条墓碑（停会话**之前**调）。 */
export function markAutoClosed(rec: {
  sessionId: string;
  bgId?: string | null;
  at?: number;
  reason?: 'idle_sweep' | 'explicit';
  /** ★ [T-154-cc] transcript 路径（结论可能还在里面）。 */
  transcriptPath?: string | null;
}): void {
  if (!rec || !rec.sessionId) return;
  const now = rec.at ?? Date.now();
  const state = readState();
  const entries = state.entries.filter((e) => e.sessionId !== rec.sessionId);
  entries.push({
    sessionId: rec.sessionId,
    bgId: rec.bgId ?? null,
    at: now,
    reason: rec.reason ?? 'idle_sweep',
    ...(rec.transcriptPath ? { transcriptPath: rec.transcriptPath } : {}),
  });
  // 只留最近的若干条 + 未过期的
  const kept = entries
    .filter((e) => now - e.at < AUTO_CLOSED_TTL_MS)
    .slice(-MAX_ENTRIES);
  writeState({ version: 1, entries: kept });
}

/** 查某个会话是不是刚被自动关掉了（没关过 ⇒ null）。 */
export function findAutoClosed(sessionId: string, now: number = Date.now()): AutoClosedRecord | null {
  if (!sessionId) return null;
  const hit = readState().entries.find((e) => e.sessionId === sessionId);
  if (!hit) return null;
  if (now - hit.at >= AUTO_CLOSED_TTL_MS) return null;
  return hit;
}

/** 列出全部未过期的墓碑（诊断用）。 */
export function listAutoClosed(now: number = Date.now()): AutoClosedRecord[] {
  return readState().entries.filter((e) => now - e.at < AUTO_CLOSED_TTL_MS);
}

/** 测试专用：清空。 */
export function _resetAutoClosedForTest(): void {
  try {
    fs.unlinkSync(stateFile());
  } catch {
    /* ignore */
  }
}
