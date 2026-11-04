/**
 * components/profile/ProfileMenuItem.tsx — 菜单卡 (图标 + 标题 + 副标题 + 箭头)
 *
 * 对齐 web `src/components/profile/ProfileParts.tsx:106-140` 的 ProfileMenuItem
 * (安卓 ProfileTab 的 DeliveryCenterMenuItem 同款: Card + Icon(primary) +
 *  Column{标题 + 副标题} + ArrowForward)。
 *
 * 用在两处 (批 G12 · 2026-11-04):
 *   - 「我的」页菜单卡: 交付中心 (副标题 "N 项交付物") + IM 配对码
 *   - 「设置」页隐私组: 修改密码 + 注销账号 (danger)
 *
 * ⚠️ 图标组件是 PC 自绘的 `Glyphs.tsx` (不是 web 的 lucide) ——
 *    传 className="w-5 h-5" + size={20} 对齐 web 的 `w-5 h-5`。
 */

import type { ReactNode } from "react";
import { ChevronRightIcon } from "../ui/Glyphs";

export interface ProfileMenuItemProps {
  /** 图标 (PC Glyphs 组件) */
  icon: ReactNode;
  title: string;
  /** 副标题 (安卓同款: 交付中心 = "N 项交付物", IM 配对码 = "去微信/元宝绑定本账号") */
  subtitle?: string;
  onClick?: () => void;
  /** danger = 危险操作 (注销账号) */
  tone?: "default" | "danger";
}

export function ProfileMenuItem({
  icon,
  title,
  subtitle,
  onClick,
  tone = "default",
}: ProfileMenuItemProps) {
  const danger = tone === "danger";
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full rounded-md bg-bg-elevated p-5 flex items-center gap-4 text-left",
        "transition-colors duration-150 hover:bg-bg-base",
      ].join(" ")}
    >
      <span
        className={[
          "shrink-0 inline-flex items-center justify-center",
          danger ? "text-danger" : "text-brand",
        ].join(" ")}
      >
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span
          className={["block text-base", danger ? "text-danger" : "text-fg"].join(" ")}
        >
          {title}
        </span>
        {subtitle ? (
          <span className="block text-xs text-fg-muted mt-0.5">{subtitle}</span>
        ) : null}
      </span>
      <ChevronRightIcon strokeWidth={1.6} className="text-fg-muted shrink-0" />
    </button>
  );
}
