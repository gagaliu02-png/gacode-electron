/**
 * components/schedule/WeekView.tsx — 周视图 (桌面 7 列 / 手机折叠单天) · PC 端 B4
 *
 * 抄自 web `gacode-web/src/components/schedule/WeekView.tsx`, 只换 PC 写法:
 *   - `cn(...)`      → 数组 filter(Boolean).join(" ")
 *   - `lucide-react` → PC 图标唯一出处是 `components/ui/Glyphs.tsx` (`Clock` → `ClockIcon`)
 *   - `bg-[var(--cron-soft)] text-[var(--cron)] border-[var(--cron)]`
 *     → `bg-cron/[0.16] text-cron border-cron`
 *     (PC 的 `styles/globals.css` 里**没有** `--cron` / `--cron-soft` 变量 ⇒ 用
 *      Tailwind 色阶 —— 跟本仓 `CronGroup.tsx:91` 已有的写法一致)
 *   - `React.CSSProperties` / `React.MouseEvent` → 从 react 具名 import 类型
 *
 * ⚠️ **mobile / desktop 两套渲染都保留** —— 跟 web 同款 (PC 窗口可以缩到 <1024px,
 *   折叠成单天 + WeekDaySwitch 才是那条窄屏体验)。
 *
 * 视觉契约 v6 (1:1 对齐 prototype renderWeek @ line 1984):
 *
 *   📱 **mobile** (<1024px):
 *     - 顶部 WeekDaySwitch (周一~周日快捷切换条) — 由 WeekDaySwitch.tsx 渲;
 *     - 下方是 1 个时间轴 (折叠成单天 = 当前 focus 这天);
 *     - 渲染范围 = dayRenderRange(单天 events), 不是整周并集 (原型 line 2000);
 *     - 整周无事件 → 隐藏时间轴, 显示空状态 (line 2002).
 *     - 手机端周视图 = 折叠成单天 (gaga P0-C 取消日视图后, 手机端唯一的单天视图
 *       就是这个 —— 原来还有一个独立的 DayView 组件, 已删除)。
 *       整列渲染复用同一份 dayRenderRange / layoutDay / EventBlock 算法.
 *       这里走 inline.
 *
 *   🖥️ **desktop** (>=1024px):
 *     - 7 列等宽满屏;
 *     - 渲染范围 = weekRenderRange (整周并集 ±1);
 *     - 顶部 7 个「周X · 日」头部 (当天高亮);
 *     - 整周无事件 → 显示空状态 (line 2050).
 *     - **点某一天 = 选中那一天** (2026-10-22 修): 表头可点、该列空白处可点,
 *       走的是**跟手机端切换条同一个 onFocusChange** → CalendarView 的 weekFocus。
 *       桌面 7 天本来就在屏上, 所以「选中」落成 **该日定位 + 高亮** (data-focus-col /
 *       data-focus-head / 横向滚动居中), 而不是像手机那样只渲染那一天 —— 两端同一份状态,
 *       只是「聚焦」在桌面是定位、在手机是筛选。
 *
 * ⚠️ **重叠事件 = 并排 (Google Calendar 式), 不折叠** —— 2026-10-21 gaga 拍板:
 *   旧实现 (原型 v6 批注 1.3) 同一时段最多排 2/3 列, 排不下的收成一个
 *   「N 项 · 点开看全部」的两点占位 —— gaga 实测反馈「莫名其妙」
 *   (那个 N 是当天全部条目数, 跟实际折叠的那一个重叠簇对不上)。
 *   → 现在: **取消列数上限**, 一个重叠簇里有几条就并排几条, 每条占 1/N 宽度,
 *     **一条都不藏**; 「N 项 · 点开看全部」触发器 + 就地展开面板 (accordion)
 *     已**彻底删除** (weekExpand.ts 整个文件已 git rm)。
 *
 *   窄标题看全名 (并排后列很窄, 标题会被截断):
 *     - **桌面**: hover 事件块 → 原生 `title` tooltip 显示完整标题;
 *     - **手机**: hover 不存在 → **长按事件块** → 弹「完整标题」气泡
 *       (长按不吞掉点击, 普通点击照旧进详情页);
 *     - 两端同一个实现 (长按在桌面用鼠标按住也成立)。
 *
 * 关于 renderMonth 参照说明:
 *   prototype 的 renderMonth 在 line 1905 / line 2107 写了两次, JS 后定义覆盖前,
 *   实际生效的是 line 2107. **本组件对应的 renderWeek/renderDay**:
 *     - renderWeek 全文只有一处定义 (line 1984), 不重复;
 *     - renderDay 也只有一处 (line 2078).
 *   所以直接照 line 1984-2076 翻译. 没踩 renderMonth 那个坑.
 */

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import {
  addDays,
  dateToYmd,
  dayRenderRange,
  hourHOf,
  layoutDay,
  weekRenderRange,
} from "./calendar-utils";
import type { CalEvent, PositionedEvent } from "./calendar-utils";
import { describeCron } from "./format";
import { WeekDaySwitch } from "./WeekDaySwitch";
import { ClockIcon } from "../ui/Glyphs";
import type { CronJob, ItemStatus, ScheduleItem } from "../../lib/schedule-api";

interface WeekViewProps {
  /** 周一 (Date). 7 个 cell = 周一~周日. */
  weekBase: Date;
  /** 周一~周日的 keys (长度固定 7) — 由 CalendarView 算. */
  weekKeys: string[];
  /** 该周每天的 events (下标 0 = 周一, 6 = 周日). */
  eventsByDay: Record<string, CalEvent[]>;
  /** 时钟锚点 (本机时间). */
  now: Date;
  /** 桌面/手机. */
  viewport: "mobile" | "desktop";
  /** ScheduleItem 的 effectiveStatus. */
  effectiveStatus: (item: ScheduleItem) => ItemStatus;
  /** 已逾期判定 (原型 .ev.over .et 字 --danger). */
  isOverdue: (item: ScheduleItem) => boolean;
  /**
   * 当前选中的那一天 (0 = 周一 … 6 = 周日)。
   *
   * **两端共用同一份状态** (CalendarView 的 weekFocus), 不是两套:
   *   - mobile: 决定**渲染哪一天** (折叠成单天);
   *   - desktop: 决定**哪一列被定位/高亮** (7 列都在屏上)。
   */
  focusIdx: number;
  /**
   * 选中日切换 —— 手机端点切换条 / 桌面端点表头或那一列的空白处, 都走同一个 setter,
   * 所以「点某一天」在两端是同一套行为 (2026-10-22 修: 宽屏点某天原本完全没接上)。
   */
  onFocusChange: (idx: number) => void;
  /** 点事件块 → 进详情页 (原型 B2: .ev 的 data-open → openDetail)。 */
  onOpenDetail?: (kind: "schedule" | "cron", id: string) => void;
}

const EVENT_MIN_H_DESKTOP = 24;
const EVENT_MIN_H_MOBILE = 44;

export function WeekView({
  weekBase,
  weekKeys,
  eventsByDay,
  now,
  viewport,
  effectiveStatus,
  isOverdue,
  focusIdx,
  onFocusChange,
  onOpenDetail,
}: WeekViewProps) {
  if (viewport === "mobile") {
    return (
      <MobileWeek
        weekBase={weekBase}
        weekKeys={weekKeys}
        eventsByDay={eventsByDay}
        now={now}
        focusIdx={focusIdx}
        onFocusChange={onFocusChange}
        effectiveStatus={effectiveStatus}
        isOverdue={isOverdue}
        onOpenDetail={onOpenDetail}
      />
    );
  }
  return (
    <DesktopWeek
      weekBase={weekBase}
      weekKeys={weekKeys}
      eventsByDay={eventsByDay}
      now={now}
      focusIdx={focusIdx}
      onFocusChange={onFocusChange}
      effectiveStatus={effectiveStatus}
      isOverdue={isOverdue}
      onOpenDetail={onOpenDetail}
    />
  );
}

// ---------------------------------------------------------------------------
// Mobile — 单天 + 切换条
// ---------------------------------------------------------------------------

interface MobileWeekProps
  extends Pick<
    WeekViewProps,
    | "weekBase"
    | "weekKeys"
    | "eventsByDay"
    | "now"
    | "focusIdx"
    | "onFocusChange"
    | "effectiveStatus"
    | "isOverdue"
    | "onOpenDetail"
  > {}

function MobileWeek({
  weekBase,
  weekKeys,
  eventsByDay,
  now,
  focusIdx,
  onFocusChange,
  effectiveStatus,
  isOverdue,
  onOpenDetail,
}: MobileWeekProps) {
  const idx = Math.max(0, Math.min(6, focusIdx));
  const focusKey = weekKeys[idx];
  const focusDate = addDays(weekBase, idx);
  const events = eventsByDay[focusKey] ?? [];
  const range = dayRenderRange(events);
  const hourH = hourHOf("mobile");
  const heightPx = range ? (range.hi - range.lo + 1) * hourH : 0;
  const todayKey = dateToYmd(now);
  // ⚠️ 重叠事件并排 —— **不再有 maxCols 上限** (2026-10-21 gaga 拍板)
  const positioned = range ? layoutDay(events, hourH, EVENT_MIN_H_MOBILE, range.lo) : [];
  const nowTop = range
    ? (now.getHours() * 60 + now.getMinutes()) / 60 * hourH - range.lo * hourH
    : 0;

  return (
    <div data-week-view data-viewport="mobile" data-focus-idx={idx}>
      <WeekDaySwitch
        weekBase={weekBase}
        focusIdx={idx}
        todayKey={todayKey}
        weekKeys={weekKeys}
        onSelect={onFocusChange}
      />
      <div className="bg-card rounded-2xl mt-1 overflow-hidden">
        {range === null ? (
          <div
            data-day-empty
            className="px-5 py-12 text-center text-sm text-fg-muted"
          >
            <div className="text-[15px] font-medium text-fg mb-1.5">
              本周聚焦日 ({focusDate.getMonth() + 1}月{focusDate.getDate()}日) 没有日程
            </div>
            <div className="text-[12.5px] text-fg-subtle">
              新建一条日程,或直接跟 Cody 说一句
            </div>
          </div>
        ) : (
          <div
            className="grid"
            style={
              {
                // 原型 .dayview 手机端: 40px 1fr
                gridTemplateColumns: "40px 1fr",
                "--hour-h": `${hourH}px`,
              } as CSSProperties
            }
          >
            {/* 左侧时段标签列 (原型 .dlabel: 手机端 10px / pr 4px) */}
            <div className="relative">
              {Array.from({ length: range.hi - range.lo + 1 }, (_, i) => {
                const h = range.lo + i;
                return (
                  <div
                    key={h}
                    className={[
                      "flex justify-end items-start pr-1 text-[10px] text-fg-subtle",
                      i > 0 && "border-t border-white/[0.05]",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ height: hourH }}
                  >
                    <span className="block">{String(h).padStart(2, "0")}:00</span>
                  </div>
                );
              })}
            </div>

            <div
              className="relative"
              data-week-col={focusKey}
              style={{
                height: heightPx,
                backgroundImage:
                  `repeating-linear-gradient(to bottom, rgba(255,255,255,0.05) 0 1px, transparent 1px ${hourH}px)`,
              }}
            >
              {positioned.map((p, i) => (
                <EventBlock
                  key={`w-m-${(p.ref as { id: string }).id}-${p.col}-${p.top}-${i}`}
                  positioned={p}
                  effectiveStatus={effectiveStatus}
                  isOverdue={isOverdue}
                  variant="day"
                  onOpenDetail={onOpenDetail}
                />
              ))}
              {focusKey === todayKey && (
                <div
                  aria-hidden="true"
                  data-now-line
                  className="absolute left-0 right-0 pointer-events-none z-[3]"
                  style={{ top: nowTop, borderTop: "1px solid var(--brand)" }}
                >
                  <span
                    className="absolute -left-[3px] -top-[3px] block rounded-full"
                    style={{ width: 6, height: 6, background: "var(--brand)" }}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop — 7 列
// ---------------------------------------------------------------------------

interface DesktopWeekProps
  extends Pick<
    WeekViewProps,
    | "weekBase"
    | "weekKeys"
    | "eventsByDay"
    | "now"
    | "focusIdx"
    | "onFocusChange"
    | "effectiveStatus"
    | "isOverdue"
    | "onOpenDetail"
  > {}

function DesktopWeek({
  weekBase,
  weekKeys,
  eventsByDay,
  now,
  focusIdx,
  onFocusChange,
  effectiveStatus,
  isOverdue,
  onOpenDetail,
}: DesktopWeekProps) {
  const range = weekRenderRange(weekBase, eventsByDay);
  const hourH = hourHOf("desktop");
  const heightPx = range ? (range.hi - range.lo + 1) * hourH : 0;
  const todayKey = dateToYmd(now);
  const weekCells = Array.from({ length: 7 }, (_, i) => ({
    key: weekKeys[i],
    date: addDays(weekBase, i),
  }));
  const weekdayShort = ["日", "一", "二", "三", "四", "五", "六"];
  const positionedByDay = range
    ? weekCells.map((c) => ({
        key: c.key,
        // ⚠️ 重叠事件并排 —— **不再有 maxCols 上限** (2026-10-21 gaga 拍板)
        positioned: layoutDay(
          eventsByDay[c.key] ?? [],
          hourH,
          EVENT_MIN_H_DESKTOP,
          range.lo,
        ),
      }))
    : weekCells.map((c) => ({ key: c.key, positioned: [] }));

  const nowTop = range
    ? (now.getHours() * 60 + now.getMinutes()) / 60 * hourH - range.lo * hourH
    : 0;

  /**
   * 定位「当前选中日」那一列 (gaga 2026-10-21 P0-D)。
   *
   * 桌面端 7 天并排, 栅格是 `52px repeat(7, minmax(0,1fr))` —— 默认**不横向溢出**,
   * 所以「定位」落成两件事:
   *   ① 该日列高亮 (data-focus-col=1) —— 一眼看出当前选中的是哪天;
   *   ② 一旦容器真的横向溢出 (窄屏 / 外层容器变窄), 把该列滚到中间 ——
   *      只改 scrollLeft, **不做纵向滚动**, 免得把页面顶飞。
   */
  const focusColRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = focusColRef.current;
    if (!el) return;
    const scroller = el.closest("[data-week-scroll]") as HTMLElement | null;
    if (!scroller) return;
    if (scroller.scrollWidth <= scroller.clientWidth) return;
    const sRect = scroller.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    scroller.scrollLeft +=
      eRect.left - sRect.left - (scroller.clientWidth - eRect.width) / 2;
  }, [focusIdx, weekKeys]);

  return (
    <div data-week-view data-viewport="desktop">
      <div className="bg-card rounded-2xl mt-1 overflow-hidden" data-week-scroll>
        {/* 原型 .weekhead: grid 52px repeat(7,1fr) / sticky top 0 / z-index 2 /
            bg --card / border-bottom 1px rgba(255,255,255,.06) */}
        <div
          className="grid sticky top-0 z-[2] bg-card border-b border-white/[0.06]"
          style={{ gridTemplateColumns: "52px repeat(7, minmax(0, 1fr))" }}
        >
          <div />
          {weekCells.map((c, i) => {
            const isToday = c.key === todayKey;
            return (
              <button
                key={c.key}
                type="button"
                data-week-head={c.key}
                data-focus-head={i === focusIdx ? "1" : "0"}
                aria-pressed={i === focusIdx}
                onClick={() => onFocusChange(i)}
                className={[
                  // 原型 .wh: padding 8px 2px / text-align center / border-left 1px rgba(255,255,255,.05)
                  "px-[2px] py-2 text-center border-l border-white/[0.05] min-w-0",
                  // 点某一天 = 选中那一天 (与手机端 WeekDaySwitch 同一个 onFocusChange)
                  "w-full cursor-pointer transition-colors duration-150 hover:bg-white/[0.04]",
                  // 选中态沿用 WeekDaySwitch 的那套 (brand 字 + 底色微提亮), 不另造第三种视觉
                  i === focusIdx && "bg-white/[0.03] [&_.wd]:text-brand [&_.wd]:font-semibold",
                  isToday && "today",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {/* 原型 .wh .wd: 11px --fg-subtle (今天 → --brand) */}
                <div
                  className={["wd text-[11px] text-fg-subtle", isToday && "text-brand"]
                    .filter(Boolean)
                    .join(" ")}
                >
                  周{weekdayShort[c.date.getDay()]}
                </div>
                {/* 原型 .wh .dd: 14px·500 / margin-top 2px /
                    .wh.today .dd: bg --brand / 26×26 圆 / 13px */}
                <div
                  className={[
                    "text-[14px] font-medium mt-0.5",
                    isToday &&
                      "bg-brand text-brand-on w-[26px] h-[26px] rounded-full inline-grid place-items-center text-[13px]",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {c.date.getDate()}
                </div>
              </button>
            );
          })}
        </div>

        {range === null ? (
          <div
            data-week-empty
            className="px-5 py-12 text-center text-sm text-fg-muted"
          >
            <div className="text-[15px] font-medium text-fg mb-1.5">本周没有日程</div>
            <div className="text-[12.5px] text-fg-subtle">
              新建一条日程,或直接跟 Cody 说一句
            </div>
          </div>
        ) : (
          <div
            className="grid"
            style={{ gridTemplateColumns: "52px repeat(7, minmax(0, 1fr))" }}
          >
            <div className="relative">
              {Array.from({ length: range.hi - range.lo + 1 }, (_, i) => {
                const h = range.lo + i;
                return (
                  <div
                    key={h}
                    className={[
                      // 原型 .wlabel: height --hour-h / 11px / 右对齐 / pr 8px / border-top 1px
                      "flex justify-end items-start pr-2 text-[11px] text-fg-subtle",
                      i > 0 && "border-t border-white/[0.05]",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{ height: hourH }}
                  >
                    <span className="block">{String(h).padStart(2, "0")}:00</span>
                  </div>
                );
              })}
            </div>

            {positionedByDay.map((col, idx) => (
              <div
                key={col.key}
                ref={idx === focusIdx ? focusColRef : undefined}
                data-week-col={col.key}
                data-focus-col={idx === focusIdx ? "1" : "0"}
                // 点这一列的空白处 = 选中这一天 (与表头 / 手机端切换条同一个 onFocusChange)。
                //   ⚠️ target === currentTarget 的守卫别去掉: 列里还嵌着事件块, 点事件块要照旧
                //   进详情页, 不能顺手把选中日也改了。
                onClick={(e) => {
                  if (e.target === e.currentTarget) onFocusChange(idx);
                }}
                className={[
                  "relative border-l border-white/[0.05] min-w-0 cursor-pointer",
                  // 当前选中日那一列 —— 轻微提亮 (gaga P0-D: 默认定位到当天)
                  idx === focusIdx && "bg-white/[0.025]",
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  height: heightPx,
                  backgroundImage:
                    `repeating-linear-gradient(to bottom, rgba(255,255,255,0.05) 0 1px, transparent 1px ${hourH}px)`,
                }}
              >
                {col.positioned.map((p, i) => (
                  <EventBlock
                    key={`w-d-${idx}-${(p.ref as { id: string }).id}-${p.col}-${p.top}-${i}`}
                    positioned={p}
                    effectiveStatus={effectiveStatus}
                    isOverdue={isOverdue}
                    variant="week"
                    onOpenDetail={onOpenDetail}
                  />
                ))}
                {col.key === todayKey && (
                  <div
                    aria-hidden="true"
                    data-now-line
                    className="absolute left-0 right-0 pointer-events-none z-[3]"
                    style={{ top: nowTop, borderTop: "1px solid var(--brand)" }}
                  >
                    <span
                      className="absolute -left-[3px] -top-[3px] block rounded-full"
                      style={{ width: 6, height: 6, background: "var(--brand)" }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EventBlock — 事件块 (与 web 同款实现, 避免引入 TS 子组件跨文件 prop)
//
//   variant="week" → 桌面周视图窄格子密度款 (原型 .wcol .ev: padding 2px 4px /
//                    font 10px·13px / .et 单行省略 / .em 隐藏 / .wt 隐藏)
//   variant="day"  → 手机周视图折叠成单天 (原型 .dcol .ev: 手机 padding 4px 8px /
//                    12px·14px / .et 2 行截断 / .em 10.5px)
//
//   ⚠️ 2026-10-21: 两点折叠 (TwoDotsInline) + 就地展开面板 (WeekExpandPanel)
//      已**整体删除** —— 重叠事件改并排, 不再有「N 项 · 点开看全部」。
// ---------------------------------------------------------------------------

interface EventBlockProps {
  positioned: PositionedEvent;
  effectiveStatus: (item: ScheduleItem) => ItemStatus;
  isOverdue: (item: ScheduleItem) => boolean;
  variant: "week" | "day";
  /** 点事件块 → 进详情页 (原型 B2: .ev 的 data-open → openDetail)。 */
  onOpenDetail?: (kind: "schedule" | "cron", id: string) => void;
}

/**
 * useTitlePeek — 「窄标题看全名」的小工具 (2026-10-21 gaga 拍板)。
 *
 *   并排之后每条事件只占 1/N 宽度, 标题一定会被截断 —— 必须有办法看全名:
 *     - **桌面**: hover 事件块 → 原生 `title` tooltip (块上带 title 属性);
 *     - **手机**: 没有 hover → **长按事件块** → 弹一个「完整标题」气泡。
 *
 *   ⚠️ 长按**不吞掉点击**: 长按触发后紧接着的那一次 click 会被丢弃,
 *      普通 (短) 点击照旧进详情页 —— 「点事件块 → 详情页」这条行为不受影响。
 */
function useTitlePeek() {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressedRef = useRef(false);
  const [peek, setPeek] = useState<{
    left: number;
    top: number;
    width: number;
    below: boolean;
  } | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const startPress = () => {
    longPressedRef.current = false;
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const el = anchorRef.current;
      if (!el || typeof window === "undefined") return;
      longPressedRef.current = true;
      const r = el.getBoundingClientRect();
      const vw = window.innerWidth || 1024;
      const width = Math.min(280, Math.max(160, vw - 24));
      let left = r.left + r.width / 2 - width / 2;
      left = Math.max(12, Math.min(vw - width - 12, left));
      let top = r.top - 8;
      let below = false;
      if (top < 64) {
        top = r.bottom + 8;
        below = true;
      }
      setPeek({ left, top, width, below });
    }, 450);
  };

  const endPress = () => clearTimer();

  // 气泡开着的时候: 滚动 / Esc → 关掉 (别让它挂在旧位置)
  useEffect(() => {
    if (!peek) return;
    const close = () => setPeek(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [peek]);

  useEffect(() => clearTimer, []);

  /** click 时判断「刚才是不是长按」—— 是就丢弃这次 click (不进详情页)。 */
  const consumeLongPress = () => {
    if (!longPressedRef.current) return false;
    longPressedRef.current = false;
    return true;
  };

  return { anchorRef, peek, startPress, endPress, consumeLongPress };
}

function EventBlock({
  positioned,
  effectiveStatus,
  isOverdue,
  variant,
  onOpenDetail,
}: EventBlockProps) {
  const { ref, kind, top, h, col, cols } = positioned;
  const w = 100 / cols;
  const left = `calc(${col * w}% + 2px)`;
  const width = `calc(${w}% - 4px)`;
  const isDay = variant === "day";
  // 原型 .ev 通用: absolute / radius 8px / bg --bg-elevated / border-left 2px /
  //                box-shadow --shadow-card / cursor:pointer / overflow:hidden
  const baseClass = [
    // 原型 .ev: border-radius 8px (Tailwind 的 rounded-lg=20px, 这里必须写死 8px)
    "absolute overflow-hidden cursor-pointer flex flex-col select-none",
    isDay
      ? "rounded-[8px] px-[8px] py-[4px] text-[12px] leading-[14px] shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
      : "rounded-[8px] px-[4px] py-[2px] text-[10px] leading-[13px] shadow-[0_1px_3px_rgba(0,0,0,0.5)]",
  ].join(" ");

  const { anchorRef, peek, startPress, endPress, consumeLongPress } = useTitlePeek();
  const titleRef = useRef<HTMLDivElement | null>(null);
  const [clipped, setClipped] = useState(false);

  // 标题被截断的探测 (列宽变了也要重算) —— 手机端给个「…」提示, 告诉用户能长按看全名
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const check = () =>
      setClipped(el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
    check();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cols, isDay]);

  /** 窄标题气泡 (portal 到 body —— 事件块所在卡片是 overflow-hidden, 弹不出去)。 */
  const peekEl =
    peek && typeof document !== "undefined"
      ? createPortal(
          <div
            data-event-title-peek
            role="tooltip"
            className="fixed z-[200] rounded-lg bg-bg-elevated border border-white/10 px-2.5 py-1.5 text-[12px] leading-[16px] text-fg break-words shadow-[0_8px_24px_rgba(0,0,0,0.55)]"
            style={{
              left: peek.left,
              top: peek.top,
              width: peek.width,
              transform: peek.below ? undefined : "translateY(-100%)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {kind === "cron"
              ? `${(ref as CronJob).title} · ${describeCron((ref as CronJob).cronExpr)}`
              : (ref as ScheduleItem).title}
          </div>,
          document.body,
        )
      : null;

  /** 事件块上的一套「长按 / 点击」交互。 */
  const pressHandlers = {
    onTouchStart: startPress,
    onTouchEnd: endPress,
    onTouchMove: endPress,
    onTouchCancel: endPress,
    // 长按别弹系统菜单 (否则长按气泡出不来)
    onContextMenu: (e: ReactMouseEvent) => e.preventDefault(),
  };

  if (kind === "cron") {
    const c = ref as CronJob;
    return (
      <>
        <div
          ref={anchorRef}
          className={[baseClass, "bg-cron/[0.16] border-l-2 border-cron"].join(" ")}
          style={{ top, height: h, left, width, paddingLeft: isDay ? 18 : 14 }}
          title={`${c.title} · ${describeCron(c.cronExpr)}`}
          data-event-cron
          onClick={() => {
            if (consumeLongPress()) return;
            onOpenDetail?.("cron", c.id);
          }}
          {...pressHandlers}
        >
          <CronIcon />
          {/* 原型 .wcol .ev .et: 单行省略; .dcol .ev .et: 2 行截断 */}
          <div
            ref={titleRef}
            className={[
              "font-medium text-cron",
              isDay ? "line-clamp-2 break-words text-[12.5px] leading-[14px]" : "truncate block",
            ].join(" ")}
          >
            {c.title}
          </div>
          {/* 原型 .wcol .ev .em { display:none } — 周视图窄格子不显示 meta */}
          {isDay && (
            <div className="text-fg-muted text-[10.5px] leading-[12px] truncate shrink-0 mt-px">
              {describeCron(c.cronExpr)}
            </div>
          )}
          {clipped && isDay && (
            <span
              aria-hidden="true"
              data-event-title-hint
              className="absolute right-[3px] top-[2px] text-[9px] leading-none text-fg-subtle pointer-events-none"
            >
              …
            </span>
          )}
        </div>
        {peekEl}
      </>
    );
  }

  const s = ref as ScheduleItem;
  const status = effectiveStatus(s);
  const over = isOverdue(s);
  const borderCls =
    status === "done"
      ? "border-success"
      : status === "in_progress"
        ? "border-brand-cyan"
        : "border-brand";

  return (
    <>
      <div
        ref={anchorRef}
        data-event-schedule
        data-status={status}
        data-over={over ? "1" : "0"}
        className={[
          baseClass,
          "bg-bg-elevated border-l-2",
          borderCls,
          status === "done" && "opacity-50",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ top, height: h, left, width }}
        title={s.title}
        onClick={() => {
          if (consumeLongPress()) return;
          onOpenDetail?.("schedule", s.id);
        }}
        {...pressHandlers}
      >
        <div
          ref={titleRef}
          className={[
            "font-medium",
            isDay
              ? "line-clamp-2 break-words text-[12.5px] leading-[14px]"
              : "truncate block",
            status === "done" ? "line-through" : over ? "text-danger" : "text-fg",
          ].join(" ")}
        >
          {s.title}
        </div>
        {/* 原型 .wcol .ev .em { display:none } */}
        {isDay && (
          <div className="text-fg-subtle text-[10.5px] leading-[12px] truncate shrink-0 mt-px">
            {s.startAt}–{s.endAt}
          </div>
        )}
        {clipped && isDay && (
          <span
            aria-hidden="true"
            data-event-title-hint
            className="absolute right-[3px] top-[2px] text-[9px] leading-none text-fg-subtle pointer-events-none"
          >
            …
          </span>
        )}
      </div>
      {peekEl}
    </>
  );
}

function CronIcon() {
  return (
    <span
      aria-hidden="true"
      className="absolute w-3 h-3 grid place-items-center text-cron pointer-events-none"
      style={{ left: 2, top: "50%", transform: "translateY(-50%)" }}
    >
      <ClockIcon size={12} strokeWidth={2} className="w-3 h-3" />
    </span>
  );
}
