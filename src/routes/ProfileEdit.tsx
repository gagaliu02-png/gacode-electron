/**
 * routes/ProfileEdit.tsx — 阶段 3 编辑资料 (补齐)
 *
 * 数据: useQuery(["profile"], getProfile) 拿初值
 *       useMutation((data) => updateProfile(data))
 * 端点: PUT /gacode/profile body { displayName?, gender?, bio? }
 *       server 端 profile.routes.js 至少传 1 个字段. 至少传 1 个校验.
 *
 * 表单: displayName (≤64) / gender (下拉) / bio (≤500) / email (只读, server
 *       没暴露 email 改的端点) + 顶部 avatar 上传入口 (复用 uploadAvatar)
 *
 * 变更摘要 (相对 v0.7.1, 2026-10-19 v0.7.2):
 *   - profile-edit-5  P1: 在 EditProfile 页加 avatar 上传入口, 跟 Profile 页
 *     顶部相机按钮同源 uploadAvatar mutation (避免重复实现 file picker 校验)
 *   - profile-edit-7  P2: 服务端 4xx 时保留输入. 原代码 onError 只 toast,
 *     没有 setState 重置, 表单其实就保留着 — 但 onSuccess 会 nav 走;
 *     这里加强注释 + 显式不做任何 setState, 保证错误时 React state
 *     (displayName / gender / bio) 不被外部代码 clear.
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
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

const GENDER_OPTIONS: Array<{ value: Gender; label: string }> = [
  { value: "unspecified", label: "保密" },
  { value: "male", label: "男" },
  { value: "female", label: "女" },
  { value: "other", label: "其他" },
];

const BIO_MAX = 500;
const DISPLAY_NAME_MAX = 64;

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // init from server
  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || "");
    setGender((profile.gender as Gender) || "unspecified");
    setBio(profile.bio || "");
  }, [profile?.id]);

  // 头像上传 — 复用 lib/api.uploadAvatar, 跟 Profile 页顶部相机按钮同源.
  // 注意: 这里不影响 primary plan, 失败时也只 toast (输入保留不变).
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
    e.target.value = "";
  };

  // profile-edit-7: onError **不**碰 displayName / gender / bio 任何 setState,
  // 这样 4xx 时 React state 保留, 用户改的字符不丢. 同时不在 catch 里 navigate —
  // nav 会卸载本组件, 状态丢失. 这里只 toast.
  const saveMutation = useMutation({
    mutationFn: (input: {
      displayName?: string | null;
      gender?: Gender;
      bio?: string | null;
    }) => updateProfile(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast({ message: "已保存", variant: "success" });
      navigate("/profile");
    },
    onError: (err) => {
      toast({
        message: `保存失败: ${err instanceof Error ? err.message : String(err)}`,
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
        message: `昵称不能超过 ${DISPLAY_NAME_MAX} 字符`,
        variant: "warning",
      });
      return;
    }
    if (trimmedBio.length > BIO_MAX) {
      toast({
        message: `简介不能超过 ${BIO_MAX} 字符`,
        variant: "warning",
      });
      return;
    }

    saveMutation.mutate({
      displayName: trimmedName.length > 0 ? trimmedName : null,
      gender,
      bio: trimmedBio.length > 0 ? trimmedBio : null,
    });
  };

  const initial = (profile?.displayName || profile?.username || "?")
    .trim()
    .charAt(0)
    .toUpperCase();

  if (isLoading) {
    return (
      <div className="min-h-full px-6 py-6">
        <div className="max-w-2xl mx-auto">
          <div className="h-8 w-1/3 bg-bg-sunken rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full px-6 py-6">
      <div className="max-w-2xl mx-auto space-y-5">
        <h1 className="text-xl font-medium">编辑资料</h1>

        {/* profile-edit-5: 头像设置入口 — 放最顶部, 跟 Profile 页相机按钮同源
            上传逻辑. 不重复实现 file picker 校验 (5MB + image MIME). */}
        <div className="flex items-center gap-4 rounded-md bg-bg-elevated p-4">
          <div className="relative shrink-0">
            {profile?.avatar ? (
              <img
                src={profile.avatar}
                alt={profile.displayName || profile.username}
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <div
                aria-hidden="true"
                className="w-16 h-16 rounded-full bg-brand/30 border border-brand/40 flex items-center justify-center text-fg text-xl font-medium"
              >
                {initial}
              </div>
            )}
            <button
              type="button"
              onClick={handlePickAvatar}
              disabled={avatarMutation.isPending}
              className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-brand text-brand-on flex items-center justify-center hover:bg-brand-hover transition-colors duration-150 disabled:opacity-50"
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
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">头像</p>
            <p className="text-xs text-fg-subtle mt-1">
              支持 JPG / PNG / WebP,最大 5 MB
            </p>
          </div>
        </div>

        {/* Nickname */}
        <div>
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

        {/* Email — 只读 */}
        {profile?.email ? (
          <div>
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
        <div>
          <label className="block text-sm font-medium mb-2">性别</label>
          <div className="inline-flex p-1 rounded-md bg-bg-elevated gap-1">
            {GENDER_OPTIONS.map((opt) => {
              const active = gender === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setGender(opt.value)}
                  className={[
                    "px-4 py-1.5 text-sm rounded transition-colors duration-150",
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
        <div>
          <label
            className="block text-sm font-medium mb-2"
            htmlFor="bio"
          >
            简介
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            maxLength={BIO_MAX}
            placeholder="介绍一下自己..."
            className={[
              "flex w-full rounded-md border border-border bg-bg-sunken px-4 py-3 text-base",
              "placeholder:text-fg-subtle",
              "transition-colors duration-150",
              "focus:outline-none focus:border-brand",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "resize-y",
            ].join(" ")}
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
        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={() => navigate("/profile")}
            disabled={saveMutation.isPending}
          >
            取消
          </Button>
          <Button
            variant="default"
            size="lg"
            className="flex-1"
            onClick={onSave}
            loading={saveMutation.isPending}
          >
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}