/**
 * electron/client-tools/backgroundJobs.ts —— **后台作业的四个分支**（订正 27 · L-27a/L-27i）
 *
 * | 工具 | 分支 | 语义 |
 * |---|---|---|
 * | `pc_claude` | 起作业 | 在本机跑 **Claude Code**（detached）⇒ **立即返回** |
 * | `pc_job_start` | 起作业 | 在本机跑**普通命令**（detached）⇒ **立即返回** |
 * | `pc_job_status` | 查状态 | 从**本地作业表**回答（同步，短超时） |
 * | `pc_job_stop` | 停作业 | 杀进程树（同步，短超时） |
 *
 * ## ⚠️ 为什么「起作业」是**立即返回**
 *
 * 同步端侧工具的形状是「派单 → **await 回传** → 结果折叠回**同一轮**」。
 * ⇒ 一个跑 30 分钟的作业会把模型这一轮**堵 30 分钟**。
 * ⇒ 后台作业改成：**派单即返回 job_id**，作业在本机继续跑，
 *   跑完后**另路送达**（另起一轮 agent 汇报，落回原会话 —— 服务端那侧，B4 已上线）。
 *
 * ## ⚠️ 为什么这个文件**不 import electron**
 *
 * `executor.ts` 顶层 import 了 electron（截图/桌面采集）⇒ 单测 import 它就会炸。
 * ⇒ 把后台作业的四个分支放这里（纯 Node）⇒ 单测能直接跑。
 */

import { randomUUID } from 'crypto';
import {
  getCliService,
  isBackgroundStartTool,
  isJobControlTool,
  numArg,
  strArg,
} from './cliService.ts';
import type { CliService } from './cliService.ts';
import { claudeService } from './claudeService.ts';
import { rawService } from './cliService.ts';
import { registerBuiltinCliServices } from './cliServices.ts';
import { describeJob, findJob, pollJob, startJob, stopJobById } from './jobRunner.ts';
import type { ClientToolResult } from './types.ts';

// ⚠️ 内置 CLI 服务（`claude`）在这里注册一次 —— 本模块是「工具 → 服务」的映射处。
registerBuiltinCliServices();

/** 起作业的入参。 */
export interface BackgroundStartInput {
  tool: string;
  args: Record<string, unknown> | null;
  /** 派单带的工作目录。 */
  cwd: string | null;
  /** 作业 id（= 服务端的 `pending_id`）—— 没有就自己生成一个。 */
  jobId?: string | null;
  /** 发起会话。 */
  sessionId?: string | null;
}

/**
 * 起一个后台作业（**立即返回**）。
 */
export function startBackgroundJob(input: BackgroundStartInput): ClientToolResult {
  const tool = input.tool;
  const service: CliService | null =
    tool === 'pc_claude' ? claudeService : tool === 'pc_job_start' ? rawService : null;
  if (!service) {
    return { status: 'error', error: `未知的后台作业工具: ${tool}` };
  }

  const args = input.args || {};
  // ⚠️ 工作目录：入参里的 `cwd` 优先，其次派单带的那个。
  const cwd = strArg(args, 'cwd') || input.cwd || null;

  const jobId = (input.jobId && String(input.jobId)) || `job-${randomUUID()}`;

  const invocation = service.buildInvocation({
    args,
    cwd,
    timeoutMs: null,
    jobId,
  });
  if (!invocation) {
    if (tool === 'pc_claude') {
      const task = strArg(args, 'task');
      if (!task) {
        return { status: 'error', error: 'pc_claude 缺 task' };
      }
      return {
        status: 'error',
        error:
          '找不到 Claude Code 可执行文件（claude）。'
          + '请在 Gacode 所在电脑上装好 Claude Code，'
          + '或用环境变量 GACODE_CLAUDE_BIN 指向 claude.exe 的完整路径。',
      };
    }
    return { status: 'error', error: `${tool} 缺少必要参数` };
  }

  let started;
  try {
    started = startJob(jobId, service, invocation);
  } catch (e) {
    return { status: 'error', error: `后台作业起不来: ${(e as Error).message}` };
  }

  const lines = [
    `已在后台启动作业（${service.title}）`,
    `作业 id: ${started.jobId}`,
    `进程 pid: ${started.pid}`,
    `工作目录: ${cwd || '(默认)'}`,
    `输出日志: ${started.outputFile}`,
  ];
  // ⚠️ 如实说明被忽略的参数（`--max-turns` 在本机 CLI 上不存在）。
  const maxTurns = numArg(args, 'max_turns');
  if (maxTurns) {
    lines.push(
      `注意: 本机 Claude Code CLI 不支持 --max-turns 参数，max_turns=${maxTurns} 被忽略。`,
    );
  }
  lines.push('作业会继续在后台跑，完成后结果会自动汇报给用户。');

  return {
    status: 'ok',
    stdout: lines.join('\n'),
    exitCode: 0,
  };
}

/** 查作业状态（同步）。 */
export function jobStatus(input: { args: Record<string, unknown> | null }): ClientToolResult {
  const jobId = strArg(input.args, 'job_id');
  if (!jobId) return { status: 'error', error: 'pc_job_status 缺 job_id' };

  const job = findJob(jobId);
  if (!job) return { status: 'error', error: `作业不存在: ${jobId}` };

  const polled = pollJob(job);
  return { status: 'ok', stdout: describeJob(polled.job), exitCode: 0 };
}

/** 停作业（同步）。 */
export function jobStop(input: { args: Record<string, unknown> | null }): ClientToolResult {
  const jobId = strArg(input.args, 'job_id');
  if (!jobId) return { status: 'error', error: 'pc_job_stop 缺 job_id' };

  const r = stopJobById(jobId);
  if (!r.job) return { status: 'error', error: `作业不存在: ${jobId}` };
  if (!r.stopped) {
    return {
      status: 'error',
      error: `作业已经结束（状态: ${r.job.status}），没法再停`,
    };
  }
  return { status: 'ok', stdout: `已停止作业 ${jobId}`, exitCode: 0 };
}

/** 拿作业用的 CLI 服务（没注册 ⇒ null）。 */
export function serviceOf(jobServiceId: string): CliService | null {
  return getCliService(jobServiceId);
}
