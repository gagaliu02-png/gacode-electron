// =========================================================================
// 会话 SSE 的共享读帧零件 (2026-10-27 · 任务书 03 · W-1 / W-6)
//
// ---------------------------------------------------------------------------
// 为什么有这个文件
// ---------------------------------------------------------------------------
//   契约 §11.3 W1: web 端必须**抓 `id:` 行** (游标) —— 现在的 api.ts 只处理
//     `data:`, 显式丢弃 `id:` / `event:` / `retry:`; W2: 重连必须带续传头。
//   契约 §8 (L-33~L-36) 把这两条钉死:
//     · L-33 游标 = **纯十进制数字串** (服务端 gaclaw `eventIdCounter`,
//       **per-session** 单调递增)。UUID / `1.9` / `12abc` / ` 3` / `-1` / 空串
//       **全部非法**; 端侧**不得**自行生成、不得自增、不得在非法时猜测修补。
//       ⚠️ 历史事故: UUID 游标被 parseInt 截成一个「合法数字」后被服务端照单全收
//       ⇒ 这里一律用 `/^\d+$/` **严格**判定, 非法值**一律不外发**。
//     · L-34 `id:` 行**可能不存在** (只有帧带 lastEventId 时服务端才拼这行)
//       ⇒ 帧无 `id:` ⇒ **保持原游标不变** (不得清空、不得回退); 游标可能跳号,
//       端侧不得假设连续。
//     · L-35 续传头: 有游标 → `Last-Event-ID`; 无游标但要接回本轮 → `X-Resume-Turn: 1`。
//     · L-36 续传请求 **body 必须留空** (空 body 豁免「body 不能全空」的 400 守卫
//       ⇒ 服务端不建新轮次)。body 里带内容会被当成新轮次。
//   契约 §9.2 L-50 + §13 D2: attach 的**首帧恒为控制帧**
//     `attach_ok {turnKey, resumedFrom, replayed, reason}` / `attach_failed {reason}`
//     —— 端侧**只认这四个键**, 不得再增删; 「接不回来」必须用控制帧表达,
//     不得用「空 SSE 流」表达。
//
// ---------------------------------------------------------------------------
// ⛔ 不写第三份 SSE 帧解析器
// ---------------------------------------------------------------------------
//   通知流 (`src/lib/notifications-sse.ts`) 已经有一份**跑在生产上**的增量帧
//   解析器 (`SseFrameParser` / `parseSseFrame`), 契约 §11.4 P3 明确要求
//   「⛔ 禁止写第三遍」⇒ 这里直接**复用**它, 不复制粘贴第二份实现。
//   ⛔ 本文件是 web 定稿版 (`78b01cb:src/lib/chat-sse.ts`) 的照抄 ——
//     唯一改动: import 路径 `./notification-stream` → `./notifications-sse`
//     (PC 的通知流模块叫这个名字), 以及补 PC 端的端标识常量。
// =========================================================================

import { SseFrameParser } from "./notifications-sse";
import { normalizeRichEvent, normalizeRichEvents } from "./rich-events";
import type { ChatChunk } from "./cancel";

/** 续传头 (L-35)。 */
export const LAST_EVENT_ID_HEADER = "Last-Event-ID";
/** 续传头 (L-35) —— 无游标但要接回本轮时带 `1`。 */
export const RESUME_TURN_HEADER = "X-Resume-Turn";
/** 续传头的固定值。 */
export const RESUME_TURN_VALUE = "1";
/** 端标识头 (D3 / L-30) —— **纯可选**, 只用于日志与统计, 不得用于鉴权或分支。 */
export const CLIENT_ID_HEADER = "X-Client-Id";
/** web 端的端标识值 (D3)。 */
export const CLIENT_ID_WEB = "web";
/** PC 端的端标识值 (D3)。 */
export const CLIENT_ID_PC = "pc";

// =========================================================================
// 游标 (L-33 / L-34)
// =========================================================================

/**
 * isValidEventCursor —— 游标合法性判据 (L-33)。
 *
 * 只有**纯十进制数字串**合法。UUID / `1.9` / `12abc` / ` 3` / `-1` / 空串 / 非串
 * 一律非法。⚠️ 这里的正则必须**锚定两端** (`^\d+$`): 用 `parseInt` 或
 * `/^\d+/` 都会把 `12abc` 截成 `12` 当合法游标发出去 —— 那正是历史事故的成因。
 */
export function isValidEventCursor(raw: unknown): raw is string {
  return typeof raw === "string" && /^\d+$/.test(raw);
}

/**
 * advanceEventCursor —— 推进游标 (L-34)。
 *
 *   - 帧**无 `id:` 行** ⇒ 保持原游标 (`current`) 不变 —— 不得清空、不得回退。
 *   - 帧的 `id:` **非法** ⇒ 同样保持原游标: 端侧不得在非法时猜测修补 (L-33),
 *     也不得把非法值当游标存下来 (存下来下次就会被当成合法游标发出去)。
 *   - 帧的 `id:` 合法 ⇒ 游标 = 该值 (纯十进制串, 不解释成 number, 免丢精度)。
 */
export function advanceEventCursor(
  current: string | null,
  frameId: string | null | undefined
): string | null {
  if (frameId === null || frameId === undefined) return current;
  if (!isValidEventCursor(frameId)) return current;
  return frameId;
}

/**
 * buildResumeHeaders —— 构造续传请求头 (L-35)。
 *
 *   - 游标合法 ⇒ `{ "Last-Event-ID": <cursor> }`
 *   - 游标缺失 / 非法 ⇒ `{ "X-Resume-Turn": "1" }` (本轮从头接回)
 *
 * ⚠️ 非法游标**绝不能**被发出去 (服务端会回 `bad_last_event_id`, L-38)
 *   ⇒ 这里统一降级成「按无游标接回」。
 */
export function buildResumeHeaders(
  cursor: string | null | undefined
): Record<string, string> {
  if (isValidEventCursor(cursor)) {
    return { [LAST_EVENT_ID_HEADER]: cursor };
  }
  return { [RESUME_TURN_HEADER]: RESUME_TURN_VALUE };
}

// =========================================================================
// attach 控制帧 (L-50 / D2)
// =========================================================================

/** attach 成功控制帧 (D2: 端侧只认这四个键)。 */
export interface AttachOkFrame {
  type: "attach_ok";
  /** 本轮标识 (跨请求稳定, 与游标同生命周期) —— D4。 */
  turnKey: string | null;
  /** 本次接入的起点游标 (服务端实际从哪一条开始回放)。 */
  resumedFrom: string | null;
  /** 回放了多少帧。 */
  replayed: number | null;
  /** 成功时为 null。 */
  reason: string | null;
}

/** attach 失败控制帧 (L-50) —— session 合法但接不回来。 */
export interface AttachFailedFrame {
  type: "attach_failed";
  /** 机器可读原因码 (L-38 同族): `no_active_stream` / `buffer_expired` / `not_running` / `unknown`。 */
  reason: string | null;
}

export type AttachControlFrame = AttachOkFrame | AttachFailedFrame;

/**
 * parseAttachControl —— 认出控制帧 (L-50 / D2)。
 *
 * 非控制帧返回 null。⚠️ 键**只认** D2 钉死的那几个: `attach_ok` 收
 * `turnKey` / `resumedFrom` / `replayed` / `reason`, 多出来的键一律忽略
 * (端侧不得自行发明字段)。
 */
export function parseAttachControl(payload: unknown): AttachControlFrame | null {
  if (!payload || typeof payload !== "object") return null;
  const obj = payload as Record<string, unknown>;
  if (obj.type === "attach_ok") {
    return {
      type: "attach_ok",
      turnKey: typeof obj.turnKey === "string" ? obj.turnKey : null,
      resumedFrom: typeof obj.resumedFrom === "string" ? obj.resumedFrom : null,
      replayed: typeof obj.replayed === "number" ? obj.replayed : null,
      reason: typeof obj.reason === "string" ? obj.reason : null,
    };
  }
  if (obj.type === "attach_failed") {
    return {
      type: "attach_failed",
      reason: typeof obj.reason === "string" ? obj.reason : null,
    };
  }
  return null;
}

// =========================================================================
// 读帧
// =========================================================================

/** 读帧回调。 */
export interface ChatSseHandlers {
  /** 数据帧 (非控制帧) 的 JSON 载荷 + 该帧生效时的游标。 */
  onData?: (payload: unknown, cursor: string | null) => void;
  /** attach 控制帧。 */
  onControl?: (frame: AttachControlFrame) => void;
  /** 游标推进 (只在真的变了时调 —— 免得每帧都去写 IndexedDB)。 */
  onCursor?: (cursor: string | null) => void;
  /** 帧不是合法 JSON (心跳 / 注释 / 半截帧) —— 不抛, 只报。 */
  onParseError?: (raw: string, err: unknown) => void;
}

/** 读帧结果。 */
export interface ChatSseReadResult {
  /** 读完时生效的游标 (可能仍是 null —— 服务端没下发过 `id:` 行)。 */
  cursor: string | null;
}

/**
 * readChatSse —— 读一条会话 SSE 流 (发起流 / attach 流共用)。
 *
 *   · 帧解析复用通知流的 `SseFrameParser` (增量喂, 帧被网络切碎也能拼回来)
 *   · `id:` 行 ⇒ 游标 (L-33 严格判定; L-34 无 id 保持原值)
 *   · 首帧可能是控制帧 (attach) ⇒ 走 `onControl`, **不当成数据帧**
 *   · 单帧解析失败 ⇒ 只跳过那一条 (L-9 逐条容错), 不影响其余帧
 *
 * ⚠️ 本函数**只管读** —— HTTP 层的状态码 / 鉴权 / 端点路径在 api.ts。
 */
export async function readChatSse(
  body: ReadableStream<Uint8Array>,
  handlers: ChatSseHandlers = {}
): Promise<ChatSseReadResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseFrameParser();
  let cursor: string | null = null;
  let notified: string | null = null;

  const handleFrame = (data: string, id: string | null) => {
    const next = advanceEventCursor(cursor, id);
    if (next !== cursor) {
      cursor = next;
      if (cursor !== notified) {
        notified = cursor;
        handlers.onCursor?.(cursor);
      }
    }
    const payload = data.trim();
    if (!payload) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch (err) {
      handlers.onParseError?.(payload, err);
      return;
    }
    const control = parseAttachControl(parsed);
    if (control) {
      handlers.onControl?.(control);
      return;
    }
    handlers.onData?.(parsed, cursor);
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      for (const frame of parser.push(text)) {
        handleFrame(frame.data, frame.id);
      }
    }
    // 收尾: 服务端 done 帧后可能没补 \n\n 就 close —— flush 残余那一帧, 别丢最后一帧。
    const tail = parser.flush();
    if (tail) handleFrame(tail.data, tail.id);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }

  return { cursor };
}

// =========================================================================
// 帧载荷归一 (L-8 ~ L-12)
// =========================================================================

/**
 * normalizeChatChunk —— 把一帧里的富事件过一遍归一层 (契约 L-8 ~ L-12)。
 *
 * 照抄 web `src/lib/api.ts` 的 `normalizeChatChunk` (web 把 ChatChunk 定义在
 * api.ts 里; PC 定义在 `lib/cancel.ts` ⇒ 落点不同, 实现逐字相同)。
 *
 * ⛔ 为什么**流式**路径也必须过归一层 (历史路径 `parsePhasesJson` 早就过了):
 *   · L-8 键不存在 ≡ null —— 读取方不必假设键存在;
 *   · L-9 单条坏不牵连全批 —— 一批里夹一条畸形事件, 只跳那一条;
 *   · L-11 未知 type 安全降级 —— 跳过该条 + 记诊断, 不整帧归零;
 *   · L-12 `category` 必须忽略。
 */
export function normalizeChatChunk(chunk: ChatChunk): ChatChunk {
  let out = chunk;
  if (chunk.event) {
    const norm = normalizeRichEvent(chunk.event);
    if (!norm.event && norm.skipReason) {
      // 单条跳过 ⇒ 只丢这一条, 其余照常 (契约 L-9 / L-11)。
      console.warn(
        `[rich-events] 跳过事件 (${norm.skipReason}):`,
        norm.skipType ?? "(无 type)",
      );
    }
    out = { ...out, event: norm.event ?? undefined };
  }
  if (Array.isArray(chunk.events)) {
    const norm = normalizeRichEvents(chunk.events);
    if (norm.skipped.length > 0) {
      console.warn(
        "[rich-events] 跳过未知/畸形事件:",
        norm.skipped.map((s) => s.type ?? s.reason).join(", "),
      );
    }
    out = { ...out, events: norm.events };
  }
  return out;
}
