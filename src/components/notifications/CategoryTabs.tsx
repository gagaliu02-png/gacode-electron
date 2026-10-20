/**
 * components/notifications/CategoryTabs.tsx — 通知分类 tab
 * (gacode-electron 0.7.5 P1 notifications-6)
 *
 * 5 类: 全部 / 系统 / 聊天 / 库 / 交付.
 * 跟 chat-detail 的 Tabs 组件视觉对齐 (复用 Tabs 即可, 但这里按通知场景
 * 单独包一层以便以后扩展徽章 / 屏蔽状态).
 *
 * 用法:
 *   <CategoryTabs active={category} onChange={setCategory} />
 *
 * - active="all"      → 不发 category query, server 端 listNotifications 默认 all
 * - active="system"   → ?category=system
 * - 其它类同
 */

import { Tabs, type TabsTab } from "../ui/Tabs";

export type NotificationCategory = "all" | "system" | "chat" | "library" | "delivery";

export interface CategoryTabsProps {
  active: NotificationCategory;
  onChange: (key: NotificationCategory) => void;
  /** 可选每类计数 (右上角小计), 跟 audit §3.8 表格一致 */
  counts?: Partial<Record<NotificationCategory, number>>;
}

const TAB_DEFS: { key: NotificationCategory; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "system", label: "系统" },
  { key: "chat", label: "聊天" },
  { key: "library", label: "库" },
  { key: "delivery", label: "交付" },
];

export function CategoryTabs({ active, onChange, counts }: CategoryTabsProps) {
  const tabs: TabsTab[] = TAB_DEFS.map((t) => ({
    key: t.key,
    label: t.label,
    count: counts?.[t.key],
  }));
  return (
    <div className="overflow-x-auto scrollbar-none">
      {/* PC-7 (2026-10-20 gagaOS 拍板): pill → underline — 复用 PC-6 (batch 5)
         已经做好的 <Tabs variant="underline">, 不另起一套下划线实现.
         外层 container 的 border-b 由 Tabs underline 变体自带, 调用方不要再叠. */}
      <Tabs
        variant="underline"
        tabs={tabs}
        activeKey={active}
        onChange={(k) => onChange(k as NotificationCategory)}
      />
    </div>
  );
}