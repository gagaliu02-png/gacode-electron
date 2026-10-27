/**
 * routes/ScheduleCalendar.tsx — 日程中心 · 日历页 (周视图 + 月视图) · PC 端 B4 + B6
 *
 * 抄自 web `gacode-web/src/app/(main)/schedule/calendar/page.tsx`, 只换 PC 写法:
 *   - `next/navigation` 的 `useRouter` → `react-router-dom` 的 `useNavigate`
 *   - `useToast` from `@/components/common/Toast` → `../components/ui/Toast`
 *   - `useUIStore((s) => s.setHeaderTitle("日程中心"))` → PC 没有 store
 *     ⇒ **不设标题**, 顶栏走 `AppShell.tsx` 的 `resolveTitle()`
 *       (已用 `pathname.startsWith("/schedule")` 覆盖 `/schedule/calendar`)
 *   - web 的 `CreateFab` + `ScheduleFormSheet` → B6 起**整块搬过来**
 *
 * 信息架构 (总 PM 定):
 *   /schedule           = 今日待办  (B3 已完成)
 *   /schedule/calendar  = 日程中心  ← 本页 (B4)
 *   /schedule/board     = 任务看板  (B5 已完成)
 *   /schedule/<kind>/<id> = 详情页   (B6)
 *
 * 数据: **CalendarView 内部 useQuery 拿数据, 本页不重复取** (照 web 口径)。
 *
 * ⚠️ **B6 接上的入口** (PM 拍板):
 *   - FAB「新建日程」→ 打开**新建日程**表单 (kind=schedule / mode=create,
 *     defaultDate = 今天)
 *   - 点事件块 → 跳**真详情路由** `/schedule/<kind>/<id>`
 *     (schedule → 日程详情; cron → 定时任务只读页)
 *   ⚠️ **归档入口仍不渲染** (= B7)。
 */

import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ScheduleTabs } from "../components/schedule/ScheduleTabs";
import { CalendarView } from "../components/schedule/CalendarView";
import { dateToYmd } from "../components/schedule/calendar-utils";
import { CreateFab } from "../components/common/CreateFab";
import { useToast } from "../components/ui/Toast";
import {
  ScheduleFormSheet,
  type FormValues,
} from "../components/schedule/form/ScheduleFormSheet";
import { ddlIso, endDateOf, syncReminders } from "../components/schedule/form/scheduleFormBody";
import {
  createSchedule,
  describeScheduleError,
  scheduleLocalToIso,
} from "../lib/schedule-api";

export function ScheduleCalendar() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // 真后端时钟 —— 本机时间 (照 web `calendar/page.tsx:48` 的 `new Date()` 锚点)。
  const now = useMemo(() => new Date(), []);
  const todayYmd = useMemo(() => dateToYmd(now), [now]);

  /**
   * 点事件块 → 详情页 (B6 落真路由)。
   *
   * ⚠️ PC 是 `HashRouter` ⇒ **不带尾斜杠** (web 的 Next.js `trailingSlash: true` 才带)。
   */
  const handleOpenDetail = (kind: "schedule" | "cron", id: string) => {
    navigate(`/schedule/${kind}/${id}`);
  };

  // 新建日程 (原型 .fab: 当前页 = calendar → 新建日程, 日期默认今天)
  const [formOpen, setFormOpen] = useState(false);
  const createMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const created = await createSchedule({
        title: values.title.trim(),
        date: values.date,
        startAt: scheduleLocalToIso(values.date, values.start),
        endAt: scheduleLocalToIso(endDateOf(values), values.end),
        ownerType: values.ownerType,
        note: values.note.trim() || null,
        ddl: ddlIso(values),
        statusOverride: values.status === "pending" ? null : values.status,
      });
      if (values.remindOn) {
        await syncReminders("schedule", created.id, values, []);
      }
      return created;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["schedule"] });
      setFormOpen(false);
      toast({
        title: "已创建日程",
        description: "看板 / 日程中心 / 今日待办已同步",
        variant: "success",
      });
    },
    onError: (err) => {
      toast({ title: "创建失败", description: describeScheduleError(err), variant: "danger" });
    },
  });

  return (
    <div className="min-h-full">
      <ScheduleTabs active="calendar" />
      <CalendarView
        now={now}
        todayYmd={todayYmd}
        onOpenDetail={handleOpenDetail}
      />

      <ScheduleFormSheet
        open={formOpen}
        mode="create"
        kind="schedule"
        defaultDate={todayYmd}
        submitting={createMutation.isPending}
        onClose={() => setFormOpen(false)}
        onSubmit={(values) => createMutation.mutate(values)}
      />

      {/* 原型 .fab: 当前页 = 日程中心 → 新建日程 */}
      <CreateFab label="新建日程" onClick={() => setFormOpen(true)} />
    </div>
  );
}
