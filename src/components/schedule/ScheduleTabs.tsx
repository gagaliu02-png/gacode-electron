/**
 * components/schedule/ScheduleTabs.tsx — 日程中心顶部 tab 条 (三个页面共享)
 *
 * 抄自 web `gacode-web/src/components/schedule/ScheduleTabs.tsx`, 只换 PC 写法:
 *   - `cn(...)`        → 数组 filter(Boolean).join(" ")
 *   - `lucide-react`   → PC 图标唯一出处是 `components/ui/Glyphs.tsx`
 *     (`ListTodo` → `ListTodoIcon` / `CalendarRange` → `CalendarRangeIcon` /
 *      `KanbanSquare` → `KanbanSquareIcon`)
 *   - `next/navigation` 的 `useRouter` → `react-router-dom` 的 `useNavigate`
 *
 * ⚠️ **三个 label 一字不能改** (UX 契约 `schedule-center-ux-2026-10-20.md` §2):
 *   今日待办 / 日程中心 / 任务看板
 *   (⚠️ 第二个 tab 也叫「日程中心」, 跟侧栏入口同名 —— 这是 web 现状, 不改。)
 *
 * ⚠️ **B3 只做今日待办 · B4 已落地日历页** (PM 拍板):
 *   B3 时「日程中心」/「任务看板」两个 tab **渲染出来但 disabled**, 点击弹 toast 占位提示
 *   —— **不跳到不存在的路由** (跳过去会命中 `path="*"` 被兜回首页 ⇒ 静默跳走)。
 *   **B4 (日历页) 已落地** ⇒ 「日程中心」tab 的 `path` 从 `null` 换成真路由
 *   `/schedule/calendar`, 点击直接进日历页 (见 `routes/ScheduleCalendar.tsx`)。
 *   「任务看板」**保持 `path: null`** —— B5 才解禁, 现在点它仍然只弹占位提示。
 *
 * 吸顶三件套 (gaga 2026-10-21 反馈: 「tab 栏没有吸顶, 内容从下面穿过去」):
 *   1. top-0 —— 滚动容器是 AppShell 的 `<main>` (overflow-y-auto), 全局 header 在 main
 *      **外面**, 所以 tab 栏相对 main 的顶边吸顶就是 top-0。
 *   2. bg-bg-base **不透明** —— `bg-bg-base/92` 不是合法 Tailwind class (92 不在
 *      默认 opacity 刻度里) ⇒ 编译后没有这条规则, 内容会直接透出来。
 *   3. z-20 + 底部分隔线 —— z-20 高于内容层 (auto), 低于弹层 (⋮ 菜单 z-120 /
 *      确认弹窗 z-130 / toast z-9999)。
 */

import { useNavigate } from "react-router-dom";
import { useToast } from "../ui/Toast";
import {
  CalendarRangeIcon,
  KanbanSquareIcon,
  ListTodoIcon,
} from "../ui/Glyphs";

export type ScheduleTabKey = "today" | "calendar" | "board";

interface ScheduleTabsProps {
  /** 当前激活页 */
  active: ScheduleTabKey;
  className?: string;
}

const TABS: {
  key: ScheduleTabKey;
  label: string;
  icon: typeof ListTodoIcon;
  /** 真路由 (B3 today + B4 calendar 有); null = 尚未落地, 点击只弹占位提示 */
  path: string | null;
}[] = [
  { key: "today", label: "今日待办", icon: ListTodoIcon, path: "/schedule" },
  { key: "calendar", label: "日程中心", icon: CalendarRangeIcon, path: "/schedule/calendar" },
  { key: "board", label: "任务看板", icon: KanbanSquareIcon, path: null },
];

export function ScheduleTabs({ active, className }: ScheduleTabsProps) {
  const navigate = useNavigate();
  const { toast } = useToast();

  return (
    <div
      role="tablist"
      className={[
        "flex gap-0.5 px-4 lg:px-6 pt-2 pb-3 sticky top-0 z-20",
        "bg-bg-base backdrop-blur-[20px] border-b border-white/[0.06]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {TABS.map(({ key, label, icon: Icon, path }) => {
        const selected = key === active;
        const disabled = path === null;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-disabled={disabled}
            data-schedule-tab={key}
            onClick={() => {
              if (disabled) {
                // 占位提示 —— 不跳路由 (路由还没落地, 跳过去会被兜回首页)
                toast({
                  title: `「${label}」尚未开放`,
                  description: "该页面将在后续批次上线。",
                  variant: "default",
                });
                return;
              }
              navigate(path);
            }}
            className={[
              "flex-1 min-w-0 flex items-center justify-center gap-1.5 whitespace-nowrap",
              "rounded-sm px-3 py-2 text-sm font-medium transition-colors duration-150",
              selected ? "bg-bg-elevated text-fg" : "text-fg-muted hover:text-fg",
              disabled ? "opacity-50 cursor-not-allowed" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <Icon size={16} className="w-4 h-4 shrink-0" />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
