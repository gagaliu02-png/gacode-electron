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
 *   - 操作入口: 编辑资料 / 改密 / 设置 (v2) / 交付中心 / 头像设置
 *     (「我的应用」已按 S-1 删除 —— 唯一入口是侧栏 AppShell 那个带门禁的)
 *   - 底部: 登出 + 注销账户 (DELETE /auth/account, 物理删数据 + 二次确认)
 *   - 上传头像: file picker → uploadAvatar → invalidate profile (顶部相机按钮 + 「头像设置」入口都触发同一逻辑)
 *
 * 2026-10-26 对齐 web (docs/align-c-profile-notify.md 组 2a · C2-01 ~ C2-26):
 *   - C2-01/02: 单层容器 + 逐块 margin (顶部区 mb-4 / 头像区 mb-8 / 卡片 space-y-2
 *               / 注销区 mt-6 / 页脚 mt-8), 不再用统一 space-y-6
 *   - C2-03: 页内补「通知中心」铃铛入口 (跟 web 一样左铃铛 / 右编辑)
 *   - C2-06/07/08: 头像 72px + rounded-xl (骨架同步)
 *   - C2-10: 邮箱行改 text-fg-muted + opacity-70
 *   - C2-11/12/13/14/15: 信息区改成 web 的**多张独立卡** (space-y-2) + ProfileRow
 *               (label 主色 / value text-fg-muted truncate max-w-[200px]) + 补「名字」行
 *   - C2-16: 复制 UID 按钮 w-8 h-8 → w-7 h-7
 *   - C2-18: 复制 toast 文案/variant 跟 web 一致
 *   - C2-19/21/23: 注销按钮视觉 + 弹窗文案 + 成功/失败 toast 跟 web 一致
 *   - C2-24: 补页脚版本号
 *   - C2-25: 「编辑」按钮补 aria-label
 *   - C2-26: 未读轮询走 NOTIFICATION_POLL_MS (45s)
 *
 *   - C2-07: 头像缺省图改用 Cody 占位图 (cody_192.png, 跟 web 同款)
 * ⚠️ PC 独有 (按 gaga 指示不列入差异, 保留): 相机按钮 + @username + 操作入口列表
 *   (编辑资料/修改密码/头像设置/交付中心/设置) + 登出按钮 + 邮箱/注册时间
 *   两行。
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteAccount,
  getProfile,
  listNotifications,
  uploadAvatar,
  type ProfileData,
} from "../lib/api";
import {
  formatUnreadBadge,
  NOTIFICATION_POLL_MS,
} from "../lib/notifications";
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

  // C2-03: 页内铃铛的未读数 — 跟侧栏 AppShell 的铃铛共用同一条 queryKey,
  // React Query 直接复用同一次请求 (web 端也是这个形状)。
  const { data: notifData } = useQuery({
    queryKey: ["notifications", { unread: true }],
    queryFn: () => listNotifications(true),
    retry: false,
    staleTime: 30 * 1000,
    refetchInterval: NOTIFICATION_POLL_MS,
    refetchIntervalInBackground: false,
  });
  const unreadCount = notifData?.unreadCount ?? 0;

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
      toast({ message: "请选择图片文件", variant: "warning" });
      return;
    }
    // 2MB 上限跟 web 一致 (gacode-web/src/app/(main)/profile/edit/page.tsx:72-75),
    // 本仓 ProfileEdit.tsx:99-102 也已是同款口径 —— 只有本文件是旧值。
    if (file.size > 2 * 1024 * 1024) {
      toast({ message: "图片不能超过 2 MB", variant: "warning" });
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
  // C2-07: 头像缺省图 —— 跟 web `gacode-web/src/app/(main)/profile/page.tsx:156`
  // 同款 (user.avatar 为空时用 Cody 占位图 cody_192.png)。
  // ⚠️ PC 打包后 renderer 走 file:// ⇒ 不能用根绝对路径 "/assets/..." (会解析到
  //    文件系统根 → 裂图), 必须用 import.meta.env.BASE_URL 拼相对路径
  //    (打包态 "./", dev "/") —— 同仓 AppShell.tsx 的 cody_48.png 已是这个写法。
  const avatarSrc =
    user?.avatar || `${import.meta.env.BASE_URL}assets/cody/cody_192.png`;
  const uid = user?.id || "—";

  return (
    <div className="min-h-full px-4 lg:px-8 py-6 max-w-2xl mx-auto">
      {/* 顶部操作区 — 铃铛入口 (web 同款) + 「编辑」按钮右对齐 */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => navigate("/notifications")}
          aria-label="通知中心"
          className="relative w-9 h-9 rounded-full text-fg-muted hover:bg-bg-sunken transition-colors duration-150 inline-flex items-center justify-center"
        >
          <BellIcon />
          {unreadCount > 0 ? (
            <span className="absolute top-1.5 right-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold bg-brand text-brand-on">
              {formatUnreadBadge(unreadCount)}
            </span>
          ) : null}
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/profile/edit")}
          aria-label="编辑资料"
        >
          编辑
        </Button>
      </div>

      {/* 头像 + displayName */}
      <div className="flex flex-col items-center mb-8">
        <div className="relative">
          {isLoading ? (
            <div className="w-[72px] h-[72px] rounded-xl bg-bg-elevated animate-pulse" />
          ) : (
            // C2-07: 头像缺省图 = Cody 占位图 (web 同款) —— 不再回退到首字母圆底。
            <img
              src={avatarSrc}
              alt={displayName}
              width={72}
              height={72}
              className="w-[72px] h-[72px] rounded-xl object-cover"
            />
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
          <p className="text-xs text-fg-muted mt-1 opacity-70">{email}</p>
        ) : null}
      </div>

      {/* 信息卡片 — web 是 4 个独立卡 (space-y-2), PC 保留自己的邮箱/注册时间两行 */}
      <div className="space-y-2">
        <ProfileRow label="名字" value={displayName} />
        <ProfileRow
          label="UID"
          value={uid}
          rightSlot={<CopyUidButton uid={user?.id || ""} />}
        />
        <ProfileRow label="邮箱" value={email} />
        <ProfileRow label="性别" value={genderText} />
        <ProfileRow label="简介" value={bioText} />
        <ProfileRow
          label="注册时间"
          value={user?.createdAt ? formatDate(user.createdAt) : "-"}
        />
      </div>

      {/* 操作入口 (PC 独有) */}
      <div className="space-y-2 mt-6">
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
        {/* S-1 — 「我的应用」入口**只有一处**: 侧栏 AppShell.tsx 里那个带
            `user.id === "6"` 门禁的版本。Profile 页原来还有一份**无门禁**的
            (任何登录用户都看得到) ⇒ 双入口。已删除, 只保留侧栏门禁版。 */}
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

      {/* 登出 (PC 独有) */}
      <div className="mt-6">
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

      {/* 注销账户 (P0 — GDPR) — 跟操作入口视觉上区分开 (红字危险色), 放最底部 */}
      <div className="mt-6">
        <DeleteAccountRow
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

      {/* 页脚版本号 (C2-24) */}
      <div className="mt-8 text-center text-xs text-fg-muted opacity-50">
        gacode-electron · v0.7.8
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
// ProfileRow — web 的信息行 (label 主色 / value 次色 + 单行省略)
// ────────────────────────────────────────────────────────────

interface ProfileRowProps {
  label: string;
  value: string;
  onClick?: () => void;
  rightSlot?: React.ReactNode;
}

function ProfileRow({ label, value, onClick, rightSlot }: ProfileRowProps) {
  const interactive = typeof onClick === "function";
  const Wrapper: React.ElementType = interactive ? "button" : "div";
  return (
    <Wrapper
      type={interactive ? "button" : undefined}
      onClick={onClick}
      className={[
        "w-full rounded-md bg-bg-elevated p-4 flex justify-between items-center",
        "transition-colors duration-150",
        interactive ? "hover:bg-bg-base text-left" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="text-sm font-medium shrink-0">{label}</span>
      <span className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-fg-muted truncate max-w-[200px]">{value}</span>
        {rightSlot ?? (interactive ? <ChevronRightIcon /> : null)}
      </span>
    </Wrapper>
  );
}

// ────────────────────────────────────────────────────────────
// profile-3: UID 一键复制 (P1)
// ────────────────────────────────────────────────────────────

function CopyUidButton({ uid }: { uid: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // 1.5 秒后自动恢复 copy 图标 (跟 gacode-web 行为一致)
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  const handleCopy = async () => {
    if (!uid) {
      toast({ title: "UID 不可用", variant: "warning" });
      return;
    }
    try {
      await navigator.clipboard.writeText(uid);
      setCopied(true);
      toast({ title: "UID 已复制", variant: "default" });
    } catch {
      // 极少数环境 clipboard API 不可用 (非 HTTPS / 浏览器策略限制) ——
      // 跟 web 一致: 提示一句, 不向用户暴露技术错误.
      toast({ title: "复制失败", variant: "danger" });
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="复制 UID"
      className="shrink-0 w-7 h-7 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

// ────────────────────────────────────────────────────────────
// profile-6: 注销账户 (P0) — DELETE /auth/account + 二次确认
//   (跟 web 同款: 弹窗直接二次确认, 不要求输入 username ——
//    gacode-web/src/app/(main)/profile/page.tsx:258-288)
// ────────────────────────────────────────────────────────────

function DeleteAccountRow({
  onDeleted,
}: {
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => deleteAccount(),
    onSuccess: () => {
      toast({
        title: "账户已注销",
        description: "你的所有数据已永久删除",
        variant: "default",
      });
      setOpen(false);
      onDeleted();
    },
    onError: (err) => {
      toast({
        title: "注销失败",
        description:
          (err as Error)?.message || "请稍后重试",
        variant: "danger",
      });
    },
  });

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-md bg-bg-elevated p-4 flex items-center gap-3 hover:bg-danger-soft/30 transition-colors duration-150 text-danger"
        aria-label="注销账户"
      >
        <TrashIcon />
        <span className="flex-1 text-left text-base font-medium">注销账户</span>
      </button>

      {open ? (
        <ConfirmDialog
          title="确定要注销账户吗?"
          message="注销后,你的所有数据(账户、会话、知识库、设置)将被永久删除, 且无法恢复。此操作不可撤销, 请确认要继续。"
          confirmLabel={
            deleteMutation.isPending ? "正在注销..." : "我确定, 注销"
          }
          cancelLabel="取消"
          confirmVariant="danger"
          loading={deleteMutation.isPending}
          onCancel={() => {
            if (deleteMutation.isPending) return;
            setOpen(false);
          }}
          onConfirm={() => {
            deleteMutation.mutate();
          }}
        />
      ) : null}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// helpers
// ────────────────────────────────────────────────────────────

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

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

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
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 2 2 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 1.82-.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={["shrink-0", className].filter(Boolean).join(" ")}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
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
