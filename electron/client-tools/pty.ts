/**
 * electron/client-tools/pty.ts —— 真终端（ConPTY）执行
 *
 * [2026-11-12] 契约依据: 订正 24 —— `pc_shell` 的语义是「在**真终端**里执行命令」。
 *
 * ## 为什么必须是 PTY，不能用 `child_process.spawn`
 *
 * `child_process.spawn` 给的是**管道**，不是终端：
 *   · 程序问「终端多大？」拿不到尺寸（`ioctl(TIOCGWINSZ)` 失败）；
 *   · 交互式程序（`vim` / `top` / 要密码的 `ssh`）直接报错退出；
 *   · 进度条 / 颜色这类 TTY 特性全部失效。
 * ⇒ 「完全操控本地电脑」意味着**要能跑真正的 CLI**，必须给真终端。
 *
 * Windows 上 node-pty 走 **ConPTY**（`conpty.dll` + `OpenConsole.exe`，
 * 由 node-pty 的 postinstall 从 `third_party/conpty/` 拷进 `build/Release/`）。
 *
 * ## 超时怎么办
 *
 * 超时 ⇒ **杀掉整个进程树**（Windows 上 `taskkill /T /F`），
 * 否则子进程会变成孤儿继续跑（用户以为停了，其实还在删文件）。
 */

import * as pty from 'node-pty';
import { execFile } from 'child_process';

export interface PtyRunOptions {
  command: string;
  cwd?: string | null;
  env?: Record<string, string>;
  /** 超时（毫秒）。 */
  timeoutMs?: number;
  cols?: number;
  rows?: number;
}

export interface PtyRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

/** 单条命令的输出上限（防止一条命令刷爆内存 + 刷爆模型上下文）。 */
export const MAX_OUTPUT_CHARS = 200000;

/** 选一个能用的 shell。 */
function pickShell(): { file: string; args: (command: string) => string[] } {
  if (process.platform === 'win32') {
    const comspec = process.env.ComSpec || 'cmd.exe';
    return {
      file: comspec,
      // ⚠️ `/d` 关 AutoRun（用户的 profile 脚本可能干扰输出），
      //    `/s /c` 让整条命令作为一个整体交给 cmd。
      args: (command: string) => ['/d', '/s', '/c', command],
    };
  }
  const shell = process.env.SHELL || '/bin/bash';
  return {
    file: shell,
    args: (command: string) => ['-lc', command],
  };
}

/** 杀掉整棵进程树（Windows 上 `taskkill /T`；其它平台杀进程组）。 */
function killTree(pid: number): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => { /* 杀不掉就算了 */ });
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch (_) {
      try { process.kill(pid, 'SIGKILL'); } catch (__) { /* 已经死了 */ }
    }
  }
}

/**
 * 在真终端里跑一条命令。
 *
 * ⚠️ **不抛错** —— 命令跑失败（退出码非 0）是**正常结果**，
 *    由调用方折进 `status: 'error'`。只有「压根没跑起来」才抛。
 */
export function runCommand(opts: PtyRunOptions): Promise<PtyRunResult> {
  const { command, cwd, env, timeoutMs } = opts;
  const shell = pickShell();
  const limit = MAX_OUTPUT_CHARS;

  return new Promise<PtyRunResult>((resolve, reject) => {
    let out = '';
    let timedOut = false;
    let settled = false;

    let child: pty.IPty;
    try {
      child = pty.spawn(shell.file, shell.args(command), {
        name: 'xterm-256color',
        cols: opts.cols || 120,
        rows: opts.rows || 32,
        cwd: cwd || undefined,
        env: {
          ...(process.env as Record<string, string>),
          ...(env || {}),
          // ⚠️ 让子进程知道自己跑在终端里（很多 CLI 据此决定要不要画颜色 / 分页）。
          TERM: 'xterm-256color',
        },
      });
    } catch (e) {
      reject(new Error(`无法启动终端: ${(e as Error).message}`));
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, Math.max(1000, timeoutMs || 600000));

    const finish = (exitCode: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { child.kill(); } catch (_) { /* 已经退了 */ }
      resolve({ stdout: out, stderr: '', exitCode, timedOut });
    };

    child.onData((d) => {
      if (out.length < limit) {
        out += d;
        if (out.length > limit) out = out.slice(0, limit);
      }
    });

    child.onExit(({ exitCode }) => {
      finish(typeof exitCode === 'number' ? exitCode : 0);
    });
  });
}
