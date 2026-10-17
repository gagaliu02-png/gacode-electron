/// <reference types="vite/client" />

import type { GacodeBridge } from "@shared/types";

declare global {
  interface Window {
    /** Electron 渲染层暴露 — 由 electron/preload.ts 通过 contextBridge 注入。 */
    gacode?: GacodeBridge;
  }
}

export {};
