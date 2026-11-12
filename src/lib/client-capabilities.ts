/**
 * src/lib/client-capabilities.ts —— PC 端**实际具备**的端侧能力
 *
 * [2026-11-12] 契约依据: cross-platform-sse-event-contract-附录.md **订正 24 §3**。
 *
 * ## 为什么不是写死的常量
 *
 * 服务端按「端声明的能力」裁剪 `pc_*` 工具（`client-tools` 总闸 + `pty`/`fs`/`screen`/`os` 子能力）。
 * ⇒ 声明了**但实际没有**的能力 = 模型会调一个**必然失败**的工具
 *   （`pc_shell` 会挂起等一个永远不回来的结果 ⇒ 整轮空转）。
 * ⇒ 所以 `pty` 这一项是**探测**出来的，不是写死的。
 *
 * ## 能力表（唯一真相源在服务端）
 *
 *   gaclaw/src/llm/client-tools.js 的 `PC_TOOL_SPECS` / `CAP_MASTER`
 *
 *   | 能力键 | 覆盖的工具 | PC 端有没有 |
 *   |---|---|---|
 *   | `client-tools` | 总闸 | 有（执行器在主进程） |
 *   | `pty` | `pc_shell` | 探测 node-pty 能不能加载 |
 *   | `fs` | `pc_read_file` / `pc_write_file` / `pc_list_dir` / `pc_project` | 有（纯 Node fs） |
 *   | `screen` | `pc_screenshot` | 有（Electron desktopCapturer） |
 *   | `os` | `pc_open_path` / `pc_system_info` / `pc_process_list` | 有（Electron shell / os / tasklist） |
 *
 * ## 头什么时候带
 *
 * ⚠️ **探测没回来之前不带这个头** ⇒ 服务端不下发 `pc_*` ⇒ 那一轮模型看不见端侧工具
 *    （安全降级：宁可少给能力，也别给一个调不通的）。
 */

let _caps: string | null = null;
let _probed = false;

/**
 * 当前要发的能力头（`null` = 还没探好 ⇒ 不带这个头）。
 */
export function clientCapabilityHeader(): string | null {
  return _caps;
}

/**
 * 探测一次能力表（幂等；重复调用直接返回上次的结论）。
 *
 * ⚠️ 探测**失败**时给一个**保守**的能力表（不含 `pty`）——
 *    宁可少一项能力，也别让模型调一个必然挂起的工具。
 */
export async function initClientCapabilities(): Promise<string> {
  if (_probed) return _caps || '';
  _probed = true;
  let ptyOk = false;
  try {
    ptyOk = (await window.gacode?.clientTools?.ptyAvailable?.()) === true;
  } catch (_) {
    ptyOk = false;
  }
  _caps = ptyOk
    ? 'client-tools=1,pty=1,fs=1,screen=1,os=1'
    : 'client-tools=1,fs=1,screen=1,os=1';
  return _caps;
}
