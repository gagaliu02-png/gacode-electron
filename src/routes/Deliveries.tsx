/**
 * routes/Deliveries.tsx — 交付中心列表页
 *
 * 1:1 对齐 web `gacode-web/src/app/(main)/deliveries/page.tsx` (738 行 · 2026-10-26 逐行读).
 *
 * 本批口径 (产品负责人拍板): **web = 唯一事实源**。
 *   · web 有、PC 没有 → 补齐
 *       - tab 图标 (web:69-77 / 200-205)
 *       - 「搜索」折叠按钮 + 折叠式搜索框 (web:210-220 / 235-249)
 *       - 三型卡片 ImageCard / WebCard / DocumentCard (web:408-669)
 *       - 卡片 ⋮ 菜单 (web:685-714, 只含「删除」)
 *       - 文档 blob 下载 + 文件名策略 (web:581-601)
 *       - 「加载更多」纯文字按钮 (web:382-400) / 骨架屏 (web:719-738)
 *       - 空态卡片 + keyword 分支 (web:362-377) / 删除弹窗文案 (web:330-351)
 *   · PC 多出、web 没有 → 删 (对应服务端端点压根不存在, 点了必然 404)
 *       - SortMenu 排序菜单 (web 无排序)
 *       - 多选 + 批量删除底栏 (web 无多选)
 *       - PDF / 其它文档分组卡 (web 文档 tab 是统一 grid)
 *       - 卡片「重新下载」按钮 (web ⋮ 菜单只剩「删除」)
 *       - 详情页的「收藏」「分享到对话」(见 DeliveryDetail.tsx)
 *
 * 卡片点击行为 (web:421-425 / 500-504): 点卡片 = 在新标签打开交付物原链接,
 * **不是**进详情页。PC 用同一条 window.open —— Electron 主进程
 * `setWindowOpenHandler` (electron/main.ts:234-240) 会把 http(s) 交给系统默认浏览器,
 * 与 web 的 `window.open(url, "_blank")` 行为一致。
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  deleteDeliverable,
  listDeliverables,
  pickDeliverableDownloadName,
  type Deliverable,
} from "../lib/api";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Card, CardContent } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Tabs } from "../components/ui/Tabs";
import {
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  PackageOpenIcon,
  SearchIcon,
} from "../components/ui/Glyphs";
import { CardMenu } from "../components/deliveries/CardMenu";
import {
  ConstructionIcon,
  DownloadIcon,
  LayoutGridIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "../components/deliveries/Icons";

// =========================================================================
// tab — 跟 web 一致 (全部 / 图片 / 网站 / 文档)
//   web: gacode-web/src/app/(main)/deliveries/page.tsx:69-77 (TAB_DEFS)
//        + :198-207 (<Tabs><TabsList><TabsTrigger>)
//
// ⚠️ 图标的 `mr-1.5` 间距**不在这里写** —— 共享 <Tabs variant="underline">
//   的 icon 插槽自带 `mr-1.5` 外层容器 (Tabs.tsx:124), 跟 web 的
//   `<t.icon className="w-4 h-4 mr-1.5" />` 等价, 重复写会变成 12px.
// =========================================================================
type TabKey = "all" | "image" | "web" | "document";

const TAB_DEFS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
  { key: "all", label: "全部", icon: <LayoutGridIcon className="w-4 h-4" /> },
  { key: "image", label: "图片", icon: <ImageIcon className="w-4 h-4" /> },
  { key: "web", label: "网站", icon: <GlobeIcon className="w-4 h-4" /> },
  { key: "document", label: "文档", icon: <FileTextIcon className="w-4 h-4" /> },
];

const PAGE_SIZE = 30;

export function Deliveries() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState<TabKey>("all");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Deliverable[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [keyword, setKeyword] = useState("");
  // web 端搜索框默认收起 (web:111 `useState(false)`)
  const [showSearch, setShowSearch] = useState(false);
  // 删除二次确认的目标 (web:113)
  const [deleteTarget, setDeleteTarget] = useState<Deliverable | null>(null);

  // tab / keyword 变化 → 重置累积列表 (web:123-127)
  useEffect(() => {
    setItems([]);
    setPage(1);
    setHasMore(true);
  }, [tab, keyword]);

  const { data: pageData, isLoading, isFetching } = useQuery({
    // queryKey 跟 web 一致 (web:131) — 带 tab ("all" 也单独成一段) + 分页 + 关键词
    queryKey: ["deliverables", { type: tab, page, pageSize: PAGE_SIZE, keyword }],
    queryFn: () =>
      listDeliverables({
        // "全部" tab 不传 type, server 端跳过 where.deliverable_type 过滤 (web:136)
        type: tab === "all" ? undefined : tab,
        page,
        pageSize: PAGE_SIZE,
        keyword: keyword || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  // 分页累积 (web:171-179)
  useEffect(() => {
    if (!pageData) return;
    setHasMore(pageData.hasMore);
    if (page === 1) {
      setItems(pageData.items || []);
    } else {
      setItems((cur) => [...cur, ...(pageData.items || [])]);
    }
  }, [pageData, page]);

  // ────── 单条删除 (web:152-169) ──────
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDeliverable(id),
    onSuccess: (_data, id) => {
      // 从本地列表中立即移除, 不用等下一次 refetch (web:156)
      setItems((cur) => cur.filter((d) => d.id !== id));
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["deliverables"] });
      toast({ message: "已删除", variant: "success" });
    },
    onError: (err) => {
      // web 是两段式 toast (title + description) (web:162-168)
      toast({
        title: "删除失败",
        description: String((err as Error)?.message || err),
        variant: "danger",
      });
    },
  });

  const handleRefresh = () => {
    setPage(1);
    queryClient.invalidateQueries({ queryKey: ["deliverables"] });
    toast({ message: "已刷新", variant: "default" });
  };

  return (
    <div className="min-h-full flex flex-col">
      {/* 顶部操作栏: Row 1 = Tabs + 搜索/刷新 · Row 2 = 可展开搜索框
          (web:193-257 — sticky + 半透明底 + 模糊, 整体去线化) */}
      <div className="sticky top-0 z-20 bg-bg-base/95 backdrop-blur pt-2 pb-4">
        <div className="px-4 lg:px-8 max-w-5xl mx-auto w-full">
          <div className="flex items-center justify-between gap-2 py-2">
            <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none">
              {/* 共享 <Tabs variant="underline"> — 文字 + brand 下划线 + tab 图标
                  (web:198-207 的 <Tabs><TabsList><TabsTrigger> 等价物;
                   共享组件的 underline 变体已带 icon 插槽, Tabs.tsx:24-25 / :120-127) */}
              <Tabs
                variant="underline"
                tabs={TAB_DEFS.map((t) => ({ key: t.key, label: t.label, icon: t.icon }))}
                activeKey={tab}
                onChange={(k) => setTab(k as TabKey)}
              />
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setShowSearch((v) => !v)}
                aria-label="搜索"
                className={[
                  "shrink-0 w-9 h-9 rounded-full transition-colors duration-150",
                  "inline-flex items-center justify-center",
                  showSearch
                    ? "bg-bg-elevated text-fg"
                    : "text-fg-muted hover:bg-bg-elevated",
                ].join(" ")}
              >
                <SearchIcon className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleRefresh}
                aria-label="刷新"
                disabled={isFetching}
                className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors duration-150 inline-flex items-center justify-center disabled:opacity-50"
              >
                <RefreshCwIcon className={isFetching ? "w-5 h-5 animate-spin" : "w-5 h-5"} />
              </button>
            </div>
          </div>

          {/* Row 2: 可展开的搜索框 (web:235-249)
              ⚠️ PC Input base 含 rounded-md / px-4 py-3 / text-base / bg-bg-sunken /
                 border → 产物顺序里 .rounded-md 晚于 .rounded-full, 需 ! 前缀覆盖。 */}
          {showSearch ? (
            <div className="pt-2">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted pointer-events-none z-10" />
                <Input
                  type="search"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="搜索标题或域名..."
                  autoFocus
                  className="pl-9 !py-2 !text-sm bg-muted/50 border-0 focus:border-transparent !rounded-full focus-visible:ring-1 focus-visible:ring-brand"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* 列表区 (web:261 — py-2; PC 由 AppShell 的 main 承担滚动, 不再嵌套滚动容器) */}
      <div className="flex-1 px-4 lg:px-8 max-w-5xl mx-auto w-full py-2">
        {isLoading ? (
          <SkeletonGrid tab={tab} />
        ) : items.length === 0 ? (
          <EmptyState keyword={keyword} />
        ) : tab === "all" ? (
          <>
            {/* "全部" tab — 三型卡片混排 (web:266-284) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {items.map((item) =>
                item.deliverableType === "image" ? (
                  <ImageCard key={item.id} item={item} onDelete={setDeleteTarget} />
                ) : item.deliverableType === "web" ? (
                  <WebCard key={item.id} item={item} onDelete={setDeleteTarget} />
                ) : (
                  <DocumentCard key={item.id} item={item} onDelete={setDeleteTarget} />
                ),
              )}
            </div>
            {hasMore ? <LoadMore onLoad={() => setPage((p) => p + 1)} loading={isFetching} /> : null}
          </>
        ) : tab === "document" ? (
          <>
            {/* 文档 — 2 列网格 (web:285-298) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {items.map((item) => (
                <DocumentCard key={item.id} item={item} onDelete={setDeleteTarget} />
              ))}
            </div>
            {hasMore ? <LoadMore onLoad={() => setPage((p) => p + 1)} loading={isFetching} /> : null}
          </>
        ) : (
          <>
            {/* 图片 / 网站 — 2 列 grid (web:299-322) */}
            <div className="grid grid-cols-2 gap-4">
              {items.map((item) =>
                tab === "image" ? (
                  <ImageCard key={item.id} item={item} onDelete={setDeleteTarget} />
                ) : (
                  <WebCard key={item.id} item={item} onDelete={setDeleteTarget} />
                ),
              )}
            </div>
            {hasMore ? <LoadMore onLoad={() => setPage((p) => p + 1)} loading={isFetching} /> : null}
          </>
        )}
      </div>

      {/* 删除二次确认 (web:326-354) */}
      {deleteTarget ? (
        <ConfirmDialog
          title="确定删除该交付物？"
          message={`将从你的交付中心移除${
            deleteTarget.title ? `“${deleteTarget.title}”` : "这条记录"
          }。此操作不可撤销。`}
          confirmLabel={deleteMutation.isPending ? "删除中..." : "我确定"}
          cancelLabel="取消"
          confirmVariant="danger"
          loading={deleteMutation.isPending}
          loadingStyle="text-only"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        />
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// ImageCard — 1:1 方形缩略图 + 标题 + 「图片 · 时间」 (web:408-480)
// ────────────────────────────────────────────────────────────
function ImageCard({
  item,
  onDelete,
}: {
  item: Deliverable;
  onDelete: (item: Deliverable) => void;
}) {
  const time = formatDistanceToNow(new Date(item.createdAt), {
    addSuffix: true,
    locale: zhCN,
  });
  const src = item.thumbnailUrl || item.url;
  const [errored, setErrored] = useState(false);
  const open = () => {
    if (item.url && typeof window !== "undefined") {
      window.open(item.url, "_blank", "noopener,noreferrer");
    }
  };
  return (
    <div className="group relative block w-full text-left rounded-2xl shadow-sm bg-card hover:bg-muted/50 transition-colors duration-150 overflow-hidden">
      <button type="button" onClick={open} className="block w-full text-left">
        <div
          className="relative w-full bg-muted overflow-hidden"
          style={{ aspectRatio: "1 / 1" }}
        >
          {src && !errored ? (
            <img
              src={src}
              alt={item.title || item.prompt || "image"}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              onError={() => setErrored(true)}
            />
          ) : (
            // 缩略图 404/加载失败 — 只给占位 icon (web:449-455)
            <div className="absolute inset-0 flex items-center justify-center text-fg-muted p-2">
              <ImageIcon className="w-8 h-8" />
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="text-base font-medium truncate">
            {item.title || item.prompt || "未命名图片"}
          </div>
          <div className="text-xs text-fg-muted mt-1 flex items-center gap-1.5 truncate">
            <span className="text-fg-muted/70">图片</span>
            <span className="text-fg-muted/40">·</span>
            <span className="truncate">{time}</span>
          </div>
        </div>
      </button>
      {/* ⋮ 菜单 — 绝对定位右上, 不进入卡片 button 子树 (web:475-477) */}
      <div className="absolute top-1.5 right-1.5 z-10">
        <CardMenu item={item} onDelete={onDelete} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// WebCard — 16:9 缩略图 + 标题 + 「网站 · 域名 · 时间」 (web:487-559)
// ────────────────────────────────────────────────────────────
function WebCard({
  item,
  onDelete,
}: {
  item: Deliverable;
  onDelete: (item: Deliverable) => void;
}) {
  const time = formatDistanceToNow(new Date(item.createdAt), {
    addSuffix: true,
    locale: zhCN,
  });
  const domain = deriveDomain(item.url);
  const [errored, setErrored] = useState(false);
  const open = () => {
    if (item.url && typeof window !== "undefined") {
      window.open(item.url, "_blank", "noopener,noreferrer");
    }
  };
  return (
    <div className="group relative block w-full text-left rounded-2xl shadow-sm bg-card hover:bg-muted/50 transition-colors duration-150 overflow-hidden">
      <button type="button" onClick={open} className="block w-full text-left">
        <div
          className="relative w-full bg-muted overflow-hidden"
          style={{ aspectRatio: "16 / 9" }}
        >
          {item.thumbnailUrl && !errored ? (
            <img
              src={item.thumbnailUrl}
              alt={item.title || domain}
              className="absolute inset-0 w-full h-full object-cover"
              loading="lazy"
              onError={() => setErrored(true)}
            />
          ) : (
            // 无缩略图 — 渐变 + Globe 占位 (web:530-532)
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-container to-muted text-fg-muted">
              <GlobeIcon className="w-10 h-10" />
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="text-base font-medium truncate">
            {item.title || domain || "未命名网页"}
          </div>
          <div className="text-xs text-fg-muted mt-1 flex items-center gap-1.5 truncate">
            <span className="text-fg-muted/70">网站</span>
            {domain ? (
              <>
                <span className="text-fg-muted/40">·</span>
                <span className="truncate">{domain}</span>
              </>
            ) : null}
            <span className="text-fg-muted/40">·</span>
            <span className="truncate">{time}</span>
          </div>
        </div>
      </button>
      <div className="absolute top-1.5 right-1.5 z-10">
        <CardMenu item={item} onDelete={onDelete} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// DocumentCard — 文件图标 + 标题 + 「文档 · mime · 大小」+ 时间 + 下载 + ⋮ (web:567-669)
// ────────────────────────────────────────────────────────────
function DocumentCard({
  item,
  onDelete,
}: {
  item: Deliverable;
  onDelete: (item: Deliverable) => void;
}) {
  const [busy, setBusy] = useState(false);
  const time = formatDistanceToNow(new Date(item.createdAt), {
    addSuffix: true,
    locale: zhCN,
  });
  const sizeStr = formatBytes(item.sizeBytes);

  const download = async () => {
    if (!item.url) return;
    setBusy(true);
    try {
      const res = await fetch(item.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = pickDeliverableDownloadName(item, "file");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error("download failed", err);
      // PC 兜底: 渲染层是 file:// origin, 外链交付物 (模型 CDN) 没有 CORS 头 →
      // fetch 必失败 → 退回「系统默认浏览器打开直链」, 服务端 Content-Disposition
      // 里就是正确的展示名 (web 端同源所以不需要这层兜底)。
      if (item.url) {
        window.open(item.url, "_blank", "noopener,noreferrer");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl shadow-sm bg-card hover:bg-muted/50 transition-colors duration-150 p-4">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={download}
          disabled={busy || !item.url}
          className="shrink-0 w-10 h-10 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/70 transition-colors"
          aria-label="下载文档"
        >
          {busy ? (
            <Loader2Icon className="w-5 h-5 text-brand-yellow animate-spin" />
          ) : (
            <FileTextIcon className="w-5 h-5 text-brand-yellow" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-base font-medium truncate">
            {item.title || "未命名文档"}
          </div>
          <div className="text-xs text-fg-muted mt-1 flex items-center gap-1.5 flex-wrap">
            <span className="text-fg-muted/70">文档</span>
            {item.mimeType ? (
              <>
                <span className="text-fg-muted/40">·</span>
                <span className="text-fg-muted/70">{item.mimeType}</span>
              </>
            ) : null}
            {sizeStr ? (
              <>
                <span className="text-fg-muted/40">·</span>
                <span>{sizeStr}</span>
              </>
            ) : null}
          </div>
          <div className="text-xs text-fg-muted/70 mt-1">{time}</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={download}
          disabled={busy || !item.url}
          aria-label="下载"
          className="shrink-0 !w-9 !h-9 !p-0 rounded-full text-fg-muted hover:bg-muted transition-colors duration-150"
        >
          {busy ? (
            <Loader2Icon className="w-4 h-4 animate-spin" />
          ) : (
            <DownloadIcon className="w-4 h-4" />
          )}
        </Button>
        {/* ⋮ 菜单 — inline 放在 flex row 末尾, 跟下载按钮并列 (web:662-665) */}
        <CardMenu item={item} onDelete={onDelete} />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// EmptyState — web:362-377
// ⚠️ PC Card base 含 border + shadow, 而 PC tailwind.config.ts 的 boxShadow
//    顺序是 none 在前 / DEFAULT(shadow) 在后 ⇒ `.shadow` 会赢 `.shadow-none`,
//    故这里必须用 `!shadow-none` 强制覆盖。
// ────────────────────────────────────────────────────────────
function EmptyState({ keyword }: { keyword?: string }) {
  return (
    <Card className="border-0 !shadow-none bg-card rounded-2xl">
      <CardContent className="p-10 text-center text-fg-muted">
        <ConstructionIcon className="w-12 h-12 mx-auto text-fg-muted mb-4" />
        <div className="text-base font-medium mb-1 text-fg">暂无交付物</div>
        <div className="text-sm">
          {keyword
            ? `未找到包含 "${keyword}" 的交付物`
            : "AI 生成的图片 / 网站 / 文档将自动汇总到这里"}
        </div>
      </CardContent>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────
// LoadMore — 通用加载更多按钮 (web:382-400)
// ────────────────────────────────────────────────────────────
function LoadMore({ onLoad, loading }: { onLoad: () => void; loading: boolean }) {
  return (
    <div className="py-4 text-center">
      <button
        type="button"
        onClick={onLoad}
        disabled={loading}
        className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg disabled:opacity-50 transition-colors duration-150"
      >
        {loading ? (
          <Loader2Icon className="w-4 h-4 animate-spin" />
        ) : (
          <PackageOpenIcon className="w-4 h-4" />
        )}
        加载更多
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// SkeletonGrid — web:719-738 (web 的 Skeleton 组件自带 animate-pulse + bg-muted)
// ────────────────────────────────────────────────────────────
function SkeletonGrid({ tab }: { tab: TabKey }) {
  if (tab === "document") {
    return (
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 w-full rounded-2xl bg-card animate-pulse" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="w-full rounded-2xl bg-card animate-pulse"
          style={{ aspectRatio: "1 / 1" }}
        />
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

/** 从 url 派生域名 — web:94-101 */
function deriveDomain(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** 字节数格式化 — web:84-92 */
function formatBytes(size?: number | string): string {
  if (size === undefined || size === null || size === "") return "";
  const n = typeof size === "string" ? Number(size) : Number(size);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
