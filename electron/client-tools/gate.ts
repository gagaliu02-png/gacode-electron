/**
 * electron/client-tools/gate.ts —— 端侧执行的**安全闸门**
 *
 * [2026-11-12] 契约依据: cross-platform-sse-event-contract-附录.md **订正 24 §5**（审批与闸门）。
 *
 * ## 三层闸门（缺一层都不行）
 *
 *   ① **总开关**（`masterEnabled`，默认 **开**）—— 用户能一眼看到、能一键关掉。
 *      gaga 拍板：默认 ON + 物理可见 + 一键急停。
 *   ② **急停**（`killSwitch`）—— 一按立刻全拒，且**正在跑的命令被杀**。
 *      总开关是「我不想让 AI 动我的电脑」，急停是「**现在**给我停下」。
 *   ③ **黑名单硬拒**（L-24j）—— 不可逆类命令（格式化 / 删根目录 / 改注册表 / 关机 …）
 *      **恒被拒**，不是「默认拒绝但可以勾选允许」。
 *
 * ## 黑名单为什么必须**硬拒**
 *
 * 端侧工具的目标是「**完全操控本地电脑**」⇒ 不做路径沙箱、不做命令白名单
 * （白名单会让「让 AI 帮我跑任意 CLI」这个核心诉求直接失效）。
 * ⇒ 安全性就落在「不可逆操作不许做」这一条上 —— 这是**唯一**的硬边界。
 *
 * ⚠️ **绝不复用 `scheduled === true`**（L-24k）：那个标志在服务端的
 *    `approval-guard.js:499-509` 会让审批**直接放行**（服务端定时任务专用旁路）。
 *    端侧执行**绝不**走那条路。
 *
 * ## 审计
 *
 * 落 `%APPDATA%/Gacode/client-audit.jsonl`（append-only）：
 * 保留 **30 天** + **一键清空**（gaga 拍板）。
 * ⚠️ 只记**摘要**（命令前 N 个字符 / 路径），不把整段文件内容写进审计。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
// ⚠️ 这里**只能**用 `import type` —— Node 的类型剥离会把 `import type` 整条删掉，
//    于是本文件能被 `node --test` 直接 import（不带扩展名的值 import 会
//    ERR_MODULE_NOT_FOUND，因为 Node 的 ESM 解析器不补扩展名）。
import type { ClientToolAuditEntry } from './types';

/**
 * 闸门拒绝时抛的错误（带机器可读的 code）。
 *
 * ⚠️ 住在**本文件**而不是 `types.ts` —— `types.ts` 只放纯类型，
 *    这样它能被 Node 的类型剥离直接加载（单测要 import 它）。
 */
export class ClientToolGateError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ClientToolGateError';
    this.code = code;
  }
}

/**
 * 配置目录（`%APPDATA%/Gacode`）。
 *
 * ⚠️ **不在模块顶层 import electron** —— 那样这个文件就没法被 `node --test`
 *    直接测了（单测环境里没有 electron 模块）。
 *    ⇒ 运行时懒加载；单测环境退到 `GACODE_USER_DATA_DIR` 或临时目录。
 */
export function configDir(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') return app.getPath('userData');
  } catch (_) { /* 不是 Electron 环境（单测）⇒ 走下面的兜底 */ }
  return process.env.GACODE_USER_DATA_DIR || path.join(os.tmpdir(), 'gacode-client-tools');
}

/** 闸门配置文件。 */
export function gateConfigFile(): string {
  return path.join(configDir(), 'client-gate.json');
}

/** 审计日志文件（append-only）。 */
export function auditFile(): string {
  return path.join(configDir(), 'client-audit.jsonl');
}

/** 审计保留期：30 天（gaga 拍板）。 */
export const AUDIT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** 闸门状态。 */
export interface GateState {
  /** 总开关 —— 默认 **开**（gaga 拍板「默认 ON」）。 */
  masterEnabled: boolean;
  /** 急停 —— 一键全拒 + 杀掉在跑的命令。 */
  killSwitch: boolean;
  updatedAt: number;
}

const DEFAULT_STATE: GateState = {
  masterEnabled: true,
  killSwitch: false,
  updatedAt: 0,
};

/** 读闸门状态（文件不存在 ⇒ 默认值；文件坏了 ⇒ 默认值，不猜）。 */
export function readGateState(): GateState {
  try {
    const raw = fs.readFileSync(gateConfigFile(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_STATE };
    return {
      masterEnabled:
        typeof parsed.masterEnabled === 'boolean' ? parsed.masterEnabled : DEFAULT_STATE.masterEnabled,
      killSwitch: typeof parsed.killSwitch === 'boolean' ? parsed.killSwitch : DEFAULT_STATE.killSwitch,
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch (_) {
    return { ...DEFAULT_STATE };
  }
}

/** 写闸门状态。 */
export function writeGateState(next: Partial<GateState>): GateState {
  const cur = readGateState();
  const merged: GateState = {
    masterEnabled:
      typeof next.masterEnabled === 'boolean' ? next.masterEnabled : cur.masterEnabled,
    killSwitch: typeof next.killSwitch === 'boolean' ? next.killSwitch : cur.killSwitch,
    updatedAt: Date.now(),
  };
  try {
    fs.mkdirSync(configDir(), { recursive: true });
    fs.writeFileSync(gateConfigFile(), JSON.stringify(merged, null, 2), 'utf8');
  } catch (e) {
    console.error('[client-tools/gate] 闸门状态落盘失败:', e && (e as Error).message);
  }
  return merged;
}

// ===========================================================================
// 黑名单（L-24j）
// ===========================================================================

/**
 * 不可逆命令黑名单。
 *
 * ⚠️ 每条都是**恒拒**（不是「默认拒绝但可勾选允许」）。
 * ⚠️ 匹配的是**命令里出现的这些片段** —— 宁可误伤一点也不放行：
 *    误伤的代价是「这条命令你自己手动跑」，
 *    漏放的代价是「用户的盘没了」。
 */
const BLACKLIST: Array<{ re: RegExp; why: string }> = [
  // ── 磁盘 / 文件系统级不可逆 ──
  { re: /\bformat\s+[a-z]:/i, why: '格式化磁盘（不可逆）' },
  { re: /\bdiskpart\b/i, why: 'diskpart（可清盘 / 改分区表）' },
  { re: /\bmkfs\b/i, why: 'mkfs（建文件系统，会抹掉分区内容）' },
  { re: /\bdd\s+if=.*of=\/dev\//i, why: 'dd 写裸设备（会抹掉整块盘）' },
  { re: /\bcipher\s+\/w/i, why: 'cipher /w（不可逆地擦除空闲空间）' },
  // ── 递归删根 / 删用户目录 ──
  //   ⚠️ 只拦**盘根**（`C:\` / `C:\*`），不拦子目录 ——
  //      `del /f /s /q C:\work\build` 是正常的清理动作，拦了就是误伤。
  { re: /\b(rd|rmdir)\s+\/s\s+(?:\/[a-z]\s+)*[a-z]:?\\?\*?\s*$/i, why: '递归删除盘根目录' },
  { re: /\bdel\s+\/[sf]\s+(?:\/[a-z]\s+)*[a-z]:?\\?\*?\s*$/i, why: '递归删除整盘（del /f /s /q C:\\*）' },
  { re: /\bremove-item\b[^\n]*-recurse[^\n]*\s+["']?[a-z]:?\\?["']?\s*$/i, why: '递归删除盘根目录（PowerShell）' },
  { re: /\brm\s+-rf\s+\/(\s|$)/i, why: '递归删除根目录' },
  { re: /\brm\s+-rf\s+~\/?\s*$/i, why: '递归删除整个用户目录' },
  { re: /\brm\s+-rf\s+\/(bin|boot|dev|etc|lib|proc|sys|usr|var)\b/i, why: '递归删除系统目录' },
  // ── 注册表 / 引导 / 系统状态 ──
  { re: /\breg\s+delete\b/i, why: '删除注册表项（不可逆）' },
  { re: /\breg\s+format\b/i, why: '格式化注册表 hive（不可逆）' },
  { re: /\bbcdedit\b[^\n]*\/(delete|set)\b/i, why: '改引导配置（可能开不了机）' },
  { re: /\bvssadmin\s+delete\s+shadows/i, why: '删除卷影副本（还原点没了）' },
  { re: /\bwbadmin\s+delete\s+catalog\b/i, why: '删除备份目录' },
  { re: /\bwevtutil\s+cl\b/i, why: '清空事件日志（抹掉痕迹）' },
  // ── 关机 / 重启 / 电源 / 远程访问 ──
  { re: /\b(shutdown|halt|poweroff|reboot)\b/i, why: '关机 / 重启（会把在跑的命令打断）' },
  { re: /\brundll32\b[^\n]*shutdown/i, why: '关机' },
  { re: /\bStop-Computer\b/i, why: '关机（PowerShell）' },
  { re: /\b(net\s+user\s+\S+\s+\S+\s+\/add|net\s+localgroup\s+administrators\s+\S+\s+\/add)\b/i, why: '新增账户 / 提权到管理员组' },
  { re: /\b(sc\s+config\s+\S+\s+start=auto|reg\s+add[^\n]*\\Run\b)/i, why: '装自启动 / 写 Run 键（持久化后门）' },
  { re: /\bEnable-PSRemoting\b|\bwinrs\b/i, why: '开远程执行' },
  // ── fork bomb / 经典自毁 ──
  { re: /:\(\)\s*\{\s*:\|:&\s*\}\s*;\s*:/, why: 'fork bomb' },
  { re: /\brm\s+-rf\s+\/\s*(#.*)?$/, why: '递归删除根目录' },
];

/**
 * 命令里有没有不可逆操作。
 *
 * @returns 命中原因；没命中返回 null。
 */
export function findBlacklistHit(command: string): string | null {
  if (typeof command !== 'string' || !command) return null;
  for (const item of BLACKLIST) {
    if (item.re.test(command)) return item.why;
  }
  return null;
}

// ===========================================================================
// 闸门判定
// ===========================================================================

/**
 * ★ [2026-11-13 · 订正 27] **工具 → 命令参数名**的映射表。
 *
 * ## 为什么不能硬编码工具名
 *
 * 原来只有 `tool === 'pc_shell'` 才查黑名单（查它的 `command` 参数）。
 * 而后台作业工具 `pc_job_start` **也是跑一条命令** ⇒ 不查的话
 * 「通用后台命令」就成了一条**绕过黑名单**的路（`pc_job_start format C:` 能过闸）。
 *
 * ⇒ 改成**按参数名**抽表：谁带命令参数，谁就过黑名单。
 *
 * ## ⚠️ `pc_claude` **故意不在表里**
 *
 * `pc_claude` 的参数是 `task`（**自然语言**），不是命令 ⇒ 没有黑名单可比。
 * ⇒ 它走的是「**完全开放**」（gaga 拍板）。
 * ⚠️ **后果要说清**：`pc_claude` 能让 Claude Code 去跑黑名单命令
 *    ⇒ **黑名单对 Claude Code 无效**（只对直接下的命令有效）。
 * ⇒ 保留的兜底：`client-tools` 总闸 + 急停（急停会连后台作业一起杀）+ 审计。
 */
export const COMMAND_ARG_BY_TOOL: Record<string, string> = {
  pc_shell: 'command',
  pc_job_start: 'command',
};

/**
 * 放行前的判定。
 *
 * @throws {ClientToolGateError} 被拒时抛（code 供端侧/服务端区分）
 */
export function assertAllowed(tool: string, args: Record<string, unknown> | null): void {
  const state = readGateState();
  // 急停优先于总开关（急停是「现在停下」，比「以后别动」更急）。
  if (state.killSwitch) {
    throw new ClientToolGateError('kill_switch', '急停已开启：端侧执行全部停摆。');
  }
  if (!state.masterEnabled) {
    throw new ClientToolGateError('master_off', '端侧执行总开关已关闭。');
  }
  const cmdArgName = COMMAND_ARG_BY_TOOL[tool];
  if (cmdArgName) {
    const cmd = args && typeof args[cmdArgName] === 'string' ? args[cmdArgName] : '';
    const hit = findBlacklistHit(cmd);
    if (hit) {
      // ⛔ 硬拒：不可逆操作**恒**不许做，没有任何「放行」路径。
      throw new ClientToolGateError('blacklist', `命令被黑名单硬拒：${hit}`);
    }
  }
}

// ===========================================================================
// 审计
// ===========================================================================

/** 写一条审计（append-only）。 */
export function appendAudit(entry: ClientToolAuditEntry): void {
  try {
    fs.mkdirSync(configDir(), { recursive: true });
    fs.appendFileSync(auditFile(), JSON.stringify(entry) + '\n', 'utf8');
  } catch (e) {
    // ⚠️ 审计写失败**不许**挡住执行 —— 执行本身更重要；
    //    但要留一条日志让人知道审计断了。
    console.error('[client-tools/gate] 审计写入失败:', e && (e as Error).message);
  }
}

/**
 * 读审计（按时间倒序，最新的在前）。
 *
 * ⚠️ 读的时候顺手**清掉过期条目**（30 天保留期）—— 保留期是硬要求，
 *    顺手清比另开一个定时任务可靠（进程不常驻时定时任务不会跑）。
 */
export function readAudit(limit = 200): ClientToolAuditEntry[] {
  let raw = '';
  try {
    raw = fs.readFileSync(auditFile(), 'utf8');
  } catch (_) {
    return [];
  }
  const cutoff = Date.now() - AUDIT_RETENTION_MS;
  const kept: string[] = [];
  const entries: ClientToolAuditEntry[] = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    let parsed: ClientToolAuditEntry | null = null;
    try {
      parsed = JSON.parse(line);
    } catch (_) {
      continue;   // 半截行（写了一半被杀）⇒ 跳过，不让整个读取炸掉
    }
    if (!parsed || typeof parsed.ts !== 'number') continue;
    if (parsed.ts >= cutoff) {
      kept.push(line);
      entries.push(parsed);
    }
  }
  // 顺手把过期条目从文件里剔掉
  if (kept.length !== raw.split('\n').filter((l) => l.trim()).length) {
    try {
      fs.writeFileSync(auditFile(), kept.length ? kept.join('\n') + '\n' : '', 'utf8');
    } catch (_) { /* 清理失败不影响读 */ }
  }
  entries.sort((a, b) => b.ts - a.ts);
  return entries.slice(0, limit);
}

/** 一键清空审计（gaga 拍板）。 */
export function clearAudit(): { cleared: number } {
  let count = 0;
  try {
    const raw = fs.readFileSync(auditFile(), 'utf8');
    count = raw.split('\n').filter((l) => l.trim()).length;
  } catch (_) { /* 文件不存在 ⇒ 已经是空的 */ }
  try {
    fs.writeFileSync(auditFile(), '', 'utf8');
  } catch (e) {
    console.error('[client-tools/gate] 清空审计失败:', e && (e as Error).message);
  }
  return { cleared: count };
}

/** 命令摘要（只记前 N 个字符 —— 审计里不落整段文件内容）。 */
export function summarizeCommand(command: string, max = 200): string {
  if (typeof command !== 'string') return '';
  const flat = command.replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max) + '…' : flat;
}
