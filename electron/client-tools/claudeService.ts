/**
 * electron/client-tools/claudeService.ts —— **Claude Code CLI** 这个 CLI 服务（订正 27 · L-27i）
 *
 * ## 调用形态（按**本机装的 CLI 版本**核对过，不是照抄文档）
 *
 * ```bash
 * claude -p --output-format stream-json --verbose \
 *        --session-id <uuid> --permission-mode bypassPermissions "<任务>"
 * ```
 *
 * ### ⚠️ 三个必须记住的坑
 *
 *   1. **`claude -p` 没有 `--cwd`** ⇒ 工作目录只能靠 **spawn 时的进程 cwd**。
 *   2. **裸 `claude -p` 遇审批会挂住** ⇒ 必须设 `--permission-mode`。
 *      本文件用 `--permission-mode bypassPermissions`（`--help` 里列的合法取值）。
 *      ⚠️ **不**传 `--dangerously-skip-permissions` —— 那个标志在新版 CLI 上需要额外
 *      的 opt-in（`--allow-dangerously-skip-permissions`）才能生效，传了反而可能直接报错；
 *      `--permission-mode bypassPermissions` 已经达到「不弹审批」的目的。
 *   3. **完成信号 = `result` 事件**，不是进程退出（`--output-format stream-json` 的最后一帧）。
 *
 * ### ⚠️ `--max-turns` 在本机版本上**不存在**
 *
 * 服务端 `pc_claude` 的入参里有 `max_turns`，但本机 CLI（2.1.143）的 `--help` 里
 * **没有** `--max-turns` ⇒ 传了会直接报「unknown option」⇒ 整个作业起不来。
 * ⇒ 本文件**不传**它，并在作业说明里如实告诉用户「这个参数被忽略了」。
 *
 * ## 二进制路径：**spawn 时现解析**，不硬编码
 *
 * 找的顺序：`GACODE_CLAUDE_BIN` 环境变量 → PATH 里的 `claude.exe` / `claude` / `claude.cmd`。
 * ⚠️ 找不到就**如实报错**，绝不瞎猜一个路径。
 */

import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { strArg } from './cliService.ts';
import type {
  CliEvent,
  CliInvocation,
  CliService,
  CliServiceContext,
} from './cliService.ts';
import { isClaudeComplete, parseClaudeLine, summarizeClaude } from './claudeOutput.ts';

/** 汇总给用户看的正文最多留多少字。 */
export const CLAUDE_SUMMARY_MAX_CHARS = 8000;

/**
 * 找 Claude Code 可执行文件。
 *
 * @returns 绝对路径；找不到返回 null。
 */
export function resolveClaudeBinary(): string | null {
  const override = process.env.GACODE_CLAUDE_BIN;
  if (override && fs.existsSync(override)) return path.resolve(override);

  const isWin = process.platform === 'win32';
  const names = isWin ? ['claude.exe', 'claude.cmd', 'claude.bat', 'claude'] : ['claude'];
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);

  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
      } catch (_) { /* 目录没权限 ⇒ 跳过 */ }
    }
  }
  return null;
}

/**
 * `.cmd` / `.bat` 包装脚本 ⇒ 里面真正的 JS 入口。
 *
 * ⚠️ **为什么需要这一步**：Node 在 Windows 上**拒绝**直接 spawn `.cmd`/`.bat`
 *    （必须 `shell: true`，而 `shell: true` 下 Node **不**给参数加引号
 *    ⇒ 任务文本里的空格/引号会把命令行拆坏）。
 *    ⇒ 与其跟 cmd 的引号规则死磕，不如**直接找到真的入口用 node 跑**。
 *
 * @returns JS 入口的绝对路径；解析不出来返回 null。
 */
export function resolveNodeEntryFromShim(shimPath: string): string | null {
  try {
    const raw = fs.readFileSync(shimPath, 'utf8');
    // npm 生成的 shim 长这样：
    //   "%_prog%"  "%dp0%\node_modules\@anthropic-ai\claude-code\cli.js" %*
    const m = raw.match(/"%dp0%\\([^"]+\.js)"/i) || raw.match(/"([^"]+\.js)"/i);
    if (!m) return null;
    const rel = m[1].replace(/\\/g, path.sep);
    const abs = path.resolve(path.dirname(shimPath), rel);
    return fs.existsSync(abs) ? abs : null;
  } catch (_) {
    return null;
  }
}

/** 这条命令行怎么起（不 spawn，只算）。 */
export function buildClaudeInvocation(ctx: CliServiceContext): CliInvocation | null {
  const task = strArg(ctx.args, 'task');
  if (!task) return null;

  const bin = resolveClaudeBinary();
  if (!bin) return null;

  const isShim = /\.(cmd|bat)$/i.test(bin);
  const nodeEntry = isShim ? resolveNodeEntryFromShim(bin) : null;

  let command: string;
  let args: string[];
  if (nodeEntry) {
    // 走真的 JS 入口 ⇒ 不经过 cmd ⇒ argv 由 Node 自己转义 ⇒ 提示词绝对安全。
    command = process.execPath;   // 当前 Electron/Node 自己
    args = [nodeEntry];
  } else if (isShim) {
    // 找不到入口就**不猜** —— 返回 null，让上层报一句人话。
    return null;
  } else {
    command = bin;
    args = [];
  }

  args.push(
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--session-id', randomUUID(),
    '--permission-mode', 'bypassPermissions',
    // ⚠️ 位置参数放**最后** —— `--add-dir` / `--tools` 这类「可变长」选项会把
    //    紧跟其后的位置参数一起吞掉 ⇒ 提示词必须排在所有选项之后。
    task,
  );

  return {
    command,
    args,
    // ⚠️ `claude -p` 没有 `--cwd` ⇒ 只能靠 spawn 时的进程 cwd。
    cwd: ctx.cwd || null,
  };
}

/**
 * 解析 `stream-json` 的一行。
 *
 * ⚠️ 实现搬到了 `claudeOutput.ts`（纯函数）⇒ 单测能直接测它，
 *    不用把本文件（带审批旁路标志）拖进测试进程。
 */
export { parseClaudeLine };

/** Claude Code 这个 CLI 服务。 */
export const claudeService: CliService = {
  id: 'claude',
  title: 'Claude Code',

  buildInvocation: buildClaudeInvocation,

  parseOutput: parseClaudeLine,

  isComplete: isClaudeComplete,

  summarize: (events: CliEvent[]) => summarizeClaude(events, CLAUDE_SUMMARY_MAX_CHARS),
};
