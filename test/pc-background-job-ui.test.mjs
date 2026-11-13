// [2026-11-13 · 订正 27 · B7] PC 端「后台作业」列表 UI —— 接线回归断言
//
// ---------------------------------------------------------------------------
// gaga 2026-11-13 拍板（B7）:
//   · PC 上「我的电脑」那张卡里要能看到**后台作业**（派单即返回、进程 detached 的长活）。
//   · ⛔ 停作业**不许**混进急停（急停是全机语义）；⛔ 不许改急停的既有语义。
//   · 桥上那三个方法是**可选的**（主进程侧可能还没实现）⇒ UI 必须容错，不许白屏。
//   · L-26a / L-26b：端侧的东西（作业 / 端侧产物）**只在 PC 上有意义**
//     ⇒ web / 安卓**不许**加作业展示。
//
// 运行: node --test test/pc-background-job-ui.test.mjs   (完全离线, 不渲染 React)
//
// ⚠️ 断言一律针对**去注释后**的源码（scripts/lib/strip-comments.mjs）——
//    本仓注释密度极高, 直接 `includes` 会被注释喂饱（那种断言等于没有断言）。

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "../scripts/lib/strip-comments.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");
const repoCode = (p) => stripComments(repoSrc(p), p);

const CARD = "src/components/client-tools/ClientToolsCard.tsx";
const JOBS = "src/components/client-tools/BackgroundJobsSection.tsx";
const BRIDGE = "shared/types.ts";

/** 对端仓（web）—— L-26a 的核对象。 */
const PEER_REPO = process.env.RC_PEER_REPO
  ? process.env.RC_PEER_REPO
  : join(REPO, "..", "gacode-web");

// ===========================================================================
// ① 桥契约：三个方法是**可选**的（所以 UI 必须容错）
// ===========================================================================

test("① 桥契约里 listJobs / stopJob / onJobs 都是**可选**的（UI 必须容错）", () => {
  const code = repoCode(BRIDGE);
  assert.ok(
    /listJobs\?:\s*\(\)\s*=>\s*Promise<LocalJobInfo\[\]>/.test(code),
    "listJobs 必须是可选方法（主进程侧还没实现时 UI 要能容错）",
  );
  assert.ok(
    /stopJob\?:\s*\(jobId:\s*string\)\s*=>\s*Promise<\{ ok: boolean; error\?: string \| null \}>/.test(code),
    "stopJob 必须是可选方法",
  );
  assert.ok(
    /onJobs\?:\s*\(callback:\s*\(jobs:\s*LocalJobInfo\[\]\)\s*=>\s*void\)\s*=>\s*\(\)\s*=>\s*void/.test(code),
    "onJobs 必须是可选方法",
  );
});

// ===========================================================================
// ② 「我的电脑」那张卡里真的渲染了后台作业区
// ===========================================================================

test("② 「我的电脑」卡里渲染了 <BackgroundJobsSection />", () => {
  const card = repoCode(CARD);
  assert.ok(card.includes("BackgroundJobsSection"), "卡里必须 import 后台作业区");
  assert.ok(
    /<BackgroundJobsSection\s*\/>/.test(card),
    "卡里必须真的渲染 <BackgroundJobsSection />",
  );
});

// ===========================================================================
// ③ 桥上还没有这些方法 ⇒ 显示「（暂不可用）」，不许白屏 / 抛错
// ===========================================================================

test("③ 桥上没有 listJobs ⇒ 显示「（暂不可用）」而不是白屏", () => {
  const code = repoCode(JOBS);
  assert.ok(
    /typeof\s+bridge\?\.listJobs\s*===\s*"function"/.test(code),
    "★ 必须**同步**判 listJobs 在不在（它是可选方法）",
  );
  assert.ok(code.includes("（暂不可用）"), "★ 必须有「（暂不可用）」的兜底文案");
  // 「不支持」那一支必须**渲染出东西**（return 一个 JSX），不是 return null / 抛错。
  const branch = code.slice(code.indexOf("if (!canList)"));
  assert.ok(branch.length > 100, "抠不到「不支持」那一支");
  assert.ok(
    /return\s*\(\s*</.test(branch.slice(0, 900)),
    "★ 「不支持」那一支必须 return 一段 JSX（不许 return null —— 那就是白屏）",
  );
  assert.ok(!/throw\s/.test(code), "这一区不许抛错（不许把异常甩给渲染层）");
});

test("③b 读列表失败 ≠ 不支持：两种情况要分开说", () => {
  const code = repoCode(JOBS);
  assert.ok(code.includes("setError("), "读列表失败要有自己的状态（别跟「不支持」混）");
  assert.ok(
    /catch\s*\(e\)\s*\{[\s\S]{0,300}setError\(/.test(code),
    "★ listJobs 抛错 ⇒ 记错误文案，不许炸界面",
  );
});

// ===========================================================================
// ④ 停止作业：只走 stopJob；⛔ 不许碰急停（setGate / killSwitch）
// ===========================================================================

test("④ 停作业只走 clientTools.stopJob", () => {
  const code = repoCode(JOBS);
  assert.ok(code.includes("stopJob"), "必须调 stopJob");
  assert.ok(
    /b\.stopJob\(job\.id\)/.test(code),
    "★ 停作业必须按作业 id 调 stopJob",
  );
});

test("④b ⛔ 停作业不许混进急停（那一区里不许出现 setGate / killSwitch）", () => {
  const code = repoCode(JOBS);
  assert.ok(!code.includes("setGate"), "⛔ 作业区不许调 setGate（那是急停，全机语义）");
  assert.ok(!code.includes("killSwitch"), "⛔ 作业区不许碰 killSwitch");
});

test("④c 急停的既有语义没被改（setGate / killSwitch 仍在卡里）", () => {
  const card = repoCode(CARD);
  assert.ok(/bridge\.setGate\(next\)/.test(card), "急停/总开关仍走 bridge.setGate");
  assert.ok(card.includes("killSwitch"), "急停语义（killSwitch）不许被这一批改掉");
});

// ===========================================================================
// ⑤ 每条作业要看得到：类型 / 开始时间 / 状态 / 摘要
// ===========================================================================

test("⑤ 每条作业能看到类型（Claude Code / 普通命令）· 开始时间 · 状态 · 摘要", () => {
  const code = repoCode(JOBS);
  assert.ok(code.includes("Claude Code"), "要有「Claude Code」这个类型名");
  assert.ok(code.includes("普通命令"), "要有「普通命令」这个类型名");
  assert.ok(/claude:\s*"Claude Code"/.test(code), "serviceId=claude ⇒ Claude Code");
  assert.ok(/raw:\s*"普通命令"/.test(code), "serviceId=raw ⇒ 普通命令");
  assert.ok(code.includes("startedAt"), "要显示开始时间");
  assert.ok(code.includes("summary"), "要显示最近进展摘要");
  assert.ok(code.includes("jobStatusText("), "要有状态的人话映射");
  assert.ok(/case\s+"running"/.test(code), "状态映射里得有 running");
  assert.ok(/case\s+"reported"/.test(code), "状态映射里得有 reported");
});

// ===========================================================================
// ⑥ 「正在跑」的才有停止按钮；已结束的没有
// ===========================================================================

test("⑥ 停止按钮只给还在跑的作业（已结束的没有）", () => {
  const code = repoCode(JOBS);
  assert.ok(
    /status\s*===\s*"running"\s*\|\|\s*job\.status\s*===\s*"queued"/.test(code),
    "★ 「还在跑」的判据 = running / queued",
  );
  // 停止按钮在 active 那一片里。
  const activeIdx = code.indexOf("active.map(");
  assert.ok(activeIdx > 0, "抠不到 active.map(");
  const activeBlock = code.slice(activeIdx, activeIdx + 3000);
  assert.ok(/stop\(j\)/.test(activeBlock), "★ 在跑的那一片必须能停");
  // 已结束的那一片不许出现停止按钮。
  const settledIdx = code.indexOf("settled.map(");
  assert.ok(settledIdx > 0, "抠不到 settled.map(");
  const settledBlock = code.slice(settledIdx, settledIdx + 2000);
  assert.ok(
    !/stop\(j\)/.test(settledBlock),
    "★ 已结束的作业不许再出现「停止」按钮（点了也是假动作）",
  );
});

// ===========================================================================
// ⑦ 订阅 + 轮询兜底
// ===========================================================================

test("⑦ 作业列表：主进程推（onJobs）+ 轮询兜底，两条都要在", () => {
  const code = repoCode(JOBS);
  assert.ok(code.includes("onJobs"), "要订阅 onJobs（主进程推过来就重画）");
  assert.ok(
    /typeof\s+b\.onJobs\s*!==\s*"function"/.test(code),
    "★ onJobs 也是可选的 ⇒ 不许假设它一定在",
  );
  assert.ok(code.includes("setInterval("), "要有轮询兜底（推不到时也能刷新）");
  assert.ok(code.includes("REFRESH_MS"), "轮询间隔要有常量（别写魔法数）");
});

// ===========================================================================
// ⑧ L-26a / L-26b：web / 安卓**不许**有后台作业的展示
// ===========================================================================

test("⑧ L-26a · web 端不许出现后台作业的读取/停止代码", (t) => {
  if (!existsSync(join(PEER_REPO, "src"))) {
    t.skip(`对端仓不存在: ${PEER_REPO}`);
    return;
  }
  // web 仓里搜「后台作业」这套接口名（listJobs / stopJob / onJobs / local-jobs）。
  // ⚠️ 用 \b 夹住：`onJobs` 是 `listCronJobs` 的子串，不夹住会误伤「定时任务」那套。
  let out = "";
  try {
    out = execFileSync(
      "git",
      [
        "-C",
        PEER_REPO,
        "grep",
        "-n",
        "-E",
        "\\b(listJobs|stopJob|onJobs|local-jobs|LocalJobInfo)\\b",
        "--",
        "src",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch (e) {
    // git grep 没有命中时退出码是 1 ⇒ 那正是我们要的。
    out = e.stdout || "";
  }
  assert.equal(
    out.trim(),
    "",
    `★ web 端不许有后台作业的代码（L-26a：端侧的东西只在 PC 上有意义）:\n${out}`,
  );
});
