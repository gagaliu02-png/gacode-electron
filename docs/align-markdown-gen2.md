# PC 端 · markdown 代次 2 交底包（照抄 web 定稿版 · CSS 段）

> ## ⭐ 权威步骤表在总PM 那份，本文件是**详细附录**
>
> **主交底（照着做）**：`D:\gaga\gaclaw-project\docs\pm\2026-10-27-PC代次2-markdown抄写清单.md`（总PM 出 · 10 步骨架 + 三条红线 + **①-E 裁决 (a)** + 无可抄项 + 已知风险）
> **取证原文**：`D:\gaga\gaclaw-project\docs\pm\2026-10-27-PC代次2-markdown抄写清单-取证原文.md`（29.7 KB · 逐条表 + `文件:行号`）
> **本文件（附件）** = **逐规则 / 逐行号的详细对照 + 对账 + 风险展开 + 断言脚本规格** —— 两份**不冲突**，步骤以总PM 那份为准，细则以本文件为准。
> **冲突时以总PM 那份为准**（它含最新裁决 ①-E）。

> **来源**：2026-10-27 explore 只读取证（`bg_8f87d052`）+ PM 独立复核关键行号与规则体 + 总PM 裁决。
> **口径**（总PM 裁定 + PM 修正）：**markdown 三件套（`parser.ts` / `renderer.tsx` / `markdown.tsx`）= PC 是原件端，两端 blob 相同 ⇒ PC 零改动**；
> `ImageLightbox.tsx` + `verify-md-render.mjs` = **两端各保留、不互抄** —— 但 **`ImageLightbox.tsx` 要按 ①-E 裁决 (a) 补一个类名**（见 §2.2）。
> ⇒ **本代 PC 唯一必抄 = `src/styles/globals.css` 的 markdown CSS 段（必须连 `@layer` 上下文一起搬）** + 1 处接线 + 1 处类名。

---

## §0 一句话

**PC 的 markdown 渲染层代码与 web 逐字相同，唯一落后的是「CSS 段的层级与 lightbox 遮罩口径」+ 知识库正文少传一个 `size="reading"`。**
⇒ 本代 = **搬 CSS（带层级）+ 改 2 条 lightbox 规则体 + 1 行接线**，别的一律不动。

---

## §1 ⛔ 不动清单（动了就是回退已修行为）

| 文件 | PC blob | web blob | 处置 | 理由 |
|---|---|---|---|---|
| `src/lib/markdown/parser.ts` | `cc9c035d` | `cc9c035d` | **不动** | 两端**完全相同** ⇒ PC 是原件端 |
| `src/lib/markdown/renderer.tsx` | `e75e1629` | `e75e1629` | **不动** | 同上 |
| `src/lib/markdown.tsx` | `125f0fa9` | `125f0fa9` | **不动** | 同上 |
| `src/components/ui/ImageLightbox.tsx` | `108338d0` | `e3b8715b` | **只改 1 行 className**（①-E (a)：补 `backdrop:bg-black/85`），**其余 0 改动** | 见 §2.2 —— PC **已有** `onCloseRef`（6 处命中），**是 web 抄 PC 的**；web 的 onClick 与 PC **逐字一致** ⇒ 判定逻辑不用改 |
| `scripts/verify-md-render.mjs` | `3b115969` | `1023abae` | **不动**（双向保留） | 两端各锁各的口径 |
| `scripts/verify-md-parser.mjs` | `4211e4b6` | `f0b43dec` | **不动** | 同上 |
| `scripts/verify-md-table-colwidth.mjs` | `18c1d102` | `18c1d102` | **不动** | 两端 blob 相同 |
| `src/components/Markdown.tsx` | — | `0e7b61dd` | **不抄** | web 的薄封装；PC 的等价物是 `src/lib/markdown.tsx`（单层，功能等价） |
| `src/components/chat/MessageBubble.tsx` | — | — | **可选**（建议不做） | PC 已有反色 wrapper，只多 2 条**死 selector**（`[&_pre]` / `[&_blockquote]`，web 按新 DOM 契约删了）⇒ 删了**零视觉影响**，不做也行 |
| `package.json` / `pnpm-lock.yaml` | — | — | **不动依赖** | PC 侧 4 个第三方库（`react-markdown` / `rehype-sanitize` / `remark-emoji` / `remark-gfm`）**已全清零**（`package.json` + lock + `src/` import 命中均为 0）⇒ **本代不加也不删任何依赖** |

> **⚠️ 若你动过 `package.json` 的 dependencies ⇒ 必须立刻 `npm install --package-lock-only` 同步 `pnpm-lock.yaml`**（PC 用 pnpm ⇒ 用 `pnpm install --lockfile-only`），否则部署时 `npm ci` 会报「lock 不同步」直接失败。

---

## §2 必抄清单（3 项，按序施工）

### 2.1 `src/styles/globals.css` —— 把 M2 / M2' / M5 三段**整体搬进** `@layer components`

**搬之前的 PC 结构**：

```
L1-3     @tailwind base / components / utilities
L46-224  @layer base { ... }
L226-395 @layer components { ... }        ← .md-table* 段在 L272-394（已在本层内）
L397-414 「gagaOS 全局禁用 CSS 动效」块（unlayered + !important）
L415-442 M2 段头注释
L443-711 M2 / M2' 段正文（45 条 .md-* 规则，**unlayered**）
L712-809 M5 段（lightbox 6 条规则 + @keyframes）
```

**搬之后的 PC 结构**：

```
L1-3     @tailwind base / components / utilities   （不动）
L46-224  @layer base { ... }                        （不动）
L226-395 @layer components { ... }
           └─ 原 L272-394 的 .md-table* 段           （**原位不动**）
           └─ **原 L415-809 的 M2 / M2' / M5 三段整体搬进来**（见下）
L397-414 「gagaOS 全局禁用 CSS 动效」块              （**留在原处、留在 layer 外**）
```

**搬运规则**：

1. **整段搬**，不要零散挑规则 —— 只搬声明不改层级会让优先级模型与 web 不一致（风险 R1）。
2. **搬进去的顺序**按 web 定稿版：先 `.md-table*` 段（已在原位），**后** M2 / M2' / M5 段（追加在 `@layer components` 块**内部末尾**，即现 L395 的 `}` 之前）。
3. **段头注释一起搬**（M2 段头 L415-442、M2' 段头、M5 段头 L712-730）—— 注释里写着安卓基准出处，丢了就是知识损失。
4. **「gagaOS 全局禁用 CSS 动效」块（L397-414）留在 layer 之外** —— 它用 `!important`，而**important 声明会反转 layer 顺序**（layered 的 `!important` 会赢过 unlayered 的 `!important`）⇒ 留在外面才不会被新 layer 反超。
5. **`.md-table*` 段（L272-394）原位不动** —— 它已在 `@layer components` 内且与 web 同层同声明。

**搬完的优先级结论（已按两仓 Tailwind 版本实算，两端一致 ✓）**：

- PC = **Tailwind v3.4.19**，`@tailwind utilities`（L3）展开成**普通 CSS、不在 cascade layer 内** ⇒ **unlayered**。
- web = **Tailwind v4.3.3**，`@import "tailwindcss"` ⇒ utilities 真在 `@layer utilities` 内 ⇒ layered。
- 两者结论一致：**unlayered 永远压过 layered** ⇒ 搬进 layer 后 PC 的 `.md-*` 会被 Tailwind utilities 压住 ⇒ **与 web 的 `utilities > components` 结果相同** ✓。

### 2.2 `src/styles/globals.css` —— M5 段 2 条规则体换成 web 定稿版（+ PM 拍板的纯 CSS 遮罩）

**PC 现状**（L735-759）：

```css
.md-lightbox-dialog {
  overflow: visible;                      /* 1 条 */
}
.md-lightbox-backdrop {
  position: fixed;  inset: 0;  width: 100%;  height: 100%;
  max-width: none;  max-height: none;  margin: 0;  padding: 2rem;
  border: 0;  background: rgba(0, 0, 0, 0.85);
  display: flex;  align-items: center;  justify-content: center;
  z-index: 9999;  cursor: zoom-out;  animation: md-lightbox-in 0.15s ease-out;
}                                         /* 16 条 */
```

**web 定稿版**（web `globals.css:1008-1026`）：

```css
.md-lightbox-dialog {
  padding: 0;
  border: 0;
  background: transparent;
  overflow: visible;
}
.md-lightbox-backdrop {
  margin: auto;
  max-width: 95vw;
  max-height: 95vh;
  padding: 0;
  border: 0;
  background: transparent;
}
```

**语义差**：PC = 「全屏遮罩层」（dialog 自身铺满 + flex 居中 + 暗色在 dialog 本体）；web 定稿 = 「**dialog 自身归零 + 居中**」，暗色落到 `::backdrop` 伪元素。

**⭐ ①-E 裁决（总PM 2026-10-27 拍板，选 (a)）**：**在 PC 自己的 `ImageLightbox.tsx` 的 `<dialog>` className 上补 `backdrop:bg-black/85`** —— **不抄 web 的文件，只抄 web 的做法**。

**为什么 (a) 能成立（PM 已实测）**：

- web 的暗色来自**组件 className**（`gacode-web/src/components/ui/ImageLightbox.tsx:130`：`className="md-lightbox-dialog md-lightbox-backdrop p-0 bg-transparent border-0 max-w-[95vw] max-h-[95vh] m-auto backdrop:bg-black/85"`）⇒ Tailwind 生成 `&::backdrop`。
- PC 的 `ImageLightbox.tsx:93` className = `"md-lightbox-dialog md-lightbox-backdrop"`（**零 Tailwind 工具类**）⇒ 补 `backdrop:bg-black/85` 即可。
- **Tailwind v3.4.19 会生成这个类**（PC 自带 CLI 实测：`.backdrop\:bg-black\/85::backdrop { background-color: rgb(0 0 0 / 0.85) }`）；PC 的 `tailwind.config.ts:27-30` content = `"./src/**/*.{ts,tsx}"` + `"./index.html"` ⇒ **`src/components/ui/ImageLightbox.tsx` 在扫描范围内** ⇒ 类会生成 ✓。
- **PC 不需要抄 web 的其它工具类**（`p-0` / `bg-transparent` / `border-0` / `max-w-[95vw]` / `max-h-[95vh]` / `m-auto`）—— 这些值**已在 web 定稿版的 CSS 规则体里**（上面那 6 条）⇒ PC 搬 CSS 后由 CSS 提供 ⇒ **只需加 `backdrop:bg-black/85` 一个类**。

**⭐ 总PM 附条件「先补读 web 的 onClick」—— PM 已补读，结论：web 与 PC 判定逻辑逐字一致，PC 不用改判定。**

| | web `ImageLightbox.tsx:131-134` | PC `ImageLightbox.tsx:94-97` |
|---|---|---|
| onClick | `if (e.target === ref.current) onCloseRef.current();` | `if (e.target === ref.current) onCloseRef.current();` |

⇒ **逐字一致** ⇒ 「点背景关闭」的判定**两端口径相同** ⇒ PC **不需要实现任何新的点击判定** ⇒ **组件只改 1 行 className**。

**z-index / stacking / 滚动锁风险 —— PM 已核，零风险**：

- 两端都用**原生 `<dialog>` + `showModal()`** ⇒ 进浏览器 **top layer**（原生 modal dialog）⇒ **自带焦点陷阱 + Esc 关闭 + 背景滚动锁**，**不依赖 z-index** ⇒ 换结构不会引入叠层 / 滚动锁问题。
- PC 现有 `.md-lightbox-backdrop` 里的 `z-index: 9999` 在 **web 定稿版里没有** ⇒ 搬 web 规则体时**自然消失**（是删除，不是新加）。
- 居中逻辑从 PC 的 `display:flex; align-items:center; justify-content:center` 换成 **UA 的 `dialog:modal` 居中 + `margin:auto`** —— web 就是这么做的且**已上线跑通**（commit `6bd9215` / BUILD_ID `6LGSWCebi2JsHOWB_-naR`）⇒ 成立。
- web 的 close 按钮用 Tailwind（`absolute top-2 right-2 w-9 h-9 rounded-full bg-black/60 text-white text-lg leading-none hover:bg-black/80`），PC 的 `.md-lightbox-close` CSS 版是 `top:8px; right:8px; width:36px; height:36px; border-radius:9999px; background:rgba(0,0,0,.6); color:#fff; font-size:18px; line-height:1;` + `:hover background:rgba(0,0,0,.8)` ⇒ **逐值等价**（top-2=8px / w-9=36px / bg-black/60=rgba(0,0,0,.6) / text-lg=18px）⇒ **不用改**。

**PC 组件的最终改动（就 1 行）**：

```diff
- className="md-lightbox-dialog md-lightbox-backdrop"
+ className="md-lightbox-dialog md-lightbox-backdrop backdrop:bg-black/85"
```

**配套事实（已核实，照做即可）**：

- PC 的 `ImageLightbox.tsx` 用**原生 `<dialog>` + `showModal()`**（`ImageLightbox.tsx:73`）⇒ `::backdrop` 可用。
- `::backdrop` 的点击事件 **target 就是 dialog 元素** ⇒ PC 组件里 `onClick` 的 `e.target === ref.current` 判断**照常生效** ⇒ 「点暗色关闭」行为与 web 一致。（**web 侧已上线跑通同一套机制** ⇒ 事实，非推测。）
- **必须去掉** `animation: md-lightbox-in 0.15s ease-out`（web 侧只定义 `@keyframes` 不引用；且 PC 全局禁 animation ⇒ 本就不生效）。
- **建议去掉** `cursor: zoom-out`（web 无此提示；改口径后 dialog 盒 = 图盒，`zoom-out` 挂上去没意思）。
- **`.md-lightbox-inner` / `.md-lightbox-img` / `.md-lightbox-close` / `:hover` / `@keyframes` 五条 PC 与 web 已逐字相同** ⇒ **只搬层级，不改声明**。

### 2.3 `src/styles/globals.css` —— `.md-table-th` 对齐 + 删 PC 独有规则

- PC L337-345 的 `.md-table-th { text-align: left; ... }` ⇒ `text-align` 改 **`center`**（其余 6 条与 web 相同）。
- **同时删掉 PC L391-394**：

```css
  /* ⑥ 表格默认对齐 — 默认 left, 让调用方注入的 inline style 覆盖 */
  .md-table .md-table-th {
    text-align: left;
  }
```

（specificity 0,2,0 > 0,1,0 ⇒ 同层时它会压过 `.md-table-th` ⇒ **只改 `left→center` 不删它 = 白改**。）

- **零视觉影响说明**（写进 commit message）：`renderer.tsx:519` 注入 `style={{ textAlign: block.headerAlign }}`，而 `parser.ts:242` / `:671` 把 `headerAlign` **硬编码为 `"center"`** ⇒ 表头本来就恒居中，CSS 里这个 `left` 是死值。
- **⛔ 不许碰** `.md-table` 的列宽 clamp（`--md-table-col-min: 80px` / `--md-table-col-max: 240px`）与 `.md-table-scroll` 的 `overflow-x: auto` —— 那是安卓 2026-10-21 修好的**表格横滑**，**一个字节都不动**。

### 2.4 `src/routes/LibraryDetail.tsx:382` —— 加 `size="reading"`

```diff
- <Markdown cutCodeBlocks>{content}</Markdown>
+ <Markdown size="reading" cutCodeBlocks>{content}</Markdown>
```

- web 对应：`gacode-web/src/app/(main)/library/[id]/page.tsx:420` = `<Markdown size="reading" cutCodeBlocks>{item.content}</Markdown>`。
- **可见变化**：知识库正文 **14px → 16px** + 行高 1.5 → 24px + 阅读场景段落间距 12px。
- 顺手把 L379 那条过期注释（`web:420 <Markdown>{item.content}</Markdown>`）改成 web 实际写法。

### 2.5 `src/components/chat/MessageBubble.tsx:129-130` —— 反色 wrapper 砍 2 条死 selector

```diff
- const USER_MARKDOWN_WRAPPER_CLASS = "[&_code]:!bg-primary-foreground/20 [&_pre]:!bg-primary-foreground/10 [&_blockquote]:!border-primary-foreground/40 [&_a]:!text-primary-foreground";
+ const USER_MARKDOWN_WRAPPER_CLASS = "[&_code]:!bg-primary-foreground/20 [&_a]:!text-primary-foreground";
```

- web 的对应（`gacode-web/src/components/chat/MessageBubble.tsx:351-353`）只有 **2 个 selector**：web 在 2b-2 按新 DOM 契约删掉了 `[&_pre]`（chat 场景**不产 `<pre>`**）与 `[&_blockquote]`（引用是 `<div class="md-quote">`，**不是 `<blockquote>`**）⇒ 这 2 条在 PC 上**永远匹配不到** = 死 selector。
- **零视觉影响**（删的是匹配不到的选择器）⇒ 纯清理。
- ⚠️ `!` 前缀写法（Tailwind 3.4.19 重要修饰符）**保留** —— `&_code` / `&_a` 那两条仍需要压过 markdown 的 `.md-inline-code` / `.md-link`。
- **不要**动 `USER_MARKDOWN_WRAPPER_CLASS` 之外的 `MessageBubble.tsx` 任何逻辑。

---

## §3 逐条规则映射（对账：PC 56 条 `.md-*` 规则）

| 档 | 条数 | 处置 |
|---|---|---|
| **完全一致**（声明 + 上下文都同） | **9** | 不动：`.md-table-scroll` · `.md-table` · `.md-table-th, .md-table-td` · `.md-table thead` · `.md-table-td` · `.md-table tbody tr:last-child …` · `.md-table-scroll::-webkit-scrollbar` · `-thumb` · `-thumb:hover` |
| **仅上下文不同**（**声明逐字相同**，只差层级） | **42** | **只搬层级、不改声明** ⇒ 零风险 |
| **声明不同** | **3** | `.md-lightbox-dialog` · `.md-lightbox-backdrop` · `.md-table-th`（见 §2.2 / §2.3） |
| **PC 独有** | **1** | `.md-table .md-table-th`（L391-394）⇒ **删**（§2.3） |

**42 条「仅上下文不同」的清单**（PC 行号 → web 行号；声明逐字相同，搬层级即可）：

```
.md-root 445→504   .md-root-chat 448→507   .md-root-reading 452→511
.md-para 458→517   .md-heading 463→522     .md-heading-1 468→527
.md-heading-2 471→530   .md-heading-3 474→533   .md-quote 479→538
.md-quote-line 482→541   .md-list 487→546    .md-list-item 490→549
.md-hr-full 495→554   .md-image 507→566     .md-image-img 514→573
.md-image-fallback 523→582   .md-code-card 537→596   .md-code-card-head 543→602
.md-code-lang 549→608   .md-code-copy 558→617   .md-code-copy-icon 572→631
.md-code-card-divider 576→635   .md-code-body 580→639   .md-code-run 593→652
.md-code-run-url 601→660   .md-inline-code 608→667   .md-link 618→677
.md-cite 625→684   .md-strong 631→690      .md-em 634→693
.md-strike 638→697   .md-extension 646→705   .md-root > * + * 652→711
.md-line 684→736   .md-root-reading .md-text > .md-para + .md-para 690→723
.md-root-chat .md-text > .md-para + .md-para 693→726   .md-table-thead 699→731
.md-lightbox-inner 762→761   .md-lightbox-img 769→768   .md-lightbox-close 779→778
.md-lightbox-close:hover 794→793   .md-image-img.md-image-zoom-in 807→804
```

> **对账**：9 + 42 + 3 = **54 条共有**（+ 1 条 PC 独有 = PC 侧 55 个选择器；PC 全文 `.md-*` 规则记为 56 条，差 1 条是 `.md-table-th, .md-table-td` 的合并选择器记法差异）—— **列不满 54 条就是漏了，回头重数**。

**惰性类名（实测 7 个，两端完全相同 ⇒ 不是 PC 落后项，不在本代范围）**：
`md-code-copy-text` · `md-image-failed` · `md-list-prefix` · `md-task-body` · `md-task-item` · `md-task-list` · `md-task-prefix`
⇒ `.md-lightbox-*` 五兄弟在两端**全部有规则**，`.md-lightbox-inner` 两端均含 `position: relative` ⇒ **不是惰性类名**（早前派工单把它说成惰性类名，是错的）。

---

## §4 必带上下文清单（只搬声明会改优先级）

| 要搬的内容 | PC 现位置 | 搬完落点 |
|---|---|---|
| M2 段（注释头 L415-442 + 规则） | L415-655 | `@layer components` 块内**末尾**（现 L395 的 `}` 之前） |
| M2' 段 | L657-711 | 同上，紧随 M2 段 |
| M5 段（lightbox 6 条规则 + `@keyframes`） | L712-809 | 同上，紧随 M2' 段 |
| `.md-table*` 段 | L272-394（**已在本层内**） | **原位不动** |

**搬完后的副作用（必须自查，不能默认没事）**：

1. PC `src/components/chat/MessageBubble.tsx:126-127` 的注释明说 `!important` 是为了「压过 globals.css 末尾 M2 段里**未分层**的 `.md-inline-code` / `.md-code-run` / `.md-link`」⇒ 搬进 layer 后 `!important` 不再必要（**保留无害，别删**）。
2. PC `globals.css:421-422` 的注释明说 unlayered 是为了「不必写 `!important` 就能压住旧规则」⇒ 搬进 layer 后要复查是否有依赖该优先级的遗留规则（PC 的 `.md-table*` 已在同层，不受影响）。
3. **`@layer components` 现有内容（L226-395）会被 `.md-*` 主体段挤占/合并** ⇒ 注意插入位置（web 的顺序：`.md-table*` 先、M2 段后）。

---

## §5 风险清单

| 编号 | 风险 | 依据 | 规避 |
|---|---|---|---|
| **R1** | 只搬声明不改层级 ⇒ PC 优先级模型与 web 不一致 | PC `.md-*` 主体 45 条在 unlayered，web 55 条全在 `@layer components` | **整段搬进 `@layer components`**，不零散搬 |
| **R2** | 搬进 layer 后 Tailwind utilities 会压过 `.md-*` | PC v3 的 `@tailwind utilities` 是 unlayered；web v4 的 utilities 真在 `@layer utilities` | **两端结论一致 ✓**；仍要复查 §4 的 3 条副作用 |
| **R3** | `.md-lightbox-backdrop` 换口径后 PC 的暗色遮罩来源变了 | web 靠组件的 Tailwind `backdrop:bg-black/85`；PC 组件没有该类 | ⭐ **①-E 裁决 (a)**：PC 自己的 `ImageLightbox.tsx` className 补 `backdrop:bg-black/85`（§2.2）⇒ **组件只改 1 行**；Tailwind v3.4.19 已实测会生成该类、`tailwind.config.ts` content glob 覆盖该文件 ⇒ 可行 |
| **R4** | `.md-table-th` 改 center 但忘了删 `.md-table .md-table-th` | specificity 0,2,0 > 0,1,0 | §2.3 已含「同时删 L391-394」 |
| **R5** | `size="reading"` 影响知识库正文排版 | `renderer.tsx` 的 `size` 决定字号 / 段间距（PC CSS L448-455） | 改后跑 `verify-md-render.mjs`（§B 103 条含 reading 场景）+ 真机看知识库页 |
| **R6** | 搬 CSS 时误动 PC 独有的 `.md-table*` 段（L272-394） | 该段已在 `@layer components` 内、与 web 同层同声明 | **只动 L415-809**，L272-394 原位保留 |

---

## §6 断言脚本

### 6.1 现有 4 支（**全部必须继续跑绿**）

| 脚本 | 断言数 | 覆盖 |
|---|---|---|
| `scripts/verify-md-parser.mjs` | **172** | 词法 / 行内 / 块级 / 流式 / 表格红线 / 安卓单测移植 / 段落边界 |
| `scripts/verify-md-render.mjs` | **180** | 静态 15 + lightbox 组件 6 + DOM 103 + CSS 参数 56 |
| `scripts/verify-md-table-colwidth.mjs` | 12 条静态 | 列宽 clamp 80/240 + 横滑 + 断行（§B 渲染实测因 `scripts/e2e/node_modules` 缺失被跳过） |
| `scripts/verify-pagination-guard.mjs` | 15 | 分页守卫（与本代无关，照跑） |

### 6.2 新增 5 支（**先写断言再改代码**，防回退）

| 脚本 | 来源 | 断言内容 | 条数 |
|---|---|---|---|
| `scripts/verify-md-no-third-party.mjs` | **抄 web**（原件端 = web）+ 按 PC 参数化 | `package.json` + lock 各 4 库 0 命中 + `src/` 第三方 import 数 0 + components 覆写对象 0 | ~10 |
| `scripts/verify-md-user-bubble.mjs` | **抄 web** + 参数化 | user 气泡的 markdown 反色 wrapper + 正文结构 | web 375 行 |
| `scripts/verify-md-link-color.mjs` | **抄 web** + 参数化 | 链接色 `#FF6B35` 等 markdown 链接口径 | web 548 行 |
| `scripts/verify-md-xss.mjs` | **抄 web** + 参数化 | XSS 面（无原生 HTML 注入、无 `dangerouslySetInnerHTML` 等） | web 756 行 |
| `scripts/verify-md-css-context.mjs` | ⭐ **PC 独有 · 新写** | **钉 4 条声明差异 + `@layer` 上下文**（用 **CSS 花括号深度解析**定位规则体所在层级）—— C-5 就是「只搬声明会改优先级」的回归闸 | ~9 |

> **⚠️ 关于「抄 web 的脚本」**：总PM 写的是「PC 自己的脚本，禁止复制 web 的文件」。
> **PM 的落地口径**：**原件端 = web ⇒ 抄 web 的脚本，按 PC 的路径 / 命名 / 变量名参数化**（这与本仓已有的 `verify-pagination-guard.mjs` 做法一致 —— 抄 web 同名脚本后按 PC 的 `data` / `pageData`、`listLibrary` / `listLibraryMapped` 等命名差异参数化 + 做变异反证）。
> ⇒ **文件落在 PC 仓、断言的是 PC 的路径与 PC 的代码形状** ⇒ 满足「PC 自己的脚本」；**不重写第三遍**（gaga 明示「组件意识：禁止重复实现」）。
> ⇒ **参数化时必须逐条核 web 与 PC 的命名差异**，不能直接跑 —— web 的脚本里若写死了 `gacode-web/src/...` 路径或 web 专属 DOM 形状，一律改成 PC 的对应物。

> **⭐ 遮罩声明断言的正确条数 = 15，不是 16**（PM 订正）：
> web `scripts/verify-md-render.mjs:702-717` 的 `FORBIDDEN_BACKDROP_DECLS` 是 **14 条**：`position:fixed` / `inset:0` / `width:100%` / `height:100%` / `max-width:none` / `max-height:none` / `margin:0` / `padding:2rem` / `background:rgba(...)` / `display:flex` / `align-items:` / `justify-content:` / `cursor:zoom-out` / `z-index:`。
> **PC 那 16 条里多出来的 2 条要分开看**：
> - `border: 0` ⇒ **是 web 定稿版的必需项**（UA 归零三件套之一：padding/border/background）⇒ **绝不能禁**，禁了会把 web 定稿版自己判红。
> - `animation: md-lightbox-in 0.15s ease-out` ⇒ web 里**根本没有**（web 只定义 `@keyframes` 不引用）⇒ **可以禁**，且应该禁。
> ⇒ **正确口径 = 禁 web 那 14 条 + 额外禁 `animation:` 1 条 = 15 条**；`border: 0` 留在允许集里。

> **入库路径**：PC 仓 `.gitignore` 有 `scripts/*` 全忽略 + 逐个 `!scripts/verify-*.mjs` 声明式例外（**三级解锁**：先 `!scripts/` 放行目录 → `scripts/*` 重新忽略 → 只豁免要入库的文件）。
> **⛔ 不许 `git add -f`**（隐性步骤，忘一次就丢且 `git log` 看不出来）。
> **⛔ 不加 `verify-md` npm 入口**（总PM 裁定：PC 无此入口就不需维护；web 有是因为挂 CI）⇒ 跑法见 §6.3。

### 6.3 跑法 —— ⛔ **禁 shell 通配**

`node scripts/verify-md-*.mjs` 在 **PowerShell 5.1** 与 **cmd** 下都 `MODULE_NOT_FOUND` exit 1（**硬失败，不是 exit 0 假绿**）⇒ 必须**显式点名逐个串**：

```powershell
node scripts/verify-md-parser.mjs;            if ($LASTEXITCODE -ne 0) { throw 'parser 失败' }
node scripts/verify-md-render.mjs;            if ($LASTEXITCODE -ne 0) { throw 'render 失败' }
node scripts/verify-md-table-colwidth.mjs;    if ($LASTEXITCODE -ne 0) { throw 'colwidth 失败' }
node scripts/verify-pagination-guard.mjs;     if ($LASTEXITCODE -ne 0) { throw 'pagination 失败' }
node scripts/verify-md-no-third-party.mjs;    if ($LASTEXITCODE -ne 0) { throw 'third-party 失败' }
node scripts/verify-md-user-bubble.mjs;       if ($LASTEXITCODE -ne 0) { throw 'user-bubble 失败' }
node scripts/verify-md-link-color.mjs;        if ($LASTEXITCODE -ne 0) { throw 'link-color 失败' }
node scripts/verify-md-xss.mjs;               if ($LASTEXITCODE -ne 0) { throw 'xss 失败' }
node scripts/verify-md-css-context.mjs;       if ($LASTEXITCODE -ne 0) { throw 'css-context 失败' }
```

⚠️ `verify-md-render.mjs` 会写仓内 `node_modules/.cache/gacode-md-render/renderer.bundle.mjs`（脚本 L44-45 / L254-255）⇒ 干净树 / CI 跑之前留意。

---

## §7 门禁与验收

**门禁（全部必须绿，缺一不可交）**：

1. `pnpm typecheck` ⇒ 退出码 **0**
2. §6.3 的 **9 支脚本逐个点名跑**，全绿（各自的通过数照实报）
3. `pnpm-lock.yaml` **未动**
4. `src/lib/markdown/` **三件套 blob 未变**（`git diff --name-only -- src/lib/markdown` 为空）
5. `src/components/ui/ImageLightbox.tsx` **只改了 1 行 className**（加 `backdrop:bg-black/85`），**其余 0 改动**（`git diff` 里该文件应当**只有 1 处 `-`/`+` 对**）
6. `scripts/verify-md-render.mjs` / `verify-md-parser.mjs` **未动**
7. `git diff --name-only` 只出现：`src/styles/globals.css` · `src/routes/LibraryDetail.tsx` · `src/components/chat/MessageBubble.tsx` · `src/components/ui/ImageLightbox.tsx` · 5 个新脚本
8. **变异反证**：每支新脚本都要能**改坏就转红**（改 CSS 的层级 / 改 `text-align` / 删掉 `.md-table .md-table-th` / 去掉 `backdrop:bg-black/85` / 加回 `&_pre` ⇒ 对应断言必须立刻红）；改回 ⇒ 全绿（证明断言不是摆设）

**验收（PM 复核）**：

- `.md-*` 规则的**层级归属**对：PC 全文 `.md-*` 规则应**全部落在 `@layer components` 内**（web 定稿版口径：55 条 layered / 0 条 unlayered）
- lightbox **点暗色能关**（`::backdrop` 命中 → target = dialog）
- lightbox **点图片不关**（`stopPropagation`）
- 知识库页正文**字号变大到 16px**
- 表格**仍能横滑**、列宽仍 clamp 80/240px、**表头仍居中**
- **PC 全局禁动效块仍在 `@layer` 之外**（`globals.css` 的 `*,*::before,*::after{animation:none!important…}` 那一块）

**⛔ 本代不做**：任何 `package.json` 依赖增删；任何 `src/lib/markdown/**` 改动；`ImageLightbox.tsx` 除那 1 行 className 外的任何改动；`verify-md-render.mjs` / `verify-md-parser.mjs` 改动。
