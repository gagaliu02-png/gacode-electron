/**
 * src/lib/client-capabilities.ts —— PC 端**实际具备**的端侧能力
 *
 * ## ★ [T-046 · 2026-11-18] 唯一真相源 = **主进程** `deviceCapabilities()`
 *
 *   `window.gacode.clientTools.capabilities()` 返回的那一份，跟**设备注册**时上报给
 *   服务端的**逐字一致**（`electron/client-tools/deviceClient.ts::deviceCapabilities()`），
 *   里面含 `client-tools` / `pty` / `fs` / `screen` / `os` / `job` / `browser` /
 *   **`claude-code`** 全部键。
 *
 * ## 病根（2026-11-18 · 用户报「LLM 看不到 Claude Code 工具，但其他端侧工具都看得到」）
 *
 *   这一层之前**自己拼**了一份（只 `pty` 探测 + 硬写 `fs/screen/os`）
 *   ⇒ **`claude-code=1` / `job=1` / `browser=1` 从来没进过 chat 请求的头**
 *   ⇒ 服务端按端声明的能力裁剪 `pc_*` ⇒ **`pc_cc_*`（Claude Code 管控那一族）永远不下发**
 *   ⇒ 用户看得见 `pc_read_file` 等，却看不见 `pc_cc_sessions` / `pc_cc_read` …
 *
 *   ⇒ 现在**一律以主进程为准**；IPC 拿不到时**退回**老那份（安全降级，不把能力凭空多报）。
 *
 * ## 能力表（唯一真相源在服务端）
 *
 *   gaclaw/src/llm/client-tools.js 的 `PC_TOOL_SPECS` / `CAP_MASTER`
 */

let _caps: string | null = null;
let _probed = false;

/** 当前要发的能力头（`null` = 探测还没跑完 ⇒ 不发这个头）。 */
export function clientCapabilityHeader(): string | null {
  return _caps;
}

/** 老路径（IPC 拿不到时的降级）—— 只声明**确知**有的能力。 */
async function fallbackCaps(): Promise<string> {
  let ptyOk = false;
  try {
    ptyOk = (await window.gacode?.clientTools?.ptyAvailable?.()) === true;
  } catch (_) {
    ptyOk = false;
  }
  return ptyOk
    ? 'client-tools=1,pty=1,fs=1,screen=1,os=1'
    : 'client-tools=1,fs=1,screen=1,os=1';
}

/**
 * 探测一次能力表（幂等；重复调用直接返回上次的结论）。
 *
 * ⚠️ 主进程那份是**唯一真相源** —— 它和设备注册上报的逐字一致 ⇒
 *    chat 请求的头不能跟它不一致（否则「设备说有 claude-code、chat 说没有」⇒ 工具不下发）。
 */
export async function initClientCapabilities(): Promise<string> {
  if (_probed) return _caps || '';
  _probed = true;
  try {
    const fromMain = await window.gacode?.clientTools?.capabilities?.();
    _caps = fromMain && fromMain.trim()
      ? fromMain
      : await fallbackCaps();
  } catch (_) {
    _caps = await fallbackCaps();
  }
  return _caps || '';
}
