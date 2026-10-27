// =========================================================================
// chat-approval-decision —— 审批裁决结果的**纯分类** (契约 §7 L-26 ~ L-30)
//
// ---------------------------------------------------------------------------
// 2026-10-28 · 任务书 04 · P-10 / P-14
// ---------------------------------------------------------------------------
//   **P-14 · 409 后到者不报错**
//     契约 L-26 ~ L-30: 审批裁决是**先到先得**。后到的端拿到 HTTP 409
//     (body 里带 `decidedBy` / `decidedAt`) —— 这**不是错误**, 是「这条已经
//     被别人批了」的正常结局 ⇒ 端侧**收卡 + 提示是谁处理的, 不报错、不重试**。
//
//   ⛔ 为什么把这块从组件里抠出来成纯函数
//     分类判据 (409 ⇒ conflict, 2xx ⇒ ok, 其余 ⇒ error) 是**契约语义**,
//     不是 UI 细节。留在组件里就只能靠正则去断言「组件里有没有 409」——
//     那种断言既脆又不准 (注释里写个 409 就假绿)。
//     抠成零依赖的纯函数 ⇒ 断言脚本能**在运行时**喂各种响应, 逐个验证
//     「409 不算错」这条判据真的成立。
//
//   ⚠️ 零 import —— 刻意不 import `lib/api.ts` (那个模块会把整个通知/鉴权
//     链拖进来)。这里用**结构化入参** (structural typing) 表达需要的字段,
//     调用方传 `ApprovalDecisionOutcome` 直接兼容。
// =========================================================================

/**
 * 裁决结果的三种结局。
 *
 * · `ok`       —— 服务端受理 (2xx)。
 * · `conflict` —— 已被别的端裁决过 (409) ⇒ **不是错误**。
 * · `error`    —— 真失败 (网络错误 / 5xx) ⇒ 卡要放回去, 用户还能再点。
 */
export type ApprovalDecisionKind = "ok" | "conflict" | "error";

/**
 * 分类所需的最小输入 (结构化 —— 不 import api.ts, 保持零依赖)。
 *
 * `ApprovalDecisionOutcome` (lib/api.ts) 的字段是它的超集 ⇒ 直接可传。
 */
export interface ApprovalDecisionOutcomeLike {
  /** 服务端是否受理 (HTTP 2xx ⇒ true)。 */
  ok: boolean;
  /** HTTP 状态码 (409 = 已被别的端裁决过)。 */
  status: number;
  /** 先到者的端标识 (`web` / `pc` / `android`) —— 契约 L-29。 */
  decidedBy: string | null;
}

/** 分类结果。 */
export interface ApprovalDecisionVerdict {
  /** 三种结局之一。 */
  kind: ApprovalDecisionKind;
  /** 冲突时 = 先到者的端标识 (原样)。 */
  decidedBy: string | null;
  /** 冲突时 = 先到者的中文端名。 */
  decidedByLabel: string;
  /** 冲突时 = 给用户看的一句话 (「已由网页端处理」); 其余为空串。 */
  message: string;
}

/**
 * decidedByLabel —— `decidedBy` (web | pc | android) → 中文端名。
 *
 * 契约 L-28 / L-29: 端标识来自各端请求头里的 `X-Client-Id` (D3)。
 * 认不出来的值一律落到「其他端」—— ⛔ 不得当成空字符串 (那会渲染成
 * 「已由处理」这种缺主语的句子)。
 */
export function decidedByLabel(decidedBy: string | null | undefined): string {
  switch ((decidedBy || "").toLowerCase()) {
    case "web":
      return "网页端";
    case "pc":
      return "PC 端";
    case "android":
      return "安卓端";
    default:
      return "其他端";
  }
}

/**
 * classifyApprovalDecision —— 把一次提交的结果分类。
 *
 * ⚠️ 关键判据 (契约 L-27 / L-29 / 任务书 P-14):
 *   **409 ⇒ `conflict`, 不是 `error`** —— 迟到的人**不算错**, 端侧收卡 +
 *   提示「已由 X 端处理」, **不弹错、不重试**。
 */
export function classifyApprovalDecision(
  outcome: ApprovalDecisionOutcomeLike,
): ApprovalDecisionVerdict {
  if (outcome.ok) {
    return {
      kind: "ok",
      decidedBy: null,
      decidedByLabel: "",
      message: "",
    };
  }
  if (outcome.status === 409) {
    const label = decidedByLabel(outcome.decidedBy);
    return {
      kind: "conflict",
      decidedBy: outcome.decidedBy ?? null,
      decidedByLabel: label,
      message: `已由${label}处理`,
    };
  }
  return {
    kind: "error",
    decidedBy: null,
    decidedByLabel: "",
    message: "",
  };
}
