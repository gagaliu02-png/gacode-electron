/**
 * components/schedule/form/PopPanel.tsx — 共用浮层外壳 (原型 .pop, 规格书 A5.1).
 *
 * 抄自 web `gacode-web/src/components/schedule/form/PopPanel.tsx`, 只换 PC 写法:
 *   - `import * as React from "react"` → 具名导入 (PC 无 SSR, 不需要 "use client")
 *   - `React.RefObject<HTMLElement | null>` → 具名导入的 `RefObject` 类型
 *
 * 原型结构是**两层**:
 *   外层 #pop.pop  padding 6px / border 1px rgba(255,255,255,.09) / radius 16px /
 *                 bg #181818 / shadow --shadow-dialog / z 145 / max-height min(72vh,460px)
 *   内层 .dp / .tp / .pop-list   ← 各自的内容与内边距
 *
 * 所以日期 picker 的**外框总宽** = 1 + 6 + 286 + 6 + 1 = 300px (不是 286) ——
 * 别把两层合并成一层, 宽度会差 14px。
 *
 * 定位走 usePopPosition (1:1 移植原型 placePop), 关闭走 useDismiss (点外部 / Esc)。
 */

import { useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";
import { useDismiss, usePopPosition } from "./usePopPosition";

interface PopPanelProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}

export function PopPanel({ open, anchorRef, onClose, children }: PopPanelProps) {
  const popRef = useRef<HTMLDivElement | null>(null);
  const pos = usePopPosition(open, anchorRef, popRef);
  const boxRef = useDismiss(open, onClose, [anchorRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={(el) => {
        boxRef.current = el;
        popRef.current = el;
      }}
      className="fixed z-[145] bg-bg-elevated border border-white/[0.09] rounded-md shadow-dialog p-1.5 flex flex-col max-h-[min(72vh,460px)] overflow-hidden"
      style={
        pos
          ? { left: pos.left, top: pos.top }
          : { left: -9999, top: -9999, visibility: "hidden" }
      }
    >
      {children}
    </div>,
    document.body,
  );
}
