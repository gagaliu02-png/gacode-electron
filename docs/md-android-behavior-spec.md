# PC 端 Markdown 渲染 —— 安卓基准行为规格

> **本文档 = PC 端自研 Markdown 解析层的唯一行为依据。**
>
> - **基准端**：安卓 `yinian-android/app/src/main/java/com/yinian/app/ui/markdown/`（5 个文件）。
>   gaga 2026-10-26 拍板「**全都要自研，我们要全栈自研**」⇒ 三端不再用
>   `react-markdown` / `remark-gfm` / `remark-emoji` / `rehype-sanitize`，
>   **统一以安卓实现为行为基准**，PC 端自研一套。
> - **本文档只写「可观测行为」**，不写实现方案（实现见 `src/lib/markdown/parser.ts`）。
> - 每条规格都带**安卓 file:line**，可逐条回查。
> - **契约关系**：《Markdown Profile 跨端渲染契约》v1.1（`gaclaw/docs/design/markdown-profile-cross-platform.md`）
>   是三端**契约**（A/B/C 三类条款 + 表格红线 R1–R5 + §4.6 不得回退条款）。
>   本文档是**安卓 → PC 的实现级对照**，两者冲突时：
>   - **A 类（必须一致）/ 红线** → 契约优先；
>   - **B/C 类（允许差异 / 明确不支持）** → 本文档按安卓源码逐条落地，并在 §9 标注差异。

---

## PM 口径变更（2026-10-26 拍板）—— 9 条硬口径 + 差异方向

> gaga 2026-10-26 拍板：**三端完全统一到安卓基准**，「分层 / 保留交互」选项被否。
> 下列 9 条是**逐条照抄安卓**的硬口径，**包括看起来"不优雅"的部分**。
>
> **差异方向图例**：
> - 🔴 **PC 要删** —— PC/web 现有行为与安卓不一致，且该能力在安卓**明确不支持**，PC 必须去掉；
> - 🟡 **PC 要改** —— PC 现有行为与安卓不一致，要改成安卓的行为；
> - 🟢 **三端已一致不动** —— 已统一，任何情况下不许动（**不得回退**）。

| # | 硬口径 | 安卓证据（file:line） | PC/web 现状（file:line） | 差异方向 |
|---|---|---|---|---|
| **1** | **H4–H6 不产出 heading 节点** —— 只判 `startsWith("### ")` / `"## "` / `"# "`；`#### 标题` 落 else 分支，**原样显示，井号保留** | `MarkdownParser.kt:394-403`（三条 `startsWith`）、`:438`（else → `renderInlineLine(this, line, ...)`） | **已切自研管线** —— 解析层 `src/lib/markdown/parser.ts`（AST 只允许 `level: 1 \| 2 \| 3`；H4-H6 落 else 分支当普通文本，井号保留）+ 渲染层 `src/lib/markdown/renderer.tsx:135`（`HEADING_TAG` 只有 1/2/3 → 只出 `h1/h2/h3`）；`src/lib/markdown.tsx` 只是薄封装（透传 `size` / `cutCodeBlocks`） | 🟢 **已落地**（M3 批 commit `b29207f`）—— AST 只允许 `level: 1 \| 2 \| 3`；H4-H6 降级为 paragraph 文本（井号保留） |
| **2** | **嵌套列表不产出层级结构** —— 无序只认 `startsWith("- ")` / `"* "`、有序只认 `^\d+\.\s`，两者都**锚定行首** ⇒ 缩进子项（`  - sub`）落 else 分支，**缩进 + 横杠都保留** | `MarkdownParser.kt:405`（`Regex("""^\d+\.\s""")`）、`:415`（`startsWith("- ") \|\| startsWith("* ")`）、`:438` | **已切自研管线** —— 解析层 `src/lib/markdown/parser.ts` 的 list item **无 children / 无层级字段**；渲染层 `src/lib/markdown/renderer.tsx:338-372` **不造原生 `<ul>/<ol>`**（列表前缀是文本） | 🟢 **已落地**（M3 批 commit `b29207f`）—— 缩进子项 = 普通 paragraph 文本 |
| **3** | **task-list 是例外：允许前导空白** —— `^[\s]*[-*]\s\[([xX ])\]\s+(.+)`，且在 `when {}` 之外先判（与 BQ 同为 `?.let { ... return@forEachIndexed }`）⇒ 缩进的 `- [ ] xxx` **要**识别成 task-list（**普通列表缩进不识别、task-list 缩进识别** —— 安卓的不对称） | `MarkdownParser.kt:453`（正则）、`:356-373`（先判 + 早退）、`:382-385`（与 BQ 同样写在 `when` 之外的原因） | PC 现走 remark-gfm ⇒ 缩进 task-list 会渲染成嵌套列表里的 checkbox | 🟡 **PC 要改** —— 照抄安卓的不对称：普通列表严格锚定行首，task-list 允许前导空白 |
| **4** | **行内图不识别** —— `IMAGE_LINE_REGEX` 要求**整行只有图片**；`renderInlineLine` 只处理 bold/em/del/code/link/cite，**不处理 image** ⇒ 段落中间的图片原样显示 `![alt](url)` 字面文本 | `MarkdownParser.kt:976`（正则）、`:956-963`（整行必须被吃完）、`:536-545`（`renderInlineLine` 的分支清单，**无 image 分支**） | PC 现走 react-markdown ⇒ **行内图渲染成 `<img>`** | 🔴 **PC 要删** —— AST **不产出 inline image 节点**；图片只在「独占一行」时产出图片块节点 |
| **5** | **不做语法高亮、不转 emoji 短码** —— 代码块正文原样输出（「不加 link 样式、不改字符、不动换行」）；`:smile:` 原样显示 | `MarkdownParser.kt:468-479`（`appendCodeRun` 的三条克制）、`:481-500`（原样 append） | **已切自研管线** —— 6 个第三方包（`react-markdown` / `remark-gfm` / `remark-emoji` / `rehype-highlight` / `rehype-sanitize` / `highlight.js`）已从 `package.json` 摘除（M3 批 commit `b29207f`）；`src/lib/markdown.tsx` 不再挂任何 remark / rehype 插件；渲染层 `src/lib/markdown/renderer.tsx:276-282` 的代码正文**原样输出** | 🟢 **已落地**（M3 批 commit `b29207f`）—— AST 无高亮 token、无 emoji 节点；代码块正文与 emoji 短码**原样输出** |
| **6** | **引用** —— `^(>+\s+)(.*)`：`>` 后**至少 1 个空白**，否则回退普通文本；层数 = `>` 个数；每层 prepend **2 个空格**；**无左边框、无色阶** | `MarkdownParser.kt:465`（正则）、`:460-463`（`>` 后必须空白，否则回退普通文本更安全）、`:386`（层数 = `>` 个数）、`:388`（`append("  ".repeat(level))`）、`:380`（注释：**「4 层及以上回落第 3 层视觉」**） | **已切自研管线** —— 渲染层 `src/lib/markdown/renderer.tsx:316-327` 出 `.md-quote` / `.md-quote-line`（**无左边框 / 无色阶 / 无整行斜体**），缩进走 AST 的 `prefix`（每层 2 空格）；旧的 `.md-bq` 3 色左边框死规则已从 `src/styles/globals.css` 删除（M4 收口批） | 🟢 **已落地**（M3 批 commit `b29207f`）—— 左边框 / 色阶已删；缩进改为每层 **2 个空格**（走 AST 的 `prefix`，不用 CSS 缩进） |
| **7** | **列表前缀是文本，不是标签** —— 无序 `"  • "`（2 空格 + 圆点 + 空格）、有序 `"  N. "`（2 空格 + 序号 + 点 + 空格） | `MarkdownParser.kt:416`（`append("  • ")`）、`:408`（`append("  ${n}. ")`） | **已切自研管线** —— 渲染层 `src/lib/markdown/renderer.tsx:362-371` **不造原生 `<ul>/<ol>`**；无序 `"  • "` / 有序 `"  N. "` 由 AST 的 `prefix` 文本提供（`.md-list-prefix`） | 🟢 **已落地**（M3 批 commit `b29207f`）—— 原生标签已删，改成 AST 的 `prefix` 文本前缀 |
| **8** | **已一致不回退的 5 项**（三端已统一，**任何情况下不动**） | 见下方 §0.1 表 | 见下方 §0.1 表 | 🟢 **三端已一致不动** |
| **9** | **流式半截表格** —— 半截表格先当文本，**分隔行到齐才升级成表格块**；PC 需要有对应的**升级判定入口**（纯函数 + 明确的重解析入口） | `MarkdownParser.kt:1010-1083`（`splitBlocksCore`）、`:1051-1055`（升级判定：表头行 + 第二行是分隔行）、`:1056-1074`（升级 + 表体收集）、`:1004-1005`（流式约束原文） | **已切自研管线** —— 解析层 `src/lib/markdown/parser.ts:722`（`detectTableUpgrade(lines)` 纯函数）+ `:1177`（`parseMarkdown` 纯函数）：分隔行到齐才升级成 table 块，调用方对累积文本重跑即可自动升级 | 🟢 **已落地**（M3 批 commit `b29207f`）—— parser 提供 `detectTableUpgrade(lines)` 纯函数 + `parseMarkdown` 纯函数（调用方对累积文本重解析即可自动升级） |

### §0.1 已一致不回退的 5 项（🟢 三端已一致不动）

| 项 | 安卓证据 | PC 现状证据 | 状态 |
|---|---|---|---|
| 表格列宽 clamp **min 80px / max 240px** | `MarkdownTableCard.kt:46`（`ColumnWidthMin = 80.dp`）、`:53`（`ColumnWidthMax = 240.dp`）、`:475-485`（`clampColumnWidths`）、`:227-231`（调用点） | `src/styles/globals.css:311-312`（`--md-table-col-min: 80px` / `--md-table-col-max: 240px`）、`:316-320`（`.md-table-th, .md-table-td { min-width; max-width }`） | 🟢 已一致 |
| 表格**横向滚动** | `MarkdownTableCard.kt:118`（共享 `rememberScrollState()`）、`:252`（表头）、`:285`（表体） | `src/styles/globals.css:267-274`（`.md-table-scroll { overflow-x: auto }`）、`:280`（`.md-table { width: max-content }`） | 🟢 已一致 |
| 链接色 **`#FF6B35`** | `MarkdownParser.kt:71-82`（`MdStyles.Dark.link` = `Color(0xFFFF6B35)`，v4.1.48 / 契约 DEC-9） | `src/styles/globals.css:49`（`--brand: #FF6B35`）、`src/lib/markdown/renderer.tsx:261`（`.md-link`）、`src/styles/globals.css:618-622`（`.md-link { color: var(--brand) }`） | 🟢 已一致 |
| 代码**前景色** | `MarkdownParser.kt:69`（`MdStyles.Dark.code.color = Color(0xFFE5e7eb)`） | `src/styles/globals.css:67`（`--fg: #e5e7eb`）、`src/lib/markdown/renderer.tsx:252`（`.md-inline-code`）、`src/styles/globals.css:608-615`（`.md-inline-code { color: var(--fg) }`） | 🟢 已一致 |
| 表头 **2px 下边框** | `MarkdownTableCard.kt:270-274`（`HorizontalDivider(thickness = 2.dp, color = outline)`） | `src/styles/globals.css:334`（`.md-table-th { border-bottom: 2px solid var(--border-strong) }`） | 🟢 已一致 |

> ⚠️ **「不得回退」提醒（契约 §4.6）**：上表 5 项在 M2/M3 接线时**不许**因为「安卓没有 CSS」而改掉。
> 例如 🔴「PC 要删」的 `.md-bq` 左边框/色阶、🔴「PC 要删」的 `.md-table-td-clamp`（6 行折叠），
> 都**不影响**上表 5 项。

---

## 0. 基准文件索引

| 文件 | 行数 | 职责 | 本规格引用 |
|---|---|---|---|
| `MarkdownParser.kt` | 1084 | **语法核心**：样式表 + 正则 + 各语法分支 + 块级切分 | §1–§6 |
| `MarkdownRichText.kt` | 317 | 渲染层 + 主题化（`rememberMdStyles`） | §7、§8 |
| `MarkdownTableCard.kt` | 486 | 表格卡片：列宽 clamp / 横滑 / 表头居中 | §5 |
| `MarkdownCodeBlock.kt` | 160 | 代码块卡片（语言徽章 + 复制按钮） | §6.3 |
| `MarkdownImageBlock.kt` | 83 | 块级图片（占位固定尺寸） | §7 |

---

## 1. 词法层

### 1.1 标题 —— 只支持 H1 / H2 / H3

| 行为 | 规格 | 安卓出处 |
|---|---|---|
| H1 | `# ` 前缀 → 22sp / `FontWeight.Bold` / SansSerif | `MarkdownParser.kt:401-403`、`MarkdownParser.kt:47` |
| H2 | `## ` 前缀 → 20sp / `FontWeight.Bold` | `MarkdownParser.kt:398-400`、`MarkdownParser.kt:48` |
| H3 | `### ` 前缀 → 18sp / `FontWeight.Bold` | `MarkdownParser.kt:395-397`、`MarkdownParser.kt:49` |
| **H4–H6 不支持** | `#### x` / `##### x` / `###### x` **不识别为标题**，走普通段分支，**原文里的 `#` 保留** | `MarkdownParser.kt:394-438`（`when` 分支只认 `### ` / `## ` / `# `）；契约 C4 |
| 前缀必须带空格 | `#Title` / `##Title` **不是**标题（`startsWith("# ")` 要求空格） | `MarkdownParser.kt:395`/`:398`/`:401` |
| 空标题 | `# ` 后面为空 ⇒ 标题内容为空串 | 同上 |
| **标题内不做行内解析** | `# **粗**` 渲染成字面量 `**粗**`（星号可见）—— 安卓 `append(line.removePrefix("# "))` 是**原样 append**，不走 `renderInlineLine` | `MarkdownParser.kt:396`/`:399`/`:402`（对比 `:409`/`:419` 列表分支有 `renderInlineLine`） |

> ⚠️ **PC 落地注意**：标题内容的行内解析缺失是安卓现状（见 §9-D1）。PC 端 AST 用 `text` 节点表达标题内容，
> 渲染层**不得**自作主张给标题加行内解析，否则与安卓不一致。

### 1.2 段落与换行

| 行为 | 规格 | 安卓出处 |
|---|---|---|
| **单 `\n` 即硬换行** | 每一行都是独立的一行，行尾补 `\n`（最后一行不补） | `MarkdownParser.kt:440`（`if (idx < lines.size - 1) append("\n")`）、`:342`（围栏行同样补 `\n`） |
| **空行被吃掉** | 空行是**段落边界**，**本身不产生任何行、任何渲染**（只留边界） | `MarkdownParser.kt:896-899`（`splitParagraphs`：按 `(?:空行){2,}` 切 + trim + 过滤空段）、`MarkdownRichText.kt:277-284` |
| 段落 = **连续的非空行** | 段内的行**不再被拆开**（列表项的续行不能被拆开） | `MarkdownParser.kt:896-899`（段内换行保留） |
| 段落之间**有**间距 | 段落与段落之间的间距由 UI 层的 `paragraphSpacing` 表达（**阅读 12dp** / **chat = 1 个空行**） | `MarkdownRichText.kt:162`（默认 `0.dp`）、`:282`（`spacedBy(paragraphSpacing)`）、`LibraryDetailScreen.kt:332`（阅读场景 `12.dp`） |
| 段内行之间**无额外间距** | 同一段里的行只靠 line-height 拉开 | `MarkdownParser.kt:440`（行尾补 `\n`，无额外间距） |
| ⚠️ **trim 的取舍（B 类差异）** | 安卓**阅读场景**的 `splitParagraphs` 会 trim 每段 ⇒ `  - sub` 被 trim 成 `- sub`（进而被当普通列表项）。**PC 解析层内部不做 trim** ⇒ `  - sub` 保持**普通文本行** —— 否则「普通列表缩进不识别 / task-list 缩进识别」这条**不对称**（§3.2 / §3.3）就破了 | `MarkdownParser.kt:896-899`（`.map { it.trim() }`）、`:405`/`:415`（普通列表锚定行首）、`:453`（task-list 用 `[\s]*` 允许前导空白） |

### 1.3 粗体 / 斜体 / 删除线

| 语法 | 规格 | 安卓出处 |
|---|---|---|
| `**粗**` | 加粗，**字重 `ExtraBold` = 800**（v1.2.63 起），SansSerif | `MarkdownParser.kt:45`（`MdStyles.bold`）、`:561-568` |
| `__粗__` | 同上（两种都支持） | `MarkdownParser.kt:569-576` |
| `*斜*` | 斜体（`FontStyle.Italic` + Normal 字重） | `MarkdownParser.kt:46`、`:578-585` |
| `_斜_` | **不支持** —— 单下划线不认（只有 `__` 被当粗体） | `MarkdownParser.kt:569-576`（无单 `_` 分支） |
| `~~删除~~` | 删除线，**实色 `#9ca3af`**（无透明度）+ `LineThrough` | `MarkdownParser.kt:87-91`（`del`）、`:552-559` |
| 单 `~` 不认 | `~hello~` 不当删除线（必须成对 `~~`） | `MarkdownParser.kt:552-553` |
| **内部不递归解析** | `**a `b` c**` ⇒ 粗体内容是字面量 `` a `b` c ``（反引号保留） | `MarkdownParser.kt:564`（`append(line.substring(i + 2, end))` 原样） |
| 未闭合不生效 | `**never closes` ⇒ 纯文本，无粗体 | `MarkdownParser.kt:562`（`end > 0` 不成立则不处理） |
| 词中单星号 | `a*b*c` ⇒ 会被当斜体（`i == 0 || line[i-1] != '*'` 只挡 `**`） | `MarkdownParser.kt:578` |
| 表格退化行关斜体 | 表格行（`\|` 开头）走 `emEnabled = false` ⇒ `\|---\|---\|` 不会被吃成斜体 | `MarkdownParser.kt:429-431`、`:545`、`:530` |

### 1.4 行内 code

| 行为 | 规格 | 安卓出处 |
|---|---|---|
| `` `code` `` | 等宽（Monospace）+ 底色 `#181818` + 字色 `#e5e7eb`（暗色） | `MarkdownParser.kt:66-70`、`:587-594` |
| 反引号被剥掉 | 显示内容不含反引号 | `MarkdownParser.kt:590`（`substring(i + 1, end)`） |
| 内容原样 | 内部不做任何解析 | 同上 |
| 单个反引号不生效 | `` `abc `` （无闭合）⇒ 原样输出 | `MarkdownParser.kt:588`（`end > i + 1` 不成立） |

### 1.5 围栏代码块

| 行为 | 规格 | 安卓出处 |
|---|---|---|
| 判定 | `line.trim().startsWith("```")` —— **允许前导空白**，只看围栏前缀 | `MarkdownParser.kt:332`、`:850`、`:1034` |
| 围栏行本身**不显示** | 开/闭围栏行不产生可见文本 | `MarkdownParser.kt:332-344` |
| 内容原样 | 逐字保留（含缩进、空行） | `MarkdownParser.kt:346-347` |
| 语言标记 | 开围栏 ``` 后的 info string **第一个词**；没有则 `null`（UI 显示 `code` 兜底） | `MarkdownParser.kt:882-886`（`parseFenceLang`） |
| **两种场景两种形态** | ① **chat 场景**（`cutCodeBlocks = false`，默认）：围栏留在文本里，渲染成**行内等宽文本**（无语言徽章、无法复制）<br>② **知识库/阅读场景**（`cutCodeBlocks = true`）：切成独立卡片（语言徽章 + 复制按钮） | `MarkdownParser.kt:167-171`（KDoc 说明这是**历史决定**：「几十万条历史消息都这么画」）、`:789`、`:834-875` |

---

## 2. 行内语法

### 2.1 链接 `[text](url)`

| 行为 | 规格 | 安卓出处 |
|---|---|---|
| 显示 | 只显示 `text`，**URL 不露出** | `MarkdownParser.kt:612` |
| URL 归一化 | `http://` / `https://` 原样；其余（`www.` / 裸域名 / 其它）**一律补 `https://`** | `MarkdownParser.kt:604-609` |
| 样式 | 链接色 + 下划线（可点） | `MarkdownParser.kt:71-82` |
| 文本不递归解析 | `[**粗**](u)` ⇒ 链接文本是字面量 `**粗**` | `MarkdownParser.kt:612` |
| 需要闭合括号 | `[text](url` 无 `)` ⇒ 不当链接 | `MarkdownParser.kt:600` |
| 链接内不再识别裸 URL | `[here](https://x.com)` 的 URL **不**被裸 URL 扫描器二次命中 | `MarkdownParser.kt:638-643`（跳过紧跟 `](` 的 URL） |

### 2.2 裸 URL 自动识别 + 文件名黑名单

| 行为 | 规格 | 安卓出处 |
|---|---|---|
| 三类命中 | ① `https?://` 开头 ② `www.` 开头 ③ 裸域名（host ≥ 1 段，TLD ≥ 2 字母，可带 `/路径`） | `MarkdownParser.kt:218-229` |
| 终止字符集 | `\s` `<` `>` `"` + **中文标点**（`，。、；：？！…—～·「」『』【】（）〔〕《》〈〉“”‘’`） | `MarkdownParser.kt:215` |
| **刻意不排** | ASCII `,` `;` `?` `&` `=` `%` `+`（query string 合法字符，排了会截断图床长 URL） | `MarkdownParser.kt:211-213` |
| 尾部修剪 | 末尾标点 `.,;:!?。，；：！?*~_` + **不平衡的右括号**（`)` `]` `}`）被剪掉 | `MarkdownParser.kt:289-307`（`trimUrlTrailing`） |
| 归一化 | `www.` / 裸域名 → 补 `https://` | `MarkdownParser.kt:506-510` |
| **文件名黑名单** | 命中扩展名黑名单 ⇒ **当普通文本**（不加注解、不加链接样式、一个字符都不吞） | `MarkdownParser.kt:245-258`（`FILE_EXT_BLACKLIST`）、`:270-279`（`isFilenameMatch`）、`:652-654` |
| 黑名单只对**裸域名**生效 | 带 `http(s)://` / `www.` / 带 `/` 路径 ⇒ 仍是网址（`example.com/README.md` 是网址，`README.md` 是文件名） | `MarkdownParser.kt:270-275` |
| 黑名单大小写不敏感 | `README.MD` / `Index.JS` / `Settings.JSON` 一样拦得住 | `MarkdownParser.kt:278`（`lowercase()`） |
| 已知代价 | `md`/`py`/`sh`/`pl` 既是文件扩展名也是 ccTLD ⇒ 这四个 TLD 聊天时点不动（安卓明确"认了"） | `MarkdownParser.kt:241-243` |

### 2.3 引用角标 `[#N]`

| 行为 | 规格 | 安卓出处 |
|---|---|---|
| 形态 | `[#1]` —— 尖括号里是 `#` + **数字** | `MarkdownParser.kt:621-628` |
| 显示 | **连方括号一起显示**（`[#1]`） | `MarkdownParser.kt:624`（`substring(i, end + 1)`） |
| 样式 | 加粗 + 浅橙 `#FFD7B8`（暗色） | `MarkdownParser.kt:61-65` |
| 优先级 | `[#1](url)` ⇒ **当链接**（链接分支先命中，`[#1]` 只是链接文本） | `MarkdownParser.kt:597`（链接分支先于角标分支）+ `:599` |
| 行首的 `[#1]` | 仍当角标（`[#1]` 后不是 `(` ⇒ 链接分支不成立） | `MarkdownParser.kt:599`/`:621` |

---

## 3. 块级语法

### 3.1 引用 `>`

| 行为 | 规格 | 安卓出处 |
|---|---|---|
| 匹配 | `^(>+\s+)(.*)` —— 1~N 个 `>` + **至少 1 个空白** + 内容 | `MarkdownParser.kt:465` |
| 层级 | `>` 的个数 = 嵌套层数 | `MarkdownParser.kt:386` |
| **每层 2 空格缩进** | 行首补 `"  ".repeat(level)` | `MarkdownParser.kt:388` |
| 无左边框 / 无色阶 | 安卓渲染层**不画**左边框，也不做多层配色；PC 现有的 `.md-bq` 3 色左边框 + 每层 +1.5rem 缩进是 **PC/web 独有，要删** | `MarkdownRichText.kt:385-392`（引用只是普通文本行）；`src/styles/globals.css:463-484`（PC 现状）；**PM 口径 #6** 🔴 |
| 4 层及以上 | 安卓注释写明「**4 层及以上回落第 3 层视觉**（色卡住）」—— 当前实现没有色阶，实际可观测的只有**缩进继续每层 +2 空格** | `MarkdownParser.kt:380`（注释原文） |
| 斜体 | ⚠️ **安卓 parser 不给引用加整行斜体**（源码无 `pushStyle(em)`）—— 见 §9-D2 | `MarkdownParser.kt:385-392` |
| `>>` 紧贴内容 | `>>>foo`（`>` 后无空白）⇒ **不当引用**，回退普通文本 | `MarkdownParser.kt:460-463`（设计取舍说明） |
| 引用内不再识别块级语法 | `> - item` ⇒ 引用体是普通行内文本（`- item` 的列表前缀不生效） | `MarkdownParser.kt:385-392`（`return@forEachIndexed` 早退） |

### 3.2 有序 / 无序列表

| 行为 | 规格 | 安卓出处 |
|---|---|---|
| 有序前缀 | 行首补 `"  N. "`（**两个空格** + 原始编号 + `. `） | `MarkdownParser.kt:405-413`（`:408`） |
| 有序判定 | `^\d+\.\s` —— 编号必须在**行首**（前导空格不算列表） | `MarkdownParser.kt:405` |
| 无序前缀 | 行首补 `"  • "`（两个空格 + `•` + 空格） | `MarkdownParser.kt:415-422`（`:416`） |
| 无序判定 | 行首是 `- ` 或 `* ` | `MarkdownParser.kt:415` |
| 列表项正文走行内解析 | `**粗**` 等在列表项里生效 | `MarkdownParser.kt:409`/`:417-421` |
| **嵌套列表不支持** | 二级缩进 `- a` / `  - b` ⇒ 第二行**不是**列表项（有序判定要求行首；无序判定用 `startsWith`，带缩进不命中）⇒ 退化成普通文本行 | `MarkdownParser.kt:405`/`:415`（无缩进层级概念）；**PM 口径 #2** 🔴 PC 要删原生嵌套结构 |
| 编号原样保留 | `01. x` ⇒ 前缀 `"  01. "` | `MarkdownParser.kt:408`（`groupValues[1]` 原样） |
| **前缀是文本，不是标签** | 无序 `"  • "`、有序 `"  N. "` ⇒ PC **不用** `<ul>/<ol>`，渲染层把 `prefix` 当文本输出 | `MarkdownParser.kt:408`/`:416`；**PM 口径 #7** 🔴 PC 要删原生标签 |
| **缩进的 task-list 是例外** | 普通列表缩进不识别，但 `  - [ ] xxx` **要**识别成 task-list（安卓的不对称） | `MarkdownParser.kt:453`（`[\s]*` 前导空白）；**PM 口径 #3** 🟡 PC 要改 |

### 3.3 任务列表（task list）

| 行为 | 规格 | 安卓出处 |
|---|---|---|
| 匹配 | `^[\s]*[-*]\s\[([xX ])\]\s+(.+)` —— **允许前导空白** | `MarkdownParser.kt:453` |
| 前缀 | 已勾选 `[X] ` / 未勾选 `[ ] `（**方括号 + 一个空格**，无 2 空格缩进） | `MarkdownParser.kt:361` |
| 已勾选整段删除线 | 已勾选项正文加 `taskChecked` 样式（`#9ca3af` + `LineThrough`） | `MarkdownParser.kt:362-367`、`:94-98` |
| 未勾选正常 | 正文走普通行内格式 | `MarkdownParser.kt:367-370` |
| 优先级 | **必须先于**有序/无序列表判定（否则 `- ` 会被抢走） | `MarkdownParser.kt:351-356`（注释明示） |
| 严格模式 | `[` 后只能是空格或 `x`/`X`，且 `]` 后至少 1 个空白 + 正文 ⇒ 半截语法不误吃 | `MarkdownParser.kt:446-448` |

### 3.4 表格

见 §5（表格细则单列）。

### 3.5 分隔线（HR）

| 行为 | 规格 | 安卓出处 |
|---|---|---|
| 三档 | `---` / `***` / `___`，连续 **3 个及以上** | `MarkdownParser.kt:697` |
| 允许缩进 | 前面最多 3 个空格 | `MarkdownParser.kt:697`（`^[ ]{0,3}`） |
| 不许混用 | `-*-` 不是分隔线 | `MarkdownParser.kt:691` |
| 表格分隔行不算 HR | `\|---\|---\|` 首字符是 `|` ⇒ 是表格分隔行，不是 HR | `MarkdownParser.kt:699`（`!isTableRowLine`） |
| 渲染形态 | **满宽**分隔线（1dp，`outlineVariant` 色）+ **上下各 4dp padding** | `MarkdownRichText.kt:244-249` |
| ⚠️ 与 parser KDoc 的旧说法不同 | parser KDoc 写的是「Spacer(8.dp) + Divider + Spacer(8.dp)」，**实现已改成 4dp padding** | 契约 B6 明示「parser KDoc 里记的『上下 8dp Spacer』是旧方案，实现已改为 4dp padding」 |

### 3.6 块级图片

| 行为 | 规格 | 安卓出处 |
|---|---|---|
| **只支持独占一行的块级图** | 整行只有一张 `![alt](url)` 才切块；`see ![a](u) here` **不切**，走普通文本 | `MarkdownParser.kt:956-963`（`:959` 整行必须被吃完）；**PM 口径 #4** 🔴 |
| **不产出 inline image 节点** | AST 里**没有** inline image 类型；行内图片原样显示 `![alt](url)` 字面文本 | `MarkdownParser.kt:536-545`（`renderInlineLine` 分支清单无 image）；`MarkdownParser.kt:976` |
| 裸 URL 不切 | `https://x/a.png` 单独一行也只当文本（可能是网页） | `MarkdownParser.kt:949-950` |
| `data:` base64 不切 | 体积炸，明确不渲染 | `MarkdownParser.kt:951`、`:986` |
| 相对路径不切 | Coil 没 base URL 可拼 | `MarkdownParser.kt:952-953`、`:990-992` |
| URL 为空不切 | `![a]()` 不切 | `MarkdownParser.kt:954` |
| URL 归一化 | 只放行绝对 `http(s)://`；`www.` 开头补 `https://` | `MarkdownParser.kt:982-994` |
| URL 段不含括号/空白 | `[^()\s]+` ⇒ 带括号的 URL **不切图**（宁可少渲染一张，也不猜错） | `MarkdownParser.kt:965-976` |
| alt 为空 | `![](url)` ⇒ `alt = null`（UI 不显示 alt 字样） | `MarkdownParser.kt:960` |
| 围栏内的 `![...]` | 是代码不是图片，不切 | `MarkdownParser.kt:923-928` |

### 3.7 `:::` 扩展卡片标记

| 行为 | 规格 | 安卓出处 |
|---|---|---|
| 触发 | 行首 `:::` | `MarkdownParser.kt:433-437` |
| 产出 | 输出 `\u0000<type>\u0000` 卡片标记，`<type>` = 去掉 `:::` 后的整行 trim | `MarkdownParser.kt:434-435` |
| 行内内容被丢弃 | 该行 `:::` 之后的内容全部进 marker，正文为空 | `MarkdownParser.kt:436`（`renderInlineLine(this, "", ...)`） |

---

## 4. 流式半截内容的处理（**安卓专为流式设计，PC 必须复刻**）

这是安卓实现里**最容易做错**的一处，单独成节。

### 4.1 半截表格：分隔行到齐才升级

| 阶段 | 源码 | 行为 |
|---|---|---|
| 只有表头 | `MarkdownParser.kt:1051-1055` | **不是**表格 ⇒ 整块当普通文本（竖线原样显示） |
| 表头 + 分隔行到齐 | `MarkdownParser.kt:1056-1074` | **升级**成表格块 |
| 表体还在流式 | `MarkdownParser.kt:1058-1064` | 表体 = 分隔行之后**所有连续**的表格行（最后一行可能还在流式，照样收） |

安卓原文（`MarkdownParser.kt:1004-1005`）：

> **流式约束**: 分隔行还没到的半截表格 → 只能是 Text. 所以流式过程中
> 表格会"先以文本形式出现, 分隔行到齐了再变成表格", 这是自然且正确的渐进行为。

**分隔行的判定**（`MarkdownParser.kt:737-741` + `:681`）：
每个格子要么为空，要么匹配 `^:?-+:?$`（可选冒号 + 至少一个 `-` + 可选冒号）。
⇒ **`|--` 这种半截分隔行也算分隔行**（一个 `-` 就够），表头 + `|--` 立刻升级成表格。

**PC 端的「升级判定入口」（PM 口径 #9）**：
- `parseMarkdown(text, opts)` 是**纯函数** ⇒ 流式调用方对**累积文本**重解析即可自动升级
  （半截时返回 `paragraph`，分隔行到齐后同一次调用返回 `table`）；
- 另提供**显式判定纯函数** `detectTableUpgrade(lines)`，返回三态：
  | state | 含义 | 判定依据（安卓） |
  |---|---|---|
  | `"none"` | 不是表格（且末尾不是表格行 ⇒ 分隔行无从插入） | 首行不是表格行，或末尾行不是表格行（安卓 `MarkdownParser.kt:1051-1055` 逐行扫描） |
  | `"pending"` | **还没到齐** —— 末尾还是表格行，分隔行可能马上到 | 末尾行 `isTableRowLine` 为真，但当前还没有任何一张表成型 |
  | `"upgraded"` | **已升级** —— 分隔行到齐 | 存在某一行 `i`：`i` 是表格行 **且** `i+1` 是分隔行（`MarkdownParser.kt:1054-1055`） |

**升级判定的完整条件**（`MarkdownParser.kt:1051-1055`）：
第 1 行是表格行（首个非空白字符是 `|`）+ 第 2 行也是表格行 + 第 2 行是分隔行。
⇒ 判定是**逐行扫描**的：**表格可以从文本的任意一行开始**（不要求分隔行是整个文本的第二行）。
例如 `| a | b |` / `| 1 | 2 |` / `|---|---|` 三行 ⇒ 第 1 行留在普通文本里，
**第 2 行（`| 1 | 2 |`）成为表头**、第 3 行是分隔行 ⇒ 识别成一张「表头 = `1 | 2`」的表。

### 4.2 流式快路径

| 行为 | 规格 | 安卓出处 |
|---|---|---|
| 文本块快路径 | 全文没有 `\|` 且没有 HR ⇒ **整块一个 Text**（不逐行切） | `MarkdownParser.kt:1016-1018` |
| 图片快路径 | 原文没有 `![` ⇒ 一个字节都不进图片逻辑 | `MarkdownParser.kt:792-793` |
| 零回归保证 | 原文有 `![` 但**一个 Image 块都没切出来**（全畸形语法）⇒ 整体回退到 `splitBlocksCore` | `MarkdownParser.kt:794-795` |

### 4.3 半截围栏代码块

| 场景 | 规格 | 安卓出处 |
|---|---|---|
| chat 场景（`cutCodeBlocks = false`） | 围栏未闭合 ⇒ 缓冲区**永远不会被 flush** ⇒ **代码内容整段丢失**（只留下围栏行补的那个空行） | `MarkdownParser.kt:327-349`（`codeBlockBuffer` 只在闭合围栏时 flush，`:334-337`）；⚠️ 见 §9-D3 |
| 知识库场景（`cutCodeBlocks = true`） | 围栏未闭合 ⇒ 剩余内容**整体**算一个代码块（不丢） | `MarkdownParser.kt:828-833`、`:869-871` |

### 4.4 图片块切分时的空行归一化

切出图片块时，图片前后的文本段会**去掉首尾空行**（图片块本身已有间距，再留空行会多出一段空白）。
只在这条路径上做，不影响其它路径。— `MarkdownParser.kt:904-906`、`:913-918`

---

## 5. 表格细则

### 5.1 结构

| 行为 | 规格 | 安卓出处 |
|---|---|---|
| 表头 | 表格第一行 = `columns` | `MarkdownParser.kt:1057` |
| 表体 | 分隔行之后所有连续的表格行 | `MarkdownParser.kt:1058-1064` |
| 列数对齐 | 多了截断、少了补空串（**按表头列数**） | `MarkdownParser.kt:756-757`（`alignRow`） |
| 单元格切分 | 按 `\|` 切；**转义竖线 `\|` 保留两个字符**（不当分隔符） | `MarkdownParser.kt:707-734`（`:715-718`） |
| 单元格 trim | 每个格子首尾空白去掉 | `MarkdownParser.kt:720`/`:730` |
| 首尾空格子丢弃 | `\| a \| b \|` ⇒ 2 格（不是 4 格） | `MarkdownParser.kt:731-732` |
| 对齐解析 | `:---` 左 / `---:` 右 / `:---:` 居中 / 其它左 | `MarkdownParser.kt:744-753` |
| 单元格内容**不在解析层剥壳** | `**Python**` 的星号保留，交给渲染层走行内解析 | `MarkdownParser.kt:108-111`（KDoc 明示） |

### 5.2 渲染细则（表格卡片）

| 行为 | 规格 | 安卓出处 |
|---|---|---|
| **列宽 clamp** | 每列自然宽 clamp 到 **[80dp, 240dp]** | `MarkdownTableCard.kt:46`（min）、`:53`（max）、`:475-485`（`clampColumnWidths`）、`:227-231`（调用） |
| clamp 语义 | 钳的是**算出来的列宽**，不是每个 cell 各自自适应 ⇒ 同列 th ≡ td 等宽（列不歪） | `MarkdownTableCard.kt:461-467`、`:456-459` |
| 固定宽度渲染 | cell 用 `Modifier.width(固定值)` | `MarkdownTableCard.kt:265`（表头）、`:298`（表体） |
| **折行不截断** | `softWrap = true` 且**不设 `maxLines`** ⇒ 长内容在单元格内折行显示完整 | `MarkdownTableCard.kt:380`（ClickableText）、`:392`（BasicText）；契约 C5 |
| **无行数折叠** | 安卓**没有** 6 行折叠 / 展开按钮（v4.1.41-beta 已删） | `MarkdownTableCard.kt:77-80`、契约 C1/C5 |
| **横滑** | 表头行 + 每一表体行共享**同一个** `rememberScrollState()`（全表一个 state） | `MarkdownTableCard.kt:118`（state）、`:252`（表头）、`:285`（表体） |
| **表头恒居中** | 表头 cell **永远** `TextAlign.Center`，**与 markdown 的 `:---:` 对齐无关** | `MarkdownTableCard.kt:405-415`（`resolveCellTextAlign`，`:410`） |
| 表体对齐 | 按表里的 `:--:` / `--:` 解析 | `MarkdownTableCard.kt:411-414` |
| 圆角 | `12dp` | `MarkdownTableCard.kt:240` |
| 表头下边框 | 2dp | `MarkdownTableCard.kt:270-274` |
| 表体行间分隔 | 1dp | `MarkdownTableCard.kt:304-310` |
| 卡片底色 | `surfaceVariant.copy(alpha = 0.6f)` | `MarkdownTableCard.kt:239` |
| 表头底色 | `surfaceVariant`（不透明） | `MarkdownTableCard.kt:251` |
| 字号 | 表头 12sp / SemiBold，行高 16sp；表体 13sp / Normal，行高 18sp | `MarkdownTableCard.kt:127-138` |
| 表格内禁文本选择 | `DisableSelection` 包裹（否则父级 `SelectionContainer` 的长按拖拽会抢走横滑手势） | `MarkdownRichText.kt:230-237`；契约 R1 |
| **无首列吸附** | v4.1.46 移除，整张表一起滑 | `MarkdownTableCard.kt:317-341`；契约 R3 |

### 5.3 PC 端既有 CSS 对照（**本批不动 CSS**）

PC 端 `src/styles/globals.css` 已有等价实现，PC AST 只需产出**行列结构 + 对齐**，渲染层挂现成 class：

| CSS | 位置 | 对应安卓 |
|---|---|---|
| `--md-table-col-min: 80px` / `--md-table-col-max: 240px` | `globals.css:311-312` | `ColumnWidthMin/Max` |
| `.md-table-th, .md-table-td { min-width; max-width }` | `globals.css:316-320` | `clampColumnWidths` |
| `.md-table { width: max-content; table-layout: auto }` | `globals.css:276-313` | 固定列宽 + 整表横滑 |
| `.md-table-scroll { overflow-x: auto }` | `globals.css:267-274` | `horizontalScroll(scrollState)` |
| `.md-table-td { overflow-wrap: break-word; word-break: normal }` | `globals.css:343-351` | `softWrap = true` 不截断 |
| `.md-table thead { background; font-weight: 600 }` | `globals.css:323-326` | 表头浅灰底 + SemiBold |
| `.md-table-th { border-bottom: 2px solid var(--border-strong) }` | `globals.css:332-340` | 2dp 表头下边框 |

> ⚠️ **已知差异（不在本批范围）**：PC 的 `.md-table-th { text-align: left }`（`globals.css:332-340`、`:516-518`）
> 与安卓「表头恒居中」不一致 ⇒ 渲染层批需要用 inline style 或新增 class 覆盖（**CSS 本批不动**）。
> 另：PC 现有 `.md-table-td-clamp`（6 行折叠，`globals.css:360-366`）与安卓「无行数折叠」不一致
> ⇒ 渲染层批**不能**给 PC 表格挂 `.md-table-td-clamp`（契约 C1/C5）。**本批 AST 不带任何折叠标记。**

---

## 6. 代码块细则

### 6.1 两种形态

| 场景 | 形态 | 安卓出处 |
|---|---|---|
| **chat 气泡** | **行内等宽文本**（围栏行不显示、内容整段等宽、无语言徽章、无复制按钮） | `MarkdownParser.kt:167-171`（KDoc：**历史决定**，「几十万条历史消息都这么画」）、`:332-349`、`:481-500` |
| **知识库 / 阅读场景** | 卡片：头部（语言徽章 + 复制按钮）+ 1dp 分隔线 + 等宽正文（13sp / 行高 18sp / 圆角 12dp） | `MarkdownParser.kt:250-255`（`MarkdownRichText.kt` 分流）、`MarkdownCodeBlock.kt:57-127` |

> ⚠️ 安卓 KDoc 明确：chat 走行内等宽是**为了不改气泡排版**（切成卡片会在代码块与上下正文之间多出块间距）。
> PC 端若要严格对齐，chat 场景也必须走行内等宽。

### 6.2 代码块内的 URL（仅 chat 场景的行内等宽路径）

| 行为 | 规格 | 安卓出处 |
|---|---|---|
| URL 可点 | 代码块正文里的 URL **加"URL"注解**（可点），**不加 link 样式**（等宽灰底原样） | `MarkdownParser.kt:481-500`（`:490-493`） |
| 字符不动 | 匹配到的原文整段原样 append，尾部标点照留；修剪只发生在**注解值**里 | `MarkdownParser.kt:476-479`、`:489-492` |
| 文件名不误判 | 代码块里写 `config.yaml` 不当假网址 | `MarkdownParser.kt:486-487` |

### 6.3 复制按钮 / 语言徽章（仅卡片形态）

| 行为 | 规格 | 安卓出处 |
|---|---|---|
| 语言徽章 | 11sp / Monospace / Medium；底 `primaryContainer`、字 `onPrimaryContainer`；无语言时显示 `code` | `MarkdownCodeBlock.kt:135-150` |
| 复制按钮 | 图标 14dp + 文字「复制」；复制后 Toast「📋 已复制」；剪贴板 label `gacode` | `MarkdownCodeBlock.kt:79-106`、`:157-159` |

---

## 7. 图片细则

| 行为 | 规格 | 安卓出处 |
|---|---|---|
| 宽 | `widthIn(max = 280.dp)`（**只有上限**，宽度自适应） | `MarkdownImageBlock.kt:55` |
| 高 | `heightIn(min = 120.dp, max = 320.dp)` —— **占位固定**，不是自适应 | `MarkdownImageBlock.kt:56`、`:37-41` |
| 为什么固定高度 | 自适应会让气泡先塌成一条线再弹开；加载失败也保持同高，显示提示而不是塌成 0 高 | `MarkdownImageBlock.kt:37-42` |
| 圆角 | 12dp | `MarkdownImageBlock.kt:57` |
| 底色 | `surface.copy(alpha = 0.35f)`（加载中也有东西可看） | `MarkdownImageBlock.kt:59` |
| 裁剪 | `ContentScale.Crop` | `MarkdownImageBlock.kt:66` |
| 失败提示 | 显示 alt（无 alt 时用兜底文案），最多 3 行 + 省略号 | `MarkdownImageBlock.kt:71-80` |
| **无 lightbox** | 安卓**不支持**图片点击放大（契约 C2 / DEC-15）—— PC 端现有 `.md-lightbox-*` 属于 web 契约，**对齐安卓时要去掉** | 契约 B9 / C2 |

---

## 8. 主题取值（`MdStyles`）→ PC 端 CSS 变量映射

### 8.1 暗色（`MdStyles.Dark`，`MarkdownParser.kt:60-99`）

| 语义 | 安卓取值 | 位置 | PC 端 CSS 变量 | PC 取值 | 位置 |
|---|---|---|---|---|---|
| 引用角标 `cite` | `#FFD7B8` + Bold | `:61-65` | `var(--brand-on-container)` | `#FFD7B8` | `globals.css:54` |
| 行内 code 底色 | `#181818` | `:68` | `var(--bg-elevated)` | `#181818` | `globals.css:64` |
| 行内 code 字色 | `#E5e7eb` | `:69` | `var(--fg)` | `#e5e7eb` | `globals.css:67` |
| 链接 `link` | `#FF6B35` + Underline | `:71-82` | `var(--brand)` | `#FF6B35` | `globals.css:49` |
| 删除线 `del` | `#9ca3af` + LineThrough（**实色，无透明度**） | `:87-91` | `var(--fg-muted)` | `#9ca3af` | `globals.css:68` |
| 已勾选任务 `taskChecked` | `#9ca3af` + LineThrough | `:94-98` | `var(--fg-muted)` | `#9ca3af` | `globals.css:68` |
| 粗体 `bold` | `FontWeight.ExtraBold` = **800** | `:45` | 渲染层 inline style | — | — |
| 斜体 `em` | `FontStyle.Italic` + Normal | `:46` | 渲染层 inline style | — | — |
| 标题 H1/H2/H3 | 22 / 20 / 18 sp + Bold | `:47-49` | 渲染层 inline style | — | — |

### 8.2 浅色（`MarkdownRichText.kt:53-59` + `:79-109`）

| 语义 | 安卓取值 | 位置 | PC 端 | 备注 |
|---|---|---|---|---|
| 链接 | `#1D4ED8`（blue-700） | `MarkdownRichText.kt:55` | `var(--brand)` = `#FF6B35` | ⚠️ **契约 A3 的唯一链接色是 `#FF6B35`**，PC 端保持 `--brand`；安卓浅色值是 B 类差异，**PC 不追平** |
| muted（del / taskChecked） | `#4B5563` | `MarkdownRichText.kt:58` | `var(--fg-muted)`（浅色 `#555555`） | 值不同但同色系；PC 用 token，不写死 |
| 引用角标 | 主题 `onPrimaryContainer` = `#4A1F0A` | `MarkdownRichText.kt:82-86` | `var(--brand-on-container)`（浅色 `#4A1F0A`） | ✅ 完全一致 |
| 行内 code 底/字 | `surfaceVariant` `#F0F0F0` / `onSurface` `#1A1A1A` | `MarkdownRichText.kt:89-93` | `var(--bg-elevated)` / `var(--fg)`（浅色 `#f0f0f0` / `#1a1a1a`） | ✅ 完全一致 |

### 8.3 主题判定

安卓按背景**相对亮度 < 0.5** 判暗色（`MarkdownRichText.kt:76`）。PC 端用 `.light` class 切 token（`globals.css:119-151`），
**AST 层不关心主题**（安卓解析层也是纯函数，主题色由 UI 层构造好传进来 —— `MarkdownParser.kt:26-28`）。
⇒ **PC 的 AST 同样不带颜色**，颜色由渲染层读 CSS 变量。

---

## 9. 安卓实现里读不懂 / 像 bug 的地方（**逐条列出，PC 落地时按「源码行为」执行**）

| # | 现象 | 源码 | 本规格的处置 |
|---|---|---|---|
| **D1** | **标题内容不做行内解析** —— `# **粗**` 会显示字面量 `**粗**`（列表项正文却会解析）。像是漏了 `renderInlineLine` | `MarkdownParser.kt:396`/`:399`/`:402`（`append(line.removePrefix(...))`） | **按源码执行**：AST 的 heading 内容是纯 text 节点。⚠️ 若 PM 判定为安卓 bug，PC 可改成行内解析（只影响标题，**不影响表格 clamp / 横滑等红线**） |
| **D2** | **引用不加整行斜体** —— 契约 C3 与 brief 都写「全 italic」，但源码 `:385-392` **没有** `pushStyle(em)` | `MarkdownParser.kt:385-392` | **按源码执行**：AST 的 blockquote 不带 italic 标记。斜体由 **CSS** 提供（PC 现有 `.md-bq { font-style: italic }` `globals.css:469`）⇒ PC 渲染层只需挂 `.md-bq`，**不要**在 AST 里再叠一层 italic（会与 CSS 叠加成双倍语义） |
| **D3** | **chat 场景未闭合围栏 ⇒ 代码内容整段丢失** —— `codeBlockBuffer` 只在闭合围栏时 flush，缓冲区永远不 flush | `MarkdownParser.kt:327-349`（`:334-337`） | **按源码执行**（chat 场景）。⚠️ 流式场景下这意味着「代码块还没写完」时内容不显示；知识库场景（`cutCodeBlocks = true`）不丢（`:869-871`） |
| **D4** | **`---\|---` 这种半截分隔行也会升级成表格** —— 分隔行判定是 `^:?-+:?$`，**一个 `-` 就够** | `MarkdownParser.kt:681`/`:737-741` | **按源码执行**（流式时表格会比预期更早成型） |
| **D5** | **分隔行必须在第二行** —— 分隔行出现在第三行 ⇒ 整段不是表格 | `MarkdownParser.kt:1051-1055` | **按源码执行** |
| **D6** | **`:::tip 一些文字`** ⇒ 「一些文字」被塞进卡片 marker，正文丢失 | `MarkdownParser.kt:433-437` | **按源码执行**（AST 用 `extension` 块 + `marker` 字段承载） |
| **D7** | **表格行的 `\|` 判定与表格行判定不一致** —— 渲染分支用 `line.startsWith("\|")`（不容忍前导空格），表格切分用 `trimStart().startsWith("\|")`（容忍）⇒ 缩进表格行会被当表格切分，但退化渲染分支不认它 | `MarkdownParser.kt:429` vs `:684` | **按源码执行**（两条路径分别判定） |
| **D8** | **行内 code 里的 URL 反而不是 code** —— 裸 URL 扫描器在扫描器位置先命中，会把整段（含反引号）当裸 URL 文本吃掉，`code` 样式失效 | `MarkdownParser.kt:638-643` + 安卓单测 `MarkdownParserTest.kt:326-337`（锁的是现状） | **按源码执行**（扫描器先命中）⇒ PC AST 里这种行会产出 `link(bare)` 而不是 `inlineCode`。⚠️ 安卓已用单测锁死现状，PC 应对齐单测语义 |
| **D9** | **`[text](url)` 的链接文本不递归解析** —— `[**粗**](u)` 显示字面量 `**粗**` | `MarkdownParser.kt:612` | **按源码执行** |
| **D10** | **PC 与安卓的图片 lightbox 不一致** —— PC 有 `.md-lightbox-*`（web 契约），安卓明确不支持 | 契约 C2 / B9 | 对齐安卓时 PC **去掉** lightbox（⚠️ 属渲染层批，本批不改） |
| **D11** | **行内图不是「原样字面文本」，而是「`!` + 一个链接」** —— `renderInlineLine` 没有 image 分支，但它**先命中的链接分支**会把 `[alt](url)` 接住 ⇒ `see ![alt](u) here` 渲染成 `see !alt here`（`!` 是普通字符，`alt` 是链接、URL 不露出） | `MarkdownParser.kt:597-619`（链接分支）+ `:536-545`（分支清单无 image） | **按源码执行**（PC AST 产出 `link`，不产 image）。⚠️ brief / PM 口径 #4 写的「原样显示 `![alt](url)` 字面文本」与源码实际**不一致** —— 但「不产图片节点 / 不渲染成 `<img>`」这个**要点成立**（PC 要删的是 react-markdown 的行内 `<img>`） |
| **D12** | **表格可以从文本的任意一行开始** —— 升级判定是逐行扫描的（「`i` 是表格行 + `i+1` 是分隔行」），不是「分隔行必须是整个文本的第二行」 | `MarkdownParser.kt:1032-1077`（`while` 循环里逐行试） | **按源码执行**（PC `detectTableUpgrade` 同样逐行扫描） |

---

## 10. PC 端 AST 映射表（实现与本规格的对应）

实现文件：`gacode-electron/src/lib/markdown/parser.ts`（纯 TypeScript，零 React / 零第三方依赖）。

> ⚠️ **AST 形态 = 安卓的两层模型**（返工批 M2' 落地，详见 §12）：
> **顶层块只有 5 种**；标题 / 列表 / 引用 / `:::` 都是**文本块内部的行**，不再是顶层块。

```
MdBlock[]                 ← 顶层：text / table / image / hr / codeBlock
 └─ text                  ← MdTextBlock：一个或多个**段落**
     └─ paragraphs[]      ← MdParagraph：**连续的非空行**（空行 = 段落边界）
         └─ lines[]       ← MdLine：行级 kind
```

| 安卓行为 | 安卓出处 | PC AST 形态 |
|---|---|---|
| 文本块 | `MarkdownParser.kt:128`、`:789-809` | `text`（`paragraphs[]` 承载段落；段落内 `lines[]` 承载行） |
| 表格块 | `MarkdownParser.kt:129` | `table`（`header` / `rows` / `alignments` / `headerAlign`） |
| 图片块 | `MarkdownParser.kt:142` | `image`（`url` / `alt`） |
| 分隔线块 | `MarkdownParser.kt:155` | `hr` |
| 代码块 | `MarkdownParser.kt:172` | `codeBlock`（`lang` / `raw`） |
| 标题 | `MarkdownParser.kt:394-403` | **行级** `lines[].kind = "heading"`（`level` 1–3） |
| 引用 | `MarkdownParser.kt:385-392` | **行级** `lines[].kind = "quote"`（`level` / `prefix`） |
| 有序列表 | `MarkdownParser.kt:405-413` | **行级** `lines[].kind = "listItem"`（`listKind = "ordered"`，`item.prefix = "  N. "`） |
| 无序列表 | `MarkdownParser.kt:415-422` | **行级** `lines[].kind = "listItem"`（`listKind = "unordered"`，`item.prefix = "  • "`） |
| 任务列表 | `MarkdownParser.kt:356-373` | **行级** `lines[].kind = "listItem"`（`listKind = "task"`，`item.prefix = "[X] "/"[ ] "` + `item.checked` + `item.style.strikethrough`） |
| 普通文本行 | `MarkdownParser.kt:438` | **行级** `lines[].kind = "text"`（`inline` / `emEnabled`） |
| 粗体 | `MarkdownParser.kt:561-576` | `inline.strong`（`weight = 800`） |
| 斜体 | `MarkdownParser.kt:578-585` | `inline.em` |
| 删除线 | `MarkdownParser.kt:552-559` | `inline.del` |
| 行内 code | `MarkdownParser.kt:587-594` | `inline.inlineCode` |
| 链接 | `MarkdownParser.kt:597-619` | `inline.link`（`url` / `text` / `bare = false`） |
| 裸 URL | `MarkdownParser.kt:629-670` | `inline.link`（`bare = true`） |
| 角标 | `MarkdownParser.kt:621-628` | `inline.cite`（`text = "[#1]"` / `number = 1`） |
| 围栏代码（chat 形态） | `MarkdownParser.kt:481-500` | `inline.codeRun`（`text` + `urls[]`） |
| `:::` 扩展 | `MarkdownParser.kt:433-437` | **行级** `lines[].kind = "extension"`（`marker`） |
| 表格退化行（`emEnabled = false`） | `MarkdownParser.kt:429-431`、`:530`、`:545` | **行级** `lines[].kind = "text"` 且 `emEnabled = false` |
| 表头恒居中 | `MarkdownTableCard.kt:405-415` | `table.headerAlign = "center"` |
| 流式升级判定 | `MarkdownParser.kt:1051-1055` | `detectTableUpgrade(lines)` → `none` / `pending` / `upgraded` |
| 按空行切段 | `MarkdownParser.kt:896-899` | **解析层内部**完成（`text.paragraphs[]`）；`splitParagraphs(text)` 另导出为安卓逐字镜像（含 trim，仅供对照） |

**AST 刻意「没有」的东西**（对齐安卓，避免渲染层自作主张）：

| 不存在 | 为什么 |
|---|---|
| `heading` 的 level 4/5/6 | 安卓只判 H1–H3（PM 口径 #1） |
| list item 的 `children` / 层级 | 安卓无嵌套列表（PM 口径 #2） |
| inline `image` 节点 | 安卓行内层没有 image 分支（PM 口径 #4） |
| 语法高亮 token | 安卓不做高亮（PM 口径 #5） |
| emoji 节点 / 短码转换 | 安卓不转 emoji（PM 口径 #5） |
| 原始 HTML 节点 | 不渲染 HTML ⇒ 天然无 XSS |
| 表格「折叠 / maxLines」标记 | 安卓无行数折叠（契约 C1/C5） |

---

## 11. 断言要求

PC 端回归断言脚本：`gacode-electron/scripts/verify-md-parser.mjs`（纯 node，零依赖）。
**必须覆盖**：标题 H1–H3 / H4–H6 降级 / 粗体 800 / 斜体 / 删除线 / 行内 code / 围栏（chat 与卡片两种形态） /
链接（`[t](u)` + 裸 URL + 文件名黑名单）/ 块级图片独占行判定 / 引用每层 2 空格缩进 /
有序无序列表文本前缀 / task-list 文本前缀 + 删除线 / 表格（含**半截表格不升级**的流式用例）/ 分隔线 /
单 `\n` 硬换行 / HTML 标签被当纯文本（XSS 防护）。

**实际分节（当前 172 条断言）**：

| 节 | 内容 |
|---|---|
| §A | 静态：parser 无第三方 markdown 库 / 无 React / 无 HTML 注入面 / 无 eval |
| §B | 词法：H1–H3、H4–H6 降级、粗体 800、斜体、删除线、行内 code、围栏（两种形态）、硬换行 |
| §C | 行内：链接、裸 URL、文件名黑名单、角标、行内图、HTML 纯文本、emoji 原样 |
| §D | 块级：块级图、引用缩进、列表前缀、task-list、表格（对齐 / 转义竖线）、分隔线 |
| §E | 流式：半截表格不升级 + `detectTableUpgrade` 三态 |
| §F | 表格红线（AST 层）：对齐信息保留、表头居中标记、**无折叠标记** |
| §G | **安卓单测移植**：`MarkdownParserTest.kt` 的 fix1/fix2/fix3 回归 + 列表前缀 / 链接 / 角标 / 粗体用例 |
| §H | **段落边界 / 块边界（两层模型）**：空行被吃掉 / 同段 vs 切段 / 表格是独立顶层块 / 列表归组 / task-list 缩进不对称 / 顶层块只有 5 种 |

**退出码 0 = 全绿；非 0 = 有断言失败。**
**禁止**在渲染层尚未接线时打印「渲染验证通过」之类措辞
（当前结论文案固定为：「✅ 解析层断言通过（N/N）—— 仅覆盖「语法解析层」」+ 一行「渲染层的 DOM 结构断言在另一个脚本」）。

---

## 12. 块粒度与间距模型（安卓**两层模型** —— 返工批 M2' 落地）

> 本节是 M1/M2 返工批的**依据**：M1 原来的 AST 把标题 / 列表 / 引用提成**顶层块**，
> 块粒度**比安卓粗** ⇒ 标题上下多出 8px 块间距、空行还残留成一行 ⇒ **与安卓对不上**。
> 本节把 PC 的块粒度改成与安卓**同构**，并给出**间距的实际取值**。

### 12.1 安卓的两层模型（唯一事实源）

| 层 | 内容 | 安卓出处 |
|---|---|---|
| **块级** | **只有 5 种**：`Text` / `Table` / `Image` / `HorizontalRule` / `CodeBlock` | `MarkdownParser.kt:789-809`（`splitMarkdownBlocks`）、`:1010-1083`（`splitBlocksCore`） |
| **段落** | `MdBlock.Text` 的内容按**空行**切段（trim + 过滤空段） | `MarkdownParser.kt:896-899`（`splitParagraphs`）、`MarkdownRichText.kt:267-285`（`MarkdownTextSection`） |
| **行级** | 段落内部的每一行：`heading` / `list` / `quote` / `:::` / 普通文本 | `MarkdownParser.kt:394-438`（行级 `when`）、`:356-373`（task-list 先判）、`:385-392`（引用先判） |

⇒ **标题 / 列表 / 引用 / `:::` 不是块级** —— 它们活在 `MdBlock.Text` **块内部**。

### 12.2 PC 端的对应形态（与安卓同构）

| 层 | PC 形态 | 说明 |
|---|---|---|
| 块级 | `MdBlock = text \| table \| image \| hr \| codeBlock` | **只有 5 种**（`src/lib/markdown/parser.ts`） |
| 段落 | `MdTextBlock.paragraphs[]` | 空行切段；**空行本身不产生任何行** |
| 行级 | `MdParagraph.lines[]` | 每行带自己的 kind：`text` / `heading` / `listItem` / `quote` / `extension` |

**渲染层 DOM（`src/lib/markdown/renderer.tsx`）**：

```
.md-root                  ← 顶层块之间 8px（块边界）
 └─ .md-text              ← 文本块（安卓 MdBlock.Text）
     └─ .md-para          ← 段落（空行切出）
         ├─ .md-line      ← 连续的普通文本行（`\n` = 硬换行）
         ├─ h1/.md-heading-1 ← 标题行（**段落内部** ⇒ 不吃 8px 块间距）
         ├─ .md-list      ← 连续的**同类**列表项归一组
         ├─ .md-quote     ← 连续的引用行
         └─ .md-extension ← `:::` 扩展标记
```

### 12.3 间距的**实际取值**（不是"对齐了"，是具体数值 + 出处）

| 场景 | 间距 | 取值 | 安卓出处 | PC 落点 |
|---|---|---|---|---|
| **块边界**（text ↔ table / image / hr / codeBlock） | chat | **8px** | `MarkdownRichText.kt:161`（`blockSpacing: Dp = 8.dp`）+ `:193`（`Arrangement.spacedBy(blockSpacing)`） | `globals.css` 的 `.md-root > * + * { margin-top: 8px }` |
| **块边界** | 阅读 | ⚠️ 安卓是 **12dp**（`LibraryDetailScreen.kt:331`），PC 仍是 8px —— **已知差异**（M2 交付值，本批不动） | `LibraryDetailScreen.kt:331` | 同上 |
| **段落边界**（text 块内部的段落之间） | 阅读 | **12px** | `LibraryDetailScreen.kt:332`（`paragraphSpacing = 12.dp`）+ `MarkdownRichText.kt:282` | `.md-root-reading .md-text > .md-para + .md-para { margin-top: 12px }` |
| **段落边界** | chat | **1 个行盒 = 1.5em = 21px** | 安卓 chat 的 `paragraphSpacing = 0.dp`（`MarkdownRichText.kt:162`）⇒ **不切段**，空行在渲染层表现为**一个空行**（一个行盒高）。PC 的 AST 恒切段 ⇒ 等价表达 = 段落之间留 1 个行盒高 | `.md-root-chat .md-text > .md-para + .md-para { margin-top: 1.5em }`（chat `line-height: 1.5` × `font-size: 14px`） |
| **段内行之间** | chat / 阅读 | **无额外间距**（行距靠 line-height） | `MarkdownParser.kt:440`（行尾补 `\n`，无额外间距） | 段内不挂任何 margin 规则 |

> ⚠️ **8px 块间距规则仍然成立**：新结构下顶层只有 text/table/image/hr/codeBlock ⇒
> `.md-root > * + *` 依然只给**相邻顶层块**加 8px；**段落间距**由
> `.md-text > .md-para + .md-para` 单独表达（**两套规则互不干扰**）。

### 12.4 本批落地的 3 个「同构」要点

| 要点 | 规格 | 出处 |
|---|---|---|
| **空行被吃掉** | 空行只是**段落边界**，不产生任何行、任何渲染 | `MarkdownParser.kt:896-899` |
| **段落 = 连续的非空行** | 段内多行仍是同一段（`a\nb` = 1 段 2 行；`a\n\nb` = 2 段） | `MarkdownParser.kt:896-899` |
| **列表归组** | **连续的同类**列表项归一组（ordered / unordered / task 各自分组；ordered↔unordered 切换 ⇒ 开新组） | `MarkdownParser.kt:405-422`（前缀）+ 渲染层归组 |
