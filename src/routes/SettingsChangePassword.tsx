/**
 * routes/SettingsChangePassword.tsx — 修改密码 (批 G12 · 2026-11-04)
 *
 * 路由从 /profile/change-password **挪到** /settings/change-password
 * —— 对齐 web (gacode-web/src/app/(main)/settings/change-password/page.tsx,
 * 2026-10-27 新增)。入口在「设置」页的隐私组 (跟 web 同款)。
 *
 * 端点 (unified-api/src/modules/auth/auth.routes.js:195-214):
 *   POST /api/v1/auth/change-password
 *   body: { oldPassword, newPassword } — **明文** (跟 web / 安卓同款)
 *   requires JWT
 *
 * 校验 (照安卓 ChangePasswordViewModel + web change-password/page.tsx):
 *   - 旧密码非空
 *   - 新密码长度 ≥ 8
 *   - 两次新密码一致
 *   - 新密码 ≠ 旧密码
 *   ⇒ 不满足时提交按钮 disabled (web 的 canSubmit 门控)
 *
 * ⚠️ **PC 跟 web 的一处刻意差异** (保留 PC v0.7.2 起就有的安全设计):
 *   web 改完密 = toast「密码已修改」+ 回 /settings, 本机继续登录。
 *   PC 改完密 = **再调 POST /auth/logout-all 撤销该用户全部 refreshToken**
 *     (别的设备偷到旧 token 也刷不出新 accessToken) → 然后本机 logout + 跳 /login。
 *   ⇒ 用户改完密要重新登录一次, 但所有设备都被踢下线。这是有意为之, 不是 bug。
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

export function SettingsChangePassword() {
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
      // 不 navigate — 让用户看到具体错误, 重试或修改输入. 输入保留
      // (mutation 失败时不 reset state).
      toast({
        message: `修改失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
    },
  });

  // web 的 canSubmit 门控 (web: change-password/page.tsx:50-54) ——
  // 四条校验全过才让提交 (PC 老版是点了才 toast 提示, 跟 web 不一致)。
  const oldOk = oldPassword.length > 0;
  const lenOk = newPassword.length >= MIN_PASSWORD_LENGTH;
  const matchOk = newPassword.length > 0 && newPassword === confirmPassword;
  const diffOk = newPassword.length > 0 && newPassword !== oldPassword;
  const pending = changeMutation.isPending;
  const canSubmit = oldOk && lenOk && matchOk && diffOk && !pending;

  const onSubmit = () => {
    if (!canSubmit) return;
    changeMutation.mutate({ oldPassword, newPassword });
  };

  return (
    <div className="min-h-full px-4 lg:px-8 py-6">
      <div className="max-w-2xl mx-auto">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
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
              placeholder="当前密码"
              autoComplete="current-password"
              disabled={pending}
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
              placeholder={`至少 ${MIN_PASSWORD_LENGTH} 位`}
              autoComplete="new-password"
              disabled={pending}
            />
            {newPassword.length > 0 && !lenOk ? (
              <p className="text-xs text-danger mt-1">
                新密码至少 {MIN_PASSWORD_LENGTH} 位
              </p>
            ) : null}
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
            {confirmPassword.length > 0 && !matchOk ? (
              <p className="text-xs text-danger mt-1">两次输入的新密码不一致</p>
            ) : null}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => navigate("/settings")}
              disabled={pending}
            >
              取消
            </Button>
            <Button
              size="lg"
              className="flex-1"
              type="submit"
              disabled={!canSubmit}
              loading={pending}
            >
              确认修改
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
