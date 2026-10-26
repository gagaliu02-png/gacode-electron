/**
 * components/ui/ImageLightbox.tsx — 全屏图片预览（markdown 图片点击放大）
 *
 * ## 定位
 *
 * **web 端是 PC 端的唯一事实源** —— 形态照抄 web `src/components/Markdown.tsx:85-129`
 * 的 `LightboxDialog`：
 *
 *   - 用浏览器原生 `<dialog>` + `showModal()` / `close()`
 *     （自带 modal 态 + 焦点陷阱 + **Esc 关闭**，零依赖）
 *   - 关闭三路冗余：**点背景** / **按 Esc** / **点右上角 ✕**
 *   - **点图片本身不关**（`stopPropagation`）
 *   - 不做缩放 / 平移 / 下载 —— 只解决「看不清」这一条痛点
 *
 * ⚠️ **不加「保存到相册」** —— 安卓 `ui/common/FullscreenImageDialog.kt` 也没有；
 *   「保存」是交付物详情页的另一件事，不属于 markdown。
 *
 * ## 为什么不能用现成的 `ui/` 组件
 *
 *   - `BottomSheet`（`ui/BottomSheet.tsx`）= **底部抽屉**（`items-end` + `rounded-t-2xl`），
 *     与「全屏图 + 关闭」不是一回事；
 *   - `ConfirmDialog`（`ui/ConfirmDialog.tsx`）= **居中确认卡片**（title / message / footer 按钮），
 *     语义与结构都不是图片预览。
 *
 *   ⇒ 新建本组件（唯一形态：整屏暗色遮罩 + 居中图 + 右上角关闭）。
 *
 * ## 样式
 *
 * 全部落在 `src/styles/globals.css` 末尾的「M5 · Markdown 图片全屏预览」段
 * （`.md-lightbox-dialog` / `.md-lightbox-backdrop` / `.md-lightbox-inner` /
 *   `.md-lightbox-img` / `.md-lightbox-close`）—— **不引任何第三方依赖**
 * （本仓无 clsx / tailwind-merge ⇒ className 用数组 `.join(" ")`）。
 *
 * 用法：
 *
 * ```tsx
 * const [url, setUrl] = useState<string | null>(null);
 * <ImageLightbox src={url} onClose={() => setUrl(null)} />
 * ```
 */

import * as React from "react";

export interface ImageLightboxProps {
  /** 图片 URL；`null` / `undefined` / 空串 ⇒ **不渲染**（等价于关闭）。 */
  src: string | null | undefined;
  /** 图片 alt（无障碍用）。 */
  alt?: string | null;
  /** 关闭回调 —— 点背景 / Esc / ✕ 三路都调它。 */
  onClose: () => void;
}

/**
 * 全屏图片预览 —— 原生 `<dialog>`。
 *
 * ⚠️ `onClose` 用 ref 兜住：父组件每次渲染都会传新的箭头函数，
 *    若把它放进 `useEffect` 依赖 ⇒ effect 反复重跑（关掉再打开 ⇒ 闪烁）。
 */
export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  const ref = React.useRef<HTMLDialogElement>(null);
  const onCloseRef = React.useRef(onClose);

  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    const dlg = ref.current;
    if (!dlg || !src) return;
    // showModal 自带焦点陷阱 + Esc 关闭；已开着就别再调（会抛 InvalidStateError）
    if (!dlg.open) {
      try {
        dlg.showModal();
      } catch {
        /* 已被调起 —— 忽略 */
      }
    }
    // Esc 关 dialog 时同步通知父级
    const onDialogClose = () => onCloseRef.current();
    dlg.addEventListener("close", onDialogClose);
    return () => {
      // 先摘监听再 close() —— 否则 close 事件会回头再调一次 onClose
      dlg.removeEventListener("close", onDialogClose);
      if (dlg.open) dlg.close();
    };
  }, [src]);

  if (!src) return null;

  return (
    <dialog
      ref={ref}
      className="md-lightbox-dialog md-lightbox-backdrop"
      onClick={(e) => {
        // 点对话框自身（= 暗色背景）= 关闭，点图片不关
        if (e.target === ref.current) onCloseRef.current();
      }}
    >
      <div className="md-lightbox-inner">
        <img
          src={src}
          alt={alt ?? ""}
          className="md-lightbox-img"
          onClick={(e) => e.stopPropagation()}
        />
        <button
          type="button"
          onClick={() => onCloseRef.current()}
          aria-label="关闭大图"
          className="md-lightbox-close"
        >
          ✕
        </button>
      </div>
    </dialog>
  );
}

export default ImageLightbox;
