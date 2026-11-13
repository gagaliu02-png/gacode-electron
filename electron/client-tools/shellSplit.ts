/**
 * electron/client-tools/shellSplit.ts —— 把一条**命令行**拆成「可执行文件 + 参数」
 *
 * ## 为什么需要它（2026-11-13 现场事故）
 *
 * `pc_job_start` 的命令原本**一律**走 `cmd /c <命令>`。
 * ⇒ 实测（Windows）：**`detached` + `cmd /c` + 外部 exe ⇒ 子进程的 stdout 全丢**
 *   （作业日志 0 字节）；而 **直连 exe** 同样的 spawn 参数**输出正常**。
 *   根因：`detached` 时 cmd **给孙进程另开一个 console** ⇒ 它们的输出不经过我们重定向的句柄。
 *   ⇒ 用户看到的汇报就只剩「成功，没有输出」（现场：对话 948 的 `pc_job_start` 两条）。
 *
 * ## 为什么不干脆「一律直连 exe」
 *
 * 有些命令**真的需要 shell**：`a | b`、`a && b`、`a > f`、环境变量展开……
 * ⇒ 那些**仍要走 cmd**（输出会丢，属于已知限制；后面单独处理）。
 *
 * ## 判据（保守）
 *
 * 只有在命令**不含**任何 shell 元字符时，才走「直连 exe」这条路。
 * ⚠️ 宁可退回 cmd（输出丢）也不要拆错命令（拆错 = 跑错东西 = 更糟）。
 */

import * as path from 'path';

/** 需要 shell 才能正确解释的字符（出现任何一个 ⇒ 走 cmd）。 */
const SHELL_METACHARS = /[|&;<>()^`\n\r]|>>|\$\(/;

/**
 * 把命令行拆成参数数组。
 *
 * ⚠️ 只处理**双引号**（Windows 上单引号不是引用符，是普通字符）。
 *   双引号内的空格保留成一个参数；引号本身去掉。
 *
 * @returns 参数数组；空命令返回 `[]`
 */
export function splitCommandLine(cmd: string): string[] {
  const s = String(cmd || '');
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  let started = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      inQuote = !inQuote;
      started = true;          // "" ⇒ 空参数也算一个
      continue;
    }
    if (!inQuote && /\s/.test(c)) {
      if (started) { out.push(cur); cur = ''; started = false; }
      continue;
    }
    cur += c;
    started = true;
  }
  if (started) out.push(cur);
  return out;
}

/**
 * 这条命令**能不能**不走 shell（直连 exe）。
 *
 * ⚠️ 判据保守：命中任何 shell 元字符 ⇒ 走 cmd。
 */
export function canRunDirectly(cmd: string): boolean {
  const s = String(cmd || '').trim();
  if (!s) return false;
  if (SHELL_METACHARS.test(s)) return false;
  // Windows 上 `%VAR%` 是环境变量展开 ⇒ 也需要 shell
  if (/%[A-Za-z_][A-Za-z0-9_]*%/.test(s)) return false;
  const parts = splitCommandLine(s);
  return parts.length > 0;
}

/**
 * 解析成「可执行文件 + 参数」。
 *
 * @returns `{ exe, args, direct }` —— `direct=true` 表示可以不走 shell
 */
export function resolveCommand(cmd: string): { exe: string; args: string[]; direct: boolean } {
  const s = String(cmd || '').trim();
  const parts = splitCommandLine(s);
  if (!parts.length) return { exe: '', args: [], direct: false };
  if (!canRunDirectly(s)) {
    return { exe: '', args: [], direct: false };
  }
  return { exe: parts[0], args: parts.slice(1), direct: true };
}

/**
 * 猜一个可执行文件的扩展名（Windows 上 `foo` ⇒ `foo.exe` / `foo.cmd`）。
 *
 * ⚠️ 只用于**报错信息**（告诉用户「找不到 xxx」），不参与实际 spawn。
 */
export function withExeSuffix(exe: string): string {
  if (process.platform !== 'win32') return exe;
  if (path.extname(exe)) return exe;
  return exe + '.exe';
}
