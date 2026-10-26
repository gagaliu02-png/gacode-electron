/**
 * components/library/LibraryRowMenu.tsx — 知识库行上下文菜单 (2026-10-26 · L-38 ~ L-42)
 *
 * 1:1 对齐 web `gacode-web/src/app/(main)/library/page.tsx:1094-1154`:
 *   - 容器: fixed 定位 (跟随点击坐标) + `min-w-[160px] rounded-xl bg-popover shadow-2xl py-1`
 *   - 4 个菜单项: 详情 (Eye) / 编辑 (Tag) / 在新窗口打开 (ExternalLink, 仅 item.url 存在时) / 删除 (Trash2)
 *   - 「在新窗口打开」与「删除」之间一条分隔线 `<div className="my-1" />`
 *   - 删除项是 **web 自写 button** (`text-danger hover:bg-danger-soft/40`), 不是 shadcn destructive
 *   - 关闭: Esc + 下一帧挂 outside-click (web library/page.tsx:939-954)
 *
 * 菜单位置由调用方给:
 *   - 右键行 → 光标坐标 (web library/page.tsx:909 `setMenuPos({x: e.clientX, y: e.clientY})`)
 *   - 点 ⋯ 按钮 → 按钮左下角 (web library/page.tsx:1079-1082 `rect.left` / `rect.bottom + 4`)
 *
 * ⚠️ PC 仓没有 lucide-react ⇒ 图标是手写内联 svg (path 取自 web 用的
 *    lucide-react v0.407.0, 逐字照抄); 删除图标复用共享 Glyphs.tsx 的 TrashIcon
 *    (组件意识: 不重复实现). Eye / Tag / ExternalLink 共享 Glyphs.tsx 里还没有,
 *    建议后续收进 Glyphs.tsx (见交付报告「超出独占范围的问题」).
 */

import { useEffect, useRef } from "react";
import { TrashIcon } from "../ui/Glyphs";

export interface LibraryRowMenuProps {
  /** 菜单位置 (视口坐标) — null 表示关闭 */
  pos: { x: number; y: number } | null;
  /** 条目是否有 url — 决定「在新窗口打开」项是否渲染 (web: `item.url`) */
  hasUrl: boolean;
  /** 关闭菜单 */
  onClose: () => void;
  /** 「详情」— 跳条目详情页 */
  onDetail: () => void;
  /** 「编辑」— 打开编辑弹窗 */
  onEdit: () => void;
  /** 「在新窗口打开」— web 侧实际是跳详情页 (web library/page.tsx:1131 调 `open()`) */
  onOpenExternal: () => void;
  /** 「删除」— 打开二次确认弹窗 */
  onDelete: () => void;
}

export function LibraryRowMenu({
  pos,
  hasUrl,
  onClose,
  onDetail,
  onEdit,
  onOpenExternal,
  onDelete,
}: LibraryRowMenuProps) {
  // onClose 可能是内联箭头函数 (每次渲染新引用) ⇒ 用 ref 固定, 免得 effect 反复重挂
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // 关闭逻辑 — web library/page.tsx:939-954
  useEffect(() => {
    if (!pos) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    const onClick = () => onCloseRef.current();
    document.addEventListener("keydown", onKey);
    // 下一帧再挂 outside-click —— 避免打开菜单的那一次 click 立刻把它关掉
    const t = setTimeout(() => document.addEventListener("click", onClick), 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
      clearTimeout(t);
    };
  }, [pos]);

  if (!pos) return null;

  return (
    <div
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[70] min-w-[160px] rounded-xl bg-popover shadow-2xl py-1"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        onClick={onDetail}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-bg-sunken transition-colors"
      >
        <EyeIcon className="w-4 h-4 text-fg-muted" />
        详情
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={onEdit}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-bg-sunken transition-colors"
      >
        <TagIcon className="w-4 h-4 text-fg-muted" />
        编辑
      </button>
      {hasUrl ? (
        <button
          type="button"
          role="menuitem"
          onClick={onOpenExternal}
          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-bg-sunken transition-colors"
        >
          <ExternalLinkIcon className="w-4 h-4 text-fg-muted" />
          在新窗口打开
        </button>
      ) : null}
      <div className="my-1" />
      <button
        type="button"
        role="menuitem"
        onClick={onDelete}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger-soft/40 transition-colors"
      >
        <TrashIcon className="w-4 h-4" />
        删除
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Icons — lucide-react v0.407.0 原始 path (web 端用的就是这一版)
//   svg 用 width/height="100%" ⇒ tailwind 的 w-4 h-4 生效
// ────────────────────────────────────────────────────────────

/** lucide `eye` */
function EyeIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** lucide `tag` */
function TagIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z" />
      <circle cx="7.5" cy="7.5" r=".5" fill="currentColor" />
    </svg>
  );
}

/** lucide `external-link` */
function ExternalLinkIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </svg>
  );
}
