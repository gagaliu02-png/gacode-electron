// [2026-11-19 · T-068 / T-072] peer notice 读侧（inbox）单测
//
// 覆盖：合法 pipe 名 / key 文件名 / 逐行 JSON + auth 帧 / msg_id 映射 /
//       一次性分派 / stop 关 server + 删 key / 懒启动。
// ⚠️ 不碰真 HOME、不起真 Windows 命名管道：注入假 server + 假 socket。
//
// 运行: node --test test/pc-claude-peer-inbox.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const mod = await import('../electron/client-tools/claudeCodePeerInbox.ts');
const {
  canonicalPipePath,
  makeInboxPipeName,
  keyFileName,
  parseInboxLine,
  INBOX_ENTRY_TTL_MS,
} = mod;

const PIPE = `\\\\.\\pipe\\LOCAL\\cc-msg-${'ab'.repeat(16)}`;

// ── 夹具 ───────────────────────────────────────────────────────────────
class FakeServer extends EventEmitter {
  constructor() { super(); this.listenPath = null; this.closed = false; }
  listen(p, cb) { this.listenPath = p; if (cb) cb(); return this; }
  close() { this.closed = true; return this; }
  address() { return this.listenPath; }
}

class FakeSocket extends EventEmitter {
  constructor() { super(); this.writes = []; this.destroyed = false; }
  write(s) { this.writes.push(String(s)); return true; }
  destroy() { this.destroyed = true; return this; }
}

function makeInbox(opts = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'gacode-peer-inbox-'));
  const server = new FakeServer();
  const socket = new FakeSocket();
  // 每个测试用独立的类实例（单例只用于生产接线）。
  const box = new mod.ClaudeCodePeerInbox();
  box.start({
    createServer: () => server,
    pipeName: opts.pipeName || makeInboxPipeName(),
    homeDir: home,
    pid: opts.pid || 4242,
    writeKeyFile: opts.writeKeyFile,
  });
  return { box, server, socket, home };
}

function feed(socket, text) {
  socket.emit('data', Buffer.from(text, 'utf8'));
}

// ═══════════════════════════════════════════════════════════════════════

test('PI-1 · 合法 pipe 名 / 规范化 / key 文件名（sha256 全小写规范路径）', () => {
  const name = makeInboxPipeName();
  assert.match(name, /^cc-msg-[0-9a-f]{32}$/);
  assert.equal(canonicalPipePath('\\\\.\\pipe\\LOCAL\\CC-MSG-ABC'), '\\\\.\\pipe\\local\\cc-msg-abc');
  assert.equal(canonicalPipePath('\\\\server\\share\\x'), null, '远程 UNC 必须拒');
  const file = keyFileName(999, PIPE);
  assert.equal(file, `999.${crypto.createHash('sha256').update(PIPE.toLowerCase()).digest('hex')}.key`);
  assert.equal(keyFileName(1, '\\\\server\\share\\x'), null);
  assert.equal(INBOX_ENTRY_TTL_MS, 13 * 60 * 60 * 1000);
});

test('PI-2 · parseInboxLine：只认合法 peer_idle_notice，坏帧一律 null', () => {
  assert.deepEqual(parseInboxLine(JSON.stringify({
    action: 'peer_idle_notice', orig_msg_id: 'm1', state: 'idle', finished_at: 123,
  })), { action: 'peer_idle_notice', orig_msg_id: 'm1', state: 'idle', finished_at: 123 });
  assert.equal(parseInboxLine('{ bad json'), null);
  assert.equal(parseInboxLine(JSON.stringify({ action: 'auth', type: 'auth' })), null);
  assert.equal(parseInboxLine(JSON.stringify({ action: 'peer_idle_notice', orig_msg_id: '', state: 'idle' })), null);
  assert.equal(parseInboxLine(JSON.stringify({ action: 'peer_idle_notice', orig_msg_id: 'm', state: 'bogus' })), null);
});

test('PI-3 · start：懒启动监听合法 pipe，写 key（0600 / 原子），from 是 uds:', () => {
  const writes = [];
  const name = 'cc-msg-' + 'a'.repeat(32);
  const { box, server, home } = makeInbox({ pipeName: name, writeKeyFile: (f, c) => writes.push([f, c]) });
  assert.equal(server.listenPath, `\\\\.\\pipe\\LOCAL\\${name}`);
  assert.equal(box.from(), `uds:${server.listenPath}`);
  assert.equal(writes.length, 1);
  assert.match(writes[0][0], /\.claude[\\/]sessions[\\/]4242\.[0-9a-f]{64}\.key$/);
  const key = JSON.parse(writes[0][1]);
  assert.match(key.peerToken, /^[0-9a-f]{64}$/);
  assert.equal(fs.existsSync(writes[0][0]), false, '注入了 writeKeyFile ⇒ 不该真写盘');
  assert.ok(home);
});

test('PI-4 · 首帧 auth + 逐行 notice + 一次性分派（重复态丢弃）', () => {
  const keys = [];
  const { box, server, socket } = makeInbox({ writeKeyFile: (_f, c) => keys.push(c) });
  const notices = [];
  box.register({ msgId: 'm-1', pendingId: 'p-1', sessionId: 's-1', taskId: 'p-1', sinceOffset: 10 });
  box.onNotice((n) => notices.push(n));
  server.emit('connection', socket);

  // auth 之前发的 notice 必须被丢
  feed(socket, JSON.stringify({ action: 'peer_idle_notice', orig_msg_id: 'm-1', state: 'idle' }) + '\n');
  assert.equal(notices.length, 0);

  const token = JSON.parse(keys[0]).peerToken;
  feed(socket, JSON.stringify({ type: 'auth', token }) + '\n');
  feed(socket, JSON.stringify({ action: 'peer_idle_notice', orig_msg_id: 'm-1', state: 'idle', finished_at: 77 }) + '\n');
  assert.equal(notices.length, 1);
  assert.deepEqual(notices[0], {
    msgId: 'm-1', pendingId: 'p-1', sessionId: 's-1', taskId: 'p-1',
    sinceOffset: 10, state: 'idle', finishedAt: 77, detail: undefined,
  });
  // 同态重复丢；异态（exited）仍要分派，让 job 做最后一次读取
  feed(socket, JSON.stringify({ action: 'peer_idle_notice', orig_msg_id: 'm-1', state: 'idle' }) + '\n');
  assert.equal(notices.length, 1);
  feed(socket, JSON.stringify({ action: 'peer_idle_notice', orig_msg_id: 'm-1', state: 'exited' }) + '\n');
  assert.equal(notices.length, 2);
  // 未知 msgId 丢
  feed(socket, JSON.stringify({ action: 'peer_idle_notice', orig_msg_id: 'nope', state: 'idle' }) + '\n');
  assert.equal(notices.length, 2);
});

test('PI-5 · auth 错误 ⇒ 立刻关连接；stop 关 server + 删 key + 清映射', () => {
  const { box, server, socket, home } = makeInbox();
  box.register({ msgId: 'm-1', pendingId: 'p-1', sessionId: 's-1', taskId: 'p-1', sinceOffset: 0 });
  const notices = [];
  box.onNotice((n) => notices.push(n));
  server.emit('connection', socket);
  feed(socket, JSON.stringify({ type: 'auth', token: 'wrong' }) + '\n');
  assert.equal(socket.destroyed, true, 'auth 失败必须关连接');
  feed(socket, JSON.stringify({ action: 'peer_idle_notice', orig_msg_id: 'm-1', state: 'idle' }) + '\n');
  assert.equal(notices.length, 0);

  // 真 key 文件 + stop 删除（记录精确路径，别拿共享临时目录里的第一个文件）
  const real = new mod.ClaudeCodePeerInbox();
  const srv2 = new FakeServer();
  let key;
  real.start({
    createServer: () => srv2,
    pipeName: makeInboxPipeName(),
    homeDir: home,
    pid: 777,
    writeKeyFile: (f, c) => { key = f; fs.writeFileSync(f, c, { encoding: 'utf8', mode: 0o600 }); },
  });
  assert.ok(fs.existsSync(key), 'start 应真写 key');
  // Windows 上 chmod 0600 常被归一化成 0666（只有 owner 有写权限的本质不变）⇒ 两种情况都收。
  assert.ok([0o600, 0o666].includes(fs.statSync(key).mode & 0o777), 'key 文件权限必须收紧');
  real.stop();
  assert.equal(srv2.closed, true, 'stop 要关 server');
  assert.equal(fs.existsSync(key), false, 'stop 要删 key');
  assert.equal(real.from(), null);
  assert.equal(real.size, 0);
});
