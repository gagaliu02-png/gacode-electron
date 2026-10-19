/**
 * routes/Login.tsx — 阶段 1 登录页
 *
 * 对齐 gacode-web login/page.tsx + Android LoginScreen:
 *   - 居中卡 + brand logo + 标题 "Gacode · 登录"
 *   - 用户名 + 密码输入 + 登录按钮 (brand 橙)
 *   - 没账号? 去注册链接
 *   - 📱 用 App 扫码登录 (阶段 1 加)
 *   - 忘记密码? 外链到 https://www.gaga.sale/forgot-password (阶段 7+) — gagaOS 密保 + gawen 流, 走系统浏览器
 *
 * 真实接通 /auth/login (unified-api):
 *   - 成功 → AuthProvider.login 设 accessToken + user + navigate("/")
 *   - 失败 → toast danger 提示错误消息
 */

import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../lib/auth";

export function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { toast } = useToast();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast({ message: "请填写用户名和密码", variant: "default" });
      return;
    }
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      navigate("/", { replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ message: msg || "登录失败", variant: "danger" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg-base px-4 py-8">
      {/* Brand logo */}
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

      {/* Login card */}
      <div className="w-full max-w-[400px] rounded-md bg-bg-sunken shadow-sm p-6">
        <h1 className="text-lg font-medium mb-1">Gacode · 登录</h1>
        <p className="text-sm text-fg-muted mb-6">
          使用 unified-api 账号登录,跨端通用
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            placeholder="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            disabled={submitting}
            required
          />
          <Input
            type="password"
            placeholder="密码"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={submitting}
            required
          />

          <Button
            type="submit"
            variant="default"
            size="lg"
            loading={submitting}
            className="w-full"
          >
            {submitting ? "登录中..." : "登录"}
          </Button>

          <p className="text-sm text-fg-muted text-center pt-2">
            还没有账号?{" "}
            <Link
              to="/register"
              className="text-brand hover:underline font-medium"
            >
              立即注册
            </Link>
          </p>

          {/* 2026-10-17: 加扫码登录入口 — 用 App 扫一下, PC 自动登录 */}
          <p className="text-sm text-fg-muted text-center pt-1">
            <Link
              to="/qr-login"
              className="text-brand hover:underline font-medium"
            >
              📱 用 App 扫码登录
            </Link>
          </p>

          {/* 2026-10-19: 忘记密码走 unified-api 忘记密码页 (gagaOS 密保 + gawen 流), 系统浏览器打开 */}
          <p className="text-sm text-fg-muted text-center pt-1">
            <a
              href="https://www.gaga.sale/forgot-password"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:underline font-medium"
            >
              忘记密码?
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}