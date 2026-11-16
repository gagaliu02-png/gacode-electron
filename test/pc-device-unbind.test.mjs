// [2026-11-17] PC 端「解绑电脑端控制」接线回归断言
//
// 背景：deviceId 是安装实例 UUID，换账号登录时不变 ⇒ 旧账号的绑定不清，
// 新账号注册撞 409 ⇒ PC 永久离线（实测每分钟重试 409）。
//
// 覆盖：
//   ① 主进程 DeviceClient 有 unbind / rebind / unbindOnLogout，且解绑后不注册
//   ② 解绑跨重启保留（从磁盘初始化 unbound 标记，记 reason）
//   ③ 重新登录（token 从无到有）只清「logout 解绑」，不清「manual 解绑」
//   ④ 登出链路：auth.logout() 在 /auth/logout 之前调 unbindOnLogout()
//   ⑤ UI「我的电脑」页有「解绑 / 重新绑定」按钮
//   ⑥ preload / types 桥接齐全
//
// 运行: node --test test/pc-device-unbind.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "../scripts/lib/strip-comments.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const src = (p) => stripComments(readFileSync(join(REPO, p), "utf8"));
const raw = (p) => readFileSync(join(REPO, p), "utf8");

const CLIENT = "electron/client-tools/deviceClient.ts";
const IPC = "electron/client-tools/ipc.ts";
const PRELOAD = "electron/preload.ts";
const TYPES = "shared/types.ts";
const AUTH = "src/lib/auth.tsx";
const CARD = "src/components/client-tools/ClientToolsCard.tsx";

test("① DeviceClient 有 unbind / rebind / unbindOnLogout，解绑后不注册", () => {
  const c = src(CLIENT);
  assert.ok(/async unbind\(/.test(c), "必须有 unbind()");
  assert.ok(/async rebind\(/.test(c), "必须有 rebind()");
  assert.ok(/async unbindOnLogout\(/.test(c), "必须有 unbindOnLogout()");
  assert.ok(
    /if \(this\.unbound\)[\s\S]{0,120}return;/.test(c),
    "ensureConnected() 必须在 unbound 时拒绝注册（否则解绑几秒后又抢回来）",
  );
});

test("② 解绑跨重启保留：从磁盘初始化 + 记 reason", () => {
  const c = src(CLIENT);
  assert.ok(
    /private unbound = isUnboundLocally\(\)/.test(c),
    "unbound 必须从磁盘初始化（重启不许偷偷绑回去）",
  );
  assert.ok(c.includes("unbindReason"), "必须记录解绑原因（logout / manual）");
  assert.ok(/markUnbound\(true, 'manual'\)/.test(c), "手动解绑记 manual");
  assert.ok(/markUnbound\(true, 'logout'\)/.test(c), "登出解绑记 logout");
});

test("③ 重新登录只清 logout 解绑，不清 manual 解绑", () => {
  const c = src(CLIENT);
  assert.ok(
    /getUnbindReason\(\) === 'logout'/.test(c),
    "只有 logout 解绑才在重新登录时自动清标记",
  );
});

test("④ 登出链路：先解绑再撤销 refreshToken", () => {
  const a = src(AUTH);
  const unbindAt = a.indexOf("unbindOnLogout");
  const logoutAt = a.indexOf("authApi.logout");
  assert.ok(unbindAt > 0, "logout() 必须调 unbindOnLogout()");
  assert.ok(logoutAt > 0, "logout() 必须调 /auth/logout");
  assert.ok(
    unbindAt < logoutAt,
    "解绑必须在 /auth/logout 之前（之后 refreshToken 已作废，没凭证解绑）",
  );
});

test("⑤ UI：我的电脑页有解绑 / 重新绑定按钮", () => {
  const card = raw(CARD);
  assert.ok(card.includes("解绑电脑端控制"), "按钮 aria-label 要有「解绑电脑端控制」");
  assert.ok(card.includes("重新绑定"), "解绑后要有「重新绑定」入口");
  assert.ok(card.includes("bridge.unbind()") || card.includes("bridge.rebind()"),
    "按钮必须接到 unbind/rebind 桥");
});

test("⑥ IPC / preload / types 桥接齐全", () => {
  const ipc = src(IPC);
  for (const ch of [
    "gacode:client-tool-unbind",
    "gacode:client-tool-rebind",
    "gacode:client-tool-unbind-on-logout",
  ]) {
    assert.ok(ipc.includes(ch), `主进程必须注册 ${ch}`);
  }
  const pre = src(PRELOAD);
  assert.ok(pre.includes("unbindOnLogout:"), "preload 必须暴露 unbindOnLogout");
  const types = src(TYPES);
  assert.ok(types.includes("unbound: boolean"), "ClientToolStatus 必须有 unbound 字段");
});
