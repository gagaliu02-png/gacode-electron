/**
 * routes/Browser.tsx — 阶段 3 浏览器入口 (简化版)
 *
 * 阶段 3 不做完整 webview 内嵌:
 *   - 主进程需要 BrowserView 管理 + preload 暴露 IPC (gacode.openExternal).
 *   - brief 明确不动 electron/main.ts / preload.ts (PR 1-3 保留).
 *   - 阶段 4 实体化 webview 时再扩.
 *
 * 阶段 3 策略:
 *   - URL 输入框 + 校验 + 「打开」按钮 → window.open(url, "_blank", "noopener,noreferrer")
 *   - Electron Chromium 渲染层 window.open 默认走系统默认浏览器 (跟 gacode.openExternal 行为一致)
 *   - 提供「历史」列表 (in-memory, 不持久化) 给常用 URL 快速访问
 *
 * 跟 system menu / tray / macOS dock 完全不冲突 — Electron 默认
 *   "window.open" 在主进程没注册 webContents 拦截时, 直接走 setWindowOpenHandler
 *   默认转发到 system Browser. 这里不需要主进程配合.
 */

import { useState } from "react";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

const QUICK_LINKS: Array<{ label: string; url: string }> = [
  { label: "gaga 官网", url: "https://www.gaga.sale" },
  { label: "gacode-web", url: "https://gacode-web.vercel.app" },
  { label: "gaclaw 网关", url: "https://www.gaga.sale/api/v1/health" },
];

const HISTORY_LIMIT = 8;

function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // 已有协议直接用
  if (/^(https?:|file:|mailto:)/i.test(trimmed)) return trimmed;
  // 看起来像 URL → 加 https://
  if (/^[\w-]+(\.[\w-]+)+/.test(trimmed)) {
    return `https://${trimmed}`;
  }
  // 其他当关键词搜索
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

export function Browser() {
  const [urlInput, setUrlInput] = useState("");
  const [history, setHistory] = useState<Array<{ url: string; openedAt: number }>>(
    [],
  );

  const onOpen = (rawInput?: string) => {
    const target = normalizeUrl(rawInput ?? urlInput);
    if (!target) return;
    window.open(target, "_blank", "noopener,noreferrer");
    if (!rawInput) {
      setHistory((cur) => {
        const next = [{ url: target, openedAt: Date.now() }, ...cur];
        // dedupe by url, 保留最新一次
        const seen = new Set<string>();
        const deduped = next.filter((h) => {
          if (seen.has(h.url)) return false;
          seen.add(h.url);
          return true;
        });
        return deduped.slice(0, HISTORY_LIMIT);
      });
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onOpen();
  };

  return (
    <div className="min-h-full px-6 py-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-xl font-medium">浏览器</h1>

        {/* URL 输入 */}
        <form
          onSubmit={onSubmit}
          className="rounded-md bg-bg-elevated border border-border p-4 flex items-center gap-2"
        >
          <SearchIcon />
          <Input
            type="search"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="输入网址或搜索关键词"
            className="flex-1 py-2 text-sm"
          />
          <Button
            type="submit"
            variant="default"
            size="md"
            disabled={!urlInput.trim()}
          >
            打开
          </Button>
        </form>

        {/* 常用链接 */}
        <div>
          <h2 className="text-sm font-medium mb-2">常用</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {QUICK_LINKS.map((l) => (
              <li key={l.url}>
                <button
                  type="button"
                  onClick={() => onOpen(l.url)}
                  className="w-full text-left rounded-md bg-bg-elevated border border-border p-3 hover:bg-bg-sunken transition-colors duration-150 flex items-center gap-3"
                >
                  <ExternalIcon />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium">{l.label}</span>
                    <span className="block text-xs text-fg-subtle truncate font-mono">
                      {l.url}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* 历史 */}
        {history.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-medium">本次会话历史</h2>
              <button
                type="button"
                onClick={() => setHistory([])}
                className="text-xs text-fg-subtle hover:text-fg transition-colors duration-150"
              >
                清空
              </button>
            </div>
            <ul className="space-y-1">
              {history.map((h, i) => (
                <li
                  key={`${h.url}-${i}`}
                  className="rounded-md bg-bg-elevated border border-border"
                >
                  <button
                    type="button"
                    onClick={() => onOpen(h.url)}
                    className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-bg-sunken transition-colors duration-150"
                  >
                    <ClockIcon />
                    <span className="flex-1 text-xs font-mono truncate">
                      {h.url}
                    </span>
                    <span className="text-xs text-fg-subtle">
                      {formatRelative(h.openedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* 说明 */}
        <div className="rounded-md bg-bg-sunken border border-border p-4 text-xs text-fg-subtle space-y-1">
          <p>说明:</p>
          <ul className="list-disc list-inside space-y-0.5 pl-2">
            <li>阶段 3 简化版 — 链接通过系统默认浏览器打开</li>
            <li>真·内嵌 webview 留阶段 4 实体化 (需要主进程 BrowserView + preload IPC)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// helpers / icons
// ────────────────────────────────────────────────────────────

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "刚刚";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  return `${hr} 小时前`;
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-fg-muted shrink-0">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-fg-muted shrink-0">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-fg-muted shrink-0">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
