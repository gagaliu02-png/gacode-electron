/**
 * components/schedule/form/ScheduleFormSheet.tsx — 新建 / 编辑 / 改 DDL 的底部弹层
 * (原型 .sheet, 规格书 A5.1–A5.3) · PC 端 B6.
 *
 * 抄自 web `gacode-web/src/components/schedule/form/ScheduleFormSheet.tsx` (636 行),
 * 只换 PC 写法:
 *   - `cn(...)`      → 数组 filter(Boolean).join(" ")
 *   - `lucide-react` → PC 图标唯一出处是 `components/ui/Glyphs.tsx`
 *     (`AlertCircle` → `AlertCircleIcon` / `X` → `CloseIcon` /
 *      `CheckSquare` → `CheckSquareIcon` (B6 新画) /
 *      `CalendarClock` → `CalendarClockIcon` (B6 新画))
 *   - `import * as React from "react"` → 具名导入
 *   - `from "@/lib/api"` → `from "../../../lib/api"` (三级)
 *   - 去掉 web 的 `"use client"` —— PC 没有 SSR / hydration, 不需要。
 *
 * ⚠️ **形态**: web 的这张 sheet 是**自绘**的 (自己写 div, **不走** web 的
 *   `components/ui/sheet.tsx`), PC 侧**照抄这个 div 结构**, **不要**套 PC 的
 *   `BottomSheet` (那个是全宽 + rounded-t-2xl + max-h-85vh + p-6 + 内置标题栏,
 *   形态完全不同)。
 *
 * 三种模式 (原型 renderSheet L2656-2684):
 *   create  标题「新建」/ 底按钮「创建」  —— 按 kind 给字段
 *   edit    标题「编辑<类型>」/ 底按钮「保存」
 *   delay   标题「改 DDL」/ 底按钮「确认」 —— 只有 DDL 日期 + 时间两个字段
 *
 * 视觉口径 (原型 L443-495):
 *   .sheet   fixed 底部 / bg --bg-elevated / radius 24px 24px 0 0 / max-height 88dvh /
 *            flex column / shadow --shadow-dialog / max-width 520px 居中
 *   .sheet-h padding 18px 20px 12px / flex / border-bottom 1px rgba(255,255,255,.06) / h2 16px·500
 *   .sheet-b padding 18px 20px / overflow-y auto / flex column / gap 16px
 *   .sheet-f padding 14px 20px 22px / flex / gap 10px / border-top 1px rgba(255,255,255,.06)
 *   .field   label 13px --fg-muted / margin-bottom 7px
 *   .inp     bg rgba(255,255,255,.06) / border transparent / radius full / padding 9px 14px / 14px
 *            focus → border --brand + 0 0 0 1px --brand
 *            textarea → radius 16px / min-height 72px / line-height 1.5
 *   .two     grid 1fr 1fr / gap 12px
 *   .tog     44×26 开关 (原型 .tog)
 *   .chipsel inline-flex / gap 5px / 13px / radius full / padding 6px 13px / bg rgba(255,255,255,.06)
 *   .hintrow flex gap 6px / 12px / --warning / margin-top 6px
 *   .errrow  flex gap 6px / 12.5px / --danger / bg --danger-soft / radius 12px / padding 9px 12px
 *   .ferr    字段级红字 12.5px / margin-top 7px
 *
 * 校验 (原型 validateCtx L2739-2787 + saveSheet L2788-2800):
 *   标题空        → 「名称 / 标题不能为空」
 *   开始日期空    → 「开始日期不能为空」
 *   开始时间空    → 「开始时间不能为空」
 *   结束日期空    → 「结束日期不能为空」
 *   结束 ≤ 开始   → 「结束时间必须晚于开始时间」(SCHEDULE_TIME_RANGE_INVALID)
 *   DDL 晚于父级  → 「截止时间不能晚于<父级>「<标题>」的截止时间(...)」
 *   日期晚于父级  → 「日期不能晚于<父级>「<标题>」的截止日期(...)」
 *
 * ⚠️ SCHEDULE_DATE_MISMATCH 前端**不实现** (总 PM 2026-10-21 拍板 D4):
 *    表单只填 HH:mm (没有日期部分), 该分支永远不触发; 日期一致性交后端 422,
 *    由页面按错误码映射回 start / end 字段显示同一句文案。
 *
 * ⚠️ **冲突类名** (Tailwind 3.4.19, 不用 `!important`):
 *   textarea 的 `rounded-md` (16px) 要盖住 `inpCls` 里的 `rounded-full` ⇒ `!rounded-md`。
 */

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircleIcon, CalendarClockIcon, CheckSquareIcon, CloseIcon } from "../../ui/Glyphs";
import { CustomSelect } from "./CustomSelect";
import { DatePickerField } from "./DatePickerField";
import { TimePickerField } from "./TimePickerField";
import {
  ddlEmptyLabel,
  endDateOf,
  fmtDdl,
  validateForm,
  ymdOf,
  type FormBound,
  type FormKind,
  type FormMode,
  type FormValues,
} from "./scheduleFormRules";
// 初始值住在 scheduleFormInit.ts (纯模块) —— 断言脚本能直接 import 跑真值。
import { initialValues } from "./scheduleFormInit";
import { getProfile } from "../../../lib/api";
import type { ItemStatus, OwnerType } from "../../../lib/schedule-api";

// 表单的类型与校验规则住在 scheduleFormRules.ts —— 纯函数, 断言脚本能直接 import。
export type { FormBound, FormKind, FormMode, FormValues };

interface ScheduleFormSheetProps {
  open: boolean;
  mode: FormMode;
  kind: FormKind;
  /** 编辑 / 改 DDL 的对象 (create 时可空) */
  node?: Record<string, any> | null;
  bound?: FormBound | null;
  /** 新建日程的默认日期 (YYYY-MM-DD) */
  defaultDate?: string;
  onClose: () => void;
  onSubmit: (values: FormValues) => void | Promise<void>;
  submitting?: boolean;
  /** 后端 422 映射回来的字段级错误 */
  serverErrors?: Record<string, string>;
}

const KIND_LABEL: Record<FormKind, string> = {
  task: "任务",
  subtask: "子任务",
  milestone: "关键节点",
  schedule: "日程",
};

const STATUS_OPTIONS = [
  { value: "pending", label: "未开始" },
  { value: "in_progress", label: "进行中" },
  { value: "done", label: "已完成" },
];

const REMIND_OFFSETS = [
  { value: 0, label: "准时" },
  { value: 15, label: "15 分钟" },
  { value: 60, label: "1 小时" },
  { value: 1440, label: "1 天" },
];

/**
 * 通知渠道选项 (2026-10-22 · 件 2「web Reminder.channels 仍透传 wechat」)。
 *
 * ⚠️ 现行口径 (契约决策 A) 只有两个渠道: `in_app` / `app_push`。
 *    旧实现还有第三项 `wechat`(微信) + 一句「微信渠道未绑定」的提示 ——
 *    那是**把老渠道显示成可用渠道**, 跟收敛后的口径冲突, 已删。
 *
 * ⚠️ DTO 类型保持 `string[]` (`Reminder.channels`), 后端值**原样透传** ——
 *    存量数据里的 `wechat` 仍会被读出来, 只是**不再显示成可选项**。
 */
const CHANNELS = [
  { value: "in_app", label: "应用内通知" },
  { value: "app_push", label: "应用弹窗" },
];

export function ScheduleFormSheet({
  open,
  mode,
  kind,
  node,
  bound,
  defaultDate,
  onClose,
  onSubmit,
  submitting = false,
  serverErrors,
}: ScheduleFormSheetProps) {
  const [values, setValues] = useState<FormValues>(() =>
    initialValues(mode, kind, node, defaultDate),
  );
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({});

  // 打开时重置 (mode/kind/node 变化都要重置)
  useEffect(() => {
    if (!open) return;
    setValues(initialValues(mode, kind, node, defaultDate));
    setLocalErrors({});
  }, [open, mode, kind, node, defaultDate]);

  // 责任人选项里的「我」要显示真实名字 —— 跟抽屉用同一个 profile 查询 (React Query 去重)
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: getProfile });
  const myName =
    profile?.displayName || profile?.username || (node?.ownerName as string) || "我";

  const errors = { ...localErrors, ...(serverErrors ?? {}) };
  const hasError = Object.keys(errors).length > 0;

  const set = useCallback(<K extends keyof FormValues>(k: K, v: FormValues[K]) => {
    setValues((prev) => ({ ...prev, [k]: v }));
  }, []);

  const boundDdl = bound?.ddl ?? null;
  const boundMaxDate = boundDdl ? ymdOf(boundDdl) : null;

  // 校验规则住在 scheduleFormRules.ts (纯函数) —— 断言脚本直接 import 跑真值。
  const validate = (): Record<string, string> => validateForm(values, kind, mode, bound);

  const onSave = () => {
    const errs = validate();
    setLocalErrors(errs);
    if (Object.keys(errs).length) return;
    void onSubmit(values);
  };

  if (!open) return null;

  const title =
    mode === "create" ? "新建" : mode === "edit" ? `编辑${KIND_LABEL[kind]}` : "改 DDL";
  const saveLabel = mode === "create" ? "创建" : mode === "edit" ? "保存" : "确认";

  const boundHint = boundDdl ? (
    <div data-bound-hint className="text-[12px] text-fg-subtle mt-1.5">
      最晚 {fmtDdl(boundDdl)} —— 不能晚于{bound!.label}「{bound!.title}」的截止时间
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 z-[90]">
      {/* scrim (原型 .scrim: rgba(0,0,0,.6) / z 80) */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
        data-form-scrim
      />
      {/* .sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-form-sheet
        className="absolute left-0 right-0 bottom-0 mx-auto w-full max-w-[520px] max-h-[88dvh] flex flex-col bg-bg-elevated rounded-t-2xl shadow-dialog"
      >
        {/* .sheet-h */}
        <div className="flex items-center gap-3 px-5 pt-[18px] pb-3 border-b border-white/[0.06]">
          <h2 className="m-0 flex-1 text-base font-medium">{title}</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="w-9 h-9 rounded-full grid place-items-center text-fg-muted hover:bg-white/[0.07] hover:text-fg transition-colors duration-150"
          >
            <CloseIcon size={18} className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* .sheet-b */}
        <div className="px-5 py-[18px] overflow-y-auto flex-1 flex flex-col gap-4">
          {hasError && (
            <div className="flex items-start gap-1.5 text-[12.5px] text-danger bg-danger-soft rounded-xl px-3 py-2.5 leading-[1.4]">
              <AlertCircleIcon size={13} className="w-[13px] h-[13px] shrink-0 mt-[1px]" />
              <span>{Object.values(errors).join(";")}</span>
            </div>
          )}

          {mode === "delay" ? (
            <>
              <Field label="DDL" error={errors.ddl}>
                <div className="grid grid-cols-2 gap-3">
                  <DatePickerField
                    label="日期"
                    value={values.ddlDate}
                    onChange={(v) => set("ddlDate", v)}
                    maxDate={boundMaxDate}
                    emptyLabel="未设置"
                  />
                  <TimePickerField
                    label="时间"
                    value={values.ddlTime}
                    onChange={(v) => set("ddlTime", v)}
                  />
                </div>
                {boundHint}
              </Field>
            </>
          ) : (
            <>
              {/* 原型 renderSheet: 类型由入口决定, 表单里只读回显 (.typepick.one) */}
              <Field label={mode === "create" ? "类型(由入口决定)" : "类型"}>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    aria-pressed="true"
                    className="rounded-lg bg-[rgba(255,107,53,.15)] text-brand shadow-[inset_0_0_0_1px_rgba(255,107,53,.32)] px-0.5 py-2.5 text-xs flex flex-col items-center gap-[5px] transition-all duration-150"
                  >
                    {KIND_LABEL[kind]}
                  </button>
                </div>
              </Field>
              {kind === "schedule" ? (
                <>
                  <Field label="标题 *" error={errors.title}>
                    <input
                      className={inpCls}
                      value={values.title}
                      placeholder="例如:跟张老板对一下周报"
                      onChange={(e) => set("title", e.target.value)}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3 max-[641px]:grid-cols-1">
                    <Field label="开始日期 *" error={errors.date}>
                      <DatePickerField
                        label="开始日期"
                        value={values.date}
                        onChange={(v) => {
                          set("date", v);
                          // 结束日期默认跟随开始日期 —— 只在结束日期还空着 / 已经早于新开始日期时跟着动
                          if (!values.endDate || values.endDate < v) set("endDate", v);
                        }}
                        maxDate={boundMaxDate}
                        clearable={false}
                      />
                    </Field>
                    <Field label="结束日期 *" error={errors.endDate}>
                      <DatePickerField
                        label="结束日期"
                        value={values.endDate}
                        onChange={(v) => set("endDate", v)}
                        minDate={values.date || null}
                        maxDate={boundMaxDate}
                        clearable={false}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3 max-[641px]:grid-cols-1">
                    <Field label="开始时间 *" error={errors.start}>
                      <TimePickerField
                        label="开始时间"
                        value={values.start}
                        onChange={(v) => set("start", v)}
                      />
                    </Field>
                    <Field label="结束时间 *" error={errors.end}>
                      <TimePickerField
                        label="结束时间"
                        value={values.end}
                        onChange={(v) => set("end", v)}
                      />
                    </Field>
                  </div>
                  <Field label="责任人">
                    <CustomSelect
                      value={values.ownerType}
                      onChange={(v) => set("ownerType", v as OwnerType)}
                      options={[
                        { value: "user", label: myName },
                        { value: "cody", label: "Cody" },
                      ]}
                      ariaLabel="责任人"
                    />
                  </Field>
                  <Field label="备注">
                    <textarea
                      className={[inpCls, "!rounded-md min-h-[72px] leading-[1.5] resize-y"].join(" ")}
                      value={values.note}
                      placeholder="补充说明"
                      onChange={(e) => set("note", e.target.value)}
                    />
                  </Field>
                  <RemindBlock
                    values={values}
                    set={set}
                    channels={CHANNELS}
                    offsets={REMIND_OFFSETS}
                  />
                  <div className="text-[12px] text-fg-subtle">
                    开始日期 / 结束日期 / 开始时间 / 结束时间 全部必填 —— 日程必须占一个明确时段。
                    跨天日程: 结束日期可以晚于开始日期, 结束时间落在结束日期上。
                  </div>
                  {bound && (
                    <div className="text-[12px] text-fg-subtle">
                      这条日程挂在{bound.label}「{bound.title}」下面,日期和截止时间都不能超过它的截止时间。
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Field label="名称 *" error={errors.title}>
                    <input
                      className={inpCls}
                      value={values.title}
                      placeholder={
                        kind === "task"
                          ? "例如:日程中心 V1 上线"
                          : kind === "subtask"
                            ? "例如:发布与验收"
                            : "例如:联调"
                      }
                      onChange={(e) => set("title", e.target.value)}
                    />
                  </Field>
                  {kind === "task" && (
                    <Field label="说明">
                      <textarea
                        className={[inpCls, "!rounded-md min-h-[72px] leading-[1.5] resize-y"].join(" ")}
                        value={values.desc}
                        placeholder="这个任务要达成什么"
                        onChange={(e) => set("desc", e.target.value)}
                      />
                    </Field>
                  )}
                  <Field label="责任人">
                    <CustomSelect
                      value={values.ownerType}
                      onChange={(v) => set("ownerType", v as OwnerType)}
                      options={[
                        { value: "user", label: myName },
                        { value: "cody", label: "Cody" },
                      ]}
                      ariaLabel="责任人"
                    />
                  </Field>
                  {/* gaga P0-G / 决策 D3: 任务要有开始时间 —— 状态由后端按时间派生,
                      所以表单里**不选状态**, 只给时间。 */}
                  {kind === "task" && (
                    <>
                      <div className="grid grid-cols-2 gap-3 max-[641px]:grid-cols-1">
                        <Field label="开始日期 *" error={errors.date}>
                          <DatePickerField
                            label="开始日期"
                            value={values.date}
                            onChange={(v) => set("date", v)}
                            clearable={false}
                          />
                        </Field>
                        <Field label="开始时间 *" error={errors.start}>
                          <TimePickerField
                            label="开始时间"
                            value={values.start}
                            onChange={(v) => set("start", v)}
                          />
                        </Field>
                      </div>
                      <div className="text-[12px] text-fg-subtle">
                        任务状态按开始 / 截止时间自动判断 —— 不用手动选。
                        想改状态用卡片上的 ⋮ 菜单(标记进行中 / 标记完成)。
                      </div>
                    </>
                  )}
                  {/* 契约 v9.2: 子任务 / 关键节点加「开始日期 + 开始时间」——
                      **可空** (留空 = 不设开始时间), 不参与 DDL 继承 / 状态派生 / 逾期判定。 */}
                  {(kind === "subtask" || kind === "milestone") && (
                    <>
                      <div className="grid grid-cols-2 gap-3 max-[641px]:grid-cols-1">
                        <Field label="开始日期" error={errors.date}>
                          <DatePickerField
                            label="开始日期"
                            value={values.date}
                            onChange={(v) => set("date", v)}
                            emptyLabel="不设开始时间"
                          />
                        </Field>
                        <Field label="开始时间" error={errors.start}>
                          <TimePickerField
                            label="开始时间"
                            value={values.start}
                            onChange={(v) => set("start", v)}
                          />
                        </Field>
                      </div>
                      <div className="text-[12px] text-fg-subtle">
                        开始时间可以留空 —— 留空 = 不设开始时间。
                        子任务 / 关键节点的开始时间不参与截止时间继承和状态判断。
                      </div>
                    </>
                  )}
                  <Field label="截止时间" error={errors.ddl}>
                    <div className="grid grid-cols-2 gap-3 max-[641px]:grid-cols-1">
                      <DatePickerField
                        label="日期"
                        value={values.ddlDate}
                        onChange={(v) => set("ddlDate", v)}
                        maxDate={boundMaxDate}
                        // ⚠️ gaga 2026-10-21 生产实测: 任务(树根)**没有父级**,
                        //   截止时间就是它自己的真值 —— 不能显示「继承」,
                        //   留空 = 不设截止 (子任务 / 关键节点才继承父链)。
                        emptyLabel={ddlEmptyLabel(kind)}
                      />
                      <TimePickerField
                        label="时间"
                        value={values.ddlTime}
                        onChange={(v) => set("ddlTime", v)}
                      />
                    </div>
                    {boundHint}
                    {kind === "task" && (
                      <div className="text-[12px] text-fg-subtle mt-1.5">
                        任务没有上级,截止时间就是它自己的 —— 留空 = 不设截止。
                      </div>
                    )}
                  </Field>
                  {/* 状态手动选择: 只留给子任务 / 关键节点 —— 任务的状态由后端按时间派生
                      (决策 D3), 表单里不选; 想改用 ⋮ 菜单。 */}
                  {kind !== "task" && (
                    <Field label="状态">
                      <CustomSelect
                        value={values.status}
                        onChange={(v) => set("status", v as ItemStatus)}
                        options={STATUS_OPTIONS}
                        ariaLabel="状态"
                      />
                    </Field>
                  )}
                  {kind === "milestone" && (
                    <RemindBlock
                      values={values}
                      set={set}
                      channels={CHANNELS}
                      offsets={REMIND_OFFSETS}
                    />
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* .sheet-f */}
        <div className="flex gap-2.5 px-5 pt-3.5 pb-[22px] border-t border-white/[0.06] max-[641px]:pb-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-bg-elevated text-fg text-sm py-[9px] px-[18px] transition-colors duration-150 hover:bg-[#222]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={submitting}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-brand text-brand-on text-sm font-medium py-[9px] px-[18px] transition-[background,transform,opacity] duration-150 hover:bg-brand-hover active:scale-[0.96] disabled:opacity-50"
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 内部小组件
// ---------------------------------------------------------------------------

const inpCls =
  "w-full bg-white/[0.06] border border-transparent rounded-full px-3.5 py-[9px] text-sm text-fg outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-fg-subtle focus:border-brand focus:shadow-[0_0_0_1px_var(--brand)]";

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="block text-[13px] text-fg-muted mb-[7px]">{label}</label>
      {children}
      {error && (
        <div className="flex items-start gap-1.5 text-[12.5px] text-danger mt-[7px] leading-[1.45]">
          <AlertCircleIcon size={13} className="w-[13px] h-[13px] shrink-0 mt-[1px]" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

function RemindBlock({
  values,
  set,
  channels,
  offsets,
}: {
  values: FormValues;
  set: <K extends keyof FormValues>(k: K, v: FormValues[K]) => void;
  channels: { value: string; label: string }[];
  offsets: { value: number; label: string }[];
}) {
  return (
    <div className="border-t border-white/[0.06] pt-4">
      <div className="flex items-center justify-between mb-3">
        <label className="text-[13px] text-fg-muted">提醒</label>
        <button
          type="button"
          role="switch"
          aria-checked={values.remindOn}
          aria-label="提醒开关"
          onClick={() => set("remindOn", !values.remindOn)}
          className={[
            // 原型 .tog: 44×26 / radius full / bg --bg-sunken / border --border /
            //   ::after 20px 圆点; pressed → bg --brand + border --brand + 圆点右移
            "w-11 h-[26px] rounded-full relative shrink-0 border transition-colors duration-200",
            values.remindOn ? "bg-brand border-brand" : "bg-bg-sunken border-border",
          ].join(" ")}
        >
          <span
            className={[
              "absolute top-[2px] left-[2px] w-5 h-5 rounded-full transition-[transform,background] duration-200",
              values.remindOn ? "translate-x-[18px] bg-brand-on" : "bg-fg-subtle",
            ].join(" ")}
          />
        </button>
      </div>
      {values.remindOn && (
        <>
          <div className="mb-3">
            <label className="block text-[13px] text-fg-muted mb-[7px]">提前量</label>
            <div className="flex flex-wrap gap-0.5 w-fit rounded-full bg-card p-[3px]">
              {offsets.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={values.remindOffset === o.value}
                  onClick={() => set("remindOffset", o.value)}
                  className={[
                    "px-[8px] py-[2px] rounded-full text-xs transition-colors duration-150",
                    values.remindOffset === o.value
                      ? "bg-bg-elevated text-fg"
                      : "text-fg-muted hover:text-fg",
                  ].join(" ")}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[13px] text-fg-muted mb-[7px]">通知渠道</label>
            <div className="flex gap-2 flex-wrap">
              {channels.map((c) => {
                const on = values.remindChannels.includes(c.value);
                return (
                  <button
                    key={c.value}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set(
                        "remindChannels",
                        on
                          ? values.remindChannels.filter((x) => x !== c.value)
                          : [...values.remindChannels, c.value],
                      )
                    }
                    className={[
                      // 原型 .chipsel
                      "inline-flex items-center gap-[5px] text-[13px] rounded-full px-[13px] py-1.5",
                      "transition-all duration-150",
                      on
                        ? "bg-[rgba(255,107,53,.15)] text-brand shadow-[inset_0_0_0_1px_rgba(255,107,53,.32)]"
                        : "bg-white/[0.06] text-fg-muted hover:bg-white/[0.1]",
                    ].join(" ")}
                  >
                    {c.value === "in_app" && (
                      <CheckSquareIcon size={13} className="w-[13px] h-[13px]" />
                    )}
                    {c.value === "app_push" && <CalendarClockIcon size={13} className="w-[13px] h-[13px]" />}
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
