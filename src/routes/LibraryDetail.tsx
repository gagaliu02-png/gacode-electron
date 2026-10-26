/**
 * routes/LibraryDetail.tsx — 知识库详情 (gacode-electron 0.7.5)
 *
 * 数据: useQuery(["library-item", id], () => getLibraryItem(id, true))
 * 端点: GET /yinian/library/:id?withContent=true — server 返 LibraryItem,
 * withContent=true 时额外带 content 字段.
 *
 * 功能 (本批 §3.5 五项 — 3 P1 + 2 P2):
 *   - library-id-6 (P1)  编辑入口 — 复用 Library 0.7.4 的 EditSheet (已有)
 *   - library-id-7 (P1)  「在对话中引用此条」 — createChat + 写 sessionStorage
 *                          跨页携带 libraryItem 引用, navigate /chat/:id
 *                          (跟 Home.handleSubmit 同路径)
 *   - library-id-8 (P1)  文件详情走 DocumentViewerActivity —
 *                          text 类型 → 走自研 markdown 管线 (LibraryMarkdownTableCard);
 *                          image 类型 → <img>;
 *                          link / doc 类型 → 「打开」走 openWithSystem IPC
 *                          (跟 DeliveryDetail.tsx 同样的 IPC 桥, shell.openPath /
 *                          shell.openExternal 走系统默认应用)
 *   - library-id-9 (P2)  Markdown 内容单独美化 (LibraryMarkdownTableCard)
 *   - library-id-10 (P2) 同步状态显示 (SyncStatusBadge — 已同步 / 同步中 / 失败)
 *
 * 复用 (Library 0.7.4 已就绪):
 *   - EditSheet (P0 library-11)
 *   - 0.7.2 已实现: 头部 / 元信息 / 类型 badge / id / createdAt
 *   - 0.7.2 已实现: ConfirmDialog 删除 + 二次确认
 *
 * 不做: gagaOS "library-9 / 11 / 12 / 13 / 14" 已 yes — 这五个在 0.7.4 Library
 * 列表页已实现, 不在本批.
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createChat,
  deleteLibraryItem,
  getLibraryItem,
  type LibraryItem,
} from "../lib/api";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EditSheet } from "../components/library/EditSheet";
import { LibraryMarkdownTableCard } from "../components/library/LibraryMarkdownTableCard";
import { SyncStatusBadge } from "../components/library/SyncStatusBadge";

// 跨页携带 library 引用 → ChatDetail 消费 (跟 Home.handleSubmit 同套 sessionStorage).
// ChatDetail (worker P1-A) 会读这个 key 把 library item 拼成首条消息附件.
const LIBRARY_REF_SESSION_KEY = "gacode:home:library-refs";

interface LibraryRef {
  itemId: string;
  title: string;
  type: "image" | "doc" | "link" | "text";
}

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
  const [editOpen, setEditOpen] = useState(false);
  // 引用到对话 (library-id-7): 在弹 ConfirmDialog 之前先 navigate, 跨页携带.
  const [sharePending, setSharePending] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => deleteLibraryItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      toast({ message: "已删除", variant: "default" });
      navigate("/library", { replace: true });
    },
    onError: (err) => {
      toast({
        message: `删除失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });

  // library-id-7: 在对话中引用此条 / 分享到对话
  // - createChat 拿新 chat id
  // - 写 sessionStorage 跨页携带 library refs (跟 Home.handleSubmit 同路径)
  // - navigate /chat/:id; ChatDetail mount 时读 key 把 item 拼成 firstMessage
  const shareMutation = useMutation({
    mutationFn: async () => createChat({}),
    onSuccess: (chat) => {
      if (!item) return;
      try {
        const refs: LibraryRef[] = [
          {
            itemId: item.id,
            title: item.title || "未命名",
            type: item.type,
          },
        ];
        sessionStorage.setItem(
          LIBRARY_REF_SESSION_KEY,
          JSON.stringify(refs),
        );
        // 同时给 Home 的 firstMessage 机制一份提示文本 — ChatDetail 看到后会拼成首条消息
        sessionStorage.setItem(
          "gacode:home:firstMessage",
          `请帮我看看这条知识库内容: ${item.title || item.id}`,
        );
      } catch (err) {
        console.warn("[gacode-library-detail] sessionStorage write failed", err);
      }
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      navigate(`/chat/${chat.id}`);
    },
    onError: (err) => {
      toast({
        message: `创建对话失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
    onSettled: () => {
      setSharePending(false);
    },
  });

  // library-id-8: 文件走系统默认应用 — 走现有 IPC `openWithSystem`
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
            <Button variant="ghost" size="md" onClick={() => navigate("/library")}>
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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 rounded bg-bg-elevated text-fg-muted">
              {TYPE_LABEL[item.type] || TYPE_LABEL_OTHER}
            </span>
            <span className="text-xs text-fg-subtle font-mono">#{item.id}</span>
            <span className="text-xs text-fg-subtle">·</span>
            <span className="text-xs text-fg-subtle">
              {formatDate(item.createdAt)}
            </span>
            {/* library-id-10: 同步状态徽章 */}
            <SyncStatusBadge status={deriveSyncStatus(item)} />
          </div>
          <h1 className="text-2xl font-semibold text-fg break-words">{item.title || "未命名"}</h1>
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

        {/* 正文 — 按 type 渲染 (library-id-8/9) */}
        <ContentView item={item} onOpenWithSystem={openWithSystem} />

        {/* 操作区 — 编辑 / 引用到对话 / 删除 / 返回 (library-id-6 / library-id-7) */}
        <div className="flex items-center justify-end gap-2 pt-2 flex-wrap">
          <Button
            variant="ghost"
            size="md"
            onClick={() => navigate("/library")}
          >
            返回列表
          </Button>
          {/* library-id-7: 在对话中引用此条 */}
          <Button
            variant="outline"
            size="md"
            loading={shareMutation.isPending || sharePending}
            onClick={() => {
              setSharePending(true);
              shareMutation.mutate();
            }}
          >
            在对话中引用
          </Button>
          {/* library-id-6: 编辑 */}
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

      {/* 编辑 Sheet — library-id-6 复用 Library 0.7.4 的 EditSheet */}
      <EditSheet
        open={editOpen && !!item}
        item={item ?? null}
        onClose={() => setEditOpen(false)}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// ContentView — 按 type 渲染正文 (library-id-8/9)
//
//   image: 内嵌 <img>
//   text:  markdown → LibraryMarkdownTableCard (library-id-9)
//   doc:   PDF / DOCX / XLSX / 其它 binary → 「打开」走 openWithSystem IPC
//   link:  「打开」走系统默认浏览器
// ────────────────────────────────────────────────────────────

function ContentView({
  item,
  onOpenWithSystem,
}: {
  item: LibraryItem;
  onOpenWithSystem: (url: string) => void;
}) {
  const content = (item as LibraryItem & { content?: string }).content;

  // image: 内嵌显示
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

  // text + 有 content → markdown 渲染 (library-id-9)
  if (item.type === "text" && content && content.length > 0) {
    return <LibraryMarkdownTableCard content={content} />;
  }

  // link / doc → 文件走系统默认应用 (library-id-8)
  // LibraryItem 没有 mimeType 字段, 用 type 推断:
  //   - type=link  → 浏览器 (外链 URL)
  //   - type=doc   → 系统默认应用 (PDF / DOCX / XLSX / PPTX 等)
  if (item.type === "link" || item.type === "doc") {
    if (!item.url) {
      return (
        <div className="rounded-md bg-bg-elevated p-4 text-sm text-fg-muted text-center">
          无 URL
        </div>
      );
    }
    const fileLabel = item.type === "link" ? "网页" : "文件";
    return (
      <div className="rounded-md bg-bg-elevated p-6 text-center">
        <p className="text-sm text-fg-muted mb-2">
          {item.type === "link" ? "外部网页链接" : "文档附件"}
        </p>
        <p className="text-xs text-fg-subtle mb-4">
          {item.type === "link"
            ? "点击「打开」用系统默认浏览器查看"
            : "点击「打开」用系统默认应用查看 (PDF / Office / 图片查看器 / 视频播放器)"}
        </p>
        <p className="text-xs text-fg-subtle mb-4 break-all">{item.url}</p>
        <Button
          variant="default"
          size="md"
          onClick={() => onOpenWithSystem(item.url!)}
        >
          打开{fileLabel}
        </Button>
      </div>
    );
  }

  // text + 无 content: 兜底, 给提示
  if (item.type === "text") {
    return (
      <div className="rounded-md bg-bg-elevated p-4 text-sm text-fg-muted text-center">
        无内容
      </div>
    );
  }

  // 兜底 (兜底渲染跟原来保持, 给 url 提示)
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
// library-id-10: 同步状态推断
// server 没有 syncStatus 字段, 客户端从 item 本身推:
//   - 有 url 或 content → "已同步"
//   - 没有 url 且没有 content → "同步中" (上传未完成? 或离线?)
//   - 服务端报错 → 父层 error 路径, 这里不会到
// ────────────────────────────────────────────────────────────

function deriveSyncStatus(item: LibraryItem & { content?: string }): "synced" | "syncing" {
  const content = (item as LibraryItem & { content?: string }).content;
  if (item.url || (content && content.length > 0)) return "synced";
  return "syncing";
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
const TYPE_LABEL_OTHER = "其他";