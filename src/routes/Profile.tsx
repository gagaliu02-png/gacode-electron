/**
 * routes/Profile.tsx — 阶段 1 我的
 *
 * 显示当前 user 基础信息 + 登出按钮 (跟 AppShell 的登出走同一个 useAuth.logout).
 */

import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../lib/auth";

function initials(displayName: string): string {
  const s = displayName.trim();
  if (!s) return "?";
  return s.charAt(0).toUpperCase();
}

export function Profile() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await logout();
      toast({ message: "已登出", variant: "success" });
      navigate("/login", { replace: true });
    } catch {
      toast({ message: "登出失败,请重试", variant: "danger" });
    }
  };

  const displayName = user?.displayName || user?.username || "User";
  const username = user?.username || "-";
  const userId = user?.id || "-";
  const email = user?.email || "(未设置)";

  return (
    <div className="min-h-full px-6 py-8">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* 用户卡片 */}
        <div className="rounded-md bg-bg-elevated border border-border p-6 flex items-center gap-4">
          <div
            aria-hidden="true"
            className="w-16 h-16 rounded-full shrink-0 bg-brand/30 border border-brand/40 flex items-center justify-center text-fg text-xl font-medium"
          >
            {initials(displayName)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-lg font-medium truncate">{displayName}</p>
            <p className="text-sm text-fg-muted truncate">@{username}</p>
          </div>
        </div>

        {/* 信息列表 */}
        <div className="rounded-md bg-bg-elevated border border-border divide-y divide-border">
          <InfoRow label="用户 ID" value={userId} mono />
          <InfoRow label="用户名" value={username} />
          <InfoRow label="邮箱" value={email} />
          <InfoRow
            label="注册时间"
            value={user?.createdAt ? new Date(user.createdAt).toLocaleString() : "-"}
          />
        </div>

        {/* 登出 */}
        <div className="pt-2">
          <Button
            variant="danger"
            size="lg"
            onClick={handleLogout}
            className="w-full"
          >
            登出
          </Button>
        </div>

        {/* 阶段说明 */}
        <p className="text-xs text-fg-subtle text-center font-mono pt-4">
          阶段 1 — 显示基础 user 字段,头像 / 性别 / 简介编辑阶段 3
        </p>
      </div>
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <span className="w-24 text-sm text-fg-muted shrink-0">{label}</span>
      <span
        className={[
          "flex-1 text-sm text-fg truncate",
          mono ? "font-mono" : "",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}