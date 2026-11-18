// [2026-11-18 · T-042] PC 端「结果晚到型工具走后台回传通道」单测
//
// 背景：PM 拍板 `pc_cc_send` 改成**后台模式**（不占轮、不阻塞主 agent）。
//   服务端派单即返回 ⇒ 这一轮当场结束 ⇒ 端侧拿到结果后**另起一轮**汇报。
//   ⇒ 端侧必须把「真结果」走**后台回传通道**送回（不能只标 running）。
//
// ⚠️ 反例（必须挡住）：detached 作业类工具（pc_shell 等）**不许**提前把「已启动」
//   当结果回传 ⇒ 用户会立刻收到一条「作业已完成」（订正 27 的老坑）。
//
// 运行: node --test test/pc-late-result-tools.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "electron/client-tools/deviceClient.ts");

function codeOnly() {
  return fs
    .readFileSync(SRC, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

test("T042-P1 「结果晚到型工具」清单只列 pc_cc_send", () => {
  const src = codeOnly();
  const m = /const LATE_RESULT_TOOLS = new Set<string>\(\[(.*?)\]\)/s.exec(src);
  assert.ok(m, "要有 LATE_RESULT_TOOLS 清单");
  const items = m[1].split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  assert.deepEqual(items, ["pc_cc_send"], "只列 pc_cc_send（别泛化到 detached 作业类工具）");
});

test("T042-P2 后台派单：结果晚到型工具 ⇒ 执行完直接把真结果回传", () => {
  const src = codeOnly();
  assert.match(
    src,
    /if \(LATE_RESULT_TOOLS\.has\(req\.tool[^\n]*\) \{[\s\S]{0,400}reportJobResult\(/,
    "结果晚到型工具要调 reportJobResult（= 后台回传通道）",
  );
  assert.match(
    src,
    /reportJobResult\([^)]*\{[\s\S]{0,200}stdout: result\.stdout/,
    "回传的内容要是**真结果**（result.stdout）",
  );
});

test("T042-P3 反例挡住：detached 作业类工具不许提前回传「已启动」", () => {
  const src = codeOnly();
  const start = src.indexOf("if (LATE_RESULT_TOOLS.has(req.tool");
  assert.ok(start > 0, "要有 late-result 分支");
  const branch = src.slice(start);
  // 分支体 = 从 late-result 分支到第一个 markDispatch 之前
  const branchBody = branch.slice(0, branch.indexOf("markDispatch"));
  // ① 分支里回传完就 return（不落到 markDispatch('running') 那条路）
  assert.match(
    branchBody,
    /reportJobResult\([\s\S]{0,400}\);\s*return;/,
    "late-result 分支回传完要 return（不许再走 markDispatch('running')）",
  );
  // ② 反例：detached 作业那条路 = markDispatch('running') 之后**直接 return**，
  //    中间不许出现 reportJobResult（否则会把「已启动」当结果报出去 ⇒ 用户立刻收到「作业已完成」）
  const detachedPath = branch.slice(branch.indexOf("markDispatch"));
  const beforeReport = detachedPath.indexOf("reportJobResult(");
  const returnIdx = detachedPath.indexOf("return;");
  assert.ok(
    beforeReport === -1 || returnIdx >= 0 || beforeReport > detachedPath.indexOf("}"),
    "detached 作业路径不许在 markDispatch 之后紧跟 reportJobResult",
  );
  // 更直接的判据：markDispatch('running') 之后的那一段里，先出现 return 再出现 reportJobResult
  const seg = detachedPath.slice(0, beforeReport === -1 ? detachedPath.length : beforeReport);
  assert.match(
    seg,
    /markDispatch\([\s\S]{0,120}emitJobsChanged\(\);[\s\S]{0,40}return;/,
    "detached 作业路径：markDispatch → emitJobsChanged → return（中间不许回传结果）",
  );
});
