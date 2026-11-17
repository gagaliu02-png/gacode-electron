/**
 * electron/client-tools/claudeCodeHookInstall.ts —— **把 hook 装进 Claude Code 的设置**
 *
 * [2026-11-17 · T-020 · S3]
 *
 * ## 装到哪
 *
 *   `~/.claude/settings.json` 的 `hooks` 字段（用户级 ⇒ 影响本机**所有** Claude Code 会话）。
 *   ⚠️ 也支持 `~/.claude/settings.local.json`，但那个是**本地覆盖**层，
 *      语义上更适合「我自己机器上的临时开关」⇒ **默认用 settings.json**。
 *
 * ## ⚠️ 这个安装会改用户的 Claude Code 配置（全局）
 *
 *   ⇒ 提供 **dry-run**（只算 diff，不写盘），由上层先给用户看，再落盘。
 *   ⇒ 装的时候**只动 `hooks` 这一个键**，其余字段逐字保留。
 *   ⇒ 卸载时**只删自己加的那一条**（按 url 匹配），别人加的 hook 一条都不碰。
 *
 * ## 为什么不用 `allowedHttpHookUrls`
 *
 *   那个键是**可选**的：不设就不校验 URL（实测 2.1.325 的判定是
 *   `if (allowedUrls !== undefined) { ... }`）。
 *   ⇒ 我们只连 `127.0.0.1`（loopback 被官方明确允许），不设这个键 ⇒ 少改一个字段。
 *   ⚠️ 若用户**已经设了**这个键且不含我们的 URL ⇒ hook 会被拦 ⇒
 *      此时**如实报错**（让用户自己加），**不擅自改**他的安全设置。
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** Claude Code 的用户级设置文件。 */
export function claudeSettingsFile(): string {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

/** 我们加的 hook 的标记（用于识别「哪条是我们装的」）。 */
export const HOOK_MARKER = 'gaclaw-hook-bridge';

export interface HookInstallResult {
  ok: boolean;
  /** 实际改动的文件。 */
  file: string;
  /** 改动摘要（人话）。 */
  summary: string;
  /** dry-run 时是「将要写入的完整内容」。 */
  nextContent?: string;
  error?: string;
}

/**
 * 读 + 解析 settings.json（不存在 ⇒ 空对象）。
 * ⚠️ 解析失败**不许**静默当空对象 —— 那会**覆盖掉**用户的配置。
 */
function readSettings(file: string): { data: Record<string, any>; raw: string | null; parseError?: string } {
  if (!fs.existsSync(file)) return { data: {}, raw: null };
  const raw = fs.readFileSync(file, 'utf8');
  if (!raw.trim()) return { data: {}, raw };
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { data: {}, raw, parseError: 'settings.json 顶层不是对象' };
    }
    return { data, raw };
  } catch (e: any) {
    return { data: {}, raw, parseError: 'settings.json 解析失败: ' + (e?.message || e) };
  }
}

/**
 * 算出「装上 hook 之后」的 hooks 结构。
 *
 * ⚠️ **只动一个事件**（`p.event`，默认 PermissionRequest）——
 *    别的��件里用户自己配的 hook 一条都不碰。
 *
 * @param existing 现有的 hooks 结构
 * @param hookEntry 我们要加的那一条（matcher + hooks[]）
 * @param url       用来识别「是不是我们装的」
 * @param event     只动这个事件
 */
export function mergeHook(
  existing: any,
  hookEntry: { matcher: string; hooks: any[] },
  url: string,
  event: 'PermissionRequest' | 'PreToolUse' = 'PermissionRequest',
): { merged: any; replaced: number } {
  const out = (existing && typeof existing === 'object' && !Array.isArray(existing)) ? { ...existing } : {};
  const events = (out.hooks && typeof out.hooks === 'object' && !Array.isArray(out.hooks)) ? { ...out.hooks } : {};

  let replaced = 0;
  const arr = Array.isArray(events[event]) ? events[event] : [];
  const next: any[] = [];
  for (const entry of arr) {
    // 识别「我们之前装的」：entry.hooks[].url 命中（同一个 url，或带我们的标记）
    const isOurs = entry && Array.isArray(entry.hooks) &&
      entry.hooks.some((h: any) => h && typeof h.url === 'string' &&
        (h.url === url || h.url.includes(HOOK_MARKER)));
    if (isOurs) { replaced++; continue; }
    next.push(entry);
  }
  next.push(hookEntry);
  events[event] = next;

  out.hooks = events;
  return { merged: out, replaced };
}

/** 从现有 hooks 里删掉「我们装的」那一条。 */
export function removeHook(existing: any, url: string): { merged: any; removed: number } {
  const out = (existing && typeof existing === 'object' && !Array.isArray(existing)) ? { ...existing } : {};
  const events = (out.hooks && typeof out.hooks === 'object' && !Array.isArray(out.hooks)) ? { ...out.hooks } : {};
  let removed = 0;
  for (const [event, arr] of Object.entries(events)) {
    if (!Array.isArray(arr)) continue;
    const next = arr.filter((entry: any) => {
      const isOurs = entry && Array.isArray(entry.hooks) && entry.hooks.some((h: any) =>
        h && typeof h.url === 'string' && (h.url === url || h.url.includes(HOOK_MARKER)),
      );
      if (isOurs) { removed++; return false; }
      return true;
    });
    if (next.length) events[event] = next;
    else delete events[event];
  }
  out.hooks = events;
  return { merged: out, removed };
}

/**
 * 安装 hook。
 *
 * @param p
 * @param p.url          hook 的 URL（桥的地址 + token）
 * @param p.event        事件名（默认 PermissionRequest）
 * @param p.matcher      工具匹配（默认 '*'）
 * @param p.timeoutSec   超时（秒，默认 60）
 * @param p.onFailure    'block' | 'continue'（默认 continue：本桥只做自动确认，失败就交回原流程）
 * @param p.dryRun       **true = 只算不改**
 */
export function installHook(p: {
  url: string;
  event?: 'PermissionRequest' | 'PreToolUse';
  matcher?: string;
  timeoutSec?: number;
  onFailure?: 'block' | 'continue';
  dryRun?: boolean;
}): HookInstallResult {
  const file = claudeSettingsFile();
  const { data, raw, parseError } = readSettings(file);
  if (parseError) {
    return { ok: false, file, summary: '', error: parseError + '（拒绝在解析失败时覆写你的配置）' };
  }

  // ⚠️ 用户若已设 allowedHttpHookUrls 且不含我们的 URL ⇒ hook 会被官方拦掉
  //   ⇒ 如实报错，**不擅自改**他的安全设置。
  const allow = data.allowedHttpHookUrls;
  if (Array.isArray(allow) && allow.length) {
    const ok = allow.some((pat: any) => {
      if (typeof pat !== 'string') return false;
      if (pat === '*') return true;
      return p.url.startsWith(pat.replace(/\*$/, ''));
    });
    if (!ok) {
      return {
        ok: false, file, summary: '',
        error: `你的 allowedHttpHookUrls 不含本桥的 URL（${p.url}）⇒ Claude Code 会拦掉这个 hook。` +
          `请自行把 'http://127.0.0.1:*' 加进去（我不擅自改你的安全设置）。`,
      };
    }
  }

  const hookEntry = {
    matcher: p.matcher || '*',
    hooks: [{
      type: 'http',
      url: p.url,
      timeout: p.timeoutSec ?? 60,
      onFailure: p.onFailure ?? 'continue',
      // ⛔ 不设 headers ⇒ 桥的 token 走 **query 参数**（免得 token 落在 env 里被日志记下）
    }],
  };

  const { merged, replaced } = mergeHook(data, hookEntry, p.url, p.event || 'PermissionRequest');
  const nextContent = JSON.stringify(merged, null, 2) + '\n';
  const summary = replaced
    ? `替换了 ${replaced} 条旧的本桥 hook`
    : '新增一条 hook';

  if (p.dryRun) {
    return { ok: true, file, summary: summary + '（dry-run，未写盘）', nextContent };
  }

  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, nextContent, 'utf8');
  } catch (e: any) {
    return { ok: false, file, summary: '', error: '写盘失败: ' + (e?.message || e) };
  }
  return { ok: true, file, summary: summary + ` → ${file}` };
}

/**
 * 卸载（只删自己加的那一条）。
 */
export function uninstallHook(p: { url: string; dryRun?: boolean }): HookInstallResult {
  const file = claudeSettingsFile();
  const { data, raw, parseError } = readSettings(file);
  if (parseError) {
    return { ok: false, file, summary: '', error: parseError };
  }
  if (raw === null) {
    return { ok: true, file, summary: '没有 settings.json，无需卸载' };
  }
  const { merged, removed } = removeHook(data, p.url);
  const nextContent = JSON.stringify(merged, null, 2) + '\n';
  const summary = removed ? `删掉了 ${removed} 条本桥 hook` : '没找到本桥的 hook';
  if (p.dryRun) {
    return { ok: true, file, summary: summary + '（dry-run，未写盘）', nextContent };
  }
  try {
    fs.writeFileSync(file, nextContent, 'utf8');
  } catch (e: any) {
    return { ok: false, file, summary: '', error: '写盘失败: ' + (e?.message || e) };
  }
  return { ok: true, file, summary: summary + ` → ${file}` };
}
