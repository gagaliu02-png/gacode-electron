/**
 * components/library/EditSheet.tsx — 编辑知识库条目 (行内编辑弹窗)
 *
 * 事实源: gacode-web/src/app/(main)/library/page.tsx:1208-1242 (编辑 Modal)
 *   web 用 AlertDialog (自实现, 无 Radix) + 标题 Input + 标签 Input + 取消/保存.
 *
 * PC 侧对应物 = components/ui/ConfirmDialog —— 它的 doc 明确写着
 *   「视觉逐条对齐 gacode-web/src/components/ui/alert-dialog.tsx (C2-20)」:
 *   居中 modal + 黑色遮罩 (backdrop-blur) + rounded-2xl + shadow-2xl + 边框 +
 *   max-w-md + p-6 + ESC 关闭 + 锁 body 滚动 + 淡入动画,
 *   footer 结构 `flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-2`
 *   跟 web AlertDialogFooter 一致.
 *   ⇒ 本组件不再自造 modal, 改用 ConfirmDialog (L-69).
 *
 * 表单 (L-72): 裸 <input> → components/ui/Input (跟 web 的 Input 同款).
 * 只读 meta 区 (L-71): web 的编辑弹窗**没有**类型/ID/创建时间 ⇒ 直接删.
 *
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
import { Input } from "../ui/Input";
import { ConfirmDialog } from "../ui/ConfirmDialog";

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
      toast({ title: "已更新", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["library"] });
      queryClient.invalidateQueries({ queryKey: ["library-item", item?.id] });
      onSaved?.(updated);
      onClose();
    },
    onError: (err) => {
      toast({
        title: "更新失败",
        description:
          err instanceof Error ? err.message : "请稍后重试",
        variant: "danger",
      });
    },
  });

  if (!open || !item) return null;

  const trimmedTitle = title.trim();

  const submit = () => {
    if (!trimmedTitle) {
      toast({ title: "标题不能为空", variant: "warning" });
      return;
    }
    mutation.mutate();
  };

  return (
    <ConfirmDialog
      title="编辑知识库条目"
      cancelLabel="取消"
      confirmLabel="保存"
      confirmVariant="default"
      loading={mutation.isPending}
      onCancel={onClose}
      onConfirm={submit}
    >
      {/* 表单 — web library/page.tsx:1213-1234 */}
      <div className="space-y-3">
        <div>
          <label className="text-xs text-fg-muted mb-1 block">标题</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题"
            maxLength={200}
            autoFocus
          />
        </div>
        <div>
          <label className="text-xs text-fg-muted mb-1 block">
            标签{" "}
            <span className="text-fg-subtle">(用逗号或空格分隔)</span>
          </label>
          <Input
            value={tagsRaw}
            onChange={(e) => setTagsRaw(e.target.value)}
            placeholder="例如: 设计, 灵感, 2026"
          />
        </div>
      </div>
    </ConfirmDialog>
  );
}
