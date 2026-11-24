/**
 * electron/client-tools/claudeTrust.ts —— **Claude Code 工作目录信任**（T-128-fix）
 *
 * ## 病根（真机 0.7.51 实测）
 *
 * `claude --bg` 在**未被信任**的目录里启动会直接失败：
 *
 * ```text
 * Workspace not trusted. Run `claude` in D:\UsersGaga\AppData\Local\Programs\Gacode once and accept the trust prompt, then retry.
 * ```
 *
 * ⚠️ 这条信息走 **stderr** ⇒ 之前端侧 `stdio: ['ignore','pipe','ignore']` 把 stderr 丢了
 *    ⇒ 模型只看到「(无输出)」，完全不知道真实原因。
 *
 * ## 信任是怎么记的
 *
 * `~/.claude.json` 的 `projects` 表：`{ "<cwd>": { hasTrustDialogAccepted: true } }`。
 * 只有 `hasTrustDialogAccepted === true` 的目录才能起会话。
 *
 * ## 本模块做什么
 *
 * 只**只读**地查这个表，判定「某个目录能不能直接当 cwd」；
 * 不能的话给出**受信任的兜底 cwd**（最近的受信任祖先），并把目标目录用 `--add-dir` 带上
 * （CLI 允许 `--add-dir` 访问额外目录，而 cwd 只需要是受信任的）。
 *
 * ⛔ **不写** `~/.claude.json`：替用户点「信任此工作区」是用户自己的决定，
 *    我们只做「换个能跑的位置跑」，并把真实目录通过 `--add-dir` 授权。
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** `~/.claude.json` 里 projects 表的形状（只取我们要的字段）。 */
interface ClaudeProjectsFile {
  projects?: Record<string, { hasTrustDialogAccepted?: boolean } | undefined>;
}

function claudeJsonPath(): string {
  return path.join(os.homedir(), '.claude.json');
}

/** 读 `~/.claude.json` 的 projects 表（读不到就当空 ⇒ 全部不可信）。 */
function readTrustedProjects(): Map<string, boolean> {
  const out = new Map<string, boolean>();
  let raw: string;
  try {
    raw = fs.readFileSync(claudeJsonPath(), 'utf8');
  } catch {
    return out;
  }
  let parsed: ClaudeProjectsFile;
  try {
    parsed = JSON.parse(raw) as ClaudeProjectsFile;
  } catch {
    return out;
  }
  const projects = parsed && parsed.projects;
  if (!projects || typeof projects !== 'object') return out;
  for (const [dir, v] of Object.entries(projects)) {
    out.set(normalizeKey(dir), !!(v && v.hasTrustDialogAccepted));
  }
  return out;
}

/** 目录键归一化：反斜杠 → 正斜杠、去尾斜杠、小写。 */
function normalizeKey(dir: string): string {
  return String(dir || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/**
 * 这个目录（含其祖先）有没有被信任过？
 *
 * CLI 的判定是「cwd 本身在表里且已接受」；但实测受信任的父目录（如 `C:/Users/gaga`）
 * 也能起会话 ⇒ 这里按**祖先链**判定，命中最近的受信任祖先。
 */
export function findTrustedCwd(cwd: string | null): { trusted: boolean; fallback: string | null } {
  const trusted = readTrustedProjects();
  const target = cwd ? path.resolve(cwd) : os.homedir();
  let cur = target;
  for (;;) {
    const key = normalizeKey(cur);
    if (trusted.get(key) === true) {
      return { trusted: true, fallback: null };
    }
    const parent = path.dirname(cur);
    if (!parent || parent === cur) break;
    cur = parent;
  }
  // 兜底：家目录通常被信任过；再兜底就用家目录本身。
  const home = os.homedir();
  if (trusted.get(normalizeKey(home)) === true) {
    return { trusted: false, fallback: home };
  }
  return { trusted: false, fallback: home };
}

/**
 * 计算启动 `claude --bg` 该用的 cwd 与 `--add-dir`。
 *
 * @returns cwd 直接可用的目录；addDir = 需要额外授权的目标目录（仅在 cwd 被换过时有值）
 */
export function resolveClaudeLaunchCwd(cwd: string | null): { cwd: string; addDir: string | null } {
  const target = cwd ? path.resolve(cwd) : null;
  const { trusted, fallback } = findTrustedCwd(target);
  if (trusted || !target) {
    return { cwd: target || fallback || os.homedir(), addDir: null };
  }
  // cwd 不可信 ⇒ 在受信任的祖先里起会话，把目标目录用 --add-dir 授权。
  return { cwd: fallback || os.homedir(), addDir: target };
}
