/**
 * components/client-tools/ClientToolsCard.tsx — 设置页的「端侧执行」卡
 *
 * [2026-11-12 · P4] 契约依据: cross-platform-sse-event-contract-附录.md
 *   **订正 24 §5**（闸门）· **订正 25 §8**（三端展示义务 L-25u / L-25v）。
 *
 * ## 这一张卡承载 gaga 拍板的三件事
 *
 *   ① **总开关** —— 默认 **开**（gaga：「默认 ON」），而且**物理可见**：
 *      用户随时能看到「AI 现在能不能动我的电脑」，不用去翻文档。
 *   ② **一键急停** —— 「**现在**给我停下」。跟总开关的区别：
 *      总开关 = 「以后别动我的电脑」；急停 = 「**立刻**停下，现在正在跑的那个也停」。
 *   ③ **执行记录** —— 保留 **30 天** + **一键清空**（gaga 拍板）。
 *
 * ## 为什么在线态也在这张卡里
 *
 * 契约 L-25u：web / 安卓 / PC 都**必须**能读到 D4 的结果并显示
 * 「我的电脑：xxx（在线/离线）」—— 用户得知道**东西是不是真在发生**。
 * PC 自己就是那台电脑 ⇒ 它的在线态 = 设备通道是否已建立（服务端判定，L-25t）。
 *
 * ⚠️ **在线态只有一个真源**：设备通道当前是否已建立（主进程判）。
 *    ⛔ 不用「最近心跳在 N 秒内」那种启发式。
 */

import { useCallback, useEffect, useState } from "react";
import type {
  ClientGateState,
  ClientToolAuditEntry,
  ClientToolStatus,
  RunningClientTask,
} from "../../../shared/types";
import { useToast } from "../ui/Toast";
import {
  AlertTriangleIcon,
  ConstructionIcon,
  StopSquareIcon,
  TrashIcon,
  WrenchIcon,
} from "../ui/Glyphs";

/** 状态刷新间隔（毫秒）—— 在线态是活的，不能只取一次。 */
const REFRESH_MS = 5000;

/** 审计列表最多显示多少条。 */
const AUDIT_LIMIT = 50;

/** 一条审计记录的人话。 */
function auditLine(e: ClientToolAuditEntry): { text: string; tone: string } {
  const when = new Date(e.ts).toLocaleString("zh-CN", { hour12: false });
  const tool = e.tool || "pc_tool";
  if (e.outcome === "denied") {
    return { text: `${tool} · 已拒绝（${e.reason || "闸门"}）`, tone: "text-danger" };
  }
  if (e.outcome === "error") {
    return { text: `${tool} · 失败${e.reason ? `（${e.reason}）` : ""}`, tone: "text-warning" };
  }
  return { text: `${tool} · 已执行${e.summary ? ` · ${e.summary}` : ""}`, tone: "text-fg" };
}

export function ClientToolsCard() {
  const { toast } = useToast();
  const [status, setStatus] = useState<ClientToolStatus | null>(null);
  const [gate, setGate] = useState<ClientGateState | null>(null);
  const [audit, setAudit] = useState<ClientToolAuditEntry[]>([]);
  // ★ P6：正在跑的任务（多个会话的任务可以同时跑 ⇒ 用户要看得见、管得住）
  const [running, setRunning] = useState<RunningClientTask[]>([]);
  const [busy, setBusy] = useState(false);

  const bridge = typeof window !== "undefined" ? window.gacode?.clientTools : undefined;

  const refresh = useCallback(async () => {
    if (!bridge) return;
    try {
      const [st, rows] = await Promise.all([
        bridge.status(),
        bridge.audit(AUDIT_LIMIT),
      ]);
      setStatus(st);
      setGate(st.gate);
      setAudit(rows || []);
    } catch (_) {
      // 桥不可用（老 preload / dev 态）⇒ 保持现状，不炸。
    }
  }, [bridge]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  // ★ P6：订阅「正在跑的任务」变化（主进程推过来）⇒ 不用等轮询。
  useEffect(() => {
    if (!bridge) return;
    void bridge.runningTasks().then((t) => setRunning(t || [])).catch(() => {});
    return bridge.onTasks((t) => setRunning(t || []));
  }, [bridge]);

  const setGateState = useCallback(
    async (next: { masterEnabled?: boolean; killSwitch?: boolean }) => {
      if (!bridge) return;
      setBusy(true);
      try {
        const g = await bridge.setGate(next);
        setGate(g);
        setStatus((prev) => (prev ? { ...prev, gate: g } : prev));
        toast({
          title: next.killSwitch === true ? "已紧急停止" : "闸门状态已更新",
          description:
            next.killSwitch === true
              ? "所有端侧执行已停摆，正在跑的命令也会被终止。"
              : next.masterEnabled === false
                ? "AI 看不到任何本机工具了。"
                : "AI 又可以操作你的电脑了。",
          variant: next.killSwitch === true || next.masterEnabled === false ? "danger" : "default",
        });
      } catch (e) {
        toast({
          title: "更新失败",
          description: e instanceof Error ? e.message : "请稍后重试",
          variant: "danger",
        });
      } finally {
        setBusy(false);
      }
    },
    [bridge, toast],
  );

  const clearAudit = useCallback(async () => {
    if (!bridge) return;
    setBusy(true);
    try {
      const res = await bridge.clearAudit();
      setAudit([]);
      toast({
        title: "执行记录已清空",
        description: `清掉了 ${res.cleared} 条记录。`,
        variant: "default",
      });
    } catch (e) {
      toast({
        title: "清空失败",
        description: e instanceof Error ? e.message : "请稍后重试",
        variant: "danger",
      });
    } finally {
      setBusy(false);
    }
  }, [bridge, toast]);

  if (!bridge) return null;

  const master = gate?.masterEnabled !== false;
  const killing = gate?.killSwitch === true;
  const online = status?.connected === true;
  const replaced = !!status?.replacedDeviceId;

  return (
    <section className="mb-6">
      <h2 className="text-sm font-medium text-fg-muted mb-2 px-1">端侧执行</h2>
      <div className="rounded-md bg-bg-elevated overflow-hidden">
        {/* ── 我的电脑（在线态） ── */}
        <div className="p-4 flex items-center gap-3 border-b border-white/[0.06]">
          <span className={["shrink-0", online ? "text-success" : "text-fg-muted"].join(" ")}>
            <ConstructionIcon className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-fg truncate">
              我的电脑：{status?.deviceName || "本机"}
            </div>
            <div className="text-[11px] text-fg-muted truncate">
              {replaced
                ? "已被同一账号在另一台电脑上顶掉，本机已失去执行能力。"
                : online
                  ? "在线 · 设备通道已建立，可以接收派单"
                  : "离线 · 设备通道未连接（关掉 Gacode 或断网时无法接收派单）"}
            </div>
          </div>
          <span
            className={[
              "shrink-0 text-[11px] px-2 py-0.5 rounded-full",
              replaced
                ? "bg-danger-soft text-danger"
                : online
                  ? "bg-success-soft text-success"
                  : "bg-bg-sunken text-fg-muted",
            ].join(" ")}
          >
            {replaced ? "已失效" : online ? "在线" : "离线"}
          </span>
        </div>

        {/* ── 正在跑的任务（P6：多会话并行 ⇒ 看得见、管得住） ── */}
        {running.length > 0 ? (
          <div className="p-4 border-b border-white/[0.06]">
            <div className="text-sm font-medium text-fg mb-2">
              正在你的电脑上执行（{running.length}）
            </div>
            <div className="space-y-1.5">
              {running.map((t) => (
                <div key={t.pendingId} className="flex items-center gap-2 text-[11px]">
                  <span className="font-mono text-fg shrink-0">{t.tool}</span>
                  <span className="text-fg-muted truncate">
                    {t.title || t.sessionId || ''}
                    {t.originClient ? ` · 来自${t.originClient}` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void bridge?.stopTask(t.pendingId);
                    }}
                    className="ml-auto shrink-0 inline-flex items-center gap-1 text-fg-muted hover:text-danger transition-colors duration-150"
                    aria-label="停止这个任务"
                    title="停止这个任务"
                  >
                    <StopSquareIcon className="w-3 h-3" />
                    停止
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* ── 总开关（物理可见，默认开） ── */}
        <div className="p-4 flex items-center justify-between gap-4 border-b border-white/[0.06]">
          <div className="min-w-0">
            <div className="text-sm font-medium text-fg flex items-center gap-2">
              <WrenchIcon className="w-4 h-4 text-brand" />
              允许 AI 操作我的电脑
            </div>
            <div className="text-[11px] text-fg-muted mt-0.5">
              {master
                ? "开启中：模型看得见本机工具（读写文件、跑命令、截图…）。"
                : "已关闭：模型看不见任何本机工具，也不会在这台电脑上执行任何东西。"}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={master}
            aria-label="允许 AI 操作我的电脑"
            disabled={busy}
            onClick={() => void setGateState({ masterEnabled: !master })}
            className={[
              "w-11 h-[26px] rounded-full relative shrink-0 border transition-colors duration-200",
              "disabled:opacity-50",
              master ? "bg-brand border-brand" : "bg-bg-sunken border-border",
            ].join(" ")}
          >
            <span
              className={[
                "absolute top-[2px] left-[2px] w-5 h-5 rounded-full transition-[transform,background] duration-200",
                master ? "translate-x-[18px] bg-brand-on" : "bg-fg-subtle",
              ].join(" ")}
            />
          </button>
        </div>

        {/* ── 一键急停 ── */}
        <div className="p-4 flex items-center justify-between gap-4 border-b border-white/[0.06]">
          <div className="min-w-0">
            <div className="text-sm font-medium text-fg flex items-center gap-2">
              <AlertTriangleIcon className="w-4 h-4 text-danger" />
              紧急停止
            </div>
            <div className="text-[11px] text-fg-muted mt-0.5">
              {killing
                ? "已停止：所有端侧执行停摆，正在跑的命令会被终止。"
                : "一键让所有端侧执行立刻停下（包括正在跑的命令）。"}
            </div>
          </div>
          <button
            type="button"
            disabled={busy || killing}
            onClick={() => void setGateState({ killSwitch: true })}
            className={[
              "shrink-0 px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-150",
              "disabled:opacity-50",
              killing
                ? "bg-danger-soft text-danger"
                : "bg-danger text-white hover:opacity-90",
            ].join(" ")}
          >
            {killing ? "已停止" : "立即停止"}
          </button>
        </div>

        {/* ── 执行记录（30 天 + 一键清空） ── */}
        <div className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-medium text-fg">执行记录</div>
            <button
              type="button"
              disabled={busy || audit.length === 0}
              onClick={() => void clearAudit()}
              className={[
                "shrink-0 inline-flex items-center gap-1 text-[11px] text-fg-muted",
                "hover:text-danger transition-colors duration-150 disabled:opacity-40",
              ].join(" ")}
            >
              <TrashIcon className="w-3.5 h-3.5" />
              清空
            </button>
          </div>
          <div className="text-[11px] text-fg-muted mt-0.5 mb-2">
            保留 30 天 · 只记摘要（不记整段文件内容）
          </div>
          {audit.length === 0 ? (
            <div className="text-[11px] text-fg-subtle">还没有任何执行记录。</div>
          ) : (
            <div className="space-y-1 max-h-48 overflow-auto">
              {audit.map((e, i) => {
                const line = auditLine(e);
                return (
                  <div key={`${e.ts}-${i}`} className="flex items-baseline gap-2 text-[11px]">
                    <span className={["shrink-0", line.tone].join(" ")}>{line.text}</span>
                    <span className="text-fg-subtle shrink-0 ml-auto">
                      {new Date(e.ts).toLocaleString("zh-CN", { hour12: false })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
