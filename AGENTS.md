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
