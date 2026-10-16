import { contextBridge, ipcRenderer } from 'electron';
import * as os from 'os';
import * as path from 'path';
import type { GacodeBridge } from '../shared/types';

// 把 app.getVersion() 在 preload 阶段读出来,渲染层读不到 process
let cachedAppVersion = 'unknown';
try {
  const { app } = require('electron');
  cachedAppVersion = app.getVersion();
} catch (err) {
  console.warn(
    '[gacode-electron] preload: failed to read app.getVersion(), fallback to package.json',
    err,
  );
  try {
    // 兜底:读 package.json(路径: out/preload/index.js → ../../package.json)
    const pkg = require(path.join(__dirname, '..', '..', 'package.json'));
    cachedAppVersion = pkg.version || 'unknown';
  } catch (err2) {
    console.error('[gacode-electron] preload: package.json fallback failed', err2);
  }
}

// contextBridge:安全暴露给 window.gacode,渲染层只能读不能改
contextBridge.exposeInMainWorld('gacode', {
  appVersion: cachedAppVersion,
  platform: os.platform(),
  // PR2:原生通知桥 —— 渲染层 await window.gacode.notify(title, body)
  notify: (title: string, body: string): Promise<boolean> =>
    ipcRenderer.invoke('gacode:notify', { title, body }),
} satisfies GacodeBridge);

console.log('[gacode-electron] preload loaded');