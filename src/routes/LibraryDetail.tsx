/**
 * routes/LibraryDetail.tsx — 知识库详情 (gacode-electron 0.7.2)
 *
 * 数据: useQuery(["library-item", id], () => getLibraryItem(id, true))
 * 端点: GET /yinian/library/:id?withContent=true — server 返回 LibraryItem,
 * withContent=true 时额外带 content 字段 (大字段按需开启, list 端点不暴露).
 *
 * 功能:
 *   - 顶部: 标题 / 类型 badge / id / createdAt
 *   - 元信息: URL 链接 / tags
 *   - 正文: 文本 / 图片 / 链接 三种渲染分支
 *       - text/content: <pre> 滚动展示
 *       - image (有 url): <img> 显示
 *       - link (有 url): 跳外链 + 下载按钮
 *   - 操作: 编辑 (EditSheet) / 删除 (ConfirmDialog) / 返回列表
 *
 * 增量 (0.7.2 P0 library-11): 加 "编辑" 按钮 + EditSheet, 调 PATCH /yinian/library/:id.
 * 不做"采集更多文件" — 一致由 Library 列表 CollectSheet 触发.
 */

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteLibraryItem,
  getLibraryItem,
  type LibraryItem,
} from "../lib/api";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EditSheet } from "../components/library/EditSheet";

export function LibraryDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: item, isLoading, error } = useQuery({
    queryKey: ["library-item", id],
    queryFn: () => getLibraryItem(id, true),
    enabled: Boolean(id),
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  // 编辑 Sheet — gacode-electron 0.7.2 P0 library-11 (LibraryDetail 加编辑入口)
  const [editOpen, setEditOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => deleteLibraryItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      toast({ message: "已删除", variant: "success" });
      navigate("/library", { replace: true });
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
            <Button variant="ghost" size="md" onClick={() => navigate("/library")}>
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
              {TYPE_LABEL[item.type] || item.type}
            </span>
            <span className="text-xs text-fg-subtle font-mono">#{item.id}</span>
            <span className="text-xs text-fg-subtle">·</span>
            <span className="text-xs text-fg-subtle">
              {formatDate(item.createdAt)}
            </span>
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
          {item.tags && item.tags.length > 0 ? (
            <InfoRow
              label="标签"
              value={
                <div className="flex flex-wrap gap-1">
                  {item.tags.map((t) => (
                    <span
                      key={t}
                      className="text-xs px-1.5 py-0.5 rounded bg-bg-sunken text-fg-muted"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              }
            />
          ) : null}
        </div>

        {/* 正文 — 按 type 渲染 */}
        <ContentView item={item} />

        {/* 操作区 — 编辑/删除/返回 (gacode-electron 0.7.2 + 编辑入口) */}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            size="md"
            onClick={() => navigate("/library")}
          >
            返回列表
          </Button>
          <Button
            variant="outline"
            size="md"
            onClick={() => setEditOpen(true)}
          >
            编辑
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
          title="删除这条知识?"
          message="删除后无法恢复。"
          confirmLabel="确认删除"
          confirmVariant="danger"
          loading={deleteMutation.isPending}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => deleteMutation.mutate()}
        />
      ) : null}

      {/* 编辑 Sheet — gacode-electron 0.7.2 */}
      <EditSheet
        open={editOpen && !!item}
        item={item ?? null}
        onClose={() => setEditOpen(false)}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// ContentView — 按 type 渲染正文
// ────────────────────────────────────────────────────────────

function ContentView({ item }: { item: LibraryItem }) {
  // content 字段是 list DTO 不暴露的, detail 才带
  const content = (item as LibraryItem & { content?: string }).content;

  if (item.type === "image" && item.url) {
    return (
      <div className="rounded-md bg-bg-elevated p-3">
        <img
          src={item.url}
          alt={item.title || "image"}
          className="max-w-full max-h-[70vh] mx-auto rounded"
        />
      </div>
    );
  }

  if (content && content.length > 0) {
    return (
      <pre className="rounded-md bg-bg-elevated p-4 text-sm text-fg whitespace-pre-wrap break-words font-mono max-h-[70vh] overflow-y-auto">
        {content}
      </pre>
    );
  }

  if (item.url) {
    return (
      <div className="rounded-md bg-bg-elevated p-4 text-sm text-fg-muted">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand hover:underline break-all"
        >
          {item.url}
        </a>
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

function formatDate(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

const TYPE_LABEL: Record<string, string> = {
  image: "图片",
  doc: "文档",
  link: "链接",
  text: "文本",
};
