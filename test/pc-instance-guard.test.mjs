// [2026-11-18 · T-038 方案 A] PC 端「执行器实例锁」单测
//
// 覆盖断言：
//   IG-1  首次启动 ⇒ 拿到锁（owner 文件写出来了）
//   IG-2  二次启动（owner 还活着）⇒ **拿不到** ⇒ 让位
//   IG-3  owner 心跳过期 **且** pid 不在 ⇒ 可接管（崩溃残留自动清理）
//   IG-4  owner 心跳过期 **但** pid 还活着 ⇒ **仍然算活**（心跳迟到 ≠ 死了）
//   IG-5  release 只删**自己**的锁（不会把别人的锁删了）
//   IG-6  heartbeat 只有 owner 能续（别人的续不动）
//   IG-7  锁文件损坏 ⇒ 当成无主 ⇒ 可接管
//   IG-8  身份判别：**默认 profile 下 dev 与 release 共用一把锁**
//         （锁键 = %APPDATA%\Gacode ⇒ 本次事故的根因场景被覆盖）
//   IG-9  显式 profile ⇒ userData/锁全独立 ⇒ 合法多实例互不干扰
//   IG-10 聚焦请求：写一次、消费一次；消费后文件消失
//
// ⚠️ 本文件**不 import electron** ⇒ `node --test` 能直接加载。
// 运行: node --test test/pc-instance-guard.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const {
  resolveProfile,
  readOwner,
  isOwnerAlive,
  acquireInstanceLock,
  heartbeatInstanceLock,
  releaseInstanceLock,
  requestFocus,
  consumeFocusRequest,
  INSTANCE_STALE_MS,
} = await import('../electron/instance-guard.ts');

function tmpDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gacode-ig-'));
  return d;
}

// ── IG-1 / IG-2 ──────────────────────────────────────────────────────────
test('IG-1 首次启动拿到锁', () => {
  const dir = tmpDir();
  const p = resolveProfile(dir, null);
  const r = acquireInstanceLock(p.lockFile, { instanceId: 'inst-A', pid: 111 });
  assert.equal(r.ok, true);
  assert.equal(r.owner.instanceId, 'inst-A');
  assert.equal(r.owner.pid, 111);
  const owner = readOwner(p.lockFile);
  assert.ok(owner, '锁文件应该存在');
  assert.equal(owner.instanceId, 'inst-A');
});

test('IG-2 二次启动拿不到锁（owner 活着）⇒ 让位', () => {
  const dir = tmpDir();
  const p = resolveProfile(dir, null);
  const a = acquireInstanceLock(p.lockFile, { instanceId: 'inst-A', pid: 111, pidAlive: () => true });
  assert.equal(a.ok, true);
  const b = acquireInstanceLock(p.lockFile, { instanceId: 'inst-B', pid: 222, pidAlive: () => true });
  assert.equal(b.ok, false);
  assert.equal(b.reason, 'held_by_live_instance');
  assert.equal(b.owner.instanceId, 'inst-A');
  // ⇒ 锁没被 B 抢走
  assert.equal(readOwner(p.lockFile).instanceId, 'inst-A');
});

// ── IG-3 / IG-4 ──────────────────────────────────────────────────────────
test('IG-3 owner 心跳过期且 pid 不在 ⇒ 可接管', () => {
  const dir = tmpDir();
  const p = resolveProfile(dir, null);
  const now = 1_000_000;
  acquireInstanceLock(p.lockFile, { instanceId: 'inst-A', pid: 111, now });
  // 心跳过期（now 前进 > stale）+ pid 已死
  const later = now + INSTANCE_STALE_MS + 5_000;
  const b = acquireInstanceLock(p.lockFile, {
    instanceId: 'inst-B', pid: 222, now: later, pidAlive: () => false,
  });
  assert.equal(b.ok, true, '死掉的 owner 必须能被接管');
  assert.equal(readOwner(p.lockFile).instanceId, 'inst-B');
});

test('IG-4 owner 心跳过期但 pid 还活着 ⇒ 仍算活（心跳迟到 ≠ 死了）', () => {
  const dir = tmpDir();
  const p = resolveProfile(dir, null);
  const now = 1_000_000;
  acquireInstanceLock(p.lockFile, { instanceId: 'inst-A', pid: 111, now });
  const later = now + INSTANCE_STALE_MS + 5_000;
  const b = acquireInstanceLock(p.lockFile, {
    instanceId: 'inst-B', pid: 222, now: later, pidAlive: () => true,
  });
  assert.equal(b.ok, false, 'pid 还活着就不能抢');
  assert.equal(b.owner.instanceId, 'inst-A');
});

// ── IG-5 / IG-6 ──────────────────────────────────────────────────────────
test('IG-5 release 只删自己的锁', () => {
  const dir = tmpDir();
  const p = resolveProfile(dir, null);
  acquireInstanceLock(p.lockFile, { instanceId: 'inst-A', pid: 111 });
  // B 试着删 A 的锁 ⇒ 不许删
  assert.equal(releaseInstanceLock(p.lockFile, 'inst-B'), false);
  assert.ok(fs.existsSync(p.lockFile), '别人的锁不能被删');
  // A 自己删 ⇒ 删掉
  assert.equal(releaseInstanceLock(p.lockFile, 'inst-A'), true);
  assert.equal(fs.existsSync(p.lockFile), false);
});

test('IG-6 heartbeat 只有 owner 能续', () => {
  const dir = tmpDir();
  const p = resolveProfile(dir, null);
  acquireInstanceLock(p.lockFile, { instanceId: 'inst-A', pid: 111, now: 1000 });
  assert.equal(heartbeatInstanceLock(p.lockFile, 'inst-B', 2000), false);
  assert.equal(heartbeatInstanceLock(p.lockFile, 'inst-A', 2000), true);
  assert.equal(readOwner(p.lockFile).heartbeatAt, 2000);
});

// ── IG-7 ──────────────────────────────────────────────────────────────────
test('IG-7 锁文件损坏 ⇒ 当成无主 ⇒ 可接管', () => {
  const dir = tmpDir();
  const p = resolveProfile(dir, null);
  fs.mkdirSync(p.userDataDir, { recursive: true });
  fs.writeFileSync(p.lockFile, '{not json', 'utf8');
  assert.equal(readOwner(p.lockFile), null);
  const r = acquireInstanceLock(p.lockFile, { instanceId: 'inst-B', pid: 222 });
  assert.equal(r.ok, true);
  assert.equal(readOwner(p.lockFile).instanceId, 'inst-B');
});

// ── IG-8 / IG-9 ──────────────────────────────────────────────────────────
test('IG-8 默认 profile：dev 与 release 共用一把锁（事故根因场景）', () => {
  const dir = tmpDir();
  const dev = resolveProfile(dir, null);          // dev（改 userData 之前也是这个目录）
  const rel = resolveProfile(dir, null);          // release
  assert.equal(dev.lockFile, rel.lockFile, '默认必须同锁');
  assert.equal(dev.userDataDir, path.join(dir, 'Gacode'));
  // ⇒ 模拟：dev 先拿到锁，release 后启动 ⇒ release 拿不到
  acquireInstanceLock(dev.lockFile, { instanceId: 'dev', pid: 1, pidAlive: () => true });
  const r = acquireInstanceLock(rel.lockFile, { instanceId: 'rel', pid: 2, pidAlive: () => true });
  assert.equal(r.ok, false, 'dev 与 release 不能并存（否则抢结算）');
});

test('IG-9 显式 profile ⇒ userData/锁全独立 ⇒ 合法多实例互不干扰', () => {
  const dir = tmpDir();
  const a = resolveProfile(dir, 'dev');
  const b = resolveProfile(dir, 'rel');
  assert.notEqual(a.lockFile, b.lockFile);
  assert.equal(a.userDataDir, path.join(dir, 'Gacode-dev'));
  assert.equal(b.userDataDir, path.join(dir, 'Gacode-rel'));
  // 两边各拿各的锁 ⇒ 都成功
  assert.equal(acquireInstanceLock(a.lockFile, { instanceId: 'a', pid: 1 }).ok, true);
  assert.equal(acquireInstanceLock(b.lockFile, { instanceId: 'b', pid: 2 }).ok, true);
  // 非法字符被清洗（不许用 profile 名穿越目录）
  const c = resolveProfile(dir, '../../evil');
  assert.equal(c.userDataDir, path.join(dir, 'Gacode-evil'));
});

// ── IG-10 ─────────────────────────────────────────────────────────────────
test('IG-10 聚焦请求：写一次消费一次，消费后文件消失', () => {
  const dir = tmpDir();
  const p = resolveProfile(dir, null);
  assert.equal(consumeFocusRequest(p.focusRequestFile), false);
  requestFocus(p.focusRequestFile, { fromPid: 42 });
  assert.equal(consumeFocusRequest(p.focusRequestFile), true);
  assert.equal(fs.existsSync(p.focusRequestFile), false);
  assert.equal(consumeFocusRequest(p.focusRequestFile), false);
});

// ── 判活函数本身 ──────────────────────────────────────────────────────────
test('isOwnerAlive：null / 心跳新鲜 / 心跳过期+pid死 / 心跳过期+pid活', () => {
  assert.equal(isOwnerAlive(null, 1000), false);
  const owner = { version: 1, pid: 7, instanceId: 'x', startedAt: 0, heartbeatAt: 1000 };
  assert.equal(isOwnerAlive(owner, 1000 + INSTANCE_STALE_MS - 1, { pidAlive: () => false }), true);
  assert.equal(isOwnerAlive(owner, 1000 + INSTANCE_STALE_MS + 1, { pidAlive: () => false }), false);
  assert.equal(isOwnerAlive(owner, 1000 + INSTANCE_STALE_MS + 1, { pidAlive: () => true }), true);
});
