#!/usr/bin/env node
/**
 * gaclaw-msg —— Claude Code 侧会话协作 CLI（list / read / send）
 *
 * [2026-11-20 · T-087]
 *
 * 统一入口：node electron/client-tools/gaclaw-msg.mjs <list|read|send> [flags]
 * stdout 只输出 JSON；失败写 stderr 并以非 0 退出。
 *
 * ⚠️ 不传 userId / role / kind / fromKind —— 身份由主进程固定。
 */

import process from 'node:process';
import { resolveConnection } from './ccMsgCliSettings.ts';

const USAGE = `gaclaw-msg <list|read|send> [flags]

  list   [--query <s>] [--title <s>] [--session-id <s>] [--limit <n>]
  read   --session-id <s> [--max-turns <n>] [--source gacode|claude-code]
  send   --to-session <s> --content <s> [--task-id <s>]
         [--reply-to <s>] [--reply-to-cc-session-id <s>]
         [--reply-to-business-session-id <s>] [--reply-channel <s>]
         [--idempotency-key <s>]

公共： [--hook-url <url>] [--token <token>]

收到 <cross-session-message notify_intent="report_when_idle" reply_to_...> 后：
  完成当前工作**必须**调用 gaclaw-msg send 按 reply_to 主动回报结论；
  用 --to-session / --reply-to（或 --reply-to-business-session-id /
  --reply-to-cc-session-id / --reply-channel）显式指定回信地址；
  ⛔ 不要猜 session_id；notify 本身不代表已回报。业务回报只走
  gaclaw-msg -> /devices/cc/messages -> session-inbox（不新增通道）。
`;

function fail(message, code = 1) {
  process.stderr.write(`gaclaw-msg: ${message}\n`);
  process.exitCode = code;
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') { out.help = true; continue; }
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

export function buildBody(command, a) {
  if (command === 'list') {
    const body = {};
    if (a.query) body.query = a.query;
    if (a.title) body.title = a.title;
    if (a.sessionId) body.sessionId = a.sessionId;
    if (a.limit !== undefined) body.limit = a.limit;
    return body;
  }
  if (command === 'read') {
    if (!a.sessionId) throw new Error('read 需要 --session-id');
    const body = { sessionId: a.sessionId };
    if (a.maxTurns !== undefined) body.maxTurns = a.maxTurns;
    if (a.source) body.source = a.source;
    return body;
  }
  if (command === 'send') {
    if (!a.toSession) throw new Error('send 需要 --to-session');
    if (!a.content) throw new Error('send 需要 --content');
    const body = { toSessionId: a.toSession, content: a.content };
    if (a.taskId) body.taskId = a.taskId;
    if (a.replyTo) body.replyTo = { businessSessionId: a.replyTo };
    if (a.replyToCcSessionId) body.replyToCcSessionId = a.replyToCcSessionId;
    if (a.replyToBusinessSessionId) body.replyToBusinessSessionId = a.replyToBusinessSessionId;
    if (a.replyChannel) body.replyChannel = a.replyChannel;
    if (a.idempotencyKey) body.idempotencyKey = a.idempotencyKey;
    return body;
  }
  throw new Error(`未知命令: ${command}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.length !== 1) {
    process.stdout.write(USAGE);
    return;
  }
  const command = args._[0];
  if (!['list', 'read', 'send'].includes(command)) {
    throw new Error(`未知命令: ${command}\n${USAGE}`);
  }
  const body = buildBody(command, args);
  const conn = resolveConnection({ hookUrl: args.hookUrl, token: args.token });
  const url = `${conn.baseUrl}/cc-tools/${command}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${conn.token}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { ok: false, raw: text }; }
  process.stdout.write(JSON.stringify(json, null, 2) + '\n');
  if (!res.ok || json?.ok === false) process.exitCode = 1;
}

try {
  await main();
} catch (e) {
  fail(e instanceof Error ? e.message : String(e));
}
