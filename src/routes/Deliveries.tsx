/**
 * routes/Deliveries.tsx — 阶段 0.7.5 交付中心 (P1+P2 共 8 项补齐)
 *
 * 阶段 3 阶段 7 baseline: tab + grid + 单删 + 拖入 KB
 * 0.7.5 增量 (gagaOS feedback 2026-10-19 §3.6):
 *   - deliveries-9  (P1): 批量删除 (多选 + AlertDialog, 复用 library/MultiSelectToolbar 形态)
 *   - deliveries-10 (P2): origin 过滤 (AI 生成 / 用户上传) — OriginFilterChips
 *   - deliveries-11 (P1): tag 维度过滤 — send-blocker: server 没有 tag endpoint,
 *                          客户端调 listDeliverables 时如果加 tag 参数会被 server 拒,
 *                          故暂不实现 chip (server 补 endpoint 后再做). 这里在
 *                          listDeliverables 包装里加 origin, 跳过 tag.
 *   - deliveries-12 (P2): 排序 — SortMenu (复用 library/SortMenu 客户端排)
 *   - deliveries-13 (P1): 卡片拖拽 → 转知识库 (复用现有的 DeliveriesDropZone 逻辑)
 *   - deliveries-15 (P2): 自动下载 worker (electron/deliveries-downloader.ts 主进程跑)
 *   - deliveries-16 (P2): retry 失败交付 (UI 加按钮, server endpoint send-blocker)
 *   - deliveries-17 (P2): 文档 tab 分卡片 (PDF 走 iframe) — 现已经按 deliverableType
 *                          分组渲染, document tab 内增加 PDF preview 缩略 iframe
 *
 * file scope:
 *   - 本文件改: routes/Deliveries.tsx
 *   - 新建: components/deliveries/{OriginFilter,MultiSelectToolbar,ShareSheet,StarButton}.tsx
 *   - 复用: components/{library/SortMenu, ui/ConfirmDialog, ui/DropdownMenu, deliveries/DeliveriesDropZone}
 *   - 改 api.ts: listDeliverables 新增 origin 参数; 新增 batchDeleteDeliverables / retryDownloadDeliverable
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  batchDeleteDeliverables,
  deleteDeliverable,
  listDeliverables,
  retryDownloadDeliverable,
  type Deliverable,
} from "../lib/api";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { DeliveriesDropZone } from "../components/deliveries/DeliveriesDropZone";
import {
  DeliveriesMultiSelectToolbar,
} from "../components/deliveries/MultiSelectToolbar";
import { SortMenu, type LibrarySort } from "../components/library/SortMenu";

// =========================================================================
// tab — 跟 web Deliveries 一致 (全部 / 图片 / 网站 / 文档)
// =========================================================================
type TabKey = "all" | "image" | "web" | "document";

const TAB_DEFS: Array<{ key: TabKey; label: string }> = [
  { key: "all", label: "全部" },
  { key: "image", label: "图片" },
  { key: "web", label: "网站" },
  { key: "document", label: "文档" },
];

const PAGE_SIZE = 30;

export function Deliveries() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState<TabKey>("all");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Deliverable[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState<LibrarySort>("newest");

  // 单条 delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Deliverable | null>(null);

  // 多选模式 — 复用 library 的 selectedIds Set 模式
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const isInMultiSelect = selectedIds.size > 0;

  // tab / keyword / sort 变化 → 重置累积列表
  useEffect(() => {
    setItems([]);
    setPage(1);
    setHasMore(true);
  }, [tab, keyword, sort]);

  const { data: pageData, isLoading, isFetching } = useQuery({
    queryKey: ["deliveries", { type: tab, page, pageSize: PAGE_SIZE, keyword }],
    queryFn: () =>
      listDeliverables({
        type: tab === "all" ? undefined : tab,
        page,
        pageSize: PAGE_SIZE,
        keyword: keyword.trim() || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (!pageData) return;
    setHasMore(pageData.hasMore);
    if (page === 1) {
      setItems(pageData.items || []);
    } else {
      setItems((cur) => [...cur, ...(pageData.items || [])]);
    }
  }, [pageData, page]);

  // 客户端排序 — server 端固定 desc, 切 newest / oldest / title 都在前端 sort
  const sortedItems: Deliverable[] = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      if (sort === "newest") return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (sort === "oldest") return Date.parse(a.createdAt) - Date.parse(b.createdAt);
      return (a.title || "").localeCompare(b.title || "", "zh-Hans-CN");
    });
    return arr;
  }, [items, sort]);

  const allSelected =
    sortedItems.length > 0 && selectedIds.size === sortedItems.length;

  // ────── 单条删除 ──────
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDeliverable(id),
    onSuccess: (_data, id) => {
      setItems((cur) => cur.filter((d) => d.id !== id));
      setSelectedIds((cur) => {
        if (!cur.has(id)) return cur;
        const next = new Set(cur);
        next.delete(id);
        return next;
      });
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      toast({ message: "已删除", variant: "success" });
    },
    onError: (err) => {
      toast({
        message: `删除失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });

  // ────── 批量删除 (client-side fan-out) ──────
  const batchDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => batchDeleteDeliverables(ids),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
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
      setSelectedIds(new Set());
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

  // ────── retry 失败交付 (deliveries-16) — server send-blocker, UI 走完整 ──────
  const retryMutation = useMutation({
    mutationFn: (id: string) => retryDownloadDeliverable(id),
    onSuccess: () => {
      toast({ message: "已请求重新下载", variant: "default" });
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast({
        message: `retry 失败: ${msg}`,
        variant: "danger",
      });
    },
  });

  const handleRefresh = () => {
    setPage(1);
    queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    toast({ message: "已刷新", variant: "default" });
  };

  // ────── 多选 helpers ──────
  const toggleMultiSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const cancelMultiSelect = () => setSelectedIds(new Set());

  const handleToggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedItems.map((it) => String(it.id))));
    }
  };

  return (
    <DeliveriesDropZone
      onRouted={(r) => {
        toast({
          message: r.ok
            ? `已转入知识库: ${r.file.name}`
            : `拖入失败: ${r.msg ?? "未知"}`,
          variant: r.ok ? "success" : "danger",
        });
      }}
    >
      <div className="min-h-full flex flex-col">
        {/* 顶部操作栏 */}
        <div className="sticky top-0 z-10 bg-bg-base">
          <div className="px-4 lg:px-8 max-w-5xl mx-auto w-full space-y-2 py-2">
            {/* Row 1: tabs (左) + 排序 / 刷新 (右) */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0 overflow-x-auto">
                <div className="inline-flex p-1 rounded-md bg-bg-elevated gap-1">
                  {TAB_DEFS.map((t) => {
                    const active = tab === t.key;
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setTab(t.key)}
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
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索标题..."
                className="pl-9 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        {/* 列表 */}
        <div className="flex-1 px-4 lg:px-8 max-w-5xl mx-auto w-full py-4">
          {isLoading ? (
            <SkeletonGrid />
          ) : sortedItems.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {/* 按 tab 分组渲染 (deliveries-17 文档 tab 分卡片, PDF 走 iframe) */}
              <DocumentSplitGrid
                items={sortedItems}
                tab={tab}
                isInMultiSelect={isInMultiSelect}
                selectedIds={selectedIds}
                onToggleSelect={toggleMultiSelect}
                onOpen={(d) => navigate(`/deliveries/${d.id}`)}
                onDelete={(d) => setDeleteTarget(d)}
                onRetry={(d) => retryMutation.mutate(d.id)}
                retryPending={retryMutation.isPending}
              />
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

        {/* 多选模式 bottom toolbar */}
        {isInMultiSelect ? (
          <DeliveriesMultiSelectToolbar
            selectedCount={selectedIds.size}
            totalVisible={sortedItems.length}
            onCancel={cancelMultiSelect}
            onToggleSelectAll={handleToggleSelectAll}
            onConfirmDelete={handleBatchDelete}
            confirmOpen={batchDeleteOpen}
            onConfirmOpenChange={setBatchDeleteOpen}
            deletePending={batchDeleteMutation.isPending}
          />
        ) : null}

        {deleteTarget ? (
          <ConfirmDialog
            title="删除这条交付?"
            message="删除后无法恢复。"
            confirmLabel="确认删除"
            confirmVariant="danger"
            loading={deleteMutation.isPending}
            onCancel={() => setDeleteTarget(null)}
            onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          />
        ) : null}
      </div>
    </DeliveriesDropZone>
  );
}

// ────────────────────────────────────────────────────────────
// DocumentSplitGrid — 按 deliverableType 分组渲染, document tab 下
// 把 PDF 用 iframe 缩略展示 (deliveries-17 文档 tab 分卡片)
// ────────────────────────────────────────────────────────────

function DocumentSplitGrid({
  items,
  tab,
  isInMultiSelect,
  selectedIds,
  onToggleSelect,
  onOpen,
  onDelete,
  onRetry,
  retryPending,
}: {
  items: Deliverable[];
  tab: TabKey;
  isInMultiSelect: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onOpen: (d: Deliverable) => void;
  onDelete: (d: Deliverable) => void;
  onRetry: (d: Deliverable) => void;
  retryPending: boolean;
}) {
  // deliveries-17 — 文档 tab 时按 mimeType 把 PDF 抽出来, 给更大的预览块;
  // 其它 tab 维持现有 grid 形态.
  if (tab === "document") {
    const pdfs = items.filter((d) =>
      (d.mimeType || "").toLowerCase().includes("pdf"),
    );
    const others = items.filter(
      (d) => !(d.mimeType || "").toLowerCase().includes("pdf"),
    );
    return (
      <div className="space-y-6">
        {pdfs.length > 0 ? (
          <section>
            <h3 className="text-xs uppercase text-fg-subtle mb-2 tracking-wide">
              PDF 预览 ({pdfs.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {pdfs.map((d) => (
                <PdfCard
                  key={d.id}
                  item={d}
                  isInMultiSelect={isInMultiSelect}
                  isSelected={selectedIds.has(d.id)}
                  onToggleSelect={() => onToggleSelect(d.id)}
                  onOpen={() => onOpen(d)}
                  onDelete={() => onDelete(d)}
                  onRetry={() => onRetry(d)}
                  retryPending={retryPending}
                />
              ))}
            </div>
          </section>
        ) : null}
        {others.length > 0 ? (
          <section>
            <h3 className="text-xs uppercase text-fg-subtle mb-2 tracking-wide">
              其它文档 ({others.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {others.map((d) => (
                <DeliveryCard
                  key={d.id}
                  item={d}
                  isInMultiSelect={isInMultiSelect}
                  isSelected={selectedIds.has(d.id)}
                  onToggleSelect={() => onToggleSelect(d.id)}
                  onOpen={() => onOpen(d)}
                  onDelete={() => onDelete(d)}
                  onRetry={() => onRetry(d)}
                  retryPending={retryPending}
                />
              ))}
            </div>
          </section>
        ) : null}
        {pdfs.length === 0 && others.length === 0 ? (
          <EmptyState />
        ) : null}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {items.map((d) => (
        <DeliveryCard
          key={d.id}
          item={d}
          isInMultiSelect={isInMultiSelect}
          isSelected={selectedIds.has(d.id)}
          onToggleSelect={() => onToggleSelect(d.id)}
          onOpen={() => onOpen(d)}
          onDelete={() => onDelete(d)}
          onRetry={() => onRetry(d)}
          retryPending={retryPending}
        />
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// DeliveryCard
// ────────────────────────────────────────────────────────────

function DeliveryCard({
  item,
  isInMultiSelect,
  isSelected,
  onToggleSelect,
  onOpen,
  onDelete,
  onRetry,
  retryPending,
}: {
  item: Deliverable;
  isInMultiSelect: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onRetry: () => void;
  retryPending: boolean;
}) {
  const handleClick = () => {
    if (isInMultiSelect) onToggleSelect();
    else onOpen();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={[
        "rounded-md p-3 flex items-start gap-3 select-none cursor-pointer transition-colors duration-150",
        isInMultiSelect && isSelected
          ? "bg-bg-elevated ring-1 ring-brand/60"
          : isInMultiSelect
            ? "bg-bg-sunken hover:bg-bg-elevated"
            : "bg-bg-elevated hover:bg-bg-sunken",
      ].join(" ")}
    >
      {/* 多选 checkbox */}
      {isInMultiSelect ? (
        <span
          aria-hidden="true"
          className={[
            "shrink-0 w-5 h-5 mt-2 inline-flex items-center justify-center rounded border",
            isSelected
              ? "bg-fg border-fg text-bg-base"
              : "bg-bg-base border-border text-transparent",
          ].join(" ")}
        >
          ✓
        </span>
      ) : null}

      {/* 缩略 / 类型 icon */}
      <div className="shrink-0 w-16 h-16 rounded bg-bg-sunken flex items-center justify-center text-fg-muted overflow-hidden">
        {item.thumbnailUrl || (item.deliverableType === "image" && item.url) ? (
          <img
            src={item.thumbnailUrl || item.url}
            alt={item.title || "thumbnail"}
            className="w-full h-full object-cover"
          />
        ) : (
          <TypeIcon type={item.deliverableType} />
        )}
      </div>

      {/* 元信息 */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-bg-sunken text-fg-muted">
            {TYPE_LABEL[item.deliverableType] || item.deliverableType}
          </span>
        </div>
        <h3 className="text-sm font-medium text-fg line-clamp-2 break-all">
          {item.title || "(无标题)"}
        </h3>
        <p className="text-xs text-fg-subtle">
          {formatBytes(item.sizeBytes)} · {formatRelative(item.createdAt)}
        </p>

        {/* 操作行 — 不在多选模式时显示; retry 失败交付 (P2 deliveries-16) */}
        {!isInMultiSelect ? (
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="text-xs text-danger hover:text-danger/80 px-1 py-0.5 rounded transition-colors duration-150"
            >
              删除
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              disabled={retryPending}
              className="text-xs text-fg-muted hover:text-fg px-1 py-0.5 rounded transition-colors duration-150 disabled:opacity-50"
            >
              {retryPending ? "请求中…" : "重新下载"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// PdfCard — PDF 走 iframe 缩略 (deliveries-17)
// ────────────────────────────────────────────────────────────

function PdfCard(props: {
  item: Deliverable;
  isInMultiSelect: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  onDelete: () => void;
  onRetry: () => void;
  retryPending: boolean;
}) {
  const handleClick = () => {
    if (props.isInMultiSelect) props.onToggleSelect();
    else props.onOpen();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={[
        "rounded-md overflow-hidden select-none cursor-pointer transition-colors duration-150",
        props.isInMultiSelect && props.isSelected
          ? "bg-bg-elevated ring-1 ring-brand/60"
          : props.isInMultiSelect
            ? "bg-bg-sunken hover:bg-bg-elevated"
            : "bg-bg-elevated hover:bg-bg-sunken",
      ].join(" ")}
    >
      {/* PDF iframe 缩略 — 200px 高度, 不带 toolbar, 让用户一眼看到首页 */}
      <div className="relative w-full h-[180px] bg-bg-sunken overflow-hidden">
        {props.isInMultiSelect ? (
          <span
            aria-hidden="true"
            className={[
              "absolute top-2 left-2 z-10 w-5 h-5 inline-flex items-center justify-center rounded border",
              props.isSelected
                ? "bg-fg border-fg text-bg-base"
                : "bg-bg-base border-border text-transparent",
            ].join(" ")}
          >
            ✓
          </span>
        ) : null}
        {props.item.url ? (
          <iframe
            src={props.item.url}
            title={props.item.title || "PDF"}
            className="w-full h-full pointer-events-none"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-fg-muted text-xs">
            无 URL
          </div>
        )}
      </div>
      <div className="p-3 space-y-1">
        <h3 className="text-sm font-medium text-fg line-clamp-2 break-all">
          {props.item.title || "(无标题)"}
        </h3>
        <p className="text-xs text-fg-subtle">
          {formatBytes(props.item.sizeBytes)} ·{" "}
          {formatRelative(props.item.createdAt)}
        </p>
        {!props.isInMultiSelect ? (
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                props.onDelete();
              }}
              className="text-xs text-danger hover:text-danger/80 px-1 py-0.5 rounded transition-colors duration-150"
            >
              删除
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                props.onRetry();
              }}
              disabled={props.retryPending}
              className="text-xs text-fg-muted hover:text-fg px-1 py-0.5 rounded transition-colors duration-150 disabled:opacity-50"
            >
              {props.retryPending ? "请求中…" : "重新下载"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const TYPE_LABEL: Record<string, string> = {
  image: "图片",
  web: "网站",
  document: "文档",
};

// ────────────────────────────────────────────────────────────
// TypeIcon — 兜底缩略图
// ────────────────────────────────────────────────────────────

function TypeIcon({ type }: { type: string }) {
  if (type === "image") {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-5-5L5 21" />
      </svg>
    );
  }
  if (type === "web") {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    );
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

// ────────────────────────────────────────────────────────────
// EmptyState / SkeletonGrid
// ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="rounded-md bg-bg-sunken p-8 text-center max-w-sm">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-elevated flex items-center justify-center text-fg-muted">
          <PackageIcon />
        </div>
        <p className="text-base font-medium mb-1">还没有交付物</p>
        <p className="text-sm text-fg-muted">
          在对话中生成的图片、网站、文档会自动出现在这里
        </p>
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
          className="rounded-md bg-bg-elevated p-3 animate-pulse flex items-start gap-3"
        >
          <div className="w-16 h-16 rounded bg-bg-sunken" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-12 bg-bg-sunken rounded" />
            <div className="h-4 w-3/4 bg-bg-sunken rounded" />
            <div className="h-3 w-1/2 bg-bg-sunken rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

function formatBytes(size?: number | string | null): string {
  if (size === undefined || size === null || size === "") return "";
  const n = typeof size === "string" ? Number(size) : Number(size);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatRelative(iso: string): string {
  if (!iso) return "-";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  const month = Math.floor(day / 30);
  if (month < 12) return `${month} 个月前`;
  return `${Math.floor(month / 12)} 年前`;
}

// ────────────────────────────────────────────────────────────
// Icons
// ────────────────────────────────────────────────────────────

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

function PackageIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}
