// =========================================================================
// lib/turn-segment-order.ts
//   ★ [T-144] **PC 专属**的轮次段序排序 —— 在共享层 `orderByTurnSegment` 之上
//   加一条「同段号内 user 行在前」的规则。
//
// ---------------------------------------------------------------------------
// 为什么要有这一层（而不是直接改共享层）
// ---------------------------------------------------------------------------
//   · `src/lib/sse/**` 是 **web / PC 两仓逐字节共享**的层（PC 端有 md5 一致性断言：
//     `test/sse-resume-failed.test.mjs` 的 D1 段）⇒ 改它 ⇒ 必须同步改 web 仓。
//   · 但 **web 端已不再适配**（2026-11 决策：主端 = Android + PC/Electron）
//     ⇒ 不该为了 PC 的新规则去动 web 仓。
//   ⇒ 这条规则放在 **PC 专属模块**里：共享层保持逐字节不变（断言不破），
//     PC 端拿到自己的排序口径。
//
// ---------------------------------------------------------------------------
// 这条规则解决什么（真机 session 1180 · 2026-11-25）
// ---------------------------------------------------------------------------
//   服务端在**切段那一刻**给注入行（用户插话）写段序锚点 `tk_xxx#N`，
//   N = **它后面那一段** assistant 的段号 ⇒ 它与那段 assistant **同段号**。
//   ⇒ 同一段号内如果按「输入顺序（服务端 created_at）」排，那段 assistant 会排在
//      注入行**前面** ⇒ 「LLM 续答气泡跑到用户补充气泡上面」（PM 报的倒挂）。
//   ⇒ 规则：**同 base + 同段号 ⇒ user 行（注入行）在 assistant 行前面**。
//
//   ⚠️ 这条规则**只影响同一轮同一段**的行；跨轮 / 不同段 / 无锚点的老数据逐字不变。
// =========================================================================

import {
  orderByTurnSegment,
  parseTurnSegment,
  type MergeableRow,
} from "./sse/merge-history";

/**
 * PC 端的轮次段序排序。
 *
 * @param rows 服务端历史 + 本机在飞行行 / 本机切出来的气泡
 * @returns 排好序的行
 */
export function orderByTurnSegmentForPC<T extends MergeableRow>(
  rows: readonly T[],
): T[] {
  if (rows.length < 2) return [...rows];
  // ① 先按共享层口径排（同一轮内按段号，跨轮按输入顺序）。
  const sorted = orderByTurnSegment(rows);
  // ② 再对「同 base + 同段号」的组做**稳定**重排：user 行在前。
  //    （只动同一段号内部的相对次序 ⇒ 其它一切逐字不变。）
  const out = sorted.map((row, idx) => ({ row, idx, seg: parseTurnSegment(row.turnKey) }));
  out.sort((a, b) => {
    if (a.seg && b.seg && a.seg.base === b.seg.base && a.seg.index === b.seg.index) {
      const aUser = a.row.role === "user";
      const bUser = b.row.role === "user";
      if (aUser !== bUser) return aUser ? -1 : 1;
    }
    return a.idx - b.idx;
  });
  return out.map((x) => x.row);
}
