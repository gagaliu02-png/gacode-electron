/**
 * components/chat/AttachmentChip.tsx — 上传完成附件 chip 卡片
 *
 * 对齐 gacode-web/src/components/chat/AttachmentChip.tsx 1:1 (Tailwind class 名换成 electron token):
 *   - 圆角 chip (bg-bg-elevated + rounded-md)
 *   - 左侧可选缩略图: image 类型显示真图缩略, 非 image 显示 FileText 图标
 *   - 中间文件类型角标 (ext.uppercase, bg-bg-sunken)
 *   - 文件名 (truncate max-w-[180px])
 *   - 右侧 X 关闭按钮 (w-6 h-6 rounded-full)
 *
 * Home + ChatDetail 共用 — gaga 截图反馈 2026-10-20 §3:
 *   旧 chip 只显示文件名 + X (半成品), 缺缩略图 / 类型角标 / 进度 / 错误重试.
 *   现在补齐四要素, 对齐 web 视觉.
 *
 * 2026-10-26 图标收编: 本文件原本就地手写了一份 `FileTextIcon` 内联 svg
 *   (与 components/ui/Glyphs.tsx 的同名图标**逐字重复**) ⇒ 删掉本地实现,
 *   改 import 共享组件. path 与 lucide `file-text` 逐字相同, 渲染不变;
 *   仅 strokeWidth 由 1.6 跟到共享默认 2 (与 web 的 lucide 默认一致)。
 */

import { FileTextIcon } from "../ui/Glyphs";

export interface AttachmentChipProps {
  file: {
    name: string;
    type: string;
    url?: string;
  };
  /** 缩略图 URL (Home 本地 blob 预览 / 已上传完成态均可用) */
  thumbnailUrl?: string;
  /** 移除回调 */
  onRemove: () => void;
  /** 外层额外 className */
  className?: string;
}

function getExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "?";
  return name.slice(dot + 1).toUpperCase().slice(0, 4);
}

export function AttachmentChip({
  file,
  thumbnailUrl,
  onRemove,
  className,
}: AttachmentChipProps) {
  const ext = getExtension(file.name);
  const isImage = file.type?.startsWith("image/");

  return (
    <div
      className={[
        // 对齐 web `chat/AttachmentChip.tsx:55`:
        //   "inline-flex items-center gap-2 px-3 py-2 rounded-md bg-bg-base shadow-sm max-w-full"
        // 2026-10-26: PC 之前用 bg-bg-elevated (#181818) 抬一层 — 现在输入条外层卡片
        //   恢复成 web 的 bg-bg-elevated (align-d-home H-19), chip 回到 web 的
        //   bg-bg-base + shadow-sm (H-13). 两者必须同批, 否则 chip 在黑底上消失.
        "inline-flex items-center gap-2 px-3 py-2 rounded-md bg-bg-base shadow-sm max-w-full",
        className ?? "",
      ].join(" ")}
    >
      {/* 缩略图 (可选, image 显示真图, 非 image 显示 FileText 占位)
          2026-10-26: 删掉 PC 原有的第三分支 (!isImage → 也渲染 FileText 方块)。
            web `components/chat/AttachmentChip.tsx:60-72` **只有两个分支** ——
            thumbnailUrl 为空 (文档类型, web app/page.tsx:325 传
            `thumbnailUrl={it.file.type.startsWith("image/") ? it.url : undefined}`)
            时 web **不渲染任何图标** ⇒ PC 多出的那个 32×32 方块已删, 两端同形。*/}
      {thumbnailUrl && isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbnailUrl}
          alt={file.name}
          className="w-8 h-8 rounded object-cover shrink-0"
        />
      ) : thumbnailUrl ? (
        <div className="w-8 h-8 rounded bg-bg-sunken inline-flex items-center justify-center shrink-0">
          <FileTextIcon className="text-fg-muted" size={16} />
        </div>
      ) : null}

      {/* 文件类型角标 */}
      <span
        className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-bg-sunken text-fg-muted tracking-wide"
        title={`文件类型: ${file.type || "unknown"}`}
      >
        {ext}
      </span>

      {/* 文件名 */}
      <span
        className="text-sm text-fg truncate max-w-[180px]"
        title={file.name}
      >
        {file.name}
      </span>

      {/* X 关闭按钮 */}
      <button
        type="button"
        onClick={onRemove}
        aria-label="移除附件"
        className="shrink-0 w-6 h-6 rounded-full inline-flex items-center justify-center text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150"
      >
        <CloseGlyph />
      </button>
    </div>
  );
}

export default AttachmentChip;

// ─────────── icons (inline; 不引 lucide-react) ───────────

function CloseGlyph() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}