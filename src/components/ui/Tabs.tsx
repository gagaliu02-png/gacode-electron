/**
 * components/ui/Tabs.tsx — 阶段 4 通用 Tabs (chip / underline 双 variant)
 *
 * 设计目标:
 *   - variant='pill' (默认, 向后兼容): inline-flex p-1 + active bg-brand, 跟旧 chip 一致
 *   - variant='underline' (新增, PC-6 Library 用): flex gap-6 + 底部 2px brand 下划线,
 *     跟 gacode-web Library Tabs 视觉对齐 (文字 + 下划线)
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
 */

export interface TabsTab {
  /** 唯一键 (字符串/number), 跟 activeKey 比较用 === */
  key: string;
  label: string;
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
    // 下划线变体 — 文字 tab + 底部 2px brand 下划线
    //   对齐 gacode-web Library Tabs: flex gap-6 + border-b 容器 + after 伪元素下划线
    //   active: text-fg + after 下划线显示; inactive: text-fg-muted
    return (
      <div
        className={[
          "flex gap-6 border-b border-border",
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
                // pb-2 给下划线留 2px 高的位置; relative 让 after 定位到 button 内部
                "relative pb-2 text-sm transition-colors duration-150",
                "disabled:opacity-50 disabled:pointer-events-none",
                "inline-flex items-center gap-1",
                // after 伪元素: active 时 bg-brand, inactive 时 bg-transparent
                "after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:transition-colors",
                isActive
                  ? "text-fg font-medium after:bg-brand"
                  : "text-fg-muted hover:text-fg after:bg-transparent",
              ].join(" ")}
            >
              <span>{t.label}</span>
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
            <span>{t.label}</span>
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
