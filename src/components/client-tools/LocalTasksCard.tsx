/**
 * components/client-tools/LocalTasksCard.tsx — 设置页的「本机定时」卡
 *
 * [2026-11-12 · P7] gaga 拍板：定时任务**只在 Gacode 打开时跑**
 * （**不写** Windows 计划任务 —— 那种做法会绕过本机的闸门与审计）。
 *
 * ## 这一张卡管什么
 *
 *   · 列出本机的定时任务（名字 · cron · 下一次 · 上次结果）；
 *   · 新增 / 删除 / 临时停用；
 *   · 「立刻跑一次」（不用等到点）。
 *
 * ⚠️ 定时器在**主进程**（渲染层刷新不该让定时任务停）；
 *    这一层只是「增删查 + 立刻跑」。
 * ⚠️ 表达式是 **5 段 cron**（分 时 日 月 周），例如 `0 9 * * 1-5` = 工作日 9 点。
 */

import { useCallback, useEffect, useState } from "react";
import type { LocalTask } from "../../../shared/types";
import { useToast } from "../ui/Toast";
import { ClockSmallIcon, PlayIcon, PlusIcon, TrashIcon } from "../ui/Glyphs";

/** 刷新间隔（毫秒）—— 下一次时间会变。 */
const REFRESH_MS = 10000;

function fmtTime(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("zh-CN", { hour12: false });
}

export function LocalTasksCard() {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<LocalTask[]>([]);
  const [name, setName] = useState("");
  const [cron, setCron] = useState("0 9 * * 1-5");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  const bridge = typeof window !== "undefined" ? window.gacode?.localTasks : undefined;

  const refresh = useCallback(async () => {
    if (!bridge) return;
    try {
      setTasks((await bridge.list()) || []);
    } catch (_) {
      // 桥不可用 ⇒ 不显示，不炸。
    }
  }, [bridge]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const add = useCallback(async () => {
    if (!bridge) return;
    if (!prompt.trim()) {
      toast({ title: "还没写要做什么", description: "填一句到点要做的事。", variant: "warning" });
      return;
    }
    setBusy(true);
    try {
      const r = await bridge.upsert({ name: name.trim() || undefined, cron: cron.trim(), prompt: prompt.trim() });
      if (!r.ok) {
        toast({ title: "添加失败", description: r.error || "请检查 cron 表达式", variant: "danger" });
      } else {
        setName("");
        setPrompt("");
        await refresh();
        toast({ title: "已添加", description: "到点它会在本机自己跑。", variant: "default" });
      }
    } finally {
      setBusy(false);
    }
  }, [bridge, name, cron, prompt, refresh, toast]);

  const remove = useCallback(
    async (id: string) => {
      if (!bridge) return;
      await bridge.remove(id);
      await refresh();
    },
    [bridge, refresh],
  );

  const runNow = useCallback(
    async (t: LocalTask) => {
      if (!bridge) return;
      setBusy(true);
      try {
        const r = await bridge.runNow(t.id);
        await refresh();
        toast({
          title: r.ok ? "跑完了" : "没跑成",
          description: r.ok ? "结果在会话里。" : r.error || "请看会话里的报错。",
          variant: r.ok ? "default" : "danger",
        });
      } finally {
        setBusy(false);
      }
    },
    [bridge, refresh, toast],
  );

  if (!bridge) return null;

  return (
    <section className="mb-6">
      <h2 className="text-sm font-medium text-fg-muted mb-2 px-1">本机定时</h2>
      <div className="rounded-md bg-bg-elevated p-4">
        <div className="text-[11px] text-fg-muted mb-3">
          只在 Gacode 开着的时候跑（不写 Windows 计划任务）。到点会在一个专用会话里
          发一条消息，让 AI 帮你做这件事。
        </div>

        {tasks.length === 0 ? (
          <div className="text-[11px] text-fg-subtle mb-3">还没有定时任务。</div>
        ) : (
          <div className="space-y-2 mb-4">
            {tasks.map((t) => (
              <div key={t.id} className="rounded-md bg-bg-sunken/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <ClockSmallIcon className="w-3.5 h-3.5 text-fg-muted shrink-0" />
                  <span className="text-sm text-fg truncate">{t.name}</span>
                  <span className="text-[11px] font-mono text-fg-muted shrink-0">{t.cron}</span>
                  <span className="ml-auto flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runNow(t)}
                      className="p-1 text-fg-muted hover:text-brand transition-colors duration-150 disabled:opacity-40"
                      aria-label="立刻跑一次"
                      title="立刻跑一次"
                    >
                      <PlayIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(t.id)}
                      className="p-1 text-fg-muted hover:text-danger transition-colors duration-150 disabled:opacity-40"
                      aria-label="删除"
                      title="删除"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </span>
                </div>
                <div className="text-[11px] text-fg-muted mt-1 truncate">{t.prompt}</div>
                <div className="text-[10px] text-fg-subtle mt-0.5">
                  下一次：{fmtTime(t.nextRunAt)}
                  {t.lastRunAt ? ` · 上次：${fmtTime(t.lastRunAt)}` : ""}
                  {t.lastError ? ` · 上次失败：${t.lastError}` : ""}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── 新增 ── */}
        <div className="space-y-2 pt-3 border-t border-white/[0.06]">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="任务名（可留空）"
            className="w-full rounded-md bg-bg-sunken border border-border px-3 py-1.5 text-sm text-fg placeholder:text-fg-subtle outline-none focus:border-brand"
          />
          <input
            type="text"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            placeholder="cron 表达式（分 时 日 月 周），例：0 9 * * 1-5"
            className="w-full rounded-md bg-bg-sunken border border-border px-3 py-1.5 font-mono text-sm text-fg placeholder:text-fg-subtle outline-none focus:border-brand"
          />
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="到点做什么？例：把我下载目录里的临时文件按天归档"
            rows={2}
            className="w-full rounded-md bg-bg-sunken border border-border px-3 py-1.5 text-sm text-fg placeholder:text-fg-subtle outline-none focus:border-brand resize-y"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void add()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand text-brand-on text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            <PlusIcon className="w-3.5 h-3.5" />
            添加定时任务
          </button>
        </div>
      </div>
    </section>
  );
}
