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
import { desktopCapturer, nativeImage, shell } from 'electron';
import { runCommand } from './pty';
import type { ClientToolArtifact, ClientToolResult } from './types';

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
      : path.join(cwd || os.tmpdir(), `gacode-screenshot-${Date.now()}.png`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, png);
    const artifact: ClientToolArtifact = {
      kind: 'file',
      name: path.basename(target),
      path: target,
      size: png.length,
      mimeType: 'image/png',
    };
    return ok({
      stdout: `已截图并保存到 ${target}（${png.length} 字节）`,
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
};

/** 端侧支持的工具名。 */
export const CLIENT_TOOL_NAMES = Object.keys(DEFAULT_TIMEOUT_MS);

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
): Promise<ClientToolResult> {
  const t = timeoutMs || DEFAULT_TIMEOUT_MS[tool] || 120000;
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
    default:
      return fail(`未知的端侧工具: ${tool}`);
  }
}
