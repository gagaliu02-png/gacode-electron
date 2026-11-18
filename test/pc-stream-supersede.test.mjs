// [2026-11-18 · T-040] PC 端「本地残留的流把用户挡在门外」单测
//
// 现象（真机，用户原话）：「还是出现生成失败 已有流在进行中，可是我已经没有流了啊」
//   ⇒ banner 文案 = `生成失败: 已有流在进行中, 请先停止或等待`
//   ⇒ **这句是端侧自己抛的**（chat-stream.ts 的 start()/attach() 守卫），不是服务端 409
//   ⇒ 「退出 session 重进才好」⇒ 本地 ref 残留 ⇒ hook 实例活着，ref 没复位。
//
// 修法：服务端本来就是「新轮次 pre-abort 旧轮次」⇒ 本地残留的流不是冲突，
//       只是上一条流的尾巴 ⇒ **收掉它**（不拦用户），且被取代的那条**安静退出**
//       （绝不抛 UserAbortError —— 那会让 UI 误报「生成中断」）。
//
// 运行: node --test test/pc-stream-supersede.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "src/lib/chat-stream.ts");

/** 去掉注释再匹配（说明性注释会提到旧行为，不能让断言误伤）。 */
function codeOnly() {
  return fs
    .readFileSync(SRC, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

test("T040-1 端侧不再因为「已有流」抛错（那句文案就是用户看到的那句）", () => {
  const src = codeOnly();
  assert.doesNotMatch(
    src,
    /throw new Error\("已有流在进行中/,
    "不许再 throw「已有流在进行中」⇒ 用户会被本地状态锁死",
  );
});

test("T040-2 start() / attach() 都先收掉本地残留的流", () => {
  const src = codeOnly();
  assert.match(src, /const supersedeLocalStreams = useCallback\(/, "要有收尾函数");
  // start() 与 attach() 各调一次
  const hits = src.match(/supersedeLocalStreams\(\);/g) || [];
  assert.ok(hits.length >= 2, `start() 与 attach() 都要调（实际 ${hits.length} 处）`);
});

test("T040-3 被取代的流：标记 superseded + 安静退出（不抛 UserAbortError）", () => {
  const src = codeOnly();
  assert.match(src, /superseded\?: boolean;/, "ActiveStream 要有 superseded 标记");
  assert.match(src, /a\.superseded = true;/, "收掉前要标记 superseded");
  assert.match(src, /b\.superseded = true;/, "收掉前要标记 superseded（attach 那条）");
  // catch 里：superseded ⇒ 安静 return（不抛）
  assert.match(
    src,
    /if \(active\.superseded\) return;/,
    "被取代的流 abort 时要安静退出",
  );
  const throwsUserAbort = src.match(/throw new UserAbortError\(\);/g) || [];
  // 两处 throw（start / attach）都必须在 superseded 判定之后
  assert.ok(throwsUserAbort.length >= 2, "两处 UserAbortError 都要保留（真·用户停止）");
  assert.match(
    src,
    /if \(active\.superseded\) return;\s*\n\s*throw new UserAbortError\(\);/,
    "superseded 判定必须排在 UserAbortError 之前",
  );
});

test("T040-4 收掉本地流**不发** USER_STOP（服务端那轮由 pre-abort 收）", () => {
  const src = codeOnly();
  // supersedeLocalStreams 里只有 ac.abort()，不许出现 sendCancelDelete
  const fn = src.slice(
    src.indexOf("const supersedeLocalStreams"),
    src.indexOf("const start = useCallback"),
  );
  assert.doesNotMatch(fn, /sendCancelDelete/, "本地收尾不许越权去停服务端那一轮");
  assert.match(fn, /ac\.abort\(\)/, "要 abort 本地流");
});
