import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

/**
 * electron-vite 三段式配置。
 *
 * - main:    electron/main.ts        → dist/main/index.js (CommonJS, ES2022 target)
 * - preload: electron/preload.ts     → dist/preload/index.js
 * - renderer: index.html + src/main.tsx (React 入口) → dist/renderer/index.html
 *
 * 输出走 dist/(而非 electron-vite 默认 out/),原因:
 * - dist/ 已在 .gitignore 排除(PR 1 tsc 编译输出沿用此路径)
 * - 不需要改 .gitignore 加 out/
 *
 * 渲染层 root 设成项目根,这样 index.html(根目录) + src/(React 源码) 是
 * Vite 默认扫描路径。publicDir 默认 = 项目根 public/(放字体文件)。
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main.ts') },
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload.ts') },
      },
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'shared'),
      },
    },
  },
  renderer: {
    root: '.',
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: { index: resolve(__dirname, 'index.html') },
      },
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@renderer': resolve(__dirname, 'src'),
        '@shared': resolve(__dirname, 'shared'),
      },
    },
    plugins: [react()],
  },
});