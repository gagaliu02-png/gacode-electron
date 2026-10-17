/**
 * routes/Library.tsx — 阶段 3 知识库列表
 *
 * 数据: useQuery(["library", { type, page }], listLibrary)
 * 端点: GET /yinian/library?type=&page=&pageSize= — server 端返回
 *   { items: LibraryItem[], total, hasMore }. type enum = ['image','file'] (DB
 *   modality), 跟 web 端 LibraryItem.type 枚举 ('image'|'doc'|'link') 不同.
 *   这里把 web 的 'doc' / 'link' 都映射回 'file' 查 server, 客户端再展示 web 侧
 *   的图标 + 文案. 不改 server schema, 单边 hack.
 *
 * 功能:
 *   - 顶部搜索 + 类型 chip (全部 / 图片 / 文档 / 链接) + 刷新
 *   - 列表 grid (1 / 2 列响应式), 卡片显示 title / 类型图标 / updatedAt / id
 *   - 卡片点击 → nav('/library/:id') (LibraryDetail 接管)
 *   - 空态: "还没有知识库" + 提示 (阶段 3 不做采集入口, 见 brief)
 *   - 分页: 加载更多按钮 (hasMore 翻页)
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  listLibrary,
  type LibraryItem,
} from "../lib/api";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { LibraryDropZone } from "../components/library/LibraryDropZone";
import { useToast } from "../components/ui/Toast";

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
  const [type, setType] = useState<TypeFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);

  // 把 web 的 'doc' / 'link' 映射回 server 的 modality 'file' — server 端
  // /yinian/library 只接受 ['text','image','audio','video','file']. web 端
  // LibraryItem.type 'doc'/'link' 都是 modality 'file' 的子集, 单边 query 时
  // type='file' 拿全量, 客户端再按 type 二次过滤.
  const serverType = useMemo<string | undefined>(() => {
    if (type === "all") return undefined;
    return "file";
  }, [type]);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["library", { type, page }],
    queryFn: () =>
      listLibrary({
        type: serverType,
        page,
        pageSize: PAGE_SIZE,
        keyword: keyword.trim() || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  const allItems: LibraryItem[] = useMemo(() => {
    const raw = data?.items ?? [];
    if (type === "all") return raw;
    return raw.filter((it) => it.type === type);
  }, [data?.items, type]);

  const hasMore = data?.hasMore ?? false;

  const handleRefresh = () => {
    setPage(1);
    refetch();
  };

  return (
    <LibraryDropZone
      onResult={(r) => {
        if (r.ok) {
          toast({
            message: `已入库: ${r.file.name}`,
            variant: "success",
          });
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
        <div className="sticky top-0 z-10 bg-bg-base border-b border-border">
        <div className="px-4 lg:px-8 max-w-5xl mx-auto w-full space-y-2 py-2">
          {/* Row 1: 类型 chip (左) + 刷新按钮 (右) */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0 overflow-x-auto">
              <div className="inline-flex p-1 rounded-md bg-bg-elevated border border-border gap-1">
                {TYPE_CHIPS.map((t) => {
                  const active = type === t.key;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => {
                        setType(t.key);
                        setPage(1);
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
              onChange={(e) => {
                setKeyword(e.target.value);
                setPage(1);
              }}
              placeholder="搜索标题..."
              className="pl-9 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      {/* 列表区 */}
      <div className="flex-1 px-4 lg:px-8 max-w-5xl mx-auto w-full py-4">
        {isLoading ? (
          <SkeletonGrid />
        ) : allItems.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {allItems.map((it) => (
                <LibraryCard
                  key={it.id}
                  item={it}
                  onClick={() => navigate(`/library/${it.id}`)}
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
    </LibraryDropZone>
  );
}

// ────────────────────────────────────────────────────────────
// LibraryCard — 知识库单条卡片
// ────────────────────────────────────────────────────────────

function LibraryCard({
  item,
  onClick,
}: {
  item: LibraryItem;
  onClick: () => void;
}) {
  const Icon =
    item.type === "image" ? ImageIcon :
    item.type === "doc" ? FileTextIcon :
    item.type === "link" ? LinkIcon :
    TextIcon;

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-md bg-bg-elevated border border-border p-4 hover:bg-bg-sunken transition-colors duration-150"
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-9 h-9 rounded bg-bg-sunken border border-border flex items-center justify-center text-fg-muted">
          <Icon />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs px-1.5 py-0.5 rounded bg-bg-sunken border border-border text-fg-muted">
              {TYPE_LABEL[item.type] || item.type}
            </span>
            <span className="text-xs text-fg-subtle font-mono truncate">
              #{item.id}
            </span>
          </div>
          <h3 className="text-sm font-medium text-fg line-clamp-2 break-all">
            {item.title || "(无标题)"}
          </h3>
          <p className="text-xs text-fg-subtle">
            {formatRelative(item.createdAt)}
          </p>
        </div>
      </div>
    </button>
  );
}

const TYPE_LABEL: Record<string, string> = {
  image: "图片",
  doc: "文档",
  link: "链接",
  text: "文本",
};

// ────────────────────────────────────────────────────────────
// EmptyState — 无数据
// ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="rounded-md border border-border bg-bg-sunken p-8 text-center max-w-sm">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-elevated flex items-center justify-center text-fg-muted">
          <LibraryIcon />
        </div>
        <p className="text-base font-medium mb-1">还没有知识库</p>
        <p className="text-sm text-fg-muted">
          在对话中采集内容,会自动入库
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
          className="rounded-md bg-bg-elevated border border-border p-4 animate-pulse"
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
// 时间格式化 — 简单相对时间 (避免引 date-fns)
// ────────────────────────────────────────────────────────────

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

function ImageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function FileTextIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function TextIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

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
