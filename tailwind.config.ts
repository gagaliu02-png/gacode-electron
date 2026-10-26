import type { Config } from "tailwindcss";

// =========================================================================
// GAGAOS Design Tokens — 一字不差同步 gacode-web tailwind.config.ts。
// Extracted from gacode Android (ui/theme/Color.kt) + Material 3 elevation / radius
// conventions (ui/theme/Theme.kt) + design-spec v1.0 § 9 Web 端 Tailwind 完整配置示例
// (2026-09-24 Mavis).
// Default = dark mode (matches Android YinianTheme default).
//
// Token groups:
//   brand        — BrandOrange / BrandRed / BrandYellow / BrandCyan / BrandGreen
//   bg           — background layers (base / sunken / elevated)  [保留原值, 颜色不动]
//   fg           — foreground text layers (high / muted / subtle)
//   border       — divider / outline
//   success / warning / danger — semantic colors (brand-aligned)
//
// 设计规范 (design-spec § 9) 同步项:
//   - fontSize: xs/sm/base/lg/xl/2xl 显式覆盖, 加 3xl/4xl
//   - borderRadius: sm=12 / md=16 / lg=20 / xl=22 (Cody squircle)
//   - transitionDuration: 150 / 250 / 300 (design-spec § 7.1)
//   - transitionTimingFunction: enter / exit / standard (§ 7.2)
//   - boxShadow: card / dialog / snackbar (§ 2.4 暗色卡片)
// =========================================================================

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx}",
    "./index.html",
  ],
  theme: {
    container: {
      center: true,
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        // --- gagaOS 品牌色 (from Color.kt:13-17) — 颜色不动 ---
        brand: {
          DEFAULT: "#FF6B35",      // BrandOrange — CTA / spinner / focus / 选中态
          hover: "#ff8559",         // ~10% lighter for hover
          active: "#e55828",        // ~10% darker for active
          on: "#000000",            // onPrimary (dark mode)
          container: "#4A1F0A",    // primaryContainer (dark mode)
          onContainer: "#FFD7B8",   // onPrimaryContainer (dark mode)
          red: "#c8102e",           // BrandRed — logo / destructive
          "red-dark": "#E54a5e",    // ErrorRedDark — softer red for dark mode
          yellow: "#ffc700",        // BrandYellow — warning 强调
          cyan: "#0dcaf0",          // BrandCyan — info
          green: "#198754",         // BrandGreen — success
        },

        // --- 暗色中性色阶 (from Color.kt:20-28) — 颜色不动 ---
        "bg-base": "#000000",       // GagaSurface0 — 根背景 (跟 PWA theme_color 一致)
        "bg-sunken": "#0a0a0a",     // GagaSurface1 — 卡片 / 容器底色
        "bg-elevated": "#181818",   // GagaSurface2 — 提升层 (popup / bottom sheet)

        "fg": "#e5e7eb",            // GagaTextHigh — 主文字
        "fg-muted": "#9ca3af",      // GagaTextMid — 次文字
        "fg-subtle": "#6c757d",     // GagaTextLow — 禁用 / 提示

        border: "#363b41",          // GagaDivider — 分隔线 / outline
        "border-strong": "#44464D", // outlineVariant (Theme.kt:36)

        // --- 语义色 ---
        success: "#198754",         // 跟 BrandGreen 一致 (Color.kt:17)
        "success-soft": "#0f3a26",  // successContainer (dark mode)
        warning: "#ffc700",         // 跟 BrandYellow 一致 (Color.kt:15)
        "warning-soft": "#3d2e00",  // warningContainer (dark mode, Theme.kt:52)
        danger: "#E54a5e",          // ErrorRedDark (Color.kt:48)
        "danger-soft": "#7A0019",   // errorContainer (Theme.kt:39)

        // --- web 私有 token 补齐 (2026-10-26 H-56①) ---
        // cron 定时任务专属紫 — web `src/styles/globals.css:81` `--color-cron: #a78bfa`.
        // web 的 LibraryPicker (`components/chat/LibraryPicker.tsx:57`) 给 link 类型
        // 图标用 `text-cron`; PC 之前没有该 token ⇒ 退化成 brand-green (绿), 色不对.
        // ⚠️ 只在 **LibraryPicker** 用; 知识库列表页 / LibraryDetail 仍用 brand-green
        //    (web `app/(main)/library/page.tsx:124` 就是绿的, 两处不可混用).
        cron: "#a78bfa",

        // --- shadcn semantic token compatibility ---
        // 这些是 Theme.kt:20-42 的 lightColorScheme / darkColorScheme 的等价 web 映射
        // 让现有 ui/button.tsx 等组件不用动也能继承 gagaOS 视觉
        background: "#000000",      // surface
        foreground: "#e5e7eb",      // onSurface
        "background-hover": "#0a0a0a", // surface1 略亮
        card: "#141414",            // surface1 (C1-03b — 跟 globals.css 的 --card 对齐;
                                   // 之前这里是字面量 #0a0a0a, globals.css 里的
                                   // --card: #141414 完全不生效)
        "card-hover": "#1e1e1e",    // surface1 hover 态 (C1-03b)
        "card-foreground": "#e5e7eb",
        popover: "#181818",         // surface2
        "popover-foreground": "#e5e7eb",
        primary: {
          DEFAULT: "#FF6B35",
          foreground: "#000000",
        },
        secondary: {
          DEFAULT: "#181818",       // 复用 surface2 当 secondary
          foreground: "#e5e7eb",
        },
        muted: {
          DEFAULT: "#181818",
          foreground: "#9ca3af",
        },
        "muted-foreground": "#9ca3af",
        accent: {
          DEFAULT: "#1f1f1f",       // 比 surface 略亮, 给 hover 用
          foreground: "#e5e7eb",
        },
        "accent-foreground": "#FFD7B8",
        destructive: {
          DEFAULT: "#E54a5e",
          foreground: "#FFFFFF",
        },
        input: "#363b41",
        ring: "#FF6B35",
      },
      fontFamily: {
        // Roboto 优先 (Android Type.kt — UI 主力字体), Roboto 缺失时回退 Inter
        sans: [
          "Inter",
          "Roboto",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Noto Sans SC",
          "PingFang SC",
          "sans-serif",
        ],
        // JetBrains Mono (Android Type.kt:23-25 — 代码块)
        mono: [
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      // ============================================================
      // borderRadius — design-spec § 2.1 / § 9 同步
      //   sm=12 (按钮/chip) · md=16 (标准卡/输入框) · lg=20 (Drawer/大卡)
      //   xl=22 (Cody squircle) · 2xl=24 · 3xl=28 · full=9999
      //   squircle 保留别名 (兼容现有 rounded-squircle 用法)
      // ============================================================
      borderRadius: {
        none: "0",
        sm: "12px",
        DEFAULT: "8px",
        md: "16px",
        lg: "20px",
        xl: "22px",        // Cody squircle (design-spec § 2.1)
        "2xl": "24px",
        squircle: "22px",  // 别名 → 同 xl, 兼容既有代码
        "3xl": "28px",
        full: "9999px",
      },
      // ============================================================
      // fontSize — design-spec § 2.3 / § 9 同步
      //   xs=12 · sm=14 (bodyMedium) · base=16 (titleMedium) · 2xl=28 (headlineMedium)
      //   设计稿 § 9 写 xs=11px, 但既有 text-label=11px 已命名 (commit 1),
      //   xs 保留 12px 跟 Android labelSmall=11 差 1px 可容忍, 不破坏全站
      //   命名 label/headline/title/body 保留 (commit 1 已用)
      // ============================================================
      fontSize: {
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["14px", { lineHeight: "20px" }],     // bodyMedium
        base: ["16px", { lineHeight: "24px" }],   // titleMedium
        lg: ["18px", { lineHeight: "28px" }],
        xl: ["20px", { lineHeight: "28px" }],
        "2xl": ["28px", { lineHeight: "36px" }],  // headlineMedium
        "3xl": ["30px", { lineHeight: "36px" }],
        "4xl": ["36px", { lineHeight: "40px" }],
        // commit 1 命名 (保留, 不冲突)
        headline: ["28px", { lineHeight: "36px", fontWeight: "500" }],
        title: ["16px", { lineHeight: "24px", fontWeight: "500" }],
        body: ["14px", { lineHeight: "20px", fontWeight: "400" }],
        label: ["11px", { lineHeight: "16px", fontWeight: "500" }],
      },
      // ============================================================
      // transitionDuration — design-spec § 7.1
      //   150ms 微交互 · 250ms 组件进出 · 300ms 页面切换
      // ============================================================
      transitionDuration: {
        "0": "0ms",
        "75": "75ms",
        "100": "100ms",
        "150": "150ms",
        "200": "200ms",
        "250": "250ms",
        "300": "300ms",
        "500": "500ms",
        "700": "700ms",
        "1000": "1000ms",
      },
      // ============================================================
      // transitionTimingFunction — design-spec § 7.2
      //   enter: decelerate · exit: accelerate · standard: 标准
      // ============================================================
      transitionTimingFunction: {
        "enter": "cubic-bezier(0.0, 0.0, 0.2, 1)",
        "exit": "cubic-bezier(0.4, 0.0, 1, 1)",
        "standard": "cubic-bezier(0.4, 0.0, 0.2, 1)",
        DEFAULT: "cubic-bezier(0.4, 0.0, 0.2, 1)",
        linear: "linear",
        in: "cubic-bezier(0.4, 0, 1, 1)",
        out: "cubic-bezier(0, 0, 0.2, 1)",
        "in-out": "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      // ============================================================
      // boxShadow — design-spec § 2.4 + Material 3 elevation 共存
      //   card (tonalElevation 1) / dialog / snackbar (新加)
      //   elevation-1..4 / brand-glow (commit 1 已用, 保留)
      // ============================================================
      boxShadow: {
        sm: "0 1px 2px 0 rgb(0 0 0 / 0.5)",
        DEFAULT: "0 1px 3px 0 rgb(0 0 0 / 0.5)",
        // 2026-10-26: `none` 挪到 DEFAULT **之后** ⇒ 产物里 `.shadow-none` 在
        //   `.shadow` 之后 ⇒ 同属性时 `shadow-none` 能盖住 `shadow`.
        //   (之前 `none` 排在最前 ⇒ `.shadow` 永远赢, 只能靠 `!shadow-none` 硬压.)
        none: "none",
        md: "0 4px 6px -1px rgb(0 0 0 / 0.5), 0 2px 4px -2px rgb(0 0 0 / 0.4)",
        lg: "0 10px 15px -3px rgb(0 0 0 / 0.5), 0 4px 6px -4px rgb(0 0 0 / 0.4)",
        xl: "0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.4)",
        "2xl": "0 25px 50px -12px rgb(0 0 0 / 0.5)",
        inner: "inset 0 2px 4px 0 rgb(0 0 0 / 0.5)",
        // design-spec § 2.4 / § 9 命名
        card: "0 1px 3px rgba(0, 0, 0, 0.5)",
        dialog: "0 8px 24px rgba(0, 0, 0, 0.6)",
        snackbar: "0 4px 12px rgba(0, 0, 0, 0.6)",
        // commit 1 命名 (Material 3 elevation)
        "elevation-0": "none",
        "elevation-1":
          "0 1px 2px 0 rgb(0 0 0 / 0.5), 0 1px 3px 0 rgb(0 0 0 / 0.4)",
        "elevation-2":
          "0 1px 3px 0 rgb(0 0 0 / 0.5), 0 4px 8px 0 rgb(0 0 0 / 0.4)",
        "elevation-3":
          "0 4px 6px 0 rgb(0 0 0 / 0.5), 0 8px 16px 0 rgb(0 0 0 / 0.4)",
        "elevation-4":
          "0 10px 15px 0 rgb(0 0 0 / 0.5), 0 16px 32px 0 rgb(0 0 0 / 0.4)",
        // 品牌强调阴影 (CTA 按钮 / spinner)
        "brand-glow": "0 0 0 1px #FF6B35, 0 0 20px rgb(255 107 53 / 0.35)",
      },
      keyframes: {
        // gagaOS-style minimal motion
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-in-from-right": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "slide-in-from-bottom": {
          from: { transform: "translateY(100%)" },
          to: { transform: "translateY(0)" },
        },
        "slide-in-from-top": {
          from: { transform: "translateY(-100%)" },
          to: { transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
        "slide-in-from-right": "slide-in-from-right 300ms ease-out",
        "slide-in-from-bottom": "slide-in-from-bottom 300ms ease-out",
        "slide-in-from-top": "slide-in-from-top 300ms ease-out",
      },
    },
  },
  plugins: [],
};
export default config;