/**
 * components/chat/RichEventBubble.tsx — 阶段 2 工具 / 富事件小卡片
 *
 * 每个 rich_event (tool_start / file / image / web_preview / approval_request …)
 * 渲染成一个小卡片: 工具名 + 简述 + 参数. 只读不可交互 (审批流阶段 N 再补).
 *
 * 跟 gacode-web/src/components/chat/RichEventBubble.tsx (lines 1-200) 对齐
 * 行为, 但**不照搬代码**(纯自写). 协议参考 gaclaw SSE 数据格式:
 *   { type: string, ...其他 props }
 * 已知 type:
 *   - "tool_start"     { tool, args?, title? }
 *   - "file"           { name, url?, mime_type?, size_bytes? }
 *   - "image"          { url, name? }
 *   - "web_preview"    { url, title?, snippet? }
 *   - "approval_request" { tool, title, detail, riskLevel, id }
 *   - "thinking"       { text }
 */

import type { ReactNode } from "react";

export interface RichEvent {
  type: string;
  [k: string]: unknown;
}

interface Props {
  event: RichEvent;
}

export function RichEventBubble({ event }: Props) {
  switch (event.type) {
    case "tool_start":
      return <ToolStartCard event={event} />;
    case "file":
      return <FileCard event={event} />;
    case "image":
      return <ImageCard event={event} />;
    case "web_preview":
      return <WebPreviewCard event={event} />;
    case "approval_request":
      return <ApprovalRequestCard event={event} />;
    case "thinking":
      return <ThinkingChip text={String(event.text ?? "")} />;
    default:
      // unknown type → 显示 type + JSON 字面, 不抛错
      return (
        <div className="text-xs font-mono text-fg-muted border border-border rounded-md px-3 py-2 my-1 break-words">
          {event.type} · {shortObj(event)}
        </div>
      );
  }
}

// ─────────── sub-cards ───────────

function ToolStartCard({ event }: { event: RichEvent }) {
  const tool = String(event.tool ?? event.name ?? "tool");
  const title = event.title ? String(event.title) : null;
  return (
    <div className="my-1 border border-border rounded-md bg-bg-sunken/60 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <ToolIcon />
        <span className="font-mono text-fg">{tool}</span>
        {title && <span className="text-fg-muted truncate">{title}</span>}
      </div>
      {"args" in event ? (
        <pre className="mt-1.5 font-mono text-[11px] text-fg-muted whitespace-pre-wrap break-words leading-relaxed">
          {shortArgs(String(event.args ?? ""))}
        </pre>
      ) : null}
    </div>
  );
}

function FileCard({ event }: { event: RichEvent }) {
  const name = String(event.name ?? event.filename ?? "附件");
  const url = event.url ? String(event.url) : null;
  const sizeBytes = typeof event.size_bytes === "number" ? event.size_bytes : null;
  return (
    <a
      href={url ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="my-1 inline-flex items-center gap-2 border border-border rounded-md bg-bg-sunken/60 px-3 py-2 hover:bg-bg-sunken transition-colors duration-150"
    >
      <FileIcon />
      <span className="text-sm truncate max-w-[280px]">{name}</span>
      {sizeBytes != null ? (
        <span className="text-xs text-fg-muted">{formatBytes(sizeBytes)}</span>
      ) : null}
    </a>
  );
}

function ImageCard({ event }: { event: RichEvent }) {
  const url = event.url ? String(event.url) : null;
  if (!url) return null;
  return (
    <img
      src={url}
      alt={event.name ? String(event.name) : ""}
      className="my-1 max-w-full max-h-[280px] rounded-md border border-border object-contain"
      loading="lazy"
    />
  );
}

function WebPreviewCard({ event }: { event: RichEvent }) {
  const url = event.url ? String(event.url) : null;
  const title = event.title ? String(event.title) : null;
  const snippet = event.snippet ? String(event.snippet) : null;
  return (
    <a
      href={url ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="my-1 block border border-border rounded-md bg-bg-sunken/60 px-3 py-2 hover:bg-bg-sunken transition-colors duration-150"
    >
      <div className="flex items-center gap-2 text-sm font-medium truncate">
        <LinkIcon />
        <span className="truncate">{title ?? url ?? "link"}</span>
      </div>
      {snippet ? (
        <p className="mt-1 text-xs text-fg-muted line-clamp-2">{snippet}</p>
      ) : null}
    </a>
  );
}

function ApprovalRequestCard({ event }: { event: RichEvent }) {
  const tool = String(event.tool ?? "tool");
  const title = event.title ? String(event.title) : "需要你的授权";
  const detail = event.detail ? String(event.detail) : "";
  const risk = String(event.riskLevel ?? "medium");
  const dot = riskColor(risk);
  return (
    <div className="my-1 border border-warning/40 bg-warning-soft/40 rounded-md px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={`inline-block w-2 h-2 rounded-full ${dot}`}
        />
        <span className="font-mono text-fg">{tool}</span>
        <span className="text-fg-muted truncate">{title}</span>
      </div>
      {detail ? (
        <pre className="mt-1.5 font-mono text-[11px] text-fg-muted whitespace-pre-wrap break-words leading-relaxed">
          {detail}
        </pre>
      ) : null}
      {/* Phase N: 这里加 4 个动作按钮 (拒绝 / 一次 / 本次 / 永久) */}
    </div>
  );
}

function ThinkingChip({ text }: { text: string }) {
  return (
    <div className="my-1 text-xs italic text-fg-muted border-l-2 border-border-strong pl-2 whitespace-pre-wrap break-words">
      {text || "思考中…"}
    </div>
  );
}

// ─────────── helpers ───────────

function shortObj(e: RichEvent): ReactNode {
  // 重建一个不含 type 字段的对象, 避免对 required 属性做 delete
  const { type: _ignore, ...rest } = e;
  void _ignore;
  const s = JSON.stringify(rest);
  if (s.length <= 200) return s;
  return s.slice(0, 200) + "…";
}

function shortArgs(s: string): string {
  const trimmed = s.length > 600 ? s.slice(0, 600) + "…" : s;
  return trimmed;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function riskColor(level: string): string {
  switch (level) {
    case "high":
      return "bg-danger";
    case "low":
      return "bg-success";
    default:
      return "bg-warning";
  }
}

// ─────────── icons ───────────

function ToolIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-brand"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}
function FileIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-fg-muted"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
function LinkIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-fg-muted"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}
