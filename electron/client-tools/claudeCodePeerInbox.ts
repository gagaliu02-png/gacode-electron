/**
 * electron/client-tools/claudeCodePeerInbox.ts —— **Claude Code peer notice 读侧**
 *
 * [2026-11-19 · T-068 / T-072 链路 A] `claudeCodePeer.ts` 只解决了「往目标会话写」，
 * `notify_when_idle` 的回执却没有合法接收端：订阅帧里的 `from:'uds:gaclaw'`
 * 会被 Claude Code CLI 2.1.327 判 `unvettable_reply_target` 丢弃。
 *
 * 本模块补一个真正的本地 inbox：
 *   · 监听 `\\.\pipe\LOCAL\cc-msg-<16 random bytes hex>`（合法 reply target）；
 *   · 发布 `~/.claude/sessions/<electronPid>.<sha256(canonicalPipe)>.key`
 *     （内容 `{"peerToken":"<32hex>"}`，mode 0600，原子写）；
 *   · 逐行 JSON + 首帧 auth；
 *   · 维护 `msg_id ↔ pendingId/sessionId/taskId/sinceOffset` 映射；
 *   · 一次性分派 `peer_idle_notice`，重复 / 未知 / 过期一律丢弃；
 *   · 懒启动，stop() 关 server + 删 key。
 *
 * ⚠️ 不写 `<pid>.json` 会话登记（会让上层误把 Electron 当 Claude 会话）。
 * ⚠️ 这里只处理 notice（触发信号），结果正文仍从目标会话 transcript 增量读。
 */

import * as fs from 'fs';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import { createHash, randomBytes } from 'crypto';

/** notice 状态（对齐 CLI 的 `peer_idle_notice`）。 */
export type PeerNoticeState = 'idle' | 'exited' | 'unavailable' | 'waiting';

/** 解析出来的合法 notice 帧。 */
export interface PeerNotice {
  action: 'peer_idle_notice';
  orig_msg_id: string;
  state: PeerNoticeState;
  finished_at?: number;
  detail?: string;
}

/** 注册一条订阅的回执映射。 */
export interface InboxRegistration {
  /** `notify_when_idle` 帧里的 msg_id（回执在 `orig_msg_id` 里带回）。 */
  msgId: string;
  /** 派单 id（= 服务端 pending_id）。 */
  pendingId: string;
  /** 目标 Claude Code 会话 id。 */
  sessionId: string;
  /** 本轮结果要匹配的 task_id（通常就是 pendingId）。 */
  taskId: string;
  /** 注入消息那一刻的 transcript 字节偏移。 */
  sinceOffset: number;
}

/** 一条已分派 notice 的载荷。 */
export interface DispatchedNotice extends InboxRegistration {
  state: PeerNoticeState;
  finishedAt?: number;
  detail?: string;
}

/** 注入测试用的 listen handle（不依赖真 Windows 命名管道）。 */
export interface InboxListenHandle {
  listen(path: string, cb?: () => void): unknown;
  on(event: string, listener: (...args: any[]) => void): unknown;
  close(cb?: (err?: Error) => void): unknown;
  address(): unknown;
}

export interface StartInboxOptions {
  /** 注入 net.Server 风格的 handle（单测用；生产走 `net.createServer()`）。 */
  createServer?: () => InboxListenHandle;
  /** 覆盖管道名（单测用；必须是合法 `cc-msg-<hex>`）。 */
  pipeName?: string;
  /** 覆盖 HOME（单测用）。 */
  homeDir?: string;
  /** 覆盖进程 pid（单测用）。 */
  pid?: number;
  /** 写 key 文件的实现（单测用）。 */
  writeKeyFile?: (file: string, content: string) => void;
}

/** 映射有效期（CLI 订阅 12h；多留一点余量，超过即丢弃）。 */
export const INBOX_ENTRY_TTL_MS = 13 * 60 * 60 * 1000;

/** 管道路径规范形式（与 `claudeCodePeer.ts` 的 canonical 规则一致）。 */
export function canonicalPipePath(sock: string): string | null {
  const m = /^[\\/]{2}[.?][\\/]pipe[\\/](?:(LOCAL)[\\/])?([^\\/]+)$/i.exec(sock);
  if (!m) return null;
  if (m[2] === '.' || m[2] === '..') return null;
  if (/[. ]$/.test(m[2])) return null;
  const name = m[1] === undefined ? m[2] : `LOCAL\\${m[2]}`;
  return `\\\\.\\pipe\\${name.toLowerCase()}`;
}

/** 生成合法 reply target 管道路径。 */
export function makeInboxPipeName(): string {
  return `cc-msg-${randomBytes(16).toString('hex')}`;
}

/** key 文件名里的 hash = sha256(canonical pipe，全小写)。 */
export function keyFileName(pid: number, sock: string): string | null {
  const canon = canonicalPipePath(sock);
  if (!canon) return null;
  return `${pid}.${createHash('sha256').update(canon).digest('hex')}.key`;
}

/**
 * 纯函数：逐行解析一帧，只认合法 `peer_idle_notice`。
 *
 * 未知 action / 缺字段 / 非法 state ⇒ null（调用方丢弃，绝不抛错）。
 */
export function parseInboxLine(line: string): PeerNotice | null {
  let d: any;
  try {
    d = JSON.parse(line);
  } catch {
    return null;
  }
  if (!d || d.action !== 'peer_idle_notice') return null;
  if (typeof d.orig_msg_id !== 'string' || !d.orig_msg_id) return null;
  const state = d.state;
  if (state !== 'idle' && state !== 'exited' && state !== 'unavailable' && state !== 'waiting') {
    return null;
  }
  const out: PeerNotice = { action: 'peer_idle_notice', orig_msg_id: d.orig_msg_id, state };
  if (typeof d.finished_at === 'number' && Number.isFinite(d.finished_at)) {
    out.finished_at = d.finished_at;
  }
  if (typeof d.detail === 'string') out.detail = d.detail;
  return out;
}

interface InboxEntry extends InboxRegistration {
  createdAt: number;
  /** 已分派过的 notice state（一次性：重复同态丢弃）。 */
  delivered: Set<string>;
}

/** 默认 key 写入：临时文件 + rename（原子），0600。 */
function defaultWriteKeyFile(file: string, content: string): void {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(tmp, content, { encoding: 'utf8', mode: 0o600 });
    try { fs.chmodSync(tmp, 0o600); } catch { /* 非 POSIX 平台忽略 */ }
    fs.renameSync(tmp, file);
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

export class ClaudeCodePeerInbox {
  private server: InboxListenHandle | null = null;
  private started = false;
  private pipePath: string | null = null;
  private keyPath: string | null = null;
  private peerToken: string | null = null;
  private registrations = new Map<string, InboxEntry>();
  private noticeHandler: ((n: DispatchedNotice) => void) | null = null;

  /** 当前 reply target 地址（未启动为 null）。订阅帧的 `from` = `uds:` + 完整 pipe 路径。 */
  from(): string | null {
    if (!this.pipePath) return null;
    return `uds:${this.pipePath}`;
  }

  /** 暴露给测试 / 日志：当前管道路径。 */
  get socketPath(): string | null {
    return this.pipePath;
  }

  /**
   * 注册一条 `msg_id` 映射。必须在发 `notify_when_idle` **之前**调用。
   */
  register(reg: InboxRegistration): void {
    if (!reg || !reg.msgId || !reg.pendingId) return;
    this.pruneExpired();
    this.registrations.set(reg.msgId, {
      ...reg,
      createdAt: Date.now(),
      delivered: new Set<string>(),
    });
  }

  /** 取消一条映射（任务停止 / 完成时调用）。 */
  cancel(msgId: string): void {
    if (msgId) this.registrations.delete(msgId);
  }

  /** 订阅 notice 分派（单次设置；后设覆盖先设）。 */
  onNotice(handler: (n: DispatchedNotice) => void): void {
    this.noticeHandler = handler;
  }

  /** 懒启动：重复调用不重复 listen。 */
  start(opts: StartInboxOptions = {}): void {
    if (this.started) return;
    const pipeName = opts.pipeName || makeInboxPipeName();
    if (!/^cc-msg-[0-9a-f]{32}$/i.test(pipeName)) {
      throw new Error(`非法 peer inbox 管道名: ${pipeName}`);
    }
    const sockPath = `\\\\.\\pipe\\LOCAL\\${pipeName.toLowerCase()}`;
    const createServer = opts.createServer || (() => net.createServer() as unknown as InboxListenHandle);
    const homeDir = opts.homeDir || os.homedir();
    const pid = opts.pid ?? process.pid;
    const writeKey = opts.writeKeyFile || defaultWriteKeyFile;
    const keyFile = keyFileName(pid, sockPath);
    if (!keyFile) throw new Error('无法计算 peer inbox key 文件名');
    const fullKeyPath = path.join(homeDir, '.claude', 'sessions', keyFile);
    const token = randomBytes(32).toString('hex');

    const server = createServer();
    server.on('connection', (socket: net.Socket) => this.onConnection(socket));

    this.started = true;
    this.pipePath = sockPath;
    this.keyPath = fullKeyPath;
    this.peerToken = token;

    // listen 失败要回滚状态，否则「以为启动过」⇒ 后续 register 永远没有 notice。
    server.listen(sockPath, () => {
      try {
        writeKey(fullKeyPath, JSON.stringify({ peerToken: token }));
      } catch (e) {
        // key 写失败 ⇒ 目标会话无法 auth ⇒ 这个 inbox 没用；立刻关掉。
        console.error('[cc-peer-inbox] key 写入失败，停止 inbox:', e && (e as Error).message);
        this.stop();
      }
    });
    server.on('error', (e: any) => {
      console.error('[cc-peer-inbox] server 错误:', e && (e?.code || e?.message || e));
    });
    this.server = server;
  }

  /** 停止：关 server + 删 key + 清映射（不 report 未完成 job）。 */
  stop(): void {
    const server = this.server;
    const keyPath = this.keyPath;
    this.server = null;
    this.started = false;
    this.pipePath = null;
    this.peerToken = null;
    this.registrations.clear();
    if (server) {
      try { server.close(); } catch { /* ignore */ }
    }
    if (keyPath) {
      try { fs.unlinkSync(keyPath); } catch { /* ignore */ }
      this.keyPath = null;
    }
  }

  /** 供诊断：当前登记条数。 */
  get size(): number {
    return this.registrations.size;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [id, entry] of this.registrations) {
      if (now - entry.createdAt > INBOX_ENTRY_TTL_MS) this.registrations.delete(id);
    }
  }

  private onConnection(socket: net.Socket): void {
    let authenticated = false;
    let buffer = '';
    // ⚠️ 首帧 auth 必须在合理时间内到达，防半开连接吊住资源。
    const authTimer = setTimeout(() => {
      try { socket.destroy(); } catch { /* ignore */ }
    }, 10_000);
    try { authTimer.unref?.(); } catch { /* ignore */ }

    const close = () => {
      clearTimeout(authTimer);
      try { socket.destroy(); } catch { /* ignore */ }
    };

    socket.on('error', close);
    socket.on('close', close);
    socket.on('data', (chunk: Buffer | string) => {
      buffer += chunk.toString('utf8');
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        if (!authenticated) {
          let auth: any = null;
          try { auth = JSON.parse(line); } catch { /* ignore */ }
          if (!auth || auth.type !== 'auth' || auth.token !== this.peerToken) {
            close();
            return;
          }
          authenticated = true;
          clearTimeout(authTimer);
          continue;
        }
        const notice = parseInboxLine(line);
        if (notice) this.dispatch(notice);
      }
      // 单行超长：直接丢，防爆内存。
      if (buffer.length > 64 * 1024) buffer = '';
    });
  }

  private dispatch(notice: PeerNotice): void {
    this.pruneExpired();
    const entry = this.registrations.get(notice.orig_msg_id);
    if (!entry) return;                       // 未知 / 已取消 / 过期 ⇒ 丢
    if (entry.delivered.has(notice.state)) return; // 同态重复 ⇒ 丢
    // idle 先到、exited 后到：不同态仍要分派（让 job 做最后一次读取）。
    entry.delivered.add(notice.state);
    try {
      this.noticeHandler?.({
        msgId: entry.msgId,
        pendingId: entry.pendingId,
        sessionId: entry.sessionId,
        taskId: entry.taskId,
        sinceOffset: entry.sinceOffset,
        state: notice.state,
        finishedAt: notice.finished_at,
        detail: notice.detail,
      });
    } catch (e) {
      console.error('[cc-peer-inbox] notice handler 异常:', e && (e as Error).message);
    }
  }
}

/** 单例（主进程主模块共享）。 */
export const claudeCodePeerInbox = new ClaudeCodePeerInbox();
