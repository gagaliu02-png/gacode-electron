/**
 * components/chat/MessageList.tsx — 阶段 2 消息列表容器
 *
 * 渲染: 垂直堆叠 MessageBubble + 自动滚到底部 (仅在用户没主动向上滚时).
 *
 * 状态: messages[] + streamingAssistantId (谁在流式).
 *
 * 设计要点:
 *   - 流式期间持续追加 chunk 不抖动: 用 sticky 底部 + scrollIntoView({block: "end"})
 *   - 用户向上滚动 (滚到底距离 > 阈值) → 停止自动滚, 让用户自己看历史
 *   - 用户再滚到底 → 恢复自动滚
 *
 * ★ [T-156 · 2026-11-26] **窗口化** —— 只把可见窗口里的消息挂进 DOM。
 *
 *   ## 为什么不是引入 react-window 之类
 *
 *     仓库没有虚拟化依赖（package.json 里只有 React 一套）⇒ 自己实现最小窗口：
 *     `ResizeObserver` 量视口高 + 每条测过一次的真实高度（没测过用估算值）⇒
 *     算出可见区间 [start, end) + overscan（上下各 3 条）⇒ 只 map 这一段。
 *     ⛔ **窗口只管「哪几条进 DOM」，`messages` 数组本身一个字都不动** ——
 *        segment/turn 合并、乐观行认亲、SSE 流式新增都由 ChatDetail 在数组里做，
 *        窗口层永远看到的是最新完整数组（新消息来了立刻在窗口里出现）。
 *
 *   ## 滚动位置补偿
 *
 *     历史消息高度是测出来的 ⇒ 上滚/下滚后进入窗口的新行高度跟估算不同会导致跳动。
 *     渲染后用 `useLayoutEffect` 把**窗口前的实际高度**重新累加，若跟渲染前估计不同
 *     就调整 `scrollTop`（并同步更新 offset 表）⇒ 视觉上不跳。
 *
 *   ## 老消息按需加载（跟 P0-2 配合）
 *
 *     `onLoadOlder` 存在时，滚到顶 60px 内触发一次（父组件拿 nextCursor 去取更早的页）。
 *     取回来的行 prepend 到数组 ⇒ 本组件用 `anchorId` 找到它，把 scrollTop 加上
 *     新增行的高度 ⇒ 用户视线停在原来那条消息上（不是突然跳到别处）。
 */
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MessageBubble } from "./MessageBubble";
import type { RichEvent } from "./RichEventBubble";
import type { MessageAction } from "./MessageMenu";
import type { CallTreeNode } from "./CallTreeCard";
import type { ExecutionPhase } from "./ExecutionTimeline";

export interface ChatMessageModel {
  id: string;
  /**
   * ★ [订正 28 · L-28r] **服务端那一行的真 id**（没有 ⇒ 用 `id`）。
   *
   *   「补充」那条（会话收件箱）渲染时用的是**合成 id** `supplement:<inbox_id>`
   *   （跟直播时插的那条**同一条** ⇒ 不重复显示）⇒ 而「撤回 / 删除」这类
   *   **要打服务端**的动作必须用**真 id** ⇒ 两者分开。
   */
  serverId?: string | null;
  role: "user" | "assistant";
  content: string;
  /** 服务端落库 metadata 字段 (image_urls / attached_file_ids / attached_files) */
  imageUrls?: string[];
  attachedFileIds?: string[];
  attachedFileNames?: Array<{ fileId: string; name: string }>;
  /** 流式累积的 rich events (tool_start / file / image / thinking / …) */
  richEvents?: RichEvent[];
  createdAt?: string;
  /** 阶段 8: 是否已撤回 (server listChatMessages 透传 recalled / recalled_at) */
  recalled?: boolean;
  recalledAt?: string | null;
  // ============== 0.7.5 ==============
  /** chat-id-9: server metadata.knowledge_refs */
  knowledgeRefs?: string[];
  /**
   * ★ v2 (契约订正 16): **轮次身份** (`tk_xxx`)。
   *   历史消息来自 `metadata.turnKey`; 流式行来自帧顶层的 `turnKey` ——
   *   两者是**同一个值** ⇒ 「本地流式行 ↔ 服务端那一行」可精确认亲 (空气泡根治)。
   */
  turnKey?: string | null;
  /**
   * ★ [T-040/T-044 · 2026-11-18] **这条消息的客户端身份**（ULID）——
   *   跟服务端那一行的 `client_msg_id` 对上。
   *
   *   ## 为什么必须带
   *
   *   端侧上屏时先落一条**乐观行**（本地立刻显示）⇒ 服务端那一行回来后要**认亲**，
   *   认上了才把乐观行**撤掉**（否则屏幕上两个 user 气泡）。
   *   ⇒ 老的判据是「**同内容**」⇒ **猜** ⇒ 用户问**两遍同一句**时会把乐观行提前撤掉
   *     （用户自己那条话「闪一下就没了」）。
   *   ⇒ 有 `clientMsgId` ⇒ **逐字相等**才是同一条（物理同一条，不是「看着像」）。
   *
   *   ⚠️ **必须从 history 映射里透传进来** —— 服务端 history 的 user 行**带**这个值
   *      （`yinian.service.js` 的 `client_msg_id`），端侧 `api.getHistory` 也**已经**解析了
   *      （`api.ts` 的 `clientMsgId`）⇒ **只差这一段映射** ⇒ 不带就永远认不上 ⇒ 重复气泡。
   */
  clientMsgId?: string | null;
  /**
   * ★ [2026-11-16] **这一行是不是「服务端投递的系统注记」**（不是用户说的话）。
   *
   *   服务端起轮（订正 30）时落了一条 `role='user'` 的消息行 ⇒ 光看 role 分不出来
   *   ⇒ 端侧靠 `metadata.source` / `metadata.skip_transcript` 认它（判据见
   *   `src/lib/sse/turn-identity.ts` 的 `isSystemNoticeMetadata`）⇒ 渲染成
   *   **系统注记**（居中浅色提示条），**不出现**用户消息专属操作。
   */
  isSystemNotice?: boolean;
  /** chat-id-40: server metadata.quoted_message_id / quoted_content */
  quotedMessageId?: string | null;
  quotedContent?: string | null;
  /** chat-id-20: 流式开始时间戳 ms (parent 用 useRef Date.now() 记) */
  streamingSince?: number | null;
  /** chat-id-11 / chat-id-20: server metadata.tool_total_ms */
  toolTotalMs?: number | null;
  /**
   * A2-D4-02 · 思考 / 工具时间线 (assistant 才有).
   * 数据源 = `routes/ChatDetail.tsx` 流式累积的 `chunk.reasoning` + tool 事件.
   */
  phases?: ExecutionPhase[];
  /** chat-id-12: call tree 节点 (parent 从 chunk.events 解析) */
  callTree?: CallTreeNode[];
  // ====== 重构轮 R2-web · 四要素的**服务端权威值** (T-15 / T-16 / T-17) ======
  /** 服务端算的累计耗时 (ms) —— 四要素之一。 */
  elapsedMs?: number | null;
  /**
   * 逻辑工具调用次数 (T-17) —— 四要素之一。
   *
   * ★ [T-175] 首屏服务端剥掉了 thinking 段 ⇒ 端侧数不出思考段数
   *   ⇒ 用服务端的权威计数（老端没这俩字段 ⇒ null ⇒ 端侧自己兜底数）。
   */
  toolCallCount?: number | null;
  /** 逻辑思考段数 (T-16) —— 四要素之一。 */
  thinkingCount?: number | null;
  /** 终态分类 (T-12)。 */
  terminalReason?: string | null;
  /** 本轮开始时刻 (ms epoch) —— 本地时钟兜底用。 */
  startedAt?: number | null;
  /** 本轮**结束**时刻 (ms epoch) —— 本地时钟兜底用。 */
  finishedAt?: number | null;
  /** RC-5: 「客户端放弃等一个不会来的结果」。 */
  stalled?: boolean;
}

interface Props {
  messages: ChatMessageModel[];
  /**
   * ★ [T-175] 当前会话 id —— **切会话**的判据（首帧钉底只在换会话时做一次）。
   *
   *   ⚠️ 为什么必须单独传：本组件的自动滚 effect 依赖 `[messages, autoFollow]`
   *   ⇒ **每次** messages 变化（含流式逐帧追加）都会触发。若不加区分地改成
   *   「瞬时钉底」⇒ 流式追加时也会硬跳，观感比现在更差。
   *   ⇒ 只有 `chatId` 变了才走「首帧瞬时钉底」那条路。
   */
  chatId?: string | null;
  /** 当前正在流式的 assistant message id (本地临时 id), 用于 pulse 光标 + typing dots. */
  streamingAssistantId?: string | null;
  /**
   * A2-D4-06 · 当前 chat 中所有 user message 已上传过的 imageUrls 并集.
   */
  stripImageUrls?: string[];
  /**
   * 阶段 8: 消息动作回调 (复制 / 保存到 KB / 点赞 / 点踩 / 撤回 / 删除 / rerun).
   */
  onMessageAction?: (msg: ChatMessageModel, action: MessageAction, ok: boolean) => void;
  /**
   * ★ [T-156] 「加载更早」回调 —— 滚到顶时触发；父组件拿 nextCursor 去取老消息。
   *   不传 ⇒ 老行为（无分页加载）。
   */
  onLoadOlder?: (() => void) | null;
  /** ★ [T-156] 还有没有更早的消息（父组件的 nextCursor != null）。 */
  hasOlder?: boolean;
  /** ★ [T-156] 增量加载中（避免重复触发 + 显示 loading 提示）。 */
  loadingOlder?: boolean;
  /** ★ [T-156] 加载前第一条的 server id —— 用来在加载后恢复视线。 */
  previousFirstId?: string | null;
  /** ★ [T-156] 加载前列表总高（px）—— 加载后 scrollTop 加上新增的高度。 */
  previousScrollHeight?: number | null;
  /**
   * ★ [T-175] **展开时按需拉明细**（首屏不下载思考正文）。
   *   · 入参 = 那条消息的 **server id**（服务端按 id 查明细）。
   *   · 不传 ⇒ 不拉（老行为：明细本来就在手上）。
   */
  onExpandPhases?: ((messageId: string) => void) | null;
  /** ★ [T-175] 正在拉明细的 message id 集合（气泡据此显示 loading）。 */
  phasesLoadingIds?: Set<string> | null;
}

/** 没测过的一条消息的默认高度（px）—— 比真实气泡略小，测过一次后就换成真值。 */
const ESTIMATED_ROW_HEIGHT = 120;
/** 窗口上下各多挂几条 —— 快速滚动时不露白 + 给异步测量留时间。 */
const OVERSCAN = 3;
/** 首屏/数组很短时直接全渲染（窗口化的固定开销不值得付）。 */
const WINDOW_THRESHOLD = 40;

export function MessageList({
  messages,
  chatId = null,
  streamingAssistantId,
  onMessageAction,
  stripImageUrls,
  onLoadOlder,
  hasOlder = false,
  loadingOlder = false,
  previousFirstId = null,
  previousScrollHeight = null,
  onExpandPhases = null,
  phasesLoadingIds = null,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [autoFollow, setAutoFollow] = useState(true);
  // ★ [T-156] 每条消息测过的高度（key = message.id）。
  //   ⚠️ 只**缓存数字**，不缓存组件 ⇒ 流式期间 content 变了，行高会重新测（见 measure）。
  const heightsRef = useRef<Map<string, number>>(new Map());
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  // 防止「滚到顶触发一次 ⇒ 还在顶 ⇒ 再触发」的循环：加载中/没有更早时都拦住。
  const olderRequestedRef = useRef<string | null>(null);

  const enabled = messages.length > WINDOW_THRESHOLD;

  // ══════════════════════════════════════════════════════════════════
  // ★ [T-175] 进会话首帧「钉底」—— 直接落到最后一条，不看估算高度。
  //
  //   ## 病根（真机）
  //
  //     `heightsRef` 在刚进会话时是**空 Map** ⇒ `effectiveOffsets` 里每一行都按
  //     `ESTIMATED_ROW_HEIGHT = 120` 估。长文本 / 图片行常 300~800px ⇒ **真实总高
  //     远大于估算** ⇒ `scrollIntoView` 按估算滚到「底」，实际停在离底一大截的地方。
  //     再叠两个放大器：
  //       ① `behavior: "smooth"` 是异步动画，下面的测量 effect 会在动画途中改
  //          `scrollTop` ⇒ 两者互相打架；
  //       ② 图片是 `loading="lazy"` ⇒ 滚到位才加载 ⇒ 加载完行变高又把人往下顶。
  //     ⇒ 用户看到的就是「进会话不在最新一条」。
  //
  //   ## 修法
  //
  //     · 换会话（`chatId` 变）⇒ 清空高度缓存 + 标记「正在钉底」；
  //     · 钉底期间自动滚用 `behavior:"auto"`（瞬时，不给动画插队的机会）；
  //     · 每轮测量后如果高度还在变，就**再钉一次**（幂等，用 rAF 合并）；
  //     · 钉底**结束条件**：连续若干次测量后总高不再变化，或用户自己滚了。
  //
  //   ⚠️ **不能**无条件瞬时钉底 —— 流式追加时也要瞬时跳底的话，观感比 smooth 差得多
  //      （每条 chunk 都把视线硬拽到底）。⇒ 只有 `pinning` 为真时才这样。
  // ══════════════════════════════════════════════════════════════════
  const [pinning, setPinning] = useState(false);
  /** 上一次的 chatId —— 判「换会话」。 */
  const prevChatIdRef = useRef<string | null>(null);

  // 换会话 ⇒ 高度缓存作废（不同会话的行高毫无关系）+ 开始钉底。
  useLayoutEffect(() => {
    if (prevChatIdRef.current === chatId) return;
    prevChatIdRef.current = chatId;
    heightsRef.current.clear();
    // 有消息才值得钉；空会话不必。
    if (messages.length > 0) setPinning(true);
  }, [chatId, messages.length]);

  // 钉底循环 —— **自驱动 rAF**，每帧把 scrollTop 顶到底，直到总高连续几帧不变。
  //
  //   ## 为什么用 rAF 自驱动，而不是挂在 messages / scrollTop 的依赖上
  //
  //     ① 窗口化下 `scrollHeight` 会因为「新行被测量 → 真实高度替换估算」而**多轮增长**；
  //     ② `scrollTop` 的 state 只在 `enabled` 时才更新（`if (enabled) setScrollTop(...)`）
  //        ⇒ 短列表（!enabled）根本不会回流，挂依赖的话只能钉一次。
  //     ⇒ 自驱动循环对两种情形一视同仁，且天然处理「异步内容把行撑高」。
  //
  //   ## 收工条件
  //
  //     · 连续 3 帧 `scrollHeight` 完全不变 ⇒ 稳定；
  //     · 或超过 1.5s（防某些内容永远在变 ⇒ 无休止钉底）；
  //     · 或用户主动上滚（scroll 监听里 `setPinning(false)` ⇒ 本 effect 清理时 cancel）。
  useLayoutEffect(() => {
    if (!pinning) return;
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    let stable = 0;
    let lastHeight = -1;
    const startedAt = Date.now();
    const tick = () => {
      el.scrollTop = el.scrollHeight;
      const h = el.scrollHeight;
      if (h === lastHeight) {
        stable += 1;
      } else {
        stable = 0;
        lastHeight = h;
      }
      if (stable >= 3 || Date.now() - startedAt > 1500) {
        setPinning(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pinning]);

  // 视口高度 —— ResizeObserver 跟 scroll 事件分开，避免每次滚动都量容器。
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => setViewportHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 自动滚到底 — 在 messages 改变时
  // 对齐 web MessageList.tsx:55-57 — `scrollIntoView({ behavior: "smooth" })`.
  // PC 的 autoFollow (用户上滚 80px 阈值停自动滚) 是 PC 增强 → 保留不动.
  // ★ [T-175] 钉底期间**不**走这条（上面那个 pin effect 已经瞬时钉好了）——
  //   否则 smooth 动画会把刚钉好的位置又拽走。
  useLayoutEffect(() => {
    if (!autoFollow || pinning) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, autoFollow, pinning]);

  // 用户滚动 → 判断是否处于"主动向上"  (阈值 80px)
  // ★ [T-156] 同时记录 scrollTop 给窗口计算用（passive 监听，不阻塞滚动）。
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      // ★ [T-175] 钉底期间：**不判** autoFollow —— 此时的 scroll 事件是
      //   我们自己的 `scrollTop = scrollHeight` 引起的，不是用户滚的。
      //   若照常判，估算总高偏小 ⇒ distance 算出来偏大 ⇒ 误判成「用户在看历史」
      //   ⇒ `autoFollow=false` ⇒ 钉底结束后流式不再跟随（二次 bug）。
      //   ⚠️ 但用户**真的**往上滚时要立刻结束钉底（否则每次测量都把他拽回底）。
      if (pinning) {
        // 离底超过一屏的一半 ⇒ 认定用户主动上滚。
        if (distance > el.clientHeight / 2) {
          setPinning(false);
          setAutoFollow(false);
        }
        if (enabled) setScrollTop(el.scrollTop);
        return;
      }
      // 阈值 80px: 距离 > 80 视为用户在看历史 → 停自动滚
      const sticky = distance < 80;
      setAutoFollow((prev) => {
        if (prev === sticky) return prev;
        return sticky;
      });
      if (enabled) setScrollTop(el.scrollTop);
      // ★ [T-156] 滚到顶 60px 内 ⇒ 按需加载更早的消息（只在有下一页时）。
      if (onLoadOlder && hasOlder && !loadingOlder && el.scrollTop <= 60) {
        const key = `${messages[0]?.id ?? ""}:${messages.length}`;
        if (olderRequestedRef.current !== key) {
          olderRequestedRef.current = key;
          onLoadOlder();
        }
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
    // ★ [T-175] `pinning` 必须在依赖里 —— 否则监听器闭包里永远读到 `false`，
    //   钉底期间的「不判 autoFollow」分支等于没写。
  }, [enabled, hasOlder, loadingOlder, messages, onLoadOlder, pinning]);

  const [measuredTick, setMeasuredTick] = useState(0);
  const effectiveOffsets = useMemo(() => {
    void measuredTick;
    const arr = new Array<number>(messages.length + 1);
    arr[0] = 0;
    for (let i = 0; i < messages.length; i += 1) {
      arr[i + 1] = arr[i] + (heightsRef.current.get(messages[i].id) ?? ESTIMATED_ROW_HEIGHT);
    }
    return arr;
  }, [messages, measuredTick]);

  const windowRange = useMemo(() => {
    if (!enabled || viewportHeight <= 0) {
      return { start: 0, end: messages.length };
    }
    // 二分找第一个 bottom > scrollTop 的行。
    let lo = 0;
    let hi = messages.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (effectiveOffsets[mid + 1] <= scrollTop) lo = mid + 1;
      else hi = mid;
    }
    const start = Math.max(0, lo - OVERSCAN);
    let end = lo;
    const limit = scrollTop + viewportHeight;
    while (end < messages.length && effectiveOffsets[end] < limit) end += 1;
    return { start, end: Math.min(messages.length, end + OVERSCAN) };
  }, [enabled, messages.length, viewportHeight, scrollTop, effectiveOffsets]);

  // ★ [T-156] 测量真实行高 + 修正滚动位置（避免估算差异导致视觉跳动）。
  //   加载更早时父组件记录加载前的 scrollHeight / 第一条 id ⇒ 这里在 DOM 更新后
  //   用新的 scrollHeight 减旧值补偿 scrollTop ⇒ 用户视线停在原来那条消息上。
  const prevFirstRef = useRef<string | null>(previousFirstId);

  useLayoutEffect(() => {
    const newFirst = messages[0]?.id ?? null;
    const isOlderLoad =
      !!previousFirstId &&
      prevFirstRef.current === previousFirstId &&
      newFirst !== previousFirstId &&
      typeof previousScrollHeight === "number";
    prevFirstRef.current = previousFirstId;
    if (!enabled) return;
    const scroller = scrollerRef.current;
    if (!scroller) return;
    let changed = false;
    // 逐个量当前挂上的行（只有窗口内的几条 ⇒ 每帧成本 O(overscan)）。
    for (const m of messages.slice(windowRange.start, windowRange.end)) {
      const node = scroller.querySelector<HTMLElement>(`[data-msg-id="${m.id}"]`);
      if (!node) continue;
      const h = node.getBoundingClientRect().height;
      if (h > 0 && Math.abs((heightsRef.current.get(m.id) ?? 0) - h) > 1) {
        heightsRef.current.set(m.id, h);
        changed = true;
      }
    }
    if (isOlderLoad) {
      const delta = scroller.scrollHeight - previousScrollHeight!;
      if (delta > 0) scroller.scrollTop += delta;
    }
    if (changed) setMeasuredTick((v) => v + 1);
  }, [
    messages,
    enabled,
    windowRange,
    effectiveOffsets,
    previousFirstId,
    previousScrollHeight,
  ]);

  /** 单条消息卡片 —— 抽出来是为了给每个 DOM 节点挂 `data-msg-id` 供测量用。 */
  const renderBubble = (m: ChatMessageModel): ReactNode => (
    <div data-msg-id={m.id} key={m.id}>
      <MessageBubble
        key={m.id}
        // ★ [订正 28 · L-28r] 「撤回 / 删除」要打服务端 ⇒ 用**真 id**
        //   （`id` 可能是合成 id `supplement:<inbox_id>`）。
        messageId={m.serverId ?? m.id}
        role={m.role}
        content={m.content}
        richEvents={m.richEvents}
        imageUrls={m.imageUrls}
        attachedFileIds={m.attachedFileIds}
        attachedFileNames={m.attachedFileNames}
        isStreaming={
          !!streamingAssistantId &&
          m.id === streamingAssistantId &&
          m.role === "assistant" &&
          // ★ RC-5: `stalled` 的行**不是**在流式 ⇒ 不打 pulse 光标、不挂秒表
          m.stalled !== true
        }
        createdAt={m.createdAt}
        recalled={m.recalled}
        recalledAt={m.recalledAt}
        knowledgeRefs={m.knowledgeRefs}
        // ★ [2026-11-16] 系统注记（服务端投递的机器事件行）⇒ 渲染成居中提示条。
        isSystemNotice={m.isSystemNotice}
        quotedMessageId={m.quotedMessageId}
        quotedContent={m.quotedContent}
        phases={m.phases}
        stripImageUrls={stripImageUrls}
        callTree={m.callTree}
        // ★ R2-web: 四要素 (服务端权威) —— 透传给气泡, 端侧只渲染不推算。
        elapsedMs={m.elapsedMs}
        toolCallCount={m.toolCallCount}
        thinkingCount={m.thinkingCount}
        // ★ [T-175] 展开时按需拉明细（首屏不下载思考正文）。
        onExpandPhases={
          onExpandPhases && m.serverId ? () => onExpandPhases(m.serverId!) : null
        }
        phasesLoading={
          !!(phasesLoadingIds && m.serverId && phasesLoadingIds.has(m.serverId))
        }
        terminalReason={m.terminalReason}
        startedAt={m.startedAt}
        finishedAt={m.finishedAt}
        // ★ RC-5: 「未收到服务端回复」标注 (安卓同款 `stalled`)。
        stalled={m.stalled}
        onAction={
          onMessageAction
            ? (action, ok) => onMessageAction(m, action, ok)
            : undefined
        }
      />
    </div>
  );

  const visible = useMemo(
    () => messages.slice(windowRange.start, windowRange.end),
    [messages, windowRange.start, windowRange.end],
  );

  return (
    <div className="relative h-full">
      <div
        ref={scrollerRef}
        className="h-full overflow-y-auto p-4"
        aria-label="消息列表"
      >
        {/* ★ [T-156] 「加载更早」提示条 —— 用户主动点也能触发（不依赖滚到顶）。 */}
        {hasOlder && onLoadOlder ? (
          <div className="max-w-3xl mx-auto mb-3 flex justify-center">
            <button
              type="button"
              disabled={loadingOlder}
              onClick={() => {
                const key = `${messages[0]?.id ?? ""}:${messages.length}`;
                if (olderRequestedRef.current !== key) {
                  olderRequestedRef.current = key;
                  onLoadOlder();
                }
              }}
              className="px-3 py-1 rounded-md border border-border/60 bg-bg-sunken/60 text-xs text-fg-muted hover:text-fg hover:bg-bg-sunken disabled:opacity-50"
            >
              {loadingOlder ? "加载更早的消息…" : "加载更早的消息"}
            </button>
          </div>
        ) : null}
        {/* 消息内容容器 — 对齐 web MessageList.tsx:79 `max-w-3xl mx-auto space-y-4` */}
        <div className="max-w-3xl mx-auto">
          {enabled && windowRange.start > 0 ? (
            <div
              aria-hidden="true"
              style={{ height: effectiveOffsets[windowRange.start] }}
            />
          ) : null}
          <div className="space-y-4">
            {visible.map(renderBubble)}

            <div ref={bottomRef} aria-hidden="true" />
          </div>
          {enabled && windowRange.end < messages.length ? (
            <div
              aria-hidden="true"
              style={{
                height:
                  effectiveOffsets[messages.length] - effectiveOffsets[windowRange.end],
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
