/**
 * components/library/CollectSheet.tsx — 知识库采集 Sheet (3 宫格入口 + 第二层文本 Sheet)
 *
 * 1:1 对齐 gacode-web `src/app/(main)/library/page.tsx` (事实源; 台账 L-54 ~ L-68):
 *   - L-54 信息架构: web 是「3 宫格 (Text / Photo / File) + 第二层」, **不是** 4 tab
 *                   ⇒ PC 原来的「链接」独立 tab 删除 (web 没有; 链接由 Text 层的
 *                     URL 识别覆盖, 见 web library/page.tsx:262)
 *   - L-55 容器: web 的全宽底抽屉 `fixed bottom-0 left-0 right-0 z-50 bg-bg-elevated
 *         rounded-t-lg p-4 pb-8` + 标题栏 `text-base font-medium` + X `w-8 h-8 rounded-full`
 *         (web library/page.tsx:705-716)
 *   - L-56 宫格按钮 `flex flex-col items-center gap-2 py-5 rounded-md bg-card
 *         hover:bg-card-hover transition-colors` + `w-7 h-7` 图标 (web :717-746)
 *   - L-57 第二层 Sheet「采集文本 / 链接」: textarea + 取消/采集 (web :751-805)
 *   - L-59 Text 按钮组 size md → sm (web :783-800)
 *   - L-60 空内容 → toast warning「内容不能为空」(不再走 "保存失败: ..." danger; web :256-259)
 *   - L-61 32000 字符截断 → toast warning + description (web :267-276)
 *   - L-62 上传 30 秒超时 → toast warning「采集超时」(web :357-363)
 *   - L-63 提交后**立即**关 Sheet (await 之前就收起, 成功/失败都先收; web :278-280)
 *   - L-64 保存失败 toast 改 title + description 两段式 (web :337-341)
 *   - L-67 入口 Sheet 收起后等 100ms 再开下一层, 避免两层同时在场 (web :415,421,723)
 *   - L-68 补「拍照」入口 → 复用 PC 的 MediaPicker **image 模式**
 *         (align-d-home H-32: web 的 MediaPicker image 模式是「拍照 + 相册」并排两个钮,
 *          PC 补齐后 Photo 入口走 image 模式, 与 web `library/page.tsx:411-422` 一致)
 *
 * 组件边界:
 *   - PC 没有 lucide-react ⇒ Type / Camera / File 图标统一用 ui/Glyphs.tsx
 *     (2026-10-26 收编: 原来这里手写了 3 份内联 svg, 现在是具名导出复用);
 *     X 直接复用 ui/Glyphs 的 CloseIcon (lucide `x`).
 *   - PC 没有 tailwind-merge / clsx ⇒ className 一律数组 .join(" ").
 *   - web 用到的 token 在 PC tailwind.config.ts 里取值完全一致
 *     (card #141414 / card-hover #1e1e1e / bg-elevated #181818 / radius-lg 20 / radius-md 16)
 *     ⇒ 类名可直接沿用, 不新造颜色.
 */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createLibraryItem,
  updateLibraryItem,
  deleteLibraryItem,
} from "../../lib/api";
import { uploadAttachment } from "../../lib/upload";
import { useToast } from "../ui/Toast";
import { Button } from "../ui/Button";
import { MediaPicker } from "../home/MediaPicker";
import { CameraIcon, CloseIcon, FileIcon, TypeIcon } from "../ui/Glyphs";

export interface CollectSheetProps {
  open: boolean;
  onClose: () => void;
}

/** 服务端 PATCH content 上限 (web library/page.tsx:254 同值) */
const MAX_CONTENT_LEN = 32000;
/** 单文件 50MB 上限 (PC lib/upload.ts 同值) */
const MAX_BYTES = 50 * 1024 * 1024;
/** 上传超时兜底 (web library/page.tsx:357-363 同值) */
const UPLOAD_TIMEOUT_MS = 30_000;
/** 入口 Sheet 收起 → 下一层打开的间隔 (web library/page.tsx:415,421,723 同值) */
const LAYER_SWITCH_DELAY_MS = 100;

/** 当前在场的是哪一层 (closed = 两层都不在场, 等 100ms 切下一层) */
type Layer = "entry" | "text" | "closed";
/** MediaPicker 模式: image (拍照 + 相册, align-d-home H-32) / file */
type PickerKind = "image" | "file";

interface TextSubmitInput {
  /** 是 URL (走 type=link) 还是纯文本 (走两步法) */
  isUrl: boolean;
  title: string;
  /** 已按 MAX_CONTENT_LEN 截断的正文 */
  content: string;
}

export function CollectSheet({ open, onClose }: CollectSheetProps) {
  const [layer, setLayer] = useState<Layer>("entry");
  const [pickerKind, setPickerKind] = useState<PickerKind | null>(null);
  const [textDraft, setTextDraft] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  /** 入口 Sheet 收起 → 下一层打开的延迟 timer (L-67) */
  const layerTimerRef = useRef<number | null>(null);

  // 打开时重置到入口层 (open 由 Library.tsx 控制)
  useEffect(() => {
    if (open) {
      setLayer("entry");
      setPickerKind(null);
      setTextDraft("");
    }
    return () => {
      if (layerTimerRef.current !== null) {
        window.clearTimeout(layerTimerRef.current);
        layerTimerRef.current = null;
      }
    };
  }, [open]);

  /** L-67: 收起当前层, 等 100ms 再开下一层 (两层不同时在场) */
  const scheduleNext = (apply: () => void) => {
    setLayer("closed");
    setPickerKind(null);
    if (layerTimerRef.current !== null) {
      window.clearTimeout(layerTimerRef.current);
    }
    layerTimerRef.current = window.setTimeout(() => {
      layerTimerRef.current = null;
      apply();
    }, LAYER_SWITCH_DELAY_MS);
  };

  /** 宫格「Text」→ 第二层文本 Sheet (web library/page.tsx:720-724) */
  const openTextLayer = () => {
    setTextDraft("");
    scheduleNext(() => setLayer("text"));
  };

  /** 宫格「Photo」/「File」→ PC 现有 MediaPicker (web library/page.tsx:411-422) */
  const openPicker = (kind: PickerKind) => {
    scheduleNext(() => setPickerKind(kind));
  };

  // ─── 文本采集 (web handleTextSubmit, library/page.tsx:239-344) ───
  const textMutation = useMutation({
    mutationFn: async (input: TextSubmitInput) => {
      // URL 走原路径 (web library/page.tsx:282-301)
      if (input.isUrl) {
        return createLibraryItem({
          type: "link",
          title: input.title,
          url: input.content,
        });
      }
      // 纯文本两步法: POST type=doc (url 占位) → PATCH content (web :304-343)
      //   失败回滚: POST 成功但 PATCH 失败 → 删孤儿, 不留半截
      let createdId: string | null = null;
      try {
        const created = await createLibraryItem({
          type: "doc",
          title: input.title,
          url: "text://placeholder",
        });
        createdId = created.id;
        await updateLibraryItem(created.id, { content: input.content });
        return created;
      } catch (err) {
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
      toast({ title: "已保存到知识库", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["library"] });
    },
    onError: (err) => {
      // L-64: 改 title + description 两段式 (web library/page.tsx:337-341)
      toast({
        title: "保存失败，稍后重试",
        description: err instanceof Error ? err.message : String(err),
        variant: "danger",
      });
    },
  });

  const handleTextSubmit = () => {
    const txt = textDraft.trim();
    // L-60: 空内容直接 toast 拦截, 根本不调 API (web library/page.tsx:256-259)
    if (!txt) {
      toast({ title: "内容不能为空", variant: "warning" });
      return;
    }
    // URL 识别: 是 URL → type='link'; 是纯文本 → 两步法 (web :262)
    const isUrl = /^https?:\/\/\S+/i.test(txt);
    // title 取第一行非空内容, 截前 80 字 (web :263-265)
    const firstLine = txt.split(/\r?\n/).find((l) => l.trim()) || txt;
    const title = firstLine.slice(0, 80).trim() || "未命名";

    // L-61: 超长截断 + toast 提示 (web library/page.tsx:267-276)
    let submittedDraft = txt;
    if (txt.length > MAX_CONTENT_LEN) {
      submittedDraft = txt.slice(0, MAX_CONTENT_LEN);
      toast({
        title: "内容已截断到 32000 字符",
        description: `原文 ${txt.length} 字符, 超出部分未保存, 请考虑分段`,
        variant: "warning",
      });
    }

    // L-63: 提前关闭 Sheet + 清空 input (无论成功/失败都先收起, web :278-280)
    setLayer("closed");
    setTextDraft("");
    onClose();

    textMutation.mutate({ isUrl, title, content: submittedDraft });
  };

  // ─── Photo / File 采集 (web handlePickerCapture, library/page.tsx:346-409) ───
  const handlePickerCapture = async (file: File, kind: PickerKind) => {
    if (file.size > MAX_BYTES) {
      toast({
        message: `文件超过 50MB: ${file.name}`,
        variant: "danger",
      });
      return;
    }
    const isImage = kind === "image";

    // L-62: 30 秒上传超时提示 (web library/page.tsx:357-363)
    const timeoutTimer = window.setTimeout(() => {
      toast({
        title: "采集超时",
        description: "上传超过 30 秒未完成, 请稍后再试",
        variant: "warning",
      });
    }, UPLOAD_TIMEOUT_MS);

    try {
      const handle = uploadAttachment(file, {
        mode: isImage ? "image" : "document",
      });
      const res = await handle.promise;
      window.clearTimeout(timeoutTimer);
      const refId = res.url || res.fileId;
      if (!refId) {
        toast({
          title: "采集失败",
          description: "上传返回为空 URL",
          variant: "danger",
        });
        return;
      }
      await createLibraryItem({
        type: isImage ? "image" : "doc",
        title: file.name || "未命名",
        url: refId,
      });
      toast({ title: "已保存到知识库", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["library"] });
    } catch (err) {
      window.clearTimeout(timeoutTimer);
      // upload.ts 已按 mode 输出人话文案 ("图片上传失败: ..."), 这里不再加前缀,
      // 否则会出现 "采集失败: 文档上传失败: ..." 双前缀
      toast({
        message: err instanceof Error ? err.message : String(err),
        variant: "danger",
      });
    }
  };

  if (!open) return null;

  return (
    <>
      {/* ═══ 入口层 — 3 宫格 (web library/page.tsx:692-749) ═══ */}
      {layer === "entry" ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={onClose}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="采集内容"
            className="fixed bottom-0 left-0 right-0 z-50 bg-bg-elevated rounded-t-lg p-4 pb-8"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-medium">采集内容</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="w-8 h-8 rounded-full text-fg-muted hover:bg-accent transition-colors inline-flex items-center justify-center"
              >
                <CloseIcon size={20} className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={openTextLayer}
                className="flex flex-col items-center gap-2 py-5 rounded-md bg-card hover:bg-card-hover transition-colors"
              >
                <TypeIcon className="w-7 h-7 text-fg-muted" />
                <span className="text-sm text-fg-muted">Text</span>
              </button>
              <button
                type="button"
                onClick={() => openPicker("image")}
                className="flex flex-col items-center gap-2 py-5 rounded-md bg-card hover:bg-card-hover transition-colors"
              >
                <CameraIcon className="w-7 h-7 text-fg-muted" />
                <span className="text-sm text-fg-muted">Photo</span>
              </button>
              <button
                type="button"
                onClick={() => openPicker("file")}
                className="flex flex-col items-center gap-2 py-5 rounded-md bg-card hover:bg-card-hover transition-colors"
              >
                <FileIcon className="w-7 h-7 text-fg-muted" />
                <span className="text-sm text-fg-muted">File</span>
              </button>
            </div>
          </div>
        </>
      ) : null}

      {/* ═══ 第二层 — 采集文本 / 链接 (web library/page.tsx:751-805) ═══ */}
      {layer === "text" ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={onClose}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="采集文本 / 链接"
            className="fixed bottom-0 left-0 right-0 z-50 bg-bg-elevated rounded-t-lg p-4 pb-8"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-base font-medium">采集文本 / 链接</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="关闭"
                className="w-8 h-8 rounded-full text-fg-muted hover:bg-accent transition-colors inline-flex items-center justify-center"
              >
                <CloseIcon size={20} className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <textarea
                value={textDraft}
                onChange={(e) => setTextDraft(e.target.value)}
                placeholder="输入链接 (https://...) 或文本内容..."
                rows={4}
                autoFocus
                className="w-full rounded-xl bg-muted/50 px-4 py-3 text-base placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand resize-none"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={onClose}>
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={handleTextSubmit}
                  disabled={!textDraft.trim() || textMutation.isPending}
                >
                  {textMutation.isPending ? (
                    <span className="gagaos-spinner" aria-hidden="true" />
                  ) : (
                    "采集"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {/* ═══ MediaPicker — Photo / File 采集 (web library/page.tsx:807-818) ═══ */}
      <MediaPicker
        open={pickerKind !== null}
        onClose={onClose}
        kind={pickerKind ?? "image"}
        onCapture={(file) => {
          const kind = pickerKind ?? "image";
          void handlePickerCapture(file, kind);
        }}
      />
    </>
  );
}
