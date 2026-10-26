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

### F-2 · PC 端没有 `lucide-react`，也没有 `src/components/ui/card.tsx`

- 证据：`gacode-electron/src/components/ui/` 只有 `BottomSheet.tsx / Button.tsx / ConfirmDialog.tsx / DropdownMenu.tsx / Input.tsx / LongPressMenu.tsx / Tabs.tsx / Toast.tsx`
- web 端：`gacode-web/src/components/ui/card.tsx` 有 `Card / CardHeader / CardTitle / CardDescription / CardContent / CardFooter` 六个导出
- **影响**：web 端所有 `<Construction />` `<Bell />` `<ChevronRight />` `<Copy />` `<Check />` `<Trash2 />` `<Package />` 等 lucide 图标，PC 端**没有等价库**。
- **PC 端既有做法**（照抄这个模式，不要引新依赖）：`gacode-electron/src/routes/ProfileApps.tsx:77-96` 已经在文件底部手写 `LockIcon()` / `ConstructionIcon()` 纯 SVG（`width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"`）。
- **决策点已排除**：本清单按「手写内联 SVG」给实现，不写「需新增依赖 lucide-react」——PC 现有代码全是手写 SVG，另起依赖属于扩范围。

### F-3 · PC 端 `bg-card` token 跟 web 端**数值不同**，且 PC 缺 `card-hover`

- web 端（`gacode-web/src/styles/globals.css`）：

  | 位置 | 变量 | 值 |
  |---|---|---|
  | `:root` L96-97 | `--card` / `--card-hover` | `#141414` / `#1e1e1e` |
  | `:root` L138-139（shadcn 别名块里重复声明一次） | `--card` / `--card-hover` | `#141414` / `#1e1e1e` |
  | `.light`（L158 起）L176-177 | `--card` / `--card-hover` | `var(--bg-sunken)`=#ffffff / `#f0f0f0` |
  | `.dark`（L194 起）L206-207 | `--card` / `--card-hover` | `#141414` / `#1e1e1e` |
  | `tailwind.config.ts:87-88` | `colors.card` / `colors.card-hover` | `#141414` / `#1e1e1e` |

- PC 端（`gacode-electron/src/styles/globals.css`）：

  | 位置 | 变量 | 值 |
  |---|---|---|
  | `:root` L100-101 | `--card` / `--card-foreground` | `var(--bg-sunken)` = `#0a0a0a` / `var(--fg)` |
  | `.light`（L119 起）L137-138 | `--card` / `--card-foreground` | `var(--bg-sunken)` = `#ffffff` / `var(--fg)` |
  | `.dark`（L154 起）L166-167 | `--card` / `--card-foreground` | `var(--bg-sunken)` = `#0a0a0a` / `var(--fg)` |
  | （整个文件，全文 0 处） | `--card-hover` | **不存在**（PC 没有这个变量，`--bg-sunken` 在 `:root` L63 / `.light` L121 / `.dark` L157） |
  | `tailwind.config.ts:79` | `colors.card` | `#0a0a0a` |
  | `tailwind.config.ts` | `colors.card-hover` | **不存在** |

  > ⚠️ **修正（2026-10-26 复核）**：原表把 `--card-hover` 标在 `:root L100` / `.light L137` 两个具体行号上，但 PC 的 `globals.css` **全文没有 `--card-hover` 声明**（`--card` 在 `:100 / :137 / :166`，`--card-foreground` 在 `:101 / :138 / :167`；`.light` 块从 L119 起、`.dark` 块从 L154 起）。原表还把 `.dark` 的 `--card`（L166）写成了 `.light`，并重复了一行 `.light L137 | --card-hover`。上表按实测订正。

- **影响**：任何要 1:1 还原 web `<Card>` 的 PC 组件，底色会差一档（web `#141414` vs PC `#0a0a0a`）。
- **好消息**：写这份清单时 `grep -rn "bg-card|card-hover" gacode-electron/src` → **0 命中**。改 token 的爆炸半径 = 0。
  - ⚠️ **修正（2026-10-26 复核）**：本轮改动后 PC 工作树**已有 1 处** `bg-card` —— `gacode-electron/src/routes/Library.tsx:516` 的骨架屏 `<div className="h-20 w-full rounded-2xl bg-card animate-pulse" />` ⇒ **爆炸半径 0 → 1**（改 token 仍属低风险，但不再等于 0；改完要顺带看这一处骨架屏的底色）。
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
- **差异判定**：**形态不同**
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileApps.tsx`
  - 插入锚点：`ProfileApps` 函数 return 的最外层 `<div className="min-h-full px-4 lg:px-8 py-6">`（L56）
  - PC 最终 className：`px-4 lg:px-8 py-6 max-w-2xl mx-auto`
  - 数值：`px-4`=16px；`lg:px-8`=32px（≥1024px 断点）；`py-6`=24px；`max-w-2xl`=672px；`mx-auto`=左右 margin auto 居中
  - 交互细节：纯静态容器，无交互、无动画、无状态
  - 预估改动：**1 行**
- **附带事实**：`min-h-full` 是 PC 独有（web 无此 class），按 gaga 指示 PC 增强不列入差异，**保留不动**。

---

### C1-02 · 内层宽度容器：web 没有这一层

- **web 端**：`gacode-web/src/app/(main)/profile/apps/page.tsx:23-24` — web 是**单层**容器，`Card` 直接挂在 `px-4 lg:px-8 py-6 max-w-2xl mx-auto` 里面，**没有** `max-w-md` 中间层。
- **PC 端**：`gacode-electron/src/routes/ProfileApps.tsx:57`
  ```tsx
  <div className="max-w-md mx-auto space-y-5">
  ```
- **差异判定**：**形态不同**
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileApps.tsx`
  - 插入锚点：`ProfileApps` 函数 return 的 `<div className="min-h-full px-4 lg:px-8 py-6">`（L56）与其子层 `<div className="max-w-md mx-auto space-y-5">`（L57）
  - PC 最终写法：**删掉这一层 div**，让卡片直接挂在 L56 的容器下（L56 改成 C1-01 的最终串）
  - 数值：`max-w-md`=28rem=448px → 删；`space-y-5`=20px 是给「h1 + 卡片」两子元素留的，h1 删掉后（C1-03）这个 `space-y-5` 也一并消失
  - 交互细节：无
  - 预估改动：**-2 行**（删 1 层 div + 1 个闭合标签）

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
- **差异判定**：**形态不同**（4 处视觉差异叠加）
  | 维度 | web | PC | 差 |
  |---|---|---|---|
  | 圆角 | `rounded-lg` = 20px | `rounded-md` = 16px | 4px |
  | 边框 | `border` = 1px `#363b41` | 无 | 少一圈描边 |
  | 底色 | `bg-card` = `#141414` | `bg-bg-elevated` = `#181818` | 亮 6 档 |
  | 阴影 | `shadow` = `0 1px 3px 0 rgb(0 0 0/0.5)` | 无 | 少投影 |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileApps.tsx`
  - 插入锚点：`ProfileApps` 函数 return 内的卡片根 `<div className="rounded-md bg-bg-elevated p-8 text-center">`（L59）
  - PC 最终 className：`rounded-lg border bg-card text-card-foreground shadow p-10 text-center text-fg-muted`（`p-10`/`text-center`/`text-fg-muted` 三项来自 C1-04 / C1-08 / C1-09，此处已是合并后的完整串）
  - **token 前置依赖**：PC 端 `bg-card` 当前解析为 `#0a0a0a`（不是 web 的 `#141414`），且 `card-hover` 不存在。要 1:1 还原必须同时改 token：
    - `D:\gaga\gaclaw-project\gacode-electron\tailwind.config.ts:79` → `card: "#141414",`（原文 `card: "#0a0a0a",`）
    - `D:\gaga\gaclaw-project\gacode-electron\tailwind.config.ts:80` 之后**新增一行** → `"card-hover": "#1e1e1e",`
    - `D:\gaga\gaclaw-project\gacode-electron\src\styles\globals.css:100` → `--card: #141414;`（原文 `--card: var(--bg-sunken);`）
    - `D:\gaga\gaclaw-project\gacode-electron\src\styles\globals.css:101` 之后**新增一行** → `--card-hover: #1e1e1e;`
    - `D:\gaga\gaclaw-project\gacode-electron\src\styles\globals.css:137`（`.light` 块）→ `--card: var(--bg-sunken);` 保持不变（web 浅色也是 `var(--bg-sunken)`，见 web `globals.css:176`）
    - `D:\gaga\gaclawlaw-project`... （更正：`D:\gaga\gaclaw-project\gacode-electron\src\styles\globals.css:137` 之后**新增一行**）→ `--card-hover: #f0f0f0;`（对齐 web `globals.css:177`）
    - `D:\gaga\gaclaw-project\gacode-electron\src\styles\globals.css:166`（`.dark` 块）→ `--card: #141414;`（原文 `--card: var(--bg-sunken);`）
    - `D:\gaga\gaclaw-project\gacode-electron\src\styles\globals.css:167` 之后**新增一行** → `--card-hover: #1e1e1e;`
    - **爆炸半径**：PC 端 `bg-card` / `card-hover` 当前 **0 处引用**（`grep` 已确认），改 token 不影响任何现有 PC 组件
  - 交互细节：无 hover/active（web `<Card>` 本身没有交互态）
  - 预估改动：**1 行 className + 7 行 token**（token 改动单独立项，见 `C1-03b`）

---

### C1-03b · 缺 `--card-hover` token（web 有，PC 完全没有）

- **web 端**：`gacode-web/src/styles/globals.css:97` → `--card-hover: #1e1e1e;`（`:root`）、`:177` → `--card-hover: #f0f0f0;`（`.light`）、`:207` → `--card-hover: #1e1e1e;`（`.dark`）；`gacode-web/tailwind.config.ts:88` → `"card-hover": "#1e1e1e",`
- **PC 端**：**PC 缺失**（`gacode-electron/src/styles/globals.css` 全文无 `card-hover`；`gacode-electron/tailwind.config.ts` 无 `card-hover` 键）
- **差异判定**：**缺失**
- **怎么改**：
  - 目标文件（2 个）：
    - `D:\gaga\gaclaw-project\gacode-electron\tailwind.config.ts` — 在 L80 `"card-foreground": "#e5e7eb",` 前**插入**一行 `"card-hover": "#1e1e1e",`
    - `D:\gaga\gaclaw-project\gacode-electron\src\styles\globals.css` — 在 L101 `--card-foreground: var(--fg);` 前**插入**一行 `--card-hover: #1e1e1e;`；`.light` 块（L137 附近）插 `--card-hover: #f0f0f0;`；`.dark` 块（L167 附近）插 `--card-hover: #1e1e1e;`
  - 用法：后续 PC 组件要复刻 web 的 `hover:bg-card-hover`（web `library/page.tsx:725`、`deliveries/page.tsx` 等 8+ 处）时直接可用
  - 交互细节：`hover:bg-card-hover` = 背景色 `#141414` → `#1e1e1e`，`transition-colors` 默认 150ms（两端 `transitionDuration` 一致，见 F-4）
  - 预估改动：**4 行**

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
- **差异判定**：**形态不同**
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileApps.tsx`
  - 插入锚点：`ProfileApps` 函数 return 内的卡片根（L59）
  - PC 最终 className（该 div 自身）：`p-10 text-center text-fg-muted`
  - 数值：`p-8`=32px → `p-10`=40px，四边各差 8px
  - ⚠️ **F-1 冲突提示**：PC 无 `twMerge`。如果 PC 采用「卡片根 div 承担全部 className」的写法，**只需写 `p-10` 一处**，不要同时出现 `p-6 pt-0`；若保留 web 的两层结构（卡片根 + 内容根），则内容根必须写 `!p-10` 强制覆盖 `p-6 pt-0`
  - 交互细节：无
  - 预估改动：**1 行**

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
- **差异判定**：**形态不同**（3 处：有无底圆、底色、图形本身）
  | 维度 | web | PC |
  |---|---|---|
  | 容器 | 无（图标直接是 svg） | `rounded-full` 圆形底 |
  | 底色 | 无 | `bg-bg-sunken` = `#0a0a0a` |
  | 图形 | lucide Construction（吊臂+斜纹挡板） | 手写「4 竖线矩形挡板」 |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileApps.tsx`
  - 插入锚点：`ProfileApps` 函数 return 内的 `<div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-sunken ...">`（L60）与其子 `<ConstructionIcon />`（L61）
  - PC 最终写法：**去掉外层圆形底 div**，让 SVG 直接当图标：
    ```tsx
    <ConstructionIcon className="w-12 h-12 mx-auto text-fg-muted mb-4" />
    ```
  - `ConstructionIcon` 改造成接受 className 的 props 骨架（PC 无 `cn`，直接字符串拼）：
    ```tsx
    function ConstructionIcon({ className = "" }: { className?: string }) {
      return (
        <svg
          width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          className={["w-12", "h-12", "mx-auto", "text-fg-muted", "mb-4", className].filter(Boolean).join(" ")}
        >
          <path d="M2 20h20" />
          <path d="M4 20V9l6 4V9l6 4V9l4 2v9" />
          <path d="M12 2v4" />
          <path d="M12 6h5" />
        </svg>
      );
    }
    ```
    （上面 path 抄 lucide `Construction` 的实际 path：`M2 20h20` / `M4 20V9l6 4V9l6 4V9l4 2v9` / `M12 2v4` / `M12 6h5`）
  - 数值：`w-12 h-12`=48px；`mx-auto`=水平居中；`text-fg-muted`=图标描边色 `#9ca3af`；`mb-4`=16px
  - 交互细节：无（静态图标，无 hover/active）
  - 预估改动：**10 行**（改 `ConstructionIcon` 函数体 + 替换调用点）

---

### C1-06 · 图标下间距：`mb-4` vs `mb-3`

- **web 端**：`gacode-web/src/app/(main)/profile/apps/page.tsx:26` → `mb-4`
- **PC 端**：`gacode-electron/src/routes/ProfileApps.tsx:60` → `mb-3`
- **差异判定**：**形态不同**
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileApps.tsx`
  - 插入锚点：`ConstructionIcon` 调用点（随 C1-05 一起改）
  - PC 最终 className：`w-12 h-12 mx-auto text-fg-muted mb-4`
  - 数值：`mb-3`=12px → `mb-4`=16px，图标与标题间距差 4px
  - 交互细节：无
  - 预估改动：**0 行**（并入 C1-05）

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
- **差异判定**：**形态不同**（标签语义 `<div>` vs `<p>`；颜色靠继承 vs 显式）
- **事实核对**：PC 端 `body { color: var(--fg) }`（`gacode-electron/src/styles/globals.css:191-193`），web 端 `body { color: var(--fg) }`（`gacode-web/src/styles/globals.css` 同样设置）。→ **PC 的 `<p>` 实际渲染色 = `#e5e7eb` = web 的 `text-fg`，视觉一致**。
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileApps.tsx`
  - 插入锚点：`ProfileApps` 函数 return 内 `<p className="text-base font-medium mb-1">我的应用</p>`（L63）
  - PC 最终 className：`text-base font-medium mb-1 text-fg`
  - 数值：`text-base`=16px/24px 行高；`font-medium`=500；`mb-1`=4px
  - ⚠️ 标签：web 用 `<div>`，PC 用 `<p>`。`<p>` 在卡片里语义更准且视觉一致（`display:block` 两者相同），**差异只在 DOM 标签**，若要严格 1:1 DOM 改成 `<div>`；gaga 的「1:1 还原 web」指视觉+行为，标签无语义差异可保留 `<p>`，此处按 `<div>` 1:1 处理更保险
  - 交互细节：无
  - 预估改动：**1 行**

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
- **怎么改**：无需改（文案标点差异见 C1-09，标签差异见 C1-07）
- 预估改动：**0 行**

---

### C1-09 · 描述文案标点：全角逗号 vs 半角逗号

- **web 端**：`gacode-web/src/app/(main)/profile/apps/page.tsx:29` → `管理你创建的 gagaOS 应用 — 这个功能正在开发中，先用基础功能吧 🚧`（`开发中` 后是**全角** `，` U+FF0C）
- **PC 端**：`gacode-electron/src/routes/ProfileApps.tsx:65` → `管理你创建的 gagaOS 应用 — 这个功能正在开发中,先用基础功能吧 🚧`（`开发中` 后是**半角** `,` U+002C）
- **差异判定**：**形态不同**
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileApps.tsx`
  - 插入锚点：`ProfileApps` 函数 return 内 `<p className="text-sm text-fg-muted">`（L64-66）的文本节点
  - PC 最终文案：`管理你创建的 gagaOS 应用 — 这个功能正在开发中，先用基础功能吧 🚧`
  - 数值：`—` 两侧带空格（U+2014，两端一致，保留）；逗号改全角；结尾 `🚧` 保留
  - 交互细节：无
  - 预估改动：**1 行**

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
- **差异判定**：**形态不同**（PC 标题**重复出现两次**：AppShell header 一次 + 页面内 `<h1>` 一次；web 只出现一次）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileApps.tsx`
  - 插入锚点：`ProfileApps` 函数 return 内 `<div className="max-w-md mx-auto space-y-5">`（L57）内的 `<h1 className="text-xl font-medium">我的应用</h1>`（L58）
  - PC 最终写法：**删除该 `<h1>` 整行**（连同 C1-02 删掉的 `max-w-md mx-auto space-y-5` 包裹层一起删）
  - 数值：`text-xl`=20px/28px 行高；`font-medium`=500 —— 删掉后标题只由 AppShell header 渲染，尺寸由 AppShell 统一控制
  - 交互细节：无
  - 预估改动：**-1 行**

---

### C1-11 · 页面标题的复位机制：web 卸载时复位为「新对话」，PC 按 pathname 推导

- **web 端**：`gacode-web/src/app/(main)/profile/apps/page.tsx:19` → `return () => setHeaderTitle("新对话");`
- **PC 端**：`gacode-electron/src/components/layout/AppShell.tsx:36-51` `resolveTitle(pathname)`：命中 `/profile/apps` → `"我的应用"`；未命中任何分支 → `"Gacode"`（L50）
- **差异判定**：**已一致**（用户在两个页面之间切换时，两端 header 标题都会随路由变化；web 的「卸载复位」与 PC 的「按 pathname 重算」在导航场景下结果相同）
- **怎么改**：无需改
- 预估改动：**0 行**

---

### C1-12 · 非特权用户分支：web 本页不做 gating，PC 在页内 gate 且渲染另一张卡

- **web 端**：`gacode-web/src/app/(main)/profile/apps/page.tsx:14-34` —— **本页对所有用户渲染同一张占位卡**；特殊用户 gating **只发生在入口**：`gacode-web/src/components/layout/Drawer.tsx:101` `const isSpecial = (profile?.id || user?.id) === SPECIAL_USER_ID;` + `:221-227` `{isSpecial && (<DrawerNavItem icon={Package} label="我的应用" onClick={() => handleNav("/profile/apps")} />)}`
- **PC 端**：`gacode-electron/src/routes/ProfileApps.tsx:20-26`（取 profile）+ `:28-53`（`if (!isPrivileged)` 分支渲染锁屏卡）
- **差异判定**：**形态不同** —— web 端「非 userId==6 的用户直接访问 `/profile/apps` 看到的是占位卡」，PC 端「同一 URL 看到的是另一张锁屏卡（带锁图标 + 返回按钮）」
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileApps.tsx`
  - 插入锚点：`ProfileApps` 函数内的 `if (!isPrivileged) { return ( ... ) }`（L28-53）整块
  - PC 最终写法：**删除 `if (!isPrivileged)` 整块 return（L28-53）**，让所有用户都渲染与 web 完全一致的占位卡
  - 连带：`getProfile` query（L20-23）与 `isPrivileged` 变量（L26）若删除后不再被引用，需一并删除，并移除 `import { useQuery } from "@tanstack/react-query"` 与 `import { getProfile } from "../lib/api"` 两个 import（若确认无其他引用）
  - ⚠️ **这条与入口位置强耦合**：PC 的「我的应用」入口在 `Profile.tsx:196-197`（Profile 页内操作列表），web 的入口在 `Drawer.tsx:221-227`（侧边抽屉）。删掉 PC 页内 gate 后，非特权用户仍能通过 Profile 页入口进入 —— web 端同样存在这个「入口不在本页」的问题，但 web 的入口本身有 `isSpecial` 门禁。**入口归属属于结构级差异，见文末 `S-1`。**
  - 交互细节：无
  - 预估改动：**-26 行**

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
- **差异判定**：**形态不同**（入口所在容器不同：web = 全局侧边抽屉的「主体上半 菜单项」卡；PC = Profile 页内的操作列表）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\layout\AppShell.tsx`（侧边栏）
  - 插入锚点：`AppShell` 组件内 `NAV_ITEMS` 数组（`AppShell.tsx:73` 起）之后
  - PC 最终写法：往 `NAV_ITEMS` 增加一项
    ```tsx
    {
      label: "我的应用",
      to: "/profile/apps",
      match: (p) => p === "/profile/apps",
    },
    ```
    + 在渲染 `NAV_ITEMS.map(...)` 的位置**加一个 `isSpecial` 门禁**（`const isSpecial = (profile?.id || user?.id) === SPECIAL_USER_ID;`），需要 AppShell 能拿到 `profile` —— PC 的 `AppShell.tsx:26` 已 import `listNotifications`，可追加 `getProfile`
  - 图标：web 用 lucide `Package`；PC 无 lucide（F-2），需在 `AppShell.tsx` 内手写 `PackageIcon` SVG（`stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"`，尺寸对齐 AppShell 现有 nav item 图标尺寸）
  - 数值：`nav` 卡 `rounded-md bg-bg-elevated m-3 mb-0 p-2 space-y-1`（web `Drawer.tsx:205`）—— PC 侧边栏是 `w-64`（`AppShell.tsx:28` `SIDEBAR_WIDTH = "w-64"`），非同一结构，**容器样式不照抄 web Drawer**（PC 侧边栏是常驻栏，非抽屉）
  - 交互细节：点击 → `navigate("/profile/apps")`；web 用 `handleNav("/profile/apps")`（Drawer 额外做了关闭抽屉，PC 侧边栏常驻无需）
  - 预估改动：**15 行**
- **⚠️ 本条同时是结构级差异** → 详见文末 `S-1`

---

## 组 1 小结

| 编号 | 判定 | 预估改动 |
|---|---|---|
| C1-01 | 形态不同 | 1 行 |
| C1-02 | 形态不同 | -2 行 |
| C1-03 | 形态不同 | 1 行 className + token 前置 |
| C1-03b | 缺失 | 4 行 |
| C1-04 | 形态不同 | 1 行 |
| C1-05 | 形态不同 | 10 行 |
| C1-06 | 形态不同 | 并入 C1-05 |
| C1-07 | 形态不同 | 1 行 |
| C1-08 | 已一致 | 0 行 |
| C1-09 | 形态不同 | 1 行 |
| C1-10 | 形态不同 | -1 行 |
| C1-11 | 已一致 | 0 行 |
| C1-12 | 形态不同 | -26 行 |
| C1-13 | 形态不同 | 15 行（结构级 → S-1） |

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
- **差异判定**：**形态不同**（间距模型：逐块 margin vs 统一 space-y）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Profile.tsx`
  - 插入锚点：`Profile` 函数 return 的最外层 `<div className="min-h-full px-4 lg:px-8 py-6">`（L114）与其子 `<div className="max-w-2xl mx-auto space-y-6">`（L115）
  - PC 最终写法：删掉内层 div，**只保留一层**，并把 web 的 margin 逐块落到各块上：
    ```tsx
    <div className="px-4 lg:px-8 py-6 max-w-2xl mx-auto">
    ```
    - 顶部操作区 → `className="flex items-center justify-between mb-4"`（改自 L117）
    - 头像区 → `className="flex flex-col items-center mb-8"`（改自 L128）
    - 信息卡列表 → `className="space-y-2"`（改自 L171，见 C2-11）
    - 注销区 → `className="mt-6"`（L257）
    - 页脚 → `className="mt-8 text-center text-xs text-fg-muted opacity-50"`（新增，见 C2-24）
  - 数值：`px-4`=16px；`lg:px-8`=32px；`py-6`=24px；`max-w-2xl`=672px；`mb-4`=16px；`mb-8`=32px；`space-y-2`=8px；`mt-6`=24px；`mt-8`=32px
  - 交互细节：纯布局，无交互
  - 预估改动：**6 行**（删 2 行 + 改 4 个 className）
  - ⚠️ `min-h-full` 是 PC 独有（web 无）——按 gaga 指示 PC 增强不列，此处**保留**。

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
- **差异判定**：**形态不同**
  | 维度 | web | PC |
  |---|---|---|
  | 主轴对齐 | `justify-between`（左铃铛 / 右编辑） | `justify-end`（都靠右） |
  | 间距 | `mb-4`=16px | 无（靠父级 `space-y-6`=24px） |
  | gap | 无 | `gap-2`=8px |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Profile.tsx`
  - 插入锚点：`Profile` 函数 return 内的 `/* 顶部操作区 */` 注释块（L116-117）
  - PC 最终 className：`flex items-center justify-between mb-4`
  - 数值：`justify-between`=两端对齐；`mb-4`=16px
  - 交互细节：无
  - 预估改动：**1 行**（与 C2-01 合并改）

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
- **差异判定**：**缺失**（PC 页面内无此入口；PC 有等效入口但在侧栏，位置不同）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Profile.tsx`
  - 插入锚点：`Profile` 函数 return 内的顶部操作区 `<div className="flex items-center justify-end gap-2">`（L117）——在「编辑」按钮**之前**插入
  - PC 最终写法：
    ```tsx
    <button
      type="button"
      onClick={() => navigate("/notifications")}
      aria-label="通知中心"
      className="relative w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center"
    >
      <BellIcon />
      {unreadCount > 0 && (
        <span className="absolute top-1.5 right-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold bg-brand text-brand-on">
          {formatUnreadBadge(unreadCount)}
        </span>
      )}
    </button>
    ```
  - 需要新增的 state / 骨架：
    ```tsx
    /** 未读通知数 — 跟 AppShell 侧栏铃铛共用同一条 queryKey, React Query 直接复用请求 */
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
    - `NOTIFICATION_POLL_MS` 需要在 PC 侧新增常量（见 `C2-26`）
    - `formatUnreadBadge` 需要在 PC 侧新增函数（见 `C2-05`）
  - `BellIcon`：PC 无 lucide（F-2），需在 `Profile.tsx` 底部手写（可复用 `AppShell.tsx` 里的 `BellIcon`，建议把它提到 `src/components/icons/Bell.tsx` 共享）
  - 数值：`w-9 h-9`=36px；`Bell` 图标 `w-5 h-5`=20px；角标 `min-w-[16px] h-4 px-1`=16px高、`text-[10px]`=10px、`top-1.5 right-1.5`=6px 偏移
  - 交互细节：hover 只变背景色（`hover:bg-bg-sunken`），**不变文字色**；`transition-colors duration-150`=150ms；点击 → `navigate("/notifications")`；角标 `unreadCount > 0` 才渲染
  - 预估改动：**20 行**（含 Icon + query + import）

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
- **差异判定**：**形态不同**
  | 维度 | web | PC |
  |---|---|---|
  | 尺寸 | `w-9 h-9`=36px | `w-8 h-8`=32px |
  | hover | 只有 `hover:bg-bg-sunken` | 多一个 `hover:text-fg`（文字由 muted 变主色） |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\layout\AppShell.tsx`
  - 插入锚点：`AppShell` 组件内 `aria-label="通知"` 的 `<button ... className="relative w-8 h-8 ...">`（L190-194）
  - PC 最终 className：`relative w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center`
  - 数值：`w-9 h-9`=36px（`w-8 h-8`=32px）；hover 背景 `#0a0a0a`；无文字色变化
  - 交互细节：hover 150ms 过渡；无 active 态（web 也没有）
  - 预估改动：**1 行**

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
- **差异判定**：**缺失**（PC 无共享函数；且内联版少了 `Math.max(0, Math.floor(count))` 的负数/小数兜底）
- **怎么改**：
  - 目标文件（新增）：`D:\gaga\gaclaw-project\gacode-electron\src\lib\notifications.ts`
  - 插入锚点：新文件（PC 目前**没有**这个文件 —— `src/lib/` 下只有 `api.ts / auth.ts / auth-refresh.ts / notifications-sse.ts` 等）
  - PC 最终代码：
    ```ts
    /**
     * 未读角标文案 — 99+ 封顶.
     * 对齐 gacode-web/src/lib/notifications.ts:495-498.
     */
    export function formatUnreadBadge(count: number): string {
      const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
      return n > 99 ? "99+" : String(n);
    }
    ```
  - 依赖：无（纯函数）
  - 交互细节：无
  - 预估改动：**9 行**（新文件）+ 调用点替换 2 处

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
- **差异判定**：**形态不同**（尺寸 72 vs 96 = 差 24px；圆角 `rounded-xl`=22px vs `rounded-full`=9999px —— **方形 vs 圆形**，视觉差别最大的单点之一）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Profile.tsx`
  - 插入锚点：`Profile` 函数 return 内 `<img src={avatarSrc} alt={displayName} className="w-24 h-24 rounded-full object-cover" />`（L133-137）
  - PC 最终 className：`w-[72px] h-[72px] rounded-xl object-cover`
  - 数值：`w-[72px] h-[72px]`=72px 方形；`rounded-xl`=22px（Cody squircle）；`object-cover`=填满裁切
  - 交互细节：无
  - 预估改动：**1 行**

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
- **差异判定**：**形态不同**
  | 维度 | web | PC |
  |---|---|---|
  | 缺省图 | 静态 Cody png（`/gacode/assets/cody/cody_192.png`） | 首字母 + `bg-brand/30` + `border-brand/40` |
  | 形状 | 继承外层 `rounded-xl` | `rounded-full` |
  | 边框 | 无 | `border border-brand/40` |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Profile.tsx`
  - 插入锚点：`Profile` 函数内的 `const avatarSrc = user?.avatar || "";`（L110）与 return 里的 avatar 三元（L130-145）
  - PC 最终写法（删掉首字母 fallback 分支，统一走 img）：
    ```tsx
    const avatarSrc = user?.avatar || `${API_BASE}/assets/cody/cody_192.png`;
    ...
    {isLoading ? (
      <div className="w-[72px] h-[72px] rounded-xl bg-bg-elevated animate-pulse" />
    ) : (
      <img
        src={avatarSrc}
        alt={displayName}
        width={72}
        height={72}
        className="w-[72px] h-[72px] rounded-xl object-cover"
      />
    )}
    ```
  - ⚠️ **资源路径待核**：web 用的是 `BASE_PATH`（= `"/gacode"`，见 `gacode-web/src/lib/nav.ts:18`）+ `/assets/cody/cody_192.png`，即**同源静态目录**。PC 是 Electron，renderer 走 `file://` 或 dev server，**没有 `/gacode` 前缀**。需要确认 PC 端有没有对应资产；没有则该 URL 会 404 → 图片裂。
    - 查证命令：`glob` 在 `gacode-electron` 下找 `**/cody_192.png` —— 本次执行结果：**未找到**（PC 仓无该资产）→ 记为「**待核 / PC 缺失资产**」
    - PC 等价实现建议：把 Cody 头像作为本地静态资源放到 `gacode-electron/src/assets/`（或 `public/`），用 `import codyAvatar from "../../assets/cody_192.png"` 引入（Vite 静态资源），fallback 写成 `codyAvatar`
  - 交互细节：无
  - 预估改动：**8 行**

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
- **差异判定**：**形态不同**（尺寸 + 圆角，同 C2-06）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Profile.tsx`
  - 插入锚点：L131
  - PC 最终 className：`w-[72px] h-[72px] rounded-xl bg-bg-elevated animate-pulse`
  - 数值：`animate-pulse` = Tailwind 默认 2s 循环淡入淡出（两端一致）
  - 交互细节：无
  - 预估改动：**1 行**

---

### C2-09 · 用户名标题 `<h1>`：已一致

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:229` → `<h1 className="text-2xl font-medium mt-3 text-center">{displayName}</h1>`
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:163` → `<h1 className="text-2xl font-medium mt-3 text-center">{displayName}</h1>`
- **差异判定**：**已一致**（逐字相同）
- **怎么改**：无需改
- 预估改动：**0 行**

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
- **差异判定**：**形态不同**
  | 维度 | web | PC |
  |---|---|---|
  | 前景色 token | `text-fg-muted` = `#9ca3af` | `text-fg-subtle` = `#6c757d` |
  | 透明度 | `opacity-70` | 无 |
  | 实际渲染色 | `#9ca3af` × 70% ≈ `#6d7280`（叠在 `#000` 上） | `#6c757d` |
  | 渲染条件 | `user?.email` truthy（空串不渲染） | `email !== "(未设置)"` |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Profile.tsx`
  - 插入锚点：`Profile` 函数 return 内的 `{email !== "(未设置)" ? (...) : null}`（L165-167）
  - PC 最终 className：`text-xs text-fg-muted mt-1 opacity-70`
  - 数值：`text-xs`=12px/16px 行高；`mt-1`=4px；`opacity-70`=70%
  - 交互细节：无
  - 预估改动：**1 行**

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
- **差异判定**：**形态不同**（结构级 → `S-2`）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Profile.tsx`
  - 插入锚点：`Profile` 函数 return 内的 `{/* 信息卡片 */}` 注释块（L170-180）
  - PC 最终写法：改成与 web 同构的**多卡**结构
    ```tsx
    <div className="space-y-2">
      <ProfileRow label="名字" value={displayName} />
      <ProfileRow label="UID" value={user?.id || "—"} rightSlot={<CopyUidButton uid={user?.id || ""} />} />
      <ProfileRow label="性别" value={genderText} />
      <ProfileRow label="简介" value={bioText} />
    </div>
    ```
  - 需要新增/改造的组件：
    ```tsx
    interface ProfileRowProps {
      label: string;
      value: string;
      onClick?: () => void;
      rightSlot?: React.ReactNode;
    }

    function ProfileRow({ label, value, onClick, rightSlot }: ProfileRowProps) {
      const interactive = typeof onClick === "function";
      const Wrapper: React.ElementType = interactive ? "button" : "div";
      return (
        <Wrapper
          type={interactive ? "button" : undefined}
          onClick={onClick}
          className={[
            "w-full rounded-md bg-bg-elevated p-4 flex justify-between items-center",
            "transition-colors duration-150",
            interactive ? "hover:bg-bg-base text-left" : "",
          ].filter(Boolean).join(" ")}
        >
          <span className="text-sm font-medium shrink-0">{label}</span>
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-sm text-fg-muted truncate max-w-[200px]">{value}</span>
            {rightSlot ?? (interactive ? <ChevronRightIcon /> : null)}
          </span>
        </Wrapper>
      );
    }
    ```
    - PC 无 `cn`（F-1）→ 用数组 `.filter(Boolean).join(" ")`；**不要**同时写两套互斥 class
    - `ChevronRightIcon` 已存在于 `Profile.tsx:552-558`（16px，`text-fg-muted` 写死在 svg 上）→ 与 web 的 `<ChevronRight className="w-4 h-4 text-fg-muted shrink-0" />` **已一致**
  - 数值：`rounded-md`=16px；`bg-bg-elevated`=`#181818`；`p-4`=16px；`space-y-2`=8px
  - 交互细节：`interactive` 为真时额外 `hover:bg-bg-base`（`#000`）+ `text-left`；非交互行无 hover
  - 预估改动：**35 行**（新增 `ProfileRow` 组件 + 替换 5 行调用 + 删 `InfoRow`/`UidRow` 的容器样式）

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
- **差异判定**：**形态不同**（视觉上 label 与 value 的主次颠倒）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Profile.tsx`
  - 插入锚点：`InfoRow` 函数（L425-447）与 `UidRow` 函数（L272-318）
  - PC 最终 className（label）：`text-sm font-medium shrink-0`
  - PC 最终 className（value）：`text-sm text-fg-muted truncate max-w-[200px]`
  - 数值：`text-sm`=14px/20px；`font-medium`=500；`shrink-0`=不压缩；`truncate`=单行省略号；`max-w-[200px]`=200px
  - ⚠️ PC 侧栏栏宽 256px，页面区可用宽度受 `max-w-2xl`=672px 限制 → `max-w-[200px]` 上限在本页不会截断 displayName，但 UID/简介超长会截断（与 web 一致）
  - 交互细节：无
  - 预估改动：**4 行**

---

### C2-13 · 值超长处理：`truncate max-w-[200px]` vs `break-all`

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:76` → `<span className="text-sm text-fg-muted truncate max-w-[200px]">{value}</span>`
  → **单行 + 省略号**，宽度封顶 200px
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:439` → `"flex-1 text-sm text-fg min-w-0 break-all"`
  → **不截断，撑满容器宽度 + 逐字断行**（`break-all` 会在任意字符处断开，中文/英文都硬断）
- **差异判定**：**形态不同**（长简介/长 UID 时 PC 会撑出 3~5 行，web 只有 1 行）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Profile.tsx`
  - 插入锚点：`InfoRow`（L437-441）/ `UidRow`（L305-307）
  - PC 最终 className（值）：`text-sm text-fg-muted truncate max-w-[200px]`
  - PC 最终 className（UID 值）：`text-sm text-fg-muted truncate max-w-[200px]`（见 C2-15，PC 现在还多一个 `font-mono`）
  - 数值：`truncate`=`overflow:hidden; text-overflow:ellipsis; white-space:nowrap`；`max-w-[200px]`=200px
  - ⚠️ 与 gaga「折叠 = 折行 + 可横滑 + 宽度封顶」规则的边界：那条规则针对**富文本表格/代码块**；本页是**单行元信息**，web 现状就是 `truncate`（宽度封顶 + 省略号），**按 web 现状抄**，不引入横滑
  - 交互细节：无
  - 预估改动：**2 行**

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
- **差异判定**：**缺失**
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Profile.tsx`
  - 插入锚点：信息卡容器内 `<UidRow uid={uid} />`（L172）**之前**
  - PC 最终写法：`<ProfileRow label="名字" value={displayName} />`
  - 数值：无（结构复用 C2-11 的 `ProfileRow`）
  - 交互细节：无
  - 预估改动：**1 行**
  - 注：PC 的「邮箱」「注册时间」两行是 PC 独有 → 按 gaga 指示不列

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
- **差异判定**：**形态不同**（3 处：颜色、字族、截断方式；+ 1 处占位符字符）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Profile.tsx`
  - 插入锚点：`UidRow` 函数内 `<span className="flex-1 text-sm text-fg font-mono min-w-0 break-all">`（L305）与 `const uid = user?.id || "-";`（L111）
  - PC 最终 className（值）：`text-sm text-fg-muted truncate max-w-[200px]`
  - PC 最终兜底：`const uid = user?.id || "—";`
  - 数值：`font-mono` = JetBrains Mono（PC `tailwind.config.ts:122-129`）；web 用 `text-sm`（Inter）
  - 交互细节：无
  - 预估改动：**2 行**

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
- **差异判定**：**形态不同**（尺寸 28px vs 32px；hover 三态**已一致**：`hover:bg-bg-sunken` + `hover:text-fg`）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Profile.tsx`
  - 插入锚点：`UidRow` 内 `aria-label="复制 UID"` 的 `<button>`（L308-315）
  - PC 最终 className：`shrink-0 w-7 h-7 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center`
  - 数值：`w-7 h-7`=28px；`rounded-full`=9999px
  - 交互细节：hover 变背景 + 变文字色，150ms
  - 预估改动：**1 行**

---

### C2-17 · 复制成功态图标：已一致

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:111`
  ```tsx
  {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
  ```
- **PC 端**：`gacode-electron/src/routes/Profile.tsx:314` → `{copied ? <CheckIcon /> : <CopyIcon />}`，其中
  - `CopyIcon`（L560-567）：`width="14" height="14"` + lucide `Copy` 同款 path → = 14px = `w-3.5` ✅
  - `CheckIcon`（L569-575）：`width="14" height="14"` + `className="text-success"` + `strokeWidth="2"` → = 14px = `w-3.5` ✅
- **差异判定**：**已一致**（尺寸、颜色、图形、stroke-width 全对齐）
- **怎么改**：无需改
- 预估改动：**0 行**

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
- **差异判定**：**形态不同**（3 处 toast 的文案 + variant 全不同）
  | 场景 | web | PC |
  |---|---|---|
  | 无 UID | `title:"UID 不可用"` / `warning` | `message:"UID 暂不可用"` / `warning` |
  | 复制成功 | `title:"UID 已复制"` / **`default`** | `message:"UID 已复制"` / **`success`** |
  | 复制失败 | `title:"复制失败"` / **`danger`** | `message:"复制失败,请手动选中复制"` / **`warning`** |
  - 注：web 的 toast 是 `title` 字段（PC 的 Toast 组件**只有 `message`**，见 `C2-48`）；所以此处「PC 端该怎么写」取决于是否先做 C2-48 的 Toast 组件升级 —— **若不做 C2-48，PC 只能继续用 `message` 字段**，文案照抄 web 即可，variant 照抄。
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Profile.tsx`
  - 插入锚点：`UidRow` 内的 `handleCopy` 函数（L283-300）
  - PC 最终代码（**以 C2-48 已升级为前提**；未升级时把 `title:` 换成 `message:`）：
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
  - 交互细节：`copied` 状态 1500ms 后自动复位（web `:86-90` / PC `:277-281`，**已一致**）
  - 预估改动：**4 行**

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
- **差异判定**：**形态不同**（4 处）
  | 维度 | web | PC |
  |---|---|---|
  | 边框 | 无 | `border border-danger/30` |
  | 底色 | `bg-bg-elevated`=`#181818` | `bg-danger/5`（`#E54a5e` 5%） |
  | hover 底色 | `hover:bg-danger-soft/30`（`#7A0019` 30%） | `hover:bg-danger/10` |
  | 图标 | `<Trash2 className="w-5 h-5 shrink-0" />` = 20px | `<TrashIcon />` = 20px（**尺寸一致**），但**缺 `shrink-0`** |
  | 文字字号 | `text-base`=16px | `text-sm`=14px |
  | 右箭头 | **无** | `<ChevronRightIcon />` 有 |
  | `text-left` | 在 `<span>` 上（`flex-1 text-left`） | 在 `<button>` 上 |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Profile.tsx`
  - 插入锚点：`DeleteAccountRow` 函数内的 `<button ... className="w-full rounded-md border border-danger/30 bg-danger/5 ...">`（L360-369）
  - PC 最终 className（button）：`w-full rounded-md bg-bg-elevated p-4 flex items-center gap-3 hover:bg-danger-soft/30 transition-colors duration-150 text-danger`
  - PC 最终 className（span）：`flex-1 text-left text-base font-medium`
  - PC 最终 className（图标）：给 `TrashIcon` 加 `shrink-0` —— PC 的 `TrashIcon`（L541-550）**不接受 className**，需要改造成接受 props：
    ```tsx
    function TrashIcon({ className = "" }: { className?: string }) {
      return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={["shrink-0", className].filter(Boolean).join(" ")}>
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
        </svg>
      );
    }
    ```
    （web 的 lucide `Trash2` path 是 `M3 6h18` / `M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2` + 两道斜线；PC 的是 `M19 6l-2 14...` 直线版，**图形已不同**，建议一并换成 lucide `Trash2` 的真实 path：
    `<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>`）
  - **右箭头**：web **没有** → PC 的 `<ChevronRightIcon />` 应删除（PC 增强不列，但它是 web 没有的视觉元素，1:1 还原需去掉）
  - 交互细节：hover 变底色 150ms；点击 → 打开确认弹窗
  - 预估改动：**12 行**

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
- **差异判定**：**形态不同**（7 处）
  | 维度 | web AlertDialog | PC ConfirmDialog |
  |---|---|---|
  | 最大宽 | `max-w-md`=28rem=448px | `max-w-sm`=24rem=384px |
  | 圆角 | `rounded-2xl`=24px | `rounded-md`=16px |
  | 阴影 | `shadow-2xl` | `shadow-dialog` |
  | 边框 | `border border-fg-muted/10` | 无 |
  | 内边距 | `p-6 space-y-4`=24px | `p-5`=20px |
  | 遮罩 | `bg-black/60 backdrop-blur-sm` | `bg-black/60`（**无 backdrop-blur**） |
  | 进入动画 | `animate-fade-in`（200ms ease-out） | `animate-slide-in-from-bottom`（300ms ease-out） |
  | z-index | `z-[60]` | `z-50` |
  | 标题 | `text-lg font-semibold`=18px/700 | `text-base font-medium`=16px/500 |
  | 描述 | `text-sm text-fg-muted leading-relaxed` | `text-sm text-fg-muted mb-4`（**缺 `leading-relaxed`**） |
  | 按钮高度 | `h-9`=36px（原生 button） | PC `Button size="md"` = `h-10`=40px |
  | 取消按钮 | `border border-fg-muted/20 bg-bg-elevated hover:bg-bg-sunken` | `variant="ghost"` = `bg-transparent text-fg hover:bg-bg-elevated` |
  | 确认按钮 | `bg-danger text-white hover:bg-danger/90` | PC `variant="danger"` = `bg-danger text-white hover:bg-danger/90 active:bg-danger/80 shadow`（多 `shadow`） |
  | ESC 关闭 | 有（`alert-dialog.tsx:58-70` 监听 keydown Escape + 锁 body overflow） | **无** |
  | 点击遮罩关闭 | **无**（遮罩只有 `onClick={() => onOpenChange(false)}`… 实际**有**，见 `:91`） | 有（`:49` `onClick={onCancel}`） |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\ConfirmDialog.tsx`
  - 插入锚点：`ConfirmDialog` 函数 return 的最外层 `<div role="dialog" ... className="fixed inset-0 z-50 ...">`（L41-46）
  - PC 最终 className：
    - 外层：`fixed inset-0 z-[60]`
    - 遮罩：`absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in`
    - 面板：`pointer-events-auto w-full max-w-md rounded-2xl bg-bg-elevated text-fg shadow-2xl border border-fg-muted/10 p-6 space-y-4 animate-fade-in`
    - 标题：`text-lg font-semibold text-fg`
    - 描述：`text-sm text-fg-muted leading-relaxed`
    - 取消按钮：`h-9 px-4 rounded-md text-sm font-medium border border-fg-muted/20 bg-bg-elevated hover:bg-bg-sunken transition-colors disabled:opacity-50 disabled:pointer-events-none`
    - 确认按钮：`h-9 px-4 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none bg-danger text-white hover:bg-danger/90`
    - footer：`flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-2`
  - 需要新增的骨架（ESC 关闭 + 锁滚动，PC 现在没有）：
    ```tsx
    /** ESC 关闭 + 锁 body 滚动 — 对齐 web alert-dialog.tsx:58-70 */
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Escape") onCancel();
      };
      document.addEventListener("keydown", onKey);
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.removeEventListener("keydown", onKey);
        document.body.style.overflow = prev;
      };
    }, [onCancel]);
    ```
  - ⚠️ `ConfirmDialog` 是 **PC 多个页面共用**（`Profile.tsx` 登出 + 注销、`ProfileEdit` 之外的库/交付页），改它会波及别处 —— 见 `S-4`（是否单独给 Profile 做一个 AlertDialog 变体）
  - 交互细节：ESC 关闭；点遮罩关闭；动画 `animate-fade-in`=200ms ease-out（PC `tailwind.config.ts:252`）
  - 预估改动：**25 行**

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
- **差异判定**：**形态不同**（3 处标点/文案）
  | 位置 | web | PC |
  |---|---|---|
  | 标题 | `确定要注销账户吗?` | `确定要注销账户吗?` → **已一致** |
  | 描述 | `…将被永久删除, 且无法恢复。\n此操作不可撤销, 请确认要继续。`（**逗号后有空格 + 换行 + 多一句**） | `…将被永久删除,且无法恢复。此操作不可撤销。`（**无空格、无换行、少最后一句**） |
  | 确认按钮 | `我确定, 注销`（逗号后**有空格**） | `我确定,注销`（**无空格**） |
  | 取消按钮 | `取消` | `取消` → **已一致** |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Profile.tsx`
  - 插入锚点：`DeleteAccountRow` 内 `<ConfirmDialog title=... message=... confirmLabel=... />`（L372-379）
  - PC 最终文案：
    - `message="注销后,你的所有数据(账户、会话、知识库、设置)将被永久删除, 且无法恢复。此操作不可撤销, 请确认要继续。"`
    - `confirmLabel={deleteMutation.isPending ? "正在注销..." : "我确定, 注销"}`
  - 交互细节：无
  - 预估改动：**2 行**

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
- **差异判定**：**形态不同（数据通路）** —— 两端调的是**不同端点**（web `/yinian/account` vs PC `/auth/account`）；**动作本身现在已等价**（都是真删账号）
  | 端点 | 服务端实际动作 | 账号是否被删 |
  |---|---|---|
  | web `DELETE /yinian/account` | `modules/yinian/yinian.routes.js:579-582` → `authService.deleteAccount()` = 物理删除账号 + 全部关联数据 + 磁盘残留 | **是**（2026-10-15 起；此前才是「只删 3 张表」） |
  | PC `DELETE /auth/account` | `auth.routes.js:189-193` → `authService.deleteAccount()` = 物理删除账号 + 全部关联数据 + 磁盘残留 | **是** |
  ⇒ 剩下的差异只有**端点路径不统一**（同一个后端动作、两条路径），**不再有「一个真删一个不删」的行为倒退风险**
- **怎么改**：
  - **PC 端 `deleteAccount()` 不动** —— 已经是 `/auth/account`，**就是拍板口径**（PC 侧本条 = 0 行生产代码改动）
  - 要改的是 **web 端**（web 属别的端 → **交总 PM**）：
    - `gacode-web/src/lib/api.ts:1363-1364` → `request("/auth/account", { method: "DELETE" })`
    - 同步修 web 的 UI 文案「你的所有数据已永久删除」（`gacode-web/src/app/(main)/profile/page.tsx:169-173`、`:272`）：改到 `/auth/account` 后这句承诺**成立**（2026-10-15 之后服务端确实真删账号）
  - ⚠️ **不要**把 PC 改成 `request("/yinian/account")` —— 那是行为倒退，且与拍板相反
  - 交互细节：无
  - 预估改动：**PC 侧 0 行**；**web 侧 2 行**（`src/lib/api.ts` 换端点 1 行 + UI 文案 1 行）—— **交总 PM**
  - ✅ **已拍板（gaga 2026-10-26）：以 PC 为准，两端统一 `/auth/account`**（详见 `S-3`）—— 原来的「必须 gaga 拍板」前置条件**已解除**

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
- **差异判定**：**形态不同**（5 处）
  | 维度 | web | PC |
  |---|---|---|
  | 成功 toast 结构 | `title:"账户已注销"` + `description:"你的所有数据已永久删除"`（**双行**） | `message:"账户已注销,你的所有数据已永久删除"`（**单行**） |
  | 成功 toast variant | `default` | `success` |
  | 失败 toast | `title:"注销失败"` + `description: err.message \|\| "请稍后重试"` | `message:"注销失败: " + err.message`（**前缀拼接**，无兜底文案） |
  | 跳转 | web `logout()` 内部跳 login（见 `useAuth`），无显式 `navigate` | PC `navigate("/login", { replace: true })` 显式跳 |
  | 弹窗关闭时机 | 成功后才 `setDeleteOpen(false)` | 成功时 `setOpen(false)` |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Profile.tsx`
  - 插入锚点：`DeleteAccountRow` 内的 `deleteMutation`（L336-352）
  - PC 最终代码（**以 C2-48 已升级为前提**；未升级时 `title`/`description` 合并进 `message`）：
    ```tsx
    onSuccess: () => {
      toast({
        title: "账户已注销",
        description: "你的所有数据已永久删除",
        variant: "default",
      });
      setOpen(false);
      onDeleted();
    },
    onError: (err) => {
      toast({
        title: "注销失败",
        description: (err as Error)?.message || "请稍后重试",
        variant: "danger",
      });
    },
    ```
  - 交互细节：失败时**不关闭弹窗**（PC 现状已符合）；`deleting` 期间取消按钮禁用（web 用 `disabled={deleting}`，PC 用 `onCancel` 里 `if (deleteMutation.isPending) return;` —— **已一致**）
  - 预估改动：**8 行**

---

### C2-24 · 页脚版本号：PC 缺失

- **web 端**：`gacode-web/src/app/(main)/profile/page.tsx:292-294`
  ```tsx
  <div className="mt-8 text-center text-xs text-fg-muted opacity-50">
    gacode-web · v0.1.0
  </div>
  ```
- **PC 端**：**PC 缺失**（`gacode-electron/src/routes/Profile.tsx` 全文无版本号文案）
- **差异判定**：**缺失**
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Profile.tsx`
  - 插入锚点：`Profile` 函数 return 内、`DeleteAccountRow`（L240）**之后**
  - PC 最终写法：
    ```tsx
    <div className="mt-8 text-center text-xs text-fg-muted opacity-50">
      gacode-electron · v0.7.8
    </div>
    ```
  - 数值：`mt-8`=32px；`text-xs`=12px/16px；`opacity-50`=50%
  - 版本号取值：PC `package.json:3` → `"version": "0.7.8"` → 建议写成 `gacode-electron · v0.7.8`（**产品名文案与 web 不同，属可接受差异**；web 是 `gacode-web`）
  - 交互细节：无
  - 预估改动：**3 行**

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
- **差异判定**：**形态不同**（无障碍属性缺失）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Profile.tsx`
  - 插入锚点：顶部操作区的 `<Button variant="ghost" size="sm" onClick={() => navigate("/profile/edit")}>`（L118-124）
  - PC 最终代码：加一行 `aria-label="编辑资料"`
  - 交互细节：`variant="ghost" size="sm"` → PC `ghost` = `bg-transparent text-fg hover:bg-bg-elevated active:bg-bg-sunken`；`sm` = `h-8 px-3 text-sm`（**与 web 的 shadcn `sm` = `h-8 rounded-md px-3 text-xs` 差一个字重 —— 见 `C2-43`**）
  - 预估改动：**1 行**

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
- **差异判定**：**形态不同**（轮询间隔 30s vs 45s + 3 个 query 选项缺失）
- **怎么改**：
  - 目标文件（新增）：`D:\gaga\gaclaw-project\gacode-electron\src\lib\notifications.ts`（与 C2-05 同一个新文件）
  - 插入锚点：新文件顶部
  - PC 最终代码：
    ```ts
    /** 通知中心列表的轮询兜底间隔 — 45s (对齐 gacode-web/src/lib/notification-stream.ts:39) */
    export const NOTIFICATION_POLL_MS = 45_000;
    ```
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\layout\AppShell.tsx`
  - 插入锚点：`AppShell` 内 notifications 的 `useQuery`（L136-140）
  - PC 最终代码：
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
  - 数值：`45_000`ms=45s；`staleTime: 30 * 1000`=30s
  - 交互细节：无
  - 预估改动：**12 行**（新常量 + 改 useQuery）

---

### 组 2a 小结

| 编号 | 判定 | 预估改动 |
|---|---|---|
| C2-01 | 形态不同 | 6 行 |
| C2-02 | 形态不同 | 1 行 |
| C2-03 | 缺失 | 20 行 |
| C2-04 | 形态不同 | 1 行 |
| C2-05 | 缺失 | 9 行 |
| C2-06 | 形态不同 | 1 行 |
| C2-07 | 形态不同 | 8 行 |
| C2-08 | 形态不同 | 1 行 |
| C2-09 | 已一致 | 0 行 |
| C2-10 | 形态不同 | 1 行 |
| C2-11 | 形态不同 | 35 行 |
| C2-12 | 形态不同 | 4 行 |
| C2-13 | 形态不同 | 2 行 |
| C2-14 | 缺失 | 1 行 |
| C2-15 | 形态不同 | 2 行 |
| C2-16 | 形态不同 | 1 行 |
| C2-17 | 已一致 | 0 行 |
| C2-18 | 形态不同 | 4 行 |
| C2-19 | 形态不同 | 12 行 |
| C2-20 | 形态不同 | 25 行 |
| C2-21 | 形态不同 | 2 行 |
| C2-22 | 形态不同（数据通路） | 6 行 |
| C2-23 | 形态不同 | 8 行 |
| C2-24 | 缺失 | 3 行 |
| C2-25 | 形态不同 | 1 行 |
| C2-26 | 形态不同 | 12 行 |

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
- **差异判定**：**形态不同**（PC 标题**重复两次**）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileEdit.tsx`
  - 插入锚点：`ProfileEdit` 函数 return 内 `<div className="max-w-2xl mx-auto space-y-5">`（L168）里的 `<h1 className="text-xl font-medium">编辑资料</h1>`（L169）
  - PC 最终写法：**删除该 `<h1>` 整行**
  - 数值：`text-xl`=20px/28px —— 删除后标题只由 AppShell header 渲染（PC header 用 `text-base font-medium`=16px）
  - 交互细节：无
  - 预估改动：**-1 行**

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
- **差异判定**：**形态不同**（5 处）
  | 维度 | web | PC |
  |---|---|---|
  | 容器 | `flex flex-col items-center mb-8`（独立居中） | `flex items-center gap-4 rounded-md bg-bg-elevated p-4`（**塞进一张卡**） |
  | 头像尺寸 | `w-24 h-24`=96px | `w-16 h-16`=64px |
  | 相机按钮 | `w-8 h-8`=32px | `w-7 h-7`=28px |
  | 相机按钮阴影 | `shadow-elevation-2` | 无 |
  | 提示语 | `text-xs text-fg-muted mt-2`「点击相机图标更换头像」 | `text-xs text-fg-subtle mt-1`「支持 JPG / PNG / WebP,最大 5 MB」 |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileEdit.tsx`
  - 插入锚点：`ProfileEdit` 函数 return 内 `{/* profile-edit-5: 头像设置入口 ... */}` 注释块（L171-212）
  - PC 最终写法（照抄 web 结构）：
    ```tsx
    {/* Avatar */}
    <div className="flex flex-col items-center mb-8">
      <div className="relative">
        {avatarPreview ? (
          <img
            src={avatarPreview}
            alt="avatar"
            className="w-24 h-24 rounded-full object-cover"
          />
        ) : (
          <div
            aria-hidden="true"
            className="w-24 h-24 rounded-full flex items-center justify-center font-semibold uppercase"
            style={{ background: hashColor(user?.username || user?.email), color: "#000000" }}
          >
            {initials}
          </div>
        )}
        <button
          type="button"
          onClick={onPickAvatar}
          className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-brand text-brand-on flex items-center justify-center shadow-elevation-2 hover:bg-brand-hover transition-colors"
          aria-label="更换头像"
        >
          <CameraIcon className="w-4 h-4" />
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
    ```
  - 需要新增的 state / 骨架：
    ```tsx
    /** 本地头像预览 (dataURL) — 选完文件立刻回显, 不等上传 */
    const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar || null);
    /** 待上传的头像文件 — 保存时一起提交 */
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    /** 首字母 — 头像缺省时显示 */
    const initials = (displayName || profile?.username || "U").charAt(0).toUpperCase();
    ```
    （`avatarPreview` / `avatarFile` 在 web 是 `:49` / `:51` 的 state，PC 目前**没有** → 见 `C2-41`）
  - `hashColor`：见 `C2-29`
  - 数值：`w-24 h-24`=96px；`w-8 h-8`=32px；`shadow-elevation-2` = `0 1px 2px 0 rgb(0 0 0/0.5), 0 1px 3px 0 rgb(0 0 0/0.4)`（PC `tailwind.config.ts:221-222` 有同名 token ✅）；`text-xs`=12px；`mt-2`=8px
  - 交互细节：hover 相机按钮 `hover:bg-brand-hover`=`#ff8559`；`transition-colors` 默认 150ms（web 未显式写 duration）
  - 预估改动：**30 行**

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
- **差异判定**：**形态不同**
  | 维度 | web | PC |
  |---|---|---|
  | 底色 | hash 5 色（brand/cyan/yellow/red/green），每个用户固定一色 | 恒定 `bg-brand/30`（`#FF6B35` 30% 叠黑 ≈ `#4b2413`） |
  | 边框 | 无 | `border border-brand/40` |
  | 文字色 | `#000000` | `text-fg`=`#e5e7eb` |
  | 字重 | `font-semibold uppercase` | `font-medium`（无 uppercase） |
- **怎么改**：
  - 目标文件（新增）：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\Avatar.tsx`
  - 插入锚点：新文件（PC 组件目录只有 `BottomSheet / Button / ConfirmDialog / DropdownMenu / Input / LongPressMenu / Tabs / Toast`）
  - PC 最终代码：
    ```tsx
    /**
     * Avatar — gagaOS AppIconColor hash 调色板.
     * 对齐 gacode-web/src/components/ui/avatar.tsx:12-86.
     */
    const PALETTE = ["#FF6B35", "#0dcaf0", "#ffc700", "#c8102e", "#198754"];

    function hashColor(input: string): string {
      let h = 0;
      for (let i = 0; i < input.length; i += 1) {
        h = (h * 31 + input.charCodeAt(i)) | 0;
      }
      const idx = Math.abs(h) % PALETTE.length;
      return PALETTE[idx];
    }

    export interface AvatarProps {
      /** 兜底色的 hash 种子 (用户名 / 邮箱) */
      seed?: string;
      /** 头像图 URL — 有则渲染 img, 无则渲染首字母 */
      src?: string | null;
      /** 首字母文本 */
      children?: React.ReactNode;
      className?: string;
    }

    export function Avatar({ seed, src, children, className = "" }: AvatarProps) {
      const bg = seed ? hashColor(seed) : undefined;
      return (
        <div className={["relative flex h-24 w-24 shrink-0 overflow-hidden rounded-full", className].filter(Boolean).join(" ")}>
          {src ? (
            <img src={src} alt="" className="aspect-square h-full w-full object-cover" />
          ) : (
            <span
              className="flex h-full w-full items-center justify-center rounded-full font-semibold uppercase"
              style={{ background: bg ?? "#181818", color: bg ? "#000000" : "#e5e7eb" }}
            >
              {children}
            </span>
          )}
        </div>
      );
    }
    ```
  - 调用点改造：`ProfileEdit.tsx` 的头像区改用 `<Avatar seed={profile?.username || profile?.email} src={avatarPreview}>{initials}</Avatar>`（见 C2-28）
  - 交互细节：无
  - 预估改动：**35 行**（新组件）

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
- **差异判定**：**形态不同**（尺寸 32 vs 28；缺 `shadow-elevation-2`）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileEdit.tsx`
  - 插入锚点：L193
  - PC 最终 className：`absolute bottom-0 right-0 w-8 h-8 rounded-full bg-brand text-brand-on flex items-center justify-center shadow-elevation-2 hover:bg-brand-hover transition-colors`
  - 数值：`w-8 h-8`=32px；`shadow-elevation-2` = `0 1px 2px 0 rgb(0 0 0/0.5), 0 1px 3px 0 rgb(0 0 0/0.4)`；`hover:bg-brand-hover`=`#ff8559`
  - 交互细节：hover 150ms 变亮；web 无 `disabled` 态（PC 的 `disabled:opacity-50` 是 PC 增强，保留无害）
  - 预估改动：**1 行**

---

### C2-31 · 昵称长度上限：`maxLength={30}` vs `maxLength={64}`

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:190` → `maxLength={30}`
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:227` → `maxLength={DISPLAY_NAME_MAX}`，`const DISPLAY_NAME_MAX = 64;`（L43）
- **服务端事实**（F-6）：`unified-api/src/modules/gacode/gacode.profile.routes.js:91` → `displayName: { type: ['string','null'], maxLength: 50 }` —— **服务端允许 50**
  - ⚠️ **修正（2026-10-26 复核 · E1）**：原稿引的 `unified-api/src/modules/yinian/profile.routes.js:46`（maxLength 64）属于**没人调用的** `/api/v1/auth/profile` 路由；两端实际调的是 `/api/v1/gacode/profile`（web `src/lib/api.ts:264` / PC `src/lib/api.ts:1164`）⇒ 上限是 **50**，不是 64
- **差异判定**：**形态不同**（web 30 / PC 64 / 服务端 50）
- ⚠️ **现网 bug（不是形态差异）**：PC 允许 64 > 服务端 50 ⇒ 用户输入 **51~64 字昵称**时保存会被服务端 schema 校验拒绝 → **400，保存失败**。详见本节末尾的「PC 现网 400 bug」条目
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileEdit.tsx`
  - 插入锚点：`const DISPLAY_NAME_MAX = 64;`（L43）
  - PC 最终写法：`const DISPLAY_NAME_MAX = 30;`（1:1 对齐 web；30 ≤ 服务端 50 ⇒ **不会**触发 400）
    - ⚠️ 若按「服务端上限」口径改成 `50` 同样安全（**消除 400 的最小改动**）；**两个口径二选一，但都必须 ≤ 50**
  - 数值：30 字符（web 口径）/ 50 字符（服务端上限口径）
  - 交互细节：HTML `maxLength` 硬截断（打不出来），非软校验
  - 预估改动：**1 行**
  - ⚠️ 副作用：PC 的 `onSave` 校验 `if (trimmedName.length > DISPLAY_NAME_MAX)` 提示「昵称不能超过 64 字符」（L129-135）→ 改成 30 后提示文案同步变「昵称不能超过 30 字符」，与 web 的 toast 文案不同（web 无此校验，因为 `maxLength` 已挡住）→ 见 `C2-48`

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
- **差异判定**：**形态不同（数据通路）** —— 两端点同一个 `PUT /profile`，但「清空昵称」的结果**完全不同**
  | 输入 | web | PC |
  |---|---|---|
  | 昵称 = `"张三"` | 存 `"张三"` | 存 `"张三"` |
  | 昵称 = `""` | **保留原值** | **清空（null）** |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileEdit.tsx`
  - 插入锚点：`onSave` 内的 `saveMutation.mutate({...})`（L144-148）
  - PC 最终写法：
    ```tsx
    saveMutation.mutate({
      displayName: trimmedName.length > 0 ? trimmedName : undefined,
      gender,
      bio: trimmedBio.length > 0 ? trimmedBio : undefined,
    });
    ```
  - ⚠️ PC 的 `UpdateProfileInput` 类型（`gacode-electron/src/lib/api.ts:1157-1161`）声明的是 `displayName?: string | null` → 需要把 `null` 改成 `undefined` 才能过 TS：
    ```ts
    export interface UpdateProfileInput {
      displayName?: string;
      gender?: Gender;
      bio?: string;
    }
    ```
  - ⚠️ **服务端 `anyOf` 要求至少一个字段**（`gacode/gacode.profile.routes.js:95-99`）→ 三个都 undefined 时会 400。web 有同样问题（web 的 gender 一定传值，所以实际安全）；PC 同样有 gender → 安全
  - 交互细节：无
  - 预估改动：**6 行**

---

### C2-33 · 简介长度上限：`BIO_MAX = 200` vs `500`

- **web 端**：`gacode-web/src/app/(main)/profile/edit/page.tsx:29` → `const BIO_MAX = 200;`；`:232` → `maxLength={BIO_MAX}`；`:137-143` 软校验 `if (bio.length > BIO_MAX)` toast `简介不能超过 ${BIO_MAX} 字`
- **PC 端**：`gacode-electron/src/routes/ProfileEdit.tsx:42` → `const BIO_MAX = 500;`；`:294` → `maxLength={BIO_MAX}`；`:136-142` 软校验
- **服务端事实**（F-6）：`gacode/gacode.profile.routes.js:93` → `bio: { type: ['string','null'], maxLength: 200 }` —— **服务端允许 200**
  - ⚠️ **修正（2026-10-26 复核 · E1）**：原稿引的 `unified-api/src/modules/yinian/profile.routes.js:48`（maxLength 500）属于**没人调用的** `/api/v1/auth/profile` 路由 ⇒ 上限是 **200**，不是 500
- **差异判定**：**形态不同**（web 200 / PC 500 / 服务端 200）
- ⚠️ **现网 bug（不是形态差异）**：PC 允许 500 > 服务端 200 ⇒ 用户输入 **201~500 字简介**时保存会被服务端 schema 校验拒绝 → **400，保存失败**。详见本节末尾的「PC 现网 400 bug」条目
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileEdit.tsx`
  - 插入锚点：`const BIO_MAX = 500;`（L42）
  - PC 最终写法：`const BIO_MAX = 200;`
  - 数值：200 字
  - 交互细节：软校验 toast 文案「简介不能超过 200 字」（web `:138-142`）—— PC 现有文案是「简介不能超过 500 字符」→ 需同步改「字」+ 200（见 C2-48）
  - 预估改动：**2 行**

---

#### ⚠️ 现网 bug · PC 昵称 / 简介长度上限超出服务端 → 保存直接 400（**当前就在犯**）

- **性质**：**现网 bug**，**不是**形态差异（不计入本文的 101 条差异统计 —— 统计口径见文末「全量统计」）
- **现象**：PC 端「编辑资料」页保存时，只要昵称 **51~64 字**、或简介 **201~500 字**，服务端 `PUT /api/v1/gacode/profile` 的 Fastify schema 校验失败 → 返回 **400** → 用户看到保存失败，数据存不进去（**前端软校验放行、后端 schema 拒收**）
- **根因**：

  | 字段 | PC 常量 | 前端 `maxLength` | 服务端上限 | 出错区间 |
  |---|---|---|---|---|
  | 昵称 | `DISPLAY_NAME_MAX = 64`（`gacode-electron/src/routes/ProfileEdit.tsx:43`） | `:227` `maxLength={DISPLAY_NAME_MAX}` | **50**（`unified-api/src/modules/gacode/gacode.profile.routes.js:91`） | **51~64 字 → 400** |
  | 简介 | `BIO_MAX = 500`（`gacode-electron/src/routes/ProfileEdit.tsx:42`） | `:293` `maxLength={BIO_MAX}` | **200**（`gacode-electron/src/modules/gacode/gacode.profile.routes.js:93`） | **201~500 字 → 400** |

  PC 的软校验（`ProfileEdit.tsx:129-140`）按**自己的常量**放行，服务端按 **50 / 200** 拒收
- **改法**（两个常量 + 前端 `maxLength` 同步，`maxLength` 直接引用常量所以不用另改）：
  1. `gacode-electron/src/routes/ProfileEdit.tsx:42`：`const BIO_MAX = 500;` → `const BIO_MAX = 200;`
  2. `gacode-electron/src/routes/ProfileEdit.tsx:43`：`const DISPLAY_NAME_MAX = 64;` → `const DISPLAY_NAME_MAX = 50;`（**服务端上限口径**；若走 1:1 对齐 web 则取 `30`，见 C2-31 —— **两个口径都能消除该 400，但必须 ≤ 50**）
  3. 软校验 toast 文案跟着常量走（`:131`「昵称不能超过 {N} 字符」/ `:138`「简介不能超过 {N} 字符」）；web 用的是「字」（`简介不能超过 ${BIO_MAX} 字`），措辞统一见 `C2-48`
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
- **差异判定**：**形态不同**（选项集合 + 顺序）
  | 维度 | web | PC |
  |---|---|---|
  | 选项数 | 3 | 4 |
  | 顺序 | 男 / 女 / 保密 | 保密 / 男 / 女 / 其他 |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileEdit.tsx`
  - 插入锚点：`const GENDER_OPTIONS`（L35-40）
  - PC 最终写法：
    ```tsx
    const GENDER_OPTIONS: Array<{ value: Gender; label: string }> = [
      { value: "male", label: "男" },
      { value: "female", label: "女" },
      { value: "unspecified", label: "保密" },
    ];
    ```
  - ⚠️ PC 的 `Gender` 类型来自 `gacode-electron/src/lib/api.ts`（含 `"other"`）→ 保留类型定义，只是 UI 不暴露「其他」
  - ⚠️ 已有账号 `gender === "other"` 的用户：web 的 `genderOptions` 里没有对应项 → 打开编辑页时 `gender` state = `"other"`，三个按钮都不高亮（web 现状如此）；PC 删掉「其他」后会**同样不高亮**，但 PC 保存时会把这个 `"other"` 原样提交 → 不会丢数据。**PC 现状更安全，1:1 还原后行为与 web 一致**
  - 交互细节：无
  - 预估改动：**2 行**

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
- **差异判定**：**形态不同**（2 处：web 有边框、PC 多了 `gap-1`）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileEdit.tsx`
  - 插入锚点：L258
  - PC 最终 className：`inline-flex p-1 rounded-md bg-bg-elevated border border-border`
  - 数值：`p-1`=4px；`rounded-md`=16px；`bg-bg-elevated`=`#181818`；`border`=1px `#363b41`
  - 交互细节：`gap-1`=4px 的额外间距是 PC 加的 → 删掉后三个按钮贴紧（与 web 一致）
  - 预估改动：**1 行**

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
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileEdit.tsx`
  - 插入锚点：L267
  - PC 最终写法：`"px-4 py-1.5 text-sm rounded transition-colors"`（删 `duration-150`，与 web 逐字一致）
  - 交互细节：切换 active 态时背景 `bg-brand`(#FF6B35) / 文字 `text-brand-on`(#000) 150ms 过渡；inactive hover 文字变主色
  - 预估改动：**1 行**（**低优先级：视觉零差异**）

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
- **差异判定**：**缺失**（PC 无 `Textarea` 组件）+ **形态不同**（3 处 className 差异）
  | 维度 | web `<Textarea>` | PC 裸 textarea |
  |---|---|---|
  | 底色 | `bg-bg-elevated`=`#181818` | `bg-bg-sunken`=`#0a0a0a` |
  | 阴影 | `shadow-sm` = `0 1px 2px 0 rgb(0 0 0/0.5)` | **无** |
  | 最小高度 | `min-h-[88px]` | **无**（只有 `rows={4}`） |
- **怎么改**：
  - 目标文件（新增）：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\Textarea.tsx`
  - 插入锚点：新文件（对齐 PC 已有 `Input.tsx` 的写法风格）
  - PC 最终代码：
    ```tsx
    /**
     * components/ui/Textarea.tsx — 多行输入框
     * 对齐 gacode-web/src/components/ui/textarea.tsx（bg-bg-elevated + shadow-sm + min-h-[88px]）
     */
    import { forwardRef, type TextareaHTMLAttributes } from "react";

    export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

    export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
      { className = "", ...rest },
      ref,
    ) {
      return (
        <textarea
          ref={ref}
          className={[
            "flex w-full rounded-md border border-border bg-bg-elevated px-4 py-3 text-base",
            "placeholder:text-fg-subtle shadow-sm resize-y min-h-[88px]",
            "transition-colors duration-150",
            "focus:outline-none focus:border-brand",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          {...rest}
        />
      );
    });
    ```
  - 调用点：`ProfileEdit.tsx:288-303` 改成 `<Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={4} maxLength={BIO_MAX} placeholder="介绍一下自己..." />`
  - 数值：`min-h-[88px]`=88px；`px-4 py-3`=16px/12px；`shadow-sm` = `0 1px 2px 0 rgb(0 0 0/0.5)`；`resize-y`=仅垂直可拖
  - 交互细节：focus 时 `border-brand`(#FF6B35) 150ms；`disabled` 0.5 opacity + not-allowed
  - 预估改动：**28 行**（新组件）+ 5 行（调用点）

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
- **差异判定**：**形态不同**（3 处：按钮高度 36 vs 48、字号、图标）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileEdit.tsx`
  - 插入锚点：L327-335
  - PC 最终写法：
    ```tsx
    <Button
      variant="default"
      className="flex-1 gap-2"
      onClick={onSave}
      disabled={saving}
    >
      {saving ? (
        <SpinnerIcon className="w-4 h-4 animate-spin" />
      ) : (
        <SaveIcon className="w-4 h-4" />
      )}
      保存
    </Button>
    ```
  - ⚠️ PC 的 `Button` 组件**自带** `loading` 时渲染 `<span className="gagaos-spinner" />`（`Button.tsx:73-78`）→ 与 web 的 `Loader2` 图标形态不同。1:1 还原需**去掉 `loading` prop**，改用上面的图标三元表达式
  - `SpinnerIcon` / `SaveIcon`：PC 无 lucide（F-2），需手写 SVG（lucide `Save` path：`M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z` / `M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7` / `M7 3v4a1 1 0 0 0 1 1h7`）；`Loader2` 是 2 段 `path` + `animate-spin`
  - 数值：`h-9 px-4 py-2`=36px；图标 `w-4 h-4`=16px；`gap-2`=8px（图标与文字间距）
  - 交互细节：保存中按钮 `disabled`（web 用 `disabled={saving}`，PC 用 `loading` → 两者都禁按钮，但 PC 额外显示 spinner）
  - 预估改动：**12 行**（含两个 SVG）

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
- **差异判定**：**形态不同**（2 处：按钮高度 36 vs 48；返回语义 back vs 固定跳转）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileEdit.tsx`
  - 插入锚点：L318-326
  - PC 最终写法：
    ```tsx
    <Button
      variant="outline"
      className="flex-1"
      onClick={() => navigate(-1)}
      disabled={saveMutation.isPending}
    >
      取消
    </Button>
    ```
    - PC 的 `useNavigate` 支持 `navigate(-1)`（react-router v6 ✅，PC `package.json:27` 是 `react-router-dom ^6.27.0`）
    - ⚠️ `navigate(-1)` 在「直接打开 /profile/edit 而无历史」时会**停在原地**。PC 的 AppShell 有返回按钮（`AppShell.tsx:284-292` `handleBack`，history.length>1 时 `navigate(-1)`，否则 `navigate("/")`）—— 可复用同样的兜底：
      ```tsx
      const handleBack = () => {
        if (window.history.length > 1) navigate(-1);
        else navigate("/profile");
      };
      ```
  - 数值：`h-9 px-4 py-2`=36px
  - 交互细节：保存中禁用
  - 预估改动：**6 行**

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
- **差异判定**：**形态不同**（变体级，影响组 2/3/4 所有按钮）
  | 维度 | web | PC |
  |---|---|---|
  | `outline` 底色 | `bg-background`=`#000` | `bg-transparent` |
  | `outline` 阴影 | `shadow-sm` | 无 |
  | `outline` hover | `hover:bg-accent`(=#1f1f1f) `hover:text-accent-foreground`(=#FFD7B8) | `hover:bg-bg-elevated`(=#181818)，**文字不变色** |
  | `outline` 边框色 | `border-input`=`#363b41` | `border-border`=`#363b41` ✅ |
  | `ghost` hover | `hover:bg-accent hover:text-accent-foreground` | `hover:bg-bg-elevated`，文字不变色 |
  | `ghost` 底色 | 无（透明） | `bg-transparent` ✅ |
  | `default` 底色 | `bg-primary`=`#FF6B35` ✅ | `bg-brand`=`#FF6B35` ✅ |
  | `default` hover | `hover:bg-primary/90` | `hover:bg-brand-hover`=`#ff8559` |
  | `default` active | 无 | `active:bg-brand-active`=`#e55828` |
  | `danger` | web 叫 `destructive`，`shadow-sm` | PC 叫 `danger`，`shadow`（不是 `shadow-sm`） |
  | size `default` | `h-9 px-4 py-2`=36px | PC 无 `default` size，最小是 `md`=`h-10 px-4 text-sm`=40px |
  | size `sm` | `h-8 rounded-md px-3 text-xs`（**12px** 文字） | `h-8 px-3 text-sm`（**14px** 文字） |
  | size `lg` | `h-10 rounded-md px-8`=40px | `h-12 px-6 text-base`=48px |
  | focus ring | `focus-visible:ring-1 focus-visible:ring-ring` | `focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2` |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\Button.tsx`
  - 插入锚点：`const variantClass`（L25-34）与 `const sizeClass`（L36-40）
  - PC 最终代码：
    ```tsx
    const variantClass: Record<ButtonVariant, string> = {
      default:
        "bg-brand text-brand-on shadow hover:bg-brand/90",
      danger:
        "bg-danger text-white shadow-sm hover:bg-danger/90",
      outline:
        "border border-border bg-bg-base shadow-sm hover:bg-accent hover:text-accent-foreground",
      secondary:
        "bg-bg-elevated text-fg shadow-sm hover:bg-bg-elevated/80",
      ghost:
        "hover:bg-accent hover:text-accent-foreground",
    };
    const sizeClass: Record<ButtonSize, string> = {
      default: "h-9 px-4 py-2",
      sm: "h-8 rounded-md px-3 text-xs",
      md: "h-10 rounded-md px-8",
      lg: "h-12 px-6 text-base",
    };
    ```
    - ⚠️ **冲突类名**：PC 无 `twMerge`（F-1）→ `bg-accent`(`#1f1f1f`) 是 PC token 里已存在的（`tailwind.config.ts:96-99` `accent: "#1f1f1f"` ✅），直接用即可
    - ⚠️ **`Button` 是全站共用组件**（`Profile` / `ProfileEdit` / `Notifications` / `Library` / `Deliveries` 全都 import 它）→ 改 variant/size 会波及全站 → 见 `S-4`
    - ⚠️ 需要新增 `size: "default"`（PC 的 `ButtonSize` 类型要加 `"default"`），且 `default`/`md` 语义重名，建议**保留 PC 现有 `md`**（=40px，对应 web 的 `lg`），把 web 的 `default`（36px）映射到 PC 的新 `size="default"`
  - 数值：`h-9`=36px；`h-8`=32px；`h-10`=40px；`h-12`=48px；`text-xs`=12px；`text-sm`=14px
  - 交互细节：hover / focus-visible / disabled 三态逐条对齐上表
  - 预估改动：**20 行**（改 2 个常量 + 类型 + 各调用点补 `size`）

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
- **差异判定**：**缺失**（交互行为差异：web 选完即回显，PC 要等网络往返）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileEdit.tsx`
  - 插入锚点：`ProfileEdit` 函数内的 state 声明区（L55-58）与 `handleFileChange`（L86-99）
  - 需要新增的 state：
    ```tsx
    /** 本地头像预览 (dataURL) — 选完文件立刻回显, 不等上传 */
    const [avatarPreview, setAvatarPreview] = useState<string | null>(profile?.avatar || null);
    /** 待上传的头像文件 — 保存时随 updateProfile 一起提交 */
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    ```
  - PC 最终 `handleFileChange`：
    ```tsx
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      e.target.value = "";
    };
    ```
  - 交互细节：`FileReader.readAsDataURL` 是异步的（`onload` 回调）→ 预览在读文件完成后才出现（通常 <50ms）；`e.target.value = ""` 保证选同一文件能再次触发 change
  - 预估改动：**18 行**

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
- **差异判定**：**形态不同**（2MB vs 5MB）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileEdit.tsx`
  - 插入锚点：L93-96
  - PC 最终代码：
    ```tsx
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "图片不能超过 2 MB", variant: "warning" });
      return;
    }
    ```
  - 数值：`2 * 1024 * 1024`=2097152 字节
  - 交互细节：超限时**不选文件**（return 前没清 input，但 PC 在末尾 `e.target.value = ""`）
  - 预估改动：**2 行**

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
- **差异判定**：**形态不同**（文案 + variant）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileEdit.tsx`
  - 插入锚点：L89-92
  - PC 最终代码：
    ```tsx
    if (!file.type.startsWith("image/")) {
      toast({ title: "请选择图片文件", variant: "warning" });
      return;
    }
    ```
  - 交互细节：无
  - 预估改动：**2 行**

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
- **差异判定**：**形态不同（数据通路）**（3 处）
  | 维度 | web | PC |
  |---|---|---|
  | 保存时重复上传 | 有（`mutationFn` 里再 `uploadAvatar`） | 无 |
  | 本地立即更新 | `applyPatch({...})` 写 `useAuthStore` | 无（靠 refetch） |
  | 保存后写入 avatar | `...(uploadedUrl ? { avatar: uploadedUrl } : {})` | 无 |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileEdit.tsx`
  - 插入锚点：`saveMutation` 定义（L104-122）与 `onSave`（L124-149）
  - PC 最终代码（1:1 还原 web）：
    ```tsx
    const saveMutation = useMutation({
      mutationFn: async () => {
        let uploadedUrl: string | undefined;
        if (avatarFile) {
          const data = await uploadAvatar(avatarFile);
          uploadedUrl = data?.url;
        }
        await updateProfile({
          displayName: displayName.trim() || undefined,
          gender,
          bio: bio.trim() || undefined,
        });
        return { uploadedUrl };
      },
      onSuccess: ({ uploadedUrl }) => {
        queryClient.invalidateQueries({ queryKey: ["profile"] });
        toast({ title: "资料已保存", variant: "success" });
        navigate("/profile");
      },
      ...
    });
    ```
  - ⚠️ PC 的 `useAuth()`（`gacode-electron/src/lib/auth.ts`）**没有** `updateProfile` / `updateAvatar` 这两个 store patch 方法（web 的 `useAuthStore` 有，`gacode-web/src/lib/store.ts:119-137`）→ 本地立即更新要么给 PC 的 auth store 加同款 patch 方法，要么**只做 `invalidateQueries`**（PC 现状）。
    - 建议：**只做 `invalidateQueries`**（PC 现状），把「重复上传」这一项对齐即可 → 见下方备注
  - ⚠️ **重复上传不是纯视觉差异，是重复网络写**：web 选文件上传 1 次 + 保存再上传 1 次 = 同一张头像写两次磁盘。建议 PC **保持现状（不重复上传）**，只对齐「本地立即更新」。这一条属**取舍**，列在 `S-5` 让 gaga 拍
  - 预估改动：**10 行**

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
- **差异判定**：**形态不同**（成功文案「资料已保存」vs「已保存」；失败文案结构 title+description vs 前缀拼接）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileEdit.tsx`
  - 插入锚点：`saveMutation` 的 `onSuccess` / `onError`（L110-121）
  - PC 最终代码：
    ```tsx
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast({ title: "资料已保存", variant: "success" });
      navigate("/profile");
    },
    onError: (err) => {
      toast({
        title: "保存失败",
        description: String((err as Error)?.message || err),
        variant: "danger",
      });
    },
    ```
  - 交互细节：失败时**保留用户输入**（web `:127-133` 的 `onError` 不碰任何 setState；PC `:115-121` 同样不碰 → **已一致**）
  - 预估改动：**6 行**

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
- **差异判定**：**形态不同**
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ProfileEdit.tsx`
  - 插入锚点：`ProfileEdit` 函数 return 的 L167-168 与各块容器
  - PC 最终写法：删内层 div，外层改 `px-4 lg:px-8 py-6 max-w-2xl mx-auto`，各块 margin 照抄 web：
    - 头像区 `flex flex-col items-center mb-8`
    - 昵称 `mb-5`
    - 性别 `mb-5`
    - 简介 `mb-6`
    - 按钮行 `flex gap-3`（**删掉 `pt-2`**）
  - 数值：`mb-8`=32px；`mb-5`=20px；`mb-6`=24px；`space-y-5`=20px（删）；`pt-2`=8px（删）
  - 交互细节：无
  - 预估改动：**8 行**

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
- **怎么改**：无需改
- 预估改动：**0 行**

---

### 组 2b 小结

| 编号 | 判定 | 预估改动 |
|---|---|---|
| C2-27 | 形态不同 | -1 行 |
| C2-28 | 形态不同 | 30 行 |
| C2-29 | 形态不同 | 35 行 |
| C2-30 | 形态不同 | 1 行 |
| C2-31 | 形态不同 | 1 行 |
| C2-32 | 形态不同（数据通路） | 6 行 |
| C2-33 | 形态不同 | 2 行 |
| C2-34 | 形态不同 | 2 行 |
| C2-35 | 形态不同 | 1 行 |
| C2-36 | 形态不同（视觉无差） | 1 行 |
| C2-37 | 缺失 + 形态不同 | 28 行 |
| C2-38 | 形态不同 | 12 行 |
| C2-39 | 形态不同 | 6 行 |
| C2-40 | 形态不同（组件级） | 20 行 |
| C2-41 | 缺失 | 18 行 |
| C2-42 | 形态不同 | 2 行 |
| C2-43 | 形态不同 | 2 行 |
| C2-44 | 形态不同（数据通路） | 10 行 |
| C2-45 | 形态不同 | 6 行 |
| C2-46 | 形态不同 | 8 行 |
| C2-47 | 已一致 | 0 行 |

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
- **差异判定**：**形态不同**（11 处）
  | 维度 | web | PC |
  |---|---|---|
  | 位置 | **屏幕正中**（`items-center justify-center`） | **顶部居中**（`top-4 left-1/2 -translate-x-1/2`） |
  | 遮罩 | `bg-black/60` + `pointer-events-none`（不阻断操作） | **无遮罩** |
  | 最大宽 | `max-w-[360px]`=360px | `max-w-[min(560px,calc(100vw-32px))]`=560px |
  | 圆角 | `rounded-2xl`=24px | `rounded-md`=16px |
  | 内边距 | `p-5 pr-10`=20px/40px | `px-4 py-3`=16px/12px |
  | 边框 | **无** | `border` + `border-{variant}/50` |
  | 变体表达 | **图标 + 图标色**（Info/CheckCircle2/AlertTriangle/AlertCircle） | **彩色边框 + 左侧圆点** |
  | 标题/描述 | `title` + `description` **双行** | 只有 `message` **单行** |
  | 标题样式 | `text-base font-medium leading-6`=16px/24px | 无（message 是 `text-sm`=14px） |
  | 描述样式 | `text-[13.5px] leading-5 text-fg-muted` | 无 |
  | 关闭按钮 | 有（右上 ×） | **无** |
  | 堆叠 | `flex flex-col-reverse gap-3` 多条堆叠 | 单条，新替换旧 |
  | 时长 | 2500ms | 3000ms |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\Toast.tsx`
  - 插入锚点：`ToastProvider` 的 `toast` 回调（L51-65）、`ToastView`（L106-129）、`variantClass`/`variantDot`（L92-104）
  - PC 最终代码（骨架）：
    ```tsx
    export interface ToastItem {
      id: string;
      title?: ReactNode;
      description?: ReactNode;
      variant?: ToastVariant;
      duration?: number;
    }

    const DEFAULT_DURATION_MS = 2500;

    // 变体图标 —— PC 无 lucide (F-2), 手写 4 个 SVG
    const VARIANT_ICON_CLASS: Record<ToastVariant, string> = {
      default: "text-fg-muted",
      success: "text-success",
      warning: "text-warning",
      danger: "text-danger",
    };
    ```
  - PC 最终 className（面板）：`pointer-events-auto relative w-full max-w-[360px] rounded-2xl bg-bg-elevated p-5 pr-10 shadow-dialog animate-fade-in`
  - PC 最终 className（标题）：`m-0 text-base font-medium leading-6`
  - PC 最终 className（描述）：`m-0 mt-1 text-[13.5px] leading-5 text-fg-muted break-words`
  - PC 最终 className（图标）：`w-[15px] h-[15px] shrink-0 mt-[3px]`
  - PC 最终 className（关闭按钮）：`absolute right-3 top-3 w-7 h-7 rounded-full grid place-items-center text-fg-muted hover:text-fg hover:bg-white/[0.07] transition-colors duration-150`
  - PC 最终 className（遮罩）：`pointer-events-none fixed inset-0 z-[9998] bg-black/60`
  - PC 最终 className（容器）：`pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center px-5`
  - PC 最终 className（堆叠）：`flex flex-col-reverse items-center gap-3 max-h-[80vh] overflow-y-auto`
  - 数值：`max-w-[360px]`=360px；`rounded-2xl`=24px；`p-5 pr-10`=20px/40px；`text-[13.5px] leading-5`=13.5px/20px；`w-[15px] h-[15px]`=15px；`mt-[3px]`=3px；`w-7 h-7`=28px；`right-3 top-3`=12px；`hover:bg-white/[0.07]`=白 7%；`gap-3`=12px；`max-h-[80vh]`
  - 交互细节：遮罩 `pointer-events-none` → **不阻断**用户操作；多条同时出现时新的在上（`flex-col-reverse`）；`duration=0` 常驻；右上 × 手动关
  - ⚠️ **API 破坏性变更**：`toast({ message })` → `toast({ title })`。PC 全仓现有调用点都用 `message` → 需要**全量改**（`grep -rn "toast({" gacode-electron/src`）。本清单涉及的调用点：C2-18、C2-23、C2-45、组 3 的 C3-xx、组 4 的 C4-xx
  - ⚠️ 或者：保留 `message` 字段作为 `title` 的别名（兼容层），PC 端 UI 仍按 web 的双行渲染 —— **推荐这个**，改动面小
  - 预估改动：**80 行**（Toast.tsx 重写 + 全仓调用点兼容）

---

### 组 2c 小结

| 编号 | 判定 | 预估改动 |
|---|---|---|
| C2-48 | 形态不同 | 80 行 |

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
- **差异判定**：**形态不同**（4 处）
  | 维度 | web | PC |
  |---|---|---|
  | 容器 | 单层 `px-4 lg:px-8 py-6 max-w-3xl mx-auto` | `min-h-full flex flex-col` + 头部 sticky + 列表区 `flex-1` |
  | 顶部栏 | 页面内普通块（`mb-4`），**随页面滚走** | `sticky top-0 z-10 bg-bg-base`（**吸顶**） |
  | 最大宽挂载点 | 整个页面（含标题行）`max-w-3xl`=768px | 只有 `<ul>` `max-w-3xl`（标题行**不受限**） |
  | 列表上边距 | 由 `mb-4` + 卡片间距控制 | `py-4`=16px |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Notifications.tsx`
  - 插入锚点：`Notifications` 函数 return 的 `<div className="min-h-full flex flex-col">`（L231）
  - PC 最终写法：
    ```tsx
    <div className="px-4 lg:px-8 py-6 max-w-3xl mx-auto">
    ```
    - 顶部行去掉 `sticky top-0 z-10 bg-bg-base px-4 lg:px-8 py-3`，改成 `flex items-center justify-between mb-4`
    - 列表容器 `<div className="flex-1 px-4 lg:px-8 py-4">` → 去掉外层，内层 `<ul className="space-y-2 max-w-3xl mx-auto">` → 改成 `<div className="space-y-6">`（web 的分组容器，见 C3-08）
  - 数值：`max-w-3xl`=768px；`py-6`=24px；`mb-4`=16px
  - 交互细节：web 顶部行**会随页面滚走**（无 sticky）；PC 现状吸顶 —— 1:1 还原要**去掉 sticky**
  - 预估改动：**8 行**

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
- **差异判定**：**形态不同**（4 处）
  | 维度 | web | PC |
  |---|---|---|
  | 文案 | 「通知中心」 | 「通知」 |
  | 标题字号 | `text-lg`=18px/28px | `text-base`=16px/24px |
  | 标题字重 | `font-semibold`=600 | `font-medium`=500 |
  | 铃铛图标 | `<Bell className="w-5 h-5 text-brand" />` | **无** |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Notifications.tsx`
  - 插入锚点：`<h1 className="text-base font-medium">通知</h1>`（L235）
  - PC 最终写法：
    ```tsx
    <div className="flex items-center gap-2">
      <BellIcon className="w-5 h-5 text-brand" />
      <h1 className="text-lg font-semibold">通知中心</h1>
      {unreadCount > 0 ? (
        <Badge variant="destructive" className="text-[10px]">
          {unreadCount} 未读
        </Badge>
      ) : null}
    </div>
    ```
  - `BellIcon`：PC 的 `Notifications.tsx:381-388` 已有 `BellIcon({ className })`，但默认 `width="24" height="24"` —— 需要**接受 className 覆盖尺寸**（见 C3-11 的统一图标组件建议）；web 的 `w-5 h-5`=20px
  - `Badge` 组件：PC **没有**（`src/components/ui/` 无 `badge.tsx`）→ 需新增（见 C3-03）
  - 另需改：`gacode-electron/src/components/layout/AppShell.tsx:44` → `return "通知中心";`
  - 数值：`text-lg`=18px；`w-5 h-5`=20px；`text-brand`=`#FF6B35`
  - 交互细节：无
  - 预估改动：**12 行**（含 Badge 组件）

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
- **差异判定**：**形态不同**（5 处）
  | 维度 | web | PC |
  |---|---|---|
  | 底色 | `bg-danger`=`#E54a5e`（实心红） | `bg-brand/20`（brand 20% 淡橙） |
  | 文字色 | `text-white` | `text-brand`=`#FF6B35` |
  | 边框 | `border-transparent`（**无可见边框**） | `border border-brand/40`（**有可见边框**） |
  | 横向内边距 | `px-2.5`=10px | `px-2`=8px |
  | 文案 | `{unreadCount} 未读` | `{unreadCount} 条未读` |
  | 字号 | `text-[10px]`=10px（`text-xs` 被覆盖） | `text-xs`=12px |
- **怎么改**：
  - 目标文件（新增）：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\Badge.tsx`
  - 插入锚点：新文件
  - PC 最终代码：
    ```tsx
    /**
     * components/ui/Badge.tsx — 徽标
     * 对齐 gacode-web/src/components/ui/badge.tsx
     */
    import type { HTMLAttributes, ReactNode } from "react";

    export type BadgeVariant = "default" | "secondary" | "destructive" | "success" | "warning" | "outline";

    const variantClass: Record<BadgeVariant, string> = {
      default: "border-transparent bg-brand text-brand-on",
      secondary: "border-transparent bg-bg-elevated text-fg",
      destructive: "border-transparent bg-danger text-white",
      success: "border-transparent bg-success text-brand-on",
      warning: "border-transparent bg-warning text-brand-on",
      outline: "border-border-strong text-fg",
    };

    export interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
      variant?: BadgeVariant;
      children?: ReactNode;
    }

    export function Badge({ variant = "default", className = "", children, ...rest }: BadgeProps) {
      return (
        <div
          className={[
            "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-bg-base",
            variantClass[variant],
            className,
          ].filter(Boolean).join(" ")}
          {...rest}
        >
          {children}
        </div>
      );
    }
    ```
  - 调用点（`Notifications.tsx:237`）：
    ```tsx
    <Badge variant="destructive" className="text-[10px]">
      {unreadCount} 未读
    </Badge>
    ```
  - ⚠️ **冲突类名（F-1）**：PC 无 `twMerge` → Badge 基础串有 `text-xs`，调用点又传 `text-[10px]` → 两个都在 class 列表里，**Tailwind 不保证谁赢**。必须用 `!text-[10px]` 强制：
    ```tsx
    <Badge variant="destructive" className="!text-[10px]">
    ```
    或在 `Badge` 组件内部不写 `text-xs`（让调用点传字号）。**推荐后者**：基础串去掉 `text-xs`，改由调用点传。
  - 数值：`px-2.5`=10px；`py-0.5`=2px；`text-[10px]`=10px；`bg-danger`=`#E54a5e`
  - 交互细节：`focus:ring-2 focus:ring-brand focus:ring-offset-2 focus:ring-offset-bg-base`（PC 的 `ring` token = `#FF6B35` ✅）
  - 预估改动：**30 行**（新组件）+ 3 行（调用点）

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
- **差异判定**：**形态不同**（2 处：缺图标、缺 `isUndeployed` 禁用条件）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Notifications.tsx`
  - 插入锚点：L259-266
  - PC 最终写法：
    ```tsx
    <Button
      variant="ghost"
      size="sm"
      onClick={() => readAllMutation.mutate()}
      disabled={readAllMutation.isPending || unreadCount === 0}
      className="gap-1.5"
    >
      {readAllMutation.isPending ? (
        <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <CheckCheckIcon className="w-3.5 h-3.5" />
      )}
      全部已读
    </Button>
    ```
  - `CheckCheckIcon`（lucide `CheckCheck` = 双勾）：手写 SVG，`stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"`，path：`m3 7 5 5 5-5` / `m9 15 5 5 9-9`（lucide 实际是 `M18 6 7 17l-4-4` + `m22 10-7.5 7.5L8 13`）
  - 数值：`w-3.5 h-3.5`=14px；`gap-1.5`=6px
  - 交互细节：`disabled` 时 `pointer-events-none` + `opacity-50`（PC Button 基础串自带）
  - 预估改动：**10 行**

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
- **差异判定**：**缺失**（web 的**页面顶部常驻卡片**形态，PC 无）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Notifications.tsx`
  - 插入锚点：`{/* Pending-development placeholder */}` 之后、Loading 分支之前（L270-283 区间）
  - PC 等价实现建议（**PC 无法 1:1**，因为浏览器权限三态在 Electron 里不存在 → 见 `S-6`）：
    - **在通知页顶部加一张常驻「桌面通知」状态卡**，用 PC 自己的三态替代 web 的浏览器三态：
      | PC 状态 | 判定依据 | 文案 | 按钮 |
      |---|---|---|---|
      | 未开启 | `!prefs.enabled \|\| !prefs.desktopEnabled` | 「桌面通知未开启」/「AI 回复到达时提醒您」 | 「开启」 |
      | 已开启 | `prefs.enabled && prefs.desktopEnabled` | 「桌面通知已开启」/「AI 回复到达且您不在前台时, 会收到系统通知」 | 「关闭」 |
      | 系统不支持 | `!window.gacode?.notify` | 「系统通知不可用」/「当前环境不支持系统通知」 | 无 |
    - 容器 className：`mb-4 rounded-lg border bg-card text-card-foreground shadow` + 内容 `p-4`
    - 状态来源：`loadNotificationPrefs()` / `saveNotificationPrefs()`（PC `src/lib/api.ts` 已有，`NotificationSettingsSheet` 在用）
    - 需要新增的 props 骨架：
      ```tsx
      interface DesktopNotificationCardProps {
        enabled: boolean;
        desktopEnabled: boolean;
        supported: boolean;
        onEnable: () => void;
        onDisable: () => void;
      }
      ```
  - 交互细节：点击「开启」→ 打开 `NotificationSettingsSheet` 或直接改 pref；点击「关闭」→ `saveNotificationPrefs({ ...prefs, desktopEnabled: false })`
  - 预估改动：**40 行**
  - ⚠️ 本条是「web 特有形态，PC 无法 1:1」 → 同时列入 `S-6`

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
- **差异判定**：**缺失**
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Notifications.tsx`
  - 插入锚点：顶部行之后（C3-05 的卡片之前或之后）
  - PC 最终写法：
    ```tsx
    const isUndeployed = !!error && /401|403/.test(error instanceof Error ? error.message : String(error));
    ...
    {isUndeployed && <PendingBanner />}
    ```
    ```tsx
    function PendingBanner() {
      return (
        <div className="rounded-lg border border-dashed border-warning/50 bg-warning-soft/30">
          <div className="p-6 text-center">
            <div className="text-5xl mb-3">🛎️</div>
            <h2 className="text-base font-semibold text-fg mb-1">通知中心</h2>
            <p className="text-sm text-fg-muted">🚧 待开发 — 后端接口尚未就绪</p>
            <p className="text-xs text-fg-subtle mt-2">
              部署 Worker D 的通知端点后, 这里将显示实时通知列表
            </p>
          </div>
        </div>
      );
    }
    ```
  - 数值：`text-5xl`=48px；`mb-3`=12px；`p-6`=24px；`mb-1`=4px；`mt-2`=8px
  - ⚠️ **事实说明**：服务端 `GET /api/v1/notifications` **已经上线**（`notification.routes.js:343`），这个 banner 只在 401/403 时出现 —— web 端实际上**永远不会显示**它（除非 token 失效）。属于 web 的历史遗留 UI。
  - 预估改动：**25 行**

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
- **差异判定**：**形态不同**（**结构级 → S-7**）
  | 维度 | web | PC |
  |---|---|---|
  | 维度 | 通知**业务类型**（服务端 `type` 列） | 通知**类目**（服务端**没有**这一列） |
  | 取值 | schedule_reminder / cron_result / other | system / chat / library / delivery / all |
  | 呈现 | **页面内分组**，组间 `space-y-6` | **顶部 tab**，切换整个列表 |
  | 服务端支持 | ✅ `type` 是真实列（`schema.prisma:597`） | ❌ `?category=` 被服务端忽略（F-8） |
  | 实际效果 | 3 组分别展示，各带标题 + 数量 | **5 个 tab 返回同一批数据**，图标永远是 default 圆 |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Notifications.tsx`
  - 插入锚点：`<CategoryTabs active={category} onChange={setCategory} />`（L272-274）与 `const items = [...firstPage, ...extraPages];`（L84）
  - PC 最终写法（照抄 web 的分组模型）：
    ```tsx
    import { notificationPresentation, notificationSummary, notificationTarget, NOTIFICATION_GROUP_ORDER, type NotificationKind } from "../lib/notifications";

    const groups = NOTIFICATION_GROUP_ORDER.map((kind) => ({
      kind,
      items: items.filter((n) => notificationPresentation(n).kind === kind),
    })).filter((g) => g.items.length > 0);
    ```
    渲染：
    ```tsx
    {items.length > 0 && (
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
              {g.items.map((n) => (
                <NotificationRow
                  key={n.id}
                  item={n}
                  isRead={!!n.isRead}
                  onClick={() => handleClick(n)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    )}
    ```
  - 需要新增的模块：`D:\gaga\gaclaw-project\gacode-electron\src\lib\notifications.ts`（与 C2-05 / C2-26 同一个新文件），内容照抄 web `gacode-web/src/lib/notifications.ts` 的 `normalizeNotification` / `notificationKind` / `notificationPresentation` / `notificationSummary` / `notificationTarget` / `parseYinianDeepLink` / `isSafeExternalUrl` / `openExternalNotificationUrl` / `NOTIFICATION_GROUP_ORDER`（约 330 行）
  - 需要**删除**：`<CategoryTabs>` 的使用 + `apiCategory()` + `category` state（PC 的 tab 在服务端无效 → 见 F-8）
  - ⚠️ **连带改动（字段名统一 → `isRead`，E10）**：adapter 落地后，PC 的通知对象**统一用 `isRead`**（web 归一后的字段名就是 `isRead`，`gacode-web/src/lib/notifications.ts:75` / `:100`）。因此必须一并改掉 PC 现有的 `read` 映射：
    - `gacode-electron/src/lib/api.ts:343` `NotificationItem.read?: boolean` → `isRead?: boolean`
    - `gacode-electron/src/lib/api.ts:650` `read: n.isRead` → `isRead: n.isRead`
    - 读 `n.read` 的调用点一并改：`gacode-electron/src/routes/Notifications.tsx` 的 `handleClick`（`!n.read` → `!n.isRead`）、`src/components/notifications/NotificationItem.tsx` 的 props（见 C3-09）
    - ⚠️ **不改这一处会照抄出「全部通知恒显未读」**：adapter 归一后的字段是 `isRead`，代码里再读 `n.read` 永远是 `undefined` → `!!undefined` = `false` = 未读
  - 交互细节：分组顺序固定「日程提醒 → 定时任务产出 → 其它」；空组不渲染
  - 预估改动：**40 行**（Notifications.tsx）+ **330 行**（新 lib 文件）
    - ⚠️ **去重（E7）**：`src/lib/notifications.ts` 在 C2-05(9) / C2-26(12) / C3-13(18) / C3-17(~150) / C3-07(330) 里各被计入一次，合计 519 行 —— **实际是同一份 ~330 行的新文件**，排期总量**只算 330 行**（省 ~189 行）

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
- **差异判定**：**缺失**
- **怎么改**：见 C3-07 的渲染代码（已含分组标题）
- 数值：`gap-2`=8px；`mb-2`=8px；`text-sm`=14px；`font-semibold`=600；`text-fg-muted`=`#9ca3af`；计数 `text-xs`=12px `text-fg-subtle`=`#6c757d`；图标 `w-4 h-4`=16px
- 交互细节：无
- 预估改动：**并入 C3-07**

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
- **差异判定**：**形态不同**（5 处）
  | 维度 | web | PC |
  |---|---|---|
  | 圆角 | `rounded-lg`=20px | `rounded-2xl`=24px |
  | 内边距 | `p-3`=12px | `p-4`=16px |
  | 主轴对齐 | `items-start` | `items-stretch`（**竖条会拉满整卡高度**） |
  | 已读底色 | `bg-bg-sunken`=`#0a0a0a` | **无已读态区分**，恒定 `bg-bg-elevated`=`#181818` |
  | 未读底色 | `bg-brand-container/30`（`#4A1F0A` 30%） | 无 |
  | hover | 已读 → `hover:bg-bg-elevated`（变亮）；未读 → `hover:bg-brand-container/40` | 恒定 `hover:bg-bg-sunken`（**变暗**） |
  | 边框 | 已读 `border-border`；未读 `border-brand/30` | 恒定 `border-border` |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\notifications\NotificationItem.tsx`
  - 插入锚点：`NotificationItem` 函数 return 的 `<button className={[...].join(" ")}>`（L45-53）
  - PC 最终 className（**需要新增 `isRead` prop**）：
    ```tsx
    <button
      type="button"
      onClick={onClick}
      data-notif-type={pres.kind}
      data-notif-target={target.href ?? ""}
      data-notif-target-kind={target.kind}
      className={[
        "w-full flex items-start gap-3 p-3 rounded-lg border border-border transition-colors text-left",
        isRead
          ? "bg-bg-sunken hover:bg-bg-elevated"
          : "bg-brand-container/30 hover:bg-brand-container/40 border-brand/30",
      ].join(" ")}
    >
    ```
  - 需要新增的 props：
    ```tsx
    export interface NotificationItemProps {
      item: NotificationData;
      /** 已读态 — 服务端字段是 isRead；adapter 落地后 PC 侧也统一叫 isRead (C3-07 连带改动：lib/api.ts:343 + :650 的 read 一并改掉) */
      isRead: boolean;
      onClick: () => void;
      /** 类型图标 (按 type 走) */
      categoryIcon?: ReactNode;
    }
    ```
  - 数值：`p-3`=12px；`rounded-lg`=20px；`gap-3`=12px；`bg-brand-container/30` = `#4A1F0A` 30%
  - 交互细节：hover 150ms 变色；**未读卡整卡偏暖色**（web 的品牌色提示），已读卡中性
  - 预估改动：**12 行**

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
- **差异判定**：**形态不同**（4 处）
  | 维度 | web | PC |
  |---|---|---|
  | 形状 | **圆点** `w-2 h-2 rounded-full`=8px | **竖条** `w-1`=4px × `self-stretch`（拉满卡高） |
  | 位置 | `pt-1.5`（下压 6px，与图标顶部对齐） | 无偏移 |
  | 已读态 | `bg-transparent`（**保留占位**，宽度不变） | `<span className="w-1 shrink-0" />`（保留 4px 占位 ✅） |
  | 颜色 | 恒定 `bg-brand` | 按 category 变色 |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\notifications\NotificationItem.tsx`
  - 插入锚点：L62-69
  - PC 最终写法：
    ```tsx
    <div className="pt-1.5 shrink-0">
      <div className={["w-2 h-2 rounded-full", isRead ? "bg-transparent" : "bg-brand"].join(" ")} />
    </div>
    ```
  - ⚠️ 删除 `CATEGORY_BAR` 常量（L28-33）—— 它的 category 在服务端不存在（F-8）
  - 数值：`w-2 h-2`=8px；`rounded-full`=9999px；`pt-1.5`=6px
  - 交互细节：无
  - 预估改动：**8 行**

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
- **差异判定**：**形态不同**（2 处）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\notifications\NotificationItem.tsx`
  - 插入锚点：L54-61
  - PC 最终写法：
    ```tsx
    <div className="shrink-0 mt-0.5">
      {categoryIcon}
    </div>
    ```
  - 数值：`mt-0.5`=2px
  - 交互细节：无
  - 预估改动：**4 行**

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
- **差异判定**：**形态不同**（5 处）
  | 维度 | web | PC |
  |---|---|---|
  | 布局 | `items-baseline gap-2`（标题与时间**基线对齐**，时间紧跟标题） | `items-start justify-between gap-3`（时间推到最右） |
  | 标题标签 | `<span>` | `<h3>`（语义不同） |
  | 标题截断 | `truncate`（单行省略号） | `break-all`（逐字断行撑多行） |
  | 时间字号 | `text-[10px]`=10px | `text-xs`=12px |
  | 标题字重 | **恒定** `font-medium`（已读未读都一样） | 仅未读 `font-medium`，已读不加粗 |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\notifications\NotificationItem.tsx`
  - 插入锚点：L70-83
  - PC 最终写法：
    ```tsx
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline gap-2">
        <span
          className={[
            "text-sm font-medium truncate",
            isRead ? "text-fg-muted" : "text-fg",
          ].join(" ")}
        >
          {item.title}
        </span>
        <span className="text-[10px] text-fg-subtle shrink-0">{time}</span>
      </div>
    ```
  - 数值：`gap-2`=8px；`text-[10px]`=10px
  - 交互细节：无
  - 预估改动：**8 行**

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
- **差异判定**：**形态不同**（3 类边界）
  | 场景 | web（date-fns zhCN） | PC（手写 floor） |
  |---|---|---|
  | < 30 秒 | 「不到 30 秒」 | 「刚刚」 |
  | 30~59 秒 | 「不到 1 分钟」 | 「刚刚」 |
  | 90 秒 | 「2 分钟前」（date-fns 取整到最近） | 「1 分钟前」（floor） |
  | 90 分钟 | 「2 小时前」 | 「1 小时前」 |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\lib\notifications.ts`（与 C2-05 / C3-07 同一个新文件）
  - 插入锚点：新文件
  - PC 最终实现（**两种落法都可用**：PC 仓**已装** `date-fns@^4.4.0`，可以直接复用；也可以手写对齐 date-fns zhCN 的取整规则 —— 下面给手写版，字符串与 date-fns 逐字一致）：
    ```ts
    /**
     * 相对时间 — 对齐 date-fns formatDistanceToNow(zhCN, addSuffix:true) 的口径.
     * date-fns 取整到"最近"档, 不是 floor.
     * ⚠️ PC 仓已装 date-fns ^4.4.0 (src/components/chat/MessageBubble.tsx:31-32 已在用
     *    formatDistanceToNow + zhCN) —— 也可以直接:
     *    formatDistanceToNow(new Date(iso), { addSuffix: true, locale: zhCN })
     *    手写版的价值是: 通知列表与聊天流用同一口径, 且不必再引一次 locale.
     */
    export function formatRelativeTime(iso: string): string {
      const t = Date.parse(iso);
      if (Number.isNaN(t)) return "-";
      const diff = Date.now() - t;
      const sec = Math.round(diff / 1000);
      if (sec < 30) return "不到 30 秒";
      const min = Math.round(sec / 60);
      if (min < 1) return "不到 1 分钟";
      if (min < 60) return `${min} 分钟前`;
      const hr = Math.round(min / 60);
      if (hr < 24) return `${hr} 小时前`;
      const day = Math.round(hr / 24);
      if (day < 30) return `${day} 天前`;
      const month = Math.round(day / 30);
      if (month < 12) return `${month} 个月前`;
      return `${Math.round(month / 12)} 年前`;
    }
    ```
  - 调用点：`NotificationItem.tsx` 的 `{formatRelative(item.createdAt)}` → `{formatRelativeTime(item.createdAt)}`
  - 交互细节：无
  - 预估改动：**18 行**
  - ✅ **精确文案不用再实测（E8/E9）**：date-fns `zhCN` 的具体措辞（「不到 30 秒」等）来自 `date-fns/locale/zh-CN` 的 `formatDistance` 实现。PC **已装** `date-fns@^4.4.0`（`gacode-electron/package.json:20`，`src/components/chat/MessageBubble.tsx:31-32` 已在用 `formatDistanceToNow` + `zhCN`），且 **v3.6.0 与 v4.4.0 的 `locale/zh-CN/_lib/formatDistance.js` 字符串完全相同、核心取整逻辑也完全相同（都是 `Math.round`）** ⇒ 上面抄的字符串就是 date-fns 的真实输出，**不需要真机校准**

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
- **差异判定**：**形态不同**（3 处）
  | 维度 | web | PC |
  |---|---|---|
  | 挂载条件 | 仅 2 种已知类型（`kind !== "other"`） | `item.type` truthy（等价于同样 2 种） ✅ |
  | 文案 | 中文本地化（「日程提醒」/「定时任务产出」） | **原始英文**（`schedule_reminder`） |
  | 样式 | `text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-fg-subtle shrink-0` | `inline-block text-xs px-1.5 py-0.5 rounded bg-bg-sunken text-fg-subtle` |
  | 字号 | `text-[10px]`=10px | `text-xs`=12px |
  | 底色 | `bg-bg-elevated`=`#181818` | `bg-bg-sunken`=`#0a0a0a` |
  | `shrink-0` | 有 | **无** |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\notifications\NotificationItem.tsx`
  - 插入锚点：L89-94
  - PC 最终写法：
    ```tsx
    {pres.kind !== "other" && (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-bg-elevated text-fg-subtle shrink-0">
        {pres.label}
      </span>
    )}
    ```
  - `pres` 来自 `notificationPresentation(item)`（C3-07 的新 lib 文件）
  - 数值：`text-[10px]`=10px；`px-1.5`=6px；`py-0.5`=2px
  - 交互细节：无
  - 预估改动：**4 行**

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
- **差异判定**：**缺失**
  - ⚠️ **实际后果**（服务端事实 F-9）：`schedule_reminder` 的 `body = schedule.note || null` → **日程没写备注时 body 为 null**；`cron_result` 的 `body = truncateForNotification(output) || null` → **cron 无产出时 body 为 null**。→ PC 上这类通知**只有标题，没有副文案**；web 会显示「日程到点了」/「定时任务已产出结果」。
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\notifications\NotificationItem.tsx`
  - 插入锚点：L84-88
  - PC 最终写法：
    ```tsx
    {summary && (
      <p className="text-xs text-fg-muted line-clamp-2">
        {summary}
      </p>
    )}
    ```
    + `const summary = notificationSummary(item);`（来自 C3-07 的新 lib）
  - 交互细节：无
  - 预估改动：**4 行**（+ lib 文件里的 `notificationSummary`，见 C3-07）

---

### C3-16 · 摘要 className 多 `break-all`

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:419` → `className="text-xs text-fg-muted line-clamp-2"`
- **PC 端**：`gacode-electron/src/components/notifications/NotificationItem.tsx:85` → `className="text-xs text-fg-muted line-clamp-2 break-all"`
- **差异判定**：**形态不同**（1 处：`break-all` 让摘要**逐字断行**，中文正文会在任意字符处断开，不符合正常折行）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\notifications\NotificationItem.tsx`
  - 插入锚点：L85
  - PC 最终 className：`text-xs text-fg-muted line-clamp-2`
  - 交互细节：`line-clamp-2` = 最多 2 行后省略号（`overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical`）
  - 预估改动：**1 行**

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
- **差异判定**：**形态不同（数据通路 · 高优先级）** —— 对照服务端实际取值（F-9）：
  | 服务端通知 | actionType / actionValue | web 点击结果 | PC 点击结果 |
  |---|---|---|---|
  | 日程提醒 | `'none'` / 无 | ✅ 跳 `/schedule/schedule/{id}/?reminderId=&fireAt=`（靠 payload.scheduleId） | ❌ **无反应**（`if (!at \|\| !av) return;` 直接返回） |
  | 定时任务产出 | `'deep_link'` / `yinian://chat/{sid}` | ✅ 跳 `/chat/{sid}` | ❌ **`window.open("yinian://chat/123")`** → 尝试唤起外部协议，浏览器/Electron 里**打不开**，等于点了没反应 |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Notifications.tsx`
  - 插入锚点：`handleClick`（L207-228）
  - PC 最终写法：
    ```tsx
    const handleClick = (n: NotificationItem) => {
      if (!n.isRead && pendingId !== n.id) { readOneMutation.mutate(n.id); }
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
      navigate(target.href);
    };
    ```
  - 需要新增的 lib（C3-07 的新文件 `src/lib/notifications.ts`）：`notificationTarget` / `parseYinianDeepLink` / `scheduleTarget` / `chatTarget` / `isSafeExternalUrl` / `openExternalNotificationUrl`
  - ⚠️ **PC 的日程详情路由 —— 已核实：PC 端根本没有 `/schedule` 路由**。`gacode-electron/src/App.tsx:99-212` 的路由表只有 `/login` `/register` `/qr-login` `/` `/chat` `/chat/:id` `/library` `/library/:id` `/deliveries` `/deliveries/:id` `/notifications` `/profile` `/profile/edit` `/profile/change-password` `/profile/apps` `/browser`，**没有 schedule**；落到 `path="*"` 会被 `Navigate to="/"` 兜回首页。
    - → 即便把 `scheduleTarget()` 照抄过来，PC 点击日程提醒也只会跳回首页。**「点日程提醒跳日程详情」在 PC 上目前无处可落**，属信息架构缺口 → 见 `S-12`。
    - 短期兜底：PC 的 `scheduleTarget()` 应返回 `kind: "none"` + `rawLink`（复用 web 的「无法识别的链接」提示），或 PC 补一个最小 `/schedule/:id` 路由。
  - 交互细节：点击 → 先乐观标已读（PC 已有 `onMutate` 乐观更新 ✅）→ 再跳转
  - 预估改动：**12 行**（Notifications.tsx）+ **约 150 行**（lib 文件）
    - ⚠️ **去重（E7）**：这 150 行是 C3-07 的同一个新文件 `src/lib/notifications.ts`（`notificationTarget` / `parseYinianDeepLink` / `scheduleTarget` / `chatTarget` / `isSafeExternalUrl` / `openExternalNotificationUrl`），**排期总量只算一次 330 行**，本条不再单独计入

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
- **差异判定**：**缺失**（安全缺口）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\lib\notifications.ts`（新文件，见 C3-07）
  - PC 最终代码：照抄 web 的 `isSafeExternalUrl` + `openExternalNotificationUrl`
  - 调用点：`handleClick` 改用 `openExternalNotificationUrl`（见 C3-17）
  - 交互细节：被白名单拦下 → toast「无法打开链接」+ description = 原始 url
  - 预估改动：**并入 C3-17**

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
- **差异判定**：**缺失**
- **怎么改**：见 C3-17 的 `handleClick`（已含该分支）
- 交互细节：toast `variant="warning"`
- 预估改动：**并入 C3-17**

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
- **差异判定**：**形态不同**（web 无 / PC 有，但**功能不成立**）
  - 服务端事实（F-8）：`GET /notifications` **不认 `?cursor=`**，响应**没有 `nextCursor`** → PC 的 `setNextCursor(res.nextCursor ?? null)` 永远得到 `null` → `hasMore = !!nextCursor` 恒为 `false` → **`loadMore` 永不触发**，列表底部恒显「没有更多了」
  - 也就是说 PC 现在**只有 50 条**（服务端 `take: 50` 硬上限），第 51 条起**永远看不到**，且 UI 骗用户说「没有更多了」
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Notifications.tsx`
  - 插入锚点：`useQuery`（L63-71）、`extraPages` / `nextCursor` state（L74-75）、`loadMore`（L187-205）、`<InfiniteScrollList ...>`（L287-303）
  - PC 最终写法（1:1 还原 web = 去掉分页）：
    ```tsx
    const { data, isLoading, error, refetch } = useQuery({
      queryKey: ["notifications", { unread: false }],
      queryFn: () => listNotifications(false),
      retry: false,
      refetchInterval: NOTIFICATION_POLL_MS,
      refetchIntervalInBackground: false,
    });
    const items: NotificationItem[] = data?.notifications ?? [];
    ```
    并删除 `extraPages` / `nextCursor` / `loadingMore` state、`loadMore`、`<InfiniteScrollList>` 包裹
  - 数值：`NOTIFICATION_POLL_MS` = 45000ms（见 C2-26）
  - 交互细节：web 列表 45s 自动刷新（`refetchIntervalInBackground: false` → 切到别的标签页/窗口时不轮询）
  - 预估改动：**-30 行**（删分页逻辑）
  - ⚠️ 若要**保留**分页能力（PC 增强），必须**先让服务端支持** `?cursor=` + 返回 `nextCursor` —— 属服务端改造，不在本 PC 前端范围内

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
- **差异判定**：**形态不同**（7 处）
  | 维度 | web | PC |
  |---|---|---|
  | 容器 | `<Card>` = `rounded-lg border bg-card text-card-foreground shadow` | `rounded-2xl border border-border bg-bg-elevated`（**无 shadow**） |
  | 外层 | 无 | `h-full flex items-center justify-center`（垂直居中） |
  | 内边距 | `p-10`=40px | `p-12`=48px |
  | 图标 | **emoji** `📭`（`text-5xl`=48px） | SVG `BellIcon`（`w-12 h-12`=48px） |
  | 标题 | `<div className="text-base font-medium mb-1 text-fg">暂无通知</div>` | `<p className="text-base font-medium">还没有通知</p>`（**缺 `text-fg`** → 继承 body 主色，等价 ✅；**缺 `mb-1`**） |
  | 副文案 | `<div className="text-sm">新消息会在此处通知你</div>`（继承 `text-fg-muted`） | `<p className="text-sm text-fg-muted mt-2">系统通知和消息提醒会出现在这里</p>`（`mt-2` vs web 的 `mb-1`） |
  | 文案 | 「暂无通知」/「新消息会在此处通知你」 | 「还没有通知」/「系统通知和消息提醒会出现在这里」 |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Notifications.tsx`
  - 插入锚点：`EmptyState` 函数（L342-359）
  - PC 最终写法：
    ```tsx
    function EmptyState() {
      return (
        <div className="rounded-lg border bg-card text-card-foreground shadow">
          <div className="p-10 text-center text-fg-muted">
            <div className="text-5xl mb-4">📭</div>
            <div className="text-base font-medium mb-1 text-fg">暂无通知</div>
            <div className="text-sm">新消息会在此处通知你</div>
          </div>
        </div>
      );
    }
    ```
  - ⚠️ `bg-card` 的色值依赖 `C1-03b` 的 token 改动（PC 现在是 `#0a0a0a`，web 是 `#141414`）
  - ⚠️ **`EmptyState` 的 `category` prop 要删**（C3-07 去掉 tab 后没有分类概念）
  - 数值：`p-10`=40px；`text-5xl`=48px；`mb-4`=16px；`mb-1`=4px；`text-sm`=14px
  - 交互细节：无
  - 预估改动：**8 行**

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
- **差异判定**：**形态不同**（5 处）
  | 维度 | web | PC |
  |---|---|---|
  | 骨架条数 | 3 | 3 ✅ |
  | 每条高度 | `h-20`=80px（**单块**，无内部结构） | 由内容撑高（`p-4` + 4px + 3px 两行 ≈ 47px） |
  | 圆角 | `rounded-lg`=20px | `rounded-2xl`=24px |
  | 底色 | `bg-muted`=`#181818` | `bg-bg-elevated`=`#181818` ✅ |
  | 内部结构 | **无**（单块） | 有 2 条内部骨架线（标题线 + 副标题线） |
  | 容器间距 | `space-y-3`=12px | `space-y-2`=8px |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Notifications.tsx`
  - 插入锚点：`SkeletonList` 函数（L361-375）
  - PC 最终写法：
    ```tsx
    function SkeletonList() {
      return (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 w-full rounded-lg animate-pulse bg-bg-elevated" />
          ))}
        </div>
      );
    }
    ```
  - 数值：`h-20`=80px；`rounded-lg`=20px；`space-y-3`=12px；`bg-bg-elevated`=`#181818`
  - 交互细节：`animate-pulse` = 2s 循环
  - 预估改动：**6 行**

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
- **差异判定**：**缺失**
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\notifications\NotificationItem.tsx`
  - 插入锚点：`<button type="button" onClick={onClick} ...>`（L45-53）
  - PC 最终写法：
    ```tsx
    <button
      type="button"
      onClick={onClick}
      data-notif-type={pres.kind}
      data-notif-target={target.href ?? ""}
      data-notif-target-kind={target.kind}
      className={...}
    >
    ```
  - 交互细节：无（自动化测试锚点）
  - 预估改动：**3 行**

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
- **差异判定**：**形态不同**（web 的 1 个开关 vs PC 的 5 个开关 + 测试；入口位置：页面顶部卡片 vs 右上齿轮弹窗；控件：web 用 Button，PC 用原生 checkbox + 自绘开关）
  - **语义层面的等价**：web 的「浏览器通知开关」≡ PC 的「桌面通知开关」；web 的开关关闭 = PC 的 `desktopEnabled=false` → 两者**功能对齐** ✅
  - PC 多出来的「总开关 / 应用内提示 / 按类目屏蔽 / 测试通知」= PC 增强 → 按 gaga 指示不列
- **怎么改**（1:1 对齐 web 的**形态**）：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\notifications\NotificationSettingsSheet.tsx`
  - 插入锚点：`<BottomSheet open={open} title="通知设置" onClose={onClose}>`（L103）
  - PC 等价实现：**保持 PC 的 `NotificationSettingsSheet` 不动**（PC 增强），改为**在通知页顶部补一张常驻状态卡**（见 C3-05）—— 这样两端都有「页面顶部能看到当前通知开关状态 + 一键开关」的形态
  - 交互细节：见 C3-05
  - 预估改动：**并入 C3-05**
  - ⚠️ 「PC 的类目屏蔽」依赖服务端 `category`（**不存在**，F-8）→ 这 4 个类目开关**实际不起作用**（`NotificationPrefs.categories` 里的 key 跟服务端字段对不上）。这是 PC 侧功能缺陷，不是差异条目，列在「高价值发现」。

---

### 组 3 小结

| 编号 | 判定 | 预估改动 |
|---|---|---|
| C3-01 | 形态不同 | 8 行 |
| C3-02 | 形态不同 | 12 行 |
| C3-03 | 形态不同 | 33 行 |
| C3-04 | 形态不同 | 10 行 |
| C3-05 | 缺失 | 40 行 |
| C3-06 | 缺失 | 25 行 |
| C3-07 | 形态不同（结构级 → S-7） | 370 行 |
| C3-08 | 缺失 | 并入 C3-07 |
| C3-09 | 形态不同 | 12 行 |
| C3-10 | 形态不同 | 8 行 |
| C3-11 | 形态不同 | 4 行 |
| C3-12 | 形态不同 | 8 行 |
| C3-13 | 形态不同 | 18 行 |
| C3-14 | 形态不同 | 4 行 |
| C3-15 | 缺失 | 4 行 |
| C3-16 | 形态不同 | 1 行 |
| C3-17 | 形态不同（数据通路） | 162 行 |
| C3-18 | 缺失 | 并入 C3-17 |
| C3-19 | 缺失 | 并入 C3-17 |
| C3-20 | 形态不同 | -30 行 |
| C3-21 | 形态不同 | 8 行 |
| C3-22 | 形态不同 | 6 行 |
| C3-23 | 缺失 | 3 行 |
| C3-24 | 形态不同 | 并入 C3-05 |

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
| ⑤ **后台 / 关窗** | 页签隐藏 → 弹浏览器系统通知（30s 自动 close，`webNotifications.ts:224-233`）；关掉页签 → **收不到**（SSE 随页面销毁；`notification-stream.ts:335` 的 `lastEventId` 是**模块内内存变量**，刷新/关页签即丢 ⇒ 服务端不补发） | 窗口最小化 / 后台 → **仍然弹 Toast**（主进程弹，不看 renderer 可见性）；**关窗 = 隐藏到托盘**（`electron/main.ts:258-266` `e.preventDefault(); mainWindow.hide();`）⇒ 进程**不死**、renderer 不卸载、SSE **不断** ⇒ **关窗期间不丢**；只有托盘「退出」真结束进程时才断（且客户端**没实现续传**，见 C4-06 / S-8） | 服务端 per-user buffer 保留最近 200 条；`replayMissedEvents(userId, reply, lastEventId)` 补发（`notification.routes.js:242-247`）—— **须带 `Last-Event-ID` 才补发**（`notification.service.js:225-229` `if (!lastEventId) return 0;`） |
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
- **差异判定**：**缺失** —— 但**属于 web 特有，PC 无法 1:1**（见 4.1）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Notifications.tsx`
  - 插入锚点：顶部行之后（C3-05 的位置）
  - PC 等价实现：**在通知页顶部加一张常驻「桌面通知」状态卡**（见 C3-05 的 props 骨架），首次进入时若 `prefs.desktopEnabled === false` 显示引导文案 + 「开启」按钮（直接改 pref，不调任何系统 API）
  - 交互细节：无
  - 预估改动：**并入 C3-05**

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
- **差异判定**：**缺失** —— **web 特有**（依赖浏览器权限模型），PC 无法 1:1
- **怎么改**：
  - PC 等价实现：**不做自动弹窗**。Electron 应用不该在用户没主动触发时弹模态框；web 的这条设计本身就是浏览器特有的（浏览器不弹用户就永远不知道有这功能）。
  - 若 gaga 仍要 PC 有首次引导，等价做法：在通知页顶部常驻卡（C3-05）里，**当 `prefs.desktopEnabled === false` 且从未引导过**时显示引导文案；冷却用 localStorage `gacode-notif-first-run-prompt-at` + 7 天（抄 web 的 `LAST_PROMPT_KEY` 逻辑）。**推荐不做**。
  - 预估改动：**0 行**（推荐不做）/ 30 行（若做）

---

### C4-03 · 通知中心的「开启 / 关闭 / 重新开启」按钮：PC 缺失（形态）

- **web 端**：`gacode-web/src/app/(main)/notifications/page.tsx:499-541`（`granted && !enabled` → 「重新开启」；`granted && enabled` → 「关闭」）、`:543-565`（default → 「开启」）；每个按钮带 `data-testid`（`web-notif-reenable` / `web-notif-disable` / `web-notif-enable`）
- **PC 端**：PC 的等价物在**齿轮弹窗**里（`NotificationSettingsSheet` 的「桌面通知」`ToggleRow`），**通知页本身没有一键开关按钮**
- **差异判定**：**形态不同**（设置入口位置：页面顶部常驻卡 vs 齿轮弹窗内）
- **怎么改**：见 C3-05 / C3-24 —— 在通知页顶部加常驻状态卡 + 「开启」/「关闭」按钮，PC 等价于 web 的「一键开关」
- 预估改动：**并入 C3-05**

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
- **差异判定**：**形态不同（数据通路）**
  | 维度 | web | PC |
  |---|---|---|
  | 传输 | `fetch` + `ReadableStream` 手写 SSE 帧解析（`SseFrameParser` 类） | `EventSource` 原生 |
  | 认证 | `Authorization: Bearer` **请求头** | `?token=` **query** |
  | token 落 URL | **否** | **是**（会进 nginx access log / 代理日志） |
  | 帧解析 | 自研增量状态机（`SseFrameParser.push()`） | 浏览器原生 |
- **服务端事实**：`notification.routes.js:225` `onRequest: [fastify.requireAuth]` —— `requireAuth` **只读 Authorization 头**。PC 的 `?token=` 能否通过认证，取决于 unified-api 的 auth 插件是否为 SSE 端点开了 query fallback。**web 端注释（`notification-stream.ts:19-21`）明确指出 query fallback 是 `auth.js:21` 给 SSE 端点开的特例**，会把 token 写进 URL。
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\lib\notifications-sse.ts`
  - 插入锚点：`buildUrl`（L76-81）与 `schedule()` 里的 `new EventSource(url, ...)`（L166）
  - PC 最终写法（对齐 web，改用 fetch + Bearer 头）：
    ```ts
    // 1) 拿 token
    const tok = overrideToken ?? getAccessTokenForSse();
    // 2) fetch + ReadableStream
    const controller = new AbortController();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${tok}`,
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    };
    if (lastEventId) headers["Last-Event-ID"] = lastEventId;
    const res = await fetch(`${API_BASE}/notifications/stream`, {
      method: "GET", headers, signal: controller.signal, cache: "no-store",
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const parser = new SseFrameParser();
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
        if (frame.id) lastEventId = frame.id;
        const ev = parseNotificationEvent(frame.data);
        if (ev.type === "notification" && ev.notification) handleIncoming(ev.notification);
      }
    }
    ```
  - 需要新增：`SseFrameParser` 类 + `parseSseFrame` + `parseNotificationEvent`（照抄 web `gacode-web/src/lib/notification-stream.ts:59-135`）
  - 代价：PC 现有 `EventSource` 的自动重连 / `readyState` 语义要自己补（web 的 `createNotificationStream` 已经实现，见 C4-06）
  - 交互细节：无
  - 预估改动：**120 行**（PC 端重写 SSE 客户端）
  - ⚠️ 若 gaga 认为「token 落 URL」可接受（Electron 本地应用不走 nginx），可**不做**这条 —— 见 `S-9`

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
- **差异判定**：**缺失**（PC 不需要）+ **web 侧的实现依据已过时**
- **怎么改**：
  - PC **无需改**（Electron 单窗口）。
  - **但 web 端该改**（不在本 PC 清单范围，单独记录）：
    - `gacode-web/src/lib/notification-stream.ts:137-298` 的租约机制可以整块删掉，`createNotificationStream` 直接连即可 —— 多标签页各自连一条，服务端会把通知推给**每一条**（符合 2026-10-23 的设计）。
    - 删掉后 follower 的「靠轮询兜底」逻辑也可以简化。
    - ⚠️ 这条属于 **web 端技术债**，不在本「PC 对齐 web」清单的改动范围内，**记录待 gaga 决定是否单独立项**。
  - 预估改动（PC）：**0 行**

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
- **差异判定**：**形态不同**（2 处：401 策略、**续传能力缺失**）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\lib\notifications-sse.ts`
  - 插入锚点：`schedule()` 函数（L154-233）与 `handleIncoming`（L116-152）
  - PC 最终写法（对齐 web）：
    ```ts
    // 1) 记录最近一次事件 id
    let lastEventId: string | null = null;
    // 2) handleIncoming 里解析 id
    const handleIncoming = (raw: string, id: string | null) => {
      if (id) lastEventId = id;
      ...
    };
    // 3) 建连时带续传头 (若改用 fetch，见 C4-04)
    if (lastEventId) headers["Last-Event-ID"] = lastEventId;
    ```
  - ⚠️ 用 `EventSource` **无法带自定义头** → 要用 `Last-Event-ID` **必须**先做 C4-04（改 fetch）。**C4-04 与 C4-06 必须一起做**
  - 交互细节：服务端 buffer 保留最近 200 条（`notification.service.js`），补发的是 `lastEventId` 之后的数据
  - 预估改动：**20 行**（并入 C4-04）

---

### C4-07 · SSE 看门狗（60s 无事件即重连）

- **web 端**：**无看门狗**。web 靠 `reader.read()` 的 Promise 在连接被代理卡住时**永久挂起**（不触发重连）—— 这是 web 的一个已知薄弱点
- **PC 端**：`gacode-electron/src/lib/notifications-sse.ts:33` `HEARTBEAT_TIMEOUT_MS = 60_000` + `:89-114` `armWatchdog()`（每 10s 检查一次，60s 无事件 → `current.close()` + 100ms 后 `schedule()`）
- **差异判定**：**形态不同**（PC 有 / web 无）→ **PC 增强**，按 gaga 指示**不列**
  - 仅记录事实：web 端在代理卡连接时会「静默失联」（列表靠 45s 轮询兜底，所以用户看不出）
- 预估改动：**0 行**

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
- **差异判定**：**缺失** —— **web 特有能力**（依赖 web 的 `useChatStore` + `finishedAt` 字段；PC 的聊天流实现不同，需先确认 PC 有没有等价的「AI 回复终态」信号）
- **怎么改**：
  - **前置待核**：PC 的聊天 SSE 在 AI 回复结束时**有没有**可订阅的终态信号？（web 是 `message.finishedAt` 从 null 变非 null；PC 端 `src/lib/api.ts:322-336` 的 `ChatMessage` **没有 `finishedAt` 字段**）→ **待核**（需读 PC 的 chat SSE 收尾逻辑）
  - 若 PC 有等价信号，1:1 实现：
    1. 在 PC 的聊天流收尾处广播一个事件：`window.dispatchEvent(new CustomEvent("gacode:chat-terminal", { detail: { chatId, content } }))`
    2. 新增 `src/lib/chat-notifications.ts`：
       ```ts
       /** AI 回复终态 → 系统通知（仅窗口不在前台时） */
       export function startChatTerminalNotifier(opts: {
         getTitle: (chatId: string) => string;
         onNotify: (chatId: string, title: string, body: string) => void;
         isHidden: () => boolean;
       }): () => void
       ```
    3. `body` 构造照抄 web：剥 `<thinking>...</thinking>` → 截断 100 字 → 空则「AI 回复了您」
    4. 触发条件：`isHidden()`（PC 等价实现见 4.1：主进程 `isMinimized() || !isFocused()`）+ `prefs.desktopEnabled`
  - 数值：body 截断 100 字；`tag` 概念在 Electron 无对应
  - 预估改动：**80 行**（含主进程窗口状态桥）

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
- **差异判定**：**形态不同**
  | 场景 | web | PC |
  |---|---|---|
  | 用户正看着通知页，收到一条通知 | 只刷新列表（+ 未读角标），**不弹系统通知** | **弹 Windows Toast + 应用内 toast** |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\lib\notifications-sse.ts`
  - 插入锚点：`handleIncoming` 里的 `window.gacode?.notificationSSESend?.({...})`（L132-143）
  - PC 最终写法：
    ```ts
    // ② 推主进程弹 Windows Toast —— 仅当窗口不在前台
    if (!isWindowFocused()) {
      try {
        window.gacode?.notificationSSESend?.({ title: n.title, body: n.body || "" });
      } catch (err) {
        console.warn("[gacode-sse] window.gacode.notificationSSESend failed", err);
      }
    }
    ```
  - `isWindowFocused()`：需在 preload 暴露（见 C4-08 的主进程桥）：
    ```ts
    // electron/main.ts
    ipcMain.handle('gacode:is-focused', () => !mainWindow.isMinimized() && mainWindow.isFocused());
    // electron/preload.ts
    isWindowFocused: (): Promise<boolean> => ipcRenderer.invoke('gacode:is-focused'),
    ```
  - ⚠️ **不要**用 renderer 的 `document.hidden` —— Electron 窗口最小化时 `document.visibilityState` 仍可能是 `visible`
  - 交互细节：窗口在前台时只更新列表与角标，不弹任何通知
  - 预估改动：**25 行**（主进程 + preload + renderer）

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
- **差异判定**：**形态不同** —— **实际后果**：`schedule_reminder` 的 `body = schedule.note || null`（F-9）→ **日程没写备注时 body 为空** → PC 主进程**直接丢弃这条通知，用户完全收不到**；web 侧同一场景走 `notificationSummary(n)` 的按 type 兜底 → 显示「**日程到点了**」
  - ⚠️ **修正（2026-10-26 复核 · E11）**：原稿写「web 会显示『您有一条新消息』（站内通知场景）或『日程到点了』（通知中心摘要，C3-15）」—— **文案归属标错**：「您有一条新消息」属 `showChatNotification`（聊天 AI 回复到达）；站内通知路径用的是 `notificationSummary()` 的按 type 兜底（日程 →「日程到点了」/ 定时任务 →「定时任务已产出结果」/ 其它 →「你有一条新通知」）；通用 `showSiteNotification`（`:196`）本身**没有** body 兜底
  - ✅ 结论保留：**PC 丢弃空 body 通知是缺陷**；PC 侧更贴 web 站内口径的兜底是 `notificationSummary()` 的**按 type 兜底**，不是「您有一条新消息」
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\lib\notifications-sse.ts`
  - 插入锚点：`handleIncoming` 里的 `window.gacode?.notificationSSESend?.({ title: n.title, body: n.body || "" })`（L132-143）
  - PC 最终写法（**兜底跟 web 站内口径一致 —— 用 `notificationSummary()` 的按 type 兜底**）：
    ```ts
    window.gacode?.notificationSSESend?.({
      title: n.title || "新通知",
      // 兜底跟 web 站内通知同口径: 有 body 用 body, 没 body 按 type 给占位
      // (日程到点了 / 定时任务已产出结果 / 你有一条新通知) —— notificationSummary() 永不返回空串
      body: (n.body || "").slice(0, 100) || notificationSummary(normalizeNotification(n)),
    });
    ```
    - `normalizeNotification()` / `notificationSummary()` 来自 C3-07 的新 adapter 文件 `src/lib/notifications.ts`（**依赖 C3-07 落地**；SSE 推来的 `n` 是服务端原始行，要先归一）
    - 若 C3-07 还没做，可先按 kind 硬兜底：「日程到点了」/「定时任务已产出结果」/「你有一条新通知」
  - 数值：正文截断 100 字
  - 交互细节：无
  - 预估改动：**3 行**

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
- **差异判定**：**缺失**
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\electron\notifications.ts`
  - 插入锚点：`registerNotificationIpc()` 里 `ipcMain.handle('gacode:notify', ...)`（L37-63）与 `ipcMain.on('gacode:notification-sse-event', ...)`（L67-98）
  - 需要新增的 IPC：
    ```ts
    // electron/main.ts
    ipcMain.handle('gacode:notification-click', (_e, args: { target: string }) => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      win.webContents.send('gacode:navigate', args.target);   // renderer 侧跳路由
    });
    ```
    ```ts
    // electron/preload.ts
    onNotificationClick: (callback: (target: string) => void): (() => void) => {
      const h = (_e: unknown, target: string) => callback(target);
      ipcRenderer.on('gacode:navigate', h);
      return () => ipcRenderer.removeListener('gacode:navigate', h);
    },
    ```
    ```ts
    // electron/notifications.ts —— 两处 new Notification 都要挂 click
    const n = new Notification({ title, body, silent: false });
    n.on('click', () => {
      n.close();
      ipcMain.emit('gacode:notification-clicked', target);   // 或直接调上面的 handler
    });
    n.show();
    ```
  - `target` 的取值：跟 web 一致 —— 会话 `/chat/{id}`、日程 `/schedule/...`、外链 URL（外链走 `shell.openExternal`）
  - 需要在 SSE 桥里把「跳转目标」一起传给主进程：`notificationSSESend({ title, body, target })`（web 的 `notificationTarget()` 已经算出 `target.href`，见 C3-17 的新 lib）
  - 交互细节：点击 → 恢复窗口（`restore()`）→ 聚焦（`focus()`）→ renderer 跳路由
  - 预估改动：**60 行**（主进程 + preload + SSE 桥传参）

---

### C4-12 · 系统通知 `tag` 合并：PC 缺失

- **web 端**：`gacode-web/src/lib/webNotifications.ts:152` → `tag: \`chat-${opts.chatId}\``；`:198` → `tag: opts.tag`；站内通知用 `tag: \`notification-${n.id}\``（`WebNotificationWatcher.tsx:120`）
  → 浏览器按 `tag` 自动合并同 tag 的多条通知，只留最新
- **PC 端**：Electron `Notification` **没有 `tag` 参数**（`electron/notifications.ts:52` 只传 `title/body/silent`）
- **差异判定**：**缺失** —— **web 特有**（浏览器 API 能力）
- **怎么改**：
  - PC 等价实现：Electron 无原生 tag，需**自己做去重**：在 renderer 侧维护「最近 N 秒内同 target 的通知只弹最后一条」的队列。
  - 骨架（放在 `src/lib/notifications-sse.ts`）：
    ```ts
    /** 同 target 去重窗口 (ms) — 模拟浏览器 Notification.tag 的合并语义 */
    const TAG_MERGE_WINDOW_MS = 5_000;
    const recentTargets = new Map<string, number>();
    function shouldNotify(target: string): boolean {
      const now = Date.now();
      const last = recentTargets.get(target) ?? 0;
      if (now - last < TAG_MERGE_WINDOW_MS) return false;
      recentTargets.set(target, now);
      return true;
    }
    ```
  - ⚠️ 对 PC 来说这是 **PC 增强方向**（web 有、PC 无 → 但 PC 无从 1:1 抄）→ 建议**不做**，列入 `S-9` 供 gaga 定
  - 预估改动：**0 行**（推荐不做）

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
- **差异判定**：**形态不同** —— PC 的「桌面通知」开关**关不掉 SSE 触发的 Toast**
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\lib\notifications-sse.ts`
  - 插入锚点：`handleIncoming` 里的 `window.gacode?.notificationSSESend?.({...})`（L132-143）
  - 需要新增的 import：`import { loadNotificationPrefs } from "./api";`
  - PC 最终写法：
    ```ts
    // ② 推主进程弹 Windows Toast —— 受「启用通知」+「桌面通知」两个开关约束
    const prefs = loadNotificationPrefs();
    if (prefs.enabled && prefs.desktopEnabled && !isWindowFocused()) {
      try {
        window.gacode?.notificationSSESend?.({
          title: n.title || "新通知",
          body: (n.body || "").slice(0, 100) || "您有一条新消息",
        });
      } catch (err) {
        console.warn("[gacode-sse] window.gacode.notificationSSESend failed", err);
      }
    }
    ```
  - 交互细节：开关是**硬前置条件**，与 web 的 `showSiteNotification` 语义一致
  - 预估改动：**8 行**

---

### C4-14 · 通知列表轮询间隔与页面覆盖：PC 不一致

- **web 端**：
  - 通知页（`gacode-web/src/app/(main)/notifications/page.tsx:146-154`）：`refetchInterval: NOTIFICATION_POLL_MS`（**45s**）+ `refetchIntervalInBackground: false`
  - Profile 页（`gacode-web/src/app/(main)/profile/page.tsx:142-149`）：同一个 45s + `staleTime: 30 * 1000`
- **PC 端**：
  - AppShell 角标（`gacode-electron/src/components/layout/AppShell.tsx:136-140`）：`refetchInterval: 30_000`（**30s** 硬编码）
  - **通知页自身**（`gacode-electron/src/routes/Notifications.tsx:63-71`）：**没有 `refetchInterval`** → 列表**只靠 SSE invalidate 刷新**
- **差异判定**：**形态不同**（3 处）
  | 维度 | web | PC |
  |---|---|---|
  | 角标轮询 | 45s | 30s |
  | 通知列表轮询 | 45s | **无** |
  | 后台不轮询 | `refetchIntervalInBackground: false` | 无该配置（PC 没轮询，不适用） |
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Notifications.tsx`
  - 插入锚点：`useQuery`（L63-71）
  - PC 最终写法：
    ```tsx
    const { data, isLoading, error, refetch } = useQuery({
      queryKey: ["notifications", { unread: false }],
      queryFn: () => listNotifications(false),
      retry: false,
      refetchInterval: NOTIFICATION_POLL_MS,
      refetchIntervalInBackground: false,
    });
    ```
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\layout\AppShell.tsx`
  - 插入锚点：L136-140 → 改成 C2-26 给出的写法（45s + `staleTime` + `retry:false` + `refetchIntervalInBackground:false`）
  - 数值：`45_000`ms
  - 交互细节：PC 窗口最小化时 `refetchIntervalInBackground: false` 也会停止轮询（React Query 的行为与浏览器一致）
  - 预估改动：**10 行**

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
- **差异判定**：**形态不同**
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Notifications.tsx`
  - 插入锚点：`readOneMutation.onSettled`（L133-138）与 `readAllMutation.onSettled`（L179-184）
  - PC 最终写法：
    ```tsx
    onSettled: () => {
      setPendingId(null);
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    ```
  - ⚠️ 配合 C3-07 去掉 `"page1"` + `category` 后，PC 的列表 queryKey 会变成 `["notifications", { unread: false }]` —— 与 web **完全一致**，失效前缀也一致
  - 交互细节：无
  - 预估改动：**4 行**

---

### C4-16 · 后台 / 关窗行为对照 —— **口径作废（2026-10-26 订正）· 不派工**

> **⚠️ 本条原口径作废，不需要派工。**
> 原口径的前提「**PC 关窗 = 进程退出 ⇒ SSE 断开 ⇒ 通知永久丢失**」**与 PC 当前实现不符**。

- **PC 的 close 按钮不是「退出」，是「隐藏到托盘」** —— `gacode-electron/electron/main.ts:258-266`
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

| 编号 | 判定 | 预估改动 |
|---|---|---|
| C4-01 | 缺失（web 特有，PC 无法 1:1） | 并入 C3-05 |
| C4-02 | 缺失（web 特有，PC 无法 1:1） | 0 行（推荐不做） |
| C4-03 | 形态不同 | 并入 C3-05 |
| C4-04 | 形态不同（数据通路） | 120 行 |
| C4-05 | 缺失（PC 不需要；web 侧已过时） | 0 行 |
| C4-06 | 形态不同 | 20 行（并入 C4-04） |
| C4-07 | PC 增强（不列） | 0 行 |
| C4-08 | 缺失 | 80 行 |
| C4-09 | 形态不同 | 25 行 |
| C4-10 | 形态不同 | 3 行 |
| C4-11 | 缺失 | 60 行 |
| C4-12 | 缺失（web 特有，Electron 无 tag） | 0 行（推荐不做） |
| C4-13 | 形态不同 | 8 行 |
| C4-14 | 形态不同 | 10 行 |
| C4-15 | 形态不同 | 4 行 |
| C4-16 | **口径作废**（2026-10-26 订正：PC 关窗 = 隐藏到托盘，SSE 不断 ⇒ 与 web 行为等价） | 0 行（**不派工**） |

---

# 结构级差异 · 需 gaga 拍

> 本节只放**真正还没拍板**的结构差异（信息架构不同、需要挪位置或改流程）。
> **PC 侧栏常驻形态已由 gaga 拍板保留，不在此列**（决策：PC 的 256px 常驻侧栏保留；侧栏**内部内容与交互照 web 对齐** —— 置顶可折叠分组、每条对话的 pin 按钮、条目视觉形态、圆角/间距/hover 态、计数与折叠箭头，一条不落）。
> **PC 独有功能已按 gaga 指示不列入差异清单**（PC 的 `ProfileChangePassword`、通知设置里的「总开关/应用内提示/按类目屏蔽/测试通知」、通知页的「刷新」按钮与齿轮入口、SSE 看门狗等，一律不列）。
> **PC 侧栏对齐 web Drawer 内部内容这条已由上条决策覆盖**，故 `C1-13`（我的应用入口）不再重复列出 —— 它的落法已定：把「我的应用」加进 PC 常驻侧栏的主菜单区（对齐 web `Drawer.tsx:205-228` 的 nav 卡结构），并按 web 的 `isSpecial` 门禁（`Drawer.tsx:101` + `:221-227`）。

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

| 判定 | 条数 |
|---|---|
| **缺失**（web 有，PC 没有） | **20** |
| **形态不同**（两边都有但长得/行为不一样） | **76** |
| **已一致** | **5** |
| **合计** | **101** |

> ⚠️ **修正（2026-10-26 复核 · E3）**：原稿写「缺失 23 / 形态不同 73 / 已一致 6」—— 与正文逐条实测对不上。
> **统计口径**：全文 `- **差异判定**：` 前缀行共 **101** 行，按每行的**首个关键词**（缺失 / 形态不同 / 已一致）分类；`C2-37` 是「**缺失 + 形态不同**」混合项，按「缺失」计。
> **逐条实测 = 缺失 20 / 形态不同 76 / 已一致 5**（合计 101 ✅）
> - 组 1：缺失 1 / 形态不同 11 / 已一致 2
> - 组 2：缺失 6 / 形态不同 39 / 已一致 3
> - 组 3：缺失 7 / 形态不同 17 / 已一致 0
> - 组 4：缺失 6 / 形态不同 9 / 已一致 0（`C4-07` 正文判定是「形态不同（PC 增强，不列）」，按口径计入形态不同）
> - ⚠️ **2026-10-26 订正**：`C4-16`（PC 关窗期间通知丢失）已标为**口径作废**（PC close = 隐藏到托盘，SSE 不断 ⇒ 与 web 行为等价，见该条）⇒ 它的 `- **差异判定**：` 行**已删除**，不计入上述三桶 ⇒ 形态不同 77 → **76**、合计 102 → **101**。条目本身仍在（组 4 仍是 C4-01 ~ C4-16 **16 条**），只是不再是一个「差异」。

分组分布：

| 组 | 条数 |
|---|---|
| 组 1 · 我的应用 | 14（C1-01 ~ C1-13 + C1-03b） |
| 组 2 · 个人资料 | 48（C2-01 ~ C2-48） |
| 组 3 · 通知页 | 24（C3-01 ~ C3-24） |
| 组 4 · 通知路径 | 16（C4-01 ~ C4-16） |

### 结构性前置事实（已在正文逐条标注）

| 编号 | 事实 |
|---|---|
| F-1 | PC 无 `clsx` / `tailwind-merge` / `cva` → className 冲突要用 `!` 强制 |
| F-2 | PC 无 `lucide-react`、无 `ui/card.tsx` → 图标全部手写 SVG |
| F-3 | PC 的 `bg-card` = `#0a0a0a`，web = `#141414`；PC 缺 `card-hover` |
| F-4 | 圆角刻度 / `shadow` 两端一致，可逐字搬 |
| F-5 | PC 的 `ProfileChangePassword.tsx` 无 web 对照物 → 不产出条目 |
| F-6 | 服务端 `PUT /api/v1/gacode/profile`（`gacode/gacode.profile.routes.js:85-134`）：displayName ≤**50** / bio ≤**200** / gender 枚举 4 值 / 至少传 1 字段 |
| F-7 | `DELETE /yinian/account` 与 `DELETE /auth/account` **现在都真删账号**（前者转发到 `authService.deleteAccount`）；已拍板两端统一 `/auth/account` |
| F-8 | 服务端 `GET /notifications` **只认 `?unread=true`**，无 `category` / `cursor` / `nextCursor` |
| F-9 | 服务端两种通知的 `actionType` / `actionValue` 实际取值 |

### 待核项（本清单未最终确认）

| 待核内容 | 出处 |
|---|---|
| PC 仓**没有** Cody 头像资产（`cody_192.png`）→ web 的缺省头像在 PC 上无对应资源 | C2-07 |
| PC 聊天流**有无** AI 回复终态信号（决定 S-11 的成本） | C4-08 / S-11 |

> ⚠️ **修正（2026-10-26 复核 · E8/E9）**：原表里的待核项「`date-fns` `zhCN` locale 的精确文案 —— **PC 未装 date-fns**，按已知文案抄，需真机校准」**不成立，已删除**：PC `package.json:20` 有 `"date-fns": "^4.4.0"`，`src/components/chat/MessageBubble.tsx:31-32` 已在用 `formatDistanceToNow` + `zhCN`；且 **v3.6.0（web）与 v4.4.0（PC）的 `locale/zh-CN/_lib/formatDistance.js` 字符串与取整逻辑完全相同**（`Math.round`）⇒ 文案无需真机校准。

---

## 改动量最大的前 10 条（实现排期输入）

| # | 编号 | 一句话说明要动什么 | 预估改动 |
|---|---|---|---|
| 1 | **C3-07** | 通知列表改分组模型：PC 弃用无效的 `category` tab，改成 web 的按 `type` 分三组（需先新建 `src/lib/notifications.ts` 抄 web 的 notification adapter 约 330 行） | **370 行** |
| 2 | **C3-17** | 通知点击跳转：web 支持 `yinian://` deep link，PC 全部点不动 → 照抄 web 的 `notificationTarget` / `parseYinianDeepLink` / `scheduleTarget` / `chatTarget` + `isSafeExternalUrl` 白名单（**依赖 C3-07 的 adapter 文件**，见下方去重说明） | **162 行**（含 adapter 150 行） |
| 3 | **C4-04** | PC 的 SSE 客户端从 `EventSource` 改成 `fetch` + 手写 SSE 帧解析（带 `Authorization` 头，不再把 token 拼 URL），顺带拿到 `Last-Event-ID` 续传 | **120 行** |
| 4 | **C2-48** | Toast 组件整体重写成 web 的「居中确认弹窗同款 + title/description 双行 + 变体图标 + × 关闭 + 2500ms + 堆叠」，并全仓兼容 `message` 字段 | **80 行** |
| 5 | **C4-08** | 补「AI 回复到达」系统通知：聊天流收尾广播事件 + 新增通知器 + 主进程暴露「窗口是否在前台」（待 S-11 拍板 + 待核 PC 有无终态信号） | **80 行** |
| 6 | **C4-11** | 系统通知点击跳转：主进程 `new Notification` 注册 `n.on('click')` → 恢复窗口 + 聚焦 + IPC 回 renderer 跳路由（主进程 + preload + SSE 桥传参三处） | **60 行** |
| 7 | **C3-05** | 通知页顶部新增常驻「桌面通知」状态卡（PC 三态替代 web 的浏览器三态）+ 开启/关闭按钮 | **40 行** |
| 8 | **C2-11** | Profile 信息卡从「一个卡 + divide-y」改成「4 个独立卡 + space-y-2」（结构级 → `S-2`） | **35 行** |
| 9 | **C2-29** | 新建 `src/components/ui/Avatar.tsx`，把 web 的 hash 5 色调色板 + `AvatarFallback` 搬过来（PC 现在是固定 `bg-brand/30` 首字母） | **35 行** |
| 10 | **C3-03** | 新建 `src/components/ui/Badge.tsx`（web 的 6 个 variant）+ 通知页未读角标改成 `destructive` 实心红 + 「N 未读」 | **33 行** |

> ⚠️ **修正（2026-10-26 复核 · E6）**：原稿的 Top10 **既没排序也选错**（370/80/60/35/40/120/20/33/28/80，非降序），且**漏了第 2 大的 C3-17(162) 和第 8 大的 C2-11(35)**，却收了 C2-40(20)、C2-37(28)。上表已按改动量**降序**重排并补齐。
>
> ⚠️ **去重（E7）**：`src/lib/notifications.ts` 是**同一份新文件** —— C2-05(9 行) / C2-26(12 行) / C3-13(18 行) / C3-17(~150 行) / C3-07(330 行) 各算了一次，合计 519 行；**实际只有一份 ~330 行的文件** ⇒ 排期总量**只算 330 行**，比逐条相加**少 ~189 行**。上表 C3-17(162) 里的 150 行与 C3-07 的 330 行是**同一份文件**，排期时不要重复计。

### 其余 Top 候选（第 11 位起 · 按改动量降序）

| 编号 | 说明 | 预估 |
|---|---|---|
| C2-37 | 新建 `src/components/ui/Textarea.tsx`（web 的 `bg-bg-elevated` + `shadow-sm` + `min-h-[88px]`），替换 ProfileEdit 里的裸 `<textarea>` | 28 行 |
| C3-06 | 通知页「待开发」占位 Banner | 25 行 |
| C2-20 | `ConfirmDialog` 对齐 web 的 AlertDialog 视觉 + ESC 关闭 + 锁滚动（待 S-4 拍板） | 25 行 |
| C4-09 | 前台收到时不弹系统通知（需主进程 `isFocused`/`isMinimized` 桥） | 25 行 |
| C2-40 | 改 PC 全站共用 `Button` 的 variant/size 串对齐 web（但波及全站，见 S-4） | 20 行 |
| C2-41 | 头像本地预览（`FileReader` → dataURL 选完即回显） | 18 行 |
| C2-44 | 保存时头像重复上传 + 本地 store 立即更新（待 S-5 拍板） | 10 行 |

---

## 十一、独立复核修正（2026-10-26 verifier）

> **一句话结论**：**观察层 12/12 核心结论全部成立、行号命中率极高；统计/结构层有 5 处真错误（E1~E5），其中 E1 掩盖了一个现网 400 bug、E2 会导致行为倒退。修完 E1~E5 可作实现依据。**

### E1 · F-6 引了错误的 profile 路由文件，且掩盖了一个现网 400 bug（严重）

- **文档原话**：F-6（L471-477）整表引 `unified-api/src/modules/yinian/profile.routes.js`（注册前缀 `/api/v1/auth`），并写 `displayName` maxLength **64** / `bio` maxLength **500**；C2-31（L1966）「服务端允许 64」、C2-33（L2033）「服务端允许 500」、C2-32（L1998）引 `profile.routes.js:62`
- **源码真相**：两端实际调的是 `unified-api/src/modules/gacode/gacode.profile.routes.js` —— web `gacode-web/src/lib/api.ts:264`、PC `gacode-electron/src/lib/api.ts:1164` 都是 `PUT /gacode/profile`；该文件 `:85-134` 是 `PUT /profile`：`:91` `displayName: { type: ['string','null'], maxLength: 50 }`、`:93` `bio: { type: ['string','null'], maxLength: 200 }`、`:107` `if (displayName !== undefined) data.displayName = displayName;`。**`modules/yinian/profile.routes.js` 里的 64/500 属于 `/api/v1/auth/profile` —— web 全仓 grep `/auth/profile` = 0 命中，没人在调那条路由**
- **应该怎么改**：F-6 整表换成 `gacode/gacode.profile.routes.js:85-134`，上限改为 **displayName 50 / bio 200**；C2-31 / C2-33 的服务端事实同步改；C2-32 的引用改成 `gacode/gacode.profile.routes.js:107`；**并新增一条明确的「现网 bug」条目**（见本节末「本次新发现的现网 bug」）

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

### 本次新发现的现网 bug

- **PC `ProfileEdit.tsx` 的长度上限超出服务端 `/gacode/profile` 的 schema 上限 ⇒ 400 保存失败**
  - `gacode-electron/src/routes/ProfileEdit.tsx:43` `const DISPLAY_NAME_MAX = 64;` > 服务端 `gacode/gacode.profile.routes.js:91` 的 **50**
  - `gacode-electron/src/routes/ProfileEdit.tsx:42` `const BIO_MAX = 500;` > 服务端 `gacode/gacode.profile.routes.js:93` 的 **200**
  - ⇒ 用户输入 **51~64 字昵称 / 201~500 字简介**时，前端软校验放行、服务端 schema 拒收 → **PUT /gacode/profile 返回 400，保存失败**
  - **改法**：两个常量改成 **50 / 200**（前端 `maxLength` 引用同一常量，自动同步）；若走 1:1 对齐 web 的口径则昵称取 **30**（同样 ≤ 50，同样消除该 400）—— 两个口径都必须 ≤ 服务端上限
