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
 * PC-6 (2026-10-20 gagaOS 拍板): Library 定稿页 — 七项对齐 web
 *   1. Tabs: pill → underline (用 <Tabs variant="underline">)
 *   2. 搜索框: 常驻 → 折叠圆药丸 (showSearch toggle)
 *   3. 卡片: grid 两列 → space-y-3 单列行列表
 *   4. 圆角: rounded-md → rounded-2xl (在 LibraryCard 组件内改)
 *   5. 容器宽度: max-w-5xl → max-w-3xl (对齐 web)
 *   6. 空态: bg-bg-sunken 圆角小卡 → 居中 icon + 标题 + 副文案 + 行动 (border + bg-bg-elevated)
 *   7. FAB: 缺则补 fixed bottom-right + (对齐 web L568)
 *
 * 2026-10-26 · 逐 page 1:1 还原 web (web = 唯一事实源, PC 多出 web 没有的直接删):
 *   - L-06: 搜索按钮图标 16px → 20px (web library/page.tsx:455 `w-5 h-5`)
 *   - L-14: tab 集合改成 web 的 全部/文本/图片/文档, **serverType 按 tab 分别传**
 *           (服务端 type 参数过滤的是 modality — library.routes.js:288),
 *           客户端**不再二次过滤** (server 已过滤, web 同款)
 *   - L-15: tab 带图标 (LayoutGrid / Type / Image / FileText, w-4 h-4)
 *   - L-17: 空态卡改 web 形态 (border-0 + bg-card + rounded-2xl + p-10, 去 max-w-sm / 去垂直居中)
 *   - L-18: 空态图标 LibraryIcon → lucide Construction
 *   - L-23: 「加载更多」改纯文字按钮 (web library/page.tsx:552-568)
 *   - L-13: 刷新时先清空列表再拉 (web library/page.tsx:224-229 setItems([]))
 *   - L-27: ErrorBoundary 包裹列表页 (web library/page.tsx:130-136)
 *   - L-28: 多选时全局标题显示「已选 N 项」(AppShell 页面级标题覆写)
 *   - L-51/L-74/L-75: 删除确认弹窗标题 / 描述逗号 / pending 态 (spinner-only)
 *   - 口径: 删掉 web 没有的 PC 多余项 —— 顶部「+ 新建」按钮 / SortMenu 排序 /
 *           TagFilter 标签过滤行 / 空态里的「+ 新建条目」按钮
 *
 * 2026-10-26 · 组件意识收编 (icon 重复实现 → 共享 Glyphs.tsx):
 *   - 本地内联 svg 里 4 个与共享 Glyphs 逐字同款的收编走共享导出:
 *     layout-grid → LayoutGridIcon / construction → ConstructionIcon /
 *     loader-2 → LoaderCircleIcon / search → SearchFieldIcon
 *   - 图标形状对齐 web (2026-10-26 第二批): 本地剩下 2 个也收编走共享导出 ——
 *     FabPlusIcon (手写 `<line>` + sw2.2) → PlusIcon (lucide `plus`, 22px / sw2.2,
 *       对齐 web `components/common/CreateFab.tsx:54` 的
 *       `<Plus className="w-[22px] h-[22px]" strokeWidth={2.2} />`) /
 *     RefreshIcon (末条 `M3 21v-5h5` ≠ lucide `M8 16H3v5`) → RefreshCwIcon
 *       (对齐 web `library/page.tsx:464` 的 `<RefreshCw className="w-5 h-5" />`)
 *     ⇒ 本文件的本地图标清零。
 *   - 圆药丸搜索按钮改用共享的**裸**版 <SearchBareIcon> ⇒ 去掉 5 个
 *     `!important` 类 (PC 无 tailwind-merge, `!` 硬压是脆的)。
 *   - 清理 3 处 `["library-tags"]` invalidate (CollectSheet ×2 / EditSheet ×1) ——
 *     TagFilter 已删 ⇒ 该 queryKey 在 src/** 里已无任何 query 定义 ⇒ invalidate 是 no-op
 *
 * 2026-10-27 · B3 日程中心批次:
 *   - 底部 FAB 的内联 <button> 换成共享 <CreateFab>
 *     (web `components/common/CreateFab.tsx` 逐字搬运; PC 之前没有 common/ 目录 ⇒ 新建)
 *     ⇒ FAB 视觉参数一字不变, 但跟日程中心入口页共用同一个组件 (组件意识: 别再写第三遍)。
 *   - `PlusIcon` 的 import 随之删除 (本文件只有那个内联 FAB 在用它)。
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  batchDeleteLibraryItems,
  deleteLibraryItem,
  listLibrary,
  type LibraryItem,
} from "../lib/api";
import { Input } from "../components/ui/Input";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { useToast } from "../components/ui/Toast";
import { Tabs } from "../components/ui/Tabs";
import { CreateFab } from "../components/common/CreateFab";
import {
  ConstructionIcon,
  FileTextIcon as FileTextTabIcon,
  ImageIcon as ImageTabIcon,
  LayoutGridIcon,
  LibraryTypeIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SearchBareIcon,
  SearchFieldIcon,
  TypeIcon as TypeTabIcon,
} from "../components/ui/Glyphs";
import { useHeaderTitle } from "../components/layout/AppShell";
import { LibraryDropZone } from "../components/library/LibraryDropZone";
import { LibraryCard } from "../components/library/LibraryCard";
import { CollectSheet } from "../components/library/CollectSheet";
import { EditSheet } from "../components/library/EditSheet";
import { MultiSelectToolbar } from "../components/library/MultiSelectToolbar";

// =========================================================================
// 类型 tab — 对齐 web `library/page.tsx:106-115` (L-14 / L-15)
//
//   web 的 4 个 tab: 全部 / 文本 / 图片 / 文档
//   ⚠️ tab 的 value 是**服务端 modality 枚举名** (text / image / file), 不是 web DTO
//      里的 `type` (image|doc|link) —— 服务端 list 的 type 参数过滤的是 **modality**
//      (`unified-api/src/modules/yinian/library.routes.js:288` `if (type) where.modality = type`).
//      PC 之前只要不是 all 就固定传 "file" ⇒ 「图片」「链接」两个 tab 恒空 (真 bug).
// =========================================================================
type TypeFilter = "all" | "text" | "image" | "file";

const TYPE_TABS: Array<{
  key: TypeFilter;
  label: string;
  icon: ReactNode;
  /** 传给服务端的 modality; undefined = 不过滤 */
  serverType: string | undefined;
}> = [
  { key: "all", label: "全部", icon: <LayoutGridIcon size={16} className="w-4 h-4" />, serverType: undefined },
  { key: "text", label: "文本", icon: <TypeTabIcon size={16} className="w-4 h-4" />, serverType: "text" },
  { key: "image", label: "图片", icon: <ImageTabIcon size={16} className="w-4 h-4" />, serverType: "image" },
  { key: "file", label: "文档", icon: <FileTextTabIcon size={16} className="w-4 h-4" />, serverType: "file" },
];

const PAGE_SIZE = 30;

/**
 * 列表页 — 外层套 ErrorBoundary (L-27, 对齐 web library/page.tsx:130-136)
 */
export function Library() {
  return (
    <ErrorBoundary title="知识库加载失败" description="请刷新重试,或稍后再试一次">
      <LibraryInner />
    </ErrorBoundary>
  );
}

function LibraryInner() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const headerTitleApi = useHeaderTitle();

  const [type, setType] = useState<TypeFilter>("all");
  const [keyword, setKeyword] = useState("");
  // PC-6: 搜索框折叠 toggle — 默认收起, 跟 web Library (L138 showSearch=false) 一致
  const [showSearch, setShowSearch] = useState(false);
  const [page, setPage] = useState(1);

  /** 累积的列表项 — web 端用 setItems 累加分页结果, PC 需自持一份 */
  const [items, setItems] = useState<LibraryItem[]>([]);
  /** 已消费过的 data 快照 — placeholderData 回填上一页时避免同一页被累加两次 */
  const consumedDataRef = useRef<Awaited<ReturnType<typeof listLibrary>> | null>(null);

  // 采集 Sheet
  const [collectOpen, setCollectOpen] = useState(false);

  // 编辑 Sheet
  const [editingItem, setEditingItem] = useState<LibraryItem | null>(null);

  // 多选模式
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const isInMultiSelect = selectedIds.size > 0;

  // 单条删除 (从行上下文菜单触发)
  const [pendingSingleDelete, setPendingSingleDelete] = useState<LibraryItem | null>(null);

  // L-14: serverType 按 tab 分别传 (之前只要不是 all 就固定 "file" ⇒ 图片/链接 tab 恒空)
  const serverType = useMemo(
    () => TYPE_TABS.find((t) => t.key === type)?.serverType,
    [type],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["library", { type, keyword, page }],
    queryFn: () =>
      listLibrary({
        type: serverType,
        page,
        pageSize: PAGE_SIZE,
        keyword: keyword.trim() || undefined,
      }),
    placeholderData: (prev) => prev,
  });

  // web 端 setItems 累积语义: 第 1 页替换, 第 2 页起追加
  useEffect(() => {
    if (!data) return;
    // 拉取中不消费 — placeholderData 会把上一页的 data 回填进来
    //   (点「加载更多」/ 切 tab 时), 这时消费会把同一页累加两次.
    if (isFetching) return;
    // placeholderData 回填上一页数据时 data 引用不变 → 跳过, 避免同一页被累加两次
    if (consumedDataRef.current === data) return;
    consumedDataRef.current = data;
    if (page === 1) {
      setItems(data.items ?? []);
    } else {
      setItems((cur) => [...cur, ...(data.items ?? [])]);
    }
  }, [data, page, isFetching]);

  // 服务端重过滤后, 剔除已不存在的选中 id (web 端同款)
  // ⚠️ L-25 收尾 (2026-10-26): 必须用**累积**的 items 裁剪, 不能用 data.items (当前页) ——
  //   PC 列表是累积的 (点「加载更多」会追加第 2 页), 用当前页会把第 1 页的选中清掉。
  useEffect(() => {
    const nextIds = new Set(items.map((it) => String(it.id)));
    setSelectedIds((cur) => {
      if (cur.size === 0) return cur;
      const filtered = new Set<string>();
      cur.forEach((id) => { if (nextIds.has(id)) filtered.add(id); });
      return filtered;
    });
  }, [items]);

  // L-14: 客户端**不再二次过滤** —— 服务端已按 modality 过滤 (web 同款:
  //   `const filteredItems = items;` — web library/page.tsx:221).
  //   ⚠️ PC 的 DTO `type` 值域只有 image|doc|link (服务端把 modality=text 映射成 link),
  //      客户端再按 `it.type === type` 过滤会把「文本」tab 的行全杀光.
  const filteredItems: LibraryItem[] = items;

  const hasMore = data?.hasMore ?? false;

  // L-28: 多选时把计数同步到全局顶栏 (web library/page.tsx:166-169 setHeaderTitle)
  useEffect(() => {
    if (!headerTitleApi) return;
    headerTitleApi.setHeaderTitle(isInMultiSelect ? `已选 ${selectedIds.size} 项` : "知识库");
    return () => headerTitleApi.setHeaderTitle(null);
  }, [headerTitleApi, isInMultiSelect, selectedIds.size]);

  const handleRefresh = () => {
    setPage(1);
    // L-13: 刷新时先清空列表再拉 (web library/page.tsx:224-229 —
    //   setPage(1) → setItems([]) → invalidateQueries → toast)
    setItems([]);
    // ⚠️ 清空后必须让「刷新回来的同一份 data」能重新入列 ——
    //   react-query 的结构共享 (structuralSharing) 会把「内容没变」的响应
    //   复用成**同一个 data 引用** ⇒ consumedDataRef 守卫会当成重复消费跳过,
    //   结果列表清空后不回来 (空白列表). ⇒ 这里重置守卫, 由累积 effect 的
    //   isFetching 依赖触发重跑 (拉取中不消费, 拉完再消费).
    consumedDataRef.current = null;
    queryClient.invalidateQueries({ queryKey: ["library"] });
    toast({ message: "已刷新", variant: "default" });
  };

  // ────── 切 type/keyword → 重置分页 + 退出多选 ──────
  const resetFilters = () => {
    setPage(1);
    setItems([]);
    setSelectedIds(new Set());
    // ⚠️ 清空后必须重置守卫 (照抄 web library/page.tsx:190-193):
    //   react-query 的结构共享 (structuralSharing) 会把「内容没变」的响应
    //   复用成**同一个 data 引用** ⇒ consumedDataRef 守卫会当成重复消费跳过,
    //   结果列表清空后不回来 (空白列表).
    //   当前切 tab/keyword 会换 queryKey ⇒ 新 cache entry ⇒ 新 data 引用 ⇒ 暂不可观测;
    //   但将来 queryKey 若复用同一 entry, 就会出「清空后空白列表」⇒ 先堵上.
    consumedDataRef.current = null;
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
        <div className="sticky top-0 z-20 bg-bg-base/95 backdrop-blur pt-2 pb-4">
          {/* PC-6: 容器宽度对齐 web (max-w-3xl) — 跟 web L421/481/493 一致 */}
          <div className="px-4 lg:px-8 max-w-3xl mx-auto w-full space-y-2">
            {/* Row 1: Tabs (左, 下划线变体 — 对齐 web) + 搜索 + 刷新 (右)
                口径: web 顶栏只有 Tabs + 搜索 + 刷新 ⇒ PC 多出的「+ 新建」按钮 /
                      SortMenu 排序菜单 / TagFilter 标签行 已删 */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none">
                {/* PC-6: 改用 <Tabs variant="underline"> — 文字 + brand 下划线
                     替代旧的实心橙药丸 (item 1). web Library L424-432 同款.
                     L-15: tab 带图标 (icon 插槽, Tabs.tsx 新增). */}
                <Tabs
                  variant="underline"
                  tabs={TYPE_TABS.map((t) => ({ key: t.key, label: t.label, icon: t.icon }))}
                  activeKey={type}
                  onChange={(k) => {
                    setType(k as TypeFilter);
                    resetFilters();
                  }}
                />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* PC-6: 搜索按钮 toggle — 跟 web Library L437-445 同款圆药丸 icon 按钮
                    L-06: 图标 16px → 20px (web `w-5 h-5`) */}
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
                  {/* lucide `search` (20px / sw2) — 复用共享 Glyphs 的裸版 <SearchBareIcon>
                      (path 与 web `library/page.tsx:455` 的 lucide Search 逐字相同:
                       circle 11,11 r8 + `m21 21-4.3-4.3`)。
                      ⚠️ 用「裸」版而不是 `SearchFieldIcon`: 后者内联了输入框前缀
                      专用的定位/尺寸/颜色类 (absolute left-3 top-1/2 -translate-y-1/2
                      w-4 h-4 text-fg-muted) ⇒ 在这个圆药丸按钮里只能靠 5 个
                      `!important` 类硬压 (PC 无 tailwind-merge ⇒ 脆)。
                      裸版 className 原样透传 ⇒ 调用点只写自己需要的尺寸/颜色。 */}
                  <SearchBareIcon className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={handleRefresh}
                  aria-label="刷新"
                  disabled={isFetching}
                  className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors duration-150 inline-flex items-center justify-center disabled:opacity-50"
                >
                  {/* lucide `refresh-cw` (20px / sw2) — 共享 <RefreshCwIcon>
                      (web `library/page.tsx:464` 的 <RefreshCw className="w-5 h-5" /> 同款) */}
                  <RefreshCwIcon
                    className={["w-5 h-5", isFetching ? "animate-spin" : ""].filter(Boolean).join(" ")}
                  />
                </button>
              </div>
            </div>

            {/* Row 2: 搜索框 (折叠) — showSearch=true 时展开, 默认收起
                 PC-6: 改 web L458-474 折叠 + 圆药丸形态 (item 2)
                 CSS 顺序坑: Input base = `rounded-md`, web 要 rounded-full
                 → 产物里 .rounded-full (pos=34692) 早于 .rounded-md (pos=34952),
                 需 `!rounded-full` 强制覆盖 */}
            {showSearch ? (
              <div className="relative pt-2">
                {/* web 的搜索框前缀图标: absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4
                    text-fg-muted pointer-events-none z-10 (web library/page.tsx:472)
                    ⇒ 复用共享 <SearchFieldIcon> (自带前 5 个类), 补上后 2 个 */}
                <SearchFieldIcon className="pointer-events-none z-10" />
                <Input
                  type="search"
                  value={keyword}
                  onChange={(e) => {
                    setKeyword(e.target.value);
                    resetFilters();
                  }}
                  placeholder="搜索标题或标签..."
                  autoFocus
                  className="pl-9 !py-2 !text-sm bg-muted/50 border-0 focus:border-transparent !rounded-full focus-visible:ring-1 focus-visible:ring-brand"
                />
              </div>
            ) : null}
          </div>
        </div>

        {/* 列表区 — PC-6: 容器 max-w-3xl (item 5); grid → space-y-3 (item 3) */}
        <div className="flex-1 px-4 lg:px-8 max-w-3xl mx-auto w-full py-4">
          {isLoading ? (
            <SkeletonGrid />
          ) : filteredItems.length === 0 ? (
            <EmptyState search={keyword} />
          ) : (
            <>
              {/* PC-6: 单列行列表 + space-y-3 (item 3) — 对齐 web L516 */}
              <div className="space-y-3">
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

                {/* L-23: 「加载更多」改纯文字按钮 — web library/page.tsx:552-568 */}
                {!keyword.trim() && hasMore ? (
                  <div className="py-4 text-center">
                    <button
                      type="button"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={isFetching}
                      className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg disabled:opacity-50"
                    >
                      {isFetching ? (
                        <LoaderCircleIcon size={16} className="w-4 h-4 animate-spin" />
                      ) : (
                        /* lucide `library` — 复用共享 Glyphs 的 LibraryTypeIcon
                           (web library/page.tsx:563 同款 path) */
                        <LibraryTypeIcon size={16} strokeWidth={2} className="w-4 h-4" />
                      )}
                      加载更多
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>

      {/* PC-6: FAB — 右下角 + 按钮 (item 7)
          2026-10-27 (B3 日程中心批次): 内联 <button> 换成共享的 <CreateFab>
            (web `components/common/CreateFab.tsx` 逐字搬运; PC 之前没有 common/ 目录 ⇒ 新建)
          视觉参数一字不变 (fixed bottom-5 right-5 z-40 w-[52px] h-[52px] rounded-lg
          bg-brand text-brand-on + 橙色辉光阴影 + hover 上浮 / active 缩放)
          多选模式隐藏 (避免与底部 toolbar 重复入口), 跟 web L563 一致 */}
      {!isInMultiSelect ? (
        <CreateFab label="采集内容" onClick={() => setCollectOpen(true)} />
      ) : null}

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

      {/* 单条删除二次确认
          L-74: 描述逐字对齐 web library/page.tsx:1250 —— 「移除」后面是**全角逗号**,
                PC 之前是半角 ","
          L-75: pending 时按钮内只剩 spinner (web 是文字换成 spinner) */}
      {pendingSingleDelete ? (
        <ConfirmDialog
          title="确定要删除这条吗?"
          message={`「${pendingSingleDelete.title || "未命名"}」 将从知识库移除，此操作不可撤销。`}
          confirmLabel={singleDeleteMutation.isPending ? "" : "删除"}
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
// EmptyState — 无数据占位 (2026-10-26 · L-17 / L-18)
//
//   web `library/page.tsx:512-525`:
//     <Card className="border-0 shadow-none bg-card rounded-2xl">
//       <CardContent className="p-10 text-center text-fg-muted">
//         <Construction className="w-12 h-12 mx-auto text-fg-muted mb-4" />
//         …标题 / 副文案…
//   - PC 没有 Card/CardContent 组件 ⇒ 用两个 div 复刻同样的结构
//   - ⚠️ `!shadow-none`: PC tailwind.config.ts 的 boxShadow 顺序里 `none` 在
//     `DEFAULT` **之前** ⇒ `.shadow` 产物在后会盖过 `.shadow-none`
//     ⇒ 必须用 `!` 前缀强制覆盖 (tailwind 3.4.19 支持 `!` 前缀).
//   - 口径: web 空态**没有**行动按钮 ⇒ PC 多出的「+ 新建条目」按钮已删
//     (采集入口 = 右下角 FAB, 跟 web 一致)
// ────────────────────────────────────────────────────────────

function EmptyState({ search }: { search: string }) {
  return (
    <div className="rounded-2xl border-0 !shadow-none bg-card">
      <div className="!p-10 text-center text-fg-muted">
        <ConstructionIcon className="w-12 h-12 mx-auto text-fg-muted mb-4" />
        <div className="text-base font-medium mb-1 text-fg">
          {search ? "未找到匹配项" : "暂无知识库内容"}
        </div>
        <div className="text-sm">
          {search
            ? `没有标题或标签包含 "${search}" 的内容`
            : "上传图片 / 文档 / 链接后将自动同步到这里"}
        </div>
      </div>
    </div>
  );
}

// SkeletonGrid — PC-6: 跟随主列表 grid → space-y-3 + 卡片圆角对齐 rounded-2xl
function SkeletonGrid() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-20 w-full rounded-2xl bg-card animate-pulse" />
      ))}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Icons — 本文件**不再保留**本地图标 (2026-10-26)
//   共享 Glyphs.tsx 已有同款 (path 逐字相同) 的导出, 一律 import 复用:
//     · layout-grid  → LayoutGridIcon
//     · construction → ConstructionIcon
//     · loader-2     → LoaderCircleIcon
//     · search       → SearchFieldIcon (输入框前缀) / SearchBareIcon (圆药丸按钮)
//     · refresh-cw   → RefreshCwIcon   (改前本地末条是 `M3 21v-5h5`, lucide 是 `M8 16H3v5`)
//     · plus         → PlusIcon        (改前本地是 `<line>` 手写 + sw2.2)
//   (组件意识: 禁止重复实现 — 同款图形只在 Glyphs.tsx 里存在一份)
// ────────────────────────────────────────────────────────────
