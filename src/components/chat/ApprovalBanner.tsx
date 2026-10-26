/**
 * components/chat/ApprovalBanner.tsx — 阶段 8 ChatDetail P0 tool 审批 banner
 *
 * 行为对位 gacode-web `src/components/chat/ApprovalBanner.tsx`:
 *   - 一次 batch 多条 pending approval 同时显示 (server 端 SSE 推送
 *     chunk.events 里 type='approval_request' 累加, 同 id 去重)
 *   - 任一按钮触发 → onAction(action, pendingId) → parent 调
 *     submitApprovalDecision(sessionId, pendingId, action) + 清空 store
 *   - 4 个动作按钮 (跟 Android 端 ApprovalBanner.kt 对齐):
 *     deny / once / session / always
 *   - sticky 在消息列表底部 + ChatInputBar 上方 (Web 是这样; Electron 这边
 *     把它放在 ChatInput 之上, 不挤压消息列表滚动区)
 *
 * 视觉 1:1 对齐 web: 外层 `mx-auto max-w-3xl w-full px-4 pb-2` + 内层
 *   `rounded-xl border border-red-500/40 bg-red-500/5 shadow-lg p-3` 卡片,
 *   标题行 / 工具列表 (带风险等级 badge) / detail / 4 按钮等宽 grid.
 *
 * 数据契约 (ApprovalRequest): 跟 api.ts submitApprovalDecision / sse.ts 解析
 * 出来的 approval_request rich_events 形状一致. ChatDetail 在 onChunk 里识别
 * type='approval_request' 累加进 store, type='approval_granted'/'approval_denied'
 * 清空 (first-wins 行为, 跟 web api.ts:643-646 + yinian-android 同款).
 */

import { useState } from "react";
import { submitApprovalDecision, type ApprovalAction } from "../../lib/api";
import { AlertTriangleIcon } from "../ui/Glyphs";

export interface ApprovalRequest {
  /** local key — store 内去重 (同 server-pendingId 不重复 push) */
  id: string;
  /** server 端 pendingId — POST 时拼 URL (routing 后端到 gaclaw) */
  pendingId: string;
  tool: string;
  title: string;
  detail?: string;
  riskLevel: "high" | "medium" | "low";
}

export interface ApprovalBannerProps {
  requests: ApprovalRequest[];
  sessionId: string;
  /** 触发时清空 parent 端 pendingApprovals 列表 (整张 banner 立刻消失) */
  onClear: () => void;
  onError?: (msg: string) => void;
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

export function ApprovalBanner({
  requests,
  sessionId,
  onClear,
  onError,
}: ApprovalBannerProps) {
  const [busy, setBusy] = useState<string | null>(null);

  if (!requests || requests.length === 0) return null;

  const handleAction = async (action: ApprovalAction, req: ApprovalRequest) => {
    if (busy) return; // 防按钮狂点
    setBusy(req.pendingId);
    try {
      await submitApprovalDecision(sessionId, req.pendingId, action);
      // 成功 → 清整张 banner. server 透传到 gaclaw 后异步 resolve 该
      // approval, AI 再开下一 turn, banner 不再出现.
      onClear();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.warn(
        `[approval-banner] decision failed (pendingId=${req.pendingId}, action=${action}):`,
        msg,
      );
      onError?.(msg);
      // 失败也别无限卡在 banner 上 — 清掉让用户重发, server 端会通过
      // cancel TTL 自行清理 (unified-api cancelRegistry.js).
      onClear();
    } finally {
      setBusy(null);
    }
  };

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

        {/* 4 按钮横排等宽 — 对齐 web ApprovalBanner.tsx:109 */}
        <div className="grid grid-cols-4 gap-1.5 mt-3">
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void handleAction("deny", requests[0])}
            className="flex-1 min-w-[80px] h-8 rounded-md px-3 text-xs border border-red-500/60 text-red-600 hover:bg-red-500/10 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
            data-testid="approval-deny"
          >
            拒绝
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void handleAction("once", requests[0])}
            className="flex-1 min-w-[80px] h-8 rounded-md px-3 text-xs bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
            data-testid="approval-once"
          >
            同意一次
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void handleAction("session", requests[0])}
            className="flex-1 min-w-[80px] h-8 rounded-md px-3 text-xs bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
            data-testid="approval-session"
          >
            本次会话
          </button>
          <button
            type="button"
            disabled={!!busy}
            onClick={() => void handleAction("always", requests[0])}
            className="flex-1 min-w-[80px] h-8 rounded-md px-3 text-xs bg-brand text-brand-on shadow hover:bg-brand/90 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
            data-testid="approval-always"
          >
            永久
          </button>
        </div>

        {/* 注: 只对列表里第一条 approval 调决策 (跟 web ApprovalBanner + Android
             同款). gaclaw 收到后会 cancel 整个 batch 的 _waiters, 所以"任一按钮
             触发 → 整批清空"语义在 server 侧保证. */}
        {requests.length > 1 ? (
          <p className="text-[11px] text-fg-subtle pt-0.5">
            多个工具共用同一个决策 (任选其一即可)
          </p>
        ) : null}
      </div>
    </div>
  );
}
