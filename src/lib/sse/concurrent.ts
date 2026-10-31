/**
 * 共享层 · 跨端并发提问 (RC-12 / 派工单 §819-886)
 * ---------------------------------------------------------------------------
 * 场景
 * ---------------------------------------------------------------------------
 *   设备 A：正在跑一轮 (长任务)
 *   设备 B：同一 session 点发送
 *     ⇒ 服务端 **409** `TURN_ALREADY_RUNNING` (unified-api turnStore.js:127-131,
 *       yinian.chat.routes.js:2641-2649 ⇒ AppError('TURN_ALREADY_RUNNING', …, 409))
 *     ⇒ 契约订正 5: 被拒的那次请求**不留** user 行 (库里不留空轮次)
 *     ⇒ 端侧要做的: **不弹错** ⇒ 转成**跨端 attach** (旁观那一轮)
 *
 *   这正是跨端接入的天然用法: B 端不该报错, 而该变成**旁观者** ——
 *   与契约 §2.2「跨端 = 旁观」的语义完全一致。
 *
 * ---------------------------------------------------------------------------
 * ⛔ 三条硬规矩
 * ---------------------------------------------------------------------------
 *   1. **白名单只有一个值** —— `TURN_ALREADY_RUNNING`。
 *      `code` / `status` 的取值域**会扩展** ⇒ 其它取值一律走原路径。
 *   2. **绝不看 message 文本** —— 文案会变, 且别的错也可能提到这串字
 *      (断言 RC-W21: message 里含 `TURN_ALREADY_RUNNING` **不算**命中)。
 *   3. **审批 409 (带 `decidedBy`) 不许被吞** —— 那是「审批已被别人裁决」,
 *      语义完全不同 (契约 L-29), 必须走 `decidedBy` 那条路 (断言 RC-W23)。
 *
 * ⛔ 本文件**零 import** ⇒ web / PC 两份**逐字节相同** (md5 由断言 D 段钉)。
 */

/** 唯一的白名单值 —— 「这一轮正在另一台设备上跑」。 */
export const TURN_ALREADY_RUNNING_CODE = "TURN_ALREADY_RUNNING";

/** 命中「跨端并发提问」时的判定结果。 */
export interface ConcurrentTurnInfo {
  /** 恒为 true —— 用「非 null」表示命中。 */
  concurrent: true;
  /**
   * 服务端那一轮的**轮次身份** (`tk_xxx`)。
   * 服务端的 409 响应体里**没有**这个字段 ⇒ 一般是 null;
   * 宿主层真正的身份来源是 `stream-state` (契约 L-58) —— 这里是「有就用, 没有就算了」。
   */
  turnKey: string | null;
}

/** 从错误响应体里抠出机器可读错误码 —— v2 信封有两种形状。 */
export interface ErrorEnvelope {
  /** 机器可读错误码 (如 `TURN_ALREADY_RUNNING` / `APPROVAL_ALREADY_DECIDED`); 没有 ⇒ null。 */
  code: string | null;
  /** 409 时: 谁先裁决了 (web | pc | android); 没有 ⇒ null。 */
  decidedBy: string | null;
  /** 409 时: 裁决时间; 没有 ⇒ null。 */
  decidedAt: string | null;
}

/**
 * 抠错误响应体里的码 —— v2 信封有两种形状 (**都**要认):
 *   `{ ok:false, error:'CODE' }`              (error 是字符串)
 *   `{ ok:false, error:{ code, message } }`   (error 是对象)
 *
 * ⚠️ 抠出来**不等于**认它 —— 「哪个算并发提问」由 `readConcurrentTurnError` 判。
 */
export function readErrorEnvelope(body: unknown): ErrorEnvelope {
  const obj =
    body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  if (!obj) return { code: null, decidedBy: null, decidedAt: null };
  const rawError = obj.error;
  const code =
    typeof rawError === "string"
      ? rawError
      : rawError &&
          typeof rawError === "object" &&
          typeof (rawError as { code?: unknown }).code === "string"
        ? (rawError as { code: string }).code
        : null;
  const decidedBy =
    typeof obj.decidedBy === "string" ? obj.decidedBy : null;
  const decidedAt =
    typeof obj.decidedAt === "string" ? obj.decidedAt : null;
  return { code, decidedBy, decidedAt };
}

/** 从错误体里抠轮次身份 (`tk_xxx`) —— 有就用, 没有就 null。 */
function readTurnKeyFromBody(body: unknown): string | null {
  const obj =
    body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  if (!obj) return null;
  if (typeof obj.turnKey === "string") return obj.turnKey;
  const rawError = obj.error;
  if (rawError && typeof rawError === "object") {
    const tk = (rawError as { turnKey?: unknown }).turnKey;
    if (typeof tk === "string") return tk;
  }
  return null;
}

/**
 * 识别「这一轮正在另一台设备上跑」⇒ 跨端并发提问。
 *
 * ⛔ 只认白名单里那一个值 (`code` 或 `status` 字段**恰好**等于它);
 *    ⛔ **绝不**拿 message 文本匹配 (断言 RC-W21);
 *    ⛔ 审批 409 (带 `decidedBy`) **直接排除** (断言 RC-W23)。
 *
 * @param err 任意错误对象 (web = `ApiRequestError`, PC = `SseHttpError` —— **结构**认,
 *              不认类名 ⇒ 两端各自的错误类都能用)。
 * @returns 命中 ⇒ `{ concurrent: true, turnKey }`; 没命中 ⇒ `null`。
 */
export function readConcurrentTurnError(err: unknown): ConcurrentTurnInfo | null {
  if (!err || typeof err !== "object") return null;
  const e = err as {
    code?: unknown;
    status?: unknown;
    decidedBy?: unknown;
    turnKey?: unknown;
    body?: unknown;
  };

  // ⛔ 审批 409 (带 decidedBy) ⇒ 「审批已被别人裁决」⇒ **不是**并发提问 ⇒ 不许吞。
  if (typeof e.decidedBy === "string" && e.decidedBy.length > 0) return null;

  // ⛔ 只认白名单里那一个值 —— `code` 或 `status` 字段 (**不看 message**)。
  const code = typeof e.code === "string" ? e.code : null;
  const status = typeof e.status === "string" ? e.status : null;
  if (
    code !== TURN_ALREADY_RUNNING_CODE &&
    status !== TURN_ALREADY_RUNNING_CODE
  ) {
    return null;
  }

  const turnKey =
    typeof e.turnKey === "string" ? e.turnKey : readTurnKeyFromBody(e.body);
  return { concurrent: true, turnKey };
}

/** 便捷判据 —— 命中与否 (宿主层分支用这个, 别自己解包)。 */
export function isConcurrentTurnError(err: unknown): boolean {
  return readConcurrentTurnError(err) !== null;
}
