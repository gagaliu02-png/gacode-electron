/**
 * electron/client-tools/claudeCodeSession.ts —— **Claude Code 活会话的只读视图**
 *
 * [2026-11-17 · T-020] Claude Code 管控能力（方案一：端侧工具）。
 *
 * ## 数据从哪来
 *
 * Claude Code CLI（**2.1.325** = VS Code 扩展 `resources/native-binary/claude.exe`）
 * 每启动一个会话，就在 `~/.claude/sessions/<pid>.json` 写一条**活会话登记**：
 *
 * ```json
 * {
 *   "pid": 36912,
 *   "sessionId": "5933cb93-…",
 *   "cwd": "d:\\gaga\\gaclaw-project",
 *   "status": "busy" | "idle" | "waiting" | "shell",
 *   "waitingFor": "input needed",       // ← 权限待批时出现
 *   "entrypoint": "claude-vscode",       // ← VC for Claude Code
 *   "kind": "interactive",
 *   "name": "gaclaw-project-08",
 *   "messagingSocketPath": "\\\\.\\pipe\\LOCAL\\cc-msg-7ad41c5e…",
 *   "peerProtocol": 1,
 *   "peerFeatures": ["notify_idle", "artifact_yield"]
 * }
 * ```
 *
 * ⛔ **只读**。本文件**不**写任何东西到 `~/.claude/`，**不**改会话状态。
 *    写通道（发消息 / 控制）在 `claudeCodePeer.ts`。
 *
 * ## transcript 在哪
 *
 * 会话的完整记录在 `~/.claude/projects/<slug>/<sessionId>.jsonl`，
 * 其中 `<slug>` = `cwd` 把**非字母数字**全替换成 `-`（实测：`d:\gaga\gaclaw-project`
 * → `d--gaga-gaclaw-project`；Windows 文件名不区分大小写，所以大小写变体都能命中）。
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/** 活会话登记（`~/.claude/sessions/<pid>.json`）。 */
export interface ClaudeSessionRecord {
  pid: number;
  sessionId: string;
  cwd: string;
  status: string;
  waitingFor?: string;
  entrypoint?: string;
  kind?: string;
  name?: string;
  messagingSocketPath?: string;
  peerProtocol?: number;
  peerFeatures?: string[];
  updatedAt?: number;
  /** ★ [T-128-fix] `claude --bg` 后台会话的短 id（= `claude stop <jobId>`）。
   *   实测 bg 会话的注册项里带 `jobId`，且它就是 sessionId 的前缀。 */
  jobId?: string;
}

/** 目录名 = cwd 把非字母数字全换成 `-`。 */
export function projectSlug(cwd: string): string {
  return String(cwd || '').replace(/[^a-zA-Z0-9]/g, '-');
}

function sessionsDir(): string {
  return path.join(os.homedir(), '.claude', 'sessions');
}

function projectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}

/**
 * 列出本机所有**活**会话。
 *
 * 「活」的判定：登记文件存在。CLI 退出时会删掉自己的登记文件，
 * 所以文件在 ≈ 进程还在。**不做** pid 存活性探测（那需要额外的系统调用，
 * 而且 `procStart` 校验在 Windows 上拿不到）。
 */
export function listClaudeSessions(): ClaudeSessionRecord[] {
  const dir = sessionsDir();
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const out: ClaudeSessionRecord[] = [];
  for (const f of files) {
    if (!/^\d+\.json$/.test(f)) continue;
    try {
      const raw = fs.readFileSync(path.join(dir, f), 'utf8');
      const d = JSON.parse(raw);
      if (typeof d.sessionId !== 'string' || typeof d.pid !== 'number') continue;
      out.push({
        ...(d as ClaudeSessionRecord),
        // ★ [T-128-fix] 带上 jobId（bg 会话的 bg_id）⇒ 关闭时能直接 `claude stop`。
        ...(typeof (d as any).jobId === 'string' && (d as any).jobId
          ? { jobId: (d as any).jobId }
          : {}),
      });
    } catch {
      // 登记文件可能正被写（撕裂读）⇒ 跳过这一条，不让整个列表失败
    }
  }
  return out;
}

/**
 * 本机**能不能**管控 Claude Code 会话（能力表判据）。
 *
 * ⚠️ 判据 = 「**Claude Code 的会话登记目录在不在**」——
 *    **不是**「此刻有没有活会话」。后者会让「机器上装了 Claude Code 但此刻没开」
 *    的电脑永远学不会用这组工具。
 *    （跟 `job` 键同款口径：**没装 ⇒ 工具如实失败并回报**，不是「不下发」。）
 */
export function hasClaudeCodeSessions(): boolean {
  try {
    return fs.existsSync(sessionsDir());
  } catch {
    return false;
  }
}

/** 找 transcript 的绝对路径。找不到返回 null。 */
export function transcriptPath(rec: ClaudeSessionRecord): string | null {
  const slug = projectSlug(rec.cwd || '');
  if (!slug) return null;
  const p = path.join(projectsDir(), slug, `${rec.sessionId}.jsonl`);
  try {
    if (fs.existsSync(p)) return p;
  } catch {
    return null;
  }
  // Windows 上目录名不区分大小写 ⇒ cwd 的大小写变体可能命中另一个目录
  try {
    for (const d of fs.readdirSync(projectsDir())) {
      if (d.toLowerCase() === slug.toLowerCase()) {
        const q = path.join(projectsDir(), d, `${rec.sessionId}.jsonl`);
        if (fs.existsSync(q)) return q;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** transcript 里的一条消息（已按需要抽稀）。 */
export interface TranscriptTurn {
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp?: string;
  /** 该轮里在用的工具名。 */
  tools?: string[];
}

/**
 * 读会话尾部若干轮。
 *
 * ⚠️ transcript 可能**很大**（实测单个会话 18MB / 6000+ 行）⇒
 *    只读**尾部** `tailBytes`，且只解析需要的字段。
 */
export function readTranscriptTail(
  rec: ClaudeSessionRecord,
  opts: { tailBytes?: number; maxTurns?: number } = {},
): { turns: TranscriptTurn[]; totalLines: number } {
  const file = transcriptPath(rec);
  if (!file) return { turns: [], totalLines: 0 };

  const tailBytes = opts.tailBytes ?? 512 * 1024;
  const maxTurns = opts.maxTurns ?? 12;

  let fd: number | null = null;
  let buf = '';
  try {
    const stat = fs.statSync(file);
    const start = Math.max(0, stat.size - tailBytes);
    const len = stat.size - start;
    fd = fs.openSync(file, 'r');
    const chunk = Buffer.alloc(len);
    const read = fs.readSync(fd, chunk, 0, len, start);
    buf = chunk.subarray(0, read).toString('utf8');
  } catch {
    return { turns: [], totalLines: 0 };
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch { /* ignore */ } }
  }

  const lines = buf.split('\n').filter((l) => l.trim().length > 0);
  const turns: TranscriptTurn[] = [];

  for (let i = lines.length - 1; i >= 0 && turns.length < maxTurns; i--) {
    let d: any;
    try {
      d = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const t = extractTurn(d);
    if (t) turns.push(t);
  }
  turns.reverse();
  return { turns, totalLines: lines.length };
}

/** 从一条 transcript 记录抽出一轮（正文 + 工具名）。 */
function extractTurn(d: any): TranscriptTurn | null {
  if (!d || typeof d !== 'object') return null;
  const type = d.type;
  if (type !== 'user' && type !== 'assistant' && type !== 'system') return null;

  // 只取真正带正文的轮；attachment / progress / api-request 之类跳过
  const msg = d.message;
  if (!msg || typeof msg !== 'object') return null;
  const content = msg.content;
  if (typeof content === 'string') {
    const text = content.trim();
    if (!text) return null;
    return { role: type, text: text.slice(0, 2000), timestamp: d.timestamp };
  }
  if (!Array.isArray(content)) return null;

  const parts: string[] = [];
  const tools: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if (block.type === 'text' && typeof block.text === 'string') {
      const t = block.text.trim();
      if (t) parts.push(t);
    } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
      const t = block.thinking.trim();
      if (t) parts.push(`[thinking] ${t.slice(0, 600)}`);
    } else if (block.type === 'tool_use' && typeof block.name === 'string') {
      tools.push(block.name);
    }
  }
  const text = parts.join('\n').trim();
  if (!text && tools.length === 0) return null;
  return {
    role: type,
    text: text.slice(0, 2000),
    timestamp: d.timestamp,
    ...(tools.length ? { tools } : {}),
  };
}

/**
 * 汇总一个会话的「当前在干嘛」。
 *
 * 语义：
 *   · `status` = `waiting` ⇒ **卡在等用户**（多半是待批权限）——最该看的信号
 *   · `status` = `busy`    ⇒ 正在跑
 *   · `status` = `idle`    ⇒ 空着
 */
export function summarizeSession(rec: ClaudeSessionRecord): Record<string, unknown> {
  const { turns } = readTranscriptTail(rec, { maxTurns: 6 });
  const last = turns.length ? turns[turns.length - 1] : null;
  const pendingPermission = rec.status === 'waiting' || !!rec.waitingFor;
  return {
    session_id: rec.sessionId,
    pid: rec.pid,
    cwd: rec.cwd,
    name: rec.name || null,
    status: rec.status,
    waiting_for: rec.waitingFor || null,
    /** ⚠️ 推断值：`waiting` + `waitingFor` ⇒ 极可能在等一次工具授权。 */
    likely_awaiting_permission: pendingPermission,
    entrypoint: rec.entrypoint || null,
    is_vscode: rec.entrypoint === 'claude-vscode',
    peer_features: rec.peerFeatures || [],
    last_turn: last ? { role: last.role, text: last.text.slice(0, 500), tools: last.tools || [] } : null,
    recent_turns: turns.slice(-3).map((t) => ({
      role: t.role,
      text: t.text.slice(0, 300),
      ...(t.tools ? { tools: t.tools } : {}),
    })),
  };
}
