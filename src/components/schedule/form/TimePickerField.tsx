/**
 * components/schedule/form/TimePickerField.tsx — 自绘时间选择器 (原型 .tp, 规格书 A5.3).
 *
 * 抄自 web `gacode-web/src/components/schedule/form/TimePickerField.tsx`, 只换 PC 写法:
 *   - `cn(...)`      → 数组 filter(Boolean).join(" ")
 *   - `lucide-react` 的 `Clock` → PC 图标唯一出处是 `components/ui/Glyphs.tsx`
 *     (`ClockIcon`)
 *   - `import * as React from "react"` → 具名导入
 *
 * ⚠️ **`ClockIcon` 必须显式传 `strokeWidth={2}`** ——
 *   PC 的 `ClockIcon` 默认 strokeWidth = **1.6** (PC 自己那些小尺寸图标的老口径),
 *   而 lucide 的 `Clock` 是 **2** ⇒ 不显式传就会比 web 细一档 (B4 已踩过这个坑)。
 *
 * 为什么不用原生 <input type="time">:
 *   原生控件在部分环境弹不出来 (原型注释 L543-547), 一律自绘深色浮层。
 *
 * 视觉口径 (原型 L600-608 + L1484-1494):
 *   .tp       width 236px (手机 222px) / padding 8px
 *   .tp-cols  flex / gap 6px
 *   .tp-col   flex 1 / max-height 186px / overflow-y auto
 *             列头「时」「分」11px --fg-subtle / sticky top / bg #181818
 *   数字按钮  padding 7px 4px / radius 8px / font 13.5px / hover bg rgba(255,255,255,.07)
 *             .on → bg --brand + 字 --brand-on + 600
 *   底部      「清除」+「现在」
 *   默认值    无值时显示 09:30 (时 9 / 分 30)
 *
 * ⚠️ **冲突类名处理** (Tailwind 3.4.19, 不用 `!important`):
 *   - 触发器展开态的 `border-brand` 要盖住基础类的 `border-transparent` ⇒ `!border-brand`。
 *   - 数字按钮选中态的 `text-brand-on` 要盖住基础类的 `text-fg` ⇒ `!text-brand-on`
 *     (PC 配色表里 `brand-on` 排在 `fg` **前面**, 不加 `!` 会被 `text-fg` 盖掉)。
 */

import { useRef, useState } from "react";
import { ClockIcon } from "../../ui/Glyphs";
import { PopPanel } from "./PopPanel";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

interface TimePickerFieldProps {
  value: string; // HH:mm
  onChange: (v: string) => void;
  emptyLabel?: string;
  label?: string;
  id?: string;
}

export function TimePickerField({
  value,
  onChange,
  emptyLabel = "未设置",
  label,
  id,
}: TimePickerFieldProps) {
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState<number>(() => {
    const m = /^(\d{1,2}):/.exec(value || "");
    return m ? Number(m[1]) : 9; // 原型默认 9 点
  });
  const [minute, setMinute] = useState<number>(() => {
    const m = /:(\d{2})/.exec(value || "");
    return m ? Number(m[1]) : 30; // 原型默认 30 分
  });

  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const close = () => setOpen(false);

  const openPop = () => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(value || "");
    if (m) {
      setHour(Number(m[1]));
      setMinute(Number(m[2]));
    }
    setOpen(true);
  };

  const commit = (h: number, mi: number) => {
    onChange(`${pad2(h)}:${pad2(mi)}`);
  };

  return (
    <>
      <button
        ref={anchorRef}
        id={id}
        type="button"
        aria-label={label ? `${label} 选择器` : "时间选择器"}
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
        {/* ⚠️ strokeWidth={2}: PC 的 ClockIcon 默认 1.6, lucide 的 Clock 是 2 (见文件头)。 */}
        <ClockIcon
          size={14}
          strokeWidth={2}
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
          {/* 原型 .tp: width 236px / padding 8px (外层 .pop 的 6px 内边距另算) */}
          <div className="w-[236px] max-[641px]:w-[222px] p-2">
            <div className="flex gap-1.5 min-h-0">
              {/* 时 */}
              <div className="flex-1 max-h-[186px] overflow-y-auto min-h-0">
                <div className="text-[11px] text-fg-subtle text-center py-0.5 pb-1.5 sticky top-0 bg-bg-elevated">
                  时
                </div>
                {Array.from({ length: 24 }, (_, h) => (
                  <button
                    key={h}
                    type="button"
                    data-hour={h}
                    onClick={() => {
                      setHour(h);
                      commit(h, minute);
                    }}
                    className={[
                      "block w-full text-center px-1 py-[7px] rounded-[8px] text-[13.5px] text-fg",
                      "transition-colors duration-100 hover:bg-white/[0.07]",
                      // ⚠️ `!text-brand-on`: 盖住基础类的 `text-fg` (见文件头)。
                      hour === h && "bg-brand !text-brand-on font-semibold",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {pad2(h)}
                  </button>
                ))}
              </div>
              {/* 分 */}
              <div className="flex-1 max-h-[186px] overflow-y-auto min-h-0">
                <div className="text-[11px] text-fg-subtle text-center py-0.5 pb-1.5 sticky top-0 bg-bg-elevated">
                  分
                </div>
                {Array.from({ length: 60 }, (_, mi) => (
                  <button
                    key={mi}
                    type="button"
                    data-minute={mi}
                    onClick={() => {
                      setMinute(mi);
                      commit(hour, mi);
                    }}
                    className={[
                      "block w-full text-center px-1 py-[7px] rounded-[8px] text-[13.5px] text-fg",
                      "transition-colors duration-100 hover:bg-white/[0.07]",
                      // ⚠️ `!text-brand-on`: 盖住基础类的 `text-fg` (见文件头)。
                      minute === mi && "bg-brand !text-brand-on font-semibold",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {pad2(mi)}
                  </button>
                ))}
              </div>
            </div>

            {/* 底部: 清除 + 现在 */}
            <div className="flex gap-2 justify-between items-center mt-2 pt-2 border-t border-white/[0.07]">
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
              <button
                type="button"
                onClick={() => {
                  const d = new Date();
                  const h = d.getHours();
                  const mi = d.getMinutes();
                  setHour(h);
                  setMinute(mi);
                  commit(h, mi);
                  setOpen(false);
                }}
                className="text-[12.5px] text-fg-muted px-2.5 py-[5px] rounded-full bg-white/[0.06] transition-colors duration-150 hover:bg-white/[0.12] hover:text-fg"
              >
                现在
              </button>
            </div>
          </div>
        </PopPanel>
      )}
    </>
  );
}
