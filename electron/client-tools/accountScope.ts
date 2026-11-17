/**
 * electron/client-tools/accountScope.ts —— **账号切换时清掉本机「上一账号的作业痕迹」**
 *
 * ## 为什么要做（2026-11-17 · PM 拍板）
 *
 * 「退出登录就解绑，换账号上去就应该是对应账号的记录」——
 * 设备绑定是按账号的（unified-api `deviceOwners`），但下面这些**本机文件**没有账号字段：
 *
 *   · `local-jobs.jsonl`   —— 上一账号起的后台作业（名字 / 摘要 / sessionId）
 *   · `jobs/*.log`         —— 那些作业的完整输出（可能含上一账号的业务内容）
 *   · `client-dispatch.jsonl` —— 上一账号的派单账（pending_id / tool / sessionId）
 *   · `client-done.json`   —— 上一账号已执行的 pending_id 去重表
 *   · `client-audit.jsonl` —— 上一账号的执行审计
 *
 * ⇒ 不清的话，账号 B 登上来在「我的电脑」页看到的是账号 A 的作业记录 —— 既是隐私串号，
 *   也会让 B 的派单被 A 的 `client-done` 误判成「已经跑过」而跳过（去重表的 pending_id 是全局的，
 *   但服务端生成时带随机性，重复概率极低；清理主要是为了「记录是对应账号的」这个产品语义）。
 *
 * ## 什么时候清
 *
 *   · **用户主动点「解绑」** ⇒ 清
 *   · **退出登录**（unbindOnLogout）⇒ 清
 *
 * ⚠️ **不在「重新绑定」时清** —— 解绑已经清过了，重绑是干净起步。
 * ⚠️ **不清**：`client-gate.json`（总开关 / 急停是本机设置，不属于账号）、
 *    `local-tasks.json`（本机定时任务，gaga 拍板「只在 Gacode 开着时跑」，跟账号无关）、
 *    `bookmarks.json`（浏览器收藏夹）、`device-id.json`（安装实例 UUID，解绑要按 deviceId 调用）。
 *
 * ⚠️ 清理失败**不抛** —— 解绑 / 登出一定要成功。
 */

import * as fs from 'fs';
import * as path from 'path';
import { userDataDir, localJobsFile, jobsDir } from './localJobs.ts';
import { dispatchLedgerFile } from './dispatchLedger.ts';

/** 其它按账号隔离的本机文件（路径都在 userData 根目录）。 */
function accountScopedFiles(): string[] {
  const dir = userDataDir();
  return [
    localJobsFile(),
    dispatchLedgerFile(),
    path.join(dir, 'client-done.json'),
    path.join(dir, 'client-audit.jsonl'),
  ];
}

/** 递归删一个目录（只用于 `jobs/` 作业输出目录）。 */
function removeDirRecursive(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) { /* 被占用 ⇒ 下次启动再试也行，不阻塞解绑 */ }
}

/**
 * 清掉**上一账号**在本机留下的作业 / 派单 / 审计记录。
 *
 * @returns 清掉的文件数（诊断用；失败不抛、不计数）
 */
export function clearAccountScopedLocalData(): number {
  let cleared = 0;
  for (const file of accountScopedFiles()) {
    try {
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        cleared += 1;
      }
    } catch (e) {
      console.warn('[account-scope] 清理本机记录失败:', file, e && (e as Error).message);
    }
  }
  const dir = jobsDir();
  try {
    if (fs.existsSync(dir)) {
      removeDirRecursive(dir);
      cleared += 1;
    }
  } catch (e) {
    console.warn('[account-scope] 清理作业日志目录失败:', dir, e && (e as Error).message);
  }
  return cleared;
}
