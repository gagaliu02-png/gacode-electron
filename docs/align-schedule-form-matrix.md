# 日程中心 · 新建/编辑日程表单矩阵交底

> **批次归属**: 日程中心代次 3 · **B6**（详情 + 表单 + DDL 越界弹窗）的**表单部分**。
> **上游已就位**（B1/B2 已落地 `9e4f6d8`）: `src/lib/schedule-api.ts` · `src/lib/schedule-http.ts` ·
> `src/components/schedule/form/{scheduleFormRules,scheduleFormInit,scheduleFormBody}.ts`（与 web 逐字等价）
> · `src/components/schedule/detail/detailModel.ts` · `src/components/schedule/archived.ts`
>
> **真源**: `gacode-web/src/components/schedule/form/ScheduleFormSheet.tsx`（636 行）·
> `gacode-web/src/components/schedule/form/{scheduleFormRules,scheduleFormInit,scheduleFormBody}.ts`
> 契约: `gaclaw/docs/design/schedule-center-ux-2026-10-20.md` §9.2 / §9.4 / §9.4b / §9.5
>
> **行号约定**: `web:` = web 仓行号 · `PC:` = PC 仓行号（`PC:` 侧的三个 form 文件**已搬**，行号可直接跳）。

---

## 0. 为什么要单独一份交底

gaga 2026-10-27:「日程中心是一个很复杂的板块 所以你要**看仔细一点** 特别是**新建日程的板块 很容易漏掉**」。

这个表单是**整个日程中心唯一一处「12 个组合 × 每组合 8~11 个字段 × 校验 × 写入体」同时交叉**的地方：
抄漏一个字段不会报错、不会崩，只会让 PC 和 web 的行为不一致 —— **是那种"看着能跑但就是不对"最容易蒙混过关的地方**。

本文件的目的是：**把 12 个组合逐格列全 + 把 10 个最容易漏的坑逐条点名**，让 B6 的 worker 照着勾。

---

## 1. 三层分工（PC 侧已经到位的两层不用重做）

| 层 | 文件 | PC 状态 | 说明 |
|---|---|---|---|
| **纯逻辑层** | `form/scheduleFormRules.ts`（校验）· `form/scheduleFormInit.ts`（初值）· `form/scheduleFormBody.ts`（写入体 + 提醒同步） | ✅ **已搬，与 web 逐字等价** | B6 **直接调用**，不要重写 |
| **数据层** | `lib/schedule-api.ts`（端点 + DTO + 图算法）· `lib/schedule-http.ts`（传输） | ✅ **已搬**（`9e4f6d8`） | 同上 |
| **UI 层** | `form/ScheduleFormSheet.tsx`（636 行）· `form/DatePickerField.tsx`（242）· `form/TimePickerField.tsx`（184）· `form/CustomSelect.tsx`（175）· `form/PopPanel.tsx`（52）· `form/usePopPosition.ts`（105）· `form/ScheduleDdlOverrunDialog.tsx`（110） | ❌ **B6 要搬** | 本文件的对象 |

⚠️ **UI 层 7 个文件互不独立**：`ScheduleFormSheet` 依赖 `DatePickerField` / `TimePickerField` / `CustomSelect`（`PopPanel` + `usePopPosition`）。
**必须同批搬**，不能只搬 Sheet。

---

## 2. 12 组合矩阵（3 mode × 4 kind）

`FormMode = create | edit | delay`（`PC: scheduleFormRules.ts:13`）
`FormKind = schedule | task | subtask | milestone`（`PC: scheduleFormRules.ts:14`）

### 2.1 mode = delay —— **只出 DDL 一项**（不管 kind）

`web:219-238`。**delay 模式完全不走下面的 kind 分支**：

| 项 | 内容 |
|---|---|
| 标题 | 固定「改 DDL」（`web:171`）· 底按钮「确认」（`web:172`） |
| 字段 | **只有「DDL」一项** = 日期（`DatePickerField`，`maxDate={boundMaxDate}`，`emptyLabel="未设置"`）+ 时间（`TimePickerField`）两列 |
| **没有** | 类型 · 标题 · 责任人 · 备注 · 提醒 · 状态 · 说明 · 开始/结束日期时间 |
| boundHint | 有 bound 时显示（`web:236`） |
| 校验 | 仍跑 `validateForm`（`web:159`）—— 见 §4 的 ⚠️ |

⚠️ **delay 模式不渲染标题字段，但 `validateForm` 无条件判「名称 / 标题不能为空」**（`PC: scheduleFormRules.ts:124`）。
它不报错**只因为** `initialValues` 在 delay 模式从 `node` 回填了 `title`（`PC: scheduleFormInit.ts:75`）。
⇒ **PC 侧必须保留这个回填**，否则 delay 模式一打开就顶栏飘红「名称 / 标题不能为空」。

### 2.2 mode = create / edit —— 按 kind 分 4 支

公共首项（**两种 mode 都有**）：**类型**（`web:242-252`）
- 只读回显按钮（`aria-pressed="true"`），**不可改** —— 类型由入口决定
- label：create 时「类型(由入口决定)」/ edit 时「类型」
- 显示文案：`KIND_LABEL` = 任务 / 子任务 / 关键节点 / 日程（`web:84-89`）

---

#### kind = `schedule`（`web:253-338`）

| 序 | 字段 | 必填 | 关键约束 |
|---|---|---|---|
| 1 | 标题 | ✅ * | placeholder「例如:跟张老板对一下周报」 |
| 2 | 开始日期 | ✅ * | `clearable={false}` · `maxDate={boundMaxDate}` · ⚠️ **改它时结束日期跟随**：`if (!values.endDate \|\| values.endDate < v) set("endDate", v)`（`web:271`） |
| 3 | 结束日期 | ✅ * | `minDate={values.date}` · `maxDate={boundMaxDate}` · `clearable={false}` |
| 4 | 开始时间 | ✅ * | |
| 5 | 结束时间 | ✅ * | |
| 6 | 责任人 | | `CustomSelect`：user = 我的名字 / cody = "Cody" |
| 7 | 备注 | | textarea · placeholder「补充说明」 |
| 8 | **提醒块** | | `RemindBlock`（`web:323-328`）—— **schedule 有** |
| 9 | 底部说明 | | 「开始日期 / 结束日期 / 开始时间 / 结束时间 全部必填 —— 日程必须占一个明确时段。跨天日程: 结束日期可以晚于开始日期, 结束时间落在结束日期上。」（`web:330-331`） |
| 10 | bound 提示 | | 「这条日程挂在{label}「{title}」下面,日期和截止时间都不能超过它的截止时间。」（`web:335`） |

**没有**：说明(desc) · 状态 · 截止时间字段

---

#### kind = `task`（`web:340-476` 的 task 分支）

| 序 | 字段 | 必填 | 关键约束 |
|---|---|---|---|
| 1 | 名称 | ✅ * | placeholder「例如:日程中心 V1 上线」 |
| 2 | **说明** | | textarea · placeholder「这个任务要达成什么」—— **仅 task 有** |
| 3 | 责任人 | | 同上 |
| 4 | 开始日期 | ✅ * | `clearable={false}` · ⚠️ **无 maxDate**（task 不是日程，不受父级日期上限） |
| 5 | 开始时间 | ✅ * | 与开始日期同一 grid（两列） |
| 6 | 状态提示 | | 「任务状态按开始 / 截止时间自动判断 —— 不用手动选。想改状态用卡片上的 ⋮ 菜单(标记进行中 / 标记完成)。」（`web:398-399`） |
| 7 | 截止时间 | | 日期 + 时间两列 · `maxDate={boundMaxDate}` · ⚠️ **emptyLabel = `ddlEmptyLabel("task")` = 「留空 = 不设截止」** |
| 8 | task 专属提示 | | 「任务没有上级,截止时间就是它自己的 —— 留空 = 不设截止。」（`web:451`） |

**没有**：**状态字段**（见 §5 易漏点 ①）· 提醒块

---

#### kind = `subtask`（`web:340-476` 的 subtask 分支）

| 序 | 字段 | 必填 | 关键约束 |
|---|---|---|---|
| 1 | 名称 | ✅ * | placeholder「例如:发布与验收」 |
| 2 | 责任人 | | **无「说明」字段**（只有 task 有） |
| 3 | 开始日期 | | ⚠️ **可空** · `emptyLabel="不设开始时间"` · **无 clearable={false}** |
| 4 | 开始时间 | | 与开始日期同一 grid |
| 5 | 开始时间提示 | | 「开始时间可以留空 —— 留空 = 不设开始时间。子任务 / 关键节点的开始时间不参与截止时间继承和状态判断。」（`web:425-426`） |
| 6 | 截止时间 | | `emptyLabel = ddlEmptyLabel("subtask")` = **「留空 = 继承」** · `maxDate={boundMaxDate}` · boundHint |
| 7 | **状态** | | `CustomSelect` · 选项：未开始 / 进行中 / 已完成（`web:91-95`）—— **subtask 有** |

**没有**：说明 · 提醒块 · task 专属提示

---

#### kind = `milestone`（`web:340-476` 的 milestone 分支）

= **subtask 的全部字段**（名称 placeholder 换成「例如:联调」）**+ 提醒块**（`web:467-474`）。

**milestone 有提醒块、subtask 没有** —— 这是最容易抄错的一格。

---

### 2.3 字段速查矩阵（哪些格子有 / 没有）

| 字段 | schedule | task | subtask | milestone |
|---|:---:|:---:|:---:|:---:|
| 类型（只读回显） | ✅ | ✅ | ✅ | ✅ |
| 标题 / 名称 * | ✅ | ✅ | ✅ | ✅ |
| 说明 (desc) | ❌ | ✅ | ❌ | ❌ |
| 开始日期 | ✅* | ✅* | ✅可空 | ✅可空 |
| 结束日期 | ✅* | ❌ | ❌ | ❌ |
| 开始时间 | ✅* | ✅* | ✅可空 | ✅可空 |
| 结束时间 | ✅* | ❌ | ❌ | ❌ |
| 责任人 | ✅ | ✅ | ✅ | ✅ |
| 备注 (note) | ✅ | ❌ | ❌ | ❌ |
| 截止时间 | ❌ | ✅ | ✅ | ✅ |
| 状态 | ❌ | ❌ | ✅ | ✅ |
| 提醒块 | ✅ | ❌ | ❌ | ✅ |

---

## 3. 入口参数表（**bound 传错 = 整道父子越界校验失效**）

| # | 入口 | mode | kind | bound | defaultDate |
|---|---|---|---|---|---|
| 1 | 今日待办 FAB「新建待办」 | `create` | `schedule` | **不传**（游离日程） | `todayYmd` |
| 2 | 今日待办 卡片编辑 | `edit` | `schedule` | 不传 | — |
| 3 | 今日待办 卡片改 DDL | `delay` | `schedule` | 不传 | — |
| 4 | 日历页 FAB「新建日程」 | `create` | `schedule` | 不传 | 该处日期 |
| 5 | **看板页 FAB「新建任务」** | `create` | `task` | **`null`**（任务是树根，无父级） | — |
| 6 | 看板 ⋮ 编辑 | `edit` | `target.kind` | 见 §3.2 | — |
| 7 | 看板 ⋮ 改 DDL | `delay` | `target.kind` | 见 §3.2 | — |
| 8 | 详情页「编辑」 | `edit` | `kindOf(node)` | 见 §3.1 | — |
| 9 | 详情页「改 DDL」 | `delay` | `kindOf(node)` | 见 §3.1 | — |
| 10 | 详情页「新建下级」 | `create` | `nextCreateKind(kindOf(node))` | 见 §3.1 | — |

`nextCreateKind`（`PC: detail/detailModel.ts:62-67`）：**任务 → 子任务 · 子任务 → 关键节点 · 关键节点 → 日程 · 日程 → null（叶子没有新建入口）**

### 3.1 详情页的 bound（`web: detail/ScheduleDetailPage.tsx:425-476`）

```ts
// 编辑 / 改 DDL (:434-441 / :451-458)
bound: parent ? {
  label: KIND_LABEL[kindOf(parent)],
  title: parent.title,
  ddl: tree?.effectiveDdl(parent) ?? null,      // ⚠️ 无 ?? parent.ddl 回退
} : null

// 分层新建「新建下级」 (:470-474)
bound: {
  label: KIND_LABEL[kindOf(node)],
  title: node.title,
  ddl: tree?.effectiveDdl(node) ?? node.ddl ?? null,   // ⚠️ 有回退
}
```

### 3.2 看板页的 bound（`web: app/(main)/schedule/board/page.tsx:316-332`）

```ts
bound: f.parent ? {
  label: kindLabelOf(f.parentKind),
  title: String(f.parent.title ?? ""),
  ddl: f.parentEffectiveDdl,                     // ⚠️ 看板页本地算出来的
} : null
```

### 3.3 ⚠️ 三处 bound 的写法**不一样**，别统一抄成一种

| 来源 | ddl 取值 | 有无回退 |
|---|---|---|
| 详情页 编辑/改DDL | `tree.effectiveDdl(parent)` | **无** `?? parent.ddl` |
| 详情页 分层新建 | `tree.effectiveDdl(node)` | **有** `?? node.ddl` |
| 看板页 | `f.parentEffectiveDdl` | 看板页本地 walk 算的 |

**PC 侧统一用 `tree.effectiveDdl(parent)`**（`PC: schedule-api.ts:528` 的 `effectiveDdl` 已在 `ScheduleTreeIndex` 上，`buildFlatIndex()` 直接返回 `tree`）—— 语义与 web 三处**等价**，且不用抄 web 那段 30 行私有递归 `findBoardNode`。

**为什么必须用 effectiveDdl 而不是父级自身的 `ddl`**（gaga 2026-10-21 生产实测 bug）：
父级自己的 `ddl` 可能是**空**（它自己也是继承来的）⇒ 用空值当上限 = **整道限制失效** = 子节点能设到父级截止之后。
口径照契约 §9.4b：`child.effectiveDdl ≤ parent.effectiveDdl`。

### 3.4 PC 侧 B5 的一个已知缺口（做看板时必须处理）

web 的 `findBoardNode` 是**看板页里的私有函数**（`board/page.tsx:497-522`），**不在 `schedule-api.ts` 里** ⇒ 抄不到。
它返回的 `FoundBoardNode` 带 `parent`（父节点**对象**，用来取 `parent.title`）和 `parentEffectiveDdl`。

PC 侧 `FlatScheduleNode`（`PC: schedule-api.ts:1179-1183`）只有 `{ node, parentId, parentKind }` —— **没有 `parent` 对象字段**。
⇒ PC 侧取父标题要自己建 `id → node` 映射，或改用 `tree.parentOf(node)` 拿父节点再查。

---

## 4. 校验规则全表（`PC: src/components/schedule/form/scheduleFormRules.ts`）

`validateForm(values, kind, mode, bound)`（`PC:117-199`）—— **PC 侧已搬，不用重写**。下面是它的口径清单：

| # | 条件 | 错误文案 | 行号 |
|---|---|---|---|
| 1 | `title` 空（**无条件**，不分 mode/kind） | 名称 / 标题不能为空 | `PC:124` |
| 2 | schedule + mode≠delay：`date` 空 | 开始日期不能为空 | `PC:128` |
| 3 | schedule + mode≠delay：`endDate` 空 | 结束日期不能为空 | `PC:129` |
| 4 | schedule：`endDate < date` | 结束日期不能早于开始日期 | `PC:130-132` |
| 5 | schedule：`start` 空 | 开始时间不能为空 | `PC:133` |
| 6 | schedule：`end` 空 | 结束时间不能为空 | `PC:134` |
| 7 | schedule + **同一天** + `end ≤ start` | 结束时间必须晚于开始时间 (HH:mm ~ HH:mm) | `PC:136-143` |
| 8 | task + mode=create：`date` 空 | 开始日期不能为空 | `PC:149` |
| 9 | task + mode=create：`start` 空 | 开始时间不能为空 | `PC:150` |
| 10 | task：`ddlDate` 早于 开始日期+开始时间 | 截止时间不能早于开始时间 | `PC:153-159` |
| 11 | **有 bound** + `ddl` 晚于 父级 effectiveDdl | 截止时间不能晚于{label}「{title}」的截止时间(M月D日 HH:mm) | `PC:183-188` |
| 12 | **有 bound** + schedule + `date` 晚于 父级上限**所在日** | 日期不能晚于{label}「{title}」的截止日期(YYYY-MM-DD) | `PC:191-193` |
| 13 | **有 bound** + schedule + `endDate` 晚于 父级上限**所在日** | 结束日期不能晚于{label}「{title}」的截止日期(YYYY-MM-DD) | `PC:194-196` |

**跨天日程不判「结束 > 开始」** —— 跨天时 `endAt` 落在结束日期上，天然更晚（`PC:135`）。

### ⚠️ 校验 #11-13 的执行条件 —— 曾经是生产 bug

旧实现写的是 `if (mode !== "create" || kind === "schedule")` ⇒ **新建子任务 / 关键节点时整段被跳过** = 前端拦截形同虚设。
现实现是 **`create` / `edit` / `delay` 一律校验**（`PC:179`）。**PC 侧抄 `scheduleFormRules.ts` 时不要"优化"回旧写法。**

### ⚠️ `SCHEDULE_DATE_MISMATCH` 前端**不实现**

总 PM 2026-10-21 拍板 D4：表单只填 `HH:mm`（没有日期部分），该分支永远不触发；日期一致性交后端 422，由页面按错误码映射回字段。
**PC 侧不要自作主张加这条前端校验。**

### ⚠️ 错误展示位置（两处）

1. **字段级**：`Field` 组件在 label 下方渲染红字（`web:524-529`）
2. **顶部汇总条**：`hasError` 时在表单顶部渲染一条红底汇总（`web:212-217`），内容 = `Object.values(errors).join(";")`

⇒ PC 侧要**两处都做**，只做一处 = 报错信息看不见。

---

## 5. 🔟 十个最容易漏的点（gaga 重点关照的那块）

| # | 坑 | 后果 | 依据 |
|---|---|---|---|
| ① | **task 没有状态字段** | 抄了 `kind !== "task"` 之外的状态选择器 = 状态被手工覆盖，后端派生失效 | `web:376-377` 注释 + `web:455-466` 条件 + `web:397-400` 提示文案 |
| ② | **提醒块只在 2 个 kind 出现** | schedule 有（`web:323-328`）、milestone 有（`web:467-474`）；**task / subtask 没有** | 抄成「所有 kind 都有」或「都没有」都错 |
| ③ | **task 的截止时间占位不是「继承」** | `ddlEmptyLabel("task")` = 「留空 = 不设截止」；subtask/milestone = 「留空 = 继承」。写死「继承」= 任务显示"继承"但它没有父级 | `PC: scheduleFormRules.ts:71-73`（gaga 2026-10-21 生产实测） |
| ④ | **改开始日期时结束日期要跟随** | 漏了 = 用户改开始日期后结束日期留在旧值 → 校验报错，用户懵 | `web:271` |
| ⑤ | **结束日期 `minDate = values.date`** | picker 层面就挡住"结束早于开始"，还有校验层兜底 | `web:282` |
| ⑥ | **`clearable={false}` 不是全局的** | schedule 的开始/结束日期 + task 的开始日期 = 不可清空；**subtask/milestone 的开始日期可清空**（emptyLabel「不设开始时间」） | `web:274/284` vs `web:413` |
| ⑦ | **父子越界 create/edit/delay 一律校验** | 退回旧写法 = 新建子任务/关键节点整段跳过 | `PC:179` · gaga 2026-10-21 生产实测 |
| ⑧ | **bound.ddl 必须是父级 effectiveDdl** | 用父级自身 `ddl` = 限制失效，子节点能设到父级之后 | §3.3 · gaga 2026-10-21 生产实测 |
| ⑨ | **提醒开关初值 = 节点本来有没有提醒** | 兜底成 `true` → 编辑保存时 `syncReminders` 看到「开 + 无」→ **凭空 POST 一条提醒** | `PC: scheduleFormInit.ts:99-104`（安卓侧同款修正） |
| ⑩ | **子任务/关键节点的开始日期不预填 defaultDate** | 预填 = 用户没填也发出去 = 假值 | `PC: scheduleFormInit.ts:53-55` |

**补充一条（编号 ⑪，容易被当成 bug）**：`delay` 模式下 `scheduleBody` 只发 `{ ddl }`（`PC: scheduleFormBody.ts:102-104`），但 `taskBody` / `milestoneBody` 在 delay 下**仍会带 `title` / `desc` / `statusOverride`**（因为 `initialValues` 从 node 回填了这些值 ⇒ 非空 ⇒ 命中"有值就带"）。
PATCH 稀疏语义下带同值无害，**与 web 一致即可，不要"修"它**。

---

## 6. 写入体矩阵（`PC: src/components/schedule/form/scheduleFormBody.ts` —— 已搬，直接调）

| kind | mode | body 字段 |
|---|---|---|
| schedule | create | `ownerType` · `ddl` · `statusOverride` · `title` · `date` · `startAt` · `endAt` · `note` |
| schedule | edit | `ownerType` · `ddl` · `statusOverride` + **稀疏**（title/date/startAt/endAt/note 只在有值时带） |
| schedule | **delay** | **只有 `{ ddl }`**（`PC:102-104`） |
| task | create/edit | `ownerType` · `ddl` · `title` · `desc` · `startAt`；⚠️ **不发 `status` 也不发 `statusOverride`**（后端按时间派生） |
| subtask | create/edit | `ownerType` · `ddl` · `title` · `desc` · **`status`**（子任务的手工真值列）· `startAt`（可空 = null） |
| subtask | delay | `ownerType` · `ddl` · `status` · `title?` · `desc?`；**不带 startAt** |
| milestone | create/edit | `ownerType` · `ddl` · `statusOverride` · `title` · `startAt`（可空） |
| milestone | delay | `ownerType` · `ddl` · `statusOverride` · `title?`；**不带 startAt** |

**责任人一律只传 `ownerType`** —— `ownerId` / `ownerName` 由服务端从 JWT 解析（`PC: scheduleFormBody.ts:5`）。

**状态字段四层不同名**（契约 §6.4）—— 完整对照表在 `PC: schedule-api.ts` 的 `statusWriteBody`：
任务 / 关键节点 / 日程 → `statusOverride`；**子任务 → `status`**（子任务表**没有** `statusOverride` 那一列，后端 `additionalProperties:false` ⇒ 发了直接 400）。

### 提醒同步 `syncReminders`（`PC: scheduleFormBody.ts:217-249`）

| 条件 | 行为 |
|---|---|
| kind 不是 schedule / milestone | **什么都不做**（后端没给任务/子任务开提醒端点） |
| 关 + 原来没有 | 什么都不做 |
| 关 + 原来有 | DELETE |
| 开 + 原来没有 | POST |
| 开 + 原来有 + **没变** | **什么都不做**（一个请求都不发） |
| 开 + 原来有 + 变了 | PATCH |

⚠️ **只在 edit 模式被调用** —— delay 模式不同步提醒（表单里根本没有提醒开关，同步 = 凭空改/造提醒）。

⚠️ **kind 决定打哪组端点**：milestone → `/schedules/milestones/:id/reminders`；schedule → `/schedules/schedules/:id/reminders`。
旧实现把 kind 扔掉一律打日程那组 ⇒ 关键节点的提醒永远落在错误资源上（web「提醒开关是哑弹」的根因之一）。

---

## 7. PC 侧移植注意（与 web 的 9 处差异）

| # | web 写法 | PC 侧怎么办 | 依据 |
|---|---|---|---|
| 1 | `cn(...)` | **PC 全仓无 cn / clsx / tailwind-merge / cva** ⇒ 用 `["a", cond && "b"].filter(Boolean).join(" ")` | PC `package.json` |
| 2 | `lucide-react` 的 `AlertCircle` / `X` / `CheckSquare` / `CalendarClock` | 图标**唯一出处** `src/components/ui/Glyphs.tsx`（84 导出）⇒ **禁止内联 `<svg>`**。已有：`AlertCircleIcon`(:543) · `CloseIcon`(:429)；`CheckSquare` / `CalendarClock` 需新增（已拍板 Q5：画 **8 个**新 Glyph，含 `CalendarClockIcon`） | `PC: Glyphs.tsx` |
| 3 | `useQuery({queryKey:["profile"], queryFn:getProfile})` | ✅ PC **有** `@tanstack/react-query@^5.59.0` + `getProfile(): Promise<ProfileData>`（`PC: api.ts:1316`），`ProfileData` 有 `displayName?` + `username` ⇒ `profile?.displayName \|\| profile?.username \|\| (node?.ownerName as string) \|\| "我"` **可直接用** | `PC: api.ts:1305-1318` |
| 4 | `toast({title, description, variant})` | ✅ PC 的 toast 支持 `title` + `description` + `variant`（也支持 `message`）⇒ **web 形态直接可用** | `PC: components/library/EditSheet.tsx:74` |
| 5 | `router.push(...)` (next/navigation) | PC 用 `react-router-dom@6.27` 的 `useNavigate` / `useParams` | `PC: routes/*.tsx` |
| 6 | Tailwind v4 CSS-first `@theme` | PC 是 **Tailwind 3.4.19** —— 但 web 表单用到的 token **PC 侧全部已存在**（已逐个核过 `PC: tailwind.config.ts`）⇒ **类名可 1:1 抄**，无需映射：<br>`bg-bg-elevated`(:56) · `bg-bg-base`(:54) · `bg-bg-sunken`(:55) · `bg-card`(:87) · `text-fg`(:58) · `text-fg-muted`(:59) · `text-fg-subtle`(:60) · `text-danger`(:70) · `bg-danger-soft`(:71) · `border-border`(:62) · `bg-brand`(:40) · `text-brand-on`(:43) · `bg-brand-hover`(:41) · `shadow-dialog`(:231) | `PC: tailwind.config.ts:37-118 / :217-245` |
| 7 | `transition-*` / `duration-*` / `active:scale-[0.96]` | PC `globals.css:408-414` 全局 `!important` 禁掉 `transition-property` / `animation` ⇒ web 这些类名在 PC 上**完全无效**（不是"效果弱一点"，是**一帧都不动**）。**抄了无害，但别指望有动效**，也别为"还原动效"去动 globals.css | `PC: globals.css:397-414` |
| 8 | web **通用 Sheet 组件**（`components/ui/sheet.tsx`）遮罩 `bg-bg-base/80 backdrop-blur-sm` | ⚠️ **别套用** —— 日程表单是**独立组件**（自己写 div，不走 Sheet 组件）⇒ 它的遮罩是 **`bg-black/60`**（`web:184`），**恰好与 PC 既有 BottomSheet 一致**（`PC: BottomSheet.tsx:154`）⇒ **直接抄 `bg-black/60` 即可**。<br>（PC 与 web 通用 Sheet 的遮罩差异是**有意保留**：改 PC 的会波及 ChatList / Browser / 通知设置等既有调用方 —— `PC: BottomSheet.tsx:38-42`） | `PC: components/ui/BottomSheet.tsx:38-42 / :154` |
| 9 | `rounded-t-2xl`（24px） | ✅ PC 有（`PC: tailwind.config.ts:155`）⇒ **直接抄**。另有 `rounded-squircle`(=22px, :156) 别名，但不是这个场景要用 | `PC: tailwind.config.ts:148-159` |

⚠️ **冲突类名用 `!` 前缀**（Tailwind 3.4.19），**不要 `!important`**。

---

## 8. B6 验收判据（照着勾，不许凭"看着能跑"）

### 8.1 12 组合逐格核（UI 层）

- [ ] delay 模式**只有** DDL 一项，**没有**类型/标题/责任人/提醒/状态/说明
- [ ] create/edit 两种 mode 的**类型** label 不同（「类型(由入口决定)」/「类型」）
- [ ] schedule：标题·开始日期·结束日期·开始时间·结束时间·责任人·备注·提醒块·底部说明·bound 提示 —— 10 项齐全
- [ ] schedule 改开始日期 → 结束日期跟随
- [ ] task：名称·说明·责任人·开始日期·开始时间·状态提示·截止时间·task 专属提示 —— 8 项，**且没有状态字段**
- [ ] subtask：名称·责任人·开始日期·开始时间·开始时间提示·截止时间·状态 —— 7 项，**没有说明 / 没有提醒**
- [ ] milestone：= subtask 全部 + 提醒块
- [ ] task 截止时间空值占位 = 「留空 = 不设截止」；subtask/milestone = 「留空 = 继承」
- [ ] task / schedule 的相关日期 `clearable={false}`；subtask/milestone 的开始日期**可清空**

### 8.2 校验（跑断言，不是肉眼看）

- [ ] 12 组合各跑一遍 `validateForm`，错误字典与 §4 表逐条对齐
- [ ] **create 子任务 + bound 越界 → 必须报错**（曾经跳过的那段）
- [ ] **create 关键节点 + bound 越界 → 必须报错**
- [ ] delay 模式打开时**不飘红**（「名称不能为空」不能出现）
- [ ] 同一天结束 ≤ 开始 → 报「结束时间必须晚于开始时间」
- [ ] 跨天日程（endDate > date）→ **不**报「结束时间必须晚于开始时间」

### 8.3 写入体

- [ ] schedule delay → body **只有** `ddl`
- [ ] task → body **不含** `status` / `statusOverride`
- [ ] subtask → body 含 `status`、**不含** `statusOverride`
- [ ] milestone / schedule → body 含 `statusOverride`
- [ ] 责任人**只有** `ownerType`，无 ownerId / ownerName
- [ ] 提醒同步：关+有→DELETE · 开+无→POST · 开+有+没变→**零请求**
- [ ] 提醒同步：task / subtask → **零请求**
- [ ] 编辑一个「本来没有提醒」的节点并保存 → **不凭空多出提醒**（易漏点 ⑨）

### 8.4 PC 侧工程约束

- [ ] 图标全部来自 `Glyphs.tsx`，**零内联 `<svg>`**
- [ ] 零 `cn` / `clsx` / `tailwind-merge` / `lucide-react`
- [ ] 遮罩 / 圆角 / 间距跟 PC 既有弹层组件口径一致
- [ ] `pnpm typecheck` 0
- [ ] 新增断言脚本**显式点名逐个跑**（PC 无 shell 通配，`node scripts/verify-*.mjs` 会 `MODULE_NOT_FOUND`）

---

## 9. 与其它批次的接口

| 本文件用到 | 来自 | 状态 |
|---|---|---|
| `scheduleFetch` / `scheduleFetchEnvelope` / `describeScheduleError` | `PC: lib/schedule-http.ts` | ✅ `9e4f6d8` |
| `scheduleLocalToIso` / `statusWriteBody` / `buildFlatIndex` / `effectiveDdl` | `PC: lib/schedule-api.ts` | ✅ `9e4f6d8` |
| `validateForm` / `ddlEmptyLabel` / `endDateOf` / `ymdOf` / `fmtDdl` / `FormBound` / `FormValues` | `PC: components/schedule/form/scheduleFormRules.ts` | ✅ `9e4f6d8`（与 web 逐字等价） |
| `initialValues` | `PC: components/schedule/form/scheduleFormInit.ts` | ✅ `9e4f6d8` |
| `scheduleBody` / `taskBody` / `milestoneBody` / `syncReminders` / `ddlIso` / `startAtIso` / `remindAtIso` | `PC: components/schedule/form/scheduleFormBody.ts` | ✅ `9e4f6d8` |
| `nextCreateKind` / `nextCreateLabel` / `KIND_LABEL` / `DetailKind` | `PC: components/schedule/detail/detailModel.ts` | ✅ `9e4f6d8` |
| `DatePickerField` / `TimePickerField` / `CustomSelect` / `PopPanel` / `usePopPosition` | web UI 层 | ❌ **B6 搬** |
| `ScheduleFormSheet` 本体 | web UI 层 | ❌ **B6 搬** |
| `ScheduleDdlOverrunDialog` | web UI 层 | ❌ **B6 搬**（DDL 越界预检弹窗 —— 已拍板 Q2：**要**） |
| `findBoardNode`（看板 bound 的来源） | web 看板页私有 | ⚠️ **B5 要自己实现**（§3.4） |

---

## 10. 已拍板的取舍点（PM 已拍，不用再问）

| # | 取舍 | 结论 |
|---|---|---|
| Q1 | 侧栏「日程中心」进去默认激活哪个 tab | 「今日待办」（跟 web） |
| Q2 | DDL 越界预检弹窗（web 独有） | **要**（web 独有 = 补齐安卓 = 三端齐） |
| Q3 | 树展开态持久化 | **做** localStorage（抄 web） |
| Q4 | `api.ts` 允许加 export | ✅ 已加 4 个（`API_BASE` / `getAccessToken` / `clearAuth` / `tryRefresh`） |
| Q5 | 要新画几个 Glyph | **8 个**（含 `CalendarClockIcon` + `ChevronLeftIcon`） |
