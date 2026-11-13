/**
 * electron/client-tools/jobView.ts —— **后台作业的「视图层」**（订正 27 · B6）
 *
 * ## 这一层解决什么
 *
 *   · `localJobs.ts`（B5）里的 `LocalJob` 是**作业侧**的内部形状
 *     （有 pid / 输出偏移 / argv …）；
 *   · `shared/types.ts` 里的 `LocalJobInfo` 是**给渲染层看**的形状
 *     （人类可读的名字 / 三态 / 摘要）。
 *
 * ⇒ 这一层做「内部形状 → 界面形状」的翻译 + **作业变化的事件广播**
 *   （渲染层靠 `onJobs` 订阅；B7 那半的 UI 就靠它刷新）。
 *
 * ## ⚠️ 事件广播为什么在**主进程**
 *
 * 作业状态是**主进程**的事实（进程死没死、日志读到哪了）⇒
 * 渲染层刷新/重开窗口不该让「作业还在跑」这件事失忆。
 */

import type { LocalJobInfo } from '../../shared/types';
import { getCliService } from './cliService.ts';
import { listJobs } from './localJobs.ts';
import type { LocalJob } from './localJobs.ts';

/** 内部形状 → 界面形状。 */
export function toJobInfo(job: LocalJob): LocalJobInfo {
  const svc = getCliService(job.serviceId);
  return {
    id: job.id,
    serviceId: job.serviceId,
    // 人话名字（`Claude Code` / `普通命令`）；服务没注册就退回 id（不瞎猜）。
    title: svc ? svc.title : job.serviceId,
    status: job.status,
    startedAt: job.startedAt,
    settledAt: job.settledAt ?? null,
    pid: job.pid ?? null,
    summary: job.summary ?? null,
  };
}

/** 全部作业（按开始时间**倒序** —— 新的在上面）。 */
export function listJobInfos(): LocalJobInfo[] {
  return listJobs()
    .map(toJobInfo)
    .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
}

// ===========================================================================
// 变化广播
// ===========================================================================

type JobsListener = (jobs: LocalJobInfo[]) => void;

const _listeners = new Set<JobsListener>();

/** 订阅「作业列表变了」。返回取消订阅的函数。 */
export function onJobsChanged(cb: JobsListener): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

/**
 * 广播「作业列表变了」。
 *
 * ⚠️ 列表**只算一次**再分发给所有订阅者（订阅者可能有好几个）。
 */
export function emitJobsChanged(): void {
  if (!_listeners.size) return;
  let jobs: LocalJobInfo[];
  try {
    jobs = listJobInfos();
  } catch (e) {
    console.error('[client-tools/jobs] 作业列表读取失败:', e && (e as Error).message);
    return;
  }
  for (const cb of _listeners) {
    try { cb(jobs); } catch (_) { /* 一个订阅者炸了不许影响别人 */ }
  }
}
