/**
 * components/schedule/ScheduleRow.tsx — 今日待办里的一条日程卡片 (叶子层)
 *
 * 抄自 web `gacode-web/src/components/schedule/ScheduleRow.tsx`, 只换 PC 写法:
 *   - `cn(...)`      → 数组 filter(Boolean).join(" ")
 *   - `lucide-react` → PC 图标唯一出处是 `components/ui/Glyphs.tsx`
 *     (`Check` → `CheckGlyph` / `Bell` → `BellIcon` / `Trash2` → `TrashIcon` /
 *      `CircleDot` → `CircleIcon` **近似替代**, 见下)
 *   - 去掉 `check-on-pop` 类 —— 那是 web `styles/globals.css` 里的勾选弹跳动画,
 *     PC 全局禁动效 (`animation: none !important`) ⇒ 带不带都不动, 留着是死类名。
 *
 * 视觉 1:1 对齐原型 scheduleRow() + .row/.check/.ttl CSS:
 *   行高 / 内边距 13px·14px / 圆角 --r-lg / 勾选圈 22px 2px 描边 /
 *   标题 15px·500·两行截断 / 元信息 12px 灰色一行 flex-wrap / 头像 24px 圆.
 *
 * 交互 (B3 范围):
 *   - 点勾选圈 = 完成 / 取消完成 (原型 B1.3 #2「点勾选圈 → 切换完成, 不离开当前视图」)
 *   - 点卡片本体 = **进详情页** —— ⚠️ PC 端的日程详情页是 B6 才有的路由,
 *     所以 B3 **不传** `onOpenDetail` ⇒ 退化成 web 的旧行为「整行点 = 切换完成」
 *     (见 web `ScheduleRow.tsx:66` 的 `openRow`)。B6 落地后把 onOpenDetail 接上即可。
 *   - ⋮ 菜单 = 标记进行中 · 标记完成 · 删除
 *     ⚠️ **不渲染**「编辑」/「改 DDL」(B6 的表单) 与「归档」(B7) ——
 *        这三项在 B3 没有可用端点/落点, 渲染出来就是死按钮。
 *        (归档更不能给: PC 端没有归档查看/恢复入口 (ArchivedSheet 是 B7),
 *          归档完就再也找不回来了。)
 */

import { OwnerAvatar } from "./OwnerAvatar";
import { RowActionMenu, type RowMenuItem } from "./RowActionMenu";
import { BellIcon, CheckGlyph, CircleIcon, TrashIcon } from "../ui/Glyphs";
import type { ScheduleItem } from "../../lib/schedule-api";

interface ScheduleRowProps {
  item: ScheduleItem;
  /** "今天 09:00–10:00" 这类时间文案 (含完整时段, 已按当天/非当天格式化) */
  when: string;
  overdue: boolean;
  /** "任务 · 子任务 · 关键节点" — 游离日程没有父链, 传空串 */
  context?: string;
  /** 继承来的截止日文案 ("继承自子任务 · 10月28日 18:00"); 自身有 ddl 时不显示 */
  inheritedDdl?: string;
  /** 有效状态 (ScheduleItem 没有 status 字段; 实际值由 effectiveStatus 提供,
   *  类型与契约 ItemStatus 保持一致) */
  status: "pending" | "in_progress" | "done";
  onToggleDone: (item: ScheduleItem) => void;
  /** 点行主体 → 进详情页 (原型 B1.3 #1)。不传 = 退化成「整行点 = 切换完成」(旧行为)。 */
  onOpenDetail?: (item: ScheduleItem) => void;
  onMarkProgress: (item: ScheduleItem) => void;
  onDelete: (item: ScheduleItem) => void;
}

export function ScheduleRow({
  item,
  when,
  overdue,
  context,
  inheritedDdl,
  status,
  onToggleDone,
  onOpenDetail,
  onMarkProgress,
  onDelete,
}: ScheduleRowProps) {
  const done = status === "done";
  /** 点行主体: 有详情页就进详情页, 没有就退回「切换完成」。 */
  const openRow = () => (onOpenDetail ? onOpenDetail(item) : onToggleDone(item));

  // 原型 B1.3 #5-#10: 日程行的 ⋮ 菜单 (B3 只保留三个可用项)
  const menuItems: RowMenuItem[] = [
    {
      key: "progress",
      label: "标记进行中",
      icon: <CircleIcon size={14} className="w-[14px] h-[14px]" />,
      onSelect: () => onMarkProgress(item),
    },
    {
      key: "done",
      label: done ? "取消完成" : "标记完成",
      icon: <CheckGlyph size={14} strokeWidth={2} className="w-[14px] h-[14px]" />,
      onSelect: () => onToggleDone(item),
    },
    {
      key: "delete",
      label: "删除",
      icon: <TrashIcon size={14} className="w-[14px] h-[14px]" />,
      danger: true,
      separatorBefore: true,
      onSelect: () => onDelete(item),
    },
  ];

  return (
    <div
      role="button"
      tabIndex={0}
      data-today-row
      aria-pressed={done}
      onClick={() => openRow()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openRow();
        }
      }}
      className={[
        // 原型 .row: bg --card / radius --r-lg (20px) / padding 13px 14px /
        //           position:relative / cursor:pointer / display:flex / align-items:flex-start
        //           hover → bg --card-hover (#1e1e1e)
        "relative flex items-start bg-card rounded-lg py-[13px] px-[14px]",
        "transition-colors duration-150 hover:bg-card-hover cursor-pointer",
      ].join(" ")}
    >
      {/* 勾选圈 (原型 .check: 22×22 / radius 50% / border 2px --fg-subtle / hover border --brand) */}
      <span
        onClick={(e) => {
          e.stopPropagation();
          onToggleDone(item);
        }}
        role="checkbox"
        aria-checked={done}
        data-today-check
        aria-label={done ? "取消完成" : "标记完成"}
        className={[
          "w-[22px] h-[22px] rounded-full shrink-0 grid place-items-center",
          "border-2 transition-all duration-200",
          done
            ? "bg-brand border-brand"
            : "border-fg-subtle hover:border-brand cursor-pointer",
        ].join(" ")}
      >
        <CheckGlyph
          size={13}
          strokeWidth={3}
          className={[
            "w-[13px] h-[13px] text-brand-on transition-opacity duration-150",
            done ? "opacity-100" : "opacity-0",
          ].join(" ")}
        />
      </span>

      <div className="flex-1 min-w-0 ml-[11px]">
        <div
          data-today-ttl
          // 原型 .row.finished .ttl: opacity .55 + line-through —— 只标标题, 不影响元信息
          className={[
            "text-[15px] leading-[22px] font-medium line-clamp-2 break-words",
            done && "opacity-55 line-through",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {item.title}
        </div>
        <div
          data-today-meta
          className="flex items-center gap-2 flex-wrap mt-1.5 text-xs leading-4"
        >
          <span className={overdue ? "text-danger" : ""}>{when}</span>

          {/* 提醒: 至少有一条 enabled 的提醒才显示铃铛 (对应原型 remind.on=true)
              ⚠️ 共享 Glyph 固定 aria-hidden ⇒ 无障碍名挂在外层 span 上 (role="img") */}
          {item.reminders && item.reminders.some((r) => r.enabled) && (
            <span role="img" aria-label="已设置提醒" className="inline-flex shrink-0">
              <BellIcon size={12} className="w-3 h-3 text-brand" />
            </span>
          )}

          {/* 继承来的截止日不留空白 (总 PM 要求) */}
          {inheritedDdl && <span className="text-fg-subtle">{inheritedDdl}</span>}

          {context && <span className="text-fg-subtle break-words">{context}</span>}

          <OwnerAvatar ownerType={item.ownerType} ownerName={item.ownerName} />
        </div>
      </div>

      <RowActionMenu items={menuItems} ariaLabel={`${item.title} 的更多操作`} className="ml-1 mt-px" />
    </div>
  );
}
