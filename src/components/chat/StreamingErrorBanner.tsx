/**
 * components/chat/StreamingErrorBanner.tsx — 阶段 2 流式错误占位
 *
 * 区别对待两种错误:
 *   - network / 5xx / SSE 协议错 → 红色 banner 显示, 提供"重试"按钮
 *   - user abort → 不显示 banner (用户主动)
 *
 * 仅展示 + 重试入口, 错误分类在 ChatDetail 父组件里完成.
 *
 * 视觉 1:1 对齐 web `src/components/chat/StreamingErrorBanner.tsx`:
 *   - 外层 `mx-auto max-w-3xl w-full px-4 pb-2` + 内层卡片
 *   - AlertCircle 图标 / 描边"重试"小按钮 / X 图标关闭按钮
 *   - 文案格式 `网络异常,生成中断: {raw}`
 */

import { AlertCircleIcon, CloseIcon, RotateCwIcon } from "../ui/Glyphs";

export type StreamingErrorKind = "network" | "sse" | "server" | "unknown";

interface Props {
  kind: StreamingErrorKind;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function StreamingErrorBanner({ kind, message, onRetry, onDismiss }: Props) {
  const description = describeStreamingError(kind, message);

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="streaming-error-banner"
      className="mx-auto max-w-3xl w-full px-4 pb-2"
    >
      <div className="flex items-center gap-2 rounded-lg border px-3 py-2 border-destructive/50 bg-destructive/10 text-sm text-destructive">
        <AlertCircleIcon />
        <span className="flex-1 min-w-0 break-words" title={description}>
          {description}
        </span>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            data-testid="streaming-error-retry"
            className="shrink-0 inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-background px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors focus:outline-none focus:ring-1 focus:ring-destructive/40"
          >
            <RotateCwIcon className="w-3 h-3" />
            <span>重试</span>
          </button>
        ) : null}
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="关闭错误提示"
            data-testid="streaming-error-dismiss"
            className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded text-destructive/70 hover:text-destructive hover:bg-destructive/10 focus:outline-none focus:ring-1 focus:ring-destructive/40"
          >
            <CloseIcon size={14} className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** 跟 gacode-web/StreamingErrorBanner.tsx 行为一致: kind + raw → 一句话文案 */
export function describeStreamingError(
  kind: StreamingErrorKind,
  raw = "",
): string {
  switch (kind) {
    case "network":
      return `网络异常,生成中断: ${raw}`;
    case "sse":
      return `连接被截断,生成中断: ${raw}`;
    case "server":
      return `服务器错误,生成中断: ${raw}`;
    default:
      return `生成失败: ${raw}`;
  }
}

export function classifyStreamingError(err: unknown): StreamingErrorKind {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes("failed to fetch") || lower.includes("network") || lower.includes("networkerror")) {
    return "network";
  }
  if (lower.includes("sse")) return "sse";
  if (/http\s+5\d\d/i.test(msg)) return "server";
  return "unknown";
}
