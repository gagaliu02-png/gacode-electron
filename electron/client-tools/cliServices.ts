/**
 * electron/client-tools/cliServices.ts —— **内置 CLI 服务的注册入口**
 *
 * ## 为什么单独一个文件
 *
 * 注册表本体在 `cliService.ts`（纯类型 + `raw` 服务）。
 * 而 `claude` 服务住在 `claudeService.ts` —— 那个模块带「作业无人值守 ⇒ 不逐条审批」
 * 的启动参数 ⇒ **单测不该把它拖进测试进程**（单测只做形状断言，不需要真起 agent）。
 *
 * ⇒ 把「注册 claude」这一步单独放这里，由 `backgroundJobs.ts`（工具 → 服务的映射处）
 *    在模块加载时调一次。
 *    ⇒ `jobRunner.ts` 因此**不需要** import `claudeService.ts` ⇒ 单测链路干净。
 */

import { registerCliService } from './cliService.ts';
import { claudeService } from './claudeService.ts';

let _registered = false;

/**
 * 注册内置的 CLI 服务（幂等）。
 *
 * ⚠️ `raw` 服务在 `cliService.ts` 里就地注册了 ⇒ 这里只补 `claude`。
 */
export function registerBuiltinCliServices(): void {
  if (_registered) return;
  registerCliService(claudeService);
  _registered = true;
}
