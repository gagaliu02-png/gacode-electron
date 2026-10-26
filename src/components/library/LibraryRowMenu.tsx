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
 * ⚠️ PC 仓没有 lucide-react ⇒ 图标走共享图标库 `components/ui/Glyphs.tsx`
 *    (组件意识: 不重复实现). 2026-10-26 收编: 本文件原先就地手写的
 *    Eye / Tag / ExternalLink 内联 svg 已全部收进 Glyphs.tsx
 *    (`EyeIcon` / `TagIcon` / `ExternalLinkIcon`), 删除图标复用已有的
 *    `TrashIcon` (lucide `trash-2`).
 */

import { useEffect, useRef } from "react";
import { ExternalLinkIcon, EyeIcon, TagIcon, TrashIcon } from "../ui/Glyphs";

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
