# gacode-electron

Gacode PC 版 - 基于 Electron 的 Windows 桌面客户端。

> ⚠️ **环境要求**:`pnpm ≥ 12`(workspace `onlyBuiltDependencies: [electron]` 需要 pnpm 9+ 的脚本钩子授权,
> PR2 起主进程模块化,Node 解析路径依赖 `package.json` `exports` 字段,要求 pnpm 12+)。
> Node.js 20 LTS(electron 32 自带,无需本机装)。

包内是 **Web 版套壳**:渲染层加载 https://www.gaga.sale/gacode/(生产)或 http://localhost:3000/gacode/(开发)。服务端代码、API、数据库全部在远端 gacode-web,本仓库只负责桌面壳。

## 仓库定位

- **应用 ID**:com.gaga.gacode
- **应用名**:Gacode(Windows Toast / 卸载项 / 任务栏均显示此名)
- **主目标平台**:Windows 10/11
- **架构**:Electron 主进程 + BrowserWindow 加载远程 Next.js URL

## 开发

### 安装依赖

```bash
pnpm install
```

### 启动(开发模式)

需要先在 `D:\gaga\gaclaw-project\gacode-web\` 起 Next.js dev server:

```bash
# 终端 1
cd D:\gaga\gaclaw-project\gacode-web
pnpm dev   # 启动在 http://localhost:3000

# 终端 2
cd D:\gaga\gaclaw-project\gacode-electron
pnpm dev   # 编译 TS + 启动 Electron,自动加载 http://localhost:3000/gacode/
```

dev 模式默认开 DevTools,可用 Ctrl+Shift+I 唤出。

### 仅加载生产 URL(不依赖本地 dev server)

```bash
pnpm build
pnpm start
```

这会以生产模式启动,直接加载 https://www.gaga.sale/gacode/。

## 项目结构

```
gacode-electron/
├── electron/
│   ├── main.ts        # 主进程入口,创建 BrowserWindow + 加载 URL
│   ├── preload.ts     # 安全桥,contextBridge 暴露 window.gacode
│   ├── tray.ts        # 系统托盘(PR2)
│   ├── menu.ts        # 应用菜单(PR2)
│   └── notifications.ts # 原生通知桥(PR2)
├── shared/
│   └── types.ts       # 跨主进程/渲染层类型
├── build/
│   ├── icon-source.png  # 192x192 源 icon(从 gacode-web 复用)
│   ├── icon-256.png     # 256x256 重采样中间产物
│   └── icon.ico         # 多尺寸 .ico(16/32/48/64/128/256)
├── dist/                # tsc 编译产物
├── release/             # electron-builder 产物(不入 commit)
├── electron-builder.yml # 打包配置
├── package.json
├── tsconfig.json
└── README.md
```

## 构建与分发

### 一次性 icon 生成

`build/icon.ico` 已提交。如果重新生成:

```bash
# 1. 复制源 icon(192x192 PNG,带透明)
cp ../gacode-web/public/icons/icon-192.png build/icon-source.png

# 2. 安装 png-to-ico
pnpm add -D png-to-ico

# 3. 跑一次性脚本
node scripts/build-icon.mjs
```

输出 `build/icon-256.png` + `build/icon.ico`(多尺寸 16/32/48/64/128/256)。

### 打包 Windows 安装包

```bash
# 完整 build + 双 target(NSIS installer + portable)
pnpm dist

# 单独跑某个 target
pnpm dist:nsis        # 仅 NSIS
pnpm dist:portable     # 仅 portable
```

**网络提示**:首次运行 electron-builder 会下载 `app-builder-bin`(72MB,内含 NSIS + 7zip)和 `electron-builder-binaries`(NSIS、winCodeSign、nsis-resources)。如果 GitHub 直连超时,设镜像:

```powershell
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
pnpm dist
```

### 产物(`release/`)

| 文件 | 大小 | 说明 |
|---|---|---|
| `Gacode-Setup-{version}.exe` | ~78 MB | NSIS 安装包(双击装,可选盘位) |
| `Gacode-{version}-portable.exe` | ~78 MB | 便携版(免装双击即跑) |
| `*.blockmap` / `latest.yml` |  | auto-update 配套文件,可忽略 |

### 安装与启动

**NSIS 装机版**:
1. 双击 `Gacode-Setup-0.1.0.exe`
2. 选盘位(默认 `%LOCALAPPDATA%\Programs\Gacode\`)
3. 自动建开始菜单 + 桌面快捷方式
4. 从开始菜单启动 `Gacode`

**Portable 绿色版**:
1. 复制 `Gacode-0.1.0-portable.exe` 到任意目录(U 盘也行)
3. 双击启动(免装,无 UAC)

### SHA256 校验

```powershell
Get-FileHash release\Gacode-Setup-0.1.0.exe -Algorithm SHA256
Get-FileHash release\Gacode-0.1.0-portable.exe -Algorithm SHA256
```

**当前 commit 产物 hash 见仓库 `release/` 的实际文件计算**。

### 7za wrapper 说明

本仓库的 `node_modules\.pnpm\7zip-bin@\d+\node_modules\7zip-bin\win\x64\7za.exe` 已被替换为本仓库 `scripts\7za-wrapper.exe`(C# 编译)。原因:Windows 主机若未开 Developer Mode,7za 无法创建 macOS `.dylib` 符号链接(winCodeSign.7z 里 2 个 darwin 符号链接),wrapper 检测到目标目录含 `rcedit-x64.exe` 时把 exit 2 当成 0 返回。重新装依赖会丢,届时重新编译 `scripts/7za-wrapper.cs` 即可(详见 commit message)。

## 阶段计划

| 阶段 | 内容 |
|---|---|
| PR 1 | 骨架 + 主窗口 + 加载 URL,装出来能开窗看到 web |
| PR 2 | 系统托盘 + 应用菜单 + 原生通知桥 |
| PR 3(当前) | electron-builder 打包(Win NSIS / portable)+ icon + 应用 ID 锁 |
| PR 4(可选) | 文件系统访问 + 开机自启 + 单实例锁 |

## 边界

- ✅ 只动本仓库
- ❌ 不动 gacode-web / yinian-android / unified-api / gaclaw / gawen
- ❌ 不写 PWA manifest / service worker(PWA 方向已被否决)