/**
 * GAGAOS Design Tokens — TypeScript mirror, extracted from gacode-web (originally
 * sourced from gacode Android ui/theme/Color.kt + Type.kt + Theme.kt). 一字不差同步 gacode-web。
 *
 * Mirror of `tailwind.config.ts` extend.colors + `globals.css` :root variables,
 * sourced from gacode Android (ui/theme/Color.kt + Type.kt + Theme.kt).
 *
 * 给组件代码用, 比如:
 *   - Avatar gradient bg:    `style={{ background: BrandColors.bgBase }}`
 *   - 进度条用:                 `style={{ width: '${pct}%', background: BrandColors.brand }}`
 *   - 内联 SVG 用:              `fill={BrandColors.brand}`
 *
 * 凡是能用 Tailwind class (`bg-bg-base`, `text-fg`, `border-border-strong`) 表达的,
 * 都不要走这里 — Tailwind class 享受 build-time tree-shaking 跟 dark/light 切换.
 * 这里只给 inline style / canvas / SVG 用.
 */

// =========================================================================
// BrandColors — from Color.kt:13-17 / 47-48
// =========================================================================
export const BrandColors = {
  // BrandOrange (Color.kt:13) — CTA / spinner / focus / 选中态
  brand: "#FF6B35",
  brandHover: "#ff8559",
  brandActive: "#e55828",
  brandOn: "#000000",          // onPrimary (Theme.kt:22)
  brandContainer: "#4A1F0A",   // primaryContainer (Theme.kt:23)
  brandOnContainer: "#FFD7B8", // onPrimaryContainer (Theme.kt:24)

  // BrandRed (Color.kt:14) — destructive / logo
  brandRed: "#c8102e",
  // ErrorRedDark (Color.kt:48) — softer red for dark mode
  brandRedDark: "#E54a5e",

  // BrandYellow (Color.kt:15) — warning 强调
  brandYellow: "#ffc700",
  // BrandCyan (Color.kt:16) — info
  brandCyan: "#0dcaf0",
  // BrandGreen (Color.kt:17) — success
  brandGreen: "#198754",
} as const;

// =========================================================================
// SurfaceColors — from Color.kt:20-28
// =========================================================================
export const SurfaceColors = {
  // GagaSurface0 (Color.kt:21) — 根背景 (跟 PWA theme_color 一致)
  bgBase: "#000000",
  // GagaSurface1 (Color.kt:22) — 卡片 / 容器底色
  bgSunken: "#0a0a0a",
  // GagaSurface2 (Color.kt:23) — 提升层 (popup / bottom sheet)
  bgElevated: "#181818",

  // hover overlay — Color.kt:28 (rgba(255,255,255,.03))
  hoverOverlay: "rgba(255, 255, 255, 0.03)",
} as const;

// =========================================================================
// TextColors — from Color.kt:25-27
// =========================================================================
export const TextColors = {
  // GagaTextHigh — 主文字
  fg: "#e5e7eb",
  // GagaTextMid — 次文字
  fgMuted: "#9ca3af",
  // GagaTextLow — 禁用 / 提示
  fgSubtle: "#6c757d",
} as const;

// =========================================================================
// BorderColors — from Color.kt:24 + Theme.kt:36
// =========================================================================
export const BorderColors = {
  // GagaDivider — 分隔线 / outline
  border: "#363b41",
  // outlineVariant (Theme.kt:36)
  borderStrong: "#44464D",
} as const;

// =========================================================================
// SemanticColors — semantic mappings (跟 Material 3 dark colorScheme 对齐)
// =========================================================================
export const SemanticColors = {
  success: BrandColors.brandGreen,    // BrandGreen (Color.kt:17)
  successSoft: "#0f3a26",
  warning: BrandColors.brandYellow,   // BrandYellow (Color.kt:15)
  warningSoft: "#3d2e00",            // Theme.kt:52
  danger: BrandColors.brandRedDark,   // ErrorRedDark (Color.kt:48)
  dangerSoft: "#7A0019",              // Theme.kt:39 errorContainer
} as const;

// =========================================================================
// Typography — from Type.kt:33-98 (Material 3 Typography scale)
// sp → px 1:1 在常见视距成立; 给代码里 inline fontSize 用.
// =========================================================================
export const FontSizes = {
  displayLarge: 57,
  displayMedium: 45,
  headlineLarge: 32,
  headlineMedium: 28,
  titleLarge: 22,
  titleMedium: 16,
  bodyLarge: 16,
  bodyMedium: 14,
  labelLarge: 14,
  labelMedium: 12,
} as const;

export const FontFamilies = {
  // AppFontFamily (Type.kt:28) — Inter Variable Font
  sans: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans SC", "PingFang SC", sans-serif',
  // AppMonoFontFamily (Type.kt:31) — JetBrains Mono
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
} as const;

// =========================================================================
// Radius — Material 3 shape scale (跟 Tailwind rounded-sm/md/lg 对应)
// =========================================================================
export const Radii = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

// =========================================================================
// Elevation shadows — Material 3 elevation tokens (暗黑背景专用, 略带高斯)
// =========================================================================
export const Shadows = {
  elevation0: "none",
  elevation1:
    "0 1px 2px 0 rgb(0 0 0 / 0.5), 0 1px 3px 0 rgb(0 0 0 / 0.4)",
  elevation2:
    "0 1px 3px 0 rgb(0 0 0 / 0.5), 0 4px 8px 0 rgb(0 0 0 / 0.4)",
  elevation3:
    "0 4px 6px 0 rgb(0 0 0 / 0.5), 0 8px 16px 0 rgb(0 0 0 / 0.4)",
  elevation4:
    "0 10px 15px 0 rgb(0 0 0 / 0.5), 0 16px 32px 0 rgb(0 0 0 / 0.4)",
  brandGlow: "0 0 0 1px #FF6B35, 0 0 20px rgb(255 107 53 / 0.35)",
} as const;

// =========================================================================
// Convenience: 一把梭 — UI 组件可以直接 import { tokens as T }
// =========================================================================
export const tokens = {
  brand: BrandColors,
  surface: SurfaceColors,
  text: TextColors,
  border: BorderColors,
  semantic: SemanticColors,
  radii: Radii,
  shadows: Shadows,
  fonts: FontFamilies,
  fontSizes: FontSizes,
} as const;

export type Tokens = typeof tokens;