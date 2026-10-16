/**
 * lib/upload.ts — 阶段 2 附件上传 (XHR + 进度)
 *
 * 端点约束 (从 unified-api 端点确认):
 *   - 没有独立 POST /yinian/upload (image) 端点, 老的 ngff 已废弃
 *   - 多模态附件全部走 POST /yinian/documents (multipart, field 'file')
 *     服务端 mime 白名单: pdf / docx / doc / xlsx / xls / jpeg / png / webp / gif
 *   - 返回字段 { ok, data: { file_id, url, original_name, mime_type, size_bytes } }
 *
 * 阶段 2 设计:
 *   - mode = "image" | "document" 显式 + 文件 mime 兜底  (跟 gacode-web deriveUploadMode 一致)
 *     旧版 `image/*` 走 image, 其他走 document; mime 缺失按扩展名兜底 (HEIC 等)
 *   - XHR + onprogress (fetch 没有 progress event, 必须用 XHR)
 *   - 50MB hard cap (web 阶段对应上限)
 *   - 返回 { promise, abort }, 调用方拿 promise.then 拿 url/fileId,
 *     拿 abort() 中断未完成请求 (PC 取消按钮 / 卸载触发)
 */

const API_BASE = "https://www.gaga.sale/api/v1";
const UPLOAD_PATH = "/yinian/documents";
const MAX_BYTES = 50 * 1024 * 1024;

/** image mode 接 sendMessageStream opts.image_urls; document 接 attached_file_ids */
export type UploadMode = "image" | "document";

export interface UploadProgress {
  loaded: number;
  total: number;
  pct: number;
}

export interface UploadSuccess {
  /** image mode 拿到的可访问 URL */
  url?: string;
  /** document mode 拿到的 file_id */
  fileId?: string;
}

export interface UploadAttachmentOptions {
  /** 显式覆盖 mode (默认按 mime + 文件名兜底) */
  mode?: UploadMode;
  /** 进度回调 */
  onProgress?: (p: UploadProgress) => void;
}

export interface UploadAttachmentHandle {
  promise: Promise<UploadSuccess>;
  abort: () => void;
}

// =========================================================================
// deriveUploadMode — 独立函数 (单测可注入)
//
// 优先级 (跟 gacode-web/src/hooks/useAttachmentUpload.ts:119-127 一字不差):
//   1) file.type 存在且是 image/* → image
//   2) file.type 存在但非 image/* → document
//   3) file.type 为空字符串 (Android Chrome 选 HEIC / 部分图常见) →
//      按文件名扩展名兜底, 命中图片扩展名走 image, 否则 document.
// =========================================================================
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|bmp|heic|heif|avif)$/i;

export function deriveUploadMode(file: File): UploadMode {
  const mime = file.type;
  if (mime) {
    return mime.startsWith("image/") ? "image" : "document";
  }
  if (IMAGE_EXT_RE.test(file.name)) return "image";
  return "document";
}

// =========================================================================
// 鉴权 accessor (跟 cancel.ts 同样的写法, 防止循环 import)
// =========================================================================

type AuthGetter = () => { token: string | null };
let getAuthSnapshot: AuthGetter = () => ({ token: null });

export function registerUploadAuthAccessors(getter: AuthGetter): void {
  getAuthSnapshot = getter;
}

// =========================================================================
// uploadAttachment — 主入口
//
// 必须先 open() 再 setRequestHeader() 再 send(); XHR spec 强制,
// 否则 Chrome 抛 InvalidStateError, Promise reject 静默接住.
// =========================================================================

export function uploadAttachment(
  file: File,
  options: UploadAttachmentOptions = {},
): UploadAttachmentHandle {
  if (file.size > MAX_BYTES) {
    throw new Error(`文件超过 50MB 上限 (${Math.round(file.size / 1024 / 1024)}MB)`);
  }

  const mode = options.mode ?? deriveUploadMode(file);

  const xhr = new XMLHttpRequest();
  const formData = new FormData();
  formData.append("file", file);

  // progress event — fetch 不支持, 必须 XHR
  xhr.upload.onprogress = (e: ProgressEvent) => {
    if (e.lengthComputable && options.onProgress) {
      options.onProgress({
        loaded: e.loaded,
        total: e.total,
        pct: Math.round((e.loaded / e.total) * 100),
      });
    }
  };

  const promise = new Promise<UploadSuccess>((resolve, reject) => {
    xhr.onload = () => {
      // 服务端 mime 白名单 miss → 4xx 拒, 不要 fallback (web 也走原路径)
      if (xhr.status < 200 || xhr.status >= 300) {
        let msg = `上传失败: HTTP ${xhr.status}`;
        try {
          const data = JSON.parse(xhr.responseText);
          if (data?.error?.message) msg = data.error.message;
        } catch {
          /* keep generic msg */
        }
        reject(new Error(msg));
        return;
      }

      try {
        const raw = JSON.parse(xhr.responseText);
        // v2 protocol 兼容: { ok, data: { file_id, url, ... } } 或裸 { file_id, url }
        if (raw && typeof raw === "object" && "ok" in raw) {
          if (!raw.ok) {
            reject(
              new Error(
                (raw.error && (raw.error.message || raw.error.code)) ||
                  "上传失败",
              ),
            );
            return;
          }
          const d = raw.data ?? {};
          if (mode === "document") {
            resolve({ fileId: String(d.file_id ?? ""), url: d.url ? String(d.url) : undefined });
          } else {
            // image: server 走 /yinian/documents 也可能返 url 同字段
            resolve({ url: d.url ? String(d.url) : undefined });
          }
          return;
        }
        // 裸结构兼容
        if (mode === "document") {
          resolve({ fileId: String(raw.file_id ?? ""), url: raw.url ? String(raw.url) : undefined });
        } else {
          resolve({ url: String(raw.url ?? "") });
        }
      } catch {
        reject(new Error("上传响应解析失败"));
      }
    };

    xhr.onerror = () => reject(new Error("网络错误,请重试"));
    xhr.onabort = () => reject(new Error("aborted"));

    xhr.open("POST", `${API_BASE}${UPLOAD_PATH}`);
    const { token } = getAuthSnapshot();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(formData);
  });

  return {
    promise,
    abort: () => {
      try {
        xhr.abort();
      } catch {
        /* already done */
      }
    },
  };
}
