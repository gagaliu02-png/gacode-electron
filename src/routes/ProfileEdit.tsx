/**
 * routes/ProfileEdit.tsx — 阶段 3 编辑资料
 *
 * 数据: useQuery(["profile"], getProfile) 拿初值
 *       useMutation((data) => updateProfile(data))
 * 端点: PUT /gacode/profile body { displayName?, gender?, bio? }
 *       server 端 profile.routes.js 至少传 1 个字段. 至少传 1 个校验.
 *
 * 表单: displayName (≤64) / gender (下拉) / bio (≤500) / email (只读, server
 *       没暴露 email 改的端点)
 *
 * 注意: avatar 不在本页 — Profile.tsx 顶头像右下角的相机按钮单独处理,
 *       跟 web (gacode-web/profile/edit/page.tsx) 一致. 这里只改文字 + 性别.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getProfile,
  updateProfile,
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

  // init from server
  useEffect(() => {
    if (!profile) return;
    setDisplayName(profile.displayName || "");
    setGender((profile.gender as Gender) || "unspecified");
    setBio(profile.bio || "");
  }, [profile?.id]);

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
