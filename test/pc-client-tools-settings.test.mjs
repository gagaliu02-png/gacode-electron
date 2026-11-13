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
const PAGE = "src/routes/ClientTools.tsx";
const SHELL = "src/components/layout/AppShell.tsx";
const APP = "src/App.tsx";
const CARD = "src/components/client-tools/ClientToolsCard.tsx";
const BRIDGE = "shared/types.ts";

test("① 端侧执行卡挂在**独立页** /client-tools 上（gaga 拍板：从设置页挪到抽屉）", () => {
  const page = repoSrc(PAGE);
  assert.ok(
    page.includes("ClientToolsCard"),
    "独立页必须渲染 ClientToolsCard（gaga 要求总开关物理可见）",
  );
  assert.ok(
    /<ClientToolsCard\s*\/>/.test(page),
    "独立页必须真的渲染 <ClientToolsCard />",
  );
  const app = repoSrc(APP);
  assert.ok(app.includes("ClientTools"), "App.tsx 必须注册 /client-tools 路由");
  assert.ok(app.includes('path="/client-tools"'), "必须有 /client-tools 这条路由");
});

test("①b 抽屉里「端侧执行」排在「浏览器」**下面**", () => {
  const shell = repoSrc(SHELL);
  const browserAt = shell.indexOf('label: "浏览器"');
  const clientAt = shell.indexOf('label: "端侧执行"');
  assert.ok(browserAt > 0, "抽屉里必须有「浏览器」");
  assert.ok(clientAt > 0, "抽屉里必须有「端侧执行」");
  assert.ok(
    clientAt > browserAt,
    "「端侧执行」必须排在「浏览器」下面（gaga 2026-11-12 拍板）",
  );
  assert.ok(shell.includes('to: "/client-tools"'), "「端侧执行」必须指向 /client-tools");
});

test("①c 设置页**不再**有端侧执行那两块（挪走了，别放两处）", () => {
  const s = repoSrc(SETTINGS);
  assert.ok(!s.includes("ClientToolsCard"), "设置页不该再引入 ClientToolsCard");
  assert.ok(!s.includes("LocalTasksCard"), "设置页不该再引入 LocalTasksCard");
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

test("⑦ 端侧执行页里，闸门排在「本机定时」**前面**（用户先看到闸门）", () => {
  const page = repoSrc(PAGE);
  const cardAt = page.indexOf("<ClientToolsCard");
  const tasksAt = page.indexOf("<LocalTasksCard");
  assert.ok(cardAt > 0, "独立页必须有 <ClientToolsCard");
  assert.ok(tasksAt > 0, "独立页必须有 <LocalTasksCard");
  assert.ok(cardAt < tasksAt, "端侧执行（闸门）要排在「本机定时」前面");
});
