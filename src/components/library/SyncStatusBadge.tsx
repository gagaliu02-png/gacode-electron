/**
 * components/library/SyncStatusBadge.tsx — 知识库条目同步状态徽章
 * (gacode-electron 0.7.5 P2 library-id-10)
 *
 * 三态:
 *   - synced:      已同步 — 默认态, 灰色 ✓ icon
 *   - syncing:     同步中 — animated spinner 跟 brand 色
 *   - failed:      失败 — 红色 ⚠ icon (server 不可达 / push rejected)
 *
 * 设计依据:
 *   - server 端 yinian_library_item 当前没有 syncStatus 字段 (yinian_library_item
 *     表在 unified-api prisma schema 中只有 metadata JSON + 本体字段).
 *     客户端从 item 本身的存在 + 内容是否齐 推"已同步".
 *   - 用户新建条目 → 立刻显示 syncing (短暂) → 服务端收到后 invalidate 触发
 *     refetch → synced. 简化版: 仅根据 item.content 字段是否存在来判定;
 *     有 content 字段 = 已同步.
 *   - 失败态留接口, 跟 OfflineIndicator 联动 (offline 时强制 failed).
 *
 * 用法:
 *   <SyncStatusBadge status="syncing" />
 */

import type { CSSProperties } from "react";

export type SyncStatus = "synced" | "syncing" | "failed";

export interface SyncStatusBadgeProps {
  status: SyncStatus;
  /** 文案 (synced 默认 "已同步"). 设为 false 时不渲染文案 */
  label?: string | false;
  className?: string;
  style?: CSSProperties;
}

export function SyncStatusBadge({
  status,
  label,
  className,
  style,
}: SyncStatusBadgeProps) {
  const config = STATUS_CONFIG[status];
  const showLabel = label !== false;
  return (
    <span
      className={[
        "inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded",
        config.bg,
        config.text,
        className ?? "",
      ].join(" ")}
      style={style}
      aria-label={config.ariaLabel}
    >
      {config.icon}
      {showLabel ? <span>{label ?? config.label}</span> : null}
    </span>
  );
}

const STATUS_CONFIG: Record<
  SyncStatus,
  {
    bg: string;
    text: string;
    icon: React.ReactNode;
    label: string;
    ariaLabel: string;
  }
> = {
  synced: {
    bg: "bg-bg-sunken",
    text: "text-fg-muted",
    icon: <CheckIcon />,
    label: "已同步",
    ariaLabel: "已同步",
  },
  syncing: {
    bg: "bg-brand/15",
    text: "text-brand",
    icon: <SpinnerIcon />,
    label: "同步中",
    ariaLabel: "正在同步",
  },
  failed: {
    bg: "bg-danger/15",
    text: "text-danger",
    icon: <AlertIcon />,
    label: "同步失败",
    ariaLabel: "同步失败",
  },
};

// ───────────── icons ─────────────

function CheckIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}