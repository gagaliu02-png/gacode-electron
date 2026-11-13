/**
 * electron/client-tools/cron.ts —— 5 段 cron 的解析与匹配
 *
 * [2026-11-12 · P7] 本机定时任务（gaga 拍板：定时任务**只在 Gacode 打开时跑**，
 * **不写** Windows 计划任务）需要判断「到点了吗」。
 *
 * ## 支持的写法
 *
 *   `分 时 日 月 周`（5 段，空格分隔）
 *
 *   · `*`      全部
 *   · `5`      单值
 *   · `1,2,3`  列表
 *   · `1-5`    区间
 *   · `*` + `/10`  步长（每 10 分钟）
 *   · `1-20/5` 区间 + 步长
 *   · 月/周可以写英文名：`jan` / `mon`（大小写不敏感）
 *
 * ## 日/周的 cron 语义（容易写错）
 *
 *   标准的 cron：**日**和**周**都写了（且都不是 `*`）⇒ 取**或**；
 *   只写了一个 ⇒ 就用它。⇒ 「每月 1 号」和「每周一」都能用同一个表达式表达，
 *   但「每月 1 号 **或** 每周一」要用 `1 * *` + `* * 1` 那种写法 ⇒ 我们按标准来。
 *
 * ## 为什么自己写而不引依赖
 *
 * PC 端本来就只装了几个依赖；为一个 cron 解析器引一个包不值当，
 * 而且**自己写的那份可以单测**（`test/client-tools-cron.test.mjs`）。
 */

/** 解析出来的一段（值集合 + 是不是 `*`）。 */
export interface ParsedField {
  values: number[];
  /** 原字段是不是 `*`（决定日/周取「或」还是「与」）。 */
  wildcard: boolean;
}

const MONTH_ALIASES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const DOW_ALIASES: Record<string, number> = {
  sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
};

/**
 * 解析一段字段。
 *
 * @returns null = 语法不合法（调用方据此报「表达式写错了」，**不猜**）。
 */
export function parseCronField(
  raw: string,
  min: number,
  max: number,
  aliases?: Record<string, number>,
): ParsedField | null {
  const field = String(raw || '').trim();
  if (!field) return null;
  const wildcard = field === '*';
  const out: number[] = [];
  const seen = new Set<number>();

  for (const part of field.split(',')) {
    const seg = part.trim();
    if (!seg) return null;
    let range = seg;
    let step = 1;
    const slash = seg.indexOf('/');
    if (slash >= 0) {
      range = seg.slice(0, slash).trim();
      const stepRaw = seg.slice(slash + 1).trim();
      step = Number(stepRaw);
      if (!Number.isInteger(step) || step <= 0) return null;
    }
    let lo: number | null;
    let hi: number | null;
    if (range === '*') {
      lo = min;
      hi = max;
    } else if (range.includes('-')) {
      const [a, b] = range.split('-');
      lo = resolveValue(a, aliases);
      hi = resolveValue(b, aliases);
    } else {
      lo = resolveValue(range, aliases);
      // 「5/10」⇒ 5,15,25…（上限到 max）; 「5」⇒ 就 5。
      hi = slash >= 0 ? max : lo;
    }
    if (lo == null || hi == null) return null;
    if (lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) {
      if (!seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    }
  }
  return { values: out, wildcard };
}

/** 把 `jan` / `mon` 这类名字换成数字；不是名字就按数字解析。 */
function resolveValue(raw: string, aliases?: Record<string, number>): number | null {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  if (aliases && Object.prototype.hasOwnProperty.call(aliases, s)) return aliases[s];
  if (!/^\d+$/.test(s)) return null;
  return Number(s);
}

/** 解析后的完整表达式。 */
export interface ParsedCron {
  minute: ParsedField;
  hour: ParsedField;
  dom: ParsedField;
  month: ParsedField;
  dow: ParsedField;
}

/** 解析一个 5 段 cron 表达式；不合法返回 null。 */
export function parseCron(expr: string): ParsedCron | null {
  const parts = String(expr || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length !== 5) return null;
  const minute = parseCronField(parts[0], 0, 59);
  const hour = parseCronField(parts[1], 0, 23);
  const dom = parseCronField(parts[2], 1, 31);
  const month = parseCronField(parts[3], 1, 12, MONTH_ALIASES);
  const dow = parseCronField(parts[4], 0, 6, DOW_ALIASES);
  if (!minute || !hour || !dom || !month || !dow) return null;
  // 周日可以用 7（有些 cron 这么写）⇒ 归一到 0。
  if (dow.values.includes(7) && !dow.values.includes(0)) {
    dow.values.push(0);
    dow.values.sort((a, b) => a - b);
  }
  return { minute, hour, dom, month, dow };
}

/** 这个时刻命中吗？ */
export function cronMatches(expr: string, date: Date): boolean {
  const p = parseCron(expr);
  if (!p) return false;
  if (!p.minute.values.includes(date.getMinutes())) return false;
  if (!p.hour.values.includes(date.getHours())) return false;
  if (!p.month.values.includes(date.getMonth() + 1)) return false;
  const domOk = p.dom.values.includes(date.getDate());
  const dowOk = p.dow.values.includes(date.getDay());
  // 标准 cron：日、周**都**受限 ⇒ 取「或」；只写一个 ⇒ 用那个。
  if (p.dom.wildcard && p.dow.wildcard) return true;
  if (p.dom.wildcard) return dowOk;
  if (p.dow.wildcard) return domOk;
  return domOk || dowOk;
}

/**
 * 下一次命中的时刻（**严格大于** `from`）。
 *
 * @returns null = 表达式不合法，或一年内不会命中（等价的 cron 极少）。
 */
export function nextCronTime(expr: string, from: Date): Date | null {
  const p = parseCron(expr);
  if (!p) return null;
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  // 一年最多 366 天 ⇒ 最多扫 527040 分钟。
  const limit = 366 * 24 * 60;
  for (let i = 0; i < limit; i += 1) {
    if (cronMatches(expr, d)) return d;
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

/** 人话描述（给 UI 显示「下一次：…）。 */
export function describeCron(expr: string): string {
  const p = parseCron(expr);
  if (!p) return '表达式不合法';
  const parts: string[] = [];
  if (!p.minute.wildcard) parts.push(`分 ${p.minute.values.join(',')}`);
  if (!p.hour.wildcard) parts.push(`时 ${p.hour.values.join(',')}`);
  if (!p.dom.wildcard) parts.push(`日 ${p.dom.values.join(',')}`);
  if (!p.month.wildcard) parts.push(`月 ${p.month.values.join(',')}`);
  if (!p.dow.wildcard) parts.push(`周 ${p.dow.values.join(',')}`);
  return parts.length ? parts.join(' · ') : '每分钟';
}
