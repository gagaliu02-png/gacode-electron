/**
 * components/chat/SlashMenu.tsx — chat-id-25 slash 命令菜单 13 条
 *
 * 用户在 textarea 输入 '/' 触发, 显示 13 条命令浮层. 选一条 → 把命令对应
 * 「前缀文本」插入到 textarea (例 /image → 「/image 」; /translate → 中文模板
 * 文本; /new → 通知 parent 触发 createChat + navigate).
 *
 * server 端**没有** slash command 端点 (verifier 2026-10-19 全局 grep 0 命中),
 * 13 条全走客户端策略:
 *   - /image /file /camera  → 触发 AttachmentPicker (parent 决定走哪种 mode)
 *   - /knowledge            → 打开 KnowledgeAttachSheet
 *   - /search               → toast 占位 ("全局搜索即将开放")
 *   - /new                  → parent 触发 createChat + navigate
 *   - /clear                → parent 清空 textarea
 *   - /template             → toast 占位
 *   - /translate /summary   → 插入中文模板文本 "请把以下内容翻译成中文:\n..."
 *   - /save                 → 把当前 assistant 最后一条消息保存到知识库 (parent
 *                            触发 createLibraryItem)
 *   - /voice                → toast 占位 (chat-id-26 已划 later)
 *
 * 容器: 自实现 fixed-position 浮层 (在 ChatInputBar 上方). 不引 Radix Popover,
 * 走与 PlusActionsSheet 同款 bottom-sheet 之外路径 (slash 触发场景不需要
 * 全屏遮罩).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../ui/Toast";

export type SlashCommand =
  | "image"
  | "file"
  | "search"
  | "new"
  | "clear"
  | "template"
  | "translate"
  | "summary"
  | "save"
  | "camera"
  | "knowledge"
  | "voice";

interface CommandSpec {
  cmd: SlashCommand;
  label: string;
  description: string;
  glyph: string;
  /** 客户端可处理 (true) 还是仅 toast 占位 (false) */
  supported: boolean;
  /** 'insert' = 把 cmd 拼成 /cmd 形式写到 textarea; 'action' = 通知 parent */
  kind: "insert" | "action";
}

const COMMANDS: CommandSpec[] = [
  { cmd: "image", label: "图片", description: "上传一张图片到对话", glyph: "🖼", supported: true, kind: "action" },
  { cmd: "file", label: "文件", description: "上传一个文档附件", glyph: "📄", supported: true, kind: "action" },
  { cmd: "search", label: "搜索", description: "在历史对话里搜索", glyph: "🔍", supported: false, kind: "insert" },
  { cmd: "new", label: "新建对话", description: "开一个新对话", glyph: "✨", supported: true, kind: "action" },
  { cmd: "clear", label: "清空", description: "清空当前输入框", glyph: "🧹", supported: true, kind: "action" },
  { cmd: "template", label: "模板", description: "从模板创建", glyph: "📋", supported: false, kind: "insert" },
  { cmd: "translate", label: "翻译", description: "插入翻译模板", glyph: "🌐", supported: true, kind: "insert" },
  { cmd: "summary", label: "总结", description: "插入总结模板", glyph: "📝", supported: true, kind: "insert" },
  { cmd: "save", label: "保存", description: "把最近 AI 回复保存到知识库", glyph: "💾", supported: true, kind: "action" },
  { cmd: "camera", label: "拍照", description: "用相机拍一张图", glyph: "📷", supported: true, kind: "action" },
  { cmd: "knowledge", label: "挂载知识库", description: "在消息里挂载知识库条目", glyph: "📚", supported: true, kind: "action" },
  { cmd: "voice", label: "语音", description: "用语音输入", glyph: "🎙", supported: false, kind: "insert" },
];

export interface SlashMenuProps {
  open: boolean;
  /** filter = 用户已输入的 '/' 之后到现在的部分 (例: '/im' → 过滤 image) */
  filter: string;
  onSelect: (cmd: SlashCommand) => void;
  onDismiss: () => void;
}

export function SlashMenu({ open, filter, onSelect, onDismiss }: SlashMenuProps) {
  const { toast } = useToast();
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const list = useMemo(() => {
    const q = filter.replace(/^\//, "").toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter(
      (c) => c.cmd.startsWith(q) || c.label.toLowerCase().includes(q),
    );
  }, [filter]);

  useEffect(() => {
    setActive(0);
  }, [filter]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => (a + 1) % Math.max(1, list.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => (a - 1 + list.length) % Math.max(1, list.length));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const picked = list[active];
        if (picked) onSelect(picked.cmd);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, list, active, onSelect, onDismiss]);

  if (!open || list.length === 0) return null;

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label="slash 命令菜单"
      className="absolute bottom-full left-0 mb-1 w-72 max-h-72 overflow-y-auto rounded-md bg-bg-elevated border border-border shadow-dialog"
      data-testid="slash-menu"
    >
      <p className="px-3 py-1 text-[10px] uppercase tracking-wide text-fg-subtle border-b border-border">
        Slash 命令 · {list.length}
      </p>
      <ul className="py-1">
        {list.map((c, i) => {
          const isActive = i === active;
          return (
            <li key={c.cmd}>
              <button
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => onSelect(c.cmd)}
                onMouseEnter={() => setActive(i)}
                className={[
                  "w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm",
                  "transition-colors duration-150",
                  isActive
                    ? "bg-bg-sunken text-fg"
                    : "text-fg-muted hover:text-fg hover:bg-bg-sunken/60",
                  !c.supported ? "opacity-60" : "",
                ].join(" ")}
                data-testid={`slash-cmd-${c.cmd}`}
              >
                <span aria-hidden="true" className="text-base">
                  {c.glyph}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="font-medium">/{c.cmd}</span>
                  <span className="ml-2 text-[11px] text-fg-muted">
                    {c.description}
                  </span>
                </span>
                {!c.supported ? (
                  <span className="text-[10px] text-fg-subtle">即将开放</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export { COMMANDS as SLASH_COMMANDS };
// keep toast usage so future 'unsupported' actions can toast via parent.
void useToast;