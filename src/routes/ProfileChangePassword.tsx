/**
 * routes/ProfileChangePassword.tsx — 阶段 3 修改密码
 *
 * 端点: POST /gacode/auth/change-password body { oldPassword, newPassword }
 *
 * ⚠️ 2026-10-17 阶段 3 实测: unified-api 当前没有这个 endpoint (grep
 *   D:\gaga\gaclaw-project\unified-api\src 无 /change-password 路由).
 *   brief 描述了这个路径但 server 端未实现. 这里按 brief 路径调, 失败时
 *   给出明确错误 (toast 显示 server 返回的 message). 待 unified-api
 *   真正实现后即生效, 客户端不需要改.
 *
 * 表单: 旧密码 / 新密码 / 确认新密码
 * 校验: 新密码 ≥ 8 字符 + 两次一致
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { request } from "../lib/api";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

const MIN_PASSWORD_LENGTH = 8;

export function ProfileChangePassword() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const changeMutation = useMutation({
    mutationFn: (input: { oldPassword: string; newPassword: string }) =>
      request<{ ok: true }>("/gacode/auth/change-password", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      toast({ message: "密码已修改", variant: "success" });
      navigate("/profile");
    },
    onError: (err) => {
      toast({
        message: `修改失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });

  const onSubmit = () => {
    if (!oldPassword) {
      toast({ message: "请输入旧密码", variant: "warning" });
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      toast({
        message: `新密码至少 ${MIN_PASSWORD_LENGTH} 个字符`,
        variant: "warning",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ message: "两次输入的新密码不一致", variant: "warning" });
      return;
    }
    if (newPassword === oldPassword) {
      toast({
        message: "新密码不能与旧密码相同",
        variant: "warning",
      });
      return;
    }
    changeMutation.mutate({ oldPassword, newPassword });
  };

  return (
    <div className="min-h-full px-6 py-6">
      <div className="max-w-md mx-auto space-y-5">
        <h1 className="text-xl font-medium">修改密码</h1>

        <div>
          <label
            className="block text-sm font-medium mb-2"
            htmlFor="oldPassword"
          >
            旧密码
          </label>
          <Input
            id="oldPassword"
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            placeholder="请输入当前密码"
            autoComplete="current-password"
          />
        </div>

        <div>
          <label
            className="block text-sm font-medium mb-2"
            htmlFor="newPassword"
          >
            新密码
          </label>
          <Input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={`至少 ${MIN_PASSWORD_LENGTH} 个字符`}
            autoComplete="new-password"
          />
        </div>

        <div>
          <label
            className="block text-sm font-medium mb-2"
            htmlFor="confirmPassword"
          >
            确认新密码
          </label>
          <Input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="再输入一次新密码"
            autoComplete="new-password"
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={() => navigate("/profile")}
            disabled={changeMutation.isPending}
          >
            取消
          </Button>
          <Button
            variant="default"
            size="lg"
            className="flex-1"
            onClick={onSubmit}
            loading={changeMutation.isPending}
          >
            确认修改
          </Button>
        </div>
      </div>
    </div>
  );
}
