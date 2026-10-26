/**
 * routes/LibraryDetail.tsx — 知识库详情 (PC 端 1:1 对齐 web)
 *
 * 事实源: gacode-web/src/app/(main)/library/[id]/page.tsx
 *   —— web 有什么 PC 必须有什么; PC 多出 web 没有的直接删.
 *
 * 数据: useQuery(["library-item", id], () => getLibraryItem(id, true))
 * 端点: GET /yinian/memories/:id (B-21 · 2026-10-26 改成与 web 详情页同端点 —
 *   web: library/[id]/page.tsx:118 → library-api.ts:211-213 → api.ts:1223-1225;
 *   server 注册行: unified-api/src/modules/yinian/yinian.routes.js:385)
 *   该端点出参是 snake_case, snake→camel 映射在 src/lib/api.ts 的
 *   mapMemoryAtomToLibraryItem 里 (PC 侧映射, 不依赖 web 的 library-api.ts).
 *
 * 本批对齐清单 (web 行号 → 本文件):
 *   - 顶栏 sticky + 返回 + 类型图标/标题 + 编辑/删除      web:263-298
 *   - 编辑态 = 页内切换 (编辑中隐藏顶栏编辑/删除)           web:277 / 317-362
 *   - 类型 Badge + 相对时间 (date-fns zhCN)                web:303-310
 *   - 图片 inline preview                                  web:366-372
 *   - 链接 / 附件区 (ExternalLink)                         web:376-391
 *   - 标签列表 (Badge + 「无标签」空态)                    web:394-412
 *   - 正文容器 (rounded-md border bg-bg-sunken p-3)        web:416-423
 *   - 正文容器补 flex-1 / w-full / overflow-y-auto          web:301
 *   - 加载态 (顶栏 + 返回 + 「加载中...」 + Loader2)         web:214-235
 *   - 不存在态 (顶栏 + 「详情」 + 居中中性文案)             web:237-258
 *   - 删除二次确认 (AlertDialog 形态) + 删除 toast           web:427-450 / 200
 *
 * ⚠️ B-13 (真 bug, 已修): server 的 `type` 值域恒为 image|doc|link
 *    (DB modality 映射, 'text' → 'link'), 所以 `item.type === "text"` 是死条件
 *    ⇒ 纯文本正文永远不渲染. 现改成「content 存在即渲染」(跟 web:416 同口径).
 *    证据: unified-api/src/modules/yinian/library.routes.js:67-88 (MODALITY_TO_WEB_TYPE)
 *          + :119-124 (libraryItemToDto) + test/library.routes.test.js:212.
 *
 * 删掉的 PC 独有内容 (按「PC 多出 web 没有的直接删」口径):
 *   - 「在对话中引用此条」按钮 (library-id-7) —— web 知识库页**完全没有**引用能力
 *     (grep web library/page.tsx: 无 引用 / createChat / sessionStorage).
 *   - 「返回列表」按钮 —— web 用顶栏返回箭头代替.
 *   - 元信息 InfoRow 面板 (URL / 标签 两行) —— web 是「链接/附件区」+「标签区」两块.
 *   - 同步状态徽章 (library-id-10) —— web 详情页没有.
 *   - 「打开网页 / 打开文件」系统应用 IPC (library-id-8) —— web 详情页只给外链.
 *   - 表格专用渲染卡 —— 内容区改成 web 的容器形态, 直接用 lib/markdown.
 *
 * Tailwind: PC (v3.4.19) 与 web (v4 @theme) 的颜色/圆角/字号 token **完全同值**
 *   (web globals.css:121-175 ↔ PC tailwind.config.ts:140-173) ⇒ class 名可逐字照抄.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  deleteLibraryItem,
  getLibraryItem,
  updateLibraryItem,
  type LibraryItem,
} from "../lib/api";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Input } from "../components/ui/Input";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { ErrorBoundary } from "../components/ui/ErrorBoundary";
import { Markdown } from "../lib/markdown";
import {
  ArrowLeftIcon,
  CloseIcon,
  ExternalLinkIcon,
  FileTextIcon,
  ImageIcon,
  LinkTypeIcon,
  LoaderCircleIcon,
  PencilIcon,
  SaveIcon,
  TagIcon,
  TrashIcon,
} from "../components/ui/Glyphs";

export function LibraryDetail() {
  // B-22 (2026-10-26): 详情页包 ErrorBoundary — 对齐 web
  //   library/[id]/page.tsx:86-92:
  //     <ErrorBoundary title="详情加载失败" description="条目可能已被删除, 返回列表重试">
  //       <LibraryDetailPageInner />
  //     </ErrorBoundary>
  return (
    <ErrorBoundary title="详情加载失败" description="条目可能已被删除, 返回列表重试">
      <LibraryDetailInner />
    </ErrorBoundary>
  );
}

function LibraryDetailInner() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: item, isLoading, error } = useQuery({
    queryKey: ["library-item", id],
    queryFn: () => getLibraryItem(id, true),
    enabled: Boolean(id),
  });

  // ── 编辑态: 页内切换 (web:134-137) ──
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editTagsRaw, setEditTagsRaw] = useState("");

  // ── 删除二次确认 (web:139) ──
  const [deleteOpen, setDeleteOpen] = useState(false);

  // 进入编辑态时用最新 item 初始化 form (web:143-148)
  useEffect(() => {
    if (editing && item) {
      setEditTitle(item.title || "");
      setEditTagsRaw((item.tags || []).join(", "));
    }
  }, [editing, item]);

  // 正文 — 详情端点 GET /yinian/memories/:id 一定带 content 字段
  //   (跟 web 同端点, web library/[id]/page.tsx:118)。
  // ⚠️ B-13: 判定用「content 存在」, **不用** item.type === "text"
  //    (server 的 type 值域恒为 image|doc|link ⇒ "text" 是死条件).
  const content = item?.content;

  // 相对时间 (web:150-161) — date-fns + zhCN (PC 已装 date-fns ^4.4.0)
  const time = useMemo(() => {
    if (!item?.createdAt) return "";
    try {
      const d = new Date(item.createdAt);
      if (Number.isNaN(d.getTime())) return "";
      return formatDistanceToNow(d, { addSuffix: true, locale: zhCN });
    } catch {
      return "";
    }
  }, [item?.createdAt]);

  // ── 保存编辑 (web:164-192) ──
  const saveMutation = useMutation({
    mutationFn: async () => {
      const title = editTitle.trim();
      const tags = editTagsRaw
        .split(/[,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return updateLibraryItem(id, { title, tags });
    },
    onSuccess: () => {
      toast({ title: "已更新", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["library-item", id] });
      queryClient.invalidateQueries({ queryKey: ["library"] });
      setEditing(false);
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

  const handleSaveEdit = () => {
    if (saveMutation.isPending) return;
    if (!editTitle.trim()) {
      toast({ title: "标题不能为空", variant: "warning" });
      return;
    }
    saveMutation.mutate();
  };

  // ── 删除 (web:194-211) ──
  const deleteMutation = useMutation({
    mutationFn: () => deleteLibraryItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      toast({ title: "已删除", variant: "default" });
      navigate("/library", { replace: true });
    },
    onError: (err) => {
      toast({
        title: "删除失败",
        description:
          err instanceof Error ? err.message : "请稍后重试",
        variant: "danger",
      });
    },
  });

  // ── 加载态 (web:214-235) ──
  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <DetailTopBar
          onBack={() => navigate(-1)}
          label={<span className="text-sm text-fg-muted">加载中...</span>}
        />
        <div className="flex-1 flex items-center justify-center">
          <LoaderCircleIcon size={24} className="w-6 h-6 animate-spin text-fg-muted" />
        </div>
      </div>
    );
  }

  // ── 不存在 / 出错态 (web:237-258) ──
  if (error || !item) {
    return (
      <div className="flex flex-col h-full">
        <DetailTopBar
          onBack={() => navigate(-1)}
          label={<span className="text-base font-medium">详情</span>}
        />
        <div className="flex-1 flex items-center justify-center text-fg-muted text-sm">
          条目不存在或已被删除
        </div>
      </div>
    );
  }

  const saving = saveMutation.isPending;

  return (
    <div className="flex flex-col h-full">
      {/* 顶栏: 返回 + 标题 + 编辑/删除 (web:263-298) */}
      <DetailTopBar
        onBack={() => navigate(-1)}
        label={
          <div className="flex-1 min-w-0 flex items-center gap-2 text-base font-medium truncate">
            {typeIcon(item.type)}
            <span className="truncate">{item.title || "未命名"}</span>
          </div>
        }
        actions={
          !editing ? (
            <>
              <button
                type="button"
                aria-label="编辑"
                onClick={() => setEditing(true)}
                className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors inline-flex items-center justify-center"
              >
                <PencilIcon className="w-5 h-5" size={20} strokeWidth={2} />
              </button>
              <button
                type="button"
                aria-label="删除"
                onClick={() => setDeleteOpen(true)}
                className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors inline-flex items-center justify-center"
              >
                <TrashIcon className="w-5 h-5" size={20} />
              </button>
            </>
          ) : null
        }
      />

      {/* 正文 (web:301) */}
      <div className="flex-1 w-full px-4 lg:px-8 py-6 max-w-3xl mx-auto space-y-5 overflow-y-auto">
        {/* 类型 + 标题 (非编辑模式, web:303-315) */}
        {!editing && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{typeLabel(item.type)}</Badge>
              <span className="text-xs text-fg-muted">
                {time || item.createdAt}
              </span>
            </div>
            <div className="text-2xl font-semibold break-words">
              {item.title || "未命名"}
            </div>
          </div>
        )}

        {/* 编辑模式: 标题 + tags 输入 (web:318-362) */}
        {editing && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-fg-muted mb-1 block">标题</label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="标题"
                autoFocus
                maxLength={200}
              />
            </div>
            <div>
              <label className="text-xs text-fg-muted mb-1 block">
                标签{" "}
                <span className="text-fg-subtle">(用逗号或空格分隔)</span>
              </label>
              <Input
                value={editTagsRaw}
                onChange={(e) => setEditTagsRaw(e.target.value)}
                placeholder="例如: 设计, 灵感, 2026"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(false)}
                disabled={saving}
              >
                <CloseIcon className="w-4 h-4 mr-1" size={16} />
                取消
              </Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                {saving ? (
                  <LoaderCircleIcon size={16} className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <SaveIcon className="w-4 h-4 mr-1" />
                    保存
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {/* 图片 inline preview (web:365-373) */}
        {!editing && item.type === "image" && item.url && (
          <div className="rounded-lg overflow-hidden border border-border bg-bg-sunken">
            <img
              src={item.url}
              alt={item.title || "未命名"}
              className="block w-full max-h-[60vh] object-contain bg-black"
            />
          </div>
        )}

        {/* 链接 (link 类型) 或外部链接 (image/doc 有 raw_ref 时) — web:376-391 */}
        {!editing && item.url && (
          <div className="space-y-1">
            <div className="text-xs text-fg-muted">
              {item.type === "link" ? "链接" : "附件"}
            </div>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-brand hover:underline break-all"
            >
              <span className="break-all">{item.url}</span>
              <ExternalLinkIcon size={14} className="w-3.5 h-3.5 shrink-0" />
            </a>
          </div>
        )}

        {/* 标签列表 (非编辑模式) — web:394-412 */}
        {!editing && (
          <div className="space-y-2">
            <div className="text-xs text-fg-muted flex items-center gap-1">
              <TagIcon size={14} className="w-3.5 h-3.5" />
              标签
            </div>
            {item.tags && item.tags.length > 0 ? (
              <div className="flex gap-1 flex-wrap">
                {item.tags.map((t) => (
                  <Badge key={t} variant="secondary">
                    #{t}
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="text-sm text-fg-subtle">无标签</div>
            )}
          </div>
        )}

        {/* 文本正文 — Markdown 渲染 (web:414-423)
            ⚠️ B-13: 判定是「content 存在」, 不是 item.type === "text"
            (server type 值域恒为 image|doc|link ⇒ "text" 永远不成立). */}
        {!editing && content && (
          <div className="space-y-2">
            <div className="text-xs text-fg-muted">内容</div>
            <div className="rounded-md border border-border bg-bg-sunken p-3 text-sm">
              {/* web:420 <Markdown>{item.content}</Markdown>
                  ⇒ 正文 14px (PC 的 chat 场景 = 14px, 跟 web 的 text-sm 同值)
                     + 围栏切代码块卡片 (web 的 CodeBlock = 语言徽章 + 复制按钮). */}
              <Markdown cutCodeBlocks>{content}</Markdown>
            </div>
          </div>
        )}
      </div>

      {/* 删除二次确认 (web:427-450)
          pending 形态 = spinner-only (web:442-446 `deleting ? <Loader2/> : "删除"`) */}
      {deleteOpen ? (
        <ConfirmDialog
          title="确定要删除这条吗?"
          message={`「${item.title || "未命名"}」 将从知识库移除，此操作不可撤销。`}
          confirmLabel="删除"
          confirmVariant="danger"
          loading={deleteMutation.isPending}
          loadingStyle="spinner-only"
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => deleteMutation.mutate()}
        />
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// DetailTopBar — 顶栏 (web:217-229 / 240-252 / 263-298)
//   sticky 顶栏 + 返回按钮 + 标题/标签 + 右侧操作
// ────────────────────────────────────────────────────────────

function DetailTopBar({
  onBack,
  label,
  actions,
}: {
  onBack: () => void;
  label: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 bg-bg-base border-b border-border">
      <div className="px-4 lg:px-8 max-w-3xl mx-auto w-full h-14 flex items-center gap-2">
        <button
          type="button"
          aria-label="返回"
          onClick={onBack}
          className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors inline-flex items-center justify-center"
        >
          <ArrowLeftIcon className="w-5 h-5" size={20} strokeWidth={2} />
        </button>
        {label}
        {actions}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 类型图标 / 类型文案 (web:57-84)
// ────────────────────────────────────────────────────────────

function typeIcon(type: LibraryItem["type"]) {
  switch (type) {
    case "image":
      return <ImageIcon className="w-5 h-5 text-brand-cyan" size={20} />;
    case "doc":
      return <FileTextIcon className="w-5 h-5 text-brand-yellow" size={20} />;
    case "link":
    case "text":
      return <LinkTypeIcon className="w-5 h-5 text-brand-green" size={20} strokeWidth={2} />;
    default:
      return <FileTextIcon className="w-5 h-5 text-fg-muted" size={20} />;
  }
}

function typeLabel(type: LibraryItem["type"]): string {
  switch (type) {
    case "image":
      return "图片";
    case "doc":
      return "文档";
    case "link":
      return "链接";
    case "text":
      return "文本";
    default:
      return "其他";
  }
}

// ────────────────────────────────────────────────────────────
// 内联 svg —— 已全部收编进 src/components/ui/Glyphs.tsx (2026-10-26)
//   loader-2 → LoaderCircleIcon / save → SaveIcon /
//   external-link → ExternalLinkIcon / tag → TagIcon
//   (path 与共享版逐字相同; 调用处按原 className 显式传 size)
// ────────────────────────────────────────────────────────────
