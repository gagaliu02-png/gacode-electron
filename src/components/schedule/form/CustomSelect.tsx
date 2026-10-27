/**
 * components/schedule/form/CustomSelect.tsx — 自定义下拉 (原型 .cselect, 规格书 A5.1).
 *
 * 抄自 web `gacode-web/src/components/schedule/form/CustomSelect.tsx`, 只换 PC 写法:
 *   - `cn(...)`      → 数组 filter(Boolean).join(" ")
 *   - `lucide-react` 的 `ChevronDown` → PC 图标唯一出处是 `components/ui/Glyphs.tsx`
 *     (`ChevronDownIcon`)
 *   - `import * as React from "react"` → 具名导入
 *
 * 为什么不用原生 <select>:
 *   原生下拉的系统层不受 CSS 控制 (永远白底黑字), 在 PWA / 移动端 WebView 里
 *   跟原型的深色浮层完全对不上 —— 原型注释明写「全部自绘深色浮层」(L543-547)。
 *
 * 视觉口径 (原型 L549-582):
 *   .cselect-btn  bg rgba(255,255,255,.06) / border 1px transparent / radius full /
 *                 padding 9px 14px / font 14px / gap 10px / space-between
 *                 hover bg rgba(255,255,255,.1) / focus-visible border --brand + 1px ring
 *   .cselect-caret 13px / opacity .55 / 展开时 rotate(180deg)
 *   .pop (共用)   position:fixed / z 145 / bg #181818 / border 1px rgba(255,255,255,.09) /
 *                 radius 16px / shadow --shadow-dialog / padding 6px /
 *                 max-height min(72vh,460px) / overflow hidden
 *   .pop-item     padding 9px 10px / radius 8px / font 14px / gap 9px /
 *                 hover bg rgba(255,255,255,.07)
 *                 [aria-selected=true] → 字 --brand + 500, ::after 追加 ✓
 *
 * 键盘: ↑/↓ 移动高亮 + scrollIntoView({block:'nearest'}), Enter 选中, Esc 关闭。
 *
 * ⚠️ **冲突类名用 `!` 前缀** (Tailwind 3.4.19, 不要 `!important`):
 *   选中项基础类里有 `text-fg`, 选中态要 `text-brand` —— 两者都写 `color`,
 *   而 PC 的 tailwind.config.ts 里 `brand` 排在 `fg` **前面** ⇒ 不加 `!` 的话
 *   `text-fg` 会后生成并盖掉 `text-brand` ⇒ 选中项看不出高亮。
 *   ⇒ 选中态写 `!text-brand`。
 */

import { useCallback, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { ChevronDownIcon } from "../../ui/Glyphs";
import { PopPanel } from "./PopPanel";

export interface CustomSelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  /** 未选中时的占位文案 (原型 '请选择') */
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  /** 测试 / 实测锚点 */
  id?: string;
}

export function CustomSelect({
  value,
  options,
  onChange,
  placeholder = "请选择",
  ariaLabel = "选择",
  className,
  id,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(0);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const close = useCallback(() => setOpen(false), []);

  const selected = options.find((o) => o.value === value);

  const openPop = () => {
    const idx = Math.max(0, options.findIndex((o) => o.value === value));
    setCur(idx);
    setOpen(true);
  };

  const move = useCallback(
    (delta: number) => {
      setCur((c) => {
        const next = (c + delta + options.length) % options.length;
        itemRefs.current[next]?.scrollIntoView({ block: "nearest" });
        return next;
      });
    },
    [options.length],
  );

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openPop();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[cur];
      if (opt) {
        onChange(opt.value);
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={anchorRef}
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPop())}
        onKeyDown={onKeyDown}
        className={[
          // 原型 .cselect-btn
          "w-full flex items-center justify-between gap-2.5 bg-white/[0.06] border border-transparent",
          "rounded-full px-3.5 py-[9px] text-sm text-fg text-left",
          "transition-[background,border-color,box-shadow] duration-150 hover:bg-white/[0.1]",
          "focus-visible:outline-none focus-visible:border-brand focus-visible:shadow-[0_0_0_1px_var(--brand)]",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span className="cselect-label min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDownIcon
          size={13}
          className={[
            "cselect-caret w-[13px] h-[13px] shrink-0 opacity-55 transition-transform duration-150",
            open && "rotate-180",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      </button>

      {open && (
        <PopPanel open={open} anchorRef={anchorRef} onClose={close}>
          <div ref={listRef} className="overflow-y-auto min-h-0 flex-1">
            {options.map((o, i) => (
              <button
                key={o.value}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={[
                  // 原型 .pop-item
                  "w-full flex items-center gap-[9px] text-left px-2.5 py-[9px] rounded-[8px] text-sm text-fg",
                  "transition-colors duration-100 whitespace-nowrap",
                  i === cur ? "bg-white/[0.07]" : "hover:bg-white/[0.07]",
                  // ⚠️ `!text-brand`: 基础类里的 `text-fg` 会在 PC 的 Tailwind 配色顺序里
                  //    后生成 → 不加 `!` 会盖掉选中高亮 (详见文件头说明)。
                  o.value === value && "!text-brand font-medium",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                onMouseEnter={() => setCur(i)}
              >
                {o.label}
                {o.value === value && <span className="ml-auto text-brand">✓</span>}
              </button>
            ))}
          </div>
        </PopPanel>
      )}
    </>
  );
}
