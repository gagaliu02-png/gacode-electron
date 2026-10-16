/**
 * lib/auth.tsx — 阶段 1 认证层
 *
 * 用 React Context 持有 in-memory 的 accessToken + user.
 *
 *   - 选 Context 而不是 zustand: 阶段 0 没装 zustand, 阶段 1 边界 "不引新依赖",
 *     所以走 Context. 等阶段 N 真的需要 store (chat history / pending approvals
 *     这种跨多组件共享的复杂态) 再装 zustand, 不要现在就装.
 *
 *   - accessToken 内存持有, 不持久化. 关掉应用就丢, 下次启动靠 /auth/me
 *     (携带 HttpOnly refresh cookie) 拿回 user, 拿不到就跳 login.
 *
 *   - login 成功后 server 返 { accessToken, user } + Set-Cookie refreshToken
 *     (HttpOnly). 客户端只把 accessToken 装到内存, refreshToken 浏览器/渲染
 *     层看不到, XSS 也摸不着, 跟 web/android 一致.
 *
 *   - api.ts 通过 registerAuthAccessors() 拿到 getAccessToken / clearAuth,
 *     401 自动 refresh 路径里复用同一个 in-memory token.
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
import { authApi, registerAuthAccessors, type User } from "./api";

interface AuthContextValue {
  /** 当前 user (登录态) / null (未登录) */
  user: User | null;
  /** 启动时调 /auth/me, 期间为 true. App.tsx 期间显示 loading 占位 */
  loading: boolean;
  /** 调 /auth/login, 成功后 setUser + setAccessToken + 返回 user */
  login: (username: string, password: string) => Promise<User>;
  /** 调 /auth/register, 成功后 setUser + setAccessToken + 返回 user */
  register: (input: {
    username: string;
    password: string;
    email?: string;
    displayName?: string;
  }) => Promise<User>;
  /** 调 /auth/logout + 清内存状态 (失败也清, 跟 web 一致) */
  logout: () => Promise<void>;
  /** 手动设 token (api.ts 401 refresh 成功后通过 window event 通知) */
  setAccessToken: (token: string | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 把 setAccessToken / clear 注入到 api.ts, 让 401 refresh 路径也能更新内存 token
  useEffect(() => {
    registerAuthAccessors(() => accessToken, () => {
      setAccessTokenState(null);
      setUser(null);
    });
    // 监听 refresh 成功事件 (lib/api.ts:tryRefresh dispatch)
    const onRefreshed = (e: Event) => {
      const detail = (e as CustomEvent<{ accessToken?: string }>).detail;
      if (detail?.accessToken) setAccessTokenState(detail.accessToken);
    };
    window.addEventListener("gacode:auth-refreshed", onRefreshed);
    return () => {
      window.removeEventListener("gacode:auth-refreshed", onRefreshed);
    };
  }, [accessToken]);

  // 启动 hydrate: 拿 refresh cookie 调 /auth/me, 拿到 user 就 setUser,
  // 拿不到 (cookie 失效/没登录) 就当未登录.
  useEffect(() => {
    // E2E 测试 bypass: URL 带 ?e2e_user=<base64 json> 时直接用注入的 user,
    // 跳过 /auth/me 调用. 仅用于 CI 截图 / 手动验证布局, 不影响真用户流.
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const e2eB64 = params.get("e2e_user");
      if (e2eB64) {
        try {
          const decoded = JSON.parse(atob(decodeURIComponent(e2eB64)));
          // 同时支持 accessToken 字段, 跳过后续 api 调用 401
          if (decoded.accessToken) setAccessTokenState(decoded.accessToken);
          if (decoded.user) setUser(decoded.user);
          setLoading(false);
          return;
        } catch (e) {
          console.warn("[gacode:auth] e2e_user bypass failed to decode", e);
          // fallthrough to normal flow
        }
      }
    }

    let cancelled = false;
    (async () => {
      try {
        const me = await authApi.me();
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) {
          setUser(null);
          setAccessTokenState(null);
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
      await authApi.logout();
    } catch {
      // 即便 server 报错, 也清本地状态 — 用户视角 "登出" 一定要成功
    }
    setAccessTokenState(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      login,
      register,
      logout,
      setAccessToken: setAccessTokenState,
    }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}