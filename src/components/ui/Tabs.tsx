/**
 * components/ui/Tabs.tsx — 阶段 4 通用 Tabs (chip / underline 双 variant)
 *
 * 设计目标:
 *   - variant='pill' (默认, 向后兼容): inline-flex p-1 + active bg-brand, 跟旧 chip 一致
 *   - variant='underline': 文字 + 底部内缩 12px 的 brand 下划线,
 *     逐条对齐 gacode-web/src/components/ui/tabs.tsx (L-01 ~ L-05, 2026-10-26)
 *   - 自管 active key + onChange, 不耦合具体业务; 也可以做 controlled (activeKey/onChange)
 *
 * 用法:
 *   <Tabs
 *     variant="underline"
 *     tabs={[
 *       { key: 'all', label: '全部' },
 *       { key: 'image', label: '图片' },
 *       { key: 'doc', label: '文档' },
 *     ]}
 *     activeKey={type}
 *     onChange={setType}
 *   />
 *
 *   <Tabs tabs={[{key:'a',label:'A',count:7}]} value={x} onChange={setX} />  // controlled, 默认 pill
 *
 * 2026-10-26 (L-15): tab 支持前置图标 (icon 插槽) — 调用方自己传 svg:
 *   <Tabs variant="underline" tabs={[{ key:'all', label:'全部', icon:<GridIcon className="w-4 h-4" /> }]} … />
 */

import type { ReactNode } from "react";

export interface TabsTab {
  /** 唯一键 (字符串/number), 跟 activeKey 比较用 === */
  key: string;
  label: string;
  /**
   * 可选前置图标 — ReactNode, 调用方自己传 svg, 组件不绑死图标集.
   *
   * 2026-10-26 (L-15): web `library/page.tsx:438` 的 tab trigger 是
   *   `<t.icon className="w-4 h-4 mr-1.5" />` + 文案.
   *   PC 没有 lucide-react ⇒ 图标由调用方传, 本组件只负责「图标 + 文案」的间距
   *   (图标容器 `mr-1.5` = 6px, 与 web 一致).
   *   ⚠️ 图标 + 文案包在同一个 inline-flex 容器里 ⇒ 父级 flex 的 `gap-1`
   *     不会叠加到「图标↔文案」之间 (否则 4+6=10px ≠ web 的 6px),
   *     同时 label↔count 的 gap 保持原样 (icon 为空时布局完全不变).
   */
  icon?: ReactNode;
  /** 右侧小计 (badge 形式) */
  count?: number;
  /** 禁用 (灰色) */
  disabled?: boolean;
}

export type TabsVariant = "pill" | "underline";

export interface TabsProps {
  tabs: TabsTab[];
  /** 受控:外部维护 activeKey */
  activeKey: string;
  onChange: (key: string) => void;
  /** 自定义 className (容器) */
  className?: string;
  /** pill (默认) | underline — 视觉变体 */
  variant?: TabsVariant;
}

export function Tabs({
  tabs,
  activeKey,
  onChange,
  className = "",
  variant = "pill",
}: TabsProps) {
  const active = (key: string) => key === activeKey;

  if (variant === "underline") {
    // 下划线变体 — 文字 tab + 内缩 12px 的 2px brand 下划线
    //   对齐 gacode-web/src/components/ui/tabs.tsx:55-88 (L-01 ~ L-05):
    //   容器无 border-b (去线化) + gap-1 + 横向滚动;
    //   按钮 px-4 py-2.5 / text-sm font-medium (全部态);
    //   下划线 after:inset-x-3 + after:rounded-t;
    //   未选中态补 hover:bg-accent。
    return (
      <div
        className={[
          // L-01: 去掉 border-b, gap-6 → gap-1, 补横向滚动 (web TabsList 原串)
          "flex items-center justify-start gap-1 overflow-x-auto scrollbar-none",
          className,
        ].join(" ")}
        role="tablist"
      >
        {tabs.map((t) => {
          const isActive = active(t.key);
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={t.disabled}
              onClick={() => {
                if (t.disabled) return;
                onChange(t.key);
              }}
              className={[
                // L-02 + L-05: px-4 py-2.5 / text-sm font-medium (font-medium 对全部态生效)
                // gap-1 是 PC 独有 (label 与右侧 count 之间要留缝), web 无 count 元素
                "relative inline-flex items-center justify-center whitespace-nowrap gap-1 px-4 py-2.5 text-sm font-medium transition-colors duration-150",
                // 键盘 focus 环 — 逐字对齐 web `components/ui/tabs.tsx:82` 的
                // `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`
                // (web 只有一个 trigger, PC 的 underline 变体就是它的对应物;
                //  pill 变体是 PC 独有 ⇒ 不加)。
                // ⚠️ PC 无 tailwind-merge ⇒ ring-2 与 ring-ring 分属两个工具类
                //   (ringWidth / ringColor), 各自独立生效, 不会互相覆盖。
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                // L-02: disabled 两项顺序对齐 web
                "disabled:pointer-events-none disabled:opacity-50",
                // L-03: 下划线左右各内缩 12px + 顶部圆角
                // ⚠️ 不写 after:bg-transparent: PC 无 tailwind-merge, 而产物里 .after\:bg-transparent
                //   排在 .after\:bg-brand **之后** (CSS 顺序取胜者) ⇒ 会把选中态的品牌色下划线盖成透明。
                //   web 的 inactive 分支同样不写 (after 背景默认就是透明) — 对齐 web。
                "after:content-[''] after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-t after:transition-colors",
                // L-04: 未选中态补 hover:bg-accent
                isActive
                  ? "text-fg after:bg-brand"
                  : "text-fg-muted hover:text-fg hover:bg-accent",
              ].join(" ")}
            >
              {/* 图标 + 文案包在同一 inline-flex 里 ⇒ 父级 gap-1 不叠加到图标↔文案之间
                  (web 是 icon `mr-1.5` = 6px, 不带父级 gap) */}
              <span className="inline-flex items-center">
                {t.icon ? (
                  <span className="mr-1.5 inline-flex items-center">{t.icon}</span>
                ) : null}
                <span>{t.label}</span>
              </span>
              {typeof t.count === "number" ? (
                <span
                  className={[
                    "text-xs tabular-nums",
                    isActive ? "opacity-80" : "opacity-70",
                  ].join(" ")}
                >
                  {t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    );
  }

  // pill 变体 (默认) — 旧 chip 视觉, 保持完全不变以防破坏现有调用点
  return (
    <div
      className={[
        "inline-flex p-1 rounded-md bg-bg-elevated gap-1",
        className,
      ].join(" ")}
      role="tablist"
    >
      {tabs.map((t) => {
        const isActive = active(t.key);
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={t.disabled}
            onClick={() => {
              if (t.disabled) return;
              onChange(t.key);
            }}
            className={[
              "px-3 py-1 text-sm rounded transition-colors duration-150",
              "disabled:opacity-50 disabled:pointer-events-none",
              "inline-flex items-center gap-1",
              isActive
                ? "bg-brand text-brand-on shadow-sm"
                : "text-fg-muted hover:text-fg",
            ].join(" ")}
          >
            {/* pill 变体同样支持 icon (与 underline 变体同款间距逻辑) */}
            <span className="inline-flex items-center">
              {t.icon ? (
                <span className="mr-1.5 inline-flex items-center">{t.icon}</span>
              ) : null}
              <span>{t.label}</span>
            </span>
            {typeof t.count === "number" ? (
              <span
                className={[
                  "text-xs tabular-nums",
                  isActive ? "opacity-80" : "opacity-70",
                ].join(" ")}
              >
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
