/**
 * components/chat/ModelChips.tsx — chat-id-31 顶部 model 切换 chips
 *
 * server 端 (unified-api) 目前**只**认 'gawen' / 'gawen-fast', 没有
 * /yinian/models 端点; 'gaclaw-pro' 等模型在 ChatDetail 的 ModelChips 上
 * 显示但 disabled, 选了等于 gawen (默认) — 这样 UI 形态跟 Android 一致.
 *
 * 行为:
 *   - active key 默认 'gawen'
 *   - 父组件 (ChatDetail) 维护 model 状态, 切换 → invalidateQueries + 在下次
 *     send 时把 model 写进 body
 *   - 流式中 disabled (不能中途换)
 *
 * 来源: lib/api.ts listAvailableModels() (前端硬编码, 跟 server schema 一致).
 */

import { useMemo } from "react";
import { listAvailableModels } from "../../lib/api";

export interface ModelChipsProps {
  active: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}

export function ModelChips({ active, onChange, disabled }: ModelChipsProps) {
  const models = useMemo(() => listAvailableModels(), []);
  return (
    <div
      className="inline-flex p-0.5 rounded-md bg-bg-elevated gap-0.5 text-xs"
      role="tablist"
      data-testid="model-chips"
    >
      {models.map((m) => {
        const isActive = m.key === active;
        return (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={disabled || !m.enabled}
            title={m.description || m.label}
            onClick={() => onChange(m.key)}
            className={[
              "px-2 py-0.5 rounded transition-colors duration-150",
              "disabled:opacity-50 disabled:pointer-events-none",
              isActive
                ? "bg-brand text-brand-on shadow-sm"
                : "text-fg-muted hover:text-fg",
            ].join(" ")}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}