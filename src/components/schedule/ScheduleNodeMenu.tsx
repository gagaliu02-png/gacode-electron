/**
 * components/schedule/ScheduleNodeMenu.tsx — 任务树节点的 ⋮ 菜单
 *
 * 抄自 web `gacode-web/src/components/schedule/ScheduleNodeMenu.tsx`, 只换 PC 写法:
 *   - `lucide-react` → PC 图标唯一出处是 `components/ui/Glyphs.tsx`
 *     (`CircleDot` → `CircleDotIcon` **逐字同形** (2026-10-27 补画, 见 Glyphs.tsx) /
 *      `Check` → `CheckGlyph` / `Archive` → `ArchiveIcon` /
 *      `CalendarClock` → `CalendarClockIcon` **逐字同形** (B6 补画; B5 期间是
 *      `CalendarIcon` 近似替代) / `Pencil` → `PencilIcon` / `Trash2` → `TrashIcon`)
 *
 * 原型的 ⋮ 菜单项 (按 kind 分):
 *   任务 / 子任务   → 标记进行中 · 标记完成 · 归档 · 改 DDL · 编辑 · 删除
 *   关键节点 / 日程 → 标记进行中 · 标记完成 · 归档 · 改 DDL · 编辑 · 删除
 *   定时任务 (cron) → **只有** 暂停/启用 + 删除 (只读降级, 规格书 B1.3 #14)
 *
 * ⚠️ **菜单项按「回调在不在」渲染** (2026-10-27 PM 拍板, B5 返工):
 *   `onArchive` / `onChangeDdl` / `onEdit` 三个 prop **可选** ——
 *   传了 ⇒ 渲染这一项; 没传 ⇒ **根本没有这一项** (不是灰的、不是哑弹)。
 *   web 那边是固定 6 项, 但 PC 分批落地:
 *     - B5 (任务看板)  → 归档 = B7 / 改 DDL·编辑 = B6 ⇒ 调用方只传 onSetStatus + onDelete
 *                        ⇒ 菜单**恰好 3 项** (标记进行中 · 取消完成·标记完成 · 删除)
 *     - B6 / B7 补上回调 → 自然恢复 web 的 6 项
 *   ⇒ 一套组件两批通吃 (组件意识: 禁止重复实现 —— 不为「少两项」另写一份菜单)。
 *
 * ⚠️ 状态字段两态 (契约 §9.5):
 *   任务 / 子任务   → `status`       (手工真值, 无继承)
 *   关键节点 / 日程 → `statusOverride` (null = 继承上级)
 *   所以「取消完成」对任务/子任务是回落到 pending, 对关键节点/日程是置 null。
 *
 * ⚠️ 定位: 走 RowActionMenu —— position:fixed + 视口钳制, 永不出屏
 *    (原型验收第 6 条)。
 *
 * ⚠️ **B3 期间本组件没被渲染** (今日待办页的卡片行用的是 `ScheduleRow`,
 *    它只挂 B3 已接通的动作)。B5 任务看板页开始复用本组件。
 */

import { RowActionMenu, type RowMenuItem } from "./RowActionMenu";
import {
  ArchiveIcon,
  CalendarClockIcon,
  CheckGlyph,
  CircleDotIcon,
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
  /** 归档 (级联所有后代) —— **不传 = 不渲染「归档」这一项** */
  onArchive?: () => void;
  /** 改 DDL (只含 DDL 一个字段的弹窗) —— **不传 = 不渲染「改 DDL」这一项** */
  onChangeDdl?: () => void;
  /** 编辑 (按 kind 给字段) —— **不传 = 不渲染「编辑」这一项** */
  onEdit?: () => void;
  /** 删除 (级联硬删, 不可恢复) */
  onDelete: () => void;
}

/**
 * buildNodeMenuItems — 菜单项清单 (纯函数, 导出是为了能直接跑断言)。
 *
 * ⚠️ **菜单项按「回调在不在」渲染** (2026-10-27 PM 拍板, B5 返工):
 *   传了回调 ⇒ 渲染这一项; 没传 ⇒ **根本没有这一项** (不是灰的 / 不是哑弹)。
 *   web 的 `ScheduleNodeMenu` 是固定 6 项 (归档 / 改 DDL / 编辑 全都写死),
 *   但那三个入口在 PC 分批落地:
 *     - B5 (任务看板)  → 归档 = B7 / 改 DDL·编辑 = B6 ⇒ 只传 onSetStatus + onDelete
 *                        ⇒ 菜单**恰好 3 项** (标记进行中 · 取消完成·标记完成 · 删除)
 *     - B6 / B7 补上回调 → 自然恢复 web 的 6 项
 *   ⇒ 一套组件两批通吃, 不用为了「少两项」再写第二份菜单实现。
 */
export function buildNodeMenuItems(opts: {
  status: ItemStatus;
  onSetStatus: (status: ItemStatus) => void;
  onArchive?: () => void;
  onChangeDdl?: () => void;
  onEdit?: () => void;
  onDelete: () => void;
}): RowMenuItem[] {
  const isDone = opts.status === "done";

  const items: RowMenuItem[] = [
    {
      key: "progress",
      label: "标记进行中",
      icon: <CircleDotIcon size={14} className="w-[14px] h-[14px]" />,
      onSelect: () => opts.onSetStatus("in_progress"),
    },
    {
      key: "done",
      label: isDone ? "取消完成" : "标记完成",
      icon: <CheckGlyph size={14} strokeWidth={2} className="w-[14px] h-[14px]" />,
      onSelect: () => opts.onSetStatus(isDone ? "pending" : "done"),
    },
  ];

  // ⚠️ 这三项**按回调存在与否**追加 —— 没传回调 ⇒ 这一项根本不进菜单 (不是哑弹)。
  if (opts.onArchive) {
    items.push({
      key: "archive",
      label: "归档",
      icon: <ArchiveIcon size={14} className="w-[14px] h-[14px]" />,
      onSelect: opts.onArchive,
    });
  }
  if (opts.onChangeDdl) {
    items.push({
      key: "ddl",
      label: "改 DDL",
      // ⚠️ B6: `CalendarClock` → `CalendarClockIcon` (B6 新画, path 逐字取自 lucide)。
      //    B5 期间这里用的是 `CalendarIcon` **近似替代** (纯日历, 没有时钟指针) ——
      //    现在有逐字等价的图标了 ⇒ 换掉, 让「改 DDL」在今日待办 / 看板 / 详情页
      //    三处的图标**完全一致**。
      icon: <CalendarClockIcon size={14} className="w-[14px] h-[14px]" />,
      onSelect: opts.onChangeDdl,
    });
  }
  if (opts.onEdit) {
    items.push({
      key: "edit",
      label: "编辑",
      icon: <PencilIcon size={14} className="w-[14px] h-[14px]" />,
      onSelect: opts.onEdit,
    });
  }

  items.push({
    key: "delete",
    label: "删除",
    icon: <TrashIcon size={14} className="w-[14px] h-[14px]" />,
    danger: true,
    separatorBefore: true,
    onSelect: opts.onDelete,
  });

  return items;
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
  const items = buildNodeMenuItems({
    status,
    onSetStatus,
    onArchive,
    onChangeDdl,
    onEdit,
    onDelete,
  });

  void kind;

  return <RowActionMenu items={items} className={className} ariaLabel={ariaLabel} />;
}
