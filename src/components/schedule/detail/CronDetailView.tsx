/**
 * components/schedule/detail/CronDetailView.tsx — 定时任务 (cron) 详情页, **只读降级**
 * (原型 v6 §B4「定时任务详情页 — 只读」, L2327-2362) · PC 端 B6.
 *
 * 抄自 web `gacode-web/src/components/schedule/detail/CronDetailView.tsx` (181 行),
 * 只换 PC 写法:
 *   - `cn(...)`      → 数组 filter(Boolean).join(" ")
 *   - `lucide-react` → PC 图标唯一出处是 `components/ui/Glyphs.tsx`
 *     (`ChevronLeft` → `ChevronLeftIcon` / `Pause` → `PauseIcon` /
 *      `Play` → `PlayIcon` / `Trash2` → `TrashIcon`)
 *   - `from "@/components/schedule/OwnerAvatar"` → `from "../OwnerAvatar"`
 *   - `from "@/lib/schedule-api"` → `from "../../../lib/schedule-api"`
 *   - `from "@/components/schedule/format"` → `from "../format"`
 *
 * ⚠️ 契约硬约束 (契约 §9.3b + 原型 B1.3 #14):
 *   - cron **没有编辑入口** —— 用户端没有 POST /crons, 也没有编辑语义的 PATCH
 *     (PATCH /crons/:id 只接受 { status:'active'|'paused' })。
 *   - 详情页动作**恰好两个**: 暂停/启用 + 删除。**没有「编辑」按钮**。
 *   - 删除是硬删 (cron 没有 archived 概念) → 要二次确认。
 *
 * 视觉基线: 原型 .detail-title 20px/500/28 · .chip cron 用 --cron 紫 (#a78bfa) ·
 *   动作组 = 原型 L2341-2345 (btn-primary / btn-ghost + 右侧状态说明)。
 *
 * ⚠️ **有意偏离 web** (一处, 依据写在下面):
 *   web 的 cron chip 用 `bg-[var(--cron-soft)] text-[var(--cron)]` —— 依赖 web
 *   `styles/globals.css` 里的 `--cron-soft` / `--cron` 两个 CSS 变量。
 *   PC 的 `styles/globals.css` **没有** `--cron-soft` (而且它是冻结件, 不许改);
 *   PC 的 `tailwind.config.ts` 里已经有 `cron: "#a78bfa"` ⇒ 改用
 *   `bg-cron/[0.16] text-cron`。
 *   数值等价: web 的 `--cron-soft: rgba(167, 139, 250, 0.16)` = cron 色 @ 16% 不透明度
 *   (web globals.css:381-382) ⇒ 与 `bg-cron/[0.16]` 逐位一致。
 */

import type { ReactNode } from "react";
import { ChevronLeftIcon, PauseIcon, PlayIcon, TrashIcon } from "../../ui/Glyphs";
import { OwnerAvatar } from "../OwnerAvatar";
import type { CronJob } from "../../../lib/schedule-api";
import { describeCron } from "../format";

const CHIP = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-4";

export interface CronDetailViewProps {
  job: CronJob;
  /** 「今天 09:00」这类相对时间文案 (relNext)。 */
  nextRunText: string;
  /** 「2026-10-19 09:00」这类完整时间文案。 */
  lastRunText: string;
  /** 「2026-10-12 09:00」创建时间。 */
  createdText: string;
  onBack: () => void;
  onToggle: () => void;
  onDelete: () => void;
  /** ⋮ 菜单 (只有 暂停/启用 + 删除)。 */
  menu: ReactNode;
}

function Row({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <>
      <dt
        className={[
          "text-[13px] text-fg-muted text-right leading-5",
          "max-[640px]:text-left max-[640px]:mt-3",
          full && "max-[640px]:!mt-0",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {label}
      </dt>
      <dd className="m-0 leading-5 min-w-0 break-words max-[640px]:mt-[3px] max-[640px]:pb-3 max-[640px]:border-b max-[640px]:border-white/[0.06] max-[640px]:last:border-0">
        {children}
      </dd>
    </>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section data-detail-group={label} className="bg-card rounded-2xl p-3.5 mb-3">
      <div className="text-[12px] text-fg-subtle mb-3 flex items-center gap-2.5 after:content-[''] after:flex-1 after:h-px after:bg-white/[0.06]">
        {label}
      </div>
      <dl className="m-0 grid grid-cols-[76px_1fr] gap-x-3.5 gap-y-3 text-[14px] items-start max-[640px]:grid-cols-1 max-[640px]:gap-y-0">
        {children}
      </dl>
    </section>
  );
}

export function CronDetailView({
  job,
  nextRunText,
  lastRunText,
  createdText,
  onBack,
  onToggle,
  onDelete,
  menu,
}: CronDetailViewProps) {
  const paused = job.state !== "active";
  const ruleText = job.description || describeCron(job.cronExpr);

  return (
    <div className="min-h-full">
      {/* 头 —— ⚠️ 没有编辑按钮 (原型 L2330-2334) */}
      <div className="flex items-center gap-2 pt-1 pb-3">
        <button
          type="button"
          data-detail-back
          onClick={onBack}
          className="inline-flex items-center justify-center gap-1 text-[14px] text-fg-muted rounded-full py-1.5 pl-1 pr-2.5 transition-colors duration-150 hover:text-fg hover:bg-bg-elevated"
        >
          <ChevronLeftIcon size={16} className="w-4 h-4" />
          返回
        </button>
        <div className="flex-1" />
        {menu}
      </div>

      {/* 标题 —— 原型 .detail-title (20px/500/28) */}
      <h1
        data-detail-title
        className="m-0 mb-2.5 text-[20px] font-medium leading-7 break-words max-[640px]:text-[18px] max-[640px]:leading-[25px]"
      >
        {job.title}
      </h1>

      {/* chips —— 定时任务 / 运行中|已暂停 / 只读 */}
      <div data-detail-chips className="flex items-center gap-2 flex-wrap mb-4">
        {/* ⚠️ `bg-cron/[0.16]` = web 的 `--cron-soft` (见文件头「有意偏离 web」)。 */}
        <span className={[CHIP, "bg-cron/[0.16] text-cron"].join(" ")}>定时任务</span>
        <span
          className={[
            CHIP,
            paused ? "bg-bg-elevated text-fg-muted" : "bg-success/[0.16] text-success",
          ].join(" ")}
        >
          {paused ? "已暂停" : "运行中"}
        </span>
        <span className={[CHIP, "bg-bg-elevated text-fg-muted"].join(" ")}>只读</span>
      </div>

      {/* 动作组 —— 只有 暂停/启用 + 删除 */}
      <div data-cron-actions className="flex items-center gap-2 flex-wrap mb-3">
        <button
          type="button"
          data-cron-toggle
          onClick={onToggle}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-brand text-brand-on text-[13px] font-medium transition-colors duration-150 hover:bg-brand-hover"
        >
          {paused ? <PlayIcon size={13} className="w-[13px] h-[13px]" /> : <PauseIcon size={13} className="w-[13px] h-[13px]" />}
          {paused ? "启用" : "暂停"}
        </button>
        <button
          type="button"
          data-cron-delete
          onClick={onDelete}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/[0.06] text-danger text-[13px] font-medium transition-colors duration-150 hover:bg-danger-soft"
        >
          <TrashIcon size={13} className="w-[13px] h-[13px]" />
          删除
        </button>
        <span className="flex-1 min-w-[120px] text-right text-[12px] text-fg-subtle">
          {paused ? "已暂停 — 日程中心不再落点" : "运行中 — 到点交给 Cody 执行"}
        </span>
      </div>

      {/* 触发规则 */}
      <Group label="触发规则">
        <Row label="规则">
          <span>
            {ruleText}
            <span data-cron-expr className="block mt-1 text-[12px] text-fg-subtle font-mono">
              {job.cronExpr}
            </span>
          </span>
        </Row>
        <Row label="时区">{job.timezone || "—"}</Row>
        <Row label="下次运行">
          {paused ? <span className={[CHIP, "bg-bg-elevated text-fg-muted"].join(" ")}>已暂停</span> : nextRunText}
        </Row>
        <Row label="上次运行">{lastRunText}</Row>
      </Group>

      {/* 执行内容 */}
      {job.prompt ? (
        <Group label="执行内容">
          <Row label="" full>
            <span data-cron-prompt className="text-fg-muted">
              {job.prompt}
            </span>
          </Row>
        </Group>
      ) : null}

      {/* 基本信息 */}
      <Group label="基本信息">
        <Row label="责任人">
          <span className="inline-flex items-center gap-2 flex-wrap">
            <OwnerAvatar ownerType="cody" ownerName={job.ownerName || "Cody"} className="w-6 h-6" />
            <span>{job.ownerName || "Cody"}</span>
          </span>
        </Row>
        <Row label="创建时间">{createdText}</Row>
      </Group>
    </div>
  );
}
