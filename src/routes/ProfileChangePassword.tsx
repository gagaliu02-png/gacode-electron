/**
 * routes/ProfileChangePassword.tsx — 阶段 3 修改密码 (补齐)
 *
 * 端点 (2026-10-19 v0.7.2 实接):
 *   POST /api/v1/auth/change-password
 *   body: { newPasswordHash } — argon2id encoded (端侧用 hash-wasm 算)
 *   requires JWT (Bearer accessToken)
 *   unified-api auth.routes.js:140-147 + auth.service.js:214-233
 *
 * 变更摘要 (相对 v0.7.1, 2026-10-19 v0.7.2):
 *   - profile-change-password-5  P0: 改对端点 (从老的 `/gacode/auth/change-password`
 *     改成 `/auth/change-password`), 端侧用 hash-wasm 算 argon2id hash 再发.
 *     老代码注释里已经标了"⚠️ unified-api 当前没有这个 endpoint", 现在通了.
 *   - profile-change-password-6  P2: 改完密后调 `POST /auth/logout-all` 让所有
 *     其他设备持有的 refreshToken 立即失效 (server 端 prisma.refreshToken
 *     .updateMany revokedAt=new Date()), 然后再 logout 本机 + 跳 login.
 *     旧 refreshToken 立刻作废, 别人偷到也刷不出新 accessToken.
 *
 * 表单: 旧密码 / 新密码 / 确认新密码
 * 校验: 新密码 ≥ 8 字符 + 两次一致 + 新旧不能相同 (客户端); 旧密码 client-side
 *   仅做"非空"占位校验, server 实际不验 (server 仅校验 JWT + newPasswordHash
 *   合法, additionalProperties:false 不接 oldPassword 字段).
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { changePassword, logoutAll } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

const MIN_PASSWORD_LENGTH = 8;

export function ProfileChangePassword() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { logout } = useAuth();

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // 用一个 mutation 串联: 改密成功 → 撤销全部 refreshToken → 本机登出 → 跳 login.
  // 三步任一失败都把整个流程短路, 提示用户对应阶段错误, 不静默继续.
  const changeMutation = useMutation({
    mutationFn: async (input: { oldPassword: string; newPassword: string }) => {
      // 1) 改密 — 必须先成功, 否则后续 logout-all 会把没改密的会话也清掉
      //    (用户视角: 没改成还登出全设备, 体验差).
      await changePassword(input.oldPassword, input.newPassword);
      // 2) 撤销该 user 名下所有 refreshToken. 旧 refreshToken 立刻失效,
      //    别人持有的旧 token 刷不出新 accessToken.
      try {
        await logoutAll();
      } catch (e) {
        // logout-all 失败不算阻塞 (改密已成功, 至少本设备下一步会 logout),
        // 但要告诉用户, 让 ta 知道"其他设备可能仍然登录".
        throw new Error(
          `改密成功, 但撤销其他设备的会话失败: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
      // 3) 本机 logout — 清内存 token + user + 持久化 refresh-token.json,
      //    跟 auth.tsx 的 logout() 一致 (失败 swallow, 跟 web 对齐).
      await logout();
    },
    onSuccess: () => {
      queryClient.clear();
      toast({
        message: "密码已修改,其他设备已自动登出",
        variant: "success",
      });
      navigate("/login", { replace: true });
    },
    onError: (err) => {
      // 不 navigate — 让用户看到具体错误, 重试或修改输入. 输入已经在
      // profile-edit-7 同样契约下保留 (mutation 失败时不 reset state).
      toast({
        message: `修改失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });

  const onSubmit = () => {
    // 客户端校验 — 跟 web/Android 一致: 新密码长度 + 两次一致 + 新旧不同
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

  const pending = changeMutation.isPending;

  return (
    <div className="min-h-full px-4 lg:px-8 py-6">
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
            disabled={pending}
          />
          <p className="text-xs text-fg-subtle mt-1">
            客户端校验旧密码非空,服务端走 JWT 鉴权不再二次校验
          </p>
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
            disabled={pending}
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
            disabled={pending}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={() => navigate("/profile")}
            disabled={pending}
          >
            取消
          </Button>
          <Button
            variant="default"
            size="lg"
            className="flex-1"
            onClick={onSubmit}
            loading={pending}
          >
            确认修改
          </Button>
        </div>
      </div>
    </div>
  );
}