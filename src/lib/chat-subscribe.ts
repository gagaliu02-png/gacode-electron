/**
 * lib/chat-subscribe.ts — 订正 32 · 会话级「一条流」常驻订阅
 *
 * 服务器 unified-api ≥ f420235 提供：
 *   `GET /yinian/sessions/:id/chat/subscribe` —— 常驻订阅流。
 *
 * ## 与 useChatStream（lib/chat-stream.ts）的本质差别
 *
 *   · useChatStream.start()   =「一轮一连接」—— 发消息建一条流，跑完（收到终态+ACK）就断；
 *                               下一条消息重新建一条。attach 同理（接一条在跑的轮就收回）。
 *   · **subscribe（本文件）** =「一条流常驻」—— 进会话页建一条，**跨轮存活**：
 *       - 用户自己发的轮（POST /chat/stream 带 `X-Stream-Mode: none`，帧从这条常驻流回来）；
 *       - 服务端起的后台回报轮（订正 30，帧也广播到这条常驻流）。
 *     轮次终态（done / cancelled）收到**不下线**，继续等下一轮。
 *
 * ## 游标（断线/离开再回来，内容一段不丢）
 *
 *   `Last-Event-ID: <seq>` —— seq 是 per-session 单调（服务端 seqAllocator + 帧日志双保险，
 *   进程重启仍连续）。重连时带回上次最后收到的 seq ⇒ 服务端从帧日志回放 `seq > 游标` 的缺口，
 *   再转 live。无游标/非法 ⇒ 只 live 不回放（历史由端侧 history 接口兜底）。
 *
 * ## 四个停止时刻（契约订正 32 §2.3）
 *
 *   ① 客户端离开会话/关页 → `abort()` → 关 socket；
 *   ② 断线但 socket 残留 → close 事件 + 服务端闲置 TTL（15min）双保险；
 *   ③ 闲置超时 → 服务端回收（端侧收到 EOF，下次进去重建即可）；
 *   ④ 服务器重启 → 全部断，端侧重连 + 游标补帧 + history 兜底。
 *
 * ## 降级
 *
 *   ⛔ 不删任何老逻辑。这里**只**新增一条常驻流；老发起流 / attach / turn_started 全部保留。
 *   调用方用 feature 开关决定走哪条（服务端回滚或 subscribe 404 时退回老路径）。
 *
 * ⛔ 只动本文件 + ChatDetail 少量接线；不碰 shared 零件（readChatSse / buildChatStreamHeaders
 *    / client-id / cancel 已就绪）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { tryRefreshAccessToken } from "./auth-refresh";
import {
  normalizeChatChunk,
  readChatSse,
  isValidEventCursor,
} from "./chat-sse";
import { buildChatStreamHeaders, CLIENT_ID_PC } from "./sse/client-id";
import { clientCapabilityHeader } from "./client-capabilities";
import type { ChatChunk } from "./cancel";
import type { AttachControlFrame } from "./chat-sse";

const API_BASE = "https://www.gaga.sale/api/v1";
const SUBSCRIBE_PATH = (id: string) => `/yinian/sessions/${id}/chat/subscribe`;

/** 常驻订阅的参数。 */
export interface PersistentSubscribeOptions {
  sessionId: string;
  /**
   * 上次记下的游标（`Last-Event-ID`）。有 ⇒ 回放缺口；无/非法 ⇒ 只 live。
   * ⛔ 非法游标**绝不**发出去 —— `buildResumeHeaders` 内部已按「无游标」降级。
   */
  cursor?: string | null;
  /** 组件卸载 / 切会话 → abort。 */
  signal?: AbortSignal;
  /** 每帧（含控制帧）。`rowPrefix` 固定 "attach"（常驻观众，类似 attach 的渲染语义）。 */
  onChunk: (chunk: ChatChunk, cursor: string | null) => void;
  /** 控制帧（attach_ok / attach_failed —— 若有；subscribed 已由内部处理）。 */
  onControl?: (frame: AttachControlFrame | { type: "subscribed" }) => void;
  /** 游标推进（端侧把它落盘，下次重连带回）。 */
  onCursor?: (cursor: string) => void;
  /** 错误（非用户中止）。 */
  onError?: (err: Error) => void;
  /** 连接建立成功（首帧 subscribed 到达）。 */
  onOpen?: () => void;
}

export interface UsePersistentSubscribeResult {
  start: (opts: PersistentSubscribeOptions) => Promise<void>;
  abort: (reason?: "user" | "navigate") => void;
}

/** 常驻订阅默认最多重连次数（退避 1s→2s→4s，3 次）。 */
const MAX_RECONNECT = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 会话级常驻订阅流。
 *
 * 用法（在会话页的 effect 里）：
 * ```
 * const sub = usePersistentSubscribe();
 * useEffect(() => {
 *   sub.start({ sessionId: chatId, cursor, onChunk, onCursor });
 *   return () => sub.abort("navigate");
 * }, [chatId]);
 * ```
 */
export function usePersistentSubscribe(): UsePersistentSubscribeResult {
  const acRef = useRef<AbortController | null>(null);
  const [connected, setConnected] = useState(false);

  const abort = useCallback((_reason: "user" | "navigate" = "navigate") => {
    acRef.current?.abort();
    acRef.current = null;
    setConnected(false);
  }, []);

  const start = useCallback(
    async (opts: PersistentSubscribeOptions): Promise<void> => {
      // 已有常驻流 ⇒ 先收回（切会话时旧流不能挂着）。
      acRef.current?.abort();

      const ac = new AbortController();
      acRef.current = ac;
      if (opts.signal) {
        if (opts.signal.aborted) ac.abort();
        else opts.signal.addEventListener("abort", () => ac.abort(), { once: true });
      }

      // ⛔ 游标作为**循环变量**，重连时用最新值（闭包捕获的 opts 不会更新）。
      let cursor: string | null = isValidEventCursor(opts.cursor)
        ? opts.cursor
        : null;

      const fetchSubscribe = async (
        token: string | null,
        resumeCursor: string | null,
      ): Promise<Response> => {
        const base = buildChatStreamHeaders({
          path: "attach",
          clientId: CLIENT_ID_PC,
          authorization: token,
          accept: "text/event-stream",
          clientCapabilities: clientCapabilityHeader(),
        });
        delete base["Content-Type"];
        // ⛔ 订阅的回放头是 `Last-Event-ID`（有合法游标才带）。无游标 ⇒ **一个都不带**：
        //   订阅无游标 = 只 live（不进老服务端的「X-Resume-Turn 接回在跑轮次」分支）。
        if (resumeCursor) base["Last-Event-ID"] = resumeCursor;
        return fetch(`${API_BASE}${SUBSCRIBE_PATH(opts.sessionId)}`, {
          method: "GET",
          headers: base,
          credentials: "include",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          signal: ac.signal,
        });
      };

      let attempt = 0;
      // 见过 subscribed 首帧吗 —— 用它触发 onOpen（连接真的建立、开始收帧了）。
      let opened = false;

      for (;;) {
        if (ac.signal.aborted) return;

        let res: Response;
        try {
          res = await fetchSubscribe(null, cursor);
          if (res.status === 401) {
            const fresh = await tryRefreshAccessToken();
            if (fresh) {
              res = await fetchSubscribe(fresh, cursor);
            }
          }
        } catch (err) {
          if (ac.signal.aborted) return;
          if (attempt >= MAX_RECONNECT) {
            opts.onError?.(err instanceof Error ? err : new Error(String(err)));
            return;
          }
          await delay(1000 * 2 ** attempt);
          attempt += 1;
          continue;
        }

        // ⛔ 服务端老版本（无 subscribe 端点 / v2 未开）⇒ 端侧降级：
        //   关掉常驻 flow，靠 onError 让调用方回落老路径（attach / turn_started）。不重连。
        if (res.status === 404 || res.status === 409) {
          opts.onError?.(
            new Error(
              `subscribe 不可用 (HTTP ${res.status}) —— 回落老路径 (attach/turn_started)`,
            ),
          );
          return;
        }
        if (!res.ok || !res.body) {
          if (attempt >= MAX_RECONNECT) {
            opts.onError?.(new Error(`subscribe HTTP ${res.status}`));
            return;
          }
          await delay(1000 * 2 ** attempt);
          attempt += 1;
          continue;
        }

        // 读流：常驻收帧；EOF（断线 / 闲置回收 / 主动 close）→ 记游标，退避重连。
        const readResult = await readChatSse(res.body, {
          onData: (payload, cur) => {
            if (!payload || typeof payload !== "object") return;
            if (cur) cursor = cur;
            // ★ `subscribed` 是**控制帧**（服务端 writeControl 发的），但 PC 的
            //   `parseAttachControl` 只认 attach_ok/attach_failed ⇒ 它从 onData 进来。
            //   认出它 = 连接真正建立（回放已发完 / 开始 live）⇒ 触发 onOpen。
            const isSubscribed =
              (payload as Record<string, unknown>).type === "subscribed";
            if (isSubscribed) {
              if (!opened) {
                opened = true;
                setConnected(true);
                opts.onOpen?.();
              }
              return; // ⛔ 控制帧不喂给渲染层（没有内容）
            }
            // ⛔ 常驻观众**不拥有**任何一轮 ⇒ onChunk 走 attach 的渲染语义（rowPrefix "attach"）。
            opts.onChunk(normalizeChatChunk(payload as ChatChunk), cur ?? null);
          },
          onControl: (frame) => opts.onControl?.(frame),
          onCursor: (c) => {
            if (!c) return;
            cursor = c; // 本文件本地游标，重连带回
            opts.onCursor?.(c);
          },
        });
        if (readResult.cursor) cursor = readResult.cursor;

        // 用户退出 / 组件卸载 ⇒ 不重连。
        if (ac.signal.aborted) return;
        if (attempt >= MAX_RECONNECT) {
          opts.onError?.(new Error("subscribe 连接多次中断，已停止重连"));
          return;
        }
        await delay(1000 * 2 ** (attempt + 1));
        attempt += 1;
      }
    },
    [],
  );

  return { start, abort };
}
