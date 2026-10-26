/**
 * components/ui/DropdownMenu.tsx — 阶段 4 通用下拉菜单
 *
 * shadcn 风格自写版: 点击触发打开, 点击外部 / Esc / 任一项点选后自动关闭.
 * 不引 Radix DropdownMenu (阶段 0/1 边界不引新依赖).
 *
 * 用法 (跟 inline dropdown 同一形态, 把 trigger / items 拿到一处):
 *   <DropdownMenu
 *     trigger={<button>...</button>}
 *     items={[
 *       { label: '编辑', onClick: () => ... },
 *       { label: '删除', destructive: true, separator: true, onClick: () => ... },
 *     ]}
 *   />
 *
 * 2026-10-26 (对齐 web `components/ui/dropdown-menu.tsx:195-206`):
 *   web 用独立的 `<DropdownMenuSeparator />` 组件在菜单项之间画分隔线
 *   (Header.tsx:231 「重命名 | 删除会话」· MessageBubble.tsx:578 「… | 删除」).
 *   PC 是 items 数组形态 ⇒ 对应能力 = `DropdownMenuItem.separator`
 *   (在本项**之前**渲染分隔线) + 导出的 `DropdownMenuSeparator` 组件.
 */

import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";

export interface DropdownMenuItem {
  label: string;
  onClick: () => void;
  /** 危险操作 (红色) */
  destructive?: boolean;
  /** 禁用 */
  disabled?: boolean;
  /**
   * 在本项**之前**渲染一条分隔线
   * (对齐 web `<DropdownMenuSeparator />` — Header.tsx:231 / MessageBubble.tsx:578).
   */
  separator?: boolean;
  /** 自定义渲染 (一般就是 label; 留给 icons+text 的复合场景) */
  render?: ReactNode;
}

export interface DropdownMenuProps {
  /** 触发元素 (一般是 button) */
  trigger: ReactElement;
  items: DropdownMenuItem[];
  /** 触发对齐到 trigger 右下, 默认 right 下沿对齐 */
  align?: "left" | "right";
  /**
   * 菜单容器额外 className (2026-10-26 · 共享组件补能力).
   *
   * - 不传 ⇒ 容器 className 与改动前**完全一致** (PC 现状, 其它调用点零影响).
   * - 传 ⇒ 追加在默认串**之后**; PC 没有 tailwind-merge, 同名类冲突由 CSS 产物顺序决定,
   *   需要覆盖默认串里的类时调用方自己加 `!` 前缀 (例: `!bg-popover`).
   */
  contentClassName?: string;
}

export function DropdownMenu({
  trigger,
  items,
  align = "right",
  contentClassName,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // 外部点击关闭 + Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 触发元素: 用 cloneElement 注入 onClick + ref + aria-expanded
  const triggerWithProps = (
    <TriggerChild
      child={trigger}
      open={open}
      onTrigger={() => setOpen((o) => !o)}
    />
  );

  return (
    <div ref={wrapperRef} className="relative inline-block">
      {triggerWithProps}
      {open ? (
        <div
          role="menu"
          className={[
            // 对齐 gacode-web/src/components/ui/dropdown-menu.tsx:143-152
            //   "absolute z-50 min-w-[12rem] overflow-hidden rounded-md border border-border
            //    bg-bg-elevated p-1 text-fg shadow-elevation-3" + "animate-fade-in" + "top-full"
            //   align: end → right-0 / start → left-0
            //   sideOffset: web 默认 4px, PC 用 mt-1 (4px) 等价
            "absolute z-50 min-w-[12rem] overflow-hidden rounded-md border border-border bg-bg-elevated p-1 text-fg shadow-elevation-3",
            "animate-fade-in",
            "top-full mt-1",
            align === "right" ? "right-0" : "left-0",
            contentClassName,
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {items.map((it, i) => (
            <Fragment key={i}>
              {it.separator ? <DropdownMenuSeparator /> : null}
              <button
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  if (it.disabled) return;
                  setOpen(false);
                  it.onClick();
                }}
                className={[
                  // 对齐 web dropdown-menu.tsx:180-186
                  "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
                  "disabled:opacity-50 disabled:pointer-events-none",
                  // ⚠️ PC 无 tailwind-merge: web 靠 cn() 让「后写的赢」(destructive 的 danger-soft 底色生效),
                  //   PC 只能靠 CSS 产物顺序 —— 实测产物里 .bg-accent 早于 .bg-danger-soft
                  //   (25495 < 27210) ⇒ danger-soft 赢, 与 web 效果一致。
                  //   这里仍把两套 hover 拆成互斥分支: 不依赖调色板顺序, 也不会被将来新增 token 翻盘。
                  it.destructive
                    ? "text-danger hover:bg-danger-soft focus:bg-danger-soft"
                    : "text-fg hover:bg-accent focus:bg-accent",
                ].join(" ")}
              >
                {it.render ?? it.label}
              </button>
            </Fragment>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ────────── DropdownMenuSeparator — 菜单项之间的分隔线 ──────────

/**
 * 分隔线 — 逐字对齐 web `components/ui/dropdown-menu.tsx:195-206`:
 *   `<div role="separator" className={cn("my-1 h-px bg-border", className)} />`
 *
 * web 的用法是「独立组件, 夹在两个 DropdownMenuItem 之间」;
 * PC 的菜单是 items 数组形态 ⇒ 走 `DropdownMenuItem.separator` (本项之前画线),
 * 本组件同时导出, 供调用方在自定义渲染里复用同一份样式.
 */
export function DropdownMenuSeparator({ className }: { className?: string }) {
  return (
    <div
      role="separator"
      className={["my-1 h-px bg-border", className].filter(Boolean).join(" ")}
    />
  );
}

// ────────── TriggerChild — 包装 trigger 加 onClick + aria ──────────

import { cloneElement, isValidElement } from "react";

function TriggerChild({
  child,
  open,
  onTrigger,
}: {
  child: ReactElement;
  open: boolean;
  onTrigger: () => void;
}) {
  if (!isValidElement(child)) return child;
  // 已有 onClick 的话, 我们追加而不是覆盖 — 但 React 不直接支持,
  // 这里简单假设 trigger 是 button 且没有自定义 onClick (或愿意被覆盖);
  // 用户可以通过 items 直接包 DropdownMenu 进去, 我们接管 click.
  return cloneElement(child as ReactElement<Record<string, unknown>>, {
    "aria-haspopup": "menu",
    "aria-expanded": open,
    // 2026-10-26 · 共享组件补能力: web 的 trigger 带 `data-[state=open]:bg-muted`
    // (打开态底色) — PC 之前没有 data-state ⇒ 那条样式永远不生效.
    // 注入后, 调用方只要写 `data-[state=open]:bg-muted` 就能拿到 web 同款打开态.
    "data-state": open ? "open" : "closed",
    onClick: (e: React.MouseEvent) => {
      // 阻止默认 + 阻止冒泡, 防止外层 Link / onClick 多次触发
      e.preventDefault();
      e.stopPropagation();
      onTrigger();
    },
  });
}
