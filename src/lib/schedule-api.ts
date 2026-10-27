/**
 * 日程中心 — 数据访问层 + DTO 类型定义（唯一）
 *
 * ⚠️ 本文件是前端消费日程契约的唯一入口，契约变更成本必须压在这里。
 * 类型不要拆到别的文件。
 *
 * ⚠️ **PC 端移植说明** (2026-10-27 · 日程中心 B1 批):
 *   - 本文件从 gacode-web/src/lib/schedule-api.ts 移植, **DTO / 端点集合 / 归一化
 *     逻辑 / 图算法逐字沿用** (契约 F1: 42 method+path / 28 唯一路径)。
 *   - 唯一的结构差异 = 传输层 (./schedule-http): web 从 cookie 取 JWT,
 *     PC 的 accessToken 在**内存** (api.ts 的 getAccessToken) ⇒ 401 续期走
 *     api.ts 的 tryRefresh / clearAuth (单飞只有一份, 本域不复制)。
 *   - 本文件**不 import ./schedule-mocks** (契约 F4) —— PC 侧运行时也不读 fixture。
 *
 * 契约来源（从这两份文档逐字段抄，禁止从原型/mock 手抄）:
 *   - gaclaw/docs/design/schedule-center-design.md  (架构契约 · §4.2 端点表)
 *   - gaclaw/docs/design/schedule-center-ux-2026-10-20.md  §9.1 端点 / §9.4b 错误码 / §9.5 DTO
 *
 * 冻结 SHA: `a5e672bd28ccbe12d58e56f8ae15d984f201fb60` (2026-10-22 · 总 PM 口径 v14 —— subtask_breakdown 措辞与签名块逐字对齐(给已存在的子任务批量建关键节点, ⚠️ 不建子任务);签名 / DTO / 端点零变化 · 契约 commit a5e672b)
 *   - 契约文档内部把这一轮标为「v14 措辞对齐批」(§13.1.91-93) —— **以 SHA 为锚点**, 别靠版本号对齐。
 *   - 演进: v7 (砍 2 个 tree 端点) → v8 (逾期/继承派生值进 DTO, 决策 48)
 *     → v8.1 (四个 DTO 加 isOverdue, 决策 49 + archived 撤回只读 + now 口径消歧)
 *     → v8.2 (Omit 列举同步 —— 演进链止于此, 当前冻结以上一行 SHA 为准)
 *   - ⚠️ 本文件**只登记当前**冻结 SHA —— 多个历史 SHA 并存会让「漂移自检」失去唯一锚点;
 *     历史版本 SHA 查 gaclaw 仓: git log --oneline -- docs/design/schedule-center-ux-2026-10-20.md
 *   - ⚠️ 决策 48 / 49 的三个派生字段 (overdueAt / isOverdue / effectiveStatus) 在契约里
 *     已**必填**, 但本文件一律声明为**可选** —— 双轨消费: 后端出参就用后端口径,
 *     没出参就走本地兜底。改声明形态前先看 §D 双轨说明。
 *   - 本地 = origin/main = 服务器 /var/lib/gaclaw 三地一致
 *   - 端点数: 42 method+path / 28 唯一路径 (design §4.2 / §4.6 / UX §9.1)
 *   - 变更流程: 端 PM 提请求 → 总 PM 拍板 → 总 PM 更新文档 → 总 PM 发冻结摘要
 *   - 摘要里必须带 SHA, 便于下游对齐版本
 *
 * 数据流:
 *   组件 → 本文件 (api.* + 类型) → ./schedule-http (传输) → unified-api 真后端
 *   ⚠️ **运行时不再读 ./schedule-mocks** —— schedule-mocks.ts 已降级为
 *      「断言脚本专用 fixture」, 页面运行时不加载它。
 *   ⚠️ 后端出参经本文件的 normalize* 做**运行时映射**后再交给组件
 *      (startAt/endAt ISO→HH:mm / order 兜底 / cron expression→cronExpr)。
 *      不做映射的话 TS 照样编译通过, 但运行时全是 undefined。
 *
 * P4 (任务看板):
 *   - getBoard() 返回 { columns, serverTime } —— serverTime 是**响应级**字段 (信封顶层),
 *     倒计时必须用它当时间基准, 不信任设备本地时间 (契约 §6.2 注 / §9.5 末尾)。
 *   - ⚠️ 倒计时**不在本文件算** —— 展示层规则在 src/components/schedule/format.ts
 *     的 formatCountdown (契约 §6.2 四档表), 保持「数据层 / 展示层」分层。
 *
 * 验证: 跑 scripts/verify-schedule-endpoint-set.mjs
 *       (端点集合 ↔ 契约 §4.2 / UX §9 双向零差集 = 42 method+path / 28 唯一路径)
 *       (其余 verify-schedule-*.mjs 随 PC 后续批次逐支搬入)
 */

// ---------------------------------------------------------------------------
// 类型 (DTO) — 全部在文件顶部集中维护
// ---------------------------------------------------------------------------

/** 责任人严格两态。禁止第三态, 禁止空串, 禁止自由字符串。 */
export type OwnerType = "user" | "cody";

/** 状态枚举 — 后端契约 2026-10-20 终版: "pending" 而非 v5 的 "not_started".
 *  三个值严格收口, 不允许 null/空串/自定义值进入此项. */
export type ItemStatus = "pending" | "in_progress" | "done";

/** Owner 快照 — 命名沿用 user 表真实名字 + 'Cody' 字面量, 渲染层不再查表。 */
export interface OwnerSnapshot {
  ownerType: OwnerType;
  /**
   * ownerType === 'user' 时 = user 表主键 (number)。
   * ownerType === 'cody' 时 = null。
   * 类型从 v5 的 string 改为 number, 与后端 user 表主键一致 —— 联调必对齐, 不能含糊。
   */
  ownerId: number | null;
  /** UI 直接展示: 'Cody' 或 user 表真实名字 (例如 'gaga')。 */
  ownerName: string;
}

/**
 * 提醒子结构. Milestone (默认提醒模板) 与 ScheduleItem 共用这一个接口 ——
 *   同字段名 / 同类型 / 同结构, 不造第二个。
 *
 *   scheduleId / milestoneId 二选一: 挂在日程上时 = 该日程 id;
 *   关键节点的「默认提醒」时 = 该关键节点 id.
 *   channels 是**数组** (出参不是逗号串)。
 *
 *   v6 字段纠正:
 *     - at → remindAt (合同文案统一)
 *     - notified 拆成 enabled (启用) + fired (已触发) 两个独立状态
 *     - 加 offsetMinutes (相对偏移, 可负)
 */
export interface Reminder {
  id: string;
  /**
   * 二选一: 提醒挂在具体日程上时 = 该日程 id;
   * 关键节点的「默认提醒」时为空。
   */
  scheduleId?: string | null;
  /**
   * 二选一: 关键节点的「默认提醒」时 = 该关键节点 id;
   * 日程自己的提醒时为空。
   */
  milestoneId?: string | null;
  /** ISO datetime. */
  remindAt: string;
  /** 相对 remindAt 的偏移分钟 (可负 = 提前提醒)。null = 不偏移。 */
  offsetMinutes?: number | null;
  /** 推送渠道, 数组. 例: ["in_app"] / ["in_app","wechat"]。 */
  channels: string[];
  /** 是否启用 (用户可启用 / 禁用, 与已触发与否独立)。 */
  enabled: boolean;
  /** 是否已触发过 (调度层面的状态)。 */
  fired: boolean;
}

// ---------------------------------------------------------------------------
// 四层树
// ---------------------------------------------------------------------------

export interface Task extends OwnerSnapshot {
  id: string;
  title: string;
  /** 描述. API 出参叫 `desc` (DB 列名是 `description`, 出参映射成 desc). */
  desc?: string | null;
  /**
   * 截止时间 (ISO datetime). 可空 = 顶层不设截止.
   * mock-data 沿用原型 1:1 形态 (部分为空), 不要为了"看起来完整"补假数据.
   */
  ddl?: string | null;
  status: ItemStatus;
  /**
   * 开始时间 (ISO datetime) —— gaga P0-G / 决策 D3。
   *
   *   任务的状态**由后端按时间派生** (effectiveStatus), 所以任务要能表达「什么时候开始」。
   *   null / 缺失 = 没有开始时间 → 状态沿用原 status。
   *   ⚠️ 后端**已支持** (2026-10-22 实测): startAt 挂在 `taskExtraProps`
   *      (unified-api schedules.routes.js:88-94), 只进 Task 自己的 create/patch body ——
   *      契约 v9.2 起 POST /tasks 带 startAt **不再**被 ajv 剥掉 (v8 之前才是那样)。
   */
  startAt?: string | null;
  /**
   * 状态影子值 (gaga P0-G / 决策 D3) —— 与 Milestone / Schedule 同口径:
   *   null = 沿用派生 / 继承出来的状态。
   */
  statusOverride?: ItemStatus | null;
  /**
   * 后端派生的有效状态 (gaga P0-G / 决策 D3):
   *   startAt == null → 沿用原 status; 否则
   *     now < startAt → 未开始 / now < ddl → 进行中 / 已过 ddl → 已完成。
   *   ⚠️ 声明成**可选**: 后端 **v14 起恒出参** (schedules.dto.js 的 requireDerived
   *      缺参直接抛错); 保留可选 + 下游 `!== undefined` 双轨取值, 是为了让 PC 指向
   *      **旧版后端**时仍能本地兜底 (node.status), 不至于整页崩。
   */
  effectiveStatus?: ItemStatus;
  /**
   * v8 决策 48 (契约 §9.5): 派生字段 —— 逾期锚点 (ISO) = effectiveDdl。
   *   null = 无截止 → 永不逾期。**不落库**, 后端每次出参实时算。
   * ⚠️ 声明成**可选** (契约里是必填): 后端 **v14 起恒出参** (requireDerived 缺参抛错) ——
   *    缺失时走本地兜底判定 (见 buildScheduleTreeIndex 的双轨取值)。
   */
  overdueAt?: string | null;
  /**
   * v8.1 决策 49: 派生字段 —— 是否已逾期 (后端用 serverTime 算, 不信任设备本地时间)。
   * ⚠️ 同上: v14 起恒出参; 保留可选是为了**旧后端**兜底 → 走本地兜底。
   */
  isOverdue?: boolean;
  /** 独立维度 — 不是第四个 status. */
  archived: boolean;
  /** 归档时间 (ISO). archived=false 时为 null. */
  archivedAt?: string | null;
  order: number;
  /**
   * 子任务. 树端点返回时**递归展开到叶子** (children[].children[].children 也是
   * 完整 DTO, 到 ScheduleItem 为止, 含 reminders / statusOverride / owner* / status);
   * 扁平列表端点 (listTasks) 不返回这个字段.
   */
  children?: Subtask[];
  createdAt: string;
  updatedAt: string;
}

export interface Subtask extends OwnerSnapshot {
  id: string;
  taskId: string;
  title: string;
  desc?: string | null;
  /** 截止时间. 可空 = 继承所属任务. */
  ddl?: string | null;
  /**
   * v9.2 (契约 §2.1.2 / §9.5): 开始日期 + 开始时间合成的一个 ISO 时刻, **可空**;
   * 空 = 不设开始时间.
   * ⚠️ **不参与 DDL 继承 / 不改状态派生 / 不参与逾期判定** —— 只是本行自己的记录字段。
   */
  startAt?: string | null;
  status: ItemStatus;
  /**
   * v8 决策 48 (契约 §9.5): 派生字段 —— 逾期锚点 (ISO) = effectiveDdl。
   *   null = 无截止 → 永不逾期。**不落库**, 后端每次出参实时算。
   * ⚠️ 声明成**可选** (契约里是必填): 后端 **v14 起恒出参** (requireDerived 缺参抛错) ——
   *    缺失时走本地兜底判定 (见 buildScheduleTreeIndex 的双轨取值)。
   */
  overdueAt?: string | null;
  /**
   * v8.1 决策 49: 派生字段 —— 是否已逾期 (后端用 serverTime 算, 不信任设备本地时间)。
   * ⚠️ 同上: v14 起恒出参; 保留可选是为了**旧后端**兜底 → 走本地兜底。
   */
  isOverdue?: boolean;
  /** 独立维度 — 不是第四个 status (v6 补齐, 之前 listSubtasks 注释里已记). */
  archived: boolean;
  /** 归档时间. archived=false 时为 null. */
  archivedAt?: string | null;
  order: number;
  /** 关键节点. 递归展开到叶子, 同 Task.children. */
  children?: Milestone[];
  createdAt: string;
  updatedAt: string;
}

export interface Milestone extends OwnerSnapshot {
  id: string;
  subtaskId: string;
  title: string;
  /** 截止时间. 可空 = 继承所属子任务 → 所属任务. */
  ddl?: string | null;
  /**
   * v9.2 (契约 §2.1.2 / §9.5): 开始日期 + 开始时间合成的一个 ISO 时刻, **可空**;
   * 空 = 不设开始时间.
   * ⚠️ **不参与 DDL 继承 / 不改状态派生 / 不参与逾期判定** —— 只是本行自己的记录字段。
   */
  startAt?: string | null;
  /**
   * 状态影子值. 非空 = 覆盖继承到的父级 status;
   * null = 继承所属 Subtask (子任务) 的真实 status.
   * (Milestone / ScheduleItem 没有 status 字段; 完整状态机放在 Task / Subtask.)
   */
  statusOverride?: ItemStatus | null;
  /**
   * v8 决策 48 (契约 §9.5): 派生字段 —— statusOverride 为 null 时继承父链最近一个显式状态。
   *   **不落库**, 后端每次出参实时算。
   * ⚠️ 声明成**可选** (契约里是必填): 后端 **v14 起恒出参** (requireDerived 缺参抛错); 保留可选 + 双轨取值, 是为了让 PC 指向**旧版后端**时仍能本地兜底。
   */
  effectiveStatus?: ItemStatus;
  /**
   * v8 决策 48: 派生字段 —— 逾期锚点 (ISO) = effectiveDdl。null = 无截止 → 永不逾期。
   * ⚠️ 同上, 声明为可选 (v14 恒出参; 保留可选是为了**旧后端**兜底)。
   */
  overdueAt?: string | null;
  /**
   * v8.1 决策 49: 派生字段 —— 是否已逾期 (后端用 serverTime 算, 不信任设备本地时间)。
   */
  isOverdue?: boolean;
  /**
   * 子层能力不弱于叶子层 — 总 PM 硬规则: 子层 Milestone 也要带 reminders[]。
   * 与 ScheduleItem.reminders 同结构, 提醒是面向"截止时间"的概念。
   * Milestone.reminders 是「默认提醒模板」: 建日程时复制一份, 改它不影响已存在的日程。
   */
  reminders?: Reminder[];
  /** 独立维度 — 不是第四个 status. */
  archived: boolean;
  /** 归档时间. archived=false 时为 null. */
  archivedAt?: string | null;
  order: number;
  /** 日程. 递归展开到叶子, 同 Task.children. */
  children?: ScheduleItem[];
  createdAt: string;
  updatedAt: string;
}

/**
 * 日程 (叶子, 终态单元).
 *
 * 关键不变量 (契约 §9.5 终版 v6):
 *   - date **必填**. 没有任何日程"没有 date"。
 *   - startAt / endAt **必填** (HH:mm 形式). v6 取消「无时段」概念 ——
 *     每条日程在「按小时行展示」时间轴模型里都必须占一个明确时段。
 *     校验: endAt > startAt, 否则 422 SCHEDULE_TIME_RANGE_INVALID
 *     校验: startAt / endAt 的日期部分必须 === date, 否则 422 SCHEDULE_DATE_MISMATCH
 *   - milestoneId 可空. 空 = 游离日程; 用于「今日待办 / 日程中心」新建出口.
 *
 * date 与 ddl 语义不同, 两者都保留且可以不同:
 *   - date     = 日程落在哪个日历日 (必填, YYYY-MM-DD)
 *   - ddl      = 该日程的截止日 (可空, 留空继承父链)
 *     例: 日程定在 10-25, 但内部要求 10-22 前完成 → date=10-25 / ddl=10-22
 *   - startAt  = 占哪个具体小时
 *   - endAt    = 结束小时 (必须 > startAt)
 *
 * ⚠️ ScheduleItem 没有 status 字段; 有效状态经 statusOverride 承载
 *   (见 buildScheduleTreeIndex.effectiveStatus 的继承 / 回退规则).
 *
 * ⚠️ 已逾期口径**不变**: overdueAt = min(effectiveDdl, date 当天 23:59:59),
 *    startAt / endAt **不参与**逾期判定 (endAt 是用户排的时段结束时刻,
 *    把日程从 15:00 改到 18:00 不该改变它的逾期状态).
 */
export interface ScheduleItem extends OwnerSnapshot {
  id: string;
  /** 可空 = 游离日程 (不绑定任何父进度)。 */
  milestoneId?: string | null;
  title: string;
  note?: string | null;
  /** YYYY-MM-DD。必填。 */
  date: string;
  /** HH:mm。必填。 */
  startAt: string;
  /** HH:mm。必填, 且必须 > startAt。 */
  endAt: string;
  /**
   * 结束日期 (YYYY-MM-DD) —— **跨天日程的派生字段** (gaga P0-F / 决策 D2)。
   *
   * 后端 DTO **没有**这个字段 (契约只加 date / startAt / endAt 三件套, 不新增字段) ——
   * 但 endAt 是完整 ISO datetime, 它的**日期部分**就是结束日期。
   * PC 的 normalizeScheduleItem 把这个日期部分单独提出来存一份, 否则
   * startAt / endAt 被压成 HH:mm 之后跨天信息就丢了 (日历画不出跨天条)。
   *
   * **不落库、不回传** —— 写回时仍然只用 date + startAt + endAt。
   * 单天日程: endDate === date。
   */
  endDate?: string;
  /** 截止日 (ISO datetime). 可空 = 继承关键节点 → 子任务 → 任务. */
  ddl?: string | null;
  /**
   * 状态影子值. 叶子日程没有 status 字段; effectiveStatus 规则:
   *   - statusOverride 非空  → 取该值
   *   - statusOverride = null + 有 milestoneId → 继承所属 Milestone.effectiveStatus
   *   - statusOverride = null + 无 milestoneId (游离) → pending
   */
  statusOverride?: ItemStatus | null;
  /**
   * v8 决策 48 (契约 §9.5): 派生字段 —— statusOverride 为 null 时继承关键节点的 effectiveStatus。
   *   **不落库**, 后端每次出参实时算。
   * ⚠️ 声明成**可选** (契约里是必填): 后端 **v14 起恒出参** (requireDerived 缺参抛错); 保留可选 + 双轨取值, 是为了让 PC 指向**旧版后端**时仍能本地兜底。
   */
  effectiveStatus?: ItemStatus;
  /**
   * v8 决策 48: 派生字段 —— 逾期锚点 (ISO) = min(effectiveDdl, date 当天 23:59:59)。
   *   null = 无截止 → 永不逾期。
   * ⚠️ 同上, 声明为可选 (v14 恒出参; 保留可选是为了**旧后端**兜底)。
   */
  overdueAt?: string | null;
  /**
   * v8.1 决策 49: 派生字段 —— 是否已逾期 (后端用 serverTime 算, 不信任设备本地时间)。
   */
  isOverdue?: boolean;
  /** 独立维度 — 不是第四个 status. */
  archived: boolean;
  /** 归档时间. archived=false 时为 null. */
  archivedAt?: string | null;
  /** 日程自己的提醒 (不是从 Milestone.reminders 模板继承的——是日程自己注册的). */
  reminders?: Reminder[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 四层树的图算法 — effectiveDdl / effectiveStatus / overdueAt / isOverdue
//
//   口径来源: 总 PM 2026-10-20 拍板 (核对 prisma model 后二次更正), 逐字照抄:
//
//     effectiveDdl(Task)      = Task.ddl                       // 留空 = null (顶层)
//     effectiveDdl(Subtask)   = Subtask.ddl   ?? effectiveDdl(所属 Task)
//     effectiveDdl(Milestone) = Milestone.ddl ?? effectiveDdl(所属 Subtask)
//     effectiveDdl(Schedule)  = Schedule.ddl  ?? effectiveDdl(所属 Milestone)
//                                                ?? effectiveDdl(所属 Subtask)
//                                                ?? effectiveDdl(所属 Task)
//     游离日程 (milestoneId=null) 且自身 ddl 为空 → null
//
//     overdueAt(node):
//       Task / Subtask / Milestone → effectiveDdl          (null = 无截止, 永不逾期)
//       Schedule                  → min(effectiveDdl, date 当天 23:59:59)
//                                   effectiveDdl 为 null 时只取 date 当天结束时刻
//
//     已逾期 = effectiveStatus !== 'done' && overdueAt < now()   (实时计算, 不落库)
//
//   ⚠️ endAt **不参与**逾期判定: endAt 是用户排的时段结束时刻, 不是承诺的截止日 ——
//      把日程从 15:00 改到 18:00 不该改变它的逾期状态.
//
//   层级约束 (创建 / 编辑子级时校验, P6 表单落地后接):
//     child.effectiveDdl != null && parent.effectiveDdl != null
//       && child.effectiveDdl > parent.effectiveDdl → 422 DDL_EXCEEDS_PARENT
//     ⚠️ 比的是 effectiveDdl, 不是「自身 ddl vs 父级自身 ddl」—— 继承场景会对不上.
//     ⚠️ Schedule 有两个字段同时受父级约束: schedule.ddl ≤ 父级 effectiveDdl,
//        且 schedule.date ≤ 父级 effectiveDdl 所在日 (按日比).
//        父级 effectiveDdl 为 null → 两者都不限; 游离日程不受任何父级约束.
// ---------------------------------------------------------------------------

/** 四层树的任意一层. effectiveDdl 等函数对全部四层通用. */
export type ScheduleNode = Task | Subtask | Milestone | ScheduleItem;

/**
 * ScheduleTreeIndex — 把三张父表包成一个查找器, 避免每次调用都现建 Map.
 *
 *   数据来源是三个扁平列表 (listTasks / listSubtasks / listMilestones) +
 *   ScheduleItem 自带的 parentId (taskId / subtaskId / milestoneId).
 *   `children` 字段只在树端点返回时才出现; 本轮 mock 走扁平列表不填它 ——
 *   同一份数据不同时存两遍, 免得双写漂移.
 */
export interface ScheduleTreeIndex {
  /** 直属父级; 游离日程 / 顶层任务 = null. */
  parentOf: (node: ScheduleNode) => ScheduleNode | null;
  /** 继承链上的有效截止日; null = 不设截止. */
  effectiveDdl: (node: ScheduleNode) => string | null;
  /** 有效状态 (自身 status, 被 statusOverride 影子值覆盖时以影子值为准). */
  effectiveStatus: (node: ScheduleNode) => ItemStatus;
  /** 逾期判定用的时刻 (epoch ms); null = 永不逾期. */
  overdueAt: (node: ScheduleNode) => number | null;
  /** 已逾期 = 未完成 && overdueAt < now. */
  isOverdue: (node: ScheduleNode, now: Date) => boolean;
  /** 祖先链标题 (根 → 直接父级) = 卡片上的「任务 · 子任务 · 关键节点」. */
  chainTitles: (node: ScheduleNode) => string[];
  /** 截止日是继承来的 (自身 null 但父链有值). */
  isInheritedDdl: (node: ScheduleNode) => boolean;
}

/** ISO 字符串 → epoch ms; 解析不了返回 null (而不是让 NaN 渗进比较). */
function parseDdlMs(ddl: string | null | undefined): number | null {
  if (!ddl) return null;
  const t = new Date(ddl).getTime();
  return Number.isNaN(t) ? null : t;
}

// ---------------------------------------------------------------------------
// 双轨取值 —— 后端 DTO 出参优先, 字段缺失才回退本地图算法
//
//   契约来源: UX §9.5 v8 决策 48 / v8.1 决策 49 (SHA a5e672b)
//     - 四个 DTO (Task / Subtask / Milestone / Schedule) 都加 overdueAt: string | null
//     - Milestone / Schedule 再加 effectiveStatus; Task / Subtask **不加**
//       (status 本身就是手工真值, 任务无父级)
//   追加: 总 PM 2026-10-20 消息正文「v8.1 决策 49」—— 四个 DTO 都加 isOverdue: boolean
//     (契约 v8.1/v8.2 **已落盘** @ a5e672b; 字段在本文件一律声明为可选 —— 双轨兜底)
//
//   ⚠️ 后端出参这三个字段**已上线** (unified-api schedules.dto.js:104-201 实时算好下发)
//      → 线上实际走的是**后端口径**这一支; 本地兜底分支仍在, 是给「后端没出参」的
//      旧版本 / 降级场景兜底。PC **不需要再发一次版** 就能跟着后端切口径。
//
//   三态区分 (双轨能自动切换的关键 —— 别用 `?? null` 一把糊掉):
//     - 字段**不存在** (normalize 时不写入该 key) → 后端没出参 → 本地兜底
//     - 字段存在且为 null                          → 后端权威地说「无截止」→ 用它
//     - 字段存在且有值                            → 后端口径 → 用它
// ---------------------------------------------------------------------------

/** DTO 上的派生字段 (只有后端出参时才存在)。 */
interface ScheduleDerived {
  overdueAt?: string | null;
  isOverdue?: boolean;
  effectiveStatus?: ItemStatus;
}

const derivedOf = (node: ScheduleNode): ScheduleDerived =>
  node as unknown as ScheduleDerived;

/**
 * 后端给的 effectiveStatus (只有 Milestone / Schedule 的 DTO 带)。
 *   null = 字段缺失或非法值 → 本地兜底。
 */
function dtoEffectiveStatus(node: ScheduleNode): ItemStatus | null {
  const v = derivedOf(node).effectiveStatus;
  return v === "pending" || v === "in_progress" || v === "done" ? v : null;
}

/**
 * 后端给的 overdueAt (epoch ms)。
 *   undefined = **字段缺失** → 本地兜底
 *   null      = 后端权威地说「无截止 → 永不逾期」
 *   number    = 逾期锚点
 */
function dtoOverdueAtMs(node: ScheduleNode): number | null | undefined {
  if (!("overdueAt" in node)) return undefined;
  const raw = derivedOf(node).overdueAt;
  if (raw === null || raw === undefined) return null;
  const ms = parseDdlMs(raw);
  // 解析不了 (非法 ISO) → 当字段不可用, 退回本地兜底; 不擅自判成「无截止」
  return ms === null ? undefined : ms;
}

/** 后端给的 isOverdue; undefined = 字段缺失 → 本地兜底。 */
function dtoIsOverdue(node: ScheduleNode): boolean | undefined {
  if (!("isOverdue" in node)) return undefined;
  const raw = derivedOf(node).isOverdue;
  return typeof raw === "boolean" ? raw : undefined;
}

/**
 * 后端给的 chainTitles —— ⚠️ **契约 §9.5 没有这个字段**, 后端**不会**给:
 *   父链上下文标题是端侧自算的**展示辅助**, 不是判定值 —— 只有「逾期 / 状态判定」
 *   才交给后端 (契约 §2.1.3 v8 决策 48)。
 *   这里保留读取口只为让「判定字段」与「展示字段」的边界在代码里形状统一;
 *   实际恒不命中 → chainTitles 永远走本地自算。
 */
function dtoChainTitles(node: ScheduleNode): string[] | undefined {
  const v = (node as unknown as { chainTitles?: unknown }).chainTitles;
  if (!Array.isArray(v)) return undefined;
  return v.every((x) => typeof x === "string") ? (v as string[]) : undefined;
}

/**
 * buildScheduleTreeIndex — 三个扁平列表 → 查找器.
 *
 *   沿 parentId **向上迭代**取父级, 不是 children DFS: 扁平列表没有 children,
 *   向上迭代对两种数据都成立; 继承链最长 4 层, O(4)。
 *   parentOf 的结果做 memo —— 一张卡片要连问 effectiveDdl / overdueAt / chainTitles,
 *   P4 看板一次会问上千次, 别每次重走链。
 */
export function buildScheduleTreeIndex(input: {
  tasks: Task[];
  subtasks: Subtask[];
  milestones: Milestone[];
}): ScheduleTreeIndex {
  const taskById = new Map(input.tasks.map((t) => [t.id, t]));
  const subtaskById = new Map(input.subtasks.map((s) => [s.id, s]));
  const milestoneById = new Map(input.milestones.map((m) => [m.id, m]));
  const parentMemo = new Map<ScheduleNode, ScheduleNode | null>();

  const parentOf = (node: ScheduleNode): ScheduleNode | null => {
    const cached = parentMemo.get(node);
    if (cached !== undefined) return cached;
    let parent: ScheduleNode | null = null;
    if ("subtaskId" in node) {
      parent = subtaskById.get(node.subtaskId) ?? null; // Milestone → Subtask
    } else if ("taskId" in node) {
      parent = taskById.get(node.taskId) ?? null; // Subtask → Task
    } else if ("milestoneId" in node && node.milestoneId) {
      // ScheduleItem → Milestone (游离日程 milestoneId=null → null)
      parent = milestoneById.get(node.milestoneId) ?? null;
    }
    // Task = 顶层, 无父级
    parentMemo.set(node, parent);
    return parent;
  };

  /** 每层都继承父链: 自身留空就往上找, 走到底仍无值 = 不设截止. */
  const effectiveDdl = (node: ScheduleNode): string | null => {
    let cur: ScheduleNode | null = node;
    while (cur) {
      if (cur.ddl) return cur.ddl;
      cur = parentOf(cur);
    }
    return null;
  };

  const isInheritedDdl = (node: ScheduleNode): boolean => !node.ddl && !!effectiveDdl(node);

  /**
   * effectiveStatus — 状态继承 / 回退规则 (契约 §9.5 终版 + PM 拍板):
   *
   *   1. Task / Subtask  → 自身 status (必填; 不继承).
   *   2. Milestone       → statusOverride 不为空 ? statusOverride
   *                                  : 继承所属 Subtask.status
   *                                  : 无父级则 pending.
   *   3. Schedule (叶子) → statusOverride 不为空 ? statusOverride
   *                                  : 有 milestoneId → 继承所属 Milestone.effectiveStatus
   *                                  : 无 milestoneId (游离) → pending.
   *
   *   ❗ 跟原型的差别: 原型沿父级继承 status + 叶子用 statusOverride 打影子;
   *      新契约 Milestone / ScheduleItem 没 status 字段, 继承语义更干净。
   *      "叶子完成 / 父级进行中"不再被父级覆盖; 历史样例 sc15 (已完成叶子挂在进行中关键节点下)
   *      现在判为 done, 符合 UI 期望。
   */
  const effectiveStatus = (node: ScheduleNode): ItemStatus => {
    // ① 后端口径优先 (契约 v8 决策 48: 只有 Milestone / Schedule 的 DTO 带 effectiveStatus)。
    //    旧后端还没出参时这一支恒不命中 → 走 ② 本地兜底, 行为与改造前逐字一致。
    const dto = dtoEffectiveStatus(node);
    if (dto) return dto;
    // ② 本地兜底 —— 口径逐字照抄 §2.1.3
    if ("date" in node) {
      // Schedule 叶子
      if (node.statusOverride) return node.statusOverride;
      if (!node.milestoneId) return "pending";
      const parent = parentOf(node);
      if (!parent) return "pending";
      return effectiveStatus(parent);
    }
    if ("subtaskId" in node) {
      // Milestone — 继承 Subtask.status
      if (node.statusOverride) return node.statusOverride;
      const parent = parentOf(node);
      if (!parent || !("status" in parent)) return "pending";
      return parent.status;
    }
    // Task / Subtask — 自身 status 必填
    return node.status;
  };

  const overdueAt = (node: ScheduleNode): number | null => {
    // ① 后端口径优先 (契约 v8 决策 48: 四个 DTO 都带 overdueAt)。
    //    旧后端还没出参时这一支恒不命中 → 走 ② 本地兜底, 行为与改造前逐字一致。
    const dto = dtoOverdueAtMs(node);
    if (dto !== undefined) return dto;
    // ② 本地兜底
    const ddlMs = parseDdlMs(effectiveDdl(node));
    if (!("date" in node)) return ddlMs; // Task / Subtask / Milestone: 只看 effectiveDdl
    // ScheduleItem: min(effectiveDdl, date 当天 23:59:59)
    // date 是本地日历日 (不带时区), 用本地时间构造当天结束时刻, 避免 UTC 下 shift
    const dayEnd = parseDdlMs(`${node.date}T23:59:59`);
    if (ddlMs === null) return dayEnd;
    if (dayEnd === null) return ddlMs;
    return Math.min(ddlMs, dayEnd);
  };

  const isOverdue = (node: ScheduleNode, now: Date): boolean => {
    // ① 后端口径优先 (契约 v8.1 决策 49: 四个 DTO 都带 isOverdue;
    //    后端用 serverTime 算好 —— 契约 §2.1.3: now 取 server 端 serverTime, 不信任设备本地时间)。
    //    旧后端还没出参时这一支恒不命中 → 走 ② 本地兜底, 行为与改造前逐字一致。
    const dto = dtoIsOverdue(node);
    if (dto !== undefined) return dto;
    // ② 本地兜底
    if (effectiveStatus(node) === "done") return false;
    const at = overdueAt(node);
    if (at === null) return false;
    return at < now.getTime();
  };

  const chainTitles = (node: ScheduleNode): string[] => {
    // ⚠️ 契约 §9.5 **没有** chainTitles 字段 —— 后端**不会**给:
    //    父链上下文标题是端侧自算的**展示辅助**, 不是判定值 (只有「逾期 / 状态判定」交后端)。
    //    双轨形状保留, 实际恒不命中 → 永远走本地自算。
    const dto = dtoChainTitles(node);
    if (dto) return dto;
    const out: string[] = [];
    let cur = parentOf(node);
    while (cur) {
      out.unshift(cur.title);
      cur = parentOf(cur);
    }
    return out;
  };

  return {
    parentOf,
    effectiveDdl,
    effectiveStatus,
    overdueAt,
    isOverdue,
    chainTitles,
    isInheritedDdl,
  };
}

/**
 * describeDdl — 继承型截止日的 UI 显示口径 (P4 看板 / P5 详情页复用同一个函数).
 *
 *   继承判定: node.ddl == null && effectiveDdl != null;
 *   显示成 `继承自 <父级层级名> · <时间>`, 不留空白 ——
 *   跟关键节点已有的「继承自子任务 · 10月28日 18:00」体验一致。
 *
 *   kindLabel / fmtTime 由调用方注入, 保持本文件零展示层依赖。
 */
export function describeDdl(
  node: ScheduleNode,
  index: ScheduleTreeIndex,
  kindLabel: (parent: ScheduleNode) => string,
  fmtTime: (iso: string) => string,
): { text: string; inherited: boolean } {
  if (node.ddl) return { text: fmtTime(node.ddl), inherited: false };
  const eff = index.effectiveDdl(node);
  if (!eff) return { text: "", inherited: false };
  const parent = index.parentOf(node);
  return {
    text: `继承自${parent ? kindLabel(parent) : "上级"} · ${fmtTime(eff)}`,
    inherited: true,
  };
}

// ---------------------------------------------------------------------------
// 定时任务 (CronJob) — 独立实体, 不属于任务树
// ---------------------------------------------------------------------------

/**
 * 定时任务 (用户侧只读):
 *   - 只能由 Cody 通过 LLM 创建, 用户不能新建/编辑.
 *   - UI 上只保留 暂停·启用 + 删除 三种交互, 严禁出现"编辑".
 *   - ownerType 恒为 'cody' (即使是 user 提的关键词触发).
 */
export interface CronJob {
  id: string;
  title: string;
  /** 5 段 cron: 分 时 日 月 周. 例如 "0 9 * * *" = 每天 09:00。 */
  cronExpr: string;
  nextRunAt: string;
  state: "active" | "paused";
  /** 字面量 'cody' — 故意锁死, 用户不能写 cron。 */
  ownerType: "cody";
  createdAt: string;
  /**
   * ---- 以下 5 个字段是**后端 cronDto 一直在下发、但旧版 DTO 没接**的 ----
   * 契约来源: gaclaw/docs/design/schedule-center-ux-2026-10-20.md §2.2.2 Cron 数据模型
   *   (title / expression / timezone / prompt / status / nextRunAt / lastRunAt /
   *    ownerType / ownerId / ownerName / createdAt)
   * 后端出参真源: unified-api/src/modules/schedules/schedules.dto.js:211-226 `cronDto`
   * 详情页 (原型 v6 §B4「定时任务详情页 — 只读」) 要显示「规则 / 时区 / 下次运行 / 上次运行 /
   * 执行内容」, 所以这里把后端**已经发了**的字段接住 —— 是**补消费**, 不是改契约。
   */
  /** 后端算好的人话描述 (cronDto.description, 例如「每天 09:00」); 没有就用端上 describeCron。 */
  description?: string | null;
  /** 时区 (cronDto.timezone), 后端缺省 Asia/Shanghai。 */
  timezone?: string | null;
  /** 触发时交给 Cody 的指令 (cronDto.prompt) —— 「执行内容」分组显示它。 */
  prompt?: string | null;
  /** 上次实际执行时刻 (cronDto.lastRunAt); null = 尚未运行。 */
  lastRunAt?: string | null;
  /** 责任人显示名快照 (cronDto.ownerName)。 */
  ownerName?: string | null;
  /**
   * cron 产出回到**哪个三端对话 session** (契约 v10 决策 B —— UX §2.2.2 / §9.5, SHA a5e672b)。
   *
   *   - DB 列 = `origin_session_id BigInt?` (可空、无默认值) —— unified-api `UserCron.originSessionId`
   *   - **DTO 出参 = 字符串化** (`string | null`) —— Prisma BigInt 不能直接 JSON 序列化,
   *     后端 cronDto 走 `String(row.originSessionId)`; null = **未归属** (老 cron 保持 null)
   *   - **只读** —— 服务端按创建上下文写, 不进 POST / PATCH 的 body schema
   *
   * ⚠️ 后端出参字段名**就是** camelCase `originSessionId` —— 本文件**不做** snake→camel 转换,
   *    normalizeCronJob 直接同名读 (别假设, 读 unified-api schedules.dto.js cronDto 确认过)。
   */
  originSessionId?: string | null;
}

// ---------------------------------------------------------------------------
// 视图投影
// ---------------------------------------------------------------------------

/**
 * 今日待办 (原型 §2.1.4 + 契约 v6 — 五个桶):
 *   overdue / morning / afternoon / evening / done.
 *
 * v6 取消了「无时段」分组 —— 所有日程都必填 startAt / endAt,
 * 不存在"无时段"事件, 所以也不再需要 untimed 占位桶。
 *
 * 分桶口径:
 *   done     ← effectiveStatus === "done"
 *   overdue  ← 非 done && tree.isOverdue(i, now)
 *   morning  ← startAt 00:00–12:00
 *   afternoon← startAt 12:00–18:00
 *   evening  ← startAt 18:00–24:00
 */
export interface TodayScheduleBuckets {
  overdue: ScheduleItem[];
  morning: ScheduleItem[];
  afternoon: ScheduleItem[];
  evening: ScheduleItem[];
  done: ScheduleItem[];
}

// ---------------------------------------------------------------------------
// API 端点形状 (冻结, 总 PM 已拍板)
//   - 此处只声明 endpoint 形态, 不实现; 切换 unified-api 后只填函数体.
//   - 后续如果端点形状需要变, 改这两处 + 后端 sync; 类型字段变更只改本文件顶部.
// ---------------------------------------------------------------------------

/**
 * 冻结端点清单 (总 PM 2026-10-20 冻结, 42 method+path / 28 唯一路径,
 * SHA a5e672b).
 *
 * 演进史:
 *   - v5 起点: 41 method+path / 28 唯一路径
 *   - v6 砍 GET /{tasks,subtasks}/:id/tree (children 已经是唯一树形载体,
 *     详情端点 GET /tasks/:id 等直接返回带 children 递归展开的实体 DTO),
 *     中间态 = 39 / 26
 *   - v6 同时补齐 milestone 侧三条 reminder 端点 (默认提醒模板):
 *     POST / PATCH / DELETE /milestones/:id/reminders[/rid]
 *   - v6 终值: **42 method+path / 28 唯一路径** (PATCH 和 DELETE 的
 *     milestones/{reminders/:rid} 与 schedules/{reminders/:rid} 各共享同一条
 *     路径模板, 按契约"唯一路径"口径算一份)
 *
 * 两份设计文档三地一致 SHA a5e672b。
 *
 * ⚠️ 本轮 mock 期间**不真接**, 这里只登记形状; 切换 unified-api 时按表填函数体。
 * ⚠️ 三条对 UI 有硬约束的规则, 别在实现里踩:
 *   ① 用户端**不存在** POST /crons, cron 也没有编辑语义的 PATCH ——
 *      创建 / 编辑只走 Cody 的 LLM tool (/api/v1/yinternal/schedules/crons)。
 *      → 今日待办的 cron 分组永远不能出现「新建」或「编辑」入口。
 *      (PATCH /crons/:id 只接受 {status:'paused'|'active'}, 带其它字段 = 400 CRON_UPDATE_FORBIDDEN)
 *   ② DELETE 是**级联硬删**, 不是归档: 删任务连带删子节点, 删子任务连带删关键节点 + 日程,
 *      删关键节点连带删日程, 删日程硬删不可恢复 (cron 无 archived 概念)。
 *      → 任何删除入口的确认文案都要写清「会一并删除下级」。
 *   ③ 归档 / 恢复 / 已归档列表全部走**带实体前缀**的路径
 *      (tasks|subtasks|milestones|schedules), 裸路径形态已废弃。
 *
 *   GET    /today                          今日待办的日程部分 (date=今天 + 逾期未完成); cron 不在此
 *   GET    /schedules?from=&to=            时间窗 (日 / 周 / 月 共用)
 *   GET    /board                          4 列 {pending,in_progress,done,overdue}; overdue 后端算一次
 *   GET    /tasks                          任务列表, 每项带 children[] 递归到叶子;
 *                                         createdAt 倒序; 无分页, 上限 200
 *   GET    /tasks/:id                      单条 (带 children[])
 *   POST   /tasks                          建任务
 *   PATCH  /tasks/:id                      改任务 (改父级不校验子级)
 *   DELETE /tasks/:id                      删任务 → 级联删子节点
 *   POST   /subtasks                       建子任务 (taskId 必填)
 *   PATCH  /subtasks/:id                   改子任务
 *   DELETE /subtasks/:id                   删子任务 → 级联删关键节点 + 日程
 *   POST   /milestones                     建关键节点 (subtaskId 必填, 可带 reminders[])
 *   PATCH  /milestones/:id                 改关键节点
 *   DELETE /milestones/:id                 删关键节点 → 级联删日程
 *   POST   /milestones/:id/reminders        加默认提醒模板 (v6 新增)
 *   PATCH  /milestones/:id/reminders/:rid   改默认提醒模板 (v6 新增)
 *   DELETE /milestones/:id/reminders/:rid   删默认提醒模板 (v6 新增)
 *   POST   /schedules                      建日程 (milestoneId 可空 = 游离; date 必填)
 *   PATCH  /schedules/:id                  改日程
 *   DELETE /schedules/:id                  删日程, 硬删
 *   POST   /{tasks|subtasks|milestones|schedules}/:id/archive     归档 (4 个)
 *   POST   /{tasks|subtasks|milestones|schedules}/:id/restore    恢复 (4 个)
 *   GET    /{tasks|subtasks|milestones|schedules}/archived       已归档列表 (4 个)
 *   GET    /crons[?from=&to=]              全部 cron 含 paused; from/to 是同路由可选 query
 *   PATCH  /crons/:id                      只接受 {status:'paused'|'active'}
 *   DELETE /crons/:id                      硬删不可恢复
 *   POST   /schedules/:id/reminders        加提醒
 *   PATCH  /schedules/:id/reminders/:rid   改提醒
 *   DELETE /schedules/:id/reminders/:rid   删提醒
 */
export type ScheduleEndpoint =
  | "GET /api/v1/schedules/today"
  | "GET /api/v1/schedules/schedules?from=&to="
  | "GET /api/v1/schedules/board"
  | "GET /api/v1/schedules/tasks"
  | "GET /api/v1/schedules/tasks/:id"
  | "POST /api/v1/schedules/tasks"
  | "PATCH /api/v1/schedules/tasks/:id"
  | "DELETE /api/v1/schedules/tasks/:id"
  | "POST /api/v1/schedules/subtasks"
  | "GET /api/v1/schedules/subtasks/:id"
  | "PATCH /api/v1/schedules/subtasks/:id"
  | "DELETE /api/v1/schedules/subtasks/:id"
  | "POST /api/v1/schedules/milestones"
  | "GET /api/v1/schedules/milestones/:id"
  | "PATCH /api/v1/schedules/milestones/:id"
  | "DELETE /api/v1/schedules/milestones/:id"
  | "POST /api/v1/schedules/milestones/:id/reminders"
  | "PATCH /api/v1/schedules/milestones/:id/reminders/:rid"
  | "DELETE /api/v1/schedules/milestones/:id/reminders/:rid"
  | "POST /api/v1/schedules/schedules"
  | "GET /api/v1/schedules/schedules/:id"
  | "PATCH /api/v1/schedules/schedules/:id"
  | "DELETE /api/v1/schedules/schedules/:id"
  | "GET /api/v1/schedules/crons?from=&to="
  | "GET /api/v1/schedules/crons/:id"
  | "PATCH /api/v1/schedules/crons/:id"
  | "DELETE /api/v1/schedules/crons/:id"
  | "POST /api/v1/schedules/schedules/:id/reminders"
  | "PATCH /api/v1/schedules/schedules/:id/reminders/:rid"
  | "DELETE /api/v1/schedules/schedules/:id/reminders/:rid"
  | "POST /api/v1/schedules/tasks/:id/archive"
  | "POST /api/v1/schedules/tasks/:id/restore"
  | "POST /api/v1/schedules/subtasks/:id/archive"
  | "POST /api/v1/schedules/subtasks/:id/restore"
  | "POST /api/v1/schedules/milestones/:id/archive"
  | "POST /api/v1/schedules/milestones/:id/restore"
  | "POST /api/v1/schedules/schedules/:id/archive"
  | "POST /api/v1/schedules/schedules/:id/restore"
  | "GET /api/v1/schedules/tasks/archived"
  | "GET /api/v1/schedules/subtasks/archived"
  | "GET /api/v1/schedules/milestones/archived"
  | "GET /api/v1/schedules/schedules/archived";

/** 归档 / 恢复 8 个端点 (notImplemented 占位沿用这个子集). */
export type ArchiveEndpoint = Extract<
  ScheduleEndpoint,
  `POST /api/v1/schedules/${string}/${"archive" | "restore"}`
>;

// ---------------------------------------------------------------------------
// 写入 (Write) 类型 — 用 Omit 从 DTO 派生, 不手写第二套 (契约 v6 新规则)。
//
//   派生规则:
//     - children 派生只读 → 不可写 (服务端 body schema 不声明,
//       会被 ajv removeAdditional 剥掉)
//     - createdAt / updatedAt / archivedAt 服务端填充 → 不可写
//     - overdueAt / isOverdue / effectiveStatus 是 v8 决策 48 + v8.1 决策 49 的**派生只读**字段
//       (后端实时算出参) → 同样不可写, 一律不进 POST / PATCH 的 body schema
//     - reminders: Milestone (POST 可带 reminders 默认模板) / ScheduleItem (POST 可带)
//       不剔除;
//       PATCH 不接受 reminders (改提醒走独立的 3 条 reminder 端点),
//       在对应 PATCH 函数入参类型里再 Omit 一层或显式 exclude。
//
//   PATCH 语义 (契约 v6 硬规则, 写进注释):
//     ① 只接受可写字段 (TaskWrite / SubtaskWrite / MilestoneWrite / ScheduleWrite)
//     ② 请求体里**没带的字段保持不变** (不是置空)
//     ③ 要清空某字段**必须显式传 `null`**; 不传 = 不变
// ---------------------------------------------------------------------------

export type TaskWrite = Omit<
  Task,
  "children" | "createdAt" | "updatedAt" | "archivedAt" | "overdueAt" | "isOverdue"
>;
export type SubtaskWrite = Omit<
  Subtask,
  "children" | "createdAt" | "updatedAt" | "archivedAt" | "overdueAt" | "isOverdue"
>;
export type MilestoneWrite = Omit<
  Milestone,
  | "children"
  | "createdAt"
  | "updatedAt"
  | "archivedAt"
  | "overdueAt"
  | "isOverdue"
  | "effectiveStatus"
>;
export type ScheduleWrite = Omit<
  ScheduleItem,
  | "createdAt"
  | "updatedAt"
  | "archivedAt"
  | "overdueAt"
  | "isOverdue"
  | "effectiveStatus"
>;

/** PATCH 入参: 排除 reminders, 改提醒要走 POST/PATCH/DELETE /schedules/:id/reminders。 */
export type SchedulePatch = Omit<ScheduleWrite, "reminders">;

/** Milestone PATCH 入参: 同样排除 reminders, 改提醒要走
 *  POST/PATCH/DELETE /milestones/:id/reminders[/:rid] 三条独立端点 —— 这是
 *  PATCH /milestones/:id (改关键节点本体) ≠ PATCH /milestones/:id/reminders/:rid
 *  (改默认提醒模板) 的契约强制区分。 */
export type MilestonePatch = Omit<MilestoneWrite, "reminders">;
// ---------------------------------------------------------------------------
// 数据访问实现 — 全部走 unified-api 真后端 (unified-api/src/modules/schedules/)
//
//   ⚠️ 本文件**不再 import ./schedule-mocks** —— 运行时数据源已整体切到真后端。
//      schedule-mocks.ts 降级成「断言脚本专用 fixture」, 页面运行时不读它。
//
//   ⚠️ 下面的 normalize* 是**运行时映射**, 不是类型断言。
//      后端 schedules.dto.js 直返 camelCase, 但有 3 处跟本文件 DTO 的**字段形态**不一致,
//      不映射的话 TS 照样编译通过、运行时全是 undefined:
//        ① startAt / endAt —— DTO 注释写 "HH:mm", 后端 iso() 出的是**完整 ISO datetime**。
//           日历按小时行定位走 hhmmToMin() (calendar-utils.ts:61, 按 ":" 切), 收到 ISO 会算出 NaN。
//        ② order —— 后端 taskDto/subtaskDto/milestoneDto **根本不输出 order**, 按它排序会乱。
//        ③ CronJob —— 后端是 { expression, status }, 本文件 DTO 是 { cronExpr, state }。
// ---------------------------------------------------------------------------

import {
  SCHEDULE_API_BASE,
  ScheduleApiError,
  describeScheduleError,
  isScheduleApiError,
  scheduleFetch,
  scheduleFetchEnvelope,
} from "./schedule-http";

export { SCHEDULE_API_BASE, ScheduleApiError, describeScheduleError, isScheduleApiError };

// =========================================================================
// 运行时映射 (后端 wire → 本文件 DTO)
// =========================================================================

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * ISO datetime → "HH:mm" 本地墙钟。
 *
 *   幂等: 已经是 "HH:mm" 的原样返回 —— 断言脚本喂 fixture 时走的就是这条捷径;
 *   真后端返回完整 ISO 时才做 Date 解析。
 *
 *   取**本地**时刻而不是 UTC 切片: 用户看到的是自己时区的时段,
 *   原型 / mocks 的 HH:mm 也是本地墙钟口径。
 */
export function toHhmm(value: string | null | undefined): string {
  if (!value) return "";
  const already = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (already) return `${pad2(Number(already[1]))}:${already[2]}`;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * toYmd — ISO datetime → 本地 YYYY-MM-DD。
 *
 * 用途 (gaga P0-F 跨天日程): 后端 endAt 是**完整 ISO datetime**, 它的日期部分
 * 就是「结束日期」。normalizeScheduleItem 用它把跨天信息留下来 —— endAt 本身被压成
 * HH:mm, 压完就没有日期了, 跨天日程在日历上画不出跨天条。
 *
 * 已经是 YYYY-MM-DD 的原样返回; 解析不出来返回空串 (调用方退回 date)。
 */
export function toYmd(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** owner 三件套 (schedules.dto.js ownerFields L27-36)。ownerId 是 number|null。 */
function ownerOf(raw: any): OwnerSnapshot {
  const isCody = raw?.ownerType === "cody";
  const oid = raw?.ownerId;
  return {
    ownerType: isCody ? "cody" : "user",
    ownerId: isCody || oid === null || oid === undefined ? null : Number(oid),
    ownerName: typeof raw?.ownerName === "string" ? raw.ownerName : isCody ? "Cody" : "",
  };
}

export function normalizeReminder(raw: any): Reminder {
  return {
    id: String(raw?.id ?? ""),
    scheduleId: raw?.scheduleId ?? null,
    milestoneId: raw?.milestoneId ?? null,
    remindAt: raw?.remindAt ?? "",
    offsetMinutes: raw?.offsetMinutes ?? null,
    channels: asArray<string>(raw?.channels),
    enabled: !!raw?.enabled,
    fired: !!raw?.fired,
  };
}

/** ScheduleItem 没有 order 字段 (只有 Task/Subtask/Milestone 有)。 */
export function normalizeScheduleItem(raw: any): ScheduleItem {
  return {
    id: String(raw?.id ?? ""),
    milestoneId: raw?.milestoneId ?? null,
    title: typeof raw?.title === "string" ? raw.title : "",
    note: raw?.note ?? null,
    // 契约 §9.5: date = "YYYY-MM-DD"; 后端 utcDayKey() 直出, 原样透传。
    date: typeof raw?.date === "string" ? raw.date : "",
    startAt: toHhmm(raw?.startAt),
    endAt: toHhmm(raw?.endAt),
    // 跨天派生 (gaga P0-F): 结束日期 = endAt 的日期部分。
    //   后端 DTO 没这个字段 —— 自己算。endAt 已经是 HH:mm 时取不到日期, 退回 date。
    endDate: toYmd(raw?.endAt) || (typeof raw?.date === "string" ? raw.date : ""),
    ddl: raw?.ddl ?? null,
    statusOverride: raw?.statusOverride ?? null,
    // v8 决策 48 / v8.1 决策 49 —— 后端派生字段 (只读, 不进 POST/PATCH body)。
    // ⚠️ **只在字段存在时写入**: 让下游能区分「后端说 null」(权威: 无截止 → 永不逾期)
    //    与「旧后端还没出这个字段」(缺失 → 本地兜底)。旧后端未出参时对象形状与改造前逐字一致。
    ...(raw?.effectiveStatus !== undefined ? { effectiveStatus: raw.effectiveStatus } : {}),
    ...(raw?.overdueAt !== undefined ? { overdueAt: raw.overdueAt } : {}),
    ...(raw?.isOverdue !== undefined ? { isOverdue: !!raw.isOverdue } : {}),
    ...ownerOf(raw),
    archived: !!raw?.archived,
    archivedAt: raw?.archivedAt ?? null,
    reminders: asArray<any>(raw?.reminders).map(normalizeReminder),
    createdAt: raw?.createdAt ?? "",
    updatedAt: raw?.updatedAt ?? "",
  };
}

export function normalizeMilestone(raw: any, order: number): Milestone {
  return {
    id: String(raw?.id ?? ""),
    subtaskId: String(raw?.subtaskId ?? ""),
    title: typeof raw?.title === "string" ? raw.title : "",
    ddl: raw?.ddl ?? null,
    // v9.2 —— 关键节点的开始时间 (可空 ISO)。
    // ⚠️ **只在字段存在时写入**: 后端没出这个字段时 DTO 形状与改造前逐字一致
    //    (跟 overdueAt / isOverdue 同口径)。⚠️ 只写类型不写这行映射 = 运行时恒 undefined。
    ...(raw?.startAt !== undefined ? { startAt: raw.startAt ?? null } : {}),
    statusOverride: raw?.statusOverride ?? null,
    // v8 决策 48 / v8.1 决策 49 —— 后端派生字段 (只读, 不进 POST/PATCH body)。
    // ⚠️ **只在字段存在时写入**: 让下游能区分「后端说 null」(权威: 无截止 → 永不逾期)
    //    与「旧后端还没出这个字段」(缺失 → 本地兜底)。旧后端未出参时对象形状与改造前逐字一致。
    ...(raw?.effectiveStatus !== undefined ? { effectiveStatus: raw.effectiveStatus } : {}),
    ...(raw?.overdueAt !== undefined ? { overdueAt: raw.overdueAt } : {}),
    ...(raw?.isOverdue !== undefined ? { isOverdue: !!raw.isOverdue } : {}),
    ...ownerOf(raw),
    archived: !!raw?.archived,
    archivedAt: raw?.archivedAt ?? null,
    reminders: asArray<any>(raw?.reminders).map(normalizeReminder),
    children: asArray<any>(raw?.children).map((c) => normalizeScheduleItem(c)),
    createdAt: raw?.createdAt ?? "",
    updatedAt: raw?.updatedAt ?? "",
    order,
  };
}

export function normalizeSubtask(raw: any, order: number): Subtask {
  return {
    id: String(raw?.id ?? ""),
    taskId: String(raw?.taskId ?? ""),
    title: typeof raw?.title === "string" ? raw.title : "",
    desc: raw?.desc ?? null,
    ddl: raw?.ddl ?? null,
    // v9.2 —— 子任务的开始时间 (可空 ISO)。
    // ⚠️ **只在字段存在时写入**: 后端没出这个字段时 DTO 形状与改造前逐字一致。
    // ⚠️ 只在 interface 里声明字段、不写这行映射 = 运行时恒 undefined (假修复)。
    ...(raw?.startAt !== undefined ? { startAt: raw.startAt ?? null } : {}),
    status: (raw?.status ?? "pending") as ItemStatus,
    // v8 决策 48 / v8.1 决策 49 —— 后端派生字段 (只读, 不进 POST/PATCH body)。
    // ⚠️ **只在字段存在时写入**: 让下游能区分「后端说 null」(权威: 无截止 → 永不逾期)
    //    与「旧后端还没出这个字段」(缺失 → 本地兜底)。旧后端未出参时对象形状与改造前逐字一致。
    // ⚠️ **Subtask** 不带 effectiveStatus (契约 §9.5: status 本身就是手工真值)。
    //    注意别写成「Task / Subtask 都不带」—— Task 自 v9 起**是**带的 (见 normalizeTask)。
    ...(raw?.overdueAt !== undefined ? { overdueAt: raw.overdueAt } : {}),
    ...(raw?.isOverdue !== undefined ? { isOverdue: !!raw.isOverdue } : {}),
    ...ownerOf(raw),
    archived: !!raw?.archived,
    archivedAt: raw?.archivedAt ?? null,
    children: asArray<any>(raw?.children).map((c, i) => normalizeMilestone(c, i)),
    createdAt: raw?.createdAt ?? "",
    updatedAt: raw?.updatedAt ?? "",
    order,
  };
}

export function normalizeTask(raw: any, order: number): Task {
  return {
    id: String(raw?.id ?? ""),
    title: typeof raw?.title === "string" ? raw.title : "",
    desc: raw?.desc ?? null,
    ddl: raw?.ddl ?? null,
    status: (raw?.status ?? "pending") as ItemStatus,
    // gaga P0-G / 决策 D3 —— 任务的状态由后端按「开始时间 / 截止时间」派生。
    //   startAt: 任务开始时间 (ISO); statusOverride: 状态影子值; effectiveStatus: 后端派生态。
    //   ⚠️ **只在字段存在时写入** (跟 overdueAt / isOverdue 同口径) ——
    //      旧后端还没出参时对象形状与改造前逐字一致, 本地兜底照旧走 node.status。
    ...(raw?.startAt !== undefined ? { startAt: raw.startAt ?? null } : {}),
    ...(raw?.statusOverride !== undefined ? { statusOverride: raw.statusOverride ?? null } : {}),
    ...(raw?.effectiveStatus !== undefined
      ? { effectiveStatus: raw.effectiveStatus as ItemStatus }
      : {}),
    // v8 决策 48 / v8.1 决策 49 —— 后端派生字段 (只读, 不进 POST/PATCH body)。
    // ⚠️ **只在字段存在时写入**: 让下游能区分「后端说 null」(权威: 无截止 → 永不逾期)
    //    与「旧后端还没出这个字段」(缺失 → 本地兜底)。旧后端未出参时对象形状与改造前逐字一致。
    // ✅ Task **有** effectiveStatus (契约 v9「任务状态派生」) —— 已在上方映射;
    //    只有 **Subtask** 不带 (status 本身就是手工真值, dto.js subtaskDto 刻意不加)。
    ...(raw?.overdueAt !== undefined ? { overdueAt: raw.overdueAt } : {}),
    ...(raw?.isOverdue !== undefined ? { isOverdue: !!raw.isOverdue } : {}),
    ...ownerOf(raw),
    archived: !!raw?.archived,
    archivedAt: raw?.archivedAt ?? null,
    children: asArray<any>(raw?.children).map((c, i) => normalizeSubtask(c, i)),
    createdAt: raw?.createdAt ?? "",
    updatedAt: raw?.updatedAt ?? "",
    order,
  };
}

/**
 * cron: 后端 { expression, status, description, timezone, prompt, lastRunAt, ownerName, originSessionId }
 *       → 本文件 { cronExpr, state, description, timezone, prompt, lastRunAt, ownerName, originSessionId }
 *
 * ⚠️ 映射范围要覆盖整条链路: listCronJobs (今日待办分组 / 日程中心落点) 与
 *    getCronJobById (详情页) 与 toggleCronJobState (暂停·启用回包) 走的是**同一个**
 *    normalizeCronJob, 所以三个入口字段一致 —— 不用在调用点各写一遍。
 *    (踩坑提醒: 只在类型上声明字段而不写映射 = 运行时全 undefined, TS 照样编译通过。)
 *
 * ⚠️ originSessionId (契约 v10 决策 B) 的两个坑:
 *    ① 后端出参字段名**就是** camelCase `originSessionId` —— 本函数**不**做 snake→camel 转换,
 *       直接同名读 (unified-api schedules.dto.js cronDto 已确认: `originSessionId: row.originSessionId == null ? null : String(row.originSessionId)`)。
 *    ② 后端出参是**字符串化**的 L2 session id (Prisma BigInt 不能直接 JSON 序列化) ——
 *       这里再 String() 一次是防御性的 (万一哪天上游漏了 String())，不是重复转换。
 *    null / 字段缺失 = **未归属** (老 cron) —— 统一归一成 null, 不留 undefined。
 */
export function normalizeCronJob(raw: any, order: number): CronJob {
  return {
    id: String(raw?.id ?? ""),
    title: typeof raw?.title === "string" ? raw.title : "",
    cronExpr: typeof raw?.expression === "string" ? raw.expression : "",
    nextRunAt: raw?.nextRunAt ?? "",
    state: raw?.status === "paused" ? "paused" : "active",
    ownerType: "cody",
    createdAt: raw?.createdAt ?? "",
    description: typeof raw?.description === "string" ? raw.description : null,
    timezone: typeof raw?.timezone === "string" ? raw.timezone : null,
    prompt: typeof raw?.prompt === "string" ? raw.prompt : null,
    lastRunAt: raw?.lastRunAt ?? null,
    ownerName: typeof raw?.ownerName === "string" ? raw.ownerName : "Cody",
    // v10 决策 B —— 只读出参; 后端出参就是 camelCase, 这里同名读 + 字符串化。
    originSessionId: raw?.originSessionId == null ? null : String(raw.originSessionId),
  };
}

const normTasks = (v: unknown): Task[] => asArray<any>(v).map((r, i) => normalizeTask(r, i));
const normSchedules = (v: unknown): ScheduleItem[] => asArray<any>(v).map((r) => normalizeScheduleItem(r));
const normCrons = (v: unknown): CronJob[] => asArray<any>(v).map((r, i) => normalizeCronJob(r, i));

// =========================================================================
// 拍平 —— 真实数据源只有两个, 图算法一行都不用改
//
//   (总 PM 2026-10-20 修正口径。真实数据源 = GET /tasks 带 children 树
//    + GET /schedules?from&to 扁平日程, **不是**三个扁平列表端点;
//    buildScheduleTreeIndex 沿 parentId 向上迭代, 对拍平后的节点同样成立。)
// =========================================================================

/** 四层树里任意一层的父级类型; 顶层 task / 游离日程 = null (日程是叶子, 不会是父级)。 */
export type ParentKind = "task" | "subtask" | "milestone" | null;

/** 节点自身所属层 (含叶子层 schedule)。 */
export type NodeKind = "task" | "subtask" | "milestone" | "schedule";

/** 拍平后的单个节点 — 带统一父指针 (后端三个父级字段名不统一, 这里收口)。 */
export interface FlatScheduleNode {
  node: ScheduleNode;
  parentId: string | null;
  parentKind: ParentKind;
}

/** 节点自身所属层。 */
export function nodeKindOf(node: ScheduleNode): NodeKind {
  if ("date" in node) return "schedule";
  if ("subtaskId" in node) return "milestone";
  if ("taskId" in node) return "subtask";
  return "task";
}

/**
 * flattenScheduleTree — GET /tasks 的 children 树 + GET /schedules 扁平日程 → 节点列表。
 *
 *   合并规则:
 *     - GET /tasks 里的树内日程带完整 children 上下文 → **以它为准**
 *     - GET /schedules 里 id 已出现的 → 按 id 跳过 (去重)
 *     - 剩下的 = 游离日程 (milestoneId === null) → parentId / parentKind 都 null,
 *       **不挂到任何父节点上** (游离日程的 effectiveDdl 就是它自己的 ddl)
 *
 * ⚠️ 边界 (契约 §9.1): GET /tasks 无分页、上限 200 条。任务超 200 的用户,
 *    树被截断 → 漏的**不是日程本身** (日程由 GET /schedules 按时间窗完整取回),
 *    漏的是「继承到的父级 ddl」: effectiveDdl 会退化成 null, 逾期分组随之失真。
 */
export function flattenScheduleTree(input: {
  tasks: Task[];
  schedules?: ScheduleItem[];
}): FlatScheduleNode[] {
  const out: FlatScheduleNode[] = [];
  const seen = new Set<string>();

  const push = (node: ScheduleNode, parentId: string | null, parentKind: ParentKind) => {
    if (!node?.id || seen.has(node.id)) return;
    seen.add(node.id);
    out.push({ node, parentId, parentKind });
  };

  // ① 任务树 DFS: task → subtask → milestone → schedule
  for (const t of input.tasks) {
    push(t, null, null);
    for (const s of t.children ?? []) {
      push(s, t.id, "task");
      for (const m of s.children ?? []) {
        push(m, s.id, "subtask");
        for (const c of m.children ?? []) push(c, m.id, "milestone");
      }
    }
  }

  // ② 扁平日程: 树内已收录的按 id 跳过; 剩下的游离日程 parentId = null
  for (const c of input.schedules ?? []) {
    push(c, c.milestoneId ? String(c.milestoneId) : null, c.milestoneId ? "milestone" : null);
  }

  return out;
}

/**
 * 拍平结果 → 图算法要的三张父表 + ScheduleTreeIndex。
 *   游离日程不进任何父表 (它不是任何节点的父级), 但仍在 flat 里, 供上层查状态/逾期。
 */
export function buildFlatIndex(input: { tasks: Task[]; schedules?: ScheduleItem[] }): {
  flat: FlatScheduleNode[];
  tasks: Task[];
  subtasks: Subtask[];
  milestones: Milestone[];
  tree: ScheduleTreeIndex;
} {
  const flat = flattenScheduleTree(input);
  const tasks: Task[] = [];
  const subtasks: Subtask[] = [];
  const milestones: Milestone[] = [];
  for (const { node, parentKind } of flat) {
    if (parentKind === "task") subtasks.push(node as Subtask);
    else if (parentKind === "subtask") milestones.push(node as Milestone);
    else if (parentKind === null && nodeKindOf(node) === "task") tasks.push(node as Task);
  }
  return {
    flat,
    tasks,
    subtasks,
    milestones,
    tree: buildScheduleTreeIndex({ tasks, subtasks, milestones }),
  };
}

/** 404 (NOT_FOUND) 视为「没有这条」而不是抛错 —— 各 getXxxById 签名是 `| null`。 */
function isNotFound(err: unknown): boolean {
  return isScheduleApiError(err) && (err.status === 404 || err.code === "NOT_FOUND");
}

// =========================================================================
// Read functions — 全部 await 真后端 (契约 §9.1)
// =========================================================================

/**
 * listTasks — GET /api/v1/schedules/tasks
 *   未归档任务 + children 递归到叶子, createdAt 倒序, **上限 200**。
 *   `includeArchived: true` 时额外拉 GET /tasks/archived 拼在后面
 *   (后端没有「含归档」的单一路由; 归档页 / 计数场景才需要)。
 */
export async function listTasks(opts: { includeArchived?: boolean } = {}): Promise<Task[]> {
  const active = normTasks(await scheduleFetch<unknown>("/schedules/tasks"));
  if (!opts.includeArchived) return active;
  const archived = normTasks(await scheduleFetch<unknown>("/schedules/tasks/archived"));
  return [...active, ...archived];
}

/** listSubtasks — 无扁平端点 (后端只有 /subtasks/archived), 从任务树拍平。 */
export async function listSubtasks(opts: { includeArchived?: boolean } = {}): Promise<Subtask[]> {
  const { subtasks } = buildFlatIndex({ tasks: await listTasks() });
  return opts.includeArchived ? subtasks : subtasks.filter((s) => !s.archived);
}

/** listMilestones — 同上, 从任务树 children[].children 拍平。 */
export async function listMilestones(opts: { includeArchived?: boolean } = {}): Promise<Milestone[]> {
  const { milestones } = buildFlatIndex({ tasks: await listTasks() });
  return opts.includeArchived ? milestones : milestones.filter((m) => !m.archived);
}

/**
 * listSchedules — GET /api/v1/schedules/schedules?from=&to=
 *   - from / to 必须**同时**给 (后端 parseWindow routes.js:153-168, 只给一个 = 400 VALIDATION)。
 *   - 不传窗口 = 全量未归档日程。
 *   - includeArchived 额外拼 GET /schedules/archived (已归档页用)。
 */
export async function listSchedules(opts: {
  from?: string;
  to?: string;
  includeArchived?: boolean;
} = {}): Promise<ScheduleItem[]> {
  const { from, to } = opts;
  const qs = from && to ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : "";
  const rows = normSchedules(await scheduleFetch<unknown>(`/schedules/schedules${qs}`));
  if (!opts.includeArchived) return rows;
  const archived = normSchedules(await scheduleFetch<unknown>("/schedules/schedules/archived"));
  return [...rows, ...archived];
}

export async function getTaskById(id: string): Promise<Task | null> {
  try {
    return normalizeTask(await scheduleFetch<unknown>(`/schedules/tasks/${id}`), 0);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function getSubtaskById(id: string): Promise<Subtask | null> {
  try {
    return normalizeSubtask(await scheduleFetch<unknown>(`/schedules/subtasks/${id}`), 0);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function getMilestoneById(id: string): Promise<Milestone | null> {
  try {
    return normalizeMilestone(await scheduleFetch<unknown>(`/schedules/milestones/${id}`), 0);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function getScheduleById(id: string): Promise<ScheduleItem | null> {
  try {
    return normalizeScheduleItem(await scheduleFetch<unknown>(`/schedules/schedules/${id}`));
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// 归档列表 — 4 张表各一条端点 (契约 §9.1, 总 PM 补丁第 3 条)
// ---------------------------------------------------------------------------

export type ArchivedKind = "task" | "subtask" | "milestone" | "schedule";

const ARCHIVED_PATH: Record<ArchivedKind, string> = {
  task: "/schedules/tasks/archived",
  subtask: "/schedules/subtasks/archived",
  milestone: "/schedules/milestones/archived",
  schedule: "/schedules/schedules/archived",
};

export async function listArchived(kind: ArchivedKind): Promise<ScheduleNode[]> {
  const raw = await scheduleFetch<unknown>(ARCHIVED_PATH[kind]);
  switch (kind) {
    case "task":
      return normTasks(raw);
    case "subtask":
      return asArray<any>(raw).map((r, i) => normalizeSubtask(r, i));
    case "milestone":
      return asArray<any>(raw).map((r, i) => normalizeMilestone(r, i));
    default:
      return normSchedules(raw);
  }
}

// ---------------------------------------------------------------------------
// 任务看板 — GET /api/v1/schedules/board
// ---------------------------------------------------------------------------

/** 看板 4 列 (契约 §6.1)。每列是一张 Task 卡片; overdue 由后端算一次。 */
export interface BoardColumns {
  pending: Task[];
  in_progress: Task[];
  done: Task[];
  overdue: Task[];
}

/**
 * 看板快照 — 4 列 + **响应级 serverTime**。
 *
 * ⚠️ serverTime 在**信封顶层** (契约 §9.5 末尾: 「列表响应里必须带 serverTime (ISO),
 *    用于倒计时」) —— 任务看板的倒计时**必须**拿它当时间基准, 不信任设备本地时间
 *    (契约 §6.2 注: 「用 server 端返回的 serverTime 字段(不信任设备本地时间)算倒计时」)。
 *    后端没给时为 null —— 调用方自行决定降级策略 (PC 降级用本机时间)。
 */
export interface BoardSnapshot {
  columns: BoardColumns;
  /** 响应级 serverTime (ISO); null = 后端没给。 */
  serverTime: string | null;
}

/**
 * getBoard — GET /api/v1/schedules/board (契约 §9.1)。
 *
 *   返回 4 列 {pending, in_progress, done, overdue}, 每个 Task 带 children[] 递归展开到叶子,
 *   overdue 列由**后端**算 (契约 §2.1.3 决策 48/49: 端侧不再自己判逾期)。
 *
 * ⚠️ P4 变更: 返回值从 `BoardColumns` 变成 `BoardSnapshot` (多了 serverTime)。
 *    改动前**没有任何 UI 调用方** (上轮收口报告实测), 所以没有调用点需要跟着改。
 */
export async function getBoard(): Promise<BoardSnapshot> {
  const { data, serverTime } = await scheduleFetchEnvelope<Record<string, unknown>>(
    "/schedules/board",
  );
  const raw = data ?? {};
  return {
    columns: dedupeBoardColumns({
      pending: normTasks(raw.pending),
      in_progress: normTasks(raw.in_progress),
      done: normTasks(raw.done),
      overdue: normTasks(raw.overdue),
    }),
    serverTime,
  };
}

/**
 * dedupeBoardColumns — 看板 4 列去重 (gaga P0-G / 决策 D3)。
 *
 *   「已逾期」列 = isOverdue === true **优先归入**; 同一张卡片**不在两列重复** ——
 *   后端若同时把它放进 pending 和 overdue, 端侧把其它列里的那份去掉。
 *
 *   纯函数 —— 断言脚本直接 import 跑真值。
 */
export function dedupeBoardColumns(cols: {
  pending: Task[];
  in_progress: Task[];
  done: Task[];
  overdue: Task[];
}): { pending: Task[]; in_progress: Task[]; done: Task[]; overdue: Task[] } {
  const overdueIds = new Set(cols.overdue.map((t) => t.id));
  const strip = (list: Task[]): Task[] => list.filter((t) => !overdueIds.has(t.id));
  return {
    pending: strip(cols.pending),
    in_progress: strip(cols.in_progress),
    done: strip(cols.done),
    overdue: cols.overdue,
  };
}

// =========================================================================
// Today projection — GET /api/v1/schedules/today (后端已筛好「今天 + 逾期未完成」)
// =========================================================================

/**
 * bucketTodaySchedules — 五桶投影 (纯函数, 无 IO)。
 *
 *   口径不变 (契约 §9.5):
 *     done      ← effectiveStatus === 'done'
 *     overdue   ← 非 done && tree.isOverdue(i, now)
 *     morning   ← startAt 00:00–12:00
 *     afternoon ← startAt 12:00–18:00
 *     evening   ← startAt 18:00–24:00
 *
 *   纯函数是为了让断言脚本能拿 fixture 直接验分桶, 不打网络。
 */
export function bucketTodaySchedules(
  items: ScheduleItem[],
  tree: ScheduleTreeIndex,
  now: Date,
): TodayScheduleBuckets {
  const out: TodayScheduleBuckets = { overdue: [], morning: [], afternoon: [], evening: [], done: [] };
  for (const item of items) {
    // 契约 §2.1.4: 已归档条目不在任何视图出现 (后端已滤一层, 这里双保险)
    if (item.archived) continue;
    if (tree.effectiveStatus(item) === "done") {
      out.done.push(item);
      continue;
    }
    if (tree.isOverdue(item, now)) {
      out.overdue.push(item);
      continue;
    }
    const min = Number(item.startAt.slice(0, 2)) * 60 + Number(item.startAt.slice(3, 5) || 0);
    if (min < 12 * 60) out.morning.push(item);
    else if (min < 18 * 60) out.afternoon.push(item);
    else out.evening.push(item);
  }
  return out;
}

/**
 * listTodayTodos — 今日待办视图数据源 (GET /today)。
 *   - 后端已返回「今天 + 逾期未完成」的日程, 前端只做五桶投影。
 *   - 树索引走 flattenScheduleTree: GET /tasks 树 + GET /today 行合并 (按 id 去重)。
 *   - now 默认取**本机当前时间** (mock 期写死的 2026-10-20 10:49 已废弃)。
 */
export async function listTodayTodos(now: Date = new Date()): Promise<TodayScheduleBuckets> {
  const [rows, tasks] = await Promise.all([
    scheduleFetch<unknown>("/schedules/today"),
    listTasks(),
  ]);
  const { tree } = buildFlatIndex({ tasks, schedules: normSchedules(rows) });
  return bucketTodaySchedules(normSchedules(rows), tree, now);
}

// =========================================================================
// Cron — GET /crons + PATCH /crons/:id (只允许改 status) + DELETE /crons/:id
// =========================================================================

export async function listCronJobs(opts: { from?: string; to?: string } = {}): Promise<CronJob[]> {
  const { from, to } = opts;
  const qs = from && to ? `?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}` : "";
  return normCrons(await scheduleFetch<unknown>(`/schedules/crons${qs}`));
}

export async function getCronJobById(id: string): Promise<CronJob | null> {
  try {
    return normalizeCronJob(await scheduleFetch<unknown>(`/schedules/crons/${id}`), 0);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/**
 * toggleCronJobState — 暂停·启用切换 (用户对 cron 唯一允许的写操作)。
 *
 *   ⚠️ body **严格只发 `{ status }`** —— 后端 preValidation 守卫
 *      (routes.js:179 guardCronPatchBody) 逐键检查, 带任何其它字段
 *      → **400 CRON_UPDATE_FORBIDDEN**。
 *   端点: PATCH /api/v1/schedules/crons/:id
 */
export async function toggleCronJobState(
  id: string,
  nextState: "active" | "paused",
): Promise<CronJob> {
  const raw = await scheduleFetch<any>(`/schedules/crons/${id}`, {
    method: "PATCH",
    body: { status: nextState },
  });
  return normalizeCronJob(raw, 0);
}

/** deleteCronJob — 硬删不可恢复 (cron 没有 archived 概念)。 */
export async function deleteCronJob(id: string): Promise<void> {
  await scheduleFetch<unknown>(`/schedules/crons/${id}`, { method: "DELETE" });
}

// =========================================================================
// Write functions — 今日待办 (P2): 完成 / 取消完成 / 删除
// =========================================================================

/**
 * setScheduleStatus — 改一条日程的状态 (点卡片 / 点勾选圈都走它)。
 *   v6 语义: ScheduleItem 没有 status 字段, 有效状态完全由 statusOverride 承载,
 *   所以入参 ItemStatus 直接写到 statusOverride (没有「清影子」这个 action)。
 *   端点: PATCH /api/v1/schedules/schedules/:id
 */
export async function setScheduleStatus(id: string, status: ItemStatus): Promise<ScheduleItem> {
  const raw = await scheduleFetch<any>(`/schedules/schedules/${id}`, {
    method: "PATCH",
    body: { statusOverride: status },
  });
  return normalizeScheduleItem(raw);
}

/** deleteSchedule — 删一条日程 (⋮ 菜单「删除」)。硬删不可恢复, UI 侧先二次确认。 */
export async function deleteSchedule(id: string): Promise<void> {
  await scheduleFetch<unknown>(`/schedules/schedules/${id}`, { method: "DELETE" });
}

// =========================================================================
// 四张表的写操作 — POST / PATCH / DELETE (契约 §9.2 + §9.5 可写字段白名单)
//
// ⚠️ **请求体字段名 = camelCase** (unified-api/src/modules/schedules/schedules.routes.js
//    的 ajv schema 就是 camelCase: title/desc/ownerType/ddl/status/statusOverride/
//    taskId/subtaskId/milestoneId/date/startAt/endAt/note/archived)。
//    日程域跟 app 其它模块的 snake_case 约定**不同** —— 这里不要改。
//
// ⚠️ **责任人三件套只传 ownerType**: ownerId / ownerName 由服务端从 JWT 解析
//    (schedules.service.js resolveOwner), 客户端传了也会被 ajv 剥掉。
//
// ⚠️ **PATCH 是稀疏更新** (契约 v7 决策 16): 只带用户真改过的字段;
//    没带的字段保持不变; 要清空必须显式传 `null`。
//
// ⚠️ **startAt / endAt 必须发完整 ISO** (后端 schema `format: 'date-time'`),
//    而本文件 DTO 里的 startAt/endAt 是 "HH:mm" —— 所以写操作要用
//    `scheduleLocalToIso(date, hhmm)` 把「本地日历日 + 本地墙钟」拼成 ISO 发出去,
//    跟 normalizeScheduleItem 的 toHhmm() 反向配对。
// =========================================================================

/** 责任人: 只传 ownerType (两态: user / cody) —— 契约 §2.1.3 / §7.2「责任人两选一」。 */
export type OwnerWritable = { ownerType?: OwnerType };

/**
 * 任务 / 子任务 共用的可写字段 (契约 §7.2 字段表)。
 *
 * ⚠️ `startAt` (gaga P0-G / 决策 D3): 任务的状态由后端按「开始时间 / 截止时间」派生,
 *    所以任务的新建体要带 startAt (ISO)。
 * ⚠️ v9.2 起**子任务也能带 startAt** (可空 = 不设开始时间; 不参与 DDL 继承 /
 *    状态派生 / 逾期判定) —— 任务 / 子任务共用本类型。
 */
export type TaskWritableFields = OwnerWritable & {
  title?: string;
  desc?: string | null;
  ddl?: string | null;
  status?: ItemStatus;
  /** 任务 / 子任务的开始时间 (ISO datetime) —— 决策 D3 / 契约 v9.2。 */
  startAt?: string | null;
};

/** 关键节点: 状态走 statusOverride (null = 继承上级) —— 契约 §9.5。 */
export type MilestoneWritableFields = OwnerWritable & {
  title?: string;
  ddl?: string | null;
  statusOverride?: ItemStatus | null;
  /**
   * v9.2: 关键节点的开始时间 (ISO datetime) —— **可空** = 不设开始时间;
   * 不参与 DDL 继承 / 状态派生 / 逾期判定 (契约 §2.1.2 / §9.5)。
   */
  startAt?: string | null;
};

/** 日程: date / startAt / endAt 全必填 (契约 v7 决策 12) —— statusOverride 可空 = 继承。 */
export type ScheduleWritableFields = OwnerWritable & {
  title?: string;
  note?: string | null;
  date?: string;
  startAt?: string;
  endAt?: string;
  ddl?: string | null;
  statusOverride?: ItemStatus | null;
  milestoneId?: string | null;
};

/**
 * ⚠️ **任务专属可写字段 —— 刻意不放进 `TaskWritableFields`** (契约 §6.4 / §9.5)
 *
 * 为什么要单独拆: `SubtaskCreateBody / SubtaskPatchBody` 复用 `TaskWritableFields`,
 *   直接往里加 `statusOverride` 会**顺带漏给 Subtask**, 而 Subtask 表**没有**
 *   status_override 列 —— 后端 `subtaskProps` 一旦收到它, `additionalProperties: false`
 *   直接 400。**后端自己也是这么拆的**: `taskProps`(含 status)与
 *   `taskExtraProps`(含 statusOverride/startAt)分开声明, 只挂 Task 的 create/patch
 *   (unified-api `schedules.routes.js:88-94`, 那里有一段同款原因注释)。
 *
 * ⚠️ **「任务写 statusOverride」是契约硬口径, 不是优化** (§6.4 / §2.1.3):
 *   `effectiveStatus(task)` = `statusOverride` ?? (无 startAt ? `status` : 时间派生)
 *   —— **有 startAt 时压根不看 status**。所以往任务的手工标记写 `status`
 *   会被后端**静默接受但永不生效** (这就是「看板点标记完成状态不变」的根因)。
 */
export type TaskExtraWritableFields = {
  /** 手工状态标记位 (可空 = 不覆盖, 走时间派生) —— ⋮ 菜单 / 状态选择器写这里。 */
  statusOverride?: ItemStatus | null;
};

/** POST /tasks —— 必填: title。 */
export type TaskCreateBody = TaskWritableFields & TaskExtraWritableFields & { title: string };
/** PATCH /tasks/:id —— 稀疏 (全可选)。 */
export type TaskPatchBody = Partial<TaskWritableFields> & TaskExtraWritableFields;

/** POST /subtasks —— 必填: title + taskId。 */
export type SubtaskCreateBody = TaskWritableFields & { title: string; taskId: string };
export type SubtaskPatchBody = Partial<TaskWritableFields> & { taskId?: string };

/** POST /milestones —— 必填: title + subtaskId; 可带 reminders[] (默认提醒模板)。 */
export type MilestoneCreateBody = MilestoneWritableFields & {
  title: string;
  subtaskId: string;
  reminders?: ReminderCreateBody[];
};
export type MilestonePatchBody = Partial<MilestoneWritableFields> & { subtaskId?: string };

/** POST /schedules —— 必填: title + date + startAt + endAt; 可带 reminders[]。 */
export type ScheduleCreateBody = ScheduleWritableFields & {
  title: string;
  date: string;
  startAt: string;
  endAt: string;
  reminders?: ReminderCreateBody[];
};
export type SchedulePatchBody = Partial<ScheduleWritableFields>;

/** 提醒写入体 (契约 §9.4) —— scheduleId / milestoneId 由路径决定, 不接受客户端传。 */
export type ReminderCreateBody = {
  remindAt: string;
  offsetMinutes?: number | null;
  channels: string[];
  enabled?: boolean;
};
export type ReminderPatchBody = Partial<ReminderCreateBody>;

/**
 * scheduleLocalToIso — 「本地日历日 YYYY-MM-DD + 本地墙钟 HH:mm」→ 完整 ISO。
 *
 *   后端 schema 要求 startAt/endAt 是 `format: 'date-time'` 的完整 ISO;
 *   而 DTO 里的 startAt/endAt 是 "HH:mm" (normalizeScheduleItem 的 toHhmm 转的)。
 *   写操作必须用这个函数转回去, 否则后端 ajv 判格式错。
 *
 *   走本地时区构造 Date 再 toISOString() —— 与 toHhmm() 的「取本地墙钟」口径对称,
 *   往返不漂。
 */
export function scheduleLocalToIso(date: string, hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  const ymd = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  if (!m || !ymd) return "";
  const d = new Date(
    Number(ymd[1]),
    Number(ymd[2]) - 1,
    Number(ymd[3]),
    Number(m[1]),
    Number(m[2]),
    0,
    0,
  );
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

// ---- 任务 ----

/** POST /schedules/tasks —— 建任务 (契约 §9.2)。 */
export async function createTask(body: TaskCreateBody): Promise<Task> {
  const raw = await scheduleFetch<any>("/schedules/tasks", { method: "POST", body });
  return normalizeTask(raw, 0);
}

/** PATCH /schedules/tasks/:id —— 稀疏更新 (契约 v7 决策 16)。 */
export async function updateTask(id: string, body: TaskPatchBody): Promise<Task> {
  const raw = await scheduleFetch<any>(`/schedules/tasks/${id}`, { method: "PATCH", body });
  return normalizeTask(raw, 0);
}

/**
 * updateTaskStatus — 只改任务状态 (契约 §6.4)。
 *   稀疏 body: 只带 statusOverride, 其余字段一律不动。
 *   ⚠️ **写 statusOverride, 不写 status** —— 见 `statusWriteBody` 的四层字段表。
 */
export async function updateTaskStatus(id: string, status: ItemStatus): Promise<Task> {
  return updateTask(id, statusWriteBody("task", status));
}

/** DELETE /schedules/tasks/:id —— 级联硬删子节点, 不可恢复。 */
export async function deleteTask(id: string): Promise<void> {
  await scheduleFetch<unknown>(`/schedules/tasks/${id}`, { method: "DELETE" });
}

// ---- 子任务 ----

/** POST /schedules/subtasks —— 建子任务 (taskId 必填)。 */
export async function createSubtask(body: SubtaskCreateBody): Promise<Subtask> {
  const raw = await scheduleFetch<any>("/schedules/subtasks", { method: "POST", body });
  return normalizeSubtask(raw, 0);
}

/** PATCH /schedules/subtasks/:id —— 稀疏更新。 */
export async function updateSubtask(id: string, body: SubtaskPatchBody): Promise<Subtask> {
  const raw = await scheduleFetch<any>(`/schedules/subtasks/${id}`, { method: "PATCH", body });
  return normalizeSubtask(raw, 0);
}

/** DELETE /schedules/subtasks/:id —— 级联删关键节点 + 日程。 */
export async function deleteSubtask(id: string): Promise<void> {
  await scheduleFetch<unknown>(`/schedules/subtasks/${id}`, { method: "DELETE" });
}

// ---- 关键节点 ----

/** POST /schedules/milestones —— 建关键节点 (subtaskId 必填, 可带默认提醒)。 */
export async function createMilestone(body: MilestoneCreateBody): Promise<Milestone> {
  const raw = await scheduleFetch<any>("/schedules/milestones", { method: "POST", body });
  return normalizeMilestone(raw, 0);
}

/** PATCH /schedules/milestones/:id —— 稀疏更新 (不含 reminders, 改提醒走 reminder 端点)。 */
export async function updateMilestone(
  id: string,
  body: MilestonePatchBody,
): Promise<Milestone> {
  const raw = await scheduleFetch<any>(`/schedules/milestones/${id}`, { method: "PATCH", body });
  return normalizeMilestone(raw, 0);
}

/** DELETE /schedules/milestones/:id —— 级联删日程。 */
export async function deleteMilestone(id: string): Promise<void> {
  await scheduleFetch<unknown>(`/schedules/milestones/${id}`, { method: "DELETE" });
}

// ---- 日程 ----

/**
 * createSchedule — 建日程 (契约 §9.2 / §7.2)。
 *   date / startAt / endAt 全必填 (v7 决策 12); startAt/endAt 传 **完整 ISO**。
 *   milestoneId 可空 = 游离日程。
 */
export async function createSchedule(body: ScheduleCreateBody): Promise<ScheduleItem> {
  const raw = await scheduleFetch<any>("/schedules/schedules", { method: "POST", body });
  return normalizeScheduleItem(raw);
}

/** PATCH /schedules/schedules/:id —— 稀疏更新。 */
export async function updateSchedule(
  id: string,
  body: SchedulePatchBody,
): Promise<ScheduleItem> {
  const raw = await scheduleFetch<any>(`/schedules/schedules/${id}`, { method: "PATCH", body });
  return normalizeScheduleItem(raw);
}

// =========================================================================
// 状态写入 —— **四层字段名不同, 必须按层选** (契约 §6.4 / §2.1.3 / §9.5)
// =========================================================================

/** 四层的 kind —— 与 BoardView / ScheduleDetailPage 的 kindOf() 同名同值。 */
export type StatusWriteKind = "task" | "subtask" | "milestone" | "schedule";

/**
 * ⚠️⚠️ **四层字段名对照表 —— 改状态前必读, 一刀切必出 bug** ⚠️⚠️
 *
 * | 层         | 写哪个字段            | 另一个字段会怎样                | 后端依据 |
 * |------------|----------------------|-------------------------------|---------|
 * | task       | **statusOverride**    | 写 `status` = **静默失效** ⚠️  | routes.js:70 + 93 |
 * | subtask    | **status**           | 写 `statusOverride` = **400** ⚠️ | routes.js:96-101 |
 * | milestone  | **statusOverride**    | 写 `status` = **400** ⚠️        | routes.js:109 |
 * | schedule   | **statusOverride**    | 写 `status` = **400** ⚠️        | routes.js:122 |
 *
 * 为什么 task 的 `status` 是**静默失效**而不是报错: `taskPatchBody` 的白名单
 *   `{...taskProps, ...taskExtraProps}` **同时含 status 和 statusOverride**
 *   (routes.js:131-134), 所以 ajv 放行、prisma 也照写 `status` 列 ——
 *   但 `effectiveStatus('task')` 只在 **`startAt == null`** 的老数据分支才回落到
 *   `status` (service.js:292)。带开始时间的任务永远走时间派生 → **写进去没人读**。
 *   这就是「看板点标记完成, 状态可能不变」的根因 (契约 §6.4 早就写明
 *   「`status` 保留为历史手工真值, 新建 / 手动标记**都不再写它**」)。
 *
 * `pending` 的含义 —— **四层不是一刀切**:
 *   - task       → **显式写 `'pending'`**。⚠️ 不能写 null: null = 撤销手工标记 → 落回
 *                  时间派生 → **过了 DDL 的任务当场算回 `'done'`** (service.js:296),
 *                  「取消完成」等于点不动。钉成 'pending' 才是「用户显式说还没做完」。
 *   - subtask    → 真值列, 直接写 `'pending'`。**本来就没有弹回问题** (无时间派生,
 *                  Subtask DTO 连 effectiveStatus 都不带, 契约 §9.5) —— 实测确认, 不动。
 *   - milestone  → **null** = 回到「继承父链」(契约 §2.1.3)。无时间派生, 不会被弹回。
 *   - schedule   → 同 milestone (null = 继承父链)。
 *
 * @param kind   四层之一
 * @param status 目标状态
 * @returns      **对应层**的稀疏 PATCH 写入体 (只带状态这一个字段)
 */
export function statusWriteBody(kind: "task", status: ItemStatus): TaskPatchBody;
export function statusWriteBody(kind: "subtask", status: ItemStatus): SubtaskPatchBody;
export function statusWriteBody(kind: "milestone", status: ItemStatus): MilestonePatchBody;
export function statusWriteBody(kind: "schedule", status: ItemStatus): SchedulePatchBody;
export function statusWriteBody(
  kind: StatusWriteKind,
  status: ItemStatus,
): TaskPatchBody | SubtaskPatchBody | MilestonePatchBody | SchedulePatchBody;
export function statusWriteBody(kind: StatusWriteKind, status: ItemStatus) {
  // ⚠️ 子任务是唯一的例外 —— 它的 status 是**唯一的手工真值列**, 没有 statusOverride。
  if (kind === "subtask") return { status };
  // ⚠️ 任务层的「取消完成」必须**显式钉 'pending'**, 不能写 null:
  //   后端 `effectiveStatus('task')` (unified-api schedules.service.js:287-300) 的第一分支
  //   是 `if (statusOverride) return statusOverride`, 写 null = 撤销手工标记 → 落到时间派生
  //   → **过了 DDL 的任务当场被算回 'done'** (service.js:296 `now >= ddl → 'done'`),
  //   表现就是「点取消完成, 状态立刻弹回已完成」= 按钮点不动。
  //   钉成 'pending' 才是产品要的语义: 用户显式说「这条还没做完」, 优先于时间派生。
  //   (实测: 内存 prisma + 真路由跑通 —— null → done / 'pending' → pending)
  if (kind === "task") return { statusOverride: status };
  // 关键节点 / 日程: pending = null = **回到「继承父链」** (契约 §2.1.3)。
  //   这两层**没有时间派生** (manualStatus 只走 statusOverride ?? 父链, service.js:255-270),
  //   所以不存在「被时间派生弹回」; null 在这里是契约语义的一部分 (详情页显示「状态继承上级」),
  //   **不能**跟着任务层一起改成 'pending'。
  return { statusOverride: status === "pending" ? null : status };
}

/**
 * setNodeStatus — **四层通用的「标记完成 / 进行中 / 取消完成」单一入口**。
 *
 * ⚠️ 为什么收口到这一个函数: 看板页与详情页原来**各自手搓**同一份 4 分支 switch,
 *   两份都得记得「task 用 statusOverride、subtask 用 status」—— 漏一处就是一个
 *   静默失效的 bug (2026-10-22 实测: 两份都把 task 写成了 status)。
 *   现在字段名只在 `statusWriteBody` 一处存在, 新增入口直接调它, 不会再写错。
 *
 * 端点按 kind 分派: PATCH /schedules/{tasks|subtasks|milestones|schedules}/:id
 */
export async function setNodeStatus(
  id: string,
  kind: StatusWriteKind,
  status: ItemStatus,
): Promise<unknown> {
  switch (kind) {
    case "task":
      return updateTask(id, statusWriteBody(kind, status));
    case "subtask":
      return updateSubtask(id, statusWriteBody(kind, status));
    case "milestone":
      return updateMilestone(id, statusWriteBody(kind, status));
    case "schedule":
      return updateSchedule(id, statusWriteBody(kind, status));
  }
}

// ---- 日程自己的提醒 (契约 §9.4) ----

/** POST /schedules/schedules/:id/reminders —— 加提醒。 */
export async function addScheduleReminder(
  scheduleId: string,
  body: ReminderCreateBody,
): Promise<Reminder> {
  const raw = await scheduleFetch<any>(`/schedules/schedules/${scheduleId}/reminders`, {
    method: "POST",
    body,
  });
  return normalizeReminder(raw);
}

/** PATCH /schedules/schedules/:id/reminders/:rid —— 改提醒。 */
export async function updateScheduleReminder(
  scheduleId: string,
  reminderId: string,
  body: ReminderPatchBody,
): Promise<Reminder> {
  const raw = await scheduleFetch<any>(
    `/schedules/schedules/${scheduleId}/reminders/${reminderId}`,
    { method: "PATCH", body },
  );
  return normalizeReminder(raw);
}

/** DELETE /schedules/schedules/:id/reminders/:rid —— 删提醒。 */
export async function deleteScheduleReminder(
  scheduleId: string,
  reminderId: string,
): Promise<void> {
  await scheduleFetch<unknown>(`/schedules/schedules/${scheduleId}/reminders/${reminderId}`, {
    method: "DELETE",
  });
}

// =========================================================================
// Archive / Restore — POST /{tasks|subtasks|milestones|schedules}/:id/{archive|restore}
//
//   ⚠️ 后端 archive/restore **不返回实体**, 只返回 { archived, archivedAt }
//      (routes.js:404/409), 所以 POST 之后再 GET 一次单条, 让签名继续返回完整 DTO。
// =========================================================================

type ArchiveSpec = { path: string; refetch: (id: string) => Promise<ScheduleNode | null> };

const ARCHIVE_SPECS = {
  task: { path: "tasks", refetch: getTaskById },
  subtask: { path: "subtasks", refetch: getSubtaskById },
  milestone: { path: "milestones", refetch: getMilestoneById },
  schedule: { path: "schedules", refetch: getScheduleById },
} as const;

async function setArchived(
  kind: keyof typeof ARCHIVE_SPECS,
  id: string,
  archived: boolean,
): Promise<ScheduleNode | null> {
  const spec = ARCHIVE_SPECS[kind] as ArchiveSpec;
  await scheduleFetch<unknown>(
    `/schedules/${spec.path}/${id}/${archived ? "archive" : "restore"}`,
    { method: "POST" },
  );
  return spec.refetch(id);
}

export async function archiveTask(id: string): Promise<Task> {
  return (await setArchived("task", id, true)) as Task;
}
export async function restoreTask(id: string): Promise<Task> {
  return (await setArchived("task", id, false)) as Task;
}
export async function archiveSubtask(id: string): Promise<Subtask> {
  return (await setArchived("subtask", id, true)) as Subtask;
}
export async function restoreSubtask(id: string): Promise<Subtask> {
  return (await setArchived("subtask", id, false)) as Subtask;
}
export async function archiveMilestone(id: string): Promise<Milestone> {
  return (await setArchived("milestone", id, true)) as Milestone;
}
export async function restoreMilestone(id: string): Promise<Milestone> {
  return (await setArchived("milestone", id, false)) as Milestone;
}
export async function archiveSchedule(id: string): Promise<ScheduleItem> {
  return (await setArchived("schedule", id, true)) as ScheduleItem;
}
export async function restoreSchedule(id: string): Promise<ScheduleItem> {
  return (await setArchived("schedule", id, false)) as ScheduleItem;
}

// =========================================================================
// Milestone 默认提醒模板 — POST / PATCH / DELETE /milestones/:id/reminders[/:rid]
//
//   契约强制区分:
//     PATCH /milestones/:id            改 Milestone 本体, **不接受** reminders (见 MilestonePatch)
//     POST/PATCH/DELETE .../reminders  改默认提醒模板 (见下)
//   Milestone.reminders 是「默认模板」—— 建日程时复制一份, 改它不影响已存在的日程。
// =========================================================================

/**
 * addMilestoneReminder — 在关键节点上注册一条默认提醒模板。
 *   端点: POST /api/v1/schedules/milestones/:id/reminders
 *   ⚠️ scheduleId / milestoneId / fired 由服务端按路径填充, 不接受客户端传
 *      (后端 reminderCreateBody additionalProperties:false, 传了会被 ajv 剥掉)。
 */
export async function addMilestoneReminder(
  milestoneId: string,
  body: Omit<Reminder, "id" | "scheduleId" | "milestoneId" | "fired">,
): Promise<Reminder> {
  const raw = await scheduleFetch<any>(`/schedules/milestones/${milestoneId}/reminders`, {
    method: "POST",
    body: {
      remindAt: body.remindAt,
      offsetMinutes: body.offsetMinutes ?? null,
      channels: body.channels,
      enabled: body.enabled ?? true,
    },
  });
  return normalizeReminder(raw);
}

/**
 * updateMilestoneReminder — 改关键节点上一条默认提醒模板。
 *   端点: PATCH /api/v1/schedules/milestones/:id/reminders/:rid
 *   body 只带要改的字段 (稀疏语义: 没出现 = 不改)。
 */
export async function updateMilestoneReminder(
  milestoneId: string,
  reminderId: string,
  body: Partial<Omit<Reminder, "id" | "scheduleId" | "milestoneId" | "fired">>,
): Promise<Reminder> {
  const payload: Record<string, unknown> = {};
  if (body.remindAt !== undefined) payload.remindAt = body.remindAt;
  if (body.offsetMinutes !== undefined) payload.offsetMinutes = body.offsetMinutes;
  if (body.channels !== undefined) payload.channels = body.channels;
  if (body.enabled !== undefined) payload.enabled = body.enabled;
  const raw = await scheduleFetch<any>(
    `/schedules/milestones/${milestoneId}/reminders/${reminderId}`,
    { method: "PATCH", body: payload },
  );
  return normalizeReminder(raw);
}

/**
 * deleteMilestoneReminder — 删除关键节点上一条默认提醒模板。
 *   端点: DELETE /api/v1/schedules/milestones/:id/reminders/:rid (硬删, 不可恢复)。
 */
export async function deleteMilestoneReminder(
  milestoneId: string,
  reminderId: string,
): Promise<void> {
  await scheduleFetch<unknown>(`/schedules/milestones/${milestoneId}/reminders/${reminderId}`, {
    method: "DELETE",
  });
}
