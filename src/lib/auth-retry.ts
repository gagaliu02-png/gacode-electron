/**
 * src/lib/auth-retry.ts —— **带 token + 401 自动续期**的单一真源
 *
 * [2026-11-18 · T-039 · PC 端真机复现] 「提示有轮次在跑，要重试」的根因之一。
 *
 * ## 三个真 bug（都是这条路的）
 *
 * 【A】**第一次请求压根没带 accessToken**
 *   `chat-stream.ts` 的三条路（发起 / 只读接入 / 无流）都是 `fetchX(null)` 起手
 *   ⇒ `buildChatStreamHeaders` 的 `authorization` 为空 ⇒ **不带 Authorization 头**
 *   ⇒ 服务端只能靠 cookie ⇒ cookie 没了就 **401**
 *   ⇒ 于是「闲置一阵子后的第一条消息」必然 401 → refresh → 重试。
 *   ⚠️ 而且 refresh 拿到的新 token **只用于那一次重试** ⇒ 下一条消息又走同样的 401+refresh。
 *   ⇒ 修法：**第一次就带当前 token**（`getAccessTokenForSse()` —— 这个 getter
 *   `lib/auth.tsx` 一直在注册，但**全仓没人用**）。
 *
 * 【B】**401 没有专门处理** ⇒ 落进通用错误分支 ⇒ 弹红色 banner +「重试」，
 *   而且 banner 文案是 `describeStreamingError(kind, raw)` 的 raw —— 服务端原样 message。
 *   ⇒ 用户看到的是**跟真实原因不符**的话（比如「该会话已有轮次在跑」，实际是 token 过期）。
 *   ⇒ 修法：401 且续期失败 ⇒ 抛 `AuthExpiredError`（文案「登录已过期，请重新登录」）。
 *
 * 【C】**续期单飞有两份** ⇒ `api.ts` 一份、`auth-refresh.ts` 一份 ⇒ 两条路同时 401 会各刷一次
 *   ⇒ server 端 refresh token 是 **rotation**（旧的立刻作废）⇒ 后刷的那次拿到已作废的 token ⇒ 失败。
 *   ⇒ 修法：**全仓只有 `auth-refresh.ts` 一份单飞**；`api.ts` 的 `tryRefresh()` 改为委托它。
 *
 * ## 为什么依赖是「注入」的
 *
 *   token 从哪来、续期怎么刷、登录过期要不要清状态 —— 这三件事**只有 app 知道**
 *   （`lib/auth.tsx` 是登录态的持有者）。
 *   ⇒ 本模块**零 import**（连 `auth-refresh.ts` 都不 import）⇒
 *   ① `node --test` 能直接加载并跑真逻辑（`test/pc-sse-401-auth.test.mjs`）；
 *   ② **不破坏**既有测试的「临时模块图」（那些图只搬 `api.ts` / `chat-stream.ts` 等少数文件，
 *      多一个 import 就可能 ERR_MODULE_NOT_FOUND）；
 *   ③ 渲染层 / 主进程都能用，零循环依赖。
 *   ⇒ app 侧在 `lib/auth.tsx` 里 `configureAuthRetry({...})` 一次（AuthProvider mount 时）。
 */

/** 登录态失效（401 且续期失败）—— 专用错误类型，**不许**落进通用错误分支。 */
export class AuthExpiredError extends Error {
  readonly code = "AUTH_EXPIRED";
  constructor(message = "登录已过期，请重新登录") {
    super(message);
    this.name = "AuthExpiredError";
  }
}

/** app 侧注入进来的依赖。 */
export interface AuthRetryDeps {
  /** 取当前 accessToken（null = 没登录）。 */
  getToken: () => string | null;
  /** 续期：成功返回**新** accessToken，失败返回 null（内部自带单飞）。 */
  refresh: () => Promise<string | null>;
  /** 续期失败时的收尾（清登录态 / 通知 UI）。 */
  onAuthExpired?: () => void;
}

let deps: AuthRetryDeps = {
  getToken: () => null,
  refresh: async () => null,
};

/** app 侧注入依赖（`lib/auth.tsx` 在 AuthProvider mount 时调一次）。 */
export function configureAuthRetry(next: AuthRetryDeps): void {
  deps = next;
}

/**
 * 发一次请求；401 就自动续期并重试一次。
 *
 * @param doFetch 真正的发包函数（入参 = 这一次要用的 accessToken）
 * @param opts.label 日志前缀；`clearOnExpired=false` ⇒ 续期失败**不**清登录态
 * @returns 正常响应（**一定不是 401**）
 * @throws {AuthExpiredError} 续期失败（或续期后仍是 401）
 */
export async function fetchWithAuthRetry(
  doFetch: (accessToken: string | null) => Promise<Response>,
  opts: { label?: string; clearOnExpired?: boolean } = {},
): Promise<Response> {
  // 【A】第一次就带当前 token ⇒ 绝大多数请求**根本不会 401**。
  let res = await doFetch(deps.getToken());
  if (res.status !== 401) return res;

  // 【C】续期只有一份单飞（app 注入的那个 refresh）。
  const fresh = await deps.refresh();
  if (!fresh) return raiseAuthExpired(opts);

  console.warn(
    `[gacode-sse] ${opts.label ?? "request"} got 401, refreshed token, retrying`,
  );
  res = await doFetch(fresh);
  // 续期后仍是 401 ⇒ 这次是真的没权限了 ⇒ 别再刷（避免死循环）。
  if (res.status === 401) return raiseAuthExpired(opts);
  return res;
}

/** 401 且续期失败 ⇒ 收尾 + 抛专用错误。 */
function raiseAuthExpired(opts: { clearOnExpired?: boolean }): never {
  if (opts.clearOnExpired !== false) {
    try {
      deps.onAuthExpired?.();
    } catch {
      /* ignore */
    }
  }
  throw new AuthExpiredError();
}
