/**
 * components/chat/ReferenceFold.tsx — chat-id-9 知识库引用折叠条
 *
 * 渲染 server metadata.knowledge_refs (用户本轮挂载的 atom id 列表, 由
 * server chat route 解析后注入 LLM 上下文). 视觉跟 web MessageBubble.tsx:443-489
 * 1:1 对齐: 折叠态 "📚 引用了 N 条知识库", 展开态列出每条 id (title 暂无可用字段).
 *
 * ✅ 2026-10-26 订正（旧注释写于 2026-10-19, 事实已过期）: 服务端**已支持** knowledge_refs ——
 *   schema: unified-api/src/modules/yinian/yinian.chat.routes.js:405
 *   解析 + 取 atom 原文 + 注入 LLM 上下文: 同文件 :1366-1389 (getMemoryAtomsForChat)。
 *   ⚠️ 但服务端**仍不把 knowledge_refs 落进 message metadata**（:1193-1195 只写
 *   image_urls + attached_file_ids）⇒ 历史回看没有 knowledge_refs 可解析。
 *   PC 读侧也**还没接**: lib/api.ts:getHistory 不解析 metadata.knowledge_refs,
 *   ChatDetail.tsx:270-285 也没把它映射进 ChatMessageModel ⇒ 本组件目前恒不渲染。
 *   组件形态与 web MessageBubble.tsx:443-489 一致, 等读侧接线后即生效。
 *
 * 父组件拿到 knowledgeRefs.length > 0 时挂这个组件。解析端不区分 role。
 */
import { useState } from "react";

export interface ReferenceFoldProps {
  ids: string[];
  /** 默认折叠, 给流式场景用 (新挂载时不展开吵用户). */
  defaultOpen?: boolean;
}

export function ReferenceFold({ ids, defaultOpen = false }: ReferenceFoldProps) {
  const [open, setOpen] = useState(defaultOpen);
  if (!ids || ids.length === 0) return null;
  return (
    <div className="mt-1.5 rounded-md border border-border bg-bg-sunken/60 text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left text-fg-muted hover:text-fg transition-colors duration-150"
        aria-expanded={open}
        data-testid="reference-fold-toggle"
      >
        <span aria-hidden="true">📚</span>
        <span className="font-medium">引用了 {ids.length} 条知识库</span>
        <span className="ml-auto">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <ul className="px-2.5 pb-1.5 space-y-0.5 text-[11px] text-fg-muted break-all">
          {ids.map((id) => (
            <li key={id} data-testid="reference-fold-id">
              · {id}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}