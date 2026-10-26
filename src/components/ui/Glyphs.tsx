/**
 * components/ui/Glyphs.tsx — 全站共享的内联 SVG 图标 (2026-10-26)
 *
 * 背景 (gaga 2026-10-22 铁律「组件意识: 禁止重复实现」):
 *   PC 仓没有 lucide-react (F-2), 所以图标全是手写内联 svg. 之前这些 svg
 *   散落在各组件文件里各写一份 (同一个 pin 写两遍、同一个 x 写两遍、同一个
 *   放大镜写两遍), 改一个形状要改 N 处.
 *   本文件把这些内联 svg 收成**具名导出**, 各组件改成 import 复用.
 *
 * ⚠️ 抽取铁律 (本文件存在的前提):
 *   1. **path 逐字保留** — 图形来自原实现, 一个字符都没改.
 *   2. **尺寸 / strokeWidth 一字不变** — 每个图标保留自己原始的默认
 *      width/height/strokeWidth (同名不同形的图标**不合并**, 见下表).
 *   3. **className 追加而非替换** — 原调用点传的 className 行为不变.
 *   4. **属性不增不减** — 原 svg 上没有 stroke 的 (如 MoreVertIcon) 这里也不加.
 *
 * 同名不同形 → 分开导出 (path / 尺寸 / stroke 都不同, 合并会改视觉):
 *   - `PinIcon`      侧栏置顶 (16px / sw2, lucide 新版 path)
 *   - `PinRowIcon`   对话列表行内置顶 (14px / sw1.6, lucide 旧版 path)
 *   - `SearchIcon`   对话列表顶部搜索按钮 (22px / sw1.6, 直线手柄)
 *   - `SearchFieldIcon` 输入框前缀放大镜 (16px / sw2, path 手柄)
 *   - `MoreVertIcon` 实心三点 (fill=currentColor)
 *   - `MoreIcon`     描边三点 (stroke=currentColor)
 *
 * 本文件只放**图形**, 不放业务逻辑; 调用方自己决定尺寸 / 颜色 / 布局.
 */

/** 所有图标的通用 props */
export interface GlyphProps {
  /** 追加到 svg 上的 className (原调用点怎么传就怎么传, 行为不变) */
  className?: string;
  /** 尺寸 (px) — 覆盖 svg 的 width/height, 默认 = 该图标原始值 */
  size?: number;
  /** 描边宽度 — 默认 = 该图标原始 strokeWidth */
  strokeWidth?: number;
}

// ════════════════════════════════════════════════════════════
// 侧栏 / 导航图标 (来源: components/layout/AppShell.tsx)
// ════════════════════════════════════════════════════════════

/** lucide `chevron-right` — 16×16 / sw2 */
export function ChevronRightIcon({ className, size = 16, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["transition-transform duration-150", className].filter(Boolean).join(" ")}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/** lucide `arrow-left` — 20×20 / sw1.6 */
export function ArrowLeftIcon({ className, size = 20, strokeWidth = 1.6 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

/** lucide `bell` — 20×20 / sw2 */
export function BellIcon({ className, size = 20, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/** lucide `pin` (新版 path) — 16×16 / sw2 */
export function PinIcon({ className, size = 16, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 17v5" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6H9v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
}

/** lucide `pin-off` — 16×16 / sw2 */
export function PinOffIcon({ className, size = 16, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 17v5" />
      <path d="M15 6H9v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h5" />
      <path d="M19 17h-5" />
      <path d="m2 2 20 20" />
    </svg>
  );
}

/** lucide `book-open` — 20×20 / sw2 */
export function BookOpenIcon({ className, size = 20, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </svg>
  );
}

/** lucide `package-open` — 20×20 / sw2 */
export function PackageOpenIcon({ className, size = 20, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 13v8a2 2 0 0 0 1.7 1l4.3-2.1a2 2 0 0 0 1-1.7V6a2 2 0 0 0-1-1.7l-4.3-2.1a2 2 0 0 0-2 0L7.4 4.3A2 2 0 0 0 6 6v8.3" />
      <path d="m12 13 4.3-2.1a2 2 0 0 1 2 0l2.7 1.4a2 2 0 0 1 1 1.7v4.4a2 2 0 0 1-1 1.7l-4.3 2.1a2 2 0 0 1-2 0l-4.3-2.1a2 2 0 0 1-1-1.7V16a2 2 0 0 1 1-1.7z" />
    </svg>
  );
}

/** lucide `package` — 20×20 / sw2 */
export function PackageIcon({ className, size = 20, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
      <path d="M12 22V12" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 12v-9" />
    </svg>
  );
}

/** lucide `globe` — 20×20 / sw2 */
export function GlobeIcon({ className, size = 20, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  );
}

/** lucide `user` — 20×20 / sw2 */
export function UserIcon({ className, size = 20, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

/** lucide `clock` — 14×14 / sw1.6 */
export function ClockIcon({ className, size = 14, strokeWidth = 1.6 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

/** lucide `message-circle` 简化版 (对话气泡) — 14×14 / sw1.6 */
export function ChatBubbleIcon({ className, size = 14, strokeWidth = 1.6 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["shrink-0 text-fg-muted", className].filter(Boolean).join(" ")}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

/** lucide `log-out` — 14×14 / sw1.6 */
export function LogoutIcon({ className, size = 14, strokeWidth = 1.6 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

// ════════════════════════════════════════════════════════════
// 对话列表页图标 (来源: routes/ChatList.tsx)
// ════════════════════════════════════════════════════════════

/** lucide `pin` (旧版 path, 圆头) — 14×14 / sw1.6 (与上面的 PinIcon 不同形) */
export function PinRowIcon({ className, size = 14, strokeWidth = 1.6 }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <line x1="12" y1="17" x2="12" y2="22" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h0a3 3 0 0 0-3-3v0a3 3 0 0 0-3 3v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
}

/** 三点菜单 (实心点, fill=currentColor, **无 stroke**) — 14×14 */
export function MoreVertIcon({ className, size = 14 }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="5" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="12" cy="19" r="1.4" />
    </svg>
  );
}

/** lucide `pencil` — 14×14 / sw1.6 */
export function PencilIcon({ className, size = 14, strokeWidth = 1.6 }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

/** lucide `trash-2` — 16×16 / sw2 */
export function TrashIcon({ className, size = 16, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

/** lucide `message-square-plus` — 24×24 / sw2 */
export function MessageSquarePlusIcon({ className, size = 24, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <path d="M12 8v8" />
      <path d="M8 12h8" />
    </svg>
  );
}

/** lucide `x` — 20×20 / sw2 (关闭 / 退出多选 / 关闭错误提示) */
export function CloseIcon({ className, size = 20, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

/** lucide `check-check` — 16×16 / sw2 */
export function CheckCheckIcon({ className, size = 16, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M18 6 7 17l-5-5" />
      <path d="m22 10-7.5 7.5L13 16" />
    </svg>
  );
}

/** lucide `search` (直线手柄) — 22×22 / sw1.6 (对话列表顶部搜索按钮) */
export function SearchIcon({ className, size = 22, strokeWidth = 1.6 }: GlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// ════════════════════════════════════════════════════════════
// 对话详情页图标 (来源: routes/ChatDetail.tsx)
// ════════════════════════════════════════════════════════════

/** 三点菜单 (描边点, stroke=currentColor) — 16×16 / sw1.6 (与 MoreVertIcon 不同形) */
export function MoreIcon({ className, size = 16, strokeWidth = 1.6 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="5" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="12" cy="19" r="1.4" />
    </svg>
  );
}

/** lucide `plus` — 20×20 / sw2 */
export function PlusIcon({ className, size = 20, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}

// ════════════════════════════════════════════════════════════
// 流式错误 banner 图标 (来源: components/chat/StreamingErrorBanner.tsx)
// ════════════════════════════════════════════════════════════

/** lucide `circle-alert` — 16×16 / sw2 */
export function AlertCircleIcon({ className, size = 16, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["w-4 h-4 shrink-0", className].filter(Boolean).join(" ")}
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

/** lucide `rotate-cw` — 12×12 / sw2 */
export function RotateCwIcon({ className, size = 12, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}

// ════════════════════════════════════════════════════════════
// 审批 banner 图标 (来源: components/chat/ApprovalBanner.tsx)
// ════════════════════════════════════════════════════════════

/** lucide `triangle-alert` — 20×20 / sw2 */
export function AlertTriangleIcon({ className, size = 20, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

// ════════════════════════════════════════════════════════════
// Home 域图标 (来源: components/home/LibraryPicker.tsx + EmojiPicker.tsx)
// ════════════════════════════════════════════════════════════

/** lucide `search` (path 手柄) — 16×16 / sw2 (输入框前缀) */
export function SearchFieldIcon({ className, size = 16, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted", className].filter(Boolean).join(" ")}
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

/** lucide `check` (粗) — 14×14 / sw3 (勾选框对勾) */
export function CheckGlyph({ className, size = 14, strokeWidth = 3 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** lucide `library` (书脊造型) — 40×40 / sw1.6 (知识库空态) */
export function LibraryIcon({ className, size = 40, strokeWidth = 1.6 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["w-10 h-10 opacity-40", className].filter(Boolean).join(" ")}
    >
      <path d="m16 6 4 14" />
      <path d="M12 6v14" />
      <path d="M8 8v12" />
      <path d="M4 4v16" />
    </svg>
  );
}

/** 知识库条目类型图标 — image — 20×20 / sw1.6 */
export function ImageTypeIcon({ className, size = 20, strokeWidth = 1.6 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["w-5 h-5 text-brand-cyan", className].filter(Boolean).join(" ")}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

/** 知识库条目类型图标 — doc — 20×20 / sw1.6 */
export function DocTypeIcon({ className, size = 20, strokeWidth = 1.6 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["w-5 h-5 text-brand", className].filter(Boolean).join(" ")}
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

/** 知识库条目类型图标 — link — 20×20 / sw1.6 */
export function LinkTypeIcon({ className, size = 20, strokeWidth = 1.6 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["w-5 h-5 text-brand-cyan", className].filter(Boolean).join(" ")}
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

// ════════════════════════════════════════════════════════════
// 执行时间线图标 (来源: components/chat/ExecutionTimeline.tsx)
// ════════════════════════════════════════════════════════════

/**
 * lucide `brain` — 14×14 / sw2
 *
 * ⚠️ 与 `ImageTypeIcon` / `DocTypeIcon` 同形不同规格, 故分开导出
 *    (同本文件顶部约定「同名不同形 → 分开导出」):
 *    - `ImageTypeIcon` = 20×20 / sw1.6 / className 注入 `w-5 h-5 text-brand-cyan`
 *    - `DocTypeIcon`   = 20×20 / sw1.6 / className 注入 `w-5 h-5 text-brand`
 *    - 本文件 `ImageIcon` / `FileTextIcon` = 12×12 / sw2 / className 原样透传
 *    合并会改视觉 (PC 无 tailwind-merge → `.w-5` 产物顺序在 `.w-3` 之后会赢)
 */
export function BrainIcon({ className, size = 14, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
      <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
      <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4" />
      <path d="M17.599 6.5a3 3 0 0 0 .399-1.375" />
      <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
      <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
      <path d="M19.938 10.5a4 4 0 0 1 .585.396" />
      <path d="M6 18a4 4 0 0 1-1.967-.516" />
      <path d="M19.967 17.484A4 4 0 0 1 18 18" />
    </svg>
  );
}

/** lucide `chevron-down` — 14×14 / sw2 */
export function ChevronDownIcon({ className, size = 14, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** lucide `wrench` — 12×12 / sw2 */
export function WrenchIcon({ className, size = 12, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

/** lucide `file-text` — 12×12 / sw2 (同 `DocTypeIcon` 同形不同规格, 见上方说明) */
export function FileTextIcon({ className, size = 12, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

/** lucide `image` — 12×12 / sw2 (同 `ImageTypeIcon` 同形不同规格, 见上方说明) */
export function ImageIcon({ className, size = 12, strokeWidth = 2 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

/** 知识库条目类型图标 — text (default) — 20×20 / sw1.6 */
export function TextTypeIcon({ className, size = 20, strokeWidth = 1.6 }: GlyphProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={["w-5 h-5 text-fg-muted", className].filter(Boolean).join(" ")}
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

