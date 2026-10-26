/**
 * components/deliveries/Icons.tsx — 交付中心两个页面用到的内联 SVG 图标
 *
 * 背景:
 *   PC 仓没有 lucide-react (F-2 边界), 所以图标全是手写内联 svg.
 *   `src/components/ui/Glyphs.tsx` 已经收了一批全站共享图标, 但交付中心
 *   对齐 web 时还需要几个 Glyphs 里没有的 (lucide 路径逐字抄 web 用的那几个):
 *   layout-grid / download / loader-2 / construction / external-link / copy /
 *   save / refresh-ccw / message-square / refresh-cw.
 *
 *   为什么不塞进 Glyphs.tsx: 那个文件是全站共享组件, 不在本批交付中心
 *   对齐的独占改动范围 (src/components/deliveries/**) 内 —— 改它会跟并行
 *   worker 打架. 等共享层有空档时, 这几个图标可以整体上提.
 *
 * 约定 (跟 Glyphs.tsx 一致):
 *   - 图形 path 逐字取 lucide, 尺寸由 className 控制 (w-4 h-4 之类)
 *   - className 原样透传, 不注入任何类 (PC 无 tailwind-merge, 注入会打架)
 *   - 统一 aria-hidden
 */

export interface DeliveryIconProps {
  /** 追加到 svg 上的 className (尺寸用 w-4 h-4 这种 CSS 类控制) */
  className?: string;
  /** 尺寸 (px) — 覆盖 svg 的 width/height, 默认 24 */
  size?: number;
  /** 描边宽度 — 默认 2 (lucide 默认) */
  strokeWidth?: number;
}

function Svg({
  children,
  className,
  size = 24,
  strokeWidth = 2,
}: DeliveryIconProps & { children: React.ReactNode }) {
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
      {children}
    </svg>
  );
}

/** lucide `layout-grid` — web 交付中心「全部」tab 图标 */
export function LayoutGridIcon(props: DeliveryIconProps) {
  return (
    <Svg {...props}>
      <rect width="7" height="7" x="3" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="3" rx="1" />
      <rect width="7" height="7" x="14" y="14" rx="1" />
      <rect width="7" height="7" x="3" y="14" rx="1" />
    </Svg>
  );
}

/** lucide `download` — web 交付中心 DocumentCard 下载按钮 / 详情页「导出到下载文件夹」 */
export function DownloadIcon(props: DeliveryIconProps) {
  return (
    <Svg {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </Svg>
  );
}

/** lucide `loader-2` — web 交付中心的转圈图标 (加载更多 / 下载中 / 骨架) */
export function Loader2Icon(props: DeliveryIconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </Svg>
  );
}

/** lucide `construction` — web 交付中心空态 / 错误态图标 */
export function ConstructionIcon(props: DeliveryIconProps) {
  return (
    <Svg {...props}>
      <rect width="8" height="18" x="4" y="14" />
      <path d="m19.5 10.5 2 5-2 5" />
      <path d="M2 10.5 20 2l3 5" />
      <path d="m7.5 4.5 4 5" />
      <path d="m21 15-5 5L11 15" />
      <path d="M7.5 14.5 9.5 13" />
    </Svg>
  );
}

/** lucide `external-link` — web 交付详情页主操作按钮图标 */
export function ExternalLinkIcon(props: DeliveryIconProps) {
  return (
    <Svg {...props}>
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </Svg>
  );
}

/** lucide `copy` — web 交付详情页「复制链接」按钮图标 (仅 web 类型) */
export function CopyIcon(props: DeliveryIconProps) {
  return (
    <Svg {...props}>
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </Svg>
  );
}

/** lucide `save` — web 交付详情页「保存到相册」按钮图标 (仅 image 类型) */
export function SaveIcon(props: DeliveryIconProps) {
  return (
    <Svg {...props}>
      <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
      <path d="M7 3v4a1 1 0 0 0 1 1h7" />
    </Svg>
  );
}

/** lucide `refresh-cw` — web 交付列表页刷新按钮图标 */
export function RefreshCwIcon(props: DeliveryIconProps) {
  return (
    <Svg {...props}>
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </Svg>
  );
}

/** lucide `refresh-ccw` — web 交付详情页顶部刷新按钮图标 */
export function RefreshCcwIcon(props: DeliveryIconProps) {
  return (
    <Svg {...props}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M21 12a9 9 0 1 1-9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 16h5v5" />
    </Svg>
  );
}

/** lucide `message-square` — web 交付详情页「跳到源对话」按钮图标 */
export function MessageSquareIcon(props: DeliveryIconProps) {
  return (
    <Svg {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </Svg>
  );
}
