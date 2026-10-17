/**
 * components/deliveries/DeliveriesDropZone.tsx — 阶段 4 Deliveries 拖拽上传 (placeholder)
 *
 * Deliveries (交付中心) 现阶段没有"用户上传产生交付物"的端点 — server 端
 * /yinian/deliverables 来自 AI 生成 (image / web / document) 或 user_uploaded
 * 路径 (后者 server 已经硬过滤掉, 只剩 AI 产物). PC 端允许用户拖拽文件入库
 * 的同时, 这里"占位"提示一份边界:
 *
 *   1. 拖入文件 → 走一样的 uploadAttachment 到 /yinian/documents
 *   2. 但不直接 createDeliverable (没端点), 改成 createLibraryItem 先入 KB,
 *      让用户后续在聊天里 @ reference
 *
 * 后续若 server 加 `POST /yinian/deliverables/user-upload`, 这里切换路径.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadAttachment } from "../../lib/upload";
import { createLibraryItem } from "../../lib/api";

const MAX_BYTES = 50 * 1024 * 1024;

export interface DeliveriesDropZoneProps {
  children: ReactNode;
  /** 占位: 文件被收纳进 KB 后回调 (ok=true). */
  onRouted?: (r: { file: File; ok: boolean; msg?: string }) => void;
}

function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

export function DeliveriesDropZone({ children, onRouted }: DeliveriesDropZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [draggingCount, setDraggingCount] = useState(0);
  const dragCounterRef = useRef(0);
  const queryClient = useQueryClient();

  const uploadAndRoute = useMutation({
    mutationFn: async (file: File) => {
      const handle = uploadAttachment(file, {
        onProgress: (p) => setProgress(p.pct),
      });
      const res = await handle.promise;
      // 无 deliverables 直传端点 → 走 KB 入库, 后续在 chat 里 @ reference 用
      return createLibraryItem({
        type: res.url ? "image" : "doc",
        title: stripExt(file.name) || "未命名",
        url: res.url || undefined,
        tags: ["from-deliveries"],
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
        const item = await uploadAndRoute.mutateAsync(file);
        onRouted?.({ file, ok: true, msg: `已入知识库 #${item.id}` });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onRouted?.({ file, ok: false, msg });
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
          <div className="absolute inset-3 rounded-md border-2 border-dashed border-warning bg-warning/10 backdrop-blur-sm" />
          <div className="relative rounded-md bg-bg-elevated border border-warning/60 px-6 py-4 shadow-dialog max-w-md">
            <p className="text-sm font-medium">拖入文件 — 转入知识库</p>
            <p className="text-xs text-fg-muted">
              交付中心暂不支持用户直传; {draggingCount > 0 ? `已识别 ${draggingCount} 个文件` : ""}
              当前会先入 KB, 后续在聊天里 @
              引用。
              {progress !== null ? ` · 上传 ${progress}%` : null}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
