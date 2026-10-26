/**
 * components/library/LibraryCard.tsx — 单条知识库卡片 (阶段 0.7.2 重构)
 *
 * 从 routes/Library.tsx 抽出来 (原本 inline), 让 Library 列表 + 编辑/多选/批量
 * 等加项不堆在一个文件里.
 *
 * 行为 (跟 web LibraryRow + ChatList 长按多选 设计对齐):
 *   - 单击 → onOpen() = nav(`/library/${id}`)
 *   - 长按 500ms → onEnterMultiSelect() = 进入多选 + 选中自己 (只绑 touch, 见 L-43)
 *   - 多选模式下: 整张卡都是一个 checkbox — onClick 触发 onToggleSelect
 *   - 右键 / ⋯ 按钮 → 弹行上下文菜单 (LibraryRowMenu, 见 L-37 ~ L-42)
 *
 * 2026-10-26 (逐 page 1:1 还原 web · L-29 ~ L-43):
 *   - 行卡片 className 逐字对齐 web (w-full / shadow-sm / transition-colors /
 *     items-center / bg-card + hover:bg-muted/50 / 选中态 bg-muted + ring-brand/50)
 *   - 多选 checkbox: 方框打勾 → **圆形** (CheckCircle2 / Circle, w-5 h-5)
 *   - 删掉 PC 多出的「类型 chip + #id」行 (web 行内只有 2 行: 标题 + 时间/标签)
 *   - 行副行合并成一行: `text-xs text-fg-muted mt-0.5 truncate` + 标签 `text-fg-muted/70`
 *   - 右键不再直接开编辑弹窗, 改弹上下文菜单
 *   - 删掉鼠标长按绑定 (web 只绑 touch)
 *
 * Props 接口跟 Card 内部分离, parent (Library.tsx) 决定路由 / 多选上下文.
 */

import { useRef, useState } from "react";
import { MoreIcon } from "../ui/Glyphs";
import { LibraryRowMenu } from "./LibraryRowMenu";
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

  // 行上下文菜单位置 (视口坐标) — null = 关闭 (L-37 ~ L-42)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);

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

  // 右键 → 弹上下文菜单 (web library/page.tsx:903-910);
  // 多选模式下右键 = toggle 选择 (跟 web 一致)
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isInMultiSelect) {
      onToggleSelect();
      return;
    }
    setMenuPos({ x: e.clientX, y: e.clientY });
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        // L-43: web 只绑 touch (长按 500ms 进多选), 桌面端入口是右键菜单
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
          // L-29: 逐字对齐 web library/page.tsx:1032-1037
          //   "w-full flex items-center gap-3 p-4 rounded-2xl shadow-sm transition-colors
          //    text-left cursor-pointer select-none"
          "w-full flex items-center gap-3 p-4 rounded-2xl shadow-sm transition-colors text-left cursor-pointer select-none",
          isInMultiSelect && isSelected
            ? "bg-muted ring-1 ring-brand/50"
            : "bg-card hover:bg-muted/50",
        ].join(" ")}
      >
        {/* 多选 checkbox (L-30) — 多选模式才显示; web 是**圆形** (CheckCircle2 / Circle) */}
        {isInMultiSelect ? (
          <div className="shrink-0">
            {isSelected ? (
              <CheckCircleIcon className="w-5 h-5 text-brand" />
            ) : (
              <CircleIcon className="w-5 h-5 text-fg-muted" />
            )}
          </div>
        ) : null}

        <div className="shrink-0 w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
          <Icon className={["w-5 h-5", typeIconClass].join(" ")} />
        </div>

        {/* L-35: 删掉 PC 多出的「类型 chip + #id」行 ⇒ 文字块只有 2 行 (跟 web 一致) */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{item.title || "未命名"}</div>
          {/* L-34: 副行合并成一行 — 时间 + 标签 (web library/page.tsx:1057-1068) */}
          <div className="text-xs text-fg-muted mt-0.5 truncate">
            {formatRelative(item.createdAt)}
            {item.tags && item.tags.length > 0 ? (
              <span className="ml-2 inline-flex gap-2 truncate">
                {item.tags.slice(0, 3).map((t) => (
                  <span key={t} className="text-fg-muted/70 truncate">#{t}</span>
                ))}
              </span>
            ) : null}
          </div>
        </div>

        {/* ⋮ 菜单 — 不在多选模式时显示 (web library/page.tsx:1071-1088) */}
        {!isInMultiSelect ? (
          <button
            type="button"
            aria-label="更多操作"
            onClick={(e) => {
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              // 优先放左下, 防止贴右边被裁 (web library/page.tsx:1079-1082)
              setMenuPos({
                x: Math.min(rect.left, window.innerWidth - 180),
                y: rect.bottom + 4,
              });
            }}
            className="shrink-0 w-8 h-8 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center"
          >
            <MoreIcon className="w-4 h-4" />
          </button>
        ) : null}
      </div>

      {/* 行上下文菜单 — fixed 定位, 跟随点击坐标 (L-38 ~ L-42) */}
      <LibraryRowMenu
        pos={menuPos}
        hasUrl={Boolean(item.url)}
        onClose={() => setMenuPos(null)}
        onDetail={() => {
          setMenuPos(null);
          onOpen();
        }}
        onEdit={() => {
          setMenuPos(null);
          onEdit();
        }}
        onOpenExternal={() => {
          // web library/page.tsx:1131 调的是 `open()` = 跳详情页 (不是 window.open)
          setMenuPos(null);
          onOpen();
        }}
        onDelete={() => {
          setMenuPos(null);
          onDelete();
        }}
      />
    </>
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
//   L-32: 这 3 个类型图标接收 className (尺寸 + 颜色由调用点传),
//   svg 自身用 width/height=100% (Tailwind 的 w-5 h-5 才生效),
//   stroke="currentColor" 保证继承调用点给的 text-* 颜色。
//   L-30: 多选圆图标 (lucide v0.407.0 原始 path)。
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

/** lucide `circle-check` (web 的 CheckCircle2) */
function CheckCircleIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/** lucide `circle` */
function CircleIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}
