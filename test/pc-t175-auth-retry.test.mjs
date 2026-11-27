// [T-175] 主进程「401 不自愈」这一类缺陷的**回归护栏**
//
// ---------------------------------------------------------------------------
// 病根（生产实证 2026-11-27 · session 1193 · T-148）：
//
//   access token 由**渲染层**推给主进程（`gacode:client-tool-set-token`），
//   而刷新只在**渲染层自己发请求收到 401** 时才发生
//   ⇒ 主进程这条路（设备通道 / 后台任务结果上报 / CC→Cody 回传）的 token 会一直过期
//   ⇒ `POST /devices/tasks/:pendingId/result` 拿到 **401**
//   ⇒ 结果送不到服务端 ⇒ 派单账永远 `settled:false / running`
//   ⇒ 「等待后台任务完成…」横幅不消失 + 服务端起不了汇报轮
//   ⇒ **Cody 收不到后台任务回报**。
//
//   同一时刻生产日志里 401 共 **13.5 万次**，横跨所有需要 Bearer 的端点。
//
// 修法：主进程所有带 Bearer 的请求走 `deviceClient.authFetch`
//      （401 ⇒ 刷新 token ⇒ 重试一次）。
//
// 运行: node --test test/pc-t175-auth-retry.test.mjs   (完全离线: 不连网)
//
// ⚠️ 护栏风格与仓库其它源码断言式测试一致（这个仓库没有 jsdom / testing-library）。

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { stripComments } from "../scripts/lib/strip-comments.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");

const DEVICE_CLIENT = "electron/client-tools/deviceClient.ts";
const CC_SESSION_TOOL = "electron/client-tools/ccSessionToolService.ts";
const MACHINE_EVENTS = "electron/client-tools/machineEvents.ts";
const HOOK_SERVICE = "electron/client-tools/claudeCodeHookService.ts";
const IPC = "electron/client-tools/ipc.ts";

const clean = (p) => stripComments(repoSrc(p), p);

// ===========================================================================
// ① deviceClient：所有带 Bearer 的请求必须走 authFetch
// ===========================================================================

test("T-175-AR1 deviceClient 里不再有裸 fetch 带 Authorization", () => {
  const code = clean(DEVICE_CLIENT);
  const bare = code
    .split(/\r?\n/)
    .map((l, i) => ({ l, i }))
    .filter((x) => /Authorization:\s*`Bearer \$\{this\.accessToken\}`/.test(x.l));
  assert.equal(
    bare.length,
    0,
    `★ deviceClient 里还有 ${bare.length} 处裸 fetch 带 Authorization：\n` +
      bare.map((x) => `  第 ${x.i + 1} 行: ${x.l.trim()}`).join("\n") +
      "\n  ⇒ 它们 401 不会自愈（token 过期 ⇒ 静默丢）",
  );
});

test("T-175-AR2 authFetch 存在且语义正确（401 ⇒ 刷新 ⇒ 重试一次）", () => {
  const code = clean(DEVICE_CLIENT);
  assert.ok(code.includes("authFetch"), "必须有 authFetch");
  assert.ok(
    code.includes("if (res.status !== 401) return res;"),
    "authFetch 必须只在 401 时才走刷新分支",
  );
  assert.ok(
    code.includes("refreshAccessToken"),
    "authFetch 必须调 refreshAccessToken",
  );
  // 重试**只有一次** —— 刷新后仍是 401 ⇒ 直接返回那个 401（不死循环）。
  assert.ok(
    /const fresh = await this\.refreshAccessToken\(\);[\s\S]{0,400}return doFetch\(fresh\);/.test(code),
    "刷新后必须**只重试一次**（doFetch(fresh)）",
  );
});

test("T-175-AR3 token 刷新是**单飞**（rotation 语义 ⇒ 并发刷新会互相作废）", () => {
  const code = clean(DEVICE_CLIENT);
  assert.ok(
    code.includes("if (this.refreshing) return this.refreshing;"),
    "★ refresh 必須单飞 —— 服务端 refresh token 是一次性的，并发刷新会互相作废",
  );
});

test("T-175-AR4 关键路径（D3 结果上报）走 authFetch", () => {
  const code = clean(DEVICE_CLIENT);
  const idx = code.indexOf("devices/tasks/");
  assert.ok(idx > 0, "抠不到 D3 结果上行");
  const seg = code.slice(Math.max(0, idx - 600), idx + 200);
  assert.ok(
    seg.includes("authFetch"),
    "★ D3 结果上行必须走 authFetch —— 这是「后台任务回报送不到服务端」的根因",
  );
});

test("T-175-AR5 设备 SSE 长连走 authFetch（401 ⇒ 通道建不起来 ⇒ 派单收不到）", () => {
  const code = clean(DEVICE_CLIENT);
  const idx = code.indexOf("devices/events?");
  assert.ok(idx > 0, "抠不到设备 SSE");
  const seg = code.slice(Math.max(0, idx - 600), idx + 200);
  assert.ok(seg.includes("authFetch"), "设备 SSE 必须走 authFetch");
});

// ===========================================================================
// ② CC→Cody 回传主链路（ccSessionToolService 自有一套 fetch ⇒ 绕过 deviceClient）
// ===========================================================================

test("T-175-AR6 ccSessionToolService 支持注入 authFetch（CC→Cody 主链路）", () => {
  const code = clean(CC_SESSION_TOOL);
  assert.ok(
    code.includes("authFetch"),
    "★ CC→Cody 回传的自有 fetch 必须能注入 authFetch —— 否则它绕过 deviceClient ⇒ 401 不自愈",
  );
  assert.ok(
    code.includes("if (deps.authFetch)"),
    "fetchJson 必须优先用注入的 authFetch",
  );
});

test("T-175-AR7 ccSessionToolService 的 deps 里真的注入了 authFetch", () => {
  const code = clean(HOOK_SERVICE);
  assert.ok(
    code.includes("authFetch:"),
    "★ 注入点（claudeCodeHookService）必须真的把 authFetch 传进去",
  );
  assert.ok(
    code.includes("deviceClient.authFetch"),
    "注入的必须是 deviceClient.authFetch（真正会刷新 token 的那个）",
  );
});

test("T-175-AR8 machineEvents 也接了 authFetch（它有独立的 fetch）", () => {
  const code = clean(MACHINE_EVENTS);
  assert.ok(code.includes("authFetch"), "machineEvents 必须支持 authFetch");
  const dc = clean(DEVICE_CLIENT);
  assert.ok(
    /machineEventDeps[\s\S]{0,600}authFetch/.test(dc),
    "★ machineEventDeps 必须注入 authFetch",
  );
});

// ===========================================================================
// ③ 刷新器真的接上了（否则 authFetch 拿不到新 token）
// ===========================================================================

test("T-175-AR9 deviceClient 装了刷新器（ipc.ts 注册时注入）", () => {
  const code = clean(IPC);
  assert.ok(
    code.includes("setTokenRefresher"),
    "★ 必须在注册 IPC 时装上刷新器 —— 否则 authFetch 遇到 401 也没用",
  );
  assert.ok(
    code.includes("refreshAccessTokenFromDisk"),
    "默认刷新器必须能从磁盘读 refreshToken 换新的 access token",
  );
});

test("T-175-AR10 刷新器读的是渲染层同一个 refresh-token.json（rotation 安全）", () => {
  const code = clean("electron/client-tools/refreshTokenStore.ts");
  assert.ok(code.includes("refresh-token.json"), "必须读同一个文件");
  assert.ok(
    code.includes("writeRefreshTokenForRefresh"),
    "★ rotation ⇒ 换到新 refreshToken 后必须立刻写回（旧的已作废）",
  );
});

// ===========================================================================
// ④ outbox 补发（`readPendingOutbox` 曾经零调用 ⇒ 失败一次就永久丢）
// ===========================================================================

test("T-175-AR11 outbox 补发有实现了（不再只写不读）", () => {
  const code = clean(MACHINE_EVENTS);
  assert.ok(
    code.includes("export async function flushPendingOutbox"),
    "★ 必须有 flushPendingOutbox —— 否则 outbox 永远只写不读",
  );
  assert.ok(
    code.includes("readPendingOutbox(deps)"),
    "flushPendingOutbox 必须真的读未发出的行",
  );
});

test("T-175-AR12 通道连上后触发补发（鉴权通了正是补发的时机）", () => {
  const code = clean(DEVICE_CLIENT);
  assert.ok(
    code.includes("flushPendingOutbox"),
    "★ 设备通道连上后必须触发 outbox 补发 —— 之前失败多半是 401（token 过期）",
  );
});

// ===========================================================================
// ⑤ 采集器 / 补发窗口（超时口径与服务端对齐）
// ===========================================================================

test("T-175-AR13 采集器超时 24 小时（对齐服务端派单 TTL）", () => {
  const code = clean("electron/client-tools/ccResultCollector.ts");
  assert.ok(
    /COLLECTOR_DEFAULT_TIMEOUT_MS\s*=\s*Number\(\s*process\.env\.CC_COLLECTOR_TIMEOUT_MS\s*\?\?\s*24 \* 60 \* 60 \* 1000/.test(
      code.replace(/\s+/g, " "),
    ),
    "★ 采集器默认超时必须是 24h（原 2h ⇒ 超长任务收到的是「未回结果」而不是真结论）",
  );
});
