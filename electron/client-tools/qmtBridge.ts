/**
 * electron/client-tools/qmtBridge.ts —— T-086 QMT WorkBuddy stdio MCP 桥接（端侧）
 *
 * 边界（务必先读）：
 *  - 本文件跑在**用户本机**（PC 主进程），spawn 本机的 workbuddy-qmt-mcp stdio 进程。
 *    它不监听端口、不连外部服务、不下真单，除非通过下面的逐笔审核门。
 *  - 只说 JSON-RPC 2.0 的 initialize / tools/list / tools/call（stdio 每行一条）。
 *  - 工具白名单：6 个只读 + 3 个受控交易（prepare/preview/submit）。
 *    submit 必须带完整逐笔审核字段，任何缺失/过期/指纹不符 ⇒ fail-closed 拒绝。
 *  - 输出是 ClientToolResult（stdout 为 JSON 文本），走既有设备通道回传；
 *    本文件不直接 POST、不碰服务端。
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'child_process';
import type { ChildProcessWithoutNullStreams } from 'child_process';
import type { ClientToolResult } from './types';

/** 默认 bridge 命令（可用 env 覆盖，与 gaclaw provider 同口径）。 */
const DEFAULT_CMD = 'C:/Users/gaga/AppData/Roaming/Python/Python314/Scripts/workbuddy-qmt-mcp.exe';

/** 端侧允许的工具名（pc_* → bridge 工具名）。 */
const TOOL_MAP: Record<string, string> = {
  pc_qmt_health: 'qmt_health',
  pc_qmt_account: 'get_account_snapshot',
  pc_qmt_quote: 'get_quote_snapshot',
  pc_qmt_positions: 'get_positions',
  pc_qmt_orders: 'get_orders',
  pc_qmt_trades: 'get_trades',
  pc_qmt_prepare: 'prepare_trade',
  pc_qmt_preview: 'preview_trade',
  pc_qmt_submit: 'submit_trade_intent',
};

/** submit 审核默认时效（秒），与 workbuddy-trade.js 一致。 */
const APPROVAL_TTL_SECONDS = 120;
/** 审核绑定字段（顺序固定，计算指纹用）。 */
const FINGERPRINT_FIELDS = ['account_alias', 'symbol', 'action', 'volume', 'price'] as const;

/** 审核门失败原因（机器可读）。 */
export type ApprovalFailure =
  | 'UNKNOWN_TOOL' | 'APPROVAL_REQUIRED' | 'APPROVER_REQUIRED'
  | 'PREVIEW_ID_REQUIRED' | 'PREVIEW_FINGERPRINT_REQUIRED' | 'PREVIEW_MISMATCH'
  | 'INVALID_PREVIEW' | 'APPROVAL_EXPIRED' | 'INVALID_APPROVAL_TIME'
  | 'CONFIRM_REQUIRED' | 'RISK_CHECK_FAILED';

/** 计算预览指纹；任一字段缺失/非法 ⇒ null（fail-closed）。 */
export function previewFingerprint(preview: unknown): string | null {
  if (!preview || typeof preview !== 'object' || Array.isArray(preview)) return null;
  const record = preview as Record<string, unknown>;
  const values: string[] = [];
  for (const key of FINGERPRINT_FIELDS) {
    const v = record[key];
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'number' && !Number.isFinite(v)) return null;
    values.push(`${key}=${String(v)}`);
  }
  return values.join('|');
}

/**
 * 逐笔审核门（纯函数，fail-closed）。
 * 输入是工具 args；只读工具直接放行；submit 必须过完整审核。
 */
export function checkQmtApproval(tool: string, args: Record<string, unknown> | null, nowMs: number): ApprovalFailure | null {
  if (!Object.prototype.hasOwnProperty.call(TOOL_MAP, tool)) return 'UNKNOWN_TOOL';
  if (tool !== 'pc_qmt_submit') return null;

  const a = args || {};
  if (a.approved !== true) return 'APPROVAL_REQUIRED';
  if (typeof a.approver !== 'string' || !a.approver.trim()) return 'APPROVER_REQUIRED';
  if (typeof a.preview_id !== 'string' || !a.preview_id.trim()) return 'PREVIEW_ID_REQUIRED';
  if (a.confirm !== 'SUBMIT-QMT-ORDER') return 'CONFIRM_REQUIRED';
  if (typeof a.preview_fingerprint !== 'string' || !a.preview_fingerprint) return 'PREVIEW_FINGERPRINT_REQUIRED';

  const fp = previewFingerprint(a.preview);
  if (fp === null) return 'INVALID_PREVIEW';
  if (fp !== a.preview_fingerprint) return 'PREVIEW_MISMATCH';

  const approvedAt = Number(a.approved_at_ms);
  if (!Number.isFinite(approvedAt) || approvedAt > nowMs) return 'INVALID_APPROVAL_TIME';
  if ((nowMs - approvedAt) / 1000 > APPROVAL_TTL_SECONDS) return 'APPROVAL_EXPIRED';

  return null;
}

/** JSON-RPC 客户端（stdio，每行一条），只做本文件需要的三种方法。 */
export class QmtStdioClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  private buffer = '';

  private readonly cmd: string;
  private readonly args: string[];

  constructor(cmd: string, args: string[] = []) {
    this.cmd = cmd;
    this.args = args;
  }

  async start(): Promise<void> {
    if (this.child) return;
    // [T-086 修复] bridge 的 config 默认按 cwd 解析（config/bridge.json），
    // 而 PC 主进程 cwd 不是 QMT 目录 ⇒ bridge 立刻 FileNotFoundError 退出。
    // 显式把 config 路径注入子进程 env（优先继承进程 env，兜底本机实际路径）。
    const env = { ...process.env };
    if (!env.WORKBUDDY_QMT_CONFIG) {
      env.WORKBUDDY_QMT_CONFIG = 'D:\\国金证券QMT交易端2\\python\\wbqmt_runtime\\config\\bridge.json';
    }
    const child = spawn(this.cmd, this.args, { stdio: ['pipe', 'pipe', 'pipe'], env });
    this.child = child;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      this.buffer += chunk;
      let idx: number;
      while ((idx = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        if (!line) continue;
        let msg: { id?: number; result?: unknown; error?: { message?: string } };
        try { msg = JSON.parse(line); } catch { continue; }
        const id = msg.id;
        if (id === undefined) continue;
        const waiter = this.pending.get(id);
        if (!waiter) continue;
        this.pending.delete(id);
        if (msg.error) waiter.reject(new Error(msg.error.message || 'QMT MCP error'));
        else waiter.resolve(msg.result);
      }
    });
    child.on('error', (err) => this.rejectAll(err));
    child.on('exit', () => this.rejectAll(new Error('QMT bridge process exited')));
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'gacode-qmt', version: '1' },
    });
    this.notify('notifications/initialized');
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });
    });
  }

  private notify(method: string): void {
    this.write({ jsonrpc: '2.0', method });
  }

  private write(msg: unknown): void {
    if (!this.child || !this.child.stdin.writable) throw new Error('QMT bridge 未启动');
    this.child.stdin.write(JSON.stringify(msg) + '\n');
  }

  private rejectAll(err: Error): void {
    for (const [, waiter] of this.pending) waiter.reject(err);
    this.pending.clear();
  }

  async listTools(): Promise<string[]> {
    const result = (await this.request('tools/list', {})) as { tools?: Array<{ name: string }> };
    return (result && Array.isArray(result.tools) ? result.tools : []).map((t) => t.name);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (!Object.values(TOOL_MAP).includes(name)) throw new Error(`QMT 工具不在白名单: ${name}`);
    return this.request('tools/call', { name, arguments: args });
  }

  stop(): void {
    if (this.child) {
      this.child.kill();
      this.child = null;
    }
    this.rejectAll(new Error('QMT bridge stopped'));
  }
}

/** MCP tools/call 结果是 {content:[{type:'text',text}],isError}，取出 text。 */
function extractText(result: unknown): string {
  const r = result as { content?: Array<{ type?: string; text?: string }>; isError?: boolean };
  if (r && Array.isArray(r.content)) {
    const text = r.content.find((c) => c && c.type === 'text' && typeof c.text === 'string')?.text;
    if (typeof text === 'string') return text;
  }
  return JSON.stringify(result);
}

/** 把 pc_qmt_* 工具入参翻译成 bridge tools/call 入参。 */
function buildBridgeArgs(tool: string, args: Record<string, unknown>): Record<string, unknown> {
  const a = args || {};
  switch (tool) {
    case 'pc_qmt_account': return { account_alias: a.account_alias };
    case 'pc_qmt_quote': return { account_alias: a.account_alias, symbols: a.symbols };
    case 'pc_qmt_positions': return { account_alias: a.account_alias, ...(a.symbols ? { symbols: a.symbols } : {}) };
    case 'pc_qmt_orders': return {
      account_alias: a.account_alias,
      ...(a.status ? { status: a.status } : {}),
      ...(a.trading_day ? { trading_day: a.trading_day } : {}),
    };
    case 'pc_qmt_trades': return { account_alias: a.account_alias, ...(a.trading_day ? { trading_day: a.trading_day } : {}) };
    case 'pc_qmt_prepare':
    case 'pc_qmt_preview':
      return {
        trade_request: {
          account_alias: a.account_alias, symbol: a.symbol, action: a.action,
          volume: a.volume, price: a.price, price_type: 'LIMIT',
        },
      };
    case 'pc_qmt_submit':
      // 审核门已在 executeQmtTool 里过；这里只传 preview_id + approval_context。
      return {
        preview_id: a.preview_id,
        approval_context: { local_approval_id: `gacode-${String(a.preview_id)}` },
      };
    default: return {};
  }
}

/**
 * 执行一个 pc_qmt_* 工具。返回 ClientToolResult（走既有设备通道回传）。
 * @param tool 工具名
 * @param args 入参
 * @param opts 可注入的客户端工厂/时间（便于单测）
 */
export async function executeQmtTool(
  tool: string,
  args: Record<string, unknown> | null,
  opts?: { nowMs?: number; clientFactory?: () => QmtStdioClient },
): Promise<ClientToolResult> {
  const nowMs = opts?.nowMs ?? Date.now();
  const failure = checkQmtApproval(tool, args, nowMs);
  if (failure) return { status: 'denied', error: `QMT 审核门拒绝: ${failure}` };

  const bridgeTool = TOOL_MAP[tool];
  if (!bridgeTool) return { status: 'error', error: `未知 QMT 工具: ${tool}` };

  const client = opts?.clientFactory ? opts.clientFactory() : new QmtStdioClient(
    process.env.GACODE_QMT_MCP_CMD || DEFAULT_CMD,
    (() => { try { return JSON.parse(process.env.GACODE_QMT_MCP_ARGS || '["--config","D:/国金证券QMT交易端2/python/wbqmt_runtime/config/bridge.json","--endpoint","http://127.0.0.1:17642"]'); } catch { return []; } })(),
  );
  try {
    await client.start();
    const available = await client.listTools();
    if (!available.includes(bridgeTool)) {
      return { status: 'error', error: `QMT bridge 未提供工具 ${bridgeTool}` };
    }
    const result = await client.callTool(bridgeTool, buildBridgeArgs(tool, args || {}));
    return { status: 'ok', stdout: extractText(result) };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  } finally {
    client.stop();
  }
}

/** 本机是否具备 QMT 能力（bridge 可执行/配置存在才声明 qmt=1）。 */
const DEFAULT_QMT_CONFIG = 'D:/国金证券QMT交易端2/python/wbqmt_runtime/config/bridge.json';

function commandExists(cmd: string): boolean {
  const pathValue = process.env.PATH || '';
  for (const dir of pathValue.split(/[;:]/)) {
    const clean = dir.trim().replace(/^"|"$/g, '');
    if (!clean) continue;
    for (const candidate of [cmd, cmd + '.cmd', cmd + '.exe']) {
      try {
        if (fs.existsSync(path.join(clean, candidate))) return true;
      } catch { /* ignore invalid path entries */ }
    }
  }
  return false;
}

export function qmtAvailable(env: Record<string, string | undefined> = process.env): boolean {
  const explicitCmd = Boolean((env.GACODE_QMT_MCP_CMD || '').trim());
  const explicitConfig = Boolean((env.WORKBUDDY_QMT_CONFIG || '').trim());
  if (explicitCmd || explicitConfig) return true;
  try {
    if (fs.existsSync(DEFAULT_QMT_CONFIG)) return true;
  } catch { /* ignore fs errors */ }
  return commandExists('workbuddy-qmt-mcp');
}

export { TOOL_MAP, APPROVAL_TTL_SECONDS };
