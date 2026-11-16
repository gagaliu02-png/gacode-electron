// =========================================================================
// turn-identity —— 「这一轮是谁」+「这一轮是谁发起的」+「这一行是不是系统注记」
// -------------------------------------------------------------------------
// ⚠️ **web 是原件端** —— 契约要求 PC 端**逐字抄**这份 (两端不可能漂)。
//
// -------------------------------------------------------------------------
// ## 它解决什么 (2026-11-16 · 端侧后台任务 e2e · 真机报障)
// -------------------------------------------------------------------------
//   用户判断: 「在后台任务过程中, 端侧或服务端没有识别出新的这个信息
//   到底是用户发的还是子agent/机器回报的」—— **判据缺失**。
//
//   根因: 帧里只有 `turnKey` (这一轮**是谁**), **没有**「这一轮**是谁发起的**」
//   这一维 ⇒ 端侧看到新轮时**分不清**它是「用户提问轮」还是「后台作业回报轮」。
//
//   服务端 2026-11-16 把这一维上线了 ⇒ **帧的顶层 `origin`**:
//     · `'work_unit_result'` = 这一轮是**后台作业回报触发的服务端起轮** (订正 30);
//     · **缺省** = 用户自己发起的轮 (服务端**只在非默认时**下发这个字段,
//       所以「缺省」就等于 'user')。
//
//   ⚠️ 帧里没有 `origin` (老服务端) ⇒ 端侧**反推**: 这一轮的 `turnKey`
//     是不是**本端发起**的那一个 ⇒ 是 ⇒ 'user'; 不是 ⇒ 'work_unit_result'。
//     ⚠️ 连「本端发起过哪些轮」都不知道 (老服务端 / 解析失败) ⇒ **不知道**
//     (返回 null) ⇒ 端侧**不敢断言** ⇒ 保守处理。
//
// -------------------------------------------------------------------------
// ## 第二个判据: 「这条消息行是不是系统注记」
// -------------------------------------------------------------------------
//   服务端起轮 (订正 30) 时落了一条 `role='user'` 的消息行, 正文是
//   「（后台任务 xxx 已完成）」, metadata 带:
//     · `source: 'work_unit_result'`  —— 老服务端 (2026-11-16 之前) 只有这个;
//     · `skip_transcript: true`       —— 新服务端 (2026-11-16) 两个都有。
//
//   ⇒ 它**不是用户说的话**, 但 role 仍然是 'user' ⇒ 默认渲染成**用户气泡**
//     ⇒ 用户看到一条莫名其妙的「自己发的消息」。
//
//   ⚠️ **两个判据都要能工作** (老服务端只有 source, 新服务端两个都有)
//     ⇒ 判据是「**或**」关系, 不是「且」。
//
//   ⛔ **端侧只渲染它, 绝不本地合成这句文案** (契约 §4.2): 本地再插一条
//     ⇒ 刷新后重复 ⇒ id 撞车 ⇒ 渲染层直接崩。
//     ⇒ 本模块**只判** metadata, **一个字都不合成**。
//
// -------------------------------------------------------------------------
// ⛔ 本文件**零 import** ⇒ web / PC 两份**逐字节相同**。
// =========================================================================

/** 这一轮的发起方。 */
export type TurnOrigin = "user" | "work_unit_result";

/** 帧顶层的 `origin` 字段名 (服务端 unified-api `formatTurnFrame` 下发)。 */
export const FRAME_ORIGIN_FIELD = "origin";

/** 帧顶层的 `turnKey` 字段名 (服务端 v2 帧信封)。 */
export const FRAME_TURN_KEY_FIELD = "turnKey";

/**
 * 服务端落库 user 行时打的「机器投递」标记 (metadata.source)。
 *
 * ⚠️ 服务端**全仓只有那一处**打这个 source ⇒ 不会误伤用户自己发的消息。
 */
export const WORK_UNIT_NOTICE_SOURCE = "work_unit_result";

/** metadata 里的 `source` 键名 (与 {@link WORK_UNIT_NOTICE_SOURCE} 配套)。 */
export const METADATA_SOURCE_KEY = "source";

/**
 * metadata 里的「这行不是 transcript 里的话」通用标记 (2026-11-16 新增)。
 *
 * ⚠️ 与 {@link WORK_UNIT_NOTICE_SOURCE} 是**或**关系 —— 老服务端只有 source,
 *   新服务端两个都有 ⇒ 两个判据都要能工作。
 */
export const SKIP_TRANSCRIPT_FLAG = "skip_transcript";

// =========================================================================
// 帧级: 读出「这一轮是谁」+「这一轮是谁发起的」
// =========================================================================

/** 一帧带来的轮次信息 (帧顶层)。 */
export interface FrameTurn {
  /** 这一轮的轮次身份 (`tk_xxx`); 帧没带 ⇒ null。 */
  turnKey: string | null;
  /** 这一轮的发起方; 帧没带 `origin` ⇒ null (**不知道**)。 */
  origin: TurnOrigin | null;
}

/**
 * readFrameTurn —— 从一帧里读出**轮次身份** + **发起方**。
 *
 * ⚠️ 只认**顶层**字段 (服务端 v2 帧信封 / `formatTurnFrame`)。
 * ⚠️ `origin` 缺省 ⇒ null (服务端只在**非默认**时下发 ⇒ 缺省即 'user',
 *   但那是**服务端**的约定; 端侧在缺省时**反推** ⇒ 见 {@link resolveTurnOrigin})。
 */
export function readFrameTurn(frame: unknown): FrameTurn {
  if (!frame || typeof frame !== "object") return { turnKey: null, origin: null };
  const obj = frame as Record<string, unknown>;
  const rawKey = obj[FRAME_TURN_KEY_FIELD];
  const turnKey = typeof rawKey === "string" && rawKey ? rawKey : null;
  return { turnKey, origin: readFrameOrigin(frame) };
}

/**
 * readFrameOrigin —— 读帧**顶层**的 `origin`。
 *
 * @returns `'user' | 'work_unit_result' | null`
 *   · `null` = 帧没带 (老服务端) 或形状不对 ⇒ 端侧**不知道** ⇒ 走反推。
 *
 * ⚠️ 只认**字符串**且值在这两个之内 ⇒ 别的值一律 null (端侧不猜)。
 */
export function readFrameOrigin(frame: unknown): TurnOrigin | null {
  if (!frame || typeof frame !== "object") return null;
  const raw = (frame as Record<string, unknown>)[FRAME_ORIGIN_FIELD];
  if (raw === "work_unit_result") return "work_unit_result";
  if (raw === "user") return "user";
  return null;
}

// =========================================================================
// 轮次级: 判定「这一轮是谁发起的」
// =========================================================================

/**
 * resolveTurnOrigin —— 判定「这一轮是谁发起的」。
 *
 * ## 判据顺序 (服务端权威优先)
 *
 *   ① 帧**自带** `origin` ⇒ 用帧的 (服务端权威, 2026-11-16 起);
 *   ② 帧没带 ⇒ **反推**: `frameTurnKey` ∈ `ownTurnKeys` (本端发起过的轮)
 *      ⇒ 'user', 不在 ⇒ 'work_unit_result';
 *   ③ 连「本端发起过哪些轮」都不知道 (`ownTurnKeys` 为空) ⇒ **null**
 *      (⇒ **不知道** ⇒ 端侧不敢断言, 保守处理)。
 *
 * ⚠️ **反推有个已知的窄口子**: 别的设备发的用户轮, 本端没记过它的 turnKey
 *   ⇒ 反推成 'work_unit_result'。⇒ 服务端一旦带上 `origin` (新服务端) 就
 *   **不再有这个问题** ⇒ ① 优先于 ② 就是为了这个。
 *
 * @param input.frameOrigin  帧顶层的 `origin` (readFrameOrigin 的结果)。
 * @param input.frameTurnKey 这一轮的 `turnKey` (帧顶层)。
 * @param input.ownTurnKeys  **本端发起过**的轮次身份集合 (内存态, 不落持久化)。
 *   ⚠️ 用**集合**而不是单个 turnKey: 本端发过的**每一轮**都算「我发起的」
 *     (单个只记得最近一轮 ⇒ 早先那轮会被误判成机器回报轮)。
 */
export function resolveTurnOrigin(input: {
  frameOrigin?: TurnOrigin | null | undefined;
  frameTurnKey?: string | null | undefined;
  ownTurnKeys?: ReadonlySet<string> | null | undefined;
}): TurnOrigin | null {
  // ① 帧自带 ⇒ 服务端权威, 直接用。
  if (input.frameOrigin === "work_unit_result") return "work_unit_result";
  if (input.frameOrigin === "user") return "user";
  // ② 帧没带 ⇒ 用「我发起过的轮」反推。
  const frameKey =
    typeof input.frameTurnKey === "string" && input.frameTurnKey ? input.frameTurnKey : null;
  if (!frameKey) return null;
  const own = input.ownTurnKeys;
  if (!own || own.size === 0) return null; // ③ 不知道 ⇒ 不敢断言。
  return own.has(frameKey) ? "user" : "work_unit_result";
}

// =========================================================================
// 常驻订阅: 认领轮次身份（订正 32 引入的回归修法）
// -------------------------------------------------------------------------
// 病根 (安卓 6f5f523 · 真机 2026-11-16):
//   「认领 turnKey」的判据**只在发起流路径**里生效 ⇒ 订正 32 之后发消息走
//   `X-Stream-Mode: none` ⇒ 帧从 **GET chat/subscribe 常驻流**回来
//   ⇒ **从不经过发起流路径** ⇒ 本地那一行**永远拿不到 turnKey**
//   ⇒ 归并层 (按 turnKey 判「同一轮」) 配不上 ⇒ **本地行 + 服务端行 = 两个
//   一模一样的气泡**。
//
// ⇒ 常驻订阅路径**必须**认领帧顶层的 turnKey, 并把它**落到本地那一行上**。
// =========================================================================

/** 常驻订阅路径上「当前旁观的那一轮」的状态。 */
export interface PersistentTurnState {
  /** 当前旁观的那一轮的轮次身份 (null = 还没认领 / 老服务端不带)。 */
  turnKey: string | null;
  /** 当前旁观的那一轮的发起方 (null = 不知道)。 */
  origin: TurnOrigin | null;
  /**
   * 已经切过几轮（**第 0 轮 = 还没切过**）。
   *
   * ⚠️ 用它做**落点行 id 的后缀** ⇒ 两轮的行**不撞 id**
   *   (否则第二轮会盖掉第一轮的行 ⇒ 两轮混成一条气泡)。
   * ⚠️ 第 0 轮的行 id **逐字**等于老 id (`attaching-<chatId>`) ⇒ 老路径不变。
   */
  seq: number;
}

/** 初始状态 (还没认领任何一轮)。 */
export function emptyPersistentTurnState(): PersistentTurnState {
  return { turnKey: null, origin: null, seq: 0 };
}

/** 认领一帧的结果。 */
export interface PersistentTurnClaim {
  /** 认领后的状态。 */
  state: PersistentTurnState;
  /** 是不是**切轮**了 (帧的 turnKey 与当前认领的不同 ⇒ 服务端起了一轮新的)。 */
  switched: boolean;
  /** 这一轮的发起方 (判据见 {@link resolveTurnOrigin})。 */
  origin: TurnOrigin | null;
}

/**
 * claimPersistentFrame —— **认领**一帧的轮次身份（常驻订阅路径）。
 *
 * ## 三条规则
 *
 *   ① 帧没带 `turnKey` (老服务端) ⇒ **不认领、不切轮** (行为与改动前逐字一致);
 *   ② 帧的 `turnKey` 与当前认领的**相同** ⇒ 同一轮 ⇒ 不切轮;
 *   ③ 帧的 `turnKey` **变了** ⇒ **切轮** ⇒ 认领新身份 + 判定这一轮的发起方
 *      (帧自带 `origin` 优先; 没有 ⇒ 用「我发起过的轮」反推)。
 *
 * ## `seq` 的口径 (落点行 id 的后缀)
 *
 *   · **首次认领** (之前一轮都没绑) ⇒ `seq` 保持 0 ⇒ 行 id **逐字**是老 id
 *     ⇒ 老路径行为不变;
 *   · **切轮** ⇒ `seq + 1` ⇒ 两轮的行**不撞 id**。
 *
 * @param prev        当前旁观轮次的状态。
 * @param frame       一帧 (帧顶层带 turnKey / origin)。
 * @param ownTurnKeys **本端发起过**的轮次身份集合 (内存态, 不落持久化)。
 */
export function claimPersistentFrame(
  prev: PersistentTurnState,
  frame: unknown,
  ownTurnKeys?: ReadonlySet<string> | null | undefined
): PersistentTurnClaim {
  const { turnKey, origin: frameOrigin } = readFrameTurn(frame);
  // ① 老服务端不带 turnKey ⇒ 认不出这一轮 ⇒ 原样返回 (老行为逐字不变)。
  if (!turnKey) return { state: prev, switched: false, origin: prev.origin };
  // ② 同一轮 ⇒ 不切轮。
  if (turnKey === prev.turnKey) return { state: prev, switched: false, origin: prev.origin };
  // ③ 切轮 ⇒ 认领新身份 + 判发起方。
  const origin = resolveTurnOrigin({
    frameOrigin,
    frameTurnKey: turnKey,
    ownTurnKeys,
  });
  const firstBind = prev.turnKey === null;
  return {
    state: {
      turnKey,
      origin,
      seq: firstBind ? prev.seq : prev.seq + 1,
    },
    switched: true,
    origin,
  };
}

/**
 * buildAttachRowId —— 旁观落点行的 id。
 *
 * ⚠️ `turnSeq === 0` ⇒ **逐字老 id** (`attaching-<chatId>`) ⇒ 老路径行为不变。
 * ⚠️ `turnSeq > 0` ⇒ 带轮次序号 ⇒ **两轮不撞 id** (常驻订阅切轮时另起一行)。
 */
export function buildAttachRowId(chatId: string, turnSeq: number | null | undefined): string {
  const seq = typeof turnSeq === "number" && turnSeq > 0 ? turnSeq : 0;
  return seq > 0 ? `attaching-${chatId}#${seq}` : `attaching-${chatId}`;
}

// =========================================================================
// 行级: 这一行是不是「服务端投递的系统注记」
// =========================================================================

/**
 * isSystemNoticeMetadata —— 这一行是不是「服务端投递的**系统注记**」
 * (不是用户说的话)。
 *
 * ## 判据 (两个都是, 「或」关系)
 *
 *   · `metadata.source === 'work_unit_result'` —— 老服务端;
 *   · `metadata.skip_transcript === true`      —— 新服务端 (通用标记)。
 *
 * @param metadata 服务端落库那行的 `metadata` (对象 **或** JSON 字符串 **或** null)。
 * @returns true ⇒ 这一行该渲染成**系统注记** (不是用户气泡)。
 *
 * ⛔ **只判, 不合成任何文案** (契约 §4.2): 那句提示的正文由服务端写,
 *   端侧只**显示**它。
 */
export function isSystemNoticeMetadata(metadata: unknown): boolean {
  const meta = readMetadataObject(metadata);
  if (!meta) return false;
  if (meta[METADATA_SOURCE_KEY] === WORK_UNIT_NOTICE_SOURCE) return true;
  return meta[SKIP_TRANSCRIPT_FLAG] === true;
}

/**
 * readMetadataObject —— 把 metadata 读成对象 (对象 / JSON 字符串 / null 三种形态)。
 *
 * ⚠️ 解析失败 ⇒ null (端侧**不猜、不编**) ⇒ 判据自然判成 false。
 */
function readMetadataObject(metadata: unknown): Record<string, unknown> | null {
  if (!metadata) return null;
  if (typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  if (typeof metadata !== "string") return null;
  try {
    const parsed = JSON.parse(metadata);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
