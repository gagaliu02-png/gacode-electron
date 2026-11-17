/**
 * electron/client-tools/claudeCodeHookBridge.ts —— **Claude Code hook 的本地桥**
 *
 * [2026-11-17 · T-020 · S3] 「允许 / 禁止」人工闸。
 *
 * ## 为什么需要它
 *
 *   Claude Code 弹权限框时，裁决通路是 **VS Code 扩展 ↔ CLI 的 `can_use_tool` 控制通道**，
 *   外部进程够不着（跨会话 UDS 协议里**没有**权限 action —— 已在二进制里核实）。
 *   ⇒ 唯一能让 gaclaw 插进去的口子 = **Claude Code 自己的 hook**：
 *
 *     `PermissionRequest`（在弹框**之前**跑）→ HTTP 型 hook → POST 到**本机**这个桥
 *     → 桥转发给 gaclaw → gaclaw 把请求推给用户（App 气泡 / 微信）
 *     → 用户裁决 → gaclaw 回给桥 → 桥回写 hook 应答体 ⇒ Claude Code 真的放行 / 真的拒绝。
 *
 * ## 为什么桥跑在**本机**而不是让 Claude Code 直连 gaclaw
 *
 *   ① **鉴权**：hook 的 HTTP 请求要带凭证。桥跑在本机、凭证在桥手里（跟端侧工具同款），
 *      **不需要**把 token 写进 `~/.claude/settings.json`（那是明文落盘）。
 *   ② **可达性**：Claude Code 在用户电脑上，gaclaw 在服务器 —— 直连要公网可达 + TLS；
 *      桥走**既有的设备通道**（跟 `pc_*` 工具同款）⇒ 零新增公网面。
 *   ③ **本地优先**：桥挂了 ⇒ hook 拿不到裁决 ⇒ 由 hook 自己的 `onFailure` 决定放行/拒绝。
 *
 * ## ⚠️ 安全约束（PC 端硬规则）
 *
 *   1. **只绑 127.0.0.1** —— 不对外暴露。别的进程能连是常态（同一用户），
 *      但**跨机器**连不到。
 *   2. **请求必须带本桥的随机 token** —— 防止本机上任意网页/脚本借 127.0.0.1 冒用。
 *      token 每次启动随机生成，只在**进程内**比对。
 *   3. **桥只转发「审批请求」，不执行任何工具** —— 裁决语义是
 *      「用户允不允许 Claude Code 在**用户自己电脑上**跑这个命令」。
 *   4. **不落盘任何审批内容** —— 只在内存里等，超时即焚。
 */

import * as http from 'http';
import * as crypto from 'crypto';
import { randomBytes } from 'crypto';

/** 桥的默认端口（0 = 随机空闲端口）。 */
export const DEFAULT_HOOK_BRIDGE_PORT = 0;

/** 转发给 gaclaw 的超时（毫秒）—— 必须小于 hook 自己的 timeout，否则两边都白等。 */
export const FORWARD_TIMEOUT_MS = 50_000;

/** 本次启动的随机 token（进程内，不落盘）。 */
let _bridgeToken: string | null = null;

export function bridgeToken(): string {
  if (!_bridgeToken) _bridgeToken = randomBytes(24).toString('hex');
  return _bridgeToken;
}

/** 转发用的 fetch（Node 18+ 内置）。 */
type FetchLike = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}) => Promise<{ ok: boolean; status: number; json(): Promise<any>; text(): Promise<string> }>;

export interface HookBridgeOptions {
  /** gaclaw 侧转发端点（服务间）。 */
  endpoint: string;
  /** 转发时带的凭证（设备通道的 Bearer / admin token）。 */
  authorization?: string | null;
  /** 额外的头。 */
  extraHeaders?: Record<string, string>;
  /** 注入 fetch（测试用）。 */
  fetchImpl?: FetchLike;
  /** 端口（0 = 随机）。 */
  port?: number;
  /** 每次请求的额外字段（userId / channelId 等）。 */
  context?: Record<string, unknown>;
}

export interface HookBridgeHandle {
  /** 实际绑定的端口。 */
  port: number;
  /** 本桥的 token（要写进 Claude Code 的 hook 配置）。 */
  token: string;
  /** 停止桥。 */
  close(): Promise<void>;
}

/**
 * 起一个本机 hook 桥。
 *
 * @param opts
 * @returns 句柄；端口与 token 由调用方写进 Claude Code 的 settings.json。
 */
export function startHookBridge(opts: HookBridgeOptions): Promise<HookBridgeHandle> {
  const fetchImpl: FetchLike = opts.fetchImpl || ((globalThis as any).fetch as FetchLike);
  const token = bridgeToken();

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      // ⛔ 只收 POST（hook 的形状）
      if (req.method !== 'POST') {
        res.writeHead(405, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'method not allowed' }));
        return;
      }
      // ⛔ 本机 token 必须对（防本机任意进程/网页借 127.0.0.1 冒用）
      //   token 从 **query 参数**拿（Claude Code 的 HTTP hook 配置里，
      //   token 走 header 需要 env 插值 ⇒ 会落在 settings.json 明文；
      //   走 query 则 URL 本身就是凭证，同样是本机可读，但**不与 settings 里的其它字段混**）。
      const auth = String(req.headers['authorization'] || '');
      const fromHeader = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
      const fromQuery = (() => {
        try {
          const u = new URL(req.url || '', 'http://127.0.0.1');
          return u.searchParams.get('token') || '';
        } catch (_) { return ''; }
      })();
      const presented = fromHeader || fromQuery;
      if (!presented || presented !== token) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
        return;
      }

      let body = '';
      let tooBig = false;
      req.on('data', (c) => {
        body += c;
        // ⛔ 请求体上限（hook 输入很小；防有人拿这个口灌数据）
        if (body.length > 256 * 1024) { tooBig = true; req.destroy(); }
      });
      req.on('end', async () => {
        if (tooBig) return;
        let payload: any = {};
        try { payload = JSON.parse(body || '{}'); } catch (_) { payload = {}; }

        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), FORWARD_TIMEOUT_MS);
        try {
          const headers: Record<string, string> = {
            'content-type': 'application/json',
            ...(opts.extraHeaders || {}),
          };
          if (opts.authorization) headers.authorization = opts.authorization;

          const upstream = await fetchImpl(opts.endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ...(opts.context || {}), ...payload }),
            signal: ac.signal,
          });

          const text = await upstream.text();
          let parsed: any = null;
          try { parsed = JSON.parse(text); } catch (_) { parsed = null; }

          if (!upstream.ok) {
            // ★ 一律回 **503**（不把上游的状态码原样透出）——
            //   Claude Code 只关心「这个 hook 有没有给出裁决」；
            //   原样透传上游 4xx/5xx 会让它以为「裁决是拒绝」⇒ 误拒用户。
            //   ⇒ 失败一律 503 ⇒ 由 hook 的 onFailure 决定放行/拒绝。
            res.writeHead(503, { 'content-type': 'application/json' });
            res.end(JSON.stringify({
              ok: false,
              error: 'upstream_error',
              upstreamStatus: upstream.status,
              detail: typeof parsed === 'string' ? parsed.slice(0, 500) : parsed,
            }));
            return;
          }

          // ⛔ **只把 hook 应答体透传出去** —— 桥不改写裁决。
          //   gaclaw 返回 { hookResponse: {...} } ⇒ 这就是 Claude Code 要吃的东西。
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify(parsed && parsed.hookResponse ? parsed.hookResponse : parsed));
        } catch (e: any) {
          // 转发失败 ⇒ 返回 503，让 Claude Code 按 onFailure 处理
          res.writeHead(503, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'forward_failed', detail: String(e?.message || e) }));
        } finally {
          clearTimeout(timer);
        }
      });
      req.on('error', () => { /* 客户端断开 */ });
    });

    server.on('error', reject);
    server.listen(opts.port ?? DEFAULT_HOOK_BRIDGE_PORT, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({
        port,
        token,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

/**
 * 生成 Claude Code 的 hook 配置片段（写进 `~/.claude/settings.json` 的 `hooks`）。
 *
 * ⚠️ **形状**：HTTP 型 hook ⇒ Claude Code 直接 POST 到这个 URL。
 *
 * @param p
 * @param p.url        桥的完整 URL（含 token）
 * @param p.event      'PermissionRequest'（默认）| 'PreToolUse'
 * @param p.matcher    工具名匹配（'*' = 全部）
 * @param p.timeoutSec 超时（秒）
 * @param p.onFailure  'block'（失败即拒）| 'continue'（失败即放行）
 */
export function buildHookConfig(p: {
  url: string;
  event?: 'PermissionRequest' | 'PreToolUse';
  matcher?: string;
  timeoutSec?: number;
  onFailure?: 'block' | 'continue';
}): Record<string, unknown> {
  const event = p.event || 'PermissionRequest';
  return {
    hooks: {
      [event]: [{
        matcher: p.matcher || '*',
        hooks: [{
          type: 'http',
          url: p.url,
          timeout: p.timeoutSec ?? 60,
          onFailure: p.onFailure ?? 'block',
        }],
      }],
    },
  };
}

/**
 * 把 token 拼成 hook 用的 URL。
 *
 * ⚠️ URL 里带 `gaclaw-hook-bridge` 标记 ⇒ 卸载时能**精确认出**自己装的那一条
 *   （端口每次重启都变 ⇒ 不能只靠 url 全等来认）。
 */
export function hookUrl(port: number, token: string): string {
  return `http://127.0.0.1:${port}/hook/permission?token=${encodeURIComponent(token)}&src=gaclaw-hook-bridge`;
}
