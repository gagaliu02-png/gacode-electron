/**
 * components/schedule/detail/ScheduleDetailView.tsx — 四个 kind 共用的详情页排版
 * (原型 v6 §B4, L2262-2325 + CSS L407-441) · PC 端 B6.
 *
 * 抄自 web `gacode-web/src/components/schedule/detail/ScheduleDetailView.tsx` (341 行),
 * 只换 PC 写法:
 *   - `cn(...)`      → 数组 filter(Boolean).join(" ")
 *   - `lucide-react` → PC 图标唯一出处是 `components/ui/Glyphs.tsx`
 *     (`ChevronLeft` → `ChevronLeftIcon` / `Pencil` → `PencilIcon`)
 *   - `from "@/components/schedule/OwnerAvatar"` → `from "../OwnerAvatar"` (同级目录上一级)
 *   - `from "@/lib/schedule-api"` → `from "../../../lib/schedule-api"` (三级)
 *   - `import type { ReactNode } from "react"` → 保持不变 (PC 同样支持)
 *
 * ⚠️ 四种 kind (任务 / 子任务 / 关键节点 / 日程) **共用这一个组件** —— 字段集按 kind 不同,
 *    但排版、chip、面包屑、子项列表完全共用 (别写四份)。
 *
 * 视觉基线 (原型 CSS 逐条抄):
 *   .detail-hd    flex / gap 8 / padding 4px 0 12px
 *   .back         14px / fg-muted / padding 6px 10px 6px 4px / radius full / hover → fg + bg-elevated
 *   .detail-title 20px/500/28 (cron); .k-task 23/700/31 · .k-subtask 19/600/26
 *                 · .k-milestone 17/600/24 · .k-schedule 16/500/24; margin-bottom 10px
 *   .dchips       flex / gap 8 / wrap / margin-bottom 16px
 *   .dgroup       bg --card / radius --r-2xl(24px) / padding 14px 16px / margin-bottom 12px
 *   .dgroup-h     12px / fg-subtle / margin-bottom 12px / ::after 一条 1px 分隔线
 *   .detail-grid  grid 76px 1fr / gap 12px 14px / 14px; dt 13px fg-muted 右对齐 lh 20
 *   .crumb        flex / gap 6 / wrap; .cb 14px fg hover → brand + 下划线; .cs 12px fg-subtle
 *   .child        flex / gap 10 / bg rgba(255,255,255,.04) / radius 20px / padding 10px 12px
 *                 / hover bg rgba(255,255,255,.08); .cnm 单行省略; .cmeta 11px fg-subtle
 *
 * ⚠️ **冲突类名** (Tailwind 3.4.19, 不用 `!important`):
 *   dt 的 `max-[640px]:mt-3` (普通行) 与 `max-[640px]:mt-0` (full 行) 同属性冲突
 *   ⇒ full 行写 `max-[640px]:!mt-0` (important 覆盖顺序无关)。
 */

import type { ReactNode } from "react";
import { ChevronLeftIcon, PencilIcon } from "../../ui/Glyphs";
import { OwnerAvatar } from "../OwnerAvatar";
import type { ItemStatus, OwnerType } from "../../../lib/schedule-api";
import {
  CHILD_NAME_CLASS,
  DETAIL_TITLE_CLASS,
  KIND_LABEL,
  STATUS_LABEL,
  childGroupTitle,
  childLevel,
  statusChipClass,
  type DetailKind,
  type RemindSummary,
} from "./detailModel";

/** chip 基础样式 (跟 ScheduleTaskCard 的 CHIP 同一套)。 */
const CHIP = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-4";

export interface DetailChild {
  id: string;
  kind: DetailKind;
  title: string;
  ownerType: OwnerType;
  ownerName: string;
  /** 右侧灰色元信息 (日程 → 时段; 其余 → 有效 DDL)。 */
  meta: string;
  status: ItemStatus;
}

export interface DetailAncestor {
  id: string;
  kind: DetailKind;
  title: string;
}

export interface ScheduleDetailViewProps {
  kind: DetailKind;
  title: string;
  status: ItemStatus;
  overdue: boolean;
  /** 「状态继承上级」/「状态已单独设置」 */
  statusSource: string;
  /** DDL 文案 (继承型带「继承自…」前缀) */
  ddlText: string;
  ddlInherited: boolean;
  ownerType: OwnerType;
  ownerName: string;
  /** 备注 (任务用 desc, 日程用 note)。 */
  note: string;
  /** 提醒摘要 —— 只有 schedule / milestone 有。 */
  remind?: RemindSummary | null;
  /** 关键节点的提醒说明 (原型 L2288)。 */
  remindHint?: string | null;
  /** 日程的时间 (「2026-10-21 09:30 – 11:00」)。 */
  timeText?: string | null;
  /**
   * 「开始时间」(任务 / 子任务 / 关键节点) —— 格式跟同区的 DDL 一致 (「10月22日 10:00」)。
   *
   * ⚠️ 契约 v9.2 —— startAt **可空** = 不设开始时间 → **没值就不渲染这一行**
   *    (不显示 "—", 不留空行)。日程 (schedule) 不走这一行 —— 它的时间在「时间」行里。
   */
  startText?: string | null;
  /** 日程的归属 (「关键节点 · X」/「游离日程 — 不挂在任何关键节点下」)。 */
  belongText?: string | null;
  ancestors: DetailAncestor[];
  /** 子项列表 (直属下级 / 同级日程) —— 不能叫 children (react/no-children-prop)。 */
  childItems: DetailChild[];
  onBack: () => void;
  onOpenAncestor: (kind: DetailKind, id: string) => void;
  onOpenChild: (kind: DetailKind, id: string) => void;
  onEdit: () => void;
  /** ⋮ 菜单 (由页面层持有状态)。 */
  menu: ReactNode;
  /** cron 详情页没有编辑按钮 —— 四个 kind 都有。 */
  showEdit: boolean;
}

/** 一行「标签 / 值」 (原型 .detail-grid 的 dt/dd)。 */
function Row({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <>
      <dt
        className={[
          "text-[13px] text-fg-muted text-right leading-5",
          // 手机端: dt 改左对齐 + 上边距 (原型 L724-730)
          "max-[640px]:text-left max-[640px]:mt-3",
          // ⚠️ `max-[640px]:!mt-0` 盖住上一行的 `max-[640px]:mt-3` (同属性冲突)。
          full && "max-[640px]:!mt-0",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {label}
      </dt>
      <dd
        className={[
          "m-0 leading-5 min-w-0 break-words",
          // 手机端: dd 顶到 dt 下面 + 下边框 (最后一列用 last: 去掉)
          "max-[640px]:mt-[3px] max-[640px]:pb-3 max-[640px]:border-b max-[640px]:border-white/[0.06] max-[640px]:last:border-0",
        ].join(" ")}
      >
        {children}
      </dd>
    </>
  );
}

/** 分组标题 (原型 .dgroup-h, ::after 拉一条分隔线)。 */
function GroupTitle({ children }: { children: ReactNode }) {
  return (
    <div className="text-[12px] text-fg-subtle mb-3 flex items-center gap-2.5 after:content-[''] after:flex-1 after:h-px after:bg-white/[0.06]">
      {children}
    </div>
  );
}

/** 分组卡片 (原型 .dgroup)。 */
function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section data-detail-group={label} className="bg-card rounded-2xl p-3.5 mb-3">
      <GroupTitle>{label}</GroupTitle>
      <dl className="m-0 grid grid-cols-[76px_1fr] gap-x-3.5 gap-y-3 text-[14px] items-start max-[640px]:grid-cols-1 max-[640px]:gap-y-0">
        {children}
      </dl>
    </section>
  );
}

export function ScheduleDetailView({
  kind,
  title,
  status,
  overdue,
  statusSource,
  ddlText,
  ddlInherited,
  ownerType,
  ownerName,
  note,
  remind,
  remindHint,
  timeText,
  startText,
  belongText,
  ancestors,
  childItems,
  onBack,
  onOpenAncestor,
  onOpenChild,
  onEdit,
  menu,
  showEdit,
}: ScheduleDetailViewProps) {
  const kids = childGroupTitle(kind);

  return (
    <div className="min-h-full">
      {/* ---------------- 头 (原型 .detail-hd) ---------------- */}
      <div className="flex items-center gap-2 pt-1 pb-3">
        <button
          type="button"
          data-detail-back
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[14px] text-fg-muted rounded-full py-1.5 pl-1 pr-2.5 transition-colors duration-150 hover:text-fg hover:bg-bg-elevated"
        >
          <ChevronLeftIcon size={16} className="w-4 h-4" />
          返回
        </button>
        <div className="flex-1" />
        {showEdit && (
          <button
            type="button"
            data-detail-edit
            aria-label="编辑"
            title="编辑"
            onClick={onEdit}
            className="w-9 h-9 rounded-full grid place-items-center text-fg-muted transition-colors duration-150 hover:text-fg hover:bg-white/[0.07]"
          >
            <PencilIcon size={17} className="w-[17px] h-[17px]" />
          </button>
        )}
        {menu}
      </div>

      {/* ---------------- 大标题 (原型 .detail-title.k-*) ---------------- */}
      <h1
        data-detail-title
        className={["m-0 mb-2.5 break-words", DETAIL_TITLE_CLASS[kind]].join(" ")}
      >
        {title}
      </h1>

      {/* ---------------- chips (原型 .dchips) ---------------- */}
      <div data-detail-chips className="flex items-center gap-2 flex-wrap mb-4">
        <span className={[CHIP, statusChipClass(status)].join(" ")}>{STATUS_LABEL[status]}</span>
        {overdue && <span className={[CHIP, "bg-danger-soft text-danger"].join(" ")}>已逾期</span>}
        <span className={[CHIP, "bg-brand-cyan/[0.13] text-brand-cyan"].join(" ")}>
          {KIND_LABEL[kind]}
        </span>
        <span className={[CHIP, "bg-bg-elevated text-fg-muted"].join(" ")}>{statusSource}</span>
      </div>

      {/* ---------------- 基本信息 ---------------- */}
      <Group label="基本信息">
        {/* ⚠️ 契约 v9.2 —— startAt 可空: 没值就**整行不渲染** (不显示 "—")。 */}
        {startText && (
          <Row label="开始时间">
            <span data-detail-start>{startText}</span>
          </Row>
        )}
        <Row label="DDL">
          <span className="inline-flex items-center gap-2 flex-wrap">
            <span data-detail-ddl>{ddlText || "—"}</span>
            {ddlInherited && <span className={[CHIP, "bg-bg-elevated text-fg-muted"].join(" ")}>继承</span>}
          </span>
        </Row>
        <Row label="责任人">
          <span className="inline-flex items-center gap-2 flex-wrap">
            <OwnerAvatar ownerType={ownerType} ownerName={ownerName} className="w-6 h-6" />
            <span data-detail-owner>{ownerName || (ownerType === "cody" ? "Cody" : "用户")}</span>
          </span>
        </Row>
        {remind && (
          <Row label={kind === "milestone" ? "默认提醒" : "提醒"}>
            <span className="inline-flex items-center gap-2 flex-wrap">
              <span
                className={[
                  CHIP,
                  remind.on ? "bg-brand/[0.15] text-brand" : "bg-bg-elevated text-fg-muted",
                ].join(" ")}
              >
                {remind.on ? remind.offsetText : "不提醒"}
              </span>
              {remind.channels.map((c) => (
                <span key={c} className={[CHIP, "bg-bg-elevated text-fg-muted"].join(" ")}>
                  {c}
                </span>
              ))}
              {remindHint && (
                <span className="w-full mt-1 text-[12px] text-fg-subtle leading-[1.4]">{remindHint}</span>
              )}
            </span>
          </Row>
        )}
        {timeText && <Row label="时间">{timeText}</Row>}
        {belongText && <Row label="归属">{belongText}</Row>}
      </Group>

      {/* ---------------- 备注 ---------------- */}
      <Group label="备注">
        <Row label="" full>
          <span data-detail-note className="text-fg-muted">
            {note || "—"}
          </span>
        </Row>
      </Group>

      {/* ---------------- 所属 (面包屑) ---------------- */}
      <Group label="所属">
        <Row label="" full>
          {ancestors.length ? (
            <span data-detail-crumb className="flex items-center gap-1.5 flex-wrap">
              {ancestors.map((a, i) => (
                <span key={a.id} className="inline-flex items-center gap-1.5">
                  {i > 0 && <span className="text-[12px] text-fg-subtle">›</span>}
                  <button
                    type="button"
                    data-crumb={a.id}
                    onClick={() => onOpenAncestor(a.kind, a.id)}
                    className="text-[14px] text-fg bg-transparent p-0 hover:text-brand hover:underline"
                  >
                    {a.title}
                  </button>
                  <span className="text-[12px] text-fg-subtle">({KIND_LABEL[a.kind]})</span>
                </span>
              ))}
            </span>
          ) : (
            <span data-detail-crumb className="text-fg-muted">
              {kind === "task" ? "顶层任务,无上级" : "游离日程 — 不属于任何关键节点"}
            </span>
          )}
        </Row>
      </Group>

      {/* ---------------- 子项 ---------------- */}
      <section data-detail-group={kids} className="bg-card rounded-2xl p-3.5 mb-3">
        <div className="text-[12px] text-fg-subtle mb-3 flex items-center gap-2.5 after:content-[''] after:flex-1 after:h-px after:bg-white/[0.06]">
          <span>
            {kids}{" "}
            <span className="text-[11px] bg-bg-elevated text-fg-muted rounded-full px-[7px] py-px">
              {childItems.length}
            </span>
          </span>
        </div>
        {childItems.length === 0 ? (
          <div data-detail-empty className="text-[13px] text-fg-subtle py-1.5">
            暂无{kids}
          </div>
        ) : (
          <div data-detail-children className="flex flex-col gap-2">
            {childItems.map((c) => (
              <div
                key={c.id}
                data-detail-child={c.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenChild(c.kind, c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpenChild(c.kind, c.id);
                  }
                }}
                className={[
                  "flex items-center gap-2.5 bg-white/[0.04] rounded-lg px-3 py-2.5 min-w-0 cursor-pointer",
                  "transition-colors duration-150 hover:bg-white/[0.08]",
                ].join(" ")}
              >
                <OwnerAvatar ownerType={c.ownerType} ownerName={c.ownerName} className="w-[18px] h-[18px]" />
                <span className={["flex-1 min-w-0 truncate", CHILD_NAME_CLASS[childLevel(c.kind)]].join(" ")}>
                  {c.title}
                </span>
                <span className="text-[11px] text-fg-subtle flex-none">{c.meta}</span>
                <span className={[CHIP, "flex-none", statusChipClass(c.status)].join(" ")}>
                  {STATUS_LABEL[c.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
