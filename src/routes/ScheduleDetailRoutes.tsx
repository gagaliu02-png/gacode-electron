/**
 * routes/ScheduleDetailRoutes.tsx — 日程中心 **5 条详情路由**的薄壳 · PC 端 B6.
 *
 * 抄自 web 的 5 个路由文件 (`gacode-web/src/app/(main)/schedule/{task,subtask,milestone,
 * schedule,cron}/[id]/page.tsx`, 各 ~15 行), **合并成一个文件 5 个导出**:
 *   - `next/navigation` 的 `useParams` → `react-router-dom` 的 `useParams`
 *   - web 的默认导出 → PC 的**具名导出** (PC 路由组件统一具名导出)
 *   - 去掉 web 的 `"use client"` (PC 没有 SSR / hydration)
 *
 * ⚠️ **5 条路由都写死, 不用 `/schedule/:kind/:id` 通配** ——
 *   通配会跟 `/schedule/calendar` / `/schedule/board` 歧义 (React Router v6 里
 *   静态段优先于动态段, 但 PC 的 `/schedule` 本身也是静态段 ⇒ 通配会把
 *   `/schedule/calendar` 之类吞掉)。
 *
 * 契约来源: gaclaw/docs/design/schedule-center-ux-2026-10-20.md §9.1 / §9.3b。
 */

import { useParams } from "react-router-dom";
import { ScheduleDetailPage } from "../components/schedule/detail/ScheduleDetailPage";

/** 路由参数里的 id —— 取不到就空串 (详情页会走「找不到」空态)。 */
function useIdParam(): string {
  const params = useParams();
  return (params.id as string) || "";
}

/** /schedule/task/<id> — 任务详情 (四 kind 共用组件的第一种)。 */
export function ScheduleTaskDetailRoute() {
  const id = useIdParam();
  return <ScheduleDetailPage kind="task" id={id} />;
}

/** /schedule/subtask/<id> — 子任务详情。 */
export function ScheduleSubtaskDetailRoute() {
  const id = useIdParam();
  return <ScheduleDetailPage kind="subtask" id={id} />;
}

/** /schedule/milestone/<id> — 关键节点详情。 */
export function ScheduleMilestoneDetailRoute() {
  const id = useIdParam();
  return <ScheduleDetailPage kind="milestone" id={id} />;
}

/** /schedule/schedule/<id> — 日程详情。 */
export function ScheduleScheduleDetailRoute() {
  const id = useIdParam();
  return <ScheduleDetailPage kind="schedule" id={id} />;
}

/** /schedule/cron/<id> — 定时任务详情 (**只读**: 无编辑按钮, 只有 暂停/启用 + 删除)。 */
export function ScheduleCronDetailRoute() {
  const id = useIdParam();
  return <ScheduleDetailPage kind="cron" id={id} />;
}
