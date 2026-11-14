/**
 * lib/session-inbox.ts —— **会话收件箱**（契约 订正 28 · W5 · PC 端）
 *
 * ## 这一层解决什么
 *
 * 「用户在 agent 跑的时候补充信息」——这件事**不是**新起一轮，也**不是**打断当前轮
 * ⇒ 它要落到一个**第三种去处**：会话的**收件箱**（队列）。
 *
 * ```
 *   轮次在跑 + 用户点「发送」  ⇒ 消息进队列（不打断、不立即发）
 *   队列条上的「⏫ 立即发送」   ⇒ 插队（服务端标 injectable ⇒ 下一个工具边界并入当前轮）
 *   轮次自然结束              ⇒ 队列项自动成为下一轮的第一条用户消息（服务端出队）
 * ```
 *
 * ## 端点（服务端**已上线**，别新造 HTTP 栈）
 *
 *   GET  /yinian/sessions/:sessionId/inbox              —— 队列（「N 条排队中」的数据源）
 *   POST /yinian/sessions/:sessionId/inbox/:id/flush     —— 「立即发送」= 插队
 *   GET  /yinian/sessions/:sessionId/pending-work        —— 本会话还有没有在跑的后台活
 *                                                        （按钮状态机的判据之二）
 *
 * ⚠️ **入队（发消息进队列）没有独立的用户端点** ——
 *   服务端把「轮次在跑时用户发消息」收进队列的那一步，长在 **chat 路由**里
 *   （`unified-api/src/modules/yinian/yinian.chat.routes.js` 的
 *   `SESSION_INBOX_QUEUE` 分支 ⇒ W3-①）
 *   ⇒ 端侧「进队列」= **同一个** `POST /chat/stream`，由服务端判断「排队还是起新轮」。
 *   ⇒ 本文件的 `enqueueUserMessage()` 就是这条路的**薄封装**（⛔ 不消费 SSE 响应体）。
 *
 * ⚠️ **响应体的形状**：队列读取端点返 `{ok,count,data}` ⇒ 走 `request()` 会被解包成
 *   **数组**（`count` 丢了没关系 —— 数组长度就是条数）。
 */

import { API_BASE, getAccessToken, request, tryRefresh } from "./api";

/** 入队请求的超时（毫秒）—— 服务端半死不活时别让用户干等。 */
const ENQUEUE_TIMEOUT_MS = 20000;

// ===========================================================================
// 形状
// ===========================================================================

/**
 * 一个**文件附件**的描述（排队消息的附件）。
 *
 * ⚠️ **这里没有签名 URL** —— 签名 URL 有有效期，躺在库里会过期、也不该长期存签名串
 *   ⇒ 服务端在「这条消息真要发出去」那一刻才解析（flush / 泵队列）。
 */
export interface InboxFile {
  type?: string;
  file_id?: string;
  name?: string;
  mime?: string;
  size?: number;
  url?: string;
}

/**
 * 排队消息的**附件**（★ 2026-11-14 服务端 `bb46bd4` 加的列）。
 *
 * 形状跟**正常那条消息**逐字同形（⇒ 泵队列时原样重发即可）：
 *   · `image_urls`        —— 原样（URL 数组）
 *   · `attached_file_ids` —— 原样（id 数组）
 *   · `files`             —— 文件附件的**描述**（id / 名字 / mime / 大小）
 */
export interface InboxAttachments {
  image_urls?: string[];
  attached_file_ids?: string[];
  files?: InboxFile[];
}

/** 队列里的一条（「一封信」）。 */
export interface InboxItem {
  /** 收件箱行的 id（字符串形式的 BigInt）。 */
  id: string;
  /** 会话内序号（单调递增）。 */
  seq: number;
  /** 信的种类：`user_message` / `user_supplement` / `work_unit_result` / `agent_message`。 */
  kind: string;
  /** 发送方类别：`user` / `work_unit` / `agent`。 */
  fromKind: string;
  /** 发送方 id（工作单元 id 等）。 */
  fromId: string | null;
  /** 正文。 */
  content: string;
  /** 附带的产物（文件 / 文本 …）。 */
  artifacts: unknown | null;
  /**
   * ★ **附件**（2026-11-14 服务端 `bb46bd4`）—— 排队消息的附件**不丢**。
   *   ⇒ 泵队列时原样取 `image_urls` / `attached_file_ids` 重发（端侧**不**解析签名 URL）。
   */
  attachments?: InboxAttachments | null;
  /**
   * ★ **知识库条目 id**（2026-11-14 服务端 `1bb8cd3`）—— 排队消息的引用**不丢**。
   *
   *   ⚠️ 字段名是**驼峰** `knowledgeRefs`（服务端 `GET inbox` 的出参）——
   *      而**发消息**时用的是蛇形 `knowledge_refs`（chat 路由的 body schema）⇒ 两边别搞混。
   *
   *   ⇒ 泵队列时原样取这些 id 重发（端侧**不**解析 atom 原文 —— 那是服务端建轮时做的）。
   */
  knowledgeRefs?: string[] | null;
  /** 优先级（越大越先 —— 「立即发送」的那条会被顶到最大）。 */
  priority: number;
  /**
   * ★ 可注入？
   *   · `false` ⇒ 纯队列项，等**轮次自然结束**才出队；
   *   · `true`  ⇒ 插队投递 ⇒ agent 在**下一个工具边界**就并入当前这一轮。
   */
  injectable: boolean;
  /** 投递时刻（ISO）。 */
  createdAt: string | null;
}

/** 本会话**还没跑完**的后台工作单元（按钮状态机的判据之二）。 */
export interface PendingWorkItem {
  /** 派单 id（= PC 侧的 job_id / `pending_id`）。 */
  id: string;
  /** 种类（现在只有 `pc_job`）。 */
  kind: string;
  /** 工具名（`pc_claude` / `pc_job_start` …）。 */
  tool: string | null;
  /** 派单时刻。 */
  createdAt: string | null;
}

/** 「进队列」时投给服务端的请求体（跟 `POST /chat/stream` 同款）。 */
export interface EnqueueMessageBody {
  message: string;
  image_urls?: string[];
  attached_file_ids?: string[];
  /**
   * ★ 知识库条目 id（★ 2026-11-14 服务端 `1bb8cd3`）
   *   —— **原样**存进收件箱行 ⇒ 排队中的消息引用不丢。
   *   ⚠️ 字段名是**蛇形**（chat 路由的 body schema）—— 跟 inbox 出参的驼峰
   *      `knowledgeRefs` **不是**同一个字段名。
   */
  knowledge_refs?: string[];
}

/** 入队的结果。 */export interface EnqueueResult {
  /** 服务端收下了吗。 */
  ok: boolean;
  /**
   * 服务端**明确**说「已排进队列」了吗？
   * · `true`  ⇒ 服务端返了 JSON 且标了排队（服务端把入队做成显式回执时）
   * · `false` ⇒ 只知道「收下了」（老服务端只返 SSE ⇒ 端侧靠 inbox 轮询确认）
   */
  confirmed: boolean;
  /** 失败原因（`ok=false` 时有）。 */
  error?: string;
  /** 服务端给了队列行 id（老服务端不给 ⇒ 端侧靠 inbox 轮询认领）。 */
  messageId?: string;
  /** 服务端回传的**附件**（原样）—— 端侧乐观队列项显示「📎 N 个附件」用。 */
  attachments?: InboxAttachments | null;
}

// ===========================================================================
// 读队列
// ===========================================================================

/**
 * 列队列（`state=held`）—— 「N 条排队中 ⌄」的数据源。
 *
 * ⚠️ 排序是服务端定的：**priority desc, seq asc** ⇒ 「立即发送」的那条永远排第一。
 */
export function listInbox(sessionId: string): Promise<InboxItem[]> {
  return request<InboxItem[]>(`/yinian/sessions/${sessionId}/inbox`);
}

/**
 * 「立即发送」= **插队**：服务端把那条 priority 顶到最大 + `injectable=true`
 * ⇒ agent 在**下一个工具调用边界**就并入正在跑的这一轮。
 *
 * ⚠️ **不打断当前轮**（★ gaga 2026-11-14 拍板）⇒ 不碰打断语义。
 *
 * ⚠️ 服务端在这里**顺手写一条 user 行**（气泡）—— 排队期间聊天里没有这条消息
 *   （排队 ≠ 用户已经说过这句话）⇒ 「立即发送」= 它**真的要发出去了** ⇒ 气泡这时才出现。
 */
export function flushInboxMessage(
  sessionId: string,
  messageId: string,
): Promise<InboxItem> {
  return request<InboxItem>(
    `/yinian/sessions/${sessionId}/inbox/${encodeURIComponent(messageId)}/flush`,
    { method: "POST" },
  );
}

/**
 * 标记队列项**已发出**（客户端把它当普通消息发出去之后调用）。
 *
 * ⇒ 出队触发点 = **持有那条 SSE 流**的客户端：轮次自然结束时，它把队列里的消息
 *   当普通消息发出去（正常建轮）⇒ 发完调这个端点把队列项收掉。
 *
 * ⚠️ **只在真的发出去之后才调** —— 调早了 = 用户的消息被吞掉（⛔ 最坏的一种丢）。
 */
export function consumeInboxMessage(
  sessionId: string,
  messageId: string,
): Promise<{ count: number }> {
  return request<{ count: number }>(
    `/yinian/sessions/${sessionId}/inbox/${encodeURIComponent(messageId)}/consume`,
    { method: "POST" },
  );
}

/**
 * 本会话**还有没有在跑的后台活**（主 agent 之外的那些：PC 作业 / 云端子 agent）。
 *
 * ⇒ 「停止」按钮的判据之二（★ gaga 2026-11-14：按钮形态要**同时**关联主 agent 和后台任务）。
 * ⇒ 主 agent 轮次结束后、后台活还在跑时，这个端点**仍然**返回非空 ⇒ 按钮**仍然是「停止」**。
 */
export function listPendingWork(sessionId: string): Promise<PendingWorkItem[]> {
  return request<PendingWorkItem[]>(`/yinian/sessions/${sessionId}/pending-work`);
}

// ===========================================================================
// 入队
// ===========================================================================

/**
 * 「发送」进队列 —— 服务端在**这一轮还在跑**时把这条消息收进会话收件箱。
 *
 * ## 为什么不是「另开一个端点」
 *
 * 服务端把「轮次在跑时用户发消息 ⇒ 进队列」的那一步，长在 **chat 路由**里
 * （W3-①）⇒ 端侧**同一个** `POST /chat/stream` 即可 ⇒ 不新造协议。
 *
 * ## 服务端的回执形状（★ 2026-11-14 服务端已就绪）
 *
 *   202 ⇒ `{ ok: true, queued: true, inboxId: "<行 id>", seq: N, content: "…",
 *           attachments: { image_urls, attached_file_ids, files } }`
 *
 *   ⚠️ 排队**不写 user 行**（服务端口径：「排队 ≠ 用户已经说过这句话」）
 *     ⇒ 气泡等它**真发出去**时才有（⏫ 插队时服务端补写；泵队列时正常建轮自然写）。
 *
 * ## 附件（★ 2026-11-14 服务端 `bb46bd4`）
 *
 *   · **入队**时 body 里带上 `image_urls` / `attached_file_ids`（跟正常发消息同款字段名）
 *     ⇒ 服务端**原样**存进收件箱行 ⇒ 排队中的消息**附件不丢**。
 *   · **端侧不解析签名 URL** —— 服务端在「这条消息真要发出去」那一刻才解析
 *     （⏫ 插队 / 泵队列）⇒ 签名串不该在端侧或库里长期躺。
 *
 * ## 为什么**不消费**响应体
 *
 * 排进队列的消息**没有**属于本端的 SSE 内容（它会在工具边界由 agent 读走）⇒
 * 本端不该占着这条流 ⇒ 拿到响应头就**断开**。
 *
 * ⚠️ 老服务端（队列开关没开）会回 **409 TURN_ALREADY_RUNNING** ⇒
 *   「没排上」必须**如实告诉调用方** ⇒ 由调用方把文字**退回输入框**（不许吞掉用户的话）。
 */
export async function enqueueUserMessage(
  sessionId: string,
  body: EnqueueMessageBody,
  signal?: AbortSignal,
): Promise<EnqueueResult> {
  // ⚠️ **自己带超时** —— 不然服务端半死不活时，这条消息永远「送达中」，
  //   用户看到的是一条卡住的队列项（比明确失败更坏）。
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ENQUEUE_TIMEOUT_MS);
  const onOuterAbort = () => ac.abort();
  signal?.addEventListener("abort", onOuterAbort, { once: true });

  const post = async (): Promise<Response> => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json",
    };
    const token = getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${API_BASE}/yinian/sessions/${sessionId}/chat/stream`, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify(body),
      signal: ac.signal,
    });
  };

  let res: Response;
  try {
    try {
      res = await post();
    } catch (e) {
      if (signal?.aborted) return { ok: false, confirmed: false, error: "已取消" };
      if (ac.signal.aborted) {
        return { ok: false, confirmed: false, error: "服务端没回话（超时）" };
      }
      return {
        ok: false,
        confirmed: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }

    // 401 ⇒ 换新 token 再试一次（跟 `request()` 同款口径）。
    if (res.status === 401) {
      const refreshed = await tryRefresh();
      if (refreshed) {
        try {
          res = await post();
        } catch (e) {
          return {
            ok: false,
            confirmed: false,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }
    }

    if (res.status === 409) {
      // 服务端说「这一轮还在跑，且没开入队」⇒ **没排上**。
      return { ok: false, confirmed: false, error: "这一轮还在跑，消息没排进队列" };
    }
    if (!res.ok) {
      return { ok: false, confirmed: false, error: `HTTP ${res.status}` };
    }

    // 2xx ⇒ 服务端收下了。
    //   · 回的是 JSON ⇒ 服务端的入队回执：
    //     `{ok, queued, inboxId, seq, content, attachments}`；
    //   · 回的是 SSE ⇒ 排队消息**没有**属于本端的内容 ⇒ 直接断开。
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      try {
        const raw = (await res.json()) as Record<string, unknown>;
        const data =
          (raw && (raw.data as Record<string, unknown>)) || raw || {};
        const queued = data.queued === true || raw.queued === true;
        // 行 id：服务端入队回执用 `inboxId`；老形状用 `id`。
        const id = String(
          data.inboxId ?? raw.inboxId ?? data.id ?? raw.id ?? "",
        );
        // ★ 附件（★ 2026-11-14 服务端 `bb46bd4`）—— **原样**回传。
        const attachments =
          (data.attachments as InboxAttachments | null | undefined) ??
          (raw.attachments as InboxAttachments | null | undefined) ??
          null;
        return {
          ok: true,
          confirmed: queued,
          ...(id ? { messageId: id } : {}),
          ...(attachments ? { attachments } : {}),
        };
      } catch {
        // 读不出来也算「收下了」—— 靠 inbox 轮询确认。
      }
    }
    try {
      await res.body?.cancel();
    } catch {
      /* 已经断了 */
    }
    return { ok: true, confirmed: false };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onOuterAbort);
  }
}
