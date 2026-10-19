/**
 * components/home/LibraryPicker.tsx — Home 页 知识库条目挂载选择器
 *
 * 对齐 web `src/components/chat/LibraryPicker.tsx`:
 *   - 顶部搜索 + 类型 tab (全部 / 图片 / 文档 / 链接)
 *   - listLibrary 拿数据, 前端二次过滤 (按 title)
 *   - 单选: 点 row → onSelect(item) → parent 关闭 sheet
 *
 * electron 端没有 date-fns 依赖, 自实现 mini 相对时间 (跟 ChatList 同款思路)
 *
 * 容器: BottomSheet — 不引 Radix Sheet.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BottomSheet } from "../ui/BottomSheet";
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
  /** 选中某 library item 后回调, parent 关闭 sheet */
  onSelect: (item: LibraryItem) => void;
}

// 自实现 mini 相对时间 (跟 ChatList / Notifications 一致, 不引 date-fns).
function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (isNaN(t)) return "";
  const diff = Date.now() - t;
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`;
  // 更早用日期
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function LibraryPicker({ open, onClose, onSelect }: LibraryPickerProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");

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
    onClose();
  };

  // 类型 tab 切换时也清 search (避免脏组合).
  const handleTypeChange = (key: string) => {
    setTypeFilter(key as TypeFilter);
    setSearch("");
  };

  return (
    <BottomSheet open={open} title="挂载知识库" onClose={handleClose}>
      <div className="px-1 pt-1 pb-3 border-b border-border space-y-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索知识库标题"
          className="w-full rounded-md bg-bg-sunken text-fg placeholder:text-fg-subtle px-3 py-2 text-sm outline-none focus:border-brand focus:border"
        />
        <div className="flex gap-2 overflow-x-auto">
          {TYPE_TABS.map((t) => {
            const active = t.key === typeFilter;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => handleTypeChange(t.key)}
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
          <div className="text-center text-fg-muted py-12 text-sm">
            {search.trim()
              ? `没有匹配 "${search}" 的知识库`
              : "知识库还空空如也,去采集点内容吧"}
          </div>
        ) : (
          <ul className="space-y-2">
            {filteredItems.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(item);
                    handleClose();
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-md bg-bg-sunken hover:bg-bg-base border border-border transition-colors duration-150 text-left"
                >
                  <div className="shrink-0 w-10 h-10 rounded-md bg-bg-elevated inline-flex items-center justify-center text-fg-muted">
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
                            <span
                              key={t}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-bg-elevated text-fg-muted"
                            >
                              {t}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </BottomSheet>
  );
}

// 类型 icon (image / doc / link / text) — 跟 web LibraryPicker 的 typeIcon 对齐
function TypeIcon({ type }: { type: LibraryItem["type"] }) {
  switch (type) {
    case "image":
      return (
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      );
    case "doc":
      return (
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
          <path d="M10 9H8" />
          <path d="M16 13H8" />
          <path d="M16 17H8" />
        </svg>
      );
    case "link":
      return (
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      );
    default:
      return (
        <svg
          aria-hidden="true"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
        </svg>
      );
  }
}