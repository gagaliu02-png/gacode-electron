// [2026-11-13] PC「新建会话不出 LLM 标题」的**接线**回归断言
//
// ---------------------------------------------------------------------------
// gaga 2026-11-13 报障: 「PC端发起的新session，LLM给这个session起标题功能没有走通」。
//
// 根因（**全在客户端**，服务端跟 PC/web 一视同仁）:
//   旧写法是三个坑叠在一起 ⇒ auto-title 请求**根本发不出去**:
//     ① 一次性 latch（`autoTitleFiredRef`）—— 第一次满足条件后，同一个会话
//        再也不会重试（哪怕那次请求压根没发出去）。
//     ② 等「客户端 history 里有 user 消息」才武装定时器 —— 而 PC **发消息时不刷
//        history**（history 只在终态帧之后 invalidate）⇒ 定时器要等整轮跑完
//        才武装得上。
//     ③ 武装之后 effect 重跑（deps 里的 `currentChat` 换对象 —— 终态帧后
//        `invalidateQueries(["chats"])` 会换）⇒ cleanup 把定时器 `clearTimeout`
//        打死 ⇒ ① 的 latch 又挡住重试 ⇒ 请求永远发不出去。
//
// ⇒ 改成跟安卓同款：**发消息就武装**；定时器存 ref（不随 effect 重跑被清）。
//
// ⚠️ 这些断言只看**代码形状**（不渲染 React）。
//
// 运行: node --test test/pc-auto-title.test.mjs   (完全离线)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "../scripts/lib/strip-comments.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");
const repoCode = (p) => stripComments(repoSrc(p));

const DETAIL = "src/routes/ChatDetail.tsx";

test("① 不许有一次性 latch（第一次触发失败 ⇒ 这个会话永远起不了标题）", () => {
  const code = repoCode(DETAIL);
  assert.ok(
    !code.includes("autoTitleFiredRef"),
    "不许再有 autoTitleFiredRef 这种一次性 latch —— 它会让「第一次没发出去」变成终身失败",
  );
  assert.ok(
    !/autoTitleFiredRef\.current\s*=\s*true/.test(code),
    "不许再把「已触发」永久置位",
  );
});

test("② 定时器存 ref（effect 重跑时的 cleanup 杀不掉它）", () => {
  const code = repoCode(DETAIL);
  assert.ok(
    code.includes("autoTitleTimerRef"),
    "auto-title 的定时器必须存在 ref 里（存局部变量的话，effect cleanup 会 clearTimeout 掉它）",
  );
  assert.ok(
    code.includes("armAutoTitle"),
    "必须有 armAutoTitle（武装一次 auto-title）",
  );
});

test("③ 发消息就武装（服务端收到 stream 请求时已经落了 user 行）", () => {
  const code = repoCode(DETAIL);
  assert.ok(
    /void startStream\(text, attachments\);[\s\S]{0,400}armAutoTitle\(chatId\)/.test(
      code,
    ),
    "handleSubmit 里发完流必须武装 auto-title（跟安卓 ChatDetailViewModel.kt:1769 同款）",
  );
});

test("④ 端点跟 web 一致：POST /yinian/sessions/:id/auto-title", () => {
  const api = repoCode("src/lib/api.ts");
  assert.ok(
    api.includes("/yinian/sessions/${id}/auto-title"),
    "必须有 auto-title 端点",
  );
  const detail = repoCode(DETAIL);
  assert.ok(
    detail.includes("autoTitleSession("),
    "ChatDetail 必须调 autoTitleSession",
  );
});

test("⑤ 成功后刷新会话列表（标题才会出现在侧栏 / 头部）", () => {
  const code = repoCode(DETAIL);
  assert.ok(
    /autoTitleSession\([^)]*\)[\s\S]{0,300}invalidateQueries\(\{\s*queryKey:\s*\["chats"\]/.test(
      code,
    ),
    "auto-title 成功后必须 invalidate([\"chats\"])（标题要刷新）",
  );
});
