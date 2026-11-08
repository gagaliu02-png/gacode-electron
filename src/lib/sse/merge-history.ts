// [批 G13-4 · 2026-11-08] **历史合并** + **接入流建行** —— 抽成纯函数, 让「空气泡」能被行为级测试钉住.
//
// ---------------------------------------------------------------------------
// 病根 (gaga 2026-11-08 真机报障: 「web端的气泡会断成两个」)
// ---------------------------------------------------------------------------
//   服务端那一轮**增量落库**时, assistant 行带了 `metadata.turnKey` (契约订正 16)。
//   端侧接入流 (attach) 也在本地建了一行 assistant —— 但**那一行没带 turnKey**。
//   ⇒ 历史回来做合并时:
//        本地行: `tk` 为空 ⇒ 走 `if (!tk || !srv)` ⇒ 原样留下 (inflight);
//        服务端行: `turnKey` 有值但没人跟它配对 ⇒ 也留在 finalServer 里;
//   ⇒ **两条气泡**。
//
//   ⛔ 合并逻辑本身是对的 —— 错的是「建行时漏钉身份」。
//      所以本文件把**建行**也收进来 (buildAttachRow), 让测试能端到端跑一遍:
//      建行 → 合并 ⇒ 一条。
//
// ---------------------------------------------------------------------------
// 为什么不留在 page.tsx 里
// ---------------------------------------------------------------------------
//   page.tsx 是 React 组件, 没法在 node --test 里直接跑断言。
//   本文件是**纯函数** ⇒ `node --test test/merge-history.test.mjs` 直接跑, 完全离线。
//   ⚠️ 合并逻辑是「轮次身份」契约 (订正 16) 的落地点 —— 它**必须**有一个能跑的测试,
//      否则下一次谁动一下 page.tsx 里的内联版本, 空气泡就回来了, 没人拦得住。
//
// ---------------------------------------------------------------------------
// 契约 (照抄 page.tsx 原内联逻辑, 逐字不改语义)
// ---------------------------------------------------------------------------
//   · 只保留**服务端还没落库**的在飞行 (未结束的 assistant 行), 其余一律以服务端为准;
//   · 有 turnKey ⇒ 同一轮 ⇒ **合成**到本地那一条 (本地 id 不变 ⇒ 正在流的那一行继续被更新);
//   · 没有 turnKey (老服务端 / 老数据) ⇒ 回落老的启发式, 行为不变。

/** 能参与合并的行 —— 只列合并逻辑真正用到的字段。 */
export interface MergeableRow {
  id: string;
  role: string;
  content?: string | null;
  /** ★ v2 (契约订正 16): 轮次身份。 */
  turnKey?: string | null;
  /** 本地态: 流还没结束 (null) / 已结束 (时间戳)。 */
  finishedAt?: number | null;
  /** RC-5: 「接不回来」标记 —— 这样的行**也要活着**。 */
  stalled?: boolean;
  richEvents?: readonly unknown[] | null;
  phases?: readonly unknown[] | null;
}

/**
 * 合并服务端历史与本地在飞行行 ⇒ 屏幕上最终该显示的行。
 *
 * @param serverRows 服务端历史 (已解析出 `turnKey` / `phases` / `richEvents`)
 * @param localRows  本地那一轮的乐观行 (id 形如 `streaming-*` / `attaching-*`)
 */
export function mergeHistoryRows<
  S extends MergeableRow,
  L extends MergeableRow,
>(serverRows: S[], localRows: L[]): (S | L)[] {
  const serverIds = new Set(serverRows.map((m) => m.id));
  // 服务端那一行的 `metadata.turnKey` ⇒ 索引。
  const serverByTurnKey = new Map<string, S>();
  for (const m of serverRows) {
    if (m.turnKey) serverByTurnKey.set(m.turnKey, m);
  }
  const mergedTurnKeys = new Set<string>();
  const inflight: L[] = [];
  for (const m of localRows) {
    const isCandidate =
      m.role === "assistant" &&
      // ★ RC-5: `stalled` 的行**也要活着** —— 服务端那一轮可能根本没落库
      //   (续传接不回来 ⇒ 这一轮没结果) ⇒ 丢了就是空气泡, 用户连「白等过」
      //   都不知道发生过。⚠️ 安卓同款 (messages_local.stalled 落库 ⇒ 重进仍是 stalled)。
      (m.finishedAt == null || m.stalled === true) &&
      (m.id.startsWith("streaming-") || m.id.startsWith("attaching-")) &&
      !serverIds.has(m.id);
    if (!isCandidate) continue;
    const tk = m.turnKey;
    const srv = tk ? serverByTurnKey.get(tk) : undefined;
    if (!tk || !srv) {
      // ⚠️ 没有轮次身份 ⇒ 配不上 ⇒ 本地行原样留下 (老行为, 不变)。
      inflight.push(m);
      continue;
    }
    // ★ 同一轮 ⇒ 合成到本地那一条上 (本地 id 不变 ⇒ 流式更新不断)。
    mergedTurnKeys.add(tk);
    inflight.push({
      ...m,
      content:
        (srv.content?.length ?? 0) > (m.content?.length ?? 0)
          ? srv.content
          : m.content,
      richEvents:
        (srv.richEvents?.length ?? 0) > (m.richEvents?.length ?? 0)
          ? srv.richEvents
          : m.richEvents,
      phases:
        (srv.phases?.length ?? 0) > (m.phases?.length ?? 0)
          ? srv.phases
          : m.phases,
      // ★ RC-5: 服务端**有**这一轮 ⇒ 不是「没接回来」⇒ **清掉** stalled 标记
      //   (否则用户在「已经有完整答案」的气泡上还看到「未收到服务端回复」)。
      stalled: undefined,
    } as unknown as L);
  }
  const finalServer = serverRows.filter(
    (m) => !(m.turnKey && mergedTurnKeys.has(m.turnKey))
  );
  return [...finalServer, ...inflight];
}

/**
 * 接入流 (attach) 在本地建的那一行 —— **必须带上轮次身份**。
 *
 * ⚠️ 这就是「空气泡」的**唯一**修复点:
 *   建行时不带 turnKey ⇒ 历史合并配不上 ⇒ 本地行 + 服务端行 = 两条气泡。
 *
 * @param rowId   本地行 id (`attaching-<chatId>`)
 * @param turnKey 轮次身份 (来自 stream-state 或 attach_ok; 没有 ⇒ undefined ⇒ 回落老行为)
 */
export function buildAttachRow(
  rowId: string,
  turnKey: string | null | undefined,
  now: number = Date.now(),
) {
  return {
    id: rowId,
    role: "assistant" as const,
    content: "",
    createdAt: new Date(now).toISOString(),
    startedAt: now,
    finishedAt: null,
    // `never[]` 而不是 `unknown[]` —— 空数组要能直接塞进 Message (phases: ChatPhase[]
    // / richEvents: RichEventBase[]) ⇒ 空数组必须对任何元素类型都成立。
    phases: [] as never[],
    richEvents: [] as never[],
    // ★ v2 (契约订正 16): 接入的这一轮的身份 ⇒ 历史回来时能精确判同一轮。
    turnKey: turnKey ?? undefined,
  };
}
