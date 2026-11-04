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
import { useState } from "react";
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

// ════════════════════════════════════════════════════════════
// ExecutionTimeline
// ════════════════════════════════════════════════════════════

export function ExecutionTimeline({
  phases,
  defaultExpanded = false,
  toolCallCount = null,
  thinkingCount = null,
}: ExecutionTimelineProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [openThinkingIdx, setOpenThinkingIdx] = useState<number | null>(null);

  if (!phases || phases.length === 0) return null;

  // ★ 相邻 thinking 的合并**只有这一处** (T-16 / 架构 §2.5.3)。
  //   · 服务端给了权威计数 ⇒ 服务端给的 phases 已是合并形态 ⇒ **原样**渲染;
  //   · 服务端没给 (老服务端 v1 raw) ⇒ 走**兼容分支**合并 (⚠️ 待下线 R5)。
  const authoritative = toolCallCount != null || thinkingCount != null;
  // ⚠️ 适配点: 宿主的 `ExecutionPhase.event` 是 `Record<string, unknown>`,
  //   而 sse/ 那一套是自包含的 `SseToolEvent` (可整目录抄走) ⇒ 这里做一次结构转换。
  const rendered = renderPhases(phases as unknown as SsePhase[], { authoritative });

  const fallback = fallbackCount(rendered);
  const thinking = thinkingCount ?? fallback.thinking;
  const tool = toolCallCount ?? fallback.tool;
  const summary =
    thinking > 0 || tool > 0
      ? `思考 ${thinking} 次 · 工具 ${tool} 次`
      : `${rendered.length} 个步骤`;

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
        onClick={() => setExpanded((v) => !v)}
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
      </button>

      {/* 展开后列出每条 phase (★ 用合并后的 rendered —— 不是原始 phases) */}
      {expanded ? (
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
