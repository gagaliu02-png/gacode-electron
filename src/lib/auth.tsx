/**
 * lib/auth.tsx — 阶段 1 认证层
 *
 * 用 React Context 持有 in-memory 的 accessToken + user + refreshToken.
 *
 *   - 选 Context 而不是 zustand: 阶段 0 没装 zustand, 阶段 1 边界 "不引新依赖",
 *     所以走 Context. 等阶段 N 真的需要 store (chat history / pending approvals
 *     这种跨多组件共享的复杂态) 再装 zustand, 不要现在就装.
 *
 *   - accessToken 内存持有, 不持久化. 关掉应用就丢, 下次启动靠持久化
 *     refreshToken 调 /auth/refresh 拿回新 accessToken + 新 refreshToken +
 *     调 /auth/me 拿回 user, 拿不到就跳 login.
 *
 *   - refreshToken 持久化到 Electron userData (path.join(getPath('userData'),
 *     'refresh-token.json')) — 通过 preload bridge `window.gacode.authStorage`
 *     暴露的 read/write/clear IPC 操作. 文件权限 0600 (Windows 下 fs.chmod
 *     实际不强制, 但调一下无害).
 *
 *   - 启动 hydrate 流程:
 *     1) 通过 IPC 读持久化 refreshToken (authStorage.read)
 *     2) 有 refreshToken → 调 authApi.refresh(refreshToken) (带 body 的新版)
 *        → 成功 → 拿新 accessToken + 新 refreshToken + 调 /auth/me → setUser
 *        → 失败 → 清持久化文件 + setUser(null) → ProtectedRoute 跳 /login
 *     3) 没 refreshToken → 直接 setUser(null) → ProtectedRoute 跳 /login
 *
 *   - 401 自动 refresh 路径 (lib/api.ts tryRefresh) 也用 refreshToken getter,
 *     同样走 body. 成功后 dispatch `gacode:auth-refreshed` 事件, AuthProvider
 *     监听同时刷内存 + 刷盘.
 *
 *   - api.ts 通过 registerAuthAccessors() 拿到 getAccessToken / clearAuth,
 *     通过 registerRefreshTokenGetter() 拿到 getRefreshToken, 401 refresh
 *     路径复用同一个 in-memory state.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  authApi,
  registerAuthAccessors,
  registerRefreshTokenGetter,
  registerSseAuthAccessor,
  type User,
} from "./api";
import { registerCancelAuthAccessors } from "./cancel";
import { registerUploadAuthAccessors } from "./upload";

interface AuthContextValue {
  /** 当前 user (登录态) / null (未登录) */
  user: User | null;
  /**
   * 当前内存里的 accessToken (SSE / 内部 hook 需要时直接读).
   * SSE EventSource 不支持自定义 header, 用 ?token= query 拼这个值.
   * 阶段 1 鉴权只走 api.ts 的 getter, 阶段 4 把 token 公开给渲染层旁路用.
   */
  accessToken: string | null;
  /** 启动时调 /auth/me, 期间为 true. App.tsx 期间显示 loading 占位 */
  loading: boolean;
  /** 调 /auth/login, 成功后 setUser + setAccessToken + setRefreshToken + 返回 user */
  login: (username: string, password: string) => Promise<User>;
  /** 调 /auth/register, 成功后 setUser + setAccessToken + 返回 user */
  register: (input: {
    username: string;
    password: string;
    email?: string;
    displayName?: string;
  }) => Promise<User>;
  /** 调 /auth/logout + 清内存 + 清持久化文件 (失败也清, 跟 web 一致) */
  logout: () => Promise<void>;
  /** 手动设 token (api.ts 401 refresh 成功后通过 window event 通知) */
  setAccessToken: (token: string | null) => void;
  /**
   * 一次设齐三件套 (user + accessToken + refreshToken), 用于 QR login 这种
   * server 一次性给齐凭证的场景. 同时把 refreshToken 持久化到磁盘, 下次启动
   * AuthProvider 启动 hydrate 就能自动恢复登录态.
   */
  setSession: (input: { user: User; accessToken: string; refreshToken: string }) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// =========================================================================
// refresh token 持久化 helper — 通过 preload bridge 走主进程 fs.
// 在浏览器场景 (web) 下没有 bridge, 走 fallback: 内存持有 (但刷新即丢,
// 跟原来的 accessToken 内存策略一致, 真实 web 流走 cookie 不会到这).
// =========================================================================

interface AuthStorage {
  read: () => Promise<string | null>;
  write: (refreshToken: string, userId: string) => Promise<void>;
  clear: () => Promise<void>;
}

function getAuthStorage(): AuthStorage | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as unknown as { gacode?: { authStorage?: AuthStorage } })
    .gacode;
  return bridge?.authStorage ?? null;
}

/**
 * 把 refreshToken 写盘 — 走 IPC bridge. 主进程负责文件路径 + 权限.
 * 失败 swallow (console.warn), refresh 流程不应该因为持久化失败阻塞登录.
 */
async function persistRefreshToken(
  refreshToken: string,
  userId: string,
): Promise<void> {
  const storage = getAuthStorage();
  if (!storage) return;
  try {
    await storage.write(refreshToken, userId);
  } catch (err) {
    console.warn("[gacode:auth] failed to persist refreshToken", err);
  }
}

/** 启动时读盘 — 失败 (文件不存在 / parse 失败) 返 null. */
async function loadPersistedRefreshToken(): Promise<string | null> {
  const storage = getAuthStorage();
  if (!storage) return null;
  try {
    return await storage.read();
  } catch (err) {
    console.warn("[gacode:auth] failed to read persisted refreshToken", err);
    return null;
  }
}

/** 清盘 — logout / refresh 失败时用. swallow 错误. */
async function clearPersistedRefreshToken(): Promise<void> {
  const storage = getAuthStorage();
  if (!storage) return;
  try {
    await storage.clear();
  } catch (err) {
    console.warn("[gacode:auth] failed to clear persisted refreshToken", err);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [refreshToken, setRefreshTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 把 setAccessToken / clear / refreshToken 注入到 api.ts, 让 401 refresh
  // 路径也能更新内存 token + 拿 token 拼 /auth/refresh body.
  useEffect(() => {
    const snapshot = () => ({ token: accessToken });
    registerAuthAccessors(() => accessToken, () => {
      setAccessTokenState(null);
      setRefreshTokenState(null);
      setUser(null);
      // 清持久化文件 — fire-and-forget
      void clearPersistedRefreshToken();
    });
    registerRefreshTokenGetter(() => refreshToken);
    // stage 2: 取消 / 上传 fetch 也需要内存 token, 通过同一份 accessor 注入。
    // 结构上保证 accessToken 写在 AuthProvider 里, 其他模块只读不存。
    registerCancelAuthAccessors(snapshot);
    registerUploadAuthAccessors(snapshot);
    // stage 4: SSE EventSource 不能自定义 header, 把 getter 注入到 api.ts,
    // 由 buildNotificationStreamUrl() 拼到 ?token= query. 同一份 snapshot.
    registerSseAuthAccessor(() => accessToken);
    // 监听 refresh 成功事件 (lib/api.ts:tryRefresh dispatch)
    const onRefreshed = (e: Event) => {
      const detail = (e as CustomEvent<{
        accessToken?: string;
        refreshToken?: string;
      }>).detail;
      if (detail?.accessToken) setAccessTokenState(detail.accessToken);
      if (detail?.refreshToken) {
        setRefreshTokenState(detail.refreshToken);
        // server 走 rotation, 新 refreshToken 必须立刻刷盘 — 不然下次启动
        // 用旧 token refresh 一定失败 (server 已作废).
        if (user) {
          void persistRefreshToken(detail.refreshToken, user.id);
        }
      }
    };
    window.addEventListener("gacode:auth-refreshed", onRefreshed);
    return () => {
      window.removeEventListener("gacode:auth-refreshed", onRefreshed);
    };
  }, [accessToken, refreshToken, user]);

  // 启动 hydrate:
  //   1) E2E bypass — URL 带 ?e2e_user=<base64 json> 时直接用注入的 user,
  //      跳过 refresh + /auth/me. 仅用于 CI 截图 / 手动验证布局.
  //   2) 读盘持久化 refreshToken
  //      - 有 → 调 authApi.refresh(refreshToken) (带 body 的新版)
  //        → 成功 → setAccessTokenState(newAT) + setRefreshTokenState(newRT) +
  //          调 /auth/me 拿 user → setUser
  //        - 失败 → 清盘 + setUser(null)
  //      - 没 → 直接 setUser(null)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const e2eB64 = params.get("e2e_user");
      if (e2eB64) {
        try {
          const decoded = JSON.parse(atob(decodeURIComponent(e2eB64)));
          // 同时支持 accessToken + refreshToken 字段, 跳过后续 api 调用 401
          if (decoded.accessToken) setAccessTokenState(decoded.accessToken);
          if (decoded.refreshToken) setRefreshTokenState(decoded.refreshToken);
          if (decoded.user) setUser(decoded.user);
          setLoading(false);
          // 标记 e2e 模式 — api.ts 在 401 时不要清 auth, 避免截图时被踢回 /login
          // (e2e token 不是 server 签发的合法 JWT, 一定会 401, 但我们想保留 demo user
          // 用于截图/本地走查, 真实用户流不受影响)
          if (typeof window !== "undefined") {
            const w = window as unknown as { __GACODE_E2E__?: boolean };
            w.__GACODE_E2E__ = true;
            // e2e 路由跳转 — 既支持 URL ?e2e_route=/library, 也支持 base64 payload
            // 内嵌 e2eRoute 字段. 后者绕开 main.ts 改动: 把 route 放进 JSON 里,
            // 一次性 base64 化 (仅截图用, 真实用户流不会进这条路径)
            const routeFromParam = params.get("e2e_route");
            const routeFromPayload =
              typeof decoded.e2eRoute === "string" ? decoded.e2eRoute : null;
            const e2eRoute = routeFromParam || routeFromPayload;
            if (e2eRoute && e2eRoute.startsWith("/")) {
              // 延迟到下一个 microtask, 让 HashRouter 先挂载
              Promise.resolve().then(() => {
                if (window.location.hash !== `#${e2eRoute}`) {
                  window.location.hash = e2eRoute;
                }
              });
            }
          }
          return;
        } catch (e) {
          console.warn("[gacode:auth] e2e_user bypass failed to decode", e);
          // fallthrough to normal flow
        }
      }
    }

    let cancelled = false;
    (async () => {
      const persisted = await loadPersistedRefreshToken();
      if (cancelled) return;

      if (!persisted) {
        // 没持久化 token → 没登录, 直接跳 /login (ProtectedRoute 检测到
        // user=null 会跳). 不调 /auth/me (server 已不读 cookie 路径, 一定 401).
        setUser(null);
        setAccessTokenState(null);
        setLoading(false);
        return;
      }

      // 有持久化 refreshToken → 先 refresh 拿新 accessToken + 新 refreshToken
      // (server 走 rotation, 旧 token 立刻失效).
      try {
        const r = await authApi.refresh(persisted);
        if (cancelled) return;
        setAccessTokenState(r.accessToken);
        if (r.refreshToken) {
          setRefreshTokenState(r.refreshToken);
          // 刷盘 — 同样 fire-and-forget
          // (userId 这时候还没拿到, 暂时用 placeholder; refresh 路径里的 user
          // 立刻会通过 /auth/me 拿到, 届时会再刷一次. 这里先不传 userId.)
          // —— 实际上文件 schema 要求 userId 字段, 下面 /auth/me 拿到 user
          // 后再调一次 persistRefreshToken 补全.
          void persistRefreshToken(r.refreshToken, "_pending_");
        }
        // 拿 user
        try {
          const me = await authApi.me();
          if (cancelled) return;
          setUser(me);
          // 用真实 userId 重写一次持久化文件 (覆盖 _pending_ placeholder)
          if (r.refreshToken) {
            void persistRefreshToken(r.refreshToken, me.id);
          }
        } catch {
          if (!cancelled) {
            // 拿到 token 但 /auth/me 失败 — 罕见 (server 暂时挂了 / DB 不一致),
            // 走未登录路径
            setUser(null);
            setAccessTokenState(null);
            setRefreshTokenState(null);
            await clearPersistedRefreshToken();
          }
        }
      } catch {
        // refresh 失败 → 清盘 + 未登录
        if (!cancelled) {
          setUser(null);
          setAccessTokenState(null);
          setRefreshTokenState(null);
          await clearPersistedRefreshToken();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await authApi.login(username, password);
    setAccessTokenState(data.accessToken);
    setUser(data.user);
    // refreshToken 持久化到 userData (server 已经在 login 响应 body 里返了).
    // 失败 swallow — refresh 路径不阻塞.
    setRefreshTokenState(data.refreshToken);
    void persistRefreshToken(data.refreshToken, data.user.id);
    return data.user;
  }, []);

  const register = useCallback(
    async (input: {
      username: string;
      password: string;
      email?: string;
      displayName?: string;
    }) => {
      const data = await authApi.register(input);
      // server 返 { user }, 但通常也会给 accessToken (跟 login 一致).
      // 这里兼容两种: 如果 data.user 存在但没 token, 用 me() 兜底.
      // — 实际 server 行为以 unified-api 为准, 阶段 1 假设跟 login 一样.
      setUser(data.user);
      // 注册完尝试直接拿个 accessToken (如果 server 没在 register 返的话)
      try {
        const me = await authApi.me();
        setUser(me);
      } catch {
        // 失败也无妨, user 已经 set, 下次主动调 me 会拿
      }
      return data.user;
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout(refreshToken);
    } catch {
      // 即便 server 报错, 也清本地状态 — 用户视角 "登出" 一定要成功
    }
    setAccessTokenState(null);
    setRefreshTokenState(null);
    setUser(null);
    // 清持久化文件 — fire-and-forget
    void clearPersistedRefreshToken();
  }, [refreshToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      loading,
      login,
      register,
      logout,
      setAccessToken: setAccessTokenState,
      setSession: ({ user: nextUser, accessToken: nextAccessToken, refreshToken: nextRefreshToken }) => {
        setAccessTokenState(nextAccessToken);
        setRefreshTokenState(nextRefreshToken);
        setUser(nextUser);
        // 持久化 refreshToken, 下次启动 AuthProvider hydrate 时能拿到.
        // (跟 password login 路径保持完全一致 — auth.tsx:308-311)
        void persistRefreshToken(nextRefreshToken, nextUser.id);
      },
    }),
    [user, accessToken, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
