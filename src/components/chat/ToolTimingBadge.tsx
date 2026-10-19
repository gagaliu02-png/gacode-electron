/**
 * components/chat/ToolTimingBadge.tsx — chat-id-11 工具调用耗时计时
 *
 * 视觉: Clock 图标 + 「1.2 秒」 / 「480 毫秒」 折秒数 (>= 1s 走 1 位小数秒,
 * 否则走毫秒). 跟 web MessageBubble 同款 (ToolTimingBadge.tsx 1:1 移植, 自写).
 *
 * 父组件 (RichEventBubble / CallTreeCard) 拿到 server 给的 tool_event 的
 * durationMs / started_at 算出 elapsedMs 后挂. 缺省 duration 时不渲染.
 */

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
      <ClockIcon />
      {compact ? null : <span>{text}</span>}
    </span>
  );
}

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15 14" />
    </svg>
  );
}