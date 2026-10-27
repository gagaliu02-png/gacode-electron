# HOME 页 · web ↔ PC 逐条对齐清单（align-d-home）

> 产出时间：2026-10-26
> **最近回写：2026-10-26（D 批次 · HOME 页剩余待办收口）** —— 逐条按**当前工作树代码**核实后回写；判定以代码为准，不以任何人的转述为准。
> 上一轮回写：C 批次 `6dc3c3d` 之后（明细见 §13）。
> 真相源：`gacode-web/src/app/page.tsx`（538 行）+ `gacode-web/src/components/chat/ChatInputBar.tsx`（180 行）
> 对照端：`gacode-electron/src/routes/Home.tsx`（381 行）+ `src/components/home/{MediaPicker,PlusSheet,LibraryPicker,EmojiPicker}.tsx` + `src/components/chat/ChatInputBar.tsx`（909 行）+ `src/components/ui/BottomSheet.tsx`（216 行）
> 粒度：最细颗粒度。每个可交互元素 / 视觉差异 / 功能分支 / 数据字段映射单独成条。

## 阅读说明

- **判定**：`缺失`（web 有、PC 没有）· `形态不同`（两边都有但 className / 结构 / 行为不一致，**本轮未改**）· `部分落地`（**已改，但仍有残留差异**）· `已一致`（逐行核对无差异；标 `已一致（commit xxxxxxx）` 表示是哪一轮改到位的）· `已拍板 · PC 不还原`（gaga 已拍板不改）
- **token 前提**：PC `tailwind.config.ts:1-23` 头部注释写明「一字不差同步 gacode-web tailwind.config.ts」，实测 PC 仓**同时**具备 `bg-background` / `text-primary` / `bg-primary` / `border-border` / `rounded-squircle` / `shadow-elevation-3` / `text-headline` / `text-title` / `text-body` / `text-brand` / `text-brand-on` / `bg-bg-sunken` / `bg-bg-elevated` / `text-fg-muted` / `text-fg-subtle`。**所以 web 的 className 串可以逐字抄进 PC**，不需要做 token 改名映射。
- **PC 仓无 `tailwind-merge` / `clsx` / `cva`**：`cn()` 不存在，className 用 `[...].join(" ")` 数组拼接。冲突类名**不会自动去重**，后面的类名在 CSS 里靠源码顺序决胜，radius 之类必须显式写 `!rounded-full` 强制。
- **PC Toast 已支持 `title` / `description` 双字段**（`src/components/ui/Toast.tsx:32-45`：`ToastItem` 有 `title?` / `description?`，`message` 保留为 `title` 的别名向后兼容；commit `5504f93` 落地）⇒ **D-S04 已结案**；剩下要做的是把 HOME 页的**调用点**从单行 `message` 改成双字段（H-42 / H-69）。
- **PC `BottomSheet` 已支持可选 prop**（`src/components/ui/BottomSheet.tsx:64-108`：`title?` / `subtitle?` / `contentClassName?` / `titleClassName?` / `header?` / `hideTitle?` / `maxHeight?`），默认行为不变、其它调用方零改动 ⇒ **D-S05 已结案**。
- **PC 全局禁 CSS 动效**（`src/styles/globals.css:408-414`：`transition-property: none !important` + `animation: none !important`）⇒ web 的 `animate-spin` / `animate-pulse` 在 PC 上是**静态**的。这是 gagaOS 既定规范，**本轮不改**（见 §12「本轮不做」表）。
- **本清单不列 PC 独有的功能**（按 gaga 指令：先 1:1 还原 web，PC 增强不在本清单讨论范围）。已知不计入差异的 PC 独有行为：Home 上的 `/` slash 菜单、拖拽文件上传、粘贴图片上传、ChatInputBar 内的 IME 组合保护（`isComposing`）。
- **表格 / 折叠**：本次范围是 HOME 页，不含 markdown 表格与 `ExpandableCell`；gaga 的「折叠 = 折行 + 可横滑 + 宽度封顶」规则在本页无适用面，不涉及。
- **`react-markdown` 版本坑**：本页无 markdown 渲染，不涉及 web `^9.0.1` / PC `^10.1.0` 的 components 回调签名差异。

> **判定口径（2026-10-27 拍板 · 分层对齐 / 阶梯式收敛）**：三端**不是「立刻一模一样」**，而是分层收敛 —— 安卓 = 0（基线 · 优先上功能）· web = -1（强对齐安卓）· **PC = -2（弱对齐安卓，直接对标 web）** ⇒ **允许 web 落后安卓 1 代、PC 落后 2 代 ⇒ 看到差异 ≠ 立刻拉齐；差异是排期问题，记台账 + 排期即可，不要求当下拉平**（模型出处：markdown 契约 v1.2 §0.2「当前推进规则（三端进度不一致 ⇒ 分层推进）」）。
> - 「**缺失**」（web 有 PC 没有）⇒ 措辞统一为 **「待补 · 排期补，不催」** —— 排进下一批即可，**不是紧急缺陷**。
> - 「**PC 多出**」（PC 有 web 没有）⇒ 措辞统一为 **「PC 多出 · 可保留（-2 容差）」** —— 只有与**终态契约**冲突才收；**但「三端都无的 PC 自创」仍然该删**（安卓也没有 ⇒ 删掉才是往终态收敛）。判断依据按新模型 = **「安卓有没有」优先**。
> - 「**形态不同**」= 两边都有但 className / 结构 / 行为不一致（功能等价也记形态不同，差在哪写清 + 给 web 原文出处）；「**已一致**」= 逐条核到当前代码后无差异。
> - **已拍板保留、不许动**：ChatItem 的 `locale: zhCN`（web 缺 locale 会显示英文，属 web 缺陷）/ `aria-current`（无障碍属性）/ 对话条目的 `isActive` 高亮；PC 全局禁 CSS 动效（`src/styles/globals.css:408-414`）⇒ web 的 `animate-spin` 在 PC 上静态，**不记为差异**；不回退安卓 2026-10-21 修好的表格横滑 / 列宽 clamp 等行为。

## 统计（详见文末 §12）

| 判定 | 条数 |
|---|---|
| 已一致（已落地） | 62 |
| 部分落地（已改 · 仍有残留差异） | 0 |
| 形态不同（未改 · 排期补，不催） | 3 |
| 缺失 · 待补（排期补，不催） | 3 |
| 已拍板 · PC 不还原 | 2 |
| **合计** | **70** |

> 「部分落地」桶**本轮清空**（H-15 / H-16 / H-51 / H-54 全部收口）⇒ 该桶保留在表里但计数为 0，便于跟历史批次对照。

另：§9 结构级差异 7 条 —— **5 条已落地结案**（D-S02 / D-S03 / D-S04 / D-S05 / D-S07）· **1 条按既有决策不改**（D-S06）· **1 条不再需要 gaga 拍**（D-S01 未登录态 —— 分层口径下归 PM 排期，见 §9）。
「PC 侧栏常驻 vs web 抽屉」一项**已拍板保留**，不进 §9。
另：**2 类不计入上表合计**的标注 —— 「本轮不做」2 条 · 「待 gaga 真机看」2 条（见 §12 末尾两张表）。

---

# §1 页面骨架与分支

## H-01　根容器高度与背景 token

- **web**：`gacode-web/src/app/page.tsx:269`　`"min-h-screen flex flex-col bg-background"`
- **PC**：`gacode-electron/src/routes/Home.tsx:301`　`"min-h-screen flex flex-col bg-background"`
- **判定**：**已一致**（**已落地** · commit `5504f93`）
- **怎么改**：**不改**。PC 已改成与 web 逐字一致的 className 串（`min-h-full` → `min-h-screen`，`bg-bg-base` → `bg-background`；两者同值 #000000，写法对齐 web 便于后续 diff 核对）。
- 预估改动：**0 行**

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
  />
  ```
  PC `src/routes/Home.tsx`（381 行）全文没有任何 `isAuthenticated` 分支判断。
- **判定**：**缺失 · 待补（排期补，不催）**（见 §9 D-S01）
- **怎么改**：**本轮未动**。见 §9「D-S01」—— 这不是单文件改动，要拆 ProtectedRoute 语义（改 `App.tsx` 路由守卫 + `Home.tsx` 加分支 + 匿名 AlertDialog），属信息架构级；**不再等 gaga 拍板**，按分层口径归 PM 排期（落法：不现在做，排到「PC 追上 web」那一代）。
- 预估改动：**>200 行（跨 4 文件，排期补）**

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
- **PC**：`PC 缺失` —— `src/routes/Home.tsx` 全文无 `Menu` 图标、无 `Drawer`、无 `drawerOpen` state。PC 侧导航由 AppShell 常驻 sidebar 承担（`src/components/layout/AppShell.tsx` 的 `SIDEBAR_WIDTH = 256`）。
- **判定**：~~缺失~~ → **已拍板 · PC 不还原**
- **怎么改**：**不改**。gaga 2026-10-26 明确拍板：PC 的 256px 常驻侧栏保留，不改成 web 的 Drawer 抽屉。
  - 侧栏**内部内容与交互**照 web 对齐（置顶可折叠分组 / 每条对话 pin 按钮 / 条目视觉形态 / 圆角间距 hover 态 / 计数与折叠箭头）—— **属 ChatList 侧栏域，不在本 HOME 页清单范围**，由该域 worker 承接。
  - 本条**不进**「结构级差异 · 需 gaga 拍」一节（已拍板）。
- 预估改动：**0 行**

## H-04　已登录顶部栏容器（sticky + 毛玻璃）—— ✅ 已拍板 · PC 不还原

- **web**：`gacode-web/src/app/page.tsx:277`　`"sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-border bg-background/80 backdrop-blur-sm"`
- **PC**：`PC 缺失`（PC `src/routes/Home.tsx` 从根 div 直接进欢迎语区，中间没有顶栏）
- **判定**：~~缺失~~ → **已拍板 · PC 不还原**（与 H-03 同因）
- **怎么改**：
  - **不改**。PC 侧由 AppShell 常驻侧栏 + AppShell 头部（已有 `border-b`，见 commit `767ac23 style(electron): AppShell 头部加 border-b 对齐 web (main) Header`）承担全局头部职责，Home 再画一条顶部栏会与 AppShell 重复。
  - 本条**不进**「结构级差异 · 需 gaga 拍」一节（已拍板）。
  - ⚠️ 连带影响：H-05 里 web 的「顶部留白 `pt-10`」在 PC 端本来是「顶栏之下留白」，PC 没有顶栏后 `pt-10` 的视觉含义变成「页面顶部留白 40px」—— **H-05 的 className 改动仍然要做**（`pt-10 pb-6` 保留不变，只是去掉 `justify-center`）。
- 预估改动：**0 行**

## H-05　欢迎语容器布局

- **web**：`gacode-web/src/app/page.tsx:289`　`"pt-10 pb-6 px-4 text-center"` + `:299`　`<div className="flex-1" />`
- **PC**：`gacode-electron/src/routes/Home.tsx:315`　`"pt-10 pb-6 px-4 text-center"` + `:327`　`<div className="flex-1" />`
- **判定**：**已一致**（**已落地** · commit `5504f93`）
- **怎么改**：**不改**。PC 已完成 3 处改动：`justify-center` 删除、加 `text-center`、`lg:px-8` → `px-4`；并在欢迎语 div 之后补上 web 的空态撑高块 `<div className="flex-1" />`（`Home.tsx:327`）。内层 `<div className="flex flex-col items-center gap-4 text-center">`（`Home.tsx:316`）保留。
- 预估改动：**0 行**

## H-06　Cody 头像（图片资源）

- **web**：`gacode-web/src/app/page.tsx:290-294`
  ```tsx
  <img
    src={`${BASE_PATH}/assets/cody/cody_512.png`}
    alt="Cody"
    className="w-16 h-16 rounded-squircle mx-auto mb-4"
  />
  ```
- **PC**：`gacode-electron/src/routes/Home.tsx:317-321`
  ```tsx
  <img
    src={`${import.meta.env.BASE_URL}assets/cody/cody_512.png`}
    alt="Cody"
    className="w-16 h-16 rounded-squircle"
  />
  ```
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）
- **怎么改**：**不改**。已落地内容：
  - **资源**：新增 `gacode-electron/public/assets/cody/cody_512.png`（259,534 bytes；SHA256 `6B4A14CEA8DFBCD90D341B56F4EAA1475C4A840F88CDCD9D0ED09E7B30B5C445`，与 `gacode-web/public/assets/cody/cody_512.png` **逐字节一致**，已实测比对）。
  - **结构**：`Home.tsx` 的文字占位 div（`<div aria-hidden="true">cody</div>`）→ `<img alt="Cody">`。
  - **尺寸**：`w-[72px] h-[72px]` → `w-16 h-16`（64px，与 web 同值）。
  - **圆角**：`rounded-xl` → `rounded-squircle`（22px，与 web 同值）。
  - **`mx-auto mb-4`**：web 头像自带居中 + 16px 下间距；PC 的 `mx-auto` 由父级 `items-center` 等价承担、`mb-4` 由父级 `gap-4`（16px）等价承担（`Home.tsx:316`）。
  - ⚠️ **不要抄 web 的 `${BASE_PATH}`**（Next.js basePath，PC 无此概念）—— PC 用 `import.meta.env.BASE_URL` 拼 `public/` 下的相对路径。
- 预估改动：**0 行**

## H-07　欢迎语文案

- **web**：`gacode-web/src/app/page.tsx:295`
  ```tsx
  <h1 className="text-headline font-medium">HI 我是 <span className="text-primary">cody</span> 很高兴遇见你</h1>
  ```
- **PC**：`gacode-electron/src/routes/Home.tsx:322-324`
  ```tsx
  <h1 className="text-headline font-medium">
    HI 我是 <span className="text-primary">cody</span> 很高兴遇见你
  </h1>
  ```
- **判定**：**已一致**（**已落地** · commit `5504f93`）—— F-08 同步消
- **怎么改**：**不改**。文案已逐字改成 web 的「HI 我是 cody 很高兴遇见你」；`text-brand` → `text-primary`（两 token 同值 #FF6B35）；`displayName` 变量、`const { user } = useAuth();` 与 `useAuth` import **已删除**（PC Home 不再依赖 auth context，登录态仍由 `App.tsx` 的 `<Protected>` 守门，不受影响）。
- 预估改动：**0 行**

## H-08　标题 className

- **web**：`gacode-web/src/app/page.tsx:295`　`"text-headline font-medium"`
- **PC**：`gacode-electron/src/routes/Home.tsx:322`　`"text-headline font-medium"`
- **判定**：**已一致**
- 预估改动：**0 行**

## H-09　已登录分支输入条容器（底部分隔 + 限宽）

- **web**：`gacode-web/src/app/page.tsx:360-361`
  ```tsx
  <div className="border-t border-border p-4 bg-background">
    <div className="max-w-3xl mx-auto">
  ```
- **PC**：`gacode-electron/src/routes/Home.tsx:335-336`
  ```tsx
  <div className="border-t border-border p-4 bg-background">
    <div className="max-w-3xl mx-auto w-full">
  ```
- **判定**：**已一致**（**已落地** · commit `5504f93`）—— F-09 同步消
- **怎么改**：**不改**。`max-w-2xl`（640px）→ `max-w-3xl`（768px，与 web **已登录**分支一致）；`bg-bg-base` → `bg-background`（写法对齐 web）。PC 保留 `w-full`（PC `ChatInputBar` 根 div 本身是 `w-full`，见 `src/components/chat/ChatInputBar.tsx:611`，保留不改变任何渲染结果）。
- 预估改动：**0 行**

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
- **PC**：`gacode-electron/src/routes/Home.tsx:337-353`
  ```tsx
  <ChatInputBar
    ref={inputBarRef}
    isStreaming={false}
    onStop={() => { /* home 无流式 — no-op */ }}
    onSubmit={handleSubmit}
    onAttachmentError={handleAttachmentError}
    onPlusClick={() => setPlusOpen(true)}
    placeholder="说点什么…"
    disabled={createMutation.isPending}
  />
  ```
- **判定**：**已一致**（Home 视角需要的可选 props **全部到位** · commit `5504f93` + `6dc3c3d`）
- **怎么改**：**不改**。本条只要求「Home 需要的可选 props PC ChatInputBar 接受」—— 已全部落地：
  - `placeholder?: string`（`src/components/chat/ChatInputBar.tsx:159`）✅ Home 传 `"说点什么…"`
  - `disabled?: boolean`（`:166`）✅ Home 传 `createMutation.isPending`
  - `caption?: string`（`:164`，默认 `"AI 生成内容请核实重要信息"`）✅ web Home 不传 caption，用默认值即可
  - 受控（web `value`/`onChange`）↔ 非受控（PC 内部自持 state + `onSubmit(text, attachments)`）的 API 形态差异，按 **D-S06 选项 A** **保持不改**。
- 预估改动：**0 行**

---

# §2 附件预览区

## H-11　附件预览容器位置与间距

- **web**：`gacode-web/src/app/page.tsx:306-308`（**在 ChatInputBar 外部，输入条上方，独立一块**）
  ```tsx
  {upload.items.length > 0 && (
    <div className="px-4 pb-2">
      <div className="flex flex-wrap gap-2">
  ```
- **PC**：`gacode-electron/src/components/chat/ChatInputBar.tsx:616-658`（**在 ChatInputBar 内部，输入行上方**）
  ```tsx
  <div className="mx-auto max-w-3xl w-full">
    <div className="flex flex-wrap gap-2 pb-2">
  ```
- **判定**：**形态不同**（**1 处残留：位置**；间距已对齐）
- **怎么改**：**本轮未动**。已对齐的部分：间距 `gap-1.5`（6px）→ `gap-2`（8px）✅（`ChatInputBar.tsx:618`）。
  - **剩下的只有「附件区归属」**：web 把附件预览放在 ChatInputBar **外面**（`page.tsx:306`，是 Home 页自己的 JSX），PC 放在 ChatInputBar **里面**（`ChatInputBar.tsx:616`）⇒ Home 拿不到 `attachments` state，无法自己控制附件区样式。
  - 改法见 §9 **D-S02**（附件 state 归谁 —— **不再等 gaga 拍板**，按分层口径归 PM 排期；落法 = 选 A：ChatInputBar 加 `onAttachmentsChange` 上报回调，Home 只读，~18 行；**已随 `557033e` 落地**）。
  - 两条备选：① ChatInputBar 加 `onAttachmentsChange?: (items: AttachmentItem[]) => void` 上报回调，Home 只读（改动小、不破坏 ChatDetail）；② attachments state 上移到 Home、ChatInputBar 改受控（彻底对齐 web，但 ChatInputBar 大改）。
- **本条状态（2026-10-27 · 代次 1 `557033e`）**：**通道已就位**（ChatInputBar 新增 `onAttachmentsChange` prop + effect 上报；Home 接一份**只读**镜像，以 `data-attachments-count` 暴露在 DOM 上，零视觉变化）；**「附件区本体位置」差异仍未收口**（web 把附件区放在 ChatInputBar **外面**，PC 仍在**里面**）⇒ H-11 仍是「形态不同」，**排期补（归代次 2）**，不催。
- 预估改动：**~18 行（跨 chat 域，见 D-S02）**—— 已完成（`557033e`）

## H-12　上传中进度条

- **web**：`gacode-web/src/app/page.tsx:311-319` 调用 `gacode-web/src/components/ui/progress.tsx:41-74`
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
- **PC**：`gacode-electron/src/components/chat/UploadProgressBar.tsx:36-70`
  ```tsx
  className={[
    "flex items-center gap-2 px-3 py-2 rounded-full bg-bg-elevated",
    className ?? "",
  ].join(" ")}
  ...
  <div className="h-full bg-brand transition-[width] duration-150" ... />
  ```
- **判定**：**形态不同**（**本轮未动** · 仍待做）
- **怎么改**：目标文件 `gacode-electron/src/components/chat/UploadProgressBar.tsx`：
  - `:38` `bg-bg-elevated` → `bg-bg-base`，并追加 `shadow-sm`
    - ⚠️ **冲突类名**：PC 数组拼接没有 tailwind-merge，`bg-bg-elevated` 与 `bg-bg-base` 同属性 ⇒ **必须替换不能追加**
  - `:52` `bg-brand transition-[width] duration-150` → `bg-primary transition-all duration-150 ease-standard`
    - `bg-brand` → `bg-primary`（同值 #FF6B35，写法对齐 web）
    - `transition-[width]` → `transition-all`（同属性 ⇒ 替换）；`ease-standard` 在 PC `tailwind.config.ts:210` 有同名 token
  - 轨道（`:50`）与百分比（`:56-58`）**已与 web 逐字一致**，不用动。
  - ✅ 视觉无风险：PC 输入条外层卡片已恢复 web 的 `bg-bg-elevated`（`ChatInputBar.tsx:664`，H-19 已落地）⇒ 进度条回 `bg-bg-base` 后在卡片上仍可见。
- **⚠️ D 批次（2026-10-26）跳过**：目标文件 `src/components/chat/UploadProgressBar.tsx` **不在本批文件所有权白名单内**（本批只准改 `Home.tsx` / `ChatInputBar.tsx` / `ChatDetail.tsx` / `home/LibraryPicker.tsx` / 本文件），且本条在台账里归属 **chat 域** ⇒ **未动手**，留给 chat 域 worker 收口。
- ℹ️ **2026-10-27 回写**：该文件本轮被 `a7fc845` 触及（X 取消钮的内联 svg 收编进共享 `CloseIcon`，14px / 形状不变）⇒ **本条的 2 处差异（底色 / 填充过渡）仍未收口，判定不变**。
- 预估改动：**2 行**

## H-13　上传完成附件 chip

- **web**：`gacode-web/src/app/page.tsx:321-328` + `gacode-web/src/components/chat/AttachmentChip.tsx`
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
- **PC**：`gacode-electron/src/components/chat/AttachmentChip.tsx:46-55`
  ```tsx
  "inline-flex items-center gap-2 px-3 py-2 rounded-md bg-bg-base shadow-sm max-w-full",
  ```
  缩略图 img（`:68`）：`"w-8 h-8 rounded object-cover shrink-0"`
- **判定**：**已一致**（**已落地** · commit `5504f93`）
- **怎么改**：**不改**。底色已从 PC 自选的 `bg-bg-elevated` 改回 web 的 `bg-bg-base` + `shadow-sm`（**必须与 H-19 同批**，否则 chip 在纯黑底上消失 —— H-19 已随 `5504f93` 落地，两条现在是一致的）。
  - ✅ 旧稿登记的「chat 域在途改动」**已落地**（commit `f57f2ec`，2026-10-27）：PC 多出的「非 image 也渲染 FileText 方块」分支**已删**（`src/components/chat/AttachmentChip.tsx:70-81` 现在只有 web 的两个分支）⇒ 本条**两端同形**，无残留。
- 预估改动：**0 行**

## H-14　上传失败错误 chip

- **web**：`gacode-web/src/app/page.tsx:330-351` + `gacode-web/src/components/common/UploadErrorChip.tsx:40-58`
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
- **PC**：`gacode-electron/src/components/chat/UploadErrorChip.tsx:44-64`
  ```tsx
  <Card className="border-red-200 bg-red-50/60 w-full">
    <CardContent className="!p-3 flex items-center gap-2">
      <AlertTriangleIcon size={16} className="text-red-600 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{fileName}</p>
        <p className="text-xs text-red-700 truncate">上传失败 · {errorMsg}</p>
      </div>
      {onRetry ? <Button variant="ghost" size="sm" onClick={onRetry}>重试</Button> : null}
      {onRemove ? <Button variant="ghost" size="sm" onClick={onRemove}>删除</Button> : null}
    </CardContent>
  </Card>
  ```
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）⚠️ **观感待 gaga 真机看**
- **怎么改**：**不改**。已落地：改用 PC `ui/Card`（`src/components/ui/Card.tsx`，已与 web `card.tsx` 1:1）+ `border-red-200 bg-red-50/60`；图标 `text-red-600`、文案 `text-red-700`；按钮改 `<Button variant="ghost" size="sm">`（PC `src/components/ui/Button.tsx` 已与 web `button.tsx` 1:1）；私有 `AlertTriangleIcon` 删除，改用共享 `src/components/ui/Glyphs.tsx:590` 的 `AlertTriangleIcon`。
  - ⚠️ **两处 PC 特有写法（必需，不是差异）**：`!p-3`（PC 无 tailwind-merge，`CardContent` base 的 `p-6` 在 CSS 产物里排在 `.p-3` 之后，不加 `!` 压不住）；`border-red-200 bg-red-50/60` **不需要** `!`（`bg-card` 排在默认调色板之前，天然赢）。
  - ⚠️ **待 gaga 真机看**：web 用的是**亮色**系错误 chip（亮红底 + 深红字），PC 是纯黑底 ⇒ 亮红 chip 打在黑底上的观感**未在真机验证**（详见 §12「待 gaga 真机看」表）。
- 预估改动：**0 行**

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
- **PC**：`gacode-electron/src/components/chat/ChatInputBar.tsx:469` + `:472-476`
  ```tsx
  const hasUploading = attachments.some((x) => x.kind === "uploading");
  ...
  if (hasUploading) {
    onAttachmentError?.("附件还在上传中, 请稍候几秒再发送");
    return;
  }
  ```
- **判定**：~~部分落地~~ → **已一致**（**已落地** · commit `0424bfe` · D 批次）
- **怎么改**：已落地（commit `5504f93`）：上传中点发送**不再静默丢附件**（F-02 的行为 bug 已消），改为提示 + `return`，附件保留。
  - **残留已消**（D 批次）：toast 变体从 `danger` 改成 web 的 `default`，且改成 **title + description 两段式**。
    - `src/components/chat/ChatInputBar.tsx:485-492`：
      ```tsx
      if (hasUploading) {
        if (onSubmitNotice) {
          onSubmitNotice("附件还在上传中", "default", "请稍候几秒再发送");
        } else {
          onAttachmentError?.("附件还在上传中, 请稍候几秒再发送");
        }
        return;
      }
      ```
    - `src/routes/Home.tsx:239-248`（`handleSubmitNotice` → `toast({ title, description, variant })`）+ `src/routes/Home.tsx:375`（`onSubmitNotice={handleSubmitNotice}`）⇒ **HOME 页**拿到 web 的两段式 + `default` 变体。
  - ⚠️ **共享组件的连带效应（已知 · 不计差异）**：PC 的发送路径是共享 `ChatInputBar`（Home 与 chat 页共用），web 的这个守卫**只在 Home 页** ⇒ PC 的 chat 页也会顺带拦住「上传中就发」。chat 页**不接** `onSubmitNotice`（web chat 页也没这两条 toast）⇒ 回落到 `onAttachmentError`，chat 页提示与改动前**完全一致**（`ChatDetail.tsx:1319`）。
- 预估改动：**0 行（D 批次已落地）**

## H-16　附件区「部分失败仍可发送」warning

- **web**：`gacode-web/src/app/page.tsx:216`、`:228-234`
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
- **PC**：`gacode-electron/src/components/chat/ChatInputBar.tsx:155-159`（prop 声明）+ `:485-492`（上传中守卫）+ `:512-518`（部分失败提示）
  ```tsx
  onSubmitNotice?: (
    title: string,
    variant: "default" | "warning",
    description?: string,
  ) => void;
  ...
  if (hasError) {
    onSubmitNotice?.(
      "部分附件上传失败",
      "warning",
      "已移除失败项, 正在发送其余内容",
    );
  }
  ```
- **判定**：~~部分落地~~ → **已一致**（**已落地** · commit `0424bfe` · D 批次）
- **怎么改**：已落地（commit `5504f93`）：`ChatInputBar` 的 `onSubmitNotice` prop + warning 文案；失败项不带走（只传 `kind === "done"` 的附件）。
  - **残留已消**（D 批次）：**Home 侧接线 + 两段式**。
    - `src/routes/Home.tsx:239-248`：
      ```tsx
      const handleSubmitNotice = useCallback(
        (title: string, variant: "default" | "warning", description?: string) => {
          toast({ title, description, variant });
        },
        [toast],
      );
      ```
    - `src/routes/Home.tsx:375`　`onSubmitNotice={handleSubmitNotice}`
    - `src/components/chat/ChatInputBar.tsx:155-159`　prop 改成 `(title, variant, description?)`（原来只有 `message` + `variant`，拼不出两段式）
    - `src/components/chat/ChatInputBar.tsx:512-518`　触发时传两段：title「部分附件上传失败」/ description「已移除失败项, 正在发送其余内容」/ variant「warning」
  - ✅ **chat 详情页不再弹这条 toast**（web 的 chat 页没有它，它只属于 web 的 Home 页）：`src/routes/ChatDetail.tsx:1307-1309` 留了说明注释，**原 `:1319` 的 `onSubmitNotice` 接线已删除**（该行现在是 `onAttachmentError`）⇒ `onSubmitNotice` 现在**只由 Home 使用**（与 web 一致）。
  - ⚠️ chat 页对失败附件的反馈是**逐文件 chip**（PC 的 `UploadErrorChip` 已与 web 的亮色系对齐，见 H-14）⇒ 两端一致，不靠 toast。
- 预估改动：**0 行（D 批次已落地）**

## H-17　「空文本但有附件」也允许提交

- **web**：`gacode-web/src/app/page.tsx:217`　`if (!content && upload.items.length === 0) return;`
- **PC**：`gacode-electron/src/components/chat/ChatInputBar.tsx:468` + `:479`
  ```tsx
  const hasDoneAttachment = attachments.some((x) => x.kind === "done");
  ...
  if (!trimmed && !hasDoneAttachment) return;
  ```
  （发送按钮的 disabled 条件 `:764-767` 是 `disabled={disabled || (!text.trim() && !attachments.some((x) => x.kind === "done"))}` —— 与 `handleSend` 的判定**同源**，不会再出现「按钮可点但点了没反应」）
- **判定**：**已一致**（**已落地** · commit `5504f93`）—— F-01 同步消
- **怎么改**：**不改**。
- 预估改动：**0 行**

## H-18　提交后附件预览是否清空

- **web**：`gacode-web/src/app/page.tsx:236-239` —— **不清空**（注释明说「这里不重置, 让 user 看到状态到 chat 页前都不丢」）
- **PC**：`gacode-electron/src/routes/Home.tsx:110-115`（`createMutation.onSuccess` 里才清）+ `:181-185`（`handleSubmit` 返回 `false`）+ `src/components/chat/ChatInputBar.tsx:295-298`（`clear()`）+ `:500-506`（`if (ok !== false)` 分支）
  ```tsx
  // Home.tsx onSuccess
  inputBarRef.current?.clear();
  navigate(`/chat/${chat.id}`);
  ...
  // Home.tsx handleSubmit 末尾
  return false;   // ⇒ ChatInputBar 不自行清空
  ```
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）—— F-03 同步消
- **怎么改**：**不改**。已落地：`handleSubmit` 返回 `false` ⇒ ChatInputBar 的 `if (ok !== false)` 分支不执行（文本 / 附件都保留）；真正清空挪到 `createMutation.onSuccess` 里调 `inputBarRef.current?.clear()` ⇒ **createChat 失败时用户可原地重试**，成功才清空并跳转。
- 预估改动：**0 行**

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
- **PC**：`gacode-electron/src/components/chat/ChatInputBar.tsx:662-672`（外层卡片）+ `:692-707`（裸 textarea）
  ```tsx
  <div className={[
    "bg-bg-elevated rounded-md px-4 py-3 flex items-end gap-2",
    "border transition-colors duration-150",
    "focus-within:border-border",
    isStreaming ? "border-brand/40" : "border-transparent",
    disabled && !isStreaming ? "opacity-60" : "",
  ].filter(Boolean).join(" ")}>
  ...
  <textarea className="w-full bg-transparent text-fg placeholder:text-fg-subtle outline-none text-base leading-6 resize-none max-h-32 py-2 disabled:opacity-60 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" />
  ```
- **判定**：**已一致**（**已落地** · commit `5504f93`）
- **怎么改**：**不改**。PC 已改成 web 的「外层卡片包裸 textarea」结构：textarea 自己的 `bg-bg-sunken` / `border` / `border-border` / `rounded-md` / `px-3 py-2` / `text-sm` / `focus:border-brand` 全部删掉，改 `text-base` + `bg-transparent` + `outline-none`；外层卡片补上 `border-transparent` / `focus-within:border-border` / `opacity-60`（disabled）。
  - 保留 PC 既有行为：textarea 仍带 `overflow-y-auto` + 隐藏滚动条（web 不隐藏）—— 属 PC 既有增强，不影响 1:1 判定。
  - 连带：H-13 的 chip 底色回 `bg-bg-base` 依赖本条（输入条底板恢复 `bg-bg-elevated`）—— 两条已在同一批落地。
- 预估改动：**0 行**

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
- **PC**：`gacode-electron/src/components/chat/ChatInputBar.tsx:676-687`
  ```tsx
  className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center"
  ```
  图标：`PlusGlyph`（`:892-909`）`width="20" height="20" strokeWidth="2"`；`aria-label="附件"` / `title="附件"`（`:679-680`）
- **判定**：**已一致**（**已落地** · commit `5504f93`）
- **怎么改**：**不改**。`rounded-md` → `rounded-full`、删掉 `bg-bg-sunken`（web 是「裸圆图标」，PC 原先是灰底圆）、`hover:bg-bg-elevated` → `hover:bg-bg-sunken`、图标 18px/sw1.8 → 20px/sw2、`aria-label` 统一成「附件」。
- 预估改动：**0 行**

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
- **PC**：`gacode-electron/src/components/chat/ChatInputBar.tsx:760-771`
  ```tsx
  className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-full bg-brand text-brand-on hover:bg-brand-hover transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
  ```
  图标：`SendIcon`（`:836-853`）= `m5 12 7-7 7 7` + `M12 19V5`（lucide `arrow-up` 真值）
- **判定**：**已一致**（**已落地** · commit `5504f93`）
- **怎么改**：**不改**。`rounded-md` → `rounded-full`（同属性，**替换不是追加**）、删 `active:opacity-80`、`disabled:opacity-40 disabled:pointer-events-none` → `disabled:opacity-50 disabled:cursor-not-allowed`、纸飞机图标 → lucide `ArrowUp`。
- 预估改动：**0 行**

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
- **PC**：`gacode-electron/src/components/chat/ChatInputBar.tsx:164`（prop）+ `:207`（默认值）+ `:775-791`（渲染）
  ```tsx
  <p className={[
    "mt-2 text-xs text-center flex items-center justify-center gap-1.5",
    isStreaming ? "text-brand" : "text-fg-muted opacity-50",
  ].join(" ")}>
    {isStreaming ? (
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand animate-pulse" aria-hidden="true" />
    ) : null}
    <span>{isStreaming ? "生成中 · 点击停止按钮中断" : caption}</span>
  </p>
  ```
- **判定**：**已一致**（**已落地** · commit `5504f93`）⚠️ 流式圆点在 PC 上**不动**（见 §12「本轮不做」表）
- **怎么改**：**不改**。PC 已加 `caption?: string` prop（默认 `"AI 生成内容请核实重要信息"`，与 web 逐字一致）+ 底部 caption 行 + 流式小圆点。
  - PC 流式时显示的是「生成中 · 点击停止按钮中断」（PC 自有文案），web 直接显示 `caption` —— 属 PC 既有增强，不计差异。
  - ⚠️ `animate-pulse` 被 PC 全局 `animation: none !important` 覆盖（`src/styles/globals.css:408-414`）⇒ PC 上是**静态圆点**。这是 gagaOS 全局禁动效的既有规范，**本轮不改**（见 §12「本轮不做」表）。
- 预估改动：**0 行**

## H-23　输入条 placeholder 文案

- **web**：`gacode-web/src/app/page.tsx:367`（Home 传参）+ `gacode-web/src/components/chat/ChatInputBar.tsx:51`（默认值）　`"说点什么…"`
- **PC**：`gacode-electron/src/routes/Home.tsx:349`　`placeholder="说点什么…"` + `gacode-electron/src/components/chat/ChatInputBar.tsx:159`（prop 声明）+ `:699-704`（使用）
  ```tsx
  placeholder={
    placeholder ??
    (isStreaming
      ? "AI 正在回复..."
      : "说点什么… (Enter 发送，Shift+Enter 换行)")
  }
  ```
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）
- **怎么改**：**不改**。Home 显式传 web 的 `"说点什么…"`，PC ChatInputBar 自己的长提示降级为**默认值**（Home 不传时才用）⇒ HOME 页显示的就是 web 的文案。
  - ℹ️ PC 的 slash 菜单提示文案（`输入 / 触发命令菜单`）随本条一起从 HOME 页消失 —— 但 Home 不传 `onSlashCommand`，`SlashMenu` 不会渲染 ⇒ 删得对。
- 预估改动：**0 行**

## H-24　Home 输入条禁用态（创建中）

- **web**：`gacode-web/src/app/page.tsx:368`　`disabled={createChatMutation.isPending}` → ChatInputBar 外层卡片 `opacity-60`（`ChatInputBar.tsx:89`）
- **PC**：`gacode-electron/src/routes/Home.tsx:352`　`disabled={createMutation.isPending}` + `gacode-electron/src/components/chat/ChatInputBar.tsx:166`（prop）+ `:208`（默认 false）+ `:668`（外层卡片 `opacity-60`）+ `:705`（textarea `disabled={isStreaming || disabled}`）+ `:764-767`（发送按钮 `disabled={disabled || ...}`）
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）
- **怎么改**：**不改**。创建中整条输入条降透明度 + textarea / 发送按钮禁用（web 同款）。
- 预估改动：**0 行**

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
- **PC**：`gacode-electron/src/routes/Home.tsx:345`　`onPlusClick={() => setPlusOpen(true)}` —— 无未登录判断（PC 未登录进不来 Home，见 H-02）
- **判定**：**缺失 · 待补（排期补，不催）**（依附于 H-02 的结构级差异）
- **怎么改**：随 D-S01 一起处理。若按 D-S01 的落法「PC 不做未登录态」，本条**直接作废**（PC 无未登录用户）。**本轮未动**（归 PM 排期，不等 gaga 拍板）。
- 预估改动：**0 行（随 D-S01）**

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
- **PC**：`gacode-electron/src/components/home/PlusSheet.tsx:76` —— **4 项**，网格 4 列
  ```tsx
  <div className="grid grid-cols-4 gap-3 py-5 px-4" data-testid="plus-sheet">
  ```
  4 项（`:77-96`）：图片 / 文件 / 表情 / 挂载知识库
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）
- **怎么改**：**不改**。已落地：
  - 6 项 → **web 的 4 项**：删掉 PC 独有的「拍照」（下沉到 MediaPicker 的 image 模式，见 H-32）与「模板」（web 没有；按「PC 多出 web 没有的直接删」处置）。
  - 网格 `grid grid-cols-3 gap-y-5 gap-x-2 py-4` → `grid grid-cols-4 gap-3 py-5 px-4`（与 web 逐字一致）。
  - `PlusSheet.tsx:69-74` 的 `<BottomSheet title={undefined} contentClassName="!p-0">` —— web 的 `SheetContent` **没有标题栏**（见 H-29），且 web 的内边距挂在 SheetContent 自身（`px-4 py-5`）⇒ PC 容器 `!p-0` 让位、内层 grid 自带 `py-5 px-4`（PC 无 tailwind-merge，只能这样让位）。
  - `PlusAction` 类型收敛为 `"image" | "file" | "emoji" | "library"`（`PlusSheet.tsx:23`）。
  - 图标改用共享 `src/components/ui/Glyphs.tsx`（`ImageIcon` / `FileTextIcon` / `SmileIcon` / `LibraryTypeIcon`，全部 `size={24}` + `w-6 h-6`）。
- 预估改动：**0 行**

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

- **web**：`gacode-web/src/components/chat/SheetActionMenu.tsx:77-93`　lucide 图标全部 `className="w-6 h-6"`（24px，`stroke-width` 默认 2）
- **PC**：`gacode-electron/src/components/home/PlusSheet.tsx:80` / `:84` / `:89` / `:95` —— 4 个图标已改走共享 `src/components/ui/Glyphs.tsx`：
  | 图标 | PC 组件 | 线宽 | 与 web（lucide sw2） |
  |---|---|---|---|
  | 图片 | `ImageIcon`（`Glyphs.tsx:966`） | sw2 | ✅ |
  | 文件 | `FileTextIcon`（`Glyphs.tsx:942`） | sw2 | ✅ |
  | 表情 | `SmileIcon`（`Glyphs.tsx:799`） | sw2 | ✅ |
  | 挂载知识库 | `LibraryTypeIcon`（`Glyphs.tsx:771`） | sw2（调用点显式传 `strokeWidth={2}`） | ✅ |
- **判定**：**已一致**（**已落地** · commit `5504f93` 收编共享 Glyphs + `6dc3c3d` 换图标 + `f57f2ec` 提交前补 `strokeWidth={2}`）
- **怎么改**：**不改**。已落地：PC 的内联 SVG 全部删掉，改走共享 `src/components/ui/Glyphs.tsx`；线宽从 1.8 提到 2，形状与 lucide 一致；4 个图标的线宽现已全部与 web（lucide sw2）一致。
  - ℹ️ 「挂载知识库」图标的 `strokeWidth={2}` 是**在调用点显式传**的（`src/components/home/PlusSheet.tsx:95`），**没有**改 `LibraryTypeIcon` 的默认值（1.6）—— 它还被 `src/components/home/LibraryPicker.tsx:324` 用着（那里跟 web 的 1.6 观感一致）。
  - ✅ 该调用点的改动**已提交**（commit `f57f2ec`，2026-10-27）⇒ 本条不再是「在途」状态，不会退回「知识库图标 sw1.6」。
- 预估改动：**0 行**

## H-29　Sheet 容器形态

- **web**：`gacode-web/src/components/chat/SheetActionMenu.tsx:70-75`
  ```tsx
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent
      side="bottom"
      className="rounded-t-2xl grid grid-cols-4 gap-3 py-5 px-4 border-x-0"
    >
  ```
  + `gacode-web/src/components/ui/sheet.tsx:69-74`（底部抽屉：`inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl` `bg-bg-elevated` `p-6`）+ `:102-109`（右上角**绝对定位** X：`absolute right-4 top-4`）
- **PC**：`gacode-electron/src/components/ui/BottomSheet.tsx:166-172`（容器）+ `:145`（`showTitle`）+ `:196-205`（无标题栏时的 X）
  ```tsx
  <div className={[
    "relative w-full inset-x-0 bottom-0 rounded-t-2xl bg-bg-elevated text-fg shadow-elevation-3 flex flex-col p-6",
    maxHeight ?? "max-h-[85vh]",
    contentClassName ?? "",
  ].join(" ")}>
  ...
  {!showTitle ? (
    <button type="button" aria-label="关闭" onClick={onClose}
      className="absolute right-4 top-4 rounded-sm opacity-70 hover:opacity-100 ...">
      <CloseIcon size={16} />
    </button>
  ) : null}
  ```
- **判定**：**已一致**（**已落地** · commit `5504f93` 底座改底部抽屉形态 + `6dc3c3d` 补无标题栏 X）
- **怎么改**：**不改**。已落地：圆角 `rounded-t-2xl`、**全宽**（底座已删掉 `max-w-2xl`）、`p-6`、`max-h-[85vh]` 与 web 的 `SheetContent` 一致；`title` 改为可选（`undefined` 时不渲染标题栏），无标题栏时补 web 的右上角 X（有标题栏时保持标题栏里的 X ⇒ 不会出现两个 X）。
  - 影响面已核：PlusSheet / MediaPicker / EmojiPicker / chat 的 `PlusActionsSheet` 新增 X（web 同样有）；LibraryPicker / ChatList / Browser / 通知设置面板有标题栏 ⇒ 无变化。
  - ⚠️ **本轮有意不做**（见 §12「本轮不做」表）：web `sheet.tsx:73` 的 `border-t`（没带颜色类 = currentColor 描边，会给**所有**底部面板加一条亮线）与 web `sheet.tsx:86` 的遮罩 `bg-bg-base/80 backdrop-blur-sm`（PC 是 `bg-black/60`）—— 改动会波及 ChatList / Browser / 通知设置等既有调用方。
- 预估改动：**0 行**

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
- **PC**：`gacode-electron/src/routes/Home.tsx:195-212`
  ```tsx
  const handlePlusPick = useCallback((action: PlusAction) => {
    switch (action) {
      case "image":
        setMediaKind("image");
        setTimeout(() => setMediaOpen(true), 100);
        break;
      case "file":
        setMediaKind("file");
        setTimeout(() => setMediaOpen(true), 100);
        break;
      case "emoji":
        setTimeout(() => setEmojiOpen(true), 100);
        break;
      case "library":
        setTimeout(() => setLibraryOpen(true), 100);
        break;
    }
  }, []);
  ```
  + `PlusSheet.tsx:59-62` `handlePick` 先 `onClose()` 再 `onPick(action)`
- **判定**：**已一致**（**已落地** · commit `5504f93`）
- **怎么改**：**不改**。延时 80 → 100 已统一（PC 现有 4 处，全是 100）；表情 / 知识库仍是「`PlusSheet.handlePick` 先 `onClose()` 再派发」，与 web 的 `setSheetOpen(false)` 等价。
- 预估改动：**0 行**

## H-31　Sheet 「挂载知识库」图标形状

- **web**：`gacode-web/src/components/chat/SheetActionMenu.tsx:92`　`<Library className="w-6 h-6" />` = lucide `Library`（书脊造型）
- **PC**：`gacode-electron/src/components/ui/Glyphs.tsx:771-791`　`LibraryTypeIcon`
  ```tsx
  <path d="m16 6 4 14" />
  <path d="M12 6v14" />
  <path d="M8 8v12" />
  <path d="M4 4v16" />
  ```
  （PC 原先是 lucide `ArrowUpDown` 上下箭头造型 —— 形状完全不同）
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）
- **怎么改**：**不改**。已换成 lucide `Library` 书脊造型。
  - ⚠️ **path 真值已核**：`gacode-web/node_modules/lucide-react/dist/esm/icons/library.js`（lucide-react 0.407.0）= `m16 6 4 14` / `M12 6v14` / `M8 8v12` / **`M4 4v16`** —— 本文件旧稿写的 `M4 6v16` 是**错值**，已订正。
- 预估改动：**0 行**

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
  + 隐藏 input：`:254`（相册 / 文件，`accept={modeProp === "file" ? (accept || FILE_ACCEPT) : accept}`）+ `:262-267`（拍照，`accept="image/*" capture="environment"`）
- **PC**：`gacode-electron/src/components/home/MediaPicker.tsx:107-124` —— **两个圆钮**
  ```tsx
  <div className="flex gap-4">
    <button
      type="button"
      onClick={() => cameraFileInputRef.current?.click()}
      className="flex flex-col items-center justify-center gap-2 w-24 h-24 rounded-full bg-white/10 hover:bg-white/20 transition-colors duration-150"
    >
      <CameraIcon size={32} className="text-white" />
      <span className="text-white text-sm">拍照</span>
    </button>
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      className="flex flex-col items-center justify-center gap-2 w-24 h-24 rounded-full bg-white/10 hover:bg-white/20 transition-colors duration-150"
    >
      <ImageIcon size={32} className="text-white" />
      <span className="text-white text-sm">相册</span>
    </button>
  </div>
  ```
  + 双 hidden input：`:137-143`（相册 / 文件）+ `:147-156`（拍照，`accept="image/*" capture="environment"`）
  + file 模式单钮：`:94-101`（`w-40 h-24 rounded-2xl bg-white/10`，与 web `MediaPicker.tsx:212` 一致）
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）—— F-05 同步消
- **怎么改**：**不改**。image 模式已改「拍照 + 相册」双圆钮 + 双 hidden input（拍照带 `capture="environment"` 调起系统后置相机）；file 模式仍是单钮「选择文件」。
  - 连带：`src/components/library/CollectSheet.tsx:299`（Photo 入口）与 `:374-381`（`<MediaPicker kind={pickerKind ?? "image"}>`）已从 `camera` 改成 `image` ⇒ **PC 采集 Sheet 的 Photo 现在也进「拍照 + 相册」双钮面板**（与 web `library/page.tsx:411-422` 一致）。
- 预估改动：**0 行**

## H-33　MediaPicker 视觉基调（黑底白字）

- **web**：`gacode-web/src/components/common/MediaPicker.tsx:198-201`
  ```tsx
  <SheetContent
    side="bottom"
    className="bg-black border-t-0 text-white flex flex-col gap-0 p-0 max-h-[85vh]"
  >
  ```
  → **纯黑底（`bg-black`）+ 白字（`text-white`）**，圆角被去掉（`border-t-0`）
- **PC**：`gacode-electron/src/components/home/MediaPicker.tsx:79-83`
  ```tsx
  <BottomSheet
    open={open}
    onClose={onClose}
    contentClassName="!bg-black !rounded-none !p-0 text-white"
  >
  ```
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）⚠️ **观感待 gaga 真机看**
- **怎么改**：**不改**。已落地：黑底 + 白字 + 无圆角 + 无 padding + 无标题栏。
  - ⚠️ PC 无 tailwind-merge ⇒ 三处 `!` 前缀是**必需**的（`!bg-black` 压过底座 `bg-bg-elevated`；`!rounded-none` 压过 `rounded-t-2xl`；`!p-0` 压过底座 `p-6`）。`border-t-0` 无需处理（PC 底座本来就没有 border）。
  - ℹ️ **D-S07 已结案**：PC 的 `BottomSheet` 底座在 `5504f93` 已改成 web 的底部抽屉形态（**全宽**、无 `max-w-*`）⇒ 原「黑底全宽 vs 灰底限宽」的桌面端冲突**已不存在**。
  - ⚠️ **待 gaga 真机看**：纯黑全宽弹层 + `bg-white/10` 半透明白按钮在 PC 桌面端的观感未在真机验证。
- 预估改动：**0 行**

## H-34　MediaPicker 标题

- **web**：`gacode-web/src/components/common/MediaPicker.tsx:203-205`
  ```tsx
  <h3 className="text-white text-base font-medium mb-2">
    {modeProp === "file" ? "选择文件" : "选择图片来源"}
  </h3>
  ```
  + 外层容器 `:202`　`"flex flex-col items-center gap-4 py-8 px-4"`
- **PC**：`gacode-electron/src/components/home/MediaPicker.tsx:87-89`
  ```tsx
  <h3 className="text-white text-base font-medium mb-2">
    {isFileMode ? "选择文件" : "选择图片来源"}
  </h3>
  ```
  + 外层容器 `:85`　`"flex flex-col items-center gap-4 py-8 px-4"`
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）
- **怎么改**：**不改**。标题从 `BottomSheet` 的 `title` prop 挪进内容区（`MediaPicker.tsx:79-82` 不传 `title` ⇒ 不渲染标题栏）；标题文案按 `kind` 二选一；`META` 表删除；外层容器 padding 与 web 逐字一致。
  - ℹ️ PC 原有的 `META.hint` 说明文案（「调用系统相机拍照后插入图片附件」等，web 没有）已删 —— 它会插在中间破坏与 web 的像素对齐。
- 预估改动：**0 行**

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
- **PC**：`gacode-electron/src/components/home/MediaPicker.tsx:128-134`
  ```tsx
  <button
    type="button"
    onClick={onClose}
    className="text-white/60 hover:text-white/80 text-sm mt-4 transition-colors"
  >
    取消
  </button>
  ```
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）
- **怎么改**：**不改**。底部「取消」文字按钮已补齐（className 与 web 逐字一致）。
- 预估改动：**0 行**

## H-36　MediaPicker file 模式的 accept 白名单

- **web**：`gacode-web/src/app/page.tsx:110`（Home 传给 MediaPicker 的 accept）
  ```tsx
  setPickerAccept(".pdf,.doc,.docx,.txt,.md,.zip,.json,.png,.jpg,.jpeg,.gif,.webp");
  ```
  + `gacode-web/src/components/common/MediaPicker.tsx:254`
  ```tsx
  accept={modeProp === "file" ? (accept || FILE_ACCEPT) : accept}
  ```
  → **web 实际生效的 file accept = Home 传的这串**（因为 `accept || FILE_ACCEPT` 里 `accept` 非空，组件内置的 `FILE_ACCEPT`（`MediaPicker.tsx:45` = `.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv`）被绕过）：
  `.pdf,.doc,.docx,.txt,.md,.zip,.json,.png,.jpg,.jpeg,.gif,.webp`
- **PC**：`gacode-electron/src/components/home/MediaPicker.tsx:45`
  ```tsx
  const FILE_ACCEPT = ".pdf,.doc,.docx,.txt,.md,.zip,.json,.png,.jpg,.jpeg,.gif,.webp";
  ```
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）⚠️ **后端 mime 白名单待核（服务端缺口）**
- **怎么改**：**不改**。PC 已从 `.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv` 改成 web **实际生效**的那串。
  - ⚠️ **服务端缺口**：`.zip` / `.json` 是否被后端 `/yinian/documents` 的 mime 白名单接受**未核**（`unified-api` 不在本清单可读范围）⇒ 放宽后若被拒，由 `uploadAttachment` 的 `humanizeUploadError` 弹人话错误（PC 已有此机制，见 `src/routes/Home.tsx:268-274`）。
- 预估改动：**0 行**

## H-37　MediaPicker image 模式 accept

- **web**：`gacode-web/src/app/page.tsx:107`　`setPickerAccept("image/*")` + `gacode-web/src/components/common/MediaPicker.tsx:266`　`accept="image/*"`
- **PC**：`gacode-electron/src/components/home/MediaPicker.tsx:59`　`const accept = kind === "file" ? FILE_ACCEPT : "image/*";`（用在 `:141` 的隐藏 input）
- **判定**：**已一致**
- 预估改动：**0 行**

## H-38　MediaPicker 关闭时清 input value

- **web**：`gacode-web/src/components/common/MediaPicker.tsx:171-176`
  ```tsx
  useEffect(() => {
    if (!open) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraFileInputRef.current) cameraFileInputRef.current.value = "";
    }
  }, [open]);
  ```
- **PC**：`gacode-electron/src/components/home/MediaPicker.tsx:52-57`
  ```tsx
  useEffect(() => {
    if (!open) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraFileInputRef.current) cameraFileInputRef.current.value = "";
    }
  }, [open]);
  ```
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）
- **怎么改**：**不改**。随 H-32 的双 input 改造一并补齐（PC 原来只有 1 个 input）。
- 预估改动：**0 行**

## H-39　MediaPicker `onCapture` 后关闭面板

- **web**：`gacode-web/src/components/common/MediaPicker.tsx:178-186`
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
- **PC**：`gacode-electron/src/components/home/MediaPicker.tsx:62-69`
  ```tsx
  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    onCapture(f);
    onClose();
  };
  ```
- **判定**：**已一致**（顺序略有差别：web 先 `onCapture` 后 `onOpenChange(false)` 再清 value；PC 先清 value 再 `onCapture` 再 `onClose`；最终态相同）
- 预估改动：**0 行**

## H-40　PC MediaPicker 的 `kind` 与 web 的 `mode` 映射

- **web**：`gacode-web/src/app/page.tsx:416`　`mode={pickerKind === "file" ? "file" : "image"}`，`pickerKind` 只有 `"image" | "file"` 两态
- **PC**：`gacode-electron/src/components/home/MediaPicker.tsx:32`　`export type MediaKind = "image" | "file";` + `gacode-electron/src/routes/Home.tsx:99`　`useState<MediaKind>("image")` + `:85-87`　`pickUploadMode`（`image → image` / `file → document`）+ `:195-212`　`handlePlusPick`（`image` / `file` / `emoji` / `library` 四 case）
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）
- **怎么改**：**不改**。PC 原来的 `camera` / `gallery` / `file` 三态已收敛为 web 的两态（「拍照」下沉进 MediaPicker 的 image 模式，见 H-32）；`PlusAction` 同步收敛（`PlusSheet.tsx:23`）。
- 预估改动：**0 行**

## H-41　PC 侧 50MB 上限拦截

- **web**：`gacode-web/src/hooks/useAttachmentUpload.ts` —— `uploadAttachment` 内部做 size 校验（web `lib/api.ts` 的 `uploadAttachment`），**web Home 不前置拦截**
- **PC**：`gacode-electron/src/routes/Home.tsx:78`　`const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;` + `:247-253`
  ```tsx
  if (file.size > MAX_ATTACHMENT_BYTES) {
    toast({
      message: `文件超过 50MB 上限 (${Math.round(file.size / 1024 / 1024)}MB)`,
      variant: "danger",
    });
    return;
  }
  ```
  + 注释说明 `uploadAttachment` 的 size 校验是**同步 throw**，不在 promise 链里，必须前置拦截
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
- **PC**：`gacode-electron/src/components/ui/Toast.tsx:32-45`（**已支持 `title` / `description`**，commit `5504f93`；`message` 保留为 `title` 的别名，向后兼容旧调用点）+ `gacode-electron/src/routes/Home.tsx:299`（**D 批次已改成双字段**）
  ```tsx
  toast({ title: "上传失败", description: msg, variant: "danger" });
  ```
- **判定**：~~形态不同~~ → **已一致**（**已落地** · commit `0424bfe` · D 批次）
- **怎么改**：目标文件 `gacode-electron/src/routes/Home.tsx`（**只剩这 1 处调用点**）：
  - `:292` `const msg = err instanceof Error ? err.message : String(err);` 保留
  - `:299` `toast({ message: msg, variant: "danger" })` → `toast({ title: "上传失败", description: msg, variant: "danger" })`
  - ⚠️ **`Home.tsx` 的注释说「Home 不再二次加『上传失败: 』前缀」** —— 改双字段后 `title` 就是「上传失败」、`description` 放原始 msg ⇒ **不会**出现「上传失败: 图片上传失败: ...」双前缀（原始 msg 直接进 description）。
  - ℹ️ §9 的 **D-S04（Toast 双字段）已结案**（`5504f93` 落地），本条剩下的只是调用点这 1 行。
- 预估改动：**0 行（D 批次已落地）**

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
- **PC**：`gacode-electron/src/components/home/EmojiPicker.tsx:140-145`
  ```tsx
  <BottomSheet
    open={open}
    title={undefined}
    onClose={handleClose}
    maxHeight="max-h-[70vh]"
    contentClassName="!p-0 !gap-0"
    header={...}
  >
  ```
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）
- **怎么改**：**不改**。最大高走 `BottomSheet` 的独立 `maxHeight` prop —— **传了就不输出**底座的 `max-h-[85vh]`（`src/components/ui/BottomSheet.tsx:93-107` 注释：实测产物里 `.max-h-[70vh]`（line 557）早于 `.max-h-[85vh]`（line 565），两处同时输出时底座会赢 ⇒ 改成「传了就替换」，结果与 CSS 产物顺序无关）；`!p-0` 压过底座 `p-6`、`!gap-0` 显式声明。
- 预估改动：**0 行**

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
- **PC**：`gacode-electron/src/components/home/EmojiPicker.tsx:150-160`
  ```tsx
  <div className="px-4 pt-5 pb-3 border-b border-border">
    <div className="relative">
      <SearchFieldIcon />
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜索表情 (例如: 笑 / heart)"
        className="w-full pl-9 pr-3 py-2 rounded-md bg-bg-sunken text-fg placeholder:text-fg-subtle outline-none focus:ring-1 focus:ring-brand"
      />
    </div>
  ```
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）
- **怎么改**：**不改**。Search 图标 / `pl-9` / `focus:ring-1 focus:ring-brand` / 去 `text-sm` 全部到位；图标改用共享 `src/components/ui/Glyphs.tsx:616` 的 `SearchFieldIcon`（lucide `search`，16px/sw2，自带 `absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted`）—— 与 H-58 共用同一个组件，**不重复实现**。
- 预估改动：**0 行**

## H-45　EmojiPicker 分类 tab 位置

- **web**：`gacode-web/src/components/chat/EmojiPicker.tsx:154`
  ```tsx
  <div className="flex gap-2 mt-3">
  ```
- **PC**：`gacode-electron/src/components/home/EmojiPicker.tsx:162`　`<div className="flex gap-2 mt-3">`
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）
- **怎么改**：**不改**。分类 tab 容器已补 `mt-3`；web 的容器没有 `space-y-*`（tab 自带 `mt-3`），PC 也去掉了 `space-y-3` ⇒ 不会双份间距。
- 预估改动：**0 行**

## H-46　EmojiPicker 网格区横向内边距与滚动

- **web**：`gacode-web/src/components/chat/EmojiPicker.tsx:175`　`<div className="flex-1 overflow-y-auto px-4 py-3">`（搜索框 + 分类 tab 在 `SheetContent` 的固定头部，不跟着滚）
- **PC**：`gacode-electron/src/components/home/EmojiPicker.tsx:188`　`<div className="flex-1 overflow-y-auto px-4 py-3">`；搜索框 + 分类 tab 走 `BottomSheet` 的 `header` prop（`EmojiPicker.tsx:146-184` → `src/components/ui/BottomSheet.tsx:206` 的 `<div className="shrink-0">{header}</div>`，固定在滚动区 `:207` 之外）
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）—— 旧稿的「彻底版（走 D-S05）」已完成
- **怎么改**：**不改**。PC 走 `BottomSheet` 的 `header` 通道 ⇒ 与 web 的「头部固定 + 网格独立滚动」结构一致，且没有双层滚动条（旧稿担心的 `BottomSheet.tsx:56` 外层滚动问题不存在了）。
- 预估改动：**0 行**

## H-47　EmojiPicker 选中后关闭面板

- **web**：`gacode-web/src/components/chat/EmojiPicker.tsx:186-189`
  ```tsx
  onClick={() => {
    onSelect(e.emoji);
    handleOpenChange(false);
  }}
  ```
- **PC**：`gacode-electron/src/components/home/EmojiPicker.tsx:199-205`　`onSelect(e.emoji); handleClose();` —— 组件自身关面板（`handleClose` 同时清 search，见 `:125-128`）
- **判定**：**已一致**（关闭动作位置不同，最终行为相同）
- 预估改动：**0 行**

## H-48　EmojiPicker 空态

- **web**：`gacode-web/src/components/chat/EmojiPicker.tsx:176-180`　`<div className="text-center text-fg-muted py-8 text-sm">没有匹配的表情</div>`
- **PC**：`gacode-electron/src/components/home/EmojiPicker.tsx:189-192`　`<div className="text-center text-fg-muted py-8 text-sm">没有匹配的表情</div>`
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
- **PC**：`gacode-electron/src/components/home/EmojiPicker.tsx:207`　`"w-10 h-10 rounded-md text-2xl hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center"`（`aria-label={e.keywords[0]}` 在 `:206`）
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
- **PC**：`gacode-electron/src/components/home/EmojiPicker.tsx:125-128`
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

- **web**：`gacode-web/src/components/chat/LibraryPicker.tsx:63-75`（props）+ `:121-149`（`toggleItem`）+ `:280-292`（checkbox）+ `:300-320`（完成按钮）
  ```tsx
  onConfirm?: (items: LibraryItem[]) => void;
  /** 旧单选回调 (向下兼容). 若同时传了 onConfirm, 这个不会被调用. */
  onSelect?: (item: LibraryItem) => void;
  ```
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:44-51`（props 同款）+ `:106-127`（`toggleItem`）+ `:130-134`（`handleConfirm`）+ `:137-142`（打开时清累积）+ `:283-295`（checkbox）+ `:195-214`（完成按钮）
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
  + Home 侧：`gacode-electron/src/routes/Home.tsx:321-324`（`handleLibrarySelect`）+ `:411`（`<LibraryPicker onSelect={handleLibrarySelect} />`）+ `gacode-electron/src/components/chat/ChatInputBar.tsx:126`（`insertLibraryMarker` 声明）+ `:242-262`（实现，带分隔符）
- **判定**：~~部分落地~~ → **已一致**（**已落地** · commit `0424bfe` · D 批次）
- **怎么改**：已落地（commit `5504f93`）：PC 的 LibraryPicker **组件**与 web 的组件 1:1（`onConfirm` 多选 + `pendingSelected` / `pendingItems` / `toggleItem` / `handleConfirm` / checkbox / 完成按钮 / 打开时清累积）；Home 侧注入 `@[library:id] title` marker 走 `insertLibraryMarker`（**带分隔符**，与 web `page.tsx:402-407` 同款，不是裸 `insertText`）。
  - **残留已消**（D 批次 · gaga 2026-10-26 21:35 口径「PC 有 web 没有的必须删」）：
    - `src/routes/Home.tsx:321-324`　`handleLibraryConfirm`（多选 ⇒ 合并 marker）**换成** `handleLibrarySelect`（单选）：
      ```tsx
      const handleLibrarySelect = useCallback((item: LibraryItem) => {
        inputBarRef.current?.insertLibraryMarker?.(item.id, item.title);
        setLibraryOpen(false);
      }, []);
      ```
    - `src/routes/Home.tsx:411`　`<LibraryPicker onSelect={handleLibrarySelect} />`（**不再传 `onConfirm`**）⇒ 勾选框（H-52）与底部「完成」按钮（H-53）在 HOME 页**自动消失**，副标题切成 web 单选模式的「选中后将插入到消息」—— 与 web Home 完全一致。
    - marker 文案与分隔符规则**逐字照抄 web**（web `app/page.tsx:402-407` 的 `sep` 逻辑 = PC `ChatInputBar.insertLibraryMarker` 的 `sep` 逻辑）。
  - ℹ️ **多选能力没有被删掉**：PC 的 chat 页走 `KnowledgeAttachSheet`（`src/components/chat/KnowledgeAttachSheet.tsx:34`）⇒ 仍传 `onConfirm` ⇒ **多选链路完整保留**（与 web 的 chat 页多选同构）。
- 预估改动：**0 行（D 批次已落地）**

## H-52　LibraryPicker 勾选框

- **web**：`gacode-web/src/components/chat/LibraryPicker.tsx:280-292`
  ```tsx
  {onConfirm && (
    <div
      className={cn(
        "shrink-0 w-5 h-5 rounded border flex items-center justify-center",
        checked ? "bg-brand border-brand text-brand-on" : "border-border bg-background"
      )}
      aria-hidden="true"
    >
      {checked && <Check className="w-3.5 h-3.5" />}
    </div>
  )}
  ```
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:283-295`
  ```tsx
  {onConfirm ? (
    <div
      className={[
        "shrink-0 w-5 h-5 rounded border flex items-center justify-center",
        checked ? "bg-brand border-brand text-brand-on" : "border-border bg-background",
      ].join(" ")}
      aria-hidden="true"
    >
      {checked ? <CheckGlyph /> : null}
    </div>
  ) : null}
  ```
  （`CheckGlyph` = `src/components/ui/Glyphs.tsx:637`，lucide `check` 14px/sw3）
- **判定**：**已一致**（**已落地** · commit `5504f93`）
- **怎么改**：**不改**。勾选框的尺寸 / 圆角 / 选中态 className 与 web 逐字一致；图标走共享 Glyphs。
- 预估改动：**0 行**

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
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:195-214`（走 `BottomSheet` 的 `footer` prop）+ `gacode-electron/src/components/ui/BottomSheet.tsx:208-212`（footer 容器 `"flex items-center justify-end gap-2 mt-0 pt-3 border-t border-border shrink-0"`）
  ```tsx
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
  ```
- **判定**：**已一致**（**已落地** · commit `5504f93`）
- **怎么改**：**不改**。按钮 className / `data-testid` / `disabled` 条件与 web 逐字一致；`BottomSheet` 的 footer 容器补了 web 的 `border-t border-border` 分隔线（PC 原先是 `mt-3`，现为 `mt-0 pt-3`）。
- ℹ️ **D 批次连带**：LibraryPicker 改用 web 的 sheet 内边距归属（`!p-0`，见 H-54）⇒ footer 的横向内边距不再由 `BottomSheet` 的 `p-6` 承担，改由 `src/components/home/LibraryPicker.tsx:217` 的 `<div className="w-full px-4 pb-3">` 承担 ⇒ 与 web `components/chat/LibraryPicker.tsx:301` 的 `px-4 py-3` 一致（顶部 12px 由 `BottomSheet` footer 容器的 `pt-3` 承担）。**按钮自身的 className 未动。**
- 预估改动：**0 行**

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
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:172-178`（**自绘标题行**，走 `BottomSheet` 的 `header` 通道）
  ```tsx
  <div className="px-4 pt-5 pb-3 border-b border-border space-y-3">
    <div className="flex items-center justify-between">
      <h3 className="text-base font-medium">选择知识库</h3>
      <span className="text-xs text-fg-muted">
        {onConfirm ? "可多选, 点完成提交" : "选中后将插入到消息"}
      </span>
    </div>
  ```
  （配套：`src/components/home/LibraryPicker.tsx:157` `hideTitle`（只留 `title` 作 aria-label，不画内置标题栏）+ `:164` `contentClassName="!p-0 !gap-0"`）
- **判定**：~~部分落地~~ → **已一致**（**已落地** · commit `0424bfe` · D 批次）
- **怎么改**：已落地（commit `6dc3c3d`）：标题「挂载知识库」→ web 的「选择知识库」；副标题按模式二选一（多选 `可多选, 点完成提交` / 单选 `选中后将插入到消息`），与 web 逐字一致。
  - **残留 1 已消**（D 批次 · 副标题位置）：web 的副标题在**标题同一行右侧**（`flex items-center justify-between`）⇒ PC 改成**自绘**标题行（放进 `BottomSheet` 的 `header` 通道），不再用内置 `title` / `subtitle`（内置的副标题落在标题**下一行**，`BottomSheet.tsx:183-185`）。
    - `src/components/home/LibraryPicker.tsx:157` 加 `hideTitle`：`title` 只作 `aria-label`，内置标题栏不画 ⇒ 右上角关闭键走 web `components/ui/sheet.tsx:102-109` 的**绝对定位 X**（PC 原本是标题栏里的「×」按钮）。
  - **残留 2 已消**（D 批次 · 头部容器 padding）：`src/components/home/LibraryPicker.tsx:172` 头部容器 = web 的 `"px-4 pt-5 pb-3 border-b border-border space-y-3"`（原 PC 是 `"px-1 pt-1 pb-3 border-b border-border space-y-2"`）。
    - ⚠️ **前置条件**：要让 `px-4` / `pt-5` 真正等于 web 的 16px / 20px，必须先让 sheet 容器不再自带 `p-6` ⇒ `src/components/home/LibraryPicker.tsx:164` 加 `contentClassName="!p-0 !gap-0"`（对齐 web `components/chat/LibraryPicker.tsx:162` 的 `p-0`）。
    - 内边距归属随之改成 web 的三段式：头部 `px-4 pt-5 pb-3` · 列表容器 `px-4 py-3`（`LibraryPicker.tsx:240`）· footer `px-4 pb-3`（`LibraryPicker.tsx:217`，顶部 12px 由 `BottomSheet` footer 容器的 `pt-3` 承担）。
- 预估改动：**0 行（D 批次已落地）**

## H-55　LibraryPicker 列表项形态

- **web**：`gacode-web/src/components/chat/LibraryPicker.tsx:250-254`
  ```tsx
  className={cn(
    "w-full flex items-center gap-3 p-3 rounded-lg",
    "border bg-bg-sunken hover:bg-bg-base transition-colors text-left",
    checked ? "border-brand bg-brand/5" : "border-border"
  )}
  ```
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:252-256`
  ```tsx
  className={[
    "w-full flex items-center gap-3 p-3 rounded-lg",
    "border bg-bg-sunken hover:bg-bg-base transition-colors text-left",
    checked ? "!border-brand bg-brand/5" : "border-border",
  ].join(" ")}
  ```
- **判定**：**已一致**（**已落地** · commit `5504f93`）
- **怎么改**：**不改**。圆角 `rounded-md` → `rounded-lg`；选中态改成条件 className。
  - ⚠️ PC 用 `!border-brand` 强制（PC 无 tailwind-merge，`border-brand` 压不住 `border-border`）—— 这是 PC 必需的写法，不是差异。
- 预估改动：**0 行**

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
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:315-326`　`TypeIcon`
  ```tsx
  case "image": return <ImageTypeIcon />;                                   // ui/Glyphs.tsx:680 → text-brand-cyan
  case "doc":   return <DocTypeIcon />;                                     // ui/Glyphs.tsx:702 → text-brand
  case "link":  return <LinkCronIcon />;                                    // ui/Glyphs.tsx:736 → text-cron（紫）
  default:      return <LibraryTypeIcon className="w-5 h-5 text-fg-muted" />; // ui/Glyphs.tsx:771（书脊造型）
  ```
  + token：`gacode-electron/tailwind.config.ts:79`　`cron: "#a78bfa"`（web 私有 `--color-cron`）
  + 容器：`LibraryPicker.tsx:258` 已删掉 `text-fg-muted`（web 的容器也不写文字色，靠图标自带）
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）—— F-11 同步消
- **怎么改**：**不改**。link 已是 web 的紫（`text-cron`，PC 补了 `cron` token）；default 已是 lucide `library` 书脊造型（path 真值见 H-31）。
  - ⚠️ **两个 link 图标并存且必须分开**：`LinkCronIcon`（紫，**只给 LibraryPicker 用**）vs `LinkTypeIcon`（绿，`src/components/ui/Glyphs.tsx:830`）—— 后者被知识库列表页 / `src/routes/LibraryDetail.tsx` 用着（web 的 `app/(main)/library/page.tsx:124` 就是绿的），**两处不可混用**。
  - 顺带：标签 chip 改用 web 的 `<Badge variant="secondary" className="!text-[10px]">`（`LibraryPicker.tsx:275`；PC `src/components/ui/Badge.tsx` 已与 web `badge.tsx` 1:1）。
- 预估改动：**0 行**

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
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:229-240`
  ```tsx
  <div className="flex flex-col items-center justify-center py-12 gap-3 text-fg-muted">
    <LibraryIcon />
    <div className="text-sm">
      {search.trim()
        ? `没有匹配 "${search}" 的知识库`
        : "知识库还空空如也,去采集点内容吧"}
    </div>
  </div>
  ```
  （`LibraryIcon` = `src/components/ui/Glyphs.tsx:657`，**自带** `w-10 h-10 opacity-40` ⇒ 渲染结果与 web 逐字等价）
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）
- **怎么改**：**不改**。
- 预估改动：**0 行**

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
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:163-172`
  ```tsx
  <div className="relative">
    <SearchFieldIcon />
    <input
      type="text"
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      placeholder="搜索知识库标题"
      className="w-full pl-9 pr-3 py-2 rounded-md bg-bg-sunken text-fg placeholder:text-fg-subtle outline-none focus:ring-1 focus:ring-brand"
    />
  </div>
  ```
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）
- **怎么改**：**不改**。与 H-44 **共用同一个** `SearchFieldIcon`（`src/components/ui/Glyphs.tsx:613`）⇒ 不重复实现（符合 gaga 2026-10-22「组件意识」要求）。
- 预估改动：**0 行**

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
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:173-192` —— **逐字一致**（仅 PC 多了 `duration-150`）
- **判定**：**已一致**
- 预估改动：**0 行**

## H-60　LibraryPicker 类型 tab 切换时清 search

- **web**：`gacode-web/src/components/chat/LibraryPicker.tsx:196`　`onClick={() => setTypeFilter(t.key)}` —— **切 tab 不清 search**
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:180`　`onClick={() => setTypeFilter(t.key)}`（PC 原来的 `handleTypeChange`（会 `setSearch("")`）已删除）
- **判定**：**已一致**（**已落地** · commit `5504f93`）—— F-10 同步消
- **怎么改**：**不改**。切 tab 不再清搜索词，与 web 一致。
- 预估改动：**0 行**

## H-61　LibraryPicker 列表 key 与 data-testid

- **web**：`gacode-web/src/components/chat/LibraryPicker.tsx:248-249`
  ```tsx
  data-testid="library-picker-item"
  data-item-id={item.id}
  ```
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:250-251`
  ```tsx
  data-testid="library-picker-item"
  data-item-id={item.id}
  ```
- **判定**：**已一致**（**已落地** · commit `5504f93`）
- **怎么改**：**不改**。
- 预估改动：**0 行**

## H-62　LibraryPicker 相对时间

- **web**：`gacode-web/src/components/chat/LibraryPicker.tsx:232-240`　`formatDistanceToNow(d, { addSuffix: true, locale: zhCN })` → 「3 分钟前」「大约 2 个月前」
- **PC**：`gacode-electron/src/components/home/LibraryPicker.tsx:20-21`（import）+ `:58-66`（实现）+ `:266`（调用点）
  ```tsx
  import { formatDistanceToNow } from "date-fns";
  import { zhCN } from "date-fns/locale";
  ...
  function formatRelative(iso: string): string {
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      return formatDistanceToNow(d, { addSuffix: true, locale: zhCN });
    } catch {
      return "";
    }
  }
  ```
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）
- **怎么改**：**不改**。PC 手写的 mini `formatRelative`（>30 天给具体日期）已换成 date-fns（>30 天给「大约 X 个月前」），与 web 输出一致。
  - ℹ️ **没有新增依赖** —— `date-fns@4.4.0` 是 `5504f93` 就进了 `package.json` 的既有依赖，C 批次只是**用它**。
  - ⚠️ date-fns v4 的 locale 入口是 `date-fns/locale`（**不是** v2 的 `date-fns/locale/zh-CN`）。
- 预估改动：**0 行**

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
- **PC**：`gacode-electron/src/routes/Home.tsx:66-67`（key 定义）+ `:110-115`（`onSuccess: (chat) => { inputBarRef.current?.clear(); navigate(`/chat/${chat.id}`); }`）+ `:164-166`（`sessionStorage.setItem(HOME_FIRST_MESSAGE_KEY, firstMsg)`）
  → **firstMessage 走 sessionStorage**
- **判定**：**形态不同**（**机制不同，但两边都「端到端自洽」**：web 的 chat 页读 query，PC 的 chat 页读 sessionStorage）
- **怎么改**：**建议不改**（**本轮未动**）。
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
- **PC**：`gacode-electron/src/routes/Home.tsx:166-175`
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

- **web**：`gacode-web/src/app/page.tsx:168-179`
  ```tsx
  for (const it of doneItems) {
    if (it.mode === "image" && it.url) imageUrls.push(it.url);
    if (it.mode === "document" && it.fileId) {
      attachedFileIds.push(it.fileId);
      attachedFileNames.push({ fileId: it.fileId, name: it.file.name });
    }
  }
  ```
  → **按显式 `it.mode` 分流**（2026-10-16 M-doc bug 修复）
- **PC**：`gacode-electron/src/routes/Home.tsx:138-148`
  ```tsx
  for (const att of attachments) {
    const mode = att.mode ?? (att.fileId ? "document" : "image");
    if (mode === "image" && att.url) {
      imageUrls.push(att.url);
    } else if (mode === "document" && att.fileId) {
      attachedFileIds.push(att.fileId);
      attachedFileNames.push({ fileId: att.fileId, name: att.name });
    }
  }
  ```
  + mode 的来源链：`gacode-electron/src/components/chat/ChatInputBar.tsx:106`（`PendingAttachment.mode?: UploadMode`）→ `:285`（`addAttachment` 写入 `att.mode ?? (att.fileId ? "document" : "image")`）→ `:426`（拖拽上传写 mode）→ `:489`（`doneAtts` 带 `mode: x.mode`）；`gacode-electron/src/routes/Home.tsx:266`（`addAttachment` 显式传 `mode: pickUploadMode(mediaKind)`）
- **判定**：**已一致**（**已落地** · commit `6dc3c3d`）
- **怎么改**：**不改**。已落地：PC 从 `att.url && !att.fileId` 启发式改成**显式按 mode 分流**，与 web 一样；`?? (att.fileId ? "document" : "image")` 兜底**保留**（老数据 / 手工构造的 attachment 没有 mode ⇒ 少了兜底两个分支都不进，附件会静默丢失）。
  - 文本 fallback（`descs`）同步改成按 mode 判断（`Home.tsx:153-159`），输出与 web 逐字相同（见 H-66）。
- 预估改动：**0 行**

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
- **PC**：`gacode-electron/src/routes/Home.tsx:153-161`
  ```tsx
  const descs = attachments
    .map((att) => {
      const mode = att.mode ?? (att.fileId ? "document" : "image");
      if (mode === "image" && att.url) return `[图片: ${att.url}]`;
      if (mode === "document" && att.fileId) return `[附件: ${att.name}]`;
      return "";
    })
    .filter(Boolean);
  const firstMsg = [content, ...descs].filter(Boolean).join("\n");
  ```
- **判定**：**已一致**（格式串 `[图片: URL]` / `[附件: 文件名]` **逐字相同**，拼接顺序 `content` 在前、`\n` 分隔、`.filter(Boolean)` 去空 —— 全部一致；判定条件也已随 H-65 改成按 mode）
- 预估改动：**0 行**

## H-67　无附件时不写 sessionStorage

- **web**：`gacode-web/src/app/page.tsx:182` —— `doneItems.length === 0` 直接返文本，不写 sessionStorage
- **PC**：`gacode-electron/src/routes/Home.tsx:166` —— `if (imageUrls.length > 0 || attachedFileIds.length > 0)` 才写
- **判定**：**已一致**
- 预估改动：**0 行**

## H-68　createChat 参数

- **web**：`gacode-web/src/app/page.tsx:70-72`
  ```tsx
  // R7 P6 对齐: 不再手动截前 30 字做 title — server service 兜底 '新对话',
  // ChatDetail 进页时由 useEffect 异步调 autoTitleSession 覆盖.
  mutationFn: (_firstMsg: string) => createChat(),
  ```
- **PC**：`gacode-electron/src/routes/Home.tsx:109`　`mutationFn: () => createChat()` —— **同样不传 title**
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
- **PC**：`gacode-electron/src/components/ui/Toast.tsx:32-45`（**已支持 `title` / `description`**，commit `5504f93`）+ `gacode-electron/src/routes/Home.tsx:121`（**D 批次已改成双字段**）
  ```tsx
  onError: (err) => {
    toast({
      title: "创建对话失败",
      description: err instanceof Error ? err.message : String(err),
      variant: "danger",
    });
  },
  ```
- **判定**：~~形态不同~~ → **已一致**（**已落地** · commit `0424bfe` · D 批次）
- **怎么改**：目标文件 `gacode-electron/src/routes/Home.tsx`（**1 处调用点**）：
  ```tsx
  onError: (err) => {
    toast({
      title: "创建对话失败",
      description: err instanceof Error ? err.message : String(err),
      variant: "danger",
    });
  },
  ```
  - ℹ️ §9 的 **D-S04（Toast 双字段）已结案**（`5504f93` 落地），本条剩下的只是调用点。
  - ℹ️ PC 的 Toast 是「屏幕正中 + 遮罩」形态（与 web `components/common/Toast.tsx` 1:1），与 web 一致；**字段拆分 D 批次已跟上**。
  - ⚠️ 改双字段后不再出现「创建对话失败: xxx」的前缀式单行文案（`title` 就是「创建对话失败」，原始错误进 `description`）。
- 预估改动：**0 行（D 批次已落地）**

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
- **PC**：`PC 缺失`（PC 未登录进不了 Home，见 H-02）—— `src/routes/Home.tsx:345`（`+` 无未登录判断）、`:337-353`（`<ChatInputBar>` 无未登录拦截）
- **判定**：**缺失 · 待补（排期补，不催）**（依附 H-02）
- **怎么改**：随 D-S01 一起处理。若按 D-S01 的落法「PC 不做未登录态」，本条**作废**。**本轮未动**（归 PM 排期，不等 gaga 拍板）。
- 预估改动：**0 行（随 D-S01）**

---

# §9 结构级差异 · 7 条（4 条已结案 / 1 条按既有决策不改 / 2 条归 PM 排期，不再等 gaga 拍）

> **⚠️ 编号消歧（2026-10-27 10:40）**：本域用 **D-S01~D-S07**；chat 域用 **A-S01~A-S08**；个人中心/通知域用 **C-S1~C-S12** —— **三套编号互不相同**，跨域引用必须带域前缀。**状态 / 落法 / 排期代次**统一见 PM 侧状态表：`D:\gaga\gaclaw-project\docs\pm\2026-10-27-PC端结构级条目状态表-供PM排期.md`

> **本节状态一览**：D-S02 ✅ 已落地（`557033e` · 落法 A）· D-S03 ✅ 已落地（`6dc3c3d`）· D-S04 ✅ 已落地（`5504f93`）· D-S05 ✅ 已落地（`5504f93` + `6dc3c3d`）· D-S07 ✅ 已落地（`5504f93`）· D-S06 📌 按既有决策保持不改（选项 A）· **D-S01 📌 不再需要 gaga 拍**（不现在做，排到「PC 追上 web」那一代）。
>
> **PC 侧栏常驻已拍板保留**（gaga 2026-10-26：「PC 的 256px 常驻侧栏保留，不改成 web 的 Drawer 抽屉」）。因此「侧栏常驻 vs web 抽屉」**不在本节**，对应条目 H-03 / H-04 已标「✅ 已拍板 · PC 不还原」。侧栏**内部**的置顶可折叠分组 / pin 按钮 / 条目视觉形态 / 圆角间距 hover 态 / 计数与折叠箭头对齐，属 ChatList 侧栏域，不在本 HOME 页清单范围。

## D-S01　未登录态整块缺失（Home 页形态分叉）

**状态**：📌 **不再需要 gaga 拍板**（2026-10-27 分层对齐口径：PC = -2 弱对齐 ⇒ 进度差异类归 PM 排期，不是待拍项）—— **落法：D-S01 不现在做，排到「PC 追上 web」那一代**。

> ⚠️ 下面的「需要 gaga 拍」段是 2026-10-26 的历史稿：**结论保留、状态已改** —— 选项 A（不做未登录态）仍是 PM 建议，但它是**排期决策**，不再挂在 gaga 拍板队列上。

- **web**：`gacode-web/src/app/page.tsx:425-537` —— 未登录时 Home **不跳登录**，而是渲染：
  - 居中 Cody 头像 120px（`page.tsx:456-462`，`width={120} height={120}`）
  - 居中标题（`page.tsx:466`）
  - 居中输入框 Card（`page.tsx:471-487`，`w-full max-w-2xl`）
  - 左上 ☰ 菜单按钮 + 右上「登录」按钮（`page.tsx:428-449`）
  - 点 ☰ / 点输入框 → AlertDialog「登录后即可跟 Cody 对话」（`page.tsx:490-535`），带「再看看」「去登录」两个按钮
- **PC**：`src/App.tsx:103-109` 用 `<Protected>` 包住 Home，未登录直接跳 `/login`；PC `src/routes/Home.tsx`（381 行）无任何未登录分支
- **改造影响面**：
  - 改 `src/App.tsx:103-109` 的路由守卫（`Protected` → 允许匿名访问 Home）
  - 改 `src/routes/Home.tsx` 增加 `isAuthenticated` 分支（约 120 行 JSX + 约 60 行 state/handler）
  - 新增 PC 端 AlertDialog 组件（web 的 `page.tsx:490-535` 是**内联**在 page.tsx 里的，不是共用组件 → PC 需新写或复用 `src/components/ui/ConfirmDialog.tsx`）
  - 需确认 PC 的 `useAuth()`（`src/lib/auth.tsx`）在 `user === null` 时是否会被 `Protected` 之外的组件安全读取
  - 需确认匿名状态下 `createChat()` 会不会 401（会 → 发送前必须走未登录拦截）
- **需要 gaga 拍**：PC 端要不要做未登录态？
  - **选项 A（推荐，成本低）**：**不做**。PC 是桌面客户端，登录是必需的前置；web 做未登录态是因为它是公开落地页（要引流注册）。保持 PC `Protected` 现状 → H-02 / H-25 / H-70 三条直接作废。
  - **选项 B**：做，完整复刻 web 的居中布局 + AlertDialog（成本 ~180 行，且要处理匿名发送拦截）。
- **PM 建议**：选 A。理由：web 的未登录态本质是「落地页营销位」，PC 端没有获客场景。

## D-S02　附件区的归属与 attachments state 所有权（跨 chat 域）

**状态**：✅ **已落地（commit `557033e`，2026-10-27 · 代次 1）** —— 落法 A（ChatInputBar 加 `onAttachmentsChange` 上报回调，Home 只读），**不再需要 gaga 拍板**（2026-10-27 分层对齐口径：PC = -2 弱对齐 ⇒ 进度差异类归 PM 排期，不是待拍项）。⚠️ **落法 A 只把「Home 看得见附件状态」的通道接好**（ChatInputBar 新增 `onAttachmentsChange` prop + effect 上报，回调走 ref 兜最新引用以避免死循环；Home 接只读镜像 `data-attachments-count`，附件区本体**仍在 ChatInputBar 内**）⇒ **H-11 的位置差异仍未收口，排期补（代次 2）**。

> ⚠️ 下面的「需要 gaga 拍」段是 2026-10-26 的历史稿：**结论保留、状态已改**。
> ℹ️ **选 A 的依据是采信 PM 判断（总 PM 已知并接受），本台账未独立核过 A / B 两个选项。**

- **现状**：
  - web `page.tsx:306-357`：附件预览区在 **Home 页自己的 JSX 里**（ChatInputBar **外面**），数据源是 `useAttachmentUpload()` hook（`web/src/hooks/useAttachmentUpload.ts`），状态由 Home 持有
  - PC `src/components/chat/ChatInputBar.tsx:224`：`const [attachments, setAttachments] = useState<AttachmentItem[]>([])` —— 状态在 **ChatInputBar 内部**，Home 拿不到（`Home.tsx` 的 `<ChatInputBar>` 无 `onAttachmentsChange` 之类的上报通道）
- **改造影响面**：
  - 要让 PC 的附件区对齐 web（位置在输入条外面、Home 能自己控制），必须让 attachments state 上移到 Home
  - 或 ChatInputBar 增加 `onAttachmentsChange?: (items: AttachmentItem[]) => void` 回调（同步上报），Home 读 state 做渲染
  - **两种做法都会波及 `src/routes/ChatDetail.tsx`**（它也用 ChatInputBar，且 chat 域 worker 正在动这块）→ **不能两个 worker 同时改 ChatInputBar**
  - 另外 H-15（上传中禁止提交）、H-16（部分失败 warning）里，H-16 的 **Home 侧接线**也依赖这条（`onSubmitNotice` 目前只有 `ChatDetail.tsx:1319` 接了线）
- **需要 gaga 拍**：附件 state 归谁？
  - **选项 A（推荐）**：ChatInputBar 保持内部持有 + 新增 `onAttachmentsChange` 回调，Home 只读不改。改动小、不破坏 ChatDetail。
  - **选项 B**：attachments state 上移到 Home，ChatInputBar 改受控（`attachments` + `onAttachmentsChange`）。彻底对齐 web，但 ChatInputBar 大改 → chat 域要重排。
- **PM 建议**：选 A。**但需明确：ChatInputBar 的改动由 chat 域 worker 执行，本清单的 H-11 / H-16（Home 侧）两条是给 chat 域的输入规格，不是 Home worker 可单独完成的任务。**

## D-S03　`+` Sheet → MediaPicker 的层级（拍照入口位置）

**状态**：✅ **已落地**（commit `6dc3c3d`）—— 本条已结案，不再需要 gaga 拍

- **web**：
  - `SheetActionMenu`（`web/src/components/chat/SheetActionMenu.tsx:76-95`）只有 4 项：**图片 / 文件 / 表情 / 挂载知识库** —— **Sheet 里没有「拍照」**
  - 选「图片」→ `openPicker("image")`（`page.tsx:105-115`）→ `MediaPicker` **image 模式** → MediaPicker 内部并排显示 **拍照 + 相册** 两个圆形按钮（`web/src/components/common/MediaPicker.tsx:217-239`）
  - 选「文件」→ `openPicker("file")` → MediaPicker **file 模式** → 只有「选择文件」按钮（`MediaPicker.tsx:207-216`）
- **PC（落地后）**：
  - `src/components/home/PlusSheet.tsx:77-96` 4 项（图片 / 文件 / 表情 / 挂载知识库），顶层「拍照」已删
  - `src/components/home/MediaPicker.tsx:107-124` image 模式并排「拍照 + 相册」双钮；`:147-156` 拍照 input 带 `capture="environment"`
  - `src/routes/Home.tsx:197-200` `case "image"` → MediaPicker image 模式
- **落地结论**：选项 A（拍照下沉到 MediaPicker）已实施。对应条目 H-26 / H-32 / H-40 均已落地。
- ⚠️ **连带影响**：PC 用户点「拍照」从 2 跳变 3 跳（Sheet → MediaPicker → 拍照钮），这是 1:1 还原 web 的代价，已接受。

## D-S04　PC Toast 组件无 title / description 双字段

**状态**：✅ **已落地**（commit `5504f93`）—— 本条已结案，不再需要 gaga 拍

- **web**：`web/src/components/ui/Toast.tsx`（`useToast()` 返回的 `toast({ title, description, variant })`）—— 首页用到 4 处双字段 toast：
  - `page.tsx:76-82`（创建对话失败）、`:120-127`（上传失败）、`:219-226`（附件还在上传中）、`:228-234`（部分附件上传失败）
- **PC（落地后）**：`src/components/ui/Toast.tsx:32-45`
  ```tsx
  export interface ToastItem {
    id: string;
    title?: ReactNode;
    description?: ReactNode;
    /** 兼容旧调用点 — 单行文案 (title 缺省时顶替 title) */
    message?: ReactNode;
    variant?: ToastVariant;
    duration?: number;
  }
  ```
  + 视觉形态同 web（屏幕正中 + 遮罩 + 两行排版 + 2500ms 自动消失，见 `Toast.tsx:134-172`）
- **落地结论**：选项 A（给 PC Toast 加 `title` / `description`）已实施，且**向后兼容**（`message` 保留为 `title` 的别名，全站旧调用点零改动）。
- ⚠️ **剩下的只是 HOME 页的调用点**：H-42（上传失败）、H-69（创建对话失败）这 2 处仍是单行 `message` ⇒ 各自 1 行可改。

## D-S05　BottomSheet 公共组件形态与 web SheetContent 的差距

**状态**：✅ **已落地**（commit `5504f93` 底座形态 + `6dc3c3d` 补 prop）—— 本条已结案，不再需要 gaga 拍

- **web**：web 的所有底部面板都基于 `web/src/components/ui/sheet.tsx` 的 `<SheetContent side="bottom" className="...">`，每个面板自己定 className，**无统一标题栏、无统一 padding**
- **PC（落地后）**：`src/components/ui/BottomSheet.tsx:64-108` 已具备全部所需能力：
  | prop | 用途 | 对应条目 |
  |---|---|---|
  | `contentClassName?: string` | 覆盖容器 className（圆角 / 最大宽 / padding） | H-29 / H-33 |
  | `title?: string`（可选） | `undefined` 时不渲染标题栏 | H-29 / H-43 |
  | `subtitle?: string` | 标题下副标题 | H-54 |
  | `header?: ReactNode` | 固定在滚动区外的头部 | H-46 / H-54 |
  | `maxHeight?: string` | 覆盖容器最大高（传了就不输出底座的 `max-h-[85vh]`） | H-43 |
  | `titleClassName?` / `hideTitle?` | 标题样式 / 只隐藏标题栏但保留 aria-label | — |
  + 底座本身也已改成 web 的底部抽屉形态（`BottomSheet.tsx:168`：`w-full inset-x-0 bottom-0 rounded-t-2xl bg-bg-elevated text-fg shadow-elevation-3 flex flex-col p-6`），全部默认行为不变、其它调用方零改动。
- **落地结论**：选项 A（给 `BottomSheet` 加可选 prop）已实施，**没有为 HOME 页另写一套面板组件**（符合 gaga 2026-10-22「组件意识」要求）。

## D-S06　ChatInputBar 的受控 / 非受控 API 形态

**状态**：📌 **按既有决策保持不改**（选项 A）—— 本条不再需要 gaga 拍

- **web**：`web/src/components/chat/ChatInputBar.tsx:20-43` —— **受控**：`value: string` + `onChange: (v: string) => void` + `onSend: () => void` + `onPlusClick?` + `onAbort?` + `placeholder?` + `disabled?` + `isStreaming?` + `caption?` + `className?` + `maxHeight?`。**ChatInputBar 内部不存 text**（源码注释 `ChatInputBar.tsx:16-17` 明说「受控组件… ChatInputBar 不存 value」）
- **PC**：`src/components/chat/ChatInputBar.tsx:137-187` —— **非受控**：内部 `useState("")`（`:216`）+ `onSubmit: (text, attachments) => boolean | void` + `onStop` + `isStreaming`（必填）+ `canRerun` / `onRerun` / `onSlashCommand` / `onPlusClick` / `onAttachmentError` / `onSubmitNotice` / `placeholder?` / `caption?` / `disabled?`。**用 `useImperativeHandle` 暴露 `insertEmoji` / `insertText` / `insertLibraryMarker` / `addAttachment` / `focus` / `clear`**（`:118-135`）
- **改造影响面**（若要改）：改成受控会波及 `src/routes/ChatDetail.tsx`（它靠 `insertText` / `addAttachment` 命令式写回 textarea）+ slash 菜单逻辑（`ChatInputBar.tsx:520-566` 依赖内部 `text`）+ 拖拽/粘贴上传（`:313-448` 依赖内部 `attachments`）→ **ChatInputBar 基本要重写**
- **决策**：**选 A —— 不改 API 形态**。web 的受控形态是 web 侧「Home 和 ChatDetail 共用一个组件」的设计产物；PC 的命令式形态是 PC 侧「ChatInputBar 自治 + parent 通过 ref 指挥」的设计产物。**功能上已覆盖**（H-10 已登记对照）。
- **本清单的边界**：H-10 / H-19 / H-20 / H-21 / H-22 / H-23 / H-24 全部以「补可选 props + 改 className」为边界，**不动 ChatInputBar 的状态模型**。

## D-S07　MediaPicker 的桌面端形态冲突（黑底全宽 vs 灰底限宽）

**状态**：✅ **已落地**（commit `5504f93`）—— 本条已结案，不再需要 gaga 拍

- **web**：`web/src/components/common/MediaPicker.tsx:200` —— `bg-black border-t-0 text-white flex flex-col gap-0 p-0 max-h-[85vh]`，**纯黑底 + 白字 + 无圆角 + 全宽**，按钮是 `bg-white/10` 半透明白
- **PC（落地前）**：`src/components/ui/BottomSheet.tsx` 底座是 `bg-bg-elevated`（#181818）+ `rounded-t-md` + `p-5` + `max-w-2xl` 居中，按钮是 `bg-bg-sunken`（#0a0a0a）
- **PC（落地后）**：`BottomSheet.tsx:168` 底座已改成 **web 的底部抽屉形态**（`w-full inset-x-0 bottom-0 rounded-t-2xl bg-bg-elevated text-fg shadow-elevation-3 flex flex-col p-6` + `max-h-[85vh]`）⇒ **「全宽 vs 限宽」的桌面端冲突本身已消失**；`MediaPicker.tsx:82` 再用 `contentClassName="!bg-black !rounded-none !p-0 text-white"` 覆盖成 web 的黑底形态。
- **落地结论**：原本「选项 A（保留 PC 限宽）/ 选项 B（严格 1:1）」的二选一**不再需要**—— PC 底座直接对齐了 web 的形态，MediaPicker 照抄 web 即可。
- ⚠️ **代价**：PC 的**所有**底部面板现在都是全宽（`BottomSheet` 是公共组件）—— 这是 `5504f93` 已落地的既有事实，本条只登记，不再单独讨论。

---

# §10 高价值发现（已核实 · web 与 PC 行为实际不一致）

> 以下 11 条都是我逐行读过两边源码后确认的**真实行为差异**，不是样式观感差异。
>
> **本轮状态**：✅ 已修 **10** 条 · 🟡 部分修 **0** 条 · ⏳ 未修 **1** 条（逐条见下方的「状态」行）。

### F-01　PC「有附件、没文字」时点发送按钮**完全没反应**（web 能发）

- **状态**：✅ **已修**（commit `5504f93`）→ H-17（`ChatInputBar.tsx:468` / `:479`）

- **web**：`page.tsx:217`　`if (!content && upload.items.length === 0) return;` —— **有附件就允许提交**，文字可为空
- **PC**：`ChatInputBar.tsx:389-390`　`if (!trimmed) return;` —— **文字为空直接 return**
- **PC 发送按钮的 disabled 条件**（`ChatInputBar.tsx:642`）却是 `disabled={!text.trim() && !attachments.some((x) => x.kind === "done")}` —— **按钮可点，但点击后被 `handleSend` 拦掉**
- **后果**：用户只上传图片不写字 → 点发送 → 按钮变灰但点了没反应 → 用户以为坏了
- **修法**：见 H-17（`ChatInputBar.tsx` 加 `hasDoneAttachment` 判断，2 行）

### F-02　PC 上传中点发送 → 附件**静默消失**，无任何提示

- **状态**：✅ **已修**（commit `5504f93`）→ H-15（`ChatInputBar.tsx:485-492`）；D 批次把 toast 变体从 `danger` 改成 web 的 `default`（两段式，见 H-15）

- **web**：`page.tsx:219-226` —— 检测到 `hasUploading` 就弹 toast「附件还在上传中 / 请稍候几秒再发送」并 **return（不提交）**
- **PC**：`ChatInputBar.tsx:392-394` 只取 `kind === "done"` 的附件传给 parent，**uploading 项被丢弃**；Home `handleSubmit`（`Home.tsx:114`）收到的是不含 uploading 附件的数组 → 直接 createChat
- **后果**：用户点发送时上传还没完 → 附件永久丢失，**没有 toast、没有警告**
- **修法**：见 H-15 + H-16（需 `onSubmitNotice` 回调，~10 行）

### F-03　PC 创建对话失败时，附件已被清空，**用户无法重试**

- **状态**：✅ **已修**（commit `6dc3c3d`）→ H-18（`Home.tsx:113` / `:185`）

- **web**：`page.tsx:237-239` —— createChat 失败只弹 toast，**附件 state 不动**（web 注释明说「这里不重置, 让 user 看到状态到 chat 页前都不丢」）
- **PC**：`ChatInputBar.tsx:396-399` —— `onSubmit` 返回 `true` 后立即 `setText(""); setAttachments([])`；而 `Home.tsx:163` 的 `handleSubmit` **写死 `return true`**
- **PC 的 createChat 失败路径**：`Home.tsx:105-110` 只弹 toast → **附件和文字都已清空，用户必须重新选文件**
- **修法**：见 H-18（`handleSubmit` 返回 `false`，createChat 成功后再 `clear()`，~12 行）

### F-04　web 的文件白名单被它自己的组件架空，PC 用的是**另一串**

- **状态**：✅ **已修**（commit `6dc3c3d`）→ H-36（`MediaPicker.tsx:45`）；⚠️ 残留：后端 mime 白名单待核

- **web `page.tsx:110`** 传给 MediaPicker：`".pdf,.doc,.docx,.txt,.md,.zip,.json,.png,.jpg,.jpeg,.gif,.webp"`
- **web `MediaPicker.tsx:254`**：`accept={modeProp === "file" ? (accept || FILE_ACCEPT) : accept}` —— 因为 `accept` 非空，**组件内置的 `FILE_ACCEPT`（`.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv`）被完全绕过**
- → **web 实际生效 = `page.tsx:110` 那串**（有 `.md/.zip/.json/.png/.jpg/...`，没有 `.xls/.xlsx/.csv`）
- **PC `MediaPicker.tsx:32`** 用的是 `.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv` —— **恰好是被 web 架空的那串**
- **后果**：PC 选不了 `.md` / `.zip` / `.json`；web 能选 `.md` 但选不了 `.xls/.xlsx/.csv`
- **修法**：见 H-36（PC 改成 web 实际生效的那串，1 行）
- ⚠️ **待核**：`.zip` / `.json` 是否被后端 `/yinian/documents` 的 mime 白名单接受 —— 需查 unified-api

### F-05　PC 的 MediaPicker image 模式**只有 1 个按钮**，web 是并排 2 个

- **状态**：✅ **已修**（commit `6dc3c3d`）→ H-32（`MediaPicker.tsx:107-124`）

- **web `MediaPicker.tsx:217-239`**：image 模式并排「拍照（w-24 h-24 rounded-full）」+「相册（w-24 h-24 rounded-full）」两个圆形按钮
- **PC `MediaPicker.tsx:71-91`**：**单个**按钮 `w-40 h-24 rounded-md`，文案随入口变（「打开拍照」/「打开选择图片」）
- **后果**：PC 的 MediaPicker 在 image 模式下**看不到「拍照」和「相册」并排的入口**，拍照被提升到 PlusSheet 顶层（与 web 的层级相反，见 D-S03）
- **修法**：见 H-32（MediaPicker 改双按钮 + 双 hidden input，~40 行）

### F-06　PC 知识库挂载是**单选立即关闭**，web 是**多选 + 完成按钮**

- **状态**：✅ **已修**（D 批次 · commit `0424bfe`）→ H-51：Home 侧 PC 已改成 web Home 的**单选**（`onSelect`）；多选能力保留在 chat 页（`KnowledgeAttachSheet` 传 `onConfirm`），与 web 的 chat 页同构

- **web `LibraryPicker.tsx:121-149`**：`onConfirm` 存在时点行只切换勾选，**不关面板**；底部「完成 (N)」按钮才提交
- **PC `LibraryPicker.tsx:144-150`**：点行立即 `onSelect(item); handleClose();` —— **单选、立即关闭**
- **订正（2026-10-26 · D 批次）**：本条当初把「web Home」当成了多选 —— 实际 **web 的 Home 传的是 `onSelect`（单选）**，多选只发生在 **web 的 chat 页**（`chat/[id]/page.tsx` 传 `onConfirm`）。⇒ PC 的 Home 才是那个「多出 web 没有的形态」，现已改回单选（`Home.tsx:411`），chat 页的多选链路（`KnowledgeAttachSheet.tsx:34`）保持不变。
- **后果（已消）**：PC 首页与 web 首页一致 —— 点行即插 marker 并关面板
- **修法**：见 H-51（Home 侧 1 行 + 回调改单选）

### F-07　PC 的附件区**在 ChatInputBar 内部**，Home 无法独立控制

- **状态**：🟡 **部分修**（`557033e`）→ **通道已就位**（ChatInputBar 上报 `onAttachmentsChange` + Home 只读镜像 `data-attachments-count`），**「附件区本体位置」差异仍未收口** ⇒ H-11 排期补（代次 2），不催

- **web `page.tsx:306-357`**：附件区是 Home 页自己的 JSX，在 ChatInputBar **外面**，`px-4 pb-2` + `flex flex-wrap gap-2`
- **PC `ChatInputBar.tsx:507-508`**：附件区在 ChatInputBar **里面**，`mb-2 flex flex-wrap gap-1.5`
- **后果**：(a) Home 无法控制附件区位置/间距（只能改 ChatInputBar → 同时改到 ChatDetail）；(b) 附件区是**输入框内部**的，而 web 是**输入框外部上方**，视觉差一行
- **修法**：见 H-11 + D-S02（需与 chat 域协调，~18 行）

### F-08　PC 欢迎语文案与 web **完全不同**

- **状态**：✅ **已修**（commit `5504f93`）→ H-07（`Home.tsx:322-324`）

- **web `page.tsx:295`**：`HI 我是 <span className="text-primary">cody</span> 很高兴遇见你`
- **PC `Home.tsx:292-294`**：`HI 欢迎你,<span className="text-brand">{displayName}</span>`（`displayName` = `user?.displayName || user?.username || "访客"`）
- **后果**：PC 首页喊的是用户名，web 首页喊的是「cody」品牌名 —— **这是首页第一眼可见的文案差异**
- **修法**：见 H-07（4 行；改完要清掉 `displayName` / `useAuth` 的未使用变量）

### F-09　PC 输入区宽度 640px，web 已登录态 768px

- **状态**：✅ **已修**（commit `5504f93`）→ H-09（`Home.tsx:336`）

- **web `page.tsx:361`**：`<div className="max-w-3xl mx-auto">` = **768px**
- **PC `Home.tsx:305`**：`<div className="max-w-2xl mx-auto w-full">` = **640px**
- **注**：`max-w-2xl` 是 web **未登录**分支的值（`page.tsx:471`）→ d318f17 那轮对齐时取错了分支
- **修法**：见 H-09（2 行）

### F-10　PC 切「知识库类型 tab」会清空搜索词，web 不会

- **状态**：✅ **已修**（commit `5504f93`）→ H-60（`LibraryPicker.tsx:180`）

- **web `LibraryPicker.tsx:196`**：`onClick={() => setTypeFilter(t.key)}` —— 不动 search
- **PC `LibraryPicker.tsx:85-88`** 的 `handleTypeChange` 会 `setSearch("")`
- **后果**：PC 用户「搜『报告』→ 切到『文档』tab → 搜索词被清空 → 结果全变」
- **修法**：见 H-60（5 行）

### F-11　PC 知识库列表项**没有类型颜色**，web 按类型分色

- **状态**：✅ **已修**（commit `6dc3c3d`）→ H-56（`LibraryPicker.tsx:315-326` + `tailwind.config.ts:79`）

- **web `LibraryPicker.tsx:47-59`**：image=`text-brand-cyan`（青）/ doc=`text-brand`（橙）/ link=`text-cron`（紫）/ 其他=`text-fg-muted`（灰）
- **PC `LibraryPicker.tsx:186-261`**：4 个 case 全是 `stroke="currentColor"`，靠父容器 `text-fg-muted` 着色 → **全部灰色**
- **额外坑**：web 的 `text-cron` token（#a78bfa 紫）**PC tailwind 仓里根本没有**（`tailwind.config.ts:37-107` 无 `cron` 键）
- **修法**：见 H-56（~10 行；`cron` 要么给 PC tailwind 加 token，要么用 `brand-cyan` 近似）

---

# §11 剩余待办（按预估改动量从小到大）

> gaga 2026-10-26 要求「清单按改动量从小到大排」。本节**只列还没做的条目**（已落地的 62 条见 §12 的「已一致」清单）。
>
> **D 批次（2026-10-26）后状态**：Home 域能自行施工的 5 条（H-15 / H-16 / H-42 / H-54 / H-69）**已全部落地**；H-51 残留也已按 gaga 21:35 口径（PC 有 web 没有的必须删）收口。剩余条目**全部跨域或待拍板**。

## 档位 0 · 1–2 行（纯 className / 一行逻辑）

| 序 | 条目 | 一句话 | 归属 |
|---|---|---|---|
| 1 | H-12 | PC `UploadProgressBar.tsx:36` 底色 + `:50` 填充色 / 过渡属性对齐 web | chat 域（**D 批次跳过**：目标文件不在本批所有权白名单内） |

## 档位 1 · ~6 行

| 序 | 条目 | 一句话 | 归属 |
|---|---|---|---|
| — | （空） | D 批次后无 1 档条目 | — |

## 档位 2 · 跨域 / 待 gaga 拍

| 序 | 条目 | 一句话 | 归属 |
|---|---|---|---|
| 2 | H-11 | 附件区上移 Home（ChatInputBar 暴露附件状态） | **chat 域** · D-S02 已落地（通道到位 `557033e`）· **本体上移排代次 2** |
| 3 | H-02 / H-25 / H-70 | 未登录态整块缺失（居中 Cody 120px + 居中输入框 + 右上「登录」按钮 + 3 处拦截） | **待 D-S01 拍板** |
| 4 | H-63 | firstMessage 改走 URL query（PC 现在走 sessionStorage） | **建议不改**（见 §12「本轮不做」） |

---

# §12 汇总统计

| 判定 | 条数 | 明细 |
|---|---|---|
| **已一致（已落地）** | **62** | H-01、H-05、H-06、H-07、H-08、H-09、H-10、H-13、H-14、H-15、H-16、H-17、H-18、H-19、H-20、H-21、H-22、H-23、H-24、H-26、H-27、H-28、H-29、H-30、H-31、H-32、H-33、H-34、H-35、H-36、H-37、H-38、H-39、H-40、H-41、H-42、H-43、H-44、H-45、H-46、H-47、H-48、H-49、H-50、H-51、H-52、H-53、H-54、H-55、H-56、H-57、H-58、H-59、H-60、H-61、H-62、H-64、H-65、H-66、H-67、H-68、H-69 |
| **部分落地（已改 · 仍有残留差异）** | **0** | （本轮清空 —— H-15 / H-16 / H-51 / H-54 全部收口） |
| **形态不同（未改）** | **3** | H-11、H-12、H-63 |
| **缺失（未做）** | **3** | H-02、H-25、H-70 |
| **已拍板 · PC 不还原** | **2** | H-03、H-04 |
| **合计** | **70** | |

**已一致 62 条的落地来源**：
- **C 批次 `6dc3c3d` 落地 —— 24 条**：H-06、H-14、H-18、H-23、H-24、H-26、H-29、H-31、H-32、H-33、H-34、H-35、H-36、H-38、H-40、H-43、H-44、H-45、H-46、H-56、H-57、H-58、H-62、H-65
- **批 1 `5504f93` 落地 —— 17 条**：H-01、H-05、H-07、H-09、H-10、H-13、H-17、H-19、H-20、H-21、H-22、H-30、H-52、H-53、H-55、H-60、H-61
- **本就一致（无需施工）—— 14 条**：H-08、H-27、H-37、H-39、H-41、H-47、H-48、H-49、H-50、H-59、H-64、H-66、H-67、H-68
- **已在途改动里补齐（现已提交）—— 1 条**：H-28（`src/components/home/PlusSheet.tsx:95` 的 `LibraryTypeIcon` 加 `strokeWidth={2}`，**已随 commit `f57f2ec` 提交**，2026-10-27 回写确认）
- **D 批次落地（commit `0424bfe`）—— 6 条**：H-15、H-16、H-42、H-51、H-54、H-69（commit 已于 2026-10-27 回写时补上）
  - H-15 / H-16：`src/components/chat/ChatInputBar.tsx:155-159`（prop 改两段式）+ `:485-492`（上传中守卫）+ `:512-518`（部分失败提示）+ `src/routes/Home.tsx:239-248` / `:375`（Home 接线）+ `src/routes/ChatDetail.tsx:1307-1309`（chat 页不再接线）
  - H-42 / H-69：`src/routes/Home.tsx:299` / `:121`（两处 toast 改双字段）
  - H-51：`src/routes/Home.tsx:321-324` / `:411`（Home 改单选 `onSelect`）
  - H-54：`src/components/home/LibraryPicker.tsx:157` / `:164` / `:172-178` / `:217` / `:240`（自绘标题行 + web 的头部容器与 sheet 内边距归属）

**「部分落地」桶 —— 本轮清空**（D 批次前是 4 条）：

| 条目 | 改前残留 | 收口方式 |
|---|---|---|
| H-15 | toast 变体 `danger` vs web `default` | Home 改走 `onSubmitNotice` ⇒ 两段式 + `default`（`ChatInputBar.tsx:485-492`） |
| H-16 | **Home 侧没传** `onSubmitNotice` ⇒ HOME 页的「部分附件上传失败」永远不弹 | `Home.tsx:239-248` + `:375` 接线；chat 页那处接线删除 |
| H-51 | Home 侧 PC 传 `onConfirm`（多选），web Home 传 `onSelect`（单选） | `Home.tsx:411` 改 `onSelect`（gaga 21:35 口径：PC 多出 web 没有的必须删） |
| H-54 | 副标题位置（web 同行右 / PC 下一行）+ 头部容器 padding | `LibraryPicker.tsx:172-178` 自绘标题行 + `:164` `!p-0` 让 `px-4 pt-5` 真正生效 |

**形态不同 3 条的分布**：
- 跨 chat 域 / 待拍板：H-11（附件区位置，见 D-S02）
- 纯 className：**H-12**（进度条 2 行 · 目标文件 `src/components/chat/UploadProgressBar.tsx` 属 **chat 域** · D 批次**跳过**）
- 机制差异（建议不改）：H-63（firstMessage 通道）

**缺失 3 条的分布**：
- ⏳ 依附 D-S01（未登录态，未拍板）：3 条（H-02 未登录分支、H-25 `+` 未登录拦截、H-70 三处未登录拦截）

**「本轮不做」**（有既定决策依据，**不计入上表合计**）：

| 条目 | 事项 | 依据 |
|---|---|---|
| H-22（附属）· LibraryPicker 加载态 | web 的 `animate-spin`（`gacode-web/src/components/chat/LibraryPicker.tsx:213` 的 `Loader2`）/ `animate-pulse`（PC `ChatInputBar.tsx:784` 的流式圆点）在 PC 上**不动** | PC `src/styles/globals.css:408-414` 全局 `transition-property: none !important` + `animation: none !important`（gagaOS 全局禁动效规范）⇒ PC 上是**静态环 / 静态点** |
| H-29（残留） | web `sheet.tsx:73` 的 `border-t` + `sheet.tsx:86` 的遮罩 `bg-bg-base/80 backdrop-blur-sm`（PC 是 `bg-black/60`） | 加 `border-t` 会给**所有**底部面板加一条 currentColor 亮线；改遮罩会波及 ChatList / Browser / 通知设置等既有调用方 —— `src/components/ui/BottomSheet.tsx:38-42` 已记录「有意不动」 |

**「待 gaga 真机看」**（已落地但观感未在真机验证，**不计入上表合计**）：

| 条目 | 事项 | 为什么需要真机 |
|---|---|---|
| H-14 | 上传失败 chip 照抄 web 的**亮色**系（`border-red-200 bg-red-50/60` + `text-red-700` + `text-red-600`） | PC 是纯黑底，亮红 chip 打在黑底上的观感未验证 |
| H-33 | MediaPicker 纯黑全宽弹层 + `bg-white/10` 半透明白按钮 | 桌面端观感未验证 |

**跨域依赖提醒**：
- 仍在 chat 域的待做条目：**H-11**（跨 chat 域 · D-S02 通道已就位 `557033e` · **本体上移排代次 2**）· **H-12**（`src/components/chat/UploadProgressBar.tsx` · D 批次跳过）
- 仍在 `src/components/ui/BottomSheet.tsx` 的待做条目：**0 条** —— H-29 / H-43 / H-46 / H-53 / H-54 需要的 BottomSheet 能力已随 `5504f93` + `6dc3c3d` 全部落地（H-54 改用 BottomSheet 已有的 `hideTitle` + `header` + `contentClassName` 通道，**BottomSheet 本身 0 改动**）
- Home 域可自行施工：**0 条**（D 批次后 Home 域的 5 条 H-15 / H-16 / H-42 / H-54 / H-69 全部落地）
- 待 gaga 拍板：**H-02 / H-25 / H-70**（随 D-S01）—— **H-11 不再待拍**（D-S02 已落地 `557033e`，落法 A）
- 已由 gaga 2026-10-26 21:35 拍板（不再等拍板）：**PC↔web 差异是「待办」不是「待拍项」** —— web 有 PC 没有的**必须补**，PC 有 web 没有的**必须删**（H-51 即按此口径收口）

---

# §13 本轮变更记录

## 2026-10-26 · D 批次 · HOME 页剩余待办收口（gaga 21:35 口径）

- **批次 commit**：`0424bfe` — `feat(home): HOME 域剩余待办收口 + 附件失败提示回到 web 的归属`（原「待 PM 填」已于 2026-10-27 回写时补上）
- **执行口径**（gaga 2026-10-26 21:35）：**PC↔web 差异是「待办」不是「待拍项」** —— web 有 PC 没有的**必须补**；PC 有 web 没有的**必须删**；不端给 gaga 勾选。
- **文件所有权**（本批只准改这 5 个路径）：`src/routes/Home.tsx` · `src/components/chat/ChatInputBar.tsx` · `src/routes/ChatDetail.tsx` · `src/components/home/LibraryPicker.tsx` · `docs/align-d-home.md`。
- **本批改动的条目（6 条）**：

  | 条目 | 改前 | 改后 | PC 侧锚点（当前工作树） |
  |---|---|---|---|
  | H-15 | 上传中拦截复用 `onAttachmentError` ⇒ toast 变体 `danger` + 单行文案 | 两段式 toast，`variant: "default"`，文案与 web 逐字一致；无 `onSubmitNotice` 时回落到 `onAttachmentError`（chat 页行为不变） | `src/components/chat/ChatInputBar.tsx:485-492` · `src/routes/Home.tsx:239-248` / `:375` |
  | H-16 | Home **没传** `onSubmitNotice` ⇒ HOME 页「部分附件上传失败」永远不弹；文案是拼在一行的单行 message | Home 接线 + 两段式（title/description）；**chat 详情页删掉那处接线** ⇒ 不再弹这条 toast | `src/components/chat/ChatInputBar.tsx:155-159` / `:512-518` · `src/routes/Home.tsx:239-248` / `:375` · `src/routes/ChatDetail.tsx:1307-1309`（接线已删） |
  | H-42 | `toast({ message: msg, variant: "danger" })` | `toast({ title: "上传失败", description: msg, variant: "danger" })` | `src/routes/Home.tsx:299` |
  | H-69 | `toast({ message: \`创建对话失败: ${err}\`, variant: "danger" })` | `toast({ title: "创建对话失败", description: err, variant: "danger" })` | `src/routes/Home.tsx:121` |
  | H-51 | Home 传 `onConfirm`（多选 + 勾选框 + 底部「完成」按钮）—— **PC 多出 web 没有的形态** | Home 传 `onSelect`（单选）⇒ 勾选框与「完成」按钮在 HOME 页消失，与 web Home 一致；多选链路保留在 chat 页（`KnowledgeAttachSheet`） | `src/routes/Home.tsx:321-324` / `:411` |
  | H-54 | 副标题在标题**下一行**（BottomSheet 内置 title/subtitle）+ 头部容器 `px-1 pt-1 … space-y-2` | 副标题自绘到标题**同行右** + 头部容器 = web 的 `px-4 pt-5 pb-3 border-b border-border space-y-3`（配套 `!p-0` 让内边距归属跟 web 一致） | `src/components/home/LibraryPicker.tsx:157` / `:164` / `:172-178` / `:217` / `:240` |

- **统计表变化**：

  | 判定 | 改前 | 改后 |
  |---|---|---|
  | 已一致 | 56 | **62** |
  | 部分落地（已改 · 仍有残留差异） | 4 | **0**（本轮清空） |
  | 形态不同 | 5 | **3** |
  | 缺失 | 3 | **3** |
  | 已拍板 · PC 不还原 | 2 | **2** |
  | 合计 | 70 | **70** |

  - 顶部统计表 / §12 表 / 明细列表三处口径同步更新，并跑脚本校验自洽（合计恒 = 70）。
  - §10 的「高价值发现」状态同步：F-06 由 🟡 部分修 → ✅ 已修；F-02 的「toast 变体残留」备注消掉 ⇒ 该节计数 9/1/1 → **10/0/1**。
- **跳过的条目及原因**：
  - **H-12**（进度条底色 / 填充色 / 过渡属性）—— 目标文件 `src/components/chat/UploadProgressBar.tsx` **不在本批文件所有权白名单内**，且本条在台账里归属 **chat 域** ⇒ **未动手**，留给 chat 域 worker（2 行）。
  - **H-11 / H-02 / H-25 / H-70 / D-S01 / D-S02** —— 信息架构级决策，等 gaga 拍板（本批不碰）。
  - **H-63** —— 台账写「建议不改」，本批不动。
  - **H-03 / H-04 / H-22 附属 / H-29 残留 / H-14 / H-33** —— 已有既定决策依据（详见 §12 两张不计入合计的表），本批不动。
- **本批的连带影响（已知 · 已记录）**：
  1. **PC 的 chat 页也会顺带拦住「上传中就发」** —— PC 的发送路径是共享 `ChatInputBar`（Home 与 chat 共用），web 的这个守卫只在 Home 页 ⇒ PC 架构下无法按 surface 拆分（已在 H-15 条目里写明）。
  2. **chat 页的「上传中」提示回落到 `onAttachmentError`**（`ChatDetail.tsx:1319`），提示文案与改动前**完全一致** ⇒ chat 域**零行为变化**，只有「部分附件上传失败」那条 warning 消失（= 与 web 一致）。
  3. **LibraryPicker 的关闭键位置变了** —— 改成自绘标题行后，内置标题栏不画（`hideTitle`）⇒ 右上角走 web `components/ui/sheet.tsx:102-109` 的**绝对定位 X**（原先是标题栏里的「×」按钮）。
  4. **`Home.tsx` 的 `未拿到附件信息` / `文件超过 50MB 上限` 两处 toast 仍是单行 `message`** —— 台账没有对应条目（web 对应位置是 `console.warn`），本批**未擅自改**；如需对齐请由 PM 决定是否单独立条。
- **门禁**：`pnpm typecheck` 退出码 0 · `verify-md-parser.mjs` 172/172 · `verify-md-render.mjs` 180/180 · `verify-md-table-colwidth.mjs` 绿 · `git diff --name-only -- src/lib/markdown` 为空。

---

## 2026-10-26 · 回写 C 批次 `6dc3c3d` 的落地结果

- **批次 commit**：`6dc3c3d` — `feat(home): C · HOME 页 + 共享组件对齐 web（MediaPicker 双钮 / 4 项 Sheet / 相对时间 / 紫色 link 图标）`
  - 连带核实了上一批 `5504f93`（批 1 · HOME 页 + Toast 双字段 + BottomSheet 底部形态 + ChatInputBar 外层卡片）在本页的落地结果 —— 该批同样**没有回写**本文件。
- **核实方法**：逐条 `git show 6dc3c3d -- <路径>` + `git show 5504f93 -- <路径>` 看两个 commit 的实际 diff，再读**当前工作树**文件（`src/routes/Home.tsx` 381 行 / `src/components/home/{MediaPicker,PlusSheet,LibraryPicker,EmojiPicker}.tsx` / `src/components/ui/BottomSheet.tsx` 216 行 / `src/components/chat/{ChatInputBar,UploadErrorChip,AttachmentChip,UploadProgressBar}.tsx` / `src/components/ui/Glyphs.tsx` / `tailwind.config.ts`）；web 侧逐条读 `gacode-web/src/app/page.tsx`（538 行）+ 对应组件源码；lucide 图标 path 以 `gacode-web/node_modules/lucide-react/dist/esm/icons/library.js`（0.407.0）为准；行号按当前工作树实际行数写。
- **统计表变化**：

  | 判定 | 改前 | 改后 |
  |---|---|---|
  | 已一致 | 14 | **56** |
  | 部分落地（已改 · 仍有残留差异） | —（旧表无此桶） | **4** |
  | 形态不同 | 42 | **5** |
  | 缺失 | 14 | **3** |
  | 已拍板 · PC 不还原 | （旧表并入「缺失」） | **2** |
  | 合计 | 70 | **70** |

  - §9 的 7 条结构级差异：**4 条结案**（D-S03 / D-S04 / D-S05 / D-S07）· **1 条按既有决策不改**（D-S06）· **2 条仍待 gaga 拍**（D-S01 / D-S02）。
  - 另新增 2 张**不计入合计**的标注表：「本轮不做」2 条 · 「待 gaga 真机看」2 条。
- **仍然待办的条目**（编号 + 一句话原因）：
  - **H-02 / H-25 / H-70** —— 未登录态整块缺失，等 **D-S01** 拍板（要改 `src/App.tsx` 的路由守卫，信息架构级）。
  - **H-11** —— 附件区仍在 `ChatInputBar` 内部，等 **D-S02** 拍板（附件 state 归谁），且必须与 chat 域同批。
  - **H-12** —— 进度条底色 / 填充色 / 过渡属性仍与 web 不同（2 行，chat 域文件）。
  - **H-15** —— 上传中拦截已落地，残留 toast 变体 `danger` vs web `default`（并到 H-16 一起改）。
  - **H-16** —— `onSubmitNotice` 组件层已落地，**Home 侧未接线** ⇒ HOME 页的「部分附件上传失败」warning 不弹（2 行）。
  - **H-42 / H-69** —— PC Toast 已支持双字段（D-S04 已结案），HOME 页这 2 处调用点仍是单行 `message`（各 1 行）。
  - **H-51（残留）** —— 组件层已 1:1，但 **PC Home 传 `onConfirm`（多选）、web Home 传 `onSelect`（单选）** ⇒ PC 首页多一个多选形态，**需 gaga 拍**（产品取舍）。
  - **H-54（残留）** —— 标题 / 副标题文案已对齐，剩副标题位置（web 同行右 / PC 下一行）+ 头部容器 padding（~6 行）。
  - **H-63** —— firstMessage 走 sessionStorage vs web 的 URL query，**建议不改**（两端机制各自自洽，见「本轮不做」）。
- **本轮新发现**（不属于本文件范围，**只记录不动手**）：
  1. **`src/routes/Home.tsx` 的 `onSubmitNotice` 未接线** —— `ChatInputBar` 支持该 prop（`ChatInputBar.tsx:153`）、`ChatDetail.tsx:1319` 接了线，**Home 没接** ⇒ HOME 页的「部分附件上传失败」永远不弹（= H-16 的真缺口）。
  2. **PC Home 的知识库挂载比 web 多一个「多选」形态** —— web `page.tsx:399-408` 传 `onSelect`（单选，点行即插即关），PC 传 `onConfirm`（多选，带勾选框 + 完成按钮）（= H-51 的真缺口）。
  3. **`.zip` / `.json` 的后端 mime 白名单未核** —— H-36 已把前端 accept 放宽到 web 实际生效的那串，但 `unified-api` 的 `/yinian/documents` 白名单本次不可读（= H-36 的服务端缺口）。
  4. **`src/components/chat/AttachmentChip.tsx` 有未提交的在途改动** —— chat 域正在删 PC 多出的「非 image 也渲染 FileText 方块」分支（web `AttachmentChip.tsx:60-72` 只有两个分支）；本文件只登记状态，未触碰该文件。
  5. ~~**`src/components/home/PlusSheet.tsx:95` 的 `strokeWidth={2}` 是工作树未提交改动**~~ → ✅ **2026-10-27 回写：已随 commit `f57f2ec` 提交**（2026-10-27）⇒ H-28 稳定在「已一致」，不会再退回「部分落地」。


---

# §14 本轮变更记录（2026-10-27 · 定向复核）

## 14.1 本轮做了什么（只做定向复核，未逐条重判）

- **触发原因**：PC 仓本会话又落了 8 个 commit（`f57f2ec` / `77a83fc` / `0424bfe` / `a7363a0` / `8cfcb64` / `a7fc845` / `7c22841` / `7f79add`），本台账的落法信息与部分行号已过期 ⇒ 按派工单**只复核受影响的条目**，其余条目一字未动。
- **基线说明**：代码基线 = `7f79add`；此后 `ccbe0a6` / `064be1f` 两个 commit **只改 `docs/align-a-chat.md` / `docs/align-c-profile-notify.md`（A / C 域台账），`src/` 零改动** ⇒ **本文件 70 条判定全部仍然成立**。
- **落法回填（6 条）**：H-15 / H-16 / H-42 / H-51 / H-54 / H-69 的「commit 待 PM 填」→ **`0424bfe`**（D 批次的真实 commit）；F-06 与 §13 的批次 commit 同步补上。
- **行号刷新（受 `a7fc845` / `f57f2ec` 影响）**：共享 `src/components/ui/Glyphs.tsx` 的导出从 59 → **84** 个 ⇒ 本文件里所有 `Glyphs.tsx:NNN` 引用按当前文件刷新（`AlertTriangleIcon` 587→590 · `SearchFieldIcon` 613→616 · `CheckGlyph` 634→637 · `LibraryIcon` 654→657 · `ImageTypeIcon` 677→680 · `DocTypeIcon` 699→702 · `LinkCronIcon` 733→736 · `LibraryTypeIcon` 768→771 · `LinkTypeIcon` 827→830 · `ImageIcon` 963→966 · `FileTextIcon` 939→942 · `SmileIcon` 796→799）。
- **在途 → 已落地（2 条）**：H-28（`PlusSheet.tsx:95` 的 `strokeWidth={2}`，**已随 `f57f2ec` 提交**）· H-13（`AttachmentChip.tsx` 的 PC 独有第三分支，**已随 `f57f2ec` 删除**，两端同形）。
- **H-12 补充**：目标文件本轮被 `a7fc845` 触及（X 取消钮收编进共享 `CloseIcon`，形状不变）⇒ 本条 2 处差异（底色 / 填充过渡）**仍未收口，判定不变**；同时补了刷新后的 PC 行号。
- **编号消歧（10:40 口径）**：`S-01~S-07` → **`D-S01~D-S07`**（标题 + 正文交叉引用 + 状态行全改），§9 开头加消歧声明；§12 / §13 的历史记录里的引用也一并带上前缀。
- **D-S01 / D-S02 状态改写**：两条**不再需要 gaga 拍板**（分层对齐模型下 PC = -2 ⇒ 进度差异类归 PM 排期）—— D-S01 落法 = **不现在做，排到「PC 追上 web」那一代**；D-S02 落法 = **选 A**（ChatInputBar 加 `onAttachmentsChange` 上报回调，Home 只读，~18 行，排进下一批）。⚠️ D-S02 的 A / B **不是本台账独立核过的**，是采信 PM 判断（总 PM 已知并接受）。
- **连带更新的 4 条**（状态随上游改，避免台账自相矛盾）：H-02 / H-25 / H-70（缺失 ⇒ **缺失 · 待补（排期补，不催）**，依附 D-S01）· H-11（交叉引用 D-S02 的落法）。
- **8cfcb64 对本域的影响**：**无** —— 该 commit 删的 5 处 PC 自创 UI（审批 banner 提示行 / ↓跳到底浮动按钮 / 消息列表空态 / 侧栏导航项 active 高亮 / 侧栏对话条目行首气泡图标）全部属 **chat 域**，本台账 §9 已写明「侧栏内部属 ChatList 侧栏域，不在本 HOME 页清单范围」⇒ **D 域 70 条判定一条未动**。

## 14.2 统计（条目总数恒 = 70，未增未删）

| 判定 | 条数 | 本轮变化 |
|---|---|---|
| 已一致（已落地） | 62 | 不变（落法 commit 从「待 PM 填」补成 `0424bfe`，不改判定） |
| 部分落地（已改 · 仍有残留差异） | 0 | 不变 |
| 形态不同（未改 · 排期补，不催） | 3 | 不变（H-11 / H-12 / H-63） |
| 缺失 · 待补（排期补，不催） | 3 | 不变（H-02 / H-25 / H-70，措辞按新口径改） |
| 已拍板 · PC 不还原 | 2 | 不变（H-03 / H-04） |
| **合计** | **70** | **不变** |

## 14.3 新口径下本轮的改标

- 「**该删 → 可保留**」：**0 条**（本域无「PC 多出 web 没有」且未删的条目；§9 的 D-S03 ~ D-S07 已是两端同构）。
- 「**该补 → 排期补，不催**」：**3 条**（H-02 / H-25 / H-70 的缺失措辞统一为「待补 · 排期补，不催」）；另 H-11 / H-12 / H-63 三条形态不同同样归「排期补，不催」级。
