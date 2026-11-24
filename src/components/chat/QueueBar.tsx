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
 *     默认作用于**队首**那条（服务端排序 = priority desc, seq asc）；
 *   · ★ 每条排队消息**还带一个 🗑**（「删掉**那条**」）—— 队列项**还没发出去**
 *     ⇒ 删掉它 ⇒ 它**再也不会被发出去**（泵队列跳过它、「⏫」也插不了它）。
 *
 * ⚠️ 本组件**只渲染 + 把点击抛给父组件** —— 队列数据、插队/删除请求都在 ChatDetail。
 * ⚠️ 队列是**服务端**的东西（跨端共享：手机上排的队 PC 看得见）⇒ 本组件
 *   不做任何本地缓存意义上的「真相」。
 */

import { ChevronDownIcon, RotateCwIcon, TrashIcon } from "../ui/Glyphs";
import type { InboxAttachments } from "../../lib/session-inbox";

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
   * · `processed`   ⇒ ★ [P2-2 · 2026-11-17] 服务端**已经处理掉**了（ack 帧）
   *   ⇒ 不再是「排队中」⇒ 标「已处理」。
   */
  local?: "sending" | "unconfirmed" | "processed" | null;
  /**
   * ★ [P2-2 · 2026-11-17] 服务端**已经处理掉**这一条（ack 帧带来的 `inboxId`）。
   *
   *   ⇒ 显示「已处理」（⛔ 别再让用户以为它还排在队里）。
   */
  processed?: boolean;
  /**
   * ★ 附件（★ 2026-11-14 服务端 `bb46bd4`：排队消息的附件**不丢**）
   *   ⇒ 显示「📎 N 个附件」。
   */
  attachments?: InboxAttachments | null;
}

/** 附件个数（图片 + 文件）。 */
function attachmentCount(att: InboxAttachments | null | undefined): number {
  if (!att) return 0;
  const imgs = Array.isArray(att.image_urls) ? att.image_urls.length : 0;
  const files = Array.isArray(att.attached_file_ids)
    ? att.attached_file_ids.length
    : 0;
  return imgs + files;
}

export interface QueueBarProps {
  /** 队列条目（服务端行在前，端侧乐观行在后）。 */
  items: QueueEntry[];
  /** 展开状态（父组件持有 ⇒ 收起时也不该丢）。 */
  expanded: boolean;
  /** 点「N 条排队中 ⌄」⇒ 展开/收起。 */
  onToggle: () => void;
  // ★ [T-139] 「⏫ 立即发送」按钮已取消 ⇒ 不再有 onFlush.
  /**
   * ★ [T-118 · 段二/段三 · 2026-11-23] 三段式的两个新动作。
   *
   *   · `onFold(id, "fold")`      —— **插入本轮**：不打断，把这条并进**当前轮**
   *                                  （下一个工具边界取走 ⇒ 模型在当前轮里读到）
   *   · `onFold(id, "interrupt")` —— **打断并发送**：**硬停**当前轮（秒级）+ 立刻起新轮带这条
   */
  onFold?: (id: string, action: "fold" | "interrupt") => void;
  /** 正在「插入本轮」的那一条（防连点）。 */
  foldingId?: string | null;
  /** 正在「打断并发送」的那一条（防连点）。 */
  interruptingId?: string | null;
  /** 删掉一条**没送达**的端侧乐观行（服务端行不许删 —— 那是服务端的东西）。 */
  onRemove?: (id: string) => void;
  /** 正在插队的那一条（防重复点）。 */
  flushingId?: string | null;
  /**
   * ★ **删掉一条排队消息**（★ 2026-11-14 · 队列删除）。
   *
   *   · 服务端行（有服务端 id）⇒ 父组件调 `DELETE /yinian/sessions/:id/inbox/:messageId`
   *     ⇒ 删完它**再也不会被发出去**（泵队列跳过它、「⏫」也插不了它）；
   *   · 端侧乐观行（`local:` 前缀，服务端还没认领）⇒ 父组件**端侧**直接删
   *     （它没有服务端 id ⇒ 没有端点可调）。
   *
   *   ⛔ **不动已经发出去的消息**（那是历史里的 user 行 ⇒ 走撤回/删除那条路）。
   */
  onDelete?: (id: string) => void;
  /** 正在删除的那一条（防连点 —— 按钮转「处理中」）。 */
  deletingId?: string | null;
}

/** 正文预览 —— 单行 + 超长截断（完整内容在展开区里给）。 */
function preview(content: string, max = 120): string {
  const s = (content || "").replace(/\s+/g, " ").trim();
  if (!s) return "（空消息）";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * ★ [T-118 · 段二/段三 · 2026-11-23] 两个新动作 —— 三段式在端侧的落法。
 *
 * | 按钮 | 段 | 服务端 | 打不打断 | 图标 |
 * |---|---|---|---|---|
 * | ⏫ 立即发送（原有） | 插话 | `flush`（软停 + 起新轮） | 软停 | ⏫ |
 * | **插入本轮** | **段二** | `fold`（只标记可注入） | **不打断** | ⤵ |
 * | **打断并发送** | **段三** | `interrupt`（硬停 + 起新轮） | **硬停（秒级）** | ⏹ |
 *
 * ⚠️ 两个新按钮**不抢** ⏫ 的位置：⏫ 仍是「立即发送」（老语义，老用户肌肉记忆）。
 */
function ActionButton({
  id,
  action,
  label,
  glyph,
  tone,
  disabled,
  onAction,
}: {
  id: string;
  action: "fold" | "interrupt";
  label: string;
  glyph: string;
  tone?: "danger";
  disabled?: boolean;
  onAction: (id: string, action: "fold" | "interrupt") => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={`queue-${action}-${id}`}
      disabled={disabled}
      onClick={() => onAction(id, action)}
      className={[
        "shrink-0 w-6 h-6 inline-flex items-center justify-center rounded-full",
        "text-xs transition-colors duration-150",
        tone === "danger"
          ? "bg-danger/15 text-danger hover:bg-danger/25"
          : "bg-fg/10 text-fg hover:bg-fg/20",
        "disabled:opacity-40 disabled:cursor-not-allowed",
      ].join(" ")}
    >
      <span aria-hidden="true" className="leading-none">
        {glyph}
      </span>
    </button>
  );
}

/**
 * 「🗑」按钮 —— 删掉这一条排队消息（**还没发出去**的那条）。
 *
 * ⚠️ 删的是**队列项** ⇒ 它**再也不会被发出去**；⛔ 不动已经发出去的消息。
 */
function DeleteButton({
  id,
  label,
  disabled,
  busy,
  onDelete,
}: {
  id: string;
  label: string;
  disabled?: boolean;
  /** 正在处理（删除请求在飞）⇒ 转圈 + 禁掉（防连点）。 */
  busy?: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-testid={`queue-delete-${id}`}
      disabled={disabled}
      onClick={() => onDelete(id)}
      className={[
        "shrink-0 w-7 h-7 inline-flex items-center justify-center rounded-full",
        "bg-fg/10 text-fg hover:bg-fg/25 transition-colors duration-150",
        "disabled:opacity-40 disabled:cursor-not-allowed",
      ].join(" ")}
    >
      {busy ? (
        <RotateCwIcon className="w-3 h-3 animate-spin" />
      ) : (
        <TrashIcon className="w-3.5 h-3.5" />
      )}
    </button>
  );
}

export function QueueBar({
  items,
  expanded,
  onToggle,
  onFold,
  foldingId,
  interruptingId,
  onRemove,
  flushingId,
  onDelete,
  deletingId,
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
          {/* ★ [T-139] **「⏫ 立即发送」按钮取消**（用户 2026-11-24 拍板，与安卓对齐）。
              理由：它= 插话（软停 + 起新轮），与「插入本轮」语义重叠，且深色圆形最难认。
              ⇒ 队列条上**只剩「插入本轮」**（发不出去时**服务端自动降级**第三段）。 */}
          {onFold ? (
            <ActionButton
              id={head.id}
              action="fold"
              label="插入本轮（不打断，agent 会在下一次工具调用时看到）"
              glyph="⤵"
              disabled={!canFlushHead || foldingId === head.id || interruptingId === head.id}
              onAction={onFold}
            />
          ) : null}
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
                {it.processed || it.local === "processed"
                  ? "已处理"
                  : it.injectable
                    ? "已插队"
                    : it.local === "unconfirmed"
                      ? "未送达"
                      : "排队中"}
              </span>
              <span
                className="flex-1 min-w-0 text-xs text-fg truncate"
                title={it.content || ""}
              >
                {preview(it.content, 200)}
              </span>
              {/* ★ 附件个数（排队消息的附件**不丢** ⇒ 让用户看得见有几张图/几个文件） */}
              {attachmentCount(it.attachments) > 0 ? (
                <span
                  className="shrink-0 text-[10px] text-fg-subtle"
                  data-testid="queue-item-attachments"
                >
                  📎 {attachmentCount(it.attachments)} 个附件
                </span>
              ) : null}
              {it.local && onRemove && !onDelete ? (
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
              {/* ★ [T-139] 每条只剩「插入本轮」（+「删掉」）⇒「⏫ 立即发送」取消（与安卓对齐）。 */}
              {onFold ? (
                <ActionButton
                  id={it.id}
                  action="fold"
                  label="插入本轮（不打断，agent 会在下一次工具调用时看到）"
                  glyph="⤵"
                  disabled={!!it.local || foldingId === it.id || interruptingId === it.id}
                  onAction={onFold}
                />
              ) : null}
              {/* ★ 删掉这一条（还没发出去的那条）⇒ 它再也不会被发出去。 */}
              {onDelete ? (
                <DeleteButton
                  id={it.id}
                  label="删除这条排队消息"
                  disabled={deletingId === it.id}
                  busy={deletingId === it.id}
                  onDelete={onDelete}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
