/**
 * routes/Library.tsx — 阶段 0.7.2 知识库列表 (P0 6 项补齐)
 *
 * 增量 (gagaOS feedback 2026-10-19 §3.4 library-9..14):
 *   - library-9 (P0): 手动采集 4 路 Sheet (text / link / image / file) — 顶部 "+ 新建" 按钮
 *   - library-10 (P0): AI 总结入库 — see send-blocker note below
 *   - library-11 (P0): 编辑条目 (title + tags) — EditSheet + 卡片 ⋮ 菜单 + LibraryDetail "编辑" 按钮
 *   - library-12 (P1): 批量删除 — 长按 500ms 进多选 + bottom toolbar (取消/全选/删除)
 *   - library-13 (P1): tag 维度过滤 — TagFilter chip 行 (GET /yinian/library/tags)
 *   - library-14 (P2): 排序 — SortMenu 下拉 (newest/oldest/title), 客户端排
 *
 * send-blocker (library-10):
 *   server unified-api 没有 /yinian/library/save-message-to-knowledge 端点 (或任何
 *   类似 endpoint), ChatDetail 又是 P0-A worker (chat-id-15) 范围. 本次只做 Library
 *   的 UI 端, AI 总结到 KB 入口不由本页触发 — 等 server 端补 endpoint 或 ChatDetail
 *   实现改造触发点.
 *
 * 单文件改动; 多选状态 / 编辑 / 排序 / tag 过滤状态全在 Library() 顶层,
 * 卡片改用 LibraryCard (src/components/library/LibraryCard.tsx).
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  batchDeleteLibraryItems,
  deleteLibraryItem,
  listLibrary,
  type LibraryItem,
} from "../lib/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { useToast } from "../components/ui/Toast";
import { LibraryDropZone } from "../components/library/LibraryDropZone";
import { LibraryCard } from "../components/library/LibraryCard";
import { CollectSheet } from "../components/library/CollectSheet";
import { EditSheet } from "../components/library/EditSheet";
import { MultiSelectToolbar } from "../components/library/MultiSelectToolbar";
import { TagFilter } from "../components/library/TagFilter";
import { SortMenu, type LibrarySort } from "../components/library/SortMenu";

// =========================================================================
// 类型 tab — 用 web LibraryItem.type (image | doc | link | text) 做客户端过滤,
//   对齐 gacode-web Library 顶部 tabs.
// =========================================================================
type TypeFilter = "all" | "image" | "doc" | "link";

const TYPE_CHIPS: Array<{ key: TypeFilter; label: string }> = [
  { key: "all", label: "全部" },
  { key: "image", label: "图片" },
  { key: "doc", label: "文档" },
  { key: "link", label: "链接" },
];

const PAGE_SIZE = 24;

export function Library() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [type, setType] = useState<TypeFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [tagFilter, setTagFilter] = useState<string | undefined>(undefined);
  const [sort, setSort] = useState<LibrarySort>("newest");
  const [page, setPage] = useState(1);

  // 采集 Sheet
  const [collectOpen, setCollectOpen] = useState(false);

  // 编辑 Sheet
  const [editingItem, setEditingItem] = useState<LibraryItem | null>(null);

  // 多选模式
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const isInMultiSelect = selectedIds.size > 0;

  // 单条删除 (直接从卡片菜单触发)
  const [pendingSingleDelete, setPendingSingleDelete] = useState<LibraryItem | null>(null);

  // 把 web 的 'doc' / 'link' 映射回 server 的 modality 'file' — server 端
  // /yinian/library 只接受 ['text','image','audio','video','file']. web 端
  // LibraryItem.type 'doc'/'link' 都是 modality 'file' 的子集, 单边 query 时
  // type='file' 拿全量, 客户端再按 type 二次过滤.
  const serverType = useMemo<string | undefined>(() => {
    if (type === "all") return undefined;
    return "file";
  }, [type]);

  // server tag 参数 — listLibrary 接受 `tag` (单 tag), 与本地 tagFilter 同步
  const serverTag = useMemo(() => tagFilter, [tagFilter]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["library", { type, tag: serverTag, keyword, page }],
    queryFn: () =>
      listLibrary({
        type: serverType,
        tag: serverTag,
        page,
        pageSize: PAGE_SIZE,
        keyword: keyword.trim() || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  // 客户端二次过滤 (server modality='file' 包了 doc+link, 这里拆开) + 客户端排序
  const filteredItems: LibraryItem[] = useMemo(() => {
    const raw = data?.items ?? [];
    const t = type === "all"
      ? raw
      : raw.filter((it) => it.type === type);
    const sorted = [...t];
    sorted.sort((a, b) => {
      if (sort === "newest") return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (sort === "oldest") return Date.parse(a.createdAt) - Date.parse(b.createdAt);
      // title
      return (a.title || "").localeCompare(b.title || "", "zh-Hans-CN");
    });
    return sorted;
  }, [data?.items, type, sort]);

  const hasMore = data?.hasMore ?? false;

  const handleRefresh = () => {
    setPage(1);
    refetch();
  };

  // ────── 切 type/tag/keyword/sort → 重置分页 + 退出多选 ──────
  const resetFilters = () => {
    setPage(1);
    setSelectedIds(new Set());
  };

  // ────── 多选 toggle ──────
  const toggleMultiSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const enterMultiSelect = (item: LibraryItem) => {
    setSelectedIds(new Set([item.id]));
  };

  const allSelected =
    filteredItems.length > 0 && selectedIds.size === filteredItems.length;

  const handleToggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((it) => String(it.id))));
    }
  };

  const cancelMultiSelect = () => setSelectedIds(new Set());

  // ────── 单条删除 ──────
  const singleDeleteMutation = useMutation({
    mutationFn: (id: string) => deleteLibraryItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.invalidateQueries({ queryKey: ["library-tags"] });
      toast({ message: "已删除", variant: "success" });
      setPendingSingleDelete(null);
    },
    onError: (err) => {
      toast({
        message: `删除失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });

  // ────── 批量删除 — 客户端 fan-out ──────
  const batchDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => batchDeleteLibraryItems(ids),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.invalidateQueries({ queryKey: ["library-tags"] });
      if (res.failed.length === 0) {
        toast({
          message: `已删除 ${res.succeeded.length} 条`,
          variant: "success",
        });
      } else if (res.succeeded.length === 0) {
        toast({
          message: `全部删除失败`,
          variant: "danger",
        });
      } else {
        toast({
          message: `成功 ${res.succeeded.length} / 失败 ${res.failed.length}`,
          variant: "warning",
        });
      }
      cancelMultiSelect();
      setBatchDeleteOpen(false);
    },
    onError: (err) => {
      toast({
        message: `删除失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
      setBatchDeleteOpen(false);
    },
  });

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    batchDeleteMutation.mutate(Array.from(selectedIds));
  };

  return (
    <LibraryDropZone
      onResult={(r) => {
        if (r.ok) {
          toast({
            message: `已入库: ${r.file.name}`,
            variant: "success",
          });
          queryClient.invalidateQueries({ queryKey: ["library-tags"] });
        } else {
          toast({
            message: `入库失败: ${r.msg ?? "未知"}`,
            variant: "danger",
          });
        }
      }}
    >
      <div className="min-h-full flex flex-col">
        {/* 顶部操作栏 */}
        <div className="sticky top-0 z-10 bg-bg-base">
          <div className="px-4 lg:px-8 max-w-5xl mx-auto w-full space-y-2 py-2">
            {/* Row 1: 类型 chip (左) + [+ 新建] (中) + 排序 + 刷新 (右) */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0 overflow-x-auto">
                <div className="inline-flex p-1 rounded-md bg-bg-elevated gap-1">
                  {TYPE_CHIPS.map((t) => {
                    const active = type === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => {
                          setType(t.key);
                          resetFilters();
                        }}
                        className={[
                          "px-3 py-1 text-sm rounded transition-colors duration-150",
                          active
                            ? "bg-brand text-brand-on shadow-sm"
                            : "text-fg-muted hover:text-fg",
                        ].join(" ")}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setCollectOpen(true)}
                  aria-label="新建条目"
                >
                  <PlusIcon />
                  <span className="hidden sm:inline">新建</span>
                </Button>
                <SortMenu value={sort} onChange={setSort} />
                <button
                  type="button"
                  onClick={handleRefresh}
                  aria-label="刷新"
                  disabled={isFetching}
                  className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors duration-150 inline-flex items-center justify-center disabled:opacity-50"
                >
                  <RefreshIcon className={isFetching ? "animate-spin" : ""} />
                </button>
              </div>
            </div>

            {/* Row 2: 搜索框 */}
            <div className="relative">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted pointer-events-none" />
              <Input
                type="search"
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value);
                  resetFilters();
                }}
                placeholder="搜索标题..."
                className="pl-9 py-2 text-sm"
              />
            </div>

            {/* Row 3: Tag 维度过滤 */}
            <TagFilter
              selected={tagFilter}
              onSelect={(t) => {
                setTagFilter(t);
                resetFilters();
              }}
            />
          </div>
        </div>

        {/* 列表区 */}
        <div className="flex-1 px-4 lg:px-8 max-w-5xl mx-auto w-full py-4">
          {isLoading ? (
            <SkeletonGrid />
          ) : filteredItems.length === 0 ? (
            <EmptyState onCreateClick={() => setCollectOpen(true)} />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredItems.map((it) => (
                  <LibraryCard
                    key={it.id}
                    item={it}
                    isInMultiSelect={isInMultiSelect}
                    isSelected={selectedIds.has(it.id)}
                    onOpen={() => navigate(`/library/${it.id}`)}
                    onToggleSelect={() => toggleMultiSelect(it.id)}
                    onEnterMultiSelect={() => enterMultiSelect(it)}
                    onEdit={() => setEditingItem(it)}
                    onDelete={() => setPendingSingleDelete(it)}
                  />
                ))}
              </div>
              {hasMore ? (
                <div className="flex justify-center mt-4">
                  <Button
                    variant="ghost"
                    size="md"
                    loading={isFetching}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    加载更多
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* 多选模式 bottom toolbar — sticky 在底部; 列表区有 flex-1 让 toolbar 永远贴底 */}
      {isInMultiSelect ? (
        <MultiSelectToolbar
          selectedCount={selectedIds.size}
          totalVisible={filteredItems.length}
          onCancel={cancelMultiSelect}
          onToggleSelectAll={handleToggleSelectAll}
          onConfirmDelete={handleBatchDelete}
          confirmOpen={batchDeleteOpen}
          onConfirmOpenChange={setBatchDeleteOpen}
          deletePending={batchDeleteMutation.isPending}
          deleteConfirmMessage="选中条目将从知识库移除, 此操作不可撤销。"
        />
      ) : null}

      {/* 单条删除二次确认 */}
      {pendingSingleDelete ? (
        <ConfirmDialog
          title="删除这条知识?"
          message={`「${pendingSingleDelete.title || "未命名"}」 将从知识库移除, 此操作不可撤销。`}
          confirmLabel="确认删除"
          confirmVariant="danger"
          loading={singleDeleteMutation.isPending}
          onCancel={() => setPendingSingleDelete(null)}
          onConfirm={() =>
            singleDeleteMutation.mutate(pendingSingleDelete.id)
          }
        />
      ) : null}

      {/* 编辑 Sheet */}
      <EditSheet
        open={editingItem !== null}
        item={editingItem}
        onClose={() => setEditingItem(null)}
      />

      {/* 采集入口 Sheet */}
      <CollectSheet
        open={collectOpen}
        onClose={() => setCollectOpen(false)}
      />
    </LibraryDropZone>
  );
}

// ────────────────────────────────────────────────────────────
// EmptyState — 无数据 + 「+ 新建」 CTA (gagaOS feedback #4)
// ────────────────────────────────────────────────────────────

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="rounded-md bg-bg-sunken p-8 text-center max-w-sm w-full">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-elevated flex items-center justify-center text-fg-muted">
          <LibraryIcon />
        </div>
        <p className="text-base font-medium mb-1">还没有知识库</p>
        <p className="text-sm text-fg-muted mb-4">
          拖入文件入库,或点击下方按钮手动添加
        </p>
        <Button
          variant="default"
          size="md"
          onClick={onCreateClick}
        >
          <PlusIcon />
          新建条目
        </Button>
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-md bg-bg-elevated p-4 animate-pulse"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded bg-bg-sunken" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-12 bg-bg-sunken rounded" />
              <div className="h-4 w-3/4 bg-bg-sunken rounded" />
              <div className="h-3 w-1/4 bg-bg-sunken rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Icons
// ────────────────────────────────────────────────────────────

function LibraryIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 6 4 14" />
      <path d="m12 8 8 4" />
      <path d="M3 18a1 1 0 0 1 1 1v3a2 2 0 0 0 4 0v-3" />
      <path d="M21 18a1 1 0 0 0-1 1v3a2 2 0 0 1-4 0v-3" />
      <path d="M4 14v6" />
      <path d="M20 14v6" />
    </svg>
  );
}

function RefreshIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
