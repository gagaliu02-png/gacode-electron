/**
 * routes/Register.tsx — 阶段 1 注册页
 *
 * 对齐 gacode-web 注册流程 + Android RegisterScreen:
 *   - 用户名 (必填) + 密码 (必填) + 邮箱 (选填) + 显示名 (选填)
 *   - 成功后自动跳 /login 让用户登录 (阶段 1 简化: server register 是否
 *     直接返 accessToken 取决于 unified-api, 不强依赖, 失败也能跑通登录)
 */

import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../lib/auth";

export function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { toast } = useToast();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast({ message: "用户名和密码必填", variant: "default" });
      return;
    }
    if (password.length < 8) {
      toast({ message: "密码至少 8 位", variant: "default" });
      return;
    }
    setSubmitting(true);
    try {
      await register({
        username: username.trim(),
        password,
        email: email.trim() || undefined,
        displayName: displayName.trim() || undefined,
      });
      toast({ message: "注册成功,请登录", variant: "success" });
      // 阶段 1 简化: register 不一定返 accessToken (取决于 server),
      // 这里统一跳 /login, 让用户走标准 login 流
      navigate("/login", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ message: msg || "注册失败", variant: "danger" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg-base px-4 py-8">
      <div className="flex items-center gap-3 mb-10">
        <div
          aria-hidden="true"
          className="w-14 h-14 rounded-md bg-brand/20 border border-brand/40 flex items-center justify-center text-brand font-bold text-2xl"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          G
        </div>
        <span className="text-xl font-semibold tracking-wide">gacode</span>
      </div>

      <div className="w-full max-w-[400px] rounded-md bg-bg-sunken border border-border shadow-sm p-6">
        <h1 className="text-lg font-medium mb-1">注册新账号</h1>
        <p className="text-sm text-fg-muted mb-6">
          创建一个 gacode 账号,跨端通用
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            placeholder="用户名 *"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            disabled={submitting}
            required
          />
          <Input
            type="password"
            placeholder="密码 * (至少 8 位)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            disabled={submitting}
            required
          />
          <Input
            type="email"
            placeholder="邮箱 (选填)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            disabled={submitting}
          />
          <Input
            placeholder="显示名 (选填)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={submitting}
          />

          <Button
            type="submit"
            variant="default"
            size="lg"
            loading={submitting}
            className="w-full"
          >
            {submitting ? "注册中..." : "注册"}
          </Button>

          <p className="text-sm text-fg-muted text-center pt-2">
            已有账号?{" "}
            <Link
              to="/login"
              className="text-brand hover:underline font-medium"
            >
              去登录
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}