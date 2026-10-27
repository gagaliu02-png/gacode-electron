/**
 * components/schedule/ScheduleNodeMenu.tsx — 任务树节点的 ⋮ 菜单
 *
 * 抄自 web `gacode-web/src/components/schedule/ScheduleNodeMenu.tsx`, 只换 PC 写法:
 *   - `lucide-react` → PC 图标唯一出处是 `components/ui/Glyphs.tsx`
 *     (`CircleDot` → `CircleIcon` **近似替代** /
 *      `Check` → `CheckGlyph` / `Archive` → `ArchiveIcon` /
 *      `CalendarClock` → `CalendarIcon` **近似替代** /
 *      `Pencil` → `PencilIcon` / `Trash2` → `TrashIcon`)
 *
 * 原型的 ⋮ 菜单项 (按 kind 分):
 *   任务 / 子任务   → 标记进行中 · 标记完成 · 归档 · 改 DDL · 编辑 · 删除
 *   关键节点 / 日程 → 标记进行中 · 标记完成 · 归档 · 改 DDL · 编辑 · 删除
 *   定时任务 (cron) → **只有** 暂停/启用 + 删除 (只读降级, 规格书 B1.3 #14)
 *
 * ⚠️ 状态字段两态 (契约 §9.5):
 *   任务 / 子任务   → `status`       (手工真值, 无继承)
 *   关键节点 / 日程 → `statusOverride` (null = 继承上级)
 *   所以「取消完成」对任务/子任务是回落到 pending, 对关键节点/日程是置 null。
 *
 * ⚠️ 定位: 走 RowActionMenu —— position:fixed + 视口钳制, 永不出屏
 *    (原型验收第 6 条)。
 *
 * ⚠️ **本组件在 B3 不被渲染** (今日待办页的卡片行用的是 `ScheduleRow`,
 *    它只挂 B3 已接通的动作)。本组件是给 B5 看板页 / B6 详情页复用的共享件,
 *    菜单项按 web 原样搬齐 —— 但 B5/B6 落地前, 「归档 / 改 DDL / 编辑」
 *    对应的 UI 还不能接 (归档入口是 B7, 表单是 B6) ⇒ 那三项目前只在本组件里存在,
 *    不会被点出来。
 */

import { RowActionMenu, type RowMenuItem } from "./RowActionMenu";
import {
  ArchiveIcon,
  CalendarIcon,
  CheckGlyph,
  CircleIcon,
  PencilIcon,
  TrashIcon,
} from "../ui/Glyphs";
import type { ItemStatus } from "../../lib/schedule-api";

export type ScheduleNodeKind = "task" | "subtask" | "milestone" | "schedule";

export interface ScheduleNodeMenuProps {
  kind: ScheduleNodeKind;
  /** 当前**有效**状态 (pending / in_progress / done)。 */
  status: ItemStatus;
  className?: string;
  ariaLabel?: string;
  /** 标记进行中 / 标记完成 / 取消完成 */
  onSetStatus: (status: ItemStatus) => void;
  /** 归档 (级联所有后代) */
  onArchive: () => void;
  /** 改 DDL (只含 DDL 一个字段的弹窗) */
  onChangeDdl: () => void;
  /** 编辑 (按 kind 给字段) */
  onEdit: () => void;
  /** 删除 (级联硬删, 不可恢复) */
  onDelete: () => void;
}

export function ScheduleNodeMenu({
  kind,
  status,
  className,
  ariaLabel = "更多操作",
  onSetStatus,
  onArchive,
  onChangeDdl,
  onEdit,
  onDelete,
}: ScheduleNodeMenuProps) {
  const isDone = status === "done";
  const isInProgress = status === "in_progress";

  const items: RowMenuItem[] = [
    {
      key: "progress",
      label: "标记进行中",
      icon: <CircleIcon size={14} className="w-[14px] h-[14px]" />,
      onSelect: () => onSetStatus("in_progress"),
    },
    {
      key: "done",
      label: isDone ? "取消完成" : "标记完成",
      icon: <CheckGlyph size={14} strokeWidth={2} className="w-[14px] h-[14px]" />,
      onSelect: () => onSetStatus(isDone ? "pending" : "done"),
    },
    {
      key: "archive",
      label: "归档",
      icon: <ArchiveIcon size={14} className="w-[14px] h-[14px]" />,
      onSelect: onArchive,
    },
    {
      key: "ddl",
      label: "改 DDL",
      icon: <CalendarIcon size={14} className="w-[14px] h-[14px]" />,
      onSelect: onChangeDdl,
    },
    {
      key: "edit",
      label: "编辑",
      icon: <PencilIcon size={14} className="w-[14px] h-[14px]" />,
      onSelect: onEdit,
    },
    {
      key: "delete",
      label: "删除",
      icon: <TrashIcon size={14} className="w-[14px] h-[14px]" />,
      danger: true,
      separatorBefore: true,
      onSelect: onDelete,
    },
  ];

  void kind;
  void isInProgress;

  return <RowActionMenu items={items} className={className} ariaLabel={ariaLabel} />;
}
