/**
 * components/chat/MessageMenu.tsx — 阶段 8 ChatDetail P0 消息 ⋮ 菜单
 *
 * 行为对位 gacode-web `src/components/chat/MessageBubble.tsx:1080-end` 同款,
 * 但 electron 这边把菜单抽成独立组件 (web 内嵌在 MessageBubble 内),
 * 给 MessageBubble 提供 props (callbacks + capability flags) 即可开/关菜单:
 *
 *   用户侧条目 (gagaOS 2026-10-19 拍板 — 推翻之前 chat-id-17 yes):
 *     - 复制            : 任意 role, 不依赖 server
 *     - 保存到知识库   : 任意 role, 走 createLibraryItem(text snippet)
 *     - 撤回            : assistant only, 2 分钟窗口, PATCH /messages/:id/recall
 *     - 删除            : 任意 role, DELETE /messages/:id
 *     - 重新生成         : 在 ChatInputBar 右侧 (chat-id-19), 不放 ⋮ 菜单
 *   删 (gagaOS §⑥ — 整体删除, server 无 /messages/:id/feedback endpoint):
 *     - 点赞 / 点踩    : assistant only
 *
 * 复用 src/components/ui/DropdownMenu.tsx + src/lib/toast.tsx.
 *
 * 边界:
 *   - 流式消息不挂菜单 (流中没有真实 serverId, 不能 recall/delete)
 *   - 撤回按钮: server 端 RECALL_WINDOW_SEC=120 (unified-api
 *     yinian.service.js:840), UI 这边也卡一道, 超时禁用 + tooltip 提示
 *   - Save to KB / Recall / Delete 都调 server; onSuccess → invalidateQueries
 *     兜底刷新本地 history.
 *   - copy 拿 navigator.clipboard.writeText, 不支持时降级到 textarea + execCommand.
 */

import { useCallback } from "react";
import {
  DropdownMenu,
  type DropdownMenuItem,
} from "../ui/DropdownMenu";
import { useToast } from "../ui/Toast";
import { recallMessage, deleteMessage, createLibraryItem } from "../../lib/api";

// 跟 server yinian.service.js:840 RECALL_WINDOW_SEC 对齐
export const RECALL_WINDOW_MS = 120_000;

export interface MessageMenuProps {
  /** 当前气泡的角色 */
  role: "user" | "assistant";
  /** server 同步后的消息 id (临时 streaming id 不算) */
  messageId: string;
  /** 消息内容 — copy / save-to-kb 共用 */
  content: string;
  /** 消息创建时间 — 算 2 分钟撤回窗口 */
  createdAt?: string;
  /** 流式中不挂菜单 (parent 决定) */
  isStreaming?: boolean;
  /** 已经撤回/删除 — parent 拿到 store 状态后传进来, 这里再卡一道防误调 */
  recalledOrDeleted?: boolean;
  /** 成功回调 — parent 一般 toast + invalidateQueries */
  onActionDone?: (action: MessageAction, ok: boolean, error?: string) => void;
}

export type MessageAction =
  | "copy"
  | "save-to-knowledge"
  | "recall"
  | "delete";

/** 对外独立导出: 给 parent 算"能不能撤回" (serverId + 2 分钟 + 没撤回/删除) */
export function canRecallMessage(
  messageId: string,
  createdAt: string | undefined,
  recalledOrDeleted: boolean | undefined,
  now: number = Date.now(),
): boolean {
  if (!messageId) return false;
  if (recalledOrDeleted) return false;
  if (!createdAt) return false;
  const ts = new Date(createdAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return now - ts < RECALL_WINDOW_MS;
}

export function MessageMenu(props: MessageMenuProps) {
  const {
    role,
    messageId,
    content,
    createdAt,
    isStreaming,
    recalledOrDeleted,
    onActionDone,
  } = props;
  const { toast } = useToast();

  const showRecall = role === "assistant" && !isStreaming && !recalledOrDeleted;
  const canRecall = showRecall
    ? canRecallMessage(messageId, createdAt, recalledOrDeleted)
    : false;

  // ───────── actions ─────────

  const handleCopy = useCallback(() => {
    if (!content) {
      toast({ message: "消息为空, 无可复制内容", variant: "warning" });
      onActionDone?.("copy", false, "empty");
      return;
    }
    const text = content;
    const fallbackCopy = () => {
      // 后备实现 — 老 Chromium 没 navigator.clipboard 时降级.
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        if (ok) {
          toast({ message: "已复制", variant: "success" });
          onActionDone?.("copy", true);
        } else {
          throw new Error("execCommand copy failed");
        }
      } catch (err) {
        toast({
          message: `复制失败: ${err instanceof Error ? err.message : String(err)}`,
          variant: "danger",
        });
        onActionDone?.("copy", false, String(err));
      }
    };

    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          toast({ message: "已复制", variant: "success" });
          onActionDone?.("copy", true);
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("[message-menu] clipboard.writeText failed, fallback:", err);
          fallbackCopy();
        });
    } else {
      fallbackCopy();
    }
  }, [content, toast, onActionDone]);

  const handleSaveToKnowledge = useCallback(async () => {
    if (!content.trim()) {
      toast({ message: "空消息无法保存", variant: "warning" });
      onActionDone?.("save-to-knowledge", false, "empty");
      return;
    }
    try {
      // 跟 gacode-web ChatDetail page.tsx:962-969 同款 fallback:
      //   截断标题 (前 30 字) 当 doc 类型写 library. 等 server 接专用端点
      //   (yinian-android 全仓无此端点 —— 安卓唯一的 saveToKnowledgeBase 是
      //    DocumentViewerActivity.kt:170 的本地函数, 走文档文本入库的另一条路)
      //   再切换. 这里 tags 加 'from-chat' 跟 web 一致.
      const titleBase =
        content.trim().slice(0, 30) || "未命名消息";
      await createLibraryItem({
        type: "doc",
        title: titleBase,
        tags: ["from-chat"],
      });
      toast({ message: "已保存到知识库", variant: "success" });
      onActionDone?.("save-to-knowledge", true);
    } catch (err) {
      toast({
        message: `保存失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
      onActionDone?.("save-to-knowledge", false, String(err));
    }
  }, [content, toast, onActionDone]);

  const handleRecall = useCallback(async () => {
    if (!canRecall) {
      toast({
        message: "已超过 2 分钟撤回窗口, 服务器只接受 2 分钟内的撤回请求",
        variant: "warning",
      });
      onActionDone?.("recall", false, "window-expired");
      return;
    }
    try {
      await recallMessage(messageId);
      toast({ message: "已撤回", variant: "success" });
      onActionDone?.("recall", true);
    } catch (err) {
      toast({
        message: `撤回失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
      onActionDone?.("recall", false, String(err));
    }
  }, [messageId, canRecall, toast, onActionDone]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteMessage(messageId);
      toast({ message: "已删除", variant: "success" });
      onActionDone?.("delete", true);
    } catch (err) {
      toast({
        message: `删除失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
      onActionDone?.("delete", false, String(err));
    }
  }, [messageId, toast, onActionDone]);

  // ───────── render ─────────

  // 流式中不挂菜单 (serverId 不可靠, 防误调).
  if (isStreaming) {
    return null;
  }
  // recalled/deleted 状态: 整菜单不挂
  if (recalledOrDeleted) {
    return null;
  }

  const items: DropdownMenuItem[] = [
    // 1) 复制 (任意 role)
    { label: "复制", onClick: () => void handleCopy() },
    // 2) 保存到知识库 (任意 role) — 走 web page.tsx:962-969 fallback createLibraryItem
    { label: "保存到知识库", onClick: () => void handleSaveToKnowledge() },
  ];

  // 3) 撤回 (assistant + 2 分钟窗口)
  if (showRecall) {
    items.push({
      label: canRecall ? "撤回" : "撤回（已超过 2 分钟）",
      onClick: () => void handleRecall(),
      disabled: !canRecall,
    });
  }

  // 4) 删除 — destructive (红色), 放最后
  //    2026-10-26: 分隔线 — 对齐 web `components/chat/MessageBubble.tsx:578`
  //      (<DropdownMenuSeparator /> 夹在「保存到知识库」与「删除」之间)
  items.push({
    label: "删除",
    onClick: () => void handleDelete(),
    destructive: true,
    separator: true,
  });

  return (
    <DropdownMenu
      trigger={
        <button
          type="button"
          aria-label="消息操作"
          data-testid="msg-more-button"
          className="w-7 h-7 inline-flex items-center justify-center rounded-full text-fg-muted hover:text-fg hover:bg-bg-sunken transition-colors duration-150"
        >
          <MoreIcon />
        </button>
      }
      items={items}
      align="right"
    />
  );
}

function MoreIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="5" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="12" cy="19" r="1.4" />
    </svg>
  );
}
