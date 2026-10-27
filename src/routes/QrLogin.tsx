/**
 * routes/QrLogin.tsx — PC 扫码登录页 (2026-10-17)
 *
 * 跟 gacode-web/(auth)/qr-login/page.tsx 一致设计, 流程:
 *   1. mount: POST /qr-login-issue → 拿 { token, qrUrl, expiresIn, pollIntervalMs }
 *   2. 用 qrcode 库把 qrUrl 渲染成 PNG dataURL
 *   3. 每 2 秒 GET /qr-login-status?token=
 *      - pending → 继续轮询
 *      - authorized → 调 useAuth().setSession(...) + 跳 /
 *      - 404 → 标 expired, 显示刷新按钮
 *   4. 2 分钟到期 / 服务端主动 expired → 同 404, 用户点 "刷新" 重新 issue
 *
 * 为什么不放 password login 同款表单:
 *   扫码是独立登录路径, 跟密码登录并列; 入口是 /qr-login 直接进,
 *   密码登录页底部有 "用 App 扫码登录" 链接.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import QRCode from "qrcode";
import { BrandLockup } from "../components/ui/BrandLockup";
import { Button } from "../components/ui/Button";
import { useAuth } from "../lib/auth";
import { authApi } from "../lib/api";
import { useToast } from "../components/ui/Toast";
import {
  CircleCheckIcon,
  LoaderCircleIcon,
  RefreshCwIcon,
  SmartphoneIcon,
} from "../components/ui/Glyphs";

// ────────────────────────────────────────────────────────────
// icons — 本文件**不再保留**本地图标 (2026-10-27 组件意识收编)
//   先前收编: 本地 `Spinner` / `RefreshIcon` / `PhoneIcon` / `CheckIcon`
//   与 components/ui/Glyphs.tsx 的共享导出重复实现 ⇒ 已删, 改 import 共享组件:
//     · Spinner     → 共享 <LoaderCircleIcon> (lucide v0.407.0 `loader-circle`
//                     真值) —— web `(auth)/qr-login/page.tsx` 同款
//                     `<Loader2 className="h-8 w-8 animate-spin text-fg-muted" />`
//     · RefreshIcon → 共享 <RefreshCwIcon> (lucide v0.407.0 `refresh-cw` 真值)
//     · PhoneIcon   → 共享 <SmartphoneIcon> (lucide v0.407.0 `smartphone` 真值)
//     · CheckIcon   → 共享 <CircleCheckIcon> (lucide v0.407.0 `circle-check`
//                     真值 = web 的 `CheckCircle2`)
// ────────────────────────────────────────────────────────────

const POLL_TIMEOUT_MS = 120 * 1000;
const POLL_INTERVAL_MS = 2 * 1000;

type Phase =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "expired" }
  | { kind: "success"; userName: string | null };

export function QrLogin() {
  const navigate = useNavigate();
  const { setSession, user } = useAuth();
  const { toast } = useToast();

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(POLL_TIMEOUT_MS / 1000);

  const tokenRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);

  const issue = useCallback(async () => {
    setError(null);
    setPhase({ kind: "loading" });
    setQrDataUrl(null);
    setSecondsLeft(POLL_TIMEOUT_MS / 1000);
    cancelledRef.current = false;
    try {
      const data = await authApi.issueQrLogin();
      tokenRef.current = data.token;
      const dataUrl = await QRCode.toDataURL(data.qrUrl, {
        width: 280,
        margin: 2,
        errorCorrectionLevel: "H",
        // QR 必须深色数据点 + 浅色背景才能扫(对比度需求), 跟 gacode-web 端对齐
        color: { dark: "#000000", light: "#ffffff" },
      });
      if (cancelledRef.current) return;
      setQrDataUrl(dataUrl);
      setPhase({ kind: "ready" });
    } catch (err) {
      if (cancelledRef.current) return;
      setError(err instanceof Error ? err.message : "生成二维码失败");
      setPhase({ kind: "expired" });
    }
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let countdownTimer: ReturnType<typeof setInterval> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    void issue();

    countdownTimer = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);

    pollTimer = setInterval(async () => {
      const token = tokenRef.current;
      if (!token) return;
      try {
        const r = await authApi.pollQrLoginStatus(token);
        if (r.status === "pending") return;
        if (r.status === "authorized") {
          // 一次性消费 → 写内存 + 持久化 refreshToken + 跳 /
          // user 字段只返了 id / displayName / avatarUrl, 不够 /auth/me 完整 User —
          // 立刻再调一次 /auth/me 拿齐 (字段在 PC 端需要 username 才能在 UI 展示)
          let fullUser;
          try {
            fullUser = await authApi.me();
          } catch {
            fullUser = {
              id: r.user.id,
              username: r.user.displayName || r.user.id,
              email: null,
              displayName: r.user.displayName || undefined,
              avatar: r.user.avatarUrl || undefined,
            } as Awaited<ReturnType<typeof authApi.me>>;
          }
          setSession({
            user: fullUser,
            accessToken: r.accessToken,
            refreshToken: r.refreshToken,
          });
          cancelledRef.current = true;
          if (pollTimer) clearInterval(pollTimer);
          if (countdownTimer) clearInterval(countdownTimer);
          if (timeoutTimer) clearTimeout(timeoutTimer);
          setPhase({ kind: "success", userName: r.user.displayName });
          setTimeout(() => navigate("/", { replace: true }), 600);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("404") || msg.toLowerCase().includes("expired")) {
          cancelledRef.current = true;
          if (pollTimer) clearInterval(pollTimer);
          if (countdownTimer) clearInterval(countdownTimer);
          if (timeoutTimer) clearTimeout(timeoutTimer);
          setPhase({ kind: "expired" });
        }
      }
    }, POLL_INTERVAL_MS);

    timeoutTimer = setTimeout(() => {
      cancelledRef.current = true;
      if (pollTimer) clearInterval(pollTimer);
      if (countdownTimer) clearInterval(countdownTimer);
      setPhase({ kind: "expired" });
    }, POLL_TIMEOUT_MS);

    return () => {
      cancelledRef.current = true;
      if (pollTimer) clearInterval(pollTimer);
      if (countdownTimer) clearInterval(countdownTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
    };
  }, [issue, navigate, setSession, toast]);

  // 已经登录的 (打开 /qr-login 时) → 跳 /, 别在扫码页停留
  useEffect(() => {
    if (user) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg-base px-4 py-8">
      {/* Brand logo — cody 吉祥物 + gacode 品牌名 (对齐 web qr-login/page.tsx:171-179) */}
      <BrandLockup />

      <div className="w-full max-w-[400px] rounded-md bg-bg-sunken shadow-sm p-6">
        <h1 className="text-lg font-medium mb-1 text-center">扫码登录</h1>
        <p className="text-sm text-fg-muted mb-6 text-center">
          打开 Gacode App 扫一扫, 即可在电脑上登录
        </p>

        <div className="flex flex-col items-center">
          {phase.kind === "loading" && (
            <div className="w-[280px] h-[280px] flex items-center justify-center bg-bg-elevated rounded-2xl">
              <LoaderCircleIcon
                size={32}
                className="h-8 w-8 animate-spin text-fg-muted"
              />
            </div>
          )}

          {phase.kind === "ready" && qrDataUrl && (
            <div className="relative">
              <img
                src={qrDataUrl}
                alt="扫码登录二维码"
                width={280}
                height={280}
                className="rounded-2xl bg-white p-3"
              />
              <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-xs text-fg-muted">
                {secondsLeft}s 后过期
              </div>
            </div>
          )}

          {phase.kind === "expired" && (
            <div className="w-[280px] h-[280px] flex flex-col items-center justify-center bg-bg-elevated rounded-2xl gap-3">
              <RefreshCwIcon size={24} className="h-8 w-8 text-fg-muted" />
              <p className="text-sm text-fg-muted">二维码已失效</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void issue()}
              >
                刷新二维码
              </Button>
            </div>
          )}

          {phase.kind === "success" && (
            <div className="w-[280px] h-[280px] flex flex-col items-center justify-center bg-bg-elevated rounded-2xl gap-2">
              <CircleCheckIcon size={24} className="h-10 w-10 text-success" />
              <p className="text-sm font-medium">登录成功</p>
              <p className="text-xs text-fg-muted">
                欢迎回来{phase.userName ? `, ${phase.userName}` : ""}
              </p>
            </div>
          )}
        </div>

        {phase.kind === "ready" && (
          <div className="mt-10 flex items-start gap-3 p-3 rounded-xl bg-bg-elevated/50">
            <SmartphoneIcon className="h-5 w-5 text-fg-muted mt-0.5 shrink-0" />
            <div className="text-sm text-fg-muted space-y-1">
              <p>1. 打开 Gacode App</p>
              <p>2. 进入 "扫码登录" 功能</p>
              <p>3. 对准此二维码扫一扫</p>
              <p>4. 在 App 内确认, 网页自动登录</p>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm text-danger text-center">{error}</p>
        )}

        <p className="text-sm text-fg-muted text-center mt-8">
          想用账号密码登录?{" "}
          <Link to="/login" className="text-brand hover:underline font-medium">
            返回密码登录
          </Link>
        </p>
      </div>
    </div>
  );
}