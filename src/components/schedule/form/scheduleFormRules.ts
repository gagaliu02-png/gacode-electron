/**
 * scheduleFormRules — 日程表单的**纯计算** (校验 + 跨天口径)。
 *
 * ⚠️ 为什么单独一个文件:
 *   表单校验是纯函数 (输入 values → 输出错误字典), 放这里可以被
 *   scripts/verify-schedule-form.mjs 直接 import 断言 —— 不用起浏览器、
 *   不用打网络 (跟 detailModel.ts 一个路子)。
 *
 * 契约来源: gaclaw/docs/design/schedule-center-ux-2026-10-20.md §9.2 / §9.4 / §9.5
 * 需求来源: gaga 2026-10-21 P0-F (跨天日程) / P0-G (任务表单) + 总 PM 决策 D2 / D3
 */

export type FormMode = "create" | "edit" | "delay";
export type FormKind = "schedule" | "task" | "subtask" | "milestone";

export interface FormValues {
  title: string;
  desc: string;
  note: string;
  /** YYYY-MM-DD (日程的**开始日期**) */
  date: string;
  /** YYYY-MM-DD (日程的**结束日期**, 跨天用; 缺省 = 开始日期) */
  endDate: string;
  /** HH:mm */
  start: string;
  /** HH:mm */
  end: string;
  /** YYYY-MM-DD */
  ddlDate: string;
  /** HH:mm */
  ddlTime: string;
  ownerType: "user" | "cody";
  status: "pending" | "in_progress" | "done";
  remindOn: boolean;
  remindOffset: number;
  remindChannels: string[];
}

/** 父级约束 —— 用来收窄日期选择器 + 保存时拦越界。 */
export interface FormBound {
  /** 父级类型中文名 (任务 / 子任务 / 关键节点) */
  label: string;
  /** 父级标题 */
  title: string;
  /**
   * 父级 **effectiveDdl** (ISO) —— 决定 DDL / 日期上限。
   *
   * ⚠️ 必须是 **effective 值**, 不是父级自己的 `ddl`:
   *   父级的 ddl 可能为空 (继承来的, 例如子任务继承任务的截止时间) ——
   *   用父级自身的空值当上限 = 整道限制失效 (gaga 2026-10-21 生产实测)。
   *   口径照契约 §9.4b: `child.effectiveDdl ≤ parent.effectiveDdl`。
   *   null = 父级不设截止 → **两者都不限**。
   */
  ddl?: string | null;
}

/** 结束日期 (跨天口径): 缺省 = 开始日期。 */
export function endDateOf(values: { date: string; endDate: string }): string {
  return values.endDate || values.date;
}

/**
 * ddlEmptyLabel — 截止时间选择器的**空值占位文案**。
 *
 * ⚠️ gaga 2026-10-21 生产实测: 「任务的创建入口,截止日期那里显示继承(继承),
 *   他已经是父节点了,没有可以继承的,有bug。」
 *   → **任务(树根)没有父级**, 截止时间就是它自己的真值:
 *     留空 = **不设截止**, 绝不出现「继承」字样。
 *   → 子任务 / 关键节点 / 日程**确实有父级**, 继承语义照旧 (契约 §9.5)。
 */
export function ddlEmptyLabel(kind: FormKind): string {
  return kind === "task" ? "留空 = 不设截止" : "留空 = 继承";
}

/** "HH:mm" → 从 00:00 起的分钟数; 解析不出来返回 null。 */
export function toMin(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** ISO → "M月D日 HH:mm" (越界提示用)。 */
export function fmtDdl(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** ISO → YYYY-MM-DD (本地)。 */
export function ymdOf(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * validateForm — 表单校验 (纯函数)。
 *
 * 口径:
 *   通用     标题空 → 「名称 / 标题不能为空」
 *   日程     开始日期 / 结束日期 必填; 结束日期 ≥ 开始日期;
 *            结束时间**必填** (跨天也必填 —— PM 2026-10-21 最终拍板:
 *            「结束时间保持必填, 不要做留空 → 结束日 23:59:59 的分支,
 *              那是后端兜底, 前端不产生留空数据」);
 *            同一天 → 结束时间必须 > 开始时间 (SCHEDULE_TIME_RANGE_INVALID);
 *            跨天 → 结束时间落在**结束日期**上, 天然 > 开始时间, 前端不重复判
 *   父子越界 DDL 晚于父级 / 日程日期晚于父级截止日 → 拦 (契约 §9.4b / §9.5)
 *     ⚠️ **create / edit / delay 一律校验** —— 旧实现只校验 edit/delay,
 *        新建子任务 / 关键节点时整段跳过 (gaga 2026-10-21 生产实测的 bug)。
 *
 * ⚠️ SCHEDULE_DATE_MISMATCH 前端**不实现** (总 PM 2026-10-21 拍板 D4):
 *    日期一致性交后端 422, 由页面按错误码映射回字段。
 */
export function validateForm(
  values: FormValues,
  kind: FormKind,
  mode: FormMode,
  bound?: FormBound | null,
): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!String(values.title || "").trim()) errs.title = "名称 / 标题不能为空";

  if (kind === "schedule" && mode !== "delay") {
    // gaga P0-F / 决策 D2: 开始日期 + 结束日期 (支持跨天)
    if (!values.date) errs.date = "开始日期不能为空";
    if (!values.endDate) errs.endDate = "结束日期不能为空";
    if (values.date && values.endDate && values.endDate < values.date) {
      errs.endDate = "结束日期不能早于开始日期";
    }
    if (!values.start) errs.start = "开始时间不能为空";
    if (!values.end) errs.end = "结束时间不能为空";
    // 同一天才需要比 结束 > 开始 (跨天时 endAt 落在结束日期上, 天然更晚)
    const sameDay = !!(values.date && values.endDate && values.endDate === values.date);
    if (sameDay && values.start && values.end) {
      const s = toMin(values.start);
      const e = toMin(values.end);
      if (s != null && e != null && e <= s) {
        errs.end = `结束时间必须晚于开始时间 (${values.start} ~ ${values.end})`;
      }
    }
  }

  if (kind === "task") {
    // gaga P0-G / 决策 D3: 任务新建必须给开始时间 (状态由后端按时间派生)
    if (mode === "create") {
      if (!values.date) errs.date = "开始日期不能为空";
      if (!values.start) errs.start = "开始时间不能为空";
    }
    // 截止时间 (可空) 不能早于开始时间
    if (values.date && values.start && values.ddlDate) {
      const s = new Date(`${values.date}T${values.start}`).getTime();
      const d = new Date(`${values.ddlDate}T${values.ddlTime || "23:59"}`).getTime();
      if (!Number.isNaN(s) && !Number.isNaN(d) && s > d) {
        errs.ddl = "截止时间不能早于开始时间";
      }
    }
  }

  // -------------------------------------------------------------------------
  // 父级 DDL 上限 (契约 §9.4b)
  //
  //   统一判据 (逐字照契约):
  //     child.effectiveDdl != null && parent.effectiveDdl != null
  //       && child.effectiveDdl > parent.effectiveDdl → 422 DDL_EXCEEDS_PARENT
  //   等价写法: 子级**自身** ddl 不得晚于父级 effectiveDdl; 自身 ddl 为空 → 必然满足。
  //   日程额外两条: schedule.date ≤ 父级 effectiveDdl **所在日**;
  //                 跨天日程的结束日期同样 ≤ 该日 (契约 §9.4b v9 D2)。
  //   父级 effectiveDdl 为 null → **两者都不限**; 游离日程 (无父级) → 不校验。
  //
  //   ⚠️ gaga 2026-10-21 生产实测: 旧实现写的是
  //      `if (mode !== "create" || kind === "schedule")` ——
  //      **新建子任务 / 关键节点时整段被跳过** = 前端这道拦截形同虚设,
  //      结果「可以设置在父级截止之后」。现在 create / edit / delay **一律校验**。
  // -------------------------------------------------------------------------
  const boundDdl = bound?.ddl ?? null;
  if (boundDdl) {
    const boundMaxDate = ymdOf(boundDdl);
    const boundTs = new Date(boundDdl).getTime();
    // ① 截止时间不得晚于父级 effectiveDdl (比真实时刻)
    if (values.ddlDate) {
      const ddlTs = new Date(`${values.ddlDate}T${values.ddlTime || "23:59"}`).getTime();
      if (!Number.isNaN(ddlTs) && !Number.isNaN(boundTs) && ddlTs > boundTs) {
        errs.ddl = `截止时间不能晚于${bound!.label}「${bound!.title}」的截止时间(${fmtDdl(boundDdl)})`;
      }
    }
    // ② 日程: 开始日期 / 结束日期 都不得晚于父级 effectiveDdl 所在日 (按日比)
    if (kind === "schedule") {
      if (values.date && boundMaxDate && values.date > boundMaxDate) {
        errs.date = `日期不能晚于${bound!.label}「${bound!.title}」的截止日期(${boundMaxDate})`;
      }
      if (values.endDate && boundMaxDate && values.endDate > boundMaxDate) {
        errs.endDate = `结束日期不能晚于${bound!.label}「${bound!.title}」的截止日期(${boundMaxDate})`;
      }
    }
  }
  return errs;
}
