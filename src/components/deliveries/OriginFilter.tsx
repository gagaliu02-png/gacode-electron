/**
 * components/deliveries/OriginFilter.tsx — 交付物 origin 过滤 chip 行
 *                            (gacode-electron 0.7.5 P2 deliveries-10)
 *
 * 对齐 gacode-web Deliveries 同款 — origin 二选一: AI 生成 / 用户上传.
 *
 * 注: server unified-api `deliverables.routes.js` schema 当前**没暴露 origin
 *     作为 querystring 参数**; 列表 query 端点 (line 162) 只接 type / page /
 *     pageSize / sessionId / keyword. 也就是说 "AI 生成 vs 用户上传" 这个区分
 *     在 server 端已经被 ORIGIN_NOT_USER_UPLOADED 过滤掉 user_uploaded 行,
 *     用户看到的列表全是 ai_generated 或 legacy origin=null. 所以此 chip
 *     现阶段基本上只起到「全选 / AI」两态, 「用户上传」永远空.
 *
 *     send-blocker: listDeliverables 已经把 origin 加到 query 客户端包装,
 *     server 端 schema 一旦补上 origin param 即可生效, 不需要二次迁移.
 */

import { ORIGIN_LABEL, type OriginFilter } from "./origin";

export interface OriginFilterChipsProps {
  selected: OriginFilter;
  onSelect: (v: OriginFilter) => void;
  /** 给 server 端做计数 (可选, 现阶段 server schema 不一定返). */
  counts?: Partial<Record<OriginFilter, number>>;
}

const ORDER: OriginFilter[] = ["all", "ai_generated", "user_uploaded"];

export function OriginFilterChips({
  selected,
  onSelect,
  counts,
}: OriginFilterChipsProps) {
  return (
    <div className="inline-flex p-1 rounded-md bg-bg-elevated gap-1">
      {ORDER.map((k) => {
        const active = selected === k;
        const count = counts?.[k];
        return (
          <button
            key={k}
            type="button"
            onClick={() => onSelect(k)}
            className={[
              "px-3 py-1 text-sm rounded transition-colors duration-150",
              active
                ? "bg-brand text-brand-on shadow-sm"
                : "text-fg-muted hover:text-fg",
            ].join(" ")}
            title={
              typeof count === "number" ? `${count} 条` : undefined
            }
          >
            {ORIGIN_LABEL[k]}
            {typeof count === "number" ? (
              <span className="ml-1 text-xs opacity-70">{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
