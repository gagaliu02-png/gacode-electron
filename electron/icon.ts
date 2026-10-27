import { nativeImage, type NativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

/**
 * electron/icon.ts — 应用图标解析 + 缓存（单例）
 *
 * 为什么需要这个文件（gaga 2026-10-27 截图反馈）:
 *   1. Windows 任务栏 hover 预览卡片左上角的小方块 = **窗口自己**的 icon。
 *      之前 `new BrowserWindow({...})` 没传 `icon` ⇒ 窗口没有自己的图标 ⇒
 *      退化到 exe 自带图标 —— dev 模式跑的是 `electron.exe` ⇒ 显示 Electron 原子图标。
 *      （2026-10-27 实测 Win32 `WM_GETICON`：不传 icon 时返回 null；传了以后
 *        返回 64x64(ICON_BIG) / 32x32(ICON_SMALL) 的 cody 图标。）
 *   2. 系统托盘图标之前是 `nativeImage.createEmpty()` 空图 ⇒ 托盘槽空白。
 *
 * 图标资源（仓内 build/，已存在，**不重新生成、不从别处复制**）:
 *   - build/icon.ico     6 帧 (256/128/64/48/32/16) 的 cody 吉祥物 → 窗口 icon
 *   - build/icon-16.png  原生 16px cody → 托盘 icon（Windows 托盘槽就 16×16，
 *                        直接用 16px 原图避免重采样糊）
 *
 * 运行时路径（**两态都要能解析** —— 打包后仓内相对路径在包里不存在）:
 *   - dev 态:   __dirname = <repo>/dist/main ⇒ ../../build/icon.ico = <repo>/build/icon.ico
 *   - 打包态:   build/ 不在 electron-builder 的 `files:` 里 ⇒ 只能靠
 *               extraResources 复制到 <安装目录>/resources/ ⇒ process.resourcesPath
 *
 * 失败策略：**图标加载失败绝不能让 app 起不来** —— 找不到就返回空图 + 打告警日志，
 * 窗口 / 托盘退回原有行为（exe 自带图标 / 空托盘），不抛异常。
 */

export type IconKind = 'window' | 'tray';

/** 用途 → 仓内 build/ 目录下的文件名 */
const ICON_FILES: Record<IconKind, string> = {
  window: 'icon.ico',
  tray: 'icon-16.png',
};

const ICON_KINDS: IconKind[] = ['window', 'tray'];

interface IconEntry {
  /** 解析到的图片（失败时是空图） */
  image: NativeImage;
  /** 解析到的绝对路径（失败时 null） */
  path: string | null;
}

/** 单例缓存 —— icon.ico 有 361KB，不重复 load */
const cache = new Map<IconKind, IconEntry>();

/**
 * 候选路径（按优先级，从上到下第一个能用的胜出）:
 *   1. <resourcesPath>/icon.ico          打包态（extraResources → resources 根）
 *   2. <resourcesPath>/build/icon.ico     打包态备用（图标挪到 build/ 子目录时）
 *   3. <repo>/build/icon.ico              dev 态（__dirname = <repo>/dist/main）
 *   4. <cwd>/build/icon.ico               dev 态备用（cwd = 仓根）
 */
export function iconCandidates(kind: IconKind): string[] {
  const file = ICON_FILES[kind];
  return [
    path.join(process.resourcesPath, file),
    path.join(process.resourcesPath, 'build', file),
    path.join(__dirname, '..', '..', 'build', file),
    path.join(process.cwd(), 'build', file),
  ];
}

/** 解析 + 缓存：存在 → 能解码 → 非空 ⇒ 命中；否则继续下一个候选 */
function resolveIcon(kind: IconKind): IconEntry {
  const cached = cache.get(kind);
  if (cached) return cached;

  for (const candidate of iconCandidates(kind)) {
    let img: NativeImage;
    try {
      if (!fs.existsSync(candidate)) continue;
      img = nativeImage.createFromPath(candidate);
    } catch (err) {
      console.warn(
        `[gacode-electron] app icon load failed: ${candidate} (${err instanceof Error ? err.message : String(err)})`,
      );
      continue;
    }
    if (img.isEmpty()) {
      console.warn(`[gacode-electron] app icon EMPTY (rejected): ${candidate}`);
      continue;
    }
    const entry: IconEntry = { image: img, path: candidate };
    cache.set(kind, entry);
    return entry;
  }

  const fallback: IconEntry = { image: nativeImage.createEmpty(), path: null };
  cache.set(kind, fallback);
  return fallback;
}

/** 窗口 icon（icon.ico）—— 给 BrowserWindow 的 `icon` 选项 */
export function getAppIcon(): NativeImage {
  return resolveIcon('window').image;
}

/** 托盘 icon（icon-16.png）—— 给 Tray */
export function getTrayIcon(): NativeImage {
  return resolveIcon('tray').image;
}

/** 窗口 icon 解析到的绝对路径（失败 null） */
export function getAppIconPath(): string | null {
  return resolveIcon('window').path;
}

/** 托盘 icon 解析到的绝对路径（失败 null） */
export function getTrayIconPath(): string | null {
  return resolveIcon('tray').path;
}

/**
 * 启动时打一行图标状态日志 —— **PM 靠这行验证（不靠截图）**:
 *   [gacode-electron] app icon: <绝对路径> <宽>x<高> [window|tray]
 *   [gacode-electron] app icon NOT FOUND (candidates: ...) [window|tray]
 */
export function logIconStatus(): void {
  for (const kind of ICON_KINDS) {
    const { image, path: resolved } = resolveIcon(kind);
    if (!resolved) {
      console.warn(
        `[gacode-electron] app icon NOT FOUND (candidates: ${iconCandidates(kind).join(' | ')}) [${kind}]`,
      );
      continue;
    }
    const { width, height } = image.getSize();
    console.log(`[gacode-electron] app icon: ${resolved} ${width}x${height} [${kind}]`);
  }
}
