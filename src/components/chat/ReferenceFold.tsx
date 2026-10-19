/**
 * components/chat/ReferenceFold.tsx — chat-id-9 知识库引用折叠条
 *
 * 渲染 server metadata.knowledge_refs (用户本轮挂载的 atom id 列表, 由
 * server chat route 解析后注入 LLM 上下文). 视觉跟 web MessageBubble.tsx:443-489
 * 1:1 对齐: 折叠态 "📚 引用了 N 条知识库", 展开态列出每条 id (title 暂无可用字段).
 *
 * ⚠️ 2026-10-19 verifier: unified-api/src/modules/yinian/yinian.chat.routes.js:893
 *   当前**只**把 image_urls + attached_file_ids 落 metadata, knowledge_refs 暂未写.
 *   UI 解析就位 (lib/api.ts:getHistory), server 后续补写即生效. 不在 client 端伪造.
 *
 * 父组件拿到 knowledgeRefs.length > 0 时挂这个组件. assistant 端 server 暂未回传,
 *   也兼容 — 解析端不区分 role.
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