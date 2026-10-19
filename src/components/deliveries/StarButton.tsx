/**
 * components/deliveries/StarButton.tsx — 交付物收藏 (star/favorite) 按钮
 *                            (gacode-electron 0.7.5 P2 deliveries-id-9)
 *
 * 跟 web/Android 端 favorite 星标按钮形态对齐:
 *   - 已收藏: filled 黄星; 未收藏: outline 星
 *   - 点一下 toggle 调 server POST/DELETE star endpoint
 *
 * 注: server unified-api 当前**没有**交付物的 star endpoint (grep 后未找到
 *     `deliverables/.../star` — send-blocker). 这里 UI 走完整, 调用会 404 抛错,
 *     弹 toast 提示, 等 server 端补 endpoint 后自然走通. 现阶段本地乐观
 *     toggle 状态也能给用户视觉反馈, 失败回滚.
 */

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { starDeliverable, unstarDeliverable } from "../../lib/api";
import { useToast } from "../ui/Toast";

export interface StarButtonProps {
  deliverableId: string;
  /** 服务端如果已经返了 starred 字段就用; 没返, 客户端本地状态兜底. */
  initialStarred?: boolean;
  size?: "sm" | "md";
  disabled?: boolean;
}

export function StarButton({
  deliverableId,
  initialStarred = false,
  size = "md",
  disabled,
}: StarButtonProps) {
  const [starred, setStarred] = useState(initialStarred);
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      if (starred) {
        return unstarDeliverable(deliverableId);
      }
      return starDeliverable(deliverableId);
    },
    onMutate: () => {
      // 乐观翻转 — 失败 onError 再回滚
      setStarred((s) => !s);
    },
    onSuccess: (res) => {
      if (typeof res?.starred === "boolean") setStarred(res.starred);
      toast({
        message: starred ? "已取消收藏" : "已加入收藏",
        variant: "default",
      });
    },
    onError: (err) => {
      // 失败回滚乐观翻转
      setStarred((s) => !s);
      const msg = err instanceof Error ? err.message : String(err);
      // send-blocker: server 端未实现时落到这里, 走 toast 提示.
      toast({
        message: `收藏失败: ${msg}`,
        variant: "danger",
      });
    },
  });

  const px = size === "sm" ? "px-2 py-1" : "px-3 py-1.5";
  const iconSize = size === "sm" ? 14 : 18;

  return (
    <button
      type="button"
      onClick={() => mutation.mutate()}
      disabled={disabled || mutation.isPending}
      aria-label={starred ? "取消收藏" : "加入收藏"}
      title={starred ? "取消收藏" : "加入收藏"}
      className={[
        "inline-flex items-center gap-1 rounded-md transition-colors duration-150",
        px,
        starred
          ? "text-warning bg-warning/15 hover:bg-warning/25"
          : "text-fg-muted hover:text-fg hover:bg-bg-sunken",
        "disabled:opacity-50 disabled:pointer-events-none",
      ].join(" ")}
    >
      <StarIcon filled={starred} size={iconSize} />
      <span className="text-xs">{starred ? "已收藏" : "收藏"}</span>
    </button>
  );
}

function StarIcon({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
