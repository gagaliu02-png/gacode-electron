/**
 * components/schedule/ArchivedSheet.tsx — 「已归档」底部弹层 · PC 端 B7
 *
 * 抄自 web `gacode-web/src/components/schedule/ArchivedSheet.tsx` (256 行), 只换 PC 写法:
 *   - `cn(...)`      → 数组 filter(Boolean).join(" ")
 *   - `lucide-react` 的 `X` → PC 图标唯一出处 `components/ui/Glyphs.tsx` 的 `CloseIcon`
 *   - `useToast` from `@/components/common/Toast` → `../ui/Toast`
 *   - `@/lib/schedule-api` → `../../lib/schedule-api`
 *   - 去掉 `"use client"` (Next.js 指令; PC 是 Vite + React, 没有这层)
 *
 * ⚠️ **形态 = 自绘 sheet**, **不套** PC 的 `BottomSheet`:
 *   web 没用通用 Sheet 组件; PC 的 `BottomSheet` 形态也不同 (全宽 + max-h-85vh +
 *   内置标题栏) ⇒ 照抄 web 的自绘 sheet:
 *     容器 `fixed inset-0 z-[90]` + 遮罩 `bg-black/60` +
 *     面板 `max-w-[520px] max-h-[88dvh] rounded-t-2xl shadow-dialog`。
 *
 * ⚠️ **不新建归档路由页** (PM 2026-10-27 亲自读过 web 源码后的修正):
 *   web **没有**独立的归档路由页 —— 归档是以**弹层**的形式出现在**今日待办页**里的
 *   (看板页开的是同一个 sheet)。PC 同样只做弹层, 不加路由。
 *
 * 内容 (照抄 web):
 *   - 四类分组 (任务 / 子任务 / 关键节点 / 日程), **空的类型不显示** (不要 4 个空分组);
 *   - 每条 = 类型标识 chip + 标题 (+ 归档时间 / DDL) + 「恢复」按钮;
 *   - 全部为空 → 空状态「还没有归档项」;
 *   - loading / error / empty 三态都有。
 *
 * 端点 (后端已全通, 端侧只调):
 *   GET  /api/v1/schedules/{tasks|subtasks|milestones|schedules}/archived
 *   POST /api/v1/schedules/{tasks|subtasks|milestones|schedules}/:id/restore
 */

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "../ui/Toast";
import { CloseIcon } from "../ui/Glyphs";
import { describeScheduleError } from "../../lib/schedule-api";
import {
  ARCHIVED_KIND_LABEL,
  ARCHIVED_KINDS,
  loadArchivedByKind,
  restoreArchived,
  type ArchivedByKind,
} from "./archived";
import { fmtDateTime, fmtDdlShort } from "./format";
import type { ArchivedKind, ScheduleNode } from "../../lib/schedule-api";

export interface ArchivedSheetProps {
  /** 开着吗 —— 关着时**整个组件不渲染** (跟 ScheduleFormSheet 同款)。 */
  open: boolean;
  /** 点遮罩 / 点关闭按钮 / 按 Esc → 关闭。 */
  onClose: () => void;
}

/** 一条已归档条目 —— 公共字段用类型收窄拿 (四类 DTO 的公共子集)。 */
interface ArchivedRow {
  id: string;
  title: string;
  archivedAt?: string | null;
  ddl?: string | null;
}

function rowOf(node: ScheduleNode): ArchivedRow {
  return {
    id: node.id,
    title: node.title,
    archivedAt: node.archivedAt ?? null,
    ddl: "ddl" in node ? (node.ddl ?? null) : null,
  };
}

export function ArchivedSheet({ open, onClose }: ArchivedSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isPending, error } = useQuery({
    queryKey: ["schedule", "archived"],
    queryFn: loadArchivedByKind,
    enabled: open,
  });

  // 弹层口径: Esc → 关归档 sheet
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const restoreMutation = useMutation({
    mutationFn: (v: { kind: ArchivedKind; id: string; title: string }) =>
      restoreArchived(v.kind, v.id),
    onSuccess: async (_d, vars) => {
      // 恢复后: 归档列表 + 看板 / 今日待办的计数一起刷
      await queryClient.invalidateQueries({ queryKey: ["schedule"] });
      toast({
        title: `已恢复「${vars.title}」— 回到未归档状态`,
        variant: "success",
      });
    },
    onError: (err) => {
      toast({
        title: "恢复失败",
        description: describeScheduleError(err),
        variant: "danger",
      });
    },
  });

  if (!open) return null;

  const groups = buildGroups(data);

  return (
    <div className="fixed inset-0 z-[90]">
      {/* scrim (原型 .scrim: rgba(0,0,0,.6)) */}
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden="true"
        data-archived-scrim
      />
      {/* .sheet (原型: fixed 底部 / max-width 520px / radius 24px 24px 0 0 / max-h 88dvh) */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="已归档"
        data-archived-sheet
        className="absolute left-0 right-0 bottom-0 mx-auto w-full max-w-[520px] max-h-[88dvh] flex flex-col bg-bg-elevated rounded-t-2xl shadow-dialog"
      >
        {/* .sheet-h */}
        <div className="flex items-center gap-3 px-5 pt-[18px] pb-3 border-b border-white/[0.06]">
          <h2 className="m-0 flex-1 text-base font-medium">已归档</h2>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            data-archived-close
            className="w-9 h-9 rounded-full grid place-items-center text-fg-muted hover:bg-white/[0.07] hover:text-fg transition-colors duration-150"
          >
            <CloseIcon size={18} className="w-[18px] h-[18px]" />
          </button>
        </div>

        {/* .sheet-b (原型: padding 18px 20px / overflow-y auto / flex column gap 16px) */}
        <div
          className="px-5 py-[18px] overflow-y-auto flex-1 flex flex-col gap-4"
          data-archived-body
        >
          {isPending && (
            <div className="text-[13px] text-fg-subtle py-1.5" data-archived-loading>
              加载中…
            </div>
          )}

          {error && (
            <div
              className="rounded-xl border border-danger/40 bg-danger-soft/20 px-4 py-3 text-[13px] text-danger"
              data-archived-error
            >
              已归档列表加载失败:{describeScheduleError(error)}
            </div>
          )}

          {!isPending && !error && groups.length === 0 && (
            /* 原型 B1.5: 归档页无项 → 「还没有归档项」(.emptyline 13px --fg-subtle padding 6px 0) */
            <div className="text-[13px] text-fg-subtle py-1.5" data-archived-empty>
              还没有归档项
            </div>
          )}

          {groups.map((g) => (
            <section key={g.kind} data-archived-group={g.kind}>
              <div className="flex items-center gap-2 mb-2 text-[12px] text-fg-subtle">
                <span>{ARCHIVED_KIND_LABEL[g.kind]}</span>
                <span
                  data-archived-group-cnt
                  className="text-[11px] bg-bg-elevated text-fg-muted rounded-full px-[7px] py-px"
                >
                  {g.items.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {g.items.map((row) => (
                  <div
                    key={row.id}
                    data-archived-row
                    data-kind={g.kind}
                    data-id={row.id}
                    className="flex items-start gap-3 bg-card rounded-lg py-[13px] px-[14px]"
                  >
                    <div className="flex-1 min-w-0">
                      {/* 原型 .ttl.fs-base.fw.clamp2: 15px/22px/500, 2 行截断 */}
                      <div className="text-[15px] leading-[22px] font-medium line-clamp-2 break-words">
                        {row.title}
                      </div>
                      {/* 原型 meta 行: 12px muted, gap 8 wrap, margin-top 5px */}
                      <div className="mt-[5px] flex items-center gap-2 flex-wrap text-[12px] text-fg-subtle">
                        {/* 原型 .chip.cyan: 11px / radius full / padding 2px 8px / 青底青字 */}
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] leading-4 bg-[rgba(13,202,240,0.13)] text-brand-cyan">
                          {ARCHIVED_KIND_LABEL[g.kind]}
                        </span>
                        {row.archivedAt && <span>归档于 {fmtDateTime(row.archivedAt)}</span>}
                        {row.ddl && <span>· DDL {fmtDdlShort(row.ddl)}</span>}
                      </div>
                    </div>
                    <button
                      type="button"
                      data-archived-restore
                      data-id={row.id}
                      data-kind={g.kind}
                      disabled={restoreMutation.isPending}
                      onClick={() =>
                        restoreMutation.mutate({
                          kind: g.kind,
                          id: row.id,
                          title: row.title,
                        })
                      }
                      className={[
                        "shrink-0 inline-flex items-center px-[13px] py-1.5 rounded-full text-[13px]",
                        "bg-bg-elevated text-fg hover:bg-[#222] transition-colors duration-150",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                      ].join(" ")}
                    >
                      恢复
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * buildGroups — 四类分组, **空的类型不渲染** (不要 4 个空分组)。
 *
 *   组内按归档时间倒序 (原型 archivedNodes(): `(b.archivedAt||'')` 倒序)。
 *
 *   导出 = 给断言脚本直接跑真值 (不用起浏览器)。
 */
export function buildGroups(data: ArchivedByKind | undefined): Array<{
  kind: ArchivedKind;
  items: ArchivedRow[];
}> {
  if (!data) return [];
  return ARCHIVED_KINDS.map((kind) => ({
    kind,
    items: (data[kind] ?? [])
      .map(rowOf)
      .sort((a, b) => (b.archivedAt ?? "").localeCompare(a.archivedAt ?? "")),
  })).filter((g) => g.items.length > 0);
}
