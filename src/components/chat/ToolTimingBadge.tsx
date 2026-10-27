/**
 * components/chat/ToolTimingBadge.tsx — chat-id-11 工具调用耗时计时
 *
 * 视觉: Clock 图标 + 「1.2 秒」 / 「480 毫秒」 折秒数 (>= 1s 走 1 位小数秒,
 * 否则走毫秒). 跟 web MessageBubble 同款 (ToolTimingBadge.tsx 1:1 移植, 自写).
 *
 * 父组件 (RichEventBubble / CallTreeCard) 拿到 server 给的 tool_event 的
 * durationMs / started_at 算出 elapsedMs 后挂. 缺省 duration 时不渲染.
 */

import { ClockSmallIcon } from "../ui/Glyphs";

export interface ToolTimingBadgeProps {
  /** 工具耗时 ms, 必填 (>= 0) */
  elapsedMs: number;
  /** 折叠态 — 只显示图标, hover tooltip 显秒数 (TODO: 这里简化为一直显数字) */
  compact?: boolean;
}

function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)} 毫秒`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} 秒`;
  // >= 1min 走 mm:ss
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export function ToolTimingBadge({ elapsedMs, compact }: ToolTimingBadgeProps) {
  const text = formatElapsed(elapsedMs);
  if (!text) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] text-fg-muted tabular-nums"
      data-testid="tool-timing-badge"
      title={`耗时 ${text}`}
    >
      <ClockSmallIcon />
      {compact ? null : <span>{text}</span>}
    </span>
  );
}

// ─────────── icons (共享组件 — components/ui/Glyphs.tsx) ───────────
//   2026-10-27 收编: 本文件原本就地手写了一份 `ClockIcon` 内联 svg
//   (11×11 / sw1.7, circle r=9 + polyline `12 7 12 12 15 14`),
//   跟共享库重复实现 ⇒ 删掉本地实现, 改 import 共享组件 `ClockSmallIcon`
//   (自定义图形,非 lucide —— lucide 的 `clock` 是 r=10 + `12 6 12 12 16 14`)。