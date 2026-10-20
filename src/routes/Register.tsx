/**
 * routes/Register.tsx — 阶段 1 注册页 (0.7.5 加注册协议勾选 register-5)
 *
 * 对齐 gacode-web 注册流程 + Android RegisterScreen:
 *   - 用户名 (必填) + 密码 (必填) + 邮箱 (选填) + 显示名 (选填)
 *   - 密保问题 (必填, 1-20 字) + 密保答案 (必填, 1-10 字纯中文) — server
 *     2026-10-19 起 registerSchema.required, 0.7.6 补上 (之前必 400)
 *   - 注册协议勾选 (0.7.5 P2 register-5): 不勾 = 提交按钮 disabled + toast 提示
 *   - 成功后自动跳 /login 让用户登录 (阶段 1 简化: server register 是否
 *     直接返 accessToken 取决于 unified-api, 不强依赖, 失败也能跑通登录)
 *
 * file scope: 本文件改; 不动 Login/QrLogin.
 */

import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../lib/auth";

/**
 * 密保校验 — 跟 server `auth.service.js:44-60` + Android `RegisterUiState` 逐条对齐.
 *   - securityQuestion: 1-20 字 (server 用 Array.from() 按字符数算, 中文 1 字 1 字符)
 *   - securityAnswer:   1-10 字 + 纯中文, server 正则 `/^[\u4e00-\u9fff]+$/`
 *     (上界是 U+9FFF 不是 U+9FA5 — 跟 server 字面一致, 不要自作主张改窄)
 * 两个字段都是 registerSchema.required 之一, 漏传必 400.
 */
const SECURITY_QUESTION_MAX = 20;
const SECURITY_ANSWER_MAX = 10;
const SECURITY_ANSWER_RE = /^[\u4e00-\u9fff]+$/;

/** 留空返回 null (用户还没输完别骂), 跟 Android SecurityQuestionValidator 同款. */
function securityQuestionError(value: string): string | null {
  if (!value) return null;
  return [...value].length > SECURITY_QUESTION_MAX
    ? "密保问题只能填 1-20 个字"
    : null;
}

/** 留空返回 null. 长度跟字符集一起判, 文案跟 Android "答案只能输入中文" 同款. */
function securityAnswerError(value: string): string | null {
  if (!value) return null;
  if (!SECURITY_ANSWER_RE.test(value)) return "密保答案只能填 1-10 个汉字";
  if ([...value].length > SECURITY_ANSWER_MAX) return "密保答案只能填 1-10 个汉字";
  return null;
}

export function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { toast } = useToast();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [securityQuestion, setSecurityQuestion] = useState("");
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [agreeTos, setAgreeTos] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 内联错误文案 — 边输边判, 空值不报错
  const questionError = securityQuestionError(securityQuestion);
  const answerError = securityAnswerError(securityAnswer);
  const securityOk =
    securityQuestion.trim().length > 0 &&
    [...securityQuestion].length <= SECURITY_QUESTION_MAX &&
    SECURITY_ANSWER_RE.test(securityAnswer) &&
    [...securityAnswer].length <= SECURITY_ANSWER_MAX;

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
    if (!securityQuestion.trim() || !securityAnswer) {
      toast({ message: "密保问题和密保答案必填", variant: "default" });
      return;
    }
    const secQErr = securityQuestionError(securityQuestion);
    const secAErr = securityAnswerError(securityAnswer);
    if (secQErr || secAErr) {
      toast({ message: secQErr ?? secAErr ?? "密保信息格式不对", variant: "danger" });
      return;
    }
    if (!agreeTos) {
      toast({
        message: "请先勾选服务条款与隐私协议",
        variant: "warning",
      });
      return;
    }
    setSubmitting(true);
    try {
      await register({
        username: username.trim(),
        password,
        email: email.trim() || undefined,
        displayName: displayName.trim() || undefined,
        securityQuestion: securityQuestion.trim(),
        securityAnswer,
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

      <div className="w-full max-w-[400px] rounded-md bg-bg-sunken shadow-sm p-6">
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

          {/* 0.7.6 — 密保问题 + 密保答案 (server 2026-10-19 起 registerSchema.required,
              客户端漏实现 → 注册必 400). 位置放资料字段之后 / 协议勾选之前,
              跟 Android RegisterScreen "填完资料密码再问密保" 的 4 步顺序一致. */}
          <p className="text-xs text-fg-muted -mt-2">
            密保用于找回密码,注册后不可修改
          </p>
          <Input
            placeholder="密保问题 * (1-20 字,例如: 你最喜欢的城市)"
            value={securityQuestion}
            onChange={(e) => setSecurityQuestion(e.target.value)}
            disabled={submitting}
            required
            aria-invalid={questionError ? true : undefined}
            className={questionError ? "border-danger" : ""}
          />
          {questionError ? (
            <p className="text-xs text-danger -mt-2">{questionError}</p>
          ) : null}

          <Input
            placeholder="密保答案 * (1-10 字,仅中文)"
            value={securityAnswer}
            onChange={(e) => setSecurityAnswer(e.target.value)}
            disabled={submitting}
            required
            aria-invalid={answerError ? true : undefined}
            className={answerError ? "border-danger" : ""}
          />
          {answerError ? (
            <p className="text-xs text-danger -mt-2">{answerError}</p>
          ) : null}

          {/* 0.7.5 register-5: 服务条款 + 隐私协议勾选 */}
          <label className="flex items-start gap-2 text-sm text-fg-muted select-none">
            <input
              type="checkbox"
              checked={agreeTos}
              onChange={(e) => setAgreeTos(e.target.checked)}
              disabled={submitting}
              className="mt-0.5"
            />
            <span>
              我已阅读并同意{" "}
              <a
                href="https://www.gaga.sale/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline"
              >
                《服务条款》
              </a>{" "}
              与{" "}
              <a
                href="https://www.gaga.sale/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand hover:underline"
              >
                《隐私协议》
              </a>
            </span>
          </label>

          <Button
            type="submit"
            variant="default"
            size="lg"
            loading={submitting}
            disabled={!agreeTos || !securityOk}
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