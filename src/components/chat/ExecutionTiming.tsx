/**
 * components/chat/ExecutionTiming.tsx — chat-id-20 助手气泡底部「已执行 X 秒」
 *
 * 视觉: 助手气泡底部一行小字, 走 fg-muted + tabular-nums. 数值 < 1s 走「< 1 秒」,
 * 否则按秒 / 分:秒 折. 流式中: 用计时器每秒更新 (实时).
 * 完成后: 切换为总耗时 (一次性显示).
 *
 * 父组件 (AssistantBubble / ChatDetail) 传 `runningSince?: number` (流式开始
 * 时间戳, ms) 与 `completedMs?: number` (终态耗时). 优先用 completedMs.
 *
 * 默认不挂 (ChatDetail 0.7.3 没做; 0.7.5 起在 AssistantBubble 末尾挂).
 */
import { useEffect, useState } from "react";

export interface ExecutionTimingProps {
  /** 流式开始 timestamp (Date.now() 风格 ms). 流式时挂上. */
  runningSince?: number | null;
  /** 完成耗时 ms. 流式结束后父组件计算并传入. */
  completedMs?: number | null;
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return "< 1 秒";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} 秒`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return `${min}:${String(s).padStart(2, "0")}`;
}

export function ExecutionTiming({
  runningSince,
  completedMs,
}: ExecutionTimingProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (runningSince == null) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, [runningSince]);

  // 流式中
  if (runningSince != null && (completedMs === undefined || completedMs === null)) {
    const ms = Date.now() - runningSince;
    return (
      <p
        className="mt-1 text-[11px] text-fg-subtle tabular-nums"
        data-testid="execution-timing"
      >
        已执行 {formatMs(ms)}
        {/* tick 引用一下, 避免 lint 误删 */}
        {void tick}
      </p>
    );
  }

  // 完成态
  if (completedMs != null) {
    return (
      <p
        className="mt-1 text-[11px] text-fg-subtle tabular-nums"
        data-testid="execution-timing"
      >
        用时 {formatMs(completedMs)}
      </p>
    );
  }

  return null;
}