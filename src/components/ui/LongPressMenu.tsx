/**
 * components/ui/LongPressMenu.tsx — 通用长按 / 右键弹出菜单
 *                            (gacode-electron 0.7.5 P2 browser-15)
 *
 * 跟 gacode-web/Android `LongPressMenu` 对齐: 给链接 / 图片 / 选中文本弹一个
 * web 标准的操作菜单 (复制 / 在新 tab 打开 / 分享 / 保存到知识库 ...).
 *
 * 设计:
 *   - 自己渲染的 fixed 定位菜单, 不依赖 Radix / portal.
 *   - 坐标: 由 caller 给 (mouse event / touch event 的 clientX/Y);
 *     自动 flip 到视口边缘内.
 *   - 自动 click-outside 关闭.
 *
 * 现阶段 (browser-15 P2) 仅 Browser.tsx 用 — 长按链接/图片弹这个菜单,
 * 通过 `<webview>.executeJavaScript()` 注入脚本到 webview 内容 (postMessage
 * → renderer), 由 Browser 捕获事件后渲染 LongPressMenu.
 */

import { useEffect, useRef, type ReactNode } from "react";

export interface LongPressMenuItem {
  label: string;
  /** 自定义渲染 (例如 icon + label). 默认渲染 label. */
  render?: ReactNode;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface LongPressMenuProps {
  /** null = 不渲染 */
  anchor: { x: number; y: number } | null;
  onClose: () => void;
  items: LongPressMenuItem[];
}

export function LongPressMenu({ anchor, onClose, items }: LongPressMenuProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // click outside 关闭
  useEffect(() => {
    if (!anchor) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(target)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, onClose]);

  if (!anchor) return null;

  // flip 到视口内 — 留 8px padding
  const PAD = 8;
  const W = 200; // 估算菜单宽度
  const H = Math.max(120, items.length * 36 + 12);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = anchor.x;
  let top = anchor.y;
  if (left + W + PAD > vw) left = Math.max(PAD, vw - W - PAD);
  if (top + H + PAD > vh) top = Math.max(PAD, vh - H - PAD);

  return (
    <div
      ref={wrapperRef}
      role="menu"
      aria-label="长按菜单"
      className="fixed z-[100] min-w-[180px] rounded-md bg-bg-elevated shadow-dialog border border-border py-1"
      style={{ left, top }}
    >
      {items.map((it, i) => (
        <button
          key={i}
          type="button"
          role="menuitem"
          disabled={it.disabled}
          onClick={() => {
            if (it.disabled) return;
            onClose();
            it.onClick();
          }}
          className={[
            "w-full text-left text-sm px-3 py-2 transition-colors duration-150",
            "disabled:opacity-50 disabled:pointer-events-none",
            it.destructive
              ? "text-danger hover:bg-danger-soft/30"
              : "text-fg hover:bg-bg-sunken",
          ].join(" ")}
        >
          {it.render ?? it.label}
        </button>
      ))}
    </div>
  );
}
