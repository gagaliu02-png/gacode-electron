/**
 * lib/upload.ts — 附件上传 (XHR + 进度)
 *
 * 端点约束 (从 unified-api 确认, v3.0.4+):
 *   - mode="image":    POST /yinian/upload      → 拿 URL, 图片自动压缩 (1600px/q80), 不建 KB atom
 *                       返 { ok, data: { filename, url, sha256, size, mimeType } }
 *   - mode="document": POST /yinian/documents   → 入库 + OCR, magic bytes 白名单
 *                       (pdf/docx/doc/xlsx/xls/txt)
 *                       返 { ok, data: { file_id, url, original_name, mime_type, size_bytes } }
 *
 * [hotfix 0.7.5] 此前所有附件 (含图片) 一律发 /yinian/documents。server 端该端点有
 *   magic bytes 白名单 (MAGIC_MIME_MAP 只认 6 种文档), 图片 .png 落不到映射 → 400
 *   "Unsupported file type inferred from content: .png"。server v3.0.4 已提供专用
 *   /yinian/upload 图片端点 (不按类型 400, 未知类型兜 .bin), 这里按 mode 分流。
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
/** 图片: 拿 URL, 不建 KB atom / 不触发 OCR */
const UPLOAD_PATH_IMAGE = "/yinian/upload";
/** 文档: 入库 + OCR, magic bytes 白名单 */
const UPLOAD_PATH_DOCUMENT = "/yinian/documents";
const MAX_BYTES = 50 * 1024 * 1024;

/** image mode 接 sendMessageStream opts.imageUrls; document 接 attachedFileIds */
export type UploadMode = "image" | "document";

export interface UploadProgress {
  loaded: number;
  total: number;
  pct: number;
}

/**
 * image mode  → /yinian/upload     : 有 url, 无 fileId
 * document mode → /yinian/documents  : 有 fileId / fileName (也有 url, 供知识库等消费方用)
 * 调用方判定归属用 `fileId` 有无 (image 端点不返 file_id), 不要只看 url。
 */
export interface UploadSuccess {
  url: string;
  /** image mode: server 返的 mimeType; document mode: server 的 mime_type */
  mimeType?: string;
  /** image mode: 落盘字节数 (压缩后); document mode: size_bytes */
  size?: number;
  /** document mode 拿到的 file_id (image mode 恒为 undefined) */
  fileId?: string;
  /** document mode: server 返的 original_name */
  fileName?: string;
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
// 错误文案 — 4xx 直接把 server 英文原话抛给用户没法看
//   - image: server msg 本身就是可读原因, 直接透出 (如 "file too large (50MB max)")
//   - document: 类型/白名单类 4xx 的英文报错 (Unsupported file type inferred from
//     content: .png) 对用户无意义 → 换成支持格式清单
// =========================================================================

const DOC_FORMAT_HINT = "只支持 PDF / Word / Excel / PPT / TXT / Markdown";

function humanizeUploadError(
  mode: UploadMode,
  serverMsg: string | null,
  status: number,
): string {
  const prefix = mode === "image" ? "图片上传失败" : "文档上传失败";
  if (mode === "document" && (status === 400 || status === 415 || status === 422)) {
    return `${prefix}: ${DOC_FORMAT_HINT}`;
  }
  if (serverMsg) return `${prefix}: ${serverMsg}`;
  if (status) return `${prefix}: HTTP ${status}`;
  return `${prefix}: 网络错误,请重试`;
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
// 响应解析 — 两个端点字段名不同, 按 mode 分开取
// =========================================================================

type RawData = Record<string, unknown>;

/** /yinian/upload → { filename, url, sha256, size, mimeType } (不建 KB atom, 无 file_id) */
function parseImageData(d: RawData): UploadSuccess {
  return {
    url: d.url ? String(d.url) : "",
    mimeType: d.mimeType ? String(d.mimeType) : undefined,
    size: typeof d.size === "number" ? d.size : undefined,
    fileId: undefined,
  };
}

/** /yinian/documents → { file_id, url, original_name, mime_type, size_bytes } */
function parseDocumentData(d: RawData): UploadSuccess {
  return {
    url: d.url ? String(d.url) : "",
    fileId: d.file_id ? String(d.file_id) : undefined,
    fileName: d.original_name ? String(d.original_name) : undefined,
    mimeType: d.mime_type ? String(d.mime_type) : undefined,
    size: typeof d.size_bytes === "number" ? d.size_bytes : undefined,
  };
}

function parseUploadData(d: RawData, mode: UploadMode): UploadSuccess {
  return mode === "image" ? parseImageData(d) : parseDocumentData(d);
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
  const path = mode === "image" ? UPLOAD_PATH_IMAGE : UPLOAD_PATH_DOCUMENT;

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
      // 服务端拒绝 → 4xx/5xx, 不 fallback (web 也走原路径)
      if (xhr.status < 200 || xhr.status >= 300) {
        let serverMsg: string | null = null;
        try {
          const data = JSON.parse(xhr.responseText);
          if (data?.error?.message) serverMsg = String(data.error.message);
        } catch {
          /* keep generic msg */
        }
        reject(new Error(humanizeUploadError(mode, serverMsg, xhr.status)));
        return;
      }

      try {
        const raw = JSON.parse(xhr.responseText);
        // v2 protocol 兼容: { ok, data: { ... } } 或裸 { ... }
        if (raw && typeof raw === "object" && "ok" in raw) {
          if (!raw.ok) {
            const serverMsg =
              (raw.error && (raw.error.message || raw.error.code)) || null;
            reject(new Error(humanizeUploadError(mode, serverMsg ? String(serverMsg) : null, xhr.status)));
            return;
          }
          resolve(parseUploadData((raw.data ?? {}) as RawData, mode));
          return;
        }
        // 裸结构兼容
        resolve(parseUploadData(raw as RawData, mode));
      } catch {
        reject(new Error("上传响应解析失败"));
      }
    };

    xhr.onerror = () =>
      reject(new Error(humanizeUploadError(mode, null, xhr.status || 0)));
    xhr.onabort = () => reject(new Error("aborted"));

    xhr.open("POST", `${API_BASE}${path}`);
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