# web ↔ PC 逐页 DOM 对照表（Home / ChatList / Library / Notifications / Profile）

> 本文档由 **Read 源码逐行抄录**产出，不含推测。
> 所有 className / 文案均为源码原文（web 侧路径带行号，PC 侧路径带行号）。
> 读不出来的项一律进「待核」，不填占位。
>
> - web 仓库：`D:\gaga\gaclaw-project\gacode-web\`
> - PC 仓库：`D:\gaga\gaclaw-project\gacode-electron\`
> - 产出日期：2026-10-21
> - 范围：5 页。**排除 schedule**（本表未覆盖）。

---

## 0. 全局前提（先读，影响每一页的判断）

### 0.1 tailwind.config：**不是逐字节一致**

任务书写「两边逐字节一致」——**实测不成立**：

```
web      tailwind.config.ts  SHA256 5402462141241EB31A2356A831F8EE33CC6A68DBAEE1BF5E565C3FF08DD0EBC1  (261 行)
electron tailwind.config.ts  SHA256 EDC49A501E3C193787AA306A6EB5FB152239DC77FF43A2CAFA6ECEAEF15F290B  (255 行)
```

`Compare-Object` 全量 diff：**唯一差异是 `content` glob + 注释排版**：

| | web | electron |
|---|---|---|
| content | `./src/pages/**`、`./src/components/**`、`./src/app/**` | `./src/**/*.{ts,tsx}`、`./index.html` |

**颜色 token 段逐字段核对结果：完全相同**（`brand/bg-base/bg-sunken/bg-elevated/fg/fg-muted/fg-subtle/border/border-strong/success/warning/danger/danger-soft/background/foreground/card/popover/primary/muted/muted-foreground/accent/accent-foreground/destructive/input/ring` 全部一致）。**结论成立但表述错误**：token 值一致，文件不一致。

### 0.2 token 命名对应（同一颜色，不同类名）

| 颜色值 | web 类名 | PC 类名 |
|---|---|---|
| `#000000` | `bg-background` | `bg-bg-base` |
| `#0a0a0a` | `bg-card` | `bg-bg-sunken` |
| `#181818` | `bg-popover` / `bg-muted` | `bg-bg-elevated` |
| `#1f1f1f` | `bg-accent` | `bg-accent`（同名同值） |
| `#FF6B35` | `bg-primary` / `text-primary` | `bg-brand` / `text-brand` |
| `#000000`（on primary） | `text-primary-foreground` | `text-brand-on` |
| `#e5e7eb` | `text-foreground` / `bg-foreground` | `text-fg` / `bg-foreground` |
| `#9ca3af` | `text-muted-foreground` | `text-fg-muted` |
| `#363b41` | `border-input` | `border-border` |
| `#FF6B35` | `ring-ring` | `ring-brand` |
| `#E54a5e` | `bg-destructive` | `bg-danger` |

**推论（对全部 5 页成立）**：凡是「web `bg-card` vs PC `bg-bg-elevated`」这类差异 = **真差异**（同色应是 `bg-card` ↔ `bg-bg-sunken`）；凡是「web `bg-background` vs PC `bg-bg-base`」= 仅命名差异，不算差异。

### 0.3 `surface-container` 两端都不存在

web `library/page.tsx:694 / 701 / 714 / 722 / 748 / 755` 用了 `bg-surface-container` / `bg-surface-container-high` / `bg-surface-container-low`。**web 与 electron 的 tailwind.config 均未定义 `surface-container`**（grep 命中数 = 0/0）→ 这些类**在 web 端本身就是死类**，不产生任何视觉。**不是 PC 的对齐责任**，但 PC 若照抄会继承同一个 bug。

### 0.4 外壳结构：web `(main)/layout` vs PC `AppShell`

**结构事实（两边都是「左侧导航 + 右侧内容」）：**

| | web | PC |
|---|---|---|
| 布局文件 | `src/app/(main)/layout.tsx` (40 行) | `src/components/layout/AppShell.tsx` |
| 最外层容器 | `flex h-screen overflow-hidden bg-bg-base text-fg` | `flex h-screen overflow-hidden bg-bg-base text-fg` |
| 左侧导航 | `<Drawer>` — `fixed inset-y-0 left-0 z-50 w-80 bg-bg-base border-r flex flex-col` + `transition-transform duration-300 ease-out`，关闭态 `-translate-x-full`（**抽屉，遮罩 `fixed inset-0 bg-black/60 z-40`**） | `<aside>` — `w-64 shrink-0 bg-bg-base flex flex-col`（**常驻，无遮罩、无位移、无 `w-80`**） |
| 顶部栏 | `<Header>` — `sticky top-0 z-30 flex items-center h-14 px-4 border-b bg-background gap-2` | `<header>` — `shrink-0 h-14 px-4 bg-bg-base flex items-center gap-2`（**PC 无 `sticky`/`border-b`，且 `/` 与 `/chat/*` 直接不渲染**，`AppShell.tsx:121-123`） |
| 内容容器 | `<main className="flex-1 overflow-y-auto bg-bg-base">` | `<main className="flex-1 overflow-y-auto bg-bg-base">` |
| 头部标题 | `useUIStore.headerTitle`（各页 `useEffect` 设置） | `resolveTitle(pathname)` 硬编码 map（`AppShell.tsx:36-51`） |
| 返回键 | `w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors duration-150 inline-flex items-center justify-center`（`isSubPage` 时） | `w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated hover:text-fg transition-colors duration-150 inline-flex items-center justify-center` |
| 遮罩 | `fixed inset-0 bg-black/60 z-40` | 无 |

**判定：外壳是「结构各自适配」还是「真差异」——分开看：**

| 项 | 判定 | 依据 |
|---|---|---|
| 左侧导航「抽屉 vs 常驻」 | **结构各自适配**（合理） | web 移动优先；PC 桌面宽屏常驻。任务书已提示这一点。 |
| 导航宽度 `w-80` vs `w-64` | **结构各自适配** | 同上 |
| 顶部栏 `border-b` | **真差异** | web 有、PC 无。web `(main)/layout.tsx:174` 原文 `border-b`；PC `AppShell.tsx:283` 原文无。这是上一轮被当成「多余 header」删掉的那条线的同类项。 |
| 顶部栏 `sticky top-0 z-30` vs `shrink-0` | **真差异** | web 滚动时吸顶；PC 靠 `main` 自身滚动，header 不吸顶但也不需要——**判定：可接受的结构差异**，但要 PM 拍板。 |
| 左侧品牌区 logo | **真差异** | web 用图片 `cody_48.png`（`rounded-xl shrink-0`）；PC 用 CSS 方块 `w-7 h-7 rounded-md shrink-0 bg-brand/20 border border-brand/40`（`AppShell.tsx:184`）。 |
| 导航项字体 | **真差异** | web `text-base font-medium`（`Drawer.tsx:374`）；PC `text-sm`（`AppShell.tsx:217`）。PC 更小。 |
| 用户卡 hover | **真差异** | web `hover:bg-bg-base`；PC `hover:bg-bg-sunken`（`AppShell.tsx:245`）。 |
| PC `/chat` 显示外层 header | **真差异（与 web 不一致）** | web `SUB_PAGE_PREFIXES` 含 `/chat` → `/chat` 也显示 ← 返回 + 标题「对话列表」；PC `isSubRoute("/chat")=true` → 显示 header，标题 `resolveTitle("/chat")` **落不到任何分支 → 返回 `"Gacode"`**（`AppShell.tsx:36-51` 无 `/chat` 精确项，只有 `startsWith` 无 `/chat` 项）。**PC 的 /chat 标题是「Gacode」，web 是「对话列表」。** |

---

## 1. Home

### 1.0 文件与规模

| | web | PC |
|---|---|---|
| 路径 | `src/app/page.tsx` | `src/routes/Home.tsx` |
| 行数 | 538 | 363 |
| 路由 | `/` | `/` |
| 外壳 | **不在 `(main)` 路由组**，只有根 `src/app/layout.tsx`（`<html><body><Providers>{children}</Providers>`） | `<Protected>` → `<AppShell>`（`App.tsx:74`） |
| 分支 | `isAuthenticated` 真 → 已登录布局；假 → 未登录居中布局 | **单分支**，无未登录态（`App.tsx:71-73` 未登录直接 `<Navigate to="/login" replace />`） |

### 1.1 元素结构树

**web 已登录（`page.tsx:267-420`）**

```
<div className="min-h-screen flex flex-col bg-background">
  <Drawer/>                                              ← layout/Drawer.tsx
  <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm">
    <button aria-label="菜单" className="inline-flex items-center justify-center w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors">
      <Menu className="w-5 h-5"/>
  <div className="pt-10 pb-6 px-4 text-center">
    <img className="w-16 h-16 rounded-squircle mx-auto mb-4"/>          ← cody_512.png
    <h1 className="text-headline font-medium">HI 我是 <span className="text-primary">cody</span> 很高兴遇见你</h1>
  <div className="flex-1"/>
  [有附件] <div className="px-4 pb-2">
             <div className="flex flex-wrap gap-2">
               uploading→<ProgressBar/>  done→<AttachmentChip/>  error→<UploadErrorChip/>  aborted→不渲染
  <div className="border-t border-border p-4 bg-background">
    <div className="max-w-3xl mx-auto">
      <ChatInputBar placeholder="说点什么…" disabled={createChatMutation.isPending}/>
  <SheetActionMenu/> <EmojiPicker/> <LibraryPicker/> <MediaPicker/>
```

**web 未登录（`page.tsx:425-537`）**

```
<div className="min-h-screen flex flex-col bg-background text-fg">
  <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-10">
    <button aria-label="菜单" className="inline-flex items-center justify-center w-10 h-10 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors"><Menu className="w-5 h-5"/></button>
  <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-10">
    <button aria-label="登录" className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors">
      <LogIn className="w-3.5 h-3.5"/> 登录</button>
  <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-12">
    <div className="mb-8 sm:mb-10"><img width={120} height={120} className="rounded-squircle"/></div>
    <h1 className="text-headline font-medium text-fg mb-8 sm:mb-10">HI 我是 <span className="text-primary">cody</span> 很高兴遇见你</h1>
    <div className="w-full max-w-2xl">
      <div>  (挂 onFocusCapture/onBlurCapture)
        <ChatInputBar placeholder="说点什么…"/>
  [showAuthDialog] <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/60"/>
    <div className="relative w-full max-w-sm rounded-2xl bg-bg-elevated border border-border p-6 shadow-elevation-3">
      <div className="flex items-start justify-between gap-4 mb-3">
        <h2 className="text-title font-medium">登录后即可跟 Cody 对话</h2>
        <button aria-label="关闭" className="text-fg-muted hover:text-fg shrink-0"><X className="w-5 h-5"/></button>
      <p className="text-body text-fg-muted mb-6"/>
      <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end">
        <button className="px-4 py-2 rounded-md text-sm font-medium text-fg-muted hover:bg-bg-sunken transition-colors">再看看</button>
        <button className="px-4 py-2 rounded-md text-sm font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors">去登录</button>
```

**PC（`Home.tsx:273-334`，单分支）**

```
<div className="min-h-full flex flex-col bg-bg-base">
  <div className="flex-1 flex flex-col items-center justify-center px-4 lg:px-8 py-8">
    <div className="flex flex-col items-center gap-3 text-center">
      <div aria-hidden className="w-20 h-20 rounded-squircle bg-bg-elevated border border-border inline-flex items-center justify-center">
        <BigBrandMark/>   ← inline SVG 56×56，rect rx=14 fill #FF6B35 + text "G" fill #000000
      <h1 className="text-headline font-medium">HI 欢迎你,<span className="text-brand">{displayName||"访客"}</span></h1>
      <p className="text-sm text-fg-muted">Gacode PC · 想聊点啥直接输入,按 Enter 发送</p>   ← PC 独有
  <div className="px-4 lg:px-8 pb-4 pt-2">
    <ChatInputBar ref isStreaming={false} onPlusClick={()=>setPlusOpen(true)}/>   ← 无 placeholder/disabled 传参
  <PlusSheet/> <MediaPicker/> <EmojiPicker/> <LibraryPicker/>
```

### 1.2 逐元素映射表

| 层级 | web className（原文） | PC className（原文） | 差异 |
|---|---|---|---|
| 外壳容器 | `min-h-screen flex flex-col bg-background` | `min-h-full flex flex-col bg-bg-base` | 仅命名（`background`≡`bg-base`）。**`min-h-screen` vs `min-h-full`**：web 占满视口、PC 占满 `main`（`main` 已是 `flex-1 overflow-y-auto`，实际等效，判定可接受） |
| sticky 顶部条 | `sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm` | **不存在** | **真差异。PC 0.7.6 主动删除**（`Home.tsx:7-13` 注释：AppShell 常驻 sidebar 含 brand，重复）。但 web 该条内只有 ☰ 按钮一个子元素，`border-b` + `backdrop-blur-sm` + `bg-background/80` 三项视觉在 PC 无任何对应物 |
| ☰ 菜单按钮（已登录） | `inline-flex items-center justify-center w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors` | 无（由 AppShell sidebar 承担导航） | 结构各自适配 |
| ☰ 菜单按钮（未登录） | `inline-flex items-center justify-center w-10 h-10 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors` | 不适用 | PC 无未登录态。**注意 web 两态尺寸不同：已登录 `w-9 h-9`、未登录 `w-10 h-10`** |
| 欢迎语容器 | `pt-10 pb-6 px-4 text-center` | `flex-1 flex flex-col items-center justify-center px-4 lg:px-8 py-8` + 内层 `flex flex-col items-center gap-3 text-center` | 真差异：web 顶部对齐+留白 `pt-10 pb-6`；PC 垂直居中 `justify-center` |
| 头像/标识 | `<img className="w-16 h-16 rounded-squircle mx-auto mb-4">`（cody_512.png） | `<div aria-hidden className="w-20 h-20 rounded-squircle bg-bg-elevated border border-border inline-flex items-center justify-center">` + SVG 56×56 | 真差异：**尺寸 `w-16`(64px) vs `w-20`(80px)**；**形态 图片 vs 内联 SVG**；PC 多 `bg-bg-elevated` + `border border-border`；web `mx-auto mb-4` PC 无（用 `gap-3`） |
| 标题 | `text-headline font-medium` | `text-headline font-medium` | 一致 |
| 副标题 | **不存在** | `text-sm text-fg-muted`（内容 `Gacode PC · 想聊点啥直接输入,按 Enter 发送`） | **PC 独有元素，web 无。** 任务书点名的那条「web 没有的副标题」就是它 |
| 弹性占位 | `flex-1` | `flex-1`（在父层） | 一致 |
| 附件预览容器 | `px-4 pb-2` > `flex flex-wrap gap-2` | `px-4 pb-4 pt-2` > `mb-2 flex flex-wrap gap-1.5`（在 ChatInputBar 内部） | 真差异：间距 `gap-2` vs `gap-1.5`；PC 把附件区搬进 ChatInputBar 组件内 |
| 底部输入条外壳 | `border-t border-border p-4 bg-background` > `max-w-3xl mx-auto` | `px-4 lg:px-8 pb-4 pt-2`（无 wrapper、无 max-w） | **真差异：PC 缺 `border-t`、缺 `bg-background`、缺 `max-w-3xl mx-auto` 限宽** |
| 输入框卡片 | `bg-bg-elevated rounded-md px-4 py-3 flex items-end gap-2` + `border border-transparent transition-colors duration-150` + `focus-within:border-border` | `flex items-end gap-2`（**0.7.6 注释：不再垫底板**，`ChatInputBar.tsx:499-502`） | **真差异：PC 无 `bg-bg-elevated` 卡底、无 focus-within 边框反馈** |
| `+` 按钮 | `shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center` | `shrink-0 h-9 w-9 rounded-md bg-bg-sunken text-fg-muted hover:bg-bg-elevated hover:text-fg disabled:opacity-50 disabled:pointer-events-none inline-flex items-center justify-center transition-colors duration-150` | 真差异：**`rounded-full` vs `rounded-md`**；**PC 多了 `bg-bg-sunken` 常驻底色**；**hover 底色相反：web `bg-bg-sunken` ↔ PC `bg-bg-elevated`**；PC 多 `disabled:*` |
| textarea | `flex-1 bg-transparent text-fg placeholder:text-fg-subtle outline-none text-base leading-6 resize-none max-h-32 py-2 disabled:opacity-60` | `w-full resize-none bg-bg-sunken border border-border rounded-md px-3 py-2 text-sm leading-6 placeholder:text-fg-subtle focus:outline-none focus:border-brand disabled:opacity-70 max-h-32 overflow-y-auto` | **真差异（多项）**：字号 `text-base` vs `text-sm`；内距 `px-4 py-3` vs `px-3 py-2`；web 透明底、PC `bg-bg-sunken` + **常驻 `border border-border`**；web `rounded` 由父卡承担、PC `rounded-md` 在自身；PC 多 `overflow-y-auto` + 隐藏滚动条 |
| 发送按钮 | `shrink-0 w-9 h-9 rounded-full bg-brand text-brand-on hover:bg-brand-hover transition-colors duration-150 inline-flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed` | `shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-md bg-brand text-brand-on hover:bg-brand-hover active:bg-brand-active transition-colors duration-150 disabled:opacity-40 disabled:pointer-events-none` | 真差异：**`rounded-full` vs `rounded-md`**；PC 多 `active:bg-brand-active`；**disabled 透明度 `50%` vs `40%`** |
| 底部 caption | `mt-2 text-xs text-center flex items-center justify-center gap-1.5` + `text-fg-muted opacity-50` | **不存在**（PC ChatInputBar 无 caption 节点，grep `caption` 命中 0） | **真差异：PC 缺整块 caption** |
| 未登录态整块 | 见 1.1（登录按钮 / 120px 头像 / 拦截弹窗） | 不存在 | 结构差异（PC 由 `Protected` 重定向） |
| 弹窗容器 | `fixed inset-0 z-[60] flex items-center justify-center p-4` + `absolute inset-0 bg-black/60` + `relative w-full max-w-sm rounded-2xl bg-bg-elevated border border-border p-6 shadow-elevation-3` | 不存在 | PC 无此态 |
| 弹窗主 CTA | `px-4 py-2 rounded-md text-sm font-medium bg-foreground text-background hover:bg-foreground/90 transition-colors` | 不适用 | — |

### 1.3 文案对照

| 位置 | web 文案 | PC 文案 | 一致 |
|---|---|---|---|
| 标题（已登录） | `HI 我是 ` + `<span>cody</span>` + ` 很高兴遇见你` | `HI 欢迎你,` + `<span>{displayName\|\|"访客"}</span>` | **否**（PC 是「用户名欢迎语」，web 是「品牌自我介绍」） |
| 标题（未登录） | `HI 我是 ` + `cody` + ` 很高兴遇见你` | 不适用 | — |
| 副标题 | 不存在 | `Gacode PC · 想聊点啥直接输入,按 Enter 发送` | **否（PC 独有）** |
| 输入框 placeholder | `说点什么…` | ChatInputBar 未传 `placeholder` → 落到组件默认值（Home.tsx 未传；PC 组件内 placeholder 见 `ChatInputBar.tsx:578-582`） | **待核**（见 1.5） |
| toast：创建对话失败 | `title:"创建对话失败"` + `description:<err>` | `创建对话失败: <err>`（单条 message） | 语义同，文案格式不同 |
| toast：附件上传中 | `title:"附件还在上传中"` / `desc:"请稍候几秒再发送"` | 不存在该分支（PC 无 `hasUploading` 前置拦截） | **否** |
| toast：部分附件失败 | `title:"部分附件上传失败"` / `desc:"已移除失败项, 正在发送其余内容"` | 不存在该分支 | **否** |
| toast：超限 | 不存在 | `文件超过 50MB 上限 (NMB)` | PC 独有 |
| 未登录弹窗标题 | `登录后即可跟 Cody 对话` | 不适用 | — |
| 未登录弹窗正文(menu) | `登录后可以查看历史对话、置顶、通知等功能。` | 不适用 | — |
| 未登录弹窗正文(input) | `登录后即可开启一段新对话, Cody 在线等你。` | 不适用 | — |
| 弹窗按钮 | `再看看` / `去登录` | 不适用 | — |

### 1.4 交互态对照

| 状态 | web className | PC className |
|---|---|---|
| ☰ hover（已登录） | `hover:bg-bg-elevated` | 不适用 |
| 输入卡片 focus | `focus-within:border-border`（配 base `border border-transparent`） | **无 focus 态** |
| textarea focus | 父级 `focus-within` 触发 | `focus:outline-none focus:border-brand`（常驻 border 上换色） |
| 发送按钮 hover | `hover:bg-brand-hover` | `hover:bg-brand-hover` |
| 发送按钮 active | 无 | `active:bg-brand-active` |
| 发送按钮 disabled | `disabled:opacity-50 disabled:cursor-not-allowed` | `disabled:opacity-40 disabled:pointer-events-none` |
| 整体 disabled（创建中） | 卡片 `opacity-60` + textarea `disabled:opacity-60` | textarea `disabled:opacity-70`；卡片无 |
| streaming（PC 传 `isStreaming={false}`） | 卡片 `border-brand/40` + caption `text-brand` + 停止钮 `bg-danger` | Home 恒非流式，N/A |
| loading 态 | 无独立骨架（`createChatMutation.isPending` → 按钮 disabled） | `Button loading` → `className="gagaos-spinner"`（`Button.tsx:76`）；Home 内无 loading 视图 |
| 空态 | 不适用 | 不适用 |
| 错误态 | toast | toast |

### 1.5 待核项

1. **PC Home 输入框 placeholder 实际文案** —— Home.tsx 未传 `placeholder`，需确认 `components/chat/ChatInputBar.tsx` 在 Home 场景下的默认值分支（该组件 578-582 行按 `isStreaming` 二选一，两条文案均含「(Enter 发送, Shift+Enter 换行 · 输入 / 触发命令菜单)」，与 web 的 `说点什么…` 长度差异极大）。**需确认**：Home 是否应硬传 `placeholder="说点什么…"`。
2. **sticky 顶部条是否要恢复** —— PC 主动删除，web 有 `border-b` + `backdrop-blur-sm` + `bg-background/80`。属「结构适配」还是「真差异」需 PM 拍板。
3. **PC 头像改回图片还是保持 SVG** —— web 用 `cody_512.png` 资源；PC 无该资源路径（`Home.tsx` 注释明确「不引外部图片 / 不依赖 public 资源」）。**需确认**：是否允许 PC 引入 `cody_512.png`。
4. **未登录态是否需要在 PC 补齐** —— PC 由路由重定向处理，属既定设计，需 PM 确认不算缺口。
5. **`gagaos-spinner`** —— 该类名在 `Button.tsx:76` 使用，但**不在 tailwind.config**，需在 `src/styles/` 或全局 CSS 中确认其定义是否存在（本次未读 CSS 文件）。

---

## 2. ChatList

### 2.0 文件与规模

| | web | PC |
|---|---|---|
| 路径 | `src/app/(main)/chat/page.tsx` | `src/routes/ChatList.tsx` |
| 行数 | 490 | 839 |
| 路由 | `/chat` | `/chat` |
| 页面标题来源 | `useUIStore` → `setHeaderTitle("对话列表")`（`chat/page.tsx:70-73`） | `AppShell.resolveTitle("/chat")` → **无匹配分支 → 返回 `"Gacode"`** |

### 2.1 元素结构树

**web（`chat/page.tsx:184-360`）**

```
<div className="px-4 lg:px-8 py-6 max-w-3xl mx-auto">
  [多选] <div className="sticky top-14 z-30 -mx-4 lg:-mx-8 px-4 lg:px-8 mb-4 py-2 bg-bg-elevated border-b border-border flex items-center gap-3">
    <button aria-label="退出多选" className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-bg-sunken"><X className="w-5 h-5"/></button>
    <div className="flex-1 text-sm font-medium">已选 {n} 项</div>
    <Button variant="ghost" size="sm" className="gap-1.5"><CheckCheck className="w-4 h-4"/>{全选?清空:全选}</Button>
    <Button variant="destructive" size="sm" className="gap-1.5"><Trash2 className="w-4 h-4"/>删除 ({n})</Button>
  <div className="mb-6">
    <Button size="lg" className="w-full lg:w-auto gap-2" disabled>
      <MessageSquarePlus className="w-5 h-5"/>{pending?"创建中...":"新建对话"}</Button>
  <div className="space-y-3">
    <h2 className="text-lg font-semibold mb-4">历史对话</h2>
    [loading] 3×<Skeleton className="h-24 w-full"/>
    [列表] <div className="grid gap-3"> > <ChatRow/>×N
    [空] <Card><CardContent className="p-8 text-center text-muted-foreground">
            <MessageSquarePlus className="w-12 h-12 mx-auto mb-4 opacity-50"/>
            <div className="text-lg font-medium mb-2">暂无对话</div>
            <div className="text-sm">开始新对话，开启与 AI 的交流之旅</div>
  <Sheet side="bottom"> 确认删除
  <Sheet side="bottom"> 重命名 + <Input placeholder="输入新标题" maxLength={120} autoFocus/>
```

web `ChatRow`（`chat/page.tsx:418-489`）：

```
<Card className={cn("group cursor-pointer transition-colors select-none",
        多选且选中 ? "ring-2 ring-brand bg-brand-container/30" : "hover:bg-accent/50")}>
  <CardContent className="p-4 flex items-center gap-3">
    [多选] <div className="shrink-0"><CheckSquare className="w-5 h-5 text-brand"/> 或 <Square className="w-5 h-5 text-fg-muted"/></div>
    <div className="flex-1 min-w-0">
      <div className="font-medium truncate">{title||"新对话"}</div>
      <div className="text-sm text-fg-muted mt-1">{relativeTime}</div>
    [!多选] <div className={cn("shrink-0","opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150","[@media(hover:none)]:opacity-100")}>
      <DropdownMenuTrigger aria-label="对话操作" className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-bg-sunken text-fg-muted hover:text-fg transition-colors"><MoreVertical className="w-4 h-4"/></DropdownMenuTrigger>
      <DropdownMenuContent align="end"> > 重命名
```

**PC（`ChatList.tsx:226-444`）**

```
<div className="min-h-full flex flex-col">
  <div className="px-4 lg:px-8 pt-4 flex items-center justify-between gap-4">
    <div className="text-sm text-fg-muted shrink-0">{pinnedCount>0?`${n} 条置顶 · 共 ${m}`:`共 ${m} 条对话`}</div>
    <div className="flex-1 min-w-0 flex items-center justify-end gap-1">
      [showSearch] <div className="relative flex-1 min-w-0 max-w-md">
        <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none z-10"/>
        <Input type="search" placeholder="搜索对话标题..." className="rounded-full bg-muted/50 border-0 pl-9 focus-visible:ring-1 focus-visible:ring-brand !rounded-full"/>
      <button aria-label={搜索|关闭搜索} className={["shrink-0 w-9 h-9 rounded-full inline-flex items-center justify-center","transition-colors duration-150",showSearch?"bg-bg-elevated text-fg":"text-fg-muted hover:bg-bg-elevated"]}><SearchIcon className="w-5 h-5"/></button>
    <Button variant="default" size="md" loading>+ 新建对话</Button>
  [error] <div className="px-4 lg:px-8 py-4"><div className="rounded-md bg-danger-soft/30 px-4 py-3 text-sm">加载失败:{err}</div></div>
  <div className="px-4 lg:px-8 py-4 flex-1">
    [loading] <SkeletonList/>
    [空·无搜索] <EmptyState/>
    [空·有搜索] <SearchEmpty keyword/>
    [列表] <ul className="space-y-2 max-w-3xl"> > <li> > <ChatRow/>×N
  [多选] <div className="sticky bottom-0 z-30 bg-bg-elevated px-4 lg:px-8 py-3 flex items-center gap-3">
    <span className="text-sm">已选 <strong>{n}</strong> 条</span><div className="flex-1"/>
    <Button variant="ghost" size="sm">取消</Button>
    <Button variant="ghost" size="sm">{清空|全选}</Button>
    <Button variant="danger" size="sm" loading>删除 ({n})</Button>
  <ConfirmDialog> 批量删除
  <ConfirmDialog> 单条删除
  <ConfirmDialog> 重命名 + <Input placeholder="输入新标题" maxLength={120} autoFocus/>
```

PC `ChatRow`（`ChatList.tsx:510-602`）：

```
<div data-row-menu className={["group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors duration-150 cursor-pointer select-none",
      选中 ? "bg-bg-elevated" : "bg-bg-sunken hover:bg-bg-elevated"]}>
  [多选] <span aria-hidden className={["shrink-0 w-5 h-5 inline-flex items-center justify-center rounded border", 选中?"bg-fg border-fg text-bg-base":"bg-bg-base border-border text-transparent"]}>✓</span>
  [pinned] <PinIcon className="shrink-0 text-brand"/>
  <div className="flex-1 min-w-0">
    <div className="text-sm font-medium truncate">{title||"新对话"}</div>
    <div className="text-xs text-fg-muted mt-0.5">{relative}</div>
  [!多选] <div className="relative shrink-0">
    <button aria-label="对话操作" className="w-8 h-8 inline-flex items-center justify-center rounded hover:bg-bg-base text-fg-muted hover:text-fg transition-colors duration-150 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"><MoreVertIcon/></button>
    <div role="menu" className="absolute right-0 top-9 z-40 min-w-[160px] rounded-md bg-bg-elevated shadow-elevation-3 py-1 animate-fade-in">
      <MenuItem>置顶/取消置顶</MenuItem><MenuItem>重命名</MenuItem>
      <div className="my-1 border-t border-border"/><MenuItem danger>删除</MenuItem>
```

### 2.2 逐元素映射表

| 层级 | web className（原文） | PC className（原文） | 差异 |
|---|---|---|---|
| 页面外壳 | `px-4 lg:px-8 py-6 max-w-3xl mx-auto` | `min-h-full flex flex-col` + 分散在子块 | 真差异：web **单一限宽容器**（`max-w-3xl mx-auto`）；PC 无 `max-w-3xl`，只在 `<ul>` 上有 `max-w-3xl` → **顶栏/错误条不受限宽**，与 web 不一致 |
| 页面标题 | `useUIStore` `对话列表` | `resolveTitle` → `"Gacode"` | **真差异（文案错）** |
| 多选条位置 | 顶部 `sticky top-14 z-30` | 底部 `sticky bottom-0 z-30` | **真差异（结构位置）** |
| 多选条样式 | `-mx-4 lg:-mx-8 px-4 lg:px-8 mb-4 py-2 bg-bg-elevated border-b border-border flex items-center gap-3` | `sticky bottom-0 z-30 bg-bg-elevated px-4 lg:px-8 py-3 flex items-center gap-3` | 真差异：web `border-b` + `mb-4` + `-mx` 负边距；PC 无 border、无 `mb-4` |
| 退出多选按钮 | `inline-flex items-center justify-center w-8 h-8 rounded hover:bg-bg-sunken` | `Button variant="ghost" size="sm"` → `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base disabled:opacity-50 disabled:pointer-events-none` + `bg-transparent text-fg hover:bg-bg-elevated active:bg-bg-sunken` + `h-8 px-3 text-sm` | 真差异：PC 多 `active:` + `focus-visible:ring-2 ring-offset`；文案 `取消` vs web `退出多选`（且 web 是纯 ✕ 图标按钮） |
| 计数文案 | `已选 {n} 项`（`text-sm font-medium`，flex-1） | `已选 <strong>{n}</strong> 条`（`text-sm`） | 真差异：`项` vs `条`；PC 用 `<strong>` 加粗，web 无 |
| 全选按钮 | `variant="ghost" size="sm"` | `variant="ghost" size="sm"` | 一致 |
| 删除按钮 | `variant="destructive" size="sm" className="gap-1.5"` + `disabled` | `variant="danger" size="sm" loading` | 一致（`destructive`≡`danger`）；PC 用 `loading` web 用 `disabled` |
| 新建对话按钮 | `size="lg"` + `className="w-full lg:w-auto gap-2"` + `<MessageSquarePlus className="w-5 h-5"/>` | `variant="default" size="md"` + 文本 `+ 新建对话`（无图标） | **真差异：尺寸 `lg`(`h-10 rounded-md px-8`) vs `md`(`h-10 px-4 text-sm`) → PC 无 `px-8`；PC 无前置 icon，改用 `+` 字符；PC 不撑满宽度（web `w-full lg:w-auto`）** |
| 分区标题 | `text-lg font-semibold mb-4`（`历史对话`） | **不存在** | **真差异：PC 缺标题**（改用顶栏计数文字代替） |
| 列表容器 | `grid gap-3` | `space-y-2 max-w-3xl` | 真差异：`grid` vs `space-y-2`；间距 `gap-3` vs `gap-2` |
| 行容器 | `Card` → `rounded-lg border bg-card text-card-foreground shadow` + `group cursor-pointer transition-colors select-none` + `hover:bg-accent/50` | `group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors duration-150 cursor-pointer select-none` + `bg-bg-sunken hover:bg-bg-elevated` | **真差异：圆角 `rounded-lg`(web Card 默认) vs `rounded-md`；底色 web `bg-card`(#0a0a0a) vs PC `bg-bg-sunken`(#0a0a0a) 同色 ✓；hover web `bg-accent/50`(#1f1f1f/50) vs PC `bg-bg-elevated`(#181818 不透明)；内距 web 走 CardContent `p-4` vs PC `px-3 py-2.5`** |
| 行选中态 | `ring-2 ring-brand bg-brand-container/30` | `bg-bg-elevated` | **真差异：web 有品牌色 ring + container 底；PC 仅换底色，无 ring** |
| 多选勾选标记 | `<CheckSquare className="w-5 h-5 text-brand"/>` / `<Square className="w-5 h-5 text-fg-muted"/>`（lucide 图标） | 自绘 `✓` + `w-5 h-5 rounded border` + `bg-fg border-fg text-bg-base` / `bg-bg-base border-border text-transparent` | **真差异：图标形状不同（web 圆角方框内打勾 vs PC 实心白方块反色）；PC 选中态是 `bg-fg` 白底而非 `text-brand` 橙** |
| 置顶标记 | 无 | `[chat.pinned] <PinIcon className="shrink-0 text-brand"/>` | **PC 独有元素** |
| 标题字号 | `font-medium`（继承 Card `text-card-foreground`；base 字号来自 web `body`，待核） | `text-sm font-medium truncate` | PC 显式 `text-sm`；web 未显式字号 |
| 时间文案字号 | `text-sm text-fg-muted mt-1` | `text-xs text-fg-muted mt-0.5` | **真差异：`text-sm` vs `text-xs`** |
| 时间算法 | `date-fns formatDistanceToNow(..., {addSuffix:true, locale:zhCN})` | 自写 `formatRelative`：刚刚 / N 分钟前 / N 小时前 / N 天前 / `toLocaleDateString` | 真差异：web 超过 7 天走 date-fns「约 X 个月前」，PC 直接给日期 |
| ⋮ 按钮显隐 | `opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-150` + `[@media(hover:none)]:opacity-100` | `opacity-0 group-hover:opacity-100 focus-visible:opacity-100` | 真差异：web 用 `focus-within`，PC 用 `focus-visible`；**web 有触摸设备常显兜底，PC 无** |
| ⋮ 按钮样式 | `inline-flex items-center justify-center w-8 h-8 rounded hover:bg-bg-sunken text-fg-muted hover:text-fg transition-colors` | `w-8 h-8 inline-flex items-center justify-center rounded hover:bg-bg-base text-fg-muted hover:text-fg transition-colors duration-150` | 真差异：**hover 底色 `bg-bg-sunken` vs `bg-bg-base`**；PC 少 `inline-flex` 在前、时长相同 |
| 行菜单容器 | shadcn `DropdownMenuContent align="end"` | `absolute right-0 top-9 z-40 min-w-[160px] rounded-md bg-bg-elevated shadow-elevation-3 py-1 animate-fade-in` | PC 为自绘定位菜单 |
| 菜单项 | `<DropdownMenuItem className="gap-2">重命名</DropdownMenuItem>`（**仅 1 项**） | `<MenuItem>`×2 + 分隔线 + 删除 = **3 项**（置顶/取消置顶 · 重命名 · 删除） | **PC 独有「置顶/取消置顶」与「删除」两项** |
| 菜单项样式 | shadcn（className 待核，见 2.5） | `w-full flex items-center gap-2 px-3 py-2 text-sm` + `text-fg hover:bg-bg-sunken` / `text-danger hover:bg-danger-soft/30` | — |
| 骨架 | `<Skeleton className="h-24 w-full"/>` ×3（`animate-pulse rounded-md bg-muted`） | `rounded-md bg-bg-sunken px-3 py-3 animate-pulse` ×3 + 内层 `h-4 w-2/3 bg-bg-elevated rounded` / `h-3 w-1/3 bg-bg-elevated rounded mt-2` | 真差异：web 单块 `h-24`；PC 三层骨架（容器 `bg-bg-sunken` + 内容 `bg-bg-elevated`），色阶相反 |
| 空态 | `<Card><CardContent className="p-8 text-center text-muted-foreground">` + `w-12 h-12 mx-auto mb-4 opacity-50` + `text-lg font-medium mb-2` | `rounded-md bg-bg-sunken p-8 text-center max-w-sm` + `w-12 h-12 mx-auto mb-3 rounded-full bg-bg-elevated flex items-center justify-center text-fg-muted` + `text-base font-medium mb-1` | 真差异：icon 圆底（web 无）；标题 `text-lg` vs `text-base`；间距 `mb-4` vs `mb-3` |
| 搜索态空 | **不存在**（web 无搜索功能） | `SearchEmpty`：`没有匹配的对话` + `搜索 “{kw}” 没找到结果` + `清除搜索` | **PC 独有功能** |
| 错误态 | **不存在** | `rounded-md bg-danger-soft/30 px-4 py-3 text-sm` + `加载失败:{err}` | **PC 独有** |
| 确认弹窗 | shadcn `<Sheet side="bottom">` → `absolute bg-bg-elevated text-fg shadow-elevation-3 flex flex-col gap-4 p-6` + `inset-x-0 bottom-0 max-h-[85vh] border-t animate-slide-in-from-bottom`；遮罩 `absolute inset-0 bg-bg-base/80 backdrop-blur-sm animate-fade-in` | `<ConfirmDialog>` → `fixed inset-0 z-50 flex items-center justify-center px-4` + 遮罩 `absolute inset-0 bg-black/60 animate-fade-in` + 卡片 `relative w-full max-w-sm rounded-md bg-bg-elevated shadow-dialog p-5 animate-slide-in-from-bottom` | **真差异（形态）：web 底部抽屉 vs PC 居中模态；圆角 `rounded-xl`?→web Sheet 无圆角 / PC `rounded-md`；内距 `p-6` vs `p-5`；阴影 `shadow-elevation-3` vs `shadow-dialog`；遮罩 `bg-bg-base/80 backdrop-blur-sm` vs `bg-black/60`** |
| 重命名输入 | `<Sheet>` 内 `<Input className="px-4 pb-2">` + Input | `ConfirmDialog` children 内直接 `<Input>` | — |
| 分页 | **不存在**（web 一次性拿全量） | **不存在**（PC 也是全量 + 本地过滤） | 一致 |

### 2.3 文案对照

| 位置 | web | PC | 一致 |
|---|---|---|---|
| 页面标题 | `对话列表` | `Gacode` | **否** |
| 分区标题 | `历史对话` | 无 | **否** |
| 新建按钮 | `新建对话` / pending `创建中...` | `+ 新建对话` / `Button loading` 走 spinner | 语义同，前缀不同 |
| 空态主文案 | `暂无对话` | `还没有对话` | **否** |
| 空态副文案 | `开始新对话，开启与 AI 的交流之旅` | `点下面的按钮开始第一次会话` | **否** |
| 多选计数 | `已选 {n} 项` | `已选 {n} 条` | **否** |
| 退出多选 | `退出多选`（aria-label） | `取消`（按钮文案） | **否** |
| 全选切换 | `清空` / `全选` | `清空` / `全选` | 一致 |
| 批量删除 | `删除 ({n})` | `删除 ({n})` | 一致 |
| 删除确认标题 | `确认删除 {n} 条对话？`（全角？） | `确认删除 {n} 条对话?` | 标点差异（`？` vs `?`） |
| 删除确认正文 | `此操作不可恢复，对话中的消息将被永久删除。`（全角逗号） | `此操作不可恢复,对话中的消息也会被删除。`（半角逗号 + 多「也会被删除」） | **否（用词+标点）** |
| 重命名弹窗标题 | `重命名对话` | `重命名对话` | 一致 |
| 重命名弹窗描述 | `修改后服务端会保留自定义标题 (不会在下次自动生成时覆盖).` | `message=""`（**PC 空**） | **否** |
| 重命名 placeholder | `输入新标题` | `输入新标题` | 一致 |
| 重命名空标题 | toast `标题不能为空` | 静默关闭（`ChatList.tsx:417-420`） | **否** |
| 单条删除 | web 无此功能 | `删除对话` / `确认删除对话 "{title}"? 此操作不可恢复。` | PC 独有 |
| 搜索 placeholder | 无 | `搜索对话标题...` | PC 独有 |
| 时间文案 | date-fns 中文 | 自写中文 | 见 2.2 |
| 创建失败 | toast `创建失败` + description | `创建失败: {err}` | 格式不同 |
| 删除成功 | `已删除 {n} 条对话` | `已删除 {n} 条对话` | 一致 |

### 2.4 交互态对照

| 状态 | web | PC |
|---|---|---|
| 行 hover | `hover:bg-accent/50` | `hover:bg-bg-elevated` |
| 行选中 | `ring-2 ring-brand bg-brand-container/30` | `bg-bg-elevated` |
| 行 focus | 无显式 focus 样式（`Card` 无 focus-visible） | 无显式 |
| ⋮ hover | `hover:bg-bg-sunken hover:text-fg` | `hover:bg-bg-base hover:text-fg` |
| ⋮ 显隐 | `opacity-0` → `group-hover:opacity-100` / `focus-within:opacity-100` / `[@media(hover:none)]:opacity-100` | `opacity-0` → `group-hover:opacity-100` / `focus-visible:opacity-100` |
| 新建按钮 disabled | `createChatMutation.isPending \|\| isMultiSelectMode` | 仅 `loading={isPending}`（**多选态不禁用**，PC 多选时按钮仍可点） |
| 批量删除 disabled | `selectedIds.size===0 \|\| isPending` | 仅 `loading`（Button 内 `isDisabled = disabled \|\| loading`） |
| Button focus-visible | web Button base：`focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring` | PC Button base：`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base` |
| Button disabled | web：`disabled:pointer-events-none disabled:opacity-50` | PC：`disabled:opacity-50 disabled:pointer-events-none`（同） |
| loading 态 | 骨架 `h-24`×3 | 骨架三层×3 |
| 空态 | `暂无对话`卡 | `还没有对话`卡 / `没有匹配的对话`卡 |
| 错误态 | 无 | `bg-danger-soft/30` 条 |

### 2.5 待核项

1. **web `DropdownMenuContent` / `DropdownMenuItem` 的实际 className** —— 本次未读 `src/components/ui/dropdown-menu.tsx`，无法抄出菜单容器/菜单项的原文类名。**需确认**：读该文件后补 §2.2「菜单项样式」行。
2. **web `Card` 的圆角** —— `card.tsx:8` 为 `rounded-lg border bg-card text-card-foreground shadow`，Tailwind 默认 `rounded-lg = 0.5rem = 8px`；而本仓 config 里 `borderRadius` 被覆写（`sm=12/md=16/lg=20/xl=22`）→ 实际 `rounded-lg = 20px`。**需确认**：本表「web 行圆角 rounded-lg vs PC rounded-md」的严重程度取决于该覆写，需人工读 `tailwind.config.ts` 的 `borderRadius` 段确认（本次只核了 `colors` 段）。
3. **PC `AppShell` 是否应为 `/chat` 增加标题分支** —— 现返回 `"Gacode"`。
4. **web 是否真的没有搜索功能** —— 读 `chat/page.tsx` 全文未见搜索框/keyword；PC 有。需 PM 确认这是「PC 超前」还是「web 漏实现」。

---

## 3. Library

### 3.0 文件与规模

| | web | PC |
|---|---|---|
| 路径 | `src/app/(main)/library/page.tsx` | `src/routes/Library.tsx` |
| 行数 | 1252 | 564 |
| 路由 | `/library` | `/library` |
| 页面标题 | `resolveTitle` 不适用 → 由 `Header` + 无 `setHeaderTitle` 调用 → 沿用 store 默认 | `resolveTitle("/library")` → `"知识库"` |
| 组件 | `Tabs`/`Input`/`Skeleton`/`Card` | `Tabs`/`Input`/`LibraryDropZone`/`LibraryCard`/`CollectSheet`/`EditSheet`/`MultiSelectToolbar`/`TagFilter`/`SortMenu` |

### 3.1 元素结构树

**web（`library/page.tsx:414-560` + `LibraryRow:1005-1145`）**

```
<div className="flex flex-col h-full">
  <div className="sticky top-0 z-20 bg-bg-base/95 backdrop-blur pt-2 pb-4">
    <div className="px-4 lg:px-8 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between gap-2 py-2">
        <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none">
          <TabsList className="flex items-center justify-start gap-1 overflow-x-auto scrollbar-none">
            <TabsTrigger className="relative inline-flex items-center justify-center whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 + active?'text-fg after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-t after:bg-brand':'text-fg-muted hover:text-fg hover:bg-accent'">
              全部 / 文本 / 图片 / 文件
        <div className="flex items-center gap-1 shrink-0">
          <button aria-label="搜索" className={cn("shrink-0 w-9 h-9 rounded-full transition-colors duration-150 inline-flex items-center justify-center", showSearch?"bg-bg-elevated text-fg":"text-fg-muted hover:bg-bg-elevated")}><Search className="w-5 h-5"/></button>
          <button aria-label="刷新" disabled={isFetching} className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors duration-150 inline-flex items-center justify-center disabled:opacity-50"><RefreshCw className={cn("w-5 h-5", isFetching&&"animate-spin")}/></button>
      [showSearch] <div className="pt-2"><div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted pointer-events-none z-10"/>
        <Input type="search" placeholder="搜索标题或标签..." className="pl-9 py-2 text-sm bg-muted/50 border-0 rounded-full focus-visible:ring-1 focus-visible:ring-brand"/>
  [上传中] <div className="px-4 lg:px-8 max-w-3xl mx-auto w-full pb-3">
    <div className="rounded-full bg-muted/50 px-4 py-2 text-xs text-fg-muted flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin"/>正在采集 {n} 项…</div>
  <div className="px-4 lg:px-8 py-4 max-w-3xl mx-auto w-full">
    [loading] 3×<Skeleton className="h-20 w-full rounded-2xl bg-card"/>
    [空] <Card className="border-0 shadow-none bg-card rounded-2xl">
          <CardContent className="p-10 text-center text-fg-muted">
            <Construction className="w-12 h-12 mx-auto text-fg-muted mb-4"/>
            <div className="text-base font-medium mb-1 text-fg">{search?"未找到匹配项":"暂无知识库内容"}</div>
            <div className="text-sm">{search?`没有标题或标签包含 "${search}" 的内容`:"上传图片 / 文档 / 链接后将自动同步到这里"}</div>
    [列表] <div className="space-y-3"> > <LibraryRow/>×N
      [加载更多] <div className="py-4 text-center"><button disabled={isFetching} className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg disabled:opacity-50">{Loader2|LibraryIcon className="w-4 h-4"}加载更多</button></div>
  [!多选] <button aria-label="采集内容" className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-brand text-brand-on shadow-lg hover:bg-brand/90 transition-colors duration-150 inline-flex items-center justify-center"><Plus className="w-7 h-7"/></button>
  [多选] <div className="sticky bottom-0 z-30 bg-bg-base/95 backdrop-blur shadow-[0_-2px_10px_rgba(0,0,0,0.4)]">
    <div className="px-4 lg:px-8 max-w-3xl mx-auto w-full py-3 flex items-center justify-between gap-2">
      <Button variant="ghost" size="sm">取消</Button><Button variant="outline" size="sm">{全选|取消全选}</Button><Button variant="destructive" size="sm" disabled>删除 ({n})</Button>
```

web `LibraryRow`（`:1005-1078`）：

```
<div role="button" tabIndex={0} className={cn("w-full flex items-center gap-3 p-4 rounded-2xl shadow-sm transition-colors text-left cursor-pointer select-none",
        选中 ? "bg-muted ring-1 ring-brand/50" : "bg-card hover:bg-muted/50")}>
  [多选] <div className="shrink-0"><CheckCircle2 className="w-5 h-5 text-brand"/> 或 <Circle className="w-5 h-5 text-fg-muted"/></div>
  <div className="shrink-0 w-10 h-10 rounded-xl bg-muted flex items-center justify-center">{typeIcon}</div>
  <div className="flex-1 min-w-0">
    <div className="text-sm font-medium truncate">{title||"未命名"}</div>
    <div className="text-xs text-fg-muted mt-0.5 truncate">{time}<span className="ml-2 inline-flex gap-2 truncate"><span className="text-fg-muted/70 truncate">#{t}</span>×3</span></div>
  [!多选] <button aria-label="更多操作" className="shrink-0 w-8 h-8 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center"><MoreVertical className="w-4 h-4"/></button>
  {menuPos && <div role="menu" className="fixed z-[70] min-w-[160px] rounded-xl bg-popover shadow-2xl py-1"> 详情 / 编辑 / [外链] / 删除 </div>}
```

**PC（`Library.tsx:249-443` + `LibraryCard.tsx:113-191`）**

```
<LibraryDropZone>                                       ← PC 独有（拖拽上传）
  <div className="min-h-full flex flex-col">
    <div className="sticky top-0 z-10 bg-bg-base">                       ← 无 /95 无 backdrop-blur 无 pt-2 pb-4
      <div className="px-4 lg:px-8 max-w-3xl mx-auto w-full space-y-2 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none">
            <Tabs variant="underline" → <div role="tablist" className="flex gap-6 border-b border-border">
              <button role="tab" className="relative pb-2 text-sm transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none inline-flex items-center gap-1 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:transition-colors + active?'text-fg font-medium after:bg-brand':'text-fg-muted hover:text-fg after:bg-transparent'">
                全部 / 图片 / 文档 / 链接
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="default" size="sm" aria-label="新建条目"><PlusIcon/><span className="hidden sm:inline">新建</span></Button>   ← PC 独有
            <SortMenu/>                                                                                                        ← PC 独有
            <button aria-label="搜索" className={["shrink-0 w-9 h-9 rounded-full transition-colors duration-150","inline-flex items-center justify-center", showSearch?"bg-bg-elevated text-fg":"text-fg-muted hover:bg-bg-elevated"]}/>
            <button aria-label="刷新" disabled={isFetching} className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors duration-150 inline-flex items-center justify-center disabled:opacity-50"><RefreshIcon className={isFetching?"animate-spin":""}/></button>
        [showSearch] <div className="relative pt-1">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted pointer-events-none z-10"/>
          <Input type="search" placeholder="搜索标题或标签..." className="pl-9 py-2 text-sm bg-muted/50 border-0 !rounded-full"/>   ← 无 focus-visible:ring
        <TagFilter/>                                                                                                             ← PC 独有（Row 3）
    <div className="flex-1 px-4 lg:px-8 max-w-3xl mx-auto w-full py-4">
      [loading] <SkeletonGrid/>   ← 6 个 rounded-2xl bg-bg-elevated 三层骨架
      [空] <EmptyState/>          ← rounded-2xl border border-border bg-bg-elevated p-12
      [列表] <div className="space-y-3"> > <LibraryCard/>×N
        [加载更多] <div className="flex justify-center mt-4"><Button variant="ghost" size="md" loading>加载更多</Button></div>
  [!多选] <button aria-label="采集内容" className={["fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full","bg-brand text-brand-on shadow-lg","hover:bg-brand/90 transition-colors duration-150","inline-flex items-center justify-center"]}><FabPlusIcon/></button>
  [多选] <MultiSelectToolbar> → sticky bottom-0 z-30 bg-bg-elevated border-t border-border px-4 py-3 flex items-center gap-3
  <ConfirmDialog> 单条删除
  <EditSheet/>  <CollectSheet/>
```

PC `LibraryCard`（`LibraryCard.tsx:113-191`）：

```
<div className={["text-left rounded-2xl p-4 flex items-start gap-3 select-none","cursor-pointer",
      选中 ? "bg-bg-elevated ring-1 ring-brand/60" : 多选中 ? "bg-bg-sunken hover:bg-bg-elevated" : "bg-bg-elevated hover:bg-bg-sunken"]}>
  [多选] <span className={["shrink-0 w-5 h-5 mt-0.5 inline-flex items-center justify-center rounded border", 选中?"bg-fg border-fg text-bg-base":"bg-bg-base border-border text-transparent"]}>✓</span>
  <div className="shrink-0 w-9 h-9 rounded bg-bg-sunken flex items-center justify-center text-fg-muted"><Icon/></div>
  <div className="flex-1 min-w-0 space-y-1">
    <div className="flex items-center gap-2">
      <span className="text-xs px-1.5 py-0.5 rounded bg-bg-sunken text-fg-muted">{类型标签}</span>       ← PC 独有
      <span className="text-xs text-fg-subtle font-mono truncate">#{item.id}</span>                  ← PC 独有
    <h3 className="text-sm font-medium text-fg line-clamp-2 break-all">{title||"(无标题)"}</h3>
    <div className="flex items-center gap-2 flex-wrap">
      <p className="text-xs text-fg-subtle">{relative}</p>                                          ← 前景色不同
      [tags] <p className="text-xs text-fg-subtle truncate">#t1 #t2 #t3</p>
  [!多选] <div className="shrink-0"><button aria-label="更多操作" className="w-8 h-8 rounded-full text-fg-muted hover:bg-bg-base hover:text-fg inline-flex items-center justify-center"><MoreVertIcon/></button>
         <DropdownMenu items=[编辑, 删除(红色)]/>
```

### 3.2 逐元素映射表

| 层级 | web className（原文） | PC className（原文） | 差异 |
|---|---|---|---|
| 页面外壳 | `flex flex-col h-full` | `min-h-full flex flex-col`（且外再套 `LibraryDropZone`） | 真差异：PC 多一层拖拽上传包裹组件（PC 独有功能） |
| 顶栏 sticky | `sticky top-0 z-20 bg-bg-base/95 backdrop-blur pt-2 pb-4` | `sticky top-0 z-10 bg-bg-base` | **真差异：PC 缺 `bg-bg-base/95` 半透 + `backdrop-blur` 毛玻璃 + `pt-2 pb-4`；z 索引 20→10** |
| 顶栏内容容器 | `px-4 lg:px-8 max-w-3xl mx-auto w-full` + 内层 `flex items-center justify-between gap-2 py-2` | `px-4 lg:px-8 max-w-3xl mx-auto w-full space-y-2 py-2` + 内层 `flex items-center justify-between gap-2` | 一致（PC 用 `space-y-2` 替代内层 `py-2`） |
| Tabs 容器 | `flex items-center justify-start gap-1 overflow-x-auto scrollbar-none`（**无边框**） | `flex gap-6 border-b border-border` | **真差异：web 已明确去掉 `border-b`（`tabs.tsx:51-54` 注释「整体去线化」），PC 反而加了 `border-b border-border`；间距 `gap-1` vs `gap-6`** |
| Tab item | `relative inline-flex items-center justify-center whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50` + `text-fg after:absolute after:inset-x-3 after:bottom-0 after:h-[2px] after:rounded-t after:bg-brand` / `text-fg-muted hover:text-fg hover:bg-accent` | `relative pb-2 text-sm transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none inline-flex items-center gap-1 after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:transition-colors` + `text-fg font-medium after:bg-brand` / `text-fg-muted hover:text-fg after:bg-transparent` | **真差异：内距 web `px-4 py-2.5` vs PC **无水平内距**（只有 `pb-2`）→ PC tab 贴得更紧；下划线 web `after:inset-x-3 after:rounded-t`（缩进）vs PC `after:left-0 after:right-0`（通栏）；web inactive 有 `hover:bg-accent` PC 无；web 有 `focus-visible:ring-2 ring-ring` PC 无** |
| Tab 文案 | `全部 / 文本 / 图片 / 文件` | `全部 / 图片 / 文档 / 链接` | **真差异：`文本` vs `文档`；`文件` vs `链接`（第 3、4 项顺序与词都不同）** |
| 「+ 新建」按钮 | 无 | `<Button variant="default" size="sm"><PlusIcon/><span className="hidden sm:inline">新建</span></Button>` | **PC 独有**（web 只靠右下角 FAB） |
| SortMenu | 无 | `shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors duration-150 inline-flex items-center justify-center` + 下拉 3 项（最新/最早/标题） | **PC 独有** |
| 搜索按钮 | 一致（同左） | 一致 | **一致** ✅ |
| 刷新按钮 | 一致 | 一致 | **一致** ✅ |
| 搜索框容器 | `pt-2` > `relative` | `relative pt-1` | 真差异：`pt-2` vs `pt-1` |
| 搜索框 Input | `pl-9 py-2 text-sm bg-muted/50 border-0 rounded-full focus-visible:ring-1 focus-visible:ring-brand` | `pl-9 py-2 text-sm bg-muted/50 border-0 !rounded-full` | **真差异：PC 用 `!rounded-full` 硬压 base 的 `rounded-md`；PC 缺 `focus-visible:ring-1 focus-visible:ring-brand`（web 搜索框有橙色 focus 环）** |
| TagFilter 行 | 无 | `overflow-x-auto -mx-1 px-1` > `inline-flex gap-1.5 py-1 min-w-max` + chip | **PC 独有** |
| 上传中提示条 | `px-4 lg:px-8 max-w-3xl mx-auto w-full pb-3` > `rounded-full bg-muted/50 px-4 py-2 text-xs text-fg-muted flex items-center gap-2` + `Loader2 className="w-3.5 h-3.5 animate-spin"` | **无**（PC 走 Toast 提示 `已入库: {name}`） | **PC 缺整块上传中进度提示条** |
| 列表容器 | `px-4 lg:px-8 py-4 max-w-3xl mx-auto w-full` | `flex-1 px-4 lg:px-8 max-w-3xl mx-auto w-full py-4` | 一致（PC 多 `flex-1`） |
| 骨架 | `Skeleton className="h-20 w-full rounded-2xl bg-card"` ×3 | `rounded-2xl bg-bg-elevated p-4 animate-pulse` ×6 + 内层 `w-9 h-9 rounded bg-bg-sunken` / `h-3 w-12 bg-bg-sunken rounded` / `h-4 w-3/4` / `h-3 w-1/4` | 真差异：web **3 条扁平块**，PC **6 条三层骨架**；底色 web `bg-card`(#0a0a0a) vs PC `bg-bg-elevated`(#181818) 同层不同级 |
| 空态容器 | `<Card className="border-0 shadow-none bg-card rounded-2xl">` + `CardContent className="p-10 text-center text-fg-muted"` | `rounded-2xl border border-border bg-bg-elevated p-12 text-center max-w-sm w-full` | **真差异（PC 已改但方向相反）：web **去边框**（`border-0 shadow-none`）；PC **加了** `border border-border`；内距 `p-10` vs `p-12`；PC 多 `max-w-sm w-full`** |
| 空态 icon | `Construction className="w-12 h-12 mx-auto text-fg-muted mb-4"` | `LibraryIcon className="w-12 h-12 mx-auto text-fg-muted mb-4"` | 类名一致（`mb-4` 相同）；图标不同（Construction vs Library） |
| 空态标题 | `text-base font-medium mb-1 text-fg` | `text-base font-medium` | 一致（PC 缺 `text-fg` 显式） |
| 空态 CTA | 无 | `<Button variant="default" size="md"><PlusIcon/>新建条目</Button>` + `mt-4` | **PC 独有**（web 空态无行动按钮） |
| 列表间距 | `space-y-3` | `space-y-3` | **一致** ✅ |
| 卡片容器 | `w-full flex items-center gap-3 p-4 rounded-2xl shadow-sm transition-colors text-left cursor-pointer select-none` + `bg-card hover:bg-muted/50` | `text-left rounded-2xl p-4 flex items-start gap-3 select-none cursor-pointer` + `bg-bg-elevated hover:bg-bg-sunken` | **真差异：底色 web `bg-card`(#0a0a0a) vs PC `bg-bg-elevated`(#181818) → **PC 卡片比 web 亮一档**；hover web `bg-muted/50`(半透) vs PC `bg-bg-sunken`(不透明且**比常态更暗**)；对齐 web `items-center` vs PC `items-start`；web 有 `shadow-sm` PC 无；web 有 `w-full` PC 无** |
| 卡片选中态 | `bg-muted ring-1 ring-brand/50` | `bg-bg-elevated ring-1 ring-brand/60` | 真差异：ring 透明度 50% vs 60%；底色 `bg-muted`(#181818) ≡ PC `bg-bg-elevated`（同色 ✓） |
| 类型图标容器 | `shrink-0 w-10 h-10 rounded-xl bg-muted flex items-center justify-center` | `shrink-0 w-9 h-9 rounded bg-bg-sunken flex items-center justify-center text-fg-muted` | **真差异：尺寸 `w-10 h-10`(40px) vs `w-9 h-9`(36px)；圆角 `rounded-xl` vs `rounded`；底色 web `bg-muted`(#181818) vs PC `bg-bg-sunken`(#0a0a0a，**比卡片底还暗**)；PC 多 `text-fg-muted`** |
| 类型图标颜色 | web 按类型彩色：image `text-brand-cyan` / doc `text-brand-yellow` / link `text-brand-green` / 其他 `text-fg-muted`，均 `w-5 h-5` | PC 统一 `text-fg-muted` 容器继承，无彩色区分 | **真差异：web 按类型上色，PC 不区分** |
| 类型标签 chip | 无 | `text-xs px-1.5 py-0.5 rounded bg-bg-sunken text-fg-muted` | **PC 独有** |
| `#id` 单色行 | 无 | `text-xs text-fg-subtle font-mono truncate` | **PC 独有** |
| 卡片标题 | `text-sm font-medium truncate`（单行） | `text-sm font-medium text-fg line-clamp-2 break-all`（两行） | **真差异：`truncate`(1 行省略) vs `line-clamp-2 break-all`(2 行换行)** |
| 次行 | `text-xs text-fg-muted mt-0.5 truncate` | `<p className="text-xs text-fg-subtle">` + `<p className="text-xs text-fg-subtle truncate">` | **真差异：前景色 `text-fg-muted`(#9ca3af) vs `text-fg-subtle`(#6c757d，**明显更暗**)** |
| 标签呈现 | `ml-2 inline-flex gap-2 truncate` + `text-fg-muted/70 truncate`（`#tag`） | `flex items-center gap-2 flex-wrap` + `text-xs text-fg-subtle truncate`（`#t` 空格拼接） | 真差异：`text-fg-muted/70` vs `text-fg-subtle`（**web 半透浅灰，PC 实色暗灰**） |
| ⋮ 按钮 | `shrink-0 w-8 h-8 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center` | `w-8 h-8 rounded-full text-fg-muted hover:bg-bg-base hover:text-fg inline-flex items-center justify-center` | **真差异：hover 底色 `bg-bg-sunken` vs `bg-bg-base`；PC 少 `shrink-0` 与 `transition-colors duration-150`** |
| ⋮ 显隐 | 常显 | 常显 | 一致（web 靠点击坐标弹出，PC 靠 trigger） |
| 行菜单容器 | `fixed z-[70] min-w-[160px] rounded-xl bg-popover shadow-2xl py-1` | `DropdownMenu`（PC `components/ui/DropdownMenu.tsx`，本次未读 className → 待核） | 待核 |
| 菜单项 | `w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-bg-sunken transition-colors`（详情 / 编辑 / [外链] / 删除 `text-danger hover:bg-danger-soft/40`） | PC 下拉项 className 待核 | 待核 |
| FAB | `fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-brand text-brand-on shadow-lg hover:bg-brand/90 transition-colors duration-150 inline-flex items-center justify-center` + `<Plus className="w-7 h-7"/>` | 同（拆成 4 段字符串 join） | **一致** ✅（PC 已按 web L568 对齐，见 `Library.tsx:381-384` 注释） |
| 多选条容器 | `sticky bottom-0 z-30 bg-bg-base/95 backdrop-blur shadow-[0_-2px_10px_rgba(0,0,0,0.4)]` + 内层 `px-4 lg:px-8 max-w-3xl mx-auto w-full py-3 flex items-center justify-between gap-2` | `sticky bottom-0 z-30 bg-bg-elevated border-t border-border px-4 py-3 flex items-center gap-3` | **真差异（PC 未对齐）：web 半透+毛玻璃+投影上浮阴影、**无边框**、**不**限宽、内层 `justify-between`；PC 实色 `bg-bg-elevated` + `border-t`、**无限宽**、`gap-3`**。注：`Library.tsx:401` 注释称「跟 PC-6 Library 一致」，但 web 侧并非如此 |
| 多选按钮 | `variant="ghost" size="sm"` / `variant="outline" size="sm"` / `variant="destructive" size="sm" disabled` | `MultiSelectToolbar` 内部（PC `MultiSelectToolbar.tsx:45-49` 只见到容器，**按钮 className 待核**） | 待核 |

### 3.3 文案对照

| 位置 | web | PC | 一致 |
|---|---|---|---|
| Tab 项 | `全部` `文本` `图片` `文件` | `全部` `图片` `文档` `链接` | **否** |
| 顶栏新建 | 无 | `新建`（`hidden sm:inline`） | PC 独有 |
| 排序项 | 无 | 最新/最早/标题（`SortMenu.tsx`） | PC 独有 |
| 搜索 placeholder | `搜索标题或标签...` | `搜索标题或标签...` | **一致** ✅ |
| 上传中提示 | `正在采集 {n} 项…` | 无 | PC 缺 |
| 空态标题（有搜索） | `未找到匹配项` | `还没有知识库`（**不区分搜索态**） | **否** |
| 空态副文（有搜索） | `没有标题或标签包含 "{kw}" 的内容` | `拖入文件入库,或点击下方按钮手动添加` | **否** |
| 空态标题（无搜索） | `暂无知识库内容` | `还没有知识库` | **否** |
| 空态副文（无搜索） | `上传图片 / 文档 / 链接后将自动同步到这里` | `拖入文件入库,或点击下方按钮手动添加` | **否** |
| 空态按钮 | 无 | `新建条目` | PC 独有 |
| 加载更多 | `加载更多`（纯文字 + icon） | `加载更多`（Button + spinner） | 一致 |
| 行标题兜底 | `未命名` | `(无标题)` | **否** |
| 批量删除按钮 | `取消` / `全选`·`取消全选` / `删除 ({n})` | 同（待核按钮 className） | 一致 |
| 单删确认 | `删除` | `删除这条知识?` + `「{title}」 将从知识库移除, 此操作不可撤销。` | **否**（web 菜单项文案 `删除`） |
| FAB aria | `采集内容` | `采集内容` | 一致 ✅ |
| 入库成功 | （无 toast，走进度条） | `已入库: {name}` | PC 独有 |
| 批量删除成功 | 待核（web 逻辑在 `:614` 后，本次未读全） | `已删除 {n} 条` / `全部删除失败` / `成功 {x} / 失败 {y}` | 待核 |

### 3.4 交互态对照

| 状态 | web | PC |
|---|---|---|
| Tab active | `text-fg` + `after:inset-x-3 after:h-[2px] after:rounded-t after:bg-brand` | `text-fg font-medium` + `after:left-0 after:right-0 after:h-[2px] after:bg-brand` |
| Tab inactive | `text-fg-muted hover:text-fg hover:bg-accent` | `text-fg-muted hover:text-fg after:bg-transparent` |
| Tab focus | `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` | 无 |
| Tab disabled | `disabled:pointer-events-none disabled:opacity-50` | `disabled:opacity-50 disabled:pointer-events-none` |
| 搜索按钮 active | `bg-bg-elevated text-fg` | `bg-bg-elevated text-fg` | **一致** ✅ |
| 搜索框 focus | `focus-visible:ring-1 focus-visible:ring-brand` | **无** |
| 刷新 disabled | `disabled:opacity-50` + 图标 `animate-spin` | 同 |
| 卡片 hover | `hover:bg-muted/50` | `hover:bg-bg-sunken`（**比常态更暗**） |
| 卡片选中 | `bg-muted ring-1 ring-brand/50` | `bg-bg-elevated ring-1 ring-brand/60` |
| 卡片 focus | `tabIndex={0}` 但无 `focus-visible` 样式 | 无 `tabIndex`（`onKeyDown` 处理 Enter/Space） |
| ⋮ hover | `hover:bg-bg-sunken hover:text-fg` | `hover:bg-bg-base hover:text-fg` |
| FAB hover | `hover:bg-brand/90` | `hover:bg-brand/90` | **一致** ✅ |
| loading | `Skeleton` 3 条 | `SkeletonGrid` 6 条三层 |
| 空态 | 见 3.3 | 见 3.3 |
| 错误态 | **无**（web Library 无 error 分支） | **无**（PC Library 亦无 error 分支，只有 toast） |
| 拖拽上传 | 无 | `LibraryDropZone` + `ChatInputBar` 同款 `pointer-events-none fixed inset-0 z-[200]` 遮罩 | PC 独有 |

### 3.5 待核项

1. **PC `DropdownMenu.tsx` 的容器/菜单项 className** —— 未读。**需确认**：读 `src/components/ui/DropdownMenu.tsx` 补 §3.2「行菜单」两行。
2. **PC `MultiSelectToolbar.tsx` 内部三个按钮的 className / 文案** —— 只见到 `MultiSelectToolbar.tsx:45-49` 容器。**需确认**：读全文补 §3.2「多选按钮」。
3. **web Library 批量删除/编辑 Dialog 的文案与按钮** —— 本次只读到 `:613`，`:614-812` 未读（含 EditSheet 内容、批量删除确认文案）。**需确认**：读 `library/page.tsx:614-812`。
4. **web `typeIcon` 的 4 个图标 className 已在 `:110-116` 读到原文**（`text-brand-cyan` / `text-brand-yellow` / `text-brand-green` / `text-fg-muted`，均 `w-5 h-5`）——但**该映射是否应保留**需 PM 拍板。
5. **PC `CollectSheet` / `EditSheet` 的 className** —— 未读。web 侧对应物是内联的固定定位 sheet（`library/page.tsx:690-810`），PC 是抽出的组件，两者无法直接比对。**需确认**：是否需要展开子 sheet 对照（超出本批 5 页范围）。

---

## 4. Notifications

### 4.0 文件与规模

| | web | PC |
|---|---|---|
| 路径 | `src/app/(main)/notifications/page.tsx` | `src/routes/Notifications.tsx` |
| 行数 | 451 | 455 |
| 路由 | `/notifications` | `/notifications` |
| 页面标题 | `setHeaderTitle("通知中心")` | `resolveTitle` → `"通知"` |
| 组件 | `Card`/`Badge`/`Skeleton`/`Button` | `CategoryTabs`/`NotificationItem`/`InfiniteScrollList`/`NotificationSettingsSheet`/`Button` |

### 4.1 元素结构树

**web（`notifications/page.tsx:164-251`）**

```
<div className="px-4 lg:px-8 py-6 max-w-3xl mx-auto">
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2">
      <Bell className="w-5 h-5 text-brand"/>
      <h1 className="text-lg font-semibold">通知中心</h1>
      [未读>0] <Badge variant="destructive" className="text-[10px]">{n} 未读</Badge>
    <Button variant="ghost" size="sm" className="gap-1.5" disabled>{Loader2|CheckCheck className="w-3.5 h-3.5"}全部已读</Button>
  [401/403] <PendingBanner/>  → <Card className="border-dashed border-warning/50 bg-warning-soft/30"><CardContent className="p-6 text-center">…</CardContent></Card>
  <BrowserNotificationCard/>   → <Card className="mb-4"><CardContent className="p-4">{4 态}</CardContent></Card>
  [loading] 3×<Skeleton className="h-20 w-full rounded-lg"/>
  [空] <Card><CardContent className="p-10 text-center text-fg-muted">
          <div className="text-5xl mb-4">📭</div>
          <div className="text-base font-medium mb-1 text-fg">暂无通知</div>
          <div className="text-sm">新消息会在此处通知你</div>
  [列表] <div className="space-y-2"> > <NotificationRow/>×N
```

web `NotificationRow`（`:269-309`）：

```
<button className={cn("w-full flex items-start gap-3 p-3 rounded-lg border border-border transition-colors text-left",
        已读 ? "bg-bg-sunken hover:bg-bg-elevated" : "bg-brand-container/30 hover:bg-brand-container/40 border-brand/30")}>
  <div className="pt-1.5 shrink-0"><div className={cn("w-2 h-2 rounded-full", 已读?"bg-transparent":"bg-brand")}/></div>
  <div className="flex-1 min-w-0">
    <div className="flex items-baseline gap-2">
      <span className={cn("text-sm font-medium truncate", 已读?"text-fg-muted":"text-fg")}>{title}</span>
      <span className="text-[10px] text-fg-subtle shrink-0">{time}</span>
    [body] <p className="text-xs text-fg-muted mt-1 line-clamp-2">{body}</p>
```

**PC（`Notifications.tsx:230-311`）**

```
<div className="min-h-full flex flex-col">
  <div className="sticky top-0 z-10 bg-bg-base px-4 lg:px-8 py-3 flex items-center justify-between">
    <div className="flex items-center gap-2">
      <h1 className="text-base font-medium">通知</h1>
      [未读>0] <span className="text-xs px-2 py-0.5 rounded-full bg-brand/20 text-brand border border-brand/40">{n} 条未读</span>
    <div className="flex items-center gap-2">
      <button aria-label="通知设置" className="w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors duration-150 inline-flex items-center justify-center"><GearIcon/></button>     ← PC 独有
      <button aria-label="刷新"      className="w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors duration-150 inline-flex items-center justify-center"><RefreshIcon/></button>    ← PC 独有
      <Button variant="ghost" size="sm" disabled={unreadCount===0||isPending}>全部已读</Button>
  <div className="px-4 lg:px-8 py-2"><CategoryTabs active onChange/> → <div className="overflow-x-auto scrollbar-none"> + Tabs underline    ← PC 独有（分类）
  <div className="flex-1 px-4 lg:px-8 py-4">
    [loading] <SkeletonList/>  → <li className="rounded-2xl bg-bg-elevated p-4 animate-pulse">×3
    [error] <div className="rounded-md bg-danger-soft/30 px-4 py-3 text-sm">加载失败:{err}</div>       ← PC 独有
    [空] <EmptyState category/> → rounded-2xl border border-border bg-bg-elevated p-12 text-center max-w-sm w-full
    [列表] <InfiniteScrollList> → <ul className="space-y-2 max-w-3xl mx-auto"> > <li> > <NotificationRow/>×N
  <NotificationSettingsSheet/>                                                                             ← PC 独有
```

PC `NotificationItem`（`NotificationItem.tsx:45-99`）：

```
<button className={["w-full text-left flex items-stretch gap-3 rounded-2xl border border-border bg-bg-elevated p-4","hover:bg-bg-sunken transition-colors duration-150"]}>
  [categoryIcon] <span className="shrink-0 w-9 h-9 rounded-full bg-bg-sunken flex items-center justify-center text-fg-muted"/>
  [未读] <span className={["w-1 self-stretch rounded shrink-0", barColor]}/>      ← 未读用竖条
  [已读] <span aria-hidden className="w-1 shrink-0"/>
  <div className="flex-1 min-w-0 space-y-1">
    <div className="flex items-start justify-between gap-3">
      <h3 className={["text-sm flex-1 min-w-0 break-all", 未读?"font-medium text-fg":"text-fg-muted"]}>{title}</h3>
      <span className="text-xs text-fg-subtle shrink-0">{relative}</span>
    [body] <p className="text-xs text-fg-muted line-clamp-2 break-all">{body}</p>
    <div className="flex items-center gap-2 flex-wrap">
      [type] <span className="inline-block text-xs px-1.5 py-0.5 rounded bg-bg-sunken text-fg-subtle">{type}</span>     ← PC 独有
      [deep_link] <span className="text-xs text-fg-subtle">点击查看 →</span>                                                      ← PC 独有
      [url]       <span className="text-xs text-fg-subtle">点击打开链接 →</span>                                                  ← PC 独有
```

### 4.2 逐元素映射表

| 层级 | web className（原文） | PC className（原文） | 差异 |
|---|---|---|---|
| 页面外壳 | `px-4 lg:px-8 py-6 max-w-3xl mx-auto` | `min-h-full flex flex-col`（限宽只落在 `<ul className="space-y-2 max-w-3xl mx-auto">`） | **真差异：PC 顶栏/分类条/空态/错误条都不限宽，web 全页统一 `max-w-3xl mx-auto`** |
| 顶栏 sticky | **无 sticky**（普通 `flex items-center justify-between mb-4`） | `sticky top-0 z-10 bg-bg-base px-4 lg:px-8 py-3 flex items-center justify-between` | **真差异：PC 加了吸顶条，web 无** |
| 铃铛图标 | `<Bell className="w-5 h-5 text-brand"/>` | **无**（标题行直接 `<h1>`） | **PC 缺品牌铃铛图标** |
| 标题 | `text-lg font-semibold` | `text-base font-medium` | **真差异：`text-lg font-semibold` vs `text-base font-medium`（PC 更小更细）** |
| 标题文案 | `通知中心` | `通知` | **否** |
| 未读徽标 | `<Badge variant="destructive" className="text-[10px]">{n} 未读</Badge>` | `<span className="text-xs px-2 py-0.5 rounded-full bg-brand/20 text-brand border border-brand/40">{n} 条未读</span>` | **真差异：web 红色 destructive 底 + `text-[10px]`；PC 橙色半透底 + 边框 + `text-xs`；文案 `未读` vs `条未读`** |
| 全部已读按钮 | `variant="ghost" size="sm" className="gap-1.5"` + `<CheckCheck className="w-3.5 h-3.5"/>` | `variant="ghost" size="sm"`（**无图标、无 gap 类**） | 真差异：web 有双勾图标 + `gap-1.5`，PC 纯文字 |
| 通知设置按钮 | 无 | `w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors duration-150 inline-flex items-center justify-center` | **PC 独有** |
| 刷新按钮 | 无 | 同上 | **PC 独有** |
| 分类 Tabs | 无 | `overflow-x-auto scrollbar-none` + `<Tabs variant="underline">` | **PC 独有** |
| 「后端未就绪」占位卡 | `<Card className="border-dashed border-warning/50 bg-warning-soft/30">` + `CardContent className="p-6 text-center"` + `🛎️` + `通知中心` + `🚧 待开发 — 后端接口尚未就绪` | **无** | **web 独有（PC 缺）** |
| 浏览器通知卡 | `<Card className="mb-4">` + `CardContent className="p-4"`，4 态（unsupported/denied/granted+off/granted+on/default），图标 `BellOff text-fg-subtle` / `Bell text-fg-muted` / `BellRing text-success` / `Bell text-brand` | `<NotificationSettingsSheet>`（`src/components/notifications/NotificationSettingsSheet.tsx`，**className 只见 `space-y-4` / `border-t border-border pt-3` 等，主体未读 → 待核**） | **形态不同：web 是页面内联卡片 + 5 个文案态；PC 是弹层 Sheet**。是否等价需 PM 判断 |
| 骨架 | `Skeleton className="h-20 w-full rounded-lg"` ×3（`bg-muted`=#181818） | `rounded-2xl bg-bg-elevated p-4 animate-pulse` ×3 + 内层 `h-4 w-2/3 bg-bg-sunken rounded` / `h-3 w-3/4 bg-bg-sunken rounded mt-2` | 真差异：`rounded-lg` vs `rounded-2xl`；单层 vs 三层；色阶相反 |
| 空态容器 | `<Card><CardContent className="p-10 text-center text-fg-muted">` | `rounded-2xl border border-border bg-bg-elevated p-12 text-center max-w-sm w-full` | **真差异：PC 已改 `rounded-2xl`+`border`（`Notifications.tsx:347-349` 注释对齐 PC-6），但 web 是 `rounded-lg border` 的 Card（Card 默认有 `border`）+ `p-10`，PC `p-12` + `max-w-sm`** |
| 空态 icon | `<div className="text-5xl mb-4">📭</div>`（emoji） | `<BellIcon className="w-12 h-12 mx-auto mb-4 text-fg-muted"/>`（SVG） | **真差异：emoji 📭 vs 线性 SVG 铃铛** |
| 空态标题 | `text-base font-medium mb-1 text-fg` `暂无通知` | `text-base font-medium` `还没有通知` | 字号间距一致；**文案否** |
| 空态副文 | `text-sm` `新消息会在此处通知你` | `text-sm text-fg-muted mt-2` `{all ? "系统通知和消息提醒会出现在这里" : "这个分类还没有通知"}` | **否（web 无分类态文案）** |
| 列表容器 | `space-y-2` | `space-y-2 max-w-3xl mx-auto` | 一致（PC 补限宽） |
| 行容器 | `w-full flex items-start gap-3 p-3 rounded-lg border border-border transition-colors text-left` + 已读 `bg-bg-sunken hover:bg-bg-elevated` / 未读 `bg-brand-container/30 hover:bg-brand-container/40 border-brand/30` | `w-full text-left flex items-stretch gap-3 rounded-2xl border border-border bg-bg-elevated p-4 hover:bg-bg-sunken transition-colors duration-150` | **真差异：圆角 `rounded-lg` vs `rounded-2xl`；内距 `p-3` vs `p-4`；对齐 `items-start` vs `items-stretch`；底色：web 已读 `bg-bg-sunken`(#0a0a0a) / 未读 `bg-brand-container/30`；PC **不分已读未读**，统一 `bg-bg-elevated`(#181818)** |
| 未读标记 | `w-2 h-2 rounded-full` 圆点 + 外层 `pt-1.5 shrink-0`；已读 `bg-transparent` | `w-1 self-stretch rounded shrink-0` **竖条**（通高），按 category 上色（`CATEGORY_BAR`）；已读渲染 `<span className="w-1 shrink-0"/>` 占位 | **真差异：圆点 vs 通高竖条** |
| 类目图标 | 无 | `shrink-0 w-9 h-9 rounded-full bg-bg-sunken flex items-center justify-center text-fg-muted` | **PC 独有** |
| 标题行布局 | `flex items-baseline gap-2` | `flex items-start justify-between gap-3` | 真差异：基线对齐 vs 两端对齐 |
| 标题样式 | `text-sm font-medium truncate` + 已读 `text-fg-muted` | `text-sm flex-1 min-w-0 break-all` + 已读 `text-fg-muted` | 真差异：web `truncate` 省略号 / PC `break-all` 硬换行（且 PC 已读态**去掉了 `font-medium`**） |
| 时间字号 | `text-[10px] text-fg-subtle shrink-0` | `text-xs text-fg-subtle shrink-0` | **真差异：`text-[10px]` vs `text-xs`(12px)** |
| 正文 | `text-xs text-fg-muted mt-1 line-clamp-2` | `text-xs text-fg-muted line-clamp-2 break-all` | 真差异：web `mt-1`（靠 `space-y-1` 容器无）PC 无 `mt-1`；PC 多 `break-all` |
| type chip / 动作提示 | 无 | `inline-block text-xs px-1.5 py-0.5 rounded bg-bg-sunken text-fg-subtle` / `点击查看 →` / `点击打开链接 →` | **PC 独有** |
| 无限滚动 | 无 | `h-8 flex items-center justify-center text-xs text-fg-subtle py-4` + spinner `inline-block w-3 h-3 rounded-full border-2 border-brand border-t-transparent animate-spin` | **PC 独有（web 只取第一页）** |
| 错误态 | 无 | `rounded-md bg-danger-soft/30 px-4 py-3 text-sm` + `加载失败:{err}` | **PC 独有** |

### 4.3 文案对照

| 位置 | web | PC | 一致 |
|---|---|---|---|
| 页面标题（Header） | `通知中心` | `通知` | **否** |
| 页内 h1 | `通知中心` | `通知` | **否** |
| 未读徽标 | `{n} 未读` | `{n} 条未读` | **否** |
| 全部已读 | `全部已读` | `全部已读` | 一致 ✅ |
| 占位卡标题 | `通知中心` | 无 | PC 缺 |
| 占位卡正文 | `🚧 待开发 — 后端接口尚未就绪` / `部署 Worker D 的通知端点后, 这里将显示实时通知列表` | 无 | PC 缺 |
| 空态主文 | `暂无通知` | `还没有通知` | **否** |
| 空态副文 | `新消息会在此处通知你` | `系统通知和消息提醒会出现在这里` / `这个分类还没有通知` | **否** |
| 浏览器通知·默认态 | `开启浏览器通知` / `AI 回复到达时提醒您` / 按钮 `开启` | `NotificationSettingsSheet`（未读，见 4.5） | 待核 |
| 浏览器通知·已开启 | `浏览器通知已开启` / `AI 回复到达且您不在前台时, 会收到系统通知` / 按钮 `关闭` | 同上 | 待核 |
| 浏览器通知·已暂停 | `浏览器通知已暂停` / `AI 回复到达时将不再弹出系统通知` / 按钮 `重新开启` | 同上 | 待核 |
| 浏览器通知·被拒 | `已被浏览器拒绝` / `请在浏览器设置中允许本站点发送通知` | 同上 | 待核 |
| 浏览器通知·不支持 | `浏览器通知不可用` / `当前浏览器不支持系统通知 API` | 同上 | 待核 |
| 全部标已读 toast | `全部已标记为已读` | `已全部标为已读` | **否** |
| 标记失败 toast | `标记失败` (warning) | `标记已读失败: {err}` (danger) | **否** |
| 加载更多失败 toast | 无 | `加载更多失败: {err}` | PC 独有 |

### 4.4 交互态对照

| 状态 | web | PC |
|---|---|---|
| 行 hover（已读） | `hover:bg-bg-elevated` | `hover:bg-bg-sunken`（统一态，**方向相反**） |
| 行 hover（未读） | `hover:bg-brand-container/40` | 同上 |
| 未读视觉 | 底色 `bg-brand-container/30` + `border-brand/30` + 圆点 `bg-brand` | 无底色差异；竖条 `barColor`（按 category 上色） |
| 已读视觉 | 底色 `bg-bg-sunken` + 圆点 `bg-transparent` + 标题 `text-fg-muted` | 底色同常态 + 占位 `<span className="w-1 shrink-0"/>` + 标题 `text-fg-muted`（无 `font-medium`） |
| 全部已读 disabled | `isPending \|\| isUndeployed \|\| unreadCount===0` | `unreadCount===0 \|\| isPending`（无 isUndeployed 概念） |
| 刷新按钮 disabled | 无（按钮不存在） | 无 `disabled`（无 `isFetching` 守卫） |
| loading | `Skeleton h-20 rounded-lg` ×3 | `rounded-2xl` 三层骨架 ×3 |
| 空态 | 见 4.3 | 见 4.3 + 分类文案 |
| 错误态 | 走 `PendingBanner`（401/403）+ `retry:false` | `bg-danger-soft/30` 内联条 |
| focus | 行 `<button>` 无 `focus-visible` 样式 | 同行 |

### 4.5 待核项

1. **PC `NotificationSettingsSheet.tsx` 全文 className 与全部文案** —— 只 grep 到片段（`space-y-4` / `border-t border-border pt-3 space-y-3` / `text-xs text-fg-subtle` / `mt-1 accent-brand` / `flex-1 min-w-0` / `text-sm` / `text-xs text-fg-subtle mt-0.5`）。**需确认**：读全文后与 web `BrowserNotificationCard` 的 5 个文案态逐条比对。
2. **PC `CategoryTabs.tsx` 的 tab className 与分类项文案** —— 只读到容器 `overflow-x-auto scrollbar-none`，内部走 `Tabs variant="underline"`（已知为 `flex gap-6 border-b border-border` + trigger 见 §3.2）。**需确认**：分类项是 `全部/系统/对话/知识库/交付` 还是英文 key。
3. **PC `CATEGORY_BAR` 的具体配色表** —— `NotificationItem.tsx:42-43` 引用了它，值未读到。**需确认**：读 `NotificationItem.tsx` 顶部常量。
4. **web 未读底色 `bg-brand-container/30` 是否为设计意图** —— `#4A1F0A` 30% 叠在 `#000` 上约 `#1b0e07`，比已读 `#0a0a0a` **更暗**；PC 统一 `#181818` 比 web 已读更亮。**需确认**：PM 判定「已读/未读」的基准亮度方向。

---

## 5. Profile

### 5.0 文件与规模

| | web | PC |
|---|---|---|
| 路径 | `src/app/(main)/profile/page.tsx` | `src/routes/Profile.tsx` |
| 行数 | 260 | 571 |
| 路由 | `/profile` | `/profile` |
| 页面标题 | `setHeaderTitle("我的")` | `resolveTitle("/profile")` → `"我的"` |

### 5.1 元素结构树

**web（`profile/page.tsx:170-265`）**

```
<div className="px-4 lg:px-8 py-6 max-w-2xl mx-auto">
  <div className="flex justify-end mb-4">
    <Button variant="ghost" size="sm" aria-label="编辑资料">编辑</Button>
  <div className="flex flex-col items-center mb-8">
    [loading] <div className="w-18 h-18 rounded-xl bg-bg-elevated animate-pulse"/>
    [有图]   <img width={72} height={72} className="w-18 h-18 rounded-xl object-cover"/>       ← 默认 cody_192.png
    <h1 className="text-2xl font-medium mt-3 text-center">{displayName}
    [email] <p className="text-xs text-fg-muted mt-1 opacity-70">{email}</p>
  <div className="space-y-2">
    <ProfileRow label="名字" value={displayName}/>
    <ProfileRow label="UID"  value={id||"—"} rightSlot={<CopyUidButton/>}/>
    <ProfileRow label="性别" value={genderText}/>
    <ProfileRow label="简介" value={bioText}/>
  <div className="mt-6">
    <AlertDialogTrigger asChild>
      <button className="w-full rounded-md bg-bg-elevated p-4 flex items-center gap-3 hover:bg-danger-soft/30 transition-colors duration-150 text-danger">
        <Trash2 className="w-5 h-5 shrink-0"/>
        <span className="flex-1 text-left text-base font-medium">注销账户</span>
    <AlertDialogContent>…</AlertDialogContent>
  <div className="mt-8 text-center text-xs text-fg-muted opacity-50">gacode-web · v0.1.0</div>
```

web `ProfileRow`（`:62-76`）/ `CopyUidButton`（`:89-109`）：

```
<Wrapper(div|button) className={cn("w-full rounded-md bg-bg-elevated p-4 flex justify-between items-center","transition-colors duration-150", interactive && "hover:bg-bg-base text-left")}>
  <span className="text-sm font-medium shrink-0">{label}</span>
  <span className="flex items-center gap-2 min-w-0">
    <span className="text-sm text-fg-muted truncate max-w-[200px]">{value}</span>
    {rightSlot | <ChevronRight className="w-4 h-4 text-fg-muted shrink-0"/>}
<button aria-label="复制 UID" className="shrink-0 w-7 h-7 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center">
  {copied ? <Check className="w-3.5 h-3.5 text-success"/> : <Copy className="w-3.5 h-3.5"/>}
```

**PC（`Profile.tsx:113-265`）**

```
<div className="min-h-full px-4 lg:px-8 py-6">
  <div className="max-w-2xl mx-auto space-y-6">
    <div className="flex items-center justify-end gap-2">
      <Button variant="ghost" size="sm">编辑</Button>
    <div className="flex flex-col items-center">
      <div className="relative">
        [loading] <div className="w-24 h-24 rounded-full bg-bg-elevated animate-pulse"/>
        [有图]   <img className="w-24 h-24 rounded-full object-cover"/>
        [无图]   <div aria-hidden className="w-24 h-24 rounded-full bg-brand/30 border border-brand/40 flex items-center justify-center text-fg text-2xl font-medium">{首字母}</div>    ← PC 独有
        <button aria-label="更换头像" disabled={isPending} className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-brand text-brand-on flex items-center justify-center hover:bg-brand-hover transition-colors duration-150 disabled:opacity-50"><CameraIcon/></button>   ← PC 独有
        <input type="file" accept="image/*" className="hidden"/>
      <h1 className="text-2xl font-medium mt-3 text-center">{displayName}
      <p className="text-sm text-fg-muted mt-1">@{username}</p>                            ← PC 独有
      [email] <p className="text-xs text-fg-subtle mt-1">{email}</p>
    <div className="rounded-md bg-bg-elevated divide-y divide-border">
      <UidRow/> <InfoRow label="邮箱"/> <InfoRow label="性别"/> <InfoRow label="简介"/> <InfoRow label="注册时间"/>
    <div className="space-y-2"> 6×<ActionRow/>: 编辑资料 / 修改密码 / 我的应用 / 头像设置 / 交付中心 / 设置   ← PC 独有（web 已删除）
    <div><Button variant="danger" size="lg" loading className="w-full">登出</Button></div>      ← PC 独有（web 已删除）
    <DeleteAccountRow/>  → 注销账户
  <ConfirmDialog> 确认登出?
```

PC `UidRow` / `InfoRow` / `ActionRow`（`:303-471`）：

```
<div className="flex items-center gap-4 px-4 py-3">
  <span className="w-20 text-sm text-fg-muted shrink-0">UID</span>
  <span className="flex-1 text-sm text-fg font-mono min-w-0 break-all">{uid}</span>
  <button aria-label="复制 UID" className="shrink-0 w-8 h-8 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center">{copied?<CheckIcon/>:<CopyIcon/>}</button>
<div className="flex items-center gap-4 px-4 py-3">
  <span className="w-20 text-sm text-fg-muted shrink-0">{label}</span>
  <span className={["flex-1 text-sm text-fg min-w-0 break-all", mono?"font-mono":""]}>{value}</span>
<button className="w-full rounded-md bg-bg-elevated p-4 flex items-center gap-3 text-left hover:bg-bg-sunken transition-colors duration-150">
  <span className="shrink-0 w-5 h-5 flex items-center justify-center">{icon}</span>
  <span className="flex-1 text-sm font-medium">{label}</span>
  <ChevronRightIcon/>
```

### 5.2 逐元素映射表

| 层级 | web className（原文） | PC className（原文） | 差异 |
|---|---|---|---|
| 页面外壳 | `px-4 lg:px-8 py-6 max-w-2xl mx-auto` | `min-h-full px-4 lg:px-8 py-6` + 内层 `max-w-2xl mx-auto space-y-6` | 一致（PC 拆两层 + 多 `space-y-6`） |
| 顶部操作区 | `flex justify-end mb-4` | `flex items-center justify-end gap-2` | 真差异：PC 缺 `mb-4`（改用 `space-y-6`）；PC 多 `items-center` `gap-2` |
| 编辑按钮 | `variant="ghost" size="sm" aria-label="编辑资料"` | `variant="ghost" size="sm"` | 一致（PC 缺 aria-label） |
| 头像外层 | 无（直接 img） | `relative` | PC 独有（承载相机按钮绝对定位） |
| 头像 loading | `w-18 h-18 rounded-xl bg-bg-elevated animate-pulse` | `w-24 h-24 rounded-full bg-bg-elevated animate-pulse` | **真差异：尺寸 72px(18×4) vs 96px(24×4)；圆角 `rounded-xl` vs `rounded-full`** |
| 头像（有图） | `w-18 h-18 rounded-xl object-cover` | `w-24 h-24 rounded-full object-cover` | **真差异：尺寸 + `rounded-xl` vs `rounded-full`** |
| 头像兜底 | **无**：web 缺图时用 `cody_192.png`（`profile/page.tsx:140`） | `w-24 h-24 rounded-full bg-brand/30 border border-brand/40 flex items-center justify-center text-fg text-2xl font-medium`（首字母） | **PC 独有兜底块；web 走资源兜底** |
| 换头像按钮 | 无 | `absolute bottom-0 right-0 w-8 h-8 rounded-full bg-brand text-brand-on flex items-center justify-center hover:bg-brand-hover transition-colors duration-150 disabled:opacity-50` | **PC 独有** |
| 用户名 | `text-2xl font-medium mt-3 text-center` | `text-2xl font-medium mt-3 text-center` | **一致** ✅ |
| `@username` 行 | 无 | `text-sm text-fg-muted mt-1` | **PC 独有** |
| email 行 | `text-xs text-fg-muted mt-1 opacity-70` | `text-xs text-fg-subtle mt-1` | **真差异：前景色 `text-fg-muted`(#9ca3af) vs `text-fg-subtle`(#6c757d)；PC 缺 `opacity-70`** |
| 信息卡容器 | `space-y-2`（**每行独立卡片**） | `rounded-md bg-bg-elevated divide-y divide-border`（**单卡 + 分隔线**） | **真差异（结构）：web 4 张独立圆角卡上下排列；PC 1 张大卡内部 `divide-y` 分隔 → web 去线化、PC 仍是线条分隔** |
| 行容器 | `w-full rounded-md bg-bg-elevated p-4 flex justify-between items-center transition-colors duration-150` (+`hover:bg-bg-base text-left` 当可点) | `flex items-center gap-4 px-4 py-3` | **真差异：内距 `p-4` vs `px-4 py-3`；对齐 `justify-between` vs `gap-4`；PC 行无独立底色（靠父卡）** |
| 行 label | `text-sm font-medium shrink-0`（在左） | `w-20 text-sm text-fg-muted shrink-0`（固定 80px 宽，在左） | **真差异：PC label 用 `text-fg-muted` 次级色，web 用 `font-medium` 主色；PC 加 `w-20` 定宽** |
| 行 value | `text-sm text-fg-muted truncate max-w-[200px]` | `flex-1 text-sm text-fg min-w-0 break-all` | **真差异：颜色 `text-fg-muted` vs `text-fg`（PC 更亮）；截断 `truncate max-w-[200px]` vs `break-all` 硬换行** |
| 行尾箭头 | `<ChevronRight className="w-4 h-4 text-fg-muted shrink-0"/>`（仅可点行） | 无（`InfoRow` 无箭头；`ActionRow` 有 `ChevronRightIcon`） | 一致（PC 的箭头在 ActionRow） |
| UID 值 | `text-sm text-fg-muted truncate max-w-[200px]` | `flex-1 text-sm text-fg font-mono min-w-0 break-all` | 真差异：PC 加 `font-mono` |
| 复制按钮 | `shrink-0 w-7 h-7 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center` | `shrink-0 w-8 h-8 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center` | **真差异：`w-7 h-7`(28px) vs `w-8 h-8`(32px)** |
| 复制成功图标 | `<Check className="w-3.5 h-3.5 text-success"/>` | `<CheckIcon/>`（尺寸/颜色待核，`CheckIcon` 定义在 `Profile.tsx:485+`，本次未读） | 待核 |
| 复制 toast | `UID 已复制` (default) / `UID 不可用` (warning) / `复制失败` (danger) | `UID 已复制` (success) / `UID 暂不可用` (warning) / `复制失败,请手动选中复制` (warning) | **真差异：web default 变体，PC success 变体；PC 文案更长** |
| 6 个功能入口 | **无**（web 顶部注释 `:38` 明确「已删除: 头像设置 · 交付中心 · 设置 · 我的应用」） | `space-y-2` > 6×`<button className="w-full rounded-md bg-bg-elevated p-4 flex items-center gap-3 text-left hover:bg-bg-sunken transition-colors duration-150">` + `shrink-0 w-5 h-5 flex items-center justify-center` + `flex-1 text-sm font-medium` + `ChevronRightIcon` | **PC 独有 6 个入口（编辑资料/修改密码/我的应用/头像设置/交付中心/设置）。「设置」点了只 toast `设置中心将在后续版本上线`** |
| 登出按钮 | **无** | `<Button variant="danger" size="lg" loading className="w-full">登出</Button>` + `ConfirmDialog` `确认登出?` / `登出后需要重新登录才能继续使用。` / `确认登出` | **PC 独有** |
| 注销账户触发 | `w-full rounded-md bg-bg-elevated p-4 flex items-center gap-3 hover:bg-danger-soft/30 transition-colors duration-150 text-danger` + `<Trash2 className="w-5 h-5 shrink-0"/>` + `flex-1 text-left text-base font-medium` | `w-full rounded-md border border-danger/30 bg-danger/5 p-4 flex items-center gap-3 text-left hover:bg-danger/10 transition-colors duration-150 text-danger` + `<TrashIcon/>` + `flex-1 text-sm font-medium` + `ChevronRightIcon` | **真差异：web 无边框 + hover `bg-danger-soft/30`；PC 有 `border-danger/30` + `bg-danger/5` + hover `bg-danger/10`（**PC 更淡**）；字号 `text-base` vs `text-sm`；PC 多尾部箭头** |
| 注销确认标题 | `确定要注销账户吗?` | `确定要注销账户吗?` | 一致 ✅ |
| 注销确认正文 | `注销后, 你的所有数据(账户、会话、知识库、设置)将被永久删除, 且无法恢复。此操作不可撤销, 请确认要继续。` | `注销后,你的所有数据(账户、会话、知识库、设置)将被永久删除,且无法恢复。此操作不可撤销。` | 语义同，PC 少「请确认要继续」 |
| 注销二次校验 | **无**（直接点确认） | 需输入用户名：`block text-sm text-fg-muted` + `请输入你的用户名 <span className="font-mono text-fg">{username}</span> 以确认操作` + `<Input>` + 错误 `text-xs text-warning` `用户名不匹配,请准确输入` | **PC 独有（更严格）** |
| 确认按钮 | `我确定, 注销` / pending `正在注销...` | `我确定,注销`（**无空格**）/ pending `正在注销...` | **真差异：逗号后空格** |
| 页脚版本号 | `mt-8 text-center text-xs text-fg-muted opacity-50` + `gacode-web · v0.1.0` | **不存在** | **PC 缺** |

### 5.3 文案对照

| 位置 | web | PC | 一致 |
|---|---|---|---|
| 编辑按钮 | `编辑` | `编辑` | 一致 ✅ |
| 信息行 label | `名字` `UID` `性别` `简介` | `UID` `邮箱` `性别` `简介` `注册时间` | **否：web 首行是「名字」，PC 无「名字」行；PC 多「邮箱」「注册时间」行** |
| UID 兜底 | `—`（em dash） | `-`（连字符） | **否** |
| 性别兜底 | `保密` | `保密` | 一致 ✅ |
| 简介兜底 | `未设置` | `未设置` | 一致 ✅ |
| 用户名兜底 | `User` | `User`（`Profile.tsx:105`） | 一致 ✅ |
| 注销按钮 | `注销账户` | `注销账户` | 一致 ✅ |
| 注销确认标题 | `确定要注销账户吗?` | `确定要注销账户吗?` | 一致 ✅ |
| 注销确认按钮 | `取消` / `我确定, 注销` / `正在注销...` | `取消` / `我确定,注销` / `正在注销...` | **否（空格）** |
| 注销成功 toast | `账户已注销` + desc `你的所有数据已永久删除` (default) | `账户已注销,你的所有数据已永久删除` (success) | 格式不同 |
| 注销失败 toast | `注销失败` + desc (danger) | `注销失败: {err}` (danger) | 格式不同 |
| 页脚 | `gacode-web · v0.1.0` | 无 | **PC 缺** |
| PC 独有文案 | — | `编辑资料` `修改密码` `我的应用` `头像设置` `交付中心` `设置` `设置中心将在后续版本上线` `登出` `确认登出?` `登出后需要重新登录才能继续使用。` `请输入你的用户名 … 以确认操作` `用户名不匹配,请准确输入` | PC 独有 |
| web 独有文案 | `gacode-web · v0.1.0` | — | web 独有 |

### 5.4 交互态对照

| 状态 | web | PC |
|---|---|---|
| ProfileRow hover | `hover:bg-bg-base`（仅 interactive 行） | 不适用（`InfoRow` 无 hover） |
| ActionRow hover | 不适用 | `hover:bg-bg-sunken` |
| 注销行 hover | `hover:bg-danger-soft/30` | `hover:bg-danger/10` |
| 复制按钮 hover | `hover:bg-bg-sunken hover:text-fg` | `hover:bg-bg-sunken hover:text-fg` | **一致** ✅ |
| 复制按钮 copied | `<Check className="w-3.5 h-3.5 text-success"/>`（1.5s 后复原，`profile/page.tsx:84-86`） | `<CheckIcon/>`（1.5s 后复原，`Profile.tsx:277-281`） | 逻辑一致 |
| 复制失败 fallback | toast `复制失败` (danger) | toast `复制失败,请手动选中复制` (warning)，**无手动选中文本兜底**（仅 toast） | **PC 缺兜底实现**（注释称「选中文本让用户手动复制」但代码未实现） |
| 头像 loading | `animate-pulse` | `animate-pulse` | 一致 |
| 换头像 disabled | 不适用 | `disabled:opacity-50` |
| 注销按钮 disabled | `disabled={deleting}`（AlertDialogAction） | `ConfirmDialog loading={deleteMutation.isPending}` | 一致 |
| 空态 | 不适用（无空态分支） | 不适用 |
| 错误态 | toast | toast |

### 5.5 待核项

1. **PC `CheckIcon` / `CopyIcon` / `TrashIcon` / `ChevronRightIcon` 的 className** —— 定义在 `Profile.tsx:485+`，本次未读。**需确认**：读 `Profile.tsx:485-571` 补 §5.2。
2. **web 是否也应补「修改密码 / 我的应用」入口** —— web `profile/page.tsx:38` 注释写「已删除」，但 web 仓**存在** `src/app/(main)/profile/apps/page.tsx` 与 `profile/edit/page.tsx`（路由存在）。**需确认**：web 是否有 change-password 页；若有而 Profile 无入口，属 web 自身缺口，不该由 PC 单方面回退。
3. **web「名字」行 vs PC 无该行** —— PC 的 `displayName` 已在头像下方居中展示。需 PM 判定 web 的「名字」行是否算冗余。
4. **PC 头像 96px vs web 72px** —— 需 PM 判定目标尺寸（web 注释 `profile/page.tsx:35` 写「头像 72px (22dp squircle / rounded-xl)」，PC 用 `rounded-full` 与该注释冲突）。
5. **PC `divide-y divide-border` 分隔线是否违反「去线化」方向** —— web 侧 2026-10-17 明确在 Library/Notifications 走「去线化」，Profile 的信息卡也改成了独立卡片。**需确认**：PC Profile 是否需同步去线化。

---

## 6. 待核项汇总（总计 **21** 项）

| # | 页 | 待核内容 | 需确认什么 / 去哪确认 |
|---|---|---|---|
| 1 | 全局 | `tailwind.config` 非逐字节一致 | 已核实：仅 `content` glob + 注释差异，颜色 token 全同。**无需再核**，仅修正任务书表述 |
| 2 | 全局 | `surface-container` token 两端都不存在 | 已核实：grep 命中 0/0。web `library/page.tsx:694/701/714/722/748/755` 用的是死类。**需 PM 决定**：是否在 web 修，或 PC 不要照抄 |
| 3 | 全局 | `gagaos-spinner` 类定义 | `Button.tsx:76` 使用但不在 tailwind.config。**需确认**：`src/styles/*.css` 内是否有定义 |
| 4 | 全局 | `borderRadius` 被 config 覆写（sm=12/md=16/lg=20/xl=22） | 影响 `rounded-lg`/`rounded-xl` 的实际 px。**需确认**：读两份 `tailwind.config.ts` 的 `borderRadius` 段并比对 |
| 5 | 全局 | web `(main)` Header 的 `border-b` 是否要 PC 补 | `AppShell.tsx:283` 无 `border-b`，web `(main)/layout.tsx:174` 有。**需 PM 拍板** |
| 6 | 全局 | PC `/chat` 标题返回 `"Gacode"` | `AppShell.tsx:36-51` 无 `/chat` 精确分支。**需确认**：加 `"对话列表"` |
| 7 | Home | PC Home placeholder 实际文案 | Home.tsx 未传。**需确认**：`components/chat/ChatInputBar.tsx:578-582` 默认值是否要改成 `说点什么…` |
| 8 | Home | sticky 顶部条是否恢复 | web `page.tsx:277`；PC 0.7.6 主动删。**需 PM 拍板** |
| 9 | Home | PC 头像是否改用 `cody_512.png` | PC 注释明确不引外部资源。**需 PM 拍板** |
| 10 | Home | 未登录态是否算 PC 缺口 | PC 由 `Protected` 重定向（`App.tsx:71-73`）。**需 PM 确认** |
| 11 | ChatList | web `DropdownMenuContent` / `DropdownMenuItem` className | 未读 `src/components/ui/dropdown-menu.tsx` |
| 12 | ChatList | web `Card` 圆角实际 px | 依赖第 4 项 |
| 13 | ChatList | PC `AppShell` 是否补 `/chat` 标题分支 | 同第 6 项 |
| 14 | ChatList | web 是否真的没有搜索功能 | 读 `chat/page.tsx` 全文未见。**需 PM 判定** PC 超前 vs web 漏实现 |
| 15 | Library | PC `DropdownMenu.tsx` className | 未读 `src/components/ui/DropdownMenu.tsx` |
| 16 | Library | PC `MultiSelectToolbar.tsx` 按钮 className / 文案 | 只读到容器（`:45-49`） |
| 17 | Library | web `library/page.tsx:614-812` 未读 | 含批量删除确认文案、EditSheet 内容、收集 Sheet |
| 18 | Library | PC `CollectSheet` / `EditSheet` className | 未读；超出本批范围，待 PM 是否扩展 |
| 19 | Notifications | PC `NotificationSettingsSheet.tsx` 全文 | 只 grep 到片段；需与 web `BrowserNotificationCard` 5 个文案态比对 |
| 20 | Notifications | PC `CategoryTabs.tsx` 分类项文案 | 只读到容器 |
| 21 | Notifications | PC `NotificationItem.tsx` 的 `CATEGORY_BAR` 配色表 | 常量在文件顶部，未读 |
| 22 | Profile | PC `Profile.tsx:485-571` 图标 className | 未读 |
| 23 | Profile | web 是否有 change-password 页 | web 存在 `profile/edit` 与 `profile/apps`，未见 change-password。**需确认** |
| 24 | Profile | PC `divide-y` 是否违反去线化方向 | **需 PM 拍板** |
| 25 | Profile | PC 头像 96px/rounded-full vs web 72px/rounded-xl | **需 PM 拍板** |

（上表 25 行中，第 1/2/3/4 项已在本次会话内核实完毕，结论见各节；其余 21 项为**仍未核实**的开放项。）

---

## 7. 本轮已核实的「任务书错误」

| 任务书表述 | 实测 |
|---|---|
| 「`tailwind.config.ts` 两边**逐字节一致**」 | **错**。SHA256 不同（261 vs 255 行），差异在 `content` glob 与注释排版；**颜色 token 值逐字段相同**，结论方向对但表述错 |
| 「web 的 home 是 `src/app/page.tsx`」 | **对**。已 Test-Path 确认存在（538 行） |
| 「web `src/app/(main)/home/page.tsx` 根本不存在」 | **对**。`(main)` 下无 home 页 |
| 「PC 已把 Login/Register 主 CTA 改成 `bg-foreground text-background`（web auth 也是这个）」 | **本批 5 页内不适用**。但需注意：PC `components/ui/Button.tsx:27` 的 `variant="default"` 仍是 `bg-brand text-brand-on`，**与 web `Button` default（`bg-primary text-primary-foreground`）同色同语义**，不是缺口 |
| 「Library/Notifications 卡片已改 `rounded-2xl`」 | **对但不完整**。`Library.tsx:459` 空态、`LibraryCard.tsx:115` 卡片、`Notifications.tsx:352` 空态、`NotificationItem.tsx:50` 行卡均已 `rounded-2xl` ✅；但 **Library 多选条 `MultiSelectToolbar.tsx:45` 仍是 `bg-bg-elevated border-t border-border`（未对齐 web 的 `bg-bg-base/95 backdrop-blur` 去线化）** |
---
---

# 批 2：ChatDetail / LibraryDetail / Deliveries / DeliveryDetail / Browser / ProfileEdit / ProfileApps / Login / Register / QrLogin

> 本节由 **Read 源码逐行抄录**产出，不含推测。承接批 1（§0–§7）。
> web：`D:\gaga\gaclaw-project\gacode-web\`；PC：`D:\gaga\gaclaw-project\gacode-electron\`
> 产出日期：2026-10-21
> 范围：10 页 + 批 1 遗留的 6 个 PC 组件。**排除 schedule**（web 也没上线）。

### 批 2 全局前提（0.4 续）

**`borderRadius` 两端逐字段相同**（补上批 1 §6 第 4 项的待核，结论：已核实一致）：

| key | web `tailwind.config.ts:146-154` | PC `tailwind.config.ts:137-145` |
|---|---|---|
| `sm` | `12px` | `12px` |
| `DEFAULT` | `8px` | `8px` |
| `md` | `16px` | `16px` |
| `lg` | `20px` | `20px` |
| `xl` | `22px` | `22px` |
| `2xl` | `24px` | `24px` |
| `squircle` | `22px`（别名→xl） | `22px`（别名→xl） |

**推论（对全批 10 页成立）**：`rounded-md`(16px) vs `rounded-xl`(22px) 是**真差异（6px）**，不是命名差异。批 1 §0.2 的「同色不同名不算差异」结论**只适用于颜色 token，不适用于圆角**。

---

## 6. ChatDetail

### 6.0 文件与规模

| | web | PC |
|---|---|---|
| 路径 | `src/app/(main)/chat/[id]/page.tsx` | `src/routes/ChatDetail.tsx` |
| 行数 | **1422** | **1275** |
| 路由 | `/chat/[id]` | `/chat/:id` |
| 外壳 header | `(main)/layout.tsx` 渲染 `sticky top-0 z-30 ... h-14` + 返回 + 标题 | **`AppShell.tsx:121-123` 对 `startsWith("/chat/")` 直接不渲染外层 header**，由页面自管 |
| 标题来源 | `useUIStore.setHeaderTitle(currentChat?.title \|\| "新对话")`（`page.tsx:342-345`） | 页面内 `title` state → 自管 header（`ChatDetail.tsx:1028-1030`） |
| 页面自有头部 | **无** | 有 `shrink-0 h-12 bg-bg-elevated px-4 flex items-center justify-between gap-2` |

**外壳差异（单列，不混进元素级）**：web 走全局 header（`h-14` + `border-b` + 返回键），PC 对 `/chat/*` 主动砍掉外层 header、改用页面内 `h-12` 自管头。依据 `AppShell.tsx:118-120` 注释（「会同时出现两层」）。**判定：PC 主动决策，两端高度也不同（56px vs 48px）。需 PM 拍板是否接受双标准。**

### 6.1 元素结构树

**web（`page.tsx:1203-1421`，单分支）**

```
<div className="flex flex-col h-full">
  <WebNotificationPrompt chatId/>                       ← 自身 return null
  <div className="flex-1 overflow-y-auto p-4">
    <MessageList chatId isLoading streamingMessageId canRecall onRecall onDelete
                 onSaveToKnowledge stripImageUrls onGatewayConnected/>
  {streamingError && <StreamingErrorBanner message={describeStreamingError(kind,raw)} .../>}
  {snackbarMsg && <div className="mx-auto max-w-3xl px-4 pb-2">
     <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive text-center">{snackbarMsg}</div></div>}
  {attachments.length>0 && <div className="mx-auto max-w-3xl w-full px-4 pb-2">
     <div className="flex flex-wrap gap-2">
       uploading→<ProgressBar/>  done→<AttachmentChip/>  error→<UploadErrorChip/></div></div>}
  {attachedKnowledgeRefs.length>0 && <div className="mx-auto max-w-3xl w-full px-4 pb-2">
     <div className="flex flex-wrap gap-2">
       <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-brand-cyan/40 bg-brand-cyan/10 text-xs text-brand-cyan">
         <span className="font-medium">📚</span>
         <span className="max-w-[160px] truncate"/>
         <button className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded text-brand-cyan/70 hover:text-brand-cyan hover:bg-brand-cyan/20 transition-colors">×</button>
       </span></div></div>}
  <ChatInput ref onSend onAbort onPlusClick isStreaming disabled/>
  <ApprovalBanner requests={pendingApprovals} onAction/>
  <SheetActionMenu/> <EmojiPicker/> <LibraryPicker/> <MediaPicker/>
```

**PC（`ChatDetail.tsx:1024-1239`，单分支）**

```
<div className="h-full flex flex-col bg-bg-base">
  <div className="shrink-0 h-12 bg-bg-elevated px-4 flex items-center justify-between gap-2">
    <div className="flex-1 min-w-0 truncate font-medium text-sm">{title}</div>
    <ModelChips active onChange disabled={isStreaming}/>
    <DropdownMenu align="right" items={headerMenuItems}
      trigger={<button aria-label="对话操作" className="w-9 h-9 inline-flex items-center justify-center rounded hover:bg-bg-sunken text-fg-muted hover:text-fg transition-colors duration-150"/>}/>
  <ChatTopBanner/>
  {streamError && <StreamingErrorBanner kind message onRetry onDismiss/>}
  <div className="flex-1 min-h-0">
    {historyQuery.isLoading
      ? <div className="h-full flex items-center justify-center text-fg-muted text-sm">加载历史消息…</div>
      : <MessageList messages streamingAssistantId onMessageAction/>}
  <ApprovalBanner requests sessionId={chatId} onClear onError/>
  <DeliverableStrip items/>
  {pendingKnowledgeRefs.length>0 && <div className="shrink-0 px-3 py-1.5 bg-bg-elevated border-t border-border">
     <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-bg-sunken text-[11px] text-fg-muted">📚 已挂载 ×{n}</span></div>}
  <ChatInputBar ref isStreaming canRerun onRerun onStop onSubmit onPlusClick onSlashCommand onAttachmentError/>
  <PlusActionsSheet/> <EmojiPicker/> <KnowledgeAttachSheet/>
  <input type="file" hidden accept=… capture="environment" data-testid="file-input-camera"/>  ×3
  {waitingFirstFrame && isStreaming && <span className="sr-only" aria-live="polite">等待流式首帧…</span>}
  {confirmDeleteOpen && <ConfirmDialog title="删除对话" message={`确认删除对话 "${title}"? 此操作无法撤销。`}
                       confirmLabel="删除" cancelLabel="取消" confirmVariant="danger" loading/>}
  {renameOpen && <ConfirmDialog title="重命名对话" message="为这个对话设置一个新标题。"
                     confirmLabel="保存" cancelLabel="取消" loading>
                   <Input maxLength={64} placeholder="输入新标题" autoFocus/></ConfirmDialog>}
```

**PC 独有元素（web 无）**：`ModelChips`（顶部模型切换）、`ChatTopBanner`（断网/网关版本 banner）、`DeliverableStrip`（交付物缩略条）、`ConfirmDialog`×2（删除/重命名）、`SlashMenu`（`/` 命令）、`canRerun` 重生成按钮、3 个隐藏 file input（image/document/camera）。
**web 独有元素（PC 无）**：`snackbarMsg` 红色条、`WebNotificationPrompt`、附件三态 chip（PC 把三态搬进 `ChatInputBar` 内部 `:507-547`）、`LibraryPicker` 多选 ref chip（PC 是 `KnowledgeAttachSheet`）。

### 6.2 逐元素映射表

| 层级 | web className（原文） | PC className（原文） | 差异 |
|---|---|---|---|
| 根容器 | `flex flex-col h-full` | `h-full flex flex-col bg-bg-base` | 仅 PC 多 `bg-bg-base`（web 靠 `main` 底色）。可接受 |
| 自有头部容器 | **不存在** | `shrink-0 h-12 bg-bg-elevated px-4 flex items-center justify-between gap-2` | 真差异（PC 独有） |
| 标题 | 外层 header `text-base font-medium` | `flex-1 min-w-0 truncate font-medium text-sm` | **字号 `text-base`(16px) vs `text-sm`(14px)** |
| ⋮ 触发器 | **不存在** | `w-9 h-9 inline-flex items-center justify-center rounded hover:bg-bg-sunken text-fg-muted hover:text-fg transition-colors duration-150` | 真差异；PC 用 `rounded`(8px)，web 全局返回键是 `rounded-full` |
| 消息滚动区 | `flex-1 overflow-y-auto p-4` | `flex-1 min-h-0`（内层 `MessageList` 自己 `h-full overflow-y-auto px-4 py-6 space-y-3`） | 真差异：**PC 多 `min-h-0`**（flex 子项滚动必需）；PC 滚动器在 MessageList 内 |
| 消息列表容器 | `max-w-3xl mx-auto space-y-4` | `relative h-full` > `h-full overflow-y-auto px-4 py-6 space-y-3` | 真差异：**间距 `space-y-4` vs `space-y-3`**；PC 多 `aria-label="消息列表"` + 「↓ 跳到底」浮动按钮 `absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-bg-elevated text-fg shadow-elevation-2 px-3 py-1.5 text-xs hover:bg-bg-sunken`（web 无） |
| 加载态 | 4 个 Skeleton：`h-20 w-3/4 rounded-2xl` / `h-16 w-1/2 rounded-2xl` / `h-24 w-2/3 rounded-2xl` / `h-12 w-1/3 rounded-2xl` | 单行文字 `h-full flex items-center justify-center text-fg-muted text-sm`「加载历史消息…」 | **真差异：web 有骨架屏、PC 只有纯文字。** 高刺眼 |
| 空态 | **不存在**（`chatMessages.length===0` 时 MessageList 渲染空 div） | `h-full flex items-center justify-center text-fg-muted text-sm`「暂无消息 — 在底部输入框开始你的第一条消息」 | 真差异：PC 有空态文案，web 空白屏 |
| 错误 banner | `<StreamingErrorBanner>`（web 组件） | `<StreamingErrorBanner>`（PC 组件） | 见 6.2b |
| snackbar | `mx-auto max-w-3xl px-4 pb-2` > `rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive text-center` | **不存在**（改用 toast + StreamingErrorBanner） | 真差异 |
| 知识库 chip 容器 | `mx-auto max-w-3xl w-full px-4 pb-2` > `flex flex-wrap gap-2` | `shrink-0 px-3 py-1.5 bg-bg-elevated border-t border-border` | **真差异：PC 加了底色+上边框色带，web 透明** |
| 知识库 chip 本体 | `inline-flex items-center gap-1 px-2 py-1 rounded-md border border-brand-cyan/40 bg-brand-cyan/10 text-xs text-brand-cyan` + 可单独 `×` 移除 | `inline-flex items-center gap-1 px-2 py-1 rounded-md bg-bg-sunken text-[11px] text-fg-muted` | **真差异：PC 丢 brand-cyan 配色 + 丢边框 + 无逐条移除按钮** |
| 知识库 chip 文案 | 每条显示 `title \|\| id`，逐条可删 | 汇总成 `📚 已挂载 ×{n}` | 真差异 |
| 输入区外壳 | `border-t border-border p-4 bg-background` > `max-w-3xl mx-auto`（在 `ChatInput.tsx:64-65`） | `px-4 pb-4 pt-2`（在 `ChatInputBar.tsx:502`），**无 border-t、无底色、无限宽** | **真差异：PC 缺 `border-t border-border`、缺 `bg-background`、缺 `max-w-3xl mx-auto`** |
| `+` 按钮 | `shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center` | `shrink-0 h-9 w-9 rounded-md bg-bg-sunken text-fg-muted hover:bg-bg-elevated hover:text-fg disabled:opacity-50 disabled:pointer-events-none inline-flex items-center justify-center transition-colors duration-150` | 真差异：**`rounded-full` vs `rounded-md`**；PC 多常驻 `bg-bg-sunken`；**hover 底色相反** |
| textarea | `flex-1 bg-transparent text-fg placeholder:text-fg-subtle outline-none text-base leading-6 resize-none max-h-32 py-2 disabled:opacity-60`（透明底，字号 16px） | `w-full resize-none bg-bg-sunken border border-border rounded-md px-3 py-2 text-sm leading-6 placeholder:text-fg-subtle focus:outline-none focus:border-brand disabled:opacity-70 max-h-32 overflow-y-auto [scrollbar-width:none]` | **真差异（多项）**：字号 16 vs 14；web 透明底 vs PC `bg-bg-sunken` + 常驻 border；PC 多隐藏滚动条 |
| 输入卡 focus | `bg-bg-elevated rounded-md px-4 py-3 flex items-end gap-2` + `border border-transparent` + `focus-within:border-border` | **无卡片层**（PC 0.7.6 主动删，注释「不再垫底板」） | 真差异（PC 主动决策） |
| 发送按钮 | `rounded-full bg-brand text-brand-on hover:bg-brand-hover`（`rounded-full`） | `rounded-md bg-brand text-brand-on hover:bg-brand-hover active:bg-brand-active disabled:opacity-40` | 真差异：**`rounded-full` vs `rounded-md`**；PC 多 `active:` |
| 停止按钮 | `rounded-full bg-danger text-white hover:bg-danger/90 transition-colors duration-150 inline-flex items-center justify-center` | `rounded-md bg-danger text-white hover:bg-danger/90 active:opacity-80 transition-colors duration-150` | 真差异：`rounded-full` vs `rounded-md`；PC 多 `active:opacity-80` |
| 重生成 | **不存在** | `rounded-md bg-brand text-brand-on ... data-testid="rerun-button"`（`canRerun && onRerun` 时取代发送键） | PC 独有 |

### 6.2b 子组件对照：`ApprovalBanner`（两端都是真差异，且方向相反）

| 层级 | web `components/chat/ApprovalBanner.tsx` | PC `components/chat/ApprovalBanner.tsx` | 差异 |
|---|---|---|---|
| 外层 | `mx-auto max-w-3xl w-full px-4 pb-2` | `shrink-0 mx-3 mb-2 rounded-md border bg-bg-elevated shadow-dialog p-3 space-y-2` + 风险色 `border-danger/50` / `border-warning/50` / `border-border` | **真差异：web 无卡片底，PC 有卡片底；宽度限幅 `max-w-3xl` 只 web 有** |
| 内卡 | `rounded-xl border border-red-500/40 bg-red-500/5 shadow-lg p-3` | （即上格的外层本身） | **真差异：`rounded-xl`(22) vs `rounded-md`(16)；阴影 `shadow-lg` vs `shadow-dialog`** |
| 风险配色 | **裸调色板** `bg-red-500/20 text-red-600` / `bg-orange-500/20 text-orange-600` / `bg-green-500/20 text-green-600`（`RISK_STYLES`，`:32-36`） | **设计 token** `bg-danger` / `bg-warning` / `bg-success`（`:100-107`） | **重大真差异：web 绕过了 tailwind token，用 Tailwind 默认色板** |
| 标题 | `待审批` / `待审批 (N)` + `工具调用需要你确认` | `工具需要你的授权` / `N 个工具正在等待你的授权` | 文案不同 |
| 风险徽章 | 有 `RiskBadge`（`高风险/中风险/低风险`，`text-[10px] font-medium rounded px-1.5 py-0.5`） | **无徽章**，改用标题行左侧 2px 圆点 `inline-block w-2 h-2 rounded-full` | 真差异 |
| detail 折叠 | `mt-2 px-2 py-1 rounded bg-bg-elevated/60 text-xs text-fg-muted line-clamp-3`，**截断 180 字** | `<pre>` `font-mono text-[11px] text-fg-muted whitespace-pre-wrap ... bg-bg-sunken/40 rounded px-2 py-1.5 max-h-24 overflow-y-auto`，**截断 600 字** | 真差异：标签 `div` vs `pre`；180 vs 600 |
| 按钮组 | `grid grid-cols-4 gap-1.5 mt-3` | `grid grid-cols-2 sm:flex sm:flex-wrap gap-2 pt-1` | 真差异：**4 列 vs 2 列**（PC 窄屏折 2 列） |
| 拒绝 | `variant="outline"` + `text-red-600 border-red-500/60 hover:bg-red-500/10` | `flex-1 min-w-[80px] h-9 rounded-md border border-danger/60 bg-danger-soft/40 text-danger text-sm hover:bg-danger-soft/70 active:opacity-80 disabled:opacity-50 disabled:pointer-events-none` | 真差异（token vs 裸色） |
| 同意一次 / 本次会话 | `variant="secondary"` | `bg-bg-sunken text-fg text-sm hover:bg-bg-sunken/70` | 真差异 |
| 永久 | `variant="default"` + 文案 **`永久`** | `bg-brand text-brand-on` + 文案 **`永久允许`** | 文案不同 |
| 失败语义 | 父层 toast `审批提交失败` | 组件内 `onError` → toast `审批失败: {msg}` + **失败也 `onClear()` 清 banner** | 行为差异 |

### 6.2c 子组件对照：PC 独有气泡内组件（web 对应物未读，见 6.5）

| PC 组件 | 关键 className（原文） |
|---|---|
| `CallTreeCard.tsx:63-66` | `my-1 rounded-md bg-bg-sunken/60 border border-border px-3 py-2 text-xs`；标题行 `flex items-center gap-1.5 text-fg-muted mb-1` + `font-mono`「调用链路」+ `ml-1 text-fg-subtle`「{n} 步」；行 `flex items-center gap-1.5 py-0.5` + `style={{marginLeft: depth*14}}`；展开钮 `w-4 h-4 inline-flex items-center justify-center text-fg-muted hover:text-fg`；状态 `text-[10px] text-warning`「运行中…」/ `text-[10px] text-danger`「失败」 |
| `ReferenceFold.tsx:27-38` | `mt-1.5 rounded-md border border-border bg-bg-sunken/60 text-xs`；toggle `w-full flex items-center gap-1.5 px-2.5 py-1.5 text-left text-fg-muted hover:text-fg transition-colors duration-150`；文案 `📚` + `font-medium`「引用了 {n} 条知识库」+ `ml-auto`「▾/▸」；展开 `px-2.5 pb-1.5 space-y-0.5 text-[11px] text-fg-muted break-all` |
| `ExecutionTiming.tsx` | 已定位文件（68 行），本批**未读内容** → 见 6.5 待核 |

### 6.3 文案对照

| 位置 | web 文案 | PC 文案 | 一致 |
|---|---|---|---|
| 加载 | （骨架屏，无文字） | `加载历史消息…` | 否 |
| 空态 | 无 | `暂无消息 — 在底部输入框开始你的第一条消息` | 否 |
| 输入 placeholder（非流式） | `说点什么… (Enter 发送，Shift+Enter 换行)` | `说点什么… (Enter 发送, Shift+Enter 换行 · 输入 / 触发命令菜单)` | **否（PC 多「输入 / 触发命令菜单」）** |
| 输入 placeholder（流式） | `AI 正在回复...` | `正在流式生成… 完成后再发下一条` | 否 |
| caption | `生成中 · 点击停止按钮中断` / `AI 生成内容请核实重要信息` | **不存在**（PC ChatInputBar 无 caption 节点） | 否 |
| 停止按钮 aria | `停止生成` | `停止生成` | 一致 |
| 重生成 aria | 不存在 | `重新生成最后一条回复` | 否 |
| 删除确认标题 | （web ChatDetail 无删除对话框） | `删除对话` | 否 |
| 删除确认正文 | — | `确认删除对话 "{title}"? 此操作无法撤销。` | — |
| 删除确认按钮 | — | `删除` / `取消` | — |
| 重命名标题 | — | `重命名对话` | — |
| 重命名正文 | — | `为这个对话设置一个新标题。` | — |
| 重命名 placeholder | — | `输入新标题` | — |
| 重命名空值提示 | — | `标题不能为空`（toast warning） | — |
| 审批标题 | `待审批` / `工具调用需要你确认` | `工具需要你的授权` | 否 |
| 审批永久按钮 | `永久` | `永久允许` | 否 |
| 首帧等待 | 无 | `等待流式首帧…`（`sr-only`） | 否 |

### 6.4 交互态对照

| 状态 | web | PC |
|---|---|---|
| `+` hover | `hover:bg-bg-sunken` | `hover:bg-bg-elevated hover:text-fg`（**底色相反**） |
| `+` disabled | 无 | `disabled:opacity-50 disabled:pointer-events-none` |
| 输入卡 focus | `focus-within:border-border` | 无卡片层 |
| textarea focus | 父级 `focus-within` | `focus:outline-none focus:border-brand` |
| 发送 disabled | （web 无独立 disabled 视觉；`canSend` 逻辑在组件内） | `disabled:opacity-40 disabled:pointer-events-none` |
| 整卡 disabled | `disabled && !isStreaming && "opacity-60"` | 无（仅 textarea `disabled:opacity-70`） |
| streaming | 卡片 `border-brand/40` + caption `text-brand` | 无卡片色变；stop 键 `bg-danger` |
| 拖拽上传 | 无（web 无全屏 drag 层） | 全屏 `pointer-events-none fixed inset-0 z-[200] flex items-center justify-center` + `absolute inset-3 rounded-md border-2 border-dashed border-brand bg-brand/10 backdrop-blur-sm` + `rounded-md bg-bg-elevated border border-brand/60 px-6 py-4 shadow-dialog`，文案「拖入文件上传」/「图片自动按 image 上传, 其他文件按 document」 |
| 加载态 | 骨架屏 | 文字 |
| 空态 | 无 | 有 |
| 错误态 | StreamingErrorBanner + snackbar + toast | ChatTopBanner + StreamingErrorBanner + toast |

### 6.5 待核项

1. **web `MessageBubble.tsx` 气泡内部 className 未读** —— 本批只读到 web `MessageList` 容器层（`max-w-3xl mx-auto space-y-4`）。**需确认**：读 `src/components/chat/MessageBubble.tsx` 后补气泡级对照（PC 侧已读 `CallTreeCard` / `ReferenceFold`，web 侧对等物在 MessageBubble 内）。
2. **PC `ExecutionTiming.tsx`（68 行）内容未读** —— 只确认文件存在。**需确认**：其 className 与 web 对应物（`MessageBubble` 内 tool 计时区）。
3. **PC `ChatTopBanner.tsx` / `ModelChips.tsx` / `DeliverableStrip.tsx` className 未读** —— 三者均为 PC 独有元素，web 无对等物，无法做「差异」判定，只能记录存在。**需确认**：若 PM 决定要移植，需读这三个文件取 className。
4. **web `StreamingErrorBanner.tsx`（166 行）未读** —— PC 版（76 行）已在批 1 外，本批未展开。**需确认**：两端 banner 的 className 对照。
5. **`webAppShell` 高度标准**（`h-14` 56px vs PC `h-12` 48px）—— 见 §6.2 拍板项。

---

## 7. LibraryDetail

### 7.0 文件与规模

| | web | PC |
|---|---|---|
| 路径 | `src/app/(main)/library/[id]/page.tsx` | `src/routes/LibraryDetail.tsx` |
| 行数 | **450** | **455** |
| 路由 | `/library/[id]` | `/library/:id` |
| 顶栏 | **页面自管** `sticky top-0 z-20 bg-bg-base border-b border-b` + `h-14`（返回 + 图标 + 标题 + 编辑/删除） | **无顶栏**，标题/元信息直接进正文流；返回靠 AppShell header 的 ← |
| 外壳 header | `(main)/layout.tsx` 提供 `h-14` + 返回 + 标题 | AppShell `resolveTitle("/library/…")` → **`知识库详情`**（`AppShell.tsx:41`） |
| ErrorBoundary | 有 `<ErrorBoundary title="详情加载失败" description="条目可能已被删除, 返回列表重试">`（`:88`） | 无 |

**外壳差异**：web 在页内再画一条 `h-14` 顶栏 + 全局 `(main)` header 也存在 → **web 可能双层 header**；PC 只有 AppShell 一层。**待核**：web `(main)/layout` 是否对 `/library/[id]` 也渲染 header（批 1 §0.4 说 `isSubPage` 时显示返回键，`:174` 有 `border-b`）。

### 7.1 元素结构树

**web 加载态（`:215-234`）**
```
<div className="flex flex-col h-full">
  <div className="sticky top-0 z-20 bg-bg-base border-b border-border">
    <div className="px-4 lg:px-8 max-w-3xl mx-auto w-full h-14 flex items-center gap-2">
      <button aria-label="返回" className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors inline-flex items-center justify-center"><ArrowLeft className="w-5 h-5"/></button>
      <span className="text-sm text-fg-muted">加载中...</span>
  <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-fg-muted"/></div>
```

**web 错误/空态（`:238-257`）**：同顶栏，标题 `<span className="text-base font-medium">详情</span>` + `flex-1 flex items-center justify-center text-fg-muted text-sm`「条目不存在或已被删除」

**web 正常态（`:261-424`）**
```
<div className="flex flex-col h-full">
  <div className="sticky top-0 z-20 bg-bg-base border-b border-border">
    <div className="px-4 lg:px-8 max-w-3xl mx-auto w-full h-14 flex items-center gap-2">
      [← 返回按钮 同上]
      <div className="flex-1 min-w-0 flex items-center gap-2 text-base font-medium truncate">
        {typeIcon(item.type)} <span className="truncate">{item.title || "未命名"}</span>
      {!editing && <><button aria-label="编辑" className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors inline-flex items-center justify-center"><Pencil className="w-5 h-5"/></button>
                     <button aria-label="删除" className="shrink-0 w-9 h-9 rounded-full …"><Trash2 className="w-5 h-5"/></button></>}
  <div className="flex-1 px-4 lg:px-8 py-6 max-w-3xl mx-auto w-full space-y-5 overflow-y-auto">
    {!editing && <div className="space-y-3">
        <div className="flex items-center gap-2"><Badge variant="secondary">{typeLabel}</Badge>
             <span className="text-xs text-fg-muted">{timeRef.current || item.createdAt}</span>
        <div className="text-2xl font-semibold break-words">{item.title || "未命名"}</div>}
    {editing && <div className="space-y-4">
        <label className="text-xs text-fg-muted mb-1 block">标题</label> + <Input placeholder="标题" autoFocus maxLength={200}/>
        <label …>标签 <span className="text-fg-subtle">(用逗号或空格分隔)</span></label> + <Input placeholder="例如: 设计, 灵感, 2026"/>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" disabled={saving}><X className="w-4 h-4 mr-1"/>取消</Button>
          <Button size="sm" disabled={saving}>{saving?<Loader2 className="w-4 h-4 animate-spin"/>:<><Save className="w-4 h-4 mr-1"/>保存</>}</Button>}
    {!editing && type==="image" && url && <div className="rounded-lg overflow-hidden border border-border bg-bg-sunken">
        <img className="block w-full max-h-[60vh] object-contain bg-black"/>}
    {!editing && url && <div className="space-y-1">
        <div className="text-xs text-fg-muted">{type==="link"?"链接":"附件"}</div>
        <a className="inline-flex items-center gap-1 text-sm text-brand hover:underline break-all">…<ExternalLink className="w-3.5 h-3.5 shrink-0"/></a>}
    {!editing && <div className="space-y-2">
        <div className="text-xs text-fg-muted flex items-center gap-1"><Tag className="w-3.5 h-3.5"/>标签</div>
        tags.length>0 ? <div className="flex gap-1 flex-wrap">{tags.map(t=><Badge key={t} variant="secondary">#{t}</Badge>)}</div>
                       : <div className="text-sm text-fg-subtle">无标签</div>}
    {!editing && item.content && <div className="space-y-2">
        <div className="text-xs text-fg-muted">内容</div>
        <div className="rounded-md border border-border bg-bg-sunken p-3 text-sm"><Markdown>{item.content}</Markdown></div>}
  <AlertDialog>  ← 确定要删除这条吗? / 「{title}」 将从知识库移除，此操作不可撤销。 / 取消 / 删除(tone="danger")
```

**PC（`LibraryDetail.tsx:154-302`，三分支）**
```
加载: <div className="min-h-full px-4 lg:px-8 py-8"><div className="max-w-3xl mx-auto">
        <div className="h-8 w-1/2 bg-bg-sunken rounded animate-pulse"/>
        <div className="h-4 w-1/3 bg-bg-sunken rounded mt-3 animate-pulse"/>
        <div className="h-64 w-full bg-bg-sunken rounded mt-6 animate-pulse"/>
错误: <div className="rounded-md bg-danger-soft/30 border border-danger/40 px-4 py-3 text-sm">加载失败:{…}</div>
      + <Button variant="ghost" size="md">返回列表</Button>
正常: <div className="min-h-full px-4 lg:px-8 py-6"><div className="max-w-3xl mx-auto space-y-5">
  <header className="space-y-2">
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs px-2 py-0.5 rounded bg-bg-elevated text-fg-muted">{TYPE_LABEL[type]}</span>
      <span className="text-xs text-fg-subtle font-mono">#{item.id}</span>
      <span className="text-xs text-fg-subtle">·</span>
      <span className="text-xs text-fg-subtle">{formatDate(createdAt)}</span>
      <SyncStatusBadge status={deriveSyncStatus(item)}/>
    <h1 className="text-xl font-medium text-fg break-all">{item.title || "(无标题)"}</h1>
  <div className="rounded-md bg-bg-elevated divide-y divide-border">
    InfoRow label="URL" → <a className="text-brand hover:underline break-all">
    InfoRow label="标签" → <div className="flex flex-wrap gap-1"> + <span className="text-xs px-1.5 py-0.5 rounded bg-bg-sunken text-fg-muted">#{t}</span>
  <ContentView item onOpenWithSystem/>
  <div className="flex items-center justify-end gap-2 pt-2 flex-wrap">
    <Button variant="ghost" size="md">返回列表</Button>
    <Button variant="outline" size="md">在对话中引用</Button>
    <Button variant="outline" size="md">编辑</Button>
    <Button variant="danger" size="md">删除</Button>
  <ConfirmDialog title="删除这条知识?" message="删除后无法恢复。" confirmLabel="确认删除" confirmVariant="danger"/>
  <EditSheet open item onClose/>
```

### 7.2 逐元素映射表

| 层级 | web className（原文） | PC className（原文） | 差异 |
|---|---|---|---|
| 根容器 | `flex flex-col h-full` | `min-h-full px-4 lg:px-8 py-6` | 真差异（PC 直接铺 padding，web 靠内部容器） |
| 页面顶栏 | `sticky top-0 z-20 bg-bg-base border-b border-border` > `px-4 lg:px-8 max-w-3xl mx-auto w-full h-14 flex items-center gap-2` | **不存在** | **真差异：PC 无页内顶栏**（编辑/删除/返回全挪到底部按钮行） |
| 标题字号 | `text-2xl font-semibold break-words`（正文重复一遍）+ 顶栏 `text-base font-medium truncate` | `text-xl font-medium text-fg break-all`（仅一处） | 真差异：`text-2xl`(24) vs `text-xl`(20)；`font-semibold` vs `font-medium`；`break-words` vs `break-all` |
| 类型图标 | `<ImageIcon className="w-5 h-5 text-brand-cyan"/>` / `text-brand-yellow` / `text-brand-green` / `text-fg-muted`（`:57-69`） | `<TypeIcon/>` 由 `SyncStatusBadge` 旁无图标；PC 无 type icon | 真差异：**web 有彩色 type icon，PC 没有** |
| 类型 badge | `<Badge variant="secondary">`（`图片/文档/链接/文本`） | `text-xs px-2 py-0.5 rounded bg-bg-elevated text-fg-muted` | 真差异：PC 手搓 span，`bg-bg-elevated` vs web Badge（`bg-secondary`，见 §7.5 待核） |
| ID | **不显示** | `text-xs text-fg-subtle font-mono` `#{item.id}` | PC 独有 |
| 时间格式 | `formatDistanceToNow(d,{addSuffix:true,locale:zhCN})`（date-fns，相对时间「3 小时前」） | `d.toLocaleString()`（绝对时间） | **真差异：相对 vs 绝对时间格式** |
| 同步状态 | **不存在** | `<SyncStatusBadge status>`（`deriveSyncStatus` 推 `synced`/`syncing`） | PC 独有 |
| 加载态 | 顶栏 + `<Loader2 className="w-6 h-6 animate-spin text-fg-muted"/>` | 3 块 `bg-bg-sunken rounded animate-pulse` 骨架 | **真差异：PC 骨架 / web 转圈** |
| 错误态 | `flex-1 flex items-center justify-center text-fg-muted text-sm`「条目不存在或已被删除」 | `rounded-md bg-danger-soft/30 border border-danger/40 px-4 py-3 text-sm`「加载失败:…」+ `返回列表` 按钮 | **真差异：web 是中性灰文字、PC 是红色描边卡** |
| 正文容器 | `flex-1 px-4 lg:px-8 py-6 max-w-3xl mx-auto w-full space-y-5 overflow-y-auto` | `max-w-3xl mx-auto space-y-5`（外层承担 padding） | 真差异：滚动容器归属不同 |
| 图片预览 | `rounded-lg overflow-hidden border border-border bg-bg-sunken` > `img className="block w-full max-h-[60vh] object-contain bg-black"` | `rounded-md bg-bg-elevated p-3` > `img className="max-w-full max-h-[70vh] mx-auto rounded"` | 真差异：**`rounded-lg`(20) vs `rounded-md`(16)**；**`border` web 有 PC 无**；底色 `bg-bg-sunken` vs `bg-bg-elevated`；`max-h-[60vh]` vs `[70vh]`；web `bg-black` PC 无 |
| 正文 Markdown | `rounded-md border border-border bg-bg-sunken p-3 text-sm` + `<Markdown>` | `text && content` → `<LibraryMarkdownTableCard content/>`（**内部 className 未读**） | 待核 |
| 标签区 | `space-y-2` + `text-xs text-fg-muted flex items-center gap-1` + `<Tag className="w-3.5 h-3.5"/>`「标签」 + `<Badge variant="secondary">#{t}</Badge>`；空时 `text-sm text-fg-subtle`「无标签」 | `<InfoRow label="标签">`（`flex items-start gap-4 px-4 py-3` > `w-16 text-sm text-fg-muted shrink-0 pt-0.5`）→ `flex flex-wrap gap-1` + `text-xs px-1.5 py-0.5 rounded bg-bg-sunken text-fg-muted` | 真差异：**web 有独立「标签」小节 + Tag 图标 + 「无标签」空态；PC 塞进 InfoRow 表格** |
| 链接区 | 有 `text-xs text-fg-muted` 标签行（`链接`/`附件`）+ `inline-flex items-center gap-1 text-sm text-brand hover:underline break-all` + `<ExternalLink className="w-3.5 h-3.5 shrink-0"/>` | `<a className="text-brand hover:underline break-all">`（无 label 行、无 `inline-flex`、无图标） | 真差异：web 多 label 行 + 图标 + `inline-flex gap-1` |
| 编辑模式 | **页内联**（`editing` state 替换正文区） | **独立 Sheet** `<EditSheet>`（居中 modal，见 §16.5） | 真差异：交互形态不同 |
| 操作区 | 顶栏右侧 2 个 36px 圆形图标钮 | 底部 `flex items-center justify-end gap-2 pt-2 flex-wrap` 4 个文字按钮 | **真差异：图标钮 vs 文字按钮；PC 多「返回列表」「在对话中引用」** |
| 删除确认 | `<AlertDialog>` Radix，`AlertDialogAction tone="danger"`，正文 `「{title}」 将从知识库移除，此操作不可撤销。` | `<ConfirmDialog title="删除这条知识?" message="删除后无法恢复。" confirmLabel="确认删除">` | 真差异：正文文案不同；web 插值标题，PC 不插值 |
| type=link/doc 无 url | 无兜底（不渲染该块） | `rounded-md bg-bg-elevated p-4 text-sm text-fg-muted text-center`「无 URL」 | PC 独有 |
| type=text 无 content | 该块不渲染 | `rounded-md bg-bg-elevated p-4 text-sm text-fg-muted text-center`「无内容」 | PC 独有 |

### 7.3 文案对照

| 位置 | web | PC | 一致 |
|---|---|---|---|
| 加载 | `加载中...` | （骨架，无文字） | 否 |
| 空/错 | `条目不存在或已被删除` | `加载失败:{err}` / `未找到` | 否 |
| 顶栏标题（加载态） | `加载中...` | 无顶栏 | — |
| 标题兜底 | `未命名` | `(无标题)` | **否（全角括号 vs 无括号）** |
| 类型 label | `图片/文档/链接/文本/其他` | `图片/文档/链接/文本` | PC 无「其他」 |
| 编辑 placeholder | `标题` / `例如: 设计, 灵感, 2026` | EditSheet 内同款（`:113`/`:131`） | 一致 |
| 标签说明 | `(用逗号或空格分隔)` | 同款（`EditSheet.tsx:125`） | 一致 |
| 保存/取消 | `保存` / `取消` | `保存` / `取消` | 一致 |
| 删除确认标题 | `确定要删除这条吗?` | `删除这条知识?` | 否 |
| 删除确认正文 | `「{title}」 将从知识库移除，此操作不可撤销。` | `删除后无法恢复。` | 否 |
| 删除按钮 | `删除` | `删除` / `确认删除` | 否（PC 两个词） |
| 空标签 | `无标签` | （不渲染该行） | 否 |
| PC 独有按钮 | — | `返回列表` / `在对话中引用` / `编辑` / `删除` / `无 URL` / `无内容` / `外部网页链接` / `文档附件` / `打开网页` / `打开文件` | — |
| toast 保存成功 | `已更新` | `已更新` | 一致 |
| toast 删除成功 | `已删除` | `已删除` | 一致 |

### 7.4 交互态对照

| 状态 | web | PC |
|---|---|---|
| 返回钮 hover | `hover:bg-bg-elevated` | 无页内返回钮 |
| 编辑钮 hover | `hover:bg-bg-elevated` | — |
| 删除钮 hover | `hover:bg-bg-elevated`（**无红色**） | `Button variant="danger"` 常驻红底 |
| 保存中 | `disabled={saving}` + `<Loader2 className="w-4 h-4 animate-spin"/>` | `loading={mutation.isPending}`（`Button.tsx:76` `gagaos-spinner`，批 1 §6 #3 待核） |
| 删除中 | `disabled={deleting}` + `<Loader2 className="w-4 h-4 animate-spin"/>` | `loading={deleteMutation.isPending}` |
| 链接 hover | `hover:underline` | `hover:underline` |
| 图片容器 | **无 hover 态** | **无 hover 态** |
| 加载态 | 转圈 | 骨架 |
| 错误态 | 中性文字 | 红色描边卡 |
| 空态 | 不适用 | 有（`无 URL` / `无内容`） |

### 7.5 待核项

1. **web `<Badge variant="secondary">` 的实际 className 未读** —— `src/components/ui/badge.tsx`。本批把 web Badge 一律写成 `variant="secondary"` 原文，未展开成具体 tailwind 类。**需确认**：读 `badge.tsx` 后替换 §7.2 中的 Badge 单元格。
2. **PC `LibraryMarkdownTableCard.tsx` / `SyncStatusBadge.tsx` className 未读** —— 两者直接出现在页面上。**需确认**：读 `src/components/library/` 下这两个文件。
3. **web `(main)/layout` 对 `/library/[id]` 是否渲染 header** —— 若渲染，则 web 是「全局 header + 页内 h-14 顶栏」双层；PC 是单层。**需确认**：读 `src/app/(main)/layout.tsx` 的 `isSubPage` 判定逻辑（批 1 已抄 `SUB_PAGE_PREFIXES` 含 `/chat`，需确认是否含 `/library`）。

---

## 8. Deliveries

### 8.0 文件与规模

| | web | PC |
|---|---|---|
| 路径 | `src/app/(main)/deliveries/page.tsx` | `src/routes/Deliveries.tsx` |
| 行数 | **733** | **826** |
| 路由 | `/deliveries` | `/deliveries` |
| 标题 | 全局 header 渲染「交付中心」（页面 `useEffect` 不设 header） | `AppShell.resolveTitle("/deliveries")` → `交付中心`（`:42`） |
| 外壳 | `(main)/layout` header | AppShell `shrink-0 h-14 px-4 bg-bg-base flex items-center gap-2` |
| 多选 | **不存在** | 有（`DeliveriesMultiSelectToolbar` + 卡片 checkbox） |
| 排序 | **不存在** | 有（`<SortMenu value sort onChange/>`） |
| 拖放 | **不存在** | 有（`<DeliveriesDropZone>` 包整页，`:227`） |

### 8.1 元素结构树

**web（`:186-354`）**
```
<div className="flex flex-col h-full">
  <div className="sticky top-0 z-20 bg-bg-base/95 backdrop-blur pt-2 pb-4">
    <div className="px-4 lg:px-8 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between gap-2 py-2">
        <div className="flex-1 min-w-0 overflow-x-auto scrollbar-none">
          <Tabs><TabsList>{TAB_DEFS.map(t=><TabsTrigger><t.icon className="w-4 h-4 mr-1.5"/>{t.label}</TabsTrigger>)}</TabsList></Tabs>
        <div className="flex items-center gap-1 shrink-0">
          [搜索开关 btn] cn("shrink-0 w-9 h-9 rounded-full transition-colors duration-150 inline-flex items-center justify-center",
                             showSearch ? "bg-bg-elevated text-fg" : "text-fg-muted hover:bg-bg-elevated")
          [刷新 btn] "shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors duration-150 inline-flex items-center justify-center disabled:opacity-50"
      {showSearch && <div className="pt-2"><div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted pointer-events-none z-10"/>
          <Input type="search" placeholder="搜索标题或域名..." autoFocus
                 className="pl-9 py-2 text-sm bg-muted/50 border-0 rounded-full focus-visible:ring-1 focus-visible:ring-brand"/>}
  <div className="flex-1 overflow-y-auto px-4 lg:px-8 max-w-5xl mx-auto w-full py-2">
    isLoading → <SkeletonGrid tab/>   items.length===0 → <EmptyState keyword/>
    tab==="all"       → <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"> ImageCard|WebCard|DocumentCard
    tab==="document"  → <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"> DocumentCard
    else              → <div className="grid grid-cols-2 gap-4">            ImageCard|WebCard
    + <LoadMore/>    ← "py-4 text-center" > button cn("inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg disabled:opacity-50 transition-colors duration-150")
  <AlertDialog> 确定删除该交付物？ / 将从你的交付中心移除“{title}”。此操作不可撤销。 / 取消 / {pending?"删除中...":"我确定"}
```

web 卡片（`ImageCard :431` / `WebCard :508` / `DocumentCard :604`）：
```
ImageCard/WebCard: <div className="group relative block w-full text-left rounded-2xl shadow-sm bg-card hover:bg-muted/50 transition-colors duration-150 overflow-hidden">
                    <button className="block w-full text-left">
                      <div className="relative w-full bg-muted overflow-hidden" style={{aspectRatio:"1 / 1" | "16 / 9"}}>
                        <img className="absolute inset-0 w-full h-full object-cover" loading="lazy"/>
                        或 <ImageIcon className="w-8 h-8"/>  /  <div className="…bg-gradient-to-br from-brand-container to-bg-muted text-fg-muted"><Globe className="w-10 h-10"/></div>
                      <div className="p-4">
                        <div className="text-base font-medium truncate">{title||prompt||"未命名图片"}</div>
                        <div className="text-xs text-fg-muted mt-1 flex items-center gap-1.5 truncate">
                          <span className="text-fg-muted/70">图片|网站</span> <span className="text-fg-muted/40">·</span> …{time}
                    <div className="absolute top-1.5 right-1.5 z-10"><CardMenu/></div>
DocumentCard:     <div className="rounded-2xl shadow-sm bg-card hover:bg-muted/50 transition-colors duration-150 p-4">
                    <div className="flex items-start gap-3">
                      [下载钮] button cn("shrink-0 w-10 h-10 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/70 transition-colors") <FileText className="w-5 h-5 text-brand-yellow"/>
                      <div className="flex-1 min-w-0"> 标题 text-base font-medium truncate / caption text-xs text-fg-muted mt-1 … / time text-xs text-fg-muted/70 mt-1
                      [下载 icon btn] className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-muted transition-colors duration-150"
                      <CardMenu/>        ← inline，不 absolute
CardMenu  :692   <DropdownMenuTrigger className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-muted transition-colors duration-150 inline-flex items-center justify-center outline-none data-[state=open]:bg-muted">
SkeletonGrid :718 <div className="grid grid-cols-2 gap-4"> + <Skeleton className="h-20 w-full rounded-2xl bg-card"/> ×4 / <Skeleton className="w-full rounded-2xl bg-card" style={{aspectRatio:"1 / 1"}}/> ×6
EmptyState  :363 <Card className="border-0 shadow-none bg-card rounded-2xl"><CardContent className="p-10 text-center text-fg-muted">
                  <Construction className="w-12 h-12 mx-auto text-fg-muted mb-4"/>
                  <div className="text-base font-medium mb-1 text-fg">暂无交付物</div>
                  <div className="text-sm">{keyword?`未找到包含 "${keyword}" 的交付物`:"AI 生成的图片 / 网站 / 文档将自动汇总到这里"}</div>
```

**PC（`:226-356`）**
```
<DeliveriesDropZone onRouted>
  <div className="min-h-full flex flex-col">
    <div className="sticky top-0 z-10 bg-bg-base">
      <div className="px-4 lg:px-8 max-w-5xl mx-auto w-full space-y-2 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0 overflow-x-auto">
            <div className="inline-flex p-1 rounded-md bg-bg-elevated gap-1">
              TAB_DEFS.map(t=><button className={["px-3 py-1 text-sm rounded transition-colors duration-150",
                active ? "bg-brand text-brand-on shadow-sm" : "text-fg-muted hover:text-fg"].join(" ")}>{t.label}</button>)
          <div className="flex items-center gap-1 shrink-0">
            <SortMenu value onChange/>
            [刷新 btn] "shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors duration-150 inline-flex items-center justify-center disabled:opacity-50"
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted pointer-events-none"/>
          <Input type="search" placeholder="搜索标题..." className="pl-9 py-2 text-sm"/>
    <div className="flex-1 px-4 lg:px-8 max-w-5xl mx-auto w-full py-4">
      isLoading → <SkeletonGrid/>   0 → <EmptyState/>
      else → <DocumentSplitGrid items tab isInMultiSelect selectedIds onToggleSelect onOpen onDelete onRetry retryPending/>
           + hasMore && <div className="flex justify-center mt-4"><Button variant="ghost" size="md" loading={isFetching}>加载更多</Button></div>
    {isInMultiSelect && <DeliveriesMultiSelectToolbar …/>}
    {deleteTarget && <ConfirmDialog title="删除这条交付?" message="删除后无法恢复。" confirmLabel="确认删除" confirmVariant="danger"/>}
```

PC 卡片（`DeliveryCard :503-510` / `PdfCard :614-621`）：
```
DeliveryCard: <div role="button" tabIndex={0} className={["rounded-md p-3 flex items-start gap-3 select-none cursor-pointer transition-colors duration-150",
            多选&&选中 ? "bg-bg-elevated ring-1 ring-brand/60" : 多选 ? "bg-bg-sunken hover:bg-bg-elevated" : "bg-bg-elevated hover:bg-bg-sunken"].join(" ")}>
  多选 checkbox: span cn("shrink-0 w-5 h-5 mt-2 inline-flex items-center justify-center rounded border", 选中?"bg-fg border-fg text-bg-base":"bg-bg-base border-border text-transparent")
  缩略: <div className="shrink-0 w-16 h-16 rounded bg-bg-sunken flex items-center justify-center text-fg-muted overflow-hidden">
        <img className="w-full h-full object-cover"/> 或 <TypeIcon/>   ← TypeIcon 是 inline SVG 24×24
  <div className="flex-1 min-w-0 space-y-1">
    <div className="flex items-center gap-2"><span className="text-xs px-1.5 py-0.5 rounded bg-bg-sunken text-fg-muted">{TYPE_LABEL[type]}</span>
    <h3 className="text-sm font-medium text-fg line-clamp-2 break-all">{title || "(无标题)"}</h3>
    <p className="text-xs text-fg-subtle">{formatBytes(size)} · {formatRelative(createdAt)}</p>
    {!多选 && <div className="mt-1 flex items-center gap-3">
       <button className="text-xs text-danger hover:text-danger/80 px-1 py-0.5 rounded transition-colors duration-150">删除</button>
       <button disabled={retryPending} className="text-xs text-fg-muted hover:text-fg px-1 py-0.5 rounded transition-colors duration-150 disabled:opacity-50">{pending?"请求中…":"重新下载"}</button>}
PdfCard:      className={["rounded-md overflow-hidden select-none cursor-pointer transition-colors duration-150", …同三态]}
              <div className="relative w-full h-[180px] bg-bg-sunken overflow-hidden"><iframe className="w-full h-full pointer-events-none"/>
              <div className="p-3 space-y-1"> + 同款 h3/p/按钮行
SkeletonGrid :749 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"> ×6 <div className="rounded-md bg-bg-elevated p-3 animate-pulse flex items-start gap-3">
                    <div className="w-16 h-16 rounded bg-bg-sunken"/> <div className="flex-1 space-y-2"> 3 条 bg-bg-sunken rounded
EmptyState :733  <div className="h-full flex items-center justify-center"><div className="rounded-md bg-bg-sunken p-8 text-center max-w-sm">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-elevated flex items-center justify-center text-fg-muted"><PackageIcon/></div>
                  <p className="text-base font-medium mb-1">还没有交付物</p>
                  <p className="text-sm text-fg-muted">在对话中生成的图片、网站、文档会自动出现在这里</p>
```

### 8.2 逐元素映射表

| 层级 | web className（原文） | PC className（原文） | 差异 |
|---|---|---|---|
| 顶栏容器 | `sticky top-0 z-20 bg-bg-base/95 backdrop-blur pt-2 pb-4` | `sticky top-0 z-10 bg-bg-base` > `space-y-2 py-2` | **真差异：web 有 `bg-bg-base/95 backdrop-blur` 半透明毛玻璃 + `pt-2 pb-4`；PC 纯色 + `py-2`**；**`z-20` vs `z-10`** |
| Tabs 形态 | Radix `<Tabs>/<TabsList>/<TabsTrigger>` + `w-4 h-4 mr-1.5` 图标 | 手搓 `<div className="inline-flex p-1 rounded-md bg-bg-elevated gap-1">` + `px-3 py-1 text-sm rounded`，**无图标** | **重大真差异：web 4 tab 带图标，PC 4 tab 纯文字**；选中态 web 走 TabsTrigger（underline/未读），PC 是 `bg-brand text-brand-on shadow-sm` 实心橙块 |
| tab 文案 | `全部/图片/网站/文档` | `全部/图片/网站/文档`（`Deliveries.tsx:51-55`） | 一致 |
| 搜索按钮 | 存在（**折叠开关**，`showSearch ? "bg-bg-elevated text-fg" : "text-fg-muted hover:bg-bg-elevated"`） | **不存在**（PC 搜索框常驻） | 真差异：**web 搜索是展开式，PC 常驻** |
| 搜索框 placeholder | `搜索标题或域名...` | `搜索标题...` | **否（PC 少「或域名」）** |
| 搜索框样式 | `pl-9 py-2 text-sm bg-muted/50 border-0 rounded-full focus-visible:ring-1 focus-visible:ring-brand` | `pl-9 py-2 text-sm`（其余走 PC `Input` 默认） | **真差异：web `rounded-full` + `bg-muted/50` 去边框 + `focus-visible:ring-1 ring-brand`；PC 方形 + 组件默认** |
| 刷新按钮 | `…disabled:opacity-50`（同 PC） | `…disabled:opacity-50`（同 web） | **完全一致** ✅ |
| 排序 | 不存在 | `<SortMenu>` | PC 独有 |
| 拖放 | 不存在 | `<DeliveriesDropZone>` | PC 独有 |
| 网格 | `all`: `grid grid-cols-1 sm:grid-cols-2 gap-4`；`document`: 同；`image/web`: **`grid grid-cols-2 gap-4`** | 全 tab `grid grid-cols-1 sm:grid-cols-2 gap-3` | **真差异：`gap-4` vs `gap-3`**；web 单类型 tab 在移动端也是 **2 列**，PC 移动端 **1 列** |
| 卡片根 | `rounded-2xl shadow-sm bg-card hover:bg-muted/50 transition-colors duration-150` | `rounded-md p-3 flex items-start gap-3 select-none cursor-pointer` + `bg-bg-elevated hover:bg-bg-sunken` | **重大真差异**：`rounded-2xl`(24) vs `rounded-md`(16)；**底色 `bg-card`(#0a0a0a) vs `bg-bg-elevated`(#181818)**；**hover 提亮 `bg-muted/50` vs 压暗 `bg-bg-sunken`**；**web 是竖版大图卡、PC 是横版 64px 小缩略图行卡** |
| 卡片内图片区 | `relative w-full bg-muted overflow-hidden` + `aspectRatio 1/1`(image) 或 `16/9`(web) | `shrink-0 w-16 h-16 rounded bg-bg-sunken flex items-center justify-center text-fg-muted overflow-hidden` | **重大真差异：全屏大图 vs 64px 小方图** |
| 缩略图 | `absolute inset-0 w-full h-full object-cover` | `w-full h-full object-cover` | 定位差异（PC 无 absolute） |
| 缩略失败占位 | `<ImageIcon className="w-8 h-8"/>` / `<Globe className="w-10 h-10"/>` 垫 `bg-gradient-to-br from-brand-container to-bg-muted` | `<TypeIcon/>` inline SVG 24×24，**无渐变垫底** | 真差异：web 图标更大 + 有品牌渐变底 |
| 类型 chip | `text-fg-muted/70` 纯文本 + `text-fg-muted/40` 分隔点（**2026-10-17 去边框**） | `text-xs px-1.5 py-0.5 rounded bg-bg-sunken text-fg-muted`（**有底色 chip**） | **真差异：web 已去 chip 化改纯文本，PC 仍是底色 chip** |
| 卡片标题 | `text-base font-medium truncate`（单行） | `text-sm font-medium text-fg line-clamp-2 break-all`（两行截断） | **真差异：字号 16 vs 14；`truncate` vs `line-clamp-2`** |
| 标题兜底 | `未命名图片` / `未命名网页` / `未命名文档` | `(无标题)` | **否（web 分类兜底、PC 统一 `(无标题)`）** |
| 卡片 caption | `text-xs text-fg-muted mt-1 flex items-center gap-1.5 truncate`（类型 · mime · size） | `text-xs text-fg-subtle`（`size · 相对时间` 单行） | **真差异：颜色 `text-fg-muted` vs `text-fg-subtle`；PC 不显示 mimeType** |
| 时间格式 | `formatDistanceToNow(date,{addSuffix:true,locale:zhCN})`（date-fns） | 自写 `formatRelative`（「刚刚/N 分钟前/N 小时前/…/N 年前」） | 功能等价，**文案粒度不同** |
| ⋮ 菜单定位 | Image/Web：`absolute top-1.5 right-1.5 z-10`；Document：**inline**（flex row 末尾） | **不存在**（删除/重试是卡片内文字按钮） | **重大真差异：web 有 ⋮ Radix 下拉；PC 无下拉，改为内联文字按钮** |
| ⋮ trigger | `shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-muted transition-colors duration-150 inline-flex items-center justify-center outline-none data-[state=open]:bg-muted` | — | — |
| ⋮ 内容 | `min-w-[8rem] border-0 rounded-xl bg-popover` + `<DropdownMenuItem className="text-danger focus:text-danger">` | — | — |
| 卡片内文字操作 | 无 | `text-xs text-danger hover:text-danger/80 px-1 py-0.5 rounded`「删除」/ `text-xs text-fg-muted hover:text-fg px-1 py-0.5 rounded disabled:opacity-50`「重新下载」 | **PC 独有；web 的「重试」已被移除（对齐 Android）** |
| 加载更多 | `py-4 text-center` > `inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg disabled:opacity-50` + `<PackageOpen>`/`<Loader2 className="w-4 h-4 animate-spin"/>` | `flex justify-center mt-4` > `<Button variant="ghost" size="md" loading>` | 真差异：web 裸文字钮 + 图标，PC 用 Button 组件 |
| 骨架屏 | `grid grid-cols-2 gap-4` + `<Skeleton className="h-20 w-full rounded-2xl bg-card"/>` ×4（document）/ `w-full rounded-2xl bg-card` + `aspectRatio 1/1` ×6 | `grid grid-cols-1 sm:grid-cols-2 gap-3` ×6 + `rounded-md bg-bg-elevated p-3 animate-pulse flex items-start gap-3` + 64px 方块 + 3 条 `bg-bg-sunken rounded` | **真差异：web 纯色块 + `rounded-2xl`；PC 模拟真实卡片结构 + `rounded-md`** |
| 空态容器 | `<Card className="border-0 shadow-none bg-card rounded-2xl"><CardContent className="p-10 text-center text-fg-muted">` | `rounded-md bg-bg-sunken p-8 text-center max-w-sm`（+ 外层 `h-full flex items-center justify-center`） | **真差异：`bg-card` vs `bg-bg-sunken`；`rounded-2xl` vs `rounded-md`；`p-10` vs `p-8`；PC 多 `max-w-sm` + 垂直居中** |
| 空态图标 | `<Construction className="w-12 h-12 mx-auto text-fg-muted mb-4"/>`（lucide） | `w-12 h-12 mx-auto mb-3 rounded-full bg-bg-elevated flex items-center justify-center text-fg-muted` + `<PackageIcon/>` | **真差异：web 无图标底圈、PC 有 `rounded-full bg-bg-elevated` 圈；`mb-4` vs `mb-3`；图标不同** |
| 空态主文案 | `暂无交付物` | `还没有交付物` | **否** |
| 空态副文案 | `AI 生成的图片 / 网站 / 文档将自动汇总到这里` | `在对话中生成的图片、网站、文档会自动出现在这里` | **否（分隔符「/」vs「、」，语序不同）** |
| 空态搜索态 | `未找到包含 "${keyword}" 的交付物` | **不存在** | 真差异：PC 搜索无结果时文案仍是「还没有交付物」 |
| 删除确认 | `确定删除该交付物？` / `将从你的交付中心移除“{title}”。此操作不可撤销。` / `取消` / `删除中...` / `我确定` | `删除这条交付?` / `删除后无法恢复。` / `确认删除` | **否（4 处文案全不同）** |
| 多选条 | 不存在 | `sticky bottom-0 z-30 bg-bg-elevated border-t border-border px-4 py-3 flex items-center gap-3` + `已选 <strong>{n}</strong> 条` + `取消` / `全选|取消全选` / `删除 (n)` | PC 独有。**注意批 1 §7 已指出 `library/MultiSelectToolbar` 同样带 `border-t border-border`，与 web 去线化方向冲突** |

### 8.3 文案对照

| 位置 | web | PC | 一致 |
|---|---|---|---|
| tab | `全部/图片/网站/文档` | 同 | ✅ |
| 搜索 placeholder | `搜索标题或域名...` | `搜索标题...` | 否 |
| 加载更多 | `加载更多` | `加载更多` | ✅ |
| 重试按钮文案 | **不存在** | `重新下载` / `请求中…` | 否 |
| 类型 chip | `图片` / `网站` / `文档` | 同（`TYPE_LABEL`） | ✅ |
| 卡片标题兜底 | `未命名图片` / `未命名网页` / `未命名文档` | `(无标题)` | 否 |
| 骨架 | 无文字 | 无文字 | ✅ |
| 空态主 | `暂无交付物` | `还没有交付物` | 否 |
| 空态副 | `AI 生成的图片 / 网站 / 文档将自动汇总到这里` | `在对话中生成的图片、网站、文档会自动出现在这里` | 否 |
| 搜索空态 | `未找到包含 "{kw}" 的交付物` | 无 | 否 |
| 删除确认标题 | `确定删除该交付物？` | `删除这条交付?` | 否 |
| 删除确认正文 | `将从你的交付中心移除“{title}”。此操作不可撤销。` | `删除后无法恢复。` | 否 |
| 删除确认 CTA | `我确定` / `删除中...` | `确认删除` / `删除中` | 否 |
| 取消 | `取消` | `取消` | ✅ |
| 刷新 toast | `已刷新` | 见 `handleRefresh`（未读文案，`:1xx`） | 待核 |
| 拖放 toast | 不存在 | `已转入知识库: {name}` / `拖入失败: {msg}` | 否 |
| 多选条 | 不存在 | `已选 {n} 条` / `全选` / `取消全选` / `删除 ({n})` / `确认删除 {n} 条交付?` / `此操作不可恢复, 请谨慎操作。` | 否 |

### 8.4 交互态对照

| 状态 | web | PC |
|---|---|---|
| tab 选中 | Radix `TabsTrigger`（见 §8.5 待核） | `bg-brand text-brand-on shadow-sm` |
| tab 未选中 | TabsTrigger 默认 | `text-fg-muted hover:text-fg` |
| 刷新 disabled | `disabled:opacity-50` | `disabled:opacity-50` ✅ |
| 刷新 spinning | `<RefreshCw className={cn("w-5 h-5", isFetching && "animate-spin")}/>` | `<RefreshIcon className={isFetching ? "animate-spin" : ""}/>` ✅ |
| 卡片 hover | `hover:bg-muted/50`（**提亮**） | `hover:bg-bg-sunken`（**压暗**） |
| 搜索框 focus | `focus-visible:ring-1 focus-visible:ring-brand` | PC `Input` 默认（未读，见 §8.5） |
| 搜索按钮 active | `bg-bg-elevated text-fg` | 不存在 |
| ⋮ 打开 | `data-[state=open]:bg-muted` | 不存在 |
| ⋮ item focus | `focus:text-danger` | 不存在 |
| 卡片按下 | **无 active 态** | **无 active 态** |
| 卡片键盘 | `<button>` 原生 | `role="button" tabIndex={0}` + `onKeyDown Enter/Space` |
| 多选选中 | 不存在 | `bg-bg-elevated ring-1 ring-brand/60` |
| 多选未选 | 不存在 | `bg-bg-sunken hover:bg-bg-elevated` |
| 加载更多 disabled | `disabled:opacity-50` | `loading={isFetching}` |
| 加载态 | 骨架 | 骨架 |
| 空态 | Card 占位 | 居中卡 |
| 错误态 | toast | toast |

### 8.5 待核项

1. **web `Tabs` / `TabsList` / `TabsTrigger` 的实际 className 未读** —— `src/components/ui/tabs.tsx`。web 用的是 shadcn Radix 版（大概率 `underline` 变体），PC 用的是手搓 `inline-flex p-1 rounded-md bg-bg-elevated` 药丸组。**需确认**：读 `tabs.tsx` 后确定「web tab 选中态到底是 underline 还是 pill」—— 这直接决定 §8.2 Tabs 那行是「真差异」还是「两端都是 pill、只是 PC 没图标」。
2. **PC `SortMenu.tsx` className 未读** —— `<SortMenu value onChange/>` 直接出现在顶栏。**需确认**：读 `src/components/library/SortMenu.tsx`。
3. **PC `DeliveriesDropZone.tsx` className 未读** —— 包裹整页，含拖入高亮态。**需确认**：读 `src/components/deliveries/DeliveriesDropZone.tsx`。
4. **PC `Input.tsx` 默认 className 未读** —— §8.2 搜索框、PC `ProfileEdit` 昵称框、`LibraryDetail` 编辑框都依赖它。**需确认**：读 `src/components/ui/Input.tsx`。
5. **PC `handleRefresh` 的 toast 文案未读** —— grep 时只看到调用点在 `:183` 附近。**需确认**。

---

## 9. DeliveryDetail

### 9.0 文件与规模

| | web | PC |
|---|---|---|
| 路径 | `src/app/(main)/deliveries/[id]/page.tsx` | `src/routes/DeliveryDetail.tsx` |
| 行数 | **523** | **407** |
| 路由 | `/deliveries/[id]` | `/deliveries/:id` |
| 外壳标题 | 全局 header | `AppShell.resolveTitle` → `交付详情`（`:43`） |
| 宽度 | `max-w-2xl`（**窄**） | `max-w-3xl`（**宽**） |
| 面包屑 | **有**（页内「← 返回」+ 刷新 icon btn） | **无**（靠 AppShell header ←） |

### 9.1 元素结构树

**web（`:253-521`，三分支）**
```
加载: <div className="px-4 lg:px-8 max-w-2xl mx-auto w-full py-6 space-y-4">
        <Skeleton className="w-full rounded-md" style={{aspectRatio:"16 / 9"}}/>
        <Skeleton className="h-6 w-2/3"/> <Skeleton className="h-4 w-1/3"/>
        <div className="space-y-2 pt-4"> 3× <Skeleton className="h-10 w-full rounded-md"/>
错误: <div className="px-4 lg:px-8 max-w-2xl mx-auto w-full py-10"><Card><CardContent className="p-10 text-center text-fg-muted">
        <Construction className="w-12 h-12 mx-auto text-fg-muted mb-4"/>
        <div className="text-base font-medium mb-1 text-fg">{isError?"加载失败":"未找到该交付物"}</div>
        <div className="text-sm mb-4">{isError?err.message:"可能已被删除, 或归属其他用户。"}</div>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" onClick={refetch}><RefreshCw className="w-4 h-4 mr-2"/>重试</Button>
          <Button variant="outline" onClick={→/deliveries}><ArrowLeft className="w-4 h-4 mr-2"/>返回列表</Button>
正常: <div className="px-4 lg:px-8 max-w-2xl mx-auto w-full py-6">
  <div className="flex items-center justify-between mb-3">
    <Link href="/deliveries" className="inline-flex items-center text-xs text-fg-muted hover:text-fg"><ArrowLeft className="w-4 h-4 mr-1"/>返回</Link>
    <Button variant="ghost" size="icon" disabled={isFetching} aria-label="刷新"><RefreshCcw className={cn("w-4 h-4", isFetching&&"animate-spin")}/></Button>
  {isImage && url && <div className="relative w-full bg-bg-sunken rounded-md overflow-hidden mb-4 border border-border">
     <div className="w-full" style={{aspectRatio:"16 / 9"}}>
       <img className="w-full h-full object-contain"/>
       或 <div className="w-full h-full flex flex-col items-center justify-center text-fg-muted gap-2 p-4">
            <ImageIcon className="w-10 h-10"/><div className="text-sm">图片加载失败</div>}
  <div className="mb-4">
    <h1 className="text-lg font-semibold text-fg leading-snug break-words">{title || "(无标题)"}</h1>
    <div className="flex items-center gap-2 mt-2 flex-wrap">
      <Badge variant="secondary" className="text-[10px] px-1.5 inline-flex items-center gap-1"><TypeIcon className="w-3 h-3"/>{TYPE_LABELS[type]}</Badge>
      <span className="text-xs text-fg-muted font-mono">{timeStr}</span>
      {domain && <span className="text-xs text-fg-muted truncate max-w-[16rem]">{domain}</span>}
  <Card className="mb-4"><CardContent className="p-3 space-y-2 text-sm">
     MetaRow label="类型"=mimeType / label="大小"=sizeStr
     {prompt && <div><div className="text-xs text-fg-muted mb-1">生成提示词</div>
                 <div className="text-sm text-fg break-words whitespace-pre-wrap">{prompt}</div></div>}
     {!prompt && !mimeType && !sizeStr && <div className="text-fg-muted text-xs">无元数据</div>}
  {isDocument && url && <DocumentPreview fileId url title mimeType/>}   ← 内部未读
  <div className="space-y-2">
    <Button className="w-full" disabled={!url}>{ExternalLink className="w-4 h-4 mr-2"}{isWeb?"在浏览器中打开":isImage?"查看原图":"打开文档"}</Button>
    {isWeb  && <Button variant="outline" className="w-full" disabled={!url}><Copy className="w-4 h-4 mr-2"/>复制链接</Button>}
    {isImage && <Button variant="outline" className="w-full" disabled={!url}><Save className="w-4 h-4 mr-2"/>保存到相册</Button>}
    {(isImage||isDocument) && downloadStatus==="done" && <Button variant="outline" className="w-full"><Download className="w-4 h-4 mr-2"/>导出到下载文件夹</Button>}
    {(isImage||isDocument) && (pending|failed) && <Button variant="outline" className="w-full"><RefreshCcw className="w-4 h-4 mr-2"/>{failed?"重试下载":"下载原文件"}</Button>}
    <Button variant="outline" className="w-full" disabled={!sessionId}><MessageSquare className="w-4 h-4 mr-2"/>跳到源对话</Button>
    <Button variant="outline" className="w-full text-danger border-danger/40 hover:bg-danger/10 hover:text-danger"><Trash2 className="w-4 h-4 mr-2"/>删除</Button>
  <AlertDialog>（与 §8 完全同款文案）
```

**PC（`:85-237`，三分支）**
```
加载: <div className="min-h-full px-4 lg:px-8 py-8"><div className="max-w-3xl mx-auto">
        <div className="h-8 w-1/2 bg-bg-sunken rounded animate-pulse"/>
        <div className="h-4 w-1/3 bg-bg-sunken rounded mt-3 animate-pulse"/>
        <div className="h-64 w-full bg-bg-sunken rounded mt-6 animate-pulse"/>
错误: <div className="rounded-md bg-danger-soft/30 border border-danger/40 px-4 py-3 text-sm">加载失败:{err}</div>
      + <Button variant="ghost" size="md">返回列表</Button>
正常: <div className="min-h-full px-4 lg:px-8 py-6"><div className="max-w-3xl mx-auto space-y-5">
  <header className="space-y-2">
    <div className="flex items-center gap-2">
      <span className="text-xs px-2 py-0.5 rounded bg-bg-elevated text-fg-muted">{TYPE_LABEL[type]}</span>
      <span className="text-xs text-fg-subtle font-mono">#{item.id}</span>
      <span className="text-xs text-fg-subtle">·</span>
      <span className="text-xs text-fg-subtle">{formatDate(createdAt)}</span>
      {origin==="user_uploaded" ? <span className="text-xs text-fg-subtle">· 用户上传</span>
                               : <span className="text-xs text-fg-subtle">· AI 生成</span>}
    <h1 className="text-xl font-medium text-fg break-all">{title || "(无标题)"}</h1>
  <div className="rounded-md bg-bg-elevated divide-y divide-border">
    InfoRow "URL" / "MIME"（font-mono）/ "大小" / "提示词"
  <ContentView item onOpenWithSystem/>
  <div className="flex items-center justify-end gap-2 pt-2 flex-wrap">
    返回列表(ghost) / 下载(outline, 仅 image) / 回到对话(outline, 有 sessionId) / <StarButton size="md"/> / 分享到对话(default) / 删除(danger)
  <ConfirmDialog title="删除这条交付?" message="删除后无法恢复。" confirmLabel="确认删除"/>
  <ShareSheet open deliverable onClose/>
```

### 9.2 逐元素映射表

| 层级 | web | PC | 差异 |
|---|---|---|---|
| 内容宽度 | `max-w-2xl` | `max-w-3xl` | **真差异：672px vs 768px** |
| 面包屑（← 返回 + 刷新） | `flex items-center justify-between mb-3` + `inline-flex items-center text-xs text-fg-muted hover:text-fg` + `Button variant="ghost" size="icon"` | **不存在** | 真差异 |
| 大图预览 | `relative w-full bg-bg-sunken rounded-md overflow-hidden mb-4 border border-border` + `aspectRatio 16/9` + `img w-full h-full object-contain` | `rounded-md bg-bg-elevated p-3` + `img max-w-full max-h-[70vh] mx-auto rounded` | **真差异：`border` web 有；底色 `bg-bg-sunken` vs `bg-bg-elevated`；比例 16:9 vs 限高 70vh** |
| 图加载失败 | `flex flex-col items-center justify-center text-fg-muted gap-2 p-4` + `ImageIcon w-10 h-10` + 「图片加载失败」 | **不处理 onError** | 真差异：web 有失败态，PC 无 |
| 标题 | `text-lg font-semibold text-fg leading-snug break-words` | `text-xl font-medium text-fg break-all` | **真差异：`text-lg`(18) vs `text-xl`(20)；`font-semibold` vs `font-medium`；`break-words` vs `break-all`** |
| 类型 badge | `<Badge variant="secondary" className="text-[10px] px-1.5 inline-flex items-center gap-1">` + `<TypeIcon className="w-3 h-3"/>` | `text-xs px-2 py-0.5 rounded bg-bg-elevated text-fg-muted`（**无图标**） | 真差异：web 带 12px 图标，PC 无 |
| 时间 | `format(date,"yyyy-MM-dd HH:mm",{locale:zhCN})`（**固定格式**） | `d.toLocaleString()`（**本地化长格式**） | **真差异：格式完全不同**（web `2026-10-21 14:30` vs PC `2026/10/21 14:30:00`） |
| 域名 | `text-xs text-fg-muted truncate max-w-[16rem]` | 不存在 | 真差异 |
| ID | 不存在 | `text-xs text-fg-subtle font-mono` `#{item.id}` | PC 独有 |
| 来源 | 不存在 | `· 用户上传` / `· AI 生成` | PC 独有 |
| 元信息卡 | `<Card>`+`<CardContent className="p-3 space-y-2 text-sm">` + `<MetaRow>`（`:517` 未读）+ 「生成提示词」小节 | `rounded-md bg-bg-elevated divide-y divide-border` + `<InfoRow>`（`flex items-start gap-4 px-4 py-3` > `w-16 text-sm text-fg-muted shrink-0 pt-0.5`） | **真差异：web 无分隔线（Card），PC 用 `divide-y` 分隔线** |
| 文档预览 | `<DocumentPreview fileId mimeType url title/>`（组件内未读） | `ContentView`：`text/html`→`<iframe className="w-full h-[70vh] bg-bg-sunken">`；`text/*`→居中卡 + 「在浏览器查看」；其他→「打开」+系统应用 | 形态完全不同 |
| 操作区排布 | `space-y-2` **竖排全宽按钮**（每个 `className="w-full"`） | `flex items-center justify-end gap-2 pt-2 flex-wrap` **横排** | **重大真差异：竖排 vs 横排** |
| 主 CTA 文案 | `在浏览器中打开` / `查看原图` / `打开文档`（**按类型三分**） | `打开`（ContentView 内统一） | 否 |
| 复制链接 | 有（`isWeb` 才显示） | **无** | 真差异 |
| 保存到相册 | 有（`isImage` 才显示） | **无**（PC 的「下载」走系统应用） | 真差异 |
| 下载状态机 | `downloadStatus` 三态互斥：`导出到下载文件夹` / `重试下载` / `下载原文件` | **无**（只有 image 的 `下载` outline 按钮） | **重大真差异：web 有 downloadStatus 状态机，PC 无** |
| 跳源对话 | `跳到源对话` | `回到对话` | **否** |
| 收藏 | **无** | `<StarButton deliverableId size="md"/>` | PC 独有 |
| 分享 | **无** | `分享到对话`（default 变体）+ `<ShareSheet>` | PC 独有 |
| 删除按钮 | `variant="outline"` + `className="w-full text-danger border-danger/40 hover:bg-danger/10 hover:text-danger"` | `variant="danger"`（实心红） | **真差异：描边红 vs 实心红** |
| 加载态 | `<Skeleton>` ×5（含 `aspectRatio 16/9` 大块） | 3 块 `bg-bg-sunken rounded animate-pulse` | 真差异（骨架形状不同） |
| 错误态 | 居中 `Card` + `Construction` 图标 + **「重试」按钮** + 「返回列表」按钮 | `rounded-md bg-danger-soft/30 border border-danger/40` 红条 + 仅「返回列表」 | **真差异：web 有重试按钮，PC 没有** |
| 错误文案 | `加载失败` / `未找到该交付物` / `可能已被删除, 或归属其他用户。` | `加载失败:{err}` / `未找到` | 否 |

### 9.3 文案对照

| 位置 | web | PC | 一致 |
|---|---|---|---|
| 返回 | `返回` | （无面包屑；底部 `返回列表`） | 否 |
| 错误主 | `加载失败` / `未找到该交付物` | `加载失败:{err}` | 否 |
| 错误副 | `{err.message}` / `可能已被删除, 或归属其他用户。` | `未找到` | 否 |
| 错误按钮 | `重试` / `返回列表` | `返回列表` | 否 |
| 标题兜底 | `(无标题)` | `(无标题)` | ✅ |
| 元信息 label | `类型` / `大小` / `生成提示词` / `无元数据` | `URL` / `MIME` / `大小` / `提示词` | **否（`类型` vs `MIME`；`生成提示词` vs `提示词`；web 有 `无元数据` 兜底，PC 无）** |
| 主 CTA | `在浏览器中打开` / `查看原图` / `打开文档` | `打开` | 否 |
| 复制链接 | `复制链接` | 无 | 否 |
| 保存到相册 | `保存到相册` | 无 | 否 |
| 下载三态 | `导出到下载文件夹` / `重试下载` / `下载原文件` | `下载`（仅 image） | 否 |
| 跳源对话 | `跳到源对话` | `回到对话` | 否 |
| 分享 | 无 | `分享到对话` | 否 |
| 收藏 | 无 | （`StarButton`，文案未读，见 §9.5） | — |
| 删除 | `删除` | `删除` / `确认删除` | 否 |
| 删除确认 | `确定删除该交付物？` / `将从你的交付中心移除“{title}”。此操作不可撤销。` / `我确定` | `删除这条交付?` / `删除后无法恢复。` / `确认删除` | 否 |
| ContentView 提示 | — | `网页类交付物` / `{mime} 文件` / `点击「打开」用系统默认浏览器查看` / `点击「打开」用系统默认应用查看 (PDF / Office / 图片查看器 / 视频播放器 / 压缩包工具)` / `无 URL` / `无内容` / `在浏览器查看` | PC 独有 |
| 分享 Sheet | 无 | （文案未读，见 §9.5） | — |

### 9.4 交互态对照

| 状态 | web | PC |
|---|---|---|
| 返回链接 hover | `hover:text-fg` | — |
| 刷新 disabled | `disabled={isFetching}`（Button ghost icon） | — |
| 刷新 spinning | `animate-spin` | — |
| 刷新图标 | `RefreshCcw`（双 C 循环） | — |
| CTA disabled | `disabled={!item.url}` / `disabled={!item.sessionId}` | 无 disabled（条件渲染代替） |
| 删除 hover | `hover:bg-danger/10 hover:text-danger` | PC `Button variant="danger"` 默认 hover（未读 `Button.tsx`） |
| 加载态 | 骨架 | 骨架 |
| 错误态 | Card + 重试 | 红条，**无重试** |
| 空态 | 不适用 | `无内容` / `无 URL` |

### 9.5 待核项

1. **web `MetaRow.tsx` className 未读** —— `deliveries/[id]/page.tsx:517` 定义。**需确认**：读该文件补 §9.2「元信息卡」行。
2. **web `DocumentPreview` 组件 className 未读** —— web 的文档内嵌预览是独立组件。**需确认**：定位路径后读（`src/components/.../DocumentPreview`）。
3. **PC `StarButton.tsx` / `ShareSheet.tsx` className + 文案未读** —— `src/components/deliveries/` 下。**需确认**。
4. **PC `Button.tsx` 各 variant 的 className 未读** —— 本批多处结论（`variant="danger"` / `ghost` / `outline` / `default` 的实际视觉）依赖它。批 1 §6 记录 `variant="default"` 是 `bg-brand text-brand-on`。**需确认**：读 `src/components/ui/Button.tsx` 补全 danger/outline/ghost 三个 variant。
5. **web `Button` variant className 未读** —— 同上，`src/components/ui/button.tsx`。

---

## 10. Browser

### 10.0 文件与规模

| | web | PC |
|---|---|---|
| 路径 | `src/app/(main)/browser/page.tsx` | `src/routes/Browser.tsx` |
| 行数 | **152** | **1227** |
| 路由 | `/browser?url=…&title=…` | `/browser` |
| 产品形态 | **只读 iframe 查看器**（必须外部带 `url` 参数进来） | **完整浏览器**（标签页 + 地址栏 + 收藏 + 历史 + AI 总结 + 长按菜单） |
| 渲染载体 | `<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups">` | Electron `<webview sandbox=… webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=yes">` |
| SSRF 防护 | 有（`isPrivateHost` 拒绝 localhost/RFC1918/link-local，`:18-40`） | **无**（PC 直接 `new URL`，见 §10.5） |
| 外壳标题 | `AppShell.resolveTitle("/browser")` → `浏览器`（`:49`） | 同 |

**这是全批最大的结构性差异**：web 是「从别处跳进来看一眼」的 viewer，PC 是「从零导航进去」的浏览器。两者不是同一个页面的两个实现。**需 PM 拍板对齐方向**（见 §6.2）。

### 10.1 元素结构树

**web（`:76-136`，三分支）**
```
<div className="flex flex-col h-full bg-bg-base text-fg">
  <header className="flex-none flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-elevated min-h-[44px]">
    <button onClick={router.back} className="p-2 rounded hover:bg-bg-sunken shrink-0" aria-label="返回"><ArrowLeft size={18}/></button>
    <div className="flex-1 min-w-0 truncate text-xs sm:text-sm font-mono text-fg-muted">{safeUrl || urlParam || "—"}</div>
    {titleParam && <div className="hidden sm:block text-xs text-fg-subtle truncate max-w-[200px] shrink-0">{titleParam}</div>}
    {safeUrl && <a href={safeUrl} target="_blank" rel="noopener noreferrer" className="p-2 rounded hover:bg-bg-sunken shrink-0" aria-label="外部打开"><ExternalLink size={16}/></a>}
  <div className="flex-1 overflow-hidden bg-bg-base">
    error  → <div className="flex flex-col items-center justify-center h-full p-8 text-center text-fg-muted">
              <Shield size={32} className="mx-auto mb-3 text-danger"/>
              <p className="text-sm font-medium mb-1">无法打开链接</p>
              <p className="text-xs text-fg-subtle max-w-xs break-all">{error}</p>
              {urlParam && <p className="text-[11px] text-fg-subtle mt-2 font-mono break-all max-w-md">{urlParam}</p>}
    safeUrl→ <iframe src={safeUrl} sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                     className="w-full h-full border-0" referrerPolicy="no-referrer" title={titleParam || "Browser"}/>
    else   → <div className="flex items-center justify-center h-full p-8 text-fg-muted text-sm">加载中...</div>
```
（外层还有 `<Suspense fallback={<div className="flex items-center justify-center h-full p-8 text-fg-muted text-sm">加载中...</div>}>`，`:142-150`）

**PC（`:481-757`）**
```
<div className="min-h-full flex flex-col">
  <div className="shrink-0 flex items-center gap-1 px-3 py-2 bg-bg-elevated overflow-x-auto">       ← tab bar
    {tabs.map(t=><div role="tab" className={["group inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm shrink-0","cursor-pointer","max-w-[200px]",
              active ? "bg-bg-elevated text-fg" : "bg-bg-sunken text-fg-muted hover:text-fg"].join(" ")}>
        {t.loading ? <span className="gagaos-spinner shrink-0"/>
          : t.failed ? <span className="shrink-0 text-danger">⚠</span>
          : <span className="shrink-0 w-2 h-2 rounded-full bg-success"/>}
        <span className="truncate">{t.title || hostFromUrl(t.url)}</span>
        <button aria-label="关闭标签" className="shrink-0 text-fg-muted hover:text-fg">×</button></div>)}
    <button aria-label="新建标签" className="shrink-0 w-7 h-7 rounded-md text-fg-muted hover:bg-bg-elevated hover:text-fg inline-flex items-center justify-center">+</button>
  <div className="flex-1 relative bg-bg-base">
    {active.progress>0 && <div className="absolute top-0 left-0 right-0 h-1 z-10 bg-bg-elevated">
                            <div className="h-full bg-brand" style={{width:`${active.progress}%`}}/>}
    active ? <WebviewPane …/> : <div className="absolute inset-0 flex items-center justify-center text-fg-subtle text-sm">没有 tab</div>
  <div className="shrink-0 bg-bg-elevated px-3 py-2 space-y-2">                                    ← URL bar
    <form className="rounded-md bg-bg-elevated p-2 flex items-center gap-2">
      [←后退][→前进][主页] <IconButton/>   [刷新] <IconButton/>
      <Input type="search" placeholder="输入网址或搜索关键词" className="flex-1 py-2 text-sm"/>
      [收藏][AI 总结][收藏夹] <IconButton/>  <Button type="submit" variant="default" size="md" disabled={!urlInput.trim()}>前往</Button>
    <div className="flex flex-wrap gap-2">
      {QUICK_LINKS.map(l=><button className="text-xs px-2 py-1 rounded-md bg-bg-sunken text-fg-muted hover:text-fg hover:bg-bg-elevated">{l.label}</button>)}
      {history.length>0 && <button className="ml-auto text-xs text-fg-subtle hover:text-fg">清空历史</button>}
  <BottomSheet title={`收藏夹 (${n})`}> 空态 "还没有收藏的网页" / <ul className="divide-y divide-border"> …
  <BottomSheet title="AI 总结" footer={<Button ghost>关闭</Button><Button default loading>保存到知识库</Button>}>
    <div className="text-xs text-fg-subtle break-all">{summaryUrl || "(加载中…)"}</div>
    {loading ? <div className="text-sm text-fg-muted">正在总结…</div> : <div className="text-sm whitespace-pre-wrap text-fg">{summaryText}</div>}
  <LongPressMenu anchor onClose items={longPressItems}/>
```

PC `IconButton`（`:921-928`）：
```
className={["shrink-0 w-8 h-8 rounded-md inline-flex items-center justify-center",
  disabled ? "text-fg-subtle opacity-40 cursor-not-allowed"
    : active ? "bg-brand-container text-brand-on-container hover:bg-brand-container/80"
    : "text-fg-muted hover:bg-bg-sunken hover:text-fg"].join(" ")}
```

### 10.2 逐元素映射表

| 层级 | web | PC | 差异 |
|---|---|---|---|
| 整体形态 | 152 行 viewer，**无 tab / 无地址栏输入 / 无收藏 / 无历史** | 1227 行完整浏览器，**7 类 UI 全有** | **重大结构差异，非 className 级** |
| 顶栏容器 | `flex-none flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-elevated min-h-[44px]` | `shrink-0 flex items-center gap-1 px-3 py-2 bg-bg-elevated overflow-x-auto`（tab bar） | **真差异：web 有 `border-b` + `min-h-[44px]`；PC 无 border（且 PC 还有第二个 `bg-bg-elevated` 的 URL bar 区块）** |
| 返回 | `<button className="p-2 rounded hover:bg-bg-sunken shrink-0" aria-label="返回"><ArrowLeft size={18}/>` | `<IconButton ariaLabel="后退">` = `shrink-0 w-8 h-8 rounded-md …` + `ArrowLeftIcon`(SVG 20) | 真差异：**`rounded`(8) vs `rounded-md`(16)；`p-2`(≈36px) vs `w-8 h-8`(32px)；lucide 18px vs 自绘 SVG 20px** |
| URL 显示 | `flex-1 min-w-0 truncate text-xs sm:text-sm font-mono text-fg-muted` | **不存在**（URL 只出现在 tab 标题 / tab 失败态） | 真差异 |
| URL 输入 | 不存在 | `<Input type="search" placeholder="输入网址或搜索关键词" className="flex-1 py-2 text-sm">` | PC 独有 |
| 标题 | `hidden sm:block text-xs text-fg-subtle truncate max-w-[200px] shrink-0` | tab 内 `<span className="truncate">` | 位置不同 |
| 外部打开 | `<a className="p-2 rounded hover:bg-bg-sunken shrink-0" aria-label="外部打开"><ExternalLink size={16}/>` | **不存在** | 真差异：web 有「系统浏览器打开」，PC 用 `openWithSystem` IPC 但本页无按钮 |
| tab bar | 不存在 | `shrink-0 flex items-center gap-1 px-3 py-2 bg-bg-elevated overflow-x-auto` | PC 独有 |
| 单 tab | 不存在 | `group inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm shrink-0 cursor-pointer max-w-[200px]` + `active?"bg-bg-elevated text-fg":"bg-bg-sunken text-fg-muted hover:text-fg"` | PC 独有。**注意：active tab 用 `bg-bg-elevated` = `#181818`，而 tab bar 自身也是 `bg-bg-elevated` → active tab 视觉上「不突出」** |
| tab 状态点 | 不存在 | loading `<span className="gagaos-spinner shrink-0"/>` / failed `<span className="shrink-0 text-danger">⚠</span>` / ok `<span className="shrink-0 w-2 h-2 rounded-full bg-success"/>` | PC 独有（`gagaos-spinner` 定义待核，批 1 §6 #3） |
| 新建 tab | 不存在 | `shrink-0 w-7 h-7 rounded-md text-fg-muted hover:bg-bg-elevated hover:text-fg inline-flex items-center justify-center` | PC 独有 |
| 前进/主页/刷新 | 不存在 | 3 个 `<IconButton>` | PC 独有 |
| 收藏 / 收藏夹 / AI 总结 | 不存在 | 3 个 `<IconButton>`（收藏带 `active` 态 `bg-brand-container text-brand-on-container hover:bg-brand-container/80`） | PC 独有 |
| 前往按钮 | 不存在 | `<Button type="submit" variant="default" size="md" disabled={!urlInput.trim()}>前往</Button>` | PC 独有 |
| 常用链接 | 不存在 | `text-xs px-2 py-1 rounded-md bg-bg-sunken text-fg-muted hover:text-fg hover:bg-bg-elevated` | PC 独有（`QUICK_LINKS` 内容未读，见 §10.5） |
| 内容容器 | `flex-1 overflow-hidden bg-bg-base` | `flex-1 relative bg-bg-base` | 真差异：PC 多 `relative`（进度条/空态绝对定位需要） |
| 加载进度条 | 不存在 | `absolute top-0 left-0 right-0 h-1 z-10 bg-bg-elevated` > `h-full bg-brand` | PC 独有 |
| 渲染载体 | `<iframe className="w-full h-full border-0" sandbox=… referrerPolicy="no-referrer">` | `<webview style={{position:"absolute",inset:0,width:"100%",height:"100%",border:"none"}} sandbox=… webpreferences="contextIsolation=yes,nodeIntegration=no,sandbox=yes">` | **真差异：`iframe` vs Electron `webview`**；`sandbox` 值**完全相同** |
| 错误态 | `Shield size={32} className="mx-auto mb-3 text-danger"` + 「无法打开链接」+ `text-xs text-fg-subtle max-w-xs break-all` + 原始 URL `text-[11px] … font-mono break-all max-w-md` | `absolute inset-0 flex items-center justify-center bg-bg-base text-fg-subtle text-sm` > `<p className="text-base">加载失败</p>` + `<p className="text-xs">{tab.url}</p>` + `<Button size="sm">重试</Button>` | **真差异：web 无重试按钮、PC 无 Shield 图标；文案「无法打开链接」vs「加载失败」；PC 多 `bg-bg-base`** |
| 加载态 | `flex items-center justify-center h-full p-8 text-fg-muted text-sm`「加载中...」 | `gagaos-spinner` 在 tab 上（无正文占位） | 真差异 |
| 空态 | 不存在 | `absolute inset-0 flex items-center justify-center text-fg-subtle text-sm`「没有 tab」 | PC 独有 |
| 收藏 Sheet | 不存在 | `<BottomSheet title={`收藏夹 (${n})`}>` + 空态 `text-sm text-fg-muted text-center py-6`「还没有收藏的网页」+ `<ul className="divide-y divide-border">` + 行 `flex items-center gap-3 py-2 cursor-pointer hover:bg-bg-sunken rounded-md px-2` | PC 独有 |
| AI 总结 Sheet | 不存在 | `<BottomSheet title="AI 总结" footer={…}>` | PC 独有 |
| 长按菜单 | 不存在 | `<LongPressMenu anchor onClose items/>`（注入脚本监听 contextmenu/touch） | PC 独有 |

### 10.3 文案对照

| 位置 | web | PC | 一致 |
|---|---|---|---|
| 返回 aria | `返回` | `后退` | 否 |
| 外部打开 aria | `外部打开` | 不存在 | — |
| URL 占位符 | `—`（em dash） | 不存在 | — |
| 地址栏 placeholder | 不存在 | `输入网址或搜索关键词` | — |
| 无 tab | 不存在 | `没有 tab` | — |
| 加载中 | `加载中...` | （无正文文案） | 否 |
| 加载失败主 | `无法打开链接` | `加载失败` | 否 |
| 重试 | 不存在 | `重试` | — |
| 新建 tab | 不存在 | `+`（aria `新建标签`） | — |
| 关闭 tab | 不存在 | `×`（aria `关闭标签`） | — |
| 收藏 aria | 不存在 | `加入收藏` / `取消收藏` | — |
| 收藏 Sheet 空 | 不存在 | `还没有收藏的网页` | — |
| AI 总结 | 不存在 | `AI 总结` / `正在总结…` / `保存到知识库` / `关闭` | — |
| 清空历史 | 不存在 | `清空历史` | — |
| 错误详情（协议/内网） | `URL 参数缺失` / `不允许的协议: {p}` / `不允许访问内网地址: {h}` / `URL 解析失败: {m}` | **无任何 URL 校验文案** | 否 |

### 10.4 交互态对照

| 状态 | web | PC |
|---|---|---|
| 返回 hover | `hover:bg-bg-sunken` | `text-fg-muted hover:bg-bg-sunken hover:text-fg`（IconButton） |
| IconButton disabled | 不适用 | `text-fg-subtle opacity-40 cursor-not-allowed` |
| IconButton active（收藏中） | 不适用 | `bg-brand-container text-brand-on-container hover:bg-brand-container/80` |
| tab 未选中 hover | 不适用 | `hover:text-fg` |
| tab 关闭钮 hover | 不适用 | `hover:text-fg` |
| 新建 tab hover | 不适用 | `hover:bg-bg-elevated hover:text-fg` |
| 前往 disabled | 不适用 | `disabled={!urlInput.trim()}`（Button 内部 disabled 态未读 `Button.tsx`） |
| 常用链接 hover | 不适用 | `hover:text-fg hover:bg-bg-elevated` |
| tab 激活 | 不适用 | `bg-bg-elevated text-fg`（**与 tab bar 同色，见 §10.2 注**） |
| 加载态 | 文字 | spinner |
| 错误态 | Shield + 文案 | 文字 + 重试 |
| 空态 | 不适用 | 「没有 tab」 |

### 10.5 待核项

1. **PC `BottomSheet.tsx` / `LongPressMenu.tsx` className 未读** —— 两个 sheet 容器视觉未定。**需确认**：读 `src/components/ui/BottomSheet.tsx`、`src/components/ui/LongPressMenu.tsx`。
2. **PC `QUICK_LINKS` 常量内容未读** —— 在 `Browser.tsx` 顶部（`:1-60` 未读）。**需确认**：常用链接是哪些站点。
3. **PC `buildLongPressItems`（`:855-905`）文案未读** —— 长按菜单项文案。**需确认**。
4. **PC `normalizeUrl`（`:60-71`）是否有 SSRF 防护未读** —— `:1-59` 未读。**需确认**：web 有 `isPrivateHost` 拒绝内网，PC 若无则 `?url=` 语义下是安全隐患（PC 走 tab 内直接输入 URL，不接受外部 query，风险等级不同）。**需 PM 判定是否要求对齐**。
5. **PC `summaryLoading` / `savingToLibrary` 之外的 AI 总结请求端点未读** —— 属接口层，非 DOM。**不阻塞本表**。

---

## 11. ProfileEdit

### 11.0 文件与规模

| | web | PC |
|---|---|---|
| 路径 | `src/app/(main)/profile/edit/page.tsx` | `src/routes/ProfileEdit.tsx` |
| 行数 | **267** | **344** |
| 路由 | `/profile/edit` | `/profile/edit` |
| 外壳标题 | `setHeaderTitle("编辑资料")` | `AppShell.resolveTitle("/profile/edit")` → `编辑资料`（`:46`） |
| 页面内 H1 | **无**（标题靠全局 header） | **有** `<h1 className="text-xl font-medium">编辑资料</h1>` |
| 宽度 | `max-w-2xl` | `max-w-2xl` ✅ |
| 邮箱字段 | **无** | 有（只读 `Input disabled`） |
| 加载态 | **无** | 有（`h-8 w-1/3 bg-bg-sunken rounded animate-pulse`） |

### 11.1 元素结构树

**web（`:150-266`，单分支）**
```
<div className="px-4 lg:px-8 py-6 max-w-2xl mx-auto">
  <div className="flex flex-col items-center mb-8">
    <div className="relative">
      <Avatar className="w-24 h-24"><AvatarImage src alt="avatar"/><AvatarFallback>{initials}</AvatarFallback></Avatar>
      <button aria-label="更换头像" className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-brand text-brand-on flex items-center justify-center shadow-elevation-2 hover:bg-brand-hover transition-colors"><Camera className="w-4 h-4"/></button>
      <input type="file" accept="image/*" className="hidden"/>
    <p className="text-xs text-fg-muted mt-2">点击相机图标更换头像</p>
  <div className="mb-5">
    <label className="block text-sm font-medium mb-2" htmlFor="displayName">昵称</label>
    <Input id="displayName" placeholder="你的昵称" maxLength={30}/>
    <p className="text-xs text-fg-subtle mt-1">留空将使用用户名 ({user?.username})</p>
  <div className="mb-5">
    <label className="block text-sm font-medium mb-2">性别</label>
    <div className="inline-flex p-1 rounded-md bg-bg-elevated border border-border">
      {genderOptions.map(o=><button className={cn("px-4 py-1.5 text-sm rounded transition-colors",
                            active?"bg-brand text-brand-on shadow-sm":"text-fg-muted hover:text-fg")}>{o.label}</button>)}
  <div className="mb-6">
    <label className="block text-sm font-medium mb-2" htmlFor="bio">简介</label>
    <Textarea id="bio" rows={4} maxLength={200} placeholder="介绍一下自己..."/>
    <div className="flex justify-end mt-1"><span className={cn("text-xs", bio.length>180?"text-warning":"text-fg-subtle")}>{len} / 200</span></div>
  <div className="flex gap-3">
    <Button variant="outline" className="flex-1" disabled={saving}>取消</Button>
    <Button className="flex-1 gap-2" disabled={saving}>{saving?<Loader2 className="w-4 h-4 animate-spin"/>:<Save className="w-4 h-4"/>}保存</Button>
```

**PC（`:156-339`，两分支）**
```
加载: <div className="min-h-full px-4 lg:px-8 py-6"><div className="max-w-2xl mx-auto">
        <div className="h-8 w-1/3 bg-bg-sunken rounded animate-pulse"/>
正常: <div className="min-h-full px-4 lg:px-8 py-6"><div className="max-w-2xl mx-auto space-y-5">
  <h1 className="text-xl font-medium">编辑资料</h1>
  <div className="flex items-center gap-4 rounded-md bg-bg-elevated p-4">                     ← 头像卡（PC 独有布局）
    <div className="relative shrink-0">
      {avatar ? <img className="w-16 h-16 rounded-full object-cover"/> :
                <div aria-hidden className="w-16 h-16 rounded-full bg-brand/30 border border-brand/40 flex items-center justify-center text-fg text-xl font-medium">{initial}</div>}
      <button aria-label="更换头像" disabled={pending} className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-brand text-brand-on flex items-center justify-center hover:bg-brand-hover transition-colors duration-150 disabled:opacity-50"><CameraIcon/></button>
      <input type="file" accept="image/*" className="hidden"/>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium">头像</p>
      <p className="text-xs text-fg-subtle mt-1">支持 JPG / PNG / WebP,最大 5 MB</p>
  <div> 昵称 label `block text-sm font-medium mb-2` + <Input placeholder="你的昵称" maxLength={64}/>
       + <p className="text-xs text-fg-subtle mt-1">留空将使用用户名 ({profile?.username \|\| "-"})</p>
  {profile?.email && <div> 邮箱 label + <Input value readOnly disabled/> + <p className="text-xs text-fg-subtle mt-1">邮箱暂不支持修改</p>}
  <div> 性别 label `block text-sm font-medium mb-2` + <div className="inline-flex p-1 rounded-md bg-bg-elevated gap-1">
         {GENDER_OPTIONS.map(o=><button className={["px-4 py-1.5 text-sm rounded transition-colors duration-150",
                                active?"bg-brand text-brand-on shadow-sm":"text-fg-muted hover:text-fg"].join(" ")}>{o.label}</button>)}
  <div> 简介 label + <textarea rows={4} maxLength={500} placeholder="介绍一下自己..."
           className={["flex w-full rounded-md border border-border bg-bg-sunken px-4 py-3 text-base",
             "placeholder:text-fg-subtle","transition-colors duration-150","focus:outline-none focus:border-brand",
             "disabled:cursor-not-allowed disabled:opacity-50","resize-y"].join(" ")}/>
       + <div className="flex justify-end mt-1"><span className={["text-xs", len>480?"text-warning":"text-fg-subtle"].join(" ")}>{len} / 500</span></div>
  <div className="flex gap-3 pt-2">
    <Button variant="outline" size="lg" className="flex-1" disabled={saveMutation.isPending}>取消</Button>
    <Button variant="default" size="lg" className="flex-1" loading={saveMutation.isPending}>保存</Button>
```

### 11.2 逐元素映射表

| 层级 | web className（原文） | PC className（原文） | 差异 |
|---|---|---|---|
| 根容器 | `px-4 lg:px-8 py-6 max-w-2xl mx-auto` | `min-h-full px-4 lg:px-8 py-6` > `max-w-2xl mx-auto space-y-5` | 真差异：PC 多 `space-y-5`（用 gap 代替 web 的逐块 `mb-*`） |
| 页面 H1 | **无** | `text-xl font-medium` | PC 独有（**且与全局 header 标题「编辑资料」重复**） |
| 头像布局 | `flex flex-col items-center mb-8`（**垂直居中**） | `flex items-center gap-4 rounded-md bg-bg-elevated p-4`（**横向 + 卡片底**） | **真差异：web 无卡片底、PC 有 `bg-bg-elevated` 卡** |
| 头像尺寸 | `w-24 h-24`（**96px**，shadcn `Avatar`） | `w-16 h-16`（**64px**） | **真差异：96px vs 64px（差 32px）**。注意：批 1 §5.5 记录 web `profile/page.tsx:35` 注释写「头像 72px」，与此处实际的 `w-24`(96px) **也不符** → **web 自身三处不一致** |
| 头像形状 | `<Avatar>`（shadcn，内部 radius 未读） | `rounded-full` | 待核（web `Avatar` 组件未读） |
| 头像兜底 | `<AvatarFallback seed={…}>{initials}</AvatarFallback>` | `rounded-full bg-brand/30 border border-brand/40 flex items-center justify-center text-fg text-xl font-medium` | 待核（web `AvatarFallback` 未读） |
| 相机按钮尺寸 | `w-8 h-8`（32px） | `w-7 h-7`（28px） | **真差异：32 vs 28** |
| 相机按钮阴影 | `shadow-elevation-2` | 无阴影 | 真差异 |
| 相机按钮 disabled | 无 | `disabled:opacity-50`（`disabled={avatarMutation.isPending}`） | PC 独有 |
| 头像说明文案 | `text-xs text-fg-muted mt-2`「点击相机图标更换头像」 | `text-sm font-medium`「头像」+ `text-xs text-fg-subtle mt-1`「支持 JPG / PNG / WebP,最大 5 MB」 | **否（位置+文案全不同）** |
| 头像体积上限 | **2 MB**（`file.size > 2*1024*1024` → toast「图片不能超过 2 MB」） | **5 MB**（`> 5*1024*1024` → toast「头像不能超过 5 MB」） | **真差异：2MB vs 5MB** |
| 非图片提示 | toast `请选择图片文件`（variant `warning`） | toast `请选择图片文件`（variant **`danger`**） | 真差异：变体不同 |
| 昵称 label | `block text-sm font-medium mb-2` | 同 | ✅ |
| 昵称 maxLength | **30** | **64** | **真差异：30 vs 64** |
| 昵称 hint | `text-xs text-fg-subtle mt-1`「留空将使用用户名 ({user?.username})」 | 同款，但兜底 `{profile?.username \|\| "-"}` | 基本一致（PC 多了 `-` 兜底） |
| 邮箱字段 | **无** | `Input value readOnly disabled` + hint「邮箱暂不支持修改」 | **PC 独有** |
| 性别选项 | `男` / `女` / `保密`（**3 项**，顺序 男-女-保密） | `保密` / `男` / `女` / `其他`（**4 项**，顺序保密-男-女-其他） | **真差异：项数 3 vs 4；顺序不同；PC 多「其他」** |
| 性别容器 | `inline-flex p-1 rounded-md bg-bg-elevated border border-border` | `inline-flex p-1 rounded-md bg-bg-elevated gap-1` | **真差异：web 有 `border border-border`，PC 用 `gap-1`** |
| 性别按钮 | `px-4 py-1.5 text-sm rounded transition-colors` | `px-4 py-1.5 text-sm rounded transition-colors duration-150` | 真差异：PC 多 `duration-150` |
| 简介 maxLength | **200**（`BIO_MAX = 200`） | **500**（`BIO_MAX = 500`） | **真差异：200 vs 500** |
| 简介组件 | `<Textarea>`（shadcn，未读） | 裸 `<textarea>` + 手写 className | 待核（web `Textarea.tsx` 未读） |
| 简介底色 | 未读（走 Textarea 默认） | `bg-bg-sunken` + `border border-border` + `px-4 py-3 text-base` | 待核 |
| 简介 resize | 未读 | `resize-y` | 待核 |
| 字数警告阈值 | `bio.length > BIO_MAX - 20` = **>180** | `bio.length > BIO_MAX - 20` = **>480** | 真差异（逻辑同，阈值不同） |
| 取消按钮 | `variant="outline"` + `className="flex-1"`，**无 `size`** | `variant="outline" size="lg"` + `className="flex-1"` | 真差异：PC 多 `size="lg"` |
| 保存按钮 | **无 variant**（默认）+ `className="flex-1 gap-2"` + 按钮内 `Save` icon | `variant="default" size="lg"` + `className="flex-1"`，**无 icon** | **真差异：web 有 `gap-2` + 图标，PC 无图标** |
| 加载态 | 无 | `h-8 w-1/3 bg-bg-sunken rounded animate-pulse` | PC 独有 |

### 11.3 文案对照

| 位置 | web | PC | 一致 |
|---|---|---|---|
| 页面标题 | （全局 header `编辑资料`） | `编辑资料`（H1）+ 全局 header 同 | 内容一致，**重复显示** |
| 头像说明 | `点击相机图标更换头像` | `头像` / `支持 JPG / PNG / WebP,最大 5 MB` | 否 |
| 昵称 label | `昵称` | `昵称` | ✅ |
| 昵称 placeholder | `你的昵称` | `你的昵称` | ✅ |
| 昵称 hint | `留空将使用用户名 ({username})` | `留空将使用用户名 ({username \|\| "-"})` | ✅ |
| 邮箱 label | 不存在 | `邮箱` / `邮箱暂不支持修改` | 否 |
| 性别 label | `性别` | `性别` | ✅ |
| 性别选项 | `男`/`女`/`保密` | `保密`/`男`/`女`/`其他` | 否 |
| 简介 label | `简介` | `简介` | ✅ |
| 简介 placeholder | `介绍一下自己...` | `介绍一下自己...` | ✅ |
| 字数 | `{n} / 200` | `{n} / 500` | 否 |
| 按钮 | `取消` / `保存` | `取消` / `保存` | ✅ |
| toast 上传成功 | `头像已更新` | `头像已更新` | ✅ |
| toast 保存成功 | `资料已保存` | `已保存` | 否 |
| toast 上传失败 | `头像上传失败` | `头像上传失败: {err}` | 否（PC 拼了 err） |
| toast 保存失败 | `保存失败` | `保存失败: {err}` | 否 |
| toast 超限 | `图片不能超过 2 MB` | `头像不能超过 5 MB` | 否 |
| toast 非图片 | `请选择图片文件` | `请选择图片文件` | ✅（变体 warning vs danger） |
| 校验 | `简介不能超过 200 字` | `简介不能超过 500 字符` / `昵称不能超过 64 字符` | 否（**PC 多昵称长度校验，web 没有**） |

### 11.4 交互态对照

| 状态 | web | PC |
|---|---|---|
| 头像卡 hover | **无**（`flex flex-col items-center mb-8` 无卡） | **无**（卡本身无 hover） |
| 相机钮 hover | `hover:bg-brand-hover` | `hover:bg-brand-hover` ✅ |
| 相机钮 disabled | 无 | `disabled:opacity-50` |
| 性别选中 | `bg-brand text-brand-on shadow-sm` | `bg-brand text-brand-on shadow-sm` ✅ |
| 性别未选中 | `text-fg-muted hover:text-fg` | `text-fg-muted hover:text-fg` ✅ |
| 简介 focus | 未读（走 Textarea 默认） | `focus:outline-none focus:border-brand` |
| 简介 disabled | 未读 | `disabled:cursor-not-allowed disabled:opacity-50` |
| 字数警告 | `text-warning`（>180） | `text-warning`（>480） |
| 字数正常 | `text-fg-subtle` | `text-fg-subtle` ✅ |
| 保存中 | `disabled` + `<Loader2 className="w-4 h-4 animate-spin"/>` | `loading`（`gagaos-spinner`，待核） |
| 取消中 | `disabled={saving}` | `disabled={saveMutation.isPending}` ✅ |
| 加载态 | 无 | 骨架 |
| 错误态 | toast | toast |

### 11.5 待核项

1. **web `Avatar` / `AvatarFallback` / `Textarea` 组件 className 未读** —— `src/components/ui/avatar.tsx`、`src/components/ui/textarea.tsx`。这两处决定「头像形状」「简介底色/字号/resize」能否下结论。**需确认**。
2. **web `profile/page.tsx:35` 注释「头像 72px」与实际 `w-24`(96px) 不符** —— 见 §11.2 注。**需 PM 确认目标尺寸**（72 / 96 / 64 三选一）。
3. **`BIO_MAX` 200 vs 500、`DISPLAY_NAME_MAX` 30 vs 64 —— 哪个是设计目标值待定** —— web 与 PC 不一致，且两端都无 design-spec 引用。**需 PM 拍板**。

---

## 12. ProfileApps

### 12.0 文件与规模

| | web | PC |
|---|---|---|
| 路径 | `src/app/(main)/profile/apps/page.tsx` | `src/routes/ProfileApps.tsx` |
| 行数 | **35** | **94** |
| 路由 | `/profile/apps` | `/profile/apps` |
| 外壳标题 | `setHeaderTitle("我的应用")` | `AppShell.resolveTitle("/profile/apps")` → `我的应用`（`:48`） |
| 权限门 | **无**（注释写「仅 userId === "6" 可访问（Drawer / ProfileTab 入口）」，但**页面内无任何校验**） | **有**：`if (profile?.id === "6")`，否则渲染「无权」态 |
| 宽度 | `max-w-2xl` | `max-w-md` |
| 页面 H1 | 无 | 有 |

### 12.1 元素结构树

**web（`:22-33`，单分支）**
```
<div className="px-4 lg:px-8 py-6 max-w-2xl mx-auto">
  <Card>
    <CardContent className="p-10 text-center text-fg-muted">
      <Construction className="w-12 h-12 mx-auto text-fg-muted mb-4"/>
      <div className="text-base font-medium mb-1 text-fg">我的应用</div>
      <div className="text-sm">管理你创建的 gagaOS 应用 — 这个功能正在开发中，先用基础功能吧 🚧</div>
```
（注释明说「标题『我的应用』由全局 Header 渲染，此处不再重复 H1」→ 但正文里**又写了一遍「我的应用」主标题**，与注释自相矛盾）

**PC（`:55-71` 特权分支 / `:29-52` 非特权分支）**
```
非特权: <div className="min-h-full px-4 lg:px-8 py-6"><div className="max-w-md mx-auto">
          <div className="rounded-md bg-bg-elevated p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-sunken flex items-center justify-center text-fg-muted"><LockIcon/></div>
            <p className="text-base font-medium mb-1">我的应用</p>
            <p className="text-sm text-fg-muted">此功能暂未对你的账号开放</p>
            <div className="mt-4"><Button variant="ghost" size="md">返回</Button></div>
特权:   <div className="min-h-full px-4 lg:px-8 py-6"><div className="max-w-md mx-auto space-y-5">
          <h1 className="text-xl font-medium">我的应用</h1>
          <div className="rounded-md bg-bg-elevated p-8 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-sunken flex items-center justify-center text-fg-muted"><ConstructionIcon/></div>
            <p className="text-base font-medium mb-1">我的应用</p>
            <p className="text-sm text-fg-muted">管理你创建的 gagaOS 应用 — 这个功能正在开发中,先用基础功能吧 🚧</p>
```

### 12.2 逐元素映射表

| 层级 | web | PC | 差异 |
|---|---|---|---|
| 根容器 | `px-4 lg:px-8 py-6 max-w-2xl mx-auto` | `min-h-full px-4 lg:px-8 py-6` > `max-w-md mx-auto [space-y-5]` | **真差异：`max-w-2xl`(672) vs `max-w-md`(448)** |
| 卡片 | `<Card>`（shadcn，实际 className 未读） | `rounded-md bg-bg-elevated p-8 text-center`（`p-6` 于非特权态） | **真差异：web 宽度 672 vs PC 448；PC 多底色 `bg-bg-elevated`** |
| 内层 padding | `<CardContent className="p-10 text-center text-fg-muted">` | 卡自身 `p-8`（无 `CardContent`） | 真差异：`p-10`(40) vs `p-8`(32) |
| 图标容器 | 无容器（`<Construction className="w-12 h-12 mx-auto text-fg-muted mb-4"/>` 直接放） | `w-12 h-12 mx-auto mb-3 rounded-full bg-bg-sunken flex items-center justify-center text-fg-muted` | **真差异：PC 多圆形底圈；`mb-4` vs `mb-3`** |
| 图标 | lucide `Construction`（施工路障） | 自绘 `<ConstructionIcon/>`（4 根竖条方块） | **图标形状完全不同** |
| 主标题 | `text-base font-medium mb-1 text-fg` | `text-base font-medium mb-1` | 基本一致 |
| 页面 H1 | 无 | `text-xl font-medium` | PC 独有 |
| 副文案 | `text-sm`（**无 `text-fg-muted`，继承父级**） | `text-sm text-fg-muted` | 真差异：web 靠父级继承，PC 显式 |
| 权限门 | **无** | `profile?.id === "6"` → 非特权渲染「此功能暂未对你的账号开放」+ `<LockIcon/>` + `返回` 按钮 | **真差异（PC 更严）** |
| 非特权卡 | 不存在 | `rounded-md bg-bg-elevated p-6 text-center` | PC 独有 |
| 空态返回按钮 | 不存在 | `<Button variant="ghost" size="md">返回</Button>` | PC 独有 |

### 12.3 文案对照

| 位置 | web | PC | 一致 |
|---|---|---|---|
| 主标题 | `我的应用` | `我的应用`（×2：H1 + 卡内） | ✅ 内容（PC 重复） |
| 开发中文案 | `管理你创建的 gagaOS 应用 — 这个功能正在开发中，先用基础功能吧 🚧`（**中文逗号 `，`**） | `管理你创建的 gagaOS 应用 — 这个功能正在开发中,先用基础功能吧 🚧`（**半角逗号 `,`**） | **否（仅标点半/全角差异）** |
| 无权文案 | 不存在 | `此功能暂未对你的账号开放` | — |
| 无权按钮 | 不存在 | `返回` | — |

### 12.4 交互态对照

| 状态 | web | PC |
|---|---|---|
| 卡片 hover | 无 | 无 |
| 图标 | 无动画 | 无动画 |
| 返回按钮 | 不适用 | `variant="ghost" size="md"` |
| 加载态 | **无**（直接渲染占位） | **无**（`profile` 未回来时 `isPrivileged=false` → 闪「无权」态，**见 §12.5**） |
| 空态 | 占位即常态 | 占位（特权）/ 无权（非特权） |
| 错误态 | 无 | 无 |

### 12.5 待核项

1. **PC `ProfileApps` 在 `profile` 加载完成前会闪「此功能暂未对你的账号开放」** —— `profile` 为 `undefined` 时 `isPrivileged = undefined === "6"` → `false`，直接走非特权分支。**需 PM 判定**：是否需要加 `isLoading` 守卫（会先闪一下红锁）。**这是本批唯一的「真 bug 级」发现**。
2. **web `profile/apps` 是否真的无权限校验** —— 注释写「仅 userId === "6" 可访问（Drawer / ProfileTab 入口）」，但页面内无校验。**需确认**：web 的入口侧（`Drawer` / `ProfileTab`）是否做了隐藏，即权限门只做在「入口」而非「页面」。若是，则两端行为**等价**（PC 把门做在页面侧）。
3. **web `<Card>` / `<CardContent>` className 未读** —— `src/components/ui/card.tsx`。

---

## 13. Login

### 13.0 文件与规模

| | web | PC |
|---|---|---|
| 路径 | `src/app/(auth)/login/page.tsx` | `src/routes/Login.tsx` |
| 行数 | **117** | **134** |
| 路由 | `/login` | `/login` |
| 路由组 | `(auth)`（**不在 `(main)`，不套 AppShell**） | 路由表直接挂，**不套 AppShell** ✅ |
| 页面 H1 | **无** | 有 `Gacode · 登录` + 副标题 |
| 错误呈现 | **页内 `<p className="text-sm text-destructive text-center">`** | **toast danger** |
| 忘记密码 | **无** | 有（外链 `https://www.gaga.sale/forgot-password`） |

### 13.1 元素结构树

**web（`:44-115`）**
```
<div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8">
  <div className="flex items-center gap-3 mb-10">
    <img src={`${BASE_PATH}/assets/cody/cody_192.png`} alt="Gacode" width={80} height={80} className="rounded-squircle"/>
    <span className="text-xl font-semibold tracking-wide">gacode</span>
  <Card className="w-full max-w-[400px] shadow-sm border-border/50 rounded-2xl">
    <form onSubmit={handleSubmit}>
      <CardContent className="space-y-5 pt-6 pb-2">
        <Input placeholder="请输入用户名/手机号" required autoComplete="username"/>
        <Input type="password" placeholder="请输入密码" required autoComplete="current-password"/>
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
      <CardFooter className="flex flex-col gap-3 pt-2">
        <Button type="submit" disabled={isLoading} className="w-full h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-medium">
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
          {isLoading ? "登录中..." : "立即登录"}
        <p className="text-sm text-fg-muted text-center mt-2">还没有账号?{" "}<Link href="/register" className="text-primary hover:underline font-medium">立即注册</Link></p>
        <p className="text-sm text-fg-muted text-center mt-1"><Link href="/qr-login" className="text-primary hover:underline font-medium">📱 用 App 扫码登录</Link></p>
```

**PC（`:50-133`）**
```
<div className="min-h-screen flex flex-col items-center justify-center bg-bg-base px-4 py-8">
  <div className="flex items-center gap-3 mb-10">
    <div aria-hidden className="w-14 h-14 rounded-md bg-brand/20 border border-brand/40 flex items-center justify-center text-brand font-bold text-2xl"
         style={{fontFamily:"var(--font-mono)"}}>G</div>
    <span className="text-xl font-semibold tracking-wide">gacode</span>
  <div className="w-full max-w-[400px] rounded-md bg-bg-sunken shadow-sm p-6">
    <h1 className="text-lg font-medium mb-1">Gacode · 登录</h1>
    <p className="text-sm text-fg-muted mb-6">使用 unified-api 账号登录,跨端通用</p>
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input placeholder="用户名" autoComplete="username" autoFocus disabled={submitting} required/>
      <Input type="password" placeholder="密码" autoComplete="current-password" disabled={submitting} required/>
      <Button type="submit" variant="default" size="lg" loading={submitting}
              className="w-full h-11 rounded-md bg-foreground text-background hover:bg-foreground/90 font-medium">
        {submitting ? "登录中..." : "登录"}
      <p className="text-sm text-fg-muted text-center pt-2">还没有账号?{" "}<Link to="/register" className="text-brand hover:underline font-medium">立即注册</Link></p>
      <p className="text-sm text-fg-muted text-center pt-1"><Link to="/qr-login" className="text-brand hover:underline font-medium">📱 用 App 扫码登录</Link></p>
      <p className="text-sm text-fg-muted text-center pt-1"><a href="https://www.gaga.sale/forgot-password" target="_blank" rel="noopener noreferrer" className="text-brand hover:underline font-medium">忘记密码?</a></p>
```

### 13.2 逐元素映射表

| 层级 | web className（原文） | PC className（原文） | 差异 |
|---|---|---|---|
| 根容器 | `min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8` | `min-h-screen flex flex-col items-center justify-center bg-bg-base px-4 py-8` | 仅命名（`background`≡`bg-base`）✅ |
| Logo 形态 | `<img src="…/cody_192.png" width={80} height={80} className="rounded-squircle"/>` | `<div aria-hidden className="w-14 h-14 rounded-md bg-brand/20 border border-brand/40 flex items-center justify-center text-brand font-bold text-2xl" style={{fontFamily:"var(--font-mono)"}}>G</div>` | **真差异（同 §1 Home 的头像分歧）：图片 80px `rounded-squircle`(22px) vs CSS 方块 56px(112px 声明但 `w-14 h-14`=56px) `rounded-md`(16px)**；**尺寸 80 vs 56** |
| 品牌名 | `text-xl font-semibold tracking-wide` | `text-xl font-semibold tracking-wide` | ✅ |
| Logo 容器 | `flex items-center gap-3 mb-10` | `flex items-center gap-3 mb-10` | ✅ |
| 卡片容器 | `<Card className="w-full max-w-[400px] shadow-sm border-border/50 rounded-2xl">` | `w-full max-w-[400px] rounded-md bg-bg-sunken shadow-sm p-6` | **真差异：`rounded-2xl`(24) vs `rounded-md`(16)；`border-border/50` web 有 PC 无；web 走 `<Card>` 组件（底色待核），PC 显式 `bg-bg-sunken`（#0a0a0a）；padding 由 CardContent/CardFooter 承担 vs PC 统一 `p-6`** |
| 页内 H1 | **不存在** | `text-lg font-medium mb-1`「Gacode · 登录」 | **PC 独有** |
| 副标题 | **不存在** | `text-sm text-fg-muted mb-6`「使用 unified-api 账号登录,跨端通用」 | **PC 独有** |
| 表单容器 | `<form>` 无 className；`<CardContent className="space-y-5 pt-6 pb-2">` | `<form className="space-y-4">` | **真差异：间距 `space-y-5` vs `space-y-4`；web 靠 `pt-6 pb-2` 控制内边距** |
| 用户名 placeholder | `请输入用户名/手机号` | `用户名` | **否** |
| 密码 placeholder | `请输入密码` | `密码` | **否** |
| autoFocus | **无** | `autoFocus`（用户名） | PC 独有 |
| 输入 disabled | **无**（只有提交按钮 disabled） | `disabled={submitting}`（两个输入框） | 真差异：PC 提交中锁定输入框 |
| 错误呈现 | `{error && <p className="text-sm text-destructive text-center">{error}</p>}`（**页内**） | 无页内节点，**只用 toast** `message: msg \|\| "登录失败"` | **真差异：呈现位置不同（页内 vs 弹 toast）** |
| CTA 底色 | `bg-foreground text-background hover:bg-foreground/90` | `bg-foreground text-background hover:bg-foreground/90` | ✅ **批 1 记录的「0.7.7 改成黑底白字」核实通过** |
| CTA 圆角 | **`rounded-xl`**（22px） | **`rounded-md`**（16px） | **真差异：22 vs 16（6px）。任务书称「已一致」不准确 → 见 §17** |
| CTA 尺寸 | 无 `size` prop | `size="lg"` | 真差异 |
| CTA 图标 | `{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}`（**有图标**） | **无图标**（只有 `loading` spinner） | 真差异 |
| CTA 文案 | `立即登录` | `登录` | **否** |
| 前置校验 | 无（靠 HTML `required`） | `if (!username.trim() \|\| !password) toast "请填写用户名和密码"` | PC 独有 |
| 底部链接容器 | `text-sm text-fg-muted text-center mt-2` / `mt-1` | `text-sm text-fg-muted text-center pt-2` / `pt-1` | **真差异：`mt-*`(margin-top) vs `pt-*`(padding-top)** |
| 链接色 | `text-primary` | `text-brand` | 仅命名 ✅ |
| 扫码入口 | `📱 用 App 扫码登录` | `📱 用 App 扫码登录` | ✅ |
| 忘记密码 | **无** | `忘记密码?` → 外链 | **PC 独有** |

### 13.3 文案对照

| 位置 | web | PC | 一致 |
|---|---|---|---|
| 品牌名 | `gacode` | `gacode` | ✅ |
| H1 | 无 | `Gacode · 登录` | — |
| 副标题 | 无 | `使用 unified-api 账号登录,跨端通用` | — |
| 用户名 placeholder | `请输入用户名/手机号` | `用户名` | 否 |
| 密码 placeholder | `请输入密码` | `密码` | 否 |
| CTA | `立即登录` | `登录` | 否 |
| loading 文案 | `登录中...` | `登录中...` | ✅ |
| 页内错误 | `用户名或密码错误`（**固定文案**） | 无（toast 透传 `err.message`） | 否 |
| 空输入 toast | 无 | `请填写用户名和密码` | — |
| 登录失败 toast | 无（走页内） | `{err.message}` 或 `登录失败` | — |
| 去注册 | `还没有账号?` / `立即注册` | 同款 | ✅ |
| 扫码 | `📱 用 App 扫码登录` | 同款 | ✅ |
| 忘记密码 | 无 | `忘记密码?` | — |

### 13.4 交互态对照

| 状态 | web | PC |
|---|---|---|
| CTA hover | `hover:bg-foreground/90` | `hover:bg-foreground/90` ✅ |
| CTA active | **无** | **无** |
| CTA disabled | `disabled={isLoading}`（Button 内部 disabled 样式未读） | `loading={submitting}` + `disabled`（Button 内部样式未读） |
| CTA loading 图标 | `<Loader2 className="mr-2 h-4 w-4 animate-spin"/>` | 无图标（组件 spinner，类名待核） |
| 输入 focus | 未读（`Input` 组件默认） | PC `Input` 默认（未读） |
| 输入 disabled | 无 | `disabled` |
| 链接 hover | `hover:underline` | `hover:underline` ✅ |
| 错误态 | 页内红字 `text-destructive` | toast `variant="danger"` |
| 加载态 | CTA spinner | CTA spinner |
| 空态 | 不适用 | 不适用 |

### 13.5 待核项

1. **web `<Card>` / `<CardContent>` / `<CardFooter>` / `<Button>` / `<Input>` 的 className 未读** —— 决定 §13.2 中「卡片底色」「CTA disabled 样式」「输入 focus 样式」。**需确认**。
2. **PC `Input.tsx` / `Button.tsx` className 未读** —— 同上（跨 4 个页面复用）。
3. **`rounded-xl` vs `rounded-md`（CTA）与 `rounded-2xl` vs `rounded-md`（卡片）—— 需 PM 拍板**（见 §6.2）。

---

## 14. Register

### 14.0 文件与规模

| | web | PC |
|---|---|---|
| 路径 | `src/app/(auth)/register/page.tsx` | `src/routes/Register.tsx` |
| 行数 | **159** | **255** |
| 路由 | `/register` | `/register` |
| 路由组 | `(auth)` | 不套 AppShell ✅ |
| 字段数 | **5**（用户名/密码/确认密码/邮箱/昵称） | **6**（用户名/密码/邮箱/显示名/密保问题/密保答案）+ 协议勾选 |
| 成功跳转 | `nav.client(router, "/")`（**直接进首页**） | `navigate("/login", {replace:true})`（**回登录页**） | 
| 页内 H1 | 无 | `注册新账号` + 副标题 |

### 14.1 元素结构树

**web（`:72-157`）**
```
<div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8">
  [logo 同 Login: <img cody_192.png width=80 height=80 rounded-squircle/> + <span className="text-xl font-semibold tracking-wide">gacode</span>]
  <Card className="w-full max-w-[400px] shadow-sm border-border/50 rounded-2xl">
    <form onSubmit={handleSubmit}>
      <CardContent className="space-y-5 pt-6 pb-2">
        <Input placeholder="用户名 (3-32 字符)" required autoComplete="username" minLength={3} maxLength={32}/>
        <Input type="password" placeholder="密码 (至少 8 位)" required autoComplete="new-password" minLength={8}/>
        <Input type="password" placeholder="确认密码" required autoComplete="new-password"/>
        <Input type="email" placeholder="邮箱 (可选)" autoComplete="email"/>
        <Input placeholder="昵称 (可选)" autoComplete="nickname" maxLength={32}/>
        {error && <p className="text-sm text-destructive text-center">{error}</p>}
      <CardFooter className="flex flex-col gap-3 pt-2">
        <Button type="submit" disabled={isLoading} className="w-full h-11 rounded-xl bg-foreground text-background hover:bg-foreground/90 font-medium">
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
          {isLoading ? "注册中..." : "立即注册"}
        <p className="text-sm text-fg-muted text-center">已有账号?{" "}<Link href="/login" className="text-primary hover:underline font-medium">立即登录</Link></p>
```

**PC（`:121-255`）**
```
<div className="min-h-screen flex flex-col items-center justify-center bg-bg-base px-4 py-8">
  [logo 同 Login: w-14 h-14 rounded-md bg-brand/20 border border-brand/40 …>G< + gacode]
  <div className="w-full max-w-[400px] rounded-md bg-bg-sunken shadow-sm p-6">
    <h1 className="text-lg font-medium mb-1">注册新账号</h1>
    <p className="text-sm text-fg-muted mb-6">创建一个 gacode 账号,跨端通用</p>
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input placeholder="用户名 *" required autoComplete="username" disabled={submitting}/>
      <Input type="password" placeholder="密码 * (至少 8 位)" required autoComplete="new-password" disabled={submitting}/>
      <Input type="email" placeholder="邮箱 (选填)" autoComplete="email" disabled={submitting}/>
      <Input placeholder="显示名 (选填)" disabled={submitting}/>
      <p className="text-xs text-fg-muted -mt-2">密保用于找回密码,注册后不可修改</p>
      <Input placeholder="密保问题 * (1-20 字,例如: 你最喜欢的城市)" required disabled={submitting}
             aria-invalid={questionError?true:undefined} className={questionError?"border-danger":""}/>
      {questionError && <p className="text-xs text-danger -mt-2">{questionError}</p>}
      <Input placeholder="密保答案 * (1-10 字,仅中文)" required disabled={submitting}
             aria-invalid={answerError?true:undefined} className={answerError?"border-danger":""}/>
      {answerError && <p className="text-xs text-danger -mt-2">{answerError}</p>}
      <label className="flex items-start gap-2 text-sm text-fg-muted select-none">
        <input type="checkbox" checked={agreeTos} disabled={submitting} className="mt-0.5"/>
        <span>我已阅读并同意 <a className="text-brand hover:underline">《服务条款》</a> 与 <a className="text-brand hover:underline">《隐私协议》</a></span>
      <Button type="submit" variant="default" size="lg" loading={submitting}
              disabled={!agreeTos || !securityOk}
              className="w-full h-11 rounded-md bg-foreground text-background hover:bg-foreground/90 font-medium">
        {submitting ? "注册中..." : "注册"}
      <p className="text-sm text-fg-muted text-center pt-2">已有账号?{" "}<Link to="/login" className="text-brand hover:underline font-medium">去登录</Link></p>
```

### 14.2 逐元素映射表

| 层级 | web | PC | 差异 |
|---|---|---|---|
| Logo | `<img cody_192.png width=80 height=80 rounded-squircle/>` | `w-14 h-14 rounded-md bg-brand/20 border border-brand/40 … text-2xl` > `G` | 同 §13.2（**图片 80px squircle vs 方块 56px rounded-md**） |
| 卡片 | `<Card className="w-full max-w-[400px] shadow-sm border-border/50 rounded-2xl">` | `w-full max-w-[400px] rounded-md bg-bg-sunken shadow-sm p-6` | 同 §13.2（**`rounded-2xl` vs `rounded-md`；PC 有 `bg-bg-sunken`**） |
| H1 + 副标题 | 无 | `text-lg font-medium mb-1`「注册新账号」/ `text-sm text-fg-muted mb-6`「创建一个 gacode 账号,跨端通用」 | **PC 独有** |
| 表单间距 | `space-y-5 pt-6 pb-2` | `space-y-4` | 真差异：`space-y-5` vs `space-y-4` |
| 用户名 | `placeholder="用户名 (3-32 字符)"` + `minLength={3} maxLength={32}` | `placeholder="用户名 *"`（无 minLength/maxLength，靠 toast 校验） | **真差异：PC 无长度属性 + 校验文案不同** |
| 密码 | `placeholder="密码 (至少 8 位)"` + `minLength={8}` | `placeholder="密码 * (至少 8 位)"` | **否（PC 加了 `*`）** |
| **确认密码** | **有** `placeholder="确认密码"` + 校验「两次密码不一致」 | **无** | **真差异：web 多一个字段** |
| 邮箱 | `placeholder="邮箱 (可选)"` `type="email"` | `placeholder="邮箱 (选填)"` `type="email"` | **否（可选 vs 选填）** |
| 昵称/显示名 | `placeholder="昵称 (可选)"` `autoComplete="nickname" maxLength={32}` | `placeholder="显示名 (选填)"`（**无 autoComplete、无 maxLength**） | **否（昵称 vs 显示名；可选 vs 选填）** |
| 密保提示 | 无 | `text-xs text-fg-muted -mt-2`「密保用于找回密码,注册后不可修改」 | **PC 独有** |
| 密保问题 | 无 | `placeholder="密保问题 * (1-20 字,例如: 你最喜欢的城市)"` + `aria-invalid` + `className={questionError?"border-danger":""}` | **PC 独有** |
| 密保答案 | 无 | `placeholder="密保答案 * (1-10 字,仅中文)"` + 同上 | **PC 独有** |
| 内联错误 | `<p className="text-sm text-danger -mt-2">{…}</p>` | 同款（PC 两处） | ✅ |
| 协议勾选 | **无** | `<label className="flex items-start gap-2 text-sm text-fg-muted select-none">` + `<input type="checkbox" className="mt-0.5">` | **PC 独有** |
| 错误呈现 | `{error && <p className="text-sm text-destructive text-center">{error}</p>}`（页内） | **全部走 toast**（含 `border-danger` 内联） | 真差异 |
| CTA 底色 | `bg-foreground text-background hover:bg-foreground/90` | 同 | ✅ |
| CTA 圆角 | **`rounded-xl`** | **`rounded-md`** | **真差异（22 vs 16）** |
| CTA 图标 | `{isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}` | 无 | 真差异 |
| CTA 文案 | `立即注册` | `注册` | **否** |
| CTA disabled | 仅 `isLoading` | `disabled={!agreeTos \|\| !securityOk}`（**未勾选/密保不全就禁用**） | **真差异：PC 多业务前置禁用** |
| 底部链接 margin | `text-sm text-fg-muted text-center`（**无 margin**） | `text-sm text-fg-muted text-center pt-2` | 真差异 |
| 链接文案 | `立即登录` | `去登录` | **否** |

### 14.3 文案对照

| 位置 | web | PC | 一致 |
|---|---|---|---|
| H1 | 无 | `注册新账号` | — |
| 副标题 | 无 | `创建一个 gacode 账号,跨端通用` | — |
| 用户名 | `用户名 (3-32 字符)` | `用户名 *` | 否 |
| 密码 | `密码 (至少 8 位)` | `密码 * (至少 8 位)` | 否 |
| 确认密码 | `确认密码` | 无 | — |
| 邮箱 | `邮箱 (可选)` | `邮箱 (选填)` | 否 |
| 昵称 | `昵称 (可选)` | `显示名 (选填)` | 否 |
| 密保提示 | 无 | `密保用于找回密码,注册后不可修改` | — |
| 密保问题 | 无 | `密保问题 * (1-20 字,例如: 你最喜欢的城市)` | — |
| 密保答案 | 无 | `密保答案 * (1-10 字,仅中文)` | — |
| 密保错误 | 无 | `密保问题只能填 1-20 个字` / `密保答案只能填 1-10 个汉字` | — |
| 协议 | 无 | `我已阅读并同意《服务条款》与《隐私协议》` | — |
| CTA | `立即注册` | `注册` | 否 |
| loading | `注册中...` | `注册中...` | ✅ |
| 页内错误 | `两次密码不一致` / `密码至少 8 位` / `用户名长度需 3-32 字符` / `用户名已被占用` / `注册失败: {msg}` | 无页内（toast：`用户名和密码必填`/`密码至少 8 位`/`密保问题和密保答案必填`/`请先勾选服务条款与隐私协议`/`{msg}`） | 否 |
| 成功 | 直接跳 `/` | toast `注册成功,请登录` + 跳 `/login` | 否 |
| 底部链接 | `已有账号?` / `立即登录` | `已有账号?` / `去登录` | 否 |

### 14.4 交互态对照

| 状态 | web | PC |
|---|---|---|
| CTA hover | `hover:bg-foreground/90` | `hover:bg-foreground/90` ✅ |
| CTA disabled | 仅 loading | loading + `!agreeTos` + `!securityOk` |
| CTA loading 图标 | `<Loader2 className="mr-2 h-4 w-4 animate-spin"/>` | 无 |
| 输入 disabled | 无 | `disabled={submitting}` |
| 密保错误边框 | 无 | `border-danger` + `aria-invalid` |
| 密保错误文案 | 无 | `text-xs text-danger -mt-2` |
| checkbox | 无 | 原生 `type="checkbox"` + `mt-0.5`（**无自定义样式**） |
| 协议链接 hover | 无 | `hover:underline` |
| 错误态 | 页内红字 | toast + 内联红框 |
| 加载态 | CTA spinner | CTA spinner |

### 14.5 待核项

1. **web 提交成功直接跳 `/`，PC 跳 `/login`** —— **行为差异（不是样式差异）**。web 的 `register()` 若返 accessToken 则直接登录；PC 注释说「server register 是否返 accessToken 取决于 unified-api，不强依赖」。**需 PM 确认统一-api `register` 是否返 token**，据此决定对齐方向。
2. **web 有「确认密码」，PC 没有** —— **功能缺口**。**需 PM 拍板**：PC 是否补确认密码（PC 的密保问题/答案是 0.7.6 为绕开 server 400 才加的，web 侧 server 是否也已 required 未验证）。
3. **密保字段 PC 独有** —— 若 server 已 required，web 注册**当前应该是坏的**。**需确认**：读 `gacode-web/src/lib/api.ts` 的 `register()` 与 unified-api `registerSchema`，判断 web 是否漏传 `securityQuestion`/`securityAnswer`。
4. **web `<Card>` / `<Button>` className 未读** —— 同 §13.5。

---

## 15. QrLogin

### 15.0 文件与规模

| | web | PC |
|---|---|---|
| 路径 | `src/app/(auth)/qr-login/page.tsx` | `src/routes/QrLogin.tsx` |
| 行数 | **255** | **284** |
| 路由 | `/qr-login` | `/qr-login` |
| 轮询间隔 | `POLL_INTERVAL_MS = 2*1000` | `POLL_INTERVAL_MS = 2*1000` ✅ |
| TTL | `POLL_TIMEOUT_MS = 120*1000` | `POLL_TIMEOUT_MS = 120*1000` ✅ |
| QR 参数 | `width:280, margin:2, errorCorrectionLevel:"H", color:{dark:"#000000", light:"#ffffff"}` | **完全相同** ✅ |
| 已登录守卫 | **无** | **有**：`if (user) navigate("/", {replace:true})`（`:192-196`） |
| 成功跳转 | `setTimeout(() => nav.client(router, "/"), 600)` | `setTimeout(() => navigate("/", {replace:true}), 600)` ✅ |

### 15.1 元素结构树

**web（`:168-265`）**
```
<div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8">
  [logo: <img cody_192.png 80px rounded-squircle/> + gacode]
  <Card className="w-full max-w-[400px] shadow-sm border-border/50 rounded-2xl">
    <CardContent className="pt-6 pb-6">
      <h1 className="text-lg font-medium mb-1 text-center">扫码登录</h1>
      <p className="text-sm text-fg-muted mb-6 text-center">打开 Gacode App 扫一扫, 即可在电脑上登录</p>
      <div className="flex flex-col items-center">
        loading: <div className="w-[280px] h-[280px] flex items-center justify-center bg-muted rounded-2xl">
                    <Loader2 className="h-8 w-8 animate-spin text-fg-muted"/>
        ready:   <div className="relative">
                    <img src={qrDataUrl} alt="扫码登录二维码" width={280} height={280}
                         className="rounded-2xl bg-[#0a0a0a] p-3 border border-border/40"/>
                    <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-xs text-fg-muted">{s}s 后过期</div>
        expired: <div className="w-[280px] h-[280px] flex flex-col items-center justify-center bg-muted rounded-2xl gap-3">
                    <RefreshCw className="h-8 w-8 text-fg-muted"/>
                    <p className="text-sm text-fg-muted">二维码已失效</p>
                    <Button variant="outline" size="sm" className="rounded-xl">刷新二维码</Button>
        success: <div className="w-[280px] h-[280px] flex flex-col items-center justify-center bg-muted rounded-2xl gap-2">
                    <CheckCircle2 className="h-10 w-10 text-success"/>
                    <p className="text-sm font-medium">登录成功</p>
                    <p className="text-xs text-fg-muted">欢迎回来{userName ? `, ${userName}` : ""}</p>
      {ready && <div className="mt-10 flex items-start gap-3 p-3 rounded-xl bg-muted/50">
                  <Smartphone className="h-5 w-5 text-fg-muted mt-0.5 shrink-0"/>
                  <div className="text-sm text-fg-muted space-y-1">
                    <p>1. 打开 Gacode App</p> <p>2. 进入「扫码登录」功能</p>
                    <p>3. 对准此二维码扫一扫</p> <p>4. 在 App 内确认, 网页自动登录</p>}
      {error && <p className="mt-4 text-sm text-destructive text-center">{error}</p>}
      <p className="text-sm text-fg-muted text-center mt-8">…（:255 后，内容见 §15.3）</p>
```

**PC（`:198-284`）**
```
<div className="min-h-screen flex flex-col items-center justify-center bg-bg-base px-4 py-8">
  [logo: w-14 h-14 rounded-md bg-brand/20 border border-brand/40 … >G< + gacode]
  <div className="w-full max-w-[400px] rounded-md bg-bg-sunken shadow-sm p-6">
    <h1 className="text-lg font-medium mb-1 text-center">扫码登录</h1>
    <p className="text-sm text-fg-muted mb-6 text-center">打开 Gacode App 扫一扫, 即可在电脑上登录</p>
    <div className="flex flex-col items-center">
      loading: <div className="w-[280px] h-[280px] flex items-center justify-center bg-bg-elevated rounded-2xl">
                  <Spinner className="h-8 w-8 text-fg-muted"/>       ← 自绘 SVG（animate-spin + opacity-25/opacity-75 两 path）
      ready:   <div className="relative">
                  <img src={qrDataUrl} alt="扫码登录二维码" width={280} height={280}
                       className="rounded-2xl bg-white p-3"/>          ← ★ 无 border
                  <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-xs text-fg-muted">{s}s 后过期</div>
      expired: <div className="…bg-bg-elevated rounded-2xl gap-3">
                  <RefreshIcon className="h-8 w-8 text-fg-muted"/>
                  <p className="text-sm text-fg-muted">二维码已失效</p>
                  <Button variant="outline" size="sm">刷新二维码</Button>   ← ★ 无 rounded-xl
      success: <div className="…bg-bg-elevated rounded-2xl gap-2">
                  <CheckIcon className="h-10 w-10 text-success"/>     ← 自绘 SVG（不是 CheckCircle2）
                  <p className="text-sm font-medium">登录成功</p>
                  <p className="text-xs text-fg-muted">欢迎回来{userName ? `, ${userName}` : ""}</p>
    {ready && <div className="mt-10 flex items-start gap-3 p-3 rounded-xl bg-bg-elevated/50">   ← ★ bg-bg-elevated/50 而非 bg-muted/50
                <PhoneIcon className="h-5 w-5 text-fg-muted mt-0.5 shrink-0"/>
                <div className="text-sm text-fg-muted space-y-1">
                  <p>1. 打开 Gacode App</p> <p>2. 进入 "扫码登录" 功能</p>    ← ★ 直引号 " " vs 「」
                  <p>3. 对准此二维码扫一扫</p> <p>4. 在 App 内确认, 网页自动登录</p>}
    {error && <p className="mt-4 text-sm text-danger text-center">{error}</p>}
    <p className="text-sm text-fg-muted text-center mt-8">想用账号密码登录?{" "}
      <Link to="/login" className="text-brand hover:underline font-medium">返回密码登录</Link></p>
```

### 15.2 逐元素映射表

| 层级 | web | PC | 差异 |
|---|---|---|---|
| 根容器 | `min-h-screen flex flex-col items-center justify-center bg-background px-4 py-8` | `… bg-bg-base px-4 py-8` | 仅命名 ✅ |
| Logo | `<img cody_192.png 80px rounded-squircle/>` | `w-14 h-14 rounded-md bg-brand/20 border border-brand/40 … >G<` | 同 §13.2 |
| 卡片 | `<Card className="w-full max-w-[400px] shadow-sm border-border/50 rounded-2xl">` + `<CardContent className="pt-6 pb-6">` | `w-full max-w-[400px] rounded-md bg-bg-sunken shadow-sm p-6` | **真差异：`rounded-2xl` vs `rounded-md`；`pt-6 pb-6` vs `p-6`（等效）** |
| H1 | `text-lg font-medium mb-1 text-center` | 同 | ✅ |
| 副标题 | `text-sm text-fg-muted mb-6 text-center`「打开 Gacode App 扫一扫, 即可在电脑上登录」 | 同（文案一致） | ✅ |
| QR 加载态底色 | **`bg-muted`**（#181818） | **`bg-bg-elevated`**（#181818） | 仅命名 ✅ |
| loading spinner | lucide `<Loader2 className="h-8 w-8 animate-spin text-fg-muted"/>` | 自绘 `<Spinner className="h-8 w-8 text-fg-muted"/>`（`animate-spin` + `opacity-25` circle + `opacity-75` path） | 真差异：**图标库不同（PC 无 lucide-react）**；视觉近似 |
| **QR 图底色** | **`bg-[#0a0a0a]`**（任意值硬编码） | **`bg-white`**（#ffffff） | **重大真差异：二维码底色黑 vs 白！** |
| **QR 图边框** | **`border border-border/40`** | **无 border** | **真差异** |
| QR 图其余 | `rounded-2xl p-3` `width/height={280}` | `rounded-2xl p-3` `width/height={280}` | ✅ |
| 倒计时 | `absolute -bottom-7 left-1/2 -translate-x-1/2 text-xs text-fg-muted`「{s}s 后过期」 | 同 | ✅ |
| 失效态底色 | `bg-muted` | `bg-bg-elevated` | 仅命名 ✅ |
| 失效图标 | lucide `<RefreshCw className="h-8 w-8 text-fg-muted"/>` | 自绘 `<RefreshIcon className="h-8 w-8 text-fg-muted"/>`（24×24 viewBox，className 控制尺寸） | 真差异：图标库 |
| 失效文案 | `text-sm text-fg-muted`「二维码已失效」 | 同 | ✅ |
| **刷新按钮圆角** | **`className="rounded-xl"`**（22px） | **无覆盖**（走 Button `variant="outline" size="sm"` 默认） | **真差异（见 §15.5 待核 2）** |
| 成功态底色 | `bg-muted` | `bg-bg-elevated` | 仅命名 ✅ |
| 成功图标 | lucide `<CheckCircle2 className="h-10 w-10 text-success"/>`（**圆圈+勾**） | 自绘 `<CheckIcon className="h-10 w-10 text-success"/>`（`circle` + `path m9 12 2 2 4-4`，**同为圆圈+勾**） | 真差异：图标库，**但形状基本一致** |
| 成功文案 | `登录成功` / `欢迎回来, {name}` | 同 | ✅ |
| 提示卡底色 | **`bg-muted/50`** | **`bg-bg-elevated/50`** | 仅命名 ✅ |
| 提示卡圆角 | `p-3 rounded-xl`（22px） | `p-3 rounded-xl` | ✅ |
| 提示图标 | lucide `<Smartphone className="h-5 w-5 text-fg-muted mt-0.5 shrink-0"/>` | 自绘 `<PhoneIcon className="h-5 w-5 text-fg-muted mt-0.5 shrink-0"/>`（rect 5,2 14×20 rx=2） | 真差异：图标库，形状近似 |
| **提示文案 2** | `2. 进入「扫码登录」功能`（**中文直角引号**） | `2. 进入 "扫码登录" 功能`（**ASCII 直引号**） | **否（标点差异）** |
| 提示文案 1/3/4 | `1. 打开 Gacode App` / `3. 对准此二维码扫一扫` / `4. 在 App 内确认, 网页自动登录` | 同 | ✅ |
| 错误色 | `text-destructive` | `text-danger` | 仅命名 ✅ |
| 底部链接 | `text-primary hover:underline font-medium` | `text-brand hover:underline font-medium` | 仅命名 ✅ |
| **已登录守卫** | **无**（已登录用户停在扫码页） | `if (user) navigate("/", {replace:true})` | **真差异（PC 独有，行为改进）** |
| 成功凭证写入 | `Cookies.set("jwt", …)` + `Cookies.set("refreshToken", …)` + `setAuth(...)` | `setSession({user, accessToken, refreshToken})`，**并额外 `await authApi.me()` 补全 user** | 真差异（存储介质不同，PC 无 js-cookie） |
| 轮询启动时机 | `startPolling()` 立即启动，注释「没 token 就 no-op」 | `pollTimer = setInterval(…)` 在 `useEffect` 内直接启动 | 基本一致 |

### 15.3 文案对照

| 位置 | web | PC | 一致 |
|---|---|---|---|
| H1 | `扫码登录` | `扫码登录` | ✅ |
| 副标题 | `打开 Gacode App 扫一扫, 即可在电脑上登录` | 同 | ✅ |
| loading | （无文字，仅 spinner） | （无文字，仅 spinner） | ✅ |
| 倒计时 | `{s}s 后过期` | `{s}s 后过期` | ✅ |
| 失效 | `二维码已失效` | `二维码已失效` | ✅ |
| 刷新按钮 | `刷新二维码` | `刷新二维码` | ✅ |
| 成功 | `登录成功` | `登录成功` | ✅ |
| 欢迎 | `欢迎回来, {name}` | `欢迎回来, {name}` | ✅ |
| 步骤 1/3/4 | 同 | 同 | ✅ |
| **步骤 2** | `2. 进入「扫码登录」功能` | `2. 进入 "扫码登录" 功能` | **否** |
| 底部提示 | （`想用账号密码登录?` 见 `:255` 之后，本批未读完整） | `想用账号密码登录?` / `返回密码登录` | **待核** |
| 错误兜底 | `生成二维码失败` | `生成二维码失败` | ✅ |
| 总结中 | 不存在 | `(加载中…)` | — |
| 返回登录链接文案 | **待核**（`:255-265` 未读） | `返回密码登录` | — |

### 15.4 交互态对照

| 状态 | web | PC |
|---|---|---|
| QR 过期自动刷新 | 手动点「刷新二维码」 | 手动点 |
| 刷新按钮 hover | Button `outline` 默认（未读） | Button `outline` 默认（未读） |
| 刷新按钮 loading | **无**（`issue()` 无 loading 态，点了会闪 loading 态） | 同 |
| 倒计时归零 | → `expired`（120s hard timeout） | → `expired` ✅ |
| 成功跳转延时 | 600ms | 600ms ✅ |
| 已登录进入 | 停在扫码页 | 立即跳 `/` |
| 错误态 | `text-destructive` 居中 | `text-danger` 居中 ✅ |

### 15.5 待核项

1. **★ QR 图底色 `bg-[#0a0a0a]`（web，黑）vs `bg-white`（PC，白）** —— 这是本批**最刺眼的单点视觉差异**。两者二维码内容都是黑点白底（`QRCode.toDataURL` 的 `color:{dark:"#000000", light:"#ffffff"}`），外层 `p-3` 内边距底色不同：web 做成「黑底 + 白码」，PC 做成「白底 + 黑码」。**需 PM 拍板**：PC 端在浅色系统主题下白底会刺眼，在深色下 web 的黑底更融。**两端必选其一**。
2. **QR 图 `border border-border/40`（web 有，PC 无）** —— 与第 1 项一起决定。**需 PM 拍板**。
3. **PC Button `variant="outline" size="sm"` 的默认 className 未读** —— 决定「刷新二维码」按钮的实际圆角/边框/底色，无法确认 web 的 `rounded-xl` 是否被 PC 的 Button 默认值覆盖。**需确认**：读 `src/components/ui/Button.tsx`。
4. **web qr-login `:255-265` 未读** —— 底部「返回密码登录」链接的文案与 className 未确认。**需确认**：补读 `page.tsx:255-265`。
5. **web 已登录用户进入 `/qr-login` 无守卫** —— **需 PM 判定**：是否算 web 缺口（PC 已有守卫）。
6. **PC `Spinner` 用两段 SVG 模拟 tailwind spinner，web 用 lucide `Loader2`** —— 视觉近似但非同一实现。**需 PM 判定**：是否需要统一（PC 全项目都不引 lucide-react，属既定边界）。

---

## 16. 批 1 遗留 PC 组件补读（本批结清 6 项）

> 本节补上批 1 §6 表中挂起的 PC 组件，全部已 Read 全文。

### 16.1 `components/ui/DropdownMenu.tsx`（148 行）— 结清批 1 #11 / #15

| 元素 | className（原文） |
|---|---|
| 外层 wrapper | `relative inline-block` |
| 菜单容器 | `absolute z-50 mt-1 min-w-[160px] rounded-md` + `bg-bg-elevated shadow-dialog animate-fade-in py-1` + `align==="right" ? "right-0" : "left-0"` |
| 菜单项 | `w-full text-left text-sm px-3 py-2 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none` + `destructive ? "text-danger hover:bg-danger-soft/30" : "text-fg hover:bg-bg-sunken"` |
| trigger | 通过 `cloneElement` 注入 `aria-haspopup="menu"` + `aria-expanded={open}` + `onClick`（`preventDefault` + `stopPropagation`）。**不覆盖 className** —— trigger 的 className 完全由调用方给 |

**与 web `DropdownMenuContent` 对照（批 1 #11 仍未解，见 §17）**：web 用 Radix `DropdownMenuContent className="min-w-[8rem] border-0 rounded-xl bg-popover"`（Deliveries `page.tsx:698`），PC 是 `min-w-[160px] rounded-md bg-bg-elevated`。**`min-w` 160px vs 8rem(128px)；`rounded-md` vs `rounded-xl`；PC 无 `border-0`（本就无 border）**。**PC 的菜单宽度对 Deliveries 的「删除」单项菜单偏大**。

### 16.2 `components/deliveries/MultiSelectToolbar.tsx`（80 行）— 结清批 1 #16

| 元素 | className（原文） |
|---|---|
| 容器 | `sticky bottom-0 z-30 bg-bg-elevated border-t border-border px-4 py-3 flex items-center gap-3` |
| 计数 | `text-sm`「已选 `<strong>{selectedCount}</strong>` 条」 |
| 弹性占位 | `flex-1` |
| 取消 | `<Button variant="ghost" size="sm">`「取消」 |
| 全选 | `<Button variant="ghost" size="sm" disabled={totalVisible===0}>`「全选」/「取消全选」 |
| 删除 | `<Button variant="danger" size="sm" disabled={selectedCount===0 \|\| deletePending} loading={deletePending}>`「删除 ({n})」/「删除中」 |
| 二次确认 | `<ConfirmDialog title={`确认删除 ${selectedCount} 条交付?`} message="此操作不可恢复, 请谨慎操作。" confirmLabel="确认删除" confirmVariant="danger"/>` |

**批 1 §7 结论复核**：该容器 `bg-bg-elevated border-t border-border` 与 `library/MultiSelectToolbar` 同款，**均未对齐 web 的「去线化」方向**（web Deliveries 顶部已是 `bg-bg-base/95 backdrop-blur`，底部多选条 web 侧无对应物）。**但 web Deliveries 页面根本没有多选功能**（§8 已核实），所以这不是「PC 没对齐」，而是「PC 超前实现 + 自带样式」。**需 PM 判定**（见 §6.2）。

### 16.3 `components/notifications/NotificationSettingsSheet.tsx`（261 行）— 结清批 1 #19

| 元素 | className / 文案（原文） |
|---|---|
| 容器 | `<BottomSheet open title="通知设置" onClose>` |
| 顶部说明 | `text-xs text-fg-subtle`「设置在当前设备本地保存。系统通知走 Windows 通知中心, 关掉后只剩应用内提示。」 |
| 分组线 | `border-t border-border pt-3 space-y-3`（**两处**） |
| `ToggleRow` label | `flex items-start gap-3 cursor-pointer` + `disabled ? "opacity-50 cursor-not-allowed" : ""` |
| `ToggleRow` checkbox | `<input type="checkbox" className="mt-1 accent-brand"/>` |
| `ToggleRow` 主文案 | `text-sm` + 副 `text-xs text-fg-subtle mt-0.5` |
| 分组标题 | `text-sm font-medium`「按类目屏蔽」+ `text-xs text-fg-subtle -mt-2`「关掉某个类目后, 该类的新通知会被静默丢弃」 |
| `CategoryRow` | `w-full flex items-center justify-between rounded-md px-3 py-2 text-sm border border-border hover:bg-bg-sunken` + `disabled ? "opacity-50 cursor-not-allowed" : "transition-colors duration-150"` |
| 开关轨道 | `inline-block w-9 h-5 rounded-full relative` + `checked ? "bg-brand" : "bg-bg-sunken"` |
| 开关滑块 | `absolute top-0.5 w-4 h-4 rounded-full bg-bg-base shadow-sm transition-all duration-150` + `checked ? "left-[18px]" : "left-0.5"` |
| 测试按钮 | `<Button variant="outline" size="sm" disabled={!enabled \|\| !desktopEnabled}>弹一条测试通知</Button>` + `text-xs text-fg-subtle`「验证主进程 Notification 链路」 |

**全部 5 个文案态（对齐批 1 #19 的待核目标）**：
`启用通知` / `桌面通知` / `应用内提示` / `按类目屏蔽`（`系统`·`聊天`·`库`·`交付`）/ `弹一条测试通知`。
**数据源**：客户端 `localStorage`（`loadNotificationPrefs` / `saveNotificationPrefs`），**server `/agent-push-preferences` 未接入（send-blocker，注释 `:8-9` 明写）**。
**与 web 对照**：web 无对应组件（web 的通知偏好走 `WebNotificationPrompt` + 浏览器权限）。**属 PC 超前实现，非缺口**。

### 16.4 `components/notifications/CategoryTabs.tsx`（55 行）+ `NotificationItem.tsx`（123 行）— 结清批 1 #20 / #21

**CategoryTabs 分类文案（`:28-34`）**：

| key | label |
|---|---|
| `all` | `全部` |
| `system` | `系统` |
| `chat` | `聊天` |
| `library` | `库` |
| `delivery` | `交付` |

容器：`overflow-x-auto scrollbar-none`；内部 `<Tabs variant="underline" tabs activeKey onChange/>`（**注释 `:44-46` 明写：PC-7 拍板 pill → underline，且「外层 container 的 border-b 由 Tabs underline 变体自带，调用方不要再叠」**）。

**→ 批 1 记录的「Library Tabs underline」在 Notifications 侧已核实落地。**

**`CATEGORY_BAR` 配色表（`NotificationItem.tsx:28-33`）**：

| category | className |
|---|---|
| `system` | `bg-danger` |
| `chat` | `bg-brand` |
| `library` | `bg-success` |
| `delivery` | `bg-warning` |
| 兜底（已读） | `bg-transparent` |
| 兜底（未读） | `bg-brand` |

**NotificationItem 行卡（`:48-52`）**：
`w-full text-left flex items-stretch gap-3 rounded-2xl border border-border bg-bg-elevated p-4 hover:bg-bg-sunken transition-colors duration-150`
**→ 批 1 §7 记录的 `rounded-2xl` + `bg-bg-elevated` 核实通过 ✅**（注释 `:49` 明写「PC-7: 卡片形态对齐 PC-6 LibraryCard」）。
未读条：`w-1 self-stretch rounded shrink-0` + `barColor`；已读占位：`<span aria-hidden className="w-1 shrink-0"/>`（无色）。
图标底圈：`shrink-0 w-9 h-9 rounded-full bg-bg-sunken flex items-center justify-center text-fg-muted`。
标题：`text-sm flex-1 min-w-0 break-all` + `isUnread ? "font-medium text-fg" : "text-fg-muted"`；时间 `text-xs text-fg-subtle shrink-0`。
正文：`text-xs text-fg-muted line-clamp-2 break-all`。
type chip：`inline-block text-xs px-1.5 py-0.5 rounded bg-bg-sunken text-fg-subtle`。
跳转提示：`text-xs text-fg-subtle`「点击查看 →」/「点击打开链接 →」。
时间格式：自写 `formatRelative`（「刚刚/N 分钟前/N 小时前/N 天前/N 个月前/N 年前」）—— **与 Deliveries 的 `formatRelative` 实现完全一致（同一套代码）**。

### 16.5 `components/library/EditSheet.tsx`（175 行）— 结清批 1 #18 的一半

| 元素 | className / 文案（原文） |
|---|---|
| 遮罩容器 | `fixed inset-0 z-50 flex items-center justify-center px-4` |
| 遮罩 | `absolute inset-0 bg-black/60`（`onClick={onClose}`） |
| 对话框 | `relative w-full max-w-md rounded-md bg-bg-elevated shadow-dialog p-5` |
| 标题 | `text-base font-medium mb-4`「编辑知识库条目」 |
| 标签 | `text-xs text-fg-muted mb-1 block`「标题」/「标签 `text-fg-subtle`（用逗号或空格分隔）」 |
| 输入 | `w-full rounded-md bg-bg-sunken border border-border px-4 py-3 text-base placeholder:text-fg-subtle focus:outline-none focus:border-brand` |
| placeholder | `标题` / `例如: 设计, 灵感, 2026` |
| 只读 meta | `rounded-md bg-bg-sunken p-3 text-xs text-fg-muted space-y-1`；行 `flex items-center gap-2` + `w-12 shrink-0 text-fg-subtle`「类型/ID/创建」+ `font-mono break-all` |
| 按钮行 | `flex items-center justify-end gap-2 mt-4` |
| 取消 | `<Button variant="ghost" size="md" disabled={pending}>取消</Button>` |
| 保存 | `<Button variant="default" size="md" loading={pending} disabled={!trimmedTitle \|\| noChange}>保存</Button>` |
| aria | `role="dialog" aria-modal="true" aria-label="编辑知识库条目"` |

**与 web LibraryDetail 内联编辑对照（§7.2）**：web 是**页内联**（`editing` state 替换正文区 + `<Input>` 组件 + `flex justify-end gap-2` 按钮行）；PC 是**居中 modal**。两者 placeholder / 标签文案**完全一致**，只有容器形态与 `max-w` 不同。

### 16.6 `components/library/CollectSheet.tsx`（433 行）— 结清批 1 #18 的另一半

| 元素 | className / 文案（原文） |
|---|---|
| 遮罩容器 | `fixed inset-0 z-50 flex items-end justify-center`（**底部抽屉**，与 EditSheet 的居中不同） |
| 抽屉 | `relative w-full max-w-2xl rounded-t-md bg-bg-elevated shadow-dialog p-5 max-h-[80vh] flex flex-col` |
| 头部 | `flex items-center justify-between mb-3 shrink-0` + `text-base font-medium`「采集到知识库」+ `<Button variant="ghost" size="sm" aria-label="关闭">×</Button>` |
| Tabs | `flex items-center gap-2 mb-4 shrink-0`；按钮 `px-3 py-1 text-sm rounded transition-colors duration-150` + `tab===key ? "bg-brand text-brand-on shadow-sm" : "bg-bg-sunken text-fg-muted hover:bg-bg-sunken/80"` |
| tab 文案 | `文字` / `链接` / `图片` / `文件` |
| 内容区 | `flex-1 min-h-0 overflow-y-auto` |
| 文字 tab | `text-xs text-fg-muted`「输入文本或链接 (以 https:// 开头会被识别为链接)」+ `<textarea className="w-full rounded-md bg-bg-sunken px-4 py-3 text-base placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-brand/40 resize-none">` placeholder「在这里输入内容...」 |
| 链接 tab | `text-xs text-fg-muted`「输入网页 URL, 自动入库」+ `<input type="url" className="…focus:border-brand">` placeholder「https://example.com/article」 |
| 文件 tab 拖放区 | `w-full rounded-md border-2 border-dashed border-border bg-bg-sunken px-4 py-8 text-center hover:border-brand focus-visible:border-brand disabled:opacity-60`；`block text-sm font-medium text-fg` + `block text-xs text-fg-muted mt-1`「上传中 {n}%」/「支持大部分常见格式 · 单文件最大 50MB」 |
| 按钮 | `flex justify-end gap-2` + `取消`(ghost) / `采集`(default, `disabled` + `loading`) |
| 限制常量 | `MAX_CONTENT_LEN = 32000`、`MAX_BYTES = 50MB` |
| aria | `role="dialog" aria-modal="true" aria-label="采集到知识库"` |
| 提交按钮 | `采集`（**注意：与 Login 的「立即登录」/「登录」不同，PC 三页按钮文案风格不统一**） |

**→ 批 1 #18 结清。注：任务书写路径为 `src/components/deliveries/CollectSheet.tsx` / `EditSheet.tsx`，实测两者都在 `src/components/library/` 下（见 §17）。**

### 16.7 `routes/Profile.tsx:484-573` 图标 className — 结清批 1 #22

| 图标 | 尺寸 | className | 备注 |
|---|---|---|---|
| `CameraIcon` | 16×16 | **无**（裸 svg，`strokeWidth="1.6"`） | 尺寸写死在 svg 属性上 |
| `EditIcon` | 20×20 | **无** | 同上 |
| `LockIcon` | 20×20 | **无** | 与 `ProfileApps.tsx:77` 的 `LockIcon` **完全同源**（同 path） |
| `AppsIcon` | 20×20 | **无** | 4 个 `rect rx="1"` 方块 |
| `DeliveriesIcon` | 20×20 | **无** | 立方体 path |
| `SettingsIcon` | 20×20 | **无** | 齿轮 path |
| `TrashIcon` | 20×20 | **无** | 垃圾桶 polyline |
| `ChevronRightIcon` | 16×16 | **`className="text-fg-muted"`** | ← **8 个图标中唯一带 className 的** |
| `CopyIcon` | 14×14 | **无** | |
| `CheckIcon` | 14×14 | **`className="text-success"`** | ← 第 2 个带 className 的；`strokeWidth="2"`（其余是 1.6） |

**→ 批 1 #22 结清。规律：PC 图标靠父级控制颜色（`currentColor` + `stroke="currentColor"`），只有需要独立着色的 2 个（ChevronRight 灰、Check 绿）加了 className。尺寸全部写死在 svg 属性，无法通过 className 改。**

---

## 6.2 拍板项（本批新增，需 PM 决策）

> 承接批 1 §6 待核汇总。**以下 9 项无法由「读源码」判定，必须 PM 拍板。**

| # | 页 | 拍板问题 | 选项 | 建议 |
|---|---|---|---|---|
| **P1** | Browser | **web 是 152 行 iframe viewer，PC 是 1227 行完整浏览器**——不是同一个页面的两个实现。对齐方向？ | (a) PC 砍成 viewer；(b) web 升级成完整浏览器；(c) 承认两端不同产品，不对齐 | **(c)**。两者服务场景不同（web 是「从通知点进来读一篇文章」，PC 是「常驻浏览器」）。但**需确认 web 是否计划补 tab/地址栏** |
| **P2** | Login/Register/QrLogin | **CTA `rounded-xl`(22px) vs `rounded-md`(16px)** + 卡片 `rounded-2xl`(24px) vs `rounded-md`(16px)。任务书称 0.7.7 已一致，实测**未一致** | (a) PC 改 `rounded-xl`/`rounded-2xl`；(b) web 改 `rounded-md`；(c) 视为可接受 | **(a)**。三页都改，成本低（3 处），且 `rounded-2xl` 与 Deliveries/Library/Notifications 已统一的卡片圆角一致 |
| **P3** | QrLogin | **QR 底色 web `bg-[#0a0a0a]`（黑）vs PC `bg-white`（白）** + web 多了 `border border-border/40` | (a) PC 改黑底；(b) web 改白底；(c) 保持现状 | **(a) PC 改黑底**。PC 全局是纯黑主题（`bg-bg-base` = #000），白底 280×280 会在深色界面里形成刺眼白块；且 `bg-white` 硬编码违反「只用 token」的既定纪律 |
| **P4** | ChatDetail | **web 走全局 `h-14`(56px) header，PC 对 `/chat/*` 砍掉外层 header 用页面内 `h-12`(48px)** | (a) PC 恢复全局 header；(b) web 改 `h-12` 且页面内不加；(c) 保持 | **(c) 保持**，但需在 design-spec 里写明「ChatDetail 是唯一双端头部高度不同的页面」，否则后续会被当 bug 反复报 |
| **P5** | LibraryDetail / DeliveryDetail | **web 加载态有骨架屏，PC 是 `bg-bg-sunken rounded animate-pulse` 骨架（或转圈）**；且**错误态 web 是中性灰文字/居中 Card，PC 是 `rounded-md bg-danger-soft/30 border border-danger/40` 红条** | (a) PC 改中性；(b) web 改红色；(c) 视为可接受 | **(b) 错误态统一**。红条 `bg-danger-soft/30 border-danger/40` 与全项目「去线化」方向冲突（批 1 §7 已指出同款问题）；骨架屏形状差异可接受 |
| **P6** | Deliveries | **PC 卡片是 `rounded-md`(16) + `bg-bg-elevated` + `hover:bg-bg-sunken`（压暗）+ 64px 小缩略图行卡；web 是 `rounded-2xl`(24) + `bg-card` + `hover:bg-muted/50`（提亮）+ 全宽大图卡**。且 **PC 有多选/排序/拖放/web 没有** | (a) PC 全面改成 web 视觉；(b) 保留 PC 结构、只改颜色圆角；(c) 承认差异 | **(b)**。结构差异（多选/排序/拖放）是 PC 超前能力，不该回退；但颜色与圆角应对齐（`rounded-2xl` + `bg-card` + `hover:bg-muted/50`），否则交付中心是全项目圆角最不一致的一页 |
| **P7** | ProfileApps | **PC 在 `profile` 加载完成前会闪「此功能暂未对你的账号开放」**（`undefined === "6"` → false） | (a) 加 `isLoading` 守卫；(b) 改判定逻辑 | **(a) 加守卫**。这是本批唯一的**真 bug**，非风格问题 |
| **P8** | ProfileEdit | **`BIO_MAX` 200(web) vs 500(PC)**；**`DISPLAY_NAME_MAX` 30(web) vs 64(PC)**；**头像 96px(web `w-24`) vs 64px(PC `w-16`)**。且 web 自身注释 `profile/page.tsx:35` 写「头像 72px」与实际 96px 不符 | (a) 以 web 为准，PC 改；(b) 以 PC 为准，web 改；(c) 重新定规范 | **(c) 重新定规范**。三处数值两端都不一致且无 design-spec 依据，需先定规范再改代码 |
| **P9** | Register | **web 有「确认密码」，PC 没有**；**PC 有「密保问题/密保答案 + 协议勾选」，web 没有**；**成功跳转 web 跳 `/` PC 跳 `/login`** | (a) 两端字段并集；(b) 以 server required 为准裁剪；(c) 各自保留 | **(b)**。PC 注释 `:7` 明写「server 2026-10-19 起 `registerSchema.required`，客户端漏实现 → 注册必 400」——**若成立，web 当前注册是坏的**，需 PM 确认 server 现状后决定 |

---

## 17. 本批核实的「任务书错误」

| 任务书表述 | 实测 |
|---|---|
| 「auth 三页主 CTA 改成黑底白字**已在 0.7.7**」→ 隐含「CTA 已完全一致」 | **底色一致 ✅，圆角不一致 ❌**。web `rounded-xl`(22px) vs PC `rounded-md`(16px)；web 卡片 `rounded-2xl` vs PC 卡片 `rounded-md`。见 §6.2-P2 |
| `src/components/deliveries/CollectSheet.tsx` / `EditSheet.tsx` | **路径错**。两个文件都在 **`src/components/library/`** 下；`src/components/deliveries/` 只有 `DeliveriesDropZone` / `MultiSelectToolbar` / `ShareSheet` / `StarButton` |
| 「批 1 已改项要在表里重新核实：Login/Register CTA 黑底白字」 | **部分成立**：底色改了，但**圆角与卡片圆角未改**（见上） |
| 「批 1 已改项：Library/Notifications 卡片 `rounded-2xl`、Notifications 卡 `bg-bg-elevated`」 | **✅ 全部核实通过**。`NotificationItem.tsx:50` 原文 `rounded-2xl border border-border bg-bg-elevated p-4`；`CategoryTabs.tsx:47-48` 已是 `variant="underline"`。补上批 1 §6 #20/#21 |
| 「PC 子组件 chain：`CallTreeCard / ExecutionTiming / ApprovalBanner / ReferenceFold` 等子组件，要一路 read 到底」 | **`ExecutionTiming.tsx` 本批未读内容**（只确认存在，68 行）。其余 3 个已读全文（见 §6.2c / §6.2b）。且这 4 个都是 **气泡内**组件，页面级真正重要的是 `MessageList` / `ChatInputBar` / `ApprovalBanner`，已读 |
| 「PC 的 AppShell 包装是否给该页面套了 `h-14` 头部 / 侧栏」 | **对 `/chat/*` 是「否」**（`AppShell.tsx:121-123` 主动跳过），其余 9 页都是「是」。auth 三页不套 AppShell |
| 「web Browser = `src/app/(main)/browser/page.tsx`」 | **路径对，但严重低估**。web 只有 152 行、**必须 `?url=` 参数进来**的只读 viewer；PC 是 1227 行完整浏览器。**任务书按「两个实现」列，但按「两个产品」的差异对待更合适** |