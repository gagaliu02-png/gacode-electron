/**
 * components/chat/QueueBar.tsx —— **会话队列条**（契约 订正 28 · W5 · PC 端）
 *
 * ## 这一条回答用户的一个问题
 *
 *   「我刚才那句话，到底发出去了没有？」
 *
 * 轮次在跑的时候用户点「发送」⇒ 消息**进队列**（不打断、不立即发）
 * ⇒ 用户看不见「它去哪了」⇒ 所以要**摆出来**：条数 + 每条正文 + 一个「立刻插队」的入口。
 *
 * ## 形态（★ gaga 2026-11-14 截图 · §3.9）
 *
 * ```
 *   ┌──────────────────────────────────────────────┐
 *   │  N 条排队中 ⌄                            ⏫   │   ← 队列条
 *   └──────────────────────────────────────────────┘
 *     · 排队项正文预览（展开时显示在队列条下方）
 *     · 排队项正文预览
 * ```
 *
 *   · 左边「**N 条排队中 ⌄**」= 队列指示 + **展开**（列出每条排队消息的正文）；
 *   · 右边「**⏫**」= **立即发送** = 插队投递（服务端标 `injectable` ⇒
 *     agent 在**下一个工具边界**就并入当前这一轮 ⇒ **不打断**当前轮）；
 *   · 每条排队消息**自己也带一个 ⏫**（「把**那条**插队」）—— 队列条上的 ⏫
 *     默认作用于**队首**那条（服务端排序 = priority desc, seq asc）。
 *
 * ⚠️ 本组件**只渲染 + 把点击抛给父组件** —— 队列数据、插队请求都在 ChatDetail。
 * ⚠️ 队列是**服务端**的东西（跨端共享：手机上排的队 PC 看得见）⇒ 本组件
 *   不做任何本地缓存意义上的「真相」。
 */

import { ChevronDownIcon } from "../ui/Glyphs";

/** 队列里的一条（服务端行 + 端侧的乐观行，统一成这个形状）。 */
export interface QueueEntry {
  /** 服务端收件箱行 id；端侧乐观行用 `local:<n>`。 */
  id: string;
  /** 正文预览。 */
  content: string;
  /** 投递时刻（ISO；端侧乐观行没有 ⇒ null）。 */
  createdAt: string | null;
  /**
   * ★ 服务端已标「可注入」吗？
   * · `false` ⇒ 纯队列项（等轮次自然结束才出队）；
   * · `true`  ⇒ 已插队（下一个工具边界就并入当前轮）。
   */
  injectable: boolean;
  /**
   * 端侧乐观行（还没被服务端确认）。
   * · `sending`     ⇒ 刚发出、服务端还没回话；
   * · `unconfirmed` ⇒ 服务端一直没确认（多半是没排上）⇒ 标灰 + 允许删掉。
   */
  local?: "sending" | "unconfirmed" | null;
}

export interface QueueBarProps {
  /** 队列条目（服务端行在前，端侧乐观行在后）。 */
  items: QueueEntry[];
  /** 展开状态（父组件持有 ⇒ 收起时也不该丢）。 */
  expanded: boolean;
  /** 点「N 条排队中 ⌄」⇒ 展开/收起。 */
  onToggle: () => void;
  /** 点「⏫」⇒ **立即发送**这一条（插队）。 */
  onFlush: (id: string) => void;
  /** 删掉一条**没送达**的端侧乐观行（服务端行不许删 —— 那是服务端的东西）。 */
  onRemove?: (id: string) => void;
  /** 正在插队的那一条（防重复点）。 */
  flushingId?: string | null;
}

/** 正文预览 —— 单行 + 超长截断（完整内容在展开区里给）。 */
function preview(content: string, max = 120): string {
  const s = (content || "").replace(/\s+/g, " ").trim();
  if (!s) return "（空消息）";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/** 「⏫」按钮 —— 深色圆形（立即发送 = 插队）。 */
function FlushButton({
  id,
  label,
  disabled,
  onFlush,
}: {
  id: string;
  label: string;
  disabled?: boolean;
  onFlush: (id: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={`queue-flush-${id}`}
      disabled={disabled}
      onClick={() => onFlush(id)}
      className={[
        "shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-full",
        "bg-fg/15 text-fg hover:bg-fg/25 transition-colors duration-150",
        "disabled:opacity-40 disabled:cursor-not-allowed",
      ].join(" ")}
    >
      <span aria-hidden="true" className="text-[13px] leading-none">
        ⏫
      </span>
    </button>
  );
}

export function QueueBar({
  items,
  expanded,
  onToggle,
  onFlush,
  onRemove,
  flushingId,
}: QueueBarProps) {
  if (!items || items.length === 0) return null;

  const head = items[0];
  const canFlushHead = !head.local;

  return (
    <div
      className="mx-auto max-w-3xl w-full px-4 pb-2"
      data-testid="queue-bar"
    >
      {/* 队列条本体 */}
      <div className="flex items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-1.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={expanded ? "收起排队消息" : "展开排队消息"}
          data-testid="queue-toggle"
          className="flex items-center gap-1 text-xs text-fg-muted hover:text-fg transition-colors duration-150"
        >
          <span data-testid="queue-count">{items.length} 条排队中</span>
          <ChevronDownIcon
            className={[
              "transition-transform duration-150",
              expanded ? "rotate-180" : "",
            ].join(" ")}
          />
        </button>

        <div className="ml-auto flex items-center gap-2">
          {/* 队首那条的正文（一行预览，展开前也能看见是什么）。 */}
          <span className="hidden sm:inline max-w-[280px] truncate text-xs text-fg-subtle">
            {preview(head.content)}
          </span>
          <FlushButton
            id={head.id}
            label="立即发送（插队）"
            disabled={!canFlushHead || flushingId === head.id}
            onFlush={onFlush}
          />
        </div>
      </div>

      {/* 展开区 —— 每条排队消息的正文预览（截图里是「不对我说的50位」那种） */}
      {expanded ? (
        <div className="mt-1.5 space-y-1" data-testid="queue-items">
          {items.map((it) => (
            <div
              key={it.id}
              data-testid="queue-item"
              data-queue-id={it.id}
              className={[
                "flex items-center gap-2 rounded-md border border-border/60 bg-bg-elevated/60 px-3 py-1.5",
                it.local === "unconfirmed" ? "opacity-60" : "",
              ].join(" ")}
            >
              <span className="text-[10px] text-fg-subtle shrink-0">
                {it.injectable ? "已插队" : it.local === "unconfirmed" ? "未送达" : "排队中"}
              </span>
              <span
                className="flex-1 min-w-0 text-xs text-fg truncate"
                title={it.content || ""}
              >
                {preview(it.content, 200)}
              </span>
              {it.local && onRemove ? (
                <button
                  type="button"
                  aria-label="删掉这条没送达的消息"
                  title="删掉这条没送达的消息"
                  onClick={() => onRemove(it.id)}
                  className="shrink-0 text-[10px] text-fg-subtle hover:text-danger transition-colors duration-150"
                >
                  删掉
                </button>
              ) : null}
              <FlushButton
                id={it.id}
                label="立即发送这一条（插队）"
                disabled={!!it.local || flushingId === it.id}
                onFlush={onFlush}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
