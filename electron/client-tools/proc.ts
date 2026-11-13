/**
 * electron/client-tools/proc.ts —— 子进程相关的**纯 Node** 原语
 *
 * [2026-11-13 · 订正 27] 契约依据: cross-platform-sse-event-contract-附录.md **订正 27 §4**（CLI 服务抽象）。
 *
 * ## 为什么从 `pty.ts` 里拆出来
 *
 * `pty.ts` 顶层 `import * as pty from 'node-pty'` ⇒ **单测 import 它就会炸**
 * （node-pty 是原生模块，没 rebuild 过就加载不了）。
 * 而后台作业（B5）要的只是两样东西：**选一个 shell** + **杀一棵进程树** —— 两者都不需要真终端。
 * ⇒ 拆到这里，`jobRunner` / 单测都**不碰 node-pty** ⇒ 顺带绕开 node-pty 的 ABI 地狱。
 *
 * ## 两个函数的归属
 *
 *   · `pickShell()` —— 造「一条命令怎么交给 shell」；`pc_shell`（真终端）与
 *     `pc_job_start`（后台命令）**共用**同一条口径（Windows `cmd /d /s /c`）。
 *   · `killTree(pid)` —— 杀**整棵**进程树（Windows `taskkill /T /F`）。
 *     ⚠️ 只杀 pid 会留下孤儿（孙进程继续跑，用户以为停了其实还在删文件）。
 */

import { execFile } from 'child_process';

/** 选一个能用的 shell。 */
export function pickShell(): { file: string; args: (command: string) => string[] } {
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
export function killTree(pid: number): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    // ⚠️ **要重试**：作业是**刚起**的进程时，taskkill 偶尔会「找不到它」
    //    （进程还没完全站稳）⇒ 第一次失败就放弃 ⇒ **用户点了停，作业还在跑**
    //    ⇒ 界面说停了、Claude Code 还在改用户的代码 —— 最糟的一种不一致。
    // ⇒ 失败就等一下再试；两次都不行 ⇒ 兜底直接杀 pid（至少杀掉本体）。
    const attempt = (n: number): void => {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], (err) => {
        if (!err) return;                       // 杀掉了
        if (n >= 2) {                          // 试了两次还不行 ⇒ 兜底直接杀
          try { process.kill(pid); } catch (_) { /* 已经没了 */ }
          return;
        }
        setTimeout(() => attempt(n + 1), 250);
      });
    };
    attempt(0);
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch (_) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch (__) { /* 已经死了 */ }
    }
  }
}

/**
 * 这个 pid 还活着吗。
 *
 * ⚠️ 用 `process.kill(pid, 0)`（信号 0 = 只检查存在性，不真的发信号）。
 *    后台作业是 **detached** 的 ⇒ 父进程拿不到 `exit` 事件（app 退出就没了）
 *    ⇒ 重启后只能靠这个判断「它是不是还在跑」。
 */
export function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM = 进程存在但我们没权限发信号（别人的进程）⇒ 视为「活着」
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'EPERM') return true;
    return false;
  }
}
