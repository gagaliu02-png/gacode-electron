/**
 * routes/IMBinding.tsx — IM 配对码 (批 G12 · 2026-11-04)
 *
 * 对齐 web (gacode-web/src/app/(main)/profile/im-binding/page.tsx, 2026-10-27)
 * + 安卓 IMBindingScreen (ui/imbindings/IMBindingScreen.kt)。
 *
 * 流程 (照安卓):
 *   1. 进入页面 → 自动 issue 一次 (POST /im-bindings/issue, label = 用户名)
 *   2. 显示 6 位码 (大字号, 中间空格分隔 "1 2 3 4 5 6", **单行不折行**)
 *   3. 本地 1Hz 倒计时 (后端无状态, 不轮询服务端), 到 0 显示「已过期」
 *   4. 「复制」按钮 → 复制 "绑定 123456" (**带「绑定」前缀**, 用户直接发微信)
 *   5. 「换一个新码 / 刷新」→ 重新 issue (旧码作废)
 *   6. 「备注: {label}」—— 后端回显的 label
 *
 * ⚠️ expiresIn 单位 = **秒** (后端 CODE_TTL_MS = 5*60*1000 ⇒ 300)
 *    ⇒ 直接当秒用, **不要**再 * 1000 当毫秒。
 * ⚠️ 本页**不做**「已绑定列表 / 解绑」(那俩端点要 gaclaw internal token,
 *    不是 user auth) —— 同安卓 PM 拍板口径。
 * ⚠️ 顶栏标题走 AppShell.resolveTitle() (pathname === "/profile/im-binding"
 *    ⇒ "IM 配对码"), 本页**不自己画顶栏**。
 */

import { useEffect, useRef, useState } from "react";
import { issueImBindingCode } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { CopyIcon, RefreshCwIcon } from "../components/ui/Glyphs";

/** 后端 CODE_TTL_MS = 5 * 60 * 1000 ⇒ 300 秒 (兜底值, 正常由后端下发) */
const DEFAULT_TTL_SEC = 300;

/** 剩余秒数 → "4:59" / "0:30" (不补前导 0, 省一眼扫到时间) */
function formatCountdown(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s}`;
}

export function IMBinding() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [code, setCode] = useState<string | null>(null);
  const [label, setLabel] = useState<string | null>(null);
  /** 剩余秒数 (不是毫秒!) */
  const [remainingSec, setRemainingSec] = useState(0);
  const [isIssuing, setIsIssuing] = useState(false);

  /**
   * 生成一个新配对码。
   * - label = 用户名 (后端 maxLength 64, gaga 这类短名安全)
   * - 成功 → 码 + 倒计时基准 (秒)
   * - 失败 → toast 报错, **页面不崩** (旧码保留, 用户还能重试)
   */
  const issueCode = async () => {
    if (isIssuing) return;
    setIsIssuing(true);
    try {
      const displayName = user?.displayName || user?.username || undefined;
      const data = await issueImBindingCode(displayName);
      setCode(data.code);
      setLabel(data.label ?? null);
      // ⚠️ expiresIn 单位 = 秒 —— 直接当秒用 (不要 * 1000)
      setRemainingSec(data.expiresIn > 0 ? data.expiresIn : DEFAULT_TTL_SEC);
    } catch (err) {
      toast({
        title: "生成配对码失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "danger",
      });
    } finally {
      setIsIssuing(false);
    }
  };

  // 首次进入自动 issue 一次。
  //   ⚠️ 用 ref 守门: React 严格模式下 effect 会跑两次 ⇒ 不守门会连发两次 issue。
  const issuedRef = useRef(false);
  useEffect(() => {
    if (issuedRef.current) return;
    issuedRef.current = true;
    void issueCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isExpired = remainingSec <= 0;

  /**
   * 本地 1Hz 倒计时。
   * - 组件卸载必须 clearInterval (严格模式 effect 会跑两次 ⇒ 一定要清理)
   * - 不用 Date.now() 差值算 (切后台 / 休眠会跳) —— 照安卓的 1Hz 递减
   */
  useEffect(() => {
    if (!code || isExpired) return;
    const timer = setInterval(() => {
      setRemainingSec((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [code, isExpired]);

  const handleCopy = async () => {
    if (!code || isExpired) {
      toast({ title: "码已过期, 请先刷新", variant: "warning" });
      return;
    }
    // 带「绑定」前缀 —— 用户直接粘贴发微信, 不用自己拼
    try {
      await navigator.clipboard.writeText(`绑定 ${code}`);
      toast({
        title: `已复制「绑定 ${code}」, 去微信发出去`,
        variant: "success",
      });
    } catch {
      toast({ title: "复制失败", variant: "danger" });
    }
  };

  return (
    <div className="min-h-full px-4 lg:px-8 py-6">
      <div className="max-w-2xl mx-auto">
        {/* 说明文字 */}
        <div className="mb-4">
          <h2 className="text-base font-medium">把 gacode 绑定到微信 / 元宝</h2>
          <p className="text-xs text-fg-muted mt-1 leading-relaxed">
            在微信里给 gacaw bot 发「绑定 123456」, bot 会回复二次确认.
            同意后, 微信里发的普通消息会变成 gacode 里的 AI 提问.
          </p>
        </div>

        {/* 码卡片 */}
        <div className="rounded-md bg-bg-elevated p-6 flex flex-col items-center">
          {code ? (
            <>
              {/* 6 位码, 中间空格分隔 —— whitespace-nowrap 防窄屏折成两行
                  (安卓 v4.1.49 真机修过同一个 bug) */}
              <div className="text-4xl font-semibold tracking-widest whitespace-nowrap font-mono">
                {code.split("").join(" ")}
              </div>
              <div
                className={[
                  "mt-2 text-base font-medium",
                  isExpired ? "text-danger" : "text-brand",
                ].join(" ")}
              >
                {isExpired ? "已过期" : formatCountdown(remainingSec)}
              </div>
              {label ? (
                <div className="mt-1 text-xs text-fg-muted">备注: {label}</div>
              ) : null}
            </>
          ) : (
            <div className="h-24 flex items-center justify-center text-xl text-fg-muted">
              {isIssuing ? "生成中..." : "未生成"}
            </div>
          )}
        </div>

        {/* 操作按钮: 复制 / 换一个新码 */}
        <div className="mt-4 flex gap-3">
          <Button
            variant="outline"
            size="lg"
            className="flex-1 gap-2"
            onClick={handleCopy}
            disabled={!code || isExpired}
          >
            <CopyIcon className="w-4 h-4" />
            复制
          </Button>
          <Button
            size="lg"
            className="flex-1 gap-2"
            onClick={() => void issueCode()}
            disabled={isIssuing}
          >
            <RefreshCwIcon className="w-4 h-4" />
            {isExpired ? "刷新" : "换一个新码"}
          </Button>
        </div>

        {/* 绑定步骤 */}
        <div className="mt-6 rounded-md bg-bg-elevated p-5">
          <div className="text-base font-medium mb-3">绑定步骤</div>
          <ol className="space-y-2 text-sm text-fg-muted">
            <li>1. 在本页点「复制」, 把「绑定 123456」复制到剪贴板</li>
            <li>2. 打开微信 (或元宝), 找到 gaclaw bot</li>
            <li>3. 把复制的内容粘贴发给 bot, bot 会回复二次确认</li>
            <li>4. 回复「yes」同意, 绑定完成</li>
            <li>5. 之后微信里发普通消息, bot 会自动当成 gacode 的提问调 LLM</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
