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
 * 数据契约 (ApprovalRequest): 跟 api.ts submitApprovalDecision / sse.ts 解析
 * 出来的 approval_request rich_events 形状一致. ChatDetail 在 onChunk 里识别
 * type='approval_request' 累加进 store, type='approval_granted'/'approval_denied'
 * 清空 (first-wins 行为, 跟 web api.ts:643-646 + yinian-android 同款).
 */

import { useState } from "react";
import { submitApprovalDecision, type ApprovalAction } from "../../lib/api";

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

  // 取最高风险等级作为 banner 颜色基调
  const topRisk = requests.reduce<"high" | "medium" | "low">(
    (acc, r) => (rank(r.riskLevel) > rank(acc) ? r.riskLevel : acc),
    "low",
  );

  return (
    <div
      role="alert"
      aria-live="polite"
      className={[
        "shrink-0 mx-3 mb-2 rounded-md border bg-bg-elevated shadow-dialog",
        "p-3 space-y-2",
        topRisk === "high"
          ? "border-danger/50"
          : topRisk === "medium"
            ? "border-warning/50"
            : "border-border",
      ].join(" ")}
      data-testid="approval-banner"
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={[
            "inline-block w-2 h-2 rounded-full",
            topRisk === "high"
              ? "bg-danger"
              : topRisk === "medium"
                ? "bg-warning"
                : "bg-success",
          ].join(" ")}
        />
        <p className="text-sm font-medium">
          {requests.length === 1
            ? "工具需要你的授权"
            : `${requests.length} 个工具正在等待你的授权`}
        </p>
      </div>

      {/* 工具列表 — 每条 tool name + 标题, 紧凑 1 行 */}
      <ul className="space-y-1 text-xs">
        {requests.map((req) => (
          <li key={req.id} className="flex items-center gap-2">
            <span className="font-mono text-fg truncate">{req.tool}</span>
            <span className="text-fg-muted truncate flex-1">{req.title}</span>
          </li>
        ))}
      </ul>

      {/* 第一条 detail — 折叠 hint (跟 web ApprovalBanner.tsx:99-109 同款) */}
      {requests[0]?.detail ? (
        <pre className="font-mono text-[11px] text-fg-muted whitespace-pre-wrap break-words leading-relaxed bg-bg-sunken/40 rounded px-2 py-1.5 max-h-24 overflow-y-auto">
          {requests[0].detail.length > 600
            ? requests[0].detail.slice(0, 600) + "…"
            : requests[0].detail}
        </pre>
      ) : null}

      {/* 4 个决策按钮 — 顺序对齐 Android ApprovalBanner.kt */}
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 pt-1">
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void handleAction("deny", requests[0])}
          className="flex-1 min-w-[80px] h-9 rounded-md border border-danger/60 bg-danger-soft/40 text-danger text-sm hover:bg-danger-soft/70 active:opacity-80 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
          data-testid="approval-deny"
        >
          拒绝
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void handleAction("once", requests[0])}
          className="flex-1 min-w-[80px] h-9 rounded-md bg-bg-sunken text-fg text-sm hover:bg-bg-sunken/70 active:opacity-80 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
          data-testid="approval-once"
        >
          同意一次
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void handleAction("session", requests[0])}
          className="flex-1 min-w-[80px] h-9 rounded-md bg-bg-sunken text-fg text-sm hover:bg-bg-sunken/70 active:opacity-80 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
          data-testid="approval-session"
        >
          本次会话
        </button>
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void handleAction("always", requests[0])}
          className="flex-1 min-w-[80px] h-9 rounded-md bg-brand text-brand-on text-sm hover:bg-brand-hover active:bg-brand-active transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
          data-testid="approval-always"
        >
          永久允许
        </button>
      </div>

      {/* 注: 只对列表里第一条 approval 调决策 (跟 web ApprovalBanner.tsx + Android
           同款). gaclaw 收到后会 cancel 整个 batch 的 _waiters, 所以"任一按钮
           触发 → 整批清空"语义在 server 侧保证. */}
      {requests.length > 1 ? (
        <p className="text-[11px] text-fg-subtle pt-0.5">
          多个工具共用同一个决策 (任选其一即可)
        </p>
      ) : null}
    </div>
  );
}

function rank(r: "high" | "medium" | "low"): number {
  if (r === "high") return 2;
  if (r === "medium") return 1;
  return 0;
}
