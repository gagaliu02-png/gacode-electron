/**
 * components/ui/Avatar.tsx — 头像 (hash 调色板)
 *
 * 对齐 gacode-web/src/components/ui/avatar.tsx:12-28 + :65-86 (C2-29, 2026-10-26):
 *   - 兜底底色 = 由 seed (用户名 / 邮箱) hash 出来的 5 色调色板之一
 *     (brand / cyan / yellow / red / green), 文字固定 #000000
 *   - 无 seed 时底色 #181818 (bg-bg-elevated) + 文字 #e5e7eb (text-fg)
 *   - 有 src 时渲染 img (object-cover)
 */

import type { ReactNode } from "react";

/** 稳定调色板 — 跟 gagaOS BrandColors 一致 */
const PALETTE = [
  "#FF6B35", // brand
  "#0dcaf0", // cyan
  "#ffc700", // yellow
  "#c8102e", // red
  "#198754", // green
];

function hashColor(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % PALETTE.length;
  return PALETTE[idx];
}

export interface AvatarProps {
  /** 兜底色的 hash 种子 (用户名 / 邮箱) */
  seed?: string;
  /** 头像图 URL — 有则渲染 img, 无则渲染首字母 */
  src?: string | null;
  /** 首字母文本 */
  children?: ReactNode;
  className?: string;
}

export function Avatar({ seed, src, children, className = "" }: AvatarProps) {
  const bg = seed ? hashColor(seed) : undefined;
  return (
    <div
      className={[
        "relative flex h-24 w-24 shrink-0 overflow-hidden rounded-full",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {src ? (
        <img src={src} alt="" className="aspect-square h-full w-full object-cover" />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center rounded-full font-semibold uppercase"
          style={{ background: bg ?? "#181818", color: bg ? "#000000" : "#e5e7eb" }}
        >
          {children}
        </span>
      )}
    </div>
  );
}
