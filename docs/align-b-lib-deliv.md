# align-b · 知识库 / 交付中心 → PC 端 1:1 还原清单

> 生成时间：2026-10-26
> 真相源：`D:\gaga\gaclaw-project\gacode-web`（web 端源码实际 DOM + className，逐行抄）
> 目标：`D:\gaga\gaclaw-project\gacode-electron`（PC 端独立实现）
> 范围：知识库列表 + 知识库详情 + 交付中心列表 + 交付中心详情 + 共享组件逐个对
> **本文件只读两端源码产出，不改任何生产代码。**

## 读法

- 每条差异带：web `file:line` → PC `file:line` → 判定 → **PC 端该怎么改**（绝对路径 + 插入锚点 + 可粘贴 className 串 + 代码骨架 + 预估改动行数）
- 判定三选一：**缺失** / **形态不同** / **已一致**
- 排序：按「改动量从小到大」—— 纯 className 一行改 → 补一个组件 → 补状态/交互 → 补数据通路
- **不列 PC 增强**（PC 有、web 没有的功能一律不写）。PC 已有的 `SortMenu` / `TagFilter` / `LibraryDropZone` / `SyncStatusBadge` / `LibraryMarkdownTableCard` / 顶部「+ 新建」按钮 / 详情页「在对话中引用」/「返回列表」按钮 等，均属 PC 增强，**不计入差异**。
- PC 端 Tailwind **无** `tailwind-merge` / `clsx` / `cva`：`className` 是数组 `.join(" ")` 追加，冲突类名靠 **CSS 产物顺序** 决定，必要时用 `!` 前缀强制覆盖（如 `!rounded-full`）。
- PC 端 Tailwind token 已确认存在（`gacode-electron/tailwind.config.ts`）：`brand{DEFAULT,hover,active,on,yellow,cyan,green}` / `bg-base|bg-sunken|bg-elevated` / `fg|fg-muted|fg-subtle` / `border|border-strong` / `card`(`#0a0a0a`) / `popover`(`#181818`) / `muted`(`#181818`) / `accent`(`#1f1f1f`) / `destructive`(`#E54a5e`) / `ring`(`#FF6B35`)。
- 圆角：PC `rounded`=8px / `rounded-md`=16px / `rounded-lg`=20px / `rounded-xl`=22px / `rounded-2xl`=24px / `rounded-full`=9999px。

---

# 一、知识库列表页

> web：`gacode-web/src/app/(main)/library/page.tsx`（1263 行）
> PC：`gacode-electron/src/routes/Library.tsx`（576 行）+ `src/components/library/LibraryCard.tsx`（269 行）+ `CollectSheet.tsx`（433 行）+ `EditSheet.tsx`（175 行）+ `MultiSelectToolbar.tsx`（87 行）+ `src/components/ui/Tabs.tsx`（159 行）

## 1.1 顶部操作栏

### L-01 · Tabs 容器：去掉 `border-b`，`gap-6` → `gap-1`
- **web**：`gacode-web/src/app/(main)/library/page.tsx:434-443`（`<Tabs value={type} …>` → `<TabsList>`）
  web `TabsList` 容器 className（`gacode-web/src/components/ui/tabs.tsx:55-58`）：
  ```
  "flex items-center justify-start gap-1 overflow-x-auto scrollbar-none"
  ```
  注释原文（`tabs.tsx:51-54`）：「2026-10-17 P0 (gaga 真机反馈): 去掉 TabsList 默认的 border-b — 整体去线化方向」。
- **PC**：`gacode-electron/src/components/ui/Tabs.tsx:62-66`
  ```tsx
  className={["flex gap-6 border-b border-border", className].join(" ")}
  ```
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\Tabs.tsx`
  - 锚点：`if (variant === "underline") {` 分支内 `role="tablist"` 的那个 `<div>`
  - className 整串改为：`"flex items-center justify-start gap-1 overflow-x-auto scrollbar-none"`
  - 影响面：`underline` 变体当前唯一调用点 = `Library.tsx:259`（知识库 tab 行）；`pill` 变体不动。
- **预估改动**：1 行

### L-02 · Tab 按钮内边距：`pb-2` → `px-4 py-2.5`
- **web**：`gacode-web/src/components/ui/tabs.tsx:81-88`
  ```
  "relative inline-flex items-center justify-center whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "disabled:pointer-events-none disabled:opacity-50",
  ```
- **PC**：`gacode-electron/src/components/ui/Tabs.tsx:82-92`
  ```
  "relative pb-2 text-sm transition-colors duration-150",
  "disabled:opacity-50 disabled:pointer-events-none",
  "inline-flex items-center gap-1",
  ```
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\Tabs.tsx`
  - 锚点：同 L-01，underline 分支内 `<button role="tab">` 的 className 数组第 1 项
  - className 改为：`"relative inline-flex items-center justify-center whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors duration-150"`（删掉 `pb-2`）
  - 保留 PC 独有的 `transition-colors duration-150`（web 无 duration，靠全局 `transition-colors` 默认 150ms —— 等价）
  - `disabled:*` 两项顺序对齐 web：`"disabled:pointer-events-none disabled:opacity-50"`
- **预估改动**：1 行

### L-03 · Tab 下划线：满宽 → 左右各内缩 12px（`after:inset-x-3`），补 `after:rounded-t`
- **web**：`gacode-web/src/components/ui/tabs.tsx:84-86`
  ```
  active ? "text-fg after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-t after:bg-brand"
  ```
- **PC**：`gacode-electron/src/components/ui/Tabs.tsx:88-91`
  ```
  "after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:transition-colors",
  isActive ? "text-fg font-medium after:bg-brand" : "text-fg-muted hover:text-fg after:bg-transparent",
  ```
- **判定**：形态不同（PC 下划线是按钮满宽，web 是内缩 12px 的短横线）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\Tabs.tsx`
  - 锚点：underline 分支 button className 数组第 4 项（`after:content-[''] …`）
  - 改为：`"after:content-[''] after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-t after:transition-colors"`
    （删 `after:left-0 after:right-0`，加 `after:inset-x-3 after:rounded-t`）
- **预估改动**：1 行

### L-04 · Tab 未选中态：补 `hover:bg-accent`
- **web**：`gacode-web/src/components/ui/tabs.tsx:86` → inactive：`"text-fg-muted hover:text-fg hover:bg-accent"`
- **PC**：`gacode-electron/src/components/ui/Tabs.tsx:91` → inactive：`"text-fg-muted hover:text-fg after:bg-transparent"`
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\Tabs.tsx`
  - 锚点：underline 分支 `isActive ? … : …` 的 `: ` 分支
  - 改为：`"text-fg-muted hover:text-fg hover:bg-accent after:bg-transparent"`
- **预估改动**：1 行

### L-05 · Tab 字号字重：`font-medium` 从「仅选中态」提到「全部态」
- **web**：`gacode-web/src/components/ui/tabs.tsx:82` — base 里就有 `text-sm font-medium`，active/inactive **都**是 medium
- **PC**：`gacode-electron/src/components/ui/Tabs.tsx:90` — `font-medium` 只在 `isActive` 分支
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\Tabs.tsx`
  - 锚点：underline 分支 button className 数组第 1 项
  - 第 1 项改为：`"relative inline-flex items-center justify-center whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors duration-150"`；同时把 active 分支里的 `font-medium` 去掉（active 改为 `"text-fg after:bg-brand"`）
- **预估改动**：2 行

### L-06 · 搜索按钮图标尺寸：16px → 20px
- **web**：`gacode-web/src/app/(main)/library/page.tsx:455` → `<Search className="w-5 h-5" />`（lucide，20×20，stroke-width 2）
- **PC**：`gacode-electron/src/routes/Library.tsx:293` → `<SearchIcon />`；`SearchIcon` 定义在 `Library.tsx:560-567`，svg `width="16" height="16"`、`strokeWidth="1.6"`
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：`function SearchIcon({ className = "" }: { className?: string })` 函数体
  - 改法（与 L-08 合并更省事，但此处只改尺寸）：svg 属性改 `width="20" height="20"`，并把 `strokeWidth="1.6"` → `strokeWidth="2"` 对齐 lucide
    - ⚠️ 注意：`SearchIcon` 在本文件被 **两处** 复用 —— `Library.tsx:293`（行内搜索按钮，web 20px）与 `Library.tsx:314`（搜索框内绝对定位图标，web 是 `w-4 h-4`=16px）。改全局尺寸会连带影响搜索框内图标。
    - 推荐做法：给 `SearchIcon` 加 `size` prop：`function SearchIcon({ className = "", size = 20 }: { className?: string; size?: number })`，内部 `width={size} height={size}`；行内按钮用默认 20，搜索框内改 `<SearchIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted pointer-events-none z-10" />`
- **预估改动**：6 行（2 处调用 + 1 处签名）

### L-07 · 刷新按钮图标：stroke-width 1.6 → 2（尺寸已一致）
- **web**：`gacode-web/src/app/(main)/library/page.tsx:464` → `<RefreshCw className={cn("w-5 h-5", isFetching && "animate-spin")} />`（20×20，lucide stroke-width 2）
- **PC**：`gacode-electron/src/routes/Library.tsx:302` → `<RefreshIcon className={isFetching ? "animate-spin" : ""} />`；`RefreshIcon` 定义 `Library.tsx:549-558`，svg `width="20" height="20"`、`strokeWidth="1.6"`
- **判定**：形态不同（尺寸一致，线宽不同）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：`function RefreshIcon({ className = "" }: { className?: string })`
  - 改法：`strokeWidth="1.6"` → `strokeWidth="2"`
- **预估改动**：1 行

### L-08 · 搜索框行内距：`pt-1` → `pt-2`
- **web**：`gacode-web/src/app/(main)/library/page.tsx:470` → `<div className="pt-2">`（外层）→ 内层 `<div className="relative">`
- **PC**：`gacode-electron/src/routes/Library.tsx:313` → `<div className="relative pt-1">`
- **判定**：形态不同（4px → 8px）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：`{showSearch ? (` 分支内 `<div className="relative pt-1">`
  - 改为：`className="relative pt-2"`
- **预估改动**：1 行

### L-09 · 搜索框 className：补 `focus-visible:ring-1 focus-visible:ring-brand`
- **web**：`gacode-web/src/app/(main)/library/page.tsx:481`
  ```
  "pl-9 py-2 text-sm bg-muted/50 border-0 rounded-full focus-visible:ring-1 focus-visible:ring-brand"
  ```
- **PC**：`gacode-electron/src/routes/Library.tsx:324`
  ```
  "pl-9 py-2 text-sm bg-muted/50 border-0 !rounded-full"
  ```
- **判定**：形态不同（PC 缺 focus 环）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：`<Input type="search" value={keyword}` 的 `className`
  - 改为：`"pl-9 py-2 text-sm bg-muted/50 border-0 !rounded-full focus-visible:ring-1 focus-visible:ring-brand"`
  - ⚠️ 冲突提示：`gacode-electron/src/components/ui/Input.tsx:24` base 串含 `"flex w-full rounded-md border border-border bg-bg-sunken px-4 py-3 text-base placeholder:text-fg-subtle transition-colors duration-150 focus:outline-none focus:border-brand disabled:cursor-not-allowed disabled:opacity-50"`。
    - `!rounded-full` 是必需的（`rounded-md` 在产物里位置更靠后，见 `Library.tsx:309-311` 注释）；
    - PC base 的 `focus:border-brand` 与 web 的「无边框 + ring」方向相反 → 需同时加 `focus:border-transparent`，否则 `border-0` 被 `border` 覆盖后仍会变橙边；
    - PC base 的 `text-base`（16px）会盖掉 web 的 `text-sm`（14px）→ 需加 `!text-sm`；
    - PC base 的 `px-4 py-3` 会盖掉 web 的 `py-2` → 需加 `!py-2`。
  - 最终 className：`"pl-9 !py-2 !text-sm bg-muted/50 border-0 focus:border-transparent !rounded-full focus-visible:ring-1 focus-visible:ring-brand"`
- **预估改动**：1 行

### L-10 · sticky 顶栏：补半透明底 + 模糊 + 内距 + 层级
- **web**：`gacode-web/src/app/(main)/library/page.tsx:430`
  ```
  "sticky top-0 z-20 bg-bg-base/95 backdrop-blur pt-2 pb-4"
  ```
- **PC**：`gacode-electron/src/routes/Library.tsx:251`
  ```
  "sticky top-0 z-10 bg-bg-base"
  ```
- **判定**：形态不同（PC 不透明、无模糊、无内距、z 低 10 级）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：`{/* 顶部操作栏 */}` 注释下第一个 `<div className="sticky top-0 z-10 bg-bg-base">`
  - 改为：`"sticky top-0 z-20 bg-bg-base/95 backdrop-blur pt-2 pb-4"`
  - 同批把内层容器 `Library.tsx:253` 的 `"px-4 lg:px-8 max-w-3xl mx-auto w-full space-y-2 py-2"` 去掉 `py-2`（顶栏已有 pt-2/pb-4），保持 `space-y-2`。
- **预估改动**：2 行

### L-11 · 上传中提示条「正在采集 N 项…」整条缺失
- **web**：`gacode-web/src/app/(main)/library/page.tsx:491-498`
  ```tsx
  {upload.items.filter((it) => it.status === "uploading").length > 0 && (
    <div className="px-4 lg:px-8 max-w-3xl mx-auto w-full pb-3">
      <div className="rounded-full bg-muted/50 px-4 py-2 text-xs text-fg-muted flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        正在采集 {upload.items.filter((it) => it.status === "uploading").length} 项…
      </div>
    </div>
  )}
  ```
- **PC**：`gacode-electron/src/routes/Library.tsx` 全文无此块；`CollectSheet.tsx:405-407` 只有 `上传中 {progress ?? 0}%` 文字，且在 sheet 内部（sheet 一关就没了）
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：插在 `</div>`（列表区 `Library.tsx:378`）**之前**、`<div className="min-h-full flex flex-col">` 内部
  - 需要新增 state（放在 `Library.tsx:79` `const [page, setPage] = useState(1);` 之后）：
    ```tsx
    /** 正在采集（上传中）的条目数 — web 端对应 upload.items.filter(it => it.status === "uploading").length */
    const [collectingCount, setCollectingCount] = useState(0);
    ```
  - 需要新增 props：`CollectSheet` 增加 `onUploadingChange?: (count: number) => void`（谁传：`Library.tsx` 的 `<CollectSheet open={collectOpen} onClose={…} />`，默认 undefined 不传时行为不变）
  - 渲染 JSX（原样抄 web）：
    ```tsx
    {collectingCount > 0 && (
      <div className="px-4 lg:px-8 max-w-3xl mx-auto w-full pb-3">
        <div className="rounded-full bg-muted/50 px-4 py-2 text-xs text-fg-muted flex items-center gap-2">
          <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
          正在采集 {collectingCount} 项…
        </div>
      </div>
    )}
    ```
  - 依赖：PC 无 lucide-react（仓库内是手写 svg）→ **需新增图标函数** `SpinnerIcon({ className })`（lucide Loader2 的 path：`M21 12a9 9 0 1 1-6.219-8.56`，stroke-width 2）
- **预估改动**：约 25 行（含 `CollectSheet` 侧上报 + 图标函数）

### L-12 · 刷新后缺 toast「已刷新」
- **web**：`gacode-web/src/app/(main)/library/page.tsx:224-229`
  ```tsx
  const handleRefresh = () => {
    setPage(1);
    setItems([]);
    queryClient.invalidateQueries({ queryKey: ["library"] });
    toast({ title: "已刷新", variant: "default" });
  };
  ```
- **PC**：`gacode-electron/src/routes/Library.tsx:138-141`
  ```tsx
  const handleRefresh = () => {
    setPage(1);
    refetch();
  };
  ```
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：`const handleRefresh = () => {` 函数体
  - 改为：
    ```tsx
    const handleRefresh = () => {
      setPage(1);
      refetch();
      toast({ message: "已刷新", variant: "default" });
    };
    ```
  - ⚠️ PC Toast 的 variant 集合需核对：`gacode-electron/src/components/ui/Toast.tsx` 支持 `default`（`Library.tsx:228` 已用 `variant: "default"` 形态）——落地前确认 Toast 组件 variant 枚举含 `default`；不含则用 `variant: "success"` 并记为形态偏差。
- **预估改动**：1 行

### L-13 · 刷新时不清空列表（web 会 setItems([])）
- **web**：`gacode-web/src/app/(main)/library/page.tsx:225-227` — `setPage(1); setItems([]); invalidateQueries(["library"])`
- **PC**：`gacode-electron/src/routes/Library.tsx:139-140` — `setPage(1); refetch();`（无 invalidate、无清空）
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：`const handleRefresh = () => {` 函数体
  - 改为：
    ```tsx
    const handleRefresh = () => {
      setPage(1);
      queryClient.invalidateQueries({ queryKey: ["library"] });
      toast({ message: "已刷新", variant: "default" });
    };
    ```
    （`refetch()` 换成 `invalidateQueries`，与 web 一致地走 queryKey 失效；react-query 的 `placeholderData: (prev) => prev` 已保证刷新期间不闪空）
- **预估改动**：1 行

## 1.2 Tab 类型集合

### L-14 · 缺「文本」tab
- **web**：`gacode-web/src/app/(main)/library/page.tsx:106-115`
  ```tsx
  const TYPE_TABS: Array<{ value: TypeFilter; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { value: "",     label: "全部", icon: LayoutGrid },
    { value: "text", label: "文本", icon: Type },
    { value: "image",label: "图片", icon: ImageIcon },
    { value: "file", label: "文档", icon: FileText },
  ];
  ```
  服务端 type 枚举注释（`library/page.tsx:104-105`）：「value 仍是 "file" —— 后端 modality 枚举名, 改了 listLibrary 静默返回空。」
- **PC**：`gacode-electron/src/routes/Library.tsx:57-64`
  ```tsx
  type TypeFilter = "all" | "image" | "doc" | "link";
  const TYPE_CHIPS: Array<{ key: TypeFilter; label: string }> = [
    { key: "all", label: "全部" },
    { key: "image", label: "图片" },
    { key: "doc", label: "文档" },
    { key: "link", label: "链接" },
  ];
  ```
- **判定**：缺失（web 有「文本」，PC 没有）
- **服务端 type 值域（确定结论，2026-10-26 复核补，无需实测）**：`GET /yinian/library` 的 `type` 字段**恒为 `image | doc | link` 三档，永不为 `text`** —— 服务端 `unified-api/src/modules/yinian/library.routes.js:121` `const webType = MODALITY_TO_WEB_TYPE[atom.modality] || 'link'`，而 `:82-88` 的 `MODALITY_TO_WEB_TYPE` 把 DB modality `text` 映射成 web type **`link`**（`file`→`doc` / `image`→`image` / `audio`·`video`→`doc`），`:67` `WEB_LIBRARY_TYPES` 已冻结为 `['image','doc','link']`。
- **怎么改**（**⚠️ 原「加 `text` tab + 客户端二次过滤」的改法是错的 —— 照原样实现会做出恒空的 tab，见 §十一 E-2**；按下面 3 步改）：
  1. **`serverType` 改为按 tab 分别传**（`Library.tsx:99-102`）：现状是只要 `type !== "all"` 就**固定返回 `"file"`**；服务端 list 的 `type` 参数过滤的是 **modality**（`library.routes.js:288` `if (type) where.modality = type`）⇒ 只回 modality=`file` 的行 ⇒ 回读的 `type` 恒为 `'doc'`。改为：`全部` → `undefined`；`文本` → `"text"`（modality=text）；`图片` → `"image"`；`文档` → `"file"`。
  2. **客户端不再二次过滤**，或改用服务端已返回的原始 `modality` 字段（list DTO 已带：`library.routes.js:131` `modality: atom.modality`；PC `src/lib/api.ts` 的 `LibraryItem` 类型需补 `modality`）。现状 `raw.filter((it) => it.type === type)`（`Library.tsx:125`）在第 1 步改完后仍会误杀 —— `文本` tab 拿到的行 `type` 是 `'link'` 而不是 `'text'`。
  3. **tab 文案与语义对齐**：web 的「文本」tab（value `text`）语义 = **服务端 modality='text'**（URL 条目 + 安卓纯文本）；**PC 现有的「链接」tab 在语义上已经等于 web 的「文本」tab** ⇒ 1:1 还原**不是**「删掉链接、加文本」，而是**给 PC 的 tab 改 `serverType` + 改文案**（PC「链接」→ 服务端 modality='text'；PC「文档」→ modality='file'；PC「图片」→ modality='image'）。
  - ⚠️ **PC 侧真 bug（原 147 条里漏掉的）**：`serverType` 恒为 `"file"` ⇒ **PC「图片」tab 与「链接」tab 恒为空**（回读的 `type` 永远只有 `'doc'`，`it.type==='image'` / `it.type==='link'` 永不命中）；只有「文档」tab 有内容，而「文档」tab 里**混着 web 建的纯文本笔记**（web POST `type='doc'` → modality='file'）。详见 §十 第 11 条。
- **预估改动**：≥20 行（改 `TypeFilter` / `TYPE_CHIPS` / `serverType` / 客户端过滤 / `modality` 字段），**无需接口实测**

### L-15 · Tab 缺图标（全部 / 文本 / 图片 / 文档 4 个各一个）
- **web**：`gacode-web/src/app/(main)/library/page.tsx:436-441`
  ```tsx
  <TabsTrigger key={t.value} value={t.value}>
    <t.icon className="w-4 h-4 mr-1.5" />
    {t.label}
  </TabsTrigger>
  ```
  对应图标（`library/page.tsx:9-31` import）：`LayoutGrid`（全部）/ `Type`（文本）/ `ImageIcon`（图片）/ `FileText`（文档），全部 `w-4 h-4 mr-1.5`（16px，右侧间距 6px）
- **PC**：`gacode-electron/src/components/ui/Tabs.tsx:25-33` — `TabsTab` 只有 `{ key, label, count?, disabled? }`，**没有 icon 字段**；`Tabs.tsx:93-94` 只渲染 `<span>{t.label}</span>`
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\Tabs.tsx`
  - 锚点：`export interface TabsTab {`
  - 1) `TabsTab` 新增字段（放在 `label` 之后）：
    ```tsx
    /** 可选前置图标 — ReactNode, 调用方自己传 svg, 组件不绑死图标集 */
    icon?: React.ReactNode;
    ```
    → 需在 `Tabs.tsx` 顶部加 `import type { ReactNode } from "react";`（PC 无 lucide-react，图标由调用方传）
  - 2) `Tabs.tsx:93` 附近改为：
    ```tsx
    {t.icon ? <span className="mr-1.5 inline-flex items-center">{t.icon}</span> : null}
    <span>{t.label}</span>
    ```
    （pill 变体同理加，否则两个变体视觉不一致）
  - 3) 调用方 `gacode-electron/src/routes/Library.tsx:59-64` 的 `TYPE_CHIPS` 增加 `icon` 字段，并新增 4 个图标函数（PC 手写 svg，见 `Library.tsx:507-576` 现有 `LibraryIcon` / `PlusIcon` 风格）：
    - `LayoutGridIcon`（lucide LayoutGrid path：`M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z`，stroke-width 2）
    - `TypeIcon`（lucide Type path：`M4 7V4h16v3 M9 20h6 M12 4v16`，stroke-width 2）
    - `ImageIcon`（PC 已有同名函数但语义不同 —— `LibraryCard.tsx:221` 的 `ImageIcon` 是 16px 单色；此处需新建 16px 版本或复用）
    - `FileTextIcon`（lucide FileText path：`M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z` + `M14 2v4a2 2 0 0 0 2 2h4`）
  - 4) 调用处 `Library.tsx:261`：`tabs={TYPE_CHIPS.map((t) => ({ key: t.key, label: t.label, icon: t.icon }))}`
- **预估改动**：约 40 行（含 4 个 svg 函数）

## 1.3 列表区

### L-16 · 加载态骨架：6 张结构卡 → 3 张纯色块
- **web**：`gacode-web/src/app/(main)/library/page.tsx:505-510`
  ```tsx
  <div className="space-y-3">
    <Skeleton className="h-20 w-full rounded-2xl bg-card" />
    <Skeleton className="h-20 w-full rounded-2xl bg-card" />
    <Skeleton className="h-20 w-full rounded-2xl bg-card" />
  </div>
  ```
  （web `Skeleton` 组件带 `animate-pulse`，见 `gacode-web/src/components/ui/skeleton.tsx`）
- **PC**：`gacode-electron/src/routes/Library.tsx:481-501` `SkeletonGrid()`
  ```tsx
  <div className="space-y-3">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="rounded-2xl bg-bg-elevated p-4 animate-pulse">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded bg-bg-sunken" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-12 bg-bg-sunken rounded" />
            <div className="h-4 w-3/4 bg-bg-sunken rounded" />
            <div className="h-3 w-1/4 bg-bg-sunken rounded" />
          </div>
        </div>
      </div>
    ))}
  </div>
  ```
- **判定**：形态不同（数量 3 vs 6、底色 `bg-card` vs `bg-bg-elevated`、结构骨架 vs 纯色块）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：`function SkeletonGrid() {` 函数体整体替换
  - 改为：
    ```tsx
    function SkeletonGrid() {
      return (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 w-full rounded-2xl bg-card animate-pulse" />
          ))}
        </div>
      );
    }
    ```
- **预估改动**：约 12 行

### L-17 · 空态卡片：去边框 + 底色改 `bg-card` + 内距 `p-12` → `p-10` + 去掉 `max-w-sm` + 去掉垂直居中
- **web**：`gacode-web/src/app/(main)/library/page.tsx:512-525`
  ```tsx
  <Card className="border-0 shadow-none bg-card rounded-2xl">
    <CardContent className="p-10 text-center text-fg-muted">
      <Construction className="w-12 h-12 mx-auto text-fg-muted mb-4" />
      <div className="text-base font-medium mb-1 text-fg">
        {search ? "未找到匹配项" : "暂无知识库内容"}
      </div>
      <div className="text-sm">
        {search ? `没有标题或标签包含 "${search}" 的内容` : "上传图片 / 文档 / 链接后将自动同步到这里"}
      </div>
    </CardContent>
  </Card>
  ```
  注意 web 的空态卡 **没有** 外层 `h-full flex items-center justify-center`，卡片直接贴在列表容器顶部。
- **PC**：`gacode-electron/src/routes/Library.tsx:456-478` `EmptyState`
  ```tsx
  <div className="h-full flex items-center justify-center">
    <div className="rounded-2xl border border-border bg-bg-elevated p-12 text-center max-w-sm w-full">
      <LibraryIcon className="w-12 h-12 mx-auto text-fg-muted mb-4" />
      <p className="text-base font-medium">还没有知识库</p>
      <p className="text-sm text-fg-muted mt-2">拖入文件入库,或点击下方按钮手动添加</p>
      <div className="mt-4"><Button variant="default" size="md" onClick={onCreateClick}>+ 新建条目</Button></div>
    </div>
  </div>
  ```
- **判定**：形态不同（4 处）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：`function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {`
  - 1) 外层 `<div className="h-full flex items-center justify-center">` → 删除（保留最外层卡片即可，PC 卡片直接放进 `Library.tsx:341` 的列表容器）
  - 2) 卡片 className：`"rounded-2xl border border-border bg-bg-elevated p-12 text-center max-w-sm w-full"` → `"border-0 shadow-none bg-card rounded-2xl p-10 text-center text-fg-muted"`
  - 3) 标题 `<p className="text-base font-medium">` → `<div className="text-base font-medium mb-1 text-fg">`（web 有 `mb-1` + `text-fg`）
  - 4) 副文案 `<p className="text-sm text-fg-muted mt-2">` → `<div className="text-sm">`（`mt-2` 是 PC 自有间距，web 靠 `mb-1` 拉开）
  - 5) PC 的「+ 新建条目」按钮属 PC 增强，**保留不动**（不删、不列差异）
- **预估改动**：约 6 行

### L-18 · 空态图标：`LibraryIcon`（书本）→ `Construction`（工地）
- **web**：`gacode-web/src/app/(main)/library/page.tsx:515` → `<Construction className="w-12 h-12 mx-auto text-fg-muted mb-4" />`（lucide Construction：斜坡+吊车，24 viewbox，stroke-width 2）
- **PC**：`gacode-electron/src/routes/Library.tsx:460` → `<LibraryIcon className="w-12 h-12 mx-auto text-fg-muted mb-4" />`（`Library.tsx:507-528`，书本形 path）
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：`EmptyState` 函数体内那行 `<LibraryIcon className="w-12 h-12 mx-auto text-fg-muted mb-4" />`
  - 改为 `<ConstructionIcon className="w-12 h-12 mx-auto text-fg-muted mb-4" />`
  - 新增 svg 函数（lucide Construction path：`M2 20h20` / `M4 20V8l6-4` / `M14 20V8l-6-4` / `M2 20h20` / `M18 9h2v4` / `M18 5h2v2` / `M20 16h2` / `M2 14h2` / `M4 12h2` / `M6 14h2` / `M9 7v4` / `M12 7v4` / `M14 9v4` / `M16 9v4`；stroke-width 2，`fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"`）
  - ⚠️ `LibraryIcon` 在 `Library.tsx:460` 是唯一使用点（`Library.tsx:507` 定义），可直接把 `LibraryIcon` 改成 Construction 形状并保留函数名，最省改动。
- **预估改动**：约 12 行（改 path）

### L-19 · 空态标题文案：「还没有知识库」→「暂无知识库内容」
- **web**：`gacode-web/src/app/(main)/library/page.tsx:516-518` → `{search ? "未找到匹配项" : "暂无知识库内容"}`
- **PC**：`gacode-electron/src/routes/Library.tsx:461` → `<p className="text-base font-medium">还没有知识库</p>`
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：`EmptyState` 内标题 `<p>`
  - 改为：`<p className="text-base font-medium mb-1 text-fg">{search ? "未找到匹配项" : "暂无知识库内容"}</p>`
  - `EmptyState` 需新增 prop：`function EmptyState({ onCreateClick, search }: { onCreateClick: () => void; search: string })`；调用处 `Library.tsx:345` 改为 `<EmptyState onCreateClick={() => setCollectOpen(true)} search={keyword} />`
- **预估改动**：3 行

### L-20 · 空态副文案：「拖入文件入库…」→「上传图片 / 文档 / 链接后将自动同步到这里」
- **web**：`gacode-web/src/app/(main)/library/page.tsx:519-523`
  ```tsx
  <div className="text-sm">
    {search ? `没有标题或标签包含 "${search}" 的内容` : "上传图片 / 文档 / 链接后将自动同步到这里"}
  </div>
  ```
- **PC**：`gacode-electron/src/routes/Library.tsx:462-464` → `拖入文件入库,或点击下方按钮手动添加`
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：`EmptyState` 内副文案 `<p className="text-sm text-fg-muted mt-2">`
  - 改为：`<p className="text-sm">{search ? `没有标题或标签包含 "${search}" 的内容` : "上传图片 / 文档 / 链接后将自动同步到这里"}</p>`
  - `search` prop 同 L-19
- **预估改动**：1 行

### L-21 · 空态搜索分支（search 非空时整块文案切换）
- **web**：`gacode-web/src/app/(main)/library/page.tsx:517` + `520-522`（search 分支，见 L-19 / L-20）
- **PC**：`gacode-electron/src/routes/Library.tsx:456-478` — 无 `search` 入参，永远显示静态文案
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：`EmptyState` 函数签名 + `Library.tsx:345` 调用处
  - 同 L-19 / L-20 一起做（新增 `search: string` prop）。另：PC 搜索框输入时 `keyword` 即时生效，web 也是即时（web 的 `search` 直接进 queryKey），**不需要防抖**。
- **预估改动**：2 行（与 L-19/L-20 合并）

### L-22 · 「加载更多」在搜索时仍显示
- **web**：`gacode-web/src/app/(main)/library/page.tsx:552` → `{!search.trim() && hasMore && (`（注释：「search 时不展示 load more 以避免翻页噪声」）
- **PC**：`gacode-electron/src/routes/Library.tsx:364` → `{hasMore ? (`（无 search 判断）
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：`{hasMore ? (` 那一行
  - 改为：`{!keyword.trim() && hasMore ? (`
- **预估改动**：1 行

### L-23 · 「加载更多」按钮形态：shadcn Button → 纯文字按钮
- **web**：`gacode-web/src/app/(main)/library/page.tsx:552-568`
  ```tsx
  <div className="py-4 text-center">
    <button
      type="button"
      onClick={() => setPage((p) => p + 1)}
      disabled={isFetching}
      className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg disabled:opacity-50"
    >
      {isFetching ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <LibraryIcon className="w-4 h-4" />
      )}
      加载更多
    </button>
  </div>
  ```
- **PC**：`gacode-electron/src/routes/Library.tsx:364-375`
  ```tsx
  {hasMore ? (
    <div className="flex justify-center mt-4">
      <Button variant="ghost" size="md" loading={isFetching} onClick={() => setPage((p) => p + 1)}>
        加载更多
      </Button>
    </div>
  ) : null}
  ```
- **判定**：形态不同（PC 的 ghost Button 有 `rounded-md` + `h-10 px-4` + `gap-2` + hover 底色，web 是无底色纯文字 + 前置 16px 书本图标）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：`{!keyword.trim() && hasMore ? (` 分支内的 `<div className="flex justify-center mt-4">`
  - 改为：
    ```tsx
    <div className="py-4 text-center">
      <button
        type="button"
        onClick={() => setPage((p) => p + 1)}
        disabled={isFetching}
        className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg disabled:opacity-50"
      >
        {isFetching ? (
          <SpinnerIcon className="w-4 h-4 animate-spin" />
        ) : (
          <LibraryIcon className="w-4 h-4" />
        )}
        加载更多
      </button>
    </div>
    ```
  - 依赖：`SpinnerIcon` 同 L-11 需新增（lucide Loader2）。`LibraryIcon` 已有，但 `Library.tsx:507-528` 的 svg 是 `width="24" height="24"` 硬编码，`w-4 h-4` className 不会生效（svg 无 `width:100%` 语义）→ 需给 `LibraryIcon` 加 `className` 已有（`LibraryIcon` 定义里 `className={className}` ✓ 已支持），但 **width/height 硬编码 24 会盖掉 tailwind 的 w-4** → 需把 `LibraryIcon` 的 `width="24" height="24"` 改成 `width="100%" height="100%"` 或加 `w-4 h-4` 到 svg 上。
    - ⚠️ 同 L-18：若已把 `LibraryIcon` 改成 Construction path，则此处图标也跟着变；两处需一并定稿（web 空态是 Construction，加载更多是 Library 书本）。→ **需要两个独立图标函数**：`LibraryIcon`（书本，保留原样但改尺寸属性）+ `ConstructionIcon`（新增）。
- **预估改动**：约 20 行

### L-24 · 翻页后列表被替换而非累积（数据通路，高价值）
- **web**：`gacode-web/src/app/(main)/library/page.tsx:200-218`
  ```tsx
  useEffect(() => {
    if (!pageData) return;
    setHasMore(pageData.hasMore);
    if (page === 1) {
      setItems(pageData.items || []);
    } else {
      setItems((cur) => [...cur, ...(pageData.items || [])]);
    }
    …
  }, [pageData, page]);
  ```
- **PC**：`gacode-electron/src/routes/Library.tsx:121-134`
  ```tsx
  const filteredItems: LibraryItem[] = useMemo(() => {
    const raw = data?.items ?? [];
    …
  }, [data?.items, type, sort]);
  ```
  `data` 来自 `useQuery({ queryKey: ["library", { type, tag, keyword, page }] })`（`Library.tsx:108`），`page` 进 queryKey → 点「加载更多」后 `data` 变成 **第 2 页** 的 items，`filteredItems` 只剩第 2 页内容，**第 1 页消失**。
- **判定**：缺失（累积逻辑）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：`const filteredItems: LibraryItem[] = useMemo(() => {`（`Library.tsx:121`）
  - 新增 state（放在 `Library.tsx:79` 之后）：
    ```tsx
    /** 累积的列表项 — web 端用 setItems 累加分页结果, PC 需自持一份 */
    const [items, setItems] = useState<LibraryItem[]>([]);
    ```
  - 新增 effect（放在 `useQuery` 之后，`Library.tsx:118` 之后）：
    ```tsx
    // web 端 setItems 累积语义: 第 1 页替换, 第 2 页起追加
    useEffect(() => {
      if (!data) return;
      if (page === 1) {
        setItems(data.items ?? []);
      } else {
        setItems((cur) => [...cur, ...(data.items ?? [])]);
      }
    }, [data, page]);
    ```
  - ⚠️ **PC 侧必须加「已消费 data 快照守卫」（2026-10-26 PM 拍板：认可保留）**：web 的依赖数组 `[pageData, page]` **不能直接抄到 PC** —— PC 的 `useQuery` 保留了 `placeholderData: (prev) => prev`（web 没有），翻页瞬间 `data` 引用不变、`page` 变 2 ⇒ effect 会**把第 1 页重复追加一次**。落地时加了 `consumedDataRef`（已消费 data 快照守卫）：只有 `data` 引用真正变化过才累积，单独 `page` 变化不触发追加。这是 PC 侧必要的适配，**不是偏离 web**。
  - `filteredItems` 的 `raw` 改为 `items`，依赖数组改为 `[items, type, sort]`
  - ⚠️ 副作用：`resetFilters()`（`Library.tsx:144-147`）在切 type/tag/keyword 时要同时 `setItems([])`，否则旧页数据会残留
- **预估改动**：约 12 行

### L-25 · 服务端返回后清理已消失的选中项
- **web**：`gacode-web/src/app/(main)/library/page.tsx:208-217`
  ```tsx
  setSelectedIds((cur) => {
    if (cur.size === 0) return cur;
    const nextIds = new Set((pageData.items || []).map((it) => String(it.id)));
    const filtered = new Set<string>();
    cur.forEach((id) => { if (nextIds.has(id)) filtered.add(id); });
    return filtered;
  });
  ```
  （注释：「清掉选中的 id (可能在 server 重过滤后已经不存在)」）
- **PC**：`gacode-electron/src/routes/Library.tsx` 全文无此逻辑
- **判定**：缺失（**P3 · 代码级差异，实际影响面小** —— 见下方「影响面修正」）
- **怎么改**（**2026-10-26 PM 拍板：裁剪基准用「累积的 `items`」，不用当前页 `data.items`**）：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：L-24 新增的 effect 之后
  - 新增：
    ```tsx
    // 服务端重过滤后, 剔除已不存在的选中 id (web 端同款)
    // ⚠️ 基准必须是「累积的 items」(L-24 新增的 state), 不能用当前页 data.items ——
    //    PC 列表是累积的, 按当前页裁剪会在翻到第 2 页时把第 1 页的选中清掉
    useEffect(() => {
      if (!data) return;
      const nextIds = new Set(items.map((it) => String(it.id)));
      setSelectedIds((cur) => {
        if (cur.size === 0) return cur;
        const filtered = new Set<string>();
        cur.forEach((id) => { if (nextIds.has(id)) filtered.add(id); });
        return filtered;
      });
    }, [data, items]);
    ```
  - **为什么不能直接抄 web 的 `pageData.items`**：web 的清理**只对当前页**生效；PC 落地 L-24 后列表同样是累积的 `items`，若按当前页裁剪，**点「加载更多」到第 2 页会把第 1 页的选中项全清掉** —— 这是 PC 引入 L-24 后的回归。⇒ 裁剪基准改成累积的 `items`（**1 行改动**，PM 已拍板）。
  - **语义缺口（原文未写清，2026-10-26 复核补）**：web 的清理只对当前页生效，PC 改成累积基准后**跨页选中会被正确保留**，只有真正从列表里消失的条目才被剔除。
- **预估改动**：约 12 行
- **影响面修正（2026-10-26 复核，E-3）**：原结论「搜完再切 tab，底部『删除 N 项』里的 N 可能包含看不见的条目」**在 PC 上不成立** —— 代码级事实成立（web `library/page.tsx:209-217` 有剔除、PC 无等效逻辑），但 PC 切 type / tag / keyword **三处都调 `resetFilters()`**（`Library.tsx:265` / `:320` / `:334`），而 `resetFilters` 内含 `setSelectedIds(new Set())`（`Library.tsx:146`）⇒ **切 tab / 改搜索词时选中已被清空**，「N 包含看不见的条目」不会发生。⇒ 本条**降级为 P3 · 代码级差异，实际影响面小**，原用户可见后果已删除。
- **附带（web 侧自身也不严谨）**：web 的剔除逻辑以**当前页** items 为基准（`library/page.tsx:209-217` 用 `pageData.items`），`page > 1` 时只会拿第 2 页的 items 做基准 ⇒ **会把第 1 页的选中项全剔掉**。

### L-26 · 每页条数：24 → 30
- **web**：`gacode-web/src/app/(main)/library/page.tsx:188` + `194` → `pageSize: 30`（queryKey 里也带 `pageSize: 30`）
- **PC**：`gacode-electron/src/routes/Library.tsx:66` → `const PAGE_SIZE = 24;`（`Library.tsx:114` 传给 listLibrary）
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：`const PAGE_SIZE = 24;`
  - 改为：`const PAGE_SIZE = 30;`
  - （queryKey `Library.tsx:108` 未含 pageSize，PC 是模块常量、不随 props 变，无需进 key）
- **预估改动**：1 行

### L-27 · 缺 ErrorBoundary 包裹
- **web**：`gacode-web/src/app/(main)/library/page.tsx:130-136`
  ```tsx
  export default function LibraryPage() {
    return (
      <ErrorBoundary title="知识库加载失败" description="请刷新重试,或稍后再试一次">
        <LibraryPageInner />
      </ErrorBoundary>
    );
  }
  ```
  （`gacode-web/src/components/ErrorBoundary.tsx`）
- **PC**：`gacode-electron/src/routes/Library.tsx:68` `export function Library() {` — 无边界
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：`export function Library() {`（`Library.tsx:68`）
  - 改法：新建 `D:\gaga\gaclaw-project\gacode-electron\src\components\common\ErrorBoundary.tsx`（class component，`componentDidCatch` + `getDerivedStateFromError`，props: `{ title: string; description?: string; children: ReactNode }`；失败态渲染 `rounded-2xl bg-card p-10 text-center` + 标题 + 描述 + 「重试」按钮 `location.reload()`），再包一层：
    ```tsx
    export function Library() {
      return (
        <ErrorBoundary title="知识库加载失败" description="请刷新重试,或稍后再试一次">
          <LibraryInner />
        </ErrorBoundary>
      );
    }
    ```
    并把原函数体改名 `LibraryInner`。
  - 依赖：PC 无 `ErrorBoundary` 组件 → **需新增**（约 60 行）
- **预估改动**：约 65 行

### L-28 · 多选模式时全局标题显示「已选 N 项」
- **web**：`gacode-web/src/app/(main)/library/page.tsx:166-169`
  ```tsx
  useEffect(() => {
    setHeaderTitle(isMultiSelectMode ? `已选 ${selectedIds.size} 项` : "知识库");
    return () => setHeaderTitle("新对话");
  }, [setHeaderTitle, isMultiSelectMode, selectedIds.size]);
  ```
- **PC**：`gacode-electron/src/routes/Library.tsx` — 无 header title 机制；多选计数显示在底部 toolbar（`MultiSelectToolbar.tsx:46-48`「已选 N 条」）
- **判定**：形态不同（信息位置不同：web 在全局顶栏，PC 在底部栏）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\layout\AppShell.tsx`（PC 顶栏容器）+ `src\routes\Library.tsx`
  - 锚点：先在 `AppShell.tsx` 里定位「当前路由标题」的渲染点（需读该文件确认标题来源），新增一个可选 context/store 字段 `headerTitle?: string`
  - `Library.tsx` 新增 effect：
    ```tsx
    /** 多选时把计数同步到全局顶栏 — web 端 setHeaderTitle('已选 N 项') */
    useEffect(() => {
      setHeaderTitle(isInMultiSelect ? `已选 ${selectedIds.size} 项` : "知识库");
      return () => setHeaderTitle("新对话");
    }, [setHeaderTitle, isInMultiSelect, selectedIds.size]);
    ```
  - ⚠️ 需确认 PC 端 `AppShell` 是否已有按路由设置标题的机制；若已有则只加「多选覆盖」一条分支，估算 5 行；若没有，需新建 store 字段，估算 20 行。
- **预估改动**：5~20 行（取决于 AppShell 现状，未读）

## 1.4 列表行（LibraryCard）

### L-29 · 行卡片 className：补 `w-full` / `shadow-sm` / `transition-colors`，`items-start` → `items-center`
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1032-1037`
  ```tsx
  className={cn(
    "w-full flex items-center gap-3 p-4 rounded-2xl shadow-sm transition-colors text-left cursor-pointer select-none",
    isMultiSelectMode && isSelected
      ? "bg-muted ring-1 ring-brand/50"
      : "bg-card hover:bg-muted/50"
  )}
  ```
- **PC**：`gacode-electron/src/components/library/LibraryCard.tsx:113-122`
  ```tsx
  className={[
    "text-left rounded-2xl p-4 flex items-start gap-3 select-none",
    "cursor-pointer",
    isInMultiSelect && isSelected
      ? "bg-bg-elevated ring-1 ring-brand/60"
      : isInMultiSelect
        ? "bg-bg-sunken hover:bg-bg-elevated"
        : "bg-bg-elevated hover:bg-bg-sunken",
  ].join(" ")}
  ```
- **判定**：形态不同（5 处）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\LibraryCard.tsx`
  - 锚点：`export function LibraryCard({` 内 `<div role="button" tabIndex={0}` 的 className 数组
  - 改为：
    ```tsx
    className={[
      "w-full flex items-center gap-3 p-4 rounded-2xl shadow-sm transition-colors text-left cursor-pointer select-none",
      isInMultiSelect && isSelected
        ? "bg-muted ring-1 ring-brand/50"
        : "bg-card hover:bg-muted/50",
    ].join(" ")}
    ```
  - 说明：
    - `items-start` → `items-center`（web 垂直居中）
    - 补 `w-full`（web 行铺满容器宽）
    - 补 `shadow-sm`（PC Tailwind `shadow-sm` = `0 1px 2px 0 rgb(0 0 0 / 0.5)`，见 `tailwind.config.ts:208`）
    - 补 `transition-colors`（web 有，PC 无 → hover 底色会瞬变）
    - 三态统一为 web 的两态：PC 的第三态 `bg-bg-sunken hover:bg-bg-elevated` 删掉（web 多选未选中态就是 `bg-card hover:bg-muted/50`）
- **预估改动**：约 8 行

### L-30 · 多选 checkbox：圆图标 → 方框打勾
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1039-1048`
  ```tsx
  {isMultiSelectMode && (
    <div className="shrink-0">
      {isSelected ? (
        <CheckCircle2 className="w-5 h-5 text-brand" />
      ) : (
        <Circle className="w-5 h-5 text-fg-muted" />
      )}
    </div>
  )}
  ```
- **PC**：`gacode-electron/src/components/library/LibraryCard.tsx:125-137`
  ```tsx
  {isInMultiSelect ? (
    <span aria-hidden="true" className={["shrink-0 w-5 h-5 mt-0.5 inline-flex items-center justify-center rounded border", isSelected ? "bg-fg border-fg text-bg-base" : "bg-bg-base border-border text-transparent"].join(" ")}>
      ✓
    </span>
  ) : null}
  ```
- **判定**：形态不同（web = lucide 实心圆勾 / 空心圆；PC = 方框 + 文字 `✓`）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\LibraryCard.tsx`
  - 锚点：`{isInMultiSelect ? (` 那个 `<span aria-hidden="true">`
  - 改为：
    ```tsx
    {isInMultiSelect ? (
      <span className="shrink-0 inline-flex items-center justify-center">
        {isSelected ? (
          <CheckCircleIcon className="w-5 h-5 text-brand" />
        ) : (
          <CircleIcon className="w-5 h-5 text-fg-muted" />
        )}
      </span>
    ) : null}
    ```
  - 新增 2 个 svg 函数（lucide，stroke-width 2，24 viewbox）：
    - `CheckCircleIcon`：`M21.801 10A10 10 0 1 1 17 3.335` + `m9 11 3 3L22 4`
    - `CircleIcon`：`<circle cx="12" cy="12" r="10"/>`
  - ⚠️ 两个图标都要能被 `w-5 h-5` 生效 → svg 上必须写 `width="100%" height="100%"` 或直接写 `className` 且不带硬编码 width/height 属性。PC 现有 svg 函数（如 `LibraryCard.tsx:221-229`）都是硬编码 `width="16" height="16"`，`w-5 h-5` **不会生效**，需按此规则写新函数。
- **预估改动**：约 16 行

### L-31 · 类型图标容器：尺寸 / 圆角 / 底色
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1049-1054`
  ```tsx
  <div className="shrink-0 w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
    {typeIcon(item.type)}
  </div>
  ```
- **PC**：`gacode-electron/src/components/library/LibraryCard.tsx:139-141`
  ```tsx
  <div className="shrink-0 w-9 h-9 rounded bg-bg-sunken flex items-center justify-center text-fg-muted">
    <Icon />
  </div>
  ```
- **判定**：形态不同（40px→36px、rounded-xl→rounded、bg-muted→bg-bg-sunken）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\LibraryCard.tsx`
  - 锚点：`<div className="shrink-0 w-9 h-9 rounded bg-bg-sunken flex items-center justify-center text-fg-muted">`
  - 改为：`className="shrink-0 w-10 h-10 rounded-xl bg-muted flex items-center justify-center"`
  - 注：`text-fg-muted` 移到图标自身（见 L-32），容器不再设色
  - ⚠️ **L-31 与 L-32 必须同批落地**（2026-10-26 PM 拍板）：L-31 单独落地时颜色无处可去 —— 容器已不设色、图标自身还没上色 ⇒ **图标颜色会短暂变亮**。L-32（类型图标按类型上色）排进下一批时，两条一起落。
- **预估改动**：1 行

### L-32 · 类型图标颜色：PC 全灰 → web 按类型上色
- **web**：`gacode-web/src/app/(main)/library/page.tsx:117-128`
  ```tsx
  function typeIcon(type: LibraryItem["type"]) {
    switch (type) {
      case "image": return <ImageIcon className="w-5 h-5 text-brand-cyan" />;
      case "doc":   return <FileText className="w-5 h-5 text-brand-yellow" />;
      case "link":  return <LinkIcon className="w-5 h-5 text-brand-green" />;
      default:       return <FileText className="w-5 h-5 text-fg-muted" />;
    }
  }
  ```
  - image → `text-brand-cyan`（`#0dcaf0`，PC token 存在：`tailwind.config.ts:48`）
  - doc → `text-brand-yellow`（`#ffc700`，`tailwind.config.ts:47`）
  - link → `text-brand-green`（`#198754`，`tailwind.config.ts:49`）
  - default（含 text）→ `text-fg-muted`
  - 尺寸统一 `w-5 h-5`（20px）
- **PC**：`gacode-electron/src/components/library/LibraryCard.tsx:49-53` — `const Icon = item.type === "image" ? ImageIcon : item.type === "doc" ? FileTextIcon : item.type === "link" ? LinkIcon : TextIcon;`，且 4 个图标函数（`LibraryCard.tsx:221-259`）都是 **16px 硬编码、无颜色**；颜色靠父级 `text-fg-muted` 统一
- **判定**：形态不同（尺寸 20→16、颜色 4 态→1 态、text 类型图标 FileText→TextIcon）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\LibraryCard.tsx`
  - 锚点：`LibraryCard` 函数体内的 `const Icon = …` 那一段
  - 改为（颜色 + 尺寸靠 className 传入，svg 需支持 className）：
    ```tsx
    // web 端 typeIcon: image=cyan / doc=yellow / link=green / 其它=muted, 尺寸统一 20px
    const typeIconClass =
      item.type === "image" ? "text-brand-cyan" :
      item.type === "doc" ? "text-brand-yellow" :
      item.type === "link" ? "text-brand-green" :
      "text-fg-muted";
    ```
  - 渲染改为：
    ```tsx
    <div className="shrink-0 w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
      {item.type === "image" ? <ImageIcon className="w-5 h-5" /> :
       item.type === "doc" ? <FileTextIcon className="w-5 h-5" /> :
       item.type === "link" ? <LinkIcon className="w-5 h-5" /> :
       <FileTextIcon className="w-5 h-5" />}
    </div>
    ```
  - 4 个 svg 函数（`LibraryCard.tsx:221-259`）需改造：签名加 `className` prop，属性改 `width="100%" height="100%"`（否则 tailwind 尺寸不生效），并保留 `stroke="currentColor"` 以继承容器色
  - web 的 `text` 类型走 `default` 分支用 **FileText** 图标（不是 Text 图标）→ PC 现有 `TextIcon` 不再用于此处
- **预估改动**：约 25 行

### L-33 · 行标题：`truncate` 单行 → `line-clamp-2` 两行 + `break-all`
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1056`
  ```tsx
  <div className="text-sm font-medium truncate">{item.title || "未命名"}</div>
  ```
- **PC**：`gacode-electron/src/components/library/LibraryCard.tsx:152-154`
  ```tsx
  <h3 className="text-sm font-medium text-fg line-clamp-2 break-all">
    {item.title || "(无标题)"}
  </h3>
  ```
- **判定**：形态不同（行数 1→2、换行策略 break-all、兜底文案）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\LibraryCard.tsx`
  - 锚点：`<h3 className="text-sm font-medium text-fg line-clamp-2 break-all">`
  - 改为：`<div className="text-sm font-medium truncate">{item.title || "未命名"}</div>`
  - 注：`truncate` = `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`（PC tailwind 默认有）
  - 兜底文案 `"(无标题)"` → `"未命名"`
- **预估改动**：2 行

### L-34 · 行副行：时间色 `text-fg-muted` vs PC `text-fg-subtle`；标签分隔方式不同
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1057-1068`
  ```tsx
  <div className="text-xs text-fg-muted mt-0.5 truncate">
    {time}
    {item.tags && item.tags.length > 0 && (
      <span className="ml-2 inline-flex gap-2 truncate">
        {item.tags.slice(0, 3).map((t) => (
          <span key={t} className="text-fg-muted/70 truncate">#{t}</span>
        ))}
      </span>
    )}
  </div>
  ```
- **PC**：`gacode-electron/src/components/library/LibraryCard.tsx:155-164`
  ```tsx
  <div className="flex items-center gap-2 flex-wrap">
    <p className="text-xs text-fg-subtle">{formatRelative(item.createdAt)}</p>
    {item.tags && item.tags.length > 0 ? (
      <p className="text-xs text-fg-subtle truncate">
        {item.tags.slice(0, 3).map((t) => `#${t}`).join(" ")}
      </p>
    ) : null}
  </div>
  ```
- **判定**：形态不同（3 处：时间色、标签色、标签分隔）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\LibraryCard.tsx`
  - 锚点：`<div className="flex items-center gap-2 flex-wrap">`（PC 自有 `mt-0.5` 差异）
  - 改为：
    ```tsx
    <div className="text-xs text-fg-muted mt-0.5 truncate">
      {formatRelative(item.createdAt)}
      {item.tags && item.tags.length > 0 && (
        <span className="ml-2 inline-flex gap-2 truncate">
          {item.tags.slice(0, 3).map((t) => (
            <span key={t} className="text-fg-muted/70 truncate">#{t}</span>
          ))}
        </span>
      )}
    </div>
    ```
  - 副作用：`<div className="flex-1 min-w-0 space-y-1">`（`LibraryCard.tsx:143`）里的 `space-y-1` 会给两个子元素加 4px 间距 —— 改成单个 `<div>` 后 `space-y-1` 失效但也无副作用；若 PC 的类型 chip 行（`LibraryCard.tsx:144-151`）保留，该行仍会占 space-y-1 的间距。**类型 chip 行属 PC 增强，保留不动**，但它会让 PC 副行位置比 web 低一行 —— 见 L-35。
- **预估改动**：约 10 行

### L-35 · PC 行内多了「类型 chip + #id」行（导致行高与 web 不一致）
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1055-1069` — 文字块只有 **2 行**（标题 + 时间/标签）
- **PC**：`gacode-electron/src/components/library/LibraryCard.tsx:143-151`
  ```tsx
  <div className="flex-1 min-w-0 space-y-1">
    <div className="flex items-center gap-2">
      <span className="text-xs px-1.5 py-0.5 rounded bg-bg-sunken text-fg-muted">
        {TYPE_LABEL[item.type] || item.type}
      </span>
      <span className="text-xs text-fg-subtle font-mono truncate">#{item.id}</span>
    </div>
    <h3 …>
  ```
- **判定**：**形态不同**（PC 增强项，web 没有这一行）——但它让 PC 行高多出约 20px，与 web 视觉不等高。**归位：X-02（2026-10-26 复核 —— 这不是结构级差异，已并入 §七 的「形态不同」统计）**：仍需 gaga 拍 —— 是保留 PC 的类型 chip/#id 行，还是 1:1 删掉以对齐 web 的两行卡片。
- **怎么改**：本条不给「怎么改」，等 gaga 拍板（见文末 X-02）。
- **预估改动**：待定（删掉 = 8 行 / 保留 = 0）

### L-36 · 「更多操作」⋯ 按钮：hover 底色 + 过渡 + 图标尺寸
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1071-1088`
  ```tsx
  className="shrink-0 w-8 h-8 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center"
  ```
  图标 `<MoreVertical className="w-4 h-4" />`（16px，lucide stroke-width 2）
- **PC**：`gacode-electron/src/components/library/LibraryCard.tsx:176-183`
  ```tsx
  className="w-8 h-8 rounded-full text-fg-muted hover:bg-bg-base hover:text-fg inline-flex items-center justify-center"
  ```
  图标 `<MoreVertIcon />`（`LibraryCard.tsx:261-269`，硬编码 `width="18" height="18"`）
- **判定**：形态不同（3 处）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\LibraryCard.tsx`
  - 锚点：`<button type="button" aria-label="更多操作"` 的 className
  - 改为：`"shrink-0 w-8 h-8 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center"`
  - 同时把 `MoreVertIcon`（`LibraryCard.tsx:261-269`）的 `width="18" height="18"` 改成 `width="100%" height="100%"` + 支持 `className` prop（lucide MoreVertical 是 3 个 r=1.5 实心圆 + strokeWidth 2）
- **预估改动**：约 6 行

### L-37 · 行右键：PC 直接开编辑弹窗，web 弹上下文菜单
- **web**：`gacode-web/src/app/(main)/library/page.tsx:903-910`
  ```tsx
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (isMultiSelectMode) { onToggleSelect?.(); return; }
    setMenuPos({ x: e.clientX, y: e.clientY });
  };
  ```
  菜单渲染在 `library/page.tsx:1094-1154`（详见 L-38 ~ L-42）
- **PC**：`gacode-electron/src/components/library/LibraryCard.tsx:91-100`
  ```tsx
  onContextMenu={(e) => {
    e.preventDefault();
    if (isInMultiSelect) { onToggleSelect(); }
    else { onEdit(); }
  }}
  ```
- **判定**：形态不同（PC 无菜单，右键直接开编辑）
- **怎么改**：见 L-38 ~ L-42（新增菜单组件后，`onContextMenu` 改为打开菜单）
- **预估改动**：见 L-38

### L-38 · 右键/⋯ 上下文菜单：整个组件缺失
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1094-1154`
  ```tsx
  {menuPos && (
    <div
      role="menu"
      style={{ left: menuPos.x, top: menuPos.y }}
      className="fixed z-[70] min-w-[160px] rounded-xl bg-popover shadow-2xl py-1"
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={…} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-bg-sunken transition-colors">
        <Eye className="w-4 h-4 text-fg-muted" />详情
      </button>
      <button … className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-bg-sunken transition-colors">
        <Tag className="w-4 h-4 text-fg-muted" />编辑
      </button>
      {item.url && (
        <button … className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-bg-sunken transition-colors">
          <ExternalLink className="w-4 h-4 text-fg-muted" />在新窗口打开
        </button>
      )}
      <div className="my-1" />
      <button … className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger-soft/40 transition-colors">
        <Trash2 className="w-4 h-4" />删除
      </button>
    </div>
  )}
  ```
  菜单定位逻辑（`library/page.tsx:1075-1083`）：⋯ 按钮点击时取 `getBoundingClientRect()`，`x = Math.min(rect.left, window.innerWidth - 180)`、`y = rect.bottom + 4`
  关闭逻辑（`library/page.tsx:939-954`）：Esc 关闭 + 下一帧挂 outside-click 关闭
- **PC**：`gacode-electron/src/components/library/LibraryCard.tsx` — 只有 `DropdownMenu` 组件（2 项：编辑 / 删除），无 web 形态的浮层菜单
- **判定**：缺失（浮层菜单容器 + 4 个菜单项 + 定位/关闭逻辑）
- **怎么改**：
  - 目标文件（新建）：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\LibraryRowMenu.tsx`
  - props 签名：
    ```tsx
    export interface LibraryRowMenuProps {
      /** 菜单位置 (视口坐标) — null 表示关闭 */
      pos: { x: number; y: number } | null;
      /** 是否有 url — 决定「在新窗口打开」项是否渲染 */
      hasUrl: boolean;
      onClose: () => void;
      onDetail: () => void;
      onEdit: () => void;
      onOpenExternal: () => void;
      onDelete: () => void;
    }
    ```
  - 渲染（逐字抄 web）：
    ```tsx
    <div
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[70] min-w-[160px] rounded-xl bg-popover shadow-2xl py-1"
      onClick={(e) => e.stopPropagation()}
    >
      <button type="button" role="menuitem" onClick={onDetail} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-bg-sunken transition-colors">
        <EyeIcon className="w-4 h-4 text-fg-muted" />详情
      </button>
      <button type="button" role="menuitem" onClick={onEdit} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-bg-sunken transition-colors">
        <TagIcon className="w-4 h-4 text-fg-muted" />编辑
      </button>
      {hasUrl && (
        <button type="button" role="menuitem" onClick={onOpenExternal} className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-bg-sunken transition-colors">
          <ExternalLinkIcon className="w-4 h-4 text-fg-muted" />在新窗口打开
        </button>
      )}
      <div className="my-1" />
      <button type="button" role="menuitem" onClick={onDelete} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger-soft/40 transition-colors">
        <Trash2Icon className="w-4 h-4" />删除
      </button>
    </div>
    ```
  - 依赖：需新增 4 个 svg 函数 `EyeIcon` / `TagIcon` / `ExternalLinkIcon` / `Trash2Icon`（lucide，16px 生效需 `width="100%" height="100%"`）
  - `LibraryCard.tsx` 侧改动：新增 state `const [menuPos, setMenuPos] = useState<{x:number;y:number} | null>(null);`
  - `onContextMenu` 改为 `setMenuPos({ x: e.clientX, y: e.clientY })`
  - ⋯ 按钮 `onClick` 改为：
    ```tsx
    onClick={(e) => {
      e.stopPropagation();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setMenuPos({ x: Math.min(rect.left, window.innerWidth - 180), y: rect.bottom + 4 });
    }}
    ```
  - 关闭逻辑（在 `LibraryCard.tsx` 内新增 effect）：Esc 关闭 + `setTimeout(…, 0)` 后挂 outside-click 关闭（避免打开菜单的 contextmenu 立刻被关掉），cleanup 里移除
- **预估改动**：约 90 行（组件 ~55 + 4 图标 ~35 + 接线 ~15）

### L-39 · 菜单项「详情」缺失
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1101-1113`（Eye 图标 + 文案「详情」，`onClick` → `router.push(\`/library/${item.id}\`)`）
- **PC**：`gacode-electron/src/components/library/LibraryCard.tsx:184-187` — `DropdownMenu` items 只有 `编辑` / `删除`
- **判定**：缺失
- **怎么改**：随 L-38 一起。`LibraryRowMenu` 的 `onDetail` → 复用现有 `onOpen`（`Library.tsx:356` 传的是 `navigate(\`/library/${it.id}\`)`）
- **预估改动**：3 行

### L-40 · 菜单项「在新窗口打开」缺失
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1126-1139` — 仅当 `item.url` 存在时渲染；`onClick` → `open()`（`library/page.tsx:884-887` 的 `router.push`，注释说「替换旧的 window.open」—— **实际仍是跳详情页，不是开新窗口**，web 此处是死逻辑）
- **PC**：`gacode-electron/src/components/library/LibraryCard.tsx:184-187` — 无此项
- **判定**：缺失（web 有此菜单项）
- **怎么改**：随 L-38 一起加 `ExternalLinkIcon` 项 + `hasUrl` 条件 + `onOpenExternal` 回调。
  - 行为对齐 web：`onOpenExternal` 走 `onOpen()`（跳详情页），**不要**改成 `window.open`（web 实际也是跳详情页）
- **预估改动**：3 行

### L-41 · 菜单分隔线 `<div className="my-1" />` 缺失
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1140`
- **PC**：`gacode-electron/src/components/library/LibraryCard.tsx:184-187` — 无
- **判定**：缺失
- **怎么改**：随 L-38 一起，在「在新窗口打开」与「删除」之间插入 `<div className="my-1" />`
- **预估改动**：1 行

### L-42 · 「删除」菜单项样式：`text-danger hover:bg-danger-soft/40`
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1148`
  ```
  "w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger-soft/40 transition-colors"
  ```
- **PC**：`gacode-electron/src/components/library/LibraryCard.tsx:186` → `{ label: "删除", destructive: true, onClick: onDelete }`（PC `DropdownMenu` 内部实现未读，`destructive` 语义需核对）
- **判定**：形态不同（需读 `gacode-electron/src/components/ui/DropdownMenu.tsx` 确认 destructive 实际 className 后再定）
- **怎么改**：随 L-38 一起，删除项 className 逐字抄 web 串。
- ⚠️ **不能单条执行（依赖 L-38）**：本条要改的是 L-38 新建的 `LibraryRowMenu` 里的「删除」菜单项，没有 L-38 的菜单组件就没有承载处 ⇒ **已从 §八 快车道清单移除**（2026-10-26 复核）。
- **预估改动**：1 行

### L-43 · 鼠标长按 500ms 也会进多选（web 只绑 touch）
- **web**：`gacode-web/src/app/(main)/library/page.tsx:915-930` — 长按检测只绑 `onTouchStart/onTouchEnd/onTouchCancel`；桌面端入口是**右键菜单**
- **PC**：`gacode-electron/src/components/library/LibraryCard.tsx:101-106`
  ```tsx
  onMouseDown={startPress}
  onMouseUp={endPress}
  onMouseLeave={endPress}
  onTouchStart={startPress}
  ```
- **判定**：形态不同（PC 鼠标按住 500ms 也会进多选，web 鼠标必须右键）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\LibraryCard.tsx`
  - 锚点：`onMouseDown={startPress}` / `onMouseUp={endPress}` / `onMouseLeave={endPress}` 三行
  - 1:1 还原 → 删掉这 3 行，只保留 touch 三行
  - ⚠️ 副作用：PC 端 `ChatList` 的 `ChatRow` 用同一套 mouse+touch 长按模式（`LibraryCard.tsx:55` 注释提到），删后知识库卡在桌面端就只能右键进多选（与 web 一致）
- **预估改动**：3 行（删）

### L-44 · 长按时长：PC 500ms / web 500ms
- **web**：`gacode-web/src/app/(main)/library/page.tsx:920-929` — `setTimeout(…, 500)`
- **PC**：`gacode-electron/src/components/library/LibraryCard.tsx:61-64` — `window.setTimeout(…, 500)`
- **判定**：已一致
- **怎么改**：无
- **预估改动**：0

### L-45 · 长按触发后抑制单击：已一致
- **web**：`gacode-web/src/app/(main)/library/page.tsx:891-894`（`longPressFired` 复位后 return）
- **PC**：`gacode-electron/src/components/library/LibraryCard.tsx:73-78`（`triggeredRef` 复位后 return）
- **判定**：已一致
- **怎么改**：无
- **预估改动**：0

### L-46 · 单击行 → 详情页：已一致
- **web**：`gacode-web/src/app/(main)/library/page.tsx:884-887` → `router.push(\`/library/${item.id}\`)`
- **PC**：`gacode-electron/src/routes/Library.tsx:356` → `onOpen={() => navigate(\`/library/${it.id}\`)}`
- **判定**：已一致
- **怎么改**：无
- **预估改动**：0

## 1.5 多选底部栏

### L-47 · 底栏容器：底色 / 阴影 / 边框 / 容器宽度
- **web**：`gacode-web/src/app/(main)/library/page.tsx:585-586`
  ```tsx
  <div className="sticky bottom-0 z-30 bg-bg-base/95 backdrop-blur shadow-[0_-2px_10px_rgba(0,0,0,0.4)]">
    <div className="px-4 lg:px-8 max-w-3xl mx-auto w-full py-3 flex items-center justify-between gap-2">
  ```
- **PC**：`gacode-electron/src/components/library/MultiSelectToolbar.tsx:45`
  ```
  "sticky bottom-0 z-30 bg-bg-elevated border-t border-border px-4 py-3 flex items-center gap-3"
  ```
- **判定**：形态不同（4 处）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\MultiSelectToolbar.tsx`
  - 锚点：`return ( <>` 内第一个 `<div className="sticky bottom-0 z-30 …">`
  - 改为两层结构（抄 web）：
    ```tsx
    <div className="sticky bottom-0 z-30 bg-bg-base/95 backdrop-blur shadow-[0_-2px_10px_rgba(0,0,0,0.4)]">
      <div className="px-4 lg:px-8 max-w-3xl mx-auto w-full py-3 flex items-center justify-between gap-2">
        …按钮…
      </div>
    </div>
    ```
  - 具体删改：`bg-bg-elevated` → `bg-bg-base/95`；删 `border-t border-border`；加 `backdrop-blur shadow-[0_-2px_10px_rgba(0,0,0,0.4)]`；内层加 `px-4 lg:px-8 max-w-3xl mx-auto w-full`；`justify-between`（PC 是 `gap-3` + 靠 `flex-1` 撑开）
  - 注：web 注释（`library/page.tsx:580-583`）明确「去掉 border-t 分隔线 — 用 sticky 阴影 + 留白把 bar 跟列表隔开」
  - ⚠️ **PC 侧：`flex-1` 占位要删（2026-10-26 PM 拍板）** —— PC 现有内层是 `flex items-center gap-3` + 一个 `<div className="flex-1" />` 占位把按钮推右；改成 web 的 `justify-between` 后，**若保留 `flex-1` 占位则 `justify-between` 视觉上不生效**（占位已经把两侧撑开了）⇒ **删掉 `flex-1` 占位**，让 `justify-between` 生效。
  - 「**已选 N 条**」那一行（属 L-52）**本批不删**，保留到 L-52 与 L-28 一并处理。
- **预估改动**：约 6 行

### L-48 · 「全选」按钮 variant：`ghost` → `outline`
- **web**：`gacode-web/src/app/(main)/library/page.tsx:597-613` → `<Button variant="outline" size="sm" …>`
- **PC**：`gacode-electron/src/components/library/MultiSelectToolbar.tsx:53-60` → `<Button variant="ghost" size="sm" …>`
- **判定**：形态不同（web 有 1px `border-border` 描边，PC 无）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\MultiSelectToolbar.tsx`
  - 锚点：全选按钮 `<Button variant="ghost" size="sm" onClick={onToggleSelectAll} disabled={totalVisible === 0}>`
  - 改为：`<Button variant="outline" size="sm" onClick={onToggleSelectAll} disabled={totalVisible === 0}>`
  - （PC 的 `Button` variant 枚举已含 `outline`，见 `gacode-electron/src/components/ui/Button.tsx:16`）
- **预估改动**：1 行

### L-49 · 「全选」按钮 disabled 态：PC 多一个禁用条件
- **web**：`gacode-web/src/app/(main)/library/page.tsx:597-613` — 全选按钮 **无 disabled**
- **PC**：`gacode-electron/src/components/library/MultiSelectToolbar.tsx:57` — `disabled={totalVisible === 0}`
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\MultiSelectToolbar.tsx`
  - 锚点：全选按钮的 `disabled={totalVisible === 0}`
  - 1:1 还原 → 删除 `disabled` 属性
  - （`totalVisible === 0` 时 web 也会渲染「全选」，点击后 `setSelectedIds(new Set([]))` 无副作用）
- **预估改动**：1 行

### L-50 · 删除按钮文案：`删除 (N)` → `删除 N 项`
- **web**：`gacode-web/src/app/(main)/library/page.tsx:614-625`
  ```tsx
  <Button variant="destructive" size="sm" disabled={selectedIds.size === 0 || batchDeleting} onClick={() => setBatchDeleteOpen(true)}>
    {batchDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : `删除 ${selectedIds.size} 项`}
  </Button>
  ```
- **PC**：`gacode-electron/src/components/library/MultiSelectToolbar.tsx:61-69`
  ```tsx
  <Button variant="danger" size="sm" disabled={selectedCount === 0 || deletePending} loading={deletePending} onClick={onConfirmDelete}>
    {deletePending ? "删除中" : `删除 (${selectedCount})`}
  </Button>
  ```
- **判定**：形态不同（文案 + pending 态文案不同：web 是转圈图标，PC 是「删除中」文字）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\MultiSelectToolbar.tsx`
  - 锚点：删除按钮的 children
  - 改为：删掉 `loading={deletePending}`（PC `Button` 的 `loading` 会渲染 `gagaos-spinner` + children 同时显示），改为
    ```tsx
    {deletePending ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : `删除 ${selectedCount} 项`}
    ```
  - variant：web `destructive` / PC `danger` —— PC 的 `danger` = `bg-danger text-white`，web 的 `destructive` = `#E54a5e` 白字，**等价**，不改
- **预估改动**：2 行

### L-51 · 批量删除确认弹窗：标题 + 确认按钮文案
- **web**：`gacode-web/src/app/(main)/library/page.tsx:631-690`
  ```tsx
  <AlertDialogTitle>确定要删除选中的 {selectedIds.size} 条?</AlertDialogTitle>
  <AlertDialogDescription>选中条目将从知识库移除, 此操作不可撤销。</AlertDialogDescription>
  <AlertDialogCancel disabled={batchDeleting}>取消</AlertDialogCancel>
  <AlertDialogAction tone="danger" disabled={batchDeleting} onClick={…}>
    {batchDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "全部删除"}
  </AlertDialogAction>
  ```
- **PC**：`gacode-electron/src/components/library/MultiSelectToolbar.tsx:72-84`
  ```tsx
  <ConfirmDialog
    title={`确认删除 ${selectedCount} 条?`}
    message={deleteConfirmMessage ?? "此操作不可恢复,请谨慎操作。"}
    confirmLabel="确认删除"
    confirmVariant="danger"
    …
  />
  ```
  调用处 `gacode-electron/src/routes/Library.tsx:412` 传 `deleteConfirmMessage="选中条目将从知识库移除, 此操作不可撤销。"`（描述文案已对齐 ✓）
- **判定**：形态不同（标题文案、确认按钮文案）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\MultiSelectToolbar.tsx`
  - 锚点：`<ConfirmDialog title={…} confirmLabel="确认删除" …>`
  - 改为：`title={\`确定要删除选中的 ${selectedCount} 条?\`}`，`confirmLabel="全部删除"`
  - `ConfirmDialog` 的 pending 态：需读 `gacode-electron/src/components/ui/ConfirmDialog.tsx` 确认是否用 spinner 替代文案（web 是 spinner）；若 PC 显示「确认删除」+ spinner 并存，需给 `ConfirmDialog` 加 `confirmLoadingText` 之类（**待读确认后再定**）
- **预估改动**：2 行 + 可能的 ConfirmDialog 扩展

### L-52 · PC 多选栏多一行「已选 N 条」
- **web**：`gacode-web/src/app/(main)/library/page.tsx:586-626` — 底栏 **只有 3 个按钮**，没有「已选 N 条」文字（计数在全局顶栏，见 L-28）
- **PC**：`gacode-electron/src/components/library/MultiSelectToolbar.tsx:46-49`
  ```tsx
  <span className="text-sm">已选 <strong>{selectedCount}</strong> 条</span>
  <div className="flex-1" />
  ```
- **判定**：形态不同（PC 底栏多一个计数块，且用 `flex-1` 撑开把按钮推右）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\MultiSelectToolbar.tsx`
  - 锚点：`<span className="text-sm">已选 <strong>{selectedCount}</strong> 条</span>` 与 `<div className="flex-1" />`
  - 1:1 还原 → 删掉这两行，容器改 `flex items-center justify-between gap-2`（见 L-47）
  - 注：删掉后计数只在全局顶栏显示（L-28），**L-28 与 L-52 必须一起做**，否则用户看不到选了几个
  - ⏸️ **排期（2026-10-26 PM 拍板）**：L-52 **不在批 1-B**，本批**保留** PC 的「已选 N 条」不动（同时 L-47 已把 `flex-1` 占位删掉，让 `justify-between` 生效）；「已选 N 条」的删除与 L-28 的全局顶栏计数**放到 L-52 那一批一起做**。
- **预估改动**：2 行（删）+ L-28 的 5~20 行

## 1.6 采集（FAB → 入口 Sheet → 表单）

### L-53 · FAB：位置 / 尺寸 / 圆角 / 阴影 / hover / active / 图标
- **web**：`gacode-web/src/app/(main)/library/page.tsx:576-578` → `<CreateFab label="采集内容" onClick={() => setSheetOpen(true)} />`
  web `FAB_CLASS`（`gacode-web/src/components/common/CreateFab.tsx:32-36`）：
  ```
  "fixed bottom-5 right-5 z-40 w-[52px] h-[52px] rounded-lg bg-brand text-brand-on " +
  "grid place-items-center shadow-[0_8px_24px_rgba(255,107,53,0.4)] " +
  "hover:bg-brand-hover hover:-translate-y-px active:scale-[0.96] " +
  "transition-all duration-150"
  ```
  图标（`CreateFab.tsx:54`）：`<Plus className={ICON_CLASS} strokeWidth={2.2} />`，`ICON_CLASS = "w-[22px] h-[22px]"`
  属性（`CreateFab.tsx:47-49`）：`aria-label={label}` + `title={label}`
- **PC**：`gacode-electron/src/routes/Library.tsx:385-399`
  ```tsx
  className={[
    "fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full",
    "bg-brand text-brand-on shadow-lg",
    "hover:bg-brand/90 transition-colors duration-150",
    "inline-flex items-center justify-center",
  ].join(" ")}
  ```
  图标 `<FabPlusIcon />`（`Library.tsx:531-547`，svg 28×28，strokeWidth 2），**无 `title` 属性**
- **判定**：形态不同（8 处）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：`{!isInMultiSelect ? (` 分支内的 `<button type="button" aria-label="采集内容"`
  - className 整串改为：
    ```
    "fixed bottom-5 right-5 z-40 w-[52px] h-[52px] rounded-lg bg-brand text-brand-on grid place-items-center shadow-[0_8px_24px_rgba(255,107,53,0.4)] hover:bg-brand-hover hover:-translate-y-px active:scale-[0.96] transition-all duration-150"
    ```
  - 加 `title="采集内容"`
  - 图标：`FabPlusIcon`（`Library.tsx:531-547`）改为接受 `className` + 尺寸 22px：把 `width="28" height="28"` 改为 `width="100%" height="100%"`（外层按钮 52px 内 22px 由 className 控制），`strokeWidth="2"` → `strokeWidth="2.2"`；调用处 `<FabPlusIcon className="w-[22px] h-[22px]" />`
  - ⚠️ `rounded-lg` 在 PC = 20px（`tailwind.config.ts:142`），web 也是 `rounded-lg`（web 侧 `--r-lg`=20px），**一致**，只需从 `rounded-full` 改过来
  - ⚠️ `shadow-lg` → `shadow-[0_8px_24px_rgba(255,107,53,0.4)]`：PC 无 `shadow-brand-glow` 之外的橙色辉光 token，需用任意值语法
- **预估改动**：约 8 行

### L-54 · 采集入口 Sheet：3 宫格 → 4 tab
> **流程级差异**，逐条写清（见文末 X-03）
- **web 第一步做什么**：点 FAB → 弹出**采集入口 sheet**（`library/page.tsx:693-749`），标题「采集内容」，内容是 `grid grid-cols-3 gap-3` 的三个大按钮：**Text**（Type 图标）/ **Photo**（Camera 图标）/ **File**（File 图标）。
- **PC 现有做法**：点 FAB → 直接打开 `CollectSheet`（`CollectSheet.tsx:198-281`），一个 sheet 内含 4 个 tab 按钮组：**文字 / 链接 / 图片 / 文件**，默认停在「文字」tab。
- **1:1 还原后 PC 第一步应该做什么**：点 FAB → 打开「采集内容」入口 sheet，3 个大按钮 Text / Photo / File；点 **Text** → 再开第二层 sheet（文本框）；点 **Photo** → 打开图片选择；点 **File** → 打开文件选择。
- **判定**：形态不同（信息架构不同）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx` + `src\components\library\CollectSheet.tsx`
  - 锚点：`Library.tsx:439-442` 的 `<CollectSheet open={collectOpen} onClose={…} />`
  - 建议实现（最小改动）：
    1. `CollectSheet.tsx` 新增 prop `step?: "menu" | "form"`（默认 `"menu"`）+ `onPickMode?: (mode: "text" | "photo" | "file") => void`
    2. `step === "menu"` 时渲染 3 宫格（见 L-55 ~ L-58）；`step === "form"` 时渲染现有的 4-tab 表单区
    3. `Library.tsx` 新增 state：`const [collectStep, setCollectStep] = useState<"menu" | "form">("menu");` + `const [collectMode, setCollectMode] = useState<"text" | "photo" | "file">("text");`
    4. `Library.tsx` 的 FAB `onClick` → `setCollectStep("menu"); setCollectOpen(true);`
  - 预估改动：约 60 行（含新 sheet 视觉，见 L-55~L-58）
- **预估改动**：约 60 行

### L-55 · 采集入口 Sheet 容器
- **web**：`gacode-web/src/app/(main)/library/page.tsx:695-747`
  ```tsx
  <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setSheetOpen(false)} aria-hidden="true" />
  <div className="fixed bottom-0 left-0 right-0 z-50 bg-bg-elevated rounded-t-lg p-4 pb-8">
    <div className="flex items-center justify-between mb-4">
      <span className="text-base font-medium">采集内容</span>
      <button type="button" onClick={() => setSheetOpen(false)} aria-label="关闭" className="w-8 h-8 rounded-full text-fg-muted hover:bg-accent transition-colors inline-flex items-center justify-center">
        <X className="w-5 h-5" />
      </button>
    </div>
    <div className="grid grid-cols-3 gap-3"> … </div>
  </div>
  ```
- **PC**：`gacode-electron/src/components/library/CollectSheet.tsx:198-216`
  ```tsx
  <div role="dialog" aria-modal="true" aria-label="采集到知识库" className="fixed inset-0 z-50 flex items-end justify-center">
    <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
    <div className="relative w-full max-w-2xl rounded-t-md bg-bg-elevated shadow-dialog p-5 max-h-[80vh] flex flex-col">
      <div className="flex items-center justify-between mb-3 shrink-0">
        <h2 className="text-base font-medium">采集到知识库</h2>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="关闭">×</Button>
      </div>
  ```
- **判定**：形态不同（7 处）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\CollectSheet.tsx`
  - 锚点：`if (!open) return null;` 之后的 `return (` 根节点
  - 遮罩改为：`<div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />`（`bg-black/60` → `bg-black/50`，`z-50` → `z-40`，`absolute inset-0` → `fixed inset-0`）
  - 面板改为：`<div className="fixed bottom-0 left-0 right-0 z-50 bg-bg-elevated rounded-t-lg p-4 pb-8">`
    - 删 `relative` / `w-full` / `max-w-2xl` / `rounded-t-md` / `shadow-dialog` / `p-5` / `max-h-[80vh]` / `flex flex-col`
    - `rounded-t-lg`（web）= PC 20px ✓；PC 现状 `rounded-t-md`=16px → 改
    - `p-5` → `p-4 pb-8`
  - 标题栏：`<h2 className="text-base font-medium">采集内容</h2>`（web 文案「采集内容」，PC 现在是「采集到知识库」）；`mb-3` → `mb-4`
  - 关闭按钮：PC 的 `×` 文本 → web 的 `<X className="w-5 h-5" />` svg，className `"w-8 h-8 rounded-full text-fg-muted hover:bg-accent transition-colors inline-flex items-center justify-center"`
- **预估改动**：约 20 行

### L-56 · 采集入口 3 宫格按钮：样式 + 图标 + 文案
- **web**：`gacode-web/src/app/(main)/library/page.tsx:717-746`
  ```tsx
  <div className="grid grid-cols-3 gap-3">
    <button type="button" onClick={…text…} className="flex flex-col items-center gap-2 py-5 rounded-md bg-card hover:bg-card-hover transition-colors">
      <Type className="w-7 h-7 text-fg-muted" />
      <span className="text-sm text-fg-muted">Text</span>
    </button>
    <button type="button" onClick={openPhotoPicker} className="flex flex-col items-center gap-2 py-5 rounded-md bg-card hover:bg-card-hover transition-colors">
      <Camera className="w-7 h-7 text-fg-muted" />
      <span className="text-sm text-fg-muted">Photo</span>
    </button>
    <button type="button" onClick={openFilePicker} className="flex flex-col items-center gap-2 py-5 rounded-md bg-card hover:bg-card-hover transition-colors">
      <File className="w-7 h-7 text-fg-muted" />
      <span className="text-sm text-fg-muted">File</span>
    </button>
  </div>
  ```
  图标尺寸 `w-7 h-7`（28px），文案是英文 `Text` / `Photo` / `File`
- **PC**：`gacode-electron/src/components/library/CollectSheet.tsx:218-235` — 4 个小圆角按钮 `px-3 py-1 text-sm rounded`，文案「文字/链接/图片/文件」
- **判定**：形态不同（网格布局、按钮尺寸、图标尺寸、文案语言全不同）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\CollectSheet.tsx`
  - 锚点：`{/* Tabs — 不引 Radix, 自实现按钮组 */}` 注释下的 `<div className="flex items-center gap-2 mb-4 shrink-0">`
  - 改为 3 宫格（`step === "menu"` 时渲染）：
    ```tsx
    <div className="grid grid-cols-3 gap-3">
      <button type="button" onClick={() => { setTab("text"); setStep("form"); }} className="flex flex-col items-center gap-2 py-5 rounded-md bg-card hover:bg-card-hover transition-colors">
        <TypeIcon className="w-7 h-7 text-fg-muted" />
        <span className="text-sm text-fg-muted">Text</span>
      </button>
      <button type="button" onClick={() => { setTab("image"); setStep("form"); }} className="flex flex-col items-center gap-2 py-5 rounded-md bg-card hover:bg-card-hover transition-colors">
        <CameraIcon className="w-7 h-7 text-fg-muted" />
        <span className="text-sm text-fg-muted">Photo</span>
      </button>
      <button type="button" onClick={() => { setTab("file"); setStep("form"); }} className="flex flex-col items-center gap-2 py-5 rounded-md bg-card hover:bg-card-hover transition-colors">
        <FileIcon className="w-7 h-7 text-fg-muted" />
        <span className="text-sm text-fg-muted">File</span>
      </button>
    </div>
    ```
  - 依赖：需新增 3 个 svg 函数 `TypeIcon`（lucide Type：`M4 7V4h16v3` / `M9 20h6` / `M12 4v16`）、`CameraIcon`（lucide Camera：`M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z` + `<circle cx="12" cy="13" r="3"/>`）、`FileIcon`（lucide File：`M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z` + `M14 2v4a2 2 0 0 0 2 2h4`）—— 均需 `width="100%" height="100%"` 才能让 `w-7 h-7` 生效
  - ⚠️ PC Tailwind **无** `bg-card-hover`（`tailwind.config.ts` 里 card 只有 `card`/`card-foreground`，`background-hover` 是 `#0a0a0a`）→ 需用 `hover:bg-background-hover`（`#0a0a0a`）或 `hover:bg-bg-sunken`。**web 的 `bg-card-hover` = `#1e1e1e`，PC 无对应 token** → 建议 PC 用 `hover:bg-bg-elevated`（`#181818`）并在实现备注里写明色差。
- **预估改动**：约 50 行

### L-57 · Text 采集 Sheet：容器与标题
- **web**：`gacode-web/src/app/(main)/library/page.tsx:752-770`
  ```tsx
  <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setTextSheetOpen(false)} aria-hidden="true" />
  <div className="fixed bottom-0 left-0 right-0 z-50 bg-bg-elevated rounded-t-lg p-4 pb-8">
    <div className="flex items-center justify-between mb-4">
      <span className="text-base font-medium">采集文本 / 链接</span>
      <button type="button" onClick={() => setTextSheetOpen(false)} aria-label="关闭" className="w-8 h-8 rounded-full text-fg-muted hover:bg-accent transition-colors inline-flex items-center justify-center">
        <X className="w-5 h-5" />
      </button>
    </div>
  ```
- **PC**：`gacode-electron/src/components/library/CollectSheet.tsx` — 文本表单在同一个 sheet 的第一个 tab 里，**没有第二层 sheet**
- **判定**：缺失（第二层 sheet + 「采集文本 / 链接」标题）
- **怎么改**：随 L-54 一起做——`step === "form" && tab === "text"` 时渲染第二层 sheet（结构同 L-55 的容器，标题换 `采集文本 / 链接`），并让第一层 sheet 卸载（web 是 `{sheetOpen && …}` 与 `{textSheetOpen && …}` 两个互斥块）。
- **预估改动**：约 30 行（与 L-54/L-55 合并）

### L-58 · Text 采集输入框：行数 / 占位符 / 底色 / 圆角 / focus
- **web**：`gacode-web/src/app/(main)/library/page.tsx:771-781`
  ```tsx
  <textarea
    value={textDraft}
    onChange={(e) => setTextDraft(e.target.value)}
    placeholder="输入链接 (https://...) 或文本内容..."
    rows={4}
    autoFocus
    className="w-full rounded-xl bg-muted/50 px-4 py-3 text-base placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand resize-none"
  />
  ```
- **PC**：`gacode-electron/src/components/library/CollectSheet.tsx:306-313`（`TextTab`）
  ```tsx
  <textarea
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder="在这里输入内容..."
    rows={6}
    autoFocus
    className="w-full rounded-md bg-bg-sunken px-4 py-3 text-base placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand/40 resize-none"
  />
  ```
- **判定**：形态不同（5 处）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\CollectSheet.tsx`
  - 锚点：`function TextTab({` 内的 `<textarea`
  - 改为：
    ```tsx
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="输入链接 (https://...) 或文本内容..."
      rows={4}
      autoFocus
      className="w-full rounded-xl bg-muted/50 px-4 py-3 text-base placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-brand resize-none"
    />
    ```
  - （`rounded-xl` = PC 22px，web 同名；`bg-muted/50` = `#181818` 50% —— web 的 `--muted` 同为 `#181818` ✓）
- **预估改动**：约 5 行

### L-59 · Text 采集按钮组：`size="md"` → `size="sm"`
- **web**：`gacode-web/src/app/(main)/library/page.tsx:782-801`
  ```tsx
  <Button variant="ghost" size="sm" onClick={() => setTextSheetOpen(false)}>取消</Button>
  <Button size="sm" onClick={handleTextSubmit} disabled={!textDraft.trim() || createLibraryItemMutation.isPending}>
    {createLibraryItemMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "采集"}
  </Button>
  ```
- **PC**：`gacode-electron/src/components/library/CollectSheet.tsx:314-327`
  ```tsx
  <Button variant="ghost" size="md" onClick={onCancel} disabled={pending}>取消</Button>
  <Button variant="default" size="md" loading={pending} disabled={disabled} onClick={onSubmit}>采集</Button>
  ```
- **判定**：形态不同（size、pending 呈现）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\CollectSheet.tsx`
  - 锚点：`TextTab` 内的两个 `<Button>`
  - 改为：
    ```tsx
    <Button variant="ghost" size="sm" onClick={onCancel} disabled={pending}>取消</Button>
    <Button size="sm" onClick={onSubmit} disabled={disabled}>
      {pending ? <SpinnerIcon className="w-4 h-4 animate-spin" /> : "采集"}
    </Button>
    ```
  - 删 `loading={pending}`（PC `Button` 的 loading 会同时渲染 spinner 与 children，web 是二选一）
  - `disabled` 条件已等价（PC 的 `disabled = !value.trim() || pending` ✓）
  - 依赖：`SpinnerIcon`（见 L-11）
- **预估改动**：约 5 行

### L-60 · 空内容拦截 toast：文案 + variant
- **web**：`gacode-web/src/app/(main)/library/page.tsx:256-259`
  ```tsx
  if (!txt) {
    toast({ title: "内容不能为空", variant: "warning" });
    return;
  }
  ```
- **PC**：`gacode-electron/src/components/library/CollectSheet.tsx:67` → `if (!txt) throw new Error("内容不能为空");` → 落到 `onError`（`CollectSheet.tsx:115-120`）`toast({ message: "保存失败: 内容不能为空", variant: "danger" })`
- **判定**：形态不同（用户看到的是「保存失败: 内容不能为空」danger 红条，而非「内容不能为空」warning）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\CollectSheet.tsx`
  - 锚点：`const textMutation = useMutation({` 的 `mutationFn` 首行
  - 改为：把空值判断从 mutation 内部提到提交入口：
    ```tsx
    const submitText = () => {
      if (!textDraft.trim()) {
        toast({ message: "内容不能为空", variant: "warning" });
        return;
      }
      textMutation.mutate(textDraft);
    };
    ```
    并把 `TextTab` 的 `onSubmit` 接到 `submitText`（`TextTab` 内部保留原 throw 作兜底）
  - ⚠️ PC `Toast` 的 props 是 `message` + `variant`，web 是 `title`/`description`/`variant` —— 见共享组件节 S-07
- **预估改动**：约 8 行

### L-61 · 32000 字符截断缺 toast 提示
- **web**：`gacode-web/src/app/(main)/library/page.tsx:268-276`
  ```tsx
  let submittedDraft = txt;
  if (txt.length > MAX_CONTENT_LEN) {
    submittedDraft = txt.slice(0, MAX_CONTENT_LEN);
    toast({
      title: "内容已截断到 32000 字符",
      description: `原文 ${txt.length} 字符, 超出部分未保存, 请考虑分段`,
      variant: "warning",
    });
  }
  ```
- **PC**：`gacode-electron/src/components/library/CollectSheet.tsx:84-85`
  ```tsx
  const submittedDraft = txt.length > MAX_CONTENT_LEN ? txt.slice(0, MAX_CONTENT_LEN) : txt;
  ```
  （静默截断，用户无感知）
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\CollectSheet.tsx`
  - 锚点：`const submittedDraft = …` 那一行
  - 改为：
    ```tsx
    let submittedDraft = txt;
    if (txt.length > MAX_CONTENT_LEN) {
      submittedDraft = txt.slice(0, MAX_CONTENT_LEN);
      toast({
        message: `内容已截断到 32000 字符 · 原文 ${txt.length} 字符, 超出部分未保存, 请考虑分段`,
        variant: "warning",
      });
    }
    ```
  - PC Toast 单行 `message` 承载两段文案（见 S-07）
- **预估改动**：约 7 行

### L-62 · 采集上传 30 秒超时提示缺失
- **web**：`gacode-web/src/app/(main)/library/page.tsx:357-363`
  ```tsx
  const timeoutTimer = setTimeout(() => {
    toast({
      title: "采集超时",
      description: "上传超过 30 秒未完成, 请稍后再试",
      variant: "warning",
    });
  }, 30_000);
  ```
  （`clearTimeout(timeoutTimer)` 在 `onSuccess`/`onError` 里各一次，`library/page.tsx:368` / `401`）
- **PC**：`gacode-electron/src/components/library/CollectSheet.tsx:157-194` — 无超时
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\CollectSheet.tsx`
  - 锚点：`const handleFilePicked = async (file: File, kind: "image" | "file") => {` 函数体开头
  - 新增：
    ```tsx
    /** 上传超时计时器 — 30s 未完成则提示 (web 端同值) */
    const timeoutTimerRef = useRef<number | null>(null);
    ```
    函数内：
    ```tsx
    timeoutTimerRef.current = window.setTimeout(() => {
      toast({ message: "采集超时 · 上传超过 30 秒未完成, 请稍后再试", variant: "warning" });
    }, 30_000);
    ```
    `finally` 里 `if (timeoutTimerRef.current !== null) { window.clearTimeout(timeoutTimerRef.current); timeoutTimerRef.current = null; }`
  - `CollectSheet.tsx` 已 import `useRef`（第 18 行）✓
- **预估改动**：约 10 行

### L-63 · 提交后 sheet 关闭时机：web 立即关，PC 成功才关
- **web**：`gacode-web/src/app/(main)/library/page.tsx:278-280`
  ```tsx
  // 提前关闭 sheet + 清空 input, 体感一致 (无论成功/失败都先收起)
  setTextSheetOpen(false);
  setTextDraft("");
  ```
  （在发起请求 **之前**）
- **PC**：`gacode-electron/src/components/library/CollectSheet.tsx:109-114` — `onSuccess` 里才 `onClose()`
- **判定**：形态不同（交互体感：web 立即收起，PC 停在原地转圈）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\CollectSheet.tsx`
  - 锚点：`const submitText = () => {`（L-60 新增）
  - 改为：
    ```tsx
    const submitText = () => {
      if (!textDraft.trim()) { toast({ message: "内容不能为空", variant: "warning" }); return; }
      setTextDraft("");
      onClose();               // 提前收起, 无论成败
      textMutation.mutate(textDraftRef.current);
    };
    ```
    （`textDraft` 需在 clear 前用 ref 留一份；或直接 `textMutation.mutate(textDraft); setTextDraft(""); onClose();`）
- **预估改动**：约 4 行

### L-64 · 保存失败 toast 结构：web 双段（title + description），PC 单段
- **web**：`gacode-web/src/app/(main)/library/page.tsx:337-341`
  ```tsx
  toast({
    title: "保存失败，稍后重试",
    description: err?.message || "网络错误",
    variant: "danger",
  });
  ```
  （link 分支 `library/page.tsx:293-297` 文案一致）
- **PC**：`gacode-electron/src/components/library/CollectSheet.tsx:115-120`
  ```tsx
  toast({ message: `保存失败: ${err instanceof Error ? err.message : String(err)}`, variant: "danger" });
  ```
- **判定**：形态不同（web 是「标题行 + 描述行」两级，PC 是一行拼接）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\CollectSheet.tsx`
  - 锚点：`textMutation` 的 `onError` / `linkMutation` 的 `onError`
  - 改为：`toast({ message: \`保存失败，稍后重试 · ${err instanceof Error ? err.message : String(err)}\`, variant: "danger" })`
  - ⚠️ PC `Toast` 组件是否支持 title/description 两段 **未读**；若不支持，需要先扩 Toast（见共享组件节 S-07），否则只能保持单行拼接
- **预估改动**：2 行（+ Toast 扩展 ≈ 30 行）

### L-65 · 采集文件 accept 集合不一致
- **web**：`gacode-web/src/app/(main)/library/page.tsx:812-817`
  ```tsx
  accept={pickerKind === "image" ? "image/*" : ".pdf,.doc,.docx,.txt,.md,.zip,.json,.png,.jpg,.jpeg,.gif,.webp"}
  mode={pickerKind === "doc" ? "file" : "image"}
  ```
  （web `MediaPicker` 的 `FILE_ACCEPT` 常量为 `.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv`，但 `MediaPicker.tsx:254` 是 `accept={modeProp === "file" ? (accept || FILE_ACCEPT) : accept}` —— **library 传入的 accept 覆盖了常量**，所以知识库实际用上面那串）
- **PC**：`gacode-electron/src/components/library/CollectSheet.tsx:270`
  ```
  accept=".pdf,.doc,.docx,.txt,.md,.zip,.csv,.xlsx,.xls,.json"
  ```
  （PC 多 `.xlsx/.xls`，少 `.png/.jpg/.jpeg/.gif/.webp`）
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\CollectSheet.tsx`
  - 锚点：`FileTab` 调用处的 `accept=".pdf,.doc,.docx,.txt,.md,.zip,.csv,.xlsx,.xls,.json"`
  - 1:1 还原 → 改为 `accept=".pdf,.doc,.docx,.txt,.md,.zip,.json,.png,.jpg,.jpeg,.gif,.webp"`
  - 注：PC `home/MediaPicker.tsx:32` 的 `FILE_ACCEPT` 是 `.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv`（对齐 web MediaPicker 常量），**两处不同是 web 的既有状态**，不要统一
- **预估改动**：1 行

### L-66 · 采集标题取后缀：PC 去扩展名，web 保留原文件名
- **web**：`gacode-web/src/app/(main)/library/page.tsx:383` → `{ type: libraryType, title: file.name, url: refId }`（**保留 `photo.jpg` 原名**）
- **PC**：`gacode-electron/src/components/library/CollectSheet.tsx:177` → `title: stripExt(file.name) || "未命名"`（**去扩展名**）
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\CollectSheet.tsx`
  - 锚点：`const created: LibraryItem = await createLibraryItem({` 的 `title:` 行
  - 改为：`title: file.name || "未命名"`
- **预估改动**：1 行

### L-67 · 采集入口 sheet 关闭延迟（web 等 100ms 再开下一层）
- **web**：`gacode-web/src/app/(main)/library/page.tsx:411-422`
  ```tsx
  const openPhotoPicker = () => {
    setPickerKind("image");
    setSheetOpen(false);
    // 略微延迟, 等上一个 sheet 关闭动画
    setTimeout(() => setPickerOpen(true), 100);
  };
  ```
  Text 分支同款（`library/page.tsx:720-723`）：`setSheetOpen(false); setTextDraft(""); setTimeout(() => setTextSheetOpen(true), 100);`
- **PC**：`gacode-electron/src/components/library/CollectSheet.tsx` — 单 sheet 内切 tab，**无延迟切换**
- **判定**：形态不同（仅在采用 L-54 的两层 sheet 方案后需要）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\CollectSheet.tsx`
  - 锚点：`step === "menu"` 的 3 宫格按钮 `onClick`
  - 改为（示例 Text）：`onClick={() => { setTextDraft(""); setStep("closed"); window.setTimeout(() => { setTab("text"); setStep("form"); }, 100); }}`
  - 需新增 state `step: "menu" | "form" | "closed"`（或用 `null` 表示过渡中）
- **预估改动**：约 6 行

### L-68 · PC 缺「拍照」入口（capture="environment"）
- **web**：`gacode-web/src/components/common/MediaPicker.tsx:221-237`（image 模式两个按钮：拍照 `capture="environment"` / 相册）
- **PC**：`gacode-electron/src/components/library/CollectSheet.tsx:254-264`（image tab 只有一个「点击选择图片」的 `<input type="file" accept="image/*">`，**无 capture**）
- **判定**：缺失（PC 知识库采集无「拍照」；PC 的 `home/MediaPicker.tsx:64` 有 capture，但那是 Home 页，Library 没用它）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\CollectSheet.tsx`
  - 锚点：`FileTab` 的 `<input ref={inputRef} type="file" accept={accept} …>`
  - 改法：`FileTab` 新增 prop `capture?: string`，`<input … {...(capture ? { capture } : {})}>`；image 分支传 `capture="environment"`
  - ⚠️ PC 是 Electron 桌面端：Windows 上 `capture` 会被 Chromium 忽略（`home/MediaPicker.tsx:8-10` 注释已说明），因此该入口在 PC 上**实际等价于「选图」**。1:1 还原只需补属性，不改 UI
- **预估改动**：约 6 行

## 1.7 编辑 / 删除弹窗

### L-69 · 行编辑弹窗：容器形态（AlertDialog 居中 modal）
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1208-1242` → shadcn `AlertDialog`（居中 modal，遮罩 + 内容卡）
- **PC**：`gacode-electron/src/components/library/EditSheet.tsx:91-103`
  ```tsx
  <div role="dialog" aria-modal="true" aria-label="编辑知识库条目" className="fixed inset-0 z-50 flex items-center justify-center px-4">
    <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden="true" />
    <div className="relative w-full max-w-md rounded-md bg-bg-elevated shadow-dialog p-5">
  ```
- **判定**：形态不同（PC 自造 modal，web 用统一 `AlertDialog`；遮罩 `bg-black/60` vs web AlertDialog 的遮罩色、内容卡圆角/阴影/宽度都不同）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\EditSheet.tsx`
  - 锚点：`return (` 后的根 `<div role="dialog"`
  - 需读 `gacode-web/src/components/ui/alert-dialog.tsx` 拿到 `AlertDialogContent` / `Overlay` / `Title` / `Description` / `Footer` 的**逐字 className** 再抄；PC 端需要么新建 `src/components/ui/AlertDialog.tsx`（约 120 行），要么把 className 直接写进 EditSheet
  - ⚠️ 此项依赖 web `alert-dialog.tsx` 原文，**待补**（见「待核」清单）
- **预估改动**：约 130 行（新建 AlertDialog 组件 + 接入）

### L-70 · 行编辑弹窗：标题 / 描述缺失
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1210-1212`
  ```tsx
  <AlertDialogHeader>
    <AlertDialogTitle>编辑知识库条目</AlertDialogTitle>
  </AlertDialogHeader>
  ```
  （**无** `AlertDialogDescription`）
- **PC**：`gacode-electron/src/components/library/EditSheet.tsx:104` → `<h2 className="text-base font-medium mb-4">编辑知识库条目</h2>` ✓ 文案一致
- **判定**：已一致（文案层面）；形态差异归入 L-69
- **怎么改**：无
- **预估改动**：0

### L-71 · 行编辑弹窗：只读 meta 块（类型 / ID / 创建时间）是 PC 增强
- **PC**：`gacode-electron/src/components/library/EditSheet.tsx:136-150` — `类型 / ID / 创建` 三行只读信息
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1213-1234` — **没有**这段
- **判定**：**形态不同**（PC 增强项）——但它让编辑弹窗高度比 web 高约 60px，与 web 视觉不等高。**归位：X-04（2026-10-26 复核 —— 这不是结构级差异，已并入 §七 的「形态不同」统计）**，仍需 gaga 拍。
- **预估改动**：待 gaga 拍

### L-72 · 行编辑弹窗：输入框形态（裸 `<input>` → web 的 `Input` 组件）
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1216-1222` / `1228-1232` → shadcn `<Input>`（`gacode-web/src/components/ui/input.tsx`，className 待核）
- **PC**：`gacode-electron/src/components/library/EditSheet.tsx:109-120` / `127-133` → 裸 `<input className="w-full rounded-md bg-bg-sunken border border-border px-4 py-3 text-base placeholder:text-fg-subtle focus:outline-none focus:border-brand">`
- **判定**：形态不同（web Input 的 base className 待核后再定最终串；PC 的裸 input 与 PC 自家 `Input` 组件 base 也不同：PC `Input` 是 `flex w-full rounded-md border border-border bg-bg-sunken px-4 py-3 text-base …` —— 基本等价）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\EditSheet.tsx`
  - 锚点：`EditSheet` 内两个 `<input type="text">`
  - 改为使用 PC 自家 `<Input>`（`gacode-electron/src/components/ui/Input.tsx`），className 传空串（PC Input base 已含 `rounded-md border border-border bg-bg-sunken px-4 py-3 text-base placeholder:text-fg-subtle focus:border-brand`）
  - ⚠️ **web 的 EditSheet 标题输入框 `maxLength={200}`**（`library/page.tsx:1221`）—— PC 已有 ✓（`EditSheet.tsx:114`）
  - ⚠️ PC 的 `EditSheet` **没有** `autoFocus` 在 tags 输入（web 标题框 autoFocus ✓ PC 也有）
- **预估改动**：约 12 行

### L-73 · 行编辑弹窗：保存按钮 disabled 条件（PC 多一条「无变化禁用」）
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1237` → `disabled={saving}`（只禁 pending）
- **PC**：`gacode-electron/src/components/library/EditSheet.tsx:166` → `disabled={!trimmedTitle || noChange}`（额外禁「无变化」）
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\library\EditSheet.tsx`
  - 锚点：保存 `<Button … disabled={!trimmedTitle || noChange}>`
  - 改为：`disabled={!trimmedTitle}`（保留空标题拦截，去掉 `noChange`）
  - `noChange` 变量随之成为未使用 → 一并删除（`EditSheet.tsx:78-81`）
- **预估改动**：约 6 行

### L-74 · 行删除确认弹窗：标题 / 确认按钮文案
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1248-1256`
  ```tsx
  <AlertDialogTitle>确定要删除这条吗?</AlertDialogTitle>
  <AlertDialogDescription>「{item.title || "未命名"}」 将从知识库移除，此操作不可撤销。</AlertDialogDescription>
  <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
  <AlertDialogAction tone="danger" disabled={deleting} onClick={handleConfirmDelete}>
    {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "删除"}
  </AlertDialogAction>
  ```
- **PC**：`gacode-electron/src/routes/Library.tsx:417-429`
  ```tsx
  <ConfirmDialog
    title="删除这条知识?"
    message={`「${pendingSingleDelete.title || "未命名"}」 将从知识库移除, 此操作不可撤销。`}
    confirmLabel="确认删除"
    confirmVariant="danger"
    …
  />
  ```
- **判定**：形态不同（标题文案、确认按钮文案；描述文案一致 ✓）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Library.tsx`
  - 锚点：`<ConfirmDialog title="删除这条知识?" … confirmLabel="确认删除">`
  - 改为：`title="确定要删除这条吗?"`，`confirmLabel="删除"`
- **预估改动**：2 行

### L-75 · 行删除 pending 态：PC 文字 vs web 转圈
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1256` → `{deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "删除"}`
- **PC**：`gacode-electron/src/routes/Library.tsx:423` → `loading={singleDeleteMutation.isPending}`（PC `ConfirmDialog` 的 loading 实现未读）
- **判定**：待核（需读 `gacode-electron/src/components/ui/ConfirmDialog.tsx` 确认 loading 时是否隐藏 confirmLabel）
- **怎么改**：待读 ConfirmDialog 后定
- **预估改动**：待定

## 1.8 已知「非差异」备注（避免误判）

> web `library/page.tsx:1157-1205` 的「详情 Modal（只读）」是 **web 端死代码** —— 全文搜索 `setDetailsOpen(true)` 无调用点（只有 `useState` 初值与 `AlertDialog onOpenChange`），菜单里的「详情」项（`library/page.tsx:1104-1107`）实际执行的是 `router.push(\`/library/${item.id}\`)`。因此 **PC 缺失这个弹窗不算差异**，不列入清单。
>
> 同理 `library/page.tsx:1126-1139` 的「在新窗口打开」菜单项实际也走 `open()`（跳详情页），不是真开新窗口 —— 见 L-40。

---

# 二、知识库详情页

> web：`gacode-web/src/app/(main)/library/[id]/page.tsx`（453 行）
> PC：`gacode-electron/src/routes/LibraryDetail.tsx`（455 行）+ `src/components/library/LibraryMarkdownTableCard.tsx` + `SyncStatusBadge.tsx` + `EditSheet.tsx`

## 2.1 顶栏（web 有，PC 整条缺失）

### B-01 · 顶栏容器：sticky + border-b + h-14
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:263-264`
  ```tsx
  <div className="sticky top-0 z-20 bg-bg-base border-b border-border">
    <div className="px-4 lg:px-8 max-w-3xl mx-auto w-full h-14 flex items-center gap-2">
  ```
- **PC**：`gacode-electron/src/routes/LibraryDetail.tsx:184-185`
  ```tsx
  <div className="min-h-full px-4 lg:px-8 py-6">
    <div className="max-w-3xl mx-auto space-y-5">
  ```
  （无 sticky 顶栏，内容直接铺开）
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\LibraryDetail.tsx`
  - 锚点：`return (` 内 `<div className="min-h-full px-4 lg:px-8 py-6">` 的**前面**插入顶栏
  - 新增 JSX（逐字抄 web）：
    ```tsx
    <div className="sticky top-0 z-20 bg-bg-base border-b border-border">
      <div className="px-4 lg:px-8 max-w-3xl mx-auto w-full h-14 flex items-center gap-2">
        …返回按钮 + 标题 + 编辑/删除按钮（见 B-02~B-05）…
      </div>
    </div>
    ```
  - 正文容器随后改为 `<div className="flex-1 px-4 lg:px-8 py-6 max-w-3xl mx-auto w-full space-y-5 overflow-y-auto">`（见 B-20）
- **预估改动**：约 8 行

### B-02 · 顶栏返回按钮（ArrowLeft）
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:265-272`
  ```tsx
  <button
    type="button"
    aria-label="返回"
    onClick={() => router.back()}
    className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors inline-flex items-center justify-center"
  >
    <ArrowLeft className="w-5 h-5" />
  </button>
  ```
- **PC**：`gacode-electron/src/routes/LibraryDetail.tsx` — 全文无返回按钮；返回列表是页面底部 `<Button variant="ghost" size="md" onClick={() => navigate("/library")}>返回列表</Button>`（`LibraryDetail.tsx:246-252`）
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\LibraryDetail.tsx`
  - 锚点：B-01 新增的顶栏内层 div 第一个子元素
  - 改为：
    ```tsx
    <button
      type="button"
      aria-label="返回"
      onClick={() => navigate(-1)}
      className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors inline-flex items-center justify-center"
    >
      <ArrowLeftIcon className="w-5 h-5" />
    </button>
    ```
  - 依赖：需新增 `ArrowLeftIcon`（lucide ArrowLeft path：`M12 19l-7-7 7-7` + `M19 12H5`，stroke-width 2，svg 上写 `width="100%" height="100%"` 让 `w-5 h-5` 生效）
  - `navigate(-1)` 等价 web 的 `router.back()`
- **预估改动**：约 12 行

### B-03 · 顶栏标题（类型图标 + truncate 标题）
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:273-276`
  ```tsx
  <div className="flex-1 min-w-0 flex items-center gap-2 text-base font-medium truncate">
    {typeIcon(item.type)}
    <span className="truncate">{item.title || "未命名"}</span>
  </div>
  ```
  `typeIcon`（`library/[id]/page.tsx:57-69`）：image→`ImageIcon w-5 h-5 text-brand-cyan` / doc→`FileText w-5 h-5 text-brand-yellow` / link|text→`LinkIcon w-5 h-5 text-brand-green` / default→`FileText w-5 h-5 text-fg-muted`
- **PC**：`gacode-electron/src/routes/LibraryDetail.tsx` — 顶栏不存在；标题在 `<h1 className="text-xl font-medium text-fg break-all">`（`LibraryDetail.tsx:200-202`），**无类型图标**
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\LibraryDetail.tsx`
  - 锚点：B-02 返回按钮之后
  - 改为：
    ```tsx
    <div className="flex-1 min-w-0 flex items-center gap-2 text-base font-medium truncate">
      {item.type === "image" ? <ImageIcon className="w-5 h-5 text-brand-cyan" /> :
       item.type === "doc" ? <FileTextIcon className="w-5 h-5 text-brand-yellow" /> :
       item.type === "link" || item.type === "text" ? <LinkIcon className="w-5 h-5 text-brand-green" /> :
       <FileTextIcon className="w-5 h-5 text-fg-muted" />}
      <span className="truncate">{item.title || "未命名"}</span>
    </div>
    ```
  - 依赖：需新增 3 个 svg 函数 `ImageIcon` / `FileTextIcon` / `LinkIcon`（`LibraryDetail.tsx` 内目前无这三个；`src/components/library/LibraryCard.tsx:221-249` 有同名但硬编码 16px 且无 className prop，**不能直接复用**，需在详情页新建或改造 `LibraryCard` 的图标函数并导出）
- **预估改动**：约 20 行

### B-04 · 顶栏「编辑」按钮（Pencil）
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:277-296`
  ```tsx
  {!editing && (
    <>
      <button type="button" aria-label="编辑" onClick={() => setEditing(true)}
        className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors inline-flex items-center justify-center">
        <Pencil className="w-5 h-5" />
      </button>
      …
    </>
  )}
  ```
- **PC**：`gacode-electron/src/routes/LibraryDetail.tsx:266-272` — 底部操作区有「编辑」按钮（`variant="outline" size="md"`），**顶栏无入口**
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\LibraryDetail.tsx`
  - 锚点：B-03 标题 div 之后
  - 改为：
    ```tsx
    {!editing && (
      <button
        type="button"
        aria-label="编辑"
        onClick={() => setEditing(true)}
        className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors inline-flex items-center justify-center"
      >
        <PencilIcon className="w-5 h-5" />
      </button>
    )}
    ```
  - 依赖：需新增 `PencilIcon`（lucide Pencil path：`M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z`）
  - ⚠️ **PC 目前 `editing` 状态不存在**（PC 用 `editOpen` 弹 EditSheet）。1:1 还原 web 需把「页内编辑」状态搬过来 → 见 B-11 / B-06
- **预估改动**：约 10 行

### B-05 · 顶栏「删除」按钮（Trash2）
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:287-294`
  ```tsx
  <button type="button" aria-label="删除" onClick={() => setDeleteOpen(true)}
    className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors inline-flex items-center justify-center">
    <Trash2 className="w-5 h-5" />
  </button>
  ```
- **PC**：`gacode-electron/src/routes/LibraryDetail.tsx:273-279` — 底部有「删除」按钮（`variant="danger"`），顶栏无
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\LibraryDetail.tsx`
  - 锚点：B-04 编辑按钮之后
  - 改为：
    ```tsx
    <button
      type="button"
      aria-label="删除"
      onClick={() => setDeleteOpen(true)}
      className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors inline-flex items-center justify-center"
    >
      <Trash2Icon className="w-5 h-5" />
    </button>
    ```
  - 依赖：需新增 `Trash2Icon`（lucide Trash2 path：`M3 6h18` / `M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6` / `M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2` / `M10 11v6` / `M14 11v6`）
  - PC 现有 `deleteMutation` 的 `onSuccess` 已 `navigate("/library", { replace: true })` ✓ 对应 web 的 `router.replace("/library")`
- **预估改动**：约 12 行

### B-06 · 编辑态：web 是「页内切换」并隐藏顶栏编辑/删除，PC 是「弹窗」
> **流程级差异**，逐条写清
- **web 第一步做什么**：点顶栏铅笔 → `setEditing(true)` → **正文区整体切换成编辑表单**（标题 Input + 标签 Input + 取消/保存按钮），**同时顶栏的编辑/删除按钮被隐藏**（`{!editing && …}`）。
- **PC 现有做法**：点底部「编辑」→ `setEditOpen(true)` → 弹出 `EditSheet` 居中 modal（`LibraryDetail.tsx:296-300`），页面正文保持原样，顶栏（PC 没有顶栏）不变。
- **1:1 还原后 PC 第一步应该做什么**：顶栏铅笔 → `setEditing(true)` → 正文区切编辑表单，顶栏编辑/删除按钮消失；「取消」→ `setEditing(false)` 回到只读正文；「保存」→ 调 PATCH → toast → `setEditing(false)`。
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\LibraryDetail.tsx`
  - 锚点：`const [confirmOpen, setConfirmOpen] = useState(false);`（`LibraryDetail.tsx:69`）之后新增状态
  - 新增 state / handler：
    ```tsx
    /** 页内编辑模式 — web 端点顶栏铅笔进入, 正文区整体切换成表单, 顶栏编辑/删除按钮隐藏 */
    const [editing, setEditing] = useState(false);
    /** 编辑中的标题草稿 */
    const [editTitle, setEditTitle] = useState("");
    /** 编辑中的标签草稿 (逗号/空格分隔的原始串) */
    const [editTagsRaw, setEditTagsRaw] = useState("");
    /** 保存中 (禁用重复提交) */
    const [saving, setSaving] = useState(false);
    ```
  - 新增 effect（进入编辑时用最新 item 初始化表单）：
    ```tsx
    useEffect(() => {
      if (editing && item) {
        setEditTitle(item.title || "");
        setEditTagsRaw((item.tags || []).join(", "));
      }
    }, [editing, item]);
    ```
  - 新增保存 handler：
    ```tsx
    /** 保存标题 + 标签 — PATCH /yinian/library/:id, 成功后退出编辑态 */
    const handleSaveEdit = async () => {
      if (saving || !item) return;
      const title = editTitle.trim();
      if (!title) {
        toast({ message: "标题不能为空", variant: "warning" });
        return;
      }
      const tags = editTagsRaw.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean);
      setSaving(true);
      try {
        await updateLibraryItem(item.id, { title, tags });
        toast({ message: "已更新", variant: "success" });
        queryClient.invalidateQueries({ queryKey: ["library-item", id] });
        queryClient.invalidateQueries({ queryKey: ["library"] });
        queryClient.invalidateQueries({ queryKey: ["library-tags"] });
        setEditing(false);
      } catch (err: any) {
        toast({ message: `更新失败: ${err?.message || "请稍后重试"}`, variant: "danger" });
      } finally {
        setSaving(false);
      }
    };
    ```
  - 正文区按 `editing` 二选一渲染（见 B-11）
  - 依赖：`updateLibraryItem` 需从 `../../lib/api` import（`LibraryDetail.tsx:34-39` 当前只 import 了 `createChat` / `deleteLibraryItem` / `getLibraryItem`）
  - 注：PC 现有 `<EditSheet open={editOpen && !!item} …/>`（`LibraryDetail.tsx:296-300`）与底部「编辑」按钮可保留（PC 增强），但若要 1:1，还需把底部操作区整体条件化 `!editing`
- **预估改动**：约 60 行

## 2.2 正文区

### B-07 · 类型 Badge + 相对时间
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:303-310`
  ```tsx
  <div className="flex items-center gap-2">
    <Badge variant="secondary">{typeLabel(item.type)}</Badge>
    <span className="text-xs text-fg-muted">
      {timeRef.current || item.createdAt}
    </span>
  </div>
  ```
  `timeRef` 来自 `formatDistanceToNow(d, { addSuffix: true, locale: zhCN })`（`library/[id]/page.tsx:150-161`），非法日期回退空串
- **PC**：`gacode-electron/src/routes/LibraryDetail.tsx:188-199`
  ```tsx
  <span className="text-xs px-2 py-0.5 rounded bg-bg-elevated text-fg-muted">
    {TYPE_LABEL[item.type] || item.type}
  </span>
  <span className="text-xs text-fg-subtle font-mono">#{item.id}</span>
  <span className="text-xs text-fg-subtle">·</span>
  <span className="text-xs text-fg-subtle">{formatDate(item.createdAt)}</span>
  ```
  `formatDate`（`LibraryDetail.tsx:400-405`）= `d.toLocaleString()` → **绝对时间**，不是相对时间
- **判定**：形态不同（时间格式 + 颜色 + Badge 组件）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\LibraryDetail.tsx`
  - 锚点：`<header className="space-y-2">` 内那行 `flex items-center gap-2 flex-wrap`
  - 1) 时间改相对时间：新增 helper（放在 `formatDate` 旁边）
    ```tsx
    /** 相对时间 — web 端 formatDistanceToNow(d, { addSuffix: true, locale: zhCN }) 的等价实现 */
    function formatRelativeTime(iso: string): string {
      if (!iso) return "";
      const t = Date.parse(iso);
      if (Number.isNaN(t)) return "";
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
    （PC 的 `src/components/library/LibraryCard.tsx:199-215` 已有同款 `formatRelative`，可提取到共享 util，避免重复 —— 符合「组件意识」）
  - 2) 时间 span className：`text-xs text-fg-subtle` → `text-xs text-fg-muted`
  - 3) 类型徽章：PC 自造 span → web `Badge variant="secondary"`。web `Badge` 组件的 className **待核**（`gacode-web/src/components/ui/badge.tsx` 未读）；落地前读该文件抄 variant="secondary" 的整串
  - 4) PC 的 `#{item.id}` 与 `·` 分隔符是 PC 增强，**保留不动**
- **预估改动**：约 20 行

### B-08 · 标题字号 / 字重 / 换行
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:311-313`
  ```tsx
  <div className="text-2xl font-semibold break-words">
    {item.title || "未命名"}
  </div>
  ```
- **PC**：`gacode-electron/src/routes/LibraryDetail.tsx:200-202`
  ```tsx
  <h1 className="text-xl font-medium text-fg break-all">
    {item.title || "(无标题)"}
  </h1>
  ```
- **判定**：形态不同（`text-2xl`→`text-xl`、`font-semibold`→`font-medium`、`break-words`→`break-all`、兜底文案）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\LibraryDetail.tsx`
  - 锚点：`<h1 className="text-xl font-medium text-fg break-all">`
  - 改为：`<h1 className="text-2xl font-semibold text-fg break-words">{item.title || "未命名"}</h1>`
- **预估改动**：1 行

### B-09 · 页内编辑表单（标题 + 标签 + 取消/保存）
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:317-362`
  ```tsx
  {editing && (
    <div className="space-y-4">
      <div>
        <label className="text-xs text-fg-muted mb-1 block">标题</label>
        <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
          placeholder="标题" autoFocus maxLength={200} />
      </div>
      <div>
        <label className="text-xs text-fg-muted mb-1 block">
          标签 <span className="text-fg-subtle">(用逗号或空格分隔)</span>
        </label>
        <Input value={editTagsRaw} onChange={(e) => setEditTagsRaw(e.target.value)}
          placeholder="例如: 设计, 灵感, 2026" />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
          <X className="w-4 h-4 mr-1" />取消
        </Button>
        <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-1" />保存</>}
        </Button>
      </div>
    </div>
  )}
  ```
  web `Input` base className（`gacode-web/src/components/ui/input.tsx:25-33`）：
  ```
  "flex w-full rounded-md border border-border bg-bg-elevated px-4 py-3 text-base",
  "placeholder:text-fg-subtle shadow-sm",
  "transition-colors duration-150",
  "focus:outline-none focus:border-brand",
  "disabled:cursor-not-allowed disabled:opacity-50",
  ```
- **PC**：`gacode-electron/src/routes/LibraryDetail.tsx` — **完全没有页内编辑表单**（PC 走 EditSheet 弹窗，`LibraryDetail.tsx:296-300`）
- **判定**：缺失（4 个子项：标题字段、标签字段、取消按钮、保存按钮）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\LibraryDetail.tsx`
  - 锚点：正文容器内 `{!editing && ( <div className="space-y-3"> … )}` 之后
  - 插入（逐字抄 web）：
    ```tsx
    {editing && (
      <div className="space-y-4">
        <div>
          <label className="text-xs text-fg-muted mb-1 block">标题</label>
          <Input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="标题"
            autoFocus
            maxLength={200}
          />
        </div>
        <div>
          <label className="text-xs text-fg-muted mb-1 block">
            标签 <span className="text-fg-subtle">(用逗号或空格分隔)</span>
          </label>
          <Input
            value={editTagsRaw}
            onChange={(e) => setEditTagsRaw(e.target.value)}
            placeholder="例如: 设计, 灵感, 2026"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>
            <XIcon className="w-4 h-4 mr-1" />
            取消
          </Button>
          <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
            {saving ? (
              <SpinnerIcon className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <SaveIcon className="w-4 h-4 mr-1" />
                保存
              </>
            )}
          </Button>
        </div>
      </div>
    )}
    ```
  - 依赖：需新增 `XIcon`（lucide X：`M18 6 6 18` + `m6 6 12 12`）、`SaveIcon`（lucide Save：`M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z` + `M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7` + `M7 3v4a1 1 0 0 0 1 1h7`）、`SpinnerIcon`（同 L-11）
  - ⚠️ PC `Input` base 是 `bg-bg-sunken`（web 是 `bg-bg-elevated`）→ 见 S-08 的 Input 差异条目
- **预估改动**：约 40 行（不含 B-06 的 state/handler）

### B-10 · 图片 inline preview 容器 + img
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:365-373`
  ```tsx
  {!editing && item.type === "image" && item.url && (
    <div className="rounded-lg overflow-hidden border border-border bg-bg-sunken">
      <img
        src={item.url}
        alt={item.title || "未命名"}
        className="block w-full max-h-[60vh] object-contain bg-black"
      />
    </div>
  )}
  ```
- **PC**：`gacode-electron/src/routes/LibraryDetail.tsx:324-334`
  ```tsx
  if (item.type === "image" && item.url) {
    return (
      <div className="rounded-md bg-bg-elevated p-3">
        <img src={item.url} alt={item.title || "image"} className="max-w-full max-h-[70vh] mx-auto rounded" />
      </div>
    );
  }
  ```
- **判定**：形态不同（6 处：圆角 rounded-lg→rounded-md、边框 border border-border 缺失、底色 bg-bg-sunken→bg-bg-elevated、overflow-hidden 缺失、内距 p-3 差异、img className 完全不同）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\LibraryDetail.tsx`
  - 锚点：`function ContentView({` 内 `if (item.type === "image" && url) {` 分支
  - 改为：
    ```tsx
    if (item.type === "image" && url) {
      return (
        <div className="rounded-lg overflow-hidden border border-border bg-bg-sunken">
          <img
            src={url}
            alt={item.title || "未命名"}
            className="block w-full max-h-[60vh] object-contain bg-black"
          />
        </div>
      );
    }
    ```
  - 注：`ContentView` 目前没有 `editing` 参数，web 的图片预览在编辑态要隐藏 → 需给 `ContentView` 加 prop `editing?: boolean`（谁传：`LibraryDetail.tsx:242` 的 `<ContentView item={item} onOpenWithSystem={openWithSystem} />` → 加 `editing={editing}`）
- **预估改动**：约 12 行

### B-11 · 链接/附件区：类型化 label + 外链图标
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:375-391`
  ```tsx
  {!editing && item.url && (
    <div className="space-y-1">
      <div className="text-xs text-fg-muted">
        {item.type === "link" ? "链接" : "附件"}
      </div>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-brand hover:underline break-all"
      >
        <span className="break-all">{item.url}</span>
        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
      </a>
    </div>
  )}
  ```
- **PC**：`gacode-electron/src/routes/LibraryDetail.tsx:141-155` — 元信息表里一行 `InfoRow label="URL"`，value 是裸 `<a className="text-brand hover:underline break-all">`
- **判定**：形态不同（4 处：label 文案「链接」/「附件」、`text-xs text-fg-muted` 标签行、`inline-flex items-center gap-1 text-sm`、外链图标）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\LibraryDetail.tsx`
  - 锚点：`{item.url ? ( <InfoRow label="URL" value={…} /> ) : null}`（`LibraryDetail.tsx:141-155`）
  - 改为独立区块（抄 web）：
    ```tsx
    {!editing && item.url && (
      <div className="space-y-1">
        <div className="text-xs text-fg-muted">
          {item.type === "link" ? "链接" : "附件"}
        </div>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-brand hover:underline break-all"
        >
          <span className="break-all">{item.url}</span>
          <ExternalLinkIcon className="w-3.5 h-3.5 shrink-0" />
        </a>
      </div>
    )}
    ```
  - 依赖：需新增 `ExternalLinkIcon`（lucide ExternalLink：`M15 3h6v6` + `M10 14 21 3` + `M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6`）
- **预估改动**：约 18 行

### B-12 · 标签列表：Badge + Tag 图标 + 无标签空态
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:393-412`
  ```tsx
  {!editing && (
    <div className="space-y-2">
      <div className="text-xs text-fg-muted flex items-center gap-1">
        <Tag className="w-3.5 h-3.5" />
        标签
      </div>
      {item.tags && item.tags.length > 0 ? (
        <div className="flex gap-1 flex-wrap">
          {item.tags.map((t) => (
            <Badge key={t} variant="secondary">#{t}</Badge>
          ))}
        </div>
      ) : (
        <div className="text-sm text-fg-subtle">无标签</div>
      )}
    </div>
  )}
  ```
- **PC**：`gacode-electron/src/routes/LibraryDetail.tsx:222-238` — `InfoRow label="标签"` + `<span className="text-xs px-1.5 py-0.5 rounded bg-bg-sunken text-fg-muted">#{t}</span>`
- **判定**：形态不同（3 处：Badge 组件、Tag 图标、「无标签」空态）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\LibraryDetail.tsx`
  - 锚点：`{item.tags && item.tags.length > 0 ? ( <InfoRow label="标签" …/> ) : null}`（`LibraryDetail.tsx:222-238`）
  - 改为独立区块（抄 web）：
    ```tsx
    {!editing && (
      <div className="space-y-2">
        <div className="text-xs text-fg-muted flex items-center gap-1">
          <TagIcon className="w-3.5 h-3.5" />
          标签
        </div>
        {item.tags && item.tags.length > 0 ? (
          <div className="flex gap-1 flex-wrap">
            {item.tags.map((t) => (
              <Badge key={t} variant="secondary">#{t}</Badge>
            ))}
          </div>
        ) : (
          <div className="text-sm text-fg-subtle">无标签</div>
        )}
      </div>
    )}
    ```
  - 依赖：需新增 `TagIcon`（lucide Tag path：`M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z` + `M7.5 7.5h.01`）+ web `Badge` 组件（或 PC 新建 `src/components/ui/Badge.tsx`）
  - ⚠️ web `Badge` 组件 className **待核**（`gacode-web/src/components/ui/badge.tsx` 未读）
- **预估改动**：约 22 行

### B-13 · 内容渲染条件：web「有 content 就渲染」，PC「仅 type==='text' 才渲染」
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:414-423`
  ```tsx
  {!editing && item.content && (
    <div className="space-y-2">
      <div className="text-xs text-fg-muted">内容</div>
      <div className="rounded-md border border-border bg-bg-sunken p-3 text-sm">
        <Markdown>{item.content}</Markdown>
      </div>
    </div>
  )}
  ```
  **条件只有 `item.content`**，不判断 type。
- **PC**：`gacode-electron/src/routes/LibraryDetail.tsx:337-339`
  ```tsx
  if (item.type === "text" && content && content.length > 0) {
    return <LibraryMarkdownTableCard content={content} />;
  }
  ```
  **条件多了 `item.type === "text"`** —— 而 `item.type` 的值域**恒为 `image | doc | link`，永不为 `text`**（服务端 `library.routes.js:121` + `:82-88` 的 `MODALITY_TO_WEB_TYPE`，见 L-14）⇒ **这是永不成立的死条件**。
- **判定**：形态不同（**行为不一致 · 确定结论**：PC 的 `item.type === "text"` 是死条件 ⇒ **纯文本正文在 PC 端必然不渲染**，无需实测接口即可下结论）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\LibraryDetail.tsx`
  - 锚点：`function ContentView({` 内 `if (item.type === "text" && content && content.length > 0) {`
  - 改为：`if (content && content.length > 0) {`（去掉 type 判断）—— **可直接执行，不必等实测接口**
  - 语义与 web 一致：web 的条件是 `item.content &&`（只看有没有正文，不看类型）
- **顺带两条同源死码**（一并清）：
  1. `gacode-electron/src/lib/api.ts:818` 的 `type: "image" | "doc" | "link" | "text"` —— 联合类型里的 **`"text"` 应删**（服务端值域只有 image/doc/link；同文件 `:815` 的注释已写明 `type ∈ 'image' | 'doc' | 'link'`）
  2. `gacode-electron/src/routes/LibraryDetail.tsx:450-455` 的 `TYPE_LABEL` 里的 **`text: "文本"` 永不可达**（`TYPE_LABEL[item.type]` 取不到 `'text'`）—— 可删或保留（无害）
- **预估改动**：1 行（+ 2 处死码清理）

### B-14 · 内容区容器 className
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:417-422`
  ```tsx
  <div className="space-y-2">
    <div className="text-xs text-fg-muted">内容</div>
    <div className="rounded-md border border-border bg-bg-sunken p-3 text-sm">
      <Markdown>{item.content}</Markdown>
    </div>
  </div>
  ```
- **PC**：`gacode-electron/src/components/library/LibraryMarkdownTableCard.tsx:46-53`
  ```tsx
  <div className={["rounded-md bg-bg-elevated p-4 text-sm leading-relaxed", "lk-markdown", className ?? ""].join(" ")}>
  ```
  **无 `border border-border`、底色 `bg-bg-elevated`（web 是 `bg-bg-sunken`）、内距 `p-4`（web `p-3`）、无「内容」小标题**
- **判定**：形态不同（4 处）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes/LibraryDetail.tsx`
  - 锚点：`if (content && content.length > 0) {` 分支的 return
  - 改为（在 `LibraryDetail.tsx` 内直接包 web 的结构）：
    ```tsx
    return (
      <div className="space-y-2">
        <div className="text-xs text-fg-muted">内容</div>
        <div className="rounded-md border border-border bg-bg-sunken p-3 text-sm">
          <LibraryMarkdownTableCard content={content} />
        </div>
      </div>
    );
    ```
  - 或改 `LibraryMarkdownTableCard` 的 className base（见 B-15）
- **预估改动**：约 10 行

### B-15 · Markdown 渲染器能力差异（web `Markdown` vs PC 知识库 markdown 卡）—— **口径已反转：PC 不再追 web，统一到安卓基准**
- **web**：`gacode-web/src/components/Markdown.tsx`（459 行）—— `react-markdown` **9.0.1** + `remark-gfm` + `remark-emoji` + `rehype-sanitize`（自定义 schema），`components` 映射覆盖 **20+ 元素**
- **PC**：**已归并到自研 markdown 管线**（M3 批 commit `b29207f`）—— `gacode-electron/src/components/library/LibraryMarkdownTableCard.tsx` 现 **59 行**，只调 `<Markdown size="reading" cutCodeBlocks>`（`src/components/library/LibraryMarkdownTableCard.tsx:54`）；底层 = `src/lib/markdown.tsx`（薄封装）→ `src/lib/markdown/renderer.tsx`（渲染层）→ `src/lib/markdown/parser.ts`（解析层，零依赖）
- **判定**：🟢 **已落地** —— PC **不再**按 web 的能力清单补差，而是**统一到安卓基准**（行为依据 `docs/md-android-behavior-spec.md`，每条带安卓 file:line）
- **怎么改**（逐项 —— **口径已反转**：下列 web 端能力**全部削平**，不做）：
  1. **emoji 短码**（web `remark-emoji`：`:smile:` → 😄）→ **削平**：不做短码转换，短码原样输出（安卓无此能力）
  2. **图片 Lightbox**（web `Markdown.tsx:139-178` `MarkdownImage` + `85-129` `LightboxDialog`）→ **削平**：安卓不支持点击放大；PC 只出固定尺寸图片块（≤280px / 120–320px / 圆角 12，`src/styles/globals.css` 的 `.md-image*`）
  3. **`ExpandableCell`**（web `Markdown.tsx:197-234` —— 表格单元格超 6 行折叠 + 「展开 / 收起」按钮）→ **削平**：安卓表格**无行数折叠**；PC 的 clamp 是**列宽** clamp（80px / 240px），单元格长内容折行**不截断**（旧的 `.md-table-td-clamp` / `.md-table-td-toggle` 死规则已删）
  4. **code block 复制按钮 + 语言徽章**（web `Markdown.tsx:36-72` `CodeBlock`）→ **保留能力，但改由自研层实现**：`src/lib/markdown/renderer.tsx` 的 `MdCodeCard` 自带语言徽章 + 复制按钮（`size="reading"` + `cutCodeBlocks` 场景）
  5. **语法高亮**（web `rehype-highlight` / `highlight.js`）→ **削平**：安卓不做高亮；PC 的 `highlight.js` / `rehype-highlight` 依赖已摘除
  6. **H4–H6**（web `Markdown.tsx:311-342` `h1`~`h6`）→ **削平**：安卓只判 `#` / `##` / `###`，H4-H6 原样当文本（井号保留）
  7. **真 `<ul>/<ol>` 嵌套**（web `Markdown.tsx:343-423`）→ **削平**：列表前缀是**文本**（`  • ` / `  N. `），缩进子项落普通文本
  8. **task-list 真 checkbox**（web `Markdown.tsx:424-439`，`accent-brand` checkbox）→ **削平**：前缀是文本 `[X] ` / `[ ] `（安卓同样不做真勾选框）
  9. **`.md-bq` 3 色左边框 / `.md-hr` 居中短线 / `.md-img*` lightbox 形态 / `.md-del`** → **削平**：PC 引用改为「无边框 / 每层 2 空格缩进」「满宽 1px 分隔线」「固定尺寸图片块」「`.md-strike`」
  10. **rehype-sanitize schema**（web 放行 `code.className`(`language-`) / `span.className`(hljs/token/shiki) / `input.type|checked|disabled`）→ **不再需要**：自研管线是**白名单渲染**（AST 决定产出什么 DOM），天然无 XSS 面
  11. **react-markdown v9 / v10 `components` 回调签名差异** → **不再适用**：PC 不再使用 react-markdown
- **预估改动**：**已交付**（M3 批 commit `b29207f`）—— `LibraryMarkdownTableCard.tsx` 111 行 → **59 行**，**0 依赖**（6 个第三方包从 `package.json` 摘除）

### B-16 · 正文容器：缺 `overflow-y-auto` / `w-full` / `flex-1`
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:301`
  ```tsx
  <div className="flex-1 px-4 lg:px-8 py-6 max-w-3xl mx-auto w-full space-y-5 overflow-y-auto">
  ```
- **PC**：`gacode-electron/src/routes/LibraryDetail.tsx:184-185`
  ```tsx
  <div className="min-h-full px-4 lg:px-8 py-6">
    <div className="max-w-3xl mx-auto space-y-5">
  ```
- **判定**：形态不同（3 处）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\LibraryDetail.tsx`
  - 锚点：`<div className="min-h-full px-4 lg:px-8 py-6">` + 内层 `<div className="max-w-3xl mx-auto space-y-5">`
  - 改为：
    ```tsx
    <div className="min-h-full px-4 lg:px-8 py-6 flex flex-col">
      <div className="flex-1 px-4 lg:px-8 py-6 max-w-3xl mx-auto w-full space-y-5 overflow-y-auto">
    ```
    （⚠️ 外层已有 `px-4 lg:px-8 py-6`，内层再带一份会双倍内距 → 落地时把外层改成 `<div className="min-h-full flex flex-col">`，只保留内层的 `px-4 lg:px-8 py-6`）
- **预估改动**：4 行

### B-17 · 加载态：顶栏 + 返回 + 「加载中...」+ Loader2
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:214-235`
  ```tsx
  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="sticky top-0 z-20 bg-bg-base border-b border-border">
          <div className="px-4 lg:px-8 max-w-3xl mx-auto w-full h-14 flex items-center gap-2">
            <button type="button" aria-label="返回" onClick={() => router.back()}
              className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors inline-flex items-center justify-center">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <span className="text-sm text-fg-muted">加载中...</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-fg-muted" />
        </div>
      </div>
    );
  }
  ```
- **PC**：`gacode-electron/src/routes/LibraryDetail.tsx:154-164`
  ```tsx
  <div className="min-h-full px-4 lg:px-8 py-8">
    <div className="max-w-3xl mx-auto">
      <div className="h-8 w-1/2 bg-bg-sunken rounded animate-pulse" />
      <div className="h-4 w-1/3 bg-bg-sunken rounded mt-3 animate-pulse" />
      <div className="h-64 w-full bg-bg-sunken rounded mt-6 animate-pulse" />
    </div>
  </div>
  ```
- **判定**：形态不同（顶栏 / 返回按钮 / 「加载中...」文案 / 居中转圈 全不同）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\LibraryDetail.tsx`
  - 锚点：`if (isLoading) {` 分支的 return
  - 改为（抄 web）：
    ```tsx
    if (isLoading) {
      return (
        <div className="flex flex-col h-full">
          <div className="sticky top-0 z-20 bg-bg-base border-b border-border">
            <div className="px-4 lg:px-8 max-w-3xl mx-auto w-full h-14 flex items-center gap-2">
              <button
                type="button"
                aria-label="返回"
                onClick={() => navigate(-1)}
                className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors inline-flex items-center justify-center"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
              <span className="text-sm text-fg-muted">加载中...</span>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <SpinnerIcon className="w-6 h-6 animate-spin text-fg-muted" />
          </div>
        </div>
      );
    }
    ```
- **预估改动**：约 20 行

### B-18 · 错误 / 不存在态：web 中性文案，PC 红色错误框
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:237-258`
  ```tsx
  if (!item || error) {
    return (
      <div className="flex flex-col h-full">
        <div className="sticky top-0 z-20 bg-bg-base border-b border-border">
          <div className="px-4 lg:px-8 max-w-3xl mx-auto w-full h-14 flex items-center gap-2">
            <button type="button" aria-label="返回" onClick={() => router.back()}
              className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors inline-flex items-center justify-center">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <span className="text-base font-medium">详情</span>
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center text-fg-muted text-sm">
          条目不存在或已被删除
        </div>
      </div>
    );
  }
  ```
- **PC**：`gacode-electron/src/routes/LibraryDetail.tsx:166-181`
  ```tsx
  <div className="rounded-md bg-danger-soft/30 border border-danger/40 px-4 py-3 text-sm">
    加载失败:{error instanceof Error ? error.message : "未找到"}
  </div>
  <div className="mt-4">
    <Button variant="ghost" size="md" onClick={() => navigate("/library")}>返回列表</Button>
  </div>
  ```
- **判定**：形态不同（4 处：顶栏、返回按钮、居中中性文案、红色错误框）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\LibraryDetail.tsx`
  - 锚点：`if (error || !item) {` 分支的 return
  - 改为（抄 web）：
    ```tsx
    if (error || !item) {
      return (
        <div className="flex flex-col h-full">
          <div className="sticky top-0 z-20 bg-bg-base border-b border-border">
            <div className="px-4 lg:px-8 max-w-3xl mx-auto w-full h-14 flex items-center gap-2">
              <button
                type="button"
                aria-label="返回"
                onClick={() => navigate(-1)}
                className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors inline-flex items-center justify-center"
              >
                <ArrowLeftIcon className="w-5 h-5" />
              </button>
              <span className="text-base font-medium">详情</span>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center text-fg-muted text-sm">
            条目不存在或已被删除
          </div>
        </div>
      );
    }
    ```
- **预估改动**：约 22 行

### B-19 · 删除后 toast variant
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:200` → `toast({ title: "已删除", variant: "default" })`
- **PC**：`gacode-electron/src/routes/LibraryDetail.tsx:74` → `toast({ message: "已删除", variant: "success" })`
- **判定**：形态不同（variant default vs success）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\LibraryDetail.tsx`
  - 锚点：`deleteMutation` 的 `onSuccess`
  - 改为：`toast({ message: "已删除", variant: "default" })`
- **预估改动**：1 行

### B-20 · 类型文案 fallback：`其他`
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:71-84`
  ```tsx
  function typeLabel(type: MemoryAtomDto["type"]): string {
    switch (type) {
      case "image": return "图片";
      case "doc": return "文档";
      case "link": return "链接";
      case "text": return "文本";
      default: return "其他";
    }
  }
  ```
- **PC**：`gacode-electron/src/routes/LibraryDetail.tsx:407-411`
  ```tsx
  const TYPE_LABEL: Record<string, string> = { image: "图片", doc: "文档", link: "链接", text: "文本" };
  ```
  传入未知 type → `TYPE_LABEL[item.type] || item.type` → 显示原始英文
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\LibraryDetail.tsx`
  - 锚点：`const TYPE_LABEL: Record<string, string> = {` 之后
  - 改为：加 `const TYPE_LABEL_OTHER = "其他";`，并把引用处 `TYPE_LABEL[item.type] || item.type` → `TYPE_LABEL[item.type] || TYPE_LABEL_OTHER`
  - ⚠️ **fallback 口径有两处，必须一起改（2026-10-26 复核补）**：`src/components/library/LibraryCard.tsx:32-37` **也有一份 `TYPE_LABEL`**（列表行用的那份），批 1-B **未改** ⇒ 会出现**详情页显示「其他」、列表行仍显示原始英文**的不一致。两处 fallback 口径要统一（建议把 `TYPE_LABEL` + `TYPE_LABEL_OTHER` 提到共享位置，两处共用）。
- **预估改动**：3 行（详情页）+ 3 行（LibraryCard）

### B-21 · 详情数据源端点不同
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:46-48` + `118` → `getMemoryAtomMapped(id)` = `GET /yinian/memories/:id`（snake→camel 运行时映射）
- **PC**：`gacode-electron/src/routes/LibraryDetail.tsx:63-67` → `getLibraryItem(id, true)` = `GET /yinian/library/:id?withContent=true`
- **判定**：形态不同（端点不同 → 返回字段不同，`title`/`content` 语义可能不一致）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\lib\api.ts`
  - 锚点：`export function getLibraryItem(id: string, withContent = false): Promise<LibraryItem>`（`api.ts:852-855`）
  - 1:1 还原需新增（或复用）一个 `getMemoryAtomMapped(id)`，走 `GET /yinian/memories/:id` 并做 snake→camel 映射（字段：`id` / `modality→type` / `title` / `raw_ref→url` / `content` / `tags` / `created_at→createdAt`）
  - ✅ **不阻塞（2026-10-26 复核修正，E-4）**：服务端 `GET /yinian/memories/:id` 的 DTO **没有顶层 `title` 字段**，**但 `metadata` 是返回的**，且 `metadata.title` 有值 —— `unified-api/src/modules/yinian/yinian.service.js:46-71` 的 `atomToApi` 返回 `metadata`（`:56` / `:61`）但没有 `title`；写入点 `library.routes.js:442`（POST 建条 `const metadata = { title }`）/ `:609`（PATCH 改标题 `baseMeta.title = title`）⇒ **PC 端自己映射 `metadata.title` → `title` 即可**，web 端显示「未命名」是**它没做这层映射**，不是后端缺数据（见 §十 第 4 条）
- **预估改动**：约 30 行（**无需接口实测**）

### B-22 · ErrorBoundary 包裹缺失
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:86-92`
  ```tsx
  export default function LibraryDetailPage() {
    return (
      <ErrorBoundary title="详情加载失败" description="条目可能已被删除, 返回列表重试">
        <LibraryDetailPageInner />
      </ErrorBoundary>
    );
  }
  ```
- **PC**：`gacode-electron/src/routes/LibraryDetail.tsx:57` `export function LibraryDetail() {` — 无边界
- **判定**：缺失
- **怎么改**：同 L-27，复用新建的 `src/components/common/ErrorBoundary.tsx`；`LibraryDetail` 拆成 `LibraryDetail`（包 ErrorBoundary）+ `LibraryDetailInner`（原函数体）
- **预估改动**：约 8 行（组件本体已在 L-27 计）

---

# 三、交付中心列表页

> web：`gacode-web/src/app/(main)/deliveries/page.tsx`（738 行）
> PC：`gacode-electron/src/routes/Deliveries.tsx`（832 行）+ `src/components/deliveries/{DeliveriesDropZone,MultiSelectToolbar}.tsx`

## 3.1 顶部操作栏

### D-01 · Tabs 形态：pill 药丸 → underline 下划线
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:198-207` → `<Tabs>` / `<TabsList>` / `<TabsTrigger>`（web 自己的 underline 实现，`gacode-web/src/components/ui/tabs.tsx:81-88`）
  ```
  "relative inline-flex items-center justify-center whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "disabled:pointer-events-none disabled:opacity-50",
  active ? "text-fg after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-t after:bg-brand"
         : "text-fg-muted hover:text-fg hover:bg-accent"
  ```
  `TabsList`：`"flex items-center justify-start gap-1 overflow-x-auto scrollbar-none"`（无 border-b）
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:244-263` — **自写 pill 药丸**（没用 PC 的 `Tabs` 组件）：
  ```tsx
  <div className="inline-flex p-1 rounded-md bg-bg-elevated gap-1">
    {TAB_DEFS.map((t) => {
      const active = tab === t.key;
      return (
        <button key={t.key} type="button" onClick={() => setTab(t.key)}
          className={[
            "px-3 py-1 text-sm rounded transition-colors duration-150",
            active ? "bg-brand text-brand-on shadow-sm" : "text-fg-muted hover:text-fg",
          ].join(" ")}
        >
          {t.label}
        </button>
      );
    })}
  </div>
  ```
- **判定**：形态不同（PC 是实心橙色药丸，web 是文字 + brand 下划线）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Deliveries.tsx`
  - 锚点：`<div className="inline-flex p-1 rounded-md bg-bg-elevated gap-1">` 整块
  - 改为复用 PC 的 `<Tabs variant="underline">`（该组件已在 L-01~L-05 改成 web 形态）：
    ```tsx
    <Tabs
      variant="underline"
      tabs={TAB_DEFS.map((t) => ({ key: t.key, label: t.label, icon: t.icon }))}
      activeKey={tab}
      onChange={(k) => setTab(k as TabKey)}
    />
    ```
  - import：`import { Tabs } from "../components/ui/Tabs";`
- **预估改动**：约 12 行

### D-02 · Tab 缺图标
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:69-77` + `200-205`
  ```tsx
  const TAB_DEFS: Array<{ key: TabKey; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: "all", label: "全部", icon: LayoutGrid },
    { key: "image", label: "图片", icon: ImageIcon },
    { key: "web", label: "网站", icon: Globe },
    { key: "document", label: "文档", icon: FileText },
  ];
  …
  <TabsTrigger key={t.key} value={t.key}>
    <t.icon className="w-4 h-4 mr-1.5" />
    {t.label}
  </TabsTrigger>
  ```
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:51-56` — `TAB_DEFS` 只有 `{ key, label }`
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Deliveries.tsx`
  - 锚点：`const TAB_DEFS: Array<{ key: TabKey; label: string }> = [`
  - 改为：`const TAB_DEFS: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [`，每项加 `icon`（4 个 svg 函数：`LayoutGridIcon` / `ImageIcon` / `GlobeIcon` / `FileTextIcon`，均 16px + `mr-1.5`）
  - 依赖：`Tabs` 的 `icon` 支持见 L-15
  - 注：PC 已有 `TypeIcon`（`Deliveries.tsx:698-725`）可复用 image/document 两个 path，但 web 的 image 用的是 `ImageIcon`（lucide Image，`rect + circle + path`），PC 的 `TypeIcon` image 分支 path 与 lucide Image 略有差异 → 建议新建 4 个纯 lucide path 的函数
- **预估改动**：约 45 行

### D-03 · 缺「搜索」折叠按钮
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:210-220`
  ```tsx
  <button
    type="button"
    onClick={() => setShowSearch((v) => !v)}
    aria-label="搜索"
    className={cn(
      "shrink-0 w-9 h-9 rounded-full transition-colors duration-150 inline-flex items-center justify-center",
      showSearch ? "bg-bg-elevated text-fg" : "text-fg-muted hover:bg-bg-elevated"
    )}
  >
    <Search className="w-5 h-5" />
  </button>
  ```
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:265-276` — 右侧只有 `SortMenu` + 刷新按钮，**无搜索 toggle**
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Deliveries.tsx`
  - 锚点：`<SortMenu value={sort} onChange={setSort} />` 之前
  - 新增 state（放在 `const [keyword, setKeyword] = useState("");` 之后）：
    ```tsx
    /** 搜索框折叠态 — web 端默认收起, 点搜索图标展开 */
    const [showSearch, setShowSearch] = useState(false);
    ```
  - 新增按钮（抄 web）：
    ```tsx
    <button
      type="button"
      onClick={() => setShowSearch((v) => !v)}
      aria-label="搜索"
      className={[
        "shrink-0 w-9 h-9 rounded-full transition-colors duration-150 inline-flex items-center justify-center",
        showSearch ? "bg-bg-elevated text-fg" : "text-fg-muted hover:bg-bg-elevated",
      ].join(" ")}
    >
      <SearchIcon className="w-5 h-5" />
    </button>
    ```
  - `SearchIcon`（`Deliveries.tsx:814-821`）目前硬编码 `width="16" height="16"` → 需改为支持 className 尺寸（见 D-04）
- **预估改动**：约 15 行

### D-04 · 搜索框：常驻 → 折叠 + 尺寸 + 占位符
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:235-249`
  ```tsx
  {showSearch && (
    <div className="pt-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted pointer-events-none z-10" />
        <Input
          type="search"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索标题或域名..."
          autoFocus
          className="pl-9 py-2 text-sm bg-muted/50 border-0 rounded-full focus-visible:ring-1 focus-visible:ring-brand"
        />
      </div>
    </div>
  )}
  ```
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:279-289`
  ```tsx
  <div className="relative">
    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted pointer-events-none" />
    <Input
      type="search"
      value={keyword}
      onChange={(e) => setKeyword(e.target.value)}
      placeholder="搜索标题..."
      className="pl-9 py-2 text-sm"
    />
  </div>
  ```
- **判定**：形态不同（5 处：常驻→折叠、占位符、底色、圆角、focus 环、图标 z-index）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Deliveries.tsx`
  - 锚点：`{/* Row 2: 搜索框 */}` 注释下的 `<div className="relative">`
  - 改为：
    ```tsx
    {showSearch ? (
      <div className="relative pt-2">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted pointer-events-none z-10" />
        <Input
          type="search"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="搜索标题或域名..."
          autoFocus
          className="pl-9 !py-2 !text-sm bg-muted/50 border-0 focus:border-transparent !rounded-full focus-visible:ring-1 focus-visible:ring-brand"
        />
      </div>
    ) : null}
    ```
  - ⚠️ PC `Input` base（`src/components/ui/Input.tsx:24`）含 `rounded-md` / `px-4 py-3` / `text-base` / `bg-bg-sunken` / `border border-border`，全会被盖 → 需 `!` 前缀（`!rounded-full` / `!py-2` / `!text-sm`）+ `bg-muted/50` + `border-0` + `focus:border-transparent`（见 S-08）
  - `SearchIcon` 需支持 `w-4 h-4`（搜索框内 16px）与 `w-5 h-5`（按钮 20px）→ 改签名为 `function SearchIcon({ className = "", size = 16 }: { className?: string; size?: number })`
- **预估改动**：约 20 行

### D-05 · sticky 顶栏样式
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:193-194`
  ```
  "sticky top-0 z-20 bg-bg-base/95 backdrop-blur pt-2 pb-4"
  ```
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:239-240`
  ```
  "sticky top-0 z-10 bg-bg-base" + "px-4 lg:px-8 max-w-5xl mx-auto w-full space-y-2 py-2"
  ```
- **判定**：形态不同（半透明 + 模糊 + 内距 + 层级 4 处）
- **怎么改**：同 L-10 —— 改为 `"sticky top-0 z-20 bg-bg-base/95 backdrop-blur pt-2 pb-4"`，内层去掉 `py-2`
- **预估改动**：2 行

### D-06 · 列表容器：`py-2` + `overflow-y-auto`
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:261`
  ```
  "flex-1 overflow-y-auto px-4 lg:px-8 max-w-5xl mx-auto w-full py-2"
  ```
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:294`
  ```
  "flex-1 px-4 lg:px-8 max-w-5xl mx-auto w-full py-4"
  ```
- **判定**：形态不同（2 处：`py-4`→`py-2`、缺 `overflow-y-auto`）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Deliveries.tsx`
  - 锚点：`{/* 列表 */}` 下的 `<div className="flex-1 px-4 lg:px-8 max-w-5xl mx-auto w-full py-4">`
  - 改为：`"flex-1 overflow-y-auto px-4 lg:px-8 max-w-5xl mx-auto w-full py-2"`
- **预估改动**：1 行

## 3.2 卡片

### D-07 · 网格间距：`gap-3` → `gap-4`
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:272` / `288` / `303` — 全部 `grid grid-cols-1 sm:grid-cols-2 gap-4`
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:401` / `423` / `447` — `gap-3`
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Deliveries.tsx`
  - 锚点：`DocumentSplitGrid` 内两处 `grid grid-cols-1 sm:grid-cols-2 gap-3` + 主 return 的 `grid grid-cols-1 sm:grid-cols-2 gap-3`
  - 全部改为 `gap-4`
- **预估改动**：3 行

### D-08 · 卡片按类型分三种形态（web ImageCard / WebCard / DocumentCard），PC 是统一一种
> **结构级差异**，逐条写清
- **web**：按 `item.deliverableType` 分派三套渲染（`deliveries/page.tsx:273-281`）：
  - `ImageCard`（`deliveries/page.tsx:408-480`）：**1:1 方形缩略图** + 标题 + 「图片 · 时间」
  - `WebCard`（`deliveries/page.tsx:487-559`）：**16:9 缩略图**（无缩略图时渐变 + Globe 占位）+ 标题 + 「网站 · 域名 · 时间」
  - `DocumentCard`（`deliveries/page.tsx:567-669`）：**无缩略图**，横向行 = 文件图标按钮 + 标题 + 「文档 · mime · 大小」+ 时间 + 下载按钮 + ⋮
- **PC 现有做法**：`Deliveries.tsx:469-583` 的 `DeliveryCard` **一种形态打天下** —— 左侧 64×64 缩略方块（`Deliveries.tsx:528-538`），右侧类型 chip + 标题 + 「大小 · 时间」，底部一行「删除 / 重新下载」文字按钮。
- **1:1 还原后 PC 应该做什么**：拆成三个组件 `ImageCard` / `WebCard` / `DocumentCard`，按 `item.deliverableType` 分派；「全部」tab 混排三型（web `deliveries/page.tsx:266-284`）。
- **判定**：形态不同（**大项**）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Deliveries.tsx`（或新建 `src/components/deliveries/` 下三个卡片组件）
  - 锚点：`DocumentSplitGrid` 的 `items.map((d) => (<DeliveryCard … />))`（`Deliveries.tsx:448-459`）
  - 新组件 props 签名（三个卡片统一）：
    ```tsx
    export interface DeliveryCardProps {
      item: Deliverable;
      /** 多选模式下整卡当 checkbox 用 */
      isInMultiSelect: boolean;
      isSelected: boolean;
      onToggleSelect: () => void;
      onOpen: () => void;
      onDelete: () => void;
    }
    ```
  - 三个组件的 DOM 逐字抄 web（见 D-09 / D-10 / D-11）
  - 依赖：PC 无 lucide-react → 需新增 svg 函数 `DownloadIcon` / `Trash2Icon` / `GlobeIcon` / `ImageIcon` / `FileTextIcon` / `MoreVertIcon` / `Loader2Icon` / `PackageOpenIcon`
- **预估改动**：约 220 行（三组件 + 5 图标 + 分派逻辑）

### D-09 · ImageCard 视觉（1:1 方形缩略图）
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:433-478`
  ```tsx
  <div className="group relative block w-full text-left rounded-2xl shadow-sm bg-card hover:bg-muted/50 transition-colors duration-150 overflow-hidden">
    <button type="button" onClick={open} className="block w-full text-left">
      <div className="relative w-full bg-muted overflow-hidden" style={{ aspectRatio: "1 / 1" }}>
        {src && !errored ? (
          <img src={src} alt={item.title || item.prompt || "image"}
            className="absolute inset-0 w-full h-full object-cover" loading="lazy" onError={() => setErrored(true)} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-fg-muted p-2">
            <ImageIcon className="w-8 h-8" />
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="text-base font-medium truncate">{item.title || item.prompt || "未命名图片"}</div>
        <div className="text-xs text-fg-muted mt-1 flex items-center gap-1.5 truncate">
          <span className="text-fg-muted/70">图片</span>
          <span className="text-fg-muted/40">·</span>
          <span className="truncate">{time}</span>
        </div>
      </div>
    </button>
    <div className="absolute top-1.5 right-1.5 z-10">
      <CardMenu item={item} onDelete={onDelete} />
    </div>
  </div>
  ```
  `time` = `formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: zhCN })`
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:503-525`（统一 `DeliveryCard`）
- **判定**：缺失（PC 无此形态）
- **怎么改**：随 D-08 一起新建 `ImageCard` 组件，DOM 逐字抄上面的 web 原文。`src` 取 `item.thumbnailUrl || item.url`（web `deliveries/page.tsx:419`）
- **预估改动**：约 60 行

### D-10 · WebCard 视觉（16:9 + 渐变占位）
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:510-557`
  ```tsx
  <div className="group relative block w-full text-left rounded-2xl shadow-sm bg-card hover:bg-muted/50 transition-colors duration-150 overflow-hidden">
    <button type="button" onClick={open} className="block w-full text-left">
      <div className="relative w-full bg-muted overflow-hidden" style={{ aspectRatio: "16 / 9" }}>
        {item.thumbnailUrl && !errored ? (
          <img src={item.thumbnailUrl} alt={item.title || domain}
            className="absolute inset-0 w-full h-full object-cover" loading="lazy" onError={() => setErrored(true)} />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-brand-container to-muted text-fg-muted">
            <Globe className="w-10 h-10" />
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="text-base font-medium truncate">{item.title || domain || "未命名网页"}</div>
        <div className="text-xs text-fg-muted mt-1 flex items-center gap-1.5 truncate">
          <span className="text-fg-muted/70">网站</span>
          {domain && (<><span className="text-fg-muted/40">·</span><span className="truncate">{domain}</span></>)}
          <span className="text-fg-muted/40">·</span>
          <span className="truncate">{time}</span>
        </div>
      </div>
    </button>
    <div className="absolute top-1.5 right-1.5 z-10">
      <CardMenu item={item} onDelete={onDelete} />
    </div>
  </div>
  ```
  `domain` = `deriveDomain(item.url)`（`deliveries/page.tsx:94-101`，`new URL(url).hostname.replace(/^www\./, "")`）
- **PC**：`gacode-electron/src/routes/Deliveries.tsx` — 无 web 卡片、无域名派生
- **判定**：缺失（PC 无此形态 + 无域名派生函数）
- **怎么改**：随 D-08 一起新建 `WebCard`；并新增 helper：
  ```tsx
  /** 从 url 派生域名 — web 端 deriveDomain: new URL(url).hostname 去 www. */
  function deriveDomain(url?: string): string {
    if (!url) return "";
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  }
  ```
- **预估改动**：约 60 行

### D-11 · DocumentCard 视觉（横向行 + 下载按钮 + ⋮ 内联）
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:609-667`
  ```tsx
  <div className="rounded-2xl shadow-sm bg-card hover:bg-muted/50 transition-colors duration-150 p-4">
    <div className="flex items-start gap-3">
      <button
        type="button"
        onClick={download}
        disabled={busy || !item.url}
        className="shrink-0 w-10 h-10 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/70 transition-colors"
        aria-label="下载文档"
      >
        {busy ? <Loader2 className="w-5 h-5 text-brand-yellow animate-spin" /> : <FileText className="w-5 h-5 text-brand-yellow" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="text-base font-medium truncate">{item.title || "未命名文档"}</div>
        <div className="text-xs text-fg-muted mt-1 flex items-center gap-1.5 flex-wrap">
          <span className="text-fg-muted/70">文档</span>
          {item.mimeType && (<><span className="text-fg-muted/40">·</span><span className="text-fg-muted/70">{item.mimeType}</span></>)}
          {sizeStr && (<><span className="text-fg-muted/40">·</span><span>{sizeStr}</span></>)}
        </div>
        <div className="text-xs text-fg-muted/70 mt-1">{time}</div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={download}
        disabled={busy || !item.url}
        aria-label="下载"
        className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-muted transition-colors duration-150"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
      </Button>
      <CardMenu item={item} onDelete={onDelete} />
    </div>
  </div>
  ```
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:503-525` + `554-579` — PC 有缩略方块 + 底部文字按钮「删除 / 重新下载」，**无 mimeType 行、无独立下载图标按钮、无 ⋮ 菜单**
- **判定**：缺失
- **怎么改**：随 D-08 一起新建 `DocumentCard`。`sizeStr` 用 PC 现有 `formatBytes`（`Deliveries.tsx:771-779`，与 web `deliveries/page.tsx:84-92` **逐字一致** ✓）。`download` 逻辑见 D-13
- **预估改动**：约 70 行

### D-12 · CardMenu（⋮ 菜单，只含「删除」）
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:693-712`
  ```tsx
  <DropdownMenu>
    <DropdownMenuTrigger
      aria-label="更多"
      className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-muted transition-colors duration-150 inline-flex items-center justify-center outline-none data-[state=open]:bg-muted"
    >
      <MoreVertical className="w-4 h-4" />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-[8rem] border-0 rounded-xl bg-popover">
      <DropdownMenuItem onClick={() => onDelete(item)} className="text-danger focus:text-danger">
        <Trash2 className="w-4 h-4" />
        删除
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
  ```
- **PC**：`gacode-electron/src/routes/Deliveries.tsx` — **无 ⋮ 菜单**；删除是卡片底部一行文字按钮「删除」（`Deliveries.tsx:557-566`）
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\deliveries\CardMenu.tsx`（新建）
  - props：
    ```tsx
    export interface CardMenuProps {
      item: Deliverable;
      onDelete: (item: Deliverable) => void;
    }
    ```
  - 渲染（PC `DropdownMenu` 组件形态见 `src/components/ui/DropdownMenu.tsx`）：
    ```tsx
    <DropdownMenu
      align="right"
      trigger={
        <button
          type="button"
          aria-label="更多"
          className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-muted transition-colors duration-150 inline-flex items-center justify-center outline-none"
        >
          <MoreVertIcon className="w-4 h-4" />
        </button>
      }
      items={[
        {
          label: "删除",
          destructive: true,
          render: (
            <span className="inline-flex items-center gap-2">
              <Trash2Icon className="w-4 h-4" />
              删除
            </span>
          ),
          onClick: () => onDelete(item),
        },
      ]}
    />
    ```
  - ⚠️ PC `DropdownMenu` 的容器 className（`src/components/ui/DropdownMenu.tsx:87-91`）是 `"absolute z-50 mt-1 min-w-[160px] rounded-md bg-bg-elevated shadow-dialog animate-fade-in py-1"` — web 是 `rounded-xl bg-popover`；另 `DropdownMenu` 的 trigger 会 `e.stopPropagation()`（`DropdownMenu.tsx:144`）→ **天然不会触发卡片主点击** ✓
  - 依赖：需新增 `MoreVertIcon` / `Trash2Icon`（16px）
- **预估改动**：约 45 行

### D-13 · 卡片点击行为：web 开新窗口，PC 跳详情页
> **高价值行为差异**
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:421-425`（ImageCard）/ `500-504`（WebCard）
  ```tsx
  const open = () => {
    if (item.url && typeof window !== "undefined") {
      window.open(item.url, "_blank", "noopener,noreferrer");
    }
  };
  ```
  → **点卡片 = 在新标签打开交付物原链接**，不进详情页。
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:308` → `onOpen={(d) => navigate(\`/deliveries/${d.id}\`)}` → **点卡片 = 进 PC 自己的详情页**
- **判定**：形态不同（行为不一致）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Deliveries.tsx`
  - 锚点：`DocumentSplitGrid` 调用处的 `onOpen={(d) => navigate(\`/deliveries/${d.id}\`)}`（`Deliveries.tsx:308`）
  - 1:1 还原 → `onOpen={(d) => { if (d.url) window.open(d.url, "_blank", "noopener,noreferrer"); }}`
  - ⚠️ PC 是 Electron：`window.open` 在 Electron 里默认开新 BrowserWindow（`webPreferences` 决定），若要走系统默认浏览器需走 IPC `window.gacode.openWithSystem`（PC `DeliveryDetail.tsx:48-68` 已有该 IPC）
    - **建议**：PC 端 1:1 还原成「用系统默认应用打开原链接」→ `onOpen={(d) => { if (d.url) void openWithSystem(d.url); }}`
    - 但这会 **移除 PC 的详情页入口**（PC 增强）→ 属「PC 增强不列」范畴，但**行为不一致**要点出：**需 gaga 拍**（见 X-05）
  - ⚠️ DocumentCard 的下载按钮是另一条路径（`download()`，见 D-14），不受影响
- **预估改动**：约 6 行

### D-14 · 文档下载：PC 无 blob 下载 + 无文件名策略
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:581-601`
  ```tsx
  const download = async () => {
    if (!item.url) return;
    setBusy(true);
    try {
      const res = await fetch(item.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = pickDeliverableDownloadName(item, "file");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error("download failed", err);
    } finally {
      setBusy(false);
    }
  };
  ```
  `pickDeliverableDownloadName`（`gacode-web/src/lib/deliverable-download-name.ts`，注释见 `deliveries/page.tsx:52-53`：「下载文件名只**挑**不拼: 服务端 displayName → title → 兜底串」）
- **PC**：`gacode-electron/src/routes/Deliveries.tsx` — **无下载实现**（PC 的「重新下载」按钮调 `retryDownloadDeliverable` —— PC 增强）
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\lib\api.ts`（新增 helper）+ `src\routes\Deliveries.tsx`
  - 新增 helper（PC 端等价物，**需读 web `src/lib/deliverable-download-name.ts` 抄原文** —— 该文件未读，**待核**）：
    ```ts
    /** 下载文件名 — 服务端 displayName → title → 兜底串 (只挑不拼) */
    export function pickDeliverableDownloadName(item: Deliverable, fallback: string): string { … }
    ```
  - `DocumentCard` 内加 `download()`（抄 web），并新增 state `const [busy, setBusy] = useState(false);`
  - ⚠️ Electron 里 `<a download>` 不触发系统下载，需走主进程 `downloadURL` IPC（**PC 端已有 `window.gacode.openWithSystem`，但没有 download IPC —— 待核主进程 preload**）
- **预估改动**：约 40 行 + 待核 Electron download IPC

### D-15 · 空态卡片
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:362-377`
  ```tsx
  <Card className="border-0 shadow-none bg-card rounded-2xl">
    <CardContent className="p-10 text-center text-fg-muted">
      <Construction className="w-12 h-12 mx-auto text-fg-muted mb-4" />
      <div className="text-base font-medium mb-1 text-fg">暂无交付物</div>
      <div className="text-sm">
        {keyword ? `未找到包含 "${keyword}" 的交付物` : "AI 生成的图片 / 网站 / 文档将自动汇总到这里"}
      </div>
    </CardContent>
  </Card>
  ```
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:731-745`
  ```tsx
  <div className="h-full flex items-center justify-center">
    <div className="rounded-md bg-bg-sunken p-8 text-center max-w-sm">
      <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-elevated flex items-center justify-center text-fg-muted">
        <PackageIcon />
      </div>
      <p className="text-base font-medium mb-1">还没有交付物</p>
      <p className="text-sm text-fg-muted">在对话中生成的图片、网站、文档会自动出现在这里</p>
    </div>
  </div>
  ```
- **判定**：形态不同（6 处：圆角 / 底色 / 内距 / 宽度 / 图标 / 文案 ×2 / 缺 keyword 分支）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Deliveries.tsx`
  - 锚点：`function EmptyState() {`（`Deliveries.tsx:731`）
  - 改为：
    ```tsx
    function EmptyState({ keyword }: { keyword?: string }) {
      return (
        <div className="border-0 shadow-none bg-card rounded-2xl">
          <div className="p-10 text-center text-fg-muted">
            <ConstructionIcon className="w-12 h-12 mx-auto text-fg-muted mb-4" />
            <div className="text-base font-medium mb-1 text-fg">暂无交付物</div>
            <div className="text-sm">
              {keyword
                ? `未找到包含 "${keyword}" 的交付物`
                : "AI 生成的图片 / 网站 / 文档将自动汇总到这里"}
            </div>
          </div>
        </div>
      );
    }
    ```
  - 调用处 `Deliveries.tsx:298` → `<EmptyState keyword={keyword} />`；`Deliveries.tsx:441` → `<EmptyState keyword={keyword} />`
  - 依赖：需新增 `ConstructionIcon`（同 L-18，可提到 `src/components/ui/Icons.tsx` 共享）
  - 注：web 的空态卡片 **没有** 外层垂直居中（贴在容器顶部）→ PC 的 `h-full flex items-center justify-center` 要删
- **预估改动**：约 20 行

### D-16 · 「加载更多」按钮形态
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:382-400`
  ```tsx
  <div className="py-4 text-center">
    <button
      type="button"
      onClick={onLoad}
      disabled={loading}
      className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg disabled:opacity-50 transition-colors duration-150"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackageOpen className="w-4 h-4" />}
      加载更多
    </button>
  </div>
  ```
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:313-324`
  ```tsx
  <div className="flex justify-center mt-4">
    <Button variant="ghost" size="md" loading={isFetching} onClick={() => setPage((p) => p + 1)}>加载更多</Button>
  </div>
  ```
- **判定**：形态不同
- **怎么改**：同 L-23 —— 抄 web 的纯文字按钮结构；需新增 `PackageOpenIcon`（lucide PackageOpen）+ `SpinnerIcon`
- **预估改动**：约 15 行

### D-17 · 骨架屏形态
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:719-738`
  ```tsx
  function SkeletonGrid({ tab }: { tab: TabKey }) {
    if (tab === "document") {
      return (
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl bg-card" />
          ))}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="w-full rounded-2xl bg-card" style={{ aspectRatio: "1 / 1" }} />
        ))}
      </div>
    );
  }
  ```
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:747-765` — 6 张 `rounded-md bg-bg-elevated p-3 animate-pulse` 结构骨架
- **判定**：形态不同（数量分组 / 圆角 / 底色 / 比例）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Deliveries.tsx`
  - 锚点：`function SkeletonGrid() {` 整体替换
  - 改为：
    ```tsx
    function SkeletonGrid({ tab }: { tab: TabKey }) {
      if (tab === "document") {
        return (
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 w-full rounded-2xl bg-card animate-pulse" />
            ))}
          </div>
        );
      }
      return (
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="w-full rounded-2xl bg-card animate-pulse" style={{ aspectRatio: "1 / 1" }} />
          ))}
        </div>
      );
    }
    ```
  - 调用处 `Deliveries.tsx:296` → `<SkeletonGrid tab={tab} />`
  - 注：web 的 `Skeleton` 组件自带 `animate-pulse`（`gacode-web/src/components/ui/skeleton.tsx`），PC 用裸 div 需自带 `animate-pulse` ✓
- **预估改动**：约 25 行

### D-18 · 删除确认弹窗文案
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:330-351`
  ```tsx
  <AlertDialogTitle>确定删除该交付物？</AlertDialogTitle>
  <AlertDialogDescription>
    将从你的交付中心移除{deleteTarget?.title ? `“${deleteTarget.title}”` : "这条记录"}。此操作不可撤销。
  </AlertDialogDescription>
  <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
  <AlertDialogAction onClick={…} disabled={deleteMutation.isPending}>
    {deleteMutation.isPending ? "删除中..." : "我确定"}
  </AlertDialogAction>
  ```
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:343-353`
  ```tsx
  <ConfirmDialog
    title="删除这条交付?"
    message="删除后无法恢复。"
    confirmLabel="确认删除"
    confirmVariant="danger"
    …
  />
  ```
- **判定**：形态不同（标题 / 描述 / 确认按钮文案 3 处）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Deliveries.tsx`
  - 锚点：`<ConfirmDialog title="删除这条交付?" message="删除后无法恢复。" confirmLabel="确认删除" …>`
  - 改为：
    ```tsx
    <ConfirmDialog
      title="确定删除该交付物？"
      message={`将从你的交付中心移除${deleteTarget?.title ? `“${deleteTarget.title}”` : "这条记录"}。此操作不可撤销。`}
      confirmLabel="我确定"
      cancelLabel="取消"
      confirmVariant="danger"
      loading={deleteMutation.isPending}
      onCancel={() => setDeleteTarget(null)}
      onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
    />
    ```
  - pending 态文案：web 是「删除中...」，PC `ConfirmDialog` 的 `loading` 会显示 spinner + `confirmLabel` 同时存在（`src/components/ui/ConfirmDialog.tsx:60-67`）→ 需给 `ConfirmDialog` 新增可选 prop `confirmLoadingText?: string`（默认不传则保持原行为），传 `"删除中..."` 时替换 children
- **预估改动**：约 12 行（含 ConfirmDialog 扩展）

### D-19 · 删除 toast 文案结构
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:160` → `toast({ title: "已删除", variant: "success" })`
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:136` → `toast({ message: "已删除", variant: "success" })` ✓ 文案一致
- **判定**：已一致（`message` vs `title` 是 Toast 组件 API 差异，见 S-07）
- **怎么改**：无
- **预估改动**：0

### D-20 · 删除失败 toast
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:162-168`
  ```tsx
  toast({ title: "删除失败", description: String((err as Error)?.message || err), variant: "danger" });
  ```
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:138-143`
  ```tsx
  toast({ message: `删除失败: ${err instanceof Error ? err.message : String(err)}`, variant: "danger" });
  ```
- **判定**：形态不同（两段 vs 一行拼接）
- **怎么改**：见 S-07（Toast 组件扩 title/description 后统一改）
- **预估改动**：2 行

### D-21 · 删除后立即从本地列表移除
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:154-160`
  ```tsx
  onSuccess: (_data, id) => {
    setItems((cur) => cur.filter((d) => d.id !== id));
    setDeleteTarget(null);
    queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    toast({ title: "已删除", variant: "success" });
  },
  ```
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:126-137` — 同样 `setItems((cur) => cur.filter((d) => d.id !== id))` + `invalidateQueries` + toast ✓
- **判定**：已一致
- **怎么改**：无
- **预估改动**：0

### D-22 · 刷新 toast
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:181-185`
  ```tsx
  const handleRefresh = () => {
    setPage(1);
    queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    toast({ title: "已刷新", variant: "default" });
  };
  ```
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:200-204` — **完全一致** ✓
- **判定**：已一致
- **怎么改**：无
- **预估改动**：0

### D-23 · 每页条数 / 分页累积
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:131` — `pageSize: 30`，`useEffect` 累积（`deliveries/page.tsx:171-179`）
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:58` — `const PAGE_SIZE = 30;` ✓；`useEffect` 累积（`Deliveries.tsx:99-107`）✓
- **判定**：已一致
- **怎么改**：无
- **预估改动**：0

### D-24 · 刷新时重置分页
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:182` — `setPage(1)`
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:201` — `setPage(1)` ✓
- **判定**：已一致
- **怎么改**：无
- **预估改动**：0

### D-25 · tab / keyword 变化重置分页
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:123-127`
  ```tsx
  useEffect(() => { setItems([]); setPage(1); setHasMore(true); }, [tab, keyword]);
  ```
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:81-85` — 同款 + 多一个 `sort` ✓
- **判定**：已一致
- **怎么改**：无
- **预估改动**：0

### D-26 · PC 的排序菜单（SortMenu）
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:266` — `<SortMenu value={sort} onChange={setSort} />` + `sortedItems` 客户端排序（`Deliveries.tsx:110-118`）
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx` — **无排序**
- **判定**：**不列为差异**（PC 增强）
- **怎么改**：无（保留不动）
- **预估改动**：0

### D-27 · PC 的多选 toolbar / PdfCard 分组 / retry 按钮
- **PC**：`DeliveriesMultiSelectToolbar`（`Deliveries.tsx:330-341`）、`DocumentSplitGrid` 的 PDF / 其它文档分组（`Deliveries.tsx:387-445`）、「重新下载」按钮（`Deliveries.tsx:567-577`）
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx` — 全部没有
- **判定**：**不列为差异**（PC 增强）
- **怎么改**：无（保留不动）
- **预估改动**：0

---

# 四、交付中心详情页

> web：`gacode-web/src/app/(main)/deliveries/[id]/page.tsx`（533 行）
> PC：`gacode-electron/src/routes/DiveryDetail.tsx`（411 行）

### E-01 · 顶部面包屑（返回 + 刷新）
- **web**：`gacode-web/src/app/(main)/deliveries/[id]/page.tsx:311-329`
  ```tsx
  <div className="flex items-center justify-between mb-3">
    <Link href="/deliveries" className="inline-flex items-center text-xs text-fg-muted hover:text-fg">
      <ArrowLeft className="w-4 h-4 mr-1" />
      返回
    </Link>
    <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching} aria-label="刷新">
      <RefreshCcw className={cn("w-4 h-4", isFetching && "animate-spin")} />
    </Button>
  </div>
  ```
- **PC**：`gacode-electron/src/routes/DiveryDetail.tsx` — 无顶栏、无返回、无刷新按钮
- **判定**：缺失（2 个子项：返回链接 + 刷新按钮）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\DeliveryDetail.tsx`
  - 锚点：`return (` 内 `<div className="min-h-full px-4 lg:px-8 py-6">` 的最前面
  - 新增：
    ```tsx
    <div className="flex items-center justify-between mb-3">
      <button
        type="button"
        onClick={() => navigate("/deliveries")}
        className="inline-flex items-center text-xs text-fg-muted hover:text-fg"
      >
        <ArrowLeftIcon className="w-4 h-4 mr-1" />
        返回
      </button>
      <Button
        variant="ghost"
        size="md"
        onClick={() => refetch()}
        disabled={isFetching}
        aria-label="刷新"
        className="w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors duration-150"
      >
        <RefreshCcwIcon className={isFetching ? "animate-spin" : ""} />
      </Button>
    </div>
    ```
  - 依赖：`refetch` 需从 `useQuery` 解构（`DeliveryDetail.tsx:38` 当前只解构 `{ data, isLoading, error }` → 加 `refetch, isFetching`）；需新增 `ArrowLeftIcon` / `RefreshCcwIcon`（lucide RefreshCcw path：`M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8` + `M21 3v5h-5` + `M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16` + `M8 16H3v5` + `M16 8h5V3`）
  - ⚠️ PC `Button` 无 `size="icon"`（只有 `sm`/`md`/`lg`）→ 用 `size="md"` + 覆写 className 为 `w-9 h-9`（`h-10` 与 `w-9 h-9` 冲突 → 需 `!h-9`）
- **预估改动**：约 20 行

### E-02 · 容器宽度：`max-w-2xl` vs `max-w-3xl`
- **web**：`gacode-web/src/app/(main)/deliveries/[id]/page.tsx:310` → `"px-4 lg:px-8 max-w-2xl mx-auto w-full py-6"`
- **PC**：`gacode-electron/src/routes/DiveryDetail.tsx:115-116` → `"min-h-full px-4 lg:px-8 py-6"` + `"max-w-3xl mx-auto space-y-5"`
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\DeliveryDetail.tsx`
  - 锚点：`<div className="max-w-3xl mx-auto space-y-5">`
  - 改为：`<div className="max-w-2xl mx-auto w-full space-y-5">`
- **预估改动**：1 行

### E-03 · 大图预览（16:9 + border）
- **web**：`gacode-web/src/app/(main)/deliveries/[id]/page.tsx:332-353`
  ```tsx
  {isImage && item.url && (
    <div className="relative w-full bg-bg-sunken rounded-md overflow-hidden mb-4 border border-border">
      <div className="w-full" style={{ aspectRatio: "16 / 9" }}>
        {!imageErrored ? (
          <img src={item.url} alt={item.title || item.prompt || "image"}
            className="w-full h-full object-contain" onError={() => setImageErrored(true)} />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-fg-muted gap-2 p-4">
            <ImageIcon className="w-10 h-10" />
            <div className="text-sm">图片加载失败</div>
          </div>
        )}
      </div>
    </div>
  )}
  ```
- **PC**：`gacode-electron/src/routes/DiveryDetail.tsx:280-290`
  ```tsx
  <div className="rounded-md bg-bg-elevated p-3">
    <img src={url} alt={item.title || "image"} className="max-w-full max-h-[70vh] mx-auto rounded" />
  </div>
  ```
- **判定**：形态不同（5 处：边框 / 底色 / 比例 16:9 / img className / 失败态缺失）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\DeliveryDetail.tsx`
  - 锚点：`ContentView` 内 `if (item.deliverableType === "image" && url) {` 分支
  - 改为：
    ```tsx
    if (item.deliverableType === "image" && url) {
      return (
        <div className="relative w-full bg-bg-sunken rounded-md overflow-hidden mb-4 border border-border">
          <div className="w-full" style={{ aspectRatio: "16 / 9" }}>
            {!errored ? (
              <img
                src={url}
                alt={item.title || item.prompt || "image"}
                className="w-full h-full object-contain"
                onError={() => setErrored(true)}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-fg-muted gap-2 p-4">
                <ImageIcon className="w-10 h-10" />
                <div className="text-sm">图片加载失败</div>
              </div>
            )}
          </div>
        </div>
      );
    }
    ```
  - 需新增 state `const [errored, setErrored] = useState(false);`（在 `ContentView` 内）+ 依赖 `ImageIcon`
  - 注：`ContentView` 是独立函数组件，state 要放它内部
- **预估改动**：约 25 行

### E-04 · 标题字号
- **web**：`gacode-web/src/app/(main)/deliveries/[id]/page.tsx:357-359`
  ```tsx
  <h1 className="text-lg font-semibold text-fg leading-snug break-words">
    {item.title || "(无标题)"}
  </h1>
  ```
- **PC**：`gacode-electron/src/routes/DiveryDetail.tsx:134-136`
  ```tsx
  <h1 className="text-xl font-medium text-fg break-all">
    {item.title || "(无标题)"}
  </h1>
  ```
- **判定**：形态不同（`text-lg`→`text-xl`、`font-semibold`→`font-medium`、缺 `leading-snug`、`break-words`→`break-all`）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\DeliveryDetail.tsx`
  - 锚点：`<h1 className="text-xl font-medium text-fg break-all">`
  - 改为：`<h1 className="text-lg font-semibold text-fg leading-snug break-words">`
- **预估改动**：1 行

### E-05 · 类型 Badge + 时间 + 域名
- **web**：`gacode-web/src/app/(main)/deliveries/[id]/page.tsx:360-369`
  ```tsx
  <div className="flex items-center gap-2 mt-2 flex-wrap">
    <Badge variant="secondary" className="text-[10px] px-1.5 inline-flex items-center gap-1">
      <TypeIcon className="w-3 h-3" />
      {TYPE_LABELS[item.deliverableType]}
    </Badge>
    <span className="text-xs text-fg-muted font-mono">{timeStr}</span>
    {domain && (
      <span className="text-xs text-fg-muted truncate max-w-[16rem]">{domain}</span>
    )}
  </div>
  ```
  `timeStr` = `format(new Date(item.createdAt), "yyyy-MM-dd HH:mm", { locale: zhCN })`（`deliveries/[id]/page.tsx:306`）
- **PC**：`gacode-electron/src/routes/DiveryDetail.tsx:119-133` — 类型 chip 无图标 + `#{item.id}` + `·` + `toLocaleString()` 时间 + 「· 用户上传 / · AI 生成」；**无域名**
- **判定**：形态不同（5 处：Badge 组件 / 类型图标 / 时间格式 / 域名缺失）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\DeliveryDetail.tsx`
  - 锚点：`<header className="space-y-2">` 内的 `flex items-center gap-2` 那一行
  - 1) 时间格式：新增 helper
    ```tsx
    /** 时间格式 — web 端 format(d, "yyyy-MM-dd HH:mm", { locale: zhCN }) 的等价实现 */
    function formatDateTime(iso: string): string {
      if (!iso) return "-";
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      const p = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
    }
    ```
  - 2) 时间 span className：`text-xs text-fg-subtle` → `text-xs text-fg-muted font-mono`
  - 3) 加域名 span（需新增 `deriveDomain`，同 D-10）
  - 4) 类型徽章改 web `Badge`（className **待核**，见 `gacode-web/src/components/ui/badge.tsx`），内含 12px 类型图标
  - 5) PC 的 `#{item.id}` 与「· 用户上传 / · AI 生成」是 PC 增强 → **保留**
- **预估改动**：约 25 行

### E-06 · 元信息卡（类型 / 大小 / 生成提示词 / 无元数据）
- **web**：`gacode-web/src/app/(main)/deliveries/[id]/page.tsx:372-391`
  ```tsx
  <Card className="mb-4">
    <CardContent className="p-3 space-y-2 text-sm">
      {item.mimeType && (<MetaRow label="类型" value={item.mimeType} />)}
      {sizeStr && (<MetaRow label="大小" value={sizeStr} />)}
      {item.prompt && (
        <div>
          <div className="text-xs text-fg-muted mb-1">生成提示词</div>
          <div className="text-sm text-fg break-words whitespace-pre-wrap">{item.prompt}</div>
        </div>
      )}
      {!item.prompt && !item.mimeType && !sizeStr && (
        <div className="text-fg-muted text-xs">无元数据</div>
      )}
    </CardContent>
  </Card>
  ```
  `MetaRow`（`deliveries/[id]/page.tsx:526-533`）：
  ```tsx
  <div className="flex items-baseline gap-2">
    <span className="text-xs text-fg-muted shrink-0 w-12">{label}</span>
    <span className="text-sm text-fg break-all">{value}</span>
  </div>
  ```
- **PC**：`gacode-electron/src/routes/DiveryDetail.tsx:140-165` — `InfoRow` 表格（label 宽 `w-16`，`items-start gap-4 px-4 py-3`），行是「URL / MIME / 大小 / 提示词」
- **判定**：形态不同（5 处：卡片容器 / 内距 / 行布局 / 标签宽度 / 缺「无元数据」空态）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\DeliveryDetail.tsx`
  - 锚点：`{/* 元信息 */}` 下的 `<div className="rounded-md bg-bg-elevated divide-y divide-border">`
  - 改为（抄 web）：
    ```tsx
    <div className="rounded-md border border-border bg-bg-elevated p-3 space-y-2 text-sm">
      {item.mimeType && (<MetaRow label="类型" value={item.mimeType} />)}
      {sizeStr && (<MetaRow label="大小" value={sizeStr} />)}
      {item.prompt && (
        <div>
          <div className="text-xs text-fg-muted mb-1">生成提示词</div>
          <div className="text-sm text-fg break-words whitespace-pre-wrap">{item.prompt}</div>
        </div>
      )}
      {!item.prompt && !item.mimeType && !sizeStr && (
        <div className="text-fg-muted text-xs">无元数据</div>
      )}
    </div>
    ```
  - 新增 `MetaRow`（PC 现有 `InfoRow` 的 `w-16` 改成 `w-12`，`items-start gap-4 px-4 py-3` 改成 `items-baseline gap-2`）
  - ⚠️ PC 的 URL 行是 PC 增强 → **保留**（web 详情页没有 URL 行）
- **预估改动**：约 25 行

### E-07 · 文档内嵌预览（DocumentPreview）
- **web**：`gacode-web/src/app/(main)/deliveries/[id]/page.tsx:399-406`
  ```tsx
  {isDocument && item.url && (
    <DocumentPreview
      fileId={item.url}
      mimeType={item.mimeType}
      url={item.url}
      title={item.title || "document"}
    />
  )}
  ```
  web `DocumentPreview`（`gacode-web/src/components/deliveries/DocumentPreview.tsx`）：
  - PDF → Google Docs Viewer iframe：`https://docs.google.com/gview?url=${encodeURIComponent(directUrl)}&embedded=true`，容器 `"w-full mb-4 border border-border rounded-md overflow-hidden bg-bg-sunken"`，iframe `"w-full block"` + `style={{ height: "min(80vh, 800px)" }}` + `loading="lazy"`
  - TXT 直链 → fetch + `new TextDecoder("utf-8").decode(buf)` → `<pre className="whitespace-pre-wrap p-4 text-sm max-h-[600px] overflow-y-auto font-mono">`
  - 短 id → `getDocumentText(fileId)` → 同上 `<pre>`
  - 加载中 → `"mb-4 border border-border rounded-md bg-bg-sunken p-4 text-sm text-fg-muted"` + 「加载中…」
  - 错误 → 同容器 + FileText 图标 + title + 「暂无内嵌预览（{error}）。请用下方「打开文档」或「下载」按钮查看原文。」
  - 空 → 同容器 + 「文档内容为空，请用下方「下载」按钮查看原文。」
- **PC**：`gacode-electron/src/routes/DiveryDetail.tsx:270-367` `ContentView` — 走 `classifyFileRender` 分流：`embed-html`（iframe）、`embed-text`（只是给一个「在浏览器查看」按钮，**不渲染文本内容**）、`open-with-system`（系统应用）；**无 DocumentPreview 组件，无 PDF 内嵌预览，无 TXT 文本预览**
- **判定**：缺失
- **怎么改**：
  - 目标文件（新建）：`D:\gaga\gaclaw-project\gacode-electron\src\components\deliveries\DocumentPreview.tsx`
  - props（抄 web `DocumentPreview.tsx:36-45`）：
    ```tsx
    export interface DocumentPreviewProps {
      /** 文档标识 — http/https 直链走 client 模式, 短 id 走 server /yinian/documents/:id/text */
      fileId: string;
      /** 服务端声明的 mimeType */
      mimeType?: string;
      /** 文档 url (PDF iframe 用) */
      url?: string;
      title: string;
    }
    ```
  - 内部 helper：`isDirectDocumentLink(fileId)` / `isPdf(mimeType, url)` / `isTextPlain(mimeType, url)`（抄 web `DocumentPreview.tsx:48-60`）
  - PDF 分支：Google Docs Viewer iframe（**注意**：Electron 内嵌第三方 iframe 需确认 `webPreferences.webviewTag` / CSP；国内访问可能慢 —— web 端注释已说明）
  - TXT 分支：PC 端 fetch + `new TextDecoder("utf-8").decode(await res.arrayBuffer())` → `<pre>`
  - 短 id 分支：PC `src/lib/api.ts` **需新增** `getDocumentText(fileId)`（server `GET /yinian/documents/:id/text`）
  - 接入点：`gacode-electron/src/routes/DeliveryDetail.tsx:168` → `<ContentView item={item} onOpenWithSystem={openWithSystem} />` 之后加
    ```tsx
    {item.deliverableType === "document" && item.url && (
      <DocumentPreview
        fileId={item.url}
        mimeType={item.mimeType}
        url={item.url}
        title={item.title || "document"}
      />
    )}
    ```
- **预估改动**：约 130 行 + api.ts 新增 1 个函数

### E-08 · 操作区：缺「复制链接 / 保存到相册 / 下载原文件 / 跳到源对话」4 个按钮
- **web**：`gacode-web/src/app/(main)/deliveries/[id]/page.tsx:409-494`
  ```tsx
  <div className="space-y-2">
    <Button className="w-full" onClick={openUrl} disabled={!item.url}>
      <ExternalLink className="w-4 h-4 mr-2" />
      {isWeb ? "在浏览器中打开" : isImage ? "查看原图" : "打开文档"}
    </Button>
    {isWeb && (
      <Button variant="outline" className="w-full" onClick={copyLink} disabled={!item.url}>
        <Copy className="w-4 h-4 mr-2" />复制链接
      </Button>
    )}
    {isImage && (
      <Button variant="outline" className="w-full" onClick={saveImage} disabled={!item.url}>
        <Save className="w-4 h-4 mr-2" />保存到相册
      </Button>
    )}
    {(isImage || isDocument) && downloadStatus === "done" && (
      <Button variant="outline" className="w-full" onClick={downloadBlob} disabled={!item.url}>
        <Download className="w-4 h-4 mr-2" />导出到下载文件夹
      </Button>
    )}
    {(isImage || isDocument) && (downloadStatus === "pending" || downloadStatus === "failed") && (
      <Button variant="outline" className="w-full" onClick={downloadBlob} disabled={!item.url}>
        <RefreshCcw className="w-4 h-4 mr-2" />
        {downloadStatus === "failed" ? "重试下载" : "下载原文件"}
      </Button>
    )}
    <Button variant="outline" className="w-full" onClick={openSession} disabled={!item.sessionId}>
      <MessageSquare className="w-4 h-4 mr-2" />跳到源对话
    </Button>
    <Button variant="outline" className="w-full text-danger border-danger/40 hover:bg-danger/10 hover:text-danger" onClick={() => setDeleteOpen(true)}>
      <Trash2 className="w-4 h-4 mr-2" />删除
    </Button>
  </div>
  ```
- **PC**：`gacode-electron/src/routes/DeliveryDetail.tsx:172-216` — 底部一行右对齐按钮：`返回列表` / `下载`（仅 image）/ `回到对话` / `StarButton` / `分享到对话` / `删除`（`variant="danger"`）
- **判定**：形态不同（8 个子项）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\DeliveryDetail.tsx`
  - 锚点：`{/* 操作区 — 阶段 7 … */}` 下的 `<div className="flex items-center justify-end gap-2 pt-2 flex-wrap">`
  - 1) 布局：`flex items-center justify-end gap-2 pt-2 flex-wrap` → `space-y-2`（竖排全宽按钮）
  - 2) 主按钮：`打开文档 / 查看原图 / 在浏览器中打开`（`className="w-full"`，图标 `ExternalLink w-4 h-4 mr-2`）
  - 3) 复制链接（仅 web）：`variant="outline" className="w-full"`，`onClick={copyLink}`（`navigator.clipboard.writeText(item.url)`）
  - 4) 保存到相册（仅 image）：`variant="outline" className="w-full"`，`onClick={saveImage}`（web `deliveries/[id]/page.tsx:221-243`：按 mimeType 推 ext 后 `<a download>`）
  - 5) 下载原文件 / 导出到下载文件夹 / 重试下载（image|document）：按 `downloadStatus` 三态互斥显示
  - 6) 跳到源对话：`variant="outline" className="w-full"`，`disabled={!item.sessionId}`，文案「跳到源对话」（PC 现有「回到对话」文案不同）
  - 7) 删除：`variant="outline" className="w-full text-danger border-danger/40 hover:bg-danger/10 hover:text-danger"`（PC 现在是 `variant="danger"` 实心红）
  - 8) `downloadStatus` 字段：web 从 `item.downloadStatus` 取（`deliveries/[id]/page.tsx:135-137`，类型 `DownloadStatus = "pending" | "downloading" | "done" | "failed"`）；PC 的 `Deliverable` 类型需新增该字段
  - 依赖：需新增 `ExternalLinkIcon` / `CopyIcon` / `SaveIcon` / `DownloadIcon` / `RefreshCcwIcon` / `MessageSquareIcon` / `Trash2Icon`（16px）
  - PC 增强（`StarButton` / `分享到对话` / `返回列表`）→ **保留不动**
- **预估改动**：约 90 行

### E-09 · 删除确认弹窗文案
- **web**：`gacode-web/src/app/(main)/deliveries/[id]/page.tsx:497-519`
  ```tsx
  <AlertDialogTitle>确定删除该交付物？</AlertDialogTitle>
  <AlertDialogDescription>
    将从你的交付中心移除{item.title ? `“${item.title}”` : "这条记录"}。此操作不可撤销。
  </AlertDialogDescription>
  <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
  <AlertDialogAction onClick={…} disabled={deleteMutation.isPending}>
    {deleteMutation.isPending ? "删除中..." : "我确定"}
  </AlertDialogAction>
  ```
- **PC**：`gacode-electron/src/routes/DeliveryDetail.tsx:219-229`
  ```tsx
  <ConfirmDialog title="删除这条交付?" message="删除后无法恢复。" confirmLabel="确认删除" confirmVariant="danger" … />
  ```
- **判定**：形态不同（同 D-18）
- **怎么改**：同 D-18 的改法，作用在 `DeliveryDetail.tsx:220-228`
- **预估改动**：约 8 行

### E-10 · 错误态卡片（重试 + 返回列表）
- **web**：`gacode-web/src/app/(main)/deliveries/[id]/page.tsx:271-299`
  ```tsx
  if (isError || !item) {
    return (
      <div className="px-4 lg:px-8 max-w-2xl mx-auto w-full py-10">
        <Card>
          <CardContent className="p-10 text-center text-fg-muted">
            <Construction className="w-12 h-12 mx-auto text-fg-muted mb-4" />
            <div className="text-base font-medium mb-1 text-fg">
              {isError ? "加载失败" : "未找到该交付物"}
            </div>
            <div className="text-sm mb-4">
              {isError ? String((error as Error)?.message || error) : "可能已被删除, 或归属其他用户。"}
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4 mr-2" />重试
              </Button>
              <Button variant="outline" onClick={() => nav.client(router, "/deliveries")}>
                <ArrowLeft className="w-4 h-4 mr-2" />返回列表
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  ```
- **PC**：`gacode-electron/src/routes/DeliveryDetail.tsx:97-112` — 红色错误框 + 「返回列表」ghost 按钮
- **判定**：形态不同（4 处）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\DeliveryDetail.tsx`
  - 锚点：`if (error || !item) {` 分支的 return
  - 改为（抄 web）：
    ```tsx
    if (error || !item) {
      return (
        <div className="px-4 lg:px-8 max-w-2xl mx-auto w-full py-10">
          <div className="rounded-2xl border border-border bg-card p-10 text-center text-fg-muted">
            <ConstructionIcon className="w-12 h-12 mx-auto text-fg-muted mb-4" />
            <div className="text-base font-medium mb-1 text-fg">
              {error ? "加载失败" : "未找到该交付物"}
            </div>
            <div className="text-sm mb-4">
              {error
                ? String((error as Error)?.message || error)
                : "可能已被删除, 或归属其他用户。"}
            </div>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="md" onClick={() => refetch()}>
                <RefreshCwIcon className="w-4 h-4 mr-2" />
                重试
              </Button>
              <Button variant="outline" size="md" onClick={() => navigate("/deliveries")}>
                <ArrowLeftIcon className="w-4 h-4 mr-2" />
                返回列表
              </Button>
            </div>
          </div>
        </div>
      );
    }
    ```
  - 依赖：`refetch` 解构 + `ConstructionIcon` / `RefreshCwIcon` / `ArrowLeftIcon`
- **预估改动**：约 28 行

### E-11 · 加载态骨架
- **web**：`gacode-web/src/app/(main)/deliveries/[id]/page.tsx:256-269`
  ```tsx
  <div className="px-4 lg:px-8 max-w-2xl mx-auto w-full py-6 space-y-4">
    <Skeleton className="w-full rounded-md" style={{ aspectRatio: "16 / 9" }} />
    <Skeleton className="h-6 w-2/3" />
    <Skeleton className="h-4 w-1/3" />
    <div className="space-y-2 pt-4">
      <Skeleton className="h-10 w-full rounded-md" />
      <Skeleton className="h-10 w-full rounded-md" />
      <Skeleton className="h-10 w-full rounded-md" />
    </div>
  </div>
  ```
- **PC**：`gacode-electron/src/routes/DiveryDetail.tsx:85-95` — 3 个骨架条（`h-8 w-1/2` / `h-4 w-1/3` / `h-64 w-full`）
- **判定**：形态不同（数量 / 比例 / 容器宽度）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\DeliveryDetail.tsx`
  - 锚点：`if (isLoading) {` 分支的 return
  - 改为（抄 web）：
    ```tsx
    if (isLoading) {
      return (
        <div className="px-4 lg:px-8 max-w-2xl mx-auto w-full py-6 space-y-4">
          <div className="w-full rounded-md bg-bg-sunken animate-pulse" style={{ aspectRatio: "16 / 9" }} />
          <div className="h-6 w-2/3 bg-bg-sunken rounded animate-pulse" />
          <div className="h-4 w-1/3 bg-bg-sunken rounded animate-pulse" />
          <div className="space-y-2 pt-4">
            <div className="h-10 w-full rounded-md bg-bg-sunken animate-pulse" />
            <div className="h-10 w-full rounded-md bg-bg-sunken animate-pulse" />
            <div className="h-10 w-full rounded-md bg-bg-sunken animate-pulse" />
          </div>
        </div>
      );
    }
    ```
- **预估改动**：约 16 行

### E-12 · 删除后跳转 + 缓存清理
- **web**：`gacode-web/src/app/(main)/deliveries/[id]/page.tsx:154-160`
  ```tsx
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    queryClient.removeQueries({ queryKey: ["deliverable", id] });
    toast({ title: "已删除", variant: "success" });
    nav.client(router, "/deliveries");
  },
  ```
- **PC**：`gacode-electron/src/routes/DiveryDetail.tsx:70-83`
  ```tsx
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["deliveries"] });
    toast({ message: "已删除", variant: "success" });
    navigate("/deliveries", { replace: true });
  },
  ```
  缺 `removeQueries({ queryKey: ["deliverable", id] })`
- **判定**：形态不同（1 处：缺 removeQueries）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\DeliveryDetail.tsx`
  - 锚点：`deleteMutation` 的 `onSuccess`
  - 改为：加一行 `queryClient.removeQueries({ queryKey: ["delivery", id] });`（PC 的 queryKey 是 `["delivery", id]`，见 `DeliveryDetail.tsx:39`）
- **预估改动**：1 行

### E-13 · PC 的 ShareSheet / StarButton（PC 增强）
- **PC**：`gacode-electron/src/components/deliveries/ShareSheet.tsx`、`StarButton.tsx`（`DeliveryDetail.tsx:29-30` import，`200-208` 使用）
- **web**：`gacode-web/src/app/(main)/deliveries/[id]/page.tsx` — 无
- **判定**：**不列为差异**（PC 增强；且 server 端 `share` / `star` endpoint 未实现，PC 侧是 send-blocker 占位）
- **怎么改**：无（保留不动）
- **预估改动**：0

---

# 五、共享组件逐个对

## 5.1 CreateFab

### S-01 · PC 无统一 FAB 组件，各页各写一套
- **web**：`gacode-web/src/components/common/CreateFab.tsx`（57 行）
  ```tsx
  export const FAB_CLASS =
    "fixed bottom-5 right-5 z-40 w-[52px] h-[52px] rounded-lg bg-brand text-brand-on " +
    "grid place-items-center shadow-[0_8px_24px_rgba(255,107,53,0.4)] " +
    "hover:bg-brand-hover hover:-translate-y-px active:scale-[0.96] " +
    "transition-all duration-150";
  const ICON_CLASS = "w-[22px] h-[22px]";
  …
  <button type="button" aria-label={label} title={label} onClick={onClick} className={cn(FAB_CLASS, className)} {...rest}>
    <Plus className={ICON_CLASS} strokeWidth={2.2} />
  </button>
  ```
  （注释原文 `CreateFab.tsx:6-23`：视觉基线 = 原型 v6 `.fab`；z-index 用 40 而非 70，因为「高于所有内容层、低于所有弹层」）
- **PC**：`gacode-electron/src\routes\Library.tsx:385-399` 手写一套；`gacode-electron/src\components\home\` 下**无 FAB 组件**
- **判定**：缺失（共享组件缺失 + 知识库页那套视觉全错，见 L-53）
- **怎么改**：
  - 目标文件（新建）：`D:\gaga\gaclaw-project\gacode-electron\src\components\common\CreateFab.tsx`
  - 组件：
    ```tsx
    /** FAB 圆角按钮本体 — 视觉基线 = web common/CreateFab.tsx 的 FAB_CLASS */
    export const FAB_CLASS =
      "fixed bottom-5 right-5 z-40 w-[52px] h-[52px] rounded-lg bg-brand text-brand-on " +
      "grid place-items-center shadow-[0_8px_24px_rgba(255,107,53,0.4)] " +
      "hover:bg-brand-hover hover:-translate-y-px active:scale-[0.96] " +
      "transition-all duration-150";

    export interface CreateFabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
      /** 无障碍标签 + title 文案 (如「新建任务」/「采集内容」) */
      label: string;
    }

    export function CreateFab({ label, onClick, className = "", ...rest }: CreateFabProps) {
      return (
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={onClick}
          className={[FAB_CLASS, className].filter(Boolean).join(" ")}
          {...rest}
        >
          <PlusIcon className="w-[22px] h-[22px]" />
        </button>
      );
    }
    ```
  - ⚠️ PC **无 `cn`**，用 `[…].filter(Boolean).join(" ")`（与 `src/components/ui/Button.tsx:67-70` 同款写法）
  - `PlusIcon` 需支持 className 尺寸 + `strokeWidth="2.2"`（lucide Plus path：`M5 12h14` + `M12 5v14`）
  - 调用处 `gacode-electron/src/routes/Library.tsx:385-399` 换成 `<CreateFab label="采集内容" onClick={() => setCollectOpen(true)} />`
- **预估改动**：约 45 行

## 5.2 MediaPicker

### S-02 · web MediaPicker 与 PC home/MediaPicker：拍照入口 + sheet 视觉
- **web**：`gacode-web/src/components/common/MediaPicker.tsx`（276 行）
  - 容器：`Sheet` + `SheetContent side="bottom"` → `"bg-black border-t-0 text-white flex flex-col gap-0 p-0 max-h-[85vh]"`（**黑底白字**）
  - 内容区：`"flex flex-col items-center gap-4 py-8 px-4"`
  - 标题：`"text-white text-base font-medium mb-2"` → file 模式「选择文件」/ image 模式「选择图片来源」
  - file 模式按钮：`"flex flex-col items-center justify-center gap-2 w-40 h-24 rounded-2xl bg-white/10 hover:bg-white/20 transition-colors duration-150"` + `<FileText />`（w-8 h-8 text-white）+ `<span className="text-white text-sm">选择文件</span>`
  - image 模式两按钮：`"flex flex-col items-center justify-center gap-2 w-24 h-24 rounded-full bg-white/10 hover:bg-white/20 transition-colors duration-150"` + Camera / ImageIcon（w-8 h-8 text-white）+ 「拍照」/「相册」
  - 取消：`"text-white/60 hover:text-white/80 text-sm mt-4 transition-colors"`
  - 两个隐藏 input：相册 `<input type="file" accept={modeProp === "file" ? (accept || FILE_ACCEPT) : accept} />`；拍照 `<input type="file" accept="image/*" capture="environment" />`（**仅 `modeProp !== "file"` 时渲染**）
  - `FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"`
  - 关闭时清两个 input 的 value（`MediaPicker.tsx:171-176`）
- **PC**：`gacode-electron/src/components\home\MediaPicker.tsx`（112 行）
  - 容器：PC `BottomSheet` → `"fixed inset-0 z-50 flex items-end justify-center"` + 遮罩 `"absolute inset-0 bg-black/60"` + 面板 `"relative w-full max-w-2xl rounded-t-md bg-bg-elevated shadow-dialog p-5 max-h-[80vh] flex flex-col"`（**深色底**）
  - 单按钮：`"w-40 h-24 rounded-md bg-bg-sunken hover:bg-bg-base text-fg inline-flex items-center justify-center gap-2 transition-colors duration-150"` + 22px svg + `<span className="text-sm">打开{meta.title}</span>`
  - **一次只开一种**（`kind: "camera" | "gallery" | "file"`），无「拍照 + 相册」并排
  - 提示文案：`META` 里的 hint（如「调用系统相机拍照后插入图片附件」）
  - `FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"` ✓ 一致
  - capture：`kind === "camera" ? "environment" : undefined` ✓ 有
- **判定**：形态不同（6 处：容器底色 / 标题 / 按钮形态 / 拍照+相册并排 / 取消按钮 / sheet 高度）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\MediaPicker.tsx`
  - 锚点：`export function MediaPicker({ open, onClose, kind, onCapture }: MediaPickerProps) {`
  - 1:1 还原需改成 **双按钮模式**：新增 prop `mode?: "image" | "file"`（默认 `"image"`），image 模式渲染「拍照」+「相册」两个 `<input>`（拍照带 `capture="environment"`），file 模式只渲染「选择文件」
  - 视觉改 web 形态（黑底白字）：
    ```tsx
    <BottomSheet open={open} title={mode === "file" ? "选择文件" : "选择图片来源"} onClose={onClose}>
      <div className="flex flex-col items-center gap-4 py-8 px-4">
        {mode === "file" ? (
          <button type="button" onClick={triggerFile}
            className="flex flex-col items-center justify-center gap-2 w-40 h-24 rounded-2xl bg-white/10 hover:bg-white/20 transition-colors duration-150">
            <FileTextIcon className="w-8 h-8 text-white" />
            <span className="text-white text-sm">选择文件</span>
          </button>
        ) : (
          <div className="flex gap-4">
            <button type="button" onClick={triggerCamera}
              className="flex flex-col items-center justify-center gap-2 w-24 h-24 rounded-full bg-white/10 hover:bg-white/20 transition-colors duration-150">
              <CameraIcon className="w-8 h-8 text-white" />
              <span className="text-white text-sm">拍照</span>
            </button>
            <button type="button" onClick={triggerGallery}
              className="flex flex-col items-center justify-center gap-2 w-24 h-24 rounded-full bg-white/10 hover:bg-white/20 transition-colors duration-150">
              <ImageIcon className="w-8 h-8 text-white" />
              <span className="text-white text-sm">相册</span>
            </button>
          </div>
        )}
        <button type="button" onClick={onClose}
          className="text-white/60 hover:text-white/80 text-sm mt-4 transition-colors">
          取消
        </button>
      </div>
    </BottomSheet>
    ```
  - ⚠️ PC `BottomSheet` 面板底色是 `bg-bg-elevated`（深灰），web 是 `bg-black` → 需给 `BottomSheet` 加 `sheetClassName?: string` prop（默认不变），MediaPicker 传 `"bg-black border-t-0 text-white"`；或 MediaPicker 不用 BottomSheet，自实现
  - ⚠️ PC `BottomSheet` 自带标题栏（`<h2 className="text-base font-medium">{title}</h2>` + `×` 按钮），web MediaPicker 的标题在内容区里、无 `×` → 需给 `BottomSheet` 加 `hideHeader?: boolean`
  - 调用方 `gacode-electron/src\routes\Home.tsx`（**待核**）需从 `kind` 模式切到 `mode` 模式
- **预估改动**：约 90 行（含 BottomSheet 扩展）

### S-03 · MediaPicker 缺「相册」与「拍照」并存入口（知识库采集复用）
- 见 L-68（知识库采集缺 capture）与 S-02（PC 单按钮 vs web 双按钮）
- **判定**：缺失
- **预估改动**：已计入 S-02

## 5.3 UploadErrorChip

### S-04 · UploadErrorChip：PC 用红 /10 + 灰字，web 用红 /50 + 红字
- **web**：`gacode-web/src/components/common/UploadErrorChip.tsx`（60 行）
  ```tsx
  <Card className="border border-red-200 bg-red-50/60 w-full">
    <CardContent className="p-3 flex items-center gap-2">
      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{fileName}</p>
        <p className="text-xs text-red-700 truncate">上传失败 · {errorMsg}</p>
      </div>
      {onRetry && (<Button size="sm" variant="ghost" onClick={onRetry}>重试</Button>)}
      {onRemove && (<Button size="sm" variant="ghost" onClick={onRemove}>删除</Button>)}
    </CardContent>
  </Card>
  ```
- **PC**：`gacode-electron/src\components\chat\UploadErrorChip.tsx`（83 行）
  ```tsx
  <div className="w-full border border-red-500/40 bg-red-500/10 rounded-md">
    <div className="p-3 flex items-center gap-2">
      <AlertTriangleIcon />   {/* className="text-red-400 shrink-0", 16px */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{fileName}</p>
        <p className="text-xs text-red-400 truncate">上传失败 · {errorMsg}</p>
      </div>
      {onRetry ? (<button type="button" onClick={onRetry}
        className="shrink-0 px-2 py-1 rounded text-xs text-fg hover:bg-bg-sunken transition-colors duration-150">重试</button>) : null}
      {onRemove ? (<button …>删除</button>) : null}
    </div>
  </div>
  ```
- **判定**：形态不同（5 处：底色强度 / 边框色 / 错误文案色 / 图标色 / 按钮形态 / 圆角）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\UploadErrorChip.tsx`
  - 锚点：根 `<div className="w-full border border-red-500/40 bg-red-500/10 rounded-md">`
  - 改为：
    ```tsx
    <div className="w-full border border-red-500/40 bg-red-500/10 rounded-md">
    ```
    → web 的 `border-red-200 bg-red-50/60` 是 **light mode** 写法；PC 是 dark mode，web 在 dark 下等价色需按 web 的 `Card` 暗色 token 推导。**web `Card` 组件的暗色 className 待核**（`gacode-web/src/components/ui/card.tsx` 未读）
    - 务实做法：PC 保留暗色红系，只把 **错误文案色** 从 `text-red-400` 提到 `text-red-500`（更亮，暗底对比更高），并把 `AlertTriangleIcon` 的 `text-red-400` → `text-red-500`
  - 按钮：web 用 `<Button size="sm" variant="ghost">`（PC 的 `Button` size sm = `h-8 px-3 text-sm`，`variant="ghost"` = `bg-transparent text-fg hover:bg-bg-elevated`）→ PC 现在是裸 `<button className="shrink-0 px-2 py-1 rounded text-xs text-fg hover:bg-bg-sunken …">`。1:1 → 改用 PC `<Button variant="ghost" size="sm">`
  - 圆角：web `Card` 的圆角取决于 `rounded-xl`（shadcn default）→ **待核**；PC 是 `rounded-md`（16px）
- **预估改动**：约 15 行

## 5.4 UploadProgressBar

### S-05 · PC UploadProgressBar vs web `ui/progress.tsx`
- **web**：`gacode-web/src/components/ui/progress.tsx`（**未读** —— 知识库/交付中心范围内没有直接引用，PC 端该组件对应 chat 上传进度，**不在本次范围**）
- **PC**：`gacode-electron/src\components\chat\UploadProgressBar.tsx`（93 行）—— 自实现胶囊条
- **判定**：**待核**（web `progress.tsx` 未读，无法逐行比对；且 web 的知识库采集用的是「正在采集 N 项…」文字条而非进度条，见 L-11）
- **怎么改**：**无**（本轮不出差异条目；如需对齐需另开一轮读 `gacode-web/src/components/ui/progress.tsx`）
- **预估改动**：0

## 5.5 LibraryPicker

### S-06 · LibraryPicker：PC 单选，web 多选 + 「完成 (N)」按钮
- **web**：`gacode-web/src/components/chat\LibraryPicker.tsx`（327 行）
  - props：`{ open, onOpenChange, onConfirm?: (items: LibraryItem[]) => void, onSelect?: (item: LibraryItem) => void }`
  - 多选：`pendingSelected: Set<string>` + `pendingItems: Map<string, LibraryItem>`；点击只 toggle，**不关 sheet**
  - 关闭时清空 search + 两个 pending（`LibraryPicker.tsx:87-94`）
  - 顶部区：`"px-4 pt-5 pb-3 border-b border-border space-y-3"`
    - 标题行：`<h3 className="text-base font-medium">选择知识库</h3>` + 右侧 `<span className="text-xs text-fg-muted">{onConfirm ? "可多选, 点完成提交" : "选中后将插入到消息"}</span>`
    - 搜索框：`<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />` + `<input className={cn("w-full pl-9 pr-3 py-2 rounded-md", "bg-bg-sunken text-fg placeholder:text-fg-subtle", "outline-none focus:ring-1 focus:ring-brand")} placeholder="搜索知识库标题" />`
    - 类型 tab：`"flex gap-2 overflow-x-auto"` + 按钮 `"shrink-0 px-3 py-1 rounded-full text-xs transition-colors"`，active `"bg-brand text-brand-on"`，inactive `"bg-bg-sunken text-fg-muted hover:text-fg"`
  - 内容区：`"flex-1 overflow-y-auto px-4 py-3"`
    - loading：`"flex flex-col items-center justify-center py-12 gap-2"` + `<Loader2 className="w-6 h-6 animate-spin text-fg-muted" />` + 「加载知识库…」
    - error：`"text-center py-12 text-sm text-danger"` + 「加载失败: {message}」
    - empty：`"flex flex-col items-center justify-center py-12 gap-3 text-fg-muted"` + `<LibraryIcon className="w-10 h-10 opacity-40" />` + `没有匹配 "${search}" 的知识库` / `知识库还空空如也,去采集点内容吧`
    - 行：`<button className={cn("w-full flex items-center gap-3 p-3 rounded-lg", "border bg-bg-sunken hover:bg-bg-base transition-colors text-left", checked ? "border-brand bg-brand/5" : "border-border")}>`
      - 图标容器：`"shrink-0 w-10 h-10 rounded-md bg-bg-elevated flex items-center justify-center"` + `typeIcon`（image→`text-brand-cyan` / doc→`text-brand` / link→`text-cron` / default→`text-fg-muted`，均 `w-5 h-5`）
      - 标题 + 时间 + 标签 Badge（`variant="secondary" className="text-[10px]"`）
      - 右侧勾选框：`"shrink-0 w-5 h-5 rounded border flex items-center justify-center"`，checked `"bg-brand border-brand text-brand-on"` + `<Check className="w-3.5 h-3.5" />`
  - 底部：`{onConfirm && (<div className="px-4 py-3 border-t border-border bg-bg-elevated"><button className={cn("w-full inline-flex items-center justify-center gap-2", "rounded-md py-2.5 text-sm font-medium transition-colors", "focus:outline-none focus:ring-1 focus:ring-brand", pendingSelected.size === 0 ? "bg-bg-sunken text-fg-subtle cursor-not-allowed" : "bg-brand text-brand-on hover:bg-brand/90")} disabled={pendingSelected.size === 0}>完成 ({pendingSelected.size})</button></div>)}`
- **PC**：`gacode-electron/src\components\home\LibraryPicker.tsx`（261 行）
  - props：`{ open, onClose, onSelect: (item: LibraryItem) => void }` — **只有单选**，点行即 `onSelect(item)` + 关闭
  - 标题：「挂载知识库」（web 是「选择知识库」）
  - 无「可多选, 点完成提交」提示
  - 搜索框：`<input className="w-full rounded-md bg-bg-sunken text-fg placeholder:text-fg-subtle px-3 py-2 text-sm outline-none focus:border-brand focus:border" />`（**无左侧放大镜图标**，focus 是 border 而非 ring）
  - 类型 tab：`"flex gap-2 overflow-x-auto"` ✓ 形态一致
  - 列表：`<ul className="space-y-2">` + `<li>` + 行 `<button className="w-full flex items-center gap-3 p-3 rounded-md bg-bg-sunken hover:bg-bg-base border border-border transition-colors duration-150 text-left">`
  - 图标容器：`"shrink-0 w-10 h-10 rounded-md bg-bg-elevated inline-flex items-center justify-center text-fg-muted"`（**无类型彩色**）
  - 标签：`<span className="px-1.5 py-0.5 rounded text-[10px] bg-bg-elevated text-fg-muted">`（web 用 Badge）
  - empty：无图标（web 有 LibraryIcon）
  - **无勾选框、无底部「完成 (N)」按钮**
- **判定**：形态不同（10 处）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\LibraryPicker.tsx`
  - 锚点：`export function LibraryPicker({ open, onClose, onSelect }: LibraryPickerProps) {`
  - 1) props 扩成 web 形态：
    ```tsx
    export interface LibraryPickerProps {
      open: boolean;
      onClose: () => void;
      /** 多选模式 — 父组件在「完成」按钮点击时拿到本次选中的 items 数组 */
      onConfirm?: (items: LibraryItem[]) => void;
      /** 旧单选回调 (向下兼容). 若同时传了 onConfirm, 这个不会被调用 */
      onSelect?: (item: LibraryItem) => void;
    }
    ```
  - 2) 新增 state：`pendingSelected: Set<string>` / `pendingItems: Map<string, LibraryItem>`
  - 3) 行按钮：加勾选框 + checked 态 className（抄 web）
  - 4) 类型图标上色（image cyan / doc brand / link cron / default muted）
    - ⚠️ PC Tailwind **无 `cron` token**（web 的 `text-cron` = `#a78bfa`）→ 需在 `tailwind.config.ts` 加 `"cron": "#a78bfa"` 或改用 PC 现有近似色
  - 5) 底部「完成 (N)」按钮（仅 `onConfirm` 模式）
  - 6) 标题改「选择知识库」+ 右侧提示文案
  - 7) 搜索框加放大镜图标 + focus 改 `focus:ring-1 focus:ring-brand`
  - 8) empty 态加 LibraryIcon
  - 9) 调用方（`gacode-electron/src\routes\Home.tsx`，**待核**）需传 `onConfirm`
- **预估改动**：约 120 行

### S-07 · Toast 组件结构：web `title`/`description` 两段，PC 只有 `message` 单行
- **web**：`gacode-web/src/components/common/Toast.tsx`（**未读**，从用法可确认 API：`toast({ title, description?, variant })`，variant ∈ `default` / `success` / `warning` / `danger`）
  证据：`library/page.tsx:257`（`title` + `variant: "warning"`）、`library/page.tsx:271-275`（`title` + `description` + `variant`）
- **PC**：`gacode-electron/src\components\ui\Toast.tsx`（**未读**，从用法可确认 API：`toast({ message, variant })`，无 description）
  证据：`Library.tsx:236-246`（`message` + `variant`）
- **判定**：形态不同（Toast 组件缺 title/description 两段结构）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\Toast.tsx`
  - 锚点：Toast 的 props 接口 + 渲染函数（**需读该文件确认现状**）
  - 改法：props 扩成
    ```tsx
    export interface ToastOptions {
      /** 主标题行 */
      title?: string;
      /** 副描述行 */
      description?: string;
      /** 兼容旧调用点 — 单行文案 */
      message?: string;
      variant?: "default" | "success" | "warning" | "danger";
    }
    ```
    渲染时：`title ?? message` 作主行，`description` 作副行（`text-xs` + 对应 variant 的浅色）
  - 受影响条目：L-60 / L-61 / L-64 / D-20 / D-18 / E-09 共 6 处文案可顺势升级为两段
  - ⚠️ PC `Toast` 是否支持 `warning` variant **待核**（`Library.tsx:210` 用了 `variant: "danger"`，`Library.tsx:199` 用了 `success`；`warning` 未见使用）
- **预估改动**：约 40 行

### S-08 · Input 组件底色：web `bg-bg-elevated`，PC `bg-bg-sunken`
- **web**：`gacode-web/src/components/ui/input.tsx:23-35`
  ```
  "flex w-full rounded-md border border-border bg-bg-elevated px-4 py-3 text-base",
  "placeholder:text-fg-subtle shadow-sm",
  "transition-colors duration-150",
  "focus:outline-none focus:border-brand",
  "disabled:cursor-not-allowed disabled:opacity-50",
  ```
- **PC**：`gacode-electron/src\components\ui\Input.tsx:23-31`
  ```
  "flex w-full rounded-md border border-border bg-bg-sunken px-4 py-3 text-base",
  "placeholder:text-fg-subtle",
  "transition-colors duration-150",
  "focus:outline-none focus:border-brand",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-fg",
  ```
- **判定**：形态不同（2 处：底色 `bg-bg-elevated` vs `bg-bg-sunken`、web 有 `shadow-sm` PC 无）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\Input.tsx`
  - 锚点：base className 数组第 1 项
  - 改为：`"flex w-full rounded-md border border-border bg-bg-elevated px-4 py-3 text-base"` + 在第 2 项加 `"shadow-sm"`（合并为 `"placeholder:text-fg-subtle shadow-sm"`）
  - ⚠️ 影响面：`Input` 被 `Library.tsx:315`（搜索框）、`Deliveries.tsx:282`（搜索框）、`EditSheet`（不用，用裸 input）等多处引用；搜索框本来就传 `bg-muted/50` 覆盖底色 → 不受影响
- **预估改动**：2 行

### S-09 · PlusSheet（PC）vs web SheetActionMenu
- **web**：`gacode-web/src/components/chat/SheetActionMenu.tsx`（99 行）
  - **4 项**：图片 / 文件 / 表情 / 挂载知识库
  - 容器：`SheetContent side="bottom"` → `"rounded-t-2xl grid grid-cols-4 gap-3 py-5 px-4 border-x-0"`
  - 按钮：`"flex flex-col items-center gap-2 text-fg-muted hover:text-fg transition-colors duration-150"` + `<div className="w-14 h-14 rounded-full bg-bg-sunken inline-flex items-center justify-center">` + 图标 `w-6 h-6`（**24px**）+ `<span className="text-sm">`
  - props：`{ open, onOpenChange, onPickImage, onPickFile, onPickEmoji, onPickLibrary }`
- **PC**：`gacode-electron/src\components\home\PlusSheet.tsx`（204 行）
  - **6 项**：拍照 / 相册 / 文件 / 表情 / 挂载知识库 / 模板（**PC 多「拍照」「模板」**）
  - 容器：`BottomSheet` + `"grid grid-cols-3 gap-y-5 gap-x-2 py-4"`（**3 列**）
  - 按钮：className ✓ 一致，但图标是 **24px svg 硬编码** ✓（PC 用 `width="24" height="24"`，web 用 `w-6 h-6` = 24px ✓ 等价）
  - props：`{ open, onClose, onPick: (action: PlusAction) => void }`
- **判定**：形态不同（2 处：项数 4 vs 6、列数 4 vs 3）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\PlusSheet.tsx`
  - 锚点：`{/* 模板 (template) electron 端暂时没实现… */}` 注释 + `<div className="grid grid-cols-3 gap-y-5 gap-x-2 py-4">`
  - 1:1 还原 → **删掉「拍照」和「模板」两项**（web 只有 图片/文件/表情/挂载知识库），网格改 `grid-cols-4 gap-3 py-5 px-4`
  - ⚠️ 但 PC 的「拍照」有实际功能（`PlusAction = "camera"` → PC 走 `MediaPicker kind="camera"`），删掉会丢功能 → **这属于「PC 增强 vs web 缺」**；按 gaga 规则「先 1:1 还原 web」，但删功能风险高 → **列入结构级差异 X-06（需 gaga 拍）**
  - 文案差异：web「图片」/ PC「拍照」+「相册」两个 → 1:1 还原后 PC 应合并为「图片」一项（对应 web 的 `onPickImage`）
- **预估改动**：约 25 行（若 gaga 拍板保留 PC 的 6 项则 0 行）

## 5.6 DocumentPreview

### S-10 · PC 缺 DocumentPreview 组件
- **web**：`gacode-web/src/components/deliveries/DocumentPreview.tsx`（216 行）
- **PC**：`gacode-electron/src\components\deliveries\` — 只有 `DeliveriesDropZone` / `MultiSelectToolbar` / `ShareSheet` / `StarButton`，**无 DocumentPreview**
- **判定**：缺失
- **怎么改**：见 E-07（新建 `src/components/deliveries/DocumentPreview.tsx`，约 130 行）
- **预估改动**：约 130 行（与 E-07 合并计算）

---

# 六、结构级差异 · 需 gaga 拍

> **PC 侧栏常驻（256px）已由 gaga 拍板保留，不在此列**（该拍板只决定「常驻 vs 抽屉」的形态；侧栏内部的置顶分组 / pin 按钮 / 条目视觉等属聊天侧栏，不在本 worker 的 2 组页面范围内）。

> **编号说明（2026-10-26 复核，E-6）**：本节原用 S-01 ~ S-07，与第五节的 S-01 ~ S-10 **撞号**（同一文档里出现两个 S-01）⇒ 本节编号统一改为 **X-01 ~ X-07**，第五节的 S-01 ~ S-10 保持不变。
> **归类说明（2026-10-26 复核）**：本节原有 7 条中 —— **X-02 / X-04 不是结构级差异**（与 §一 的「形态不同」同类，只是视觉高度差）⇒ 已移入 §七 的「形态不同」统计；**X-05 是产品路径分叉**，不是结构级差异 ⇒ 单列在 6.2「产品决策」。**本节真正剩下的结构级差异 = 4 条：X-01 / X-03 / X-06 / X-07。**

## 6.1 结构级差异（4 条）

### X-01 · 知识库类型 tab 集合：PC「全部/图片/文档/链接」vs web「全部/文本/图片/文档」
- **web**：`gacode-web/src/app/(main)/library/page.tsx:106-115` — 4 个 tab：**全部 / 文本 / 图片 / 文档**（value = `""` / `"text"` / `"image"` / `"file"`；`"text"` / `"file"` 是**服务端 modality 枚举名**，见 `library/page.tsx:104-105` 注释）
- **PC**：`gacode-electron/src/routes/Library.tsx:57-64` — 4 个 tab：**全部 / 图片 / 文档 / 链接**（value = `"all"` / `"image"` / `"doc"` / `"link"`）
- **差异本质（2026-10-26 复核修正，E-2）**：web 的第 2 个「文本」语义 = **服务端 modality='text'**（URL 条目 + 安卓纯文本）；**PC 现有的第 4 个「链接」在语义上已经等于 web 的「文本」tab** ⇒ 1:1 还原**不是**「删掉 PC 的链接、加文本」，而是**给 PC 的 tab 改 `serverType` + 改文案**（PC「链接」→ 服务端 modality='text'；PC「文档」→ modality='file'；PC「图片」→ modality='image'）。
- **改造影响面**：
  1. `Library.tsx:57-64` `TypeFilter` 类型 + `TYPE_CHIPS` 常量（要同时容纳 PC 客户端语义与服务端 modality）
  2. `Library.tsx:99-102` `serverType` 映射 —— **必须改成按 tab 分别传**（现状：只要不是 `all` 就固定 `"file"`）
  3. `Library.tsx:121-134` `filteredItems` 客户端过滤分支 —— 现状 `it.type === type` 会误杀（服务端回读的 `type` 只可能是 image/doc/link）
  4. `src/lib/api.ts` 的 `LibraryItem` 类型需补 `modality` 字段（服务端 list DTO 已带：`library.routes.js:131` `modality: atom.modality`）
  5. `LibraryCard.tsx:32-37` `TYPE_LABEL`（web 的 type 域是 `image|doc|link|text`，与 PC 一致，不受影响）
- **数据通路（确定结论，无需实测）**：服务端 `type` 值域**恒为 `image | doc | link`**（`library.routes.js:121` + `:82-88` 的 `MODALITY_TO_WEB_TYPE`：`text`→`link` / `file`→`doc` / `image`→`image`；`:67` `WEB_LIBRARY_TYPES` 已冻结），**永不为 `text`** ⇒ PC 侧任何 `it.type === "text"` 判断都是死条件（见 B-13）。
- **需 gaga 拍**：PC 的「链接」tab 保留并改文案（推荐，改动最小），还是完全按 web 重排 tab 顺序与文案。
- **连带真 bug**：`serverType` 恒为 `"file"` ⇒ **PC「图片」tab 与「链接」tab 恒为空**（不在原 147 条里，见 §十 第 11 条）。

### X-03 · 交付中心卡片：web 三型分渲染，PC 统一一种
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:273-281` — `ImageCard`（1:1 图）/ `WebCard`（16:9 图）/ `DocumentCard`（横排文件卡）三套
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:469-583` — 一种 `DeliveryCard`（64×64 缩略方块 + 底部文字按钮）
- **差异本质**：PC 的卡片形态跟 web 三型都对不上（不只是样式，是信息架构：web 的 DocumentCard 走「文件图标 + 下载按钮」路径，PC 走「缩略图 + 重新下载」路径）
- **改造影响面**：
  1. 新建 `src/components/deliveries/{ImageCard,WebCard,DocumentCard,CardMenu}.tsx`（约 220 行）
  2. `Deliveries.tsx` 的 `DocumentSplitGrid` 分派逻辑重写
  3. **PC 的 `PdfCard` 分组**（`Deliveries.tsx:387-445`，document tab 内把 PDF 单独一节用 iframe 预览）会跟 web 的 `DocumentCard` 冲突 → 需决定是并入 DocumentCard 还是保留分组
  4. PC 的多选态（`isInMultiSelect` / `selectedIds`）在 web 交付中心**不存在** → 三组件要不要支持多选？web 无此状态
- **需 gaga 拍**：PC 交付中心要不要保留自己的多选 + PDF 分组能力，还是彻底 1:1 还原成 web 的三卡形态。

### X-06 · PlusSheet 项数：PC 6 项（多「拍照」「模板」）vs web 4 项
- **web**：`gacode-web/src/components/chat/SheetActionMenu.tsx:76-95` — 图片 / 文件 / 表情 / 挂载知识库
- **PC**：`gacode-electron/src/components/home/PlusSheet.tsx:71-201` — 拍照 / 相册 / 文件 / 表情 / 挂载知识库 / 模板
- **差异本质**：PC 拆了「拍照 + 相册」两项并多一个「模板」；web 是「图片」一项（图片走 MediaPicker 的拍照/相册双入口）
- **改造影响面**：
  1. 删「拍照」「模板」→ `PlusSheet.tsx` 改 `grid-cols-4 gap-3 py-5 px-4`（「图片」合并为一个入口 → 走 **§五 S-02** 的 MediaPicker 双按钮）
  2. 但 PC 的「模板」有 toast 占位逻辑（「模板功能即将推出」）—— 删了就没这个提示位
  3. PC 的「拍照」有实际功能（`MediaPicker kind="camera"`），删掉会丢功能
- **需 gaga 拍**：1:1 还原成 web 4 项（丢「模板」占位 + 合并「拍照/相册」），还是保留 PC 的 6 项。

### X-07 · 知识库详情页编辑形态：web 页内切换 vs PC 弹窗
- **web**：`gacode-web/src/app/(main)/library/[id]/page.tsx:317-362` — 编辑态在正文区原地切换成表单，顶栏编辑/删除按钮同时消失
- **PC**：`gacode-electron/src/routes/LibraryDetail.tsx:296-300` — 弹 `EditSheet` 居中 modal，页面正文不变
- **差异本质**：这是「页内 vs 弹窗」的信息架构分叉，会连带影响 B-04 / B-05 / B-06 / B-09 / B-10 / B-11 / B-12 / B-13 的判定（web 这些区块都带 `!editing &&` 条件）
- **改造影响面**：`LibraryDetail.tsx` 需新增 `editing` / `editTitle` / `editTagsRaw` / `saving` 四个 state + `handleSaveEdit` handler + `ContentView` 加 `editing` prop，PC 的 `EditSheet` 调用点需条件化
- **需 gaga 拍**：PC 详情页要不要改成 web 的页内编辑（弹窗 EditSheet 保留还是去掉）。

## 6.2 产品决策（1 条 · 不是结构级差异）

> 这一条**不是**「结构级差异」，是**产品路径分叉**（2026-10-26 复核归位）：两端都可以自洽，没有「谁的结构错了」的问题，只是一个产品决策。

### X-05 · 交付中心卡片点击行为：web 开新窗口 / PC 跳详情页
- **web**：`gacode-web/src/app/(main)/deliveries/page.tsx:421-425` — `window.open(item.url, "_blank", "noopener,noreferrer")`
- **PC**：`gacode-electron/src/routes/Deliveries.tsx:308` — `navigate(\`/deliveries/${d.id}\`)`
- **差异本质**：web 端**没有**从交付中心列表进入交付中心详情页的路径（详情页 `/deliveries/[id]` 只在别处可达）；PC 的详情页是主要浏览路径。
- **改造影响面**：
  1. `Deliveries.tsx:308` `onOpen` 改为开原链接（Electron 需走 `window.gacode.openWithSystem` 走系统默认应用）
  2. 若照此改，PC 的 `DeliveryDetail.tsx` 页面基本变成死路（除非从别处可达）
  3. 反过来若保留 PC 的跳详情，则 web 的「点卡片直接看内容」这个**零点击成本**的交互在 PC 端就丢了
- **需 gaga 拍**：交付中心列表点卡片，是「直接开原链接」还是「进详情页」。
- **备注**：服务端 `deliverables.routes.js` 全部路由只有 3 条（`:243` GET list / `:359` GET detail / `:407` DELETE）⇒ **无 star / share / retry endpoint**（PC 侧 E-13 / D-27 的「收藏 / 分享 / 重试」都是 PC 自加的 send-blocker 占位，见 §十 第 9 条）。

---

# 七、差异统计

（统计口径：**逐条清单**里的编号条目；「不列为差异（PC 增强）」与「待核」不计入）

| 区段 | 条目数 | 缺失 | 形态不同 | 已一致 | 不计入 |
|---|---|---|---|---|---|
| 一、知识库列表页 | 75 | 16 | 54 | 4 | 1 |
| 二、知识库详情页 | 22 | 8 | 14 | 0 | 0 |
| 三、交付中心列表页 | 27 | 7 | 12 | 6 | 2 |
| 四、交付中心详情页 | 13 | 2 | 10 | 0 | 1 |
| 五、共享组件 | 10 | 3 | 6 | 0 | 1 |
| **合计** | **147** | **36** | **96** | **10** | **5** |

> **不计入统计的 5 条**：D-26 / D-27 / E-13（PC 增强 3 条）+ L-75 / S-05（待核 2 条）。
> **形态不同归位 2 条（2026-10-26 复核）**：X-02 / X-04 原列在第六节「结构级差异」，经复核判定**二者不是结构级差异**（只是视觉高度差，不涉及信息架构分叉），与 §一 的「形态不同」同类 ⇒ 已移入本节的「形态不同」统计，分别对应 §一 的 **L-35**（行内多一行「类型 chip + #id」）与 **L-71**（编辑弹窗多一段只读 meta），两条的判定行已同步改写为「形态不同」。故 §一 形态不同 52 → 54、不计入 3 → 1；合计形态不同 94 → 96、不计入 7 → 5。**条目总数仍是 147**（判定行未增删，只改分类）。
> **结构级差异 4 条**（X-01 / X-03 / X-06 / X-07）单独列在第六节 6.1，不计入上表；**产品决策 1 条**（X-05）在第六节 6.2，同样不计入上表。
> 校核方式：对本文件逐行正则统计 `- **判定**：` 前缀，共 147 条，与条目编号数（L75+B22+D27+E13+S10）一致。

### X-02 · 知识库列表行内多一行「类型 chip + #id」（PC 有，web 无）→ 归位：形态不同
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1055-1069` — 行内文字块只有 **2 行**（标题 + 时间/标签）
- **PC**：`gacode-electron/src/components/library/LibraryCard.tsx:143-151` — 有 **3 行**（类型 chip + #id / 标题 / 时间+标签）
- **差异本质**：PC 行高比 web 多约 20px，视觉不等高。**不是结构级差异**（不涉及信息架构分叉），与 §一 的「形态不同」同类 ⇒ 归位到本节统计（对应 §一 **L-35**）。
- **改造影响面**：删掉 `LibraryCard.tsx:144-151` 这一行 → PC 行高与 web 一致；但会丢失「一眼看到类型 / id」的信息。
- **需 gaga 拍**：删（1:1）还是保留（接受行高差）。

### X-04 · 知识库编辑弹窗：PC 的 EditSheet 多一段只读 meta → 归位：形态不同
- **web**：`gacode-web/src/app/(main)/library/page.tsx:1208-1242` — 编辑弹窗只有「标题 + 标签」两项
- **PC**：`gacode-electron/src/components/library/EditSheet.tsx:136-150` — 额外一段「类型 / ID / 创建」只读信息
- **差异本质**：PC 弹窗高度比 web 多约 60px。**不是结构级差异**（只是弹窗多一段只读信息），与 §一 的「形态不同」同类 ⇒ 归位到本节统计（对应 §一 **L-71**）。
- **改造影响面**：`EditSheet.tsx:136-150` 整块删除（8 行）
- **需 gaga 拍**：删（1:1）还是保留。

---

# 八、改动量最大的前 10 条（排期输入）

| # | 条目 | 要动什么 | 预估行数 |
|---|---|---|---|
| 1 | **B-15** | ~~web `Markdown.tsx`（459 行，react-markdown 9）整套能力搬到 PC `LibraryMarkdownTableCard`~~ → **口径已反转**：PC 不再搬 web 能力，改为**统一到安卓基准**（自研 markdown 管线：`parser.ts` 解析层 + `renderer.tsx` 渲染层）；web 侧的 emoji 短码 / 图片 Lightbox / `ExpandableCell` 6 行折叠 / task-list 真 checkbox / 真 `<ul>/<ol>` 嵌套 / H4-H6 / 语法高亮 **全部削平**；代码块语言徽章 + 复制按钮由自研渲染层 `MdCodeCard` 提供 | **已交付**（M3 批 commit `b29207f`；PC `LibraryMarkdownTableCard.tsx` 111 行 → 59 行，**0 依赖**，6 个第三方包已摘除） |
| 2 | **D-08 + D-09 + D-10 + D-11 + D-12** | 交付中心列表拆成 web 的 `ImageCard`（1:1 图）/ `WebCard`（16:9 图 + 渐变占位）/ `DocumentCard`（横排文件卡 + 下载按钮）/ `CardMenu`（⋮ 只含删除），替换 PC 统一的 `DeliveryCard`；连带 6 个 lucide svg 函数 | ≈220 |
| 3 | **L-38 ~ L-41** | 知识库列表行新增 web 形态的浮层上下文菜单组件 `LibraryRowMenu.tsx`（fixed z-[70] 定位 + Esc/外部点击关闭 + 详情/编辑/在新窗口打开/删除 4 项 + 分隔线），并把 `LibraryCard` 的右键从「直接开编辑」改成「弹菜单」 | ≈90 |
| 4 | **E-07 + S-10** | 新建 `src/components/deliveries/DocumentPreview.tsx`：PDF → Google Docs Viewer iframe（min(80vh,800px)）+ TXT 直链 fetch/UTF-8 解码 + 短 id 走 server `/yinian/documents/:id/text` + 加载/错误/空三态；PC `api.ts` 需新增 `getDocumentText` | ≈130 + 1 api 函数 |
| 5 | **E-08** | 交付详情页操作区重排成 web 的竖排全宽按钮组：打开（按类型换文案）/ 复制链接（web）/ 保存到相册（image）/ 下载原文件·导出到下载文件夹·重试下载（按 `downloadStatus` 三态互斥）/ 跳到源对话 / 删除改 outline+红字；PC `Deliverable` 类型需加 `downloadStatus` 字段；7 个 svg 函数 | ≈90 |
| 6 | **L-54 ~ L-57** | 知识库采集改两段式：FAB →「采集内容」3 宫格入口 sheet（Text/Photo/File）→ 再开表单层；新建 `CollectSheet` 的 `step` 状态机 + 3 个 lucide 图标 + 100ms 延迟切层 | ≈130 |
| 7 | **B-01 ~ B-09** | 知识库详情页补齐 web 顶栏（sticky + 返回 + 类型图标标题 + 铅笔 + 垃圾桶）+ 页内编辑模式（4 个 state + `handleSaveEdit` + 表单区）；含 **9** 个 svg 函数（ArrowLeft/Image/FileText/Link/Pencil/Trash2/X/Save/Spinner） | ≈280~320 |
| 8 | **S-06（§五 LibraryPicker）** | `LibraryPicker` 改多选：扩 props（`onConfirm` / `onSelect`）、`pendingSelected`/`pendingItems` 两个集合、行内勾选框 + checked 态、底部「完成 (N)」按钮、类型图标上色（含 PC 缺 `cron` token）；调用方 Home.tsx 需跟进 | ≈120 |
| 9 | **L-24 + L-25 + L-26** | 知识库列表**翻页后列表被替换而非累积**（高价值 bug）：加 `items` state + 累积 effect + 选中项清理 effect + `resetFilters` 清空；PAGE_SIZE 24→30 | ≈25 |
| 10 | **S-07 + S-08 + L-69 + S-02/S-09** | 共享基建三件套：① `Toast` 扩 `title`/`description` 两段（解锁 6 处文案升级 —— §五 **S-07**）② `Input` 底色 `bg-bg-sunken`→`bg-bg-elevated` + `shadow-sm`（§五 **S-08**）③ web `AlertDialog` 在 PC 落地（§一 **L-69**；`ConfirmDialog` 形态差：圆角 `rounded-2xl` vs `rounded-md`、`shadow-2xl` vs `shadow-dialog`、按钮 `h-9 px-4` vs `h-10 px-4`）+ `BottomSheet` 加 `hideHeader`/`sheetClassName`（§五 **S-02 / S-09**） | ≈250~280 |

**「纯 className 一行改」快车道（剩余 33 条，合计 ≈30 行，半天内可做完）**：
L-07 / L-08 / L-09 / L-10 / L-13 / L-16 / L-19 / L-20 / L-22 / L-26 / L-31 / L-33 / L-36 / L-47 / L-48 / L-49 / L-50 / L-53 / L-58 / L-65 / L-66 / L-73 / L-74 / B-08 / B-19 / B-20 / D-01 / D-05 / D-06 / D-07 / E-02 / E-04 / E-12

**「全局组件层」批次（2026-10-26 复核，从快车道移出）**：以下 **6 条**落在**全局共享组件**（`src/components/ui/`），影响面超出知识库/交付中心两页，且互相耦合，不能当「一行 className 改」处理：
- **L-01 ~ L-05** → 改 `src/components/ui/Tabs.tsx`（Tabs 容器去 `border-b` / 按钮内距 / 下划线内缩 / hover 底色 / 字号字重）—— **5 条必须同批改**，改一半会出半吊子视觉
- **S-08** → 改 `src/components/ui/Input.tsx`（底色 `bg-bg-sunken` → `bg-bg-elevated` + `shadow-sm`）—— 全局组件，所有引用页一起变

**⚠️ 依赖标注（2026-10-26 复核）**：
- **D-01 需与 L-01 ~ L-05 同批落地** —— D-01 是交付中心改用 `<Tabs variant="underline">`，其最终视觉**完全依赖** L-01 ~ L-05 对 `Tabs.tsx` 的改造；L-01 ~ L-05 没落地前，D-01 单独改只会得到「下划线满宽、按钮内距不对」的半成品。
- **L-31 必须与 L-32 同批** —— L-31 把 `text-fg-muted` 从容器移到图标自身（颜色由 L-32 负责），L-32 未落地时图标颜色会短暂变亮。
- **L-42 依赖 L-38** —— L-42 是「删除」菜单项 className，要等 L-38 的 `LibraryRowMenu` 组件落地才有承载处 ⇒ **已从快车道清单移除**。

---

# 九、待核清单（本次未读到原文，不能凭印象写）

| 编号 | 待核文件 | 影响条目 |
|---|---|---|
| 1 | `gacode-web/src/components/ui/badge.tsx` | B-07 / B-12 / E-05（Badge variant="secondary" 的整串 className） |
| 2 | `gacode-web/src/components/ui/card.tsx` | L-17 / D-15 / E-06 / E-10（Card / CardContent 的整串 className） |
| 3 | `gacode-web/src/components/ui/skeleton.tsx` | L-16 / D-17（Skeleton 是否自带 animate-pulse） |
| 4 | `gacode-web/src/components/ui/dropdown-menu.tsx` | D-12（DropdownMenuContent / DropdownMenuItem 整串） |
| 5 | `gacode-web/src/components/ui/progress.tsx` | S-05（UploadProgressBar 对照物） |
| 6 | `gacode-web/src/components/common/Toast.tsx` | S-07（Toast 两段结构的确切 DOM） |
| 7 | `gacode-web/src/lib/deliverable-download-name.ts` | D-14（下载文件名挑选规则原文） |
| 8 | `gacode-web/src/lib/api.ts` 的 `getDocumentText` | E-07（PC 侧 `api.ts` 需新增同款函数） |
| 9 | `gacode-electron/src/components/ui/Toast.tsx` | S-07（PC Toast 现支持哪些 variant、是否已有 title/description） |
| 10 | `gacode-electron/src/components/layout/AppShell.tsx` | L-28（PC 顶栏标题机制，决定改动 5 行还是 20 行） |
| 11 | `gacode-electron/src/routes/Home.tsx` | S-02 / S-09（MediaPicker / PlusSheet 的调用点） |
| 12 | `gacode-electron/src/styles/globals.css` 的 `.md-table-*` | B-15（PC 是否已有 `md-table-td-clamp` / `md-table-td-toggle`） |
| 13 | `gacode-electron/src/lib/api.ts` 的 `Deliverable` 类型 | E-08（是否有 `downloadStatus` / `prompt` / `sessionId` 字段） |
| 14 | PC 主进程 preload 是否有 download IPC | D-14（Electron 内 `<a download>` 不触发系统下载） |

> **2026-10-26 复核**：上表第 **1 ~ #8** 项（均为 web 端文件）已由**第十二节「web 端 UI 原件」**补全原文 ⇒ **待核状态解除**，可直接照抄；第 **9 ~ #14** 项（PC 侧文件）**仍待核**。

---

# 十、高价值发现（核实过、web 与 PC 行为实际不一致）

1. **知识库翻页会丢数据（PC 端真 bug）** —— `Deliveries.tsx` 用 `items` state 累积（`Deliveries.tsx:99-107`），但 `Library.tsx` 直接用 `data?.items`（`Library.tsx:122`），而 `page` 进了 queryKey（`Library.tsx:108`）→ 点「加载更多」后列表**只剩第 2 页**，第 1 页消失。web 是 `setItems(cur => [...cur, ...items])`（`library/page.tsx:206`）。→ L-24

2. **知识库纯文本正文在 PC 端必然不渲染（死条件，不是「可能」）** —— web 详情页渲染正文只看 `item.content`（`library/[id]/page.tsx:416`），PC 多加了 `item.type === "text"` 判断（`LibraryDetail.tsx:337`）。而服务端 `GET /yinian/library` 的 `type` 值域**恒为 `image | doc | link`**（`library.routes.js:121` + `:82-88` 的 `MODALITY_TO_WEB_TYPE`，DB modality `text` → web type `link`）⇒ **PC 的 `item.type === "text"` 永不成立** ⇒ 正文区永远空白。web 端纯文本入库走的是 `POST type='doc' + url='text://placeholder'` → `PATCH content`（`library/page.tsx:308-316`），回读的 `type` 恒为 `'doc'`。→ B-13（**去掉 type 判断即可改，不需要实测接口**）

3. **知识库搜索结果与已选项不同步（P3 · 代码级差异，实际影响面小）** —— web 每次拿到新 pageData 都会剔除已不存在于列表中的选中 id（`library/page.tsx:209-217`）；PC 无此逻辑（`Library.tsx` 全文无）⇒ **代码级差异成立**。但 PC 切 type / tag / keyword **三处都调 `resetFilters()`**（`Library.tsx:265` / `:320` / `:334`），而 `resetFilters` 内含 `setSelectedIds(new Set())`（`Library.tsx:146`）⇒ **切 tab / 改搜索词时选中已被清空**，原结论「底部『删除 N 项』里的 N 可能包含看不见的条目」**在 PC 上不会发生** ⇒ 本条降级为 **P3 · 代码级差异，实际影响面小**。→ L-25
   > 附带：web 自己的剔除逻辑以**当前页** items 为基准（`page > 1` 时只拿第 2 页的 items），**会把第 1 页的选中项全剔掉** —— web 侧本身也不严谨。

4. **web 端知识库详情页标题「未命名」的真正原因（不是死结）** —— `gacode-web/src/lib/library-api.ts:45-47` 的注释写「`title` 在后端 atomToApi 里**没有对应字段**（metadata.title 仅在 POST/PATCH 入库，GET /memories/:id 不带 title）」。**这条注释只说对了一半**：后端 `GET /memories/:id` 的 DTO 确实**没有顶层 `title` 字段**（`unified-api/src/modules/yinian/yinian.service.js:46-71` 的 `atomToApi` 返回 id / content / **metadata** / tags / modality / raw_ref / status / … ，**没有 title**），**但 `metadata` 是返回的**（`:56` / `:61`），而 **`metadata.title` 有值** —— 写入点在 `library.routes.js:442`（POST 建条 `const metadata = { title }`）与 `:609`（PATCH 改标题 `baseMeta.title = title`）。⇒ **PC 若 1:1 切到 `GET /yinian/memories/:id`（B-21），自己把 `metadata.title` 映射成 `title` 即可 —— 这不是死结**，web 端显示「未命名」是**它没做这层映射**，不是后端缺数据。

5. **web 端知识库「详情 Modal」是死代码** —— `library/page.tsx:1157-1205` 有完整的只读详情弹窗，但全文没有 `setDetailsOpen(true)` 的调用点；菜单里的「详情」项实际执行 `router.push(\`/library/${item.id}\`)`（`library/page.tsx:1106`）。→ **PC 缺这个弹窗不算差异**，已排除在清单外。

6. **web 端「在新窗口打开」菜单项名不副实** —— `library/page.tsx:1126-1139` 的菜单项写「在新窗口打开」，但 `onClick` 调的是 `open()`，而 `open()`（`library/page.tsx:884-887`）是 `router.push` 跳详情页，不是 `window.open`。→ 1:1 还原时**不要**真的开新窗口，照抄 web 的跳详情页行为。→ L-40

7. **交付中心 web 端没有「进详情页」的路径** —— web 卡片点击是 `window.open(item.url, "_blank")`（`deliveries/page.tsx:423`）；`/deliveries/[id]` 页面在 web 端是孤立路由。PC 端点卡片跳自己的详情页。→ 这不是「谁对谁错」，是产品路径分叉 → X-05（§六 6.2 产品决策）

8. **web 端交付中心的 ⋮ 菜单只剩「删除」** —— 注释原文（`deliveries/page.tsx:680-683`）：「Android DeliveriesViewModel 不调 HTTP retry endpoint… web 没有这种后台下下载… 所以 ⋮ 菜单移除 "重试" 项」。PC 端保留了「重新下载」按钮并调 `retryDownloadDeliverable`（`Deliveries.tsx:567-577`），且 PC 的 `api.ts` 里这个 endpoint 是 PC 自己加的。→ PC 增强，**不列差异**，但 1:1 还原会让 PC 少一个功能入口。

9. **PC 的 `retryDownloadDeliverable` / `shareDeliverableToChat` / `starDeliverable` 三个 endpoint server 端不存在** —— PC 自己的注释写明（`ShareSheet.tsx:11-13`、`StarButton.tsx:9-12`）：「server unified-api 当前**没有**该 endpoint… 调用会 404」。→ 交付详情页的「分享到对话」「收藏」两个按钮在 PC 上**必然报错**，1:1 还原后这两项会消失（web 没有）。→ E-13（PC 增强，不列）

10. **PC 的 `LibraryDropZone` 有一个真实数据 bug：doc 类型入库不带 url** —— `LibraryDropZone.tsx:61-66`：`createLibraryItem({ type: "doc", title, url: undefined, tags: [] })`，只上传拿到的 `res.fileId` 却**不传 url**；而 web 端所有 doc 入库都带 url（`library/page.tsx:383`）。→ PC 拖拽入库的文档条目**点开是空的**。→ 不在本次清单（web 无拖拽入库），但属真 bug，建议单独排。

11. **PC 的「图片」tab 与「链接」tab 恒为空（原 147 条里漏掉的真 bug，2026-10-26 复核新增）** —— `Library.tsx:99-102` 的 `serverType` **只要不是 `all` 就固定返回 `"file"`**，服务端 list 的 `type` 参数过滤的是 **modality**（`library.routes.js:288` `if (type) where.modality = type`）⇒ 回读的 `type` 恒为 `'doc'`；客户端再 `raw.filter((it) => it.type === type)`（`Library.tsx:125`）⇒ **「图片」tab（`it.type==='image'`）与「链接」tab（`it.type==='link'`）永远命中不到任何行**，只有「文档」tab 有内容 —— 而「文档」tab 里**混着 web 建的纯文本笔记**（web POST `type='doc'` → modality='file'）。⇒ 这不是「差异」，是 PC 端的**真 bug**，**不在原 147 条里**，建议与 L-14 / X-01 一并修。

---

# 十一、复核修正（2026-10-26 verifier 独立复核）

> **一句话结论**：**观察层可靠**（147 条统计自洽、web 端所有 `file:line` 全部命中），**推断层有 7 处错误**，其中 **E-1 / E-2 严重** —— 照原文实现会做出**恒空的 tab** 并**删掉唯一可用的「链接」入口**。
> 本节逐条记录「文档原话 → 源码真相 → 应该怎么改」，并补记本次复核新增发现的 2 个真 bug，以及复核通过、不必改的部分。
> **行号说明**：下文引用的行号均为**本次修正前**的原文行号（修正后因新增/删除段落会整体位移）。

## 11.1 E-1（严重）· 「服务端 type 无法从源码判定 / 必须先实测」是多余的阻塞

- **文档原话**（改前 4 处挂着同一阻塞说明）：
  - `:294`（L-14 内）：「**阻塞点**：…服务端 `GET /yinian/library` 回来的 `type` 到底是 `doc` 还是 `text`，PC 端无法从代码判定。落地前必须打一次 `GET /yinian/library` 看真实 `type` 值再决定 PC 端「文本」tab 走 `it.type === "text"` 还是 `it.url?.startsWith("text://")`。」
  - `:2299`（B-13 内）：「⚠️ **阻塞点**：需实测 `GET /yinian/library/:id?withContent=true` 返回的 `type` 值。若服务端对纯文本条目返回 `text` → 现状已一致，无需改；若返回 `doc` → 必须去掉 type 判断，否则正文丢失」
  - `:4144`（第六节 S-01 内）：「**数据通路未知点**：…**无法从源码判定**，必须实测一次接口」
  - `:4265`（§十 第 2 条）：「→ B-13（**必须先实测接口**）」
- **源码真相**（全部可从源码判定，无需实测）：
  - `unified-api/src/modules/yinian/library.routes.js:121` `const webType = MODALITY_TO_WEB_TYPE[atom.modality] || 'link';`
  - `library.routes.js:82-88` `MODALITY_TO_WEB_TYPE = { image:'image', file:'doc', text:'link', audio:'doc', video:'doc' }` ⇒ **DB modality `text` 被映射成 web type `link`**
  - `library.routes.js:67` `WEB_LIBRARY_TYPES = Object.freeze(['image','doc','link'])`（已冻结）
  - ⇒ **服务端 `type` 值域恒为 `image | doc | link`，永不为 `text`**
- **应该怎么改**：4 处阻塞说明全部改成确定结论 ——「服务端 `type` 值域恒为 `image | doc | link` → PC 的 `item.type === "text"` 是死条件 → 纯文本正文必然不渲染」；**B-13 的改法（去掉 type 判断、只看 `item.content`）可以直接执行，不必等实测接口**。
- **顺带在 B-13 记下两条 PC 侧死码**：`src/lib/api.ts:818` 的 type 联合里的 `"text"` 应删；`src/routes/LibraryDetail.tsx:450-455` 的 `TYPE_LABEL.text` 永不可达。

## 11.2 E-2（严重）· L-14 / S-01 的「怎么改」照原样实现会做出恒空的 tab

- **文档原话**（改前 `:291-293` / `:4138`）：「只需让 `filteredItems` 的过滤分支能匹配 `text`」；「1:1 还原 = 删掉 PC 的「链接」tab、加上「文本」tab」
- **源码真相**：
  - `gacode-electron/src/routes/Library.tsx:99-102`：`serverType` **只要不是 `all` 就固定返回 `"file"`**
  - `library.routes.js:288` `if (type) where.modality = type;` ⇒ list 的 `type` 参数过滤的是 **modality**，不是 web type
  - ⇒ 回读的 `type` 恒为 `'doc'`；客户端 `raw.filter((it) => it.type === type)`（`Library.tsx:125`）⇒
    - **PC「图片」tab 恒为空**（`it.type==='image'` 永不命中）
    - **PC「链接」tab 恒为空**（`it.type==='link'` 永不命中）
    - 按原文档加的「文本」tab **也恒为空**
    - 而 PC「文档」tab 里**混着 web 建的纯文本笔记**（web POST `type='doc'` → modality='file'）
  - `library.routes.js:131` 的 list DTO **已带 `modality`**（`modality: atom.modality`）⇒ 客户端可按 `modality` 判类型，不必靠 `type` 猜
- **应该怎么改**：
  1. **`serverType` 改为按 tab 分别传**（文本 → `'text'`、图片 → `'image'`、文档 → `'file'`）
  2. **客户端不再二次过滤**，或改用服务端已返回的原始 `modality` 字段
  3. **S-01 的框架要换**：web 的「文本」tab 语义 = 服务端 modality='text'（URL 条目 + 安卓纯文本）；**PC 现有的「链接」tab 在语义上已经等于 web 的「文本」tab** ⇒ 1:1 还原**不是**原文档说的「删掉链接、加文本」，而是**给 PC 的 tab 改 serverType + 改文案**
- **连带**：在 §十 新增一条原文档完全漏掉的真 bug ——「PC 的图片 tab 与链接 tab 恒为空（serverType 恒为 'file'）」。

## 11.3 E-3 · L-25 的用户可见后果站不住，判定降级

- **文档原话**（改前 `:4267`，§十 第 3 条）：「PC 无此逻辑 → 搜完再切 tab，底部『删除 N 项』里的 N 可能包含看不见的条目。」
- **源码真相**：代码级事实成立（web `library/page.tsx:209-217` 有剔除，PC 无等效逻辑），但 **PC 切 type/tag/keyword 三处都调 `resetFilters()`**（`Library.tsx:265` / `:320` / `:334`），而 `resetFilters` 内含 `setSelectedIds(new Set())`（`:146`）⇒ **切 tab / 改搜索词时选中已被清空**，「N 包含看不见的条目」在 PC 上不会发生。
- **应该怎么改**：改成「**P3 · 代码级差异，实际影响面小**」，删掉那句用户可见后果；并补一句 **web 自己的剔除逻辑拿「当前页」items 做基准（`page>1` 时只拿第 2 页 items），会把第 1 页的选中项全剔掉 —— web 侧本身也不严谨**。

## 11.4 E-4 · §十.4 转述了 web 注释的错误说法，漏掉可修的真相

- **文档原话**（改前 `:4269`）：引用 `gacode-web/src/lib/library-api.ts:45-47` → 结论「**要么保持 PC 现有端点，要么接受这个 web 端缺陷。**」
- **源码真相**：**后端 DTO 无顶层 `title` 字段，但 `metadata` 是返回的，`metadata.title` 就在里面** ——
  - `unified-api/src/modules/yinian/yinian.service.js:46-71` 的 `atomToApi` **无 title**（返回 id / content / **metadata** / tags / modality / raw_ref / status / …），但**返回 metadata**（`:56` 解析、`:61` 出参）
  - 写入点：`library.routes.js:442`（POST 建条 `const metadata = { title }`）/ `:609`（PATCH 改标题 `baseMeta.title = title`）
- **应该怎么改**：结论改成「**PC 切到 `/memories/:id` 时自己映射 `metadata.title` 即可，不是死结**」（比原文有价值得多）。B-21（改前 `:2552`）里同一处「阻塞点 / 需实测」同步去掉。

## 11.5 E-5 · B-15 / §八 第 1 行的「PC 需新增依赖 remark-emoji」是错的 —— **M3 批后整条作废（依赖整体摘除）**

- **文档原话**（改前 `:2341`）：「依赖：PC **需新增依赖** `remark-emoji`」；§八 第 1 行（改前 `:4224`）：「缺 `remark-emoji` 依赖 … ≈200 + **1 依赖**」
- **当时真相**：PC `package.json` **已有** `"remark-emoji": "^5.0.2"`（与 web 同版本）；真正缺的是**没接进** `remarkPlugins` —— `src/components/library/LibraryMarkdownTableCard.tsx:55` 当时是 `remarkPlugins={[remarkGfm]}`
- **M3 批后现状**（2026-10-26，commit `b29207f`）：PC **整条第三方 markdown 体系已摘除** —— `react-markdown` / `remark-gfm` / `remark-emoji` / `rehype-highlight` / `rehype-sanitize` / `highlight.js` 六个包从 `package.json` 移除；`LibraryMarkdownTableCard.tsx`（111 行 → **59 行**）也不再引用 `remarkPlugins`，改走自研管线 `src/lib/markdown.tsx` → `src/lib/markdown/renderer.tsx` → `src/lib/markdown/parser.ts`
- **应该怎么改**：本条纠正**作废**；B-15 / §八 第 1 行已改写为「PC 已归并到自研 markdown 管线，emoji 短码等 web 能力按安卓基准全部削平」（**不是**「接进 `remarkPlugins`」）

## 11.6 E-6 · S- 编号双占（§五 S-01~S-10 与 §六 S-01~S-07 撞号）+ §八 第 10 行指错条目

- **文档原话**：§五 用 S-01~S-10，§六 又用 S-01~S-07 ⇒ 同一文档里两个 S-01；§八 第 10 行（改前 `:4233`）写「S-02 + S-03 + S-04 + S-07」
- **源码真相**：§八 第 10 行的实际内容是 —— Toast 扩两段（§五 **S-07**）+ Input 底色（§五 **S-08**）+ web AlertDialog 落地（**L-69**，在 §一）+ BottomSheet 扩展（§五 **S-02 / S-09**）
- **应该怎么改**：**§六 的 7 条编号改成 X-01 ~ X-07**（§六 内部交叉引用一并改，§一/§二/§三/§五 指向 §六 的引用同步改）；§八 第 10 行改成「**S-07 + S-08 + L-69 + S-02/S-09**」。

## 11.7 E-7 · §八 第 7 行「6 个 svg 函数」后面列了 9 个名字

- **文档原话**（改前 `:4230`）：「含 **6** 个 svg 函数（ArrowLeft/Image/FileText/Link/Pencil/Trash2/X/Save/Spinner）」
- **源码真相**：括号里列的是 **9 个**名字
- **应该怎么改**：改成 **9**。

## 11.8 本次复核新增发现的 2 个真 bug

1. **PC 的「图片」tab 与「链接」tab 恒空（serverType 恒为 `'file'`）** —— 见 11.2；**不在原 147 条里**，已补进 §十 第 11 条。
2. **PC 的 `item.type === "text"` 死条件 ⇒ 纯文本正文必然不渲染** —— 见 11.1；已补进 §十 第 2 条。

## 11.9 复核通过、不必改的部分

- **147 条统计自洽**：`- **判定**：` 前缀共 147 条，与条目编号数（L75 + B22 + D27 + E13 + S10）一致；§七 分区表逐区相加亦自洽（本次修正只改了 L-35 / L-71 的**分类**，判定行未增删，**总数仍为 147**）。
- **L-37 判定正确**：PC 源码注释 `LibraryCard.tsx:92-93` 写的是「弹菜单」，但实际代码走的是复用 `onEdit` / `onDelete` —— **注释是误导性的**，文档读代码读对了（L-37「行右键：PC 直接开编辑弹窗，web 弹上下文菜单」成立）。
- **web 详情 Modal 确为死代码**：`library/page.tsx:1157-1205` 全文无 `setDetailsOpen(true)` 调用点 ⇒ PC 缺这个弹窗不算差异。
- **「在新窗口打开」确实是 `router.push` 不是 `window.open`**：`library/page.tsx:884-887` ⇒ 1:1 还原时不要真的开新窗口（见 L-40）。
- **`LibraryDropZone.tsx:61-66` 的 doc 入库确实不带 url**（PC 拖拽入库的文档点开是空的，见 §十 第 10 条）。
- **PC `Deliveries.tsx:99-107` 已用 items state 累积**（`setItems((cur) => [...cur, ...(pageData.items || [])])`）⇒ 翻页累积在同仓**已有可复用模式**，`Library.tsx` 可照抄（见 L-24）。

---

# 十二、web 端 UI 原件（待核清单 #1~#8 补全）

> 本节是**另一个 worker 实测抄出的 web 端原文**（该 worker 因「不要改文档」的约束没落盘，现转补到本文件）。
> **逐字抄录**，供 PC 侧直接对照落地。**对应 §九「待核清单」第 1 ~ #8 项 —— 这 8 项的「待核」状态到此解除**（B-07 / B-12 / E-05 / L-17 / D-15 / E-06 / E-10 / D-12 / D-14 / E-07 / S-05 / S-07 均可按本节原文落地）。

## #1 `gacode-web/src/components/ui/badge.tsx`（45 行，cva）
- base：`"inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-bg-base"`
- variant：`default`=`"border-transparent bg-brand text-brand-on"`；**`secondary`=`"border-transparent bg-bg-elevated text-fg"`**（B-07 / B-12 / E-05 要的就是这个）；`destructive`=`"border-transparent bg-danger text-white"`；`success`=`"border-transparent bg-success text-brand-on"`；`warning`=`"border-transparent bg-warning text-brand-on"`；`outline`=`"border-border-strong text-fg"`
- DOM：`<div className={cn(badgeVariants({ variant }), className)} {...props} />`，默认 `variant="default"`
- **PC 侧注意事项**：B-07 / B-12 / E-05 三处的 Badge 直接用上面 **`secondary` 的整串**；PC 若没有 `cva`，用等价的条件 className 即可（PC `Badge` 组件现状见 B-07 / B-12 / E-05 条目正文）。

## #2 `gacode-web/src/components/ui/card.tsx`（51 行）
- `Card` = `<div className={cn("rounded-lg border bg-card text-card-foreground shadow", className)} />`
- `CardHeader` = `"flex flex-col space-y-1.5 p-6"`；`CardTitle` = `<h3 className={cn("font-semibold leading-none tracking-tight", className)} />`；`CardDescription` = `<p className={cn("text-sm text-muted-foreground", className)} />`
- **`CardContent` = `<div className={cn("p-6 pt-0", className)} />`**；`CardFooter` = `"flex items-center p-6 pt-0"`
- ⚠️ web 空态是 `<Card className="border-0 shadow-none bg-card rounded-2xl"><CardContent className="p-10 text-center text-fg-muted">` —— web 有 tailwind-merge，`p-10` 能盖 `p-6 pt-0`；**PC 无 tailwind-merge，抄过去必须写 `!p-10`**（否则 `p-6` 赢）
- **PC 侧注意事项**：L-17 / D-15 / E-06 / E-10 四处的 Card/CardContent className 按上面整串抄；**所有内距覆盖都要加 `!` 前缀**（PC 无 tailwind-merge）。

## #3 `gacode-web/src/components/ui/skeleton.tsx`（12 行）
```tsx
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (<div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />);
}
```
→ **自带 `animate-pulse`**；底色 `bg-muted`(#181818)，web 列表骨架另传 `bg-card`(#0a0a0a) 覆盖
- **PC 侧注意事项**：L-16 / D-17 的骨架 —— PC 若自己实现，**别忘了 `animate-pulse`**；web 列表骨架是 `bg-card` 覆盖 `bg-muted`，抄的时候要带覆盖顺序。

## #4 `gacode-web/src/components/ui/dropdown-menu.tsx`（230 行）
- `DropdownMenuContent`：`"absolute z-50 min-w-[12rem] overflow-hidden rounded-md border border-border bg-bg-elevated p-1 text-fg shadow-elevation-3"` + `"animate-fade-in"` + `"top-full"`；align：`end`→`right-0`、`center`→`left-1/2 -translate-x-1/2`、`start`→`left-0`；`style={{ marginTop: sideOffset }}`（默认 4）
- `DropdownMenuItem`：`"relative flex w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors"` + `"hover:bg-accent focus:bg-accent"`；`inset`→`pl-8`；**`destructive`→`"text-danger hover:bg-danger-soft focus:bg-danger-soft"`，非 destructive→`"text-fg"`**
- `DropdownMenuSeparator`：`"my-1 h-px bg-border"`；`DropdownMenuLabel`：`"px-2 py-1.5 text-xs font-semibold text-fg-muted uppercase tracking-wide"`；Trigger：`cn("outline-none", className)` + `aria-expanded` / `aria-haspopup="menu"`
- **PC 侧注意事项**：D-12 交付中心 `CardMenu` 直接照抄本节（shadcn 版）；**L-42 的「删除」菜单项用的是另一套** —— web 知识库行菜单是**自写的 `<button>`**（`library/page.tsx:1141-1152`，className `w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger-soft/40 transition-colors`），**带 `/40` 透明度后缀**，与本节 shadcn 的 `destructive`（`hover:bg-danger-soft`，无后缀）**不是同一个组件** ⇒ L-42 照抄 `library/page.tsx` 那串，D-12 照抄本节，两边不要混。

## #5 `gacode-web/src/components/ui/progress.tsx`（77 行，实际组件名 `ProgressBar`，不是 shadcn progress）
- 外层 `"flex items-center gap-2 px-3 py-2 rounded-full bg-bg-base shadow-sm"`；文件名 `"text-xs text-fg truncate max-w-[120px]"`；轨道 `"flex-1 h-1.5 bg-bg-sunken rounded-full overflow-hidden"`；填充 `"h-full bg-primary transition-all duration-150 ease-standard"` + `style={{ width: `${clamped}%` }}`；百分比 `"text-xs tabular-nums text-fg-muted shrink-0"`
- 取消按钮 `"shrink-0 w-6 h-6 rounded-full inline-flex items-center justify-center text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150"` + `<X className="w-3.5 h-3.5" />`
- Props：`{ value: number; fileName?: string; onCancel?: () => void; className?: string }`
- **PC 侧注意事项**：S-05 的「待核」到此解除 —— web 这不是 shadcn 的 `progress`，是自写的 `ProgressBar`（胶囊形、带文件名 + 百分比 + 取消按钮），PC 侧要抄的是这一整套，不是 `h-2 w-full rounded-full` 那种。

## #6 `gacode-web/src/components/common/Toast.tsx`（174 行）
- `ToastVariant = "default" | "success" | "warning" | "danger"`；`ToastItem = { id: string; title?: ReactNode; description?: ReactNode; variant?: ToastVariant; duration?: number }`；`toast(item: Omit<ToastItem,"id">)` 返回 `{ id, dismiss }`，默认 2500ms
- 卡片：`role="status" aria-live="polite" data-state="open" data-toast-variant={variant}` + `"pointer-events-auto relative w-full max-w-[360px] rounded-2xl bg-bg-elevated p-5 pr-10 shadow-dialog"` + `"animate-fade-in"`；内层 `"flex items-start gap-2"` → 图标 `w-[15px] h-[15px] shrink-0 mt-[3px]` + 变体色（default `text-fg-muted` / success `text-success` / warning `text-warning` / danger `text-danger`；lucide Info / CheckCircle2 / AlertTriangle / AlertCircle）→ `"min-w-0 flex-1"` → title `<h3 className="m-0 text-base font-medium leading-6">` / description `<p className="m-0 mt-1 text-[13.5px] leading-5 text-fg-muted break-words">`
- 关闭按钮 `"absolute right-3 top-3 w-7 h-7 rounded-full grid place-items-center text-fg-muted hover:text-fg hover:bg-white/[0.07] transition-colors duration-150"` + `<X className="h-4 w-4" />`
- 遮罩 `<div aria-hidden className="pointer-events-none fixed inset-0 z-[9998] bg-black/60" />` + 容器 `pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center px-5` + 堆叠 `flex flex-col-reverse items-center gap-3 max-h-[80vh] overflow-y-auto`；导出 `ToastRoot as ToastProvider, Toaster, ToastCard`
- **PC 侧注意事项**：S-07（Toast 扩 `title`/`description` 两段）与 L-64 / L-70 / D-19 / D-20 等文案升级条目按这份原件抄；web 的 variant 枚举是 **`default | success | warning | danger`**（PC 现有 `Button`/Toast 的 variant 名要逐一对齐，注意 PC 用的是 `danger` 而非 `destructive`）。

## #7 `gacode-web/src/lib/deliverable-download-name.ts`（30 行）
```ts
export function pickDeliverableDownloadName(
  item: { displayName?: string | null; title?: string | null } | null | undefined,
  fallback: string
): string {
  const displayName = typeof item?.displayName === "string" ? item.displayName.trim() : "";
  if (displayName) return displayName;
  const title = typeof item?.title === "string" ? item.title.trim() : "";
  if (title) return title;
  return fallback;
}
```
（优先级 `displayName` → `title` → `fallback`；**只挑不拼**，时间戳前缀由服务端 `release-display-name.js` 生成）
- **PC 侧注意事项**：D-14 的下载文件名策略照抄这个函数即可（同名函数放 `src/lib/`）；**不要在客户端拼时间戳前缀**。

## #8 `gacode-web/src/lib/api.ts` 的 `getDocumentText`（:1332-1342）
```ts
export interface DocumentTextResponse {
  plainText: string;
  format?: string;   // "docx" | "xlsx" | "pptx" | "pdf" | "txt"
  truncated?: boolean;
}
export const getDocumentText = (fileId: string) =>
  request<DocumentTextResponse>(`/yinian/documents/${fileId}/text`);
```
（端点 `GET /yinian/documents/{id}/text`，server 侧 `unified-api/src/modules/yinian/yinian.routes.js:441-445`，auth-gated；PC 侧同名函数需自行加）
- **PC 侧注意事项**：E-07 / S-10 的 `DocumentPreview` 要用这个接口 —— PC 侧在 `src/lib/api.ts` 加**同名同签名**的 `getDocumentText`（端点路径与字段名照抄，`format` / `truncated` 两个可选字段别漏）。

---

# 十三、批1-B 落地后的回改清单（7 条）

> 批 1-B 已把 **36 条**改进 PC 代码（`src/routes/Library.tsx` / `LibraryDetail.tsx` / `Deliveries.tsx` / `DeliveryDetail.tsx` / `components/library/{LibraryCard,CollectSheet,EditSheet,MultiSelectToolbar}.tsx`，**8 文件 +143/-122**，typecheck 全绿）。
> 落地过程中又发现 **7 处文档要回改** —— 本节逐条列出，并**已同步改到对应条目的正文**（行号见括号）。

## 13.1 L-48 标题与正文互相矛盾

- **文档原话**：标题写「「全选」按钮 variant：`outline` → `ghost`」，正文/怎么改写的是「PC `ghost` → 改成 `outline`」（web 确实是 `outline`）。
- **实际情况**：**标题写反了** —— web 是 `outline`，PC 是 `ghost`，方向应是 `ghost` → `outline`。
- **怎么改**：标题改成 **`ghost` → `outline`**（已改，L-48 标题）。

## 13.2 L-24 的 effect 依赖数组在 PC 侧有坑

- **文档原话**：L-24 的 effect 直接抄 web 的 `[data, page]`。
- **实际情况**：PC 保留了 `placeholderData: (prev) => prev`（web 没有），翻页瞬间 `data` 引用不变、`page` 变 2 ⇒ **会把第 1 页重复追加一次**。
- **怎么改**：文档补一句「**PC 需加已消费 data 快照守卫**」—— 落地时加了 `consumedDataRef`（已改，L-24「怎么改」）。

## 13.3 L-25 与 L-24 组合后的语义缺口

- **文档原话**：L-25 的清理逻辑直接抄 web 的「当前页 `pageData.items`」，原文**没写清跨页选中会被清**。
- **实际情况**：web 的列表是整页语义，清理当前页 ≈ 清理全量；PC 落地 L-24 后列表是**累积**的，若按当前页裁剪，**点「加载更多」到第 2 页会把第 1 页的选中清掉**。
- **怎么改**：L-25 里注明该缺口，并把改法修正为「**用累积的 `items` 裁剪，而不是当前页 `data.items`**」（PM 已拍板，见 13.4 第 2 点；已改，L-25「怎么改」）。

## 13.4 L-31 依赖 L-32

- **文档原话**：§八 快车道清单把 L-31 排进本批，但 L-32 不在。
- **实际情况**：L-31 把 `text-fg-muted` 从容器移到图标自身（颜色归 L-32 管）⇒ L-31 单独落地时 **图标颜色短暂变亮**。
- **怎么改**：文档标注「**L-31 与 L-32 必须同批**」（已改，L-31 + §八 快车道依赖标注）。

## 13.5 L-42 无法单条执行

- **文档原话**：L-42 的「怎么改」写的是「随 L-38 一起」，但 L-42 又被列进了 §八 快车道清单。
- **实际情况**：没有 L-38 的 `LibraryRowMenu` 组件，L-42 的 className **没有承载处**。
- **怎么改**：**从快车道清单移除**，并标注依赖 L-38（已改，L-42 + §八 快车道清单 + 快车道依赖标注）。

## 13.6 §八 快车道 40 条里 6 条落在禁改区

- **文档原话**：§八 快车道列了 40 条，其中 **L-01 ~ L-05** 要改 `src/components/ui/Tabs.tsx`、**S-08** 要改 `src/components/ui/Input.tsx` —— 都在**全局共享组件**里，属禁改区。
- **实际情况**：而 **D-01**（交付中心改用 `<Tabs variant="underline">`）的最终视觉又**完全依赖** L-01 ~ L-05 ⇒ D-01 单跑只会得到「下划线满宽、按钮内距不对」的半成品。
- **怎么改**：标注「**D-01 需与 L-01 ~ L-05 同批落地**」，并把 **L-01 ~ L-05 / S-08 从快车道清单移到「全局组件层」批次**（已改，§八 快车道段落重排为：快车道 33 条 + 全局组件层 6 条 + 依赖标注）。

## 13.7 B-20 的 fallback 口径两处不一致

- **文档原话**：B-20 只写了 `LibraryDetail.tsx` 的 `TYPE_LABEL` fallback。
- **实际情况**：`src/components/library/LibraryCard.tsx:32-37` **也有一份 `TYPE_LABEL`**（列表行用的），批 1-B **未改** ⇒ **详情页显示「其他」、列表行仍显示原始英文**。
- **怎么改**：文档补上 `LibraryCard.tsx` 那一处（已改，B-20「怎么改」）。

---

## 13.8 PM 对批 1-B 落地时 4 个判断点的拍板

1. **L-24 的 `consumedDataRef` 守卫 —— 认可保留**。理由：PC 有 `placeholderData`，web 没有，这是 PC 侧必要的适配，不是偏离。文档补注（见 13.2 / L-24）。
2. **L-25 的裁剪基准 —— 改为用累积的 `items`，不用当前页 `data.items`**。理由：PC 列表累积，若按当前页裁剪，点「加载更多」到第 2 页会把第 1 页的选中清掉，这是 PC 引入的回归（web 是整页替换，裁剪当前页等价于裁剪全量）。这是 1 行改动（见 13.3 / L-25）。
3. **L-31 与 L-32 必须同批** —— L-32（类型图标按类型上色）排进下一批，与 L-31 一起落（见 13.4 / L-31）。
4. **L-47 保留 PC 的「已选 N 条」，但 `flex-1` 占位要删** —— L-52（PC 多选栏多一行）不在本批；`justify-between` 因有 `flex-1` 占位而视觉不生效，**删掉 `flex-1` 占位让 `justify-between` 生效**，「已选 N 条」保留到 L-52 一并处理（已改，L-47 + L-52）。
