/**
 * electron/client-tools/localChat.ts —— 本机定时任务的「跑一轮对话」
 *
 * [2026-11-12 · P7] 契约依据: cross-platform-sse-event-contract-附录.md
 *   **订正 24 §5**（L-24k：端侧定时任务**绝不复用** `scheduled === true`）。
 *
 * ## 为什么这里要自己发一轮
 *
 * 本机定时任务 = 「到点了，让 AI 干一件事」。这**必须**走**普通**的一轮对话：
 *   · 服务端那一轮会**照常落库**（用户打开会话就能看到结果）；
 *   · 模型调 `pc_*` 工具 ⇒ 设备通道派回本机执行 ✔；
 *   · **审批语义与手动提问完全一样** —— ⛔ 绝不复用服务端的 `scheduled === true`
 *     那个「审批直接放行」的旁路（L-24k：那是服务端定时任务专用，
 *     端侧定时任务必须走**自己的**授权模型）。
 *
 * ## 为什么必须发 ACK_DONE
 *
 * 服务端 v2：**终态帧广播完不关流**，等客户端的 `ACK_DONE` 才 close。
 * 不发 ⇒ 服务端武装一个 pending cancel ⇒ **下一轮提问会被预先中止**
 * （2026-10-14 session 624 的同款事故）。⇒ 见到终态帧**立刻**发。
 *
 * ## 主进程里为什么要重写一遍读帧
 *
 * 渲染层那套读帧器（`src/lib/chat-stream.ts`）绑着 React 状态机；
 * 主进程这只是个「跑完就行」的任务 ⇒ 用 `sse.ts` 的最小读帧器 + 共享层的
 * 终态判据（`src/lib/sse/terminal.ts` 的 `isTerminalFrame`，**一处真值**）。
 */

import { readSseLines, SseFrameCollector } from './sse';
import { isTerminalFrame } from '../../src/lib/sse/terminal';

/** API base（跟渲染层 api-base 同款口径）。 */
export function apiBase(): string {
  const raw = process.env.GACODE_API_BASE || 'https://www.gaga.sale/api/v1';
  return String(raw).replace(/\/+$/, '');
}

/** 一轮对话的结果。 */
export interface LocalTurnResult {
  ok: boolean;
  /** 轮次终态帧的 messageId（有 ⇒ 这一轮真的落库了）。 */
  messageId: string | null;
  /** 人话错误（失败时）。 */
  error: string | null;
  /** 收到的正文长度（诊断用）。 */
  chars: number;
}

/**
 * 建一个会话（第一次跑定时任务时用）。
 *
 * ⚠️ 标题用任务名 ⇒ 用户在会话列表里一眼认得出「这是定时任务发的」。
 */
export async function createSession(
  title: string,
  token: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${apiBase()}/yinian/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => ({}))) as { id?: string; data?: { id?: string } };
    const id = body.id || (body.data && body.data.id) || null;
    return id ? String(id) : null;
  } catch (_) {
    return null;
  }
}

/**
 * 跑一轮对话（定时任务的主体）。
 *
 * ⚠️ **不渲染** —— 结果由服务端落库，用户打开会话就能看到。
 *   这里只负责：把这一轮**跑完** + **发 ACK** + 把成败回报给调用方。
 */
export async function runTurn(
  sessionId: string,
  message: string,
  token: string,
  signal?: AbortSignal,
): Promise<LocalTurnResult> {
  let sawTerminal = false;
  let messageId: string | null = null;
  let chars = 0;
  let acked = false;

  const ack = () => {
    if (acked) return;
    acked = true;
    // ★ 见到终态帧**立刻**发 ACK_DONE（不等流结束）—— 否则服务端武装 pending cancel。
    const url = new URL(`${apiBase()}/yinian/chat/cancel/${sessionId}`);
    url.searchParams.set('intent', 'ACK_DONE');
    void fetch(url.href, {
      method: 'DELETE',
      headers: {
        'x-gaclaw-cancel-intent': 'ACK_DONE',
        Authorization: `Bearer ${token}`,
      },
      keepalive: true,
    }).catch(() => { /* 静默失败：服务端会超时收尾 */ });
  };

  try {
    const res = await fetch(`${apiBase()}/yinian/sessions/${sessionId}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message }),
      signal,
    });
    if (!res.ok || !res.body) {
      return { ok: false, messageId: null, error: `HTTP ${res.status}`, chars: 0 };
    }

    const collector = new SseFrameCollector();
    for await (const line of readSseLines(res)) {
      const payload = collector.push(line);
      if (!payload) continue;
      let chunk: Record<string, unknown>;
      try {
        chunk = JSON.parse(payload);
      } catch (_) {
        continue;
      }
      if (typeof chunk.content === 'string') chars += chunk.content.length;
      if (isTerminalFrame(chunk as { done?: boolean; messageId?: string | null })) {
        sawTerminal = true;
        messageId = chunk.messageId == null ? null : String(chunk.messageId);
        ack();
        break;
      }
      if (chunk.done === true && chunk.cancelled === true) {
        // 被中止了（用户按停止 / 服务端取消）⇒ 也算收尾，要 ACK。
        sawTerminal = true;
        ack();
        break;
      }
    }
    if (!sawTerminal) {
      // 流结束但没有终态帧 ⇒ 照样 ACK（别让服务端武装 pending cancel）。
      ack();
      return { ok: false, messageId: null, error: '流结束但没有终态帧', chars };
    }
    return { ok: true, messageId, error: null, chars };
  } catch (e) {
    if (signal?.aborted) {
      return { ok: false, messageId: null, error: '已取消', chars };
    }
    return { ok: false, messageId: null, error: (e as Error).message, chars };
  }
}
