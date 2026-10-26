/**
 * routes/DeliveryDetail.tsx — 交付物详情页
 *
 * 1:1 对齐 web `gacode-web/src/app/(main)/deliveries/[id]/page.tsx` (533 行 · 2026-10-26 逐行读).
 *
 * 本批口径 (产品负责人拍板): **web = 唯一事实源**。
 *   · web 有、PC 没有 → 补齐
 *       - 顶部面包屑 (返回 + 刷新) (web:311-329)
 *       - 大图预览 16:9 + 失败占位 (web:332-353)
 *       - 类型 Badge (带图标) + 时间 + 域名 (web:360-369)
 *       - 元信息卡 (类型 / 大小 / 生成提示词 / 无元数据) (web:372-391)
 *       - 文档内嵌预览 DocumentPreview (web:399-406)
 *       - 操作区 5+1 按钮: 打开 / 复制链接(web) / 保存到相册(image) /
 *         下载原文件·导出·重试下载(image|document, 按 downloadStatus) /
 *         跳到源对话 / 删除 (web:409-494)
 *       - 错误态卡片 (重试 + 返回列表) (web:271-299) / 加载态骨架 (web:256-269)
 *       - 删除确认弹窗文案 (web:497-519)
 *   · PC 多出、web 没有 → 删 (服务端端点压根不存在, 点了必然 404)
 *       - 「收藏」按钮 (StarButton → POST /deliverables/:id/star)
 *       - 「分享到对话」按钮 (ShareSheet → POST /deliverables/:id/share)
 *       - 底部「返回列表」按钮 (web 走顶部面包屑返回)
 *       - 元信息卡里的 URL 行 / 标题旁的 #id / 「· AI 生成 / 用户上传」标签
 *       - ContentView 的 embed-html / embed-text / open-with-system 三路分流
 *         (web 详情页没有这层 —— 文档走 DocumentPreview, 图片走大图预览,
 *          web 类型不渲染正文)
 *
 * ⚠️ downloadStatus: web 从 item.downloadStatus 取, 但服务端当前 **不返** 这个字段
 *   (unified-api deliverables.routes.js 的 deliverableDetailDto 无该字段) ⇒
 *   「导出到下载文件夹 / 下载原文件 / 重试下载」三个按钮实际不渲染 (web:446-472
 *   注释: 「缺省 / 未知 status 不渲染, 避免死按钮态」)。PC 端同款逻辑, 同款行为。
 */

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteDeliverable,
  getDeliverable,
  pickDeliverableDownloadName,
  type Deliverable,
} from "../lib/api";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { Card, CardContent } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import {
  ArrowLeftIcon,
  FileTextIcon,
  GlobeIcon,
  ImageIcon,
  TrashIcon,
} from "../components/ui/Glyphs";
import { DocumentPreview } from "../components/deliveries/DocumentPreview";
import {
  ConstructionIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  MessageSquareIcon,
  RefreshCcwIcon,
  RefreshCwIcon,
  SaveIcon,
} from "../components/deliveries/Icons";

// 与安卓 DeliverableEntity.downloadStatus 同步使用 (见 yinian-android
//   DeliverablesFormat.kt:53-63)。服务端目前未返该字段 —— web 端同样就地声明,
//   不污染共享模块 (web:104-107)。
type DownloadStatus = "pending" | "downloading" | "done" | "failed";

const TYPE_LABELS: Record<Deliverable["deliverableType"], string> = {
  image: "图片",
  web: "网站",
  document: "文档",
};

export function DeliveryDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // 删除 AlertDialog 控制 (web:119)
  const [deleteOpen, setDeleteOpen] = useState(false);
  // 图片大图浏览时的 onError 占位 (web:123)
  const [imageErrored, setImageErrored] = useState(false);

  const { data: item, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["deliverable", id],
    queryFn: () => getDeliverable(id),
    enabled: !!id,
    retry: 1,
  });

  // 后端 response 字段 —— 顶部刷新按钮 + 状态分流下载按钮都用它 (web:135-137)
  const downloadStatus: DownloadStatus | undefined = (
    item as unknown as { downloadStatus?: DownloadStatus } | undefined
  )?.downloadStatus;

  // ────── 删除 (web:152-169) ──────
  const deleteMutation = useMutation({
    mutationFn: () => deleteDeliverable(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deliverables"] });
      queryClient.removeQueries({ queryKey: ["deliverable", id] });
      toast({ message: "已删除", variant: "success" });
      navigate("/deliveries", { replace: true });
    },
    onError: (err) => {
      // web 是两段式 toast (title + description) (web:162-168)
      toast({
        title: "删除失败",
        description: String((err as Error)?.message || err),
        variant: "danger",
      });
    },
  });

  // ────── 操作实现 (web:174-251) ──────
  const openUrl = () => {
    if (!item?.url) {
      toast({ message: "无链接可打开", variant: "default" });
      return;
    }
    // web 用 window.open(url, "_blank", "noopener,noreferrer");
    // Electron 主进程 setWindowOpenHandler (electron/main.ts:234-240) 把 http(s)
    // 交给系统默认浏览器 —— 行为跟 web 的新标签一致。
    window.open(item.url, "_blank", "noopener,noreferrer");
  };

  const copyLink = async () => {
    if (!item?.url) {
      toast({ message: "该交付物没有链接", variant: "default" });
      return;
    }
    try {
      await navigator.clipboard.writeText(item.url);
      toast({ message: "已复制链接", variant: "success" });
    } catch {
      toast({ message: "复制失败", variant: "danger" });
    }
  };

  const downloadBlob = async () => {
    if (!item?.url) {
      toast({ message: "无文件可下载", variant: "default" });
      return;
    }
    try {
      const res = await fetch(item.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = pickDeliverableDownloadName(item, "deliverable");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      // web 是两段式 toast (title + description) (web:212-217)
      toast({
        title: "下载失败",
        description: String((err as Error)?.message || err),
        variant: "danger",
      });
    }
  };

  const saveImage = () => {
    if (!item?.url) {
      toast({ message: "无图片可保存", variant: "default" });
      return;
    }
    // 浏览器端没"相册"概念, 直接 download + mime 推断 = 跨浏览器通用回退
    // (跟安卓 rememberMediaSaver 行为对齐, 浏览器无相册权限系统) (web:221-243)
    const ext = item.mimeType?.startsWith("image/png")
      ? ".png"
      : item.mimeType?.startsWith("image/webp")
        ? ".webp"
        : item.mimeType?.startsWith("image/gif")
          ? ".gif"
          : ".jpg";
    const a = document.createElement("a");
    a.href = item.url;
    a.download = (item.title || "image") + ext;
    a.rel = "noopener noreferrer";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const openSession = () => {
    if (!item?.sessionId) {
      toast({ message: "无法定位源对话 (sessionId 缺失)", variant: "default" });
      return;
    }
    navigate(`/chat/${item.sessionId}`);
  };

  // ────── 加载态 (web:256-269) ──────
  if (isLoading) {
    return (
      <div className="px-4 lg:px-8 max-w-2xl mx-auto w-full py-6 space-y-4">
        <div
          className="w-full rounded-md bg-muted animate-pulse"
          style={{ aspectRatio: "16 / 9" }}
        />
        <div className="h-6 w-2/3 bg-muted rounded animate-pulse" />
        <div className="h-4 w-1/3 bg-muted rounded animate-pulse" />
        <div className="space-y-2 pt-4">
          <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
          <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
          <div className="h-10 w-full rounded-md bg-muted animate-pulse" />
        </div>
      </div>
    );
  }

  // ────── 错误 / 不存在 (web:271-299) ──────
  if (isError || !item) {
    return (
      <div className="px-4 lg:px-8 max-w-2xl mx-auto w-full py-10">
        <Card>
          <CardContent className="p-10 text-center text-fg-muted">
            <ConstructionIcon className="w-12 h-12 mx-auto text-fg-muted mb-4" />
            <div className="text-base font-medium mb-1 text-fg">
              {isError ? "加载失败" : "未找到该交付物"}
            </div>
            <div className="text-sm mb-4">
              {isError
                ? String((error as Error)?.message || error)
                : "可能已被删除, 或归属其他用户。"}
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="md" onClick={() => refetch()}>
                <RefreshCwIcon className="w-4 h-4 mr-2" />
                重试
              </Button>
              <Button variant="outline" size="md" onClick={() => navigate("/deliveries")}>
                <ArrowLeftIcon className="w-4 h-4 mr-2" />
                返回列表
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isImage = item.deliverableType === "image";
  const isWeb = item.deliverableType === "web";
  const isDocument = item.deliverableType === "document";
  const TypeIcon =
    item.deliverableType === "image"
      ? ImageIcon
      : item.deliverableType === "web"
        ? GlobeIcon
        : FileTextIcon;
  const domain = deriveDomain(item.url);
  const timeStr = formatDateTime(item.createdAt);
  const sizeStr = formatBytes(item.sizeBytes);

  return (
    <div className="px-4 lg:px-8 max-w-2xl mx-auto w-full py-6">
      {/* 顶部面包屑: 返回 + 刷新 (web:311-329) */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => navigate("/deliveries")}
          className="inline-flex items-center text-xs text-fg-muted hover:text-fg"
        >
          <ArrowLeftIcon className="w-4 h-4 mr-1" />
          返回
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          aria-label="刷新"
          className="!w-9 !h-9 !p-0 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors duration-150"
        >
          <RefreshCcwIcon className={isFetching ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
        </Button>
      </div>

      {/* === 大图预览 (仅 image 类型) (web:332-353) === */}
      {isImage && item.url ? (
        <div className="relative w-full bg-bg-sunken rounded-md overflow-hidden mb-4 border border-border">
          <div className="w-full" style={{ aspectRatio: "16 / 9" }}>
            {!imageErrored ? (
              <img
                src={item.url}
                alt={item.title || item.prompt || "image"}
                className="w-full h-full object-contain"
                onError={() => setImageErrored(true)}
              />
            ) : (
              // 失败态只给占位 icon (web:343-350)
              <div className="w-full h-full flex flex-col items-center justify-center text-fg-muted gap-2 p-4">
                <ImageIcon className="w-10 h-10" />
                <div className="text-sm">图片加载失败</div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* === 元信息区 (web:356-370) === */}
      <div className="mb-4">
        <h1 className="text-lg font-semibold text-fg leading-snug break-words">
          {item.title || "(无标题)"}
        </h1>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Badge variant="secondary" className="!text-[10px] !px-1.5 gap-1">
            <TypeIcon className="w-3 h-3" />
            {TYPE_LABELS[item.deliverableType]}
          </Badge>
          <span className="text-xs text-fg-muted font-mono">{timeStr}</span>
          {domain ? (
            <span className="text-xs text-fg-muted truncate max-w-[16rem]">{domain}</span>
          ) : null}
        </div>
      </div>

      {/* prompt / size / mime 元数据 (web:372-391) */}
      <Card className="mb-4">
        <CardContent className="!p-3 space-y-2 text-sm">
          {item.mimeType ? <MetaRow label="类型" value={item.mimeType} /> : null}
          {sizeStr ? <MetaRow label="大小" value={sizeStr} /> : null}
          {item.prompt ? (
            <div>
              <div className="text-xs text-fg-muted mb-1">生成提示词</div>
              <div className="text-sm text-fg break-words whitespace-pre-wrap">
                {item.prompt}
              </div>
            </div>
          ) : null}
          {!item.prompt && !item.mimeType && !sizeStr ? (
            <div className="text-fg-muted text-xs">无元数据</div>
          ) : null}
        </CardContent>
      </Card>

      {/* === 文档内嵌预览 (仅 document 类型) (web:399-406) === */}
      {isDocument && item.url ? (
        <DocumentPreview
          fileId={item.url}
          mimeType={item.mimeType}
          url={item.url}
          title={item.title || "document"}
        />
      ) : null}

      {/* === 操作区 (web:409-494) === */}
      <div className="space-y-2">
        {/* 主操作 — 打开 */}
        <Button className="w-full" size="md" onClick={openUrl} disabled={!item.url}>
          <ExternalLinkIcon className="w-4 h-4 mr-2" />
          {isWeb ? "在浏览器中打开" : isImage ? "查看原图" : "打开文档"}
        </Button>

        {/* web 专属: 复制链接 */}
        {isWeb ? (
          <Button variant="outline" className="w-full" size="md" onClick={copyLink} disabled={!item.url}>
            <CopyIcon className="w-4 h-4 mr-2" />
            复制链接
          </Button>
        ) : null}

        {/* image 专属: 保存到相册 (浏览器下载) */}
        {isImage ? (
          <Button variant="outline" className="w-full" size="md" onClick={saveImage} disabled={!item.url}>
            <SaveIcon className="w-4 h-4 mr-2" />
            保存到相册
          </Button>
        ) : null}

        {/* 下载 / 导出: 按 downloadStatus 互斥显示 (web:446-472)
            - pending / failed: "下载原文件" 或 "重试下载" (icon = RefreshCcw)
            - done:           "导出到下载文件夹" (icon = Download)
            缺省 / 未知 status 不渲染, 避免死按钮态。 */}
        {(isImage || isDocument) && downloadStatus === "done" ? (
          <Button variant="outline" className="w-full" size="md" onClick={downloadBlob} disabled={!item.url}>
            <DownloadIcon className="w-4 h-4 mr-2" />
            导出到下载文件夹
          </Button>
        ) : null}
        {(isImage || isDocument) &&
        (downloadStatus === "pending" || downloadStatus === "failed") ? (
          <Button variant="outline" className="w-full" size="md" onClick={downloadBlob} disabled={!item.url}>
            <RefreshCcwIcon className="w-4 h-4 mr-2" />
            {downloadStatus === "failed" ? "重试下载" : "下载原文件"}
          </Button>
        ) : null}

        {/* 跳源对话 */}
        <Button
          variant="outline"
          className="w-full"
          size="md"
          onClick={openSession}
          disabled={!item.sessionId}
        >
          <MessageSquareIcon className="w-4 h-4 mr-2" />
          跳到源对话
        </Button>

        {/* 删除 — 底部红色, 强调破坏性 (web:485-493)
            ⚠️ PC Button outline base 带 hover:bg-accent / hover:text-accent-foreground,
               而 PC tailwind.config.ts 的颜色顺序里 accent 在 danger 之后 ⇒
               accent 会赢 → 需 ! 前缀强制覆盖。 */}
        <Button
          variant="outline"
          className="w-full text-danger border-danger/40 hover:!bg-danger/10 hover:!text-danger"
          size="md"
          onClick={() => setDeleteOpen(true)}
        >
          <TrashIcon className="w-4 h-4 mr-2" />
          删除
        </Button>
      </div>

      {/* 删除二次确认 (web:497-521) */}
      {deleteOpen ? (
        <ConfirmDialog
          title="确定删除该交付物？"
          message={`将从你的交付中心移除${
            item.title ? `“${item.title}”` : "这条记录"
          }。此操作不可撤销。`}
          confirmLabel={deleteMutation.isPending ? "删除中..." : "我确定"}
          cancelLabel="取消"
          confirmVariant="danger"
          loading={deleteMutation.isPending}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={() => deleteMutation.mutate()}
        />
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// MetaRow — web:526-533
// ────────────────────────────────────────────────────────────
function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-xs text-fg-muted shrink-0 w-12">{label}</span>
      <span className="text-sm text-fg break-all">{value}</span>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

/** 字节数格式化 — web:73-81 */
function formatBytes(size?: number | string): string {
  if (size === undefined || size === null || size === "") return "";
  const n = typeof size === "string" ? Number(size) : Number(size);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 从 url 派生域名 — web:83-90 */
function deriveDomain(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** 时间格式 — web 的 format(d, "yyyy-MM-dd HH:mm", { locale: zhCN }) 等价实现 (web:306) */
function formatDateTime(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}`;
}
