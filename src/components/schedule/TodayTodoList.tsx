/**
 * components/schedule/TodayTodoList.tsx — 今日待办主体 (hero + 定时任务分组 + 五个分组)
 *
 * 抄自 web `gacode-web/src/components/schedule/TodayTodoList.tsx`, 只换 PC 写法:
 *   - `cn(...)`      → 数组 filter(Boolean).join(" ")
 *   - `lucide-react` → PC 图标唯一出处是 `components/ui/Glyphs.tsx`
 *     (`Clock` → `ClockIcon` / `ChevronDown` → `ChevronDownIcon`)
 *
 * ⚠️ **B3 相对 web 的删减** (PM 拍板, 剩下的都是 B6 / B7 的活):
 *   - **已归档条 + 归档计数** → 不渲染 (B7 才有 ArchivedSheet / 归档入口;
 *     PC 现在没有归档查看·恢复入口, 渲染出来点进去是死路)
 *   - **归档 / 改 DDL / 编辑** → 不渲染 (B6 的表单 + B7 的归档)
 *   ⇒ 留下的每一项都有真端点可打, 没有死按钮。
 *
 * 布局 / 分组顺序 1:1 对齐原型 renderToday():
 *   hero (日期 + 计数 + 距日终) → 定时任务 (置顶, 独立实体) → 已逾期 → 上午 → 下午
 *   → 晚上 → 已完成 (末尾)          (v6: 取消「无时段」分组, 只剩 5 个)
 *
 * 分组可折叠 (PM 要求): 默认只把「已完成」折叠, 其余全展开;
 * 空分组不渲染标题 (原型 `if(!arr.length) return;`)。
 *
 * 数据口径全部来自 src/lib/schedule-api.ts 的投影与图算法, 本组件不重算任何业务规则。
 */

import { useState } from "react";
import { CronGroup } from "./CronGroup";
import { ScheduleRow } from "./ScheduleRow";
import {
  fmtDateTime,
  formatScheduleWhen,
  heroDateLabel,
  hoursLeftOfDay,
} from "./format";
import { ChevronDownIcon, ClockIcon } from "../ui/Glyphs";
import { describeDdl } from "../../lib/schedule-api";
import type {
  CronJob,
  ItemStatus,
  ScheduleItem,
  ScheduleNode,
  ScheduleTreeIndex,
  TodayScheduleBuckets,
} from "../../lib/schedule-api";

interface TodayTodoListProps {
  buckets: TodayScheduleBuckets;
  crons: CronJob[];
  tree: ScheduleTreeIndex;
  /** 时钟锚点, 用于「今天 / 距日终」文案 */
  now: Date;
  todayYmd: string;
  onToggleDone: (item: ScheduleItem) => void;
  /** 点行主体 → 进日程详情页 (B6 才落地; 不传 = 整行点 = 切换完成) */
  onOpenDetail?: (item: ScheduleItem) => void;
  onMarkProgress: (item: ScheduleItem) => void;
  onDeleteSchedule: (item: ScheduleItem) => void;
  onToggleCron: (job: CronJob) => void;
  onDeleteCron: (job: CronJob) => void;
}

/** 层级中文名 — 继承型截止日文案要用 ("继承自关键节点 · …"). */
function kindLabel(parent: ScheduleNode): string {
  if ("subtaskId" in parent) return "关键节点";
  if ("taskId" in parent) return "子任务";
  return "任务";
}

const SECTIONS: {
  key: keyof TodayScheduleBuckets;
  label: string;
  danger?: boolean;
  collapsedByDefault?: boolean;
}[] = [
  { key: "overdue", label: "已逾期", danger: true },
  { key: "morning", label: "上午" },
  { key: "afternoon", label: "下午" },
  { key: "evening", label: "晚上" },
  { key: "done", label: "已完成", collapsedByDefault: true },
];

export function TodayTodoList({
  buckets,
  crons,
  tree,
  now,
  todayYmd,
  onToggleDone,
  onOpenDetail,
  onMarkProgress,
  onDeleteSchedule,
  onToggleCron,
  onDeleteCron,
}: TodayTodoListProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      SECTIONS.filter((s) => s.collapsedByDefault).map((s) => [s.key, true]),
    ),
  );

  const total =
    buckets.overdue.length +
    buckets.morning.length +
    buckets.afternoon.length +
    buckets.evening.length;
  const overdueCount = buckets.overdue.length;
  const codyCount = Object.values(buckets)
    .flat()
    .filter((i) => i.ownerType === "cody").length;

  const rowProps = (item: ScheduleItem) => {
    const ddl = describeDdl(item, tree, kindLabel, fmtDateTime);
    return {
      item,
      when: formatScheduleWhen(item.date, item.startAt, item.endAt, todayYmd),
      overdue: tree.isOverdue(item, now),
      context: tree.chainTitles(item).join(" · "),
      inheritedDdl: ddl.inherited ? ddl.text : "",
      status: tree.effectiveStatus(item) as ItemStatus,
    };
  };

  return (
    <div className="px-4 lg:px-6 pb-28">
      {/* ---------------- hero ----------------
          原型 .hero: bg --card / radius --r-2xl (24px) / padding 16px 18px /
          margin 4px 0 8px / flex / align-items:flex-end / justify-content:space-between / gap 12px
          手机端 (≤640px): flex-direction column / align-items:flex-start / gap 6px / padding 14px */}
      <div
        data-today-hero
        className="flex items-end justify-between gap-3 flex-wrap bg-card rounded-2xl px-[18px] py-4 mt-1 mb-2 max-[640px]:flex-col max-[640px]:items-start max-[640px]:gap-1.5 max-[640px]:p-3.5"
      >
        <div className="min-w-0">
          {/* 原型 .hero .d: 19px / 500 / letter-spacing -.01em (行高走 normal, 不写死) */}
          <div data-today-hero-d className="text-[19px] font-medium tracking-[-0.01em]">
            {heroDateLabel(now)}
          </div>
          {/* 原型 .hero .s: 13px / --fg-muted / margin-top 2px */}
          <div data-today-hero-s className="text-[13px] text-fg-muted mt-0.5">
            {total} 项待办 ·{" "}
            <span className={overdueCount > 0 ? "text-danger" : ""}>
              {overdueCount} 项已逾期
            </span>{" "}
            · {codyCount} 项由 Cody 负责
          </div>
        </div>
        {/* 原型 .chip.warn: 11px/16px / radius full / padding 2px 8px / bg --warning-soft / 字 --warning */}
        <div
          data-today-hero-chip
          className="shrink-0 inline-flex items-center gap-1 rounded-full bg-warning-soft text-warning px-2 py-0.5 text-[11px] leading-4"
        >
          <ClockIcon size={12} strokeWidth={2} className="w-3 h-3" />
          距日终 {hoursLeftOfDay(now)} 小时
        </div>
      </div>

      {/* ---------------- 定时任务 (置顶独立分组) ---------------- */}
      {/* 它是独立实体, 不属于任务树 —— 混进上午/下午会让人误以为它是一条日程 */}
      {crons.length > 0 && (
        <section className="mt-5">
          <div
            data-today-sec-title
            className="flex items-center gap-2 mb-2 text-[12px] text-fg-subtle"
          >
            <span>定时任务</span>
            <span
              data-today-sec-cnt
              className="text-[11px] bg-bg-elevated text-fg-muted rounded-full px-[7px] py-px"
            >
              {crons.length}
            </span>
          </div>
          <CronGroup
            crons={crons}
            now={now}
            onToggle={onToggleCron}
            onDelete={onDeleteCron}
          />
        </section>
      )}

      {/* ---------------- 五个分组 (v6 取消无时段桶) ---------------- */}
      {SECTIONS.map(({ key, label, danger }) => {
        const items = buckets[key];
        if (items.length === 0) return null;
        const isCollapsed = !!collapsed[key];

        return (
          <section key={key} className="mt-5">
            <button
              type="button"
              data-today-sec-title
              aria-expanded={!isCollapsed}
              onClick={() =>
                setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
              }
              className={[
                // 原型 .sec-title: 12px / --fg-subtle / flex / items-center / gap 8px /
                //   margin 20px 0 8px (行高走 normal)
                "w-full flex items-center gap-2 mb-2 text-[12px]",
                danger ? "text-danger" : "text-fg-subtle",
              ].join(" ")}
            >
              <span>{label}</span>
              <span
                data-today-sec-cnt
                className={[
                  "text-[11px] rounded-full px-[7px] py-px",
                  danger ? "bg-danger-soft text-danger" : "bg-bg-elevated text-fg-muted",
                ].join(" ")}
              >
                {items.length}
              </span>
              <ChevronDownIcon
                size={14}
                className={[
                  "ml-auto w-3.5 h-3.5 transition-transform duration-150",
                  isCollapsed && "-rotate-90",
                ]
                  .filter(Boolean)
                  .join(" ")}
              />
            </button>

            {!isCollapsed && (
              /* ⚠️ **有意偏离原型** (gaga 2026-10-21 实测拍板):
                 原型 .row 的 rowGap = 0 (相邻行合并成一块连续卡片, 只有首行上角 /
                 末行下角是圆角) —— 上一轮按原型实现后, gaga 实测反馈
                 「这一坨的任务卡片中间没有空隙, 其它的任务卡片都有空隙」+
                 「新建零散的这种卡片 也是没有缝隙的」。
                 → 改回**有间隙**: gap-1 = 0.25rem = 4px (web 原本就是这个值)。
                 同组每张卡恢复独立圆角 + 4px 间隙, 与其它页的任务卡片一致。 */
              <div data-today-group-rows className="flex flex-col gap-1">
                {items.map((item) => (
                  <ScheduleRow
                    key={item.id}
                    {...rowProps(item)}
                    onToggleDone={onToggleDone}
                    onOpenDetail={onOpenDetail}
                    onMarkProgress={onMarkProgress}
                    onDelete={onDeleteSchedule}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {/* ---------------- 空态 ---------------- */}
      {total === 0 && buckets.done.length === 0 && (
        <div className="bg-card rounded-2xl px-5 py-[38px] text-center mt-5 text-fg-muted">
          <div className="mb-2">今天没有待办</div>
          <div className="text-xs text-fg-subtle">新建一条待办,或直接跟 Cody 说一句</div>
        </div>
      )}
    </div>
  );
}
