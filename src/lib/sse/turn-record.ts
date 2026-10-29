// =========================================================================
// turn-record —— 端侧持久化的「轮次记录」 (架构 §5.3 / T-05 / T-07 / 契约订正 7)
// ---------------------------------------------------------------------------
// 为什么有这个文件
// ---------------------------------------------------------------------------
//   v1 的续传要**两样东西**: 端上一行「在途 assistant 行」 + 一个游标。
//   而客户端**只存了游标** ⇒ 刷新/重开时正文没了, 只剩尾巴 (缺陷 D-1)。
//
//   v2 把它收成**一条原子记录** (按 sessionId 存):
//
//       { sessionId, turnKey, seq, renderedSnapshot, updatedAt }
//
//   · `seq`            —— 续传游标 (服务端下发的, 端侧不自增; L-33 纯十进制串)
//   · `turnKey`        —— 定位轮次
//   · `renderedSnapshot` —— **本端已渲染的内容** (正文 + 事件 + 阶段)
//   · `updatedAt`      —— TTL 清理用
//
//   ⇒ 「有游标没正文」这个状态**不可能再出现**。
//
// ---------------------------------------------------------------------------
// ★ 四要素的权威值也落在快照里 (T-15)
// ---------------------------------------------------------------------------
//   `startedAt` / `elapsedMs` / `toolCallCount` / `thinkingCount` 由**服务端**给。
//   老服务端没有 ⇒ 留 null ⇒ 上层用本地兜底 (见 `renderPhases` 的兼容分支)。
//
// ---------------------------------------------------------------------------
// ⛔ 本文件**不许** import window / fetch / js-cookie —— PC 要抄这份定稿。
//    零依赖 + 零 import (类型也自己定义) ⇒ 整个 `src/lib/sse/` 目录可以
//    **原样整目录拷走**, 一个字都不用改。
// =========================================================================

// =========================================================================
// 类型 (自给自足 —— 不 import 宿主工程的类型, 保证整目录可拷)
// =========================================================================

/**
 * 富事件 —— 端侧只当**不透明对象**处理。
 *
 * ⚠️ 刻意**不**引宿主工程的 `RichEventBase` (判别联合): 那个联合会随着
 *   契约演进变化, 而本目录是「PC 抄的定稿版」⇒ 类型必须自包含。
 *   宿主层负责把本目录的类型**适配**成自己的 (见 page.tsx 的适配点)。
 */
export interface SseToolEvent {
  [key: string]: unknown;
}

/** 一条相位记录 (thinking / tool) —— 对齐服务端 `phases_json` 的形状。 */
export interface SsePhase {
  type: "thinking" | "tool";
  /** 仅 thinking 有。 */
  text?: string;
  /** 仅 tool 有 —— 富事件。 */
  event?: SseToolEvent;
  /** ms epoch —— 时间线渲染顺序对齐。 */
  ts: number;
}

/**
 * 本端**已渲染**的内容快照。
 *
 * ⚠️ `phases` 存的是**服务端给的形态** (v2 已合并; v1 是 raw)。
 *   渲染时才决定要不要走兼容分支 (见 `renderPhases`)。
 */
export interface TurnRenderedSnapshot {
  /** 已渲染的正文。 */
  content: string;
  /** 已渲染的富事件。 */
  events: SseToolEvent[];
  /** 已渲染的阶段。 */
  phases: SsePhase[];
  /** 轮次开始时刻 (服务端时钟) —— 四要素之一。 */
  startedAt: number | null;
  /** 服务端算的累计耗时 (ms) —— 四要素之一。 */
  elapsedMs: number | null;
  /** 逻辑工具调用次数 (服务端算, T-17) —— 四要素之一。 */
  toolCallCount: number | null;
  /** 逻辑思考段数 (服务端算, 合并后) —— 四要素之一。 */
  thinkingCount: number | null;
  /** 终态分类 (T-12: completed/cancelled/filtered/failed/upstream_lost)。 */
  terminalReason: string | null;
}

/**
 * 一条轮次记录 (按 sessionId 存)。
 *
 * 字段名与架构 §5.3 一字不差 ⇒ PC / 安卓照抄时**语义一致**。
 */
export interface TurnRecord {
  sessionId: string;
  /** 本轮标识 (跨请求稳定, 与游标同生命周期)。 */
  turnKey: string | null;
  /** 续传游标 (纯十进制串; null = 本机零状态)。 */
  seq: string | null;
  /** 本端已渲染的内容。 */
  renderedSnapshot: TurnRenderedSnapshot;
  /** 更新时间 ms epoch (TTL 清理用)。 */
  updatedAt: number;
}

// =========================================================================
// 构造 / 归一
// =========================================================================

/** 空的已渲染快照。 */
export function emptyRenderedSnapshot(): TurnRenderedSnapshot {
  return {
    content: "",
    events: [],
    phases: [],
    startedAt: null,
    elapsedMs: null,
    toolCallCount: null,
    thinkingCount: null,
    terminalReason: null,
  };
}

/** 空的轮次记录。 */
export function emptyTurnRecord(sessionId: string, now: number = 0): TurnRecord {
  return {
    sessionId,
    turnKey: null,
    seq: null,
    renderedSnapshot: emptyRenderedSnapshot(),
    updatedAt: now,
  };
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v !== "" ? v : null;
}

/** 把任意来源的原始载荷归一成 `TurnRenderedSnapshot` (逐字段容错)。 */
export function normalizeRenderedSnapshot(
  raw: unknown
): TurnRenderedSnapshot {
  const base = emptyRenderedSnapshot();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  return {
    content: typeof o.content === "string" ? o.content : "",
    events: Array.isArray(o.events)
      ? (o.events.filter((e) => !!e && typeof e === "object") as SseToolEvent[])
      : [],
    phases: Array.isArray(o.phases)
      ? (o.phases.filter((p) => !!p && typeof p === "object") as SsePhase[])
      : [],
    startedAt: numOrNull(o.startedAt),
    elapsedMs: numOrNull(o.elapsedMs),
    toolCallCount: numOrNull(o.toolCallCount),
    thinkingCount: numOrNull(o.thinkingCount),
    terminalReason: strOrNull(o.terminalReason),
  };
}

/**
 * normalizeTurnRecord —— 把落盘读回来的原始载荷归一成 `TurnRecord`。
 *
 * ⚠️ 落盘数据可能来自旧版本 / 手工改坏 ⇒ **逐字段容错**, 坏字段退回默认值,
 *   绝不整体抛掉 (那样就等于「刷新后正文没了」的老 bug 换了个写法)。
 *
 * @param raw       落盘载荷
 * @param sessionId 归属会话 (以它为准, 不信载荷里的)
 * @param now       归一失败时用的时间戳
 */
export function normalizeTurnRecord(
  raw: unknown,
  sessionId: string,
  now: number = 0
): TurnRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const seq = strOrNull(o.seq);
  return {
    sessionId,
    turnKey: strOrNull(o.turnKey),
    // ⛔ 游标必须还是**纯十进制串** (L-33) —— 落盘的老数据可能是脏的。
    seq: seq && /^\d+$/.test(seq) ? seq : null,
    renderedSnapshot: normalizeRenderedSnapshot(o.renderedSnapshot),
    updatedAt: numOrNull(o.updatedAt) ?? now,
  };
}

// =========================================================================
// 合并 (纯函数)
// =========================================================================

/**
 * 一帧「内容帧」的最小形状 —— 本目录只认这几个字段。
 *
 * ⚠️ 宿主层的 `ChatChunk` 会被**适配**成这个形状再喂进来 (page.tsx)。
 */
export interface TurnFrameLike {
  /**
   * ★ 服务端给的序号 (v2 帧信封) —— **必填**。
   *
   * ⚠️ 为什么必填 (缺陷 W-1 的**根因**): 这个字段一旦可选, 宿主适配层漏传
   *   **编译器不会报错** ⇒ 状态机永远看不到显式 seq ⇒ T-09 的「跳号」判定
   *   在生产里**永远走不到** (缺陷 W-1 实测: web 侧一直漏传, 却没人发现)。
   *   必填 ⇒ 漏传直接**编译不过** ⇒ 这类洞以后不可能再悄悄发生。
   *
   *   老服务端没有 ⇒ 宿主**显式**给 `null` (⇒ 只判重复、不判跳号的老分支)。
   */
  seq: number | string | null;
  /** 增量正文。 */
  content?: string | null;
  /** 增量思考链 (v1 逐 chunk; v2 服务端给的是已合并形态)。 */
  reasoning?: string | null;
  /** 单个富事件。 */
  event?: SseToolEvent | null;
  /** 富事件数组。 */
  events?: SseToolEvent[] | null;
  /** 轮次开始时刻 (v2 帧带)。 */
  startedAt?: number | null;
  /** 服务端算的累计耗时 (v2 帧带) —— 四要素之一。 */
  elapsedMs?: number | null;
  /** 逻辑工具调用次数 (v2 帧带) —— 四要素之一。 */
  toolCallCount?: number | null;
  /** 逻辑思考段数 (v2 帧带) —— 四要素之一。 */
  thinkingCount?: number | null;
  // ── 终态相关 (状态机判终态用; **不影响**已渲染快照) ──
  /** 轮次终态标记 (`done`)。⚠️ 一轮里会来不止一次 (中途哨兵也带 done)。 */
  done?: boolean | null;
  /** 轮次终态帧的服务端主键 (认亲用; 中途哨兵不带)。 */
  messageId?: string | null;
  /** 取消标记 (`done.cancelled`)。 */
  cancelled?: boolean | null;
  /** 错误文案。 */
  error?: string | null;
  /** 机器可读错误码 —— **天眼命中 = `OUTPUT_FILTER_HIT`** (订正 8 / 11)。 */
  code?: string | null;
  /** v2: 服务端给的终态分类 (T-12)。老服务端没有 ⇒ 端侧推导。 */
  terminalReason?: string | null;
}

/**
 * mergeFrame —— 把一帧并进已渲染快照。
 *
 * ⚠️ **不做 thinking 合并** (T-16): 相邻 thinking chunk 原样各占一条 ——
 *   「该合成几条」是**服务端**的决定 (落库的 phases_json 即已合并形态),
 *   端侧只渲染不推算。
 *   ⇒ 老服务端的 raw 数据由 `renderPhases` 的**兼容分支**兜 (见下)。
 */
export function mergeFrame(
  snapshot: TurnRenderedSnapshot,
  frame: TurnFrameLike
): TurnRenderedSnapshot {
  const next: TurnRenderedSnapshot = {
    ...snapshot,
    events: [...snapshot.events],
    phases: [...snapshot.phases],
  };
  if (typeof frame.content === "string" && frame.content !== "") {
    next.content = snapshot.content + frame.content;
  }
  if (typeof frame.reasoning === "string" && frame.reasoning !== "") {
    next.phases.push({ type: "thinking", text: frame.reasoning, ts: 0 });
  }
  if (frame.event && typeof frame.event === "object") {
    next.events.push(frame.event);
    next.phases.push({ type: "tool", event: frame.event, ts: 0 });
  }
  if (Array.isArray(frame.events)) {
    for (const ev of frame.events) {
      if (!ev || typeof ev !== "object") continue;
      next.events.push(ev);
      next.phases.push({ type: "tool", event: ev, ts: 0 });
    }
  }
  // 四要素: 服务端给了才覆盖 (老服务端没有 ⇒ 保持 null, 上层走本地兜底)。
  if (typeof frame.startedAt === "number") next.startedAt = frame.startedAt;
  if (typeof frame.elapsedMs === "number") next.elapsedMs = frame.elapsedMs;
  if (typeof frame.toolCallCount === "number") next.toolCallCount = frame.toolCallCount;
  if (typeof frame.thinkingCount === "number") next.thinkingCount = frame.thinkingCount;
  // 终态分类 (T-12): 服务端给了才记 (老服务端没有 ⇒ 端侧推导后写回)。
  if (typeof frame.terminalReason === "string") next.terminalReason = frame.terminalReason;
  return next;
}

/**
 * `attach_ok.summary` 的形状 (T-18 / 订正 13)。
 *
 * ⚠️ 必须是**轮次开始以来的完整摘要**, 不是增量。
 */
export interface TurnSummaryLike {
  startedAt?: number | null;
  elapsedMs?: number | null;
  toolCallCount?: number | null;
  thinkingCount?: number | null;
  phases?: SsePhase[] | null;
  content?: string | null;
  events?: SseToolEvent[] | null;
}

/**
 * mergeSummary —— 把 `attach_ok.summary` 并进快照。
 *
 * ⇒ 接回后 box 的三个数字与「从头看」完全一致 (T-18)。
 */
export function mergeSummary(
  snapshot: TurnRenderedSnapshot,
  summary: TurnSummaryLike
): TurnRenderedSnapshot {
  const next: TurnRenderedSnapshot = {
    ...snapshot,
    events: [...snapshot.events],
    phases: [...snapshot.phases],
  };
  if (typeof summary.startedAt === "number") next.startedAt = summary.startedAt;
  if (typeof summary.elapsedMs === "number") next.elapsedMs = summary.elapsedMs;
  if (typeof summary.toolCallCount === "number") next.toolCallCount = summary.toolCallCount;
  if (typeof summary.thinkingCount === "number") next.thinkingCount = summary.thinkingCount;
  // ⚠️ summary 的 phases 是**整轮**的 (不是增量) ⇒ 直接替换, 不追加。
  if (Array.isArray(summary.phases)) {
    next.phases = summary.phases.filter(
      (p) => !!p && typeof p === "object"
    ) as SsePhase[];
  }
  if (typeof summary.content === "string" && summary.content !== "") {
    next.content = summary.content;
  }
  if (Array.isArray(summary.events)) {
    next.events = summary.events.filter(
      (e) => !!e && typeof e === "object"
    ) as SseToolEvent[];
  }
  return next;
}

/**
 * mergeServerSnapshot —— 把服务端给的**轮次快照**并进本端快照。
 *
 * 用途: `attach_failed.snapshot` (T-08) / `GET /turn-snapshot`。
 * ⇒ 降级时**必须带内容** (G-4), 不许出现「接回来但内容没了」。
 */
export function mergeServerSnapshot(
  snapshot: TurnRenderedSnapshot,
  server: TurnSummaryLike & { terminalReason?: string | null }
): TurnRenderedSnapshot {
  const next = mergeSummary(snapshot, server);
  if (typeof server.terminalReason === "string") {
    next.terminalReason = server.terminalReason;
  }
  return next;
}

/**
 * purgeRenderedContent —— 天眼命中 ⇒ **撤掉已渲染的 partial 正文** (T-13 / 订正 11)。
 *
 * ⚠️ 合规条款: 过滤是**流式**命中 —— 命中前的那部分 chunk 已经发到端上了。
 *   端侧**必须**在收到终止信号后把它撤掉, 换成天眼文案。
 *   ⇒ 正文清空, 但**事件/阶段留着** (审计用: 这一轮确实发生过工具调用)。
 */
export function purgeRenderedContent(
  snapshot: TurnRenderedSnapshot
): TurnRenderedSnapshot {
  return { ...snapshot, content: "" };
}

// =========================================================================
// 渲染口径 (thinking 合并的单点化 —— T-16)
// =========================================================================

/**
 * renderPhases —— 决定**渲染**出来的相位数组。
 *
 * ⚠️ **单点化** (T-16 / 架构 §2.5.3): 相邻 thinking 的合并**只有这一处**。
 *   服务端 (v2) 落库的 `phases_json` **就是已合并形态** ⇒ 端侧**原样渲染**,
 *   绝不二次合并 (二次合并会把服务端刻意分开的思考段又粘回去 ⇒ 次数漂移)。
 *
 * @param phases  相位数组
 * @param opts.authoritative
 *        · `true`  —— 服务端给了权威的 `thinkingCount` ⇒ 数组**已是**合并形态
 *          ⇒ **原样返回** (主路径)。
 *        · `false` —— 服务端**没给**权威值 ⇒ 老服务端 (v1 契约下 `phases_json`
 *          是 raw 流式累积结果) ⇒ 走**兼容分支**: 把相邻 thinking 合成一条。
 *
 * ⚠️ **兼容分支待下线** (R5): 服务端上 TurnStore 之后 (phases 落库即已合并)
 *   这个分支就可以整条删掉。现在**必须保留** —— v1 契约下已落库的历史消息
 *   是 raw, 删了 ⇒ 历史消息会展示 20 条独立短 thinking 而不是 1 条完整思考链
 *   (gaga 真机截图证据: 🧠 思考 20 次 · 工具 0 次)。
 */
export function renderPhases(
  phases: SsePhase[],
  opts?: { authoritative?: boolean }
): SsePhase[] {
  const src = Array.isArray(phases) ? phases : [];
  if (opts?.authoritative === true) {
    // ★ 主路径: **原样**, 一条不多一条不少。
    return src.slice();
  }
  // ⚠️ 兼容分支 (R5 删): 相邻 thinking 合成一条。
  const out: SsePhase[] = [];
  let openThinking = -1;
  for (const p of src) {
    if (!p || typeof p !== "object") continue;
    if (p.type === "thinking") {
      if (openThinking >= 0) {
        const cur = out[openThinking];
        if (cur && cur.type === "thinking") {
          cur.text = (cur.text ?? "") + (p.text ?? "");
          if (typeof p.ts === "number") cur.ts = p.ts;
        }
      } else {
        out.push({ type: "thinking", text: p.text ?? "", ts: p.ts ?? 0 });
        openThinking = out.length - 1;
      }
    } else {
      // tool 出现 ⇒ 关闭任何 open thinking (下一个 thinking 重新开一条)。
      openThinking = -1;
      out.push(p);
    }
  }
  return out;
}

/**
 * countPhases —— 数一��相位数组里的 thinking / tool 条数。
 *
 * ⚠️ 这是**兜底**计数 (服务端没给权威 count 时才用);
 *   服务端给了 `toolCallCount` / `thinkingCount` 的一律用服务端的 (T-15/T-17)。
 */
export function countPhases(phases: SsePhase[]): {
  thinking: number;
  tool: number;
} {
  let thinking = 0;
  let tool = 0;
  for (const p of phases) {
    if (!p || typeof p !== "object") continue;
    if (p.type === "thinking") thinking++;
    else if (p.type === "tool") tool++;
  }
  return { thinking, tool };
}

// =========================================================================
// 存储端口 (宿主层实现 —— web 用 IndexedDB, PC 用自己的, 安卓用 Room)
// =========================================================================

/**
 * TurnRecordStorage —— 轮次记录的存储端口。
 *
 * ⚠️ **存储实现可不同, 语义必须一致** (契约订正 7)。
 */
export interface TurnRecordStorage {
  get(sessionId: string): Promise<TurnRecord | null>;
  put(record: TurnRecord): Promise<void>;
  remove(sessionId: string): Promise<void>;
}

/** 轮次记录仓库 (读 / 写 / 清)。 */
export interface TurnRecordStore {
  /** 读本机的轮次记录 (没有 ⇒ null)。 */
  read(sessionId: string): Promise<TurnRecord | null>;
  /** 写 (upsert)。 */
  write(record: TurnRecord): Promise<void>;
  /** **删掉整条** —— 只在「这轮彻底结束且内容已落库」时用。 */
  clear(sessionId: string): Promise<void>;
}

/**
 * createTurnRecordStore —— 造一个轮次记录仓库。
 *
 * ⚠️ 存储挂了 (隐私模式 / quota 满) ⇒ **降级到内存态**, 绝不冒泡打断主链路。
 */
export function createTurnRecordStore(
  storage: TurnRecordStorage,
  now: () => number = () => Date.now()
): TurnRecordStore {
  const mem = new Map<string, TurnRecord>();
  return {
    async read(sessionId) {
      try {
        const raw = await storage.get(sessionId);
        if (raw) {
          const norm = normalizeTurnRecord(raw, sessionId, now());
          if (norm) return norm;
        }
      } catch (err) {
        console.warn("[turn-record] 读取失败, 降级到内存态:", err);
      }
      return mem.get(sessionId) ?? null;
    },
    async write(record) {
      mem.set(record.sessionId, record);
      try {
        await storage.put(record);
      } catch (err) {
        console.warn("[turn-record] 落盘失败, 降级到内存态:", err);
      }
    },
    async clear(sessionId) {
      mem.delete(sessionId);
      try {
        await storage.remove(sessionId);
      } catch (err) {
        console.warn("[turn-record] 删除失败:", err);
      }
    },
  };
}
