/**
 * components/chat/DeliverableStrip.tsx — chat-id-29 Session 内交付物缩略
 *
 * 视觉: 横向滚动缩略条 (image / web / document 三个 tab 不区分, 仅按类型
 * 给不同 icon + 首图 / 标题). 点 thumbnail → onJumpTo(deliverable.id) 跳
 * /deliveries/:id (跟 web DeliverableStrip 同款, 但 electron 走 react-router).
 *
 * 数据来源: parent (ChatDetail) 用 lib/api.listSessionDeliverables 拿
 *   DeliverableListResponse.items, 透传给本组件.
 *
 * chat-id-32: 卡片跳交付详情 — onJumpTo 调到 navigate('/deliveries/' + id).
 */

import { useNavigate } from "react-router-dom";
import type { Deliverable } from "../../lib/api";

export interface DeliverableStripProps {
  items: Deliverable[];
}

function mimeBadge(d: Deliverable): string {
  if (d.deliverableType === "image") return "🖼";
  if (d.deliverableType === "web") return "🌐";
  if (d.deliverableType === "document") return "📄";
  return "📦";
}

export function DeliverableStrip({ items }: DeliverableStripProps) {
  const navigate = useNavigate();
  if (!items || items.length === 0) return null;
  return (
    <div
      className="shrink-0 mx-3 mb-2"
      data-testid="session-deliverable-strip"
    >
      <div className="flex items-center justify-between mb-1">
        <p className="text-[11px] text-fg-muted">
          本会话交付物 ({items.length})
        </p>
        <button
          type="button"
          onClick={() => navigate("/deliveries")}
          className="text-[11px] text-brand hover:underline"
        >
          查看全部
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {items.slice(0, 10).map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => navigate(`/deliveries/${d.id}`)}
            className="shrink-0 w-20 h-20 rounded-md bg-bg-sunken border border-border hover:border-brand transition-colors duration-150 inline-flex flex-col items-center justify-center gap-1 text-fg-muted hover:text-fg"
            title={d.title || d.mimeType || d.deliverableType}
          >
            {d.thumbnailUrl ? (
              <img
                src={d.thumbnailUrl}
                alt=""
                className="w-full h-full object-cover rounded-md"
                loading="lazy"
              />
            ) : (
              <>
                <span aria-hidden="true" className="text-lg">
                  {mimeBadge(d)}
                </span>
                <span className="text-[10px] truncate max-w-[68px] px-1">
                  {d.title || d.deliverableType}
                </span>
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}