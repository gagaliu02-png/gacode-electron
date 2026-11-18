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
- 全量 `node --test` ⇒ **430/430**（422 老 + 8 snapshot）
- node / web typecheck 干净；`npm run build` 全通过
- ★ **真机** `node test/e2e-browser-open.mjs` ⇒ PASS：snapshot 真抽到正文
  `"M0 OK 正文\n示例链接\n提交按钮"` + `[e1:a, e2:button, e3:input(搜索框)]`，
  顺序正确、placeholder 带出、href 不带出、`truncated:false`、`exit=0` / `stderr 0B`

---

## 订正 31 · M0.5（2026-11-15 · 服务端 spec + PC 能力声明 · **全链路打通**）

> 前提：等另一个 agent 在 gaclaw 收工（`llm.executors.js` 等 6 个文件已提交进 `b558ee8`）
> 且工作区只剩 untracked 杂物 ⇒ 可以动了。

### 做了什么（两个仓各一处）

| 仓 | 改动 | 作用 |
|---|---|---|
| **gaclaw** `src/llm/client-tools.js` | 加 `CAP_BROWSER='browser'` + `PC_TOOL_SPECS` 两条 spec（`pc_browser_open` / `pc_browser_snapshot`，`capabilities:[CAP_MASTER,CAP_BROWSER]`，`timeout_ms:30000`，`kind:'none'`） | 模型**看得见**这两个工具（端声明 browser=1 才下发，L-24e/L-24f 同口径） |
| gaclaw `src/__tests__/client-tools-p1.test.js` | `GC-P1-4c` 改为「缺 browser ⇒ 仍 13 个老工具」；新增 `GC-P31-20`「声明 browser ⇒ 15 个全下发」 | 钉住新旧行为 |
| **gacode-electron** `electron/client-tools/jobCapability.ts` | `buildCapabilityString` 加可选 `browser` 标志，声明时追加 `browser=1` | 能力串上报 |
| gacode-electron `electron/client-tools/deviceClient.ts` | `deviceCapabilities()` 用 `hasBrowserTabPool()` 判 `browser`；池未接线就不声明 | ⛔ 实现了才声明，没接线别谎报 |
| gacode-electron `test/pc-background-job-b6.test.mjs` | `GC-P27-26c` 源码文本断言放宽（`job: true, browser` 也认） | 断言跟新调用形状对齐 |

### 铁律

1. ⛔ **没接线就不声明** —— `hasBrowserTabPool()` 为 false ⇒ 能力串不带 `browser=1`
   ⇒ 模型看不见 `pc_browser_*` ⇒ 不会调一个必然失败的工具（跟 L-24e「缺失即无端侧能力」同口径）。
2. ⚠️ 时序依赖：`main.ts` 在 whenReady 里**先** `setBrowserTabPool` **再**起 renderer
   ⇒ token 推来触发注册时池必然已接线，`deviceCapabilities()` 缓存不会漏报 browser。
3. **注册时机**：`deviceCapabilities()` 有 `_capabilitiesCache` ⇒ 只在**首次注册**时算一次。
4. `browser` 键**追加在 `job=1` 之后** ⇒ 老能力串逐字不变（GC-P27-22 断言不破）。

### 验证（已跑）

- gaclaw 相关 6 测试文件（client-tools ×2 / background-agent-visibility / approval ×2 / channel-tool-guard）⇒ **63/63**
- PC：M0+M1+后台作业测试 38/38；全量 `npm test` ⇒ **430/430**
- PC node/web typecheck 干净；`npm run build` 全通过
- ★ **真机 E2E** ⇒ PASS，且新增日志确认：
  `[client-tools/device] 浏览器池已接线 ⇒ 能力表声明 browser=1（pc_browser_* 可下发）`

### 现在的完整链路（模型视角）

```
模型调 pc_browser_open(url)
  → gaclaw client-execution 派单（spec 认，HIGH_RISK 自动带上）
  → unified-api 扇出设备 SSE（browser 只是能力表一个键，零改动）
  → PC executor → browser.ts → 共用 BrowserView 池 → 回 {url,title,tabId}
  → gaclaw foldClientResult → 模型看到结果
```

⛔ M0.5 只暴露 open/snapshot 两个**读类**工具；`pc_browser_act`（点击/输入）和
`pc_browser_shot`（截图）在 **M2**，危险动作分级闸门在 **M4** —— 到 M2 之前模型
**只能看不能动**，这是刻意的安全边界。

---

## P2 · 上行线（2026-11-17 · PC 端）—— disposition / 双发 ack / 安全边界停止 / 看门狗分级

> 服务端**已上线**：unified-api `08b2c9e` / gaclaw `2e28c84`。
> 跨端口径在 `../gacode-web/AGENTS.md` 的同名章节（web 端持有跨端口径）——
> 本节是 **PC 端**的落点与**只此一份**的判据位置。

### P2-1 · `disposition` —— 「这条消息去了哪」（⛔ 不许再靠状态码猜）

服务端在 `POST /yinian/sessions/:id/chat/stream` 的应答体里**明说**：

| 应答 | 体 | 含义 |
|---|---|---|
| 202 | `{ok:true, queued:true, disposition:'queued', eventId:'inbox_<id>', acceptedAt, inboxId, seq, content, attachments}` | 这条**进了会话收件箱**（排队中）⇒ **这一轮没有被发起** |
| 200（none 模式）| `{ok:true, sessionId, turnKey, terminalReason, disposition:'started'}` | 这一轮**已经起了** |

⚠️ 老的「200 + SSE 流」那条路**没有 body** ⇒ 那一路只能按「200 SSE = 服务端建了轮」
**事实推断**为 `started`（代码里注明了这是推断，不是服务端说的）。

**判据只有一份** ⇒ `src/lib/session-events.ts`（零依赖模块 ⇒ `node --test` 能直接跑）：

- `readDisposition(source)` —— 只认 `'queued'` / `'started'`；**读不到就返回 `null`**
  （老服务端没有这个字段 ⇒ 调用方**落回老启发式** `queued === true`，行为逐字不变）。
- 落点：
  - `src/lib/session-inbox.ts`（`enqueueUserMessage`）—— **优先** `disposition`，
    兜底老启发式；`EnqueueResult` 多带一个 `disposition` 字段。
  - `src/lib/chat-stream.ts`（`sendNoStream`）—— 返回类型换成 `SendNoStreamResult`
    （`{ok, turnKey, disposition, inboxId}`）⇒ **把 disposition 带出来**。
  - `src/routes/ChatDetail.tsx` —— 宿主层按 disposition 分岔：
    `'queued'` ⇒ **收掉「等首帧」的流式行**（这一轮压根没起）但**留住用户那条乐观气泡**
    ⇒ 并摆一条带 `inboxId` 的队列项。

### P2-2 · 双发 ack 的「第二次告知」 —— `user_message_processed`

```
data: {"events":[{"type":"user_message_processed","inboxId":"123","processedAt":"…"}]}
```

- `events` 在**帧的顶层**（⛔ **不是** `rich_event` 事件里）—— 认错地方就收不到；
- `type` 是**新值** ⇒ 老端**逐条跳过**它（不崩）⇒ 端侧必须**显式消费**；
- 这一帧会被 `normalizeChatChunk` 的「未知 type 跳过」规则**丢掉**
  ⇒ **必须在归一之前读**；
- 服务端把它写给该 session 的**全部** socket（发起流 / 续传 / 只读接入 / **常驻订阅**）
  ⇒ **两条路都要消费**：`src/lib/chat-stream.ts`（发起流 + 接入流）、
  `src/lib/chat-subscribe.ts`（常驻订阅）；
- 宿主层唯一处理函数：`ChatDetail.tsx` 的 `handleUserMessageProcessed`；
- ★ **本地行的键 = `inboxId`**（服务端收件箱行的 id）—— ⛔ **不是 `eventId`**
  （服务端的 `eventId` = `"inbox_<id>"`，带前缀 ⇒ 永远对不上）。
  服务端行：`inboxItems[].id` **就是** `inboxId`；端侧乐观行：入队回执的
  `messageId`（= `inboxId`）要记在乐观行上（`LocalQueueEntry.inboxId`）。
- 命中 ⇒ 那一条从「排队中」改成「**已处理**」（`QueueBar` 的 `processed`）。

### P2-3′′ · 「停止」= **硬打断**（PM 2026-11-17 拍板，最新口径）· `INTERRUPT` 只用于**插话**

- PM 原话：「用户侧的停止按钮，应该和之前一样，就是**直接打断**。」
  ⇒ **「用户按停止」恒发 `USER_STOP`**（掐上游 ⇒ 这一轮的正文 / 工具成果 / 思考**全部丢弃**）
  —— 就是 P2 之前的老行为。⇒ **「停止」按钮永远不发 `INTERRUPT`**。
- **`INTERRUPT`（软停 / 安全边界停止）真正的用途 = 插话**：PM 澄清「软停是**插话**的语义 ——
  有新内容插进来（用户发起 / 后端任务发起）时，服务端软停把上一轮收掉（产出保留），
  然后带新内容开下一轮。**这条路由服务端自己发起，端侧不需要发软停指令。**」
- 端侧纪律（`ChatDetail.tsx` 的 `handleStop`，**硬掐**那条路 = 现行行为）：
  ① `turnAcRef.current?.abort()` —— 断这一轮的叫停开关（RC-7）；
  ② `stream.abort("user")` —— 掐本地流 + 发 `DELETE …?intent=USER_STOP`
     （发起流由它自己的收尾路径发；只读接入流在这里直接发，契约 L-54 / L-55）；
  ③ `stopBackgroundWork()` —— 本会话的后台活一视同仁（§3.8）。
  ⇒ 这一轮产出（正文 / 工具成果 / 思考）**全部丢弃**。
- 保留但**当前不可达**（**保险丝**，⛔ 别删，将来插话要从这儿发）：
  `handleStop` 里那条 `intent === "INTERRUPT"` 分支 —— `resolveStopIntent()` **恒**返回
  `"USER_STOP"` ⇒ 永远进不去。分支内容（发 interrupt + 不 abort 本地流 + 不撤本地行 +
  本端自己停端侧执行）保持原样，供插话路径复用。
- 线上字节：`src/lib/cancel.ts::sendCancelDelete`（唯一构造点；`CancelIntent` 有第三种
  `"INTERRUPT"`，线上字节 = **小写** `interrupt`；query + header **双带**）。
  ⚠️ 服务端**不认识** `interrupt` 时按 legacy 处理（= 硬掐 = 老行为）⇒ **不需要能力协商**。

### P2-4′ · 看门狗：**分级 + 休眠抑制**

- 分级阶梯 `[15000, 30000, 60000, 120000]`（抄 Claude Code `Wv9` 的 `j`）
  ⇒ 静默 15s / 30s / 60s 各记一条 **warn（不算错）**，**120s 才判死**
  （老口径 = 单档 60s 判死 ⇒ 净效果：判死从 60s 推迟到 120s ⇒ 不误杀「模型在想很久」的轮次）；
- 计时口径 = **字节**（不是「完整帧」）：服务端每 ≤5s 一条 `: keepalive` **注释帧**
  ⇒ 解析器**跳过**它 ⇒ 只看帧会把「一直有流量」误判成停滞 ⇒ 误报「网络失败」；
  ⇒ 读帧层新增 `onBytes` 回调（`src/lib/chat-sse.ts`，⛔ **纯类型新增，不引运行时 import**
  —— 该文件被既有测试按「固定依赖链」加载）；
- 休眠抑制：定时器触发时若「实际经过 < 当前档位阈值 / 2」**或**「定时器比预定时刻晚醒超过阈值 / 2」
  ⇒ 判为系统挂起 / 事件循环被堵 ⇒ **不判死**、重新武装（档位不变）+ 记一条 warn；
- 判据只有一份 ⇒ `src/lib/sse-reconnect.ts`（**不在** `src/lib/sse/` 里 —— 那个目录是
  web/PC **逐字节相同**的共享层，web 端断言锁着 md5）；
- 接了看门狗的三条流：`chat-stream.ts`（发起流/续传）、`chat-subscribe.ts`（常驻订阅）、
  `notifications-sse.ts`（通知流）。

### 开关（**应急退路**，不是「要不要用新路」的门禁）

`src/lib/p2-features.ts` —— 判据只有这一份，**默认全是 `true`**（PM 2026-11-17 拍板「新路就是默认路」）：

| 键 | 默认 | 管什么 |
|---|---|---|
| `safeStop` | `true` | ⚠️ **不再作用于「停止」按钮**（停止恒 `USER_STOP`）⇒ 现在只是**将来插话 / 软停**路径的预留位 |
| `watchdogGraded` | `true` | 看门狗走 15/30/60/120 阶梯（判死 120s）|
| `watchdogSleepSuppression` | `true` | 挂起 / 事件循环被堵 ⇒ 不判死 |
| `watchdogJudgeDead` | `true` | 阶梯最后一档才判死（掐流走既有失败/降级路径）|

- ⚠️ `resolveStopIntent()` **恒返回 `"USER_STOP"`** ⇒ 改 `safeStop` **不会**改变「停止」的行为。

- 翻法（优先级从高到低）：
  ① **运行时 localStorage**（`gacode.p2.flags`，只写要覆盖的那几个键）—— 不用重新构建；
  ② **代码常量**（`P2_FLAG_DEFAULTS`）—— 改代码 ⇒ 重新构建生效（可审计、可回滚）。
- ⚠️ 三个看门狗开关与 `safeStop` **各自独立**（PM 要求分开）。

### 断言

`test/p2-uplink-pc.test.mjs`（31 条）—— disposition 优先级与兜底、ack 的帧形状与
「归一之前读」、本地行按 `inboxId` 匹配、interrupt 的双带与软停纪律、
看门狗阶梯/休眠抑制的判定表、开关默认值。

---

## T-020 · Claude Code 管控端侧工具 `pc_cc_*`（2026-11-17）

> 契约：服务端 gaclaw `src/llm/client-tools.js` 的 4 个 `pc_cc_*` spec
> （**根目录 `docs/` 不是 git 仓** ⇒ 关键条款复述在本文件 + commit message）。

### 做什么

让 agent 能看见并操作用户电脑上**正在跑的 Claude Code 会话**（尤其是 VS Code 里那些）：

| 工具 | 能力 | 副作用 |
|---|---|---|
| `pc_cc_sessions` | 列出活会话（sessionId/cwd/status/waiting_for/最近几轮） | 无 |
| `pc_cc_read` | 读某个会话的最近若干轮（正文 + 工具名） | 无 |
| `pc_cc_send` | 往会话**队列**插一条补充信息（`priority` = later/next/now） | 写 |
| `pc_cc_control` | 改名 / 订阅「空闲时通知我」 | 写 |

### 协议（逆向自 Claude Code 2.1.325 = 扩展的 `resources/native-binary/claude.exe`）

- 每个活会话在 `~/.claude/sessions/<pid>.json` 登记
  （`sessionId` / `cwd` / `status`（busy·idle·waiting·shell）/ `waitingFor` /
  `entrypoint` / `messagingSocketPath`）。
- 每会话有专属 **UDS inbox**：Windows 上是命名管道 `\.\pipe\LOCAL\cc-msg-<hex>`。
- 认证 nonce 在 `~/.claude/sessions/<pid>.<sha256(canonSock)>.key`；
  **首行必须**是 `{"type":"auth","token":"<nonce>"}\n`。
  ★ sha256 是在**全小写**的规范路径 `\.\pipe\local\cc-msg-<hex>` 上算的。
- `type:"user"` 帧 ⇒ 往目标会话队列插一条 user 消息（**不打断**当前轮）；
  正文须包 `<cross-session-message from="uds:…">…</cross-session-message>`。
- `type:"control"` 帧 + `action` ∈ `rename` / `notify_when_idle` / `peer_message_status`。
- ⛔ **UDS 里没有「批准/拒绝权限」的 action** —— 权限走 VS Code 扩展↔CLI 的
  `can_use_tool` 控制通道 ⇒ 权限闸只能走 **PreToolUse hook 桥**。

### 三条铁律

1. ⛔ **只连本机命名管道** —— UNC / 远程 / 非 pipe 路径一律拒（`isLocalPipePath`）。
2. ⛔ **凭据不出进程** —— nonce 只在内存里用，不打印 / 不落盘 / 不回传服务端。
3. ⛔ **只发 `user` / `control` 两种帧** + action 白名单 ⇒ 不给协议注入面。

### 能力键 `claude-code`

- 判据 = **`~/.claude/sessions` 目录在不在**（**不是**「此刻有没有活会话」——
  否则没开 Claude Code 的机器永远学不会用这组工具）。
- ⚠️ 跟 `job` 键同款口径：**没装 ⇒ 工具如实失败并回报**，不是「不下发」。
- ⚠️ 能力头**不得用于鉴权**（L-24e）—— 真闸门在端侧 `gate.ts`。

### 落点

| 文件 | 作用 |
|---|---|
| `electron/client-tools/claudeCodeSession.ts` | **只读**视图：会话登记 + transcript 尾部解析（slug = cwd 非字母数字全换 `-`） |
| `electron/client-tools/claudeCodePeer.ts` | **写**通道：UDS 客户端（auth 握手 / user 帧 / control 帧）+ IPC 白名单 |
| `electron/client-tools/executor.ts` | 4 个 case + 默认超时 |
| `electron/client-tools/jobCapability.ts` / `deviceClient.ts` | 能力串多 `claude-code=1` |
| `test/pc-claude-code-tools.test.mjs` | 12 例（含「只读模块不写盘」断言） |

---

## 订正 33 · PC 浏览器停靠（agent 的 BrowserView 落进 `/browser` 页的 tab 内容区）

> [2026-11-17 · T-027-d0ck] 契约来源：根目录 `TASK_BOARD.md` 的 `T-027-d0ck`
> （根目录 `docs/` 不是 git 仓 ⇒ 关键条款复述在本文件 + commit message）。
>
> ### 问题
>
> 订正 31 之前，agent 开的 BrowserView 由主进程 `setBounds(整个窗口内容区)` 落位
> ⇒ **盖住整个客户端**（侧栏 / tab 条 / 地址栏全没了），而且用户与 agent 是
> **两套系统**（用户走渲染层 `<webview>`，agent 走主进程 `BrowserView`）⇒
> 两条 tab 条各说各话。
>
> ### 三个硬事实（踩过才知道）
>
> 1. ⛔ **主进程对 React 侧栏（256px）/ tab 条 / 地址栏完全无感知** ——
>    它只拿得到裸窗口矩形 ⇒ 停靠矩形**必须由渲染层上报**
>    （`gacode:report-browser-rect` ⇒ `/browser` 页内容区的 `getBoundingClientRect()`）。
> 2. ⛔ **隐藏 tab 不能缩尺寸** —— `BrowserView` 的 bounds 就是 guest 的**视口尺寸**
>    ⇒ 缩到 0×0 会让页面重排（响应式站变形）且 `innerWidth/innerHeight` 变 0
>    ⇒ 我们自己的「视口边界校验」会把所有点击判成屏幕外。
>    ⇒ 隐藏 = **移出可视区但保持尺寸**（`parkBounds`：`x = -(w + 200)`）。
> 3. ⛔ **主进程是单实例单窗口** ⇒ 多个 gaclaw 会话**共用同一个 tab 池**
>    ⇒ 兜底选 tab 必须带会话口径，否则串台（会话 B 读到会话 A 刚开的页面）。
>
> ### 停靠契约（坐标系 = 窗口内容区左上角，单位 CSS px）
>
> | 谁 | 做什么 | 通道 |
> |---|---|---|
> | 渲染层 `/browser` 页 | 上报「内容区矩形」；离开该页时报 `null`（= 现在没有浏览器区） | `gacode:report-browser-rect` |
> | 主进程池 | 记下矩形并**重放**给已停靠的 view；`null` ⇒ 全部停泊 | `electron/browser-views.ts` |
> | 渲染层 | 切 tab ⇒ `gacode:set-browser-active-tab`（`null` = 用户切回自己的 tab ⇒ 停泊 agent 的 view） | 同名 IPC |
> | 主进程 → 渲染层 | 「新开了一个 tab」事件（agent 开的 ⇒ 用户看得见） | `gacode:browser-tab-opened` |
>
> - ⛔ **没有渲染层上报的矩形 ⇒ 绝不停靠**（兜底成「整个窗口」就是回到老毛病）
>   ⇒ 先停泊着，等渲染层选了它再显示。
> - ⚠️ 停靠矩形不合法（尺寸 ≤ 0）⇒ **忽略这次上报**（不猜默认值）。
>
> ### 跨会话口径（兜底选 tab 的顺序）
>
> 1. `tabId` / `url` 明确指定（找不到 ⇒ **不猜，报错**）；
> 2. **当前 active 的 tab**（用户此刻正看着的那页）；
> 3. **本会话**开的 tab（`origin:'agent'` 且 `sessionId` 相同）；
> 4. 最近创建的活 tab。
>
> 复用（`pc_browser_open` 命中同 url）时的优先级：**本会话 > 用户自己的 > 别的会话**。
>
> ### 端侧工具（本批新增两个「收尾」工具）
>
> | 工具 | 作用 | 备注 |
> |---|---|---|
> | `pc_browser_close` | 关掉池里的一个 tab（agent 收尾用） | ⛔ 关不掉用户自己的 `<webview>` tab |
> | `pc_browser_focus` | **切回**某个 tab（用户抢走焦点后，agent 要回到自己的页面） | trusted 输入必须先聚焦才打得中 |
>
> - 服务端 spec 在 gaclaw `src/llm/client-tools.js` 的 `PC_TOOL_SPECS`
>   （⛔ 不在 spec 里 ⇒ 模型压根调不到 ⇒ 端侧实现了也没用）。
> - ⛔ 端侧**只负责跑 + 如实回报**（L-24n / L-25q）：stdout 只回一行紧凑 JSON。
>
> ### 落点
>
> | 文件 | 作用 |
> |---|---|
> | `electron/browser-views.ts`（新） | **BrowserView 生命周期的唯一出口**（`BrowserViewPool`）：create/dock/park/focus/destroy + 几何护栏。⛔ 只 `import type` electron ⇒ `node --test` 能直接加载 |
> | `electron/main.ts` | 池接线（替掉裸 Map）+ 4 个新 IPC + `openBrowserTab(url, {origin, sessionId})` |
> | `electron/client-tools/browser.ts` | 池接口加 `focus/activate/close/activeTabId`；`pc_browser_close` / `pc_browser_focus`；兜底选 tab 换顺序 |
> | `src/lib/browser-tabs.ts`（新） | 渲染层「外部 tab」模块级 store（跨路由存活）+ `computeDockRect`（纯逻辑，可单测） |
> | `src/routes/Browser.tsx` | tab 条**合并** agent 的 tab + 内容区当停靠占位 + 上报矩形 |
> | `src/components/layout/AppShell.tsx` | 全局桥：不在 `/browser` 页也听得见 agent 开了什么；窗口在前台才跳页 |
> | `shared/types.ts` / `electron/preload.ts` | 新 IPC 的类型与暴露 |
> | `test/pc-browser-dock.test.mjs`（新） | 14 例（矩形应用 / 停泊尺寸守恒 / 不盖客户端 / 跨会话 / close / focus） |

---

## 订正 34 · T-028 —— 截图真走 LLM 识图 + 统一坐标系（2026-11-17 · PC 端）

> [2026-11-17] 契约来源：根目录 `TASK_BOARD.md` 的 `T-028-sh0t`
> （根目录 `docs/` 不是 git 仓 ⇒ 关键条款复述在本文件 + commit message）。
> 服务端那一半（图片折叠 + `PC_TOOL_SPECS`）在 gaclaw `src/llm/client-execution.js`
> 与 `src/llm/client-tools.js`。
>
> ### 问题
>
> `pc_screenshot` 以前只回一行「已截图并保存到 <本机路径>」⇒ **模型压根看不到那张图**
> （产物折叠只报文件名 + 本机路径；公开 URL 根本没进模型上下文）。
>
> ### 三条铁律
>
> 1. ⛔ **端侧绝不把图片 base64 塞进 stdout**（2026-11-13 上下文顶爆血泪）——
>    只回**公网 URL**（走现成的产物上传通路）+ **坐标块**。
> 2. ⛔ **端侧不拼模型上下文**（L-24n / L-25q）——「去调 `image_understand`」那句
>    指令由**服务端**写（gaclaw 的 `foldClientResult`），端侧只给数据。
> 3. ⛔ **上传失败就如实说**——`deviceClient.uploadArtifacts` 上传失败时往 stdout 追加
>    `[artifact_upload_failed] … ⇒ 模型看不到这张图`，不许假装成功。
>
> ### 坐标系契约（唯一定义）
>
> | 载体 | 原点 | 单位 | 附带的坐标块 |
> |---|---|---|---|
> | **浏览器** | 页面**可视区**左上角 | **CSS px** | `viewport{w,h}` + `scroll{x,y}` + `scale` + `image{w,h}` |
> | **桌面** | 主显示器左上角 | **物理像素** | `coordinate_system:'screen'` + `display{index,w,h}` + `image{w,h}` |
>
> - `scale` = **截图物理像素 / CSS px**（= `devicePixelRatio`）。
> - 元素编号 `eN` 的 `x/y` = viewport 坐标（与 `act` 的注入坐标**同源**）。
> - ★ **`@shot:px,py`** —— 「上一次截图里的像素坐标」⇒ 端侧按 `scale` 换算成
>   viewport 坐标再点 ⇒ 模型「看着截图报坐标」能直接用。
>   ⚠️ 换算后**照样过视口边界校验**（屏幕外直接拒）。
>   ⚠️ **视觉模型给的坐标不可靠** ⇒ 权威坐标永远是 DOM（`eN` / `text:`）。
> - ⚠️ **桌面暂不提供点击**（Electron 没有桌面点击 API）⇒ 桌面截图只作「看」用。
>
> ### 端侧落点
>
> | 文件 | 作用 |
> |---|---|
> | `electron/client-tools/browser.ts` | `pc_browser_shot`（截视口 ⇒ PNG ⇒ artifact + 坐标块）/ `VIEWPORT_INFO_SCRIPT` / `shotMeta` 记忆 / `convertShotCoords`（纯函数）/ `@shot:px,py` 目标 / snapshot 补 `scroll`+`scale` |
> | `electron/client-tools/executor.ts` | `pc_browser_shot` case + 超时 30s；`pc_screenshot` stdout 补坐标系块 |
> | `electron/main.ts` | 池的 `capture`（`webContents.capturePage()`）——⚠️ 视图不可见时抓到**空图** ⇒ 端侧据此如实报错 |
> | `electron/client-tools/deviceClient.ts` | 上传失败 ⇒ 往 stdout 追加「模型看不到这张图」 |
> | `test/pc-browser-shot.test.mjs`（新） | 9 例（坐标块形状 / ⛔无 base64 / 不可见如实报错 / `@shot:` 换算 / 无截图记录报错 / 屏幕外拒 / 纯函数 / snapshot 补字段） |
> | `test/e2e-browser-dock.mjs` | 真机 9 条判据（含 PNG 魔数 + 尺寸 = 视口 × dpr + `@shot:` 点中第二个按钮） |
---

## 订正 35 · T-038 · 执行器实例锁（端侧单实例，防「两个 Gacode 抢同一个结算位」）

> [2026-11-18] 事故复盘见根目录 `TASK_BOARD.md` 的 `T-038-ccdup`。
> 本节是 **PC 端的落点与判据**（跨端口径在 `../gacode-web/AGENTS.md` 同名章节）。

### 事故（一句话）

同一台电脑上同时跑着 **dev 实例**（`electron .`）与 **安装/便携版**：
两个进程**共用同一份 userData**（同一登录态 / 同一 device id / 同一审计文件）
⇒ 同一条 `pc_*` 派单被**两个进程同时执行** ⇒ 旧代码那个 400ms 就回 `{status:'sent'}`
**抢先结算** ⇒ 新代码那个等 205s 拿到真结果再上传 ⇒ **409「结果已结过」⇒ 真结果被丢弃**。

### 根因（两处）

1. **Electron 内建锁的锁键 = 调用它那一刻的 userData 路径**，
   而本仓把 userData 改到 `%APPDATA%\Gacode` 是在 **`app.whenReady()` 里**做的
   ⇒ 锁在改路径之前就拿好了 ⇒ 锁键 ≠ 最终身份。
2. 端侧的去重（`deviceClient` 的 `loadDone` + `inflight`）是**进程内**的
   ⇒ **跨进程完全无效**。

### 三条铁律

1. ⛔ **userData 必须在拿锁之前定下来** —— `app.setPath('userData', …)` 提到 module level，
   再 `app.requestSingleInstanceLock()` ⇒ 锁键 = 最终 userData。
   （实测 Electron 32 在 ready 前 `setPath('userData')` 生效。）
2. ⛔ **再加一把显式的、带身份的锁**（`electron/instance-guard.ts`）：
   锁文件 `%APPDATA%\Gacode\instance.lock`，记 `{pid, instanceId, startedAt, heartbeatAt}`；
   抢锁时判活（**心跳新鲜 或 pid 还活着**）⇒ 活着就让位，死了就接管（崩溃残留自动清理）。
   心跳 30s / 判活窗口 90s。
3. ⛔ **后启动者让位，不静默抢单**：拿不到锁 ⇒ 写「聚焦请求」文件 ⇒ **让已有实例把窗口拉到前台**
   ⇒ 自己 `app.quit()` + `process.exit(0)` ⇒ **绝不接管设备通道**（否则又是一轮抢结算）。

### 合法多实例（PM 要求「dev 与 release 不能互相锁死」）

| 场景 | userData | 锁 | device id | 结论 |
|---|---|---|---|---|
| 默认（dev 与 release 同 profile） | `%APPDATA%\Gacode` | **同一把** | 同一个 | **互斥**：只活一个 ⇒ 结构上不可能抢结算 |
| `GACODE_INSTANCE_PROFILE=dev` | `%APPDATA%\Gacode-dev` | 独立 | 独立（要重新登录） | **可以并存** ⇒ 两个 device ⇒ 服务端按 device 分发 ⇒ 不抢结算 |

⚠️ **共存 ⇒ 两个 device id** ⇒ 服务端可能把先登的那个顶掉（`device_replaced`）⇒ UI 上要说清楚。
⚠️ **老版本客户端没有这把锁** ⇒ 与新版共存期间**仍可能抢结算** ⇒ 服务端兜底（能力串 `ccresult=1`）**必须保留**。

### 落点

| 文件 | 改动 |
|---|---|
| `electron/instance-guard.ts`（新） | 纯逻辑（零 electron import）：`resolveProfile` / `readOwner` / `isOwnerAlive` / `acquireInstanceLock` / `heartbeatInstanceLock` / `releaseInstanceLock` / `requestFocus` / `consumeFocusRequest` |
| `electron/main.ts` | ① `setPath('userData')` 提到 module level（拿锁之前）② 显式锁 + 让位退出 ③ 心跳定时器（30s：续锁 + 消费聚焦请求 ⇒ 拉窗口到前台）④ `will-quit` 释放锁 + `deviceClient.disconnect()`（SSE 优雅关闭） |
| `test/pc-instance-guard.test.mjs`（新） | 11 例：首获锁 / 二次拿不到 / 心跳过期可接管 / 心跳过期但 pid 活仍算活 / 只删自己的锁 / 只有 owner 能续 / 坏锁当无主 / **默认 profile 下 dev 与 release 同锁（事故根因场景）** / profile 隔离 / 聚焦请求一次一消费 |
| `test/e2e-single-instance.mjs`（新） | 真机双实例：A 拿锁 ⇒ B 让位退出（code 0）⇒ 聚焦请求被 A 消费 ⇒ A 存活。隔离 profile，不碰真实 userData |

### 验证（已跑）

- `node --test test/pc-instance-guard.test.mjs` ⇒ **11/11**
- `npm test` ⇒ **615/615**
- `npx tsc --noEmit -p tsconfig.node.json --composite false` ⇒ 仅剩 **1 个与本次无关的既有错误**
  （`client-tools/jobReporter.ts:139` `cancelledByUser` 不在 `JobReportPayload` —— T-030 遗留，非本次引入）
- `npm run build` ⇒ 三段通过
- ★ **真机** `node test/e2e-single-instance.mjs` ⇒ **PASS**
  （A 拿锁 / B 让位退出 code=0 / 聚焦请求被消费 / A 存活）
