// [2026-11-17] PC 端「设备通道掉线」两条回归断言
//
// 背景（真机日志 AppData\Roaming\Gacode\client-tools.log，2026-11-17 14:25~14:32）：
//
//   病根 ① **切号时反复重试注册**
//   ```
//   14:29:31  连接失败: 注册失败 409: {"error":"DEVICE_BOUND_TO_OTHER_USER","message":"这台电脑已经绑定到别的账号"}
//   14:29:34  连接失败: 注册失败 409: …            ← 3s→6s→…→60s 退避重试
//   14:32:08  连接失败: 注册失败 409: …            ← 整整 3 分钟，日志刷满
//   ```
//   ⇒ 绑定关系不会自己变 ⇒ **重试不可能成功** ⇒ 必须停下来等用户切号 / 手动解绑。
//
//   病根 ② **token 短暂为空就掐掉通道**
//   ```
//   14:25:55.032  注册成功 deviceId=969e7158-…
//   14:25:55.179  setAccessToken token 为空（changed=true）
//   14:25:55.182  连接被中止（换 token / 退出）      ← ★ 正在跑的设备通道 SSE 被掐
//   ```
//   ⇒ 那一下只是**刷新 token 过程中的瞬时态**（换新 token 前先把旧的清了）
//   ⇒ 却把通道掐了 ⇒ 设备通道掉线 ⇒ **派单收不到**（用户看到「我的电脑离线」但其实只是抖了一下）。
//
// 运行: node --test test/pc-device-channel-stability.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "../scripts/lib/strip-comments.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const src = (p) => stripComments(readFileSync(join(REPO, p), "utf8"));

const CLIENT = "electron/client-tools/deviceClient.ts";

test("① 409「已绑定到别的账号」⇒ 不重试（重试不可能成功）", () => {
  const c = src(CLIENT);
  assert.ok(
    /DEVICE_BOUND_TO_OTHER_USER/.test(c),
    "必须识别 DEVICE_BOUND_TO_OTHER_USER（否则 409 会被当成可重试失败）",
  );
  assert.ok(
    /err\.code = 'DEVICE_BOUND_TO_OTHER_USER'/.test(c),
    "注册失败时必须把这个 code 挂到 error 上（让 ensureConnected 能分辨）",
  );
  assert.ok(
    /code === 'DEVICE_BOUND_TO_OTHER_USER'[\s\S]{0,400}return;/.test(c),
    "ensureConnected 的 catch 里命中该 code ⇒ 必须 return 且**不** scheduleRetry()",
  );
  assert.ok(
    /res\.status === 409[\s\S]{0,160}DEVICE_BOUND_TO_OTHER_USER/.test(c),
    "必须先看 status=409 再看错误体（别对所有 409 都停）",
  );
});

test("② token 短暂为空 ⇒ 不立刻掐通道（宽限期内有 token 就当没事）", () => {
  const c = src(CLIENT);
  assert.ok(
    /NULL_TOKEN_GRACE_MS/.test(c),
    "必须有「token 为空的宽限窗口」常量",
  );
  assert.ok(
    /if \(!token\)[\s\S]{0,120}scheduleNullTokenGrace\(\)[\s\S]{0,80}return;/.test(c),
    "setAccessToken 里 token 为空 ⇒ 走宽限 + 直接 return（**不许**再往下走到 abort 那段）",
  );
  assert.ok(
    /scheduleNullTokenGrace\(\)[\s\S]{0,600}if \(this\.accessToken\) return;/.test(c),
    "宽限回调里：期间补上了 token ⇒ 当没事（不掐通道）",
  );
  assert.ok(
    /markUnbound\(true, 'logout'\)/.test(c),
    "宽限期满仍无 token（= 真登出）⇒ 标记已解绑",
  );
  assert.ok(
    /this\.abort\.abort\(\)/.test(c),
    "宽限期满仍无 token ⇒ 才掐掉正在跑的连接",
  );
});

test("③ 宽限期内补上 token ⇒ 取消宽限计时器（不会随后又被掐）", () => {
  const c = src(CLIENT);
  assert.ok(
    /clearTimeout\(this\._nullTokenTimer\)/.test(c),
    "补上 token 时必须 clearTimeout 宽限计时器",
  );
  assert.ok(
    /this\._nullTokenTimer = null/.test(c),
    "清掉计时器引用（别留一个会误触发的旧定时器）",
  );
});
