// [2026-11-19 · T-068 / T-072] `pc_cc_send` 后台 job 化的回归断言（替代 T-042「立即回传」）
//
// 契约：
//   · `pc_cc_send` 的「已投递」回执**不许**走 D3 立即回传；
//   · handler 只 markDispatch(running)，真结果由 peerJobManager 在
//     notice / 慢 poll / 24h 超时时裁决后调 reportJobResult 一次；
//   · 只有「起作业失败」才立即回传失败（老路径不变）；
//   · detached 作业类工具（pc_shell 等）依旧只标 running，不许提前报成功。
//
// 运行: node --test test/pc-late-result-tools.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'electron/client-tools/deviceClient.ts');
const EXEC = path.join(ROOT, 'electron/client-tools/executor.ts');
const IPC = path.join(ROOT, 'electron/client-tools/ipc.ts');

function codeOnly(file) {
  return fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const src = codeOnly(SRC);
const exec = codeOnly(EXEC);
const ipc = codeOnly(IPC);

test('T068-P1 ⛔ 不再有 LATE_RESULT_TOOLS「立即把已投递当结果回传」的分支', () => {
  assert.ok(!src.includes('LATE_RESULT_TOOLS'), 'T-042 的立即回传清单必须删除');
  // 成功路径只标 running + emitJobsChanged + return（中间不许 reportJobResult）
  const start = src.indexOf('async handleBackgroundDispatch');
  const branch = src.slice(start, start + 3500);
  const success = branch.slice(branch.indexOf('if (result.status'));
  const mark = success.indexOf("markDispatch(pendingId, { state: 'running' })");
  assert.ok(mark > 0, '成功路径必须标 running');
  const tail = success.slice(mark, success.indexOf('return;', mark) + 'return;'.length);
  assert.ok(!tail.includes('reportJobResult('), '成功（含 pc_cc_send）不许在 handler 里立即回传');
  assert.match(tail, /markDispatch\([\s\S]{0,120}emitJobsChanged\(\);[\s\S]{0,40}return;/,
    'detached 作业路径：markDispatch → emitJobsChanged → return');
});

test('T068-P2 ★ pcCcSend 投递 + 订阅后立即返回；不前台等结果', () => {
  assert.match(exec, /claudeCodePeerInbox\.register\(\{/, '必须先登记 msgId 映射');
  assert.match(exec, /sendPeerControl\(sessionId, ['"]notify_when_idle['"]/, '必须发订阅帧');
  assert.match(exec, /peerJobManager\.track\(/, '必须把 job 交给后台管理器');
  assert.ok(!exec.includes('watchClaudeSessionResult'), 'pc_cc_send 不再前台 await watcher');
  assert.ok(!exec.includes('PC_CC_SEND_WAIT_TIMEOUT_MS'), '旧的 9 分钟等待上限必须删除');
  // 先 register 再 sendPeerControl（顺序契约）
  assert.ok(
    exec.indexOf('claudeCodePeerInbox.register({') < exec.indexOf("sendPeerControl(sessionId, 'notify_when_idle'"),
    'inbox 映射必须在订阅帧之前登记',
  );
});

test('T068-P3 ★ peer-job 管理器：notice/poll/超时只回传一次；取消走 cancelledByUser', () => {
  assert.match(src, /const PEER_JOB_DEADLINE_MS = 24 \* 60 \* 60 \* 1000/, '24h deadline');
  assert.match(src, /const PEER_JOB_POLL_MS = 45_000/, '慢 poll 45s 兜底');
  // ★ [T-174-ccreport] 「只认 task_id 匹配的结果块」这条不变量不变，
  //   只是查找方式从「取第一个块再比 task_id」改成「按 task_id 精确挑块」
  //   （一条消息里可能有多个 task_id 的结果块 —— 生产实证 2026-11-27）。
  assert.match(src, /parseGaclawResultBlocks\(text\)\.find\(\(b\) => b\.task_id === job\.taskId\)/,
    '只认 task_id 匹配的结果块');
  assert.match(src, /cancelledByUser: true/, '用户停止要带 cancelledByUser');
  assert.match(src, /recoverOrphans\(\)/, '启动清扫孤儿');
  assert.match(src, /if \(!job \|\| job\.settled\) return;/, '回传只能一次');
});

test('T086-P5 ★ [T-086] pcCcSend 从 args 读 reply-to（含容错别名）并传给 sendPeerMessage', () => {
  assert.match(exec, /function readPeerReplyTo\(/, '必须有 reply-to 读取函数');
  assert.match(exec, /reply_to_business_session_id/, '服务端字段名 business');
  assert.match(exec, /reply_to_cc_session_id/, '服务端字段名 cc');
  assert.match(exec, /reply_channel/, '服务端字段名 channel');
  assert.match(exec, /replyToBusinessSessionId/, 'camelCase 别名 business');
  assert.match(exec, /replyToCcSessionId/, 'camelCase 别名 cc');
  assert.match(exec, /replyChannel/, 'camelCase 别名 channel');
  assert.match(exec, /args\.reply_to/, '嵌套 reply_to 对象容错');
  assert.match(exec, /sendPeerMessage\(sessionId, text, priority, taskId, replyTo\)/, 'reply-to 传给 sendPeerMessage');
  assert.match(exec, /task_id: taskId/, '结果块回执仍带 task_id');
});

test('T068-P4 ★ stopTask / stopAllTasks 接上 peer-job 取消；IPC 启动接线', () => {
  assert.match(src, /stopTask\(pendingId: string\): boolean \{[\s\S]{0,200}peerJobManager\.cancel/,
    'stopTask 必须取消 peer-job');
  assert.match(src, /stopAllTasks\(\): number \{[\s\S]{0,260}peerJobManager\.cancel/,
    '急停必须取消 peer-job');
  assert.match(ipc, /peerJobManager\.start\(/, 'IPC 启动时接 reportJobResult');
  assert.match(ipc, /peerJobManager\.recoverOrphans\(\)/, 'IPC 启动时扫孤儿');
});

// ── [T-069] pc_cc_control(notify_when_idle) 可观测性 ───────────────────

test('T069-P1 ★ pcCcControl notify_when_idle 分支：合法 from + 诊断映射 + msg_id 回传', () => {
  // claudeCodePeerInbox.start() 被调用（拿合法 reply target）
  assert.match(exec, /if \(action === 'notify_when_idle'\) \{[\s\S]{0,1200}claudeCodePeerInbox\.start\(\)/);
  // from 来自 inbox.from()，不再硬编码 uds:gaclaw
  assert.match(exec, /claudeCodePeerInbox\.from\(\)/);
  assert.ok(!exec.includes("from: 'uds:gaclaw'"), '不许继续用硬编码 uds:gaclaw');
  // 登记诊断映射
  assert.match(exec, /claudeCodePeerInbox\.registerDiagnostic\(msgId, sessionId/);
  // stdout 回传 msg_id 与 from
  assert.match(exec, /status: 'subscribed',[\s\S]{0,200}msg_id: msgId,[\s\S]{0,80}from,/);
  // 发送时带 msg_id + 显式 from
  assert.match(exec, /sendPeerControl\(sessionId, 'notify_when_idle', \{[\s\S]{0,100}msg_id: msgId[\s\S]{0,100}\}, \{ from \}\)/);
});

test('T069-P2 ★ inbox 诊断 notice 不回传 D3，只记日志', () => {
  const inboxSrc = fs.readFileSync(path.join(ROOT, 'electron/client-tools/claudeCodePeerInbox.ts'), 'utf8');
  assert.match(inboxSrc, /registerDiagnostic\(msgId: string, sessionId: string/);
  assert.match(inboxSrc, /getDiagnostic\(msgId: string\)/);
  assert.match(inboxSrc, /if \(entry\.diagnostic\) \{[\s\S]{0,300}peerLog\('cc-peer-inbox', 'diagnostic notice '/);
  // diagnostic 分支在 noticeHandler 之前 return（不触发 D3）
  // ⚠️ [T-154-cc] 这里原来只截 1000 字符 ⇒ 我在前面加了一段「未知 msg_id 留诊断」
  //   的日志就把 `if (entry.diagnostic)` 顶出窗口了（位置断言太脆）⇒ 改成不截断。
  const dispatch = inboxSrc.slice(inboxSrc.indexOf('private dispatch('));
  const diagReturn = dispatch.indexOf('if (entry.diagnostic)');
  const handlerCall = dispatch.indexOf('this.noticeHandler?.(');
  assert.ok(diagReturn > 0 && handlerCall > diagReturn, '诊断分支必须在 noticeHandler 之前 return');
});

// ── [T-154-cc] 事故修复：notify / pc_cc_new 必须有**真采集器** ─────────────

test('T154-P1 ★ [T-154-cc] notify_when_idle 必须挂真采集器（不再是「只记日志」）', () => {
  const collectorSrc = fs.readFileSync(path.join(ROOT, 'electron/client-tools/ccResultCollector.ts'), 'utf8');
  assert.match(collectorSrc, /export const ccResultCollector/, '采集器单例必须存在');
  assert.match(collectorSrc, /hasPendingForSession\(sessionId: string\): boolean/, '要能回答「这个会话还有没有未回传的结果」');

  const start = exec.indexOf("if (action === 'notify_when_idle') {");
  const end = exec.indexOf("return fail(`不支持的 action", start);
  const branch = exec.slice(start, end > 0 ? end : start + 4000);
  assert.match(branch, /ccResultCollector\.register\(\{/, 'notify 必须挂真采集器');
  assert.match(branch, /businessSessionId,/, '采集器必须带业务会话号（结果投回哪儿）');
  assert.match(branch, /taskId: msgId,/, '采集器的 task_id 必须与注入契约里的 task_id 一致');
  // 订阅帧失败 ⇒ 采集器也要撤（不许留一个永远等不到的采集）
  assert.match(branch, /ccResultCollector\.cancel\(collectorKey\)/, '订阅失败必须撤采集器');
});

test('T154-P2 ★ [T-154-cc] pc_cc_new 必须注入回报合同并登记采集器', () => {
  const start = exec.indexOf('async function pcCcNewBg(');
  const end = exec.indexOf('/** pc_cc_close', start);
  const branch = exec.slice(start, end > 0 ? end : start + 6000);
  assert.match(branch, /ccResultCollector\.register\(\{/, 'pc_cc_new 必须登记采集器');
  assert.match(branch, /collectBusinessSession/, '必须能拿到业务会话号');
  // ⚠️ 合同必须**跟着初始 prompt 走**（必达）—— 事后 peer 注入会撞
  //   `session_not_live`（会话刚起时 socket 未必就绪）⇒ 合同可能根本没送进去。
  assert.match(branch, /buildNotifyPeerMessageContent\(/, '回报合同必须拼进初始 prompt');
  assert.match(branch, /task: taskWithContract/, '起会话时必须用带合同的 prompt');
  // ⚠️ pc_cc_new 是**同步**工具 ⇒ 服务端 pending 已结清 ⇒ **不许**走 D3 回传。
  assert.ok(!branch.includes('reportJobResult('), 'pc_cc_new 不许走 D3（pending 已结清 ⇒ 会撞 409）');
  // opts 必须透传进来（否则拿不到 pendingId / 业务会话号）
  const dispatchStart = exec.indexOf("if (tool === 'pc_cc_new') return pcCcNewBg(");
  assert.ok(dispatchStart > 0, 'pc_cc_new 必须走专门分支');
  assert.match(exec.slice(dispatchStart, dispatchStart + 120), /pcCcNewBg\(args, cwd, opts\)/, 'opts 必须透传');
});

test('T154-P3 ★ [T-154-cc] 采集结果回投走**业务会话收件箱**（不是 D3）', () => {
  const src2 = codeOnly(SRC);
  assert.match(src2, /async sendCollectedResult\(/, 'deviceClient 必须有收件箱回投方法');
  const m = src2.slice(src2.indexOf('async sendCollectedResult('), src2.indexOf('async sendCollectedResult(') + 2000);
  assert.match(m, /\/devices\/cc\/messages/, '回投走 /devices/cc/messages');
  assert.match(m, /sessionId: businessSessionId/, '必须投到目标业务会话');
  assert.match(m, /idempotencyKey/, '必须带幂等键（重投不重复投递）');
  // ipc 必须接线
  assert.match(ipc, /ccResultCollector\.start\(/, 'IPC 启动时必须接上采集器的回投函数');
});

test('T154-P4 ★ [T-154-cc] 空闲巡检不许回收「还有未回传结果」的会话', () => {
  const bgSrc = codeOnly(path.join(ROOT, 'electron/client-tools/claudeBgSession.ts'));
  assert.match(bgSrc, /ccResultCollector\.hasPendingForSession\(s\.sessionId\)/, '停之前必须问采集器');
  const at = bgSrc.indexOf('ccResultCollector.hasPendingForSession(s.sessionId)');
  const stopAt = bgSrc.indexOf('stopClaudeBgSession(bgId)', at);
  assert.ok(at > 0 && stopAt > at, '判据必须在停会话之前');
  // 墓碑要带 transcript 路径（结论被回收了也能捞回来）
  const tombSrc = codeOnly(path.join(ROOT, 'electron/client-tools/ccAutoClosed.ts'));
  assert.match(tombSrc, /transcriptPath\?: string \| null/, '墓碑结构要有 transcriptPath');
  assert.match(bgSrc, /transcriptPath: rec \? transcriptPath\(rec\) : null/, '停之前要把 transcript 路径写进墓碑');
});

// ── [T-092] notify_when_idle 与主动回报合成契约 ────────────────────────

test('T092-P1 ★ pcCcControl notify_when_idle：先注入 report_when_idle peer message，再发 control', () => {
  const start = exec.indexOf("if (action === 'notify_when_idle') {");
  const end = exec.indexOf("return fail(`不支持的 action", start);
  const branch = exec.slice(start, end > 0 ? end : start + 3000);

  assert.match(branch, /sendPeerMessage\(\s*sessionId,\s*text,\s*'later',\s*msgId,\s*normalizedReplyTo,\s*'report_when_idle',?\s*\)/, '必须先发带 report_when_idle 的 peer user message');
  assert.match(branch, /sendPeerControl\(sessionId, 'notify_when_idle', \{[\s\S]{0,120}msg_id: msgId/, '随后仍发原 control 帧');
  const injectAt = branch.indexOf('sendPeerMessage(');
  const controlAt = branch.indexOf("sendPeerControl(sessionId, 'notify_when_idle'");
  assert.ok(injectAt > 0 && controlAt > injectAt, '注入必须在 control 之前（先契约后门铃）');
  assert.match(branch, /claudeCodePeerInbox\.registerDiagnostic\(msgId, sessionId/, '诊断映射保留');
  assert.match(branch, /claudeCodePeerInbox\.from\(\)/, '合法 from 保留');
  assert.match(branch, /status: 'subscribed',[\s\S]{0,200}msg_id: msgId,[\s\S]{0,80}from,/, 'msg_id/from 回参保留');
});

test('T092-P2 ★ reply_to 缺失 fail-closed：不发消息、不发 control、不挂空契约', () => {
  const start = exec.indexOf("if (action === 'notify_when_idle') {");
  const end = exec.indexOf("return fail(`不支持的 action", start);
  const branch = exec.slice(start, end > 0 ? end : start + 3000);
  assert.match(branch, /if \(!replyTo\?\.business_session_id\) \{[\s\S]{0,160}return fail\('notify_when_idle 需要 reply_to_business_session_id/, '缺 business reply_to 必须直接拒绝');
  const rejectAt = branch.indexOf('if (!replyTo?.business_session_id)');
  const injectAt = branch.indexOf('sendPeerMessage(');
  const controlAt = branch.indexOf("sendPeerControl(sessionId, 'notify_when_idle'");
  const diagAt = branch.indexOf('claudeCodePeerInbox.registerDiagnostic(');
  assert.ok(rejectAt > 0 && rejectAt < injectAt && rejectAt < controlAt && rejectAt < diagAt,
    'fail-closed 必须发生在任何注入 / 订阅 / 诊断登记之前');
});

test('T092-P3 ★ reply_channel 固定 inbox；诊断 notice 仍只记日志、不另起后台 job', () => {
  const start = exec.indexOf("if (action === 'notify_when_idle') {");
  const end = exec.indexOf("return fail(`不支持的 action", start);
  const branch = exec.slice(start, end > 0 ? end : start + 3000);
  assert.match(branch, /channel: 'inbox'/, '契约通道强制 inbox');
  assert.ok(!branch.includes('peerJobManager.track('), 'notify 不创建后台 job 横幅');
  assert.ok(!branch.includes('reportJobResult('), 'notify 不直接 D3 回传');
  assert.match(branch, /notice 本身只记日志、不触发 D3/, '回参说明保留诊断语义');
});
