/**
 * components/chat/BackgroundWorkBanner.tsx —— **「等待后台任务完成…」横幅**（契约 订正 28 · W5 · PC 端）
 *
 * ## 这一条解决什么
 *
 * §3.7 的按钮状态机有个**交互缺口**（gaga 2026-11-14 原话）：
 *
 *   「输入框有字时按钮变『发送』⇒ 没有『停止』入口 ⇒ 后台活怎么停？」
 *
 * ⇒ 给了**两条路**：① 清空输入框 ⇒ 按钮变回「停止」；② **本横幅上单独一个
 *   「停止后台任务」入口** —— 就是这条。
 *
 * ## 为什么是**会话级横幅**而不是轮次相位
 *
 * §3.10 拍板：「等待后台任务完成…」是**会话级**的（依据 = 会话有未完成工作单元），
 * **不是**轮次相位 ⇒ 轮次该结束就结束（不锁会话 ⇒ 沿用 L-27k）。
 * ⇒ 本横幅**不**影响轮次状态机，**不**改 `isStreaming` 的判据。
 *
 * ⚠️ 本组件**只渲染 + 把点击抛给父组件** —— 「停哪些活」由父组件决定
 *   （作用域 = **本会话的一切**：本机的作业 + 服务端 `pending-work` 报的）。
 */

import { useNavigate } from "react-router-dom";
import { LoaderCircleIcon, StopSquareIcon } from "../ui/Glyphs";

export interface BackgroundWorkBannerProps {
  /** 本会话还有几个后台工作单元没跑完。 */
  count: number;
  /** 一句话说明（默认「等待后台任务完成…」）。 */
  text?: string;
  /** 点「停止后台任务」⇒ 停**本会话的一切**后台活。 */
  onStop: () => void;
  /** 正在停（防重复点）。 */
  stopping?: boolean;
  /** 能不能停（没有后台活时不该出现这个按钮）。 */
  canStop?: boolean;
}

export function BackgroundWorkBanner({
  count,
  text,
  onStop,
  stopping,
  canStop = true,
}: BackgroundWorkBannerProps) {
  const navigate = useNavigate();
  if (!count || count <= 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="background-work-banner"
      className="mx-auto max-w-3xl w-full px-4 pb-2"
    >
      <div className="flex items-center gap-2 rounded-md border border-brand/30 bg-brand/5 px-3 py-1.5">
        <LoaderCircleIcon className="w-3.5 h-3.5 text-brand shrink-0 animate-spin" />
        <span className="text-xs text-fg" data-testid="background-work-text">
          {text ?? "等待后台任务完成…"}
          {count > 1 ? `（${count} 个）` : ""}
        </span>

        {/* 「我的电脑」入口 —— 作业列表在那里（§3.9）。 */}
        <button
          type="button"
          onClick={() => navigate("/my-computer")}
          className="ml-auto shrink-0 text-[11px] text-fg-muted hover:text-brand transition-colors duration-150"
        >
          查看作业
        </button>

        {canStop ? (
          <button
            type="button"
            onClick={onStop}
            disabled={stopping}
            data-testid="background-work-stop"
            aria-label="停止后台任务"
            title="停止本会话的所有后台任务"
            className="shrink-0 inline-flex items-center gap-1 text-[11px] text-fg-muted hover:text-danger transition-colors duration-150 disabled:opacity-40"
          >
            <StopSquareIcon className="w-3 h-3" />
            停止后台任务
          </button>
        ) : null}
      </div>
    </div>
  );
}
