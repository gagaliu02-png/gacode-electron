// [2026-11-02 · 批 G8] PC 端**对标安卓体验**（外观像 web）—— 4 条 bug 的回归断言
//
// ---------------------------------------------------------------------------
// gaga 2026-11-02 反馈的 4 条 PC 问题 + 各自的根因（都已定位到行）
// ---------------------------------------------------------------------------
//   bug1 抽屉里的 chat list 不刷新, 新建的 session 不出现, 要重新登才看得见
//        ⇒ 根因: PC 侧栏 ["chats"] 只靠 60 秒轮询; 而 ["chats"] 的失效刷新
//          **只挂在 auto-title 成功路径**上 (ChatDetail.tsx:2076) ⇒ 标题不需要
//          自动命名时**永远不刷新**。web 走的是「聚焦即重拉」(react-query 默认
//          staleTime 0 + refetchOnWindowFocus), 安卓是抽屉按需 refresh()。
//        ⇒ 修: 侧栏加 refetchOnWindowFocus; 终态帧后再补一次**延迟**刷新
//          (终态那一刻服务端还没落库, webhook 还要 ~1s —— 早刷新拉回的是旧列表)。
//
//   bug2 发送的消息不会立刻显示到页面上
//        ⇒ 根因: PC **没有乐观上屏** —— 消息要等服务端 history 回来才出现。
//          安卓的判据是 sendInternal **立刻写 user 行**(REPLACE), web 是先插临时 user 行。
//        ⇒ 修: pendingUserMsg —— 发送即插本地 user 行; 服务端那一行到了自动撤掉。
//
//   bug3 一直在让我重试
//        ⇒ 根因: 与 web「输入框锁死」**同一个根因**(ACK 死等): 服务端 v2 终态帧
//          广播完不关流, 等 client 的 ACK_DONE 才 close; 而 ACK 只在 finally 里发
//          (= 响应结束之后) ⇒ 互等 ⇒ PC 的 watchdog(60s 无事件) 掐流重连 ⇒ 这轮
//          已结束、重连接不上 ⇒ 判错误 ⇒ 弹重试条。
//        ⇒ 修: 见到轮次终态帧就**立刻**发 ACK_DONE (闸口保证只发一次)。
//
//   bug4 工具调用信息浮在气泡**外面** (截图里 weather / weather 完成 两块在答案气泡上方)
//        ⇒ 根因: PC 的 MessageBubble 是**自写**的另一套 (748 行 vs web 656),
//          富事件渲染在气泡容器**外面**; web/安卓都在气泡**里面**。
//        ⇒ 修: 富事件挪进气泡容器内部 (对齐 web MessageBubble.tsx:451 / 安卓 events 参数)。
//
// 运行: node --test test/pc-parity-web.test.mjs   (完全离线: 不连网、不渲染 React)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");

const CHAT_STREAM = "src/lib/chat-stream.ts";
const BUBBLE = "src/components/chat/MessageBubble.tsx";
const DETAIL = "src/routes/ChatDetail.tsx";
const SHELL = "src/components/layout/AppShell.tsx";

/**
 * 按**节点类型**精确抠取 (不是「第一个包含 needle 的大块」—— 那会把别处的
 * 同名调用一起兜进来, 断言看着过、变异打不红)。
 */
function makeSource(fileName) {
  const src = repoSrc(fileName);
  const sf = ts.createSourceFile(
    fileName,
    src,
    ts.ScriptTarget.ES2022,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  return { src, sf };
}

/** 条件文本**恰好**等于 condText 的那个 if 语句的 then 块。 */
function extractIfThenByCond({ src, sf }, condText) {
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (ts.isIfStatement(node)) {
      const cond = node.expression ?? node.condition;
      if (cond) {
        const text = src.slice(cond.getStart(sf), cond.end).replace(/\s+/g, " ");
        if (text === condText && node.thenStatement) {
          found = src.slice(node.thenStatement.getStart(sf), node.thenStatement.end);
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

/** className 属性里含 cls 的那个 JSX 元素（含其子树）。 */
function extractJsxByClassName({ src, sf }, cls) {
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (ts.isJsxElement(node)) {
      const attrs = node.openingElement.attributes;
      // ⚠️ NodeArray 在这个 TS 版本上不是真 Array ⇒ 用下标遍历 (for..of 会抛
      //    "attrs is not iterable")。
      for (let i = 0; i < attrs.length; i++) {
        const a = attrs[i];
        if (!ts.isJsxAttribute(a)) continue;
        if (a.name.text !== "className") continue;
        const t = a.initializer ? src.slice(a.initializer.getStart(sf), a.initializer.end) : "";
        if (t.includes(cls)) {
          found = src.slice(node.getStart(sf), node.end);
          return;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

/** 含 needle 的**对象字面量**（如 useQuery 的参数对象）。 */
function extractObjectLiteral({ src, sf }, needle) {
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (ts.isObjectLiteralExpression(node)) {
      const text = src.slice(node.getStart(sf), node.end);
      if (text.includes(needle)) {
        found = text;
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  return found;
}

// ---------------------------------------------------------------------------
// GC-G8-1 (bug3): ACK_DONE 见到终态帧就发, 且只发一次
// ---------------------------------------------------------------------------
test("GC-G8-1 见到轮次终态帧就立刻发 ACK_DONE (不等流结束) + 只发一次", () => {
  const src = repoSrc(CHAT_STREAM);

  // ① 累加器: 必须有「只发一次」闸口 + aborted/sawCancel 两个守卫
  const senderIdx = src.indexOf("const sendAckDoneOnce = () => {");
  assert.ok(senderIdx > 0, "抠不到 ACK 发送器 (sendAckDoneOnce)");
  const sender = src.slice(senderIdx, src.indexOf("};", senderIdx) + 2);
  assert.ok(
    /if \(ackDoneSent\) return;/.test(sender),
    "★ ACK 必须有「只发一次」闸口 (终态帧那一路 + finally 兜底不重复发)"
  );
  assert.ok(
    /ac\.signal\.aborted/.test(sender),
    "★ 用户中止时不许发 ACK_DONE (那是 USER_STOP 的事)"
  );
  assert.ok(
    /sawCancel/.test(sender),
    "★ 收到过取消帧时不许发 ACK_DONE"
  );
  assert.ok(
    /sendCancelDelete\(opts\.sessionId, "ACK_DONE"\)/.test(sender),
    "★ ACK_DONE 必须真的发出去"
  );

  // ② 终态帧分支: 必须调用那个发送器 (而不是只在 finally 里发)
  const terminalBranch = extractIfThenByCond(makeSource(CHAT_STREAM), "isTerminalDone(chunk)");
  assert.ok(terminalBranch, "抠不到「见到轮次终态帧」的分支");
  assert.ok(
    /sendAckDoneOnce\(\)/.test(terminalBranch),
    "★ 见到轮次终态帧就**立刻** ACK —— 否则与服务端互等 (服务端等 ACK 才关流)" +
      "⇒ PC 的 watchdog 掐流重连 ⇒ 这轮已结束、重连接不上 ⇒ 一直弹重试条 (bug3)"
  );

  // ③ finally 的兜底必须走同一个闸口 (不能直接再发一次)
  //   ⚠️ 锚在 "watchdog.disarm()" 上 —— 这个文件里不止一个 `} finally {`
  const finallyIdx = src.indexOf("watchdog.disarm();");
  assert.ok(finallyIdx > 0, "抠不到读流的 finally 块 (watchdog.disarm)");
  const finallyBlock = src.slice(finallyIdx, finallyIdx + 1200);
  assert.ok(
    /sendAckDoneOnce\(\)/.test(finallyBlock),
    "★ finally 的兜底路径要走同一个闸口 (否则 ACK 会发两次)"
  );
});

// ---------------------------------------------------------------------------
// GC-G8-2 (bug4): 富事件渲染在气泡**容器内部**
// ---------------------------------------------------------------------------
test("GC-G8-2 富事件气泡在 assistant 气泡容器内部 (对标 web / 安卓)", () => {
  const src = repoSrc(BUBBLE);
  const lines = src.split(/\r?\n/);
  const indentOf = (l) => (l.match(/^\s*/) || [""])[0].length;

  // 气泡容器 = 带 rounded-bl-[4px] 的那个 div (PC 的 assistant 气泡)
  const bubbleLine = lines.findIndex(
    (l) => l.includes("rounded-bl-[4px]") && l.includes("<div")
  );
  assert.ok(bubbleLine >= 0, "抠不到 assistant 气泡容器 (rounded-bl-[4px])");
  const bubbleIndent = indentOf(lines[bubbleLine]);

  // 每一处 <RichEventBubble 都必须**缩进更深** (⇒ 在气泡容器内部)
  const evLines = lines
    .map((l, i) => ({ l, i }))
    .filter((x) => x.l.includes("<RichEventBubble"));
  assert.ok(evLines.length > 0, "源码里一处 <RichEventBubble 都没有 (渲染层被删了?)");
  for (const { l, i } of evLines) {
    assert.ok(
      i > bubbleLine && indentOf(l) > bubbleIndent,
      `★ RichEventBubble (第 ${i + 1} 行) 必须渲染在气泡容器**内部** —— ` +
        "旧实现渲染在容器外面, 工具卡片就浮在答案气泡上方 (gaga 2026-11-02 反馈 bug4)",
    );
  }
});

// ---------------------------------------------------------------------------
// GC-G8-3 (bug2): 乐观上屏 —— 发送即插本地 user 行
// ---------------------------------------------------------------------------
test("GC-G8-3 发送即插本地 user 行 (乐观上屏, 对标安卓 sendInternal 立刻写 user 行)", () => {
  const src = repoSrc(DETAIL);

  // ① 有 pendingUserMsg 状态
  assert.ok(
    /const \[pendingUserMsg, setPendingUserMsg\] = useState</.test(src),
    "★ 要有 pendingUserMsg 状态 (乐观上屏那一行)"
  );

  // ② startStream 里立刻写入 (不等服务端 history)
  assert.ok(
    /const startStream = useCallback\([\s\S]{0,4000}?setPendingUserMsg\(\{/.test(src),
    "★ startStream 必须**立刻** setPendingUserMsg —— 否则发出去的消息要等服务端" +
      "history 回来才上屏 (bug2)"
  );

  // ③ messages 列表把它拼进去 (且服务端那一行到了就撤掉)
  const messagesMemo = src.slice(
    src.indexOf("const messages: ChatMessageModel[]"),
    src.indexOf("const messages: ChatMessageModel[]") + 6000,
  );
  assert.ok(messagesMemo.length > 100, "抠不到 messages 列表");
  assert.ok(
    /pendingUserMsg/.test(messagesMemo),
    "★ messages 列表必须把乐观上屏那一行拼进去"
  );
  assert.ok(
    /role === "user" && m\.content === pendingUserMsg\.content/.test(messagesMemo),
    "★ 服务端那一行到了要**自动撤掉**临时行 (同内容判据) ⇒ 不能出现两行一样的 user 消息"
  );
});

// ---------------------------------------------------------------------------
// GC-G8-4 (bug1): 会话列表「聚焦即刷新」+ 终态后延迟再刷一次
// ---------------------------------------------------------------------------
test("GC-G8-4 会话列表聚焦即刷新 + 终态后等服务端落库再刷一次", () => {
  // ① 侧栏 ["chats"]: 聚焦即重拉 (web Drawer.tsx 同款)
  const chatsQuery = extractObjectLiteral(makeSource(SHELL), 'queryKey: ["chats"]');
  assert.ok(chatsQuery, "抠不到侧栏的 [\"chats\"] query");
  assert.ok(
    /refetchOnWindowFocus: true/.test(chatsQuery),
    "★ 侧栏会话列表要「聚焦即刷新」(对标 web Drawer.tsx) —— 旧口径只有 60 秒轮询," +
      "新建的会话要等最多 60 秒才出现 (bug1)"
  );
  assert.ok(
    /staleTime: 0/.test(chatsQuery),
    "★ staleTime 必须是 0 (react-query 默认) —— 否则聚焦时看到的是 stale 缓存"
  );

  // ② 终态帧后补一次**延迟**刷新 (终态那一刻服务端还没落库)
  const terminalBranch = extractIfThenByCond(makeSource(DETAIL), "isTerminalDone(chunk)");
  assert.ok(terminalBranch, "抠不到终态帧分支");
  assert.ok(
    /setTimeout\([\s\S]{0,200}invalidateQueries\(\{ queryKey: \["chats"\] \}\)/.test(terminalBranch),
    "★ 终态帧后要补一次**延迟**的 [\"chats\"] 刷新 —— 终态那一刻服务端还没落库" +
      "(webhook 还要 ~1s), 早刷新拉回来的是旧列表 (bug1)"
  );
});
