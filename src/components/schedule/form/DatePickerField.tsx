/**
 * components/schedule/form/DatePickerField.tsx — 自绘日期选择器 (原型 .dp, 规格书 A5.2).
 *
 * 抄自 web `gacode-web/src/components/schedule/form/DatePickerField.tsx`, 只换 PC 写法:
 *   - `cn(...)`      → 数组 filter(Boolean).join(" ")
 *   - `lucide-react` 的 `CalendarDays` / `ChevronLeft` / `ChevronRight`
 *     → PC 图标唯一出处是 `components/ui/Glyphs.tsx`
 *     (`CalendarDaysIcon` — B6 新画 / `ChevronLeftIcon` — B4 已加 / `ChevronRightIcon` — 已有)
 *   - `import * as React from "react"` → 具名导入
 *
 * 为什么不用原生 <input type="date">:
 *   原生控件在部分环境弹不出来 (原型注释 L543-547), 一律自绘深色浮层。
 *
 * 视觉口径 (原型 L584-598 + L1442-1459):
 *   .dp      width 286px (手机 262px) / padding 10px 10px 8px
 *   .dp-h    上月 / 「YYYY年M月」(14px·500) / 下月 / padding 0 2px 8px
 *   .dp-w    7 列 grid / 11px --fg-subtle / padding 2px 0 4px / 文案「一二三四五六日」
 *   .dp-g    恒 42 格 (6 行 × 7 列) / aspect-ratio 1/1 / radius 8px / font 12.5px
 *            .today → 字 --brand + 600 ; .on → bg --brand + 字 --brand-on + 600
 *            越界 (key>max 或 key<min) → 字 --fg-subtle + opacity .32 + not-allowed
 *   .dp-f    「今天」+「清除」/ 12.5px --fg-muted / padding 5px 10px / radius full /
 *            bg rgba(255,255,255,.06)
 *   .pick    触发器 = .cselect-btn 同规格 (bg 6% 白 / radius full / padding 9px 14px / 14px)
 *            .empty .pv → 字 --fg-subtle ; .on → border --brand + 图标 brand
 *
 * ⚠️ **冲突类名处理** (Tailwind 3.4.19, 不用 `!important`):
 *   - 触发器: 基础类恒带 `border-transparent`, 展开态要 `border-brand` ⇒ 用
 *     `!border-brand` (important 覆盖顺序无关) —— PC 配色表里 `brand` 排在
 *     `transparent` 之前, 不加 `!` 的话展开态看不出描边。
 *   - 日期格: 基础类恒带 `text-fg`, 而「今天 / 选中 / 禁用」三态各要改字色 ⇒
 *     三态用**互斥分支** (disabled > isOn > today > 默认) 各自只产出**一个**字色类,
 *     彻底避开「两个 color 工具类谁赢」的排序问题; 选中态再单独加 `!text-brand-on`
 *     保证盖住基础类的 `text-fg`。
 */

import { useMemo, useRef, useState } from "react";
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon } from "../../ui/Glyphs";
import { PopPanel } from "./PopPanel";

const WEEK_TITLES = ["一", "二", "三", "四", "五", "六", "日"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseYmd(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 42 格起点 = 该月 1 号所在周的周一。 */
function gridStartOf(monthBase: Date): Date {
  const first = new Date(monthBase.getFullYear(), monthBase.getMonth(), 1);
  const back = (first.getDay() + 6) % 7;
  return new Date(first.getFullYear(), first.getMonth(), first.getDate() - back);
}

interface DatePickerFieldProps {
  value: string; // YYYY-MM-DD
  onChange: (v: string) => void;
  /** 可选上限 (YYYY-MM-DD) — 父级 DDL 约束 */
  maxDate?: string | null;
  /** 可选下限 (YYYY-MM-DD) */
  minDate?: string | null;
  /** 未设置时的占位文案 (原型 '未设置' / '留空 = 继承') */
  emptyLabel?: string;
  /** 底部是否给「清除」按钮 (可清除时) */
  clearable?: boolean;
  label?: string;
  id?: string;
}

export function DatePickerField({
  value,
  onChange,
  maxDate,
  minDate,
  emptyLabel = "未设置",
  clearable = true,
  label,
  id,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = parseYmd(value);
  const today = new Date();
  // 未选值 + 有上限 → 浮层直接开在上限那个月 (原型 L1433-1437)
  const [monthBase, setMonthBase] = useState<Date>(() => {
    if (selected) return new Date(selected.getFullYear(), selected.getMonth(), 1);
    const max = parseYmd(maxDate || "");
    if (max) return new Date(max.getFullYear(), max.getMonth(), 1);
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const close = () => setOpen(false);

  const openPop = () => {
    if (selected) setMonthBase(new Date(selected.getFullYear(), selected.getMonth(), 1));
    else {
      const max = parseYmd(maxDate || "");
      if (max) setMonthBase(new Date(max.getFullYear(), max.getMonth(), 1));
    }
    setOpen(true);
  };

  const cells = useMemo(() => {
    const start = gridStartOf(monthBase);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      return { key: ymd(d), day: d.getDate() };
    });
  }, [monthBase]);

  const todayKey = ymd(today);
  const maxKey = maxDate || null;
  const minKey = minDate || null;

  const shiftMonth = (delta: number) => {
    setMonthBase((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  return (
    <>
      <button
        ref={anchorRef}
        id={id}
        type="button"
        aria-label={label ? `${label} 选择器` : "日期选择器"}
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPop())}
        className={[
          // 原型 .pick
          "w-full flex items-center justify-between gap-2 bg-white/[0.06] border border-transparent",
          "rounded-full px-3.5 py-[9px] text-sm text-fg text-left",
          "transition-[background,border-color,box-shadow] duration-150 hover:bg-white/[0.1]",
          "focus-visible:outline-none focus-visible:border-brand focus-visible:shadow-[0_0_0_1px_var(--brand)]",
          // ⚠️ `!border-brand`: 基础类恒带 `border-transparent` ⇒ 必须用 important 覆盖。
          open && "!border-brand",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span
          className={[
            "pv min-w-0 overflow-hidden text-ellipsis whitespace-nowrap",
            !value && "text-fg-subtle",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {value || emptyLabel}
        </span>
        <CalendarDaysIcon
          size={14}
          className={[
            "ic w-[14px] h-[14px] shrink-0 opacity-55",
            open && "opacity-100 text-brand",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      </button>

      {open && (
        <PopPanel open={open} anchorRef={anchorRef} onClose={close}>
          {/* 原型 .dp: width 286px / padding 10px 10px 8px (外层 .pop 的 6px 内边距另算) */}
          <div className="w-[286px] max-[641px]:w-[262px] px-[10px] pt-[10px] pb-2">
            {/* 原型 .dp-h */}
            <div className="flex items-center justify-between gap-1.5 px-0.5 pb-2">
              <button
                type="button"
                aria-label="上一月"
                onClick={() => shiftMonth(-1)}
                className="w-[26px] h-[26px] rounded-full grid place-items-center text-fg-muted hover:bg-white/[0.07] hover:text-fg transition-colors duration-150"
              >
                <ChevronLeftIcon size={16} className="w-4 h-4" />
              </button>
              <div className="t text-sm font-medium">
                {monthBase.getFullYear()}年{monthBase.getMonth() + 1}月
              </div>
              <button
                type="button"
                aria-label="下一月"
                onClick={() => shiftMonth(1)}
                className="w-[26px] h-[26px] rounded-full grid place-items-center text-fg-muted hover:bg-white/[0.07] hover:text-fg transition-colors duration-150"
              >
                <ChevronRightIcon size={16} className="w-4 h-4" />
              </button>
            </div>

            {/* 原型 .dp-w */}
            <div className="grid grid-cols-7 gap-[2px]">
              {WEEK_TITLES.map((w) => (
                <div key={w} className="text-center text-[11px] text-fg-subtle py-0.5 pb-1">
                  {w}
                </div>
              ))}
            </div>

            {/* 原型 .dp-g (恒 42 格) */}
            <div className="grid grid-cols-7 gap-[2px]">
              {cells.map((c) => {
                const disabled =
                  (maxKey != null && c.key > maxKey) || (minKey != null && c.key < minKey);
                const isOn = c.key === value;
                const isToday = c.key === todayKey;
                // ⚠️ 三态**互斥** (disabled > isOn > isToday > 默认) —— 每格只出一个字色类,
                //    避免「基础 text-fg + 状态字色」两个 color 工具类互相盖。
                //    原型 .dp-g button:disabled { color:var(--fg-subtle); opacity:.32; cursor:not-allowed }
                //    ⚠️ opacity-32 **不是**合法 Tailwind class (默认刻度是 0/5/10/…/95/100, 没有 32)
                //       → 编译后无此规则, 禁用格看起来跟可用格一样。任意值写法保住原型的 .32。
                const stateCls = disabled
                  ? "!text-fg-subtle opacity-[0.32] cursor-not-allowed"
                  : isOn
                    ? "bg-brand !text-brand-on font-semibold"
                    : isToday
                      ? "!text-brand font-semibold"
                      : "";
                return (
                  <button
                    key={c.key}
                    type="button"
                    disabled={disabled}
                    data-date-cell={c.key}
                    onClick={() => {
                      onChange(c.key);
                      setOpen(false);
                    }}
                    className={[
                      // 原型 .dp-g button: aspect-ratio 1/1 / radius 8px / font 12.5px
                      "aspect-square grid place-items-center text-[12.5px] rounded-[8px] text-fg",
                      "transition-colors duration-100",
                      !disabled && "hover:bg-white/[0.09]",
                      stateCls,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {c.day}
                  </button>
                );
              })}
            </div>

            {/* 原型 .dp-f */}
            <div className="flex gap-2 justify-between items-center mt-2 pt-2 border-t border-white/[0.07]">
              <button
                type="button"
                onClick={() => {
                  onChange(todayKey);
                  setOpen(false);
                }}
                className="text-[12.5px] text-fg-muted px-2.5 py-[5px] rounded-full bg-white/[0.06] transition-colors duration-150 hover:bg-white/[0.12] hover:text-fg"
              >
                今天
              </button>
              {clearable && (
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="text-[12.5px] text-fg-muted px-2.5 py-[5px] rounded-full bg-white/[0.06] transition-colors duration-150 hover:bg-white/[0.12] hover:text-fg"
                >
                  清除
                </button>
              )}
            </div>
          </div>
        </PopPanel>
      )}
    </>
  );
}
