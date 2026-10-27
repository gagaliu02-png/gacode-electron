/**
 * components/chat/RichEventBubble.tsx — 阶段 2 工具 / 富事件小卡片
 *
 * 每个 rich_event (tool_start / file / image / web_preview / approval_request …)
 * 渲染成一个小卡片: 工具名 + 简述 + 参数.
 *
 * ---------------------------------------------------------------------------
 * 2026-10-28 · 任务书 04 · 契约 §4 / §5 (L-10 / L-17 / L-19 / 任务书 P-9 / P-13)
 * ---------------------------------------------------------------------------
 *   1. **事件模型换成契约的判别联合** (`lib/rich-events.ts` 的 `RichEventBase`)
 *      —— 之前这里是 `{type: string; [k: string]: unknown}` 的开口袋子, 任何
 *      拼错的字段名都能悄悄溜过去。现在按 `type` 收窄, 20 个活类型 + 9 个
 *      死类型占位全在类型里 (契约 §2)。
 *      ⇒ `RichEvent` 这个导出名保留 (MessageList / MessageBubble 在用), 但
 *        底层类型换成 `RichEventBase`。
 *
 *   2. **L-10 空 url 降级** —— ⛔ 不得因 url 为空/缺失就跳过整个事件:
 *        · `file`        ⇒ 文件名 + 「无公开链接」+ **不给可点入口**
 *                          (之前是 `href="#"` ⇒ 点了没反应的死链接);
 *        · `image`       ⇒ 占位块 + alt/prompt (之前 `if (!url) return null`
 *                          ⇒ 整张图直接消失);
 *        · `web_preview` ⇒ 标题 + 「无公开链接」(之前同样是 `href="#"` 死按钮)。
 *      三处降级文案统一走 `NO_PUBLIC_LINK` 这**一个**常量 (跟 web 端同款)。
 *
 *   3. **P-13 · tool_done 的 5 个 subtype 都要能渲染** ——
 *      `code_diff` / `chart` / `doc_summary` 在生产里**没有**对应的独立事件
 *      (那是契约 §2.5 的死类型) ⇒ 必须按 `tool_done` 的 subtype 渲染。
 *      `tool_done[file]` / `tool_done[image]` 与独立的 `file` / `image` 事件
 *      同源 ⇒ 由 `dedupeRichEvents` (按 (事件族, id)) 先去重, 这里只管渲染。
 *
 *   4. **P-9 · 缺的那几个 subtype 要安全降级** —— `step_started` /
 *      `step_failed` / `report` 是**活类型** (契约 §2.1 supervisor 链路树),
 *      之前落进 default 分支渲染成 JSON 字面 ⇒ 现在给正经的小卡片。
 *      `think` / `planify_start` / `planify_done` 按契约 L-2 **只建模、不渲染**
 *      —— 归一层 (`lib/rich-events.ts`) 直接跳过它们, 到不了这里。
 *
 *   5. **L-19 · 签名 url 不带 Authorization** —— 卡片里的 `<a>` 一律
 *      `target="_blank" rel="noopener noreferrer"`, 不由前端代发带凭据的请求。
 *
 * ⚠️ 图标只从 `components/ui/Glyphs.tsx` 取 (共享库), ⛔ 不写内联 `<svg>`。
 */

import type { ReactNode } from "react";
import {
  AlertTriangleIcon,
  BranchIcon,
  CircleCheckIcon,
  DocTypeIcon,
  ExternalLinkIcon,
  FileIcon,
  FileTextIcon,
  ImageIcon,
  InfoIcon,
  LinkBareIcon,
  ListTodoIcon,
  SparkleStarIcon,
  WrenchIcon,
} from "../ui/Glyphs";
import { ToolTimingBadge } from "./ToolTimingBadge";
import type {
  RichEventBase,
  RichToolDone,
  RichToolFail,
  RichToolStart,
} from "../../lib/rich-events";

/**
 * 契约 L-10 的统一降级文案 (file / image / web_preview 共用)。
 *
 * 跟 web 端 `src/components/chat/RichEventBubble.tsx:58` 同名常量同款文案 ——
 * ⛔ 不许各端各写一份。
 */
export const NO_PUBLIC_LINK = "无公开链接";

/**
 * 事件模型 —— 契约 §2 的判别联合。
 *
 * 保留这个导出名 (`RichEvent`) 是因为 MessageList / MessageBubble 都 import 它;
 * 底层类型换成 `RichEventBase` (web 端同名物)。
 */
export type RichEvent = RichEventBase;

interface Props {
  event: RichEvent;
}

export function RichEventBubble({ event }: Props) {
  switch (event.type) {
    case "tool_start":
      return <ToolStartCard event={event} />;
    case "tool_done":
      return <ToolDoneCard event={event} />;
    case "tool_fail":
      return <ToolFailCard event={event} />;
    case "file":
      return <FileCard event={event} />;
    case "image":
      return <ImageCard event={event} />;
    case "web_preview":
      return <WebPreviewCard event={event} />;
    case "result":
      return <ResultCard event={event} />;
    case "agent_handoff":
      return <HandoffCard event={event} />;
    case "approval_request":
      return <ApprovalRequestCard event={event} />;
    case "approval_granted":
      return <ApprovalDecisionCard event={event} granted />;
    case "approval_denied":
      return <ApprovalDecisionCard event={event} granted={false} />;
    case "qrcode":
      return <QrcodeCard event={event} />;
    case "gateway_connected":
      return <GatewayCard event={event} />;
    // ── P-9 · supervisor 链路树 (契约 §2.1) ──────────────────────────
    case "step_started":
    case "step_done":
    case "step_failed":
      return <StepCard event={event} />;
    case "report":
      return <ReportCard event={event} />;
    default:
      // 死类型占位 / 归一层漏过来的未知 type ⇒ 显示 type + JSON 字面, 不抛错
      return (
        <div className="text-xs font-mono text-fg-muted rounded-md bg-bg-elevated/40 px-3 py-2 my-1 break-words">
          {event.type} · {shortObj(event)}
        </div>
      );
  }
}

// ─────────── sub-cards ───────────

function ToolStartCard({ event }: { event: RichToolStart }) {
  const tool = event.tool ?? "tool";
  return (
    <div className="my-1 rounded-md bg-bg-sunken/60 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <WrenchIcon className="text-brand" size={14} strokeWidth={1.6} />
        <span className="font-mono text-fg">{tool}</span>
      </div>
      {event.args != null ? (
        <pre className="mt-1.5 font-mono text-[11px] text-fg-muted whitespace-pre-wrap break-words leading-relaxed">
          {shortArgs(stringify(event.args))}
        </pre>
      ) : null}
    </div>
  );
}

/**
 * tool_done —— 按 subtype 分派 (契约 §2.3 / 任务书 P-13)。
 *
 * `code_diff` / `chart` / `doc_summary` 在生产里**没有**独立事件 ⇒ 必须
 * 走 `tool_done` 的 subtype 分支渲染 (⛔ 不得期待独立的 code_diff 事件)。
 */
function ToolDoneCard({ event }: { event: RichToolDone }) {
  switch (event.subtype) {
    case "file":
      return <ToolDoneFileCard event={event} />;
    case "image":
      return <ToolDoneImageCard event={event} />;
    case "code_diff":
      return <ToolDoneDiffCard event={event} />;
    case "chart":
      return <ToolDoneChartCard event={event} />;
    case "doc_summary":
      return <ToolDoneSummaryCard event={event} />;
    default:
      return <ToolDoneGenericCard event={event} />;
  }
}

function ToolDoneGenericCard({ event }: { event: RichToolDone }) {
  const tool = event.tool ?? "tool";
  return (
    <div className="my-1 rounded-md bg-bg-sunken/60 px-3 py-2 text-xs flex items-center gap-2">
      <WrenchIcon className="text-brand" size={14} strokeWidth={1.6} />
      <span className="font-mono text-fg">{tool}</span>
      <span className="text-[10px] text-fg-muted">完成</span>
      {event.duration_ms != null ? (
        <span className="ml-auto">
          <ToolTimingBadge elapsedMs={event.duration_ms} />
        </span>
      ) : null}
    </div>
  );
}

/** `tool_done[file]` —— 与独立的 `file` 事件同源 (去重后只会留一条)。 */
function ToolDoneFileCard({ event }: { event: RichToolDone }) {
  const name = event.name ?? event.title ?? "附件";
  const url = event.url;
  const size = event.size;
  return (
    <div className="my-1 rounded-md bg-bg-sunken/60 px-3 py-2 text-xs flex items-center gap-2">
      <FileIcon className="text-fg-muted" size={14} strokeWidth={1.6} />
      <span className="text-sm truncate max-w-[280px]">{name}</span>
      {size != null ? (
        <span className="text-xs text-fg-muted">{formatBytes(size)}</span>
      ) : null}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-fg-muted hover:text-fg inline-flex items-center gap-1"
        >
          <ExternalLinkIcon size={12} strokeWidth={1.6} />
          打开
        </a>
      ) : (
        // L-10 — 无 url ⇒ 不给死链接, 给明确文案
        <span className="ml-auto text-fg-muted">{NO_PUBLIC_LINK}</span>
      )}
    </div>
  );
}

/** `tool_done[image]` —— 与独立的 `image` 事件同源 (去重后只会留一条)。 */
function ToolDoneImageCard({ event }: { event: RichToolDone }) {
  const url = event.url;
  const caption = event.alt ?? event.prompt ?? event.name ?? "图片";
  if (!url) {
    // L-10 — 无 url ⇒ 占位块, ⛔ 不得裂图
    return (
      <div className="my-1 rounded-md bg-bg-sunken/60 px-3 py-2 text-xs flex items-center gap-2">
        <ImageIcon className="text-fg-muted" size={14} strokeWidth={1.6} />
        <span className="text-sm truncate max-w-[280px]">{caption}</span>
        <span className="ml-auto text-fg-muted">{NO_PUBLIC_LINK}</span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={caption}
      className="my-1 max-w-full max-h-[280px] rounded-md object-contain"
      loading="lazy"
    />
  );
}

/** `tool_done[code_diff]` —— P-13: 活的 subtype, 必须能渲染。 */
function ToolDoneDiffCard({ event }: { event: RichToolDone }) {
  const path = event.path ?? event.name ?? event.title ?? "变更";
  const diff = event.diff;
  return (
    <div className="my-1 rounded-md bg-bg-sunken/60 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <FileTextIcon className="text-fg-muted" size={14} strokeWidth={1.6} />
        <span className="font-mono text-fg truncate">{path}</span>
      </div>
      {diff ? (
        <pre className="mt-1.5 font-mono text-[11px] text-fg-muted whitespace-pre-wrap break-words leading-relaxed max-h-[240px] overflow-auto">
          {shortArgs(diff, 2000)}
        </pre>
      ) : (
        <div className="mt-1 text-fg-muted">（无 diff 正文）</div>
      )}
    </div>
  );
}

/** `tool_done[chart]` —— P-13: 活的 subtype, 必须能渲染。 */
function ToolDoneChartCard({ event }: { event: RichToolDone }) {
  const title = event.title ?? event.name ?? "图表";
  const chartType = event.chart_type;
  return (
    <div className="my-1 rounded-md bg-bg-sunken/60 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <ListTodoIcon className="text-fg-muted" size={14} strokeWidth={1.6} />
        <span className="font-mono text-fg truncate">{title}</span>
        {chartType ? (
          <span className="text-[10px] text-fg-muted">{chartType}</span>
        ) : null}
      </div>
      {event.data != null ? (
        <pre className="mt-1.5 font-mono text-[11px] text-fg-muted whitespace-pre-wrap break-words leading-relaxed max-h-[240px] overflow-auto">
          {shortArgs(stringify(event.data), 1200)}
        </pre>
      ) : (
        <div className="mt-1 text-fg-muted">（无图表数据）</div>
      )}
    </div>
  );
}

/** `tool_done[doc_summary]` —— P-13: 活的 subtype, 必须能渲染。 */
function ToolDoneSummaryCard({ event }: { event: RichToolDone }) {
  const title = event.title ?? event.name ?? "文档摘要";
  const summary = event.summary;
  return (
    <div className="my-1 rounded-md bg-bg-sunken/60 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <DocTypeIcon className="text-fg-muted" size={14} strokeWidth={1.6} />
        <span className="font-mono text-fg truncate">{title}</span>
      </div>
      {summary ? (
        <p className="mt-1 text-fg-muted whitespace-pre-wrap break-words leading-relaxed">
          {summary}
        </p>
      ) : (
        <div className="mt-1 text-fg-muted">（无摘要正文）</div>
      )}
      {event.citations != null ? (
        <div className="mt-1 text-[11px] text-fg-muted">
          引用: {shortArgs(stringify(event.citations), 400)}
        </div>
      ) : null}
    </div>
  );
}

function ToolFailCard({ event }: { event: RichToolFail }) {
  const tool = event.tool ?? "tool";
  const error = event.error ?? "未知错误";
  return (
    <div className="my-1 rounded-md bg-danger-soft/40 border border-danger/30 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <AlertTriangleIcon className="text-danger" size={14} strokeWidth={1.6} />
        <span className="font-mono text-fg">{tool}</span>
        <span className="text-[10px] text-danger">失败</span>
        {event.duration_ms != null ? (
          <span className="ml-auto">
            <ToolTimingBadge elapsedMs={event.duration_ms} />
          </span>
        ) : null}
      </div>
      <div className="mt-1 text-fg-muted whitespace-pre-wrap break-words">
        {error}
      </div>
    </div>
  );
}

/**
 * file —— 交付物卡片 (契约 §2.1)。
 *
 * L-10: url 为空 ⇒ 文件名 + 「无公开链接」+ **不给可点入口**
 * (⛔ 不留 `href="#"` 那种点了没反应的死链接)。
 */
function FileCard({ event }: { event: Extract<RichEvent, { type: "file" }> }) {
  const name = event.name ?? event.fileName ?? "附件";
  const url = event.url;
  const sizeBytes = event.sizeBytes ?? event.size;
  const inner = (
    <>
      <FileIcon className="text-fg-muted" size={14} strokeWidth={1.6} />
      <span className="text-sm truncate max-w-[280px]">{name}</span>
      {sizeBytes != null ? (
        <span className="text-xs text-fg-muted">{formatBytes(sizeBytes)}</span>
      ) : null}
      {url ? null : (
        <span className="ml-auto text-xs text-fg-muted">{NO_PUBLIC_LINK}</span>
      )}
    </>
  );
  if (!url) {
    return (
      <div className="my-1 inline-flex items-center gap-2 rounded-md bg-bg-sunken/60 px-3 py-2">
        {inner}
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="my-1 inline-flex items-center gap-2 rounded-md bg-bg-sunken/60 px-3 py-2 hover:bg-bg-sunken transition-colors duration-150"
    >
      {inner}
    </a>
  );
}

/**
 * image —— 图片卡片。
 *
 * L-10: url 为空 ⇒ **占位块 + alt/prompt** (⛔ 不得裂图, ⛔ 不得整条跳过 ——
 * 之前是 `if (!url) return null` ⇒ 这张图直接消失)。
 */
function ImageCard({ event }: { event: Extract<RichEvent, { type: "image" }> }) {
  const url = event.url;
  const caption = event.alt ?? event.prompt ?? "图片";
  if (!url) {
    return (
      <div className="my-1 inline-flex items-center gap-2 rounded-md bg-bg-sunken/60 px-3 py-2 text-xs">
        <ImageIcon className="text-fg-muted" size={14} strokeWidth={1.6} />
        <span className="text-sm truncate max-w-[280px]">{caption}</span>
        <span className="text-fg-muted">{NO_PUBLIC_LINK}</span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={caption}
      className="my-1 max-w-full max-h-[280px] rounded-md object-contain"
      loading="lazy"
    />
  );
}

/** web_preview —— 链接预览。L-10: url 为空 ⇒ 标题 + 「无公开链接」。 */
function WebPreviewCard({
  event,
}: {
  event: Extract<RichEvent, { type: "web_preview" }>;
}) {
  const url = event.url;
  const title = event.title ?? event.description ?? url ?? "链接";
  const description = event.description;
  const body = (
    <>
      <div className="flex items-center gap-2 text-sm font-medium truncate">
        <LinkBareIcon className="text-fg-muted" size={14} strokeWidth={1.6} />
        <span className="truncate">{title}</span>
      </div>
      {description ? (
        <p className="mt-1 text-xs text-fg-muted line-clamp-2">{description}</p>
      ) : null}
      {url ? null : (
        <p className="mt-1 text-xs text-fg-muted">{NO_PUBLIC_LINK}</p>
      )}
    </>
  );
  if (!url) {
    return (
      <div className="my-1 block rounded-md bg-bg-sunken/60 px-3 py-2">
        {body}
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="my-1 block rounded-md bg-bg-sunken/60 px-3 py-2 hover:bg-bg-sunken transition-colors duration-150"
    >
      {body}
    </a>
  );
}

/** result —— 工具结果摘要。 */
function ResultCard({ event }: { event: Extract<RichEvent, { type: "result" }> }) {
  const title = event.title ?? event.source_skill ?? event.executed_tool ?? "结果";
  return (
    <div className="my-1 rounded-md bg-bg-sunken/60 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <SparkleStarIcon className="text-fg-muted" size={14} strokeWidth={1.6} />
        <span className="font-mono text-fg truncate">{title}</span>
        {event.format ? (
          <span className="text-[10px] text-fg-muted">{event.format}</span>
        ) : null}
      </div>
      {event.summary ? (
        <p className="mt-1 text-fg-muted whitespace-pre-wrap break-words">
          {event.summary}
        </p>
      ) : null}
    </div>
  );
}

/** agent_handoff —— 子代理交接。 */
function HandoffCard({
  event,
}: {
  event: Extract<RichEvent, { type: "agent_handoff" }>;
}) {
  return (
    <div className="my-1 rounded-md bg-bg-sunken/60 px-3 py-2 text-xs flex items-center gap-2">
      <BranchIcon className="text-fg-muted" size={14} strokeWidth={1.6} />
      <span className="font-mono text-fg truncate">
        {event.from ?? "?"} → {event.to ?? "?"}
      </span>
      {event.task ? (
        <span className="text-fg-muted truncate">{event.task}</span>
      ) : null}
    </div>
  );
}

/**
 * approval_request —— 审批卡。
 *
 * ⚠️ 审批的**唯一**展示源是 `ApprovalBanner` (PC 端 chat 顶部那条)。
 * 这里保留一张只读摘要卡, 用来在消息流里留痕 (web 端同款做法)。
 */
function ApprovalRequestCard({
  event,
}: {
  event: Extract<RichEvent, { type: "approval_request" }>;
}) {
  const tool = event.tool ?? "tool";
  const title = event.title ?? "需要你的授权";
  const detail = event.detail ?? "";
  const risk = event.risk_level ?? "medium";
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
    </div>
  );
}

/** approval_granted / approval_denied —— 裁决结果小条。 */
function ApprovalDecisionCard({
  event,
  granted,
}: {
  event:
    | Extract<RichEvent, { type: "approval_granted" }>
    | Extract<RichEvent, { type: "approval_denied" }>;
  granted: boolean;
}) {
  const tool = event.tool ?? "tool";
  return (
    <div className="my-1 rounded-md bg-bg-sunken/60 px-3 py-2 text-xs flex items-center gap-2">
      {granted ? (
        <CircleCheckIcon className="text-success" size={14} strokeWidth={1.6} />
      ) : (
        <AlertTriangleIcon className="text-danger" size={14} strokeWidth={1.6} />
      )}
      <span className="font-mono text-fg">{tool}</span>
      <span className="text-fg-muted">{granted ? "已批准" : "已拒绝"}</span>
      {event.type === "approval_granted" && event.approved_by ? (
        <span className="ml-auto text-[10px] text-fg-muted">
          {event.approved_by}
        </span>
      ) : null}
    </div>
  );
}

/** qrcode —— IM 接入二维码。 */
function QrcodeCard({ event }: { event: Extract<RichEvent, { type: "qrcode" }> }) {
  const content = event.qrcode_img_content;
  const title = event.title ?? "扫码接入";
  if (!content) {
    return (
      <div className="my-1 rounded-md bg-bg-sunken/60 px-3 py-2 text-xs flex items-center gap-2">
        <InfoIcon className="text-fg-muted" size={14} strokeWidth={1.6} />
        <span className="text-fg-muted">{title}</span>
        <span className="ml-auto text-fg-muted">{NO_PUBLIC_LINK}</span>
      </div>
    );
  }
  return (
    <div className="my-1 rounded-md bg-bg-sunken/60 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <InfoIcon className="text-fg-muted" size={14} strokeWidth={1.6} />
        <span className="text-fg-muted">{title}</span>
        {event.expire_seconds != null ? (
          <span className="ml-auto text-[10px] text-fg-muted">
            {event.expire_seconds}s
          </span>
        ) : null}
      </div>
      <img
        src={content.startsWith("data:") ? content : `data:image/png;base64,${content}`}
        alt={title}
        className="mt-1.5 w-[160px] h-[160px] object-contain bg-bg-base rounded"
      />
    </div>
  );
}

/** gateway_connected —— 网关绑定成功。 */
function GatewayCard({
  event,
}: {
  event: Extract<RichEvent, { type: "gateway_connected" }>;
}) {
  const label = event.gateway_label ?? event.gateway_id ?? "网关";
  return (
    <div className="my-1 rounded-md bg-bg-sunken/60 px-3 py-2 text-xs flex items-center gap-2">
      <CircleCheckIcon className="text-success" size={14} strokeWidth={1.6} />
      <span className="font-mono text-fg truncate">{label}</span>
      {event.account_id ? (
        <span className="ml-auto text-fg-muted truncate">{event.account_id}</span>
      ) : null}
    </div>
  );
}

/**
 * step_started / step_done / step_failed —— supervisor 链路树的一步 (P-9)。
 *
 * 之前这三个类型落进 default 分支被渲染成 JSON 字面 ⇒ 现在给正经的小卡片。
 */
function StepCard({
  event,
}: {
  event:
    | Extract<RichEvent, { type: "step_started" }>
    | Extract<RichEvent, { type: "step_done" }>
    | Extract<RichEvent, { type: "step_failed" }>;
}) {
  const desc = event.stepDesc ?? "步骤";
  const failed = event.type === "step_failed";
  return (
    <div className="my-1 rounded-md bg-bg-sunken/60 px-3 py-2 text-xs flex items-center gap-2">
      {failed ? (
        <AlertTriangleIcon className="text-danger" size={14} strokeWidth={1.6} />
      ) : (
        <ListTodoIcon className="text-fg-muted" size={14} strokeWidth={1.6} />
      )}
      <span className="font-mono text-fg truncate">{desc}</span>
      {event.stepIndex != null ? (
        <span className="text-[10px] text-fg-muted">#{event.stepIndex}</span>
      ) : null}
      {failed && event.error ? (
        <span className="ml-auto text-[10px] text-danger truncate max-w-[180px]">
          {event.error}
        </span>
      ) : null}
    </div>
  );
}

/** report —— 链路树总结 (P-9)。 */
function ReportCard({ event }: { event: Extract<RichEvent, { type: "report" }> }) {
  const parts: string[] = [];
  if (event.totalSteps != null) parts.push(`共 ${event.totalSteps} 步`);
  if (event.completedSteps != null) parts.push(`完成 ${event.completedSteps}`);
  if (event.failedSteps != null) parts.push(`失败 ${event.failedSteps}`);
  return (
    <div className="my-1 rounded-md bg-bg-sunken/60 px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <ListTodoIcon className="text-fg-muted" size={14} strokeWidth={1.6} />
        <span className="font-mono text-fg">总结</span>
        {parts.length > 0 ? (
          <span className="text-[10px] text-fg-muted">{parts.join(" · ")}</span>
        ) : null}
        {event.durationMs != null ? (
          <span className="ml-auto">
            <ToolTimingBadge elapsedMs={event.durationMs} />
          </span>
        ) : null}
      </div>
      {event.summary ? (
        <p className="mt-1 text-fg-muted whitespace-pre-wrap break-words">
          {event.summary}
        </p>
      ) : null}
    </div>
  );
}

// ─────────── helpers ───────────

function shortObj(e: RichEvent): ReactNode {
  // 重建一个不含 type 字段的对象, 避免对 required 属性做 delete
  const { type: _ignore, ...rest } = e as unknown as Record<string, unknown>;
  void _ignore;
  const s = JSON.stringify(rest);
  if (s.length <= 200) return s;
  return s.slice(0, 200) + "…";
}

function stringify(v: unknown): string {
  try {
    const s = JSON.stringify(v);
    return s === undefined ? String(v) : s;
  } catch {
    return String(v);
  }
}

function shortArgs(s: string, max = 600): string {
  const trimmed = s.length > max ? s.slice(0, max) + "…" : s;
  return trimmed;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
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
