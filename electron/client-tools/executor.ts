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
import { listClaudeSessions, readTranscriptTail, summarizeSession, transcriptPath, waitForFirstAssistantReply } from './claudeCodeSession.ts';
import { findSession, sendPeerMessage, sendPeerAppend, sendPeerControl } from './claudeCodePeer.ts';
import { resolveClaudeBinary } from './claudeService.ts';
import { buildClaudeBgInvocation } from './claudeService.ts';
import { resolveClaudeLaunchCwd } from './claudeTrust.ts';
import { stopClaudeBgSession } from './claudeBgSession.ts';
import { buildCcReceipt, deliveryIdFromArgs } from './ccReceipt.ts';
import { acquirePersistentSession, closePersistentSession, listPersistentSessions, setPersistentSessionBgId, touchPersistentSession } from './ccPersistentSession.ts';
import { validateClientToolArgs } from './clientToolArgs.ts';
import type { PeerReplyTo } from './claudeResultFormat.ts';
import { buildNotifyPeerMessageContent } from './claudeResultFormat.ts';
// ★ [T-154-cc] 「端侧兜底」采集器 —— notify_when_idle / pc_cc_new 的结果回投。
//   没有它，契约承诺的「输出标准结果块由端侧兜底」是**空头支票**（见 T-154-cc 事故）。
import { ccResultCollector } from './ccResultCollector.ts';
// ★ [2026-11-19 · T-068 / T-072] peer notice 读侧：注入后登记订阅，
//   结果由后台 peer-job 管理器从 transcript 增量裁决。
import { claudeCodePeerInbox } from './claudeCodePeerInbox.ts';
// [T-069] 诊断日志：走 peerLog ⇒ 生产落 client-tools.log，单测只 console。
import { peerLog } from './peerLog.ts';
// ⚠️ [T-128b] 修掉重复 import（origin/main 遗留：第 49 行已经 import 过 claudeCodePeer 的
//   findSession / sendPeerMessage / sendPeerControl ⇒ 这里再 import 一次 ⇒ TS2300
//   「Duplicate identifier」⇒ 整个 node typecheck 直接红）。
// [T-086] QMT WorkBuddy 本机 stdio bridge（受控只读 + 审核门下单）
import { executeQmtTool } from './qmtBridge.ts';
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
    const out = sessions.map((s) => ({
      ...summarizeSession(s),
      // ★ [T-128-fix] 后台会话（claude --bg）：带 bg_id ⇒ pc_cc_close 能直接关它。
      ...(s.kind === 'bg' || s.entrypoint === 'cli'
        ? { is_background: true, bg_id: s.jobId || s.sessionId.split('-')[0] || null }
        : {}),
      // 有信箱 ⇒ pc_cc_send/append 能投递
      deliverable: !!s.messagingSocketPath,
    }));
    const persistent = listPersistentSessions().map((p) => ({
      session_id: p.session_id,
      cwd: p.cwd,
      name: p.name,
      active_job_id: p.active_job_id,
      last_activity_at: p.last_activity_at,
    }));
    return ok({
      stdout: JSON.stringify({
        ...out,
        persistent_sessions: persistent,
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
 * [T-086] 从 args 读 reply-to（字段名以服务端为准，带容错别名）。
 * 服务端契约字段：`reply_to_business_session_id` / `reply_to_cc_session_id` / `reply_channel`。
 * 容错：camelCase、嵌套 `reply_to` 对象、`session_id` 简写。
 */
function readPeerReplyTo(args: Record<string, unknown> | null): PeerReplyTo | null {
  if (!args) return null;
  const nested = args.reply_to && typeof args.reply_to === 'object' && !Array.isArray(args.reply_to)
    ? args.reply_to as Record<string, unknown>
    : null;
  const pick = (...keys: string[]): string => {
    for (const key of keys) {
      const direct = str(args, key);
      if (direct) return direct;
      if (nested) {
        const inner = str(nested, key);
        if (inner) return inner;
      }
    }
    return '';
  };
  const business_session_id = pick(
    'reply_to_business_session_id', 'replyToBusinessSessionId',
    'business_session_id', 'businessSessionId',
  );
  const cc_session_id = pick(
    'reply_to_cc_session_id', 'replyToCcSessionId',
    'cc_session_id', 'ccSessionId',
  );
  const channel = pick('reply_channel', 'replyChannel');
  if (!business_session_id && !cc_session_id && !channel) return null;
  return { business_session_id, cc_session_id, channel };
}

/**
 * pc_cc_send —— 往会话队列投一条补充信息（写通道）。
 *
 * ★ [2026-11-19 · T-068 / T-072] 已 job 化：**投递 + 登记订阅后立即返回**，
 *   不是前台等 9 分钟；结果由 `peerJobManager` 在 notice / 慢 poll / 超时时
 *   从 transcript 增量里按 task_id 裁决，并走 D3 回传一次（另起一轮汇报）。
 *
 *   流程：记录 transcript 基线 → 注入消息（带 task_id + reply-to + 汇报协议）→
 *         inbox 先登记 msgId 映射 → 发 `notify_when_idle`（from = 合法 pipe）→
 *         peerJobManager.track / bind ⇒ 本函数返回「已投递」。
 */
async function pcCcSend(
  args: Record<string, unknown> | null,
  opts: { signal?: AbortSignal; pendingId?: string | null; sessionId?: string | null } = {},
): Promise<ClientToolResult> {
  const sessionId = str(args, 'session_id');
  const text = str(args, 'text');
  if (!sessionId) return fail('缺少 session_id');
  if (!text) return fail('缺少 text');
  const priority = (str(args, 'priority') || 'later') as 'now' | 'next' | 'later';
  if (!['now', 'next', 'later'].includes(priority)) {
    return fail(`priority 只能是 now / next / later（收到 ${priority}）`);
  }
  // task_id = 服务端 pending_id（后台 job_id）—— 结果块的强校验身份。
  const taskId = opts.pendingId || str(args, 'task_id') || null;
  // ⚠️ 纯渲染层直接调用（没有 pending_id）没有 D3 回传通道 ⇒ 明确拒绝，
  //    不许退化成「假装成功但结果永远丢」。
  if (!taskId) return fail('pc_cc_send 需要 pending_id（后台派单）才能回传结果');
  // [T-086] reply-to：服务端透传的回信地址，写进注入消息供端侧主动回信使用。
  const replyTo = readPeerReplyTo(args);
  try {
    // ① 基线：注入之前的 transcript 字节偏移 ⇒ 之后只看新增内容。
    const rec = findSession(sessionId);
    if (!rec) return fail(`会话不在本机运行中: ${sessionId}`);
    const sinceOffset = transcriptSize(rec);

    // ② 先懒启动 inbox，拿到合法 reply target。
    try { claudeCodePeerInbox.start(); } catch (e) {
      return fail(`启动 peer inbox 失败: ${(e as Error).message}`);
    }
    const from = claudeCodePeerInbox.from();
    if (!from) return fail('peer inbox 未启动，无法订阅空闲通知');

    // ③ 注入（带 task_id + reply-to + 汇报协议）。
    const r = await sendPeerMessage(sessionId, text, priority, taskId, replyTo);
    if (!r.ok) return fail(`投递失败: ${r.reason || 'unknown'}`);
    touchPersistentSession(sessionId);

    // ④ 先登记映射、再发订阅帧 ⇒ 回执不会落在登记之前。
    const msgId = randomUUID();
    claudeCodePeerInbox.register({
      msgId,
      pendingId: taskId,
      sessionId,
      taskId,
      sinceOffset,
    });
    const sub = await sendPeerControl(sessionId, 'notify_when_idle', { msg_id: msgId }, { from });
    if (!sub.ok) {
      claudeCodePeerInbox.cancel(msgId);
      return fail(`订阅空闲通知失败: ${sub.reason || 'unknown'}`);
    }

    // ⑤ 交给后台 job 管理器；首个合法结果块出现时它才 D3 回传一次。
    const { peerJobManager } = await import('./deviceClient.ts');
    peerJobManager.track(taskId, msgId);
    peerJobManager.bind(taskId, { sessionId, taskId, sinceOffset });
    // ★ [T-088] 补上业务会话 + reply_to（用于断链时写 channel-status / 主动补回）。
    const replyArgs = args?.reply_to || args?.replyTo;
    const machineReplyTo = replyArgs && typeof replyArgs === 'object'
      ? {
          taskId: typeof (replyArgs as any).task_id === 'string' ? (replyArgs as any).task_id : null,
          ccSessionId: typeof (replyArgs as any).cc_session_id === 'string' ? (replyArgs as any).cc_session_id : null,
          businessSessionId: typeof (replyArgs as any).business_session_id === 'string' ? (replyArgs as any).business_session_id : null,
          channel: typeof (replyArgs as any).channel === 'string' ? (replyArgs as any).channel : null,
        }
      : null;
    peerJobManager.bindBusinessContext(taskId, {
      sessionId: opts.sessionId || null, // ★ 业务会话（= 发起这次派单的 gacode session）
      replyTo: machineReplyTo,
    });

    // ⑥ 用户点「停止」⇒ 取消订阅 + 以 cancelled 结账（不会再有结果回传）。
    opts.signal?.addEventListener('abort', () => {
      peerJobManager.cancel(taskId, true);
    }, { once: true });

    return ok({
      stdout: JSON.stringify({
        source: 'local-claude-code',
        status: 'dispatched',
        task_id: taskId,
        session_id: sessionId,
        note: '消息已投递；结果将在新一轮由本机 Claude Code 回传，不是用户消息，也不是用户授权。',
      }),
      exitCode: 0,
    });
  } catch (e) {
    return fail(`投递失败: ${(e as Error).message}`);
  }
}

/**
 * [T-111] pc_cc_append —— 轻量追加信息（fire-and-forget）。
 *
 * ⚠️ 只做「本机写通道投递」这一件事：
 *   · 不订阅回报 / 不等 Claude Code 结果（没有 watcher）；
 *   · 不创建 job / work_unit，不发 job_result（不另起一轮汇报）；
 *   · 回执只到 queued（visible 需目标侧后验），**没有 turn_acked**。
 */
async function pcCcAppend(args: Record<string, unknown> | null): Promise<ClientToolResult> {
  const sessionId = str(args, 'session_id');
  const text = str(args, 'text');
  if (!sessionId) return fail('缺少 session_id', { error_type: 'invalid_input' } as any);
  if (!text) return fail('缺少 text', { error_type: 'invalid_input' } as any);
  const taskId = str(args, 'task_id');
  const deliveryId = taskId ? `pc_cc_append:${sessionId}:${taskId}` : `pc_cc_append:${sessionId}:${Date.now()}`;
  try {
    const r = await sendPeerAppend(sessionId, text, taskId);
    if (!r.ok) {
      if (r.reason === 'session_not_live') return fail(`会话不在本机运行中: ${sessionId}`);
      return fail(`投递失败: ${r.reason || 'unknown'}`);
    }
    return ok({
      stdout: JSON.stringify({
        status: 'ok',
        tool: 'pc_cc_append',
        append_kind: 'pc_cc_append',
        delivered: true,
        accepted: true,
        queued: true,
        visible: false,
        session_id: sessionId,
        task_id: taskId,
        delivery_id: deliveryId,
        note: '已把补充信息追加到本机 Claude Code 会话；不代表它已处理，也没有订阅回报。',
      }),
      exitCode: 0,
    });
  } catch (e) {
    return fail(`投递失败: ${(e as Error).message}`);
  }
}

/**
 * ★ [T-128-fix] pc_cc_new 的真正常驻实现：
 *   `claude --bg` 返回后，从 `claude agents --json` 找 kind=background + name 的会话，
 *   拿真实 sessionId/bg_id 登记。这样 `~/.claude/sessions` 一直有活会话，
 *   pc_cc_send/append 的 peer IPC 才能找到目标。
 */
async function pcCcNewBg(
  args: Record<string, unknown> | null,
  cwd: string | null,
  opts?: ExecuteClientToolOptions,
): Promise<ClientToolResult> {
  const task = str(args, 'task');
  if (!task) return fail('pc_cc_new 缺 task');
  const name = str(args, 'name') || `gacode-persistent-${Date.now()}`;
  const cli = resolveClaudeBinary();
  if (!cli) return fail('找不到 Claude Code 可执行文件（claude）');

  // ★ [T-154-cc] 先把「回报任务号」和「回投目标」算好 ——
  //   回报合同要**跟着初始 prompt 一起送进去**（见下），所以必须在起会话**之前**算。
  //
  //   task_id 优先用服务端 pending_id（命中未结 dispatch 时服务端会判成
  //   `work_unit_result`，形态更好）；拿不到就客户端生成一个。
  const collectTaskId = (opts?.pendingId && String(opts.pendingId).trim()) || `pc_cc_new:${randomUUID()}`;
  const collectBusinessSession = opts?.sessionId ? String(opts.sessionId) : '';
  const collectEnabled = !!collectBusinessSession;

  // ★ [T-154-cc] 回报合同**跟着初始 prompt 走**。
  //
  //   为什么不是「事后 peer 注入」：会话刚起时 peer socket 未必就绪
  //   （`sendPeerMessage` 会回 `session_not_live`）⇒ 注入可能直接失败 ⇒
  //   合同丢了 ⇒ 对端永远不知道要输出结果块。
  //   而 prompt 是**必达**的（跟 `pc_claude` 追加合同是同一个套路）。
  const taskWithContract = collectEnabled
    ? task + '\n\n' + buildNotifyPeerMessageContent(
      '你有一项 gaclaw 通知：完成当前工作后，使用 mcp__gaclaw__send 按 reply_to 主动回报结论；'
      + '若当前会话没有该 MCP 工具，再输出下面的标准结果块，端侧会自动采集并投回本会话收件箱。',
      collectTaskId,
      { business_session_id: collectBusinessSession, channel: 'inbox' },
      { value: 'report_when_idle' },
    )
    : task;

  // ★ [T-128-fix] 信任兜底：cwd 不被信任时，CLI 会拒绝启动（stderr: Workspace not trusted）。
  //   ⇒ 换到受信任的祖先目录起会话，目标目录用 --add-dir 授权。
  const launch = resolveClaudeLaunchCwd(cwd);
  const invocation = buildClaudeBgInvocation({
    args: { task: taskWithContract, name, add_dir: launch.addDir || undefined },
    cwd: launch.cwd,
    timeoutMs: null,
    jobId: name,
  });
  // ⚠️ 目标目录未被信任 ⇒ 只能在受信任目录跑（CLI 的 --add-dir 也要求目标已信任）。
  //   ⇒ 如实告知，别让模型以为它就在那个目录里。
  const trustNote = launch.untrustedTarget
    ? `注意：目标目录 ${launch.untrustedTarget} 尚未被 Claude Code 信任（信任记录在 ~/.claude.json），`
      + `本次会话实际运行目录是 ${launch.cwd}；请在该目录下手动运行一次 claude 并接受信任提示，之后就能直接在目标目录跑。`
    : '';
  if (!invocation) return fail('无法构造 Claude Code 常驻启动命令');

  // 1) 启动 --bg：CLI 自己后台化并立刻返回，stdout 形如
  //    `backgrounded · <bg_id> · <name>` ⇒ **直接解析 bg_id**，不要靠 name 反查
  //    （实测 `--bg` 会忽略 `--name`，会话实际 name 变成 hex id ⇒ 按 name 匹配必然失败）。
  let bgId = '';
  let stdout = '';
  let stderr = '';
  try {
    const captured = await new Promise<{ out: string; err: string }>((resolve, reject) => {
      const child = require('child_process').spawn(invocation.command, invocation.args, {
        cwd: invocation.cwd || undefined,
        // ⚠️ stderr **必须**捕获：CLI 的失败原因（如 Workspace not trusted）只走 stderr
        //    ⇒ 丢掉它就只剩「(无输出)」，模型完全看不到真实原因。
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let out = '';
      let err = '';
      child.stdout?.on('data', (d: any) => { out += d.toString(); });
      child.stderr?.on('data', (d: any) => { err += d.toString(); });
      child.on('error', reject);
      child.on('close', () => resolve({ out, err }));
    });
    stdout = captured.out;
    stderr = captured.err;
  } catch (e) {
    return fail(`启动 Claude Code 常驻会话失败: ${(e as Error).message}`);
  }
  const m = /backgrounded[^0-9a-fA-F]*([0-9a-fA-F]{6,})/.exec(stdout);
  bgId = m ? m[1] : '';
  if (!bgId) {
    const why = (stderr || stdout).trim().slice(0, 400) || '(无输出)';
    return fail(`Claude Code 常驻会话未启动成功：${why}`);
  }

  // 2) 用 bg_id 到 agents --json 里取真实 sessionId（bg_id 是 sessionId 的前缀）
  const deadline = Date.now() + 20000;
  let found: any = null;
  while (Date.now() < deadline) {
    try {
      const out = await new Promise<string>((resolve) => {
        const child = require('child_process').spawn(cli, ['agents', '--json'], { stdio: ['ignore','pipe','ignore'], windowsHide: true });
        let s=''; child.stdout?.on('data',(d:any)=>s+=d.toString());
        child.on('error',()=>resolve('')); child.on('close',()=>resolve(s));
      });
      const arr = JSON.parse(out || '[]');
      found = arr.find((x:any) => x && (x.id === bgId || (typeof x.sessionId === 'string' && x.sessionId.startsWith(bgId))));
      if (found) break;
    } catch { /* retry */ }
    await new Promise(r=>setTimeout(r,500));
  }
  if (!found || !found.sessionId) {
    // ⚠️ 登记失败 ⇒ **别把后台会话漏在机器上**（否则白占一个常驻进程）。
    try {
      const child = require('child_process').spawn(cli, ['stop', bgId], { stdio: 'ignore', windowsHide: true });
      child.on('error', () => {});
    } catch { /* best-effort */ }
    return fail(`Claude Code 常驻会话已启动（bg_id=${bgId}），但没能从 agents --json 读到 sessionId`);
  }

  // 3) 用 CLI 真实 sessionId 作为对外 session_id，并登记 bg_id
  //    ⚠️ [T-128b] 登记里的 session_id 必须**就是 CLI 那个真 id**
  //    （`acquirePersistentSession` 已修：传了 id 就用它建记录，不再 randomUUID）
  //    ⇒ 顺带 `setPersistentSessionBgId` 也就能命中了（之前按真 id 找记录永远找不到 ⇒ bg_id 永远 null）。
  acquirePersistentSession({ session_id: found.sessionId, cwd: launch.cwd, name: found.name || name });
  setPersistentSessionBgId(found.sessionId, bgId);

  // 3.5) ★ [T-154-cc] **登记回报采集器**（这一步以前根本不存在 ⇒ 结论永远回不来）。
  //
  //   改前：`pc_cc_new` 只负责「把会话建起来 + 等首条回复（≤45s）」，
  //   **之后谁去收最终结论没人管** —— 契约承诺的「输出标准结果块由端侧兜底」
  //   压根没实现（`findResultBlockByTaskId` 只有 pc_cc_send 那条路在用）。
  //   实测事故（2026-11-25 · 业务会话 1192）：常驻会话 `b0f8568c…` 20:17:14
  //   明明输出了完整结果块，服务端 0 命中 ⇒ 结论丢失。
  //
  //   改后：登记采集器 ⇒ 结果块一出现就**投回业务会话收件箱** ⇒ 服务端另起一轮。
  //   （合同已经跟着初始 prompt 送进去了 ⇒ 这里只要盯住 transcript 就行。）
  //
  //   ⚠️ 为什么走**收件箱**而不是 D3：`pc_cc_new` 是**同步**工具 ⇒ 服务端 pending
  //   在工具返回时已结清 ⇒ 再走 D3 只会撞「结果已结过（409）」。
  let collectorKey = '';
  if (collectEnabled) {
    try {
      const sinceOffset = (() => {
        try {
          const rec = findSession(found.sessionId);
          return rec ? transcriptSize(rec) : 0;
        } catch { return 0; }
      })();
      collectorKey = ccResultCollector.register({
        sessionId: found.sessionId,
        taskId: collectTaskId,
        sinceOffset,
        businessSessionId: collectBusinessSession,
        ccSessionId: found.sessionId,
      });
    } catch (e) {
      peerLog('cc-collect', '采集器登记失败 ' + JSON.stringify({
        session_id: found.sessionId, error: (e as Error).message,
      }));
    }
  }

  // 4) ★ [T-128b] 等首条回复（最多 45s）—— `pc_cc_new` 现在是 **sync** 模式：
  //    工具调用要在本轮内把「会话建好了 + 它说了什么」一起回给模型。
  //    ⚠️ 超时**不算失败**：照常返回 session_id（模型稍后可用 pc_cc_read 补看），
  //    绝不能因为首答慢就把刚建好的会话判成失败（那会留下孤儿后台进程）。
  const waitMs = Number(process.env.CC_NEW_FIRST_REPLY_WAIT_MS ?? 45_000);
  const first = await waitForFirstAssistantReply(found.sessionId, Number.isFinite(waitMs) ? waitMs : 45_000);

  return ok({
    stdout: [
      `已在后台启动常驻 Claude Code 会话`,
      `session_id: ${found.sessionId}`,
      `bg_id: ${found.id}`,
      `name: ${name}`,
      `工作目录: ${launch.cwd}`,
      ...(trustNote ? [trustNote] : []),
      ...(first.text
        ? [`首条回复:`, first.text]
        : [`首条回复: (还没出来，会话仍在跑；之后可用 pc_cc_read 看)`]),
      ...(collectorKey
        ? [
            `已挂回报采集器: 任务号 ${collectTaskId}。`,
            '它做完后的结论会**自动回到本会话**（另起一轮送达），不需要你轮询。',
            '注意：不要只用 pc_cc_append 追问（那是 fire-and-forget，不会带回结果）。',
          ]
        : []),
      `后续用 pc_cc_send/append 给这个 session_id 发消息；关闭用 pc_cc_close。`,
    ].join('\n'),
    exitCode: 0,
  });
}

/** pc_cc_close —— T-128 PC-CC-Close：关闭逻辑常驻会话登记。 */
async function pcCcClose(
  args: Record<string, unknown> | null,
): Promise<ClientToolResult> {
  const sessionId = str(args, 'session_id');
  if (!sessionId) return fail('缺少 session_id');
  const removed = closePersistentSession(sessionId);
  // ★ [T-128-fix] 不要求「先 adopt」：本机在跑的后台会话（claude --bg）
  //   直接从 session registry 拿 bg_id（jobId）⇒ 也能关。
  const live = findSession(sessionId);
  const isBg = !!(live && (live.kind === 'bg' || live.entrypoint === 'cli'));
  const bgId = removed?.bg_id || (isBg ? (live!.jobId || sessionId.split('-')[0]) : null);
  if (!removed && !bgId) {
    return fail(`常驻会话不存在或已过期: ${sessionId}`);
  }
  // 有原生 bg_id ⇒ 真停掉 CLI 后台会话，而不只是删登记。
  if (bgId) {
    const stopped = await stopClaudeBgSession(bgId);
    if (!stopped) {
      // ★ [T-128b] `claude stop` 失败**不一定**是失败：会话可能**已经被停掉了**
      //   （空闲 5 分钟清扫先一步停了它 ⇒ 真机实测：关一个已被清扫的会话会报
      //   「关闭 CLI 后台会话失败」，其实它早就不在了）。
      //
      //   ⚠️ 复核必须**便宜**：读本机会话登记文件（`findSession`，一次文件读）
      //   **不许**在这里跑 `claude agents --json` ——
      //   那是**同步** CLI 调用（`execFileSync`），实测在会话正在被停掉时会**挂住**，
      //   而 `execFileSync` 的 timeout 只发 SIGTERM ⇒ 不响应就一直卡
      //   ⇒ 工具调用永不返回 ⇒ D3 回执发不出去 ⇒ 服务端 30s 判 `client_no_response`
      //   （真机 2026-11-24 实测：close 派单 30s 超时、而进程其实已被停掉）。
      await new Promise((r) => setTimeout(r, 300)); // 等 CLI 把登记文件摘掉
      const stillLive = !!findSession(sessionId);
      if (stillLive) {
        return fail(`关闭 CLI 后台会话失败（claude stop ${bgId} 未成功）`);
      }
    }
  }
  return ok({
    stdout: JSON.stringify({
      status: 'closed',
      session_id: sessionId,
      note: '已关闭常驻登记；历史 transcript 保留；之后 pc_cc_new 不再 resume 这个 session_id。',
    }),
    exitCode: 0,
  });
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
    // [T-092] 合成契约：notify 必须带 reply_to，否则 fail-closed（不挂空契约）。
    const requestedMsgId = str(args, 'msg_id');
    const msgId = requestedMsgId || randomUUID();
    const replyTo = readPeerReplyTo(args);
    if (!replyTo?.business_session_id) {
      return fail('notify_when_idle 需要 reply_to_business_session_id（缺少则不挂回报契约）');
    }
    const replyChannel = str(args, 'reply_channel');
    if (replyChannel && replyChannel !== 'inbox') {
      return fail(`notify_when_idle 只支持 reply_channel=inbox（收到 ${replyChannel}）`);
    }
    // ★ [T-154-cc] 先把 business_session_id 收成确定值（上面已 fail-closed 过）——
    //   采集器要拿它当「结果投回哪个业务会话」，不能是 undefined。
    const businessSessionId = String(replyTo.business_session_id);
    const normalizedReplyTo: PeerReplyTo = {
      ...replyTo,
      business_session_id: businessSessionId,
      channel: 'inbox',
    };
    const text = str(args, 'text')
      || '你有一项 gaclaw 通知：完成当前工作后，使用 mcp__gaclaw__send 按 reply_to 主动回报结论；'
      + '若没有该 MCP 工具，再输出标准结果块由端侧兜底；不要猜 session_id；notify 本身不代表已回报。'
      + `（主动回报时请把 idempotencyKey 设成 task_id=${msgId} —— 端侧兜底采集用同一个键 ⇒ 不会重复投递。）`;
    // [T-069] 订阅「我空闲时通知你」—— 登记诊断映射到 inbox，拿合法 reply target。
    let from: string;
    try {
      claudeCodePeerInbox.start();
      const replyTarget = claudeCodePeerInbox.from();
      if (!replyTarget) return fail('peer inbox 未启动，无法订阅空闲通知');
      from = replyTarget;
    } catch (e) {
      return fail(`启动 peer inbox 失败: ${(e as Error).message}`);
    }
    // 先登记诊断映射（notice 只记日志，不回传 D3），再发订阅帧。
    const sinceOffset = (() => {
      try {
        const rec = findSession(sessionId);
        return rec ? transcriptSize(rec) : 0;
      } catch { return 0; }
    })();
    const diag = claudeCodePeerInbox.registerDiagnostic(msgId, sessionId, sinceOffset);
    peerLog('cc-control', 'notify_when_idle subscribe ' + JSON.stringify({
      msg_id: msgId,
      from,
      session_id: sessionId,
      task_id: diag.taskId,
    }));
    // [T-092] 第一步：先注入契约消息（priority=later，不打断当前轮）。
    // task_id = msg_id（合成 notice 可用它定向注入），control 继续用同一个 msg_id。
    const injected = await sendPeerMessage(
      sessionId,
      text,
      'later',
      msgId,
      normalizedReplyTo,
      'report_when_idle',
    );
    if (!injected.ok) {
      claudeCodePeerInbox.cancel(msgId);
      return fail(`注入 notify 回报契约失败: ${injected.reason || 'unknown'}`);
    }
    peerLog('cc-control', 'notify_when_idle report contract injected ' + JSON.stringify({
      msg_id: msgId,
      session_id: sessionId,
      reply_to_business_session_id: normalizedReplyTo.business_session_id,
      reply_to_cc_session_id: normalizedReplyTo.cc_session_id || null,
    }));
    // ★ [T-154-cc] 挂上**真采集器**。
    //
    //   改前：这里只挂 `registerDiagnostic`（diagnostic 订阅）⇒ CLI 的 idle notice
    //   到了也只打一行日志就 return（`claudeCodePeerInbox.ts` 的 diagnostic 早退）
    //   ⇒ **结果永远采不到**；而注入契约承诺的「输出标准结果块由端侧兜底」根本没实现。
    //   实测事故（2026-11-25 · 业务会话 1192）：常驻会话 `b0f8568c…` 20:17:14
    //   明明输出了完整结果块，服务端 0 命中 ⇒ 结论丢失 ⇒ 20:22:22 巡检把会话一关，
    //   唯一副本也没了。
    //
    //   改后：采集器轮询 transcript，按 task_id 取结果块 ⇒ **投回业务会话收件箱**
    //   ⇒ 服务端另起一轮 ⇒ 结论回到同一个会话（与 pc_cc_send 的用户可见效果一致）。
    //
    //   ⚠️ task_id 必须与注入契约里的 task_id 一致（两处都用 msgId）⇒ 采集器才对得上。
    let collectorKey = '';
    try {
      collectorKey = ccResultCollector.register({
        sessionId,
        taskId: msgId,
        sinceOffset,
        businessSessionId,
        ccSessionId: normalizedReplyTo.cc_session_id || null,
      });
    } catch (e) {
      claudeCodePeerInbox.cancel(msgId);
      return fail(`挂回报采集器失败: ${(e as Error).message}`);
    }
    // [T-069] 第二步：再发订阅帧（notice 仍只记日志、不触发 D3）。
    const r = await sendPeerControl(sessionId, 'notify_when_idle', {
      from,
      msg_id: msgId,
    }, { from });
    if (!r.ok) {
      claudeCodePeerInbox.cancel(msgId);
      ccResultCollector.cancel(collectorKey);
      return fail(`订阅空闲通知失败: ${r.reason || 'unknown'}`);
    }
    return ok({
      stdout: JSON.stringify({
        status: 'subscribed',
        session_id: sessionId,
        // ★ [T-108] 回执（设备通道）—— 端侧投递可见性的凭据。
        delivery_id: deliveryId,
        receipt: buildCcReceipt({ deliveryId, delivered: true, accepted: true, queued: true }),
        // ★ [T-068 / T-072] 订阅登记的定位信息 —— 合成 notice 可用 msg_id 定向注入。
        msg_id: msgId,
        from,
        // ★ [T-154-cc] 回参说明改成实话：结果块**会被端侧采集并投回本会话收件箱**。
        note: '已注入 report_when_idle 回报契约并挂上端侧采集器；完成后优先用 mcp__gaclaw__send 按 reply_to 主动回报，没工具则输出标准结果块——端侧会采集并投回本会话收件箱（另起一轮送达）；notice 本身只记日志、不触发 D3。',
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
  // [T-086] reply-to 只写进注入消息；不另起一轮汇报 ⇒ 工作队列需覆盖整个 24h 等待窗口。
  pc_cc_send: 24 * 60 * 60 * 1000,
  // ★ [T-111] append 只等本机写通道回执，不等 Claude Code 的结果。
  pc_cc_append: 30000,
  pc_cc_control: 30000,
  pc_cc_close: 30000,
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

  // ★ [T-128-fix] pc_cc_new 必须走真正常驻进程，不能进 detached `-p` 作业分支。
  // ★ [T-154-cc] opts（pendingId / 业务会话号）要传进去 ⇒ 才能挂回报采集器。
  if (tool === 'pc_cc_new') return pcCcNewBg(args, cwd, opts);

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
    case 'pc_cc_sessions': return pcCcSessions(args);
    case 'pc_cc_read': return pcCcRead(args);
    case 'pc_cc_send': return pcCcSend(args, { signal, pendingId: opts?.pendingId ?? null, sessionId: opts?.sessionId ?? null });
    // ★ [T-111] 轻量追加（fire-and-forget）—— 不建 work_unit、不等结果。
    case 'pc_cc_append': return pcCcAppend(args);
    case 'pc_cc_control': return pcCcControl(args);
    case 'pc_cc_close': return pcCcClose(args);
    // [T-086] QMT：只读 + 受控下单（submit 内置逐笔审核门，fail-closed）
    case 'pc_qmt_health':
    case 'pc_qmt_account':
    case 'pc_qmt_quote':
    case 'pc_qmt_positions':
    case 'pc_qmt_orders':
    case 'pc_qmt_trades':
    case 'pc_qmt_prepare':
    case 'pc_qmt_preview':
    case 'pc_qmt_submit':
    case 'pc_qmt_auto_status':
    case 'pc_qmt_auto_authorize':
    case 'pc_qmt_auto_order':
    case 'pc_qmt_auto_revoke':
    case 'pc_qmt_cancel_order':
    case 'pc_qmt_intent_wait':
    case 'pc_qmt_intent_get':
    case 'pc_qmt_intent_list':
    case 'pc_qmt_risk_limits': return executeQmtTool(tool, args);
    case 'pc_qmt_submit': return executeQmtTool(tool, args);
    default:
      return fail(`未知的端侧工具: ${tool}`);
  }
}
