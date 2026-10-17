/**
 * lib/sse.ts — 阶段 2 SSE 流式客户端 + useChatStream hook
 *
 * 目标: 接收 `/yinian/sessions/{id}/chat/stream` (POST) 返回的 text/event-stream,
 *        按 \n\n 切完整 event, 每个 event 里 data: 行 JSON.parse → ChatChunk,
 *        通过回调分发给上层。
 *
 * 严格按 gacode-web/src/lib/api.ts:725-887 (sendMessageStream) 的契约:
 *
 *   1. SSE 标准事件分隔符 = \n\n; 按 \n 切不规范, 移动 Chromium 会丢最后一帧。
 *   2. 循环结束后 flush 残留 buffer (server 不补 \n\n 就 close 那条路径仍要吃掉).
 *   3. done 帧有两类, 必须按 `done && messageId != null` 才是轮次终态。
 *   4. 收尾路径**只在 finally**, 不在循环内: 避免 reader loop 没退出就启动第二个 fetch 抢 socket。
 *   5. cancel 投递条件互斥:
 *        - 用户 abort + turnState.userStopped → USER_STOP (让服务端真的停下)
 *        - 收到轮次终态 + 没收到 cancel 帧 → ACK_DONE (收尾 ACK)
 *        - 其他情况 → 不发 (凭猜发任何一种都会误杀服务端 pending cancel)
 *   6. fetch signal 传 — 跟 web 同款恢复, 不依赖 err.name 区分 abort 和网络错。
 *
 * 不引第三方; 用 fetch + ReadableStream + TextDecoder (Electron Chromium 全支持)。
 */

import {
  ChatChunk,
  isCancelFrame,
  isTerminalDone,
  sendCancelDelete,
  UserAbortError,
} from "./cancel";
import { tryRefreshAccessToken } from "./auth-refresh";

// =========================================================================
// SSE 解析 (纯函数, 单测可注入)
// =========================================================================

interface SseParseOptions {
  onFrame: (chunk: ChatChunk) => void;
}

function parseSseBuffer(buffer: string, opts: SseParseOptions): string {
  let buf = buffer;
  let eventEnd;
  while ((eventEnd = buf.indexOf("\n\n")) !== -1) {
    const block = buf.slice(0, eventEnd);
    buf = buf.slice(eventEnd + 2);
    const lines = block.split("\n");
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        const chunk = JSON.parse(payload) as ChatChunk;
        opts.onFrame(chunk);
      } catch {
        // ignore heartbeats / comments / non-JSON payloads
      }
    }
  }
  return buf;
}

// =========================================================================
// 发送选项
// =========================================================================

export interface UseChatStreamOptions {
  /** 用户消息正文 */
  message: string;
  /** chat session id (大整数 → 字符串) */
  sessionId: string;
  /** 已上传图片 url 列表 (走 /yinian/upload 拿到的 URL) */
  imageUrls?: string[];
  /** 已上传文档 file_id 列表 (走 /yinian/documents 拿到的 file_id) */
  attachedFileIds?: string[];
  /** 主动中止回调 (取消按钮 / 组件卸载) */
  signal?: AbortSignal;
  /** chunk 回调 (任意先后顺序) */
  onChunk: (chunk: ChatChunk) => void;
  /** 可选: 错误回调 (区别 user abort vs network error) */
  onError?: (err: Error) => void;
}

export interface UseChatStreamResult {
  promise: Promise<void>;
  abort: () => void;
}

// =========================================================================
// useChatStream — 主入口
//
// 设计目标:
//   - fetch POST + signal 中止 (signal abort 后, 服务端会 SIGTERM 流)
//   - 一律持 AbortController 句柄, 调用方拿 abort() 即可停 (不需要每次自己 new)
//   - 收尾 ACK 走 cancel.ts::sendCancelDelete, 不在这里重复拼 query/header
// =========================================================================

const API_BASE = "https://www.gaga.sale/api/v1";
const STREAM_PATH = (id: string) => `/yinian/sessions/${id}/chat/stream`;

/**
 * 阶段 0/1 没装 zustand, 阶段 2 仍然不引新依赖,
 * useChatStream 这层只是"发一次请求 + 流式回调" — 不需要全局状态,
 * 直接是裸 React hook 也行, 但跟 gacode-web 风格保持一致, 这里
 * 也用 hook 命名 (返回 ref, 不返回 state; 调用方拿到 promise 即可).
 *
 * 返回 useChatStreamOptions sessionId 决定的 start 函数 + abort 句柄。
 * 调用方: const { start, abort } = useChatStream(); start({...});
 */

export interface ChatStreamHandle {
  start: (opts: UseChatStreamOptions) => Promise<void>;
  /**
   * 中止当前流. reason:
   *   - "user"     用户主动按停止 → 走 USER_STOP
   *   - "navigate" 组件卸载 / 切对话 → 仅 abort fetch, 不发 USER_STOP
   */
  abort: (reason?: "user" | "navigate") => void;
}

export function useChatStream(): ChatStreamHandle {
  let active: {
    ac: AbortController;
    turnState: { userStopped: boolean };
  } | null = null;

  const start = async (opts: UseChatStreamOptions): Promise<void> => {
    if (active) {
      // 上一个流还没结束 → 直接拒, 防止双发叠加
      throw new Error("已有流在进行中, 请先停止或等待");
    }

    const ac = new AbortController();
    const turnState = { userStopped: false };
    active = { ac, turnState };

    // 把 caller 传入的 signal 链到我们的 controller
    if (opts.signal) {
      if (opts.signal.aborted) {
        ac.abort();
      } else {
        opts.signal.addEventListener("abort", () => ac.abort());
      }
    }

    let sawDone = false;
    let sawCancel = false;

    const body: Record<string, unknown> = { message: opts.message };
    // 跟 web api.ts:746-754 对齐 — 字段确实存在才发, 缺字段直接不写入 (server 拿到 undefined 走原路径).
    if (opts.imageUrls && opts.imageUrls.length > 0) {
      body.image_urls = opts.imageUrls;
    }
    if (opts.attachedFileIds && opts.attachedFileIds.length > 0) {
      body.attached_file_ids = opts.attachedFileIds;
    }

    try {
      // 401 retry: server access_token 15min 过期, 流跑到一半会触发 401,
      // 自动 refresh 拿新 token 重发一次 fetch + 重建 ReadableStream.
      // 重试上限 1 次 — 仍 401 抛错给上层 (ChatDetail 的 banner 处理).
      // signal abort 贯穿整个 retry: 用户主动停必须立刻终止, 不能 retry.
      const fetchStream = async (
        accessToken: string | null,
      ): Promise<Response> => {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        };
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        return fetch(`${API_BASE}${STREAM_PATH(opts.sessionId)}`, {
          method: "POST",
          headers,
          credentials: "include",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          body: JSON.stringify(body),
          signal: ac.signal,
        });
      };

      let res = await fetchStream(null);
      if (res.status === 401) {
        const newToken = await tryRefreshAccessToken();
        if (newToken) {
          console.warn(
            "[gacode-sse] chat stream got 401, refreshed token, retrying",
          );
          res = await fetchStream(newToken);
        }
        // newToken=null (refresh 失败) → 仍 401, 下面 !res.ok 抛错给上层
      }

      if (!res.ok || !res.body) {
        throw new Error(`SSE HTTP ${res.status} ${res.statusText}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          buffer = parseSseBuffer(buffer, {
            onFrame: (chunk) => {
              opts.onChunk(chunk);
              if (isTerminalDone(chunk)) {
                sawDone = true;
              } else if (isCancelFrame(chunk)) {
                sawCancel = true;
              }
            },
          });
        }
        // flush 残留 buffer (server 不补 \n\n 直接 close 时不能丢最后一帧).
        if (buffer.trim()) {
          parseSseBuffer(buffer + "\n\n", {
            onFrame: (chunk) => {
              opts.onChunk(chunk);
              if (isTerminalDone(chunk)) {
                sawDone = true;
              } else if (isCancelFrame(chunk)) {
                sawCancel = true;
              }
            },
          });
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
          /* already released */
        }
      }

      // -- finally: 收尾 cancel 投递 --
      // 跟 web api.ts:866-870 互斥路径完全一致:
      //   ① user abort + 自己按了停止 → 发 USER_STOP (让服务端真的停)
      //   ② 收到终态 + 没收到 cancel 帧 → 发 ACK_DONE (收尾 ack)
      //   ③ 其他情况 → 不发 (凭猜发任何一种都误杀)
      if (ac.signal.aborted && turnState.userStopped) {
        sendCancelDelete(opts.sessionId, "USER_STOP");
      } else if (!ac.signal.aborted && sawDone && !sawCancel) {
        sendCancelDelete(opts.sessionId, "ACK_DONE");
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      if (ac.signal.aborted) {
        // 主动 abort → 抛 UserAbortError sentinel, 让上层用 isUserAbortError 唯它判
        throw new UserAbortError();
      } else {
        if (opts.onError) opts.onError(e);
        throw e;
      }
    } finally {
      // 让新一轮可以发, 即使上一轮因异常提前退出
      active = null;
    }
  };

  const abort = (reason: "user" | "navigate" = "user"): void => {
    if (!active) return;
    if (reason === "user") {
      active.turnState.userStopped = true;
    }
    // 立即 abort fetch + reader.read()
    active.ac.abort();
  };

  return { start, abort };
}

// =========================================================================
// 备注 (不是 doc, 是 dev 备忘):
//
// **为什么 fetch + ReadableStream 而不是 EventSource**
//   EventSource 不支持 POST body, 也没法传 signal abort (后者 2025 年浏览器已支持,
//   但 1) Electron 默认 Chromium 版本可能落后, 2) POST 必须用 fetch).
//   read 是直接受信号控制, 失败模式更可控。
//   跟 web api.ts 一致走 fetch + ReadableStream, 跨端共用同一套契约。
//
// **为什么不引 react-query (useChatStream 不接 useMutation)**
//   流式不是 fire-and-forget:  累积 chunk 状态属于组件级 useState, 不入查询缓存。
//   把 start/abort 暴露在 hook 而不是 useMutation, 让组件在 streaming 中正常
//   维护自己的 ref/useState, 终止/重发入口更直观。
// =========================================================================
