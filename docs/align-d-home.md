# HOME 页 · web ↔ PC 逐条对齐清单（align-d-home）

> 产出时间：2026-10-26
> 真相源：`gacode-web/src/app/page.tsx`（499 行）+ `gacode-web/src/components/chat/ChatInputBar.tsx`（180 行）
> 对照端：`gacode-electron/src/routes/Home.tsx`（343 行）+ `src/components/home/{MediaPicker,PlusSheet,LibraryPicker,EmojiPicker}.tsx` + `src/components/chat/ChatInputBar.tsx`
> 粒度：最细颗粒度。每个可交互元素 / 视觉差异 / 功能分支 / 数据字段映射单独成条。

## 阅读说明

- **判定**：`缺失`（web 有、PC 没有）· `形态不同`（两边都有但 className / 结构 / 行为不一致）· `已一致`（逐行核对无差异，标 `已一致（d318f17）` 表示该轮已改到位）
- **token 前提**：PC `tailwind.config.ts:1-23` 头部注释写明「一字不差同步 gacode-web tailwind.config.ts」，实测 PC 仓**同时**具备 `bg-background` / `text-primary` / `bg-primary` / `border-border` / `rounded-squircle` / `shadow-elevation-3` / `text-headline` / `text-title` / `text-body` / `text-brand` / `text-brand-on` / `bg-bg-sunken` / `bg-bg-elevated` / `text-fg-muted` / `text-fg-subtle`。**所以 web 的 className 串可以逐字抄进 PC**，不需要做 token 改名映射。
- **PC 仓无 `tailwind-merge` / `clsx` / `cva`**：`cn()` 不存在，className 用 `[...].join(" ")` 数组拼接。冲突类名**不会自动去重**，后面的类名在 CSS 里靠源码顺序决胜，radius 之类必须显式写 `!rounded-full` 强制。
- **PC toast API 只有一个 `message` 字段**（`src/components/ui/Toast.tsx:31`：`toast: (input: { message: string; variant?: ToastVariant; duration?: number }) => void`），web 的 `title` / `description` 双字段在 PC 端**没有对应实现**。凡涉及双字段 toast 的条目，改造方案一律写成「拼成单行 message」。
- **本清单不列 PC 独有的功能**（按 gaga 指令：先 1:1 还原 web，PC 增强不在本清单讨论范围）。已知不计入差异的 PC 独有行为：Home 上的 `/` slash 菜单、拖拽文件上传、粘贴图片上传、ChatInputBar 内的 IME 组合保护（`isComposing`）。
- **表格 / 折叠**：本次范围是 HOME 页，不含 markdown 表格与 `ExpandableCell`；gaga 的「折叠 = 折行 + 可横滑 + 宽度封顶」规则在本页无适用面，不涉及。
- **`react-markdown` 版本坑**：本页无 markdown 渲染，不涉及 web `^9.0.1` / PC `^10.1.0` 的 components 回调签名差异。

## 统计（详见文末 §12）

| 判定 | 条数 |
|---|---|
| 缺失 | 14 |
| 形态不同 | 42 |
| 已一致 | 14 |
| **合计** | **70** |

另：**7 条结构级差异**待 gaga 拍（§9 · S-01 ~ S-07，每条含影响面 + 选项 + PM 建议）。
「PC 侧栏常驻 vs web 抽屉」一项**已拍板保留**，不进 §9。

---

# §1 页面骨架与分支

## H-01　根容器高度与背景 token

- **web**：`gacode-web/src/app/page.tsx:269`（已登录）/ `:426`（未登录）
  ```tsx
  <div className="min-h-screen flex flex-col bg-background">
  ```
- **PC**：`gacode-electron/src/routes/Home.tsx:274`
  ```tsx
  <div className="min-h-full flex flex-col bg-bg-base">
  ```
- **判定**：形态不同（2 处差异）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Home.tsx`
  - 锚点：`export function Home()` 内 return 的根 div（`Home.tsx:274`）
  - `min-h-full` → `min-h-screen`（PC 根容器在 AppShell 的 `<main>` 内，`min-h-full` 需要父级有确定高度；`min-h-screen` 是 viewport 语义，与 web 一致）
  - `bg-bg-base` → `bg-background`（PC 两者都是 `#000000`，`tailwind.config.ts:54` vs `:76`；写 `bg-background` 是为了跟 web 源码逐字一致，便于后续 diff 核对）
  - 最终 className 串：`"min-h-screen flex flex-col bg-background"`
  - 预估改动：**1 行**（`Home.tsx:274`）

## H-02　未登录分支（整块缺失）

- **web**：`gacode-web/src/app/page.tsx:425-537` 整个 return 分支（未登录 = 居中 Cody 头像 + 居中输入框 + 右上登录按钮 + 未登录 AlertDialog）
- **PC**：`PC 缺失` —— `src/App.tsx:103-109` 把 Home 包在 `<Protected>` 里，未登录直接跳 `/login`：
  ```tsx
  <Route
    path="/"
    element={
      <Protected>
        <Home />
      </Protected>
    }
  ```
  PC `Home.tsx` 全文没有任何 `isAuthenticated` 分支判断。
- **判定**：缺失
- **怎么改**：见文末「结构级差异 S-01」——这条不是单文件改动，要拆 ProtectedRoute 语义，需 gaga 拍板后单独排工。**本次不给出落地方案**（改动会波及 App.tsx / auth.tsx / 路由守卫，超出「只读不改」边界，且属于信息架构级决策）。
- 预估改动：**>200 行（跨 4 文件，待拍板）**

## H-03　顶部 ☰ 菜单按钮 + Drawer —— ✅ 已拍板 · PC 不还原

- **web**：`gacode-web/src/app/page.tsx:270-286`
  ```tsx
  <Drawer
    isOpen={drawerOpen}
    onClose={() => setDrawerOpen(false)}
    onChatSelect={handleChatSelect}
  />

  {/* 顶部栏: 左☰ 右空白 */}
  <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm">
    <button
      type="button"
      onClick={handleMenuClick}
      aria-label="菜单"
      className="inline-flex items-center justify-center w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors"
    >
      <Menu className="w-5 h-5" />
    </button>
  </div>
  ```
- **PC**：`PC 缺失` —— `Home.tsx` 全文无 `Menu` 图标、无 `Drawer`、无 `drawerOpen` state。PC 侧导航由 AppShell 常驻 sidebar 承担（`src/components/layout/AppShell.tsx` 的 `SIDEBAR_WIDTH = 256`）。
- **判定**：~~缺失~~ → **已拍板 · PC 不还原**
- **怎么改**：**不改**。gaga 2026-10-26 明确拍板：PC 的 256px 常驻侧栏保留，不改成 web 的 Drawer 抽屉。
  - 侧栏**内部内容与交互**照 web 对齐（置顶可折叠分组 / 每条对话 pin 按钮 / 条目视觉形态 / 圆角间距 hover 态 / 计数与折叠箭头）—— **属 ChatList 侧栏域，不在本 HOME 页清单范围**，由该域 worker 承接。
  - 本条**不进**「结构级差异 · 需 gaga 拍」一节（已拍板）。
- 预估改动：**0 行**

## H-04　已登录顶部栏容器（sticky + 毛玻璃）—— ✅ 已拍板 · PC 不还原

- **web**：`gacode-web/src/app/page.tsx:277`　`"sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm"`
- **PC**：`PC 缺失`（PC `Home.tsx:273-296` 从根 div 直接进欢迎语区，中间没有顶栏）
- **判定**：~~缺失~~ → **已拍板 · PC 不还原**（与 H-03 同因）
- **怎么改**：
  - **不改**。PC 侧由 AppShell 常驻侧栏 + AppShell 头部（已有 `border-b`，见 commit `767ac23 style(electron): AppShell 头部加 border-b 对齐 web (main) Header`）承担全局头部职责，Home 再画一条顶部栏会与 AppShell 重复。
  - 本条**不进**「结构级差异 · 需 gaga 拍」一节（已拍板）。
  - ⚠️ 连带影响：H-05 里 web 的「顶部留白 `pt-10`」在 PC 端本来是「顶栏之下留白」，PC 没有顶栏后 `pt-10` 的视觉含义变成「页面顶部留白 40px」—— **H-05 的 className 改动仍然要做**（`pt-10 pb-6` 保留不变，只是去掉 `justify-center`）。
- 预估改动：**0 行**

## H-05　欢迎语容器布局

- **web**：`gacode-web/src/app/page.tsx:289`　`"pt-10 pb-6 px-4 text-center"`
- **PC**：`gacode-electron/src/routes/Home.tsx:284`　`"flex-1 flex flex-col items-center justify-center px-4 lg:px-8 pt-10 pb-6"`
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Home.tsx`
  - 锚点：`Home.tsx:284` 的 `<div className="flex-1 flex flex-col items-center justify-center px-4 lg:px-8 pt-10 pb-6">`
  - web 的欢迎语区**不是垂直居中**：它是一块 `pt-10 pb-6 px-4 text-center` 的固定高度块，上方还有 `<div className="flex-1" />`（`page.tsx:299`）把它推到上面。
  - 差异拆三条：
    1. `justify-center` → 删（web 无垂直居中）
    2. `text-center` → 加（web 有，PC 靠内层 `text-center` 达到同样效果，但 `lg:px-8` → `px-4` 需对齐）
    3. `lg:px-8` → `px-4`（web 无 lg 断点差异）
  - 同时新增 web 的空态撑高块：紧跟欢迎语 div 之后插入 `<div className="flex-1" />`（`page.tsx:299` 原文）
  - 最终 className 串：`"pt-10 pb-6 px-4 text-center"` + 内层保留 PC 现有的 `<div className="flex flex-col items-center gap-3 text-center">`（`Home.tsx:285`，这一层 PC 已一致）
  - 预估改动：**2 行**（改 1 行 className + 插 1 行 `<div className="flex-1" />`）

## H-06　Cody 头像（图片资源）

- **web**：`gacode-web/src/app/page.tsx:290-294`
  ```tsx
  <img
    src={`${BASE_PATH}/assets/cody/cody_512.png`}
    alt="Cody"
    className="w-16 h-16 rounded-squircle mx-auto mb-4"
  />
  ```
- **PC**：`gacode-electron/src/routes/Home.tsx:286-291`
  ```tsx
  <div
    aria-hidden="true"
    className="w-[72px] h-[72px] rounded-xl bg-bg-elevated flex items-center justify-center text-fg-muted text-2xl font-medium"
  >
    cody
  </div>
  ```
- **判定**：形态不同（3 处：尺寸 / 圆角 / 资源类型）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Home.tsx`
  - 锚点：`Home.tsx:286-291` 的头像 div（`aria-hidden="true"` + `w-[72px] h-[72px]`）
  - **尺寸**：`w-16 h-16` = 64px。web 用的就是 64px（不是 120px，那是未登录分支 H-11）。PC 现在是 72px → 改 `w-[72px] h-[72px]` 为 `w-16 h-16`
  - **圆角**：`rounded-squircle` = 22px（PC `tailwind.config.ts:145` 有 `squircle: "22px"`）。PC 现在是 `rounded-xl` = 22px —— **数值相同，但类名不同**，统一写成 `rounded-squircle` 跟 web 逐字对齐
  - **资源**：web 是真图 `cody_512.png`（512×512 源，显示 64px）。PC 仓内实测 `public/` 只有 `fonts/`，**没有 cody 图**（`Home.tsx:282` 注释已记录）。所以：
    - 短期（不引入新资源）：保持 PC 的文字占位 div，只改 className → `w-16 h-16 rounded-squircle bg-bg-elevated flex items-center justify-center text-fg-muted text-2xl font-medium`
    - 完整对齐：需 gagaOS 提供 `cody_512.png` 落到 `gacode-electron/public/assets/cody/cody_512.png`，然后换成
      ```tsx
      <img
        src={"/assets/cody/cody_512.png"}
        alt="Cody"
        className="w-16 h-16 rounded-squircle mx-auto mb-4"
      />
      ```
      （Electron 打包走 `public/` → `file://` 相对路径，**不要抄 web 的 `${BASE_PATH}`**——那是 Next.js basePath，PC 无此概念）
  - **`mx-auto mb-4`**：web 头像自带 `mx-auto mb-4`（居中 + 下间距 16px）。PC 的 `mb-4` 由外层 `gap-3`（`Home.tsx:285`）提供 → 改成 `gap-3` 为 `gap-4` 即等价，或直接在头像上写 `mb-4` 并把外层 gap 调到 `gap-0`。**推荐**：外层 `gap-3` → `gap-4`，头像不加 `mx-auto mb-4`（父级已 `items-center`，`mx-auto` 冗余）
  - 预估改动：**1 行（className）+ 1 行（gap）+ 资源待提供**

## H-07　欢迎语文案

- **web**：`gacode-web/src/app/page.tsx:295`
  ```tsx
  <h1 className="text-headline font-medium">HI 我是 <span className="text-primary">cody</span> 很高兴遇见你</h1>
  ```
- **PC**：`gacode-electron/src/routes/Home.tsx:292-294`
  ```tsx
  <h1 className="text-headline font-medium">
    HI 欢迎你,<span className="text-brand">{displayName}</span>
  </h1>
  ```
- **判定**：形态不同（文案 + 语义）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Home.tsx`
  - 锚点：`Home.tsx:292-294` 的 `<h1>`
  - 文案逐字改为：`HI 我是 ` + `<span className="text-primary">cody</span>` + ` 很高兴遇见你`
  - **`text-brand` → `text-primary`**：PC 两个 token 同值（`brand.DEFAULT = #FF6B35`，`primary.DEFAULT = #FF6B35`，`tailwind.config.ts:40` / `:83-86`），统一写 `text-primary` 跟 web 逐字一致
  - **`displayName` 变量作废**：web 无用户名。改完后 `Home.tsx:97` 的 `const displayName = user?.displayName || user?.username || "访客";` 变成未使用变量 → **需删除该行**（否则 TS `noUnusedLocals` 报错）
  - 连带：`Home.tsx:82` 的 `const { user } = useAuth();` 若无其他用途 → 一并删除；`useAuth` import（`Home.tsx:41`）也需清理。**注意**：本条删除后 PC Home 不再依赖 auth context，但 `Protected` 仍在 `App.tsx` 层守门，登录态判断不受影响
  - 最终 JSX：
    ```tsx
    <h1 className="text-headline font-medium">
      HI 我是 <span className="text-primary">cody</span> 很高兴遇见你
    </h1>
    ```
  - 预估改动：**4 行**

## H-08　标题 className

- **web**：`gacode-web/src/app/page.tsx:295`　`"text-headline font-medium"`
- **PC**：`gacode-electron/src/routes/Home.tsx:292`　`"text-headline font-medium"`
- **判定**：**已一致**
- 预估改动：**0 行**

## H-09　已登录分支输入条容器（底部分隔 + 限宽）

- **web**：`gacode-web/src/app/page.tsx:360-361`
  ```tsx
  <div className="border-t border-border p-4 bg-background">
    <div className="max-w-3xl mx-auto">
  ```
- **PC**：`gacode-electron/src/routes/Home.tsx:304-305`
  ```tsx
  <div className="border-t border-border p-4 bg-bg-base">
    <div className="max-w-2xl mx-auto w-full">
  ```
- **判定**：形态不同（2 处）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Home.tsx`
  - 锚点：`Home.tsx:304-305`
  - `bg-bg-base` → `bg-background`（同值，写法对齐 web）
  - `max-w-2xl` → `max-w-3xl`（**web 已登录分支是 `max-w-3xl` = 768px；`max-w-2xl` = 640px 是 web 未登录分支的值**。PC 只有一条分支，等价于 web 已登录分支 → 必须取 768px）
  - `mx-auto w-full` → `mx-auto`（web 没写 `w-full`；但内层 `ChatInputBar` 根 div 自带 `w-full`（web `ChatInputBar.tsx:82`：`cn("w-full", className)`），PC 的 ChatInputBar 根 div 也需要确认自带 `w-full`——PC `ChatInputBar.tsx:502` 是 `<div className="px-4 pb-4 pt-2">`，**没有 `w-full`**，所以 PC **保留 `w-full` 更安全**，这一项判为「PC 保留」，只改 `max-w-2xl` → `max-w-3xl`
  - 最终 className 串（容器）：`"border-t border-border p-4 bg-background"`；内层：`"max-w-3xl mx-auto w-full"`
  - 预估改动：**2 行**

## H-10　已登录分支 ChatInputBar props

- **web**：`gacode-web/src/app/page.tsx:362-369`
  ```tsx
  <ChatInputBar
    value={text}
    onChange={setText}
    onSend={handleSubmit}
    onPlusClick={handlePlusClick}
    placeholder="说点什么…"
    disabled={createChatMutation.isPending}
  />
  ```
- **PC**：`gacode-electron/src/routes/Home.tsx:306-315`
  ```tsx
  <ChatInputBar
    ref={inputBarRef}
    isStreaming={false}
    onStop={() => { /* home 无流式 — no-op */ }}
    onSubmit={handleSubmit}
    onAttachmentError={handleAttachmentError}
    onPlusClick={() => setPlusOpen(true)}
  />
  ```
- **判定**：形态不同（props 体系整体不同 —— web 是受控 `value/onChange`，PC 是内部自持 state + `onSubmit(text, attachments)`）
- **怎么改**：**不改**。这是两端 ChatInputBar 组件 API 的根本差异，属另一 worker 的 chat 域职责。本页只在此登记「Home 视角下的 props 对照」，改造成本与排期由 chat 域一并处理（PC 端受控化会波及 ChatDetail）。
  - 本页只需保证 **PC ChatInputBar 接受下列可选 props**（若 chat 域改造时引入）：
    - `placeholder?: string`（默认 `"说点什么…"`）
    - `disabled?: boolean`（整体禁用）
  - 预估改动：**本页 0 行（chat 域处理）**

---

# §2 附件预览区

## H-11　附件预览容器位置与间距

- **web**：`gacode-web/src/app/page.tsx:306-308`（**在 ChatInputBar 外部，输入条上方，独立一块**）
  ```tsx
  {upload.items.length > 0 && (
    <div className="px-4 pb-2">
      <div className="flex flex-wrap gap-2">
  ```
- **PC**：`gacode-electron/src/components/chat/ChatInputBar.tsx:507-508`（**在 ChatInputBar 内部，输入行上方**）
  ```tsx
  {attachments.length > 0 ? (
    <div className="mb-2 flex flex-wrap gap-1.5">
  ```
- **判定**：形态不同（2 处：层级位置 + 间距）
- **怎么改**：
  - **位置差异**：web 把附件预览放在 ChatInputBar **外面**（`page.tsx:306`，是 Home 页自己的 JSX），PC 放在 ChatInputBar **里面**（`ChatInputBar.tsx:507`）。
  - 后果：PC 的 Home 无法自己控制附件区样式（chat 域改 ChatInputBar 会同时改到 ChatDetail）。要对齐 web，附件区必须上移到 Home。
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Home.tsx`
  - 锚点：`Home.tsx:304` 的 `<div className="border-t border-border p-4 bg-bg-base">` **内部最前面**（`<div className="max-w-2xl mx-auto w-full">` 之前）
  - 插入：
    ```tsx
    {attachments.length > 0 && (
      <div className="px-4 pb-2">
        <div className="flex flex-wrap gap-2">
          {/* 三态渲染，见 H-12 / H-13 / H-14 */}
        </div>
      </div>
    )}
    ```
  - 但 PC 的附件 state 在 ChatInputBar 内部（`ChatInputBar.tsx:173` `const [attachments, setAttachments] = useState<AttachmentItem[]>([])`），Home 拿不到 → **需要 chat 域配合**：ChatInputBar 增加 `onAttachmentsChange?: (items: AttachmentItem[]) => void` prop，每次 `setAttachments` 后同步回调；或 Home 改为受控持有 attachments。
  - **这是本清单里最大的跨域依赖**，排工时必须跟 chat 域一起排（见文末「改动量最大的前 10 条」第 1 条）。
  - 间距：`gap-1.5`（6px）→ `gap-2`（8px）；外层 `mb-2` → `px-4 pb-2`
  - 预估改动：**Home 端 ~10 行 + ChatInputBar 端 ~8 行（跨域，需与 chat worker 协商）**

## H-12　上传中进度条

- **web**：`gacode-web/src/app/page.tsx:311-319` 调用 `web/src/components/ui/progress.tsx:41-74`
  ```tsx
  <ProgressBar
    key={it.id}
    value={it.pct}
    fileName={it.file.name}
    onCancel={() => removeAttachment(it.id)}
  />
  ```
  web `ProgressBar` 根 className（`progress.tsx:43`）：`"flex items-center gap-2 px-3 py-2 rounded-full bg-bg-base shadow-sm"`
  轨道（`progress.tsx:55`）：`"flex-1 h-1.5 bg-bg-sunken rounded-full overflow-hidden"`
  填充（`progress.tsx:57`）：`"h-full bg-primary transition-all duration-150 ease-standard"`
  百分比（`progress.tsx:61`）：`"text-xs tabular-nums text-fg-muted shrink-0"`
- **PC**：`gacode-electron/src/components/chat/UploadProgressBar.tsx:35-52`
  ```tsx
  className={[
    "flex items-center gap-2 px-3 py-2 rounded-full bg-bg-elevated",
    className ?? "",
  ].join(" ")}
  ...
  <div className="h-full bg-brand transition-[width] duration-150" ... />
  ```
- **判定**：形态不同（2 处）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\UploadProgressBar.tsx`
  - 锚点：`UploadProgressBar.tsx:36` 的 className 数组首项
  - **底色**：`bg-bg-elevated`（#181818）→ `bg-bg-base`（#000000）+ 加 `shadow-sm`
    - web 原文：`"flex items-center gap-2 px-3 py-2 rounded-full bg-bg-base shadow-sm"`
    - PC 最终：`"flex items-center gap-2 px-3 py-2 rounded-full bg-bg-base shadow-sm"`
    - ⚠️ **冲突类名**：PC 数组拼接没有 tailwind-merge，`shadow-sm` 与 `bg-bg-elevated` 是不同属性，无冲突，可直接替换
  - **填充色**：`bg-brand` → `bg-primary`（同值 #FF6B35，写法对齐 web）
  - **过渡属性**：web `transition-all duration-150 ease-standard`；PC `transition-[width] duration-150`
    - web `ease-standard` = `cubic-bezier(0.4, 0.0, 0.2, 1)`（PC `tailwind.config.ts:195` 有同名 token）
    - PC 最终：`"h-full bg-primary transition-all duration-150 ease-standard"`
  - 预估改动：**2 行**

## H-13　上传完成附件 chip

- **web**：`gacode-web/src/app/page.tsx:321-328` + `web/src/components/chat/AttachmentChip.tsx`
  ```tsx
  <AttachmentChip
    key={it.id}
    file={{ name: it.file.name, type: it.file.type }}
    thumbnailUrl={it.file.type.startsWith("image/") ? it.url : undefined}
    onRemove={() => removeAttachment(it.id)}
  />
  ```
  web 组件根 className（`AttachmentChip.tsx:55`）：`"inline-flex items-center gap-2 px-3 py-2 rounded-md bg-bg-base shadow-sm max-w-full"`
  缩略图 img（`:65`）：`"w-8 h-8 rounded object-cover shrink-0"`
- **PC**：`gacode-electron/src/components/chat/AttachmentChip.tsx:50`
  ```tsx
  "inline-flex items-center gap-2 px-3 py-2 rounded-md bg-bg-elevated max-w-full",
  ```
- **判定**：形态不同（1 处：底色 + 阴影）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\AttachmentChip.tsx`
  - 锚点：`AttachmentChip.tsx:50`
  - `bg-bg-elevated` → `bg-bg-base`，并追加 `shadow-sm`
  - PC 最终：`"inline-flex items-center gap-2 px-3 py-2 rounded-md bg-bg-base shadow-sm max-w-full"`
  - ⚠️ **注意**：`AttachmentChip.tsx:48-50` 的注释解释了 PC 故意用 `bg-bg-elevated` 的原因（输入区底板去掉后 chip 跟页面都是 #000 看不见了）。**这一改会让 PC chip 在黑底上「消失」**，除非同时把 Home/ChatDetail 的输入区底板恢复成 web 的 `bg-bg-elevated`（见 H-16）。**两者必须一起改，否则视觉回归**。
  - 预估改动：**1 行**

## H-14　上传失败错误 chip

- **web**：`gacode-web/src/app/page.tsx:330-351` + `web/src/components/common/UploadErrorChip.tsx:40-58`
  ```tsx
  <Card className="border border-red-200 bg-red-50/60 w-full">
    <CardContent className="p-3 flex items-center gap-2">
      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{fileName}</p>
        <p className="text-xs text-red-700 truncate">上传失败 · {errorMsg}</p>
      </div>
      {onRetry && <Button size="sm" variant="ghost" onClick={onRetry}>重试</Button>}
      {onRemove && <Button size="sm" variant="ghost" onClick={onRemove}>删除</Button>}
    </CardContent>
  </Card>
  ```
- **PC**：`gacode-electron/src/components/chat/UploadErrorChip.tsx:27-55`
  ```tsx
  <div className="w-full border border-red-500/40 bg-red-500/10 rounded-md">
    <div className="p-3 flex items-center gap-2">
      <AlertTriangleIcon />
      ...
      <p className="text-xs text-red-400 truncate">上传失败 · {errorMsg}</p>
  ```
- **判定**：形态不同（暗色等价色，但类名/结构不同）
- **怎么改**：
  - **色彩**：web 用的是**亮色**系 `border-red-200 bg-red-50/60 text-red-600 text-red-700`（web 是亮色底）。PC 用暗色系 `border-red-500/40 bg-red-500/10 text-red-400`。
    - web 端 Home 默认是**暗色主题**（`bg-background` = #000），但错误 chip 用了亮色红底 —— 这是 web 的**实际行为**，PC 要 1:1 还原就得照抄亮色（亮红底 + 深红字，在纯黑背景上会很扎眼）。
    - **建议**：照抄 web 原文（对齐优先），但把这条标「视觉存疑，需 gaga 看一眼」。
    - PC 最终根 className：`"w-full border border-red-200 bg-red-50/60"`（去掉 `rounded-md`，web 的 `Card` 自带 `rounded-xl`，见 `web/src/components/ui/card.tsx`）
    - 图标色：`text-red-400` → `text-red-600`；文案色：`text-red-400` → `text-red-700`
    - ⚠️ **冲突类名**：PC 现有 `rounded-md` 与 web 的 `Card` 圆角不同；若照抄 `Card` 需 `rounded-xl`（PC `tailwind.config.ts:141` 有 `xl: "22px"`，web Card 的 `rounded-xl` 同值）
  - **按钮样式**：web 用 `Button size="sm" variant="ghost"`（shadcn）；PC 用手写 `<button className="shrink-0 px-2 py-1 rounded text-xs text-fg hover:bg-bg-sunken transition-colors duration-150">`。
    - 对齐方式：PC 仓无 shadcn `Button` 的 `size="sm" variant="ghost"` 组合（PC 有 `src/components/ui/Button.tsx`，支持 `variant` / `size`），可换用 PC 的 `<Button variant="ghost" size="sm">`；或保留手写 button 只改 className。
    - PC `Button` 组件在 `src/components/ui/Button.tsx`，已被 `BottomSheet.tsx:17` 引用。
  - 预估改动：**6 行**

## H-15　附件区「上传中禁止提交」拦截

- **web**：`gacode-web/src/app/page.tsx:215-226`
  ```tsx
  const hasUploading = upload.items.some((it) => it.status === "uploading");
  ...
  if (hasUploading) {
    toast({
      title: "附件还在上传中",
      description: "请稍候几秒再发送",
      variant: "default",
    });
    return;
  }
  ```
- **PC**：`PC 缺失` —— PC `ChatInputBar.tsx:392-395` 只过滤 `kind === "done"` 的附件传给 parent，**上传中的附件被静默丢弃**，用户点发送 → 附件直接没了，没有任何提示。
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\ChatInputBar.tsx`
  - 锚点：`handleSend`（`ChatInputBar.tsx:388-400`），在 `const doneAtts = ...`（`:392`）之前插入：
    ```tsx
    const hasUploading = attachments.some((x) => x.kind === "uploading");
    if (hasUploading) {
      onAttachmentError?.("附件还在上传中, 请稍候几秒再发送");
      return;
    }
    ```
  - ⚠️ `onAttachmentError` 的 PC 语义是「上传失败」→ Home 的 `handleAttachmentError` 用 `variant: "danger"`（`Home.tsx:201`），web 这里用的是 `variant: "default"`。
  - **PC toast API 无 title/description** → 必须拼单行 message：`"附件还在上传中, 请稍候几秒再发送"`
  - **更干净的方案**：Home 侧拦截。但 attachments state 在 ChatInputBar 内（`ChatInputBar.tsx:173`），Home 拿不到 → 若采纳 H-11 的「附件区上移 Home」改造，则此项天然由 Home 接管，拦截逻辑直接写在 `Home.tsx` 的 `handleSubmit` 里。
  - 预估改动：**5 行（ChatInputBar 内）** 或 **6 行（Home 内，依赖 H-11 先落地）**

## H-16　附件区「部分失败仍可发送」warning

- **web**：`gacode-web/src/app/page.tsx:216, 228-234`
  ```tsx
  const hasError = upload.items.some((it) => it.status === "error");
  ...
  if (hasError) {
    toast({
      title: "部分附件上传失败",
      description: "已移除失败项, 正在发送其余内容",
      variant: "warning",
    });
  }
  ```
- **PC**：`PC 缺失` —— PC `ChatInputBar.tsx:392` 只取 `done`，error 项被丢掉，**不发任何 warning**。
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\ChatInputBar.tsx`
  - 锚点：`handleSend`（`ChatInputBar.tsx:388`）
  - PC toast 无 `warning` 的 title/description 双字段，但 **PC Toast 有 `warning` variant**（`Toast.tsx:22`：`ToastVariant = "default" | "success" | "danger" | "warning"`）→ 拼单行 message
  - 问题：PC 的 `onAttachmentError` 固定走 `variant: "danger"`（`Home.tsx:201`），无法表达 warning。
  - **方案 A（推荐，改 Home 不改 ChatInputBar API）**：在 ChatInputBar 增加 prop
    ```tsx
    /** 提交前提示 (上传中 / 部分失败). message 已含全部信息, variant 由 parent 决定 */
    onSubmitNotice?: (message: string, variant: "default" | "warning") => void;
    ```
    Home 侧：
    ```tsx
    const handleSubmitNotice = useCallback(
      (message: string, variant: "default" | "warning") => {
        toast({ message, variant });
      },
      [toast],
    );
    ```
    并在 `Home.tsx:313` 的 `<ChatInputBar ...>` 上加 `onSubmitNotice={handleSubmitNotice}`
  - **方案 B（简单）**：复用 `onAttachmentError`，但 Home 侧把 danger 改成按前缀判断——**不推荐**，语义混乱
  - 最终 message 文案（对齐 web 两段拼接）：`"部分附件上传失败, 已移除失败项, 正在发送其余内容"`
  - 预估改动：**~10 行（ChatInputBar 4 + Home 6）**

## H-17　「空文本但有附件」也允许提交

- **web**：`gacode-web/src/app/page.tsx:217`　`if (!content && upload.items.length === 0) return;`
- **PC**：`gacode-electron/src/components/chat/ChatInputBar.tsx:389-390`
  ```tsx
  const trimmed = text.trim();
  if (!trimmed) return;
  ```
  → **PC 文本为空时直接 return，即使已经挂了附件也发不出去。**
  （发送按钮的 disabled 条件 `ChatInputBar.tsx:642` 是 `disabled={!text.trim() && !attachments.some((x) => x.kind === "done")}` —— 按钮可点，但点了被 `handleSend` 的 `if (!trimmed) return;` 拦掉，**点发送没反应**。）
- **判定**：形态不同（**行为 bug**）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\ChatInputBar.tsx`
  - 锚点：`handleSend`（`ChatInputBar.tsx:388-390`）
  - 改前：
    ```tsx
    const trimmed = text.trim();
    if (!trimmed) return;
    ```
  - 改后：
    ```tsx
    const trimmed = text.trim();
    const hasDoneAttachment = attachments.some((x) => x.kind === "done");
    if (!trimmed && !hasDoneAttachment) return;
    ```
  - 预估改动：**2 行**

## H-18　提交后附件预览是否清空

- **web**：`gacode-web/src/app/page.tsx:237-239` —— **不清空**（注释明说「这里不重置, 让 user 看到状态到 chat 页前都不丢」）
- **PC**：`gacode-electron/src/components/chat/ChatInputBar.tsx:396-399`
  ```tsx
  const ok = onSubmit(trimmed, doneAtts);
  if (ok !== false) {
    setText("");
    setAttachments([]);
  }
  ```
  → PC 提交后**立即清空附件**，与 web 行为相反。
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\ChatInputBar.tsx`
  - 锚点：`handleSend`（`ChatInputBar.tsx:396-399`）
  - 保留 `setText("")`（两边一致），把 `setAttachments([])` 改成「等跳转完成再清」—— 但 PC 提交后立即 `navigate('/chat/:id')`（`Home.tsx:103`），组件卸载，附件自然消失 → **实际用户观感与 web 相同**。
  - **判定修正**：本条实际观感一致，**降级为「已一致（行为等价）」**，但需注意一个真实差异：web 的 `handleSubmit` 在 `createChatMutation.mutate(firstMsg)` 之前**不**清空，且 createChat 失败时附件仍在（用户可重试）；PC 的 `onSubmit` 返回 `true` 后立即清空附件，**createChat 失败（`Home.tsx:105-110` toast）时附件已丢，用户无法重试**。
  - **实际要改的**：PC `Home.tsx:114-166` 的 `handleSubmit` 返回值写死 `return true`（`:163`），应改为把 createChat 的成功与否回传给 ChatInputBar：
    ```tsx
    // Home.tsx handleSubmit
    const handleSubmit = useCallback(
      (text: string, attachments: PendingAttachment[]): boolean => {
        ... 拼 firstMsg / sessionStorage ...
        createMutation.mutate(undefined, {
          onSuccess: () => navigate(`/chat/${chat.id}`),
          onError: () => { /* toast 已有 */ },
        });
        return true;  // ← 改成受 createChat 结果驱动
      },
      [createMutation],
    );
    ```
    更直接的做法：把附件清空时机交给「跳转成功」——即 `handleSubmit` 返回 `false`（保留输入），由 `createMutation.onSuccess` 里再 `inputBarRef.current?.clear()`。
    - **需新增** `ChatInputBarHandle` 方法（改 `ChatInputBar.tsx:106-111`）：
      ```tsx
      export interface ChatInputBarHandle {
        insertEmoji: (text: string) => void;
        insertText: (text: string) => void;
        addAttachment: (att: PendingAttachment) => void;
        focus: () => void;
        /** 新增: 清空文本 + 附件 (Home 在 createChat 成功后调用) */
        clear: () => void;
      }
      ```
      实现（`useImperativeHandle` 内，`ChatInputBar.tsx:186-225`）：
      ```tsx
      clear: () => {
        setText("");
        setAttachments([]);
      },
      ```
    - `Home.tsx` 的 `createMutation.onSuccess`（`Home.tsx:102-104`）改为：
      ```tsx
      onSuccess: (chat) => {
        inputBarRef.current?.clear();
        navigate(`/chat/${chat.id}`);
      },
      ```
      并把 `handleSubmit` 的 `return true` 改成 `return false`（让 ChatInputBar **不**自行清空）→ `ChatInputBar.tsx:396-399` 的 `if (ok !== false)` 分支自然不执行清空。
      ⚠️ **但 `return false` 会让 ChatInputBar 保留文本**，PC 跳转后组件卸载，文本随之消失 → 观感一致。
  - 预估改动：**~12 行（ChatInputBar 6 + Home 6）**

---

# §3 输入条（首页视角）

> 本节只记「Home 用到的 ChatInputBar」与 web 版的差异。**ChatInputBar 本体属 chat 域 worker 职责**，本节条目给的是「Home 要拿到什么、怎么拿」的实施规格，chat 域 worker 直接引用即可。

## H-19　输入条外层卡片

- **web**：`gacode-web/src/components/chat/ChatInputBar.tsx:84-92`
  ```tsx
  <div
    className={cn(
      "bg-bg-elevated rounded-md px-4 py-3 flex items-end gap-2",
      "border border-transparent transition-colors duration-150",
      "focus-within:border-border",
      disabled && !isStreaming && "opacity-60",
      isStreaming && "border-brand/40"
    )}
  >
  ```
- **PC**：`gacode-electron/src/components/chat/ChatInputBar.tsx:502`（外层）+ `:584`（textarea 自身）
  ```tsx
  <div className="px-4 pb-4 pt-2">
  ...
  <textarea className="w-full resize-none bg-bg-sunken border border-border rounded-md px-3 py-2 text-sm leading-6 placeholder:text-fg-subtle focus:outline-none focus:border-brand disabled:opacity-70 max-h-32 overflow-y-auto ..." />
  ```
- **判定**：形态不同（**PC 是「裸 textarea 卡片」，web 是「外层卡片包 textarea」—— 视觉结构完全不同**）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\ChatInputBar.tsx`
  - 锚点：`ChatInputBar.tsx:550` 的 `<div className="flex items-end gap-2">`（input row）
  - web 的结构：`外层卡片(bg-bg-elevated rounded-md px-4 py-3 flex items-end gap-2)` 里面直接放 `+按钮 / textarea / 发送按钮`，textarea 自己**没有底色、没有边框、没有圆角**。
  - PC 要改成：
    ```tsx
    <div className={[
      "bg-bg-elevated rounded-md px-4 py-3 flex items-end gap-2",
      "border border-transparent transition-colors duration-150",
      "focus-within:border-border",
      disabled && !isStreaming && "opacity-60",
      isStreaming && "border-brand/40",
    ].join(" ")}>
      {onPlusClick ? (<PlusButton />) : null}
      <textarea className="flex-1 bg-transparent text-fg placeholder:text-fg-subtle outline-none text-base leading-6 resize-none max-h-32 py-2 disabled:opacity-60" ... />
      {SendOrStopButton}
    </div>
    ```
  - **PC 无 `cn()`** → 用 `[...].join(" ")`（本文件 `:145-150` 已有此写法先例）
  - **PC 无 `disabled` prop** → 需新增 `disabled?: boolean`（默认 `false`），Home 传 `createMutation.isPending`
  - textarea 要删掉的 PC 类：`bg-bg-sunken` `border` `border-border` `rounded-md` `px-3` `py-2` `text-sm` `focus:outline-none` `focus:border-brand` `overflow-y-auto` `[scrollbar-width:none]` `[&::-webkit-scrollbar]:hidden`
    - `text-sm` → `text-base`（web 是 16px，PC 是 14px）
    - `leading-6` 保留（web 也是 `leading-6`）
    - `max-h-32` 保留（web `max-h-32`）
    - `w-full` → `flex-1`
    - `resize-none` 保留
    - `outline-none` 保留
  - PC 端 textarea 还需要保留 `overflow-y-auto` + 隐藏滚动条（PC 多行折叠更实用）—— web 的 textarea 在 `max-h-32` 内也会滚动但没隐藏滚动条。**建议保留 PC 的滚动条隐藏**，属 PC 既有行为，不影响 1:1 还原的判定项。
  - 预估改动：**~25 行（ChatInputBar 内，chat 域）**

## H-20　`+` 按钮形态

- **web**：`gacode-web/src/components/chat/ChatInputBar.tsx:94-103`
  ```tsx
  {onPlusClick && (
    <button
      type="button"
      aria-label="附件"
      onClick={onPlusClick}
      className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center"
    >
      <Plus className="w-5 h-5" />
    </button>
  )}
  ```
- **PC**：`gacode-electron/src/components/chat/ChatInputBar.tsx:554-565`
  ```tsx
  className="shrink-0 h-9 w-9 rounded-md bg-bg-sunken text-fg-muted hover:bg-bg-elevated hover:text-fg disabled:opacity-50 disabled:pointer-events-none inline-flex items-center justify-center transition-colors duration-150"
  ```
  图标：PC `PlusGlyph`（`:748-765`）`width="18" height="18" strokeWidth="1.8"`；web lucide `Plus` `w-5 h-5` = 20px，`stroke-width` 2
- **判定**：形态不同（3 处：形状 / 底色 / 图标尺寸）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\ChatInputBar.tsx`
  - 锚点：`ChatInputBar.tsx:562` 的 className 串
  - **圆角**：`rounded-md`（16px）→ `rounded-full`（9999px）。web 是**圆形无底色**的 `+`。
    - ⚠️ **冲突类名**：PC 无 tailwind-merge，若保留 `bg-bg-sunken` 再加 `rounded-full` 不冲突（不同属性），但 PC 当前有 `bg-bg-sunken` 底色而 web **没有** → 必须删掉 `bg-bg-sunken`，否则是「灰底圆」，web 是「裸圆图标」
    - PC 最终：`"shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center"`
  - **hover**：`hover:bg-bg-elevated` → `hover:bg-bg-sunken`（web hover 是 sunken 底）
  - **图标尺寸**：`PlusGlyph` 的 `width="18" height="18"` → `width="20" height="20"`（web `w-5 h-5` = 20px）；`strokeWidth="1.8"` → `strokeWidth="2"`（跟 lucide 默认一致）
  - **aria-label**：PC 是 `aria-label="添加附件"` + `title="添加附件"`；web 是 `aria-label="附件"` → 统一改成 `aria-label="附件"`
  - 预估改动：**3 行**

## H-21　发送按钮形态

- **web**：`gacode-web/src/components/chat/ChatInputBar.tsx:145-158`
  ```tsx
  <button
    type="button"
    aria-label="发送"
    onClick={onSend}
    disabled={!canSend}
    className={cn(
      "shrink-0 w-9 h-9 rounded-full bg-brand text-brand-on",
      "hover:bg-brand-hover transition-colors duration-150",
      "inline-flex items-center justify-center",
      "disabled:opacity-50 disabled:cursor-not-allowed"
    )}
  >
    <ArrowUp className="w-4 h-4" />
  </button>
  ```
- **PC**：`gacode-electron/src/components/chat/ChatInputBar.tsx:638-646`
  ```tsx
  className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-md bg-brand text-brand-on hover:bg-brand-hover active:opacity-80 disabled:opacity-40 disabled:pointer-events-none transition-colors duration-150"
  ```
  图标：PC `SendIcon`（`:692-709`）是**纸飞机** `m22 2-7 20-4-9-9-4Z`；web 是 lucide `ArrowUp`（向上箭头）
- **判定**：形态不同（3 处：圆角 / 图标 / disabled 透明度）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\ChatInputBar.tsx`
  - 锚点：`ChatInputBar.tsx:643` 的 className 串 + `SendIcon`（`:692-709`）
  - **圆角**：`rounded-md` → `rounded-full`
    - ⚠️ 冲突处理：`rounded-md` 与 `rounded-full` 是同一属性（border-radius），PC 无 tailwind-merge，**必须删掉 `rounded-md` 而不是追加 `rounded-full`**
    - PC 最终：`"shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-full bg-brand text-brand-on hover:bg-brand-hover transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"`
  - **disabled 态**：PC `disabled:opacity-40 disabled:pointer-events-none` → web `disabled:opacity-50 disabled:cursor-not-allowed`（web 保留 pointer-events，禁用时显示 not-allowed 光标）
  - **active 态**：web 无 `active:`，PC 有 `active:opacity-80` → 删除
  - **图标**：web 是 lucide `ArrowUp`：
    ```tsx
    function ArrowUpGlyph() {
      return (
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m5 12 7-7 7 7" />
          <path d="M12 19V5" />
        </svg>
      );
    }
    ```
    （lucide `arrow-up` 的 path 就是这两条，PC `SendIcon` 换掉）
  - **aria-label**：PC `aria-label="发送消息"` → web `aria-label="发送"`
  - 预估改动：**~10 行**

## H-22　输入条底部 caption

- **web**：`gacode-web/src/components/chat/ChatInputBar.tsx:165-177`
  ```tsx
  {caption && (
    <p
      className={cn(
        "mt-2 text-xs text-center flex items-center justify-center gap-1.5",
        isStreaming ? "text-brand" : "text-fg-muted opacity-50"
      )}
    >
      {isStreaming && (
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand animate-pulse" aria-hidden="true" />
      )}
      <span>{caption}</span>
    </p>
  )}
  ```
  默认 caption（`ChatInputBar.tsx:54`）：`"AI 生成内容请核实重要信息"`
- **PC**：`PC 缺失` —— PC `ChatInputBar.tsx:502-649` 全文没有 caption 节点。
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\ChatInputBar.tsx`
  - 锚点：`ChatInputBar.tsx:648` 的 `</div>`（input row 结束）之后、`{dragActive ? ...}`（`:652`）之前
  - 插入：
    ```tsx
    {caption && (
      <p className={[
        "mt-2 text-xs text-center flex items-center justify-center gap-1.5",
        isStreaming ? "text-brand" : "text-fg-muted opacity-50",
      ].join(" ")}>
        {isStreaming ? (
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand animate-pulse" aria-hidden="true" />
        ) : null}
        <span>{caption}</span>
      </p>
    )}
    ```
  - **需新增 prop**：`caption?: string`（默认 `"AI 生成内容请核实重要信息"`），加到 `ChatInputBarProps`（`ChatInputBar.tsx:113-145`）
  - **PC 有 `animate-pulse` 吗**：Tailwind 默认 keyframes，PC `tailwind.config.ts:232-256` 覆盖了 `animation` 段但只列了 4 个自定义 keyframes → **Tailwind 的 `animate-pulse` 是内置 utilities，`extend.animation` 不会覆盖掉它**（extend 是合并），所以 `animate-pulse` 可用。
  - 预估改动：**~12 行**

## H-23　输入条 placeholder 文案

- **web**：`gacode-web/src/app/page.tsx:367`（Home 传参）+ `web/src/components/chat/ChatInputBar.tsx:51`（默认值）　`"说点什么…"`
- **PC**：`gacode-electron/src/components/chat/ChatInputBar.tsx:578-582`
  ```tsx
  placeholder={
    isStreaming
      ? "正在流式生成… 完成后再发下一条"
      : "说点什么… (Enter 发送, Shift+Enter 换行 · 输入 / 触发命令菜单)"
  }
  ```
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\ChatInputBar.tsx`
  - 锚点：`ChatInputBar.tsx:578-582`
  - 非流式态改成 `"说点什么…"`；流式态 web 是 `"说点什么…"`（web 的 placeholder prop 不随 isStreaming 变，ChatInputBar.tsx:111 是 `placeholder={placeholder}`，无流式分支）
  - **需新增 prop**：`placeholder?: string`（默认 `"说点什么…"`，加到 `ChatInputBarProps`）
  - 最终：
    ```tsx
    placeholder={placeholder}
    ```
    prop 默认值 `const placeholder = "说点什么…"`。
  - ⚠️ PC 的 slash 菜单提示文案（`输入 / 触发命令菜单`）会随本条一起消失 —— 但 PC Home 不传 `onSlashCommand`（`Home.tsx:306-315` 没传），`SlashMenu` 只在 `onSlashCommand` 存在时渲染（`ChatInputBar.tsx:586`），**Home 上没有 slash 菜单**，所以文案不适用，删掉是对的。
  - 预估改动：**2 行**

## H-24　Home 输入条禁用态（创建中）

- **web**：`gacode-web/src/app/page.tsx:368`　`disabled={createChatMutation.isPending}` → ChatInputBar 外层卡片 `opacity-60`（`ChatInputBar.tsx:89`）
- **PC**：`PC 缺失` —— PC Home 没传 `disabled`（ChatInputBar 也没这个 prop），创建中用户可重复点发送 → 触发多次 `createChat`。
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\ChatInputBar.tsx`（加 prop）+ `D:\gaga\gaclaw-project\gacode-electron\src\routes\Home.tsx`（传参）
  - **需新增 prop**：`disabled?: boolean`（默认 `false`），加到 `ChatInputBarProps`
  - ChatInputBar 内：textarea 加 `disabled={disabled}`；发送按钮 `disabled={!canSend || disabled}`；外层卡片 `disabled && !isStreaming && "opacity-60"`（跟 web `ChatInputBar.tsx:89` 对齐）
  - Home 侧：`Home.tsx:313` 附近加 `disabled={createMutation.isPending}`
  - 预估改动：**~8 行（ChatInputBar 6 + Home 2）**

## H-25　Home 的 `+` 点击未登录拦截

- **web**：`gacode-web/src/app/page.tsx:97-103`
  ```tsx
  const handlePlusClick = () => {
    if (!isAuthenticated) {
      setShowAuthDialog("input");
      return;
    }
    setSheetOpen(true);
  };
  ```
- **PC**：PC `Home.tsx:314`　`onPlusClick={() => setPlusOpen(true)}` —— 无未登录判断（PC 未登录进不来 Home，见 H-02）
- **判定**：缺失（依附于 H-02 的结构级差异）
- **怎么改**：随 S-01 一起处理。若 S-01 拍板「PC 不做未登录态」，本条**直接作废**（PC 无未登录用户）。
- 预估改动：**0 行（随 S-01）**

---

# §4 `+` 底部 Sheet（SheetActionMenu ↔ PlusSheet）

## H-26　Sheet 入口项数与网格列数

- **web**：`gacode-web/src/components/chat/SheetActionMenu.tsx:74-95` —— **4 项**，网格 4 列
  ```tsx
  className="rounded-t-2xl grid grid-cols-4 gap-3 py-5 px-4 border-x-0"
  ...
  <ActionButton icon={<ImageIcon className="w-6 h-6" />} label="图片" onClick={onPickImage} />
  <ActionButton icon={<FileText className="w-6 h-6" />} label="文件" onClick={onPickFile} />
  <ActionButton icon={<Smile className="w-6 h-6" />} label="表情" onClick={onPickEmoji} />
  <ActionButton icon={<Library className="w-6 h-6" />} label="挂载知识库" onClick={onPickLibrary} />
  ```
- **PC**：`gacode-electron/src/components/home/PlusSheet.tsx:71` —— **6 项**，网格 3 列
  ```tsx
  <div className="grid grid-cols-3 gap-y-5 gap-x-2 py-4">
  ```
  6 项：拍照 / 相册 / 文件 / 表情 / 挂载知识库 / 模板
- **判定**：形态不同（**PC 在 Sheet 顶层多了「拍照」和「模板」两项**）
- **怎么改**：
  - **「模板」是 PC 独有** → 按 gaga 指令不列差异，但**它会占掉 grid 位置**，影响 4 项布局。处置：保留 PC 的「模板」（不删），但把网格改成 4 列并把「拍照」降级到 MediaPicker 内（见 H-28 / S-03）。
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\PlusSheet.tsx`
  - 锚点：`PlusSheet.tsx:71` 的 `<div className="grid grid-cols-3 gap-y-5 gap-x-2 py-4">`
  - 网格 className → `"grid grid-cols-4 gap-3 py-5 px-4"`
    - `gap-y-5 gap-x-2` → `gap-3`（web 统一 gap-3 = 12px）
    - `py-4` → `py-5`（web 是 py-5 = 20px）
    - **PC 无 `px-4`** → web SheetContent 自带 `px-4`。但 PC 的内容在 `BottomSheet` 的 `p-5` 内层（`BottomSheet.tsx:49` `... shadow-dialog p-5 ...`），所以 padding 由 BottomSheet 统一给 → PC 网格**不要**再加 `px-4`（会双层 padding）
  - 「拍照」项处理：把 `PlusSheet.tsx:72-91` 的「拍照」`ActionBtn` **移出 Sheet**，改为在 MediaPicker 的 image 模式里提供「拍照/相册」双按钮（见 H-28）
    - 移出后 Sheet 剩 5 项（图片/文件/表情/挂载知识库/模板）→ 网格 4 列时第 5 项单独占第二行第一格（`grid-cols-4` 自然换行）。若要跟 web 严格 4 项，**「模板」也需移走** —— 但那是 PC 独有功能，按指令不动。
    - **实际处置建议**：网格保持 `grid-cols-4`，Sheet 保留 5 项（图片/文件/表情/挂载知识库/模板），「拍照」下沉到 MediaPicker。这样 Sheet 的**前 4 项顺序与 web 完全一致**（图片/文件/表情/挂载知识库），第 5 项是 PC 额外。
  - 预估改动：**~10 行（PlusSheet 删拍照项 20 行 + 改 grid 1 行 + Home 派发改 1 行）**

## H-27　Sheet 单项按钮形态

- **web**：`gacode-web/src/components/chat/SheetActionMenu.tsx:45-57`
  ```tsx
  <button
    type="button"
    onClick={onClick}
    className="flex flex-col items-center gap-2 text-fg-muted hover:text-fg transition-colors duration-150"
  >
    <div className="w-14 h-14 rounded-full bg-bg-sunken inline-flex items-center justify-center">
      {icon}
    </div>
    <span className="text-sm">{label}</span>
  </button>
  ```
- **PC**：`gacode-electron/src/components/home/PlusSheet.tsx:38-54`
  ```tsx
  <button
    type="button"
    onClick={onClick}
    className="flex flex-col items-center gap-2 text-fg-muted hover:text-fg transition-colors duration-150"
  >
    <span
      aria-hidden="true"
      className="w-14 h-14 rounded-full bg-bg-sunken inline-flex items-center justify-center"
    >
      {icon}
    </span>
    <span className="text-sm">{label}</span>
  </button>
  ```
- **判定**：**已一致**（唯一差别是 PC 圆圈用 `<span aria-hidden="true">`、web 用 `<div>`，语义等价，不改）
- 预估改动：**0 行**

## H-28　Sheet 图标尺寸与线宽

- **web**：`gacode-web/src/components/chat/SheetActionMenu.tsx:77-94`　lucide 图标全部 `className="w-6 h-6"`（24px，`stroke-width` 默认 2）
- **PC**：`gacode-electron/src/components/home/PlusSheet.tsx:76-198`　内联 SVG，`width="24" height="24"`，`strokeWidth="1.8"`
- **判定**：形态不同（线宽 1.8 vs 2；图标形状也各不同）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\PlusSheet.tsx`
  - 锚点：`PlusSheet.tsx:76-198` 每个 `ActionBtn` 的 `icon={...}` 里的 `<svg>` 标签
  - `strokeWidth="1.8"` → `strokeWidth="2"`（**6 处**，逐个改：相机 `:83`、图片 `:103`、文件 `:123`、表情 `:143`、知识库 `:163`、模板 `:183`）
  - 图标形状对齐 lucide：web 用 `Image`（图片）、`FileText`（文件）、`Smile`（表情）、`Library`（知识库）。PC 的内联 SVG 路径已经分别是这 4 个 lucide 图标的 path（对照 `web/src/components/common/MediaPicker.tsx:82-101` 的 ImageIcon / `:104-126` 的 FileText 可确认 PC 的 path 与 lucide 一致）→ **只改线宽即可**
  - PC 端 `Library` 图标（知识库，`:173-177`）跟 lucide `Library`（书本+箭头）不是同一个图标 —— web 的 `Library` lucide 是「书本 + 左上箭头」。**这一项留到 H-31 一并处理**
  - 预估改动：**6 行**

## H-29　Sheet 容器形态

- **web**：`gacode-web/src/components/chat/SheetActionMenu.tsx:70-75`
  ```tsx
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
      side="bottom"
      className="rounded-t-2xl grid grid-cols-4 gap-3 py-5 px-4 border-x-0"
    >
  ```
- **PC**：`gacode-electron/src/components/home/PlusSheet.tsx:70`
  ```tsx
  <BottomSheet open={open} title="添加附件" onClose={onClose}>
  ```
  → `BottomSheet.tsx:49`：`"relative w-full max-w-2xl rounded-t-md bg-bg-elevated shadow-dialog p-5 max-h-[80vh] flex flex-col"`
- **判定**：形态不同（4 处：圆角 / 最大宽 / 有无标题栏 / padding 归属）
- **怎么改**：
  - **圆角**：`rounded-t-md`（16px）→ `rounded-t-2xl`（24px，web `rounded-t-2xl`）
    - ⚠️ 冲突类名：`rounded-t-md` 与 `rounded-t-2xl` 同属性，**必须替换不能追加**
    - 但 `BottomSheet` 是**公共组件**（`src/components/ui/BottomSheet.tsx`），被 PlusSheet / MediaPicker / EmojiPicker / LibraryPicker / ChatDetail 多处复用 → **不能在 BottomSheet 里直接改**，否则波及 chat 域
    - **方案**：给 `BottomSheet` 加 `contentClassName?: string` prop，默认 `""`；BottomSheet 内把 `className` 改为 `[...].join(" ")` 并追加自定义类
      ```tsx
      export interface BottomSheetProps {
        open: boolean;
        title: string;
        onClose: () => void;
        children: ReactNode;
        footer?: ReactNode;
        /** 新增: 内容区容器额外 className (用于覆盖圆角/宽度等) */
        contentClassName?: string;
      }
      ```
      渲染处（`BottomSheet.tsx:49`）：
      ```tsx
      <div className={[
        "relative w-full max-w-2xl rounded-t-md bg-bg-elevated shadow-dialog p-5 max-h-[80vh] flex flex-col",
        contentClassName ?? "",
      ].join(" ")}>
      ```
      ⚠️ 无 tailwind-merge → **冲突类名靠 CSS 源码顺序决胜，不可靠**。稳妥做法：`contentClassName` 传 `!rounded-t-2xl`（Tailwind `!` 重要修饰符，PC `tailwind.config.ts` 未禁用 `important` → 可用）
  - **最大宽**：`max-w-2xl`（640px）→ web 是**全宽**（web 的 `SheetContent` 无 `max-w-*`）。→ `contentClassName="!rounded-t-2xl !max-w-none w-full"`。
    - ⚠️ 但 PC 是桌面端，全宽 Sheet 视觉会很怪 —— **web 的 Sheet 是移动端形态**。这条列入「视觉存疑」，建议 gaga 看一眼再定。PC 的 `max-w-2xl` + 居中（`BottomSheet.tsx:42` `flex items-end justify-center`）在桌面端是合理的。
  - **标题栏**：web 的 `SheetActionMenu` **没有标题**（`SheetContent` 直接是网格）；PC 的 `BottomSheet` 强制渲染标题栏（`BottomSheet.tsx:50-55`）
    - **方案**：给 `BottomSheet` 加 `title?: string` 改为可选（**默认值保持必填以免破坏其他调用方**）→ 改成 `title?: string`，当 `title` 为 `undefined` 时不渲染标题栏
    - PlusSheet 传 `title={undefined}` → 不显示「添加附件」标题
    - ⚠️ 其他调用方（MediaPicker / EmojiPicker / LibraryPicker / ChatDetail）都传了 title → 不受影响
  - **padding 归属**：web 的 `SheetContent` 自己带 `px-4 py-5`；PC 的 `BottomSheet` 给 `p-5`。→ PlusSheet 的网格**不要**再写 `px-4`，只写 `py-5`（配合 BottomSheet 的 p-5 会变成 40px 上下 padding，偏大）
    - 实际处置：网格 className 用 `"grid grid-cols-4 gap-3"`，padding 交给 BottomSheet 的 `p-5`
  - 预估改动：**~18 行（BottomSheet 改 8 + PlusSheet 改 4 + 其他调用方排查 6）**

## H-30　Sheet 打开 / 关闭时序

- **web**：`gacode-web/src/app/page.tsx:375-388`
  ```tsx
  <SheetActionMenu
    open={sheetOpen}
    onOpenChange={setSheetOpen}
    onPickImage={() => openPicker("image")}
    onPickFile={() => openPicker("file")}
    onPickEmoji={() => {
      setSheetOpen(false);
      setTimeout(() => setEmojiOpen(true), 100);
    }}
    onPickLibrary={() => {
      setSheetOpen(false);
      setTimeout(() => setLibraryOpen(true), 100);
    }}
  />
  ```
  + `openPicker`（`:105-115`）：`setSheetOpen(false); setTimeout(() => setPickerOpen(true), 100);`
- **PC**：`gacode-electron/src/routes/Home.tsx:169-191`
  ```tsx
  const handlePlusPick = useCallback((action: PlusAction) => {
    switch (action) {
      case "camera": setMediaKind("camera"); setTimeout(() => setMediaOpen(true), 80); break;
      case "gallery": setMediaKind("gallery"); setTimeout(() => setMediaOpen(true), 80); break;
      case "file": setMediaKind("file"); setTimeout(() => setMediaOpen(true), 80); break;
      case "emoji": setTimeout(() => setEmojiOpen(true), 80); break;
      case "library": setTimeout(() => setLibraryOpen(true), 80); break;
    }
  }, []);
  ```
  + `PlusSheet.tsx:59-67` `handlePick` 先 `onClose()` 再 `onPick(action)`
- **判定**：形态不同（2 处：延时时长 / 表情与知识库是否显式关 Sheet）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Home.tsx`
  - 锚点：`Home.tsx:169-191` 的 `handlePlusPick`
  - **延时**：web 是 `100`，PC 是 `80` → 统一改成 `100`（**5 处**：`setTimeout(() => setMediaOpen(true), 80)` × 3 → 100；`setEmojiOpen` 1 处；`setLibraryOpen` 1 处）
  - **表情 / 知识库**：web 显式 `setSheetOpen(false)` 再延时打开；PC 靠 `PlusSheet.handlePick` 里的 `onClose()`（`PlusSheet.tsx:60`）间接关闭 —— **PC 已等价**，本项只需统一时长
  - 预估改动：**5 行**

## H-31　Sheet 「挂载知识库」图标形状

- **web**：`gacode-web/src/components/chat/SheetActionMenu.tsx:92`　`<Library className="w-6 h-6" />` = lucide `Library`（书本 + 左上箭头）
- **PC**：`gacode-electron/src/components/home/PlusSheet.tsx:172-178`
  ```tsx
  <path d="m21 16-4 4-4-4" />
  <path d="M17 20V4" />
  <path d="m3 8 4-4 4 4" />
  <path d="M7 4v16" />
  ```
  → 这是 lucide `ArrowUpDown`（上下箭头），**不是** `Library`
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\PlusSheet.tsx`
  - 锚点：`PlusSheet.tsx:172-178` 的 4 条 `<path>`
  - 换成 lucide `Library` 的 path（lucide `library` = 书本形，路径为 `m16 6 4 14` / `M12 6v14` / `M8 8v12` / `M4 6v16` 组合）：
    ```tsx
    <path d="m16 6 4 14" />
    <path d="M12 6v14" />
    <path d="M8 8v12" />
    <path d="M4 6v16" />
    ```
  - ⚠️ **需先在 web 侧核对 lucide `Library` 的真实 path**：`node_modules/lucide-react/dist/esm/icons/library.js`。本清单未能读取 node_modules（未在仓内找到该文件），标 **待核**；若不可核，直接用上面的近似值即可（视觉上都是「书脊」造型）。
  - 预估改动：**4 行**

---

# §5 MediaPicker

## H-32　MediaPicker image 模式按钮数

- **web**：`gacode-web/src/components/common/MediaPicker.tsx:217-239` —— **两个按钮**（拍照 / 相册）
  ```tsx
  <div className="flex gap-4">
    <button
      type="button"
      onClick={triggerCamera}
      className="flex flex-col items-center justify-center gap-2 w-24 h-24 rounded-full bg-white/10 hover:bg-white/20 transition-colors duration-150"
    >
      <Camera />
      <span className="text-white text-sm">拍照</span>
    </button>
    <button
      type="button"
      onClick={triggerGallery}
      className="flex flex-col items-center justify-center gap-2 w-24 h-24 rounded-full bg-white/10 hover:bg-white/20 transition-colors duration-150"
    >
      <ImageIcon />
      <span className="text-white text-sm">相册</span>
    </button>
  </div>
  ```
- **PC**：`gacode-electron/src/components/home/MediaPicker.tsx:71-91` —— **一个按钮**
  ```tsx
  <button
    type="button"
    onClick={() => inputRef.current?.click()}
    className="w-40 h-24 rounded-md bg-bg-sunken hover:bg-bg-base text-fg inline-flex items-center justify-center gap-2 transition-colors duration-150"
  >
    ...<svg 相机 icon/>
    <span className="text-sm">打开{meta.title}</span>
  </button>
  ```
- **判定**：形态不同（**功能层差异：PC 的「拍照」入口在 Sheet 顶层，「相册」在 MediaPicker 内，image 模式内无法直接选「拍照」**）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\MediaPicker.tsx`
  - 锚点：`MediaPicker.tsx:70` 的 `<div className="flex flex-col items-center gap-3 py-4">` 内、`MediaPicker.tsx:71` 的 button 之前
  - PC 的 MediaPicker 需要**两个 hidden input**（跟 web 一致）：
    ```tsx
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const cameraFileInputRef = useRef<HTMLInputElement | null>(null);
    ```
    - 相册/文件 input：`<input ref={fileInputRef} type="file" hidden accept={accept} onChange={handleFileSelect} />`
    - 拍照 input（仅 image 模式）：`<input ref={cameraFileInputRef} type="file" hidden accept="image/*" capture="environment" onChange={handleFileSelect} />`
  - image 模式渲染：
    ```tsx
    <div className="flex gap-4">
      <button
        type="button"
        onClick={() => cameraFileInputRef.current?.click()}
        className="flex flex-col items-center justify-center gap-2 w-24 h-24 rounded-full bg-white/10 hover:bg-white/20 transition-colors duration-150"
      >
        <CameraGlyph />
        <span className="text-white text-sm">拍照</span>
      </button>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex flex-col items-center justify-center gap-2 w-24 h-24 rounded-full bg-white/10 hover:bg-white/20 transition-colors duration-150"
      >
        <ImageGlyph />
        <span className="text-white text-sm">相册</span>
      </button>
    </div>
    ```
  - file 模式保持单按钮（web `MediaPicker.tsx:207-216`）：
    ```tsx
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      className="flex flex-col items-center justify-center gap-2 w-40 h-24 rounded-2xl bg-white/10 hover:bg-white/20 transition-colors duration-150"
    >
      <FileTextGlyph />
      <span className="text-white text-sm">选择文件</span>
    </button>
    ```
  - ⚠️ **冲突类名**：web 用 `rounded-full`（image 模式）/ `rounded-2xl`（file 模式）。PC 的 `BottomSheet` 容器是 `rounded-t-md`，内部按钮圆角不受影响 → 可直接写。
  - 预估改动：**~40 行（MediaPicker 重写 image/file 分支 + 双 input + 两个图标函数）**

## H-33　MediaPicker 视觉基调（黑底白字）

- **web**：`gacode-web/src/components/common/MediaPicker.tsx:198-201`
  ```tsx
  <SheetContent
    side="bottom"
    className="bg-black border-t-0 text-white flex flex-col gap-0 p-0 max-h-[85vh]"
  >
  ```
  → **纯黑底（`bg-black`）+ 白字（`text-white`）**，圆角被去掉（`border-t-0`）
- **PC**：`gacode-electron/src/components/home/MediaPicker.tsx:69` → `BottomSheet` 的 `bg-bg-elevated`（#181818 灰黑）+ 默认字色 `text-fg`
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\MediaPicker.tsx`
  - 锚点：`MediaPicker.tsx:69` 的 `<BottomSheet open={open} title={meta.title} onClose={onClose}>`
  - 用 `contentClassName`（H-29 新增 prop）覆盖：`contentClassName="!bg-black !rounded-none !max-h-[85vh] !p-0 text-white"`
    - ⚠️ `bg-black` vs `bg-bg-elevated` 同属性 → 必须用 `!bg-black` 强制
    - `rounded-t-md` → `!rounded-none`
    - `p-5` → `!p-0`
    - `max-h-[80vh]` → `!max-h-[85vh]`
  - **标题栏**：web 的 MediaPicker **没有标题栏**（`SheetContent` 直接是内容）→ 传 `title={undefined}`（H-29 新增的可选 title）
  - **PC 现有 `meta.title`（「拍照」/「选择图片」/「选择文件」）作为 sheet 标题** → 移除，标题文案改由内部 `<h3>` 承担（见 H-34）
  - 预估改动：**~4 行**

## H-34　MediaPicker 标题

- **web**：`gacode-web/src/components/common/MediaPicker.tsx:203-205`
  ```tsx
  <h3 className="text-white text-base font-medium mb-2">
    {modeProp === "file" ? "选择文件" : "选择图片来源"}
  </h3>
  ```
- **PC**：`gacode-electron/src/components/home/MediaPicker.tsx:39-52` 的 `META` 表 → `title: "拍照" / "选择图片" / "选择文件"`，作为 `BottomSheet` 的 title
- **判定**：形态不同（3 处：位置 / 文案 / 样式）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\MediaPicker.tsx`
  - 锚点：`MediaPicker.tsx:70` 的内容区第一行（在 `<div className="flex flex-col items-center gap-3 py-4">` 内）
  - 插入：
    ```tsx
    <h3 className="text-white text-base font-medium mb-2">
      {kind === "file" ? "选择文件" : "选择图片来源"}
    </h3>
    ```
  - web 的外层容器：`"flex flex-col items-center gap-4 py-8 px-4"`（`MediaPicker.tsx:202`）→ PC 现有的 `flex flex-col items-center gap-3 py-4` 改成 `flex flex-col items-center gap-4 py-8 px-4`
  - PC `META.hint`（「调用系统相机拍照后插入图片附件」等）→ **web 没有这个 hint 文本**。PC 独有的说明文案：按 gaga 指令不列差异，但它会占垂直空间。**对齐建议**：删掉 hint `<p>`（`MediaPicker.tsx:92`），因为 web 的 image 模式布局是「标题 + 两个大圆按钮 + 取消」，PC 的 hint 会插在中间破坏对齐。
    - ⚠️ 这属于「PC 有 web 没有」的文案，按指令不在差异清单 —— 但它**影响 1:1 还原的像素对齐**，所以在实现规格里标注处置方式（删除）。
  - 预估改动：**~5 行**

## H-35　MediaPicker 「取消」按钮

- **web**：`gacode-web/src/components/common/MediaPicker.tsx:241-247`
  ```tsx
  <button
    type="button"
    onClick={() => onOpenChange(false)}
    className="text-white/60 hover:text-white/80 text-sm mt-4 transition-colors"
  >
    取消
  </button>
  ```
- **PC**：`PC 缺失` —— PC MediaPicker 只有 `BottomSheet` 右上角的 `×`（`BottomSheet.tsx:52-54`），**没有底部「取消」文字按钮**
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\MediaPicker.tsx`
  - 锚点：image/file 按钮块之后、`</div>`（内容区结束）之前
  - 插入：
    ```tsx
    <button
      type="button"
      onClick={onClose}
      className="text-white/60 hover:text-white/80 text-sm mt-4 transition-colors"
    >
      取消
    </button>
    ```
  - 预估改动：**7 行**

## H-36　MediaPicker file 模式的 accept 白名单

- **web**：`gacode-web/src/app/page.tsx:110`（Home 传给 MediaPicker 的 accept）
  ```tsx
  setPickerAccept(".pdf,.doc,.docx,.txt,.md,.zip,.json,.png,.jpg,.jpeg,.gif,.webp");
  ```
  + `web/src/components/common/MediaPicker.tsx:254`
  ```tsx
  accept={modeProp === "file" ? (accept || FILE_ACCEPT) : accept}
  ```
  → **web 实际生效的 file accept = Home 传的这串**（因为 `accept || FILE_ACCEPT` 里 `accept` 非空，组件内置的 `FILE_ACCEPT` 被绕过）：
  `.pdf,.doc,.docx,.txt,.md,.zip,.json,.png,.jpg,.jpeg,.gif,.webp`
- **PC**：`gacode-electron/src/components/home/MediaPicker.tsx:32`
  ```tsx
  const FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv";
  ```
  + `MediaPicker.tsx:63`：`const accept = kind === "file" ? FILE_ACCEPT : "image/*";`
- **判定**：形态不同（**白名单不同**：PC 有 `.xls/.xlsx/.csv` 而 web 没有；web 有 `.md/.zip/.json/.png/.jpg/.jpeg/.gif/.webp` 而 PC 没有）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\MediaPicker.tsx`
  - 锚点：`MediaPicker.tsx:32` 的 `const FILE_ACCEPT = ...`
  - 改成跟 web Home 实际生效值一致：
    ```tsx
    const FILE_ACCEPT = ".pdf,.doc,.docx,.txt,.md,.zip,.json,.png,.jpg,.jpeg,.gif,.webp";
    ```
  - ⚠️ **注意**：`web/src/components/common/MediaPicker.tsx:45` 的组件级 `FILE_ACCEPT`（`.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv`）在 web 里**被 Home 传参架空**。要对齐的是 **Home 实际生效的那串**，所以 PC 改成 Home 的值。
  - ⚠️ **后端白名单**：PC `lib/upload.ts` 的 document 模式走 `/yinian/documents`，后端有 mime 白名单（PC `MediaPicker.tsx:12` 注释说「走 server mime 白名单 (跟 web MediaPicker 的 FILE_ACCEPT 对齐)」）。**放宽前端 accept 到含 `.md/.zip/.json` 后，后端是否接受需核**——`.zip` / `.json` 大概率被后端拒。**标「待核」**：需查 unified-api 的 document mime 白名单。
    - 保守方案：只补 web 有且后端也支持的（`.md`），`.zip/.json/.png/.jpg/...` 属于「图片但走 file 模式」的怪组合。
    - **建议**：PC 用 `.pdf,.doc,.docx,.txt,.md,.zip,.json,.png,.jpg,.jpeg,.gif,.webp`（1:1 还原），后端拒绝时由 `uploadAttachment` 的 `humanizeUploadError` 弹人话错误（PC 已有此机制，`Home.tsx:246-250`）
  - 预估改动：**1 行**

## H-37　MediaPicker image 模式 accept

- **web**：`gacode-web/src/app/page.tsx:107`　`setPickerAccept("image/*")` + `MediaPicker.tsx:264`　`accept="image/*"`
- **PC**：`gacode-electron/src/components/home/MediaPicker.tsx:63`　`kind === "file" ? FILE_ACCEPT : "image/*"`
- **判定**：**已一致**
- 预估改动：**0 行**

## H-38　MediaPicker 关闭时清 input value

- **web**：`web/src/components/common/MediaPicker.tsx:171-176`
  ```tsx
  useEffect(() => {
    if (!open) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraFileInputRef.current) cameraFileInputRef.current.value = "";
    }
  }, [open]);
  ```
- **PC**：`gacode-electron/src/components/home/MediaPicker.tsx:58-60`
  ```tsx
  useEffect(() => {
    if (!open && inputRef.current) inputRef.current.value = "";
  }, [open]);
  ```
- **判定**：形态不同（PC 只有 1 个 input，web 有 2 个）→ 随 H-32 的双 input 改造一并补齐
- **怎么改**：见 H-32。改造后：
  ```tsx
  useEffect(() => {
    if (!open) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraFileInputRef.current) cameraFileInputRef.current.value = "";
    }
  }, [open]);
  ```
- 预估改动：**3 行**

## H-39　MediaPicker `onCapture` 后关闭面板

- **web**：`web/src/components/common/MediaPicker.tsx:178-186`
  ```tsx
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      onCapture(f);
      onOpenChange(false);
    }
    e.target.value = "";
  };
  ```
- **PC**：`gacode-electron/src/components/home/MediaPicker.tsx:101-107`
  ```tsx
  onChange={(e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    onCapture(f);
    onClose();
  }}
  ```
- **判定**：**已一致**（顺序略有差别：web 先 `onCapture` 后 `onOpenChange(false)` 再清 value；PC 先清 value 再 `onCapture` 再 `onClose`；最终态相同）
- 预估改动：**0 行**

## H-40　PC MediaPicker 的 `kind` 与 web 的 `mode` 映射

- **web**：`gacode-web/src/app/page.tsx:416`　`mode={pickerKind === "file" ? "file" : "image"}`，`pickerKind` 只有 `"image" | "file"` 两态
- **PC**：`gacode-electron/src/routes/Home.tsx:328`　`kind={mediaKind}`，`mediaKind` 是 `"camera" | "gallery" | "file"` 三态
- **判定**：形态不同（PC 多一个 camera 态）
- **怎么改**：
  - 随 H-26（拍照下沉到 MediaPicker）改造后，PC 的 `MediaKind` 应改为 `"image" | "file"` 两态，与 web 对齐：
    ```tsx
    export type MediaKind = "image" | "file";
    ```
  - `MediaPicker.tsx:39-52` 的 `META` 表改为两态，`image` 态内部再分「拍照/相册」双按钮
  - `Home.tsx:77-79` 的 `pickUploadMode(kind)` 改为：`kind === "file" ? "document" : "image"`
  - `Home.tsx:89` 的 `useState<MediaKind>("gallery")` → `useState<MediaKind>("image")`
  - `Home.tsx:169-191` 的 `handlePlusPick`：`camera` / `gallery` 两个 case 合并为一个 `case "image"`；`file` 不变
  - `PlusSheet.tsx:17-23` 的 `PlusAction` 类型：`"camera" | "gallery" | "file" | ...` → `"image" | "file" | "emoji" | "library" | "template"`
  - 预估改动：**~20 行（跨 4 文件）**

## H-41　PC 侧 50MB 上限拦截

- **web**：`web/src/hooks/useAttachmentUpload.ts:182-191` —— `uploadAttachment` 内部做 size 校验（web `lib/api.ts` 的 `uploadAttachment`），**web Home 不前置拦截**
- **PC**：`gacode-electron/src/routes/Home.tsx:226-232`
  ```tsx
  if (file.size > MAX_ATTACHMENT_BYTES) {
    toast({
      message: `文件超过 50MB 上限 (${Math.round(file.size / 1024 / 1024)}MB)`,
      variant: "danger",
    });
    return;
  }
  ```
  + `Home.tsx:70` `const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;` + 注释说明 `uploadAttachment` 的 size 校验是**同步 throw**，不在 promise 链里，必须前置拦截
- **判定**：**已一致**（PC 多了一步前置拦截，但最终行为等价：都拦 50MB、都弹错误提示）
- 预估改动：**0 行**

## H-42　上传失败 toast 文案

- **web**：`gacode-web/src/app/page.tsx:120-127`
  ```tsx
  onError: (err) => {
    toast({
      title: "上传失败",
      description: err,
      variant: "danger",
    });
  },
  ```
- **PC**：`gacode-electron/src/routes/Home.tsx:245-251`
  ```tsx
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "aborted" || msg.includes("aborted")) return;
  toast({ message: msg, variant: "danger" });
  ```
- **判定**：形态不同（web 有 `title: "上传失败"` + `description: err`；PC 只有一整条 message）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\Home.tsx`
  - 锚点：`Home.tsx:250` 的 `toast({ message: msg, variant: "danger" });`
  - PC toast API 无 title/description（`Toast.tsx:31`）→ 拼成单行：`toast({ message: \`上传失败: ${msg}\`, variant: "danger" });`
  - ⚠️ **冲突**：`Home.tsx:196-198` 的注释明确说「Home 不再二次加『上传失败: 』前缀, 直接 toast」，因为 PC 的 `uploadAttachment` 内部 `humanizeUploadError` **已经**产出「图片上传失败: file too large」这类人话。
    - → **不要加前缀**，否则变成「上传失败: 图片上传失败: ...」
    - → 本条的正解：**改 PC Toast 组件支持 title/description**（成本更高），或**接受现状**（PC 单行 message 已经含全部信息）
    - **结论**：本条判定为 **「形态不同，但 PC 现状可接受（信息等价）」**；若 gaga 要求 PC toast 也分两行展示，需改 `src/components/ui/Toast.tsx`（新增 `title?: string` prop + `description?: string`，渲染成两行）—— 属**全站 toast 组件改动**，会波及所有页面 → **列为结构级差异 S-05**。
  - 预估改动：**0 行（现状可接受）/ ~30 行（改 Toast 组件，S-04）**

---

# §6 EmojiPicker

> 对照：`gacode-web/src/components/chat/EmojiPicker.tsx` ↔ `gacode-electron/src/components/home/EmojiPicker.tsx`
> emoji 数据集（60 条）与 CATEGORIES（3 类）**两边逐字相同**，不列差异。

## H-43　EmojiPicker 容器

- **web**：`gacode-web/src/components/chat/EmojiPicker.tsx:131-134`
  ```tsx
  <SheetContent
    side="bottom"
    className="bg-bg-elevated flex flex-col gap-0 p-0 max-h-[70vh]"
  >
  ```
  → **无标题栏**
- **PC**：`gacode-electron/src/components/home/EmojiPicker.tsx:126`
  ```tsx
  <BottomSheet open={open} title="选择表情" onClose={handleClose}>
  ```
  → `BottomSheet.tsx:49` `max-h-[80vh] p-5`，且 `BottomSheet.tsx:50-55` 强制渲染标题栏
- **判定**：形态不同（3 处：最大高 / padding / 有无标题栏）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\EmojiPicker.tsx`
  - 锚点：`EmojiPicker.tsx:126`
  - 改法（复用 H-29 新增的 `contentClassName` / 可选 `title` 两个 prop）：
    ```tsx
    <BottomSheet
      open={open}
      title={undefined}
      contentClassName="!p-0 !max-h-[70vh]"
      onClose={handleClose}
    >
    ```
    - `!p-0` → 去掉 BottomSheet 的 `p-5`（web 是 `p-0`）
    - `!max-h-[70vh]` → 覆盖 `max-h-[80vh]`
    - `title={undefined}` → 不渲染标题栏（web 无标题）
    - `bg-bg-elevated` 两边一致，不用改
  - ⚠️ **标题栏的替代**：web 的 EmojiPicker **确实没有标题**（直接是搜索框 + 分类 + 网格）。若 PC 去掉标题栏后顶部会显得空，web 就是那样 → 照做。
  - 预估改动：**3 行**

## H-44　EmojiPicker 搜索框（图标 + 内边距）

- **web**：`gacode-web/src/components/chat/EmojiPicker.tsx:136-149`
  ```tsx
  <div className="px-4 pt-5 pb-3 border-b border-border">
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜索表情 (例如: 笑 / heart)"
        className={cn(
          "w-full pl-9 pr-3 py-2 rounded-md",
          "bg-bg-sunken text-fg placeholder:text-fg-subtle",
          "outline-none focus:ring-1 focus:ring-brand"
        )}
      />
    </div>
  ```
- **PC**：`gacode-electron/src/components/home/EmojiPicker.tsx:128-135`
  ```tsx
  <div className="px-1 pt-1 pb-3 border-b border-border space-y-2">
    <input
      type="text"
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder="搜索表情 (例如: 笑 / heart)"
      className="w-full rounded-md bg-bg-sunken text-fg placeholder:text-fg-subtle px-3 py-2 text-sm outline-none focus:border-brand focus:border"
    />
  ```
- **判定**：形态不同（5 处：Search 图标 / pl-9 / 容器 padding / focus 样式 / 字号）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\EmojiPicker.tsx`
  - 锚点：`EmojiPicker.tsx:128-135`
  - **Search 图标**：PC 需新增内联 SVG（PC 不引 lucide-react）：
    ```tsx
    function SearchGlyph() {
      return (
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      );
    }
    ```
    （lucide `search` = 圆 + 斜线）
  - **结构**：input 外面包一层 `<div className="relative">`（Search 图标要绝对定位）
  - **容器**：`"px-1 pt-1 pb-3 border-b border-border space-y-2"` → `"px-4 pt-5 pb-3 border-b border-border space-y-3"`
  - **input className**：`"w-full pl-9 pr-3 py-2 rounded-md bg-bg-sunken text-fg placeholder:text-fg-subtle outline-none focus:ring-1 focus:ring-brand"`
    - 删 `px-3` → `pl-9 pr-3`（`pl-9` 给图标留位 36px）
    - 删 `text-sm`（web 是默认 16px `text-base`）
    - `focus:border-brand focus:border` → `focus:ring-1 focus:ring-brand`
      - ⚠️ **冲突**：`focus:border` 与 `focus:border-brand` 是同属性，**替换不要追加**
      - `focus:ring-1` 需要 `ring` 的颜色变量 —— Tailwind 默认 `ring` 用 `rgb(59 130 246 / 0.5)`（蓝），但 `focus:ring-brand` 指定了 ring 颜色 → 走 `ring-brand` token（PC `tailwind.config.ts:39-41` 有 `brand.DEFAULT`）→ 生效
  - 预估改动：**~16 行**

## H-45　EmojiPicker 分类 tab 位置

- **web**：`gacode-web/src/components/chat/EmojiPicker.tsx:153-170`
  ```tsx
  {!search && (
    <div className="flex gap-2 mt-3">
      {CATEGORIES.map((c) => (
        <button
          key={c.key}
          type="button"
          onClick={() => setActiveCategory(c.key)}
          className={cn(
            "px-3 py-1 rounded-full text-xs transition-colors",
            activeCategory === c.key
              ? "bg-brand text-brand-on"
              : "bg-bg-sunken text-fg-muted hover:text-fg"
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  )}
  ```
- **PC**：`gacode-electron/src/components/home/EmojiPicker.tsx:136-157`
  ```tsx
  {!search && (
    <div className="flex gap-2">
      ...
      className={[
        "px-3 py-1 rounded-full text-xs transition-colors duration-150",
        active ? "bg-brand text-brand-on" : "bg-bg-sunken text-fg-muted hover:text-fg",
      ].join(" ")}
  ```
- **判定**：形态不同（1 处：分类 tab 容器少 `mt-3`；`duration-150` 为 PC 额外，不计）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\EmojiPicker.tsx`
  - 锚点：`EmojiPicker.tsx:137` 的 `<div className="flex gap-2">`
  - → `"flex gap-2 mt-3"`
  - 预估改动：**1 行**

## H-46　EmojiPicker 网格区横向内边距与滚动

- **web**：`gacode-web/src/components/chat/EmojiPicker.tsx:175`　`<div className="flex-1 overflow-y-auto px-4 py-3">`
- **PC**：`gacode-electron/src/components/home/EmojiPicker.tsx:161`　`<div className="py-3">` —— **无 `flex-1`、无 `overflow-y-auto`、无 `px-4`**
- **判定**：形态不同（3 处）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\EmojiPicker.tsx`
  - 锚点：`EmojiPicker.tsx:161`
  - → `"px-4 py-3"`（保留 BottomSheet 的外层滚动）
  - ⚠️ `flex-1 overflow-y-auto` **不要加**：PC `BottomSheet.tsx:56` 已有 `<div className="flex-1 min-h-0 overflow-y-auto">{children}</div>` → 加了会双层滚动条
  - ⚠️ **残留差异**：web 是「搜索框 + 分类 tab 固定，网格单独滚」；PC 的 BottomSheet 会让搜索框跟着一起滚。要彻底对齐需给 `BottomSheet` 加 `header?: ReactNode`（固定在滚动区外）→ 见 S-05
  - 预估改动：**2 行（简化版）/ ~20 行（彻底版，走 S-05）**

## H-47　EmojiPicker 选中后关闭面板

- **web**：`gacode-web/src/components/chat/EmojiPicker.tsx:186-189`
  ```tsx
  onClick={() => {
    onSelect(e.emoji);
    handleOpenChange(false);
  }}
  ```
- **PC**：`gacode-electron/src/components/home/EmojiPicker.tsx:172`　`onClick={() => onSelect(e.emoji)}` —— 组件自身不关；由 `Home.tsx:262-265` 的 `handleEmojiSelect` 调 `setEmojiOpen(false)`
- **判定**：**已一致**（关闭动作位置不同，最终行为相同）
- 预估改动：**0 行**

## H-48　EmojiPicker 空态

- **web**：`gacode-web/src/components/chat/EmojiPicker.tsx:176-180`　`<div className="text-center text-fg-muted py-8 text-sm">没有匹配的表情</div>`
- **PC**：`gacode-electron/src/components/home/EmojiPicker.tsx:162-166`　`<div className="text-center text-fg-muted py-8 text-sm">没有匹配的表情</div>`
- **判定**：**已一致**
- 预估改动：**0 行**

## H-49　EmojiPicker emoji 按钮

- **web**：`gacode-web/src/components/chat/EmojiPicker.tsx:190-196`
  ```tsx
  className={cn(
    "w-10 h-10 rounded-md text-2xl",
    "hover:bg-bg-sunken transition-colors",
    "inline-flex items-center justify-center"
  )}
  aria-label={e.keywords[0]}
  ```
- **PC**：`gacode-electron/src/components/home/EmojiPicker.tsx:174`　`"w-10 h-10 rounded-md text-2xl hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center"`
- **判定**：**已一致**（`duration-150` 为 PC 额外，不计）
- 预估改动：**0 行**

## H-50　EmojiPicker 关闭时清 search

- **web**：`gacode-web/src/components/chat/EmojiPicker.tsx:124-127`
  ```tsx
  const handleOpenChange = (next: boolean) => {
    if (!next) setSearch("");
    onOpenChange(next);
  };
  ```
- **PC**：`gacode-electron/src/components/home/EmojiPicker.tsx:120-123`
  ```tsx
  const handleClose = () => {
    setSearch("");
    onClose();
  };
  ```
- **判定**：**已一致**（PC 把清空绑在 `onClose`，web 绑在 `onOpenChange(false)`；web 的 Sheet 遮罩点击 / ESC 也会触发 `onOpenChange(false)` → 同样清空）
- 预估改动：**0 行**

---

# §7 LibraryPicker

> 对照：`gacode-web/src/components/chat/LibraryPicker.tsx` ↔ `gacode-electron/src/components/home/LibraryPicker.tsx`

## H-51　LibraryPicker 多选能力 —— 缺失（PC 单选）

- **web**：`gacode-web/src/components/chat/LibraryPicker.tsx:63-75`（props）+ `:121-149`（`toggleItem`）+ `:280-292`（checkbox）+ `:301-320`（完成按钮）
  ```tsx
  onConfirm?: (items: LibraryItem[]) => void;
  /** 旧单选回调 (向下兼容). 若同时传了 onConfirm, 这个不会被调用. */
  onSelect?: (item: LibraryItem) => void;
  ```
  ```tsx
  const toggleItem = (item: LibraryItem) => {
    if (onConfirm) {
      setPendingSelected((prev) => { ... });
      setPendingItems((prev) => { ... });
      return;
    }
    if (onSelect) {
      onSelect(item);
      handleOpenChange(false);
    }
  };
  ```
  ```tsx
  {onConfirm && (
    <div className="shrink-0 w-5 h-5 rounded border flex items-center justify-center"
      aria-hidden="true">
      {checked && <Check className="w-3.5 h-3.5" />}
    </div>
  )}
  ```
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:28-33`（props）—— **只有 `onSelect` 单选**
  ```tsx
  export interface LibraryPickerProps {
    open: boolean;
    onClose: () => void;
    onSelect: (item: LibraryItem) => void;
  }
  ```
  `LibraryPicker.tsx:144-150`：点 row 立即 `onSelect(item); handleClose();`
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\LibraryPicker.tsx`
  - **需新增 props**：
    ```tsx
    export interface LibraryPickerProps {
      open: boolean;
      onClose: () => void;
      /** 旧单选回调 (向下兼容). 若同时传了 onConfirm, 这个不会被调用. */
      onSelect?: (item: LibraryItem) => void;
      /** 多选模式 — 点「完成」时一次性回调本次选中的 items */
      onConfirm?: (items: LibraryItem[]) => void;
    }
    ```
  - **需新增 state**（`LibraryPicker.tsx` 组件内，`const [search, setSearch] = useState("")` 之后）：
    ```tsx
    /** 本次 session 累积的选中 id (不立即关 sheet, 完成按钮才关) */
    const [pendingSelected, setPendingSelected] = useState<Set<string>>(new Set());
    /** 关联已选 item 的轻量快照, 完成时回调出去 (父组件要拿 title 拼 marker) */
    const [pendingItems, setPendingItems] = useState<Map<string, LibraryItem>>(new Map());
    ```
  - **需新增 handler**：
    ```tsx
    /** 切换某项选中态 — 多选模式累积, 单选模式立即回调并关闭 */
    const toggleItem = (item: LibraryItem): void => {
      if (onConfirm) {
        setPendingSelected((prev) => {
          const next = new Set(prev);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          return next;
        });
        setPendingItems((prev) => {
          const next = new Map(prev);
          if (next.has(item.id)) next.delete(item.id);
          else next.set(item.id, item);
          return next;
        });
        return;
      }
      if (onSelect) {
        onSelect(item);
        handleClose();
      }
    };
    ```
  - **需新增 handler**：
    ```tsx
    /** 「完成」按钮 — 把本次选中的 items 一次性回调出去并关闭面板 */
    const handleConfirm = (): void => {
      if (!onConfirm) return;
      onConfirm(Array.from(pendingItems.values()));
      handleClose();
    };
    ```
  - **关闭时清空累积**（`handleClose` 改造）：
    ```tsx
    const handleClose = () => {
      setSearch("");
      setPendingSelected(new Set());
      setPendingItems(new Map());
      onClose();
    };
    ```
  - **需新增 effect**（打开时也清空累积，避免上次残留）：
    ```tsx
    useEffect(() => {
      if (open) {
        setPendingSelected(new Set());
        setPendingItems(new Map());
      }
    }, [open]);
    ```
    → **需新增 import**：`import { useMemo, useState, useEffect } from "react";`（PC 当前 `LibraryPicker.tsx:14` 是 `import { useMemo, useState } from "react";`）
  - **Home 侧传参**（`gacode-electron/src/routes/Home.tsx:336-340`）：
    ```tsx
    <LibraryPicker
      open={libraryOpen}
      onClose={() => setLibraryOpen(false)}
      onSelect={handleLibrarySelect}
    />
    ```
    → 改为多选：
    ```tsx
    <LibraryPicker
      open={libraryOpen}
      onClose={() => setLibraryOpen(false)}
      onConfirm={handleLibraryConfirm}
    />
    ```
  - **需新增 handler（Home）**：
    ```tsx
    /** 知识库多选确认 — 逐条注入 `@[library:id] title` marker 到 textarea */
    const handleLibraryConfirm = useCallback((items: LibraryItem[]) => {
      for (const item of items) {
        inputBarRef.current?.insertLibraryMarker?.(item.id, item.title);
      }
      setLibraryOpen(false);
    }, []);
    ```
    ⚠️ **分隔符**：web Home 的单选回调（`page.tsx:402-407`）带分隔符逻辑：
    ```tsx
    onSelect={(item: LibraryItem) =>
      setText((cur) => {
        const sep = cur && !cur.endsWith(" ") && !cur.endsWith("\n") ? " " : "";
        return `${cur}${sep}@[library:${item.id}] ${item.title}`;
      })
    }
    ```
    → PC 的 `insertText`（`ChatInputBar.tsx:479-495`）**没有分隔符逻辑**，直接插到光标处。
    - **建议**：在 `ChatInputBarHandle` 新增专用方法 `insertLibraryMarker?: (id: string, title: string) => void`，**不要**改 `insertText`（否则 emoji 也会多空格）：
      ```tsx
      // ChatInputBar.tsx useImperativeHandle 内
      insertLibraryMarker: (id, title) => {
        const ta = taRef.current;
        const marker = `@[library:${id}] ${title}`;
        if (!ta) { setText((prev) => prev + marker); return; }
        const start = ta.selectionStart ?? text.length;
        const end = ta.selectionEnd ?? text.length;
        const before = text.slice(0, start);
        const sep = before && !before.endsWith(" ") && !before.endsWith("\n") ? " " : "";
        const next = before + sep + marker + text.slice(end);
        setText(next);
        const caret = start + sep.length + marker.length;
        requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(caret, caret); });
      },
      ```
    - **需同步改 `ChatInputBarHandle` interface**（`ChatInputBar.tsx:106-111`）加这一行。
  - 预估改动：**~60 行（LibraryPicker 40 + ChatInputBar 12 + Home 8）**

## H-52　LibraryPicker 勾选框

- **web**：`gacode-web/src/components/chat/LibraryPicker.tsx:281-291`
  ```tsx
  <div
    className={cn(
      "shrink-0 w-5 h-5 rounded border flex items-center justify-center",
      checked ? "bg-brand border-brand text-brand-on" : "border-border bg-background"
    )}
    aria-hidden="true"
  >
    {checked && <Check className="w-3.5 h-3.5" />}
  </div>
  ```
- **PC**：`PC 缺失`（无 checkbox 渲染）
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\LibraryPicker.tsx`
  - 锚点：`LibraryPicker.tsx:174` 的 `</div>`（`flex-1 min-w-0` 那层结束）之后、`</button>`（`:175`）之前
  - 插入：
    ```tsx
    {onConfirm ? (
      <div className={[
        "shrink-0 w-5 h-5 rounded border flex items-center justify-center",
        checked ? "bg-brand border-brand text-brand-on" : "border-border bg-background",
      ].join(" ")}
        aria-hidden="true"
      >
        {checked ? <CheckGlyph /> : null}
      </div>
    ) : null}
    ```
  - **需新增 state**：`const checked = pendingSelected.has(item.id);`（在 `.map((item) => {` 内）
  - **需新增图标函数**（PC 不引 lucide-react）：
    ```tsx
    function CheckGlyph() {
      return (
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    }
    ```
    （lucide `check` = `M20 6 9 17l-5-5`）
  - 预估改动：**~18 行**

## H-53　LibraryPicker 底部「完成」按钮

- **web**：`gacode-web/src/components/chat/LibraryPicker.tsx:300-320`
  ```tsx
  {onConfirm && (
    <div className="px-4 py-3 border-t border-border bg-bg-elevated">
      <button
        type="button"
        onClick={handleConfirm}
        data-testid="library-picker-confirm"
        disabled={pendingSelected.size === 0}
        className={cn(
          "w-full inline-flex items-center justify-center gap-2",
          "rounded-md py-2.5 text-sm font-medium transition-colors",
          "focus:outline-none focus:ring-1 focus:ring-brand",
          pendingSelected.size === 0
            ? "bg-bg-sunken text-fg-subtle cursor-not-allowed"
            : "bg-brand text-brand-on hover:bg-brand/90"
        )}
      >
        完成 ({pendingSelected.size})
      </button>
    </div>
  )}
  ```
- **PC**：`PC 缺失`
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\LibraryPicker.tsx`
  - 锚点：列表区 `</div>`（`LibraryPicker.tsx:180`）之后、`</BottomSheet>`（`:181`）之前
  - **PC 的 `BottomSheet` 有 `footer?: ReactNode` prop**（`BottomSheet.tsx:26`）→ **直接用 footer**，底部按钮固定在滚动区外：
    ```tsx
    <BottomSheet
      open={open}
      title="选择知识库"
      subtitle={onConfirm ? "可多选, 点完成提交" : "选中后将插入到消息"}
      onClose={handleClose}
      footer={
        onConfirm ? (
          <button
            type="button"
            onClick={handleConfirm}
            data-testid="library-picker-confirm"
            disabled={pendingSelected.size === 0}
            className={[
              "w-full inline-flex items-center justify-center gap-2",
              "rounded-md py-2.5 text-sm font-medium transition-colors",
              "focus:outline-none focus:ring-1 focus:ring-brand",
              pendingSelected.size === 0
                ? "bg-bg-sunken text-fg-subtle cursor-not-allowed"
                : "bg-brand text-brand-on hover:bg-brand/90",
            ].join(" ")}
          >
            完成 ({pendingSelected.size})
          </button>
        ) : null
      }
    >
    ```
    ⚠️ **BottomSheet 的 footer 容器样式**（`BottomSheet.tsx:58`）是 `"flex items-center justify-end gap-2 mt-3 shrink-0"` —— 按钮自己 `w-full` 会撑满，`justify-end` 不冲突
    - ⚠️ web 的 footer 条有 `border-t border-border bg-bg-elevated` 的分隔线，PC 没有 → 需给 `BottomSheet` 的 footer 容器加 `border-t border-border pt-3`（在 `BottomSheet.tsx:58` 改成 `"flex items-center justify-end gap-2 mt-3 pt-3 border-t border-border shrink-0"`）
    - ⚠️ `mt-3` + `pt-3` 会让间距偏大 → 用 `mt-0 pt-3` 或把 `mt-3` 去掉
  - 预估改动：**~25 行（含 BottomSheet footer 容器 2 行）**

## H-54　LibraryPicker 标题栏与副标题

- **web**：`gacode-web/src/components/chat/LibraryPicker.tsx:165-173`
  ```tsx
  <div className="px-4 pt-5 pb-3 border-b border-border space-y-3">
    <div className="flex items-center justify-between">
      <h3 className="text-base font-medium">选择知识库</h3>
      <span className="text-xs text-fg-muted">
        {onConfirm ? "可多选, 点完成提交" : "选中后将插入到消息"}
      </span>
    </div>
  ```
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:91`　`<BottomSheet open={open} title="挂载知识库" onClose={handleClose}>` —— 标题在 BottomSheet 标题栏里，**无副标题**
- **判定**：形态不同（3 处：标题文案 / 副标题 / 副标题文案随模式变）
- **怎么改**：
  - **标题文案**：web 是「选择知识库」，PC 是「挂载知识库」→ 统一成 web 的「选择知识库」
  - **副标题**：PC 缺
    - **推荐改法**：给 `BottomSheet` 加 `subtitle?: string` prop，渲染在标题下方一行
      ```tsx
      // BottomSheet.tsx — title 行之后
      {subtitle ? (
        <p className="text-xs text-fg-muted mb-3 shrink-0 -mt-2">{subtitle}</p>
      ) : null}
      ```
      LibraryPicker 传 `subtitle={onConfirm ? "可多选, 点完成提交" : "选中后将插入到消息"}`
  - **头部容器 padding**：`"px-1 pt-1 pb-3 border-b border-border space-y-2"` → `"pt-5 pb-3 border-b border-border space-y-3"`
    - ⚠️ BottomSheet 内容区已有 `p-5`（`BottomSheet.tsx:49`）→ **横向 padding 由 BottomSheet 承担，PC 头部容器不要再写 `px-4`**（否则 20+16=36px 过宽）
  - 预估改动：**~12 行（含 BottomSheet subtitle 4 行）**

## H-55　LibraryPicker 列表项形态

- **web**：`gacode-web/src/components/chat/LibraryPicker.tsx:250-254`
  ```tsx
  className={cn(
    "w-full flex items-center gap-3 p-3 rounded-lg",
    "border bg-bg-sunken hover:bg-bg-base transition-colors text-left",
    checked ? "border-brand bg-brand/5" : "border-border"
  )}
  ```
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:150`
  ```tsx
  className="w-full flex items-center gap-3 p-3 rounded-md bg-bg-sunken hover:bg-bg-base border border-border transition-colors duration-150 text-left"
  ```
- **判定**：形态不同（3 处：圆角 `rounded-lg` vs `rounded-md` / 选中态 `border-brand bg-brand/5` / duration）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\LibraryPicker.tsx`
  - 锚点：`LibraryPicker.tsx:150`
  - **圆角**：`rounded-md`（16px）→ `rounded-lg`（20px，PC `tailwind.config.ts:142` 有 `lg: "20px"`）
    - ⚠️ `rounded-md` 与 `rounded-lg` 同属性 → **替换**
  - **选中态**：PC 当前是写死字符串 → 改条件 className：
    ```tsx
    className={[
      "w-full flex items-center gap-3 p-3 rounded-lg",
      "border bg-bg-sunken hover:bg-bg-base transition-colors text-left",
      checked ? "!border-brand bg-brand/5" : "border-border",
    ].join(" ")}
    ```
    ⚠️ `border-border` 与 `border-brand` 同属性 → **必须用 `!border-brand` 强制**，不能靠数组顺序
  - 预估改动：**~8 行**

## H-56　LibraryPicker 类型图标颜色

- **web**：`gacode-web/src/components/chat/LibraryPicker.tsx:45-61`
  ```tsx
  function typeIcon(type: LibraryItem["type"]) {
    switch (type) {
      case "image":  return <ImageIcon className="w-5 h-5 text-brand-cyan" />;
      case "doc":    return <FileText className="w-5 h-5 text-brand" />;
      case "link":   return <LinkIcon className="w-5 h-5 text-cron" />;
      default:       return <LibraryIcon className="w-5 h-5 text-fg-muted" />;
    }
  }
  ```
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:186-261`（`TypeIcon`）—— **所有图标都是 `stroke="currentColor"`，靠父级 `text-fg-muted`（`:152`）着色，没有类型色**
- **判定**：形态不同
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\LibraryPicker.tsx`
  - 锚点：`LibraryPicker.tsx:186-261` 的 `TypeIcon` 函数 + 调用处 `:152`
  - **颜色 token 核验**：
    - `text-brand-cyan`：PC `tailwind.config.ts:45` 有 `brand.cyan = "#0dcaf0"` → ✅ 存在
    - `text-brand`：PC `tailwind.config.ts:39-41` `brand.DEFAULT` → ✅ 存在
    - `text-cron`：**PC 仓没有 `cron` token**（`tailwind.config.ts:37-107` 只有 brand / bg / fg / border / success / warning / danger / shadcn 兼容段）→ ❌ 缺失
    - `text-fg-muted`：✅ 存在
  - **改法**：PC 的 `TypeIcon` 已经是内联 SVG（`LibraryPicker.tsx:186-261`），只需给每个 case 的 `<svg>` 加 className：
    - `image` → `className="w-5 h-5 text-brand-cyan"`
    - `doc` → `className="w-5 h-5 text-brand"`
    - `link` → `className="w-5 h-5 text-brand-cyan"`（**替代 web 的 `text-cron`**）
      - 或给 PC `tailwind.config.ts` 加 `cron: "#a78bfa"`（跟 web 对齐）→ **推荐加 token**，1 行改动
    - `default` → `className="w-5 h-5 text-fg-muted"`
  - **调用处**：`LibraryPicker.tsx:152` 的容器 className `"shrink-0 w-10 h-10 rounded-md bg-bg-elevated inline-flex items-center justify-center text-fg-muted"`
    → 删掉 `text-fg-muted`（web 的容器 `LibraryPicker.tsx:256` 是 `"shrink-0 w-10 h-10 rounded-md bg-bg-elevated flex items-center justify-center"` —— **无文字色**，靠图标自带）
  - 预估改动：**~10 行**

## H-57　LibraryPicker 空态图标

- **web**：`gacode-web/src/components/chat/LibraryPicker.tsx:220-228`
  ```tsx
  <div className="flex flex-col items-center justify-center py-12 gap-3 text-fg-muted">
    <LibraryIcon className="w-10 h-10 opacity-40" />
    <div className="text-sm">
      {search.trim() ? `没有匹配 "${search}" 的知识库` : "知识库还空空如也,去采集点内容吧"}
    </div>
  </div>
  ```
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:134-139`
  ```tsx
  <div className="text-center text-fg-muted py-12 text-sm">
    {search.trim() ? `没有匹配 "${search}" 的知识库` : "知识库还空空如也,去采集点内容吧"}
  </div>
  ```
- **判定**：形态不同（2 处：缺图标 / 布局）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\LibraryPicker.tsx`
  - 锚点：`LibraryPicker.tsx:134-139`
  - 改为：
    ```tsx
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-fg-muted">
      <LibraryGlyph />
      <div className="text-sm">
        {search.trim() ? `没有匹配 "${search}" 的知识库` : "知识库还空空如也,去采集点内容吧"}
      </div>
    </div>
    ```
  - **需新增图标函数**（lucide `library` = 书脊造型，同 H-31）：
    ```tsx
    function LibraryGlyph() {
      return (
        <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          className="w-10 h-10 opacity-40">
          <path d="m16 6 4 14" />
          <path d="M12 6v14" />
          <path d="M8 8v12" />
          <path d="M4 6v16" />
        </svg>
      );
    }
    ```
    ⚠️ 同 H-31：lucide `Library` 的真实 path **待核**（未在仓内找到 node_modules/lucide-react 源文件）
  - 预估改动：**~12 行**

## H-58　LibraryPicker 搜索框

- **web**：`gacode-web/src/components/chat/LibraryPicker.tsx:175-188` —— 带 Search 图标 + `pl-9`
  ```tsx
  <div className="relative">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
    <input
      ...
      className={cn(
        "w-full pl-9 pr-3 py-2 rounded-md",
        "bg-bg-sunken text-fg placeholder:text-fg-subtle",
        "outline-none focus:ring-1 focus:ring-brand"
      )}
    />
  </div>
  ```
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:93-99`
  ```tsx
  <input
    type="text"
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    placeholder="搜索知识库标题"
    className="w-full rounded-md bg-bg-sunken text-fg placeholder:text-fg-subtle px-3 py-2 text-sm outline-none focus:border-brand focus:border"
  />
  ```
- **判定**：形态不同（同 H-44 的 5 处）
- **怎么改**：与 H-44 完全同款 —— 包 `<div className="relative">` + 复用同一个 `SearchGlyph` 组件 + input className 改成 `"w-full pl-9 pr-3 py-2 rounded-md bg-bg-sunken text-fg placeholder:text-fg-subtle outline-none focus:ring-1 focus:ring-brand"`
  - **建议**：把 `SearchGlyph` 抽到共用位置 —— PC 可放 `src/components/ui/SearchGlyph.tsx`（新建文件），或分别在 EmojiPicker / LibraryPicker 各定义一份（PC 现有风格是内联各份，如 `ChatInputBar.tsx:674-765` 有 4 个本地图标函数）。**推荐抽公共件**，避免重复实现（gaga 2026-10-22 组件意识要求）。
  - 预估改动：**~12 行 + 共用组件 12 行**

## H-59　LibraryPicker 类型 tab

- **web**：`gacode-web/src/components/chat/LibraryPicker.tsx:190-205`
  ```tsx
  <div className="flex gap-2 overflow-x-auto">
    {TYPE_TABS.map((t) => (
      <button
        key={t.key}
        type="button"
        onClick={() => setTypeFilter(t.key)}
        className={cn(
          "shrink-0 px-3 py-1 rounded-full text-xs transition-colors",
          typeFilter === t.key ? "bg-brand text-brand-on" : "bg-bg-sunken text-fg-muted hover:text-fg"
        )}
      >
  ```
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:100-118` —— **逐字一致**（仅 PC 多了 `duration-150`）
- **判定**：**已一致**
- 预估改动：**0 行**

## H-60　LibraryPicker 类型 tab 切换时清 search

- **web**：`gacode-web/src/components/chat/LibraryPicker.tsx:196`　`onClick={() => setTypeFilter(t.key)}` —— **切 tab 不清 search**
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:107`　`onClick={() => handleTypeChange(t.key)}`，而 `handleTypeChange`（`:85-88`）会 `setSearch("")`
- **判定**：形态不同（PC 多一步清空）
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\LibraryPicker.tsx`
  - 锚点：`LibraryPicker.tsx:85-88` 的 `handleTypeChange` + `:107` 的 `onClick`
  - 改成跟 web 一致（切 tab 不清 search）：
    ```tsx
    onClick={() => setTypeFilter(t.key)}
    ```
    并删除 `handleTypeChange` 函数（`:85-88`）
  - ⚠️ **代价**：PC 切 tab 清 search 是为了「避免脏组合」；web 不清。1:1 还原 = 不清。
  - 预估改动：**5 行**

## H-61　LibraryPicker 列表 key 与 data-testid

- **web**：`gacode-web/src/components/chat/LibraryPicker.tsx:248-249`
  ```tsx
  data-testid="library-picker-item"
  data-item-id={item.id}
  ```
- **PC**：`PC 缺失` —— PC `LibraryPicker.tsx:143` 只有 `<li key={item.id}>`
- **判定**：缺失
- **怎么改**：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\LibraryPicker.tsx`
  - 锚点：`LibraryPicker.tsx:144` 的 `<button ...>`
  - 加两个属性：`data-testid="library-picker-item"` + `data-item-id={item.id}`
  - 预估改动：**2 行**

## H-62　LibraryPicker 相对时间

- **web**：`gacode-web/src/components/chat/LibraryPicker.tsx:233-240`　`formatDistanceToNow(d, { addSuffix: true, locale: zhCN })` → 「3 分钟前」「大约 2 个月前」
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:36-50` 自实现 `formatRelative` → 「3 分钟前」「2026-08-15」
- **判定**：形态不同（输出文案在 >30 天时不同：web 给「大约 X 个月前」，PC 给具体日期）
- **怎么改**：
  - **需新增依赖**：`date-fns` + `date-fns/locale`
    - web 用的是 `date-fns`（`web/src/components/chat/LibraryPicker.tsx:5-6`：`import { formatDistanceToNow } from "date-fns"; import { zhCN } from "date-fns/locale";`）
    - PC `package.json` **没有** date-fns（PC `LibraryPicker.tsx:9` 注释明说「electron 端没有 date-fns 依赖, 自实现 mini 相对时间」）
    - **需新增依赖 `date-fns`**，用法：`formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: zhCN })`
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\LibraryPicker.tsx`
  - 锚点：`LibraryPicker.tsx:160` 的 `{formatRelative(item.createdAt)}`
  - 改为：
    ```tsx
    {time}
    ```
    并在 map 回调内计算：
    ```tsx
    let time = "";
    try {
      const d = new Date(item.createdAt);
      if (!isNaN(d.getTime())) {
        time = formatDistanceToNow(d, { addSuffix: true, locale: zhCN });
      }
    } catch {
      time = "";
    }
    ```
  - ⚠️ **这是 PC 仓引入新依赖的唯一一条**（HOME 页范围内）。date-fns 是 tree-shakeable 的单一函数，体积影响小。
  - ⚠️ 若 gaga 不愿引入依赖，退化方案：把 `formatRelative`（`LibraryPicker.tsx:36-50`）的 >30 天分支改成中文相对表述（如「2 个月前」），视觉接近但不逐字一致。
  - 预估改动：**~12 行 + 1 个依赖**

---

# §8 提交链路 / 数据通路

## H-63　firstMessage 传递通道

- **web**：`gacode-web/src/app/page.tsx:73-75`
  ```tsx
  onSuccess: (data, firstMsg) => {
    nav.client(router, `/chat/${data.id}?firstMessage=${encodeURIComponent(firstMsg)}`);
  },
  ```
  → **firstMessage 走 URL query**
- **PC**：`gacode-electron/src/routes/Home.tsx:58-59, 102-104, 146-157`
  ```tsx
  export const HOME_FIRST_MESSAGE_KEY = "gacode:home:firstMessage";
  export const HOME_ATTACHMENTS_KEY = "gacode:home:attachments";
  ...
  onSuccess: (chat) => { navigate(`/chat/${chat.id}`); },
  ...
  sessionStorage.setItem(HOME_FIRST_MESSAGE_KEY, firstMsg);
  ```
  → **firstMessage 走 sessionStorage**
- **判定**：形态不同（**机制不同，但两边都「端到端自洽」**：web 的 chat 页读 query，PC 的 chat 页读 sessionStorage）
- **怎么改**：**建议不改**。
  - web 用 query 的理由（`page.tsx:151-153` 注释）是「避免 URL 太长被截断 / 编码麻烦」→ 恰恰是**附件**用 sessionStorage、纯文本用 query。
  - PC 用 sessionStorage 统一带两者，也自洽。
  - 若要逐字对齐 web：firstMessage 走 query（`navigate(\`/chat/${chat.id}?firstMessage=${encodeURIComponent(firstMsg)}\`)`），附件仍走 sessionStorage。
    - **代价**：PC 的 `ChatDetail` 消费端要改（`src/routes/ChatDetail.tsx` 读 `HOME_FIRST_MESSAGE_KEY`）→ 跨文件，且 chat 域 worker 正在动这块。
    - **建议**：保留 PC 现有机制（功能等价），只确保 **sessionStorage 的 payload 结构与 web 完全一致**（见 H-64）。
  - 预估改动：**0 行（建议保留）**

## H-64　附件 sessionStorage payload 结构

- **web**：`gacode-web/src/app/page.tsx:182-190`
  ```tsx
  if (imageUrls.length > 0 || attachedFileIds.length > 0) {
    try {
      const payload = JSON.stringify({
        imageUrls,
        attachedFileIds,
        attachedFileNames,
      });
      sessionStorage.setItem("pending_first_attachments", payload);
    } catch { }
  }
  ```
- **PC**：`gacode-electron/src/routes/Home.tsx:148-157`
  ```tsx
  if (imageUrls.length > 0 || attachedFileIds.length > 0) {
    sessionStorage.setItem(
      HOME_ATTACHMENTS_KEY,
      JSON.stringify({
        imageUrls,
        attachedFileIds,
        attachedFileNames,
      } satisfies HomeAttachments),
    );
  }
  ```
- **判定**：**已一致**（字段名 `imageUrls` / `attachedFileIds` / `attachedFileNames` 三元组**逐字相同**，只有 sessionStorage 的 key 名不同 —— key 是端内私有的，不算差异）
- 预估改动：**0 行**

## H-65　image_urls / attached_file_ids 分流逻辑

- **web**：`gacode-web/src/app/page.tsx:165-179`
  ```tsx
  const imageUrls: string[] = [];
  const attachedFileIds: string[] = [];
  const attachedFileNames: Array<{ fileId: string; name: string }> = [];
  for (const it of doneItems) {
    if (it.mode === "image" && it.url) imageUrls.push(it.url);
    if (it.mode === "document" && it.fileId) {
      attachedFileIds.push(it.fileId);
      attachedFileNames.push({ fileId: it.fileId, name: it.file.name });
    }
  }
  ```
  → **按显式 `it.mode` 分流**（2026-10-16 M-doc bug 修复）
- **PC**：`gacode-electron/src/routes/Home.tsx:122-131`
  ```tsx
  for (const att of attachments) {
    if (att.url && !att.fileId) {
      imageUrls.push(att.url);
    } else if (att.fileId) {
      attachedFileIds.push(att.fileId);
      attachedFileNames.push({ fileId: att.fileId, name: att.name });
    }
  }
  ```
  → **按 `att.url && !att.fileId` 启发式分流**
- **判定**：形态不同（实现方式不同）
- **怎么改**：
  - **实际行为核对**：web 注释里说的 bug 是「document 模式后端 BOTH 返 url，旧逻辑 `if (it.url)` 会把 doc URL 误入 image_urls」。
    - PC 的条件是 `att.url && !att.fileId` —— document 模式后端既返 url 也返 fileId → `att.fileId` 存在 → 走 else 分支进 `attachedFileIds` ✅ **PC 的启发式在当前后端行为下不会出错**
    - 但 web 改成显式 mode 是因为「后端行为一变就会静默错」（2026-10-16 修复记录）。PC 的 `PendingAttachment`（`ChatInputBar.tsx:84-95`）**没有 `mode` 字段** → 要跟 web 一样显式分流，需把 mode 透传。
  - **要跟 web 1:1**：给 `PendingAttachment` 加 `mode` 字段
    - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\ChatInputBar.tsx`
    - 锚点：`ChatInputBar.tsx:84-95` 的 `PendingAttachment` interface
    ```tsx
    export interface PendingAttachment {
      url?: string;
      fileId?: string;
      name: string;
      mime?: string;
      /** 显式上传模式 — image 走 /yinian/upload 拿 url, document 走 /yinian/documents 拿 fileId.
       *  跟 web buildFirstMessage 按 mode 分流对齐 (2026-10-16 M-doc bug). */
      mode?: UploadMode;
    }
    ```
    - `UploadMode` 从 `../../lib/upload` import（`ChatInputBar.tsx:45` 已 import `uploadAttachment, deriveUploadMode` → 加 `type UploadMode`）
    - `addAttachment`（`ChatInputBar.tsx:191-216`）写入时带 mode：`mode: att.mode ?? (att.fileId ? "document" : "image")`
    - `handleDroppedFile` 的 done 态（`ChatInputBar.tsx:339-352`）写入 `mode`
    - `handleSend` 的 `doneAtts` map（`ChatInputBar.tsx:392-394`）带上 `mode: x.mode`
  - **Home 侧**（`Home.tsx:122-131`）改为按 mode 分流：
    ```tsx
    for (const att of attachments) {
      const mode = att.mode ?? (att.fileId ? "document" : "image");
      if (mode === "image" && att.url) imageUrls.push(att.url);
      if (mode === "document" && att.fileId) {
        attachedFileIds.push(att.fileId);
        attachedFileNames.push({ fileId: att.fileId, name: att.name });
      }
    }
    ```
    ⚠️ **保留 `??` 兜底**：若某个 attachment 没有 `mode`（老数据 / 手动构造），会两个分支都不进 → 附件丢失。兜底式（`att.mode ?? (att.fileId ? "document" : "image")`）保证行为等价于现状。
  - 预估改动：**~18 行（ChatInputBar 12 + Home 6）**

## H-66　firstMessage 文本 fallback 拼接

- **web**：`gacode-web/src/app/page.tsx:201-206`
  ```tsx
  const descs = doneItems.map((it) => {
    if (it.mode === "image" && it.url) return `[图片: ${it.url}]`;
    if (it.mode === "document" && it.fileId) return `[附件: ${it.file.name}]`;
    return "";
  });
  return [content, ...descs].filter(Boolean).join("\n");
  ```
- **PC**：`gacode-electron/src/routes/Home.tsx:136-143`
  ```tsx
  const descs = attachments
    .map((att) => {
      if (att.url && !att.fileId) return `[图片: ${att.url}]`;
      if (att.fileId) return `[附件: ${att.name}]`;
      return "";
    })
    .filter(Boolean);
  const firstMsg = [content, ...descs].filter(Boolean).join("\n");
  ```
- **判定**：**已一致**（格式串 `[图片: URL]` / `[附件: 文件名]` **逐字相同**，拼接顺序 `content` 在前、`\n` 分隔、`.filter(Boolean)` 去空 —— 全部一致）
- 预估改动：**0 行**（若采纳 H-65 的 mode 改造，此处同步改成按 mode 判断，输出不变）

## H-67　无附件时不写 sessionStorage

- **web**：`gacode-web/src/app/page.tsx:160-163` —— `doneItems.length === 0` 直接返文本，不写 sessionStorage
- **PC**：`gacode-electron/src/routes/Home.tsx:148` —— `if (imageUrls.length > 0 || attachedFileIds.length > 0)` 才写
- **判定**：**已一致**
- 预估改动：**0 行**

## H-68　createChat 参数

- **web**：`gacode-web/src/app/page.tsx:70-72`
  ```tsx
  // R7 P6 对齐: 不再手动截前 30 字做 title — server service 兜底 '新对话',
  // ChatDetail 进页时由 useEffect 异步调 autoTitleSession 覆盖.
  mutationFn: (_firstMsg: string) => createChat(),
  ```
- **PC**：`gacode-electron/src/routes/Home.tsx:100-101`　`mutationFn: () => createChat()` —— **同样不传 title**
- **判定**：**已一致**
- 预估改动：**0 行**

## H-69　createChat 失败 toast

- **web**：`gacode-web/src/app/page.tsx:76-82`
  ```tsx
  onError: (err) => {
    toast({
      title: "创建对话失败",
      description: String((err as Error)?.message || err),
      variant: "danger",
    });
  },
  ```
- **PC**：`gacode-electron/src/routes/Home.tsx:105-110`
  ```tsx
  onError: (err) => {
    toast({
      message: `创建对话失败: ${err instanceof Error ? err.message : String(err)}`,
      variant: "danger",
    });
  },
  ```
- **判定**：形态不同（PC 单字段拼接 vs web 双字段）
- **怎么改**：见 H-42 的同一处置（PC toast 无 title/description）→ 归入 S-04。**当前形态信息等价，不单独改**。
- 预估改动：**0 行（现状可接受）**

## H-70　web 的未登录拦截点（3 处）

- **web**：`gacode-web/src/app/page.tsx:85-91`（☰ 菜单）、`:97-103`（`+` 按钮）、`:209-213`（发送）、`:244-262`（输入框 blur 150ms）
  ```tsx
  const handleInputBlur = () => {
    if (!isAuthenticated) {
      if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
      blurTimerRef.current = setTimeout(() => {
        setShowAuthDialog("input");
        blurTimerRef.current = null;
      }, 150);
    }
  };
  ```
- **PC**：`PC 缺失`（PC 未登录进不了 Home，见 H-02）
- **判定**：缺失（依附 H-02）
- **怎么改**：随 S-01 一起处理。若 S-01 拍板「PC 不做未登录态」，本条**作废**。
- 预估改动：**0 行（随 S-01）**

---

# §9 结构级差异 · 需 gaga 拍

> **PC 侧栏常驻已拍板保留**（gaga 2026-10-26：「PC 的 256px 常驻侧栏保留，不改成 web 的 Drawer 抽屉」）。因此「侧栏常驻 vs web 抽屉」**不在本节**，对应条目 H-03 / H-04 已标「✅ 已拍板 · PC 不还原」。侧栏**内部**的置顶可折叠分组 / pin 按钮 / 条目视觉形态 / 圆角间距 hover 态 / 计数与折叠箭头对齐，属 ChatList 侧栏域，不在本 HOME 页清单范围。

## S-01　未登录态整块缺失（Home 页形态分叉）

- **web**：`gacode-web/src/app/page.tsx:425-537` —— 未登录时 Home **不跳登录**，而是渲染：
  - 居中 Cody 头像 120px（`page.tsx:455-461`，`width={120} height={120}`）
  - 居中标题（`page.tsx:465-467`）
  - 居中输入框 Card（`page.tsx:471-487`，`w-full max-w-2xl`）
  - 左上 ☰ 菜单按钮 + 右上「登录」按钮（`page.tsx:428-449`）
  - 点 ☰ / 点输入框 → AlertDialog「登录后即可跟 Cody 对话」（`page.tsx:490-535`），带「再看看」「去登录」两个按钮
- **PC**：`src/App.tsx:103-109` 用 `<Protected>` 包住 Home，未登录直接跳 `/login`；PC `Home.tsx` 无任何未登录分支
- **改造影响面**：
  - 改 `src/App.tsx:103-109` 的路由守卫（`Protected` → 允许匿名访问 Home）
  - 改 `src/routes/Home.tsx` 增加 `isAuthenticated` 分支（约 120 行 JSX + 约 60 行 state/handler）
  - 新增 PC 端 AlertDialog 组件（web 的 `page.tsx:490-535` 是**内联**在 page.tsx 里的，不是共用组件 → PC 需新写或复用 `src/components/ui/ConfirmDialog.tsx`）
  - 需确认 PC 的 `useAuth()`（`src/lib/auth.tsx`）在 `user === null` 时是否会被 `Protected` 之外的组件安全读取（`Home.tsx:82` 已经在用 `useAuth()`）
  - 需确认匿名状态下 `createChat()` 会不会 401（会 → 发送前必须走未登录拦截）
- **需要 gaga 拍**：PC 端要不要做未登录态？
  - **选项 A（推荐，成本低）**：**不做**。PC 是桌面客户端，登录是必需的前置；web 做未登录态是因为它是公开落地页（要引流注册）。保持 PC `Protected` 现状 → H-02 / H-25 / H-70 三条直接作废。
  - **选项 B**：做，完整复刻 web 的居中布局 + AlertDialog（成本 ~180 行，且要处理匿名发送拦截）。
- **PM 建议**：选 A。理由：web 的未登录态本质是「落地页营销位」，PC 端没有获客场景。

## S-02　附件区的归属与 attachments state 所有权（跨 chat 域）

- **现状**：
  - web `page.tsx:306-357`：附件预览区在 **Home 页自己的 JSX 里**（ChatInputBar **外面**），数据源是 `useAttachmentUpload()` hook（`web/src/hooks/useAttachmentUpload.ts`），状态由 Home 持有
  - PC `ChatInputBar.tsx:173`：`const [attachments, setAttachments] = useState<AttachmentItem[]>([])` —— 状态在 **ChatInputBar 内部**，Home 拿不到
- **改造影响面**：
  - 要让 PC 的附件区对齐 web（位置在输入条外面、间距 `gap-2`、Home 能自己控制），必须让 attachments state 上移到 Home
  - 或 ChatInputBar 增加 `onAttachmentsChange?: (items: AttachmentItem[]) => void` 回调（同步上报），Home 读 state 做渲染
  - **两种做法都会波及 `src/routes/ChatDetail.tsx`**（它也用 ChatInputBar）→ **必须与 chat 域 worker 协调，不能两个 worker 同时改 ChatInputBar**
  - 另外 H-15（上传中禁止提交）、H-16（部分失败 warning）依赖 attachments state 可见 → 同批解决
- **需要 gaga 拍**：附件 state 归谁？
  - **选项 A（推荐）**：ChatInputBar 保持内部持有 + 新增 `onAttachmentsChange` 回调，Home 只读不改。改动小、不破坏 ChatDetail。
  - **选项 B**：attachments state 上移到 Home，ChatInputBar 改受控（`attachments` + `onAttachmentsChange`）。彻底对齐 web，但 ChatInputBar 大改 → chat 域要重排。
- **PM 建议**：选 A。**但需明确：ChatInputBar 的改动由 chat 域 worker 执行，本清单的 H-11 / H-15 / H-16 三条是给 chat 域的输入规格，不是 Home worker 可单独完成的任务。**

## S-03　`+` Sheet → MediaPicker 的层级（拍照入口位置）

- **web**：
  - `SheetActionMenu`（`web/src/components/chat/SheetActionMenu.tsx:76-95`）只有 4 项：**图片 / 文件 / 表情 / 挂载知识库** —— **Sheet 里没有「拍照」**
  - 选「图片」→ `openPicker("image")`（`page.tsx:105-115`）→ `MediaPicker` **image 模式** → MediaPicker 内部并排显示 **拍照 + 相册** 两个圆形按钮（`web/src/components/common/MediaPicker.tsx:217-239`）
  - 选「文件」→ `openPicker("file")` → MediaPicker **file 模式** → 只有「选择文件」按钮（`MediaPicker.tsx:207-216`）
- **PC**：
  - `PlusSheet`（`PC src/components/home/PlusSheet.tsx:72-135`）有 6 项，含顶层「拍照」
  - 选「拍照」→ `handlePlusPick("camera")`（`Home.tsx:171-174`）→ `MediaPicker kind="camera"` → MediaPicker 显示**一个**按钮「打开拍照」
  - MediaPicker 的 image 模式**没有并排的拍照/相册双按钮**
- **改造影响面**：改 `PlusSheet.tsx`（删「拍照」项 + 改 `PlusAction` 类型）、改 `MediaPicker.tsx`（改 `MediaKind` 两态 + image 模式重写为双按钮）、改 `Home.tsx`（`handlePlusPick` 的 case 合并 + `pickUploadMode`）、改 `PlusSheet` 的 `PlusAction` 类型定义
- **需要 gaga 拍**：
  - **选项 A（推荐，1:1 还原 web）**：拍照下沉到 MediaPicker。Sheet 显示 4 项（图片/文件/表情/挂载知识库），点「图片」进 MediaPicker，MediaPicker 内并排「拍照 / 相册」。**代价**：PC 用户点「拍照」从 2 跳变 3 跳。
  - **选项 B**：保持 PC 现状（顶层拍照 1 跳到 MediaPicker），MediaPicker 仍单按钮。**不 1:1 还原**，但操作更短。
- **PM 建议**：选 A（gaga 明确「先 1:1 还原 web」，且 MediaPicker 双按钮本身就是 H-32 的改动，两条合并做只多改一个文件）。

## S-04　PC Toast 组件无 title / description 双字段

- **web**：`web/src/components/ui/Toast.tsx`（`useToast()` 返回的 `toast({ title, description, variant })`）—— 首页用到 4 处双字段 toast：
  - `page.tsx:76-82`（创建对话失败）、`:120-127`（上传失败）、`:219-226`（附件还在上传中）、`:228-234`（部分附件上传失败）
- **PC**：`src/components/ui/Toast.tsx:31` —— `toast: (input: { message: string; variant?: ToastVariant; duration?: number }) => void`，**只有单行 message**
- **改造影响面**：改 `src/components/ui/Toast.tsx`（新增 `title?: string` / `description?: string` 两个 prop + 渲染成两行）+ **全站所有 toast 调用点**（`variant` 已有，不受影响；只新增可选 prop → 旧调用点不用改）→ 影响面其实可控
- **需要 gaga 拍**：
  - **选项 A（推荐）**：给 PC Toast 加 `title` / `description` 可选 prop（向后兼容，旧调用点零改动），HOME 页 4 处 toast 改成双字段跟 web 一致。~30 行。
  - **选项 B**：不改 Toast 组件，HOME 页沿用单行拼接（信息等价，视觉不同）。
- **PM 建议**：选 A。改 Toast 是向后兼容的新增 prop，不破坏任何现有调用点，但能让 HOME 页 toast 跟 web 逐字一致。

## S-05　BottomSheet 公共组件形态与 web SheetContent 的差距

- **web**：web 的所有底部面板都基于 `web/src/components/ui/sheet.tsx` 的 `<SheetContent side="bottom" className="...">`，每个面板自己定 className，**无统一标题栏、无统一 padding**
- **PC**：`src/components/ui/BottomSheet.tsx` 是**单一公共组件**，强制「标题栏 + `p-5` + `max-w-[80vh]` + `max-w-2xl` 居中」形态，被 PlusSheet / MediaPicker / EmojiPicker / LibraryPicker / ChatDetail 多处复用
- **改造影响面**：
  - 要让 HOME 页 4 个面板对齐 web 各自形态（MediaPicker 黑底无标题、EmojiPicker 无标题 `p-0 max-h-[70vh]`、LibraryPicker 有标题+副标题+底部条、PlusSheet 无标题 4 列网格），需要给 `BottomSheet` 加 4 个能力：
    - `contentClassName?: string`（覆盖容器 className，H-29）
    - `title?: string` 改可选（无标题时隐藏标题栏，H-43）
    - `subtitle?: string`（标题下副标题，H-54）
    - `header?: ReactNode`（固定在滚动区外的头部，H-46 的彻底方案）
  - 改 `BottomSheet.tsx` 会**波及所有调用方** → 必须与 chat 域 worker 协调（ChatDetail 也在用 BottomSheet）
- **需要 gaga 拍**：
  - **选项 A（推荐）**：给 `BottomSheet` 加上述可选 prop（全部默认保持现有行为 → 其他调用方零改动），HOME 页 4 个面板各自传。~40 行。
  - **选项 B**：HOME 页不用 `BottomSheet`，为 Home 单独写一套面板组件。**不推荐** —— 违反 gaga 2026-10-22「组件意识：禁止重复实现」的要求。
- **PM 建议**：选 A。且这 4 个新 prop 建议由 **chat 域 worker 统一加**（他也在改 ChatInputBar 和 ChatDetail 的面板），避免两个 worker 同时改 `BottomSheet.tsx`。

## S-06　ChatInputBar 的受控 / 非受控 API 形态

- **web**：`web/src/components/chat/ChatInputBar.tsx:20-43` —— **受控**：`value: string` + `onChange: (v: string) => void` + `onSend: () => void` + `onPlusClick?` + `onAbort?` + `placeholder?` + `disabled?` + `isStreaming?` + `caption?` + `className?` + `maxHeight?`。**ChatInputBar 内部不存 text**（源码注释 `ChatInputBar.tsx:16-17` 明说「受控组件… ChatInputBar 不存 value」）
- **PC**：`src/components/chat/ChatInputBar.tsx:113-145` —— **非受控**：内部 `useState("")`（`:170`）+ `onSubmit: (text, attachments) => boolean | void` + `onStop` + `isStreaming`（必填）+ `canRerun` + `onRerun` + `onSlashCommand` + `onPlusClick` + `onAttachmentError`。**用 `useImperativeHandle` 暴露 `insertEmoji` / `insertText` / `addAttachment` / `focus`**（`:106-111`）
- **改造影响面**：改成受控会波及 `src/routes/ChatDetail.tsx`（它靠 `insertText` / `addAttachment` 命令式写回 textarea）+ slash 菜单逻辑（`ChatInputBar.tsx:413-459` 依赖内部 `text`）+ 拖拽/粘贴上传（`:280-386` 依赖内部 `attachments`）→ **ChatInputBar 基本要重写**
- **需要 gaga 拍**：
  - **选项 A（推荐）**：**不改 API 形态**。web 的受控形态是 web 侧「Home 和 ChatDetail 共用一个组件」的设计产物；PC 的命令式形态是 PC 侧「ChatInputBar 自治 + parent 通过 ref 指挥」的设计产物。**功能上已覆盖**（H-10 已登记对照）。只补 web 有而 PC 缺的**可选 props**：`placeholder` / `disabled` / `caption` / `maxHeight`（H-22 / H-23 / H-24）。
  - **选项 B**：改成受控 + 全部对齐。成本极高，且与 chat 域的 slash 菜单 / 拖拽上传实现强耦合。
- **PM 建议**：选 A。**本页的 H-10 / H-19 / H-20 / H-21 / H-22 / H-23 / H-24 全部以「补可选 props + 改 className」为边界，不动 ChatInputBar 的状态模型。**

## S-07　MediaPicker 的桌面端形态冲突（黑底全宽 vs 灰底限宽）

- **web**：`web/src/components/common/MediaPicker.tsx:200` —— `bg-black border-t-0 text-white flex flex-col gap-0 p-0 max-h-[85vh]`，**纯黑底 + 白字 + 无圆角 + 全宽**，按钮是 `bg-white/10` 半透明白
- **PC**：`src/components/ui/BottomSheet.tsx:49` —— `bg-bg-elevated`（#181818）+ `rounded-t-md` + `p-5` + `max-w-2xl` 居中，按钮是 `bg-bg-sunken`（#0a0a0a）
- **改造影响面**：web 的 MediaPicker 视觉是**移动端全屏底部弹层**；PC 是桌面端居中限宽弹层。1:1 抄 web 的 `bg-black` + `!rounded-none` + `!max-w-none` 会让 PC 弹层横贯整个窗口底边，**与 PC 其他三个面板（限宽居中）视觉不统一**
- **需要 gaga 拍**：
  - **选项 A（推荐）**：**保留 PC 的限宽居中形态**，只对齐 web 的**内容**（拍照/相册双按钮、取消按钮、标题文案、file accept 白名单），底色保留 `bg-bg-elevated`。理由：PC 是桌面端，全宽黑底弹层不符合桌面交互习惯，且会与 PlusSheet / EmojiPicker / LibraryPicker 不一致。
  - **选项 B（严格 1:1）**：照抄 web 的 `bg-black text-white !rounded-none !max-w-none !p-0`，按钮改 `bg-white/10`。
- **PM 建议**：选 A。**「对齐」的判定标准建议改为「内容与交互一致，容器形态按端特性保留」** —— 这一点如果 gaga 认可，本清单里 S-07、H-33、H-43 的部分 className 要求可以降级为可选项。

---

# §10 高价值发现（已核实 · web 与 PC 行为实际不一致）

> 以下 11 条都是我逐行读过两边源码后确认的**真实行为差异**，不是样式观感差异。

### F-01　PC「有附件、没文字」时点发送按钮**完全没反应**（web 能发）

- **web**：`page.tsx:217`　`if (!content && upload.items.length === 0) return;` —— **有附件就允许提交**，文字可为空
- **PC**：`ChatInputBar.tsx:389-390`　`if (!trimmed) return;` —— **文字为空直接 return**
- **PC 发送按钮的 disabled 条件**（`ChatInputBar.tsx:642`）却是 `disabled={!text.trim() && !attachments.some((x) => x.kind === "done")}` —— **按钮可点，但点击后被 `handleSend` 拦掉**
- **后果**：用户只上传图片不写字 → 点发送 → 按钮变灰但点了没反应 → 用户以为坏了
- **修法**：见 H-17（`ChatInputBar.tsx` 加 `hasDoneAttachment` 判断，2 行）

### F-02　PC 上传中点发送 → 附件**静默消失**，无任何提示

- **web**：`page.tsx:219-226` —— 检测到 `hasUploading` 就弹 toast「附件还在上传中 / 请稍候几秒再发送」并 **return（不提交）**
- **PC**：`ChatInputBar.tsx:392-394` 只取 `kind === "done"` 的附件传给 parent，**uploading 项被丢弃**；Home `handleSubmit`（`Home.tsx:114`）收到的是不含 uploading 附件的数组 → 直接 createChat
- **后果**：用户点发送时上传还没完 → 附件永久丢失，**没有 toast、没有警告**
- **修法**：见 H-15 + H-16（需 `onSubmitNotice` 回调，~10 行）

### F-03　PC 创建对话失败时，附件已被清空，**用户无法重试**

- **web**：`page.tsx:237-239` —— createChat 失败只弹 toast，**附件 state 不动**（web 注释明说「这里不重置, 让 user 看到状态到 chat 页前都不丢」）
- **PC**：`ChatInputBar.tsx:396-399` —— `onSubmit` 返回 `true` 后立即 `setText(""); setAttachments([])`；而 `Home.tsx:163` 的 `handleSubmit` **写死 `return true`**
- **PC 的 createChat 失败路径**：`Home.tsx:105-110` 只弹 toast → **附件和文字都已清空，用户必须重新选文件**
- **修法**：见 H-18（`handleSubmit` 返回 `false`，createChat 成功后再 `clear()`，~12 行）

### F-04　web 的文件白名单被它自己的组件架空，PC 用的是**另一串**

- **web `page.tsx:110`** 传给 MediaPicker：`".pdf,.doc,.docx,.txt,.md,.zip,.json,.png,.jpg,.jpeg,.gif,.webp"`
- **web `MediaPicker.tsx:254`**：`accept={modeProp === "file" ? (accept || FILE_ACCEPT) : accept}` —— 因为 `accept` 非空，**组件内置的 `FILE_ACCEPT`（`.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv`）被完全绕过**
- → **web 实际生效 = `page.tsx:110` 那串**（有 `.md/.zip/.json/.png/.jpg/...`，没有 `.xls/.xlsx/.csv`）
- **PC `MediaPicker.tsx:32`** 用的是 `.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv` —— **恰好是被 web 架空的那串**
- **后果**：PC 选不了 `.md` / `.zip` / `.json`；web 能选 `.md` 但选不了 `.xls/.xlsx/.csv`
- **修法**：见 H-36（PC 改成 web 实际生效的那串，1 行）
- ⚠️ **待核**：`.zip` / `.json` 是否被后端 `/yinian/documents` 的 mime 白名单接受 —— 需查 unified-api

### F-05　PC 的 MediaPicker image 模式**只有 1 个按钮**，web 是并排 2 个

- **web `MediaPicker.tsx:217-239`**：image 模式并排「拍照（w-24 h-24 rounded-full）」+「相册（w-24 h-24 rounded-full）」两个圆形按钮
- **PC `MediaPicker.tsx:71-91`**：**单个**按钮 `w-40 h-24 rounded-md`，文案随入口变（「打开拍照」/「打开选择图片」）
- **后果**：PC 的 MediaPicker 在 image 模式下**看不到「拍照」和「相册」并排的入口**，拍照被提升到 PlusSheet 顶层（与 web 的层级相反，见 S-03）
- **修法**：见 H-32（MediaPicker 改双按钮 + 双 hidden input，~40 行）

### F-06　PC 知识库挂载是**单选立即关闭**，web 是**多选 + 完成按钮**

- **web `LibraryPicker.tsx:121-149`**：`onConfirm` 存在时点行只切换勾选，**不关面板**；底部「完成 (N)」按钮才提交
- **PC `LibraryPicker.tsx:144-150`**：点行立即 `onSelect(item); handleClose();` —— **单选、立即关闭**
- **后果**：PC 用户想挂 2 条知识库做不到，只能挂 1 条再重新打开
- **修法**：见 H-51 / H-52 / H-53（~100 行三件套）

### F-07　PC 的附件区**在 ChatInputBar 内部**，Home 无法独立控制

- **web `page.tsx:306-357`**：附件区是 Home 页自己的 JSX，在 ChatInputBar **外面**，`px-4 pb-2` + `flex flex-wrap gap-2`
- **PC `ChatInputBar.tsx:507-508`**：附件区在 ChatInputBar **里面**，`mb-2 flex flex-wrap gap-1.5`
- **后果**：(a) Home 无法控制附件区位置/间距（只能改 ChatInputBar → 同时改到 ChatDetail）；(b) 附件区是**输入框内部**的，而 web 是**输入框外部上方**，视觉差一行
- **修法**：见 H-11 + S-02（需与 chat 域协调，~18 行）

### F-08　PC 欢迎语文案与 web **完全不同**

- **web `page.tsx:295`**：`HI 我是 <span className="text-primary">cody</span> 很高兴遇见你`
- **PC `Home.tsx:292-294`**：`HI 欢迎你,<span className="text-brand">{displayName}</span>`（`displayName` = `user?.displayName || user?.username || "访客"`）
- **后果**：PC 首页喊的是用户名，web 首页喊的是「cody」品牌名 —— **这是首页第一眼可见的文案差异**
- **修法**：见 H-07（4 行；改完要清掉 `displayName` / `useAuth` 的未使用变量）

### F-09　PC 输入区宽度 640px，web 已登录态 768px

- **web `page.tsx:361`**：`<div className="max-w-3xl mx-auto">` = **768px**
- **PC `Home.tsx:305`**：`<div className="max-w-2xl mx-auto w-full">` = **640px**
- **注**：`max-w-2xl` 是 web **未登录**分支的值（`page.tsx:471`）→ d318f17 那轮对齐时取错了分支
- **修法**：见 H-09（2 行）

### F-10　PC 切「知识库类型 tab」会清空搜索词，web 不会

- **web `LibraryPicker.tsx:196`**：`onClick={() => setTypeFilter(t.key)}` —— 不动 search
- **PC `LibraryPicker.tsx:85-88`** 的 `handleTypeChange` 会 `setSearch("")`
- **后果**：PC 用户「搜『报告』→ 切到『文档』tab → 搜索词被清空 → 结果全变」
- **修法**：见 H-60（5 行）

### F-11　PC 知识库列表项**没有类型颜色**，web 按类型分色

- **web `LibraryPicker.tsx:47-59`**：image=`text-brand-cyan`（青）/ doc=`text-brand`（橙）/ link=`text-cron`（紫）/ 其他=`text-fg-muted`（灰）
- **PC `LibraryPicker.tsx:186-261`**：4 个 case 全是 `stroke="currentColor"`，靠父容器 `text-fg-muted` 着色 → **全部灰色**
- **额外坑**：web 的 `text-cron` token（#a78bfa 紫）**PC tailwind 仓里根本没有**（`tailwind.config.ts:37-107` 无 `cron` 键）
- **修法**：见 H-56（~10 行；`cron` 要么给 PC tailwind 加 token，要么用 `brand-cyan` 近似）

---

# §11 施工顺序索引（按预估改动量从小到大）

> gaga 2026-10-26 要求「清单按改动量从小到大排」。本节是**施工顺序输入**（同档内按依赖排：先做公共组件改动，再做页面）。

## 档位 0 · 0 行（已一致，不动）

H-08 · H-27 · H-37 · H-39 · H-41 · H-47 · H-48 · H-49 · H-50 · H-59 · H-64 · H-66 · H-67 · H-68 · H-10（登记不改正）· H-42 · H-63 · H-69 · H-03 · H-04

## 档位 1 · 1–3 行（纯 className / 一行逻辑）

| 序 | 条目 | 一句话 |
|---|---|---|
| 1 | H-36 | PC `MediaPicker.tsx:32` 的 `FILE_ACCEPT` 换成 web 实际生效的那串（`.md/.zip/.json/...`） |
| 2 | H-13 | PC `AttachmentChip.tsx:50` 底色 `bg-bg-elevated` → `bg-bg-base` + `shadow-sm`（**必须与 H-19 同批，否则 chip 在黑底消失**） |
| 3 | H-45 | PC `EmojiPicker.tsx:137` 分类 tab 容器加 `mt-3` |
| 4 | H-01 | PC `Home.tsx:274` 根容器 `min-h-full` → `min-h-screen`、`bg-bg-base` → `bg-background` |
| 5 | H-06 | PC `Home.tsx:286-291` 头像 `w-[72px] h-[72px]` → `w-16 h-16`、`rounded-xl` → `rounded-squircle`，外层 `gap-3` → `gap-4`（**真图 `cody_512.png` 待 gagaOS 提供**） |
| 6 | H-61 | PC `LibraryPicker.tsx:144` 加 `data-testid="library-picker-item"` + `data-item-id` |
| 7 | H-17 | PC `ChatInputBar.tsx:389` 允许「有附件无文字」提交 |
| 8 | H-05 | PC `Home.tsx:284` 删 `justify-center`、加 `text-center`、`lg:px-8` → `px-4`，补 `<div className="flex-1" />` |
| 9 | H-09 | PC `Home.tsx:305` `max-w-2xl` → `max-w-3xl`、`bg-bg-base` → `bg-background` |
| 10 | H-12 | PC `UploadProgressBar.tsx:36` 底色 + 填充色 + 过渡属性对齐 web |
| 11 | H-43 | PC `EmojiPicker.tsx:126` 加 `contentClassName="!p-0 !max-h-[70vh]"` + `title={undefined}`（依赖 H-29） |
| 12 | H-46 | PC `EmojiPicker.tsx:161` 网格加 `px-4` |
| 13 | H-38 | PC `MediaPicker.tsx:58` 关闭时清双 input value（依赖 H-32） |
| 14 | H-20 | PC `ChatInputBar.tsx:562` `+` 按钮改 `rounded-full` + 去底色 + 图标 20px |
| 15 | H-23 | PC `ChatInputBar.tsx:578` placeholder 改 `"说点什么…"`（新增 `placeholder` prop） |
| 16 | H-30 | PC `Home.tsx:169-191` 五处 `setTimeout(..., 80)` → `100` |
| 17 | H-34 | PC `MediaPicker.tsx:70` 加标题 `<h3>` + 容器 padding 对齐 |
| 18 | H-56 | PC `LibraryPicker.tsx:186-261` 类型图标加 className 颜色 + 删父级 `text-fg-muted` |
| 19 | H-55 | PC `LibraryPicker.tsx:150` 列表项 `rounded-lg` + 选中态 `!border-brand bg-brand/5` |
| 20 | H-60 | PC `LibraryPicker.tsx:85-88, 107` 切 tab 不清 search |

## 档位 2 · 4–8 行

| 序 | 条目 | 一句话 |
|---|---|---|
| 20 | H-31 | PC `PlusSheet.tsx:172-178` 知识库图标换成 lucide `Library` path |
| 21 | H-07 | PC `Home.tsx:292-294` 欢迎语改「HI 我是 cody 很高兴遇见你」+ 清 `displayName` |
| 22 | H-33 | PC `MediaPicker.tsx:69` 黑底无圆角无标题（`contentClassName`） |
| 23 | H-35 | PC `MediaPicker.tsx` 加底部「取消」按钮 |
| 24 | H-28 | PC `PlusSheet.tsx` 6 个 SVG `strokeWidth` 1.8 → 2 |
| 25 | H-24 | PC `ChatInputBar.tsx` 新增 `disabled` prop + Home 传 `createMutation.isPending` |
| 26 | H-15 | PC `ChatInputBar.tsx:392` 插入上传中拦截（`hasUploading` → `onAttachmentError` → return） |
| 27 | H-16 | PC `ChatInputBar.tsx` + `Home.tsx` 新增 `onSubmitNotice`（部分失败 warning） |

## 档位 3 · 10–18 行

| 序 | 条目 | 一句话 |
|---|---|---|
| 28 | H-57 | PC `LibraryPicker.tsx` 空态加 `LibraryGlyph` 图标 |
| 29 | H-54 | PC `BottomSheet` 加 `subtitle` prop + LibraryPicker 标题改「选择知识库」 |
| 30 | H-44 | PC `EmojiPicker.tsx` 加 Search 图标 + `pl-9` + `focus:ring-brand` |
| 31 | H-58 | PC `LibraryPicker.tsx` 加 Search 图标 + `pl-9` + `focus:ring-brand`（**与 H-44 共用 `SearchGlyph` 组件**） |
| 32 | H-14 | PC `UploadErrorChip.tsx` 颜色对齐 web 亮色红系 |
| 33 | H-18 | PC `Home.tsx` + `ChatInputBar.tsx` 附件清空时机改为 createChat 成功后 |
| 34 | H-22 | PC `ChatInputBar.tsx` 加底部 caption「AI 生成内容请核实重要信息」 |
| 35 | H-21 | PC `ChatInputBar.tsx` 发送按钮改 `rounded-full` + ArrowUp 图标 + disabled 态 |
| 36 | H-65 | PC `PendingAttachment` 加 `mode` 字段 + Home 按 mode 分流（web M-doc bug 对齐） |
| 37 | H-52 | PC `LibraryPicker.tsx` 加勾选框 + `CheckGlyph` |
| 38 | H-29 | PC `BottomSheet.tsx` 加 `contentClassName` + `title` 改可选（**公共组件，chat 域协同**） |
| 39 | H-11 | PC 附件区上移 Home + ChatInputBar 暴露附件状态（**跨 chat 域，见 S-02**） |
| 40 | H-26 | PC `PlusSheet.tsx` 删「拍照」项 + 网格改 `grid-cols-4 gap-3` |

## 档位 4 · 20 行以上

| 序 | 条目 | 一句话 |
|---|---|---|
| 41 | H-62 | PC `LibraryPicker.tsx` 引入 `date-fns` 依赖 + 换 `formatDistanceToNow` |
| 42 | H-40 | PC `MediaKind` 三态 → 两态（`camera/gallery/file` → `image/file`）+ `PlusAction` 联动 |
| 43 | H-32 | PC `MediaPicker.tsx` image 模式重写为「拍照 + 相册」双按钮 + 双 hidden input |
| 44 | H-53 | PC `LibraryPicker.tsx` 加底部「完成 (N)」按钮（用 BottomSheet footer） |
| 45 | H-19 | PC `ChatInputBar.tsx` 外层卡片重构（`bg-bg-elevated rounded-md px-4 py-3` + 裸 textarea） |
| 46 | H-51 | PC `LibraryPicker.tsx` 多选改造（`onConfirm` + `pendingSelected` + `pendingItems` + `toggleItem` + `handleConfirm`）+ ChatInputBar 加 `insertLibraryMarker` + Home 传 `onConfirm` |

## 档位 5 · 待 gaga 拍板后再排（不占当前工时）

| 序 | 条目 | 一句话 |
|---|---|---|
| 47 | H-02 | PC `Home.tsx` 未登录分支整块缺失（居中 Cody 120px + 居中输入框 + 右上「登录」按钮）—— 随 **S-01** 拍板 |
| 48 | H-25 | PC `+` 点击的未登录拦截 —— 随 **S-01** 拍板（若选 A 则作废） |
| 49 | H-70 | PC 三处未登录拦截（菜单 / `+` / 发送）+ 输入框 blur 150ms 触发 —— 随 **S-01** 拍板（若选 A 则作废） |

---

# §12 汇总统计

| 判定 | 条数 | 明细 |
|---|---|---|
| **缺失** | **14** | H-02、H-03、H-04、H-15、H-16、H-22、H-24、H-25、H-35、H-51、H-52、H-53、H-61、H-70 |
| **形态不同** | **42** | H-01、H-05~H-07、H-09~H-14、H-17~H-21、H-23、H-26、H-28~H-34、H-36、H-38、H-40、H-42~H-46、H-54~H-58、H-60、H-62、H-63、H-65、H-69 |
| **已一致** | **14** | H-08、H-27、H-37、H-39、H-41、H-47、H-48、H-49、H-50、H-59、H-64、H-66、H-67、H-68 |
| **合计** | **70** | |

**缺失 14 条的分布**：
- ✅ 已拍板不还原：2 条（H-03 顶部 ☰+Drawer、H-04 顶部栏容器）—— PC 侧栏常驻已拍板保留
- ⏳ 依附 S-01（未登录态，未拍板）：3 条（H-02 未登录分支、H-25 `+` 未登录拦截、H-70 三处未登录拦截）
- 🔧 真缺失，需实做：9 条（H-15 上传中禁提交、H-16 部分失败 warning、H-22 caption、H-24 disabled 态、H-35 取消按钮、H-51 知识库多选、H-52 勾选框、H-53 完成按钮、H-61 data-testid）

**形态不同 42 条的分布**：
- 纯视觉 / className：约 30 条（档位 1–2，占绝大多数）
- 结构 / 组件 API：约 7 条（H-19 / H-26 / H-29 / H-32 / H-40 / H-44 / H-54）
- 数据通路 / 行为：约 5 条（H-11 / H-17 / H-18 / H-65 / H-63）

**跨域依赖提醒**：
- 本清单 70 条中，有 **17 条**落在 `src/components/chat/ChatInputBar.tsx`（H-10、H-15~H-24、H-41、H-51、H-65、H-18）→ **必须由 chat 域 worker 执行，Home worker 不可单独动**
- 有 **6 条**落在 `src/components/ui/BottomSheet.tsx`（H-29、H-43、H-46、H-53、H-54 + S-05）→ 同样建议 chat 域统一加 prop
- Home 独占可自行施工：**47 条**
