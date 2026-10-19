/**
 * components/chat/MarkdownTableCard.tsx — chat-id-34 独立美化表格卡片
 *
 * 跟 lib/markdown.tsx 内嵌的 table 组件区别: 这个是「在 ChatDetail 中独立
 * 提取的整张表格卡片」, 用于 (a) 客户端代码手动构造的表格 (例如 /deliveries
 * 摘要视图); (b) markdown 内 table 后续 server 给的更复杂表头 / 合并.
 *
 * 当前实现: 自实现一个紧凑版表格卡片, 行数 < 6 不显示折叠按钮, 否则加
 * 「展开 / 收起」 — 跟 .md-table 容器对齐 (md-table-td-clamp 6 行折叠
 * 是 inline 渲染, 这里给 standalone 用).
 *
 * 公共路径: components/ui/MarkdownTableCard.tsx 是 worker P1-B 期望的命名;
 * 本文件路径 components/chat/MarkdownTableCard.tsx 跟 chat 子模块就近, 也
 * 可 import 自 components/ui/MarkdownTableCard (worker P1-B 也建) — 两个路径
 * 内容几乎一致 (复用 fallback 时 re-export).
 */

import { useMemo, useState } from "react";

export interface MarkdownTableCardProps {
  headers: string[];
  rows: string[][];
  /** 默认折叠行数阈值 (默认 6) */
  collapseRowsThreshold?: number;
}

export function MarkdownTableCard({
  headers,
  rows,
  collapseRowsThreshold = 6,
}: MarkdownTableCardProps) {
  const [expanded, setExpanded] = useState(false);
  const shouldCollapse = rows.length > collapseRowsThreshold;
  const visibleRows = useMemo(() => {
    if (!shouldCollapse || expanded) return rows;
    return rows.slice(0, collapseRowsThreshold);
  }, [rows, shouldCollapse, expanded, collapseRowsThreshold]);

  if (headers.length === 0) return null;

  return (
    <div className="md-table-scroll" data-testid="markdown-table-card">
      <table className="md-table">
        <thead className="md-table-thead">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="md-table-th">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, i) => (
            <tr key={i}>
              {headers.map((_, j) => {
                const cell = row[j] ?? "";
                const lines = cell.split(/\r?\n/).length;
                return (
                  <td key={j} className="md-table-td">
                    {lines > 6 ? (
                      <CellWithClamp text={cell} />
                    ) : (
                      cell
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {shouldCollapse ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="md-table-td-toggle"
          aria-expanded={expanded}
        >
          {expanded ? "收起 ▴" : `... 展开 (剩余 ${rows.length - collapseRowsThreshold} 行)`}
        </button>
      ) : null}
    </div>
  );
}

function CellWithClamp({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const lines = text.split(/\r?\n/);
  const trimmed = lines.slice(0, 6).join("\n");
  return (
    <>
      <span className={open ? "md-table-td-inner" : "md-table-td-inner md-table-td-clamp"}>
        {open ? text : trimmed + (lines.length > 6 ? "…" : "")}
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="md-table-td-toggle"
      >
        {open ? "收起 ▴" : "... 展开"}
      </button>
    </>
  );
}