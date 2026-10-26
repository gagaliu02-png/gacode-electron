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
 *       { label: '删除', destructive: true, onClick: () => ... },
 *     ]}
 *   />
 */

import {
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
  /** 自定义渲染 (一般就是 label; 留给 icons+text 的复合场景) */
  render?: ReactNode;
}

export interface DropdownMenuProps {
  /** 触发元素 (一般是 button) */
  trigger: ReactElement;
  items: DropdownMenuItem[];
  /** 触发对齐到 trigger 右下, 默认 right 下沿对齐 */
  align?: "left" | "right";
}

export function DropdownMenu({
  trigger,
  items,
  align = "right",
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
          ].join(" ")}
        >
          {items.map((it, i) => (
            <button
              key={i}
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
          ))}
        </div>
      ) : null}
    </div>
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
    onClick: (e: React.MouseEvent) => {
      // 阻止默认 + 阻止冒泡, 防止外层 Link / onClick 多次触发
      e.preventDefault();
      e.stopPropagation();
      onTrigger();
    },
  });
}
