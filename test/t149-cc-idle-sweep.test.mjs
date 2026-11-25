import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ⚠️ 必须在 import 任何模块**之前**设好这两个环境变量：
//   · GACODE_USER_DATA_DIR ⇒ 墓碑/登记表落到临时目录（不碰真实用户数据）
//   · USERPROFILE           ⇒ `os.homedir()` 改道 ⇒ CLI 会话登记项也落到临时目录
//     （这样才能造出「登记项先在、随后消失」的场景，模拟 CLI 进程被杀）
const SANDBOX_HOME = mkdtempSync(join(tmpdir(), 't149-home-'));
const SANDBOX_DATA = mkdtempSync(join(tmpdir(), 't149-data-'));
process.env.USERPROFILE = SANDBOX_HOME;
process.env.GACODE_USER_DATA_DIR = SANDBOX_DATA;

const B = await import('../electron/client-tools/claudeBgSession.ts');
const Busy = await import('../electron/client-tools/ccSessionBusy.ts');
const Tomb = await import('../electron/client-tools/ccAutoClosed.ts');
const Watcher = await import('../electron/client-tools/claudeCodeResultWatcher.ts');
const P = await import('../electron/client-tools/ccPersistentSession.ts');

const FIVE_MIN = 5 * 60 * 1000;
const NOW = 1795589000000;

// ── 造一条 CLI 会话登记项（~/.claude/sessions/<pid>.json）────────────────
function writeSessionFile(pid, sessionId, status, updatedAt) {
  const dir = join(SANDBOX_HOME, '.claude', 'sessions');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${pid}.json`),
    JSON.stringify({
      pid,
      sessionId,
      cwd: 'C:\\sandbox',
      status,
      updatedAt,
      kind: 'background',
      jobId: String(sessionId).split('-')[0],
    }),
    'utf8',
  );
  return join(dir, `${pid}.json`);
}

function removeSessionFile(file) {
  try { rmSync(file); } catch { /* ignore */ }
}

// =========================================================================
// ★ 核心回归护栏：「在跑 ⇒ 永不被空闲巡检误杀」
// =========================================================================

test('T149-CC-1 · ★ 在跑（status=busy）的会话即使 updatedAt 冻结也【不得】被停', () => {
  // 这正是 2026-11-25 的事故形态：
  // bg 会话跑单个长任务 ⇒ 只有 1 次投递 ⇒ updatedAt 冻结在投递那一刻
  // ⇒ 但 CLI 报 status='busy'（实测干活期间全程 busy）
  const stopped = B.shouldStopIdleBgSession({
    rec: { updatedAt: NOW - 30 * 60 * 1000, status: 'busy' },
    status: 'busy',
    now: NOW,
    ttlMs: FIVE_MIN,
  });
  assert.equal(stopped, false, '在跑的会话绝不能因为 updatedAt 冻结而被误杀');
});

test('T149-CC-2 · 真空闲超 TTL 的会话【仍要】被停（不能把巡检改成永不生效）', () => {
  const stopped = B.shouldStopIdleBgSession({
    rec: { updatedAt: NOW - 30 * 60 * 1000, status: 'idle' },
    status: 'idle',
    now: NOW,
    ttlMs: FIVE_MIN,
  });
  assert.equal(stopped, true, '真空闲的会话必须照旧被回收');
});

test('T149-CC-3 · 登记项缺失 ⇒ 不停（信息不足不乱杀）', () => {
  assert.equal(
    B.shouldStopIdleBgSession({ rec: null, now: NOW, ttlMs: FIVE_MIN }),
    false,
  );
});

test('T149-CC-4 · updatedAt 缺失 ⇒ 不停', () => {
  assert.equal(
    B.shouldStopIdleBgSession({ rec: { updatedAt: null, status: 'idle' }, now: NOW, ttlMs: FIVE_MIN }),
    false,
  );
});

test('T149-CC-5 · 刚活跃的会话（updatedAt 很新）不停', () => {
  assert.equal(
    B.shouldStopIdleBgSession({
      rec: { updatedAt: NOW - 1000, status: 'idle' },
      now: NOW,
      ttlMs: FIVE_MIN,
    }),
    false,
  );
});

// =========================================================================
// 共享判据本身
// =========================================================================

test('T149-CC-6 · isClaudeSessionBusy：认 CLI 报的 status / state', () => {
  assert.equal(Busy.isBusyStatus('busy'), true);
  assert.equal(Busy.isBusyStatus('BUSY'), true);
  assert.equal(Busy.isBusyStatus('running'), true);
  assert.equal(Busy.isBusyStatus('thinking'), true);
  assert.equal(Busy.isBusyStatus('idle'), false);
  assert.equal(Busy.isBusyStatus(''), false);
  assert.equal(Busy.isBusyStatus(undefined), false);

  assert.equal(Busy.isClaudeSessionBusy({ rec: { status: 'busy' } }), true);
  assert.equal(Busy.isClaudeSessionBusy({ status: 'busy' }), true);
  assert.equal(Busy.isClaudeSessionBusy({ state: 'running' }), true);
  assert.equal(Busy.isClaudeSessionBusy({ rec: { status: 'idle' } }), false);
  // ⛔ waitingFor 不算忙（不改变 T-128「等用户时照样回收」的语义）
  assert.equal(Busy.isClaudeSessionBusy({ rec: { status: 'idle', waitingFor: 'user' } }), false);
});

test('T149-CC-7 · isClaudeSessionBusy 能从 CLI 登记项查到 busy', () => {
  const sid = 'sess-t149-lookup';
  writeSessionFile(4242, sid, 'busy', NOW);
  assert.equal(Busy.isClaudeSessionBusy({ sessionId: sid }), true);
});

// =========================================================================
// 墓碑：让「被自动关闭」能被准确归因
// =========================================================================

test('T149-CC-8 · 墓碑：写下后能查到，过期后查不到', () => {
  Tomb._resetAutoClosedForTest();
  Tomb.markAutoClosed({ sessionId: 'sess-t149-tomb', bgId: 'sess-t149', at: NOW, reason: 'idle_sweep' });
  const hit = Tomb.findAutoClosed('sess-t149-tomb', NOW);
  assert.ok(hit, '墓碑必须能查到');
  assert.equal(hit.reason, 'idle_sweep');
  assert.equal(hit.bgId, 'sess-t149');
  // 过期后（> 24h）查不到
  assert.equal(Tomb.findAutoClosed('sess-t149-tomb', NOW + 25 * 60 * 60 * 1000), null);
});

// =========================================================================
// ★ watcher：会话被外部关掉时，必须**立刻**收场并给出准确归因
// =========================================================================

test('T149-CC-9 · ★ 会话被空闲巡检关掉（有墓碑）⇒ watcher 立刻报「因空闲被自动关闭」', async () => {
  Tomb._resetAutoClosedForTest();
  const sid = 'sess-t149-auto-closed';
  const file = writeSessionFile(5150, sid, 'busy', NOW);
  Tomb.markAutoClosed({ sessionId: sid, bgId: 'sess-t149', at: Date.now(), reason: 'idle_sweep' });

  const p = Watcher.watchClaudeSessionResult({
    sessionId: sid,
    sinceOffset: 0,
    pollMs: 30,
    timeoutMs: 10_000,
  });
  // 让 watcher 先看到登记项，再模拟「CLI 进程退出 ⇒ 登记文件被删」
  await new Promise((r) => setTimeout(r, 150));
  removeSessionFile(file);

  const r = await p;
  assert.equal(r.ok, false, '会话被关掉时不能报成功');
  assert.ok(
    String(r.error || '').includes('因空闲被自动关闭'),
    `归因必须写明「因空闲被自动关闭」，实际是：${r.error}`,
  );
});

test('T149-CC-10 · 会话消失但无墓碑 ⇒ watcher 立刻报「已消失」', async () => {
  Tomb._resetAutoClosedForTest();
  const sid = 'sess-t149-vanished';
  const file = writeSessionFile(5252, sid, 'busy', NOW);

  const p = Watcher.watchClaudeSessionResult({
    sessionId: sid,
    sinceOffset: 0,
    pollMs: 30,
    timeoutMs: 10_000,
  });
  await new Promise((r) => setTimeout(r, 150));
  removeSessionFile(file);

  const r = await p;
  assert.equal(r.ok, false);
  assert.ok(
    String(r.error || '').includes('已消失'),
    `归因必须是「已消失」，实际是：${r.error}`,
  );
});

// =========================================================================
// 两套 TTL 统一：CLI 侧在跑 ⇒ 常驻登记也不该过期
// =========================================================================

test('T149-CC-11 · ★ 常驻登记表也认「CLI 在跑」⇒ 不因空闲过期（两套 TTL 同一判据）', () => {
  const sid = 'sess-t149-persist';
  writeSessionFile(6161, sid, 'busy', NOW - 30 * 60 * 1000);

  // ⚠️ 登记时刻要**早于** TTL（否则 TTL 条件压根不满足，测的就不是 busy 这条判据了）
  const rec = P.acquirePersistentSession({ session_id: sid, now: NOW - 30 * 60 * 1000 });
  assert.equal(rec.session_id, sid, '登记必须原样保留传入的 id');
  assert.equal(
    P.isPersistentSessionActive(sid, NOW),
    true,
    'CLI 侧在跑 ⇒ 常驻会话不得因空闲过期（否则复用会失败）',
  );
});

test('T149-CC-12 · CLI 侧不在跑 ⇒ 真空闲超 TTL 的常驻会话照旧过期', () => {
  const sid = 'sess-t149-persist-idle';
  writeSessionFile(6262, sid, 'idle', NOW - 30 * 60 * 1000);
  P.acquirePersistentSession({ session_id: sid, now: NOW - 30 * 60 * 1000 });
  assert.equal(
    P.isPersistentSessionActive(sid, NOW),
    false,
    '真空闲的常驻会话必须照旧过期',
  );
});
