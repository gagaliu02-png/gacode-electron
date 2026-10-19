/**
 * components/notifications/InfiniteScrollList.tsx — 通知分页无限滚动容器
 * (gacode-electron 0.7.5 P2 notifications-5)
 *
 * server 端 take=50 hard cap, 客户端 cursor 模式:
 *   - page=1 → server 返 notifications + nextCursor (50 条封顶)
 *   - user 滚到底 → 调 fetchMore(nextCursor) 拉下一批
 *   - 累加到 accumulated array 渲染
 *
 * IntersectionObserver 监听底部 sentinel; reached + !hasMore + !isLoading
 * 时 fetchMore. 简化版不引 react-window / react-virtual, 通知条数一般 < 500.
 */

import { useEffect, useRef, type ReactNode } from "react";

export interface InfiniteScrollListProps {
  children: ReactNode;
  /** 拉下一批 (cursor 由 parent 持有) */
  onLoadMore: () => void;
  /** 是否有更多 */
  hasMore: boolean;
  /** 是否正在拉 */
  isLoading: boolean;
  /** 拉完所有时显示占位 (默认 "没有更多了") */
  endMessage?: string;
}

export function InfiniteScrollList({
  children,
  onLoadMore,
  hasMore,
  isLoading,
  endMessage = "没有更多了",
}: InfiniteScrollListProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting && hasMore && !isLoading) {
          onLoadMore();
        }
      },
      { rootMargin: "120px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore, isLoading]);

  return (
    <>
      {children}
      <div
        ref={sentinelRef}
        className="h-8 flex items-center justify-center text-xs text-fg-subtle py-4"
        aria-hidden={!hasMore}
      >
        {isLoading ? (
          <span className="inline-flex items-center gap-2">
            <SpinnerDot />
            加载更多...
          </span>
        ) : hasMore ? null : (
          <span>{endMessage}</span>
        )}
      </div>
    </>
  );
}

function SpinnerDot() {
  return (
    <span
      className="inline-block w-3 h-3 rounded-full border-2 border-brand border-t-transparent animate-spin"
      aria-hidden="true"
    />
  );
}