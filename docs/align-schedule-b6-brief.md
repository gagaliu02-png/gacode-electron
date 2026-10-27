# 日程中心 B6 — 详情页 + 新建/编辑/改 DDL 表单（PC 端）

> 本文件是 **B6 的唯一施工依据**。PC 端照 web `gacode-web` 的日程中心**逐 page 追平**，
> 目标是「功能 + 视觉 1:1 还原 web」。B6 落地后，PC 才有**详情页**与**新建/编辑/改 DDL 表单**。
>
> 配套交底（**必读，别重复调研**）：
> - `docs/align-schedule-form-matrix.md` — 表单 12 组合矩阵 / 入口参数表 / bound 三处差异 /
>   校验 13 条 / 十个最容易漏的点 / 写入体矩阵 / PC 侧移植注意 9 处 / B6 验收判据
> - `docs/align-schedule-contracts.md` — 服务端 40 端点 + 契约条款
>
> web 源码位置（**只读**）：`D:\gaga\gaclaw-project\gacode-web\`
> PC 仓（**只改这一个**）：`D:\gaga\gaclaw-project\gacode-electron\`

---

## 0. 授权 / 范围

gaga 原话：「把日程中心的功能和 web 端同步了哈」+「日程中心是一个很复杂的板块，所以你要**看仔细一点**，特别是**新建日程的板块 很容易漏掉**」。

⇒ **B6 = 详情页 + 表单（新建 / 编辑 / 改 DDL）+ 三处回接入口 + 通知落点改真路由。**

**这批不做**：归档动作 + 归档区（B7）· 恢复归档（B7）· PC 侧自创增强（一律不做）。

---

## 1. 已经到位的底座（**不要重做，不要另建一套**）

| 已到位 | 位置 | 说明 |
|---|---|---|
| `validateForm` / `ddlEmptyLabel` / `endDateOf` / `ymdOf` / `fmtDdl` / `toMin` / `FormBound` / `FormValues` / `FormKind` / `FormMode` | `PC: src/components/schedule/form/scheduleFormRules.ts` | 与 web **逐字等价**，直接 import |
| `initialValues` | `PC: src/components/schedule/form/scheduleFormInit.ts` | 直接 import |
| `scheduleBody` / `taskBody` / `milestoneBody` / `syncReminders` / `ddlIso` / `startAtIso` / `remindAtIso` | `PC: src/components/schedule/form/scheduleFormBody.ts` | 直接 import |
| `nextCreateKind` / `nextCreateLabel` / `KIND_LABEL` / `DetailKind` | `PC: src/components/schedule/detail/detailModel.ts` | 直接 import |
| `getTaskById` / `getSubtaskById` / `getMilestoneById` / `getScheduleById` / `getCronJobById` | `PC: src/lib/schedule-api.ts` | 详情页取数直接用 |
| `createTask` / `createSubtask` / `createMilestone` / `createSchedule` / `updateTask` / `updateSubtask` / `updateMilestone` / `updateSchedule` | 同上 | 表单写入直接用 |
| `archiveTask` / `archiveSubtask` / `archiveMilestone` / `archiveSchedule` | 同上 | **这批不调**（B7） |
| `addTaskReminder` / `addScheduleReminder` / `update*Reminder` / `delete*Reminder` | 同上 | 提醒同步走 `syncReminders` |
| `setNodeStatus` / `deleteTask` / `deleteSubtask` / `deleteMilestone` / `deleteSchedule` / `deleteCronJob` / `toggleCronJobState` | 同上 | 已有 |
| `scheduleLocalToIso` / `statusWriteBody` / `buildFlatIndex` / `buildScheduleTreeIndex` / `describeDdl` / `describeScheduleError` | 同上 | 已有 |
| `findBoardNode`（返回 `{ node, kind, parent, parentKind, parentEffectiveDdl }`） | `PC: src/routes/ScheduleBoard.tsx`（**已 export**） | 看板页 bound 的来源；B6 看板页回接表单时**直接 import 它** |
| `ScheduleNodeMenu`（3 个表单回调**已改可选** + 按需渲染） | `PC: src/components/schedule/ScheduleNodeMenu.tsx` | B5 返工成果；B6 传 `onEdit` + `onChangeDdl` 即可自然多出菜单项 |
| `ScheduleConfirmDialog` | `PC: src/components/schedule/ScheduleConfirmDialog.tsx` | 删除二次确认用它 |
| `CreateFab` | `PC: src/components/common/CreateFab.tsx` | FAB 用它 |
| `useToast()` | `PC: src/components/ui/Toast.tsx` | **API 与 web 同款**：`toast({ title?, description?, variant? })` |
| `getProfile()` / `ProfileData` | `PC: src/lib/api.ts:1305-1318` | 有 `displayName?` + `username` ⇒ 责任人下拉可用 |
| react-query v5 / react-router-dom v6 | `PC: package.json` | `useQuery` / `useMutation` / `useQueryClient` / `useNavigate` / `useParams` |
| 顶栏标题 | `PC: src/components/layout/AppShell.tsx` 的 `resolveTitle()` | **`pathname.startsWith("/schedule")` ⇒ 「日程中心」** ⇒ 详情页标题**不用自己设** |

---

## 2. 文件面（**21 个，一个不多一个不少**）

### 2.1 新建 11 个

| # | PC 路径 | 来源（web，只读） | web 真实行数 |
|---|---|---|---|
| 1 | `src/components/schedule/form/PopPanel.tsx` | `web/src/components/schedule/form/PopPanel.tsx` | 52 |
| 2 | `src/components/schedule/form/usePopPosition.ts` | `web/.../form/usePopPosition.ts`（**是 hook，不是 tsx**） | 105 |
| 3 | `src/components/schedule/form/CustomSelect.tsx` | `web/.../form/CustomSelect.tsx` | 175 |
| 4 | `src/components/schedule/form/DatePickerField.tsx` | `web/.../form/DatePickerField.tsx` | 242 |
| 5 | `src/components/schedule/form/TimePickerField.tsx` | `web/.../form/TimePickerField.tsx` | 184 |
| 6 | `src/components/schedule/form/ScheduleDdlOverrunDialog.tsx` | `web/.../form/ScheduleDdlOverrunDialog.tsx` | 110 |
| 7 | `src/components/schedule/form/ScheduleFormSheet.tsx` | `web/.../form/ScheduleFormSheet.tsx` | 636 |
| 8 | `src/components/schedule/detail/ScheduleDetailPage.tsx` | `web/src/components/schedule/detail/ScheduleDetailPage.tsx` | **724**（容器：数据 + mutation + 路由 + 表单编排，**最重的一个**） |
| 9 | `src/components/schedule/detail/ScheduleDetailView.tsx` | `web/.../detail/ScheduleDetailView.tsx` | 341（纯展示） |
| 10 | `src/components/schedule/detail/CronDetailView.tsx` | `web/.../detail/CronDetailView.tsx` | 181（cron 只读降级） |
| 11 | `src/routes/ScheduleDetailRoutes.tsx` | web 的 5 个薄壳（各 15 行）合并成**一个文件 5 个导出** | ≈ 90 |

> web 这 10 个源文件合计 **≈ 2,750 行** —— 这是本批的主体工作量，别当成「小文件」草草带过。
> 行数是 PM 实测（`Get-Content -Encoding UTF8 | Measure-Object -Line`），不是估算。

### 2.2 修改 10 个

| # | PC 路径 | 改什么 |
|---|---|---|
| 12 | `src/components/ui/Glyphs.tsx` | **只追加 3 个**：`CalendarClockIcon` / `CheckSquareIcon` / `CalendarDaysIcon`（见 §3.2） |
| 13 | `src/App.tsx` | 注册 **5 条显式路由**（见 §3.6） |
| 14 | `src/routes/ScheduleToday.tsx` | 接**新建日程 FAB** + 行菜单的**编辑/改 DDL** + 卡片整行跳详情 |
| 15 | `src/routes/ScheduleCalendar.tsx` | 接**新建日程 FAB**（默认日期 = 今天）+ 详情跳转**改真路由**（现在是 toast 占位） |
| 16 | `src/routes/ScheduleBoard.tsx` | 接**新建任务 FAB** + 卡片菜单的**编辑/改 DDL** + 详情跳转**改真路由**（现在是 toast 占位） |
| 17 | `src/components/schedule/TodayTodoList.tsx` | 加 `onEdit` / `onChangeDdl` 两个 prop 并透传给 `ScheduleRow` |
| 18 | `src/components/schedule/ScheduleRow.tsx` | 加 `onEdit` / `onChangeDdl` 两个 prop，菜单里**各加一项**（归档**不加**，B7） |
| 19 | `src/components/schedule/ScheduleTaskCard.tsx` | 四层 `ScheduleNodeMenu` **传 `onEdit` + `onChangeDdl`**（归档**不传**，B7） |
| 20 | `src/components/schedule/BoardView.tsx` | 透传新增的编辑/改 DDL 回调 |
| 21 | `src/lib/notifications.ts` | `NotificationTarget` 加 `kind:"schedule"` 分支 + `scheduleTarget` 改**真路由**（见 §3.7） |

> ⚠️ 另外 `src/lib/notifications-sse.ts` 的 `notificationClickTarget()`（`:202-207`）只认
> `chat` / `url` ⇒ **桌面通知点击的日程落点也要加一行**。**它不在上表**，因为它属于
> 「通知落点改真路由」的必要连带改动 —— 一并改，改动只有一行。

---

## 3. web → PC 改写清单

### 3.1 通用替换表

| web 写法 | PC 侧怎么写 |
|---|---|
| `cn(...)` | **PC 全仓无 cn / clsx / tailwind-merge / cva** ⇒ `["a", cond && "b"].filter(Boolean).join(" ")` |
| `from "@/lib/xxx"` | `from "../../lib/xxx"`（`src/components/schedule/form/` 与 `.../detail/` 都是**三级** ⇒ `../../../lib/xxx`；`src/routes/` 是**两级** ⇒ `../lib/xxx`） |
| `from "@/components/xxx"` | `from "../xxx"`（同目录层级按上图算） |
| `next/navigation` 的 `useRouter` / `useParams` | `react-router-dom` 的 `useNavigate` / `useParams` |
| `router.push("/schedule/${k}/${id}/")` | `navigate(\`/schedule/${k}/${id}\`)` —— PC 是 `HashRouter`，**不要加尾斜杠** |
| `useUIStore((s) => s.setHeaderTitle(...))` | **PC 没有 store** ⇒ 顶栏标题走 `AppShell.resolveTitle()`，**不用管** |
| `lucide-react` 的图标 | 图标**唯一出处** `src/components/ui/Glyphs.tsx` ⇒ **禁止内联 `<svg>`** |
| `transition-*` / `duration-*` / `animate-*` / `active:scale-[0.96]` | PC `globals.css:397-414` 全局 `!important` 禁掉 ⇒ 这些类名在 PC 上**一帧都不动**。**抄了无害，但别为"还原动效"去动 globals.css** |
| Tailwind v4 CSS-first `@theme` | PC 是 **Tailwind 3.4.19**，但 web 表单用到的 token **PC 侧全部已存在** ⇒ **类名 1:1 抄**，无需映射（清单见交底 §7 第 6 条） |
| 冲突类名（同名两处） | 用 `!` **前缀**（`!rounded-t-2xl`），**不要 `!important`** |

### 3.2 图标对照（**3 个要新画**，path 逐字取自 lucide）

新 Glyph 的 path **必须逐字**取自
`D:\gaga\gaclaw-project\gacode-web\node_modules\lucide-react@0.407.0\dist\esm\icons\<name>.js`
（`<name>` = `calendar-clock` / `check-square` / `calendar-days`）。
写法照 PC 既有 Glyph 的写法（`<svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24"
fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
className={className}>` + 子元素），默认 `size = 20` / `strokeWidth = 2`。

| web 图标 | PC 用什么 | 备注 |
|---|---|---|
| `AlertCircle` | `AlertCircleIcon`（已有） | — |
| `AlertTriangle` | `AlertTriangleIcon`（已有） | DDL 越界弹窗用 |
| `X` | `CloseIcon`（已有） | — |
| `ChevronDown` | `ChevronDownIcon`（已有） | CustomSelect 用 |
| `ChevronLeft` | `ChevronLeftIcon`（B4 已加） | — |
| `ChevronRight` | `ChevronRightIcon`（已有） | — |
| `Pencil` | `PencilIcon`（已有） | — |
| `Play` / `Pause` | `PlayIcon` / `PauseIcon`（B3 已加） | cron 用 |
| `Trash2` | `TrashIcon`（已有） | — |
| `Clock` | `ClockIcon`（已有） ⚠️ **默认 strokeWidth=1.6，lucide 是 2** | **调用点必须显式传 `strokeWidth={2}`**（B4 已踩过这个坑） |
| `CalendarClock` | **`CalendarClockIcon`（本批新画）** | 改 DDL 用 |
| `CheckSquare` | **`CheckSquareIcon`（本批新画）** | 提醒渠道 in_app 用 |
| `CalendarDays` | **`CalendarDaysIcon`（本批新画）** | DatePickerField 用 |

> 铁律：**同名不同形 → 分开导出**。`CircleIcon`（只有 r10）与 `CircleDotIcon`（r10 + r1）
> 已经是两个独立导出，照此办理。

### 3.3 表单 sheet 的形态 —— ⚠️ **不要用 PC 的 `BottomSheet`**

web 的 `ScheduleFormSheet` 是**自绘**的（自己写 div，**不走** web 的 `components/ui/sheet.tsx`）。
PC 的 `BottomSheet`（`src/components/ui/BottomSheet.tsx`）形态**不同**：
- PC BottomSheet = **全宽** + `rounded-t-2xl` + `max-h-[85vh]` + `p-6` + 内置标题栏
- web 表单 sheet = **max-width 520px 居中** + `max-height 88dvh` + `radius 24px 24px 0 0`
  + **三段**（`.sheet-h` 头部 / `.sheet-b` 滚动体 / `.sheet-f` 底部按钮）+ `shadow-dialog`

⇒ **照抄 web 的 div 结构与类名**，不要拿 `BottomSheet` 包一层。
web 的遮罩是 `bg-black/60`（**不是** web 通用 sheet 的 `bg-bg-base/80 backdrop-blur-sm`）⇒ 直接抄 `bg-black/60`。

### 3.4 `bound` 的三处写法**不一样** —— 别统一抄成一种

见交底 `docs/align-schedule-form-matrix.md` **§3.3**（原文照抄，别自己归纳）。要点：
- 详情页 `openEdit` 的 bound = `tree?.effectiveDdl(parent) ?? null`（**无回退**）
- 详情页 `openCreateNext` 的 bound = `tree?.effectiveDdl(node) ?? node.ddl ?? null`（**有回退**）
- 看板页的 bound 走 `findBoardNode`（PC 已 export，见 §1）

### 3.5 「归档」动作这批**不做**

- `ScheduleNodeMenu` 的 `onArchive` / `ScheduleRow` 的 `onArchive` **一律不传**
- ⇒ 菜单项变成 **5 项**（标记进行中 · 标记完成 · 改 DDL · 编辑 · 删除）—— 归档那一项
  **根本不存在**，不是灰的、不是哑弹
- B7 落地时把 `onArchive` 传上，`ScheduleNodeMenu` 现有实现会**自动**多出「归档」一项
  （`buildNodeMenuItems` 是按回调存在与否渲染的）

### 3.6 5 条详情路由（**显式，不用 `:kind` 通配**）

PC 路由表（`src/App.tsx`，`HashRouter`）新增 **5 条**：

```
/schedule/task/:id
/schedule/subtask/:id
/schedule/milestone/:id
/schedule/schedule/:id
/schedule/cron/:id
```

- **不用** `/schedule/:kind/:id` 通配 —— 会跟 `/schedule/calendar`、`/schedule/board` 歧义
- 5 条路由的元素 = `src/routes/ScheduleDetailRoutes.tsx` 里 5 个导出组件，
  每个用 `useParams()` 取 `id`，渲染 `<ScheduleDetailPage kind="..." id={id} />`
  （kind 分别是 `task` / `subtask` / `milestone` / `schedule` / `cron`）
- 5 个路由都要包 `<Protected>`（照 `App.tsx` 里 `/schedule/board` 的写法）
- `AppShell.resolveTitle()` 已覆盖 `/schedule` 前缀 ⇒ 详情页标题自动是「日程中心」

### 3.7 通知落点改真路由

`src/lib/notifications.ts`：
1. `NotificationTarget` 联合类型**加回** `kind: "schedule"` 分支：
   `{ kind: "schedule"; scheduleId: string; reminderId: string | null; fireAt: string | null; href: string }`
2. `scheduleTarget()` 改成返回真路由（照 web）：
   `href: \`/schedule/schedule/${encodeURIComponent(id)}${qs ? \`?\${qs}\` : ""}\``
3. `src/routes/Notifications.tsx` **不用改** —— 它的 `:212-213` 已经是
   `if (!target.href) return; navigate(target.href);` ⇒ `kind:"schedule"` 落到这一行自动跳
4. `src/lib/notifications-sse.ts` 的 `notificationClickTarget()`（`:202-207`）**要加一行**
   —— 桌面通知点击目前只认 chat / url，日程落点会变 `null`（点桌面通知跳不过去）
5. `src/components/notifications/NotificationItem.tsx` **不用改** —— 它已经渲染
   `data-notif-target={target.href ?? ""}`
6. 文件头那段「① scheduleTarget —— PC 没有日程模块」的注释**要一起更新**（它已经过时了）

---

## 4. 硬约束（违反即返工）

1. **零内联 `<svg>`** —— 图标只能来自 `Glyphs.tsx`
2. **零** `cn` / `clsx` / `tailwind-merge` / `lucide-react` / `class-variance-authority` / `@/lib/utils`
3. **零** `next/navigation` / `zustand` / `useUIStore`
4. **组件意识**：能复用就复用，**不要另建一套**（`ScheduleNodeMenu` / `ScheduleConfirmDialog` /
   `CreateFab` / `RowActionMenu` / `ScheduleRow` / `ScheduleTaskCard` 都是现成的）
5. **禁 CSS 动效** —— 不要为了还原 web 的 `animate-*` / `transition-*` 去动 `globals.css`
6. **不要动**这些文件：`src/lib/markdown/**`（3 个 TS · PC 是原件端）·
   `src/lib/markdown.tsx` · `src/lib/api.ts` · `src/lib/schedule-api.ts` ·
   `src/lib/schedule-http.ts` · `src/styles/globals.css` · `tailwind.config.ts` ·
   `package.json` · `pnpm-lock.yaml` · `src/components/layout/AppShell.tsx` ·
   `src/components/ui/BottomSheet.tsx` · `src/components/ui/Toast.tsx`
7. **不要 git 操作** —— 不 `git add` / `git commit` / `git push`（PM 统一提交）
8. **不要跑 `pnpm build` / `pnpm build:win`** —— 同仓并行 build 会互删 `dist/`
   ⇒ 只跑 `pnpm typecheck`（PM 统一跑 build）
9. **断言脚本要显式点名逐个跑** —— PC 无 shell 通配，`node scripts/verify-*.mjs` 会
   `MODULE_NOT_FOUND`。**不要新增依赖**（PC 仓没有 jsdom / react-test-renderer / @testing-library，
   装不了，`package.json` 是冻结件）⇒ 断言写**纯 node 脚本**（像
   `scripts/verify-schedule-endpoint-set.mjs` 那样），产物写到**系统临时目录**，**不进仓**
10. `pnpm-lock.yaml` 若被 pnpm 改过 ⇒ `git checkout -- pnpm-lock.yaml`
11. 写文件用 UTF-8；不要写 BOM

---

## 5. 禁止越界

- ❌ **不做归档动作**、不做归档区、��做「已归档」条（= B7）
- ❌ **不做 PC 端自创增强**（web 没有的一律不加）
- ❌ 不改服务端（`unified-api`）—— 40 个端点**全部现成**，本批**后端零改动**
- ❌ 不改契约文档（`gaclaw/docs/design/*` 冻结）
- ❌ 不碰 markdown 三件套

---

## 6. 验收判据（**不许凭「看着能跑」**）

### 6.1 表单 12 组合（照交底 §8.1 逐格核）

- [ ] delay 模式**只有** DDL 一项，没有类型/标题/责任人/提醒/状态/说明
- [ ] create / edit 两种 mode 的**类型** label 不同（「类型(由入口决定)」/「类型」）
- [ ] schedule：标题·开始日期·结束日期·开始时间·结束时间·责任人·备注·提醒块·底部说明·bound 提示 = 10 项
- [ ] schedule 改开始日期 → 结束日期跟随
- [ ] task：名称·说明·责任人·开始日期·开始时间·状态提示·截止时间·task 专属提示 = 8 项，**且没有状态字段**
- [ ] subtask：名称·责任人·开始日期·开始时间·开始时间提示·截止时间·状态 = 7 项，**没有说明 / 没有提醒**
- [ ] milestone = subtask 全部 + 提醒块
- [ ] task 截止时间空值占位 = 「留空 = 不设截止」；subtask/milestone = 「留空 = 继承」
- [ ] task / schedule 的相关日期 `clearable={false}`；subtask/milestone 的开始日期**可清空**

### 6.2 校验（跑断言，不是肉眼看）

- [ ] 12 组合各跑一遍 `validateForm`，错误字典与交底 §4 逐条对齐
- [ ] **create 子任务 + bound 越界 → 必须报错**
- [ ] **create 关键节点 + bound 越界 → 必须报错**
- [ ] delay 模式打开时**不飘红**（「名称不能为空」不能出现）
- [ ] 同一天结束 ≤ 开始 → 报「结束时间必须晚于开始时间」
- [ ] 跨天日程（endDate > date）→ **不**报该错

### 6.3 写入体（照交底 §8.3）

- [ ] schedule delay → body **只有** `ddl`
- [ ] task → body **不含** `status` / `statusOverride`
- [ ] subtask → body 含 `status`、**不含** `statusOverride`
- [ ] milestone / schedule → body 含 `statusOverride`
- [ ] 责任人**只有** `ownerType`
- [ ] 提醒同步：关+有→DELETE · 开+无→POST · 开+有+没变→**零请求**
- [ ] 提醒同步：task / subtask → **零请求**
- [ ] 编辑一个「本来没有提醒」的节点并保存 → **不凭空多出提醒**

### 6.4 接线

- [ ] `/schedule/task/:id` `/schedule/subtask/:id` `/schedule/milestone/:id`
      `/schedule/schedule/:id` `/schedule/cron/:id` **5 条路由都能打开**
- [ ] 今日待办 / 日历 / 看板 **三处的详情跳转都跳真路由**（不再是 toast 占位）
- [ ] 三处都能打开**新建**表单（今日待办/日历 = 新建日程；看板 = 新建任务）
- [ ] 行菜单 / 卡片菜单里**没有**「归档」项，但**有**「改 DDL」「编辑」
- [ ] 通知点日程 → 跳到 `/schedule/schedule/{id}`（**不是**弹「无法识别的链接」）
- [ ] 桌面通知点日程 → 也能跳（`notifications-sse.ts` 那行加了）

### 6.5 工程

- [ ] `pnpm typecheck` 0
- [ ] 21 个文件剥注释后**硬违规 0**
- [ ] 3 个新 Glyph 的 path **逐字**等于 lucide 对应文件
- [ ] 冻结件（§4 第 6 条）全部 UNCHANGED

---

## 7. 交付要求

1. 逐文件报告：**做了什么 / 与 web 的差异 / 差异原因**
2. **验证证据**（不是「看着对」）：
   - `pnpm typecheck` 的 exit code + 输出尾部
   - 你写的断言脚本的 **checked / passed / failed** 数字
   - 3 个新 Glyph 的 path 与 lucide 对照结果
3. **风险与遗留**（如果有）
4. **不要** git 操作；**不要**跑 build

---

## 8. 与其它批次的接口

| 本批用到 | 来自 | 状态 |
|---|---|---|
| 表单三件套（Rules / Init / Body） | `PC: components/schedule/form/scheduleForm*.ts` | ✅ `9e4f6d8` |
| `detailModel.ts` | `PC: components/schedule/detail/detailModel.ts` | ✅ `9e4f6d8` |
| `findBoardNode` | `PC: routes/ScheduleBoard.tsx`（已 export） | ✅ `0c024a3`（B5） |
| `ScheduleNodeMenu`（按需渲染版） | `PC: components/schedule/ScheduleNodeMenu.tsx` | ✅ `0c024a3`（B5 返工） |
| `CalendarClockIcon` / `CheckSquareIcon` / `CalendarDaysIcon` | 本批新画 | ❌ B6 做 |
| 归档区 `ArchivedSheet` | web | ❌ **B7 做** |
