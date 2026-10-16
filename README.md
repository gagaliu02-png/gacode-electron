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
│   └── preload.ts     # 安全桥,contextBridge 暴露 window.gacode
├── shared/
│   └── types.ts       # 跨主进程/渲染层类型(PR2/PR3 扩展)
├── dist/              # tsc 编译产物
├── package.json
├── tsconfig.json
└── README.md
```

## 阶段计划

| 阶段 | 内容 |
|---|---|
| PR 1(当前) | 骨架 + 主窗口 + 加载 URL,装出来能开窗看到 web |
| PR 2 | 系统托盘 + 应用菜单 + 原生通知桥 |
| PR 3 | electron-builder 打包(Win NSIS / portable)+ icon + 应用 ID 锁 |
| PR 4(可选) | 文件系统访问 + 开机自启 + 单实例锁 |

## 边界

- ✅ 只动本仓库
- ❌ 不动 gacode-web / yinian-android / unified-api / gaclaw / gawen
- ❌ 不写 PWA manifest / service worker(PWA 方向已被否决)