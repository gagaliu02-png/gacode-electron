/**
 * components/common/CreateFab.tsx — 全站统一的「新建」悬浮按钮 (FAB)
 *
 * 抄自 web `gacode-web/src/components/common/CreateFab.tsx` (逐字搬运, 只换 PC 写法):
 *
 *   - `cn(...)`        → PC 全仓无 cn / clsx / tailwind-merge ⇒ 数组 filter(Boolean).join(" ")
 *   - `lucide-react`   → PC 图标唯一出处是 `components/ui/Glyphs.tsx` ⇒ `Plus` → `PlusIcon`
 *
 * 视觉基线 = docs/prototype/schedule-center.html 的 `.fab` (原型 v6 定稿):
 *   position:fixed; right:20px; bottom:20px; width:52px; height:52px;
 *   border-radius:var(--r-lg) (20px); background:var(--brand); color:var(--brand-on);
 *   display:grid; place-items:center;
 *   box-shadow:0 8px 24px rgba(255,107,53,.4)   ← 品牌橙色辉光, 不是黑色投影
 *   hover: background:var(--brand-hover) + translateY(-1px);  active: scale(.96)
 *
 * ⚠️ 为什么抽成组件:
 *   原先「新建」入口在 知识库 / 今日待办 / 任务看板 各写一套 class,
 *   三处的尺寸 / 圆角 / 阴影 / z-index 全不一样 (gaga 2026-10-21 反馈:
 *   「新建任务按钮要和前面几页的新建保持一致」)。现在统一走这一个组件。
 *
 * ⚠️ z-index 用 40 而不是原型的 70:
 *   原型的 70 是相对它自己的 z 栈 (topbar 40 / tabbar 35) 而言;
 *   PC 端全局 header 没有 z-index, 日程页 tab 栏 z-20, 行内 ⋮ 菜单 z-120,
 *   确认弹窗 z-130 —— 所以 40 正好「高于所有内容层、低于所有弹层」。
 *
 * ⚠️ PC 全局禁动效 (`styles/globals.css` 的 `animation/transition: none !important`)
 *   ⇒ `hover:-translate-y-px` / `active:scale-[0.96]` 在 PC 上不产生位移 (静态悬停色仍生效)。
 */

import type { ButtonHTMLAttributes } from "react";
import { PlusIcon } from "../ui/Glyphs";

/** 图标尺寸 —— 原型 SVG 是 22×22 / stroke-width 2.2。 */
const ICON_CLASS = "w-[22px] h-[22px]";

/** 圆角按钮本体 —— 原型 .fab 的全部视觉参数。 */
export const FAB_CLASS =
  "fixed bottom-5 right-5 z-40 w-[52px] h-[52px] rounded-lg bg-brand text-brand-on " +
  "grid place-items-center shadow-[0_8px_24px_rgba(255,107,53,0.4)] " +
  "hover:bg-brand-hover hover:-translate-y-px active:scale-[0.96] " +
  "transition-all duration-150";

export interface CreateFabProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "title"> {
  /** 无障碍标签 + toast 文案里的对象名 (如「新建任务」/「新建待办」/「采集内容」)。 */
  label: string;
}

export function CreateFab({ label, onClick, className, ...rest }: CreateFabProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={[FAB_CLASS, className].filter(Boolean).join(" ")}
      {...rest}
    >
      {/* lucide `plus` (22px / sw2.2) — 共享 <PlusIcon>
          (web `components/common/CreateFab.tsx:54` 的
           <Plus className="w-[22px] h-[22px]" strokeWidth={2.2} /> 同款) */}
      <PlusIcon size={22} strokeWidth={2.2} className={ICON_CLASS} />
    </button>
  );
}
