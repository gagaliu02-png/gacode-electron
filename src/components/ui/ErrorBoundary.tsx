/**
 * components/ui/ErrorBoundary.tsx — 兜底 class component (2026-10-26 · L-27)
 *
 * 1:1 对齐 web `gacode-web/src/components/ErrorBoundary.tsx`:
 *   - class component + getDerivedStateFromError + componentDidCatch
 *   - props: { children, title?, description? }
 *   - 失败态渲染: ⚠️ + 标题 + 描述 + 原始 error message + 「重试」按钮 (重置 state 重渲染)
 *
 * 用途: 任意子组件 throw 时不至于整页黑屏, 至少给用户一个可读的错误页
 * (web 的起因: 用户访问 /library 看到 "Application error: a client-side exception
 * has occurred", 整页黑屏 ⇒ 加边界 + fallback UI).
 *
 * ⚠️ PC 仓没有 lucide-react ⇒ 警示符号用 emoji (与 web 一致, web 也是 `⚠️` 字符);
 *    「重试」按钮复用共享 <Button> (PC 仓无 tailwind-merge, 自己写按钮容易与
 *    Button 的 variant 体系漂移).
 *
 * 用法:
 *   <ErrorBoundary title="知识库加载失败" description="请刷新重试,或稍后再试一次">
 *     <LibraryInner />
 *   </ErrorBoundary>
 */

import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./Button";

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** fallback 标题 — 默认通用文案 */
  title?: string;
  /** fallback 描述 — 默认通用文案 */
  description?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 打到 console, 便于排查 (web 同款)
    console.error("[ErrorBoundary] caught error:", error, info?.componentStack);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      const title = this.props.title ?? "页面出错了";
      const description =
        this.props.description ?? "请刷新重试,或稍后再试一次";
      return (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <div className="text-5xl" aria-hidden>
            ⚠️
          </div>
          <div className="text-base font-medium text-fg">{title}</div>
          <div className="text-sm text-fg-muted max-w-sm">{description}</div>
          {this.state.error?.message ? (
            <div className="text-xs text-fg-muted/70 font-mono break-all max-w-md">
              {this.state.error.message}
            </div>
          ) : null}
          <Button
            variant="default"
            size="md"
            className="mt-2"
            onClick={this.handleRetry}
          >
            重试
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
