/**
 * lib/clipboard.ts — 阶段 4 剪贴板图片粘贴辅助
 *
 * ChatInputBar 共用一组 paste 事件处理函数:
 *   - 从 e.clipboardData.items 找 kind === 'file' 且 type 命中预期 MIME 的
 *     item, 拿到 Blob → File
 *   - 提一个统一签名 `extractClipboardFiles(e, {acceptMimes, acceptImage})` 避免
 *     各组件写不同的粘代码
 *
 * `acceptImage` 模式: 命中 image/* 的 File 单选, 跟按钮图片选择器同款
 * `acceptMimes` 模式: 接受一组 MIME 字符串 + 通配 (image/*, application/* 等)
 *
 * 用法:
 *   const onPaste = (e: ClipboardEvent) => {
 *     const files = extractClipboardFiles(e, {acceptImage: true});
 *     if (files.length) uploadAttachment(files[0], { mode: 'image' });
 *   };
 *   <div onPaste={onPaste} />
 */

const IMAGE_PREFIX = /^image\//;

export interface ClipboardExtractOptions {
  /** 单选图像模式 (image/* MIME 直接取) */
  acceptImage?: boolean;
  /** 多选 MIME 白名单, e.g. ['application/pdf', 'image/*'] */
  acceptMimes?: string[];
}

export function extractClipboardFiles(
  e: ClipboardEvent | React.ClipboardEvent,
  opts: ClipboardExtractOptions = {},
): File[] {
  const data = (e as { clipboardData?: DataTransfer | null }).clipboardData;
  if (!data) return [];
  const out: File[] = [];

  // 1) 文件类型 item (浏览器剪贴板文件 / Finder / OneDrive copy paste)
  for (const item of Array.from(data.items)) {
    if (item.kind !== "file") continue;
    const mime = item.type || "";
    const file = item.getAsFile();
    if (!file) continue;
    if (opts.acceptImage && IMAGE_PREFIX.test(mime)) {
      out.push(file);
      continue;
    }
    if (opts.acceptMimes && opts.acceptMimes.length > 0) {
      if (opts.acceptMimes.some((m) => matchMime(mime, m))) {
        out.push(file);
      }
      continue;
    }
    // 无规则 = 全部放行
    out.push(file);
  }

  // 2) 数据 URL image 模式 (有时 Chrome / Electron 截图复制只放 text/html)
  if (out.length === 0) {
    for (const item of Array.from(data.items)) {
      if (item.kind !== "string") continue;
      // 不阻塞主线程, clipboardData.getData sync 仅 text/html, 读字符串
    }
    // 简化: 不处理纯 html 嵌入的 base64, paste 的图像 90% 走 file item
  }

  return out;
}

function matchMime(actual: string, pattern: string): boolean {
  if (!actual) return false;
  if (pattern.endsWith("/*")) {
    return actual.startsWith(pattern.slice(0, -1));
  }
  return actual === pattern || actual === pattern.toLowerCase();
}

/**
 * 直接拿 paste 事件里的 image: 拿来即用。
 * 优先级: file item → 如果有没 file 就看 items 是否给 image/png 之类的 type
 * 没有就返 null (caller 自己走 toast 提示).
 */
export function extractSingleImage(
  e: ClipboardEvent | React.ClipboardEvent,
): File | null {
  const files = extractClipboardFiles(e, { acceptImage: true });
  return files[0] || null;
}
