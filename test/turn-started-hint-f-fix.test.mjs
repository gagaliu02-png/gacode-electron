// [F-fix] 端到端提示文案按 reason 分流 + TurnOrigin 机器来源扩展
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeTmpDir, writeModule } from "../scripts/lib/schedule-loader.mjs";

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const repoSrc = (p) => readFileSync(join(REPO, p), "utf8");

const dir = makeTmpDir("verify-f-fix-hint");
const TI = await import(writeModule(dir, "turn-identity", repoSrc("src/lib/sse/turn-identity.ts")));
const HINT = await import(writeModule(dir, "turn-started-hint", repoSrc("src/lib/turn-started-hint.ts")));

test("F1 readFrameOrigin 认 agent_message，但 cron 只是 reason/source 不是帧 origin", () => {
  assert.equal(TI.readFrameOrigin({ origin: "agent_message" }), "agent_message");
  assert.equal(TI.readFrameOrigin({ origin: "cron" }), null);
  assert.equal(TI.readFrameOrigin({ origin: "unknown" }), null);
});

test("F2 isSystemNoticeMetadata 识别全部机器来源", () => {
  for (const src of ["work_unit_result", "agent_message", "cron"]) {
    assert.equal(TI.isSystemNoticeMetadata({ source: src }), true);
  }
  assert.equal(TI.isSystemNoticeMetadata({ skip_transcript: true }), true);
});

test("F3 提示文案按 reason 分流：agent_message 不说「后台任务回报已到达」", () => {
  assert.match(HINT.turnStartedHintBody("work_unit_result"), /后台任务回报/);
  assert.match(HINT.turnStartedHintBody("agent_message"), /Agent 消息/);
  assert.doesNotMatch(HINT.turnStartedHintBody("agent_message"), /后台任务回报/);
  assert.match(HINT.turnStartedHintBody("cron"), /定时任务/);
  assert.match(HINT.turnStartedHintBody("unknown"), /有新消息/);
});

