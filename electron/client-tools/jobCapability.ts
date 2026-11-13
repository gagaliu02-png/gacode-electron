/**
 * electron/client-tools/jobCapability.ts —— 后台作业执行器的**实测探针** + 能力串拼装
 *
 * [2026-11-13 · 订正 27 · B6] 契约依据：附录 **L-27j**（能力键 `job` 挂在 `client-tools` 总闸下）。
 *
 * ## 能力键 `job` 的判据是什么
 *
 * L-27j 说的是「显式声明**这台 PC 装了后台作业执行器**」⇒ 判据 = **执行器在不在**。
 *
 * ⚠️ **执行器是本 app 内建的**（`jobRunner` + CLI 服务注册表）⇒ **新版 PC 恒定声明 `job=1`**。
 *
 * ⛔ **不许**把「有没有装 Claude Code」绑进这个判据：
 *   服务端 `pc_claude` 与 `pc_job_start` **共用** `job` 这一个键
 *   （`gaclaw/src/llm/client-tools.js`：四个 spec 的 `capabilities` 都是 `[client-tools, job]`）
 *   ⇒ 按 claude 决定的话，「没装 claude 但能跑普通命令」的电脑会连 `pc_job_start`
 *   也一起被挡掉（白白少一个能力）。
 *   ⇒ 「没装 claude」的正确语义是**作业如实失败并回报**
 *   （服务端 spec 明写：the job fails with that error — report it to the user）。
 *
 * ## 那这个探针干什么用
 *
 * **诊断**：这台机器能不能真的起进程（万一被什么策略挡了，后台作业会起不来）
 * ⇒ 探针没过就**记一条日志**，不瞒着；**不参与**能力判定。
 */

import { spawnSync } from 'child_process';
import { pickShell } from './proc.ts';

/** 探针超时（毫秒）—— 探针**不许**把设备注册卡住。 */
export const PROBE_TIMEOUT_MS = 5000;

/** 探针用的那条命令（无害：只回显一个标记串）。 */
const PROBE_COMMAND = 'echo gacode-job-probe';

/** 探针结果。 */
export interface JobCapabilityProbe {
  /** 这台机器能不能起进程。 */
  executor: boolean;
  /** 人话说明（诊断 / 日志）。 */
  reason: string;
}

/**
 * ★ **实测**：这台电脑能不能起进程（= 后台作业那条路通不通）。
 *
 * 做法 = 走后台作业那条路的**同一条**命令通道（shell + spawn + 拿 stdout）
 * 跑一条最轻的命令。
 *
 * ⚠️ 探针失败**不许**抛异常 —— 探针只是「如实报告」，失败就报 false。
 */
export function probeJobExecutor(): JobCapabilityProbe {
  let shell: { file: string; args: (command: string) => string[] };
  try {
    shell = pickShell();
  } catch (e) {
    return { executor: false, reason: `选不出 shell: ${(e as Error).message}` };
  }
  if (!shell || !shell.file) {
    return { executor: false, reason: '选不出 shell' };
  }
  try {
    const r = spawnSync(shell.file, shell.args(PROBE_COMMAND), {
      encoding: 'utf8',
      timeout: PROBE_TIMEOUT_MS,
      windowsHide: true,
    });
    if (r.error) {
      return { executor: false, reason: `探针跑不起来: ${r.error.message}` };
    }
    const out = String(r.stdout || '');
    if (r.status !== 0 || !out.includes('gacode-job-probe')) {
      return {
        executor: false,
        reason: `探针没跑通（退出码 ${r.status}，输出 ${JSON.stringify(out.slice(0, 80))}）`,
      };
    }
    return { executor: true, reason: `探针跑通（${shell.file}）` };
  } catch (e) {
    return { executor: false, reason: `探针异常: ${(e as Error).message}` };
  }
}

/**
 * 拼能力串（注册时上报给服务端）。
 *
 * ⚠️ **顺序与老串保持一致**（`client-tools=1,pty=1,fs=1,screen=1,os=1`），
 *    `job=1` 追加在最后 ⇒ 老能力表逐字不变，只是多一个键。
 *
 * @param flags `pty` = node-pty 能不能用；`job` = 要不要声明后台作业执行器。
 */
export function buildCapabilityString(flags: { pty: boolean; job: boolean }): string {
  const parts = ['client-tools=1'];
  if (flags.pty) parts.push('pty=1');
  parts.push('fs=1', 'screen=1', 'os=1');
  // ★ L-27j：后台作业执行器可用 ⇒ 额外声明 `job=1`。
  if (flags.job) parts.push('job=1');
  return parts.join(',');
}
