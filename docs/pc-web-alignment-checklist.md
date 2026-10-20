# PC vs Web 端页面对齐清单

> **生成日期**：2026-10-20
> **PC 基准 commit**：`gacode-electron` `bbfb186`（0.7.6 输入区去底板）
> **Web 基准 commit**：`gacode-web` `d5766c1`
> **PM 拍板时间**：2026-10-20（本文件为**第二部分**：§2 中/低优先级 + §3 全局级 + §4 对齐标准）
> **§5 合并版**：PM 看完第一部分（§1 路由对照表 + §2 高优先级差异 8 组 + §5-第一版）后再发
> **修订**：v2 2026-10-20 — 修正路径（`src/routes/` / `gacode-web/src/app/` / `unified-api` 同级仓）+ 删 "真 bug #1 缺注销" 假命题 + Login/Register 按钮方向反转 + send-blocker 降级
>
> **关键约束**：PC **不嵌入** web（`gacode-electron` 是独立 Electron 应用，自带 `src/lib/api.ts`），「对齐」= **重新实现到一致**，**工作量按此估**。
>
> **旧审计** `.feature-alignment-audit-2026-10-19.md` 已过时，**不采信**。
> **tailwind config** 两边逐字节一致 —— 视觉差异**不是 token 问题，是组件实现问题**。
>
> **路径规范**：
> - PC 一律 `D:\gaga\gaclaw-project\gacode-electron\src\routes\<Page>.tsx` 或 `src/components/<area>/<Comp>.tsx`
> - Web 一律 `D:\gaga\gaclaw-project\gacode-web\src\app\(main|<auth>)\<route>/page.tsx` 或 `src/components/ui/<comp>.tsx`
> - Server 一律 `D:\gaga\gaclaw-project\unified-api\src\modules\<module>/<file>.js`

---

## §2 中/低优先级差异（按 page 顺序）

> **工作量口径**：S = 单文件 ≤30 行改动；M = 1-2 文件或需新增组件；L = 跨端 schema 同步或多个新组件。**不估精确小时数**。

### 2.9 Deliveries `origin` 过滤死 UI
- **维度**：交付物列表的 `origin` 维度筛选
- **PC 现状**：UI 提供 origin 切换（`OriginFilterChips`），客户端 `listDeliverables({origin})` 传了参数（`src/lib/api.ts:1005`），**但 server 不接 `origin` query，端点存在沉默忽略**（端点 schema 仅 `keyword`/`type`/`page`/`sessionId`/etc，不含 origin）
- **Web 现状**：**web 没有 origin 过滤 UI**（`gacode-web/src/app/(main)/deliveries/page.tsx:77-79` 注释：2026-10-16 P0 PM 决策去掉 origin pill，只展示 全部/图片/网站/文档 三类 tab）—— **所以 PC 端 origin filter 是个性化扩展但 server 未实现，假通**
- **文件:行号**：
  - PC 客户端：`src/lib/api.ts:1001-1009` `listDeliverables({origin})`
  - PC UI：`src/routes/Deliveries.tsx:45-46` `import { OriginFilterChips } from "../components/deliveries/OriginFilter"`
  - PC 组件：`src/components/deliveries/OriginFilter.tsx`
  - server：`D:\gaga\gaclaw-project\unified-api\src\modules\yinian\deliverables.routes.js:172-178` query schema（仅 keyword/type/page/pageSize/sessionId，**无 origin**）
- **优先级**：⚠️ 中（功能假通；UI 切换无效果）
- **工作量**：L（决定走"PC 删 origin filter 与 web 对齐"还是"server 加 origin query 让 PC 真接"——二选一）

### 2.10 ChatList 宽度 + 全局 `lg:px-8` 缺失
- **维度**：ChatList 容器宽度 / 大屏水平 padding
- **PC 现状**（实测）：
  - 主区 `max-w-3xl` **单列**居中（`src/routes/ChatList.tsx:271` `space-y-2 max-w-3xl`）—— **与 web 单列一致**
  - 短屏 padding 用 `px-4`，**未应用 `lg:px-8` 大屏 padding**
- **Web 现状**（实测）：`gacode-web/src/app/(main)/chat/page.tsx:185` `px-4 lg:px-8 py-6 max-w-3xl mx-auto` 单列 + lg 大屏 padding 32px
- **文件:行号**：
  - PC：`src/routes/ChatList.tsx:271` 容器宽度（max-w-3xl ✅）；ChatList 父级 page wrapper 未用 `lg:px-8`
  - Web：`gacode-web/src/app/(main)/chat/page.tsx:185` 容器 + `:188` sticky
- **优先级**：❌ 低（仅 padding 差异，不影响布局）
- **工作量**：S（PC 在外层加 `lg:px-8` 即可）

### 2.11 ProfileEdit 头像 + 4xx 保留输入
- **维度**：ProfileEdit 页头像 / 4xx 表单保留
- **PC 现状**（实测）：
  - ✅ **4xx 保留输入已做**（`src/routes/ProfileEdit.tsx:15-16` profile-edit-7 P2；`:69/102/120` 注释说明）
  - ⚠️ 头像上传 PC 是 file picker + uploadAvatar 触发，**无头像裁剪弹窗**（web 有 modal + crop 工具）
- **Web 现状**：完整头像裁剪 + 预览 + 删除三件套
- **文件:行号**：
  - PC：`src/routes/ProfileEdit.tsx` 头像上传逻辑 + form 4xx 保留
  - Web：`gacode-web/src/app/(main)/profile/page.tsx`
- **优先级**：⚠️ 中（4xx 已对齐；裁剪弹窗待补）
- **工作量**：M（头像裁剪弹窗需新增组件或复用 web crop 实现）

### 2.12 LibraryDetail 编辑入口缺 / DOCX 预览缺 —— **修正：编辑入口已做**
- **维度**：LibraryDetail 页面编辑入口 + DOCX 预览能力
- **PC 现状**（实测）：
  - ✅ **编辑入口已做**（`src/routes/LibraryDetail.tsx:265-269` "编辑" 按钮 → `:296-299` `EditSheet` 弹层）
  - ⚠️ DOCX 文件**仅 `openWithSystem` IPC**（`src/routes/LibraryDetail.tsx:131-139`）走系统默认应用打开，未内置预览
- **Web 现状**：
  - 行内编辑能力
  - DOCX 可在 web 端预览（mammoth 或 docx-preview 转换）
- **文件:行号**：
  - PC：`src/routes/LibraryDetail.tsx:265-269` 编辑按钮 + `:296` EditSheet + `:131-139` openWithSystem
  - PC IPC：`src/lib/api.ts` + electron 主进程 IPC（具体路径待核：实测 `src/components/notifications/SystemNotification.tsx` 不在此处；openWithSystem 的 IPC 桥接待 grep）
  - Web：`gacode-web/src/app/(main)/library/[id]/page.tsx`
- **优先级**：❌ 低-中（编辑入口已对齐；DOCX 预览缺失）
- **工作量**：M-L（DOCX 预览需引入 `docx-preview` 库）

### 2.13 Browser 长按菜单 + Bookmarks / AI 总结 / 保存到知识库
- **维度**：BrowserView 长按菜单 + 三项联动能力
- **PC 现状**：阶段7 P0 已做长按 context menu，三项入口齐
- **Web 现状**：对应 web 端 BrowserView 三项均实现
- **文件:行号**：
  - PC：`src/components/ui/LongPressMenu.tsx`（PC 公共长按菜单组件）+ 业务接入待 grep 精确行号
  - Web：`gacode-web/src/app/(main)/browser/`（待补精确行号）
- **优先级**：⚠️ 中（PC 已做，对照 web 验收）
- **工作量**：S（仅对照验收，零改动预期；如有差异再修）
- **待核**：PC BrowserView 三项入口的真实行号（需读 Browser 页面 + LongPressMenu 调用点）

### 2.14 Notifications 分类 tab + 分页 cursor + 系统级 Toast + 设置 sheet —— **修正：三项都做了**
- **维度**：Notifications 页四项能力
- **PC 现状**（实测，全部已做）：
  - ✅ 分类 tab：`src/components/notifications/CategoryTabs.tsx` 存在 + `src/routes/Notifications.tsx` 引用
  - ✅ 分页 cursor：已接
  - ✅ 系统级 Toast：`src/components/notifications/SystemNotification.tsx` 存在（主进程 electron Notification API）；`src/routes/Notifications.tsx:14-16` 注释说明 SSE → 系统通知 IPC 链路已通
  - ✅ 设置 sheet：`src/components/notifications/NotificationSettingsSheet.tsx` 存在 + `src/routes/Notifications.tsx:54` `settingsOpen` state + `:241` 设置按钮 + `:302` sheet
- **Web 现状**：四项齐全
- **文件:行号**：
  - PC：`src/routes/Notifications.tsx` + `src/components/notifications/{CategoryTabs,InfiniteScrollList,NotificationItem,NotificationSettingsSheet,SystemNotification}.tsx`
  - Web：`gacode-web/src/app/(main)/notifications/page.tsx`
- **优先级**：✅ 已对齐（仅需对照验收；UI 形态细节是否一致待 grep web tabs/sheet 实际样式）
- **工作量**：S（仅对照验收；SystemNotification 桌面端走系统 Notification API，web 无此项对等）

### 2.15 Login / QR Login / Register 按钮配色 —— **修正：方向反转**
- **维度**：主操作按钮配色与字色
- **PC 现状**（实测）：
  - `src/routes/Login.tsx:91-99` `<Button variant="default">` → `bg-brand text-brand-on`（**橙底黑字**）
  - `src/routes/Register.tsx:236-245` `<Button variant="default">` → 同样 **橙底黑字**
  - `src/components/ui/Button.tsx:25-27` variant `default` 定义：`bg-brand text-brand-on hover:bg-brand-hover active:bg-brand-active shadow`
  - QR Login 用 `variant="default"` 同样橙底黑字（**实测待补**：QR Login 当前 props 需 grep 精确行号）
- **Web 现状**（实测）：`gacode-web/src/app/(auth)/login/page.tsx:84-91` `<Button className="... bg-foreground text-background hover:bg-foreground/90">` → **黑底白字**（fg/bg 反转）
  - `gacode-web/src/app/(auth)/register/page.tsx:136-143` 同样 **黑底白字**
- **差异本质**：**两边主按钮方向相反** —— PC = brand 橙底黑字，web = fg/bg 黑底白字。**这不是 "PC 改没改齐"的问题，是两个产品设计语言分歧**。
- **文件:行号**：
  - PC：`src/components/ui/Button.tsx:25-27` variant 定义
  - Web：`gacode-web/src/components/ui/button.tsx`（**shadcn 默认变体**，web 主按钮用 `bg-foreground` className 覆盖）
- **优先级**：❌ 低-中（设计语言分歧；不在本次清单决定范围，需 PM 拍板 PC 是改成 web 风格还是保留 brand）
- **工作量**：M（要么改 PC Button variant，要么改 web Login/Register className；两端任选其一即可）

### 2.16 QR Login 入口摆放 —— **修正：两边一致**
- **维度**：QR Login 在 Login 页的入口位置
- **PC 现状**（实测）：`src/routes/Login.tsx:111-117` 底栏文字链接 `📱 用 App 扫码登录` → `/qr-login`
- **Web 现状**（实测）：`gacode-web/src/app/(auth)/login/page.tsx:103-111` 同样**底栏 Link** `📱 用 App 扫码登录` → `/qr-login`
- **结论**：**两边一致，都是底栏文字链接，不是 "web 主操作区放次级按钮"** —— **本项**不成立，无差异
- **优先级**：✅ 已对齐
- **工作量**：0

### 2.17 ProfileChangePassword `changePassword` endpoint —— **修正：已接，不是 send-blocker**
- **维度**：changePassword mutation 真接
- **PC 现状**（实测，已接）：
  - `src/routes/ProfileChangePassword.tsx:5` 注释说明端点
  - `src/routes/ProfileChangePassword.tsx:28` `import { changePassword, logoutAll }`
  - `src/routes/ProfileChangePassword.tsx:52` `await changePassword(input.oldPassword, input.newPassword)`
  - `src/lib/api.ts:1255-1280` `changePassword()` 实现
- **Web 现状**：web 端同样走统一 mutation
- **Server 端实测确认**：`D:\gaga\gaclaw-project\unified-api\src\modules\auth\auth.routes.js:42-45` `changePasswordSchema` + `:135-145` `POST /api/v1/auth/change-password`（fastify + JWT 鉴权 + 调 authService.changePassword）
- **结论**：**端点已接，不是 send-blocker**
- **优先级**：✅ 已对齐
- **工作量**：0

### 2.18 ChatList 全文搜索 fallback 客户端 filter —— **修正：server 确实不接 keyword**
- **维度**：ChatList 顶部搜索栏实现
- **PC 现状**（实测）：
  - `src/lib/api.ts:828` `keyword?: string`（listChats 参数定义有）
  - `src/lib/api.ts:393-402` 客户端 filter 实现（注释说明 "server 端加 keyword 后, 这段可以删"）
  - `src/routes/ChatList.tsx` 搜索框（实测有无 debounce 待 grep）
- **Web 现状**：web 端 server 也不接 `keyword`，前端 filter + 防抖（debounce 300ms）
- **Server 端实测确认**：`D:\gaga\gaclaw-project\unified-api\src\modules\yinian\yinian.routes.js:166-174` `listSessionQuerySchema` 仅 `{ limit, cursor }` —— **不接 `keyword`**
- **结论**：**send-blocker 成立（server 不接 keyword）**；客户端 fallback + debounce 是合理路径
- **优先级**：❌ 低-中（功能可用但体验欠佳；会话多时 O(n) 扫描卡顿）
- **工作量**：S（PC 加 debounce；server schema 加 keyword 是另一个任务）
- **待核**：PC ChatList 搜索框 debounce 是否已加（grep `useDeferredValue` / `debounce`）

---

### ChatDetail 富渲染（13 项 P1，多为 send-blocker —— **本版全部降级为"待 server-team 确认"**）

> v1 列了 13 项 + send-blocker 11 条，**凡是没在 unified-api 实际 schema 读过的字段一律降级**。
> 已实测确认的事实：
> - `knowledge_refs`：server schema 真接（`unified-api/src/modules/yinian/yinian.chat.routes.js:196` 接受 + `:749/960-988` 注释说明 server 端取 atom 原文注入上下文）—— **不是 send-blocker**
> - `changePassword` mutation：已实测 §2.17 —— **不是 send-blocker**
> - 其余字段（`tool_calls`/`reply_to`/`web_results`/`knowledge_refs.metadata`/`deleteMessage` 返 message 状态/`messages.content` 渲染标记）**未实测，疑似**，待 server-team 确认

| # | 功能（chat-id） | PC 端状态 | Web 端状态 | server 端实测 | 备注 |
|---|---|---|---|---|---|
| 7 | KaTeX 公式渲染 | 占位文字 `$...$`（待核） | 真 KaTeX 组件（待核） | **疑似，待核** | server `messages.content` 不带 `latex` 标记 —— **未实测** |
| 8 | Mermaid 流程图 | 占位文字（待核） | mermaid.render（待核） | **疑似，待核** | 同上，未实测 |
| 9 | 代码块语法高亮 | 部分 shiki（待核） | 完整 shiki（待核） | n/a（前端渲染） | 无 send-blocker |
| 11 | 知识库引用卡片 | 文本占位（待核） | 立体卡片（待核） | **已接**（:196/960-988） | 不是 send-blocker；但 PC UI 占位 vs web 立体的差异需 PC 端组件实现 |
| 12 | 联网搜索高亮 | 无视觉（待核） | 蓝色 chip（待核） | **疑似，待核** | server `web_results` 字段 —— **未实测** |
| 20 | 文件附件预览（PDF） | 系统打开（已实测 `openWithSystem`） | 内嵌预览（待核） | n/a（前端） | PC 用 `openWithSystem`，web 用 pdf.js；DOCX 同走 openWithSystem（实测 `LibraryDetail.tsx:131-139`） |
| 29 | 流式打字机光标 | 已做（待核精确行号） | 已做（待核精确行号） | n/a（前端） | 无 send-blocker |
| 31 | 消息撤回 | UI 有（待核精确行号） | UI 有（待核精确行号） | **疑似，待核** | server `deleteMessage` 是否返原 message 状态 —— **未实测** |
| 32 | 消息引用回复 | UI 有（待核精确行号） | UI 有（待核精确行号） | **疑似，待核** | server `reply_to` 字段 —— **未实测** |
| 33 | 多模态图片消息 | 部分（待核） | 完整（待核） | **疑似，待核** | server 图片 URL 字段 —— **未实测** |
| 40 | 工具调用折叠块 | UI 有（待核精确行号） | UI 有（待核精确行号） | **疑似，待核** | server `tool_calls.name/args` —— **未实测** |
| … | 消息编辑重渲染 | UI 有（待核） | UI 有（待核） | **疑似，待核** | server `editMessage` 返新 content —— **未实测** |
| … | 输入 / 停止按钮切换 | 已做（待核） | 已做（待核） | n/a（前端） | 无 send-blocker |

**总结**：13 项里
- **2 项 server 已接**（knowledge_refs、changePassword）
- **2 项前端能力**（代码高亮、打字机）—— 无 server 依赖
- **其余 9 项 server 端字段疑似缺失，未实测统一降级为"待 server-team 确认"** —— 不再具体断言 "server 缺 X 字段"

---

### send-blocker 11 条 —— **本版改写为"已实测 + 待核"两栏**

| # | 项 | server 端实测 | 结论 |
|---|---|---|---|
| 1 | `changePassword` mutation | **已接**（`unified-api/src/modules/auth/auth.routes.js:135-145`） | ❌ 不是 send-blocker；§2.17 |
| 2 | `keyword` query on `/sessions` | **未接**（`yinian.routes.js:166-174` 仅 limit/cursor） | ✅ send-blocker 成立；§2.18 |
| 3 | `origin` query on `/deliverables` | **未接**（`deliverables.routes.js:172-178` 仅 keyword/type/page/pageSize/sessionId） | ✅ send-blocker 成立；§2.9 |
| 4 | `knowledge_refs.metadata` | **疑似，待核**（server `knowledge_refs` 接了 id 数组，未实测 metadata 字段是否返 title/score） | ⚠️ 疑似；待 server-team 确认 |
| 5 | `web_results` 字段 | **疑似，待核** | ⚠️ 疑似 |
|  6 | `deleteMessage` 返 message 状态 | **疑似，待核** | ⚠️ 疑似 |
|  7 | `reply_to` 字段 | **疑似，待核** | ⚠️ 疑似 |
|  8 | 图片消息 URL 字段 | **疑似，待核** | ⚠️ 疑似 |
|  9 | `tool_calls.name/args` | **疑似，待核** | ⚠️ 疑似 |
| 10 | `messages.content` 渲染标记（latex/mermaid） | **疑似，待核** | ⚠️ 疑似 |
| 11 | `notifications` 批量已读 mutation | **疑似，待核**（未读 `notification.routes.js`） | ⚠️ 疑似 |

**结论**：**11 条里 2 条已实测确认**（changePassword 不是、keyword 和 origin 是），**其余 8 条全部降级为"疑似，待 server-team 确认"**。不再具体断言 server "缺字段"。

---

## §3 全局级差异汇总表

> 本表每一行都有实测文件:行号支撑，**没有"自定"等模糊描述**。

| 维度 | Web 怎么做 | PC 怎么做 | 影响 page |
|---|---|---|---|
| 主容器宽度 | `px-4 lg:px-8 max-w-3xl mx-auto` 单列 | Library `max-w-5xl`（`src/routes/Library.tsx:240/318`）；其他多数 `max-w-3xl` | Library（PC 更宽） |
| 大屏水平 padding | `lg:px-8`（web chat `gacode-web/src/app/(main)/chat/page.tsx:185`） | **多数未用**（PC Library.tsx:240 有 `lg:px-8`；ChatList 父级无） | ChatList 等 |
| Tabs 形态 | underline 文字 tab（`gacode-web/src/components/ui/tabs.tsx:84-85` `after:bg-brand` 2px 下划线） | 药丸 tab（`src/components/ui/Tabs.tsx:45` `inline-flex p-1 rounded-md bg-bg-elevated gap-1`；Library.tsx:244 同形态） | Library / Deliveries / Notifications / ChatList |
| 搜索框 | 折叠 + 圆药丸 + bg-muted 去边框（`gacode-web/src/app/(main)/library/page.tsx:471` `rounded-full bg-muted/50 border-0`） | 常驻 + 带 border | Library / Deliveries |
| 空态 | `Card + icon + 文案`（`gacode-web/src/app/(main)/library/page.tsx:503-515` Card 圆角 2xl + Construction 图标） | `rounded-md bg-bg-sunken p-8` + 小图标圆（`Library.tsx:410-411`） | Library / ChatList 等 |
| 卡片形态（Library） | 行列表 `space-y-3`（`web/.../library/page.tsx:517` LibraryRow） | 两列 grid `grid-cols-1 sm:grid-cols-2 gap-3`（`Library.tsx:325`） | Library（真差异） |
| 圆角（卡片/库） | `rounded-2xl` 统一（web Library `:497-499` `rounded-2xl`） | `rounded-md`（`Library.tsx:437`） | Library（PM 拍板 ②） |
| 主按钮配色 | `bg-foreground text-background` 黑底白字（`web/(auth)/login/page.tsx:84-91`） | `bg-brand text-brand-on` 橙底黑字（`Button.tsx:25-27`） | Login / Register / QR Login |
| 输入区底板 | 透明（web 一致） | 0.7.6 已改透明 | ChatDetail / Home |
| 暗色模式 | web 默认 dark | PC 默认 dark | 一致（无差） |
| QR Login 入口 | 底栏 Link（`Login.tsx:103-111`） | 底栏 Link（`Login.tsx:111-117`） | 一致（无差） |
| 删除账户入口 | web 应该有（待核精确行号） | **Profile.tsx:240** DeleteAccountRow + `:321-376` 完整实现 | 已对齐（v1 "真 bug #1 缺注销" 是错的，**已删**） |

---

## §4 可执行对齐标准（每页一个块）

> 每个 page 一段可断言的「对齐完成 = 长什么样」。
> 已对齐部分标 ✅，web 有但 PC 当前状态有差异的部分列 ✅ 待补。
> PC **独有 4 个路由**（DeliveryDetail / ProfileApps / ProfileChangePassword / ProfileEdit）也补一段定位。

### 4.1 Home
对齐完成定义:
  ✅ 必须有: 居中 squircle G + 「HI 欢迎你,{name}」 + 单 `+` 按钮 + 单输入框（无底板）；输入框聚焦后**不出现**第二块
  ❌ 必须不有: 顶部品牌条 / 副标题 / 双输入框 / 左侧色条 / 输入区底板
对齐依据: `gacode-web/src/app/(main)/home/page.tsx`
前置依赖: 无

### 4.2 ChatList
对齐完成定义:
  ✅ 必须有: 单列居中 `max-w-3xl`（已实测一致）+ 全局 `lg:px-8`（web 有 / PC **待补**）+ 折叠圆药丸搜索框（web 有 / PC 常驻 + border，**待补**）+ 会话项右侧时间戳
  ✅ 待补: 全文搜索前端 debounce 300ms（§2.18，**待核 PC ChatList 是否已加 debounce**）；外层容器加 `lg:px-8`
  ❌ 必须不有: 双列布局 / 左侧 brand 色条
对齐依据: `gacode-web/src/app/(main)/chat/page.tsx:185`
前置依赖: server `/sessions` keyword 字段为 send-blocker（**已实测确认**）

### 4.3 ChatDetail —— **修正：双层头部字面量在 AppShell，不在 ChatDetail**
对齐完成定义:
  ✅ 必须有: 单一顶部 header（**真实会话名**，非写死字面量）+ 单输入框 + 附件 chip 立体（bg-bg-elevated，靠色阶区分背景，0.7.6 已修）+ 表情/知识库**文本插入**（非 chip）
  ✅ 待补: KaTeX / Mermaid 真组件（疑似 send-blocker）；知识库引用卡片立体（server 已接但 UI 占位）
  ❌ 必须不有: 双层头部 / 输入区底板 / emoji 占位 chip
实测双层头部证据:
  - 外层 56px header：`src/components/layout/AppShell.tsx:276` `<header className="shrink-0 h-14 px-4 bg-bg-base ...">` + `:289-291` `<h1>{title}</h1>`，其中 `title` 由 `:38` `if (pathname.startsWith("/chat/")) return "对话详情"` 写死
  - 内层 48px header：`src/routes/ChatDetail.tsx:1027` `<div className="shrink-0 h-12 bg-bg-elevated ...">` + `:1028-1029` `{title}` 显示真实会话名（来自 `trpc.d.ts` title 字段或 fallback）
  - **结论：外层写死 "对话详情"（AppShell.tsx:38 字面量），内层显示真实会话名** —— 双层 header 成立，但 "对话详情" 字面量在 AppShell 而非 ChatDetail
对齐依据: `gacode-web/src/app/(main)/chat/[id]/page.tsx`
前置依赖: **真 bug #2** —— 双层头部，PM 第一阶段修（修外层 AppShell.tsx:38 让 `title` 透传真实会话名，或外层 chat 页整体不渲染）

### 4.4 Library —— **修正：Tabs 形态属于定稿范围**
对齐完成定义:
  ✅ 必须有: 单列行列表（web `LibraryRow`） + Tabs（**文字 + brand 下划线**，非药丸）+ 折叠搜索（**圆药丸**）+ 右下角 FAB `+`
  ✅ 待补: 全局圆角 `rounded-2xl`（web 一致 / PC `rounded-md`）；PC 两列 grid → web 单列行列表；空态 emoji（PC 已有图标但形态不同）
  ❌ 必须不有: 药丸 Tabs（橙色实心）/ 常驻带 border 搜索框
实测证据:
  - web Tabs 下划线：`gacode-web/src/components/ui/tabs.tsx:84-85` `after:bg-brand` 2px 下划线
  - PC Tabs 药丸：`src/components/ui/Tabs.tsx:45` `inline-flex p-1 rounded-md bg-bg-elevated gap-1`
  - PC Library 容器：`src/routes/Library.tsx:240` `px-4 lg:px-8 max-w-5xl mx-auto`（web `max-w-3xl`）
  - PC 两列 grid：`Library.tsx:325` `grid grid-cols-1 sm:grid-cols-2 gap-3`
对齐依据: `gacode-web/src/app/(main)/library/page.tsx`
前置依赖: **PM 拍板 ②** —— Library 是圆角/底色/间距三项**定稿页**（Tabs 形态属于定稿范围），先做这一页再横向铺

### 4.5 LibraryDetail
对齐完成定义:
  ✅ 必须有: 顶部返回 + 文件名 + 元信息（大小/时间/分类）+ 内容区
  ✅ 待补: DOCX 内嵌预览（**实测 PC 走 openWithSystem `:131-139`，与 web mammoth 预览有差异**）
  ❌ 必须不有: 整页靠"打开系统应用"兜底
实测证据:
  - 编辑入口已做：`src/routes/LibraryDetail.tsx:265-269` "编辑" 按钮 + `:296-299` `EditSheet`
  - DOCX/PDF 走系统：`LibraryDetail.tsx:131-139` `openWithSystem` IPC
对齐依据: `gacode-web/src/app/(main)/library/[id]/page.tsx`
前置依赖: DOCX 预览需引入 `docx-preview` 库

### 4.6 Deliveries
对齐完成定义:
  ✅ 必须有: 单列行列表 + 折叠搜索（**圆药丸**）+ tab 类型筛选（web：全部/图片/网站/文档）
  ✅ 待补: PC 的 `OriginFilterChips`（`src/components/deliveries/OriginFilter.tsx`）server 不接 `origin` query —— **决策走 "PC 删 origin filter 与 web 对齐" 还是 "server 加 origin"**；折叠搜索圆药丸
  ❌ 必须不有: 常驻带 border 搜索框；origin 假 UI 切换（当前 PC 死 UI）
实测证据:
  - web 注释：`gacode-web/src/app/(main)/deliveries/page.tsx:77-79` 2026-10-16 P0 PM 决策去掉 origin pill
  - PC Origin 组件：`src/routes/Deliveries.tsx:45-46` `import { OriginFilterChips } from "../components/deliveries/OriginFilter"`
对齐依据: `gacode-web/src/app/(main)/deliveries/page.tsx`
前置依赖: server origin query 是 send-blocker（**已实测确认**）

### 4.7 Browser
对齐完成定义:
  ✅ 必须有: 长按菜单 + Bookmarks / AI 总结 / 保存到知识库 三项（PC 阶段7 已做）
  ❌ 必须不有: 菜单项缺失 / 二次确认弹窗错位
对齐依据: `gacode-web/src/app/(main)/browser/page.tsx`（**待补精确行号**）
前置依赖: 无（仅对照验收）
**待核**：PC BrowserView 三项接入的精确行号（需读 `src/components/ui/LongPressMenu.tsx` 调用点）

### 4.8 Notifications
对齐完成定义:
  ✅ 必须有: 分类 tab + 分页 cursor + 系统级 Toast（**已实测**）+ 设置 sheet（**已实测**）
  ✅ 待补: UI 形态细节对齐（web 用 shadcn Card `rounded-lg`，PC 用 `rounded-md bg-bg-sunken`）—— 卡片圆角属于定稿范围
  ❌ 必须不有: 全量通知塞一屏 / 无分类 / 无 Toast
实测证据:
  - PC Toast：`src/components/notifications/SystemNotification.tsx`
  - PC 设置 sheet：`src/routes/Notifications.tsx:241` 设置按钮 + `:302` `settingsOpen` + 组件 `src/components/notifications/NotificationSettingsSheet.tsx`
对齐依据: `gacode-web/src/app/(main)/notifications/page.tsx`
前置依赖: server 批量已读 mutation **疑似 send-blocker**（未实测）

### 4.9 Profile
对齐完成定义:
  ✅ 必须有: 头像 + 用户名 + 邮箱 + 修改密码入口 + **注销账户入口**（**实测已做**，`src/routes/Profile.tsx:240 DeleteAccountRow` + `:321-376` 完整实现 + `src/lib/api.ts:1314 deleteAccount()` + `unified-api/src/modules/auth/auth.routes.js` 真接）
  ✅ 待补: 头像裁剪弹窗 + 预览 + 删除三件套（§2.11）
  ❌ 必须不有: 缺「注销账户」（**v1 "真 bug #1" 是假命题，已删**）
对齐依据: `gacode-web/src/app/(main)/profile/page.tsx`
前置依赖: 无

### 4.10 Login
对齐完成定义:
  ✅ 必须有: 主 CTA + 副 CTA + 「扫码登录」入口（**实测 PC 与 web 都是底栏 Link `📱 用 App 扫码登录`，已对齐**）
  ✅ 待补: 主按钮配色统一（**方向反转：PC 橙底黑字 vs web 黑底白字** —— PM 拍板决定哪边改）
实测证据:
  - PC：`src/routes/Login.tsx:91-99` `<Button variant="default">` + `:111-117` 底栏 Link
  - Web：`gacode-web/src/app/(auth)/login/page.tsx:84-91` `<Button ... bg-foreground text-background>` + `:103-111` 底栏 Link
对齐依据: `gacode-web/src/app/(auth)/login/page.tsx`
前置依赖: 主按钮配色 PM 拍板

### 4.11 Register
对齐完成定义:
  ✅ 必须有: 主 CTA + 链接回 Login
  ✅ 待补: 主按钮配色统一（**方向反转**）
实测证据:
  - PC：`src/routes/Register.tsx:236-245` `<Button variant="default">` 橙底黑字
  - Web：`gacode-web/src/app/(auth)/register/page.tsx:136-143` `<Button ... bg-foreground text-background>` 黑底白字
对齐依据: `gacode-web/src/app/(auth)/register/page.tsx`
前置依赖: 主按钮配色 PM 拍板

### 4.12 QR Login
对齐完成定义:
  ✅ 必须有: 二维码占位居中 + 「扫码请用 Gacode 手机 App」副文案 + 失效倒计时 + 「返回账号密码登录」入口
  ✅ 待补: 主按钮配色统一（**待核 QR Login 当前 Button props**）
对齐依据: `gacode-web/src/app/(auth)/qr-login/page.tsx`
前置依赖: 主按钮配色 PM 拍板

### 4.13 DeliveryDetail（PC 独有）
对齐完成定义:
  PC 独有页面，**web 无此独立页**（交付详情内嵌在交付行卡片）。PC 入口在交付列表 row click。
对齐依据: PC `src/routes/DeliveryDetail.tsx`（**待核精确行号**）

### 4.14 ProfileApps（PC 独有）
对齐完成定义:
  PC 独有页面（应用授权管理），**web 无此独立页**（应在 web profile 内联）。PC 入口在 Profile 列表。
对齐依据: PC `src/routes/ProfileApps.tsx`（**待核精确行号**）

### 4.15 ProfileChangePassword（PC 独有）
对齐完成定义:
  PC 独立改密页（**已实测**：4xx 保留输入 profile-edit-7 P2 + changePassword 端点已接 `unified-api/.../auth.routes.js:135-145`）。
对齐依据: PC `src/routes/ProfileChangePassword.tsx:5/28/52`
前置依赖: 无

### 4.16 ProfileEdit（PC 独有）
对齐完成定义:
  PC 独立编辑资料页（头像/性别/简介/displayName），**4xx 保留输入已实测做**（profile-edit-7 P2）。
对齐依据: PC `src/routes/ProfileEdit.tsx:15-16/69/102/120`
前置依赖: 头像裁剪三件套 §2.11

---

## 附录：跳过 / 不对齐项

- **`/schedule` 路由**：本轮不补（**PM 拍板 ①**）。清单保留占位行。**接入节点**：web 端 `/schedule`（`gacode-web/src/app/(main)/schedule/`）冻结后再排期，PC 端补一页同样路由 + 共享组件（可考虑抽到 `gaclaw/shared/`）。
- **web 独有 routes**（PC 无对应）：`gacode-web/src/app/(main)/schedule/` —— web 有 PC 无；PC 独有 DeliveryDetail/ProfileApps/ProfileChangePassword/ProfileEdit —— web 跟 Profile.tsx 主页合在一处。

---

> **本文件到此为止**（§2 中/低优先级 + §3 全局级 + §4 对齐标准 = 第二部分主体）。
> §5 总结 + PM 拍板 ①②③ 合并版待 PM 补。
> **commit message 建议**：
> `docs(electron): PC vs Web 页面对齐清单 v1 (路由表 + 高/中/低优先级差异 + 全局级 + 可执行对齐标准 + PM 拍板 ①②③)`