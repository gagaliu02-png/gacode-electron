# unified-api 端点 base 文档

> 生成日期: 2026-10-20
> 摸底基准: unified-api `b89c699f2b6bfc17c446f404332366852b9adbbd` @ `master`（本地 `D:\gaga\gaclaw-project\unified-api`）
> nginx 反代: **已完成**（服务器 `43.131.53.240`，`/etc/nginx/sites-enabled/gaga.sale`，mtime 2026-10-19 15:42）
> 用途: gacode-electron 开发时查表用，避免猜错端点
> 覆盖: **164 个已挂载 HTTP 端点** + 3 组未挂载死代码端点
>
> 本文所有路径/方法/schema 均来自源码实读，标注了 `文件:行号`。客户端"已接/未接"一栏
> 来自 grep `gacode-electron/src/lib/{api.ts,upload.ts,sse.ts,notifications-sse.ts}` 实读，非凭记忆。

---

## 0. 速查：公网 URL → 内部路由映射表

客户端打的是**公网 URL**，nginx 决定它落到 unified-api 的哪条内部路由。绝大多数是原样透传，**只有 2 个 upload 端点被重写了**。

| 公网 URL (client 打这个) | 内部路由 | 备注 |
|---|---|---|
| `/api/v1/auth/*` | 原样 → `auth.routes.js` / `qr-login.routes.js` / `profile.routes.js` | 透传 |
| `/api/v1/gacode/profile*` | 原样 → `gacode.profile.routes.js` | 透传 |
| `/api/v1/yinian/*` | 原样 → `yinian.routes.js` 等 8 个 yinian 路由文件 | 透传 |
| `/api/v1/notifications/*` | 原样 → `notification.routes.js` | 透传 |
| `/api/v1/yinternal/*` | 原样 → `kb-internal` / `deliverables-internal` / `wechat-internal` | ⚠️ 服务间端点，nginx 未做隔离，实际公网可达 |
| **`/api/v1/llm/upload`** | **→ `POST /api/v1/yinian/upload`** | **nginx `location =` 精确重写**。图片专用端点，返 URL 不入库 |
| **`/api/v1/llm/upload/chunk`** | **→ `POST /api/v1/yinian/documents/chunk`** | **nginx `location =` 精确重写**。大图分块 JSON |
| `/api/v1/yinian/sessions/*/chat/stream` | 原样（但走**独立的正则 location**） | `proxy_buffering off` + `read_timeout 3600s` + nginx 层强制 CORS |
| `/api/v1/app/version*` | 原样 → `app.version.routes.js` | 公开端点 |
| `/forgot-password*` | 原样 → `forgot-password.routes.js` | 匿名 |
| `/upload/apk` | 原样 → `upload.routes.js` | Bearer `INTERNAL_TOKEN` |
| `/yinianapi/*` | → `/api/v1/yinian/` | 老 Android 客户端入口，gacode-electron **不用** |
| `/weiduapi/*` | → `/api/v1/weidu/` | 围度君，不相关 |
| `/smoking/api/*` | → `/api/` | 戒烟打卡，不相关 |
| `/llmapi/*` | → `/api/v1/llm/` | ⚠️ unified-api 无 `/api/v1/llm/*` 路由 → 404 |
| `/v1/*` | → `/v1/` | ⚠️ **gawen 路由已在 server.js:164 注释掉** → 404 |
| `/apps/browser/proxy/*` | → `127.0.0.1:3001`（Next.js） | ⚠️ **不转 unified-api**，尽管 unified-api 注册了同名路由 |
| `/llm/uploads/**` | nginx 静态 `alias` + `secure_link` 验签 | **不经 unified-api**，见下 |

### 上传 URL 的访问（重要）

`POST /api/v1/yinian/upload` / `/documents/chunk` 返回的 `url` 形如
`https://www.gaga.sale/llm/uploads/{userId}/{ts}_{rand}.{ext}?exp=...&sig=...`

这条 URL **由 nginx 直接服务**，不经 unified-api：

| nginx location | 落到磁盘 | 验签 |
|---|---|---|
| `^~ /llm/uploads/deliverables/` | `/var/lib/gaclaw/release/users/` | 否（公开，agent 产物要能分享） |
| `^~ /llm/uploads/avatars/` | `/var/data/llm-uploads/avatars/` | 否 |
| `^~ /llm/uploads/beancellar-profiles/` | `/var/data/llm-uploads/beancellar-profiles/` | 否 |
| `^~ /llm/uploads/tts-models/` | `/var/data/llm-uploads/tts-models/` | 是 |
| `~ ^/llm/uploads/(app-*.apk\|version*.json)$` | `/var/data/...` | 否（OTA 产物，未登录要能查更新） |
| `/llm/uploads/`（兜底） | `/var/data/llm-uploads/` | **是** — 缺 `?exp=&sig=` 直接 403 |
| `^~ /release/users/` | `/var/lib/gaclaw/release/users/` | 否 |

⚠️ 客户端如果要**手动拼** `/llm/uploads/...` URL（而不是用 server 返回的 url），必须带
`exp` + `sig` 两个 query，否则 403。server 侧由 `src/utils/uploadSign.js` 生成。

### `client_max_body_size`

| 作用域 | 值 |
|---|---|
| `server {}` 全局默认 | **50m** |
| `/api/v1/`（含所有 yinian/auth/gacode/notifications） | **500m** |
| `= /api/v1/llm/upload` / `= /api/v1/llm/upload/chunk` | **500m** |
| `~ ^/api/v1/yinian/sessions/*/chat/stream$` | **500m** |
| `/yinianapi/` `/upload/` `/llmapi/` | **500m** |

unified-api 侧另有三道更严的闸门（**nginx 放行不代表 server 放行**）：
- `POST /yinian/upload` → 50MB，超了 413（`yinian.routes.js:571`）
- `POST /yinian/documents` → 10MB，超了 413（`yinian.routes.js:561`）
- `POST /yinian/documents/chunk` → 合并后 50MB，超了 413（`yinian.routes.js:648`）
- fastify 全局 `bodyLimit: 500MB`（`server.js:89`）、multipart `fileSize: 200MB`（`server.js:81`）

---

## 1. Auth 端点

统一响应形状：`{ ok: true, data: ... }` / `{ ok: false, error: { code, message } }`。

### POST /api/v1/auth/register
- 鉴权: 无
- body: `{ username: string(3-32), password: string(8-128), email?: string(email), displayName?: string(≤64), securityQuestion: string(1-100) 必填, securityAnswer: string(1-50) 必填 }`
- resp: `201 { ok, data: { accessToken, refreshToken, accessExpiresIn, refreshExpiresIn, user } }`
- 用途: 注册并直接下发 token 对
- **⚠️ 2026-10-19 起 `securityQuestion` + `securityAnswer` 是必填**（`auth.routes.js:8`）。

### POST /api/v1/auth/login
- 鉴权: 无
- body: `{ username: string(3-32), password: string(1-128) }`
- resp: `{ ok, data: { accessToken, refreshToken, accessExpiresIn (秒), refreshExpiresIn (秒), user: { id, username, email, displayName, createdAt } } }`
- 用途: 账号密码登录
- 备注: `refreshToken` **走 body 明文返回，不走 cookie**（`auth.service.js:149-155`）。旧 hash（bcrypt/base64）登录时透明升级到 argon2id。

### POST /api/v1/auth/refresh
- 鉴权: 无
- body: `{ refreshToken: string(≥10) }`
- resp: `{ ok, data: { accessToken, refreshToken, accessExpiresIn, refreshExpiresIn, user } }`
- 用途: 换新 token 对
- 备注: **rotation 语义** — 旧 refreshToken 立刻 revoked（`auth.service.js:171-174`），客户端必须保存响应里的新 `refreshToken`。

### POST /api/v1/auth/logout
- 鉴权: 无
- body: `{ refreshToken?: string }`（可选，不传则空操作）
- resp: `{ ok, data: { message: 'logged out' } }`
- 用途: 吊销单个 refresh token

### GET /api/v1/auth/me
- 鉴权: `requireAuth`（Bearer JWT）
- body/query: 无
- resp: `{ ok, data: { id, username, email, displayName, points, createdAt } }`
- 用途: 取当前用户资料

### POST /api/v1/auth/logout-all
- 鉴权: `requireAuth`
- body: 无
- resp: `{ ok, data: { message: 'all sessions revoked' } }`
- 用途: 吊销当前用户全部 refresh token（换设备/安全场景）

### DELETE /api/v1/auth/account
- 鉴权: `requireAuth`
- body: 无（`userId` **只从 `req.user.sub` 取**，不读 body/query，防任意删号）
- resp: `{ ok, data: { already_deleted, deleted: Record<string, number>, files: { removed, failed, skipped } } }`
- 用途: 真注销账号（物理删账号 + 关联数据 + 磁盘残留），幂等

### POST /api/v1/auth/change-password
- 鉴权: `requireAuth`
- body: `{ newPasswordHash: string(32-512) }` — **argon2id hash，不是明文**，`additionalProperties: false`
- resp: `{ ok, data: {...} }`（service 层结果）
- 用途: 已登录改密。客户端须本地 argon2 算 hash 再传。

### POST /api/v1/auth/qr-login-issue
- 鉴权: **无**（匿名）
- body: 无
- resp: `{ ok, data: { token, qrUrl: 'gacode://qr-login?token=…', expiresIn, pollIntervalMs: 2000 } }`
- 用途: Web/PC 未登录时申请扫码登录 token（2min TTL）

### POST /api/v1/auth/qr-login-verify
- 鉴权: `requireAuth`
- body: `{ token: string(8-64) }`，`additionalProperties: false`
- resp: `{ ok, data: { message } }`
- 用途: 已登录 App 扫码后确认授权

### GET /api/v1/auth/qr-login-status?token=
- 鉴权: **无**
- query: `token`（必填，8-64）
- resp: `200 { ok, data: { status: 'pending' } }` 或 `200 { ok, data: { status: 'authorized', accessToken, refreshToken, user } }` 或 `404 { ok:false, error:{ code:'expired_or_invalid' } }`
- 用途: Web/PC 轮询扫码结果。**authorized 是一次性的**（消费后即删，再查 404）

### GET /api/v1/auth/qr-login-stats
- 鉴权: 无
- resp: `{ ok, data: <服务内部统计> }`
- 用途: 调试/健康检查

### PUT /api/v1/auth/profile
- 鉴权: `requireAuth`
- body: `{ displayName?: string|null(≤64), gender?: 'male'|'female'|'other'|'unspecified', bio?: string|null(≤500) }`，**至少传一个**（`anyOf`）
- resp: `{ ok, data: { id, username, displayName, gender, bio, avatar, email } }`
- 用途: 更新资料（**gacode-web 端**入口）

### GET /api/v1/auth/profile
- 鉴权: `requireAuth`
- resp: `{ ok, data: { id, username, displayName, gender, bio, avatar, email, createdAt } }`
- 用途: 读资料（gacode-web 入口）

### POST /api/v1/auth/profile/avatar
- 鉴权: `requireAuth`
- body: multipart 单文件（字段名 `avatar` 或 `file`），≤5MB，mime ∈ `image/jpeg|png|webp|gif`
- resp: `{ ok, data: { avatarUrl: '/llm/uploads/avatars/{userId}.jpg', size } }`
- 用途: 上传头像（**gacode-web 入口**，强制存 .jpg）

### GET /forgot-password
- 鉴权: 无
- resp: `text/html`（内联 CSS+JS 单页）
- 用途: 忘记密码 Web 入口

### POST /forgot-password/init
- 鉴权: 无
- body: `{ sessionId?: string }`
- resp: `{ ok, data: { sessionId, greeting, state } }`
- 用途: 创建/复用忘记密码会话

### POST /forgot-password/chat
- 鉴权: 无
- body: `{ sessionId, content }`
- resp: `{ ok, data: { ok, state, reply, finishReason, bypass, newPassword, attemptsLeft, locked, lockedUntil } }`
- 用途: 忘记密码业务流（input filter → gawen LLM → FSM fallback）

### POST /forgot-password/end
- 鉴权: 无
- body: `{ sessionId }`
- resp: `{ ok, data: { ok: true } }`
- 用途: 关页清理内存会话

---

## 2. Chat / Session 端点

挂载 prefix 全部是 `/api/v1/yinian`（`server.js:167/175/177`）。模块文件分裂成 3 个：
`yinian.routes.js`（主体）/ `yinian.chat.routes.js`（流式+审批）/ `sessions-batch.routes.js`。

### GET /api/v1/yinian/health
- 鉴权: 无
- resp: `{ ok, data: { status:'ok', service:'yinian', version:'0.1.0' } }`
- 用途: yinian 模块健康检查

### GET /api/v1/yinian/sessions
- 鉴权: `requireAuth`
- query: `limit?: int(1-100), cursor?: string` — **只有这两个**
- resp: `{ ok, data: { items: Session[], next_cursor: string|null } }`
- 用途: 拉会话列表
- ❗**不接 `keyword`**（`yinian.routes.js:166-174`）。传了会被静默丢弃（见 §12）。

### POST /api/v1/yinian/sessions
- 鉴权: `requireAuth`
- body: `{ title?: string(1-128) }`
- resp: `{ ok, data: Session }`
- 用途: 新建会话

### GET /api/v1/yinian/sessions/:id
- 鉴权: `requireAuth`
- resp: `{ ok, data: Session }`
- 用途: 单个会话详情

### PATCH /api/v1/yinian/sessions/:id
- 鉴权: `requireAuth`
- body: `{ title: string(1-128) }` 必填
- resp: `{ ok, data: Session }`
- 用途: 重命名会话

### DELETE /api/v1/yinian/sessions/:id
- 鉴权: `requireAuth`
- resp: `{ ok, data: ... }`
- 用途: 删除会话（CASCADE 清消息）

### PATCH /api/v1/yinian/sessions/:id/pin
- 鉴权: `requireAuth`
- body: `{ pinned: boolean }` 必填
- resp: `{ ok, data: Session }`
- 用途: 收藏/取消收藏

### GET /api/v1/yinian/sessions/pinned
- 鉴权: `requireAuth`
- resp: `{ ok, data: { sessions: Session[] } }`（硬编码 limit 50）
- 用途: 收藏对话列表
- 备注: 注册在 `/sessions/:id` 之后但 Fastify 静态段优先，能正常命中。

### POST /api/v1/yinian/sessions/batch-delete
- 鉴权: `requireAuth`
- body: `{ ids: string[] }`（1-50 个）
- resp: `{ ok, data: { requestedCount, deletedCount } }`
- 用途: 多选批量删会话
- 备注: 任一 id 不属于当前用户 → **整批 404**（不做部分成功）

### POST /api/v1/yinian/sessions/:id/auto-title
- 鉴权: `requireAuth`
- body: 无
- resp: `{ ok, data: Session }`
- 用途: 触发 LLM 自动起标题（已有非默认标题则 skip）

### GET /api/v1/yinian/sessions/:id/export?format=md|json
- 鉴权: `requireAuth`
- query: `format?: 'md'|'json'`（默认 `md`）
- resp: **文件流**（`Content-Disposition: attachment`），不是 JSON envelope
- 用途: 导出单个会话为 markdown/json

### POST /api/v1/yinian/sessions/:id/messages
- 鉴权: `requireAuth`
- body (`appendMessageSchema`): `{ role: 'user'|'assistant'|'system' 必填, content?: string(≤32000), citation_ids?: string[≤20], tokens_in?: int, tokens_out?: int, model?: string(≤64), image_urls?: string[≤9], phases_json?: string|null, pending_approval_json?: string|null }`
- resp: `{ ok, data: Message }`
- 用途: 往会话追加一条消息（手动落库用，SSE 路径一般不用）
- ❗**不接 `knowledge_refs`**（schema 里没这个字段）

### GET /api/v1/yinian/sessions/:id/messages
- 鉴权: `requireAuth`
- query: `limit?: int(1-200), cursor?: string`
- resp: `{ ok, data: { items: Message[], next_cursor } }`
- 用途: 拉历史消息（已自动过滤 `deletedAt != null`）

### PATCH /api/v1/yinian/messages/:id/recall
- 鉴权: `requireAuth`
- body: 无
- resp: `{ ok, data: Message }`
- 用途: 撤回消息（10s 窗口）

### DELETE /api/v1/yinian/messages/:id
- 鉴权: `requireAuth`
- body: 无
- resp: `{ ok, data: Message }`
- 用途: 软删消息（无时间窗口）

### POST /api/v1/yinian/sessions/:id/chat/stream
- 鉴权: `requireAuth`
- body (`streamSchema`): `{ message?: string(0-4000), image_urls?: string[≤9], attached_file_ids?: string[≤9], top_k?: int(1-20), threshold?: number(0-1), model?: string(≤64), channel?: string(≤32), knowledge_refs?: string[≤64] }`
  - **约束**: `anyOf` 要求 `message` / `image_urls` / `attached_file_ids` 至少一个非空
- resp: `text/event-stream`（SSE），data 行 JSON：`{content}` / `{done}` / `{error}` / `{citations}` / `{route}` / 带 `event:` 的 `approval_request` 等
- header: 支持 `Last-Event-ID` 断流续传
- 用途: 流式对话主入口
- 备注: `model` 只认 `gawen`，传别的也强制走 gawen（`yinian.chat.routes.js:753`）

### DELETE /api/v1/yinian/chat/cancel/:sessionId
- 鉴权: **⚠️ 无鉴权**（无 `preHandler: requireAuth`）
- query: `intent?` / `origin?`（`stop|user_stop|cancel` = 真取消；`ack|done|teardown|…` = 收尾不打取消标记）
- resp: `{ ok, data: ... }`
- 用途: 中断正在跑的流
- ⚠️ **安全缺口**：任何人都能取消任意 sessionId 的流。建议 server team 补 `requireAuth`。

### POST /api/v1/yinian/approvals
- 鉴权: `requireAuth`
- body: `{ sessionId, toolId 必填, pendingId?, tool?, action: 'once'|'session'|'always'|'deny' 必填, ttlSec?: int }`
- resp: `{ ok, action, pendingId, toolKey?, ttlSec?, data }`（**没有 `data` envelope**，是平铺的）
- 用途: Android 审批流（老端点，body 带 sessionId）

### POST /api/v1/yinian/sessions/:id/approvals/:pendingId/decision
- 鉴权: `requireAuth`
- body: `{ action: 'once'|'session'|'always'|'deny' }` 必填
- resp: `{ ok, action, pendingId, ttlSec?, data }`（同样平铺，无 envelope）
- 用途: Web/PC 审批流（新端点，sessionId 走 path）

### POST /api/v1/yinian/memories/search
- 鉴权: `requireAuth`
- body: `{ query_embedding?: number[1024], q?: string(1-200), tags?: string[≤20], modality?: 'text'|'image'|'file', top_k?: int(1-20), threshold?: number(0-1), limit?: int(1-100), cursor?: string }`
- 用途: RAG 检索统一入口
- 备注: schema **不强制**至少传一个，但 service 入口会检查，缺则 400

### POST /api/v1/yinian/cache/clear
- 鉴权: `requireAuth`
- body: 无
- resp: `{ ok, data: { cleared_bytes, cleared_count } }`
- 用途: 清 `/tmp/gaclaw-*` 临时目录

---

## 3. Upload / Documents 端点

### POST /api/v1/yinian/upload ⭐ 图片专用
- 鉴权: `requireAuth`
- body: multipart 单文件，≤50MB，**不限类型**（未知类型兜 `.bin`）
- 行为: `image/*` 自动压缩（1600px / q80）；落 `/var/data/llm-uploads/{userId}/{ts}_{rand}.{ext}`；沙箱双写；**不建 KB atom、不触发 OCR**
- resp: `{ ok, data: { filename, url, sha256, size, mimeType } }`
- 用途: **图片/录音拿 URL**
- 备注: 公网还有别名 `/api/v1/llm/upload`（nginx 重写到本端点），两个路径等价。

### POST /api/v1/yinian/documents
- 鉴权: `requireAuth`
- body: multipart 单文件，≤10MB
- **白名单**: `application/pdf` / `…wordprocessingml.document`(docx) / `application/msword`(doc) / `…spreadsheetml.sheet`(xlsx) / `application/vnd.ms-excel`(xls) / `…presentationml.presentation`(pptx，2026-10-17 加) / `text/plain`(txt)
- **magic bytes 二次校验**（`yinian.routes.js:842-890`）：推断出的类型不在白名单 → 400；magic 与声明 mime 不一致 → 400
- resp: `{ ok, data: { file_id, url, original_name, mime_type, size_bytes, ... } }`
- 用途: 文档入库 + OCR
- ❗**图片 `.png` 会被 400 拒**（`Unsupported file type inferred from content: .png`）—— 这就是 upload.ts 旧 bug 的根因

### POST /api/v1/yinian/documents/chunk
- 鉴权: `requireAuth`
- body: `{ uploadId, chunkIndex, totalChunks, data(base64), mimeType, originalName }` 全必填
- resp: 中间块 `{ ok, data: { received, uploadId, chunkIndex, totalChunks, size, done:false } }`；最后一块 `{ …, done:true, filename, url, sha256, mimeType, original_name }`
- 用途: 大图分块上传（>2MB 拍照图）
- 备注: chunk 必须**连续递增**（`expectedNextChunkIndex`），乱序 400；合并后 >50MB → 413；TTL 10 分钟
- 公网别名: `/api/v1/llm/upload/chunk`

### GET /api/v1/yinian/documents
- 鉴权: `requireAuth`
- query: 无 schema 约束（透传给 `listDocuments`）
- resp: `{ ok, data: { items: [...], next_cursor } }`
- 用途: 文档列表

### GET /api/v1/yinian/documents/:file_id
- 鉴权: `requireAuth`
- resp: `{ ok, data: Document }`
- 用途: 文档元信息

### GET /api/v1/yinian/documents/:file_id/text
- 鉴权: `requireAuth`
- resp: `{ ok, data: { text, ... } }`
- 用途: 取文档提取后的纯文本

### GET /api/v1/yinian/documents/:file_id/raw
- 鉴权: `requireAuth`
- resp: **文件流**（`Content-Disposition: inline`，RFC 5987 中文名编码）
- 用途: 下载/预览原始文件

### DELETE /api/v1/yinian/documents/:file_id
- 鉴权: `requireAuth`
- resp: `{ ok, data: ... }`
- 用途: 删除文档

### POST /api/v1/yinian/extract-text-from-url
- 鉴权: `requireAuth`
- body: `{ url: string(必填), mime: string(必填), filename?: string }`
- **SSRF 白名单**: 必须 `https://` + hostname ∈ `{gaga.sale, www.gaga.sale}` + path 前缀 `/llm/uploads/`
- resp: `{ ok, data: { url, filename, mime_type, text, truncated, extract_error, extract_ms } }`
- 用途: 按 URL 拉文档转纯文本（不落库）

### POST /api/v1/yinian/transcribe
- 鉴权: `requireAuth`
- body: `{ audioUrl: string(必填) }`
- resp: `{ ok, data: <上游 ASR 结果> }`
- 用途: 语音转文字（用户侧，成功后立即删本地 audio 副本）

### POST /api/v1/yinian/links/summarize
- 鉴权: `requireAuth`
- body: `{ url: string(1-2048) 必填, title?: string(≤512) }`
- resp: `{ ok, data: { title, summary, url, ... } }`
- 用途: 抓网页 + AI 摘要（≤150 字）

### POST /api/v1/yinian/logs
- 鉴权: `requireAuth`
- body: `{ content: string(≤10MB) 必填, kind?: 'info'|'crash' }`
- resp: `{ ok, data: { file, size } }`
- 用途: 客户端崩溃日志上报（落盘不入库）

---

## 4. Library 端点

prefix `/api/v1/yinian`，文件 `library.routes.js`。

### GET /api/v1/yinian/library
- 鉴权: `requireAuth`
- query: `type?: 'text'|'image'|'file'|'audio'|'video', tag?: string(1-32), page?: int(1-1000, 默认1), pageSize?: int(1-100, 默认20), withContent?: boolean(默认false)`
- resp: `{ ok, data: { items: LibraryItem[], page, pageSize, hasMore, total } }`
  - `LibraryItem = { id, type: 'image'|'doc'|'link', title, url?, tags[], createdAt, content? }`
- 用途: 知识库列表（按类型/标签分页）
- ❗**不接 `keyword`**（客户端 `listLibrary` 一直在传，被静默丢弃）
- 备注: `tag` 过滤是 over-fetch + JS 过滤，`total` 在 tag 模式下恒为 `null`，分页不准

### GET /api/v1/yinian/library/tags
- 鉴权: `requireAuth`
- resp: `{ ok, data: { tags: [{ tag: string, count: number }] } }`（上限 200）
- 用途: 聚合用户所有 tag

### GET /api/v1/yinian/library/:id
- 鉴权: `requireAuth`
- query: `withContent?: boolean`
- resp: `{ ok, data: LibraryItem }`
- 用途: 条目详情
- 备注: id 非数字 → 400；非本人 → 404（不区分"不存在"与"越权"）

### POST /api/v1/yinian/library
- 鉴权: `requireAuth`
- body: `{ type: 'image'|'doc'|'link' 必填, title: string(1-200) 必填, url?: string(≤2048), tags?: string[≤20] }`，`additionalProperties: false`
- resp: `201 { ok, data: LibraryItem }`
- 用途: 新建知识库条目（web 采集）
- 备注: `type` → DB modality 映射 `image→image / doc→file / link→text`；`content` 缺失时用 `title` 兜底

### PATCH /api/v1/yinian/library/:id
- 鉴权: `requireAuth`
- body: `{ title?, tags?, content? }` 至少一个，`additionalProperties: false`
- resp: `{ ok, data: LibraryItem }`
- 用途: 部分更新（改 content 会重置 `status=pending` 重新 embedding）

### DELETE /api/v1/yinian/library/:id
- 鉴权: `requireAuth`
- resp: `{ ok, data: { success: true } }`
- 用途: **硬删**一条（不是软删）

### POST /api/v1/yinian/memories/batch-delete
- 鉴权: `requireAuth`
- body: `{ ids: string[] }`（1-100）
- resp: `{ ok, data: { deleted, ... } }`
- 用途: Android 侧 Library 多选删

---

## 5. Deliverables 端点

prefix `/api/v1/yinian`，文件 `deliverables.routes.js`。

### GET /api/v1/yinian/deliverables
- 鉴权: `requireAuth`
- query: `type?: 'image'|'web'|'document', page?: int(1-1000, 默认1), pageSize?: int(1-100, 默认30), sessionId?: string(1-64), keyword?: string(1-100)`
- resp: `{ ok, data: { items: Deliverable[], total, page, pageSize, hasMore } }`
  - `Deliverable = { id, sessionId, messageId, deliverableType, title, url, thumbnailUrl, mimeType, sizeBytes, prompt, origin, createdAt }`
- 用途: 交付中心列表
- ❗**不接 `tag`**，**不接 `origin`**（客户端 Deliveries.tsx 在传 `origin`），**不接 `status`**，**不接 `cursor`**
- 备注: server 端恒定过滤 `origin != 'user_uploaded'` 且 `message_id` 不以 `aborted-` 开头

### GET /api/v1/yinian/deliverables/:id
- 鉴权: `requireAuth`
- resp: `{ ok, data: DeliverableDetail }`（多 `description` / `toolName` / `metadata` / `updatedAt`）
- 用途: 交付详情

### DELETE /api/v1/yinian/deliverables/:id
- 鉴权: `requireAuth`
- resp: `{ ok, data: { id, deletedAt } }`
- 用途: 软删 DB + **物理删磁盘文件**（从 url 反解路径，支持 `llm/uploads/deliverables/` 与 `/release/users/` 两种形态）

---

## 6. Profile / Auth 扩展

### GET /api/v1/gacode/profile
- 鉴权: `requireAuth`
- resp: `{ ok, data: { id, username, displayName, gender, bio, avatar, email, createdAt } }`
- 用途: **App 端**读资料。用户不存在时返空串（不 404）

### PUT /api/v1/gacode/profile
- 鉴权: `requireAuth`
- body: `{ displayName?: string|null(≤50), gender?: enum, bio?: string|null(≤200) }` 至少一个
- resp: `{ ok, data: { id, username, displayName, gender, bio, avatar, email } }`
- 用途: **App 端**改资料
- 备注: 与 `/api/v1/auth/profile` 同一份功能，**长度上限不同**（App bio ≤200，web ≤500；App displayName ≤50，web ≤64）

### POST /api/v1/gacode/profile/avatar
- 鉴权: `requireAuth`
- body: multipart 单文件，≤5MB，mime ∈ `image/jpeg|png|webp`（**不含 gif**，比 web 端少一个）
- resp: `{ ok, data: { avatarUrl: '/llm/uploads/avatars/{userId}.{ext}', size } }`
- 用途: **App 端**传头像，按真实 mime 存不同扩展名

### GET /api/v1/profile  /  PUT /api/v1/profile  /  POST /api/v1/profile/avatar
- prefix `/api/v1/profile`，文件 `beancellar.profile.routes.js`
- 鉴权: 全部 `requireAuth`
- 用途: BeanCellar 用户资料。**与上面 `/api/v1/gacode/profile` 是两套并存**（共用同一 `users` 表列）。

---

## 7. Notifications 端点

prefix `/api/v1/notifications`，文件 `notification.routes.js`。

### GET /api/v1/notifications/stream
- 鉴权: `requireAuth`（`onRequest`）
- resp: `text/event-stream`
  - 首帧 `{ type: 'connected' }`
  - 推送帧 `id: <eventId>` + `{ type: 'notification', notification: {...} }`
  - 每 25s 一行 `: heartbeat`（**不带 id**，不进续传 buffer）
- header: 支持 `Last-Event-ID` 续传（内存 ring buffer 200 条/用户，重启清零）
- 用途: 通知实时推送
- 备注: **每用户只保留一个连接**，新连接会踢掉旧的

### GET /api/v1/notifications
- 鉴权: `requireAuth`
- query: `unread?: 'true'`（**只有这个生效**）
- resp: `{ ok, data: { notifications: [...], unreadCount } }` — **硬编码 `take: 50`，无分页**
- 用途: App 拉通知列表
- ❗**不接 `category`**、**不接 `cursor`**；响应里**没有 `nextCursor`**

### PATCH /api/v1/notifications/:id/read
- 鉴权: `requireAuth`
- resp: `{ ok: true }`（**无 data 字段**）
- 用途: 单条标已读

### PATCH /api/v1/notifications/read-all
- 鉴权: `requireAuth`
- resp: `{ ok: true }`
- 用途: 全部标已读

### POST /api/v1/notifications
- 鉴权: **⚠️ 无鉴权**（注释明写"任意系统/AI 调此接口推送通知，无需认证"）
- body: `{ userId: 正整数 必填, title: string(1-200) 必填, body?: string(≤1000), actionType?: 'url'|'deep_link'|'none', actionValue?: string }`
- resp: `201 { ok, data: notification }`
- 用途: 外部系统/AI 推送通知
- ⚠️ **安全缺口**：无鉴权 + 可指定任意 `userId`，公网可达。建议 server team 加内部 token。

### ❌ /api/v1/agent-push-preferences
- **server 端不存在**。客户端目前用 localStorage 存通知设置（`api.ts:667-673`）。

---

## 8. 其他端点

### 版本检查（OTA）
- `GET /api/v1/app/version?app=yinian|beancellar` — 鉴权无；resp `{ ok, data: { latestVersion, latestVersionCode, minSupportedVersionCode, downloadUrl, changelog, forceUpdate, fileSize, sha256, publishedAt } }`
- `GET /api/v1/app/version-beta` — 鉴权无；resp 同上 **+ `channel`**；读 `data/version-beta.json`

### 健康检查
- `GET /health` → `{ ok, data: { status, uptime } }`
- `GET /api/v1/health` → `{ ok, data: { status, service, version, uptime } }`
- `GET /api/v1/health/db` → `{ ok, data: <PG 版本/用户> }`，失败 503
- ⚠️ **没有 `/api/v1/healthz`**（见 §11）

### APK OTA 上传（prefix `/upload`，Bearer `INTERNAL_TOKEN`）
- `POST /upload/apk` — multipart，`filename` 可走 query/form/文件名；resp `{ ok, data: { filename, size, sha256, url } }`
- `PUT /upload/apk` — raw binary（`application/octet-stream`），≤300MB
- `GET /upload/sha256/:filename` — `{ ok, data: { filename, size, sha256 } }`

### 服务间内部端点（`Authorization: Bearer <GACLAW_KB_INTERNAL_TOKEN>`）
> ⚠️ nginx 的 `/api/v1/` location 会把这些透传到公网，**与文件头"不得暴露到公网"的注释相悖**。

- `POST /api/v1/yinternal/kb/write` — body `{ userId 必填, content 必填(≤20000), title?, type?, url?, tags? }` → `{ ok, data: { id, title, type, status } }`
- `POST /api/v1/yinternal/kb/read` — body `{ id }`（**禁止传 userId**，`userId` 只从 `X-User-Id` 头取）→ `{ ok, data: atom }`
- `POST /api/v1/yinternal/kb/update` — body `{ id 必填, content?, metadata?, modality? }`（至少一个）
- `POST /api/v1/yinternal/kb/delete` — body `{ id }` → `{ ok, data: { id, deleted: true } }`
- `POST /api/v1/yinternal/kb/search` — body `{ query 必填(≤500), top_k?, threshold? }`（**不收 query_embedding**，向量服务端生成）
- `POST /api/v1/yinternal/deliverables/delete` — body `{ userId, ids[] }`（≤50）→ 逐条返回
- `POST /api/v1/yinternal/wechat/image-cache` — 微信 IM 附件中转
- `POST /api/v1/im-bindings/issue` — **requireAuth**，App 申请 6 位配对码
- `POST /api/v1/im-bindings/{lookup,upsert,delete,find}` — Bearer `GACLAW_KB_INTERNAL_TOKEN`

### 内部代理（`X-Internal-Token` header，对比 `INTERNAL_TOKEN`）
- `POST /api/v1/yinian/internal/embed` — body `{ texts: string[] }` → `{ ok, data: { provider, dim, vectors } }`
- `POST /api/v1/yinian/internal/transcribe` — body `{ audioUrl }`
- ❗ `POST /api/v1/yinian/internal/search` **已于 2026-10-15 删除**（能力被 `yinternal/kb/search` 接管）

### Hermes 桥（prefix `/api/v1/hermes`，`onRequest: authOrInternal` = JWT 或内部 token 二选一）
- `POST /send` body `{ message }` / `GET /targets` / `GET /sessions?limit=` / `GET /inbox?chat=&timeout=` / `GET /health`
- 备注: 响应是 `{ ok, list: string }` 形状，**不走统一 envelope**

### 远程协助（prefix `/api/v1/remote`）
- `POST /pairing-code`（requireAuth）/ `GET /pairing-code/:code`（requireAuth）/ `GET /stats`（**无鉴权**）/ `WS /ws`

### 密保卡（prefix `/api/v1/security-card`，全部 `requireAuth`）
- `GET /` / `POST /`（生成/重置，明文仅本次可见）/ `POST /challenge` / `POST /verify` / `DELETE /`

### BeanCellar 同步（prefix `/api/v1/sync`，requireAuth）
- `GET /pull?since=` / `POST /push`

### Webhook（prefix `/api/v1/webhook`，**无鉴权**）
- `POST /api/v1/webhook/yinian/chat` — Gawen 回调，会查 `isSessionCancelled` 决定是否落库

### Proxy（无 prefix 注册，无鉴权）
- `GET /api/v1/proxy?url=` / `GET /apps/browser/proxy/*`
- ⚠️ nginx 把 `/apps/browser/proxy/` 转到 `3001`（Next.js），**这条 unified-api 路由公网不可达**

### Piggy（prefix `/api/v1/piggy`，无鉴权）
- `GET /`（HTML 页）/ `POST /click`

### Smoking（prefix `/api/v1/smoking`，27 个）/ Weidu（prefix `/api/v1/weidu`，14 个）
- 与 gacode-electron 无关，仅记录存在。

---

## 9. gacode-electron 已接 vs 未接 对照表

> 客户端来源：`src/lib/api.ts` / `upload.ts` / `sse.ts` / `notifications-sse.ts` 实读。
> "通"= 路径+方法+schema 全对得上。

| 功能 | 端点 | server 有? | client 接了? | 状态 |
|---|---|---|---|---|
| 登录 | `POST /auth/login` | ✅ | ✅ | 通 |
| **注册** | `POST /auth/register` | ✅ | ✅ | ❌ **400 — 见 §11-A** |
| 刷新 token | `POST /auth/refresh` | ✅ | ✅ | 通 |
| 登出 | `POST /auth/logout` | ✅ | ✅ | 通 |
| 当前用户 | `GET /auth/me` | ✅ | ✅ | 通 |
| 改密 | `POST /auth/change-password` | ✅ | ✅ | 通 |
| 全端登出 | `POST /auth/logout-all` | ✅ | ✅ | 通 |
| 注销账号 | `DELETE /auth/account` | ✅ | ✅ | 通 |
| 扫码登录申请 | `POST /auth/qr-login-issue` | ✅ | ✅ | 通 |
| 扫码登录轮询 | `GET /auth/qr-login-status` | ✅ | ⚠️ wrapper 在，UI 未接 | 部分 |
| 扫码确认 | `POST /auth/qr-login-verify` | ✅ | ❌ | 未接 |
| 会话列表 | `GET /yinian/sessions` | ✅ | ✅ | 通 |
| 会话搜索 | `GET /yinian/sessions?keyword=` | ⚠️ schema 不接 | ✅ 传了 | ❌ 静默丢弃 → 客户端本地 filter |
| 新建会话 | `POST /yinian/sessions` | ✅ | ✅ | 通 |
| 重命名 | `PATCH /yinian/sessions/:id` | ✅ | ✅ | 通 |
| 删除会话 | `DELETE /yinian/sessions/:id` | ✅ | ✅ | 通 |
| 批量删会话 | `POST /yinian/sessions/batch-delete` | ✅ | ✅ | 通 |
| 收藏会话 | `PATCH /yinian/sessions/:id/pin` | ✅ | ✅ | 通 |
| 自动标题 | `POST /yinian/sessions/:id/auto-title` | ✅ | ✅ | 通 |
| 历史消息 | `GET /yinian/sessions/:id/messages` | ✅ | ✅ | 通 |
| 流式对话 | `POST /yinian/sessions/:id/chat/stream` | ✅ | ✅ | 通 |
| 中断流 | `DELETE /yinian/chat/cancel/:sessionId` | ✅ | ✅ | 通（server 侧无鉴权） |
| 撤回消息 | `PATCH /yinian/messages/:id/recall` | ✅ | ✅ | 通 |
| 删消息 | `DELETE /yinian/messages/:id` | ✅ | ✅ | 通 |
| 审批（老） | `POST /yinian/approvals` | ✅ | ✅ | 通（resp 无 envelope） |
| 审批（新） | `POST /yinian/sessions/:id/approvals/:pendingId/decision` | ✅ | ✅ | 通 |
| **图片上传** | `POST /yinian/upload` | ✅ | ✅ | **通（hotfix 0.7.5 已分流）** |
| 文档上传 | `POST /yinian/documents` | ✅ | ✅ | 通 |
| 大图分块 | `POST /yinian/documents/chunk` | ✅ | ❌ | 未接（可走 `/llm/upload/chunk` 别名） |
| 语音转写 | `POST /yinian/transcribe` | ✅ | ❌ | 未接 |
| 网页摘要 | `POST /yinian/links/summarize` | ✅ | ✅ | 通 |
| Library 列表 | `GET /yinian/library` | ✅ | ✅ | ⚠️ `keyword` 静默丢弃 |
| Library 搜索 | `GET /yinian/library?keyword=` | ⚠️ schema 不接 | ✅ 传了 | ❌ 静默丢弃 |
| Library 标签 | `GET /yinian/library/tags` | ✅ | ✅ | 通 |
| Library 新建 | `POST /yinian/library` | ✅ | ✅ | 通 |
| Library 编辑 | `PATCH /yinian/library/:id` | ✅ | ✅ | 通 |
| Library 删除 | `DELETE /yinian/library/:id` | ✅ | ✅ | 通 |
| 交付列表 | `GET /yinian/deliverables` | ✅ | ✅ | ⚠️ `origin` 静默丢弃 |
| 交付详情 | `GET /yinian/deliverables/:id` | ✅ | ✅ | 通 |
| 交付删除 | `DELETE /yinian/deliverables/:id` | ✅ | ✅ | 通 |
| 通知列表 | `GET /notifications` | ✅ | ✅ | ⚠️ `category`/`cursor` 丢弃，无分页 |
| 通知 SSE | `GET /notifications/stream` | ✅ | ✅ | 通 |
| 通知标已读 | `PATCH /notifications/:id/read` | ✅ | ✅ | 通 |
| 通知全已读 | `PATCH /notifications/read-all` | ✅ | ✅ | 通 |
| 资料读 | `GET /gacode/profile` | ✅ | ✅ | 通 |
| 资料改 | `PUT /gacode/profile` | ✅ | ✅ | 通 |
| 头像 | `POST /gacode/profile/avatar` | ✅ | ✅ | 通 |

### §9 中发现的新问题

| # | 问题 | 证据 | 影响 |
|---|---|---|---|
| **A** | **注册必 400** — server `registerSchema` 的 `required` 含 `securityQuestion`/`securityAnswer`（`auth.routes.js:8`，2026-10-19 加），客户端 `RegisterInput`（`api.ts:230-235`）只有 4 个字段，全仓 0 处 `securityQuestion` | `auth.routes.js:8` vs `api.ts:230` | **注册流程当前 100% 失败**，且 `auth.tsx:328` 已接线 |
| **B** | **Library 搜索无效** — `listLibrary` 传 `keyword`，`GET /library` schema 无此字段 | `api.ts:821` vs `library.routes.js:151-162` | 搜索框永远返回全量 |
| **C** | **交付 origin 过滤无效** — `Deliveries.tsx` 传 `origin`，server schema 无此字段，且 server 恒定过滤掉 `user_uploaded` | `Deliveries.tsx:104` vs `deliverables.routes.js:165-175` | OriginFilterChips 点了没效果（选中 AI 生成时看起来"正常"，选"用户上传"永远空） |
| **D** | **通知列表无分页** — server 硬编码 `take: 50` 且不认 `cursor`，客户端却在读 `nextCursor` | `notification.routes.js:171` vs `api.ts:653` | 超过 50 条的通知静默丢失 |
| **E** | **`/api/v1/healthz` 不存在** — `ChatTopBanner.tsx:6` 注释引用该路径，server 只有 `/api/v1/health` | `server.js:134` vs `ChatTopBanner.tsx:6` | 目前只是死注释（无实际 fetch），但会误导后续开发 |
| **F** | 审批端点 resp **没有 `data` envelope** | `yinian.chat.routes.js:585/627/713` | 客户端类型声明若按 `{ok,data}` 解析会 undefined |

---

## 10. Send-blocker 清单 (server 端缺失, client UI 已做)

| # | 功能 | 期望路径 | server | client 当前 fallback |
|---|---|---|---|---|
| 1 | 点赞点踩 | `POST /yinian/messages/:id/feedback` | ❌ 无此端点 | **已下线** — gagaOS 2026-10-19 拍板整体删除，`api.ts` 无 wrapper，UI 也删了。**不再是 send-blocker** |
| 2 | save-to-knowledge | `POST /yinian/messages/:id/save-to-kb` | ❌ 无 | `createLibraryItem({type:'doc', title:前30字, tags:['from-chat']})`（`MessageMenu.tsx:160`） |
| 3 | AI 总结入库 (library-10) | 无约定路径 | ❌ 无专用端点 | 走 `POST /yinian/library` 兜底 |
| 4 | 全文搜索 (chat-10) | `GET /yinian/sessions?keyword=` | ⚠️ 端点在，schema 不接 | 拉全量 + 客户端 filter（`api.ts:392`） |
| 5 | 通知设置 (notifications-10) | `/agent-push-preferences` | ❌ 无 | localStorage（`api.ts:667-673`） |
| 6 | knowledgeRefs 回显 (chat-id-9) | 落进 message `metadata.knowledge_refs` | ⚠️ schema 收 `knowledge_refs` 但**不写 metadata**（`yinian.chat.routes.js:893-895` 只写 image_urls + attached_file_ids） | UI 解析就位，永不显示（`ReferenceFold.tsx:8-10`） |
| 7 | tag 过滤 (deliveries-11) | `GET /yinian/deliverables?tag=` | ⚠️ 端点在，schema 不接 | 未做 |
| 8 | status 过滤 (deliveries-15) | `GET /yinian/deliverables?status=` | ⚠️ 端点在，schema 不接 | 启发式拉全页 |
| 9 | retry (deliveries-16) | `POST /yinian/deliverables/:id/retry` | ❌ 无 | 客户端 404 后提示（`api.ts:1072`） |
| 10 | share (deliveries-id-8) | `POST /yinian/deliverables/:id/share` | ❌ 无 | 404（`api.ts:1124`） |
| 11 | star (deliveries-id-9) | `POST/DELETE /yinian/deliverables/:id/star` | ❌ 无 | 404（`api.ts:1090/1099`） |
| 12 | **注册密保卡** | `POST /auth/register` 带 securityQuestion/Answer | ⚠️ 端点在，**client 没传必填字段** | 无 — 直接 400。**建议 client 侧补字段，不用 server 改** |

最终 **12 条**（其中 #1 已由产品决策下线，实际待处理 **11 条**；#12 是 client 侧 bug 而非 server 缺失）。

---

## 11. 已知 schema 不接的参数 (端点存在但参数被丢弃)

### 关键机制：不是 400，是**静默丢弃**

Fastify 5 默认 AJV 带 `removeAdditional: true`，未声明的字段被**静默删掉**而不是报错。
证据：`kb-internal.routes.js:26-28` 明确记载"实测见 guardBodyFields 的注释"，且 `kb-internal`
必须额外挂 `preValidation` 守卫才能拦住 body 里的多余字段。

**所以：多传参数不会 400，请求会成功但参数无效。** 这比报错更难发现 —— 客户端会以为生效了。

| 端点 | 不接的参数 | 影响功能 | client 现状 |
|---|---|---|---|
| `GET /yinian/sessions` | `keyword` | chat-10 全文搜索 | 客户端本地 filter（行为正确，只是数据量大时慢） |
| `GET /yinian/library` | `keyword` | Library 搜索框 | ❌ **搜索完全失效，无 fallback** |
| `GET /yinian/deliverables` | `tag` | deliveries-11 | 未做 |
| `GET /yinian/deliverables` | `status` | deliveries-15 自动下载 | 启发式拉全页 |
| `GET /yinian/deliverables` | `origin` | deliveries-10 来源过滤 | ❌ **UI 点了没反应** |
| `GET /notifications` | `category` / `cursor` | 通知分类 + 分页 | category 失效；cursor 恒空 |
| `POST /yinian/sessions/:id/messages` | `knowledge_refs` | chat-id-9 | 见 §10 #6 |
| `POST /yinian/upload` | — | — | 无 schema 约束，任意类型都收（兜 `.bin`） |

### 已删除的端点（别再调）

| 端点 | 状态 |
|---|---|
| `POST /api/v1/yinian/internal/search` | 2026-10-15 删除 → 用 `POST /api/v1/yinternal/kb/search` |
| `GET /api/v1/yinian/quota` | 2026-09-23 删除（月配额下线） |
| `POST /api/v1/yinian/internal/search` | 同上 |

---

## 12. ⚠️ 未挂载的死代码（有文件、无路由、必 404）

这几个 `.routes.js` 文件存在，但 **`server.js` 里没有 `fastify.register`**，所以公网调不到：

| 文件 | 假如挂上会是 | 备注 |
|---|---|---|
| `modules/filemanager/filemanager.routes.js` | `/api/v1/filemanager/*`（5 个） | server.js 全文无 `filemanager` 字样 |
| `modules/ga-laile/ga-laile.routes.js` | `/api/v1/ga-laile/*`（3 个） | server.js 全文无 `ga-laile` 字样 |
| `modules/smoking/feedback.routes.js` | — | 功能已内联进 `smoking.routes.js` |
| `modules/llm/gawen.routes.js` | `/v1/chat/completions` | `server.js:164` **显式注释掉**（gawen 2026-08-26 拆独立进程 8642）。**但 nginx 的 `/v1/` location 还在反代 unified-api `/v1/` → 必然 404** |

---

## 附：安全缺口（供 server team 参考，本次只读未改）

| 端点 | 问题 |
|---|---|
| `DELETE /api/v1/yinian/chat/cancel/:sessionId` | **无鉴权** — 任何人可取消任意 sessionId 的流（`yinian.chat.routes.js:1800`） |
| `POST /api/v1/notifications` | **无鉴权** + 可指定任意 `userId`，公网可达（`notification.routes.js:132`） |
| `GET /api/v1/remote/stats` | **无鉴权**（`relay.routes.js:68`） |
| `POST /api/v1/yinternal/*` | 文件头明写"不得暴露到公网 nginx location"，但 nginx `/api/v1/` 全量透传 |
| `GET /apps/browser/proxy/*` | nginx 转到 3001 而非 unified-api，unified-api 同名路由成死路由 |

---

## 摸底方法与可复现命令

```powershell
# 1. 所有挂载点 + prefix（这是"实际路径 = prefix + 路由内路径"的唯一事实源）
cd D:\gaga\gaclaw-project\unified-api
Select-String -Path src\server.js -Pattern 'register\(|prefix'

# 2. 所有路由定义
Select-String -Path src\modules\**\*.routes.js -Pattern '\.(get|post|put|patch|delete)\('

# 3. 未挂载检测：把 server.js 的 require 清单跟 modules 目录对账

# 4. nginx（只读）
ssh -i C:\Users\gaga\.ssh\gaga_server.pem -o KexAlgorithms=+curve25519-sha256,diffie-hellman-group14-sha256 ubuntu@43.131.53.240 "sudo cat /etc/nginx/sites-enabled/gaga.sale"
```

⚠️ `sites-enabled/` 下还有两个 `.bak.*` 文件（Oct 18 / Oct 15），`cat *` 会把三份配置一起打出来。
**只有 `gaga.sale` 是生效配置**，另外两份里的 `/release/` → `/home/ubuntu/gaclaw/release/`
和 `/llm/uploads/deliverables/` → `/var/data/llm-uploads/deliverables/` 都是**已废弃**的老值。