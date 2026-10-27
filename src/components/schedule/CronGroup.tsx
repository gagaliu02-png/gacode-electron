/**
 * components/schedule/CronGroup.tsx — 今日待办顶部的「定时任务」分组
 *
 * 抄自 web `gacode-web/src/components/schedule/CronGroup.tsx`, 只换 PC 写法:
 *   - `cn(...)`      → 数组 filter(Boolean).join(" ")
 *   - `lucide-react` → PC 图标唯一出处是 `components/ui/Glyphs.tsx`
 *     (`Pause` → `PauseIcon` / `Play` → `PlayIcon` / `Timer` → `TimerIcon`)
 *   - `bg-[var(--cron-soft)] text-[var(--cron)]` → `bg-cron/[0.16] text-cron`
 *     (PC 的 `tailwind.config.ts` 有 `cron: "#a78bfa"` 这个色阶, 但 `styles/globals.css`
 *      里**没有** `--cron` / `--cron-soft` 变量 ⇒ 直接用 Tailwind 色阶最稳;
 *      透明度 0.16 与 web 的 `rgba(167,139,250,0.16)` 逐位一致。)
 *
 * 冻结契约对 cron 的三条硬约束 (schedule-api.ts 端点清单里也抄了一份):
 *   ① 用户端没有 POST /crons, 也没有编辑语义的 PATCH —— 创建 / 编辑只走 Cody 的 LLM tool;
 *      所以这个分组里**永远不能出现新建或编辑入口**, 只有「暂停·启用」和「删除」。
 *   ② PATCH /crons/:id 只接受 {status:'paused'|'active'}。
 *   ③ DELETE /crons/:id 是硬删, 不可恢复 (cron 没有 archived 概念) —— 删除要二次确认。
 *
 * 视觉对齐原型 cronRow():
 *   定时器圆标 (专属紫) + 标题 15px + 一行元信息 (cron 描述紫 / 下次运行 / 已暂停 chip / 头像)
 *   + 分隔线 + 行内操作按钮. 暂停态整行 opacity .5 + 标题划掉 + 圆标转灰。
 */

import { OwnerAvatar } from "./OwnerAvatar";
import { RowActionMenu, type RowMenuItem } from "./RowActionMenu";
import { describeCron, relNext } from "./format";
import { PauseIcon, PlayIcon, TimerIcon } from "../ui/Glyphs";
import type { CronJob } from "../../lib/schedule-api";

interface CronGroupProps {
  crons: CronJob[];
  /** 时钟锚点, 用于「下次 明天 09:00」这类相对文案 */
  now: Date;
  onToggle: (job: CronJob) => void;
  onDelete: (job: CronJob) => void;
}

export function CronGroup({ crons, now, onToggle, onDelete }: CronGroupProps) {
  // 按下次运行时间升序 (原型口径); paused 也列出来, 否则暂停后用户以为被删了
  const rows = [...crons].sort((a, b) =>
    String(a.nextRunAt || "").localeCompare(String(b.nextRunAt || "")),
  );
  if (rows.length === 0) return null;

  return (
    <section aria-label="定时任务">
      {rows.map((job) => {
        const paused = job.state !== "active";

        const menuItems: RowMenuItem[] = [
          {
            key: "toggle",
            label: paused ? "启用" : "暂停",
            icon: paused ? (
              <PlayIcon size={14} className="w-[14px] h-[14px]" />
            ) : (
              <PauseIcon size={14} className="w-[14px] h-[14px]" />
            ),
            onSelect: () => onToggle(job),
          },
          {
            key: "delete",
            label: "删除",
            danger: true,
            separatorBefore: true,
            onSelect: () => onDelete(job),
          },
        ];

        return (
          <div
            key={job.id}
            data-cron-row
            className={[
              // 原型 .row.cronrow: bg --card / radius --r-lg / padding 13px 14px,
              //   .cronrow 再覆盖 padding-left:12px (即 上下 13px / 左 12px / 右 14px)
              "flex items-start bg-card rounded-lg py-[13px] pl-3 pr-[14px] mb-1",
              "transition-colors duration-150 hover:bg-card-hover",
              paused && "opacity-50",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {/* 定时器圆标 */}
            <span
              data-cron-ico
              className={[
                "w-[26px] h-[26px] rounded-full shrink-0 grid place-items-center mt-px mr-2.5",
                paused
                  ? "bg-white/[0.06] text-fg-subtle"
                  : "bg-cron/[0.16] text-cron",
              ].join(" ")}
            >
              <TimerIcon size={13} className="w-[13px] h-[13px]" />
            </span>

            <div className="flex-1 min-w-0">
              <div
                className={[
                  "text-[15px] leading-[22px] font-medium line-clamp-2 break-words",
                  paused && "line-through decoration-fg-subtle",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {job.title}
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-1.5 text-xs leading-4 text-fg-muted">
                <span className="text-cron">{describeCron(job.cronExpr)}</span>
                <span className="text-fg-subtle">下次 {relNext(job.nextRunAt, now)}</span>
                {paused && (
                  <span className="inline-flex items-center rounded-full bg-bg-elevated px-2 py-0.5 text-[11px] leading-4 text-fg-muted">
                    已暂停
                  </span>
                )}
                <OwnerAvatar ownerType={job.ownerType} ownerName="Cody" />
              </div>

              {/* 行内操作: 只有 暂停·启用 + 删除, 没有新建 / 编辑
                  原型 .cronacts: flex / gap 6px / margin-top 9px / padding-top 9px /
                  border-top 1px rgba(255,255,255,.06) / flex-wrap */}
              <div
                data-cron-acts
                className="flex items-center gap-1.5 flex-wrap mt-[9px] pt-[9px] border-t border-white/[0.06]"
              >
                <button
                  type="button"
                  onClick={() => onToggle(job)}
                  className="px-[11px] py-1 rounded-full text-xs leading-4 bg-white/[0.06] text-fg-muted transition-all duration-150 hover:bg-white/[0.11] hover:text-fg"
                >
                  {paused ? "启用" : "暂停"}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(job)}
                  className="px-[11px] py-1 rounded-full text-xs leading-4 bg-white/[0.06] text-fg-muted transition-all duration-150 hover:bg-danger-soft hover:text-danger"
                >
                  删除
                </button>
              </div>
            </div>

            <RowActionMenu
              items={menuItems}
              ariaLabel={`${job.title} 的更多操作`}
              className="ml-1 mt-px"
            />
          </div>
        );
      })}
    </section>
  );
}
