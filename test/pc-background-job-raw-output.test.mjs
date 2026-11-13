// [2026-11-13 · 订正 27] 后台**普通命令**（pc_job_start）的输出必须被捕获。
//
// ## 这个测试为什么存在（现场事故）
//
// gaga 在对话 948 里派了个后台普通命令（`claude -p "ping pang"`），
// 端侧作业日志 **0 字节** ⇒ 服务端只拿到「成功，没有输出」
// ⇒ 汇报轮没有东西可汇报 ⇒ 用户看到的只有「返回内容仅包含成功状态」。
//
// ## 根因（实测矩阵）
//
//   cmd + detached + **内建命令**（echo）   → 输出捕获 ✅
//   cmd + **不** detached + 外部 exe        → 输出捕获 ✅
//   cmd + **detached** + **外部 exe**       → 输出**全丢** ❌（日志 0 字节）
//
// ⇒ `detached:true` + `cmd /c` + 外部程序 ⇒ 子进程**没继承**我们重定向的句柄
//   （被丢给了 detached 带来的另一个 console）⇒ 而这正好是 pc_job_start 的形状。
//
// ⇒ 修法：**由 shell 自己做重定向**（命令里加 `>> "<日志文件>" 2>&1`）
//   ⇒ 输出一定落在文件里。
//
// 运行: node --test test/pc-background-job-raw-output.test.mjs
// ⚠️ 真的起一个子进程（node -e …）—— 无副作用、几秒内结束。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gacode-raw-out-'));
process.env.GACODE_USER_DATA_DIR = TMP;

/**
 * 造一条**真实形状**的外部 exe 命令。
 *
 * ⚠️ 用 `process.execPath` 的**裸路径**（不加引号）：Windows 上它多半带空格
 *    （`C:\Program Files\nodejs\node.exe`）⇒ 真跑起来会失败 ⇒
 *    这条测试要验的是「**输出去哪了**」，不是「命令能不能跑」。
 *    ⇒ 所以用一个**确定存在、且路径无空格**的外部程序：Windows 自带的 `where.exe`。
 */
const EXE = process.platform === 'win32' ? 'where.exe' : 'ls';
const MARK = 'hello-from-raw-job';
const ARG = process.platform === 'win32' ? '*.nonexistent-xyz' : '-la';

const { rawService } = await import('../electron/client-tools/cliService.ts');
const { startJob, pollJob } = await import('../electron/client-tools/jobRunner.ts');
const { getJob } = await import('../electron/client-tools/localJobs.ts');

/** 等作业跑完（最多 20s）。 */
async function waitDone(id, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = getJob(id);
    if (!job) return null;
    const polled = pollJob(job);
    if (polled.done) return polled;
    await new Promise((r) => setTimeout(r, 200));
  }
  return null;
}

test('GC-P27-31 · 后台普通命令的输出必须落在日志里（detached + 直连 exe）', async () => {
  const id = 'raw-out-' + Date.now();
  // ⚠️ 用**真实存在的外部 exe**（where.exe）—— 内建命令（echo）本来就能捕获，
  //    外部程序才是踩坑的那一类（detached + cmd 夹层 ⇒ 输出全丢）。
  const invocation = rawService.buildInvocation({
    args: { command: `${EXE} ${ARG}` },
    cwd: null,
    timeoutMs: null,
    jobId: id,
  });
  assert.ok(invocation, '必须能算出怎么起');
  assert.equal(
    invocation.shellCommand, undefined,
    '★ 简单命令必须**直连 exe**（不走 cmd）—— detached + cmd 夹层会让外部 exe 的输出全丢',
  );
  assert.equal(invocation.command, EXE, '应当直连那个 exe');

  const started = startJob(id, rawService, invocation);
  const polled = await waitDone(id);
  assert.ok(polled, '作业应该能跑完');

  const log = fs.readFileSync(started.outputFile, 'utf8');
  assert.ok(
    log.length > 0,
    `★ 后台命令的输出必须落在日志里（实测 detached+cmd+外部exe 会全丢）; 实际日志=${JSON.stringify(log.slice(0, 200))}`,
  );

  // 汇总也必须带上它（这才是服务端拿到的 stdout）
  const summary = polled.summary || (getJob(id) || {}).summary || '';
  assert.ok(summary.length > 0, `汇总必须包含命令输出; 实际=${JSON.stringify(summary.slice(0, 200))}`);
});

test('GC-P27-31b · 命令失败也要留下痕迹（stderr 同样进日志）', async () => {
  const id = 'raw-err-' + Date.now();
  const invocation = rawService.buildInvocation({
    args: { command: `${EXE} ${ARG}` },
    cwd: null,
    timeoutMs: null,
    jobId: id,
  });
  assert.ok(invocation);
  const started = startJob(id, rawService, invocation);
  await waitDone(id);

  const log = fs.readFileSync(started.outputFile, 'utf8');
  assert.ok(log.length > 0, `命令的输出（哪怕是错误信息）也必须落日志; 实际=${JSON.stringify(log.slice(0, 200))}`);
});

test('GC-P27-31c · 真的需要 shell 的命令仍走 cmd（管道/&&/重定向/变量展开）', async () => {
  const { resolveCommand, canRunDirectly, splitCommandLine } =
    await import('../electron/client-tools/shellSplit.ts');

  // 拆分：带引号的参数是一个整体
  assert.deepEqual(
    splitCommandLine('mytool.exe --flag "hello world"'),
    ['mytool.exe', '--flag', 'hello world'],
  );
  // 需要 shell 的 ⇒ 不能直连
  for (const cmd of ['a | b', 'a && b', 'a > out.txt', 'echo %PATH%', 'a $(b)']) {
    assert.equal(canRunDirectly(cmd), false, `${cmd} 需要 shell, 不能直连`);
    assert.equal(resolveCommand(cmd).direct, false);
  }
  // 简单命令 ⇒ 直连
  assert.equal(canRunDirectly('mytool.exe --flag "hello world"'), true);
  assert.equal(resolveCommand('mytool.exe --flag "hello world"').exe, 'mytool.exe');
});
