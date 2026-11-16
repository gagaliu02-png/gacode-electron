// [2026-11-17] 后台作业表自动压缩（append-only jsonl 不压缩会一直涨）
//
// ★ PM 拍板：作业记录**一条都不删**（「我的电脑」列表要一直看得见历史），
//   也**不删日志**。只把 jsonl 的废行折叠掉（660 行 → 28 行）。
//
// 覆盖：
//   ① 废行超过门槛 ⇒ 压缩（每个 id 只留最后一行），作业一条不少
//   ② 废行少 ⇒ 不动（减少写盘）
//   ③ 老作业 / running / cancelled ⇒ 全都保留（只压缩，不删除）
//   ④ 压缩后仍能正确读取（最后一行状态为准）
//
// 运行: node --test test/pc-job-cleanup.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gacode-job-compact-'));
process.env.GACODE_USER_DATA_DIR = TMP;

const {
  localJobsFile,
  jobLogFile,
  appendJob,
  markJobReported,
  getJob,
  listJobs,
  pruneFinishedJobs,
} = await import('../electron/client-tools/localJobs.ts');

const NOW = Date.now();

function lines() {
  return fs.readFileSync(localJobsFile(), 'utf8').trim().split('\n').filter(Boolean);
}

test('① 废行超过门槛 ⇒ 压缩（每个 id 只留最后一行），作业一条不少', () => {
  const a = 'job-a';
  const b = 'job-b';
  appendJob({ id: a, serviceId: 'raw', startedAt: NOW });
  markJobReported(a);
  appendJob({ id: b, serviceId: 'raw', startedAt: NOW });
  markJobReported(b);
  const before = lines().length; // 4 行（2 作业 × 2 状态）
  assert.ok(before >= 4);

  const res = pruneFinishedJobs(NOW);
  assert.ok(res.compacted, '废行 50% 必须压缩');
  assert.equal(res.removedJobs, 0, '★ 不许删任何作业');
  assert.equal(res.removedLogFiles, 0, '★ 不许删任何日志');
  assert.equal(lines().length, 2, '压成每个作业一行');
  assert.ok(getJob(a) && getJob(b), '两个作业都还在');
});

test('② 废行少 ⇒ 不动（减少写盘）', () => {
  const id = 'job-single';
  appendJob({ id, serviceId: 'raw', startedAt: NOW });
  const before = fs.readFileSync(localJobsFile(), 'utf8');
  const res = pruneFinishedJobs(NOW);
  assert.equal(res.compacted, false);
  assert.equal(fs.readFileSync(localJobsFile(), 'utf8'), before, '文件不许变');
});

test('③ 老作业 / running / cancelled ⇒ 全都保留（只压缩，不删除）', () => {
  const old = 'job-old';
  const running = 'job-running';
  const cancelled = 'job-cancelled';
  const OLD = NOW - 90 * 24 * 60 * 60 * 1000; // 90 天前
  // 造一堆历史行，触发压缩。
  const file = localJobsFile();
  const rows = [];
  for (const [id, status, startedAt] of [
    [old, 'reported', OLD], [running, 'running', OLD], [cancelled, 'cancelled', OLD],
  ]) {
    for (let i = 0; i < 4; i++) {
      rows.push(JSON.stringify({ ts: OLD + i * 1000, id, serviceId: 'raw', status, startedAt }));
    }
    // 造日志文件，确认不会被删。
    fs.mkdirSync(path.dirname(jobLogFile(id)), { recursive: true });
    fs.writeFileSync(jobLogFile(id), 'log');
  }
  fs.appendFileSync(file, '\n' + rows.join('\n') + '\n');

  const res = pruneFinishedJobs(NOW);
  assert.ok(res.compacted);
  assert.equal(res.removedJobs, 0);
  assert.equal(res.removedLogFiles, 0);
  for (const id of [old, running, cancelled]) {
    assert.ok(getJob(id), `${id} 必须保留（哪怕 90 天前）`);
    assert.ok(fs.existsSync(jobLogFile(id)), `${id} 的日志必须保留`);
  }
});

test('④ 压缩后仍能正确读取（最后一行状态为准）', () => {
  const jobs = listJobs();
  assert.ok(jobs.every((j) => j && j.id && j.serviceId), '剩下的作业形状必须完整');
  assert.equal(getJob('job-running').status, 'running', '保留的必须是最后一次状态');
});
