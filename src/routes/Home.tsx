import { useLocation } from "react-router-dom";

/**
 * 阶段 0 首页 —— 验证 React + Vite + electron-vite 链路通了。
 *
 * 跑通要点:
 * - 背景 = bg-base (gagaOS 暗色, #000000)
 * - 主文字 = fg (高亮白)
 * - 副文字 = fg-muted (中灰)
 * - 时间戳 = fg-subtle (极浅灰) + font-mono (JetBrains Mono)
 */
export function Home() {
  const location = useLocation();
  return (
    <main className="min-h-screen bg-bg-base text-fg flex items-center justify-center">
      <div className="text-center space-y-2 px-6">
        <h1 className="text-2xl font-medium text-fg">Gacode PC</h1>
        <p className="text-sm text-fg-muted">
          阶段 0 跑通 · React + Vite + electron-vite
        </p>
        <p className="text-xs text-fg-subtle font-mono">
          build {new Date().toISOString()}
        </p>
        <p className="text-xs text-fg-subtle font-mono">route {location.pathname}</p>
      </div>
    </main>
  );
}