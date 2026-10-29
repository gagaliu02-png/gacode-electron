// =========================================================================
// seq-guard —— 端侧幂等判据 (架构 §5.4 / T-09 / 契约订正 6)
// ---------------------------------------------------------------------------
// 为什么有这个文件
// ---------------------------------------------------------------------------
//   v1 时代端侧有三套去重逻辑 (事件族/id 去重 · mergeEvents 双写处理 ·
//   tool 链重影), 规则分散在三端, 各自漂移。v2 把传输层的幂等主键统一成
//   **seq** (服务端轮次真值发号, per-session 单调, 跨轮不重置):
//
//       if (frame.seq <= appliedSeq)  丢弃      // 重复到达
//       if (frame.seq == appliedSeq+1) 应用      // 正常
//       else                          判定有洞 ⇒ 降级
//
//   ⇒ 端侧只要记住 appliedSeq 一个数, 就能删掉那三套去重。
//
//   ⚠️ **协议层**的去重 (契约 L-14 ~ L-18: 同族同 id 只渲染一次) **不删**
//      —— 那是双写规则, 与传输层幂等不冲突 (订正 6 明确写了)。
//
// ---------------------------------------------------------------------------
// ★ 老服务端兼容 (★ 本文件最容易翻车的地方)
// ---------------------------------------------------------------------------
//   v2 的 seq 来自服务端轮次真值 (TurnStore), **连续**。
//   v1 的游标来自 gaclaw 的 `eventIdCounter` —— 架构 §2.4 白纸黑字写着
//   「跳号: **常见** (gaclaw eventId 不连续)」。
//   ⇒ 在老服务端上, **拿游标当 seq 做跳号判定 = 每次都误判成有洞 ⇒ 天天降级**。
//
//   所以本文件把两件事分开:
//     · **重复判定** (seq <= appliedSeq ⇒ 丢弃) —— 两种游标语义下都成立, 一直开;
//     · **跳号判定** (seq != appliedSeq+1 ⇒ 降级) —— **只在服务端显式给了
//       `seq` 字段时**才开 (v2 帧信封), 老服务端一律关。
//
//   ⇒ `decideFrame()` 拿到的帧若带显式 `seq` ⇒ 走完整判据; 只带 SSE `id:`
//     游标 ⇒ 只做重复判定, 不做跳号判定。
//
// ---------------------------------------------------------------------------
// ⛔ 本文件**不许** import window / fetch / js-cookie —— PC 要抄这份定稿。
//    零依赖, 纯函数, Node 单测可直接 import。
// =========================================================================

/**
 * 帧信封 —— 端侧只认这两个字段。
 *
 * `seq` 是 v2 帧信封里的**服务端分配序号**; `id` 是 SSE 的 `id:` 行
 * (v1 契约的游标, v2 里与 seq 同值)。
 */
export interface SeqFrameLike {
  /** 服务端分配的 seq (v2 TurnStore)。老服务端没有 ⇒ null / undefined。 */
  seq?: number | string | null;
  /** SSE `id:` 行给的游标 (纯十进制串)。 */
  id?: string | null;
}

/** 幂等判定的三种结论。 */
export type SeqVerdict =
  /** 该应用这一帧 (seq = null 表示「这一帧没有序号」⇒ 老服务端, 照常应用)。 */
  | { kind: "apply"; seq: number | null }
  /** 重复到达 ⇒ 丢弃 (T-09 第一条)。 */
  | { kind: "duplicate"; seq: number }
  /** 跳号 ⇒ 判定有洞 ⇒ 必须降级 (T-09 第三条), **不许静默吞内容**。 */
  | { kind: "gap"; expected: number; received: number };

/**
 * isValidCursor —— 游标合法性判据 (契约 L-33)。
 *
 * 只有**纯十进制数字串**合法。UUID / `1.9` / `12abc` / ` 3` / `-1` / 空串
 * 一律非法 —— ⛔ 绝不能用 `parseInt` 截断 (历史事故: UUID 游标被截成一个
 * 「合法数字」后被服务端照单全收)。
 */
export function isValidCursor(raw: unknown): raw is string {
  return typeof raw === "string" && /^\d+$/.test(raw);
}

/**
 * parseSeq —— 把帧上的序号解析成 number。
 *
 * 接受 number 与纯十进制串; 其余 (UUID / 带小数 / 带尾巴 / 布尔 / 对象)
 * 一律判成「没有序号」⇒ 走兼容分支。
 *
 * ⚠️ 数字要 `Number.isSafeInteger` —— 超出安全整数的序号宁可不认,
 *   也不要把精度丢了的数当游标发出去。
 */
export function parseSeq(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isSafeInteger(raw) && raw >= 0 ? raw : null;
  }
  if (typeof raw === "string" && isValidCursor(raw)) {
    const n = Number(raw);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

/**
 * formatSeq —— number → 纯十进制游标串 (L-33)。
 *
 * 端侧**只保存服务端下发的游标**; 这个函数只用于把服务端给的 seq 落成
 * 「可外发的游标形态」, 不参与任何自增/猜测。
 */
export function formatSeq(seq: number): string {
  return String(seq);
}

/**
 * decideFrameSeq —— 幂等判据 (T-09)。
 *
 * @param appliedSeq 本端**已应用**的最大 seq (没有则 null)
 * @param frameSeq   这一帧的 seq (null = 这一帧没有序号)
 * @param detectGap  是否做**跳号**判定。
 *                    · v2 (服务端显式给了 seq) ⇒ true
 *                    · v1 (只有 SSE `id:` 游标, gaclaw eventId 跳号是常见的)
 *                      ⇒ **false** —— 否则老服务端上每一轮都会误判成「有洞」
 *                        ⇒ 天天降级, 比不降级还糟。
 */
export function decideFrameSeq(
  appliedSeq: number | null,
  frameSeq: number | null,
  detectGap: boolean = true
): SeqVerdict {
  // 这一帧没有序号 ⇒ 老服务端 ⇒ 照常应用, 但**不推进** appliedSeq
  // (没有序号就没有幂等判据; 端侧不得自造序号)。
  if (frameSeq === null) return { kind: "apply", seq: null };

  // 还没有基线 (第一帧带序号的) ⇒ 无从判洞 ⇒ 应用并建立基线。
  if (appliedSeq === null) return { kind: "apply", seq: frameSeq };

  // 重复到达 ⇒ 丢弃。
  if (frameSeq <= appliedSeq) return { kind: "duplicate", seq: frameSeq };

  // 正好接上 ⇒ 应用。
  if (frameSeq === appliedSeq + 1) return { kind: "apply", seq: frameSeq };

  // 跳号 ⇒ 有洞。
  if (!detectGap) {
    // ⚠️ 老服务端语义: 游标跳号是**正常**的 (gaclaw eventId 不连续)
    //   ⇒ 仍然应用, 只把基线推到这一帧 (避免后面每一帧都被判成重复)。
    return { kind: "apply", seq: frameSeq };
  }
  return { kind: "gap", expected: appliedSeq + 1, received: frameSeq };
}

/**
 * readFrameSeq —— 从一帧里读出「服务端给的序号」。
 *
 * 优先用帧载荷里的显式 `seq` (v2); 没有就用 SSE `id:` 行 (v1 游标)。
 * 两者都没有 ⇒ null。
 */
export function readFrameSeq(
  frame: SeqFrameLike | null | undefined,
  cursor: string | null | undefined = null
): number | null {
  const fromPayload = parseSeq(frame?.seq);
  if (fromPayload !== null) return fromPayload;
  return parseSeq(cursor);
}

/**
 * decideFrame —— 一帧的最终幂等结论 (含老服务端兼容)。
 *
 * @param appliedSeq 已应用的最大 seq
 * @param frame      帧载荷 (可能带显式 `seq`)
 * @param cursor     这一帧生效的 SSE 游标 (`id:` 行)
 *
 * 规则:
 *   · 帧带显式 `seq` ⇒ **完整判据** (重复 + 跳号) —— v2 服务端
 *   · 帧只有 SSE 游标 ⇒ **只判重复**, 不判跳号 —— v1 服务端 (跳号常见)
 *   · 两者都没有   ⇒ 应用 (老服务端连游标都没有)
 */
export function decideFrame(
  appliedSeq: number | null,
  frame: SeqFrameLike | null | undefined,
  cursor: string | null | undefined = null
): SeqVerdict {
  const explicit = parseSeq(frame?.seq);
  if (explicit !== null) {
    return decideFrameSeq(appliedSeq, explicit, true);
  }
  const legacy = parseSeq(cursor);
  if (legacy !== null) {
    return decideFrameSeq(appliedSeq, legacy, false);
  }
  return { kind: "apply", seq: null };
}

/**
 * nextAppliedSeq —— 应用一帧之后, appliedSeq 变成多少。
 *
 * ⚠️ 「没有序号的帧」**不推进** appliedSeq (端侧不得自造序号)。
 */
export function nextAppliedSeq(
  appliedSeq: number | null,
  verdict: SeqVerdict
): number | null {
  if (verdict.kind === "duplicate") return appliedSeq;
  // ★ 有洞 ⇒ **不推进** appliedSeq (降级之后基线不再有意义, 也不许跳过内容)。
  if (verdict.kind === "gap") return appliedSeq;
  if (verdict.seq === null) return appliedSeq;
  return verdict.seq;
}
