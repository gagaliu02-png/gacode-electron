/**
 * components/deliveries/origin.ts — 交付物 origin 类型 + 文案映射
 *                              (gacode-electron 0.7.5 P2 deliveries-10)
 *
 * 跟 server 端 yinian_deliverable.origin column 一致:
 *   "ai_generated" | "user_uploaded" | null (legacy, server schema.prisma:556).
 *
 * 客户端 chip 状态机多加一个 "all" 用于 chip row 第 1 项.
 */

export type OriginFilter = "all" | "ai_generated" | "user_uploaded";

export const ORIGIN_LABEL: Record<OriginFilter, string> = {
  all: "全部",
  ai_generated: "AI 生成",
  user_uploaded: "用户上传",
};

/** 把 Deliverable.origin 收敛到 OriginFilter (不算 "all"). */
export function originOf(
  d: { origin?: string | null },
): Exclude<OriginFilter, "all"> {
  if (d.origin === "ai_generated") return "ai_generated";
  // null / undefined / "user_uploaded" / 任何其他值 → 视为 user_uploaded
  // (server 已经过滤掉 user_uploaded, 客户端这里只用于 chip 文案兜底)
  return "user_uploaded";
}
