/**
 * components/ui/Tabs.tsx — 阶段 4 通用 Tabs (chip 样式)
 *
 * 设计目标:
 *   - 跟 Library / Deliveries 顶部类型 chip 同款视觉 (inline-flex p-1 + active bg-brand)
 *   - 自管 active key + onChange, 不耦合具体业务; 也可以做 controlled (activeKey/onChange)
 *
 * 用法:
 *   <Tabs
 *     tabs={[
 *       { key: 'all', label: '全部' },
 *       { key: 'image', label: '图片' },
 *       { key: 'doc', label: '文档' },
 *     ]}
 *     activeKey={type}
 *     onChange={setType}
 *   />
 *
 *   <Tabs tabs={[{key:'a',label:'A',count:7}]} value={x} onChange={setX} />  // controlled
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

export interface TabsProps {
  tabs: TabsTab[];
  /** 受控:外部维护 activeKey */
  activeKey: string;
  onChange: (key: string) => void;
  /** 自定义 className (容器) */
  className?: string;
}

export function Tabs({ tabs, activeKey, onChange, className = "" }: TabsProps) {
  return (
    <div
      className={[
        "inline-flex p-1 rounded-md bg-bg-elevated border border-border gap-1",
        className,
      ].join(" ")}
      role="tablist"
    >
      {tabs.map((t) => {
        const active = t.key === activeKey;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={t.disabled}
            onClick={() => {
              if (t.disabled) return;
              onChange(t.key);
            }}
            className={[
              "px-3 py-1 text-sm rounded transition-colors duration-150",
              "disabled:opacity-50 disabled:pointer-events-none",
              "inline-flex items-center gap-1",
              active
                ? "bg-brand text-brand-on shadow-sm"
                : "text-fg-muted hover:text-fg",
            ].join(" ")}
          >
            <span>{t.label}</span>
            {typeof t.count === "number" ? (
              <span
                className={[
                  "text-xs tabular-nums",
                  active ? "opacity-80" : "opacity-70",
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
