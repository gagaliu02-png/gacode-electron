/**
 * components/ui/Toast.tsx — 阶段 1 最小 toast (阶段 3 加 warning 变体)
 *
 * 用 React Context + setTimeout 自动 dismiss, 不引 Radix Toast / sonner.
 * 顶部固定, 3 秒自动消失. variant: default | success | danger | warning.
 *
 * 阶段 1 简化: 单一 toast 同时只显示一个 (新 push 替换旧的). 阶段 N 再升
 * 队列 (跟 gacode-web toast 一样, 居中 + 堆叠 + 半透遮罩).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastVariant = "default" | "success" | "danger" | "warning";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (input: { message: string; variant?: ToastVariant; duration?: number }) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 3000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ToastItem | null>(null);
  const timerRef = useRef<number | null>(null);

  const dismiss = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCurrent(null);
  }, []);

  const toast = useCallback<ToastContextValue["toast"]>(
    ({ message, variant = "default", duration = DEFAULT_DURATION_MS }) => {
      // 清掉旧 timer (避免上次的 toast 提前 dismiss)
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setCurrent({ id, message, variant });
      timerRef.current = window.setTimeout(() => {
        setCurrent(null);
        timerRef.current = null;
      }, duration);
    },
    [],
  );

  // 卸载时清 timer (避免 setState 在 unmount 后触发)
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {current && <ToastView item={current} />}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const variantClass: Record<ToastVariant, string> = {
  default: "border-brand/50 bg-bg-elevated text-fg",
  success: "border-success/50 bg-bg-elevated text-fg",
  danger: "border-danger/50 bg-bg-elevated text-fg",
  warning: "border-warning/50 bg-bg-elevated text-fg",
};

const variantDot: Record<ToastVariant, string> = {
  default: "bg-brand",
  success: "bg-success",
  danger: "bg-danger",
  warning: "bg-warning",
};

function ToastView({ item }: { item: ToastItem }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        "fixed top-4 left-1/2 -translate-x-1/2 z-[9999]",
        "pointer-events-auto",
        "rounded-md border shadow-dialog backdrop-blur-md",
        "px-4 py-3 max-w-[min(560px,calc(100vw-32px))]",
        "animate-fade-in",
        variantClass[item.variant],
      ].join(" ")}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={["w-2 h-2 rounded-full shrink-0", variantDot[item.variant]].join(" ")}
        />
        <span className="text-sm break-words">{item.message}</span>
      </div>
    </div>
  );
}