/**
 * lib/markdown.tsx — 阶段 1 升级: 自实现 → 共用 gacode-web 渲染管线
 *
 * 背景:
 *   阶段 0 约束"不引新依赖", 自实现了一个 mini 解析器 (h1-3 / paragraph / ul / ol /
 *   blockquote / link / strong / em / code / codeblock), 完全不支持表格 / 图片 / 嵌套
 *   列表 / task list. LLM 输出表格时 electron 端只能看到原样竖线.
 *
 * 阶段 1 (gaga 拍板): 弃用自实现, 引入 react-markdown + remark-gfm + remark-emoji +
 * rehype-sanitize, 跟 gacode-web 共用同一套组件 (逻辑 1:1 移植, 见
 * gacode-web/src/components/Markdown.tsx). Tailwind token 两边一致 (--bg-sunken /
 * --fg-muted / --border-default 等), CSS 类 .md-table-* 在 globals.css 同步定义.
 *
 * 组件 API: { children: string; className?: string } — 跟 gacode-web 对齐, MessageBubble
 * 切到 <Markdown>{content}</Markdown>.
 *
 * 安全:
 *   - rehype-sanitize (defaultSchema) + 自定义 allowlist — 防御 LLM 输出 <script> /
 *     <img onerror=...>. default schema 已经禁 on* 事件属性 + script/iframe 等危险标签.
 *   - link 仍是 target=_blank + rel=noopener noreferrer.
 *
 * 阶段 2/3 (shiki 高亮 / mermaid / 暗色适配) 不在本 PR 范围.
 */

import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkEmoji from "remark-emoji";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

// electron 阶段 0 严格不引新依赖 → 不装 lucide-react, 用内联 SVG.
// 图标跟 web/lucide-react 的 Copy / Check 同源 (12x12 viewBox, 1.5 stroke).
const CopyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// =========================================================================
// helpers
// =========================================================================

// 阶段 3: 把 clsx/twMerge 风格的类名拼接收敛到一处, 跟 web 端 .md-table-td-inner
// + .md-table-td-clamp 的"按条件附加"语义对齐. 不引 clsx 是为了保持 0 新依赖.
// 仅用于本组件内部, 不导出.
function joinClass(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p)).join(" ");
}

/**
 * LightboxDialog — P0 ① 图片点击放大.
 *
 * 用浏览器原生 `<dialog>` 元素, 不引新依赖:
 *   - showModal() / close() API 提供 modal 态 + 焦点陷阱 + Esc 关闭 0 成本
 *   - backdrop 跟 ::backdrop 伪元素自动可达
 *
 * 简化决策 (跟 web 端同名组件 1:1):
 *   - 关闭三路: 点击对话框空白 / 按 Esc / 点 ✕ 按钮
 *   - 不做缩放 / 平移 / 下载 — 只解决"看不清"这一条 P0 痛点
 */
const LightboxDialog: React.FC<{
  src: string;
  alt?: string;
  onClose: () => void;
}> = ({ src, alt, onClose }) => {
  const ref = React.useRef<HTMLDialogElement>(null);

  React.useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (!dlg.open) dlg.showModal();
    // Esc 关 dialog 时同步通知父级
    const onCancel = () => onClose();
    dlg.addEventListener("close", onCancel);
    return () => dlg.removeEventListener("close", onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className="md-lightbox-dialog p-0 bg-transparent border-0 max-w-[95vw] max-h-[95vh] m-auto backdrop:bg-black/85"
      onClick={(e) => {
        // 点对话框自身 (含 padding) = 关闭, 点图片不关
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="md-lightbox-inner relative">
        <img
          src={src}
          alt={alt ?? ""}
          className="md-lightbox-img block max-w-[95vw] max-h-[95vh]"
          onClick={(e) => e.stopPropagation()}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭大图"
          className="md-lightbox-close absolute top-2 right-2 w-9 h-9 rounded-full bg-black/60 text-white text-lg leading-none hover:bg-black/80"
        >
          ✕
        </button>
      </div>
    </dialog>
  );
};

/**
 * MarkdownImage — P0 ① `<img>` 包装: 默认居中显示 + 点击放大.
 *
 * 行为契约 (跟 web 端 Markdown.tsx 同名组件 1:1):
 *   - 加载成功 ⇒ 渲染 <img> + 包装层 .md-img-wrap (居中 + 卡片化)
 *   - 点击图片 ⇒ onClick 设 lightboxUrl ⇒ 父组件渲染 LightboxDialog
 *   - 加载失败 ⇒ 不留破图标, 渲染 "图片加载失败" fallback + 原 URL
 */
const MarkdownImage: React.FC<{
  src?: string;
  alt?: string;
}> = ({ src, alt }) => {
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null);
  const [errored, setErrored] = React.useState(false);
  if (!src) return null;
  if (errored) {
    return (
      <span className="md-img-wrap">
        <span className="md-img-fallback">
          <span>图片加载失败</span>
          <span className="md-img-fallback-url">{src}</span>
        </span>
      </span>
    );
  }
  return (
    <>
      <span className="md-img-wrap">
        <img
          src={src}
          alt={alt ?? ""}
          className="md-img"
          loading="lazy"
          onClick={() => setLightboxUrl(src)}
          onError={() => setErrored(true)}
        />
      </span>
      {lightboxUrl && (
        <LightboxDialog
          src={lightboxUrl}
          alt={alt}
          onClose={() => setLightboxUrl(null)}
        />
      )}
    </>
  );
};

/**
 * ExpandableCell — 阶段 3: 表格正文单元格的"6 行折叠 / 展开"包装.
 *
 * 行为契约 (跟 web 端 Markdown.tsx 同名组件 1:1):
 *   - 默认收起: 内容 > 6 行 (-webkit-line-clamp: 6) ⇒ 触发折叠
 *   - 内容 ≤ 6 行 ⇒ 不显示按钮 (无干扰)
 *   - 点击"展开" ⇒ 解除 line-clamp, 显示完整内容, 按钮文字变"收起"
 *   - 再次点击"收起" ⇒ 重新折叠
 *
 * 测量策略:
 *   - 把 children 包在 .md-table-td-inner 里, 折叠时再加 .md-table-td-clamp
 *   - useLayoutEffect 里读 `el.scrollHeight` vs `el.clientHeight`:
 *     * scrollHeight 反映内容自然高度 (即使 overflow:hidden 也包含被裁内容)
 *     * clientHeight 是当前可见高度 (= 6 行 clamped 时就是 6 行 × line-height)
 *   - 第一次 mount + children 变化时都重测 (SSE 流式追加内容)
 *   - expanded=true 时跳过测量, 保留上一次的 showToggle (按钮"收起"还得显示)
 */
const ExpandableCell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = React.useRef<HTMLDivElement>(null);
  const [showToggle, setShowToggle] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);

  React.useLayoutEffect(() => {
    if (expanded) return; // 展开时不重测 — 按钮必须留着(显示"收起")
    const el = ref.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight + 0.5) {
      setShowToggle(true);
    }
  }, [children, expanded]);

  return (
    <>
      <div
        ref={ref}
        className={joinClass(
          "md-table-td-inner",
          !expanded && "md-table-td-clamp"
        )}
      >
        {children}
      </div>
      {showToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="md-table-td-toggle"
          aria-expanded={expanded}
        >
          {expanded ? "收起 ▴" : "... 展开"}
        </button>
      )}
    </>
  );
};

// Extract language from code block: ```ts\ncode\n``` => 'ts'
function detectLang(className?: string): string | null {
  if (!className) return null;
  const m = /language-([\w-]+)/.exec(className);
  return m ? m[1] : null;
}

const CodeBlock: React.FC<{
  className?: string;
  raw: string;
}> = ({ className, raw }) => {
  const lang = detectLang(className);
  const [copied, setCopied] = React.useState(false);

  const onCopy = React.useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(raw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [raw]);

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border bg-bg-sunken">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-bg-elevated">
        <span className="text-[10px] uppercase tracking-wide text-fg-muted">
          {lang ?? "code"}
        </span>
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy code"
          className="inline-flex items-center gap-1 text-[10px] text-fg-muted hover:text-fg transition-colors"
        >
          {copied ? <CheckIcon className="h-3 w-3" /> : <CopyIcon className="h-3 w-3" />}
          {copied ? "已复制" : "复制"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 text-xs font-mono leading-relaxed text-fg">
        <code className={className}>{raw}</code>
      </pre>
    </div>
  );
};

// rehype-sanitize schema — 以 defaultSchema 为底, 补:
//   - code / span 允许 className (remark-gfm 给 table cell 注入 language-xxx)
//   - input 允许 type / checked / disabled (GFM task list checkbox)
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [
      ...(defaultSchema.attributes?.code ?? []),
      ["className", /^language-./, /^(hljs|token|shiki).*/],
    ],
    span: [
      ...(defaultSchema.attributes?.span ?? []),
      ["className", /^(hljs|token|shiki).*/],
    ],
    input: [
      ...(defaultSchema.attributes?.input ?? []),
      ["type", "checkbox"],
      "checked",
      "disabled",
    ],
  },
};

// ── P0 渲染细节 (2026-10-17, 跟 gacode-web 同源) ─────────────────────────
//
// 总结:
//   - img → MarkdownImage: 居中 + 点击放大 (LightboxDialog) + 失败 fallback
//   - blockquote → 嵌套缩进 (.md-bq + 子选择器, 最多四层视觉差异)
//   - del → .md-del (muted 色 + 半透明描线)
//   - input type=checkbox → 由 :has() CSS 接管线 + 半透明
//   - hr → .md-hr (居中短线 + 浅灰)
//   - table th/td → 透传 style (gfm 注入 align), CSS 默认左对齐 (符合 GFM spec)
//
// 不变:
//   - code / pre / a / h1-h6 / p / ul / ol / li / strong / em 走原有逻辑
//
const components: Components = {
  code({ className, children, ...props }) {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="rounded px-1 py-0.5 text-xs font-mono bg-muted text-fg"
          {...props}
        >
          {children}
        </code>
      );
    }
    const raw = String(children ?? "").replace(/\n$/, "");
    return <CodeBlock className={className} raw={raw} />;
  },
  pre({ children }) {
    return <>{children}</>;
  },
  a({ href, children, ...props }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-brand underline-offset-2 hover:underline"
        {...props}
      >
        {children}
      </a>
    );
  },
  h1({ children }) {
    return (
      <h1 className="text-xl font-semibold mt-3 mb-2 text-fg">{children}</h1>
    );
  },
  h2({ children }) {
    return (
      <h2 className="text-lg font-semibold mt-3 mb-2 text-fg">{children}</h2>
    );
  },
  h3({ children }) {
    return (
      <h3 className="text-base font-semibold mt-2 mb-1 text-fg">{children}</h3>
    );
  },
  h4({ children }) {
    return (
      <h4 className="text-sm font-semibold mt-2 mb-1 text-fg">{children}</h4>
    );
  },
  h5({ children }) {
    return (
      <h5 className="text-sm font-medium mt-2 mb-1 text-fg">{children}</h5>
    );
  },
  h6({ children }) {
    return (
      <h6 className="text-xs font-medium mt-2 mb-1 text-fg-muted uppercase tracking-wide">
        {children}
      </h6>
    );
  },
  p({ children }) {
    return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
  },
  ul({ children }) {
    return (
      <ul className="list-disc pl-5 my-2 space-y-1 marker:text-fg-muted">
        {children}
      </ul>
    );
  },
  ol({ children }) {
    return (
      <ol className="list-decimal pl-5 my-2 space-y-1 marker:text-fg-muted">
        {children}
      </ol>
    );
  },
  li({ children }) {
    return <li className="leading-relaxed">{children}</li>;
  },
  blockquote({ children }) {
    // P0 ③ 嵌套引用 — md-bq 单层, 由 CSS :is(.md-bq .md-bq ...) 多级缩进
    // + 左边色阶 (brand → brand-cyan → brand-yellow)
    return <blockquote className="md-bq">{children}</blockquote>;
  },
  // P0 ① 图片 → 居中 + 点击放大 (LightboxDialog) + onError fallback
  img({ src, alt }) {
    return <MarkdownImage src={src} alt={alt} />;
  },
  // 表格 — 跟 web 同款横滚容器. 阶段 2: 列宽一致 (table-layout: auto) + 正文断行.
  // 阶段 3 (2026-10-17): 表头居中 + 加粗 + 浅灰背景 + 加粗下边框;
  //                    单词边界优先 (break-word) 取代 anywhere;
  //                    单元格内容超过 6 行折叠 (ExpandableCell 用 -webkit-line-clamp: 6).
  //                    CSS 见 globals.css `.md-table-*`.
  table({ children }) {
    return (
      <div className="md-table-scroll">
        <table className="md-table">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="md-table-thead">{children}</thead>;
  },
  th({ children, style }) {
    return (
      <th className="md-table-th" style={style}>
        {children}
      </th>
    );
  },
  td({ children, style }) {
    return (
      <td className="md-table-td" style={style}>
        <ExpandableCell>{children}</ExpandableCell>
      </td>
    );
  },
  hr() {
    // P0 ⑤ 浅灰居中短线, 跟段落视觉断句 (避免粗黑横杠盖过正文)
    return <hr className="md-hr" />;
  },
  strong({ children }) {
    return <strong className="font-semibold text-fg">{children}</strong>;
  },
  em({ children }) {
    return <em className="italic text-fg">{children}</em>;
  },
  del({ children }) {
    // P0 ② 删除线 — 自定义 .md-del 控制 text-decoration-color / thickness / 颜色
    // 避免浏览器默认的全局色 (跟正文颜色难以区分)
    return <del className="md-del">{children}</del>;
  },
  input(props) {
    const { type, checked, disabled } = props as React.InputHTMLAttributes<HTMLInputElement>;
    if (type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={!!checked}
          disabled={disabled}
          readOnly
          className="mr-1 align-middle accent-brand"
        />
      );
    }
    return <input {...props} />;
  },
};

interface MarkdownProps {
  children: string;
  className?: string;
}

export function Markdown({ children, className }: MarkdownProps) {
  return (
    <div
      className={[
        "text-sm leading-relaxed text-fg break-words",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkEmoji]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
