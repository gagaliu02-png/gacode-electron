/**
 * routes/ProfileApps.tsx — 阶段 3 我的应用
 *
 * ⚠️ 2026-10-17 阶段 3 实测:
 *   - gacode-web 在 /profile/apps 显示"功能正在开发中"占位 (gacode-web/src/app/(main)/profile/apps/page.tsx:14-35)
 *   - unified-api 当前没有 /gacode/profile/apps endpoint
 *   - 仅 userId == 6 显示入口 (web 端是硬编码的特殊用户, PC 阶段 3 沿用同一策略)
 *
 * 2026-10-26 对齐 web (docs/align-c-profile-notify.md 组 1 · C1-01 ~ C1-12):
 *   - C1-01/02: 单层容器 `px-4 lg:px-8 py-6 max-w-2xl mx-auto` (删掉 max-w-md 中间层)
 *   - C1-03/04: 卡片改用 <Card> / <CardContent> (web 的 rounded-lg border bg-card
 *               text-card-foreground shadow + 内容 p-10 text-center text-fg-muted)
 *   - C1-05/06: 图标改成裸 SVG (去掉圆形底容器) + mb-4 (lucide Construction 路径)
 *   - 2026-10-26 图标形状对齐 web: 本地「围挡柱」手写 SVG 删掉, 改 import 共享
 *     <ConstructionIcon> (lucide v0.407.0 `construction` 真值 —— 硬帽子 + 工具;
 *     web `app/(main)/profile/apps/page.tsx:26` 的
 *     <Construction className="w-12 h-12 mx-auto text-fg-muted mb-4" /> 同款)。
 *   - C1-07/09: 标题 <p> → <div> + 显式 text-fg; 描述文案逗号改全角
 *   - C1-10: 删掉页面内 <h1> (标题只由 AppShell header 渲染)
 *   - C1-12: 删掉页内 isPrivileged 分支 —— web 本页对**所有用户**渲染同一张占位卡,
 *             特权门禁只发生在**入口** (web Drawer 的 isSpecial; PC 侧栏入口见 S-1)
 */

import { Card, CardContent } from "../components/ui/Card";
import { ConstructionIcon } from "../components/ui/Glyphs";

export function ProfileApps() {
  return (
    <div className="min-h-full px-4 lg:px-8 py-6 max-w-2xl mx-auto">
      <Card>
        <CardContent className="!p-10 text-center text-fg-muted">
          {/* lucide `construction` (48px / sw2) — 共享 <ConstructionIcon>
              (web `app/(main)/profile/apps/page.tsx:26` 的
               <Construction className="w-12 h-12 mx-auto text-fg-muted mb-4" /> 同款) */}
          <ConstructionIcon className="w-12 h-12 mx-auto text-fg-muted mb-4" />
          <div className="text-base font-medium mb-1 text-fg">我的应用</div>
          <div className="text-sm">
            管理你创建的 gagaOS 应用 — 这个功能正在开发中，先用基础功能吧 🚧
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
