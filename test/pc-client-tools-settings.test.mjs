// [2026-11-12 · P4] PC 设置页「端侧执行」卡的**接线**回归断言
//
// ---------------------------------------------------------------------------
// gaga 2026-11-12 拍板的三件事, 必须在界面上**看得见**:
//   ① 总开关 —— 默认 **开**, 且**物理可见**（不是藏在配置文件里）
//   ② 一键急停 —— 「现在给我停下」（跟总开关不是一回事）
//   ③ 执行记录 —— 保留 30 天 + 一键清空
//
// 另外契约 **L-25u**：web / 安卓 / PC 都必须能显示
// 「我的电脑：xxx（在线 / 离线）」⇒ 在线态也在这张卡里。
//
// ⚠️ 这些断言只看**代码形状**（不渲染 React）—— 目的是「界面被悄悄删掉时转红」。
//
// 运行: node --test test/pc-client-tools-settings.test.mjs   (完全离线)

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

const SETTINGS = "src/routes/Settings.tsx";
const CARD = "src/components/client-tools/ClientToolsCard.tsx";
const BRIDGE = "shared/types.ts";

test("① 设置页挂了「端侧执行」卡（被删掉 ⇒ 转红）", () => {
  const settings = repoSrc(SETTINGS);
  assert.ok(
    settings.includes("ClientToolsCard"),
    "设置页必须引入 ClientToolsCard（gaga 要求总开关物理可见）",
  );
  assert.ok(
    /<ClientToolsCard\s*\/>/.test(settings),
    "设置页必须真的渲染 <ClientToolsCard />",
  );
});

test("② 卡里有总开关（role=switch）且默认读闸门状态", () => {
  const code = repoCode(CARD);
  assert.ok(code.includes('role="switch"'), "总开关必须是 switch 语义（无障碍）");
  assert.ok(code.includes("aria-checked"), "switch 必须带 aria-checked");
  assert.ok(
    code.includes("masterEnabled"),
    "总开关必须读写闸门的 masterEnabled 字段",
  );
  // ⚠️ 默认 ON —— 判据是「闸门那边默认值是 true」+「界面不写死成关」。
  const gate = repoCode("electron/client-tools/gate.ts");
  assert.ok(
    /masterEnabled:\s*true/.test(gate),
    "闸门默认必须是 masterEnabled: true（gaga 拍板「默认 ON」）",
  );
});

test("③ 卡里有一键急停（killSwitch），且和总开关是两个不同的开关", () => {
  const code = repoCode(CARD);
  assert.ok(code.includes("killSwitch"), "必须有急停（killSwitch）");
  assert.ok(
    code.includes("setGateState({ killSwitch: true })"),
    "急停必须是**一键**置位（不是先去改总开关）",
  );
  assert.ok(
    code.includes("立即停止"),
    "急停按钮必须有中文文案（物理可见）",
  );
});

test("④ 执行记录：读 + 一键清空", () => {
  const code = repoCode(CARD);
  assert.ok(code.includes("bridge.audit("), "必须能读执行记录");
  assert.ok(code.includes("bridge.clearAudit("), "必须能一键清空");
  assert.ok(code.includes("清空"), "清空按钮必须有中文文案");
});

test("⑤ 在线态显示「我的电脑：xxx（在线/离线）」（契约 L-25u）", () => {
  const code = repoCode(CARD);
  assert.ok(code.includes("我的电脑"), "必须显示「我的电脑」");
  assert.ok(code.includes("在线"), "必须显示在线/离线");
  assert.ok(code.includes("connected"), "在线态必须取设备通道的 connected（L-25t）");
});

test("⑥ 桥契约里必须有端侧执行那几件套", () => {
  const code = repoCode(BRIDGE);
  for (const fn of [
    "setAccessToken",
    "ptyAvailable",
    "status",
    "setGate",
    "audit",
    "clearAudit",
    "execute",
    "onRequest",
  ]) {
    assert.ok(code.includes(fn), `GacodeBridge.clientTools 必须有 ${fn}`);
  }
});

test("⑦ 设置页的端侧执行段落在「关于」之前（用户先看到闸门）", () => {
  // ⚠️ 用**去注释后**的源码比位置 —— 文件头注释里也提到「关于组」。
  const s = repoCode(SETTINGS);
  const cardAt = s.indexOf("<ClientToolsCard");
  const aboutAt = s.indexOf("关于");
  assert.ok(cardAt > 0, "设置页必须有 <ClientToolsCard");
  assert.ok(aboutAt > 0, "设置页必须有「关于」段");
  assert.ok(cardAt < aboutAt, "端侧执行卡要排在「关于」**之前**（闸门比版本号重要）");
});
