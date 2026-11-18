/**
 * ★ [T-044 · 2026-11-18] 渲染层诊断日志（落盘）—— PC 端跑的是**打包版** ⇒ 没有 devtools
 * ⇒ 渲染层的 `console.log` **看不到** ⇒ 端侧关键决策必须落盘才能事后复盘。
 *
 * 落点：`%APPDATA%/Gacode/diag.log`（主进程写，渲染层经 IPC 推过去）。
 *
 * ⚠️ **只记决策，不记内容** ⇒ 绝不把用户消息正文 / 模型回复写进来。
 */
export function diagLog(tag: string, msg: string): void {
  try {
    window.gacode?.diagLog?.(tag, msg);
  } catch (_) {
    /* ignore —— 诊断日志绝不能影响 UI */
  }
}
