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
