/**
 * components/library/LibraryDropZone.tsx — 阶段 4 Library 拖拽上传
 *
 * 用法:
 *   <LibraryDropZone onDropped={(files) => ...}>
 *     <Library ... />
 *   </LibraryDropZone>
 *
 * 它监听 window 上的 drag/drop 事件, 弹出全屏 drag 高亮, 落文件后:
 *   1. 每个文件走 uploadAttachment (auto mode: image/* → image, 其他 → document)
 *   2. 给一个 title (去掉后缀) + url/fileId, 调 createLibraryItem(type, title, ...)
 *   3. 失败调 onLibraryError (parent 通常 toast)
 *
 * 多个文件同时拖入 → 顺序串行入库 (server 端 upload/document 接受单 file,
 * 避免并发打爆)。
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadAttachment, deriveUploadMode } from "../../lib/upload";
import { createLibraryItem } from "../../lib/api";

const MAX_BYTES = 50 * 1024 * 1024;
const IMAGE_MIME = /^image\//;

export interface LibraryDropZoneProps {
  children: ReactNode;
  /** 文件接收完毕 (成功/失败都触发, ok=false 时附 msg) */
  onResult?: (r: { file: File; ok: boolean; msg?: string; libraryId?: string }) => void;
}

function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

export function LibraryDropZone({ children, onResult }: LibraryDropZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [draggingCount, setDraggingCount] = useState(0);
  const dragCounterRef = useRef(0);
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: async (file: File) => {
      const mode = deriveUploadMode(file);
      const handle = uploadAttachment(file, {
        mode,
        onProgress: (p) => setProgress(p.pct),
      });
      const res = await handle.promise;
      if (mode === "image") {
        if (!res.url) throw new Error("未拿到图片 url");
        return createLibraryItem({
          type: "image",
          title: stripExt(file.name) || "未命名图片",
          url: res.url,
        });
      }
      if (!res.fileId) throw new Error("未拿到文件 fileId");
      return createLibraryItem({
        type: "doc",
        title: stripExt(file.name) || "未命名文档",
        url: undefined,
        tags: [],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
    },
  });

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      setDragActive(true);
      setDraggingCount((n) => n + 1);
    };
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types?.includes("Files")) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = (e: DragEvent) => {
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      setDraggingCount((n) => Math.max(0, n - 1));
      if (dragCounterRef.current === 0) setDragActive(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setDraggingCount(0);
      setDragActive(false);
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;
      // 串行入库避免并发 (server 不一定支持 batch)
      void runSequential(Array.from(files));
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSequential = async (files: File[]) => {
    for (const file of files) {
      setProgress(0);
      try {
        if (file.size > MAX_BYTES) {
          throw new Error(`文件超过 50MB: ${file.name}`);
        }
        const item = await create.mutateAsync(file);
        onResult?.({ file, ok: true, libraryId: item.id });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onResult?.({ file, ok: false, msg });
      }
    }
    setProgress(null);
  };

  return (
    <>
      {children}
      {dragActive ? (
        <div
          className="pointer-events-none fixed inset-0 z-[200] flex items-center justify-center"
          aria-hidden="true"
        >
          <div className="absolute inset-3 rounded-md border-2 border-dashed border-brand bg-brand/10 backdrop-blur-sm" />
          <div className="relative rounded-md bg-bg-elevated border border-brand/60 px-6 py-4 shadow-dialog">
            <p className="text-sm font-medium">拖入文件入库</p>
            <p className="text-xs text-fg-muted">
              {draggingCount > 0 ? `已识别 ${draggingCount} 个文件` : `将自动入库到知识库`}
              {progress !== null ? ` · 上传 ${progress}%` : null}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* unused export marker to silence "unused" rule (IMAGE_MIME kept for future) */
export const LIB_DROPZONE_IMAGE_MIME = IMAGE_MIME;
