/**
 * routes/ChatList.tsx — 对话列表 (gacode-electron 0.7.5)
 *
 * 数据: useQuery(["chats", { keyword }], () => getChats({ keyword }))
 * 端点: GET /yinian/sessions — server 端 listSessionQuerySchema 只接受
 *   limit / cursor, 不接 keyword. 客户端拿全量后本地过滤 (chat-10).
 *
 * 功能 (本批 4 项):
 *   - chat-6 (P1): 单条删除二次确认 — ConfirmDialog (替换原 window.confirm)
 *   - chat-7 (P1): 多选模式 (mousedown 500ms + 全选 + 批量删除 + 计数 toast) — 已实现
 *   - chat-10 (P1): 全文搜索 (按 title) — 顶部 Input + 客户端 keyword 过滤
 *   - chat-14 (P1): autoTitle 走 LLM (800ms delay + 守卫) — createMutation.onSuccess
 *     800ms 后调 autoTitleChat 触发 server LLM 总结, 失败 swallow
 *
 * 设计要点:
 *   - 多选模式 (chat-7): 跟 ChatDetail / Library 一致的 mousedown 500ms
 *     长按触发 + bottom toolbar (取消 / 全选 / 删除). 已在前一版本实现,
 *     本轮仅作 keep-best-practice, 不重新设计.
 *   - 搜索 (chat-10): 折叠式 search Input (PC-5, 对齐 web Library L434-475 —
 *     icon-only 按钮点开 → 圆药丸输入框, 再点收起), 200ms 防抖, client-side filter;
 *     server 端无 keyword 时, 我们也不本地 patch filter 而是按 useMemo
 *     切 sortedChats. 空 keyword → 走全量.
 *   - autoTitle (chat-14): 防抖 800ms, 走 server 端 autoTitleChatSession
 *     (gawen LLM), 失败 → swallow 不弹 toast (server 已自愈兜底成截断标题).
 *     5s 窗口内多次触发 → server 端 skip (看 existing.title 是否已非默认).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  autoTitleChat,
  createChat,
  deleteSessions,
  renameChat,
  searchChatsByTitle,
  setSessionPin,
  type ChatSession,
} from "../lib/api";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
// A1-D4-01 / A1-D4-02 / A2-D4-01: 删除确认 + 重命名 改用底部 Sheet
//   (复用现有 components/ui/BottomSheet — 它已是 web `SheetContent` 的等价物).
import { BottomSheet } from "../components/ui/BottomSheet";
import {
  CheckCheckIcon,
  CloseIcon,
  MessageSquarePlusIcon,
  MoreVertIcon,
  PencilIcon,
  PinRowIcon,
  SearchIcon,
  TrashIcon,
} from "../components/ui/Glyphs";

const SEARCH_DEBOUNCE_MS = 200;
const AUTOTITLE_DELAY_MS = 800;

export function ChatList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ────────────── 搜索输入 (chat-10) — debounce → queryKey ──────────────
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  // PC-5: 搜索框折叠形态 — 默认只渲染 icon 按钮, 点开才展开圆药丸输入框.
  // 收起时 searchInput 不清空 (搜索状态保留), 跟 web Library showSearch 同语义.
  const [showSearch, setShowSearch] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearchDebounced(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["chats", { keyword: searchDebounced }],
    queryFn: () => searchChatsByTitle(searchDebounced),
    placeholderData: (prev) => prev,
  });

  const chats = data?.chats ?? [];

  // ────────────── 新建对话 ──────────────
  const createMutation = useMutation({
    mutationFn: createChat,
    onSuccess: (chat) => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      navigate(`/chat/${chat.id}`);
      // chat-14: 800ms 后触发 autoTitle — server 端 LLM 总结.
      // 触发条件: title 仍是 server 默认 "新对话", 否则视为用户已改 / LLM 跑过了, skip.
      scheduleAutoTitle(chat.id);
    },
    onError: (err) => {
      // A1-D2-24 (对齐 web `chat/page.tsx:88-94`): 创建失败 toast 分
      //   title / description 两段 (PC 的 Toast 已支持两段式).
      toast({
        title: "创建失败",
        description: String((err as Error)?.message || err),
        variant: "danger",
      });
    },
  });

  // ────────────── 多选删除 ──────────────
  const [multiSelectIds, setMultiSelectIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [singleDelete, setSingleDelete] = useState<{ id: string; title: string } | null>(null);

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
      setSingleDelete(null);
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

  /** 提交重命名 — 对齐 web `chat/page.tsx:151-163` submitRename:
   *  空标题 → toast 报错不提交; 标题跟原标题相同 → 直接关闭; 否则调 renameMutation.
   *  (原逻辑内联在 ConfirmDialog.onConfirm 与 Input 的 Enter 两处, 这里抽成
   *   同一个函数, 按钮 / 回车两条路径共用同一套判定.) */
  const submitRename = () => {
    if (!renameForId) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      toast({ message: "标题不能为空", variant: "danger" });
      return;
    }
    if (trimmed === renameForId.title) {
      setRenameForId(null);
      return;
    }
    renameMutation.mutate({ id: renameForId.id, title: trimmed });
  };

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

  // ────────────── 单条删除 — chat-6: 用 ConfirmDialog (替换 window.confirm) ──────────────
  const singleDeleteMutation = useMutation({
    mutationFn: (id: string) => deleteSessions([id]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      toast({ message: "已删除对话", variant: "success" });
      setMenuForId(null);
      setSingleDelete(null);
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

  /** 退出多选 — 对齐 web useChatStore.exitMultiSelect (web `src/lib/store.ts:224-225`):
   *  清空勾选集合 + 退出多选模式. PC 的多选栏由 `multiSelectIds.size > 0` 派生,
   *  清空即等于退出模式 —— 跟 web `toggleSelected` 空集自动退模式 (store.ts:218-221) 同语义. */
  const exitMultiSelect = () => {
    setMultiSelectIds(new Set());
  };

  /** 全选 — 对齐 web useChatStore.selectAll (web `src/lib/store.ts:226-229`): 选中当前列表全部 */
  const selectAll = () => {
    setMultiSelectIds(new Set(sortedChats.map((c) => c.id)));
  };

  // A1-D3-06 — 全选判定口径对齐 web `chat/page.tsx:181-182`:
  //   web 用未排序的 chats (语义 =「所有对话都选中」), PC 原来用 sortedChats
  //   (语义 =「当前可见的都选中」). 1:1 还原 → 口径改成 chats.
  const allSelected = chats.length > 0 && multiSelectIds.size === chats.length;

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

  // search 改变时退出多选 — 跟 Library 一致: keyword 切换不混选
  useEffect(() => {
    setMultiSelectIds(new Set());
  }, [searchDebounced]);

  return (
    <div className="min-h-full flex flex-col">
      {/* 页面根容器 — 对齐 web `chat/page.tsx:185` `px-4 lg:px-8 py-6 max-w-3xl mx-auto` */}
      <div className="px-4 lg:px-8 py-6 max-w-3xl mx-auto flex-1 w-full">
      {/* 顶 Header — 搜索 (折叠药丸) + 计数 */}
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm text-fg-muted shrink-0">
          {pinnedCount > 0 ? `${pinnedCount} 条置顶 · 共 ${sortedChats.length}` : `共 ${sortedChats.length} 条对话`}
        </div>
        {/* PC-5: 搜索 — icon-only 按钮折叠/展开圆药丸输入框 (对齐 web Library
            L434-475: w-9 h-9 rounded-full toggle + rounded-full bg-muted/50 border-0).
            Input 组件把 className 追加在 base className 之后 (Input.tsx:30). */}
        <div className="flex-1 min-w-0 flex items-center justify-end gap-1">
          {showSearch ? (
            <div className="relative flex-1 min-w-0 max-w-md">
              <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none z-10" />
              <Input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="搜索对话标题..."
                aria-label="搜索对话"
                autoFocus
                // bg-muted/50 + border-0 + pl-9 在 tailwind 产物里本就排在 base
                // 之后 (bg-bg-sunken / .border / .px-4), 直接覆盖即可;
                // 但 .rounded-full 排在 .rounded-md 之前 → 会输给 base rounded-md,
                // 故 radius 额外用 ! 强制 (本仓无 tailwind-merge).
                className="rounded-full bg-muted/50 border-0 pl-9 focus-visible:ring-1 focus-visible:ring-brand !rounded-full"
              />
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setShowSearch((v) => !v)}
            aria-label={showSearch ? "关闭搜索" : "搜索"}
            aria-expanded={showSearch}
            className={[
              "shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center",
              "transition-colors duration-150",
              showSearch ? "bg-bg-elevated text-fg" : "text-fg-muted hover:bg-bg-elevated",
            ].join(" ")}
          >
            <SearchIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 错误态 */}
      {error ? (
        <div className="py-4">
          <div className="rounded-md bg-danger-soft/30 px-4 py-3 text-sm">
            加载失败:{error instanceof Error ? error.message : String(error)}
          </div>
        </div>
      ) : null}

      {/* 多选模式 top bar — 对齐 web `chat/page.tsx:187-224`
          (web 是顶部 sticky bar, 不是底部; PC 的 main 自身是滚动容器,
           header 在 main 之外不重叠, 故 sticky 偏移取 top-0 而非 top-14) */}
      {multiSelectIds.size > 0 ? (
        <div className="sticky top-0 z-30 -mx-4 lg:-mx-8 px-4 lg:px-8 mb-4 py-2 bg-bg-elevated border-b border-border flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMultiSelectIds(new Set())}
            className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-bg-sunken"
            aria-label="退出多选"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
          <span className="flex-1 text-sm font-medium">
            已选 {multiSelectIds.size} 项
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // A1-D3-05 — 对齐 web `chat/page.tsx:203-205`:
              //   `allSelected ? exitMultiSelect() : selectAll()`
              if (allSelected) {
                exitMultiSelect();
              } else {
                selectAll();
              }
            }}
            className="gap-1.5"
          >
            <CheckCheckIcon className="w-4 h-4" />
            {allSelected ? "清空" : "全选"}
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={deleteMutation.isPending}
            onClick={() => setConfirmOpen(true)}
            className="gap-1.5"
          >
            <TrashIcon className="w-4 h-4" />
            删除 ({multiSelectIds.size})
          </Button>
        </div>
      ) : null}

      {/* 新建对话按钮 — 对齐 web `chat/page.tsx:227-237` (页内大按钮) */}
      <div className="mb-6">
        <Button
          variant="default"
          size="lg"
          onClick={() => createMutation.mutate({})}
          disabled={createMutation.isPending || multiSelectIds.size > 0}
          className="w-full lg:w-auto gap-2"
        >
          <MessageSquarePlusIcon className="w-5 h-5" />
          {createMutation.isPending ? "创建中..." : "新建对话"}
        </Button>
      </div>

      {/* 列表 — 对齐 web `chat/page.tsx:239-264` (space-y-3 包裹标题 + grid gap-3 列表) */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold mb-4">历史对话</h2>
        {isLoading ? (
          <SkeletonList />
        ) : sortedChats.length === 0 ? (
          searchDebounced ? (
            <SearchEmpty keyword={searchDebounced} onClear={() => setSearchInput("")} />
          ) : (
            <EmptyState />
          )
        ) : (
          <ul className="grid gap-3">
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
                    // chat-6: 替换 window.confirm → 自实现 ConfirmDialog
                    setSingleDelete({ id: c.id, title: c.title });
                    setMenuForId(null);
                  }}
                  menuOpen={menuForId === c.id}
                  onMenuOpenChange={(o) => setMenuForId(o ? c.id : null)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>

      {/* 批量删除确认 — 底部 Sheet (A1-D4-01, 对齐 web `chat/page.tsx:279-310`) — 标题 titleClassName 对齐 web SheetTitle (text-lg font-semibold) */}
      <BottomSheet
        open={confirmOpen}
        title={`确认删除 ${multiSelectIds.size} 条对话？`}
        titleClassName="text-lg font-semibold"
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={deleteMutation.isPending}
            >
              取消
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteMutation.mutate(Array.from(multiSelectIds))}
              loading={deleteMutation.isPending}
              className="gap-2"
            >
              确认删除
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          此操作不可恢复，对话中的消息将被永久删除。
        </p>
      </BottomSheet>

      {/* 单条删除确认弹窗 — chat-6 (替换 window.confirm) */}
      {singleDelete ? (
        <ConfirmDialog
          title="删除对话"
          message={`确认删除对话 "${singleDelete.title || "新对话"}"? 此操作不可恢复。`}
          confirmLabel="删除"
          confirmVariant="danger"
          loading={singleDeleteMutation.isPending}
          onCancel={() => setSingleDelete(null)}
          onConfirm={() => singleDeleteMutation.mutate(singleDelete.id)}
        />
      ) : null}

      {/* 重命名 — 底部 Sheet (A1-D4-02, 对齐 web `chat/page.tsx:314-358`) — 标题 titleClassName 对齐 web SheetTitle (text-lg font-semibold) */}
      <BottomSheet
        open={renameForId !== null}
        title="重命名对话"
        titleClassName="text-lg font-semibold"
        onClose={() => setRenameForId(null)}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setRenameForId(null)}
              disabled={renameMutation.isPending}
            >
              取消
            </Button>
            <Button
              onClick={submitRename}
              disabled={!renameDraft.trim()}
              loading={renameMutation.isPending}
              className="gap-2"
            >
              保存
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          修改后服务端会保留自定义标题 (不会在下次自动生成时覆盖).
        </p>
        <div className="px-4 pb-2 mt-2">
          <Input
            data-testid="rename-input"
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            placeholder="输入新标题"
            maxLength={120}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitRename();
              }
            }}
          />
        </div>
      </BottomSheet>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// chat-14: autoTitle 触发器 — 800ms 后调 server LLM 总结.
// 失败 / 已有非默认标题 → swallow (server 端 autoTitleChatSession 已自愈).
// 5s 内同 chat 多次触发 → 仅触发首次 (timer 引用缓存).
// ────────────────────────────────────────────────────────────

function scheduleAutoTitle(chatId: string) {
  window.setTimeout(async () => {
    try {
      await autoTitleChat(chatId);
    } catch (err) {
      console.warn("[gacode-chat] autoTitle failed", err);
    }
  }, AUTOTITLE_DELAY_MS);
}

// ────────────────────────────────────────────────────────────
// 子组件
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
        <PinRowIcon className="shrink-0 text-brand" />
      ) : null}

      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          {chat.title || "新对话"}
        </div>
        <div className="text-sm text-fg-muted mt-1">{relative}</div>
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
                icon={<PinRowIcon className="text-fg-muted" />}
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

// ────────────── empty / skeleton ──────────────

// 空态 — 对齐 web `chat/page.tsx:266-274`:
//   <Card><CardContent className="p-8 text-center text-muted-foreground">
//   PC 侧用共享 `components/ui/Card.tsx` (A1-D3-07): Card base = rounded-lg border
//   bg-card text-card-foreground shadow; CardContent base = p-6, 调用方 p-8 在
//   tailwind 产物里排在 p-6 之后 → 覆盖生效.
function EmptyState() {
  return (
    <Card>
      <CardContent className="p-8 text-center text-muted-foreground">
        <MessageSquarePlusIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <div className="text-lg font-medium mb-2">暂无对话</div>
        <div className="text-sm">开始新对话，开启与 AI 的交流之旅</div>
      </CardContent>
    </Card>
  );
}

function SearchEmpty({
  keyword,
  onClear,
}: {
  keyword: string;
  onClear: () => void;
}) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="rounded-md bg-bg-sunken p-8 text-center max-w-sm">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-elevated flex items-center justify-center text-fg-muted">
          <SearchIcon />
        </div>
        <p className="text-base font-medium mb-1">没有匹配的对话</p>
        <p className="text-sm text-fg-muted mb-4">
          搜索 “{keyword}” 没找到结果
        </p>
        <Button variant="ghost" size="md" onClick={onClear}>
          清除搜索
        </Button>
      </div>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-md bg-muted h-24 w-full" />
      ))}
    </div>
  );
}

// ────────────── helpers ──────────────

// 相对时间 — 对齐 web `chat/page.tsx:413-416`:
//   formatDistanceToNow(new Date(updatedAt), { addSuffix: true, locale: zhCN })
// 文案: 「大约 1 分钟前」/「大约 2 小时前」/「10月20日」
function formatRelative(iso: string): string {
  try {
    const t = new Date(iso);
    if (Number.isNaN(t.getTime())) return "";
    return formatDistanceToNow(t, { addSuffix: true, locale: zhCN });
  } catch {
    return "";
  }
}
