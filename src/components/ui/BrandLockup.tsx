/**
 * components/ui/BrandLockup.tsx — 品牌标识 (cody 吉祥物 + "gacode" 文字)
 *
 * 对齐 gacode-web `src/app/(auth)/login/page.tsx:46-56`
 *      & `src/app/(auth)/qr-login/page.tsx:171-179` (同一段) —— **逐字照抄**,
 * 只改图片路径前缀:
 *      web: `${BASE_PATH}/assets/cody/cody_192.png`
 *      PC : `${import.meta.env.BASE_URL}assets/cody/cody_192.png`
 *
 * ⚠️ 为什么 PC 不能用根绝对路径 "/assets/...":
 *      PC 打包后 renderer 走 file:// ⇒ "/assets/..." 会解析到文件系统根 → 裂图。
 *      `import.meta.env.BASE_URL` 打包态 = "./"、dev = "/" ⇒ 相对路径。
 *      同仓先例: src/routes/Profile.tsx:156-162 (cody_192.png)
 *                src/components/layout/AppShell.tsx:339-346 (cody_48.png)
 *
 * ⚠️ 图标资源: `public/assets/cody/cody_192.png`（**PC 仓本地文件**, 与 web 那份
 *    SHA256 一致 ⇒ 不从 web 复制）。
 * ⚠️ `rounded-squircle` 在 PC tailwind.config.ts:156 已有 (squircle: "22px") ⇒
 *    className 逐字可用,不需要改 tailwind 配置。
 *
 * 之前 Login / QrLogin 两处各画了一个文字 "G" 方块当占位 ⇒ 现在统一走本组件。
 */

export function BrandLockup() {
  return (
    <div className="flex items-center gap-3 mb-10">
      <img
        src={`${import.meta.env.BASE_URL}assets/cody/cody_192.png`}
        alt="Gacode"
        width={80}
        height={80}
        className="rounded-squircle"
      />
      <span className="text-xl font-semibold tracking-wide">gacode</span>
    </div>
  );
}
