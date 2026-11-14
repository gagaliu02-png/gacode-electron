// [2026-11-04 · 批 G10] PC 输入框右侧「重新生成」(↺) 态的**删除**回归断言
//
// ---------------------------------------------------------------------------
// 现象 (gaga 2026-11-04 截图 + 原话「对话已经结束以后为啥一直在重试的状态」)
// ---------------------------------------------------------------------------
//   对话早就答完了, 输入框右侧却一直是一个橙色 ↺ 圆钮 (看着像卡在"重试"态),
//   而且**发送键被它顶掉了** —— 点它会重跑上一条回答, 发新消息只能按 Enter。
//
//   根因: PC 的输入框右侧是**三态**按钮 (阶段 8 chat-id-19):
//     - 流式中            → stop (红)
//     - 非流式 + canRerun → rerun (橙)   ← canRerun = 最后一条是 assistant 且有正文
//     - 其余              → send (橙)
//   ⇒ 每轮答完立刻变 ↺, 而且**永远变不回来** (canRerun 条件恒成立)。
//
//   判据 = web / 安卓 (两端都没有这个状态; web 输入框右侧只有 附件/停止/发送)
//        ⇒ gaga 2026-11-04 拍板: **直接删掉** 这个按钮, 输入框回到 stop / send 两态。
//
//   ⚠️ 「真·错误重试」是另一条链路 (StreamingErrorBanner 的「重试」文字按钮)
//      —— **必须留着**, 本文件有一条断言钉住它。
//
// 运行: node --test test/pc-no-rerun-button.test.mjs   (完全离线: 不连网、不渲染 React)

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { stripComments } from "../scripts/lib/strip-comments.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");
/** 去注释后的源码 —— 断言只看**代码**, 不被注释喂饱 (本仓注释密度很高) */
const repoCode = (p) => stripComments(repoSrc(p));

const INPUT_BAR = "src/components/chat/ChatInputBar.tsx";
const DETAIL = "src/routes/ChatDetail.tsx";
const BANNER = "src/components/chat/StreamingErrorBanner.tsx";

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

/** 遍历 AST 找第一个满足 pred 的节点。 */
function findNode({ sf }, pred) {
  let found = null;
  const visit = (node) => {
    if (found) return;
    if (pred(node)) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

// ── GC-G10-1 · 输入框组件里不再有 rerun 态的任何痕迹 ──────────────────────
test("GC-G10-1 输入框组件不再声明/渲染「重新生成」态", () => {
  const src = repoCode(INPUT_BAR);
  for (const needle of ["canRerun", "onRerun", "rerun-button", "RotateCcwIcon"]) {
    assert.equal(
      src.includes(needle),
      false,
      `${INPUT_BAR} 不该再出现「${needle}」—— 重新生成态已删除 (2026-11-04)`,
    );
  }
});

// ── GC-G10-2 · 宿主层也不再算 canRerun / 不再传 onRerun ───────────────────
test("GC-G10-2 ChatDetail 不再算 canRerun, 也不再传 onRerun", () => {
  const src = repoCode(DETAIL);
  assert.equal(src.includes("canRerun"), false, `${DETAIL} 不该再有 canRerun`);
  assert.equal(src.includes("handleRerun"), false, `${DETAIL} 不该再有 handleRerun`);
});

// ── GC-G10-3 · 右侧按钮回到两态 (stop / send), 没有第三个分支 ────────────
//
// ★ [2026-11-14 · 订正 28 · W5] 判据从「isStreaming」扩成**会话级状态机**
//   (`resolveChatAction`: 主 agent 轮次 **或** 后台活在跑 ⇒ 停止; 输入框有字 ⇒ 发送)。
//   ⇒ 本条断言跟着改: **两态**这件事不变（不许再冒出第三个态），
//   变的是「什么时候是 stop」—— 现在由状态机说了算。
test("GC-G10-3 输入框右侧按钮只有 stop / send 两态", () => {
  const { src, sf } = makeSource(INPUT_BAR);

  // 找到按钮那个条件表达式 —— then 里含「停止生成」的那个
  const cond = findNode(
    { sf },
    (n) =>
      ts.isConditionalExpression(n) &&
      n.whenTrue.getText(sf).includes("停止生成"),
  );
  assert.ok(cond, `${INPUT_BAR}: 找不到 (stop) : (send) 的按钮三元`);

  const thenText = cond.whenTrue.getText(sf);
  const elseText = cond.whenFalse.getText(sf);
  assert.match(thenText, /aria-label="停止生成"/, "then 分支必须是「停止生成」");
  assert.match(elseText, /aria-label="发送"/, "else 分支必须是「发送」");
  assert.equal(
    elseText.includes("重新生成"),
    false,
    "else 分支里不该再有「重新生成」按钮 (它会把发送键顶掉)",
  );
  // 三元表达式里没有第三个分支 —— 整个节点文本不该出现「重新生成 / RotateCcw」
  const whole = src.slice(cond.getStart(sf), cond.end);
  assert.equal(whole.includes("RotateCcwIcon"), false, "按钮三元里不该再引 rerun 图标");
  assert.equal(whole.includes("重新生成"), false, "按钮三元里不该再有「重新生成」文案");
  // ★ 判据来自**状态机**（订正 28）—— 不许又退回「只看 isStreaming」。
  assert.match(
    cond.condition.getText(sf).replace(/\s+/g, " "),
    /action\.action\s*===\s*"stop"/,
    "按钮的判据必须是 resolveChatAction 的结果 (action.action === 'stop')",
  );
});

// ── GC-G10-3b · 状态机本身 (订正 28 · W5) 的**可执行**断言 ──────────────
//   §3.7 那张表是产品契约 ⇒ 必须是纯函数 + 可单测 (不许塞进组件里靠人肉读)。
test("GC-G10-3b 按钮状态机按 §3.7 那张表判 (纯函数)", async () => {
  const { resolveChatAction } = await import("../src/lib/chat-action.ts");

  // 在跑 + 空 ⇒ 停止（停本会话的一切）
  let d = resolveChatAction({ turnRunning: true, pendingWork: false, hasText: false });
  assert.equal(d.action, "stop");
  assert.equal(d.effect, "stop-everything");

  // 在跑 + 有字 ⇒ 发送（进队列，不打断）
  d = resolveChatAction({ turnRunning: true, pendingWork: true, hasText: true });
  assert.equal(d.action, "send");
  assert.equal(d.effect, "queue");

  // 不在跑 + 后台活还在跑 + 空 ⇒ 停止（只停后台活）
  d = resolveChatAction({ turnRunning: false, pendingWork: true, hasText: false });
  assert.equal(d.action, "stop");
  assert.equal(d.effect, "stop-everything");

  // 不在跑 + 后台活还在跑 + 有字 ⇒ 发送（进队列）
  d = resolveChatAction({ turnRunning: false, pendingWork: true, hasText: true });
  assert.equal(d.action, "send");
  assert.equal(d.effect, "queue");

  // 不在跑 + 全停 + 有字 ⇒ 发送（直接发，起新轮）
  d = resolveChatAction({ turnRunning: false, pendingWork: false, hasText: true });
  assert.equal(d.action, "send");
  assert.equal(d.effect, "send-now");

  // ⛔ 只有两态：任何输入组合下 action 都只能是 stop / send
  for (const turnRunning of [true, false]) {
    for (const pendingWork of [true, false]) {
      for (const hasText of [true, false]) {
        const r = resolveChatAction({ turnRunning, pendingWork, hasText });
        assert.ok(
          r.action === "stop" || r.action === "send",
          `出现了第三态: ${r.action}`,
        );
      }
    }
  }
});

// ── GC-G10-4 · 真·错误重试链路必须还在 (StreamingErrorBanner 的「重试」） ──
test("GC-G10-4 错误重试链路仍在: banner 的「重试」按钮 + handleRetry 兜底", () => {
  const banner = repoCode(BANNER); // 去注释 —— 文件头的说明注释里也有「重试」二字
  assert.match(banner, /重试/, `${BANNER} 必须保留「重试」按钮 (这是真·错误重试)`);
  assert.match(banner, /onClick=\{onRetry\}/, `${BANNER} 的重试按钮必须仍能点`);

  const { src, sf } = makeSource(DETAIL);
  const retry = findNode(
    { sf },
    (n) =>
      ts.isVariableDeclaration(n) &&
      n.name.getText(sf) === "handleRetry" &&
      n.initializer &&
      ts.isCallExpression(n.initializer),
  );
  assert.ok(retry, `${DETAIL}: 找不到 handleRetry`);

  const body = retry.initializer.getText(sf);
  assert.match(
    body,
    /reconstructLastUserSubmission\(/,
    "handleRetry 必须在 ref 为空时从历史重构上一条 user 消息 (页面重载后也能重试)",
  );
});
