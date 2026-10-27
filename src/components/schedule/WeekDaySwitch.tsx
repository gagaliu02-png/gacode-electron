/**
 * components/schedule/WeekDaySwitch.tsx — 手机端周视图的「周一~周日快捷切换条」 · PC 端 B4
 *
 * 抄自 web `gacode-web/src/components/schedule/WeekDaySwitch.tsx`, 只换 PC 写法:
 *   - `cn(...)` → 数组 filter(Boolean).join(" ")
 *
 * 1:1 对齐 prototype renderWeekDaySwitch @ line 1958-1983:
 *   - 7 个按钮 (周一~周日), 每个按钮里两行:
 *     一行 周几 (汉字「周一」), 一行 日 (数字);
 *   - 当前天 (isToday) 数字位加圆形高亮 (与 today 视觉一致);
 *   - 选中态: 「周一/周几」文字 brand 色 + 加粗, 数字位不抢色;
 *   - 桌面端不显示 (mobile only).
 *
 * 交互:
 *   - 点按钮 → 周视图跳到那一天 (focusIdx), 同时同步偏移 day;
 *   - 当前 focus 重新计算: 用户选过的优先, 否则上周内「今天」就用今天, 否则用第一天.
 */

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

interface WeekDaySwitchProps {
  /** 周一日期 (Date). 7 个按钮依次为周一~周日. */
  weekBase: Date;
  /** 当前聚焦的 day-of-week index (0..6, 0 = 周一 起点). */
  focusIdx: number;
  /** 今天 (yyyy-mm-dd). 用于圆点高亮. */
  todayKey: string;
  /** 周一~周日的 keys (长度固定 7). */
  weekKeys: string[];
  onSelect: (idx: number) => void;
}

export function WeekDaySwitch({
  weekBase,
  focusIdx,
  todayKey,
  weekKeys,
  onSelect,
}: WeekDaySwitchProps) {
  return (
    <div
      role="tablist"
      aria-label="周一至周日切换"
      data-week-day-switch
      className={[
        // 原型 .wday-switch: grid 7 列 / bg --card / border-bottom 1px rgba(255,255,255,.06) /
        //                   **position:sticky; top:0; z-index:2**
        "grid grid-cols-7 bg-card border-b border-white/[0.06] sticky top-0 z-[2]",
        // 桌面端 (>=1024px) 隐藏, 仅手机端显示 — 1:1 对齐 prototype CSS .wday-switch
        "lg:hidden",
      ].join(" ")}
    >
      {weekKeys.map((key, i) => {
        const d = new Date(weekBase.getFullYear(), weekBase.getMonth(), weekBase.getDate() + i);
        const isToday = key === todayKey;
        const isOn = i === focusIdx;
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={isOn}
            data-wday={i}
            data-wday-today={isToday ? "1" : "0"}
            data-wday-on={isOn ? "1" : "0"}
            onClick={() => onSelect(i)}
            className={[
              // 原型 .wday-switch button: padding 10px 2px 9px / flex column /
              //   align-items center / gap 3px / font 11px / --fg-muted
              "flex flex-col items-center gap-[3px] pt-[10px] px-[2px] pb-[9px] text-[11px] text-fg-muted",
              "transition-colors duration-150 hover:bg-white/[0.03] hover:text-fg",
              "border-l border-white/[0.05]",
              i === 0 && "border-l-0",
              isOn && "text-brand",
              isOn && "[&_.wd]:text-brand [&_.wd]:font-semibold",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="wd text-[11px]">{WEEKDAY_LABELS[d.getDay()]}</span>
            <span
              className={[
                "dd text-[14px] font-medium text-fg",
                isToday &&
                  "bg-brand text-brand-on w-6 h-6 rounded-full inline-grid place-items-center text-[13px]",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {d.getDate()}
            </span>
          </button>
        );
      })}
    </div>
  );
}
