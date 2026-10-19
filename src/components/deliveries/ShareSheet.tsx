/**
 * components/deliveries/ShareSheet.tsx — 分享交付物到对话 sheet
 *                            (gacode-electron 0.7.5 P1 deliveries-id-8)
 *
 * 行为 (跟 gacode-web/Android 对齐):
 *   - 「分享到对话」按钮 (DeliveryDetail 页) 弹此 sheet
 *   - 选项 1: 新建一个对话, 把 deliverable 引用作为 firstMessage 传进去
 *     (走 shareDeliverableToChat 不带 sessionId, server 端新建 + 挂 message)
 *   - 选项 2: 选已有 session (从 getChats 拉列表, 给一个简版 selector)
 *
 * 注: server unified-api 当前**没有** `POST /yinian/deliverables/:id/share` 端点
 *     (grep 后未找到 — send-blocker). 这里 UI 走完整, 调用会 404 抛错,
 *     弹 toast 提示, 等 server 端补 endpoint 后自然走通. 调用方需要兜底 try/catch.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getChats, shareDeliverableToChat, type Deliverable } from "../../lib/api";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";

export interface ShareSheetProps {
  open: boolean;
  deliverable: Deliverable | null;
  onClose: () => void;
}

type Mode = "new" | "existing";

export function ShareSheet({ open, deliverable, onClose }: ShareSheetProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [mode, setMode] = useState<Mode>("new");
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");

  const chatsQuery = useQuery({
    queryKey: ["chats"],
    queryFn: getChats,
    enabled: open && mode === "existing",
    staleTime: 30_000,
  });

  const shareMutation = useMutation({
    mutationFn: () => {
      if (!deliverable) throw new Error("没有选中交付");
      if (mode === "existing" && !selectedSessionId) {
        throw new Error("请选择一个对话");
      }
      return shareDeliverableToChat(deliverable.id, {
        sessionId: mode === "existing" ? selectedSessionId : undefined,
      });
    },
    onSuccess: (res) => {
      toast({ message: "已分享到对话", variant: "success" });
      onClose();
      // 跳到 chat session; 新 session 走 shareMutation 返回的 sessionId,
      // 已有 session 走 selectedSessionId
      const target = res.sessionId || selectedSessionId;
      if (target) navigate(`/chat/${target}`);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      // send-blocker: server 端未实现 share endpoint 时落到这里. UI 端兜底提示.
      toast({
        message: `分享失败: ${msg}`,
        variant: "danger",
      });
    },
  });

  if (!open || !deliverable) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="分享到对话"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-md rounded-md bg-bg-elevated shadow-dialog p-5">
        <h2 className="text-base font-medium mb-1">分享到对话</h2>
        <p className="text-xs text-fg-muted mb-4 break-all">
          「{deliverable.title || "(无标题)"}」
        </p>

        <div className="space-y-3">
          {/* 单选: 新建 / 选已有 */}
          <div className="flex items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="share-mode"
                checked={mode === "new"}
                onChange={() => setMode("new")}
              />
              新建对话
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="share-mode"
                checked={mode === "existing"}
                onChange={() => setMode("existing")}
              />
              选已有对话
            </label>
          </div>

          {mode === "existing" ? (
            <div>
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="w-full rounded-md bg-bg-sunken border border-border px-3 py-2 text-sm focus:outline-none focus:border-brand"
              >
                <option value="">— 选择一个对话 —</option>
                {(chatsQuery.data?.chats ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title || "(无标题)"}
                  </option>
                ))}
              </select>
              {chatsQuery.isError ? (
                <p className="mt-1 text-xs text-danger">加载对话列表失败</p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-fg-muted">
              系统会创建一个新的对话, 并把交付物的引用挂上作为 firstMessage
              (服务端具体行为以 gagaOS 拍板为准).
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 mt-5">
          <Button variant="ghost" size="md" onClick={onClose} disabled={shareMutation.isPending}>
            取消
          </Button>
          <Button
            variant="default"
            size="md"
            loading={shareMutation.isPending}
            disabled={mode === "existing" && !selectedSessionId}
            onClick={() => shareMutation.mutate()}
          >
            分享
          </Button>
        </div>
      </div>
    </div>
  );
}
