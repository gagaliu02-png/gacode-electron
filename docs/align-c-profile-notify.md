# 对齐清单 C · 个人中心 / 我的应用 / 通知页 / 通知路径

> 范围：web `gacode-web` ↔ PC `gacode-electron`（两套独立实现）
> 真相源：web 端源码实际 DOM + className 原文 + 服务端实际行为
> 粒度：最细颗粒度 —— 每个可交互元素 / 每处视觉差异 / 每个功能分支 / 每个数据字段映射单独成条
> 排序：按改动量从小到大（纯 className 一行改 → 补组件 → 补状态交互 → 补数据通路）

---

## 0. 读这份清单前必须知道的 4 个仓库事实

这 4 条是 PC 端与 web 端的**基建级差异**，影响下面所有条目的「怎么改」写法，先立在这里。

### F-1 · PC 端没有 `clsx` / `tailwind-merge` / `class-variance-authority`

- 证据：`gacode-electron/package.json:18-27` 依赖里只有 `@tanstack/react-query / date-fns / electron-updater / hash-wasm / qrcode / react / react-dom / react-router-dom`（⚠️ **M3 批，commit `b29207f` 已摘除**：`highlight.js` / `react-markdown` / `rehype-highlight` / `rehype-sanitize` / `remark-emoji` / `remark-gfm` —— PC 已切自研 markdown 管线 `src/lib/markdown/`）
  - ⚠️ **修正（2026-10-26 复核）**：原枚举漏了 **`date-fns@^4.4.0`** —— PC **已装** date-fns，`gacode-electron/src/components/chat/MessageBubble.tsx:31-32` 已在用 `formatDistanceToNow` + `zhCN`（`import { formatDistanceToNow } from "date-fns"; import { zhCN } from "date-fns/locale";`）
- web 端：`gacode-web/package.json` 有 `clsx` + `tailwind-merge`（web 的 `cn()` = `twMerge(clsx(...))`）
- **影响**：web 端 `<CardContent className="p-10 ...">` 靠 `twMerge` 把基础串 `p-6 pt-0` 覆盖成 `p-10`；PC 端如果照抄两个 className 串，**后写的 `p-6 pt-0` 不会被覆盖**（Tailwind 本身不解析冲突，靠 CSS 源序胜出，且 Tailwind 不保证类名顺序）。
- **PC 端写法约定**：冲突类名用 `!` 强制（如 `!p-10` 覆盖 `p-6 pt-0`），或干脆只写最终生效的那一串。**本清单所有「PC 最终 className」都按「只写最终生效串 + 必要时 `!` 强制」给出。**

### F-2 · PC 端没有 `lucide-react`，图标已全部收编进共享 `src/components/ui/Glyphs.tsx`

- 证据（**2026-10-27 订正**）：`gacode-electron/src/components/ui/` 现有 **15** 个组件 —— `Avatar / Badge / BottomSheet / Button / Card / ConfirmDialog / DropdownMenu / ErrorBoundary / Glyphs / ImageLightbox / Input / LongPressMenu / Tabs / Textarea / Toast`（其中 `Avatar / Badge / Card / Textarea` 是 C 域本轮新建的，`Glyphs` 是共享图标库）
- web 端：`gacode-web/src/components/ui/card.tsx` 有 `Card / CardHeader / CardTitle / CardDescription / CardContent / CardFooter` 六个导出
- **影响**：web 端所有 `<Construction />` `<Bell />` `<ChevronRight />` `<Copy />` `<Check />` `<Trash2 />` `<Package />` 等 lucide 图标，PC 端**没有等价库**。
- **PC 端既有做法**（照抄这个模式，不要引新依赖）：PC 的图标是**手写 SVG**，现已全部收编进共享 `gacode-electron/src/components/ui/Glyphs.tsx`（**84** 个导出；图形真值 = lucide-react v0.407.0，与 web 同款）。调用点只传 `size` / `strokeWidth` / `className` —— 例如 `gacode-electron/src/routes/ProfileApps.tsx:25` 的 `import { ConstructionIcon } from "../components/ui/Glyphs";` 与 `:35` 的 `<ConstructionIcon className="w-12 h-12 mx-auto text-fg-muted mb-4" />`。
- **决策点已排除**：本清单按「手写内联 SVG → 共享 `Glyphs.tsx`」给实现，不写「需新增依赖 lucide-react」——PC 现有代码全是手写 SVG，另起依赖属于扩范围。

### F-3 · PC 端 `bg-card` token **已与 web 同为 `#141414`**，`card-hover` 已补齐

- web 端（`gacode-web/src/styles/globals.css`）：

  | 位置 | 变量 | 值 |
  |---|---|---|
  | `:root` L96-97 | `--card` / `--card-hover` | `#141414` / `#1e1e1e` |
  | `:root` L138-139（shadcn 别名块里重复声明一次） | `--card` / `--card-hover` | `#141414` / `#1e1e1e` |
  | `.light`（L158 起）L176-177 | `--card` / `--card-hover` | `var(--bg-sunken)`=#ffffff / `#f0f0f0` |
  | `.dark`（L194 起）L206-207 | `--card` / `--card-hover` | `#141414` / `#1e1e1e` |
  | `tailwind.config.ts:87-88` | `colors.card` / `colors.card-hover` | `#141414` / `#1e1e1e` |

- PC 端（`gacode-electron/src/styles/globals.css`）—— **2026-10-27 订正：PC 已与 web 同值**：

  | 位置 | 变量 | 值 |
  |---|---|---|
  | `:root` L100-102 | `--card` / `--card-foreground` / `--card-hover` | `#141414` / `var(--fg)` / `#1e1e1e` |
  | `.light` L138-140 | `--card` / `--card-foreground` / `--card-hover` | `var(--bg-sunken)` = `#ffffff` / `var(--fg)` / `#f0f0f0` |
  | `.dark` L168-170 | `--card` / `--card-foreground` / `--card-hover` | `#141414` / `var(--fg)` / `#1e1e1e` |
  | `tailwind.config.ts:87` | `colors.card` | `#141414` |
  | `tailwind.config.ts:90` | `colors.card-hover` | `#1e1e1e` |

  > ⚠️ **修正（2026-10-26 复核 E12 + 本轮 2026-10-27 订正）**：原表把 PC 的 `--card` 写成 `var(--bg-sunken)`=`#0a0a0a`、把 `--card-hover` 标成「**不存在**」—— 那是 **C 域实装之前**的状态。`78d6b8c`（`C1-03b`）已把 PC 的 `--card` / `--card-hover` 补成与 web 同值（`#141414` / `#1e1e1e`），`tailwind.config.ts` 同步 ⇒ **两端现在完全一致**。

- **影响**：无 —— token 已对齐，任何要 1:1 还原 web `<Card>` 的 PC 组件，底色现在**同色**。
- **爆炸半径**：写这份清单时 `grep -rn "bg-card|card-hover" gacode-electron/src` → **0 命中**（半径 0）→ C 域实装后 1 处（`gacode-electron/src/routes/Library.tsx:558` 的骨架屏）→ **本轮实测 25 处 / 22 行 / 8 个文件**（`ui/Card.tsx` / `routes/ProfileApps.tsx` / `routes/Library.tsx` / `routes/ChatList.tsx` / `routes/Deliveries.tsx` / `library/CollectSheet.tsx` / `library/LibraryCard.tsx` / `chat/UploadErrorChip.tsx`）+ `hover:bg-card-hover` **3 处**（`src/components/library/CollectSheet.tsx:290/298/306`）⇒ 改 token 的爆炸半径 = 25 处，但**新旧同值**，不需要再改。
- **对应条目**：见 `C1-03` / `C3-xx`（各条单独列一次，因为每处 Card 都要独立用对底色）。

### F-4 · 圆角刻度两端一致，`shadow` 也一致

- `borderRadius`（web `tailwind.config.ts:146-153` ≈ PC `tailwind.config.ts:137-148`）：`sm=12px / DEFAULT=8px / md=16px / lg=20px / xl=22px / 2xl=24px / 3xl=28px / full=9999px`
- `boxShadow.DEFAULT` 两端都是 `0 1px 3px 0 rgb(0 0 0 / 0.5)`；`boxShadow.card` 两端都是 `0 1px 3px rgba(0, 0, 0, 0.5)`
- **结论**：web 的 `rounded-lg`(=20px) / `rounded-md`(=16px) / `shadow` 可以**逐字**搬到 PC，无需换算。**唯一例外**是 PC 侧若同时存在 `rounded-*` 与 `!rounded-*`，按 F-1 用 `!`。

---

## 组 1 · 我的应用（web `/profile/apps`）

**web 端**：`gacode-web/src/app/(main)/profile/apps/page.tsx`（全文 35 行，占位页）
**PC 端**：`gacode-electron/src/routes/ProfileApps.tsx`（全文 96 行）

### web 端原文（`gacode-web/src/app/(main)/profile/apps/page.tsx:22-34`）

```tsx
  return (
    <div className="px-4 lg:px-8 py-6 max-w-2xl mx-auto">
      <Card>
        <CardContent className="p-10 text-center text-fg-muted">
          <Construction className="w-12 h-12 mx-auto text-fg-muted mb-4" />
          <div className="text-base font-medium mb-1 text-fg">我的应用</div>
          <div className="text-sm">
            管理你创建的 gagaOS 应用 — 这个功能正在开发中，先用基础功能吧 🚧
          </div>
        </CardContent>
      </Card>
    </div>
  );
```

**web 端 `Card` / `CardContent` 展开后的最终 className**（`gacode-web/src/components/ui/card.tsx:8` 与 `:39`，经 `cn()`=twMerge 合并后）：

```tsx
// card.tsx:6-10
<div ref={ref} className={cn("rounded-lg border bg-card text-card-foreground shadow", className)} />
// card.tsx:37-41
<div ref={ref} className={cn("p-6 pt-0", className)} />
```

→ 本页最终生效：
- `Card` 卡片根：`rounded-lg border bg-card text-card-foreground shadow`
- `CardContent` 内容根：`p-10 text-center text-fg-muted`（`p-10` 经 twMerge 覆盖掉 `p-6 pt-0`）

---

### C1-01 · 页面最外层容器：缺 `max-w-2xl mx-auto`

- **web 端**：`gacode-web/src/app/(main)/profile/apps/page.tsx:23`
  ```tsx
  <div className="px-4 lg:px-8 py-6 max-w-2xl mx-auto">
  ```
- **PC 端**：`gacode-electron/src/routes/ProfileApps.tsx:56`
  ```tsx
  <div className="min-h-full px-4 lg:px-8 py-6">
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/ProfileApps.tsx:29`
  - 实际形态：`<div className="min-h-full px-4 lg:px-8 py-6 max-w-2xl mx-auto">` —— `max-w-2xl`=672px + `mx-auto` 左右居中，与 web `gacode-web/src/app/(main)/profile/apps/page.tsx:23` 逐字一致。
- **附带事实**：`min-h-full` 是 PC 独有（web 无此 class），按 gaga 指示 PC 增强不列入差异，**保留不动**。

---

### C1-02 · 内层宽度容器：web 没有这一层

- **web 端**：`gacode-web/src/app/(main)/profile/apps/page.tsx:23-24` — web 是**单层**容器，`Card` 直接挂在 `px-4 lg:px-8 py-6 max-w-2xl mx-auto` 里面，**没有** `max-w-md` 中间层。
- **PC 端**：`gacode-electron/src/routes/ProfileApps.tsx:57`
  ```tsx
  <div className="max-w-md mx-auto space-y-5">
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/ProfileApps.tsx:30`
  - 实际形态：`max-w-md mx-auto space-y-5` 中间层**已删**，`<Card>` 直接挂在 `:29` 的单层容器下；`ProfileApps.tsx` 由 96 行缩到 **44 行**（只剩 `Card` + `CardContent` 两层）。

---

### C1-03 · 卡片底色/边框/阴影/圆角：PC 用 `bg-bg-elevated` 替了 `bg-card`

- **web 端**：`gacode-web/src/components/ui/card.tsx:6-10`（`<Card>` 本体）
  ```tsx
  <div
    ref={ref}
    className={cn("rounded-lg border bg-card text-card-foreground shadow", className)}
    {...props}
  />
  ```
  实际色值：`bg-card` = `#141414`（web `globals.css:96` / `tailwind.config.ts:87`）；`border` = `1px solid var(--border-default)` = `#363b41`（web `globals.css:182-184` 全局 `* { border-color: var(--border-default) }`）；`shadow` = `0 1px 3px 0 rgb(0 0 0 / 0.5)`
- **PC 端**：`gacode-electron/src/routes/ProfileApps.tsx:59`
  ```tsx
  <div className="rounded-md bg-bg-elevated p-8 text-center">
  ```
  实际色值：`bg-bg-elevated` = `#181818`（PC `tailwind.config.ts:56`）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547` + `78d6b8c`）**
  - PC 侧锚点：`src/components/ui/Card.tsx:27-29`（`<Card>` 本体）+ `:47-49`（`<CardContent>` base `p-6`）；调用点 `src/routes/ProfileApps.tsx:30-31`
  - 实际形态：卡片根 `rounded-lg border bg-card text-card-foreground shadow`；内容根 `!p-10 text-center text-fg-muted`。token 同步落地：`tailwind.config.ts:87` `card: "#141414"`（原 `#0a0a0a`）+ `:90` `"card-hover": "#1e1e1e"`；`src/styles/globals.css:100` `--card: #141414` / `:102` `--card-hover: #1e1e1e` / `:140` `.light` `--card-hover: #f0f0f0` / `:170` `.dark` `--card-hover: #1e1e1e` ⇒ 底色 `#141414`、边框 1px `#363b41`、`shadow 0 1px 3px rgb(0 0 0/.5)` 三处全对齐 web。

---

### C1-03b · 缺 `--card-hover` token（web 有，PC 完全没有）

- **web 端**：`gacode-web/src/styles/globals.css:97` → `--card-hover: #1e1e1e;`（`:root`）、`:177` → `--card-hover: #f0f0f0;`（`.light`）、`:207` → `--card-hover: #1e1e1e;`（`.dark`）；`gacode-web/tailwind.config.ts:88` → `"card-hover": "#1e1e1e",`
- **PC 端**：**PC 缺失**（`gacode-electron/src/styles/globals.css` 全文无 `card-hover`；`gacode-electron/tailwind.config.ts` 无 `card-hover` 键）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `78d6b8c`）**
  - PC 侧锚点：`tailwind.config.ts:90`（`"card-hover": "#1e1e1e",`）+ `src/styles/globals.css:102`（`:root`）/ `:140`（`.light` → `#f0f0f0`）/ `:170`（`.dark`）三处 `--card-hover`
  - 实际形态：与 web `globals.css:97 / :177 / :207` + `tailwind.config.ts:88` 的三档取值逐字一致。

---

### C1-04 · 卡片内容区内边距：`p-8` vs `p-10`

- **web 端**：`gacode-web/src/app/(main)/profile/apps/page.tsx:25` + `gacode-web/src/components/ui/card.tsx:39`
  ```tsx
  <CardContent className="p-10 text-center text-fg-muted">
  // card.tsx:39 基础串
  className={cn("p-6 pt-0", className)}
  ```
  → twMerge 后最终：`p-10 text-center text-fg-muted`
- **PC 端**：`gacode-electron/src/routes/ProfileApps.tsx:59`
  ```tsx
  <div className="rounded-md bg-bg-elevated p-8 text-center">
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/ProfileApps.tsx:31`
  - 实际形态：`<CardContent className="!p-10 text-center text-fg-muted">` —— `!p-10` 强制覆盖 `Card.tsx:48` 的 base `p-6`（PC 无 `twMerge`，见 F-1）。

---

### C1-05 · 图标：web 是裸 lucide 图标，PC 塞进了圆形底容器

- **web 端**：`gacode-web/src/app/(main)/profile/apps/page.tsx:26`
  ```tsx
  <Construction className="w-12 h-12 mx-auto text-fg-muted mb-4" />
  ```
  lucide `Construction` = 一台「斜纹施工挡板」图标，24×24 viewBox，stroke-width 2，`stroke="currentColor"`，无背景圆底。
- **PC 端**：`gacode-electron/src/routes/ProfileApps.tsx:60-61`
  ```tsx
  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-sunken flex items-center justify-center text-fg-muted">
    <ConstructionIcon />
  </div>
  ```
  + `gacode-electron/src/routes/ProfileApps.tsx:86-96` 的 `ConstructionIcon()` 画的是**另一种图形**（一个带 4 道竖线的矩形挡板，非 lucide Construction 的吊臂+斜纹造型），且被塞进 `rounded-full`(=9999px) + `bg-bg-sunken`(=`#0a0a0a`) 圆底。
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547` + `f57f2ec`）**
  - PC 侧锚点：`src/routes/ProfileApps.tsx:35`（调用点）+ `src/components/ui/Glyphs.tsx:1290-1314`（图形本体）
  - 实际形态：圆形底容器**已删**，改为 `<ConstructionIcon className="w-12 h-12 mx-auto text-fg-muted mb-4" />`（48px 裸 SVG）；图形 path 逐字取自 lucide-react v0.407.0 `construction`（`rect x=2 y=6 w=20 h=8 rx=1` + 工具/硬帽子 6 段 path），不再是 PC 原先的「4 竖线矩形挡板」。

---

### C1-06 · 图标下间距：`mb-4` vs `mb-3`

- **web 端**：`gacode-web/src/app/(main)/profile/apps/page.tsx:26` → `mb-4`
- **PC 端**：`gacode-electron/src/routes/ProfileApps.tsx:60` → `mb-3`
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/ProfileApps.tsx:35`
  - 实际形态：图标 className 末尾 `mb-4`（16px），与 web `profile/apps/page.tsx:26` 一致。

---

### C1-07 · 标题标签与颜色：web 是 `<div>` + 显式 `text-fg`，PC 是 `<p>` + 继承色

- **web 端**：`gacode-web/src/app/(main)/profile/apps/page.tsx:27`
  ```tsx
  <div className="text-base font-medium mb-1 text-fg">我的应用</div>
  ```
  注意 web 端父级 `CardContent` 带 `text-fg-muted`，所以标题必须**显式**写 `text-fg` 才是高亮色。
- **PC 端**：`gacode-electron/src/routes/ProfileApps.tsx:63`
  ```tsx
  <p className="text-base font-medium mb-1">我的应用</p>
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/ProfileApps.tsx:36`
  - 实际形态：`<div className="text-base font-medium mb-1 text-fg">我的应用</div>` —— 标签 `<p>` → `<div>` + 显式 `text-fg`，与 web `profile/apps/page.tsx:27` 逐字一致。

---

### C1-08 · 描述文字颜色（继承 vs 显式）— 视觉已一致

- **web 端**：`gacode-web/src/app/(main)/profile/apps/page.tsx:28-30`
  ```tsx
  <div className="text-sm">
    管理你创建的 gagaOS 应用 — 这个功能正在开发中，先用基础功能吧 🚧
  </div>
  ```
  颜色**继承**自 `CardContent` 的 `text-fg-muted`（L25）= `#9ca3af`
- **PC 端**：`gacode-electron/src/routes/ProfileApps.tsx:64-66`
  ```tsx
  <p className="text-sm text-fg-muted">
    管理你创建的 gagaOS 应用 — 这个功能正在开发中,先用基础功能吧 🚧
  </p>
  ```
- **差异判定**：**已一致**（视觉色值都是 `#9ca3af`；`text-sm` 两端都是 14px/20px 行高）
- **怎么改**：**无需改（现状已一致）**
  - PC 侧锚点：`src/routes/ProfileApps.tsx:31`（`CardContent` 带 `text-fg-muted`）+ `:37-39`（`<div className="text-sm">` 继承）
  - 实际形态：描述段落不写颜色、靠继承 ⇒ 渲染色 `#9ca3af`，与 web `profile/apps/page.tsx:28-30` 同。

---

### C1-09 · 描述文案标点：全角逗号 vs 半角逗号

- **web 端**：`gacode-web/src/app/(main)/profile/apps/page.tsx:29` → `管理你创建的 gagaOS 应用 — 这个功能正在开发中，先用基础功能吧 🚧`（`开发中` 后是**全角** `，` U+FF0C）
- **PC 端**：`gacode-electron/src/routes/ProfileApps.tsx:65` → `管理你创建的 gagaOS 应用 — 这个功能正在开发中,先用基础功能吧 🚧`（`开发中` 后是**半角** `,` U+002C）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/ProfileApps.tsx:38`
  - 实际形态：`管理你创建的 gagaOS 应用 — 这个功能正在开发中，先用基础功能吧 🚧` —— 逗号改**全角** `，`（U+FF0C）；`—` 两侧空格与结尾 `🚧` 保留，与 web 逐字一致。

---

### C1-10 · 页面标题「我的应用」渲染位置：web 靠全局 Header，PC 在页面内多渲染一个 `<h1>`

- **web 端**：`gacode-web/src/app/(main)/profile/apps/page.tsx:9-11`（注释）+ `:17-20`
  ```tsx
  // 标题 "我的应用" 由全局 Header (Drawer 旁) 渲染, 此处不再重复 H1.
  ...
  useEffect(() => {
    setHeaderTitle("我的应用");
    return () => setHeaderTitle("新对话");
  }, [setHeaderTitle]);
  ```
  → web 页面内**没有** `<h1>`，标题由全局 Header 渲染。
- **PC 端**：`gacode-electron/src/routes/ProfileApps.tsx:58`
  ```tsx
  <h1 className="text-xl font-medium">我的应用</h1>
  ```
  同时 PC 的 AppShell header 也渲染标题：`gacode-electron/src/components/layout/AppShell.tsx:48` → `if (pathname === "/profile/apps") return "我的应用";`
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/ProfileApps.tsx`（页内 `<h1>` 已删）+ `src/components/layout/AppShell.tsx:116`
  - 实际形态：标题只由 AppShell header 渲染 —— `if (pathname === "/profile/apps") return "我的应用";`（AppShell.tsx `resolveTitle`）。PC 标题不再重复出现两次。

---

### C1-11 · 页面标题的复位机制：web 卸载时复位为「新对话」，PC 按 pathname 推导

- **web 端**：`gacode-web/src/app/(main)/profile/apps/page.tsx:19` → `return () => setHeaderTitle("新对话");`
- **PC 端**：`gacode-electron/src/components/layout/AppShell.tsx:36-51` `resolveTitle(pathname)`：命中 `/profile/apps` → `"我的应用"`；未命中任何分支 → `"Gacode"`（L50）
- **差异判定**：**已一致**（用户在两个页面之间切换时，两端 header 标题都会随路由变化；web 的「卸载复位」与 PC 的「按 pathname 重算」在导航场景下结果相同）
- **怎么改**：**无需改（现状已一致）**
  - PC 侧锚点：`src/components/layout/AppShell.tsx:100-118`（`resolveTitle(pathname)`）
  - 实际形态：命中 `/profile/apps` → `"我的应用"`，未命中 → `"Gacode"`（`:118`）。

---

### C1-12 · 非特权用户分支：web 本页不做 gating，PC 在页内 gate 且渲染另一张卡

- **web 端**：`gacode-web/src/app/(main)/profile/apps/page.tsx:14-34` —— **本页对所有用户渲染同一张占位卡**；特殊用户 gating **只发生在入口**：`gacode-web/src/components/layout/Drawer.tsx:101` `const isSpecial = (profile?.id || user?.id) === SPECIAL_USER_ID;` + `:221-227` `{isSpecial && (<DrawerNavItem icon={Package} label="我的应用" onClick={() => handleNav("/profile/apps")} />)}`
- **PC 端**：`gacode-electron/src/routes/ProfileApps.tsx:20-26`（取 profile）+ `:28-53`（`if (!isPrivileged)` 分支渲染锁屏卡）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/ProfileApps.tsx`（全文 44 行，无 `isPrivileged` 分支）
  - 实际形态：`if (!isPrivileged) { … }` 整块 return **已删**，连同 `getProfile` query 与 `useQuery` import；所有用户渲染同一张占位卡，与 web `profile/apps/page.tsx` 一致。特权门禁只保留在**入口**（见 `C1-13`）。

---

### C1-13 · 入口位置与入口图标：web 在 Drawer，PC 在 Profile 页内

- **web 端**：`gacode-web/src/components/layout/Drawer.tsx:221-227`
  ```tsx
  {isSpecial && (
    <DrawerNavItem
      icon={Package}
      label="我的应用"
      onClick={() => handleNav("/profile/apps")}
    />
  )}
  ```
  （`DrawerNavItem` 的样式在 `Drawer.tsx:205` 的 `<nav className="rounded-md bg-bg-elevated m-3 mb-0 p-2 space-y-1">` 内）
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:196-197` —— `label="我的应用"` / `onClick={() => navigate("/profile/apps")}`（在 Profile 页的操作入口列表里，非侧边栏）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `78d6b8c` + `7b74547`）**
  - PC 侧锚点：`src/components/layout/AppShell.tsx:380-393`（侧栏入口）+ `src/routes/Profile.tsx:260-262`（Profile 页内旧入口已删）
  - 实际形态：入口搬进 PC 常驻侧栏主菜单区 —— `{user && user.id === "6" ? (<button … onClick={() => navigate("/profile/apps")} …><PackageIcon />我的应用<ChevronRightIcon /></button>) : null}`，门禁对齐 web `Drawer.tsx:47` `SPECIAL_USER_ID = "6"` + `:221-227` 的 `isSpecial`；图标用共享 `src/components/ui/Glyphs.tsx:191` `PackageIcon`（lucide `package`）。⇒ 原「入口在 Profile 页内」的形态差异已消除（`S-1` 落法落地）。
- **⚠️ 本条同时是结构级差异** → 详见文末 `S-1`

---

## 组 1 小结
> **2026-10-27 回写**：组 1 **14 条全部已落地**（`7b74547` 收口批 + `78d6b8c` 尾巴批 + `f57f2ec` 图标形状对齐）。下表「落地 / 残留」列给出实际 commit。

| 编号 | 判定 | 落地 / 残留 |
|---|---|---|
| C1-01 | 已一致 | `7b74547` |
| C1-02 | 已一致 | `7b74547` |
| C1-03 | 已一致 | `7b74547` + `78d6b8c`（`card` / `card-hover` token） |
| C1-03b | 已一致 | `78d6b8c` |
| C1-04 | 已一致 | `7b74547` |
| C1-05 | 已一致 | `7b74547` + `f57f2ec`（图标形状对齐 lucide v0.407.0） |
| C1-06 | 已一致 | `7b74547` |
| C1-07 | 已一致 | `7b74547` |
| C1-08 | 已一致 | 本来就一致 |
| C1-09 | 已一致 | `7b74547` |
| C1-10 | 已一致 | `7b74547` |
| C1-11 | 已一致 | 本来就一致 |
| C1-12 | 已一致 | `7b74547` |
| C1-13 | 已一致 | `78d6b8c`（侧栏入口 + `user.id === "6"` 门禁）+ `7b74547`（删 Profile 页内旧入口） |
---

## 组 2 · 个人资料（web `/profile` + `/profile/edit` ↔ PC `Profile.tsx` + `ProfileEdit.tsx` + `ProfileChangePassword.tsx`）

### 组 2 前置事实

**F-5 · `ProfileChangePassword.tsx` 没有 web 对照物 → 本组不产出该文件的差异条目**

- 事实：web 端 `gacode-web/src/app/(main)/profile/` 下只有 `page.tsx` / `edit/page.tsx` / `apps/page.tsx` 三个文件（Glob 确认），**没有改密页**；web 的 `/profile` 页面顶部操作区只有「编辑」一个按钮（`gacode-web/src/app/(main)/profile/page.tsx:203-210`），也没有「修改密码」入口。
- PC 端 `gacode-electron/src/routes/ProfileChangePassword.tsx`（202 行）+ `Profile.tsx:189-193` 的「修改密码」ActionRow 属于 **PC 独有功能**。
- 按 gaga 指示「PC 增强不列入差异清单」，本组**不产出**该文件的任何条目，也**不讨论**保留或删除。

**F-6 · 服务端 profile 端点的真实契约**（`unified-api/src/modules/gacode/gacode.profile.routes.js`，注册前缀 `/api/v1/gacode`）

| 端点 | 行号 | 契约 |
|---|---|---|
| `GET /profile` | `:42-80` | 返 `{ id, username, displayName, gender, bio, avatar, email, createdAt }`，全部经 `replyOk()` 包成 `{ ok:true, data:{...} }` |
| `PUT /profile` | `:85-134` | body `{ displayName?: string\|null (maxLength **50**), gender?: enum['male','female','other','unspecified'], bio?: string\|null (maxLength **200**) }`；**`anyOf` 要求至少传一个字段，否则 400**（`:95-99`）；`:107` `if (displayName !== undefined) data.displayName = displayName;`（`null` 也接受 = 允许清空） |
| `POST /profile/avatar` | `:140-206` | multipart，字段名 `avatar`（兼容 `file`）；`MAX_AVATAR_BYTES = 5MB`（`:27`）；MIME 白名单 `ALLOWED_AVATAR_MIMES = ['image/jpeg','image/png','image/webp']`（`:28`，**不含 gif**）→ 不在白名单返 **415**（`:158-161`），超 5MB 返 **413**（`:182-184`）；返 `{ avatarUrl, size }` |

> ⚠️ **修正（2026-10-26 复核 · E1）**：原表引的是 `unified-api/src/modules/yinian/profile.routes.js`（注册前缀 `/api/v1/auth`）—— **那是另一条没人调的路由**。该文件里的 64/500 上限属于 `/api/v1/auth/profile`；web 全仓 `grep "/auth/profile"` = **0 命中**。
> 两端**实际**调的都是 `/api/v1/gacode/profile`：
> - web：`gacode-web/src/lib/api.ts:264` `request("/gacode/profile", { method:"PUT" })`
> - PC：`gacode-electron/src/lib/api.ts:1164` `request("/gacode/profile", { method:"PUT" })`
>
> ⇒ **真实上限是 displayName 50 / bio 200，不是 64/500**（见 C2-31 / C2-33，以及下面的「现网 bug」条目）。

**F-7 · 服务端注销端点的真实语义**（两个端点都存在，**现在走的是同一段代码**）

| 端点 | 源码 | 实际行为 |
|---|---|---|
| `DELETE /api/v1/yinian/account` | `unified-api/src/modules/yinian/yinian.routes.js:579-582` → `authService.deleteAccount(userId)`（转发） | **真注销**：物理删除账号 + 全部关联数据 + 磁盘残留；幂等 |
| `DELETE /api/v1/auth/account` | `unified-api/src/modules/auth/auth.routes.js:189-193` → `authService.deleteAccount(userId)` | **真注销**：同上（**同一个 service 函数**） |

> ⚠️ **修正（2026-10-26 复核）**：原稿写「`/yinian/account` 只删 3 张表、账号本身不删」，引的是 `unified-api/src/yinian.routes.js:377-381` → `yinianService.purgeUserData(userId)`（`yinian.service.js:1245-1256`，只删 `yinianMemoryAtom` / `yinianChatSession` / `yinianEmbeddingQuota`）。**那个文件没有注册** —— 线上注册的是 `unified-api/src/server.js:29` + `:221` → `src/modules/yinian/yinian.routes.js`；该文件自 2026-10-15（commit `9e25a4d`「真注销账户」）起把 `DELETE /account` 转发到 `authService.deleteAccount()`（保留 `/yinian/account` 只是为了兼容还在调它的旧客户端）。
> ⇒ 两端现在的差异**只剩端点路径不统一**，不再有「web 不删账号 / PC 删账号」的行为分叉。

→ web 端 `gacode-web/src/lib/api.ts:1363-1364` 用的是 **前者**，PC 端 `gacode-electron/src/lib/api.ts:1311-1322` 用的是**后者**（**gaga 2026-10-26 已拍板：以 PC 为准，两端统一 `/auth/account`**）。详见 `C2-22`。

---

### 组 2a · web `/profile`（ProfileTab 简化版）↔ PC `Profile.tsx`

**web 端**：`gacode-web/src/app/(main)/profile/page.tsx`（297 行）
**PC 端**：`gacode-electron/src/routes/Profile.tsx`（575 行）

#### web 端原文（`gacode-web/src/app/(main)/profile/page.tsx:186-296`）

```tsx
  return (
    <div className="px-4 lg:px-8 py-6 max-w-2xl mx-auto">
      {/* 顶部操作区 — 铃铛入口 (安卓 ProfileTab 同款) + "编辑" 按钮右对齐 */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => nav.client(router, "/notifications")}
          aria-label="通知中心"
          className="relative w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold bg-brand text-brand-on">
              {formatUnreadBadge(unreadCount)}
            </span>
          )}
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => nav.client(router, "/profile/edit")}
          aria-label="编辑资料"
        >
          编辑
        </Button>
      </div>
```

#### web 端 ProfileRow（`gacode-web/src/app/(main)/profile/page.tsx:61-81`）

```tsx
function ProfileRow({ label, value, onClick, rightSlot }: ProfileRowProps) {
  const interactive = typeof onClick === "function";
  const Wrapper: React.ElementType = interactive ? "button" : "div";
  return (
    <Wrapper
      type={interactive ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "w-full rounded-md bg-bg-elevated p-4 flex justify-between items-center",
        "transition-colors duration-150",
        interactive && "hover:bg-bg-base text-left"
      )}
    >
      <span className="text-sm font-medium shrink-0">{label}</span>
      <span className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-fg-muted truncate max-w-[200px]">{value}</span>
        {rightSlot ?? (interactive ? <ChevronRight className="w-4 h-4 text-fg-muted shrink-0" /> : null)}
      </span>
    </Wrapper>
  );
}
```

---

### C2-01 · 页面容器层数与块间距模型

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:187`
  ```tsx
  <div className="px-4 lg:px-8 py-6 max-w-2xl mx-auto">
  ```
  web 是**单层**容器，各块自带精确间距：顶部操作区 `mb-4`(:189) → 头像区 `mb-8`(:216) → 卡片列表 `space-y-2`(:236) → 注销区 `mt-6`(:257) → 页脚 `mt-8`(:292)
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:114-115`
  ```tsx
  <div className="min-h-full px-4 lg:px-8 py-6">
    <div className="max-w-2xl mx-auto space-y-6">
  ```
  PC 是**双层**容器，用统一 `space-y-6`(=24px) 代替 web 的逐块 margin
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Profile.tsx:166`
  - 实际形态：单层容器 `min-h-full px-4 lg:px-8 py-6 max-w-2xl mx-auto`；块间距改成**逐块 margin**：顶部区 `mb-4`（`Profile.tsx:168`）/ 头像区 `mb-8`（`Profile.tsx:193`）/ 信息卡 `space-y-2`（`Profile.tsx:232`）/ 操作入口 `mt-6`（`Profile.tsx:249`）/ 注销区 `mt-6`（`Profile.tsx:303`）/ 页脚 `mt-8`（`Profile.tsx:317`）。

---

### C2-02 · 顶部操作区容器：`justify-between` + `mb-4`

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:189`
  ```tsx
  <div className="flex items-center justify-between mb-4">
  ```
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:117`
  ```tsx
  <div className="flex items-center justify-end gap-2">
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Profile.tsx:168`
  - 实际形态：`<div className="flex items-center justify-between mb-4">`，与 web `profile/page.tsx:189` 一致。

---

### C2-03 · 通知铃铛入口：PC 的 Profile 页内缺失

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:190-202`
  ```tsx
  <button
    type="button"
    onClick={() => nav.client(router, "/notifications")}
    aria-label="通知中心"
    className="relative w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center"
  >
    <Bell className="w-5 h-5" />
    {unreadCount > 0 && (
      <span className="absolute top-1.5 right-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold bg-brand text-brand-on">
        {formatUnreadBadge(unreadCount)}
      </span>
    )}
  </button>
  ```
  数据源（web `:142-150`）：
  ```tsx
  const { data: notifData } = useQuery({
    queryKey: ["notifications", { unread: true }],
    queryFn: () => listNotifications(true),
    retry: false,
    staleTime: 30 * 1000,
    refetchInterval: NOTIFICATION_POLL_MS,
    refetchIntervalInBackground: false,
  });
  const unreadCount = notifData?.unreadCount || 0;
  ```
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:117-125` —— **Profile 页内没有铃铛**；PC 的铃铛在常驻侧栏顶栏：`gacode-electron/src/components/layout/AppShell.tsx:190-202`
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Profile.tsx:168-181`
  - 实际形态：页内补铃铛入口 —— `<button aria-label="通知中心" className="relative w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center">` + 未读角标 `<span className="absolute top-1.5 right-1.5 … min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold bg-brand text-brand-on">{formatUnreadBadge(unreadCount)}</span>`，与 web `profile/page.tsx:189-202` 同款。

---

### C2-04 · 铃铛按钮尺寸与 hover 三态：侧栏那个也不一致

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:194`
  ```tsx
  className="relative w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center"
  ```
  （web 的 Drawer 铃铛 `gacode-web/src/components/layout/Drawer.tsx:193` 是**同一串**，两端一致）
- **PC 端**：`gacode-electron/src/components/layout/AppShell.tsx:194`
  ```tsx
  className="relative w-8 h-8 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center"
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547` + `78d6b8c`）**
  - PC 侧锚点：页内铃铛 `src/routes/Profile.tsx:173`；侧栏铃铛 `src/components/layout/AppShell.tsx:351`
  - 实际形态：两端按钮串逐字一致 `relative w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center`（web `Drawer.tsx:193`）；图标两端都是 **20px**（web `w-5 h-5`，PC `AppShell.tsx:359` `<BellIcon />` 默认 `size = 20`）。

---

### C2-05 · `formatUnreadBadge` 函数：PC 缺失

- **web 端**：`gacode-web/src/lib/notifications.ts:495-498`
  ```ts
  export function formatUnreadBadge(count: number): string {
    const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    return n > 99 ? "99+" : String(n);
  }
  ```
- **PC 端**：**PC 缺失该函数**；PC 在两处内联了等价逻辑：
  - `gacode-electron/src/components/layout/AppShell.tsx:199` → `{unreadCount > 99 ? "99+" : unreadCount}`
  - `gacode-electron/src/routes/Profile.tsx` 无（因为没有铃铛，见 C2-03）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/lib/notifications.ts:489-492`
  - 实际形态：`export function formatUnreadBadge(count: number): string { const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0; return n > 99 ? "99+" : String(n); }` —— 负数/小数兜底 + `99+` 封顶，与 web `src/lib/notifications.ts:495` 一致；调用点 `Profile.tsx:167`、`AppShell.tsx:362`。

---

### C2-06 · 头像尺寸与圆角：72px 方形 vs 96px 圆形

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:221-227`
  ```tsx
  <img
    src={avatarSrc}
    alt={displayName}
    width={72}
    height={72}
    className="w-[72px] h-[72px] rounded-xl object-cover"
  />
  ```
  （web 注释 L213-215 明确写：原 `w-18 h-18` 不是合法 Tailwind class，头像宽高会塌成 0，所以改写任意值 `w-[72px] h-[72px]`）
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:133-137`
  ```tsx
  <img
    src={avatarSrc}
    alt={displayName}
    className="w-24 h-24 rounded-full object-cover"
  />
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Profile.tsx:199-205`
  - 实际形态：`<img src={avatarSrc} alt={displayName} width={72} height={72} className="w-[72px] h-[72px] rounded-xl object-cover" />` —— 72px + `rounded-xl`=22px（不再是 96px 圆形），与 web `profile/page.tsx:221-227` 逐字一致。

---

### C2-07 · 头像缺省图：Cody 占位图 vs 首字母圆底

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:156`
  ```tsx
  const avatarSrc = user?.avatar || `${BASE_PATH}/assets/cody/cody_192.png`; // 头像缺失时 Cody 占位
  ```
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:110` + `:138-145`
  ```tsx
  const avatarSrc = user?.avatar || "";
  ...
  ) : (
    <div
      aria-hidden="true"
      className="w-24 h-24 rounded-full bg-brand/30 border border-brand/40 flex items-center justify-center text-fg text-2xl font-medium"
    >
      {displayName.trim().charAt(0).toUpperCase() || "?"}
    </div>
  )}
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `78d6b8c`）**
  - PC 侧锚点：`src/routes/Profile.tsx:161-162`（取值）+ `public/assets/cody/cody_192.png`（资产，42110 bytes，从 web 仓拷贝、SHA256 双边一致）
  - 实际形态：`const avatarSrc = user?.avatar || \`${import.meta.env.BASE_URL}assets/cody/cody_192.png\`;` —— **必须**用 `import.meta.env.BASE_URL` 拼相对路径（PC 打包后 renderer 走 `file://`，写 `/assets/...` 会解析到文件系统根 → 裂图）。

---

### C2-08 · 头像 loading 骨架 className

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:218`
  ```tsx
  <div className="w-[72px] h-[72px] rounded-xl bg-bg-elevated animate-pulse" />
  ```
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:131`
  ```tsx
  <div className="w-24 h-24 rounded-full bg-bg-elevated animate-pulse" />
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Profile.tsx:196`
  - 实际形态：`<div className="w-[72px] h-[72px] rounded-xl bg-bg-elevated animate-pulse" />`，与 web `profile/page.tsx:218` 逐字一致。

---

### C2-09 · 用户名标题 `<h1>`：已一致

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:229` → `<h1 className="text-2xl font-medium mt-3 text-center">{displayName}</h1>`
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:163` → `<h1 className="text-2xl font-medium mt-3 text-center">{displayName}</h1>`
- **差异判定**：**已一致**（逐字相同）
- **怎么改**：**无需改（现状已一致）**
  - PC 侧锚点：`src/routes/Profile.tsx:224`
  - 实际形态：`<h1 className="text-2xl font-medium mt-3 text-center">{displayName}</h1>`，与 web `profile/page.tsx:229` 逐字相同。

---

### C2-10 · 邮箱行颜色：`text-fg-muted + opacity-70` vs `text-fg-subtle`

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:230-232`
  ```tsx
  {user?.email && (
    <p className="text-xs text-fg-muted mt-1 opacity-70">{user.email}</p>
  )}
  ```
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:165-167`
  ```tsx
  {email !== "(未设置)" ? (
    <p className="text-xs text-fg-subtle mt-1">{email}</p>
  ) : null}
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Profile.tsx:226-228`
  - 实际形态：`<p className="text-xs text-fg-muted mt-1 opacity-70">{email}</p>` —— `text-fg-muted`=`#9ca3af` + `opacity-70`，与 web `profile/page.tsx:230-232` 一致。

---

### C2-11 · 信息卡结构：4 个独立卡 vs 1 个卡内分隔线

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:236-254`
  ```tsx
  <div className="space-y-2">
    <ProfileRow label="名字" value={displayName} />
    <ProfileRow label="UID" value={user?.id || "—"} rightSlot={<CopyUidButton uid={user?.id || ""} />} />
    <ProfileRow label="性别" value={genderText} />
    <ProfileRow label="简介" value={bioText} />
  </div>
  ```
  每行 = 一个**独立**的 `w-full rounded-md bg-bg-elevated p-4` 圆角卡，行间 `space-y-2`=8px
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:171-180`
  ```tsx
  <div className="rounded-md bg-bg-elevated divide-y divide-border">
    <UidRow uid={uid} />
    <InfoRow label="邮箱" value={email} />
    <InfoRow label="性别" value={genderText} />
    <InfoRow label="简介" value={bioText} />
    <InfoRow label="注册时间" value={user?.createdAt ? formatDate(user.createdAt) : "-"} />
  </div>
  ```
  PC = **一个** `rounded-md bg-bg-elevated` 大卡，内部用 `divide-y divide-border`（1px `#363b41`）分隔
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Profile.tsx:232-246`（调用点）+ `:347-369`（新增 `ProfileRow` 组件）
  - 实际形态：改成 web 的**多张独立卡** —— `<div className="space-y-2">` 里逐个 `<ProfileRow … />`，每行 = `w-full rounded-md bg-bg-elevated p-4 flex justify-between items-center` + `transition-colors duration-150`。**PC 保留自己多出的「邮箱」「注册时间」两行**（`S-2` 方案 b：视觉 1:1 对齐 web、信息不删）。

---

### C2-12 · 信息行 label / value 前景色对调

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:74-76`
  ```tsx
  <span className="text-sm font-medium shrink-0">{label}</span>
  <span className="flex items-center gap-2 min-w-0">
    <span className="text-sm text-fg-muted truncate max-w-[200px]">{value}</span>
  ```
  → **label = 主色 + font-medium（无显式色，继承 `--fg`）**，**value = `text-fg-muted`**
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:436-441`
  ```tsx
  <span className="w-20 text-sm text-fg-muted shrink-0">{label}</span>
  <span
    className={[
      "flex-1 text-sm text-fg min-w-0 break-all",
      mono ? "font-mono" : "",
    ].join(" ")}
  >
  ```
  → **label = `text-fg-muted`**，**value = `text-fg`（主色）** —— 与 web **完全对调**
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Profile.tsx:362`（label）+ `:353`（value）
  - 实际形态：label `<span className="text-sm font-medium shrink-0">`（主色，继承 `--fg`）；value `<span className="text-sm text-fg-muted truncate max-w-[200px]">`（次色）—— 与 web `profile/page.tsx:74-76` 逐字一致，主次颠倒已消除。

---

### C2-13 · 值超长处理：`truncate max-w-[200px]` vs `break-all`

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:76` → `<span className="text-sm text-fg-muted truncate max-w-[200px]">{value}</span>`
  → **单行 + 省略号**，宽度封顶 200px
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:439` → `"flex-1 text-sm text-fg min-w-0 break-all"`
  → **不截断，撑满容器宽度 + 逐字断行**（`break-all` 会在任意字符处断开，中文/英文都硬断）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Profile.tsx:364`
  - 实际形态：值改 `truncate max-w-[200px]`（单行 + 省略号，宽度封顶 200px），`break-all` 已删。

---

### C2-14 · 信息列表缺「名字」行

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:237-240`
  ```tsx
  <ProfileRow
    label="名字"
    value={displayName}
  />
  ```
  web 的信息列表是 **名字 / UID / 性别 / 简介** 四行
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:172-179` —— **UID / 邮箱 / 性别 / 简介 / 注册时间** 五行，**没有「名字」行**
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Profile.tsx:233`
  - 实际形态：补 `<ProfileRow label="名字" value={displayName} />`（排在 UID 行之前），与 web `profile/page.tsx:237-240` 同序。

---

### C2-15 · UID 行的值样式：`font-mono` + `break-all`

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:242-245`
  ```tsx
  <ProfileRow
    label="UID"
    value={user?.id || "—"}
    rightSlot={<CopyUidButton uid={user?.id || ""} />}
  />
  ```
  → 值走 `ProfileRow` 通用样式：`text-sm text-fg-muted truncate max-w-[200px]`，**无等宽字体**
  → 空值兜底是 **`"—"`**（中文破折号 U+2014）
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:305-307`
  ```tsx
  <span className="flex-1 text-sm text-fg font-mono min-w-0 break-all">
    {uid}
  </span>
  ```
  → 值 = `text-fg`（主色）+ `font-mono` + `break-all`；空值兜底在 L111 是 `"-"`（**半角**连字符，非 web 的 `—`）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Profile.tsx:364`（值样式）+ `:163`（空值兜底）
  - 实际形态：UID 值走 `ProfileRow` 通用样式 `text-sm text-fg-muted truncate max-w-[200px]`（`font-mono` 已删）；`const uid = user?.id || "—";` —— 中文破折号 U+2014，与 web 一致。

---

### C2-16 · 复制 UID 按钮尺寸：`w-7 h-7` vs `w-8 h-8`

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:109`
  ```tsx
  className="shrink-0 w-7 h-7 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center"
  ```
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:312`
  ```tsx
  className="shrink-0 w-8 h-8 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center"
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Profile.tsx:407`
  - 实际形态：`shrink-0 w-7 h-7 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center` —— 28px（不再是 32px），hover 三态保持一致。

---

### C2-17 · 复制成功态图标：已一致

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:111`
  ```tsx
  {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
  ```
- **PC 端**（**2026-10-27 订正**：图形本体已由 `a7fc845` 收编进共享 `Glyphs.tsx`，下面两行是写入当时的快照）：`gacode-electron/src/routes/Profile.tsx:314` → `{copied ? <CheckIcon /> : <CopyIcon />}`，其中
  - `CopyIcon`（L560-567）：`width="14" height="14"` + lucide `Copy` 同款 path → = 14px = `w-3.5` ✅
  - `CheckIcon`（L569-575）：`width="14" height="14"` + `className="text-success"` + `strokeWidth="2"` → = 14px = `w-3.5` ✅
  - **现址**：调用点 `src/routes/Profile.tsx:409-413`；图形本体 `src/components/ui/Glyphs.tsx` 的 `CopyIcon`（`:1981`）/ `CheckGlyph`（`:637`）
- **差异判定**：**已一致**（尺寸、颜色、图形、stroke-width 全对齐）
- **怎么改**：**无需改（现状已一致）** —— 本条从来不需要改；commit `a7fc845` 把图形本体从 `Profile.tsx` 收编进共享 `src/components/ui/Glyphs.tsx`（path 逐字取自 lucide-react v0.407.0 = web 同款），渲染零差异。
  - PC 侧锚点：调用点 `src/routes/Profile.tsx:409-413`；图形本体 `src/components/ui/Glyphs.tsx` 的 `CopyIcon`（`:1981`）/ `CheckGlyph`（`:637`）
  - 实际形态：`{copied ? <CheckGlyph size={14} strokeWidth={2} className="text-success" /> : <CopyIcon size={14} strokeWidth={1.6} />}`；两个 SVG 都是 `width={size} height={size}`、默认 14px（= web `w-3.5`），`CheckGlyph` 带 `className="text-success"`、`strokeWidth={2}`。

---

### C2-18 · 复制 UID 的 toast 文案与 variant（3 处）

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:96-107`
  ```tsx
  if (!uid) {
    toast({ title: "UID 不可用", variant: "warning" });
    return;
  }
  try {
    await navigator.clipboard.writeText(uid);
    setCopied(true);
    toast({ title: "UID 已复制", variant: "default" });
  } catch {
    toast({ title: "复制失败", variant: "danger" });
  }
  ```
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:284-299`
  ```tsx
  if (!uid || uid === "-") {
    toast({ message: "UID 暂不可用", variant: "warning" });
    return;
  }
  try {
    await navigator.clipboard.writeText(uid);
    setCopied(true);
    toast({ message: "UID 已复制", variant: "success" });
  } catch {
    toast({
      message: "复制失败,请手动选中复制",
      variant: "warning",
    });
  }
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547` + `00b2b5a`）**
  - PC 侧锚点：`src/routes/Profile.tsx:388` / `:394` / `:398`
  - 实际形态：三处 toast 全部改成 web 的 `title` 字段与 variant —— `toast({ title: "UID 不可用", variant: "warning" })` / `toast({ title: "UID 已复制", variant: "default" })` / `toast({ title: "复制失败", variant: "danger" })`，与 web `profile/page.tsx:96-107` 逐字一致（`Toast.tsx` 已支持 `title`，见 `C2-48`）。

---

### C2-19 · 「注销账户」触发按钮：4 处视觉差异

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:260-266`
  ```tsx
  <button
    type="button"
    className="w-full rounded-md bg-bg-elevated p-4 flex items-center gap-3 hover:bg-danger-soft/30 transition-colors duration-150 text-danger"
  >
    <Trash2 className="w-5 h-5 shrink-0" />
    <span className="flex-1 text-left text-base font-medium">注销账户</span>
  </button>
  ```
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:360-369`
  ```tsx
  <button
    type="button"
    onClick={() => setOpen(true)}
    className="w-full rounded-md border border-danger/30 bg-danger/5 p-4 flex items-center gap-3 text-left hover:bg-danger/10 transition-colors duration-150 text-danger"
    aria-label="注销账户"
  >
    <TrashIcon />
    <span className="flex-1 text-sm font-medium">注销账户</span>
    <ChevronRightIcon />
  </button>
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547` + `00b2b5a`）**
  - PC 侧锚点：`src/routes/Profile.tsx:456-467`
  - 实际形态：按钮改 `w-full rounded-md bg-bg-elevated p-4 flex items-center gap-3 hover:bg-danger-soft/30 transition-colors duration-150 text-danger`（`border border-danger/30` + `bg-danger/5` 已删，hover 改 `danger-soft/30`）；图标 `<TrashIcon size={20} className="w-5 h-5 shrink-0" />`（共享 `Glyphs.tsx:396`，`shrink-0` 补齐）；文字 `<span className="flex-1 text-left text-base font-medium">注销账户</span>`（16px）；右侧箭头已删。

---

### C2-20 · 注销确认弹窗视觉：AlertDialog vs ConfirmDialog（7 处）

- **web 端**：`gacode-web/src/components/ui/alert-dialog.tsx:86-108`（容器）+ `:137-200`（按钮）
  ```tsx
  // 容器 (alert-dialog.tsx:99-104)
  className={cn(
    "pointer-events-auto w-full max-w-md rounded-2xl bg-bg-elevated text-fg",
    "shadow-2xl border border-fg-muted/10 p-6 space-y-4",
    "animate-fade-in",
    className
  )}
  // 遮罩 (alert-dialog.tsx:90)
  className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
  // 外层 (alert-dialog.tsx:86)
  <div className="fixed inset-0 z-[60]">
  // 标题 (alert-dialog.tsx:143)
  className={cn("text-lg font-semibold text-fg", className)}
  // 描述 (alert-dialog.tsx:155)
  className={cn("text-sm text-fg-muted leading-relaxed", className)}
  // 取消 (alert-dialog.tsx:212-213)
  "h-9 px-4 rounded-md text-sm font-medium border border-fg-muted/20",
  "bg-bg-elevated hover:bg-bg-sunken transition-colors",
  // 确认 (alert-dialog.tsx:183-185)
  "h-9 px-4 rounded-md text-sm font-medium transition-colors",
  "disabled:opacity-50 disabled:pointer-events-none",
  toneClasses[tone]   // danger: "bg-danger text-white hover:bg-danger/90"
  ```
  footer 布局（`alert-dialog.tsx:127-133`）：`flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-2`
- **PC 端**：`gacode-electron/src/components/ui/ConfirmDialog.tsx:41-70`
  ```tsx
  <div role="dialog" aria-modal="true" aria-label={title}
    className="fixed inset-0 z-50 flex items-center justify-center px-4">
    <div className="absolute inset-0 bg-black/60 animate-fade-in" onClick={onCancel} aria-hidden="true" />
    <div className="relative w-full max-w-sm rounded-md bg-bg-elevated shadow-dialog p-5 animate-slide-in-from-bottom">
      <h2 className="text-base font-medium mb-1">{title}</h2>
      {message ? <p className="text-sm text-fg-muted mb-4">{message}</p> : null}
      ...
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="md" onClick={onCancel} disabled={loading}>{cancelLabel}</Button>
        <Button variant={confirmVariant === "danger" ? "danger" : "default"} size="md" loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </div>
  </div>
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/components/ui/ConfirmDialog.tsx:102`（外层）/ `:105`（遮罩）/ `:109`（面板）/ `:111`（标题）/ `:113`+`:116`（描述）/ `:120`（footer）/ `:78-89`（ESC + 锁滚动）
  - 实际形态：整段重排对齐 web `components/ui/alert-dialog.tsx` —— 外层 `fixed inset-0 z-[60] flex items-center justify-center px-4`；遮罩 `absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in`；面板 `pointer-events-auto relative w-full max-w-md rounded-2xl bg-bg-elevated text-fg shadow-2xl border border-fg-muted/10 p-6 space-y-4 animate-fade-in`；标题 `m-0 text-lg font-semibold text-fg`；描述 `m-0 text-sm text-fg-muted leading-relaxed`；footer `flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-2`；`useEffect` 监听 `Escape` + 锁 `document.body.style.overflow`。

---

### C2-21 · 注销确认弹窗文案

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:270-286`
  ```tsx
  <AlertDialogTitle>确定要注销账户吗?</AlertDialogTitle>
  <AlertDialogDescription>
    注销后,你的所有数据(账户、会话、知识库、设置)将被永久删除, 且无法恢复。
    此操作不可撤销, 请确认要继续。
  </AlertDialogDescription>
  ...
  <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
  <AlertDialogAction tone="danger" disabled={deleting} onClick={handleConfirmDelete}>
    {deleting ? "正在注销..." : "我确定, 注销"}
  </AlertDialogAction>
  ```
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:373-378`
  ```tsx
  title="确定要注销账户吗?"
  message="注销后,你的所有数据(账户、会话、知识库、设置)将被永久删除,且无法恢复。此操作不可撤销。"
  confirmLabel={deleteMutation.isPending ? "正在注销..." : "我确定,注销"}
  cancelLabel="取消"
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Profile.tsx:471`（标题）/ `:472`（描述）/ `:473-475`（确认按钮）/ `:476`（取消按钮）
  - 实际形态：标题 `确定要注销账户吗?`；描述 `注销后,你的所有数据(账户、会话、知识库、设置)将被永久删除, 且无法恢复。此操作不可撤销, 请确认要继续。`；确认按钮 `deleteMutation.isPending ? "正在注销..." : "我确定, 注销"`（逗号后空格已补）；取消 `取消`。**唯一残留**：web 的 JSX 换行会被折叠成 1 个空格（`…且无法恢复。 此操作…`），PC 写成单行无空格 ⇒ 差 1 个空格，不影响渲染。

---

### C2-22 · 注销走的后端端点不同（`/yinian/account` vs `/auth/account`）

- **web 端**：`gacode-web/src/lib/api.ts:1358-1364`
  ```ts
  // =========================================================================
  // Account — bug #7: 注销账户 (delete account)
  // DELETE /yinian/account — 后端从 JWT 提取 userId, hard-delete 用户 + 关联数据.
  // 调用方负责: 成功后清前端 cookie + 跳转 login + toast 反馈.
  // =========================================================================
  export const deleteAccount = () =>
    request<{ ok: boolean }>("/yinian/account", { method: "DELETE" });
  ```
  web 注释写的是 "hard-delete 用户 + 关联数据" —— **这句注释现在是准的**：`DELETE /api/v1/yinian/account` 已于 2026-10-15（`unified-api` commit `9e25a4d`「真注销账户」）改成转发 `authService.deleteAccount()`，与 `/auth/account` **行为一致**。
  > ⚠️ **事实订正（2026-10-26 复核）**：本文原稿写「web 的写法不删账号」，引的是 `unified-api/src/yinian.routes.js:377-381` → `yinianService.purgeUserData()`（只删 3 张 yinian 表）。**那个文件是未注册的死代码** —— 线上注册的是 `unified-api/src/server.js:29` + `:221` → `src/modules/yinian/yinian.routes.js`（前缀 `/api/v1/yinian`），它的 `DELETE /account`（`:579-582`）已经转发到 `authService.deleteAccount()`。`yinian.service.js:1245-1256` 的 `purgeUserData()` 仍然只删 3 张表，但它**已不在注销链路上**。
- **PC 端**：`gacode-electron/src/lib/api.ts:1311-1322`
  ```ts
  export function deleteAccount(): Promise<{...}> {
    return request<{...}>("/auth/account", { method: "DELETE" });
  }
  ```
  → `unified-api/src/modules/auth/auth.routes.js:189-193` → `authService.deleteAccount()` = **真删账号**
- **差异判定**：**已一致**
- **怎么改**：**已落地（两端已统一）**
  - PC 侧锚点：`src/lib/api.ts:1465-1476`（PC 本来就是 `/auth/account`，未动）
  - 实际形态：**web 端已改**（web 仓 commit `b84f872`，2026-10-26）—— `gacode-web/src/lib/api.ts:1365-1366` `deleteAccount()` → `request("/auth/account", { method: "DELETE" })`（注释「本仓统一走 /auth/account (与 PC 端一致)」）⇒ 两端端点路径一致，服务端行为都是 `authService.deleteAccount()` = **真删账号**。原先「必须 gaga 拍板」的前置条件已解除（`S-3` 已拍板口径落地）。

---

### C2-23 · 注销成功后的流程与 toast

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:159-184`
  ```tsx
  const handleConfirmDelete = async (e: React.MouseEvent) => {
    e.preventDefault();          // prevent AlertDialog 自动关闭
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteAccount();
      queryClient.clear();
      logout();
      toast({
        title: "账户已注销",
        description: "你的所有数据已永久删除",
        variant: "default",
      });
      setDeleteOpen(false);
    } catch (err: any) {
      toast({
        title: "注销失败",
        description: err?.message || "请稍后重试",
        variant: "danger",
      });
      setDeleting(false);
      // 保持弹窗打开, 让用户决定是重试还是取消
    }
  };
  ```
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:336-352` + `:240-250`
  ```tsx
  const deleteMutation = useMutation({
    mutationFn: () => deleteAccount(),
    onSuccess: () => {
      toast({
        message: "账户已注销,你的所有数据已永久删除",
        variant: "success",
      });
      setOpen(false);
      onDeleted();
    },
    onError: (err) => {
      toast({
        message: `注销失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });
  // onDeleted:
  queryClient.clear();
  void logout();
  navigate("/login", { replace: true });
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547` + `00b2b5a`）**
  - PC 侧锚点：`src/routes/Profile.tsx:435-443`（成功）/ `:444-451`（失败）/ `:305-313`（跳转）
  - 实际形态：成功 toast 改双行 `toast({ title: "账户已注销", description: "你的所有数据已永久删除", variant: "default" })`；失败 toast 改 `toast({ title: "注销失败", description: err?.message || "请稍后重试", variant: "danger" })`（前缀拼接消失 + 兜底文案补上）；成功后 `queryClient.clear()` → `logout()` → `navigate("/login", { replace: true })`，与 web `profile/page.tsx:159-184` 等价。

---

### C2-24 · 页脚版本号：PC 缺失

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:292-294`
  ```tsx
  <div className="mt-8 text-center text-xs text-fg-muted opacity-50">
    gacode-web · v0.1.0
  </div>
  ```
- **PC 端**：**PC 缺失**（`gacode-electron/src/routes/Profile.tsx` 全文无版本号文案）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Profile.tsx:316-318`
  - 实际形态：`<div className="mt-8 text-center text-xs text-fg-muted opacity-50">gacode-electron · v0.7.8</div>` —— 结构与 web `profile/page.tsx:291-293` 一致（产品名文案按端区分是合理差异）。⚠️ **残留**：版本号字面量 `v0.7.8` **已过期**（`package.json:3` 现为 `0.7.11`，本轮 `00b2b5a` 升版）⇒ 页脚显示的版本落后一个版本号，属待修小残留。

---

### C2-25 · 「编辑」按钮缺 `aria-label`

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:203-210`
  ```tsx
  <Button
    variant="ghost"
    size="sm"
    onClick={() => nav.client(router, "/profile/edit")}
    aria-label="编辑资料"
  >
    编辑
  </Button>
  ```
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:118-124`
  ```tsx
  <Button
    variant="ghost"
    size="sm"
    onClick={() => navigate("/profile/edit")}
  >
    编辑
  </Button>
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Profile.tsx:186`
  - 实际形态：`<Button variant="ghost" size="sm" onClick={() => navigate("/profile/edit")} aria-label="编辑资料">编辑</Button>` —— 无障碍属性补齐，与 web `profile/page.tsx:203-210` 一致。

---

### C2-26 · 未读轮询参数：`NOTIFICATION_POLL_MS`（45s）vs 硬编码 30s

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:142-150`
  ```tsx
  const { data: notifData } = useQuery({
    queryKey: ["notifications", { unread: true }],
    queryFn: () => listNotifications(true),
    retry: false,
    staleTime: 30 * 1000,
    refetchInterval: NOTIFICATION_POLL_MS,
    refetchIntervalInBackground: false,
  });
  ```
  `NOTIFICATION_POLL_MS = 45_000`（`gacode-web/src/lib/notification-stream.ts:39`）
- **PC 端**：`gacode-electron/src/components/layout/AppShell.tsx:136-140`
  ```tsx
  const { data: notifData } = useQuery({
    queryKey: ["notifications", { unread: true }],
    queryFn: () => listNotifications(true),
    refetchInterval: 30_000, // 30s 轮询, refetchOnWindowFocus 默认 false
  });
  ```
  → **30_000 硬编码**；且**缺 `retry: false` / `staleTime: 30_000` / `refetchIntervalInBackground: false`**
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `78d6b8c`）**
  - PC 侧锚点：`src/lib/notifications.ts:498`（常量）+ `src/components/layout/AppShell.tsx:243-250`（侧栏角标）+ `src/routes/Profile.tsx:88-95`（页内铃铛）
  - 实际形态：`export const NOTIFICATION_POLL_MS = 45_000;`；两处 query 均为 `retry: false` + `staleTime: 30 * 1000` + `refetchInterval: NOTIFICATION_POLL_MS` + `refetchIntervalInBackground: false`（原 `refetchInterval: 30_000` 硬编码 + 3 个 query 选项缺失）。

---

### 组 2a 小结
> **2026-10-27 回写**：组 2a **26 条全部已落地**（`7b74547` + `78d6b8c`；`C2-22` 的 web 侧端点统一也在本轮完成）。

| 编号 | 判定 | 落地 / 残留 |
|---|---|---|
| C2-01 | 已一致 | `7b74547` |
| C2-02 | 已一致 | `7b74547` |
| C2-03 | 已一致 | `7b74547` |
| C2-04 | 已一致 | `7b74547` + `78d6b8c` |
| C2-05 | 已一致 | `7b74547` |
| C2-06 | 已一致 | `7b74547` |
| C2-07 | 已一致 | `78d6b8c`（Cody 占位图资产落地） |
| C2-08 | 已一致 | `7b74547` |
| C2-09 | 已一致 | 本来就一致 |
| C2-10 | 已一致 | `7b74547` |
| C2-11 | 已一致 | `7b74547`（`S-2` 方案 b：多卡 + 保留 PC 的邮箱/注册时间两行） |
| C2-12 | 已一致 | `7b74547` |
| C2-13 | 已一致 | `7b74547` |
| C2-14 | 已一致 | `7b74547` |
| C2-15 | 已一致 | `7b74547` |
| C2-16 | 已一致 | `7b74547` |
| C2-17 | 已一致 | 本来就一致（`a7fc845` 图形收编进共享 `Glyphs.tsx`，渲染零差异） |
| C2-18 | 已一致 | `7b74547` + `00b2b5a`（Toast 支持 `title`） |
| C2-19 | 已一致 | `7b74547` + `00b2b5a`（`TrashIcon` 收编进共享 `Glyphs`） |
| C2-20 | 已一致 | `7b74547`（`ConfirmDialog` 整段重排对齐 web AlertDialog） |
| C2-21 | 已一致 | `7b74547`（残留：web JSX 换行折叠出的 1 个空格） |
| C2-22 | 已一致 | **两端已统一 `/auth/account`**（web `gacode-web/src/lib/api.ts:1365-1366`，web 仓 commit `b84f872`（2026-10-26）已改；PC 未动） |
| C2-23 | 已一致 | `7b74547` + `00b2b5a` |
| C2-24 | 已一致 | `7b74547`（残留：版本号字面量 `v0.7.8` 已过期，`package.json` 现为 `0.7.11`） |
| C2-25 | 已一致 | `7b74547` |
| C2-26 | 已一致 | `78d6b8c` |
---

### 组 2b · web `/profile/edit` ↔ PC `ProfileEdit.tsx`

**web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx`（268 行）
**PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx`（349 行）

#### web 端原文（头像区 + 昵称 + 性别，`gacode-web/src/app/(main)/profile/edit/page.tsx:150-220`）

```tsx
  return (
    <div className="px-4 lg:px-8 py-6 max-w-2xl mx-auto">
      {/* Avatar */}
      <div className="flex flex-col items-center mb-8">
        <div className="relative">
          <Avatar className="w-24 h-24">
            {avatarPreview && <AvatarImage src={avatarPreview} alt="avatar" />}
            <AvatarFallback seed={user?.username || user?.email}>
              {initials}
            </AvatarFallback>
          </Avatar>
          <button
            type="button"
            onClick={onPickAvatar}
            className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-brand text-brand-on flex items-center justify-center shadow-elevation-2 hover:bg-brand-hover transition-colors"
            aria-label="更换头像"
          >
            <Camera className="w-4 h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFileChange}
          />
        </div>
        <p className="text-xs text-fg-muted mt-2">点击相机图标更换头像</p>
      </div>

      {/* Nickname */}
      <div className="mb-5">
        <label className="block text-sm font-medium mb-2" htmlFor="displayName">
          昵称
        </label>
        <Input
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="你的昵称"
          maxLength={30}
        />
        <p className="text-xs text-fg-subtle mt-1">
          留空将使用用户名 ({user?.username})
        </p>
      </div>

      {/* Gender — segmented control */}
      <div className="mb-5">
        <label className="block text-sm font-medium mb-2">性别</label>
        <div className="inline-flex p-1 rounded-md bg-bg-elevated border border-border">
          {genderOptions.map((opt) => {
            const active = gender === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGender(opt.value)}
                className={cn(
                  "px-4 py-1.5 text-sm rounded transition-colors",
                  active
                    ? "bg-brand text-brand-on shadow-sm"
                    : "text-fg-muted hover:text-fg"
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
```

---

### C2-27 · 编辑页标题 `<h1>`：web 无（由全局 Header 渲染），PC 多一个

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:39-42`
  ```tsx
  useEffect(() => {
    setHeaderTitle("编辑资料");
    return () => setHeaderTitle("新对话");
  }, [setHeaderTitle]);
  ```
  → web 页面内**没有** `<h1>`，标题由全局 Header 渲染成「编辑资料」
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:169`
  ```tsx
  <h1 className="text-xl font-medium">编辑资料</h1>
  ```
  同时 PC 的 AppShell header 也渲染标题：`gacode-electron/src/components/layout/AppShell.tsx:46` → `if (pathname === "/profile/edit") return "编辑资料";`
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/ProfileEdit.tsx`（页内 `<h1>` 已删）+ `src/components/layout/AppShell.tsx:114`
  - 实际形态：标题只由 AppShell header 渲染 —— `if (pathname === "/profile/edit") return "编辑资料";`；编辑页内不再重复渲染标题。

---

### C2-28 · 头像区块结构：web 独立居中 96px + 提示语，PC 64px 塞进信息卡

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:153-178`（见上方原文）
  - 容器 `flex flex-col items-center mb-8`
  - `Avatar className="w-24 h-24"` = **96px 圆形**
  - 提示语 `<p className="text-xs text-fg-muted mt-2">点击相机图标更换头像</p>`
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:173-212`
  ```tsx
  <div className="flex items-center gap-4 rounded-md bg-bg-elevated p-4">
    <div className="relative shrink-0">
      {profile?.avatar ? (
        <img src={profile.avatar} alt={...} className="w-16 h-16 rounded-full object-cover" />
      ) : (
        <div aria-hidden="true" className="w-16 h-16 rounded-full bg-brand/30 border border-brand/40 flex items-center justify-center text-fg text-xl font-medium">
          {initial}
        </div>
      )}
      <button ... className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-brand text-brand-on flex items-center justify-center hover:bg-brand-hover transition-colors duration-150 disabled:opacity-50" aria-label="更换头像">
        <CameraIcon />
      </button>
      ...
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium">头像</p>
      <p className="text-xs text-fg-subtle mt-1">
        支持 JPG / PNG / WebP,最大 5 MB
      </p>
    </div>
  </div>
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/ProfileEdit.tsx:199-219`
  - 实际形态：头像区改成 web 的**独立居中 96px** —— `:201-203` `<Avatar seed={profile?.username || profile?.email} src={avatarPreview}>{initials}</Avatar>`（`src/components/ui/Avatar.tsx:52-54` `h-24 w-24 rounded-full`）+ `:220` 提示语 `点击相机图标更换头像`；原先塞在信息卡里的 64px 头像已删。与 web `profile/edit/page.tsx:152-178` 逐字一致。

---

### C2-29 · 头像 fallback 配色：hash 调色板 vs 固定 brand 淡色

- **web 端**：`gacode-web/src/components/ui/avatar.tsx:12-28` + `:65-86`
  ```tsx
  const PALETTE = [
    "#FF6B35", // brand
    "#0dcaf0", // cyan
    "#ffc700", // yellow
    "#c8102e", // red
    "#198754", // green
  ];

  function hashColor(input: string): string {
    let h = 0;
    for (let i = 0; i < input.length; i += 1) {
      h = (h * 31 + input.charCodeAt(i)) | 0;
    }
    const idx = Math.abs(h) % PALETTE.length;
    return PALETTE[idx];
  }
  ```
  → `AvatarFallback` 的底色 = 由 `seed`（用户名/邮箱）hash 出来的 5 色调色板之一，文字色固定 `#000000`；无 seed 时底色 `#181818` + 文字 `#e5e7eb`
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:182-188`
  ```tsx
  <div
    aria-hidden="true"
    className="w-16 h-16 rounded-full bg-brand/30 border border-brand/40 flex items-center justify-center text-fg text-xl font-medium"
  >
    {initial}
  </div>
  ```
  → 固定 `bg-brand/30` + `border-brand/40` + `text-fg`（**不是** hash 色，也不是黑字）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/components/ui/Avatar.tsx:14-20`（调色板）+ `:22-29`（hash）+ `:52-61`（渲染）
  - 实际形态：5 色 hash 调色板 `#FF6B35` / `#0dcaf0` / `#ffc700` / `#c8102e` / `#198754`（文字固定 `#000000`）；无 seed 时 `#181818` + `#e5e7eb`。不再固定 `bg-brand/30` 首字母。

---

### C2-30 · 相机按钮尺寸与阴影

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:164`
  ```tsx
  className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-brand text-brand-on flex items-center justify-center shadow-elevation-2 hover:bg-brand-hover transition-colors"
  ```
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:193`
  ```tsx
  className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-brand text-brand-on flex items-center justify-center hover:bg-brand-hover transition-colors duration-150 disabled:opacity-50"
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/ProfileEdit.tsx:204-211`
  - 实际形态：`<button className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-brand text-brand-on flex items-center justify-center shadow-elevation-2 hover:bg-brand-hover transition-colors" aria-label="更换头像">` —— 32px + `shadow-elevation-2` 补齐，与 web `profile/edit/page.tsx:161-167` 逐字一致。

---

### C2-31 · 昵称长度上限：`maxLength={30}` vs `maxLength={64}`

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:190` → `maxLength={30}`
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:227` → `maxLength={DISPLAY_NAME_MAX}`，`const DISPLAY_NAME_MAX = 64;`（L43）
- **服务端事实**（F-6）：`unified-api/src/modules/gacode/gacode.profile.routes.js:91` → `displayName: { type: ['string','null'], maxLength: 50 }` —— **服务端允许 50**
  - ⚠️ **修正（2026-10-26 复核 · E1）**：原稿引的 `unified-api/src/modules/yinian/profile.routes.js:46`（maxLength 64）属于**没人调用的** `/api/v1/auth/profile` 路由；两端实际调的是 `/api/v1/gacode/profile`（web `src/lib/api.ts:264` / PC `src/lib/api.ts:1164`）⇒ 上限是 **50**，不是 64
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/ProfileEdit.tsx:65`（常量）+ `:236`（`maxLength`）
  - 实际形态：`const DISPLAY_NAME_MAX = 30;`（原 64）；`maxLength={DISPLAY_NAME_MAX}` 引用同一常量 ⇒ 前端上限 30 ≤ 服务端 50，**顺带消掉「昵称 51~64 字保存 400」的现网 bug**。

---

### C2-32 · 昵称空值语义：`undefined`（不更新）vs `null`（清空）

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:109-113`
  ```tsx
  await updateProfile({
    displayName: displayName.trim() || undefined,
    gender,
    bio: bio.trim() || undefined,
  });
  ```
  → 空昵称传 `undefined` → `JSON.stringify` **直接丢掉该 key** → 服务端 `data.displayName` 不被赋值 → **原昵称保留**（页面上写着「留空将使用用户名」，但实际是「留空不改」）
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:144-148`
  ```tsx
  saveMutation.mutate({
    displayName: trimmedName.length > 0 ? trimmedName : null,
    gender,
    bio: trimmedBio.length > 0 ? trimmedBio : null,
  });
  ```
  → 空昵称传 `null` → 服务端 `gacode/gacode.profile.routes.js:107` `if (displayName !== undefined) data.displayName = displayName;` → `data.displayName = null` → **昵称被清空**（`:107` 注释明写「string | null 都接受 (允许清空)」）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/ProfileEdit.tsx:169-173`（调用点）+ `src/lib/api.ts:1306-1315`（类型）
  - 实际形态：`saveMutation.mutate({ displayName: trimmedName.length > 0 ? trimmedName : undefined, gender, bio: trimmedBio.length > 0 ? trimmedBio : undefined })`；`UpdateProfileInput` 的 `displayName?: string | null` → `displayName?: string`（`null` 去掉，语义 = 不更新而非清空）。

---

### C2-33 · 简介长度上限：`BIO_MAX = 200` vs `500`

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:29` → `const BIO_MAX = 200;`；`:232` → `maxLength={BIO_MAX}`；`:137-143` 软校验 `if (bio.length > BIO_MAX)` toast `简介不能超过 ${BIO_MAX} 字`
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:64` → `const BIO_MAX = 200;`；`:302` → `maxLength={BIO_MAX}`；`:160-166` 软校验（**已落地**，原为 `:42` / `:293` / `:129-140` 与 `500`）
- **服务端事实**（F-6）：`gacode/gacode.profile.routes.js:93` → `bio: { type: ['string','null'], maxLength: 200 }` —— **服务端允许 200**
  - ⚠️ **修正（2026-10-26 复核 · E1）**：原稿引的 `unified-api/src/modules/yinian/profile.routes.js:48`（maxLength 500）属于**没人调用的** `/api/v1/auth/profile` 路由 ⇒ 上限是 **200**，不是 500
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/ProfileEdit.tsx:64`（常量）+ `:302`（`maxLength`）
  - 实际形态：`const BIO_MAX = 200;`（原 500）⇒ **消掉「简介 201~500 字保存 400」的现网 bug**；软校验文案 `ProfileEdit.tsx:157-161`「简介不能超过 200 字」。

---

#### ✅ 已修复的历史 bug · PC 昵称 / 简介长度上限超出服务端 → 保存 400（`7b74547` 已修，**当前不在犯**）

> ⚠️ **2026-10-27 订正**：本条原标题是「⚠️ 现网 bug …（**当前就在犯**）」，那是 **2026-10-26 写这份台账时的快照**。
> 代码侧**早在 `7b74547` 就已修复**（`src/routes/ProfileEdit.tsx` 的常量已改成 **30 / 200**，与 web 同款）⇒
> **本条不是现网 bug，是历史记录**，保留在此仅作决策留痕。**不要再按下面的「改法」去改代码。**

- **当时的性质**：**现网 bug**（不是形态差异，不计入差异统计 —— 统计口径见文末「全量统计」）
- **现象**：PC 端「编辑资料」页保存时，只要昵称 **51~64 字**、或简介 **201~500 字**，服务端 `PUT /api/v1/gacode/profile` 的 Fastify schema 校验失败 → 返回 **400** → 用户看到保存失败，数据存不进去（**前端软校验放行、后端 schema 拒收**）
- **根因**：

  | 字段 | PC 常量（**当时**） | 服务端上限 | 当时的出错区间 | **当前值（已修）** |
  |---|---|---|---|---|
  | 昵称 | `DISPLAY_NAME_MAX = 64` | **50**（`unified-api/src/modules/gacode/gacode.profile.routes.js:91`） | 51~64 字 → 400 | **`30`**（`src/routes/ProfileEdit.tsx:65`，1:1 对齐 web `profile/edit/page.tsx:190` 的 `maxLength={30}`） |
  | 简介 | `BIO_MAX = 500` | **200**（`unified-api/src/modules/gacode/gacode.profile.routes.js:93`） | 201~500 字 → 400 | **`200`**（`src/routes/ProfileEdit.tsx:64`，与 web `BIO_MAX = 200` 一致） |

  PC 当时的软校验按**自己的常量**放行，服务端按 **50 / 200** 拒收 ⇒ 前端上限必须 ≤ 服务端上限
- **修复方式**（**已落地**，commit `7b74547`）：两个常量改成 `30 / 200`（前端 `maxLength` 直接引用同一常量，自动同步）⇒ 前端上限 ≤ 服务端上限 ⇒ 该 400 消失。**为什么取 30 而不是 50**：50 是能消除 400 的必要条件，但 **1:1 对齐 web 取 30**（同样消除 400 且两端 UI 行为完全一致）⇒ 取 30。详见 C2-31 / C2-33（判定均为「已一致」）。



- **优先级**：**高**（用户可感知的保存失败）。改完必须真机验证「昵称 50 字 / 简介 200 字」能保存成功

---

### C2-34 · 性别选项缺「其他」

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:21-27`
  ```tsx
  type Gender = "male" | "female" | "unspecified";

  const genderOptions: Array<{ value: Gender; label: string }> = [
    { value: "male", label: "男" },
    { value: "female", label: "女" },
    { value: "unspecified", label: "保密" },
  ];
  ```
  → **3 个选项**，且 TS 类型里**不含** `"other"`
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:35-40`
  ```tsx
  const GENDER_OPTIONS: Array<{ value: Gender; label: string }> = [
    { value: "unspecified", label: "保密" },
    { value: "male", label: "男" },
    { value: "female", label: "女" },
    { value: "other", label: "其他" },
  ];
  ```
  → **4 个选项**，顺序也不同（PC 把「保密」放第一位）
- **服务端事实**：`gacode/gacode.profile.routes.js:92` → `gender: { type: 'string', enum: ALLOWED_GENDERS }`，`ALLOWED_GENDERS = ['male','female','other','unspecified']`（`:25`）—— **服务端允许 4 个**
  - ⚠️ **修正（2026-10-26 复核 · E1 同类）**：原稿引的 `profile.routes.js:47` / `:22` 属于未调用的 `/api/v1/auth/profile` 那条路由；实际服务端的性别枚举在 `gacode/gacode.profile.routes.js:92` / `:25`，**结论不变（4 个值）**
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/ProfileEdit.tsx:58-62`
  - 实际形态：`GENDER_OPTIONS` 收敛成 3 项且顺序与 web 一致 —— 男 / 女 / 保密（PC 原先是 保密 / 男 / 女 / 其他 4 项）；「其他」已删。已有 `gender === "other"` 的账号打开时三个按钮都不高亮、原样提交不丢数据（`ProfileEdit.tsx:51-53` 注释留档）。

---

### C2-35 · 性别分段控件容器缺 `border border-border`

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:200`
  ```tsx
  <div className="inline-flex p-1 rounded-md bg-bg-elevated border border-border">
  ```
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:258`
  ```tsx
  <div className="inline-flex p-1 rounded-md bg-bg-elevated gap-1">
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/ProfileEdit.tsx:267`
  - 实际形态：`<div className="inline-flex p-1 rounded-md bg-bg-elevated border border-border">` —— 补 `border border-border`、删掉 PC 多余的 `gap-1`，与 web `profile/edit/page.tsx:200` 逐字一致。

---

### C2-36 · 性别按钮缺 `duration-150`

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:208-213`
  ```tsx
  className={cn(
    "px-4 py-1.5 text-sm rounded transition-colors",
    active
      ? "bg-brand text-brand-on shadow-sm"
      : "text-fg-muted hover:text-fg"
  )}
  ```
  → `transition-colors` **无 duration** → Tailwind 默认 150ms
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:266-271`
  ```tsx
  className={[
    "px-4 py-1.5 text-sm rounded transition-colors duration-150",
    active
      ? "bg-brand text-brand-on shadow-sm"
      : "text-fg-muted hover:text-fg",
  ].join(" ")}
  ```
  → 显式 `duration-150`
- **差异判定**：**形态不同**（**视觉无差** —— Tailwind `transition-colors` 默认 duration 就是 150ms，PC 显式写出来与 web 的隐式默认**完全等价**）
- **怎么改**：**未落地（残留 1 处 className 冗余）** —— **不派工**。
  - PC 侧锚点：`src/routes/ProfileEdit.tsx:276`
  - 实际形态：PC 仍是 `"px-4 py-1.5 text-sm rounded transition-colors duration-150"`，web `profile/edit/page.tsx:209` 无 `duration-150`。**零视觉差异**：① Tailwind `transition-colors` 默认时长就是 150ms；② PC `src/styles/globals.css:408-414` 全局 `transition-property/duration: none !important` ⇒ 任何过渡都不生效 ⇒ 本条归「本轮不做」。

---

### C2-37 · 简介输入：PC 缺 `Textarea` 组件

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:227-234`
  ```tsx
  <Textarea
    id="bio"
    value={bio}
    onChange={(e) => setBio(e.target.value)}
    rows={4}
    maxLength={BIO_MAX}
    placeholder="介绍一下自己..."
  />
  ```
  组件本体（`gacode-web/src/components/ui/textarea.tsx:20-30`）：
  ```tsx
  className={cn(
    "flex w-full rounded-md border border-border bg-bg-elevated px-4 py-3 text-base",
    "placeholder:text-fg-subtle shadow-sm resize-y min-h-[88px]",
    "transition-colors duration-150",
    "focus:outline-none focus:border-brand",
    "disabled:cursor-not-allowed disabled:opacity-50",
    className
  )}
  ```
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:288-303` —— **裸 `<textarea>`**，无组件
  ```tsx
  className={[
    "flex w-full rounded-md border border-border bg-bg-sunken px-4 py-3 text-base",
    "placeholder:text-fg-subtle",
    "transition-colors duration-150",
    "focus:outline-none focus:border-brand",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "resize-y",
  ].join(" ")}
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：新组件 `src/components/ui/Textarea.tsx:26-34`；调用点 `src/routes/ProfileEdit.tsx:297-304`
  - 实际形态：`"flex w-full rounded-md border border-border bg-bg-elevated px-4 py-3 text-base"` + `"placeholder:text-fg-subtle shadow-sm resize-y min-h-[88px]"` + `"transition-colors duration-150"` + `"focus:outline-none focus:border-brand"` + `"disabled:cursor-not-allowed disabled:opacity-50"` —— 底色 `bg-bg-elevated`、`shadow-sm`、`min-h-[88px]` 三处与 web `components/ui/textarea.tsx` 逐字一致。

---

### C2-38 · 保存按钮：尺寸 `lg` vs 默认 + 缺图标

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:249-264`
  ```tsx
  <Button className="flex-1 gap-2" onClick={onSave} disabled={saving}>
    {saving ? (
      <Loader2 className="w-4 h-4 animate-spin" />
    ) : (
      <Save className="w-4 h-4" />
    )}
    保存
  </Button>
  ```
  → web `Button` 无 `variant`/`size` → 走 default：`h-9 px-4 py-2`（36px 高）
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:327-335`
  ```tsx
  <Button
    variant="default"
    size="lg"
    className="flex-1"
    onClick={onSave}
    loading={saveMutation.isPending}
  >
    保存
  </Button>
  ```
  → PC `size="lg"` = `h-12 px-6 text-base`（**48px 高**）；无图标
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547` + `00b2b5a`）**
  - PC 侧锚点：`src/routes/ProfileEdit.tsx:327-343`
  - 实际形态：`<Button variant="default" className="flex-1 gap-2" onClick={onSave} disabled={saving}>` —— 去掉 `size="lg"`（回落 `md` = `h-9 px-4 py-2` = 36px，与 web default 同高）+ 图标三元（`:334-338` `<LoaderCircleIcon size={16} strokeWidth={1.6} className="w-4 h-4 animate-spin" />` / `:340` `<SaveIcon className="w-4 h-4" />`，共享 `Glyphs.tsx:1366`）；`loading` prop 不再传（不再出现 spinner + 文字并存）。

---

### C2-39 · 取消按钮：尺寸 + 返回方式

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:249-256`
  ```tsx
  <Button
    variant="outline"
    className="flex-1"
    onClick={() => router.back()}
    disabled={saving}
  >
    取消
  </Button>
  ```
  → `router.back()` = **浏览器历史后退**（可能退到别的页面）；`disabled={saving}`
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:318-326`
  ```tsx
  <Button
    variant="outline"
    size="lg"
    className="flex-1"
    onClick={() => navigate("/profile")}
    disabled={saveMutation.isPending}
  >
    取消
  </Button>
  ```
  → `navigate("/profile")` = **固定跳 Profile 页**（不走历史）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/ProfileEdit.tsx:319-326`（按钮）+ `:176-181`（`handleBack`）
  - 实际形态：取消按钮去掉 `size="lg"`（回落 36px）；`onClick={handleBack}`，实现 `if (window.history.length > 1) navigate(-1); else navigate("/profile");` —— 与 web `router.back()` 同语义（无历史时兜底回 Profile，PC 版更稳）。

---

### C2-40 · `Button` outline / ghost 变体本身与 web 不一致（组件级）

- **web 端**：`gacode-web/src/components/ui/button.tsx:6-22`
  ```tsx
  const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
    {
      variants: {
        variant: {
          default: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
          destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
          outline: "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
          secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
          ghost: "hover:bg-accent hover:text-accent-foreground",
          link: "text-primary underline-offset-4 hover:underline",
        },
        size: {
          default: "h-9 px-4 py-2",
          sm: "h-8 rounded-md px-3 text-xs",
          lg: "h-10 rounded-md px-8",
          icon: "h-9 w-9",
        },
      },
    }
  );
  ```
- **PC 端**：`gacode-electron/src/components/ui/Button.tsx:25-40`
  ```tsx
  const variantClass: Record<ButtonVariant, string> = {
    default: "bg-brand text-brand-on hover:bg-brand-hover active:bg-brand-active shadow",
    ghost:   "bg-transparent text-fg hover:bg-bg-elevated active:bg-bg-sunken",
    danger:  "bg-danger text-white hover:bg-danger/90 active:bg-danger/80 shadow",
    outline: "bg-transparent text-fg border border-border hover:bg-bg-elevated active:bg-bg-sunken",
  };
  const sizeClass: Record<ButtonSize, string> = {
    sm: "h-8 px-3 text-sm",
    md: "h-10 px-4 text-sm",
    lg: "h-12 px-6 text-base",
  };
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/components/ui/Button.tsx:36-51`（variant）+ `:58-62`（size）+ `:94`（focus ring）
  - 实际形态：`default: bg-brand text-brand-on shadow hover:bg-brand/90` / `ghost: hover:bg-accent hover:text-accent-foreground` / `danger: bg-danger text-white shadow-sm hover:bg-danger/90` / `outline: border border-border bg-bg-base shadow-sm hover:bg-accent hover:text-accent-foreground`；size `sm: h-8 rounded-md px-3 text-xs` / `md: h-9 px-4 py-2 text-sm`（承担 web 的 default）/ `lg: h-10 rounded-md px-8 text-sm`；focus 改 `focus-visible:ring-1 focus-visible:ring-ring`（去 offset）—— 与 web `components/ui/button.tsx:6-22` 逐条对齐。⚠️ base 串刻意**不含** `text-xs`（PC 的 size 档自带字号，否则会盖掉 sm 档），理由写在 `Button.tsx:60-66`。

---

### C2-41 · 头像本地预览（选完立刻回显）缺失

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:65-80`
  ```tsx
  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "请选择图片文件", variant: "warning" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "图片不能超过 2 MB", variant: "warning" });
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(String(reader.result || ""));
    reader.readAsDataURL(file);
  };
  ```
  → **本地 dataURL 预览**，不等上传完成就换头像；同时 `setAvatarFile(file)` 记住待上传文件
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:86-99`
  ```tsx
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ message: "头像上传失败: ...", variant: "danger" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ message: "头像不能超过 5 MB", variant: "warning" });
      return;
    }
    avatarMutation.mutate(file);
    e.target.value = "";
  };
  ```
  → **没有本地预览**；直接上传，等 `invalidateQueries` 回来才换图
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/ProfileEdit.tsx:80-81`（state）+ `:108-111`（预览）
  - 实际形态：`const [avatarPreview, setAvatarPreview] = useState<string | null>(null);`；`handleFileChange` 里 `setAvatarFile(file)` + `new FileReader()` → `reader.onload = () => setAvatarPreview(String(reader.result || ""))` + `readAsDataURL(file)` ⇒ **选完立刻回显**，不等网络往返。

---

### C2-42 · 头像大小上限：`2 MB` vs `5 MB`

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:72-75`
  ```tsx
  if (file.size > 2 * 1024 * 1024) {
    toast({ title: "图片不能超过 2 MB", variant: "warning" });
    return;
  }
  ```
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:93-96`
  ```tsx
  if (file.size > 5 * 1024 * 1024) {
    toast({ message: "头像不能超过 5 MB", variant: "warning" });
    return;
  }
  ```
- **服务端事实**（F-6）：`gacode/gacode.profile.routes.js:27` → `const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB 上限`；超限直接 **413**（`:182-184`）—— **服务端硬上限 5MB**
  - ⚠️ **修正（2026-10-26 复核 · E1 同类）**：原稿引的 `profile.routes.js:24` 属于未调用的 `/api/v1/auth/profile` 那条路由，其注释「web 上传端会压到 2MB 以内, DB 5MB 兜底」**在 gacode 这条路由上不存在** ⇒ 「服务端注释明说 web 压到 2MB」的论据**不成立**，web 端的 2MB 限制只能按「前端自己的收敛」理解（结论不变：PC 对齐 web = 2MB；服务端上限仍是 5MB）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`，`ba2701b` 二次收口）**
  - PC 侧锚点：`src/routes/ProfileEdit.tsx:104-107`（编辑页）+ `src/routes/Profile.tsx:142-145`（Profile 页直传入口）
  - 实际形态：`if (file.size > 2 * 1024 * 1024) { toast({ title: "图片不能超过 2 MB", variant: "warning" }); return; }` —— 5MB → **2MB**，两处口径统一，与 web `profile/edit/page.tsx:72-75` 一致（服务端硬上限仍是 5MB）。

---

### C2-43 · 头像类型校验的 toast 反馈

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:68-71`
  ```tsx
  if (!file.type.startsWith("image/")) {
    toast({ title: "请选择图片文件", variant: "warning" });
    return;
  }
  ```
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:89-92`
  ```tsx
  if (!file.type.startsWith("image/")) {
    toast({ message: "头像上传失败: ...", variant: "danger" });
    return;
  }
  ```
  → PC 复用「上传失败」的 danger 文案（虽然实际根本没上传）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/ProfileEdit.tsx:100-103`
  - 实际形态：`toast({ title: "请选择图片文件", variant: "warning" })` —— 不再复用「头像上传失败 / danger」文案，与 web `profile/edit/page.tsx:68-71` 一致。

---

### C2-44 · 保存时重复上传头像 + 本地 store 立即更新

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:102-134`
  ```tsx
  const saveMutation = useMutation({
    mutationFn: async () => {
      let uploadedUrl: string | undefined;
      if (avatarFile) {
        const data: any = await uploadAvatar(avatarFile);
        uploadedUrl = data?.url || data?.avatar;
      }
      await updateProfile({
        displayName: displayName.trim() || undefined,
        gender,
        bio: bio.trim() || undefined,
      });
      return { uploadedUrl };
    },
    onSuccess: ({ uploadedUrl }) => {
      applyPatch({
        displayName: displayName.trim() || undefined,
        gender,
        bio: bio.trim() || undefined,
        ...(uploadedUrl ? { avatar: uploadedUrl } : {}),
      });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast({ title: "资料已保存", variant: "success" });
      nav.client(router, "/profile");
    },
  ```
  → **保存时若选了新头像会再上传一次**（web 的 `avatarMutation` 在选文件时就上传过一次，`saveMutation` 里**又传一次**），并把返回的 URL 一起写进 `applyPatch`（`useAuthStore.updateProfile`，`gacode-web/src/lib/store.ts:130-133`）→ **本地 store 立刻更新**，不等 refetch
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:104-122`
  ```tsx
  const saveMutation = useMutation({
    mutationFn: (input: {...}) => updateProfile(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast({ message: "已保存", variant: "success" });
      navigate("/profile");
    },
  ```
  → PC **不重复上传**（`avatarMutation` 已在选文件时上传过），也**没有本地 store 立即更新**（只有 `invalidateQueries`）
- **差异判定**：**形态不同**（数据通路 · **残留**，见 `S-5`）
- **怎么改**：**部分落地（commit `7b74547`）** —— **本轮不派工，归 `S-5` 待 gaga 拍**。
  - PC 侧锚点：`src/routes/ProfileEdit.tsx:118-132`（`saveMutation.mutationFn`）
  - 实际形态：PC 改成「**保存时上传一次**头像 + 提交 profile」（`uploadAvatar(avatarFile)` → `updateProfile(input)`），**选文件时不再直传** ⇒ 同一张头像只写一次磁盘（web 是选文件 + 保存共写两次）。**残留**：PC 没有「本地 store 立即更新」（PC 的 `useAuth` 无 `updateProfile` / `updateAvatar` patch 方法，只能靠 `queryClient.invalidateQueries(["profile"])` 回填 ⇒ **渲染结果等价**）。

---

### C2-45 · 编辑页保存/失败的 toast 文案

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:124` / `:127-133`
  ```tsx
  toast({ title: "资料已保存", variant: "success" });
  ...
  toast({
    title: "保存失败",
    description: String((err as Error)?.message || err),
    variant: "danger",
  });
  ```
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:112` / `:115-121`
  ```tsx
  toast({ message: "已保存", variant: "success" });
  ...
  toast({
    message: `保存失败: ${err instanceof Error ? err.message : String(err)}`,
    variant: "danger",
  });
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547` + `00b2b5a`）**
  - PC 侧锚点：`src/routes/ProfileEdit.tsx:135`（成功）+ `:139-143`（失败）
  - 实际形态：成功 toast 改 `toast({ title: "资料已保存", variant: "success" })`（原「已保存」）；失败 toast 改 `toast({ title: "保存失败", description: String((err as Error)?.message || err), variant: "danger" })`（前缀拼接消失）。失败时**不碰任何 setState** ⇒ 用户输入保留（与 web 一致）。

---

### C2-46 · 编辑页容器与块间距

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:151`
  ```tsx
  <div className="px-4 lg:px-8 py-6 max-w-2xl mx-auto">
  ```
  web 各块 margin：头像区 `mb-8`(:153) → 昵称 `mb-5`(:181) → 性别 `mb-5`(:198) → 简介 `mb-6`(:223) → 按钮行无 margin（`:248`）
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:167-168`
  ```tsx
  <div className="min-h-full px-4 lg:px-8 py-6">
    <div className="max-w-2xl mx-auto space-y-5">
  ```
  → 双层容器 + 统一 `space-y-5`=20px；按钮行额外 `pt-2`（`:317`）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/ProfileEdit.tsx:190`（容器）+ `:195` / `:220` / `:261` / `:286` / `:314`（各块 margin）
  - 实际形态：单层容器 `min-h-full px-4 lg:px-8 py-6 max-w-2xl mx-auto`（内层 `max-w-2xl mx-auto space-y-5` 已删）；逐块 margin 照抄 web：头像区 `mb-8` / 昵称 `mb-5` / 性别 `mb-5` / 简介 `mb-6` / 按钮行 `flex gap-3`（`pt-2` 已删）。

---

### C2-47 · 昵称提示文案取值来源

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:192-194`
  ```tsx
  <p className="text-xs text-fg-subtle mt-1">
    留空将使用用户名 ({user?.username})
  </p>
  ```
  → 取自 `useAuthStore().user.username`（登录态 store）
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:229-231`
  ```tsx
  <p className="text-xs text-fg-subtle mt-1">
    留空将使用用户名 ({profile?.username || "-"})
  </p>
  ```
  → 取自 `useQuery(["profile"], getProfile)` 的结果
- **差异判定**：**已一致**（文案、字号、颜色、占位兜底 `"-"` 全同；数据来源不同但渲染值相同）
- **怎么改**：**无需改（现状已一致）**
  - PC 侧锚点：`src/routes/ProfileEdit.tsx:238-240`
  - 实际形态：`<p className="text-xs text-fg-subtle mt-1">留空将使用用户名 ({profile?.username || "-"})</p>` —— PC 取 `["profile"]` query、web 取 auth store，渲染值相同。

---

### 组 2b 小结
> **2026-10-27 回写**：组 2b **21 条中 19 条已落地**；`C2-36`（零视觉差）与 `C2-44`（归 `S-5`）为残留。

| 编号 | 判定 | 落地 / 残留 |
|---|---|---|
| C2-27 | 已一致 | `7b74547` |
| C2-28 | 已一致 | `7b74547` |
| C2-29 | 已一致 | `7b74547`（新建 `src/components/ui/Avatar.tsx`） |
| C2-30 | 已一致 | `7b74547` |
| C2-31 | 已一致 | `7b74547`（顺带消掉昵称 51~64 字保存 400 的现网 bug） |
| C2-32 | 已一致 | `7b74547` |
| C2-33 | 已一致 | `7b74547`（顺带消掉简介 201~500 字保存 400 的现网 bug） |
| C2-34 | 已一致 | `7b74547` |
| C2-35 | 已一致 | `7b74547` |
| C2-36 | 形态不同（视觉无差） | **未落地** · 残留 1 个 className 冗余（`duration-150`）⇒ 本轮不做 |
| C2-37 | 已一致 | `7b74547`（新建 `src/components/ui/Textarea.tsx`） |
| C2-38 | 已一致 | `7b74547` + `00b2b5a`（`SaveIcon` 收编） |
| C2-39 | 已一致 | `7b74547` |
| C2-40 | 已一致 | `7b74547`（`Button` variant / size 全量重排） |
| C2-41 | 已一致 | `7b74547` |
| C2-42 | 已一致 | `7b74547` + `ba2701b` 二次收口（Profile 页直传入口同步 2MB） |
| C2-43 | 已一致 | `7b74547` |
| C2-44 | 形态不同（数据通路 · 残留） | `7b74547` 部分落地（改为保存时上传 1 次）⇒ **归 `S-5` 待 gaga 拍** |
| C2-45 | 已一致 | `7b74547` + `00b2b5a` |
| C2-46 | 已一致 | `7b74547` |
| C2-47 | 已一致 | 本来就一致 |
---

### 组 2c · 共用组件差异（影响组 2 / 3 / 4 全部 toast 调用）

### C2-48 · Toast 组件整体形态：PC 是「顶部单条 + 彩色边框」，web 是「居中确认弹窗同款」

- **web 端**：`gacode-web/src/components/common/Toast.tsx`
  - 容器（`:119-125`）：`pointer-events-auto relative w-full max-w-[360px] rounded-2xl bg-bg-elevated p-5 pr-10 shadow-dialog` + `animate-fade-in`
  - 标题（`:130`）：`<h3 className="m-0 text-base font-medium leading-6">{t.title}</h3>`
  - 描述（`:131-135`）：`<p className="m-0 mt-1 text-[13.5px] leading-5 text-fg-muted break-words">{t.description}</p>`
  - 变体图标（`:128`）：`<Icon className="w-[15px] h-[15px] shrink-0 mt-[3px]" />` + 颜色 `text-fg-muted / text-success / text-warning / text-danger`
  - 关闭按钮（`:138-145`）：`absolute right-3 top-3 w-7 h-7 rounded-full grid place-items-center text-fg-muted hover:text-fg hover:bg-white/[0.07] transition-colors duration-150` + `<X className="h-4 w-4" />`
  - 遮罩（`:157`）：`pointer-events-none fixed inset-0 z-[9998] bg-black/60`
  - 容器（`:158-168`）：`pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center px-5` + 堆叠 `flex flex-col-reverse items-center gap-3 max-h-[80vh] overflow-y-auto`
  - 时长：`DEFAULT_DURATION_MS = 2500`（`:62`）；`duration=0` 可常驻
  - API：`toast(item: Omit<ToastItem, "id">)` → `{ title?, description?, variant?, duration? }`
- **PC 端**：`gacode-electron/src/components/ui/Toast.tsx`
  - 容器（`:111-118`）：`fixed top-4 left-1/2 -translate-x-1/2 z-[9999]` + `pointer-events-auto` + `rounded-md border shadow-dialog backdrop-blur-md` + `px-4 py-3 max-w-[min(560px,calc(100vw-32px))]` + `animate-fade-in`
  - 变体边框（`:92-97`）：`border-brand/50 / border-success/50 / border-danger/50 / border-warning/50` + `bg-bg-elevated text-fg`
  - 左侧圆点（`:123`）：`<span className="w-2 h-2 rounded-full shrink-0 bg-brand|bg-success|bg-danger|bg-warning" />`
  - 文字（`:125`）：`<span className="text-sm break-words">{item.message}</span>` —— **单行字符串，无 title/description**
  - **无关闭按钮**、**无遮罩**、**不堆叠**（新 toast 替换旧的）
  - 时长：`DEFAULT_DURATION_MS = 3000`（`:37`）
  - API：`toast(input: { message: string; variant?: ToastVariant; duration?: number })`
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/components/ui/Toast.tsx:41-51`（类型）+ `:70`（时长）+ `:90-104`（`toast()`）+ `src/components/ui/Toast.tsx` 渲染段（面板 / 遮罩 / 容器 / 堆叠）
  - 实际形态：整段重写对齐 web `components/common/Toast.tsx` —— `ToastItem { title?, description?, message?, variant?, duration? }`（`message` 保留为 `title` 的别名 ⇒ **全仓旧调用点零改动**）；`DEFAULT_DURATION_MS = 2500`；`toast()` 返回 `{ id, dismiss }`；面板 `pointer-events-auto relative w-full max-w-[360px] rounded-2xl bg-bg-elevated p-5 pr-10 shadow-dialog animate-fade-in`；遮罩 `pointer-events-none fixed inset-0 z-[9998] bg-black/60`；容器 `pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center px-5`；堆叠 `flex flex-col-reverse items-center gap-3 max-h-[80vh] overflow-y-auto`；标题 `text-base font-medium leading-6`；描述 `text-[13.5px] leading-5 text-fg-muted break-words`；右上 × 关闭；变体只靠图标色（不给卡片加彩色边框）。

---

### 组 2c 小结
> **2026-10-27 回写**：组 2c **1 条已落地**。

| 编号 | 判定 | 落地 / 残留 |
|---|---|---|
| C2-48 | 已一致 | `7b74547`（`Toast.tsx` 整段重写：`title`/`description` + 居中弹窗 + × 关闭 + 堆叠 + 2500ms；`message` 保留为 `title` 别名 ⇒ 全仓旧调用点零改动） |
---

## 组 2 总计

- 条目数：**48**（2a: 26（C2-01 ~ C2-26）/ 2b: 21（C2-27 ~ C2-47）/ 2c: 1（C2-48））
  - 组级前置事实 F-5 ~ F-9 共 5 条，**不计入差异条目数**（它们是「读这份清单前必须知道的事实」，不是差异）
  - ⚠️ **修正（2026-10-26 复核 · E4）**：原稿写「68（2a: 26 / 2b: 20 / 2c: 1 + 组级前置 5 条）」—— 26+20+1+5 = 52 ≠ 68，且 2b 实际是 **21** 条（C2-27 ~ C2-47）；同文档「全量统计」表里组 2 写的也是 **48**。上表按逐条实测统一为 **48**
- 判定分布：**缺失 6 / 形态不同 39 / 已一致 3**
  - 2a：缺失 4（C2-03 / C2-05 / C2-14 / C2-24）/ 形态不同 20 / 已一致 2（C2-09 / C2-17）
  - 2b：缺失 2（C2-37「缺失 + 形态不同」混合项 / C2-41）/ 形态不同 18 / 已一致 1（C2-47）
  - 2c：形态不同 1（C2-48）
  - ⚠️ **修正（2026-10-26 复核 · E4）**：原稿写「缺失 8 / 形态不同 57 / 已一致 3」，与逐条实测（6 / 39 / 3 = 48）对不上，已订正

---

## 组 3 · 通知页（web `/notifications` ↔ PC `Notifications.tsx` + `components/notifications/*`）

**web 端**：`gacode-web/src/app/(main)/notifications/page.tsx`（574 行）
**PC 端**：`gacode-electron/src/routes/Notifications.tsx`（455 行）+ `src/components/notifications/{CategoryTabs,InfiniteScrollList,NotificationItem,NotificationSettingsSheet,SystemNotification}.tsx`

### 组 3 前置事实

**F-8 · 服务端 `GET /api/v1/notifications` 只支持 `?unread=true`，不支持 `category` / `cursor`，也不返回 `nextCursor`**

- 源码：`unified-api/src/modules/notifications/notification.routes.js:343-368`
  ```js
  fastify.get('/', { onRequest: [fastify.requireAuth] }, async (req, reply) => {
    const { unread } = req.query
    const userId = String(req.user.sub)
    const where = { userId }
    if (unread === 'true') { where.isRead = false }
    const notifications = await prisma.customNotification.findMany({
      where, orderBy: { createdAt: 'desc' }, take: 50,
    })
    const unreadCount = await prisma.customNotification.count({ where: { userId, isRead: false } })
    return reply.send({ ok: true, data: { notifications, unreadCount } })
  })
  ```
- 结论：① `where` 只含 `userId`（+ 可选 `isRead`）→ **`?category=` 被完全忽略**；② `take: 50` 硬上限，**无 skip/cursor**；③ 响应体**没有 `nextCursor`**。
- Prisma 模型 `CustomNotification`（`unified-api/prisma/schema.prisma:580-602`）的列只有：`id / userId / title / body / actionType / actionValue / isRead / createdAt / type / payload` —— **没有 `category` 列**。
- → **PC 的 `CategoryTabs`（5 个分类）与 `InfiniteScrollList`（cursor 分页）都建立在服务端不存在的能力上**：切 tab 时 `?category=system` 被忽略 → 每个 tab 返回同一批 50 条；`nextCursor` 永远 undefined → `hasMore` 恒为 false → 列表底部直接显示「没有更多了」，分页永不触发。
- web 端**没有**这两个问题：web 一次拉 50 条（`gacode-web/src/lib/api.ts:1072-1078` `listNotifications(unread?)`，只拼 `?unread=`），且**按 `type` 分组**（不是按 category）。

**F-9 · 两种服务端通知的 `actionType` / `actionValue` 实际取值**

| 来源 | `type` | `actionType` | `actionValue` | `payload` | 源码 |
|---|---|---|---|---|---|
| 日程提醒 | `schedule_reminder` | `'none'` | **无（null）** | `{ scheduleId, reminderId, fireAt }` | `unified-api/src/modules/schedules/schedules.service.js:1333-1344` |
| 定时任务产出 | `cron_result` | `'deep_link'` | **`yinian://chat/{sessionId}`** | `{ cronId, sessionId, ranAt }` | `unified-api/src/modules/schedules/schedules.service.js:1449-1462` |

→ web 的 `notificationTarget()`（`gacode-web/src/lib/notifications.ts:292-345`）就是为这两种取值写的：**`actionType='none'` 靠 `payload.scheduleId` 跳日程详情**；**`actionType='deep_link'` 且 value 是 `yinian://chat/...` 靠 deep link 解析跳会话**。
→ PC 的 `handleClick`（`gacode-electron/src/routes/Notifications.tsx:207-228`）只认 `actionType==='url'` 和 `actionType==='deep_link'`，且 deep_link 要求 `av.startsWith("/")` → **两种服务端通知在 PC 上都点不动**（详见 C3-17）。

---

### 组 3a · 页面骨架

### C3-01 · 页面容器结构：web 单层滚动页，PC 是 sticky 头部 + flex 列

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:237`
  ```tsx
  <div className="px-4 lg:px-8 py-6 max-w-3xl mx-auto">
  ```
- **PC 端**：`gacode-electron/src/routes/Notifications.tsx:231-233` / `:277` / `:292`
  ```tsx
  <div className="min-h-full flex flex-col">
    <div className="sticky top-0 z-10 bg-bg-base px-4 lg:px-8 py-3 flex items-center justify-between">
    ...
    <div className="flex-1 px-4 lg:px-8 py-4">
    ...
    <ul className="space-y-2 max-w-3xl mx-auto">
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Notifications.tsx:226`（容器）+ `:228`（顶部行）
  - 实际形态：单层容器 `px-4 lg:px-8 py-6 max-w-3xl mx-auto`；顶部行 `flex items-center justify-between mb-4` —— 原 `min-h-full flex flex-col` 外壳、`sticky top-0 z-10 bg-bg-base` 吸顶头部、列表区 `flex-1 px-4 lg:px-8 py-4` 全删。

---

### C3-02 · 顶部标题：文案 + 字号字重 + 缺铃铛图标

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:239-248`
  ```tsx
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2">
      <Bell className="w-5 h-5 text-brand" />
      <h1 className="text-lg font-semibold">通知中心</h1>
      {unreadCount > 0 && (
        <Badge variant="destructive" className="text-[10px]">
          {unreadCount} 未读
        </Badge>
      )}
    </div>
  ```
  另：web 的全局 Header 标题也是「通知中心」（`gacode-web/src/app/(main)/notifications/page.tsx:75` `setHeaderTitle("通知中心")`）
- **PC 端**：`gacode-electron/src/routes/Notifications.tsx:234-241`
  ```tsx
  <div className="flex items-center gap-2">
    <h1 className="text-base font-medium">通知</h1>
    {unreadCount > 0 ? (
      <span className="text-xs px-2 py-0.5 rounded-full bg-brand/20 text-brand border border-brand/40">
        {unreadCount} 条未读
      </span>
    ) : null}
  </div>
  ```
  另：PC 的 AppShell header 标题是「通知」（`gacode-electron/src/components/layout/AppShell.tsx:44` `if (pathname.startsWith("/notifications")) return "通知";`）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547` + `78d6b8c`）**
  - PC 侧锚点：`src/routes/Notifications.tsx:230-231`（页内标题）+ `src/components/layout/AppShell.tsx:112`（侧栏标题）
  - 实际形态：`<BellIcon className="w-5 h-5 text-brand" />` + `<h1 className="text-lg font-semibold">通知中心</h1>`；侧栏 `if (pathname.startsWith("/notifications")) return "通知中心";`（原「通知」）。文案 / 字号 / 字重 / 铃铛图标四处全对齐 web `notifications/page.tsx:239-248`。

---

### C3-03 · 未读 Badge：底色 / 文案 / 边框 / 内边距 4 处差异

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:243-247`
  ```tsx
  <Badge variant="destructive" className="text-[10px]">
    {unreadCount} 未读
  </Badge>
  ```
  `Badge` 展开后（`gacode-web/src/components/ui/badge.tsx:11` + `:20`）：
  ```tsx
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-bg-base"
  destructive: "border-transparent bg-danger text-white"
  ```
  → 最终：`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ... border-transparent bg-danger text-white text-[10px]`
- **PC 端**：`gacode-electron/src/routes/Notifications.tsx:237`
  ```tsx
  <span className="text-xs px-2 py-0.5 rounded-full bg-brand/20 text-brand border border-brand/40">
    {unreadCount} 条未读
  </span>
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：新组件 `src/components/ui/Badge.tsx:31-36`（6 个 variant）+ `:47-52`（基础串）；调用点 `src/routes/Notifications.tsx:233-235`
  - 实际形态：`destructive: "border-transparent bg-danger text-white"`（实心红 + 无可见边框）；基础串 `inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors` + focus ring；调用点 `<Badge variant="destructive" className="!text-[10px]">{unreadCount} 未读</Badge>` —— `!text-[10px]` 强制覆盖 base 的 `text-xs`（PC 无 `twMerge`，见 F-1）。文案「N 未读」（原「N 条未读」）。

---

### C3-04 · 「全部已读」按钮：缺图标 + 缺 disabled 条件

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:249-266`
  ```tsx
  <Button
    variant="ghost"
    size="sm"
    onClick={() => readAllMutation.mutate()}
    disabled={
      readAllMutation.isPending ||
      isUndeployed ||
      unreadCount === 0
    }
    className="gap-1.5"
  >
    {readAllMutation.isPending ? (
      <Loader2 className="w-3.5 h-3.5 animate-spin" />
    ) : (
      <CheckCheck className="w-3.5 h-3.5" />
    )}
    全部已读
  </Button>
  ```
- **PC 端**：`gacode-electron/src/routes/Notifications.tsx:259-266`
  ```tsx
  <Button
    variant="ghost"
    size="sm"
    disabled={unreadCount === 0 || readAllMutation.isPending}
    onClick={() => readAllMutation.mutate()}
  >
    全部已读
  </Button>
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547` + `00b2b5a`）**
  - PC 侧锚点：`src/routes/Notifications.tsx:260-273`
  - 实际形态：`<Button variant="ghost" size="sm" onClick={() => readAllMutation.mutate()} disabled={readAllMutation.isPending || unreadCount === 0} className="gap-1.5">` + 图标三元（`:268` `<LoaderCircleIcon className="w-3.5 h-3.5 animate-spin" />` / `:270` `<CheckCheckIcon size={14} className="w-3.5 h-3.5" />`，共享 `Glyphs.tsx:463`）。**注**：web 的 `disabled` 还含 `isUndeployed`，PC 未显式写 ⇒ 但 401/403 时 `unreadCount` 必为 0 ⇒ `unreadCount === 0` 已让按钮禁用 ⇒ **行为等价**。

---

### C3-05 · 「浏览器通知」设置卡片：PC 缺失

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:276-283` 挂载 `<BrowserNotificationCard ... />`，组件本体在同文件 `:456-574`，5 个状态分支：
  | 状态 | 标题 | 副文案 | 图标 | 按钮 |
  |---|---|---|---|---|
  | `unsupported` | 浏览器通知不可用 | 当前浏览器不支持系统通知 API | `BellOff w-5 h-5 text-fg-subtle` | 无 |
  | `denied` | 已被浏览器拒绝 | 请在浏览器设置中允许本站点发送通知 | `BellOff w-5 h-5 text-fg-subtle` | 无 |
  | `granted && !enabled` | 浏览器通知已暂停 | AI 回复到达时将不再弹出系统通知 | `Bell w-5 h-5 text-fg-muted` | 「重新开启」`data-testid="web-notif-reenable"` |
  | `granted && enabled` | 浏览器通知已开启 | AI 回复到达且您不在前台时, 会收到系统通知 | `BellRing w-5 h-5 text-success` | 「关闭」`data-testid="web-notif-disable"` |
  | `default` | 开启浏览器通知 | AI 回复到达时提醒您 | `Bell w-5 h-5 text-brand` | 「开启」`data-testid="web-notif-enable"` |
  卡片容器（`:570-572`）：`<Card className="mb-4" data-testid="web-notif-card" data-perm={perm} data-enabled={enabled ? "on" : "off"}>` + `<CardContent className="p-4">`
- **PC 端**：`gacode-electron/src/routes/Notifications.tsx` —— **PC 通知页没有等价的「通知开关卡片」**。PC 的设置入口是右上角**齿轮按钮**（L243-250）→ 弹 `NotificationSettingsSheet`（`BottomSheet`），里面是 5 个开关 + 测试按钮（PC 独有形态，见 C3-24）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`，按 `S-6` 已拍板口径）**
  - PC 侧锚点：`src/routes/Notifications.tsx:281-286`（挂载）+ `:343-405`（`DesktopNotificationCard` 本体）
  - 实际形态：容器 `<Card className="mb-4">` + `<CardContent className="!p-4">`；PC 三态替代 web 浏览器三态 ——「桌面通知已开启 / 开启桌面通知 / 系统通知不可用」，按钮「开启」(`:386`) /「关闭」(`:382`)，副文案「AI 回复到达且您不在前台时, 会收到系统通知」+「请在 Windows 设置→系统→通知中允许 Gacode」(`:377`)。

---

### C3-06 · 「待开发」占位 Banner：PC 缺失

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:270` + `:429-444`
  ```tsx
  {isUndeployed && <PendingBanner />}
  ...
  function PendingBanner() {
    return (
      <Card className="border-dashed border-warning/50 bg-warning-soft/30">
        <CardContent className="p-6 text-center">
          <div className="text-5xl mb-3">🛎️</div>
          <h2 className="text-base font-semibold text-fg mb-1">通知中心</h2>
          <p className="text-sm text-fg-muted">
            🚧 待开发 — 后端接口尚未就绪
          </p>
          <p className="text-xs text-fg-subtle mt-2">
            部署 Worker D 的通知端点后, 这里将显示实时通知列表
          </p>
        </CardContent>
      </Card>
    );
  }
  ```
  触发条件（`:192-194`）：`const isUndeployed = !!error && /401|403/.test((error as Error)?.message || "");`
- **PC 端**：**PC 缺失**
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Notifications.tsx:114-116`（`isUndeployed`）+ `:278`（挂载）+ `:447-460`（`PendingBanner`）
  - 实际形态：`const isUndeployed = !!error && /401|403/.test(error instanceof Error ? error.message : String(error));`；banner 用 `<Card className="border-dashed border-warning/50 bg-warning-soft/30">` + `<CardContent className="!p-6 text-center">` + 🛎️ + 「通知中心」+「🚧 待开发 — 后端接口尚未就绪」+「部署 Worker D 的通知端点后, 这里将显示实时通知列表」。

---

### 组 3b · 列表组织方式

### C3-07 · 分组维度：web 按 `type` 分组，PC 按 `category` 分 tab（且 category 服务端不存在）

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:230-234`
  ```tsx
  const groups = NOTIFICATION_GROUP_ORDER.map((kind) => ({
    kind,
    items: notifications.filter((n) => notificationPresentation(n).kind === kind),
  })).filter((g) => g.items.length > 0);
  ```
  `NOTIFICATION_GROUP_ORDER = ["schedule_reminder", "cron_result", "other"]`（`gacode-web/src/lib/notifications.ts:435-439`）
  渲染（`:307-332`）：
  ```tsx
  <div className="space-y-6">
    {groups.map((g) => (
      <section key={g.kind} data-notif-group={g.kind}>
        <div className="flex items-center gap-2 mb-2">
          <GroupIcon kind={g.kind} />
          <h2 className="text-sm font-semibold text-fg-muted">
            {notificationPresentation({ type: g.kind }).group}
          </h2>
          <span className="text-xs text-fg-subtle">{g.items.length}</span>
        </div>
        <div className="space-y-2">
          {g.items.map((n) => { ... })}
        </div>
      </section>
    ))}
  </div>
  ```
- **PC 端**：`gacode-electron/src/routes/Notifications.tsx:58`（`category` state）+ `:272-274`（`<CategoryTabs active={category} onChange={setCategory} />`）+ `:319`（`apiCategory(category)` → `?category=`）
  `CategoryTabs` 定义 5 类（`gacode-electron/src/components/notifications/CategoryTabs.tsx:28-34`）：全部 / 系统 / 聊天 / 库 / 交付
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547` + `78d6b8c`）**
  - PC 侧锚点：新 adapter `src/lib/notifications.ts`（513 行：`normalizeNotification` `:99-114` / `notificationKind` `:133-139` / `notificationPresentation` `:398-428` / `notificationSummary` `:464-478` / `notificationTarget` `:292-343` / `parseYinianDeepLink` `:174-212` / `isSafeExternalUrl` `:352-360` / `openExternalNotificationUrl` `:366-375` / `NOTIFICATION_GROUP_ORDER` `:431-435`）；调用点 `src/routes/Notifications.tsx:108-111` + `:296-319`
  - 实际形态：按服务端 `type` 分三组（日程提醒 → 定时任务产出 → 其它），`<section key={g.kind} data-notif-group={g.kind}>` 渲染；5 个 `category` tab、`?category=` 参数、`apiCategory()` 全删（`src/lib/api.ts:362-365` 留档说明服务端只认 `?unread=true`）；`src/components/notifications/CategoryTabs.tsx` 在 `78d6b8c` 删除（删前 grep 确认零外部引用）。

---

### C3-08 · 分组标题行：PC 缺失

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:310-316`
  ```tsx
  <div className="flex items-center gap-2 mb-2">
    <GroupIcon kind={g.kind} />
    <h2 className="text-sm font-semibold text-fg-muted">
      {notificationPresentation({ type: g.kind }).group}
    </h2>
    <span className="text-xs text-fg-subtle">{g.items.length}</span>
  </div>
  ```
  `GroupIcon`（`:339-347`）：`schedule_reminder` → `<Calendar className="w-4 h-4 text-brand" />`；`cron_result` → `<Clock className="w-4 h-4 text-brand" />`；其他 → `<Bell className="w-4 h-4 text-fg-muted" />`
- **PC 端**：**PC 缺失**（PC 只有 tab，列表里没有分组标题）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Notifications.tsx:299-305`（标题行）+ `:411-419`（`GroupIcon`）
  - 实际形态：`<div className="flex items-center gap-2 mb-2">` + `<h2 className="text-sm font-semibold text-fg-muted">{notificationPresentation({ type: g.kind }).group}</h2>` + `<span className="text-xs text-fg-subtle">{g.items.length}</span>`；图标 `schedule_reminder`→Calendar / `cron_result`→Clock / 其它→Bell（16px）。

---

### C3-09 · 通知行容器：圆角 / 内边距 / 底色态 / hover 方向 4 处差异

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:369-381`
  ```tsx
  <button
    type="button"
    onClick={onClick}
    data-notif-type={pres.kind}
    data-notif-target={target.href ?? ""}
    data-notif-target-kind={target.kind}
    className={cn(
      "w-full flex items-start gap-3 p-3 rounded-lg border border-border transition-colors text-left",
      isRead
        ? "bg-bg-sunken hover:bg-bg-elevated"
        : "bg-brand-container/30 hover:bg-brand-container/40 border-brand/30"
    )}
  >
  ```
- **PC 端**：`gacode-electron/src/components/notifications/NotificationItem.tsx:45-53`
  ```tsx
  <button
    type="button"
    onClick={onClick}
    className={[
      "w-full text-left flex items-stretch gap-3 rounded-2xl border border-border bg-bg-elevated p-4",
      "hover:bg-bg-sunken transition-colors duration-150",
    ].join(" ")}
  >
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/components/notifications/NotificationItem.tsx:59-64`（容器）+ `:34`（新增 `isRead` prop）
  - 实际形态：`"w-full flex items-start gap-3 p-3 rounded-lg border border-border transition-colors text-left"` + 已读 `"bg-bg-sunken hover:bg-bg-elevated"` / 未读 `"bg-brand-container/30 hover:bg-brand-container/40 border-brand/30"` —— 圆角 20px、内边距 12px、`items-start`、已读/未读两套底色与 hover 方向全部对齐。

---

### C3-10 · 未读标记：圆点 vs 竖条

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:382-390`
  ```tsx
  {/* Unread dot */}
  <div className="pt-1.5 shrink-0">
    <div
      className={cn(
        "w-2 h-2 rounded-full",
        isRead ? "bg-transparent" : "bg-brand"
      )}
    />
  </div>
  ```
- **PC 端**：`gacode-electron/src/components/notifications/NotificationItem.tsx:62-69`
  ```tsx
  {isUnread ? (
    <span
      aria-hidden="true"
      className={["w-1 self-stretch rounded shrink-0", barColor].join(" ")}
    />
  ) : (
    <span aria-hidden="true" className="w-1 shrink-0" />
  )}
  ```
  `barColor`（L28-33）按 category 取色：`system`→`bg-danger` / `chat`→`bg-brand` / `library`→`bg-success` / `delivery`→`bg-warning`
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/components/notifications/NotificationItem.tsx:67-74`
  - 实际形态：竖条 → 圆点 —— `<div className="pt-1.5 shrink-0"><div className="w-2 h-2 rounded-full …" /></div>`，未读 `bg-brand` / 已读 `bg-transparent`（保留占位，宽度不变）；`CATEGORY_BAR` 常量已删（category 服务端不存在，见 F-8）。

---

### C3-11 · 类型图标容器：web 无圆底，PC 有圆形底

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:392-395`
  ```tsx
  {/* 类型图标 — 按 type 走 */}
  <div className="shrink-0 mt-0.5">
    <GroupIcon kind={pres.kind} />
  </div>
  ```
  → 图标**直接**放在内容流里，无背景圆
- **PC 端**：`gacode-electron/src/components/notifications/NotificationItem.tsx:54-61`
  ```tsx
  {categoryIcon ? (
    <span
      aria-hidden="true"
      className="shrink-0 w-9 h-9 rounded-full bg-bg-sunken flex items-center justify-center text-fg-muted"
    >
      {categoryIcon}
    </span>
  ) : null}
  ```
  → 36px 圆形底容器
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/components/notifications/NotificationItem.tsx:77`
  - 实际形态：`<div className="shrink-0 mt-0.5">{categoryIcon}</div>` —— 36px 圆形底容器（`w-9 h-9 rounded-full bg-bg-sunken`）已删，图标直接进内容流。

---

### C3-12 · 通知行标题区布局：基线对齐 + gap-2 vs 两端对齐 + gap-3

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:397-408`
  ```tsx
  <div className="flex-1 min-w-0">
    <div className="flex items-baseline gap-2">
      <span
        className={cn(
          "text-sm font-medium truncate",
          isRead ? "text-fg-muted" : "text-fg"
        )}
      >
        {notification.title}
      </span>
      <span className="text-[10px] text-fg-subtle shrink-0">{time}</span>
    </div>
  ```
- **PC 端**：`gacode-electron/src/components/notifications/NotificationItem.tsx:70-83`
  ```tsx
  <div className="flex-1 min-w-0 space-y-1">
    <div className="flex items-start justify-between gap-3">
      <h3
        className={[
          "text-sm flex-1 min-w-0 break-all",
          isUnread ? "font-medium text-fg" : "text-fg-muted",
        ].join(" ")}
      >
        {item.title}
      </h3>
      <span className="text-xs text-fg-subtle shrink-0">
        {formatRelative(item.createdAt)}
      </span>
    </div>
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/components/notifications/NotificationItem.tsx:80-90`
  - 实际形态：`<div className="flex items-baseline gap-2">` + 标题 `<span className="text-sm font-medium truncate …">`（标签 `<h3>` → `<span>`）+ 时间 `<span className="text-[10px] text-fg-subtle shrink-0">{time}</span>`（12px → 10px）—— 与 web `notifications/page.tsx:397-408` 逐字一致。

---

### C3-13 · 相对时间文案：`date-fns` 中文 vs PC 手写

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:358-361`
  ```tsx
  const time = formatDistanceToNow(new Date(notification.createdAt), {
    addSuffix: true,
    locale: zhCN,
  });
  ```
  → `date-fns` 的 `zhCN` locale：不足 30 秒 →「不到 30 秒」；不足 1 分钟 →「不到 1 分钟」；其余 →「X 分钟前」「X 小时前」「X 天前」「X 个月前」「X 年前」，带 `addSuffix: true`
  - ⚠️ **修正（2026-10-26 复核 · E9）**：原稿写「`date-fns` **v4** 的 `zhCN` locale」—— **说反了**：web 端是 **`date-fns@^3.6.0`**（`gacode-web/package.json:17`），PC 端才是 **`^4.4.0`**（`gacode-electron/package.json:20`）
  - ✅ **v3.6.0 与 v4.4.0 的 `locale/zh-CN/_lib/formatDistance.js` 字符串完全相同，核心 `formatDistance.js` 的取整逻辑也完全相同（都是 `Math.round`）** ⇒ 两版渲染出来的中文文案逐字一致，**不需要真机校准**（原来的「待核」已撤销，见文末「待核项」）
- **PC 端**：`gacode-electron/src/components/notifications/NotificationItem.tsx:108-124`
  ```tsx
  function formatRelative(iso: string): string {
    if (!iso) return "-";
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return iso;
    const diff = Date.now() - t;
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return "刚刚";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} 分钟前`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} 小时前`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day} 天前`;
    const month = Math.floor(day / 30);
    if (month < 12) return `${month} 个月前`;
    return `${Math.floor(month / 12)} 年前`;
  }
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/lib/notifications.ts:508-513`（实现）+ `src/components/notifications/NotificationItem.tsx:50`（调用）
  - 实际形态：`formatDistanceToNow(new Date(t), { addSuffix: true, locale: zhCN })` —— PC 用 `date-fns@^4.4.0`（web 是 v3.6.0，两版 zhCN 的字符串与 `Math.round` 取整完全相同 ⇒ 渲染文案逐字一致）；原手写 `formatRelative` 已删。

---

### C3-14 · 类型角标：条件 / 文案 / 字号底色 3 处差异

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:409-416`
  ```tsx
  {/* 类型角标 —— 只给两种已知类型挂 (安卓 NotificationScreen.kt:338 同款;
      「其它通知」那一组有分组标题, 逐条再挂一个「通知」角标是冗余) */}
  {pres.kind !== "other" && (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-fg-subtle shrink-0">
      {pres.label}
    </span>
  )}
  ```
  `pres.label` 来自 `notificationPresentation()`（`gacode-web/src/lib/notifications.ts:402-432`）：`schedule_reminder`→**「日程提醒」**；`cron_result`→**「定时任务产出」**；other→「通知」
- **PC 端**：`gacode-electron/src/components/notifications/NotificationItem.tsx:89-94`
  ```tsx
  {item.type ? (
    <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-bg-sunken text-fg-subtle">
      {item.type}
    </span>
  ) : null}
  ```
  → 显示**原始英文** `schedule_reminder` / `cron_result`；`other` 类（`type` 为 null）不显示
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/components/notifications/NotificationItem.tsx:94-98`（角标）+ `src/lib/notifications.ts:398-428`（文案）
  - 实际形态：`<span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-fg-subtle shrink-0">{pres.label}</span>`，文案中文本地化（「日程提醒」/「定时任务产出」/「通知」，原为原始英文 `schedule_reminder`），挂载条件 `pres.kind !== "other"`。

---

### C3-15 · 摘要文案兜底：PC 缺失（body 空时整行不显示）

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:417-422`
  ```tsx
  {/* 摘要 —— body 为空时按类型兜底 (日程到点了 / 定时任务 {cronId} · {ranAt} / ...) */}
  {summary && (
    <p className="text-xs text-fg-muted line-clamp-2">
      {summary}
    </p>
  )}
  ```
  `summary = notificationSummary(notification)`（`gacode-web/src/lib/notifications.ts:469-483`）：
  ① 有 `body` → 用 body；② `cron_result` → 用 payload 拼 `定时任务 {cronId} · {ranAt}`（cronId / ranAt 只有一个也能出）；③ 按 kind 给占位：日程提醒→「日程到点了」；定时任务产出→「定时任务已产出结果」；其它→「你有一条新通知」
- **PC 端**：`gacode-electron/src/components/notifications/NotificationItem.tsx:84-88`
  ```tsx
  {item.body ? (
    <p className="text-xs text-fg-muted line-clamp-2 break-all">
      {item.body}
    </p>
  ) : null}
  ```
  → **只有 body**；body 为空时**整行不渲染**
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/components/notifications/NotificationItem.tsx:49` + `:100-102`；兜底实现 `src/lib/notifications.ts:464-478`
  - 实际形态：`const summary = notificationSummary(item);` → `{summary ? <p className="text-xs text-fg-muted line-clamp-2">{summary}</p> : null}`；兜底优先级 = 服务端 body → `cron_result` 用 payload 拼「定时任务 {cronId} · {ranAt}」→ 按 kind 给「日程到点了」/「定时任务已产出结果」/「你有一条新通知」⇒ **永不返回空串**，body 为空时整行不再消失。

---

### C3-16 · 摘要 className 多 `break-all`

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:419` → `className="text-xs text-fg-muted line-clamp-2"`
- **PC 端**：`gacode-electron/src/components/notifications/NotificationItem.tsx:85` → `className="text-xs text-fg-muted line-clamp-2 break-all"`
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/components/notifications/NotificationItem.tsx:101`
  - 实际形态：摘要 className `text-xs text-fg-muted line-clamp-2` —— `break-all` 已删（不再逐字断行）。

---

### C3-17 · 通知点击跳转：web 支持 `yinian://` deep link，PC **全部点不动**

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:196-228`
  ```tsx
  const onNotificationClick = (n: NotificationItem) => {
    if (!readIds.has(n.id) && !n.isRead) { readMutation.mutate(n.id); }
    const target = notificationTarget(n);
    if (target.kind === "url") {
      if (!openExternalNotificationUrl(target.url)) {
        toast({ title: "无法打开链接", description: target.url, variant: "warning" });
      }
      return;
    }
    if (target.kind === "none") {
      if (target.rawLink) {
        toast({ title: "无法识别的链接", description: target.rawLink, variant: "warning" });
      }
      return;
    }
    if (!target.href) return;
    nav.client(router, target.href);
  };
  ```
  `notificationTarget()`（`gacode-web/src/lib/notifications.ts:292-345`）判定顺序：
  ① `actionType==='url'` → 外链（须过 `isSafeExternalUrl` 白名单）
  ② `actionValue` 是 `yinian://chat/{id}` → 会话；`yinian://schedule/calendar/{id}?reminderId=&fireAt=` → 日程详情
  ③ `type==='schedule_reminder'` → 用 `payload.scheduleId` 跳日程详情
  ④ `type==='cron_result'` → 用 `payload.sessionId` 跳会话
  ⑤ 其它 → 无落点
- **PC 端**：`gacode-electron/src/routes/Notifications.tsx:207-228`
  ```tsx
  const handleClick = (n: NotificationItem) => {
    if (!n.isRead && pendingId !== n.id) { readOneMutation.mutate(n.id); }
    const at = n.actionType;
    const av = n.actionValue;
    if (!at || !av) return;
    if (at === "url") {
      window.open(av, "_blank", "noopener,noreferrer");
    } else if (at === "deep_link") {
      if (av.startsWith("/")) { navigate(av); }
      else { window.open(av, "_blank", "noopener,noreferrer"); }
    }
  };
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547` + `78d6b8c`）**
  - PC 侧锚点：`src/routes/Notifications.tsx:185-214`（`handleClick`）；解析器 `src/lib/notifications.ts:174-212`（`parseYinianDeepLink`）+ `:292-343`（`notificationTarget`）+ `:248-277`（`scheduleTarget` / `chatTarget`）
  - 实际形态：点击走 5 级判定 —— ① `actionType='url'` → `openExternalNotificationUrl`（失败 toast「无法打开链接」）② `yinian://chat/{id}` → `chatTarget` → `/chat/{id}` ③ `yinian://schedule/calendar/{id}` → `scheduleTarget` ④ `type='schedule_reminder'` → `payload.scheduleId` ⑤ `type='cron_result'` → `payload.sessionId`；其余 → `kind:"none"` + toast「无法识别的链接」。⚠️ **日程落点**：PC 没有 `/schedule` 路由 ⇒ `src/lib/notifications.ts:248-266` `scheduleTarget()` 按 `S-12` 短期兜底返回 `kind:"none"` + `rawLink` ⇒ 点日程提醒弹「无法识别的链接」（`S-12` 仍待 gaga 拍）。

---

### C3-18 · 外链安全白名单：PC 缺失

- **web 端**：`gacode-web/src/lib/notifications.ts:354-379`
  ```ts
  export function isSafeExternalUrl(url: string): boolean {
    if (typeof url !== "string" || !url.trim()) return false;
    try {
      const u = new URL(url.trim());
      return u.protocol === "http:" || u.protocol === "https:";
    } catch { return false; }
  }

  export function openExternalNotificationUrl(url: string): boolean {
    if (!isSafeExternalUrl(url)) return false;
    if (typeof window === "undefined") return false;
    try {
      window.open(url, "_blank", "noopener,noreferrer");
      return true;
    } catch { return false; }
  }
  ```
  注释明写：后端 `validateNotification` 对 `actionType='url'` 只校验「能被 new URL 解析」，`javascript:` / `data:` 也会通过 → web 端自己兜住
- **PC 端**：`gacode-electron/src/routes/Notifications.tsx:217` → `window.open(av, "_blank", "noopener,noreferrer");` —— **无任何白名单**
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/lib/notifications.ts:352-360`（`isSafeExternalUrl`）+ `:366-375`（`openExternalNotificationUrl`）；调用点 `src/routes/Notifications.tsx:192`
  - 实际形态：`new URL(url.trim())` 后只放行 `protocol === "http:" || "https:"`（`javascript:` / `data:` 被拦）；打开失败返回 `false` 由调用方提示。安全缺口已堵。

---

### C3-19 · 认不出的 deep link 提示：PC 缺失

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:213-223`
  ```tsx
  if (target.kind === "none") {
    if (target.rawLink) {
      toast({
        title: "无法识别的链接",
        description: target.rawLink,
        variant: "warning",
      });
    }
    return;
  }
  ```
- **PC 端**：**PC 缺失**（`handleClick` 里 `at === "none"` 直接 return，无任何反馈）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Notifications.tsx:202-211`
  - 实际形态：`if (target.kind === "none") { if (target.rawLink) { toast({ title: "无法识别的链接", description: target.rawLink, variant: "warning" }); } return; }` —— 与 web `notifications/page.tsx:213-223` 一致。

---

### C3-20 · 分页：web 无分页，PC 的 cursor 分页在服务端不成立

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:146-154`
  ```tsx
  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications", { unread: false }],
    queryFn: () => listNotifications(false),
    retry: false,
    refetchInterval: NOTIFICATION_POLL_MS,   // 45s
    refetchIntervalInBackground: false,
  });
  ```
  → web **一次性拉 50 条，不分页**（`listNotifications` 只拼 `?unread=`，`gacode-web/src/lib/api.ts:1072-1078`）
- **PC 端**：`gacode-electron/src/routes/Notifications.tsx:63-86` + `:187-205` + `InfiniteScrollList`
  ```tsx
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [...NOTIFICATIONS_PAGE_KEY, "page1", { category, unread: false }],
    queryFn: () => listNotifications(false, { category: apiCategory(category) }),
    placeholderData: (prev) => prev,
  });
  const [extraPages, setExtraPages] = useState<NotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  ...
  const res = await listNotifications(false, { category: apiCategory(category), cursor: nextCursor });
  setExtraPages((cur) => [...cur, ...res.notifications]);
  setNextCursor(res.nextCursor ?? null);
  ```
  `InfiniteScrollList` 用 `IntersectionObserver`（`rootMargin: "120px 0px"`）在 sentinel 进入视口时 `onLoadMore()`；拉完显示 `endMessage = "没有更多了"`
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547` + `78d6b8c`）**
  - PC 侧锚点：`src/routes/Notifications.tsx:96-102`（query）+ `:104`（items）
  - 实际形态：`queryKey: ["notifications", { unread: false }]` + `queryFn: () => listNotifications(false)` + `retry: false` + `refetchInterval: NOTIFICATION_POLL_MS` + `refetchIntervalInBackground: false`；`extraPages` / `nextCursor` / `loadingMore` state、`loadMore`、`<InfiniteScrollList>` 包裹全删（`src/components/notifications/InfiniteScrollList.tsx` 在 `78d6b8c` 删除）⇒ 一次性拉 50 条、不分页、不再骗用户「没有更多了」。

---

### 组 3c · 空态 / 加载态

### C3-21 · 空态：图标形态 / 文案 / 容器 5 处差异

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:295-303`
  ```tsx
  <Card>
    <CardContent className="p-10 text-center text-fg-muted">
      <div className="text-5xl mb-4">📭</div>
      <div className="text-base font-medium mb-1 text-fg">暂无通知</div>
      <div className="text-sm">新消息会在此处通知你</div>
    </CardContent>
  </Card>
  ```
  → 最终 className：`rounded-lg border bg-card text-card-foreground shadow` + `p-10 text-center text-fg-muted`
- **PC 端**：`gacode-electron/src/routes/Notifications.tsx:342-359`
  ```tsx
  function EmptyState({ category }: { category: NotificationCategory }) {
    const text = category === "all" ? "系统通知和消息提醒会出现在这里" : "这个分类还没有通知";
    return (
      <div className="h-full flex items-center justify-center">
        <div className="rounded-2xl border border-border bg-bg-elevated p-12 text-center max-w-sm w-full">
          <BellIcon className="w-12 h-12 mx-auto mb-4 text-fg-muted" />
          <p className="text-base font-medium">还没有通知</p>
          <p className="text-sm text-fg-muted mt-2">{text}</p>
        </div>
      </div>
    );
  }
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Notifications.tsx:425-435`
  - 实际形态：`<Card>` + `<CardContent className="!p-10 text-center text-fg-muted">` + `<div className="text-5xl mb-4">📭</div>` + `<div className="text-base font-medium mb-1 text-fg">暂无通知</div>` + `<div className="text-sm">新消息会在此处通知你</div>` —— emoji 图标 / 文案 / 容器 / 内边距 / `text-fg` 七处全对齐 web `notifications/page.tsx:295-303`；`category` prop 已删。

---

### C3-22 · 加载态：web 用 Skeleton 组件，PC 用内联 div

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:286-292`
  ```tsx
  {isLoading && !isUndeployed && (
    <div className="space-y-3">
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-20 w-full rounded-lg" />
      <Skeleton className="h-20 w-full rounded-lg" />
    </div>
  )}
  ```
  `Skeleton` 组件（`gacode-web/src/components/ui/skeleton.tsx:5-8`）：`animate-pulse rounded-md bg-muted` + 传入的 `className`
  → 最终：`animate-pulse rounded-md bg-muted h-20 w-full rounded-lg`
- **PC 端**：`gacode-electron/src/routes/Notifications.tsx:361-375`
  ```tsx
  function SkeletonList() {
    return (
      <ul className="space-y-2 max-w-3xl mx-auto">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i} className="rounded-2xl bg-bg-elevated p-4 animate-pulse">
            <div className="h-4 w-2/3 bg-bg-sunken rounded" />
            <div className="h-3 w-3/4 bg-bg-sunken rounded mt-2" />
          </li>
        ))}
      </ul>
    );
  }
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Notifications.tsx:437-445`
  - 实际形态：`<div className="space-y-3">` + 3 条 `<div className="h-20 w-full rounded-lg animate-pulse bg-bg-elevated" />` —— 80px 单块、无内部骨架线、`rounded-lg`=20px、`space-y-3`=12px，与 web `notifications/page.tsx:286-292` 等价。

---

### 组 3d · 通知行 data 属性与其它

### C3-23 · 通知行的 `data-notif-*` 测试锚点：PC 缺失

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:372-374`
  ```tsx
  data-notif-type={pres.kind}
  data-notif-target={target.href ?? ""}
  data-notif-target-kind={target.kind}
  ```
- **PC 端**：**PC 缺失**（`gacode-electron/src/components/notifications/NotificationItem.tsx:45-53` 只有 `type` / `onClick` / `className`）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/components/notifications/NotificationItem.tsx:56-58`
  - 实际形态：`data-notif-type={pres.kind}` / `data-notif-target={target.href ?? ""}` / `data-notif-target-kind={target.kind}` —— 三个自动化测试锚点补齐。

---

### C3-24 · 通知设置项：web 是「页面顶部常驻卡片 + 一个开关」，PC 是「齿轮弹窗 + 5 个开关」

- **web 端**：设置项 = `BrowserNotificationCard`（C3-05），**唯一的状态开关**是 `web-notifications-enabled`（localStorage，缺省 ON）：
  ```ts
  // gacode-web/src/lib/webNotifications.ts:94-106
  export function isEnabled(): boolean {
    const raw = safeGetItem(NOTIFICATION_ENABLED_KEY);   // "web-notifications-enabled"
    return raw !== "off";
  }
  export function setEnabled(v: boolean): void {
    if (v) { safeRemoveItem(NOTIFICATION_ENABLED_KEY); }
    else { safeSetItem(NOTIFICATION_ENABLED_KEY, "off"); }
  }
  ```
- **PC 端**：`gacode-electron/src/components/notifications/NotificationSettingsSheet.tsx`
  - 入口：`Notifications.tsx:243-250` 右上角**齿轮按钮** → `setSettingsOpen(true)`
  - 面板：`BottomSheet open={open} title="通知设置" onClose={onClose}`
  - 5 个设置项 + 1 个测试按钮：
    | PC 设置项 | 字段 | 说明文案 | 控件 |
    |---|---|---|---|
    | 启用通知 | `enabled` | 关掉后, 应用内和桌面通知都不会再弹 | `ToggleRow`（原生 checkbox + `accent-brand`） |
    | 桌面通知 | `desktopEnabled` | 通过 Windows 通知中心弹出 | `ToggleRow` |
    | 应用内提示 | `inAppEnabled` | 在窗口顶部显示 toast | `ToggleRow` |
    | 按类目屏蔽 ×4 | `categories.{system,chat,library,delivery}` | 关掉某个类目后, 该类的新通知会被静默丢弃 | `CategoryRow`（自绘开关 `w-9 h-5 rounded-full` + 滑块 `w-4 h-4`） |
    | 弹一条测试通知 | — | 验证主进程 Notification 链路 | `Button` |
  - 持久化：`loadNotificationPrefs()` / `saveNotificationPrefs()` → localStorage
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`；PC 增强部分按 gaga 指示保留）**
  - PC 侧锚点：通知页顶部常驻卡 `src/routes/Notifications.tsx:281-286` + `:343-405`（见 `C3-05`）；齿轮弹窗 `src/components/notifications/NotificationSettingsSheet.tsx`（保留）
  - 实际形态：两端现在都有「页面顶部能看到当前通知开关状态 + 一键开关」的形态（PC 三态 ≡ web 浏览器三态，见 `S-6` 拍板口径）；PC 齿轮弹窗里的 5 个开关 + 测试通知属 **PC 增强**，按 gaga 指示不列差异。⚠️ **PC 侧功能缺陷（非差异条目）**：该弹窗 `:140-162` 的 4 个「按类目屏蔽」开关用的是服务端**不存在**的 `category` 维度（F-8）⇒ 实际不生效。

---

### 组 3 小结
> **2026-10-27 回写**：组 3 **24 条全部已落地**（`7b74547` + `78d6b8c` 删死文件 + `00b2b5a` 图标收编）。

| 编号 | 判定 | 落地 / 残留 |
|---|---|---|
| C3-01 | 已一致 | `7b74547` |
| C3-02 | 已一致 | `7b74547` + `78d6b8c`（侧栏标题「通知」→「通知中心」） |
| C3-03 | 已一致 | `7b74547`（新建 `src/components/ui/Badge.tsx`） |
| C3-04 | 已一致 | `7b74547` + `00b2b5a`（`CheckCheckIcon` / `LoaderCircleIcon` 收编） |
| C3-05 | 已一致 | `7b74547`（PC 三态替代浏览器三态，`S-6` 拍板口径） |
| C3-06 | 已一致 | `7b74547` |
| C3-07 | 已一致 | `7b74547`（新建 `src/lib/notifications.ts`）+ `78d6b8c`（删 `CategoryTabs.tsx`） |
| C3-08 | 已一致 | `7b74547` |
| C3-09 | 已一致 | `7b74547` |
| C3-10 | 已一致 | `7b74547` |
| C3-11 | 已一致 | `7b74547` |
| C3-12 | 已一致 | `7b74547` |
| C3-13 | 已一致 | `7b74547`（`date-fns` zhCN） |
| C3-14 | 已一致 | `7b74547` |
| C3-15 | 已一致 | `7b74547` |
| C3-16 | 已一致 | `7b74547` |
| C3-17 | 已一致 | `7b74547` + `78d6b8c`（日程落点按 `S-12` 短期兜底） |
| C3-18 | 已一致 | `7b74547` |
| C3-19 | 已一致 | `7b74547` |
| C3-20 | 已一致 | `7b74547` + `78d6b8c`（删 `InfiniteScrollList.tsx`） |
| C3-21 | 已一致 | `7b74547` |
| C3-22 | 已一致 | `7b74547` |
| C3-23 | 已一致 | `7b74547` |
| C3-24 | 已一致 | `7b74547`（PC 齿轮弹窗保留 = PC 增强；常驻卡已补） |
---

## 组 4 · 通知路径（重点）

**web 端**：`gacode-web/src/components/WebNotificationWatcher.tsx` + `gacode-web/src/components/WebNotificationPrompt.tsx` + `gacode-web/src/lib/webNotifications.ts` + `gacode-web/src/lib/notification-stream.ts`
**PC 端**：`gacode-electron/src/lib/notifications-sse.ts` + `gacode-electron/src/components/notifications/SystemNotification.tsx` + `gacode-electron/electron/notifications.ts` + `gacode-electron/electron/preload.ts`

### 4.0 完整链路对照表（8 段）

| 段 | web 端用什么 | PC 端用什么 | 服务端实际支持什么 |
|---|---|---|---|
| ① 权限申请**入口** | ① 通知页顶部 `BrowserNotificationCard` 的「开启」按钮（`gacode-web/src/app/(main)/notifications/page.tsx:553-564`）② chat 详情页首次进入自动弹 `WebNotificationPromptSheet`（`gacode-web/src/components/WebNotificationPrompt.tsx:83-180`） | **无**。Electron 走 Windows 通知中心，权限由**操作系统**管（`electron/main.ts:58` `app.setAppUserModelId('com.gaga.gacode')`），应用内没有「授权」这一步 | N/A —— 服务端只有 SSE 推送，**不要求客户端授权**（`requireAuth` 只验 JWT） |
| ② 用户**授权**按钮 | 「开启」→ `Notification.requestPermission()`（`gacode-web/src/lib/webNotifications.ts:47-59`）→ **浏览器原生权限弹窗**（用户点允许/拒绝） | 无对应物 | N/A |
| ③ 授权后**通道** | ① 站内通知：**SSE** `GET /notifications/stream`（`gacode-web/src/lib/notification-stream.ts:327-453`，fetch + 手写帧解析）② **AI 回复终态**：`useChatStore.subscribe` 监听 `finishedAt` null→非 null（`gacode-web/src/lib/webNotifications.ts:278-333`）③ 列表兜底轮询 **45s**（`NOTIFICATION_POLL_MS`） | ① 站内通知：**EventSource** `GET /notifications/stream?token=`（`gacode-electron/src/lib/notifications-sse.ts:166`）② **无 AI 回复终态通知** ③ 列表兜底轮询：AppShell **30s**；**通知页自身无轮询** | SSE 端点 `GET /api/v1/notifications/stream`（`unified-api/src/modules/notifications/notification.routes.js:224`）· `onRequest:[fastify.requireAuth]` · 帧 `id:<eventId>\ndata:{...}\n\n` · 心跳 `: heartbeat` · **支持 `Last-Event-ID` 续传**（`:242-247`）· **2026-10-23 起一个账号可同时开多条连接**（`:221-223` 注释 + `:234-235` `addSseConnection` 追加不顶替） |
| ④ **前台**收到怎么显示 | `invalidateQueries(["notifications"])` 刷新列表 + 角标；**系统通知不弹** —— `showSiteNotification` 内部判 `document.hidden \|\| visibilityState==='hidden'`（`gacode-web/src/lib/webNotifications.ts:191`） | `invalidateQueries(["notifications"])` + **无条件弹 Windows Toast**（`notifications-sse.ts:132-143` → `window.gacode.notificationSSESend` → `electron/notifications.ts:67-98`）+ **无条件弹应用内 toast**（`notifications-sse.ts:146-149`） | — |
| ⑤ **后台 / 关窗** | 页签隐藏 → 弹浏览器系统通知（30s 自动 close，`webNotifications.ts:224-233`）；关掉页签 → **收不到**（SSE 随页面销毁；`notification-stream.ts:335` 的 `lastEventId` 是**模块内内存变量**，刷新/关页签即丢 ⇒ 服务端不补发） | 窗口最小化 / 后台 → **仍然弹 Toast**（主进程弹，不看 renderer 可见性）；**关窗 = 隐藏到托盘**（`electron/main.ts:256-262` `e.preventDefault(); mainWindow.hide();`）⇒ 进程**不死**、renderer 不卸载、SSE **不断** ⇒ **关窗期间不丢**；只有托盘「退出」真结束进程时才断（且客户端**没实现续传**，见 C4-06 / S-8） | 服务端 per-user buffer 保留最近 200 条；`replayMissedEvents(userId, reply, lastEventId)` 补发（`notification.routes.js:242-247`）—— **须带 `Last-Event-ID` 才补发**（`notification.service.js:225-229` `if (!lastEventId) return 0;`） |
| ⑥ **点击**通知跳到哪 | 系统通知 `onclick` → `n.close()` + `window.focus()` + `opts.onClick()`（`webNotifications.ts:208-221`）→ `nav.client(router, target.href)`（会话 / 日程详情 / 外链，`WebNotificationWatcher.tsx:121-130`） | **点了没反应** —— `electron/notifications.ts:52` `new Notification({ title, body, silent: false }).show()`，**没有注册 `n.on('click')`** | deep link 取值见 F-9：`yinian://chat/{sessionId}` / `actionType='none'` + `payload.scheduleId` |
| ⑦ **设置项** | ① 「浏览器通知」开关 → localStorage `web-notifications-enabled`（**缺省 ON**，`webNotifications.ts:94-106`）② 首次提示 7 天冷却 → localStorage `web-notifications-last-prompt-at`（`:23` `PERMISSION_PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000`） | ① 总开关 `enabled` ② 桌面通知 `desktopEnabled` ③ 应用内提示 `inAppEnabled` ④ 按类目屏蔽 `categories.{system,chat,library,delivery}` ⑤ 「弹一条测试通知」按钮 —— 全部存 localStorage（`loadNotificationPrefs` / `saveNotificationPrefs`） | **没有** `/agent-push-preferences` 端点（PC `src/lib/api.ts:674-690` 注释明写）→ 两端都只能客户端持久化 |
| ⑧ **关闭授权**后行为 | 开关 off → `showSiteNotification` 第 3 个前置条件不通过 → **静默 noop**（返回 false，不抛错）；权限 denied → 卡片显示「已被浏览器拒绝 / 请在浏览器设置中允许本站点发送通知」，**无操作按钮** | `prefs.desktopEnabled=false` → `SystemNotification.fire()` return false ✅；**但 SSE 桥不走 `SystemNotification`，直接调 `window.gacode.notificationSSESend` 且不查 prefs** → **关掉「桌面通知」开关，SSE 仍会弹 Windows Toast** ❌（详见 C4-13） | — |

### 4.1 「web 特有、PC 无法 1:1」的清单（→ 见文末 `S-6`）

| 项 | 为什么无法 1:1 | PC 等价实现建议 |
|---|---|---|
| 浏览器原生权限弹窗（`Notification.requestPermission()`） | Electron 没有浏览器权限模型；Windows 的通知权限在「系统设置 → 通知」里，应用内**无法调起**系统授权 UI | 用 PC 自己的开关替代：`NotificationSettingsSheet` 的「桌面通知」开关 + 通知页顶部常驻状态卡（C3-05），首次进入时给一次引导 |
| 权限三态 `granted / denied / default` | 同上，Electron 只有「桥可用 / 不可用」 | 三态替换为：`已开启`（`prefs.desktopEnabled`）/ `未开启` / `系统不支持`（`!window.gacode?.notify`） |
| 「已被浏览器拒绝，去浏览器设置开启」的文案 | 无对应系统跳转 API | 文案改成「请在 Windows 设置 → 系统 → 通知中允许 Gacode」 |
| `document.hidden` / `visibilityState` 前台判定 | Electron renderer 有 `document.hidden`，但**窗口最小化 ≠ 页面 hidden**（Electron 的 `document.visibilityState` 在窗口最小化时仍可能是 `visible`） | 用主进程窗口状态：`mainWindow.isMinimized()` / `isFocused()`，通过 preload 暴露 `isWindowFocused()` |
| 系统通知 30s 自动 close | Windows Toast 由系统控制，不提供自动关闭 API | 不做（系统行为），或用 `Notification.close()` 在 N 秒后主动调（需主进程持引用） |
| `tag` 合并同会话多条通知 | Electron `Notification` 无 `tag` 概念 | 不做（PC 增强方向），或按 `chatId` 去重后只弹最后一条 |

### 4.2 逐段差异条目

---

### C4-01 · 权限申请入口（web 特有）

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:543-565`（通知页卡片里的「开启」按钮）+ `gacode-web/src/components/WebNotificationPrompt.tsx:83-180`（首次进 chat 详情页自动弹的 Sheet）
- **PC 端**：**PC 缺失**（Electron 无浏览器权限模型；`gacode-electron/electron/main.ts:57-59` 只设了 `AppUserModelId`）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`，按 `S-6` 已拍板口径）**
  - PC 侧锚点：`src/routes/Notifications.tsx:281-286`（挂载）+ `:386`（「开启」按钮 `onEnable`）+ `:377`（Windows 设置指引文案）
  - 实际形态：Electron 没有浏览器权限模型 ⇒ 用「通知页顶部常驻卡 + 一键『开启』按钮」替代 web 的 `Notification.requestPermission()` 弹窗：`onEnable={() => updatePrefs({ enabled: true, desktopEnabled: true })}`（只改 pref，不调任何系统 API）。

---

### C4-02 · 首次授权 Sheet + 7 天冷却：PC 缺失

- **web 端**：
  - 触发（`gacode-web/src/components/WebNotificationPrompt.tsx:51-71`）：`useWebNotificationPrompt(chatId)` —— 进入 chat 详情页时，若 `shouldShowPrompt()` 为真 → `recordPromptShown()` + `window.dispatchEvent(new CustomEvent("gacode:web-notification-prompt", { detail: { chatId } }))`
  - 判据（`gacode-web/src/lib/webNotifications.ts:114-122`）：
    ```ts
    export function shouldShowPrompt(): boolean {
      if (!isSupported()) return false;
      if (getPermissionState() !== "default") return false;
      const lastRaw = safeGetItem(LAST_PROMPT_KEY);
      if (!lastRaw) return true;
      const last = Number(lastRaw);
      if (!Number.isFinite(last)) return true;
      return Date.now() - last >= PERMISSION_PROMPT_COOLDOWN_MS;
    }
    ```
  - 冷却常量：`PERMISSION_PROMPT_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000`（`:23`）
  - 面板（`:137-179`）：`Sheet side="bottom"`，标题「开启浏览器通知」+ `Bell w-5 h-5 text-brand`，描述「开启后, 当 AI 回复到达但您不在该会话页面时, 系统会弹出通知提醒您」，次行 `BellOff w-4 h-4 mt-0.5 shrink-0 text-fg-subtle` + 「您可以稍后在「通知中心」顶部重新开关浏览器通知」，footer「暂不」/「开启」
- **PC 端**：**PC 缺失**
- **怎么改**：**本轮不做（web 特有 · 不计入合计）** —— 详见文末「本轮不做」表。
  - 依据：web 的首次授权 Sheet 依赖浏览器权限模型（`Notification.permission === "default"`），Electron 里不存在；台账原「怎么改」已写明「**推荐不做**」—— 桌面应用不该在用户没主动触发时弹模态框。PC 侧等价物 = 通知页顶部常驻卡（`C3-05` / `C4-01`），用户自己看到、自己点。
  - 若 gaga 后续要 PC 也有首次引导：等价做法是在常驻卡里当 `prefs.desktopEnabled === false` 且从未引导过时显示引导文案 + localStorage 7 天冷却（抄 web 的 `LAST_PROMPT_KEY`）—— **本轮不做**。

---

### C4-03 · 通知中心的「开启 / 关闭 / 重新开启」按钮：PC 缺失（形态）

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:499-541`（`granted && !enabled` → 「重新开启」；`granted && enabled` → 「关闭」）、`:543-565`（default → 「开启」）；每个按钮带 `data-testid`（`web-notif-reenable` / `web-notif-disable` / `web-notif-enable`）
- **PC 端**：PC 的等价物在**齿轮弹窗**里（`NotificationSettingsSheet` 的「桌面通知」`ToggleRow`），**通知页本身没有一键开关按钮**
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Notifications.tsx:381-389`
  - 实际形态：常驻卡按状态给「关闭」(`:382` `<Button size="sm" variant="outline" onClick={onDisable}>`) / 「开启」(`:386` `<Button size="sm" onClick={onEnable} className="gap-1.5">`) 两个一键按钮；PC 的「未开启」态再点「开启」= web 的「重新开启」，三态行为等价。

---

### C4-04 · SSE 连接方式：fetch + 手写帧解析 vs EventSource + query token

- **web 端**：`gacode-web/src/lib/notification-stream.ts:365-432`
  ```ts
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "text/event-stream",
    "Cache-Control": "no-cache",
  };
  if (lastEventId) headers["Last-Event-ID"] = lastEventId;
  const res = await fetch(`${API_BASE}${NOTIFICATION_STREAM_PATH}`, {
    method: "GET", headers, signal: controller.signal, cache: "no-store",
  });
  ...
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = new SseFrameParser();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    for (const frame of parser.push(text)) {
      if (frame.id) lastEventId = frame.id;
      const ev = parseNotificationEvent(frame.data);
      if (ev.type === "notification" && ev.notification) { opts.onNotification(ev.notification); }
    }
  }
  ```
  → 用 `fetch` 的原因（`:17-24` 注释）：**`EventSource` 不能带自定义请求头**，后端 `requireAuth` 只读 `Authorization` 头 → token 会进 URL / nginx access log
- **PC 端**：`gacode-electron/src/lib/notifications-sse.ts:76-81` + `:166`
  ```ts
  const buildUrl = (overrideToken?: string | null): string => {
    const tok = overrideToken ?? getAccessTokenForSse();
    const base = getNotificationStreamUrl();
    if (!tok) return base;
    return `${base}?token=${encodeURIComponent(tok)}`;
  };
  ...
  const es = new EventSource(url, { withCredentials: true } as EventSourceInit);
  ```
  → **token 拼在 query 上**
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `78d6b8c`）**
  - PC 侧锚点：`src/lib/notifications-sse.ts:371-377`（请求头）+ `:380-386`（fetch）+ `:97-123`（`SseFrameParser`）+ `:126-141`（`parseSseFrame`）+ `:155-173`（`parseNotificationEvent`）
  - 实际形态：`EventSource` → `fetch` + 手写 SSE 帧解析。请求头 `Authorization: Bearer ${tok}` + `Accept: text/event-stream` + `Cache-Control: no-cache` ⇒ **token 不再落 URL**；帧解析 / 重连策略逐字抄 web `gacode-web/src/lib/notification-stream.ts:45-135` / `:327-453`。

---

### C4-05 · SSE 跨标签页租约：PC 缺失（且 web 的这套机制已被服务端作废）

- **web 端**：`gacode-web/src/lib/notification-stream.ts:137-298` —— `acquireNotificationStreamLease()`
  - 租约 key：`NOTIFICATION_LEASE_KEY = "gacode-notif-sse-lease"`（localStorage）
  - 心跳：`NOTIFICATION_LEASE_HEARTBEAT_MS = 5_000`
  - 过期：`NOTIFICATION_LEASE_STALE_MS = 15_000`
  - 规则（`:143-154` 注释）：「后端 `GET /notifications/stream` 是**一个用户一条连接** —— 新连接会把旧连接掐掉 → 浏览器开 2 个标签页 = 2 条连接 = 互相掐 = 无限 ping-pong」
  - 结果：只有**持有者标签页**连 SSE，其余当 follower
- **PC 端**：**PC 缺失**（Electron 是**单窗口单 renderer**，`notifications-sse.ts` 直接连，没有多连接问题）
- **服务端事实（关键）**：**web 的这段注释已经过时** —— `unified-api/src/modules/notifications/notification.routes.js:221-223`：
  ```
  // [2026-10-23 多端在线] 同一个账号**可以同时开多条**（手机 / 平板 / 电脑各一条），
  //   通知会推到**每一条**上 —— 所有端都要弹系统级提示。
  //   旧实现是「新连接进来先把旧连接 raw.end() 掉」→ 先连上的那端之后再也收不到。
  ```
  且 `:234-235`：`addSseConnection(userId, reply)` 是**追加**，不顶替同 userId 的其它连接
- **怎么改**：**本轮不做（PC 侧不需要 · 不计入合计）** —— 详见文末「本轮不做」表。
  - 依据：Electron 是单窗口单 renderer，`src/lib/notifications-sse.ts` 直接连，不存在「多标签页互相掐连接」的问题 ⇒ PC 侧 **0 行**。附带记录：web 的租约机制依据已过时 —— 服务端 `unified-api/src/modules/notifications/notification.routes.js:221-223`（2026-10-23 起一个账号可同时开多条连接，`addSseConnection` 追加不顶替）⇒ web 侧 `gacode-web/src/lib/notification-stream.ts:137-298` 的租约代码可以整块删掉，属 **web 端技术债**，不在本 PC 清单范围。

---

### C4-06 · SSE 重连策略与 `Last-Event-ID` 续传

- **web 端**：`gacode-web/src/lib/notification-stream.ts:327-453`
  - 指数退避：`retryDelay` 从 `1_000` 起，每次 `Math.min(retryDelay * 2, maxRetry)`，`maxRetry = opts.maxRetryDelayMs ?? 30_000`（`:330`）
  - 401 特判：`if (res.status === 401) { scheduleRetry(15_000); return; }`（`:392-396`）—— 不猛重连，等 15s
  - 未登录：`scheduleRetry(5_000)`（`:370-374`）
  - **`Last-Event-ID` 续传**：`:382` `if (lastEventId) headers["Last-Event-ID"] = lastEventId;` + `:416` `if (frame.id) lastEventId = frame.id;`
- **PC 端**：`gacode-electron/src/lib/notifications-sse.ts`
  - 退避：`backoff` 从 `BACKOFF_INITIAL_MS = 1000` 起 → `Math.min(backoff * 2, BACKOFF_MAX_MS)`，`BACKOFF_MAX_MS = 30_000`（`:31-32`）✅ 与 web 一致
  - 401 路径：`es.onerror` 里靠「从未收到过 message + readyState===CLOSED」判定首次连接失败 → `tryRefreshAccessToken()` → 用新 token 立即重建（`:195-211`）—— **与 web 的「等 15s」策略不同**（web 是保守等待，PC 是主动刷新重试）
  - **无 `Last-Event-ID`**：PC 从不记录 `event.id`，重连时**不带续传头** → **断流期间漏掉的通知永远收不到**（只能靠列表轮询兜底，而通知页**没有轮询** → 彻底丢失）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `78d6b8c`）**
  - PC 侧锚点：`src/lib/notifications-sse.ts:256-257`（`lastEventId`）+ `:377`（续传头）+ `:427`（回写 id）+ `:388-404`（401）+ `:407-409` / `:436-439` / `:444-445`（退避）
  - 实际形态：`let lastEventId: string | null = null;` → 建连时 `if (lastEventId) headers["Last-Event-ID"] = lastEventId;` → 收到帧 `if (frame.id) lastEventId = frame.id;` ⇒ **续传能力已具备**（服务端 `replayMissedEvents` 可补发）。退避 1s → 翻倍 → 上限 30s（异常/非 ok 才翻倍，正常读完不翻倍）；401 先 `tryRefreshAccessToken()`（PC 独有），换不到再等 15s（`:73` `UNAUTHORIZED_RETRY_MS = 15_000`）⇒ 与 web 的保守策略等价。

---

### C4-07 · SSE 看门狗（60s 无事件即重连）

- **web 端**：**无看门狗**。web 靠 `reader.read()` 的 Promise 在连接被代理卡住时**永久挂起**（不触发重连）—— 这是 web 的一个已知薄弱点
- **PC 端**：`gacode-electron/src/lib/notifications-sse.ts:33` `HEARTBEAT_TIMEOUT_MS = 60_000` + `:89-114` `armWatchdog()`（每 10s 检查一次，60s 无事件 → `current.close()` + 100ms 后 `schedule()`）
- **怎么改**：**本轮不做（PC 增强 · 按 gaga 指示不列差异 · 不计入合计）** —— 详见文末「本轮不做」表。
  - 依据：PC 侧 `src/lib/notifications-sse.ts:71` `HEARTBEAT_TIMEOUT_MS = 60_000` + `:286-304` `armWatchdog()`（60s 无事件 → abort + 退避重连），web **无看门狗**（`reader.read()` 在代理卡连接时会永久挂起）。这是 PC 独有能力，不是要「对齐」的差异 ⇒ 保留，不派工。

---

### C4-08 · 「AI 回复到达」的系统通知：PC 缺失

- **web 端**：`gacode-web/src/components/WebNotificationWatcher.tsx:61-92` + `gacode-web/src/lib/webNotifications.ts:278-333`
  ```ts
  // createStreamingWatcher — 订阅 useChatStore, 检测 assistant message 的 finishedAt null→非 null
  const check = (): void => {
    if (!isHidden()) return;                       // ① 页面不在前台
    const map = opts.getMessages();
    for (const chatId of Object.keys(map)) {
      for (const m of map[chatId] || []) {
        if (m.role !== "assistant") continue;
        const prev = prevFinishedAt.get(m.id);
        const cur = m.finishedAt ?? null;
        if (prev === undefined) { prevFinishedAt.set(m.id, cur); continue; }
        if (prev == null && cur != null) {          // ② 终态跃迁
          prevFinishedAt.set(m.id, cur);
          opts.onTerminal(chatId, m);
        } else if (prev !== cur) { prevFinishedAt.set(m.id, cur); }
      }
    }
  };
  ```
  弹窗内容（`WebNotificationWatcher.tsx:68-88`）：title = 会话标题（取不到则「新对话」）；body = AI 回复正文去掉 `<thinking>...</thinking>` 后截断 100 字（剥光则回退 `(思考) {thinking 文本}`，再空则「AI 回复了您」）；`tag = chat-{chatId}`（同会话多条合并）
- **PC 端**：**PC 缺失**（`grep -rn "finishedAt|showChatNotification" gacode-electron/src` → **0 命中**）
- **差异判定**：**缺失**（web 特有能力 · 见 `S-11`，待 gaga 拍）
- **怎么改**：**未落地** —— **本轮不派工**，归 `S-11` 待 gaga 拍。
  - PC 侧锚点：无（`grep -rn "finishedAt|showChatNotification" src` → **0 命中**；`src/lib/api.ts` 的 `ChatMessage` 也没有 `finishedAt` 字段）
  - 实际形态：web 靠订阅 `useChatStore` 检测 assistant message 的 `finishedAt` 从 null 变非 null → 页面不在前台时弹系统通知。**前置待核未变**：PC 的聊天 SSE 在 AI 回复收尾时有没有可订阅的终态信号（需读 PC 聊天流收尾实现，本轮未核）⇒ 需 gaga 先定「PC 要不要补这个能力」。

---

### C4-09 · 前台收到时是否弹系统通知：web 判隐藏，PC 无条件弹

- **web 端**：`gacode-web/src/lib/webNotifications.ts:186-191`
  ```ts
  if (!isSupported()) return false;
  if (getPermissionState() !== "granted") return false;
  if (!isEnabled()) return false;
  if (typeof document === "undefined") return false;
  // 触发条件: tab 在后台 / 不可见. 任一为真即视为不在聊天焦点.
  if (!document.hidden && document.visibilityState !== "hidden") return false;
  ```
- **PC 端**：`gacode-electron/src/lib/notifications-sse.ts:132-149` —— **无条件**调 `notificationSSESend` + **无条件**弹应用内 toast
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `78d6b8c`）**
  - PC 侧锚点：`src/lib/notifications-sse.ts:330-332`（前台判定）；焦点桥 `electron/main.ts:410-421`（`ipcMain.handle('gacode:is-focused')`）+ `electron/preload.ts:70-71`（`isWindowFocused()`）
  - 实际形态：`void isWindowFocused().then((focused) => { if (focused) return; … })` ⇒ **窗口在前台时不弹 Windows Toast**。主进程算真值 `!mainWindow.isMinimized() && mainWindow.isFocused()`，**不用** renderer 的 `document.hidden`（Electron 窗口最小化时 `visibilityState` 仍可能是 `visible`）。

---

### C4-10 · 系统通知正文为空时的处理：web 兜底，PC 直接丢弃

- **web 端**（**三处来源要分清 · E11 修正**）：
  1. `gacode-web/src/lib/webNotifications.ts:149-151` `showChatNotification()` —— **聊天 AI 回复到达**场景：
     ```ts
     body: (opts.bodyPreview || "").slice(0, 100) || "您有一条新消息",
     ```
     ⇒「您有一条新消息」是**聊天通知**的兜底，**不是站内通知**的兜底
  2. `gacode-web/src/components/WebNotificationWatcher.tsx:117-120` —— **站内通知**路径（走 `showSiteNotification`）：
     ```ts
     showSiteNotification({
       title: n.title || pres.label,
       body: notificationSummary(n),
       ...
     ```
     `notificationSummary()`（`gacode-web/src/lib/notifications.ts:469-483`）的兜底是**按 type 给占位**：「日程到点了」/「定时任务已产出结果」/「**你有一条新通知**」；且它**永不返回空串**（body 为空也会落到按 kind 的占位）
  3. `gacode-web/src/lib/webNotifications.ts:196` —— 通用 `showSiteNotification()` 本体：`body: (opts.body || "").slice(0, 100),` ⇒ **它自己没有任何 body 兜底**（兜底由调用方 ② 传进来的 `notificationSummary(n)` 提供）
- **PC 端**：`gacode-electron/src/lib/notifications-sse.ts:136` → `body: n.body || ""` → `gacode-electron/electron/notifications.ts:47`
  ```ts
  if (!title || !body) {
    console.warn('[gacode-electron] notify called with empty title/body');
    return false;
  }
  ```
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `78d6b8c`）**
  - PC 侧锚点：`src/lib/notifications-sse.ts:315`（renderer 侧兜底）+ `electron/notifications.ts:53`（`EMPTY_BODY_FALLBACK`）+ `:130` / `:163`（主进程侧兜底）
  - 实际形态：renderer `const body = (n.body || "").slice(0, 100) || notificationSummary(n);`（按 type 的占位，永不返空串）；主进程 `const body = (args?.body ?? '').trim() || EMPTY_BODY_FALLBACK;`（`'你有一条新通知'`）⇒ **不再整条丢弃**（原 `if (!title || !body) return false` 已删）。日程没写备注（`body = null`）的场景现在能正常收到通知。

---

### C4-11 · 系统通知点击跳转：PC 缺失（主进程没注册 click handler）

- **web 端**：`gacode-web/src/lib/webNotifications.ts:208-221`
  ```ts
  n.onclick = (event) => {
    event.preventDefault();
    n.close();
    try { window.focus(); } catch { }
    try { opts.onClick?.(); } catch (err) { console.warn("[webNotification] onClick threw:", err); }
  };
  ```
  `opts.onClick` 的落点（`gacode-web/src/components/WebNotificationWatcher.tsx:121-130`）：外链 → `openExternalNotificationUrl`；站内 → `nav.client(routerRef.current, target.href)`
- **PC 端**：`gacode-electron/electron/notifications.ts:52-53`
  ```ts
  const n = new Notification({ title, body, silent: false });
  n.show();
  ```
  → **没有 `n.on('click')`** → 点 Windows Toast **什么都不会发生**（通知也不会关闭）
  - ⚠️ 同文件 `:67-98` 的 SSE 路径 `ipcMain.on('gacode:notification-sse-event')` 也一样，只 `new Notification(opts).show()`
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `78d6b8c`）**
  - PC 侧锚点：`electron/notifications.ts:81-112`（`attachClick`）+ `:134` / `:174`（两处 `new Notification` 都挂上）+ `:46`（`NOTIFICATION_CLICKED_CHANNEL`）；桥 `electron/preload.ts:74-75`（`onNotificationClick`）；渲染层 `src/lib/notifications-sse.ts:229-241`（跳路由）+ `:202-207` + `:338`（`notificationClickTarget` 传 target）
  - 实际形态：点 Windows Toast → `n.close()` → `restore()` + `show()` + `focus()` → 落点分流（`http(s)://` → `shell.openExternal`；`/xxx` → `webContents.send('gacode:notification-clicked', target)` → renderer `navigate(target)`）。

---

### C4-12 · 系统通知 `tag` 合并：PC 缺失

- **web 端**：`gacode-web/src/lib/webNotifications.ts:152` → `tag: \`chat-${opts.chatId}\``；`:198` → `tag: opts.tag`；站内通知用 `tag: \`notification-${n.id}\``（`WebNotificationWatcher.tsx:120`）
  → 浏览器按 `tag` 自动合并同 tag 的多条通知，只留最新
- **PC 端**：Electron `Notification` **没有 `tag` 参数**（`electron/notifications.ts:52` 只传 `title/body/silent`）
- **怎么改**：**本轮不做（web 特有 · 不计入合计）** —— 详见文末「本轮不做」表。
  - 依据：Electron 的 `Notification` **没有 `tag` 参数**（`electron/notifications.ts:167-171` 只传 `title/body/silent`），PC 无从 1:1 抄 ⇒ 台账原「怎么改」已写明「**建议不做**」。若 gaga 后续要 PC 有合并语义，方向是**自己做去重**（同 target 5s 窗口只弹最后一条），属 PC 增强方向，**本轮不做**。

---

### C4-13 · 「桌面通知」开关关掉后，SSE 仍弹 Windows Toast：PC 端 prefs 未被 SSE 桥检查

- **web 端**：`gacode-web/src/lib/webNotifications.ts:186-188`
  ```ts
  if (!isSupported()) return false;
  if (getPermissionState() !== "granted") return false;
  if (!isEnabled()) return false;      // ← 开关是硬前置条件
  ```
  → web 的开关**真的**能关掉系统通知（`isEnabled()` 读 localStorage `web-notifications-enabled`）
- **PC 端**：
  - `SystemNotification.fire()`（`gacode-electron/src/components/notifications/SystemNotification.tsx:76-94`）**有**检查：
    ```ts
    if (!enabled) return false;
    if (!prefsRef.current.enabled || !prefsRef.current.desktopEnabled) return false;
    ```
    → 但这个 `fire()` **只有「测试通知」按钮在用**（`NotificationSettingsSheet.tsx:91`）
  - SSE 桥 `gacode-electron/src/lib/notifications-sse.ts:132-143` **直接调** `window.gacode?.notificationSSESend?.({...})`，**完全不看 prefs**
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `78d6b8c`）**
  - PC 侧锚点：`src/lib/notifications-sse.ts:312`（读 prefs）+ `:319`（应用内 toast 开关）+ `:329`（桌面通知开关）
  - 实际形态：`const prefs = loadNotificationPrefs();` → `if (!prefs.enabled || !prefs.desktopEnabled) return;` ⇒ 「启用通知」+「桌面通知」两个开关成为弹 Windows Toast 的**硬前置条件**，与 web `gacode-web/src/lib/webNotifications.ts:186-188` 的 `isEnabled()` 同语义 ⇒ 关掉开关，SSE 不再弹 Toast。

---

### C4-14 · 通知列表轮询间隔与页面覆盖：PC 不一致

- **web 端**：
  - 通知页（`gacode-web/src/app/(main)/notifications/page.tsx:146-154`）：`refetchInterval: NOTIFICATION_POLL_MS`（**45s**）+ `refetchIntervalInBackground: false`
  - Profile 页（`gacode-web/src/app/(main)/profile/page.tsx:142-149`）：同一个 45s + `staleTime: 30 * 1000`
- **PC 端**：
  - AppShell 角标（`gacode-electron/src/components/layout/AppShell.tsx:136-140`）：`refetchInterval: 30_000`（**30s** 硬编码）
  - **通知页自身**（`gacode-electron/src/routes/Notifications.tsx:63-71`）：**没有 `refetchInterval`** → 列表**只靠 SSE invalidate 刷新**
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `78d6b8c`）**
  - PC 侧锚点：通知页 `src/routes/Notifications.tsx:96-102`（补轮询）+ 侧栏角标 `src/components/layout/AppShell.tsx:243-250`（改 45s）
  - 实际形态：两处 query 均为 `refetchInterval: NOTIFICATION_POLL_MS`（45s）+ `refetchIntervalInBackground: false`，侧栏另补 `staleTime: 30 * 1000` + `retry: false`（原 30s 硬编码、通知页**无轮询**）。

---

### C4-15 · 通知列表的 queryKey 形状不一致，导致失效范围不同

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:147` → `queryKey: ["notifications", { unread: false }]`
  - 角标（`:143`）：`["notifications", { unread: true }]`
  - SSE invalidate（`WebNotificationWatcher.tsx:112`）：`queryClient.invalidateQueries({ queryKey: ["notifications"] })` → **前缀匹配**，两条一起失效 ✅
  - 标已读（`:164`）/ 全部已读（`:178`）：同样 `["notifications"]` → 两条一起刷新 ✅
- **PC 端**：`gacode-electron/src/routes/Notifications.tsx:64-68`
  ```tsx
  queryKey: [...NOTIFICATIONS_PAGE_KEY, "page1", { category, unread: false }],
  ```
  - 角标（`AppShell.tsx:137`）：`["notifications", { unread: true }]`
  - SSE invalidate（`notifications-sse.ts:130`）：`["notifications"]` → 前缀匹配，**两条都命中** ✅
  - 标已读 / 全部已读（`Notifications.tsx:135-137`、`:180-182`）：
    ```tsx
    queryClient.invalidateQueries({ queryKey: [...NOTIFICATIONS_PAGE_KEY, { unread: true }] });
    ```
    → **只命中角标那条**，**不命中列表页那条**（`"page1" !== {unread:true}`）
- **差异判定**：**已一致**
- **怎么改**：**已落地（commit `7b74547`）**
  - PC 侧锚点：`src/routes/Notifications.tsx:67`（queryKey）+ `:148`（标已读 invalidate）+ `:180`（全部已读 invalidate）
  - 实际形态：`const NOTIFICATIONS_QUERY_KEY = ["notifications", { unread: false }] as const;`（去掉 `"page1"` + `category`）；两处失效改 `queryClient.invalidateQueries({ queryKey: ["notifications"] })` ⇒ **前缀匹配**，角标 + 列表两条一起失效，与 web 一致。

---

### C4-16 · 后台 / 关窗行为对照 —— **口径作废（2026-10-26 订正）· 不派工**

> **⚠️ 本条原口径作废，不需要派工。**
> 原口径的前提「**PC 关窗 = 进程退出 ⇒ SSE 断开 ⇒ 通知永久丢失**」**与 PC 当前实现不符**。

- **PC 的 close 按钮不是「退出」，是「隐藏到托盘」** —— `gacode-electron/electron/main.ts:256-262`
  ```js
  // PR2:close 按钮 = 隐藏到托盘,不真退出。
  mainWindow.on('close', (e) => {
    if (!isQuiting && mainWindow && !mainWindow.isDestroyed()) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  ```
  ⇒ 进程**不死**、renderer **不卸载**、SSE 连接**不断**；主进程还能照常弹桌面通知（`gacode-electron/src/lib/notifications-sse.ts:330` → `window.gacode.notificationSSESend`）。
- **web 关页签才是「真断」** —— `gacode-web/src/lib/notification-stream.ts:335` 的 `lastEventId` 是**模块内内存变量**（`:382` 放进请求头、`:416` 写回），刷新 / 关页签即丢；服务端 `unified-api/src/modules/notifications/notification.service.js:57-58`（per-user ring buffer，上限 200 条、**重启清零**）+ `:225-229`（`replayMissedEvents` —— `if (!lastEventId) return 0;` ⇒ **没有 lastEventId 就不补发**）⇒ 关页签期间的通知**同样收不到**。
- **两端行为等价**：在「整个进程 / 页签彻底结束」时**都**丢；**PC 关窗场景还优于 web**（PC 关窗根本不结束，SSE 不断）。
- **原判作废**：原判「形态不同（PC 关窗期间丢通知）→ 结构级 S-8」**不成立** ⇒ 本条**不派工**、预估改动 **0 行**。
- **残留的真差异另算（不在本条）**：**瞬时断流**（网络抖动 / 切后台）下的续传能力 —— web 用 `fetch` + 手写帧解析能带 `Last-Event-ID`（`notification-stream.ts:382`），PC 用 `EventSource` 带不了（`EventSource` 不能加自定义请求头）⇒ 这部分仍留在 **C4-04 / C4-06 / S-8**，与「关窗」无关。
- **服务端事实（不变）**：per-user buffer 保留最近 200 条 + `Last-Event-ID` 续传**能力是有的**（`notification.routes.js:242-247`），只是 web 的 `lastEventId` 一关页签就没了、PC 压根没带。

---

### 组 4 小结
> **2026-10-27 回写**：组 4 **16 条** —— 已落地 10 条 / 真缺口 1 条（`C4-08`）/ 本轮不做 4 条 / 口径作废 1 条。**「本轮不做」与「口径作废」不计入合计**（见文末「全量统计」）。

| 编号 | 判定 | 落地 / 残留 |
|---|---|---|
| C4-01 | 已一致 | `7b74547`（常驻卡替代浏览器权限入口，`S-6` 拍板口径） |
| C4-02 | 本轮不做（不计入合计） | web 特有（浏览器权限模型）· 台账原口径即「推荐不做」 |
| C4-03 | 已一致 | `7b74547` |
| C4-04 | 已一致 | `78d6b8c`（`EventSource` → `fetch` + Bearer 头 + 手写帧解析） |
| C4-05 | 本轮不做（不计入合计） | PC 单窗口不需要；web 侧租约机制依据已过时（服务端 2026-10-23 起支持多连接） |
| C4-06 | 已一致 | `78d6b8c`（`Last-Event-ID` 续传 + 退避策略对齐 web） |
| C4-07 | 本轮不做（不计入合计） | PC 增强（60s 看门狗），按 gaga 指示不列差异 |
| C4-08 | 缺失（真缺口） | **未落地** · 归 `S-11` 待 gaga 拍（本轮不派工） |
| C4-09 | 已一致 | `78d6b8c`（主进程 `gacode:is-focused` 焦点桥） |
| C4-10 | 已一致 | `78d6b8c`（body 空 → 按 type 占位，不再整条丢弃） |
| C4-11 | 已一致 | `78d6b8c`（`n.on('click')` + 恢复窗口 + 落点分流） |
| C4-12 | 本轮不做（不计入合计） | web 特有（浏览器 `Notification.tags`），Electron 无对应参数 |
| C4-13 | 已一致 | `78d6b8c`（SSE 桥查 prefs，开关成硬前置） |
| C4-14 | 已一致 | `78d6b8c`（通知页补 45s 轮询 + 侧栏 30s → 45s） |
| C4-15 | 已一致 | `7b74547`（queryKey 前缀失效） |
| C4-16 | 口径作废（不计入差异） | 2026-10-26 订正：PC 关窗 = 隐藏到托盘 ⇒ SSE 不断 ⇒ 与 web 行为等价 |


---

# 结构级差异 · 需 gaga 拍

> 本节只放**真正还没拍板**的结构差异（信息架构不同、需要挪位置或改流程）。
> **PC 侧栏常驻形态已由 gaga 拍板保留，不在此列**（决策：PC 的 256px 常驻侧栏保留；侧栏**内部内容与交互照 web 对齐** —— 置顶可折叠分组、每条对话的 pin 按钮、条目视觉形态、圆角/间距/hover 态、计数与折叠箭头，一条不落）。
> **PC 独有功能已按 gaga 指示不列入差异清单**（PC 的 `ProfileChangePassword`、通知设置里的「总开关/应用内提示/按类目屏蔽/测试通知」、通知页的「刷新」按钮与齿轮入口、SSE 看门狗等，一律不列）。
> **PC 侧栏对齐 web Drawer 内部内容这条已由上条决策覆盖**，故 `C1-13`（我的应用入口）不再重复列出 —— 它的落法已定：把「我的应用」加进 PC 常驻侧栏的主菜单区（对齐 web `Drawer.tsx:205-228` 的 nav 卡结构），并按 web 的 `isSpecial` 门禁（`Drawer.tsx:101` + `:221-227`）。

---

### S-1 ~ S-12 状态回写（2026-10-27）
> 「结构级差异 · 需 gaga 拍」这一节的**条目本体保留不动**（议题 / 选项 / 影响面 / 建议都是决策记录）。下表只回写**当前状态**，供 gaga 看还剩什么要拍。

| 编号 | 状态 |
|---|---|
| S-1 | ✅ **落法已落地** —— 「我的应用」入口已搬进 PC 常驻侧栏主菜单区 + `user.id === "6"` 门禁（`src/components/layout/AppShell.tsx:380-393`），Profile 页内的无门禁旧入口已删 ⇒ 两个待定点都落地了（入口位置 = web 的抽屉区、Profile 页旧入口已删） |
| S-2 | ✅ **落法已落地（方案 b）** —— Profile 信息区改成多张独立卡 + `space-y-2`，**保留** PC 独有的「邮箱」「注册时间」两行（`src/routes/Profile.tsx:232-246`） |
| S-3 | ✅ **已拍板且两端已统一** —— 两端都用 `/auth/account`（web `gacode-web/src/lib/api.ts:1365-1366`，web 仓 commit `b84f872`（2026-10-26）已改） |
| S-4 | ✅ **无需拍** —— `Button` / `ConfirmDialog` 已按 web 形态重排（`C2-40` / `C2-20`），全站按钮与弹窗视觉同步变了，这是本轮**已接受的连带改动** |
| S-5 | ⏳ **仍待 gaga 拍** —— PC 已改成「保存时上传 1 次头像」（磁盘只写一次），但「要不要补 web 的本地 store 立即更新」这一半没做（`C2-44` 残留） |
| S-6 | ✅ **已拍板并落地** —— PC 三态（已开启 / 未开启 / 系统不支持）+ 通知页顶部常驻卡 + 「不做自动弹窗」 |
| S-7 | ✅ **已按 (a) 前端改落地** —— PC 弃用 5 个 `category` tab，改成按服务端 `type` 分三组；`CategoryTabs.tsx` 已删 |
| S-8 | ✅ **已落地** —— SSE 客户端改成 `fetch` + `Last-Event-ID` 续传（`78d6b8c`）⇒ 瞬时断流不再丢通知 |
| S-9 | ✅ **已落地** —— token 不再拼在 URL query 上，改 `Authorization: Bearer` 头 |
| S-10 | ✅ **已按 (a) 兼容层落地** —— `Toast.tsx` 同时接受 `message`（= `title` 别名）与 `title` / `description` ⇒ 全仓旧调用点零改动 |
| S-11 | ⏳ **仍待 gaga 拍** —— 「AI 回复到达提醒」PC 要不要补（`C4-08`）；前置「PC 聊天流有无终态信号」仍未核 |
| S-12 | ⏳ **仍待 gaga 拍** —— PC 没有日程模块；当前按短期兜底落地（点日程提醒弹「无法识别的链接」），要不要另立项给 PC 补日程模块待定 |


---

### S-1 · 「我的应用」入口归属：web 在全局侧边抽屉，PC 在 Profile 页内

- **议题**：web 的「我的应用」入口在**全局侧边抽屉**并带 `isSpecial` 门禁；PC 的入口在 **Profile 页内的操作列表**且**没有**门禁。改「入口归属」= 改信息架构，不是一行 className
- **web 现状**：`gacode-web/src/components/layout/Drawer.tsx:101` `const isSpecial = (profile?.id || user?.id) === SPECIAL_USER_ID;` + `:221-227` `{isSpecial && (<DrawerNavItem icon={Package} label="我的应用" onClick={() => handleNav("/profile/apps")} />)}`；入口容器是 `Drawer.tsx:205` 的 nav 卡 `rounded-md bg-bg-elevated m-3 mb-0 p-2 space-y-1`
- **PC 现状**：`gacode-electron/src/routes/Profile.tsx:196-197` `label="我的应用"` / `onClick={() => navigate("/profile/apps")}`；PC 常驻侧栏是 `src/components/layout/AppShell.tsx`（`NAV_ITEMS` 数组自 `:73` 起），**当前既没有这一项，也没有 `isSpecial` 门禁**
- **选项**：
  - (a) **搬进 PC 侧栏主菜单区** + 加 `isSpecial` 门禁（对齐 web 的信息架构；需要 `AppShell` 能拿到 `profile` —— `AppShell.tsx:26` 已 import `listNotifications`，可追加 `getProfile`）
  - (b) **保留在 Profile 页内**，只补 `isSpecial` 门禁（改动最小，但入口位置与 web 不一致）
  - (c) 两处都放（PC 增强 → 双入口，与 web 不一致）
- **影响面**：(a) `AppShell.tsx`（`NAV_ITEMS` + 门禁 + 手写 `PackageIcon` SVG，见 F-2）+ 删 `Profile.tsx:196-197` 旧入口；(b) 只改 `Profile.tsx`；(c) 同 (a) 且多一处入口
- **建议**：**(a)** —— 落法已被本节开头的决策覆盖（「把『我的应用』加进 PC 常驻侧栏的主菜单区，并按 web 的 `isSpecial` 门禁」），本条作为**结构级记录**保留；剩一个待定点：(a) 执行时 **Profile 页内的旧入口是否一并删除**（建议删，避免双入口）
- **相关条目**：C1-12、C1-13

---

### S-2 · Profile 信息卡结构：web 是 4 个独立卡，PC 是 1 个大卡内分隔线

- **议题**：Profile 页主体信息区用**多张独立圆角卡**（web）还是**一张大卡 + 分隔线**（PC）—— 决定要不要重写 `ProfileRow` / `InfoRow` / `UidRow`，属结构级改动
- **web 现状**：`gacode-web/src/app/(main)/profile/page.tsx:236-254` → `<div className="space-y-2">` 里 4 个 `<ProfileRow>`：名字 / UID（带 `CopyUidButton`）/ 性别 / 简介；每行 = 一个独立 `w-full rounded-md bg-bg-elevated p-4` 圆角卡，行间 `space-y-2`=8px
- **PC 现状**：`gacode-electron/src/routes/Profile.tsx:171-180` → `<div className="rounded-md bg-bg-elevated divide-y divide-border">` 里 `UidRow` / `InfoRow(邮箱)` / `InfoRow(性别)` / `InfoRow(简介)` / `InfoRow(注册时间)` —— **一张卡 + `divide-y`（1px `#363b41`）**；且 **PC 比 web 多两行（邮箱 / 注册时间）**
- **选项**：
  - (a) 改成 web 的多卡结构，**行内容也完全对齐 web**（名字 / UID / 性别 / 简介，去掉邮箱 / 注册时间）—— 1:1，但 PC 少两行信息
  - (b) 改成多卡结构但**保留 PC 的行内容**（名字 / UID / 邮箱 / 性别 / 简介 / 注册时间）—— 视觉对齐 web，信息不丢
  - (c) **不动**（保留一张卡 + 分隔线）—— 0 行改动，观感与 web 不同
- **影响面**：(a)/(b) 都要新增 `ProfileRow` 组件（照抄 web `src/app/(main)/profile/page.tsx:74-76` 一带的实现）+ 替换 `Profile.tsx:171-180` 的调用 + 删/改 `InfoRow` / `UidRow` 的容器样式；估算 **35 行**（与 C2-11 一致）
- **建议**：**(b)** —— 视觉上 1:1 对齐 web（多卡 + `space-y-2`），**同时保留 PC 独有的邮箱 / 注册时间**（PC 增强不删）；`ChevronRightIcon`（`Profile.tsx:552-558`）已与 web 的 `<ChevronRight className="w-4 h-4 text-fg-muted shrink-0" />` 一致，可直接复用
- **相关条目**：C2-11、C2-12

---

### S-3 · 注销账户走哪个端点 —— web 的写法**不删账号**，PC 的写法才真删

> ✅ **已拍板（gaga 2026-10-26）：以 PC 为准，两端统一 `/auth/account`**（真删账号）。
> - **PC 端 `deleteAccount()` 不动**（已经是 `/auth/account`）；要改的是 **web 端** `gacode-web/src/lib/api.ts:1363-1364` 改调 `/auth/account` + 同步修 UI 文案「你的所有数据已永久删除」—— **web 端属别的端 → 交总 PM**
> - ⚠️ **事实订正（2026-10-26 复核）**：下面原始分析引的 `unified-api/src/yinian.routes.js:377-381`（→ `purgeUserData()` 只删 3 张表）是**未注册的死代码**；线上注册的是 `src/server.js:29` + `:221` → `src/modules/yinian/yinian.routes.js`，其 `DELETE /account`（`:579-582`）自 2026-10-15（commit `9e25a4d`）起已转发到 `authService.deleteAccount()` = **真删账号** ⇒ 「web 不删 / PC 删」的行为分叉**已不存在**，现在只剩端点路径不统一，**方案 A 的落地成本 = web 改 1 行**

- **web**：`DELETE /yinian/account` → `unified-api/src/yinian.routes.js:377-381` → `yinianService.purgeUserData()`（`yinian.service.js:1245-1256`）= **只删** `yinianMemoryAtom` / `yinianChatSession` / `yinianEmbeddingQuota` 三张表，**账号本身留着**
- **PC**：`DELETE /auth/account` → `unified-api/src/modules/auth/auth.routes.js:189-193` → `authService.deleteAccount()` = **物理删账号 + 关联数据 + 磁盘残留**（幂等）
- **两端 UI 文案却一样**：web 弹「你的所有数据(账户、会话、知识库、设置)将被永久删除」并 toast「账户已注销」，然后 `logout()` —— 但账号**根本没删**，用户下次用同一账号还能登录，看到的是被清空的数据
- **要 1:1 还原 web 的后果**：PC 端点换成 `/yinian/account` → PC 端**不再真删账号**，这是功能倒退；web 端的文案变成虚假承诺
- **建议**：
  - 方案 A（推荐）：**两端都改成 `/auth/account`**（真删），PC 不动，web 单独立项修 —— 但这违背「以 web 为唯一真相源」
  - 方案 B：两端都保留 web 的 `/yinian/account` + **改文案**（不再承诺删账号）—— PC 要回退行为
  - 方案 C：PC 调**两个端点**（先 `/yinian/account` 清 yinian 数据，再 `/auth/account` 删账号）—— PC 端点保留，语义等价于「真删」
- **影响面**：PC 侧 1 个函数（`src/lib/api.ts:1311-1322`）+ 1 个文案（`src/routes/Profile.tsx:374`）；web 侧 1 个函数（`src/lib/api.ts:1363-1364`）+ 1 处文案（`src/app/(main)/profile/page.tsx:169-173`、`:272`）
- **相关条目**：C2-22、C2-23

---

### S-4 · `Button` / `ConfirmDialog` 是 PC 全站共用组件 —— 改成 web 形态会波及全站

- **事实**：`gacode-electron/src/components/ui/Button.tsx` 被 `Profile` / `ProfileEdit` / `ProfileChangePassword` / `Notifications` / `Library` / `Deliveries` 等页共用；`ConfirmDialog.tsx` 被 `Profile`（登出 + 注销）、`Library`、`Deliveries` 共用（见 `ConfirmDialog.tsx:6-8` 的注释）
- **要改的**（C2-40 / C2-20）：web 的 Button 变体（`outline` 用 `bg-background` + `shadow-sm` + `hover:bg-accent`）和 web 的 AlertDialog（`max-w-md rounded-2xl shadow-2xl border p-6` + ESC 关闭 + 锁滚动）
- **两种落法**：
  - **(a) 全局改**：PC 的 `Button` / `ConfirmDialog` 直接改成 web 形态 → **Library / Deliveries / ChatList / Profile 全站的按钮和弹窗视觉一起变**，改动小但影响面不可控（且那些页面对齐不在本次范围）
  - **(b) 加变体**：给 `Button` 加 `variant="web-outline"`、给 `ConfirmDialog` 加 `variant="web-alert"`，只在 Profile / Notifications 用 → 改动集中、不外溢，但 PC 组件库出现「双套」
- **影响面**：(a) 全站视觉；(b) `Button.tsx` + `ConfirmDialog.tsx` + Profile/Notifications 调用点
- **相关条目**：C2-20、C2-40、C3-03（Badge 是新组件，无此问题）

---

### S-5 · 头像保存时**重复上传** —— 照抄 web 会让同一张头像写两次磁盘

- **web**：`gacode-web/src/app/(main)/profile/edit/page.tsx:76` 选文件时 `setAvatarFile(file)` + 本地预览；`:84-89` `avatarMutation` 立即上传一次；`:104-108` 保存时 `mutationFn` 里**又上传一次**；`:116-122` `onSuccess` 把两次的结果写进 store
- **PC**：`gacode-electron/src/routes/ProfileEdit.tsx:70-82`（选文件即上传）+ `:104-122`（保存不重复上传）
- **后果**：照抄 web → **同一张头像 POST 两次**（服务端 `gacode/gacode.profile.routes.js:191` `const filename = \`${userId}.${ext}\`;` 是固定路径，第二次覆盖第一次 → 磁盘无膨胀，但多一次网络往返 + 多一次文件写）
- **两种落法**：(a) 照抄 web（严格 1:1，接受重复上传）；(b) PC 保持不重复上传，但补上 web 的「本地 store 立即更新」语义（PC 的 `useAuth` 没有 `updateProfile` patch 方法 → 需要新增）
- **影响面**：PC 侧 `ProfileEdit.tsx` 的 `saveMutation` + PC 的 auth store 是否加 patch 方法
- **相关条目**：C2-41、C2-44

---

### S-6 · 浏览器通知权限三态 —— web 特有，PC 无法 1:1，替代形态要 gaga 定

- **web 的三态**（`gacode-web/src/app/(main)/notifications/page.tsx:456-574`）：`unsupported` / `denied` / `default` / `granted && !enabled`（已暂停）/ `granted && enabled`（已开启），每态一套图标 + 文案 + 按钮
- **PC 无法 1:1 的原因**：Electron 没有浏览器权限模型；Windows 的通知权限在「系统设置 → 通知」，应用内**调不起**系统授权 UI，也没有 `Notification.permission` 三态
- **PC 可用的等价三态**：`已开启`（`prefs.enabled && prefs.desktopEnabled`）/ `未开启` / `系统不支持`（`!window.gacode?.notify`）—— 完整对照见组 4 的 4.1 节
- **要 gaga 定的**：
  1. PC 的通知开关卡片放在**通知页顶部常驻**（对齐 web）还是继续留在**齿轮弹窗**里？
  2. PC 首次进入要不要给一次引导？（web 是 chat 详情页自动弹 Sheet + 7 天冷却；**建议 PC 不做自动弹窗** —— 桌面应用不该在用户没触发时弹模态框）
  3. PC 的文案怎么写？（web 的「请在浏览器设置中允许本站点发送通知」→ 改成「请在 Windows 设置 → 系统 → 通知中允许 Gacode」）
- **影响面**：`Notifications.tsx`（新增一张卡）+ `NotificationSettingsSheet.tsx`（措辞）
- **相关条目**：C3-05、C3-24、C4-01、C4-02、C4-03

---

### S-7 · 通知列表的分组维度：web 按业务 `type` 分组，PC 按 `category` 分 tab（而 `category` 服务端不存在）

- **web**：`gacode-web/src/lib/notifications.ts:435-439` `NOTIFICATION_GROUP_ORDER = ["schedule_reminder", "cron_result", "other"]` → 页面内 3 组，每组带图标 + 标题 + 数量
- **PC**：`gacode-electron/src/components/notifications/CategoryTabs.tsx:19` `type NotificationCategory = "all" | "system" | "chat" | "library" | "delivery"` → 顶部 5 个 tab
- **硬事实（F-8）**：
  - `unified-api/src/modules/notifications/notification.routes.js:349` `const where = { userId }` → **`?category=` 被完全忽略**
  - `unified-api/prisma/schema.prisma:580-602` `model CustomNotification` **没有 `category` 列**
  - → **PC 的 5 个 tab 全部返回同一批 50 条数据，切 tab 没有任何变化**；`NotificationItem.tsx:28-33` 的 `CATEGORY_BAR`（system/chat/library/delivery 四色）也永远取不到值，图标恒为 `DefaultIcon`
- **要 gaga 定的**：
  - (a) **前端改**：PC 弃用 tab，改成 web 的按 `type` 分组（服务端已支持）—— 改动集中在 `Notifications.tsx` + 新建 `src/lib/notifications.ts`
  - (b) **服务端改**：给 `custom_notifications` 加 `category` 列 + 落库时分类 + `GET /notifications` 支持 `?category=` + `?cursor=`（同时解决分页）—— 服务端改造，不在 PC 前端范围
- **影响面**：(a) PC 约 370 行；(b) Prisma migration + `notification.routes.js` + `notification.service.js` + 两条落库路径（`schedules.service.js:1333`、`:1449`）
- **相关条目**：C3-07、C3-08、C3-10、C3-20

---

### S-8 · PC 的 SSE 断流续传（`Last-Event-ID`）—— 标题口径已订正（2026-10-26）

> **⚠️ 标题订正**：本条原标题是「PC **关窗**期间的通知会永久丢失」—— 该前提**与 PC 当前实现不符**（PC close 按钮 = 隐藏到托盘，进程不死 ⇒ 关窗期间**不丢**）。原 C4-16 已据此标为**口径作废**（见 C4-16 条）。
> **仍然成立的真差异**是**瞬时断流**（网络抖动 / 切后台 / 弱网）下的续传能力 —— 下面这一条**不派工、仍待 gaga 拍**。

- **现状**：PC 用 `EventSource`（`notifications-sse.ts:166`），**EventSource 不能带自定义头** → **无法发送 `Last-Event-ID`** → 重连时服务端不知道客户端收到哪 → **断流期间的通知丢失**
- **服务端能力是有的**：`notification.routes.js:242-247` `replayMissedEvents(userId, reply, lastEventId)`，per-user buffer 保留最近 200 条（`notification.service.js:57-58`，重启清零）
- **web 已经实现了**：`gacode-web/src/lib/notification-stream.ts:382` + `:416` —— 因为 web 用 `fetch` 而不是 `EventSource`（`:17-24` 注释明写原因：`EventSource` 不能带自定义请求头）
  - ⚠️ 但 web 的 `lastEventId` 是**模块内内存变量**（`:335`）⇒ **刷新 / 关页签即丢** ⇒ web 在「页签彻底结束」时**同样收不到**（服务端 `notification.service.js:225-229` `if (!lastEventId) return 0;` ⇒ 没 id 就不补发）⇒ **两端在「彻底结束」时行为等价**
- **要 gaga 定的**：PC 要不要为此把 SSE 客户端从 `EventSource` 改成 `fetch` + 手写帧解析（≈120 行重写）？
  - (a) 改：与 web 一致 + **断流**不丢通知（与 S-9 同一个技术改造，一起做成本最低）
  - (b) 不改：接受断流丢通知（PC 是常驻桌面应用，窗口最小化/隐藏到托盘时 SSE 不断，实际丢通知的窗口很窄）
- **影响面**：`src/lib/notifications-sse.ts` 全文件重写
- **相关条目**：C4-04、C4-06（C4-16 已作废）

---

### S-9 · PC 的 SSE 把 token 拼在 URL query 上

- **PC**：`notifications-sse.ts:78-81` → `${base}?token=${encodeURIComponent(tok)}`
- **web**：`notification-stream.ts:376-390` → `Authorization: Bearer ${token}` **请求头**；注释（`:17-24`）明写原因：`EventSource` 不能带自定义头，而 token 落 URL 会进 nginx access log
- **现实差别**：PC 是 Electron 本地应用，请求**不经 nginx**（直连 unified-api），URL 不进 access log —— 所以这条在 PC 侧**风险低于 web**
- **要 gaga 定的**：(a) 为 1:1 + 拿到续传能力一起改成 fetch + Bearer 头（与 S-8 合并）；(b) 保留 `?token=`（PC 场景下无日志泄漏风险），但那样就**拿不到 `Last-Event-ID` 续传**（S-8 只能选不做）
- **影响面**：同 S-8
- **相关条目**：C4-04、C4-06

---

### S-10 · Toast 组件的 API 是破坏性变更（`message` → `title` / `description`）

- **web**：`gacode-web/src/components/common/Toast.tsx:39-45` → `ToastItem { title?, description?, variant?, duration? }`；`toast()` 收 `Omit<ToastItem,"id">`
- **PC**：`gacode-electron/src/components/ui/Toast.tsx:24-28` → `ToastItem { id, message, variant }`；`toast()` 收 `{ message: string; variant?, duration? }`
- **后果**：改成 web 的双行结构后，PC 全仓所有 `toast({ message: ... })` 调用点都要改（`grep -rn "toast({" gacode-electron/src`）
- **两种落法**：
  - (a) **兼容层**（推荐）：Toast 组件改成 web 的双行渲染，但 `toast()` **同时接受** `message`（作为 title 的别名）和 `title`/`description` → 现有调用点零改动，只有新增的按 web 文案的调用点用 `title`
  - (b) 全量改：全仓调用点改成 `title`/`description` → 改动面大但语义最干净
- **影响面**：(a) `Toast.tsx` 1 个文件；(b) `Toast.tsx` + 全仓调用点
- **相关条目**：C2-48、C2-18、C2-23、C2-45、C3-04、C3-17

---

### S-11 · 「AI 回复到达提醒」在 PC 端从哪接

- **web 有**：`gacode-web/src/components/WebNotificationWatcher.tsx:61-92` + `gacode-web/src/lib/webNotifications.ts:278-333` —— 订阅 `useChatStore`，检测 assistant message 的 `finishedAt` 从 null 变非 null → 页面不在前台时弹系统通知
- **PC 没有**：`grep -rn "finishedAt|showChatNotification" gacode-electron/src` → **0 命中**；PC 的 `src/lib/api.ts:322-336` `ChatMessage` **也没有 `finishedAt` 字段**
- **要 gaga 定的**：PC 要不要补这个能力？
  - 前置**待核**：PC 的聊天 SSE 在 AI 回复收尾时有没有可订阅的终态信号？（需读 PC 的 chat SSE 收尾实现 —— **本次未核实**）
  - 若要补：需要 (1) 在 PC 聊天流收尾处广播事件 (2) 新增通知器 (3) 主进程暴露「窗口是否在前台」（Electron 的 `document.hidden` 在窗口最小化时仍可能是 `visible`，不能用）—— 约 80 行 + 主进程 IPC
  - 若不补：PC 就没有「AI 回复了但我没盯着屏幕」这个提醒
- **影响面**：`src/lib/chat-notifications.ts`（新）+ 聊天流收尾处 + `electron/main.ts` + `electron/preload.ts`
- **相关条目**：C4-08、C4-09

---

### S-12 · PC 没有日程模块，通知里的「日程提醒」无处可落

- **硬事实**：`gacode-electron/src/App.tsx:99-212` 的路由表**没有 `/schedule`**（只有 `/login` `/register` `/qr-login` `/` `/chat` `/chat/:id` `/library` `/library/:id` `/deliveries` `/deliveries/:id` `/notifications` `/profile` `/profile/edit` `/profile/change-password` `/profile/apps` `/browser`）
- **后果**：`schedule_reminder` 通知的 `payload.scheduleId`（服务端 `schedules.service.js:1341`）在 PC 上**没有对应路由**可跳；`path="*"` 会 `Navigate to="/"` 兜回首页
- **要 gaga 定的**：
  - (a) 本次只对齐通知路径：**PC 的 `scheduleTarget()` 返回 `kind:"none"` + `rawLink`**，点日程提醒弹「无法识别的链接」提示（与 web 对「认不出的链接」的处理一致）—— 改动小，但功能上 PC 少一半通知落点
  - (b) 另立需求给 PC 补日程模块（本次范围外）
- **影响面**：(a) `src/lib/notifications.ts` 的 `scheduleTarget()` + `C3-17` 的 `handleClick`
- **相关条目**：C3-17

---

## 全量统计

### 差异条数
> **2026-10-27 重算**：本轮把台账逐条核到**当前工作树**后重算。基线是 M11 批（`a8b9301`）的 101 条差异行；本轮把**已落地**的 89 条改判为「已一致」，把 4 条**本轮不做**的条目移出差异统计（并删除其 `- **差异判定**：` 行，与 `C4-16` 的处理方式一致），⇒ 差异行 **101 → 97**，**条目总数仍是 102**（14 + 48 + 24 + 16）。

| 判定 | 条数 |
|---|---|
| **缺失**（web 有，PC 没有） | **1** |
| **形态不同**（两边都有但长得/行为不一样） | **2** |
| **已一致** | **94** |
| **差异合计** | **97** |

> **统计口径**：全文 `- **差异判定**：` 前缀行共 **97** 行，按每行的**首个关键词**（缺失 / 形态不同 / 已一致）分类。`C2-37` 原是「缺失 + 形态不同」混合项，现已落地为单一「已一致」。
> **逐条实测 = 缺失 1 / 形态不同 2 / 已一致 94**（合计 97 ✅）
> - 组 1：缺失 0 / 形态不同 0 / 已一致 **14**
> - 组 2a：缺失 0 / 形态不同 0 / 已一致 **26**
> - 组 2b：缺失 0 / 形态不同 **2** / 已一致 **19**
> - 组 2c：缺失 0 / 形态不同 0 / 已一致 **1**
> - 组 3：缺失 0 / 形态不同 0 / 已一致 **24**
> - 组 4：缺失 **1** / 形态不同 0 / 已一致 **10**
> - ⚠️ **2026-10-27 订正**：`C4-16`（PC 关窗期间通知丢失）已标为**口径作废**（PC close = 隐藏到托盘，SSE 不断 ⇒ 与 web 行为等价，见该条）⇒ 它的 `- **差异判定**：` 行**已删除**，不计入上述三桶。条目本身仍在（组 4 仍是 C4-01 ~ C4-16 **16 条**），只是不再是一个「差异」。
> ⚠️ **2026-10-27 再订正**：`C4-02`（首次授权 Sheet）/ `C4-05`（SSE 跨标签页租约）/ `C4-07`（SSE 看门狗）/ `C4-12`（系统通知 `tag` 合并）四条**移出差异统计** —— 它们要么是 web 特有（PC 无法 1:1，台账原口径即「推荐不做」），要么是 PC 增强（按 gaga 指示不列差异），要么 PC 侧根本不需要（单窗口）。四条的 `- **差异判定**：` 行**已删除**，明细见下方「本轮不做」表 ⇒ 差异行 101 → **97**。

分组分布：

| 组 | 条数 |
|---|---|
| 组 1 · 我的应用 | 14（C1-01 ~ C1-13 + C1-03b） |
| 组 2 · 个人资料 | 48（C2-01 ~ C2-48） |
| 组 3 · 通知页 | 24（C3-01 ~ C3-24） |
| 组 4 · 通知路径 | 16（C4-01 ~ C4-16） |

---

### 本轮不做（**不计入合计**）

> 下面这些条目**没有实现，但有既定决策依据**，不是漏做 ⇒ 不进上面的差异统计。

| 编号 / 主题 | 为什么本轮不做 | 依据 |
|---|---|---|
| **PC 全局禁 CSS 动效** | `src/styles/globals.css:408-414` 全局 `transition-property/duration: none !important` + `animation: none !important` ⇒ web 的 `animate-spin` / `animate-pulse` / `transition-colors` 在 PC 上**一律是静态的** ⇒ 涉及动效的条目（`C2-36` 的 `duration-150`、`C3-04` 的转圈、`C3-22` 的 `animate-pulse` 骨架）**零视觉差**，照抄 web 也看不出来 | PC 端 gagaOS 既定规范（全局禁动效），不改 |
| **PC 的 256px 常驻侧栏保留** | PC 侧栏是常驻栏（`src/components/layout/AppShell.tsx:330` `SIDEBAR_WIDTH`），不改成 web 的抽屉 ⇒ 影响的是**入口所在容器**（`C1-13` 的落法：把「我的应用」加进侧栏主菜单区，已落地），不是要改侧栏本身 | gaga 2026-10-26 21:35 已拍板（PC↔web 差异是待办不是待拍项；PC 的常驻侧栏保留） |
| **web 的 `border-t` / `backdrop-blur-sm`** | 改 `BottomSheet` 会波及全站调用方 ⇒ 本轮不动。**与 C 域无交集**：C 域的 `ConfirmDialog`（`C2-20`）已自带 `backdrop-blur-sm`（`src/components/ui/ConfirmDialog.tsx:105`），与 web `gacode-web/src/components/ui/alert-dialog.tsx:90` 逐字一致 | D 域（HOME）已在 `docs/align-d-home.md` 单独标注；C 域无对应条目 |
| **C4-02** · 首次授权 Sheet + 7 天冷却 | web 特有（依赖浏览器 `Notification.permission` 三态），Electron 无对应模型；台账原「怎么改」即写明「**推荐不做**」——桌面应用不该在用户没主动触发时弹模态框 | 台账原口径 + `S-6` 拍板口径（推荐 PC 不做自动弹窗） |
| **C4-05** · SSE 跨标签页租约 | PC 是单窗口单 renderer，不存在「多标签页互相掐连接」的问题 ⇒ PC 侧 **0 行**。附带记录：web 的租约机制依据已过时（服务端 2026-10-23 起一个账号可同时开多条连接） | 台账原口径 + 服务端 `notification.routes.js:221-223` |
| **C4-07** · SSE 看门狗（60s 无事件重连） | **PC 增强**（web 无此能力）⇒ 按 gaga 指示「PC 增强不列差异」 | 台账原口径 |
| **C4-12** · 系统通知 `tag` 合并 | web 特有（浏览器 `Notification.tags`），Electron 的 `Notification` **没有 `tags` 参数** ⇒ PC 无从 1:1 抄；台账原口径即「建议不做」 | 台账原口径 |

---

### 待 gaga 真机看（**不计入合计**）

> 这些是**代码层面已经一致 / 已落地**，但**观感**要真机确认的项 —— gaga 看一眼再定要不要调。

| 主题 | 看什么 | 落点 |
|---|---|---|
| **未读通知卡的暖色底** | 照抄 web 的 `bg-brand-container/30` + `border-brand/30` 在 PC **纯黑底**（`--bg-base` = `#000000`，`src/styles/globals.css:62`）上的观感是否够「未读」；已读卡的 `bg-bg-sunken`=`#0a0a0a` 与黑底的层级差是否还分得清 | `src/components/notifications/NotificationItem.tsx:59-64` |
| **Toast 居中弹窗** | web 的「屏幕正中 + `bg-black/60` 遮罩 + `rounded-2xl` 面板」在 PC 宽窗口下覆盖整个应用时的观感（PC 现在是「顶部居中单条」） | `src/components/ui/Toast.tsx`（`C2-48`） |
| **通知页顶部「桌面通知」常驻卡** | PC 三态（「桌面通知已开启 / 开启桌面通知 / 系统通知不可用」）的文案 + 按钮排布在通知页顶部的观感（这是 PC 专属文案，不是 web 原文） | `src/routes/Notifications.tsx:343-405`（`C3-05` / `C4-01`） |
| **亮色错误 chip** | 照抄 web 的 `bg-red-50/60` + `text-red-700` 在 PC **纯黑底**上的观感（亮色卡片配黑底会不会刺眼）—— ⚠️ **该 chip 属 chat 域**（`src/components/chat/UploadErrorChip.tsx:44`），C 域无对应条目，但同属本轮 PC↔web 批次 ⇒ 一并提醒 gaga 真机看 | `src/components/chat/UploadErrorChip.tsx`（跨域，非 C 域条目） |
---

### 结构性前置事实（已在正文逐条标注）

| 编号 | 事实 |
|---|---|
| F-1 | PC 无 `clsx` / `tailwind-merge` / `cva` → className 冲突要用 `!` 强制 |
| F-2 | PC 无 `lucide-react`（图标全部是手写 SVG，已收编进共享 `src/components/ui/Glyphs.tsx`，**84** 个导出）· `src/components/ui/` 现有 **15** 个组件：`Avatar / Badge / BottomSheet / Button / Card / ConfirmDialog / DropdownMenu / ErrorBoundary / Glyphs / ImageLightbox / Input / LongPressMenu / Tabs / Textarea / Toast` |
| F-3 | PC 与 web 的 `bg-card` token **现已同为 `#141414`**、双方都有 `card-hover`（`#1e1e1e`；PC `src/styles/globals.css:100/102` + `tailwind.config.ts:87/90`）· PC 的 `bg-card` 精确引用 **25 处 / 22 行 / 8 个文件**（`ui/Card.tsx` / `routes/ProfileApps.tsx` / `routes/Library.tsx` / `routes/ChatList.tsx` / `routes/Deliveries.tsx` / `library/CollectSheet.tsx` / `library/LibraryCard.tsx` / `chat/UploadErrorChip.tsx`）+ `hover:bg-card-hover` **3 处**（`src/components/library/CollectSheet.tsx:290/298/306`） |
| F-4 | 圆角刻度 / `shadow` 两端一致，可逐字搬 |
| F-5 | PC 的 `ProfileChangePassword.tsx` 无 web 对照物 → 不产出条目 |
| F-6 | 服务端 `PUT /api/v1/gacode/profile`（`unified-api/src/modules/gacode/gacode.profile.routes.js:138-152`）：displayName ≤**50** / bio ≤**200** / gender 枚举 4 值（`:41` `['male','female','other','unspecified']`）/ 至少传 1 字段（`anyOf` `:148-152`） |
| F-7 | 服务端 `DELETE /api/v1/yinian/account` 与 `DELETE /api/v1/auth/account` **都真删账号**（前者转发到 `authService.deleteAccount` —— `yinian.routes.js:579-583` 与 `auth.routes.js:189-193` 走同一段代码）；**两端已统一 `/auth/account`**（web `gacode-web/src/lib/api.ts:1365-1366`，web 仓 commit `b84f872`（2026-10-26）已改） |
| F-8 | 服务端 `GET /notifications` **只认 `?unread=true`**（`notification.routes.js:343-368`），无 `category` / `cursor` / `nextCursor` |
| F-9 | 服务端通知的 `actionType` 实际取值 = `url` / `deep_link` / `none`（`notification.routes.js:110-118`），`actionValue` 必须是 string（`actionType==='url'` 时必须是合法 URL）；默认 `actionType='none'` / `actionValue=null`（`:298`） |
---

### 待核项（本清单未最终确认）

| 待核内容 | 出处 | 状态 |
|---|---|---|
| ~~PC 仓没有 Cody 头像资产（`cody_192.png`）→ web 的缺省头像在 PC 上无对应资源~~ | C2-07 | ✅ **已解决** —— `78d6b8c` 已把 `public/assets/cody/cody_192.png`（42110 bytes，SHA256 双边一致）落进 PC 仓 |
| PC 聊天流**有无** AI 回复终态信号（决定 S-11 的成本） | C4-08 / S-11 | ⏳ **仍未核** —— 需读 PC 聊天 SSE 的收尾实现（本轮未核） |
| PC 的 `card-hover` 落地后，`hover:bg-card-hover` 的实际观感 | F-3 / `C1-03b` | ⏳ **待真机看**（见「待 gaga 真机看」表同源的层级观感问题） |

> ⚠️ **修正（2026-10-26 复核 · E8/E9）**：原表里的待核项「`date-fns` zhCN locale 的精确文案 —— **PC 未装 date-fns**，按已知文案抄，需真机校准」**不成立，已删除**：PC `package.json:20` 有 `"date-fns": "^4.4.0"`，`src/components/chat/MessageBubble.tsx:39-40` 已在用 `formatDistanceToNow` + `zhCN`；且 **v3.6.0（web）与 v4.4.0（PC）的 `locale/zh-CN/_lib/formatDistance.js` 字符串与取整逻辑完全相同**（`Math.round`）⇒ 文案无需真机校准。
---

## 改动量最大的前 10 条（实现排期输入）
> ⚠️ **2026-10-27 订正**：这一节原本是**实现前的排期输入**（预估改动量 Top10）。本轮 C 域已全部实装 ⇒ 它**不再是待办**，改为**历史记录**保留。真实状态见各条目的「判定 / 怎么改」段与文末「本轮变更记录」。
>
> **当时的 Top10 与现在的落点**：
>
> | # | 编号 | 当时的预估 | 现在的状态 |
> |---|---|---|---|
> | 1 | **C3-07** | 370 行 | ✅ 已落地（`7b74547` + `78d6b8c`）· 新建 `src/lib/notifications.ts` 513 行 |
> | 2 | **C3-17** | 162 行 | ✅ 已落地（`7b74547`）· 与 C3-07 共用同一份 adapter 文件 |
> | 3 | **C4-04** | 120 行 | ✅ 已落地（`78d6b8c`）· `EventSource` → `fetch` + Bearer 头 |
> | 4 | **C2-48** | 80 行 | ✅ 已落地（`7b74547`）· `Toast.tsx` 整段重写 |
> | 5 | **C4-08** | 80 行 | ❌ **未落地** · 归 `S-11` 待 gaga 拍 |
> | 6 | **C4-11** | 60 行 | ✅ 已落地（`78d6b8c`）· `n.on('click')` + 落点分流 |
> | 7 | **C3-05** | 40 行 | ✅ 已落地（`7b74547`）· 通知页顶部常驻「桌面通知」卡 |
> | 8 | **C2-11** | 35 行 | ✅ 已落地（`7b74547`）· 多张独立卡（`S-2` 方案 b） |
> | 9 | **C2-29** | 35 行 | ✅ 已落地（`7b74547`）· 新建 `src/components/ui/Avatar.tsx` |
> | 10 | **C3-03** | 33 行 | ✅ 已落地（`7b74547`）· 新建 `src/components/ui/Badge.tsx` |
>
> **当时的「第 11 位起」候选**（当时的预估行）→ 现在的状态见下方「其余 Top 候选」表。
>
> ⚠️ **去重（E7）**：`src/lib/notifications.ts` 是**同一份新文件** —— C2-05 / C2-26 / C3-13 / C3-17 / C3-07 各算了一次，合计 519 行；**实际只有一份 513 行的文件** ⇒ 排期总量**只算 513 行**（比逐条相加少 ~6 行）。E7 当时估的是「只算 330 行、排期少算 ~189 行」⇒ 落地时 adapter 实际写到 **513 行**（比预估大 ~180 行）。

### 其余 Top 候选（第 11 位起 · 按改动量降序）
> ⚠️ **2026-10-27 订正**：这一节原本是**实现前的排期输入**。本轮 C 域已全部实装 ⇒ 它**不再是待办**，改为**历史记录**保留。

| 编号 | 当时的预估 | 现在的状态 |
|---|---|---|
| C2-37 | 28 行 | ✅ 已落地（`7b74547`）· 新建 `src/components/ui/Textarea.tsx` |
| C3-06 | 25 行 | ✅ 已落地（`7b74547`）· 通知页「待开发」占位 Banner |
| C2-20 | 25 行 | ✅ 已落地（`7b74547`）· `ConfirmDialog` 整段重排对齐 web AlertDialog |
| C4-09 | 25 行 | ✅ 已落地（`78d6b8c`）· 主进程 `gacode:is-focused` 焦点桥 |
| C2-40 | 20 行 | ✅ 已落地（`7b74547`）· `Button` variant / size 全量重排 |
| C2-41 | 18 行 | ✅ 已落地（`7b74547`）· 头像本地预览 |
| C2-44 | 10 行 | ⚠️ **部分落地**（保存时上传 1 次）· 归 `S-5` 待 gaga 拍 |

---

## 十一、独立复核修正（2026-10-26 verifier）

> **一句话结论**：**观察层 12/12 核心结论全部成立、行号命中率极高；统计/结构层有 5 处真错误（E1~E5），其中 E1 掩盖了一个现网 400 bug、E2 会导致行为倒退。修完 E1~E5 可作实现依据。**

### E1 · F-6 引了错误的 profile 路由文件，且掩盖了一个现网 400 bug（严重）

- **文档原话**：F-6（L471-477）整表引 `unified-api/src/modules/yinian/profile.routes.js`（注册前缀 `/api/v1/auth`），并写 `displayName` maxLength **64** / `bio` maxLength **500**；C2-31（L1966）「服务端允许 64」、C2-33（L2033）「服务端允许 500」、C2-32（L1998）引 `profile.routes.js:62`
- **源码真相**：两端实际调的是 `unified-api/src/modules/gacode/gacode.profile.routes.js` —— web `gacode-web/src/lib/api.ts:264`、PC `gacode-electron/src/lib/api.ts:1164` 都是 `PUT /gacode/profile`；该文件 `:85-134` 是 `PUT /profile`：`:91` `displayName: { type: ['string','null'], maxLength: 50 }`、`:93` `bio: { type: ['string','null'], maxLength: 200 }`、`:107` `if (displayName !== undefined) data.displayName = displayName;`。**`modules/yinian/profile.routes.js` 里的 64/500 属于 `/api/v1/auth/profile` —— web 全仓 grep `/auth/profile` = 0 命中，没人在调那条路由**
- **应该怎么改**：F-6 整表换成 `gacode/gacode.profile.routes.js:85-134`，上限改为 **displayName 50 / bio 200**；C2-31 / C2-33 的服务端事实同步改；C2-32 的引用改成 `gacode/gacode.profile.routes.js:107`。⚠️ **2026-10-27 订正**：这一步**已于 `7b74547` 落地**（PC 常量改成 30 / 200）⇒ 原稿要求「新增一条现网 bug 条目」的诉求**已过时** —— 该 bug 当时真实存在，但**代码侧已修**，详见下方「已修复的历史 bug」条目。

### E2 · C2-22 的「怎么改」与 gaga 拍板相反（严重）

- **文档原话**：C2-22（L1395-1403）的「PC 最终写法（1:1 还原 web）」写 `return request("/yinian/account", { method: "DELETE" });`；L1407 写「⚠️ 这条是双向风险，**必须 gaga 拍板** → 见 `S-3`」
- **源码真相**：PC `gacode-electron/src/lib/api.ts:1311-1322` 的 `deleteAccount()` **已经是 `/auth/account`**（真删账号，`unified-api/src/modules/auth/auth.routes.js:189-193` → `authService.deleteAccount()`）。照文档把 PC 改成 `/yinian/account` = **行为倒退**（不再删账号）。gaga 2026-10-26 已拍板：**以 PC 为准，两端统一 `/auth/account`**
- **应该怎么改**：**PC 端 `deleteAccount()` 不动**；要改的是 **web 端** `gacode-web/src/lib/api.ts:1363-1364` 改调 `/auth/account` + 同步修 UI 文案「你的所有数据已永久删除」—— **web 端属别的端 → 标注「交总 PM」**；L1407 改为「**已拍板（gaga 2026-10-26）：以 PC 为准，两端统一 /auth/account**」

### E3 · 全量统计的判定分布与正文逐条对不上（严重）

- **文档原话**：「全量统计」L4923-4926 写 缺失 **23** / 形态不同 **73** / 已一致 **6**
- **源码真相**：正文逐条实测 = **缺失 20 / 形态不同 76 / 已一致 5**（**差异**合计 101）
  - ⚠️ **2026-10-26 再订正**：`C4-16` 标为**口径作废**（PC close = 隐藏到托盘 ⇒ SSE 不断，与 web 行为等价）⇒ 它的 `- **差异判定**：` 行已删除 ⇒ 形态不同 77 → **76**、差异合计 102 → **101**（**条目**总数仍是 102：14 + 48 + 24 + 16，C4-16 条目仍在，只是不再是一个「差异」）
- **应该怎么改**：改成实测值，并注明**统计口径**：`- **差异判定**：` 前缀行共 **101** 行，按每行**首个关键词**分类；`C2-37` 是「**缺失 + 形态不同**」混合项，按「缺失」计

### E4 · 组 2 总计自相矛盾（三处互斥，严重）

- **文档原话**：L2857-2858 写「条目数 **68**（2a: 26 / 2b: 20 / 2c: 1 + 组级前置 5 条）」+「缺失 8 / 形态不同 57 / 已一致 3」；同文档 L4933 的分组表写组 2 = **48**
- **源码真相**：26 + 20 + 1 + 5 = **52 ≠ 68**；2b 实为 **21** 条（C2-27 ~ C2-47）；逐条实测组 2 = **48 条 / 缺失 6 / 形态不同 39 / 已一致 3**（2a 26 + 2b 21 + 2c 1；组级前置事实 F-5~F-9 不计入差异条目）
- **应该怎么改**：三处统一成 **48 / 6 / 39 / 3**，2b 改成 21 条，并写清「组级前置 5 条不计入」

### E5 · S-1 / S-2 是悬空引用（严重）

- **文档原话**：L399 / L436 / L457 三处写「见文末 `S-1`」，L914 写「结构级 → `S-2`」；但「结构级差异 · 需 gaga 拍」（L4778）从 **S-3** 开始，**S-1 / S-2 章节在全文里不存在**
- **源码真相**：S-3 ~ S-12 **无重复无双占**（这点比 B 文档干净，保留）；S-1/S-2 只是**没写**，不是被覆盖
- **应该怎么改**：从正文引用的语境（**C1-13 的「入口归属」**、**C2-11 的「Profile 信息卡结构」**）把 **S-1 / S-2 补写成正式条目**（每条给：议题 / web 现状 / PC 现状 / 选项 / 影响面 / 建议）；**S-3 ~ S-12 编号保持不动**；补完后核 S-1 ~ S-12 连续无缺

### E6 · 「改动量最大的前 10 条」既没排序也选错（中）

- **文档原话**：Top10 表顺序为 370 / 80 / 60 / 35 / 40 / 120 / 20 / 33 / 28 / 80 —— **非降序**；且漏了第 2 大的 **C3-17(162)** 和第 8 大的 **C2-11(35)**，却收了 C2-40(20)、C2-37(28)
- **源码真相**：逐条预估的真正 Top10 = **370(C3-07) / 162(C3-17) / 120(C4-04) / 80(C2-48) / 80(C4-08) / 60(C4-11) / 40(C3-05) / 35(C2-11) / 35(C2-29) / 33(C3-03)**
- **应该怎么改**：按上面重排 + 补齐；「第 11~16 位」那栏跟着重排（原 C2-11 升入 Top10，位置让给 C2-37 / C2-40）

### E7 · 同一个新文件被重复计入 5 个条目，排期虚高约 189 行（中）

- **文档原话**：`src/lib/notifications.ts` 在 C2-05(9 行) / C2-26(12 行) / C3-07(330 行) / C3-13(18 行) / C3-17(~150 行) 各算一次 = **519 行**
- **源码真相**：这 5 个条目**依赖的是同一份 ~330 行的新文件**（`normalizeNotification` / `notificationKind` / `notificationPresentation` / `notificationSummary` / `notificationTarget` / `parseYinianDeepLink` / `isSafeExternalUrl` / `openExternalNotificationUrl` / `NOTIFICATION_GROUP_ORDER`）
- **应该怎么改**：合计里**只算一次（330 行）**，并加一句说明「C2-05 / C2-26 / C3-13 / C3-17 都依赖这同一份文件，合计只算 330」⇒ 排期总量少算 ~189 行

### E8 · 待核项「PC 未装 date-fns」不成立（中）

- **文档原话**：待核项表 L4956 写「`date-fns` `zhCN` locale 的精确文案 —— **PC 未装 date-fns**，按已知文案抄，需真机校准」
- **源码真相**：PC `gacode-electron/package.json:20` 有 `"date-fns": "^4.4.0"`；`gacode-electron/src/components/chat/MessageBubble.tsx:31-32` 已在用 `formatDistanceToNow` + `zhCN`（`import { formatDistanceToNow } from "date-fns"; import { zhCN } from "date-fns/locale";`）
- **应该怎么改**：**删掉这条待核项**

### E9 · C3-13 说反了 date-fns 的版本归属（中）

- **文档原话**：C3-13（L3596）写「→ `date-fns` **v4** 的 `zhCN` locale」
- **源码真相**：**web 是 `date-fns@^3.6.0`**（`gacode-web/package.json:17`），**PC 才是 `^4.4.0`**。且 **v3.6.0 与 v4.4.0 的 `locale/zh-CN/_lib/formatDistance.js` 字符串完全相同、核心 `formatDistance.js` 取整逻辑也完全相同（都是 `Math.round`）**
- **应该怎么改**：改成正确归属（web v3.6.0 / PC v4.4.0），并加一句「两版 zhCN 文案与取整逻辑完全相同 ⇒ **不需要真机校准**」，E8 的待核项一并删

### E10 · C3-07 的代码片段会照抄出「全部通知恒显未读」（中）

- **文档原话**：C3-07（L3320）片段用 `isRead={!!n.read}`（PC 现有 DTO 字段 `read`），而同一条目（L3330）又要求新增的 adapter 照抄 web 的 `normalizeNotification`；C3-09 的片段（L3411 / L3443）又用 `isRead` —— **两处互斥**
- **源码真相**：web 归一后的字段名是 **`isRead`** 不是 `read`（`gacode-web/src/lib/notifications.ts:75` 类型声明、`:100` `isRead: r.isRead === true`）；PC 现在是 `gacode-electron/src/lib/api.ts:343` `read?: boolean` + `:650` `read: n.isRead`
- **应该怎么改**：统一为「**adapter 落地后 `NotificationItem` 统一用 `isRead`**」，`src/lib/api.ts:650` 的 `read: n.isRead` 映射**一并改掉**（`:343` 的 `read?: boolean` → `isRead?: boolean`，读 `n.read` 的调用点同步改）—— 写成**明确的连带改动项**，否则 `!!n.read` 恒为 `false` = 全部通知恒显未读

### E11 · C4-10 把「您有一条新消息」的归属标错（中）

- **文档原话**：C4-10（L4523）写「web 会显示『您有一条新消息』（**站内通知场景**）或『日程到点了』（通知中心摘要，C3-15）」
- **源码真相**：① 「您有一条新消息」在 `gacode-web/src/lib/webNotifications.ts:151` 的 **`showChatNotification`**（**聊天 AI 回复到达**场景）；② **站内通知**路径（`gacode-web/src/components/WebNotificationWatcher.tsx:117-120`）传 `body: notificationSummary(n)`，兜底是「日程到点了 / 定时任务已产出结果 / **你有一条新通知**」（`gacode-web/src/lib/notifications.ts:469-483`，永不返回空串）；③ 通用 `showSiteNotification`（`webNotifications.ts:196`）**没有** body 兜底
- **应该怎么改**：三处来源分清写明；**「PC 丢弃空 body 通知是缺陷」这个结论保留**，但把两处文案来源标对，并说明 PC 侧更贴 web 站内口径的是 `notificationSummary()` 的**按 type 兜底**

### E12 · F-3 表格行号错（轻）

- **文档原话**：F-3 的 PC 表（L45-47）把 `--card-hover` 标在 `:root L100` / `.light L137`，并把 `.dark` 的 `--card`（L166）写成 `.light`、还重复了一行 `.light L137 | --card-hover`
- **源码真相**：`gacode-electron/src/styles/globals.css` 里 `--card` 在 **`:100 / :137 / :166`**、`--card-foreground` 在 `:101 / :138 / :167`；`.light {` 起于 L119、`.dark {` 起于 L154；**全文没有 `--card-hover`**（`--bg-sunken` 在 `:63` / `:121` / `:157`）
- **应该怎么改**：按实测订正 PC 表（并去掉重复行）

### E13 · F-1 依赖枚举漏 date-fns（轻）

- **文档原话**：F-1（L16）的 PC 依赖枚举里没有 `date-fns`
- **源码真相**：PC `gacode-electron/package.json:20` 有 `"date-fns": "^4.4.0"`
- **应该怎么改**：枚举补上 `date-fns ^4.4.0`

### E14 · bg-card 爆炸半径要更新（轻）

- **文档原话**：F-3 写「`grep -rn "bg-card|card-hover" gacode-electron/src` → **0 命中**。改 token 的爆炸半径 = 0」
- **源码真相**：写文档时确实 0 命中（`git grep HEAD`），但**本轮 worker 改了 `src/routes/Library.tsx`**，工作树现有 **1 处** `bg-card`：`gacode-electron/src/routes/Library.tsx:516` 骨架屏 `<div className="h-20 w-full rounded-2xl bg-card animate-pulse" />`
- **应该怎么改**：改成「写文档时 0 引用；**本轮改动后 1 处**（`src/routes/Library.tsx` 骨架屏）⇒ **爆炸半径 0 → 1**，改 token 仍低风险」

### 复核通过不必改的部分

- **12 条核心结论全部成立**：服务端 `actionType` / `actionValue` 实际取值、`?category=` 被忽略、Prisma 无 `category` 列、无 `nextCursor`、SSE 桥不查 prefs、主进程无 click handler、空 body 被丢、前台也弹、注销只清 3 张表的 `purgeUserData` 本体、空值语义 `undefined` vs `null`、`bg-card` token 值、四个 web 组件的 className 与行号 —— **12/12 属实，行号命中率极高**
- **S- 编号无双占**：S-3 ~ S-12 各出现一次（比 B 文档干净）
- **102 条总数与分组自洽**：14（组 1）+ 48（组 2）+ 24（组 3）+ 16（组 4）= 102
- **编号无缺号无重号**：`C1-03b` 是合法子编号，不是重号
- **各组小结表与正文逐条判定 100% 对得上**（本次只修正了组 2 小结**表头统计**与全量统计的**分布数字**，未改动任何一条的判定）

### 本次新发现的现网 bug —— ⚠️ 2026-10-27 订正：**当时真实存在，但已修复**，不是现网 bug
- **PC `ProfileEdit.tsx` 的长度上限超出服务端 `/gacode/profile` 的 schema 上限 ⇒ 400 保存失败**
  - 当时：`const DISPLAY_NAME_MAX = 64;` > 服务端 `gacode/gacode.profile.routes.js:91` 的 **50**
  - 当时：`const BIO_MAX = 500;` > 服务端 `gacode/gacode.profile.routes.js:93` 的 **200**
  - ⇒ 当时用户输入 **51~64 字昵称 / 201~500 字简介**时，前端软校验放行、服务端 schema 拒收 → **PUT /gacode/profile 返回 400，保存失败**
  - **✅ 已修复**（commit `7b74547`）：两个常量改成 **30 / 200**（前端 `maxLength` 引用同一常量，自动同步）⇒ 前端上限 ≤ 服务端上限 ⇒ 该 400 已消失。当前值见 C2-31 / C2-33。

---

## 十二、本轮变更记录（2026-10-27 · C 域回写）

> 本轮**只改这一个文件**（`docs/align-c-profile-notify.md`），**不动任何 `src/**`**。
> **核实方法**：逐条把台账的 PC 侧锚点指向**当前工作树**（PC 仓 HEAD = `7c22841`）逐行读源码核对；web 侧基准读 `gacode-web`（HEAD `01d9584`）；服务端事实读 `unified-api`（HEAD `5611203`）。
> **锚点对应的工作树时刻**：2026-10-27 09:30（本地）—— 之后 `src/**` 若再改动，锚点需重锚。

### 12.1 落地批次 commit

| commit | 覆盖条目 | 说明 |
|---|---|---|
| `7b74547` | C 域 80 条 | C 域主收口批（组 1 / 组 2 / 组 3 / 组 4 主体） |
| `78d6b8c` | 组 1 / 组 4 尾巴 | 补 `--card-hover` + Cody 头像资产 + 删死文件（`CategoryTabs.tsx` / `InfiniteScrollList.tsx`）+ SSE 改 `fetch` + `Last-Event-ID` 续传 + 主进程 `gacode:is-focused` 焦点桥 |
| `ba2701b` | C2-42 | 注销 / 2MB 二次收口 |
| `f57f2ec` | C1-05 等 | 图标形状对齐 lucide v0.407.0 |
| `00b2b5a` | C2-18 / C2-19 / C2-23 / C2-38 / C2-45 / C3-04 | 图标收编 + Toast `title` 兼容层 |
| `a8b9301` | —— | 上一轮台账回写（本轮统计基线） |
| `a7fc845` | C2-17 等 | **并发 worker 的 commit**：剩余内联 SVG 收编进共享 `Glyphs.tsx` —— 只影响锚点位置，**不改变任何判定** |
| `b84f872`（**web 仓**） | C2-22 | 2026-10-26 已把 web 的 `deleteAccount()` 统一到 `/auth/account` ⇒ 两端口径一致 |

### 12.2 统计表改前 → 改后

| 判定 | 改前（M11 批 `a8b9301`） | 改后（本轮） | 变化 |
|---|---|---|---|
| 缺失 | 20 | **1** | −19 |
| 形态不同 | 76 | **2** | −74 |
| 已一致 | 5 | **94** | +89 |
| **差异合计** | **101** | **97** | **−4** |
| 本轮不做 | 0 | **4** | +4 |
| 口径作废 | 1 | **1** | — |
| 条目总数 | 102 | **102** | — |

> −4 的 4 条 = `C4-02` / `C4-05` / `C4-07` / `C4-12`（删除其 `- **差异判定**：` 行，明细见上方「本轮不做」表）。
> `C4-16` 的 `- **差异判定**：` 行在**上一轮（2026-10-26 订正）**就已删除（口径作废），**不计入**本轮 −4。
> 复核提示：`E14` 记的「`bg-card` 爆炸半径 0 → 1（`Library.tsx:516`）」是 2026-10-26 的快照；本轮实测已是 **25 处 / 22 行 / 8 个文件**，以 F-3 与本节为准。

### 12.3 仍然待办

| 编号 | 状态 | 归属 |
|---|---|---|
| `C4-08` | **缺失** —— AI 回复到达通知 PC 没有 | 归 `S-11` 待 gaga 拍（本轮不派工） |
| `C2-36` | 形态不同（**视觉无差**）—— 残留 1 个 `duration-150` | 本轮不做（PC 全局禁动效 ⇒ 零视觉差） |
| `C2-44` | 形态不同（数据通路）—— 「本地 store 立即更新」那一半没做 | 归 `S-5` 待 gaga 拍 |
| `C2-24` | 已一致，但**版本号字面量过期**：`src/routes/Profile.tsx:318` 写死 `v0.7.8`，`package.json:3` 现为 `0.7.11` | 残留 · 不影响判定 |
| `C2-21` | 已一致，但与 web 仍差 **1 个空格**（web JSX 换行折叠出来的） | 残留 · 不影响判定 |
| `S-5` / `S-11` / `S-12` | 仍待 gaga 拍 | 见「S-1 ~ S-12 状态回写」表 |

### 12.4 本轮**明确没做**的事（边界）

- **没有**改任何 `src/**` / `electron/**` / `tailwind.config.ts` —— 本轮只回写台账。
- **没有**动 `gacode-web` / `unified-api` / `yinian-android` 的任何文件（C2-22 的 web 端口径统一是 **web 仓 `b84f872`（2026-10-26）已落**的改动，本轮只是把台账口径对齐过去）。
- **没有**改 `S-1 ~ S-12` 的条目本体（议题 / 选项 / 影响面 / 建议全部保留），只加了一张状态回写表。
- **没有**删正文里的「PC 端旧代码引用块」—— 那是**实现前的快照**，保留作历史对照；本轮只把**新写的锚点**对齐到当前工作树。
- **没有**跑 `pnpm build` / `pnpm build:win`，没有做 typecheck —— 本轮是纯文档回写。
