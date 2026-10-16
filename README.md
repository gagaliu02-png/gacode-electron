# gacode-electron

Gacode PC 版 - 基于 Electron + React 的 Windows 桌面客户端(独立产品线)。

> ⚠️ **环境要求**:`pnpm ≥ 12.4`(workspace `allowBuilds: {electron,esbuild}` 需要 pnpm 12+
> 的脚本钩子授权)。Node.js 20 LTS(electron 32 自带,无需本机装)。

## 仓库定位

- **应用 ID**:com.gaga.gacode
- **应用名**:Gacode(Windows Toast / 卸载项 / 任务栏均显示此名)
- **主目标平台**:Windows 10/11
- **架构**:Electron 主进程 + **本地 React 渲染层**(electron-vite 编译产物,完全自包含,不再套壳 web)

## 阶段 0 · 独立 PC 应用起步(2026-10-17)

**转型说明**:之前 PR 1-3 阶段,gacode-electron 是 **套壳 gacode-web** 的桌面壳,主进程用
`loadURL('https://www.gaga.sale/gacode/')` 直接加载远端 URL。gaga 已决定后续 gacode-electron
和 gacode-web 走独立产品线,不再共享代码。

**阶段 0 目标**:
- 引入 React 18 + Vite 5 + electron-vite 基建
- 把套壳 URL 改成加载本地 React 渲染产物(`dist/renderer/index.html`)
- 设计 tokens 自写(不 import gacode-web,值一字不差同步)
- 保留 PR 1-3 基建(electron-builder 打包 / 托盘 / 菜单 / 通知桥 / preload)

**当前阶段产物**:
- ✅ `pnpm dev` 启动,Vite dev server + Electron + 本地 React 渲染全跑通
- ✅ `pnpm build` 出 `dist/{main,preload,renderer}/`,Electron 加载本地 index.html
- ✅ 设计 tokens 全套(颜色 / 字体 / 圆角 / 阴影 / 过渡)落地,首页跑通
- ✅ PR 2 基建(托盘 / 菜单 / 通知桥 / preload)保留
- ✅ 字体(Inter / JetBrains Mono)从 yinian-android 只读复制

**后续阶段**(不在本次范围):
- 阶段 1+:认证、Chat、其他页面、实体化(独立代码,完全自写,不照搬)

## 开发

### 安装依赖

```bash
pnpm install
```

> pnpm 12.4 会校验 `pnpm-workspace.yaml` 的 `allowBuilds` 字段,本仓库已配
> `electron: true` + `esbuild: true`。否则会报 `ERR_PNPM_IGNORED_BUILDS`。

### 启动(开发模式)

```bash
pnpm dev
```

electron-vite 起 vite dev server(端口 5173)+ 编译 main / preload / renderer 三段,Electron
窗口自动加载 dev server。改源码热更新即时生效。

dev 模式默认开 DevTools,可用 Ctrl+Shift+I 唤出。

### 仅加载生产构建(本地 React)

```bash
pnpm build       # electron-vite 编译 main + preload + renderer → dist/
pnpm exec electron .   # 启动 Electron 加载 dist/renderer/index.html
```

(或 `pnpm start` 跑 electron-vite preview,启动 vite preview server + Electron)

## 项目结构

```
gacode-electron/
├── electron/
│   ├── main.ts          # 主进程入口,创建 BrowserWindow + 加载本地 React
│   ├── preload.ts       # 安全桥,contextBridge 暴露 window.gacode
│   ├── tray.ts          # 系统托盘(PR2)
│   ├── menu.ts          # 应用菜单(PR2)
│   └── notifications.ts # 原生通知桥(PR2)
├── shared/
│   └── types.ts         # 跨主进程/渲染层类型契约
├── src/                 # 阶段 0 新增 — React 渲染层源码
│   ├── main.tsx         # React 入口(createRoot + StrictMode + App)
│   ├── App.tsx          # BrowserRouter + QueryClientProvider + 路由表
│   ├── env.d.ts
│   ├── routes/
│   │   └── Home.tsx     # 阶段 0 临时首页(看 tokens 跑通)
│   └── styles/
│       ├── tokens.ts    # 设计 tokens(自写,同步 gacode-web)
│       └── globals.css  # CSS 变量 + @tailwind 三件套
├── public/              # 阶段 0 新增 — Vite 静态资源
│   └── fonts/           # Inter + JetBrains Mono(.ttf,从 yinian-android 复制)
├── build/
│   ├── icon-source.png  # 192x192 源 icon(从 gacode-web 复用)
│   ├── icon-256.png     # 256x256 重采样中间产物
│   └── icon.ico         # 多尺寸 .ico(16/32/48/64/128/256)
├── dist/                # electron-vite 编译产物(gitignored)
├── release/             # electron-builder 产物(不入 commit)
├── electron-builder.yml # 打包配置
├── electron.vite.config.ts  # 阶段 0 新增 — 三段式 Vite 配置
├── tailwind.config.ts   # 阶段 0 新增 — 设计 tokens Tailwind 镜像
├── postcss.config.js    # 阶段 0 新增
├── index.html           # 阶段 0 新增 — Vite 入口
├── tsconfig.json        # 阶段 0 改 — references 多 config
├── tsconfig.node.json   # 阶段 0 新增 — main + preload(ESM,noEmit)
├── tsconfig.web.json    # 阶段 0 新增 — renderer(ESM + JSX,noEmit)
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── .gitignore
└── README.md
```

### 关键决策(阶段 0)

- **输出路径用 `dist/` 而不是 electron-vite 默认的 `out/`**:`dist/` 已在
  `.gitignore`,不需要新加 `out/` 排除项。`package.json` `main` 字段指向 `dist/main/index.js`,
  `main.ts` 里 preload 路径 `path.join(__dirname, '../preload/index.js')`。
- **渲染层 root = 项目根**:index.html 在仓库根,`src/main.tsx` 是 React 入口,
  `public/` 是 Vite 静态资源目录。`electron.vite.config.ts` 里 `renderer.root = '.'`。
- **dev 模式用 ELECTRON_RENDERER_URL**(electron-vite 自动注入),prod 模式用
  `loadFile(path.join(__dirname, '../renderer/index.html'))`。
- **design tokens 自写不 import**:值跟 gacode-web 三份 source 一字不差同步。
  顶部注释标注来源(2026-10-17 verified)。字体二进制从 yinian-android
  只读复制 `.ttf`(选项 A,免引入转换工具),通过 `@font-face` 加载。

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
pnpm dist:portable    # 仅 portable
```

> 注:阶段 0 把 `dist` script 简化成 `electron-vite build && electron-builder --win --x64`,
> 跟原来的 `pnpm build && electron-builder --win --x64` 等价。

**网络提示**:首次运行 electron-builder 会下载 `app-builder-bin`(72MB,内含 NSIS + 7zip)
和 `electron-builder-binaries`(NSIS、winCodeSign、nsis-resources)。如果 GitHub 直连超时,设镜像:

```powershell
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
pnpm dist
```

### 产物(`release/`)

| 文件 | 大小 | 说明 |
|---|---|---|
| `Gacode-Setup-{version}.exe` | ~80 MB | NSIS 安装包(双击装,可选盘位,比 PR 3 多 ~2MB 是 React 运行时 + Tailwind CSS) |
| `Gacode-{version}-portable.exe` | ~80 MB | 便携版(免装双击即跑) |
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
| PR 3 | electron-builder 打包(Win NSIS / portable)+ icon + 应用 ID 锁 |
| 阶段 0(本次) | electron-vite + React 18 + Vite 5 + 设计 tokens 落地 + main.ts 切本地渲染 |
| 阶段 1+ | 认证 / Chat / 其他页面 / 实体化(独立代码,不照搬 gacode-web) |

## 边界

- ✅ 只动本仓库
- ❌ 不动 gacode-web / yinian-android / unified-api / gaclaw / gawen
- ✅ 从 yinian-android **只读**复制 `inter_variable.ttf` + `jetbrains_mono_regular.ttf` 字体二进制
- ✅ 从 gacode-web **只读**参考三份设计文件(`tokens.ts` / `globals.css` / `tailwind.config.ts`),
  **值自写**不 import
- ❌ 不写 PWA manifest / service worker(PWA 方向已被否决)