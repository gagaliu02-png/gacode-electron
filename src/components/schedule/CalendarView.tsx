/**
 * components/schedule/CalendarView.tsx — 日程中心顶层容器 (周视图 + 月视图) · PC 端 B4
 *
 * 抄自 web `gacode-web/src/components/schedule/CalendarView.tsx`, 只换 PC 写法:
 *   - `cn(...)`      → 数组 filter(Boolean).join(" ")
 *   - `lucide-react` → PC 图标唯一出处是 `components/ui/Glyphs.tsx`
 *     (`ChevronLeft` → `ChevronLeftIcon` / `ChevronRight` → `ChevronRightIcon`)
 *   - `useUIStore` / `setHeaderTitle` → PC 没有 store
 *     ⇒ **本页不设标题**, 顶栏走 `AppShell.tsx` 的 `resolveTitle()`
 *       (已用 `pathname.startsWith("/schedule")` 覆盖 `/schedule/calendar`)
 *
 * ⚠️ **只有周 / 月两个视图** (gaga 2026-10-21 拍板 P0-C):
 *   gaga 原话「日视图取消吧 重复了 只要周和月视图就行」—— 桌面和手机都去掉日视图。
 *   连带改动:
 *     - 视图切换段只剩「周 / 月」两个按钮, 默认进**周视图**;
 *     - 「今天」按钮 → 跳到**周视图**并把选中日定位到今天 (原来跳日视图);
 *     - 月视图点某一天 → 跳**周视图**并把选中日定位到那天 (原来跳日视图);
 *     - 导航 ← → 在周视图里翻周、在月视图里翻月。
 *
 * 切两视图 (周 / 月) + 日期导航 + 视口适配 (mobile 单列 / desktop 7 列).
 *
 * 数据: 顶层 useQuery 一次性拉一段 ([from, to] 跨视图所需最大区间) + crons 全量.
 *   - 切换视图模式: range 重算 (TanStack Query 自动复用 key 相同时的缓存);
 *   - 翻周 / 翻月: range 重算;
 *   - 子视图 (Week/Month) 拿到 `eventsByDay` 直接渲染, 不再发 fetch.
 *
 * 视口: 受 grid-breakpoint 控制:
 *   - < 1024px  → mobile (WeekView 折叠单天 + WeekDaySwitch);
 *   - >=1024px → desktop (WeekView 7 列).
 *   切换点 1024 是 PM 契约 (题目给的阈值); 跟 prototype 内部 640 不同, 这里用 PM 阈值.
 *
 * 与 ScheduleTabs 的关系:
 *   CalendarView 不内嵌 ScheduleTabs (由 page 渲染). 只负责 mode / viewport / 数据 /
 *   子视图分发.
 *
 * ⚠️ **PC 侧一处技术调整** (PM 授权「技术细节自己定」):
 *   web 那边首帧一律按 "desktop" 渲染、挂载后再按真实宽度校准 —— 那是为躲 SSR
 *   hydration mismatch (服务端没有 window)。PC 是纯客户端 (Electron, 无 SSR),
 *   那样做会在窄窗口下**闪一下桌面 7 列**。⇒ PC 直接在初始化时读 `window.innerWidth`,
 *   行为等价但没有那一帧跳动。`viewportOverride` 显式传入时仍优先。
 */

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  addDays,
  dateToYmd,
  dayEventsFor,
  monthGridStart,
  pickDayPlan,
  weekBaseOf,
  ymdToDate,
} from "./calendar-utils";
import type { CalEvent } from "./calendar-utils";
import { fmtDate } from "./format";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { ChevronLeftIcon, ChevronRightIcon } from "../ui/Glyphs";
import {
  buildScheduleTreeIndex,
  describeScheduleError,
  listCronJobs,
  listMilestones,
  listSchedules,
  listSubtasks,
  listTasks,
} from "../../lib/schedule-api";
import type { CronJob, ItemStatus, ScheduleItem } from "../../lib/schedule-api";

export type CalMode = "week" | "month";

const MOBILE_BREAKPOINT = 1024;

interface CalendarViewProps {
  /** 时钟锚点 (本机时间, 由页面层传入). */
  now: Date;
  /** 「今天」字符串 (YYYY-MM-DD). */
  todayYmd: string;
  /** 显式传 viewport — 若不传, 顶层用 innerWidth 自适应. */
  viewportOverride?: "mobile" | "desktop";
  /** 点事件块 → 进详情页 (B6 才落地; PC 本批传 toast 占位, 不跳路由)。 */
  onOpenDetail?: (kind: "schedule" | "cron", id: string) => void;
}

export function CalendarView({ now, todayYmd, viewportOverride, onOpenDetail }: CalendarViewProps) {
  const [mode, setMode] = useState<CalMode>("week");
  const [offsets, setOffsets] = useState({ week: 0, month: 0 });
  const [weekFocus, setWeekFocus] = useState<number | null>(null);
  /**
   * viewport —— mobile (<1024px 单天 + 切换条) / desktop (7 列).
   *
   * PC 是纯客户端 ⇒ 首帧直接按真实窗口宽度算 (见文件头「PC 侧一处技术调整」),
   * 挂载后仍监听 resize 实时校准。
   */
  const [viewport, setViewport] = useState<"mobile" | "desktop">(() => {
    if (viewportOverride) return viewportOverride;
    if (typeof window === "undefined") return "desktop";
    return window.innerWidth < MOBILE_BREAKPOINT ? "mobile" : "desktop";
  });

  useEffect(() => {
    if (viewportOverride) {
      setViewport(viewportOverride);
      return;
    }
    const onResize = () => {
      const next = window.innerWidth < MOBILE_BREAKPOINT ? "mobile" : "desktop";
      setViewport((cur) => (cur === next ? cur : next));
    };
    onResize(); // 首次挂载后按真实宽度校准
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [viewportOverride]);

  // -------------------------------------------------------------------
  // 数据
  // -------------------------------------------------------------------
  const range = useMemo(() => computeRange(mode, offsets, now), [mode, offsets, now]);
  const {
    data: schedulesRaw,
    isPending: schedulesPending,
    error: schedulesError,
  } = useQuery({
    queryKey: ["schedule", "range", range.from, range.to],
    queryFn: () => listSchedules({ from: range.from, to: range.to }),
  });
  const { data: cronsRaw, error: cronsError } = useQuery({
    queryKey: ["schedule", "crons"],
    queryFn: () => listCronJobs(),
  });
  // Tree 用 effectiveStatus 口径判 done / in_progress / pending
  const { data: tree, isPending: treePending } = useQuery({
    queryKey: ["schedule", "tree-active"],
    queryFn: async () => {
      const [tasks, subtasks, milestones] = await Promise.all([
        listTasks(),
        listSubtasks(),
        listMilestones(),
      ]);
      return buildScheduleTreeIndex({ tasks, subtasks, milestones });
    },
  });

  const loading = schedulesPending || treePending;
  // 三态的 error 一律按后端 error.code 分支转可读文案 (契约 §9.4b 的 4 个码)
  const error = schedulesError ?? cronsError ?? null;

  const schedules = useMemo<ScheduleItem[]>(() => schedulesRaw ?? [], [schedulesRaw]);
  const crons = useMemo<CronJob[]>(() => cronsRaw ?? [], [cronsRaw]);
  const effectiveStatus = (item: ScheduleItem): ItemStatus =>
    tree ? (tree.effectiveStatus(item) as ItemStatus) : "pending";
  // 逾期判定 — 后端 isOverdue 出参优先, 字段缺失时走本地兜底 (schedule-api 双轨)
  const isOverdue = (item: ScheduleItem): boolean =>
    tree ? tree.isOverdue(item, now) : false;

  const eventsByDay: Record<string, CalEvent[]> = useMemo(() => {
    const out: Record<string, CalEvent[]> = {};
    const start = ymdToDate(range.from);
    const end = ymdToDate(range.to);
    for (let d = new Date(start); d.getTime() <= end.getTime(); d = addDays(d, 1)) {
      const key = dateToYmd(d);
      out[key] = dayEventsFor(key, schedules, crons);
    }
    return out;
  }, [range, schedules, crons]);

  // -------------------------------------------------------------------
  // 视图日期 / 周一~周日 keys 计算
  // -------------------------------------------------------------------
  // weekBase = 本周 (desktop 周视图头部 + 切换条)
  // 周视图跟随 offsets.week 翻周 (week 视图的 [from,to] 数据区间也跟它走)
  const weekBase = useMemo(() => {
    const ref = addDays(yyd(now), offsets.week * 7);
    return weekBaseOf(ref);
  }, [now, offsets.week]);
  const monthBase = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth() + offsets.month, 1);
    return d;
  }, [now, offsets.month]);
  const monthGrid = useMemo(() => monthGridStart(monthBase), [monthBase]);

  const weekKeys = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => dateToYmd(addDays(weekBase, i)));
  }, [weekBase]);

  // 切换视图 (gaga P0-C: 只剩 周 / 月)
  const switchMode = (next: CalMode) => {
    setMode(next);
    if (next === "week") {
      setOffsets((s) => ({ ...s, week: 0 }));
      setWeekFocus(null);
    } else {
      setOffsets((s) => ({ ...s, month: 0 }));
    }
  };

  const navPrev = () => setOffsets((s) => stepOffset(mode, s, -1));
  const navNext = () => setOffsets((s) => stepOffset(mode, s, +1));

  /**
   * 「今天」按钮 (gaga P0-C): 跳到**周视图**并把选中日定位到今天。
   * 原来跳的是日视图 —— 日视图已取消。
   */
  const navToday = () => {
    setMode("week");
    setOffsets((s) => ({ ...s, week: 0 }));
    setWeekFocus(idxOfDayInWeek(todayYmd, weekBaseOf(yyd(now))));
  };

  /**
   * 月视图点某一天 / 点某一条条目 (gaga 2026-10-21 生产实测) ——
   * 一律跳**周视图**并把选中日定位到那天。
   *
   *   ⚠️ 月视图**不再有**详情页入口: 「日程详情只在周视图里才能看到」——
   *      MonthView 的条目 chip 也走同一个 onPickDay (见 MonthView.tsx)。
   *
   *   跨周/跨月都要能定位 —— 所以 week 偏移按「目标那天所在周」算, 不只是本周内。
   *   计算逻辑在纯函数 pickDayPlan 里 (calendar-utils.ts), 断言脚本直接 import 跑真值。
   */
  const pickDay = (dayKey: string) => {
    const plan = pickDayPlan(dayKey, now);
    setMode(plan.mode);
    setOffsets((s) => ({ ...s, week: plan.weekOffset }));
    setWeekFocus(plan.focusIdx);
  };

  // -------------------------------------------------------------------
  // 渲染
  // -------------------------------------------------------------------
  return (
    <div data-calendar-view data-mode={mode}>
      {/* --- 三态: loading 骨架 / error 横幅 / 空窗占位 ---
          放在 mode tabs 之上, 三个视图共用一套, 不各画各的。 */}
      {loading && (
        <div className="px-4 lg:px-6 pt-3 space-y-2" aria-busy="true" aria-label="加载中">
          <div className="h-14 rounded-lg bg-bg-elevated animate-pulse" />
          <div className="h-14 rounded-lg bg-bg-elevated animate-pulse" />
          <span className="sr-only">加载中...</span>
        </div>
      )}

      {error && !loading && (
        <div className="px-4 lg:px-6 pt-3">
          <div className="rounded-xl border border-danger/40 bg-danger-soft/20 px-4 py-3 text-sm text-danger">
            日程加载失败:{describeScheduleError(error)}
          </div>
        </div>
      )}

      {!loading && !error && schedules.length === 0 && crons.length === 0 && (
        <div className="px-4 lg:px-6 pt-8 pb-10 flex flex-col items-center text-center">
          <p className="m-0 text-sm font-medium text-fg">这段时间没有日程</p>
          <p className="m-0 mt-1 text-[13px] text-fg-muted">换个日期看看, 或让 Cody 帮你排。</p>
        </div>
      )}

      {/* --- mode tabs + 导航 (原型 .cal-toolbar) ---
          原型规格 (规格书 B2.2):
            .cal-toolbar  flex / align-items:center / gap:8px / margin:4px 0 12px /
                          flex-wrap:nowrap  ← 切换组与日期导航**永远同一排, 绝不换行**
            .seg          height 34px (手机 28px) / bg --card / radius full / padding 3px
            .seg button   padding 5px 14px / radius full / 13px / --fg-muted
                          [aria-pressed=true] → bg --bg-elevated + 字 --fg
            .datenav      height 34px / margin-left:auto / gap 2px / justify-content:flex-end
            .icon-round   36×36 圆 (.sm = 26×26) / 字 --fg-muted / hover bg --bg-elevated
            .lbl          14px/500 / 省略号 / 手机显示 .lbl-short
            #nav-today    .btn-quiet.btn-sm → 13px / --fg-muted / padding 6px 13px / radius full
      */}
      <div className="flex items-center gap-2 px-4 lg:px-6 pt-1 pb-3">
        <div
          role="tablist"
          data-cal-seg
          className="flex h-[34px] items-center rounded-full bg-card p-[3px] shrink-0"
        >
          {([["week", "周"], ["month", "月"]] as const).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={mode === key}
              aria-pressed={mode === key}
              type="button"
              data-mode-btn={key}
              onClick={() => switchMode(key)}
              className={[
                "h-full px-[14px] rounded-full text-[13px] whitespace-nowrap",
                "transition-colors duration-150",
                mode === key ? "bg-bg-elevated text-fg" : "text-fg-muted hover:text-fg",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex h-[34px] min-w-0 flex-1 items-center justify-end gap-0.5">
          <button
            type="button"
            aria-label="上一个"
            onClick={navPrev}
            data-nav="prev"
            className="w-[26px] h-[26px] rounded-full grid place-items-center text-fg-muted hover:bg-bg-elevated hover:text-fg transition-colors duration-150 shrink-0"
          >
            <ChevronLeftIcon size={16} className="w-4 h-4" />
          </button>
          <div className="text-sm font-medium px-0.5 min-w-0 text-center truncate" data-cal-label>
            {renderCalLabel(mode, weekBase, monthBase)}
          </div>
          <button
            type="button"
            aria-label="下一个"
            onClick={navNext}
            data-nav="next"
            className="w-[26px] h-[26px] rounded-full grid place-items-center text-fg-muted hover:bg-bg-elevated hover:text-fg transition-colors duration-150 shrink-0"
          >
            <ChevronRightIcon size={16} className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={navToday}
            data-nav="today"
            // 原型 .btn-quiet.btn-sm: padding 6px 13px / font 13px / --fg-muted
            className="px-[13px] py-[6px] rounded-full text-[13px] text-fg-muted hover:text-fg hover:bg-bg-elevated transition-colors duration-150 shrink-0"
          >
            今天
          </button>
        </div>
      </div>

      {/* --- 两视图本体 (日视图已取消, gaga P0-C) --- */}
      <div className="px-4 lg:px-6 pb-24">
        {mode === "week" && (
          <WeekView
            weekBase={weekBase}
            weekKeys={weekKeys}
            eventsByDay={eventsByDay}
            now={now}
            viewport={viewport}
            effectiveStatus={effectiveStatus}
            isOverdue={isOverdue}
            focusIdx={resolvedFocusIdx(weekFocus, weekBase, todayYmd)}
            onOpenDetail={onOpenDetail}
            onFocusChange={(idx) => {
              setWeekFocus(idx);
            }}
          />
        )}
        {mode === "month" && (
          <MonthView
            monthBase={monthBase}
            gridStart={monthGrid}
            todayKey={todayYmd}
            schedulesInRange={schedules}
            crons={crons}
            effectiveStatus={effectiveStatus}
            isOverdue={isOverdue}
            onPickDay={pickDay}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

/**
 * 把周 / 月 当前所看的 [from, to] 区间算出来.
 *
 * 计算逻辑:
 *   - week: weekBase ~ weekBase+6 (weekBase = 今天的周 + offsets.week 周)
 *     ⚠️ 旧实现这里用的是 `weekBaseOf(now)` —— **不跟 offsets.week 走**,
 *        翻周时标题变了但数据区间没变 (既有 bug)。现在跟 offsets.week 对齐。
 *   - month: gridStart ~ gridStart+41 (42 格)
 */
function computeRange(
  mode: CalMode,
  offsets: { week: number; month: number },
  now: Date,
): { from: string; to: string } {
  if (mode === "week") {
    const wb = weekBaseOf(addDays(yyd(now), offsets.week * 7));
    const start = dateToYmd(wb);
    const end = dateToYmd(addDays(wb, 6));
    return { from: start, to: end };
  }
  // month
  const monthBase = new Date(now.getFullYear(), now.getMonth() + offsets.month, 1);
  const gs = monthGridStart(monthBase);
  const start = dateToYmd(gs);
  const end = dateToYmd(addDays(gs, 41));
  return { from: start, to: end };
}

function yyd(now: Date): Date {
  // 起算 today local
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * idxOfDayInWeek — 某一天在它所在周里的下标 (0 = 周一 … 6 = 周日)。
 * 超出范围 clamp 到 0..6 (与 resolvedFocusIdx 同口径)。
 */
function idxOfDayInWeek(dayKey: string, weekBase: Date): number {
  const d = ymdToDate(dayKey);
  const idx = Math.round((d.getTime() - weekBase.getTime()) / 86400000);
  return Math.max(0, Math.min(6, idx));
}

function stepOffset(
  mode: CalMode,
  offsets: { week: number; month: number },
  delta: number,
): { week: number; month: number } {
  if (mode === "week") return { ...offsets, week: offsets.week + delta };
  return { ...offsets, month: offsets.month + delta };
}

function renderCalLabel(mode: CalMode, weekBase: Date, monthBase: Date): ReactNode {
  // 原型 (规格书 B2.3 #7): 桌面显示 .lbl-full, 手机 (≤640px) 显示 .lbl-short
  if (mode === "week") {
    const wb = weekBase;
    const e = addDays(wb, 6);
    return (
      <>
        <span className="lbl-full hidden min-[641px]:inline">
          {fmtDate(wb)} – {fmtDate(e)}
        </span>
        <span className="lbl-short inline min-[641px]:hidden">
          {wb.getMonth() + 1}/{wb.getDate()} - {e.getMonth() + 1}/{e.getDate()}
        </span>
      </>
    );
  }
  return (
    <>
      <span className="lbl-full hidden min-[641px]:inline">
        {monthBase.getFullYear()}年{monthBase.getMonth() + 1}月
      </span>
      <span className="lbl-short inline min-[641px]:hidden">
        {monthBase.getFullYear()}/{monthBase.getMonth() + 1}
      </span>
    </>
  );
}

function resolvedFocusIdx(weekFocus: number | null, weekBase: Date, todayKey: string): number {
  if (weekFocus != null) return Math.max(0, Math.min(6, weekFocus));
  const today = ymdToDate(todayKey);
  const idx = Math.round((today.getTime() - weekBase.getTime()) / 86400000);
  if (idx >= 0 && idx < 7) return idx;
  return 0;
}
