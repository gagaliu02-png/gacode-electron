/**
 * components/schedule/form/usePopPosition.ts — 自绘浮层的定位 (1:1 移植原型 placePop()).
 *
 * 抄自 web `gacode-web/src/components/schedule/form/usePopPosition.ts`, 只换 PC 写法:
 *   - `import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"`
 *     → 本文件**不用** `import * as React` (web 那边是 "use client" 组件文件);
 *     PC 是 Vite + React 18, 具名导入即可。
 *   - `React.RefObject<HTMLElement | null>` → 具名导入的 `RefObject` 类型。
 *
 * 原型 (schedule-center.html L1388-1400):
 *   left = anchor.left
 *   if (left + pw > vw-8) left = max(8, vw-8-pw)
 *   if (left < 8)         left = 8
 *   top  = anchor.bottom + 6
 *   if (top + ph > vh-8)  top = max(8, anchor.top - ph - 6)
 *   if (top + ph > vh-8)  top = max(8, vh - 8 - ph)
 *
 * ⚠️ 测量顺序: 浮层必须**先渲染再定位** —— 用 offsetWidth/offsetHeight 量尺寸,
 *    定位依赖尺寸, 尺寸依赖渲染。所以 pos 为 null 时先摆到视口外 (visibility:hidden),
 *    量完再摆回来 (跟 PC 的 `RowActionMenu` 同一套路, 那个死锁过一次)。
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

const EDGE = 8; // 距视口边缘的最小留白 (跟原型一致)
const GAP = 6; // 浮层与触发器之间的间距 (原型 +6)

export interface PopPos {
  left: number;
  top: number;
}

export function usePopPosition(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  popRef: RefObject<HTMLElement | null>,
) {
  const [pos, setPos] = useState<PopPos | null>(null);

  const place = useCallback(() => {
    const a = anchorRef.current;
    const p = popRef.current;
    if (!a || !p) return;
    const ar = a.getBoundingClientRect();
    const pw = p.offsetWidth;
    const ph = p.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = ar.left;
    if (left + pw > vw - EDGE) left = Math.max(EDGE, vw - EDGE - pw);
    if (left < EDGE) left = EDGE;

    let top = ar.bottom + GAP;
    if (top + ph > vh - EDGE) top = Math.max(EDGE, ar.top - ph - GAP);
    if (top + ph > vh - EDGE) top = Math.max(EDGE, vh - EDGE - ph);

    setPos((prev) => (prev && prev.left === left && prev.top === top ? prev : { left, top }));
  }, [anchorRef, popRef]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  return pos;
}

/**
 * useDismiss — 点浮层外部 / 按 Esc 关闭 (原型 closePop 口径)。
 * 返回一个 ref 回调, 挂到浮层最外层元素上。
 */
export function useDismiss(
  open: boolean,
  onClose: () => void,
  extraRefs: RefObject<HTMLElement | null>[] = [],
) {
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (boxRef.current?.contains(t)) return;
      for (const r of extraRefs) {
        if (r.current?.contains(t)) return;
      }
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  return boxRef;
}
