// [2026-11-13] PC 端「自己的交付气泡也没了」的回归断言
//
// ---------------------------------------------------------------------------
// gaga 2026-11-13 真机报障：PC 端本地写文件 ⇒ **PC 自己也没有交付气泡**。
//
// ## 病根（跨两个仓的契约裂缝）
//
//   ① 服务端（unified-api · 契约附录 **订正 26**）：**端侧产物的可见性按「哪一端」判**
//      —— 只有 `X-Client-Id: pc` 的连接收得到端侧产物事件；别的端（web / 安卓 /
//      **认不出端标识的**）一律剥掉（历史回放里也剥）。
//   ② PC 客户端（gacode-electron `src/lib/api.ts`）：**`X-Client-Id` 跟能力探测绑在一起**
//      —— `if (caps) { headers.set("X-Client-Capabilities", caps); headers.set("X-Client-Id","pc") }`
//      而 `caps` 来自**异步**探测（`initClientCapabilities()` 要走 IPC 问主进程 node-pty 在不在）
//      ⇒ 探测没跑完的那些请求**不带端标识** ⇒ 服务端认成 `unknown` ⇒ 当成别的端
//      ⇒ **历史回放里端侧产物被剥掉** ⇒ 轮次结束、气泡切到历史行时，PC 自己的气泡也没了。
//
// ⇒ 端标识**恒带**（身份），能力头才受探测结果影响（能力）。
//
// ⚠️ 这些断言只看**代码形状**（不渲染 React、不发请求）。
//
// 运行: node --test test/pc-client-id-header.test.mjs   (完全离线)

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

const API = "src/lib/api.ts";
const STREAM_HEADERS = "src/lib/sse/client-id.ts";

test("① 普通请求（历史回放走的就是它）必须**无条件**带 X-Client-Id", () => {
  const code = repoCode(API);
  // 端标识的 set 必须**不在** `if (caps)` 块里
  const setIdIdx = code.indexOf('headers.set("X-Client-Id", "pc")');
  assert.ok(setIdIdx > 0, "api.ts 必须设置 X-Client-Id");
  // 找它前面最近的 `if (caps)`，如果那个 if 的花括号在 setIdIdx 之前闭合 ⇒ 不在块里
  const ifIdx = code.indexOf("if (caps)");
  if (ifIdx < 0 || ifIdx > setIdIdx) {
    assert.ok(true, "端标识的 set 不在能力探测的 if 里 ⇒ 恒带 ✔");
  } else {
    const closeIdx = code.indexOf("}", ifIdx);
    assert.ok(
      setIdIdx < closeIdx,
      "端标识的 set 不能在 `if (caps)` 块里 —— 能力探测是异步的，没跑完就没有 caps ⇒ 端标识丢失 ⇒ 服务端认不出是 PC ⇒ 端侧产物被当别的端剥掉",
    );
  }
});

test("② 能力头仍然受探测结果控制（缺能力 ⇒ 服务端不下发 pc_* 工具）", () => {
  const code = repoCode(API);
  assert.ok(
    code.includes('headers.set("X-Client-Capabilities", caps)'),
    "能力头必须照旧发（X-Client-Capabilities）",
  );
  assert.ok(
    code.includes("clientCapabilityHeader()"),
    "能力头必须走 clientCapabilityHeader()（探测结果）",
  );
});

test("③ 聊天流三条路恒带端标识（stream 路径本来就是对的，别改坏）", () => {
  const code = repoCode(STREAM_HEADERS);
  assert.ok(
    code.includes("headers[CLIENT_ID_HEADER] = opts.clientId"),
    "聊天流请求头必须恒带端标识（契约 L-28 / D3）",
  );
  assert.ok(
    code.includes("if (opts.clientCapabilities)"),
    "能力头在流路径上才受探测结果影响",
  );
});
