/**
 * components/chat/ExecutionTimeline.tsx — 助手气泡内的「思考 / 工具」时间线
 *
 * 1:1 对齐 web `gacode-web/src/components/chat/ExecutionTimeline.tsx` (159 行).
 * PC 之前只有 `ExecutionTiming.tsx` (气泡底部一行「已执行 X 秒」小字),
 * 缺 web 的可折叠时间线 (A2-D4-02).
 *
 * 设计 (跟 web 一致):
 *   - 折叠态: header "思考 N 次 · 工具 M 次 ⌄", 点击展开
 *   - 展开态: 一条 phase 一行 (thinking / tool 两种形态)
 *   - thinking 行可再点开看原文 (纯文本 + 等宽字体, 不破坏 Markdown 渲染)
 *
 * ★ [批 G9 · 2026-11-04] **工具过程收纳进本折叠区** (安卓同款) ───────────────
 *   旧实现: tool phase 只给一行摘要 (icon + type + 标题), 而**完整卡片**
 *   (带参数 / 带耗时的 tool_start / tool_done) 渲染在**正文下方**
 *   ⇒ gaga 2026-11-04 反馈: 「工具的使用过程应该收纳到思考和工具这个子气泡里,
 *   而不是直接在正文的地方显示」。
 *
 *   现在: tool phase 渲染成**完整卡片** (安卓 `ToolPhaseRow → RichBubbleList →
 *   ToolCallBubble` 同款), 跟思考段在展开区里**按到达顺序交错**。
 *   ⛔ tool_start / tool_done **不合并成一条** —— 安卓的 `mergeEvents` 只动
 *   `msg.events`, `msg.phases` 是**追加**的 ⇒ 安卓也是两张卡 (参数卡 + 完成卡)。
 *   ⇒ 参数不会因为「完成」而消失。
 *
 *   ⚠️ 事件先过**归一层** (`normalizeRichEvent`) ⇒ 死类型 / 未知类型跳过,
 *     不渲染 JSON 字面 —— 跟正文那条渲染路径 (`parsePhasesRichEvents`) 同一口径。
 *
 * 图标: PC 无 lucide-react →
 *   - ChevronRight / Brain / ChevronDown 全部复用 `components/ui/Glyphs.tsx`
 *     (2026-10-26 并入, A2-D4-02 收尾)
 *
 * 挂载点 (M3 批次): `components/chat/MessageBubble.tsx` assistant 气泡正文**上方**
 *   (对齐 web `MessageBubble.tsx:396-398`).
 *   数据通路 (ChatMessageModel.phases + ChatDetail 流式累积) 同属 M3 批次,
 *   本文件只交付组件本体.
 */
import { useMemo, useState } from "react";
import {
  BrainIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "../ui/Glyphs";
// ★ 重构轮 R2-web (T-16 / T-17): 计数与合并的**口径**归到 sse/ 那一套。
//   · `renderPhases` —— 相邻 thinking 的合并**只有这一处** (主路径原样 / 兼容分支合并);
//   · `countPhases`  —— 端侧兜底计数 (服务端给了权威值时**不用**它)。
import { renderPhases, countPhases, type SsePhase } from "../../lib/sse/turn-record";
// ★ [批 G9 · 2026-11-04] 归一层 (死类型 / 未知类型跳过) —— 与正文渲染同一口径。
import { normalizeRichEvent } from "../../lib/rich-events";
// ★ [批 G9 · 2026-11-04] tool phase 渲染成完整卡片 (安卓 ToolPhaseRow 同款)。
import { RichEventBubble } from "./RichEventBubble";

// ════════════════════════════════════════════════════════════
// phase 模型 + helpers
// ════════════════════════════════════════════════════════════

export interface ExecutionPhase {
  type: "thinking" | "tool";
  /** 仅 thinking phase 有 — 累积同一段思考链的多 chunk */
  text?: string;
  /** 仅 tool phase 有 — rich_event 子集 (tool_start / file / image / web_preview / …) */
  event?: Record<string, unknown>;
  /** ms epoch, 用于时间线渲染顺序对齐 */
  ts?: number;
}

export interface ExecutionTimelineProps {
  phases: ExecutionPhase[];
  defaultExpanded?: boolean;
  /**
   * ★ v2 (T-17): 服务端给的**逻辑**工具调用次数。
   *   - 有值 ⇒ header 用它 (端侧**不数帧** —— 一次工具调用会产生多帧, 数帧会虚高);
   *   - 没有 (老服务端) ⇒ 端侧按相位数组兜底数。
   */
  toolCallCount?: number | null;
  /**
   * ★ v2 (T-16): 服务端给的**逻辑**思考段数。
   *   - 有值 ⇒ header 用它;
   *   - 没有 ⇒ 端侧兜底数。
   */
  thinkingCount?: number | null;
  /**
   * ★ [T-175] **展开时按需加载明细**（首屏不下载思考正文）。
   *
   *   ## 为什么
   *
   *     思考正文单条可达几十 KB（`phases_json` 上限 64KB/条）
   *     ⇒ 首屏 100 条就是几 MB 的下载 + JSON.parse ⇒ 开长会话卡。
   *     ⇒ 服务端在 `include_phases=0` 时**剥掉 thinking 段**（保留 tool 段，
   *     交付物卡片不受影响）⇒ 首屏只拿**计数**。
   *
   *   ## 契约
   *
   *     · 用户点开折叠区 ⇒ 调它 ⇒ 拉明细 ⇒ 父组件把新 phases 传下来；
   *     · 拉取**期间**显示 loading 提示（`loading` prop）；
   *     · 不传 ⇒ 老行为（明细本来就在手上，直接展开）。
   */
  onExpand?: (() => void) | null;
  /** ★ [T-175] 明细正在加载（首屏没拿到明细时展开 ⇒ 显示 loading）。 */
  loading?: boolean;
}

/**
 * 简化的 phase 类型标签计数 — header 用 (**兜底**)。
 *
 * ⚠️ 服务端给了 `toolCallCount` / `thinkingCount` 时**不用**它 (T-15 / T-17):
 *   端侧数的是**帧**, 服务端数的是**逻辑调用** —— 一次工具调用会产生
 *   tool_start + tool_done + 富事件好几帧 ⇒ 端侧数出来虚高。
 */
function fallbackCount(phases: SsePhase[]) {
  const r = countPhases(phases);
  return { thinking: r.thinking, tool: r.tool };
}

/**
 * ★ [T-175] **轻量计数** —— 只数 phase 的类型，不做任何文本处理。
 *
 *   折叠态用它算 fallback 计数（服务端没给权威值时）——
 *   `renderPhases` 会把相邻 thinking 的 text 拼起来（几十 KB 字符串活），
 *   折叠态没必要付这个成本。
 *
 *   ⚠️ 与 `fallbackCount` 的口径差异：thinking 段数在 v1 兼容分支里会被**合并**，
 *      这里数的是**原始**条数 ⇒ 老服务端（无权威计数）时折叠态可能比展开态多几。
 *      展开态仍用 `fallbackCount`（与历史视图同款）⇒ 展开时数字会变少 —— 可接受。
 */
function lightweightCount(phases: ExecutionPhase[]) {
  let thinking = 0;
  let tool = 0;
  for (const p of phases) {
    if (p.type === "thinking") thinking += 1;
    else if (p.type === "tool") tool += 1;
  }
  return { thinking, tool };
}

// ════════════════════════════════════════════════════════════
// ExecutionTimeline
// ════════════════════════════════════════════════════════════

export function ExecutionTimeline({
  phases,
  defaultExpanded = false,
  toolCallCount = null,
  thinkingCount = null,
  onExpand,
  loading = false,
}: ExecutionTimelineProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [openThinkingIdx, setOpenThinkingIdx] = useState<number | null>(null);

  // ★ [T-175] 「没有明细」≠「没有折叠区」——
  //   首屏服务端剥掉了 thinking 段（`include_phases=0`）⇒ `phases` 里只剩 tool 段
  //   ⇒ 有些消息 **phases 为空但 thinking_count > 0** ⇒
  //   ⛔ 老判据 `phases.length === 0 ⇒ return null` 会让**折叠区整个消失**
  //      ⇒ 用户连「思考 N 次」都看不到 ⇒ 更没法点开去拉。
  //   ⇒ 改成：没有任何信息（无 phases 且无计数）才不渲染。
  const hasPhases = !!phases && phases.length > 0;
  const hasCounts = (thinkingCount ?? 0) > 0 || (toolCallCount ?? 0) > 0;
  if (!hasPhases && !hasCounts) return null;

  // ★ 相邻 thinking 的合并**只有这一处** (T-16 / 架构 §2.5.3)。
  //   · 服务端给了权威计数 ⇒ 服务端给的 phases 已是合并形态 ⇒ **原样**渲染;
  //   · 服务端没给 (老服务端 v1 raw) ⇒ 走**兼容分支**合并 (⚠️ 待下线 R5)。
  const authoritative = toolCallCount != null || thinkingCount != null;
  // ⚠️ 适配点: 宿主的 `ExecutionPhase.event` 是 `Record<string, unknown>`,
  //   而 sse/ 那一套是自包含的 `SseToolEvent` (可整目录抄走) ⇒ 这里做一次结构转换。
  // ★ [T-156] 折叠态下 `renderPhases`（v1 兼容分支会把相邻 thinking 的 text 拼起来）
  //   是纯字符串活 —— 列表 re-render（SSE 每帧都来）时不该为**没展开**的时间线重算。
  //   useMemo 按 phases 引用缓存 ⇒ 折叠态只在 phases 真变了才算一次。
  // ★ [T-175] **折叠态不参与 phases 引用** ——
  //   流式期间 `phases` 每帧换新引用 ⇒ 旧的 useMemo 每帧都失效 ⇒ 每帧重算
  //   `renderPhases`（几十 KB thinking 文本的字符串拼接）⇒ 长会话里白烧 CPU。
  //   ⇒ 折叠态只要**计数**（服务端给的权威值优先），明细等展开时再算。
  const rendered = useMemo(
    () => renderPhases((phases ?? []) as unknown as SsePhase[], { authoritative }),
    // 折叠态不订阅 phases 引用变化；展开态才需要明细跟着变。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expanded ? phases : null, authoritative],
  );

  // ★ [T-175] 折叠态的计数走**轻量路径** ——
  //   `rendered` 在折叠态是空数组（明细等展开再算）⇒ 不能拿它算 fallback 计数，
  //   否则折叠态会显示「0 次」。改用只数 type 的轻量函数（不碰 thinking 文本）。
  const safePhases = phases ?? [];
  const fallback = useMemo(
    () => (expanded ? fallbackCount(rendered) : lightweightCount(safePhases)),
    [expanded, rendered, safePhases],
  );
  const thinking = thinkingCount ?? fallback.thinking;
  const tool = toolCallCount ?? fallback.tool;
  const summary =
    thinking > 0 || tool > 0
      ? `思考 ${thinking} 次 · 工具 ${tool} 次`
      : `${expanded ? rendered.length : safePhases.length} 个步骤`;

  /**
   * ★ [T-175] 点 header ⇒ 展开/收起；**展开时**先触发 `onExpand`（按需拉明细）。
   *
   * ⚠️ 只有「展开」才拉（收起不需要）⇒ 不会反复请求。
   * ⚠️ 父组件负责去重/缓存（同一消息只拉一次）。
   */
  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && onExpand) onExpand();
  };

  return (
    <div
      className={[
        "mt-2 rounded-md border border-border/60 bg-bg-sunken/40",
        "text-xs text-fg-muted overflow-hidden",
      ].join(" ")}
      // 给端到端冒烟测试一个稳定 hook
      data-testid="execution-timeline"
    >
      {/* Header — 始终可点, 控制 expanded */}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="w-full px-2.5 py-1.5 flex items-center gap-1.5 hover:bg-bg-sunken transition-colors text-left"
      >
        {expanded ? (
          <ChevronDownIcon className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <ChevronRightIcon className="w-3.5 h-3.5 shrink-0" />
        )}
        <BrainIcon className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium">{summary}</span>
        {/* ★ [T-175] 明细在拉 ⇒ header 上给个提示（别让用户以为点了没反应）。 */}
        {loading ? <span className="opacity-70">（加载中…）</span> : null}
      </button>

      {/* 展开后列出每条 phase (★ 用合并后的 rendered —— 不是原始 phases)
          ★ [T-156] 整段只在 expanded=true 时挂载 —— 折叠态不创建几百个 DOM 节点，
            也不让隐藏的思考正文参与布局/重排（长会话里每条消息都带几 KB thinking）。
          ★ [T-175] 明细还没拉到（loading）⇒ 先给个占位，别渲染空的折叠区。 */}
      {expanded && loading ? (
        <div className="border-t border-border/60 px-2.5 py-1.5 text-xs opacity-70">
          正在加载思考与工具明细…
        </div>
      ) : expanded ? (
        <div className="border-t border-border/60 divide-y divide-border/40">
          {rendered.map((p, idx) => {
            if (p.type === "thinking") {
              const isOpen = openThinkingIdx === idx;
              const preview = (p.text ?? "").trim();
              const oneLine =
                preview.length > 80 ? preview.slice(0, 80) + "…" : preview;
              return (
                <div key={`p-${idx}`} className="px-2.5 py-1.5">
                  <button
                    type="button"
                    onClick={() => setOpenThinkingIdx(isOpen ? null : idx)}
                    aria-expanded={isOpen}
                    className="w-full flex items-start gap-1.5 text-left hover:opacity-80"
                  >
                    <BrainIcon className="w-3 h-3 mt-0.5 shrink-0 opacity-70" />
                    <span className="flex-1 min-w-0">
                      {isOpen ? (
                        <span className="font-medium">思考 #{idx + 1}</span>
                      ) : (
                        <span className="line-clamp-1">
                          <span className="font-medium">思考 #{idx + 1}</span>
                          {oneLine ? (
                            <span className="opacity-70"> · {oneLine}</span>
                          ) : null}
                        </span>
                      )}
                    </span>
                  </button>
                  {isOpen && preview ? (
                    <pre className="mt-1.5 ml-4 p-2 rounded bg-bg-base border border-border/40 text-[11px] whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
                      {preview}
                    </pre>
                  ) : null}
                </div>
              );
            }
            // ── tool phase ────────────────────────────────────────────
            // ★ [批 G9 · 2026-11-04] tool phase 渲染成**完整卡片** (安卓同款:
            //   ToolPhaseRow → RichBubbleList → ToolCallBubble) —— 参数 / 耗时
            //   都看得见, 而不是一行摘要。跟思考段按到达顺序交错。
            const raw = p.event;
            if (!raw || typeof raw !== "object") return null;
            // 过归一层: 死类型 / 未知类型跳过 (不渲染 JSON 字面)
            const norm = normalizeRichEvent(raw);
            if (!norm.event) return null;
            return (
              <div key={`p-${idx}`} className="px-2.5 py-1">
                <RichEventBubble event={norm.event} />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
