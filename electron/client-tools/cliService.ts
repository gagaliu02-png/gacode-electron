/**
 * electron/client-tools/cliService.ts —— **CLI 服务注册表**（订正 27 §4 · L-27i）
 *
 * ## 这一层解决什么
 *
 * 「后台作业」不是「跑一条命令」这一种形态：
 *   · `pc_job_start` —— 跑一条**普通命令**（`npm test` / `pytest` / `make build`）；
 *   · `pc_claude`    —— 跑 **Claude Code**（它有自己的输出协议：`stream-json` 事件流）。
 * ⇒ 如果框架直接写死「怎么起进程、怎么读输出、怎么算完成」，加一种新 CLI 就得改框架。
 *
 * ⇒ **唯一实现方式是注册一个 CLI 服务**：
 *
 *   ```ts
 *   {
 *     id: 'claude',
 *     buildInvocation(ctx): { command, args, cwd, env } | null,   // 怎么起
 *     parseOutput(line): CliEvent | null,                          // 一行输出 ⇒ 什么事件
 *     isComplete(events): boolean,                                 // 怎么算「跑完了」
 *     summarize(events): string,                                   // 怎么汇成给用户看的结论
 *   }
 *   ```
 *
 * ⇒ 加新 CLI 服务 = **加一个 spec，框架一行不改**（L-27i）。
 *
 * ## ⚠️ 为什么「完成」由服务自己判
 *
 * 通用命令的完成信号 = **进程退出**；而 Claude Code 的完成信号 = **`result` 事件**
 * （不是进程退出 —— 它可能还在跑尾巴）。
 * ⇒ 判定必须归服务自己，框架不猜。
 */

import { pickShell } from './proc.ts';
import { resolveCommand } from './shellSplit.ts';

// ===========================================================================
// 类型
// ===========================================================================

/** 一条「已经归一化」的 CLI 输出事件。 */
export interface CliEvent {
  /** 事件类型：`text`（普通输出）/ `result`（最终结果）/ `error` … */
  type: string;
  /** 文本内容（`text` / `result` 事件有）。 */
  text?: string;
  /** 是不是错误。 */
  isError?: boolean;
  /** 原始载荷（服务自己解析出来的结构化数据）。 */
  raw?: unknown;
}

/** 一次调用的**起法**（框架照这个 spawn）。 */
export interface CliInvocation {
  /** 可执行文件（**spawn 时现解析**，不硬编码路径）。 */
  command: string;
  /** 参数数组（Node 自己处理 argv 转义 ⇒ 提示词里的特殊字符不会变成命令）。 */
  args: string[];
  /** spawn 时的进程工作目录。 */
  cwd: string | null;
  /** 追加到子进程 env 的键值（**只加不减**）。 */
  env?: Record<string, string>;
  /**
   * ★ [2026-11-13] 走 **shell** 的命令本体（Windows `cmd /c …` / POSIX `sh -lc …`）。
   *
   *   给了它，作业执行器会**在命令里**加 `>> "<日志文件>" 2>&1`，
   *   并由 shell 自己去做这个重定向。
   *
   *   ## 为什么不能靠「继承父进程的 fd」
   *
   *   实测（Windows）：`detached:true` + `cmd /c` + **外部 exe**
   *   ⇒ 子进程的 stdout **整个丢掉**（日志文件 0 字节），而 cmd 的**内建命令**
   *   （`echo`）却正常 ⇒ 也就是说外部程序被 cmd 丢给了另一个 console，
   *   没有继承我们重定向的句柄。
   *   ⇒ 那个组合正好是 `pc_job_start` 的形状 ⇒ 后台命令的输出**全丢**
   *   （用户看到的汇报就只剩「成功，没有输出」）。
   *
   *   ⇒ 改成**由 shell 自己做重定向** ⇒ 输出一定落在文件里。
   *   用 `>>`（追加）而不是 `>`（覆盖）：cmd 自己的报错（命令找不到等）
   *   走的是继承来的 fd，两者写同一个文件 ⇒ 追加才不会互相覆盖。
   */
  shellCommand?: string | null;
}

/** 起一次调用的上下文。 */
export interface CliServiceContext {
  /** 工具入参（模型给的）。 */
  args: Record<string, unknown> | null;
  /** 工作目录（绝对路径）。 */
  cwd: string | null;
  /** 超时（毫秒）。 */
  timeoutMs: number | null;
  /** 作业 id（= 服务端的 `pending_id`）—— 用来生成可复现的会话 id。 */
  jobId: string;
}

/** 一个 CLI 服务的规格。 */
export interface CliService {
  /** 唯一 id（`raw` / `claude` …）。 */
  id: string;
  /** 人类可读名字（给 UI 用）。 */
  title: string;
  /** 怎么起这次调用。返回 null = 参数不合法。 */
  buildInvocation(ctx: CliServiceContext): CliInvocation | null;
  /** 解析一行输出 ⇒ 事件（不认识的行返回 null）。 */
  parseOutput(line: string): CliEvent | null;
  /** 这批事件里是不是已经有最终结果了。 */
  isComplete(events: CliEvent[]): boolean;
  /** 把事件汇成一段给用户看的结论。 */
  summarize(events: CliEvent[]): string;
}

// ===========================================================================
// 注册表
// ===========================================================================

const _registry = new Map<string, CliService>();

/** 注册一个 CLI 服务（同 id 覆盖）。 */
export function registerCliService(service: CliService): void {
  if (!service || !service.id) throw new Error('CLI 服务必须有 id');
  _registry.set(service.id, service);
}

/** 取一个 CLI 服务（没有 ⇒ null）。 */
export function getCliService(id: string): CliService | null {
  return _registry.get(id) || null;
}

/** 全部已注册的 CLI 服务。 */
export function listCliServices(): CliService[] {
  return Array.from(_registry.values());
}

// ===========================================================================
// 通用命令服务（'raw'）
// ===========================================================================

/** 通用命令的输出摘要最多留几行。 */
export const RAW_SUMMARY_MAX_LINES = 40;

/**
 * 通用命令服务 —— `pc_job_start` 用它。
 *
 * ⚠️ 走 shell（`cmd /d /s /c`）⇒ **命令里的一切都是命令**（这是产品本意：
 *    「在真终端里执行命令」本来就是这个语义，不是新引入的风险面）。
 */
export const rawService: CliService = {
  id: 'raw',
  title: '普通命令',

  buildInvocation(ctx: CliServiceContext): CliInvocation | null {
    const command = ctx.args && typeof ctx.args.command === 'string' ? ctx.args.command.trim() : '';
    if (!command) return null;

    // ★ [2026-11-13] 能**不走 shell**就走直连 exe。
    //   原因（实测）：Windows 上 `detached` + `cmd /c` + 外部 exe ⇒ 子进程的 stdout
    //   **全丢**（作业日志 0 字节）—— cmd 会给孙进程另开 console，不走我们重定向的句柄。
    //   ⇒ 而直连 exe 的同样 spawn 参数**输出正常**。
    //   ⚠️ 真的需要 shell 的命令（管道/&&/重定向/变量展开）仍走 cmd（见 shellSplit.ts）。
    const direct = resolveCommand(command);
    if (direct.direct) {
      return {
        command: direct.exe,
        args: direct.args,
        cwd: ctx.cwd || null,
      };
    }

    const shell = pickShell();
    return {
      command: shell.file,
      // ⚠️ args 由作业执行器填（它才知道日志文件路径，要在命令里加 `>> file 2>&1`）
      args: [],
      cwd: ctx.cwd || null,
      shellCommand: command,
    };
  },

  parseOutput(line: string): CliEvent | null {
    if (!line) return null;
    return { type: 'text', text: line };
  },

  // ⚠️ 通用命令的「完成」= 进程退出 ⇒ 由框架判（见 jobRunner.pollJob），
  //    这里**永远**返回 false。
  isComplete(_events: CliEvent[]): boolean {
    return false;
  },

  summarize(events: CliEvent[]): string {
    const lines = events
      .filter((e) => e && e.type === 'text' && typeof e.text === 'string')
      .map((e) => e.text as string);
    if (!lines.length) return '(没有输出)';
    const tail = lines.slice(-RAW_SUMMARY_MAX_LINES);
    const omitted = lines.length - tail.length;
    return (omitted > 0 ? `（前 ${omitted} 行已省略）\n` : '') + tail.join('\n');
  },
};

// ===========================================================================
// 小工具
// ===========================================================================

/** 取字符串参数（去空白，空串 ⇒ null）。 */
export function strArg(args: Record<string, unknown> | null, key: string): string | null {
  if (!args) return null;
  const v = args[key];
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

/**
 * 取数字参数。
 */
export function numArg(args: Record<string, unknown> | null, key: string): number | null {
  if (!args) return null;
  const v = args[key];
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// ===========================================================================
// 后台作业工具分类
// ===========================================================================

/**
 * ★ [2026-11-13 · 订正 27] 「起后台作业」的工具名。
 *
 * ⚠️ 放在这里（而不是 `backgroundJobs.ts`）是为了让**单测**能不 import 那个文件
 *    —— `backgroundJobs.ts` 会连带 import `claudeService.ts`（带审批旁路标志的那个模块），
 *    而单测**只做形状断言**、不需要真起 agent ⇒ 别把那条链拖进单测。
 */
export const BACKGROUND_START_TOOLS = ['pc_claude', 'pc_job_start'] as const;

/** 「作业控制」（查 / 停）的工具名。 */
export const JOB_CONTROL_TOOLS = ['pc_job_status', 'pc_job_stop'] as const;

/** 是不是「起后台作业」的工具。 */
export function isBackgroundStartTool(tool: string): boolean {
  return (BACKGROUND_START_TOOLS as readonly string[]).includes(tool);
}

/** 是不是「作业控制」的工具。 */
export function isJobControlTool(tool: string): boolean {
  return (JOB_CONTROL_TOOLS as readonly string[]).includes(tool);
}

// ⚠️ `raw` 服务就定义在本文件 ⇒ **就地注册**（没有循环依赖，天然安全）。
//    `claude` 服务的注册在 `cliServices.ts`（它要 import claudeService.ts）。
registerCliService(rawService);
