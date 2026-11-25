/**
 * electron/client-tools/bashPath.ts —— 找 Git Bash 的可执行文件
 *
 * [2026-11-26 · T-159] `pc_bash`（Git Bash 直连）专用的**路径探测**。
 *
 * ## 为什么需要这个模块
 *
 * `pc_bash` 的语义 = 「**直接 spawn Git Bash**，不经过 cmd.exe」——
 * 因为 cmd.exe 的引号层会把 `bash -lc 'a && b'` **腰斩**
 * （实测报 `unexpected EOF while looking for matching quote`），
 * 而把脚本正文**原样**交给 bash 就不会有这个问题。
 *
 * ⇒ 前提是**得找到 bash.exe**。Git 装在哪因机器而异 ⇒ 多候选探测。
 *
 * ## 探测顺序（先到先得）
 *
 *   ① `GACODE_GIT_BASH` 环境变量（**显式覆盖**最高优先 —— 用户想指定就用它）
 *   ② `C:\Program Files\Git\bin\bash.exe`（Git for Windows 的标准安装位）
 *   ③ `C:\Program Files (x86)\Git\bin\bash.exe`（32 位装法）
 *   ④ `%GIT_INSTALL_ROOT%\bin\bash.exe`（自定义安装根）
 *   ⑤ `%LOCALAPPDATA%\Programs\Git\bin\bash.exe`（user 级安装）
 *   ⑥ PATH 上的 `bash.exe`（Git 加进 PATH 时）
 *
 * ⚠️ **非 Windows**：直接用 `/bin/bash`（WSL/Git-Bash-on-Unix 场景）。
 *
 * ## 为什么不写死单一路径
 *
 * 写死 `C:\Program Files\Git\bin\bash.exe` ⇒ 换机器 / 换安装方式就找不到
 * ⇒ 工具必然失败 ⇒ 模型白调一轮。
 *
 * ## 探测不到时怎么办
 *
 * **如实报错**（`bash_not_found`），**绝不**静默降级到 cmd.exe ——
 * 降级会让 `&&` / 管道 / 引号**又**被腰斩 ⇒ 跑出来的东西与用户预期不符
 * ⇒ 比直接失败更危险（用户会以为命令真的跑过了）。
 */

import * as fs from 'fs';
import * as path from 'path';

/** 环境变量名：显式指定 bash.exe 路径（最高优先）。 */
export const GIT_BASH_ENV = 'GACODE_GIT_BASH';

/** 候选路径（Windows）。 */
function windowsCandidates(): string[] {
  const out: string[] = [];

  // ① 显式覆盖
  const env = process.env[GIT_BASH_ENV];
  if (env && env.trim()) out.push(env.trim());

  // ② ③ 标准安装位
  out.push('C:\\Program Files\\Git\\bin\\bash.exe');
  out.push('C:\\Program Files (x86)\\Git\\bin\\bash.exe');

  // ④ 自定义安装根
  const installRoot = process.env.GIT_INSTALL_ROOT;
  if (installRoot && installRoot.trim()) {
    out.push(path.join(installRoot.trim(), 'bin', 'bash.exe'));
  }

  // ⑤ user 级安装
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData && localAppData.trim()) {
    out.push(path.join(localAppData.trim(), 'Programs', 'Git', 'bin', 'bash.exe'));
  }

  return out;
}

/** 一个候选路径是不是可用的可执行文件。 */
function isExecutableFile(p: string): boolean {
  try {
    if (!p) return false;
    const st = fs.statSync(p);
    if (!st.isFile()) return false;
    // Windows 上不检查执行位（那是 Unix 概念）⇒ 只看「是不是文件」。
    if (process.platform === 'win32') return true;
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch (_) {
    return false;
  }
}

/** 在 PATH 上找 `bash`（Windows 找 bash.exe）。 */
function findOnPath(): string | null {
  const names = process.platform === 'win32' ? ['bash.exe', 'bash'] : ['bash'];
  const rawPath = process.env.PATH || '';
  if (!rawPath) return null;
  for (const dir of rawPath.split(path.delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (isExecutableFile(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * 找到 Git Bash 的可执行文件路径。
 *
 * @returns 绝对路径；找不到返回 `null`
 */
export function findGitBash(): string | null {
  // ⛔ 非 Windows：系统 bash 就是它（Git Bash on Unix / Linux / macOS）
  if (process.platform !== 'win32') {
    return isExecutableFile('/bin/bash') ? '/bin/bash' : findOnPath();
  }

  for (const candidate of windowsCandidates()) {
    if (isExecutableFile(candidate)) return candidate;
  }
  return findOnPath();
}

/** 这台机器上有没有 Git Bash（= 能不能下发 `pc_bash`）。 */
export function bashExists(): boolean {
  return findGitBash() !== null;
}

/** 给模型看的一句话说明（找不到时用）。 */
export function bashNotFoundMessage(): string {
  return '本机找不到 Git Bash（bash.exe）⇒ 无法执行 bash 脚本。'
    + '若已安装 Git，请确认 Git Bash 位于 C:\\Program Files\\Git\\bin\\bash.exe，'
    + `或用环境变量 ${GIT_BASH_ENV} 显式指定其完整路径。`;
}
