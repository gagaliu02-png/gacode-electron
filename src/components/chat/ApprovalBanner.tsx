/**
 * components/chat/ApprovalBanner.tsx — 阶段 8 ChatDetail P0 tool 审批 banner
 *
 * 视觉 1:1 对齐 web: 外层 `mx-auto max-w-3xl w-full px-4 pb-2` + 内层
 *   `rounded-xl border border-red-500/40 bg-red-500/5 shadow-lg p-3` 卡片,
 *   标题行 / 工具列表 (带风险等级 badge) / detail / 4 按钮等宽 grid.
 *
 * ---------------------------------------------------------------------------
 * 2026-10-28 · 任务书 04 · 契约 §7 (L-21 / L-26 ~ L-30 / L-32a / L-32b)
 * ---------------------------------------------------------------------------
 *   本组件**只负责渲染 + 把点击抛给父组件**, 不再自己提交裁决 ——
 *   提交与「收哪几条」必须由**持有 pending 列表**的父组件决定
 *   (契约 L-32a: 批掉一条**只删那一条**, 兄弟 pending 必须并存;
 *    契约 L-26 ~ L-30: 409 = 已被别的端裁决 ⇒ 收卡 + 提示, 不报错不重试)。
 *
 *   ⇒ props 从 `onClear()` (整张表清空) 改成 `onAction(action, request)`,
 *     与 web 定稿版 `gacode-web/src/components/chat/ApprovalBanner.tsx` 同款。
 *
 *   ⚠️ 审批身份 (`pendingId`) **只**来自事件的 `pending_id`
 *     (归一层 `lib/rich-events.ts` 已把 snake / camel 两个别名解析好,
 *      且⛔绝不拿 `id` 冒充 —— `id` 是 tool_use_id, 契约 L-21)。
 */

import { AlertTriangleIcon } from "../ui/Glyphs";
import type { ApprovalAction } from "../../lib/api";
// ★ `ApprovalRequest` 的**唯一定义**在 lib 里 (持久化 + 增删语义都在那儿),
//   组件只负责渲染 —— ⛔ 不在这里写第二份同型 interface。
import type { ApprovalRequest } from "../../lib/chat-pending-approvals";

export type { ApprovalRequest };

export interface ApprovalBannerProps {
  requests: ApprovalRequest[];
  /**
   * 任一按钮触发 —— 父组件负责:
   *   1) 调 `submitApprovalDecisionOutcome(sessionId, pendingId, action)`
   *      (提交体只有 `{action}`, 契约 L-22);
   *   2) 乐观收卡 —— **只删被裁决的那一条** (契约 L-32a / L-32b);
   *   3) 409 ⇒ 收卡 + 提示「已由 X 端处理」, **不报错不重试** (契约 L-29)。
   */
  onAction: (action: ApprovalAction, request: ApprovalRequest) => void;
}

// 风险等级 badge — 对齐 web ApprovalBanner.tsx:32-36
const RISK_STYLES = {
  high: { badge: "bg-red-500/20 text-red-600", label: "高风险" },
  medium: { badge: "bg-orange-500/20 text-orange-600", label: "中风险" },
  low: { badge: "bg-green-500/20 text-green-600", label: "低风险" },
} as const;

function RiskBadge({ level }: { level: ApprovalRequest["riskLevel"] }) {
  const style = RISK_STYLES[level] ?? RISK_STYLES.medium;
  return (
    <span
      className={[
        "inline-flex shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium",
        style.badge,
      ].join(" ")}
    >
      {style.label}
    </span>
  );
}

export function ApprovalBanner({ requests, onAction }: ApprovalBannerProps) {
  if (!requests || requests.length === 0) return null;

  return (
    <div
      role="region"
      aria-label="待审批工具调用"
      className="mx-auto max-w-3xl w-full px-4 pb-2"
      data-testid="approval-banner"
    >
      <div className="rounded-xl border border-red-500/40 bg-red-500/5 shadow-lg p-3">
        {/* 标题行 — 对齐 web ApprovalBanner.tsx:69-75 */}
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangleIcon className="w-5 h-5 text-red-500 shrink-0" />
          <span className="text-sm font-semibold text-red-600">
            {requests.length > 1 ? `待审批 (${requests.length})` : "待审批"}
          </span>
          <span className="text-xs text-fg-muted">工具调用需要你确认</span>
        </div>

        {/* 工具列表 (紧凑 1 行 / approval, 对齐 web ApprovalBanner.tsx:78-97) */}
        <div className="space-y-1">
          {requests.map((req) => {
            // 标题去掉 tool name 前缀, 避免重复显示
            const trimmedTitle = (req.title || "")
              .replace(new RegExp(`^${req.tool}\\s+`), "")
              .trim();
            return (
              <div key={req.id} className="flex items-center gap-2 text-sm">
                <span className="text-red-500 w-3 shrink-0 text-center">•</span>
                <span className="font-medium w-[86px] truncate shrink-0">
                  {req.tool}
                </span>
                <span className="flex-1 truncate text-fg-muted text-xs">
                  {trimmedTitle || req.tool}
                </span>
                <RiskBadge level={req.riskLevel} />
              </div>
            );
          })}
        </div>

        {/* 第一条 detail — 折叠 hint (对齐 web ApprovalBanner.tsx:100-106, 截断 180 字) */}
        {requests[0]?.detail ? (
          <div className="mt-2 px-2 py-1 rounded bg-bg-elevated/60 text-xs text-fg-muted line-clamp-3">
            {requests[0].detail.length > 180
              ? `${requests[0].detail.slice(0, 180)}…`
              : requests[0].detail}
          </div>
        ) : null}

        {/* 4 按钮横排等宽 — 对齐 web ApprovalBanner.tsx:109.
            决策只作用于列表里第一条 approval (requests[0]) —— 但**只删那一条**,
            兄弟 pending 继续留在列表里 (契约 L-32a / L-32b)。 */}
        <div className="grid grid-cols-4 gap-1.5 mt-3">
          <button
            type="button"
            onClick={() => onAction("deny", requests[0])}
            className="flex-1 min-w-[80px] h-8 rounded-md px-3 text-xs border border-red-500/60 text-red-600 hover:bg-red-500/10 transition-colors duration-150"
            data-testid="approval-deny"
          >
            拒绝
          </button>
          <button
            type="button"
            onClick={() => onAction("once", requests[0])}
            className="flex-1 min-w-[80px] h-8 rounded-md px-3 text-xs bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 transition-colors duration-150"
            data-testid="approval-once"
          >
            同意一次
          </button>
          <button
            type="button"
            onClick={() => onAction("session", requests[0])}
            className="flex-1 min-w-[80px] h-8 rounded-md px-3 text-xs bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 transition-colors duration-150"
            data-testid="approval-session"
          >
            本次会话
          </button>
          <button
            type="button"
            onClick={() => onAction("always", requests[0])}
            className="flex-1 min-w-[80px] h-8 rounded-md px-3 text-xs bg-brand text-brand-on shadow hover:bg-brand/90 transition-colors duration-150"
            data-testid="approval-always"
          >
            永久
          </button>
        </div>
      </div>
    </div>
  );
}
