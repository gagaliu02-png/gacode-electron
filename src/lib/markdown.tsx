/**
 * lib/markdown.tsx — PC 端 markdown 渲染入口（**薄封装**）
 *
 * ## M3 批次（2026-10-26）：全站切到自研管线
 *
 * 旧版这里是**第三方 markdown 体系**（remark / rehype 插件链 + 22 个 components），
 * 跟安卓 / web 各写各的。
 * 现在底层换成 **自研两段管线**：
 *
 *   - 解析层 `src/lib/markdown/parser.ts`（纯 TS，零依赖，172 条断言）
 *   - 渲染层 `src/lib/markdown/renderer.tsx`（180 条断言）
 *
 * 行为唯一事实源：`docs/md-android-behavior-spec.md`（安卓基准）。
 *
 * ## 本文件为什么还留着（只剩三件事）
 *
 *   1. **对外 API 不变** —— 消费方（`components/chat/MessageBubble.tsx`、
 *      `components/library/LibraryMarkdownTableCard.tsx`）继续 `import { Markdown }`；
 *   2. **场景封装** —— `size`（chat / reading）+ `cutCodeBlocks`（围栏切卡片）
 *      两个参数从这里透传给渲染层；
 *   3. **图片点击放大**（M5 批，2026-10-26）—— 本层持有 lightbox 状态，
 *      渲染层只管回调。
 *
 * ⚠️ **本文件不含任何解析 / 渲染逻辑** —— 全仓只有这一套 markdown 实现。
 *
 * ## M5 批次（2026-10-26）：图片点击全屏预览（补齐三端）
 *
 * 口径：**web 端是 PC 端的唯一事实源**（PC / web / 安卓三端统一成
 * 「点图 → 全屏 → 关闭」）。
 *
 * - web `src/components/Markdown.tsx:139-178` 的 `MarkdownImage`
 *   **自持** lightbox 状态（点击 → `setLightboxUrl` → 渲染 `LightboxDialog`），
 *   ⇒ PC 的 `Markdown` 封装**照抄这个形态**：本层持有 `lightboxUrl`，
 *   渲染层只透传 `onImageClick(url)` 回调。
 * - 弹窗本体 = `src/components/ui/ImageLightbox.tsx`（浏览器原生 `<dialog>`，
 *   与 web `Markdown.tsx:85-129` 同款：点背景 / Esc / ✕ 三路关闭，点图片不关）。
 * - 安卓 `ui/common/FullscreenImageDialog.kt:36` **不含**「保存到相册」
 *   ⇒ PC **也不加**（保存是交付物详情页的另一件事，不属于 markdown）。
 * - ⚠️ **不引任何新依赖** —— 原生 `<dialog>`，零依赖。
 *
 * ## M3 删掉的东西
 *
 *   - 旧 `LightboxDialog`（react-markdown 体系的图片点击放大）—— 随旧管线一起删。
 *     ⚠️ M3 删它的依据是「安卓不支持图片点击放大（契约 C2 / DEC-15）」，
 *     **该依据已被证伪** —— 安卓 `MarkdownImageBlock.kt:50`（`onFullscreen: () -> Unit`）
 *     / `:60`（`.clickable { onFullscreen() }`）是**有**全屏预览的
 *     ⇒ M5 批按 web 口径**补回**（形态换成原生 `<dialog>`，见上）。
 *   - 旧 `CodeBlock`（语言徽章 + 复制按钮）—— 新渲染层自带 `md-code-card` 形态
 *   - 语法高亮插件的 class 过滤 (hljs / token / shiki 前缀的 className 白名单)
 *     —— 新管线不做语法高亮（安卓也没有，规格 §D5）
 *   - HTML 消毒 (sanitize) 的自定义 schema —— 新管线是**白名单渲染**（AST 决定产出什么
 *     DOM），天然没有 XSS 面
 *
 * 用法：
 *
 * ```tsx
 * import { Markdown } from "@/lib/markdown";
 *
 * <Markdown>{content}</Markdown>                            // chat 场景
 * <Markdown size="reading" cutCodeBlocks>{doc}</Markdown>    // 知识库场景
 * ```
 */

import * as React from "react";
import { ImageLightbox } from "../components/ui/ImageLightbox";
import { MdMarkdown, type MdRenderSize } from "./markdown/renderer";

export interface MarkdownProps {
  /** markdown 原文。 */
  children: string;
  /** 追加到外层容器的 className。 */
  className?: string;
  /** 渲染场景（决定正文字号）。默认 `chat`（14px）。 */
  size?: MdRenderSize;
  /**
   * 围栏代码块是否切成独立卡片。
   * 默认 `false`（chat 场景：围栏留在正文里，渲染成行内等宽 —— 安卓历史决定）。
   */
  cutCodeBlocks?: boolean;
  /**
   * 图片点击回调（**覆盖**内置的全屏预览）。
   *
   * - **不传（默认）** ⇒ 点缩略图打开**内置全屏预览**（原生 `<dialog>`，
   *   与 web / 安卓三端一致）；
   * - **传了** ⇒ 由调用方自己处理点击，**不渲染**内置 lightbox。
   */
  onImageClick?: (url: string) => void;
}

/**
 * markdown 原文 → DOM。
 *
 * 外层容器的 className 跟 web `src/components/Markdown.tsx:442-457` 同款
 * （`text-sm leading-relaxed text-fg break-words`）；**字号 / 行距由 `.md-root-*`
 * 接管**（`src/styles/globals.css` 末尾 M2 / M2' 段）。
 */
export function Markdown({
  children,
  className,
  size = "chat",
  cutCodeBlocks = false,
  onImageClick,
}: MarkdownProps) {
  // 图片全屏预览 —— web `Markdown.tsx:139-178` 同款：`MarkdownImage` 自持 lightbox 状态
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null);
  const handleImageClick = onImageClick ?? ((url: string) => setLightboxUrl(url));

  return (
    <div
      className={["text-sm leading-relaxed text-fg break-words", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      <MdMarkdown
        text={children ?? ""}
        size={size}
        cutCodeBlocks={cutCodeBlocks}
        onImageClick={handleImageClick}
      />
      {lightboxUrl ? (
        <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      ) : null}
    </div>
  );
}
