// [T-180-pc] 「点开思考啥也没有，只有工具记录」的根因护栏。
//
// 病根：T-175 把 thinking 改成点开才拉，但拉回明细后写进 `phasesDetailCache`，
//       而把缓存回填到消息模型的两个 useMemo 都没订阅它 ⇒ setState 后组件重渲染，
//       两个 memo 因依赖没变直接复用旧数组 ⇒ 气泡永远拿着「首屏只有 tool 段」的 phases。
//       缓存键也不一致：展开传 serverId，回填却用 m.id（注入行是 supplement:<inbox_id>）。
//
// 运行: node --test test/pc-t180-lazy-phases-cache.test.mjs（纯源码断言，离线）

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const REPO = join(HERE, "..");
const detail = readFileSync(join(REPO, "src/routes/ChatDetail.tsx"), "utf8");
const list = readFileSync(join(REPO, "src/components/chat/MessageList.tsx"), "utf8");
const api = readFileSync(join(REPO, "src/lib/api.ts"), "utf8");

function between(src, startNeedle, endNeedle) {
  const a = src.indexOf(startNeedle);
  assert.ok(a >= 0, `找不到起点 ${startNeedle}`);
  const b = src.indexOf(endNeedle, a + startNeedle.length);
  assert.ok(b > a, `找不到终点 ${endNeedle}`);
  return src.slice(a, b);
}

test("T-180-1 baseMessages 的缓存回填用 API 行的真 id（与展开/拉取的 serverId 一致）", () => {
  const memo = between(detail, "const baseMessages: ChatMessageModel[] = useMemo", "return list;");
  assert.ok(
    memo.includes("phasesDetailCache[m.id]"),
    "展开侧的 serverId 就是 API 行的 m.id；必须用 m.id 查缓存（模型上的 id 是 supplement:<inbox_id> 合成 id）",
  );
  assert.ok(
    memo.includes("serverId: m.id"),
    "模型要把真 id 存进 serverId，展开/loading 才按同一把键走",
  );
});

test("T-180-2 baseMessages 的 deps 必须订阅 phasesDetailCache", () => {
  const deps = between(detail, "return list;", "]);", ).replace(/^[\s\S]*?\/\/ eslint-disable-next-line[^\n]*\n\s*/, "");
  assert.ok(
    deps.includes("phasesDetailCache"),
    "★ 根因护栏：不订阅缓存 ⇒ 点开拉到明细后 useMemo 直接复用旧数组 ⇒ 思考永远为空",
  );
});

test("T-180-3 messages 的 deps 也必须订阅 phasesDetailCache", () => {
  const tail = detail.slice(detail.indexOf("const messages: ChatMessageModel[] = useMemo"));
  const deps = between(tail, "}, [", "]);");
  assert.ok(
    deps.includes("phasesDetailCache"),
    "messages 派生层也必须订阅，防未来改了 baseMessages 派生方式后回归",
  );
});

test("T-180-5 历史计数字段兼容服务端实际返回的 camelCase（否则折叠区不显示）", () => {
  assert.ok(
    /m\.thinkingCount/.test(api) && /m\.toolCallCount/.test(api),
    "服务端 countPhases() 实际吐 thinkingCount/toolCallCount（不是注释里的 snake_case）⇒ 必须兼容读取",
  );
});

test("T-180-4 展开回调仍按 serverId 拉取，loading 仍透传", () => {
  assert.ok(
    /onExpandPhases[\s\S]{0,120}m\.serverId/.test(list),
    "MessageList 必须把真 id 传给 onExpandPhases（服务端 /phases 端点要真 id）",
  );
  assert.ok(
    list.includes("phasesLoadingIds.has(m.serverId)"),
    "loading 态必须按同一把键判定",
  );
});
