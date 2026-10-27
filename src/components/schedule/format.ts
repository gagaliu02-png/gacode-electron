/**
 * src/components/schedule/format.ts
 *
 * 日程中心展示层格式化工具 (今日待办 + 任务看板共用)。
 *
 * ⚠️ 本文件**不定义任何 DTO** —— DTO 全部集中在 src/lib/schedule-api.ts。
 *    这里只有纯函数 (输入 primitive / 已经在 api 层拿到的实体, 输出字符串)。
 *
 * cron 描述 1:1 移植自 docs/prototype/schedule-center.html 的
 * parseCronField / parseCron / describeCron (5 段 cron: 分 时 日 月 周),
 * 保证「每天 09:00」「每周五 18:00」这类文案跟原型截图逐字一致。
 *
 * formatCountdown 来自**契约** (不是原型): UX §6.2「倒计时规则 (统一函数
 * formatCountdown(ddl, now))」四档表 —— 逐档照抄, 别自己发挥。
 */

function pad2(n: number | string): string {
  return String(n).padStart(2, "0");
}

/** 原型: YYYY-MM-DD → 本地时间 Date (直接 new Date('2026-10-21') 会按 UTC 解析, 本地会退一天). */
export function parseYmd(ymd: string): Date {
  return new Date(ymd.replace(/-/g, "/"));
}

/** 原型 fmtDate: 10月23日 */
export function fmtDate(d: Date): string {
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 原型 ymd: 2026-10-23 (本地) */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 原型 fmtFull: 10月28日 18:00 — 截止日 / 下次运行时间统一用它。 */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${fmtDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const WEEKDAY_CN = "日一二三四五六";

/** 星期二 */
export function weekdayLabel(d: Date): string {
  return `星期${WEEKDAY_CN[d.getDay()]}`;
}

/** 原型 hero 大标题: 10月20日 星期二 */
export function heroDateLabel(d: Date): string {
  return `${fmtDate(d)} ${weekdayLabel(d)}`;
}

/**
 * 距日终还有几小时 — hero 右侧那个 chip。
 *
 * ⚠️ 原型这里是**写死的** '距日终 6 小时' (NOW=10:49 时也对不上), 本实现按真实时钟算,
 *   取 floor。mock 下会显示 13 小时。属有意偏离, 已在 P2 报告里说明。
 */
export function hoursLeftOfDay(now: Date): number {
  const used = now.getHours() + now.getMinutes() / 60;
  return Math.max(0, Math.floor(24 - used));
}

/**
 * 原型 todayWhen: 今日待办行上的时间文案。
 *   今天 → "今天 09:00–10:00"; 其他日期 → "10月21日 10:00–11:00"
 *
 * v6: 显示完整时段 (startAt–endAt) 而非只显示开始时刻 —— 桌面 + 移动端
 *     截图都按这个格式渲染 (round-desktop-today.png / mobile-today.png 都看得到)。
 *     v6 取消「无时段」分支 —— ScheduleItem.startAt / endAt 都必填,
 *     endAt > startAt 由契约保证, 这里不再做防御性检查。
 */
export function formatScheduleWhen(
  date: string,
  startAt: string,
  endAt: string,
  todayYmd: string,
): string {
  const range = `${startAt}–${endAt}`;
  if (date === todayYmd) return `今天 ${range}`;
  return `${fmtDate(parseYmd(date))} ${range}`;
}

/**
 * 原型 relNext: cron 的「下次运行」相对文案。
 *   今天 → "今天 09:00"; 明天 → "明天 09:00"; 更远 → "10月23日 18:00"
 *
 * ⚠️ 「明天」是拿 **now 的日期 +1** 去比的 (原型 `new Date(NOW.year, NOW.month, NOW.date+1)`),
 *   不是拿 nextRunAt 自己的日期 +1 —— 后者永远等于自己, 分支形同虚设。
 *   所以这里收 now 而不是 todayYmd。
 */
export function relNext(iso: string | null | undefined, now: Date): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const key = ymd(d);
  if (key === ymd(now)) return `今天 ${time}`;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (key === ymd(tomorrow)) return `明天 ${time}`;
  return `${fmtDate(d)} ${time}`;
}

// ---------------------------------------------------------------------------
// 任务看板 — 倒计时 (契约 §6.2 四档表)
// ---------------------------------------------------------------------------

/** 倒计时的语气档 —— 对应契约 §6.2 表的「样式」列。 */
export type CountdownTone = "muted" | "warning" | "danger";

/** 倒计时渲染结果: 文案 + 语气档 (tone → 文字颜色 class)。 */
export interface CountdownView {
  /** 显示文案 (契约 §6.2「显示」列) */
  text: string;
  /** 语气档 (契约 §6.2「样式」列) */
  tone: CountdownTone;
}

const DAY_MS = 86400000;

/**
 * formatCountdown — 任务卡片的 DDL 倒计时 (契约 §6.2)。
 *
 *   契约四档表 (逐档照抄, 顺序即优先级):
 *     | 条件              | 显示                | 样式          |
 *     | ddl - now > 7d    | 5月16日             | text-fg-muted |
 *     | 1d < 剩 ≤ 7d      | 5月16日 · 还剩 3 天  | text-fg-muted |
 *     | 剩 ≤ 1d 且同天     | 今天到期             | text-warning  |
 *     | 已过期            | 已逾期 2 天          | text-danger   |
 *
 * ⚠️ **时间基准 = now 由调用方给**, 调用方必须传**服务端 serverTime**
 *    (契约 §6.2 注: 「用 server 端返回的 serverTime 字段(不信任设备本地时间)算倒计时」)。
 *    本函数**不读本机时钟** —— 这样断言脚本能用固定时钟复现, 也让口径只有一个入口。
 *
 * ⚠️ 「剩 ≤ 1d 且同天」跨零点时 (今天 20:00 → 明天 08:00) 契约没给第 5 档文案,
 *    这里按同一档语气给「明天到期」, 不硬套「今天到期」(那样是错的)。
 *    口径跟原型 countdownChip (docs/prototype/schedule-center.html:1320) 有一处差异:
 *    原型不分同天/跨天。本实现按契约的「且同天」限定走。
 *
 * @returns null = 没有截止时间 (无 ddl) → 卡片不渲染倒计时
 */
export function formatCountdown(
  ddl: string | null | undefined,
  now: Date,
): CountdownView | null {
  if (!ddl) return null;
  const t = new Date(ddl).getTime();
  if (Number.isNaN(t)) return null;

  const diff = t - now.getTime();

  // ① 已过期 → 已逾期 N 天
  if (diff < 0) {
    const days = Math.max(1, Math.floor(Math.abs(diff) / DAY_MS));
    return { text: `已逾期 ${days} 天`, tone: "danger" };
  }

  // ② 剩 ≤ 1d → 今天到期 (跨零点 → 明天到期)
  if (diff <= DAY_MS) {
    const sameDay = ymd(new Date(t)) === ymd(now);
    return { text: sameDay ? "今天到期" : "明天到期", tone: "warning" };
  }

  // ③ 剩 ≤ 7d → 日期 + 还剩 N 天
  const days = Math.floor(diff / DAY_MS);
  const dateText = fmtDate(new Date(t));
  if (diff <= 7 * DAY_MS) {
    return { text: `${dateText} · 还剩 ${days} 天`, tone: "muted" };
  }

  // ④ 剩 > 7d → 只显示日期
  return { text: dateText, tone: "muted" };
}

/** 原型 ddlShort: 11/14 18:00 —— 任务树里的子任务 / 关键节点用这个短格式。 */
export function fmtDdlShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** 原型 scheduleTreeRow: 11/06 10:00–12:00 —— 任务树里的日程叶子用这个。 */
export function fmtScheduleWhenShort(
  date: string,
  startAt: string,
  endAt: string,
): string {
  const d = parseYmd(date);
  if (Number.isNaN(d.getTime())) return "—";
  return `${pad2(d.getMonth() + 1)}/${pad2(d.getDate())} ${startAt}–${endAt}`;
}

// ---------------------------------------------------------------------------
// cron 5 段解析 + 人类可读描述 (1:1 移植原型)
// ---------------------------------------------------------------------------

function parseCronField(field: string, min: number, max: number): Set<number> | null {
  const set = new Set<number>();
  const parts = String(field).split(",");
  for (const p of parts) {
    const s = p.trim();
    if (!s) return null;
    let base = s;
    let step = 1;
    const m = s.match(/^(.+?)\/(\d+)$/);
    if (m) {
      base = m[1];
      step = Number(m[2]);
      if (!step) return null;
    }
    let lo: number;
    let hi: number;
    if (base === "*") {
      lo = min;
      hi = max;
    } else if (/^\d+$/.test(base)) {
      lo = Number(base);
      hi = step > 1 ? max : Number(base);
    } else {
      const r = base.match(/^(\d+)-(\d+)$/);
      if (!r) return null;
      lo = Number(r[1]);
      hi = Number(r[2]);
    }
    if (lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) set.add(v);
  }
  return set.size ? set : null;
}

/** 返回 null = 不是合法的 5 段 cron。解析结果只在本文件内部用, 不导出 (不是 DTO)。 */
function parseCron(
  expr: string,
): null | {
  mi: number[];
  hr: number[];
  dom: number[];
  mon: number[];
  dow: number[];
  domStar: boolean;
  dowStar: boolean;
} {
  if (typeof expr !== "string") return null;
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const mi = parseCronField(parts[0], 0, 59);
  const hr = parseCronField(parts[1], 0, 23);
  const dom = parseCronField(parts[2], 1, 31);
  const mon = parseCronField(parts[3], 1, 12);
  const dw = parseCronField(parts[4], 0, 7);
  if (!mi || !hr || !dom || !mon || !dw) return null;
  const dowSet = new Set<number>();
  dw.forEach((v) => dowSet.add(v === 7 ? 0 : v));
  const arr = (s: Set<number>) => Array.from(s).sort((a, b) => a - b);
  return {
    mi: arr(mi),
    hr: arr(hr),
    dom: arr(dom),
    mon: arr(mon),
    dow: arr(dowSet),
    domStar: parts[2] === "*",
    dowStar: parts[4] === "*",
  };
}

/**
 * describeCron — 5 段 cron → 人类可读描述。
 *   "0 9 * * *"    → 每天 09:00
 *   "0 18 * * 5"   → 每周五 18:00
 *   每 30 分钟一跳  → 每 30 分钟
 *   解析不了        → 自定义 (原样回显表达式)
 */
export function describeCron(expr: string): string {
  const p = parseCron(expr);
  if (!p) return `自定义 (${String(expr == null ? "" : expr).trim()})`;
  const s = String(expr).trim().split(/\s+/);
  const mn = s[0];
  const hr = s[1];
  const dm = s[2];
  const mo = s[3];
  const dw = s[4];
  if (mn.indexOf("*/") === 0 && hr === "*" && dm === "*" && mo === "*" && dw === "*") {
    const n = Number(mn.slice(2));
    if (n === 60) return "每小时";
    return `每 ${n} 分钟`;
  }
  if (/^\d+$/.test(mn) && hr === "*" && dm === "*" && mo === "*" && dw === "*") {
    return `每小时的第 ${mn} 分`;
  }
  if (/^\d+$/.test(mn) && /^\d+$/.test(hr) && dm === "*" && mo === "*" && dw === "*") {
    return `每天 ${pad2(Number(hr))}:${pad2(Number(mn))}`;
  }
  if (/^\d+$/.test(mn) && /^\d+$/.test(hr) && dm === "*" && mo === "*" && /^\d$/.test(dw)) {
    return `每周${WEEKDAY_CN[Number(dw)]} ${pad2(Number(hr))}:${pad2(Number(mn))}`;
  }
  return `自定义 (${String(expr).trim()})`;
}