/**
 * components/client-tools/BackgroundJobsSection.tsx — 「我的电脑」卡里的**后台作业**区
 *
 * [2026-11-13 · 订正 27 · B7] 契约依据: cross-platform-sse-event-contract-附录.md
 *   **订正 27**（后台作业）· **订正 26**（端侧的东西只在那台 PC 上有意义）。
 *
 * ## 这一区回答用户的一个问题
 *
 *   「我的电脑上现在还挂着哪个 Claude Code 在跑？」
 *
 * 后台作业 = **派单即返回**、进程 **detached** 的长活（`pc_claude` 跑 Claude Code /
 * `pc_job_start` 跑长命令）⇒ 模型那一轮**不阻塞** ⇒ 代价是**它跑在后台、用户看不见**
 * ⇒ 用户会以为「什么都没发生」⇒ 这一区把它**摆出来**。
 *
 * ## ⚠️ 容错纪律（这一区的头号要求）
 *
 * 桥上那三个方法是**可选的**（主进程侧可能还没实现）⇒
 *   · `listJobs` 不在 ⇒ 整区显示「（暂不可用）」，**不许**白屏、**不许**抛错；
 *   · `onJobs` 不在 ⇒ 只靠轮询（照样能用）；
 *   · `stopJob` 不在 ⇒ 停止按钮不出现（不假装能停）。
 *
 * ⚠️ 「支不支持」是**同步推出来的**（`typeof bridge.listJobs === "function"`）——
 *    preload 在页面加载前就把桥挂好了 ⇒ 这件事在一趟 app 运行里**不变**
 *    ⇒ 不用等第一次异步结果才决定显示什么（那样会先闪一下「没有作业」）。
 *
 * ## ⛔ 停止作业 ≠ 急停
 *
 * 这里**只**调 `clientTools.stopJob(jobId)`（停**这一条**作业）。
 * ⛔ 绝**不**碰 `setGate({ killSwitch })` —— 急停是**全机语义**
 *    （「所有本机操作立刻停下」），混在一起会让用户以为「停一个作业」把整台电脑停了。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LocalJobInfo } from "../../../shared/types";
import { useToast } from "../ui/Toast";
import { LoaderCircleIcon, StopSquareIcon } from "../ui/Glyphs";

/** 轮询间隔（毫秒）—— 作业状态会自己变（跑完 / 被停）。 */
const REFRESH_MS = 5000;

/** 服务 id → 人话类型名（`title` 缺省时的兜底）。 */
const KIND_BY_SERVICE: Record<string, string> = {
  claude: "Claude Code",
  raw: "普通命令",
};

/** 一条作业的人话类型（优先用主进程给的 `title`）。 */
export function jobKind(job: LocalJobInfo): string {
  const t = (job.title || "").trim();
  if (t) return t;
  return KIND_BY_SERVICE[job.serviceId] || job.serviceId || "后台作业";
}

/** 作业状态 → 人话 + 颜色档。 */
export function jobStatusText(status: LocalJobInfo["status"]): { text: string; tone: string } {
  switch (status) {
    case "queued":
      return { text: "排队中", tone: "text-fg-muted" };
    case "running":
      return { text: "正在跑", tone: "text-brand" };
    case "reported":
      return { text: "已完成", tone: "text-success" };
    case "failed":
      return { text: "失败", tone: "text-danger" };
    case "cancelled":
      return { text: "已停止", tone: "text-warning" };
    default:
      return { text: String(status || "未知"), tone: "text-fg-muted" };
  }
}

/** 还在跑吗（还能不能停）。 */
function isActive(job: LocalJobInfo): boolean {
  return job.status === "running" || job.status === "queued";
}

/** 时刻 → 人话（本地时区）。 */
function fmtTime(ms: number | null | undefined): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleString("zh-CN", { hour12: false });
  } catch (_) {
    return "—";
  }
}

/** 已经跑了多久（粗粒度）。 */
function fmtElapsed(fromMs: number): string {
  const ms = Date.now() - fromMs;
  if (!Number.isFinite(ms) || ms < 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时 ${m % 60} 分`;
  return `${Math.floor(h / 24)} 天`;
}

export function BackgroundJobsSection() {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<LocalJobInfo[]>([]);
  /** 读列表失败（与「不支持」是两回事：前者要报错，后者只是还没实现）。 */
  const [error, setError] = useState<string | null>(null);
  /** 正在停的那一条（防重复点）。 */
  const [stopping, setStopping] = useState<string | null>(null);

  const bridge = typeof window !== "undefined" ? window.gacode?.clientTools : undefined;
  /** 桥上那三个方法是**可选的** ⇒ 支不支持要自己判。 */
  const canList = typeof bridge?.listJobs === "function";
  const canStop = typeof bridge?.stopJob === "function";

  const refresh = useCallback(async () => {
    const b = bridge;
    if (!b || typeof b.listJobs !== "function") return;
    try {
      const list = await b.listJobs();
      setJobs(Array.isArray(list) ? list : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "读不到后台作业列表");
    }
  }, [bridge]);

  // 轮询兜底（主进程推不到时的唯一通路）。
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // 订阅作业变化（主进程 → 渲染层）⇒ 状态一变就重画，不必等轮询。
  useEffect(() => {
    const b = bridge;
    if (!b || typeof b.onJobs !== "function") return;
    let unsub: (() => void) | null = null;
    try {
      unsub = b.onJobs((list) => {
        setJobs(Array.isArray(list) ? list : []);
        setError(null);
      });
    } catch (_) {
      // 桥不支持订阅 ⇒ 靠轮询。
    }
    return () => {
      try {
        unsub?.();
      } catch (_) {
        // 退订失败不影响界面。
      }
    };
  }, [bridge]);

  const stop = useCallback(
    async (job: LocalJobInfo) => {
      const b = bridge;
      if (!b || typeof b.stopJob !== "function") {
        toast({
          title: "停不掉",
          description: "这个版本还不支持停后台作业。",
          variant: "warning",
        });
        return;
      }
      setStopping(job.id);
      try {
        const r = await b.stopJob(job.id);
        if (r && r.ok === false) {
          toast({
            title: "没停掉",
            description: r.error || "作业可能已经结束了。",
            variant: "danger",
          });
        } else {
          toast({
            title: "已停止",
            description: `${jobKind(job)} 已经被停掉。`,
            variant: "default",
          });
        }
      } catch (e) {
        toast({
          title: "停不掉",
          description: e instanceof Error ? e.message : "请稍后重试",
          variant: "danger",
        });
      } finally {
        setStopping(null);
        await refresh();
      }
    },
    [bridge, refresh, toast],
  );

  // 还在跑的排前面 ⇒ 用户先看到「还挂着的」；其余按开始时间倒序。
  const { active, settled } = useMemo(() => {
    const sorted = [...jobs].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    return {
      active: sorted.filter(isActive),
      settled: sorted.filter((j) => !isActive(j)),
    };
  }, [jobs]);

  if (!bridge) return null;

  // ── 桥上还没有 listJobs ⇒ 明确说「暂不可用」，不白屏、不抛错。
  if (!canList) {
    return (
      <div className="p-4 border-b border-white/[0.06]">
        <div className="text-sm font-medium text-fg">后台作业</div>
        <div className="text-[11px] text-fg-subtle mt-1">（暂不可用）</div>
      </div>
    );
  }

  return (
    <div className="p-4 border-b border-white/[0.06]">
      <div className="flex items-center gap-2">
        <div className="text-sm font-medium text-fg">
          后台作业{active.length > 0 ? `（${active.length} 个在跑）` : ""}
        </div>
      </div>
      <div className="text-[11px] text-fg-muted mt-0.5 mb-2">
        派单即返回、在这台电脑上自己跑的长活（关掉 Gacode 也还在跑）。
      </div>

      {error ? (
        <div className="text-[11px] text-danger mb-2">读不到作业列表：{error}</div>
      ) : null}

      {jobs.length === 0 && !error ? (
        <div className="text-[11px] text-fg-subtle">现在没有后台作业。</div>
      ) : null}

      {/* ── 正在跑 ── */}
      {active.length > 0 ? (
        <div className="space-y-1.5 mb-3">
          {active.map((j) => {
            const st = jobStatusText(j.status);
            return (
              <div key={j.id} className="rounded-md bg-bg-sunken/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <LoaderCircleIcon className="w-3.5 h-3.5 text-brand shrink-0" />
                  <span className="text-sm text-fg truncate">{jobKind(j)}</span>
                  <span className={["text-[11px] shrink-0", st.tone].join(" ")}>{st.text}</span>
                  {canStop ? (
                    <button
                      type="button"
                      disabled={stopping === j.id}
                      onClick={() => void stop(j)}
                      className="ml-auto shrink-0 inline-flex items-center gap-1 text-[11px] text-fg-muted hover:text-danger transition-colors duration-150 disabled:opacity-40"
                      aria-label="停止这个后台作业"
                      title="停止这个后台作业"
                    >
                      <StopSquareIcon className="w-3 h-3" />
                      停止
                    </button>
                  ) : null}
                </div>
                <div className="text-[10px] text-fg-subtle mt-0.5">
                  开始：{fmtTime(j.startedAt)}
                  {j.startedAt ? ` · 已跑 ${fmtElapsed(j.startedAt)}` : ""}
                  {j.pid ? ` · pid ${j.pid}` : ""}
                </div>
                {j.summary ? (
                  <div className="text-[11px] text-fg-muted mt-0.5 break-words">
                    {j.summary.length > 400 ? `${j.summary.slice(0, 400)}…` : j.summary}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* ── 已结束 ── */}
      {settled.length > 0 ? (
        <div className="space-y-1.5">
          <div className="text-[11px] text-fg-muted">已结束（{settled.length}）</div>
          {settled.map((j) => {
            const st = jobStatusText(j.status);
            return (
              <div key={j.id} className="flex items-baseline gap-2 text-[11px]">
                <span className="text-fg shrink-0">{jobKind(j)}</span>
                <span className={["shrink-0", st.tone].join(" ")}>{st.text}</span>
                <span className="text-fg-muted truncate">
                  {j.summary ? j.summary : `开始于 ${fmtTime(j.startedAt)}`}
                </span>
                <span className="text-fg-subtle shrink-0 ml-auto">{fmtTime(j.startedAt)}</span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
