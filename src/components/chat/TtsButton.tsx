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
import { Volume2Icon, VolumeXIcon } from "../ui/Glyphs";
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
      {playing ? <VolumeXIcon /> : <Volume2Icon />}
    </button>
  );
}

// ─────────── icons (共享组件 — components/ui/Glyphs.tsx) ───────────
//   2026-10-27 收编: 本文件原本就地手写了 2 份内联 svg, 跟共享库重复实现 ⇒
//   全部改成 import. 逐个对照:
//     Volume2Icon 14×14 / sw1.6 (lucide `volume-2` — 朗读)
//     VolumeXIcon 14×14 / sw1.6 (lucide `volume-x` — 停止朗读)