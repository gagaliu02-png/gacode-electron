/**
 * routes/ScheduleCalendar.tsx — 日程中心 · 日历页 (周视图 + 月视图) · PC 端 B4
 *
 * 抄自 web `gacode-web/src/app/(main)/schedule/calendar/page.tsx`, 只换 PC 写法:
 *   - `next/navigation` 的 `useRouter` → PC 本批**不跳路由** (见下), 只弹 toast 占位
 *   - `useToast` from `@/components/common/Toast` → `../components/ui/Toast`
 *     (PC toast API: `toast({ title?, message?, description?, variant? })`)
 *   - `useUIStore((s) => s.setHeaderTitle("日程中心"))` → PC 没有 store
 *     ⇒ **不设标题**, 顶栏走 `AppShell.tsx` 的 `resolveTitle()`
 *       (已用 `pathname.startsWith("/schedule")` 覆盖 `/schedule/calendar`)
 *   - web 的 `CreateFab` + `ScheduleFormSheet` → **整块不搬** (B6 的表单, 见下)
 *
 * 信息架构 (总 PM 定):
 *   /schedule           = 今日待办  (B3 已完成)
 *   /schedule/calendar  = 日程中心  ← 本页 (B4)
 *   /schedule/board     = 任务看板  (B5 未做)
 *
 * 数据: **CalendarView 内部 useQuery 拿数据, 本页不重复取** (照 web 口径)。
 *
 * ⚠️ **本批明确不做** (PM 拍板, 剩下的都是 B6 的活):
 *   - **FAB「新建日程」不渲染** + `ScheduleFormSheet` 不引入
 *     (web `calendar/page.tsx:98-109`) —— 表单是 B6。
 *     ⇒ 页面上没有任何「新建」入口, 不会留死按钮。
 *   - **详情页跳转不实现**: `onOpenDetail` 传一个 **toast 占位**
 *     (「详情页将在后续批次开放」), **不跳路由** ——
 *     跳过去会被 `App.tsx` 的 `path="*"` 兜回首页 ⇒ 静默跳走, 用户以为没生效。
 */

import { useMemo } from "react";
import { ScheduleTabs } from "../components/schedule/ScheduleTabs";
import { CalendarView } from "../components/schedule/CalendarView";
import { dateToYmd } from "../components/schedule/calendar-utils";
import { useToast } from "../components/ui/Toast";

export function ScheduleCalendar() {
  const { toast } = useToast();

  // 真后端时钟 —— 本机时间 (照 web `calendar/page.tsx:48` 的 `new Date()` 锚点)。
  const now = useMemo(() => new Date(), []);
  const todayYmd = useMemo(() => dateToYmd(now), [now]);

  /**
   * 点事件块 → 详情页 (B6 才落地)。
   *
   * 本批只弹 toast 占位, **不 navigate** —— PC 现在没有 `/schedule/schedule/:id`
   * 这类路由, 跳过去会被 `App.tsx` 的 `path="*"` 兜回首页 (静默跳走)。
   */
  const handleOpenDetail = (kind: "schedule" | "cron") => {
    toast({
      title: "详情页将在后续批次开放",
      description:
        kind === "schedule"
          ? "日程详情页还没上线 (B6), 先在日历上看结构。"
          : "定时任务详情页还没上线 (B6), 先在日历上看结构。",
      variant: "default",
    });
  };

  return (
    <div className="min-h-full">
      <ScheduleTabs active="calendar" />
      <CalendarView
        now={now}
        todayYmd={todayYmd}
        onOpenDetail={handleOpenDetail}
      />
    </div>
  );
}
