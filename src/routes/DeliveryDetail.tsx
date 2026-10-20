/**
 * routes/DeliveryDetail.tsx — 阶段 0.7.5 交付详情 (P1+P2 共 3 项补齐)
 *
 * 阶段 3 阶段 7 baseline: type + meta + 系统默认应用打开 + 删除.
 * 0.7.5 增量 (gagaOS feedback 2026-10-19 §3.7):
 *   - deliveries-id-7 (P1): 关联 chat session 跳回 — 顶部加 "回到对话 #<sessionId>" 按钮
 *                          (server Deliverable.sessionId 字段已返, 直接跳 /chat/:id)
 *   - deliveries-id-8 (P1): share / 分享到对话 — ShareSheet sheet (新建或选已有 session)
 *                          send-blocker: server 端 shareDeliverableToChat endpoint 未实现
 *   - deliveries-id-9 (P2): 收藏 (star) — StarButton (server star endpoint 未实现)
 *
 * file scope:
 *   - 本文件改: routes/DeliveryDetail.tsx
 *   - 新建/复用: components/deliveries/{ShareSheet, StarButton}.tsx, components/ui/ConfirmDialog
 *   - 改 api.ts: 新增 shareDeliverableToChat / starDeliverable / unstarDeliverable
 */

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteDeliverable,
  getDeliverable,
  type Deliverable,
} from "../lib/api";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { ShareSheet } from "../components/deliveries/ShareSheet";
import { StarButton } from "../components/deliveries/StarButton";

export function DeliveryDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: item, isLoading, error } = useQuery({
    queryKey: ["delivery", id],
    queryFn: () => getDeliverable(id),
    enabled: Boolean(id),
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  // 阶段 7: 调主进程 IPC 走系统默认应用打开交付文件 (PDF / 视频 / 图片 ...)
  const openWithSystem = async (targetUrl: string) => {
    if (!targetUrl) return;
    if (!window.gacode?.openWithSystem) {
      toast({ message: "当前环境不支持调起系统应用", variant: "danger" });
      return;
    }
    try {
      const result = await window.gacode.openWithSystem({ url: targetUrl });
      if (!result?.ok) {
        toast({
          message: `打开失败: ${result?.error ?? "未知错误"}`,
          variant: "danger",
        });
      } else {
        toast({ message: "已调起系统应用", variant: "success" });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ message: `打开失败: ${msg}`, variant: "danger" });
    }
  };

  const deleteMutation = useMutation({
    mutationFn: () => deleteDeliverable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliveries"] });
      toast({ message: "已删除", variant: "success" });
      navigate("/deliveries", { replace: true });
    },
    onError: (err) => {
      toast({
        message: `删除失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-full px-4 lg:px-8 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="h-8 w-1/2 bg-bg-sunken rounded animate-pulse" />
          <div className="h-4 w-1/3 bg-bg-sunken rounded mt-3 animate-pulse" />
          <div className="h-64 w-full bg-bg-sunken rounded mt-6 animate-pulse" />
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="min-h-full px-4 lg:px-8 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-md bg-danger-soft/30 border border-danger/40 px-4 py-3 text-sm">
            加载失败:{error instanceof Error ? error.message : "未找到"}
          </div>
          <div className="mt-4">
            <Button variant="ghost" size="md" onClick={() => navigate("/deliveries")}>
              返回列表
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full px-4 lg:px-8 py-6">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* 头部 */}
        <header className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded bg-bg-elevated text-fg-muted">
              {TYPE_LABEL[item.deliverableType] || item.deliverableType}
            </span>
            <span className="text-xs text-fg-subtle font-mono">#{item.id}</span>
            <span className="text-xs text-fg-subtle">·</span>
            <span className="text-xs text-fg-subtle">
              {formatDate(item.createdAt)}
            </span>
            {item.origin === "user_uploaded" ? (
              <span className="text-xs text-fg-subtle">· 用户上传</span>
            ) : (
              <span className="text-xs text-fg-subtle">· AI 生成</span>
            )}
          </div>
          <h1 className="text-xl font-medium text-fg break-all">
            {item.title || "(无标题)"}
          </h1>
        </header>

        {/* 元信息 */}
        <div className="rounded-md bg-bg-elevated divide-y divide-border">
          {item.url ? (
            <InfoRow
              label="URL"
              value={
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand hover:underline break-all"
                >
                  {item.url}
                </a>
              }
            />
          ) : null}
          {item.mimeType ? (
            <InfoRow label="MIME" value={<span className="font-mono">{item.mimeType}</span>} />
          ) : null}
          {item.sizeBytes ? (
            <InfoRow label="大小" value={formatBytes(item.sizeBytes)} />
          ) : null}
          {item.prompt ? (
            <InfoRow label="提示词" value={item.prompt} />
          ) : null}
        </div>

        {/* 正文 — 按 type 渲染 (阶段 7: 文件走系统默认应用) */}
        <ContentView item={item} onOpenWithSystem={openWithSystem} />

        {/* 操作区 — 阶段 7: 「打开 / 下载」统一走 openWithSystem IPC.
           0.7.5: 关联 chat session 跳回 + 分享到对话 + 收藏 + 删除. */}
        <div className="flex items-center justify-end gap-2 pt-2 flex-wrap">
          <Button
            variant="ghost"
            size="md"
            onClick={() => navigate("/deliveries")}
          >
            返回列表
          </Button>
          {item.url && item.deliverableType === "image" ? (
            <Button
              variant="outline"
              size="md"
              onClick={() => void openWithSystem(item.url!)}
            >
              下载
            </Button>
          ) : null}
          {/* 0.7.5 deliveries-id-7: 关联 chat session 跳回 */}
          {item.sessionId ? (
            <Button
              variant="outline"
              size="md"
              onClick={() => navigate(`/chat/${item.sessionId}`)}
            >
              回到对话
            </Button>
          ) : null}
          {/* 0.7.5 deliveries-id-9: 收藏 (star) */}
          <StarButton deliverableId={item.id} size="md" />
          {/* 0.7.5 deliveries-id-8: 分享到对话 */}
          <Button
            variant="default"
            size="md"
            onClick={() => setShareOpen(true)}
          >
            分享到对话
          </Button>
          <Button
            variant="danger"
            size="md"
            onClick={() => setConfirmOpen(true)}
          >
            删除
          </Button>
        </div>
      </div>

      {confirmOpen ? (
        <ConfirmDialog
          title="删除这条交付?"
          message="删除后无法恢复。"
          confirmLabel="确认删除"
          confirmVariant="danger"
          loading={deleteMutation.isPending}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => deleteMutation.mutate()}
        />
      ) : null}

      <ShareSheet
        open={shareOpen}
        deliverable={item}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// ContentView — 按 deliverableType / mimeType 渲染
//
// 阶段 7: 内部 mime type 路由 enum + 「打开」按钮调 IPC `openWithSystem`.
//          内嵌只保留 text/html (iframe) + text/* / markdown (pre); 其他
//          全部走系统默认应用.
// ────────────────────────────────────────────────────────────

type FileRenderKind = "embed-html" | "embed-text" | "open-with-system";

function classifyFileRender(item: Deliverable): FileRenderKind {
  if (item.deliverableType === "document") {
    const mime = (item.mimeType || "").toLowerCase();
    // 内嵌 iframe
    if (mime === "text/html" || mime === "application/xhtml+xml") {
      return "embed-html";
    }
    // 内嵌 pre (markdown / 纯文本)
    if (
      mime.startsWith("text/") ||
      mime === "text/markdown" ||
      mime === ""
    ) {
      return "embed-text";
    }
  }
  // 其它 (PDF / 视频 / 图片 / docx / xlsx / pptx / 压缩包 / web 类型) 一律系统默认应用
  return "open-with-system";
}

function ContentView({
  item,
  onOpenWithSystem,
}: {
  item: Deliverable;
  onOpenWithSystem: (url: string) => void;
}) {
  const url = item.url;

  // image: 内嵌显示 (跟原 design 一致)
  if (item.deliverableType === "image" && url) {
    return (
      <div className="rounded-md bg-bg-elevated p-3">
        <img
          src={url}
          alt={item.title || "image"}
          className="max-w-full max-h-[70vh] mx-auto rounded"
        />
      </div>
    );
  }

  const kind = classifyFileRender(item);

  // 打开系统默认应用 — 走 IPC 路径 (不会新开 BrowserWindow)
  if (kind === "open-with-system") {
    const mimeLabel =
      item.mimeType ||
      (item.deliverableType === "web" ? "网页" : "未知类型");
    return (
      <div className="rounded-md bg-bg-elevated p-6 text-center">
        <p className="text-sm text-fg-muted mb-3">
          {item.deliverableType === "web"
            ? "网页类交付物"
            : `${mimeLabel} 文件`}
        </p>
        <p className="text-xs text-fg-subtle mb-4">
          {item.deliverableType === "web"
            ? "点击「打开」用系统默认浏览器查看"
            : "点击「打开」用系统默认应用查看 (PDF / Office / 图片查看器 / 视频播放器 / 压缩包工具)"}
        </p>
        {url ? (
          <Button
            variant="default"
            size="md"
            onClick={() => onOpenWithSystem(url)}
          >
            打开
          </Button>
        ) : (
          <p className="text-xs text-fg-subtle">无 URL</p>
        )}
      </div>
    );
  }

  // HTML 类 — 内嵌 iframe
  if (kind === "embed-html") {
    return (
      <div className="rounded-md bg-bg-elevated overflow-hidden">
        <iframe
          src={url}
          className="w-full h-[70vh] bg-bg-sunken"
          title={item.title || "HTML"}
        />
      </div>
    );
  }

  // Text / markdown — 服务器 content 字段不在 DTO 里; 给客户端打开方式
  // (跟原来保持, 走 url 让浏览器/electron 自己渲染, 一个轻量下载 / 打开提示)
  if (kind === "embed-text") {
    return (
      <div className="rounded-md bg-bg-elevated p-6 text-center">
        <p className="text-sm text-fg-muted mb-3">
          {item.mimeType || "text/markdown"} 文件
        </p>
        {url ? (
          <Button
            variant="outline"
            size="md"
            onClick={() => onOpenWithSystem(url)}
          >
            在浏览器查看
          </Button>
        ) : (
          <p className="text-xs text-fg-subtle">无 URL</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-md bg-bg-elevated p-4 text-sm text-fg-muted text-center">
      无内容
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 px-4 py-3">
      <span className="w-16 text-sm text-fg-muted shrink-0 pt-0.5">
        {label}
      </span>
      <span className="flex-1 text-sm text-fg min-w-0 break-all">{value}</span>
    </div>
  );
}

function formatBytes(size?: number | string | null): string {
  if (size === undefined || size === null || size === "") return "-";
  const n = typeof size === "string" ? Number(size) : Number(size);
  if (!Number.isFinite(n) || n <= 0) return "-";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

const TYPE_LABEL: Record<string, string> = {
  image: "图片",
  web: "网站",
  document: "文档",
};
