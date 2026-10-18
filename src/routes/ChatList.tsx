/**
 * routes/ChatList.tsx — 阶段 2 Chat 列表 + 创建 + 置顶 + 批量删除
 *
 * 数据: useQuery(["chats"], getChats)
 *
 * 功能:
 *   - 顶 Header + 按钮: 新建对话 → useMutation(createChat, onSuccess → nav('/chat/' + id))
 *   - 列表: title + updatedAt(相对时间) + pinned 标记
 *   - 单击: nav('/chat/:id')
 *   - 多选模式 (顶部 bar): ☐/☑ 切换 + 全选 + 顶部"删除 (N)"按钮 + AlertDialog 二次确认
 *   - 行菜单 (⋮): 置顶 toggle (乐观, 失败回滚 + toast) + 重命名 + 单条删除
 *   - 空态: "暂无对话" + "新建对话"按钮 (跟阶段 1 占位不同, 这里用真按钮)
 *
 * 设计要点:
 *   - 不引 Radix AlertDialog / DropdownMenu, 自实现简单 modal + dropdown (阶段 2 边界)
 *   - 乐观更新: pin toggle 用 setQueryData 改缓存 + 失败 queryClient.invalidate
 *   - 删完最后一条 batch → 跳回 /chat (重渲染空态)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createChat,
  deleteSessions,
  getChats,
  renameChat,
  setSessionPin,
  type ChatSession,
} from "../lib/api";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

export function ChatList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const {
    data,
    isLoading,
    error,
  } = useQuery({ queryKey: ["chats"], queryFn: getChats });

  const chats = data?.chats ?? [];

  // ────────────── 新建对话 ──────────────
  const createMutation = useMutation({
    mutationFn: createChat,
    onSuccess: (chat) => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      navigate(`/chat/${chat.id}`);
    },
    onError: (err) => {
      toast({
        message: `创建失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });

  // ────────────── 多选删除 ──────────────
  const [multiSelectIds, setMultiSelectIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => deleteSessions(ids),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      toast({
        message: `已删除 ${res.deletedCount} 条对话`,
        variant: "success",
      });
      setMultiSelectIds(new Set());
      setConfirmOpen(false);
    },
    onError: (err) => {
      toast({
        message: `删除失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });

  // ────────────── 行菜单 (重命名/置顶/单删) ──────────────
  const [menuForId, setMenuForId] = useState<string | null>(null);
  const [renameForId, setRenameForId] = useState<{ id: string; title: string } | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      renameChat(id, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      toast({ message: "已重命名", variant: "success" });
      setRenameForId(null);
    },
    onError: (err) => {
      toast({
        message: `重命名失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });

  // ────────────── 置顶乐观更新 ──────────────
  const pinMutation = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      setSessionPin(id, pinned),
    onMutate: async ({ id, pinned }) => {
      await queryClient.cancelQueries({ queryKey: ["chats"] });
      const prev = queryClient.getQueryData<{ chats: ChatSession[] }>(["chats"]);
      if (prev) {
        const next = {
          chats: prev.chats.map((c) => (c.id === id ? { ...c, pinned } : c)),
        };
        queryClient.setQueryData(["chats"], next);
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["chats"], ctx.prev);
      toast({
        message: `置顶失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });

  // ────────────── 单条删除 ──────────────
  const singleDeleteMutation = useMutation({
    mutationFn: (id: string) => deleteSessions([id]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      toast({ message: "已删除对话", variant: "success" });
      setMenuForId(null);
    },
    onError: (err) => {
      toast({
        message: `删除失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });

  // ────────────── 排序 (pinned 排前, 之后 updatedAt 倒序) ──────────────
  const sortedChats = useMemo(() => {
    return [...chats].sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
  }, [chats]);

  const pinnedCount = sortedChats.filter((c) => c.pinned).length;

  const toggleMultiSelect = (id: string) => {
    setMultiSelectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = sortedChats.length > 0 && multiSelectIds.size === sortedChats.length;

  // 关闭菜单当 click outside
  useEffect(() => {
    if (!menuForId) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest?.("[data-row-menu]")) return;
      setMenuForId(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuForId]);

  return (
    <div className="min-h-full flex flex-col">
      {/* 顶 Header 内的 + 按钮 — 阶段 1 已经画在 AppShell header 的 right slot;
          阶段 2 把"新建"按钮挪到 ChatList 的内容区, 让 AppShell header 只放 56px 系统栏. */}
      <div className="px-6 pt-4 flex items-center justify-between">
        <div className="text-sm text-fg-muted">
          {pinnedCount > 0 ? `${pinnedCount} 条置顶 · 共 ${sortedChats.length}` : `共 ${sortedChats.length} 条对话`}
        </div>
        <Button
          variant="default"
          size="md"
          loading={createMutation.isPending}
          onClick={() => createMutation.mutate({})}
        >
          + 新建对话
        </Button>
      </div>

      {/* 错误态 */}
      {error ? (
        <div className="px-6 py-4">
          <div className="rounded-md bg-danger-soft/30 px-4 py-3 text-sm">
            加载失败:{error instanceof Error ? error.message : String(error)}
          </div>
        </div>
      ) : null}

      {/* 列表 */}
      <div className="px-6 py-4 flex-1">
        {isLoading ? (
          <SkeletonList />
        ) : sortedChats.length === 0 ? (
          <EmptyState
            onCreate={() => createMutation.mutate({})}
            isPending={createMutation.isPending}
          />
        ) : (
          <ul className="space-y-2 max-w-3xl">
            {sortedChats.map((c) => (
              <li key={c.id}>
                <ChatRow
                  chat={c}
                  isInMultiSelect={multiSelectIds.size > 0}
                  isSelected={multiSelectIds.has(c.id)}
                  onClick={() => {
                    if (multiSelectIds.size > 0) {
                      toggleMultiSelect(c.id);
                    } else {
                      navigate(`/chat/${c.id}`);
                    }
                  }}
                  onLongPress={() => {
                    setMultiSelectIds((prev) => {
                      const next = new Set(prev);
                      next.add(c.id);
                      return next;
                    });
                  }}
                  onTogglePin={() =>
                    pinMutation.mutate({ id: c.id, pinned: !c.pinned })
                  }
                  onRename={() => {
                    setRenameForId({ id: c.id, title: c.title });
                    setRenameDraft(c.title);
                    setMenuForId(null);
                  }}
                  onDelete={() => {
                    if (window.confirm(`确认删除对话 "${c.title || "新对话"}"?`)) {
                      singleDeleteMutation.mutate(c.id);
                    }
                  }}
                  menuOpen={menuForId === c.id}
                  onMenuOpenChange={(o) => setMenuForId(o ? c.id : null)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 多选模式 bottom bar */}
      {multiSelectIds.size > 0 ? (
        <div className="sticky bottom-0 z-30 bg-bg-elevated px-4 py-3 flex items-center gap-3">
          <span className="text-sm">
            已选 <strong>{multiSelectIds.size}</strong> 条
          </span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMultiSelectIds(new Set())}
          >
            取消
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (allSelected) setMultiSelectIds(new Set());
              else setMultiSelectIds(new Set(sortedChats.map((c) => c.id)));
            }}
          >
            {allSelected ? "清空" : "全选"}
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={deleteMutation.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            删除 ({multiSelectIds.size})
          </Button>
        </div>
      ) : null}

      {/* 批量删除确认弹窗 */}
      {confirmOpen ? (
        <ConfirmDialog
          title={`确认删除 ${multiSelectIds.size} 条对话?`}
          message="此操作不可恢复,对话中的消息也会被删除。"
          confirmLabel="确认删除"
          confirmVariant="danger"
          loading={deleteMutation.isPending}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() =>
            deleteMutation.mutate(Array.from(multiSelectIds))
          }
        />
      ) : null}

      {/* 重命名弹窗 */}
      {renameForId ? (
        <ConfirmDialog
          title="重命名对话"
          message=""
          confirmLabel="保存"
          inputValue={renameDraft}
          inputPlaceholder="输入新标题"
          inputMaxLength={120}
          loading={renameMutation.isPending}
          onCancel={() => setRenameForId(null)}
          onConfirm={() => {
            const trimmed = renameDraft.trim();
            if (!trimmed || trimmed === renameForId.title) {
              setRenameForId(null);
              return;
            }
            renameMutation.mutate({ id: renameForId.id, title: trimmed });
          }}
        >
          <Input
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            placeholder="输入新标题"
            maxLength={120}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const trimmed = renameDraft.trim();
                if (trimmed && trimmed !== renameForId.title) {
                  renameMutation.mutate({ id: renameForId.id, title: trimmed });
                } else {
                  setRenameForId(null);
                }
              }
            }}
          />
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 组件 / 子组件
// ────────────────────────────────────────────────────────────

function ChatRow({
  chat,
  isInMultiSelect,
  isSelected,
  onClick,
  onLongPress,
  onTogglePin,
  onRename,
  onDelete,
  menuOpen,
  onMenuOpenChange,
}: {
  chat: ChatSession;
  isInMultiSelect: boolean;
  isSelected: boolean;
  onClick: () => void;
  onLongPress: () => void;
  onTogglePin: () => void;
  onRename: () => void;
  onDelete: () => void;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
}) {
  const timerRef = useRef<number | null>(null);
  const triggeredRef = useRef(false);

  const startPress = () => {
    triggeredRef.current = false;
    timerRef.current = window.setTimeout(() => {
      triggeredRef.current = true;
      onLongPress();
    }, 500);
  };
  const endPress = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const relative = formatRelative(chat.updatedAt);

  return (
    <div
      data-row-menu
      onMouseDown={startPress}
      onMouseUp={endPress}
      onMouseLeave={endPress}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onTouchCancel={endPress}
      onClick={() => {
        if (!triggeredRef.current) onClick();
      }}
      className={[
        "group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors duration-150 cursor-pointer select-none",
        isSelected
          ? "bg-bg-elevated"
          : "bg-bg-sunken hover:bg-bg-elevated",
      ].join(" ")}
    >
      {/* multi-select checkbox / pin icon */}
      {isInMultiSelect ? (
        <span
          aria-hidden="true"
          className={[
            "shrink-0 w-5 h-5 inline-flex items-center justify-center rounded border",
            isSelected
              ? "bg-fg border-fg text-bg-base"
              : "bg-bg-base border-border text-transparent",
          ].join(" ")}
        >
          ✓
        </span>
      ) : null}

      {/* pin icon column (visible only if pinned) */}
      {chat.pinned ? (
        <PinIcon className="shrink-0 text-brand" />
      ) : null}

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">
          {chat.title || "新对话"}
        </div>
        <div className="text-xs text-fg-muted mt-0.5">{relative}</div>
      </div>

      {/* ⋮ 菜单按钮 (not in multi-select) */}
      {!isInMultiSelect ? (
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="对话操作"
            onClick={(e) => {
              e.stopPropagation();
              onMenuOpenChange(!menuOpen);
            }}
            className="w-8 h-8 inline-flex items-center justify-center rounded hover:bg-bg-base text-fg-muted hover:text-fg transition-colors duration-150 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          >
            <MoreVertIcon />
          </button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-9 z-40 min-w-[160px] rounded-md bg-bg-elevated shadow-elevation-3 py-1 animate-fade-in"
            >
              <MenuItem
                icon={<PinIcon className="text-fg-muted" />}
                label={chat.pinned ? "取消置顶" : "置顶"}
                onClick={() => {
                  onTogglePin();
                  onMenuOpenChange(false);
                }}
              />
              <MenuItem
                icon={<PencilIcon className="text-fg-muted" />}
                label="重命名"
                onClick={onRename}
              />
              <div className="my-1 border-t border-border" />
              <MenuItem
                icon={<TrashIcon className="text-danger" />}
                label="删除"
                danger
                onClick={() => {
                  onDelete();
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={[
        "w-full flex items-center gap-2 px-3 py-2 text-sm",
        danger ? "text-danger hover:bg-danger-soft/30" : "text-fg hover:bg-bg-sunken",
        "transition-colors duration-150",
      ].join(" ")}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
    </button>
  );
}

// ────────────── 通用 ConfirmDialog (用于重命名 input 也复用) ──────────────

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  confirmVariant = "default",
  loading,
  onCancel,
  onConfirm,
  inputValue: _inputValue,
  inputPlaceholder,
  inputMaxLength,
  children,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmVariant?: "default" | "danger";
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  inputValue?: string;
  inputPlaceholder?: string;
  inputMaxLength?: number;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      <div
        className="absolute inset-0 bg-black/60 animate-fade-in"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm rounded-md bg-bg-elevated shadow-dialog p-5 animate-slide-in-from-bottom">
        <h2 className="text-base font-medium mb-1">{title}</h2>
        {message ? <p className="text-sm text-fg-muted mb-4">{message}</p> : null}
        {children ? <div className="mb-4">{children}</div> : null}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="md" onClick={onCancel} disabled={loading}>
            取消
          </Button>
          <Button
            variant={confirmVariant === "danger" ? "danger" : "default"}
            size="md"
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ────────────── empty + skeleton ──────────────

function EmptyState({
  onCreate,
  isPending,
}: {
  onCreate: () => void;
  isPending: boolean;
}) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="rounded-md bg-bg-sunken p-8 text-center max-w-sm">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-elevated flex items-center justify-center text-fg-muted">
          <ChatBubblePlus />
        </div>
        <p className="text-base font-medium mb-1">还没有对话</p>
        <p className="text-sm text-fg-muted mb-4">点下面的按钮开始第一次会话</p>
        <Button
          variant="default"
          size="lg"
          onClick={onCreate}
          loading={isPending}
        >
          + 新建对话
        </Button>
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-2 max-w-3xl">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="rounded-md bg-bg-sunken px-3 py-3 animate-pulse"
        >
          <div className="h-4 w-2/3 bg-bg-elevated rounded" />
          <div className="h-3 w-1/3 bg-bg-elevated rounded mt-2" />
        </div>
      ))}
    </div>
  );
}

// ────────────── helpers ──────────────

function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  return new Date(t).toLocaleDateString();
}

// ────────────── icons ──────────────

function PinIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h0a3 3 0 0 0-3-3v0a3 3 0 0 0-3 3v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
}

function MoreVertIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="5" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="12" cy="19" r="1.4" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function ChatBubblePlus() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="12" y1="8" x2="12" y2="14" />
      <line x1="9" y1="11" x2="15" y2="11" />
    </svg>
  );
}
