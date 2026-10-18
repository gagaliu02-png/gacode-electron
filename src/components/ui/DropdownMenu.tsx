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
            "absolute z-50 mt-1 min-w-[160px] rounded-md",
            "bg-bg-elevated shadow-dialog animate-fade-in py-1",
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
                "w-full text-left text-sm px-3 py-2",
                "transition-colors duration-150",
                "disabled:opacity-50 disabled:pointer-events-none",
                it.destructive
                  ? "text-danger hover:bg-danger-soft/30"
                  : "text-fg hover:bg-bg-sunken",
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
