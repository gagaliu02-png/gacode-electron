/**
 * components/deliveries/CardMenu.tsx — 交付卡片右上角的 ⋮ 菜单 (只含「删除」)
 *
 * 1:1 对齐 web `gacode-web/src/app/(main)/deliveries/page.tsx:685-714`:
 *   web 的 CardMenu 只有一项 —— 删除。2026-10-15 跟安卓对齐时, web 把「重试」
 *   项摘掉了 (web 注释: 「Android DeliveriesViewModel 不调 HTTP retry endpoint,
 *   web 没有这种后台下下载, retry 实际能力 = 用户点开详情页自己开 url」),
 *   PC 端的「重新下载」按钮与 ⋮ 菜单也按同一条口径对齐。
 *
 * 定位由调用方决定:
 *   - ImageCard / WebCard → 外层包 `<div className="absolute top-1.5 right-1.5 z-10">`
 *     (浮在卡片右上角, web 同款)
 *   - DocumentCard → 直接放进 flex row 末尾, 跟下载按钮并列 (web 同款)
 *
 * PC 的 DropdownMenu 组件 (`src/components/ui/DropdownMenu.tsx`) 容器 className
 * 是写死的 (min-w-[12rem] / rounded-md / border-border / bg-bg-elevated),
 * web 是 min-w-[8rem] / rounded-xl / border-0 / bg-popover —— 该组件不在本次
 * 独占改动范围, 差异已登记在对标台账 (超出范围, 交 PM 处理)。
 */

import type { Deliverable } from "../../lib/api";
import { DropdownMenu } from "../ui/DropdownMenu";
import { MoreIcon, TrashIcon } from "../ui/Glyphs";

export interface CardMenuProps {
  item: Deliverable;
  onDelete: (item: Deliverable) => void;
}

export function CardMenu({ item, onDelete }: CardMenuProps) {
  return (
    <DropdownMenu
      align="right"
      trigger={
        <button
          type="button"
          aria-label="更多"
          className={[
            "shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-muted",
            "transition-colors duration-150 inline-flex items-center justify-center outline-none",
          ].join(" ")}
        >
          <MoreIcon className="w-4 h-4" />
        </button>
      }
      items={[
        {
          label: "删除",
          destructive: true,
          render: (
            <span className="inline-flex items-center gap-2">
              <TrashIcon className="w-4 h-4" />
              删除
            </span>
          ),
          onClick: () => onDelete(item),
        },
      ]}
    />
  );
}
