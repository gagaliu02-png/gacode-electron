/**
 * routes/ProfileEdit.tsx — 阶段 3 编辑资料 (补齐)
 *
 * 数据: useQuery(["profile"], getProfile) 拿初值
 *       useMutation((data) => updateProfile(data))
 * 端点: PUT /gacode/profile body { displayName?, gender?, bio? }
 *       server 端 profile.routes.js 至少传 1 个字段. 至少传 1 个校验.
 *
 * 表单: displayName (≤30) / gender (下拉) / bio (≤200) / email (只读, server
 *       没暴露 email 改的端点) + 顶部 avatar 上传入口 (复用 uploadAvatar)
 *
 * 2026-10-26 对齐 web (docs/align-c-profile-notify.md 组 2b · C2-27 ~ C2-47):
 *   - C2-27: 删掉页面内 <h1> (标题只由 AppShell header 渲染)
 *   - C2-28/29/30: 头像区改成 web 的**独立居中 96px** + hash 调色板 fallback
 *               (src/components/ui/Avatar.tsx) + 相机按钮 w-8 h-8 + shadow-elevation-2
 *   - C2-31/33: DISPLAY_NAME_MAX 64→30, BIO_MAX 500→200
 *               ⚠️ 这两个上限同时消掉了**现网 400 bug**: PC 旧值超过服务端
 *               schema 上限 (displayName 50 / bio 200) ⇒ 51~64 字昵称 /
 *               201~500 字简介保存时被服务端拒收 (400)。
 *   - C2-32: 空值语义 null → undefined (留空 = 不更新, 不是清空)
 *   - C2-34/35/36: 性别选项收敛成 3 个 (男/女/保密, 跟 web 同序) + 容器补边框
 *   - C2-37: 简介改用 <Textarea> 组件 (bg-bg-elevated + shadow-sm + min-h-[88px])
 *   - C2-38/39: 保存/取消按钮回到 web 的 default 尺寸 (36px) + 保存带图标 +
 *               取消走 navigate(-1) (无历史时兜底回 /profile)
 *   - C2-41/42/43: 头像本地预览 (选完立刻回显) + 上限 5MB→2MB + 类型校验 toast
 *   - C2-44: 头像在**保存时**上传一次 (跟 web 同款: web 的 avatarMutation
 *               定义了但从不调用, 真正上传发生在 saveMutation 里)
 *   - C2-45: 保存/失败 toast 文案跟 web 一致 (title + description)
 *   - C2-46: 单层容器 + 逐块 margin
 *
 * ⚠️ PC 独有 (按 gaga 指示不列入差异, 保留): 只读邮箱字段 + 简介字数计数器。
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getProfile,
  updateProfile,
  uploadAvatar,
  type Gender,
  type ProfileData,
} from "../lib/api";
import { useToast } from "../components/ui/Toast";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Textarea } from "../components/ui/Textarea";

// C2-34: web 端只有 3 个选项 (且不含 "other")。服务端仍允许 4 个值,
// 已有账号 gender === "other" 的用户打开时三个按钮都不高亮 (跟 web 一致),
// 保存时原样提交 → 不会丢数据。
const GENDER_OPTIONS: Array<{ value: Gender; label: string }> = [
  { value: "male", label: "男" },
  { value: "female", label: "女" },
  { value: "unspecified", label: "保密" },
];

const BIO_MAX = 200;
const DISPLAY_NAME_MAX = 30;

export function ProfileEdit() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
  });

  const [displayName, setDisplayName] = useState("");
  const [gender, setGender] = useState<Gender>("unspecified");
  const [bio, setBio] = useState("");
  /** 本地头像预览 (dataURL) — 选完文件立刻回显, 不等上传 (C2-41) */
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  /** 待上传的头像文件 — 保存时随 profile 一起提交 (C2-44) */
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // init from server
  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || "");
    setGender((profile.gender as Gender) || "unspecified");
    setBio(profile.bio || "");
    setAvatarPreview(profile.avatar || null);
  }, [profile?.id]);

  const handlePickAvatar = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "请选择图片文件", variant: "warning" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "图片不能超过 2 MB", variant: "warning" });
      return;
    }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = () => setAvatarPreview(String(reader.result || ""));
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // profile-edit-7: onError **不**碰 displayName / gender / bio 任何 setState,
  // 这样 4xx 时 React state 保留, 用户改的字符不丢. 同时不在 catch 里 navigate —
  // nav 会卸载本组件, 状态丢失. 这里只 toast.
  const saveMutation = useMutation({
    mutationFn: async (input: {
      displayName?: string;
      gender: Gender;
      bio?: string;
    }) => {
      // 头像在保存时上传一次 (web 同款 —— 选文件时只做本地预览)
      let uploadedUrl: string | undefined;
      if (avatarFile) {
        const data = await uploadAvatar(avatarFile);
        uploadedUrl = "url" in data ? data.url : data.avatar;
      }
      await updateProfile(input);
      return { uploadedUrl };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast({ title: "资料已保存", variant: "success" });
      navigate("/profile");
    },
    onError: (err) => {
      toast({
        title: "保存失败",
        description: String((err as Error)?.message || err),
        variant: "danger",
      });
      // 显式不 reset 任何字段: displayName / gender / bio 保留用户输入.
    },
  });

  const onSave = () => {
    const trimmedName = displayName.trim();
    const trimmedBio = bio.trim();

    // 校验
    if (trimmedName.length > DISPLAY_NAME_MAX) {
      toast({
        title: `昵称不能超过 ${DISPLAY_NAME_MAX} 字符`,
        variant: "warning",
      });
      return;
    }
    if (trimmedBio.length > BIO_MAX) {
      toast({
        title: `简介不能超过 ${BIO_MAX} 字`,
        variant: "warning",
      });
      return;
    }

    // C2-32: 空值传 undefined (不更新) —— 不是 null (清空)
    saveMutation.mutate({
      displayName: trimmedName.length > 0 ? trimmedName : undefined,
      gender,
      bio: trimmedBio.length > 0 ? trimmedBio : undefined,
    });
  };

  // C2-39: 取消 = 浏览器历史后退 (跟 web 的 router.back() 同语义);
  // 没有历史时兜底回 /profile (跟 AppShell 的 handleBack 同一套判断)。
  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/profile");
  };

  const initials = (displayName || profile?.username || "U")
    .charAt(0)
    .toUpperCase();
  const saving = saveMutation.isPending;

  if (isLoading) {
    return (
      <div className="min-h-full px-4 lg:px-8 py-6 max-w-2xl mx-auto">
        <div className="h-8 w-1/3 bg-bg-sunken rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="min-h-full px-4 lg:px-8 py-6 max-w-2xl mx-auto">
      {/* Avatar — 独立居中 96px + 提示语 (C2-28/29/30) */}
      <div className="flex flex-col items-center mb-8">
        <div className="relative">
          <Avatar seed={profile?.username || profile?.email} src={avatarPreview}>
            {initials}
          </Avatar>
          <button
            type="button"
            onClick={handlePickAvatar}
            className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-brand text-brand-on flex items-center justify-center shadow-elevation-2 hover:bg-brand-hover transition-colors"
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
        <p className="text-xs text-fg-muted mt-2">点击相机图标更换头像</p>
      </div>

      {/* Nickname */}
      <div className="mb-5">
        <label
          className="block text-sm font-medium mb-2"
          htmlFor="displayName"
        >
          昵称
        </label>
        <Input
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="你的昵称"
          maxLength={DISPLAY_NAME_MAX}
        />
        <p className="text-xs text-fg-subtle mt-1">
          留空将使用用户名 ({profile?.username || "-"})
        </p>
      </div>

      {/* Email — 只读 (PC 独有) */}
      {profile?.email ? (
        <div className="mb-5">
          <label
            className="block text-sm font-medium mb-2"
            htmlFor="email"
          >
            邮箱
          </label>
          <Input
            id="email"
            value={profile.email}
            readOnly
            disabled
          />
          <p className="text-xs text-fg-subtle mt-1">
            邮箱暂不支持修改
          </p>
        </div>
      ) : null}

      {/* Gender — segmented */}
      <div className="mb-5">
        <label className="block text-sm font-medium mb-2">性别</label>
        <div className="inline-flex p-1 rounded-md bg-bg-elevated border border-border">
          {GENDER_OPTIONS.map((opt) => {
            const active = gender === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setGender(opt.value)}
                className={[
                  "px-4 py-1.5 text-sm rounded transition-colors",
                  active
                    ? "bg-brand text-brand-on shadow-sm"
                    : "text-fg-muted hover:text-fg",
                ].join(" ")}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bio — textarea */}
      <div className="mb-6">
        <label
          className="block text-sm font-medium mb-2"
          htmlFor="bio"
        >
          简介
        </label>
        <Textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          maxLength={BIO_MAX}
          placeholder="介绍一下自己..."
        />
        <div className="flex justify-end mt-1">
          <span
            className={[
              "text-xs",
              bio.length > BIO_MAX - 20 ? "text-warning" : "text-fg-subtle",
            ].join(" ")}
          >
            {bio.length} / {BIO_MAX}
          </span>
        </div>
      </div>

      {/* 操作 */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1"
          onClick={handleBack}
          disabled={saving}
        >
          取消
        </Button>
        <Button
          variant="default"
          className="flex-1 gap-2"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? (
            <SpinnerIcon className="w-4 h-4 animate-spin" />
          ) : (
            <SaveIcon className="w-4 h-4" />
          )}
          保存
        </Button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// icons (手写内联 SVG — PC 无 lucide-react)
// ────────────────────────────────────────────────────────────

function CameraIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={["w-4", "h-4", className].filter(Boolean).join(" ")}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

function SaveIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={["w-4", "h-4", className].filter(Boolean).join(" ")}>
      <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
      <path d="M7 3v4a1 1 0 0 0 1 1h7" />
    </svg>
  );
}

function SpinnerIcon({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={["w-4", "h-4", className].filter(Boolean).join(" ")}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
