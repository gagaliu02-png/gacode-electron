/**
 * 日程中心 — HTTP 传输层 (日程域唯一的 fetch 出口)
 *
 * ⚠️ 为什么不直接复用 src/lib/api.ts 的 `request<T>()`:
 *   1. `request` 抛错时把后端错误信封压成一行字符串
 *      (api.ts:197-203 `throw new Error(msg)`) —— **`error.code` 被降级成 message、
 *      `error.details` 整个丢掉** (V2Response.error 类型里连 details 字段都没有)。
 *      而契约 §9.4b 要求日程的 4 个错误码必须按 details 渲染具体文案
 *      (DDL_EXCEEDS_PARENT 的 {field,value,parentId,parentDdl,childKind})。
 *      走 request 就只能弹「加载失败」, 拿不到任何明细。
 *   2. `serverTime` 在**信封顶层** (服务端 schedules.routes.js 的 okList:
 *      `reply.send({ ok:true, data, serverTime })`), 而 `request` 只 `return json.data`
 *      ⇒ 顶层字段被静默丢弃 ⇒ `Promise<T>` 表达不了「data + serverTime」。
 *   3. api.ts 是**跨端冻结对齐文件** (api.ts:312-313 注释「跟 web 同步, 改时两边一起改」)
 *      ⇒ 改它波及 chat / notifications / library 全域。日程域单独一层隔离
 *      (web 也是这么定的 —— 见 gacode-web/src/lib/schedule-http.ts:4-5)。
 *
 *   所以日程域自带一个薄传输层。跟 api.ts 对齐的部分:
 *     - JWT 从**内存**取 (api.ts 的 getAccessToken, AuthProvider 注入), 不落 storage
 *     - 401 → api.ts 的 tryRefresh() 续期 → 用新 token 重发原请求
 *     - refresh 也失败 → api.ts 的 clearAuth() 清状态 + 派发 gacode:auth-cleared
 *     - v2 信封 `{ok:true,data}` / `{ok:false,error}` 的 unwrap 口径
 *   唯一不对齐的地方: 抛出的错误**保留 code + details** (ScheduleApiError)。
 *
 * ⚠️ **认证走 PC 自己的内存 token 模型** (跟 web 的 cookie 模型不同):
 *   - web: `Cookies.get("jwt")` + `Cookies.get("refreshToken")`
 *   - PC : `getAccessToken()` (内存) + `tryRefresh()` / `clearAuth()` (api.ts 私有逻辑)
 *   ⇒ **401 单飞只有 api.ts 的 tryRefresh 一份**, 本文件不复制第二份。
 *
 * 契约来源: gaclaw/docs/design/schedule-center-ux-2026-10-20.md §9.4b
 *           unified-api/src/modules/schedules/schedules.errors.js (错误信封真源)
 * 冻结 SHA: a5e672bd28ccbe12d58e56f8ae15d984f201fb60 (2026-10-22 · 总 PM 口径 v14 —— subtask_breakdown 措辞与签名块逐字对齐(给已存在的子任务批量建关键节点, ⚠️ 不建子任务);签名 / DTO / 端点零变化)
 */

import { API_BASE, clearAuth, getAccessToken, tryRefresh } from "./api";

/**
 * 日程 API base —— 绝对地址。
 *
 * ⚠️ 真源在 `src/lib/api.ts` 的 `API_BASE` (= "https://www.gaga.sale/api/v1")。
 *    2026-10-27 B1 批把 api.ts 的 API_BASE 改成 `export` (只加关键字, 零行为变更)
 *    ⇒ 这里**直接 import, 不再逐字复制常量值**。
 *    (先前只加 3 个 export 时只能双写, 换后端地址漏改一处 → 日程域 404 而其它域正常。)
 *
 * 拼接口径: `${SCHEDULE_API_BASE}${path}` ⇒ path 以 "/schedules" 开头,
 *   最终 URL = https://www.gaga.sale/api/v1/schedules/...
 *   (服务端 prefix = /api/v1/schedules, JWT 鉴权 —— unified-api schedules.routes.js:1)
 */
export const SCHEDULE_API_BASE = API_BASE;

/** 后端错误信封里的 error 部分 (schedules.errors.js:37-39)。 */
export interface ScheduleErrorBody {
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * ScheduleApiError — 保留后端 code / details 的错误类型。
 *   UI 必须用 `describeScheduleError` 转文案, 不要直接 String(err.message):
 *   message 是后端原文, details 才是契约 §9.4b 要求的可读明细。
 */
export class ScheduleApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ScheduleApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** 判断是不是本模块抛出的错误 (跨 bundle / 跨 realm 时 instanceof 不可靠, 故 duck typing)。 */
export function isScheduleApiError(err: unknown): err is ScheduleApiError {
  return (
    err instanceof ScheduleApiError ||
    (typeof err === "object" &&
      err !== null &&
      (err as { name?: string }).name === "ScheduleApiError")
  );
}

interface ScheduleRequestInit {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

async function readEnvelope(res: Response): Promise<Record<string, unknown>> {
  try {
    const j = (await res.clone().json()) as unknown;
    return j && typeof j === "object" ? (j as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * 信封解析结果 —— `data` + **响应级 serverTime**。
 *
 * ⚠️ serverTime 在**信封顶层**, 不在 data 里 (契约 §9.5 末尾:
 *    「列表响应里必须带 serverTime (ISO), 用于倒计时」)。
 *    unified-api schedules.routes.js 的 okList 就是
 *    `reply.send({ ok:true, data, serverTime: new Date().toISOString() })`。
 *    倒计时**必须**用它当时间基准 —— 不信任设备本地时间 (契约 §2.1.3 / §6.2 注)。
 */
export interface ScheduleEnvelope<T> {
  data: T;
  /** 响应级 serverTime (ISO); null = 后端没给 (非列表端点 / 旧版本)。 */
  serverTime: string | null;
}

/**
 * 等 AuthProvider 把刷新后的 accessToken 写回内存。
 *
 * ⚠️ 为什么需要等: api.ts 的 tryRefresh() 成功时是**派发事件**
 *    (`gacode:auth-refreshed`) 让 AuthProvider 更新 React state, 而 React 18 的
 *    state 更新是**异步落地**的 (默认 lane → Scheduler 宏任务)。
 *    lib/auth.tsx:392 的 getAccessToken 返回的是 **useState 里的 accessToken**,
 *    tryRefresh() 返回的那一刻它还可能拿到**旧 token**
 *    ⇒ 立刻重发原请求会带着旧 token 再吃一次 401。
 *    这里有界轮询等新 token 落地 (最多 ~300ms), 等不到就沿用当前值
 *    (后面照常按 401 抛错)。
 *
 * ⚠️ 这**不是**第二套 401 单飞 —— 单飞仍然只有 api.ts 的 tryRefresh 一份。
 *
 * ⚠️ **这是日程域的局部增强, 不是全域口径**:
 *    api.ts:172 的 `request()` 在 refresh 成功后是**立刻** `getAccessToken()`
 *    (不等 state 落地) —— chat / library / notifications 全部是这个口径。
 *    日程域比它多等这 ≤300ms, 好处是少一次必然失败的 401 重发;
 *    代价是最坏多 300ms 延迟 (等不到就退化 = 与全域一致)。
 *    ⚠️ 全域口径要不要一起改 = 另一个议题 (api.ts 是跨端冻结文件),
 *    本批**不碰** —— 日程域先把这一处做对, 记在 docs/align-schedule-contracts.md。
 */
async function waitForFreshToken(prev: string | null): Promise<string | null> {
  const deadline = Date.now() + 300;
  let cur = getAccessToken();
  while ((!cur || cur === prev) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 10));
    cur = getAccessToken();
  }
  return cur;
}

/** refresh 失败 = 真登出: 清内存态 + 派发事件 (App.tsx 的 AuthClearListener 会 toast + 跳 /login)。 */
function forceLogout(): void {
  clearAuth();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("gacode:auth-cleared"));
  }
}

/**
 * scheduleFetchEnvelope — 取整封信封 (data + serverTime)。
 *
 * @param path    以 `/schedules` 开头的端点路径 (base 由 SCHEDULE_API_BASE 拼)
 * @param options method / body (body 会被 JSON.stringify; 不传 = 不带 body)
 * @returns       `{ data, serverTime }`
 * @throws        ScheduleApiError (带 status / code / details)
 */
export async function scheduleFetchEnvelope<T>(
  path: string,
  options: ScheduleRequestInit = {},
): Promise<ScheduleEnvelope<T>> {
  const { method = "GET", body } = options;

  const headers: Record<string, string> = {};
  // ⚠️ 只在真有 JSON body 时设 Content-Type —— Fastify 对空 body + application/json
  //    会报 CTP_EMPTY_JSON_BODY (DELETE / archive / restore 都不带 body)。
  const hasJsonBody = body !== undefined;
  if (hasJsonBody) headers["Content-Type"] = "application/json";

  // JWT 从**内存**取 (PC 不落 cookie / localStorage —— api.ts 的安全决策)。
  const jwt = getAccessToken();
  if (jwt) headers["Authorization"] = `Bearer ${jwt}`;

  const doFetch = () =>
    fetch(`${SCHEDULE_API_BASE}${path}`, {
      method,
      ...(hasJsonBody ? { body: JSON.stringify(body) } : {}),
      headers,
      credentials: "include",
    });

  let res = await doFetch();

  // 401 → 续期 + 重发原请求 (单飞复用 api.ts 的 tryRefresh)
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (!refreshed) {
      forceLogout();
      throw new ScheduleApiError(401, "UNAUTHORIZED", "登录已过期, 请重新登录");
    }
    const prev = jwt ?? null;
    const newToken = await waitForFreshToken(prev);
    if (newToken) headers["Authorization"] = `Bearer ${newToken}`;
    res = await doFetch();
    // 二次 401 还是失败, 别再 refresh (避免死循环)
    if (res.status === 401) {
      forceLogout();
      throw new ScheduleApiError(401, "UNAUTHORIZED", "登录已过期, 请重新登录");
    }
  }

  const envelope = await readEnvelope(res);

  if (!res.ok) {
    const err = (envelope.error ?? {}) as ScheduleErrorBody;
    throw new ScheduleApiError(
      res.status,
      err.code || "HTTP_ERROR",
      err.message || `请求失败 (HTTP ${res.status})`,
      err.details,
    );
  }

  // v2 信封: { ok:true, data, serverTime }; ok:false 走 HTTP 200 的也要拦下来
  if (envelope.ok === false) {
    const err = (envelope.error ?? {}) as ScheduleErrorBody;
    throw new ScheduleApiError(
      200,
      err.code || "API_ERROR",
      err.message || "请求失败",
      err.details,
    );
  }

  const data = (("data" in envelope ? envelope.data : envelope) as T) ?? (null as T);
  const serverTime = typeof envelope.serverTime === "string" ? envelope.serverTime : null;
  return { data, serverTime };
}

/**
 * scheduleFetch — 日程域唯一的 fetch 出口 (只要 data 的场景用这个)。
 *
 * @param path    以 `/schedules` 开头的端点路径 (base 由 SCHEDULE_API_BASE 拼)
 * @param options method / body (body 会被 JSON.stringify; 不传 = 不带 body)
 * @returns       v2 信封 unwrap 后的 `data`
 * @throws        ScheduleApiError (带 status / code / details)
 */
export async function scheduleFetch<T>(
  path: string,
  options: ScheduleRequestInit = {},
): Promise<T> {
  const { data } = await scheduleFetchEnvelope<T>(path, options);
  return data;
}

// ---------------------------------------------------------------------------
// 错误码 → 用户可读文案 (契约 §9.4b 的 4 个码必须按 details 分支, 不许通用「加载失败」)
// ---------------------------------------------------------------------------

const pad2 = (n: number) => String(n).padStart(2, "0");

/** ISO datetime → "MM-DD HH:mm" (本地墙钟)。details 给的是 ISO, 直接展示太长。 */
function shortStamp(v: unknown): string {
  if (typeof v !== "string" || !v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v !== "" ? v : null;

/**
 * describeScheduleError — 把 ScheduleApiError 转成给用户看的一句话。
 *
 *   DDL_EXCEEDS_PARENT          details{field,value,parentId,parentDdl,childKind}
 *   SCHEDULE_DATE_MISMATCH      details{field,date,startAt,endAt,startDay,endDay}
 *   SCHEDULE_TIME_RANGE_INVALID details{field,startAt,endAt}
 *   CRON_UPDATE_FORBIDDEN       无 details
 *   其它                        直接透出后端 message
 *
 * ⚠️ 文案按后端**实际**给的字段渲染, 不照抄契约模板里的字段名 ——
 *    SCHEDULE_DATE_MISMATCH 的 details 里并没有 parentId / parentDdl (那是 DDL_EXCEEDS_PARENT 的)。
 */
export function describeScheduleError(err: unknown): string {
  if (!isScheduleApiError(err)) {
    return String((err as { message?: string })?.message ?? err ?? "加载失败");
  }
  const d = err.details ?? {};

  switch (err.code) {
    case "DDL_EXCEEDS_PARENT": {
      // field=ddl 走「子级 DDL 晚于上级」; field=date 走「日程日期晚于上级截止日」
      if (d.field === "date") {
        return `日程日期 ${str(d.value) ?? "—"} 晚于上级截止日 ${shortStamp(d.parentDdl)}` +
          (str(d.parentId) ? `（上级 ${d.parentId}）` : "");
      }
      return `子级截止时间不能晚于上级：上级 ${shortStamp(d.parentDdl)}，当前 ${shortStamp(d.value)}` +
        (str(d.parentId) ? `（上级 ${d.parentId}）` : "");
    }
    case "SCHEDULE_DATE_MISMATCH":
      return `时段与日期不一致：日期 ${str(d.date) ?? "—"}，时段 ${str(d.startDay) ?? "—"} ~ ${str(d.endDay) ?? "—"}`;
    case "SCHEDULE_TIME_RANGE_INVALID":
      return `时段无效：结束 ${shortStamp(d.endAt)} 必须晚于开始 ${shortStamp(d.startAt)}`;
    case "CRON_UPDATE_FORBIDDEN":
      return "cron 任务只允许切换启用 / 禁用，不能修改其它字段";
    default:
      return err.message;
  }
}
