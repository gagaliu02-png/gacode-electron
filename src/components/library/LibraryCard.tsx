/**
 * components/library/LibraryCard.tsx — 单条知识库卡片 (阶段 0.7.2 重构)
 *
 * 从 routes/Library.tsx 抽出来 (原本 inline), 让 Library 列表 + 编辑/多选/批量
 * 等加项不堆在一个文件里.
 *
 * 行为 (跟 web LibraryRow + ChatList 长按多选 设计对齐):
 *   - 单击 → onOpen() = nav(`/library/${id}`)
 *   - 长按 500ms → onEnterMultiSelect() = 进入多选 + 选中自己
 *   - 多选模式下: 整张卡都是一个 checkbox — onClick 触发 onToggleSelect
 *   - 右上角 ⋮ 菜单 (不在多选模式时显示): 编辑 / 删除
 *
 * Props 接口跟 Card 内部分离, parent (Library.tsx) 决定路由 / 多选上下文.
 */

import { useRef } from "react";
import { DropdownMenu } from "../ui/DropdownMenu";
import type { LibraryItem } from "../../lib/api";

export interface LibraryCardProps {
  item: LibraryItem;
  onOpen: () => void;
  /** 多选模式 — 整张卡当 checkbox 用 */
  isInMultiSelect: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onEnterMultiSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  image: "图片",
  doc: "文档",
  link: "链接",
  text: "文本",
};

export function LibraryCard({
  item,
  onOpen,
  isInMultiSelect,
  isSelected,
  onToggleSelect,
  onEnterMultiSelect,
  onEdit,
  onDelete,
}: LibraryCardProps) {
  // L-32 (2026-10-26): 类型图标按类型上色 — 对齐 web library/page.tsx:117-128
  //   image=cyan / doc=yellow / link=green / 其它(含 text)=muted, 尺寸统一 20px
  const typeIconClass =
    item.type === "image" ? "text-brand-cyan" :
    item.type === "doc" ? "text-brand-yellow" :
    item.type === "link" ? "text-brand-green" :
    "text-fg-muted";

  const Icon =
    item.type === "image" ? ImageIcon :
    item.type === "doc" ? FileTextIcon :
    item.type === "link" ? LinkIcon :
    FileTextIcon;

  // 长按 500ms 触发多选 — 跟 ChatList ChatRow 同一个 timer 模式.
  const timerRef = useRef<number | null>(null);
  const triggeredRef = useRef(false);

  const startPress = () => {
    triggeredRef.current = false;
    timerRef.current = window.setTimeout(() => {
      triggeredRef.current = true;
      onEnterMultiSelect();
    }, 500);
  };
  const endPress = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleClick = () => {
    // 长按触发过的话跳过 — 避免按下 + 弹起被当作单击
    if (triggeredRef.current) {
      triggeredRef.current = false;
      return;
    }
    if (isInMultiSelect) {
      onToggleSelect();
    } else {
      onOpen();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onContextMenu={(e) => {
        // 右键: 多选模式下切换选择; 否则弹菜单 (走 ⋮ 按钮同一套 DropdownMenu 路径,
        // 这里直接复用 onEdit / onDelete, 不另开 menuPos).
        e.preventDefault();
        if (isInMultiSelect) {
          onToggleSelect();
        } else {
          onEdit();
        }
      }}
      onMouseDown={startPress}
      onMouseUp={endPress}
      onMouseLeave={endPress}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onTouchCancel={endPress}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={[
        // PC-6: 圆角对齐 web (rounded-2xl) — 直接替换 rounded-md, 元素上无 className 冲突
        "text-left rounded-2xl p-4 flex items-start gap-3 select-none",
        "cursor-pointer",
        isInMultiSelect && isSelected
          ? "bg-bg-elevated ring-1 ring-brand/60"
          : isInMultiSelect
            ? "bg-bg-sunken hover:bg-bg-elevated"
            : "bg-bg-elevated hover:bg-bg-sunken",
      ].join(" ")}
    >
      {/* 多选 checkbox — 仅多选模式 */}
      {isInMultiSelect ? (
        <span
          aria-hidden="true"
          className={[
            "shrink-0 w-5 h-5 mt-0.5 inline-flex items-center justify-center rounded border",
            isSelected
              ? "bg-fg border-fg text-bg-base"
              : "bg-bg-base border-border text-transparent",
          ].join(" ")}
        >
          ✓
        </span>
      ) : null}

      <div className="shrink-0 w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
        <Icon className={["w-5 h-5", typeIconClass].join(" ")} />
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-bg-sunken text-fg-muted">
            {TYPE_LABEL[item.type] || item.type}
          </span>
          <span className="text-xs text-fg-subtle font-mono truncate">
            #{item.id}
          </span>
        </div>
        <div className="text-sm font-medium truncate">{item.title || "未命名"}</div>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs text-fg-subtle">
            {formatRelative(item.createdAt)}
          </p>
          {item.tags && item.tags.length > 0 ? (
            <p className="text-xs text-fg-subtle truncate">
              {item.tags.slice(0, 3).map((t) => `#${t}`).join(" ")}
            </p>
          ) : null}
        </div>
      </div>

      {/* ⋮ 菜单 — 不在多选模式时显示 */}
      {!isInMultiSelect ? (
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="shrink-0"
        >
          <DropdownMenu
            trigger={
              <button
                type="button"
                aria-label="更多操作"
                className="shrink-0 w-8 h-8 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center"
              >
                <MoreVertIcon className="w-4 h-4" />
              </button>
            }
            items={[
              { label: "编辑", onClick: onEdit },
              { label: "删除", destructive: true, onClick: onDelete },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 时间格式化 — 跟旧 inline 一字不差, 简单相对时间 (避免引 date-fns)
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
//   L-32: 这 4 个类型图标改成接收 className (尺寸 + 颜色由调用点传),
//   svg 自身用 width/height=100% (Tailwind 的 w-5 h-5 才生效),
//   stroke="currentColor" 保证继承调用点给的 text-* 颜色。
// ────────────────────────────────────────────────────────────

function ImageIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}

function FileTextIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function LinkIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function MoreVertIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
