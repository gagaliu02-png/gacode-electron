/**
 * components/chat/CallTreeCard.tsx — chat-id-12 链路树 / call tree 卡片
 *
 * server 端 (unified-api + gaclaw) 的 tool_event 在 stream chunk.events 里带
 *   { type: 'tool_start', id, parent_id?, tool, args?, title?, started_at? }
 *   { type: 'tool_end',   id, duration_ms?, status? }
 * ChatDetail 把这一组归一化为一个 tool tree, 然后整张树挂到 assistant 气泡顶部,
 * 替代「每个 tool 单独一张卡」(跟 Android SsePipeline 渲染路径一致).
 *
 * 渲染策略 (defensive — 拿不到 parent_id 时降级到扁平列表):
 *   1. 按 parent_id 构树 (root.parent_id == null / undefined / '')
 *   2. 树渲染: 缩进 + 工具名 + 时长 + 折叠态 (子节点默认折叠)
 *
 * 折叠 / 展开:
 *   - 默认 root 展开, 二级节点折叠 (跟 web 同款)
 *   - 点 root header 切换整棵树的状态
 *
 * ⚠️ 2026-10-19 verifier: server event 实际是 type='tool_start' / 'tool_end' 还是
 *   'function_call', gacode-electron 当前 RichEventBubble 走的是 'tool_start'.
 *   解析端按 'tool_start' 接; 拿不到这些字段就降级到 RichEventBubble 单卡片渲染.
 */

import { useMemo, useState } from "react";
import { ToolTimingBadge } from "./ToolTimingBadge";

export interface CallTreeNode {
  id: string;
  tool: string;
  title?: string;
  parentId?: string | null;
  durationMs?: number;
  status?: "running" | "ok" | "error";
}

export interface CallTreeCardProps {
  nodes: CallTreeNode[];
}

interface TreeNode extends CallTreeNode {
  children: TreeNode[];
}

function buildTree(flat: CallTreeNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const n of flat) byId.set(n.id, { ...n, children: [] });
  const roots: TreeNode[] = [];
  for (const n of byId.values()) {
    if (n.parentId && byId.has(n.parentId)) {
      byId.get(n.parentId)!.children.push(n);
    } else {
      roots.push(n);
    }
  }
  return roots;
}

export function CallTreeCard({ nodes }: CallTreeCardProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  if (tree.length === 0) return null;

  return (
    <div
      className="my-1 rounded-md bg-bg-sunken/60 border border-border px-3 py-2 text-xs"
      data-testid="call-tree-card"
    >
      <div className="flex items-center gap-1.5 text-fg-muted mb-1">
        <BranchIcon />
        <span className="font-mono">调用链路</span>
        <span className="ml-1 text-fg-subtle">{nodes.length} 步</span>
      </div>
      <ul className="space-y-0.5">
        {tree.map((root) => (
          <TreeRow
            key={root.id}
            node={root}
            depth={0}
            expanded={expanded}
            onToggle={(id) => setExpanded((m) => ({ ...m, [id]: !m[id] }))}
          />
        ))}
      </ul>
    </div>
  );
}

function TreeRow({
  node,
  depth,
  expanded,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  expanded: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = !!expanded[node.id];
  return (
    <li>
      <div
        className="flex items-center gap-1.5 py-0.5"
        style={{ marginLeft: depth * 14 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            className="w-4 h-4 inline-flex items-center justify-center text-fg-muted hover:text-fg"
            aria-expanded={isOpen}
            aria-label={isOpen ? "折叠" : "展开"}
          >
            <span className="text-[10px]">{isOpen ? "▾" : "▸"}</span>
          </button>
        ) : (
          <span className="w-4 inline-block text-center text-fg-subtle">·</span>
        )}
        <span className="font-mono text-fg">{node.tool}</span>
        {node.title ? (
          <span className="text-fg-muted truncate">{node.title}</span>
        ) : null}
        <span className="ml-auto">
          {typeof node.durationMs === "number" ? (
            <ToolTimingBadge elapsedMs={node.durationMs} compact={false} />
          ) : node.status === "running" ? (
            <span className="text-[10px] text-warning">运行中…</span>
          ) : node.status === "error" ? (
            <span className="text-[10px] text-danger">失败</span>
          ) : null}
        </span>
      </div>
      {hasChildren && isOpen ? (
        <ul className="space-y-0.5">
          {node.children.map((c) => (
            <TreeRow
              key={c.id}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function BranchIcon() {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M6 8v8" />
      <path d="M8 12h8" />
    </svg>
  );
}