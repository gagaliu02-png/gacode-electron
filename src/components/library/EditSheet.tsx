/**
 * components/library/EditSheet.tsx — 编辑知识库条目 (gacode-electron 0.7.2 P0 library-11)
 *
 * 编辑库条目的 title + tags (跟 web LibraryRow 的 edit modal 行为对齐).
 * 调 PATCH /yinian/library/:id, server schema 接受至少 1 个字段.
 *
 * 用法:
 *   <EditSheet
 *     open={!!editingItem}
 *     item={editingItem}
 *     onClose={() => setEditingItem(null)}
 *     onSaved={(updated) => { ... }}
 *   />
 */

import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  updateLibraryItem,
  type LibraryItem,
} from "../../lib/api";
import { useToast } from "../ui/Toast";
import { Button } from "../ui/Button";

export interface EditSheetProps {
  open: boolean;
  item: LibraryItem | null;
  onClose: () => void;
  onSaved?: (updated: LibraryItem) => void;
}

export function EditSheet({ open, item, onClose, onSaved }: EditSheetProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");

  // 打开时用当前 item 初始化 form
  useEffect(() => {
    if (open && item) {
      setTitle(item.title || "");
      setTagsRaw((item.tags ?? []).join(", "));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!item) throw new Error("没有选中条目");
      const trimmedTitle = title.trim();
      if (!trimmedTitle) throw new Error("标题不能为空");
      const tags = tagsRaw
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      // 跟 web 一致: 至少 1 个字段才发 (server 已允许部分, 但避免空对象请求)
      return updateLibraryItem(item.id, { title: trimmedTitle, tags });
    },
    onSuccess: (updated) => {
      toast({ message: "已更新", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.invalidateQueries({ queryKey: ["library-item", item?.id] });
      queryClient.invalidateQueries({ queryKey: ["library-tags"] });
      onSaved?.(updated);
      onClose();
    },
    onError: (err) => {
      toast({
        message: `更新失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });

  if (!open || !item) return null;

  const trimmedTitle = title.trim();
  const noChange =
    trimmedTitle === (item.title ?? "") &&
    tagsRaw.trim() ===
      (item.tags ?? []).join(", ");

  const submit = () => {
    if (!trimmedTitle) {
      toast({ message: "标题不能为空", variant: "warning" });
      return;
    }
    mutation.mutate();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="编辑知识库条目"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md rounded-md bg-bg-elevated shadow-dialog p-5">
        <h2 className="text-base font-medium mb-4">编辑知识库条目</h2>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-fg-muted mb-1 block">标题</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="标题"
              maxLength={200}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              className="w-full rounded-md bg-bg-sunken border border-border px-4 py-3 text-base placeholder:text-fg-subtle focus:outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="text-xs text-fg-muted mb-1 block">
              标签{" "}
              <span className="text-fg-subtle">(用逗号或空格分隔)</span>
            </label>
            <input
              type="text"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="例如: 设计, 灵感, 2026"
              className="w-full rounded-md bg-bg-sunken border border-border px-4 py-3 text-base placeholder:text-fg-subtle focus:outline-none focus:border-brand"
            />
          </div>

          {/* 只读 meta — 跟 web 的 details modal 类似, 让用户看到类型/id/时间 */}
          <div className="rounded-md bg-bg-sunken p-3 text-xs text-fg-muted space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-fg-subtle">类型</span>
              <span>{item.type}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-fg-subtle">ID</span>
              <span className="font-mono break-all">#{item.id}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-fg-subtle">创建</span>
              <span>{item.createdAt || "-"}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-4">
          <Button
            variant="ghost"
            size="md"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            取消
          </Button>
          <Button
            variant="default"
            size="md"
            loading={mutation.isPending}
            disabled={!trimmedTitle || noChange}
            onClick={submit}
          >
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}
