/**
 * electron/client-tools/claudeCodePeer.ts —— **Claude Code 跨会话消息通道（写侧）**
 *
 * [2026-11-17 · T-020] Claude Code 管控能力（方案一：端侧工具）。
 *
 * ## 这个协议是什么
 *
 * Claude Code CLI（**2.1.325**）每个会话起一个**本地 IPC inbox**：
 *
 *   · 地址 = `~/.claude/sessions/<pid>.json` 的 `messagingSocketPath`
 *           （Windows 上是命名管道 `\\.\pipe\LOCAL\cc-msg-<hex>`）
 *   · 认证 = 同目录 `<pid>.<sha256(canonSock)>.key` 里的 `peerToken`
 *   · 线上格式 = **按行分隔的 JSON**，首行是 auth 帧
 *
 * ```text
 * {"type":"auth","token":"<peerToken>"}\n
 * {"type":"user","message":{"role":"user","content":"<cross-session-message from=\"…\">\n正文\n</cross-session-message>"},"priority":"next","from":"uds:…","msgV":1,"msg_id":"<uuid>"}\n
 * ```
 *
 * ## 我们能做 / 不能做什么
 *
 * ✅ `type:"user"`    —— 往目标会话的**消息队列**插一条补充信息
 *                        （`priority` = `now` / `next` / `later`；`later` 不打断当前轮）
 * ✅ `type:"control"` + `action:"rename"`          —— 给目标会话改名
 * ✅ `type:"control"` + `action:"notify_when_idle"` —— 订阅「目标会话空闲时通知我」
 * ⛔ **没有**「批准 / 拒绝权限」的 action —— 权限走 VS Code 扩展↔CLI 的
 *    `can_use_tool` 控制通道，扩展才是那个 client。
 *    ⇒ **权限闸必须走 hook 桥**（`claudeCodeHook.ts`），不是这里。
 *
 * ## 安全约束（端侧硬规则）
 *
 * 1. **只能连本机 pipe** —— 目标地址必须是 `\\.\pipe\…` 形式，
 *    远程/UNC/多段路径一律拒（对齐 CLI 自己的 `z2()` 判定）。
 * 2. **凭据不出进程** —— `peerToken` 只在内存里用，不打印、不落盘、不回传服务端。
 * 3. **只发 `user` / `control` 两种帧** —— 不构造任意帧，避免被当成协议注入面。
 */

import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { randomUUID, createHash } from 'crypto';

import { listClaudeSessions, type ClaudeSessionRecord } from './claudeCodeSession.ts';
// ★ [2026-11-17 · T-022] 汇报协议模板（注入正文里带 ⇒ 端侧按格式回结果）
import { buildReportingContract } from './claudeResultFormat.ts';

/** 发消息的优先级。 */
export type PeerPriority = 'now' | 'next' | 'later';

/** 允许的控制动作白名单（⛔ 不接受任意 action）。 */
export type PeerControlAction =
  | 'rename'
  | 'notify_when_idle'
  | 'peer_message_status';

const CONTROL_ACTIONS: ReadonlySet<string> = new Set<PeerControlAction>([
  'rename',
  'notify_when_idle',
  'peer_message_status',
]);

/** 本机 IPC 的规范形式（对齐 CLI 的 `oye()` + `yzo()`：小写）。 */
function canonicalSocketPath(sock: string): string | null {
  const m = /^[\\/]{2}[.?][\\/]pipe[\\/](?:(LOCAL)[\\/])?([^\\/]+)$/i.exec(sock);
  if (!m) return null;
  if (m[2] === '.' || m[2] === '..') return null;
  if (/[. ]$/.test(m[2])) return null;
  const name = m[1] === undefined ? m[2] : `LOCAL\\${m[2]}`;
  return `\\\\.\\pipe\\${name.toLowerCase()}`;
}

/**
 * ⛔ 只允许本机命名管道（对齐 CLI 的 `z2()`：非 pipe 路径直接拒）。
 *
 * Windows 上命名管道的本地形式是 **`\\.\pipe\<name>`**（设备路径前缀 `\\.\`）。
 * ⛔ **`\\server\share\...`（UNC）不是本机** ⇒ 拒。
 */
export function isLocalPipePath(sock: string): boolean {
  if (typeof sock !== 'string' || !sock) return false;
  // UNC / 远程：\\ 后面**不是** `.` 或 `?` ⇒ 远程共享 ⇒ 拒
  if (/^[\\/]{2}(?![.?])/.test(sock)) return false;
  return canonicalSocketPath(sock) !== null;
}

/**
 * 找目标会话的 `peerToken`。
 *
 * 文件名 = `<ownerPid>.<sha256(canonicalSockPath)>.key` —— sha256 是在
 * **规范形式**（全小写）上算的，实测能对上。
 */
function findPeerToken(pid: number, sock: string): string | null {
  const canon = canonicalSocketPath(sock);
  if (!canon) return null;
  const want = createHash('sha256').update(canon).digest('hex');
  const dir = path.join(os.homedir(), '.claude', 'sessions');
  const prefix = `${pid}.`;
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return null;
  }
  for (const f of files) {
    if (!f.startsWith(prefix) || !f.endsWith('.key')) continue;
    if (f.slice(prefix.length, -'.key'.length) !== want) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (typeof j.peerToken === 'string' && j.peerToken) return j.peerToken;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** 转义正文里的控制字符（对齐 CLI 的 `SAt()`：中性化裸 `<`）。 */
function neutralize(text: string): string {
  return String(text).replace(/</g, '<\\');
}

/** 找一个活会话（按 sessionId）。 */
export function findSession(sessionId: string): ClaudeSessionRecord | null {
  const all = listClaudeSessions();
  return all.find((s) => s.sessionId === sessionId) || null;
}

/** 发一帧。返回 true = 服务端接收（连接未被立刻踢掉）。 */
function writeFrame(sock: net.Socket, frame: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const line = JSON.stringify(frame) + '\n';
    sock.write(line, (err) => (err ? reject(err) : resolve()));
  });
}

/**
 * 连上目标会话的 inbox，发一帧，**不等回执**。
 *
 * 服务端不会回 ack —— 它只是把消息排进队列。
 * 「成功」的判据 = **写成功且连接没被立刻 destroy**（auth 被拒 ⇒ 服务端秒关）。
 */
async function sendFrame(
  rec: ClaudeSessionRecord,
  frame: unknown,
  opts: { holdMs?: number } = {},
): Promise<{ ok: boolean; reason?: string }> {
  const sockPath = rec.messagingSocketPath;
  if (!sockPath) return { ok: false, reason: 'session_has_no_inbox' };
  if (!isLocalPipePath(sockPath)) return { ok: false, reason: 'not_a_local_pipe' };

  const token = findPeerToken(rec.pid, sockPath);
  if (!token) return { ok: false, reason: 'peer_credential_unavailable' };

  const holdMs = opts.holdMs ?? 400;
  return new Promise((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | null = null;
    const done = (r: { ok: boolean; reason?: string }) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { sock.destroy(); } catch { /* ignore */ }
      resolve(r);
    };

    const sock = net.connect({ path: sockPath });

    sock.on('connect', async () => {
      try {
        // 首行必须是 auth 帧
        sock.write(JSON.stringify({ type: 'auth', token }) + '\n');
        await writeFrame(sock, frame);
      } catch (e: any) {
        done({ ok: false, reason: 'write_failed:' + (e?.message || 'unknown') });
        return;
      }
      // ★ 计时器**从写完之后**开始 —— 连接建立可能比 holdMs 慢
      //   （早前版本从 connect 之前就起表 ⇒ 慢机器上会「还没写就判成功」）。
      timer = setTimeout(() => done({ ok: true }), holdMs);
    });
    sock.on('error', (e: any) => done({ ok: false, reason: 'socket_error:' + (e?.code || e?.message || 'unknown') }));
    sock.on('close', () => {
      // ★ 服务端是**长驻 inbox** —— 收完帧它**不会**关连接。
      //   ⇒ 「被关掉」= 服务端**拒了**（auth 帧不合法 ⇒ 立刻 destroy）。
      //   （早前版本用「写完 + 固定等 N 秒」判成功，在这台机器上会误报 timeout。）
      done({ ok: false, reason: 'connection_closed_by_server' });
    });
  });
}

/**
 * 造注入给目标会话的正文（**导出** ⇒ 单测能直接断言形状，不必真连管道）。
 *
 * ★ [2026-11-17 · T-022] 形状：
 *   `<cross-session-message from="uds:gaclaw" task_id="…">` + 正文 + 汇报协议 + `</cross-session-message>`
 *   ⇒ 端侧知道「这是 gaclaw 的任务」+「回给哪个任务」+「怎么按格式汇报结果」。
 *
 * @param text    原始任务正文
 * @param taskId  可选：裁决身份（= 服务端 `pending_id`）
 */
export function buildPeerMessageContent(text: string, taskId?: string | null): string {
  const body = neutralize(String(text ?? '').slice(0, 4000));
  const attrs = taskId ? ` task_id="${neutralize(String(taskId))}"` : '';
  return (
    `<cross-session-message from="uds:gaclaw"${attrs}>\n` +
    `${body}\n` +
    `${buildReportingContract()}\n` +
    `</cross-session-message>`
  );
}

/**
 * 往目标会话发一条**补充信息**。
 *
 * @param sessionId 目标会话 id
 * @param text      正文
 * @param priority  `now` 立刻插队 / `next` 下一轮 / `later` 等空闲（默认 safest）
 * @param taskId    可选：这次任务的裁决身份（= 服务端 `pending_id`）
 *   ⇒ 写进注入正文的 `task_id` 属性 ⇒ 端侧回信时能对上号（也便于日志定位）。
 */
export async function sendPeerMessage(
  sessionId: string,
  text: string,
  priority: PeerPriority = 'later',
  taskId?: string | null,
): Promise<{ ok: boolean; reason?: string; session_id?: string }> {
  const rec = findSession(sessionId);
  if (!rec) return { ok: false, reason: 'session_not_live' };
  const content = buildPeerMessageContent(text, taskId);
  const frame = {
    type: 'user',
    message: { role: 'user', content },
    priority,
    from: 'uds:gaclaw',
    msgV: 1,
    msg_id: randomUUID(),
  };
  const r = await sendFrame(rec, frame);
  return { ...r, session_id: sessionId };
}

/** 发一个控制动作（白名单内）。 */
export async function sendPeerControl(
  sessionId: string,
  action: PeerControlAction,
  extra: Record<string, unknown> = {},
): Promise<{ ok: boolean; reason?: string; session_id?: string }> {
  if (!CONTROL_ACTIONS.has(action)) {
    return { ok: false, reason: 'unsupported_action:' + String(action) };
  }
  const rec = findSession(sessionId);
  if (!rec) return { ok: false, reason: 'session_not_live' };
  const frame = { type: 'control', action, ...extra };
  const r = await sendFrame(rec, frame);
  return { ...r, session_id: sessionId };
}
