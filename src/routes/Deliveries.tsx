/**
 * routes/Deliveries.tsx — 阶段 1 交付中心 (空态)
 */

export function Deliveries() {
  return (
    <div className="min-h-full flex items-center justify-center px-6 py-12">
      <div className="text-center max-w-sm">
        <p className="text-base font-medium text-fg">交付中心</p>
        <p className="text-sm text-fg-muted mt-2">
          暂无交付,阶段 2 接入
        </p>
        <p className="text-xs text-fg-subtle mt-4 font-mono">
          阶段 2 接 /yinian/deliveries
        </p>
      </div>
    </div>
  );
}