// [批 G13-4 · 2026-11-08] PC 端跨端续接的两个症状 —— **切会话后接不上** + **停止键不亮**.
//
// ---------------------------------------------------------------------------
// 现象 (gaga 2026-11-08 真机报障, 原话)
// ---------------------------------------------------------------------------
//   「PC端则是只有第一次点击 session 会加载 SSE 内容，后面的 SSE 内容进来了不会变」
//   「PC端和 web 端的暂停按钮状态都不会变」
//
// ---------------------------------------------------------------------------
// 根因 (两个症状是**同一个** bug)
// ---------------------------------------------------------------------------
//   `localRowIdRef` 是**组件级 ref** —— 切 chatId 的那个 effect 复位了 6 个 useState,
//   却**没复位这个 ref**。而 `ensureRow()` 第一行是
//   `if (localRowIdRef.current) return;` ⇒
//
//     切到第二个会话 ⇒ ref 还是上个会话的 `attach-<旧id>`
//     ⇒ ensureRow() 永远早退
//     ⇒ setStreamingAssistantId 永远不调
//     ⇒ 内容写进了 state 却**没有行可挂** (messages useMemo: `if (!streamingAssistantId) return`)
//     ⇒ 界面纹丝不动
//     ⇒ isStreaming 恒 false ⇒ **停止按钮永远不亮**。
//
//   为什么「只有第一次」中招: 侧栏点会话走 `navigate('/chat/'+id)`, 那条路由**没有 key**
//   ⇒ ChatDetail 不重挂载 ⇒ ref 跨会话存活。
//
// ---------------------------------------------------------------------------
// 第二个断言: 接入态按「停止」必须**掐上游那一轮**
// ---------------------------------------------------------------------------
//   契约 L-54「任何在线端 (**含只读接入端**) 都能中止」
//   契约 L-55(1)「中止必须**掐上游** (gaclaw 那一轮停)」
//   ⇒ 只读接入端按停止 ⇒ 发 DELETE intent=USER_STOP。
//   ⛔ 只 abort 本地读流 ⇒ 服务端继续烧 token 跑完整轮并落库 ⇒ 界面显示已停 = 界面骗人。
//
// 运行: node --test test/pc-attach-stop-and-session-switch.test.mjs
//       (完全离线: 不连网、不渲染 React)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "../scripts/lib/strip-comments.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");
/** 去注释后的源码 —— 断言只看**代码**, 不被注释喂饱 (本仓注释密度很高)。 */
const repoCode = (p) => stripComments(repoSrc(p));

const DETAIL = "src/routes/ChatDetail.tsx";
const STREAM = "src/lib/chat-stream.ts";

// ---------------------------------------------------------------------------
// helper: 找出所有 `useEffect(() => {…}, [chatId])`
// ---------------------------------------------------------------------------

/** 所有依赖 [chatId] 的 effect 的**函数体**。 */
function chatIdEffectBodies(code) {
  const bodies = [];
  const re = /useEffect\(\s*\(\s*\)\s*=>\s*\{/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    // 从 `{` 开始做括号配平, 找 effect 的结尾
    let i = m.index + m[0].length - 1; // 指向 `{`
    let depth = 0;
    for (; i < code.length; i++) {
      const c = code[i];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = code.slice(m.index + m[0].length, i);
    const tail = code.slice(i + 1, i + 80);
    if (/,\s*\[\s*chatId\s*\]\s*\)/.test(tail)) bodies.push(body);
  }
  return bodies;
}

// ---------------------------------------------------------------------------
// ① 切会话 ⇒ 本机的「流式行 id」必须复位
// ---------------------------------------------------------------------------

test("① 切 chatId 的 effect 必须复位 localRowIdRef (否则第二个会话永远接不上)", () => {
  const code = repoCode(DETAIL);
  const bodies = chatIdEffectBodies(code);
  assert.ok(bodies.length > 0, "找不到依赖 [chatId] 的 effect");

  const resetsRowId = bodies.some((b) =>
    /localRowIdRef\.current\s*=\s*null/.test(b),
  );
  assert.ok(
    resetsRowId,
    "⛔ 切会话必须 `localRowIdRef.current = null` —— 否则 ensureRow() 永远早退 " +
      "⇒ 内容没行可挂 + 停止键不亮 (gaga 2026-11-08 报障)",
  );
});

test("①b 切会话还要复位正文/阶段的 ref (否则新会话正文接在旧会话后面)", () => {
  const code = repoCode(DETAIL);
  const bodies = chatIdEffectBodies(code);
  assert.ok(
    bodies.some((b) => /streamingContentRef\.current\s*=\s*""/.test(b)),
    "⛔ streamingContentRef 跨会话存活 ⇒ 新会话正文会接在旧正文后面",
  );
  assert.ok(
    bodies.some((b) => /streamingPhasesRef\.current\s*=\s*\[\]/.test(b)),
    "⛔ streamingPhasesRef 跨会话存活 ⇒ 新会话阶段会接在旧阶段后面",
  );
});

test("①c 切会话必须复位 stalled / turnKey / turnMeta (漏一个就复发)", () => {
  const code = repoCode(DETAIL);
  const bodies = chatIdEffectBodies(code);
  // ① stalled 漏复位 ⇒ isStreaming = !!streamingAssistantId && !streamingStalled
  //   ⇒ **停止键不亮** (跟 ① 同一个症状, 根因不同, 必须单独钉)。
  assert.ok(
    bodies.some((b) => /setStreamingStalled\(false\)/.test(b)),
    "⛔ streamingStalled 跨会话存活 ⇒ 新会话的停止键不亮",
  );
  // ② turnKey 漏复位 ⇒ 新会话建行带上**上个会话的轮次身份** ⇒ 历史合并配错轮次 ⇒ 空气泡。
  assert.ok(
    bodies.some((b) => /setStreamingTurnKey\(null\)/.test(b)),
    "⛔ streamingTurnKey 跨会话存活 ⇒ 新会话的行会配到别的轮次上 (空气泡)",
  );
  assert.ok(
    bodies.some((b) => /streamingTurnKeyRef\.current\s*=\s*null/.test(b)),
    "⛔ state 复位了但 ref 镜像没复位 ⇒ 下一帧旧身份又冒回来",
  );
  assert.ok(
    bodies.some((b) => /setStreamingTurnMeta\(EMPTY_STREAMING_TURN_META\)/.test(b)),
    "⛔ 四要素跨会话存活 ⇒ 新会话显示的是上一轮的四要素",
  );
});

// ---------------------------------------------------------------------------
// ② 接入态按「停止」必须掐上游那一轮 (契约 L-54 / L-55)
// ---------------------------------------------------------------------------

test("② 只读接入流按停止 ⇒ 发 DELETE intent=USER_STOP (掐上游那一轮)", () => {
  const code = repoCode(STREAM);
  assert.match(
    code,
    /sendCancelDelete\(\s*active\.sessionId\s*,\s*"USER_STOP"\s*\)/,
    "⛔ 接入态中止必须发 USER_STOP —— 只 abort 读流停不掉服务端那一轮 (界面骗人)",
  );
});

test("②b ActiveStream 必须带 sessionId (中止时按会话发 DELETE)", () => {
  const code = repoCode(STREAM);
  assert.match(
    code,
    /interface ActiveStream[\s\S]{0,2000}?sessionId\s*:\s*string\s*;/,
    "⛔ ActiveStream 缺 sessionId ⇒ 中止时不知道该取消哪个会话",
  );
  // attach 那一条也要填 sessionId
  assert.match(
    code,
    /ownsTurn\s*:\s*false\s*,[\s\S]{0,200}?sessionId\s*:\s*opts\.sessionId/,
    "⛔ attach 的 ActiveStream 必须填 sessionId",
  );
});

test("②c 发起流仍然靠 userStopped 走它自己的收尾 (别把两条路搅在一起)", () => {
  const code = repoCode(STREAM);
  assert.match(
    code,
    /if\s*\(\s*active\.ownsTurn\s*\)\s*\{[\s\S]{0,200}?userStopped\s*=\s*true/,
    "发起流的中止仍要置 userStopped (它的 finally 负责发 USER_STOP)",
  );
});

// ---------------------------------------------------------------------------
// ③ 流式行必须带轮次身份 (空气泡根治点, 与 web 同款)
// ---------------------------------------------------------------------------

test("③ 流式那一行必须带 turnKey (与历史行的 metadata.turnKey 同值)", () => {
  const code = repoCode(DETAIL);
  assert.match(
    code,
    /turnKey\s*:\s*streamingTurnKey\s*\?\?\s*null/,
    "⛔ 流式行不带 turnKey ⇒ 「是不是同一轮」只能靠猜 ⇒ 空气泡",
  );
});

// ---------------------------------------------------------------------------
// ④ 停止键亮灭的判据: 接上流 ⇒ streamingAssistantId 非空 ⇒ isStreaming 为 true
// ---------------------------------------------------------------------------

test("④ isStreaming 判据是 streamingAssistantId ⇒ ① 修好后停止键就会亮", () => {
  const code = repoCode(DETAIL);
  assert.match(
    code,
    /const isStreaming\s*=\s*!!streamingAssistantId\s*&&\s*!streamingStalled/,
    "isStreaming 的判据变了 ⇒ ① 的修复就落不到停止键上 (钉住判据本身)",
  );
});
