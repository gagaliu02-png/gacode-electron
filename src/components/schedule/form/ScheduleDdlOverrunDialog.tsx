/**
 * components/schedule/form/ScheduleDdlOverrunDialog.tsx — 「父级改早 → 下级越界」二次确认.
 *
 * 抄自 web `gacode-web/src/components/schedule/form/ScheduleDdlOverrunDialog.tsx`,
 * 只换 PC 写法:
 *   - `lucide-react` 的 `AlertTriangle` → PC 图标唯一出处是 `components/ui/Glyphs.tsx`
 *     (`AlertTriangleIcon`)
 *   - 本文件 web 侧没有 `cn(...)` ⇒ PC 侧也不需要类名合并工具。
 *
 * 原型逻辑 (schedule-center.html L2842-2853):
 *   下级 DDL 为空的 (继承型) 自动满足, 不算受影响;
 *   受影响 = child.ddl != null && child.ddl > parent.effDdl(新值);
 *   有受影响就**挂起**本次保存弹确认框 —— 取消则一个字节都不写;
 *   选「仍要修改」才落库, 且**下级数据不改** (只是变成越界状态)。
 *
 * 视觉口径 (原型 L497-520):
 *   .confirm  fixed / z 130 / left+top 50% / translate(-50%,-50%) / scale .95→1 /
 *             width min(360px, calc(100vw - 40px)) / bg --bg-elevated / radius 24px /
 *             shadow --shadow-dialog / padding 20px 20px 18px
 *   h3        16px / 500 / 24px ; .warnh 前置图标 --warning
 *   p         13.5px / 20px / --fg-muted
 *   列表      flex column / gap 8px / max-height 34vh / overflow-y auto
 *   .ddlrow   bg --card / radius 12px / padding 9px 11px / flex column / gap 4px
 *     .dr-t   13.5px / 500 / 19px (+ .chip)
 *     .dr-m   11.5px / --fg-muted / 17px (b = --warning)
 *   .acts     flex / gap 10px / 两个按钮各 flex 1
 */

import { AlertTriangleIcon } from "../../ui/Glyphs";

export interface DdlOverrunItem {
  id: string;
  title: string;
  /** 类型中文名 (任务 / 子任务 / 关键节点 / 日程) */
  kindLabel: string;
  /** 下级自己的 DDL (ISO) */
  ddl: string;
}

interface ScheduleDdlOverrunDialogProps {
  open: boolean;
  /** 被改早的父级标题 */
  parentTitle: string;
  /** 新 DDL 文案 (如「10月28日 18:00」) */
  nextDdlText: string;
  items: DdlOverrunItem[];
  onCancel: () => void;
  onConfirm: () => void;
}

function fmtDdl(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}月${d.getDate()}日 ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function ScheduleDdlOverrunDialog({
  open,
  parentTitle,
  nextDdlText,
  items,
  onCancel,
  onConfirm,
}: ScheduleDdlOverrunDialogProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[130] grid place-items-center px-5"
      role="alertdialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} aria-hidden="true" />
      <div className="relative w-full max-w-[360px] rounded-2xl bg-bg-elevated p-5 pb-[18px] shadow-dialog">
        <h3 className="m-0 mb-2 text-base font-medium leading-6 flex gap-2 items-start">
          <AlertTriangleIcon size={16} className="w-4 h-4 shrink-0 mt-[3px] text-warning" />
          <span>
            把「{parentTitle}」的截止时间改到 {nextDdlText}, 会让下面这些下级越界:
          </span>
        </h3>
        <p className="m-0 text-[13.5px] leading-5 text-fg-muted -mt-1 mb-3.5">
          下级截止时间<strong className="text-fg font-semibold">不会</strong>被自动修改。
        </p>
        <div className="flex flex-col gap-2 mb-4 max-h-[34vh] overflow-y-auto">
          {items.map((it) => (
            <div key={it.id} className="bg-card rounded-xl px-[11px] py-2 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-[13.5px] font-medium leading-[19px]">
                <span className="truncate">{it.title}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-bg-elevated px-2 py-0.5 text-[11px] leading-4 text-fg-muted shrink-0">
                  {it.kindLabel}
                </span>
              </div>
              <div className="text-[11.5px] text-fg-muted leading-[17px]">
                截止 <b className="text-warning font-medium">{fmtDdl(it.ddl)}</b> · 晚于新的上级截止时间
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-bg-elevated text-fg text-sm py-[9px] px-[18px] transition-colors duration-150 hover:bg-[#222]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-brand text-brand-on text-sm font-medium py-[9px] px-[18px] transition-[background,transform] duration-150 hover:bg-brand-hover active:scale-[0.96]"
          >
            仍要修改
          </button>
        </div>
      </div>
    </div>
  );
}
