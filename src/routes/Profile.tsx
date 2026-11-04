/**
 * routes/Profile.tsx — 「我的」页 (批 G12 · 2026-11-04 · **对齐 web**)
 *
 * 数据: useQuery(["profile"], getProfile)
 * 端点: GET /gacode/profile — server 端 profile.routes.js, 返 ProfileData
 *   (id / username / displayName / gender / bio / avatar / email / createdAt).
 *
 * ★ [批 G12 · 2026-11-04] 本页**整页重写**, 逐条对齐 web
 *   (gacode-web/src/app/(main)/profile/page.tsx, 2026-10-27 对齐安卓 ProfileTab):
 *   - 顶部: 只剩右对齐「编辑」按钮 (🔔 铃铛入口**删掉** —— web 2026-10-27
 *     按 gaga 要求删的, PC 这边是滞后副本。通知入口在**侧栏顶卡**的铃铛上)
 *   - 中央: 72px 头像 (rounded-xl) + displayName + email
 *     (@username 删掉 —— web 没有)
 *   - 只读卡 (space-y-2): 名字 / UID(可复制) / 性别 / 简介
 *     (PC 原有的「邮箱」「注册时间」两行删掉 —— 邮箱挪到名字下面, 注册时间 web 没有)
 *   - 菜单卡 (安卓同款 DeliveryCenterMenuItem): 交付中心 + IM 配对码
 *   - 页脚: "gacode-electron · v{版本号}" (版本号走 window.gacode.appVersion)
 *
 * ★ PC 独有、本批**删掉**的 (web 全都没有):
 *   - 头像右下角相机按钮 (头像上传走「编辑资料」页, web 同款)
 *   - 5 个 ActionRow (编辑资料 / 修改密码 / 头像设置 / 交付中心 / 设置)
 *   - 「登出」大按钮 (侧栏底部已有, web Drawer 底部也有)
 *   - 「注销账户」按钮 (**迁到「设置」页** —— web 2026-10-27 就是这么迁的)
 *
 * ⚠️ 头像缺省图 = Cody 占位图 (web 同款, cody_192.png)。
 *   PC 打包后 renderer 走 file:// ⇒ 不能用根绝对路径 "/assets/..." (会解析到
 *   文件系统根 → 裂图), 必须用 import.meta.env.BASE_URL 拼相对路径
 *   (打包态 "./", dev "/") —— 同仓 AppShell.tsx 的 cody_48.png 已是这个写法。
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getProfile, listDeliverables, type ProfileData } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useToast } from "../components/ui/Toast";
import { Button } from "../components/ui/Button";
import { ProfileMenuItem } from "../components/profile/ProfileMenuItem";
import {
  CheckGlyph,
  ChevronRightIcon,
  CopyIcon,
  MessageSquareIcon,
  PackageOpenIcon,
} from "../components/ui/Glyphs";
import { recordDeletedDeliverables } from "../lib/deliverable-deleted-store";

const GENDER_LABEL: Record<string, string> = {
  male: "男",
  female: "女",
  unspecified: "保密",
  other: "其他",
};

export function Profile() {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: getProfile,
  });

  // profile 可能比 useAuth().user 更全 (displayName / avatar / bio / gender),
  // 优先 profile. 没拿到 profile 时回退 authUser (登录瞬态).
  const user: ProfileData | null = profile || (authUser as ProfileData | null);

  // 交付中心计数 —— 复用已有的 listDeliverables (不新写 api 函数)。
  //   pageSize=1 只取 1 条, 但后端照样返回 total (全量计数)。
  //   ⚠️ 必须有降级: 拿不到就显示「—」, 不能让整页崩 (跟 web 同款)。
  const { data: deliverablesData, isError: deliverablesFailed } = useQuery({
    queryKey: ["deliverables", { count: true }],
    queryFn: async () => {
      const res = await listDeliverables({ page: 1, pageSize: 1 });
      // a4 契约 v1 · 拉模式兜底 —— 列表接口的 `removedIds` ⇒ 同一个删除集。
      //   (web: applyRemovedIdsFallback; PC 端等价物 = recordDeletedDeliverables)
      const userId = authUser?.id ?? null;
      if (userId && res.removedIds && res.removedIds.length > 0) {
        recordDeletedDeliverables(userId, res.removedIds);
      }
      return res;
    },
    retry: false,
    staleTime: 60 * 1000,
  });
  const deliverableTotal =
    !deliverablesFailed && typeof deliverablesData?.total === "number"
      ? deliverablesData.total
      : null;

  const displayName = user?.displayName || user?.username || "User";
  const genderText = user?.gender ? GENDER_LABEL[user.gender] || "保密" : "保密";
  const bioText = user?.bio?.trim() ? user.bio : "未设置";
  const avatarSrc =
    user?.avatar || `${import.meta.env.BASE_URL}assets/cody/cody_192.png`;
  const uid = user?.id || "—";

  return (
    <div className="min-h-full px-4 lg:px-8 py-6">
      <div className="max-w-2xl mx-auto">
        {/* 顶部操作区 — 只有右对齐的「编辑」按钮 (web 同款) */}
        <div className="flex items-center justify-end mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/profile/edit")}
            aria-label="编辑资料"
          >
            编辑
          </Button>
        </div>

        {/* 中央: 头像 + 用户名 + email */}
        <div className="flex flex-col items-center mb-8">
          {isLoading ? (
            <div className="w-[72px] h-[72px] rounded-xl bg-bg-elevated animate-pulse" />
          ) : (
            <img
              src={avatarSrc}
              alt={displayName}
              width={72}
              height={72}
              className="w-[72px] h-[72px] rounded-xl object-cover"
            />
          )}
          <h1 className="text-2xl font-medium mt-3 text-center">{displayName}</h1>
          {user?.email ? (
            <p className="text-xs text-fg-muted mt-1 opacity-70">{user.email}</p>
          ) : null}
        </div>

        {/* 卡片列表 — 只读 (名字 / UID / 性别 / 简介) */}
        <div className="space-y-2">
          <ProfileRow label="名字" value={displayName} />
          <ProfileRow
            label="UID"
            value={uid}
            rightSlot={<CopyUidButton uid={user?.id || ""} />}
          />
          <ProfileRow label="性别" value={genderText} />
          <ProfileRow label="简介" value={bioText} />
        </div>

        {/* 菜单卡 — 安卓 ProfileTab 同款 (交付中心 + IM 配对码) */}
        <div className="mt-4 space-y-2">
          <ProfileMenuItem
            icon={<PackageOpenIcon className="w-5 h-5" />}
            title="交付中心"
            subtitle={deliverableTotal === null ? "—" : `${deliverableTotal} 项交付物`}
            onClick={() => navigate("/deliveries")}
          />
          <ProfileMenuItem
            icon={<MessageSquareIcon className="w-5 h-5" />}
            title="IM 配对码"
            subtitle="去微信/元宝绑定本账号"
            onClick={() => navigate("/profile/im-binding")}
          />
        </div>

        {/* 页脚版本号 — 版本走 preload bridge (单一真相源 = 运行时真版本) */}
        <div className="mt-8 text-center text-xs text-fg-muted opacity-50">
          gacode-electron · v{window.gacode?.appVersion || "—"}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// ProfileRow — web 的信息行 (label 主色 / value 次色 + 单行省略)
// ────────────────────────────────────────────────────────────

interface ProfileRowProps {
  label: string;
  value: string;
  onClick?: () => void;
  rightSlot?: React.ReactNode;
}

function ProfileRow({ label, value, onClick, rightSlot }: ProfileRowProps) {
  const interactive = typeof onClick === "function";
  const Wrapper: React.ElementType = interactive ? "button" : "div";
  return (
    <Wrapper
      type={interactive ? "button" : undefined}
      onClick={onClick}
      className={[
        "w-full rounded-md bg-bg-elevated p-4 flex justify-between items-center",
        "transition-colors duration-150",
        interactive ? "hover:bg-bg-base text-left" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <span className="text-sm font-medium shrink-0">{label}</span>
      <span className="flex items-center gap-2 min-w-0">
        <span className="text-sm text-fg-muted truncate max-w-[200px]">{value}</span>
        {rightSlot ??
          (interactive ? (
            <ChevronRightIcon strokeWidth={1.6} className="text-fg-muted shrink-0" />
          ) : null)}
      </span>
    </Wrapper>
  );
}

// ────────────────────────────────────────────────────────────
// CopyUidButton — UID 一键复制 (web 同款: 复制成功变绿勾 + toast)
// ────────────────────────────────────────────────────────────

function CopyUidButton({ uid }: { uid: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // 1.5 秒后自动恢复 copy 图标 (跟 web 行为一致)
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  const handleCopy = async () => {
    if (!uid) {
      toast({ title: "UID 不可用", variant: "warning" });
      return;
    }
    try {
      await navigator.clipboard.writeText(uid);
      setCopied(true);
      toast({ title: "UID 已复制", variant: "default" });
    } catch {
      // 极少数环境 clipboard API 不可用 (非 HTTPS / 浏览器策略限制) ——
      // 跟 web 一致: 提示一句, 不向用户暴露技术错误.
      toast({ title: "复制失败", variant: "danger" });
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="复制 UID"
      className="shrink-0 w-7 h-7 rounded-full text-fg-muted hover:bg-bg-sunken hover:text-fg transition-colors duration-150 inline-flex items-center justify-center"
    >
      {copied ? (
        <CheckGlyph size={14} strokeWidth={2} className="text-success" />
      ) : (
        <CopyIcon size={14} strokeWidth={1.6} />
      )}
    </button>
  );
}
