/**
 * electron/client-tools/types.ts —— 端侧执行（`pc_*`）的类型契约
 *
 * [2026-11-12] 契约依据: cross-platform-sse-event-contract-附录.md **订正 24**（事件层语义）
 *            + **订正 25**（设备通道）。
 *
 * ## 为什么这些类型住在主进程
 *
 * 端侧执行**必须**跑在主进程：
 *   · 主进程活得比渲染层久（渲染层刷新/重开窗口不该打断在跑的命令）；
 *   · `node-pty` / `desktopCapturer` / `tasklist` 这些**只有主进程**能碰；
 *   · 设备通道的 SSE 长连也必须在主进程（渲染层一关，通道就断 ⇒ PC「离线」）。
 *
 * ## 字段名**逐字**跟服务端一致
 *
 * ⛔ 端侧**不得**自己拼装模型上下文（L-24n / L-25q）——
 *    端侧只负责「跑」+「如实回报」，**折叠成模型上下文是服务端的事**。
 */

/** 一条端侧派单（= 服务端 `client_tool_request` 事件，字段集逐字相同）。 */
export interface ClientToolRequest {
  type: 'client_tool_request';
  /** = `tool_use_id` —— ⚠️ **不是**裁决身份（L-24a），只用于跟 tool_start 对齐。 */
  id: string | null;
  /** ★ 裁决身份 —— 回传结果按这个寻址（L-24a）。 */
  pending_id: string | null;
  /** 工具名（`pc_*`）。 */
  tool: string | null;
  /** 工具入参。 */
  args: Record<string, unknown> | null;
  /** 工作目录（绝对路径）。 */
  cwd: string | null;
  /** 超时（毫秒）。 */
  timeout_ms: number | null;
  /** `low` | `medium` | `high` —— **仅供展示**，不构成审批。 */
  risk_level: string | null;
  /** 人类可读摘要。 */
  title: string | null;
  /** 目标设备。 */
  device_id: string | null;
  /** 发起端（`web` / `pc` / `android`）。 */
  origin_client: string | null;
  /** 来源会话。 */
  session_id: string | null;
}

/**
 * 端侧产物条目。
 *
 * ⚠️ `kind` 决定**去哪儿**（L-24o / L-24p）：
 *   · `file`      —— 单文件 ⇒ **进交付中心**（带 `localPath` + `deviceId`）
 *   · `workspace` —— 目录/项目 ⇒ **不进**交付中心，只报本机路径 + 文件树摘要
 */
export interface ClientToolArtifact {
  kind: 'file' | 'workspace';
  name: string;
  /** 本机绝对路径（L-24r：进中心的产物必须带本机定位）。 */
  path: string;
  size?: number;
  mimeType?: string;
  /** `workspace` 产物：文件数 / 总大小 / 入口文件（L-24p）。 */
  fileCount?: number;
  totalSize?: number;
  entryFile?: string | null;
}

/** 端侧回传的结果（= D3 的请求体）。 */
export interface ClientToolResult {
  status: 'ok' | 'error' | 'denied';
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
  artifacts?: ClientToolArtifact[];
}

/**
 * 审计条目（append-only，落 `%APPDATA%/Gacode/client-audit.jsonl`）。
 *
 * ⚠️ 闸门拒绝时抛的 `ClientToolGateError` **住在 `gate.ts`** ——
 *    本文件只放**纯类型**（能被 Node 的类型剥离直接加载 ⇒ 单测能 import）。
 */
export interface ClientToolAuditEntry {
  ts: number;
  tool: string | null;
  /** 派单的 `pending_id`（有就记，便于跟服务端对账）。 */
  pendingId?: string | null;
  /** 发起端。 */
  originClient?: string | null;
  /** 放行 / 拒绝 / 失败。 */
  outcome: 'allowed' | 'denied' | 'error';
  /** 拒绝原因（`gate` / `blacklist` / `master_off` / `kill_switch` / `error`）。 */
  reason?: string;
  /** 命令摘要（**只记摘要**，不把整段文件内容写进审计）。 */
  summary?: string;
  durationMs?: number;
  exitCode?: number;
}
