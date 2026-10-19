/**
 * components/library/SortMenu.tsx — 排序下拉 (gacode-electron 0.7.2 P2 library-14)
 *
 * 三选项: 最新 (createdAt desc, 默认) / 最早 (createdAt asc) / 标题 A-Z (title asc).
 * 排序在客户端做 — listLibrary 已按时间倒序从 server 返回, 后端无 sort 参数.
 * 用 DropdownMenu 触发 (跟 LibraryCard ⋮ 同一组件).
 */

import { DropdownMenu } from "../ui/DropdownMenu";

export type LibrarySort = "newest" | "oldest" | "title";

export const SORT_LABEL: Record<LibrarySort, string> = {
  newest: "最新",
  oldest: "最早",
  title: "标题 A-Z",
};

export interface SortMenuProps {
  value: LibrarySort;
  onChange: (v: LibrarySort) => void;
}

export function SortMenu({ value, onChange }: SortMenuProps) {
  return (
    <DropdownMenu
      trigger={
        <button
          type="button"
          aria-label="排序"
          className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors duration-150 inline-flex items-center justify-center"
        >
          <SortIcon />
        </button>
      }
      items={[
        {
          label: "最新",
          render: (
            <span className="inline-flex items-center gap-2 w-full">
              {value === "newest" ? <CheckIcon /> : <span className="w-4" />}
              最新
            </span>
          ),
          onClick: () => onChange("newest"),
        },
        {
          label: "最早",
          render: (
            <span className="inline-flex items-center gap-2 w-full">
              {value === "oldest" ? <CheckIcon /> : <span className="w-4" />}
              最早
            </span>
          ),
          onClick: () => onChange("oldest"),
        },
        {
          label: "标题 A-Z",
          render: (
            <span className="inline-flex items-center gap-2 w-full">
              {value === "title" ? <CheckIcon /> : <span className="w-4" />}
              标题 A-Z
            </span>
          ),
          onClick: () => onChange("title"),
        },
      ]}
      align="right"
    />
  );
}

function SortIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h13" />
      <path d="M3 12h9" />
      <path d="M3 18h5" />
      <path d="m17 8 4 4-4 4" />
      <path d="M21 12h-9" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
