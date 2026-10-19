/**
 * lib/api.ts — 阶段 1 API 客户端
 *
 * 协议 (跟 gacode-web / yinian-android 对齐):
 *   - Base URL: https://www.gaga.sale/api/v1
 *   - access_token: 内存持有 (AuthContext.accessToken) — 不存 cookie/storage,
 *     防止 token 从 XSS 漏出. XSS 也能读 memory 但 Electron renderer 是
 *     nodeIntegration=false / contextIsolation=true (PR 1 已加固), 攻击面
 *     大幅缩小, 跟 gacode-web 决策一致.
 *   - refresh_token: server `unified-api/src/modules/auth/auth.service.js:107-122`
 *     是 48 字节随机 base64url, 登录响应 body 里**明文返**(不是 HttpOnly cookie).
 *     refresh 端点 (`auth.routes.js:29-35`) 要求 `body.refreshToken` (minLength 10),
 *     `auth.service.js:127` 首行 `if (!refreshToken) throw BAD_REQUEST 400`.
 *     也就是说 client 必须把 refreshToken 显式 POST 给 server, server 走
 *     rotation, 旧 refreshToken 立刻失效.
 *   - Electron 端 refreshToken 持久化策略: 存到 Electron userData 文件
 *     (path.join(app.getPath('userData'), 'refresh-token.json')), accessToken
 *     不持久化 — 关掉重启 accessToken 丢, 下次启动 hydrate 时通过持久化
 *     refreshToken 调 /auth/refresh 拿回新 accessToken + 新 refreshToken.
 *   - v2 协议 unwrap: { ok, data?, error? } → 成功返 data, 失败 throw Error
 *     带 error.message/error.code
 *   - 大整数 ID 走字符串, 不做 Number 转换
 *
 * 401 自动 refresh (对齐 gacode-web api.ts):
 *   - 全局 fetch 包装, 捕获 401 时调 POST /auth/refresh 带 body.refreshToken
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
 * api.ts 只读不写 token; token 的设置由 AuthProvider 在 login /
 * refresh 成功后显式调 setAccessToken / setRefreshToken. 这里只暴露"取 token"
 * + "清状态"两个动作给 request() 内部用.
 */
type AccessTokenGetter = () => string | null;
type RefreshTokenGetter = () => string | null;
type AuthClearer = () => void;

let getAccessToken: AccessTokenGetter = () => null;
let getRefreshToken: RefreshTokenGetter = () => null;
let clearAuth: AuthClearer = () => {};

export function registerAuthAccessors(
  getter: AccessTokenGetter,
  clearer: AuthClearer,
): void {
  getAccessToken = getter;
  clearAuth = clearer;
}

/**
 * 注册 refresh token getter — lib/auth.tsx 把持久化的 refreshToken 装到
 * 内存后调这个. tryRefresh() 拿它拼 POST /auth/refresh body.
 */
export function registerRefreshTokenGetter(getter: RefreshTokenGetter): void {
  getRefreshToken = getter;
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
      // server `auth.routes.js:29-35` schema 要求 body.refreshToken (minLength 10),
      // `auth.service.js:127` 首行校验. 不带 body 一定 schema 失败 → clearAuth
      // → "会话过期". 旧实现只 `credentials: "include"` 但 server 不再读 cookie
      // 路径, refresh token 走 body. (unified-api 0.x 改版后的协议.)
      const rt = getRefreshToken();
      if (!rt) return false;
      const r = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!r.ok) return false;
      const json = (await r.json()) as V2Response<{
        accessToken?: string;
        refreshToken?: string;
      }>;
      if (!json.ok || !json.data?.accessToken) return false;
      // 通知 AuthProvider 更新内存里的 accessToken + refreshToken.
      // server 走 rotation, 旧 refreshToken 立刻失效 — 必须同步刷盘 (由
      // AuthProvider 监听事件时调 gacode.authStorage.write).
      window.dispatchEvent(
        new CustomEvent("gacode:auth-refreshed", {
          detail: {
            accessToken: json.data.accessToken,
            // server 可能不返 refreshToken (旧 token 仍有效但未轮换); 这时
            // 保持原值. 但其实 rotation 已写死, 老 token 下次一定失效, 所以
            // 一般都有新 refreshToken. 没返就 fallthrough 到 undefined,
            // AuthProvider 那边不会动.
            refreshToken: json.data.refreshToken,
          },
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
  /** server 在 body 里明文返 (unified-api auth.service.js:107-122), 客户端必须接收 + 持久化. */
  refreshToken: string;
  user: User;
}

export interface RefreshResponse {
  accessToken: string;
  /** server 走 rotation, 旧 refreshToken 立刻失效; 不返就保持原值. */
  refreshToken?: string;
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

  /**
   * refresh — POST /auth/refresh 带 body.refreshToken.
   * server `auth.service.js:127` 首行校验, 不带 body 一定 BAD_REQUEST 400.
   * 跟 tryRefresh() 的实现语义一致, 但这里是给 AuthProvider hydrate 主动调
   * (启动时拿持久化 refreshToken 换新 token + 拿 user), 而 tryRefresh() 是
   * 401 自动 refresh 路径.
   */
  refresh: (refreshToken: string) =>
    request<RefreshResponse>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken }),
    }),

  /**
   * logout — POST /auth/logout 带 body.refreshToken (可选).
   * server 端 `logoutSchema` 不 required, 但带上去可以让 server 立刻作废那
   * 个 refreshToken, 下次别人偷到旧 token 也无法再 refresh.
   */
  logout: (refreshToken?: string | null) =>
    request<{ ok: true }>("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: refreshToken ?? undefined }),
    }),

  // ===== QR-code login (2026-10-17) — PC 端用 =====
  // issue / status 匿名; verify 在 App 端 (requireAuth) 走, 不归 PC 管.
  // PC 流程: issue 拿 token → 显示 QR → App 扫 → 轮询 status → 拿到凭证后调 setSession
  issueQrLogin: () =>
    request<{ token: string; qrUrl: string; expiresIn: number; pollIntervalMs: number }>(
      "/auth/qr-login-issue",
      { method: "POST" },  // POST 没 body, 别带 Content-Type
    ),

  pollQrLoginStatus: (token: string) =>
    request<
        | { status: "pending" }
        | {
            status: "authorized";
            accessToken: string;
            refreshToken: string;
            user: { id: string; displayName: string | null; avatarUrl: string | null };
          }
      >(`/auth/qr-login-status?token=${encodeURIComponent(token)}`),
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
  /** 阶段 8: 是否已撤回 (server 返 recalled=true 时不再走 modify, 但保留以渲占位) */
  recalled?: boolean;
  /** 阶段 8: 撤回时间, ISO; 当 recalled=true 时必返. UI 用它显示占位文案 */
  recalledAt?: string | null;
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
      recalled?: boolean;
      recalled_at?: string | null;
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
      // 阶段 8: 撤回态 — server listChatMessages 已过滤 deletedAt,
      //   recalled 这条可选字段透传到 client, 用于 MessageBubble 占位 + 关闭菜单.
      recalled: m.recalled ?? false,
      recalledAt: m.recalled_at ?? null,
    };
  });
  return { messages, nextCursor: r.next_cursor };
}

// ─────────── ChatDetail P0 (阶段 8) — 单条消息 / approval 接口 ───────────
// 对齐 gacode-web `src/lib/api.ts:988-1055` 同款, server 端
//   PATCH  /api/v1/yinian/messages/:id/recall
//   DELETE /api/v1/yinian/messages/:id
//   POST   /api/v1/yinian/sessions/:id/approvals/:pendingId/decision
// 鉴权走普通 Bearer (跟 fetch 拦截器一致), 客户端再调 invalidateQueries
// 兜底刷新 [history, chatId] 让服务端回流.

// ===== 撤回 (recall) =====
// server 端 unified-api/src/modules/yinian/yinian.service.js:840
//   RECALL_WINDOW_SEC = 120  (2 分钟, 客户端 UI 也卡这窗口, 超时按钮灰)
//   yinian.routes.js:508  PATCH /messages/:id/recall
//   重复调 = 幂等返当前状态. 失败 → Error 抛到 mutation onError.
export interface RecallMessageResult {
  id: string;
  recalled: boolean;
  recalled_at?: string | null;
}

export function recallMessage(id: string): Promise<RecallMessageResult> {
  return request<RecallMessageResult>(`/yinian/messages/${id}/recall`, {
    method: "PATCH",
  });
}

// ===== 删除 (soft delete) =====
// server 端 yinian.service.js:870 + yinian.routes.js:516
//   无窗口, deleted_at = now. 客户端 store 立即移除, invalidate 兜底.
export function deleteMessage(
  id: string,
): Promise<{ success: true; id: string }> {
  return request<{ success: true; id: string }>(`/yinian/messages/${id}`, {
    method: "DELETE",
  });
}

// ===== Tool approval 决策 =====
// server 端 yinian.chat.routes.js:662 POST /sessions/:id/approvals/:pendingId/decision
//   body.action ∈ 'deny' | 'once' | 'session' | 'always'
//   透传到 gaclaw /admin/approve-pending/:pendingId (alignment with Android
//   ApprovalBanner.kt). client 这里只是包装, 业务路由在 server.
export type ApprovalAction = "deny" | "once" | "session" | "always";

export interface ApprovalDecisionResult {
  ok: boolean;
  action: ApprovalAction;
  pendingId: string;
  ttlSec?: number;
  data?: unknown;
}

export function submitApprovalDecision(
  sessionId: string,
  pendingId: string,
  action: ApprovalAction,
): Promise<ApprovalDecisionResult> {
  return request<ApprovalDecisionResult>(
    `/yinian/sessions/${sessionId}/approvals/${pendingId}/decision`,
    {
      method: "POST",
      body: JSON.stringify({ action }),
    },
  );
}

// ===== Tool approval 旧路径 (兼容 Android 旧 client) =====
// yinian.chat.routes.js:556  POST /approvals  (body 带 sessionId/toolId/pendingId)
// 保留作为兼容入口: 新 banner 走 decision 路径, 旧 store 仍可能 hit 这条.
export function submitApprovalDecisionLegacy(input: {
  sessionId: string;
  toolId: string;
  pendingId?: string;
  tool?: string;
  action: ApprovalAction;
  ttlSec?: number;
}): Promise<{ ok: boolean; action: ApprovalAction; ttlSec?: number; pendingId?: string; data?: unknown }> {
  return request<{ ok: boolean; action: ApprovalAction; ttlSec?: number; pendingId?: string; data?: unknown }>(
    `/yinian/approvals`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
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

// =========================================================================
// Library 编辑 + Tag 列表 + 批量删除 (P0/P1, gacode-electron 0.7.2)
//
//   - PATCH /yinian/library/:id      server 已接 (部分更新 title/tags/content/url)
//   - GET   /yinian/library/tags     server 已接 (group by 聚合当前用户所有 memory tag)
//   - DELETE /yinian/library/:id    server 已接, 批量 = 客户端 fan-out (无新 endpoint),
//                                    跟 gacode-web `batchDeleteLibraryItems` 同一策略
// =========================================================================
export interface UpdateLibraryItemInput {
  title?: string;
  tags?: string[];
  url?: string;
  content?: string;
}

export function updateLibraryItem(
  id: string,
  patch: UpdateLibraryItemInput,
): Promise<LibraryItem> {
  return request<LibraryItem>(`/yinian/library/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export interface LibraryTag {
  name: string;
  count: number;
}

export async function listLibraryTags(): Promise<{ tags: LibraryTag[] }> {
  return request<{ tags: LibraryTag[] }>("/yinian/library/tags");
}

/**
 * 批量删除 — 客户端 fan-out (无新 endpoint).
 * 跟 gacode-web `api.ts:batchDeleteLibraryItems` 同款, 失败部分用 thrown Error
 * 聚合给 toast. 返回 { succeeded, failed }, 单一使用方用它来局部重试 or 提示.
 */
export async function batchDeleteLibraryItems(
  ids: string[],
): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
  const results = await Promise.allSettled(
    ids.map((id) => deleteLibraryItem(id).then(() => id)),
  );
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      succeeded.push(r.value);
    } else {
      const reason = r.reason;
      const error =
        reason instanceof Error ? reason.message : String(reason ?? "未知错误");
      failed.push({ id: ids[i], error });
    }
  });
  return { succeeded, failed };
}

// ─────────── Link summarize (阶段 7 — Browser AI 总结) ───────────
// 端点: POST /api/v1/yinian/links/summarize — unified-api
//       `src/modules/yinian/yinian.links.routes.js:154`. schema:
//   body: { url: string (required, max 2048), title?: string }
//   resp: { ok, data: { summary, url, title } }
// 跟 Android 端 `BrowserViewModel.summarizeLink()` 行为对齐.
export interface LinkSummaryResponse {
  summary: string;
  url: string;
  title: string;
}

export function summarizeLink(
  url: string,
  title?: string,
): Promise<LinkSummaryResponse> {
  return request<LinkSummaryResponse>("/yinian/links/summarize", {
    method: "POST",
    body: JSON.stringify({ url, title: title ?? "" }),
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

// =========================================================================
// 2026-10-19 v0.7.2 — Profile / Auth 扩展 (审计 §3.9 / §3.11 补齐)
//
// 注销账户: DELETE /auth/account (unified-api auth.routes.js:124-133 + auth.service.js:393)
//   - JWT 鉴权, userId 只从 req.user.sub 取 (路由层强制, body 不读 userId, 防越权)
//   - 物理删 user + 全部关联数据 (16 张表) + 抹磁盘残留 (uploads / sandbox / avatars)
//   - 幂等: 已删账户再调仍返 200, 不冒 404
//
// 改密: POST /auth/change-password (unified-api auth.routes.js:140-147 + auth.service.js:214-233)
//   - JWT 鉴权
//   - body: { newPasswordHash } — argon2id 编码格式 ($argon2id$v=19$...$...), minLength 32, maxLength 512
//   - service 层 defense-in-depth 校验 startsWith('$argon2id$')
//   - 服务端不做二次 hash, 端侧必须用 argon2 算好再发
//
// 登出全部: POST /auth/logout-all (unified-api auth.routes.js:117-122)
//   - JWT 鉴权, 撤销该用户的所有 refreshToken (不删 user, 后续可重新登录)
//   - 改密后调这个, 其他人持有的旧 refreshToken 立刻失效
//
// 端侧 argon2 选型:
//   - 选 hash-wasm (轻量 WASM, ~30KB minified 用于 argon2 本身)
//   - 不依赖 Node native module (Electron renderer 走 chromium, 不能 require('argon2'))
//   - 不动 electron/preload.ts (不让 IPC 多一跳)
// =========================================================================

/**
 * 端侧 argon2id 哈希 — 跟 unified-api auth.service.js:155 (forgot-password-tools.js)
 * 用的参数对齐: timeCost=3 / memoryCost=65536 / parallelism=1 / saltLength=16 /
 * hashLength=32. server 不卡这些参数 (只看 startsWith('$argon2id$') + 长度),
 * 所以参数只要合法即可, 但保持一致有助于后续若 server 加 verify-side 参数
 * 校验时不踩坑.
 *
 * 输出是 PHC-encoded 完整字符串 (`$argon2id$v=19$m=...,t=...,p=1$<salt-b64>$<hash-b64>`),
 * server 直接当 password_hash 写库. 用户下次登录时 `argon2.verify` 会从 hash
 * 字符串里抽参数 + salt, 不需要 server 知道端侧的具体 cost.
 */
export async function hashPasswordArgon2id(password: string): Promise<string> {
  if (!password || password.length < 1) {
    throw new Error("password must be non-empty");
  }
  // 动态 import — vite/esbuild 自动把 hash-wasm 切到 wasm chunk
  const { argon2id } = await import("hash-wasm");
  // 16 bytes random salt — 跟 server-side argon2 默认 saltLength 一致
  const saltBytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(saltBytes);
  } else {
    // fallback (SSR / 测试环境通常走不到这里, renderer 一定有 crypto)
    for (let i = 0; i < saltBytes.length; i++) {
      saltBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hash = await argon2id({
    password,
    salt: saltBytes,
    iterations: 3,
    parallelism: 1,
    memorySize: 65536, // KB — 跟 server `argon2.hash(password, {type: argon2.argon2id})` 默认 memoryCost=2^16
    hashLength: 32,
    outputType: "encoded", // 直接要 PHC-encoded 字符串
  });
  return hash;
}

/**
 * changePassword — 已登录用户改密.
 *
 * server contract (unified-api/auth.routes.js:140-147):
 *   POST /api/v1/auth/change-password
 *   body { newPasswordHash } — argon2id encoded
 *   requires JWT (Authorization: Bearer <accessToken>)
 *
 * 注意:
 *   - 服务端不接受 oldPassword (additionalProperties: false). 函数签名保留
 *     oldPassword 是为了 UI 层 client-side 一致性校验 (旧密码字段),
 *     实际 hash 后只发 newPasswordHash.
 *   - oldPassword 留空时不阻塞提交, server 不验旧密码 (这条是设计: 改密
 *     走 JWT 鉴权 + 用户已经在自己设备上登录, 再加 oldPassword 校验是
 *     UX 上冗余, server schema 已经隐式排除).
 */
export async function changePassword(
  _oldPassword: string,
  newPassword: string,
): Promise<{ ok: true }> {
  const newPasswordHash = await hashPasswordArgon2id(newPassword);
  return request<{ ok: true }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ newPasswordHash }),
  });
}

/**
 * logoutAll — 撤销当前用户所有 refreshToken (登出全部设备).
 *
 * server contract (unified-api/auth.routes.js:117-122):
 *   POST /api/v1/auth/logout-all
 *   requires JWT
 *   body: 不需要 (server 用 req.user.sub 拿 userId)
 *   resp: { ok: true, data: { message: 'all sessions revoked' } }
 *
 * 调用场景: 改密成功后, 让所有其他设备持有的 refreshToken 立刻失效,
 * 防止别人偷到旧密码后长期登着.
 */
export function logoutAll(): Promise<{ ok: true; message: string }> {
  return request<{ ok: true; message: string }>("/auth/logout-all", {
    method: "POST",
  });
}

/**
 * deleteAccount — 真注销 (GDPR 性质, 物理删除).
 *
 * server contract (unified-api/auth.routes.js:124-133):
 *   DELETE /api/v1/auth/account
 *   requires JWT
 *   body: 不需要 (userId 只从 req.user.sub 取, 防越权删号)
 *   幂等: 已删账户再调返 200 (不冒 404)
 *   resp: { ok: true, data: { ok, already_deleted, deleted, files } }
 *
 * 调用方负责 (Profile.tsx 的 DeleteAccountRow 接管):
 *   - 成功后清前端 queryClient + 调 auth.logout() 清内存 token + user
 *   - authStorage.clear() (走 IPC, 删 %APPDATA%/Gacode/refresh-token.json)
 *   - navigate('/login') 把用户踢回登录页
 */
export function deleteAccount(): Promise<{
  ok: boolean;
  already_deleted: boolean;
  deleted: Record<string, number>;
  files: { removed: number; failed: number; skipped: number };
}> {
  return request<{
    ok: boolean;
    already_deleted: boolean;
    deleted: Record<string, number>;
    files: { removed: number; failed: number; skipped: number };
  }>("/auth/account", { method: "DELETE" });
}