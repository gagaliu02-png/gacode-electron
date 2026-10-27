/**
 * src/components/schedule/archived.ts
 *
 * 已归档的**数据口径层** —— 四类 (任务 / 子任务 / 关键节点 / 日程) 一起处理。
 *
 * 契约来源: 契约 §9.1 (四个已归档列表端点) + §9.3 (四个恢复端点)。
 *   GET  /api/v1/schedules/{tasks|subtasks|milestones|schedules}/archived
 *   POST /api/v1/schedules/{tasks|subtasks|milestones|schedules}/:id/restore
 *
 * ⚠️ 本文件**不定义 DTO** —— DTO 全部集中在 src/lib/schedule-api.ts。
 *    这里只做三件事: 四类的枚举 / 四类一起拉的口径 / 恢复动作的分派。
 *
 * ⚠️ **计数口径 = 四类总数** (2026-10-21 PM 拍板):
 *    旧实现只统计 task 一类 (看板页 `listArchived("task")` / 今日待办页
 *    `allTasks.filter(t => t.archived).length`), 但归档 sheet 里列的是四类 ——
 *    计数只算一类 = 数字跟 sheet 内容对不上 (gaga 实测抱怨「莫名其妙」的同类问题)。
 *    → 现在 `archivedTotal()` 统一按四类总数算, 两个入口的徽标都走它。
 */

import {
  listArchived,
  restoreMilestone,
  restoreSchedule,
  restoreSubtask,
  restoreTask,
} from "../../lib/schedule-api";
import type { ArchivedKind, ScheduleNode } from "../../lib/schedule-api";

/** 四类已归档条目 —— 顺序 = 契约里的层级顺序 (任务 → 子任务 → 关键节点 → 日程)。 */
export const ARCHIVED_KINDS: readonly ArchivedKind[] = [
  "task",
  "subtask",
  "milestone",
  "schedule",
];

/** 四类的中文名 (原型 KIND_LABEL)。 */
export const ARCHIVED_KIND_LABEL: Record<ArchivedKind, string> = {
  task: "任务",
  subtask: "子任务",
  milestone: "关键节点",
  schedule: "日程",
};

/** 四类各自的已归档列表。 */
export type ArchivedByKind = Record<ArchivedKind, ScheduleNode[]>;

/**
 * loadArchivedByKind — 四类一起拉。
 *
 *   单类失败**不拖垮整页** (降级成空数组) —— 归档 sheet 是辅助功能,
 *   任何一个端点 404/500 都不该让整张 sheet 打不开。
 */
export async function loadArchivedByKind(): Promise<ArchivedByKind> {
  const entries = await Promise.all(
    ARCHIVED_KINDS.map(async (kind) => {
      const list = await listArchived(kind).catch(() => [] as ScheduleNode[]);
      return [kind, list] as const;
    }),
  );
  return Object.fromEntries(entries) as ArchivedByKind;
}

/** 四类总数 —— 「已归档 N」徽标的唯一口径。 */
export function archivedTotal(byKind: ArchivedByKind | null | undefined): number {
  if (!byKind) return 0;
  return ARCHIVED_KINDS.reduce((n, kind) => n + (byKind[kind]?.length ?? 0), 0);
}

/**
 * restoreArchived — 恢复一条已归档条目 (分派到对应的 restore 端点)。
 *
 *   级联恢复由**后端**做 (契约 §9.3: 恢复父级 = 一并恢复它的后代),
 *   端侧只要调对端点 + 刷新列表。
 */
export function restoreArchived(
  kind: ArchivedKind,
  id: string,
): Promise<ScheduleNode | null> {
  switch (kind) {
    case "task":
      return restoreTask(id);
    case "subtask":
      return restoreSubtask(id);
    case "milestone":
      return restoreMilestone(id);
    case "schedule":
      return restoreSchedule(id);
  }
}
