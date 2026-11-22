/**
 * electron/client-tools/executor.ts —— 9 个端侧工具的**实现**
 *
 * [2026-11-12] 契约依据: cross-platform-sse-event-contract-附录.md **订正 24 §4**（工具登记）
 *            + **§8**（产物分级）。
 *
 * ## 工具名与能力键（**唯一真相源在服务端** `gaclaw/src/llm/client-tools.js`）
 *
 * | 工具 | 需要的子能力 | 产物 `kind` |
 * |---|---|---|
 * | `pc_shell` | `pty` | 无 |
 * | `pc_read_file` | `fs` | 无 |
 * | `pc_write_file` | `fs` | `file` |
 * | `pc_list_dir` | `fs` | 无 |
 * | `pc_project` | `fs` | `workspace` |
 * | `pc_screenshot` | `screen` | `file` |
 * | `pc_open_path` | `os` | 无 |
 * | `pc_system_info` | `os` | 无 |
 * | `pc_process_list` | `os` | 无 |
 *
 * ⚠️ **别在本文件另抄一份名单** —— 服务端那份才是真相源。
 *    本文件只实现「收到这个工具名就怎么做」。
 *
 * ## 端侧的职责边界
 *
 * ⛔ 端侧**只负责跑 + 如实回报**。
 *    **不得**自己拼装模型上下文（L-24n / L-25q）—— 折叠是服务端的事。
 * ⛔ 端侧**不得**执行「黑名单命令」（L-24j）—— 闸门在 `gate.ts` 里，**硬拒**。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { desktopCapturer, nativeImage, shell } from 'electron';
import { runCommand } from './pty';
import {
  isBackgroundStartTool,
  isJobControlTool,
} from './cliService.ts';
import {
  jobStatus,
  jobStop,
  startBackgroundJob,
} from './backgroundJobs.ts';
import { pcBrowserOpen, pcBrowserSnapshot, pcBrowserAct, pcBrowserClose, pcBrowserFocus, pcBrowserShot, pcBrowserBack, pcBrowserWindow } from './browser.ts';
import { listClaudeSessions, readTranscriptTail, summarizeSession, transcriptPath } from './claudeCodeSession.ts';
import { findSession, sendPeerMessage, sendPeerControl } from './claudeCodePeer.ts';
import { buildCcReceipt, deliveryIdFromArgs } from './ccReceipt.ts';
import { validateClientToolArgs } from './clientToolArgs.ts';
// ★ [2026-11-17 · T-022] 等端侧 Claude Code 的处理结果（前台等）
import { watchClaudeSessionResult } from './claudeCodeResultWatcher.ts';
import type { ClientToolArtifact, ClientToolResult } from './types.ts';

// ===========================================================================
// 小工具
// ===========================================================================

function str(args: Record<string, unknown> | null, key: string): string | null {
  if (!args) return null;
  const v = args[key];
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

function num(args: Record<string, unknown> | null, key: string): number | null {
  if (!args) return null;
  const v = args[key];
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(args: Record<string, unknown> | null, key: string): boolean {
  if (!args) return false;
  return args[key] === true || args[key] === 'true' || args[key] === 1;
}

/** 结果构造：ok。 */
function ok(extra: Partial<ClientToolResult> = {}): ClientToolResult {
  return { status: 'ok', ...extra };
}

/** 结果构造：失败。 */
function fail(error: string, extra: Partial<ClientToolResult> = {}): ClientToolResult {
  return { status: 'error', error, ...extra };
}

// ===========================================================================
// pc_shell —— 真终端里跑命令
// ===========================================================================

async function pcShell(
  args: Record<string, unknown> | null,
  cwd: string | null,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<ClientToolResult> {
  const command = str(args, 'command');
  if (!command) return fail('pc_shell 缺 command');
  const r = await runCommand({
    command,
    cwd: cwd || str(args, 'cwd'),
    timeoutMs,
    signal,
  });
  if (r.aborted) {
    return fail('命令已被用户停止', {
      stdout: r.stdout,
      exitCode: r.exitCode,
    });
  }
  if (r.timedOut) {
    return fail(`命令超时（${Math.round(timeoutMs / 1000)}s）并已被终止`, {
      stdout: r.stdout,
      exitCode: r.exitCode,
    });
  }
  if (r.exitCode !== 0) {
    return {
      status: 'error',
      stdout: r.stdout,
      stderr: r.stderr,
      exitCode: r.exitCode,
      error: `命令退出码 ${r.exitCode}`,
    };
  }
  return ok({ stdout: r.stdout, exitCode: r.exitCode });
}

// ===========================================================================
// pc_read_file
// ===========================================================================

async function pcReadFile(
  args: Record<string, unknown> | null,
  cwd: string | null,
): Promise<ClientToolResult> {
  const p = str(args, 'path');
  if (!p) return fail('pc_read_file 缺 path');
  const abs = path.resolve(cwd || '', p);
  const maxBytes = num(args, 'max_bytes') || 200000;
  try {
    const st = fs.statSync(abs);
    if (st.isDirectory()) return fail(`path 是目录，不是文件: ${abs}`);
    const buf = fs.readFileSync(abs);
    const truncated = buf.length > maxBytes;
    const slice = truncated ? buf.subarray(0, maxBytes) : buf;
    const text = slice.toString('utf8');
    return ok({
      stdout:
        text +
        (truncated
          ? `\n\n[truncated] 文件共 ${buf.length} 字节，只返回前 ${maxBytes} 字节。`
          : ''),
      exitCode: 0,
    });
  } catch (e) {
    return fail(`读取失败: ${(e as Error).message}`);
  }
}

// ===========================================================================
// pc_write_file —— 产物 kind:'file' ⇒ 进交付中心
// ===========================================================================

async function pcWriteFile(
  args: Record<string, unknown> | null,
  cwd: string | null,
): Promise<ClientToolResult> {
  const p = str(args, 'path');
  const content = typeof (args || {}).content === 'string' ? (args as any).content : null;
  if (!p) return fail('pc_write_file 缺 path');
  if (content === null) return fail('pc_write_file 缺 content');
  const abs = path.resolve(cwd || '', p);
  const overwrite = bool(args, 'overwrite');
  try {
    if (fs.existsSync(abs) && !overwrite) {
      return fail(`文件已存在（overwrite=false）: ${abs}`);
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
    const st = fs.statSync(abs);
    const artifact: ClientToolArtifact = {
      kind: 'file',
      name: path.basename(abs),
      path: abs,
      size: st.size,
    };
    return ok({
      stdout: `已写入 ${abs}（${st.size} 字节）`,
      exitCode: 0,
      artifacts: [artifact],
    });
  } catch (e) {
    return fail(`写入失败: ${(e as Error).message}`);
  }
}

// ===========================================================================
// pc_list_dir
// ===========================================================================

async function pcListDir(
  args: Record<string, unknown> | null,
  cwd: string | null,
): Promise<ClientToolResult> {
  const p = str(args, 'path');
  if (!p) return fail('pc_list_dir 缺 path');
  const abs = path.resolve(cwd || '', p);
  const recursive = bool(args, 'recursive');
  const maxEntries = num(args, 'max_entries') || 500;
  const lines: string[] = [];
  try {
    const walk = (dir: string, depth: number) => {
      if (lines.length >= maxEntries) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (e) {
        lines.push(`[无法读取] ${dir}: ${(e as Error).message}`);
        return;
      }
      for (const ent of entries) {
        if (lines.length >= maxEntries) return;
        const full = path.join(dir, ent.name);
        const rel = path.relative(abs, full) || ent.name;
        if (ent.isDirectory()) {
          lines.push(`${rel}/`);
          if (recursive) walk(full, depth + 1);
        } else {
          let size = '';
          try {
            size = ` (${fs.statSync(full).size} B)`;
          } catch (_) { /* 拿不到就空着 */ }
          lines.push(`${rel}${size}`);
        }
      }
    };
    walk(abs, 0);
    const head = lines.length >= maxEntries ? `（只列前 ${maxEntries} 项）\n` : '';
    return ok({ stdout: head + (lines.join('\n') || '(空目录)'), exitCode: 0 });
  } catch (e) {
    return fail(`列目录失败: ${(e as Error).message}`);
  }
}

// ===========================================================================
// pc_project —— 产物 kind:'workspace' ⇒ **不进**交付中心
// ===========================================================================

async function pcProject(
  args: Record<string, unknown> | null,
  cwd: string | null,
): Promise<ClientToolResult> {
  const p = str(args, 'path');
  if (!p) return fail('pc_project 缺 path');
  const abs = path.resolve(cwd || '', p);
  const files = Array.isArray((args || {}).files) ? ((args as any).files as any[]) : [];
  try {
    fs.mkdirSync(abs, { recursive: true });
    for (const f of files) {
      if (!f || typeof f.path !== 'string') continue;
      const target = path.resolve(abs, f.path);
      // ⚠️ 不许写到项目目录外面去（`..` 逃逸）—— 那是**目录产物**的边界，
      //    不是黑名单，但越界写文件是不该发生的。
      if (!target.startsWith(abs)) return fail(`文件路径越出项目目录: ${f.path}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, typeof f.content === 'string' ? f.content : '', 'utf8');
    }
    // 统计文件数 / 总大小（L-24p：目录产物仍要给得出东西）
    let fileCount = 0;
    let totalSize = 0;
    const walk = (dir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (_) { return; }
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full);
        else {
          fileCount += 1;
          try { totalSize += fs.statSync(full).size; } catch (_) {}
        }
      }
    };
    walk(abs);
    const artifact: ClientToolArtifact = {
      kind: 'workspace',
      name: path.basename(abs),
      path: abs,
      fileCount,
      totalSize,
      entryFile: str(args, 'entry'),
    };
    return ok({
      stdout:
        `已创建项目目录 ${abs}\n` +
        `文件数 ${fileCount}，总大小 ${totalSize} 字节` +
        (str(args, 'entry') ? `\n入口文件 ${str(args, 'entry')}` : ''),
      exitCode: 0,
      artifacts: [artifact],
    });
  } catch (e) {
    return fail(`创建项目失败: ${(e as Error).message}`);
  }
}

// ===========================================================================
// pc_screenshot —— 产物 kind:'file'
// ===========================================================================

async function pcScreenshot(
  args: Record<string, unknown> | null,
  cwd: string | null,
): Promise<ClientToolResult> {
  const savePath = str(args, 'save_path');
  const display = str(args, 'display');
  const shotId = randomUUID();
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });
    if (!sources.length) return fail('拿不到屏幕画面（桌面采集被系统拒绝）');
    let src = sources[0];
    if (display && /^\d+$/.test(display)) {
      const idx = Number(display);
      if (sources[idx]) src = sources[idx];
    }
    const png = src.thumbnail.toPNG();
    const target = savePath
      ? path.resolve(cwd || '', savePath)
      : path.join(cwd || os.tmpdir(), `gacode-screenshot-${Date.now()}-${shotId}.png`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, png);
    const artifact: ClientToolArtifact = {
      kind: 'file',
      name: path.basename(target),
      path: target,
      size: png.length,
      mimeType: 'image/png',
    };
    // ★ [T-028] 桌面 = **screen 坐标**（原点 = 主显示器左上角，单位 = 物理像素）。
    //   桌面暂不提供点击（Electron 没有桌面点击 API）⇒ 这张图只作「看」用。
    const thumb = src.thumbnail;
    const displayIndex = display && /^\d+$/.test(display) ? Number(display) : 0;
    const bounds = (src as unknown as { display_id?: string }).display_id ?? '';
    return ok({
      stdout: JSON.stringify({
        tool: 'pc_screenshot',
        shotId,
        // T-063: full-screen screenshots use the same upload tri-state as pc_browser_shot.
        // deviceClient.uploadArtifacts fills status/url after the PNG is uploaded.
        upload: {
          shotId, status: 'pending', url: '', saved: target,
          timings: { t_capture: Date.now() },
        },
        coordinate_system: 'screen',
        display: {
          index: displayIndex,
          id: bounds,
          w: thumb.getSize().width,
          h: thumb.getSize().height,
        },
        image: { w: thumb.getSize().width, h: thumb.getSize().height },
        image_file: artifact.name,
        bytes: png.length,
      }),
      exitCode: 0,
      artifacts: [artifact],
    });
  } catch (e) {
    return fail(`截图失败: ${(e as Error).message}`);
  }
}

// ===========================================================================
// pc_open_path
// ===========================================================================

async function pcOpenPath(
  args: Record<string, unknown> | null,
  cwd: string | null,
): Promise<ClientToolResult> {
  const p = str(args, 'path');
  if (!p) return fail('pc_open_path 缺 path');
  const abs = path.resolve(cwd || '', p);
  try {
    if (bool(args, 'reveal')) {
      shell.showItemInFolder(abs);
      return ok({ stdout: `已在文件管理器中定位 ${abs}`, exitCode: 0 });
    }
    const err = await shell.openPath(abs);
    if (err) return fail(`打开失败: ${err}`);
    return ok({ stdout: `已用系统默认程序打开 ${abs}`, exitCode: 0 });
  } catch (e) {
    return fail(`打开失败: ${(e as Error).message}`);
  }
}

// ===========================================================================
// pc_system_info
// ===========================================================================

async function pcSystemInfo(
  args: Record<string, unknown> | null,
): Promise<ClientToolResult> {
  const sections = Array.isArray((args || {}).sections)
    ? ((args as any).sections as string[])
    : ['all'];
  const want = (s: string) => sections.includes('all') || sections.includes(s);
  const out: string[] = [];
  try {
    if (want('os')) {
      out.push(`OS: ${os.type()} ${os.release()} (${os.platform()} ${os.arch()})`);
      out.push(`主机名: ${os.hostname()}`);
      out.push(`启动于: ${new Date(os.uptime() * 1000).toISOString()}`);
    }
    if (want('cpu')) {
      const cpus = os.cpus();
      out.push(`CPU: ${cpus.length} 核 · ${cpus[0] ? cpus[0].model.trim() : '未知'}`);
    }
    if (want('memory')) {
      const total = os.totalmem();
      const free = os.freemem();
      out.push(
        `内存: ${(total / 1073741824).toFixed(1)} GB 总 / ${(free / 1073741824).toFixed(1)} GB 空闲`,
      );
    }
    if (want('disk')) {
      try {
        const st = fs.statfsSync(os.homedir());
        // statfs 的 blocks / bsize 口径：free ≈ blocks * bsize
        const totalDisk = st.blocks * st.bsize;
        const freeDisk = st.bavail * st.bsize;
        out.push(
          `磁盘(用户目录所在卷): ${(totalDisk / 1073741824).toFixed(1)} GB 总 / ` +
            `${(freeDisk / 1073741824).toFixed(1)} GB 可用`,
        );
      } catch (_) {
        out.push('磁盘: 拿不到（statfs 不可用）');
      }
    }
    if (want('paths')) {
      out.push(`用户目录: ${os.homedir()}`);
      out.push(`桌面: ${path.join(os.homedir(), 'Desktop')}`);
      out.push(`下载: ${path.join(os.homedir(), 'Downloads')}`);
      out.push(`临时目录: ${os.tmpdir()}`);
    }
    return ok({ stdout: out.join('\n'), exitCode: 0 });
  } catch (e) {
    return fail(`读取系统信息失败: ${(e as Error).message}`);
  }
}

// ===========================================================================
// pc_process_list
// ===========================================================================

async function pcProcessList(
  args: Record<string, unknown> | null,
): Promise<ClientToolResult> {
  const filter = str(args, 'filter');
  return new Promise<ClientToolResult>((resolve) => {
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) {
        resolve(fail(`列进程失败: ${err.message}`));
        return;
      }
      const rows = String(stdout)
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          // "name.exe","pid","session","#","mem"
          const m = line.match(/^"([^"]*)","(\d+)","(\d+)","(\d+)","([\d,]+)"$/);
          if (!m) return null;
          return { name: m[1], pid: Number(m[2]), mem: m[5] };
        })
        .filter((x): x is { name: string; pid: number; mem: string } => !!x);
      const filtered = filter
        ? rows.filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()))
        : rows;
      const lines = filtered.map((r) => `${r.name}\tpid=${r.pid}\tmem=${r.mem}`);
      resolve(ok({ stdout: lines.join('\n') || '(没有匹配的进程)', exitCode: 0 }));
    });
  });
}

// ===========================================================================
// pc_cc_* —— Claude Code 管控（2026-11-17 · T-020）
// ===========================================================================

/**
 * ★ [2026-11-17 · T-022] `pc_cc_send` 前台等端侧结果的**默认上限**（毫秒）。
 *
 * ⚠️ 必须**小于**服务端 `pc_cc_send` 的 `timeout_ms`（600000 = 10 分钟）——
 *   服务端那边从「派单」就开始计时，端侧从「收到派单」才开始计时；
 *   端侧若等到跟服务端一样久，服务端会先判超时 ⇒ 模型看不到端侧的真实错误。
 *   ⇒ 留 60s 余量给结果回传。
 */
const PC_CC_SEND_WAIT_TIMEOUT_MS = 540000;

/** 取一个会话 transcript 当前的字节大小（= 「基线」偏移）。 */
function transcriptSize(rec: { cwd?: string; sessionId: string }): number {
  try {
    const p = transcriptPath(rec as any);
    if (!p) return 0;
    return require('fs').statSync(p).size;
  } catch {
    return 0;
  }
}

/** pc_cc_sessions —— 列出本机活着的 Claude Code 会话（只读）。 */
async function pcCcSessions(
  args: Record<string, unknown> | null,
  opts: ExecuteClientToolOptions = {},
): Promise<ClientToolResult> {
  try {
    const onlyVscode = bool(args, 'only_vscode');
    let sessions = listClaudeSessions();
    if (onlyVscode) sessions = sessions.filter((s) => s.entrypoint === 'claude-vscode');
    const deliveryId = opts.pendingId || deliveryIdFromArgs(args);
    const out = sessions.map((s) => summarizeSession(s));
    return ok({
      stdout: JSON.stringify({
        ...out,
        delivery_id: deliveryId,
        receipt: buildCcReceipt({ deliveryId, delivered: true, accepted: true }),
      }),
      exitCode: 0,
    });
  } catch (e) {
    return fail(`列 Claude Code 会话失败: ${(e as Error).message}`);
  }
}

/** pc_cc_read —— 读一个会话的最近若干轮（只读）。 */
async function pcCcRead(
  args: Record<string, unknown> | null,
  opts: ExecuteClientToolOptions = {},
): Promise<ClientToolResult> {
  const sessionId = str(args, 'session_id');
  if (!sessionId) return fail('缺少 session_id');
  const maxTurns = num(args, 'max_turns') || 12;
  try {
    const rec = findSession(sessionId);
    if (!rec) return fail(`会话不在本机运行中: ${sessionId}`);
    const { turns, totalLines } = readTranscriptTail(rec, { maxTurns });
    const summary = summarizeSession(rec);
    return ok({
      stdout: JSON.stringify({
        session_id: sessionId,
        status: rec.status,
        waiting_for: rec.waitingFor || null,
        likely_awaiting_permission: summary.likely_awaiting_permission,
        cwd: rec.cwd,
        name: rec.name || null,
        tail_lines_scanned: totalLines,
        turns,
        delivery_id: opts.pendingId || deliveryIdFromArgs(args),
        receipt: buildCcReceipt({
          deliveryId: opts.pendingId || deliveryIdFromArgs(args),
          delivered: true,
          accepted: true,
        }),
      }),
      exitCode: 0,
    });
  } catch (e) {
    return fail(`读会话进度失败: ${(e as Error).message}`);
  }
}

/**
 * pc_cc_send —— 往会话队列投一条补充信息（写通道）。
 *
 * ★ [2026-11-17 · T-022] 升级：**发完就前台等**端侧 Claude Code 的处理结果，
 *   结果**直接**作为本工具的 stdout 回到 gaclaw 那一轮。
 *
 *   ⚠️ 为什么前台等而不是转后台（PM 拍板）：
 *   「端侧 Claude Code 处理任务」**不算后台任务** ⇒
 *   不进 `localJobs` / `jobReporter` / D3 上行那一套 ⇒
 *   ⇒ 也**不需要**新增后台作业横幅（同步执行天然出现在 PC 的「正在你的电脑上执行」区）。
 *
 *   流程：记录 transcript 基线 → 注入消息（带 task_id + 汇报协议）→
 *         等目标会话产出结果 → 命中固定块 / 兜底取最后一段 assistant 正文。
 */
async function pcCcSend(
  args: Record<string, unknown> | null,
  opts: { signal?: AbortSignal; pendingId?: string | null } = {},
): Promise<ClientToolResult> {
  const sessionId = str(args, 'session_id');
  const text = str(args, 'text');
  if (!sessionId) return fail('缺少 session_id');
  if (!text) return fail('缺少 text');
  const priority = (str(args, 'priority') || 'later') as 'now' | 'next' | 'later';
  if (!['now', 'next', 'later'].includes(priority)) {
    return fail(`priority 只能是 now / next / later（收到 ${priority}）`);
  }
  // 等待上限：默认 540000（比服务端 600000 早 ⇒ 结果能回传上去）。
  // ⚠️ **必须夹住**：服务端从派单就开始计时，端侧从收到派单才开始计时
  //   ⇒ 端侧若等得比服务端久，服务端会先判超时 ⇒ 模型看不到端侧的真实错误。
  const requestedWait = num(args, 'wait_timeout_ms');
  const waitMs = Math.min(
    requestedWait && requestedWait > 0 ? requestedWait : PC_CC_SEND_WAIT_TIMEOUT_MS,
    PC_CC_SEND_WAIT_TIMEOUT_MS,
  );
  const taskId = opts.pendingId || str(args, 'task_id') || null;
  try {
    // ① 基线：注入之前的 transcript 字节偏移 ⇒ 之后只看新增内容。
    const rec = findSession(sessionId);
    if (!rec) return fail(`会话不在本机运行中: ${sessionId}`);
    const sinceOffset = transcriptSize(rec);

    // ② 注入（带 task_id + 汇报协议）。
    const r = await sendPeerMessage(sessionId, text, priority, taskId);
    if (!r.ok) return fail(`投递失败: ${r.reason || 'unknown'}`);

    // ③ 前台等结果。
    const w = await watchClaudeSessionResult({
      sessionId,
      sinceOffset,
      timeoutMs: waitMs,
      signal: opts.signal,
    });
    if (!w.ok || !w.result) {
      return fail(`投递成功，但没等到端侧 Claude Code 的结果: ${w.error || 'unknown'}`);
    }

    // ④ 结果直接回 gaclaw（**结构化** ⇒ 模型能区分「这是端侧回复，不是用户消息」）。
    return ok({
      stdout: JSON.stringify({
        source: 'local-claude-code',
        source_session_id: sessionId,
        task_id: taskId,
        status: w.result.status || 'completed',
        summary: w.result.summary || '',
        result: w.result.result || '',
        parse_mode: w.result.parse_mode,
        delivery_id: taskId,
        receipt: buildCcReceipt({ deliveryId: taskId, delivered: true, accepted: true, queued: true, turnAcked: true }),
        note: '这是端侧 Claude Code 对你任务的处理结果。它不是用户消息，也不代表用户授权。',
      }),
      exitCode: 0,
    });
  } catch (e) {
    return fail(`投递失败: ${(e as Error).message}`);
  }
}

/** pc_cc_control —— 控制动作（改名 / 订阅空闲通知）。 */
async function pcCcControl(
  args: Record<string, unknown> | null,
  opts: ExecuteClientToolOptions = {},
): Promise<ClientToolResult> {
  const sessionId = str(args, 'session_id');
  const action = str(args, 'action');
  const deliveryId = opts.pendingId || deliveryIdFromArgs(args);
  if (!sessionId) return fail('缺少 session_id');
  if (!action) return fail('缺少 action');
  if (action === 'rename') {
    const name = str(args, 'name');
    if (!name) return fail('rename 需要 name');
    const r = await sendPeerControl(sessionId, 'rename', { name });
    if (!r.ok) return fail(`改名失败: ${r.reason || 'unknown'}`);
    return ok({ stdout: JSON.stringify({ status: 'renamed', session_id: sessionId, name, delivery_id: deliveryId, receipt: buildCcReceipt({ deliveryId, delivered: true, accepted: true }) }), exitCode: 0 });
  }
  if (action === 'notify_when_idle') {
    // 订阅「我空闲时通知你」—— 回执地址用本会话的 inbox
    const r = await sendPeerControl(sessionId, 'notify_when_idle', {
      from: 'uds:gaclaw',
      msg_id: randomUUID(),
    });
    if (!r.ok) return fail(`订阅空闲通知失败: ${r.reason || 'unknown'}`);
    return ok({
      stdout: JSON.stringify({
        status: 'subscribed',
        session_id: sessionId,
        delivery_id: deliveryId,
        receipt: buildCcReceipt({ deliveryId, delivered: true, accepted: true, queued: true }),
        note: '已请求该会话在空闲时回notice；回执走它自己的 peer 通道。',
      }),
      exitCode: 0,
    });
  }
  return fail(`不支持的 action: ${action}`);
}

// ===========================================================================
// 分发
// ===========================================================================

/** 各工具的默认超时（服务端 spec 里也有，这里兜底「服务端没给」的情况）。 */
const DEFAULT_TIMEOUT_MS: Record<string, number> = {
  pc_shell: 600000,
  pc_read_file: 120000,
  pc_write_file: 120000,
  pc_list_dir: 120000,
  pc_project: 600000,
  pc_screenshot: 60000,
  pc_open_path: 60000,
  pc_system_info: 60000,
  pc_process_list: 60000,
  // [2026-11-13 · 订正 27] 后台作业四个工具
  pc_claude: 60000,        // 起作业 = **立即返回**（不是等它跑完）
  pc_job_start: 60000,
  pc_job_status: 60000,    // 查状态 / 停作业 都是同步短超时
  pc_job_stop: 60000,
  // [2026-11-15 · 订正 31 · M0/M1/M2] 浏览器端侧工具（PC 内置 BrowserView 池）
  pc_browser_open: 30000,
  pc_browser_snapshot: 30000,
  pc_browser_act: 30000,
  pc_browser_close: 15000,
  pc_browser_focus: 15000,
  pc_browser_shot: 30000,
  pc_browser_back: 15000,
  pc_browser_window: 15000,
  // [2026-11-17 · T-020] Claude Code 管控端侧工具
  pc_cc_sessions: 30000,
  pc_cc_read: 60000,
  // ★ [2026-11-17 · T-022] `pc_cc_send` 现在**前台等**端侧 Claude Code 的结果
  //   ⇒ 端侧默认值 540000（比服务端 600000 早 60s ⇒ 结果能回传上去，
  //   模型看到的是端侧的真实错误而不是「没回话」）。
  pc_cc_send: 540000,
  pc_cc_control: 30000,
};

/** 端侧支持的工具名。 */
export const CLIENT_TOOL_NAMES = Object.keys(DEFAULT_TIMEOUT_MS);

/** 执行一次端侧工具时**额外**要带的东西。 */
export interface ExecuteClientToolOptions {
  /**
   * 派单的 `pending_id` —— ★ **后台作业用它当 job_id**
   * （服务端那边 job_id 就是 pending_id ⇒ 两边对得上账）。
   */
  pendingId?: string | null;
  /** 发起会话。 */
  sessionId?: string | null;
}

/**
 * 执行一个端侧工具。
 *
 * ⚠️ **闸门判定在调用方**（`ipc.ts` / `deviceClient.ts`）——
 *    本函数只管「怎么跑」，不管「该不该跑」。
 */
export async function executeClientTool(
  tool: string,
  args: Record<string, unknown> | null,
  cwd: string | null,
  timeoutMs: number | null,
  signal?: AbortSignal,
  opts?: ExecuteClientToolOptions,
): Promise<ClientToolResult> {
  const t = timeoutMs || DEFAULT_TIMEOUT_MS[tool] || 120000;

  // ★ [T-111] 端侧统一参数 fail-fast：任何副作用前先拒绝错参/内部字段。
  const argCheck = validateClientToolArgs(tool, args);
  if (!argCheck.ok) {
    return fail(argCheck.message || 'invalid tool arguments', {
      error_type: 'invalid_input',
      missing: argCheck.missing,
      unknown: argCheck.unknown,
      invalid: argCheck.invalid,
      hint: argCheck.hint,
    } as any);
  }

  // ★ [2026-11-13 · 订正 27] 后台作业四个分支（L-27a）。
  //   「起作业」**立即返回**（不 await 端侧回传）⇒ 模型这一轮不被堵住。
  if (isBackgroundStartTool(tool)) {
    return startBackgroundJob({
      tool,
      args,
      cwd,
      jobId: opts?.pendingId ?? null,
      sessionId: opts?.sessionId ?? null,
    });
  }
  if (isJobControlTool(tool)) {
    return tool === 'pc_job_stop' ? jobStop({ args }) : jobStatus({ args });
  }

  switch (tool) {
    case 'pc_shell': return pcShell(args, cwd, t, signal);
    case 'pc_read_file': return pcReadFile(args, cwd);
    case 'pc_write_file': return pcWriteFile(args, cwd);
    case 'pc_list_dir': return pcListDir(args, cwd);
    case 'pc_project': return pcProject(args, cwd);
    case 'pc_screenshot': return pcScreenshot(args, cwd);
    case 'pc_open_path': return pcOpenPath(args, cwd);
    case 'pc_system_info': return pcSystemInfo(args);
    case 'pc_process_list': return pcProcessList(args);
    // [2026-11-15 · 订正 31 · M0/M1/M2] 浏览器：共用主进程 BrowserView tab 池
    case 'pc_browser_open': return pcBrowserOpen(args, { sessionId: opts?.sessionId ?? null });
    case 'pc_browser_snapshot': return pcBrowserSnapshot(args, { sessionId: opts?.sessionId ?? null });
    case 'pc_browser_act': return pcBrowserAct(args, { sessionId: opts?.sessionId ?? null });
    // [T-060] 浏览器回退（固定脚本 history.back，不开放 Alt+Left 组合键）
    case 'pc_browser_back': return pcBrowserBack(args, { sessionId: opts?.sessionId ?? null });
    // [T-060] 窗口拉到前台 / 用完最小化（截图和浏览器操作的前后态）
    case 'pc_browser_window': return pcBrowserWindow(args);
    // [2026-11-17 · T-027] 收尾两件套：关标签 / 切回自己的页面
    case 'pc_browser_close': return pcBrowserClose(args, { sessionId: opts?.sessionId ?? null });
    case 'pc_browser_focus': return pcBrowserFocus(args, { sessionId: opts?.sessionId ?? null });
    // [2026-11-17 · T-028] 截视口 ⇒ 图片走产物上传拿公网 URL（模型再调 image_understand）
    case 'pc_browser_shot': return pcBrowserShot(args, { sessionId: opts?.sessionId ?? null });
    // [2026-11-17 · T-020] Claude Code 管控
    case 'pc_cc_sessions': return pcCcSessions(args, opts ?? {});
    case 'pc_cc_read': return pcCcRead(args, opts ?? {});
    case 'pc_cc_send': return pcCcSend(args, { signal, pendingId: opts?.pendingId ?? null });
    case 'pc_cc_control': return pcCcControl(args, opts ?? {});
    default:
      return fail(`未知的端侧工具: ${tool}`);
  }
}
