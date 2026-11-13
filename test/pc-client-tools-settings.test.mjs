// [2026-11-12 · P4] PC「我的电脑」页（抽屉「浏览器」下面）的**接线**回归断言
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
const PAGE = "src/routes/MyComputer.tsx";
const SHELL = "src/components/layout/AppShell.tsx";
const APP = "src/App.tsx";
const CARD = "src/components/client-tools/ClientToolsCard.tsx";
const BRIDGE = "shared/types.ts";

test("① 「我的电脑」卡挂在**独立页** /my-computer 上（gaga 拍板：从设置页挪到抽屉）", () => {
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
  assert.ok(app.includes("MyComputer"), "App.tsx 必须注册「我的电脑」页组件");
  assert.ok(app.includes('path="/my-computer"'), "必须有 /my-computer 这条路由");
});

test("①b 抽屉里「我的电脑」排在「浏览器」**下面**", () => {
  const shell = repoSrc(SHELL);
  const browserAt = shell.indexOf('label: "浏览器"');
  const clientAt = shell.indexOf('label: "我的电脑"');
  assert.ok(browserAt > 0, "抽屉里必须有「浏览器」");
  assert.ok(clientAt > 0, "抽屉里必须有「我的电脑」");
  assert.ok(
    clientAt > browserAt,
    "「我的电脑」必须排在「浏览器」下面（gaga 2026-11-12 拍板）",
  );
  assert.ok(shell.includes('to: "/my-computer"'), "「我的电脑」必须指向 /my-computer");
});

test("①c 设置页**不再**有那两块（挪走了，别放两处）", () => {
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
    code.includes("killSwitch: true"),
    "急停必须是**一键**置位（不是先去改总开关）",
  );
  assert.ok(
    code.includes("立即停止"),
    "急停按钮必须有中文文案（物理可见）",
  );
});

test("③b 急停**必须能恢复**（gaga 2026-11-13：点了之后完全不能用了）", () => {
  const code = repoCode(CARD);
  // ① 急停是一个**开关** ⇒ 必须有「关掉它」的那条路。
  assert.ok(
    code.includes("killSwitch: false"),
    "必须有 killSwitch: false 这条路（恢复）—— 否则急停是一次性的，点了就永久停摆",
  );
  assert.ok(
    code.includes("恢复"),
    "恢复路径必须有中文文案（用户看得见怎么回去）",
  );
  // ② 已经急停了的时候，按钮**不许**被永久 disable。
  //    （旧写法 `disabled={busy || killing}` ⇒ 急停后再也点不动 ⇒ 死锁。）
  assert.ok(
    !/disabled=\{busy\s*\|\|\s*killing\}/.test(code),
    "急停按钮不许被 `killing` 永久 disable —— 那就是「点了之后完全不能用了」的病根",
  );
  // ③ 急停要**真杀**正在跑的命令（界面上写着「正在跑的命令会被终止」）。
  const ipc = repoCode("electron/client-tools/ipc.ts");
  assert.ok(
    ipc.includes("stopAllTasks"),
    "主进程在急停时必须真的掐掉正在跑的任务（killSwitch 只挡新派单）",
  );
  const dev = repoCode("electron/client-tools/deviceClient.ts");
  assert.ok(
    dev.includes("stopAllTasks"),
    "deviceClient 必须提供 stopAllTasks（中止所有在跑的任务）",
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
