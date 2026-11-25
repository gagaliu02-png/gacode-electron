/**
 * electron/client-tools/powershellPath.ts —— 找 PowerShell 解释器
 *
 * [2026-11-26 · T-160] `pc_powershell`（PowerShell 直连）专用的**解释器探测**。
 *
 * ## 为什么需要这个模块
 *
 * `pc_powershell` 的语义 = 「**直接 spawn PowerShell**，不经过 cmd.exe」——
 * 因为 cmd.exe 的引号层会把嵌套引号 / `&&` 链**腰斩**
 * （实测报 `unexpected EOF while looking for matching quote`），
 * 而把脚本正文**原样**交给 PowerShell 就不会有这个问题。
 *
 * ⇒ 前提是**得找到解释器**。
 *
 * ## Windows 上有**两个** PowerShell，都要认
 *
 * | 解释器 | 版本 | 位置 | 说明 |
 * |---|---|---|---|
 * | `pwsh.exe` | PowerShell 7+ | `C:\Program Files\PowerShell\7\pwsh.exe` | 跨平台、默认安装新版用它；支持 `&&` / `\|\|` |
 * | `powershell.exe` | Windows PowerShell 5.1 | `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` | Windows 自带，老但哪儿都有 |
 *
 * ⚠️ **优先 `pwsh`**：7+ 支持 `&&` / `||` 链式与三元运算符，脚本语义更接近 bash。
 * ⚠️ **5.1 不支持 `&&`**（用 `;`）—— 工具描述里已写明这一点（见服务端 spec）。
 *
 * ## 探测顺序（先到先得）
 *
 *   ① `GACODE_POWERSHELL` 环境变量（**显式覆盖**最高优先）
 *   ② `pwsh.exe`：`C:\Program Files\PowerShell\7\pwsh.exe` → `LOCALAPPDATA\Programs\PowerShell\7\pwsh.exe` → PATH
 *   ③ `powershell.exe`：`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe` → `%SystemRoot%\System32\...` → PATH
 *
 * ⚠️ **非 Windows**：`/usr/bin/pwsh` / `/usr/local/bin/pwsh`（PowerShell 7 跨平台版）。
 *
 * ## 探测不到时怎么办
 *
 * **如实报错**，**绝不**静默降级到 cmd.exe —— 降级会让引号 / 链式**又**被腰斩
 * ⇒ 跑出来的东西与用户预期不符 ⇒ 比直接失败更危险（用户会以为命令真的跑过了）。
 */

import * as fs from 'fs';
import * as path from 'path';

/** 环境变量名：显式指定解释器路径（最高优先）。 */
export const POWERSHELL_ENV = 'GACODE_POWERSHELL';

/** 一个候选路径是不是可用的可执行文件。 */
function isExecutableFile(p: string): boolean {
  try {
    if (!p) return false;
    const st = fs.statSync(p);
    if (!st.isFile()) return false;
    // Windows 上不检查执行位（Unix 概念）⇒ 只看「是不是文件」。
    if (process.platform === 'win32') return true;
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch (_) {
    return false;
  }
}

/** 在 PATH 上找指定名字的可执行文件。 */
function findOnPath(names: string[]): string | null {
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

/** Windows 上的候选路径（`pwsh` 优先，再退 `powershell.exe`）。 */
function windowsCandidates(): string[] {
  const out: string[] = [];

  // ① 显式覆盖
  const env = process.env[POWERSHELL_ENV];
  if (env && env.trim()) out.push(env.trim());

  // ② pwsh（PowerShell 7+）—— 优先，支持 && / ||
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  out.push(path.join(programFiles, 'PowerShell', '7', 'pwsh.exe'));
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData && localAppData.trim()) {
    out.push(path.join(localAppData.trim(), 'Programs', 'PowerShell', '7', 'pwsh.exe'));
  }

  // ③ powershell.exe（Windows PowerShell 5.1，系统自带）
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  out.push(path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'));

  return out;
}

/**
 * 按文件名判定 flavor。
 *
 * ⚠️ 用**包含**匹配而不是前缀匹配 —— 用户可能把解释器放在自定义路径下、
 *   文件名不一定是 `pwsh.exe`（例如 `my-pwsh.exe`）⇒ 前缀匹配会误判成 5.1。
 *   ⇒ 含 `pwsh` 的按 7+ 处理，其余按 5.1。
 */
function flavorOf(file: string): 'pwsh' | 'powershell' {
  const base = path.basename(file).toLowerCase();
  return base.includes('pwsh') ? 'pwsh' : 'powershell';
}

/**
 * 找到 PowerShell 解释器。
 *
 * @returns `{ file, flavor }` —— `flavor` = `'pwsh'`（7+）| `'powershell'`（5.1）；
 *          找不到返回 `null`
 */
export function findPowerShell(): { file: string; flavor: 'pwsh' | 'powershell' } | null {
  // ⛔ 非 Windows：只有跨平台版 pwsh（5.1 是 Windows 专有）
  if (process.platform !== 'win32') {
    const p = findOnPath(['pwsh']);
    return p ? { file: p, flavor: 'pwsh' } : null;
  }

  for (const candidate of windowsCandidates()) {
    if (!isExecutableFile(candidate)) continue;
    return { file: candidate, flavor: flavorOf(candidate) };
  }

  // ④ PATH 兜底：先 pwsh 再 powershell
  const onPath = findOnPath(['pwsh.exe', 'pwsh', 'powershell.exe', 'powershell']);
  if (onPath) {
    return { file: onPath, flavor: flavorOf(onPath) };
  }
  return null;
}

/** 这台机器上有没有 PowerShell（= 能不能下发 `pc_powershell`）。 */
export function powershellExists(): boolean {
  return findPowerShell() !== null;
}

/** 给模型看的一句话说明（找不到时用）。 */
export function powershellNotFoundMessage(): string {
  return '本机找不到 PowerShell 解释器（pwsh.exe 或 powershell.exe）⇒ 无法执行 PowerShell 脚本。'
    + 'Windows 自带的 powershell.exe 位于 '
    + 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe，'
    + `若已安装 PowerShell 7，可用环境变量 ${POWERSHELL_ENV} 显式指定其完整路径。`;
}
