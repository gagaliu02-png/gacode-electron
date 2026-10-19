/**
 * components/notifications/NotificationSettingsSheet.tsx — 通知偏好设置面板
 * (gacode-electron 0.7.5 P1 notifications-10)
 *
 * 设计要点:
 *   - 弹出: 复用 BottomSheet 居中弹层 (跟 Browser 用同一组件)
 *   - 数据源: 客户端 localStorage (api.ts loadNotificationPrefs /
 *     saveNotificationPrefs), server 端 /agent-push-preferences 端点暂未
 *     接入 (send-blocker). 等 server 接通切回 server, 本组件只换数据源.
 *   - 字段:
 *     · enabled:        总开关
 *     · desktopEnabled: 系统通知栏 (Windows Toast)
 *     · inAppEnabled:   应用内 toast
 *     · categories:     按类目屏蔽 (system / chat / library / delivery)
 *   - 「测试通知」 按钮: 调 SystemNotification.fire 验证 desktop 路径通
 *
 * 跟 Android 端 AgentPushPreferences.kt 同形态 (类目屏蔽 + 总开关), 但
 * 客户端持久化. 详细见 audit §3.8 notifications-10.
 *
 * 用法:
 *   <NotificationSettingsSheet
 *     open={settingsOpen}
 *     onClose={() => setSettingsOpen(false)}
 *   />
 */

import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import {
  loadNotificationPrefs,
  saveNotificationPrefs,
  type NotificationPrefs,
} from "../../lib/api";
import {
  SystemNotification,
  type SystemNotificationHandle,
} from "./SystemNotification";
import { useToast } from "../ui/Toast";

export interface NotificationSettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationSettingsSheet({
  open,
  onClose,
}: NotificationSettingsSheetProps) {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPrefs>(() =>
    loadNotificationPrefs(),
  );
  const notifyRef = useRef<SystemNotificationHandle>(null);

  // 打开时重读 localStorage — 防止跨标签页 / SSE 路径改动 prefs 后看不到
  useEffect(() => {
    if (open) setPrefs(loadNotificationPrefs());
  }, [open]);

  const update = (next: Partial<NotificationPrefs>) => {
    const merged: NotificationPrefs = {
      ...prefs,
      ...next,
      categories: {
        ...prefs.categories,
        ...(next.categories ?? {}),
      },
    };
    setPrefs(merged);
    saveNotificationPrefs(merged);
  };

  const toggleCategory = (key: keyof NotificationPrefs["categories"]) => {
    const next: NotificationPrefs["categories"] = {
      ...prefs.categories,
      [key]: !prefs.categories[key],
    };
    update({ categories: next });
  };

  const fireTest = async () => {
    if (!prefs.enabled) {
      toast({ message: "总开关已关闭", variant: "warning" });
      return;
    }
    if (!prefs.desktopEnabled) {
      toast({ message: "桌面通知开关已关闭", variant: "warning" });
      return;
    }
    const ok = await notifyRef.current?.fire({
      title: "gacode 测试通知",
      body: "如果你看到这条, 系统通知链路是通的",
    });
    if (ok) {
      toast({ message: "已弹一条测试通知", variant: "success" });
    } else {
      toast({ message: "通知桥未就绪, 当前环境可能不支持", variant: "warning" });
    }
  };

  return (
    <BottomSheet open={open} title="通知设置" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-fg-subtle">
          设置在当前设备本地保存。系统通知走 Windows 通知中心, 关掉后只剩
          应用内提示。
        </p>

        {/* 总开关 */}
        <ToggleRow
          label="启用通知"
          description="关掉后, 应用内和桌面通知都不会再弹"
          checked={prefs.enabled}
          onChange={(v) => update({ enabled: v })}
        />

        <div className="border-t border-border pt-3 space-y-3">
          <ToggleRow
            label="桌面通知"
            description="通过 Windows 通知中心弹出"
            checked={prefs.desktopEnabled}
            disabled={!prefs.enabled}
            onChange={(v) => update({ desktopEnabled: v })}
          />
          <ToggleRow
            label="应用内提示"
            description="在窗口顶部显示 toast"
            checked={prefs.inAppEnabled}
            disabled={!prefs.enabled}
            onChange={(v) => update({ inAppEnabled: v })}
          />
        </div>

        <div className="border-t border-border pt-3 space-y-3">
          <h3 className="text-sm font-medium">按类目屏蔽</h3>
          <p className="text-xs text-fg-subtle -mt-2">
            关掉某个类目后, 该类的新通知会被静默丢弃
          </p>
          <CategoryRow
            label="系统"
            checked={prefs.categories.system}
            disabled={!prefs.enabled}
            onChange={() => toggleCategory("system")}
          />
          <CategoryRow
            label="聊天"
            checked={prefs.categories.chat}
            disabled={!prefs.enabled}
            onChange={() => toggleCategory("chat")}
          />
          <CategoryRow
            label="库"
            checked={prefs.categories.library}
            disabled={!prefs.enabled}
            onChange={() => toggleCategory("library")}
          />
          <CategoryRow
            label="交付"
            checked={prefs.categories.delivery}
            disabled={!prefs.enabled}
            onChange={() => toggleCategory("delivery")}
          />
        </div>

        {/* 测试通知 — 仅在 desktop 开着时有效 */}
        <div className="border-t border-border pt-3 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fireTest}
            disabled={!prefs.enabled || !prefs.desktopEnabled}
          >
            弹一条测试通知
          </Button>
          <span className="text-xs text-fg-subtle">
            验证主进程 Notification 链路
          </span>
        </div>

        {/* hidden mount of SystemNotification — 提供 fire() handle */}
        <SystemNotification ref={notifyRef} enabled={prefs.desktopEnabled} />
      </div>
    </BottomSheet>
  );
}

// ────────────── sub-components ──────────────

function ToggleRow({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={[
        "flex items-start gap-3 cursor-pointer",
        disabled ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 accent-brand"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm">{label}</div>
        {description ? (
          <div className="text-xs text-fg-subtle mt-0.5">{description}</div>
        ) : null}
      </div>
    </label>
  );
}

function CategoryRow({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={[
        "w-full flex items-center justify-between rounded-md px-3 py-2 text-sm",
        "border border-border hover:bg-bg-sunken",
        disabled ? "opacity-50 cursor-not-allowed" : "transition-colors duration-150",
      ].join(" ")}
    >
      <span>{label}</span>
      <span
        className={[
          "inline-block w-9 h-5 rounded-full relative",
          checked ? "bg-brand" : "bg-bg-sunken",
        ].join(" ")}
      >
        <span
          className={[
            "absolute top-0.5 w-4 h-4 rounded-full bg-bg-base shadow-sm",
            "transition-all duration-150",
            checked ? "left-[18px]" : "left-0.5",
          ].join(" ")}
        />
      </span>
    </button>
  );
}