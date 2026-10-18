/**
 * routes/DeliveryDetail.tsx — 阶段 3 交付详情
 *
 * 数据: useQuery(["delivery", id], () => getDeliverable(id))
 * 端点: GET /yinian/deliverables/:id — server 端 deliverables.routes.js
 *   返 DeliverableDetailDto (含 url / thumbnailUrl / mimeType / sizeBytes /
 *   prompt / toolName / metadata 等).
 *
 * 渲染策略 (按 deliverableType / mimeType 分流):
 *   - image: <img> 显示 url
 *   - web:   跳 url (浏览器打开)
 *   - document: 根据 mimeType 选 iframe / pre / download 按钮
 *     · application/pdf: <iframe src=url>
 *     · text/* / text-markdown: <pre> 滚动
 *     · 其他: 下载按钮
 *
 * 操作: 下载 / 删除 (AlertDialog) / 返回
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
      <div className="min-h-full px-6 py-8">
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
      <div className="min-h-full px-6 py-8">
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
    <div className="min-h-full px-6 py-6">
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

        {/* 正文 — 按 type 渲染 */}
        <ContentView item={item} />

        {/* 操作区 */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            size="md"
            onClick={() => navigate("/deliveries")}
          >
            返回列表
          </Button>
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              download={item.deliverableType !== "image" && item.deliverableType !== "web"}
            >
              <Button variant="outline" size="md">
                {item.deliverableType === "web" ? "打开" : "下载"}
              </Button>
            </a>
          ) : null}
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
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// ContentView — 按 deliverableType / mimeType 渲染
// ────────────────────────────────────────────────────────────

function ContentView({ item }: { item: Deliverable }) {
  const url = item.url;

  // image: <img>
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

  // web: 提示打开 (实际打开走外链 button, 这里展示 metadata)
  if (item.deliverableType === "web") {
    return (
      <div className="rounded-md bg-bg-elevated p-6 text-center">
        <p className="text-sm text-fg-muted mb-3">网页类交付物</p>
        <p className="text-xs text-fg-subtle">点击「打开」在浏览器中查看</p>
      </div>
    );
  }

  // document: 按 mimeType 分流
  if (item.deliverableType === "document") {
    const mime = (item.mimeType || "").toLowerCase();

    if (mime === "application/pdf" && url) {
      return (
        <div className="rounded-md bg-bg-elevated overflow-hidden">
          <iframe
            src={url}
            className="w-full h-[70vh] bg-bg-sunken"
            title={item.title || "PDF"}
          />
        </div>
      );
    }

    if (mime.startsWith("text/") || mime === "text/markdown" || mime === "") {
      // text 类 — 客户端拉一次显示; 不暴露 content 给 list, detail 也没有 content 字段
      // 走 url 让浏览器 / electron 直接渲染, 这里给一个下载 / 打开按钮
      return (
        <div className="rounded-md bg-bg-elevated p-6 text-center">
          <p className="text-sm text-fg-muted mb-3">
            {mime ? mime : "未知类型"} 文件
          </p>
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:underline text-sm"
            >
              打开 / 下载
            </a>
          ) : (
            <p className="text-xs text-fg-subtle">无 URL</p>
          )}
        </div>
      );
    }

    // 其他二进制 (docx / xlsx 等): 兜底下载
    return (
      <div className="rounded-md bg-bg-elevated p-6 text-center">
        <p className="text-sm text-fg-muted mb-3">
          {mime || "未知类型"} 文件
        </p>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand hover:underline text-sm"
          >
            下载查看
          </a>
        ) : null}
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
