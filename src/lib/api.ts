/**
 * lib/api.ts — 阶段 1 API 客户端
 *
 * 协议 (跟 gacode-web / yinian-android 对齐):
 *   - Base URL: https://www.gaga.sale/api/v1
 *   - access_token: 内存持有 (AuthContext.accessToken) — 不存 cookie/storage,
 *     防止 token 从 XSS 漏出. XSS 也能读 memory 但 Electron renderer 是
 *     nodeIntegration=false / contextIsolation=true (PR 1 已加固), 攻击面
 *     大幅缩小, 跟 gacode-web 决策一致.
 *   - refresh_token: server Set-Cookie HttpOnly, 客户端不可读, 跟着
 *     `credentials: "include"` 自动带. refresh 时也走 include 一次, server
 *     读 cookie 鉴权 + 签发新 accessToken + 可能轮换 refresh cookie.
 *   - v2 协议 unwrap: { ok, data?, error? } → 成功返 data, 失败 throw Error
 *     带 error.message/error.code
 *   - 大整数 ID 走字符串, 不做 Number 转换
 *
 * 401 自动 refresh (对齐 gacode-web api.ts):
 *   - 全局 fetch 包装, 捕获 401 时调 POST /auth/refresh 拿新 accessToken
 *   - refreshPromise 缓存: 多个 401 并发去重, 同一时间只触发一次 refresh
 *   - refresh 成功 → 用新 token 重发原请求
 *   - refresh 失败 → 调 useAuth.clear() 清状态 + 让 ProtectedRoute 把
 *     用户踢回 /login
 *
 * 阶段 1 范围:
 *   - 不接 SSE / 文件上传 / 其他业务 API
 *   - body 默认 JSON, 不处理 FormData (阶段 3 才需要)
 */

const API_BASE = "https://www.gaga.sale/api/v1";

/**
 * Auth state accessor — 延迟解析, 让 lib/auth.tsx 注册 useAuth 后再被读.
 * 避免 lib/api.ts 直接 import lib/auth.tsx 造成循环依赖.
 *
 * api.ts 只读不写 accessToken; token 的设置由 AuthProvider 在 login /
 * refresh 成功后显式调 setAccessToken. 这里只暴露"取 token" + "清状态"
 * 两个动作给 request() 内部用.
 */
type AccessTokenGetter = () => string | null;
type AuthClearer = () => void;

let getAccessToken: AccessTokenGetter = () => null;
let clearAuth: AuthClearer = () => {};

export function registerAuthAccessors(getter: AccessTokenGetter, clearer: AuthClearer): void {
  getAccessToken = getter;
  clearAuth = clearer;
}

interface V2Response<T> {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

/** 并发去重的 refresh promise (跟 gacode-web api.ts 一致) */
let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const r = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) return false;
      const json = (await r.json()) as V2Response<{ accessToken?: string }>;
      if (!json.ok || !json.data?.accessToken) return false;
      // 通知 AuthProvider 更新内存里的 accessToken
      // (useAuthStore/AuthProvider 监听这个 channel)
      window.dispatchEvent(
        new CustomEvent("gacode:auth-refreshed", {
          detail: { accessToken: json.data.accessToken },
        }),
      );
      return true;
    } catch {
      return false;
    }
  })();
  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  // 默认 Content-Type for JSON bodies (caller 走 .json() 时自己序列化)
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = getAccessToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  let res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include", // refresh cookie + 任何 server 都给的 HttpOnly cookie
  });

  // 401 → 自动 refresh + 重试 (单飞)
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const refreshed = await tryRefresh();
    if (!refreshed) {
      // refresh 失败 → 清空 in-memory 状态 + 通知 UI 层 (App.tsx 的
      // AuthClearListener 会 toast + 跳 /login). Protected 路由也会
      // 在下次渲染时检测到 user=null 自动跳.
      clearAuth();
      window.dispatchEvent(new CustomEvent("gacode:auth-cleared"));
      throw new Error("unauthorized");
    }
    // 用新 token 重发
    const newToken = getAccessToken();
    if (newToken) {
      headers.set("Authorization", `Bearer ${newToken}`);
    }
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
    // 二次 401 还是失败, 别再 refresh (避免死循环)
    if (res.status === 401) {
      clearAuth();
      window.dispatchEvent(new CustomEvent("gacode:auth-cleared"));
      throw new Error("unauthorized");
    }
  }

  // 解析 v2 body
  let json: V2Response<T> | null = null;
  try {
    json = (await res.json()) as V2Response<T>;
  } catch {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  if (!json || !json.ok) {
    const msg =
      json?.error?.message ||
      json?.error?.code ||
      `HTTP ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  return json.data as T;
}

// =========================================================================
// Auth API wrappers — 直接调 server 的 endpoint, 让 lib/auth.tsx 负责
// 把 accessToken 装到内存 + 把 user 装到 state.
// =========================================================================

export interface User {
  id: string;
  username: string;
  email?: string | null;
  displayName?: string;
  avatar?: string | null;
  createdAt?: string;
}

export interface LoginResponse {
  accessToken: string;
  user: User;
  // refreshToken 走 HttpOnly Set-Cookie, 客户端不接
}

export interface RegisterInput {
  username: string;
  password: string;
  email?: string;
  displayName?: string;
}

export const authApi = {
  login: (username: string, password: string) =>
    request<LoginResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  register: (input: RegisterInput) =>
    request<{ user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  me: () => request<User>("/auth/me"),

  logout: () =>
    request<{ ok: true }>("/auth/logout", { method: "POST" }),
};