import { contextBridge } from 'electron';
import * as os from 'os';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

// 把 app.getVersion() 在 preload 阶段读出来,渲染层读不到 process
let cachedAppVersion = 'unknown';
try {
  // CommonJS 下 require electron app
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app } = require('electron');
  cachedAppVersion = app.getVersion();
} catch (err) {
  console.warn('[gacode-electron] preload: failed to read app.getVersion(), fallback to package.json', err);
  try {
    // 兜底:读 package.json(路径: dist/electron/preload.js → ../../package.json)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require(path.join(__dirname, '..', '..', 'package.json'));
    cachedAppVersion = pkg.version || 'unknown';
  } catch (err2) {
    console.error('[gacode-electron] preload: package.json fallback failed', err2);
  }
}

export interface GacodeBridge {
  appVersion: string;
  platform: NodeJS.Platform;
}

// contextBridge:安全暴露给 window.gacode,渲染层只能读不能改
contextBridge.exposeInMainWorld('gacode', {
  appVersion: cachedAppVersion,
  platform: os.platform(),
} satisfies GacodeBridge);

console.log('[gacode-electron] preload loaded');