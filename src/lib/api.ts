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
    // E2E 模式 (CI 截图 / 本地走查用): 不要清 auth, 让 demo user 保留.
    // 真实用户流不受影响 (e2e_user 注入路径只在 CI / 走查时使用).
    if (typeof window !== "undefined" && (window as unknown as { __GACODE_E2E__?: boolean }).__GACODE_E2E__) {
      throw new Error("unauthorized (e2e bypass)");
    }
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

// =========================================================================
// 阶段 2 — Chat / Sessions / Notifications / 通知
//
// 端点跟 unified-api 对齐 (用 gacode-web/src/lib/api.ts:454-1042 cross-check,
// 命名风格跟 web 同步, 改时两边一起改).
//
// 大整数 id 始终走字符串 (后端 JSON number 丢精度).
// =========================================================================

export interface ChatSession {
  id: string;
  title: string;
  pinned: boolean;
  updatedAt: string;
  createdAt: string;
  hasNewMessage?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** 服务端 metadata (image_urls / attached_file_ids / attached_files) — 自解析 */
  imageUrls?: string[];
  attachedFileIds?: string[];
  attachedFileNames?: Array<{ fileId: string; name: string }>;
  phasesJson?: string | null;
}

export interface NotificationItem {
  id: string;
  title: string;
  body?: string;
  type?: string;
  read?: boolean;
  createdAt: string;
}

// ─────────── Sessions ───────────

export async function getChats(): Promise<{ chats: ChatSession[] }> {
  const r = await request<{
    items: Array<{
      id: string;
      title: string;
      pinned: boolean;
      updated_at: string;
      created_at: string;
      hasNewMessage?: boolean;
    }>;
    next_cursor: string | null;
  }>("/yinian/sessions");
  return {
    chats: (r.items ?? []).map((s) => ({
      id: String(s.id),
      title: s.title,
      pinned: !!s.pinned,
      updatedAt: s.updated_at,
      createdAt: s.created_at,
      hasNewMessage: !!s.hasNewMessage,
    })),
  };
}

export interface CreateChatInput {
  /** 可选: 客户端想塞的标题 (server 默认"新对话") */
  title?: string;
}

export function createChat(input: CreateChatInput = {}): Promise<ChatSession> {
  return request<ChatSession>("/yinian/sessions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function renameChat(id: string, title: string): Promise<ChatSession> {
  return request<ChatSession>(`/yinian/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export function setSessionPin(id: string, pinned: boolean): Promise<ChatSession> {
  return request<ChatSession>(`/yinian/sessions/${id}/pin`, {
    method: "PATCH",
    body: JSON.stringify({ pinned }),
  });
}

export function deleteSession(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/yinian/sessions/${id}`, { method: "DELETE" });
}

/** 批量删除 — server 端 sessions-batch.routes.js (max 50) */
export function deleteSessions(ids: string[]): Promise<{ ok: true; deletedCount: number }> {
  return request<{ ok: true; deletedCount: number }>(
    "/yinian/sessions/batch-delete",
    { method: "POST", body: JSON.stringify({ ids }) },
  );
}

// ─────────── History (messages) ───────────

export async function getHistory(chatId: string): Promise<{
  messages: ChatMessage[];
  nextCursor: string | null;
}> {
  const r = await request<{
    items: Array<{
      id: string;
      role: string;
      content: string;
      created_at: string;
      metadata?: string | Record<string, unknown> | null;
    }>;
    next_cursor: string | null;
  }>(`/yinian/sessions/${chatId}/messages`);
  const messages: ChatMessage[] = (r.items ?? []).map((m) => {
    let imageUrls: string[] | undefined;
    let attachedFileIds: string[] | undefined;
    let attachedFileNames: Array<{ fileId: string; name: string }> | undefined;
    if (m.metadata) {
      try {
        const meta = typeof m.metadata === "string" ? JSON.parse(m.metadata) : m.metadata;
        if (Array.isArray(meta?.image_urls)) imageUrls = meta.image_urls as string[];
        if (Array.isArray(meta?.attached_file_ids))
          attachedFileIds = meta.attached_file_ids as string[];
        if (Array.isArray(meta?.attached_files)) {
          attachedFileNames = (
            meta.attached_files as Array<{ file_id?: unknown; filename?: unknown }>
          )
            .filter((f) => f && (f as { file_id?: unknown }).file_id)
            .map((f) => ({
              fileId: String((f as { file_id: unknown }).file_id),
              name: String((f as { filename?: unknown }).filename || "附件"),
            }));
        }
      } catch {
        /* ignore malformed metadata */
      }
    }
    return {
      id: String(m.id),
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
      createdAt: m.created_at,
      imageUrls,
      attachedFileIds,
      attachedFileNames,
    };
  });
  return { messages, nextCursor: r.next_cursor };
}

// ─────────── Notifications (top-level, 非 /yinian/*) ───────────

export async function listNotifications(
  unread: boolean,
): Promise<{ notifications: NotificationItem[]; unreadCount: number }> {
  const qs = unread ? "?unread=true" : "";
  const r = await request<{
    notifications: Array<{
      id: string | number;
      title: string;
      body?: string;
      type?: string;
      isRead?: boolean;
      createdAt: string;
    }>;
    unreadCount: number;
  }>(`/notifications${qs}`);
  return {
    notifications: (r.notifications ?? []).map((n) => ({
      id: String(n.id),
      title: n.title,
      body: n.body,
      type: n.type,
      read: n.isRead,
      createdAt: n.createdAt,
    })),
    unreadCount: r.unreadCount ?? 0,
  };
}

// ─────────── Notifications: mark read ───────────
// 端点 /notifications/:id/read (PATCH) + /notifications/read-all (PATCH) —
// server 端走 notifications/notification.routes.js:140-176, 单条 + 批量都返 { ok: true }.
// 客户端在 onSuccess 调 queryClient.invalidateQueries 把 unread 计数 / 列表刷新.

export function markNotificationRead(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/notifications/${id}/read`, { method: "PATCH" });
}

export function markAllNotificationsRead(): Promise<{ ok: true }> {
  return request<{ ok: true }>("/notifications/read-all", { method: "PATCH" });
}

// =========================================================================
// 阶段 4 — Notifications SSE
//
// 端点: GET /notifications/stream — unified-api notifications/notification.routes.js:46-83
// 鉴权: 同其它端点 — Bearer accessToken (内存) + refresh cookie (credentials: include)
// 载荷: text/event-stream, data: 行 JSON
//   - `{ type: "connected" }` 握手
//   - `{ type: "notification", notification: {id, title, body, ...} }` 新通知推送
//   - `: heartbeat\n\n` 心跳 (comments, EventSource 会忽略)
//
// 为什么不放主进程: 主进程 + renderer 都要带 in-memory token, 主进程没有
// (token 只在 AuthProvider 里), 让渲染层 EventSource 连更直接, query/cookie
// 跟 fetch 同一个会话共享; 拿到通知后通过 IPC 把 {title, body} 推主进程弹
// Windows Toast (系统通知栏)。
// =========================================================================
export const NOTIFICATION_STREAM_PATH = "/notifications/stream";

export function getNotificationStreamUrl(): string {
  return `${API_BASE}${NOTIFICATION_STREAM_PATH}`;
}

// =========================================================================
// SSE 鉴权 accessor — EventSource 不能自定义 header (浏览器限制),
// 必须把 token 拼到 ?token= query 上。这条 getter 由 AuthProvider mount 时
// 注册 (跟 cancel / upload 同一套用法), SSE 客户端读它拼 URL。
// =========================================================================
type AuthTokenGetter = () => string | null;
let sseTokenGetter: AuthTokenGetter = () => null;
export function registerSseAuthAccessor(getter: AuthTokenGetter): void {
  sseTokenGetter = getter;
}

export function getAccessTokenForSse(): string | null {
  return sseTokenGetter();
}

/**
 * 构造 EventSource URL: 携带 access token 到 ?token= query.
 *
 * 必须配合 server 端允许 (unified-api auth 插件读 query token, 跟 bearer
 * header 等价). 这样 web 跟 electron 共用同一套 SSE 流.
 *
 * 注: 真实用户流拿 cookie (refresh 路径会自动轮换); demo E2E 模式不连 SSE.
 */
export function buildNotificationStreamUrl(): string {
  const base = getNotificationStreamUrl();
  const tok = sseTokenGetter();
  if (!tok) return base;
  return `${base}?token=${encodeURIComponent(tok)}`;
}

// =========================================================================
// 阶段 3 — Library / Deliveries / Profile
//
// 端点跟 unified-api yinian.routes.js + library.routes.js + profile.routes.js
// 对齐, 命名风格跟 web 同步, 改时两边一起改.
// =========================================================================

// ─────────── Library ───────────
// yinian_library_item shape (server 端): web LibraryItem = { id, type, title,
// url?, tags?, createdAt }. type ∈ 'image' | 'doc' | 'link' (DB modality 映射).
export interface LibraryItem {
  id: string;
  type: "image" | "doc" | "link" | "text";
  title: string;
  url?: string;
  tags?: string[];
  createdAt: string;
}

export async function listLibrary(params: {
  type?: string;
  tag?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
} = {}): Promise<{
  items: LibraryItem[];
  total?: number | null;
  hasMore: boolean;
  page?: number;
  pageSize?: number;
}> {
  const qs = new URLSearchParams(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== "",
    ) as [string, string][],
  ).toString();
  return request<{
    items: LibraryItem[];
    total?: number | null;
    hasMore: boolean;
    page?: number;
    pageSize?: number;
  }>(`/yinian/library${qs ? `?${qs}` : ""}`);
}

export function getLibraryItem(
  id: string,
  withContent = false,
): Promise<LibraryItem> {
  const qs = withContent ? "?withContent=true" : "";
  return request<LibraryItem>(`/yinian/library/${id}${qs}`);
}

export function deleteLibraryItem(id: string): Promise<{ success: true }> {
  return request<{ success: true }>(`/yinian/library/${id}`, {
    method: "DELETE",
  });
}

export interface CreateLibraryItemInput {
  type: "image" | "doc" | "link" | "text";
  title: string;
  url?: string;
  tags?: string[];
}

export function createLibraryItem(
  input: CreateLibraryItemInput,
): Promise<LibraryItem> {
  return request<LibraryItem>("/yinian/library", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ─────────── Deliveries ───────────
// 端点跟 unified-api deliverables.routes.js 对齐. server 端 list DTO
// 字段: id, sessionId, messageId, deliverableType, title, url, thumbnailUrl,
// mimeType, sizeBytes, prompt, origin, createdAt.
export interface Deliverable {
  id: string;
  sessionId: string;
  messageId: string;
  deliverableType: "image" | "web" | "document";
  title?: string;
  url?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  sizeBytes?: number | string;
  prompt?: string;
  /** "ai_generated" | "user_uploaded" | null (legacy) — server 已硬过滤掉 user_uploaded */
  origin?: string | null;
  createdAt: string;
  // 仅 detail 端点
  description?: string;
  userId?: string;
  toolName?: string;
  metadata?: unknown;
  updatedAt?: string;
}

export interface DeliverableListResponse {
  items: Deliverable[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function listDeliverables(params: {
  type?: string;
  page?: number;
  pageSize?: number;
  sessionId?: string;
  keyword?: string;
} = {}): Promise<DeliverableListResponse> {
  const qs = new URLSearchParams(
    Object.entries(params).filter(
      ([, v]) => v !== undefined && v !== "",
    ) as [string, string][],
  ).toString();
  return request<DeliverableListResponse>(
    `/yinian/deliverables${qs ? `?${qs}` : ""}`,
  );
}

export function getDeliverable(id: string): Promise<Deliverable> {
  return request<Deliverable>(`/yinian/deliverables/${id}`);
}

export function deleteDeliverable(
  id: string,
): Promise<{ id: string; deletedAt: string }> {
  return request<{ id: string; deletedAt: string }>(
    `/yinian/deliverables/${id}`,
    { method: "DELETE" },
  );
}

// ─────────── Profile ───────────
// server 端 profile.routes.js: PUT /profile body { displayName?, gender?, bio? }
// 至少传一个字段. 返回 profile row (id, username, displayName, gender, bio,
// avatar, email, createdAt).
export type Gender = "male" | "female" | "other" | "unspecified";

export interface ProfileData {
  id: string;
  username: string;
  displayName?: string;
  gender?: Gender;
  bio?: string;
  avatar?: string;
  email?: string;
  createdAt?: string;
}

export function getProfile(): Promise<ProfileData> {
  return request<ProfileData>("/gacode/profile");
}

export interface UpdateProfileInput {
  displayName?: string | null;
  gender?: Gender;
  bio?: string | null;
}

export function updateProfile(input: UpdateProfileInput): Promise<ProfileData> {
  return request<ProfileData>("/gacode/profile", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

// 头像上传 — 走 multipart (跟 web uploadAvatar 同形). server 端
// profile.routes.js: POST /profile/avatar, 字段名 'avatar' 或 'file'. 返
// { ok, data: { avatarUrl, size } }. 这里兼容 web 习惯: 返 { url } 给上层.
export async function uploadAvatar(
  file: File,
): Promise<{ url: string } | { avatar: string }> {
  const fd = new FormData();
  fd.append("avatar", file);
  const r = await request<{ avatarUrl?: string; avatar?: string; url?: string }>(
    "/gacode/profile/avatar",
    { method: "POST", body: fd },
  );
  // server 返 { avatarUrl }, web 端期望 { url }. 兼容两种命名.
  const url = r.avatarUrl || r.avatar || r.url;
  if (!url) throw new Error("头像上传响应缺少 url 字段");
  return { url };
}