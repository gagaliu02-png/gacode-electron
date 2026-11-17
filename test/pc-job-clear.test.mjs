// [2026-11-17] 后台作业「清空」按钮（像执行记录那样一键清）
//
// ⚠️ 纯源码断言（clearFinishedJobs 动真实用户数据，单测只钉接线形状）。
//
// 覆盖：
//   ① localJobs.clearFinishedJobs() 只清终态（reported/failed/cancelled），留 running/queued
//   ② IPC / preload / types 三处桥接齐全
//   ③ UI「已结束」区有「清空」按钮，且只显示已结束数量
//
// 运行: node --test test/pc-job-clear.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../scripts/lib/strip-comments.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = path.join(HERE, '..');
const src = (p) => stripComments(fs.readFileSync(path.join(REPO, p), 'utf8'));
const raw = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

test('① clearFinishedJobs 只清终态，留 running/queued', () => {
  const c = src('electron/client-tools/localJobs.ts');
  assert.ok(/export function clearFinishedJobs\(/.test(c), '必须有 clearFinishedJobs()');
  assert.ok(/j\.status === 'reported'/.test(c), 'reported 是终态');
  assert.ok(/j\.status === 'failed'/.test(c), 'failed 是终态');
  assert.ok(/j\.status === 'cancelled'/.test(c), 'cancelled 是终态');
  // 在跑的不在清空集合里。
  const body = c.slice(c.indexOf('export function clearFinishedJobs('));
  const isFinished = body.slice(0, body.indexOf('const finishedIds'));
  assert.ok(!/j\.status === 'running'/.test(isFinished), 'running 绝不能被清');
  assert.ok(!/j\.status === 'queued'/.test(isFinished), 'queued 绝不能被清');
});

test('② IPC / preload / types 桥接齐全', () => {
  const ipc = src('electron/client-tools/ipc.ts');
  assert.ok(ipc.includes("gacode:client-tool-clear-jobs"), '主进程必须注册 clear-jobs 频道');
  const pre = src('electron/preload.ts');
  assert.ok(pre.includes("clearJobs:"), 'preload 必须暴露 clearJobs');
  const types = src('shared/types.ts');
  assert.ok(types.includes('clearJobs: () => Promise<{ cleared: number }>'), '桥类型必须含 clearJobs');
});

test('③ UI「已结束」区有清空按钮', () => {
  const ui = raw('src/components/client-tools/BackgroundJobsSection.tsx');
  assert.ok(ui.includes('clearJobs'), 'UI 必须调 bridge.clearJobs()');
  assert.ok(ui.includes('清空已结束的后台作业'), '按钮 aria-label 要有「清空」');
  assert.ok(ui.includes('已结束（{settledTotal}）'), '标题显示已结束总数（不是截断后的 10）');
  assert.ok(ui.includes('TrashIcon'), '用垃圾桶图标（跟执行记录一致）');
});
