/**
 * components/schedule/RowActionMenu.tsx — 卡片右侧的 ⋮ 菜单
 *
 * 抄自 web `gacode-web/src/components/schedule/RowActionMenu.tsx`, 只换 PC 写法:
 *   - `cn(...)`      → 数组 filter(Boolean).join(" ")
 *   - `lucide-react` → PC 图标唯一出处是 `components/ui/Glyphs.tsx`
 *     (`MoreVertical` → `MoreVertIcon`)
 *   - 去掉 `menu-in` 类 —— 那是 web `styles/globals.css` 里定义的入场动画,
 *     PC 全局禁动效 (`animation: none !important`) ⇒ 带不带都不动, 留着是死类名。
 *
 * 钳制逻辑 1:1 移植原型 (getBoundingClientRect + offsetWidth/offsetHeight):
 *   left = 触发器右缘 - 菜单宽;  左边不够就顶到 8px;  右边超视口就右移回来;
 *   top  = 触发器下缘 + 4px;     下方不够就翻到触发器上方。
 *
 * 用 createPortal 挂到 body: fixed 定位一旦遇到祖先的 transform / filter /
 * backdrop-filter 就会失效, 直接挂 body 最稳。
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { MoreVertIcon } from "../ui/Glyphs";

export interface RowMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  /** 危险操作 (删除) 用红色 */
  danger?: boolean;
  onSelect: () => void;
  /** 虚线分隔线画在这条之前 */
  separatorBefore?: boolean;
}

interface RowActionMenuProps {
  items: RowMenuItem[];
  className?: string;
  ariaLabel?: string;
}

const EDGE = 8; // 距视口边缘的最小留白 (跟原型一致)

export function RowActionMenu({ items, className, ariaLabel = "更多" }: RowActionMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  // 打开后量菜单尺寸再定位 —— 首帧渲染时 offsetWidth 才有值。
  // ⚠️ 依赖只放 open + items.length: items 每次渲染都是新数组, 放进 deps 会让这个
  //    effect 每帧重跑; 而 setPos 每次返回新对象又会触发重渲染 → 死循环。
  //    所以: (a) deps 用稳定的量, (b) setPos 值没变时返回同一个对象。
  React.useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const r = trigger.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = r.right - mw;
    if (left < EDGE) left = EDGE;
    if (left + mw > vw - EDGE) left = Math.max(EDGE, vw - EDGE - mw);

    let top = r.bottom + 4;
    if (top + mh > vh - EDGE) top = Math.max(EDGE, r.top - mh - 4);

    setPos((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }));
  }, [open, items.length]);

  // click-outside / Escape / resize 关闭 (原型同款; resize 必须关, 否则钳制坐标过期)
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onResize = () => setOpen(false);
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={[
          "w-[26px] h-[26px] rounded-full shrink-0 inline-flex items-center justify-center",
          "text-fg-muted transition-colors duration-150 hover:bg-bg-elevated hover:text-fg",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <MoreVertIcon size={15} className="w-[15px] h-[15px]" />
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            // ⚠️ 必须**先渲染再定位**: 上面那个 useLayoutEffect 要靠 menuRef 量尺寸,
            //    如果渲染条件依赖 pos, 就会死锁 (pos 为 null → 不渲染 → 量不到 → pos 永远 null)。
            //    所以 pos 还没算出来时先摆到视口外, 量完再摆回来。
            style={
              pos
                ? { left: pos.left, top: pos.top }
                : { left: -9999, top: -9999, visibility: "hidden" }
            }
            className="fixed z-[120] min-w-[176px] rounded-md bg-bg-elevated p-1.5 shadow-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((it) => (
              <React.Fragment key={it.key}>
                {it.separatorBefore && (
                  <div role="separator" className="h-px bg-border my-[5px] mx-2" />
                )}
                <button
                  type="button"
                  role="menuitem"
                  className={[
                    "flex w-full items-center gap-[9px] text-left rounded px-2.5 py-[9px]",
                    "text-sm transition-colors duration-100",
                    it.danger ? "text-danger" : "text-fg",
                    "hover:bg-white/[0.07]",
                  ].join(" ")}
                  onClick={() => {
                    setOpen(false);
                    it.onSelect();
                  }}
                >
                  {it.icon}
                  <span>{it.label}</span>
                </button>
              </React.Fragment>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
