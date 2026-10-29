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
 *   - tool 行: 只展示 ev.type + 摘要标题, 不重复渲染 RichEventBubble
 *
 * 图标: PC 无 lucide-react →
 *   - ChevronRight / Globe / Brain / ChevronDown / Wrench / FileText / Image
 *     全部复用 `components/ui/Glyphs.tsx` (2026-10-26 并入, A2-D4-02 收尾)
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
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  WrenchIcon,
} from "../ui/Glyphs";
// ★ 重构轮 R2-web (T-16 / T-17): 计数与合并的**口径**归到 sse/ 那一套。
//   · `renderPhases` —— 相邻 thinking 的合并**只有这一处** (主路径原样 / 兼容分支合并);
//   · `countPhases`  —— 端侧兜底计数 (服务端给了权威值时**不用**它)。
import { renderPhases, countPhases, type SsePhase } from "../../lib/sse/turn-record";

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

/** tool event 摘要 — 从事件对象里抓一组常用字段, 找第一个非空字符串 */
function summarizeToolEvent(ev: Record<string, unknown>): string {
  // 顺序: title → name → tool → url → 序列化对象
  const candidates = [
    ev.title,
    ev.name,
    ev.tool,
    typeof ev.url === "string" ? ev.url.split("/").pop() : undefined,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  // 兜底: 把对象最前面几个常见字段拼起来
  const parts: string[] = [];
  if (ev.type) parts.push(String(ev.type));
  if (ev.tool) parts.push(String(ev.tool));
  if (ev.id) parts.push(`#${String(ev.id).slice(-6)}`);
  return parts.join(" ") || "tool 调用";
}

/** tool phase 用图标 — 按 type 选 (image / file / web_preview / tool_start) */
function ToolIcon({ ev }: { ev: Record<string, unknown> }) {
  const t = ev.type as string | undefined;
  if (t === "image") return <ImageIcon className="w-3 h-3" />;
  if (t === "file") return <FileTextIcon className="w-3 h-3" />;
  if (t === "web_preview" || t === "web") {
    return <GlobeIcon className="w-3 h-3" />;
  }
  return <WrenchIcon className="w-3 h-3" />;
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
            // tool phase
            const ev = (p.event ?? {}) as Record<string, unknown>;
            return (
              <div
                key={`p-${idx}`}
                className="px-2.5 py-1.5 flex items-center gap-1.5"
              >
                <ToolIcon ev={ev} />
                <span className="font-medium">
                  {(ev.type as string) || "tool"}
                </span>
                <span
                  className="opacity-70 truncate"
                  title={summarizeToolEvent(ev)}
                >
                  {summarizeToolEvent(ev)}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
