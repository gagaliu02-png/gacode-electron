/**
 * components/library/TagFilter.tsx — Tag 维度过滤 chip 行
 *                       (gacode-electron 0.7.2 P1 library-13)
 *
 * 拿 GET /yinian/library/tags 的全量 tag 列表, 展示为可点 chip 行.
 *   - "全部" chip 是默认状态 (无 tag 过滤)
 *   - 点某个 tag → 选中状态; 再点一次取消
 *   - 横向滚动 — tag 多时一行装不下, 容器加 overflow-x-auto
 *
 * 服务端拿 tag list 用 src/lib/api.ts 的 listLibraryTags, query key = ['library-tags'].
 * 这里封装 hook + UI 一体, 复用 queryClient 让编辑/采集后自动 invalidate.
 */

import { useQuery } from "@tanstack/react-query";
import { listLibraryTags } from "../../lib/api";

export interface TagFilterProps {
  /** 当前选中的 tag, undefined = "全部" */
  selected: string | undefined;
  onSelect: (tag: string | undefined) => void;
}

export function TagFilter({ selected, onSelect }: TagFilterProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["library-tags"],
    queryFn: () => listLibraryTags(),
    staleTime: 30_000,
  });

  const tags = data?.tags ?? [];

  if (isLoading) {
    return (
      <div className="text-xs text-fg-subtle px-1 py-1">
        加载标签…
      </div>
    );
  }
  if (isError || tags.length === 0) {
    return null;
  }

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="inline-flex gap-1.5 py-1 min-w-max">
        <button
          type="button"
          onClick={() => onSelect(undefined)}
          className={[
            "shrink-0 px-2.5 py-1 text-xs rounded-full border",
            selected === undefined
              ? "bg-brand text-brand-on border-brand"
              : "border-border text-fg-muted hover:bg-bg-elevated",
          ].join(" ")}
        >
          全部
        </button>
        {tags.map((t) => {
          const active = selected === t.name;
          return (
            <button
              key={t.name}
              type="button"
              onClick={() => onSelect(active ? undefined : t.name)}
              className={[
                "shrink-0 px-2.5 py-1 text-xs rounded-full border",
                active
                  ? "bg-brand text-brand-on border-brand"
                  : "border-border text-fg-muted hover:bg-bg-elevated",
              ].join(" ")}
              title={`${t.count} 条`}
            >
              #{t.name}
              <span className="ml-1 text-fg-subtle">{t.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
