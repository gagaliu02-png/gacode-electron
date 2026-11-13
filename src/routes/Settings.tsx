/**
 * routes/Settings.tsx — 「设置」页 (批 G12 · 2026-11-04)
 *
 * ⚠️ 本页是 PC **从零新建**的 (之前 PC 根本没有设置页 —— Profile.tsx 里那个
 * 「设置」入口点了只弹 toast「设置中心将在后续版本上线」)。gaga 2026-11-04
 * 截图反馈: 「设置功能也没有了」。
 *
 * 对齐 web (gacode-web/src/app/(main)/settings/page.tsx, 2026-10-27 新增):
 *   隐私组: 修改密码 → /settings/change-password
 *           注销账号 → AlertDialog 二次确认 → DELETE /auth/account
 *   关于组: 版本号 (只显示, **不做**「检查更新」—— gaga 明确不要)
 *
 * ❌ 不做: 主题切换 / 通知开关 / 清缓存 (安卓有, gaga 没要)
 *
 * 入口: 侧栏顶卡上的 ⚙️ 按钮 (AppShell.tsx, 挨着 🔔 铃铛) ——
 *       对齐 web Drawer.tsx:202-211 (设置入口放在抽屉那个通知的旁边)。
 *
 * ⚠️ 顶栏标题走 AppShell.resolveTitle() (pathname === "/settings" ⇒ "设置"),
 *    本页**不自己画顶栏** (跟 web 的 (main) 路由组统一 Header 一个道理)。
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteAccount } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/ui/Toast";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { ProfileMenuItem } from "../components/profile/ProfileMenuItem";
// ★ [P4/P7 · 2026-11-12] 端侧执行卡 + 本机定时卡**已挪到 /client-tools 页**
//   （gaga 拍板：抽屉「浏览器」下面，点进去一整页）⇒ 设置页不再引入。
import { LockIcon, TrashIcon } from "../components/ui/Glyphs";

/**
 * 版本号 — 走 preload bridge 的 `window.gacode.appVersion`
 * (electron/preload.ts:43, 从 package.json 读 + 缓存)。
 * ⚠️ 打包后 renderer 走 file:// ⇒ 拿不到 package.json ⇒ 不能 import package.json
 *    (vite 会把整个 json 内联进 bundle, 但那是**构建期**的版本 —— 能用, 只是
 *    会被 tree-shake 干掉; 走 bridge 是单一真相源 = 运行时真版本)。
 * ⚠️ 拿不到 (dev / preload 没注入) ⇒ 退化成 "—", 不显示 undefined。
 */
function appVersion(): string {
  return window.gacode?.appVersion || "—";
}

export function Settings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { logout } = useAuth();
  const { toast } = useToast();

  // 注销账号 — 从 web settings/page.tsx 迁移过来的同一套语义 (不是重写第二份)
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: () => deleteAccount(),
    onSuccess: () => {
      // 后端已删 ⇒ 清前端状态 + 踢回登录页
      queryClient.clear();
      void logout();
      toast({
        title: "账户已注销",
        description: "你的所有数据已永久删除",
        variant: "default",
      });
      setDeleteOpen(false);
      navigate("/login", { replace: true });
    },
    onError: (err) => {
      toast({
        title: "注销失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "danger",
      });
      // ⚠️ **保持弹窗打开** (跟 web 一致) —— 让用户决定重试还是取消。
      //    PC 的 ConfirmDialog 有 loading 态, 这里失败后要复位 loading。
      setDeleting(false);
    },
  });

  return (
    <div className="min-h-full px-4 lg:px-8 py-6">
      <div className="max-w-2xl mx-auto">
        {/* 隐私 */}
        <section className="mb-6">
          <h2 className="text-sm font-medium text-fg-muted mb-2 px-1">隐私</h2>
          <div className="space-y-2">
            <ProfileMenuItem
              icon={<LockIcon className="w-5 h-5" />}
              title="修改密码"
              onClick={() => navigate("/settings/change-password")}
            />
            <ProfileMenuItem
              icon={<TrashIcon className="w-5 h-5" />}
              title="注销账号"
              tone="danger"
              onClick={() => {
                setDeleteOpen(true);
              }}
            />
          </div>
        </section>

        {/* ★ [P4/P7 · 2026-11-12] 端侧执行那套**挪走了** ——
            gaga 拍板：放到**抽屉「浏览器」下面**，点进去是独立一页（/client-tools）。
            这里（设置页）只留 隐私 / 关于 两组。 */}

        {/* 关于 — 只显示版本号 (gaga: 不需要检查更新功能) */}
        <section>
          <h2 className="text-sm font-medium text-fg-muted mb-2 px-1">关于</h2>
          <div className="rounded-md bg-bg-elevated p-4 flex items-center justify-between">
            <span className="text-sm font-medium">版本号</span>
            <span className="text-sm text-fg-muted">gacode-electron v{appVersion()}</span>
          </div>
        </section>

        {deleteOpen ? (
          <ConfirmDialog
            title="确定要注销账号吗?"
            message="注销后,你的所有数据(账户、会话、知识库、设置)将被永久删除, 且无法恢复。此操作不可撤销, 请确认要继续。"
            confirmLabel={deleting ? "正在注销..." : "我确定, 注销"}
            cancelLabel="取消"
            confirmVariant="danger"
            loading={deleting}
            // 2026-10-26 — pending 形态对齐 web: web 的 AlertDialogAction 无 spinner,
            //   只出文字「正在注销...」⇒ PC 也走 text-only。
            loadingStyle="text-only"
            onCancel={() => {
              // pending 时不许关弹窗 (跟安卓一致: 请求已发出就不许点外部关)
              if (deleting) return;
              setDeleteOpen(false);
            }}
            onConfirm={() => {
              setDeleting(true);
              deleteMutation.mutate();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
