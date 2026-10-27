/**
 * components/schedule/MonthView.tsx — 月视图 (42 格日历 + 头部 7 列「一二三四五六日」) · PC 端 B4
 *
 * 抄自 web `gacode-web/src/components/schedule/MonthView.tsx`, 只换 PC 写法:
 *   - `cn(...)`      → 数组 filter(Boolean).join(" ")
 *   - `lucide-react` → PC 图标唯一出处是 `components/ui/Glyphs.tsx` (`Clock` → `ClockIcon`)
 *   - `bg-[var(--cron-soft)] text-[var(--cron)]` → `bg-cron/[0.16] text-cron`
 *     (PC 的 `styles/globals.css` 里**没有** `--cron` / `--cron-soft` 变量 ⇒ 直接用
 *      Tailwind 色阶最稳 —— 跟本仓 `CronGroup.tsx:91` 已有的写法一致)
 *
 * 视觉契约 v6 (1:1 对齐 prototype **生效版** renderMonth @ line 2107):
 *
 *   ⚠️ 关于 renderMonth 参照选择:
 *      prototype line 1905 和 2107 都定义了 renderMonth, JS 后定义覆盖前定义.
 *      **v6 实际生效的是 line 2107** (1905 被覆盖, 但仍未删除).
 *      本组件照 2107 翻译 — 因为只有这一份在用户机器上真跑过.
 *      两者差异只在 `untimed` 类名 (1905 没有, 2107 加了).
 *      v6 必填了 startAt, 所以 untimed 永远 false, 但 2107 写法留着更贴近生效版.
 *
 *   月视图核心规则:
 *     - 6 周 × 7 天 = 42 格, 从本月 1 号所在周的**周一**起算 (回退 n 天, n=(1号.getDay()+6)%7)
 *     - 不是当月的格子置灰 (.mc.out)
 *     - 当天数字有 brand 圆形高亮 (.mc.today .dnum)
 *     - 每格头部显示日期数字 (dnum), 然后是事件 chip
 *     - 事件 chip: 当日 events 取前 3, 超出的 chip 显示「+N 更多」(点 N 跳转该天 day 视图)
 *     - cron 走专属样式 (紫底 + 定时器), 普通 schedule 按 effectiveStatus 走 done / not-done
 *     - **批注 3**: start/end 必填 — 日格里不再出现全天类 (原 v5 "无起始时间" 的) chip,
 *       全部走普通事件块.
 *
 *   交互 (⚠️ gaga 2026-10-21 生产实测反馈 —— 已改, 见下):
 *     - 点格子空白处 → 跳周视图并定位那天 (onPickDay)
 *     - 点「+N 更多」→ 同上
 *     - **点任何一条条目 chip (日程 / 定时任务) → 一律跳周视图并定位那天** ——
 *       月视图**不再**进日程详情。gaga 原话:
 *       「月视图点某一天,不可以调转到详情,，而是要进入到周视图里的这一天。
 *         现在点击更多是这个逻辑,但是点击日程还是会进入日程详情。
 *         日程详情只在周视图里才能看到哦。」
 *       → 本组件**不再有**详情页入口 (对应 prop 已整个移除);
 *         日程详情只从周视图的事件块可达。
 */

import { addDays, dateToYmd, monthEventsFor } from "./calendar-utils";
import type { MonthEvent } from "./calendar-utils";
import type { CronJob, ItemStatus, ScheduleItem } from "../../lib/schedule-api";
import { describeCron } from "./format";
import { ClockIcon } from "../ui/Glyphs";

interface MonthViewProps {
  /** 月内任意一天 (取年月日). */
  monthBase: Date;
  /** 该月 1 号所在周的周一 (42 格起点). */
  gridStart: Date;
  /** gridStart + 41 = gridEnd. */
  todayKey: string;
  schedulesInRange: ScheduleItem[];
  crons: CronJob[];
  effectiveStatus: (item: ScheduleItem) => ItemStatus;
  /** 已逾期判定 (原型 .mc .ev.over { color: --danger }). */
  isOverdue: (item: ScheduleItem) => boolean;
  /** 点格子 → 跳到那一天 day 视图 (回调把 dayKey 上抛)。 */
  onPickDay: (dayKey: string) => void;
  /**
   * ⚠️ **本组件没有详情页入口** (gaga 2026-10-21 生产实测) ——
   *   月视图点任何条目都只做一件事: 跳周视图并定位那天。
   *   日程详情**只从周视图**可达。
   */
}

const WEEKDAY_TITLES = ["一", "二", "三", "四", "五", "六", "日"];

export function MonthView({
  monthBase,
  gridStart,
  todayKey,
  schedulesInRange,
  crons,
  effectiveStatus,
  isOverdue,
  onPickDay,
}: MonthViewProps) {
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  return (
    <div
      data-month-view
      data-month={`${monthBase.getFullYear()}-${String(monthBase.getMonth() + 1).padStart(2, "0")}`}
      className="bg-card rounded-2xl mt-1 overflow-hidden"
    >
      {/* 头部: 周一~周日 (原型 .mh —— 文案是「一二三四五六日」, 不是「周一...」) */}
      <div className="grid grid-cols-7 border-b border-white/[0.06]">
        {WEEKDAY_TITLES.map((w) => (
          <div
            key={w}
            className="px-1 py-[9px] text-center text-[11px] text-fg-subtle border-l border-white/[0.05] first:border-l-0"
          >
            {w}
          </div>
        ))}
      </div>

      {/* 42 格日历 */}
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const key = dateToYmd(d);
          const out = d.getMonth() !== monthBase.getMonth();
          const isToday = key === todayKey;
          const evs = monthEventsFor(key, schedulesInRange, crons);
          const visible = evs.slice(0, 3);
          const more = evs.length - 3;
          return (
            <div
              key={key}
              data-month-cell
              data-day={key}
              data-out={out ? "1" : "0"}
              data-today={isToday ? "1" : "0"}
              className={[
                // 原型 .mc: min-height 96px / padding 5px 4px / 上下左边线 /
                //           hover bg rgba(255,255,255,.03)
                "relative min-h-[74px] min-[641px]:min-h-[96px] border-t border-l border-white/[0.05]",
                "p-[3px] min-[641px]:p-[5px] min-[641px]:px-1",
                "hover:bg-white/[0.03] transition-colors duration-150",
                "first:border-l-0",
              ].join(" ")}
            >
              {/* 日期数字 (原型 .dnum: 12px / radius full / padding 1px 4px / min-width 22px) */}
              <div
                className={[
                  "text-[11px] min-[641px]:text-[12px] inline-block min-w-[20px] min-[641px]:min-w-[22px]",
                  "px-1 py-px rounded-full mb-1",
                  isToday
                    ? "bg-brand text-brand-on font-semibold"
                    : out
                      ? "text-fg-subtle opacity-50"
                      : "text-fg-muted",
                ].join(" ")}
              >
                {d.getDate()}
              </div>

              {/* 事件 chip */}
              <div className="flex flex-col gap-0.5">
                {visible.map((ev, i) => (
                  <MonthEventChip
                    key={i}
                    ev={ev}
                    dayKey={key}
                    effectiveStatus={effectiveStatus}
                    isOverdue={isOverdue}
                    onPickDay={onPickDay}
                  />
                ))}
                {more > 0 && (
                  <button
                    type="button"
                    data-more
                    className="text-left text-[10px] text-fg-subtle pl-1.5 hover:text-fg"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPickDay(key);
                    }}
                  >
                    +{more} 更多
                  </button>
                )}
              </div>

              {/* 点空白 → 跳 day */}
              {!out && (
                <button
                  type="button"
                  aria-label={`跳到 ${key}`}
                  className="absolute inset-0 -z-10 cursor-pointer"
                  onClick={() => onPickDay(key)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MonthEventChip
// ---------------------------------------------------------------------------

interface MonthEventChipProps {
  ev: MonthEvent;
  /** 该 chip 所在的日历日 (YYYY-MM-DD) —— 点它要定位到的那天。 */
  dayKey: string;
  effectiveStatus: (item: ScheduleItem) => ItemStatus;
  isOverdue: (item: ScheduleItem) => boolean;
  /**
   * 点 chip → **跳周视图并定位到这一天** (gaga 2026-10-21 生产实测)。
   *   ⚠️ 不再进详情页 —— 日程详情只在周视图里能打开。
   */
  onPickDay: (dayKey: string) => void;
}

function MonthEventChip({
  ev,
  dayKey,
  effectiveStatus,
  isOverdue,
  onPickDay,
}: MonthEventChipProps) {
  const { ref, kind, t } = ev;
  if (kind === "cron") {
    const c = ref as CronJob;
    return (
      <div
        className={[
          // 原型 .mc .ev.cron: padding-left 17px (给 12px 定时器图标让位)
          "flex items-center gap-1 text-[11px] min-[641px]:text-[12px] leading-[15px] min-[641px]:leading-[16px]",
          "px-[4px] min-[641px]:px-[5px] py-px min-[641px]:py-[2px] rounded-[5px] min-[641px]:rounded-[6px]",
          "bg-cron/[0.16] text-cron truncate cursor-pointer",
        ].join(" ")}
        title={`${c.title} · ${describeCron(c.cronExpr)}`}
        data-event-cron
        data-pick-day={dayKey}
        onClick={(e) => {
          e.stopPropagation();
          onPickDay(dayKey);
        }}
      >
        <ClockIcon size={10} strokeWidth={2} className="w-[10px] h-[10px] shrink-0" />
        <span className="truncate">{c.title}</span>
      </div>
    );
  }
  const s = ref as ScheduleItem;
  const status = effectiveStatus(s);
  const over = isOverdue(s);
  return (
    <div
      className={[
        // 原型 .mc .ev: 12px/16px / padding 2px 5px / radius 6px / bg --bg-elevated /
        //               **border-left 2px** (类型色) / 无阴影 / 标题 2 行截断
        "text-[11px] min-[641px]:text-[12px] leading-[15px] min-[641px]:leading-[16px]",
        "px-[4px] min-[641px]:px-[5px] py-px min-[641px]:py-[2px] rounded-[5px] min-[641px]:rounded-[6px]",
        "bg-bg-elevated border-l-2 hover:bg-[#242424] transition-colors duration-150 cursor-pointer",
        // 原型 .mc .ev.done { opacity:.45 } / .mc .ev.over { color: --danger }
        status === "done" && "opacity-45",
        over && "text-danger",
        status === "in_progress"
          ? "border-brand-cyan"
          : status === "done"
            ? "border-success"
            : "border-brand",
      ]
        .filter(Boolean)
        .join(" ")}
      title={`${s.title} (${s.startAt}–${s.endAt})`}
      data-event-schedule
      data-status={status}
      data-over={over ? "1" : "0"}
      data-time={t}
      data-pick-day={dayKey}
      onClick={(e) => {
        e.stopPropagation();
        onPickDay(dayKey);
      }}
    >
      {/* 原型 .mc .ev.done .evtx { text-decoration: line-through } — 只作用在标题上 */}
      <span
        className={[
          "line-clamp-2 break-words",
          status === "done" && "line-through",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {s.title}
      </span>
    </div>
  );
}
