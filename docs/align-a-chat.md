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

> **标题口径（2026-10-26 补充）**：条目标题已统一改成**中性检查项**（只写「比什么」，不再断言 PC 当前是什么状态）。**当前真实状态一律以该条的「判定」列 + 「当前 PC 源码」代码块 + §十二 为准**；标题里出现的 className / 文案是 web 侧口径（web 是真相源，本轮未改）。
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

#### A1-D1-01 · 空态标题文案（web「暂无对话」）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:269` |
| PC | `src/routes/ChatList.tsx:744` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:269
<div className="text-lg font-medium mb-2">暂无对话</div>
```

**当前 PC 源码**（`src/routes/ChatList.tsx:744`）

```tsx
        <div className="text-lg font-medium mb-2">暂无对话</div>
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-02 · 空态描述文案
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:270-272` |
| PC | `src/routes/ChatList.tsx:745` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:270-272
<div className="text-sm">
  开始新对话，开启与 AI 的交流之旅
</div>
```

**当前 PC 源码**（`src/routes/ChatList.tsx:745`）

```tsx
        <div className="text-sm">开始新对话，开启与 AI 的交流之旅</div>
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-03 · 空态描述字号色
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:270` |
| PC | `src/routes/ChatList.tsx:745` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:270
<div className="text-sm">
```

**当前 PC 源码**（`src/routes/ChatList.tsx:745`）

```tsx
        <div className="text-sm">开始新对话，开启与 AI 的交流之旅</div>
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-04 · 空态图标（`w-12 h-12 mx-auto mb-4 opacity-50`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:268` |
| PC | `src/routes/ChatList.tsx:743` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:268
<MessageSquarePlus className="w-12 h-12 mx-auto mb-4 opacity-50" />
```

**当前 PC 源码**（`src/routes/ChatList.tsx:743`）

```tsx
        <MessageSquarePlusIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-05 · 空态标题字号（`text-lg`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:269` |
| PC | `src/routes/ChatList.tsx:744` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:269
<div className="text-lg font-medium mb-2">暂无对话</div>
```

**当前 PC 源码**（`src/routes/ChatList.tsx:744`）

```tsx
        <div className="text-lg font-medium mb-2">暂无对话</div>
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-06 · 空态容器（`Card` + `CardContent p-8 text-center text-muted-foreground`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:266-274` |
| PC | `src/routes/ChatList.tsx:742` |
| 判定 | 已一致 |

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

**当前 PC 源码**（`src/routes/ChatList.tsx:742`）

```tsx
      <CardContent className="p-8 text-center text-muted-foreground">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-07 · 空态卡片宽度
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:266-274`（无 max-w） |
| PC | `src/routes/ChatList.tsx:741-743` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/routes/ChatList.tsx:741-743`）

```tsx
    <Card>
      <CardContent className="p-8 text-center text-muted-foreground">
        <MessageSquarePlusIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-08 · 空态「新建对话」按钮
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:266-274`（空态内**无**按钮） |
| PC | `src/routes/ChatList.tsx:739-749` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/routes/ChatList.tsx:739-749`）

```tsx
function EmptyState() {
  return (
    <Card>
      <CardContent className="p-8 text-center text-muted-foreground">
        <MessageSquarePlusIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
        <div className="text-lg font-medium mb-2">暂无对话</div>
        <div className="text-sm">开始新对话，开启与 AI 的交流之旅</div>
      </CardContent>
    </Card>
  );
}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：PC 空态里的多余「新建对话」按钮已删除 ⇒ 两端空态结构一致（web 空态本就无按钮）

---

#### A1-D1-09 · 空态描述第二行「点下面的按钮开始第一次会话」
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:270-272` |
| PC | `src/routes/ChatList.tsx:745` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/routes/ChatList.tsx:745`）

```tsx
        <div className="text-sm">开始新对话，开启与 AI 的交流之旅</div>
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-10 · 「历史对话」小标题
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:241` |
| PC | `src/routes/ChatList.tsx:396` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:241
<h2 className="text-lg font-semibold mb-4">历史对话</h2>
```

**当前 PC 源码**（`src/routes/ChatList.tsx:396`）

```tsx
        <h2 className="text-lg font-semibold mb-4">历史对话</h2>
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-11 · 加载态骨架（web `Skeleton h-24 w-full` ×3）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:244-248` |
| PC | `src/routes/ChatList.tsx:776-784` |
| 判定 | 已一致 |

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

**当前 PC 源码**（`src/routes/ChatList.tsx:776-784`）

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

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-12 · 「新建对话」按钮文案
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:235` |
| PC | `src/routes/ChatList.tsx:390` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:235
{createChatMutation.isPending ? "创建中..." : "新建对话"}
```

**当前 PC 源码**（`src/routes/ChatList.tsx:390`）

```tsx
          {createMutation.isPending ? "创建中..." : "新建对话"}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-13 · 顶栏新建按钮 pending 态文案「创建中...」
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:235` |
| PC | `src/routes/ChatList.tsx:390` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/routes/ChatList.tsx:390`）

```tsx
          {createMutation.isPending ? "创建中..." : "新建对话"}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-14 · 时间戳字号
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:449` |
| PC | `src/routes/ChatList.tsx:649` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:449
<div className="text-sm text-fg-muted mt-1">{relativeTime}</div>
```

**当前 PC 源码**（`src/routes/ChatList.tsx:649`）

```tsx
        <div className="text-sm text-fg-muted mt-1">{relative}</div>
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-15 · 对话标题字号
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:448` |
| PC | `src/routes/ChatList.tsx:646` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:448
<div className="font-medium truncate">{title || "新对话"}</div>
```

**当前 PC 源码**（`src/routes/ChatList.tsx:646`）

```tsx
        <div className="font-medium truncate">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-16 · 多选计数文案
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:197-199` |
| PC | `src/routes/ChatList.tsx:348` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:197-199
<div className="flex-1 text-sm font-medium">
  已选 {selectedIds.size} 项
</div>
```

**当前 PC 源码**（`src/routes/ChatList.tsx:348`）

```tsx
            已选 {multiSelectIds.size} 项
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-17 · 多选底栏容器
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:188` |
| PC | `src/routes/ChatList.tsx:338` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:188
<div className="sticky top-14 z-30 -mx-4 lg:-mx-8 px-4 lg:px-8 mb-4 py-2 bg-bg-elevated border-b border-border flex items-center gap-3">
```

**当前 PC 源码**（`src/routes/ChatList.tsx:338`）

```tsx
        <div className="sticky top-0 z-30 -mx-4 lg:-mx-8 px-4 lg:px-8 mb-4 py-2 bg-bg-elevated border-b border-border flex items-center gap-3">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：web 是 `sticky top-14`（全局 header 之下），PC 是 `sticky top-0`（PC 的 main 自身是滚动容器，header 在 main 之外不重叠）⇒ 结构等价

---

#### A1-D1-18 · 多选底栏内边距
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:188` |
| PC | `src/routes/ChatList.tsx:338` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/routes/ChatList.tsx:338`）

```tsx
        <div className="sticky top-0 z-30 -mx-4 lg:-mx-8 px-4 lg:px-8 mb-4 py-2 bg-bg-elevated border-b border-border flex items-center gap-3">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-19 · 多选底栏分隔线（`border-b border-border`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:188` |
| PC | `src/routes/ChatList.tsx:338` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/routes/ChatList.tsx:338`）

```tsx
        <div className="sticky top-0 z-30 -mx-4 lg:-mx-8 px-4 lg:px-8 mb-4 py-2 bg-bg-elevated border-b border-border flex items-center gap-3">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-20 · 多选底栏负外边距（`-mx-4 lg:-mx-8`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:188` |
| PC | `src/routes/ChatList.tsx:338` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/routes/ChatList.tsx:338`）

```tsx
        <div className="sticky top-0 z-30 -mx-4 lg:-mx-8 px-4 lg:px-8 mb-4 py-2 bg-bg-elevated border-b border-border flex items-center gap-3">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-21 · 多选底栏 `mb-4` 下间距
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:188` |
| PC | `src/routes/ChatList.tsx:338` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/routes/ChatList.tsx:338`）

```tsx
        <div className="sticky top-0 z-30 -mx-4 lg:-mx-8 px-4 lg:px-8 mb-4 py-2 bg-bg-elevated border-b border-border flex items-center gap-3">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-22 · 多选态「全选/清空」按钮图标（web `CheckCheck`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:200-210` |
| PC | `src/routes/ChatList.tsx:364` |
| 判定 | 已一致 |

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

**当前 PC 源码**（`src/routes/ChatList.tsx:364`）

```tsx
            <CheckCheckIcon className="w-4 h-4" />
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-23 · 多选态「删除」按钮图标（web `Trash2`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:211-222` |
| PC | `src/routes/ChatList.tsx:374` |
| 判定 | 已一致 |

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

**当前 PC 源码**（`src/routes/ChatList.tsx:374`）

```tsx
            <TrashIcon className="w-4 h-4" />
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-24 · 多选态「退出多选」X 按钮
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:189-196` |
| PC | `src/routes/ChatList.tsx:343` |
| 判定 | 已一致 |

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

**当前 PC 源码**（`src/routes/ChatList.tsx:343`）

```tsx
            aria-label="退出多选"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D1-25 · 「新建对话」页内大按钮
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:227-237` |
| PC | `src/routes/ChatList.tsx:380-392` |
| 判定 | 已一致 |

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

**当前 PC 源码**（`src/routes/ChatList.tsx:380-392`）

```tsx
      {/* 新建对话按钮 — 对齐 web `chat/page.tsx:227-237` (页内大按钮) */}
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

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

### A1 · D2 档 · 补元素 / 补文案（4-15 行）

---

#### A1-D2-01 · 页面根容器（`px-4 lg:px-8 py-6 max-w-3xl mx-auto`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:185` |
| PC | `src/routes/ChatList.tsx:281` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:185
<div className="px-4 lg:px-8 py-6 max-w-3xl mx-auto">
```

**当前 PC 源码**（`src/routes/ChatList.tsx:281`）

```tsx
      <div className="px-4 lg:px-8 py-6 max-w-3xl mx-auto flex-1 w-full">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D2-02 · 「历史对话」列表（web `grid gap-3`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:250` |
| PC | `src/routes/ChatList.tsx:406` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:250
<div className="grid gap-3">
  {chats.map((chat) => (
    <ChatRow … />
  ))}
</div>
```

**当前 PC 源码**（`src/routes/ChatList.tsx:406`）

```tsx
          <ul className="grid gap-3">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D2-03 · 「历史对话」外层 `space-y-3`
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:240` |
| PC | `src/routes/ChatList.tsx:395` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:240
<div className="space-y-3">
```

**当前 PC 源码**（`src/routes/ChatList.tsx:395`）

```tsx
      <div className="space-y-3">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D2-04 · 「新建对话」按钮 spinner（web 仅文案切换）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:228-236`（无 loading prop） |
| PC | `src/routes/ChatList.tsx:385-391` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/routes/ChatList.tsx:385-391`）

```tsx
          onClick={() => createMutation.mutate({})}
          disabled={createMutation.isPending || multiSelectIds.size > 0}
          className="w-full lg:w-auto gap-2"
        >
          <MessageSquarePlusIcon className="w-5 h-5" />
          {createMutation.isPending ? "创建中..." : "新建对话"}
        </Button>
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D2-05 · PC `Button` base 视觉（尺寸 / focus ring）
| 项 | 值 |
|---|---|
| web | `src/components/ui/button.tsx:6, 17-22` |
| PC | `src/components/ui/Button.tsx:75` |
| 判定 | 已一致 |

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

**当前 PC 源码**（`src/components/ui/Button.tsx:75`）

```tsx
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium",
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：PC base 额外带 `gap-2`（spinner 与文字间距）+ `duration-150`，是 web base 的**超集**，不改变 web 已有的视觉

---

#### A1-D2-06 · PC `Button` variant 名 `danger` ↔ web `destructive`
| 项 | 值 |
|---|---|
| web | `src/components/ui/button.tsx:11` |
| PC | `src/components/ui/Button.tsx:39` |
| 判定 | 已一致（色值等价：PC `danger` = web `destructive`） |

**web 源码**
```tsx
// button.tsx:11
destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
```
**当前 PC 源码**（`src/components/ui/Button.tsx:39`）

```tsx
    "bg-danger text-white shadow-sm hover:bg-danger/90",
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

#### A1-D2-07 · PC `Button` size `lg` 高度
| 项 | 值 |
|---|---|
| web | `src/components/ui/button.tsx:20` |
| PC | `src/components/ui/Button.tsx:53` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/components/ui/Button.tsx:53`）

```tsx
  lg: "h-10 rounded-md px-8 text-sm",
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D2-08 · 多选栏「全选」按钮 `gap-1.5`
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:206` |
| PC | `src/routes/ChatList.tsx:362` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/routes/ChatList.tsx:362`）

```tsx
            className="gap-1.5"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D2-09 · 多选栏「删除」按钮 `gap-1.5`
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:218` |
| PC | `src/routes/ChatList.tsx:372` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/routes/ChatList.tsx:372`）

```tsx
            className="gap-1.5"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D2-10 · PC `Input` 背景 token（`bg-bg-sunken` vs `bg-bg-elevated`）
| 项 | 值 |
|---|---|
| web | `src/components/ui/input.tsx:25` |
| PC | `src/components/ui/Input.tsx:26` |
| 判定 | 已一致 |

**web 源码**
```tsx
// input.tsx:25
"flex w-full rounded-md border border-border bg-bg-elevated px-4 py-3 text-base",
```
**当前 PC 源码**（`src/components/ui/Input.tsx:26`）

```tsx
        "flex w-full rounded-md border border-border bg-bg-elevated px-4 py-3 text-base",
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D2-11 · PC `Input` `shadow-sm`
| 项 | 值 |
|---|---|
| web | `src/components/ui/input.tsx:26` |
| PC | `src/components/ui/Input.tsx:27` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/components/ui/Input.tsx:27`）

```tsx
        "placeholder:text-fg-subtle shadow-sm",
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D2-12 · PC `Input` `file:` 文字色（`text-foreground` vs `text-fg`）
| 项 | 值 |
|---|---|
| web | `src/components/ui/input.tsx:33` |
| PC | `src/components/ui/Input.tsx:31` |
| 判定 | 已一致 |

**web 源码**
```tsx
// input.tsx:33
"file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
```
**当前 PC 源码**（`src/components/ui/Input.tsx:31`）

```tsx
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-fg",
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：PC token `text-fg` = `#e5e7eb` = web `text-foreground`（`tailwind.config.ts:77`）⇒ 语义等价

---

#### A1-D2-13 · 重命名弹窗文案（「修改后服务端会保留自定义标题」）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:318-320` |
| PC | `src/routes/ChatList.tsx:521` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:318-320
<SheetDescription>
  修改后服务端会保留自定义标题 (不会在下次自动生成时覆盖).
</SheetDescription>
```

**当前 PC 源码**（`src/routes/ChatList.tsx:521`）

```tsx
          修改后服务端会保留自定义标题 (不会在下次自动生成时覆盖).
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D2-14 · 批量删除确认文案
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:283-285` |
| PC | `src/routes/ChatList.tsx:477` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:283-285
<SheetDescription>
  此操作不可恢复，对话中的消息将被永久删除。
</SheetDescription>
```
**当前 PC 源码**（`src/routes/ChatList.tsx:477`）

```tsx
          此操作不可恢复，对话中的消息将被永久删除。
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D2-15 · 批量删除确认标题（全角问号）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:282` |
| PC | `src/routes/ChatList.tsx:453` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:282
<SheetTitle>确认删除 {selectedIds.size} 条对话？</SheetTitle>
```
**当前 PC 源码**（`src/routes/ChatList.tsx:453`）

```tsx
        title={`确认删除 ${multiSelectIds.size} 条对话？`}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D2-16 · 批量删除确认「取消」按钮 variant
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:288-294` |
| PC | `src/routes/ChatList.tsx:459` |
| 判定 | 已一致 |

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

**当前 PC 源码**（`src/routes/ChatList.tsx:459`）

```tsx
              variant="outline"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D2-17 · 重命名弹窗「保存」按钮 spinner
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:351-353` |
| PC | `src/routes/ChatList.tsx:510-515` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:351-353
{renameMutation.isPending && (
  <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
)}
```

**当前 PC 源码**（`src/routes/ChatList.tsx:510-515`）

```tsx
              onClick={submitRename}
              disabled={!renameDraft.trim()}
              loading={renameMutation.isPending}
              className="gap-2"
            >
              保存
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：PC `Button loading` → `gagaos-spinner`（`Button.tsx` 的 `loading` 分支）且 loading 时自动 disabled ⇒ 与 web 内联 spinner 行为等价

---

#### A1-D2-18 · 重命名弹窗「保存」按钮 `gap-2`
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:349` |
| PC | `src/routes/ChatList.tsx:513` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/routes/ChatList.tsx:513`）

```tsx
              className="gap-2"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D2-19 · 重命名弹窗「保存」按钮空标题禁用
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:348`（`disabled={renameMutation.isPending \|\| !renameDraft.trim()}`） |
| PC | `src/routes/ChatList.tsx:511` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/routes/ChatList.tsx:511`）

```tsx
              disabled={!renameDraft.trim()}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D2-20 · 重命名空标题时的行为（web 弹 toast「标题不能为空」）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:154-157` |
| PC | `src/routes/ChatList.tsx:169` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:153-157
const trimmed = renameDraft.trim();
if (!trimmed) {
  toast({ title: "标题不能为空", variant: "danger" });
  return;
}
```

**当前 PC 源码**（`src/routes/ChatList.tsx:169`）

```tsx
      toast({ message: "标题不能为空", variant: "danger" });
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D2-21 · 重命名「标题未变化」时的行为（web 静默关窗）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:158-161` |
| PC | `src/routes/ChatList.tsx:172-175` |
| 判定 | 已一致 |

**说明**：两者都是「标题未变 → 关闭弹窗、不发请求」，无需改。
- **改动量**：0 行

**当前 PC 源码**（`src/routes/ChatList.tsx:172-175`）

```tsx
    if (trimmed === renameForId.title) {
      setRenameForId(null);
      return;
    }
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D2-22 · 批量删除确认「确认删除」按钮 spinner
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:303-305` |
| PC | `src/routes/ChatList.tsx:467-472` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:303-305
{deleteMutation.isPending && (
  <span className="inline-block w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
)}
```

**当前 PC 源码**（`src/routes/ChatList.tsx:467-472`）

```tsx
              onClick={() => deleteMutation.mutate(Array.from(multiSelectIds))}
              loading={deleteMutation.isPending}
              className="gap-2"
            >
              确认删除
            </Button>
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：PC `Button loading` → `gagaos-spinner` 且 loading 时自动 disabled ⇒ 与 web 内联 spinner 行为等价

---

#### A1-D2-23 · 删除确认按钮 `gap-2`
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:301` |
| PC | `src/routes/ChatList.tsx:469` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/routes/ChatList.tsx:469`）

```tsx
              className="gap-2"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D2-24 · 创建失败 toast（web 分 `title` / `description` 两段）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:88-94` |
| PC | `src/routes/ChatList.tsx:108-110` |
| 判定 | 已一致 |

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

**当前 PC 源码**（`src/routes/ChatList.tsx:108-110`）

```tsx
        title: "创建失败",
        description: String((err as Error)?.message || err),
        variant: "danger",
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D2-25 · 相对时间格式化（web date-fns `formatDistanceToNow` + `zhCN`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:413-416` |
| PC | `src/routes/ChatList.tsx:791-799` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:413-416
const relativeTime = formatDistanceToNow(new Date(updatedAt), {
  addSuffix: true,
  locale: zhCN,
});
```

**当前 PC 源码**（`src/routes/ChatList.tsx:791-799`）

```tsx
function formatRelative(iso: string): string {
  try {
    const t = new Date(iso);
    if (Number.isNaN(t.getTime())) return "";
    return formatDistanceToNow(t, { addSuffix: true, locale: zhCN });
  } catch {
    return "";
  }
}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

### A1 · D3 档 · 补状态与交互（16-40 行）

---

#### A1-D3-01 · 相对时间非法值兜底
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:413` |
| PC | `src/routes/ChatList.tsx:791-799` |
| 判定 | 已一致（PC 增强，按 PM 拍板保留） |

**说明**
- web：`formatDistanceToNow(new Date(NaN))` → 抛 `RangeError: Invalid time value`
- PC：`Date.parse(iso)` 非有限 → 返回 `""`
- **怎么改**：1:1 还原应删掉 PC 的兜底（随 A1-D2-25 一起，`formatRelative` 函数整体删除 → 该条自动消解）
- **改动量**：0 行

**当前 PC 源码**（`src/routes/ChatList.tsx:791-799`）

```tsx
function formatRelative(iso: string): string {
  try {
    const t = new Date(iso);
    if (Number.isNaN(t.getTime())) return "";
    return formatDistanceToNow(t, { addSuffix: true, locale: zhCN });
  } catch {
    return "";
  }
}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：PM 拍板：保留 PC 的静默兜底（返回空串），不照抄 web 抛 `Invalid Date`

---

#### A1-D3-02 · 多选栏位置从「底部」搬到「顶部」（元素在 DOM 中的位置变更）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:187-224`（根容器内第一段） |
| PC | `src/routes/ChatList.tsx:338-339` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/routes/ChatList.tsx:338-339`）

```tsx
        <div className="sticky top-0 z-30 -mx-4 lg:-mx-8 px-4 lg:px-8 mb-4 py-2 bg-bg-elevated border-b border-border flex items-center gap-3">
          <button
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D3-03 · 多选模式「进入/退出条件」（web `isMultiSelectMode`）
| 项 | 值 |
|---|---|
| web | `src/lib/store.ts:205-229`（`isMultiSelectMode` / `enterMultiSelect` / `toggleSelected` / `exitMultiSelect` / `selectAll`）+ `src/app/(main)/chat/page.tsx:175-179`（`enterMultiSelect` 调用点）+ `src/app/(main)/chat/page.tsx:187`（多选栏渲染条件） |
| PC | `src/routes/ChatList.tsx:337` |
| 判定 | 已一致（PM 拍板：按 web `store.ts:218-221` 空集即退多选模式，PC 现状等价，不引入 `isMultiSelectMode` state） |

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

**当前 PC 源码**（`src/routes/ChatList.tsx:337`）

```tsx
      {multiSelectIds.size > 0 ? (
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
| PC | `src/routes/ChatList.tsx:386` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:230
disabled={createChatMutation.isPending || isMultiSelectMode}
```

**当前 PC 源码**（`src/routes/ChatList.tsx:386`）

```tsx
          disabled={createMutation.isPending || multiSelectIds.size > 0}
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

#### A1-D3-05 · 「全选」按钮（web store `selectAll()` / `exitMultiSelect()`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:203-205`（`allSelected ? exitMultiSelect() : selectAll()`） |
| PC | `src/routes/ChatList.tsx:247-254` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:203-205
onClick={() =>
  allSelected ? exitMultiSelect() : selectAll()
}
```
**当前 PC 源码**（`src/routes/ChatList.tsx:247-254`）

```tsx
  const exitMultiSelect = () => {
    setMultiSelectIds(new Set());
  };

  /** 全选 — 对齐 web useChatStore.selectAll (web `src/lib/store.ts:226-229`): 选中当前列表全部 */
  const selectAll = () => {
    setMultiSelectIds(new Set(sortedChats.map((c) => c.id)));
  };
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

#### A1-D3-06 · 「全选」判定口径（web `chats.length` 未过滤）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:181-182` |
| PC | `src/routes/ChatList.tsx:259` |
| 判定 | 已一致（口径已统一，行为无差异） |

**web 源码**
```tsx
// page.tsx:181-182
const allSelected =
  chats.length > 0 && selectedIds.size === chats.length;
```
**当前 PC 源码**（`src/routes/ChatList.tsx:259`）

```tsx
  const allSelected = chats.length > 0 && multiSelectIds.size === chats.length;
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

#### A1-D3-07 · PC `Card` / `CardContent` 组件
| 项 | 值 |
|---|---|
| web | `src/components/ui/card.tsx:1-52` |
| PC | `src/components/ui/Card.tsx:22-38` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/components/ui/Card.tsx:22-38`）

```tsx
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
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    />
  );
});
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D3-08 · PC body 基础字号（16px）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:448`（无字号声明 → 继承 body）+ `gacode-web/src/styles/globals.css:232-239`（body **无** `font-size`）+ `gacode-web/tailwind.config.ts:168`（`fontSize.base` = 16px） |
| PC | `src/routes/ChatList.tsx:646` + `src/styles/globals.css:194-201` + `tailwind.config.ts:162` |
| 判定 | 已一致 |

**核实结论（2026-10-26）**
- PC `src/styles/globals.css:194-201` 的 `body` 规则（`background-color` / `color` / `font-family` / `font-feature-settings` / `-webkit-font-smoothing` / `-moz-osx-font-smoothing`）**无** `font-size`；web `gacode-web/src/styles/globals.css:232-239` 的 `body` 规则**同样无** `font-size` ⇒ 两边 body 字号都不是由 CSS 显式指定。
- 两边 `tailwind.config.ts` 的 `fontSize.base` 都是 `["16px", { lineHeight: "24px" }]`（PC `tailwind.config.ts:159` / web `:168`）⇒ 继承基准一致（16px）。
- PC 列表标题 `ChatList.tsx:644` 已是 `font-medium truncate`（无 `text-*` 类 → 继承 16px），与 web `chat/page.tsx:448` 逐字一致。
- **本条判定由「待核」更正为「已一致」**；A1-D1-15 也**无需**补 `text-base`（已在正文同步改掉「待核」引用）。
- **改动量**：0 行

**当前 PC 源码**（`src/routes/ChatList.tsx:646`）

```tsx
        <div className="font-medium truncate">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

### A1 · D4 档 · 补组件（>40 行）

---

#### A1-D4-01 · 删除确认形态（web 底部 Sheet）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:279-310` |
| PC | `src/routes/ChatList.tsx:450-477` |
| 判定 | 已一致（以 `BottomSheet` 承接 web `Sheet`） |

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

**当前 PC 源码**（`src/routes/ChatList.tsx:450-477`）

```tsx
      {/* 批量删除确认 — 底部 Sheet (A1-D4-01, 对齐 web `chat/page.tsx:279-310`) — 标题 titleClassName 对齐 web SheetTitle (text-lg font-semibold) */}
      <BottomSheet
        open={confirmOpen}
        title={`确认删除 ${multiSelectIds.size} 条对话？`}
        titleClassName="text-lg font-semibold"
        onClose={() => setConfirmOpen(false)}
        footer={
          <>
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
              loading={deleteMutation.isPending}
              className="gap-2"
            >
              确认删除
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          此操作不可恢复，对话中的消息将被永久删除。
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：PC **未**新建 `ui/Sheet.tsx`；复用既有 `components/ui/BottomSheet.tsx`。单条删除仍走 `ConfirmDialog` 属 PC 多出，不进差异清单

---

#### A1-D4-02 · 重命名形态（web 底部 Sheet + Input）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:314-358` |
| PC | `src/routes/ChatList.tsx:494-537` |
| 判定 | 已一致（以 `BottomSheet` 承接 web `Sheet`） |

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

**当前 PC 源码**（`src/routes/ChatList.tsx:494-537`）

```tsx
      {/* 重命名 — 底部 Sheet (A1-D4-02, 对齐 web `chat/page.tsx:314-358`) — 标题 titleClassName 对齐 web SheetTitle (text-lg font-semibold) */}
      <BottomSheet
        open={renameForId !== null}
        title="重命名对话"
        titleClassName="text-lg font-semibold"
        onClose={() => setRenameForId(null)}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setRenameForId(null)}
              disabled={renameMutation.isPending}
            >
              取消
            </Button>
            <Button
              onClick={submitRename}
              disabled={!renameDraft.trim()}
              loading={renameMutation.isPending}
              className="gap-2"
            >
              保存
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg-muted">
          修改后服务端会保留自定义标题 (不会在下次自动生成时覆盖).
        </p>
        <div className="px-4 pb-2 mt-2">
          <Input
            data-testid="rename-input"
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            placeholder="输入新标题"
            maxLength={120}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitRename();
              }
            }}
          />
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D4-03 · 「新建对话」按钮：从顶栏挪到列表上方独立行
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:227-237` |
| PC | `src/routes/ChatList.tsx:380-392` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/routes/ChatList.tsx:380-392`）

```tsx
      {/* 新建对话按钮 — 对齐 web `chat/page.tsx:227-237` (页内大按钮) */}
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

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A1-D4-04 · web Header 标题联动（`setHeaderTitle("对话列表")`）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/page.tsx:69-73`（`setHeaderTitle("对话列表")`） |
| PC | `src/components/layout/AppShell.tsx:67` + `src/App.tsx:112` + `src/components/layout/AppShell.tsx:156-158` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:69-73
const setHeaderTitle = useUIStore((s) => s.setHeaderTitle);
useEffect(() => {
  setHeaderTitle("对话列表");
  return () => setHeaderTitle("新对话");
}, [setHeaderTitle]);
```

**当前 PC 源码**（`src/components/layout/AppShell.tsx:67`）

```tsx
  if (pathname === "/chat") return "对话列表";
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

#### A2-D1-01 · 输入区外层容器（web `border-t border-border p-4 bg-background`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatInput.tsx:64` |
| PC | `src/routes/ChatDetail.tsx:1307` |
| 判定 | 已一致 |

**web 源码**
```tsx
// ChatInput.tsx:64
<div className="border-t border-border p-4 bg-background">
```
**当前 PC 源码**（`src/routes/ChatDetail.tsx:1307`）

```tsx
      <div className="border-t border-border p-4 bg-background">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-02 · 输入条卡片（web「容器卡 + 无边框 textarea」）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatInputBar.tsx:85-92` |
| PC | `src/components/chat/ChatInputBar.tsx:664-674` |
| 判定 | 已一致 |

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

**当前 PC 源码**（`src/components/chat/ChatInputBar.tsx:664-674`）

```tsx
              "bg-bg-elevated rounded-md px-4 py-3 flex items-end gap-2",
              "border transition-colors duration-150",
              "focus-within:border-border",
              isStreaming ? "border-brand/40" : "border-transparent",
              disabled && !isStreaming ? "opacity-60" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {/* 0.7.5 hotfix 2 (gaga 反馈 2026-10-20) — 附件入口统一收在 `+` 按钮.
                 只在 parent 提供 onPlusClick 时显示; Home 等无 PlusActionsSheet 场景
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-03 · textarea 字号
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatInputBar.tsx:115-116` |
| PC | `src/components/chat/ChatInputBar.tsx:706` |
| 判定 | 已一致 |

**web 源码**
```tsx
// ChatInputBar.tsx:115-116
"flex-1 bg-transparent text-fg placeholder:text-fg-subtle outline-none",
"text-base leading-6 resize-none max-h-32 py-2",
```

**当前 PC 源码**（`src/components/chat/ChatInputBar.tsx:706`）

```tsx
                className="w-full bg-transparent text-fg placeholder:text-fg-subtle outline-none text-base leading-6 resize-none max-h-32 py-2 disabled:opacity-60 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-04 · textarea 左内边距
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatInputBar.tsx:116` |
| PC | `src/components/chat/ChatInputBar.tsx:706` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/components/chat/ChatInputBar.tsx:706`）

```tsx
                className="w-full bg-transparent text-fg placeholder:text-fg-subtle outline-none text-base leading-6 resize-none max-h-32 py-2 disabled:opacity-60 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-05 · 发送按钮圆角
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatInputBar.tsx:151` |
| PC | `src/components/chat/ChatInputBar.tsx:762-773` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/components/chat/ChatInputBar.tsx:762-773`）

```tsx
                aria-label="发送"
                onClick={handleSend}
                disabled={
                  disabled ||
                  (!text.trim() && !attachments.some((x) => x.kind === "done"))
                }
                className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-full bg-brand text-brand-on hover:bg-brand-hover transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SendIcon />
              </button>
            )}
          </div>
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-06 · 停止按钮圆角
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatInputBar.tsx:137` |
| PC | `src/components/chat/ChatInputBar.tsx:742-750` |
| 判定 | 已一致 |

**web 源码**
```tsx
// ChatInputBar.tsx:136-140
className={cn(
  "shrink-0 w-9 h-9 rounded-full bg-danger text-white",
  "hover:bg-danger/90 transition-colors duration-150",
  "inline-flex items-center justify-center"
)}
```
**当前 PC 源码**（`src/components/chat/ChatInputBar.tsx:742-750`）

```tsx
                aria-label="停止生成"
                onClick={onStop}
                className="shrink-0 h-9 w-9 inline-flex items-center justify-center rounded-full bg-danger text-white hover:bg-danger/90 transition-colors duration-150"
              >
                <StopIcon />
              </button>
            ) : canRerun && onRerun ? (
              <button
                type="button"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-07 · `+` 附件按钮形态（web 圆形无底色）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatInputBar.tsx:99` |
| PC | `src/components/chat/ChatInputBar.tsx:679-690` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/components/chat/ChatInputBar.tsx:679-690`）

```tsx
                aria-label="附件"
                title="附件"
                onClick={onPlusClick}
                data-testid="chat-plus-button"
                className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center"
              >
                <PlusGlyph />
              </button>
            ) : null}

            {/* textarea — 0.7.5 chat-id-25: 包一个相对容器, SlashMenu 绝对定位浮在上方.
                单一 textarea (阶段 8 chat-id-19 + 0.7.5 P1 f08e147 撞改; 删掉重复 textarea — gagaOS §①) */}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-08 · 输入条 caption 文案
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatInputBar.tsx:165-177`（由 `ChatInput.tsx:81` 传入） |
| PC | `src/components/chat/ChatInputBar.tsx:775-791` |
| 判定 | 已一致 |

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

**当前 PC 源码**（`src/components/chat/ChatInputBar.tsx:775-791`）

```tsx
          {/* 底部 caption — 对齐 web ChatInputBar.tsx:165-177 */}
          <p
            className={[
              "mt-2 text-xs text-center flex items-center justify-center gap-1.5",
              isStreaming ? "text-brand" : "text-fg-muted opacity-50",
            ].join(" ")}
          >
            {isStreaming ? (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-brand animate-pulse"
                aria-hidden="true"
              />
            ) : null}
            <span>
              {isStreaming ? "生成中 · 点击停止按钮中断" : caption}
            </span>
          </p>
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-09 · placeholder 文案
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatInput.tsx:74-76` |
| PC | `src/components/chat/ChatInputBar.tsx:699-704` |
| 判定 | 已一致 |

**web 源码**
```tsx
// ChatInput.tsx:74-76
placeholder={
  isStreaming ? "AI 正在回复..." : "说点什么… (Enter 发送，Shift+Enter 换行)"
}
```
**当前 PC 源码**（`src/components/chat/ChatInputBar.tsx:699-704`）

```tsx
                placeholder={
                  placeholder ??
                  (isStreaming
                    ? "AI 正在回复..."
                    : "说点什么… (Enter 发送，Shift+Enter 换行)")
                }
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-10 · 用户消息气泡底色（web `bg-primary`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:371` |
| PC | `src/components/chat/MessageBubble.tsx:323` |
| 判定 | 已一致 |

**web 源码**
```tsx
// MessageBubble.tsx:370-372
: isUser
  ? "bg-primary text-primary-foreground rounded-br-[4px]"
  : "bg-background border border-border text-foreground rounded-bl-[4px]"
```
**当前 PC 源码**（`src/components/chat/MessageBubble.tsx:323`）

```tsx
          <div className="rounded-[16px] rounded-br-[4px] bg-primary text-primary-foreground px-4 py-3 text-sm leading-relaxed shadow-sm break-words">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-11 · 助手消息气泡（web `border border-border` + `bg-background`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:372` |
| PC | `src/components/chat/MessageBubble.tsx:454` |
| 判定 | 已一致 |

**web 源码**
```tsx
// MessageBubble.tsx:372
: "bg-background border border-border text-foreground rounded-bl-[4px]"
```
**当前 PC 源码**（`src/components/chat/MessageBubble.tsx:454`）

```tsx
          <div className="rounded-[16px] rounded-bl-[4px] bg-background border border-border text-foreground px-4 py-3 text-sm leading-relaxed shadow-sm">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-12 · 气泡内边距
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:359` |
| PC | `src/components/chat/MessageBubble.tsx:323` + `src/components/chat/MessageBubble.tsx:454` |
| 判定 | 已一致 |

**web 源码**
```tsx
// MessageBubble.tsx:358-359
className={cn(
  "max-w-[80%] rounded-[16px] px-4 py-3 text-sm leading-relaxed shadow-sm",
```

**当前 PC 源码**（`src/components/chat/MessageBubble.tsx:323`）

```tsx
          <div className="rounded-[16px] rounded-br-[4px] bg-primary text-primary-foreground px-4 py-3 text-sm leading-relaxed shadow-sm break-words">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-13 · 助手气泡最大宽度
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:359` |
| PC | `src/components/chat/MessageBubble.tsx:428` + `src/components/chat/MessageBubble.tsx:246` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/components/chat/MessageBubble.tsx:428`）

```tsx
      <div className="max-w-[80%] space-y-1">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-14 · 流式光标
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:526` |
| PC | `src/components/chat/MessageBubble.tsx:464` |
| 判定 | 已一致 |

**web 源码**
```tsx
// MessageBubble.tsx:525-527
{isStreaming && isLast && (
  <span className="inline-block w-2 h-3 bg-current animate-pulse rounded-sm" />
)}
```
**当前 PC 源码**（`src/components/chat/MessageBubble.tsx:464`）

```tsx
                    className="inline-block w-2 h-3 bg-current animate-pulse rounded-sm"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-15 · 流式错误 banner 容器形态
| 项 | 值 |
|---|---|
| web | `src/components/chat/StreamingErrorBanner.tsx:121` + `:126-128` |
| PC | `src/components/chat/StreamingErrorBanner.tsx:35` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/components/chat/StreamingErrorBanner.tsx:35`）

```tsx
      className="mx-auto max-w-3xl w-full px-4 pb-2"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-16 · 错误 banner 图标（web lucide `AlertCircle`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/StreamingErrorBanner.tsx:131` |
| PC | `src/components/chat/StreamingErrorBanner.tsx:38` |
| 判定 | 已一致 |

**web 源码**
```tsx
// StreamingErrorBanner.tsx:131
<AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
```
**当前 PC 源码**（`src/components/chat/StreamingErrorBanner.tsx:38`）

```tsx
        <AlertCircleIcon />
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-17 · 错误 banner「重试」按钮形态
| 项 | 值 |
|---|---|
| web | `src/components/chat/StreamingErrorBanner.tsx:139-148` |
| PC | `src/components/chat/StreamingErrorBanner.tsx:46-54` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/components/chat/StreamingErrorBanner.tsx:46-54`）

```tsx
            data-testid="streaming-error-retry"
            className="shrink-0 inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-background px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors focus:outline-none focus:ring-1 focus:ring-destructive/40"
          >
            <RotateCwIcon className="w-3 h-3" />
            <span>重试</span>
          </button>
        ) : null}
        {onDismiss ? (
          <button
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-18 · 错误 banner「关闭」按钮
| 项 | 值 |
|---|---|
| web | `src/components/chat/StreamingErrorBanner.tsx:150-162` |
| PC | `src/components/chat/StreamingErrorBanner.tsx:58-67` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/components/chat/StreamingErrorBanner.tsx:58-67`）

```tsx
            data-testid="streaming-error-dismiss"
            className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded text-destructive/70 hover:text-destructive hover:bg-destructive/10 focus:outline-none focus:ring-1 focus:ring-destructive/40"
          >
            <CloseIcon size={14} className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-19 · 错误文案格式
| 项 | 值 |
|---|---|
| web | `src/components/chat/StreamingErrorBanner.tsx:47-61` |
| PC | `src/components/chat/StreamingErrorBanner.tsx:70-84` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/components/chat/StreamingErrorBanner.tsx:70-84`）

```tsx
export function describeStreamingError(
  kind: StreamingErrorKind,
  raw = "",
): string {
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

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-20 · 审批 banner 容器
| 项 | 值 |
|---|---|
| web | `src/components/chat/ApprovalBanner.tsx:60` |
| PC | `src/components/chat/ApprovalBanner.tsx:106` |
| 判定 | 已一致 |

**web 源码**
```tsx
// ApprovalBanner.tsx:59-61
className={cn(
  "mx-auto max-w-3xl w-full px-4 pb-2",
)}
```
**当前 PC 源码**（`src/components/chat/ApprovalBanner.tsx:106`）

```tsx
      className="mx-auto max-w-3xl w-full px-4 pb-2"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-21 · 审批 banner 标题文案
| 项 | 值 |
|---|---|
| web | `src/components/chat/ApprovalBanner.tsx:72` |
| PC | `src/components/chat/ApprovalBanner.tsx:110-116` |
| 判定 | 已一致 |

**web 源码**
```tsx
// ApprovalBanner.tsx:71-74
<span className="text-sm font-semibold text-red-600">
  {requests.length > 1 ? `待审批 (${requests.length})` : "待审批"}
</span>
<span className="text-xs text-fg-muted">工具调用需要你确认</span>
```
**当前 PC 源码**（`src/components/chat/ApprovalBanner.tsx:110-116`）

```tsx
        {/* 标题行 — 对齐 web ApprovalBanner.tsx:69-75 */}
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangleIcon className="w-5 h-5 text-red-500 shrink-0" />
          <span className="text-sm font-semibold text-red-600">
            {requests.length > 1 ? `待审批 (${requests.length})` : "待审批"}
          </span>
          <span className="text-xs text-fg-muted">工具调用需要你确认</span>
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-22 · 审批 banner 4 按钮布局
| 项 | 值 |
|---|---|
| web | `src/components/chat/ApprovalBanner.tsx:109` |
| PC | `src/components/chat/ApprovalBanner.tsx:151` |
| 判定 | 已一致 |

**web 源码**
```tsx
// ApprovalBanner.tsx:109
<div className="grid grid-cols-4 gap-1.5 mt-3">
```
**当前 PC 源码**（`src/components/chat/ApprovalBanner.tsx:151`）

```tsx
        <div className="grid grid-cols-4 gap-1.5 mt-3">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-23 · 审批按钮「永久」文案
| 项 | 值 |
|---|---|
| web | `src/components/chat/ApprovalBanner.tsx:137` |
| PC | `src/components/chat/ApprovalBanner.tsx:184-192` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/components/chat/ApprovalBanner.tsx:184-192`）

```tsx
            data-testid="approval-always"
          >
            永久
          </button>
        </div>

        {/* 注: 只对列表里第一条 approval 调决策 (跟 web ApprovalBanner + Android
             同款). gaclaw 收到后会 cancel 整个 batch 的 _waiters, 所以"任一按钮
             触发 → 整批清空"语义在 server 侧保证. */}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-24 · 审批 banner detail 截断长度
| 项 | 值 |
|---|---|
| web | `src/components/chat/ApprovalBanner.tsx:102-104` |
| PC | `src/components/chat/ApprovalBanner.tsx:144-146` |
| 判定 | 已一致 |

**web 源码**
```tsx
// ApprovalBanner.tsx:100-106
<div className="mt-2 px-2 py-1 rounded bg-bg-elevated/60 text-xs text-fg-muted line-clamp-3">
  {requests[0].detail.length > 180
    ? `${requests[0].detail.slice(0, 180)}…`
    : requests[0].detail}
</div>
```
**当前 PC 源码**（`src/components/chat/ApprovalBanner.tsx:144-146`）

```tsx
            {requests[0].detail.length > 180
              ? `${requests[0].detail.slice(0, 180)}…`
              : requests[0].detail}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-25 · 附件区容器
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/[id]/page.tsx:1250-1251` |
| PC | `src/components/chat/ChatInputBar.tsx:617-618` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:1250-1251
<div className="mx-auto max-w-3xl w-full px-4 pb-2">
  <div className="flex flex-wrap gap-2">
```
**当前 PC 源码**（`src/components/chat/ChatInputBar.tsx:617-618`）

```tsx
            <div className="mx-auto max-w-3xl w-full">
              <div className="flex flex-wrap gap-2 pb-2">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-26 · 附件 chip 底色（web `bg-bg-base shadow-sm`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/AttachmentChip.tsx:55` |
| PC | `src/components/chat/AttachmentChip.tsx:53` |
| 判定 | 已一致 |

**web 源码**
```tsx
// AttachmentChip.tsx:54-56
className={cn(
  "inline-flex items-center gap-2 px-3 py-2 rounded-md bg-bg-base shadow-sm max-w-full",
  className
)}
```
**当前 PC 源码**（`src/components/chat/AttachmentChip.tsx:53`）

```tsx
        "inline-flex items-center gap-2 px-3 py-2 rounded-md bg-bg-base shadow-sm max-w-full",
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-27 · 知识库挂载 chip 形态（brand-cyan 描边 chip + 逐条可移除）
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/[id]/page.tsx:1311-1331` |
| PC | `src/routes/ChatDetail.tsx:1275-1301` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/routes/ChatDetail.tsx:1275-1301`）

```tsx
      {pendingKnowledgeRefs.length > 0 ? (
        <div className="mx-auto max-w-3xl w-full px-4 pb-2">
          <div className="flex flex-wrap gap-2">
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
          </div>
        </div>
      ) : null}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-28 · 消息列表容器
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageList.tsx:79` |
| PC | `src/components/chat/MessageList.tsx:131` |
| 判定 | 已一致 |

**web 源码**
```tsx
// MessageList.tsx:79
<div className="max-w-3xl mx-auto space-y-4">
```
**当前 PC 源码**（`src/components/chat/MessageList.tsx:131`）

```tsx
        <div className="max-w-3xl mx-auto space-y-4">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-29 · 消息列表加载态（web 4 个异形 Skeleton）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageList.tsx:60-75` |
| PC | `src/routes/ChatDetail.tsx:1231-1245` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/routes/ChatDetail.tsx:1231-1245`）

```tsx
        {historyQuery.isLoading ? (
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="flex justify-start">
              <div className="animate-pulse rounded-2xl bg-muted h-20 w-3/4" />
            </div>
            <div className="flex justify-end">
              <div className="animate-pulse rounded-2xl bg-muted h-16 w-1/2" />
            </div>
            <div className="flex justify-start">
              <div className="animate-pulse rounded-2xl bg-muted h-24 w-2/3" />
            </div>
            <div className="flex justify-start">
              <div className="animate-pulse rounded-2xl bg-muted h-12 w-1/3" />
            </div>
          </div>
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-30 · 「+ 附件」Sheet 网格
| 项 | 值 |
|---|---|
| web | `src/components/chat/SheetActionMenu.tsx:74` |
| PC | `src/components/chat/PlusActionsSheet.tsx:109` |
| 判定 | 已一致（列数保持 3 是 PC 增强：PC 有 6 个动作，web 只有 4 个） |

**web 源码**
```tsx
// SheetActionMenu.tsx:70-75
<SheetContent
  side="bottom"
  className="rounded-t-2xl grid grid-cols-4 gap-3 py-5 px-4 border-x-0"
>
```
**当前 PC 源码**（`src/components/chat/PlusActionsSheet.tsx:109`）

```tsx
      <div className="grid grid-cols-3 gap-3 py-5 px-4" data-testid="plus-actions-sheet">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-31 · 附件按钮图标尺寸
| 项 | 值 |
|---|---|
| web | `src/components/chat/SheetActionMenu.tsx:77` |
| PC | `src/components/chat/PlusActionsSheet.tsx:137-155` |
| 判定 | 已一致 |

**web 源码**
```tsx
// SheetActionMenu.tsx:76-80
<ActionButton
  icon={<ImageIcon className="w-6 h-6" />}
  label="图片"
  onClick={onPickImage}
/>
```
**当前 PC 源码**（`src/components/chat/PlusActionsSheet.tsx:137-155`）

```tsx
function ImageIcon() {
  return (
    <svg
      aria-hidden="true"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：6 个自绘图标统一 24×24 / `strokeWidth="2"`（= web lucide `w-6 h-6` 默认 strokeWidth 2）

---

#### A2-D1-32 · 附件 Sheet 按钮文字色
| 项 | 值 |
|---|---|
| web | `src/components/chat/SheetActionMenu.tsx:50` |
| PC | `src/components/chat/PlusActionsSheet.tsx:116` |
| 判定 | 已一致 |

**说明**：web `flex flex-col items-center gap-2 text-fg-muted hover:text-fg transition-colors duration-150` 与 PC `PlusActionsSheet.tsx:100` 逐字一致。**改动量**：0 行

**当前 PC 源码**（`src/components/chat/PlusActionsSheet.tsx:116`）

```tsx
            className="flex flex-col items-center gap-2 text-fg-muted hover:text-fg transition-colors duration-150"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-33 · 附件 Sheet 圆形图标底衬
| 项 | 值 |
|---|---|
| web | `src/components/chat/SheetActionMenu.tsx:52` |
| PC | `src/components/chat/PlusActionsSheet.tsx:120` |
| 判定 | 已一致 |

**说明**：逐字一致。**改动量**：0 行

**当前 PC 源码**（`src/components/chat/PlusActionsSheet.tsx:120`）

```tsx
              className="w-14 h-14 rounded-full bg-bg-sunken inline-flex items-center justify-center"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-34 · 表情选择器搜索框（web Search 图标 + `pl-9 pr-3`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/EmojiPicker.tsx:138-149` |
| PC | `src/components/home/EmojiPicker.tsx:136` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/components/home/EmojiPicker.tsx:136`）

```tsx
            className="w-full pl-9 pr-3 py-2 rounded-md bg-bg-sunken text-fg placeholder:text-fg-subtle outline-none focus:ring-1 focus:ring-brand"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-35 · 表情选择器分类 tab 容器
| 项 | 值 |
|---|---|
| web | `src/components/chat/EmojiPicker.tsx:154` |
| PC | `src/components/home/EmojiPicker.tsx:140` |
| 判定 | 已一致 |

**web 源码**
```tsx
// EmojiPicker.tsx:154
<div className="flex gap-2 mt-3">
```
**当前 PC 源码**（`src/components/home/EmojiPicker.tsx:140`）

```tsx
          <div className="flex gap-2 mt-3">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-36 · 表情 tab 按钮动画
| 项 | 值 |
|---|---|
| web | `src/components/chat/EmojiPicker.tsx:161` |
| PC | `src/components/home/EmojiPicker.tsx:149` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/components/home/EmojiPicker.tsx:149`）

```tsx
                    "px-3 py-1 rounded-full text-xs transition-colors duration-150",
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-37 · 表情选择器选中后是否关面板
| 项 | 值 |
|---|---|
| web | `src/components/chat/EmojiPicker.tsx:186-189` |
| PC | `src/components/home/EmojiPicker.tsx:179-180` |
| 判定 | 已一致 |

**web 源码**
```tsx
// EmojiPicker.tsx:185-189
onClick={() => {
  onSelect(e.emoji);
  handleOpenChange(false);
}}
```
**当前 PC 源码**（`src/components/home/EmojiPicker.tsx:179-180`）

```tsx
                  onSelect(e.emoji);
                  handleClose();
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-38 · 已撤回占位气泡形态
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:369` + `:376-384` |
| PC | `src/components/chat/MessageBubble.tsx:530` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/components/chat/MessageBubble.tsx:530`）

```tsx
      data-testid="msg-recalled-placeholder"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-39 · 消息气泡时间戳常显
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:501-510` |
| PC | `src/components/chat/MessageBubble.tsx:330` + `src/components/chat/MessageBubble.tsx:470` |
| 判定 | 已一致 |

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

**当前 PC 源码**（`src/components/chat/MessageBubble.tsx:330`）

```tsx
                <span className="text-[10px] text-primary-foreground/50">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-40 · 消息时间文案
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:335-337` |
| PC | `src/components/chat/MessageBubble.tsx:542-550` |
| 判定 | 已一致 |

**web 源码**
```tsx
// MessageBubble.tsx:335-337
const timeAgo = message.createdAt
  ? formatDistanceToNow(new Date(message.createdAt), { addSuffix: true, locale: zhCN })
  : "";
```
**当前 PC 源码**（`src/components/chat/MessageBubble.tsx:542-550`）

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

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-41 · 消息 ⋮ 按钮 hover 顺序
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:548` |
| PC | `src/components/chat/MessageMenu.tsx:253` |
| 判定 | 已一致 |

**说明**：两者最终生效样式相同（`hover:bg-bg-sunken` + `hover:text-fg` + `text-fg-muted`），仅书写顺序不同；PC 尺寸 `w-7 h-7 rounded-full` 与 web 一致。**改动量**：0 行

**当前 PC 源码**（`src/components/chat/MessageMenu.tsx:253`）

```tsx
          className="w-7 h-7 inline-flex items-center justify-center rounded-full text-fg-muted hover:text-fg hover:bg-bg-sunken transition-colors duration-150"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D1-42 · 撤回菜单文案
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:562` |
| PC | `src/components/chat/MessageMenu.tsx:233` |
| 判定 | 已一致 |

**说明**：web `canRecall ? "撤回" : "撤回（已超过 2 分钟）"`，PC 逐字一致；窗口常量两侧都是 `120_000` ms（web `MessageBubble.tsx:54`，PC `MessageMenu.tsx:37`）。**改动量**：0 行

**当前 PC 源码**（`src/components/chat/MessageMenu.tsx:233`）

```tsx
      label: canRecall ? "撤回" : "撤回（已超过 2 分钟）",
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

### A2 · D2 档 · 补元素 / 补文案（4-15 行）

---

#### A2-D2-01 · chat 详情页顶部 header
| 项 | 值 |
|---|---|
| web | `src/components/layout/Header.tsx:174` |
| PC | `src/routes/ChatDetail.tsx:1180` |
| 判定 | 已一致 |

**web 源码**
```tsx
// Header.tsx:174
<header className="sticky top-0 z-30 flex items-center h-14 px-4 border-b bg-background gap-2">
```
**当前 PC 源码**（`src/routes/ChatDetail.tsx:1180`）

```tsx
      <div className="shrink-0 h-14 px-4 bg-background border-b border-border flex items-center gap-2">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D2-02 · chat 详情 header 标题字号
| 项 | 值 |
|---|---|
| web | `src/components/layout/Header.tsx:197-199` |
| PC | `src/routes/ChatDetail.tsx:1181` |
| 判定 | 已一致 |

**web 源码**
```tsx
// Header.tsx:197-199
<div className="flex-1 truncate font-medium min-w-0">
  {title ?? headerTitle}
</div>
```
**当前 PC 源码**（`src/routes/ChatDetail.tsx:1181`）

```tsx
        <div className="flex-1 truncate font-medium min-w-0" title={title}>
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D2-03 · chat 详情 header 右侧「+ 新建聊天」按钮
| 项 | 值 |
|---|---|
| web | `src/components/layout/Header.tsx:204-212` |
| PC | `src/routes/ChatDetail.tsx:1193` |
| 判定 | 已一致 |

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

**当前 PC 源码**（`src/routes/ChatDetail.tsx:1193`）

```tsx
          aria-label="新建聊天"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D2-04 · chat 详情 header ⋮ 菜单（「重命名 / 删除会话」）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Header.tsx:222-242` |
| PC | `src/routes/ChatDetail.tsx:910-923` |
| 判定 | 已一致 |

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

**当前 PC 源码**（`src/routes/ChatDetail.tsx:910-923`）

```tsx
  const headerMenuItems: DropdownMenuItem[] = [
    {
      label: "重命名",
      onClick: () => {
        setRenameValue(title === "新对话" ? "" : title);
        setRenameOpen(true);
      },
    },
    {
      label: "删除会话",
      destructive: true,
      onClick: () => setConfirmDeleteOpen(true),
    },
  ];
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：PC `DropdownMenu` 不支持分隔线（`ui/DropdownMenu.tsx` 的 `DropdownMenuItem` 无 separator 字段），web 有 `DropdownMenuSeparator` ⇒ 残余微差见 §十三

---

#### A2-D2-05 · web 顶部栏重命名弹窗文案（「重命名会话」/「修改当前对话的标题, 影响 Drawer 列表和顶部标题显示。」）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Header.tsx:251-254` |
| PC | `src/routes/ChatDetail.tsx:1413-1414` |
| 判定 | 已一致 |

**web 源码**
```tsx
// Header.tsx:251-254
<AlertDialogTitle>重命名会话</AlertDialogTitle>
<AlertDialogDescription>
  修改当前对话的标题, 影响 Drawer 列表和顶部标题显示。
</AlertDialogDescription>
```
**当前 PC 源码**（`src/routes/ChatDetail.tsx:1413-1414`）

```tsx
          title="重命名会话"
          message="修改当前对话的标题, 影响侧边栏列表和顶部标题显示。"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：web 文案「影响 Drawer 列表和顶部标题显示。」vs PC「影响侧边栏列表和顶部标题显示。」⇒ 语义等价（Drawer = 侧边栏）

---

#### A2-D2-06 · web 顶部栏删除会话弹窗文案（「删除会话?」/「将删除「{title}」及其全部消息, 此操作不可撤销.」）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Header.tsx:295-298` |
| PC | `src/routes/ChatDetail.tsx:1396-1397` |
| 判定 | 已一致 |

**web 源码**
```tsx
// Header.tsx:295-298
<AlertDialogTitle>删除会话?</AlertDialogTitle>
<AlertDialogDescription>
  将删除「{headerTitle || "新对话"}」及其全部消息, 此操作不可撤销.
</AlertDialogDescription>
```
**当前 PC 源码**（`src/routes/ChatDetail.tsx:1396-1397`）

```tsx
          title="删除会话?"
          message={`将删除「${title || "新对话"}」及其全部消息, 此操作不可撤销.`}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D2-07 · web 重命名弹窗保存按钮 pending 文案（「保存中...」）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Header.tsx:283` |
| PC | `src/routes/ChatDetail.tsx:1413-1439` |
| 判定 | 已一致（PM 拍板不改，PC 现状即目标） |

**web 源码**
```tsx
// Header.tsx:283
{renameMutation.isPending ? "保存中..." : "保存"}
```
**当前 PC 源码**（`src/routes/ChatDetail.tsx:1413-1439`）

```tsx
          title="重命名会话"
          message="修改当前对话的标题, 影响侧边栏列表和顶部标题显示。"
          confirmLabel="保存"
          cancelLabel="取消"
          loading={renameMutation.isPending}
          onCancel={() => setRenameOpen(false)}
          onConfirm={() => {
            const v = renameValue.trim();
            if (!v) {
              toast({ message: "标题不能为空", variant: "warning" });
              return;
            }
            renameMutation.mutate(v);
          }}
        >
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            maxLength={64}
            placeholder="输入新标题"
            autoFocus
            data-testid="rename-input"
          />
        </ConfirmDialog>
      ) : null}
    </div>
  );
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：PM 拍板：通用 `ConfirmDialog` 不加页面专属的「保存中...」文案

---

#### A2-D2-08 · web 审批 banner 风险等级 badge
| 项 | 值 |
|---|---|
| web | `src/components/chat/ApprovalBanner.tsx:32-46` + `:93` |
| PC | `src/components/chat/ApprovalBanner.tsx:48-66` + `src/components/chat/ApprovalBanner.tsx:135` |
| 判定 | 已一致 |

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

**当前 PC 源码**（`src/components/chat/ApprovalBanner.tsx:48-66`）

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

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D2-09 · 审批 banner「同意一次/本次会话」按钮 variant
| 项 | 值 |
|---|---|
| web | `src/components/chat/ApprovalBanner.tsx:118-131` |
| PC | `src/components/chat/ApprovalBanner.tsx:166` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/components/chat/ApprovalBanner.tsx:166`）

```tsx
            data-testid="approval-once"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D2-10 · 审批 banner「拒绝」按钮配色
| 项 | 值 |
|---|---|
| web | `src/components/chat/ApprovalBanner.tsx:110-117` |
| PC | `src/components/chat/ApprovalBanner.tsx:157` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/components/chat/ApprovalBanner.tsx:157`）

```tsx
            data-testid="approval-deny"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D2-11 · 审批 banner「永久」按钮 variant
| 项 | 值 |
|---|---|
| web | `src/components/chat/ApprovalBanner.tsx:132-138` |
| PC | `src/components/chat/ApprovalBanner.tsx:184` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/components/chat/ApprovalBanner.tsx:184`）

```tsx
            data-testid="approval-always"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D2-12 · web 审批 banner「多个工具共用同一个决策」提示（PC 位置对，文案不同）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ApprovalBanner.tsx`（无此提示，web 标题已含数量） |
| PC | `src/components/chat/ApprovalBanner.tsx:190-194` |
| 判定 | PC 多出（web 无）→ **不列入** |

**说明**：web 端没有这句提示。按「不列 PC 增强」规则，此条不计入差异。

**当前 PC 源码**（`src/components/chat/ApprovalBanner.tsx:190-194`）

```tsx
        {/* 注: 只对列表里第一条 approval 调决策 (跟 web ApprovalBanner + Android
             同款). gaclaw 收到后会 cancel 整个 batch 的 _waiters, 所以"任一按钮
             触发 → 整批清空"语义在 server 侧保证. */}
        {requests.length > 1 ? (
          <p className="text-[11px] text-fg-subtle pt-0.5">
```

**怎么改**
- 不改（按 gaga 口径：PC 有、web 没有 ⇒ 不进差异清单，保留不动）。

---

#### A2-D2-13 · 消息列表「跳到底」按钮（PC 有，web 无）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageList.tsx`（无） |
| PC | `src/components/chat/MessageList.tsx:174-184` |
| 判定 | PC 多出（web 无）→ **不列入** |

**当前 PC 源码**（`src/components/chat/MessageList.tsx:174-184`）

```tsx
      {/* "跳到底" 浮动按钮 — 用户向上滚时显示 */}
      {!autoFollow ? (
        <button
          type="button"
          onClick={handleJumpToBottom}
          aria-label="跳到底部"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-bg-elevated text-fg shadow-elevation-2 px-3 py-1.5 text-xs hover:bg-bg-sunken transition-colors duration-150"
        >
          ↓ 跳到底
        </button>
      ) : null}
```

**怎么改**
- 不改（按 gaga 口径：PC 有、web 没有 ⇒ 不进差异清单，保留不动）。

---

#### A2-D2-14 · web 消息列表空态：PC 有「暂无消息 — 在底部输入框开始你的第一条消息」（web 无）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageList.tsx`（无空态） |
| PC | `src/components/chat/MessageList.tsx:134` |
| 判定 | PC 多出（web 无）→ **不列入** |

**当前 PC 源码**（`src/components/chat/MessageList.tsx:134`）

```tsx
              暂无消息 — 在底部输入框开始你的第一条消息
```

**怎么改**
- 不改（按 gaga 口径：PC 有、web 没有 ⇒ 不进差异清单，保留不动）。

---

### A2 · D3 档 · 补状态与交互（16-40 行）

---

#### A2-D3-01 · web「已挂载知识库」chip 的 title
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/[id]/page.tsx:1316`（`title={r.title || r.id}`） |
| PC | `src/routes/ChatDetail.tsx:1284` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/routes/ChatDetail.tsx:1284`）

```tsx
                title={r.title || r.id}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D3-02 · web 发送时把知识库 marker 注入输入框
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/[id]/page.tsx:1124-1129` |
| PC | `src/routes/ChatDetail.tsx:947-955` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:1124-1129
const markerText = items
  .map((it) => `@[library:${it.id}] ${it.title || "未命名"}`)
  .join("\n");
chatInputRef.current?.insertText(markerText);
```

**当前 PC 源码**（`src/routes/ChatDetail.tsx:947-955`）

```tsx
        const markerText = items
          .map((it) => `@[library:${it.id}] ${it.title || "未命名"}`)
          .join("\n");
        inputBarRef.current?.insertText(markerText);
      }
      toast({
        message: `已挂载 ${items.length} 条知识库`,
        variant: "default",
      });
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
| PC | `src/components/chat/MessageMenu.tsx:165` + `src/components/chat/MessageMenu.tsx:187` + `src/components/chat/MessageMenu.tsx:201` |
| 判定 | 已一致 |

**说明**：web 用 `toast({ title: "已撤回", variant: "success" })`，PC 用 `toast({ message: "已撤回", variant: "success" })` → 文案一致，仅字段名不同（web Toast 支持 title+description，PC Toast 只有 message）→ 见 A1-D2-24 的 Toast 结构说明。**改动量**：0 行

**当前 PC 源码**（`src/components/chat/MessageMenu.tsx:165`）

```tsx
      toast({ message: "已保存到知识库", variant: "success" });
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D3-04 · web 撤回窗口判定实时化
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/[id]/page.tsx:1025-1032` |
| PC | `src/components/chat/MessageMenu.tsx:63-75` |
| 判定 | 已一致 |

**说明**：web `canRecallFor` 每次 render 用 `Date.now()` 重算；PC `canRecallMessage(messageId, createdAt, recalledOrDeleted)` 默认 `now = Date.now()` → 语义一致。**改动量**：0 行

**当前 PC 源码**（`src/components/chat/MessageMenu.tsx:63-75`）

```tsx
export function canRecallMessage(
  messageId: string,
  createdAt: string | undefined,
  recalledOrDeleted: boolean | undefined,
  now: number = Date.now(),
): boolean {
  if (!messageId) return false;
  if (recalledOrDeleted) return false;
  if (!createdAt) return false;
  const ts = new Date(createdAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return now - ts < RECALL_WINDOW_MS;
}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D3-05 · web `SheetContent` 底部形态（无标题栏 / 全宽 / 圆角 2xl）
| 项 | 值 |
|---|---|
| web | `src/components/ui/sheet.tsx:69-74` + `:95` |
| PC | `src/components/ui/BottomSheet.tsx:119` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/components/ui/BottomSheet.tsx:119`）

```tsx
          "relative w-full inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl bg-bg-elevated text-fg shadow-elevation-3 flex flex-col p-6",
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D3-06 · web `Sheet` 的 overlay / ESC / 滚动锁
| 项 | 值 |
|---|---|
| web | `src/components/ui/sheet.tsx:44-56`（ESC + body 滚动锁）+ `:84-88`（overlay 点击关闭） |
| PC | `src/components/ui/BottomSheet.tsx:83-95` + `src/components/ui/BottomSheet.tsx:108` |
| 判定 | 已一致 |

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

**当前 PC 源码**（`src/components/ui/BottomSheet.tsx:83-95`）

```tsx
  // ESC 关闭 + body 滚动锁 (对齐 web sheet.tsx:44-56)
  // ⚠️ hook 必须在 `if (!open) return null` 之前 — 早退会跳过后续 hook.
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
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D3-07 · web 消息自动滚动（`scrollIntoView({ behavior: "smooth" })`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageList.tsx:55-57` |
| PC | `src/components/chat/MessageList.tsx:93` |
| 判定 | 已一致 |

**web 源码**
```tsx
// MessageList.tsx:55-57
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: "smooth" });
}, [chatMessages.length, streamingMessageId]);
```
**当前 PC 源码**（`src/components/chat/MessageList.tsx:93`）

```tsx
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D3-08 · web 消息列表滚动容器 padding
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/[id]/page.tsx:1209` |
| PC | `src/components/chat/MessageList.tsx:127` |
| 判定 | 已一致 |

**web 源码**
```tsx
// page.tsx:1209
<div className="flex-1 overflow-y-auto p-4">
```
**当前 PC 源码**（`src/components/chat/MessageList.tsx:127`）

```tsx
        className="h-full overflow-y-auto p-4"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D3-09 · web 停止按钮在流式期间**不接 disabled**
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatInputBar.tsx:122-131`（注释 + 停止键无 disabled） |
| PC | `src/components/chat/ChatInputBar.tsx:679-690` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/components/chat/ChatInputBar.tsx:679-690`）

```tsx
                aria-label="附件"
                title="附件"
                onClick={onPlusClick}
                data-testid="chat-plus-button"
                className="shrink-0 w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center"
              >
                <PlusGlyph />
              </button>
            ) : null}

            {/* textarea — 0.7.5 chat-id-25: 包一个相对容器, SlashMenu 绝对定位浮在上方.
                单一 textarea (阶段 8 chat-id-19 + 0.7.5 P1 f08e147 撞改; 删掉重复 textarea — gagaOS §①) */}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：PC 的 `+` 按钮**不接** `disabled`，停止按钮同样不接 disabled

---

### A2 · D4 档 · 补组件（>40 行）

---

#### A2-D4-01 · web `Sheet` 组件（PC 以 `BottomSheet` 承接）
| 项 | 值 |
|---|---|
| web | `src/components/ui/sheet.tsx:1-176` |
| PC | `src/components/ui/BottomSheet.tsx:71-147` |
| 判定 | 已一致（以 `BottomSheet` 承接 web `Sheet`） |

**当前 PC 源码**（`src/components/ui/BottomSheet.tsx:71-147`）

```tsx
export function BottomSheet({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  contentClassName,
  titleClassName,
  header,
  hideTitle = false,
}: BottomSheetProps) {
  // ESC 关闭 + body 滚动锁 (对齐 web sheet.tsx:44-56)
  // ⚠️ hook 必须在 `if (!open) return null` 之前 — 早退会跳过后续 hook.
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

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* 底部抽屉形态 — 对齐 web `sheet.tsx:94-97` (bg-bg-elevated + text-fg +
          shadow-elevation-3 + gap-4 + p-6) 与 `sheet.tsx:69-74` (bottom:
          inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl).
          ⚠️ PC 无 tailwind-merge → 同名类由 CSS 产物顺序决胜, 调用方要覆盖
          base class 请带 `!` 前缀 (见文件头注释). */}
      <div
        className={[
          "relative w-full inset-x-0 bottom-0 max-h-[85vh] rounded-t-2xl bg-bg-elevated text-fg shadow-elevation-3 flex flex-col p-6",
          contentClassName ?? "",
        ].join(" ")}
      >
        {!hideTitle && title ? (
          <div className="flex items-center justify-between mb-3 shrink-0">
            <div className="min-w-0">
              <h2
                className={["text-base font-medium", titleClassName]
                  .filter(Boolean)
                  .join(" ")}
              >
                {title}
              </h2>
              {subtitle ? (
                <p className="text-xs text-fg-muted mt-0.5">{subtitle}</p>
              ) : null}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="关闭">
              ×
            </Button>
          </div>
        ) : null}
        {header ? <div className="shrink-0">{header}</div> : null}
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
        {footer ? (
          <div className="flex items-center justify-end gap-2 mt-0 pt-3 border-t border-border shrink-0">
            {footer}
          </div>
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：PC **未**新建 `ui/Sheet.tsx`；`BottomSheet` 已具备 web `SheetContent` 的底部形态 + ESC + 滚动锁 + X 关闭

---

#### A2-D4-02 · web `ExecutionTimeline` 组件挂载
| 项 | 值 |
|---|---|
| web | `src/components/chat/ExecutionTimeline.tsx:1-159` |
| PC | `src/components/chat/MessageBubble.tsx:457` + `src/routes/ChatDetail.tsx:295` + `src/routes/ChatDetail.tsx:299` |
| 判定 | 已一致（M3 批在途 · 工作区未提交） |

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

**当前 PC 源码**（`src/components/chat/MessageBubble.tsx:457`）

```tsx
            <ExecutionTimeline phases={phases ?? []} />
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：组件已**挂载**到 assistant 气泡正文上方（对齐 web `MessageBubble.tsx:396-398`）；数据通路在 `ChatDetail.tsx`：`streamingPhases` state + `streamingPhasesRef` 累积（`chunk.reasoning` → `type:"thinking"`、tool 事件 → `type:"tool"`）。⚠️ 此条由并发 worker 的 **M3 批**在**工作区未提交**状态下落地

---

#### A2-D4-03 · web 用户气泡 markdown 反色
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:340-342` |
| PC | `src/components/chat/MessageBubble.tsx:128-129` + `src/components/chat/MessageBubble.tsx:325` |
| 判定 | 已一致（M3 批在途 · 工作区未提交） |

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

**当前 PC 源码**（`src/components/chat/MessageBubble.tsx:128-129`）

```tsx
const USER_MARKDOWN_WRAPPER_CLASS =
  "[&_code]:!bg-primary-foreground/20 [&_pre]:!bg-primary-foreground/10 [&_blockquote]:!border-primary-foreground/40 [&_a]:!text-primary-foreground";
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：反色 class 已抄 web `MessageBubble.tsx:340-342`，并用 `!` 前缀压过 `globals.css` 末尾 M2 段未分层的 `.md-inline-code` / `.md-code-run` / `.md-link` 规则。⚠️ M3 批在工作区未提交状态下落地

---

#### A2-D4-04 · web 用户气泡走 Markdown 渲染
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:401-405` |
| PC | `src/components/chat/MessageBubble.tsx:326` + `src/components/chat/MessageBubble.tsx:323` |
| 判定 | 已一致（M3 批在途 · 工作区未提交） |

**web 源码**
```tsx
// MessageBubble.tsx:401-405
{markdownContent && (
  <div className={markdownWrapperClass}>
    <Markdown>{markdownContent}</Markdown>
  </div>
)}
```
**当前 PC 源码**（`src/components/chat/MessageBubble.tsx:326`）

```tsx
              <Markdown>{content}</Markdown>
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：user 气泡正文已改走 `<Markdown>`；外层同时去掉 `whitespace-pre-wrap`（段落间距交回 `.md-para`）。⚠️ M3 批在工作区未提交状态下落地

---

#### A2-D4-05 · web 消息「重新发送 / 撤回 / 删除」入口的父层回调链
| 项 | 值 |
|---|---|
| web | `src/app/(main)/chat/[id]/page.tsx:925-1032` |
| PC | `src/routes/ChatDetail.tsx:754` + `src/components/chat/MessageMenu.tsx:96` |
| 判定 | 已一致 |

**说明**：web 的 `recallMutation` / `deleteMutation` / `saveToKnowledgeMutation` + `handleRecall` / `handleDelete` / `handleSaveToKnowledge` / `canRecallFor`，PC 在 `MessageMenu.tsx` 内直接调 api 并通过 `onActionDone` 回调父层 → 能力等价。**改动量**：0 行

**当前 PC 源码**（`src/routes/ChatDetail.tsx:754`）

```tsx
  const handleMessageAction = useCallback(
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A2-D4-06 · web `stripImageUrls` 渲染层剥图
| 项 | 值 |
|---|---|
| web | `src/components/chat/MessageBubble.tsx:164-198` + `:311-333` |
| PC | `src/components/chat/MessageBubble.tsx:407` + `src/components/chat/MessageBubble.tsx:87` + `src/routes/ChatDetail.tsx:429` |
| 判定 | 已一致（M3 批在途 · 工作区未提交） |

**web 源码**
```tsx
// MessageBubble.tsx:311-313
const markdownContent = isUser
  ? userDisplayContent
  : stripReferencedImageUrls(displayContent, stripImageUrls ?? []);
```
（`stripReferencedImageUrls` 剥 `![alt](URL)` / `[text](URL)` / 裸 URL 三种形态，URL 比较先剥 `?exp=…&sig=…` query，见 `MessageBubble.tsx:141-198`）

**当前 PC 源码**（`src/components/chat/MessageBubble.tsx:407`）

```tsx
  const markdownContent = stripReferencedImageUrls(content, stripImageUrls ?? []);
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：工具函数 `stripUrlQuery` / `normalizeUrls` / `stripReferencedImageUrls` 已抄 web `MessageBubble.tsx:141-198`（剥 `![alt](URL)` / `[text](URL)` / 裸 URL 三形态，URL 比较先剥 `?exp=…&sig=…`）；父层 `ChatDetail.tsx` 算 `userImageUrls` 并集并下传给 `MessageList` → `MessageBubble`。⚠️ M3 批在工作区未提交状态下落地

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

#### A3-D1-01 · 顶栏卡片容器
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:180` |
| PC | `src/components/layout/AppShell.tsx:282` |
| 判定 | 已一致 |

**web 源码**
```tsx
// Drawer.tsx:180
<div className="rounded-md bg-bg-elevated m-3 mb-0 p-3 flex items-center gap-2">
```
**当前 PC 源码**（`src/components/layout/AppShell.tsx:282`）

```tsx
        <div className="rounded-md bg-bg-elevated m-3 mb-0 p-3 flex items-center gap-2">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D1-02 · 侧栏主菜单卡片外边距
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:205` |
| PC | `src/components/layout/AppShell.tsx:311` |
| 判定 | 已一致 |

**web 源码**
```tsx
// Drawer.tsx:205
<nav className="rounded-md bg-bg-elevated m-3 mb-0 p-2 space-y-1">
```
**当前 PC 源码**（`src/components/layout/AppShell.tsx:311`）

```tsx
        <nav className="rounded-md bg-bg-elevated m-3 mb-0 p-2 space-y-1">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D1-03 · 侧栏对话区卡片外边距
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:231` |
| PC | `src/components/layout/AppShell.tsx:352` |
| 判定 | 已一致 |

**web 源码**
```tsx
// Drawer.tsx:231
<section className="flex-1 overflow-y-auto rounded-md bg-bg-elevated m-3 p-2">
```
**当前 PC 源码**（`src/components/layout/AppShell.tsx:352`）

```tsx
        <section className="flex-1 overflow-y-auto rounded-md bg-bg-elevated m-3 p-2 min-h-0">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D1-04 · 菜单项字号
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:381` |
| PC | `src/components/layout/AppShell.tsx:320` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/components/layout/AppShell.tsx:320`）

```tsx
                  "w-full flex items-center gap-3 px-3 py-2 text-base font-medium rounded-md transition-colors duration-150",
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D1-05 · 菜单项左侧图标（web `Icon w-5 h-5 text-fg-muted`）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:383` |
| PC | `src/components/layout/AppShell.tsx:326` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/components/layout/AppShell.tsx:326`）

```tsx
                <span className="w-5 h-5 shrink-0 text-fg-muted inline-flex items-center justify-center">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D1-06 · 菜单项 active 高亮：PC 有（web Drawer 无 active 态）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:381`（无 active 分支） |
| PC | `src/components/layout/AppShell.tsx:322` |
| 判定 | PC 多出（web 无）→ **不列入** |

**当前 PC 源码**（`src/components/layout/AppShell.tsx:322`）

```tsx
                    ? "bg-bg-sunken text-fg"
```

**怎么改**
- 不改（按 gaga 口径：PC 有、web 没有 ⇒ 不进差异清单，保留不动）。

---

#### A3-D1-07 · 菜单项 hover 色（web `hover:bg-bg-base`）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:381` |
| PC | `src/components/layout/AppShell.tsx:323` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/components/layout/AppShell.tsx:323`）

```tsx
                    : "text-fg-muted hover:bg-bg-base",
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D1-08 · 铃铛按钮尺寸
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:193` |
| PC | `src/components/layout/AppShell.tsx:299` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/components/layout/AppShell.tsx:299`）

```tsx
            className="relative w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D1-09 · 未读角标位置
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:197` |
| PC | `src/components/layout/AppShell.tsx:303` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/components/layout/AppShell.tsx:303`）

```tsx
              <span className="absolute top-1.5 right-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold bg-brand text-brand-on">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D1-10 · 用户卡 hover 底色
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:326` |
| PC | `src/components/layout/AppShell.tsx:366` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/components/layout/AppShell.tsx:366`）

```tsx
          className="rounded-md bg-bg-elevated m-3 p-3 flex items-center gap-3 text-left hover:bg-bg-base transition-colors duration-150"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D1-11 · 用户名字号
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:340-342` |
| PC | `src/components/layout/AppShell.tsx:375` |
| 判定 | 已一致 |

**web 源码**
```tsx
// Drawer.tsx:340-342
<span className="flex-1 min-w-0 truncate text-base font-medium">
  {displayName}
</span>
```
**当前 PC 源码**（`src/components/layout/AppShell.tsx:375`）

```tsx
          <span className="flex-1 min-w-0 truncate text-base font-medium">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D1-12 · 登出按钮形态
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:349-359` |
| PC | `src/components/layout/AppShell.tsx:381-391` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/components/layout/AppShell.tsx:381-391`）

```tsx
        {/* 登出 — 对齐 web Drawer.tsx:349-359 (Button ghost + LogOut 图标) */}
        <div className="mx-3 mb-3 mt-2">
          <Button
            variant="ghost"
            size="md"
            className="w-full !justify-start gap-2 !text-danger hover:!bg-danger-soft/30"
            onClick={handleLogout}
          >
            <LogoutIcon />
            <span>登出</span>
          </Button>
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D1-13 · 置顶折叠头内边距
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:238` |
| PC | `src/components/layout/AppShell.tsx:560` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/components/layout/AppShell.tsx:560`）

```tsx
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-fg-muted hover:text-fg transition-colors duration-150"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D1-14 · 折叠箭头形态
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:244-249` |
| PC | `src/components/layout/AppShell.tsx:565` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/components/layout/AppShell.tsx:565`）

```tsx
        <ChevronRightIcon className={open ? "rotate-90" : ""} />
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D1-15 · 置顶分组内间距
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:252` |
| PC | `src/components/layout/AppShell.tsx:475` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/components/layout/AppShell.tsx:475`）

```tsx
              <div className="space-y-1 mb-2">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D1-16 · 「最近」分组头内边距
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:273` |
| PC | `src/components/layout/AppShell.tsx:494` |
| 判定 | 已一致 |

**web 源码**
```tsx
// Drawer.tsx:273-277
<div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-fg-muted">
  <Clock className="w-4 h-4" />
  <span className="flex-1">最近</span>
  <span className="text-xs">{recentChats.length}</span>
</div>
```
**当前 PC 源码**（`src/components/layout/AppShell.tsx:494`）

```tsx
            <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-fg-muted">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D1-17 · 「查看更多」按钮文案
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:308-310` |
| PC | `src/components/layout/AppShell.tsx:523` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/components/layout/AppShell.tsx:523`）

```tsx
                    {recentExpanded ? "收起" : `查看更多 (${recent.length - RECENT_DEFAULT_LIMIT})`}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D1-18 · 「查看更多」按钮样式
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:306` |
| PC | `src/components/layout/AppShell.tsx:521` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/components/layout/AppShell.tsx:521`）

```tsx
                    className="w-full mt-1 px-3 py-1.5 rounded-md text-xs text-fg-muted hover:text-fg hover:bg-bg-base transition-colors duration-150"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D1-19 · 侧栏空态
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:315-317` |
| PC | `src/components/layout/AppShell.tsx:528` |
| 判定 | 已一致 |

**web 源码**
```tsx
// Drawer.tsx:314-318
) : (
  <div className="text-sm text-fg-muted px-3 py-4 text-center opacity-70">
    暂无对话
  </div>
)}
```
**当前 PC 源码**（`src/components/layout/AppShell.tsx:528`）

```tsx
              <div className="text-sm text-fg-muted px-3 py-4 text-center opacity-70">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D1-20 · 侧栏骨架
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:279-283` |
| PC | `src/components/layout/AppShell.tsx:572-580` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/components/layout/AppShell.tsx:572-580`）

```tsx
function SkeletonLines() {
  return (
    <div className="space-y-2 px-1">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-md bg-muted h-12 w-full" />
      ))}
    </div>
  );
}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

### A3 · D2 档 · 补元素 / 补文案（4-15 行）

---

#### A3-D2-01 · 顶栏 Cody 图标
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:181-187` |
| PC | `src/components/layout/AppShell.tsx:283-293` |
| 判定 | 已一致 |

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
**当前 PC 源码**（`src/components/layout/AppShell.tsx:283-293`）

```tsx
          {/* A3-D2-01 — 对齐 web `layout/Drawer.tsx:181-187` (32×32 cody_48.png).
              ⚠️ PC 打包后 renderer 走 file:// 加载 (electron/main.ts:214-220),
              根绝对路径 "/assets/..." 会解析到文件系统根 → 裂图;
              故用 import.meta.env.BASE_URL 拼相对路径 (打包态 "./", dev "/"). */}
          <img
            src={`${import.meta.env.BASE_URL}assets/cody/cody_48.png`}
            alt="Cody"
            width={32}
            height={32}
            className="rounded-xl shrink-0"
          />
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：图已从 web 仓拷进 PC `public/assets/cody/cody_48.png`；PC 用 `${import.meta.env.BASE_URL}assets/...` 相对路径（打包后 renderer 走 `file://`，根绝对路径会裂图）

---

#### A3-D2-02 · 顶栏 brand 文字
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:188` |
| PC | `src/components/layout/AppShell.tsx:294` |
| 判定 | 已一致 |

**说明**：web `<span className="flex-1 font-medium truncate">gacode</span>` 与 PC 逐字一致。**改动量**：0 行

**当前 PC 源码**（`src/components/layout/AppShell.tsx:294`）

```tsx
          <span className="flex-1 font-medium truncate">gacode</span>
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D2-03 · 未读角标文案（web `formatUnreadBadge`）
| 项 | 值 |
|---|---|
| web | `src/lib/notifications.ts:495-498` |
| PC | `src/components/layout/AppShell.tsx:304` |
| 判定 | 已一致 |

**说明**：web `formatUnreadBadge(count)` = `n > 99 ? "99+" : String(n)`；PC `unreadCount > 99 ? "99+" : unreadCount` → 等价。**改动量**：0 行

**当前 PC 源码**（`src/components/layout/AppShell.tsx:304`）

```tsx
                {formatUnreadBadge(unreadCount)}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：PC 已直接复用 `src/lib/notifications.ts` 的 `formatUnreadBadge`（与 web `lib/notifications.ts:495-498` 同一实现）⇒ 逐字等价

---

#### A3-D2-04 · 侧栏「日程中心」入口缺失
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:216-220` |
| PC | PC 缺失（无 `/schedule` 路由；`src/App.tsx` 无该路由，`src/components/layout/AppShell.tsx` 的 `NAV_ITEMS` 也没有「日程中心」） |
| 判定 | 缺失（PM 拍板本轮不做） |

**web 源码**
```tsx
// Drawer.tsx:216-220
<DrawerNavItem
  icon={Calendar}
  label="日程中心"
  onClick={() => handleNav("/schedule")}
/>
```

**当前 PC 源码**：PC 缺失（见上表「PC」栏说明）。

**怎么改**
- PM 拍板：**本轮不做**（PC 端没有 `/schedule` 路由，做了入口也是死链）
- 若将来要补：目标文件 `D:\gaga\gaclaw-project\gacode-electron\src\components\layout\AppShell.tsx`
- 锚点：`NAV_ITEMS` + web `Drawer.tsx:216-220`（`Calendar` 图标 + 「日程中心」→ `/schedule`）
- 前置：先建 PC 的 `/schedule` 页面 + 在 `src/App.tsx` 注册路由
- **改动量**：40 行（前置页面另计）—— **挂起，不排期**

---

#### A3-D2-05 · 侧栏「我的应用」入口（仅 userId==6）
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:221-227` |
| PC | `src/components/layout/AppShell.tsx:334-347` |
| 判定 | 已一致 |

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

**当前 PC 源码**（`src/components/layout/AppShell.tsx:334-347`）

```tsx
          {/* 对齐 web Drawer.tsx:221-227 — 「我的应用」入口 (仅 userId==6) */}
          {user && user.id === "6" ? (
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

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D2-06 · PC 顶栏 header（主区域）标题字号
| 项 | 值 |
|---|---|
| web | `src/components/layout/Header.tsx:197-199` |
| PC | `src/components/layout/AppShell.tsx:418` |
| 判定 | 已一致 |

**web 源码**
```tsx
// Header.tsx:197-199
<div className="flex-1 truncate font-medium min-w-0">
  {title ?? headerTitle}
</div>
```
**当前 PC 源码**（`src/components/layout/AppShell.tsx:418`）

```tsx
            <h1 className="flex-1 truncate font-medium min-w-0">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D2-07 · PC 顶栏高度
| 项 | 值 |
|---|---|
| web | `src/components/layout/Header.tsx:174` |
| PC | `src/components/layout/AppShell.tsx:405` |
| 判定 | 已一致 |

**说明**：PC `className="shrink-0 h-14 px-4 bg-bg-base border-b border-border flex items-center gap-2"`，web `className="sticky top-0 z-30 flex items-center h-14 px-4 border-b bg-background gap-2"` → 高度/padding/边框一致；web 额外有 `sticky top-0 z-30`（PC 是 `shrink-0`）→ PC 已在 flex 列里，不需 sticky。**改动量**：0 行

**当前 PC 源码**（`src/components/layout/AppShell.tsx:405`）

```tsx
          <header className="shrink-0 h-14 px-4 bg-bg-base border-b border-border flex items-center gap-2">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

### A3 · D3 档 · 补状态与交互（16-40 行）

---

#### A3-D3-01 · 置顶集合的数据通路
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:62-65`、`:104-147` |
| PC | `src/components/layout/AppShell.tsx:173-186` + `src/components/layout/AppShell.tsx:234` |
| 判定 | 已一致 |

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

**当前 PC 源码**（`src/components/layout/AppShell.tsx:173-186`）

```tsx
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [pinnedSeeded, setPinnedSeeded] = useState(false);
  /** 正在切换置顶的 chat id — 防连点 (同一条不重复发 PATCH) */
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

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D3-02 · PC `queryClient` 引入
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:54`（`const queryClient = useQueryClient();`） |
| PC | `src/components/layout/AppShell.tsx:231` + `src/components/layout/AppShell.tsx:23` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/components/layout/AppShell.tsx:231`）

```tsx
  const queryClient = useQueryClient();
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D3-03 · web 「置顶」分组仅在有置顶项时渲染
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:233` |
| PC | `src/components/layout/AppShell.tsx:467` |
| 判定 | 已一致 |

**说明**：web `{pinnedChats.length > 0 && (…)}`，PC `{pinned.length > 0 ? (…)}` → 一致。**改动量**：0 行

**当前 PC 源码**（`src/components/layout/AppShell.tsx:467`）

```tsx
          {pinned.length > 0 ? (
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A3-D3-04 · web 「最近」分组仅在有最近项时渲染
| 项 | 值 |
|---|---|
| web | `src/components/layout/Drawer.tsx:272-318`（无 `recentChats.length > 0 &&` 包裹，但有 `recentChats.length > 0 ? … : 空态`） |
| PC | `src/components/layout/AppShell.tsx:493-532` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/components/layout/AppShell.tsx:493-532`）

```tsx
          <div className={pinned.length > 0 ? "mt-2" : ""}>
            <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-fg-muted">
              <ClockIcon />
              <span className="flex-1">最近</span>
              <span className="text-xs">{recent.length}</span>
            </div>
            {recent.length > 0 ? (
              <>
                <div className="space-y-1">
                  {visibleRecent.map((c) => (
                    <ChatItem
                      key={c.id}
                      id={c.id}
                      title={c.title}
                      updatedAt={c.updatedAt}
                      isActive={c.id === currentChatId}
                      hasNewMessage={c.hasNewMessage}
                      onPin={onPin}
                      pinned={false}
                      onClick={() => navigate(`/chat/${c.id}`)}
                    />
                  ))}
                </div>
                {recent.length > RECENT_DEFAULT_LIMIT ? (
                  <button
                    type="button"
                    onClick={() => setRecentExpanded((v) => !v)}
                    aria-expanded={recentExpanded}
                    className="w-full mt-1 px-3 py-1.5 rounded-md text-xs text-fg-muted hover:text-fg hover:bg-bg-base transition-colors duration-150"
                  >
                    {recentExpanded ? "收起" : `查看更多 (${recent.length - RECENT_DEFAULT_LIMIT})`}
                  </button>
                ) : null}
              </>
            ) : (
              <div className="text-sm text-fg-muted px-3 py-4 text-center opacity-70">
                暂无对话
              </div>
            )}
          </div>
```

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

#### A4-D1-01 · 标题字号/字重
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:52` |
| PC | `src/components/chat/ChatItem.tsx:78` |
| 判定 | 已一致 |

**web 源码**
```tsx
// ChatItem.tsx:51-52
<div className="flex items-center gap-2">
  <div className="truncate font-medium text-sm flex-1 min-w-0">{title || "新对话"}</div>
```
**当前 PC 源码**（`src/components/chat/ChatItem.tsx:78`）

```tsx
        <span className="truncate font-medium text-sm flex-1 min-w-0">
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A4-D1-02 · active 态底色
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:46-49` |
| PC | `src/components/chat/ChatItem.tsx:73` |
| 判定 | 已一致 |

**web 源码**
```tsx
// ChatItem.tsx:46-49
className={cn(
  "w-full text-left px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  isActive && "bg-accent"
)}
```
**当前 PC 源码**（`src/components/chat/ChatItem.tsx:73`）

```tsx
        isActive ? "bg-accent" : "",
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A4-D1-03 · 非 active 态文字色
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:47` |
| PC | `src/components/chat/ChatItem.tsx:72` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/components/chat/ChatItem.tsx:72`）

```tsx
        "w-full text-left px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：PC 条目容器**不带**文字色类（继承 `text-fg`）⇒ 与 web 一致

---

#### A4-D1-04 · focus 态（web `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:47` |
| PC | `src/components/chat/ChatItem.tsx:72` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/components/chat/ChatItem.tsx:72`）

```tsx
        "w-full text-left px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A4-D1-05 · 圆角/内边距
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:47` |
| PC | `src/components/chat/ChatItem.tsx:72` |
| 判定 | 已一致 |

**说明**：PC `w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left truncate transition-colors duration-150` 的 padding/radius 一致（`text-sm` 需移到标题，见 A4-D1-01）。**改动量**：0 行

**当前 PC 源码**（`src/components/chat/ChatItem.tsx:72`）

```tsx
        "w-full text-left px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

### A4 · D2 档 · 补元素 / 补文案（4-15 行）

---

#### A4-D2-01 · 每条对话的置顶按钮
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:56-73` |
| PC | `src/components/chat/ChatItem.tsx:94` |
| 判定 | 已一致 |

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

**当前 PC 源码**（`src/components/chat/ChatItem.tsx:94`）

```tsx
            aria-label={pinned ? "取消置顶" : "置顶"}
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A4-D2-02 · `SidebarChatItem` 的 `onPin` / `pinned` props
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:13-16` |
| PC | `src/components/chat/ChatItem.tsx:26-37` |
| 判定 | 已一致 |

**web 源码**
```tsx
// ChatItem.tsx:13-16
/** 置顶回调 (传入时右侧渲染置顶按钮) */
onPin?: (chatId: string) => void;
/** 是否已置顶 (用于切换 icon 与 aria-label) */
pinned?: boolean;
```

**当前 PC 源码**（`src/components/chat/ChatItem.tsx:26-37`）

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

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A4-D2-03 · 「有新消息」小圆点
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:53-55` |
| PC | `src/components/chat/ChatItem.tsx:84` |
| 判定 | 已一致 |

**web 源码**
```tsx
// ChatItem.tsx:53-55
{hasNewMessage && (
  <span className="w-2 h-2 rounded-full bg-warning shrink-0" aria-label="有新消息" />
)}
```

**当前 PC 源码**（`src/components/chat/ChatItem.tsx:84`）

```tsx
            aria-label="有新消息"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A4-D2-04 · 条目时间戳
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:75` |
| PC | `src/components/chat/ChatItem.tsx:106` |
| 判定 | 已一致 |

**web 源码**
```tsx
// ChatItem.tsx:75
<div className="text-xs text-muted-foreground mt-0.5">{relativeTime}</div>
```
（`relativeTime = formatDistanceToNow(new Date(updatedAt), { addSuffix: true })`，`ChatItem.tsx:30`）

**当前 PC 源码**（`src/components/chat/ChatItem.tsx:106`）

```tsx
      <div className="text-xs text-muted-foreground mt-0.5">{relativeTime}</div>
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A4-D2-05 · 条目点击时的键盘可达
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:41-45`、`:33-38` |
| PC | `src/components/chat/ChatItem.tsx:66` |
| 判定 | 已一致 |

**说明**：web 的 `handleKeyDown` 手动处理 Enter/Space 是因为外层是 `<div>`；PC 外层是 `<button>` → 键盘 Enter/Space 自动触发。**改动量**：0 行

**当前 PC 源码**（`src/components/chat/ChatItem.tsx:66`）

```tsx
      role="button"
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。
- 备注：PC 用 `div role="button" tabIndex={0}` + Enter/Space（`handleKeyDown`），与 web 结构一致（不是原生 `<button>`）

---

#### A4-D2-06 · 条目容器 hover
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:47` |
| PC | `src/components/chat/ChatItem.tsx:72` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/components/chat/ChatItem.tsx:72`）

```tsx
        "w-full text-left px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

### A4 · D3 档 · 补状态与交互（16-40 行）

---

#### A4-D3-01 · 侧栏条目行首 `ChatBubbleIcon`（web 无此图标 → PC 多出）
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx:51-74`（无图标） |
| PC | `src/components/chat/ChatItem.tsx:76` |
| 判定 | PC 多出（web 无）→ **不列入** |

**说明**：web 的 ChatItem 行首没有气泡图标（第一列就是标题）。按「不列 PC 增强」规则不计入差异；若要 1:1 则删掉 `<ChatBubbleIcon />`（`AppShell.tsx:450`），属删减，列入 A4-D3-01 的「怎么改」提示而不单列为差异。

**当前 PC 源码**（`src/components/chat/ChatItem.tsx:76`）

```tsx
      <div className="flex items-center gap-2">
```

**怎么改**
- 不改（按 gaga 口径：PC 有、web 没有 ⇒ 不进差异清单，保留不动）。

---

#### A4-D3-02 · PC 侧栏条目抽成独立 `ChatItem` 组件（对齐 web 文件边界）—— 已落地
| 项 | 值 |
|---|---|
| web | `src/components/chat/ChatItem.tsx`（独立组件） |
| PC | `src/components/chat/ChatItem.tsx:2-21` + `src/components/layout/AppShell.tsx:40` + `src/components/layout/AppShell.tsx:477` |
| 判定 | 已一致 |

**当前 PC 源码**（`src/components/chat/ChatItem.tsx:2-21`）

```tsx
 * components/chat/ChatItem.tsx — 侧边栏「对话条目」组件
 *
 * 1:1 对齐 web `gacode-web/src/components/chat/ChatItem.tsx` (79 行):
 *   - PC 之前把这个条目内联在 `components/layout/AppShell.tsx` 的
 *     `SidebarChatItem` 里 (AppShell.tsx:546-613), web 是独立组件 →
 *     按 A4-D3-02 抽成独立文件, props 与 web 对齐.
 *
 * 结构 (跟 web 一致):
 *   第一行: 气泡图标 + 标题 + 「有新消息」圆点 + 置顶按钮
 *   第二行: 相对时间 (text-xs text-muted-foreground)
 *
 * 保留的 PC 增强 (doc A4-D3-01 判为「PC 多出 → 不列入差异」):
 *   - 行首 <ChatBubbleIcon /> (web 没有)
 *   - relativeTime 用 date-fns + locale zhCN (web ChatItem 没传 locale)
 *     → 若要严格 1:1 改成 `formatDistanceToNow(new Date(updatedAt), { addSuffix: true })`
 *   - aria-current={isActive ? "page" : undefined}
 *
 * 依赖: date-fns (PC 已有), components/ui/Glyphs (PinIcon / PinOffIcon / ChatBubbleIcon)
 */
import type { KeyboardEvent } from "react";
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

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

#### A5-D3-01 · 知识库选择器（多选 + 「完成 (N)」按钮）
| 项 | 值 |
|---|---|
| web | `src/components/chat/LibraryPicker.tsx:63-75`、`:80-84`、`:280-320` |
| PC | `src/components/home/LibraryPicker.tsx:149-161` + `src/components/chat/KnowledgeAttachSheet.tsx:34` |
| 判定 | 已一致 |

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

**当前 PC 源码**（`src/components/home/LibraryPicker.tsx:149-161`）

```tsx
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
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

---

#### A5-D3-02 · LibraryPicker 类型 tab（全部/图片/文档/链接）+ 搜索框
| 项 | 值 |
|---|---|
| web | `src/components/chat/LibraryPicker.tsx:38-43`、`:190-206`、`:175-188` |
| PC | `src/components/home/LibraryPicker.tsx:165-196` |
| 判定 | 已一致（类型 tab + 搜索框已齐；类型图标配色仍继承 `currentColor`，残余差见 §十三） |

**当前 PC 源码**（`src/components/home/LibraryPicker.tsx:165-196`）

```tsx
      <div className="px-1 pt-1 pb-3 border-b border-border space-y-2">
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
        <div className="flex gap-2 overflow-x-auto">
          {TYPE_TABS.map((t) => {
            const active = t.key === typeFilter;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTypeFilter(t.key)}
                className={[
                  "shrink-0 px-3 py-1 rounded-full text-xs transition-colors duration-150",
                  active
                    ? "bg-brand text-brand-on"
                    : "bg-bg-sunken text-fg-muted hover:text-fg",
                ].join(" ")}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
```

**怎么改**
- 已落地（见 §十二.2）—— PC 侧与 web 源码逐字/语义等价，**无需改动**。

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

