/**
 * routes/ProfileApps.tsx — 阶段 3 我的应用
 *
 * ⚠️ 2026-10-17 阶段 3 实测:
 *   - gacode-web 在 /profile/apps 显示"功能正在开发中"占位 (gacode-web/src/app/(main)/profile/apps/page.tsx:14-35)
 *   - unified-api 当前没有 /gacode/profile/apps endpoint
 *   - 仅 userId == 6 显示入口 (web 端是硬编码的特殊用户, PC 阶段 3 沿用同一策略)
 *
 * 阶段 3 简化: 通用占位页 + 说明. 后续 server / 应用平台 API 落地后再接.
 */

import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getProfile } from "../lib/api";
import { Button } from "../components/ui/Button";

export function ProfileApps() {
  const navigate = useNavigate();

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
  });

  // 仅特殊用户 (userId === "6") 显示入口 — 跟 web 行为一致
  const isPrivileged = profile?.id === "6";

  if (!isPrivileged) {
    return (
      <div className="min-h-full px-6 py-6">
        <div className="max-w-md mx-auto">
          <div className="rounded-md bg-bg-elevated p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-sunken flex items-center justify-center text-fg-muted">
              <LockIcon />
            </div>
            <p className="text-base font-medium mb-1">我的应用</p>
            <p className="text-sm text-fg-muted">
              此功能暂未对你的账号开放
            </p>
            <div className="mt-4">
              <Button
                variant="ghost"
                size="md"
                onClick={() => navigate("/profile")}
              >
                返回
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full px-6 py-6">
      <div className="max-w-md mx-auto space-y-5">
        <h1 className="text-xl font-medium">我的应用</h1>
        <div className="rounded-md bg-bg-elevated p-8 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-bg-sunken flex items-center justify-center text-fg-muted">
            <ConstructionIcon />
          </div>
          <p className="text-base font-medium mb-1">我的应用</p>
          <p className="text-sm text-fg-muted">
            管理你创建的 gagaOS 应用 — 这个功能正在开发中,先用基础功能吧 🚧
          </p>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// icons
// ────────────────────────────────────────────────────────────

function LockIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function ConstructionIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10v4" />
      <path d="M10 10v4" />
      <path d="M14 10v4" />
      <path d="M18 10v4" />
    </svg>
  );
}
