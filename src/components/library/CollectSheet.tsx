/**
 * components/library/CollectSheet.tsx — 4 路采集入口 Sheet
 *                          (gacode-electron 0.7.2 P0 library-9)
 *
 * 4 个 tab:
 *   - 文字: textarea → 跟 web 一样, 第一行非空做 title (max 80 字符);
 *           后续用 POST type='doc' (url placeholder) → PATCH content=<正文>
 *           (跟 web library/page.tsx 两步法一致, 因 server POST /library schema enum
 *            仅 ['image','doc','link'], 没有 'text', 客户端做 schema 适配)
 *   - 链接: URL input → POST type='link', url=用户输入
 *   - 图片: file picker (image/*) → uploadAttachment → POST type='image'
 *   - 文件: file picker (any)   → uploadAttachment → POST type='doc'
 *
 * 复用 ui/BottomSheet 走底部抽屉风格, 自实现 tab 切换 (不引 Radix Tabs).
 * 服务端调用一律走 src/lib/api.ts, 不会动任何其他组件.
 */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createLibraryItem,
  updateLibraryItem,
  deleteLibraryItem,
  type LibraryItem,
} from "../../lib/api";
import { uploadAttachment } from "../../lib/upload";
import { useToast } from "../ui/Toast";
import { Button } from "../ui/Button";

export interface CollectSheetProps {
  open: boolean;
  onClose: () => void;
}

type Tab = "text" | "link" | "image" | "file";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "text", label: "文字" },
  { key: "link", label: "链接" },
  { key: "image", label: "图片" },
  { key: "file", label: "文件" },
];

const MAX_CONTENT_LEN = 32000;
const MAX_BYTES = 50 * 1024 * 1024;

export function CollectSheet({ open, onClose }: CollectSheetProps) {
  const [tab, setTab] = useState<Tab>("text");
  const [textDraft, setTextDraft] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // 打开时重置草稿
  useEffect(() => {
    if (open) {
      setTextDraft("");
      setLinkUrl("");
      setTab("text");
    }
  }, [open]);

  // ─── 文字提交 (两步法) ───
  const textMutation = useMutation({
    mutationFn: async (raw: string) => {
      const txt = raw.trim();
      if (!txt) throw new Error("内容不能为空");
      const isUrl = /^https?:\/\/\S+/i.test(txt);

      // URL 走原路径 (不走两步法)
      if (isUrl) {
        const firstLine = txt.split(/\r?\n/).find((l) => l.trim()) || txt;
        const title = firstLine.slice(0, 80).trim() || "未命名";
        return createLibraryItem({
          type: "link",
          title,
          url: txt,
        });
      }

      // 纯文本: 截断 + POST + PATCH
      const firstLine = txt.split(/\r?\n/).find((l) => l.trim()) || txt;
      const title = firstLine.slice(0, 80).trim() || "未命名";
      const submittedDraft =
        txt.length > MAX_CONTENT_LEN ? txt.slice(0, MAX_CONTENT_LEN) : txt;

      let createdId: string | null = null;
      try {
        const created = await createLibraryItem({
          type: "doc",
          title,
          url: "text://placeholder",
        });
        createdId = created.id;
        await updateLibraryItem(created.id, { content: submittedDraft });
        return created;
      } catch (err) {
        // 失败回滚
        if (createdId) {
          try {
            await deleteLibraryItem(createdId);
          } catch {
            /* rollback failed, swallow */
          }
        }
        throw err;
      }
    },
    onSuccess: () => {
      toast({ message: "已保存到知识库", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.invalidateQueries({ queryKey: ["library-tags"] });
      onClose();
    },
    onError: (err) => {
      toast({
        message: `保存失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });

  // ─── 链接提交 (URL) ───
  const linkMutation = useMutation({
    mutationFn: async (url: string) => {
      const trimmed = url.trim();
      if (!trimmed) throw new Error("链接不能为空");
      // 不强制要求带 http(s) — server 端 schema 通常要求, 这里宽松,
      // 失败时由 toast 提示 (POST 4xx → Error).
      const title = trimmed.slice(0, 80).trim() || "未命名链接";
      return createLibraryItem({
        type: "link",
        title,
        url: trimmed,
      });
    },
    onSuccess: () => {
      toast({ message: "已保存到知识库", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.invalidateQueries({ queryKey: ["library-tags"] });
      onClose();
    },
    onError: (err) => {
      toast({
        message: `保存失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });

  // ─── 文件/图片上传 ───
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleFilePicked = async (file: File, kind: "image" | "file") => {
    if (file.size > MAX_BYTES) {
      toast({
        message: `文件超过 50MB: ${file.name}`,
        variant: "danger",
      });
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const handle = uploadAttachment(file, {
        mode: kind === "image" ? "image" : "document",
        onProgress: (p) => setProgress(p.pct),
      });
      const res = await handle.promise;
      const refId = res.url || res.fileId;
      if (!refId) throw new Error("上传未返回 URL");
      const created: LibraryItem = await createLibraryItem({
        type: kind === "image" ? "image" : "doc",
        title: stripExt(file.name) || "未命名",
        url: refId,
      });
      toast({ message: `已保存到知识库: ${created.title}`, variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["library"] });
      onClose();
    } catch (err) {
      toast({
        message: `采集失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    } finally {
      setUploading(false);
      setProgress(null);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="采集到知识库"
      className="fixed inset-0 z-50 flex items-end justify-center"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-2xl rounded-t-md bg-bg-elevated shadow-dialog p-5 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-3 shrink-0">
          <h2 className="text-base font-medium">采集到知识库</h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="关闭">
            ×
          </Button>
        </div>

        {/* Tabs — 不引 Radix, 自实现按钮组 */}
        <div className="flex items-center gap-2 mb-4 shrink-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={[
                "px-3 py-1 text-sm rounded transition-colors duration-150",
                tab === t.key
                  ? "bg-brand text-brand-on shadow-sm"
                  : "bg-bg-sunken text-fg-muted hover:bg-bg-sunken/80",
              ].join(" ")}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {tab === "text" ? (
            <TextTab
              value={textDraft}
              onChange={setTextDraft}
              pending={textMutation.isPending}
              onSubmit={() => textMutation.mutate(textDraft)}
              onCancel={onClose}
            />
          ) : tab === "link" ? (
            <LinkTab
              value={linkUrl}
              onChange={setLinkUrl}
              pending={linkMutation.isPending}
              onSubmit={() => linkMutation.mutate(linkUrl)}
              onCancel={onClose}
            />
          ) : tab === "image" ? (
            <FileTab
              label="点击选择图片"
              hint="支持 JPG / PNG / WebP / GIF 等 (50MB 以内)"
              inputRef={imageInputRef}
              accept="image/*"
              onPick={(f) => handleFilePicked(f, "image")}
              uploading={uploading}
              progress={progress}
              onCancel={onClose}
            />
          ) : (
            <FileTab
              label="点击选择文件"
              hint="支持 PDF / DOCX / XLSX / TXT / MD 等文档"
              inputRef={fileInputRef}
              accept=".pdf,.doc,.docx,.txt,.md,.zip,.csv,.xlsx,.xls,.json"
              onPick={(f) => handleFilePicked(f, "file")}
              uploading={uploading}
              progress={progress}
              onCancel={onClose}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 4 个 tab 内内容
// ────────────────────────────────────────────────────────────

function TextTab({
  value,
  onChange,
  pending,
  onSubmit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  pending: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const disabled = !value.trim() || pending;
  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-muted">
        输入文本或链接 (以 https:// 开头会被识别为链接)
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="在这里输入内容..."
        rows={6}
        autoFocus
        className="w-full rounded-md bg-bg-sunken px-4 py-3 text-base placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand/40 resize-none"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onCancel} disabled={pending}>
          取消
        </Button>
        <Button
          variant="default"
          size="md"
          loading={pending}
          disabled={disabled}
          onClick={onSubmit}
        >
          采集
        </Button>
      </div>
    </div>
  );
}

function LinkTab({
  value,
  onChange,
  pending,
  onSubmit,
  onCancel,
}: {
  value: string;
  onChange: (v: string) => void;
  pending: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const disabled = !value.trim() || pending;
  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-muted">输入网页 URL, 自动入库</p>
      <input
        type="url"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="https://example.com/article"
        autoFocus
        className="w-full rounded-md bg-bg-sunken border border-border px-4 py-3 text-base placeholder:text-fg-subtle focus:outline-none focus:border-brand"
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onCancel} disabled={pending}>
          取消
        </Button>
        <Button
          variant="default"
          size="md"
          loading={pending}
          disabled={disabled}
          onClick={onSubmit}
        >
          采集
        </Button>
      </div>
    </div>
  );
}

function FileTab({
  label,
  hint,
  inputRef,
  accept,
  onPick,
  uploading,
  progress,
  onCancel,
}: {
  label: string;
  hint: string;
  inputRef: React.RefObject<HTMLInputElement>;
  accept: string;
  onPick: (file: File) => void;
  uploading: boolean;
  progress: number | null;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-fg-muted">{hint}</p>
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-md border-2 border-dashed border-border bg-bg-sunken px-4 py-8 text-center hover:border-brand focus-visible:border-brand disabled:opacity-60"
      >
        <span className="block text-sm font-medium text-fg">{label}</span>
        <span className="block text-xs text-fg-muted mt-1">
          {uploading
            ? `上传中 ${progress ?? 0}%`
            : "支持大部分常见格式 · 单文件最大 50MB"}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          e.target.value = "";
        }}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onCancel} disabled={uploading}>
          取消
        </Button>
      </div>
    </div>
  );
}

function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}
