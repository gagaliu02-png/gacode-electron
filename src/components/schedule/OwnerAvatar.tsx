/**
 * components/schedule/OwnerAvatar.tsx — 责任人头像
 *
 * 抄自 web `gacode-web/src/components/schedule/OwnerAvatar.tsx`, 只换 PC 写法:
 *   - `cn(...)`      → 数组 filter(Boolean).join(" ")
 *   - `lucide-react` → PC 图标唯一出处是 `components/ui/Glyphs.tsx` (`Bot` → `BotIcon`)
 *
 * 原型 avatar() 有三态 (me / llm / 普通 user), 本实现按产品规则只保留两态:
 *   - user: 圆形底 + 名字首字母大写 (取真实名字, 例如 gaga → "G")
 *   - cody: 圆形底 + Cody 图标
 *
 * ⚠️ 界面上只用真实名字或固定字面量, 不出现第一人称自称, 也不出现按角色分类的占位文案 ——
 *    两态都用实名 / 固定名。
 */

import { BotIcon } from "../ui/Glyphs";
import type { OwnerType } from "../../lib/schedule-api";

interface OwnerAvatarProps {
  ownerType: OwnerType;
  /** ownerType==='user' 时的真实名字快照 (DTO 里给的是 user 表里的名字) */
  ownerName: string;
  className?: string;
}

export function OwnerAvatar({ ownerType, ownerName, className }: OwnerAvatarProps) {
  if (ownerType === "cody") {
    return (
      <span
        title="Cody"
        aria-label="Cody"
        className={[
          "w-6 h-6 rounded-full shrink-0 inline-flex items-center justify-center",
          "bg-brand-cyan/[0.15] text-brand-cyan border border-brand-cyan/30",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <BotIcon size={13} className="w-[13px] h-[13px]" />
      </span>
    );
  }

  const initial = ownerName ? ownerName.slice(0, 1).toUpperCase() : "?";
  return (
    <span
      title={ownerName}
      aria-label={ownerName}
      className={[
        "w-6 h-6 rounded-full shrink-0 inline-flex items-center justify-center",
        // ⚠️ 原型 .av.me: bg --brand-container (#4A1F0A) / 字 --brand-on-container (#FFD7B8) /
        //    border transparent。
        //    这里写死色值, 不用 text-brand-on-container —— tailwind.config.ts 里的 key 是
        //    `onContainer`, 生成出来的类名是 `text-brand-onContainer` (camelCase);
        //    `text-brand-on-container` **不是**合法工具类 → 编译后无此规则, 字色失效 (继承 --fg)。
        "bg-brand-container text-[#FFD7B8] border border-transparent",
        "text-[11px] leading-none",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {initial}
    </span>
  );
}
