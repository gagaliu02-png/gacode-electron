/**
 * routes/Profile.tsx — 阶段 3 我的
 *
 * 数据: useQuery(["profile"], getProfile)
 * 端点: GET /gacode/profile — server 端 profile.routes.js, 返 ProfileData
 *   (id / username / displayName / gender / bio / avatar / email / createdAt).
 *
 * 功能:
 *   - 顶部: 头像 (大圆) + displayName + username + email
 *   - 元信息: 性别 / 简介 / UID / 注册时间
 *   - 操作: 编辑资料 / 改密 / 我的应用 / 登出
 *   - 上传头像: file picker → uploadAvatar → invalidate profile
 *
 * 跟阶段 1 占位对比:
 *   - 阶段 1: 只读 useAuth().user (登录态), 没有 displayName/bio/avatar 编辑
 *   - 阶段 3: 接 getProfile 真数据 + 编辑入口 + 头像上传
 */

import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getProfile,
  uploadAvatar,
  type ProfileData,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";

const GENDER_LABEL: Record<string, string> = {
  male: "男",
  female: "女",
  unspecified: "保密",
  other: "其他",
};

export function Profile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: authUser, logout } = useAuth();
  const { toast } = useToast();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
  });

  // profile 可能比 useAuth().user 更全 (displayName / avatar / bio / gender),
  // 优先 profile. 没拿到 profile 时回退 authUser (登录瞬态).
  const user: ProfileData | null = profile || (authUser as ProfileData | null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const logoutMutation = useMutation({
    mutationFn: () => logout(),
    onSuccess: () => {
      queryClient.clear();
      toast({ message: "已登出", variant: "success" });
      navigate("/login", { replace: true });
    },
    onError: () => {
      toast({ message: "登出失败,请重试", variant: "danger" });
    },
  });

  const avatarMutation = useMutation({
    mutationFn: (file: File) => uploadAvatar(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast({ message: "头像已更新", variant: "success" });
    },
    onError: (err) => {
      toast({
        message: `头像上传失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });

  const handlePickAvatar = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ message: "请选择图片文件", variant: "danger" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ message: "头像不能超过 5 MB", variant: "warning" });
      return;
    }
    avatarMutation.mutate(file);
    // reset input 让下次选同一文件也能触发 change
    e.target.value = "";
  };

  const displayName = user?.displayName || user?.username || "User";
  const username = user?.username || "-";
  const email = user?.email || "(未设置)";
  const genderText = user?.gender ? GENDER_LABEL[user.gender] || "保密" : "保密";
  const bioText = user?.bio?.trim() ? user.bio : "未设置";
  const avatarSrc = user?.avatar || "";
  const uid = user?.id || "-";

  return (
    <div className="min-h-full px-6 py-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* 顶部操作区 */}
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/profile/edit")}
          >
            编辑
          </Button>
        </div>

        {/* 头像 + displayName */}
        <div className="flex flex-col items-center">
          <div className="relative">
            {isLoading ? (
              <div className="w-24 h-24 rounded-full bg-bg-elevated animate-pulse" />
            ) : avatarSrc ? (
              <img
                src={avatarSrc}
                alt={displayName}
                className="w-24 h-24 rounded-full object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="w-24 h-24 rounded-full bg-brand/30 border border-brand/40 flex items-center justify-center text-fg text-2xl font-medium"
              >
                {displayName.trim().charAt(0).toUpperCase() || "?"}
              </div>
            )}
            <button
              type="button"
              onClick={handlePickAvatar}
              disabled={avatarMutation.isPending}
              className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-brand text-brand-on flex items-center justify-center hover:bg-brand-hover transition-colors duration-150 disabled:opacity-50"
              aria-label="更换头像"
            >
              <CameraIcon />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
          <h1 className="text-2xl font-medium mt-3 text-center">{displayName}</h1>
          <p className="text-sm text-fg-muted mt-1">@{username}</p>
          {email !== "(未设置)" ? (
            <p className="text-xs text-fg-subtle mt-1">{email}</p>
          ) : null}
        </div>

        {/* 信息卡片 */}
        <div className="rounded-md bg-bg-elevated divide-y divide-border">
          <InfoRow label="UID" value={uid} mono />
          <InfoRow label="邮箱" value={email} />
          <InfoRow label="性别" value={genderText} />
          <InfoRow label="简介" value={bioText} />
          <InfoRow
            label="注册时间"
            value={user?.createdAt ? formatDate(user.createdAt) : "-"}
          />
        </div>

        {/* 操作入口 */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => navigate("/profile/edit")}
            className="w-full rounded-md bg-bg-elevated p-4 flex items-center gap-3 text-left hover:bg-bg-sunken transition-colors duration-150"
          >
            <EditIcon />
            <span className="flex-1 text-sm font-medium">编辑资料</span>
            <ChevronRightIcon />
          </button>
          <button
            type="button"
            onClick={() => navigate("/profile/change-password")}
            className="w-full rounded-md bg-bg-elevated p-4 flex items-center gap-3 text-left hover:bg-bg-sunken transition-colors duration-150"
          >
            <LockIcon />
            <span className="flex-1 text-sm font-medium">修改密码</span>
            <ChevronRightIcon />
          </button>
          <button
            type="button"
            onClick={() => navigate("/profile/apps")}
            className="w-full rounded-md bg-bg-elevated p-4 flex items-center gap-3 text-left hover:bg-bg-sunken transition-colors duration-150"
          >
            <AppsIcon />
            <span className="flex-1 text-sm font-medium">我的应用</span>
            <ChevronRightIcon />
          </button>
        </div>

        {/* 登出 */}
        <div>
          <Button
            variant="danger"
            size="lg"
            loading={logoutMutation.isPending}
            onClick={() => setConfirmOpen(true)}
            className="w-full"
          >
            登出
          </Button>
        </div>
      </div>

      {confirmOpen ? (
        <ConfirmDialog
          title="确认登出?"
          message="登出后需要重新登录才能继续使用。"
          confirmLabel="确认登出"
          confirmVariant="danger"
          loading={logoutMutation.isPending}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => logoutMutation.mutate()}
        />
      ) : null}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

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
      <span className="w-20 text-sm text-fg-muted shrink-0">{label}</span>
      <span
        className={[
          "flex-1 text-sm text-fg min-w-0 break-all",
          mono ? "font-mono" : "",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

// ────────────────────────────────────────────────────────────
// icons
// ────────────────────────────────────────────────────────────

function CameraIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function AppsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-fg-muted">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
