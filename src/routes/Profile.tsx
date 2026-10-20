/**
 * routes/Profile.tsx — 阶段 3 我的 (补齐)
 *
 * 数据: useQuery(["profile"], getProfile)
 * 端点: GET /gacode/profile — server 端 profile.routes.js, 返 ProfileData
 *   (id / username / displayName / gender / bio / avatar / email / createdAt).
 *
 * 功能 (2026-10-19 v0.7.2 补齐):
 *   - 顶部: 头像 (大圆) + displayName + username + email
 *   - 元信息: 性别 / 简介 / UID (含一键复制) / 注册时间
 *   - 操作入口: 编辑资料 / 改密 / 我的应用 / 设置 (v2) / 交付中心 / 头像设置
 *   - 底部: 登出 + 注销账户 (DELETE /auth/account, 物理删数据 + 二次确认 + username 输入防误触)
 *   - 上传头像: file picker → uploadAvatar → invalidate profile (顶部相机按钮 + 「头像设置」入口都触发同一逻辑)
 *
 * 变更摘要 (相对 v0.7.1):
 *   - profile-3  P1: UID 一键复制 + Toast 反馈
 *   - profile-5  P0: 新加「设置」「交付中心」「头像设置」三个入口
 *   - profile-6  P0: 注销账户走 DELETE /auth/account, 弹 ConfirmDialog + 输 username 二次确认
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteAccount,
  getProfile,
  uploadAvatar,
  type ProfileData,
} from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { Input } from "../components/ui/Input";

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
    <div className="min-h-full px-4 lg:px-8 py-6">
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
          <UidRow uid={uid} />
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
          <ActionRow
            icon={<EditIcon />}
            label="编辑资料"
            onClick={() => navigate("/profile/edit")}
          />
          <ActionRow
            icon={<LockIcon />}
            label="修改密码"
            onClick={() => navigate("/profile/change-password")}
          />
          <ActionRow
            icon={<AppsIcon />}
            label="我的应用"
            onClick={() => navigate("/profile/apps")}
          />
          {/* profile-5: 新增三个入口. 头像设置复用顶部 file picker 逻辑,
              走 handlePickAvatar (跟相机按钮同一份代码路径). */}
          <ActionRow
            icon={<CameraIcon />}
            label="头像设置"
            onClick={handlePickAvatar}
          />
          <ActionRow
            icon={<DeliveriesIcon />}
            label="交付中心"
            onClick={() => navigate("/deliveries")}
          />
          <ActionRow
            icon={<SettingsIcon />}
            label="设置"
            // /settings 路由尚未实现 (gacode-web/android 都有独立设置页, electron
            // 暂未建), 弹 toast 提示. 后续 v2 设置中心上线后再 enable.
            onClick={() =>
              toast({
                message: "设置中心将在后续版本上线",
                variant: "default",
              })
            }
          />
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

        {/* profile-6: 注销账户 (P0 — GDPR) — 用 DeleteAccountRow 组件,
            跟操作入口视觉上区分开 (红字危险色), 放最底部 */}
        <DeleteAccountRow
          username={username}
          onDeleted={() => {
            // 跟 localDB 那种"清状态后跳 login"对齐: queryClient 清空 + 调
            // authStorage.clear (IPC) + auth.logout 清内存态, Protected 路由
            // 后续 user=null 会自动跳 /login.
            queryClient.clear();
            void logout();
            navigate("/login", { replace: true });
          }}
        />
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
// profile-3: UID 一键复制 (P1)
// ────────────────────────────────────────────────────────────

function UidRow({ uid }: { uid: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // 1.5 秒后自动恢复 copy 图标 (跟 gacode-web 行为一致)
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  const handleCopy = async () => {
    if (!uid || uid === "-") {
      toast({ message: "UID 暂不可用", variant: "warning" });
      return;
    }
    try {
      await navigator.clipboard.writeText(uid);
      setCopied(true);
      toast({ message: "UID 已复制", variant: "success" });
    } catch {
      // 极少数环境 clipboard API 不可用 (非 HTTPS / 浏览器策略限制) — 兜底:
      // 选中文本让用户手动复制. 不向用户暴露技术错误.
      toast({
        message: "复制失败,请手动选中复制",
        variant: "warning",
      });
    }
  };

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <span className="w-20 text-sm text-fg-muted shrink-0">UID</span>
      <span className="flex-1 text-sm text-fg font-mono min-w-0 break-all">
        {uid}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="复制 UID"
        className="shrink-0 w-8 h-8 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center"
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// profile-6: 注销账户 (P0) — DELETE /auth/account + 二次确认 + 输 username
// ────────────────────────────────────────────────────────────

function DeleteAccountRow({
  username,
  onDeleted,
}: {
  username: string;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");

  const deleteMutation = useMutation({
    mutationFn: () => deleteAccount(),
    onSuccess: () => {
      toast({
        message: "账户已注销,你的所有数据已永久删除",
        variant: "success",
      });
      setOpen(false);
      onDeleted();
    },
    onError: (err) => {
      toast({
        message: `注销失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });

  // 必须输入准确的 username 才允许点「我确定注销」(防误触)
  const canConfirm =
    confirmText.trim().length > 0 && confirmText.trim() === username.trim();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-md border border-danger/30 bg-danger/5 p-4 flex items-center gap-3 text-left hover:bg-danger/10 transition-colors duration-150 text-danger"
        aria-label="注销账户"
      >
        <TrashIcon />
        <span className="flex-1 text-sm font-medium">注销账户</span>
        <ChevronRightIcon />
      </button>

      {open ? (
        <ConfirmDialog
          title="确定要注销账户吗?"
          message="注销后,你的所有数据(账户、会话、知识库、设置)将被永久删除,且无法恢复。此操作不可撤销。"
          confirmLabel={
            deleteMutation.isPending ? "正在注销..." : "我确定,注销"
          }
          cancelLabel="取消"
          confirmVariant="danger"
          loading={deleteMutation.isPending}
          onCancel={() => {
            if (deleteMutation.isPending) return;
            setOpen(false);
            setConfirmText("");
          }}
          onConfirm={() => {
            if (!canConfirm) return;
            deleteMutation.mutate();
          }}
        >
          <div className="space-y-2">
            <label
              className="block text-sm text-fg-muted"
              htmlFor="delete-confirm-username"
            >
              请输入你的用户名{" "}
              <span className="font-mono text-fg">{username}</span>{" "}
              以确认操作
            </label>
            <Input
              id="delete-confirm-username"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={username}
              autoComplete="off"
              disabled={deleteMutation.isPending}
              autoFocus
            />
            {!canConfirm && confirmText.length > 0 ? (
              <p className="text-xs text-warning">
                用户名不匹配,请准确输入
              </p>
            ) : null}
          </div>
        </ConfirmDialog>
      ) : null}
    </>
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

function ActionRow({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md bg-bg-elevated p-4 flex items-center gap-3 text-left hover:bg-bg-sunken transition-colors duration-150"
    >
      <span className="shrink-0 w-5 h-5 flex items-center justify-center">
        {icon}
      </span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <ChevronRightIcon />
    </button>
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

function DeliveriesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
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

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}