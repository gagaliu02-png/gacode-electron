/**
 * lib/sse.ts — 阶段 2 SSE 流式客户端 + useChatStream hook
 *
 * 目标: 接收 `/yinian/sessions/{id}/chat/stream` (POST) 返回的 text/event-stream,
 *        按 \n\n 切完整 event, 每个 event 里 data: 行 JSON.parse → ChatChunk,
 *        通过回调分发给上层。
 *
 * ---------------------------------------------------------------------------
 * 2026-10-28 · 任务书 04 · 契约 §8 / §9 / §10 / §14.5 (P1 / P2 / P4) 改动
 * ---------------------------------------------------------------------------
 * 1. **游标 (契约 L-33 / L-34 / 任务书 P-1)**
 *    之前这段只认 `data:` 行, 显式丢掉 `id:` ⇒ 游标永远拿不到 ⇒ 断线后只能
 *    整轮重放。现在读帧走**共享零件** `lib/chat-sse.ts` 的 `readChatSse`
 *    —— 它复用通知流那套**跑在生产上**的增量解析器 (`SseFrameParser`), 并把
 *    `id:` 行当游标 (`advanceEventCursor`, 严格 `/^\d+$/`)。游标经 `onCursor`
 *    交给调用方落盘 (契约 L-40)。
 *    ⛔ 不在本文件另写一套帧解析器 (契约 §11.4 P3「禁止写第三遍」)。
 *
 * 2. **续传头 (契约 L-35 / L-36 / 任务书 P-2)**
 *    断线重连 / attach 时必须带 `Last-Event-ID` (有合法游标) 或 `X-Resume-Turn: 1`
 *    (无游标但要接回本轮), 且 **body 必须留空** —— body 里带内容会被服务端当成
 *    「建新轮次」(重复投喂用户消息)。头由 `buildResumeHeaders` 生成, 与 web
 *    定稿版同一份实现。
 *
 * 3. **退避 + watchdog (契约 §14.5 P2 / 任务书 P-7)**
 *    退避算术与 watchdog 判据在 `lib/sse-reconnect.ts` —— 通知流
 *    (`lib/notifications-sse.ts`) 与本文件**共用同一份** (P2「同一实现」)。
 *
 * 4. **abort 真的中止 (契约 §14.5 P4 / 任务书 P-5)**
 *    之前 `active` 是**函数级局部变量** ⇒ `useChatStream()` 每次渲染都造一个新
 *    `active = null` ⇒ `abort()` 永远看不到在跑的流 ⇒ 「停止」按钮点了跟没点
 *    一样。现在 `active` 挂在 `useRef` 上, handle 本身也用 `useMemo` 固定住
 *    (身份稳定 ⇒ ChatDetail 的 `useCallback` 依赖不会每次渲染都变)。
 *
 * 5. **接回 (契约 L-41 / L-46 / L-49 / L-50 / 任务书 P-9)**
 *    `attach()` 走 `POST /yinian/sessions/:id/chat/attach` —— 只读接入一条
 *    在跑的轮次, **不建轮次**、不写消息行。首帧恒为控制帧
 *    (`attach_ok` / `attach_failed`) ⇒ 端侧**静默**处理, 不给用户报错。
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

import { useCallback, useMemo, useRef } from "react";
import {
  ChatChunk,
  isCancelFrame,
  isTerminalDone,
  sendCancelDelete,
  UserAbortError,
} from "./cancel";
import { tryRefreshAccessToken } from "./auth-refresh";
import {
  buildResumeHeaders,
  CLIENT_ID_HEADER,
  CLIENT_ID_PC,
  normalizeChatChunk,
  readChatSse,
  type AttachControlFrame,
} from "./chat-sse";
import { createSseBackoff, createSseWatchdog } from "./sse-reconnect";
// ★ v2 (契约订正 17): 轮次身份从**响应头**取 (判据只有这一份, 跟 web 同一份)。
import { readTurnKeyHeader } from "./sse/turn-key-header";

// =========================================================================
// SSE 解析 (纯函数, 单测可注入)
// =========================================================================

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
  /**
   * 知识库引用 id 列表 (atom id, **字符串形式的 BigInt**) —— 跟 web
   * `src/lib/api.ts:797-799` 同口径, 也跟安卓 `StreamChatRequest.kt:86-94`
   * 一致 (id 超 2^53 会在 JS 侧丢精度 ⇒ 必须传字符串).
   * server 端会把它落进 user message 的 `metadata.knowledge_refs`
   * (存的是**实际生效**的 atom id), 端侧再从 metadata 读回来渲染折叠条.
   */
  knowledgeRefs?: string[];
  /** 主动中止回调 (取消按钮 / 组件卸载) */
  signal?: AbortSignal;
  /**
   * chunk 回调 (任意先后顺序)。
   *
   * ★ v2 (R2-PC): 第二个参数是**这一帧的游标** (纯十进制数字串 / null)。
   *   帧本身带 `id:` 时才有 ⇒ 没有的帧给 null (游标保持不变, 不回退)。
   *   「端侧续传中枢」要靠它把帧与 seq 对上 (T-09 幂等) —— 所以必须透出。
   */
  onChunk: (chunk: ChatChunk, cursor: string | null) => void;
  /** 可选: 错误回调 (区别 user abort vs network error) */
  onError?: (err: Error) => void;
  /**
   * ★ 游标推进回调 (契约 L-33 / L-34 / 任务书 P-1)。
   *
   * 服务端只在**帧带 lastEventId** 时才下发 `id:` 行 ⇒ 有些帧没有 `id:`
   * ⇒ 那些帧**不触发**本回调 (游标保持不变, 不得清空、不得回退)。
   * 回调给出的游标永远是**纯十进制数字串**。
   */
  onCursor?: (cursor: string) => void;
  /** ★ attach 控制帧 (契约 L-50 / D2) —— `attach_ok` / `attach_failed`。 */
  onControl?: (frame: AttachControlFrame) => void;
  /**
   * ★ v2 (契约订正 17 · 2026-10-30): 响应头 `X-Turn-Key` 的接收口 ——
   * **轮次身份在响应头就到**, 不用等第一个数据帧.
   *
   * 服务端**在模型出字之前不发任何数据帧** (TTFT 3~20s) ⇒ 这段窗口里客户端
   * 被杀掉就「知道有这一轮, 不知道是哪一轮」⇒ 历史回来认不出亲 ⇒ 空气泡 +
   * 停止键常亮。服务端在 `reply.hijack()` 之后立刻把 `X-Turn-Key` 写进响应头
   * (毫秒级) ⇒ 这个窗口被彻底堵上。
   *
   * ⚠️ Electron renderer 是**跨源**的 ⇒ 浏览器只放行「被 expose 的」响应头
   *   ⇒ 服务端必须带 `Access-Control-Expose-Headers: X-Turn-Key`
   *   (unified-api 的 fastify-cors 已配 `exposedHeaders`)。
   * ⚠️ 老服务端没有这个头 ⇒ 回调不触发 ⇒ 回落「帧顶层 turnKey」, 行为不变。
   */
  onTurnKey?: (turnKey: string) => void;
  /**
   * ★ v2 (R2-PC): 续传模式 (契约 L-35 / L-36)。
   *
   *   传了这个字段 ⇒ **第一次请求**就走续传形态:
   *     · `cursor` 合法 ⇒ 发 `Last-Event-ID: <cursor>`;
   *     · 否则 ⇒ 发 `X-Resume-Turn: 1` (接回本轮, 不建新轮次);
   *     · ⚠️ 两种情况 **body 都留空** —— body 带内容会被服务端当成「建新轮次」
   *       (契约 L-36: 空 body 豁免「body 不能全空」的 400 守卫)。
   *
   *   传了 ⇒ `message` 参数被忽略 (续传不重建轮次)。
   */
  resume?: { cursor?: string | null } | null;
}

/** attach (只读接入一条在跑的轮次) 的入参。 */
export interface AttachChatStreamOptions {
  /** chat session id (大整数 → 字符串) */
  sessionId: string;
  /**
   * 续传游标 (纯十进制数字串)。
   *   · 合法 ⇒ 发 `Last-Event-ID`
   *   · 缺失 / 非法 ⇒ 发 `X-Resume-Turn: 1` (契约 L-35)
   */
  cursor?: string | null;
  /** 主动中止 (组件卸载 / 切会话) */
  signal?: AbortSignal;
  /** chunk 回调 (★ v2: 第二个参数 = 这一帧的游标, 见 UseChatStreamOptions) */
  onChunk: (chunk: ChatChunk, cursor: string | null) => void;
  /** 可选: 错误回调 */
  onError?: (err: Error) => void;
  /** 游标推进 (契约 L-33 / L-34) */
  onCursor?: (cursor: string) => void;
  /** 控制帧 (契约 L-50 / D2) */
  onControl?: (frame: AttachControlFrame) => void;
  /**
   * ★ v2 (契约订正 17): 响应头 `X-Turn-Key` —— 这一轮的身份 (attach 也在响应头就给).
   * 见 [UseChatStreamOptions.onTurnKey] 的完整说明。
   */
  onTurnKey?: (turnKey: string) => void;
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
const ATTACH_PATH = (id: string) => `/yinian/sessions/${id}/chat/attach`;

/**
 * 断流后的最大重连次数 (退避 1s → 2s → 4s, 最多 3 次)。
 *
 * ⚠️ 重连走**续传模式** (空 body + 续传头) ⇒ 不会重复投喂用户消息, 也不会
 *    建新轮次 (契约 L-36)。超过上限 ⇒ 抛错给上层 (ChatDetail 的 banner 处理)。
 */
const MAX_RECONNECT_ATTEMPTS = 3;

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
  /** 发起一轮新的对话 (body 带 message ⇒ 服务端建新轮次)。 */
  start: (opts: UseChatStreamOptions) => Promise<void>;
  /**
   * ★ 接回一条**在跑的**轮次 (只读, 不建轮次) —— 契约 L-46 / L-49。
   *   端点 `POST /yinian/sessions/:id/chat/attach`; 首帧恒为控制帧。
   */
  attach: (opts: AttachChatStreamOptions) => Promise<void>;
  /**
   * 中止当前流. reason:
   *   - "user"     用户主动按停止 → 走 USER_STOP
   *   - "navigate" 组件卸载 / 切对话 → 仅 abort fetch, 不发 USER_STOP
   */
  abort: (reason?: "user" | "navigate") => void;
}

/** 在跑的那条流的状态 (挂在 ref 上 ⇒ abort 才找得到)。 */
interface ActiveStream {
  /** 整条流的 AbortController (用户停止 / 组件卸载 abort 它)。 */
  ac: AbortController;
  /** 本轮的可变停止状态 (只有用户按停止才置 true)。 */
  turnState: { userStopped: boolean };
  /** 最近一次**合法**游标 (纯十进制数字串) —— 断线重连时用。 */
  cursor: string | null;
  /** 本端是否**拥有**这一轮 (attach 只读 ⇒ 不拥有 ⇒ 不发 USER_STOP)。 */
  ownsTurn: boolean;
}

export function useChatStream(): ChatStreamHandle {
  // ★ P4 / 任务书 P-5 —— 之前 `active` 是函数级局部变量 ⇒ 每次渲染都重置成
  //   null ⇒ `abort()` 永远看不到在跑的流 ⇒「停止」按钮点了跟没点一样。
  //   现在挂在 ref 上, 且 handle 用 useMemo 固定身份。
  //
  // ⚠️ 发起流与**只读接入流**分两个 ref:
  //   · `activeRef` = 本端**拥有**的那一轮 (自己发起的) ⇒ 中止要发 USER_STOP;
  //   · `attachRef` = 本端**只读**接入的那一轮 ⇒ 中止**只掐本地读流**,
  //     绝不得掐服务端那一轮 (契约 L-53)。
  const activeRef = useRef<ActiveStream | null>(null);
  const attachRef = useRef<ActiveStream | null>(null);

  const abort = useCallback((reason: "user" | "navigate" = "user"): void => {
    const active = activeRef.current ?? attachRef.current;
    if (!active) return;
    if (reason === "user" && active.ownsTurn) {
      // ⛔ 只读接入流 (attach) 不置 userStopped —— 它没有收尾路径, 也不会发
      //   USER_STOP; 服务端那一轮照跑 (契约 L-53)。
      active.turnState.userStopped = true;
    }
    // 立即 abort fetch + reader.read()
    active.ac.abort();
  }, []);

  /**
   * 发一次请求并把流读完。
   *
   * @param opts.sessionId  会话 id
   * @param body            新轮次的 body (续传模式下**留空** —— 契约 L-36)
   * @param cursor          续传游标 (合法 ⇒ Last-Event-ID; 否则 X-Resume-Turn)
   * @param resume          true = 续传模式 (空 body + 续传头)
   */
  const runStream = useCallback(
    async (
      opts: {
        sessionId: string;
        body: Record<string, unknown> | null;
        cursor: string | null;
        resume: boolean;
        signal?: AbortSignal;
        onChunk: (chunk: ChatChunk, cursor: string | null) => void;
        onCursor?: (cursor: string) => void;
        onControl?: (frame: AttachControlFrame) => void;
        // ★ v2 (契约订正 17): 响应头 `X-Turn-Key` —— 这一轮的身份, 在第一个数据帧之前就到。
        onTurnKey?: (turnKey: string) => void;
      },
      ac: AbortController,
    ): Promise<void> => {
      const fetchStream = async (
        accessToken: string | null,
      ): Promise<Response> => {
        const headers: Record<string, string> = {
          Accept: "text/event-stream",
        };
        // 续传模式没有 body ⇒ 不带 Content-Type (契约 L-36)
        if (!opts.resume) headers["Content-Type"] = "application/json";
        if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
        // ★ 续传头 (契约 L-35) —— 与 web 定稿版同一份 `buildResumeHeaders`。
        if (opts.resume) {
          Object.assign(headers, buildResumeHeaders(opts.cursor));
        }
        return fetch(`${API_BASE}${STREAM_PATH(opts.sessionId)}`, {
          method: "POST",
          headers,
          credentials: "include",
          cache: "no-store",
          referrerPolicy: "no-referrer",
          // ⚠️ 续传 body 必须留空 —— body 带内容 = 服务端建新轮次 (L-36)
          body: opts.resume ? undefined : JSON.stringify(opts.body ?? {}),
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
        // 带状态码 —— 重连决策要区分「4xx 重试没用」与「连接断了可重试」。
        throw new SseHttpError(
          res.status,
          `SSE HTTP ${res.status} ${res.statusText}`,
        );
      }

      // ★ v2 (契约订正 17): **轮次身份在响应头就到** —— 不用等第一个数据帧。
      //   服务端建轮那一刻就把 `X-Turn-Key` 写进响应头 (毫秒级), 而第一个数据帧
      //   要等模型出字 (TTFT 3~20s) ⇒ 这段窗口里客户端被杀就永远认不出亲。
      //   ⚠️ 跨源 ⇒ 需要服务端带 `Access-Control-Expose-Headers: X-Turn-Key`。
      const headerTurnKey = readTurnKeyHeader(res.headers);
      if (headerTurnKey) {
        console.log(`[gacode-sse] X-Turn-Key=${headerTurnKey}`);
        try {
          opts.onTurnKey?.(headerTurnKey);
        } catch (e) {
          console.warn("[gacode-sse] onTurnKey 回调抛异常 (忽略)", e);
        }
      }

      // ★ 读帧走共享零件 (契约 P1 / §11.4 P3) ——
      //   `readChatSse` 复用通知流的增量解析器, 并把 `id:` 行当游标。
      await readChatSse(res.body, {
        onData: (payload, cur) => {
          if (!payload || typeof payload !== "object") return;
          // ★ 过归一层 (契约 L-8 ~ L-12) —— 未知 / 死类型逐条跳过 (L-9 / L-11),
          //   `pending_id` 的 snake / camel 别名在这里统一解析好 (L-21)。
          // ★ v2: 游标一起透出 (T-09 幂等要靠它把帧与 seq 对上)。
          opts.onChunk(normalizeChatChunk(payload as ChatChunk), cur ?? null);
        },
        onCursor: (cursor) => {
          if (!cursor) return;
          opts.onCursor?.(cursor);
        },
        onControl: (frame) => opts.onControl?.(frame),
      });
    },
    [],
  );

  const start = useCallback(
    async (opts: UseChatStreamOptions): Promise<void> => {
      if (activeRef.current || attachRef.current) {
        // 上一个流还没结束 → 直接拒, 防止双发叠加
        //   (只读接入流期间同样不许另起一轮 —— 服务端那一轮还在跑)
        throw new Error("已有流在进行中, 请先停止或等待");
      }

      const ac = new AbortController();
      const turnState = { userStopped: false };
      const active: ActiveStream = {
        ac,
        turnState,
        // ★ v2 (R2-PC): 续传模式 ⇒ 起始游标就是 `resume.cursor`
        //   (合法 ⇒ Last-Event-ID; 非法/null ⇒ X-Resume-Turn)。
        cursor: opts.resume?.cursor ?? null,
        ownsTurn: true,
      };
      activeRef.current = active;

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
      /** 已重连次数 (0 = 首次请求)。超过 MAX_RECONNECT_ATTEMPTS ⇒ 放弃。 */
      let attempt = 0;

      const body: Record<string, unknown> = { message: opts.message };
      // 跟 web api.ts:746-754 对齐 — 字段确实存在才发, 缺字段直接不写入 (server 拿到 undefined 走原路径).
      if (opts.imageUrls && opts.imageUrls.length > 0) {
        body.image_urls = opts.imageUrls;
      }
      if (opts.attachedFileIds && opts.attachedFileIds.length > 0) {
        body.attached_file_ids = opts.attachedFileIds;
      }
      // M3 3B: 知识库引用 id 列表 (server 端按 id 查 atom 原文, 走 RAG 排除双写).
      //   跟 web api.ts:797-799 同一 spread 模式, 缺失时 (legacy 客户端) server
      //   拿到 undefined 走原路径. id 用字符串形式的 BigInt (安卓同款).
      if (opts.knowledgeRefs && opts.knowledgeRefs.length > 0) {
        body.knowledge_refs = opts.knowledgeRefs;
      }

      // ── 断线重连 (契约 P2 / 任务书 P-7) ─────────────────────────────
      //   退避算术 + watchdog 判据在 `lib/sse-reconnect.ts` (通知流同一份)。
      //   重连走**续传模式**: 空 body + 续传头 ⇒ 不建新轮次、不重复投喂消息。
      const backoff = createSseBackoff();
      const lastEventAt = { current: Date.now() };
      let attemptAc: AbortController | null = null;
      const watchdog = createSseWatchdog({
        lastEventAt: () => lastEventAt.current,
        isActive: () => !ac.signal.aborted,
        onTimeout: (idle) => {
          console.warn(
            `[gacode-sse] 会话流 ${Math.round(idle / 1000)}s 无事件, 断线重连`,
          );
          // 只掐**本次请求**, 不掐整条流 (否则没法重连)
          try {
            attemptAc?.abort();
          } catch {
            /* ignore */
          }
        },
      });
      watchdog.arm();

      try {
        for (;;) {
          // 本次请求的 controller —— 挂在总 controller 上, 用户停止能立刻掐掉它
          const localAc = new AbortController();
          attemptAc = localAc;
          const onOuterAbort = () => localAc.abort();
          if (ac.signal.aborted) localAc.abort();
          else ac.signal.addEventListener("abort", onOuterAbort, { once: true });

          try {
            await runStream(
              {
                sessionId: opts.sessionId,
                body,
                cursor: active.cursor,
                // ★ v2 (R2-PC): 显式续传模式 ⇒ **第一次**请求就是续传形态
                //   (空 body + 续传头); 之后的自动重连当然也是续传形态。
                resume: attempt > 0 || !!opts.resume,
                signal: opts.signal,
                onChunk: (chunk, cur) => {
                  lastEventAt.current = Date.now();
                  if (isTerminalDone(chunk)) {
                    sawDone = true;
                  } else if (isCancelFrame(chunk)) {
                    sawCancel = true;
                  }
                  opts.onChunk(chunk, cur);
                },
                onCursor: (cursor) => {
                  active.cursor = cursor;
                  opts.onCursor?.(cursor);
                },
                onControl: (frame) => opts.onControl?.(frame),
                // ★ v2 (契约订正 17): 身份从响应头透出 (比第一个数据帧早 3~20s)。
                onTurnKey: (turnKey) => opts.onTurnKey?.(turnKey),
              },
              localAc,
            );
          } catch (err) {
            // 用户主动中止 → 立刻退出, 不重连
            if (ac.signal.aborted) throw new UserAbortError();
            // 4xx (除 401) 是**请求本身**不合法 (比如续传时服务端已无在跑轮次
            // ⇒ 空 body 撞 400 守卫) ⇒ 重试也没用, 直接抛给上层。
            if (err instanceof SseHttpError && err.status >= 400 && err.status < 500) {
              throw err;
            }
            if (attempt >= MAX_RECONNECT_ATTEMPTS) {
              const e = err instanceof Error ? err : new Error(String(err));
              if (opts.onError) opts.onError(e);
              throw e;
            }
            console.warn(
              `[gacode-sse] 会话流中断, ${backoff.current}ms 后续传 (第 ${attempt + 1} 次):`,
              err,
            );
            await delay(backoff.next());
            attempt += 1;
            continue;
          } finally {
            ac.signal.removeEventListener("abort", onOuterAbort);
            attemptAc = null;
          }

          // 流正常结束 (服务端关流):
          //   · 收到轮次终态 / 取消帧 ⇒ 这一轮完了, 不重连。
          //   · 否则 = **异常断流** (服务端半路断了) ⇒ 退避后走续传模式接回。
          if (sawDone || sawCancel) break;
          if (attempt >= MAX_RECONNECT_ATTEMPTS) break;
          console.warn(
            `[gacode-sse] 会话流提前结束, ${backoff.current}ms 后续传 (第 ${attempt + 1} 次)`,
          );
          await delay(backoff.next());
          attempt += 1;
        }

        // -- 收尾 cancel 投递见下面的 finally 块 --
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
        watchdog.disarm();
        // ★ 收尾 cancel 投递 —— **必须在 finally 里** (照抄 web 定稿版 api.ts:1002-1021)。
        //   之前这段放在 try 体末尾 ⇒ 用户按「停止」时读流抛错直接跳过了它 ⇒
        //   USER_STOP **从来没发出去过** ⇒ 服务端照样把这一轮跑完并落库,
        //   界面骗人 (web 侧 2026-10-14「停止按钮真停」修的就是这个)。
        //   跟 web 互斥路径完全一致:
        //     ① user abort + 自己按了停止 → 发 USER_STOP (让服务端真的停)
        //     ② 收到终态 + 没收到 cancel 帧 → 发 ACK_DONE (收尾 ack)
        //     ③ 其他情况 → 不发 (凭猜发任何一种都误杀)
        if (ac.signal.aborted && turnState.userStopped) {
          sendCancelDelete(opts.sessionId, "USER_STOP");
        } else if (!ac.signal.aborted && sawDone && !sawCancel) {
          sendCancelDelete(opts.sessionId, "ACK_DONE");
        }
        // 让新一轮可以发, 即使上一轮因异常提前退出
        activeRef.current = null;
      }
    },
    [runStream],
  );

  /**
   * ★ attach —— 只读接入一条在跑的轮次 (契约 L-46 / L-49 / L-50)。
   *
   *   · 端点 `POST /yinian/sessions/:id/chat/attach` (POST 而非 GET ——
   *     GET 挂 SSE 在 nginx 上要额外配 proxy_buffering off, 易踩「挂住但不实时」)。
   *   · **不建轮次**、不写消息行、不落交付物。
   *   · 首帧恒为控制帧 `attach_ok` / `attach_failed` ⇒ 端侧**静默**处理,
   *     不给用户报错 (契约 L-50)。
   *   · ⛔ attach 只是「读」—— 中止它**不得**掐服务端那一轮 (契约 L-53) ⇒
   *     不发 USER_STOP、不发 ACK_DONE。
   */
  const attach = useCallback(
    async (opts: AttachChatStreamOptions): Promise<void> => {
      if (activeRef.current) {
        throw new Error("已有流在进行中, 请先停止或等待");
      }
      const ac = new AbortController();
      const active: ActiveStream = {
        ac,
        turnState: { userStopped: false },
        cursor: opts.cursor ?? null,
        // ★ attach 只读 ⇒ 本端不拥有这一轮 ⇒ 不发 USER_STOP (契约 L-53)
        ownsTurn: false,
      };
      // 挂到只读槽位 ⇒ 用户按「停止」能掐掉本地读流, 但**不**掐服务端那一轮。
      attachRef.current = active;

      if (opts.signal) {
        if (opts.signal.aborted) {
          ac.abort();
        } else {
          opts.signal.addEventListener("abort", () => ac.abort());
        }
      }

      try {
        const fetchAttach = async (
          accessToken: string | null,
        ): Promise<Response> => {
          const headers: Record<string, string> = {
            Accept: "text/event-stream",
            // ★ 端标识 (契约 D3 / L-30) —— 纯可选, 只用于日志与统计。
            [CLIENT_ID_HEADER]: CLIENT_ID_PC,
          };
          if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
          // ★ 续传头 (契约 L-35 / L-47)
          Object.assign(headers, buildResumeHeaders(opts.cursor ?? null));
          return fetch(`${API_BASE}${ATTACH_PATH(opts.sessionId)}`, {
            method: "POST",
            headers,
            credentials: "include",
            cache: "no-store",
            referrerPolicy: "no-referrer",
            // ⚠️ body 必须留空 (契约 L-36) —— 带内容会被当成新轮次
            body: undefined,
            signal: ac.signal,
          });
        };

        let res = await fetchAttach(null);
        if (res.status === 401) {
          const newToken = await tryRefreshAccessToken();
          if (newToken) {
            console.warn(
              "[gacode-sse] chat attach got 401, refreshed token, retrying",
            );
            res = await fetchAttach(newToken);
          }
        }
        if (!res.ok || !res.body) {
          throw new SseHttpError(
            res.status,
            `attach HTTP ${res.status} ${res.statusText}`,
          );
        }

        // ★ v2 (契约订正 17): attach 的响应头里也带 `X-Turn-Key` ——
        //   「无游标续传」时端上本来就不知道是哪一轮 (没有 attach_ok 帧可看? 有, 但
        //   attach_ok 是**控制帧**, 排在数据帧后面才到) ⇒ 响应头这条是**最早**的通道。
        const headerTurnKey = readTurnKeyHeader(res.headers);
        if (headerTurnKey) {
          console.log(`[gacode-sse] attach X-Turn-Key=${headerTurnKey}`);
          try {
            opts.onTurnKey?.(headerTurnKey);
          } catch (e) {
            console.warn("[gacode-sse] attach onTurnKey 回调抛异常 (忽略)", e);
          }
        }

        await readChatSse(res.body, {
          onData: (payload, cur) => {
            if (!payload || typeof payload !== "object") return;
            // ★ 与发起流**同一份**归一层 (契约 L-8 ~ L-12) —— 不写第二遍。
            // ★ v2: 游标一起透出 (T-09 幂等要靠它把帧与 seq 对上)。
            opts.onChunk(normalizeChatChunk(payload as ChatChunk), cur ?? null);
          },
          onCursor: (cursor) => {
            if (!cursor) return;
            active.cursor = cursor;
            opts.onCursor?.(cursor);
          },
          onControl: (frame) => opts.onControl?.(frame),
        });
      } catch (err) {
        if (ac.signal.aborted) {
          throw new UserAbortError();
        }
        const e = err instanceof Error ? err : new Error(String(err));
        if (opts.onError) opts.onError(e);
        throw e;
      } finally {
        // 释放只读槽位 —— 下一轮才能再接。
        if (attachRef.current === active) attachRef.current = null;
      }
    },
    [],
  );

  return useMemo<ChatStreamHandle>(
    () => ({ start, attach, abort }),
    [start, attach, abort],
  );
}

/**
 * SseHttpError —— 带 HTTP 状态码的流错误。
 *
 * 为什么要单独一个类: 重连决策需要区分「请求本身不合法 (4xx, 重试没用)」
 * 与「连接断了 (可重试)」。`request()` 那套把状态码吞了, 这里自己带。
 */
export class SseHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "SseHttpError";
    this.status = status;
  }
}

/** 退避等待 (ms)。 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
