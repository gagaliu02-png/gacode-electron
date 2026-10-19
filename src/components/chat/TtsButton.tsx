/**
 * components/chat/TtsButton.tsx — chat-id-27 TTS 朗读助手气泡
 *
 * Electron renderer 跑在 Chromium, 直接走 web 平台 `window.speechSynthesis`
 * (跟 web 端 NavigationMenu.TTS 同款 — gacode-web 没显式做 TTS, 但 web 端走
 *  web API, Electron renderer 也是 web). macOS / Windows 系统 TTS 不暴露到
 * renderer, 优先 web API, 不行就 toast 提示.
 *
 * 设计:
 *   - 一个 speaker 图标 button (hover 显示)
 *   - 点 → speechSynthesis.speak(new SpeechSynthesisUtterance(content))
 *   - 再点 → speechSynthesis.cancel() 立即停
 *   - 流式中禁用 (内容还在变, 朗读体验差)
 */

import { useCallback, useEffect, useState } from "react";
import { useToast } from "../ui/Toast";

export interface TtsButtonProps {
  content: string;
  /** 流式中禁用 */
  disabled?: boolean;
}

export function TtsButton({ content, disabled }: TtsButtonProps) {
  const { toast } = useToast();
  const [playing, setPlaying] = useState(false);

  const supported =
    typeof window !== "undefined" &&
    typeof window.speechSynthesis !== "undefined" &&
    typeof window.SpeechSynthesisUtterance !== "undefined";

  // 组件卸载 / 切 chat → 停掉
  useEffect(() => {
    return () => {
      try {
        window.speechSynthesis?.cancel();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const handleClick = useCallback(() => {
    if (!supported) {
      toast({
        message: "当前环境不支持 TTS, 请用 macOS 系统朗读 (选中按 ⌥+Esc) / Windows Narrator",
        variant: "warning",
      });
      return;
    }
    if (!content || content.trim().length === 0) {
      toast({ message: "消息为空, 无可朗读内容", variant: "warning" });
      return;
    }
    try {
      if (playing) {
        window.speechSynthesis.cancel();
        setPlaying(false);
        return;
      }
      const u = new SpeechSynthesisUtterance(content);
      // 默认中文 (zh-CN); 浏览器会自动 fallback
      u.lang =
        typeof navigator !== "undefined" && navigator.language
          ? navigator.language
          : "zh-CN";
      u.rate = 1.0;
      u.pitch = 1.0;
      u.onend = () => setPlaying(false);
      u.onerror = () => setPlaying(false);
      window.speechSynthesis.speak(u);
      setPlaying(true);
    } catch (err) {
      toast({
        message: `TTS 启动失败: ${err instanceof Error ? err.message : String(err)}`,
        variant: "danger",
      });
      setPlaying(false);
    }
  }, [content, playing, supported, toast]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || !content?.trim()}
      title={playing ? "停止朗读" : "朗读这条消息"}
      aria-label={playing ? "停止朗读" : "朗读这条消息"}
      data-testid="tts-button"
      className="w-7 h-7 inline-flex items-center justify-center rounded-full text-fg-muted hover:text-fg hover:bg-bg-sunken transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
    >
      {playing ? <StopSpeakerIcon /> : <SpeakerIcon />}
    </button>
  );
}

function SpeakerIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function StopSpeakerIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="22" y1="9" x2="16" y2="15" />
      <line x1="16" y1="9" x2="22" y2="15" />
    </svg>
  );
}