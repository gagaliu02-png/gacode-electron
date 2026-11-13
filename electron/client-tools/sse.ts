/**
 * electron/client-tools/sse.ts —— SSE 读帧的**共用**零件
 *
 * [2026-11-12 · P7] 主进程里有两处要读 SSE 流：
 *   · 设备通道（订正 25）—— 派单下行；
 *   · 本机定时任务（P7）—— 定时轮次的结果流。
 * ⇒ 读帧器**只写一份**（两边各写一份必然漂移）。
 *
 * ⚠️ 心跳是**注释行**（`: keepalive <ts>`）—— 不是数据帧 ⇒ 不能当事件解析
 *    （契约附录 **订正 25** L-25i）。
 */

/** 把 fetch 的响应流切成一行一行。 */
export async function* readSseLines(res: Response): AsyncGenerator<string> {
  const body = res.body;
  if (!body) return;
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
      yield line;
    }
  }
}

/**
 * 从 SSE 行里抽出 `data:` 的载荷。
 *
 * ⚠️ 一帧可能有多行 `data:`（服务端用多行拼 JSON）⇒ 要**攒到空行**再拼。
 */
export class SseFrameCollector {
  private dataLines: string[] = [];

  /** 喂一行；返回这一帧的载荷（没有完整帧时返回 null）。 */
  push(line: string): string | null {
    if (line.startsWith(':')) return null;          // 心跳 = 注释行
    if (line.startsWith('id:')) return null;        // 游标行
    if (line.startsWith('data:')) {
      this.dataLines.push(line.slice(5).trim());
      return null;
    }
    if (line === '') {
      if (!this.dataLines.length) return null;
      const payload = this.dataLines.join('\n');
      this.dataLines = [];
      return payload;
    }
    return null;
  }
}
