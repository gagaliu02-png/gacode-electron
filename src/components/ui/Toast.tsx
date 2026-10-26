/**
 * components/ui/Toast.tsx — 全站唯一 toast (2026-10-26 对齐 web)
 *
 * 视觉口径逐条对齐 gacode-web/src/components/common/Toast.tsx (C2-48 / S-07):
 *   - 屏幕正中 (不是顶部居中) + bg-black/60 遮罩 (pointer-events-none, 不阻断操作)
 *   - 卡片: rounded-2xl bg-bg-elevated p-5 pr-10 shadow-dialog + max-w-[360px]
 *   - 变体只靠「图标 + 图标色」表达 (不给卡片加彩色边框)
 *   - title (text-base font-medium leading-6) + description (text-[13.5px] leading-5 text-fg-muted)
 *   - 右上角 × 手动关闭 + 多条堆叠 (新的在上, flex-col-reverse)
 *   - 默认 2500ms 自动消失, duration=0 常驻
 *
 * ⚠️ 向后兼容 (铁律): PC 现有几十处调用点全是 `toast({ message, variant })`,
 *   一个都不许改 ⇒ `message` 保留为 `title` 的别名 (title ?? message 作主行)。
 *   `toast()` 的返回值从 void 变成 `{ id, dismiss }` (web 同款), 老调用点忽略返回值即可。
 *
 * 不引 lucide-react (PC 无此依赖, F-2) ⇒ 4 个变体图标手写内联 SVG。
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

export type ToastVariant = "default" | "success" | "warning" | "danger";

export interface ToastItem {
  id: string;
  /** 主标题行 */
  title?: ReactNode;
  /** 副描述行 */
  description?: ReactNode;
  /** 兼容旧调用点 — 单行文案 (title 缺省时顶替 title) */
  message?: ReactNode;
  variant?: ToastVariant;
  duration?: number;
}

/** `toast()` 的入参 — Omit<ToastItem, "id"> */
export type ToastOptions = Omit<ToastItem, "id">;

export interface ToastHandle {
  id: string;
  dismiss: () => void;
}

interface ToastContextValue {
  toasts: ToastItem[];
  toast: (item: ToastOptions) => ToastHandle;
  /** 传 id 关掉某条; 不传 id = 全部关掉 (兼容 PC 旧的无参 dismiss) */
  dismiss: (id?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS = 2500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  /** 每条 toast 一个自动关闭 timer */
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id?: string) => {
    if (id === undefined) {
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current.clear();
      setToasts([]);
      return;
    }
    const timer = timersRef.current.get(id);
    if (timer !== undefined) window.clearTimeout(timer);
    timersRef.current.delete(id);
    setToasts((cur) => cur.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastContextValue["toast"]>(
    (item) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const duration = item.duration ?? DEFAULT_DURATION_MS;
      setToasts((cur) => [...cur, { id, ...item }]);
      if (duration > 0) {
        timersRef.current.set(
          id,
          window.setTimeout(() => dismiss(id), duration),
        );
      }
      return { id, dismiss: () => dismiss(id) };
    },
    [dismiss],
  );

  // 卸载时清 timer (避免 setState 在 unmount 后触发)
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({ toasts, toast, dismiss }),
    [toasts, toast, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

// ────────── 变体图标 (手写内联 SVG — PC 无 lucide-react) ──────────

const VARIANT_ICON_CLASS: Record<ToastVariant, string> = {
  default: "text-fg-muted",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

function ToastView({ item }: { item: ToastItem }) {
  const { dismiss } = useToast();
  const variant = item.variant ?? "default";
  // message 兼容: title 缺省时用 message 顶替主行 (旧调用点文案不变, 只是升级成两段式排版)
  const title = item.title ?? item.message;

  return (
    <div
      role="status"
      aria-live="polite"
      data-state="open"
      data-toast-variant={variant}
      className={[
        "pointer-events-auto relative w-full max-w-[360px] rounded-2xl bg-bg-elevated p-5 pr-10 shadow-dialog",
        "animate-fade-in",
      ].join(" ")}
    >
      <div className="flex items-start gap-2">
        <VariantIcon variant={variant} className="w-[15px] h-[15px] shrink-0 mt-[3px]" />
        <div className="min-w-0 flex-1">
          {title ? <h3 className="m-0 text-base font-medium leading-6">{title}</h3> : null}
          {item.description ? (
            <p className="m-0 mt-1 text-[13.5px] leading-5 text-fg-muted break-words">
              {item.description}
            </p>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        aria-label="关闭"
        onClick={() => dismiss(item.id)}
        className="absolute right-3 top-3 w-7 h-7 rounded-full grid place-items-center text-fg-muted hover:text-fg hover:bg-white/[0.07] transition-colors duration-150"
      >
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Toaster — 屏幕正中, 遮罩不阻断交互, 多条新的在上 */
function Toaster() {
  const { toasts } = useToast();
  if (toasts.length === 0) return null;
  return (
    <>
      {/* 遮罩 — 跟确认弹窗同一个底色, 但 pointer-events-none (提示不该挡操作) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-[9998] bg-black/60" />
      <div
        aria-label="Notifications"
        className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center px-5"
      >
        <div className="flex flex-col-reverse items-center gap-3 max-h-[80vh] overflow-y-auto">
          {toasts.map((t) => (
            <ToastView key={t.id} item={t} />
          ))}
        </div>
      </div>
    </>
  );
}

// ────────── Icons (lucide 24×24 路径, 手写) ──────────

function VariantIcon({
  variant,
  className = "",
}: {
  variant: ToastVariant;
  className?: string;
}) {
  const cls = [className, VARIANT_ICON_CLASS[variant]].filter(Boolean).join(" ");
  if (variant === "success") return <CheckCircle2Icon className={cls} />;
  if (variant === "warning") return <AlertTriangleIcon className={cls} />;
  if (variant === "danger") return <AlertCircleIcon className={cls} />;
  return <InfoIcon className={cls} />;
}

function InfoIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

function CheckCircle2Icon({ className = "" }: { className?: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <path d="m9 11 3 3L22 4" />
    </svg>
  );
}

function AlertTriangleIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function AlertCircleIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function CloseIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
