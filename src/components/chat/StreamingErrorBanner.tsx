/**
 * components/chat/StreamingErrorBanner.tsx — 阶段 2 流式错误占位
 *
 * 区别对待两种错误:
 *   - network / 5xx / SSE 协议错 → 红色 banner 显示, 提供"重试"按钮
 *   - user abort → 不显示 banner (用户主动)
 *
 * 仅展示 + 重试入口, 错误分类在 ChatDetail 父组件里完成.
 */

import { Button } from "../ui/Button";

export type StreamingErrorKind = "network" | "sse" | "server" | "unknown";

interface Props {
  kind: StreamingErrorKind;
  message: string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export function StreamingErrorBanner({ kind, message, onRetry, onDismiss }: Props) {
  const description = describeStreamingError(kind);

  return (
    <div className="border-t border-danger/40 bg-danger-soft/30 px-4 py-3 flex items-start gap-3">
      <div
        aria-hidden="true"
        className="w-5 h-5 rounded-full bg-danger text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5"
      >
        !
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{description}</p>
        <p className="text-xs text-fg-muted mt-0.5 break-words">{message}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {onRetry ? (
          <Button variant="default" size="sm" onClick={onRetry}>
            重试
          </Button>
        ) : null}
        {onDismiss ? (
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            忽略
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** 跟 gacode-web/StreamingErrorBanner.tsx 行为一致: kind → 一句话文案 */
export function describeStreamingError(kind: StreamingErrorKind): string {
  switch (kind) {
    case "network":
      return "网络异常,流式被中断";
    case "sse":
      return "SSE 协议错误,流式被中断";
    case "server":
      return "服务端错误,流式被中断";
    default:
      return "流式生成失败";
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
