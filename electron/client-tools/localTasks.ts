/**
 * electron/client-tools/localTasks.ts —— **本机定时任务**
 *
 * [2026-11-12 · P7] gaga 拍板：定时任务**只在 Gacode 打开时跑**
 * （**不写** Windows 计划任务 —— 那种做法会绕过本机的闸门与审计）。
 *
 * ## 为什么定时器在主进程
 *
 *   · 主进程活得久（渲染层刷新/切页不该让定时任务停）；
 *   · 它是「这台电脑上有没有人开着 Gacode」这个事实的持有者；
 *   · 跑一轮对话要走 access token —— 主进程已经有一份（渲染层推过来的）。
 *
 * ## 任务跑起来是什么
 *
 *   「到点了 ⇒ 在一个**专用会话**里发一条 user 消息 ⇒ 跑完这一轮」。
 *   ⛔ **绝不复用**服务端的 `scheduled === true`（那个是「审批直接放行」的旁路，
 *      L-24k 明确不许端侧定时任务用它）⇒ 这里发的是**普通**的一轮，
 *      审批语义与用户手动提问完全一样。
 *
 * ## 错过的时间点**不补跑**
 *
 *   Gacode 关着的时候到点了 ⇒ 这一轮就**错过**（不补跑）。
 *   ⇒ 补跑意味着「你回来时电脑突然开始干活」，那是惊吓，不是自动化。
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { app } from 'electron';
import { nextCronTime, parseCron } from './cron';
import { createSession, runTurn } from './localChat';

/** 一条本机定时任务。 */
export interface LocalTask {
  id: string;
  /** 任务名（会话标题也用它）。 */
  name: string;
  /** 5 段 cron 表达式（分 时 日 月 周）。 */
  cron: string;
  /** 到点时发的那条 user 消息。 */
  prompt: string;
  enabled: boolean;
  /** 专用会话 id（第一次跑时创建，之后复用）。 */
  sessionId: string | null;
  lastRunAt: number | null;
  nextRunAt: number | null;
  /** 上次跑失败的原因（成功时置 null）。 */
  lastError: string | null;
}

/** 任务的存储文件。 */
export function tasksFile(): string {
  return path.join(app.getPath('userData'), 'local-tasks.json');
}

/** tick 间隔（毫秒）—— 30 秒足够准（cron 最小粒度是分钟）。 */
const TICK_MS = 30_000;

class LocalTaskScheduler {
  private tasks: LocalTask[] = [];
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  /** 拿 access token 的入口（由 IPC 层接到 deviceClient 上）。 */
  private tokenProvider: (() => string | null) | null = null;

  private load(): void {
    try {
      const raw = fs.readFileSync(tasksFile(), 'utf8');
      const parsed = JSON.parse(raw);
      this.tasks = Array.isArray(parsed && parsed.tasks) ? parsed.tasks : [];
    } catch (_) {
      this.tasks = [];
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(app.getPath('userData'), { recursive: true });
      fs.writeFileSync(tasksFile(), JSON.stringify({ version: 1, tasks: this.tasks }, null, 2), 'utf8');
    } catch (e) {
      console.error('[client-tools/tasks] 落盘失败:', e && (e as Error).message);
    }
  }

  /** 装上 token 来源并开始 tick。 */
  start(tokenProvider: () => string | null): void {
    this.tokenProvider = tokenProvider;
    this.load();
    this.recomputeNextRuns();
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.tick();
    }, TICK_MS);
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  list(): LocalTask[] {
    return this.tasks.map((t) => ({ ...t }));
  }

  /** 新增 / 改一条。 */
  upsert(input: Partial<LocalTask> & { cron: string; prompt: string }): LocalTask {
    const existing = input.id ? this.tasks.find((t) => t.id === input.id) : null;
    if (!parseCron(input.cron)) {
      throw new Error(`cron 表达式不合法: ${input.cron}`);
    }
    const task: LocalTask = {
      id: existing?.id || randomUUID(),
      name: (input.name || existing?.name || '本机定时任务').slice(0, 60),
      cron: input.cron,
      prompt: input.prompt,
      enabled: input.enabled ?? existing?.enabled ?? true,
      sessionId: existing?.sessionId ?? null,
      lastRunAt: existing?.lastRunAt ?? null,
      nextRunAt: null,
      lastError: null,
    };
    task.nextRunAt = this.computeNext(task, new Date());
    if (existing) {
      this.tasks = this.tasks.map((t) => (t.id === task.id ? task : t));
    } else {
      this.tasks.push(task);
    }
    this.save();
    return task;
  }

  remove(id: string): boolean {
    const before = this.tasks.length;
    this.tasks = this.tasks.filter((t) => t.id !== id);
    if (this.tasks.length !== before) {
      this.save();
      return true;
    }
    return false;
  }

  /** 立刻跑一次（不等 cron）。 */
  async runNow(id: string): Promise<{ ok: boolean; error: string | null }> {
    const task = this.tasks.find((t) => t.id === id);
    if (!task) return { ok: false, error: '任务不存在' };
    const err = await this.runTask(task);
    return { ok: !err, error: err };
  }

  /** 到点检查。 */
  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const now = Date.now();
      const due = this.tasks.filter(
        (t) => t.enabled && t.nextRunAt != null && t.nextRunAt <= now,
      );
      for (const task of due) {
        // 先把 nextRunAt 推进到下一次 ⇒ 跑的过程中再 tick 也不会重复跑。
        task.nextRunAt = this.computeNext(task, new Date());
        this.save();
        await this.runTask(task);
      }
    } finally {
      this.running = false;
    }
  }

  /** 跑一条任务（建会话 → 发一轮 → 记账）。 */
  private async runTask(task: LocalTask): Promise<string | null> {
    const token = this.tokenProvider ? this.tokenProvider() : null;
    if (!token) {
      task.lastError = '未登录（没有 access token）';
      this.save();
      return task.lastError;
    }
    try {
      if (!task.sessionId) {
        const sid = await createSession(task.name, token);
        if (!sid) {
          task.lastError = '建会话失败';
          this.save();
          return task.lastError;
        }
        task.sessionId = sid;
        this.save();
      }
      const r = await runTurn(task.sessionId, task.prompt, token);
      task.lastRunAt = Date.now();
      task.lastError = r.ok ? null : (r.error || '这一轮没跑完');
      this.save();
      return task.lastError;
    } catch (e) {
      task.lastRunAt = Date.now();
      task.lastError = (e as Error).message;
      this.save();
      return task.lastError;
    }
  }

  /** 下一次命中的时刻。 */
  private computeNext(task: LocalTask, from: Date): number | null {
    const d = nextCronTime(task.cron, from);
    return d ? d.getTime() : null;
  }

  /** 启动 / 改完表达式后重算所有 nextRunAt。 */
  private recomputeNextRuns(): void {
    const now = new Date();
    for (const t of this.tasks) {
      t.nextRunAt = t.enabled ? this.computeNext(t, now) : null;
    }
    this.save();
  }
}

export const localTasks = new LocalTaskScheduler();
