/**
 * T-138 · PC 助手气泡「流走完后内容消失一下」的回归钉（源码不变量）。
 *
 * 这个 bug 的修法是纯 UI 状态机（终态冻结行 + 递增刷新），
 * 没法像后端那样跑协议模拟 ⇒ 用源码断言钉死「关键代码还在」：
 *   ① 终态分支必须先冻结内容再 `clearLocalRow()`
 *   ② 冻结行参与 messages 组装，且与服务端同 turnKey 行**取较长正文**（安卓同款）
 *   ③ 刷新是**递增重试**（1s/3s/6s/10s），不是「固定 2000ms 一次」
 *   ④ 正文到齐才撤冻结行（且有最终兜底，不许永久粘着）
 *   ⑤ 换会话 / 卸载时清理冻结行与定时器
 *
 * 运行：node --test test/t138-assistant-flicker.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../scripts/lib/strip-comments.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = join(HERE, '..');
const src = stripComments(readFileSync(join(REPO, 'src/routes/ChatDetail.tsx'), 'utf8'), 'tsx');

test('T138-UI-1 · 终态分支先冻结本地内容、再 clearLocalRow', () => {
  const freeze = src.indexOf('setFrozenAssistantRow({');
  const clear = src.indexOf('clearLocalRow();', src.indexOf('finishTurnTiming();'));
  assert.ok(freeze > 0, '★ 终态帧必须把本地流式内容冻进 frozenAssistantRow');
  assert.ok(clear > 0, '★ 仍然要 clearLocalRow（清流式行）');
  assert.ok(freeze < clear, '★ 冻结必须在 clearLocalRow 之前（之后 state 就空了）');
});

test('T138-UI-2 · 冻结行参与 messages 组装（不是清完就没了）', () => {
  assert.ok(src.includes(': frozenAssistantRow;'), '★ 流式行已清时，用冻结行继续渲染');
  assert.ok(src.includes('frozenAssistantRow,'), '★ frozenAssistantRow 必须在 useMemo 的 deps 里');
});

test('T138-UI-3 · 与服务端同 turnKey 行「取较长正文」（安卓同款）', () => {
  // 原逻辑就是取较长者（sameTurn.content.length > streamingMsg.content.length）
  // ⇒ 冻结行只是替代了 streamingMsg，判据本身不许退化成「服务端覆盖本地」。
  assert.ok(
    /sameTurn\.content\.length > streamingMsg\.content\.length/.test(src),
    '★ 同 turnKey 时服务端行与本地行必须取较长正文（不能用空的服务端行盖掉本地的）',
  );
});

test('T138-UI-4 · 递增重试 1s/3s/6s/10s，取代固定 2000ms 单次刷新', () => {
  assert.ok(/const delays = \[1000, 3000, 6000, 10000\]/.test(src),
    '★ 必须是递增重试（服务端正文实测 2279ms 才到，2000ms 单次必然踩空）');
  assert.ok(src.includes('invalidateQueries({ queryKey: ["history", chatId] })'),
    '★ 重试必须刷 history');
});

test('T138-UI-5 · 正文到齐才撤冻结行 + 最终兜底', () => {
  assert.ok(/serverRow\.content\.trim\(\)\.length > 0/.test(src),
    '★ 只有服务端同 turnKey 行正文非空才算落库补完');
  assert.ok(src.includes('setFrozenAssistantRow((cur) => (cur?.turnKey === frozenTk ? null : cur))'),
    '★ 正文到齐（或最终兜底）时必须撤掉冻结行');
});

test('T138-UI-6 · 换会话 / 卸载时清理冻结行与定时器', () => {
  assert.ok((src.match(/setFrozenAssistantRow\(null\)/g) || []).length >= 2,
    '★ reset effect 与 unmount cleanup 都要清冻结行');
  assert.ok((src.match(/terminalRefreshTimersRef\.current\.forEach/g) || []).length >= 2,
    '★ reset effect 与 unmount cleanup 都要清递增刷新定时器');
});
