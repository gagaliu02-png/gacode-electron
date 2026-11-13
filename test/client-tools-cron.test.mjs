// [2026-11-12 · P7] 本机定时任务的 cron 解析与匹配
//
// 契约依据: cross-platform-sse-event-contract-附录.md **订正 24 §5**（L-24k）
//
// ## 覆盖断言
//
//   · 5 段 cron（分 时 日 月 周）的各种写法：`*` / 单值 / 列表 / 区间 / 步长 / 区间+步长
//   · 月/周的英文名（`jan` / `mon`）
//   · **日/周都受限 ⇒ 取「或」**（标准 cron 语义；只写一个 ⇒ 用那个）
//   · 非法表达式 ⇒ `null`（**不猜**）
//   · `nextCronTime` 严格大于给定时刻
//
// 运行: node --test test/client-tools-cron.test.mjs   (纯函数, 离线)

import test from "node:test";
import assert from "node:assert/strict";

const {
  parseCron,
  parseCronField,
  cronMatches,
  nextCronTime,
  describeCron,
} = await import("../electron/client-tools/cron.ts");

/** 本地时间构造（cron 按**本机时区**判，跟用户看到的时刻一致）。 */
function at(y, m, d, hh, mm) {
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

test("parseCronField：单值 / 列表 / 区间 / 步长", () => {
  assert.deepStrictEqual(parseCronField("5", 0, 59).values, [5]);
  assert.deepStrictEqual(parseCronField("1,3,5", 0, 59).values, [1, 3, 5]);
  assert.deepStrictEqual(parseCronField("2-5", 0, 59).values, [2, 3, 4, 5]);
  assert.deepStrictEqual(parseCronField("*/15", 0, 59).values, [0, 15, 30, 45]);
  assert.deepStrictEqual(parseCronField("1-20/5", 0, 59).values, [1, 6, 11, 16]);
  // 「5/10」⇒ 5,15,25…（上限到 max）
  assert.deepStrictEqual(parseCronField("5/10", 0, 59).values, [5, 15, 25, 35, 45, 55]);
});

test("parseCronField：非法输入 ⇒ null（不猜）", () => {
  for (const bad of ["", "abc", "60", "5-1", "*/0", "1,,2", "1-", "x/2"]) {
    assert.equal(parseCronField(bad, 0, 59), null, `不该接受: ${bad}`);
  }
});

test("parseCron：必须 5 段；月/周可以写英文名", () => {
  assert.equal(parseCron("0 9 * *"), null, "4 段不合法");
  assert.equal(parseCron("0 9 * * * *"), null, "6 段不合法");
  assert.ok(parseCron("0 9 * * 1-5"));
  const p = parseCron("0 0 * jan mon");
  assert.ok(p, "英文月/周名要认");
  assert.deepStrictEqual(p.month.values, [1]);
  assert.deepStrictEqual(p.dow.values, [1]);
});

test("cronMatches：命中 / 不命中", () => {
  assert.equal(cronMatches("0 9 * * *", at(2026, 11, 13, 9, 0)), true);
  assert.equal(cronMatches("0 9 * * *", at(2026, 11, 13, 9, 1)), false);
  assert.equal(cronMatches("0 9 * * *", at(2026, 11, 13, 10, 0)), false);
  // 工作日 9 点
  assert.equal(cronMatches("0 9 * * 1-5", at(2026, 11, 13, 9, 0)), true);   // 周五
  assert.equal(cronMatches("0 9 * * 1-5", at(2026, 11, 15, 9, 0)), false);  // 周日
});

test("★ 日/周都受限 ⇒ 取「或」（标准 cron 语义）", () => {
  // 「每月 1 号」或「每周一」
  // ⚠️ 2026-11-13 是周五 ⇒ 11/9 与 11/2 都是周一, 11/3 是周二。
  const expr = "0 0 1 * 1";
  assert.equal(cronMatches(expr, at(2026, 11, 1, 0, 0)), true, "每月 1 号");
  assert.equal(cronMatches(expr, at(2026, 11, 3, 0, 0)), false, "11/3 既不是 1 号也不是周一");
  assert.equal(cronMatches(expr, at(2026, 11, 9, 0, 0)), true, "11/9 是周一");
});

test("★ 只写日（周是 *）⇒ 只看日；只写周 ⇒ 只看周", () => {
  assert.equal(cronMatches("0 0 15 * *", at(2026, 11, 15, 0, 0)), true);
  assert.equal(cronMatches("0 0 15 * *", at(2026, 11, 16, 0, 0)), false);
  // 只写周三 ⇒ 11/11 是周三, 11/13 是周五 ⇒ 只有 11/11 命中。
  assert.equal(cronMatches("0 0 * * 3", at(2026, 11, 11, 0, 0)), true);
  assert.equal(cronMatches("0 0 * * 3", at(2026, 11, 13, 0, 0)), false, "11/13 是周五");
});

test("nextCronTime：严格大于给定时刻", () => {
  const from = at(2026, 11, 13, 9, 0);
  const next = nextCronTime("0 9 * * *", from);
  assert.ok(next, "必须能算出下一次");
  assert.ok(next.getTime() > from.getTime(), "必须严格大于");
  assert.equal(next.getDate(), 14, "下一次是明天 9 点");
  assert.equal(next.getHours(), 9);
  assert.equal(next.getMinutes(), 0);
});

test("nextCronTime：非法表达式 ⇒ null", () => {
  assert.equal(nextCronTime("不是 cron", new Date()), null);
});

test("describeCron：人话描述", () => {
  assert.equal(describeCron("0 9 * * 1-5"), "分 0 · 时 9 · 周 1,2,3,4,5");
  assert.equal(describeCron("* * * * *"), "每分钟");
  assert.equal(describeCron("乱写"), "表达式不合法");
});
