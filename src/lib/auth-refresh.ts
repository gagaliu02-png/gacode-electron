/**
 * lib/auth-refresh.ts — SSE 401 retry 路径的 refresh helper
 *
 * 为什么独立文件:
 *   - lib/api.ts 内的 tryRefresh() 没 export, 也未承诺为 SSE 用.
 *   - lib/auth.tsx AuthProvider 是 refresh state 持有者, 边界文件不动.
 *   - SSE 客户端 (sse.ts / notifications-sse.ts) 401 时需要立刻刷新 token
 *     重连, 不能依赖完整 login 流。
 *
 * 复用机制:
 *   - refreshToken 从 IPC bridge `window.gacode.authStorage.read()` 读盘 —
 *     AuthProvider hydrate 时已经把 refreshToken 持久化到 userData/refresh-token.json,
 *     读盘拿到的是"上一次 refresh 后的最新值". server 走 rotation, 旧 token
 *     一旦被这个 helper 用过, 立刻被 server 端作废, 所以每次都从盘读最新值
 *     是安全的 (不会出现"用旧 token 触发额外 rotation 失效").
 *   - refresh 成功后 dispatch `gacode:auth-refreshed` event, AuthProvider 已
 *     在监听 (lib/auth.tsx), 自动 setAccessTokenState + setRefreshTokenState
 *     + persistRefreshToken (写盘覆盖旧值).
 *
 * 并发去重:
 *   - module-level refreshPromise, 跟 lib/api.ts 的 tryRefresh 用同款语义
 *     (web/api.ts 也有同样并发去重, 跨端一致).
 *   - 不跨 module 共享: api.ts 的 401 retry 和这里各自去重, server 端
 *     rotation 安全 (二选一胜出, 败者拿到新 token 失败 → false).
 *
 * 不动 lib/api.ts / lib/auth.tsx: 这个文件自包含, 只依赖已存在的 IPC bridge
 * + 已存在的事件协议.
 */

interface RefreshBridge {
  read: () => Promise<string | null>;
}

function getAuthStorageRead(): (() => Promise<string | null>) | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as unknown as { gacode?: { authStorage?: RefreshBridge } })
    .gacode;
  return bridge?.authStorage?.read ? () => bridge.authStorage!.read() : null;
}

const API_BASE = "https://www.gaga.sale/api/v1";

let refreshPromise: Promise<string | null> | null = null;

/**
 * 触发一次 refresh, 成功返新 accessToken, 失败返 null.
 *
 * 调用方 (sse.ts / notifications-sse.ts) 拿到新 token 后:
 *   - sse.ts: 拼 Authorization: Bearer <新 token> 重发 fetch
 *   - notifications-sse.ts: 拼到 ?token=<新 token> query 重建 EventSource
 */
export async function tryRefreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async (): Promise<string | null> => {
    const read = getAuthStorageRead();
    if (!read) return null;
    const rt = await read();
    if (!rt) return null;
    try {
      const r = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!r.ok) return null;
      const json = (await r.json()) as {
        ok?: boolean;
        data?: { accessToken?: string; refreshToken?: string };
      };
      if (!json.ok || !json.data?.accessToken) return null;
      // 通知 AuthProvider (lib/auth.tsx 监听这个事件)
      //   - setAccessTokenState(newAT) (内存 accessToken)
      //   - setRefreshTokenState(newRT) (内存 refreshToken)
      //   - persistRefreshToken(newRT, user.id) (刷盘, rotation 安全)
      window.dispatchEvent(
        new CustomEvent("gacode:auth-refreshed", {
          detail: {
            accessToken: json.data.accessToken,
            refreshToken: json.data.refreshToken,
          },
        }),
      );
      return json.data.accessToken;
    } catch {
      return null;
    }
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}
