/**
 * components/home/LibraryPicker.tsx — Home 页 知识库条目挂载选择器
 *
 * 对齐 web `src/components/chat/LibraryPicker.tsx`:
 *   - 顶部标题「选择知识库」+ 副标题「可多选, 点完成提交」(H-54)
 *   - 顶部搜索 + 类型 tab (全部 / 图片 / 文档 / 链接)
 *   - listLibrary 拿数据, 前端二次过滤 (按 title)
 *   - 单选: 点 row → onSelect(item) → parent 关闭 sheet
 *
 * 相对时间用 date-fns `formatDistanceToNow(d, { addSuffix: true, locale: zhCN })`
 * (H-62) — PC 仓 **本来就有** date-fns@4.4.0 依赖 (`package.json` dependencies),
 * 之前只是没用它, 手写了一个 mini `formatRelative` (输出跟 web 不一致:
 * >30 天时 web 给「大约 2 个月前」, PC 给具体日期).
 *
 * 容器: BottomSheet — 不引 Radix Sheet.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { BottomSheet } from "../ui/BottomSheet";
import { Badge } from "../ui/Badge";
import {
  CheckGlyph,
  DocTypeIcon,
  ImageTypeIcon,
  LibraryIcon,
  LibraryTypeIcon,
  LinkCronIcon,
  SearchFieldIcon,
} from "../ui/Glyphs";
import { listLibrary, type LibraryItem } from "../../lib/api";

type TypeFilter = "all" | "image" | "doc" | "link";

const TYPE_TABS: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "image", label: "图片" },
  { key: "doc", label: "文档" },
  { key: "link", label: "链接" },
];

export interface LibraryPickerProps {
  open: boolean;
  onClose: () => void;
  /** 旧单选回调 (向下兼容). 若同时传了 onConfirm, 这个不会被调用. */
  onSelect?: (item: LibraryItem) => void;
  /** 多选模式 — 点「完成」时一次性回调本次选中的 items */
  onConfirm?: (items: LibraryItem[]) => void;
}

// H-62 (对齐 web `components/chat/LibraryPicker.tsx:232-240`):
//   相对时间改用 date-fns `formatDistanceToNow(d, { addSuffix: true, locale: zhCN })`
//   —— date-fns@4.4.0 本来就是 PC 仓的依赖 (package.json dependencies),
//      之前是手写 mini 实现, >30 天时输出跟 web 不一致.
//   ⚠️ date-fns v4 的 locale 入口是 `date-fns/locale` (不是 v2 的 `date-fns/locale/zh-CN`).
function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return formatDistanceToNow(d, { addSuffix: true, locale: zhCN });
  } catch {
    return "";
  }
}

export function LibraryPicker({ open, onClose, onSelect, onConfirm }: LibraryPickerProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  /** 本次 session 累积的选中 id (不立即关 sheet, 完成按钮才关) */
  const [pendingSelected, setPendingSelected] = useState<Set<string>>(new Set());
  /** 关联已选 item 的轻量快照, 完成时回调出去 (父组件要拿 title 拼 marker) */
  const [pendingItems, setPendingItems] = useState<Map<string, LibraryItem>>(new Map());

  const query = useQuery({
    queryKey: ["library", "picker", typeFilter],
    queryFn: () =>
      listLibrary(
        typeFilter === "all"
          ? { pageSize: 100 }
          : { type: typeFilter, pageSize: 100 },
      ),
    enabled: open,
    staleTime: 30_000,
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const filteredItems = useMemo(
    () =>
      items.filter((it) =>
        search.trim()
          ? it.title.toLowerCase().includes(search.trim().toLowerCase())
          : true,
      ),
    [items, search],
  );

  const handleClose = () => {
    setSearch("");
    setPendingSelected(new Set());
    setPendingItems(new Map());
    onClose();
  };

  /** 切换某项选中态 — 多选模式累积, 单选模式立即回调并关闭 */
  const toggleItem = (item: LibraryItem): void => {
    if (onConfirm) {
      setPendingSelected((prev) => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
      setPendingItems((prev) => {
        const next = new Map(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.set(item.id, item);
        return next;
      });
      return;
    }
    if (onSelect) {
      onSelect(item);
      handleClose();
    }
  };

  /** 「完成」按钮 — 把本次选中的 items 一次性回调出去并关闭面板 */
  const handleConfirm = (): void => {
    if (!onConfirm) return;
    onConfirm(Array.from(pendingItems.values()));
    handleClose();
  };

  // 打开时清空累积 (避免上次残留)
  useEffect(() => {
    if (open) {
      setPendingSelected(new Set());
      setPendingItems(new Map());
    }
  }, [open]);

  return (
    // 2026-10-26 对齐 web `components/chat/LibraryPicker.tsx:162`:
    //   web SheetContent className 含 `max-h-[80vh]` (PC 的 BottomSheet base 是 85vh)
    <BottomSheet
      open={open}
      // H-54 (对齐 web `components/chat/LibraryPicker.tsx:166-173`):
      //   标题「选择知识库」+ 副标题 (多选模式「可多选, 点完成提交」/ 单选模式
      //   「选中后将插入到消息」) —— web 把这一行放在自己内容区的头部
      //   (`flex items-center justify-between`), PC 用 BottomSheet 的内置
      //   title/subtitle 承载 (副标题落在标题下一行, 见 BottomSheet 注释).
      title="选择知识库"
      subtitle={onConfirm ? "可多选, 点完成提交" : "选中后将插入到消息"}
      onClose={handleClose}
      maxHeight="max-h-[80vh]"
      // 搜索 + 类型 tab 固定在滚动区外 —— 对齐 web 的
      // 「头部固定 (`components/chat/LibraryPicker.tsx:165-207`) + 列表独立滚动
      // (`:210` flex-1 overflow-y-auto)」结构 (走 BottomSheet 的 header prop).
      header={
        <div className="px-1 pt-1 pb-3 border-b border-border space-y-2">
          <div className="relative">
            <SearchFieldIcon />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索知识库标题"
              className="w-full pl-9 pr-3 py-2 rounded-md bg-bg-sunken text-fg placeholder:text-fg-subtle outline-none focus:ring-1 focus:ring-brand"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {TYPE_TABS.map((t) => {
              const active = t.key === typeFilter;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTypeFilter(t.key)}
                  className={[
                    "shrink-0 px-3 py-1 rounded-full text-xs transition-colors duration-150",
                    active
                      ? "bg-brand text-brand-on"
                      : "bg-bg-sunken text-fg-muted hover:text-fg",
                  ].join(" ")}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      }
      footer={
        onConfirm ? (
          <button
            type="button"
            onClick={handleConfirm}
            data-testid="library-picker-confirm"
            disabled={pendingSelected.size === 0}
            className={[
              "w-full inline-flex items-center justify-center gap-2",
              "rounded-md py-2.5 text-sm font-medium transition-colors",
              "focus:outline-none focus:ring-1 focus:ring-brand",
              pendingSelected.size === 0
                ? "bg-bg-sunken text-fg-subtle cursor-not-allowed"
                : "bg-brand text-brand-on hover:bg-brand/90",
            ].join(" ")}
          >
            完成 ({pendingSelected.size})
          </button>
        ) : null
      }
    >
      {/* 列表 */}
      <div className="py-2">
        {query.isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <span className="gagaos-spinner" aria-hidden="true" />
            <span className="text-sm text-fg-muted">加载知识库…</span>
          </div>
        ) : query.error ? (
          <div className="text-center py-12 text-sm text-danger">
            加载失败:{" "}
            {(query.error as Error)?.message || String(query.error)}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-fg-muted">
            {/* H-57 (对齐 web `components/chat/LibraryPicker.tsx:222`):
                web 是 `<LibraryIcon className="w-10 h-10 opacity-40" />` ——
                PC 的 `ui/Glyphs.tsx` 的 `LibraryIcon` **自带** `w-10 h-10 opacity-40`
                (40px 尺寸 + 40% 透明度), 渲染结果与 web 逐字等价, 无需再传 className. */}
            <LibraryIcon />
            <div className="text-sm">
              {search.trim()
                ? `没有匹配 "${search}" 的知识库`
                : "知识库还空空如也,去采集点内容吧"}
            </div>
          </div>
        ) : (
          <ul className="space-y-2">
            {filteredItems.map((item) => {
              const checked = pendingSelected.has(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggleItem(item)}
                    data-testid="library-picker-item"
                    data-item-id={item.id}
                    className={[
                      "w-full flex items-center gap-3 p-3 rounded-lg",
                      "border bg-bg-sunken hover:bg-bg-base transition-colors text-left",
                      checked ? "!border-brand bg-brand/5" : "border-border",
                    ].join(" ")}
                  >
                    <div className="shrink-0 w-10 h-10 rounded-md bg-bg-elevated inline-flex items-center justify-center">
                      <TypeIcon type={item.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {item.title || "未命名"}
                      </div>
                      <div className="text-xs text-fg-muted mt-0.5 truncate">
                        {formatRelative(item.createdAt)}
                        {item.tags && item.tags.length > 0 ? (
                          <span className="ml-2 inline-flex gap-1">
                            {item.tags.slice(0, 3).map((t) => (
                              // web `components/chat/LibraryPicker.tsx:266-277`:
                              //   <Badge variant="secondary" className="text-[10px]">
                              //   ⇒ PC 用 ui/Badge (已跟 web badge.tsx 1:1),
                              //   `!text-[10px]` 压过 Badge base 的 `text-xs`
                              //   (PC 无 tailwind-merge).
                              <Badge key={t} variant="secondary" className="!text-[10px]">
                                {t}
                              </Badge>
                            ))}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {onConfirm ? (
                      <div
                        className={[
                          "shrink-0 w-5 h-5 rounded border flex items-center justify-center",
                          checked
                            ? "bg-brand border-brand text-brand-on"
                            : "border-border bg-background",
                        ].join(" ")}
                        aria-hidden="true"
                      >
                        {checked ? <CheckGlyph /> : null}
                      </div>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}

// 类型 icon (image / doc / link / text) — 跟 web LibraryPicker 的 typeIcon 对齐
// (图形来自 components/ui/Glyphs.tsx — 共享组件, 不再各写一份内联 svg)
// H-56 (对齐 web `components/chat/LibraryPicker.tsx:45-61`):
//   image → `text-brand-cyan` / doc → `text-brand` / link → **`text-cron` (紫)**
//   / default → lucide `library` 书脊造型 (`text-fg-muted`).
//   ⚠️ link 的紫色只在**选择器**里成立; 知识库列表页 / LibraryDetail 仍用绿
//      (web `app/(main)/library/page.tsx:124` 就是绿的) ⇒ PC 的 `LinkTypeIcon`
//      保持绿, 这里用单独的 `LinkCronIcon`.
function TypeIcon({ type }: { type: LibraryItem["type"] }) {
  switch (type) {
    case "image":
      return <ImageTypeIcon />;
    case "doc":
      return <DocTypeIcon />;
    case "link":
      return <LinkCronIcon />;
    default:
      return <LibraryTypeIcon className="w-5 h-5 text-fg-muted" />;
  }
}
