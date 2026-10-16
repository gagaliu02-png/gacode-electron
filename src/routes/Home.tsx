/**
 * routes/Home.tsx — 阶段 1 首页
 *
 * 升级: 从阶段 0 的"build 跑通占位" → 阶段 1 的"欢迎 + 快速开始"
 *   - 顶部: 欢迎语 (displayName 或 username, 从 useAuth 拿)
 *   - 中部: 居中"快速开始"输入框 — 占位, 按 Enter 跳 /chat
 *     (阶段 1 不接 createChat API, 阶段 2 接)
 *   - 底部: 一行说明 (阶段状态 + 当前路由)
 */

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [quickInput, setQuickInput] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = quickInput.trim();
    if (!text) return;
    // 阶段 1 不接 createChat — 直接跳对话列表, 阶段 2 再带 prompt 创建
    navigate("/chat");
  };

  const displayName = user?.displayName || user?.username || "访客";

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-2xl text-center space-y-6">
        {/* 欢迎语 */}
        <div className="space-y-2">
          <h1 className="text-2xl font-medium text-fg">
            欢迎,{displayName}
          </h1>
          <p className="text-sm text-fg-muted">
            Gacode PC · 阶段 1 跑通,App shell + 路由 + 持久 sidebar
          </p>
        </div>

        {/* 快速开始输入框 */}
        <form onSubmit={handleSubmit} className="mt-8">
          <div className="rounded-md bg-bg-sunken border border-border shadow-sm focus-within:border-brand transition-colors duration-150">
            <input
              type="text"
              value={quickInput}
              onChange={(e) => setQuickInput(e.target.value)}
              placeholder="说点什么?按 Enter 跳到对话列表…"
              className="w-full bg-transparent px-4 py-3 text-base placeholder:text-fg-subtle focus:outline-none"
              autoFocus
            />
            <div className="px-4 py-2 border-t border-border flex items-center justify-between">
              <span className="text-xs text-fg-subtle font-mono">
                阶段 2 接 createChat
              </span>
              <button
                type="submit"
                disabled={!quickInput.trim()}
                className="text-sm text-brand hover:text-brand-hover disabled:text-fg-subtle disabled:cursor-not-allowed font-medium"
              >
                进入对话 →
              </button>
            </div>
          </div>
        </form>

        {/* 提示卡 — 阶段 1 边界说明 */}
        <div className="mt-12 rounded-md bg-bg-elevated border border-border p-4 text-left">
          <p className="text-xs text-fg-muted">
            <strong className="text-fg">阶段 1 范围</strong> · 认证 / App shell /
            持久 sidebar / 9 个空壳页面 / Toast / Button / Input
          </p>
          <p className="text-xs text-fg-muted mt-1">
            <strong className="text-fg">阶段 2 范围</strong> · Chat 列表 / 详情 / SSE 流式 / 文件上传
          </p>
        </div>
      </div>
    </div>
  );
}