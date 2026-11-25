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

/**
 * ★ [T-154-cc] 归一化 key → **表里原始写法**（保留大小写）。
 *
 * ## 为什么需要它（2026-11-25 e2e 实测）
 *
 * CLI 查信任是**大小写敏感**的（它拿 cwd 字符串去 `projects` 表里**原样**匹配），
 * 而本模块的查表是**大小写不敏感**的（`normalizeKey` 统一转小写）。
 *
 * ⇒ 于是出现这一种坑：表里记的是 `d:\gaga\gaclaw-project`（VS Code 会话开的，小写盘符），
 *   调用方传的是 `D:\gaga\gaclaw-project`（大写 D）
 *   ⇒ **端侧判定「已信任」**，把 `D:\...` 原样交给 CLI
 *   ⇒ **CLI 说 `Workspace not trusted`**（它的表里没有大写 D 那一条）。
 *
 * 实测代价：一次 e2e 里 `pc_cc_new` 连跪两次（<1s 就挂），第三次改成小写才成。
 *
 * ⇒ 修法：**启动时用表里原始写法**（`originalCasing`）⇒ CLI 的原样匹配才命中。
 */
function readTrustedProjectsOriginal(): Map<string, string> {
  const out = new Map<string, string>();
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
    if (v && v.hasTrustDialogAccepted) out.set(normalizeKey(dir), dir);
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
export function findTrustedCwd(cwd: string | null): { trusted: boolean; fallback: string | null; originalCasing: string | null } {
  const trusted = readTrustedProjects();
  const original = readTrustedProjectsOriginal();
  const target = cwd ? path.resolve(cwd) : os.homedir();
  let cur = target;
  for (;;) {
    const key = normalizeKey(cur);
    if (trusted.get(key) === true) {
      // ★ [T-154-cc] 把**表里原始写法**带出去 ⇒ CLI 自己的大小写敏感查表能命中。
      return { trusted: true, fallback: null, originalCasing: original.get(key) || null };
    }
    const parent = path.dirname(cur);
    if (!parent || parent === cur) break;
    cur = parent;
  }
  // 兜底：家目录通常被信任过；再兜底就用家目录本身。
  const home = os.homedir();
  if (trusted.get(normalizeKey(home)) === true) {
    return { trusted: false, fallback: original.get(normalizeKey(home)) || home, originalCasing: original.get(normalizeKey(home)) || null };
  }
  return { trusted: false, fallback: home, originalCasing: null };
}

/**
 * 计算启动 `claude --bg` 该用的 cwd 与 `--add-dir`。
 *
 * ⚠️ **实测约束（2.1.331）**：`--add-dir <dir>` 要求 `<dir>` **本身已被信任**，
 *   否则 CLI 直接拒绝：`Added folder not trusted: ...`。
 *   ⇒ 所以「换到受信任 cwd + add-dir 目标」这条兜底**只在目标目录已信任时成立**。
 *
 * ⇒ 口径：
 *   · 目标目录（含祖先）已信任 ⇒ 直接用它当 cwd，不带 add-dir。
 *   · 目标目录未信任 ⇒ 用**受信任的兜底目录**当 cwd，**不带 add-dir**
 *     （带了必被拒），并把 `untrustedTarget` 回报给调用方 ⇒ 由上层如实告知用户
 *     「这个目录还没被信任，Claude Code 会在 <兜底目录> 里跑」。
 *
 * @returns cwd = 实际启动目录；addDir = 仅当目标目录**已信任**但 cwd 被换过时才有值；
 *          untrustedTarget = 原本想用、但未被信任的目标目录（null = 没有这个问题）
 */
export function resolveClaudeLaunchCwd(cwd: string | null): {
  cwd: string;
  addDir: string | null;
  untrustedTarget: string | null;
} {
  const target = cwd ? path.resolve(cwd) : null;
  const { trusted, fallback, originalCasing } = findTrustedCwd(target);
  if (trusted || !target) {
    // ★ [T-154-cc] 用**表里原始写法**当 cwd（大小写敏感的是 CLI，不是我们）
    //   ⇒ 调用方传 `D:\gaga\...`、表里记 `d:\gaga\...` 时也能起得来。
    const launchCwd = (trusted && originalCasing) ? originalCasing : (target || fallback || os.homedir());
    return { cwd: launchCwd, addDir: null, untrustedTarget: null };
  }
  // 目标目录未信任 ⇒ 不能用 add-dir（CLI 会拒）⇒ 在受信任兜底目录启动。
  return { cwd: fallback || os.homedir(), addDir: null, untrustedTarget: target };
}
