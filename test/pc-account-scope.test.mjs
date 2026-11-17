// [2026-11-17] 解绑 / 登出 ⇒ 清掉上一账号的本机记录 + UI 只显示最近 10 条
//
// ⚠️ 纯源码断言（不执行任何删除）—— 清理函数动的是真实用户数据，
//    单测只钉「接线形状」，行为由手工解绑验证。
//
// 覆盖：
//   ① accountScope 清的是作业 / 派单 / 审计 / 日志，不清本机设置
//   ② deviceClient 在 unbind / unbindOnLogout 两条路都调用清理
//   ③ UI: BackgroundJobsSection 只显示最近 10 条已结束作业（活跃的全显示）
//
// 运行: node --test test/pc-account-scope.test.mjs

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

test('① accountScope 清作业 / 派单 / 审计 / 日志，不清本机设置', () => {
  const code = src('electron/client-tools/accountScope.ts');
  for (const f of ['localJobsFile()', 'dispatchLedgerFile()', 'client-done.json', 'client-audit.jsonl', 'jobsDir()']) {
    assert.ok(code.includes(f), `必须清 ${f}`);
  }
  for (const f of ['client-gate.json', 'local-tasks.json', 'bookmarks.json', 'device-id.json']) {
    assert.equal(code.includes(f + '"'), false, `${f} 不许清（跟账号无关）`);
  }
});

test('② deviceClient 在 unbind / unbindOnLogout 两条路都调用清理', () => {
  const c = src('electron/client-tools/deviceClient.ts');
  assert.ok(c.includes("from './accountScope.ts'"), '必须 import 清理模块');
  const calls = c.match(/clearAccountScopedLocalData\(\)/g) || [];
  assert.ok(calls.length >= 2, `解绑和登出两条路都要清，实际 ${calls.length} 处`);
});

test('③ UI 只显示最近 10 条已结束作业（活跃全显示）', () => {
  const ui = raw('src/components/client-tools/BackgroundJobsSection.tsx');
  assert.ok(/MAX_SETTLED_SHOWN\s*=\s*10/.test(ui), '常量应为 10');
  assert.ok(/slice\(0,\s*MAX_SETTLED_SHOWN\)/.test(ui),
    '已结束作业必须截断到最近 10 条');
  assert.ok(/active: activeJobs/.test(ui), '在跑的作业必须全显示（不截断）');
  assert.ok(ui.includes('已隐藏'), '要告诉用户「更早的记录仍在本机」');
});
