// [2026-11-12 · P7] 本机定时任务的**接线**回归断言
//
// ---------------------------------------------------------------------------
// gaga 2026-11-12 拍板:
//   · 定时任务**只在 Gacode 打开时跑** —— ⛔ **不写** Windows 计划任务
//     （那种做法会绕过本机的闸门与审计）。
//   · 端侧定时任务**绝不复用**服务端的 `scheduled === true`
//     （契约附录 订正 24 §5 / L-24k —— 那是「审批直接放行」的旁路）。
//
// 运行: node --test test/pc-local-tasks.test.mjs   (完全离线)

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
const CARD = "src/components/client-tools/LocalTasksCard.tsx";
const SCHED = "electron/client-tools/localTasks.ts";
const CHAT = "electron/client-tools/localChat.ts";
const BRIDGE = "shared/types.ts";

test("① 设置页挂了「本机定时」卡", () => {
  const s = repoSrc(SETTINGS);
  assert.ok(s.includes("LocalTasksCard"), "设置页必须引入 LocalTasksCard");
  assert.ok(/<LocalTasksCard\s*\/>/.test(s), "设置页必须真的渲染 <LocalTasksCard />");
});

test("② 定时器在**主进程**（渲染层刷新不该让定时任务停）", () => {
  const code = repoCode(SCHED);
  assert.ok(code.includes("setInterval"), "定时器必须在主进程里 tick");
  assert.ok(code.includes("app.getPath('userData')"), "任务要落在本机持久化");
  // ⛔ 定时器**不许**出现在渲染层（渲染层一刷新就没了）。
  const card = repoCode(CARD);
  assert.ok(
    !card.includes("setInterval(") || card.includes("REFRESH_MS"),
    "渲染层只做「增删查 + 立刻跑」，不许自己当定时器",
  );
});

test("③ ⛔ 不写 Windows 计划任务（schtasks / Task Scheduler 一律不许出现）", () => {
  for (const f of [SCHED, CHAT, CARD]) {
    const code = repoCode(f);
    // ⚠️ `Task\s+Scheduler`（**至少一个**空格）—— `\s*` 会误伤 `LocalTaskScheduler` 这个类名。
    assert.ok(!/schtasks|Task\s+Scheduler|sc\s+create/i.test(code), `${f} 不许碰 Windows 计划任务`);
  }
});

test("④ ★ L-24k · 定时轮次发的是**普通**的一轮（绝不复用 scheduled 旁路）", () => {
  const code = repoCode(CHAT);
  assert.ok(
    !/scheduled\s*[:=]\s*true/.test(code),
    '端侧定时任务绝不许带 scheduled=true（服务端那个是「审批直接放行」的旁路，L-24k）',
  );
  // 它发的是一条普通的 user 消息。
  assert.ok(code.includes("message"), "定时轮次要发一条普通 user 消息");
});

test("⑤ 定时轮次见到终态帧就发 ACK_DONE（不然服务端武装 pending cancel ⇒ 下一轮被预先中止）", () => {
  const code = repoCode(CHAT);
  assert.ok(code.includes("ACK_DONE"), "必须发 ACK_DONE");
  assert.ok(code.includes("isTerminalFrame"), "终态判据用共享层那一份（G-3 一处真值）");
});

test("⑥ 过点的时刻**不补跑**（补跑 = 你一回来电脑突然开始干活）", () => {
  const code = repoCode(SCHED);
  assert.ok(code.includes("nextRunAt"), "任务要有下一次时刻");
  // 不许有「catch up / 补跑」那类逻辑。
  assert.ok(!/catchUp|catch_up|补跑/.test(code), "不许补跑");
});

test("⑦ 桥契约里有本机定时那四件套", () => {
  const code = repoCode(BRIDGE);
  for (const fn of ["localTasks", "list", "upsert", "remove", "runNow"]) {
    assert.ok(code.includes(fn), `GacodeBridge.localTasks 必须有 ${fn}`);
  }
});

test("⑧ 任务有「上次失败原因」字段（跑不成要看得见）", () => {
  const code = repoCode(SCHED);
  assert.ok(code.includes("lastError"), "任务要记住上次失败的原因");
  const card = repoCode(CARD);
  assert.ok(card.includes("lastError"), "界面要把上次失败显示出来");
});
