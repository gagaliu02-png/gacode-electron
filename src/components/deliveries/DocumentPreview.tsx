/**
 * components/deliveries/DocumentPreview.tsx — 交付中心文档内嵌预览, 跟安卓 DocumentViewerActivity 对齐
 * -------------------------------------------------------------------------
 * 1:1 对齐 web `gacode-web/src/components/deliveries/DocumentPreview.tsx` (216 行).
 *
 * 设计动机 (gaga 原则: 跟安卓对齐):
 *   安卓 DocumentViewerActivity v1.2.61 用 fileId 形态分流:
 *     · fileId 以 http/https 开头 (交付中心直链, gaclaw 落盘 llm/uploads) →
 *       client-side 解析 (PdfRendererView / XWPFDocument / XSSF / 自实现 PptxParser)
 *     · fileId 是 unified-api 短 id (chat 附件 / DocumentsScreen) →
 *       server `/yinian/documents/{id}/text` 端点提取
 *   web 端 Deliverable.url 直接当 fileId 透传, 对齐同一套契约; PC 端同款。
 *
 * 实操拆解 (按 mimeType 分发):
 *   · application/pdf → Google Docs Viewer iframe
 *     (安卓端是 PdfRendererViewCompose 翻页 + pinch-zoom; web 端没有合适的 pdfjs
 *      依赖 — package.json 没装, 装包破 AGENTS.md "绝不清单 - 不动 package.json".
 *      Google Docs Viewer 跟安卓都属于"内嵌读 PDF"语义, 跟 gaga 原则对齐).
 *   · text/plain (TXT 直链) → fetch url bytes → UTF-8 解码 → <pre> 渲染
 *   · 短 id (理论上 PC 端目前没有这种分支) → 调 getDocumentText(fileId) → <pre> 渲染.
 *   · 其它 (DOCX/XLSX/PPTX 直链 + 未知 mime) → 降级占位
 *     "暂无内嵌预览 (请用打开或下载按钮)". 这是真实能力差距, 不装作能预览.
 *
 * 已知约束:
 *   · Google Docs Viewer 依赖 Google 服务, 国内访问可能慢/被墙 —— 跟安卓都属于
 *     "内嵌读" 对齐; 后续可考虑 <embed src=url type=application/pdf> (C) 或 pdfjs-dist (重).
 *   · DOCX/XLSX/PPTX 不做 client-side 解析 (会引入 mammoth.js / xlsx 包,
 *     破绝不清单). 跟安卓端的 POI/自实现 parser 不强求代码级对齐, 只在 UX 层
 *     明确告知"内嵌未支持" —— 跟"gaga 原则"的"诚实告知差距"一致.
 */
import { useEffect, useState } from "react";
import { getDocumentText } from "../../lib/api";
import { FileTextIcon } from "../ui/Glyphs";

export interface DocumentPreviewProps {
  /** 文档标识 — 跟安卓 DocumentViewerActivity.launch(fileId=...) 一致:
   *  直链 URL (http/https 开头) 走 client-side 模式, 短 id 走 server /yinian/documents/:id/text */
  fileId: string;
  /** 服务端声明的 mimeType (item.mimeType), 缺省按 fileId 后缀兜底 */
  mimeType?: string;
  /** 文档 url (PDF iframe 用), 不传则降级到 fileId (短 id 分支不适用 PDF, 走兜底) */
  url?: string;
  title: string;
}

// 跟安卓 v1.2.61 isDirectDocumentLink 完全一致: http/https 开头就是直链
function isDirectDocumentLink(fileId: string): boolean {
  return /^https?:\/\//i.test(fileId);
}

function isPdf(mimeType: string | undefined, url: string): boolean {
  if (mimeType === "application/pdf") return true;
  return /\.pdf(\?|#|$)/i.test(url);
}

function isTextPlain(mimeType: string | undefined, url: string): boolean {
  if (mimeType === "text/plain") return true;
  return /\.txt(\?|#|$)/i.test(url);
}

export function DocumentPreview({ fileId, mimeType, url, title }: DocumentPreviewProps) {
  const directUrl = url && isDirectDocumentLink(url) ? url : fileId;
  const pdf = isPdf(mimeType, directUrl);

  // ===== PDF: Google Docs Viewer iframe (跟安卓内嵌读对齐, 不引新依赖) =====
  if (pdf) {
    // 备选注释 (未启用):
    //   A) Google Docs Viewer (当前): 依赖 Google 服务, 国内可能慢
    //   B) <embed src=url type=application/pdf>: 浏览器原生 PDF viewer, 需要 url CORS
    //   C) pdfjs-dist: +1MB bundle, 破绝不清单
    const gviewSrc = `https://docs.google.com/gview?url=${encodeURIComponent(directUrl)}&embedded=true`;
    return (
      <div
        className="w-full mb-4 border border-border rounded-md overflow-hidden bg-bg-sunken"
        data-testid="document-preview-pdf"
      >
        <iframe
          src={gviewSrc}
          className="w-full block"
          style={{ height: "min(80vh, 800px)" }}
          title={title}
          loading="lazy"
        />
      </div>
    );
  }

  // ===== 非 PDF: 文本提取 (按 isDirectDocumentLink 分流) =====
  // 直链 URL → 客户端 fetch + UTF-8 解码 (安卓 v1.2.61 直链模式 client-side 一致)
  // 短 id → server /yinian/documents/{id}/text 端点 (安卓老 chat 附件路径)
  const isDirect = isDirectDocumentLink(directUrl);
  const isText = isTextPlain(mimeType, directUrl);

  // 直接放路由: PDF 已上面 return; 走到这里就是非 PDF
  return (
    <TextPreviewPane
      fileId={fileId}
      directUrl={directUrl}
      isDirect={isDirect}
      isText={isText}
      title={title}
    />
  );
}

/**
 * TextPreviewPane — 文本类预览 (TXT / 老 chat 附件)
 *   · 直链 URL → fetch bytes → UTF-8 decode (TXT 走这条)
 *   · 短 id    → getDocumentText(fileId) 拿 plainText (DOCX/XLSX/PPTX 老附件路径)
 *   · DOCX/XLSX/PPTX 直链 → 不做 client-side 解析, 显示"暂无内嵌预览"占位
 *     (跟安卓端能力差距如实告知, 不装作能渲染)
 */
function TextPreviewPane({
  fileId,
  directUrl,
  isDirect,
  isText,
  title,
}: {
  fileId: string;
  directUrl: string;
  isDirect: boolean;
  isText: boolean;
  title: string;
}) {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let plainText: string;
        if (isDirect) {
          // 直链 URL (交付中心 document): TXT 走 UTF-8 client decode, 其它类型不解析
          if (!isText) {
            throw new Error(
              "DOCX/XLSX/PPTX 直链文件当前不在 web 端做 client-side 解析, 请用打开/下载按钮"
            );
          }
          const res = await fetch(directUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buf = await res.arrayBuffer();
          // TXT 客户端 UTF-8 解码 — 跟安卓 v1.2.61 直链模式 client-side 一致
          plainText = new TextDecoder("utf-8").decode(buf);
        } else {
          // 短 id: 调 server /yinian/documents/{id}/text (安卓老 chat 附件路径)
          const r = await getDocumentText(fileId);
          plainText = r.plainText || "";
        }
        if (!cancelled) {
          setText(plainText);
          setLoading(false);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message || "加载失败");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fileId, directUrl, isDirect, isText]);

  if (loading) {
    return (
      <div
        className="mb-4 border border-border rounded-md bg-bg-sunken p-4 text-sm text-fg-muted"
        data-testid="document-preview-loading"
      >
        加载中…
      </div>
    );
  }
  if (error) {
    return (
      <div
        className="mb-4 border border-border rounded-md bg-bg-sunken p-4 text-sm"
        data-testid="document-preview-error"
      >
        <div className="flex items-center gap-2 text-fg-muted mb-1">
          <FileTextIcon className="w-4 h-4" />
          <span className="font-medium text-fg">{title}</span>
        </div>
        <div className="text-fg-muted">
          暂无内嵌预览（{error}）。请用下方「打开文档」或「下载」按钮查看原文。
        </div>
      </div>
    );
  }
  if (!text || text.trim().length === 0) {
    return (
      <div
        className="mb-4 border border-border rounded-md bg-bg-sunken p-4 text-sm text-fg-muted"
        data-testid="document-preview-empty"
      >
        文档内容为空，请用下方「下载」按钮查看原文。
      </div>
    );
  }

  return (
    <div
      className="mb-4 border border-border rounded-md overflow-hidden bg-bg-sunken"
      data-testid="document-preview-text"
    >
      <pre className="whitespace-pre-wrap p-4 text-sm max-h-[600px] overflow-y-auto font-mono">
        {text}
      </pre>
    </div>
  );
}
