# AGENTS.md —— gacode-electron（PC 端 Gacode）

> 这一份是 **PC 端**的契约备忘。
> 跨端共用的条款在 `../gacode-web/AGENTS.md` 的同名章节（web 端持有跨端口径）——
> 两边**逐条对齐**：改一边要改另一边（⛔ 别只改一端）。

## 订正 28 · 会话收件箱（队列）+ 按钮状态机（2026-11-14 · W5 · PC 端）

> 设计依据：根目录 `docs/design/async-work-unit-architecture-2026-11.md` (v4) §3.6 / §3.7 / §3.8 / §3.9。
> 服务端端点（unified-api `src/modules/work-units/session-inbox.user.routes.js`，**已上线**）：

| 端点 | 作用 |
|---|---|
| `GET /api/v1/yinian/sessions/:id/inbox` | 队列（「N 条排队中」的数据源；排序 = `priority desc, seq asc`；每项带 `attachments` / `knowledgeRefs`）|
| `POST /api/v1/yinian/sessions/:id/inbox/:messageId/flush` | **立即发送** = 插队（服务端标 `injectable=true` ⇒ 下一个**工具调用边界**并入**正在跑的那一轮**）⇒ **不打断**当前轮；同时补写一条 user 行 |
| `POST /api/v1/yinian/sessions/:id/inbox/:messageId/consume` | **出队标记**（客户端把它当普通消息发出去之后调用）|
| `DELETE /api/v1/yinian/sessions/:id/inbox/:messageId` | **删掉队列里的一条**（unified-api `ded3da2`，2026-11-14）—— 200 `{ok,data:{id,state:"deleted"}}` / 404 队列项不存在 / 400 这条已经不在队列里 |
| `GET /api/v1/yinian/sessions/:id/pending-work` | 本会话**有没有在跑的后台活**（停止按钮的判据之一）|

端侧落点（PC 端）：

- `src/lib/session-inbox.ts` —— 队列的**唯一**端侧入口（`listInbox` / `flushInboxMessage` / `consumeInboxMessage` / **`deleteInboxMessage`** / `listPendingWork` / `enqueueUserMessage`），全部走 `lib/api.ts` 的 `request()`（⛔ 不许新造 HTTP 栈）。
- `src/components/chat/QueueBar.tsx` —— 队列条（「N 条排队中 ⌄」+ 每条一个「⏫」= 插队 + 每条一个「🗑」= **删掉这一条**）。
- `src/routes/ChatDetail.tsx` —— 队列数据、插队/删除/泵队列都在这儿（`queueEntries` = 服务端行 + 端侧乐观行 `local:<n>`）。
- ★ **队列条有删除入口**（2026-11-14 · PM「队列的内容是要允许删除的」）：
  `src/components/chat/QueueBar.tsx`（每条排队消息一个「🗑」· `onDelete`）
  ⇒ `src/routes/ChatDetail.tsx`（`deleteQueueItem()` · 删成功刷队列、失败**如实** toast）
  ⇒ `src/lib/session-inbox.ts`（`deleteInboxMessage()`）
  ⇒ **`DELETE /api/v1/yinian/sessions/:sessionId/inbox/:messageId`**（unified-api `ded3da2`）。
  - 语义：删的是**队列项**（**还没发出去**的那条）⇒ 泵队列跳过它、「⏫ 立即发送」也插不了它；
    ⛔ **不动已经发出去的消息**（那是历史里的 user 行 ⇒ 走撤回/删除那条路）；⛔ 删除**不**补写气泡。
  - 端侧乐观行（`local:` 前缀，服务端还没认领）⇒ 没有服务端 id ⇒ 端侧直接收掉。
  - 断言：`test/session-queue-delete.test.mjs`（+ `test/pc-session-inbox-queue.test.mjs` 里的队列条断言）。

## 订正 28 · **L-28r · 补充边界帧**（2026-11-14 · PC 端）

> 场景（PM 2026-11-14 真机报障）：用户在 agent 跑的时候补了一句话（插队）⇒
> **功能是通的**（agent 读到了补充并接着回答），但**排版不对**：
> 两段回答并成同一条 assistant 气泡，用户的补充排在它**下面** ⇒
> 看起来像「补充是在补充后内容下面」。
>
> ⇒ **后端不需要新一轮**（还是同一个 turn、同一把 SSE 流）⇒ 只是前端要有「区隔」。

服务端契约（**已上线**）：SSE 里多一个**顶层字段**（沿用 a4 `deletedDeliverables` 的路子）：

```json
{ "supplementBoundary": { "id": "<收件箱行 id>", "kind": "user_supplement|work_unit_result",
                          "fromKind": "user|work_unit|agent", "content": "<补充正文>" } }
```

- 这是**无内容帧**（没有 content/thinking/done…）⇒ 端侧认**顶层字段**。
- 语义：「**这里**插进来一条补充」⇒ ① 正在流式的气泡**收尾** + ② **另起一个新气泡**给后面的续答
  + ③ 补充那条**按自己的角色**渲染成一个气泡（正文用 `content`）。

端侧落点（PC 端）：

- `src/lib/supplement-boundary.ts` —— **判据与切法都在这儿**（零运行时 import ⇒ 断言脚本能直接跑）：
  `parseSupplementBoundary` / `supplementRowId` / `supplementRole` / `planSupplementCut`。
- `src/lib/chat-sse.ts` —— 帧归一层（`normalizeChatChunk`）**保留** `supplementBoundary`
  （⚠️ 这一帧是**无内容帧** ⇒ 归一层不许把它当「不认识的帧」整帧丢掉）。
- `src/lib/cancel.ts` —— `ChatChunk.supplementBoundary`（老服务端没有 ⇒ undefined ⇒ 行为不变）。
- `src/lib/api.ts` —— `getHistory` 解析 `metadata.inbox_id` ⇒ `ChatMessage.inboxId`。
- `src/routes/ChatDetail.tsx` —— 切气泡：
  - `cutRows` = 本轮被切开出来的气泡（**收尾的 assistant 段** + **补充条**），
    插在**流式行之前** ⇒ 顺序 = `[A1][补充][A2]`；
  - 边界帧**在状态机之前**认（它没有内容、老服务端下还不带 `id:` 行 ⇒ 会被判成「重复帧」丢掉），
    但仍交给状态机**记一笔账**（游标/seq 该推进还是要推进）；
  - 终态帧撤掉流式行**之前**先把最后一段（续答 A2）收尾 ⇒ 后半截回答不跟着消失。
- **去重**：合成气泡 id = `supplement:<inbox_id>`；历史里那条（服务端 flush 时写的 user 行，
  带 `metadata.inbox_id`）用**同一个** id ⇒ 直播插的那条与刷新回来的那条**是同一条**（不重复显示）。
  - ⛔ 撤回 / 删除要打服务端 ⇒ 真 id 另存 `ChatMessageModel.serverId`（`MessageList` 传 `serverId ?? id`）。
- 断言：`test/session-supplement-split.test.mjs`（归一保留 / 切法 / 合成 id / 历史映射 / 端侧接线）。

## 订正 30 · 「服务端起轮，端侧当观众」（2026-11-15 · PC 端）

> 契约来源：根目录 `docs/design/async-work-unit-30-client-contract.md` §1 / §2 / §4
> （根目录 docs/ **不是 git 仓** ⇒ 条款只能复述在本文件 + commit message 里）。

### 帧格式（走通知 SSE 流 `GET /api/v1/notifications/stream`，**不带 `id:` 行**）

```
data: {"type":"turn_started","turnStarted":{
        "sessionId":"<会话id>",              // 必填 —— 这一轮在哪个会话里
        "inboxId":"<收件箱那封信的id>",
        "jobId":"<后台作业id，可为空字符串>",   // 未知时是空字符串（不是 null）
        "reason":"work_unit_result"}}
```

### 三条铁律

1. ⛔ **必须用新 type `turn_started`**；⛔ **不得复用 `work_unit_result`** ——
   旧端已经把它理解成「起轮指令」⇒ 复用 ⇒ **旧端会起轮 ⇒ 双份**。
   新 type 旧端不认 ⇒ 走 `unknown` 兜底 ⇒ **老端不崩、不双份**。
2. ⛔ **端侧收到这个帧不许起轮** —— 服务端已经起好了；端侧再发一次 chat/stream
   = 两个轮次 = 双份（⛔ 不许用 `work_unit_ref` 发起 chat/stream）。
3. ⛔ **端侧不碰报告正文** —— 正文只存在服务端的收件箱里，端侧从头到尾只传 id；
   ⛔ **不本地插「（后台任务XXX已完成）」气泡**（服务端已经写了 user 行 ⇒ 本地再插
   ⇒ 刷新后重复 ⇒ 安卓已因此闪退过）。

### PC 端落点

- `src/lib/notifications-sse.ts` —— 帧解析侧（**与 web 端 `gacode-web/src/lib/notification-stream.ts` 逐字对齐**）：
  `TurnStartedInfo` / `normalizeTurnStarted`（形状不对 ⇒ null，**不抛异常**；`jobId` 未知 ⇒ **空字符串**）
  / `parseNotificationEvent` 的 `turn_started` 分支 / `unknown` 兜底分支（末尾那行**不许改**）
  / `if (frame.id) lastEventId = frame.id;`（**不许改** —— 信号帧不带 `id:` 行 ⇒ 游标自然不推进）。
- `src/lib/turn-started.ts` —— 端内广播通道（按 `sessionId` 派单；沿用本仓既有的 `window` 自定义事件惯例）。
- `src/routes/ChatDetail.tsx` —— 收到信号且 `sessionId == 当前会话` ⇒ **自动 attach**
  （复用现成的「进场接回」那条路径：bump `attachEpoch`）。
- ★ **「别的会话」的用户可见提示**（本批补齐，与 web 端对齐）：
  - `src/lib/turn-started-hint.ts` —— **纯逻辑**（零运行时 import ⇒ 可单测）：
    `buildTurnStartedHint()`（**当前正看着的会话 ⇒ 返回 null ⇒ 不提示**）+
    `turnStartedHintTarget()`（落点 `/chat/<id>` ⇒ **点得动**）。
  - `src/components/layout/AppShell.tsx` —— 提示的两层（**都是仓里既有的机制，不新造 UI**）：
    ① **侧栏红点** —— 复用 `ChatItem` **既有的** `hasNewMessage` 标记（与服务端那个**取或**）；
    ② **系统托盘通知（Windows Toast）** —— 复用既有的
      `window.gacode.notificationSSESend({title, body, target})`（C4-11：主进程弹 Toast +
      挂 click ⇒ 点了恢复窗口 + 跳落点路由）。
  - 断言：`test/pc-turn-started-hint.test.mjs`（别的会话 ⇒ 有提示 / 当前会话 ⇒ **不**有提示 /
    提示可跳转 / ⛔ 不许起轮·不许本地造气泡）。

## 订正 31 · PC 浏览器端侧工具 `pc_browser_*`（2026-11-15 · M0 · PC 端）

> 设计依据：根目录 `docs/design/pc-browser-agent-2026-11.md`
> （**根目录 `docs/` 不是 git 仓** ⇒ 条款只能复述在本文件 + commit message 里）。
> 服务端契约（gaclaw `src/llm/client-tools.js` 的 `PC_TOOL_SPECS`）**M0.5 才加**，
> 本次只落 PC 仓，不碰 gaclaw / unified-api。

### 三条铁律

1. ⛔ **不新建浏览器** —— PC 端本来就有 Electron `<webview>` + 主进程 BrowserView tab 池
   （`electron/main.ts` 的 `browserTabs`）。新文件 `electron/client-tools/browser.ts`
   只是把**已有池**接成 `pc_*` 工具能调的一层薄控制。
2. ★ **用户和 agent 共用一个 tab 池**（PM 2026-11-15 拍板）——
   `main.ts` 把同一个 `browserTabs` Map 注给 `setBrowserTabPool()`；
   渲染层 `gacode:open-browser-tab` 与 `pc_browser_open` **调同一个** `openBrowserTab()`。
   - tab 被用户关掉 ⇒ `destroyed` 监听把它从 Map 删掉 ⇒ agent 按 url 找不到活 tab
     ⇒ **自己再开一个**（不报错、不要求用户手动恢复）。⛔ 不另起独立窗口、不另建池。
3. ⛔ **端侧不拼模型上下文**（L-24n / L-25q）—— `stdout` 只回一行紧凑 JSON
   （`tool` / `url` / `tabId` / `title` / `reused`，≤ 1 KB）；
   ⛔ 不返回整页 HTML、不返回 cookie / token 明文。折叠由 gaclaw `foldClientResult` 做。

### 端侧落点（PC 仓，M0）

| 文件 | 改动 |
|---|---|
| `electron/client-tools/browser.ts`（新建） | `normalizeBrowserUrl`（只放 http/https，⛔ file:/javascript:/data:）/ `findLiveTabId` / `pcBrowserOpen` / `setBrowserTabPool` |
| `electron/client-tools/executor.ts` | `DEFAULT_TIMEOUT_MS` 加 `pc_browser_open: 30000`；switch 加 1 个 case |
| `electron/main.ts` | 把 open-tab 主体抽成 `openBrowserTab(url)`（IPC 与 agent 共用）；`registerBrowserTabIpc()` 里 `setBrowserTabPool({open, entries})` |
| `electron/preload.ts` / `shared/types.ts` | `openBrowserTab` 返回类型加 `title: string`（**向后兼容**：渲染层只读 `tabId`） |
| `test/pc-browser-open-m0.test.mjs`（新建） | 9 条断言：URL 校验 / 活 tab 判定 / **共用不新开** / **关了自己重建** / 未接线明确 error / stdout ≤1KB / 失败如实回报 |

### 安全与边界

- ⛔ `file:` / `javascript:` / `data:` / `ftp:` 一律硬拒（本地文件 / XSS 面）。
- M0 **不截图、不点击、不读 DOM**；`pc_browser_snapshot` / `act` / `shot` 在 M1~M2。
- M0 **不声明 `browser=1` 能力键** —— gaclaw 侧还没加 spec，先声明只会白透传一个没人用的键；
  M0.5 跟 `PC_TOOL_SPECS` 一起加（⚠️ 能力头**不得用于鉴权**，L-24e）。
- **真机 E2E 钩子**（`GACODE_E2E_BROWSER_OPEN=<url>`，只用于本地验收，生产不设）：
  `main.ts` 在 `did-finish-load` 后调**真实的** `executeClientTool('pc_browser_open', ...)`
  （不是直接调 `openBrowserTab`）⇒ 验的是 spec → executor → browser.ts → tab 池整条；
  连开两次同 url ⇒ 第二次 `reused:true` 且只开 1 个 tab（**共用**）。
  - `test/e2e-browser-open.mjs` 起本地 HTTP server + 拉真 Electron，脚本内 `delete env.ELECTRON_RUN_AS_NODE`
    （⛔ 宿主 Claude 的 bash 带 `ELECTRON_RUN_AS_NODE=1` ⇒ electron.exe 退化成普通 Node ⇒ 启动秒退）。
  - ⚠️ 文件名不以 `.test.mjs` 结尾 ⇒ `npm test` 不会跑到（它不是单测）。
- 复用分支也要**如实回标题**（`BrowserTabPool.titleOf`）—— 不留空串给模型。

### 验证（已跑）

- `node --test test/pc-browser-open-m0.test.mjs` ⇒ 9/9
- `npm test` ⇒ 422/422
- `npx tsc --noEmit -p tsconfig.node.json` / `tsconfig.web.json` ⇒ 干净
- `npm run build` ⇒ electron-vite 三段（main / preload / renderer）全通过
- ★ **真机** `node test/e2e-browser-open.mjs` ⇒ PASS：真实 Electron 窗口开出 BrowserView、
  `webContents.getTitle()` 读到 `Gacode M0 Browser E2E`、第二次 `reused:true`、
  全程只开 1 个 tab、进程 `exit=0` / `stderr 0B`

---

## 订正 31 · M1 · `pc_browser_snapshot`（只读 DOM 快照，2026-11-15 · PC 端）

> 设计依据：根目录 `docs/design/pc-browser-agent-2026-11.md` §5 / §6。
> 仍只落 PC 仓，不碰 gaclaw / unified-api。

### 做什么

`pc_browser_snapshot`：在活 tab 的**页面主世界**跑一段**固定只读** JS，
抽 **可读文本**（`document.createTreeWalker` 跳过 script/style/隐藏元素）
+ **可交互元素编号表**（`a,button,input,textarea,select,[role]...`，过滤不可见），
生成 `e1..eN` 编号供 M2 `pc_browser_act` 引用。

### 三条铁律（接 M0 的边界）

1. ⛔ **注入脚本是固定常量**（`SNAPSHOT_SCRIPT`），模型给的任何参数**都不会拼进 JS** ⇒
   模型借不了这条口子执行任意 JS（唯一的口子是 `BrowserTabPool.evalInTab`，只跑本模块脚本）。
2. ⛔ **端侧回传前硬限长**（上下文顶爆防线，血泪来自 2026-11-13）：
   正文 ≤ 8KB / 元素 ≤ 200 项 / 单元素 text ≤ 80 字符 / **stdout 总量 ≤ 12KB**。
   超长标 `truncated:true` + 给 `next_cursor`；⛔ 不把整页 HTML 塞进上下文。
3. ⛔ **不读 cookie / localStorage / fetch / `outerHTML` / `href` / `value`** ⇒
   不把 URL 参数里的 token 带出来。脚本里连这些字样的**注释**都别写（单测会按纯文本扫）。

### 编号表约定（M2 `stale_element_ref` 的底座）

- 编号由端侧生成（`e${i+1}`），**只在下一次 snapshot 前有效**；按 `tabId` 存内存 `elementIndex` Map（⛔ 不落盘、不进日志）。
- `isFreshElementRef(tabId, 'e12')` 判新鲜；tab 销毁（`openBrowserTab` 的 `destroyed` / `gacode:close-browser-tab`）⇒ `clearElementIndex`。
- `resolveLiveTab`：优先 `tabId` ⇒ `url` ⇒ **最近创建**的活 tab（共用池 ⇒ agent 缺省读用户当前看的页面）；明确指定却找不到 ⇒ **不猜，报错**。

### 分页

`cursor` / `limit` 分页；**后续页不重复塞元素表**（省上下文）。
`next_cursor` **严格前进且未到全文尾**才给（⛔ 不给"假游标"——text 被裁到 0 时 `at===cursor` 不满足 `>cursor`，自然不给，避免模型 `cursor=0` 无限重读）。

### 兜底收敛（挂死血泪）

总量超 12KB 时**依次**砍 text（字符二分保证递减到空）再砍元素表，带 `guard` 上限防死循环。
⚠️ 光砍 text 不够——200 项元素表本身就可能 >12KB（实测 24KB）。
⚠️ **循环砍 text 必须用字符二分或带 guard**；早期版本 `Math.floor(byteLen*0.7)` 在汉字 + 大元素表下**挂死**（测试文件级 20s 超时，`node --test` 把整个文件当单个用例杀掉）。

### 端侧落点

| 文件 | 改动 |
|---|---|
| `electron/client-tools/browser.ts` | `SNAPSHOT_SCRIPT`（固定只读）/ `SNAPSHOT_LIMITS` / `buildElementIndex` / `buildSnapshotOutput`（三层限长+分页+兜底）/ `resolveLiveTab` / `pcBrowserSnapshot` / `elementIndex` Map + `isFreshElementRef` / `clearElementIndex` / `BrowserTabPool.evalInTab` |
| `electron/main.ts` | `setBrowserTabPool({... evalInTab})`（`view.webContents.executeJavaScript(script)`）；tab 销毁清 `elementIndex`；E2E 钩子加 `pc_browser_snapshot` |
| `electron/client-tools/executor.ts` | `pc_browser_snapshot: 30000` + switch case |
| `test/pc-browser-snapshot-m1.test.mjs`（新建） | 8 条：脚本只读 / 编号表 / 三层限长 / 分页 / fresh/clear / resolveLiveTab / ⛔参数不进JS / 失败如实回报 |

### 验证（已跑）

- `node --test test/pc-browser-snapshot-m1.test.mjs` ⇒ 8/8
- 全量 `node --test` ⇒ **431/431**
- node / web typecheck 干净；`npm run build` 全通过
- ★ **真机** `node test/e2e-browser-open.mjs` ⇒ PASS：snapshot 真抽到正文
  `"M0 OK 正文\n示例链接\n提交按钮"` + `[e1:a, e2:button, e3:input(搜索框)]`，
  顺序正确、placeholder 带出、href 不带出、`truncated:false`、`exit=0` / `stderr 0B`
