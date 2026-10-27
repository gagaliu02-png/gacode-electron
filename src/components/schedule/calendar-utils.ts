/**
 * src/components/schedule/calendar-utils.ts
 *
 * 日程中心三视图（日 / 周 / 月）的**纯算法层**。
 *
 * ⚠️ 本文件**不定义 DTO** —— DTO 全部集中在 src/lib/schedule-api.ts。
 *    这里只有纯函数 (输入已拿到的实体, 输出渲染所需数据结构)。
 *
 * 视觉契约 v6 已冻结 — 所有函数 1:1 对齐 docs/prototype/schedule-center.html:
 *   - dayEventsFor(key)           ← prototype line 1704
 *   - monthEventsFor(key)         ← prototype line 1716
 *   - dayRenderRange(events)      ← prototype line 1728 (v6 批注 4)
 *   - weekRenderRange(weekBase)   ← prototype line 1740 (整周并集 ±1)
 *   - layoutDay(...)              ← prototype line 1750 (v6 批注 1.2 / 1.3)
 *                                    ⚠️ 2026-10-21 gaga 拍板: 取消 maxCols 上限 +
 *                                    删掉两点折叠 → 重叠事件一律并排 (Google 式)。
 *                                    本文件**有意偏离**冻结原型 (原型仍保留 twodots),
 *                                    偏离原因与拍板人见 layoutDay 的注释。
 *   - col / cluster 算法           ← prototype line 1754-1785
 *
 * 选定参照的 renderMonth 实现是 prototype line 2107
 *   (1905 和 2107 是重复定义, JS 后定义覆盖前定义, v6 worker 清 renderWeek / renderDay
 *    重复时漏了 renderMonth — 已记入 v6 验收 bug 清单但 v6 不再改动 — 我这边的实现
 *    走的是**实际生效的** 2107 版逻辑).
 *
 * 时段行高自适应 (批注 1.2) 通过 **top 永远按绝对时间计算** 保证顺序不错乱:
 *   top = (startMin / 60 - lo) * hourH
 * 即某小时段被 N 个事件拉高时, **下一个时段的事件 top 不受影响**, 因为 next 时段
 * 算的是 `((nextHour) - lo) * hourH`, 与上一个时段的事件堆高度无关.
 */

import type { CronJob, ItemStatus, ScheduleItem } from "../../lib/schedule-api";
import { parseYmd } from "./format";

// ---------------------------------------------------------------------------
// 基础时间工具
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** 把 YYYY-MM-DD 转成本地时区 Date (与 prototype `parseYmd` 等价). */
export function ymdToDate(ymd: string): Date {
  return new Date(ymd.replace(/-/g, "/"));
}

/** 把 Date 转成本地 YYYY-MM-DD. */
export function dateToYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 加 days 天, 返新 Date (不修改原对象). */
export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** 把 "HH:mm" 拆成 [hh, mm]，HH 是小时制 0-23，mm 是分钟 0-59. */
function splitHhmm(hhmm: string): { h: number; m: number } {
  const p = String(hhmm).split(":");
  return { h: Number(p[0]), m: Number(p[1] || 0) };
}

/** "HH:mm" → 从 00:00 起的分钟数. (与 prototype toMin 等价.) */
export function hhmmToMin(hhmm: string): number {
  const { h, m } = splitHhmm(hhmm);
  return h * 60 + m;
}

/** 把 cron nextRunAt 提取出当天小时分钟 — 用于日历时间轴. */
export function nextRunMinOfDay(c: CronJob): { min: number; ymd: string } {
  const d = new Date(c.nextRunAt);
  return { min: d.getHours() * 60 + d.getMinutes(), ymd: dateToYmd(d) };
}

// ---------------------------------------------------------------------------
// 类型定义 — 视图投影 / 布局所需
// ---------------------------------------------------------------------------

/**
 * 单个日历事件 (日 / 周 用) — 同时承载日程和 cron 两种来源.
 *  字段尽量贴近 prototype `dayEventsFor()` 的内部结构, 便于 1:1 翻译 layoutDay.
 */
export interface CalEvent {
  ref: ScheduleItem | CronJob;
  kind: "schedule" | "cron";
  /** 开始分钟 (00:00 起). */
  s: number;
  /** 结束分钟. cron 默认占 30 分钟 (原型口径: e = s + 30). */
  e: number;
}

/**
 * 月视图事件 (只关心绝对时间, 不画时间轴).
 *   字段尽量贴近 prototype `monthEventsFor()` 的内部结构.
 */
export interface MonthEvent {
  ref: ScheduleItem | CronJob;
  kind: "schedule" | "cron";
  /** 时间部分 HH:mm, 用于排序. */
  t: string;
}

/** 视图布局后的单个事件块 (顶部 top + 高度 h + 列 col + 共几列 cols). */
export interface PositionedEvent extends CalEvent {
  top: number;
  h: number;
  col: number;
  cols: number;
}

/** 渲染范围 (批注 4): lo = 该天最早已渲染小时, hi = 该天最晚已渲染小时. */
export interface RenderRange {
  lo: number;
  hi: number;
}

// ---------------------------------------------------------------------------
// 数据投影 — 把全量 schedules + crons 投到 day / week / month 维
// ---------------------------------------------------------------------------

/**
 * dayEventsFor — 给一天的 key (YYYY-MM-DD) 返回该天的全部时间轴事件.
 *
 * 视觉契约 v6: 必须在「该 day 范围内」精确过滤.
 *   - schedulesOn: date === key && !archived && startAt && endAt
 *   - cronsOn: state === 'active' && nextRunAt 在该日 + HH:mm
 * 1:1 对齐 prototype line 1704 + 1694-1703 三个底层函数.
 *
 * 注意: 这里的"过滤"全部由调用方保证 —
 *   真实日历视图会先调 listSchedules({from, to}) 拿到一个时间窗,
 *   这里的 schedules 参数已经是窗口内子集; 同理 crons 是全量但只挑 nextRunAt 落在 key 的.
 */
export function dayEventsFor(
  key: string,
  schedulesInRange: ScheduleItem[],
  crons: CronJob[],
): CalEvent[] {
  const out: CalEvent[] = [];
  for (const s of schedulesInRange) {
    if (s.archived) continue;
    if (!s.startAt || !s.endAt) continue;
    if (!s.date) continue;
    // 跨天日程 (gaga P0-F): 落在 [开始日期, 结束日期] 区间内的每一天都要出现。
    //   endDate 是 web 侧从 endAt 的日期部分派生的 (后端 DTO 没这个字段)。
    const startDay = s.date;
    const endDay = s.endDate || s.date;
    if (key < startDay || key > endDay) continue;
    // 时间范围: 开始日 = startAt~24:00, 结束日 = 00:00~endAt, 中间日 = 整天
    const from = key === startDay ? hhmmToMin(s.startAt) : 0;
    const to = key === endDay ? hhmmToMin(s.endAt) : 24 * 60;
    out.push({ ref: s, kind: "schedule", s: from, e: to });
  }
  for (const c of crons) {
    if (c.state !== "active") continue;
    if (!c.nextRunAt) continue;
    const { min, ymd } = nextRunMinOfDay(c);
    if (ymd !== key) continue;
    out.push({ ref: c, kind: "cron", s: min, e: min + 30 });
  }
  out.sort((a, b) => a.s - b.s || a.e - b.e);
  return out;
}

/**
 * monthEventsFor — 给一天的 key 返回该天的「卡片 chip」事件 (月视图日格里那种).
 *
 * 与 dayEventsFor 区别: 月视图不画时间轴, 只按时间排序 + 显头三个 + 「+N 更多」.
 * 因此 cron 也只存 t (HH:mm).
 *
 * 1:1 对齐 prototype line 1716-1723.
 */
export function monthEventsFor(
  key: string,
  schedulesInRange: ScheduleItem[],
  crons: CronJob[],
): MonthEvent[] {
  const out: MonthEvent[] = [];
  for (const s of schedulesInRange) {
    if (s.archived) continue;
    if (!s.startAt) continue;
    if (!s.date) continue;
    // 跨天日程 (gaga P0-F): 区间内的每一天都出 chip
    const startDay = s.date;
    const endDay = s.endDate || s.date;
    if (key < startDay || key > endDay) continue;
    out.push({ ref: s, kind: "schedule", t: s.startAt });
  }
  for (const c of crons) {
    if (c.state !== "active") continue;
    if (!c.nextRunAt) continue;
    const { min, ymd } = nextRunMinOfDay(c);
    if (ymd !== key) continue;
    const { h, m } = splitHhmm(`${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`);
    out.push({
      ref: c,
      kind: "cron",
      t: `${pad2(h)}:${pad2(m)}`,
    });
  }
  out.sort((a, b) => a.t.localeCompare(b.t));
  return out;
}

/**
 * 按 key 把 schedules / crons 投影成 { [ymd]: CalEvent[] }, 整周 / 整月一次算好,
 * WeekView / MonthView 内部就不再二次遍历全集.
 *
 * forEachDay(from, to) — 给一个 [from, to] 区间, 按天调一次 cb (key, dayIdx).
 *   用于 cell 遍历 (周一~周日 / 月视图 42 格).
 */
export function projectByDay(
  from: string,
  to: string,
  schedulesInRange: ScheduleItem[],
  crons: CronJob[],
): Record<string, CalEvent[]> {
  const out: Record<string, CalEvent[]> = {};
  const start = ymdToDate(from);
  const end = ymdToDate(to);
  for (let d = new Date(start); d.getTime() <= end.getTime(); d = addDays(d, 1)) {
    const key = dateToYmd(d);
    out[key] = dayEventsFor(key, schedulesInRange, crons);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 渲染范围 — v6 批注 4
// ---------------------------------------------------------------------------

/**
 * dayRenderRange — 给一天的 events, 返回 [lo, hi] (clamp 0..23, 各 ±1 buffer).
 *
 * 1:1 对齐 prototype line 1728.  关键点:
 *   - 空数组 → null (调用方据此显示空状态而非空时间轴)
 *   - cron 参与范围计算 (因为它也落时间轴)
 *
 * @example 单条 08:00-09:00 → lo=7, hi=10 → 渲染 7/8/9 三行时段 (其它小时 0 渲染)
 */
export function dayRenderRange(events: CalEvent[]): RenderRange | null {
  if (events.length === 0) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const e of events) {
    lo = Math.min(lo, Math.floor(e.s / 60));
    hi = Math.max(hi, Math.ceil(e.e / 60));
  }
  return {
    lo: Math.max(0, lo - 1),
    hi: Math.min(23, hi + 1),
  };
}

/**
 * weekRenderRange — 整周 7 天 events 的并集范围.
 *
 * 1:1 对齐 prototype line 1740.
 *   桌面端用: 取整周并集, 保证 7 列共用一个时间轴高度.
 *   手机端不用 (renderWeekDaySwitch 走的是单天 dayRenderRange).
 */
export function weekRenderRange(
  weekBase: Date,
  eventsByDay: Record<string, CalEvent[]>,
): RenderRange | null {
  const all: CalEvent[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekBase, i);
    const key = dateToYmd(d);
    const day = eventsByDay[key] ?? [];
    for (const e of day) all.push(e);
  }
  return dayRenderRange(all);
}

// ---------------------------------------------------------------------------
// layoutDay — 时段行高自适应 (批注 1.2) + 重叠事件并排 (Google Calendar 式)
// ---------------------------------------------------------------------------

/**
 * layoutDay — 把已排序的 events 转成「定位好」的块.
 *
 * ⚠️ **2026-10-21 gaga 拍板: 重叠事件改并排 (Google Calendar 式), 不再折叠。**
 *
 *   旧实现 (原型 v6 批注 1.3): 同一时段最多排 maxCols 列 (手机 2 / 桌面 3),
 *   排不下的收成一个「N 项 · 点开看全部」的两点占位 —— gaga 实测反馈
 *   「莫名其妙」(那个 N 用的是当天全部条目数, 跟实际折叠的那一个重叠簇对不上)。
 *   → **本实现取消列数上限**: 一个重叠簇里有几条就并排几条, 每条占 1/N 宽度,
 *     **一条都不藏**。
 *
 *   关键不变量:
 *
 *   ① **绝对时间定位** — 每个块的 top = (s/60 - lo) * hourH, 与前一个块的高度无关.
 *      这条是批注 1.2「时段顺序不能错乱」的核心保证:
 *        09:00 这条跟 08:00 那条无论 08:00 那一小时被堆多高, top 永远按 9-lo 算.
 *
 *   ② **cluster 切分** — 新事件若 s >= 当前 cluster 的最大 e, 就开新 cluster.
 *      同一 cluster 内事件时间相互重叠, 共用一套 column packing.
 *
 *   ③ **column packing (无上限)** — 贪心地把事件放进第一个「底部已经空出来」的列;
 *      没有空列就新开一列. 于是**簇内最大并发重叠数 = 列数 N**, 每条宽度 = 1/N.
 *      (3 条完全重叠 → 3 列, 各占 1/3 —— 与 Google Calendar 一致。)
 *
 *   ④ **高度自适应** — h = ((e-s)/60) * hourH - 3 (视觉常数, 原型同款), 下限 minH.
 */
export function layoutDay(
  evs: CalEvent[],
  hourH: number,
  minH: number,
  lo: number,
): PositionedEvent[] {
  // Internal mutable placeholder — 跟 prototype line 1752-1753 同结构 (top0 / h / col / top)
  interface _Pl {
    ref: ScheduleItem | CronJob;
    kind: "schedule" | "cron";
    s: number;
    e: number;
    top0: number;
    top: number;
    h: number;
    col: number;
  }
  const ps: _Pl[] = evs
    .map((p) => ({
      ref: p.ref,
      kind: p.kind,
      s: p.s,
      e: p.e,
      top0: (p.s / 60 - lo) * hourH,
      top: 0,
      h: 0,
      col: 0,
    }))
    .sort((a, b) => a.s - b.s || a.e - b.e);

  const clusters: { items: _Pl[] }[] = [];
  let cur: { items: _Pl[] } | null = null;
  let ce = -1;
  for (const p of ps) {
    if (!cur || p.s >= ce) {
      cur = { items: [] };
      clusters.push(cur);
      ce = p.e;
    } else {
      ce = Math.max(ce, p.e);
    }
    cur.items.push(p);
  }

  const res: PositionedEvent[] = [];
  for (const cl of clusters) {
    const bottoms: number[] = [];
    for (const p of cl.items) {
      const h = Math.max(minH, ((p.e - p.s) / 60) * hourH - 3);
      let c = -1;
      for (let i = 0; i < bottoms.length; i++) {
        if (bottoms[i] <= p.top0 + 1) {
          c = i;
          break;
        }
      }
      // 没有上限 —— 永远新开一列, **不折叠、不隐藏任何一条**
      if (c < 0) {
        c = bottoms.length;
        bottoms.push(0);
      }
      p.col = c;
      p.h = h;
      p.top = p.top0;
      bottoms[c] = Math.max(bottoms[c], p.top + h + 3);
    }
    const n = bottoms.length;
    for (const p of cl.items) {
      res.push({
        ref: p.ref,
        kind: p.kind,
        s: p.s,
        e: p.e,
        top: p.top,
        h: p.h,
        col: p.col,
        cols: n,
      });
    }
  }
  return res;
}

// ---------------------------------------------------------------------------
// 视图日期推算 — 月视图 42 格边界 / 周视图周一为一周第一天
// ---------------------------------------------------------------------------

/**
 * monthGridStart — 给一个月 base, 算 42 格视图的起始 cell (该月 1 号所在周的周一).
 *
 * 1:1 对齐 prototype line 1908-1914 (`start` 公式):
 *   `(first.getDay() + 6) % 7` — 把周日=0 改为 周日=6, 周一=0, ..., 周六=5.
 *   start = first - thatManyDays (回退到该周的周一).
 */
export function monthGridStart(monthBase: Date): Date {
  const y = monthBase.getFullYear();
  const m = monthBase.getMonth();
  const first = new Date(y, m, 1);
  const back = ((first.getDay() + 6) % 7);
  return addDays(first, -back);
}

/**
 * weekBaseOf — 给一个 now, 返回本周一 (新 Date, 不改原对象).
 *
 * 周一为一周第一天 (与原型 weekBase 一致).
 */
export function weekBaseOf(d: Date): Date {
  const back = (d.getDay() + 6) % 7;
  return addDays(d, -back);
}

/**
 * pickDayPlan — 「月视图点某一天 / 点某一条条目」的结果计算 (**纯函数**)。
 *
 *   ⚠️ gaga 2026-10-21 生产实测:
 *     「月视图点某一天,不可以调转到详情,，而是要进入到周视图里的这一天。
 *       现在点击更多是这个逻辑,但是点击日程还是会进入日程详情。
 *       日程详情只在周视图里才能看到哦。」
 *   → 月视图里**任何**一次点选 (空格 / 条目 / 「+N 更多」) 结果都一样:
 *     切到**周视图** + 把选中日定位到那一天。
 *
 *   返回:
 *     mode      = "week" (永远是周视图)
 *     weekOffset= 目标那天所在周 相对 本周 的周偏移 (跨周 / 跨月都算得对)
 *     focusIdx  = 目标那天在它所在周里的下标 (0 = 周一 … 6 = 周日)
 */
export function pickDayPlan(
  dayKey: string,
  now: Date,
): { mode: "week"; weekOffset: number; focusIdx: number } {
  const targetWeek = weekBaseOf(ymdToDate(dayKey));
  const thisWeek = weekBaseOf(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  const weekOffset = Math.round((targetWeek.getTime() - thisWeek.getTime()) / 86400000 / 7);
  const d = ymdToDate(dayKey);
  const focusIdx = Math.max(0, Math.min(6, Math.round((d.getTime() - targetWeek.getTime()) / 86400000)));
  return { mode: "week", weekOffset, focusIdx };
}

// ---------------------------------------------------------------------------
// 视图类型 — 颜色 / 文案纯函数映射
// ---------------------------------------------------------------------------

/**
 * evtCls — 把 ScheduleItem (cron 也走同一个映射) 映射到 visual class key.
 *
 *   done       → "event"  (success 绿)
 *   in_progress→ "task"   (cyan)
 *   pending    → "todo"   (brand 紫)
 *
 * 1:1 对齐 prototype line 1341-1346.
 *
 * 由于 ScheduleItem 没有 status 字段, 真实 e2e 渲染时调用方应用
 * `tree.effectiveStatus(item)` 拿到值再传给本函数. 这里接原值.
 */
export function evtCls(itemStatus: ItemStatus): "todo" | "task" | "event" {
  if (itemStatus === "done") return "event";
  if (itemStatus === "in_progress") return "task";
  return "todo";
}

/**
 * cronVisualCls — cron 在视觉上属于「定时任务」独立实体, **永远走
 * `cron`** class (紫). 不接 effectiveStatus 那条规则.
 */
export function cronVisualCls(): "cron" {
  return "cron";
}

// ---------------------------------------------------------------------------
// 实用工具 — 给 verify 直接 export 用
// ---------------------------------------------------------------------------

/**
 * hourHOf — 把日程项的 height 计算统一放在这 (原型 hourPx() 读 --hour-h).
 *   这里返回常数 56 (desktop) / 48 (mobile), 跟 prototype :root --hour-h 一致.
 *   真实 React 端用 CSS 变量, 这里只是常量, 验证脚本可调.
 */
export function hourHOf(viewport: "mobile" | "desktop"): number {
  return viewport === "desktop" ? 56 : 48;
}

/** parseYmd 重新导出 (让 verify 一处 import). */
export { parseYmd };
