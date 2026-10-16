/**
 * routes/Deliveries.tsx — 阶段 3 交付中心列表
 *
 * 数据: useQuery(["deliveries", { type, page }], listDeliverables)
 * 端点: GET /yinian/deliverables?type=&page=&pageSize= — server 端
 *   deliverables.routes.js, type enum = ['image','web','document']. 返回
 *   { items: Deliverable[], total, hasMore }.
 *
 * 功能:
 *   - 顶部 tab (全部 / 图片 / 网站 / 文档) + 搜索 + 刷新
 *   - 列表 grid (1 / 2 列响应式, 跟 web 对齐)
 *   - 卡片显示: 缩略图 / title / 来源 (AI 生成 vs 用户上传) / size / updatedAt
 *   - 卡片点击 → nav('/deliveries/:id') (DeliveryDetail 接管)
 *   - 行菜单 ⋮ → 删除 (AlertDialog)
 *   - 空态: "还没有交付物" + 提示
 *   - 分页: 加载更多按钮
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteDeliverable,
  listDeliverables,
  type Deliverable,
} from "../lib/api";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";

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

  // delete confirm
  const [deleteTarget, setDeleteTarget] = useState<Deliverable | null>(null);

  // tab / keyword 变化 → 重置累积列表
  useEffect(() => {
    setItems([]);
    setPage(1);
    setHasMore(true);
  }, [tab, keyword]);

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

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDeliverable(id),
    onSuccess: (_data, id) => {
      setItems((cur) => cur.filter((d) => d.id !== id));
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

  const handleRefresh = () => {
    setPage(1);
    queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    toast({ message: "已刷新", variant: "default" });
  };

  return (
    <div className="min-h-full flex flex-col">
      {/* 顶部操作栏 */}
      <div className="sticky top-0 z-10 bg-bg-base border-b border-border">
        <div className="px-4 lg:px-8 max-w-5xl mx-auto w-full space-y-2 py-2">
          {/* Row 1: tabs (左) + 刷新 (右) */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0 overflow-x-auto">
              <div className="inline-flex p-1 rounded-md bg-bg-elevated border border-border gap-1">
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
        ) : items.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {items.map((d) => (
                <DeliveryCard
                  key={d.id}
                  item={d}
                  onOpen={() => navigate(`/deliveries/${d.id}`)}
                  onDelete={() => setDeleteTarget(d)}
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
  );
}

// ────────────────────────────────────────────────────────────
// DeliveryCard
// ────────────────────────────────────────────────────────────

function DeliveryCard({
  item,
  onOpen,
  onDelete,
}: {
  item: Deliverable;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-md bg-bg-elevated border border-border p-3 hover:bg-bg-sunken transition-colors duration-150">
      <button
        type="button"
        onClick={onOpen}
        className="text-left w-full flex items-start gap-3"
      >
        {/* 缩略 / 类型 icon */}
        <div className="shrink-0 w-16 h-16 rounded bg-bg-sunken border border-border flex items-center justify-center text-fg-muted overflow-hidden">
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
            <span className="text-xs px-1.5 py-0.5 rounded bg-bg-sunken border border-border text-fg-muted">
              {TYPE_LABEL[item.deliverableType] || item.deliverableType}
            </span>
            {item.origin === "user_uploaded" ? (
              <span className="text-xs text-fg-subtle">用户上传</span>
            ) : (
              <span className="text-xs text-fg-subtle">AI 生成</span>
            )}
          </div>
          <h3 className="text-sm font-medium text-fg line-clamp-2 break-all">
            {item.title || "(无标题)"}
          </h3>
          <p className="text-xs text-fg-subtle">
            {formatBytes(item.sizeBytes)} · {formatRelative(item.createdAt)}
          </p>
        </div>
      </button>

      <div className="mt-2 flex items-center justify-end">
        <button
          type="button"
          onClick={onDelete}
          className="text-xs text-danger hover:text-danger/80 px-2 py-1 rounded transition-colors duration-150"
        >
          删除
        </button>
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
      <div className="rounded-md border border-border bg-bg-sunken p-8 text-center max-w-sm">
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
          className="rounded-md bg-bg-elevated border border-border p-3 animate-pulse flex items-start gap-3"
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
