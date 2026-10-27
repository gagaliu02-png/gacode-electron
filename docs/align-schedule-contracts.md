# 日程中心 · 行为契约「不可回退清单」

> 2026-10-27 · PC 端 PM 出
> **来源**：web 端 `gacode-web/scripts/verify-schedule-*.mjs` 8 支断言脚本的条文反向抽取（explore 实测）
> **用法**：PC 每完成一批，就把该批对应的条文逐条核一遍；能跑的断言脚本**必须搬进 PC 跑通**（PC 无测试框架 ⇒ 纯 node `.mjs` + `.gitignore` 声明式例外入库，**禁 `git add -f`**）。
> **含义**：这些是**已经被 web 固化**的行为。PC 实现时**不许改语义**；若 PC 做不到，要显式记差异，不许静默降级。

---

## 0. 批次归属总览

| 组 | 主题 | 归属批次 | 对应脚本 |
|---|---|---|---|
| A | 父子 DDL 越界 | **B6** | `verify-schedule-fixes-batch1.mjs` |
| B | 归档级联 | **B7** | `verify-schedule-archived.mjs` |
| C | 提醒集合同步 | **B6** | `verify-schedule-reminders.mjs` |
| D | statusOverride vs status 四层 | **B1 / B5 / B6** | `verify-schedule-board.mjs` §5·§6 |
| E | serverTime 倒计时基准 | **B1 / B5** | `verify-schedule-board.mjs` |
| F | 端点集合与 DTO 冻结契约 | **B1** | `verify-schedule-contract.mjs` / `verify-schedule-endpoint-set.mjs` |
| G | 看板 UI 契约 | **B5** | `verify-schedule-board.mjs` |
| H | 日历 / 周视图 / 月视图 | **B4** | `verify-schedule-fixes-batch1.mjs` |
| I | 表单契约 | **B2 / B6** | `verify-schedule-form.mjs` |
| J | 详情页契约 | **B6** | `verify-schedule-detail.mjs` |
| K | 错误码文案 | **B1** | `verify-schedule-reminders.mjs` / `schedule-http.ts` |

---

## A. 父子 DDL 越界（★ web 独有 ⇒ 抄它 = 补齐安卓缺口）

| # | 契约 | 出处 |
|---|---|---|
| A1 | 新建**关键节点** DDL 超父级 → 当场拦 | `fixes-batch1.mjs:551` |
| A2 | 新建**子任务** DDL 超父级 → 当场拦 | `:560` |
| A3 | 新建**日程开始日期**超父级 → 当场拦 | `:570` |
| A4 | 跨天日程**结束日期**超父级 → 当场拦 | `:578` |
| A5 | DDL **恰好等于**父级 → **通过**（边界是 `>` 不是 `>=`） | `:588` |
| A6 | 父级不设截止（游离日程 / 无 bound）→ **不限** | `:596` |
| A7 | **编辑模式**同样要拦 | `:606` |
| A8 | **改 DDL 模式**（delay）同样要拦 | `:613` |
| A9 | 看板页 bound 用父级 **`effectiveDdl`**，不是父级自身 `ddl` | `:618` / `:622` |
| A10 | 详情页 bound 用 `tree.effectiveDdl(parent)` | `:625` |
| A11 | 表单显示上限（`data-bound-hint` + 「最晚 X」） | `:630` |
| A12 | 日期选择器按上限禁用越界日期（`maxDate=boundMaxDate`） | `:634` |
| A13 | 任务（树根）DDL 占位 = 「留空 = 不设截止」，**不显示「继承」** | `:517` / `:521` |
| A14 | 子任务 / 关键节点仍保留「继承」语义 | `:524` |
| A15 | 表单必须用 `ddlEmptyLabel(kind)`，**不许写死**「留空 = 继承」 | `:528` / `:532` |
| A16 | 服务端错误码 `DDL_EXCEEDS_PARENT` 带 `details{field,value,parentId,parentDdl,childKind}`，UI 须按 details 渲染 | `schedule-http.ts:272` / `:288-296` |

---

## B. 归档级联

| # | 契约 | 出处 |
|---|---|---|
| B1 | 恢复动作分派到 **4 个独立 restore 函数**（task / subtask / milestone / schedule），**级联由后端做** | `verify-schedule-archived.mjs:138` |
| B2 | 四类端点顺序固定 = `task,subtask,milestone,schedule` | `:109-111` |
| B3 | 四类中文名 = 任务 / 子任务 / 关键节点 / 日程 | `:113-118` |
| B4 | 计数 = **四类总数**（不是只统计 task） | `:126-128` / `:299` / `:302` / `:305` |
| B5 | 拉不到计数时降级为 0（`archivedTotal(null) === 0`） | `:129-131` |
| B6 | **空的类型不渲染**（不要 4 个空分组） | `:158` / `:211` / `:240` |
| B7 | 分组顺序 = 契约层级顺序（task → subtask → schedule） | `:161` |
| B8 | 组内按**归档时间倒序**（最新在前） | `:164` |
| B9 | 恢复 toast 文案 = 「已恢复「X」— 回到未归档状态」 | `:267` |
| B10 | 恢复后 `invalidateQueries` 刷新归档列表 | `:273` |
| B11 | Esc → 关归档 sheet | `:270` |
| B12 | 今日待办 / 看板**两个入口打开同一个 sheet**（占位 `notReady("已归档")` 已换掉） | `:286-296` |
| B13 | 归档 sheet 是 dialog（`role="dialog"` + `aria-modal="true"`），关着时**整个组件不渲染** | `:200` / `:256` |

---

## C. 提醒集合同步（★ 无变化则零请求）

| # | 契约 | 出处 |
|---|---|---|
| C1 | 开 + 有提醒 + **没变** → **一个请求都不发** | `reminders.mjs:155`（milestone）/ `:219`（schedule） |
| C2 | 开 + 无 → `POST /schedules/milestones/:id/reminders` | `:149` |
| C3 | 开 + 改提前量 / 改渠道 / 改 DDL → `PATCH .../reminders/:rid` | `:163` / `:171` / `:179` |
| C4 | 关 + 有 → `DELETE .../reminders/:rid` | `:187` |
| C5 | 关 + 无 → **什么都不做**（不凭空删） | `:193` |
| C6 | task / subtask → **0 请求**（这俩不支持提醒） | `:228` / `:232` |
| C7 | 编辑**没有提醒**的节点 → `remindOn = false`（不凭空造一条） | `:245` |
| C8 | 编辑**有启用提醒**的节点 → `remindOn = true` | `:250` |
| C9 | 编辑**有禁用提醒**的节点 → `remindOn = false` | `:254` |
| C10 | 新建默认 `remindOn = true` | `:259` |
| C11 | delay 模式 + 节点没提醒 → `remindOn = false` | `:264` |
| C12 | 改标题（提醒没动）→ **0 请求** | `:302` |
| C13 | 看板页提醒同步**只在 EDIT 模式**（delay 不同步） | `:325` |
| C14 | 详情页 milestone 分支**没有早退** —— 提醒同步在同一次保存里发出 | `:332` |
| C15 | `scheduleFormInit` 的 `remindOn` 兜底是 **false**（不是旧的 true） | `:344` |
| C16 | 三条 milestone 提醒端点**已在册**（本次没新增端点） | `:370` |
| C17 | 后端 `PATCH /milestones/:id` **一律不接受 reminders**（`schedules.routes.js:23` 明文）→ 改提醒只能走 3 条专用端点 | `reminders.mjs:8-12` |

---

## D. statusOverride vs status 的四层差异（★ 最易写错）

| # | 契约 | 出处 |
|---|---|---|
| D1 | **task / milestone / schedule → 写 `statusOverride`** | `board.mjs:579-598` |
| D2 | **subtask → 写 `status`**（唯一手工真值列，**没有** `statusOverride`） | `:604` |
| D3 | 三个 override 层写 `statusOverride` 时**绝不带** `status`，且 body **只有 1 个 key** | `:586-590` |
| D4 | 字段名分布必须正确（`statusOverride = [task, milestone, schedule]`；`status = [subtask]`） | `:613` |
| D5 | 类型层已拆分：`TaskPatchBody` 带 `statusOverride`，`SubtaskPatchBody` **不带** | `:626` |
| D6 | 看板页 / 详情页都走 api 层 `setNodeStatus`，**不许手搓 4 分支 switch** | `:645` |
| D7 | **task 取消完成 = 显式钉 `statusOverride: 'pending'`**，不能写 `null` | `:705` |
| D8 | milestone / schedule 取消完成**仍是 `statusOverride: null`**（回到「继承父链」，语义不变） | `:767` |
| D9 | subtask 取消完成 = `{ status: 'pending' }`（无时间派生，本来就不弹回） | `:773` |
| D10 | 反证：旧写法 `statusOverride: null` 必须弹回 `'done'`（否则说明断言空转） | `:728` |
| D11 | 钉住后「标记完成 / 标记进行中 / 取消完成」三连必须依次得 `done, in_progress, pending` | `:744` |
| D12 | 未设过 override 的老数据（无 startAt）派生不变 | `:759` |
| D13 | **Subtask DTO 不声明 `effectiveStatus`**（子任务 status 是手工真值） | `contract.mjs:299` |
| D14 | Task DTO 必须声明 `startAt` / `statusOverride` / `effectiveStatus` | `contract.mjs:296` |
| D15 | 三个派生字段（`overdueAt`/`isOverdue`/`effectiveStatus`）在 DTO 里**必须是可选**（缺失 = 走本地兜底） | `contract.mjs:284` |
| D16 | 后端未出参时，归一化对象**不含**这三个 key（不能被污染成 undefined） | `contract.mjs:207` / `:415` |
| D17 | DTO 给 `isOverdue=true` → 切进 overdue 桶（双轨自动切后端口径） | `contract.mjs:217` |
| D18 | DTO 给 `overdueAt=null` → 后端权威「无截止」，该条**退出** overdue 桶 | `contract.mjs:227` |
| D19 | DTO 给 `effectiveStatus='done'` → 切进 done 桶 | `contract.mjs:237` |
| D20 | `chainTitles` 是**端侧自算**，DTO 接口**不声明**该字段（契约 §9.5 无此字段） | `contract.mjs:275` / `:254` |
| D21 | 状态来源 chip：task/subtask → 「状态已单独设置」；milestone 空 override → 「状态继承上级」；schedule 非空 override → 「状态已单独设置」 | `detail.mjs:176` / `:182` / `:186` |
| D22 | 任务卡状态 chip 用 `effectiveStatus`（缺省退回 `status`） | `form.mjs:431` |

---

## E. serverTime 倒计时基准（★ 最易静默退化）

| # | 契约 | 出处 |
|---|---|---|
| E1 | `BoardView` 渲染 `data-now-source="server"` | `board.mjs:469` |
| E2 | `ScheduleTaskCard` 源码里**没有** `new Date(` —— 倒计时只认入参 `now` | `:478` |
| E3 | `BoardView` 的 `now` 优先取 `serverTime`，降级路径留痕 | `:487` |
| E4 | 卡上倒计时 == 按 serverTime 算的结果（**且**本机时钟会算出不同值） | `:494` / `:497` |
| E5 | api 层 `getBoard()` 走 `scheduleFetchEnvelope` 取**响应级** `serverTime` | `:537` |
| E6 | 传输层 `scheduleFetchEnvelope` 保留 `serverTime` | `:557` |
| E7 | `serverTime` 在**信封顶层**（不在 `data` 里） | `schedule-http.ts:150-153` / `schedule-api.ts:1391-1394` |
| E8 | `formatCountdown` **只认入参 now**，不读本机时钟 | `board.mjs:208` |
| E9 | 倒计时 4 档边界：>7d / ≤ 7d / ≤ 1d / 已逾期（**恰好 7d 归第 2 档，7d+1ms 归第 1 档**） | `board.mjs:161-202` |
| E10 | 无 ddl → `null`（卡片不渲染倒计时）；已完成卡片不渲染倒计时 | `:202` / `:417` |

---

## F. 端点集合与 DTO 冻结契约（B1）

| # | 契约 | 出处 |
|---|---|---|
| F1 | **42 method+path / 28 唯一路径**（契约 §4.6 / §13.1.41 / §13.1.46） | `endpoint-set.mjs:191`/`:195`、`contract.mjs:53`/`:56`、`board.mjs:550` |
| F2 | 端点集合双向零差集（web ↔ UX §9 ↔ design §4.2） | `endpoint-set.mjs:181`/`:187` |
| F3 | `schedule-api.ts` 内**无** `notImplemented` / 「未实现」占位 | `contract.mjs:62` |
| F4 | `schedule-api.ts` **运行时**不再 import `./schedule-mocks`（mock 降级为 fixture-only） | `contract.mjs:70` |
| F5 | 冻结 SHA 全部指向 `a5e672b` | `endpoint-set.mjs:201` |
| F6 | DTO 三条规则：`startAt`/`endAt` 必填、`endAt > startAt`、前端消费必须是纯 `HH:mm`（ISO 已转掉） | `contract.mjs:86-98` / `:119` |
| F7 | 五桶（overdue/morning/afternoon/evening/done）互斥且完整覆盖 | `contract.mjs:148` |
| F8 | 三时段桶按 `startAt` 落点：morning 0-12 / afternoon 12-18 / evening 18-24 | `contract.mjs:154` |
| F9 | done 桶全部 `effectiveStatus === 'done'`；overdue 桶全部 `!== 'done' && overdueAt < now` | `contract.mjs:157`/`:160` |
| F10 | **游离日程** `parentId`/`parentKind` 均为 null（没挂任何父节点） | `contract.mjs:168` |
| F11 | `Subtask`/`Milestone` DTO 都声明 `startAt`（可空）**且运行时真映射**（只声明类型 = 假修复） | `contract.mjs:309`/`:317`/`:323` |
| F12 | `CronJob` DTO 声明 `originSessionId?: string \| null` + 运行时映射 + null/缺失统一归 null | `contract.mjs:336`/`:346`/`:360` |
| F13 | cron 整条链路（fixture → wire → normalize）保留 `originSessionId` | `contract.mjs:369` |

---

## G. 看板 UI 契约（B5）

| # | 契约 | 出处 |
|---|---|---|
| G1 | 4 列齐全，列头文案 = 未开始 / 进行中 / 已完成 / 已逾期 | `board.mjs:368`/`:375` |
| G2 | 列头配色 = muted / brand / success / danger | `:383` |
| G3 | 5 个筛选 pill 文案齐全（**安卓也有**：`ScheduleBoardViewModel.kt:31-37`） | `:455` |
| G4 | 看板有新建任务入口（右下角悬浮 FAB，与知识库/今日待办同款） | `:458` |
| G5 | 任务树三层都渲染：子任务 › 关键节点 › 日程 | `:429` |
| G6 | 层级缩进用左侧竖线 | `:435` |
| G7 | 空列渲染占位「暂无任务」 | `:449` |
| G8 | 看板容器横向滚动 + 4 列 grid | `:388` |
| G9 | 看板列**去重**：同一卡片只在「已逾期」列，pending 里那份被去掉 | `form.mjs:443` |
| G10 | 卡片**不加左侧色条**（色条只给日历/周视图事件块） | `ScheduleTaskCard.tsx:30-31`（契约 §6.1） |
| G11 | 日程叶子 = **一行**（标题 + 头像 + ⋮ 同行），`flex-nowrap`，只 1 个 ⋮ | `fixes-batch1.mjs:485-506` |
| G12 | 看板 tab 已挂载（无「正在开发中」toast / 无 `aria-disabled`），路由 `/schedule/board/` 存在 | `board.mjs:513-531` |

---

## H. 日历 / 周视图 / 月视图（B4）

| # | 契约 | 出处 |
|---|---|---|
| H1 | 重叠事件**并排**（Google Calendar 式），**取消** maxCols=3 上限 | `fixes-batch1.mjs:231`/`:234`/`:246` |
| H2 | 没有「N 项 · 点开看全部」字样 / 没有两点折叠占位 / 无 accordion 实现 | `:301`/`:304`/`:259` |
| H3 | `weekExpand.ts` 已删除（纯逻辑层不留死代码） | `:261` |
| H4 | 事件块按百分比并排定位（`calc(N% - 4px)` 宽） | `:313` |
| H5 | 周视图事件块可点进详情页（**日程详情只从周视图可达**） | `:319` |
| H6 | 事件块带 `title` + 窄标题长按气泡（`data-event-title-peek`），长按不吞点击 | `:324`/`:327`/`:330` |
| H7 | 月视图**无详情页入口**，一律切周视图并定位那天（`data-pick-day`） | `:361`/`:363`/`:366`/`:385` |
| H8 | `pickDayPlan` 跨周定位正确（weekOffset + focusIdx） | `:342-350` |

---

## I. 表单契约（B2 纯逻辑 / B6 UI）

| # | 契约 | 出处 |
|---|---|---|
| I1 | 「日期」拆成「开始日期 *」+「结束日期 *」 | `form.mjs:127`/`:130`/`:133` |
| I2 | 结束日期默认 = 开始日期 | `:139` |
| I3 | 结束日期 < 开始日期 → 「结束日期不能早于开始日期」 | `:148` |
| I4 | 同一天 结束 ≤ 开始 → 「结束时间必须晚于开始时间」 | `:154` |
| I5 | **跨天结束时间为空 → 报错**，不做 23:59 兜底 | `:169` / `:224` |
| I6 | 结束日期为空 → 「结束日期不能为空」；标题为空 → 「名称 / 标题不能为空」 | `:185`/`:191` |
| I7 | `endAt` = 结束日期 + 结束时间；跨天落在结束日期 | `:210`/`:219` |
| I8 | 写入体**不新增字段** | `:231` |
| I9 | 任务表单 = 开始日期 * + 开始时间 *；**任务不选状态** | `:308`/`:311`/`:314` |
| I10 | **任务体不发 `status`**（状态由后端按时间派生） | `:368` / `:395` |
| I11 | 任务体带 `startAt` + `ddl`；缺开始时间时**不带** `startAt` | `:366`/`:373`/`:564` |
| I12 | **子任务体仍发 `status`** | `:381` |
| I13 | 子任务 / 关键节点 `startAt` 可空（留空 → null，不塞假值） | `:386`/`:514`/`:545`/`:597` |
| I14 | delay 模式**不带** `startAt`（只改 DDL） | `:524`/`:554` |
| I15 | 关键节点体仍发 `statusOverride: null`（= 继承上级） | `:536` / `:631` |
| I16 | 关键节点 edit 体带 `title` / `ownerType` / `statusOverride`，`startAt = null` | `:625`-`:634` |
| I17 | 详情页 edit 分支**不再手搓关键节点写入体**（走 `milestoneBody`） | `:661`/`:664` |

---

## J. 详情页契约（B6）

| # | 契约 | 出处 |
|---|---|---|
| J1 | 5 条详情路由文件全部存在 | `detail.mjs:133` |
| J2 | **四 kind 真共用一个 `ScheduleDetailPage`**，无「每 kind 一份」副本 | `:139-147` |
| J3 | 详情路由由 `detailPath()` 统一拼（kind → `/schedule/<kind>/<id>/`） | `:148-151` |
| J4 | 子项分组：task→子任务 / subtask→关键节点 / milestone→日程 / schedule→**同级日程** | `:159-162` |
| J5 | 新建分流：task→子任务→关键节点→日程；日程是叶子，**没有下级新建入口** | `:164-167` |
| J6 | 祖先链长度 = 3，顺序 = 根 → 直接父级 | `:224`/`:227` |
| J7 | 子项三级字号 lv1 / lv2 / lv3 | `:189` |
| J8 | 提醒摘要：无 → 「不提醒」；提前 15 分钟 + 应用内通知 | `:193`/`:195` |
| J9 | 渠道中文名 = 应用内通知 / 应用弹窗；**存量 `wechat` 不再显示成「微信」** | `:201-206` |
| J10 | 提前量 0 → 「准时」 | `:207` |

---

## K. 错误码文案（B1）

| # | 契约 | 出处 |
|---|---|---|
| K1 | `DDL_EXCEEDS_PARENT` 按 `details.field` 分两支（`date` vs `ddl`） | `schedule-http.ts:288-296` |
| K2 | `SCHEDULE_DATE_MISMATCH` → 「时段与日期不一致：日期 X，时段 A ~ B」 | `:297-298` |
| K3 | `SCHEDULE_TIME_RANGE_INVALID` → 「时段无效：结束 X 必须晚于开始 Y」 | `:299-300` |
| K4 | `CRON_UPDATE_FORBIDDEN` → 「cron 任务只允许切换启用 / 禁用，不能修改其它字段」 | `:301-302` |
| K5 | 错误**必须保留 `code` + `details`**（`ScheduleApiError`），不许压成一行字符串 | `:59-76` / `:9-12` |

---

## L. PC 侧移植注意（不属于 web 契约，是 PC 特有约束）

| # | 项 | 说明 |
|---|---|---|
| L1 | **web 的 8 支 `verify-schedule-*.mjs` 全部可搬**（改路径 + 改 loader）。真正卡住的只有 3 个技术细节：① 路径硬编码 `../src/components/schedule/...` ② loader 依赖链（web 加载 `nav.ts`/`api-base.ts`，**PC 不需要** ⇒ PC loader 反而更简单）③ `cn` 工具（**PC 全仓无 `cn`**，PC 用 `["a","b"].filter(Boolean).join(" ")` 内联模式）⇒ loader 里 `writeJs("utils", ...)` 段在 PC 上要删 | explore 实测 |
| L2 | **lucide 依赖在 PC 实现后自动消失**（PC 组件用 `Glyphs.tsx`）⇒ 8 支脚本的 lucide 阻塞不成立 | 同上 |
| L3 | web loader 把临时目录建在**项目根**（`mkdtempSync(join(process.cwd(), '.xxx-tmp-'))`）⇒ 跑一次就在 PC 仓库根留一个目录 ⇒ **PC loader 改写到 `os.tmpdir()`** | 同上 |
| L4 | PC `.gitignore` 三级解锁顺序不能乱：`!scripts/` → `scripts/*` → 只豁免要入库的文件。**父目录被忽略时子文件的 `!` 例外不生效** | PC `.gitignore:20-24` 注释 |
| L5 | **禁 shell 通配**：PC 上 `node scripts/verify-*.mjs` 在 PowerShell 5.1 与 cmd 下都 `MODULE_NOT_FOUND` exit 1 ⇒ 必须**显式点名逐个串** | 既有铁律 |
| L6 | PC 仓**没有 lucide-react** ⇒ web 的 UI 组件**不能逐字抄**；图标走自绘 `Glyphs.tsx`（path 逐字抄 lucide v0.407.0） | 既有铁律 |
| L7 | web 日程模块（`src/components/schedule/**`）**完全不依赖 date-fns**（`format.ts` 零 import，`calendar-utils.ts` 自实现 `addDays`）⇒ web 的 date-fns `^3.6.0` vs PC `^4.4.0` 的版本差**对日程零影响** ⇒ 「1:1 搬」成立 | PM 2026-10-27 实测 |
| L8 | PC 仓**无** `cn` / `clsx` / `tailwind-merge` / `cva` / `lucide-react` ⇒ className 用数组 `.join(" ")`；冲突类名用 `!` **前缀**（Tailwind 3.4.19），**不要 `!important`** | 既有铁律 |
| L9 | PC **全局禁 CSS 动效**（`globals.css:408-414`）⇒ web 的 `animate-*` 一律静态 | 既有铁律 |
| L10 | 同仓**不能并行两个 writer**（撞 git index）⇒ 每批只能一个 writer | 既有铁律 |
