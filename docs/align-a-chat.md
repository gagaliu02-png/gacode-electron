# PC ↔ Web 对齐清单 · A 组（chat 列表 / chat 详情 / 侧边栏 / 对话项 / 聊天子组件）

> **唯一真相源**：`D:\gaga\gaclaw-project\gacode-web` 源码的实际 DOM 结构与 className（逐行抄原文，不推测）
> **对齐目标**：`D:\gaga\gaclaw-project\gacode-electron`（PC 端独立实现，非同一份代码）
> **生成日期**：2026-10-26
> **粒度**：每条含 ① web `file:line` ② PC `file:line`（无则写「PC 缺失」）③ 判定（缺失 / 形态不同 / 已一致）④ 「怎么改」栏：目标文件绝对路径 + 插入锚点 + 可直接粘贴的完整 className 串 + 代码骨架（state/ref/handler 签名 + props）+ 交互参数（hover / 长按 ms / 键盘 / 防抖 / 动画 duration）+ 预估改动行数
> **排序**：每节内按改动量升序分 4 档 — D1 ≤3 行 · D2 4-15 行 · D3 16-40 行 · D4 >40 行
> **不列入**：PC 有、web 没有的功能（gaga 指示：先 1:1 还原 web，不讨论 PC 增强）
> **PC 端 className 约束**：PC 仓无 tailwind-merge / clsx / cva，`className` 是数组尾部字符串追加 → 同名冲突类由 CSS 源码顺序决定，需显式处理（例：`rounded-full` 输给 base `rounded-md` → 写 `!rounded-full`）
> **web 端 cn 语义**：`cn = twMerge(clsx(...))`（`src/lib/utils.ts:4-6`）→ 本清单给出的 className 均为 **twMerge 后最终生效串**
> **PC `file:line` 口径（2026-10-26 修正）**：本清单的 PC 行号取 **2026-10-26 实现批工作区快照**（该批改动当时尚未提交）。同仓有其它 worker 并行改 `src/**`，行号会继续漂移 ⇒ **定位以「锚点函数名 / 代码串」为准**，行号仅作参考。2026-10-26 本轮修正的 11 条（见 §十二）已逐条核对过行号与锚点一致。

---

## 目录

- [A1 · chat 列表页](#a1--chat-列表页) — web `src/app/(main)/chat/page.tsx` ↔ PC `src/routes/ChatList.tsx`
- [A2 · chat 详情页](#a2--chat-详情页) — web `src/app/(main)/chat/[id]/page.tsx` ↔ PC `src/routes/ChatDetail.tsx`
- [A3 · 侧边栏](#a3--侧边栏) — web `src/components/layout/Drawer.tsx` + `Header.tsx` ↔ PC `src/components/layout/AppShell.tsx`
- [A4 · 对话项组件](#a4--对话项组件) — web `src/components/chat/ChatItem.tsx` ↔ PC `AppShell.tsx` 内部
- [A5 · 聊天子组件](#a5--聊天子组件) — 气泡 / 列表 / 输入条 / 表情 / 资料库 / 附件 / 审批 / 执行时间线 / 流式错误 / Sheet 动作菜单
- [结构级差异 · 需 gaga 拍](#结构级差异--需-gaga-拍)
- [十二、实现回改清单（2026-10-26 实现批回写）](#十二实现回改清单2026-10-26-实现批回写) — 本轮实现批已落地条目 + 7 处文档修正说明

---

## A1 · chat 列表页

web `src/app/(main)/chat/page.tsx`（490 行） ↔ PC `src/routes/ChatList.tsx`（839 行）

### A1 · D1 档 · 纯 className / 文案对齐（≤3 行）

---

#### A1-D1-01 · 空态标题文案：「还没有对话」→「暂无对话」
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:269` |
| PC | `src/routes/ChatList.tsx:651` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:269
<div className="text-lg font-medium mb-2">暂无对话</div>
```

**PC 现状**
```tsx
// ChatList.tsx:651
<p className="text-base font-medium mb-1">还没有对话</p>
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`function EmptyState` 内 `ChatList.tsx:651`
- 改成：
```tsx
<p className="text-lg font-medium mb-2">暂无对话</p>
```
- 交互：无（纯静态文案）
- **改动量**：1 行

---

#### A1-D1-02 · 空态描述文案缺失
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:270-272` |
| PC | PC 缺失 |
| 判定 | 缺失 |

**web 源码**
```tsx
// page.tsx:270-272
<div className="text-sm">
  开始新对话，开启与 AI 的交流之旅
</div>
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`function EmptyState` 内 `ChatList.tsx:652`（`<p className="text-sm text-fg-muted mb-4">点下面的按钮开始第一次会话</p>` 那一行之后）
- 插一行：
```tsx
<p className="text-sm">开始新对话，开启与 AI 的交流之旅</p>
```
- 交互：无
- **改动量**：1 行

---

#### A1-D1-03 · 空态描述字号色：PC `text-sm text-fg-muted` → web `text-sm`
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:270` |
| PC | `src/routes/ChatList.tsx:652` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:270
<div className="text-sm">
```

**PC 现状**
```tsx
// ChatList.tsx:652
<p className="text-sm text-fg-muted mb-4">点下面的按钮开始第一次会话</p>
```

**怎么改**
- 同 A1-D1-02 那一行，直接用 `className="text-sm"`（web 端不压 `text-fg-muted`，继承 `CardContent` 的 `text-muted-foreground`）
- **改动量**：0 行（随 D1-02 一起）

---

#### A1-D1-04 · 空态图标：`w-12 h-12 mx-auto mb-4 opacity-50`（PC 是圆形底衬 + 无 opacity）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:268` |
| PC | `src/routes/ChatList.tsx:648-650` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:268
<MessageSquarePlus className="w-12 h-12 mx-auto mb-4 opacity-50" />
```

**PC 现状**
```tsx
// ChatList.tsx:648-650
<div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-elevated flex items-center justify-center text-fg-muted">
  <ChatBubblePlus />
</div>
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`function EmptyState` 内 `ChatList.tsx:648-650`
- 改成（去掉圆形底衬，直接裸图标 + 50% 透明）：
```tsx
<div className="w-12 h-12 mx-auto mb-4 opacity-50">
  <ChatBubblePlus />
</div>
```
- 另：PC 的 `ChatBubblePlus`（`ChatList.tsx:801-819`）是自绘 SVG（22×22 / strokeWidth 1.6），web 用 lucide `MessageSquarePlus`（24×24 / strokeWidth 2）。若要 1:1，需把 `ChatBubblePlus` 的 `width/height` 改为 `24`，`strokeWidth` 改 `2`，path 换成 lucide MessageSquarePlus 的 path（`M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z` + `M12 8v8` + `M8 12h8`）。
- 交互：无
- **改动量**：2 行

---

#### A1-D1-05 · 空态标题字号：`text-lg`（PC `text-base`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:269` |
| PC | `src/routes/ChatList.tsx:651` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:269
<div className="text-lg font-medium mb-2">暂无对话</div>
```

**怎么改**
- 随 A1-D1-01 一起：`text-base` → `text-lg`（PC tailwind `lg` = 18px/28px，与 web 同配置）
- **改动量**：0 行

---

#### A1-D1-06 · 空态容器：`Card` + `CardContent p-8 text-center text-muted-foreground`（PC 是裸 div）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:266-274` |
| PC | `src/routes/ChatList.tsx:647` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:266-274
<Card>
  <CardContent className="p-8 text-center text-muted-foreground">
    <MessageSquarePlus className="w-12 h-12 mx-auto mb-4 opacity-50" />
    <div className="text-lg font-medium mb-2">暂无对话</div>
    <div className="text-sm">
      开始新对话，开启与 AI 的交流之旅
    </div>
  </CardContent>
</Card>
```
（`Card` base = `rounded-lg border bg-card text-card-foreground shadow`（`src/components/ui/card.tsx:8`）；`CardContent` base = `p-6 pt-0`（`card.tsx:39`），twMerge 后 `p-8` 覆盖 `p-6` → 最终 `p-8 text-center text-muted-foreground`）

**PC 现状**
```tsx
// ChatList.tsx:647
<div className="rounded-md bg-bg-sunken p-8 text-center max-w-sm">
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`function EmptyState` 内 `ChatList.tsx:647`
- 改成（PC 无 `Card` 组件，直接拼等价 className；PC 已有 `rounded-lg` token=20px，与 web `rounded-lg` 一致）：
```tsx
<div className="rounded-lg border bg-card text-card-foreground shadow p-8 text-center text-muted-foreground">
```
- 注意：PC tailwind 已有 `card: "#0a0a0a"` / `card-foreground` / `muted-foreground` token（`tailwind.config.ts:78-79, 95`）→ `bg-card` `text-card-foreground` `text-muted-foreground` 直接可用，**不需新增依赖**。
- 注意：PC 仓**没有** `Card` / `CardContent` 组件（`src/components/ui/` 下只有 Button/Input/ConfirmDialog/Toast 等）→ 若要复刻而非拼串，需新增 `src/components/ui/Card.tsx`（见 A1-D3-07）。本条先用拼串方案（改动最小）。
- 交互：无
- **改动量**：1 行

---

#### A1-D1-07 · 空态卡片宽度：PC `max-w-sm`（web 无限制）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:266-274`（无 max-w） |
| PC | `src/routes/ChatList.tsx:647` |
| 判定 | 形态不同 |

**怎么改**
- 同 A1-D1-06，从 `className` 串里去掉 `max-w-sm`
- **改动量**：0 行（随 D1-06）

---

#### A1-D1-08 · 空态「新建对话」按钮：PC 空态内多一个按钮
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:266-274`（空态内**无**按钮） |
| PC | `src/routes/ChatList.tsx:653-660` |
| 判定 | 形态不同（PC 多出） |

**PC 现状**
```tsx
// ChatList.tsx:653-660
<Button
  variant="default"
  size="lg"
  onClick={onCreate}
  loading={isPending}
>
  + 新建对话
</Button>
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`function EmptyState` 内 `ChatList.tsx:653-660`
- 删掉这段 `<Button …>+ 新建对话</Button>`（web 空态只留图标 + 两行文案；新建入口是页面上方那个大按钮）
- 副作用：`EmptyState` 的 `onCreate` / `isPending` 两个 prop 变成未使用 → 一并删掉 `EmptyState` 的 props 定义与调用处传参（`ChatList.tsx:296-299` 改为 `<EmptyState />`）
- 交互：无
- **改动量**：11 行（按钮 8 行 + props 2 行 + 调用 1 行）

---

#### A1-D1-09 · 空态描述行在 PC 保留「点下面的按钮开始第一次会话」
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:270-272` |
| PC | `src/routes/ChatList.tsx:652` |
| 判定 | 形态不同 |

**怎么改**
- 随 A1-D1-02 替换（PC 该行文案整体换成 web 的「开始新对话，开启与 AI 的交流之旅」）
- **改动量**：0 行

---

#### A1-D1-10 · 「历史对话」小标题缺失
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:241` |
| PC | PC 缺失 |
| 判定 | 缺失 |

**web 源码**
```tsx
// page.tsx:241
<h2 className="text-lg font-semibold mb-4">历史对话</h2>
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`ChatList.tsx:289`（列表容器 `<div className="px-4 lg:px-8 py-4 flex-1">`）内部最上方
- 插一行：
```tsx
<h2 className="text-lg font-semibold mb-4">历史对话</h2>
```
- 交互：无
- **改动量**：1 行

---

#### A1-D1-11 · 加载态骨架：web `Skeleton h-24 w-full` ×3（PC 是 h-4/h-3 双行小块）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:244-248` |
| PC | `src/routes/ChatList.tsx:691-705` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:244-248
<div className="space-y-3">
  <Skeleton className="h-24 w-full" />
  <Skeleton className="h-24 w-full" />
  <Skeleton className="h-24 w-full" />
</div>
```
（`Skeleton` base = `animate-pulse rounded-md bg-muted`（`src/components/ui/skeleton.tsx:6`））

**PC 现状**
```tsx
// ChatList.tsx:693-702
<div className="space-y-2 max-w-3xl">
  {Array.from({ length: 3 }).map((_, i) => (
    <div key={i} className="rounded-md bg-bg-sunken px-3 py-3 animate-pulse">
      <div className="h-4 w-2/3 bg-bg-elevated rounded" />
      <div className="h-3 w-1/3 bg-bg-elevated rounded mt-2" />
    </div>
  ))}
</div>
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`function SkeletonList` 整体（`ChatList.tsx:691-705`）
- 改成（PC 无 `Skeleton` 组件，用等价 div；PC 有 `bg-muted` token = `#181818`）：
```tsx
function SkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-md bg-muted h-24 w-full" />
      ))}
    </div>
  );
}
```
- 交互：加载态无交互；`animate-pulse` 动画由 Tailwind 默认 2s 循环（web 同）
- **改动量**：6 行

---

#### A1-D1-12 · 「新建对话」按钮文案：PC `+ 新建对话` → web `新建对话`
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:235` |
| PC | `src/routes/ChatList.tsx:275`（顶栏）与 `ChatList.tsx:659`（空态） |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:235
{createChatMutation.isPending ? "创建中..." : "新建对话"}
```

**PC 现状**
```tsx
// ChatList.tsx:275
+ 新建对话
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`ChatList.tsx:275`
- 改成 `新建对话`（去掉 `+ ` 前缀，web 用 `MessageSquarePlus` 图标代替加号）
- **改动量**：1 行

---

#### A1-D1-13 · 顶栏新建按钮文案缺少 pending 态「创建中...」
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:235` |
| PC | `src/routes/ChatList.tsx:269-276` |
| 判定 | 形态不同 |

**PC 现状**
```tsx
// ChatList.tsx:269-276
<Button
  variant="default"
  size="md"
  loading={createMutation.isPending}
  onClick={() => createMutation.mutate({})}
>
  + 新建对话
</Button>
```

**怎么改**
- 锚点：`ChatList.tsx:275`
- 改成：
```tsx
{createMutation.isPending ? "创建中..." : "新建对话"}
```
- 交互：点击后 `createMutation.isPending` 为 true → 文案切「创建中...」；PC `Button` 的 `loading` prop 会额外渲染 `gagaos-spinner`（`src/components/ui/Button.tsx:73-78`），web 没有 spinner 只有文案 → 建议 PC 去掉 `loading` prop，只用文案切换（详见 A1-D2-04）
- **改动量**：1 行

---

#### A1-D1-14 · 时间戳字号：web `text-sm`（PC `text-xs`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:449` |
| PC | `src/routes/ChatList.tsx:553` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:449
<div className="text-sm text-fg-muted mt-1">{relativeTime}</div>
```

**PC 现状**
```tsx
// ChatList.tsx:553
<div className="text-xs text-fg-muted mt-0.5">{relative}</div>
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`ChatList.tsx:553`
- 改成：
```tsx
<div className="text-sm text-fg-muted mt-1">{relative}</div>
```
- **改动量**：1 行

---

#### A1-D1-15 · 对话标题字号：web `font-medium`（无 text-xs/sm → 继承 16px base）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:448` |
| PC | `src/routes/ChatList.tsx:644`（本轮实现批已落地 → 已是 `font-medium truncate`） |
| 判定 | 形态不同（**待 PM 拍板**是否改「已一致」，见 §12.3） |

**web 源码**
```tsx
// page.tsx:448
<div className="font-medium truncate">{title || "新对话"}</div>
```

**PC 现状（2026-10-26 复核：实现批已改好）**
```tsx
// ChatList.tsx:644
<div className="font-medium truncate">
  {chat.title || "新对话"}
</div>
```

**怎么改**
- 锚点：`ChatList.tsx:644`
- **本轮实现批已落地**：PC 已是 `font-medium truncate`（无 `text-*` 类 → 继承 16px），与 web `page.tsx:448` 逐字一致 → **无需再改**
- 注意：web 这一行在 `<div className="flex-1 min-w-0">` 内，无字号声明 → 继承 body 的 `text-base`（16px/24px）。PC body 也需是 16px → **已核实**：PC `src/styles/globals.css:194-201` 的 body 无 `font-size`，web `gacode-web/src/styles/globals.css:232-239` 同样无 `font-size`，两边 `tailwind.config.ts` 的 `fontSize.base` 都是 16px → 继承值一致（见 A1-D3-08）
- **改动量**：0 行（已落地）

---

#### A1-D1-16 · 多选计数文案：`已选 N 项`（PC `已选 N 条`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:197-199` |
| PC | `src/routes/ChatList.tsx:348-350` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:197-199
<div className="flex-1 text-sm font-medium">
  已选 {selectedIds.size} 项
</div>
```

**PC 现状**
```tsx
// ChatList.tsx:348-350
<span className="text-sm">
  已选 <strong>{multiSelectIds.size}</strong> 条
</span>
```

**怎么改**
- 锚点：`ChatList.tsx:348-350`
- 改成：
```tsx
<span className="flex-1 text-sm font-medium">
  已选 {multiSelectIds.size} 项
</span>
```
- **改动量**：1 行

---

#### A1-D1-17 · 多选底栏容器：PC `sticky bottom-0`（web 是 `sticky top-14`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:188` |
| PC | `src/routes/ChatList.tsx:347` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:188
<div className="sticky top-14 z-30 -mx-4 lg:-mx-8 px-4 lg:px-8 mb-4 py-2 bg-bg-elevated border-b border-border flex items-center gap-3">
```

**PC 现状**
```tsx
// ChatList.tsx:347
<div className="sticky bottom-0 z-30 bg-bg-elevated px-4 lg:px-8 py-3 flex items-center gap-3">
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`ChatList.tsx:346-378`（整个多选底栏 div）
- 改成（web 是**顶部**多选栏，不是底部；PC 需从 bottom 改成 top，并改用 top 偏移）：
```tsx
<div className="sticky top-14 z-30 -mx-4 lg:-mx-8 px-4 lg:px-8 mb-4 py-2 bg-bg-elevated border-b border-border flex items-center gap-3">
```
- 注意：web 的 `top-14` = 56px，是 web 端 Header 高度（`Header.tsx` 固定 h-14）；PC 端顶栏高度不同（见 A3 节），`top-14` 是否正确需按 PC Header 实际高度校正 → **待核**（A3-D3-01 会给出 PC 顶栏高度）。
- 注意：PC 无 `border-b` 与 `border-border` 冲突问题（PC `border` token 存在）。
- 交互：多选栏常驻在列表顶部，滚动时 sticky 跟随；PC 现有 sticky bottom 是底部条，视觉位置完全不同。
- **改动量**：1 行（但会连带移动元素位置，见 A1-D3-02）

---

#### A1-D1-18 · 多选底栏内边距：`py-3`（web `py-2`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:188` |
| PC | `src/routes/ChatList.tsx:347` |
| 判定 | 形态不同 |

**怎么改**
- 随 A1-D1-17 一起：`py-3` → `py-2`
- **改动量**：0 行

---

#### A1-D1-19 · 多选底栏缺 `border-b border-border` 分隔线
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:188` |
| PC | `src/routes/ChatList.tsx:347` |
| 判定 | 缺失 |

**怎么改**
- 随 A1-D1-17 一起补 `border-b border-border`
- **改动量**：0 行

---

#### A1-D1-20 · 多选底栏缺负外边距 `-mx-4 lg:-mx-8`（web 满宽出血）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:188` |
| PC | `src/routes/ChatList.tsx:347` |
| 判定 | 缺失 |

**怎么改**
- 随 A1-D1-17 一起补 `-mx-4 lg:-mx-8`（PC 根容器 `px-4 lg:px-8`，负外边距让顶栏贴到容器左右边缘）
- **改动量**：0 行

---

#### A1-D1-21 · 多选底栏 `mb-4` 下间距缺失
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:188` |
| PC | `src/routes/ChatList.tsx:347` |
| 判定 | 缺失 |

**怎么改**
- 随 A1-D1-17 一起补 `mb-4`
- **改动量**：0 行

---

#### A1-D1-22 · 多选态「全选/清空」按钮：PC 无图标（web 有 `CheckCheck`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:200-210` |
| PC | `src/routes/ChatList.tsx:359-368` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:200-210
<Button
  variant="ghost"
  size="sm"
  onClick={() => allSelected ? exitMultiSelect() : selectAll()}
  className="gap-1.5"
>
  <CheckCheck className="w-4 h-4" />
  {allSelected ? "清空" : "全选"}
</Button>
```

**PC 现状**
```tsx
// ChatList.tsx:359-368
<Button
  variant="ghost"
  size="sm"
  onClick={() => {
    if (allSelected) setMultiSelectIds(new Set());
    else setMultiSelectIds(new Set(sortedChats.map((c) => c.id)));
  }}
>
  {allSelected ? "清空" : "全选"}
</Button>
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`ChatList.tsx:359-368`
- 改成（PC 无 lucide 依赖 → 自绘 16×16 check-check SVG，strokeWidth 2，`currentColor`）：
```tsx
<Button
  variant="ghost"
  size="sm"
  onClick={() => {
    if (allSelected) setMultiSelectIds(new Set());
    else setMultiSelectIds(new Set(sortedChats.map((c) => c.id)));
  }}
  className="gap-1.5"
>
  <CheckCheckIcon />
  {allSelected ? "清空" : "全选"}
</Button>
```
- 新增图标函数（插在 `function MenuItem` 之前，`ChatList.tsx:605` 上面）：
```tsx
function CheckCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M18 6 7 17l-5-5" />
      <path d="m22 10-7.5 7.5L13 16" />
    </svg>
  );
}
```
- 交互：hover/active/focus 三态由 PC `Button` base 提供（`transition-colors duration-150` + `focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base`）；web `Button` base 是 `focus-visible:ring-1 focus-visible:ring-ring`（`src/components/ui/button.tsx:6`）—— 尺寸差异见 A1-D2-05
- **改动量**：22 行（按钮 3 行 + 图标 19 行）

---

#### A1-D1-23 · 多选态「删除」按钮：PC 无图标（web 有 `Trash2`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:211-222` |
| PC | `src/routes/ChatList.tsx:369-376` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:211-222
<Button
  variant="destructive"
  size="sm"
  disabled={selectedIds.size === 0 || deleteMutation.isPending}
  onClick={() => setConfirmOpen(true)}
  className="gap-1.5"
>
  <Trash2 className="w-4 h-4" />
  删除 ({selectedIds.size})
</Button>
```

**PC 现状**
```tsx
// ChatList.tsx:369-376
<Button
  variant="danger"
  size="sm"
  loading={deleteMutation.isPending}
  onClick={() => setConfirmOpen(true)}
>
  删除 ({multiSelectIds.size})
</Button>
```

**怎么改**
- 锚点：`ChatList.tsx:369-376`
- 改成（PC `TrashIcon` 已存在，`ChatList.tsx:781-799`，但默认 14×14/strokeWidth 1.6 → 需给尺寸 prop）：
```tsx
<Button
  variant="danger"
  size="sm"
  loading={deleteMutation.isPending}
  onClick={() => setConfirmOpen(true)}
  className="gap-1.5"
>
  <TrashIcon className="w-4 h-4" />
  删除 ({multiSelectIds.size})
</Button>
```
- 同时把 `function TrashIcon`（`ChatList.tsx:781`）的 `width="14" height="14" strokeWidth="1.6"` 改为 `width="16" height="16" strokeWidth="2"`，并加 `className` prop 透传（已有 `className?: string` → 直接透传即可，只需改数值）
- 注意：web 用 `variant="destructive"`（`bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90`），PC 用 `variant="danger"`（`bg-danger text-white hover:bg-danger/90 active:bg-danger/80 shadow`）→ PC token `danger` = `#E54a5e`，web `destructive` = `#E54a5e` → 颜色一致，命名差异可忽略（见 A1-D2-06）
- **改动量**：3 行（+ TrashIcon 数值 2 行）

---

#### A1-D1-24 · 多选态「退出多选」X 按钮缺失
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:189-196` |
| PC | PC 缺失 |
| 判定 | 缺失 |

**web 源码**
```tsx
// page.tsx:189-196
<button
  type="button"
  onClick={exitMultiSelect}
  className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-bg-sunken"
  aria-label="退出多选"
>
  <X className="w-5 h-5" />
</button>
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`ChatList.tsx:346-378` 多选底栏 div 内部最前（在「已选 N 项」之前）
- 插：
```tsx
<button
  type="button"
  onClick={() => setMultiSelectIds(new Set())}
  className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-bg-sunken"
  aria-label="退出多选"
>
  <XIcon className="w-5 h-5" />
</button>
```
- 新增图标函数（插在 `function CheckCheckIcon` 之前）：
```tsx
function XIcon({ className }: { className?: string }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
```
- 交互：hover 底色 `bg-bg-sunken`（`#0a0a0a`），点击即退出多选（清空选中集合）
- **改动量**：26 行

---

#### A1-D1-25 · 「新建对话」大按钮：PC 顶栏小按钮 → web 页内大按钮
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:227-237` |
| PC | `src/routes/ChatList.tsx:269-276` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:227-237
<div className="mb-6">
  <Button
    onClick={() => createChatMutation.mutate()}
    disabled={createChatMutation.isPending || isMultiSelectMode}
    className="w-full lg:w-auto gap-2"
    size="lg"
  >
    <MessageSquarePlus className="w-5 h-5" />
    {createChatMutation.isPending ? "创建中..." : "新建对话"}
  </Button>
</div>
```

**PC 现状**
```tsx
// ChatList.tsx:269-276
<Button
  variant="default"
  size="md"
  loading={createMutation.isPending}
  onClick={() => createMutation.mutate({})}
>
  + 新建对话
</Button>
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`ChatList.tsx:269-276`（PC 顶栏右侧那个按钮）
- 改成（提到列表上方独立一行；PC 需自绘 `MessageSquarePlus` 图标 —— `ChatBubblePlus` 已存在但 path 不同，需替换为 lucide 版）：
```tsx
<div className="mb-6">
  <Button
    variant="default"
    size="lg"
    onClick={() => createMutation.mutate({})}
    disabled={createMutation.isPending || multiSelectIds.size > 0}
    className="w-full lg:w-auto gap-2"
  >
    <MessageSquarePlusIcon className="w-5 h-5" />
    {createMutation.isPending ? "创建中..." : "新建对话"}
  </Button>
</div>
```
- 位置：插在 `ChatList.tsx:289`（列表容器 `<div className="px-4 lg:px-8 py-4 flex-1">`）**之前**
- 注意：PC `Button` 的 `size="lg"` = `h-12 px-6 text-base`（`Button.tsx:39`），web `size="lg"` = `h-10 rounded-md px-8`（`button.tsx:20`）→ 高度 48px vs 40px 不一致，见 A1-D2-07
- **改动量**：12 行

---

### A1 · D2 档 · 补元素 / 补文案（4-15 行）

---

#### A1-D2-01 · 页面根容器：`px-4 lg:px-8 py-6 max-w-3xl mx-auto`（PC 无 max-width、无居中）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:185` |
| PC | `src/routes/ChatList.tsx:227` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:185
<div className="px-4 lg:px-8 py-6 max-w-3xl mx-auto">
```

**PC 现状**
```tsx
// ChatList.tsx:227
<div className="min-h-full flex flex-col">
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`ChatList.tsx:227`
- 改成（PC 根 div 还需保留 `min-h-full flex flex-col` 撑高多选 sticky 栏 → 用嵌套）：
```tsx
<div className="min-h-full flex flex-col">
  <div className="px-4 lg:px-8 py-6 max-w-3xl mx-auto flex-1 w-full">
    {/* 原内容 */}
  </div>
</div>
```
- 若采用「直接替换」方案（`className="px-4 lg:px-8 py-6 max-w-3xl mx-auto"`），PC 多选顶栏的 `sticky top-14` 在 `max-w-3xl` 容器内会被限制宽度 → 视觉上与 web 相同（web 同样在 `max-w-3xl` 内 sticky），故嵌套方案更贴近 web：**web 的 sticky 栏也在 max-w-3xl 容器内**，用嵌套即可。
- 交互：无
- **改动量**：3 行（开 1 行 + 缩进闭合 1 行 + 注释占位 1 行）

---

#### A1-D2-02 · 「历史对话」列表用 `grid gap-3`（PC `ul.space-y-2`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:250` |
| PC | `src/routes/ChatList.tsx:302` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:250
<div className="grid gap-3">
  {chats.map((chat) => (
    <ChatRow … />
  ))}
</div>
```

**PC 现状**
```tsx
// ChatList.tsx:302
<ul className="space-y-2 max-w-3xl">
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`ChatList.tsx:302`
- 改成：
```tsx
<div className="grid gap-3">
```
- 注意：web 是 `<div className="grid gap-3">`（grid 单列，gap=12px），PC 是 `<ul className="space-y-2 max-w-3xl">`（gap=8px + 语义标签）。若保留 `<ul>`，把 className 改成 `className="grid gap-3"` 即可（`<ul>` 本身有 `list-style` 默认，实测 tailwind preflight 会清掉）；建议保留 `<ul>` 语义 + `grid gap-3`。
- 交互：无
- **改动量**：1 行

---

#### A1-D2-03 · 「历史对话」外层 `space-y-3`（PC 无）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:240` |
| PC | PC 缺失 |
| 判定 | 缺失 |

**web 源码**
```tsx
// page.tsx:240
<div className="space-y-3">
```

**怎么改**
- 锚点：`ChatList.tsx:289`（列表容器）
- 改成：
```tsx
<div className="space-y-3">
```
- 注意：web 的 `space-y-3` 作用于「h2 标题」与「grid 列表」之间（12px）；同时 web 的 `h2` 自带 `mb-4`（16px）→ 实际标题到第一张卡片间距 = max(space-y-3, mb-4) 的叠加以 twMerge 结果为准（`space-y` 用 margin-top 覆盖 `mb-4` 的可能性）→ 1:1 还原时两串都保留。
- **改动量**：1 行

---

#### A1-D2-04 · 「新建对话」按钮 PC 多出 spinner（web 只有文案切换）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:228-236`（无 loading prop） |
| PC | `src/routes/ChatList.tsx:272`（`loading={createMutation.isPending}`） |
| 判定 | 形态不同 |

**PC 现状**
```tsx
// ChatList.tsx:272
loading={createMutation.isPending}
```

**怎么改**
- 锚点：`ChatList.tsx:272`
- 删掉 `loading={createMutation.isPending}` 这一行（PC `Button` 的 `loading` 会渲染 `gagaos-spinner` span，`Button.tsx:73-78`；web 只换文案）
- 交互：pending 时按钮 disabled（web `disabled={createChatMutation.isPending || isMultiSelectMode}`）
- **改动量**：1 行

---

#### A1-D2-05 · PC `Button` base 视觉与 web `Button` base 不一致（尺寸/focus ring）
| 项 | 值 |
|---|---|
| web | `src/components/ui/button.tsx:6, 17-22` |
| PC | `src/components/ui/Button.tsx:36-40, 61-67` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// button.tsx:6
"inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
// button.tsx:17-22
size: {
  default: "h-9 px-4 py-2",
  sm: "h-8 rounded-md px-3 text-xs",
  lg: "h-10 rounded-md px-8",
  icon: "h-9 w-9",
},
```

**PC 现状**
```tsx
// Button.tsx:36-40
sm: "h-8 px-3 text-sm",
md: "h-10 px-4 text-sm",
lg: "h-12 px-6 text-base",
// Button.tsx:61-67
"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium",
"transition-colors duration-150",
"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base",
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\Button.tsx`
- 锚点：`Button.tsx:36-40`（`sizeClass` 映射）+ `Button.tsx:61-67`（base 串）
- `sizeClass` 改成（对齐 web cva）：
```tsx
const sizeClass: Record<ButtonSize, string> = {
  sm: "h-8 rounded-md px-3 text-xs",
  md: "h-9 px-4 py-2 text-sm",
  lg: "h-10 rounded-md px-8",
};
```
  （PC `ButtonSize` 现为 `"sm" | "md" | "lg"`，web 是 `default/sm/lg/icon` → PC 的 `md` 需承担 web `default` 的 `h-9 px-4 py-2`）
- base 的 focus ring 改成 `focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50`，并去掉 `focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base`
- 注意：web base **没有** `text-sm`（字号由 size 决定），PC base 也无 `text-sm` → 一致；web base 无 `gap-2`，PC base 有 `gap-2` → PC 保留（web 靠各调用点自己写 `gap-1.5` / `gap-2`）
- 注意：改 `sizeClass` 是**全站级**改动（PC 所有页面共用 `Button`）→ 影响 Library / Deliveries / Profile 等页面，需在 PC 端做视觉回归
- 交互：focus ring 由 2px+offset 变为 1px 无 offset
- **改动量**：6 行（但影响面广）

---

#### A1-D2-06 · PC `Button` variant 名 `danger` ↔ web `destructive`（色值一致，无需改）
| 项 | 值 |
|---|---|
| web | `src/components/ui/button.tsx:11` |
| PC | `src/components/ui/Button.tsx:30-31` |
| 判定 | 已一致（色值层面） |

**web 源码**
```tsx
// button.tsx:11
destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
```
**PC 现状**
```tsx
// Button.tsx:30-31
danger:
  "bg-danger text-white hover:bg-danger/90 active:bg-danger/80 shadow",
```

**说明**
- web `destructive` = `#E54a5e`，`destructive-foreground` = `#FFFFFF`；PC `danger` = `#E54a5e`，`text-white` = `#FFFFFF` → 底色/文字一致
- 差异仅在阴影 token（web `shadow-sm` = `0 1px 2px 0 rgb(0 0 0 / 0.5)`；PC `shadow` = `0 1px 3px 0 rgb(0 0 0 / 0.5)`）与 PC 多 `active:bg-danger/80`
- **判定**：已一致（不需改）；如需像素级 1:1，把 PC `danger` 的 `shadow` 改 `shadow-sm`、删 `active:bg-danger/80`
- **改动量**：0 行

---

#### A1-D2-07 · PC `Button` size `lg` 高度 48px（web 40px）
| 项 | 值 |
|---|---|
| web | `src/components/ui/button.tsx:20` |
| PC | `src/components/ui/Button.tsx:39` |
| 判定 | 形态不同 |

**怎么改**
- 随 A1-D2-05 的 `sizeClass` 一起改（`lg: "h-10 rounded-md px-8"`）
- **改动量**：0 行（随 D2-05）

---

#### A1-D2-08 · 多选栏「全选」按钮 PC 缺 `gap-1.5`（web 有）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:206` |
| PC | `src/routes/ChatList.tsx:359-368` |
| 判定 | 缺失 |

**怎么改**
- 随 A1-D1-22 一起加 `className="gap-1.5"`
- **改动量**：0 行

---

#### A1-D2-09 · 多选栏「删除」按钮 PC 缺 `gap-1.5`（web 有）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:218` |
| PC | `src/routes/ChatList.tsx:369-376` |
| 判定 | 缺失 |

**怎么改**
- 随 A1-D1-23 一起加 `className="gap-1.5"`
- **改动量**：0 行

---

#### A1-D2-10 · PC `Input` 背景 token 与 web 不一致（`bg-bg-sunken` vs `bg-bg-elevated`）
| 项 | 值 |
|---|---|
| web | `src/components/ui/input.tsx:25` |
| PC | `src/components/ui/Input.tsx:24` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// input.tsx:25
"flex w-full rounded-md border border-border bg-bg-elevated px-4 py-3 text-base",
```
**PC 现状**
```tsx
// Input.tsx:24
"flex w-full rounded-md border border-border bg-bg-sunken px-4 py-3 text-base",
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\Input.tsx`
- 锚点：`Input.tsx:24`
- 改成：`bg-bg-sunken` → `bg-bg-elevated`
- 影响面：PC 全站所有 `Input`（ChatList 搜索框、重命名框、Library 等）背景从 `#0a0a0a` 变 `#181818` → 需视觉回归
- **改动量**：1 行

---

#### A1-D2-11 · PC `Input` 缺 `shadow-sm`（web 有）
| 项 | 值 |
|---|---|
| web | `src/components/ui/input.tsx:26` |
| PC | `src/components/ui/Input.tsx:25`（`placeholder:text-fg-subtle` 单独一行，无 shadow） |
| 判定 | 缺失 |

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\Input.tsx`
- 锚点：`Input.tsx:24-30` 的 className 数组
- 在 `placeholder:text-fg-subtle` 那行后面加一行（或合并）：
```tsx
"placeholder:text-fg-subtle shadow-sm",
```
- **改动量**：1 行

---

#### A1-D2-12 · PC `Input` 缺 `file:text-foreground`（web 用 `text-foreground`，PC 用 `text-fg`）
| 项 | 值 |
|---|---|
| web | `src/components/ui/input.tsx:33` |
| PC | `src/components/ui/Input.tsx:29` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// input.tsx:33
"file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
```
**PC 现状**
```tsx
// Input.tsx:29
"file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-fg",
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\Input.tsx`
- 锚点：`Input.tsx:29`
- 改成 `file:text-fg` → `file:text-foreground`（PC tailwind 有 `foreground: "#e5e7eb"` token，`tailwind.config.ts:77`）
- **改动量**：1 行

---

#### A1-D2-13 · 重命名弹窗文案：PC 无「修改后服务端会保留自定义标题」说明
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:318-320` |
| PC | `src/routes/ChatList.tsx:410-412`（`message=""`） |
| 判定 | 缺失 |

**web 源码**
```tsx
// page.tsx:318-320
<SheetDescription>
  修改后服务端会保留自定义标题 (不会在下次自动生成时覆盖).
</SheetDescription>
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`ChatList.tsx:412`（`message=""`）
- 改成：
```tsx
message="修改后服务端会保留自定义标题 (不会在下次自动生成时覆盖).",
```
- 交互：纯说明文案，`ConfirmDialog` 会渲染成 `<p className="text-sm text-fg-muted mb-4">`
- **改动量**：1 行

---

#### A1-D2-14 · 批量删除确认文案：web「对话中的消息将被永久删除。」vs PC「对话中的消息也会被删除。」
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:283-285` |
| PC | `src/routes/ChatList.tsx:384` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:283-285
<SheetDescription>
  此操作不可恢复，对话中的消息将被永久删除。
</SheetDescription>
```
**PC 现状**
```tsx
// ChatList.tsx:384
message="此操作不可恢复,对话中的消息也会被删除。"
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`ChatList.tsx:384`
- 改成：
```tsx
message="此操作不可恢复，对话中的消息将被永久删除。",
```
- **改动量**：1 行

---

#### A1-D2-15 · 批量删除确认标题：web「确认删除 N 条对话？」vs PC「确认删除 N 条对话?」（全角问号）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:282` |
| PC | `src/routes/ChatList.tsx:383` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:282
<SheetTitle>确认删除 {selectedIds.size} 条对话？</SheetTitle>
```
**PC 现状**
```tsx
// ChatList.tsx:383
title={`确认删除 ${multiSelectIds.size} 条对话?`}
```

**怎么改**
- 锚点：`ChatList.tsx:383`
- 改成：
```tsx
title={`确认删除 ${multiSelectIds.size} 条对话？`}
```
- **改动量**：1 行

---

#### A1-D2-16 · 批量删除确认「取消」按钮：web `variant="outline"`（PC `ghost`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:288-294` |
| PC | `src/components/ui/ConfirmDialog.tsx:57-59`（`variant="ghost"`） |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:288-294
<Button
  variant="outline"
  onClick={() => setConfirmOpen(false)}
  disabled={deleteMutation.isPending}
>
  取消
</Button>
```

**PC 现状**
```tsx
// ConfirmDialog.tsx:57-59
<Button variant="ghost" size="md" onClick={onCancel} disabled={loading}>
  {cancelLabel}
</Button>
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\ConfirmDialog.tsx`
- 锚点：`ConfirmDialog.tsx:57`
- 改成：
```tsx
<Button variant="outline" size="md" onClick={onCancel} disabled={loading}>
  {cancelLabel}
</Button>
```
- 影响面：PC 全站 `ConfirmDialog`（Library / Deliveries / Profile / ProfileEdit / ProfileChangePassword）取消按钮从 ghost 变 outline → 需视觉回归
- 交互：`variant="outline"` = `bg-transparent text-fg border border-border hover:bg-bg-elevated active:bg-bg-sunken`（PC `Button.tsx:32-33`）；web outline = `border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground`（`button.tsx:12`）→ 边框色 PC `border-border`(#363b41) vs web `border-input`(#363b41) 一致
- **改动量**：1 行

---

#### A1-D2-17 · 重命名弹窗「保存」按钮 PC 无 spinner
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:351-353` |
| PC | `src/routes/ChatList.tsx:410-423`（`ConfirmDialog` 的 `loading` 走 PC `Button` 的 `gagaos-spinner`） |
| 判定 | 形态不同（形态近似，spinner 实现不同） |

**web 源码**
```tsx
// page.tsx:351-353
{renameMutation.isPending && (
  <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
)}
```

**PC 现状**
```tsx
// Button.tsx:73-78
{loading && (
  <span aria-hidden="true" className="gagaos-spinner" />
)}
```

**怎么改**
- 若要求 1:1（web 用原生 Tailwind spinner，PC 用自定义 `.gagaos-spinner`）：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\Button.tsx`
  - 锚点：`Button.tsx:73-78`
  - 改成：
```tsx
{loading && (
  <span
    aria-hidden="true"
    className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin"
  />
)}
```
- 影响面：PC 全站所有 loading 按钮（loading 态尺寸从 `.gagaos-spinner` 尺寸改为 12×12）
- **改动量**：3 行

---

#### A1-D2-18 · 重命名弹窗「保存」按钮：PC 无 `gap-2`（web 有）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:349` |
| PC | `src/components/ui/ConfirmDialog.tsx:60-67`（无 className 透传） |
| 判定 | 缺失 |

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\ConfirmDialog.tsx`
- 锚点：`ConfirmDialog.tsx:60-67`
- 改：
```tsx
<Button
  variant={confirmVariant === "danger" ? "danger" : "default"}
  size="md"
  loading={loading}
  onClick={onConfirm}
  className="gap-2"
>
  {confirmLabel}
</Button>
```
- 注：PC `Button` base 已带 `gap-2`（`Button.tsx:61`）→ 实际视觉无差异，此条仅为 className 串对齐
- **改动量**：1 行

---

#### A1-D2-19 · 重命名弹窗「保存」按钮：PC 未按空标题禁用
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:348`（`disabled={renameMutation.isPending \|\| !renameDraft.trim()}`） |
| PC | `src/components/ui/ConfirmDialog.tsx:23`（`onConfirm: () => void`，无 disabled） |
| 判定 | 缺失 |

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\ConfirmDialog.tsx`
- 锚点：`ConfirmDialogProps`（`ConfirmDialog.tsx:16-27`）与函数体（`ConfirmDialog.tsx:29-39`）
- 加 prop：
```tsx
  /** 禁用确认按钮 (例如重命名输入为空) */
  confirmDisabled?: boolean;
```
- 解构默认值：`confirmDisabled = false`
- 按钮处：`disabled={loading || confirmDisabled}`
- 调用方（`ChatList.tsx:409-443`）传：
```tsx
confirmDisabled={!renameDraft.trim()}
```
- 交互：输入框清空 → 保存按钮 disabled（`disabled:opacity-50 disabled:pointer-events-none`）
- **改动量**：5 行

---

#### A1-D2-20 · 重命名空标题时：web 弹 toast「标题不能为空」（PC 静默关闭）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:154-157` |
| PC | `src/routes/ChatList.tsx:416-423`（空则 `setRenameForId(null)` 直接关窗） |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:153-157
const trimmed = renameDraft.trim();
if (!trimmed) {
  toast({ title: "标题不能为空", variant: "danger" });
  return;
}
```

**PC 现状**
```tsx
// ChatList.tsx:417-421
const trimmed = renameDraft.trim();
if (!trimmed || trimmed === renameForId.title) {
  setRenameForId(null);
  return;
}
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`ChatList.tsx:417-421`
- 改成：
```tsx
const trimmed = renameDraft.trim();
if (!trimmed) {
  toast({ message: "标题不能为空", variant: "danger" });
  return;
}
if (trimmed === renameForId.title) {
  setRenameForId(null);
  return;
}
```
- 交互：空标题提交 → 不关窗 + danger toast（PC `toast` 用 `message` 字段，见 `src/components/ui/Toast.tsx`）
- **改动量**：5 行

---

#### A1-D2-21 · 重命名「标题未变化」时：web 静默关窗（PC 一致）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:158-161` |
| PC | `src/routes/ChatList.tsx:418-421` |
| 判定 | 已一致 |

**说明**：两者都是「标题未变 → 关闭弹窗、不发请求」，无需改。
- **改动量**：0 行

---

#### A1-D2-22 · 批量删除确认「确认删除」按钮 spinner：web 有内联 spinner（PC 走 `Button` loading）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:303-305` |
| PC | `src/routes/ChatList.tsx:411`（`loading={deleteMutation.isPending}`） |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:303-305
{deleteMutation.isPending && (
  <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
)}
```

**怎么改**
- 随 A1-D2-17 统一处理（改 PC `Button` 的 loading 渲染为 web 的原生 spinner）
- **改动量**：0 行（随 D2-17）

---

#### A1-D2-23 · 删除确认按钮：web `className="gap-2"`（PC 无显式 gap）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:301` |
| PC | `src/components/ui/ConfirmDialog.tsx:60-67` |
| 判定 | 缺失 |

**怎么改**
- 随 A1-D2-18 一起加 `className="gap-2"`
- **改动量**：0 行

---

#### A1-D2-24 · 创建失败 toast：web 分 `title` / `description` 两段（PC 拼成一句）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:88-94` |
| PC | `src/routes/ChatList.tsx:92-93` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:88-94
onError: (err) => {
  toast({
    title: "创建失败",
    description: String((err as Error)?.message || err),
    variant: "danger",
  });
},
```

**PC 现状**
```tsx
// ChatList.tsx:92-93
onError: (err) => {
  toast({
    message: `创建失败: ${err instanceof Error ? err.message : String(err)}`,
    variant: "danger",
  });
},
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`ChatList.tsx:89-92`
- 改成（PC `Toast` 组件是否支持 `title` + `description` 两字段 → **待核** `src/components/ui/Toast.tsx`；若不支持，则 PC 保留单行文案，此条降级为「已一致（Toast 结构不可拆分）」）：
```tsx
onError: (err) => {
  toast({
    title: "创建失败",
    description: String((err as Error)?.message || err),
    variant: "danger",
  });
},
```
- **改动量**：4 行（若 Toast 不支持则 0 行）

---

#### A1-D2-25 · 相对时间格式化：web 用 `date-fns` `formatDistanceToNow` + `zhCN`（PC 自写 `formatRelative`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:413-416` |
| PC | `src/routes/ChatList.tsx:709-721` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:413-416
const relativeTime = formatDistanceToNow(new Date(updatedAt), {
  addSuffix: true,
  locale: zhCN,
});
```

**PC 现状**
```tsx
// ChatList.tsx:709-721
function formatRelative(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = Date.now() - t;
  const min = 60 * 1000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (diff < min) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  return new Date(t).toLocaleDateString();
}
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`function formatRelative`（`ChatList.tsx:709-721`）整体替换
- 需新增依赖：`date-fns`（PC 仓**当前未装** → `npm i date-fns`，web 版本见 `gacode-web/package.json` 的 `date-fns`）
- 改成：
```tsx
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
```
```tsx
const relative = formatDistanceToNow(new Date(chat.updatedAt), {
  addSuffix: true,
  locale: zhCN,
});
```
- 视觉差异（web 实际文案 vs PC 实际文案）：
  - web：`大约 1 分钟前` / `1 分钟前` / `大约 1 小时前` / `1 天前` / `2026年10月20日`（超过 30 天走 `MMMdd` → date-fns 默认 `formatDistanceToNow` >30 天返回 `MMM dd`）
  - PC：`刚刚` / `5 分钟前` / `3 小时前` / `2 天前` / `2026/10/20`
- **改动量**：14 行（含 import）

---

### A1 · D3 档 · 补状态与交互（16-40 行）

---

#### A1-D3-01 · 相对时间非法值兜底：web 抛 `Invalid Date`（PC 返回空串）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:413` |
| PC | `src/routes/ChatList.tsx:711` |
| 判定 | 形态不同 |

**说明**
- web：`formatDistanceToNow(new Date(NaN))` → 抛 `RangeError: Invalid time value`
- PC：`Date.parse(iso)` 非有限 → 返回 `""`
- **怎么改**：1:1 还原应删掉 PC 的兜底（随 A1-D2-25 一起，`formatRelative` 函数整体删除 → 该条自动消解）
- **改动量**：0 行

---

#### A1-D3-02 · 多选栏位置从「底部」搬到「顶部」（元素在 DOM 中的位置变更）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:187-224`（根容器内第一段） |
| PC | `src/routes/ChatList.tsx:346-378`（根容器内最后一段） |
| 判定 | 形态不同 |

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：把 `ChatList.tsx:345-378`（`{/* 多选模式 bottom bar */}` 注释 + `{multiSelectIds.size > 0 ? (…) : null}`）整块**剪出**，插到 `ChatList.tsx:228`（`{/* 顶 Header … */}` 注释行）**之前**
- className 随 A1-D1-17 改为：
```tsx
<div className="sticky top-14 z-30 -mx-4 lg:-mx-8 px-4 lg:px-8 mb-4 py-2 bg-bg-elevated border-b border-border flex items-center gap-3">
```
- 交互：多选态出现时列表整体被顶下 44px；退出多选后回到原位
- **改动量**：4 行（剪+贴，缩进变化不计）

---

#### A1-D3-03 · 多选模式「进入/退出条件」：web `isMultiSelectMode` 与 PC `size > 0` 推导等价（已一致）
| 项 | 值 |
|---|---|
| web | `src/lib/store.ts:205-229`（`isMultiSelectMode` / `enterMultiSelect` / `toggleSelected` / `exitMultiSelect` / `selectAll`）+ `src/app/(main)/chat/page.tsx:175-179`（`enterMultiSelect` 调用点）+ `src/app/(main)/chat/page.tsx:187`（多选栏渲染条件） |
| PC | `src/routes/ChatList.tsx:116`（`multiSelectIds`）+ `src/routes/ChatList.tsx:337`（`{multiSelectIds.size > 0 ? ( … ) : null}`）+ `src/routes/ChatList.tsx:411`（`isInMultiSelect={multiSelectIds.size > 0}`） |
| 判定 | 已一致（无需改） |

**web 源码**
```tsx
// store.ts:207-212
enterMultiSelect: (id) =>
  set((state) => {
    const next = new Set(state.selectedIds);
    next.add(id);
    return { isMultiSelectMode: true, selectedIds: next };
  }),
// store.ts:213-223
toggleSelected: (id) =>
  set((state) => {
    const next = new Set(state.selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    // if list becomes empty, exit multi-select automatically
    if (next.size === 0) {
      return { selectedIds: next, isMultiSelectMode: false };
    }
    return { selectedIds: next };
  }),
// store.ts:224-225
exitMultiSelect: () =>
  set({ isMultiSelectMode: false, selectedIds: new Set() }),
```

**PC 现状**
```tsx
// ChatList.tsx:116
const [multiSelectIds, setMultiSelectIds] = useState<Set<string>>(new Set());
// ChatList.tsx:337
{multiSelectIds.size > 0 ? (
// ChatList.tsx:411
isInMultiSelect={multiSelectIds.size > 0}
```

**判定依据（2026-10-26 复核）**
- web 的 `isMultiSelectMode` 与 `selectedIds.size` **同生同灭**：
  - `enterMultiSelect(id)` 同时置 `mode = true` 并 `add(id)`（`store.ts:207-212`）⇒ 进入模式时集合必非空；
  - `toggleSelected(id)` 在集合变空时**显式置 `isMultiSelectMode: false`**（`store.ts:218-221`，注释写明「if list becomes empty, exit multi-select automatically」）⇒ 取消勾选最后一个 = 退模式；
  - `exitMultiSelect()` = 清空集合 + 退模式（`store.ts:224-225`）。
  - ⇒ 不变式恒成立：**`isMultiSelectMode === (selectedIds.size > 0)`**。
- web 多选栏的渲染条件是 `isMultiSelectMode`（`page.tsx:187`），代入上面的不变式 ≡ `selectedIds.size > 0`；PC 的渲染条件正是 `multiSelectIds.size > 0`（`ChatList.tsx:337`），列表行的 `isInMultiSelect` 同理（`:411`）⇒ **PC 与 web 行为等价**。
- 旧文档写的「web 取消勾选最后一个仍留在多选模式」**与源码矛盾**（`store.ts:218-221` 是空集即退模式）。**本条判定由「形态不同」更正为「已一致」**。
- **PC 不要引入 `isMultiSelectMode` state** —— 引入反而会让「取消勾选最后一个后仍留在多选模式」，与 web 行为**不一致**。
- 交互：长按 500ms 进入；web 的 `enterMultiSelect(chatId)` 会**同时选中该项**（PC 同：`ChatList.tsx` 的 `onLongPress` 里 `next.add(c.id)`）
- **改动量**：0 行

---

#### A1-D3-04 · 「新建对话」按钮在多选模式下应禁用
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:230` |
| PC | `src/routes/ChatList.tsx:386`（`disabled={createMutation.isPending || multiSelectIds.size > 0}`） |
| 判定 | 已一致（无需改） |

**web 源码**
```tsx
// page.tsx:230
disabled={createChatMutation.isPending || isMultiSelectMode}
```

**PC 现状（已落地）**
```tsx
// ChatList.tsx:386
disabled={createMutation.isPending || multiSelectIds.size > 0}
```

**说明**
- web 的 `isMultiSelectMode` ≡ `selectedIds.size > 0`（见 A1-D3-03 的不变式）⇒ PC 用 `multiSelectIds.size > 0` 与 web **语义等价**。
- **PC 不引入 `isMultiSelectMode` state**（A1-D3-03 已更正为「已一致」）⇒ 禁用条件直接用 `multiSelectIds.size > 0`。
- 交互：多选模式下新建按钮 disabled（`disabled:opacity-50 disabled:pointer-events-none`）
- **改动量**：0 行（已落地）

---

#### A1-D3-05 · 「全选」按钮：web 用 store `selectAll()` / `exitMultiSelect()`（PC 已按 web 语义实现）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:203-205`（`allSelected ? exitMultiSelect() : selectAll()`） |
| PC | `src/routes/ChatList.tsx:245-253`（`exitMultiSelect` / `selectAll` 两个 helper）+ `src/routes/ChatList.tsx:352-360`（onClick） |
| 判定 | 已一致（无需改） |

**web 源码**
```tsx
// page.tsx:203-205
onClick={() =>
  allSelected ? exitMultiSelect() : selectAll()
}
```
**PC 现状（已落地）**
```tsx
// ChatList.tsx:245-253
/** 退出多选 — 对齐 web useChatStore.exitMultiSelect (web `src/lib/store.ts:224-225`):
 *  清空勾选集合 + 退出多选模式. PC 的多选栏由 `multiSelectIds.size > 0` 派生,
 *  清空即等于退出模式 —— 跟 web `toggleSelected` 空集自动退模式 (store.ts:218-221) 同语义. */
const exitMultiSelect = () => {
  setMultiSelectIds(new Set());
};

/** 全选 — 对齐 web useChatStore.selectAll (web `src/lib/store.ts:226-229`): 选中当前列表全部 */
const selectAll = () => {
  setMultiSelectIds(new Set(sortedChats.map((c) => c.id)));
};

// ChatList.tsx:352-360
onClick={() => {
  // A1-D3-05 — 对齐 web `chat/page.tsx:203-205`:
  //   `allSelected ? exitMultiSelect() : selectAll()`
  if (allSelected) {
    exitMultiSelect();
  } else {
    selectAll();
  }
}}
```

**判定依据（2026-10-26 更正）**
- 旧文档写「PC 全选后再点 = 清空选中集合但**留在多选模式**（顶部栏还在）」——**与 web 源码矛盾**：web 的 `toggleSelected` 在选中集合变空时显式置 `isMultiSelectMode: false`（`store.ts:218-221`），`exitMultiSelect` = 清空 + 退模式（`store.ts:224-225`）⇒ web「全选后再点」= **退出多选模式**，顶部栏消失。
- PC 的多选栏由 `multiSelectIds.size > 0` 派生（`ChatList.tsx:337`）⇒ 清空集合 = 退出模式，**与 web 完全等价**，本就不存在该差异。
- PC 已按 web 语义落了两个 helper：`exitMultiSelect()`（`:247`）与 `selectAll()`（`:252`），onClick = `allSelected ? exitMultiSelect() : selectAll()`（`:352-360`）。
- **本条判定由「形态不同」更正为「已一致」**。
- **不要**在 onClick 里引入 `setIsMultiSelectMode(false)` —— 该 state 依赖 A1-D3-03，而 A1-D3-03 的前提本身有误（见该条）。
- **改动量**：0 行（已落地）

---

#### A1-D3-06 · 「全选」判定口径：web 用 `chats.length`（未过滤）→ PC 已统一到 `chats`（口径已统一，行为无差异）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:181-182` |
| PC | `src/routes/ChatList.tsx:256-259` |
| 判定 | 已一致（口径已统一，行为无差异） |

**web 源码**
```tsx
// page.tsx:181-182
const allSelected =
  chats.length > 0 && selectedIds.size === chats.length;
```
**PC 现状（已落地）**
```tsx
// ChatList.tsx:256-259
// A1-D3-06 — 全选判定口径对齐 web `chat/page.tsx:181-182`:
//   web 用未排序的 chats (语义 =「所有对话都选中」), PC 原来用 sortedChats
//   (语义 =「当前可见的都选中」). 1:1 还原 → 口径改成 chats.
const allSelected = chats.length > 0 && multiSelectIds.size === chats.length;
```

**判定依据（2026-10-26 更正）**
- PC 的 `chats` 来自 `searchChatsByTitle(searchDebounced)`（`src/routes/ChatList.tsx:88` → `:92`），而该 api 函数**已在客户端**按 keyword 过滤（`src/lib/api.ts:397-406`）；`sortedChats` 只是 `chats` 的「置顶优先 + 时间倒序」版本（`ChatList.tsx:224-231`，`useMemo` 内 `[...chats].sort(...)`）⇒ **两者是同一集合，仅顺序不同**，`chats.length === sortedChats.length` 恒成立。
- 因此旧文档描述的「PC 用 `sortedChats.length`（当前可见口径）vs web 用 `chats.length`（全量口径）」**不是 PC 与 web 的行为差异，而是 PC 内部两个变量名之差**。
- PC 已按文档字面把口径统一到 `chats`（`ChatList.tsx:256-259`）⇒ **行为零变化**。
- **本条判定由「形态不同」更正为「已一致（口径已统一，行为无差异）」**。
- **改动量**：0 行

---

#### A1-D3-07 · PC 缺 `Card` / `CardContent` 组件（web 空态与列表行都依赖）
| 项 | 值 |
|---|---|
| web | `src/components/ui/card.tsx:1-52` |
| PC | PC 缺失（`src/components/ui/` 下无 Card） |
| 判定 | 缺失 |

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\Card.tsx`（新建）
- 骨架（对齐 web `card.tsx`，PC 无 `cn`/twMerge → 手写 className 拼接）：
```tsx
import { forwardRef, type HTMLAttributes } from "react";

export type CardProps = HTMLAttributes<HTMLDivElement>;

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className = "", ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={[
        "rounded-lg border bg-card text-card-foreground shadow",
        className,
      ].filter(Boolean).join(" ")}
      {...rest}
    />
  );
});

export type CardContentProps = HTMLAttributes<HTMLDivElement>;

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  function CardContent({ className = "", ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={["p-6 pt-0", className].filter(Boolean).join(" ")}
        {...rest}
      />
    );
  },
);
```
- 注意：PC 无 tailwind-merge → `p-6 pt-0` 与外部 `p-4` 并存时**不会**去重，CSS 顺序由 tailwind 产物决定（`padding` vs `padding-top` → `pt-0` 与 `p-4` 同为 padding 简写，`.p-4` 出现在 `.p-6` 之后 → `p-4` 赢；但 `.pt-0` 的 `padding-top` 在 `.p-4` 之后 → `pt-0` 赢）→ 实际 padding-top 会变成 0 而非 16px → **必须**在 `CardContent` 内部改成不带 `pt-0` 的 `p-6`，或调用方不用 `CardContent` 的 base padding。**建议**：PC `CardContent` 的 base 直接写 `"p-6"`，调用处用 `p-4` 覆盖（`p-4` 在 tailwind 产物中排在 `p-6` 之后 → 生效）
- 依赖：无新依赖
- **改动量**：45 行

---

#### A1-D3-08 · PC body 基础字号（已核实：PC 与 web 都是 16px，无需改）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:448`（无字号声明 → 继承 body）+ `gacode-web/src/styles/globals.css:232-239`（body **无** `font-size`）+ `gacode-web/tailwind.config.ts:168`（`fontSize.base` = 16px） |
| PC | `src/styles/globals.css:194-201`（body **无** `font-size`）+ `tailwind.config.ts:159`（`fontSize.base` = 16px）+ `src/routes/ChatList.tsx:644`（`font-medium truncate`） |
| 判定 | 已一致 |

**核实结论（2026-10-26）**
- PC `src/styles/globals.css:194-201` 的 `body` 规则（`background-color` / `color` / `font-family` / `font-feature-settings` / `-webkit-font-smoothing` / `-moz-osx-font-smoothing`）**无** `font-size`；web `gacode-web/src/styles/globals.css:232-239` 的 `body` 规则**同样无** `font-size` ⇒ 两边 body 字号都不是由 CSS 显式指定。
- 两边 `tailwind.config.ts` 的 `fontSize.base` 都是 `["16px", { lineHeight: "24px" }]`（PC `tailwind.config.ts:159` / web `:168`）⇒ 继承基准一致（16px）。
- PC 列表标题 `ChatList.tsx:644` 已是 `font-medium truncate`（无 `text-*` 类 → 继承 16px），与 web `chat/page.tsx:448` 逐字一致。
- **本条判定由「待核」更正为「已一致」**；A1-D1-15 也**无需**补 `text-base`（已在正文同步改掉「待核」引用）。
- **改动量**：0 行

---

### A1 · D4 档 · 补组件（>40 行）

---

#### A1-D4-01 · 删除确认：web 是底部 Sheet，PC 是居中 ConfirmDialog
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:279-310` |
| PC | `src/routes/ChatList.tsx:381-393` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:279-310
<Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
  <SheetContent side="bottom">
    <SheetHeader>
      <SheetTitle>确认删除 {selectedIds.size} 条对话？</SheetTitle>
      <SheetDescription>
        此操作不可恢复，对话中的消息将被永久删除。
      </SheetDescription>
    </SheetHeader>
    <SheetFooter>
      <Button
        variant="outline"
        onClick={() => setConfirmOpen(false)}
        disabled={deleteMutation.isPending}
      >
        取消
      </Button>
      <Button
        variant="destructive"
        onClick={() =>
          deleteMutation.mutate(Array.from(selectedIds))
        }
        disabled={deleteMutation.isPending}
        className="gap-2"
      >
        {deleteMutation.isPending && (
          <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
        )}
        确认删除
      </Button>
    </SheetFooter>
  </SheetContent>
</Sheet>
```

**PC 现状**
```tsx
// ChatList.tsx:381-393
{confirmOpen ? (
  <ConfirmDialog
    title={`确认删除 ${multiSelectIds.size} 条对话?`}
    message="此操作不可恢复,对话中的消息也会被删除。"
    confirmLabel="确认删除"
    confirmVariant="danger"
    loading={deleteMutation.isPending}
    onCancel={() => setConfirmOpen(false)}
    onConfirm={() =>
      deleteMutation.mutate(Array.from(multiSelectIds))
    }
  />
) : null}
```

**怎么改**
- 目标文件（新建）：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\Sheet.tsx`
- 目标文件（改）：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 骨架（对齐 web `src/components/ui/sheet.tsx`，PC 无 `cn` → 手写拼接；`Side` 四向）：
```tsx
import { useEffect, type ReactNode } from "react";

export type SheetSide = "right" | "left" | "top" | "bottom";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: SheetSide;
  children: ReactNode;
}

export function Sheet({ open, onOpenChange, side = "right", children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onOpenChange]);

  return <SheetCtx.Provider value={{ open, onOpenChange, side }}>{children}</SheetCtx.Provider>;
}
```
  + `SheetContent` / `SheetHeader` / `SheetTitle` / `SheetDescription` / `SheetFooter` 五个子件，className 逐字抄 web（见下）：

```tsx
const sideClasses: Record<SheetSide, string> = {
  right: "inset-y-0 right-0 w-3/4 max-w-sm border-l animate-slide-in-from-right",
  left: "inset-y-0 left-0 w-3/4 max-w-sm border-r animate-slide-in-from-right",
  top: "inset-x-0 top-0 max-h-[85vh] border-b animate-slide-in-from-top",
  bottom: "inset-x-0 bottom-0 max-h-[85vh] border-t animate-slide-in-from-bottom",
};
```
```tsx
// SheetContent 面板
className={[
  "absolute bg-bg-elevated text-fg shadow-elevation-3 flex flex-col gap-4 p-6",
  sideClasses[effective],
  className,
].filter(Boolean).join(" ")}
```
```tsx
// overlay
className="absolute inset-0 bg-bg-base/80 backdrop-blur-sm animate-fade-in"
// 关闭按钮
className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-bg-elevated"
// SheetHeader
className="flex flex-col space-y-2 text-left"
// SheetTitle
className="text-lg font-semibold text-fg"
// SheetDescription
className="text-sm text-fg-muted"
// SheetFooter
className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-auto pt-4"
```
- 调用方改法（`ChatList.tsx:381-393`）：
```tsx
<Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
  <SheetContent side="bottom">
    <SheetHeader>
      <SheetTitle>确认删除 {multiSelectIds.size} 条对话？</SheetTitle>
      <SheetDescription>
        此操作不可恢复，对话中的消息将被永久删除。
      </SheetDescription>
    </SheetHeader>
    <SheetFooter>
      <Button
        variant="outline"
        onClick={() => setConfirmOpen(false)}
        disabled={deleteMutation.isPending}
      >
        取消
      </Button>
      <Button
        variant="danger"
        onClick={() => deleteMutation.mutate(Array.from(multiSelectIds))}
        disabled={deleteMutation.isPending}
        className="gap-2"
      >
        {deleteMutation.isPending && (
          <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
        )}
        确认删除
      </Button>
    </SheetFooter>
  </SheetContent>
</Sheet>
```
- 交互：overlay 点击关闭（`onClick={() => onOpenChange(false)}`）；ESC 关闭；`document.body` 滚动锁定；右上角 X 关闭按钮（`aria-label="Close"`）；进出场动画 `animate-slide-in-from-bottom`（PC tailwind 已有该 keyframes，`tailwind.config.ts:242-256`，300ms ease-out）
- 注意：PC `Button` 的 `variant` 名是 `danger` / `outline`（非 web 的 `destructive`），见 A1-D2-06
- **改动量**：新增 `Sheet.tsx` ~170 行 + 改 `ChatList.tsx` ~26 行

---

#### A1-D4-02 · 重命名：web 是底部 Sheet（带 Input），PC 是居中 ConfirmDialog（带 children）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:314-358` |
| PC | `src/routes/ChatList.tsx:409-443` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:314-358
<Sheet open={renameOpen} onOpenChange={setRenameOpen}>
  <SheetContent side="bottom">
    <SheetHeader>
      <SheetTitle>重命名对话</SheetTitle>
      <SheetDescription>
        修改后服务端会保留自定义标题 (不会在下次自动生成时覆盖).
      </SheetDescription>
    </SheetHeader>
    <div className="px-4 pb-2">
      <Input
        data-testid="rename-input"
        value={renameDraft}
        onChange={(e) => setRenameDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submitRename();
          }
        }}
        placeholder="输入新标题"
        autoFocus
        maxLength={120}
      />
    </div>
    <SheetFooter>
      <Button
        variant="outline"
        onClick={() => setRenameOpen(false)}
        disabled={renameMutation.isPending}
      >
        取消
      </Button>
      <Button
        onClick={submitRename}
        disabled={renameMutation.isPending || !renameDraft.trim()}
        className="gap-2"
      >
        {renameMutation.isPending && (
          <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
        )}
        保存
      </Button>
    </SheetFooter>
  </SheetContent>
</Sheet>
```

**PC 现状**
```tsx
// ChatList.tsx:409-443
{renameForId ? (
  <ConfirmDialog
    title="重命名对话"
    message=""
    confirmLabel="保存"
    loading={renameMutation.isPending}
    onCancel={() => setRenameForId(null)}
    onConfirm={() => { … }}
  >
    <Input
      value={renameDraft}
      onChange={(e) => setRenameDraft(e.target.value)}
      placeholder="输入新标题"
      maxLength={120}
      autoFocus
      onKeyDown={(e) => { … }}
    />
  </ConfirmDialog>
) : null}
```

**怎么改**
- 依赖 A1-D4-01 的 `Sheet` 组件
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
- 锚点：`ChatList.tsx:409-443` 整块替换
- 改成：
```tsx
<Sheet open={renameOpen} onOpenChange={setRenameOpen}>
  <SheetContent side="bottom">
    <SheetHeader>
      <SheetTitle>重命名对话</SheetTitle>
      <SheetDescription>
        修改后服务端会保留自定义标题 (不会在下次自动生成时覆盖).
      </SheetDescription>
    </SheetHeader>
    <div className="px-4 pb-2">
      <Input
        data-testid="rename-input"
        value={renameDraft}
        onChange={(e) => setRenameDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submitRename();
          }
        }}
        placeholder="输入新标题"
        autoFocus
        maxLength={120}
      />
    </div>
    <SheetFooter>
      <Button
        variant="outline"
        onClick={() => setRenameOpen(false)}
        disabled={renameMutation.isPending}
      >
        取消
      </Button>
      <Button
        onClick={submitRename}
        disabled={renameMutation.isPending || !renameDraft.trim()}
        className="gap-2"
      >
        {renameMutation.isPending && (
          <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
        )}
        保存
      </Button>
    </SheetFooter>
  </SheetContent>
</Sheet>
```
- 需要新增 state（PC 现有 `renameForId` 是对象态，web 是 `renameOpen: boolean` + `renameTarget: {id,currentTitle}`）：
```tsx
  /** 重命名弹窗开关 — 与 web renameOpen 对齐 */
  const [renameOpen, setRenameOpen] = useState(false);
  /** 重命名目标会话 — 与 web renameTarget 对齐 */
  const [renameTarget, setRenameTarget] = useState<{ id: string; currentTitle: string } | null>(null);
```
- 提交函数（对齐 web `submitRename`，`page.tsx:151-163`）：
```tsx
  const submitRename = () => {
    if (!renameTarget) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      toast({ message: "标题不能为空", variant: "danger" });
      return;
    }
    if (trimmed === renameTarget.currentTitle) {
      setRenameOpen(false);
      return;
    }
    renameMutation.mutate({ id: renameTarget.id, title: trimmed });
  };
```
- 打开函数：
```tsx
  const openRename = (id: string, currentTitle: string) => {
    setRenameTarget({ id, currentTitle });
    setRenameDraft(currentTitle || "");
    setRenameOpen(true);
  };
```
- 注意：PC 现有 `renameMutation`（`ChatList.tsx:126-140`）的 `onSuccess` 里 `setRenameForId(null)` → 改成 `setRenameOpen(false); setRenameTarget(null);`
- 交互：Input 回车提交（`e.preventDefault()` 阻止表单默认）；ESC 关闭（Sheet 内置）；overlay 点击关闭
- **改动量**：新增 state 4 行 + 函数 20 行 + 替换块 46 行 ≈ 70 行

---

#### A1-D4-03 · 「新建对话」按钮：从顶栏挪到列表上方独立行
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:227-237` |
| PC | `src/routes/ChatList.tsx:269-276` |
| 判定 | 形态不同 |

**怎么改**
- 已在 A1-D1-25 给出 className；此处补 DOM 位置：
  - 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatList.tsx`
  - 锚点：把 `ChatList.tsx:269-276` 的 `<Button>` 从顶栏 flex 行**剪出**，作为独立 `<div className="mb-6">` 插到 `ChatList.tsx:289`（列表容器）之前
  - 顶栏（`ChatList.tsx:229-277`）保留搜索 + 计数，删掉右侧的 `+ 新建对话` 按钮
- 交互：web 端按钮在内容区左侧（`max-w-3xl` 容器内），`w-full lg:w-auto` → 移动端满宽、桌面端自适应
- **改动量**：4 行（剪贴）

---

#### A1-D4-04 · web Header 标题联动（`setHeaderTitle("对话列表")`）→ PC 按路由派生（已落地）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:69-73`（`setHeaderTitle("对话列表")`） |
| PC | `src/components/layout/AppShell.tsx:56-63`（`resolveTitle(pathname)` 里 `if (pathname === "/chat") return "对话列表";`）+ `src/App.tsx:111-118`（chat 列表路由 = `/chat`）+ `src/components/layout/AppShell.tsx:152-154`（`showHeader` 对 `/chat` 为 true） |
| 判定 | 已一致（无需改） |

**web 源码**
```tsx
// page.tsx:69-73
const setHeaderTitle = useUIStore((s) => s.setHeaderTitle);
useEffect(() => {
  setHeaderTitle("对话列表");
  return () => setHeaderTitle("新对话");
}, [setHeaderTitle]);
```

**PC 现状（已落地）**
```tsx
// AppShell.tsx:56-63
function resolveTitle(pathname: string): string {
  if (pathname === "/") return "首页";
  // 0.7.7 — /chat/* 不再渲染外层 header (ChatDetail 自管 h-12 header).
  //   这里不处理 /chat/* 分支, 避免死代码保留"对话详情"字面量.
  // A1-D4-04 — 对话列表页标题. web 走 store `setHeaderTitle("对话列表")`
  //   (web `src/app/(main)/chat/page.tsx:69-73`); PC 顶栏标题是按路由派生的
  //   (resolveTitle) → 等价物 = /chat → "对话列表".
  if (pathname === "/chat") return "对话列表";
```

**说明**
- PC 顶栏标题**不是静态字面量**，而是由 `resolveTitle(pathname)` 按路由派生（`AppShell.tsx:56-76`）；chat 列表页路由 = `/chat`（`src/App.tsx:111-118`），`showHeader` 对 `/chat` 为 true（`AppShell.tsx:152-154`，只排除 `/` 与 `/chat/*`）⇒ `/chat` 的顶栏标题就是「对话列表」，与 web `setHeaderTitle("对话列表")` 等价。
- 旧文档写的「PC 缺失 / **待核** PC AppShell 是否有等价的 header title 机制 → 见 A3 节」**已过时**：机制存在（路由派生），实现也已落地。
- 注意：web 是「进入 chat 列表页时写 store、离开时还原成『新对话』」，PC 是纯函数按路由派生 ⇒ 无「还原」副作用，但 chat 详情页 `/chat/:id` 走 `ChatDetail` 自管 header（`AppShell.tsx:152-154` 不渲染外层 header），与 web 的两层结构差异见 S-03。
- **改动量**：0 行（已落地）

---

### A1 · 已一致项（确认无需改动）

| # | 项 | web | PC | 说明 |
|---|---|---|---|---|
| A1-OK-01 | 长按 500ms 触发多选 | `page.tsx:52` `LONG_PRESS_MS = 500` | `ChatList.tsx:499` `}, 500);` | 时长一致 |
| A1-OK-02 | 长按用 mouse/touch 事件（非 pointer） | `page.tsx:421-426` | `ChatList.tsx:513-518` | 事件集一致（mousedown/mouseup/mouseleave/touchstart/touchend/touchcancel） |
| A1-OK-03 | 长按触发后屏蔽随后的 click | `page.tsx:408-411`（`triggeredRef`） | `ChatList.tsx:519-521`（`triggeredRef`） | 一致 |
| A1-OK-04 | 多选模式下点击项 = toggle 而非跳转 | `page.tsx:167-173` | `ChatList.tsx:309-315` | 一致 |
| A1-OK-05 | 多选模式下隐藏 ⋮ 菜单 | `page.tsx:454` | `ChatList.tsx:557` | 一致 |
| A1-OK-06 | 标题为空回退「新对话」 | `page.tsx:448` | `ChatList.tsx:551` | 一致 |
| A1-OK-07 | 重命名 Input `maxLength={120}` | `page.tsx:335` | `ChatList.tsx:453` | 一致 |
| A1-OK-08 | 重命名 Input `autoFocus` | `page.tsx:334` | `ChatList.tsx:476` | 一致 |
| A1-OK-09 | 重命名 Input 回车提交 | `page.tsx:327-332` | `ChatList.tsx:431-440` | 一致（PC 少了 `e.preventDefault()`，无表单 → 行为等价） |
| A1-OK-10 | 重命名 toast「已重命名」 | `page.tsx:132` | `ChatList.tsx:131` | 文案一致 |
| A1-OK-11 | 批量删除成功 toast「已删除 N 条对话」 | `page.tsx:101` | `ChatList.tsx:106` | 文案一致 |
| A1-OK-12 | 创建成功后 invalidate `["chats"]` + 跳详情 | `page.tsx:84-87` | `ChatList.tsx:81-87` | 一致（PC 多一步 `scheduleAutoTitle`，属 PC 增强，不在本清单） |
| A1-OK-13 | 长按后进入多选时同时选中该项 | `page.tsx:175-179`（`enterMultiSelect(chatId)`） | `ChatList.tsx:316-322`（`next.add(c.id)`） | 行为一致 |
| A1-OK-14 | 删除按钮文案「删除 (N)」 | `page.tsx:221` | `ChatList.tsx:375` | 一致 |
| A1-OK-15 | 全选/清空按钮文案切换 | `page.tsx:209` | `ChatList.tsx:367` | 一致 |
| A1-OK-16 | 列表行 `data-chat-id` 之外的无障碍标签 `aria-label="对话操作"` | `page.tsx:468` | `ChatList.tsx:561` | 一致 |
| A1-OK-17 | 删除 mutation 成功后 `invalidateQueries(["chats"])` | `page.tsx:104` | `ChatList.tsx:104` | 一致 |

---

## A2 · chat 详情页

web `src/app/(main)/chat/[id]/page.tsx`（1422 行）+ `src/components/chat/ChatInput.tsx`（87 行）↔ PC `src/routes/ChatDetail.tsx`（1275 行）+ `src/components/chat/ChatInputBar.tsx`（752 行）

### A2 · D1 档 · 纯 className / 文案对齐（≤3 行）

---

#### A2-D1-01 · 输入区外层容器：web 有 `border-t border-border p-4 bg-background`（PC 无顶边线、无底色）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatInput.tsx:64` |
| PC | `src/components/chat/ChatInputBar.tsx:502` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// ChatInput.tsx:64
<div className="border-t border-border p-4 bg-background">
```
**PC 现状**
```tsx
// ChatInputBar.tsx:502
<div className="px-4 pb-4 pt-2">
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\ChatInputBar.tsx`
- 锚点：`ChatInputBar.tsx:502`（`{/* 0.7.6 (gaga 截图反馈): 输入区不再垫底板 … */}` 注释之后的那一行）
- 改成：
```tsx
<div className="border-t border-border p-4 bg-background">
```
- 交互：无（纯容器）
- **改动量**：1 行
- 注意：PC 的 `bg-background` token = `#000000`（`tailwind.config.ts:76`），与 web 同

---

#### A2-D1-02 · 输入条卡片：web 是「容器卡 + 无边框 textarea」，PC 是「textarea 自带边框」
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatInputBar.tsx:85-92` |
| PC | `src/components/chat/ChatInputBar.tsx:571-585` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// ChatInputBar.tsx:85-92
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

**PC 现状**
```tsx
// ChatInputBar.tsx:584
className="w-full resize-none bg-bg-sunken border border-border rounded-md px-3 py-2 text-sm leading-6 placeholder:text-fg-subtle focus:outline-none focus:border-brand disabled:opacity-70 max-h-32 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\ChatInputBar.tsx`
- 锚点：`ChatInputBar.tsx:550`（`<div className="flex items-end gap-2">`）— 把这一行替换成 web 的卡片容器，并让 textarea 变成无边框
- 改成：
```tsx
<div
  className={[
    "bg-bg-elevated rounded-md px-4 py-3 flex items-end gap-2",
    "border border-transparent transition-colors duration-150",
    "focus-within:border-border",
    disabled && !isStreaming ? "opacity-60" : "",
    isStreaming ? "border-brand/40" : "",
  ].filter(Boolean).join(" ")}
>
```
- textarea 改成：
```tsx
className="flex-1 bg-transparent text-fg placeholder:text-fg-subtle outline-none text-base leading-6 resize-none max-h-32 py-2 disabled:opacity-60"
```
- 交互：focus 时容器边框由 `border-transparent` → `border-border`（`focus-within:`）；流式中边框 `border-brand/40`；disabled 且非流式时整卡 `opacity-60`
- **改动量**：4 行（容器 7 行 + textarea 1 行，净 +8）

---

#### A2-D1-03 · textarea 字号：web `text-base`（PC `text-sm`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatInputBar.tsx:115-116` |
| PC | `src/components/chat/ChatInputBar.tsx:584` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// ChatInputBar.tsx:115-116
"flex-1 bg-transparent text-fg placeholder:text-fg-subtle outline-none",
"text-base leading-6 resize-none max-h-32 py-2",
```

**怎么改**
- 随 A2-D1-02 一起改（`text-sm` → `text-base`）
- **改动量**：0 行

---

#### A2-D1-04 · textarea 左内边距：web `py-2`（无 px，PC `px-3`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatInputBar.tsx:116` |
| PC | `src/components/chat/ChatInputBar.tsx:584` |
| 判定 | 形态不同 |

**怎么改**
- 随 A2-D1-02 一起改（去掉 `px-3`，保留 `py-2`）
- **改动量**：0 行

---

#### A2-D1-05 · 发送按钮圆角：web `rounded-full`（PC `rounded-md`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatInputBar.tsx:151` |
| PC | `src/components/chat/ChatInputBar.tsx:643` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// ChatInputBar.tsx:150-155
className={cn(
  "shrink-0 w-9 h-9 rounded-full bg-brand text-brand-on",
  "hover:bg-brand-hover transition-colors duration-150",
  "inline-flex items-center justify-center",
  "disabled:opacity-50 disabled:cursor-not-allowed"
)}
```
**PC 现状**
```tsx
// ChatInputBar.tsx:643
className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-md bg-brand text-brand-on hover:bg-brand-hover active:bg-brand-active disabled:opacity-40 disabled:pointer-events-none transition-colors duration-150"
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\ChatInputBar.tsx`
- 锚点：`ChatInputBar.tsx:643`
- 改成：
```tsx
className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-full bg-brand text-brand-on hover:bg-brand-hover transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
```
- 交互：disabled 时 `opacity-50` + `cursor-not-allowed`（PC 是 `opacity-40` + `pointer-events-none`）
- **改动量**：1 行

---

#### A2-D1-06 · 停止按钮圆角：web `rounded-full`（PC `rounded-md`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatInputBar.tsx:137` |
| PC | `src/components/chat/ChatInputBar.tsx:622` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// ChatInputBar.tsx:136-140
className={cn(
  "shrink-0 w-9 h-9 rounded-full bg-danger text-white",
  "hover:bg-danger/90 transition-colors duration-150",
  "inline-flex items-center justify-center"
)}
```
**PC 现状**
```tsx
// ChatInputBar.tsx:622
className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-md bg-danger text-white hover:bg-danger/90 active:opacity-80 transition-colors duration-150"
```

**怎么改**
- 锚点：`ChatInputBar.tsx:622`
- 改成：
```tsx
className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-full bg-danger text-white hover:bg-danger/90 transition-colors duration-150"
```
- **改动量**：1 行

---

#### A2-D1-07 · `+` 附件按钮形态：web 圆形无底色，PC 方形有底色
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatInputBar.tsx:99` |
| PC | `src/components/chat/ChatInputBar.tsx:562` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// ChatInputBar.tsx:95-102
<button
  type="button"
  aria-label="附件"
  onClick={onPlusClick}
  className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center"
>
  <Plus className="w-5 h-5" />
</button>
```
**PC 现状**
```tsx
// ChatInputBar.tsx:562
className="shrink-0 h-9 w-9 rounded-md bg-bg-sunken text-fg-muted hover:bg-bg-elevated hover:text-fg disabled:opacity-50 disabled:pointer-events-none inline-flex items-center justify-center transition-colors duration-150"
```

**怎么改**
- 锚点：`ChatInputBar.tsx:562`
- 改成：
```tsx
className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center"
```
- 注意：web 的 `+` 按钮**不接 disabled**（流式中仍可点）；PC 有 `disabled={isStreaming}`（`ChatInputBar.tsx:559`）→ 1:1 还原需删掉 `disabled` 与 `disabled:opacity-50 disabled:pointer-events-none`
- `aria-label` web 是「附件」，PC 是「添加附件」（`ChatInputBar.tsx:558`）→ 改成 `aria-label="附件"`
- **改动量**：2 行

---

#### A2-D1-08 · 输入条 caption 文案缺失
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatInputBar.tsx:165-177`（由 `ChatInput.tsx:81` 传入） |
| PC | PC 缺失（`ChatInputBar.tsx:497-667` 无 caption 节点） |
| 判定 | 缺失 |

**web 源码**
```tsx
// ChatInput.tsx:81
caption={isStreaming ? "生成中 · 点击停止按钮中断" : "AI 生成内容请核实重要信息"}
// ChatInputBar.tsx:165-177
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

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\ChatInputBar.tsx`
- 锚点：`ChatInputBar.tsx:649`（`</div>` 闭合输入行之后、`{/* 全屏 drag 高亮 — 阶段 4 */}` 注释之前）
- 插：
```tsx
        <p
          className={[
            "mt-2 text-xs text-center flex items-center justify-center gap-1.5",
            isStreaming ? "text-brand" : "text-fg-muted opacity-50",
          ].join(" ")}
        >
          {isStreaming ? (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand animate-pulse" aria-hidden="true" />
          ) : null}
          <span>
            {isStreaming ? "生成中 · 点击停止按钮中断" : "AI 生成内容请核实重要信息"}
          </span>
        </p>
```
- 交互：流式时 brand 色 + 呼吸圆点（`animate-pulse`，Tailwind 默认 2s 循环）
- **改动量**：13 行

---

#### A2-D1-09 · placeholder 文案不一致
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatInput.tsx:74-76` |
| PC | `src/components/chat/ChatInputBar.tsx:578-582` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// ChatInput.tsx:74-76
placeholder={
  isStreaming ? "AI 正在回复..." : "说点什么… (Enter 发送，Shift+Enter 换行)"
}
```
**PC 现状**
```tsx
// ChatInputBar.tsx:578-582
placeholder={
  isStreaming
    ? "正在流式生成… 完成后再发下一条"
    : "说点什么… (Enter 发送, Shift+Enter 换行 · 输入 / 触发命令菜单)"
}
```

**怎么改**
- 锚点：`ChatInputBar.tsx:578-582`
- 改成：
```tsx
                placeholder={
                  isStreaming
                    ? "AI 正在回复..."
                    : "说点什么… (Enter 发送，Shift+Enter 换行)"
                }
```
- **改动量**：1 行

---

#### A2-D1-10 · 用户消息气泡底色：web `bg-primary`（= brand #FF6B35，PC 是 `bg-brand-container` 深棕）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:371` |
| PC | `src/components/chat/MessageBubble.tsx:216` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// MessageBubble.tsx:370-372
: isUser
  ? "bg-primary text-primary-foreground rounded-br-[4px]"
  : "bg-background border border-border text-foreground rounded-bl-[4px]"
```
**PC 现状**
```tsx
// MessageBubble.tsx:216
<div className="rounded-md bg-brand-container text-brand-on-container px-3.5 py-2 text-sm whitespace-pre-wrap break-words leading-relaxed">
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\MessageBubble.tsx`
- 锚点：`MessageBubble.tsx:216`
- 改成：
```tsx
          <div className="rounded-[16px] rounded-br-[4px] bg-primary text-primary-foreground px-4 py-3 text-sm leading-relaxed shadow-sm whitespace-pre-wrap break-words">
```
- 注意：PC tailwind 有 `primary` = `#FF6B35` / `primary-foreground` = `#000000`（`tailwind.config.ts:83-86`）→ 直接可用，**不需新增依赖**
- **改动量**：1 行

---

#### A2-D1-11 · 助手消息气泡：web 有 `border border-border` + `bg-background`（PC 无边框、底色 `bg-bg-sunken`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:372` |
| PC | `src/components/chat/MessageBubble.tsx:323` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// MessageBubble.tsx:372
: "bg-background border border-border text-foreground rounded-bl-[4px]"
```
**PC 现状**
```tsx
// MessageBubble.tsx:323
<div className="rounded-md bg-bg-sunken px-3.5 py-2.5 text-fg text-sm">
```

**怎么改**
- 锚点：`MessageBubble.tsx:323`
- 改成：
```tsx
          <div className="rounded-[16px] rounded-bl-[4px] bg-background border border-border text-foreground px-4 py-3 text-sm leading-relaxed shadow-sm">
```
- **改动量**：1 行

---

#### A2-D1-12 · 气泡内边距：web `px-4 py-3`（PC `px-3.5 py-2` / `px-3.5 py-2.5`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:359` |
| PC | `src/components/chat/MessageBubble.tsx:216`、`323` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// MessageBubble.tsx:358-359
className={cn(
  "max-w-[80%] rounded-[16px] px-4 py-3 text-sm leading-relaxed shadow-sm",
```

**怎么改**
- 随 A2-D1-10 / A2-D1-11 一起改（`px-3.5 py-2` → `px-4 py-3`；`px-3.5 py-2.5` → `px-4 py-3`）
- **改动量**：0 行

---

#### A2-D1-13 · 助手气泡最大宽度：web `max-w-[80%]`（PC `max-w-[85%]`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:359` |
| PC | `src/components/chat/MessageBubble.tsx:301` |
| 判定 | 形态不同 |

**PC 现状**
```tsx
// MessageBubble.tsx:301
<div className="max-w-[85%] space-y-1">
```

**怎么改**
- 锚点：`MessageBubble.tsx:301`
- 改成 `max-w-[80%]`
- **改动量**：1 行

---

#### A2-D1-14 · 流式光标：web `w-2 h-3 bg-current rounded-sm`（PC `w-1.5 h-4 bg-fg-muted ml-0.5 align-middle`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:526` |
| PC | `src/components/chat/MessageBubble.tsx:328` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// MessageBubble.tsx:525-527
{isStreaming && isLast && (
  <span className="inline-block w-2 h-3 bg-current animate-pulse rounded-sm" />
)}
```
**PC 现状**
```tsx
// MessageBubble.tsx:328
className="inline-block w-1.5 h-4 bg-fg-muted ml-0.5 align-middle animate-pulse"
```

**怎么改**
- 锚点：`MessageBubble.tsx:328`
- 改成：
```tsx
                className="inline-block w-2 h-3 bg-current animate-pulse rounded-sm"
```
- 交互：`animate-pulse` 2s 循环
- **改动量**：1 行

---

#### A2-D1-15 · 流式错误 banner 容器形态
| 项 | 值 |
|---|---|
| web | `src/components/chat/StreamingErrorBanner.tsx:121` + `:126-128` |
| PC | `src/components/chat/StreamingErrorBanner.tsx:26` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// StreamingErrorBanner.tsx:120-129
className={cn(
  "mx-auto max-w-3xl w-full px-4 pb-2",
)}
...
className={cn(
  "flex items-center gap-2 rounded-lg border px-3 py-2",
  "border-destructive/50 bg-destructive/10",
  "text-sm text-destructive",
)}
```
**PC 现状**
```tsx
// PC StreamingErrorBanner.tsx:26
<div className="bg-danger-soft/30 px-4 py-3 flex items-start gap-3">
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\StreamingErrorBanner.tsx`
- 锚点：`StreamingErrorBanner.tsx:26`
- 改成（两层结构，外层 `mx-auto max-w-3xl w-full px-4 pb-2`，内层卡片）：
```tsx
    <div className="mx-auto max-w-3xl w-full px-4 pb-2">
      <div className="flex items-center gap-2 rounded-lg border px-3 py-2 border-destructive/50 bg-destructive/10 text-sm text-destructive">
```
- 对应闭合标签同步改（`:26` 的 `</div>` → `</div></div>`）
- 注意：PC tailwind 有 `destructive` = `#E54a5e`（`tailwind.config.ts:101-104`）→ `border-destructive/50` / `bg-destructive/10` / `text-destructive` 直接可用
- **改动量**：4 行

---

#### A2-D1-16 · 错误 banner 图标：web lucide `AlertCircle`（PC 是文字「!」圆片）
| 项 | 值 |
|---|---|
| web | `src/components/chat/StreamingErrorBanner.tsx:131` |
| PC | `src/components/chat/StreamingErrorBanner.tsx:27-32` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// StreamingErrorBanner.tsx:131
<AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
```
**PC 现状**
```tsx
// PC StreamingErrorBanner.tsx:27-32
<div
  aria-hidden="true"
  className="w-5 h-5 rounded-full bg-danger text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5"
>
  !
</div>
```

**怎么改**
- 锚点：`StreamingErrorBanner.tsx:27-32`
- 改成（PC 无 lucide → 自绘 16×16 AlertCircle SVG，strokeWidth 2）：
```tsx
      <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-4 h-4 shrink-0"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
```
- **改动量**：14 行

---

#### A2-D1-17 · 错误 banner「重试」按钮形态：web 是描边小按钮 + RotateCw 图标（PC 是 primary 实心 Button）
| 项 | 值 |
|---|---|
| web | `src/components/chat/StreamingErrorBanner.tsx:139-148` |
| PC | `src/components/chat/StreamingErrorBanner.tsx:38-42` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// StreamingErrorBanner.tsx:135-149
<button
  type="button"
  onClick={onRetry}
  data-testid="streaming-error-retry"
  className={cn(
    "shrink-0 inline-flex items-center gap-1 rounded-md",
    "border border-destructive/40 bg-background px-2 py-1",
    "text-xs font-medium text-destructive",
    "hover:bg-destructive/10 transition-colors",
    "focus:outline-none focus:ring-1 focus:ring-destructive/40",
  )}
>
  <RotateCw className="w-3 h-3" aria-hidden="true" />
  <span>重试</span>
</button>
```
**PC 现状**
```tsx
// PC StreamingErrorBanner.tsx:38-42
{onRetry ? (
  <Button variant="default" size="sm" onClick={onRetry}>
    重试
  </Button>
) : null}
```

**怎么改**
- 锚点：`StreamingErrorBanner.tsx:38-42`
- 改成：
```tsx
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            data-testid="streaming-error-retry"
            className="shrink-0 inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-background px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors focus:outline-none focus:ring-1 focus:ring-destructive/40"
          >
            <RotateCwIcon className="w-3 h-3" />
            <span>重试</span>
          </button>
        ) : null}
```
- 新增图标（插在 `describeStreamingError` 之前）：
```tsx
function RotateCwIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  );
}
```
- **改动量**：28 行

---

#### A2-D1-18 · 错误 banner「关闭」按钮：web 是 X 图标按钮（PC 是「忽略」文字 ghost Button）
| 项 | 值 |
|---|---|
| web | `src/components/chat/StreamingErrorBanner.tsx:150-162` |
| PC | `src/components/chat/StreamingErrorBanner.tsx:43-47` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// StreamingErrorBanner.tsx:150-162
<button
  type="button"
  onClick={onDismiss}
  aria-label="关闭错误提示"
  data-testid="streaming-error-dismiss"
  className={cn(
    "shrink-0 inline-flex items-center justify-center w-6 h-6 rounded",
    "text-destructive/70 hover:text-destructive hover:bg-destructive/10",
    "focus:outline-none focus:ring-1 focus:ring-destructive/40",
  )}
>
  <X className="w-3.5 h-3.5" aria-hidden="true" />
</button>
```
**PC 现状**
```tsx
// PC StreamingErrorBanner.tsx:43-47
{onDismiss ? (
  <Button variant="ghost" size="sm" onClick={onDismiss}>
    忽略
  </Button>
) : null}
```

**怎么改**
- 锚点：`StreamingErrorBanner.tsx:43-47`
- 改成：
```tsx
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="关闭错误提示"
            data-testid="streaming-error-dismiss"
            className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded text-destructive/70 hover:text-destructive hover:bg-destructive/10 focus:outline-none focus:ring-1 focus:ring-destructive/40"
          >
            <XIcon className="w-3.5 h-3.5" />
          </button>
        ) : null}
```
- 新增图标：
```tsx
function XIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}
```
- **改动量**：26 行

---

#### A2-D1-19 · 错误文案格式：web `网络异常,生成中断: {raw}`（PC `网络异常,流式被中断` + 独立 message 行）
| 项 | 值 |
|---|---|
| web | `src/components/chat/StreamingErrorBanner.tsx:47-61` |
| PC | `src/components/chat/StreamingErrorBanner.tsx:54-65` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// StreamingErrorBanner.tsx:51-60
case "network":
  return `网络异常,生成中断: ${raw}`;
case "sse":
  return `连接被截断,生成中断: ${raw}`;
case "server":
  return `服务器错误,生成中断: ${raw}`;
default:
  return `生成失败: ${raw}`;
```
**PC 现状**
```tsx
// PC StreamingErrorBanner.tsx:54-64
case "network":
  return "网络异常,流式被中断";
case "sse":
  return "SSE 协议错误,流式被中断";
case "server":
  return "服务端错误,流式被中断";
default:
  return "流式生成失败";
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\StreamingErrorBanner.tsx`
- 锚点：`StreamingErrorBanner.tsx:54-65`
- 改成（签名加 `raw` 参数）：
```tsx
export function describeStreamingError(kind: StreamingErrorKind, raw = ""): string {
  switch (kind) {
    case "network":
      return `网络异常,生成中断: ${raw}`;
    case "sse":
      return `连接被截断,生成中断: ${raw}`;
    case "server":
      return `服务器错误,生成中断: ${raw}`;
    default:
      return `生成失败: ${raw}`;
  }
}
```
- 渲染层改为单行（随 A2-D1-15 一并）：
```tsx
        <span className="flex-1 min-w-0 break-words" title={message}>
          {message}
        </span>
```
- 调用方 `ChatDetail.tsx:1059` 传 `describeStreamingError(streamError.kind, streamError.message)`
- **改动量**：12 行

---

#### A2-D1-20 · 审批 banner 容器：web `mx-auto max-w-3xl w-full px-4 pb-2`（PC `shrink-0 mx-3 mb-2 ...`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ApprovalBanner.tsx:60` |
| PC | `src/components/chat/ApprovalBanner.tsx:87` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// ApprovalBanner.tsx:59-61
className={cn(
  "mx-auto max-w-3xl w-full px-4 pb-2",
)}
```
**PC 现状**
```tsx
// PC ApprovalBanner.tsx:86-94
className={[
  "shrink-0 mx-3 mb-2 rounded-md border bg-bg-elevated shadow-dialog",
  "p-3 space-y-2",
  topRisk === "high" ? "border-danger/50" : topRisk === "medium" ? "border-warning/50" : "border-border",
].join(" ")}
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\ApprovalBanner.tsx`
- 锚点：`ApprovalBanner.tsx:83-96`（整个根 div）
- 改成（拆成外层容器 + 内层卡片，与 web 一致）：
```tsx
    <div
      role="region"
      aria-label="待审批工具调用"
      className="mx-auto max-w-3xl w-full px-4 pb-2"
    >
      <div
        className="rounded-xl border border-red-500/40 bg-red-500/5 shadow-lg p-3"
      >
        {/* …原有子节点不变… */}
      </div>
    </div>
```
- 注意：PC tailwind **没有** `red-500` / `orange-500` / `green-500` 这套 Tailwind 默认色（PC `tailwind.config.ts` 的 `colors` 段把 `extend.colors` 写了，但 Tailwind 默认调色板仍在 `theme.colors` 里 → `red-500` 等**仍然可用**；不过暗色主题下 web 用的就是这套默认色，PC 与 web 同配置 → 一致）
- **改动量**：8 行

---

#### A2-D1-21 · 审批 banner 标题文案
| 项 | 值 |
|---|---|
| web | `src/components/chat/ApprovalBanner.tsx:72` |
| PC | `src/components/chat/ApprovalBanner.tsx:110-112` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// ApprovalBanner.tsx:71-74
<span className="text-sm font-semibold text-red-600">
  {requests.length > 1 ? `待审批 (${requests.length})` : "待审批"}
</span>
<span className="text-xs text-fg-muted">工具调用需要你确认</span>
```
**PC 现状**
```tsx
// PC ApprovalBanner.tsx:109-113
<p className="text-sm font-medium">
  {requests.length === 1
    ? "工具需要你的授权"
    : `${requests.length} 个工具正在等待你的授权`}
</p>
```

**怎么改**
- 锚点：`ApprovalBanner.tsx:109-113`
- 改成：
```tsx
          <span className="text-sm font-semibold text-red-600">
            {requests.length > 1 ? `待审批 (${requests.length})` : "待审批"}
          </span>
          <span className="text-xs text-fg-muted">工具调用需要你确认</span>
```
- **改动量**：3 行

---

#### A2-D1-22 · 审批 banner 4 按钮布局：web `grid grid-cols-4 gap-1.5 mt-3`（PC `grid grid-cols-2 sm:flex`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ApprovalBanner.tsx:109` |
| PC | `src/components/chat/ApprovalBanner.tsx:136` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// ApprovalBanner.tsx:109
<div className="grid grid-cols-4 gap-1.5 mt-3">
```
**PC 现状**
```tsx
// PC ApprovalBanner.tsx:136
<div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 pt-1">
```

**怎么改**
- 锚点：`ApprovalBanner.tsx:136`
- 改成 `className="grid grid-cols-4 gap-1.5 mt-3"`
- **改动量**：1 行

---

#### A2-D1-23 · 审批按钮「永久」文案：web `永久`（PC `永久允许`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ApprovalBanner.tsx:137` |
| PC | `src/components/chat/ApprovalBanner.tsx:171` |
| 判定 | 形态不同 |

**怎么改**
- 锚点：`ApprovalBanner.tsx:171`
- 改成 `永久`
- **改动量**：1 行

---

#### A2-D1-24 · 审批 banner detail 截断长度：web 180 字（PC 600 字）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ApprovalBanner.tsx:102-104` |
| PC | `src/components/chat/ApprovalBanner.tsx:129-131` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// ApprovalBanner.tsx:100-106
<div className="mt-2 px-2 py-1 rounded bg-bg-elevated/60 text-xs text-fg-muted line-clamp-3">
  {requests[0].detail.length > 180
    ? `${requests[0].detail.slice(0, 180)}…`
    : requests[0].detail}
</div>
```
**PC 现状**
```tsx
// PC ApprovalBanner.tsx:128
<pre className="font-mono text-[11px] text-fg-muted whitespace-pre-wrap break-words leading-relaxed bg-bg-sunken/40 rounded px-2 py-1.5 max-h-24 overflow-y-auto">
```

**怎么改**
- 锚点：`ApprovalBanner.tsx:127-133`
- 改成：
```tsx
      {requests[0]?.detail ? (
        <div className="mt-2 px-2 py-1 rounded bg-bg-elevated/60 text-xs text-fg-muted line-clamp-3">
          {requests[0].detail.length > 180
            ? `${requests[0].detail.slice(0, 180)}…`
            : requests[0].detail}
        </div>
      ) : null}
```
- 注意：web 用 `<div>`（非 `<pre>`、非等宽字体），PC 用 `<pre>` + `font-mono` → 需去掉等宽
- **改动量**：5 行

---

#### A2-D1-25 · 附件区容器：web `mx-auto max-w-3xl w-full px-4 pb-2` + `flex flex-wrap gap-2`（PC `mb-2 flex flex-wrap gap-1.5`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/[id]/page.tsx:1250-1251` |
| PC | `src/components/chat/ChatInputBar.tsx:508` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:1250-1251
<div className="mx-auto max-w-3xl w-full px-4 pb-2">
  <div className="flex flex-wrap gap-2">
```
**PC 现状**
```tsx
// PC ChatInputBar.tsx:508
<div className="mb-2 flex flex-wrap gap-1.5">
```

**怎么改**
- 锚点：`ChatInputBar.tsx:508`
- 改成（外层跟输入区同宽，`max-w-3xl` + `mx-auto`）：
```tsx
            <div className="mx-auto max-w-3xl w-full">
              <div className="flex flex-wrap gap-2 pb-2">
```
- 对应闭合标签需补一层（`:546`）
- **改动量**：5 行

---

#### A2-D1-26 · 附件 chip 底色：web `bg-bg-base shadow-sm`（PC `bg-bg-elevated` 无 shadow）
| 项 | 值 |
|---|---|
| web | `src/components/chat/AttachmentChip.tsx:55` |
| PC | `src/components/chat/AttachmentChip.tsx:50` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// AttachmentChip.tsx:54-56
className={cn(
  "inline-flex items-center gap-2 px-3 py-2 rounded-md bg-bg-base shadow-sm max-w-full",
  className
)}
```
**PC 现状**
```tsx
// PC AttachmentChip.tsx:50
"inline-flex items-center gap-2 px-3 py-2 rounded-md bg-bg-elevated max-w-full",
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\AttachmentChip.tsx`
- 锚点：`AttachmentChip.tsx:50`
- 改成：
```tsx
        "inline-flex items-center gap-2 px-3 py-2 rounded-md bg-bg-base shadow-sm max-w-full",
```
- **改动量**：1 行

---

#### A2-D1-27 · 知识库挂载 chip 形态：web 是 brand-cyan 描边 chip + 逐条可移除（PC 是单一汇总 chip）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/[id]/page.tsx:1311-1331` |
| PC | `src/routes/ChatDetail.tsx:1100-1107` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:1311-1331
<span
  key={r.id}
  data-testid="attached-knowledge-ref"
  data-ref-id={r.id}
  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-brand-cyan/40 bg-brand-cyan/10 text-xs text-brand-cyan"
  title={r.title || r.id}
>
  <span className="font-medium">📚</span>
  <span className="max-w-[160px] truncate">
    {r.title || r.id}
  </span>
  <button
    type="button"
    onClick={() => handleRemoveAttachedRef(r.id)}
    aria-label={`移除已挂载条目 ${r.title || r.id}`}
    data-testid="attached-knowledge-ref-remove"
    className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded text-brand-cyan/70 hover:text-brand-cyan hover:bg-brand-cyan/20 transition-colors"
  >
    ×
  </button>
</span>
```
**PC 现状**
```tsx
// PC ChatDetail.tsx:1100-1107
<div className="shrink-0 px-3 py-1.5 bg-bg-elevated border-t border-border">
  <span
    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-bg-sunken text-[11px] text-fg-muted"
    title={`已挂载 ${pendingKnowledgeRefs.length} 条知识库`}
  >
    📚 已挂载 ×{pendingKnowledgeRefs.length}
  </span>
</div>
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatDetail.tsx`
- 锚点：`ChatDetail.tsx:1099-1108`
- 改成（逐条 chip + 移除按钮）：
```tsx
      {pendingKnowledgeRefs.length > 0 ? (
        <div className="mx-auto max-w-3xl w-full px-4 pb-2">
          <div className="flex flex-wrap gap-2">
            {pendingKnowledgeRefs.map((ref) => (
              <span
                key={ref}
                data-testid="attached-knowledge-ref"
                data-ref-id={ref}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-brand-cyan/40 bg-brand-cyan/10 text-xs text-brand-cyan"
                title={ref}
              >
                <span className="font-medium">📚</span>
                <span className="max-w-[160px] truncate">{ref}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachedRef(ref)}
                  aria-label={`移除已挂载条目 ${ref}`}
                  data-testid="attached-knowledge-ref-remove"
                  className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded text-brand-cyan/70 hover:text-brand-cyan hover:bg-brand-cyan/20 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}
```
- 依赖：PC `pendingKnowledgeRefs` 当前是 `string[]`（只有 id）→ web 是 `Array<{id,title}>`；先按 id 渲染（title 用 id 兜底），若要显示真名需把 state 改成 `{id,title}[]`
- 新增 handler（插在 `handleKnowledgePick` 之后）：
```tsx
  /** 移除一条已挂载的知识库引用 */
  const handleRemoveAttachedRef = useCallback((id: string) => {
    setPendingKnowledgeRefs((prev) => prev.filter((r) => r !== id));
  }, []);
```
- **改动量**：30 行

---

#### A2-D1-28 · 消息列表容器：web `max-w-3xl mx-auto space-y-4`（PC `px-4 py-6 space-y-3`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageList.tsx:79` |
| PC | `src/components/chat/MessageList.tsx:113` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// MessageList.tsx:79
<div className="max-w-3xl mx-auto space-y-4">
```
**PC 现状**
```tsx
// PC MessageList.tsx:111-115
<div
  ref={scrollerRef}
  className="h-full overflow-y-auto px-4 py-6 space-y-3"
  aria-label="消息列表"
>
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\MessageList.tsx`
- 锚点：`MessageList.tsx:113`
- 改成：
```tsx
        className="h-full overflow-y-auto px-4 py-6"
```
- 并在滚动容器内加一层内容容器：
```tsx
        <div className="max-w-3xl mx-auto space-y-4">
          {/* …messages.map… */}
          <div ref={bottomRef} aria-hidden="true" />
        </div>
```
- 交互：气泡间距 web `space-y-4`（16px），PC `space-y-3`（12px）
- **改动量**：6 行

---

#### A2-D1-29 · 消息列表加载态：web 是 4 个异形 Skeleton（PC 是纯文字「加载历史消息…」）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageList.tsx:60-75` |
| PC | `src/routes/ChatDetail.tsx:1068-1071` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// MessageList.tsx:60-75
<div className="max-w-3xl mx-auto space-y-4">
  <div className="flex justify-start">
    <Skeleton className="h-20 w-3/4 rounded-2xl" />
  </div>
  <div className="flex justify-end">
    <Skeleton className="h-16 w-1/2 rounded-2xl" />
  </div>
  <div className="flex justify-start">
    <Skeleton className="h-24 w-2/3 rounded-2xl" />
  </div>
  <div className="flex justify-start">
    <Skeleton className="h-12 w-1/3 rounded-2xl" />
  </div>
</div>
```
**PC 现状**
```tsx
// PC ChatDetail.tsx:1068-1071
<div className="h-full flex items-center justify-center text-fg-muted text-sm">
  加载历史消息…
</div>
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatDetail.tsx`
- 锚点：`ChatDetail.tsx:1068-1071`
- 改成：
```tsx
        {historyQuery.isLoading ? (
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="flex justify-start">
              <div className="animate-pulse rounded-md bg-muted h-20 w-3/4 rounded-2xl" />
            </div>
            <div className="flex justify-end">
              <div className="animate-pulse rounded-md bg-muted h-16 w-1/2 rounded-2xl" />
            </div>
            <div className="flex justify-start">
              <div className="animate-pulse rounded-md bg-muted h-24 w-2/3 rounded-2xl" />
            </div>
            <div className="flex justify-start">
              <div className="animate-pulse rounded-md bg-muted h-12 w-1/3 rounded-2xl" />
            </div>
          </div>
        ) : (
```
- 注意：PC 无 `Skeleton` 组件 → 用等价 div（`animate-pulse rounded-md bg-muted`，PC `bg-muted` = `#181818`）
- **改动量**：16 行

---

#### A2-D1-30 · 「+ 附件」Sheet 网格：web `grid-cols-4 gap-3 py-5 px-4 border-x-0 rounded-t-2xl`（PC `grid-cols-3 gap-y-5 gap-x-2 py-4` + 自带标题栏）
| 项 | 值 |
|---|---|
| web | `src/components/chat/SheetActionMenu.tsx:74` |
| PC | `src/components/chat/PlusActionsSheet.tsx:93` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// SheetActionMenu.tsx:70-75
<SheetContent
  side="bottom"
  className="rounded-t-2xl grid grid-cols-4 gap-3 py-5 px-4 border-x-0"
>
```
**PC 现状**
```tsx
// PC PlusActionsSheet.tsx:92-93
<BottomSheet open={open} title="添加附件" onClose={onClose}>
  <div className="grid grid-cols-3 gap-y-5 gap-x-2 py-4" data-testid="plus-actions-sheet">
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\PlusActionsSheet.tsx`
- 锚点：`PlusActionsSheet.tsx:93`
- 改成（去掉 PC 自带标题栏，改为 web 的 4 列紧凑网格）：
```tsx
    <BottomSheet open={open} title="" onClose={onClose}>
      <div className="grid grid-cols-4 gap-3 py-5 px-4" data-testid="plus-actions-sheet">
```
- 注意：PC `BottomSheet` 强制渲染标题栏（`BottomSheet.tsx:50-55`），web 的 `SheetContent` 没有标题栏 → 若要 1:1 需给 `BottomSheet` 加 `hideTitle?: boolean`（见 A2-D3-05）
- PC 的 `BottomSheet` 面板是 `rounded-t-md max-w-2xl`，web 是 `rounded-t-2xl` + 全宽（`inset-x-0 bottom-0`）→ 见 A2-D3-05
- **改动量**：2 行

---

#### A2-D1-31 · 附件按钮图标尺寸：web `w-6 h-6`（PC 自绘 24×24 strokeWidth 1.8）
| 项 | 值 |
|---|---|
| web | `src/components/chat/SheetActionMenu.tsx:77` |
| PC | `src/components/chat/PlusActionsSheet.tsx:121-139` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// SheetActionMenu.tsx:76-80
<ActionButton
  icon={<ImageIcon className="w-6 h-6" />}
  label="图片"
  onClick={onPickImage}
/>
```
**PC 现状**
```tsx
// PC PlusActionsSheet.tsx:128-132
<svg
  aria-hidden="true"
  width="24"
  height="24"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  strokeWidth="1.8"
  ...
```

**怎么改**
- 锚点：`PlusActionsSheet.tsx:121-240` 的 6 个图标函数
- 全部把 `strokeWidth="1.8"` 改为 `strokeWidth="2"`（lucide 默认 strokeWidth=2）
- **改动量**：6 行

---

#### A2-D1-32 · 附件 Sheet 按钮文字色：web `text-fg-muted hover:text-fg`（PC 一致）
| 项 | 值 |
|---|---|
| web | `src/components/chat/SheetActionMenu.tsx:50` |
| PC | `src/components/chat/PlusActionsSheet.tsx:100` |
| 判定 | 已一致 |

**说明**：web `flex flex-col items-center gap-2 text-fg-muted hover:text-fg transition-colors duration-150` 与 PC `PlusActionsSheet.tsx:100` 逐字一致。**改动量**：0 行

---

#### A2-D1-33 · 附件 Sheet 圆形图标底衬：web `w-14 h-14 rounded-full bg-bg-sunken`（PC 一致）
| 项 | 值 |
|---|---|
| web | `src/components/chat/SheetActionMenu.tsx:52` |
| PC | `src/components/chat/PlusActionsSheet.tsx:104` |
| 判定 | 已一致 |

**说明**：逐字一致。**改动量**：0 行

---

#### A2-D1-34 · 表情选择器搜索框：web 有 Search 图标 + `pl-9 pr-3`（PC 无图标、`px-3`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/EmojiPicker.tsx:138-149` |
| PC | `src/components/home/EmojiPicker.tsx:129-135` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// EmojiPicker.tsx:137-149
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
**PC 现状**
```tsx
// PC home/EmojiPicker.tsx:129-135
<input
  type="text"
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  placeholder="搜索表情 (例如: 笑 / heart)"
  className="w-full rounded-md bg-bg-sunken text-fg placeholder:text-fg-subtle px-3 py-2 text-sm outline-none focus:border-brand focus:border"
/>
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\EmojiPicker.tsx`
- 锚点：`EmojiPicker.tsx:129-135`
- 改成：
```tsx
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索表情 (例如: 笑 / heart)"
            className="w-full pl-9 pr-3 py-2 rounded-md bg-bg-sunken text-fg placeholder:text-fg-subtle outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
```
- 新增图标函数（插在 `EmojiPicker` 组件之前）：
```tsx
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
```
- **改动量**：30 行

---

#### A2-D1-35 · 表情选择器分类 tab 容器：web `mt-3`（PC 无 `mt-3`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/EmojiPicker.tsx:154` |
| PC | `src/components/home/EmojiPicker.tsx:137` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// EmojiPicker.tsx:154
<div className="flex gap-2 mt-3">
```
**PC 现状**
```tsx
// PC home/EmojiPicker.tsx:137
<div className="flex gap-2">
```

**怎么改**
- 锚点：`EmojiPicker.tsx:137`
- 改成 `className="flex gap-2 mt-3"`
- **改动量**：1 行

---

#### A2-D1-36 · 表情 tab 按钮动画：web `transition-colors`（PC 有 `duration-150`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/EmojiPicker.tsx:161` |
| PC | `src/components/home/EmojiPicker.tsx:146` |
| 判定 | 形态不同（PC 更具体，非缺陷） |

**怎么改**
- 1:1 还原 → 把 PC `duration-150` 去掉：`className="px-3 py-1 rounded-full text-xs transition-colors"`；active / hover 色值已一致
- **改动量**：1 行

---

#### A2-D1-37 · 表情选择器选中后是否关面板：web 选中即关（`handleOpenChange(false)`），PC 选中不关
| 项 | 值 |
|---|---|
| web | `src/components/chat/EmojiPicker.tsx:186-189` |
| PC | `src/components/home/EmojiPicker.tsx:172` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// EmojiPicker.tsx:185-189
onClick={() => {
  onSelect(e.emoji);
  handleOpenChange(false);
}}
```
**PC 现状**
```tsx
// PC home/EmojiPicker.tsx:172
onClick={() => onSelect(e.emoji)}
```

**怎么改**
- 锚点：`EmojiPicker.tsx:172`
- 改成：
```tsx
                  onClick={() => {
                    onSelect(e.emoji);
                    handleClose();
                  }}
```
- 交互：PC `handleClose`（`EmojiPicker.tsx:120-123`）清 search + `onClose()` → 关闭面板并把焦点还给输入框
- **改动量**：4 行

---

#### A2-D1-38 · 已撤回占位气泡形态
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:369` + `:376-384` |
| PC | `src/components/chat/MessageBubble.tsx:394` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// MessageBubble.tsx:367-372
isRecalled
  ? // 已撤回占位: 灰色 bg-sunken + 50% 透明文字, 不显示内容
    "bg-muted/60 text-muted-foreground border border-border rounded-[8px]"
  : ...
// MessageBubble.tsx:376-384
{isRecalled ? (
  <div className="flex items-center gap-1.5 italic">
    <span className="text-xs">
      {isUser ? "你撤回了一条消息" : "AI 撤回了一条消息"}
    </span>
    {timeAgo && (
      <span className="text-[10px] opacity-60">· {timeAgo}</span>
    )}
  </div>
) : ( ... )}
```
**PC 现状**
```tsx
// PC MessageBubble.tsx:391-398
<div
  role="note"
  data-testid="msg-recalled-placeholder"
  className="rounded-md bg-bg-sunken/60 text-fg-muted border border-border px-3 py-1.5 text-xs italic flex items-center gap-1.5"
>
```

**怎么改**
- 锚点：`MessageBubble.tsx:394`
- 改成：
```tsx
      className="rounded-[8px] bg-muted/60 text-muted-foreground border border-border px-3 py-1.5 text-xs italic flex items-center gap-1.5"
```
- 注意：web 占位气泡**没有** `px-3 py-1.5`（继承外层气泡的 `px-4 py-3`）→ PC 保留 padding 差异见下条
- **改动量**：1 行

---

#### A2-D1-39 · 消息气泡时间戳常显（PC 缺失）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:501-510` |
| PC | PC 缺失（`MessageBubble.tsx:216` / `:323` 的气泡内无时间戳节点） |
| 判定 | 缺失 |

**web 源码**
```tsx
// MessageBubble.tsx:494-510
<div
  className={cn(
    "mt-1 flex items-center gap-1",
    isUser ? "justify-end" : "justify-start"
  )}
>
  {timeAgo && (
    <span
      className={cn(
        "text-[10px]",
        isUser ? "text-primary-foreground/50" : "text-muted-foreground"
      )}
    >
      {timeAgo}
    </span>
  )}
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\MessageBubble.tsx`
- 锚点：`MessageBubble.tsx:219`（user 气泡 div 闭合之前）与 `MessageBubble.tsx:331`（assistant 气泡 div 闭合之前）
- user 侧插：
```tsx
          <div className="mt-1 flex items-center gap-1 justify-end">
            {timeAgo ? (
              <span className="text-[10px] text-primary-foreground/50">{timeAgo}</span>
            ) : null}
          </div>
```
- assistant 侧插：
```tsx
            <div className="mt-1 flex items-center gap-1 justify-start">
              {timeAgo ? (
                <span className="text-[10px] text-muted-foreground">{timeAgo}</span>
              ) : null}
            </div>
```
- 数据来源：web 用 `formatDistanceToNow(new Date(message.createdAt), { addSuffix: true, locale: zhCN })`（`MessageBubble.tsx:335-337`）→ PC 已有 `formatAgo`（`MessageBubble.tsx:402-419`）但只用于撤回占位 → 需在两个气泡组件里各算一次
- **改动量**：16 行

---

#### A2-D1-40 · 消息时间文案：web date-fns `formatDistanceToNow` + `zhCN`（PC 自写 `formatAgo`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:335-337` |
| PC | `src/components/chat/MessageBubble.tsx:402-419` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// MessageBubble.tsx:335-337
const timeAgo = message.createdAt
  ? formatDistanceToNow(new Date(message.createdAt), { addSuffix: true, locale: zhCN })
  : "";
```
**PC 现状**
```tsx
// PC MessageBubble.tsx:402-419
function formatAgo(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "";
    const dt = Date.now() - t;
    if (dt < 0) return "";
    const sec = Math.floor(dt / 1000);
    if (sec < 60) return `${sec} 秒前`;
    ...
```

**怎么改**
- 同 A1-D2-25：PC 加 `date-fns` 依赖，`formatAgo` 换成
```tsx
function formatAgo(iso: string): string {
  try {
    const t = new Date(iso);
    if (Number.isNaN(t.getTime())) return "";
    return formatDistanceToNow(t, { addSuffix: true, locale: zhCN });
  } catch {
    return "";
  }
}
```
- import：`import { formatDistanceToNow } from "date-fns";` + `import { zhCN } from "date-fns/locale";`
- **改动量**：10 行

---

#### A2-D1-41 · 消息 ⋮ 按钮 hover 顺序：web `hover:bg-bg-sunken text-fg-muted hover:text-fg`（PC 是 `text-fg-muted hover:text-fg hover:bg-bg-sunken`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:548` |
| PC | `src/components/chat/MessageMenu.tsx:253` |
| 判定 | 已一致（类名集合与顺序语义相同） |

**说明**：两者最终生效样式相同（`hover:bg-bg-sunken` + `hover:text-fg` + `text-fg-muted`），仅书写顺序不同；PC 尺寸 `w-7 h-7 rounded-full` 与 web 一致。**改动量**：0 行

---

#### A2-D1-42 · 撤回菜单文案：web「撤回」/「撤回（已超过 2 分钟）」（PC 一致）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:562` |
| PC | `src/components/chat/MessageMenu.tsx:233` |
| 判定 | 已一致 |

**说明**：web `canRecall ? "撤回" : "撤回（已超过 2 分钟）"`，PC 逐字一致；窗口常量两侧都是 `120_000` ms（web `MessageBubble.tsx:54`，PC `MessageMenu.tsx:37`）。**改动量**：0 行

---

### A2 · D2 档 · 补元素 / 补文案（4-15 行）

---

#### A2-D2-01 · chat 详情页顶部 header：web 是全局 `Header` 组件（h-14 sticky），PC 是 ChatDetail 自管 h-12
| 项 | 值 |
|---|---|
| web | `src/components/layout/Header.tsx:174` |
| PC | `src/routes/ChatDetail.tsx:1027` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Header.tsx:174
<header className="sticky top-0 z-30 flex items-center h-14 px-4 border-b bg-background gap-2">
```
**PC 现状**
```tsx
// ChatDetail.tsx:1027
<div className="shrink-0 h-12 bg-bg-elevated px-4 flex items-center justify-between gap-2">
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatDetail.tsx`
- 锚点：`ChatDetail.tsx:1027`
- 改成：
```tsx
      <div className="shrink-0 h-14 px-4 bg-background border-b border-border flex items-center gap-2">
```
- 注意：PC 的 `AppShell` 在 `/chat/*` 路由下**不渲染外层 header**（`AppShell.tsx:121-123`），所以 PC 的 ChatDetail header 就是唯一 header → 高度需与 web `h-14`（56px）一致，且 `AppShell` 里 `top-14` 的 sticky 偏移才正确（见 A1-D1-17）
- 交互：无
- **改动量**：1 行

---

#### A2-D2-02 · chat 详情 header 标题字号：web `font-medium` 继承 16px（PC `text-sm` 14px）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Header.tsx:197-199` |
| PC | `src/routes/ChatDetail.tsx:1028` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Header.tsx:197-199
<div className="flex-1 truncate font-medium min-w-0">
  {title ?? headerTitle}
</div>
```
**PC 现状**
```tsx
// ChatDetail.tsx:1028
<div className="flex-1 min-w-0 truncate font-medium text-sm" title={title}>
```

**怎么改**
- 锚点：`ChatDetail.tsx:1028`
- 改成：
```tsx
        <div className="flex-1 truncate font-medium min-w-0" title={title}>
```
- **改动量**：1 行

---

#### A2-D2-03 · chat 详情 header 右侧「+ 新建聊天」按钮缺失
| 项 | 值 |
|---|---|
| web | `src/components/layout/Header.tsx:204-212` |
| PC | PC 缺失（PC header 只有 ModelChips + ⋮） |
| 判定 | 缺失 |

**web 源码**
```tsx
// Header.tsx:204-212
<button
  type="button"
  aria-label="新建聊天"
  disabled={createChatMutation.isPending}
  onClick={() => createChatMutation.mutate()}
  className="w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors duration-150 inline-flex items-center justify-center disabled:opacity-50"
>
  <Plus className="w-5 h-5" />
</button>
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatDetail.tsx`
- 锚点：`ChatDetail.tsx:1032`（`<ModelChips …>` 之前）
- 插：
```tsx
        <button
          type="button"
          aria-label="新建聊天"
          disabled={createMutation.isPending}
          onClick={() => createMutation.mutate({})}
          className="w-9 h-9 rounded-full text-fg-muted hover:bg-bg-elevated transition-colors duration-150 inline-flex items-center justify-center disabled:opacity-50"
        >
          <PlusIcon className="w-5 h-5" />
        </button>
```
- 新增图标：
```tsx
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M5 12h14" />
      <path d="M12 5v14" />
    </svg>
  );
}
```
- PC 已有 `createChatMutation`（`ChatDetail.tsx` 内有 `createChat` import，`ChatDetail.tsx:79`）→ 确认变量名后直接复用
- **改动量**：24 行

---

#### A2-D2-04 · chat 详情 header ⋮ 菜单：web 是「重命名 / 删除会话」两项 + separator（PC 是三项）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Header.tsx:222-242` |
| PC | `src/routes/ChatDetail.tsx:1037-1050`（`headerMenuItems`，**待核**其项内容） |
| 判定 | 形态不同（**待核** PC `headerMenuItems` 定义） |

**web 源码**
```tsx
// Header.tsx:227-239
<DropdownMenuItem onClick={() => setRenameOpen(true)}>
  <Pencil className="w-4 h-4" />
  重命名
</DropdownMenuItem>
<DropdownMenuSeparator />
<DropdownMenuItem
  destructive
  onClick={() => setDeleteOpen(true)}
>
  <Trash2 className="w-4 h-4" />
  删除会话
</DropdownMenuItem>
```

**怎么改**
- **待核**动作：读 `D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatDetail.tsx` 中 `headerMenuItems` 的定义（在本文件 `ChatDetail.tsx:1037` 之前）
- 若 PC 已是「重命名 / 删除会话」两项 → 判定改为**已一致**；若多出「置顶」项 → 只保留 web 的两项
- 交互：web 切 chat 时强制关菜单（`Header.tsx:104-106`）
- **改动量**：0-8 行

---

#### A2-D2-05 · web 顶部栏重命名弹窗文案（「重命名会话」/「修改当前对话的标题, 影响 Drawer 列表和顶部标题显示。」）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Header.tsx:251-254` |
| PC | `src/routes/ChatDetail.tsx:1214-1215` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Header.tsx:251-254
<AlertDialogTitle>重命名会话</AlertDialogTitle>
<AlertDialogDescription>
  修改当前对话的标题, 影响 Drawer 列表和顶部标题显示。
</AlertDialogDescription>
```
**PC 现状**
```tsx
// PC ChatDetail.tsx:1214-1215
title="重命名对话"
message="为这个对话设置一个新标题。"
```

**怎么改**
- 锚点：`ChatDetail.tsx:1214-1215`
- 改成：
```tsx
          title="重命名会话"
          message="修改当前对话的标题, 影响侧边栏列表和顶部标题显示。"
```
- **改动量**：2 行

---

#### A2-D2-06 · web 顶部栏删除会话弹窗文案（「删除会话?」/「将删除「{title}」及其全部消息, 此操作不可撤销.」）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Header.tsx:295-298` |
| PC | `src/routes/ChatDetail.tsx:1197-1198` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Header.tsx:295-298
<AlertDialogTitle>删除会话?</AlertDialogTitle>
<AlertDialogDescription>
  将删除「{headerTitle || "新对话"}」及其全部消息, 此操作不可撤销.
</AlertDialogDescription>
```
**PC 现状**
```tsx
// PC ChatDetail.tsx:1197-1198
title="删除对话"
message={`确认删除对话 "${title}"? 此操作无法撤销。`}
```

**怎么改**
- 锚点：`ChatDetail.tsx:1197-1198`
- 改成：
```tsx
          title="删除会话?"
          message={`将删除「${title || "新对话"}」及其全部消息, 此操作不可撤销.`}
```
- **改动量**：2 行

---

#### A2-D2-07 · web 重命名弹窗保存按钮 pending 文案（「保存中...」）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Header.tsx:283` |
| PC | PC 缺失（PC `ConfirmDialog` 用 `loading` spinner） |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Header.tsx:283
{renameMutation.isPending ? "保存中..." : "保存"}
```
**PC 现状**
```tsx
// PC ChatDetail.tsx:1216
confirmLabel="保存"
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\ConfirmDialog.tsx`
- 锚点：`ConfirmDialog.tsx:66`（`{confirmLabel}`）
- 改成：
```tsx
          {loading ? "保存中..." : confirmLabel}
```
- 注意：此改动会让「删除」按钮也显示「删除中...」（web 对应文案是「删除中...」，`Header.tsx:311`）→ 一致
- **改动量**：1 行

---

#### A2-D2-08 · web 审批 banner 风险等级 badge（PC 缺失）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ApprovalBanner.tsx:32-46` + `:93` |
| PC | PC 缺失（`ApprovalBanner.tsx:98-108` 用一个圆点代替） |
| 判定 | 缺失 |

**web 源码**
```tsx
// ApprovalBanner.tsx:32-36
const RISK_STYLES = {
  high:   { badge: "bg-red-500/20 text-red-600",      label: "高风险" },
  medium: { badge: "bg-orange-500/20 text-orange-600", label: "中风险" },
  low:    { badge: "bg-green-500/20 text-green-600",   label: "低风险" },
} as const;
// ApprovalBanner.tsx:38-46
function RiskBadge({ level }: { level: ApprovalRequest["riskLevel"] }) {
  const style = RISK_STYLES[level] ?? RISK_STYLES.medium;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium",
        style.badge,
      )}
    >
      {style.label}
    </span>
  );
}
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\ApprovalBanner.tsx`
- 锚点：`ApprovalBanner.tsx:122`（`</span>` 之后，即工具行末尾）加 badge；同时在文件顶部加 `RISK_STYLES` 常量与 `RiskBadge` 组件
- 插：
```tsx
const RISK_STYLES = {
  high: { badge: "bg-red-500/20 text-red-600", label: "高风险" },
  medium: { badge: "bg-orange-500/20 text-orange-600", label: "中风险" },
  low: { badge: "bg-green-500/20 text-green-600", label: "低风险" },
} as const;

function RiskBadge({ level }: { level: ApprovalRequest["riskLevel"] }) {
  const style = RISK_STYLES[level] ?? RISK_STYLES.medium;
  return (
    <span
      className={[
        "inline-flex shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium",
        style.badge,
      ].join(" ")}
    >
      {style.label}
    </span>
  );
}
```
- 工具行改成（对齐 web `ApprovalBanner.tsx:85-94`）：
```tsx
              <div key={req.id} className="flex items-center gap-2 text-sm">
                <span className="text-red-500 w-3 shrink-0 text-center">•</span>
                <span className="font-medium w-[86px] truncate shrink-0">{req.tool}</span>
                <span className="flex-1 truncate text-fg-muted text-xs">{trimmedTitle || req.tool}</span>
                <RiskBadge level={req.riskLevel} />
              </div>
```
- 依赖：`trimmedTitle` 需按 web `ApprovalBanner.tsx:81-83` 计算（去掉 tool 前缀）
- **改动量**：30 行

---

#### A2-D2-09 · 审批 banner「同意一次/本次会话」按钮：web 用 `variant="secondary"`（PC 用裸 button）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ApprovalBanner.tsx:118-131` |
| PC | `src/components/chat/ApprovalBanner.tsx:146-162` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// ApprovalBanner.tsx:118-131
<Button
  variant="secondary"
  size="sm"
  onClick={() => onAction("once", requests[0])}
>
  同意一次
</Button>
<Button
  variant="secondary"
  size="sm"
  onClick={() => onAction("session", requests[0])}
>
  本次会话
</Button>
```
**PC 现状**
```tsx
// PC ApprovalBanner.tsx:150
className="flex-1 min-w-[80px] h-9 rounded-md bg-bg-sunken text-fg text-sm hover:bg-bg-sunken/70 active:opacity-80 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
```

**怎么改**
- 锚点：`ApprovalBanner.tsx:146-162`
- 改成（web `secondary` = `bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80`；PC `secondary` token = `#181818` / `#e5e7eb`，与 web 同值 → 直接用）：
```tsx
        <button
          type="button"
          disabled={!!busy}
          onClick={() => void handleAction("once", requests[0])}
          className="flex-1 min-w-[80px] h-8 rounded-md px-3 text-xs bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
          data-testid="approval-once"
        >
          同意一次
        </button>
```
- 同步「本次会话」按钮
- 注意：web `size="sm"` = `h-8 rounded-md px-3 text-xs`（`button.tsx:19`），PC 现在是 `h-9 … text-sm` → 一并改
- **改动量**：8 行

---

#### A2-D2-10 · 审批 banner「拒绝」按钮配色：web `text-red-600 border-red-500/60 hover:bg-red-500/10`（PC `bg-danger-soft/40 text-danger`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ApprovalBanner.tsx:110-117` |
| PC | `src/components/chat/ApprovalBanner.tsx:137-145` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// ApprovalBanner.tsx:110-117
<Button
  variant="outline"
  size="sm"
  onClick={() => onAction("deny", requests[0])}
  className="text-red-600 border-red-500/60 hover:bg-red-500/10"
>
  拒绝
</Button>
```
**PC 现状**
```tsx
// PC ApprovalBanner.tsx:141
className="flex-1 min-w-[80px] h-9 rounded-md border border-danger/60 bg-danger-soft/40 text-danger text-sm hover:bg-danger-soft/70 active:opacity-80 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
```

**怎么改**
- 锚点：`ApprovalBanner.tsx:141`
- 改成：
```tsx
          className="flex-1 min-w-[80px] h-8 rounded-md px-3 text-xs border border-red-500/60 text-red-600 hover:bg-red-500/10 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
```
- **改动量**：1 行

---

#### A2-D2-11 · 审批 banner「永久」按钮：web `variant="default"`（brand 实心）（PC 一致）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ApprovalBanner.tsx:132-138` |
| PC | `src/components/chat/ApprovalBanner.tsx:164-172` |
| 判定 | 形态不同（尺寸/字号） |

**怎么改**
- 锚点：`ApprovalBanner.tsx:168`
- 改成 `className="flex-1 min-w-[80px] h-8 rounded-md px-3 text-xs bg-brand text-brand-on shadow hover:bg-brand/90 transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"`
- **改动量**：1 行

---

#### A2-D2-12 · web 审批 banner「多个工具共用同一个决策」提示（PC 位置对，文案不同）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ApprovalBanner.tsx`（无此提示，web 标题已含数量） |
| PC | `src/components/chat/ApprovalBanner.tsx:178-182` |
| 判定 | PC 多出（web 无）→ **不列入** |

**说明**：web 端没有这句提示。按「不列 PC 增强」规则，此条不计入差异。

---

#### A2-D2-13 · 消息列表「跳到底」按钮（PC 有，web 无）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageList.tsx`（无） |
| PC | `src/components/chat/MessageList.tsx:158-167` |
| 判定 | PC 多出 → **不列入** |

---

#### A2-D2-14 · web 消息列表空态：PC 有「暂无消息 — 在底部输入框开始你的第一条消息」（web 无）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageList.tsx`（无空态） |
| PC | `src/components/chat/MessageList.tsx:116-120` |
| 判定 | PC 多出 → **不列入** |

---

### A2 · D3 档 · 补状态与交互（16-40 行）

---

#### A2-D3-01 · web「已挂载知识库」chip 需要 title（PC 已逐条渲染 chip 并带 title）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/[id]/page.tsx:1316`（`title={r.title || r.id}`） |
| PC | `src/routes/ChatDetail.tsx:1141-1167`（chip 逐条渲染）+ `src/routes/ChatDetail.tsx:276-280`（state 类型） |
| 判定 | 已一致（无需改） |

**怎么改（已落地）**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\routes\ChatDetail.tsx`
- state 类型（`ChatDetail.tsx:276-280`）：`string[]` → `Array<{ id: string; title: string }>`
```tsx
  /** 已挂载知识库条目 (id + 标题) — 对齐 web attachedKnowledgeRefs
      (web `src/app/(main)/chat/[id]/page.tsx:279-281`) */
  const [pendingKnowledgeRefs, setPendingKnowledgeRefs] = useState<
    Array<{ id: string; title: string }>
  >([]);
```
- 写入（`ChatDetail.tsx:798-808`）：合并去重按 `id`
```tsx
      setPendingKnowledgeRefs((prev) => {
        const next = [...prev];
        for (const it of items) {
          if (!next.some((r) => r.id === it.id)) {
            next.push({ id: it.id, title: it.title || "" });
          }
        }
        return next;
      });
```
- 渲染（`ChatDetail.tsx:1141-1167`）：chip 逐条渲染，补 `data-ref-id` / `title={r.title || r.id}` / aria-label，文本显示标题
```tsx
            {pendingKnowledgeRefs.map((r) => (
              <span
                key={r.id}
                data-testid="attached-knowledge-ref"
                data-ref-id={r.id}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-brand-cyan/40 bg-brand-cyan/10 text-xs text-brand-cyan"
                title={r.title || r.id}
              >
                <span className="font-medium">📚</span>
                <span className="max-w-[160px] truncate">{r.title || r.id}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachedRef(r.id)}
                  aria-label={`移除已挂载条目 ${r.title || r.id}`}
                  data-testid="attached-knowledge-ref-remove"
                  className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded text-brand-cyan/70 hover:text-brand-cyan hover:bg-brand-cyan/20 transition-colors"
                >
                  ×
                </button>
              </span>
            ))}
```
- **旧锚点更正**：旧文档写的 PC 锚点 `ChatDetail.tsx:1103`（`title={已挂载 ${n} 条知识库}`）**不是 chip**，而是 **toast 文案**（现在在 `ChatDetail.tsx:820`）；旧 chip 是「单一汇总 chip」，现已改为逐条渲染。
- **旧函数名更正**：旧文档写的 `handleKnowledgePick` 在 PC **不存在**，实际入口是多选 sheet 的 `onConfirm` = `handleKnowledgeConfirm`（`ChatDetail.tsx:798`、调用处 `:1220`）。
- 移除单个引用：`handleRemoveAttachedRef`（`ChatDetail.tsx:828-830`）按 `id` 过滤。
- **改动量**：0 行（已落地）

---

#### A2-D3-02 · web 发送时把知识库 marker 注入输入框（PC 已落地）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/[id]/page.tsx:1124-1129` |
| PC | `src/routes/ChatDetail.tsx:809-818`（`inputBarRef.current?.insertText(markerText)`） |
| 判定 | 已一致（无需改） |

**web 源码**
```tsx
// page.tsx:1124-1129
const markerText = items
  .map((it) => `@[library:${it.id}] ${it.title || "未命名"}`)
  .join("\n");
chatInputRef.current?.insertText(markerText);
```

**PC 现状（已落地）**
```tsx
// ChatDetail.tsx:809-818
      // A2-D3-02 — 把知识库 marker 注入输入框 (server 未识别 knowledge_refs 时的兜底通道)
      //   对齐 web `src/app/(main)/chat/[id]/page.tsx:1124-1129` (chatInputRef.insertText
      //   → 多个 marker 换行分隔, 用户后续可在输入框编辑).
      //   PC 的 ChatInputBar handle 暴露 insertText (与 insertEmoji 同实现, 按光标插入)。
      if (items.length > 0) {
        const markerText = items
          .map((it) => `@[library:${it.id}] ${it.title || "未命名"}`)
          .join("\n");
        inputBarRef.current?.insertText(markerText);
      }
```

**说明**
- **锚点更正**：注入点不是 `handleKnowledgePick`（PC 里**不存在**这个函数），而是多选 sheet 的 `onConfirm` = `handleKnowledgeConfirm`（`ChatDetail.tsx:798`、调用处 `:1220`）。
- **写法更正**：旧文档建议用 `insertEmoji`，但 PC 的 `ChatInputBarHandle` **已有** `insertText`（声明 `src/components/chat/ChatInputBar.tsx:118-135`，`insertText` 在 `:117`；handle 暴露 `:241`；本体 `insertTextAtCursor` `:586-590`）⇒ 已改用 `insertText`，与 web `chatInputRef.current?.insertText(...)` 逐字对应。
- marker 格式 `@[library:${id}] ${title || "未命名"}`、多行用 `\n` 连接 ⇒ 与 web 一致。
- **改动量**：0 行（已落地）

---

#### A2-D3-03 · web 撤回 / 删除 / 保存知识库的成功 toast 文案（「已撤回」/「已删除」/「已保存到知识库」）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/[id]/page.tsx:930`、`:946`、`:971` |
| PC | `src/components/chat/MessageMenu.tsx:165`、`:188`、`:202` |
| 判定 | 已一致（文案一致） |

**说明**：web 用 `toast({ title: "已撤回", variant: "success" })`，PC 用 `toast({ message: "已撤回", variant: "success" })` → 文案一致，仅字段名不同（web Toast 支持 title+description，PC Toast 只有 message）→ 见 A1-D2-24 的 Toast 结构说明。**改动量**：0 行

---

#### A2-D3-04 · web 撤回窗口判定实时化（PC `canRecallMessage` 同样实时）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/[id]/page.tsx:1025-1032` |
| PC | `src/components/chat/MessageMenu.tsx:63-75` |
| 判定 | 已一致 |

**说明**：web `canRecallFor` 每次 render 用 `Date.now()` 重算；PC `canRecallMessage(messageId, createdAt, recalledOrDeleted)` 默认 `now = Date.now()` → 语义一致。**改动量**：0 行

---

#### A2-D3-05 · PC `BottomSheet` 需要补 web `SheetContent` 的底部形态（无标题栏 / 全宽 / 圆角 2xl）
| 项 | 值 |
|---|---|
| web | `src/components/ui/sheet.tsx:69-74` + `:95` |
| PC | `src/components/ui/BottomSheet.tsx:49-55` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// sheet.tsx:69-74
const sideClasses: Record<Side, string> = {
  right: "inset-y-0 right-0 w-3/4 max-w-sm border-l animate-slide-in-from-right",
  left: "inset-y-0 left-0 w-3/4 max-w-sm border-r animate-slide-in-from-right",
  top: "inset-x-0 top-0 max-h-[85vh] border-b animate-slide-in-from-top",
  bottom: "inset-x-0 bottom-0 max-h-[85vh] border-t animate-slide-in-from-bottom",
};
// sheet.tsx:94-97
className={cn(
  "absolute bg-bg-elevated text-fg shadow-elevation-3 flex flex-col gap-4 p-6",
  sideClasses[effective],
  className
)}
```
**PC 现状**
```tsx
// PC BottomSheet.tsx:49
<div className="relative w-full max-w-2xl rounded-t-md bg-bg-elevated shadow-dialog p-5 max-h-[80vh] flex flex-col">
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\BottomSheet.tsx`
- 锚点：`BottomSheet.tsx:19-27`（props）+ `:49`
- 加 prop：
```tsx
  /** 隐藏内置标题栏 (对齐 web SheetContent — web 的 sheet 无标题栏) */
  hideTitle?: boolean;
```
- 面板 className 改成：
```tsx
        className="relative w-full inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl bg-bg-elevated text-fg shadow-elevation-3 flex flex-col p-6"
```
- 标题栏改成条件渲染：
```tsx
        {hideTitle ? null : (
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h2 className="text-base font-medium">{title}</h2>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="关闭">
              ×
            </Button>
          </div>
        )}
```
- 交互：PC `BottomSheet` 目前**无进出动画**（注释明说「全局 0.1.4 起 transition/animation 禁用」）→ web 是 `animate-slide-in-from-bottom`（300ms ease-out）→ 若 PC 允许动画，加 `animate-slide-in-from-bottom`（PC tailwind 已有该 keyframes，`tailwind.config.ts:242-256`）
- **改动量**：14 行

---

#### A2-D3-06 · web `Sheet` 的 overlay / ESC / 滚动锁（PC `BottomSheet` 无 ESC 关闭）
| 项 | 值 |
|---|---|
| web | `src/components/ui/sheet.tsx:44-56`（ESC + body 滚动锁）+ `:84-88`（overlay 点击关闭） |
| PC | `src/components/ui/BottomSheet.tsx:44-48`（仅 overlay 点击关闭） |
| 判定 | 缺失（ESC 关闭） |

**web 源码**
```tsx
// sheet.tsx:44-56
React.useEffect(() => {
  if (!open) return;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") onOpenChange(false);
  };
  document.addEventListener("keydown", onKey);
  const prev = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  return () => {
    document.removeEventListener("keydown", onKey);
    document.body.style.overflow = prev;
  };
}, [open, onOpenChange]);
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\ui\BottomSheet.tsx`
- 锚点：`BottomSheet.tsx:29-35`（组件函数体开头）
- 插（需把 `if (!open) return null;` 移到 effect 之后或用 `useEffect` 提到组件顶层）：
```tsx
  // ESC 关闭 + body 滚动锁 (对齐 web sheet.tsx:44-56)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
```
- import 补 `useEffect`
- **改动量**：16 行

---

#### A2-D3-07 · web 消息自动滚动用 `scrollIntoView({ behavior: "smooth" })`（PC 直接赋值 scrollTop）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageList.tsx:55-57` |
| PC | `src/components/chat/MessageList.tsx:75-80` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// MessageList.tsx:55-57
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: "smooth" });
}, [chatMessages.length, streamingMessageId]);
```
**PC 现状**
```tsx
// PC MessageList.tsx:75-80
useLayoutEffect(() => {
  if (!autoFollow) return;
  const el = scrollerRef.current;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}, [messages, autoFollow]);
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\MessageList.tsx`
- 锚点：`MessageList.tsx:75-80`
- 改成：
```tsx
  useLayoutEffect(() => {
    if (!autoFollow) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, autoFollow]);
```
- 交互：PC 的 `autoFollow`（用户上滚 80px 阈值停自动滚）是 PC 增强 → 保留不动，只把滚动方式改成平滑
- **改动量**：3 行

---

#### A2-D3-08 · web 消息列表滚动容器 padding（web `p-4`，PC `px-4 py-6`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/[id]/page.tsx:1209` |
| PC | `src/components/chat/MessageList.tsx:113` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// page.tsx:1209
<div className="flex-1 overflow-y-auto p-4">
```
**PC 现状**
```tsx
// PC MessageList.tsx:113
className="h-full overflow-y-auto px-4 py-6 space-y-3"
```

**怎么改**
- 锚点：`MessageList.tsx:113`（随 A2-D1-28 一并）
- 改成 `className="h-full overflow-y-auto p-4"`（内容容器承担 `max-w-3xl mx-auto space-y-4`）
- **改动量**：0 行（随 D1-28）

---

#### A2-D3-09 · web 停止按钮在流式期间**不接 disabled**（PC `ChatInputBar` 的 `+` 按钮接了 disabled）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatInputBar.tsx:122-131`（注释 + 停止键无 disabled） |
| PC | `src/components/chat/ChatInputBar.tsx:559`（`disabled={isStreaming}`） |
| 判定 | 形态不同 |

**怎么改**
- 随 A2-D1-07 一起：删掉 `+` 按钮的 `disabled={isStreaming}` 与 `disabled:opacity-50 disabled:pointer-events-none`
- **改动量**：0 行（随 D1-07）

---

### A2 · D4 档 · 补组件（>40 行）

---

#### A2-D4-01 · web `Sheet` 组件（PC 无等价物）
| 项 | 值 |
|---|---|
| web | `src/components/ui/sheet.tsx:1-176` |
| PC | PC 缺失（PC 只有 `BottomSheet`，形态不同） |
| 判定 | 缺失 |

**怎么改**
- 见 A1-D4-01（同一套 `Sheet` 组件，本条不重复计改动量）
- 依赖：A1-D4-01
- **改动量**：见 A1-D4-01

---

#### A2-D4-02 · web `ExecutionTimeline` 组件（PC 组件文件已建，但**未挂载**，仍只有 ExecutionTiming 一行小字）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ExecutionTimeline.tsx:1-159` |
| PC | `src/components/chat/ExecutionTimeline.tsx`（组件文件**已建**，201 行）但**全仓无 import** —— `src/components/chat/MessageBubble.tsx:372` 仍挂 `ExecutionTiming`（单行计时）；`src/routes/ChatDetail.tsx` 也**无** `chunk.reasoning` → `message.phases` 累积通路 |
| 判定 | 缺失（组件已建、接线未做） |

**web 源码（折叠头）**
```tsx
// ExecutionTimeline.tsx:91-104
<button
  type="button"
  onClick={() => setExpanded((v) => !v)}
  aria-expanded={expanded}
  className="w-full px-2.5 py-1.5 flex items-center gap-1.5 hover:bg-bg-sunken transition-colors text-left"
>
  {expanded ? (
    <ChevronDown className="w-3.5 h-3.5 shrink-0" />
  ) : (
    <ChevronRight className="w-3.5 h-3.5 shrink-0" />
  )}
  <Brain className="w-3.5 h-3.5 shrink-0" />
  <span className="font-medium">{summary}</span>
</button>
// ExecutionTimeline.tsx:76-79
const summary =
  thinking > 0 || tool > 0
    ? `思考 ${thinking} 次 · 工具 ${tool} 次`
    : `${phases.length} 个步骤`;
```

**怎么改**
- 目标文件（新建）：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\ExecutionTimeline.tsx`
- 骨架：
```tsx
export interface ExecutionPhase {
  type: "thinking" | "tool";
  text?: string;
  event?: Record<string, unknown>;
  ts?: number;
}

export interface ExecutionTimelineProps {
  phases: ExecutionPhase[];
  defaultExpanded?: boolean;
}
```
- 容器 className（逐字抄 web `ExecutionTimeline.tsx:83-86`）：
```tsx
      className={[
        "mt-2 rounded-md border border-border/60 bg-bg-sunken/40",
        "text-xs text-fg-muted overflow-hidden",
      ].join(" ")}
```
- 折叠头 className（逐字抄 web `:95`）：
```tsx
          className="w-full px-2.5 py-1.5 flex items-center gap-1.5 hover:bg-bg-sunken transition-colors text-left"
```
- 展开列表容器（web `:108`）：`className="border-t border-border/60 divide-y divide-border/40"`
- thinking 行（web `:116`）：`className="px-2.5 py-1.5"`；按钮 `className="w-full flex items-start gap-1.5 text-left hover:opacity-80"`；展开原文 `className="mt-1.5 ml-4 p-2 rounded bg-bg-base border border-border/40 text-[11px] whitespace-pre-wrap font-mono max-h-48 overflow-y-auto"`
- tool 行（web `:146`）：`className="px-2.5 py-1.5 flex items-center gap-1.5"`
- 交互：点击折叠头切换展开；thinking 行可再点开看原文；`data-testid="execution-timeline"`
- 挂载点：PC `MessageBubble.tsx:311-312`（assistant 气泡正文**上方**，对齐 web `MessageBubble.tsx:396-398`）
- 依赖：PC `ChatMessageModel` 需要新增 `phases?: ExecutionPhase[]` 字段（web `store.Message.phases`）；PC `ChatDetail.tsx` 的流式累积要把 `chunk.reasoning` 收进 `phases`
- **落地状态（2026-10-26 复核）**：组件文件 `src/components/chat/ExecutionTimeline.tsx`（201 行）**已建**，但**全仓无 import** —— `MessageBubble.tsx:372` 仍挂 `ExecutionTiming`，`ChatDetail.tsx` 也没有 `chunk.reasoning` → `message.phases` 的累积通路 ⇒ **本条仍未落地**，判定仍为「缺失」。剩余工作量 ≈ **挂载点 + `phases` 数据通路 ~30 行**（组件本身 ~170 行已完成）。
- **改动量**：0 行（组件已落地）；剩余 ~30 行

---

#### A2-D4-03 · web 用户气泡 markdown 反色（PC 缺失）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:340-342` |
| PC | PC 缺失 |
| 判定 | 缺失 |

**web 源码**
```tsx
// MessageBubble.tsx:340-342
const markdownWrapperClass = isUser
  ? "[&_code]:!bg-primary-foreground/20 [&_pre]:!bg-primary-foreground/10 [&_blockquote]:!border-primary-foreground/40 [&_a]:!text-primary-foreground"
  : "";
// MessageBubble.tsx:401-405
{markdownContent && (
  <div className={markdownWrapperClass}>
    <Markdown>{markdownContent}</Markdown>
  </div>
)}
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\MessageBubble.tsx`
- 锚点：`MessageBubble.tsx:217`（user 气泡 `{content}` 渲染处）
- 改成：
```tsx
            <div className="[&_code]:!bg-primary-foreground/20 [&_pre]:!bg-primary-foreground/10 [&_blockquote]:!border-primary-foreground/40 [&_a]:!text-primary-foreground">
              <Markdown>{content}</Markdown>
            </div>
```
- 注意：PC 的 `Markdown` 来自 `src/lib/markdown.ts`（**本地实现**），web 来自 `src/components/Markdown.tsx`（react-markdown）
- **改动量**：6 行

---

#### A2-D4-04 · PC 用户气泡是纯文本（web 走 Markdown 渲染）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:401-405` |
| PC | `src/components/chat/MessageBubble.tsx:215-219` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// MessageBubble.tsx:401-405
{markdownContent && (
  <div className={markdownWrapperClass}>
    <Markdown>{markdownContent}</Markdown>
  </div>
)}
```
**PC 现状**
```tsx
// PC MessageBubble.tsx:215-219
{content ? (
  <div className="rounded-md bg-brand-container text-brand-on-container px-3.5 py-2 text-sm whitespace-pre-wrap break-words leading-relaxed">
    {content}
  </div>
) : null}
```

**怎么改**
- 随 A2-D1-10 / A2-D1-12 改成：
```tsx
        {content ? (
          <div className="rounded-[16px] rounded-br-[4px] bg-primary text-primary-foreground px-4 py-3 text-sm leading-relaxed shadow-sm">
            <div className="[&_code]:!bg-primary-foreground/20 [&_pre]:!bg-primary-foreground/10 [&_blockquote]:!border-primary-foreground/40 [&_a]:!text-primary-foreground whitespace-pre-wrap break-words">
              <Markdown>{content}</Markdown>
            </div>
          </div>
        ) : null}
```
- 注意：`react-markdown` 版本坑 —— web `^9.0.1` / PC `^10.1.0`（按任务说明）→ `components` 映射回调签名不同（v9: `({node, ...props}) => …`，v10: `({node, children, ...props}) => …`）；此处只渲染默认 Markdown，不传 `components` 映射 → **不受影响**
- **改动量**：6 行

---

#### A2-D4-05 · web 消息「重新发送 / 撤回 / 删除」入口的父层回调链（PC 已有）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/[id]/page.tsx:925-1032` |
| PC | `src/routes/ChatDetail.tsx`（`handleMessageAction`）+ `src/components/chat/MessageMenu.tsx` |
| 判定 | 已一致 |

**说明**：web 的 `recallMutation` / `deleteMutation` / `saveToKnowledgeMutation` + `handleRecall` / `handleDelete` / `handleSaveToKnowledge` / `canRecallFor`，PC 在 `MessageMenu.tsx` 内直接调 api 并通过 `onActionDone` 回调父层 → 能力等价。**改动量**：0 行

---

#### A2-D4-06 · web `stripImageUrls` 渲染层剥图（PC 缺失）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:164-198` + `:311-333` |
| PC | PC 缺失 |
| 判定 | 缺失 |

**web 源码**
```tsx
// MessageBubble.tsx:311-313
const markdownContent = isUser
  ? userDisplayContent
  : stripReferencedImageUrls(displayContent, stripImageUrls ?? []);
```
（`stripReferencedImageUrls` 剥 `![alt](URL)` / `[text](URL)` / 裸 URL 三种形态，URL 比较先剥 `?exp=…&sig=…` query，见 `MessageBubble.tsx:141-198`）

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\chat\MessageBubble.tsx`
- 新增工具函数（抄 web `MessageBubble.tsx:141-198`）：
```tsx
function stripUrlQuery(u: string): string {
  return u.split("?")[0];
}

function normalizeUrls(urls: string[]): string[] {
  return urls.map(stripUrlQuery);
}

export function stripReferencedImageUrls(
  content: string,
  urlsToStrip: string[],
): string {
  if (!content) return content;
  if (!urlsToStrip || urlsToStrip.length === 0) return content;
  const escaped = normalizeUrls(urlsToStrip).map((u) =>
    u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const urlAltGroup = `(?:${escaped.join("|")})`;
  let out = content;
  const imgRe = new RegExp(`!\\[[^\\]]*\\]\\(${urlAltGroup}\\)`, "g");
  out = out.replace(imgRe, "");
  const linkRe = new RegExp(`\\[[^\\]]+\\]\\(${urlAltGroup}\\)`, "g");
  out = out.replace(linkRe, "");
  const bareRe = new RegExp(`(^|\\s)${urlAltGroup}(?=\\s|$)`, "g");
  out = out.replace(bareRe, "$1");
  out = out.replace(/\n{3,}/g, "\n\n");
  return out;
}
```
- `MessageBubbleProps` 加 prop：
```tsx
  /** 渲染前剥除的 URL 集合 (当前 chat 中 user 已上传过的 imageUrls) */
  stripImageUrls?: string[];
```
- assistant 侧渲染时用：
```tsx
  const markdownContent = stripReferencedImageUrls(content, stripImageUrls ?? []);
```
- 父层（`ChatDetail.tsx`）需算 `userImageUrls` 并集（抄 web `page.tsx:433-448`）：
```tsx
  /** 当前 chat 中所有 user message 已上传过的 imageUrls 并集 (渲染层剥图用) */
  const userImageUrls = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const m of messages) {
      if (m.role !== "user") continue;
      for (const u of m.imageUrls ?? []) {
        if (!u || seen.has(u)) continue;
        seen.add(u);
        ordered.push(u);
      }
    }
    return ordered;
  }, [messages]);
```
- **改动量**：新增 ~60 行（含父层 14 行）

---

### A2 · 已一致项（确认无需改动）

| # | 项 | web | PC | 说明 |
|---|---|---|---|---|
| A2-OK-01 | 页面根容器 `flex flex-col h-full` | `page.tsx:1204` | `ChatDetail.tsx:1025` | 一致（PC 多 `bg-bg-base`） |
| A2-OK-02 | 停止按钮 `aria-label="停止生成"` | `ChatInputBar.tsx:134` | `ChatInputBar.tsx:620` | 一致 |
| A2-OK-03 | 发送按钮 `aria-label="发送"` | `ChatInputBar.tsx:147` | `ChatInputBar.tsx:640`（PC 是「发送消息」）→ 文案差 2 字，见 A2-D1-05 同批改 |
| A2-OK-04 | textarea `max-h-32` | `ChatInputBar.tsx:116` | `ChatInputBar.tsx:584` | 一致 |
| A2-OK-05 | 附件 chip 文件名 `truncate max-w-[180px]` | `AttachmentChip.tsx:83` | `AttachmentChip.tsx:82` | 一致 |
| A2-OK-06 | 附件 chip 类型角标 `text-[10px] font-semibold px-1.5 py-0.5 rounded bg-bg-sunken text-fg-muted tracking-wide` | `AttachmentChip.tsx:76` | `AttachmentChip.tsx:74` | 逐字一致 |
| A2-OK-07 | 附件 chip X 按钮 `w-6 h-6 rounded-full` | `AttachmentChip.tsx:92` | `AttachmentChip.tsx:93` | 逐字一致 |
| A2-OK-08 | 附件 chip 缩略图 `w-8 h-8 rounded object-cover shrink-0` | `AttachmentChip.tsx:65` | `AttachmentChip.tsx:60` | 逐字一致 |
| A2-OK-09 | 消息 ⋮ 按钮 `w-7 h-7 rounded-full` | `MessageBubble.tsx:548` | `MessageMenu.tsx:253` | 逐字一致 |
| A2-OK-10 | 撤回窗口常量 120000ms | `MessageBubble.tsx:54` | `MessageMenu.tsx:37` | 一致 |
| A2-OK-11 | 撤回菜单 disabled 文案 | `MessageBubble.tsx:562` | `MessageMenu.tsx:233` | 一致 |
| A2-OK-12 | 保存知识库 fallback：截断 30 字 + `tags:["from-chat"]` | `page.tsx:962-969` | `MessageMenu.tsx:154-164` | 一致 |
| A2-OK-13 | 表情网格 `grid grid-cols-8 gap-1` + 按钮 `w-10 h-10 rounded-md text-2xl` | `EmojiPicker.tsx:181,191` | `home/EmojiPicker.tsx:167,174` | 一致 |
| A2-OK-14 | 表情分类 tab `px-3 py-1 rounded-full text-xs` | `EmojiPicker.tsx:161` | `home/EmojiPicker.tsx:146` | 一致 |
| A2-OK-15 | 表情选中空态「没有匹配的表情」 | `EmojiPicker.tsx:177-179` | `home/EmojiPicker.tsx:163-165` | 一致 |
| A2-OK-16 | 表情面板 `max-h-[70vh]` / PC `BottomSheet` `max-h-[80vh]` | `EmojiPicker.tsx:133` | `BottomSheet.tsx:49` | 差 10vh → 见 A2-D3-05 |
| A2-OK-17 | 流式期间 textarea 禁用 | `ChatInputBar.tsx:112` `disabled={disabled}` ← `ChatInput.tsx:73` ← `page.tsx:1352` `disabled={isSending}` | `ChatInputBar.tsx:583` `disabled={isStreaming}` | 一致（两侧流式中输入框均不可打字；web `ChatInputBar.tsx:71-73` 的「Enter 触发 onAbort」分支因 textarea 被禁用而实际不可达，PC 亦无此路径 → 无行为差异） |

---

## A3 · 侧边栏

web `src/components/layout/Drawer.tsx`（383 行）+ `src/components/layout/Header.tsx`（308 行）↔ PC `src/components/layout/AppShell.tsx`（622 行）

> **已拍板**：PC 侧栏 **256px 常驻**形态保留，不改成 web 的 Drawer 抽屉 → 「常驻 vs 抽屉」不列入结构级差异。本节只对齐**侧栏内部内容与交互**。

### A3 · D1 档 · 纯 className / 文案对齐（≤3 行）

---

#### A3-D1-01 · 顶栏卡片容器：web `m-3 mb-0 p-3`（PC `px-3 pt-3` + 内层 `px-3 py-2`）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:180` |
| PC | `src/components/layout/AppShell.tsx:180-181` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Drawer.tsx:180
<div className="rounded-md bg-bg-elevated m-3 mb-0 p-3 flex items-center gap-2">
```
**PC 现状**
```tsx
// AppShell.tsx:180-181
<div className="px-3 pt-3">
  <div className="flex items-center gap-2 rounded-md bg-bg-elevated px-3 py-2">
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\layout\AppShell.tsx`
- 锚点：`AppShell.tsx:180-181`
- 改成（去掉外层 wrapper，卡片自带外边距）：
```tsx
        <div className="rounded-md bg-bg-elevated m-3 mb-0 p-3 flex items-center gap-2">
```
- 对应 `:203` 的 `</div>` 闭合层级同步调整（原本有 2 层，现在 1 层）
- 视觉差：web 内边距 12px（p-3），PC 是 12px×8px（px-3 py-2）→ 卡片更矮
- **改动量**：3 行

---

#### A3-D1-02 · 侧栏主菜单卡片外边距：web `m-3 mb-0`（PC `px-3 mt-3`）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:205` |
| PC | `src/components/layout/AppShell.tsx:207-208` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Drawer.tsx:205
<nav className="rounded-md bg-bg-elevated m-3 mb-0 p-2 space-y-1">
```
**PC 现状**
```tsx
// AppShell.tsx:207-208
<nav className="px-3 mt-3">
  <div className="rounded-md bg-bg-elevated p-2 space-y-1">
```

**怎么改**
- 锚点：`AppShell.tsx:207-208`
- 改成：
```tsx
        <nav className="rounded-md bg-bg-elevated m-3 mb-0 p-2 space-y-1">
```
- 对应 `:228-229` 闭合标签同步调整
- **改动量**：3 行

---

#### A3-D1-03 · 侧栏对话区卡片外边距：web `rounded-md bg-bg-elevated m-3 p-2`（PC `px-3 mt-3` + 内层卡片）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:231` |
| PC | `src/components/layout/AppShell.tsx:232` + `:336` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Drawer.tsx:231
<section className="flex-1 overflow-y-auto rounded-md bg-bg-elevated m-3 p-2">
```
**PC 现状**
```tsx
// AppShell.tsx:232
<section className="flex-1 overflow-y-auto px-3 mt-3 min-h-0">
...
// AppShell.tsx:336
<div className="rounded-md bg-bg-elevated p-2">
```

**怎么改**
- 锚点：`AppShell.tsx:232`
- 改成：
```tsx
        <section className="flex-1 overflow-y-auto rounded-md bg-bg-elevated m-3 p-2 min-h-0">
```
- 并把 `ChatListPanel` 的根 div（`AppShell.tsx:336`）的 `rounded-md bg-bg-elevated p-2` 去掉（改 `className=""` 或让 `ChatListPanel` 不再自带容器）→ 建议把 `ChatListPanel` 的根 div 改成 `<>` 片段或 `className="contents"`
- 视觉差：web 卡片左右各留 12px 外边距且圆角 16px；PC 卡片也是 12px 但外层滚动区与卡片分离
- **改动量**：4 行

---

#### A3-D1-04 · 菜单项字号：web `text-base font-medium`（PC `text-sm`）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:381` |
| PC | `src/components/layout/AppShell.tsx:217` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Drawer.tsx:378-386
<button
  type="button"
  onClick={onClick}
  className="w-full flex items-center gap-3 px-3 py-2 text-base font-medium rounded-md hover:bg-bg-base transition-colors duration-150"
>
  <Icon className="w-5 h-5 text-fg-muted" />
  <span className="flex-1 text-left">{label}</span>
  <ChevronRight className="w-4 h-4 text-fg-muted" />
</button>
```
**PC 现状**
```tsx
// AppShell.tsx:216-221
className={[
  "w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors duration-150",
  active ? "bg-bg-sunken text-fg font-medium" : "text-fg-muted hover:bg-bg-base hover:text-fg",
].join(" ")}
```

**怎么改**
- 锚点：`AppShell.tsx:217`
- 改成 `w-full flex items-center gap-3 px-3 py-2 text-base font-medium rounded-md hover:bg-bg-base transition-colors duration-150`
- 视觉差：web 菜单项 16px、PC 14px
- **改动量**：1 行

---

#### A3-D1-05 · 菜单项左侧图标缺失（web 有 `Icon w-5 h-5 text-fg-muted`）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:383` |
| PC | PC 缺失（`AppShell.tsx:223-224` 只有文字 + 右箭头） |
| 判定 | 缺失 |

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\layout\AppShell.tsx`
- 锚点：`AppShell.tsx:73-99`（`NAV_ITEMS` 数组定义）
- 每项加 icon 字段：
```tsx
const NAV_ITEMS: NavItem[] = [
  { label: "知识库", to: "/library", icon: <BookOpenIcon />, match: (p) => p === "/library" || p.startsWith("/library/") },
  { label: "交付中心", to: "/deliveries", icon: <PackageOpenIcon />, match: (p) => p === "/deliveries" || p.startsWith("/deliveries/") },
  { label: "日程中心", to: "/schedule", icon: <CalendarIcon />, match: (p) => p === "/schedule" },
  { label: "通知", to: "/notifications", icon: <BellIcon />, match: (p) => p === "/notifications" },
  { label: "浏览器", to: "/browser", icon: <GlobeIcon />, match: (p) => p === "/browser" },
  { label: "我的", to: "/profile", icon: <UserIcon />, match: (p) => p.startsWith("/profile") },
];
```
- `NavItem` 接口加 `icon: ReactNode;`（`AppShell.tsx:67-72`）
- 渲染处（`AppShell.tsx:223` 之前）插：
```tsx
                  <span className="w-5 h-5 shrink-0 text-fg-muted inline-flex items-center justify-center">
                    {item.icon}
                  </span>
```
- 新增 6 个 20×20 SVG 图标函数（插在 `function BellIcon()` 之后，`AppShell.tsx:545` 下面）：lucide BookOpen / PackageOpen / Calendar / Globe / User 的 path，strokeWidth 2
- **改动量**：70 行（图标 6×20 + 结构 8 行）

---

#### A3-D1-06 · 菜单项 active 高亮：PC 有（web Drawer 无 active 态）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:381`（无 active 分支） |
| PC | `src/components/layout/AppShell.tsx:218-220` |
| 判定 | 形态不同 |

**PC 现状**
```tsx
// AppShell.tsx:218-220
active
  ? "bg-bg-sunken text-fg font-medium"
  : "text-fg-muted hover:bg-bg-base hover:text-fg",
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\layout\AppShell.tsx`
- 锚点：`AppShell.tsx:216-221`
- 改成（去掉 active 分支，PC 侧栏常驻更需要 active 提示 —— **此条建议保留 PC active 态，仅统一 hover 色**）：
```tsx
                  className={[
                    "w-full flex items-center gap-3 px-3 py-2 text-base font-medium rounded-md transition-colors duration-150",
                    active
                      ? "bg-bg-sunken text-fg"
                      : "text-fg-muted hover:bg-bg-base hover:text-fg",
                  ].join(" ")}
```
- 说明：web 是抽屉（点完即关，无 active 语义）；PC 常驻侧栏保留 active 高亮是**合理增强**，但 `text-base font-medium` 的字号/字重必须跟 web 一致（见 A3-D1-04）
- **改动量**：2 行

---

#### A3-D1-07 · 菜单项 hover 色：web `hover:bg-bg-base`（PC 额外 `hover:text-fg`）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:381` |
| PC | `src/components/layout/AppShell.tsx:220` |
| 判定 | 形态不同 |

**怎么改**
- 锚点：`AppShell.tsx:220` → 非 active 分支改成 `text-fg-muted hover:bg-bg-base`
- **改动量**：0 行（随 D1-06）

---

#### A3-D1-08 · 铃铛按钮尺寸：web `w-9 h-9`（PC `w-8 h-8`）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:193` |
| PC | `src/components/layout/AppShell.tsx:194` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Drawer.tsx:189-201
<button
  type="button"
  onClick={() => handleNav("/notifications")}
  aria-label="通知"
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
**PC 现状**
```tsx
// AppShell.tsx:194
className="relative w-8 h-8 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center"
```

**怎么改**
- 锚点：`AppShell.tsx:194`
- 改成：
```tsx
              className="relative w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center"
```
- 同时把 PC 的 `BellIcon`（`AppShell.tsx:528-545`，18×18 strokeWidth 1.6）改成 20×20 strokeWidth 2（lucide `Bell` 默认尺寸）
- **改动量**：3 行

---

#### A3-D1-09 · 未读角标位置：web `top-1.5 right-1.5`（PC `top-0.5 right-0.5`）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:197` |
| PC | `src/components/layout/AppShell.tsx:198` |
| 判定 | 形态不同 |

**怎么改**
- 锚点：`AppShell.tsx:198`
- 改成 `className="absolute top-1.5 right-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold bg-brand text-brand-on"`
- **改动量**：1 行

---

#### A3-D1-10 · 用户卡 hover 底色：web `hover:bg-bg-base`（PC `hover:bg-bg-sunken`）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:326` |
| PC | `src/components/layout/AppShell.tsx:245` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Drawer.tsx:323-328
<button
  type="button"
  onClick={() => handleNav("/profile")}
  className="rounded-md bg-bg-elevated m-3 p-3 flex items-center gap-3 text-left hover:bg-bg-base transition-colors duration-150"
  aria-label="我的"
>
```
**PC 现状**
```tsx
// AppShell.tsx:245
className="mx-3 mt-3 rounded-md bg-bg-elevated p-3 flex items-center gap-3 text-left hover:bg-bg-sunken transition-colors duration-150"
```

**怎么改**
- 锚点：`AppShell.tsx:245`
- 改成：
```tsx
          className="rounded-md bg-bg-elevated m-3 p-3 flex items-center gap-3 text-left hover:bg-bg-base transition-colors duration-150"
```
- 注意：web 用户卡是 `m-3`（三边 12px），PC 是 `mx-3 mt-3`（无下边距，因为下面还有登出块）→ 保持 PC 的 `mb` 语义差异，下边距由登出块承担
- **改动量**：1 行

---

#### A3-D1-11 · 用户名字号：web `text-base font-medium`（PC `text-sm font-medium`）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:340-342` |
| PC | `src/components/layout/AppShell.tsx:254` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Drawer.tsx:340-342
<span className="flex-1 min-w-0 truncate text-base font-medium">
  {displayName}
</span>
```
**PC 现状**
```tsx
// AppShell.tsx:254
<span className="flex-1 min-w-0 truncate text-sm font-medium">
```

**怎么改**
- 锚点：`AppShell.tsx:254`
- 改成 `className="flex-1 min-w-0 truncate text-base font-medium"`
- **改动量**：1 行

---

#### A3-D1-12 · 登出按钮形态：web 用 `Button variant="ghost"` + LogOut 图标（PC 裸 button）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:349-359` |
| PC | `src/components/layout/AppShell.tsx:261-270` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Drawer.tsx:347-361
{user && (
  <div className="mx-3 mb-3 space-y-1">
    <Button
      variant="ghost"
      className="w-full justify-start gap-2 text-danger hover:bg-danger-soft/30"
      onClick={() => {
        logout();
        onClose();
      }}
    >
      <LogOut className="w-4 h-4" />
      登出
    </Button>
  </div>
)}
```
**PC 现状**
```tsx
// AppShell.tsx:261-270
<div className="mx-3 mb-3 mt-2">
  <button
    type="button"
    onClick={handleLogout}
    className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-danger hover:bg-danger-soft/30 transition-colors duration-150"
  >
    <LogoutIcon />
    <span>登出</span>
  </button>
</div>
```

**怎么改**
- 锚点：`AppShell.tsx:265`
- 改成（web `Button` ghost base = `inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors …`）：
```tsx
            className="w-full justify-start gap-2 text-danger hover:bg-danger-soft/30"
```
- 注意：PC 端若不用 web `Button` 组件，则 PC `Button` 的 `variant="ghost"` = `bg-transparent text-fg hover:bg-bg-elevated active:bg-bg-sunken`（`Button.tsx:28-29`）→ 需显式覆盖 `text-danger hover:bg-danger-soft/30`
- 建议直接用 PC 的 `Button` 组件（`import { Button } from "../ui/Button";`）：
```tsx
        <div className="mx-3 mb-3 space-y-1">
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-danger hover:bg-danger-soft/30"
            onClick={handleLogout}
          >
            <LogoutIcon />
            <span>登出</span>
          </Button>
        </div>
```
- **改动量**：10 行

---

#### A3-D1-13 · 置顶折叠头内边距：web `px-3 py-2`（PC `px-3 py-1.5`）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:238` |
| PC | `src/components/layout/AppShell.tsx:418` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Drawer.tsx:235-250
<button
  type="button"
  onClick={() => setPinnedOpen((v) => !v)}
  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-fg-muted hover:text-fg transition-colors duration-150"
  aria-expanded={pinnedOpen}
>
  <Pin className="w-4 h-4" />
  <span className="flex-1 text-left">置顶</span>
  <span className="text-xs">{pinnedChats.length}</span>
  <ChevronRight
    className={cn(
      "w-4 h-4 transition-transform duration-150",
      pinnedOpen && "rotate-90"
    )}
  />
</button>
```
**PC 现状**
```tsx
// AppShell.tsx:418
className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-fg-muted hover:text-fg transition-colors duration-150"
```

**怎么改**
- 锚点：`AppShell.tsx:418`
- 改成 `className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-fg-muted hover:text-fg transition-colors duration-150"`
- 同时补 `aria-expanded={open}`
- **改动量**：2 行

---

#### A3-D1-14 · 折叠箭头形态：web `ChevronRight` + 展开时 `rotate-90`（PC `ChevronDown` + 收起时 `-rotate-90`）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:244-249` |
| PC | `src/components/layout/AppShell.tsx:423` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Drawer.tsx:244-249
<ChevronRight
  className={cn(
    "w-4 h-4 transition-transform duration-150",
    pinnedOpen && "rotate-90"
  )}
/>
```
**PC 现状**
```tsx
// AppShell.tsx:423
<ChevronDownIcon className={open ? "" : "-rotate-90"} />
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\layout\AppShell.tsx`
- 锚点：`AppShell.tsx:423` + `function ChevronDownIcon`（`AppShell.tsx:491-508`）
- 改成（新增 ChevronRight 版图标，折叠时向右、展开时旋转 90° 向下）：
```tsx
              <ChevronRightIcon className={open ? "rotate-90" : ""} />
```
```tsx
function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-150 ${className ?? ""}`}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
```
- 交互：`transition-transform duration-150`（150ms），展开态箭头顺时针转 90°
- **改动量**：18 行

---

#### A3-D1-15 · 置顶分组内间距：web `space-y-1 mb-2`（PC `space-y-1`）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:252` |
| PC | `src/components/layout/AppShell.tsx:353` |
| 判定 | 形态不同 |

**怎么改**
- 锚点：`AppShell.tsx:353`
- 改成 `className="space-y-1 mb-2"`
- **改动量**：1 行

---

#### A3-D1-16 · 「最近」分组头内边距：web `px-3 py-2`（PC `px-3 py-1.5`）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:273` |
| PC | `src/components/layout/AppShell.tsx:367` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Drawer.tsx:273-277
<div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-fg-muted">
  <Clock className="w-4 h-4" />
  <span className="flex-1">最近</span>
  <span className="text-xs">{recentChats.length}</span>
</div>
```
**PC 现状**
```tsx
// AppShell.tsx:367
<div className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-fg-muted">
```

**怎么改**
- 锚点：`AppShell.tsx:367`
- 改成 `className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-fg-muted"`
- **改动量**：1 行

---

#### A3-D1-17 · 「查看更多」按钮文案：web `查看更多 (N)`（PC `展开剩余 N 条`）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:308-310` |
| PC | `src/components/layout/AppShell.tsx:387` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Drawer.tsx:301-312
{recentOverflow > 0 && (
  <button
    type="button"
    onClick={() => setShowAllRecent((v) => !v)}
    aria-expanded={showAllRecent}
    className="w-full mt-1 px-3 py-1.5 rounded-md text-xs text-fg-muted hover:text-fg hover:bg-bg-base transition-colors duration-150"
  >
    {showAllRecent
      ? "收起"
      : `查看更多 (${recentOverflow})`}
  </button>
)}
```
**PC 现状**
```tsx
// AppShell.tsx:387
{recentExpanded ? "收起" : `展开剩余 ${recent.length - RECENT_DEFAULT_LIMIT} 条`}
```

**怎么改**
- 锚点：`AppShell.tsx:387`
- 改成：
```tsx
                {recentExpanded ? "收起" : `查看更多 (${recent.length - RECENT_DEFAULT_LIMIT})`}
```
- **改动量**：1 行

---

#### A3-D1-18 · 「查看更多」按钮样式：web 有 `rounded-md hover:bg-bg-base mt-1`（PC 无）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:306` |
| PC | `src/components/layout/AppShell.tsx:385` |
| 判定 | 形态不同 |

**PC 现状**
```tsx
// AppShell.tsx:385
className="w-full text-xs text-fg-muted hover:text-fg transition-colors duration-150 px-3 py-1.5 text-left"
```

**怎么改**
- 锚点：`AppShell.tsx:385`
- 改成：
```tsx
                  className="w-full mt-1 px-3 py-1.5 rounded-md text-xs text-fg-muted hover:text-fg hover:bg-bg-base transition-colors duration-150"
```
- 补 `aria-expanded={recentExpanded}`
- **改动量**：2 行

---

#### A3-D1-19 · 侧栏空态：web `text-sm text-fg-muted opacity-70`（PC `text-xs text-fg-subtle`）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:315-317` |
| PC | `src/components/layout/AppShell.tsx:340-342` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Drawer.tsx:314-318
) : (
  <div className="text-sm text-fg-muted px-3 py-4 text-center opacity-70">
    暂无对话
  </div>
)}
```
**PC 现状**
```tsx
// AppShell.tsx:340-342
<div className="px-3 py-4 text-xs text-fg-subtle text-center">
  暂无对话
</div>
```

**怎么改**
- 锚点：`AppShell.tsx:340-342`
- 改成：
```tsx
        <div className="text-sm text-fg-muted px-3 py-4 text-center opacity-70">
          暂无对话
        </div>
```
- **改动量**：1 行

---

#### A3-D1-20 · 侧栏骨架：web `Skeleton h-12 w-full` ×3（PC `h-7 rounded bg-bg-sunken` ×3）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:279-283` |
| PC | `src/components/layout/AppShell.tsx:456-467` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Drawer.tsx:278-283
{isLoading ? (
  <div className="space-y-2 px-1">
    <Skeleton className="h-12 w-full" />
    <Skeleton className="h-12 w-full" />
    <Skeleton className="h-12 w-full" />
  </div>
) : recentChats.length > 0 ? (
```
**PC 现状**
```tsx
// AppShell.tsx:458-465
<div className="space-y-1.5 p-1">
  {Array.from({ length: 3 }).map((_, i) => (
    <div key={i} className="h-7 rounded bg-bg-sunken animate-pulse" />
  ))}
</div>
```

**怎么改**
- 锚点：`AppShell.tsx:458-465`
- 改成：
```tsx
    <div className="space-y-2 px-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-md bg-muted h-12 w-full" />
      ))}
    </div>
```
- **改动量**：6 行

---

### A3 · D2 档 · 补元素 / 补文案（4-15 行）

---

#### A3-D2-01 · 顶栏 Cody 图标：web 是 32×32 `cody_48.png`（PC 是字母方块）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:181-187` |
| PC | `src/components/layout/AppShell.tsx:182-188` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Drawer.tsx:181-187
<img
  src={`${BASE_PATH}/assets/cody/cody_48.png`}
  alt="Cody"
  width={32}
  height={32}
  className="rounded-xl shrink-0"
/>
```
**PC 现状**
```tsx
// AppShell.tsx:182-188
<div
  aria-hidden="true"
  className="w-7 h-7 rounded-md shrink-0 bg-brand/20 border border-brand/40 flex items-center justify-center text-brand font-bold text-sm"
  style={{ fontFamily: "var(--font-mono)" }}
>
  G
</div>
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\layout\AppShell.tsx`
- 锚点：`AppShell.tsx:182-188`
- 改成（需把 `cody_48.png` 拷到 PC 的 `public/assets/cody/` 下）：
```tsx
            <img
              src="./assets/cody/cody_48.png"
              alt="Cody"
              width={32}
              height={32}
              className="rounded-xl shrink-0"
            />
```
- 依赖：需新增图片资源 `D:\gaga\gaclaw-project\gacode-electron\public\assets\cody\cody_48.png`（从 `gacode-web/public/assets/cody/cody_48.png` 复制）
- **改动量**：7 行 + 1 个资源文件

---

#### A3-D2-02 · 顶栏 brand 文字：web `gacode`（PC 一致）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:188` |
| PC | `src/components/layout/AppShell.tsx:189` |
| 判定 | 已一致 |

**说明**：web `<span className="flex-1 font-medium truncate">gacode</span>` 与 PC 逐字一致。**改动量**：0 行

---

#### A3-D2-03 · 未读角标文案（web `formatUnreadBadge` vs PC 内联 99+）
| 项 | 值 |
|---|---|
| web | `src/lib/notifications.ts:495-498` |
| PC | `src/components/layout/AppShell.tsx:199` |
| 判定 | 已一致 |

**说明**：web `formatUnreadBadge(count)` = `n > 99 ? "99+" : String(n)`；PC `unreadCount > 99 ? "99+" : unreadCount` → 等价。**改动量**：0 行

---

#### A3-D2-04 · 侧栏「日程中心」入口缺失
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:216-220` |
| PC | PC 缺失（PC 无 `/schedule` 路由） |
| 判定 | 缺失 |

**web 源码**
```tsx
// Drawer.tsx:216-220
<DrawerNavItem
  icon={Calendar}
  label="日程中心"
  onClick={() => handleNav("/schedule")}
/>
```

**怎么改**
- **前置依赖**：PC 需先有 `/schedule` 路由（PC `src/routes/` 下无 Schedule 页面）→ 需新建
- 若暂不做日程功能 → 本条**挂起**，在 PC `NAV_ITEMS` 中不放该项
- 若要做 → 目标文件 `D:\gaga\gaclaw-project\gacode-electron\src\routes\Schedule.tsx`（新建）+ `NAV_ITEMS` 加项（见 A3-D1-05）
- **改动量**：挂起（依赖 Schedule 页面，>40 行）

---

#### A3-D2-05 · 侧栏「我的应用」入口（仅 userId==6）缺失
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:221-227` |
| PC | PC 缺失（PC 有 `/profile/apps` 路由但侧栏无入口） |
| 判定 | 缺失 |

**web 源码**
```tsx
// Drawer.tsx:221-227
{isSpecial && (
  <DrawerNavItem
    icon={Package}
    label="我的应用"
    onClick={() => handleNav("/profile/apps")}
  />
)}
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\layout\AppShell.tsx`
- 锚点：`AppShell.tsx:209`（`NAV_ITEMS.map` 之后）
- 插（PC `useAuth()` 的 `user` 对象需确认是否有 `id` 字段 → **待核** `src/lib/auth.ts`）：
```tsx
            {(user?.id ?? "").toString() === "6" ? (
              <button
                type="button"
                onClick={() => navigate("/profile/apps")}
                className="w-full flex items-center gap-3 px-3 py-2 text-base font-medium rounded-md transition-colors duration-150 text-fg-muted hover:bg-bg-base"
              >
                <span className="w-5 h-5 shrink-0 text-fg-muted inline-flex items-center justify-center">
                  <PackageIcon />
                </span>
                <span className="flex-1 text-left">我的应用</span>
                <ChevronRightIcon />
              </button>
            ) : null}
```
- **改动量**：16 行

---

#### A3-D2-06 · PC 顶栏 header（主区域）标题字号：web `flex-1 truncate font-medium`（PC `text-base font-medium … text-center`）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Header.tsx:197-199` |
| PC | `src/components/layout/AppShell.tsx:296-298` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Header.tsx:197-199
<div className="flex-1 truncate font-medium min-w-0">
  {title ?? headerTitle}
</div>
```
**PC 现状**
```tsx
// AppShell.tsx:296-298
<h1 className="flex-1 text-base font-medium truncate min-w-0 text-center">
  {title}
</h1>
```

**怎么改**
- 锚点：`AppShell.tsx:296-298`
- 改成：
```tsx
            <div className="flex-1 truncate font-medium min-w-0">
              {title}
            </div>
```
- 注意：PC 是居中标题（`text-center`），web 是左对齐 → 1:1 还原需去掉 `text-center`；但 PC 顶栏左侧有返回按钮、右侧有占位 `<span className="w-9 h-9" />`（`AppShell.tsx:301`），居中是 PC 的布局选择 → 按 gaga「1:1 还原 web」应改为左对齐
- **改动量**：3 行

---

#### A3-D2-07 · PC 顶栏高度：web `h-14`（56px）（PC `h-14` 已一致）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Header.tsx:174` |
| PC | `src/components/layout/AppShell.tsx:283` |
| 判定 | 已一致 |

**说明**：PC `className="shrink-0 h-14 px-4 bg-bg-base border-b border-border flex items-center gap-2"`，web `className="sticky top-0 z-30 flex items-center h-14 px-4 border-b bg-background gap-2"` → 高度/padding/边框一致；web 额外有 `sticky top-0 z-30`（PC 是 `shrink-0`）→ PC 已在 flex 列里，不需 sticky。**改动量**：0 行

---

### A3 · D3 档 · 补状态与交互（16-40 行）

---

#### A3-D3-01 · 置顶集合的数据通路：web 本地 `pinnedIds` + 乐观更新 + 失败回滚（PC 直接读 `c.pinned`）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:62-65`、`:104-147` |
| PC | `src/components/layout/AppShell.tsx:132` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// Drawer.tsx:62-65
const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
const [pinnedSeeded, setPinnedSeeded] = useState(false);
const [pendingPinId, setPendingPinId] = useState<string | null>(null);
// Drawer.tsx:104-111
useEffect(() => {
  if (!pinnedSeeded && chats.length > 0) {
    setPinnedIds(new Set(chats.filter((c) => c.pinned).map((c) => c.id)));
    setPinnedSeeded(true);
  }
}, [chatsData, pinnedSeeded]);
// Drawer.tsx:114-147
const togglePin = async (chatId: string) => {
  if (pendingPinId === chatId) return; // 防连点
  const wasPinned = pinnedIds.has(chatId);
  const nextPinned = !wasPinned;
  setPinnedIds((prev) => { … });
  setPendingPinId(chatId);
  try {
    await setSessionPin(chatId, nextPinned);
    queryClient.invalidateQueries({ queryKey: ["chats"] });
  } catch (err: any) {
    setPinnedIds((prev) => { /* 回滚 */ });
    toast({ title: nextPinned ? "置顶失败" : "取消置顶失败", description: err?.message || "请稍后重试", variant: "danger" });
  } finally {
    setPendingPinId(null);
  }
};
```

**PC 现状**
```tsx
// AppShell.tsx:132
const pinned = allChats.filter((c) => c.pinned);
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\layout\AppShell.tsx`
- 锚点：`AppShell.tsx:132`（`const pinned = allChats.filter(...)`）
- 改成：
```tsx
  // 本地置顶集合 — 初始化从 server.pinned 种子, 用户 toggle 调 PATCH, 乐观更新 + 失败回滚
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [pinnedSeeded, setPinnedSeeded] = useState(false);
  const [pendingPinId, setPendingPinId] = useState<string | null>(null);

  useEffect(() => {
    if (!pinnedSeeded && allChats.length > 0) {
      setPinnedIds(new Set(allChats.filter((c) => c.pinned).map((c) => c.id)));
      setPinnedSeeded(true);
    }
  }, [allChats, pinnedSeeded]);

  const pinned = allChats.filter((c) => pinnedIds.has(c.id));
  const recent = allChats.filter((c) => !pinnedIds.has(c.id));
```
- 新增 toggle（插在 `handleLogout` 之后）：
```tsx
  /** 置顶 / 取消置顶 — 乐观更新 + 失败回滚 + toast */
  const togglePin = useCallback(async (chatId: string) => {
    if (pendingPinId === chatId) return;
    const wasPinned = pinnedIds.has(chatId);
    const nextPinned = !wasPinned;
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (nextPinned) next.add(chatId);
      else next.delete(chatId);
      return next;
    });
    setPendingPinId(chatId);
    try {
      await setSessionPin(chatId, nextPinned);
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    } catch (err) {
      setPinnedIds((prev) => {
        const next = new Set(prev);
        if (wasPinned) next.add(chatId);
        else next.delete(chatId);
        return next;
      });
      toast({
        message: nextPinned ? "置顶失败" : "取消置顶失败",
        variant: "danger",
      });
    } finally {
      setPendingPinId(null);
    }
  }, [pendingPinId, pinnedIds, queryClient, toast]);
```
- import 补：`setSessionPin` from `../../lib/api`；`useCallback` / `useQueryClient` from react-query
- **改动量**：40 行

---

#### A3-D3-02 · PC `queryClient` 未引入（AppShell 只用 `useQuery`）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:54`（`const queryClient = useQueryClient();`） |
| PC | PC 缺失（`AppShell.tsx:23` 只 import 了 `useQuery`） |
| 判定 | 缺失 |

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\layout\AppShell.tsx`
- 锚点：`AppShell.tsx:23`
- 改成：
```tsx
import { useQuery, useQueryClient } from "@tanstack/react-query";
```
- 在 `AppShell` 函数体开头（`AppShell.tsx:107` 附近）加：
```tsx
  const queryClient = useQueryClient();
```
- 依赖：A3-D3-01
- **改动量**：2 行

---

#### A3-D3-03 · web 「置顶」分组仅在有置顶项时渲染（PC 已一致）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:233` |
| PC | `src/components/layout/AppShell.tsx:345` |
| 判定 | 已一致 |

**说明**：web `{pinnedChats.length > 0 && (…)}`，PC `{pinned.length > 0 ? (…)}` → 一致。**改动量**：0 行

---

#### A3-D3-04 · web 「最近」分组仅在有最近项时渲染（PC 已一致）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:272-318`（无 `recentChats.length > 0 &&` 包裹，但有 `recentChats.length > 0 ? … : 空态`） |
| PC | `src/components/layout/AppShell.tsx:483-522`（分组头常显 + 组内空态） |
| 判定 | 已一致（无需改） |

**PC 现状（已落地）**
```tsx
// AppShell.tsx:483-488
          <div className={pinned.length > 0 ? "mt-2" : ""}>
            <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-fg-muted">
              <ClockIcon />
              <span className="flex-1">最近</span>
              <span className="text-xs">{recent.length}</span>
            </div>
// AppShell.tsx:517-521
            ) : (
              <div className="text-sm text-fg-muted px-3 py-4 text-center opacity-70">
                暂无对话
              </div>
            )}
```
**web 现状**
```tsx
// Drawer.tsx:284-318
) : recentChats.length > 0 ? (
  …
) : (
  <div className="text-sm text-fg-muted px-3 py-4 text-center opacity-70">
    暂无对话
  </div>
)}
```

**判定依据**
- web 的空态渲染在「最近」分组**内部**（分组头始终显示），PC 已按此结构落地：分组头常显（`AppShell.tsx:483-488`），空态在组内（`:517-521`）⇒ 与 web 等价。
- **本条判定由「形态不同」更正为「已一致」**（旧文档标题已写「PC 已一致」但判定栏漏改，属自相矛盾）。
- **改动量**：0 行（已落地）

---

### A3 · 已一致项（确认无需改动）

| # | 项 | web | PC | 说明 |
|---|---|---|---|---|
| A3-OK-01 | 侧栏宽度 | `Drawer.tsx:172` `w-80` | `AppShell.tsx:28` `w-64` | **按 gaga 拍板保留 PC 256px 常驻侧栏**，不改成 w-80；此项记为「已拍板保留」，不列入结构级差异 |
| A3-OK-02 | 顶栏 brand 文字 `flex-1 font-medium truncate` | `Drawer.tsx:188` | `AppShell.tsx:189` | 逐字一致 |
| A3-OK-03 | 未读角标 99+ 封顶 | `notifications.ts:495-498` | `AppShell.tsx:199` | 等价 |
| A3-OK-04 | 「置顶」分组头文案 + 计数 | `Drawer.tsx:242-243` | `AppShell.tsx:421-422` | 一致（`置顶` + 数量） |
| A3-OK-05 | 「最近」分组头文案 + 计数 | `Drawer.tsx:275-276` | `AppShell.tsx:369-370` | 一致 |
| A3-OK-06 | 最近默认显示 5 条 | `Drawer.tsx:99` `slice(0, 5)` | `AppShell.tsx:29` `RECENT_DEFAULT_LIMIT = 5` | 一致 |
| A3-OK-07 | 侧栏「最近」与「置顶」互斥分组 | `Drawer.tsx:97-98` | `AppShell.tsx:132-133` | 一致 |
| A3-OK-08 | 登出文案「登出」 | `Drawer.tsx:358` | `AppShell.tsx:268` | 一致 |
| A3-OK-09 | 置顶默认展开 | `Drawer.tsx:55` `useState(true)` | `AppShell.tsx:326` `useState(true)` | 一致 |

---

## A4 · 对话项组件

web `src/components/chat/ChatItem.tsx`（79 行）↔ PC `src/components/layout/AppShell.tsx` 内的 `function SidebarChatItem`（`AppShell.tsx:430-454`）

### A4 · D1 档 · 纯 className / 文案对齐（≤3 行）

---

#### A4-D1-01 · 标题字号/字重：web `truncate font-medium text-sm flex-1 min-w-0`（PC `flex-1 truncate`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:52` |
| PC | `src/components/layout/AppShell.tsx:451` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// ChatItem.tsx:51-52
<div className="flex items-center gap-2">
  <div className="truncate font-medium text-sm flex-1 min-w-0">{title || "新对话"}</div>
```
**PC 现状**
```tsx
// AppShell.tsx:451
<span className="flex-1 truncate">{chat.title || "新对话"}</span>
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\layout\AppShell.tsx`
- 锚点：`AppShell.tsx:451`
- 改成：
```tsx
        <span className="truncate font-medium text-sm flex-1 min-w-0">
          {chat.title || "新对话"}
        </span>
```
- **改动量**：3 行

---

#### A4-D1-02 · active 态底色：web `bg-accent`（PC `bg-bg-sunken text-fg font-medium`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:46-49` |
| PC | `src/components/layout/AppShell.tsx:445-447` |
| 判定 | 形态不同 |

**web 源码**
```tsx
// ChatItem.tsx:46-49
className={cn(
  "w-full text-left px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  isActive && "bg-accent"
)}
```
**PC 现状**
```tsx
// AppShell.tsx:445-447
isActive
  ? "bg-bg-sunken text-fg font-medium"
  : "text-fg-muted hover:bg-bg-base hover:text-fg",
```

**怎么改**
- 锚点：`AppShell.tsx:443-448`
- 改成：
```tsx
      className={[
        "w-full text-left px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive ? "bg-accent" : "",
      ].join(" ")}
```
- 注意：PC 的 `accent` token = `#1f1f1f`（`tailwind.config.ts:96-99`），web 同 → 一致
- **改动量**：4 行

---

#### A4-D1-03 · 非 active 态文字色：web 继承 `text-fg`（PC `text-fg-muted`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:47` |
| PC | `src/components/layout/AppShell.tsx:447` |
| 判定 | 形态不同 |

**怎么改**
- 随 A4-D1-02 一起：去掉 `text-fg-muted hover:text-fg` 分支（web 只有 `hover:bg-accent`）
- **改动量**：0 行

---

#### A4-D1-04 · focus 态：web `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`（PC 缺失）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:47` |
| PC | PC 缺失 |
| 判定 | 缺失 |

**怎么改**
- 随 A4-D1-02 一起加 `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`
- 注意：PC ring token = `ring: "#FF6B35"`（`tailwind.config.ts:106`）→ 与 web 同
- **改动量**：0 行

---

#### A4-D1-05 · 圆角/内边距：web `px-3 py-2 rounded-md`（PC 一致）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:47` |
| PC | `src/components/layout/AppShell.tsx:444` |
| 判定 | 已一致 |

**说明**：PC `w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left truncate transition-colors duration-150` 的 padding/radius 一致（`text-sm` 需移到标题，见 A4-D1-01）。**改动量**：0 行

---

### A4 · D2 档 · 补元素 / 补文案（4-15 行）

---

#### A4-D2-01 · 每条对话的置顶按钮缺失
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:56-73` |
| PC | PC 缺失（`AppShell.tsx:430-454` 无 pin 按钮） |
| 判定 | 缺失 |

**web 源码**
```tsx
// ChatItem.tsx:56-73
{onPin && (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onPin(id);
    }}
    aria-label={pinned ? "取消置顶" : "置顶"}
    title={pinned ? "取消置顶" : "置顶"}
    className="shrink-0 w-7 h-7 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    {pinned ? (
      <PinOff className="w-4 h-4" />
    ) : (
      <Pin className="w-4 h-4" />
    )}
  </button>
)}
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\layout\AppShell.tsx`
- 锚点：`function SidebarChatItem`（`AppShell.tsx:430`）内，`AppShell.tsx:451`（标题 span）之后
- 改成：
```tsx
        {onPin ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPin(chat.id);
            }}
            aria-label={pinned ? "取消置顶" : "置顶"}
            title={pinned ? "取消置顶" : "置顶"}
            className="shrink-0 w-7 h-7 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {pinned ? <PinOffIcon className="w-4 h-4" /> : <PinIcon className="w-4 h-4" />}
          </button>
        ) : null}
```
- **事件冒泡**：必须 `e.stopPropagation()`，否则点 pin 会同时触发条目的 `onClick`（跳转到该 chat）
- 新增 2 个图标（16×16，strokeWidth 2）：
```tsx
function PinIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 17v5" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6H9v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
}

function PinOffIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 17v5" />
      <path d="M15 6H9v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17h5" />
      <path d="M19 17h-5" />
      <path d="m2 2 20 20" />
    </svg>
  );
}
```
- **改动量**：38 行

---

#### A4-D2-02 · `SidebarChatItem` 需新增 `onPin` / `pinned` props
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:13-16` |
| PC | PC 缺失（`AppShell.tsx:430-436` 的 props 只有 `chat` / `isActive`） |
| 判定 | 缺失 |

**web 源码**
```tsx
// ChatItem.tsx:13-16
/** 置顶回调 (传入时右侧渲染置顶按钮) */
onPin?: (chatId: string) => void;
/** 是否已置顶 (用于切换 icon 与 aria-label) */
pinned?: boolean;
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\layout\AppShell.tsx`
- 锚点：`AppShell.tsx:430-436`
- 改成：
```tsx
function SidebarChatItem({
  chat,
  isActive,
  onPin,
  pinned,
}: {
  chat: ChatSession;
  isActive: boolean;
  /** 置顶回调 (传入时右侧渲染置顶按钮) */
  onPin?: (chatId: string) => void;
  /** 是否已置顶 (用于切换 icon 与 aria-label) */
  pinned?: boolean;
}) {
```
- 调用处（`AppShell.tsx:355-359` 置顶组、`AppShell.tsx:374-378` 最近组）传：
```tsx
                  <SidebarChatItem
                    key={c.id}
                    chat={c}
                    isActive={c.id === currentChatId}
                    onPin={togglePin}
                    pinned={true}
                  />
```
```tsx
                  <SidebarChatItem
                    key={c.id}
                    chat={c}
                    isActive={c.id === currentChatId}
                    onPin={togglePin}
                    pinned={false}
                  />
```
- `ChatListPanel` 也要接 `onPin` / `togglePin`（透传）：`ChatListPanel` props 加 `onPin: (chatId: string) => void`
- 依赖：A3-D3-01（`togglePin`）
- **改动量**：16 行

---

#### A4-D2-03 · 「有新消息」小圆点缺失
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:53-55` |
| PC | PC 缺失 |
| 判定 | 缺失 |

**web 源码**
```tsx
// ChatItem.tsx:53-55
{hasNewMessage && (
  <span className="w-2 h-2 rounded-full bg-warning shrink-0" aria-label="有新消息" />
)}
```

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\layout\AppShell.tsx`
- 锚点：`AppShell.tsx:451` 之后（A4-D2-01 的 pin 按钮之前）
- 插：
```tsx
        {chat.hasNewMessage ? (
          <span className="w-2 h-2 rounded-full bg-warning shrink-0" aria-label="有新消息" />
        ) : null}
```
- 依赖：PC `ChatSession` 类型是否有 `hasNewMessage` 字段 → **待核** `src/lib/api.ts`；若无 → 需在后端 DTO 补该字段（属数据通路，>40 行）
- **改动量**：3 行

---

#### A4-D2-04 · 条目时间戳缺失
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:75` |
| PC | PC 缺失（`AppShell.tsx:430-454` 无时间行） |
| 判定 | 缺失 |

**web 源码**
```tsx
// ChatItem.tsx:75
<div className="text-xs text-muted-foreground mt-0.5">{relativeTime}</div>
```
（`relativeTime = formatDistanceToNow(new Date(updatedAt), { addSuffix: true })`，`ChatItem.tsx:30`）

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\layout\AppShell.tsx`
- 锚点：`function SidebarChatItem` 内，`AppShell.tsx:451`（标题）之后 —— **注意**：web 的结构是「第一行：标题 + 圆点 + pin 按钮 / 第二行：时间」，PC 当前是单行 flex
- 改成（把 PC 的单行改成 web 的两行结构）：
```tsx
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <span className="truncate font-medium text-sm flex-1 min-w-0">
          {chat.title || "新对话"}
        </span>
        {chat.hasNewMessage ? (
          <span className="w-2 h-2 rounded-full bg-warning shrink-0" aria-label="有新消息" />
        ) : null}
        {onPin ? (
          <button …>{pinned ? <PinOffIcon className="w-4 h-4" /> : <PinIcon className="w-4 h-4" />}</button>
        ) : null}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">{relativeTime}</div>
    </div>
```
- `relativeTime` 计算（抄 web `ChatItem.tsx:30`）：
```tsx
  const relativeTime = formatDistanceToNow(new Date(chat.updatedAt), { addSuffix: true });
```
- 依赖：PC 需加 `date-fns` 依赖（同 A1-D2-25 / A2-D1-40）
- **改动量**：14 行

---

#### A4-D2-05 · 条目点击时的键盘可达：PC 用 `<button>`（原生可达），web 用 `role="button" tabIndex={0}` + Enter/Space
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:41-45`、`:33-38` |
| PC | PC 缺失（`<button>` 原生支持） |
| 判定 | 已一致（能力等价） |

**说明**：web 的 `handleKeyDown` 手动处理 Enter/Space 是因为外层是 `<div>`；PC 外层是 `<button>` → 键盘 Enter/Space 自动触发。**改动量**：0 行

---

#### A4-D2-06 · 条目容器 hover：web `hover:bg-accent`（PC `hover:bg-bg-base hover:text-fg`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:47` |
| PC | `src/components/layout/AppShell.tsx:447` |
| 判定 | 形态不同 |

**怎么改**
- 随 A4-D1-02 一起改（`hover:bg-accent`）
- **改动量**：0 行

---

### A4 · D3 档 · 补状态与交互（16-40 行）

---

#### A4-D3-01 · PC 侧栏条目缺少 web 的 `ChatBubbleIcon`（web 无此图标）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:51-74`（无图标） |
| PC | `src/components/layout/AppShell.tsx:450`（有 `<ChatBubbleIcon />`） |
| 判定 | PC 多出 → **不列入** |

**说明**：web 的 ChatItem 行首没有气泡图标（第一列就是标题）。按「不列 PC 增强」规则不计入差异；若要 1:1 则删掉 `<ChatBubbleIcon />`（`AppShell.tsx:450`），属删减，列入 A4-D3-01 的「怎么改」提示而不单列为差异。

---

#### A4-D3-02 · PC 侧栏条目抽成独立 `ChatItem` 组件（对齐 web 文件边界）—— 已落地
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx`（独立组件） |
| PC | `src/components/chat/ChatItem.tsx`（新建，109 行）+ `src/components/layout/AppShell.tsx:40`（import）+ `:465-477` / `:491-503`（两处调用） |
| 判定 | 已一致（无需改） |

**怎么改（已落地）**
- 新建 `D:\gaga\gaclaw-project\gacode-electron\src\components\chat\ChatItem.tsx`（109 行），props 与 web 对齐：
```tsx
export interface ChatItemProps {
  id: string;
  title: string;
  updatedAt: string;
  isActive?: boolean;
  hasNewMessage?: boolean;
  /** 置顶回调 (传入时右侧渲染置顶按钮) */
  onPin?: (chatId: string) => void;
  /** 是否已置顶 (用于切换 icon 与 aria-label) */
  pinned?: boolean;
  onClick: () => void;
}
```
- `AppShell.tsx:40` 改为 `import { ChatItem } from "../chat/ChatItem";`，并把原内联的 `SidebarChatItem` 两处调用替换为 `<ChatItem … />`（置顶组 `:465-477`、最近组 `:491-503`）；原 `SidebarChatItem` 函数**已删除**。
- 组件复用（gaga「组件意识」）：Home / Library 等页面若也要列对话 → 直接复用
- **改动量**：0 行（已落地）

---

### A4 · 已一致项

| # | 项 | web | PC | 说明 |
|---|---|---|---|---|
| A4-OK-01 | 标题为空回退「新对话」 | `ChatItem.tsx:52` | `AppShell.tsx:451` | 一致 |
| A4-OK-02 | 条目圆角 `rounded-md`（16px） | `ChatItem.tsx:47` | `AppShell.tsx:444` | 一致 |
| A4-OK-03 | 条目 padding `px-3 py-2` | `ChatItem.tsx:47` | `AppShell.tsx:444` | 一致 |
| A4-OK-04 | 条目容器 `w-full text-left` | `ChatItem.tsx:47` | `AppShell.tsx:444` | 一致 |

---

## A5 · 聊天子组件映射总表

web `src/components/chat/*` ↔ PC `src/components/chat/*`（同名件）+ PC 侧栏内联项

| web 组件 | web 行数 | PC 对应 | PC 行数 | 判定 | 关联条目 |
|---|---|---|---|---|---|
| `MessageBubble.tsx` | 596 | `src/components/chat/MessageBubble.tsx` | 492 | 形态不同（多处） | A2-D1-10 ~ A2-D1-15、A2-D1-38 ~ A2-D1-40、A2-D4-03 ~ A2-D4-04、A2-D4-06 |
| `MessageList.tsx` | 103 | `src/components/chat/MessageList.tsx` | 165 | 形态不同 | A2-D1-28、A2-D1-29、A2-D3-07、A2-D3-08 |
| `ChatInputBar.tsx` | 174 | `src/components/chat/ChatInputBar.tsx` | 752 | 形态不同 | A2-D1-01 ~ A2-D1-09 |
| `ChatInput.tsx`（chat 详情薄壳） | 87 | 无独立文件（内联在 `ChatInputBar`） | — | 已一致（能力等价） | A2-D1-08 |
| `EmojiPicker.tsx` | 203 | `src/components/home/EmojiPicker.tsx` | 184 | 形态不同 | A2-D1-34 ~ A2-D1-37 |
| `LibraryPicker.tsx` | 327 | `src/components/home/LibraryPicker.tsx` + `src/components/chat/KnowledgeAttachSheet.tsx` | — | 形态不同（多选 vs 单选） | 见 A5-D3-01 |
| `AttachmentChip.tsx` | 100 | `src/components/chat/AttachmentChip.tsx` | 145 | 形态不同 | A2-D1-26 |
| `ApprovalBanner.tsx` | 141 | `src/components/chat/ApprovalBanner.tsx` | 185 | 形态不同 | A2-D1-20 ~ A2-D1-24、A2-D2-08 ~ A2-D2-11 |
| `ExecutionTimeline.tsx` | 155 | PC 缺失（只有 `ExecutionTiming.tsx`） | 72 | 缺失 | A2-D4-02 |
| `StreamingErrorBanner.tsx` | 166 | `src/components/chat/StreamingErrorBanner.tsx` | 76 | 形态不同 | A2-D1-15 ~ A2-D1-19 |
| `SheetActionMenu.tsx` | 97 | `src/components/chat/PlusActionsSheet.tsx` | 248 | 形态不同 | A2-D1-30、A2-D1-31、A2-D3-05、A2-D3-06 |
| `ChatItem.tsx` | 79 | `src/components/layout/AppShell.tsx` 内联 | — | 形态不同 | A4 全部条目 |
| `RichEventBubble.tsx` | — | `src/components/chat/RichEventBubble.tsx` | — | **不在本次范围** | — |

### A5 · D3 档 · 补状态与交互

---

#### A5-D3-01 · 知识库选择器：web 多选 + 「完成 (N)」按钮（PC 单选，无完成按钮）
| 项 | 值 |
|---|---|
| web | `src/components/chat/LibraryPicker.tsx:63-75`、`:80-84`、`:280-320` |
| PC | `src/components/chat/KnowledgeAttachSheet.tsx:20-37` → 复用 `src/components/home/LibraryPicker.tsx`（单选 `onSelect`） |
| 判定 | 形态不同 |

**web 源码**
```tsx
// LibraryPicker.tsx:80-84
const [pendingSelected, setPendingSelected] = useState<Set<string>>(new Set());
const [pendingItems, setPendingItems] = useState<Map<string, LibraryItem>>(new Map());
// LibraryPicker.tsx:280-292
{onConfirm && (
  <div
    className={cn(
      "shrink-0 w-5 h-5 rounded border flex items-center justify-center",
      checked
        ? "bg-brand border-brand text-brand-on"
        : "border-border bg-background"
    )}
    aria-hidden="true"
  >
    {checked && <Check className="w-3.5 h-3.5" />}
  </div>
)}
// LibraryPicker.tsx:301-320
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

**怎么改**
- 目标文件：`D:\gaga\gaclaw-project\gacode-electron\src\components\home\LibraryPicker.tsx`（PC 的单选实现所在处）
- 加 props：
```tsx
  /** 多选模式 — 父组件在"完成"按钮点击时拿到本次选中的 items 数组 */
  onConfirm?: (items: LibraryItem[]) => void;
```
- 加 state：
```tsx
  /** 本次 session 累积的选中 id */
  const [pendingSelected, setPendingSelected] = useState<Set<string>>(new Set());
  /** 关联已选 item 的轻量快照 (父组件要拿 title 拼 markdown marker) */
  const [pendingItems, setPendingItems] = useState<Map<string, LibraryItem>>(new Map());
```
- 列表项尾部加选中勾选框（className 逐字抄 web `:281-292`）：
```tsx
                      <div
                        className={[
                          "shrink-0 w-5 h-5 rounded border flex items-center justify-center",
                          checked
                            ? "bg-brand border-brand text-brand-on"
                            : "border-border bg-background",
                        ].join(" ")}
                        aria-hidden="true"
                      >
                        {checked ? <CheckIcon className="w-3.5 h-3.5" /> : null}
                      </div>
```
- 底部完成按钮（逐字抄 web `:302-319`）：
```tsx
          <div className="px-4 py-3 border-t border-border bg-bg-elevated">
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
          </div>
```
- `KnowledgeAttachSheet` 改为传 `onConfirm`（多选）而不是 `onSelect`（单选）：
```tsx
export interface KnowledgeAttachSheetProps {
  open: boolean;
  onClose: () => void;
  /** 多选回调 — parent 拿到本次选的 items 数组 */
  onPick: (items: LibraryItem[]) => void;
}
```
- `ChatDetail.tsx` 的 `handleKnowledgePick` 改为接收数组（见 A2-D3-01 / A2-D3-02）
- **改动量**：90 行

---

#### A5-D3-02 · web LibraryPicker 类型 tab（全部/图片/文档/链接）+ 搜索框 PC 缺失
| 项 | 值 |
|---|---|
| web | `src/components/chat/LibraryPicker.tsx:38-43`、`:190-206`、`:175-188` |
| PC | `src/components/home/LibraryPicker.tsx`（**待核**：PC 是否已有 tab + 搜索） |
| 判定 | 待核 |

**怎么改**
- **待核动作**：读 `D:\gaga\gaclaw-project\gacode-electron\src\components\home\LibraryPicker.tsx` 全文，核对：
  - 是否有 `TYPE_TABS`（全部/图片/文档/链接）+ `typeFilter` state
  - 搜索框 className 是否为 `w-full pl-9 pr-3 py-2 rounded-md bg-bg-sunken text-fg placeholder:text-fg-subtle outline-none focus:ring-1 focus:ring-brand` + 左侧 Search 图标
  - 列表项 className 是否为 `w-full flex items-center gap-3 p-3 rounded-lg border bg-bg-sunken hover:bg-bg-base transition-colors text-left` + `checked ? "border-brand bg-brand/5" : "border-border"`
  - 类型图标配色：image=`text-brand-cyan`、doc=`text-brand`、link=`text-cron`、default=`text-fg-muted`
- 若缺 → 按 web 原文补齐
- **改动量**：待核后定（0-60 行）

---

### A5 · 已一致项

| # | 项 | web | PC | 说明 |
|---|---|---|---|---|
| A5-OK-01 | 表情数据 60 个 + 3 分类 | `EmojiPicker.tsx:30-99` | `home/EmojiPicker.tsx:26-92` | 逐条一致 |
| A5-OK-02 | 表情搜索命中规则（keywords + emoji 本身） | `EmojiPicker.tsx:113-121` | `home/EmojiPicker.tsx:109-117` | 一致 |
| A5-OK-13 | 附件 chip 扩展名解析（无点 → `?`，最多 4 字符） | `AttachmentChip.tsx:37-41` | `AttachmentChip.tsx:30-34` | 一致 |

---

## 结构级差异 · 需 gaga 拍

> **已拍板、不在此列**：PC 侧栏 **256px 常驻**（`AppShell.tsx` `SIDEBAR_WIDTH = "w-64"`）保留，不改成 web 的 Drawer 抽屉 —— gaga 已明确拍板。侧栏**内部内容与交互**照 web 对齐（见 A3 / A4 全部条目），一条不落。

---

### S-01 · web 聊天详情页的 `AlertDialog`（重命名/删除会话）PC 用居中 `ConfirmDialog`
| 项 | 值 |
|---|---|
| web | `src/components/layout/Header.tsx:248-315`（`AlertDialog`） |
| PC | `src/routes/ChatDetail.tsx:1195-1238`（`ConfirmDialog`） |
| 判定 | 形态不同 |

**改造影响面**
- 需要在 PC 新增 `src/components/ui/AlertDialog.tsx`（对齐 web `src/components/ui/alert-dialog.tsx` 的视觉：`bg-bg-elevated rounded-lg border border-border p-6 shadow-dialog` + `AlertDialogOverlay` + `AlertDialogFooter`）
- 改动文件：`ChatDetail.tsx`（2 处调用）+ 新增 `AlertDialog.tsx`
- 是否需要改路由：**否**（不涉及路由）
- 与已有 PC `ConfirmDialog` 的关系：两者视觉不同（web 有 `AlertDialog` 专用样式），PC 可保留 `ConfirmDialog` 给其它页面用

---

### S-02 · web 的删除/重命名二次确认用**底部 Sheet**（chat 列表页），PC 用居中 `ConfirmDialog`
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:279-310`、`:314-358`（`Sheet side="bottom"`） |
| PC | `src/routes/ChatList.tsx:381-443`（`ConfirmDialog`） |
| 判定 | 形态不同 |

**改造影响面**
- 依赖 S-04 的 `Sheet` 组件（A1-D4-01 / A2-D4-01）
- 改动文件：`ChatList.tsx`（2 处）+ 新增 `Sheet.tsx`
- 是否需要改路由：**否**
- 备注：web 的 chat 列表页在**移动端宽度**用底部 Sheet 更自然；PC 是桌面宽窗口，居中对话框也说得过去 → **这一条值得 gaga 单独拍**

---

### S-03 · web 顶部栏是**全局**组件（`(main)` layout 下所有页面共用），PC 顶部栏由 `AppShell` 按路由条件渲染
| 项 | 值 |
|---|---|
| web | `src/components/layout/Header.tsx:62` + `(main)/layout.tsx`（挂载点） |
| PC | `src/components/layout/AppShell.tsx:121-123`（`showHeader` 条件）+ `ChatDetail.tsx:1027`（chat 详情自管 header） |
| 判定 | 形态不同 |

**改造影响面**
- web：`Header` 在 `(main)/layout.tsx` 里渲染 → 所有 `/chat`、`/library`、`/deliveries`、`/profile` 等页面**共享同一个 header 实例**，标题来自 `useUIStore.headerTitle`（各页 `setHeaderTitle` 写入）
- PC：`AppShell` 用 `showHeader` 条件渲染（`/chat/*` 不渲染，改由 `ChatDetail` 自管 h-12 header → **两层 header 语义分叉**）
- 若要 1:1：PC 需引入 `useUIStore` 等价机制（标题 store），并让 `ChatDetail` **不再自管 header**，把 ⋮ 菜单 / 新建聊天按钮移到 `AppShell` 的右侧 slot
- 改动文件：`AppShell.tsx`（header 渲染 + slot）+ `ChatDetail.tsx`（删自管 header）+ 新增 store
- 是否需要改路由：**否**（但要改 `AppShell` 的 slot 契约 → 影响所有 PC 页面的 header 右侧区域）
- **这是本组影响面最大的一条**，建议 gaga 优先拍

---

### S-04 · PC 无 web 的 `Sheet` 组件（web 有 `components/ui/sheet.tsx` 四向抽屉）
| 项 | 值 |
|---|---|
| web | `src/components/ui/sheet.tsx:1-176`（`Sheet` / `SheetContent` / `SheetHeader` / `SheetTitle` / `SheetDescription` / `SheetFooter`） |
| PC | PC 缺失（只有 `src/components/ui/BottomSheet.tsx`，形态不同） |
| 判定 | 缺失 |

**改造影响面**
- 新增 `src/components/ui/Sheet.tsx`（~170 行，见 A1-D4-01 / A2-D4-01 的完整 className 清单）
- 消费方：`ChatList.tsx`（删除确认 + 重命名）、`ChatDetail.tsx`（若有）、`EmojiPicker` / `LibraryPicker` / `SheetActionMenu` 的 web 对应件
- 是否需要改路由：**否**
- 边界决策：PC 现有 `BottomSheet` 覆盖了「底部面板」这一形态，若新建 `Sheet` 则两者并存 → 建议统一到 `Sheet`（`BottomSheet` 改为 `Sheet side="bottom"` 的薄壳），避免两套 sheet 组件

---

### S-05 · web 消息列表的数据源是**全局 store**（`useChatStore`），PC 是**组件内 state + props 下传**
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageList.tsx:49`（`const { messages } = useChatStore();`）+ `src/lib/store.ts` |
| PC | `src/components/chat/MessageList.tsx:63-68`（`messages` / `streamingAssistantId` props） |
| 判定 | 形态不同 |

**改造影响面**
- web 的 `useChatStore` 承担：消息表、`pendingApprovals`、多选会话状态、UI 标题、已撤回/已删除标记 —— 跨组件共享
- PC 的对应能力分散在 `ChatDetail.tsx` 的多个 `useState`（`pendingApprovals` / `streamError` / `streamingAssistantId` …）
- 若要 1:1：PC 需引入 zustand（或自写 store）→ 新增依赖 + 重构 `ChatDetail` / `MessageList` / `MessageBubble` 的数据流
- 改动文件：`ChatDetail.tsx`、`MessageList.tsx`、`MessageBubble.tsx`、新增 `src/lib/store.ts`
- 是否需要改路由：**否**
- 收益：切 chat 时消息/审批状态不丢（web 靠 store 保持）；PC 目前切走再回来会重拉 history
- **改动量最大的一条**（>150 行），建议 gaga 单拍

---

### S-06 · web 的 `MessageList` 由**父组件**控制 loading / 撤回回调 / 剥图集合（PC 把逻辑塞进 `MessageMenu`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageList.tsx:8-48`（8 个 props） |
| PC | `src/components/chat/MessageList.tsx:48-61`（4 个 props）+ `MessageMenu.tsx` 自持 api 调用 |
| 判定 | 形态不同 |

**改造影响面**
- web：`MessageList` → `MessageBubble` → `DropdownMenuItem` 三层透传 `canRecall` / `onRecall` / `onDelete` / `onSaveToKnowledge`
- PC：`MessageMenu` 直接调 `recallMessage` / `deleteMessage` / `createLibraryItem`，再通过 `onActionDone` 回调父层 invalidate
- 行为差异（已核实）：web 的「撤回」只在 `canRecall` 时可点（`disabled`），超窗时点按弹 toast；PC 也是 disabled + toast → **行为等价**
- 若要 1:1（结构层）：PC 需把 api 调用上提到 `ChatDetail`，`MessageMenu` 退化为纯展示
- 改动文件：`MessageMenu.tsx`、`MessageBubble.tsx`、`MessageList.tsx`、`ChatDetail.tsx`
- 是否需要改路由：**否**
- 备注：**纯结构差异，行为已等价** → 建议 gaga 判定「不改」

---

### S-07 · web 的 `Markdown` 是**组件**（`src/components/Markdown.tsx`），PC 是**本地 mini-markdown 库**（`src/lib/markdown.ts`）
| 项 | 值 |
|---|---|
| web | `src/components/Markdown.tsx`（react-markdown `^9.0.1` + `remark-gfm` 等） |
| PC | `src/lib/markdown.ts`（自写实现，`react-markdown` `^10.1.0`） |
| 判定 | 形态不同 |

**改造影响面**
- 已知版本坑（按任务说明）：web `react-markdown@^9.0.1` / PC `^10.1.0` → `components` 映射回调签名不同（v9 `({node, ...props})`，v10 `({node, children, ...props})`）
- 若要 1:1：PC 需把 `src/lib/markdown.ts` 换成 web 的 `components/Markdown.tsx` 移植版 → 需逐个核对 `components` 映射（表格 `.md-table-td-clamp` / `.md-table-td-toggle` / `ExpandableCell` 逻辑**一行不动**，只抄 web 当前实际行为）
- 改动文件：`src/lib/markdown.ts`（或新增 `src/components/Markdown.tsx`）+ `MessageBubble.tsx`（改 import 路径）
- 是否需要改路由：**否**
- 影响面：**全站所有 Markdown 渲染点**（气泡、引用块、工具输出…）
- **建议 gaga 单拍**：这是「PC 增强（本地实现更可控）」vs「1:1 还原 web」的分歧点

---

### S-08 · web 有「消息撤回窗口 2 分钟」由**服务端**裁决，PC 同样 120s，但 PC 的窗口判定在**菜单组件内**而非父层
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/[id]/page.tsx:1025-1032` + `src/components/chat/MessageBubble.tsx:62-78` |
| PC | `src/components/chat/MessageMenu.tsx:63-75` |
| 判定 | 形态不同（行为等价） |

**改造影响面**
- 行为已一致（窗口常量 120000ms 两侧相同，判定都基于 `Date.now()`）
- 若要 1:1（结构层）：把 `canRecallMessage` 上提到 `ChatDetail` → 见 S-06
- 是否需要改路由：**否**
- 备注：**行为等价**，建议 gaga 判定「不改」

---

## 改动量汇总

**条目总数 179 条**（A1 62 / A2 71 / A3 31 / A4 13 / A5 2）

| 档位 | 条数 | 说明 |
|---|---|---|
| D1（≤3 行） | 92 | 纯 className / 文案 |
| D2（4-15 行） | 52 | 补元素 / 补文案 |
| D3（16-40 行） | 25 | 补状态与交互 |
| D4（>40 行） | 10 | 补组件（Sheet / ExecutionTimeline / stripImageUrls / LibraryPicker 多选 / ChatItem 抽取 …） |

> 档位 = 条目**所在小节**（D1/D2/D3/D4 档），与条目的当前判定无关 —— 判定改成「已一致」的条目仍留在原小节，便于回溯。

**判定分布**

| 判定 | 条数 |
|---|---|
| 形态不同 | 116 |
| 缺失 | 33 |
| 已一致（无需改） | 25 |
| PC 多出（按规则不计入） | 4 |
| 待核 | 1 |

**分布复算（2026-10-26 修正后）**

- 复算方式：逐条扫描正文 `#### A?-D?-??` 条目的 `| 判定 | … |` 行，按「形态不同 / 缺失 / 已一致 / PC 多出 / 待核」归并（带后缀的变体，如「已一致（文案一致）」「缺失（组件边界）」「PC 多出 → **不列入**」按前缀归并）。
- 复算结果：形态不同 **116** + 缺失 **33** + 已一致 **25** + PC 多出 **4** + 待核 **1** = **179** = 条目总数 ✓（各节 A1 62 / A2 71 / A3 31 / A4 13 / A5 2 = 179 ✓）
- 相对修正前（形态不同 121 / 缺失 37 / 已一致 15 / PC 多出 4 / 待核 2 = 179）的变化：判定变更 **10 条**，其中
  - 形态不同 → 已一致 **5 条**：A1-D3-03、A1-D3-05、A1-D3-06、A2-D3-01、A3-D3-04
  - 缺失 → 已一致 **4 条**：A1-D3-04、A1-D4-04、A2-D3-02、A4-D3-02
  - 待核 → 已一致 **1 条**：A1-D3-08
  - 判定不变 **1 条**（部分落地，仍为「缺失」）：A2-D4-02（组件文件已建但未挂载）
  - ⇒ 形态不同 −5、缺失 −4、已一致 +10、待核 −1，PC 多出不变

**结构级差异（需 gaga 拍）**：8 条（S-01 ~ S-08）

---

## 改动量最大的前 10 条

> **口径（2026-10-26 修正）**：本表按**剩余未落地工作量**排序 —— 已在本轮实现批落地的条目**不再进表**（落地情况见 §十二）。原表按「预估改动量」排，其中 A2-D4-02 / A4-D3-02 / A5-D3-01 / A3-D1-05 / A2-D1-17 / A2-D1-18 / A3-D3-01 / A2-D1-08 已落地或部分落地，故整表重排。

| # | 条号 | 一句话说清要动什么 | 预估改动 |
|---|---|---|---|
| 1 | A1-D4-01 | 新增 web `Sheet` 组件（四向抽屉 + ESC + 滚动锁 + X 关闭），供 chat 列表删除/重命名与各 picker 用 | ~196 行 |
| 2 | A1-D4-02 | 重命名弹窗从居中 `ConfirmDialog` 改成 web 的底部 Sheet（含 `rename-input` / 回车提交 / 空标题 toast / 保存禁用） | ~70 行 |
| 3 | A2-D4-06 | 移植 web `stripReferencedImageUrls` 渲染层剥图 + 父层算 `userImageUrls` 并集 | ~60 行 |
| 4 | A3-D2-04 | 侧栏「日程中心」入口（**挂起**：PC 无 `/schedule` 路由，需先有该页面） | 40 行 |
| 5 | A2-D4-02 | `ExecutionTimeline` 的**剩余**工作：挂载到 `MessageBubble` + 把 `chunk.reasoning` 累积进 `message.phases`（组件文件 292 行已建） | ~30 行 |
| 6 | A3-D2-01 | 顶栏 Cody 图标：web 是 32×32 `cody_48.png`（PC 是字母方块） | 7 行 |
| 7 | A2-D4-03 | web 用户气泡 markdown 反色（PC 缺失） | 6 行 |
| 8 | A1-D2-19 | 重命名弹窗「保存」按钮：PC 未按空标题禁用（需给 `ConfirmDialog` 加 `confirmDisabled`） | 5 行 |
| 9 | A1-D2-17 | PC `Button` 的 `loading` 渲染改成 web 的原生 Tailwind spinner（现仍是 `.gagaos-spinner`） | 3 行 |
| 10 | A2-D1-30 | 「+ 附件」Sheet 网格：web `grid-cols-4 gap-3 py-5 px-4 border-x-0 rounded-t-2xl`（PC 仍是 `grid-cols-3 gap-y-5 gap-x-2 py-4` + 自带标题栏） | 2 行 |

> 结构级条目里 **S-05（web 全局 store vs PC 组件内 state）** 与 **S-03（全局 Header vs ChatDetail 自管 header）** 的改动面比上表任何单条都大（各 >150 行、跨 4 个文件），建议在排期时与上表并列看待。

> **注**：上表 10 条是「逐条核实 PC 工作区代码后确认仍未落地」的条目。本轮实现批（同批）另外落地了大量条目，但**未包含在 PM 点名的 9 条内** —— 这批条目的正文判定是否一并改成「已一致」，请 PM 拍板（清单见 §十二.3）。

---

## 十二、实现回改清单（2026-10-26 实现批回写）

> **背景**：2026-10-26 的「实现批」已在 PC 工作区落地了一批对标改动（`src/routes/{ChatList,ChatDetail}.tsx` / `src/components/layout/AppShell.tsx` / `src/components/chat/{ChatInputBar,ExecutionTimeline}.tsx` / 新建 `src/components/chat/ChatItem.tsx` 等，**全部为未提交的工作区改动**）。本节把「已落地」的条目回写进本清单，并记录本次对文档本身的 **7 处修正**（原先描述与源码矛盾 / 锚点过时 / 判定错误）。
> **口径**：行号一律指**当前 PC 工作区**（实现批之后）的行号；「实际改动行数」取 `git diff` 的 hunk 增删行数（新建文件取文件总行数）。

### 12.1 已落地条目回写（PM 点名的 9 条 + 1 条连带）

| 条号 | 判定（改前 → 改后） | 落地位置（改后 file:line） | 实际改动行数 |
|---|---|---|---|
| A1-D3-05 | 形态不同 → **已一致** | `src/routes/ChatList.tsx:245-253`（`exitMultiSelect()` / `selectAll()` 两个 helper）+ `:352-360`（onClick = `allSelected ? exitMultiSelect() : selectAll()`） | helper **+12**（含 5 行注释）；onClick 5 行 → 9 行（**+7/-3**） |
| A1-D3-06 | 形态不同 → **已一致** | `src/routes/ChatList.tsx:256-259` | **+4 / -1** |
| A1-D3-08 | 待核 → **已一致** | `src/styles/globals.css:194-201`（body 无 font-size）+ `tailwind.config.ts:159`（`fontSize.base` = 16px）+ `src/routes/ChatList.tsx:644`（`font-medium truncate`） | **0**（核实项，无代码改动） |
| A1-D4-04 | 缺失 → **已一致** | `src/components/layout/AppShell.tsx:60-63`（`if (pathname === "/chat") return "对话列表";`）+ `src/App.tsx:111-118`（chat 列表路由）+ `AppShell.tsx:152-154`（`showHeader`） | **+4** |
| A2-D3-01 | 形态不同 → **已一致** | `src/routes/ChatDetail.tsx:276-280`（state 类型 `string[]` → `Array<{id;title}>`）+ `:798-808`（合并去重按 `id`）+ `:828-830`（移除单个引用）+ `:1141-1167`（chip 逐条渲染，含 `data-ref-id` / `title={r.title \|\| r.id}` / aria-label）+ `:1220`（`onConfirm`） | **+44 / -8** |
| A2-D3-02 | 缺失 → **已一致** | `src/routes/ChatDetail.tsx:809-818`（marker 注入 `inputBarRef.current?.insertText(markerText)`） | **+10** |
| A2-D4-02 | 缺失 → **缺失**（部分落地） | `src/components/chat/ExecutionTimeline.tsx`（**新建，201 行**）—— 但**全仓无 import**，`MessageBubble.tsx:372` 仍挂 `ExecutionTiming`，`ChatDetail.tsx` 无 `chunk.reasoning` → `phases` 通路 | **+201 / -0**；剩余 **~30 行**（挂载点 + 数据通路）未做 |
| A3-D3-04 | 形态不同 → **已一致** | `src/components/layout/AppShell.tsx:483-522`（分组头常显 `:483-488` + 组内空态 `:517-521`） | **+34 / -25** |
| A4-D3-02 | 缺失 → **已一致** | `src/components/chat/ChatItem.tsx`（**新建，109 行**）+ `AppShell.tsx:40`（import）+ `:465-477` / `:491-503`（两处调用）；原 `SidebarChatItem` 已删 | **+109 / -26** |
| A1-D3-04 | 缺失 → **已一致**（连带修正） | `src/routes/ChatList.tsx:386`（`disabled={createMutation.isPending \|\| multiSelectIds.size > 0}`） | **+1** |

### 12.2 本次对文档的 7 处修正（已同步进正文）

| # | 修正项 | 修正前的错误描述 | 修正后的结论 |
|---|---|---|---|
| ① | **A1-D3-05** | 「PC 全选后再点 = 清空选中集合但**留在多选模式**（顶部栏还在）」 | 与 web `store.ts:213-223` 矛盾：web `toggleSelected` 空集即 `isMultiSelectMode: false`。**PC 本来就与 web 等价**，不存在该差异 ⇒ 判定改「已一致」；**去掉**引入 `setIsMultiSelectMode(false)` 的写法 |
| ② | **A1-D3-03** | 「web 取消勾选最后一个仍留在多选模式」 | 与 `store.ts:218-221` 矛盾。web 的进入/退出条件与 PC 的 `size > 0` 推导**等价** ⇒ 判定改「已一致 / 无需改」；**PC 不引入 `isMultiSelectMode` state** |
| ③ | **A1-D3-06** | 把「PC 用 `sortedChats.length` vs web 用 `chats.length`」写成 PC↔web 的差异 | `searchChatsByTitle` 已在**客户端**过滤（`api.ts:397-406`）⇒ `chats` 与 `sortedChats` 是同一集合（仅顺序不同）⇒ 那其实是 **PC 内部**的变量名之差。PC 已统一到 `chats` ⇒ **行为零变化**，判定改「已一致（口径已统一，行为无差异）」 |
| ④ | **A1-D3-08** | 判定「待核」 | PC `globals.css:194-201` 与 web `globals.css:232-239` 的 `body` **都无** `font-size`；两边 `tailwind.config.ts` 的 `fontSize.base` 都是 16px；PC `ChatList.tsx:583` → **现 `:644`** 已是 `font-medium truncate` ⇒ 判定改「**已一致**」，0 行改动 |
| ⑤ | **A2-D3-01** | 锚点 `ChatDetail.tsx:1103`（`title={已挂载 ${n} 条知识库}`）+ 函数 `handleKnowledgePick` | 该字符串是 **toast 文案**（现 `:820`），PC chip 是**逐条渲染**的（现 `:1141-1167`）；`handleKnowledgePick` 在 PC **不存在**，入口是 `handleKnowledgeConfirm`（`:798`、`:1220`）⇒ 改锚点 + 现状描述 + 补已落地的改法 |
| ⑥ | **A2-D3-02** | 锚点 `handleKnowledgePick` + 建议用 `insertEmoji` | 入口同上 = `handleKnowledgeConfirm`；PC `ChatInputBarHandle` **已有 `insertText`**（声明 `ChatInputBar.tsx:118-135`、实现 `:241` / `:586-590`）⇒ 已改用 `insertText`，写法 = marker `@[library:${id}] ${title\|\|"未命名"}` + `\n` 连接 ⇒ `inputBarRef.current?.insertText(markerText)`（`ChatDetail.tsx:809-818`） |
| ⑦ | **A1-D4-04** | PC 落点留空，注「待核 PC AppShell 是否有等价的 header title 机制 → 见 A3 节」 | PC 顶栏标题由 `AppShell.tsx` 的 `resolveTitle(pathname)` **按路由派生**（chat 列表路由 = `/chat`，`App.tsx:111-118`；`showHeader` 对 `/chat` 为 true，`:152-154`）⇒ 补落点 + 改法：`resolveTitle` 增加 `if (pathname === "/chat") return "对话列表";`（`AppShell.tsx:60-63`） |

### 12.3 同批已落地、但**不在 PM 点名 9 条内**的条目（判定待 PM 拍板）

> 逐条核实 PC 工作区代码时发现：实现批的实际覆盖面**远超** PM 点名的 9 条。以下条目的正文判定**仍是旧值**（形态不同 / 缺失），但代码里**已经落地**。**本次未擅自改判**（超出派工范围），请 PM 拍板是否一并改成「已一致」；若全部改「已一致」，判定分布将变为：形态不同 **116 − N**、缺失 **33 − M**、已一致 **25 + N + M**。

| 条号 | 旧判定 | 落地证据（file:line） |
|---|---|---|
| A1-D1-11 | 形态不同 | `ChatList.tsx:778`（`Skeleton h-24 w-full` ×3） |
| A1-D1-14 | 形态不同 | `ChatList.tsx:647`（`text-sm text-fg-muted mt-1`） |
| A1-D1-15 | 形态不同 | `ChatList.tsx:644`（`font-medium truncate`，无 `text-*`） |
| A1-D1-16 | 形态不同 | `ChatList.tsx:348`（`已选 {n} 项`） |
| A1-D1-22 | 形态不同 | `ChatList.tsx:364`（`CheckCheckIcon`） |
| A1-D1-23 | 形态不同 | `ChatList.tsx:374`（`TrashIcon`） |
| A1-D1-24 | 缺失 | `ChatList.tsx:340-347`（X 按钮 + `aria-label="退出多选"`） |
| A1-D1-25 | 形态不同 | `ChatList.tsx:380-392`（页内大按钮 `size="lg"` + `MessageSquarePlusIcon`） |
| A1-D2-01 | 形态不同 | `ChatList.tsx:280`（`px-4 lg:px-8 py-6 max-w-3xl mx-auto`） |
| A1-D2-02 | 形态不同 | `ChatList.tsx:406`（`grid gap-3`） |
| A1-D2-13 | 缺失 | `ChatList.tsx:519`（`修改后服务端会保留自定义标题 …`） |
| A1-D2-14 | 形态不同 | `ChatList.tsx:476`（`此操作不可恢复，对话中的消息将被永久删除。`） |
| A1-D2-15 | 形态不同 | `ChatList.tsx:453`（全角 `？`） |
| A1-D2-16 | 形态不同 | `src/components/ui/ConfirmDialog.tsx:77`（`variant="outline"`） |
| A1-D2-20 | 形态不同 | `ChatList.tsx:169` / `:169`（`标题不能为空` toast） |
| A1-D2-25 | 形态不同 | `ChatList.tsx:31` + `:789-793`（`formatDistanceToNow` + `zhCN`） |
| A1-D3-01 | 形态不同 | 随 A1-D2-25 消解（`formatRelative` 换成 date-fns） |
| A1-D3-02 | 形态不同 | `ChatList.tsx:337-353`（多选栏已在列表**顶部**） |
| A1-D3-07 | 缺失 | 新建 `src/components/ui/Card.tsx` |
| A1-D4-03 | 形态不同 | `ChatList.tsx:380-392`（按钮已挪到列表上方） |
| A2-D1-08 | 缺失 | `ChatInputBar.tsx:789`（caption） |
| A2-D1-16 | 形态不同 | `StreamingErrorBanner.tsx:38`（`AlertCircleIcon`） |
| A2-D1-17 | 形态不同 | `StreamingErrorBanner.tsx:47-50`（描边小按钮 + `RotateCwIcon`） |
| A2-D1-18 | 形态不同 | `StreamingErrorBanner.tsx`（`CloseIcon` 关闭按钮） |
| A2-D1-19 | 形态不同 | `StreamingErrorBanner.tsx:76`（`网络异常,生成中断: {raw}`） |
| A2-D1-24 | 形态不同 | `ApprovalBanner.tsx:144`（截断 180 字） |
| A2-D1-25 | 形态不同 | `ChatDetail.tsx:1142-1143`（`mx-auto max-w-3xl w-full px-4 pb-2` + `flex flex-wrap gap-2`） |
| A2-D1-27 | 形态不同 | `ChatDetail.tsx:1145-1163`（brand-cyan 逐条 chip）—— 与 A2-D3-01 同一处改动 |
| A2-D1-28 | 形态不同 | `MessageList.tsx:117`（`max-w-3xl mx-auto space-y-4`） |
| A2-D1-29 | 形态不同 | `ChatDetail.tsx:1099-1112`（异形 Skeleton ×4） |
| A2-D1-31 | 形态不同 | `AttachmentChip.tsx:96`（`w-6 h-6`） |
| A2-D1-37 | 形态不同 | `EmojiPicker.tsx:122`（选中即 `onClose()`） |
| A2-D1-39 | 缺失 | `MessageBubble.tsx:115` / `:300`（`timeAgo`） |
| A2-D1-40 | 形态不同 | `MessageBubble.tsx:432-436`（`formatAgo` 用 date-fns + zhCN） |
| A2-D2-03 | 缺失 | `ChatDetail.tsx:1057-1060`（`+ 新建聊天` 圆形按钮） |
| A2-D2-05 | 形态不同 | `ChatDetail.tsx:1279`（`重命名会话`） |
| A2-D2-06 | 形态不同 | `ChatDetail.tsx:1262-1263`（`删除会话?` / `将删除「…」及其全部消息, 此操作不可撤销.`） |
| A2-D2-08 | 缺失 | `ApprovalBanner.tsx:48-55` + `:135`（`RISK_STYLES` + `RiskBadge`） |
| A2-D2-09 | 形态不同 | `ApprovalBanner.tsx:168`（`bg-secondary text-secondary-foreground`） |
| A2-D2-20 | 形态不同 | `ApprovalBanner.tsx:106`（`mx-auto max-w-3xl w-full px-4 pb-2`） |
| A2-D3-05 | 形态不同 | `BottomSheet.tsx:108`（`inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl`） |
| A2-D3-06 | 缺失（ESC 关闭） | `BottomSheet.tsx:77`（ESC 关闭）+ `:80-84`（滚动锁） |
| A2-D3-07 | 形态不同 | `MessageList.tsx:79`（`scrollIntoView({ behavior: "smooth" })`） |
| A2-D4-04 | 缺失 | `MessageBubble.tsx:346`（`<Markdown>{content}</Markdown>`） |
| A3-D1-03 | 形态不同 | `AppShell.tsx:342`（`rounded-md bg-bg-elevated m-3 p-2`） |
| A3-D1-05 | 缺失 | `AppShell.tsx:29-42` + `:103-115`（6 个菜单项图标） |
| A3-D1-08 | 形态不同 | `AppShell.tsx:289` / `:397`（`w-9 h-9`） |
| A3-D1-12 | 形态不同 | `AppShell.tsx:34`（`LogoutIcon`） |
| A3-D1-14 | 形态不同 | `AppShell.tsx:555`（`ChevronRightIcon` + `rotate-90`） |
| A3-D1-20 | 形态不同 | `AppShell.tsx:566`（`h-12 w-full` 骨架） |
| A3-D2-05 | 缺失 | `AppShell.tsx:322-336`（「我的应用」入口） |
| A3-D2-06 | 形态不同 | `AppShell.tsx:408`（`flex-1 truncate font-medium min-w-0`） |
| A3-D3-01 | 形态不同 | `AppShell.tsx:169`（`pinnedIds`）+ `:221`（`useQueryClient`）+ `:224`（`togglePin` 乐观更新） |
| A3-D3-02 | 形态不同 | `AppShell.tsx:23`（`useQueryClient` import） |
| A4-D1-01 | 形态不同 | `ChatItem.tsx`（标题 `truncate font-medium text-sm`） |
| A4-D1-02 | 形态不同 | `ChatItem.tsx:73`（`bg-accent`） |
| A4-D2-01 | 缺失 | `ChatItem.tsx:87-102`（置顶按钮） |
| A4-D2-02 | 缺失 | `ChatItem.tsx:32-34`（`onPin` / `pinned` props） |
| A4-D2-03 | 缺失 | `ChatItem.tsx:81`（「有新消息」圆点） |
| A4-D2-04 | 缺失 | `ChatItem.tsx:106`（`text-xs text-muted-foreground` 时间戳） |
| A5-D3-01 | 形态不同 | `LibraryPicker.tsx:67-68` + `:150-160`（`pendingSelected` / `完成 (N)`） |

> **合计 61 条**（形态不同 **46** 条 + 缺失 **15** 条）判定待 PM 拍板；拍板后判定分布需再次重算（见 §改动量汇总 的复算口径）。

---

## 附：本次文档修正的复算记录

1. **条目总数不变**：179 条（A1 62 / A2 71 / A3 31 / A4 13 / A5 2）—— 本次只改判定与描述，**没有新增 / 删除 / 移动条目**，各节条数不变。
2. **判定分布（改前 → 改后）**：形态不同 121 → **116**（−5）；缺失 37 → **33**（−4）；已一致 15 → **25**（+10）；PC 多出 4 → **4**（不变）；待核 2 → **1**（−1）。
3. **自洽校验**：116 + 33 + 25 + 4 + 1 = **179** = 条目总数 ✓；逐条扫描正文 `| 判定 | … |` 行归并后结果与上表**完全一致**（无未归类判定值）。
4. **档位分布不变**：D1 92 / D2 52 / D3 25 / D4 10 = 179 ✓（档位 = 条目所在小节，判定改成「已一致」的条目仍留在原小节）。
5. **改动量最大的前 10 条已重排**：口径由「预估改动量」改为「**剩余未落地工作量**」，原表 10 条中 8 条已落地/部分落地 → 整表重排（见上表）。


---

